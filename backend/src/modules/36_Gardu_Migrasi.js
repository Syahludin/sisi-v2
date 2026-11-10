/**
 * v0.68.0 (keputusan Master Guswan 9 Okt 2026): migrasi gardu lama ke db_Gardu SEBELUM BA Pengoperasian v2 dipakai,
 * supaya nomor gardu baru melanjutkan nomor lama dan daftar gardu AKTIF di HP berisi data asli.
 *
 * Sumber (spreadsheet GARDU_LAMA_SHEET_ID, kosong = GARDU_SHEET_ID; HANYA DIBACA, tidak pernah ditulis):
 *   - Master_Gardu : 1 baris per gardu, data mulai baris 12, nomor kolom di baris 11 (posisi kolom sama v1 MG_COL).
 *   - Rekap Gardu  : riwayat BA lama (B Nomor Gardu, D Tanggal, E Jenis Pekerjaan, ...), dipakai untuk status gardu
 *                    (Pembongkaran Sementara -> TIDAK AKTIF, Pembongkaran -> BONGKAR RAMPUNG), BA Pengoperasian /
 *                    BA Terakhir / Jumlah BA, OwnerId + External Reference, dan gardu yang ada di Rekap tapi tidak
 *                    ada di Master_Gardu.
 * Tujuan: db_Gardu (struktur dikunci, cekStrukturGardu_). Hanya MENAMBAH baris untuk No Gardu yang belum ada di
 * db_Gardu (baris yang sudah ada tidak pernah ditimpa), jadi aman dijalankan ulang. Satu setValues dalam lock.
 *
 * ADMIN_cekMigrasiGardu = pratinjau (tidak menulis apa pun). ADMIN_migrasiGardu = tulis (ditolak bila ada masalah
 * yang memblokir, mis. No Gardu ganda di Master_Gardu atau struktur sumber tidak dikenali).
 */
var MIGRASI_GARDU_ = {
  master: {
    tab: 'Master_Gardu', barisNomor: 11, barisData: 12, lebar: 156,
    // 1-based, sama v1 (Master-Gardu-Mobile.js + SIE-BA-Code.js MG_COL)
    kol: {
      ulp: 2, gardu: 3, alamat: 4, penyulang: 5, section: 6, lat: 9, lng: 10, konstruksi: 11, merk: 12, kva: 13,
      seri: 14, tahun: 15, merkPhb: 17, seriPhb: 18, tahunPhb: 19, tglUkur: 21, kepemilikan: 22, jurusan: 24,
      arus: 111, bebanKva: 153, persen: 155
    },
    judul: { gardu: 'GARDU', alamat: 'ALAMAT', penyulang: 'PENYULANG' }
  },
  rekap: {
    tab: 'Rekap Gardu', barisHeaderAkhir: 9, barisData: 10, lebarMin: 47,
    // 1-based, sama v1 (getLinkWaBeritaAcara + updateMasterGarduDariBA)
    kol: {
      gardu: 2, tanggal: 4, jenis: 5, kva: 6, merk: 7, seri: 8, tahun: 9, konstruksi: 10, alamat: 11, penyulang: 12,
      section: 13, lat: 17, lng: 18, jurusan: 19, kepemilikan: 20, owner: 21, extref: 22, seriPhb: 25, merkPhb: 26,
      tahunPhb: 27, kvaS: 37, merkS: 38, seriS: 39, tahunS: 40, asalS: 41, seriPhbS: 45, merkPhbS: 46, tahunPhbS: 47
    },
    aliasIdBa: ['idba'],
    aliasNoBaFull: ['nobafull', 'nomorbafull']
  },
  oleh: 'admin-tools',
  sumberMaster: 'MIGRASI V1 MASTER_GARDU',
  sumberRekap: 'MIGRASI V1 REKAP GARDU'
};

function normJudul_(v) { return String(v === null || v === undefined ? '' : v).trim().toLowerCase().replace(/[^a-z0-9]/g, ''); }

function teksGarduLama_(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

/** "TB0414" / "tb 414" / "TB-0414" -> { nomor: 'TB0414', prefix: 'TB', angka: 414, dinormalkan }. Bukan nomor gardu = null. */
function parseNoGarduLama_(v) {
  var asli = teksGarduLama_(v).toUpperCase();
  var m = asli.replace(/[\s\-_.]/g, '').match(/^([A-Z]{2})(\d{1,5})$/);
  if (!m) return null;
  var angka = parseInt(m[2], 10);
  if (!(angka > 0)) return null;
  var s = String(angka);
  while (s.length < 4) s = '0' + s;
  var nomor = m[1] + s;
  return { nomor: nomor, prefix: m[1], angka: angka, dinormalkan: nomor !== asli };
}

/** Angka dari teks tampilan sheet: "1.234,5" / "85,3%" / "100 kVA" -> number, tidak terbaca = ''. */
function angkaGarduLama_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : '';
  var s = teksGarduLama_(v).replace(/%|kva/gi, '').replace(/\s/g, '');
  if (!s) return '';
  if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.indexOf(',') !== -1) s = s.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return '';
  return Number(s);
}

/** Tahun 4 digit (1950 s.d. tahun depan), selain itu ''. */
function tahunLama_(v) {
  var n = angkaGarduLama_(v);
  if (n === '' || Math.floor(n) !== n) return '';
  return n >= 1950 && n <= new Date().getFullYear() + 1 ? n : '';
}

/** Jurusan: angka kalau terbaca, selain itu teks apa adanya. */
function angkaAtauTeks_(v) {
  var n = angkaGarduLama_(v);
  return n === '' ? teksGarduLama_(v) : n;
}

function angkaKoordinatLama_(v) {
  var s = teksGarduLama_(v);
  if (!s) return '';
  var negatif = s.indexOf('-') !== -1 || /[SW]/i.test(s);
  var m = s.replace(/,/g, '.').match(/\d+(?:\.\d+)?/);
  if (!m) return '';
  var n = parseFloat(m[0]);
  return negatif ? -n : n;
}

/** Lat / Long lama -> { lat, lng } di area Babel (tertukar = ditukar balik), atau { masalah }. Kosong dua-duanya = {}. */
function koordinatLama_(latRaw, lngRaw) {
  var la = teksGarduLama_(latRaw), ln = teksGarduLama_(lngRaw);
  if (!la && !ln) return {};
  if (la && !ln) {
    var bag = la.split(/\s*[,;]\s*|\s+/);
    if (bag.length >= 2) { la = bag[0]; ln = bag.slice(1).join(' '); }
  }
  var lat = angkaKoordinatLama_(la), lng = angkaKoordinatLama_(ln);
  if (lat === '' || lng === '') return { masalah: 'tidak lengkap' };
  var A = AREA_BABEL_;
  var dalam = function (a, b) { return a >= A.latMin && a <= A.latMax && b >= A.lngMin && b <= A.lngMax; };
  if (!dalam(lat, lng) && dalam(lng, lat)) { var t = lat; lat = lng; lng = t; }
  if (!dalam(lat, lng)) return { masalah: 'di luar Babel (' + lat + ', ' + lng + ')' };
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

/** Tanggal lama (Date dari getValues, atau teks dd/mm/yyyy / yyyy-mm-dd) -> 'yyyy-MM-dd', tidak terbaca = ''. */
function tanggalLama_(nilai, tampil) {
  // cek tipe lewat toString, bukan instanceof (Date dari Sheets / konteks lain tetap dikenali)
  if (Object.prototype.toString.call(nilai) === '[object Date]' && !isNaN(nilai.getTime())) return tglJakarta_(nilai);
  var s = teksGarduLama_(tampil !== undefined ? tampil : nilai);
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) {
    var d = Number(m[1]), b = Number(m[2]), y = Number(m[3]);
    if (b >= 1 && b <= 12 && d >= 1 && d <= 31) return y + '-' + pad2_(b) + '-' + pad2_(d);
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
}

/** Jenis Pekerjaan BA lama -> kelompok. Switching / peralatan lain = 'LAIN' (tidak memengaruhi status gardu). */
function jenisBaLama_(teks) {
  var t = String(teks || '').toLowerCase();
  if (/switch|lbs|recloser|\bacr\b/.test(t)) return 'LAIN';
  if (t.indexOf('sementara') !== -1) return 'BONGKAR_SEMENTARA';
  if (t.indexOf('bongkar') !== -1) return 'BONGKAR';
  if (t.indexOf('operasi') !== -1) return 'OPERASI';
  if (t.indexOf('ganti') !== -1) return 'GANTI';
  if (t.indexOf('periksa') !== -1 || t.indexOf('meriksa') !== -1) return 'PERIKSA';
  return 'LAIN';
}

/** Status sesudah urutan BA (urut tanggal). Tidak ada BA yang mengubah status = null (pemanggil memakai AKTIF). */
function statusDariBaLama_(daftar) {
  var st = null;
  daftar.forEach(function (b) {
    if (b.kelompok === 'OPERASI' || b.kelompok === 'GANTI') st = 'AKTIF';
    else if (b.kelompok === 'BONGKAR_SEMENTARA') st = 'TIDAK AKTIF';
    else if (b.kelompok === 'BONGKAR') st = 'BONGKAR RAMPUNG';
  });
  return st;
}

/** Bagian depan nama section (sebelum " - " pertama), huruf kecil. "FCO Jar Air Sagu - PG0001 - PG0004" -> "fco jar air sagu". */
function depanSection_(v) { return teksGarduLama_(v).split(/\s+-\s+/)[0].toLowerCase(); }
function belakangSection_(v) { var b = teksGarduLama_(v).split(/\s+-\s+/); return b.length > 1 ? b[b.length - 1].toLowerCase() : ''; }

/**
 * v0.68.2 (keputusan Master Guswan 9 Okt 2026): section db_Jaringan = versi BENAR (singkat), Master_Gardu = versi lengkap
 * dengan format sama ("A - B - C" di Master, "A - C" di db_Jaringan). Dicocokkan lewat BAGIAN DEPAN (A):
 *   1. sama persis (penyulang + section) -> pakai itu;
 *   2. bagian depan sama di penyulang yang sama: 1 calon -> pakai; > 1 calon -> yang bagian belakangnya juga sama;
 *   3. penyulang tidak punya calon: bagian depan unik di semua penyulang -> pakai (penyulang ikut db_Jaringan).
 * Hasil { sec } atau { alasan: 'TIDAK_ADA' | 'AMBIGU' }. Teks asli tetap disimpan di PTS/LBS.
 */
function cocokSectionLama_(teks, penyulang, jaringan) {
  var s = teksGarduLama_(teks);
  if (!s) return {};
  var p = teksGarduLama_(penyulang).toLowerCase(), kecil = s.toLowerCase();
  var diPeny = jaringan.filter(function (r) { return String(r.penyulang).trim().toLowerCase() === p; });
  var persis = diPeny.filter(function (r) { return teksGarduLama_(r.section).toLowerCase() === kecil; });
  if (persis.length === 1) return { sec: persis[0] };
  var depan = depanSection_(s), belakang = belakangSection_(s);
  var calon = diPeny.filter(function (r) { return depanSection_(r.section) === depan; });
  if (calon.length === 1) return { sec: calon[0] };
  if (calon.length > 1) {
    var pas = calon.filter(function (r) { return belakang && belakangSection_(r.section) === belakang; });
    return pas.length === 1 ? { sec: pas[0] } : { alasan: 'AMBIGU', calon: calon.length };
  }
  var semua = jaringan.filter(function (r) { return depanSection_(r.section) === depan; });
  if (semua.length === 1) return { sec: semua[0], penyulangBeda: true };
  return { alasan: semua.length ? 'AMBIGU' : 'TIDAK_ADA', calon: semua.length };
}

/** Cetak daftar panjang di log per 40 butir (satu baris log Apps Script terbatas panjangnya). */
function cetakDaftar_(judul, daftar) {
  for (var i = 0; i < daftar.length; i += 40) {
    console.warn(judul + ' [' + (i + 1) + '-' + Math.min(i + 40, daftar.length) + ' dari ' + daftar.length + ']: ' + daftar.slice(i, i + 40).join('; '));
  }
}

function bacaRentang_(sh, baris, kolom, jBaris, jKolom) {
  var rg = sh.getRange(baris, kolom, jBaris, jKolom);
  return { nilai: rg.getValues(), tampil: rg.getDisplayValues() };
}

/** Baca + periksa Master_Gardu. Hasil { baris, info } atau { blokir }. */
function bacaMasterGarduLama_(ss) {
  var M = MIGRASI_GARDU_.master;
  var sh = tabLamaGardu_(ss, M.tab);
  if (!sh) return { blokir: ['Tab ' + M.tab + ' tidak ada'] };
  var akhir = sh.getLastRow();
  if (akhir < M.barisData) return { blokir: [M.tab + ' kosong (data mulai baris ' + M.barisData + ')'] };
  var lebar = Math.min(M.lebar, sh.getLastColumn());
  if (lebar < M.lebar) return { blokir: [M.tab + ' hanya ' + lebar + ' kolom, butuh ' + M.lebar + ' (sampai EZ)'] };
  var head = bacaRentang_(sh, 1, 1, M.barisNomor, lebar).tampil;
  var blokir = [];
  // nomor kolom baris 11: boleh mulai dari angka berapa pun, tapi harus konsisten (kolom k = k + geser)
  var nomor = head[M.barisNomor - 1];
  var geser = null;
  Object.keys(M.kol).forEach(function (f) {
    var c = M.kol[f], n = angkaGarduLama_(nomor[c - 1]);
    if (n === '') { blokir.push(M.tab + ' baris ' + M.barisNomor + ' kolom ' + kolomHuruf_(c) + ' (' + f + ') tanpa nomor kolom'); return; }
    if (geser === null) geser = n - c;
    else if (n - c !== geser) blokir.push(M.tab + ' kolom ' + kolomHuruf_(c) + ' (' + f + ') bernomor ' + n + ', harap ' + (c + geser) + ': kolom bergeser?');
  });
  Object.keys(M.judul).forEach(function (f) {
    var c = M.kol[f], gabung = head.slice(0, M.barisNomor - 1).map(function (b) { return b[c - 1]; }).join(' ').toUpperCase();
    if (gabung.indexOf(M.judul[f]) === -1) blokir.push(M.tab + ' kolom ' + kolomHuruf_(c) + ' harap berjudul ' + M.judul[f]);
  });
  if (blokir.length) return { blokir: blokir };

  var data = bacaRentang_(sh, M.barisData, 1, akhir - M.barisData + 1, lebar);
  var hasil = [], abaikan = 0, salahFormat = [], dinormalkan = 0, ulpLain = 0;
  data.nilai.forEach(function (bn, i) {
    var bt = data.tampil[i], K = M.kol;
    var mentah = teksGarduLama_(bt[K.gardu - 1]);
    if (!mentah || /^[A-Za-z]{2}$/.test(mentah)) { abaikan++; return; }   // baris pemisah prefix (oranye) / kosong
    var no = parseNoGarduLama_(mentah);
    if (!no) { salahFormat.push('baris ' + (M.barisData + i) + ' "' + mentah + '"'); return; }
    if (GARDU_PREFIX_.indexOf(no.prefix) === -1) { salahFormat.push('baris ' + (M.barisData + i) + ' "' + mentah + '" (prefix ' + no.prefix + ')'); return; }
    var ulp = teksGarduLama_(bt[K.ulp - 1]);
    if (ulp && !ulpCocok_(ulp)) { ulpLain++; return; }
    if (no.dinormalkan) dinormalkan++;
    hasil.push({
      baris: M.barisData + i, no: no, ulp: ulp,
      alamat: teksGarduLama_(bt[K.alamat - 1]), penyulang: teksGarduLama_(bt[K.penyulang - 1]), section: teksGarduLama_(bt[K.section - 1]),
      koord: koordinatLama_(bt[K.lat - 1], bt[K.lng - 1]), konstruksi: teksGarduLama_(bt[K.konstruksi - 1]),
      merk: teksGarduLama_(bt[K.merk - 1]), kva: angkaGarduLama_(bt[K.kva - 1]), seri: teksGarduLama_(bt[K.seri - 1]), tahun: tahunLama_(bt[K.tahun - 1]),
      merkPhb: teksGarduLama_(bt[K.merkPhb - 1]), seriPhb: teksGarduLama_(bt[K.seriPhb - 1]), tahunPhb: tahunLama_(bt[K.tahunPhb - 1]),
      tglUkur: tanggalLama_(bn[K.tglUkur - 1], bt[K.tglUkur - 1]), kepemilikan: teksGarduLama_(bt[K.kepemilikan - 1]),
      jurusan: angkaAtauTeks_(bt[K.jurusan - 1]),
      arus: angkaGarduLama_(bt[K.arus - 1]), bebanKva: angkaGarduLama_(bt[K.bebanKva - 1]), persen: angkaGarduLama_(bt[K.persen - 1])
    });
  });
  return { baris: hasil, info: { abaikan: abaikan, salahFormat: salahFormat, dinormalkan: dinormalkan, ulpLain: ulpLain } };
}

/** Baca Rekap Gardu: BA gardu per No Gardu (urut tanggal, lalu baris). Tab tidak ada = peringatan, bukan blokir. */
function bacaRekapGarduLama_(ss) {
  var R = MIGRASI_GARDU_.rekap;
  var sh = tabLamaGardu_(ss, R.tab);
  if (!sh) return { perGardu: {}, jumlah: 0, peringatan: ['Tab ' + R.tab + ' tidak ada: status & riwayat BA tidak diturunkan'] };
  var akhir = sh.getLastRow(), lebar = sh.getLastColumn();
  if (lebar < R.lebarMin) return { blokir: [R.tab + ' hanya ' + lebar + ' kolom, butuh minimal ' + R.lebarMin + ' (sampai AU)'] };
  var head = bacaRentang_(sh, 1, 1, R.barisHeaderAkhir, lebar).tampil;
  var judul = function (c) { return head.map(function (b) { return b[c - 1]; }).join(' ').toUpperCase(); };
  var blokir = [];
  if (!/GARDU|TRAFO/.test(judul(R.kol.gardu))) blokir.push(R.tab + ' kolom B harap Nomor Gardu');
  if (judul(R.kol.jenis).indexOf('JENIS') === -1) blokir.push(R.tab + ' kolom E harap Jenis Pekerjaan');
  if (blokir.length) return { blokir: blokir };
  var cari = function (alias) {
    for (var r = 0; r < head.length; r++) for (var c = 0; c < lebar; c++) if (alias.indexOf(normJudul_(head[r][c])) !== -1) return c + 1;
    return -1;
  };
  var kIdBa = cari(R.aliasIdBa), kNoFull = cari(R.aliasNoBaFull);
  var perGardu = {}, jumlah = 0;
  if (akhir >= R.barisData) {
    var data = bacaRentang_(sh, R.barisData, 1, akhir - R.barisData + 1, lebar);
    data.nilai.forEach(function (bn, i) {
      var bt = data.tampil[i], K = R.kol;
      var no = parseNoGarduLama_(bt[K.gardu - 1]);
      if (!no || GARDU_PREFIX_.indexOf(no.prefix) === -1) return;
      var jenis = teksGarduLama_(bt[K.jenis - 1]);
      var kelompok = jenisBaLama_(jenis);
      if (!jenis || kelompok === 'LAIN') return;
      var ambil = function (k) { return teksGarduLama_(bt[K[k] - 1]); };
      (perGardu[no.nomor] = perGardu[no.nomor] || []).push({
        baris: R.barisData + i, jenis: jenis, kelompok: kelompok, tanggal: tanggalLama_(bn[K.tanggal - 1], bt[K.tanggal - 1]),
        nomorBa: (kNoFull > 0 && teksGarduLama_(bt[kNoFull - 1])) || (kIdBa > 0 && teksGarduLama_(bt[kIdBa - 1])) || '',
        alamat: ambil('alamat'), penyulang: ambil('penyulang'), section: ambil('section'), konstruksi: ambil('konstruksi'),
        koord: koordinatLama_(bt[K.lat - 1], bt[K.lng - 1]), jurusan: angkaAtauTeks_(ambil('jurusan')),
        kepemilikan: ambil('kepemilikan'), owner: ambil('owner'), extref: ambil('extref'),
        kva: angkaGarduLama_(ambil('kva')), merk: ambil('merk'), seri: ambil('seri'), tahun: tahunLama_(ambil('tahun')),
        merkPhb: ambil('merkPhb'), seriPhb: ambil('seriPhb'), tahunPhb: tahunLama_(ambil('tahunPhb')),
        kvaS: angkaGarduLama_(ambil('kvaS')), merkS: ambil('merkS'), seriS: ambil('seriS'), tahunS: tahunLama_(ambil('tahunS')), asalS: ambil('asalS'),
        merkPhbS: ambil('merkPhbS'), seriPhbS: ambil('seriPhbS'), tahunPhbS: tahunLama_(ambil('tahunPhbS'))
      });
      jumlah++;
    });
  }
  Object.keys(perGardu).forEach(function (k) {
    perGardu[k].sort(function (a, b) {
      var ta = a.tanggal || '9999', tb = b.tanggal || '9999';
      return ta < tb ? -1 : ta > tb ? 1 : a.baris - b.baris;
    });
  });
  return { perGardu: perGardu, jumlah: jumlah, kolomNomorBa: kNoFull > 0 ? kolomHuruf_(kNoFull) : kIdBa > 0 ? kolomHuruf_(kIdBa) : '' };
}

/** Isian dari BA lama berurutan (Pengoperasian = kolom dasar, Penggantian = kolom Sesudah). */
function identitasDariBaLama_(daftar) {
  var o = {};
  var isi = function (k, v) { if (v !== '' && v !== null && v !== undefined) o[k] = v; };
  daftar.forEach(function (b) {
    ['alamat', 'penyulang', 'section', 'konstruksi', 'jurusan', 'kepemilikan', 'owner', 'extref'].forEach(function (k) { isi(k, b[k]); });
    if (b.koord && b.koord.lat !== undefined) o.koord = b.koord;
    if (b.kelompok === 'OPERASI') {
      ['kva', 'merk', 'seri', 'tahun', 'merkPhb', 'seriPhb', 'tahunPhb'].forEach(function (k) { isi(k, b[k]); });
    } else if (b.kelompok === 'GANTI') {
      isi('kva', b.kvaS); isi('merk', b.merkS); isi('seri', b.seriS); isi('tahun', b.tahunS); isi('asal', b.asalS);
      isi('merkPhb', b.merkPhbS); isi('seriPhb', b.seriPhbS); isi('tahunPhb', b.tahunPhbS);
    }
  });
  return o;
}

/**
 * Susun rencana migrasi (tanpa menulis). Hasil { baru: [objek db_Gardu], blokir, peringatan, ringkas }.
 * dbGardu = isi db_Gardu sekarang (tabel_), jaringan = baris db_Jaringan.
 * Master_Gardu didahulukan; kolom yang kosong di Master diisi dari BA lama.
 */
function rencanaMigrasiGardu_(ss, dbGardu, jaringan) {
  var blokir = [], peringatan = [];
  var mg = bacaMasterGarduLama_(ss);
  if (mg.blokir) return { blokir: mg.blokir, peringatan: [], baru: [], ringkas: {} };
  var rk = bacaRekapGarduLama_(ss);
  if (rk.blokir) return { blokir: rk.blokir, peringatan: [], baru: [], ringkas: {} };
  (rk.peringatan || []).forEach(function (p) { peringatan.push(p); });
  if (mg.info.salahFormat.length) peringatan.push(mg.info.salahFormat.length + ' No Gardu tidak terbaca, dilewati, daftar lengkap di bawah');
  if (mg.info.ulpLain) peringatan.push(mg.info.ulpLain + ' baris ULP lain, dilewati');
  if (mg.info.dinormalkan) peringatan.push(mg.info.dinormalkan + ' No Gardu dirapikan (spasi / strip / jadi 4 digit)');

  var hitung = {};
  mg.baris.forEach(function (r) { (hitung[r.no.nomor] = hitung[r.no.nomor] || []).push(r.baris); });
  Object.keys(hitung).forEach(function (k) {
    if (hitung[k].length > 1) blokir.push('No Gardu ganda di Master_Gardu: ' + k + ' (baris ' + hitung[k].join(', ') + ')');
  });

  var sudah = {};
  dbGardu.rows.forEach(function (r) { sudah[String(r['No Gardu']).trim().toUpperCase()] = true; });
  var noAkhir = dbGardu.rows.reduce(function (m, r) { return Math.max(m, Number(r.No) || 0); }, 0);
  var jar = jaringan.filter(function (r) { return r.section_id && isAktif_(r.aktif); });
  var kini = sekarangIso_(), ulpNama = cfg_().ULP_NAMA;
  var baru = [], dilewati = 0, tanpaSection = [], ambiguSection = [], penyulangBeda = [], koordSalah = [], status = {}, perPrefix = {};

  var susun = function (no, dasar, sumber, baris) {
    var daftar = rk.perGardu[no.nomor] || [];
    var dariBa = identitasDariBaLama_(daftar);
    var pilih = function (k) { return dasar[k] !== '' && dasar[k] !== undefined ? dasar[k] : dariBa[k] !== undefined ? dariBa[k] : ''; };
    var st = statusDariBaLama_(daftar) || 'AKTIF';
    var op = daftar.filter(function (b) { return b.kelompok === 'OPERASI'; })[0];
    var akhirBa = daftar[daftar.length - 1];
    var koord = dasar.koord && dasar.koord.lat !== undefined ? dasar.koord : dariBa.koord || dasar.koord || {};
    if (koord.masalah) koordSalah.push(no.nomor + ' (' + koord.masalah + ')');
    var penyulang = pilih('penyulang'), sectionLama = pilih('section');
    var cocok = cocokSectionLama_(sectionLama, penyulang, jar), sec = cocok.sec || null;
    var label = no.nomor + ' [' + (penyulang || '-') + '] "' + sectionLama + '"';
    if (cocok.alasan === 'TIDAK_ADA') tanpaSection.push(label);
    if (cocok.alasan === 'AMBIGU') ambiguSection.push(label + ' (' + cocok.calon + ' calon)');
    if (cocok.penyulangBeda) penyulangBeda.push(label + ' -> ' + sec.penyulang);
    var ada = function (k) { return dasar[k] !== undefined ? dasar[k] : ''; };
    status[st] = (status[st] || 0) + 1;
    return {
      No: ++noAkhir, 'No Gardu': no.nomor, Prefix: no.prefix, ULP: dasar.ulp || ulpNama, 'Status Gardu': st, 'Asal Nomor': 'BARU',
      Alamat: pilih('alamat'), Penyulang: sec ? String(sec.penyulang) : penyulang, Section: sec ? String(sec.section) : '',
      'PTS/LBS': sectionLama, Lat: koord.lat !== undefined ? koord.lat : '', Long: koord.lng !== undefined ? koord.lng : '',
      Konstruksi: pilih('konstruksi'), 'Kapasitas (kVA)': pilih('kva'), Merk: pilih('merk'), 'Nomor Seri': pilih('seri'), Tahun: pilih('tahun'),
      'Jurusan Terpasang': pilih('jurusan'), 'Asal Trafo': dariBa.asal || '', 'Merk PHB-TR': pilih('merkPhb'), 'Nomor Seri PHB-TR': pilih('seriPhb'),
      'Tahun PHB-TR': pilih('tahunPhb'), Kepemilikan: pilih('kepemilikan'), OwnerId: dariBa.owner || '', 'External Reference': dariBa.extref || '',
      'BA Pengoperasian': op ? op.nomorBa : '', 'Tanggal Operasi': op ? op.tanggal : '',
      'BA Terakhir': akhirBa ? akhirBa.nomorBa : '', 'Jenis BA Terakhir': akhirBa ? akhirBa.jenis : '', 'Tanggal BA Terakhir': akhirBa ? akhirBa.tanggal : '',
      'Jumlah BA': daftar.length, 'Tanggal Ukur Terakhir': ada('tglUkur'), 'Arus Maks per Fasa (A)': ada('arus'),
      'Pembebanan (kVA)': ada('bebanKva'), 'Persentase Beban (%)': ada('persen'), 'Kategori Beban': kategoriBeban_(ada('persen')),
      'Sumber Data': sumber + ' baris ' + baris, 'Diubah Oleh': MIGRASI_GARDU_.oleh, Timestamp: kini, 'Timestamp Update': kini,
      gardu_id: uuid_(), section_id: sec ? String(sec.section_id) : '', revision: 1,
      dibuat_oleh: MIGRASI_GARDU_.oleh, diubah_oleh: MIGRASI_GARDU_.oleh
    };
  };

  // nomor terakhir per prefix dari SEMUA sumber (Master_Gardu, Rekap Gardu, db_Gardu): acuan nomor gardu baru v2
  var catatNomor = function (v) { var n = parseNoGarduLama_(v); if (n) perPrefix[n.prefix] = Math.max(perPrefix[n.prefix] || 0, n.angka); };
  mg.baris.forEach(function (r) { catatNomor(r.no.nomor); });
  Object.keys(rk.perGardu).forEach(catatNomor);
  Object.keys(sudah).forEach(catatNomor);

  var diMaster = {};
  mg.baris.forEach(function (r) {
    diMaster[r.no.nomor] = true;
    if (sudah[r.no.nomor]) { dilewati++; return; }
    if (hitung[r.no.nomor].length > 1) return;
    baru.push(susun(r.no, r, MIGRASI_GARDU_.sumberMaster, r.baris));
  });
  var hanyaRekap = 0;
  Object.keys(rk.perGardu).sort().forEach(function (k) {
    if (diMaster[k]) return;
    if (sudah[k]) { dilewati++; return; }
    var daftar = rk.perGardu[k];
    baru.push(susun(parseNoGarduLama_(k), { koord: {} }, MIGRASI_GARDU_.sumberRekap, daftar[0].baris));
    hanyaRekap++;
  });
  if (hanyaRekap) peringatan.push(hanyaRekap + ' gardu hanya ada di Rekap Gardu (tidak ada di Master_Gardu), ikut dimigrasi dari data BA');
  if (tanpaSection.length) peringatan.push(tanpaSection.length + ' gardu section-nya tidak ada di db_Jaringan (Section & section_id kosong, teks asli di PTS/LBS), daftar lengkap di bawah');
  if (ambiguSection.length) peringatan.push(ambiguSection.length + ' gardu section-nya cocok ke lebih dari satu section db_Jaringan (dikosongkan), daftar lengkap di bawah');
  if (penyulangBeda.length) peringatan.push(penyulangBeda.length + ' gardu penyulangnya beda dengan db_Jaringan (penyulang diikutkan db_Jaringan), daftar lengkap di bawah');
  if (koordSalah.length) peringatan.push(koordSalah.length + ' koordinat tidak terbaca / di luar Babel (dikosongkan), daftar lengkap di bawah');
  return {
    baru: baru, blokir: blokir, peringatan: peringatan,
    daftar: { 'NO GARDU TIDAK TERBACA': mg.info.salahFormat, 'SECTION TIDAK ADA': tanpaSection, 'SECTION AMBIGU': ambiguSection, 'PENYULANG BEDA': penyulangBeda, 'KOORDINAT': koordSalah },
    ringkas: {
      master: mg.baris.length, rekapBa: rk.jumlah || 0, kolomNomorBa: rk.kolomNomorBa || '', sudahAda: dilewati, akanDitambah: baru.length,
      hanyaRekap: hanyaRekap, tanpaSection: tanpaSection.length, ambiguSection: ambiguSection.length, penyulangBeda: penyulangBeda.length,
      koordinatKosong: koordSalah.length, status: status,
      nomorTerakhir: Object.keys(perPrefix).sort().map(function (p) { return p + ('000' + perPrefix[p]).slice(-4); })
    }
  };
}

function cetakRencanaMigrasiGardu_(r) {
  var s = r.ringkas;
  console.log('Master_Gardu: ' + (s.master || 0) + ' gardu terbaca. Rekap Gardu: ' + (s.rekapBa || 0) + ' BA gardu (kolom nomor BA: ' + (s.kolomNomorBa || '-') + ').');
  console.log('Sudah ada di db_Gardu (dilewati): ' + (s.sudahAda || 0) + '. Akan ditambah: ' + (s.akanDitambah || 0) + '.');
  if (s.status) console.log('Status: ' + Object.keys(s.status).map(function (k) { return k + ' ' + s.status[k]; }).join(', '));
  if (s.nomorTerakhir && s.nomorTerakhir.length) console.log('Nomor terakhir per prefix: ' + s.nomorTerakhir.join(', '));
  r.peringatan.forEach(function (p) { console.warn('PERINGATAN: ' + p); });
  Object.keys(r.daftar || {}).forEach(function (k) { cetakDaftar_(k, r.daftar[k]); });
  r.blokir.slice(0, 20).forEach(function (p) { console.error('BLOKIR: ' + p); });
  r.baru.slice(0, 3).forEach(function (o) {
    console.log('Contoh: ' + ['No Gardu', 'Status Gardu', 'Alamat', 'Penyulang', 'Section', 'PTS/LBS', 'Lat', 'Long', 'Kapasitas (kVA)', 'Merk',
      'Persentase Beban (%)', 'Kategori Beban', 'BA Pengoperasian', 'Jumlah BA'].map(function (k) { return k + '=' + o[k]; }).join(' | '));
  });
}

/** Teks log: dari file mana sumber lama dibaca (v0.68.1, GARDU_LAMA_SHEET_ID). */
function sumberMigrasiGardu_(c) {
  return c.GARDU_LAMA_SHEET_ID === c.GARDU_SHEET_ID
    ? 'Sumber lama: file yang sama dengan GARDU_SHEET_ID'
    : 'Sumber lama: GARDU_LAMA_SHEET_ID ' + c.GARDU_LAMA_SHEET_ID + ' (hanya dibaca), tujuan db_Gardu di GARDU_SHEET_ID ' + c.GARDU_SHEET_ID;
}

/** Pratinjau migrasi gardu. Tidak menulis apa pun. Lihat Execution log. */
function ADMIN_cekMigrasiGardu() {
  pastikanPemilik_();
  var c = cfg_();
  if (!c.GARDU_SHEET_ID) { console.error('GARDU_SHEET_ID kosong'); return null; }
  console.log(sumberMigrasiGardu_(c));
  var r = rencanaMigrasiGardu_(bukaSpreadsheet_(c.GARDU_LAMA_SHEET_ID), cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu'), tabel_('MASTER_SHEET_ID', 'db_Jaringan').rows);
  cetakRencanaMigrasiGardu_(r);
  console.log(r.blokir.length ? 'ADA ' + r.blokir.length + ' MASALAH YANG MEMBLOKIR: perbaiki di sheet lama dulu, lalu cek ulang' : 'SIAP: jalankan ADMIN_migrasiGardu');
  r.ringkas.blokir = r.blokir.length;
  return r.ringkas;
}

/** Tulis migrasi gardu (hanya No Gardu yang belum ada di db_Gardu). Ada blokir = tidak menulis apa pun. */
function ADMIN_migrasiGardu() {
  pastikanPemilik_();
  var c = cfg_();
  if (!c.GARDU_SHEET_ID) { console.error('GARDU_SHEET_ID kosong'); return null; }
  return denganLock_(function () {
    var t = cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu');
    var tLog = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    console.log(sumberMigrasiGardu_(c));
    var r = rencanaMigrasiGardu_(bukaSpreadsheet_(c.GARDU_LAMA_SHEET_ID), t, tabel_('MASTER_SHEET_ID', 'db_Jaringan').rows);
    cetakRencanaMigrasiGardu_(r);
    if (r.blokir.length) { console.error('DIBATALKAN: ' + r.blokir.length + ' masalah memblokir, tidak ada yang ditulis'); return { ditulis: 0, blokir: r.blokir.length }; }
    if (!r.baru.length) { console.log('Tidak ada gardu baru untuk ditambah'); return { ditulis: 0 }; }
    tambahBanyak_(t, r.baru);
    auditLog_({ username: 'ADMIN_EDITOR' }, 'MIGRASI_GARDU', 'db_Gardu', r.baru.length + ' gardu; ' +
      Object.keys(r.ringkas.status).map(function (k) { return k + ' ' + r.ringkas.status[k]; }).join(', '), 'EDITOR', tLog);
    console.log('SELESAI: ' + r.baru.length + ' gardu ditambah ke db_Gardu');
    return { ditulis: r.baru.length };
  }, 30000);
}
