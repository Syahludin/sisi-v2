/**
 * Migrasi data ROW lama -> v2 (PRD 11. Migrasi Data Lama ke v2). Keputusan final 3 Okt 2026:
 *  - Periode seluruh 2026 (MIG_DARI default 2026-01-01, MIG_SAMPAI default hari ini).
 *  - Jenis diklasifikasi ulang dari diameter (aturan v2); 1-24 cm / kosong = karantina.
 *  - WA dibuat ulang mesin v2 (di tahap C); header belum lengkap = WA kosong (dicatat WA_AKAN_KOSONG).
 *  - Foto disalin bertahap + verifikasi sha256 (tahap B, antrean mig_Foto).
 *  - Header ganda digabung jadi satu; header lain tidak ditulis.
 *  - Induk hilang (3 Okt 2026): eksekusi -> realisasi -> header dicari lewat tim + tanggal (+ penyulang), tidak ada = dibuat
 *    (INDUK_DIBUAT). Induk yang ada di sumber tapi karantina tidak diganti: anaknya INDUK_TIDAK_LOLOS.
 *
 * Nama penyulang/section dicocokkan setelah dirapikan (normNama_), lalu lewat sheet mig_Alias (jenis, penyulang,
 * nilai_lama, nilai_master) yang diisi admin. Yang tetap tidak cocok = karantina + SARAN nama terdekat (tidak dipakai otomatis).
 *
 * File ini baru berisi TAHAP CEK (dry-run): hanya MEMBACA sumber lama + master, lalu menulis laporan
 * ke sheet mig_Cek dan mig_Ringkas di SiSi_ROW. row_* tidak pernah disentuh. Sumber tidak pernah ditulis.
 * analisisMigrasi_ murni (tanpa layanan Apps Script) supaya bisa dites di Node.
 */
var MIG_SHEET_ = { header: 'db_Global_Header', realisasi: 'db_ROW_Realisasi', eksekusi: 'db_ROW_Eksekusi' };
var MIG_KOLOM_WAJIB_ = {
  header: ['Kode Header', 'ULP', 'Tanggal', 'Tim', 'Sub-Tim', 'Koordinat Awal', 'Koordinat Akhir', 'KM Awal', 'KM Akhir',
           'Kendala', 'TimeStamp', 'Input By'],
  realisasi: ['Kode Header', 'Kode Pekerjaan', 'Tanggal', 'Tim', 'Penyulang', 'Rabas', 'Sedang', 'Besar', 'Timestamp'],
  eksekusi: ['Kode Header', 'Kode Pekerjaan', 'Kode Eksekusi', 'Tanggal', 'Tim', 'Penyulang', 'Section', 'Nomor Tiang',
             'Koordinat Tiang', 'Koordinat Pekerjaan', 'Foto Sebelum URL', 'Foto Pekerjaan URL', 'Foto Sesudah URL',
             'Diameter', 'Jenis Pekerjaan', 'Input Oleh', 'Timestamp']
};
var MIG_SLOT_ = { SEBELUM: 'Foto Sebelum URL', PEKERJAAN: 'Foto Pekerjaan URL', SESUDAH: 'Foto Sesudah URL' };

function adalahDate_(v) { return Object.prototype.toString.call(v) === '[object Date]'; }

function teksMig_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

/** Tanggal lama (Date dari Sheets, 'yyyy-MM-dd', 'dd/MM/yyyy', 'd/M/yyyy') -> 'yyyy-MM-dd' atau ''. */
function tglLama_(v) {
  if (adalahDate_(v)) return isNaN(v.getTime()) ? '' : tglJakarta_(v);
  var s = teksMig_(v);
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/.exec(s);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}

/** Waktu lama untuk mengurutkan saja (ms). Tidak terbaca = 0. */
function waktuLama_(v) {
  if (adalahDate_(v)) return isNaN(v.getTime()) ? 0 : v.getTime();
  var s = teksMig_(v);
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], (+m[4] || 0) - 7, +m[5] || 0, +m[6] || 0);
  var d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/** Angka lama ('12', '12,5', 12) -> Number; kosong / bukan angka = null. */
function angkaLama_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var s = teksMig_(v).replace(',', '.');
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Drive file id dari URL foto lama. null = tidak terbaca. */
function driveIdDariUrl_(url) {
  var s = teksMig_(url);
  if (!s) return null;
  var pola = [/\/file\/d\/([A-Za-z0-9_-]{20,})/, /[?&]id=([A-Za-z0-9_-]{20,})/, /googleusercontent\.com\/d\/([A-Za-z0-9_-]{20,})/,
              /\/d\/([A-Za-z0-9_-]{20,})/];
  for (var i = 0; i < pola.length; i++) {
    var m = pola[i].exec(s);
    if (m) return m[1];
  }
  return null;
}

/**
 * Path file foto AppSheet dari URL lama (https://www.appsheet.com/image/getimageurl?...&fileName=<path>&...)
 * atau isi kolom path langsung ("AppSheet SiSi - ULP Toboali/Eksekusi ROW/2026/.../x.Foto Pekerjaan.025850.jpg").
 * Path relatif terhadap folder Drive MIG_FOTO_AKAR_ID (dicari per nama folder di tahap B). null = bukan path foto.
 */
function pathFotoLama_(v) {
  var s = teksMig_(v);
  if (!s) return null;
  var m = /[?&]fileName=([^&#]+)/i.exec(s);
  var p;
  if (m) {
    try { p = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return null; }
  } else if (/^https?:/i.test(s)) {
    return null;
  } else {
    p = s;
  }
  p = p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/').trim();
  return /\.(jpe?g|png|heic|webp)$/i.test(p) && p.indexOf('..') === -1 ? p : null;
}

/** UUID deterministik dari kunci lama: dijalankan ulang = ID sama (idempoten). */
function uuidMig_(jenis, kunci) {
  var h = sha256Hex_('sisi-mig|' + jenis + '|' + kunci);
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-5' + h.slice(13, 16) + '-' + '89ab'.charAt(parseInt(h.charAt(16), 16) % 4) +
         h.slice(17, 20) + '-' + h.slice(20, 32);
}

/** Nama penyulang/section dirapikan sebelum dicocokkan: huruf kecil, spasi ganda, spasi di sekitar - dan /, awalan "Penyulang". */
function normNama_(v) {
  return teksMig_(v).toLowerCase().replace(/\s+/g, ' ').replace(/\s*-\s*/g, ' - ').replace(/\s*\/\s*/g, '/')
    .replace(/^(penyulang|peny\.?)\s+/, '').trim();
}

/** Jarak edit (Levenshtein), untuk SARAN nama master terdekat. Tidak pernah dipakai otomatis. */
function jarakEdit_(a, b) {
  var m = a.length, n = b.length, d = [];
  for (var i = 0; i <= m; i++) { d[i] = [i]; }
  for (var j = 0; j <= n; j++) { d[0][j] = j; }
  for (i = 1; i <= m; i++) {
    for (j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
    }
  }
  return d[m][n];
}

function saranNama_(nilai, daftar) {
  var n = normNama_(nilai), terbaik = null, jarak = 1e9;
  daftar.forEach(function (x) {
    var k = jarakEdit_(n, normNama_(x));
    if (k < jarak) { jarak = k; terbaik = x; }
  });
  return terbaik !== null && jarak <= Math.max(3, Math.floor(n.length / 4)) ? terbaik : null;
}

function koordinatMig_(v) {
  var s = teksMig_(v);
  if (!s) return { ada: false };
  try { return { ada: true, ok: true, nilai: parseKoordinat_('koordinat', s, AREA_BABEL_) }; } catch (e) { return { ada: true, ok: false }; }
}

/** mig_Koreksi (diisi admin): jenis HEADER | REALISASI | EKSEKUSI, kode_lama, kolom (nama kolom sumber lama), nilai_baru. */
var MIG_KODE_KOLOM_ = { header: 'Kode Header', realisasi: 'Kode Pekerjaan', eksekusi: 'Kode Eksekusi' };

/** Terapkan mig_Koreksi ke SALINAN baris sumber (sumber asli tidak diubah). Catatan DIKOREKSI di mig_Cek. */
function terapkanKoreksiMig_(S, daftar, catat) {
  var hasil = { header: S.header || [], realisasi: S.realisasi || [], eksekusi: S.eksekusi || [], kolom: S.kolom };
  if (!daftar || !daftar.length) return hasil;
  var per = {};
  daftar.forEach(function (k) {
    var j = teksMig_(k.jenis).toLowerCase(), kode = teksMig_(k.kode_lama), kolom = teksMig_(k.kolom);
    if (!MIG_KODE_KOLOM_[j] || !kode || !kolom) { catat('koreksi', kode, 'CATATAN', 'KOREKSI_DIABAIKAN (jenis/kode/kolom kosong atau salah)'); return; }
    var boleh = MIG_KOLOM_WAJIB_[j].concat(['Kode WO', 'Input Oleh']);
    if (boleh.indexOf(kolom) === -1) { catat('koreksi', kode, 'CATATAN', 'KOREKSI_KOLOM_TIDAK_DIKENAL (' + kolom + ')'); return; }
    (per[j + '|' + kode] = per[j + '|' + kode] || []).push({ kolom: kolom, nilai: k.nilai_baru });
  });
  var dipakai = {};
  Object.keys(MIG_KODE_KOLOM_).forEach(function (j) {
    hasil[j] = hasil[j].map(function (r) {
      var kode = teksMig_(r[MIG_KODE_KOLOM_[j]]);
      var x = per[j + '|' + kode];
      if (!x) return r;
      var salin = {};
      Object.keys(r).forEach(function (k) { salin[k] = r[k]; });
      x.forEach(function (y) { salin[y.kolom] = y.nilai; });
      dipakai[j + '|' + kode] = true;
      catat(j, kode, 'CATATAN', 'DIKOREKSI (' + x.map(function (y) { return y.kolom; }).join(', ') + ')');
      return salin;
    });
  });
  Object.keys(per).forEach(function (k) {
    if (!dipakai[k]) catat('koreksi', k.split('|')[1], 'CATATAN', 'KOREKSI_TIDAK_TERPAKAI (kode tidak ada di sumber)');
  });
  return hasil;
}

/**
 * Inti dry-run. S = { header: [], realisasi: [], eksekusi: [], kolom: { header: [nama kolom], ... } } (baris = objek per header).
 * M = { tim: [{ tim_id, jenis, kode, nama }], jaringan: { section_id: { penyulang, section } }, jenis: [...] }.
 * opsi = { dari, sampai, kodeUlp }.
 */
function analisisMigrasi_(S, M, opsi) {
  var catatan = [];
  var catat = function (jenis, kodeLama, status, alasan, kodeBaru, bulan) {
    catatan.push({ jenis: jenis, kodeLama: kodeLama, kodeBaru: kodeBaru || '', status: status, alasan: alasan || '', bulan: bulan || '' });
  };
  S = terapkanKoreksiMig_(S, M.koreksi, catat);
  var hitung = { header: {}, realisasi: {}, eksekusi: {} };
  var tambah = function (j, k) { hitung[j][k] = (hitung[j][k] || 0) + 1; };
  var kolomKurang = {};
  Object.keys(MIG_KOLOM_WAJIB_).forEach(function (j) {
    var ada = (S.kolom && S.kolom[j]) || [];
    var kurang = MIG_KOLOM_WAJIB_[j].filter(function (k) { return ada.indexOf(k) === -1; });
    if (kurang.length) kolomKurang[j] = kurang;
  });
  var dalam = function (t) { return t >= opsi.dari && t <= opsi.sampai; };
  var bulanDari = function (t) { return t.slice(0, 7); };
  var perBulan = {};
  var bulanTim = function (t, timKode) {
    var k = bulanDari(t) + '|ROW ' + timKode;
    if (!perBulan[k]) perBulan[k] = { header: 0, realisasi: 0, eksekusi: 0, lama: { rabas: 0, sedang: 0, besar: 0 },
                                     baru: { rabas: 0, sedang: 0, besar: 0 }, baruFotoLengkap: { rabas: 0, sedang: 0, besar: 0 } };
    return perBulan[k];
  };
  var timRow = {};
  (M.tim || []).forEach(function (t) { if (String(t.jenis).toUpperCase() === 'ROW') timRow[pad2_(teksMig_(t.kode))] = t; });
  var penyulangAda = {}, sectionDari = {}, sectionPerPenyulang = {};
  Object.keys(M.jaringan || {}).forEach(function (id) {
    var j = M.jaringan[id];
    var p = normNama_(j.penyulang);
    penyulangAda[p] = j.penyulang;
    sectionDari[p + '|' + normNama_(j.section)] = id;
    (sectionPerPenyulang[p] = sectionPerPenyulang[p] || []).push(j.section);
  });
  // mig_Alias (diisi admin): nilai lama -> nilai master. Section alias berlaku per penyulang (penyulang kosong = semua).
  var aliasPeny = {}, aliasSec = {};
  (M.alias || []).forEach(function (a) {
    var jenis = teksMig_(a.jenis).toUpperCase();
    if (jenis === 'PENYULANG') aliasPeny[normNama_(a.nilai_lama)] = teksMig_(a.nilai_master);
    if (jenis === 'SECTION') aliasSec[normNama_(a.penyulang) + '|' + normNama_(a.nilai_lama)] = teksMig_(a.nilai_master);
  });
  var cariPenyulang = function (v) {
    var k = normNama_(v);
    if (penyulangAda[k]) return penyulangAda[k];
    var al = aliasPeny[k];
    return al && penyulangAda[normNama_(al)] ? penyulangAda[normNama_(al)] : null;
  };
  var cariSection = function (peny, v) {
    var p = normNama_(peny), k = normNama_(v);
    if (sectionDari[p + '|' + k]) return sectionDari[p + '|' + k];
    var al = aliasSec[p + '|' + k] || aliasSec['|' + k];
    return al ? sectionDari[p + '|' + normNama_(al)] || null : null;
  };
  var semuaPenyulang = Object.keys(penyulangAda).map(function (k) { return penyulangAda[k]; });
  var timKodeDari = function (v) { var m = /(\d{1,2})\s*$/.exec(teksMig_(v)); return m ? pad2_(m[1]) : ''; };

  // ---------- header ----------
  var jumlahRealPerHeader = {};
  (S.realisasi || []).forEach(function (r) {
    var k = teksMig_(r['Kode Header']);
    jumlahRealPerHeader[k] = (jumlahRealPerHeader[k] || 0) + 1;
  });
  var grupHeader = {}, kodeSudah = {};
  (S.header || []).forEach(function (h) {
    var kodeLama = teksMig_(h['Kode Header']);
    tambah('header', 'sumber');
    if (teksMig_(h.Tim).toUpperCase() !== 'ROW') { tambah('header', 'bukanRow'); return; }
    var tgl = tglLama_(h.Tanggal);
    if (!tgl) { tambah('header', 'karantina'); catat('header', kodeLama, 'KARANTINA', 'TANGGAL_TIDAK_VALID'); return; }
    if (!dalam(tgl)) { tambah('header', 'luarPeriode'); return; }
    if (kodeLama && kodeSudah[kodeLama]) { tambah('header', 'duplikatSumber'); catat('header', kodeLama, 'DIGABUNG', 'DUPLIKAT_SUMBER', '', bulanDari(tgl)); return; }
    if (kodeLama) kodeSudah[kodeLama] = true;
    var timKode = timKodeDari(h['Sub-Tim']);
    var tim = timRow[timKode];
    if (!tim) { tambah('header', 'karantina'); catat('header', kodeLama, 'KARANTINA', 'TIM_TIDAK_ADA (' + teksMig_(h['Sub-Tim']) + ')', '', bulanDari(tgl)); return; }
    var p = parseKodeHeaderRow_(kodeLama);
    var valid = !!p && p.kodeUlp === opsi.kodeUlp && p.subTim === timKode && p.urut >= 1;
    if (valid && p.tanggal !== tgl) { tambah('header', 'karantina'); catat('header', kodeLama, 'KARANTINA', 'TANGGAL_BEDA_KODE', '', bulanDari(tgl)); return; }
    var k = timKode + '|' + tgl;
    (grupHeader[k] = grupHeader[k] || []).push({ kodeLama: kodeLama, tgl: tgl, timKode: timKode, tim: tim, valid: valid,
      ts: waktuLama_(h.TimeStamp), nReal: jumlahRealPerHeader[kodeLama] || 0, h: h });
  });
  var petaHeader = {};   // kode header lama -> grup v2
  var headerV2 = [];
  Object.keys(grupHeader).forEach(function (k) {
    var anggota = grupHeader[k].sort(function (a, b) { return (b.nReal - a.nReal) || (a.ts - b.ts); });
    var utama = anggota[0];
    var kodeBaru = utama.valid ? utama.kodeLama : kodeHeaderRow_(utama.timKode, opsi.kodeUlp, utama.tgl, 1);
    var g = { id: uuidMig_('header', utama.kodeLama || k), kode: kodeBaru, tgl: utama.tgl, timKode: utama.timKode,
              tim: utama.tim, realisasi: {}, penyulangUrut: [], kodeAnakDipakai: {} };
    var ambil = function (kol) {
      for (var i = 0; i < anggota.length; i++) { if (teksMig_(anggota[i].h[kol])) return anggota[i].h[kol]; }
      return '';
    };
    var kAwal = koordinatMig_(ambil('Koordinat Awal')), kAkhir = koordinatMig_(ambil('Koordinat Akhir'));
    var kmAwal = angkaLama_(ambil('KM Awal')), kmAkhir = angkaLama_(ambil('KM Akhir'));
    if ((kAwal.ada && !kAwal.ok) || (kAkhir.ada && !kAkhir.ok)) catat('header', utama.kodeLama, 'CATATAN', 'KOORDINAT_TIDAK_VALID', kodeBaru, bulanDari(utama.tgl));
    g.lengkap = !!(kAwal.ok && kAkhir.ok && kmAwal !== null && kmAkhir !== null);
    g.kAwal = kAwal.ok ? kAwal.nilai.teks : ''; g.kAkhir = kAkhir.ok ? kAkhir.nilai.teks : '';
    g.kmAwal = kmAwal; g.kmAkhir = kmAkhir; g.kendala = teksMig_(ambil('Kendala'));
    g.ts = utama.ts; g.inputBy = teksMig_(ambil('Input By'));
    g.waLama = anggota.map(function (a) { return teksMig_(a.h['WA Text']); }).filter(function (t) { return t; }).join('\n---\n');
    g.anggota = anggota.map(function (a) { return a.kodeLama; });
    if (!g.lengkap) { tambah('header', 'waAkanKosong'); catat('header', utama.kodeLama, 'CATATAN', 'WA_AKAN_KOSONG (koordinat/KM belum lengkap)', kodeBaru, bulanDari(utama.tgl)); }
    if (kodeBaru !== utama.kodeLama) { tambah('header', 'kodeBaru'); catat('header', utama.kodeLama, 'OK', 'KODE_DIBUAT_ULANG', kodeBaru, bulanDari(utama.tgl)); }
    anggota.forEach(function (a, i) {
      petaHeader[a.kodeLama] = g;
      if (i > 0) { tambah('header', 'digabung'); catat('header', a.kodeLama, 'DIGABUNG', 'HEADER_GANDA', kodeBaru, bulanDari(a.tgl)); }
    });
    tambah('header', 'lolos');
    bulanTim(g.tgl, g.timKode).header++;
    headerV2.push(g);
  });

  // ---------- perbaikan induk (3 Okt 2026) ----------
  // Anak yang induknya hilang di sumber: cari induk lewat tim + tanggal (+ penyulang), kalau tetap tidak ada induk
  // DIBUAT di v2 (status INDUK_DIBUAT di mig_Cek). Sumber tidak diubah. Induk yang ADA di sumber tapi karantina
  // tidak diganti induk buatan: anaknya ikut karantina (INDUK_TIDAK_LOLOS) sampai induknya dibereskan.
  var grupV2 = {};
  headerV2.forEach(function (g) { grupV2[g.timKode + '|' + g.tgl] = g; });
  var kodeHeaderSumber = {}, kodeRealSumber = {};
  (S.header || []).forEach(function (h) { var k = teksMig_(h['Kode Header']); if (k) kodeHeaderSumber[k] = true; });
  (S.realisasi || []).forEach(function (r) { var k = teksMig_(r['Kode Pekerjaan']); if (k) kodeRealSumber[k] = true; });
  var dariKode = function () {
    for (var i = 0; i < arguments.length; i++) {
      var m = /^(R\d{2}-\d{11}\d{3})/.exec(teksMig_(arguments[i]));
      var p = m ? parseKodeHeaderRow_(m[1]) : null;
      if (p && p.kodeUlp === opsi.kodeUlp) return p;
    }
    return null;
  };
  var cariAtauBuatHeader = function (timKode, tgl, asal) {
    if (!tgl || !timKode) return { alasan: 'INDUK_TIDAK_ADA (tim/tanggal tidak terbaca)' };
    if (!dalam(tgl)) return { luar: true };
    var k = timKode + '|' + tgl;
    if (grupV2[k]) return { g: grupV2[k], cara: 'INDUK_DARI_TIM_TANGGAL' };
    var tim = timRow[timKode];
    if (!tim) return { alasan: 'TIM_TIDAK_ADA (ROW ' + timKode + ')' };
    var kode = kodeHeaderRow_(timKode, opsi.kodeUlp, tgl, 1);
    var g = { id: uuidMig_('header', 'induk|' + k), kode: kode, tgl: tgl, timKode: timKode, tim: tim, realisasi: {},
              penyulangUrut: [], kodeAnakDipakai: {}, lengkap: false, dibuat: true,
              kAwal: '', kAkhir: '', kmAwal: null, kmAkhir: null, kendala: '', ts: 0, inputBy: '', waLama: '', anggota: [] };
    grupV2[k] = g; headerV2.push(g);
    tambah('header', 'dibuat'); tambah('header', 'waAkanKosong');
    catat('header', '', 'INDUK_DIBUAT', 'HEADER_DIBUAT dari ' + asal + ' (koordinat/KM kosong, WA akan kosong)', kode, bulanDari(tgl));
    bulanTim(tgl, timKode).header++;
    return { g: g, cara: 'HEADER_DIBUAT' };
  };

  // ---------- realisasi ----------
  var petaReal = {}, realSudah = {};
  (S.realisasi || []).forEach(function (r) {
    var kodeLama = teksMig_(r['Kode Pekerjaan']);
    var tgl = tglLama_(r.Tanggal);
    tambah('realisasi', 'sumber');
    var khLama = teksMig_(r['Kode Header']);
    var g = petaHeader[khLama];
    if (!g) {
      if (tgl && !dalam(tgl)) { tambah('realisasi', 'luarPeriode'); return; }
      if (khLama && kodeHeaderSumber[khLama]) {
        tambah('realisasi', 'karantina'); catat('realisasi', kodeLama, 'KARANTINA', 'INDUK_TIDAK_LOLOS (' + khLama + ')', '', tgl ? bulanDari(tgl) : ''); return;
      }
      var pk = dariKode(khLama, kodeLama);
      var cr = cariAtauBuatHeader(timKodeDari(r.Tim) || (pk ? pk.subTim : ''), tgl || (pk ? pk.tanggal : ''), 'realisasi ' + (kodeLama || '(tanpa kode)'));
      if (cr.luar) { tambah('realisasi', 'luarPeriode'); return; }
      if (!cr.g) { tambah('realisasi', 'karantina'); catat('realisasi', kodeLama, 'KARANTINA', cr.alasan, '', tgl ? bulanDari(tgl) : ''); return; }
      g = cr.g;
      tambah('realisasi', 'indukDiperbaiki'); catat('realisasi', kodeLama, 'CATATAN', cr.cara, g.kode, bulanDari(g.tgl));
    }
    if (kodeLama && realSudah[kodeLama]) { tambah('realisasi', 'duplikatSumber'); catat('realisasi', kodeLama, 'DIGABUNG', 'DUPLIKAT_SUMBER', '', bulanDari(g.tgl)); return; }
    if (kodeLama) realSudah[kodeLama] = true;
    var namaPeny = cariPenyulang(r.Penyulang);
    if (!namaPeny) {
      var sp = saranNama_(r.Penyulang, semuaPenyulang);
      tambah('realisasi', 'karantina');
      catat('realisasi', kodeLama, 'KARANTINA', 'PENYULANG_TIDAK_ADA (' + teksMig_(r.Penyulang) + ')' + (sp ? ' saran: ' + sp : ''), '', bulanDari(g.tgl));
      return;
    }
    var pKunci = normNama_(namaPeny);
    var b = bulanTim(g.tgl, g.timKode);
    b.lama.rabas += angkaLama_(r.Rabas) || 0; b.lama.sedang += angkaLama_(r.Sedang) || 0; b.lama.besar += angkaLama_(r.Besar) || 0;
    var ada = g.realisasi[pKunci];
    if (ada) {
      tambah('realisasi', 'digabung'); catat('realisasi', kodeLama, 'DIGABUNG', 'PENYULANG_GANDA', '(ikut ' + (ada.kodeLama || '-') + ')', bulanDari(g.tgl));
      petaReal[kodeLama] = ada; return;
    }
    var x = { id: uuidMig_('realisasi', kodeLama || g.kode + '|' + pKunci), kodeLama: kodeLama, penyulang: namaPeny,
              g: g, ts: waktuLama_(r.Timestamp), eksekusi: [], kodeEksDipakai: {}, inputOleh: teksMig_(r['Input Oleh']) };
    g.realisasi[pKunci] = x; g.penyulangUrut.push(x);
    petaReal[kodeLama] = x;
    tambah('realisasi', 'lolos');
    b.realisasi++;
  });
  // nomor PNY: pertahankan yang sudah benar, sisanya dinomori lanjut
  var nomori = function (daftar, kodeInduk, jenis, ambilKode, pasang) {
    var dipakai = {}, maks = 0;
    daftar.forEach(function (x) {
      var p = parseKodeAnak_(ambilKode(x), jenis);
      if (p && p.induk === kodeInduk && !dipakai[p.urut]) { dipakai[p.urut] = true; maks = Math.max(maks, p.urut); pasang(x, ambilKode(x)); }
    });
    daftar.forEach(function (x) {
      if (x.kode) return;
      maks++; pasang(x, kodeAnak_(kodeInduk, jenis, maks));
    });
  };

  // ---------- eksekusi ----------
  var terbaru = {}, tanpaKode = [];
  (S.eksekusi || []).forEach(function (e) {
    tambah('eksekusi', 'sumber');
    var k = teksMig_(e['Kode Eksekusi']);
    if (!k) { tanpaKode.push(e); return; }
    if (terbaru[k]) {
      tambah('eksekusi', 'duplikatSumber'); catat('eksekusi', k, 'DIGABUNG', 'DUPLIKAT_SUMBER', '', '');
      if (waktuLama_(e.Timestamp) > waktuLama_(terbaru[k].Timestamp)) terbaru[k] = e;
      return;
    }
    terbaru[k] = e;
  });
  var foto = { slot: 0, siapSalin: 0, kosong: 0, urlRusak: 0, dariPath: 0 };
  var semuaReal = [];
  headerV2.forEach(function (g) { semuaReal = semuaReal.concat(g.penyulangUrut); });
  Object.keys(terbaru).map(function (k) { return terbaru[k]; }).concat(tanpaKode).forEach(function (e) {
    var kodeLama = teksMig_(e['Kode Eksekusi']);
    var tgl = tglLama_(e.Tanggal);
    var kpLama = teksMig_(e['Kode Pekerjaan']);
    var x = petaReal[kpLama];
    if (!x) {
      if (tgl && !dalam(tgl)) { tambah('eksekusi', 'luarPeriode'); return; }
      var tolak = function (alasan, t) { tambah('eksekusi', 'karantina'); catat('eksekusi', kodeLama, 'KARANTINA', alasan, '', t ? bulanDari(t) : ''); };
      if (kpLama && kodeRealSumber[kpLama]) return tolak('INDUK_TIDAK_LOLOS (' + kpLama + ')', tgl);
      var pe = dariKode(e['Kode Header'], kpLama, kodeLama);
      var timKode = timKodeDari(e.Tim) || (pe ? pe.subTim : ''), tglE = tgl || (pe ? pe.tanggal : '');
      var namaP = cariPenyulang(e.Penyulang), pk = normNama_(namaP || e.Penyulang);
      var kandidat = semuaReal.filter(function (r) { return r.g.timKode === timKode && r.g.tgl === tglE && normNama_(r.penyulang) === pk; });
      if (kandidat.length > 1) return tolak('INDUK_AMBIGU', tglE);
      if (kandidat.length === 1) {
        x = kandidat[0];
        tambah('eksekusi', 'indukDiperbaiki'); catat('eksekusi', kodeLama, 'CATATAN', 'INDUK_DARI_TIM_PENYULANG_TANGGAL', '', bulanDari(x.g.tgl));
      } else {
        // realisasi belum ada sama sekali: dibuat dari eksekusi ini (header dicari tim + tanggal, kalau tidak ada dibuat juga)
        if (!namaP) {
          var spe = saranNama_(e.Penyulang, semuaPenyulang);
          return tolak('INDUK_TIDAK_ADA, PENYULANG_TIDAK_ADA (' + teksMig_(e.Penyulang) + ')' + (spe ? ' saran: ' + spe : ''), tglE);
        }
        var ce = cariAtauBuatHeader(timKode, tglE, 'eksekusi ' + (kodeLama || '(tanpa kode)'));
        if (ce.luar) { tambah('eksekusi', 'luarPeriode'); return; }
        if (!ce.g) return tolak(ce.alasan, tglE);
        var kunciP = normNama_(namaP);
        x = ce.g.realisasi[kunciP];
        if (!x) {
          x = { id: uuidMig_('realisasi', 'induk|' + ce.g.kode + '|' + kunciP), kodeLama: '', penyulang: namaP, g: ce.g,
                ts: waktuLama_(e.Timestamp), eksekusi: [], kodeEksDipakai: {}, dibuat: true, asal: kodeLama || '(tanpa kode)',
                inputOleh: teksMig_(e['Input Oleh']) };
          ce.g.realisasi[kunciP] = x; ce.g.penyulangUrut.push(x); semuaReal.push(x);
          tambah('realisasi', 'dibuat');
          bulanTim(ce.g.tgl, ce.g.timKode).realisasi++;
        }
        tambah('eksekusi', 'indukDiperbaiki');
        catat('eksekusi', kodeLama, 'CATATAN', ce.cara === 'HEADER_DIBUAT' ? 'INDUK_DIBUAT (realisasi + header)' : 'INDUK_DIBUAT (realisasi)', '', bulanDari(ce.g.tgl));
      }
    }
    var bln = bulanDari(x.g.tgl);
    var karantina = function (alasan) { tambah('eksekusi', 'karantina'); catat('eksekusi', kodeLama, 'KARANTINA', alasan, '', bln); };
    var secId = cariSection(x.penyulang, e.Section);
    if (!secId) {
      var ss = saranNama_(e.Section, sectionPerPenyulang[normNama_(x.penyulang)] || []);
      return karantina('SECTION_TIDAK_ADA (' + x.penyulang + ' / ' + teksMig_(e.Section) + ')' + (ss ? ' saran: ' + ss : ''));
    }
    var kKerja = koordinatMig_(e['Koordinat Pekerjaan']), kTiang = koordinatMig_(e['Koordinat Tiang']);
    if (!(kKerja.ada && kKerja.ok)) {
      if (kTiang.ada && kTiang.ok) catat('eksekusi', kodeLama, 'CATATAN', 'KOORDINAT_PEKERJAAN_DARI_TIANG', '', bln);
      else return karantina('KOORDINAT_WAJIB');
    }
    var d = angkaLama_(e.Diameter);
    if (d === null) return karantina('DIAMETER_KOSONG');
    if (!Number.isInteger(d)) { catat('eksekusi', kodeLama, 'CATATAN', 'DIAMETER_DIBULATKAN (' + d + ')', '', bln); d = Math.round(d); }
    var jenis;
    try { jenis = klasifikasiJenis_(d, M.jenis || []); } catch (err) { return karantina((err.kode || 'DIAMETER_TIDAK_VALID') + ' (' + d + ' cm)'); }
    var kolBaru = kolomHitungJenis_(jenis), kolLama = kolomHitungJenis_({ nama: teksMig_(e['Jenis Pekerjaan']) });
    if (kolLama !== kolBaru) { tambah('eksekusi', 'jenisBerubah'); catat('eksekusi', kodeLama, 'CATATAN', 'JENIS_BERUBAH (' + (kolLama || '?') + ' -> ' + kolBaru + ')', '', bln); }
    var nId = 0, fotoId = {};
    Object.keys(MIG_SLOT_).forEach(function (s) {
      foto.slot++;
      var kolPath = MIG_SLOT_[s].replace(/ URL$/, '');
      var url = teksMig_(e[MIG_SLOT_[s]]) || teksMig_(e[kolPath]);   // URL kosong: pakai kolom path AppSheet
      if (!url) { foto.kosong++; return; }
      var did = driveIdDariUrl_(url);
      var path = did ? null : (pathFotoLama_(url) || pathFotoLama_(e[kolPath]));
      if (!did && !path) { foto.urlRusak++; catat('foto', kodeLama, 'CATATAN', 'URL_TIDAK_TERBACA (' + s + ': ' + url.slice(0, 60) + ')', '', bln); return; }
      if (path) foto.dariPath++;
      foto.siapSalin++; nId++; fotoId[s] = did ? { id: did } : { path: path };
    });
    if (kTiang.ada && !kTiang.ok) catat('eksekusi', kodeLama, 'CATATAN', 'KOORDINAT_TIANG_TIDAK_VALID (dikosongkan)', '', bln);
    var kodeWo = teksMig_(e['Kode WO']);
    if (kodeWo) tambah('eksekusi', 'asalWo');
    var tsE = waktuLama_(e.Timestamp);
    x.eksekusi.push({
      kodeLama: kodeLama, ts: tsE,
      id: uuidMig_('eksekusi', kodeLama || ('tanpa|' + x.id + '|' + tsE + '|' + teksMig_(e['Nomor Tiang']) + '|' + teksMig_(e['Koordinat Pekerjaan']))),
      secId: secId, secNama: (M.jaringan[secId] && M.jaringan[secId].section) || teksMig_(e.Section),
      nomorTiang: teksMig_(e['Nomor Tiang']), kTiang: kTiang.ok ? kTiang.nilai : null,
      kKerja: kKerja.ada && kKerja.ok ? kKerja.nilai : kTiang.nilai, d: d, jenis: jenis, fotoId: fotoId,
      inputOleh: teksMig_(e['Input Oleh']), kodeWo: kodeWo
    });
    tambah('eksekusi', 'lolos');
    var b = bulanTim(x.g.tgl, x.g.timKode);
    var kunci = kolBaru === 'Rabas' ? 'rabas' : kolBaru === 'Sedang' ? 'sedang' : 'besar';
    b.eksekusi++; b.baru[kunci]++;
    if (nId === 3) b.baruFotoLengkap[kunci]++;
  });
  headerV2.forEach(function (g) {
    nomori(g.penyulangUrut.sort(function (a, b) { return a.ts - b.ts; }), g.kode, 'PNY',
      function (x) { return x.kodeLama; }, function (x, kode) { x.kode = kode; });
    g.penyulangUrut.forEach(function (x) {
      if (x.dibuat) catat('realisasi', '', 'INDUK_DIBUAT', 'REALISASI_DIBUAT dari eksekusi ' + x.asal + ' (' + x.penyulang + ')', x.kode, bulanDari(g.tgl));
      else if (x.kode !== x.kodeLama) { tambah('realisasi', 'kodeBaru'); catat('realisasi', x.kodeLama, 'OK', 'KODE_DIBUAT_ULANG', x.kode, bulanDari(g.tgl)); }
    });
  });
  semuaReal.forEach(function (x) {
    nomori(x.eksekusi.sort(function (a, b) { return a.ts - b.ts; }), x.kode, 'EKS',
      function (y) { return y.kodeLama; }, function (y, kode) { y.kode = kode; });
    x.eksekusi.forEach(function (y) {
      if (y.kode !== y.kodeLama) { tambah('eksekusi', 'kodeBaru'); catat('eksekusi', y.kodeLama, 'OK', 'KODE_DIBUAT_ULANG', y.kode, bulanDari(x.g.tgl)); }
    });
  });
  var hasil = { kolomKurang: kolomKurang, hitung: hitung, foto: foto, perBulan: perBulan, catatan: catatan };
  // struktur kerja untuk rencanaMigrasi_ (melingkar, jadi tidak ikut JSON / laporan)
  Object.defineProperty(hasil, 'headerV2', { value: headerV2, enumerable: false });
  return hasil;
}

/**
 * Tahap A (pure): hasil analisis -> baris v2 siap ditulis (urut Timestamp supaya jendela baca sync tetap maju),
 * antrean foto (mig_Foto) dan peta kode lama -> baru (mig_Peta). opsi = { ulpNama, sekarang (Date) }.
 * Semua baris ditandai dibuat_oleh / diubah_oleh = MIGRASI. Hitungan realisasi + WA diisi tahap C.
 */
function rencanaMigrasi_(r, opsi) {
  var ts = function (ms, tgl) { return ms > 0 ? new Date(ms) : new Date(tgl + 'T08:00:00+07:00'); };
  var std = { status: 'AKTIF', revision: 1, dibuat_oleh: 'MIGRASI', waktu_perangkat: '', diubah_oleh: 'MIGRASI' };
  var isi = function (o) { Object.keys(std).forEach(function (k) { o[k] = std[k]; }); return o; };
  var out = { header: [], realisasi: [], eksekusi: [], foto: [], peta: [] };
  r.headerV2.forEach(function (g) {
    var anakTs = [];
    g.penyulangUrut.forEach(function (x) { anakTs.push(x.ts); x.eksekusi.forEach(function (y) { anakTs.push(y.ts); }); });
    var tsH = g.ts || anakTs.filter(function (t) { return t > 0; }).sort()[0] || 0;
    out.header.push(isi({
      'Kode Header': g.kode, 'ULP': opsi.ulpNama, 'Hari': hariDari_(g.tgl), 'Tanggal': g.tgl, 'Tim': 'ROW', 'Sub-Tim': String(g.tim.nama),
      'Koordinat Awal': g.kAwal, 'Koordinat Akhir': g.kAkhir, 'KM Awal': g.kmAwal === null ? '' : g.kmAwal,
      'KM Akhir': g.kmAkhir === null ? '' : g.kmAkhir, 'Kendala': g.kendala, 'WA Text': '', 'TimeStamp': ts(tsH, g.tgl),
      'Input By': g.inputBy, 'TimeStamp Update': opsi.sekarang, header_id: g.id, tim_id: String(g.tim.tim_id), _ms: ts(tsH, g.tgl).getTime()
    }));
    (g.anggota.length ? g.anggota : ['']).forEach(function (k, i) {
      out.peta.push({ jenis: 'header', kode_lama: k, kode_baru: g.kode, id_v2: g.id,
                      keterangan: g.dibuat ? 'INDUK_DIBUAT' : (i > 0 ? 'DIGABUNG' : ''), wa_lama: i === 0 ? g.waLama : '' });
    });
    g.penyulangUrut.forEach(function (x) {
      out.realisasi.push(isi({
        'Kode Header': g.kode, 'Kode Pekerjaan': x.kode, 'Hari': hariDari_(g.tgl), 'Tanggal': g.tgl, 'Tim': String(g.tim.nama),
        'Penyulang': x.penyulang, 'Section': '', 'Rabas': 0, 'Sedang': 0, 'Besar': 0, 'Input Oleh': x.inputOleh || '',
        'Timestamp': ts(x.ts || tsH, g.tgl), 'Timestamp Update': opsi.sekarang, realisasi_id: x.id, header_id: g.id,
        _ms: ts(x.ts || tsH, g.tgl).getTime()
      }));
      out.peta.push({ jenis: 'realisasi', kode_lama: x.kodeLama || '', kode_baru: x.kode, id_v2: x.id,
                      keterangan: x.dibuat ? 'INDUK_DIBUAT' : '', wa_lama: '' });
      x.eksekusi.forEach(function (y) {
        var kt = y.kTiang, kp = y.kKerja;
        out.eksekusi.push(isi({
          'Kode Header': g.kode, 'Kode Pekerjaan': x.kode, 'Kode Eksekusi': y.kode, 'ULP': opsi.ulpNama, 'Hari': hariDari_(g.tgl),
          'Tanggal': g.tgl, 'Tim': String(g.tim.nama), 'Penyulang': x.penyulang, 'Section': y.secNama, 'Nomor Tiang': y.nomorTiang,
          'Koordinat Tiang': kt ? kt.teks : '', 'Lat Tiang': kt ? kt.lat : '', 'Long Tiang': kt ? kt.lng : '',
          'Koordinat Pekerjaan': kp ? kp.teks : '', 'Lat Pekerjaan': kp ? kp.lat : '', 'Long Pekerjaan': kp ? kp.lng : '',
          'Foto Sebelum': '', 'Foto Sebelum URL': '', 'Foto Pekerjaan': '', 'Foto Pekerjaan URL': '', 'Foto Sesudah': '', 'Foto Sesudah URL': '',
          'Diameter': y.d, 'Jenis Pekerjaan': y.jenis.nama, 'Input Oleh': y.inputOleh, 'Timestamp': ts(y.ts || x.ts || tsH, g.tgl),
          'Timestamp Update': opsi.sekarang, eksekusi_id: y.id, realisasi_id: x.id, section_id: y.secId, jenis_id: y.jenis.jenis_id,
          foto_lengkap: false, sumber: y.kodeWo ? 'TEMUAN' : 'LANGSUNG', temuan_id: '',   // kode WO lama di mig_Peta
          _ms: ts(y.ts || x.ts || tsH, g.tgl).getTime()
        }));
        out.peta.push({ jenis: 'eksekusi', kode_lama: y.kodeLama || '', kode_baru: y.kode, id_v2: y.id,
                        keterangan: y.kodeWo ? 'WO ' + y.kodeWo : '', wa_lama: '' });
        Object.keys(y.fotoId).forEach(function (slot) {
          out.foto.push({ foto_id: uuidMig_('foto', y.id + '|' + slot), eksekusi_id: y.id, kode_eksekusi: y.kode, slot: slot,
                          sumber_drive_id: y.fotoId[slot].id || '', sumber_path: y.fotoId[slot].path || '',
                          status: 'ANTRE', percobaan: 0, drive_file_id: '', pesan: '', diubah_pada: '' });
        });
      });
    });
  });
  // v0.62.3: tanpa _ms angka, sort jatuh ke urutan kode (per tim) dan jendela baca syncRow membengkak. Fail closed.
  ['header', 'realisasi', 'eksekusi'].forEach(function (j) {
    out[j].forEach(function (o) {
      if (typeof o._ms !== 'number' || !isFinite(o._ms)) throw new SisiError_('MIG_URUTAN_TIDAK_VALID', j + ' ' + (o[ROW_KODE_[j]] || ''));
    });
  });
  var urut = function (kolKode) { return function (a, b) { return (a._ms - b._ms) || (a[kolKode] < b[kolKode] ? -1 : a[kolKode] > b[kolKode] ? 1 : 0); }; };
  out.header.sort(urut('Kode Header'));
  out.realisasi.sort(urut('Kode Pekerjaan'));
  out.eksekusi.sort(urut('Kode Eksekusi'));
  ['header', 'realisasi', 'eksekusi'].forEach(function (j) { out[j].forEach(function (o) { delete o._ms; }); });
  return out;
}

/** Baca satu sheet sumber lama jadi { kolom, rows }. Hanya getValues (baca). */
function bacaSumberMig_(ss, nama) {
  var sh = ss.getSheetByName(nama);
  if (!sh) throw new SisiError_('SHEET_TIDAK_ADA', 'sumber: ' + nama);
  var nilai = sh.getDataRange().getValues();
  var kolom = (nilai[0] || []).map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < nilai.length; i++) {
    var o = {}, kosong = true;
    Object.defineProperty(o, '_baris', { value: i + 1, enumerable: false, writable: true });
    for (var j = 0; j < kolom.length; j++) {
      if (!kolom[j]) continue;
      o[kolom[j]] = nilai[i][j];
      if (nilai[i][j] !== '' && nilai[i][j] !== null) kosong = false;
    }
    if (!kosong) rows.push(o);
  }
  return { kolom: kolom, rows: rows };
}

/** Sumber + master + mig_Alias + mig_Koreksi. Dipakai cek (dry-run) dan jalan (tahap A). */
function siapkanMigrasi_() {
  var c = cfg_();
  var p = PropertiesService.getScriptProperties();
  var sumberId = String(p.getProperty('MIG_SUMBER_ID') || '').trim();
  if (!sumberId) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'MIG_SUMBER_ID');
  if (!c.ROW_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'ROW_SHEET_ID');
  if ([c.ROW_SHEET_ID, c.MASTER_SHEET_ID, c.AUTH_SHEET_ID].indexOf(sumberId) !== -1) throw new SisiError_('MIG_SUMBER_SALAH', 'sumber = sheet v2');
  var opsi = { dari: p.getProperty('MIG_DARI') || '2026-01-01', sampai: p.getProperty('MIG_SAMPAI') || tglJakarta_(new Date()), kodeUlp: c.KODE_ULP };
  var ss = SpreadsheetApp.openById(sumberId);
  var S = { kolom: {} };
  Object.keys(MIG_SHEET_).forEach(function (j) {
    var t = bacaSumberMig_(ss, MIG_SHEET_[j]);
    S[j] = t.rows; S.kolom[j] = t.kolom;
  });
  var m = masterRow_();
  var ssRow = bukaSpreadsheet_(c.ROW_SHEET_ID);
  var opsional = function (nama) { return ssRow.getSheetByName(nama) ? bacaSumberMig_(ssRow, nama).rows : []; };
  var M = { jaringan: m.jaringan, jenis: m.jenis, tim: tabel_('MASTER_SHEET_ID', 'db_Tim').rows,
            alias: opsional('mig_Alias'), koreksi: opsional('mig_Koreksi') };
  return { c: c, p: p, S: S, M: M, opsi: opsi, ss: ss, ssRow: ssRow };
}

/** Tulis sheet laporan migrasi (dibuat kalau belum ada, isi lama diganti). */
function tulisSheetMig_(ssRow, nama, kepala, baris) {
  var sh = ssRow.getSheetByName(nama) || ssRow.insertSheet(nama);
  sh.clearContents();
  var isi = [kepala].concat(baris.slice(0, 50000));
  sh.getRange(1, 1, isi.length, kepala.length).setValues(isi.map(function (b) { return b.map(amanSheet_); }));
  return sh;
}

/**
 * Editor: DRY-RUN migrasi. Script Property MIG_SUMBER_ID = spreadsheet sumber lama (staging: SiSi_Lama_Sampel).
 * Opsional MIG_DARI / MIG_SAMPAI (yyyy-MM-dd). Sheet opsional di SiSi_ROW: mig_Alias, mig_Koreksi.
 * Menulis laporan ke sheet mig_Cek + mig_Ringkas di SiSi_ROW.
 */
function ADMIN_migrasiCek() {
  pastikanPemilik_();
  var w = stopwatch_();
  var x = siapkanMigrasi_();
  w('baca');
  var r = analisisMigrasi_(x.S, x.M, x.opsi);
  w('analisis');
  console.log('MIGRASI DRY-RUN ' + x.c.ENV + ' | sumber "' + x.ss.getName() + '" | periode ' + x.opsi.dari + ' s.d. ' + x.opsi.sampai);
  Object.keys(r.kolomKurang).forEach(function (j) { console.log('KOLOM KURANG di ' + MIG_SHEET_[j] + ': ' + r.kolomKurang[j].join(', ')); });
  Object.keys(r.hitung).forEach(function (j) { console.log(j + ': ' + JSON.stringify(r.hitung[j])); });
  console.log('foto: ' + JSON.stringify(r.foto));
  console.log('KARANTINA total: ' + r.catatan.filter(function (c) { return c.status === 'KARANTINA'; }).length);
  tulisSheetMig_(x.ssRow, 'mig_Cek', ['jenis', 'kode_lama', 'kode_baru', 'status', 'alasan', 'bulan'],
    r.catatan.map(function (c) { return [c.jenis, c.kodeLama, c.kodeBaru, c.status, c.alasan, c.bulan]; }));
  tulisSheetMig_(x.ssRow, 'mig_Ringkas', ['bulan', 'sub_tim', 'header_v2', 'realisasi_v2', 'eksekusi_v2', 'lama_rabas', 'lama_sedang', 'lama_besar',
    'baru_rabas', 'baru_sedang', 'baru_besar', 'baru_fotoLengkap_rabas', 'baru_fotoLengkap_sedang', 'baru_fotoLengkap_besar'],
    Object.keys(r.perBulan).sort().map(function (k) {
      var b = r.perBulan[k], kk = k.split('|');
      return [kk[0], kk[1], b.header, b.realisasi, b.eksekusi, b.lama.rabas, b.lama.sedang, b.lama.besar,
              b.baru.rabas, b.baru.sedang, b.baru.besar, b.baruFotoLengkap.rabas, b.baruFotoLengkap.sedang, b.baruFotoLengkap.besar];
    }));
  w('tulis laporan');
  console.log('Laporan: sheet mig_Cek (' + r.catatan.length + ' baris) dan mig_Ringkas di SiSi_ROW. row_* TIDAK diubah. Waktu ' + JSON.stringify(w.ringkas()));
}

/**
 * Editor / pemicu: cek foto lama SEBELUM tahap B (hanya baca, aman selagi app lama jalan). Path AppSheet dicari
 * di MIG_FOTO_AKAR_ID, ID Drive dicek bisa dibuka. v0.59: BISA DILANJUTKAN. Tiap jalan ~4,5 menit, posisi disimpan
 * di Script Property MIG_CEKFOTO_POS (foto_id terakhir + hitungan), hasil DITAMBAHKAN ke mig_CekFoto. Data lama yang
 * bertambah (app lama masih dipakai) tidak mengulang dari awal: lanjut setelah foto_id terakhir. foto_id terakhir tidak
 * ada lagi di rencana = mulai ulang. Selesai = posisi dihapus + pemicu otomatis dihapus.
 * Otomatis: ADMIN_migrasiCekFotoOtomatis (tiap 5 menit). Ulang dari awal: ADMIN_migrasiCekFotoUlang.
 */
var MIG_CEKFOTO_POS_ = 'MIG_CEKFOTO_POS';
var MIG_CEKFOTO_SIBUK_ = 'MIG_CEKFOTO_SIBUK';
var MIG_CEKFOTO_KEPALA_ = ['kode_eksekusi', 'slot', 'sumber', 'ada', 'keterangan'];

function ADMIN_migrasiCekFoto(e) {
  pastikanPemilik_();
  return jalanPemicu_('ADMIN_migrasiCekFoto', e, cekFotoMigPemicu_);   // v0.84.0: waktu jalan dicatat + rem kuota
}

/** v0.84.0: isi ADMIN_migrasiCekFoto (dibungkus jalanPemicu_). */
function cekFotoMigPemicu_() {
  var mulai = Date.now(), BATAS = 270000;
  var p = PropertiesService.getScriptProperties();
  // v0.62.6 (audit 7 Okt 2026): cek + pasang penanda di dalam ScriptLock (dulu dua jalan bisa lolos bersamaan).
  var boleh = denganLock_(function () {
    var sibuk = Number(p.getProperty(MIG_CEKFOTO_SIBUK_) || 0);
    if (sibuk && mulai - sibuk < 360000) return false;
    p.setProperty(MIG_CEKFOTO_SIBUK_, String(mulai));
    return true;
  });
  if (!boleh) { console.log('CEK FOTO: jalan lain masih berlangsung, dilewati.'); return; }
  try {
    var x = siapkanMigrasi_();
    var r = analisisMigrasi_(x.S, x.M, x.opsi);
    var foto = rencanaMigrasi_(r, { ulpNama: x.c.ULP_NAMA, sekarang: new Date() }).foto;
    var detikRencana = Math.round((Date.now() - mulai) / 1000);
    var pos = null;
    try { pos = JSON.parse(p.getProperty(MIG_CEKFOTO_POS_) || 'null'); } catch (e) { pos = null; }
    var dari = 0;
    if (pos && pos.terakhir) {
      var idx = -1;
      for (var k = 0; k < foto.length; k++) { if (foto[k].foto_id === pos.terakhir) { idx = k; break; } }
      if (idx === -1) { console.log('CEK FOTO: posisi lama tidak ada di rencana sekarang, mulai ulang.'); pos = null; } else dari = idx + 1;
    }
    var sh;
    if (!pos) {
      pos = { terakhir: '', ada: 0, hilang: 0, jalan: 0 };
      sh = tulisSheetMig_(x.ssRow, 'mig_CekFoto', MIG_CEKFOTO_KEPALA_, []);
    } else {
      sh = x.ssRow.getSheetByName('mig_CekFoto') || tulisSheetMig_(x.ssRow, 'mig_CekFoto', MIG_CEKFOTO_KEPALA_, []);
    }
    var akarId = String(x.p.getProperty('MIG_FOTO_AKAR_ID') || '').trim();
    var akar = akarId ? DriveApp.getFolderById(akarId) : null;
    var cache = {}, baris = [], i = dari;
    for (; i < foto.length; i++) {
      if (Date.now() - mulai > BATAS) break;
      var q = foto[i], file = null, ket = '';
      try {
        if (q.sumber_drive_id) file = DriveApp.getFileById(q.sumber_drive_id);
        else if (!akar) ket = 'MIG_FOTO_AKAR_ID belum diisi';
        else file = fileDariPathMig_(akar, q.sumber_path, cache);
      } catch (e) { ket = String(e && e.message || e).slice(0, 120); }
      if (file) pos.ada++; else pos.hilang++;
      baris.push([q.kode_eksekusi, q.slot, q.sumber_drive_id || q.sumber_path, file ? 'ADA' : 'TIDAK', file ? file.getName() : ket]);
      pos.terakhir = q.foto_id;
    }
    if (baris.length) {
      sh.getRange(sh.getLastRow() + 1, 1, baris.length, MIG_CEKFOTO_KEPALA_.length)
        .setValues(baris.map(function (b) { return b.map(amanSheet_); }));
    }
    pos.jalan++;
    var sisa = foto.length - i;
    var ring = 'ada ' + pos.ada + ', tidak ketemu ' + pos.hilang + ', sudah dicek ' + (foto.length - sisa) + ' dari ' + foto.length +
      ' | jalan ke-' + pos.jalan + ' (+' + baris.length + ', rencana ' + detikRencana + ' s) | akar "' + (akar ? akar.getName() : '-') + '"';
    if (sisa > 0) {
      p.setProperty(MIG_CEKFOTO_POS_, JSON.stringify(pos));
      console.log('CEK FOTO LAMA (LANJUT): ' + ring + ' | sisa ' + sisa + '. Jalankan lagi atau ADMIN_migrasiCekFotoOtomatis.');
    } else {
      p.deleteProperty(MIG_CEKFOTO_POS_);
      hapusPemicuCekFoto_();
      console.log('CEK FOTO LAMA SELESAI: ' + ring + ' | detail di mig_CekFoto (filter kolom ada = TIDAK).');
    }
  } finally {
    p.deleteProperty(MIG_CEKFOTO_SIBUK_);
  }
}

function hapusPemicuCekFoto_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'ADMIN_migrasiCekFoto') ScriptApp.deleteTrigger(t);
  });
}

/** Editor: jalankan ADMIN_migrasiCekFoto otomatis tiap 5 menit sampai semua foto dicek (pemicu dihapus sendiri). */
function ADMIN_migrasiCekFotoOtomatis() {
  pastikanPemilik_();
  hapusPemicuCekFoto_();
  ScriptApp.newTrigger('ADMIN_migrasiCekFoto').timeBased().everyMinutes(5).create();
  console.log('Pemicu ADMIN_migrasiCekFoto tiap 5 menit dipasang. Pantau log / mig_CekFoto; berhenti: ADMIN_migrasiCekFotoBerhenti.');
}

/** Editor: hentikan pemicu cek foto (posisi tetap disimpan, bisa dilanjutkan). */
function ADMIN_migrasiCekFotoBerhenti() {
  pastikanPemilik_();
  hapusPemicuCekFoto_();
  console.log('Pemicu ADMIN_migrasiCekFoto dihapus. Posisi tetap disimpan.');
}

/** Editor: lupakan posisi cek foto; jalan berikutnya mulai dari foto pertama (mig_CekFoto dikosongkan). */
function ADMIN_migrasiCekFotoUlang() {
  pastikanPemilik_();
  var p = PropertiesService.getScriptProperties();
  p.deleteProperty(MIG_CEKFOTO_POS_);
  p.deleteProperty(MIG_CEKFOTO_SIBUK_);
  console.log('Posisi cek foto dihapus. ADMIN_migrasiCekFoto berikutnya mulai dari awal.');
}

var MIG_FOTO_KOLOM_ = ['foto_id', 'eksekusi_id', 'kode_eksekusi', 'slot', 'sumber_drive_id', 'sumber_path', 'status', 'percobaan',
                       'drive_file_id', 'pesan', 'diubah_pada'];

/**
 * File foto lama dari path AppSheet, dicari per nama folder mulai dari `akar` (folder MIG_FOTO_AKAR_ID).
 * Segmen pertama yang sama dengan nama akar dilewati (akar boleh folder "AppSheet SiSi - ULP Toboali" atau induknya).
 * cache = { path folder -> Folder } untuk satu jalan. null = tidak ketemu.
 */
function fileDariPathMig_(akar, path, cache) {
  var seg = String(path).split('/').filter(function (x) { return x !== ''; });
  var namaFile = seg.pop();
  if (seg.length && seg[0] === akar.getName()) seg.shift();
  var f = akar, kunci = '';
  for (var i = 0; i < seg.length; i++) {
    kunci += '/' + seg[i];
    if (cache[kunci] === null) return null;
    if (!cache[kunci]) {
      var it = f.getFoldersByName(seg[i]);
      cache[kunci] = it.hasNext() ? it.next() : null;
      if (!cache[kunci]) return null;
    }
    f = cache[kunci];
  }
  // v0.60: isi folder didaftar sekali per jalan (folder AppSheet = 1 folder per eksekusi, 3 foto), bukan cari per foto.
  var isi = isiFolderMig_(f, '@' + kunci, cache);
  if (isi) return isi[namaFile] || null;
  var itF = f.getFilesByName(namaFile);
  return itF.hasNext() ? itF.next() : null;
}

/** { nama -> File } isi satu folder, di-cache per jalan. Folder besar (> 300 file) = null (pakai cari per nama). */
function isiFolderMig_(folder, kunci, cache) {
  if (Object.prototype.hasOwnProperty.call(cache, kunci)) return cache[kunci];
  if (typeof folder.getFiles !== 'function') return (cache[kunci] = null);
  var peta = {}, n = 0, it = folder.getFiles();
  while (it.hasNext()) {
    if (++n > 300) return (cache[kunci] = null);
    var x = it.next(), nm = x.getName();
    if (!peta[nm]) peta[nm] = x;
  }
  return (cache[kunci] = peta);
}

/**
 * Editor: TAHAP A, tulis header/realisasi/eksekusi hasil migrasi ke row_* (tanpa foto, hitungan 0, WA kosong).
 * Syarat: tidak ada karantina (atau MIG_IZINKAN_KARANTINA=TRUE: yang karantina DITINGGAL permanen), row_* hanya
 * berisi baris migrasi dari rencana yang sama (boleh dijalankan ulang untuk melanjutkan; ID deterministik).
 * Juga menulis mig_Peta (kode lama -> baru, WA lama) dan menambah antrean mig_Foto. Lanjut: ADMIN_migrasiFoto, ADMIN_migrasiHitung.
 */
function ADMIN_migrasiJalan() {
  pastikanPemilik_();
  var w = stopwatch_();
  var x = siapkanMigrasi_();
  var r = analisisMigrasi_(x.S, x.M, x.opsi);
  if (Object.keys(r.kolomKurang).length) throw new SisiError_('MIG_KOLOM_KURANG', JSON.stringify(r.kolomKurang));
  var karantina = r.catatan.filter(function (c) { return c.status === 'KARANTINA'; }).length;
  if (karantina && x.p.getProperty('MIG_IZINKAN_KARANTINA') !== 'TRUE') {
    throw new SisiError_('MIG_MASIH_KARANTINA', karantina + ' baris. Bereskan lewat mig_Alias / mig_Koreksi lalu ADMIN_migrasiCek, ' +
      'atau set Script Property MIG_IZINKAN_KARANTINA=TRUE untuk meninggalkannya.');
  }
  var sekarang = new Date();
  var rencana = rencanaMigrasi_(r, { ulpNama: x.c.ULP_NAMA, sekarang: sekarang });
  w('rencana');
  var tulis = denganLock_(function () {
    var hasil = {};
    ['header', 'realisasi', 'eksekusi'].forEach(function (j) {
      var t = tabel_('ROW_SHEET_ID', ROW_SHEET_[j]);
      var kolId = ROW_ID_[j];
      var rencanaId = {};
      rencana[j].forEach(function (o) { rencanaId[String(o[kolId])] = true; });
      var ada = {};
      t.rows.forEach(function (row) {
        var id = String(row[kolId] || '');
        if (String(row.dibuat_oleh) !== 'MIGRASI') throw new SisiError_('MIG_ROW_TIDAK_KOSONG', t.nama + ' baris ' + row._baris + ' bukan hasil migrasi. Kosongkan data uji dulu.');
        if (!rencanaId[id]) throw new SisiError_('MIG_RENCANA_BERUBAH', t.nama + ' baris ' + row._baris + ' (' + id + ') tidak ada di rencana sekarang. Hapus data migrasi lama (rollback) dulu.');
        ada[id] = true;
      });
      var baru = rencana[j].filter(function (o) { return !ada[String(o[kolId])]; });
      var akhir = t.sheet.getLastRow();
      if (baru.length) {
        var data = baru.map(function (o, i) { o.No = akhir + i; return barisDariObjek_(t.header, o); });
        t.sheet.getRange(akhir + 1, 1, data.length, t.header.length).setValues(data);
      }
      hasil[j] = { sudahAda: Object.keys(ada).length, ditulis: baru.length };
    });
    // antrean foto: tambah yang belum ada, status lama dipertahankan
    var shF = x.ssRow.getSheetByName('mig_Foto');
    if (!shF) { shF = x.ssRow.insertSheet('mig_Foto'); shF.getRange(1, 1, 1, MIG_FOTO_KOLOM_.length).setValues([MIG_FOTO_KOLOM_]); }
    var adaF = {};
    bacaSumberMig_(x.ssRow, 'mig_Foto').rows.forEach(function (q) { adaF[String(q.foto_id)] = true; });
    var fBaru = rencana.foto.filter(function (q) { return !adaF[q.foto_id]; });
    if (fBaru.length) {
      shF.getRange(shF.getLastRow() + 1, 1, fBaru.length, MIG_FOTO_KOLOM_.length)
        .setValues(fBaru.map(function (q) { return MIG_FOTO_KOLOM_.map(function (k) { return amanSheet_(q[k]); }); }));
    }
    hasil.foto = { antreBaru: fBaru.length, total: rencana.foto.length };
    return hasil;
  }, 60000);
  w('tulis row_*');
  tulisSheetMig_(x.ssRow, 'mig_Peta', ['jenis', 'kode_lama', 'kode_baru', 'id_v2', 'keterangan', 'wa_lama'],
    rencana.peta.map(function (q) { return [q.jenis, q.kode_lama, q.kode_baru, q.id_v2, q.keterangan, q.wa_lama]; }));
  var props = PropertiesService.getScriptProperties();
  Object.keys(ROW_SHEET_).forEach(function (j) {
    props.deleteProperty('ROW_JENDELA_' + ROW_SHEET_[j]);
    props.deleteProperty('ROW_JENDELA_BULAN_' + ROW_SHEET_[j]);
  });
  props.deleteProperty('MIG_HITUNG_SELESAI');
  w('peta');
  console.log('MIGRASI TAHAP A ' + x.c.ENV + ': ' + JSON.stringify(tulis) + (karantina ? ' | karantina DITINGGAL: ' + karantina : '') +
    ' | waktu ' + JSON.stringify(w.ringkas()));
  console.log('Lanjut: ADMIN_migrasiFoto (berulang / ADMIN_migrasiFotoOtomatis), lalu ADMIN_migrasiHitung.');
}

/**
 * Editor / pemicu waktu: TAHAP B, salin foto antrean mig_Foto (ANTRE / ULANG) maks ~4,5 menit per jalan.
 * Per foto: makeCopy di server ke Foto/YYYY/MM/DD/<Tim>/<Penyulang>/<Kode Eksekusi>/<foto_id>.jpg, verifikasi
 * sha256 + ukuran salinan = sumber, salinan wajib privat. Baru setelah itu row_Foto + kolom foto eksekusi ditulis.
 * Gagal = ULANG (maks 3x) lalu GAGAL. Sumber tidak diubah. Antrean habis = pemicu otomatis dihapus.
 */
/**
 * v0.62.4 (audit 6 Okt 2026): penanda sibuk seperti ADMIN_migrasiCekFoto. Pemicu 10 menit + jalan manual dari editor
 * bisa tumpang tindih: dua jalan mengambil antrean ANTRE yang sama dan menyalin foto yang sama 2x. Penanda dicek & dipasang
 * di dalam ScriptLock (atomik), dihapus di finally; penanda lebih tua dari 6 menit dianggap sisa jalan yang mati.
 */
var MIG_FOTO_SIBUK_ = 'MIG_FOTO_SIBUK';

function ADMIN_migrasiFoto(e) {
  pastikanPemilik_();
  return jalanPemicu_('ADMIN_migrasiFoto', e, migrasiFotoPemicu_);   // v0.84.0: waktu jalan dicatat + rem kuota
}

/** v0.84.0: isi ADMIN_migrasiFoto (dibungkus jalanPemicu_). */
function migrasiFotoPemicu_() {
  var p = PropertiesService.getScriptProperties();
  var mulai = Date.now();
  var boleh = denganLock_(function () {
    var sibuk = Number(p.getProperty(MIG_FOTO_SIBUK_) || 0);
    if (sibuk && mulai - sibuk < 360000) return false;
    p.setProperty(MIG_FOTO_SIBUK_, String(mulai));
    return true;
  });
  if (!boleh) { console.log('MIGRASI FOTO: jalan lain masih berlangsung, dilewati.'); return; }
  try {
    migrasiFotoInti_();
  } finally {
    p.deleteProperty(MIG_FOTO_SIBUK_);
  }
}

function migrasiFotoInti_() {
  var c = cfg_();
  if (!c.ROW_FOTO_FOLDER_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'ROW_FOTO_FOLDER_ID');
  var mulai = Date.now(), BATAS = 270000;
  var ssRow = bukaSpreadsheet_(c.ROW_SHEET_ID);
  var shF = ssRow.getSheetByName('mig_Foto');
  if (!shF) throw new SisiError_('SHEET_TIDAK_ADA', 'mig_Foto (jalankan ADMIN_migrasiJalan dulu)');
  var antre = bacaSumberMig_(ssRow, 'mig_Foto');
  var todo = [];
  antre.rows.forEach(function (q) {
    var st = String(q.status);
    if ((st === 'ANTRE' || st === 'ULANG') && (Number(q.percobaan) || 0) < 3) todo.push(q);
  });
  if (!todo.length) { hapusPemicuMigFoto_(); console.log('Antrean foto kosong. Pemicu otomatis (kalau ada) dihapus.'); return; }
  var prioritas = String(PropertiesService.getScriptProperties().getProperty('MIG_FOTO_PRIORITAS') || '').trim();
  todo = urutPrioritasFotoMig_(todo, prioritas);
  var E = tabel_('ROW_SHEET_ID', 'row_Eksekusi');
  var eksById = {};
  E.rows.forEach(function (e) { eksById[String(e.eksekusi_id)] = e; });
  var Fh = tabel_('ROW_SHEET_ID', 'row_Foto');
  var fotoAda = {}, slotAktif = {};
  Fh.rows.forEach(function (f) {
    fotoAda[String(f.foto_id)] = f;
    if (f.status === 'AKTIF') (slotAktif[String(f.eksekusi_id)] = slotAktif[String(f.eksekusi_id)] || {})[String(f.slot)] = true;
  });
  var akarId = String(PropertiesService.getScriptProperties().getProperty('MIG_FOTO_AKAR_ID') || '').trim();
  var akar = null, cacheFolder = {};
  if (todo.some(function (q) { return !q.sumber_drive_id && q.sumber_path; })) {
    if (!akarId) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'MIG_FOTO_AKAR_ID (folder Drive foto AppSheet lama)');
    akar = DriveApp.getFolderById(akarId);
  }
  var fotoBaru = [], ubahEks = {}, selesai = 0, gagal = 0, ulang = 0;
  var memoFolder = {}, memoIsi = {}, nUkur = { api: 0 }, detikAwal = Math.round((Date.now() - mulai) / 1000);
  for (var n = 0; n < todo.length && Date.now() - mulai < BATAS; n++) {
    var q = todo[n];
    var tandai = function (status, pesan, driveId) {
      q.status = status; q.pesan = pesan || ''; q.diubah_pada = new Date();
      if (driveId) q.drive_file_id = driveId;
      if (status === 'ULANG' || status === 'GAGAL') q.percobaan = (Number(q.percobaan) || 0) + 1;
      if (status === 'ULANG' && q.percobaan >= 3) q.status = 'GAGAL';
      if (q.status === 'GAGAL') gagal++; else if (q.status === 'ULANG') ulang++; else selesai++;
    };
    try {
      var eks = eksById[String(q.eksekusi_id)];
      if (!eks) { tandai('GAGAL', 'EKSEKUSI_TIDAK_ADA'); q.percobaan = 3; continue; }
      if (fotoAda[String(q.foto_id)]) { tandai('SELESAI', 'sudah ada di row_Foto', fotoAda[String(q.foto_id)].drive_file_id); continue; }
      var src = q.sumber_drive_id ? DriveApp.getFileById(String(q.sumber_drive_id)) : fileDariPathMig_(akar, String(q.sumber_path), cacheFolder);
      if (!src) { tandai('GAGAL', 'FILE_LAMA_TIDAK_ADA (' + String(q.sumber_path).slice(-80) + ')'); q.percobaan = 3; continue; }
      // v0.60: sha256 + ukuran dari metadata Drive (dihitung Google dari isi file), tanpa download. Tanpa Drive API /
      // checksum kosong = cara lama (download + hitung sendiri). Salinan tetap diverifikasi terpisah dari sumbernya.
      var mS = metaFotoMig_(src.getId());
      var bS = null;
      if (!mS) { bS = src.getBlob().getBytes(); mS = { sha: bytesKeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bS)), ukuran: bS.length, mime: src.getMimeType() }; }
      var shaS = mS.sha;
      // v0.62.7 (audit 7 Okt 2026): sumber bukan gambar (mis. URL lama menunjuk PDF) dulu tetap disalin dan dihitung
      // foto_lengkap, padahal getFotoRow menolak non-gambar. Sekarang GAGAL, tidak ikut lengkap.
      var mimeS = String(mS.mime || src.getMimeType() || '');
      if (mimeS.indexOf('image/') !== 0) { tandai('GAGAL', 'BUKAN_GAMBAR (' + mimeS + ')'); q.percobaan = 3; continue; }
      var folder = folderFoto_(c.ROW_FOTO_FOLDER_ID, pathFotoEksekusi_(eks), memoFolder);
      var nama = String(q.foto_id) + '.jpg';
      var isiTujuan = isiFolderMig_(folder, '#' + folder.getId(), memoIsi);
      var salin = isiTujuan ? (isiTujuan[nama] || null) : null;
      if (!isiTujuan) { var it = folder.getFilesByName(nama); salin = it.hasNext() ? it.next() : null; }
      var mC = null;
      if (!salin) {
        var hasilSalin = salinFotoMig_(src, nama, folder);
        salin = hasilSalin.file; mC = hasilSalin.meta;
        if (isiTujuan) isiTujuan[nama] = salin;
      }
      if (!mC) mC = metaFotoMig_(salin.getId());
      if (!mC) { var bC = salin.getBlob().getBytes(); mC = { sha: bytesKeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bC)), ukuran: bC.length }; }
      if (mC.sha !== shaS || mC.ukuran !== mS.ukuran) { salin.setTrashed(true); if (isiTujuan) delete isiTujuan[nama]; tandai('ULANG', 'SALINAN_BEDA (sha/ukuran)'); continue; }
      nUkur.api += mS.api ? 1 : 0;
      var akses = null;
      try { akses = salin.getSharingAccess(); } catch (e1) { akses = null; }
      if (akses !== null && akses !== DriveApp.Access.PRIVATE) {
        try { salin.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); akses = salin.getSharingAccess(); } catch (e2) { /* shared drive */ }
      }
      if (akses !== null && akses !== DriveApp.Access.PRIVATE) { salin.setTrashed(true); if (isiTujuan) delete isiTujuan[nama]; tandai('ULANG', 'SALINAN_TIDAK_PRIVAT (' + akses + ')'); continue; }
      var sekarang = new Date();
      fotoBaru.push({ foto_id: String(q.foto_id), eksekusi_id: String(q.eksekusi_id), slot: String(q.slot), drive_file_id: salin.getId(),
        sha256: shaS, ukuran_byte: mS.ukuran, mime: mS.mime || src.getMimeType() || 'image/jpeg', sumber_foto: 'MIGRASI', diambil_pada: '',
        lat: '', lng: '', akurasi_m: '', Timestamp: sekarang, 'Timestamp Update': sekarang, status: 'AKTIF', revision: 1,
        dibuat_oleh: 'MIGRASI', waktu_perangkat: '', diubah_oleh: 'MIGRASI' });
      var kol = SLOT_FOTO_[String(q.slot)];
      var u = ubahEks[String(q.eksekusi_id)] = ubahEks[String(q.eksekusi_id)] || {};
      u[kol] = nama; u[kol + ' URL'] = 'https://drive.google.com/file/d/' + salin.getId() + '/view';
      (slotAktif[String(q.eksekusi_id)] = slotAktif[String(q.eksekusi_id)] || {})[String(q.slot)] = true;
      tandai('SELESAI', '', salin.getId());
    } catch (err) {
      tandai('ULANG', String(err && err.message || err).slice(0, 200));
    }
  }
  var diproses = todo.slice(0, n);
  denganLock_(function () {
    // v0.62.6 (audit 7 Okt 2026): row_Foto dibaca ulang DI DALAM lock. Salin foto bisa makan menit; selama itu HP
    // (app v2 sudah dipakai saat tahap B masih jalan) atau jalan lain bisa sudah mengisi slot yang sama. Dulu migrasi
    // tetap menambah baris AKTIF kedua + menimpa nama/URL foto dan foto_lengkap dari bacaan lama.
    var aktifSegar = {};
    tabel_('ROW_SHEET_ID', 'row_Foto').rows.forEach(function (f) {
      if (f.status === 'AKTIF') (aktifSegar[String(f.eksekusi_id)] = aktifSegar[String(f.eksekusi_id)] || {})[String(f.slot)] = true;
    });
    var qPerFoto = {};
    diproses.forEach(function (q) { qPerFoto[String(q.foto_id)] = q; });
    ubahEks = {};
    fotoBaru = fotoBaru.filter(function (f) {
      var s = aktifSegar[f.eksekusi_id] = aktifSegar[f.eksekusi_id] || {};
      if (s[f.slot]) {
        var q = qPerFoto[f.foto_id];
        if (q) { q.pesan = 'SLOT_SUDAH_TERISI (salinan migrasi dibuang)'; q.drive_file_id = ''; }
        try { DriveApp.getFileById(f.drive_file_id).setTrashed(true); } catch (eT) { /* dibiarkan: tidak dicatat di row_Foto */ }
        return false;
      }
      s[f.slot] = true;
      var kol = SLOT_FOTO_[f.slot];
      var u = ubahEks[f.eksekusi_id] = ubahEks[f.eksekusi_id] || {};
      u[kol] = f.foto_id + '.jpg';
      u[kol + ' URL'] = 'https://drive.google.com/file/d/' + f.drive_file_id + '/view';
      return true;
    });
    slotAktif = aktifSegar;
    if (fotoBaru.length) {
      var F = headerTabel_('ROW_SHEET_ID', 'row_Foto');
      F.sheet.getRange(F.sheet.getLastRow() + 1, 1, fotoBaru.length, F.header.length)
        .setValues(fotoBaru.map(function (f) { return barisDariObjek_(F.header, f); }));
    }
    var sekarang = new Date();
    var eksDiubah = Object.keys(ubahEks).map(function (eid) {
      var e = eksById[eid], u = ubahEks[eid];
      var s = slotAktif[eid] || {};
      u.foto_lengkap = Object.keys(SLOT_FOTO_).every(function (k) { return s[k]; });
      u['Timestamp Update'] = sekarang;
      e._ubah = u;
      return e;
    });
    tulisKolomBerubah_(E, eksDiubah);   // revision TIDAK naik (sama dengan uploadFotoRow)
    diproses.forEach(function (q) {
      q._ubah = { status: q.status, percobaan: q.percobaan, drive_file_id: q.drive_file_id, pesan: q.pesan, diubah_pada: q.diubah_pada };
    });
    tulisKolomBerubah_({ sheet: shF, header: antre.kolom }, diproses);
  }, 60000);
  var sisa = todo.length - selesai - gagal;
  console.log('MIGRASI FOTO: ' + (prioritas ? 'prioritas ' + prioritas + ' | ' : '') + 'selesai ' + selesai + ', ulang ' + ulang + ', gagal ' + gagal + ', sisa antrean ~' + sisa +
    ' | eksekusi tersentuh ' + Object.keys(ubahEks).length + ' | ' + Math.round((Date.now() - mulai) / 1000) + ' s (baca awal ' + detikAwal +
    ' s, checksum Drive API ' + nUkur.api + '/' + selesai + ')');
  if (sisa <= 0) { hapusPemicuMigFoto_(); console.log('Antrean selesai. Lanjut ADMIN_migrasiHitung.'); }
}

/** Drive API (Advanced Service "Drive" v3) tersedia? */
function adaDriveApi_() {
  return typeof Drive !== 'undefined' && Drive && Drive.Files && typeof Drive.Files.get === 'function' && typeof Drive.Files.copy === 'function';
}

/** Metadata checksum file dari Drive API: { sha (hex kecil), ukuran, mime, api: true }. Tanpa API / checksum kosong = null. */
function metaFotoMig_(id) {
  if (!adaDriveApi_()) return null;
  try {
    var m = Drive.Files.get(String(id), { fields: 'size,sha256Checksum,mimeType', supportsAllDrives: true });
    var sha = String(m && m.sha256Checksum || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha) || !(Number(m.size) > 0)) return null;
    return { sha: sha, ukuran: Number(m.size), mime: m.mimeType || '', api: true };
  } catch (e) { return null; }
}

/** Salin di sisi server. Drive API: satu panggilan sekaligus checksum salinan. Tanpa API: makeCopy (meta null). */
function salinFotoMig_(src, nama, folder) {
  if (adaDriveApi_()) {
    var r = Drive.Files.copy({ name: nama, parents: [folder.getId()] }, src.getId(),
      { supportsAllDrives: true, fields: 'id,size,sha256Checksum' });
    var sha = String(r && r.sha256Checksum || '').toLowerCase();
    var meta = /^[0-9a-f]{64}$/.test(sha) && Number(r.size) > 0 ? { sha: sha, ukuran: Number(r.size), api: true } : null;
    return { file: DriveApp.getFileById(String(r.id)), meta: meta };
  }
  return { file: src.makeCopy(nama, folder), meta: null };
}

function hapusPemicuMigFoto_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'ADMIN_migrasiFoto') ScriptApp.deleteTrigger(t);
  });
}

/** Editor: jalankan ADMIN_migrasiFoto otomatis tiap 10 menit sampai antrean habis (pemicu dihapus sendiri). */
function ADMIN_migrasiFotoOtomatis() {
  pastikanPemilik_();
  hapusPemicuMigFoto_();
  ScriptApp.newTrigger('ADMIN_migrasiFoto').timeBased().everyMinutes(10).create();
  console.log('Pemicu ADMIN_migrasiFoto tiap 10 menit dipasang. Pantau mig_Foto; berhenti: ADMIN_migrasiFotoBerhenti.');
}

/** Editor: hentikan pemicu otomatis salin foto. */
function ADMIN_migrasiFotoBerhenti() {
  pastikanPemilik_();
  hapusPemicuMigFoto_();
  console.log('Pemicu ADMIN_migrasiFoto dihapus.');
}

/** Tulis kolom yang berubah (r._ubah) per blok baris berurutan, satu setValues per blok per kolom. */
function tulisKolomBerubah_(t, rows) {
  var kolom = {};
  rows.forEach(function (r) { if (r._ubah) Object.keys(r._ubah).forEach(function (k) { kolom[k] = true; }); });
  var n = 0;
  Object.keys(kolom).forEach(function (k) {
    var ci = t.header.indexOf(k);
    if (ci === -1) throw new SisiError_('KOLOM_TIDAK_ADA', k);
    var ubah = rows.filter(function (r) { return r._ubah && Object.prototype.hasOwnProperty.call(r._ubah, k); })
      .sort(function (a, b) { return a._baris - b._baris; });
    var i = 0;
    while (i < ubah.length) {
      var j = i;
      while (j + 1 < ubah.length && ubah[j + 1]._baris === ubah[j]._baris + 1) j++;
      var blok = ubah.slice(i, j + 1);
      t.sheet.getRange(blok[0]._baris, ci + 1, blok.length, 1).setValues(blok.map(function (r) { return [amanSheet_(r._ubah[k])]; }));
      n++;
      i = j + 1;
    }
  });
  return n;
}

/**
 * v0.60.1 (pure): sisa antrean tahap B dengan aturan yang sama seperti ADMIN_migrasiFoto (ANTRE / ULANG, percobaan < 3).
 * GAGAL (percobaan 3) tidak menahan: foto itu memang tidak akan tersalin, dicatat saat rekonsiliasi.
 * v0.60.2: sisa juga dikelompokkan per blok tahap C (perBlok, 13 karakter awal Kode Eksekusi = sub-tim + YYMM, sama
 * dengan awalan Kode Header). Antrean tanpa kode eksekusi yang sah = tanpaKode (menahan semua bulan, fail closed).
 */
function sisaAntreFotoMig_(rows) {
  var r = { sisa: 0, selesai: 0, gagal: 0, perBlok: {}, tanpaKode: 0 };
  (rows || []).forEach(function (q) {
    var st = String(q.status);
    if ((st === 'ANTRE' || st === 'ULANG') && (Number(q.percobaan) || 0) < 3) {
      r.sisa++;
      var b = blokFotoMig_(q);
      if (b) r.perBlok[b] = (r.perBlok[b] || 0) + 1; else r.tanpaKode++;
    } else if (st === 'SELESAI') r.selesai++;
    else r.gagal++;
  });
  return r;
}

/** v0.60.2 (pure): 'R01-16130261003001-PNY.001-EKS.001' -> 'R01-161302610'; kode tidak sah -> ''. */
function blokFotoMig_(q) {
  var k = String(q && q.kode_eksekusi || '');
  return /^R\d{2}-\d{5}\d{4}\d{2}\d{3}/.test(k) ? k.slice(0, 13) : '';
}

/**
 * v0.60.2 (pure): urutan kerja tahap B. Script Property MIG_FOTO_PRIORITAS = daftar YYMM dipisah koma (mis. "2610"):
 * foto bulan itu dikerjakan dulu, sisanya tetap urutan antrean (stabil). Kosong = urutan antrean apa adanya.
 */
function urutPrioritasFotoMig_(todo, prioritas) {
  var daftar = String(prioritas || '').split(',').map(function (x) { return x.trim(); }).filter(function (x) { return /^\d{4}$/.test(x); });
  if (!daftar.length) return todo;
  var depan = [], belakang = [];
  todo.forEach(function (q) {
    var b = blokFotoMig_(q);
    (b && daftar.indexOf(b.slice(9, 13)) !== -1 ? depan : belakang).push(q);
  });
  return depan.concat(belakang);
}

/**
 * Editor: TAHAP C, hitung ulang Section + Rabas/Sedang/Besar realisasi dan WA Text header hasil migrasi, per bulan
 * (mesin yang sama dengan sync). Jalankan setelah foto selesai (atau ulang lagi setelah foto susulan). Bulan yang
 * sudah selesai dicatat di MIG_HITUNG_SELESAI; dihapus ADMIN_migrasiJalan. Memegang lock: jalankan di luar jam kerja.
 * v0.60.2: blok (sub-tim + bulan) yang fotonya masih ANTRE / ULANG di mig_Foto dilewati, kecuali MIG_HITUNG_PAKSA=TRUE.
 */
function ADMIN_migrasiHitung() {
  pastikanPemilik_();
  var mulai = Date.now(), BATAS = 240000;
  var props = PropertiesService.getScriptProperties();
  // v0.60.1 / v0.60.2: tahap C per bulan hanya setelah foto bulan itu habis. Hitungan realisasi = eksekusi AKTIF foto
  // lengkap, jadi dihitung sebelum foto tersalin = 0 dan bulan itu tercatat di MIG_HITUNG_SELESAI. Bulan yang fotonya
  // belum habis dilewati (tidak dicatat selesai). Fail closed: tanpa mig_Foto ditolak, antrean tanpa kode menahan semua.
  var ssRow = bukaSpreadsheet_(cfg_().ROW_SHEET_ID);
  if (!ssRow.getSheetByName('mig_Foto')) throw new SisiError_('SHEET_TIDAK_ADA', 'mig_Foto (jalankan ADMIN_migrasiJalan dulu)');
  var antreF = sisaAntreFotoMig_(bacaSumberMig_(ssRow, 'mig_Foto').rows);
  var paksa = props.getProperty('MIG_HITUNG_PAKSA') === 'TRUE';
  if (antreF.tanpaKode && !paksa) {
    throw new SisiError_('TAHAP_B_BELUM_SELESAI', antreF.tanpaKode + ' foto antre tanpa Kode Eksekusi yang sah, semua bulan ditahan. ' +
      'Tunggu ADMIN_migrasiFoto habis, atau MIG_HITUNG_PAKSA=TRUE.');
  }
  var ditahan = paksa ? {} : antreF.perBlok;
  console.log('MIGRASI HITUNG: antrean foto selesai ' + antreF.selesai + ', gagal ' + antreF.gagal + ', sisa ' + antreF.sisa +
    (paksa && antreF.sisa ? ' | MIG_HITUNG_PAKSA: bulan dengan foto tersisa ikut dihitung, ulang setelah tahap B' : ''));
  var hasil = denganLock_(function () {
    var T = {};
    ['header', 'realisasi', 'eksekusi'].forEach(function (j) { T[j] = tabel_('ROW_SHEET_ID', ROW_SHEET_[j]); });
    var master = masterRow_();
    var selesai = String(props.getProperty('MIG_HITUNG_SELESAI') || '').split(',').filter(String);
    var perBulan = {};
    T.header.rows.forEach(function (h) {
      if (String(h.dibuat_oleh) !== 'MIGRASI') return;
      var b = String(h['Kode Header']).slice(0, 13);   // R01-16130YYMM = sub-tim + bulan
      (perBulan[b] = perBulan[b] || []).push(h);
    });
    var realPerHeader = {}, eksPerReal = {};
    T.realisasi.rows.forEach(function (r) { (realPerHeader[String(r.header_id)] = realPerHeader[String(r.header_id)] || []).push(r); });
    T.eksekusi.rows.forEach(function (e) { (eksPerReal[String(e.realisasi_id)] = eksPerReal[String(e.realisasi_id)] || []).push(e); });
    var belum = Object.keys(perBulan).sort().filter(function (b) { return selesai.indexOf(b) === -1; });
    var lewat = belum.filter(function (b) { return ditahan[b]; });
    var bulan = belum.filter(function (b) { return !ditahan[b]; });
    var dikerjakan = [];
    for (var i = 0; i < bulan.length && Date.now() - mulai < BATAS; i++) {
      var ctx = { master: master, waktu: { sekarang: new Date() }, byId: { header: {}, realisasi: {}, eksekusi: {} },
                  kotorRealisasi: {}, kotorHeader: {} };
      // semua header sub-tim di bulan itu (termasuk non-migrasi) supaya total bulanan benar
      T.header.rows.forEach(function (h) {
        if (String(h['Kode Header']).slice(0, 13) === bulan[i]) ctx.byId.header[String(h.header_id)] = h;
      });
      Object.keys(ctx.byId.header).forEach(function (hid) {
        (realPerHeader[hid] || []).forEach(function (r) {
          ctx.byId.realisasi[String(r.realisasi_id)] = r;
          if (String(r.dibuat_oleh) === 'MIGRASI') ctx.kotorRealisasi[String(r.realisasi_id)] = true;
          (eksPerReal[String(r.realisasi_id)] || []).forEach(function (e) { ctx.byId.eksekusi[String(e.eksekusi_id)] = e; });
        });
      });
      perBulan[bulan[i]].forEach(function (h) { ctx.kotorHeader[String(h.header_id)] = true; });
      hitungUlangRealisasi_(ctx);
      hitungUlangWa_(ctx);
      dikerjakan.push(bulan[i]);
    }
    var sel = tulisKolomBerubah_(T.realisasi, T.realisasi.rows) + tulisKolomBerubah_(T.header, T.header.rows);
    props.setProperty('MIG_HITUNG_SELESAI', selesai.concat(dikerjakan).join(','));
    return { bulan: dikerjakan.length, sisa: bulan.length - dikerjakan.length, blokDitulis: sel,
             dikerjakan: dikerjakan, menungguFoto: lewat.length,
             contohMenunggu: lewat.slice(0, 12).map(function (b) { return b + ' (' + ditahan[b] + ')'; }) };
  }, 60000);
  console.log('MIGRASI HITUNG: ' + JSON.stringify(hasil) + ' | ' + Math.round((Date.now() - mulai) / 1000) + ' s' +
    (hasil.sisa ? ' | jalankan lagi untuk sisa bulan' :
      hasil.menungguFoto ? ' | ' + hasil.menungguFoto + ' blok menunggu foto, jalankan lagi setelah fotonya habis' :
      ' | selesai. Cek rekonsiliasi: mig_Ringkas vs row_Realisasi.'));
}
