/**
 * v0.82.0 (keputusan kvlar 10 Okt 2026): migrasi Yandal v1 -> v2 dengan pola migrasi ROW.
 *
 * Sumber = SATU spreadsheet gabungan (Script Property MIGP0_SUMBER_ID) yang disusun admin dari file v1 aktif + ARSIP.
 * Sumber HANYA DIBACA. Tab (nama v1):
 *   db_Yandal_Shift, db_Yandal_P0, db_Yandal_Pengecekan_Switching (opsional), dan tab Pengukuran Gardu (opsional,
 *   nama bebas, dikenali dari judul kolom E "Kode Pengukuran Gardu" seperti v1; atau MIGP0_TAB_UKUR).
 * Kolom dibaca menurut POSISI layout v1 terbaru (P0 A..AX dengan Alasan Rejected di AQ). Judul beberapa kolom kunci
 * dicek dulu: bergeser = MIG_JUDUL_SALAH (lewati hanya dengan MIGP0_LEWATI_CEK_JUDUL=TRUE).
 *
 * Tahap:
 *   ADMIN_migrasiP0Cek    DRY-RUN. Laporan migp0_Cek (masalah per kode) + migp0_Ringkas (per bulan per tim) di SiSi_Yandal.
 *   ADMIN_migrasiP0Jalan  tulis yan_Shift / yan_P0 / yan_Switching / yan_Gardu (dibuat_oleh MIGRASI, ID deterministik,
 *                         rekap shift langsung dihitung mesin v2), antrean foto migp0_Foto, peta migp0_Peta.
 *                         Boleh dijalankan ulang (lanjut / data ARSIP susulan). Data v2 asli tidak disentuh.
 *   ADMIN_migrasiP0Foto   salin foto bertahap (+ Otomatis / Berhenti): Drive server-side, sha256 + ukuran + privat.
 *   ADMIN_migrasiP0Hapus  rollback semua baris MIGRASI di yan_* (wajib MIGP0_IZINKAN_HAPUS=TRUE, sekali pakai).
 *
 * Pemetaan: Tim (db_Tim YANDAL: nama, atau kode dari Kode Header Y<kode>-...), Petugas (db_Petugas, nama),
 * Nama Pekerjaan (db_Jenis_Pekerjaan YANDAL), Penyulang / Section (db_Jaringan), No Gardu (db_Gardu). Alias lewat sheet
 * migp0_Alias di SiSi_Yandal (jenis TIM / PETUGAS / PEKERJAAN / PENYULANG / SECTION, penyulang, nilai_lama, nilai_master).
 * Tim / petugas / pekerjaan tidak dikenal = KARANTINA (rank v2 butuh petugas_id). Penyulang / section / gardu tidak
 * dikenal = PERINGATAN (teks lama tetap ditulis, id kosong).
 * Status: Approved / Rejected v1 dipakai apa adanya (Point v1 dipakai). Belum diputuskan + foto Sesudah ada = Menunggu
 * (masuk Approval P0 v2). Belum selesai = Rejected SISTEM "P0 Tidak Selesai" (sama aturan v2 sesudah batas sync).
 */
var MIGP0_OLEH_ = 'MIGRASI';
var MIGP0_TAB_ = { shift: 'db_Yandal_Shift', p0: 'db_Yandal_P0', switching: 'db_Yandal_Pengecekan_Switching' };
var MIGP0_JUDUL_UKUR_ = 'kodepengukurangardu';
var MIGP0_JENIS_ = ['shift', 'p0', 'switching', 'gardu'];

/** Posisi kolom v1 (0-based), sama dengan COL_YANDAL_SHIFT / COL_P0 / COL_SWITCHING / COL_UKUR_GARDU v1. */
var MIGP0_KOL_ = {
  shift: { kodeHeader: 1, kodeShift: 2, tanggal: 4, ulp: 5, tim: 6, shift: 7, petugas: 8, inputBy: 10, timestamp: 11 },
  p0: { kodeHeader: 1, kodeShift: 2, kodeP0: 3, tanggal: 6, namaPekerjaan: 7, pekerjaanLainnya: 8, penyulang: 9, section: 10,
        daerah: 11, koordinat: 12, lat: 13, long: 14, koordinatClosing: 15, latClosing: 16, longClosing: 17, tim: 20, petugas: 21,
        dibuat: 22, pekerjaan: 27, sesudah: 32, catatan: 37, inputBy: 38, website: 39, statusApproval: 41, alasanRejected: 42,
        approvedBy: 43, waktuApprove: 44, point: 45, folderPath: 49 },
  switching: { kodeP0: 3, kodeSwitching: 4, penyulang: 10, namaSwitching: 11, jam: 12, koordinat: 13, lat: 14, long: 15,
               remote: 16, local: 17, protection: 18, reclose: 19, arusR: 20, arusS: 21, arusT: 22, inputBy: 47, timestamp: 48,
               folderPath: 49 },
  gardu: { kodeP0: 3, kodeUkur: 4, penyulang: 8, section: 9, noGardu: 10, alamat: 11, jam: 12, nilai: 13, petugas: 23 }
};
var MIGP0_KUNCI_ = { shift: 'kodeShift', p0: 'kodeP0', switching: 'kodeSwitching', gardu: 'kodeUkur' };
/** Foto v1 per slot: [Foto Asli, Foto WM, Foto URL, Link Download]. */
var MIGP0_FOTO_P0_ = { SEBELUM: [23, 24, 25, 26], PEKERJAAN: [28, 29, 30, 31], SESUDAH: [33, 34, 35, 36] };
var MIGP0_FOTO_SWC_ = { ARUS: [23, 24, 25, 26], GANGGUAN_1: [27, 28, 29, 30], GANGGUAN_2: [31, 32, 33, 34],
                        GANGGUAN_3: [35, 36, 37, 38], GANGGUAN_4: [39, 40, 41, 42], GANGGUAN_5: [43, 44, 45, 46] };
/** Cek judul kolom kunci: [kolom, potongan judul (huruf kecil tanpa spasi / tanda)]. */
var MIGP0_JUDUL_ = {
  shift: [[1, 'header'], [2, 'shift'], [4, 'tanggal'], [6, 'tim'], [8, 'petugas']],
  p0: [[3, 'p0'], [6, 'tanggal'], [7, 'pekerjaan'], [21, 'petugas'], [41, 'approv'], [42, 'alasan'], [45, 'poin']],
  switching: [[3, 'p0'], [4, 'switching'], [20, 'arus']],
  gardu: [[3, 'p0'], [4, 'pengukurangardu'], [10, 'gardu'], [13, 'beban']]
};
var MIGP0_SHEET_V2_ = { shift: 'yan_Shift', p0: 'yan_P0', switching: 'yan_Switching', gardu: 'yan_Gardu' };
var MIGP0_ID_V2_ = { shift: 'shift_id', p0: 'p0_id', switching: 'switching_id', gardu: 'ukur_id' };
var MIGP0_KODE_V2_ = { shift: 'Kode Shift', p0: 'Kode P0', switching: 'Kode Switching', gardu: 'Kode Pengukuran Gardu' };
var MIGP0_FOTO_KOLOM_ = ['foto_id', 'jenis', 'target_id', 'kode', 'slot', 'sumber_drive_id', 'sumber_path', 'status', 'percobaan',
                         'drive_file_id', 'pesan', 'diubah_pada'];
var MIGP0_CEK_KOLOM_ = ['jenis', 'kode_lama', 'status', 'alasan', 'saran', 'bulan', 'baris_sumber'];
var MIGP0_RINGKAS_KOLOM_ = ['bulan', 'tim', 'shift', 'p0', 'p0_selesai', 'approved', 'rejected', 'rejected_sistem', 'menunggu',
                            'point_v1', 'point_rumus_v2', 'switching', 'gardu', 'foto', 'karantina'];
var MIGP0_BATAS_MS_ = 270000;
var MIGP0_BLOK_ = 2000;   // baris per setValues

// ---------------- baca sumber ----------------

/** Huruf kolom (0 = A). */
function hurufKolomMigP0_(i) {
  var s = '', n = i + 1;
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Satu tab sumber per POSISI: { judul, rows: [{ v, t, baris }], tanpaKode }. Baris kosong / hanya kolom A dilewati. */
function bacaTabMigP0_(sh, kolKunci) {
  var rg = sh.getDataRange(), v = rg.getValues(), t = rg.getDisplayValues();
  var rows = [], tanpaKode = 0;
  for (var i = 1; i < v.length; i++) {
    var isi = false;
    for (var j = 1; j < v[i].length; j++) { if (v[i][j] !== '' && v[i][j] !== null && v[i][j] !== undefined) { isi = true; break; } }
    if (!isi) continue;
    if (!teksMig_(v[i][kolKunci])) { tanpaKode++; continue; }
    rows.push({ v: v[i], t: t[i] || [], baris: i + 1 });
  }
  return { judul: (v[0] || []).map(function (h) { return teksMig_(h); }), rows: rows, tanpaKode: tanpaKode };
}

/** Tab Pengukuran Gardu: nama dari MIGP0_TAB_UKUR, atau tab yang judul kolom E = "Kode Pengukuran Gardu". */
function tabUkurMigP0_(ss, nama) {
  if (nama) {
    var sh = ss.getSheetByName(nama);
    if (!sh) throw new SisiError_('SHEET_TIDAK_ADA', 'sumber: ' + nama);
    return sh;
  }
  var semua = ss.getSheets ? ss.getSheets() : [];
  for (var i = 0; i < semua.length; i++) {
    var s = semua[i];
    if (s.getLastRow() < 1 || s.getLastColumn() < 5) continue;
    if (normJudul_(s.getRange(1, 5).getValue()) === MIGP0_JUDUL_UKUR_) return s;
  }
  return null;
}

/** Semua tab sumber. Shift + P0 wajib, switching + pengukuran gardu opsional (dicatat). */
function bacaSumberMigP0_(ss, tabUkur) {
  var S = { judul: {}, tanpaKode: {}, tidakAda: [], tab: {} };
  MIGP0_JENIS_.forEach(function (j) {
    var sh = j === 'gardu' ? tabUkurMigP0_(ss, tabUkur) : ss.getSheetByName(MIGP0_TAB_[j]);
    if (!sh) {
      if (j === 'shift' || j === 'p0') throw new SisiError_('SHEET_TIDAK_ADA', 'sumber: ' + MIGP0_TAB_[j]);
      S.tidakAda.push(j === 'gardu' ? 'Pengukuran Gardu (judul kolom E "Kode Pengukuran Gardu")' : MIGP0_TAB_[j]);
      S[j] = [];
      return;
    }
    var t = bacaTabMigP0_(sh, MIGP0_KOL_[j][MIGP0_KUNCI_[j]]);
    S[j] = t.rows; S.judul[j] = t.judul; S.tanpaKode[j] = t.tanpaKode; S.tab[j] = sh.getName();
  });
  return S;
}

/** Judul kolom kunci yang tidak cocok: ['db_Yandal_P0 AQ "x" (harus memuat "alasan")', ...]. */
function cekJudulMigP0_(S) {
  var salah = [];
  MIGP0_JENIS_.forEach(function (j) {
    if (!S.judul || !S.judul[j]) return;
    MIGP0_JUDUL_[j].forEach(function (c) {
      var h = S.judul[j][c[0]];
      if (normJudul_(h).indexOf(c[1]) === -1) {
        salah.push((S.tab && S.tab[j] || j) + ' ' + hurufKolomMigP0_(c[0]) + ' "' + teksMig_(h) + '" (harus memuat "' + c[1] + '")');
      }
    });
  });
  return salah;
}

// ---------------- nilai sel lama ----------------

function teksSelMigP0_(row, i) {
  var x = row.v[i];
  return adalahDate_(x) ? teksMig_(row.t[i]) : teksMig_(x);
}

function tglSelMigP0_(row, i) { return tglLama_(row.v[i]) || tglLama_(row.t[i]); }

/** Waktu sel lama -> ms (WIB untuk teks tanpa zona). Date jam saja (tahun < 1950) / tidak terbaca = null. */
function msSelMigP0_(row, i) {
  var x = row.v[i];
  if (adalahDate_(x)) return isNaN(x.getTime()) || x.getFullYear() < 1950 ? null : x.getTime();
  var s = teksMig_(x) || teksMig_(row.t[i]);
  if (!s) return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) return Date.parse(m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + (m[6] || '00') + '+07:00');
  if (!/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}|\d{4}-\d{2}-\d{2}/.test(s)) return null;
  var ms = waktuLama_(s);
  return ms ? ms : null;
}

/** Jam sel lama (Date / 'HH:mm[:ss]' / tanggal + jam) + tanggal operasional. Shift 3 jam < 08:00 = tanggal + 1. */
function jamSelMigP0_(row, i, tanggal, noShift) {
  var ms = msSelMigP0_(row, i);
  if (ms !== null) return ms;
  var s = teksMig_(row.t[i]) || teksMig_(adalahDate_(row.v[i]) ? '' : row.v[i]);
  var m = /^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/.exec(s);
  if (!m || !tanggal || Number(m[1]) > 23) return null;
  var hasil = Date.parse(tanggal + 'T' + pad2_(m[1]) + ':' + m[2] + ':' + (m[3] || '00') + '+07:00');
  if (Number(noShift) === 3 && Number(m[1]) < 8) hasil += 864e5;
  return isFinite(hasil) ? hasil : null;
}

function angkaSelMigP0_(v) {
  var n = angkaGarduLama_(v);
  return n === '' ? null : n;
}

/** Titik dari Lat / Long, cadangan teks Koordinat "lat,long". Tidak sah = null. */
function titikSelMigP0_(row, iLat, iLong, iTeks) {
  var a = angkaSelMigP0_(row.v[iLat]), b = angkaSelMigP0_(row.v[iLong]);
  if (!titikSah_(a, b)) {
    var m = /(-?\d+\.\d+)\s*[,; ]\s*(-?\d+\.\d+)/.exec(teksMig_(row.v[iTeks]));
    a = m ? Number(m[1]) : null; b = m ? Number(m[2]) : null;
  }
  return a !== null && b !== null && titikSah_(a, b) ? { lat: a, lng: b } : null;
}

/** Sumber foto lama satu slot: ID Drive (Link Download > Foto URL > WM > asli), lalu path AppSheet. null = tidak ada. */
function sumberFotoMigP0_(row, kol, folderPath) {
  var urut = [kol[3], kol[2], kol[1], kol[0]];
  for (var i = 0; i < urut.length; i++) {
    var s = teksMig_(row.v[urut[i]]);
    var id = /^https?:/i.test(s) ? driveIdDariUrl_(s) : (/^[A-Za-z0-9_-]{25,}$/.test(s) ? s : null);
    if (id) return { id: id, path: '' };
  }
  for (var k = 0; k < urut.length; k++) {
    var v = teksMig_(row.v[urut[k]]);
    if (!v || /^https?:/i.test(v) && !/[?&]fileName=/i.test(v)) continue;
    var p = pathFotoLama_(v.indexOf('/') === -1 && folderPath && !/^https?:/i.test(v) ? folderPath.replace(/\/+$/, '') + '/' + v : v);
    if (p) return { id: '', path: p };
  }
  return null;
}

function adaIsiMigP0_(row, kol) { return kol.some(function (i) { return !!teksMig_(row.v[i]); }); }

function statusApprovalMigP0_(v) {
  var s = teksMig_(v).toLowerCase();
  if (/approv|setuju|diterima/.test(s)) return 'Approved';
  if (/reject|tolak/.test(s)) return 'Rejected';
  return '';
}

function indikatorMigP0_(v) {
  var s = teksMig_(v);
  if (/^(nyala|on|hidup|ya|1|true)$/i.test(s)) return 'Nyala';
  if (/^(padam|off|mati|tidak|0|false)$/i.test(s)) return 'Padam';
  return s;
}

function isoMigP0_(ms) { return ms === null || ms === undefined ? '' : new Date(ms).toISOString(); }
function wibMigP0_(ms) { return ms === null || ms === undefined ? '' : waktuWib_(ms, true); }

/** Kode ganda di sumber (aktif + ARSIP tumpang tindih): dipakai baris paling lengkap, seri = baris terbawah. */
function dedupMigP0_(rows, kolKunci, catatGanda) {
  var grup = {}, urut = [];
  rows.forEach(function (r) {
    var k = teksMig_(r.v[kolKunci]);
    if (!grup[k]) { grup[k] = []; urut.push(k); }
    grup[k].push(r);
  });
  return urut.map(function (k) {
    var l = grup[k];
    if (l.length === 1) return { kode: k, row: l[0] };
    var skor = function (r) { return r.v.filter(function (x) { return x !== '' && x !== null && x !== undefined; }).length; };
    var pilih = l.slice().sort(function (a, b) { return (skor(b) - skor(a)) || (b.baris - a.baris); })[0];
    catatGanda(k, l, pilih);
    return { kode: k, row: pilih };
  });
}

// ---------------- master ----------------

function kunciAliasMigP0_(jenis, penyulang, nilai) {
  return String(jenis).trim().toUpperCase() + '|' + (jenis === 'SECTION' ? normNama_(penyulang) : '') + '|' + normNama_(nilai);
}

/** Indeks master untuk pencocokan. */
function petaMasterMigP0_(M) {
  var P = { tim: {}, timKode: {}, daftarTim: [], petugas: {}, petugasGanda: {}, daftarPetugas: [], jenis: {}, daftarJenis: [],
            lain: null, penyulang: {}, daftarPenyulang: [], gardu: {}, alias: {} };
  (M.tim || []).forEach(function (t) {
    if (!t.tim_id || teksMig_(t.jenis).toUpperCase() !== 'YANDAL') return;
    P.tim[normNama_(t.nama)] = t;
    if (teksMig_(t.kode)) P.timKode[pad2_(teksMig_(t.kode))] = t;
    P.daftarTim.push(teksMig_(t.nama));
  });
  (M.petugas || []).forEach(function (p) {
    if (!p.petugas_id) return;
    var k = normNama_(p.nama);
    if (P.petugas[k] && String(P.petugas[k].petugas_id) !== String(p.petugas_id)) P.petugasGanda[k] = true;
    P.petugas[k] = p;
    P.daftarPetugas.push(teksMig_(p.nama));
  });
  (M.jenis || []).forEach(function (j) {
    if (!j.jenis_id || teksMig_(j.modul).toUpperCase() !== 'YANDAL') return;
    if (pekerjaanLainP0_(j.nama)) { P.lain = j; return; }
    P.jenis[kunciNama_(j.nama)] = j;
    P.daftarJenis.push(teksMig_(j.nama));
  });
  (M.jaringan || []).forEach(function (r) {
    if (!r.section_id) return;
    var kp = normNama_(r.penyulang);
    var pen = P.penyulang[kp] || (P.penyulang[kp] = { nama: teksMig_(r.penyulang), section: {}, daftar: [] });
    if (!P.daftarPenyulang.some(function (x) { return normNama_(x) === kp; })) P.daftarPenyulang.push(teksMig_(r.penyulang));
    pen.section[normNama_(r.section)] = r;
    pen.daftar.push(teksMig_(r.section));
  });
  (M.gardu || []).forEach(function (g) {
    var no = parseNoGarduLama_(g['No Gardu']);
    if (no && g.gardu_id) P.gardu[no.nomor] = g;
  });
  (M.alias || []).forEach(function (a) {
    var j = teksMig_(a.jenis).toUpperCase();
    if (!j || !teksMig_(a.nilai_lama) || !teksMig_(a.nilai_master)) return;
    P.alias[kunciAliasMigP0_(j, a.penyulang, a.nilai_lama)] = teksMig_(a.nilai_master);
  });
  return P;
}

function aliasMigP0_(P, jenis, penyulang, nilai) { return P.alias[kunciAliasMigP0_(jenis, penyulang, nilai)] || ''; }

/** Tim dari nama (alias dulu), cadangan kode tim di Kode Header Y<kode>-... */
function timMigP0_(P, nama, kodeHeader) {
  var a = aliasMigP0_(P, 'TIM', '', nama);
  var t = P.tim[normNama_(a || nama)];
  if (t) return t;
  var m = /^Y(\d{1,2})-/.exec(teksMig_(kodeHeader));
  return m ? P.timKode[pad2_(m[1])] || null : null;
}

/** Nama petugas v1 dipisah koma / ; / / / & / baris baru (sama _splitPetugasY_ v1). */
function pisahPetugasMigP0_(v) {
  return teksMig_(v).split(/\s*(?:,|;|\/|&|\r|\n)\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
}

/** Petugas: { ok: [baris db_Petugas], gagal: [[nama, saran]] }. Nama ganda di master = gagal (tidak ditebak). */
function petugasMigP0_(P, daftar) {
  var ok = [], gagal = [];
  daftar.forEach(function (nm) {
    var k = normNama_(aliasMigP0_(P, 'PETUGAS', '', nm) || nm);
    var p = P.petugasGanda[k] ? null : P.petugas[k];
    if (p) { if (!ok.some(function (x) { return x.petugas_id === p.petugas_id; })) ok.push(p); }
    else gagal.push([nm, P.petugasGanda[k] ? 'nama ganda di db_Petugas' : saranNama_(nm, P.daftarPetugas)]);
  });
  return { ok: ok, gagal: gagal };
}

/** Pekerjaan master YANDAL. Lain - Lain / Lainnya / kosong + Pekerjaan Lainnya terisi = Lain - Lain. null = tidak dikenal. */
function pekerjaanMigP0_(P, nama, lainnya) {
  var asli = teksMig_(nama), lain = teksMig_(lainnya);
  var a = aliasMigP0_(P, 'PEKERJAAN', '', asli);
  var cari = a || asli;
  var huruf = cari.toLowerCase().replace(/[^a-z]/g, '');
  if (pekerjaanLainP0_(cari) || ['lainlain', 'lainnya', 'pekerjaanlainnya', 'lainlainnya'].indexOf(huruf) !== -1 || (!cari && lain)) {
    return { nama: YAN_PEKERJAAN_LAIN_, jenisId: P.lain ? String(P.lain.jenis_id) : '', bobot: '', lainnya: lain || (a ? asli : '') };
  }
  var j = P.jenis[kunciNama_(cari)];
  if (!j) return null;
  var b = j.bobot, n = Number(b);
  return { nama: teksMig_(j.nama), jenisId: String(j.jenis_id), bobot: b === '' || b === null || b === undefined || !isFinite(n) ? '' : n, lainnya: '' };
}

/** Penyulang + section dari db_Jaringan. Tidak dikenal = teks lama tetap dipakai + masalah (PERINGATAN). */
function lokasiMigP0_(P, penyulang, section) {
  var h = { penyulang: teksMig_(penyulang), section: teksMig_(section), sectionId: '', masalah: [] };
  if (!h.penyulang) return h;
  var pen = P.penyulang[normNama_(aliasMigP0_(P, 'PENYULANG', '', h.penyulang) || h.penyulang)];
  if (!pen) { h.masalah.push(['PENYULANG_TIDAK_DIKENAL', h.penyulang, saranNama_(h.penyulang, P.daftarPenyulang)]); return h; }
  h.penyulang = pen.nama;
  if (!h.section) return h;
  var s = pen.section[normNama_(aliasMigP0_(P, 'SECTION', pen.nama, h.section) || h.section)];
  if (!s) { h.masalah.push(['SECTION_TIDAK_DIKENAL', h.section, saranNama_(h.section, pen.daftar)]); return h; }
  h.section = teksMig_(s.section); h.sectionId = String(s.section_id);
  return h;
}

// ---------------- analisis (murni, dites di Node) ----------------

/**
 * S = hasil bacaSumberMigP0_, M = { tim, petugas, jenis, jaringan, gardu, alias, v2: { shift, p0, switching, gardu } },
 * opsi = { dari, sampai, ulpNama, sekarangMs }. Hasil: { judulSalah, catatan, rencana: { shift, p0, switching, gardu },
 * foto, hitung, perBulan }. Rencana = objek baris v2 siap tulis (tanpa No).
 */
function analisisMigrasiP0_(S, M, opsi) {
  var P = petaMasterMigP0_(M);
  var catatan = [], hitung = {}, perBulan = {};
  MIGP0_JENIS_.forEach(function (j) { hitung[j] = { sumber: (S[j] || []).length, ganda: 0, dilewati: 0, karantina: 0, ok: 0, indukDibuat: 0 }; });
  hitung.p0.rejectedSistem = 0; hitung.p0.menunggu = 0; hitung.p0.pointBeda = 0;
  var catat = function (jenis, kode, status, alasan, saran, bulan, baris) {
    catatan.push({ jenis: jenis, kode: kode, status: status, alasan: alasan, saran: saran || '', bulan: bulan || '', baris: baris || '' });
  };
  var bulanan = function (bulan, tim) {
    var k = bulan + '|' + tim;
    return perBulan[k] || (perBulan[k] = { shift: 0, p0: 0, selesai: 0, approved: 0, rejected: 0, rejectedSistem: 0, menunggu: 0,
      pointV1: 0, pointV2: 0, switching: 0, gardu: 0, foto: 0, karantina: 0 });
  };

  // v2 yang sudah ada (bukan MIGRASI): kode + tim|tanggal|shift tidak boleh bentrok
  var v2 = M.v2 || {}, bentrok = {}, slotV2 = {};
  MIGP0_JENIS_.forEach(function (j) {
    bentrok[j] = {};
    (v2[j] || []).forEach(function (r) {
      if (String(r.dibuat_oleh) === MIGP0_OLEH_) return;
      bentrok[j][teksMig_(r[MIGP0_KODE_V2_[j]])] = true;
      if (j === 'shift' && r.status === 'AKTIF') slotV2[String(r.tim_id) + '|' + tglSel_(r.Tanggal) + '|' + Number(r.Shift)] = true;
    });
  });

  var pilih = {};
  MIGP0_JENIS_.forEach(function (j) {
    pilih[j] = dedupMigP0_(S[j] || [], MIGP0_KOL_[j][MIGP0_KUNCI_[j]], function (kode, l, dipakai) {
      hitung[j].ganda += l.length - 1;
      catat(j, kode, 'PERINGATAN', 'KODE_GANDA (' + l.length + ' baris: ' + l.map(function (r) { return r.baris; }).join(', ') +
        ', dipakai baris ' + dipakai.baris + ')', '', '', dipakai.baris);
    });
  });

  // ---- shift (P0 dikelompokkan dulu: induk hilang dibuat dari P0, petugas kosong diambil dari P0) ----
  var Kp = MIGP0_KOL_.p0, Ks = MIGP0_KOL_.shift;
  var p0PerShift = {};
  pilih.p0.forEach(function (x) {
    var ks = teksMig_(x.row.v[Kp.kodeShift]);
    (p0PerShift[ks] = p0PerShift[ks] || []).push(x);
  });
  var sumberShift = pilih.shift.map(function (x) { return { kode: x.kode, row: x.row, dari: 'shift' }; });
  var adaShift = {};
  sumberShift.forEach(function (x) { adaShift[x.kode] = true; });
  Object.keys(p0PerShift).forEach(function (ks) {
    if (!ks || adaShift[ks]) return;
    sumberShift.push({ kode: ks, row: p0PerShift[ks][0].row, dari: 'p0' });
  });
  var shiftPlan = {}, slotPlan = {};
  sumberShift.forEach(function (x) {
    var row = x.row, dariP0 = x.dari === 'p0';
    var K = dariP0 ? { kodeHeader: Kp.kodeHeader, tanggal: Kp.tanggal, tim: Kp.tim, petugas: Kp.petugas, inputBy: Kp.inputBy, timestamp: Kp.website } : Ks;
    var tgl = tglSelMigP0_(row, K.tanggal);
    var hasil = shiftPlan[x.kode] = { status: 'OK', o: null, j: null, p0: [], bulan: tgl.slice(0, 7) };
    var tolak = function (alasan, saran) {
      hasil.status = 'KARANTINA'; hitung.shift.karantina++;
      catat('shift', x.kode, 'KARANTINA', alasan, saran, hasil.bulan, row.baris);
    };
    if (!tgl) return tolak('TANGGAL_KOSONG');
    if (tgl < opsi.dari || tgl > opsi.sampai) { hasil.status = 'DILEWATI'; hitung.shift.dilewati++; return; }
    // kode v1 <header>-SHF<n>.001 paling pasti; cadangan kolom Shift ("1" / "Shift 1")
    var mNo = /-SHF([123])\./.exec(x.kode) || /^(?:shift\s*)?([123])\b/i.exec(dariP0 ? '' : teksSelMigP0_(row, Ks.shift));
    var no = mNo ? Number(mNo[1]) : 0;
    if (!no) return tolak('SHIFT_TIDAK_VALID (' + (dariP0 ? x.kode : teksSelMigP0_(row, Ks.shift)) + ')');
    var kodeHeader = teksMig_(row.v[K.kodeHeader]) || x.kode.split('-SHF')[0];
    var namaTim = teksSelMigP0_(row, K.tim);
    var tim = timMigP0_(P, namaTim, kodeHeader);
    if (!tim) return tolak('TIM_TIDAK_DIKENAL (' + namaTim + ')', saranNama_(namaTim, P.daftarTim));
    var nama = pisahPetugasMigP0_(row.v[K.petugas]);
    if (!nama.length) {
      var anak = p0PerShift[x.kode] || [];
      for (var a = 0; a < anak.length && !nama.length; a++) nama = pisahPetugasMigP0_(anak[a].row.v[Kp.petugas]);
    }
    var pt = petugasMigP0_(P, nama);
    if (pt.gagal.length) {
      return tolak('PETUGAS_TIDAK_DIKENAL (' + pt.gagal.map(function (g) { return g[0]; }).join(', ') + ')',
        pt.gagal.map(function (g) { return g[1] ? g[0] + ' -> ' + g[1] : ''; }).filter(Boolean).join('; '));
    }
    var j = jadwalBarisShift_({ Tanggal: tgl, Shift: no });
    var slot = String(tim.tim_id) + '|' + tgl + '|' + no;
    if (bentrok.shift[x.kode] || slotV2[slot]) return tolak('BENTROK_V2 (shift ini sudah ada di yan_Shift dari app v2)');
    if (!pt.ok.length) catat('shift', x.kode, 'PERINGATAN', 'PETUGAS_KOSONG (shift tidak dihitung di rank petugas)', '', hasil.bulan, row.baris);
    if (pt.ok.length > YAN_PETUGAS_MAKS_) {
      catat('shift', x.kode, 'PERINGATAN', 'PETUGAS_LEBIH_2 (dipakai 2 pertama: ' + pt.ok.slice(0, 2).map(function (p) { return teksMig_(p.nama); }).join(', ') + ')', '', hasil.bulan, row.baris);
    }
    if (slotPlan[slot]) catat('shift', x.kode, 'PERINGATAN', 'SHIFT_GANDA_TIM (tim + tanggal + shift sama dengan ' + slotPlan[slot] + ')', '', hasil.bulan, row.baris);
    slotPlan[slot] = x.kode;
    if (dariP0) { hitung.shift.indukDibuat++; catat('shift', x.kode, 'INDUK_DIBUAT', 'tidak ada di ' + MIGP0_TAB_.shift + ', dibuat dari P0 ' + p0PerShift[x.kode][0].kode, '', hasil.bulan, row.baris); }
    var crew = pt.ok.slice(0, YAN_PETUGAS_MAKS_);
    var tsMs = msSelMigP0_(row, K.timestamp);
    var o = {
      'Kode Header': kodeHeader, 'Kode Shift': x.kode, ULP: opsi.ulpNama, Hari: hariDari_(tgl), Tanggal: tgl, Tim: teksMig_(tim.nama), Shift: no,
      'Jam Check-in': '', 'Terlambat (menit)': '', 'Jumlah Login': '', 'Catatan Shift': '',
      'Input Oleh': teksSelMigP0_(row, K.inputBy), Timestamp: isoMigP0_(tsMs), 'Timestamp Update': isoMigP0_(opsi.sekarangMs),
      shift_id: uuidMig_('YAN_SHIFT', x.kode), tim_id: String(tim.tim_id),
      petugas_id_1: crew[0] ? String(crew[0].petugas_id) : '', petugas_id_2: crew[1] ? String(crew[1].petugas_id) : '',
      status: 'AKTIF', revision: 1, dibuat_oleh: MIGP0_OLEH_, diubah_oleh: MIGP0_OLEH_
    };
    var jad = kolomShiftYandal_({ jam: YAN_JAM_SHIFT_[no], mulai: j.mulai }, crew.map(function (p) { return teksMig_(p.nama); }));
    Object.keys(jad).forEach(function (k) { o[k] = jad[k]; });
    hasil.o = o; hasil.j = j; hasil.row = row;
  });

  // ---- P0 ----
  var p0Plan = {};
  pilih.p0.forEach(function (x) {
    var row = x.row, ks = teksMig_(row.v[Kp.kodeShift]), sp = shiftPlan[ks];
    var hasil = p0Plan[x.kode] = { status: 'OK', o: null, sp: sp };
    var bulan = sp ? sp.bulan : tglSelMigP0_(row, Kp.tanggal).slice(0, 7);
    var tolak = function (alasan, saran) {
      hasil.status = 'KARANTINA'; hitung.p0.karantina++;
      catat('p0', x.kode, 'KARANTINA', alasan, saran, bulan, row.baris);
    };
    if (!sp) return tolak('KODE_SHIFT_KOSONG');
    if (sp.status === 'DILEWATI') { hasil.status = 'DILEWATI'; hitung.p0.dilewati++; return; }
    if (sp.status !== 'OK') return tolak('INDUK_TIDAK_LOLOS (shift ' + ks + ' karantina)');
    if (bentrok.p0[x.kode]) return tolak('BENTROK_V2 (Kode P0 sudah ada di yan_P0 dari app v2)');
    var namaAsli = teksSelMigP0_(row, Kp.namaPekerjaan);
    var jenis = pekerjaanMigP0_(P, namaAsli, teksSelMigP0_(row, Kp.pekerjaanLainnya));
    if (!jenis) return tolak('PEKERJAAN_TIDAK_DIKENAL (' + namaAsli + ')', saranNama_(namaAsli, P.daftarJenis));
    var lok = lokasiMigP0_(P, teksSelMigP0_(row, Kp.penyulang), teksSelMigP0_(row, Kp.section));
    lok.masalah.forEach(function (m) { catat('p0', x.kode, 'PERINGATAN', m[0] + ' (' + m[1] + ', teks lama dipakai)', m[2], bulan, row.baris); });
    var s = sp.o;
    var ms = { DIBUAT: msSelMigP0_(row, Kp.dibuat), PEKERJAAN: msSelMigP0_(row, Kp.pekerjaan), SESUDAH: msSelMigP0_(row, Kp.sesudah) };
    ms.SEBELUM = ms.DIBUAT;
    var websiteMs = msSelMigP0_(row, Kp.website);
    var keputusan = statusApprovalMigP0_(row.v[Kp.statusApproval]);
    var selesai = adaIsiMigP0_(row, MIGP0_FOTO_P0_.SESUDAH) || keputusan === 'Approved';
    var durasi = selesai && ms.SEBELUM !== null && ms.SESUDAH !== null ? menitP0_(ms.SESUDAH - ms.SEBELUM) : '';
    var meta = { MIGRASI: { kode: x.kode, baris: row.baris } };
    ['DIBUAT', 'SEBELUM', 'PEKERJAAN', 'SESUDAH'].forEach(function (k) {
      if (ms[k] !== null) meta[k] = { waktu: isoMigP0_(ms[k]), waktuHp: isoMigP0_(ms[k]), sumberWaktu: 'HP' };
    });
    var t1 = titikSelMigP0_(row, Kp.lat, Kp.long, Kp.koordinat), t2 = titikSelMigP0_(row, Kp.latClosing, Kp.longClosing, Kp.koordinatClosing);
    var pengali = pengaliP0_(jenis.nama, ms.DIBUAT), skor = durasi === '' ? '' : skorDurasiP0_(durasi);
    var pointV1 = angkaSelMigP0_(row.v[Kp.point]);
    var bobot = jenis.bobot;
    if (jenis.nama === YAN_PEKERJAAN_LAIN_ && keputusan === 'Approved' && pointV1 !== null && pengali) {
      bobot = Math.max(0, bulat_((pointV1 - (Number(skor) || 0)) / pengali, 2));   // bobot isian admin v1 (bobotManual)
    }
    var o = {
      'Kode Header': s['Kode Header'], 'Kode Shift': ks, 'Kode P0': x.kode, ULP: s.ULP, Hari: s.Hari, Tanggal: s.Tanggal, Tim: s.Tim,
      Shift: s.Shift, Petugas: teksSelMigP0_(row, Kp.petugas) || [s['Petugas 1'], s['Petugas 2']].filter(Boolean).join(', '),
      'Nama Pekerjaan': jenis.nama, 'Pekerjaan Lainnya': jenis.lainnya, Penyulang: lok.penyulang, Section: lok.section,
      Daerah: teksSelMigP0_(row, Kp.daerah), Catatan: teksSelMigP0_(row, Kp.catatan),
      Koordinat: t1 ? koordinatTeks_(t1.lat, t1.lng) : '', Lat: t1 ? t1.lat : '', Long: t1 ? t1.lng : '',
      'Koordinat Closing': t2 ? koordinatTeks_(t2.lat, t2.lng) : '', 'Lat Closing': t2 ? t2.lat : '', 'Long Closing': t2 ? t2.lng : '',
      'Jarak Closing P0 (m)': t1 && t2 ? jarakMeter_(t1.lat, t1.lng, t2.lat, t2.lng) : '', 'Jarak Antar P0 (m)': '',
      'Waktu Dibuat': wibMigP0_(ms.DIBUAT), 'Waktu Sebelum': wibMigP0_(ms.SEBELUM), 'Waktu Pekerjaan': wibMigP0_(ms.PEKERJAAN),
      'Waktu Sesudah': selesai ? wibMigP0_(ms.SESUDAH) : '', 'Durasi (menit)': durasi, 'Sumber Waktu': 'HP', 'Selisih Jam HP (menit)': '',
      'Waktu Diterima': wibMigP0_(websiteMs), 'Status P0': selesai ? 'SELESAI' : 'PROSES',
      'Status Approval': keputusan, 'Alasan Rejected': keputusan === 'Rejected' ? teksSelMigP0_(row, Kp.alasanRejected) : '',
      'Approved Oleh': keputusan ? teksSelMigP0_(row, Kp.approvedBy) : '',
      'Waktu Approve': keputusan ? (wibMigP0_(msSelMigP0_(row, Kp.waktuApprove)) || teksSelMigP0_(row, Kp.waktuApprove)) : '',
      'Skor Durasi': skor, Bobot: bobot, Pengali: pengali, Point: '',
      'Input Oleh': teksSelMigP0_(row, Kp.inputBy), Timestamp: isoMigP0_(websiteMs !== null ? websiteMs : ms.DIBUAT),
      'Timestamp Update': isoMigP0_(websiteMs !== null ? websiteMs : ms.DIBUAT),
      p0_id: uuidMig_('YAN_P0', x.kode), shift_id: s.shift_id, tim_id: s.tim_id, jenis_id: jenis.jenisId, section_id: lok.sectionId,
      petugas_id_1: s.petugas_id_1, petugas_id_2: s.petugas_id_2, foto_meta: JSON.stringify(meta), install_id: '',
      status: 'AKTIF', revision: 1, dibuat_oleh: MIGP0_OLEH_, diubah_oleh: MIGP0_OLEH_
    };
    var b = bulanan(sp.bulan, s.Tim);
    var rumus = hitungPointP0_({ statusP0: 'SELESAI', statusApproval: 'Approved', durasiMenit: durasi, bobot: jenis.bobot,
                                 namaPekerjaan: jenis.nama, dibuatMs: ms.DIBUAT }).point;
    if (keputusan === 'Approved') {
      o.Point = pointV1 !== null ? pointV1 : rumus;
      if (pointV1 === null) catat('p0', x.kode, 'PERINGATAN', 'POINT_KOSONG_DI_V1 (dihitung rumus v2: ' + rumus + ')', '', sp.bulan, row.baris);
      else if (jenis.nama !== YAN_PEKERJAAN_LAIN_ && Math.abs(pointV1 - rumus) > 0.01) {
        hitung.p0.pointBeda++;
        catat('p0', x.kode, 'INFO', 'POINT_BEDA (v1 ' + pointV1 + ', rumus v2 ' + rumus + ', dipakai v1)', '', sp.bulan, row.baris);
      }
      b.approved++; b.pointV1 += Number(o.Point) || 0; b.pointV2 += jenis.nama === YAN_PEKERJAAN_LAIN_ ? Number(o.Point) || 0 : rumus;
    } else if (keputusan === 'Rejected') {
      o.Point = 0; b.rejected++;
    } else if (selesai) {
      o['Status Approval'] = 'Menunggu'; hitung.p0.menunggu++; b.menunggu++;
    } else {
      Object.assign(o, tolakSistemP0_(syncSampaiYandal_(sp.j.sampai)));
      hitung.p0.rejectedSistem++; b.rejectedSistem++; b.rejected++;
    }
    b.p0++; if (selesai) b.selesai++;
    hasil.o = o; hasil.row = row;
    sp.p0.push(o);
  });

  // ---- switching + gardu (anak P0) ----
  var anakP0 = function (jenis, x, kolP0) {
    var row = x.row, kp = teksMig_(row.v[kolP0]), pp = p0Plan[kp];
    var bulan = pp && pp.sp ? pp.sp.bulan : '';
    var tolak = function (alasan, saran) { hitung[jenis].karantina++; catat(jenis, x.kode, 'KARANTINA', alasan, saran, bulan, row.baris); return null; };
    if (!pp) return tolak('INDUK_TIDAK_ADA (P0 ' + kp + ' tidak ada di ' + MIGP0_TAB_.p0 + ')');
    if (pp.status === 'DILEWATI') { hitung[jenis].dilewati++; return null; }
    if (pp.status !== 'OK') return tolak('INDUK_TIDAK_LOLOS (P0 ' + kp + ' karantina)');
    if (bentrok[jenis][x.kode]) return tolak('BENTROK_V2 (kode sudah ada di ' + MIGP0_SHEET_V2_[jenis] + ' dari app v2)');
    return pp;
  };
  var identitasAnak = function (p) {
    return { 'Kode Header': p['Kode Header'], 'Kode Shift': p['Kode Shift'], 'Kode P0': p['Kode P0'], ULP: p.ULP, Hari: p.Hari,
             Tanggal: p.Tanggal, Tim: p.Tim, Shift: p.Shift, Petugas: p.Petugas };
  };
  var rencanaSwc = [], Kw = MIGP0_KOL_.switching;
  pilih.switching.forEach(function (x) {
    var pp = anakP0('switching', x, Kw.kodeP0);
    if (!pp) return;
    var row = x.row, p = pp.o;
    var jamMs = jamSelMigP0_(row, Kw.jam, p.Tanggal, p.Shift);
    var t = titikSelMigP0_(row, Kw.lat, Kw.long, Kw.koordinat);
    var tsMs = msSelMigP0_(row, Kw.timestamp);
    var meta = { MIGRASI: { kode: x.kode, baris: row.baris } };
    if (jamMs !== null) meta.ARUS = { waktu: isoMigP0_(jamMs), waktuHp: isoMigP0_(jamMs), sumberWaktu: 'HP' };
    var o = Object.assign(identitasAnak(p), {
      'Kode Switching': x.kode, Penyulang: p.Penyulang || teksSelMigP0_(row, Kw.penyulang), Section: p.Section,
      'Nama Switching': teksSelMigP0_(row, Kw.namaSwitching) || namaSwitching_(p.Section), Catatan: '',
      Koordinat: t ? koordinatTeks_(t.lat, t.lng) : '', Lat: t ? t.lat : '', Long: t ? t.lng : '',
      'Jam Pengecekan': wibMigP0_(jamMs), 'Indikator Remote': indikatorMigP0_(row.v[Kw.remote]), 'Indikator Local': indikatorMigP0_(row.v[Kw.local]),
      'Indikator Protection': indikatorMigP0_(row.v[Kw.protection]), 'Indikator Reclose': indikatorMigP0_(row.v[Kw.reclose]),
      'Arus R (A)': angkaOrKosongMigP0_(row.v[Kw.arusR]), 'Arus S (A)': angkaOrKosongMigP0_(row.v[Kw.arusS]),
      'Arus T (A)': angkaOrKosongMigP0_(row.v[Kw.arusT]), 'Sumber Waktu': 'HP', 'Selisih Jam HP (menit)': '',
      'Waktu Diterima': wibMigP0_(tsMs), 'Input Oleh': teksSelMigP0_(row, Kw.inputBy),
      Timestamp: isoMigP0_(tsMs !== null ? tsMs : msWaktu_(p.Timestamp)), 'Timestamp Update': isoMigP0_(tsMs !== null ? tsMs : msWaktu_(p.Timestamp)),
      switching_id: uuidMig_('YAN_SWITCHING', x.kode), p0_id: p.p0_id, shift_id: p.shift_id, tim_id: p.tim_id, section_id: p.section_id,
      foto_meta: JSON.stringify(meta), install_id: '', status: 'AKTIF', revision: 1, dibuat_oleh: MIGP0_OLEH_, diubah_oleh: MIGP0_OLEH_
    });
    if (!o['Jam Pengecekan']) catat('switching', x.kode, 'PERINGATAN', 'JAM_PENGECEKAN_KOSONG', '', pp.sp.bulan, row.baris);
    rencanaSwc.push({ o: o, row: row });
    bulanan(pp.sp.bulan, p.Tim).switching++;
  });
  var rencanaGrd = [], Kg = MIGP0_KOL_.gardu;
  pilih.gardu.forEach(function (x) {
    var pp = anakP0('gardu', x, Kg.kodeP0);
    if (!pp) return;
    var row = x.row, p = pp.o;
    var noTeks = teksSelMigP0_(row, Kg.noGardu), no = parseNoGarduLama_(noTeks);
    var g = no ? P.gardu[no.nomor] : null;
    if (!g) catat('gardu', x.kode, 'PERINGATAN', 'GARDU_TIDAK_DIKENAL (' + noTeks + ', gardu_id kosong)', '', pp.sp.bulan, row.baris);
    var kap = g ? angkaGarduLama_(g['Kapasitas (kVA)']) : '';
    var nilai = {}, adaNilai = false, kolomNilai = {};
    YAN_NILAI_GARDU_.forEach(function (n, i) {
      var v = angkaSelMigP0_(row.v[Kg.nilai + i]);
      nilai[n.kunci] = v === null ? 0 : v; kolomNilai[n.kolom] = v === null ? '' : v;
      if (v !== null) adaNilai = true;
    });
    if (!adaNilai) catat('gardu', x.kode, 'PERINGATAN', 'NILAI_UKUR_KOSONG', '', pp.sp.bulan, row.baris);
    var jamMs = jamSelMigP0_(row, Kg.jam, p.Tanggal, p.Shift);
    var o = Object.assign(identitasAnak(p), {
      'Kode Pengukuran Gardu': x.kode, Penyulang: teksSelMigP0_(row, Kg.penyulang) || p.Penyulang,
      Section: teksSelMigP0_(row, Kg.section) || (g ? teksMig_(g.Section) : ''), 'No Gardu': no ? no.nomor : noTeks.toUpperCase(),
      Alamat: teksSelMigP0_(row, Kg.alamat) || (g ? teksMig_(g.Alamat) : ''), 'Kapasitas (kVA)': kap,
      Koordinat: '', Lat: '', Long: '', 'Jarak ke Gardu (m)': '', 'Jam Ukur': wibMigP0_(jamMs), 'Waktu Beban': jamMs === null ? '' : waktuBebanGardu_(jamMs),
      'Diterapkan ke Master': 'TIDAK', 'Sumber Waktu': 'HP', 'Selisih Jam HP (menit)': '', 'Waktu Diterima': p['Waktu Diterima'],
      Catatan: '', 'Input Oleh': teksSelMigP0_(row, Kg.petugas) || p['Input Oleh'], Timestamp: p.Timestamp, 'Timestamp Update': p['Timestamp Update'],
      ukur_id: uuidMig_('YAN_GARDU', x.kode), p0_id: p.p0_id, shift_id: p.shift_id, tim_id: p.tim_id, gardu_id: g ? String(g.gardu_id) : '',
      section_id: g ? teksMig_(g.section_id) : '', foto_meta: JSON.stringify({ MIGRASI: { kode: x.kode, baris: row.baris } }), install_id: '',
      status: 'AKTIF', revision: 1, dibuat_oleh: MIGP0_OLEH_, diubah_oleh: MIGP0_OLEH_
    }, kolomNilai);
    if (adaNilai) Object.assign(o, kolomHasilGardu_(hasilUkurGardu_(nilai, kap)));
    rencanaGrd.push({ o: o, row: row });
    bulanan(pp.sp.bulan, p.Tim).gardu++;
  });

  // ---- rekap shift + jarak antar P0 (mesin v2) ----
  var rencana = { shift: [], p0: [], switching: rencanaSwc.map(function (x) { return x.o; }), gardu: rencanaGrd.map(function (x) { return x.o; }) };
  Object.keys(shiftPlan).forEach(function (ks) {
    var sp = shiftPlan[ks];
    if (sp.status !== 'OK') {
      if (sp.status === 'KARANTINA' && sp.bulan) bulanan(sp.bulan, '-').karantina++;
      return;
    }
    var jarak = jarakAntarP0_(sp.p0);
    sp.p0.forEach(function (o) { if (Object.prototype.hasOwnProperty.call(jarak, o.p0_id)) o['Jarak Antar P0 (m)'] = jarak[o.p0_id]; });
    Object.assign(sp.o, hitungRekapShift_(sp.p0, sp.j, true), { 'Rekap Final': wibMigP0_(opsi.sekarangMs) });
    rencana.shift.push(sp.o);
    bulanan(sp.bulan, sp.o.Tim).shift++;
  });
  pilih.p0.forEach(function (x) { var h = p0Plan[x.kode]; if (h.status === 'OK') rencana.p0.push(h.o); });
  MIGP0_JENIS_.forEach(function (j) { hitung[j].ok = rencana[j].length; });

  // ---- antrean foto ----
  var foto = [], Kf = MIGP0_KOL_;
  var antre = function (jenis, o, row, slot, kol, folderPath, kode, targetId, bulan) {
    var src = sumberFotoMigP0_(row, kol, folderPath);
    if (!src) {
      if (adaIsiMigP0_(row, kol)) catat(jenis, kode, 'PERINGATAN', 'FOTO_TIDAK_TERBACA (' + slot + ')', '', bulan, row.baris);
      return;
    }
    foto.push({ foto_id: uuidMig_('YAN_FOTO', kode + '|' + slot), jenis: jenis === 'p0' ? 'P0' : 'SWITCHING', target_id: targetId,
                kode: kode, slot: slot, sumber_drive_id: src.id, sumber_path: src.path, status: 'ANTRE', percobaan: 0,
                drive_file_id: '', pesan: '', diubah_pada: '' });
    bulanan(bulan, o.Tim).foto++;
  };
  pilih.p0.forEach(function (x) {
    var h = p0Plan[x.kode];
    if (h.status !== 'OK') return;
    var fp = teksMig_(h.row.v[Kf.p0.folderPath]);
    Object.keys(MIGP0_FOTO_P0_).forEach(function (slot) { antre('p0', h.o, h.row, slot, MIGP0_FOTO_P0_[slot], fp, x.kode, h.o.p0_id, h.sp.bulan); });
  });
  rencanaSwc.forEach(function (x) {
    var fp = teksMig_(x.row.v[Kf.switching.folderPath]), bulan = x.o.Tanggal.slice(0, 7);
    Object.keys(MIGP0_FOTO_SWC_).forEach(function (slot) {
      antre('switching', x.o, x.row, slot, MIGP0_FOTO_SWC_[slot], fp, x.o['Kode Switching'], x.o.switching_id, bulan);
    });
  });
  hitung.foto = foto.length;
  return { judulSalah: cekJudulMigP0_(S), tidakAda: S.tidakAda || [], tanpaKode: S.tanpaKode || {}, catatan: catatan,
           rencana: rencana, foto: foto, hitung: hitung, perBulan: perBulan };
}

function angkaOrKosongMigP0_(v) { var n = angkaSelMigP0_(v); return n === null ? '' : n; }

// ---------------- persiapan + laporan ----------------

function siapkanMigrasiP0_() {
  var c = cfg_(), p = PropertiesService.getScriptProperties();
  var sumberId = teksMig_(p.getProperty('MIGP0_SUMBER_ID'));
  if (!sumberId) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'MIGP0_SUMBER_ID (spreadsheet gabungan v1 aktif + ARSIP)');
  if (!c.YANDAL_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'YANDAL_SHEET_ID');
  if ([c.YANDAL_SHEET_ID, c.MASTER_SHEET_ID, c.AUTH_SHEET_ID, c.ROW_SHEET_ID, c.GARDU_SHEET_ID].indexOf(sumberId) !== -1) {
    throw new SisiError_('MIG_SUMBER_SALAH', 'sumber = sheet v2');
  }
  var dari = teksMig_(p.getProperty('MIGP0_DARI')) || '2000-01-01', sampai = teksMig_(p.getProperty('MIGP0_SAMPAI')) || tglJakarta_(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dari) || !/^\d{4}-\d{2}-\d{2}$/.test(sampai)) throw new SisiError_('FORMAT_SALAH', 'MIGP0_DARI / MIGP0_SAMPAI (yyyy-MM-dd)');
  var opsi = { dari: dari, sampai: sampai, ulpNama: c.ULP_NAMA, sekarangMs: Date.now() };
  var ss = SpreadsheetApp.openById(sumberId);
  var S = bacaSumberMigP0_(ss, teksMig_(p.getProperty('MIGP0_TAB_UKUR')));
  var ssY = bukaSpreadsheet_(c.YANDAL_SHEET_ID);
  var t = bacaSheetYandal_(['yan_Shift', 'yan_P0', 'yan_Switching', 'yan_Gardu']);
  var M = {
    tim: tabel_('MASTER_SHEET_ID', 'db_Tim').rows, petugas: tabelPetugas_().rows,
    jenis: tabel_('MASTER_SHEET_ID', 'db_Jenis_Pekerjaan').rows, jaringan: tabel_('MASTER_SHEET_ID', 'db_Jaringan').rows,
    gardu: c.GARDU_SHEET_ID ? tabelGarduUkur_().rows : [],
    alias: ssY.getSheetByName('migp0_Alias') ? bacaSumberMig_(ssY, 'migp0_Alias').rows : [],
    v2: { shift: t.yan_Shift.rows, p0: t.yan_P0.rows, switching: t.yan_Switching.rows, gardu: t.yan_Gardu.rows }
  };
  return { c: c, p: p, S: S, M: M, opsi: opsi, ss: ss, ssY: ssY };
}

function cetakMigrasiP0_(x, r) {
  console.log('MIGRASI P0 ' + x.c.ENV + ' | sumber "' + x.ss.getName() + '" | periode ' + x.opsi.dari + ' s.d. ' + x.opsi.sampai);
  if (r.judulSalah.length) console.log('JUDUL KOLOM TIDAK COCOK (kolom bergeser?): ' + r.judulSalah.join(' | '));
  if (r.tidakAda.length) console.log('Tab tidak ada (dilewati): ' + r.tidakAda.join(', '));
  Object.keys(r.tanpaKode).forEach(function (j) { if (r.tanpaKode[j]) console.log(j + ': ' + r.tanpaKode[j] + ' baris berisi tanpa kode (dilewati)'); });
  MIGP0_JENIS_.forEach(function (j) { console.log(j + ': ' + JSON.stringify(r.hitung[j])); });
  console.log('foto antre: ' + r.foto.length + ' | KARANTINA total: ' + r.catatan.filter(function (c) { return c.status === 'KARANTINA'; }).length);
}

function tulisLaporanMigP0_(ssY, r) {
  tulisSheetMig_(ssY, 'migp0_Cek', MIGP0_CEK_KOLOM_, r.catatan.map(function (c) {
    return [c.jenis, c.kode, c.status, c.alasan, c.saran, c.bulan, c.baris];
  }));
  tulisSheetMig_(ssY, 'migp0_Ringkas', MIGP0_RINGKAS_KOLOM_, Object.keys(r.perBulan).sort().map(function (k) {
    var b = r.perBulan[k], kk = k.split('|');
    return [kk[0], kk[1], b.shift, b.p0, b.selesai, b.approved, b.rejected, b.rejectedSistem, b.menunggu, bulat_(b.pointV1, 2),
            bulat_(b.pointV2, 2), b.switching, b.gardu, b.foto, b.karantina];
  }));
}

/**
 * Editor: DRY-RUN migrasi P0. Script Property MIGP0_SUMBER_ID = spreadsheet gabungan (v1 aktif + ARSIP).
 * Opsional: MIGP0_DARI / MIGP0_SAMPAI (yyyy-MM-dd, default semua), MIGP0_TAB_UKUR, sheet migp0_Alias di SiSi_Yandal.
 * Menulis migp0_Cek + migp0_Ringkas di SiSi_Yandal. yan_* tidak diubah, sumber tidak pernah ditulis.
 */
function ADMIN_migrasiP0Cek() {
  pastikanPemilik_();
  var w = stopwatch_();
  var x = siapkanMigrasiP0_();
  w('baca');
  var r = analisisMigrasiP0_(x.S, x.M, x.opsi);
  w('analisis');
  cetakMigrasiP0_(x, r);
  tulisLaporanMigP0_(x.ssY, r);
  w('laporan');
  console.log('Laporan: migp0_Cek (' + r.catatan.length + ' baris) + migp0_Ringkas di SiSi_Yandal. yan_* TIDAK diubah. Waktu ' + JSON.stringify(w.ringkas()));
}

// ---------------- tahap A: tulis ----------------

/** Antrean migp0_Foto: tambah yang belum ada (status lama dipertahankan). */
function tambahAntreFotoMigP0_(ssY, foto) {
  var sh = ssY.getSheetByName('migp0_Foto');
  if (!sh) { sh = ssY.insertSheet('migp0_Foto'); sh.getRange(1, 1, 1, MIGP0_FOTO_KOLOM_.length).setValues([MIGP0_FOTO_KOLOM_]); }
  var ada = {};
  bacaSumberMig_(ssY, 'migp0_Foto').rows.forEach(function (q) { ada[String(q.foto_id)] = true; });
  var baru = foto.filter(function (q) { return !ada[q.foto_id]; });
  for (var i = 0; i < baru.length; i += MIGP0_BLOK_) {
    var blok = baru.slice(i, i + MIGP0_BLOK_);
    sh.getRange(sh.getLastRow() + 1, 1, blok.length, MIGP0_FOTO_KOLOM_.length)
      .setValues(blok.map(function (q) { return MIGP0_FOTO_KOLOM_.map(function (k) { return amanSheet_(q[k]); }); }));
  }
  return baru.length;
}

/**
 * Editor: TAHAP A. Syarat: judul kolom cocok, tidak ada KARANTINA (atau MIGP0_IZINKAN_KARANTINA=TRUE: yang karantina
 * DITINGGAL), baris MIGRASI yang sudah ada di yan_* masih ada di rencana (selain itu MIG_RENCANA_BERUBAH: rollback dulu).
 * Baris v2 asli (dibuat app) tidak disentuh; kode yang bentrok dengannya = karantina. Dijalankan ulang = hanya menambah
 * yang belum ada (lanjut kalau terpotong batas waktu). Shift lama yang mendapat P0 baru direkap ulang.
 */
function ADMIN_migrasiP0Jalan() {
  pastikanPemilik_();
  var mulai = Date.now(), w = stopwatch_();
  var x = siapkanMigrasiP0_();
  var r = analisisMigrasiP0_(x.S, x.M, x.opsi);
  w('analisis');
  if (r.judulSalah.length && x.p.getProperty('MIGP0_LEWATI_CEK_JUDUL') !== 'TRUE') {
    throw new SisiError_('MIG_JUDUL_SALAH', r.judulSalah.join(' | ') + '. Samakan kolom file gabungan dengan layout v1 terbaru, ' +
      'atau MIGP0_LEWATI_CEK_JUDUL=TRUE kalau judulnya memang beda tapi posisinya benar.');
  }
  var karantina = r.catatan.filter(function (c) { return c.status === 'KARANTINA'; }).length;
  if (karantina && x.p.getProperty('MIGP0_IZINKAN_KARANTINA') !== 'TRUE') {
    throw new SisiError_('MIG_MASIH_KARANTINA', karantina + ' baris. Bereskan lewat migp0_Alias / file gabungan lalu ADMIN_migrasiP0Cek, ' +
      'atau set Script Property MIGP0_IZINKAN_KARANTINA=TRUE untuk meninggalkannya.');
  }
  var hasil = denganLock_(function () {
    var t = bacaSheetYandal_(['yan_Shift', 'yan_P0', 'yan_Switching', 'yan_Gardu']);
    var out = { terpotong: false }, terdampak = {}, shiftAda = {}, idAda = {};
    MIGP0_JENIS_.forEach(function (j) {
      var tb = t[MIGP0_SHEET_V2_[j]], kolId = MIGP0_ID_V2_[j], kolKode = MIGP0_KODE_V2_[j];
      var rencanaId = {}, rencanaKode = {};
      r.rencana[j].forEach(function (o) { rencanaId[o[kolId]] = true; rencanaKode[teksMig_(o[kolKode])] = true; });
      var ada = idAda[j] = {};
      tb.rows.forEach(function (row) {
        var id = String(row[kolId] || '');
        if (String(row.dibuat_oleh) !== MIGP0_OLEH_) {
          if (rencanaKode[teksMig_(row[kolKode])]) throw new SisiError_('MIG_KODE_BENTROK', tb.nama + ' baris ' + row._baris + ' (' + row[kolKode] + ') dibuat app v2');
          return;
        }
        if (!rencanaId[id]) {
          throw new SisiError_('MIG_RENCANA_BERUBAH', tb.nama + ' baris ' + row._baris + ' (' + row[kolKode] + ') tidak ada di rencana sekarang. ' +
            'Rollback dulu (ADMIN_migrasiP0Hapus).');
        }
        ada[id] = true;
      });
      if (j === 'shift') shiftAda = Object.assign({}, ada);   // shift lama (sebelum jalan ini)
      var baru = r.rencana[j].filter(function (o) { return !ada[o[kolId]]; });
      var ditulis = 0;
      for (var i = 0; i < baru.length && !out.terpotong; i += MIGP0_BLOK_) {
        if (Date.now() - mulai > MIGP0_BATAS_MS_) { out.terpotong = true; break; }
        var blok = baru.slice(i, i + MIGP0_BLOK_), akhir = tb.sheet.getLastRow();
        var data = blok.map(function (o, k) { o.No = akhir + k; return barisDariObjek_(tb.header, o); });
        tb.sheet.getRange(akhir + 1, 1, data.length, tb.header.length).setValues(data);
        blok.forEach(function (o) {
          ada[o[kolId]] = true; ditulis++;
          if (j === 'p0' && shiftAda[o.shift_id]) terdampak[o.shift_id] = true;   // shift lama dapat P0 baru = rekap ulang
        });
      }
      out[j] = { sudahAda: Object.keys(ada).length - ditulis, ditulis: ditulis };
    });
    // antrean foto hanya untuk baris yang sudah tertulis
    var fotoSiap = r.foto.filter(function (q) { return (q.jenis === 'P0' ? idAda.p0 : idAda.switching)[q.target_id]; });
    out.foto = { antreBaru: tambahAntreFotoMigP0_(x.ssY, fotoSiap), total: r.foto.length };
    var ids = Object.keys(terdampak);
    out.rekapUlang = ids.length ? rekapShiftId_(ids, Date.now(), MIGP0_OLEH_).direkap : 0;
    return out;
  }, 60000);
  w('tulis');
  if (!hasil.terpotong) {
    var peta = [];
    MIGP0_JENIS_.forEach(function (j) {
      r.rencana[j].forEach(function (o) { peta.push([j, o[MIGP0_KODE_V2_[j]], o[MIGP0_ID_V2_[j]]]); });
    });
    tulisSheetMig_(x.ssY, 'migp0_Peta', ['jenis', 'kode_lama', 'id_v2'], peta);
  }
  tulisLaporanMigP0_(x.ssY, r);
  w('laporan');
  console.log('MIGRASI P0 TAHAP A ' + x.c.ENV + ': ' + JSON.stringify(hasil) + (karantina ? ' | karantina DITINGGAL: ' + karantina : '') +
    ' | waktu ' + JSON.stringify(w.ringkas()));
  console.log(hasil.terpotong ? 'Batas waktu: jalankan ADMIN_migrasiP0Jalan lagi untuk melanjutkan.' :
    'Lanjut: ADMIN_migrasiP0Foto (berulang / ADMIN_migrasiP0FotoOtomatis).');
}

// ---------------- tahap B: foto ----------------

var MIGP0_FOTO_SIBUK_ = 'MIGP0_FOTO_SIBUK';

/**
 * Editor / pemicu: TAHAP B, salin foto antrean migp0_Foto (ANTRE / ULANG) maks ~4,5 menit per jalan, ke folder foto P0
 * v2 (Foto Yandal / YYYY / MM / DD / <Tim> / <Kode Shift>), nama <kode>_<SLOT>.jpg + penanda sisi-foto:<id>-<SLOT>.
 * Verifikasi sha256 + ukuran salinan = sumber, salinan wajib privat. Baru setelah itu kolom foto yan_P0 / yan_Switching
 * diisi (dibaca ulang di dalam lock: slot yang sudah terisi tidak ditimpa). Gagal = ULANG (maks 3x) lalu GAGAL.
 */
function ADMIN_migrasiP0Foto(e) {
  pastikanPemilik_();
  return jalanPemicu_('ADMIN_migrasiP0Foto', e, migrasiP0FotoPemicu_);   // v0.84.0: waktu jalan dicatat + rem kuota
}

/** v0.84.0: isi ADMIN_migrasiP0Foto (dibungkus jalanPemicu_). */
function migrasiP0FotoPemicu_() {
  var p = PropertiesService.getScriptProperties(), mulai = Date.now();
  var boleh = denganLock_(function () {
    var sibuk = Number(p.getProperty(MIGP0_FOTO_SIBUK_) || 0);
    if (sibuk && mulai - sibuk < 360000) return false;
    p.setProperty(MIGP0_FOTO_SIBUK_, String(mulai));
    return true;
  });
  if (!boleh) { console.log('MIGRASI FOTO P0: jalan lain masih berlangsung, dilewati.'); return; }
  try {
    migrasiFotoP0Inti_(mulai);
  } finally {
    p.deleteProperty(MIGP0_FOTO_SIBUK_);
  }
}

function kolomFotoMigP0_(jenis, slot) { return jenis === 'P0' ? YAN_KOLOM_FOTO_P0_[slot] : kolomFotoSwitching_(slot); }

function migrasiFotoP0Inti_(mulai) {
  var c = cfg_();
  if (!c.YANDAL_FOTO_FOLDER_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'YANDAL_FOTO_FOLDER_ID');
  var ssY = bukaSpreadsheet_(c.YANDAL_SHEET_ID);
  var shF = ssY.getSheetByName('migp0_Foto');
  if (!shF) throw new SisiError_('SHEET_TIDAK_ADA', 'migp0_Foto (jalankan ADMIN_migrasiP0Jalan dulu)');
  var antre = bacaSumberMig_(ssY, 'migp0_Foto');
  var todo = antre.rows.filter(function (q) {
    var st = String(q.status);
    return (st === 'ANTRE' || st === 'ULANG') && (Number(q.percobaan) || 0) < 3;
  });
  if (!todo.length) { hapusPemicuMigFotoP0_(); console.log('Antrean foto P0 kosong. Pemicu otomatis (kalau ada) dihapus.'); return; }
  var t = bacaSheetYandal_(['yan_P0', 'yan_Switching']);
  var byId = { P0: {}, SWITCHING: {} };
  t.yan_P0.rows.forEach(function (r) { if (r.p0_id) byId.P0[String(r.p0_id)] = r; });
  t.yan_Switching.rows.forEach(function (r) { if (r.switching_id) byId.SWITCHING[String(r.switching_id)] = r; });
  var props = PropertiesService.getScriptProperties();
  var akarId = teksMig_(props.getProperty('MIGP0_FOTO_AKAR_ID')) || teksMig_(props.getProperty('MIG_FOTO_AKAR_ID'));
  var akar = null, cacheFolder = {}, memoFolder = {}, memoIsi = {};
  if (todo.some(function (q) { return !q.sumber_drive_id && q.sumber_path; })) {
    if (!akarId) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'MIGP0_FOTO_AKAR_ID (folder Drive foto AppSheet lama)');
    akar = DriveApp.getFolderById(akarId);
  }
  var hasil = [], selesai = 0, gagal = 0, ulang = 0, n;
  for (n = 0; n < todo.length && Date.now() - mulai < MIGP0_BATAS_MS_; n++) {
    var q = todo[n];
    var tandai = function (status, pesan, driveId) {
      q.status = status; q.pesan = pesan || ''; q.diubah_pada = new Date();
      if (driveId) q.drive_file_id = driveId;
      if (status === 'ULANG' || status === 'GAGAL') q.percobaan = (Number(q.percobaan) || 0) + 1;
      if (status === 'GAGAL') q.percobaan = 3;
      if (status === 'ULANG' && q.percobaan >= 3) q.status = 'GAGAL';
      if (q.status === 'GAGAL') gagal++; else if (q.status === 'ULANG') ulang++; else selesai++;
    };
    try {
      var target = (byId[String(q.jenis)] || {})[String(q.target_id)];
      if (!target) { tandai('GAGAL', 'TARGET_TIDAK_ADA'); continue; }
      var slot = String(q.slot), kol = kolomFotoMigP0_(String(q.jenis), slot);
      if (!kol) { tandai('GAGAL', 'SLOT_TIDAK_DIKENAL'); continue; }
      if (teksMig_(target[kol.id])) { tandai('SELESAI', 'slot sudah terisi', teksMig_(target[kol.id])); continue; }
      var src = q.sumber_drive_id ? DriveApp.getFileById(String(q.sumber_drive_id)) : fileDariPathMig_(akar, String(q.sumber_path), cacheFolder);
      if (!src) { tandai('GAGAL', 'FILE_LAMA_TIDAK_ADA (' + String(q.sumber_path).slice(-80) + ')'); continue; }
      var mS = metaFotoMig_(src.getId());
      if (!mS) {
        var bS = src.getBlob().getBytes();
        mS = { sha: bytesKeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bS)), ukuran: bS.length, mime: src.getMimeType() };
      }
      var mime = String(mS.mime || src.getMimeType() || '');
      if (mime.indexOf('image/') !== 0) { tandai('GAGAL', 'BUKAN_GAMBAR (' + mime + ')'); continue; }
      var folder = folderFoto_(c.YANDAL_FOTO_FOLDER_ID, pathFotoP0_(target), memoFolder);
      var nama = namaFotoRow_(q.kode, slot, 1);
      var isi = isiFolderMig_(folder, '#' + folder.getId(), memoIsi);
      var salin = isi ? (isi[nama] || null) : null;
      if (!isi) { var it = folder.getFilesByName(nama); salin = it.hasNext() ? it.next() : null; }
      var mC = null;
      if (!salin) {
        var hs = salinFotoMig_(src, nama, folder);
        salin = hs.file; mC = hs.meta;
        if (isi) isi[nama] = salin;
      }
      try { salin.setDescription(PENANDA_FOTO_ + q.target_id + '-' + slot); } catch (eD) { /* tanpa penanda */ }
      if (!mC) mC = metaFotoMig_(salin.getId());
      if (!mC) { var bC = salin.getBlob().getBytes(); mC = { sha: bytesKeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bC)), ukuran: bC.length }; }
      var buang = function (pesan) { salin.setTrashed(true); if (isi) delete isi[nama]; tandai('ULANG', pesan); };
      if (mC.sha !== mS.sha || mC.ukuran !== mS.ukuran) { buang('SALINAN_BEDA (sha/ukuran)'); continue; }
      var akses = null;
      try { akses = salin.getSharingAccess(); } catch (e1) { akses = null; }
      if (akses !== null && akses !== DriveApp.Access.PRIVATE) {
        try { salin.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); akses = salin.getSharingAccess(); } catch (e2) { /* shared drive */ }
      }
      if (akses !== null && akses !== DriveApp.Access.PRIVATE) { buang('SALINAN_TIDAK_PRIVAT (' + akses + ')'); continue; }
      hasil.push({ q: q, kol: kol, slot: slot, fileId: salin.getId(), nama: nama, sha: mS.sha, ukuran: mS.ukuran });
      tandai('SELESAI', '', salin.getId());
    } catch (err) {
      tandai('ULANG', String(err && err.message || err).slice(0, 200));
    }
  }
  var diproses = todo.slice(0, n), terisi = 0, dibuang = 0;
  denganLock_(function () {
    // dibaca ulang di dalam lock: salin foto bisa makan menit, slot bisa sudah diisi jalan lain
    var segar = bacaSheetYandal_(['yan_P0', 'yan_Switching']);
    var tb = { P0: segar.yan_P0, SWITCHING: segar.yan_Switching }, cari = { P0: {}, SWITCHING: {} };
    segar.yan_P0.rows.forEach(function (r) { if (r.p0_id) cari.P0[String(r.p0_id)] = r; });
    segar.yan_Switching.rows.forEach(function (r) { if (r.switching_id) cari.SWITCHING[String(r.switching_id)] = r; });
    hasil.forEach(function (h) {
      var row = cari[String(h.q.jenis)][String(h.q.target_id)];
      var lama = row ? teksMig_(row[h.kol.id]) : '';
      if (!row || (lama && lama !== h.fileId)) {
        h.q.pesan = row ? 'SLOT_SUDAH_TERISI (salinan migrasi dibuang)' : 'TARGET_HILANG'; h.q.drive_file_id = lama;
        try { DriveApp.getFileById(h.fileId).setTrashed(true); } catch (eT) { /* dibiarkan */ }
        dibuang++;
        return;
      }
      var meta = row._metaMig || (row._metaMig = metaP0_(row));
      meta[h.slot] = Object.assign({}, meta[h.slot] || {}, { sha256: h.sha, ukuran: h.ukuran, sumber: MIGP0_OLEH_ });
      var u = row._ubah || (row._ubah = {});
      u[h.kol.foto] = h.nama;
      u[h.kol.link] = 'https://drive.google.com/file/d/' + h.fileId + '/view';
      u[h.kol.id] = h.fileId;
      u.foto_meta = JSON.stringify(meta);
      terisi++;
    });
    ['P0', 'SWITCHING'].forEach(function (j) { tulisKolomBerubah_(tb[j], tb[j].rows); });   // revision tidak naik (seperti upload foto)
    diproses.forEach(function (q) {
      q._ubah = { status: q.status, percobaan: q.percobaan, drive_file_id: q.drive_file_id || '', pesan: q.pesan, diubah_pada: q.diubah_pada };
    });
    tulisKolomBerubah_({ sheet: shF, header: antre.kolom }, diproses);
  }, 60000);
  var sisa = todo.length - selesai - gagal;
  console.log('MIGRASI FOTO P0: selesai ' + selesai + ', ulang ' + ulang + ', gagal ' + gagal + ', sisa antrean ~' + sisa +
    ' | kolom foto diisi ' + terisi + (dibuang ? ', salinan dibuang ' + dibuang : '') + ' | ' + Math.round((Date.now() - mulai) / 1000) + ' s');
  if (sisa <= 0) { hapusPemicuMigFotoP0_(); console.log('Antrean foto P0 selesai.'); }
}

function hapusPemicuMigFotoP0_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'ADMIN_migrasiP0Foto') ScriptApp.deleteTrigger(t);
  });
}

/** Editor: jalankan ADMIN_migrasiP0Foto tiap 10 menit sampai antrean habis (pemicu dihapus sendiri). */
function ADMIN_migrasiP0FotoOtomatis() {
  pastikanPemilik_();
  hapusPemicuMigFotoP0_();
  ScriptApp.newTrigger('ADMIN_migrasiP0Foto').timeBased().everyMinutes(10).create();
  console.log('Pemicu ADMIN_migrasiP0Foto tiap 10 menit dipasang. Pantau migp0_Foto; berhenti: ADMIN_migrasiP0FotoBerhenti.');
}

/** Editor: hentikan pemicu otomatis salin foto P0. */
function ADMIN_migrasiP0FotoBerhenti() {
  pastikanPemilik_();
  hapusPemicuMigFotoP0_();
  console.log('Pemicu ADMIN_migrasiP0Foto dihapus.');
}

// ---------------- rollback ----------------

/**
 * Editor: hapus SEMUA baris dibuat_oleh MIGRASI di yan_Shift / yan_P0 / yan_Switching / yan_Gardu, kosongkan migp0_Foto
 * + migp0_Peta. Wajib Script Property MIGP0_IZINKAN_HAPUS=TRUE (dihapus sesudah jalan, sekali pakai). Baris app v2 tetap
 * (ditulis ulang rapat ke atas, isi sama). Foto salinan di Drive TIDAK dihapus: migrasi ulang memakai file yang sama.
 */
function ADMIN_migrasiP0Hapus() {
  pastikanPemilik_();
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty('MIGP0_IZINKAN_HAPUS') !== 'TRUE') {
    throw new SisiError_('MIG_HAPUS_DIKUNCI', 'set Script Property MIGP0_IZINKAN_HAPUS=TRUE dulu (sekali pakai)');
  }
  var c = cfg_();
  var hasil = denganLock_(function () {
    var t = bacaSheetYandal_(['yan_Shift', 'yan_P0', 'yan_Switching', 'yan_Gardu']), out = {};
    MIGP0_JENIS_.forEach(function (j) {
      var tb = t[MIGP0_SHEET_V2_[j]], akhir = tb.sheet.getLastRow(), lebar = tb.header.length;
      out[j] = 0;
      if (akhir < 2) return;
      var rg = tb.sheet.getRange(2, 1, akhir - 1, lebar), nilai = rg.getValues(), iOleh = tb.header.indexOf('dibuat_oleh');
      var sisa = nilai.filter(function (b) { return String(b[iOleh]) !== MIGP0_OLEH_; });
      out[j] = nilai.length - sisa.length;
      if (!out[j]) return;
      var kosong = [];
      for (var i = 0; i < lebar; i++) kosong.push('');
      rg.setValues(sisa.map(function (b) { return b.map(amanSheet_); }).concat(nilai.slice(sisa.length).map(function () { return kosong.slice(); })));
    });
    return out;
  }, 60000);
  var ssY = bukaSpreadsheet_(c.YANDAL_SHEET_ID);
  if (ssY.getSheetByName('migp0_Foto')) tulisSheetMig_(ssY, 'migp0_Foto', MIGP0_FOTO_KOLOM_, []);
  if (ssY.getSheetByName('migp0_Peta')) tulisSheetMig_(ssY, 'migp0_Peta', ['jenis', 'kode_lama', 'id_v2'], []);
  p.deleteProperty('MIGP0_IZINKAN_HAPUS');
  hapusPemicuMigFotoP0_();
  console.log('ROLLBACK MIGRASI P0 ' + c.ENV + ': baris dihapus ' + JSON.stringify(hasil) + '. Foto salinan di Drive dibiarkan.');
}

// ---------------- cek konfigurasi ----------------

/**
 * v0.82.1: bagian "Migrasi P0" di ADMIN_cekKonfigurasi. Hanya membaca. Property kosong = info (migrasi opsional),
 * terisi tapi tidak bisa dibuka / format salah = masalah. Hasil: jumlah masalah.
 */
function cekKonfigMigrasiP0_(c) {
  var p = PropertiesService.getScriptProperties(), masalah = 0;
  var ambil = function (k) { return teksMig_(p.getProperty(k)); };
  var salah = function (pesan) { masalah++; console.warn('Migrasi P0: ' + pesan); };
  console.log('--- Migrasi P0 v1 -> v2 (ADMIN_migrasiP0Cek) ---');
  var sumberId = ambil('MIGP0_SUMBER_ID');
  if (!sumberId) {
    console.log('MIGP0_SUMBER_ID kosong: migrasi P0 belum disiapkan. Isi dengan ID spreadsheet gabungan v1 (aktif + ARSIP). ' +
      'Opsional: MIGP0_DARI, MIGP0_SAMPAI (yyyy-MM-dd), MIGP0_FOTO_AKAR_ID, MIGP0_TAB_UKUR.');
  } else if ([c.YANDAL_SHEET_ID, c.MASTER_SHEET_ID, c.AUTH_SHEET_ID, c.ROW_SHEET_ID, c.GARDU_SHEET_ID].indexOf(sumberId) !== -1) {
    salah('MIGP0_SUMBER_ID sama dengan spreadsheet v2 (harus file gabungan v1)');
  } else {
    try {
      var ss = SpreadsheetApp.openById(sumberId);
      var nama = ss.getName ? ss.getName() : sumberId;
      var info = [];
      MIGP0_JENIS_.forEach(function (j) {
        var sh = null;
        try { sh = j === 'gardu' ? tabUkurMigP0_(ss, ambil('MIGP0_TAB_UKUR')) : ss.getSheetByName(MIGP0_TAB_[j]); } catch (eT) { sh = null; }
        var label = j === 'gardu' ? 'Pengukuran Gardu' : MIGP0_TAB_[j];
        if (!sh) {
          if (j === 'shift' || j === 'p0') salah('tab ' + label + ' tidak ada di "' + nama + '" (wajib)');
          else info.push(label + ': tidak ada (dilewati)');
          return;
        }
        info.push(label + (j === 'gardu' ? ' ("' + sh.getName() + '")' : '') + ': ' + Math.max(0, sh.getLastRow() - 1) + ' baris');
      });
      console.log('MIGP0_SUMBER_ID: "' + nama + '" | ' + info.join(' | '));
    } catch (e) {
      salah('MIGP0_SUMBER_ID tidak bisa dibuka (' + (e.message || e) + '). Bagikan file ke akun pemilik script.');
    }
  }
  var dari = ambil('MIGP0_DARI'), sampai = ambil('MIGP0_SAMPAI');
  [['MIGP0_DARI', dari], ['MIGP0_SAMPAI', sampai]].forEach(function (x) {
    if (x[1] && !/^\d{4}-\d{2}-\d{2}$/.test(x[1])) salah(x[0] + ' "' + x[1] + '" harus yyyy-MM-dd');
  });
  if (dari && sampai && dari > sampai) salah('MIGP0_DARI lebih besar dari MIGP0_SAMPAI');
  console.log('Periode migrasi P0: ' + (dari || 'semua') + ' s.d. ' + (sampai || 'hari ini'));
  var akarId = ambil('MIGP0_FOTO_AKAR_ID'), cadangan = !akarId && !!ambil('MIG_FOTO_AKAR_ID');
  akarId = akarId || ambil('MIG_FOTO_AKAR_ID');
  if (!akarId) {
    console.log('MIGP0_FOTO_AKAR_ID kosong: foto lama berupa path AppSheet tidak bisa disalin (foto ber-link Drive tetap bisa)');
  } else {
    try {
      var akar = DriveApp.getFolderById(akarId);
      console.log((cadangan ? 'MIG_FOTO_AKAR_ID (cadangan)' : 'MIGP0_FOTO_AKAR_ID') + ': folder "' + akar.getName() + '"');
    } catch (eA) { salah((cadangan ? 'MIG_FOTO_AKAR_ID' : 'MIGP0_FOTO_AKAR_ID') + ' tidak bisa dibuka (' + (eA.message || eA) + ')'); }
  }
  if (!c.YANDAL_FOTO_FOLDER_ID) console.log('Tujuan foto migrasi = YANDAL_FOTO_FOLDER_ID (masih kosong)');
  ['MIGP0_IZINKAN_KARANTINA', 'MIGP0_LEWATI_CEK_JUDUL', 'MIGP0_IZINKAN_HAPUS'].forEach(function (k) {
    if (ambil(k) === 'TRUE') console.warn(k + ' = TRUE (aktif)');
  });
  return masalah;
}
