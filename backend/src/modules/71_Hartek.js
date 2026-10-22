/**
 * v0.87.0 (keputusan kvlar 13 Okt 2026): modul Hartek, inputan petugas (HP).
 * Port dari v1 (SiSi_BackEnd/Hartek/Tek-Hartek-Code.js) ke arsitektur v2: pembuatan baris dilakukan server,
 * bukan AppSheet. Setiap tingkat diisi lewat endpoint sendiri, kode anak dibuat server, konteks diwarisi dari induk.
 *
 * Spreadsheet SiSi_Hartek (Script Property HARTEK_SHEET_ID), tab milik v2:
 *   db_Hartek_Header            1 baris per tim per hari (kode HAR-<ULP><YYMMDD><NNN>)
 *   db_Hartek_PenyulangGardu    objek: PNY (Jaringan) / GRD (Gardu) / NTK (Non - Teknik)
 *   db_Hartek_Pekerjaan         induk: PenyulangGardu
 *   db_Hartek_Material          induk: Pekerjaan
 *   db_Hartek_Grounding         induk: Pekerjaan (foto menyusul, kolom link disiapkan)
 *   db_Hartek_PemerataanBeban   induk: Pekerjaan, hanya pekerjaan "Pemerataan / Pembagian Beban Gardu" (v0.94.1)
 *   db_Material                 ada di SiSi_Master (MASTER_SHEET_ID), bukan di SiSi_Hartek (v0.88.1)
 * Header: tidak ada batal / hapus (keputusan kvlar 13 Okt 2026). Satu header per tim per hari.
 * Belum di versi ini: edit / hapus baris, upload foto grounding & pemerataan, teks WA (recalc), laporan GASPOL.
 * v0.91.0 (kvlar 14 Okt 2026, "Terapkan semua"): PG + koordinat; Pekerjaan + jenis_id (db_Jenis_Pekerjaan modul HARTEK);
 *   Material + master_material_id; db_Material + satuan; Pemerataan nomor_gardu -> no_gardu; hasil grounding angka (ohm).
 * Struktur kolom DIKUNCI (sama seperti sheet Gardu): dicek saat tulis, tidak pernah digeser.
 */

var HARTEK_SHEET_ = {
  HEADER: 'db_Hartek_Header', PG: 'db_Hartek_PenyulangGardu', PEKERJAAN: 'db_Hartek_Pekerjaan',
  MATERIAL: 'db_Hartek_Material', GROUNDING: 'db_Hartek_Grounding', PEMERATAAN: 'db_Hartek_PemerataanBeban',
  MASTER_MATERIAL: 'db_Material', KEPEMILIKAN_MATERIAL: 'db_Kepemilikan_Material', JENIS_PERALATAN: 'db_jenis_peralatan'
};

var HARTEK_AUDIT_ = ['dibuat_oleh', 'diubah_oleh', 'timestamp', 'timestamp_update', 'revision'];   // v0.87.15: dibuat_pada -> timestamp, diubah_pada -> timestamp_update

var HARTEK_HEADER_ = {
  // v0.87.17: struktur final dari kvlar (xlsx SiSi_Hartek_template). Kolom 1 = nomor; data pendukung server di akhir.
  db_Hartek_Header: ['nomor', 'kode_header', 'ulp', 'hari', 'tanggal', 'tim', 'koordinat_awal', 'koordinat_akhir',
    'km_awal', 'km_akhir', 'kendala', 'wa_text', 'timestamp', 'input_by', 'timestamp_update',
    'header_id', 'tim_id', 'status', 'revision', 'dibuat_oleh', 'waktu_perangkat', 'diubah_oleh'],
  db_Hartek_PenyulangGardu: ['nomor', 'kode_header', 'kode_pg', 'tanggal', 'hari', 'ulp', 'jenis_pekerjaan', 'penyulang',
    'section', 'no_gardu', 'daerah', 'jumlah_gawang', 'koordinat', 'header_id', 'pg_id', 'gardu_id', 'tim_id'].concat(HARTEK_AUDIT_),
  db_Hartek_Pekerjaan: ['nomor', 'kode_header', 'kode_pg', 'kode_pekerjaan', 'tanggal', 'hari', 'ulp', 'jenis_pekerjaan',
    'penyulang', 'section', 'no_gardu', 'pekerjaan', 'jumlah_pekerjaan', 'satuan_pekerjaan', 'kolom_gaspol',
    'pekerjaan_id', 'jenis_id', 'pg_id', 'header_id', 'tim_id'].concat(HARTEK_AUDIT_),
  db_Hartek_Material: ['nomor', 'kode_header', 'kode_pekerjaan', 'kode_material', 'tanggal', 'material', 'jumlah', 'satuan',
    'kepemilikan', 'material_id', 'master_material_id', 'pekerjaan_id', 'pg_id', 'header_id', 'tim_id'].concat(HARTEK_AUDIT_),
  db_Hartek_Grounding: ['nomor', 'kode_header', 'kode_pg', 'kode_pekerjaan', 'kode_grounding', 'tanggal', 'jenis_peralatan',
    'nama_peralatan', 'kondisi_tanah', 'hasil_sebelum', 'hasil_sesudah',
    // v1.0.0: + link Drive foto (diisi uploadFotoHartek)
    'foto_sebelum_file_id', 'foto_sebelum_link', 'foto_sesudah_file_id', 'foto_sesudah_link',
    'grounding_id', 'pekerjaan_id', 'pg_id', 'header_id', 'tim_id'].concat(HARTEK_AUDIT_),
  db_Hartek_PemerataanBeban: ['nomor', 'kode_header', 'kode_pg', 'kode_pekerjaan', 'kode_pemerataan', 'tanggal', 'penyulang',
    'section', 'no_gardu', 'alamat', 'seb_r', 'seb_s', 'seb_t', 'ses_r', 'ses_s', 'ses_t',
    // v1.0.0: foto arus + tegangan sebelum / sesudah (file Drive + link)
    'foto_arus_sebelum_file_id', 'foto_arus_sebelum_link', 'foto_tegangan_sebelum_file_id', 'foto_tegangan_sebelum_link',
    'foto_arus_sesudah_file_id', 'foto_arus_sesudah_link', 'foto_tegangan_sesudah_file_id', 'foto_tegangan_sesudah_link',
    'pemerataan_id', 'pekerjaan_id', 'pg_id', 'header_id', 'tim_id'].concat(HARTEK_AUDIT_),
};

// v0.88.1: db_Material pindah ke SiSi_Master (satu master). v0.88.3: dibuat / disesuaikan ADMIN_siapkanSheetHartek di SiSi_Master.
var HARTEK_MASTER_HEADER_ = {
  // v0.91.0: satuan (diisi otomatis di HP saat material dipilih; server pakai satuan master kalau HP kosong)
  db_Material: ['nomor', 'nama_material', 'satuan', 'aktif', 'material_id', 'revision', 'timestamp_update', 'diubah_oleh'],
  // v0.96.0: master kepemilikan material di SiSi_Master (dropdown kepemilikan di form material Hartek)
  db_Kepemilikan_Material: ['nomor', 'kepemilikan', 'aktif', 'kepemilikan_id', 'revision', 'timestamp_update', 'diubah_oleh'],
  // v0.98.11: master jenis peralatan hasil grounding di SiSi_Master
  db_jenis_peralatan: ['nomor', 'jenis_peralatan', 'aktif', 'peralatan_id', 'revision', 'timestamp_update', 'diubah_oleh']
};

var HARTEK_HARI_ = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
// v0.94.1 (kvlar 14 Okt 2026): nama master diganti Trafo -> Gardu
var HARTEK_PEMERATAAN_JENIS_ = ['pemerataan beban gardu', 'pembagian beban gardu'];

/** v0.97.0 (kvlar 15 Okt 2026): rincian grounding HANYA untuk pekerjaan yang namanya mengandung "grounding".
 *  Pasang / Pemasangan Grounding = hanya hasil SESUDAH (wajib, nilai sebelum tidak ada).
 *  Lainnya (mis. Perbaikan Grounding) = hasil SEBELUM dan SESUDAH, dua-duanya wajib. */
function groundingBolehHartek_(nama) { return /grounding/.test(String(nama === null || nama === undefined ? '' : nama).toLowerCase()); }

function groundingHanyaSesudahHartek_(nama) {
  var n = String(nama === null || nama === undefined ? '' : nama).toLowerCase();
  return groundingBolehHartek_(n) && /pasang/.test(n);
}
var HARTEK_MODUL_JENIS_ = 'HARTEK';

/** v0.94.0 (v1 db_Hartek_List_Pekerjaan: Pekerjaan, Jenis, Satuan, Kolom GASPOL): kolom tambahan di db_Jenis_Pekerjaan
 *  untuk baris modul HARTEK. jenis_pekerjaan = Jaringan / Gardu / Non - Teknik (kosong = semua jenis);
 *  kolom_gaspol = nama kolom GASPOL UP3 (sama persis dengan COL_GASPOL v1), kosong = tidak masuk GASPOL. */
var HARTEK_KOLOM_MASTER_JENIS_ = ['jenis_pekerjaan', 'kolom_gaspol'];

/** Kolom GASPOL yang boleh diisi pekerjaan Hartek (nama properti COL_GASPOL v1) + label tampilan. */
var HARTEK_KOLOM_GASPOL_ = {
  harkomIsolator: 'HARKOM · Isolator', harkomArrester: 'HARKOM · Arrester', harkomFco: 'HARKOM · FCO',
  harkomSutm: 'HARKOM · SUTM',   // v0.94.1 (kvlar): kriteria baru, belum ada di COL_GASPOL v1 (mis. Penggantian Bending Wire TM)
  harkonsTiang: 'HARKONS · Tiang', harkonsSutm: 'HARKONS · SUTM', harkonsGw: 'HARKONS · GW', harkonsGsw: 'HARKONS · GSW',
  groundingTm: 'HARKONS · Grounding TM', harkeypoint: 'HARKONS · Keypoint', penghalangHewan: 'HARKONS · Penghalang hewan',
  rekonektorSutm: 'HARKONS · Rekonektor SUTM', rehabSutm: 'HARKONS · Rehab SUTM', penyulangBaruSutm: 'HARKONS · Penyulang baru SUTM',
  manajemenGardu: 'Gardu · Manajemen gardu', tapChanger: 'Gardu · Tap changer', penyeimbanganBeban: 'Gardu · Penyeimbangan beban',
  groundingGardu: 'Gardu · Grounding gardu', coverGardu: 'Gardu · Cover gardu', lostContactPhbTr: 'Gardu · Lost contact PHB TR',
  jurusanBaruPecahBeban: 'SUTR/SR · Jurusan baru / pecah beban', rekonektorSutr: 'SUTR/SR · Rekonektor SUTR',
  srSeri: 'SUTR/SR · SR seri', rekonektorSr: 'SUTR/SR · Rekonektor SR', cfa: 'Lainnya · CFA', pemasanganAvr: 'Lainnya · Pemasangan AVR'
};

/** Kolom GASPOL baku ('' kalau kosong / tidak dikenal). v0.94.1: huruf besar/kecil bebas (harKeypoint = harkeypoint),
 *  yang disimpan selalu nama baku. */
function kolomGaspolHartek_(v) {
  var k = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  if (!k) return '';
  var baku = Object.keys(HARTEK_KOLOM_GASPOL_).filter(function (x) { return x.toLowerCase() === k; })[0];
  return baku || '';
}

/** Jenis PG master pekerjaan: baku, '' = semua jenis, null = isian tidak dikenal (dilaporkan cekKonfig). */
function jenisMasterPgHartek_(v) {
  var k = String(v === null || v === undefined ? '' : v).trim().replace(/\s+/g, ' ').toLowerCase();
  if (!k) return '';
  return HARTEK_JENIS_PG_[k] || null;
}   // v0.91.0: db_Jenis_Pekerjaan modul HARTEK = daftar pekerjaan Hartek

/* ===== helper ===== */

function wajibPetugasHartek_(sesi) {
  if (!sesi || sesi.role !== 'PETUGAS' || sesi.jenisTim !== 'HARTEK' || !sesi.timId) throw new SisiError_('AKSES_DITOLAK', 'bukan petugas HARTEK');
}

function hariTanggalHartek_(tanggal) {
  var wib = new Date(new Date(tanggal + 'T00:00:00+07:00').getTime() + 7 * 3600e3);   // geser ke tengah malam WIB (UTC)
  return HARTEK_HARI_[wib.getUTCDay()];
}

function tanggalHariIniHartek_() { return tglJakarta_(new Date()); }

/** v0.93.1 (temuan review 14 Okt 2026): tanggal baris Hartek sebagai teks yyyy-MM-dd. Sumber utama = kode_header
 *  (HAR-<KODE_ULP><YYMMDD><NNN>, tidak pernah diubah Sheets), cadangan = sel tanggal (bisa Date kalau Sheets
 *  mengubah teks otomatis; dibaca tglSel_ dalam zona Jakarta). Sama dengan pola ROW: tanggal dibaca dari kode. */
function tglHartek_(r) {
  var kode = String((r && r.kode_header) || '').trim();
  var awal = 'HAR-' + String(cfg_().KODE_ULP || '');
  if (kode.indexOf(awal) === 0) {
    var m = /^(\d{2})(\d{2})(\d{2})\d{3,}/.exec(kode.slice(awal.length));
    if (m) {
      var iso = '20' + m[1] + '-' + m[2] + '-' + m[3];
      var dt = new Date(iso + 'T00:00:00Z');
      if (!isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso) return iso;
    }
  }
  return tglSel_(r ? r.tanggal : '');
}

/** Nomor urut berikut untuk kode berawalan `awalan` (kolom kode di `rows`). Angka 3 digit atau lebih. */
function urutBerikutHartek_(rows, kolomKode, awalan) {
  var maks = 0;
  rows.forEach(function (r) {
    var k = String(r[kolomKode] || '');
    if (k.indexOf(awalan) !== 0) return;
    var n = parseInt(k.slice(awalan.length), 10);
    if (isFinite(n) && n > maks) maks = n;
  });
  return maks + 1;
}

/** v0.93.1 (temuan review): jenis PG hanya tiga pilihan HP. Huruf besar/kecil dan spasi bebas, disimpan nama baku.
 *  Selain itu = PILIHAN_TIDAK_VALID (dulu teks bebas tersimpan sebagai Gardu dan tidak muncul di HP). */
var HARTEK_JENIS_PG_ = { jaringan: 'Jaringan', gardu: 'Gardu', 'non - teknik': 'Non - Teknik', 'non-teknik': 'Non - Teknik', 'non teknik': 'Non - Teknik' };

function jenisPgBakuHartek_(jenis) {
  var k = String(jenis || '').trim().replace(/\s+/g, ' ').toLowerCase();
  var baku = HARTEK_JENIS_PG_[k];
  if (!baku) throw new SisiError_('PILIHAN_TIDAK_VALID', 'jenisPekerjaan');
  return baku;
}

/** v0.95.0: "lat, lng" dari kolom Lat / Long db_Gardu. Kosong / di luar area = ''. */
function koordinatGarduHartek_(g) {
  var lat = Number(String(g.Lat === undefined || g.Lat === null ? '' : g.Lat).replace(',', '.'));
  var lng = Number(String(g.Long === undefined || g.Long === null ? '' : g.Long).replace(',', '.'));
  if (String(g.Lat === undefined ? '' : g.Lat).trim() === '' || !isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return '';
  try { return parseKoordinat_('koordinat', lat + ', ' + lng, AREA_BABEL_).teks; } catch (e) { return ''; }
}

function tagObjekHartek_(jenis) {
  var j = String(jenis || '').trim().toLowerCase();
  if (j === 'jaringan') return 'PNY';
  if (j === 'non - teknik' || j === 'non-teknik' || j === 'non teknik') return 'NTK';
  return 'GRD';
}

function sisipAuditHartek_(obj, sesi, sekarang, baru) {
  obj.dibuat_oleh = baru ? sesi.userId : obj.dibuat_oleh;
  obj.diubah_oleh = sesi.userId;
  obj.timestamp = baru ? sekarang : obj.timestamp;
  obj.timestamp_update = sekarang;
  obj.revision = 1;
  return obj;
}

function tabelHartek_(nama) { return tabel_('HARTEK_SHEET_ID', nama); }

/** v0.88.1: master material ada di SiSi_Master (satu master dengan db_Jaringan). */
function tabelMaterialHartek_() { return tabel_('MASTER_SHEET_ID', HARTEK_SHEET_.MASTER_MATERIAL); }

/** Header tim pada tanggal (yang AKTIF). Null kalau belum dibuat. */
function headerTimHartek_(rows, timId, tanggal) {
  return rows.filter(function (h) { return String(h.tim_id) === String(timId) && tglHartek_(h) === tanggal && h.status === 'AKTIF'; })[0] || null;
}

/** Induk harus ada dan milik tim sesi; induk dari hari ini saja yang boleh diisi petugas. */
function indukHartekMilikTim_(rows, idKolom, id, timId, nama) {
  var r = rows.filter(function (x) { return String(x[idKolom]) === String(id); })[0];
  if (!r) throw new SisiError_('DATA_TIDAK_DITEMUKAN', nama);
  if (String(r.tim_id) !== String(timId)) throw new SisiError_('BUKAN_MILIK_TIM', nama);
  if (tglHartek_(r) !== tanggalHariIniHartek_()) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', nama);
  // v1.0.2 (guard): Laporan Utama yang tidak AKTIF (dibatalkan admin) tidak bisa diisi / diubah lagi
  if (idKolom === 'header_id' && String(r.status || 'AKTIF') !== 'AKTIF') throw new SisiError_('SUDAH_BATAL', nama);
  return r;
}

/* ===== db_Jaringan (master penyulang + section, MASTER_SHEET_ID) ===== */

/** Baris db_Jaringan yang aktif (section induk/anak sama-sama dipakai). */
function jaringanAktifHartek_() {
  return tabel_('MASTER_SHEET_ID', 'db_Jaringan').rows.filter(function (r) {
    return r.section_id && isAktif_(r.aktif) && String(r.penyulang || '').trim() && String(r.section || '').trim();
  });
}

/** Penyulang dan section yang boleh dipilih untuk objek Jaringan. Sumber dropdown di HP. */
function getJaringanHartek_(sesi) {
  wajibPetugasHartek_(sesi);
  return petaJaringanUrut_();
}

/** v1.0.0: dropdown penyulang + section dari db_Jaringan (master penyulang SiSi_Master), dipakai Hartek dan
 *  Inspeksi Jaringan. v0.95.0 (kvlar 14 Okt 2026): section diurutkan kolom urutan db_Jaringan (kosong di akhir),
 *  lalu nama. Penyulang urut nama. */
function petaJaringanUrut_() {
  var peta = {};
  var urut = function (v) { var n = Number(v); return v === '' || v === null || v === undefined || !isFinite(n) ? 1e9 : n; };
  jaringanAktifHartek_().forEach(function (r) {
    var p = String(r.penyulang).trim(), s = String(r.section).trim();
    if (!peta[p]) peta[p] = {};
    if (!(s in peta[p]) || urut(r.urutan) < peta[p][s]) peta[p][s] = urut(r.urutan);
  });
  var penyulang = Object.keys(peta).sort().map(function (p) {
    var sec = Object.keys(peta[p]).sort(function (a, b) { return peta[p][a] - peta[p][b] || a.localeCompare(b); });
    return { nama: p, section: sec };
  });
  return { penyulang: penyulang };
}

/* ===== endpoint baca ===== */

function kepemilikanAktifHartek_() {
  try {
    return tabel_('MASTER_SHEET_ID', HARTEK_SHEET_.KEPEMILIKAN_MATERIAL).rows
      .filter(function (r) { return isAktif_(r.aktif) && String(r.kepemilikan || r.nama_kepemilikan || r.nama || '').trim(); })
      .map(function (r) {
        var nm = String(r.kepemilikan || r.nama_kepemilikan || r.nama || '').trim();
        return { kepemilikanId: String(r.kepemilikan_id || nm), nama: nm };
      });
  } catch (e) {
    if (e && e.kode === 'SHEET_TIDAK_ADA') return [];
    throw e;
  }
}

/** v0.98.11: master jenis peralatan hasil grounding di SiSi_Master (db_jenis_peralatan). */
function jenisPeralatanAktifHartek_() {
  try {
    return tabel_('MASTER_SHEET_ID', HARTEK_SHEET_.JENIS_PERALATAN).rows
      .filter(function (r) { return isAktif_(r.aktif) && String(r.jenis_peralatan || r.nama_peralatan || r.nama || '').trim(); })
      .map(function (r) {
        var nm = String(r.jenis_peralatan || r.nama_peralatan || r.nama || '').trim();
        return { peralatanId: String(r.peralatan_id || nm), nama: nm };
      });
  } catch (e) {
    if (e && e.kode === 'SHEET_TIDAK_ADA') return [];
    throw e;
  }
}

/** v0.98.11: nama peralatan hasil grounding dari lokasi pekerjaan:
 *  - Jaringan: nama switching di penyulang tersebut sesuai section (bagian depan section sebelum " - ").
 *  - Gardu (atau punya nomor gardu): nomor gardu. */
function namaPeralatanGroundingHartek_(jenisPg, section, noGardu, isian) {
  var j = String(jenisPg || '').trim().toLowerCase();
  if (j === 'jaringan') {
    var sw = namaSwitching_(section);
    return sw || String(isian || '').trim();
  }
  if (j === 'gardu') return String(noGardu || isian || '').trim().toUpperCase();
  return String(isian || noGardu || '').trim();
}

function getMaterialHartek_(sesi) {
  wajibPetugasHartek_(sesi);
  var nama = tabelMaterialHartek_().rows
    .filter(function (r) { return r.material_id && isAktif_(r.aktif) && String(r.nama_material || '').trim(); })
    .map(function (r) { return { materialId: String(r.material_id), nama: String(r.nama_material).trim(), satuan: String(r.satuan || '').trim() }; });
  nama.sort(function (a, b) { return a.nama.localeCompare(b.nama); });
  var milik = kepemilikanAktifHartek_();
  var peralatan = jenisPeralatanAktifHartek_();
  return { material: nama, kepemilikan: milik, jenisPeralatan: peralatan };
}

/** v0.91.0: baris db_Jenis_Pekerjaan modul HARTEK (aktif saja kalau `aktifSaja`). */
function jenisMasterHartek_(aktifSaja) {
  return tabel_('MASTER_SHEET_ID', 'db_Jenis_Pekerjaan').rows.filter(function (r) {
    return r.jenis_id && String(r.modul || '').trim().toUpperCase() === HARTEK_MODUL_JENIS_ && String(r.nama || '').trim() &&
      (!aktifSaja || isAktif_(r.aktif));
  });
}

/** v0.91.0: dropdown pekerjaan Hartek di HP (db_Jenis_Pekerjaan modul HARTEK, aktif, urut kolom urutan lalu nama). */
function getJenisPekerjaanHartek_(sesi) {
  wajibPetugasHartek_(sesi);
  var urut = function (r) { var n = Number(r.urutan); return r.urutan === '' || !isFinite(n) ? 1e9 : n; };
  var rows = jenisMasterHartek_(true).slice().sort(function (a, b) {
    return urut(a) - urut(b) || String(a.nama).trim().localeCompare(String(b.nama).trim());
  });
  return {
    jenis: rows.map(function (r) {
      var nama = String(r.nama).trim(), kg = kolomGaspolHartek_(r.kolom_gaspol);
      return { jenisId: String(r.jenis_id), nama: nama, satuan: String(r.satuan || '').trim(),
               jenisPekerjaan: jenisMasterPgHartek_(r.jenis_pekerjaan) || '',   // v0.94.0: '' = semua jenis PG
               kolomGaspol: kg, labelGaspol: kg ? HARTEK_KOLOM_GASPOL_[kg] : '',
               pemerataan: HARTEK_PEMERATAAN_JENIS_.indexOf(nama.toLowerCase()) !== -1 };
    }).filter(function (j, i) { return jenisMasterPgHartek_(rows[i].jenis_pekerjaan) !== null; })   // jenis tidak dikenal = disembunyikan
  };
}

/** v0.91.0: pekerjaan dari master HARTEK aktif, dicari lewat jenisId (utama) atau nama (cadangan HP lama).
 *  v0.94.0: [jenisPg] = jenis PG induk. Master berjenis lain = PEKERJAAN_BEDA_JENIS. Cari lewat nama: baris
 *  dengan jenis yang sama didahulukan, lalu baris tanpa jenis (sama dengan kunci pekerjaan||jenis v1). */
function jenisPekerjaanHartek_(jenisId, nama, jenisPg) {
  var kunci = function (v) { return String(v || '').trim().replace(/\s+/g, ' ').toLowerCase(); };
  var semua = jenisMasterHartek_(true).filter(function (r) { return jenisMasterPgHartek_(r.jenis_pekerjaan) !== null; });
  var cocok;
  if (jenisId) cocok = semua.filter(function (r) { return String(r.jenis_id) === String(jenisId); })[0];
  else {
    var nm = semua.filter(function (r) { return kunci(r.nama) === kunci(nama); });
    cocok = nm.filter(function (r) { return jenisMasterPgHartek_(r.jenis_pekerjaan) === jenisPg; })[0] ||
      nm.filter(function (r) { return jenisMasterPgHartek_(r.jenis_pekerjaan) === ''; })[0] || nm[0];
  }
  if (!cocok) throw new SisiError_('PEKERJAAN_TIDAK_DIKENAL', String(jenisId || nama || ''));
  var jm = jenisMasterPgHartek_(cocok.jenis_pekerjaan);
  if (jenisPg && jm && jm !== jenisPg) throw new SisiError_('PEKERJAAN_BEDA_JENIS', String(cocok.nama).trim() + ' hanya untuk ' + jm);
  return { jenisId: String(cocok.jenis_id), nama: String(cocok.nama).trim(), satuan: String(cocok.satuan || '').trim(),
           kolomGaspol: kolomGaspolHartek_(cocok.kolom_gaspol) };
}

/** Hirarki hari ini (atau tanggal yang diminta) untuk tim sesi: header > PG > pekerjaan > material / grounding / pemerataan. */
function getHartekHarian_(sesi, data) {
  wajibPetugasHartek_(sesi);
  var d = validasi_(data, { tanggal: { tipe: 'tanggal' } });
  var tanggal = d.tanggal || tanggalHariIniHartek_();
  var h = headerTimHartek_(tabelHartek_(HARTEK_SHEET_.HEADER).rows, sesi.timId, tanggal);
  if (!h) return { tanggal: tanggal, header: null, objek: [] };
  return dokHartekBaris_(h, tanggal, tabelHartek_(HARTEK_SHEET_.PG).rows, tabelHartek_(HARTEK_SHEET_.PEKERJAAN).rows,
    tabelHartek_(HARTEK_SHEET_.MATERIAL).rows, tabelHartek_(HARTEK_SHEET_.GROUNDING).rows, tabelHartek_(HARTEK_SHEET_.PEMERATAAN).rows);
}

/** v1.0.17: dokumen satu laporan Hartek (bentuk getHartekHarian) dari baris sheet; dipakai harian + arsip. */
function dokHartekBaris_(h, tanggal, rowsPg, rowsPk, rowsMt, rowsGr, rowsPm) {
  var sub = function (rows) { return rows.filter(function (r) { return String(r.header_id) === String(h.header_id); }); };
  var pg = sub(rowsPg), pk = sub(rowsPk), mt = sub(rowsMt);
  var gr = sub(rowsGr), pm = sub(rowsPm);
  var objek = pg.map(function (p) {
    return {
      pgId: String(p.pg_id), kodePg: String(p.kode_pg), jenisPekerjaan: String(p.jenis_pekerjaan || ''),
      penyulang: String(p.penyulang || ''), section: String(p.section || ''), noGardu: String(p.no_gardu || ''),
      daerah: String(p.daerah || ''), jumlahGawang: p.jumlah_gawang === undefined || p.jumlah_gawang === null ? '' : p.jumlah_gawang,
      koordinat: String(p.koordinat || ''), revision: Number(p.revision) || 1,
      pekerjaan: pk.filter(function (x) { return String(x.pg_id) === String(p.pg_id); }).map(function (x) {
        return {
          pekerjaanId: String(x.pekerjaan_id), kodePekerjaan: String(x.kode_pekerjaan), pekerjaan: String(x.pekerjaan || ''), jenisId: String(x.jenis_id || ''),
          jumlahPekerjaan: x.jumlah_pekerjaan, satuanPekerjaan: String(x.satuan_pekerjaan || ''), revision: Number(x.revision) || 1,   // v0.97.0: revision = fitur ubah rincian
          kolomGaspol: kolomGaspolHartek_(x.kolom_gaspol), labelGaspol: kolomGaspolHartek_(x.kolom_gaspol) ? HARTEK_KOLOM_GASPOL_[kolomGaspolHartek_(x.kolom_gaspol)] : '',
          material: mt.filter(function (m) { return String(m.pekerjaan_id) === String(x.pekerjaan_id); })
            .map(function (m) { return { idBaris: String(m.material_id), kodeMaterial: String(m.kode_material), masterMaterialId: String(m.master_material_id || ''), material: String(m.material), jumlah: m.jumlah, satuan: String(m.satuan || ''), kepemilikan: String(m.kepemilikan || '') }; }),
          grounding: gr.filter(function (g) { return String(g.pekerjaan_id) === String(x.pekerjaan_id); })
            .map(function (g) { return { idBaris: String(g.grounding_id), kodeGrounding: String(g.kode_grounding), jenisPeralatan: String(g.jenis_peralatan || ''), namaPeralatan: String(g.nama_peralatan || ''), kondisiTanah: String(g.kondisi_tanah || ''), hasilSebelum: g.hasil_sebelum === undefined || g.hasil_sebelum === null ? '' : g.hasil_sebelum, hasilSesudah: g.hasil_sesudah === undefined || g.hasil_sesudah === null ? '' : g.hasil_sesudah, foto: fotoLinkHartek_('grounding', g) }; }),
          pemerataan: pm.filter(function (q) { return String(q.pekerjaan_id) === String(x.pekerjaan_id); })
            .map(function (q) { return { idBaris: String(q.pemerataan_id), kodePemerataan: String(q.kode_pemerataan), noGardu: String(q.no_gardu || ''), alamat: String(q.alamat || ''), sebR: q.seb_r, sebS: q.seb_s, sebT: q.seb_t, sesR: q.ses_r, sesS: q.ses_s, sesT: q.ses_t, foto: fotoLinkHartek_('pemerataan', q) }; })
        };
      })
    };
  });
  return {
    tanggal: tanggal,
    header: {
      headerId: String(h.header_id), kodeHeader: String(h['kode_header']), hari: String(h['hari'] || ''),
      revision: Number(h.revision) || 1, koordinatAwal: String(h['koordinat_awal'] || ''), koordinatAkhir: String(h['koordinat_akhir'] || ''),
      kmAwal: h['km_awal'] === '' ? '' : h['km_awal'], kmAkhir: h['km_akhir'] === '' ? '' : h['km_akhir'], kendala: String(h['kendala'] || '')
    },
    objek: objek
  };
}

/* ===== endpoint tulis (petugas, hari ini saja) ===== */

/* ===== header Hartek: buat / ubah (1 header per tim per hari, tanpa batal atau hapus) ===== */

var HARTEK_ISI_HEADER_ = {
  buat: {
    headerId: { tipe: 'uuid' },   // ID header baru dari HP (opsional; kalau kosong server membuat sendiri)
    koordinatAwal: { tipe: 'koordinat' }, koordinatAkhir: { tipe: 'koordinat' },
    kmAwal: { tipe: 'angka', min: 0, max: 100000 }, kmAkhir: { tipe: 'angka', min: 0, max: 100000 },
    kendala: { tipe: 'teks', maks: 500, multiBaris: true, maksBaris: 5 }
  },
  ubah: {
    headerId: { tipe: 'uuid', wajib: true }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 },
    koordinatAwal: { tipe: 'koordinat' }, koordinatAkhir: { tipe: 'koordinat' },
    kmAwal: { tipe: 'angka', min: 0, max: 100000 }, kmAkhir: { tipe: 'angka', min: 0, max: 100000 },
    kendala: { tipe: 'teks', maks: 500, multiBaris: true, maksBaris: 5 }
  },
};

/** Header AKTIF tim sesi untuk tanggal hari ini; null kalau belum ada. */
function headerAktifHariIniHartek_(rows, timId) {
  return rows.filter(function (h) {
    return String(h.tim_id) === String(timId) && tglHartek_(h) === tanggalHariIniHartek_() && h.status === 'AKTIF';
  })[0] || null;
}

/** Header milik tim sesi, boleh diubah: hari ini saja. */
function headerUbahHartek_(rows, headerId, timId) {
  var h = rows.filter(function (x) { return String(x.header_id) === String(headerId); })[0];
  if (!h) throw new SisiError_('DATA_TIDAK_DITEMUKAN', headerId);
  if (String(h.tim_id) !== String(timId)) throw new SisiError_('BUKAN_MILIK_TIM', headerId);
  if (tglHartek_(h) !== tanggalHariIniHartek_()) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', headerId);
  return h;
}

function kmHartek_(kmAwal, kmAkhir) {
  if (typeof kmAwal === 'number' && typeof kmAkhir === 'number' && kmAkhir < kmAwal) throw new SisiError_('KM_AKHIR_KURANG', 'kmAkhir');
}

/** Perangkat yang membuat header (dari log_Audit HARTEK_HEADER_BUAT). Kosong kalau tidak tercatat. */
function perangkatBuatHeaderHartek_(kode) {
  var log = tabel_('AUTH_SHEET_ID', 'log_Audit').rows.filter(function (r) {
    return r.aksi === 'HARTEK_HEADER_BUAT' && String(r.target) === String(kode);
  })[0];
  return log ? String(log.device_id || '') : '';
}

/** Header sudah ada dan dibuat dari perangkat lain tim yang sama: data pekerjaan dari perangkat ini ikut ke header itu
 *  (penyulang, pekerjaan, material, dst. sudah menempel ke tim + tanggal). Koordinat, KM, dan kendala TIDAK diubah:
 *  yang mengikuti permintaan pertama ke server. */
function gabungHeaderHartek_(sesi, t, h, d) {
  var asal = perangkatBuatHeaderHartek_(h['kode_header']);
  if (!asal || asal === String(sesi.deviceId || '')) throw new SisiError_('LAPORAN_UTAMA_SUDAH_DIBUAT', h['kode_header']);
  auditLog_(sesi, 'HARTEK_HEADER_GABUNG', h['kode_header'], 'perangkat ' + String(sesi.deviceId || '') + ' ikut header pertama', 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
  return { headerId: String(h.header_id), kodeHeader: String(h['kode_header']), tanggal: tglHartek_(h), duplikat: false, digabung: true };
}

/** Buat header hari ini untuk tim (kode HAR-<ULP><YYMMDD><NNN> dibuat server). Satu header AKTIF per tim per hari. */
function buatHeaderHartek_(sesi, data) {
  wajibPetugasHartek_(sesi);
  var d = validasi_(data, HARTEK_ISI_HEADER_.buat);
  kmHartek_(d.kmAwal, d.kmAkhir);
  return denganLock_(function () {
    var t = tabelHartek_(HARTEK_SHEET_.HEADER);
    // v0.87.8: header hari ini sudah ada. Perangkat yang sama = ditolak (kartu: Laporan Utama sudah dibuat).
    // Perangkat BEDA dari tim yang sama = digabung ke header itu (isian yang masih kosong diisi dari perangkat ini).
    var ada = headerAktifHariIniHartek_(t.rows, sesi.timId);
    // v0.95.0 (input lokal + kirim otomatis): kiriman ulang header yang SAMA (ID sama, mis. jawaban server hilang
    // karena sinyal putus) = berhasil tanpa membuat apa pun. Header lain hari ini tetap mengikuti aturan v0.87.8.
    if (ada && d.headerId && String(ada.header_id) === String(d.headerId)) {
      return { headerId: String(ada.header_id), kodeHeader: String(ada['kode_header']), tanggal: tglHartek_(ada), duplikat: true };
    }
    if (ada) return gabungHeaderHartek_(sesi, t, ada, d);
    // v0.87.12 (cek guard header): ID dari HP tidak boleh bentrok dengan header lain (tim mana pun)
    if (d.headerId && t.rows.some(function (h) { return String(h.header_id) === String(d.headerId); })) throw new SisiError_('ID_DIPAKAI', d.headerId);
    var tanggal = tanggalHariIniHartek_();
    var c = cfg_();
    var awalan = 'HAR-' + c.KODE_ULP + tanggal.slice(2, 4) + tanggal.slice(5, 7) + tanggal.slice(8, 10);
    var kode = awalan + pad3_(urutBerikutHartek_(t.rows, 'kode_header', awalan));
    var id = d.headerId || uuid_(), sekarang = sekarangIso_();
    tambahBaris_(t, {
      'nomor': t.rows.length + 1, 'kode_header': kode, 'ulp': c.ULP_NAMA, 'hari': hariTanggalHartek_(tanggal), 'tanggal': tanggal,
      'tim': sesi.timNama || '',
      'koordinat_awal': d.koordinatAwal ? d.koordinatAwal.teks : '', 'koordinat_akhir': d.koordinatAkhir ? d.koordinatAkhir.teks : '',
      'km_awal': d.kmAwal === undefined ? '' : d.kmAwal, 'km_akhir': d.kmAkhir === undefined ? '' : d.kmAkhir,
      'kendala': d.kendala || '', 'wa_text': '',
      'timestamp': sekarang, 'input_by': sesi.username || sesi.userId, 'timestamp_update': sekarang,
      header_id: id, tim_id: sesi.timId, status: 'AKTIF', revision: 1, dibuat_oleh: sesi.userId,
      waktu_perangkat: '', diubah_oleh: sesi.userId
    });
    auditLog_(sesi, 'HARTEK_HEADER_BUAT', kode, sesi.timNama || '', 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { headerId: id, kodeHeader: kode, tanggal: tanggal, duplikat: false };
  }, 20000);
}

/** Ubah koordinat / KM / kendala header hari ini. Revision wajib sama dengan yang dilihat HP (KONFLIK_REVISION kalau beda). */
function ubahHeaderHartek_(sesi, data) {
  wajibPetugasHartek_(sesi);
  var d = validasi_(data, HARTEK_ISI_HEADER_.ubah);
  kmHartek_(d.kmAwal, d.kmAkhir);
  return denganLock_(function () {
    var t = tabelHartek_(HARTEK_SHEET_.HEADER);
    var h = headerUbahHartek_(t.rows, d.headerId, sesi.timId);
    var u = {};
    if (d.koordinatAwal !== undefined) u['koordinat_awal'] = d.koordinatAwal.teks;
    if (d.koordinatAkhir !== undefined) u['koordinat_akhir'] = d.koordinatAkhir.teks;
    if (d.kmAwal !== undefined) u['km_awal'] = d.kmAwal;
    if (d.kmAkhir !== undefined) u['km_akhir'] = d.kmAkhir;
    if (d.kendala !== undefined) u['kendala'] = d.kendala;
    if (!Object.keys(u).length) throw new SisiError_('FIELD_WAJIB', 'koordinatAwal');
    u['timestamp_update'] = sekarangIso_();
    u.diubah_oleh = sesi.userId;
    ubahBaris_(t, 'header_id', d.headerId, u, d.revision);
    auditLog_(sesi, 'HARTEK_HEADER_UBAH', h['kode_header'], Object.keys(u).join(', '), 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { headerId: String(d.headerId), kodeHeader: String(h['kode_header']), revision: d.revision + 1 };
  }, 20000);
}

/** v0.95.0 (input lokal + kirim otomatis): ID baris dari HP (idBaris). Sudah ada di sheet = kiriman ulang:
 *  milik tim sendiri -> kembalikan baris itu (duplikat), milik tim lain -> ID_DIPAKAI. null = belum ada (buat baru). */
function barisUlangHartek_(rows, kolomId, idBaris, sesi) {
  if (!idBaris) return null;
  var r = rows.filter(function (x) { return String(x[kolomId]) === String(idBaris); })[0];
  if (!r) return null;
  if (String(r.tim_id) !== String(sesi.timId)) throw new SisiError_('ID_DIPAKAI', idBaris);
  return r;
}

/** Tag objek dari kode PG (PNY / GRD / NTK). */
function tagDariKodePgHartek_(kode) {
  var m = /-(PNY|GRD|NTK)\./.exec(String(kode || ''));
  return m ? m[1] : '';
}

/** v0.87.14 (keputusan kvlar 13 Okt 2026): satu gardu boleh dipakai DUA KALI dalam satu header HANYA kalau
 *  satunya GRD (Gardu) dan satunya NTK (Non - Teknik). Selain itu = GARDU_GANDA. */
function cekGarduGandaHartek_(rowsPg, headerId, garduId, tagBaru, kecualiPgId) {
  if (!garduId) return;
  var ada = rowsPg.filter(function (p) {
    return String(p.header_id) === String(headerId) && String(p.gardu_id) === String(garduId) &&
      (!kecualiPgId || String(p.pg_id) !== String(kecualiPgId));
  });
  if (!ada.length) return;
  var tags = ada.map(function (p) { return tagDariKodePgHartek_(p.kode_pg); }).concat([tagBaru]).sort().join('|');
  if (ada.length === 1 && tags === 'GRD|NTK') return;
  throw new SisiError_('GARDU_GANDA', String(ada[0].no_gardu || garduId));
}

/** Ubah PenyulangGardu hari ini. Revision wajib. Ditolak kalau sudah ada pekerjaan di bawahnya (MASIH_ADA_ANAK).
 *  Jenis objek (kode PNY / GRD / NTK) tidak bisa diubah: kode sudah dibuat. */
function ubahPgHartek_(sesi, data) {
  wajibPetugasHartek_(sesi);
  var d = validasi_(data, {
    pgId: { tipe: 'uuid', wajib: true }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 },
    penyulang: { tipe: 'teks', maks: 80 }, section: { tipe: 'teks', maks: 80 },
    noGardu: { tipe: 'teks', maks: 20 }, daerah: { tipe: 'teks', maks: 200 },
    jumlahGawang: { tipe: 'angka', min: 0, max: 9999, bulat: true },
    koordinat: { tipe: 'koordinat' }   // v0.91.0: titik lokasi PG (opsional)
  });
  return denganLock_(function () {
    var t = tabelHartek_(HARTEK_SHEET_.PG);
    var pg = indukHartekMilikTim_(t.rows, 'pg_id', d.pgId, sesi.timId, 'penyulang/gardu');
    if (Number(pg.revision) !== d.revision) throw new SisiError_('KONFLIK_REVISION', d.pgId);
    var anak = tabelHartek_(HARTEK_SHEET_.PEKERJAAN).rows.some(function (x) { return String(x.pg_id) === String(d.pgId); });
    if (anak) throw new SisiError_('MASIH_ADA_ANAK', pg.kode_pg);
    var tag = tagDariKodePgHartek_(pg.kode_pg);
    var u = {};
    if (tag === 'PNY') {
      if (d.noGardu !== undefined) throw new SisiError_('FIELD_TIDAK_DIKENAL', 'noGardu');
      var pen = d.penyulang !== undefined ? d.penyulang : String(pg.penyulang || '');
      var sec = d.section !== undefined ? d.section : String(pg.section || '');
      if (!pen || !sec) throw new SisiError_('FIELD_WAJIB', !pen ? 'penyulang' : 'section');
      var masterP = jaringanAktifHartek_().filter(function (r) { return String(r.penyulang).trim() === pen.trim(); });
      if (!masterP.length) throw new SisiError_('PENYULANG_TIDAK_VALID', pen);
      var masterS = masterP.filter(function (r) { return String(r.section).trim() === sec.trim(); })[0];
      if (!masterS) throw new SisiError_('SECTION_TIDAK_VALID', sec);
      u.penyulang = String(masterS.penyulang).trim();
      u.section = String(masterS.section).trim();
      if (d.jumlahGawang !== undefined) u.jumlah_gawang = d.jumlahGawang;
    } else {
      if (d.penyulang !== undefined || d.section !== undefined || d.jumlahGawang !== undefined) throw new SisiError_('FIELD_TIDAK_DIKENAL', 'penyulang');
      if (d.noGardu !== undefined) {
        var nomor = String(d.noGardu).trim().toUpperCase();
        var g = tabel_('GARDU_SHEET_ID', 'db_Gardu').rows.filter(function (r) { return String(r['No Gardu'] || '').trim().toUpperCase() === nomor; })[0];
        if (!g) throw new SisiError_('GARDU_TIDAK_ADA', nomor);
        cekGarduGandaHartek_(t.rows, pg.header_id, String(g.gardu_id || ''), tag, d.pgId);
        u.gardu_id = String(g.gardu_id || ''); u.no_gardu = nomor;
        u.penyulang = String(g.Penyulang || ''); u.section = String(g.Section || '');
        if (d.daerah === undefined) u.daerah = String(g.Alamat || '');
      }
    }
    if (d.daerah !== undefined) u.daerah = d.daerah;
    if (d.koordinat !== undefined) u.koordinat = d.koordinat.teks;
    if (!Object.keys(u).length) throw new SisiError_('FIELD_WAJIB', 'penyulang');
    u.timestamp_update = sekarangIso_();
    u.diubah_oleh = sesi.userId;
    ubahBaris_(t, 'pg_id', d.pgId, u, d.revision);
    auditLog_(sesi, 'HARTEK_PG_UBAH', pg.kode_pg, Object.keys(u).join(', '), 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { pgId: String(d.pgId), kodePg: String(pg.kode_pg), revision: d.revision + 1 };
  }, 20000);
}

/** Tambah PenyulangGardu (objek). Jaringan = penyulang & section manual. Gardu / Non-Teknik = data dari db_Gardu. */
function simpanPgHartek_(sesi, data) {
  wajibPetugasHartek_(sesi);
  var d = validasi_(data, {
    headerId: { tipe: 'uuid', wajib: true },
    jenisPekerjaan: { tipe: 'teks', wajib: true, maks: 80 },
    penyulang: { tipe: 'teks', maks: 80 },
    section: { tipe: 'teks', maks: 80 },
    noGardu: { tipe: 'teks', maks: 20 },
    daerah: { tipe: 'teks', maks: 200 },
    jumlahGawang: { tipe: 'angka', min: 0, max: 9999, bulat: true },
    koordinat: { tipe: 'koordinat' },   // v0.91.0: titik lokasi PG (opsional)
    idBaris: { tipe: 'uuid' }           // v0.95.0: ID dari HP (kiriman ulang aman)
  });
  jenisPgBakuHartek_(d.jenisPekerjaan);   // ditolak sebelum lock
  return denganLock_(function () {
    var ulang = barisUlangHartek_(tabelHartek_(HARTEK_SHEET_.PG).rows, 'pg_id', d.idBaris, sesi);
    if (ulang) return { pgId: String(ulang.pg_id), kodePg: String(ulang.kode_pg), duplikat: true };
    var th = tabelHartek_(HARTEK_SHEET_.HEADER);
    var hdr = indukHartekMilikTim_(th.rows, 'header_id', d.headerId, sesi.timId, 'header');
    var jenisPg = jenisPgBakuHartek_(d.jenisPekerjaan);
    var tag = tagObjekHartek_(jenisPg);
    var t = tabelHartek_(HARTEK_SHEET_.PG);
    var isJaringan = tag === 'PNY';
    var pen = d.penyulang || '', sec = d.section || '', dae = d.daerah || '', gardu = '', noGardu = '', garduKoor = '';
    if (!isJaringan) {
      noGardu = String(d.noGardu || '').trim().toUpperCase();
      if (!noGardu) throw new SisiError_('FIELD_WAJIB', 'noGardu');
      var g = tabel_('GARDU_SHEET_ID', 'db_Gardu').rows.filter(function (r) { return String(r['No Gardu'] || '').trim().toUpperCase() === noGardu; })[0];
      if (!g) throw new SisiError_('GARDU_TIDAK_ADA', noGardu);
      gardu = String(g.gardu_id || ''); pen = String(g.Penyulang || ''); sec = String(g.Section || ''); dae = String(g.Alamat || '');
      garduKoor = koordinatGarduHartek_(g);   // v0.95.0: titik gardu dari db_Gardu kalau HP tidak mengirim
    } else {
      noGardu = '';
      if (!pen || !sec) throw new SisiError_('FIELD_WAJIB', !pen ? 'penyulang' : 'section');
      // v0.87.1: penyulang + section hanya dari db_Jaringan aktif (pencocokan persis, nama diambil dari master)
      var masterP = jaringanAktifHartek_().filter(function (r) { return String(r.penyulang).trim() === pen.trim(); });
      if (!masterP.length) throw new SisiError_('PENYULANG_TIDAK_VALID', pen);
      var masterS = masterP.filter(function (r) { return String(r.section).trim() === sec.trim(); })[0];
      if (!masterS) throw new SisiError_('SECTION_TIDAK_VALID', sec);
      pen = String(masterS.penyulang).trim(); sec = String(masterS.section).trim();
      // v0.97.0 (kvlar 15 Okt 2026): daerah + jumlah gawang WAJIB untuk lokasi Jaringan (Gardu / Non - Teknik
      // memakai alamat dari db_Gardu, jadi tidak diisi petugas).
      if (!dae) throw new SisiError_('FIELD_WAJIB', 'daerah');
      if (d.jumlahGawang === undefined) throw new SisiError_('FIELD_WAJIB', 'jumlahGawang');
    }
    cekGarduGandaHartek_(t.rows, hdr.header_id, gardu, tag, null);
    var awalan = hdr['kode_header'] + '-' + tag + '.';
    var kode = awalan + pad3_(urutBerikutHartek_(t.rows, 'kode_pg', awalan));
    var id = d.idBaris || uuid_(), sekarang = sekarangIso_();
    tambahBaris_(t, sisipAuditHartek_({
      nomor: t.rows.length + 1, pg_id: id, kode_pg: kode, header_id: hdr.header_id, kode_header: hdr['kode_header'], tim_id: sesi.timId,
      tanggal: tglHartek_(hdr), hari: hdr['hari'], ulp: hdr['ulp'], jenis_pekerjaan: jenisPg,
      penyulang: pen, section: sec, gardu_id: gardu, no_gardu: noGardu, daerah: dae,
      jumlah_gawang: isJaringan && d.jumlahGawang !== undefined ? d.jumlahGawang : '',
      koordinat: d.koordinat ? d.koordinat.teks : garduKoor
    }, sesi, sekarang, true));
    auditLog_(sesi, 'HARTEK_PG_SIMPAN', kode, jenisPg, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { pgId: id, kodePg: kode };
  }, 20000);
}

function simpanPekerjaanHartek_(sesi, data) {
  wajibPetugasHartek_(sesi);
  var d = validasi_(data, {
    pgId: { tipe: 'uuid', wajib: true },
    jenisId: { tipe: 'teks', maks: 60 },     // v0.91.0: dari dropdown (db_Jenis_Pekerjaan modul HARTEK)
    pekerjaan: { tipe: 'teks', maks: 200 },  // cadangan HP lama: dicocokkan ke nama master
    jumlahPekerjaan: { tipe: 'angka', min: 0, max: 999999 },
    satuanPekerjaan: { tipe: 'teks', maks: 30 },
    idBaris: { tipe: 'uuid' }   // v0.95.0
  });
  if (!d.jenisId && !d.pekerjaan) throw new SisiError_('FIELD_WAJIB', 'jenisId');
  return denganLock_(function () {
    var ulang = barisUlangHartek_(tabelHartek_(HARTEK_SHEET_.PEKERJAAN).rows, 'pekerjaan_id', d.idBaris, sesi);
    if (ulang) return { pekerjaanId: String(ulang.pekerjaan_id), kodePekerjaan: String(ulang.kode_pekerjaan), pekerjaan: String(ulang.pekerjaan || ''),
                        jenisId: String(ulang.jenis_id || ''), kolomGaspol: kolomGaspolHartek_(ulang.kolom_gaspol), duplikat: true };
    var pg = indukHartekMilikTim_(tabelHartek_(HARTEK_SHEET_.PG).rows, 'pg_id', d.pgId, sesi.timId, 'penyulang/gardu');
    var jenis = jenisPekerjaanHartek_(d.jenisId, d.pekerjaan, jenisMasterPgHartek_(pg.jenis_pekerjaan) || '');
    // v0.94.0: pekerjaan yang masuk GASPOL wajib punya jumlah (GASPOL menjumlah jumlah_pekerjaan)
    // v0.97.0 (kvlar 15 Okt 2026): jumlah WAJIB untuk SEMUA pekerjaan, bukan hanya yang masuk GASPOL
    if (d.jumlahPekerjaan === undefined) throw new SisiError_('FIELD_WAJIB', 'jumlahPekerjaan');
    var t = tabelHartek_(HARTEK_SHEET_.PEKERJAAN);
    var awalan = pg.kode_pg + '-PKJ.';
    var kode = awalan + pad3_(urutBerikutHartek_(t.rows, 'kode_pekerjaan', awalan));
    var id = d.idBaris || uuid_(), sekarang = sekarangIso_();
    tambahBaris_(t, sisipAuditHartek_({
      nomor: t.rows.length + 1, pekerjaan_id: id, kode_pekerjaan: kode, pg_id: pg.pg_id, kode_pg: pg.kode_pg, header_id: pg.header_id,
      kode_header: pg.kode_header, tim_id: sesi.timId, tanggal: tglHartek_(pg), hari: pg.hari, ulp: pg.ulp,
      jenis_pekerjaan: pg.jenis_pekerjaan, penyulang: pg.penyulang, section: pg.section, no_gardu: pg.no_gardu,
      pekerjaan: jenis.nama, jenis_id: jenis.jenisId, jumlah_pekerjaan: d.jumlahPekerjaan === undefined ? '' : d.jumlahPekerjaan,
      // v0.94.0: satuan dari master kalau master mengisinya (sama dengan v1); kosong di master = isian HP
      satuan_pekerjaan: jenis.satuan || d.satuanPekerjaan || '', kolom_gaspol: jenis.kolomGaspol
    }, sesi, sekarang, true));
    auditLog_(sesi, 'HARTEK_PEKERJAAN_SIMPAN', kode, jenis.nama, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { pekerjaanId: id, kodePekerjaan: kode, pekerjaan: jenis.nama, jenisId: jenis.jenisId, kolomGaspol: jenis.kolomGaspol };
  }, 20000);
}

/**
 * v0.97.0 / v0.97.4 (kvlar 15 Okt 2026): ubah rincian pekerjaan yang sudah tersimpan. Revision wajib sama dengan yang
 * dilihat HP (KONFLIK_REVISION kalau beda). Selain `jumlahPekerjaan`, petugas juga dapat mengubah jenis / nama
 * `pekerjaan` (via `jenisId` atau `pekerjaan`) sesuai jenis lokasi PG; satuan dan klasifikasi GASPOL mengikuti master.
 */
function ubahPekerjaanHartek_(sesi, data) {
  wajibPetugasHartek_(sesi);
  var d = validasi_(data, {
    pekerjaanId: { tipe: 'uuid', wajib: true },
    revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 },
    jenisId: { tipe: 'teks', maks: 60 },
    pekerjaan: { tipe: 'teks', maks: 200 },
    jumlahPekerjaan: { tipe: 'angka', wajib: true, min: 0, max: 999999 },
    satuanPekerjaan: { tipe: 'teks', maks: 30 }
  });
  return denganLock_(function () {
    var t = tabelHartek_(HARTEK_SHEET_.PEKERJAAN);
    var pk = indukHartekMilikTim_(t.rows, 'pekerjaan_id', d.pekerjaanId, sesi.timId, 'pekerjaan');
    if (pekerjaanDariWo_(d.pekerjaanId)) throw new SisiError_('TERKUNCI_WO', String(pk.kode_pekerjaan));   // v1.0.10
    if (Number(pk.revision) !== d.revision) throw new SisiError_('KONFLIK_REVISION', d.pekerjaanId);
    var u = {
      jumlah_pekerjaan: d.jumlahPekerjaan, timestamp_update: sekarangIso_(), diubah_oleh: sesi.userId
    };
    var hasil = { pekerjaanId: String(d.pekerjaanId), kodePekerjaan: String(pk.kode_pekerjaan), revision: d.revision + 1 };
    if (d.jenisId || d.pekerjaan) {
      var jenis = jenisPekerjaanHartek_(d.jenisId, d.pekerjaan, jenisMasterPgHartek_(pk.jenis_pekerjaan) || '');
      u.pekerjaan = jenis.nama;
      u.jenis_id = jenis.jenisId;
      u.satuan_pekerjaan = jenis.satuan || d.satuanPekerjaan || String(pk.satuan_pekerjaan || '');
      u.kolom_gaspol = jenis.kolomGaspol;
      hasil.pekerjaan = jenis.nama;
      hasil.jenisId = jenis.jenisId;
      hasil.satuanPekerjaan = u.satuan_pekerjaan;
      hasil.kolomGaspol = jenis.kolomGaspol;
    }
    ubahBaris_(t, 'pekerjaan_id', d.pekerjaanId, u, d.revision);
    auditLog_(sesi, 'HARTEK_PEKERJAAN_UBAH', pk.kode_pekerjaan, Object.keys(u).join(', '), 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return hasil;
  }, 20000);
}

/** Induk pekerjaan (dari hari ini, tim sesi) dengan konteks lengkap. */
function pekerjaanIndukHartek_(sesi, pekerjaanId) {
  return indukHartekMilikTim_(tabelHartek_(HARTEK_SHEET_.PEKERJAAN).rows, 'pekerjaan_id', pekerjaanId, sesi.timId, 'pekerjaan');
}

function simpanMaterialHartek_(sesi, data) {
  wajibPetugasHartek_(sesi);
  var d = validasi_(data, {
    pekerjaanId: { tipe: 'uuid', wajib: true },
    materialId: { tipe: 'teks', maks: 60 },   // v0.91.0: db_Material.material_id dari dropdown (utama)
    material: { tipe: 'teks', maks: 200 },    // cadangan HP lama: dicocokkan ke nama master
    jumlah: { tipe: 'angka', wajib: true, min: 0, max: 999999 },
    satuan: { tipe: 'teks', maks: 30 },
    kepemilikan: { tipe: 'teks', wajib: true, maks: 60 },   // v0.97.0 (kvlar 15 Okt 2026): wajib diisi
    idBaris: { tipe: 'uuid' }   // v0.95.0: ID baris material dari HP (materialId = ID master)
  });
  if (!d.materialId && !d.material) throw new SisiError_('FIELD_WAJIB', 'materialId');
  return denganLock_(function () {
    var ulang = barisUlangHartek_(tabelHartek_(HARTEK_SHEET_.MATERIAL).rows, 'material_id', d.idBaris, sesi);
    if (ulang) return { materialId: String(ulang.material_id), kodeMaterial: String(ulang.kode_material), duplikat: true };
    var pk = pekerjaanIndukHartek_(sesi, d.pekerjaanId);
    var master = tabelMaterialHartek_().rows.filter(function (r) {
      if (!isAktif_(r.aktif) || !String(r.nama_material || '').trim()) return false;
      return d.materialId ? String(r.material_id) === String(d.materialId)
        : String(r.nama_material).trim().toLowerCase() === d.material.trim().toLowerCase();
    })[0];
    if (!master) throw new SisiError_('MATERIAL_TIDAK_VALID', d.materialId || d.material);
    var milik = String(d.kepemilikan || '').trim();
    if (milik) {
      var daftarMilik = kepemilikanAktifHartek_();
      if (daftarMilik.length) {
        var cocokM = daftarMilik.filter(function (x) {
          return x.nama.toLowerCase() === milik.toLowerCase() || x.kepemilikanId === milik;
        })[0];
        if (!cocokM) throw new SisiError_('KEPEMILIKAN_TIDAK_VALID', milik);
        milik = cocokM.nama;
      }
    }
    var t = tabelHartek_(HARTEK_SHEET_.MATERIAL);
    var awalan = pk.kode_pekerjaan + '-MAT.';
    var kode = awalan + pad3_(urutBerikutHartek_(t.rows, 'kode_material', awalan));
    var id = d.idBaris || uuid_(), sekarang = sekarangIso_();
    tambahBaris_(t, sisipAuditHartek_({
      nomor: t.rows.length + 1, material_id: id, kode_material: kode, pekerjaan_id: pk.pekerjaan_id, kode_pekerjaan: pk.kode_pekerjaan, pg_id: pk.pg_id,
      header_id: pk.header_id, kode_header: pk.kode_header, tim_id: sesi.timId, tanggal: tglHartek_(pk),
      material: String(master.nama_material).trim(), master_material_id: String(master.material_id || ''),
      jumlah: d.jumlah, satuan: String(master.satuan || '').trim() || d.satuan || '', kepemilikan: milik
    }, sesi, sekarang, true));
    auditLog_(sesi, 'HARTEK_MATERIAL_SIMPAN', kode, String(master.nama_material).trim(), 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { materialId: id, kodeMaterial: kode };
  }, 20000);
}

function simpanGroundingHartek_(sesi, data) {
  wajibPetugasHartek_(sesi);
  var d = validasi_(data, {
    pekerjaanId: { tipe: 'uuid', wajib: true },
    jenisPeralatan: { tipe: 'teks', wajib: true, maks: 80 },
    namaPeralatan: { tipe: 'teks', maks: 120 },
    kondisiTanah: { tipe: 'teks', maks: 120 },
    // v0.91.0: hasil ukur tahanan grounding dalam ohm (angka), bukan teks bebas
    hasilSebelum: { tipe: 'angka', min: 0, max: 99999 },
    hasilSesudah: { tipe: 'angka', min: 0, max: 99999 },
    idBaris: { tipe: 'uuid' }   // v0.95.0
  });
  return denganLock_(function () {
    var ulang = barisUlangHartek_(tabelHartek_(HARTEK_SHEET_.GROUNDING).rows, 'grounding_id', d.idBaris, sesi);
    if (ulang) return { groundingId: String(ulang.grounding_id), kodeGrounding: String(ulang.kode_grounding), duplikat: true };
    var pk = pekerjaanIndukHartek_(sesi, d.pekerjaanId);
    // v0.97.0 (kvlar 15 Okt 2026): hanya pekerjaan "grounding"; Pasang = sesudah saja, lainnya = sebelum + sesudah
    if (!groundingBolehHartek_(pk.pekerjaan)) throw new SisiError_('PEKERJAAN_TIDAK_SESUAI', 'grounding hanya untuk pekerjaan Grounding');
    var hanyaSesudah = groundingHanyaSesudahHartek_(pk.pekerjaan);
    if (d.hasilSesudah === undefined) throw new SisiError_('FIELD_WAJIB', 'hasilSesudah');
    if (!hanyaSesudah && d.hasilSebelum === undefined) throw new SisiError_('FIELD_WAJIB', 'hasilSebelum');
    var jenisAlat = String(d.jenisPeralatan || '').trim();
    var daftarAlat = jenisPeralatanAktifHartek_();
    if (daftarAlat.length) {
      var cocokA = daftarAlat.filter(function (x) {
        return x.nama.toLowerCase() === jenisAlat.toLowerCase() || x.peralatanId === jenisAlat;
      })[0];
      if (!cocokA) throw new SisiError_('JENIS_PERALATAN_TIDAK_VALID', jenisAlat);
      jenisAlat = cocokA.nama;
    }
    var namaAlat = namaPeralatanGroundingHartek_(pk.jenis_pekerjaan, pk.section, pk.no_gardu, d.namaPeralatan);
    var sebelum = hanyaSesudah ? '' : d.hasilSebelum;   // Pasang Grounding: nilai sebelum memang tidak ada
    var t = tabelHartek_(HARTEK_SHEET_.GROUNDING);
    var awalan = pk.kode_pekerjaan + '-GND.';
    var kode = awalan + pad3_(urutBerikutHartek_(t.rows, 'kode_grounding', awalan));
    var id = d.idBaris || uuid_(), sekarang = sekarangIso_();
    tambahBaris_(t, sisipAuditHartek_({
      nomor: t.rows.length + 1, grounding_id: id, kode_grounding: kode, pekerjaan_id: pk.pekerjaan_id, kode_pekerjaan: pk.kode_pekerjaan, kode_pg: pk.kode_pg, pg_id: pk.pg_id,
      header_id: pk.header_id, kode_header: pk.kode_header, tim_id: sesi.timId, tanggal: tglHartek_(pk),
      jenis_peralatan: jenisAlat, nama_peralatan: namaAlat, kondisi_tanah: d.kondisiTanah || '',
      hasil_sebelum: sebelum === undefined ? '' : sebelum, hasil_sesudah: d.hasilSesudah, foto_sebelum_file_id: '', foto_sesudah_file_id: ''
    }, sesi, sekarang, true));
    auditLog_(sesi, 'HARTEK_GROUNDING_SIMPAN', kode, jenisAlat, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { groundingId: id, kodeGrounding: kode };
  }, 20000);
}

function simpanPemerataanHartek_(sesi, data) {
  wajibPetugasHartek_(sesi);
  var angka = { tipe: 'angka', min: 0, max: 99999 };
  var d = validasi_(data, {
    pekerjaanId: { tipe: 'uuid', wajib: true },
    alamat: { tipe: 'teks', maks: 200 },
    sebR: angka, sebS: angka, sebT: angka, sesR: angka, sesS: angka, sesT: angka,
    idBaris: { tipe: 'uuid' }   // v0.95.0
  });
  return denganLock_(function () {
    var ulang = barisUlangHartek_(tabelHartek_(HARTEK_SHEET_.PEMERATAAN).rows, 'pemerataan_id', d.idBaris, sesi);
    if (ulang) return { pemerataanId: String(ulang.pemerataan_id), kodePemerataan: String(ulang.kode_pemerataan), duplikat: true };
    var pk = pekerjaanIndukHartek_(sesi, d.pekerjaanId);
    if (HARTEK_PEMERATAAN_JENIS_.indexOf(String(pk.pekerjaan || '').trim().toLowerCase()) === -1) {
      throw new SisiError_('PEKERJAAN_TIDAK_SESUAI', 'pemerataan hanya untuk Pemerataan / Pembagian Beban Gardu');
    }
    var t = tabelHartek_(HARTEK_SHEET_.PEMERATAAN);
    var awalan = pk.kode_pekerjaan + '-PMR.';
    var kode = awalan + pad3_(urutBerikutHartek_(t.rows, 'kode_pemerataan', awalan));
    var id = d.idBaris || uuid_(), sekarang = sekarangIso_();
    tambahBaris_(t, sisipAuditHartek_({
      nomor: t.rows.length + 1, pemerataan_id: id, kode_pemerataan: kode, pekerjaan_id: pk.pekerjaan_id, kode_pekerjaan: pk.kode_pekerjaan, kode_pg: pk.kode_pg, penyulang: pk.penyulang, section: pk.section, no_gardu: pk.no_gardu, pg_id: pk.pg_id,
      header_id: pk.header_id, kode_header: pk.kode_header, tim_id: sesi.timId, tanggal: tglHartek_(pk), alamat: d.alamat || '',
      seb_r: d.sebR, seb_s: d.sebS, seb_t: d.sebT, ses_r: d.sesR, ses_s: d.sesS, ses_t: d.sesT
    }, sesi, sekarang, true));
    auditLog_(sesi, 'HARTEK_PEMERATAAN_SIMPAN', kode, pk.pekerjaan, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { pemerataanId: id, kodePemerataan: kode };
  }, 20000);
}

/* ===== v1.0.0: foto lapangan (grounding, pemerataan beban; dipakai juga Inspeksi Jaringan) ===== */

/** Slot foto per rincian -> awalan kolom (<awalan>_file_id + <awalan>_link). */
var HARTEK_FOTO_ = {
  grounding: { sheet: 'db_Hartek_Grounding', id: 'grounding_id', kode: 'kode_grounding',
    slot: { SEBELUM: 'foto_sebelum', SESUDAH: 'foto_sesudah' } },
  pemerataan: { sheet: 'db_Hartek_PemerataanBeban', id: 'pemerataan_id', kode: 'kode_pemerataan',
    slot: { ARUS_SEBELUM: 'foto_arus_sebelum', TEGANGAN_SEBELUM: 'foto_tegangan_sebelum',
            ARUS_SESUDAH: 'foto_arus_sesudah', TEGANGAN_SESUDAH: 'foto_tegangan_sesudah' } }
};

/** { SLOT: link } untuk HP (slot tanpa foto tidak ikut). */
function fotoLinkHartek_(jenis, r) {
  var o = {}, slot = HARTEK_FOTO_[jenis].slot;
  Object.keys(slot).forEach(function (s) {
    var link = String(r[slot[s] + '_link'] || '').trim();
    if (link) o[s] = link;
  });
  return o;
}

/** Isian foto bersama (Hartek + InsJar): JPEG kamera SiSi <= 2 MB, sisi <= 2048 px, sha256 dicek. */
function isiFotoLapangan_() {
  return {
    sha256: { tipe: 'teks', wajib: true, maks: 64, pola: /^[0-9a-f]{64}$/ },
    ukuranByte: { tipe: 'angka', wajib: true, bulat: true, min: 1, max: FOTO_MAKS_BYTE_ },
    data: { tipe: 'teks', wajib: true, maks: Math.ceil(FOTO_MAKS_BYTE_ / 3) * 4 + 4 }
  };
}

function bytesFotoLapangan_(d) {
  var bytes;
  try { bytes = Utilities.base64Decode(d.data); } catch (e) { throw new SisiError_('FORMAT_SALAH', 'data'); }
  if (bytes.length > FOTO_MAKS_BYTE_) throw new SisiError_('FOTO_TERLALU_BESAR', bytes.length);
  if (bytes.length !== d.ukuranByte) throw new SisiError_('FOTO_RUSAK', 'ukuran');
  if (bytesKeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)) !== d.sha256) throw new SisiError_('FOTO_RUSAK', 'sha256');
  var dim = ukuranJpeg_(bytes);
  if (!dim) throw new SisiError_('FORMAT_FOTO_SALAH');
  if (Math.max(dim.lebar, dim.tinggi) > FOTO_MAKS_SISI_) throw new SisiError_('FOTO_TERLALU_BESAR', dim.lebar + 'x' + dim.tinggi);
  return bytes;
}

/** Tulis foto ke folder Drive privat <akar>/<bagian...>. Kiriman ulang (penanda sama) = file yang sudah ada. */
/**
 * v1.0.18 (permintaan kvlar 22 Okt 2026): kode nama file foto temuan. Kode temuan kosong = kode penyulang utama /
 * header + TEMUAN (bukan UUID, supaya nama file tidak acak).
 */
function kodeFotoTemuan_(r) {
  var t = function (v) { return v === null || v === undefined ? '' : String(v).trim(); };
  return t(r.kode_temuan) || ((t(r.kode_realisasi) || t(r.kode_header) || 'TEMUAN') + '-TEMUAN');
}

function simpanFotoLapangan_(akarId, bagian, penanda, nama, bytes) {
  var folder = folderFoto_(akarId, bagian);
  var file = cariFileFoto_(folder, penanda), baru = !file;
  if (baru) {
    file = folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', nama));
    try { file.setDescription(PENANDA_FOTO_ + penanda); } catch (eD) { /* tanpa penanda */ }
  }
  pastikanFotoPrivat_(file, baru);
  return { fileId: String(file.getId()), link: 'https://drive.google.com/file/d/' + file.getId() + '/view' };
}

/**
 * v1.0.0 (permintaan kvlar 19 Okt 2026): foto grounding (Sebelum / Sesudah) dan pemerataan beban (Arus / Tegangan
 * Sebelum / Sesudah). Baris induk wajib milik tim sesi dan hari ini. File Drive: HARTEK_FOTO_FOLDER_ID / Hartek /
 * <tanggal> / <kode header> / <kode rincian>_<SLOT>.jpg. Kolom <slot>_file_id + <slot>_link diisi. Sudah ada = DUPLIKAT.
 */
function uploadFotoHartek_(sesi, data) {
  wajibPetugasHartek_(sesi);
  var skema = isiFotoLapangan_();
  skema.jenis = { tipe: 'pilihan', wajib: true, pilihan: Object.keys(HARTEK_FOTO_) };
  skema.idBaris = { tipe: 'uuid', wajib: true };
  skema.slot = { tipe: 'teks', wajib: true, maks: 30 };
  var d = validasi_(data, skema);
  var k = HARTEK_FOTO_[d.jenis];
  // v1.0.2 (guard): slot dicek sebagai kunci milik peta sendiri (bukan 'constructor' / '__proto__' dari prototipe)
  if (!Object.prototype.hasOwnProperty.call(k.slot, d.slot)) throw new SisiError_('PILIHAN_TIDAK_VALID', 'slot');
  var kol = k.slot[d.slot];
  var c = cfg_();
  if (!c.HARTEK_FOTO_FOLDER_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'HARTEK_FOTO_FOLDER_ID');
  var bytes = bytesFotoLapangan_(d);
  return denganLock_(function () {
    var t = tabelHartek_(k.sheet);
    var r = indukHartekMilikTim_(t.rows, k.id, d.idBaris, sesi.timId, d.jenis);
    var ada = String(r[kol + '_link'] || '').trim();
    if (ada) return { idBaris: d.idBaris, slot: d.slot, link: ada, status: 'DUPLIKAT' };
    if (d.jenis === 'grounding' && d.slot === 'SEBELUM' && String(r.hasil_sebelum === undefined || r.hasil_sebelum === null ? '' : r.hasil_sebelum).trim() === '') {
      throw new SisiError_('PEKERJAAN_TIDAK_SESUAI', 'pasang grounding hanya foto sesudah');
    }
    var kode = String(r[k.kode] || d.idBaris);
    var f = simpanFotoLapangan_(c.HARTEK_FOTO_FOLDER_ID, ['Hartek', tglHartek_(r), String(r.kode_header || '-')],
      d.idBaris + '-' + d.slot, namaFotoRow_(kode, d.slot, 1), bytes);
    var u = { timestamp_update: sekarangIso_(), diubah_oleh: sesi.userId };
    u[kol + '_file_id'] = f.fileId;
    u[kol + '_link'] = f.link;
    ubahBaris_(t, k.id, d.idBaris, u);
    auditLog_(sesi, 'HARTEK_FOTO_UPLOAD', kode, d.slot, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { idBaris: d.idBaris, slot: d.slot, link: f.link, status: 'OK' };
  }, 30000);
}

/* ===== cek konfigurasi (dipanggil ADMIN_cekKonfigurasi) ===== */

/** v0.88.2: bagian Hartek di ADMIN_cekKonfigurasi. Mengembalikan jumlah masalah (PERHATIAN + GAGAL). */
function cekKonfigHartek_(c) {
  var masalah = 0;
  var ok = function (p) { console.log('  [OK]          ' + p); };
  var perhatian = function (p) { masalah++; console.warn('  [PERHATIAN]   ' + p); };
  var gagal = function (p) { masalah++; console.error('  [GAGAL]       ' + p); };
  console.log('');
  console.log('--- Hartek (SiSi_Hartek + db_Material di SiSi_Master) ---');
  if (!c.HARTEK_SHEET_ID) {
    console.log('  [DILEWATI]    HARTEK_SHEET_ID kosong, modul Hartek belum disiapkan (isi Script Property, lalu ADMIN_siapkanSheetHartek)');
    return 0;
  }
  var ss;
  try { ss = bukaSpreadsheet_(c.HARTEK_SHEET_ID); } catch (e) {
    gagal('HARTEK_SHEET_ID tidak bisa dibuka: ' + (e.message || e));
    return 1;
  }
  if (!c.HARTEK_FOTO_FOLDER_ID) perhatian('HARTEK_FOTO_FOLDER_ID kosong, foto grounding / pemerataan tidak bisa dikirim (folder Drive privat)');
  else ok('HARTEK_FOTO_FOLDER_ID terisi (foto grounding / pemerataan)');
  var zona = typeof ss.getSpreadsheetTimeZone === 'function' ? ss.getSpreadsheetTimeZone() : 'Asia/Jakarta';
  if (zona !== 'Asia/Jakarta') perhatian('SiSi_Hartek: zona waktu ' + zona + ', ganti ke (GMT+07:00) Jakarta di File > Setelan');

  // tab di SiSi_Hartek: struktur dikunci (urutan + judul sama persis)
  Object.keys(HARTEK_HEADER_).forEach(function (nama) {
    try {
      var t = tabel_('HARTEK_SHEET_ID', nama);
      var hk = HARTEK_HEADER_[nama];
      var beda = bedaStruktur_(t.header.slice(0, hk.length), hk);
      // v0.91.1: kolom tambahan di kanan struktur tidak dihapus siapkanSheetHartek; cukup dilaporkan
      var lebih = t.header.slice(hk.length).filter(function (k) { return k; });
      if (beda.length) perhatian(nama + ': STRUKTUR BEDA -> ' + beda.slice(0, 5).join(' | ') + ' (jalankan ADMIN_siapkanSheetHartek untuk menyesuaikan)');
      else ok(nama + ' (' + t.rows.length + ' baris)' + (lebih.length ? ', kolom tambahan di akhir: ' + lebih.join(', ') : ''));
    } catch (e) {
      if (e.kode === 'SHEET_TIDAK_ADA') gagal(nama + ' belum ada (jalankan ADMIN_siapkanSheetHartek)');
      else gagal(nama + ': ' + (e.kode || e.message));
    }
  });

  // db_Material di SiSi_Master (master tunggal)
  try {
    var mat = tabel_('MASTER_SHEET_ID', HARTEK_SHEET_.MASTER_MATERIAL);
    var kurang = HARTEK_MASTER_HEADER_.db_Material.filter(function (h) { return mat.header.indexOf(h) === -1; });
    if (kurang.length) gagal('db_Material (SiSi_Master): kolom kurang -> ' + kurang.join(', ') + ' (jalankan ADMIN_siapkanSheetHartek)');
    else {
      var tanpaSatuan = mat.rows.filter(function (r) { return isAktif_(r.aktif) && String(r.nama_material || '').trim() && !String(r.satuan || '').trim(); }).length;
      if (tanpaSatuan) perhatian('db_Material (SiSi_Master): ' + tanpaSatuan + ' material aktif tanpa satuan (HP tidak bisa isi otomatis)');
      var aktif = mat.rows.filter(function (r) { return isAktif_(r.aktif) && String(r.nama_material || '').trim(); }).length;
      if (aktif) ok('db_Material (SiSi_Master): ' + aktif + ' material aktif');
      else perhatian('db_Material (SiSi_Master): belum ada material aktif, dropdown material di HP kosong');
    }
  } catch (eM) {
    gagal(eM.kode === 'SHEET_TIDAK_ADA' ? 'db_Material belum ada di SiSi_Master' : 'db_Material: ' + (eM.kode || eM.message));
  }

  // v0.96.0: db_Kepemilikan_Material di SiSi_Master
  try {
    var km = tabel_('MASTER_SHEET_ID', HARTEK_SHEET_.KEPEMILIKAN_MATERIAL);
    var kurangKm = HARTEK_MASTER_HEADER_.db_Kepemilikan_Material.filter(function (h) { return km.header.indexOf(h) === -1; });
    if (kurangKm.length) perhatian('db_Kepemilikan_Material (SiSi_Master): kolom kurang -> ' + kurangKm.join(', ') + ' (jalankan ADMIN_siapkanSheetHartek)');
    else {
      var aktifKm = kepemilikanAktifHartek_().length;
      if (aktifKm) ok('db_Kepemilikan_Material (SiSi_Master): ' + aktifKm + ' kepemilikan aktif');
      else perhatian('db_Kepemilikan_Material (SiSi_Master): belum ada kepemilikan aktif, dropdown kepemilikan di HP kosong');
    }
  } catch (eKm) {
    perhatian(eKm.kode === 'SHEET_TIDAK_ADA' ? 'db_Kepemilikan_Material belum ada di SiSi_Master (jalankan ADMIN_siapkanSheetHartek)' : 'db_Kepemilikan_Material: ' + (eKm.kode || eKm.message));
  }

  // v0.98.11: db_jenis_peralatan di SiSi_Master
  try {
    var jp = tabel_('MASTER_SHEET_ID', HARTEK_SHEET_.JENIS_PERALATAN);
    var kurangJp = HARTEK_MASTER_HEADER_.db_jenis_peralatan.filter(function (h) { return jp.header.indexOf(h) === -1; });
    if (kurangJp.length) perhatian('db_jenis_peralatan (SiSi_Master): kolom kurang -> ' + kurangJp.join(', ') + ' (jalankan ADMIN_siapkanSheetHartek)');
    else {
      var aktifJp = jenisPeralatanAktifHartek_().length;
      if (aktifJp) ok('db_jenis_peralatan (SiSi_Master): ' + aktifJp + ' jenis peralatan aktif');
      else perhatian('db_jenis_peralatan (SiSi_Master): belum ada jenis peralatan aktif, dropdown jenis peralatan di HP kosong');
    }
  } catch (eJp) {
    perhatian(eJp.kode === 'SHEET_TIDAK_ADA' ? 'db_jenis_peralatan belum ada di SiSi_Master (jalankan ADMIN_siapkanSheetHartek)' : 'db_jenis_peralatan: ' + (eJp.kode || eJp.message));
  }

  // v0.91.0: daftar pekerjaan Hartek dari db_Jenis_Pekerjaan (modul HARTEK)
  try {
    var jh = jenisMasterHartek_(true);
    var hdrJenis = tabel_('MASTER_SHEET_ID', 'db_Jenis_Pekerjaan').header;
    var kurangJ = HARTEK_KOLOM_MASTER_JENIS_.filter(function (k) { return hdrJenis.indexOf(k) === -1; });
    if (kurangJ.length) perhatian('db_Jenis_Pekerjaan: kolom ' + kurangJ.join(', ') + ' belum ada (jalankan ADMIN_siapkanSheetHartek)');
    jh.forEach(function (r) {
      if (jenisMasterPgHartek_(r.jenis_pekerjaan) === null) perhatian('db_Jenis_Pekerjaan baris ' + r._baris + ' "' + r.nama + '": jenis_pekerjaan "' + r.jenis_pekerjaan + '" bukan Jaringan / Gardu / Non - Teknik (disembunyikan di HP)');
      var kg = String(r.kolom_gaspol === undefined || r.kolom_gaspol === null ? '' : r.kolom_gaspol).trim();
      if (kg && !kolomGaspolHartek_(kg)) perhatian('db_Jenis_Pekerjaan baris ' + r._baris + ' "' + r.nama + '": kolom_gaspol "' + kg + '" tidak dikenal (dianggap tidak masuk GASPOL)');
      if (!String(r.satuan || '').trim()) perhatian('db_Jenis_Pekerjaan baris ' + r._baris + ' "' + r.nama + '": satuan kosong (petugas mengisi sendiri)');
    });
    if (jh.length) {
      var perJenis = {};
      jh.forEach(function (r) { var j = jenisMasterPgHartek_(r.jenis_pekerjaan); if (j !== null) perJenis[j || 'semua jenis'] = (perJenis[j || 'semua jenis'] || 0) + 1; });
      var masukGaspol = jh.filter(function (r) { return kolomGaspolHartek_(r.kolom_gaspol); }).length;
      ok('db_Jenis_Pekerjaan HARTEK per jenis: ' + Object.keys(perJenis).map(function (k) { return k + ' ' + perJenis[k]; }).join(', ') + '; ' + masukGaspol + ' masuk GASPOL');
      var adaPmr = jh.some(function (r) { return HARTEK_PEMERATAAN_JENIS_.indexOf(String(r.nama).trim().toLowerCase()) !== -1; });
      ok('db_Jenis_Pekerjaan (SiSi_Master): ' + jh.length + ' pekerjaan HARTEK aktif');
      if (!adaPmr) perhatian('db_Jenis_Pekerjaan: belum ada "Pemerataan Beban Gardu" / "Pembagian Beban Gardu" modul HARTEK, form pemerataan tidak muncul');
    } else perhatian('db_Jenis_Pekerjaan (SiSi_Master): belum ada pekerjaan modul HARTEK aktif, dropdown pekerjaan di HP kosong');
  } catch (eP) { gagal('db_Jenis_Pekerjaan: ' + (eP.kode || eP.message)); }

  // sumber dropdown dan gardu
  try {
    var jar = jaringanAktifHartek_().length;
    if (jar) ok('db_Jaringan (SiSi_Master): ' + jar + ' baris aktif, dropdown penyulang / section terisi');
    else perhatian('db_Jaringan (SiSi_Master): tidak ada baris aktif, dropdown penyulang / section kosong');
  } catch (eJ) { gagal('db_Jaringan: ' + (eJ.kode || eJ.message)); }
  if (c.GARDU_SHEET_ID) ok('GARDU_SHEET_ID terisi (sumber gardu untuk PG Gardu / Non - Teknik)');
  else perhatian('GARDU_SHEET_ID kosong, PG Gardu / Non - Teknik tidak bisa diisi');

  // menu dan akses (db_Menu / db_Akses di SiSi_Master)
  try {
    var menu = tabel_('MASTER_SHEET_ID', 'db_Menu').rows.filter(function (r) { return String(r.menu_kode).trim() === 'OPS_HARTEK_INPUT'; })[0];
    if (!menu) perhatian('menu OPS_HARTEK_INPUT belum ada di db_Menu (impor docs/db_Menu.tsv)');
    else if (!isAktif_(menu.aktif)) perhatian('menu OPS_HARTEK_INPUT nonaktif di db_Menu');
    else ok('menu OPS_HARTEK_INPUT aktif di db_Menu');
    var punyaAkses = tabel_('MASTER_SHEET_ID', 'db_Akses').rows.some(function (r) {
      return String(r.role).trim() === 'PETUGAS' && String(r.jenis_tim || '').trim() === 'HARTEK' &&
        String(r.menu_kode).trim() === 'OPS_HARTEK_INPUT' && String(r.aksi || '').trim().toUpperCase() === 'UBAH';
    });
    if (punyaAkses) ok('db_Akses: PETUGAS / HARTEK -> OPS_HARTEK_INPUT (UBAH)');
    else perhatian('db_Akses belum punya PETUGAS / HARTEK / OPS_HARTEK_INPUT / UBAH (impor docs/db_Akses.tsv)');
  } catch (eA) { gagal('db_Menu / db_Akses: ' + (eA.kode || eA.message)); }

  // tim dan akun petugas
  try {
    var semuaTim = tabel_('MASTER_SHEET_ID', 'db_Tim').rows;
    var timH = semuaTim.filter(function (r) {
      return String(r.jenis || '').trim().toUpperCase() === 'HARTEK' && isAktif_(r.aktif);
    });
    // v0.93.1 (temuan review): runtime menormalkan jenis tim, tapi daftar tim di modul lain membandingkan persis. Tulis baku.
    var tidakBaku = timH.filter(function (r) { return String(r.jenis) !== 'HARTEK'; });
    if (tidakBaku.length) perhatian('db_Tim: ' + tidakBaku.length + ' tim jenis "' + String(tidakBaku[0].jenis) + '", tulis persis HARTEK (huruf besar, tanpa spasi)');
    if (!timH.length) { perhatian('belum ada tim HARTEK aktif di db_Tim'); }
    else {
      var idTim = timH.map(function (r) { return String(r.tim_id); });
      var petugas = tabel_('MASTER_SHEET_ID', 'db_Users').rows.filter(function (u) {
        return String(u.role).trim() === 'PETUGAS' && idTim.indexOf(String(u.tim_id)) !== -1 && isAktif_(u.aktif);
      }).length;
      // v0.94.0: Hartek bekerja sebagai tim (seperti ROW): satu akun login per tim, tanpa pilih petugas individu
      ok(timH.length + ' tim HARTEK aktif, ' + petugas + ' akun login tim (role PETUGAS)');
      if (!petugas) perhatian('belum ada akun login tim aktif (role PETUGAS) di tim HARTEK');
    }
  } catch (eT) { gagal('db_Tim / db_Users: ' + (eT.kode || eT.message)); }
  return masalah;
}

/* ===== setup sheet (admin, idempoten): buat + sesuaikan struktur ===== */

/** v0.91.1: judul lama -> judul baru (dipakai saat menyesuaikan sheet yang sudah ada). */
var HARTEK_ALIAS_KOLOM_ = { nomor_gardu: 'no_gardu', dibuat_pada: 'timestamp', diubah_pada: 'timestamp_update' };

function normKolomHartek_(x) { return String(x === null || x === undefined ? '' : x).trim().toLowerCase().replace(/\s+/g, '_'); }

/**
 * v0.91.1: rencana penyesuaian kolom (fungsi murni, tanpa menyentuh sheet). `ada` = judul baris 1, `harap` = struktur kode.
 * Langkah (1-based, berurutan, posisi dihitung setelah langkah sebelumnya):
 *   ganti {kol, dari, ke}   judul diganti (huruf besar/kecil, spasi, atau alias lama). Data kolom tetap.
 *   pindah {dari, ke}       kolom beserta datanya dipindah ke posisi yang benar.
 *   sisip {kol, nama}       kolom kosong baru disisipkan.
 *   tambah {kol, nama}      kolom baru di ujung kanan.
 * Kolom yang tidak dikenal TIDAK dihapus: tergeser ke kanan setelah kolom struktur (dilaporkan di `lain`).
 */
function rencanaKolomHartek_(ada, harap) {
  var cur = (ada || []).map(function (x) { return String(x === null || x === undefined ? '' : x).trim(); });
  while (cur.length && !cur[cur.length - 1]) cur.pop();
  var langkah = [];
  var ganda = cur.filter(function (c, i) { return c && cur.indexOf(c) !== i; });
  if (ganda.length) return { galat: 'judul kolom ganda: ' + ganda.join(', '), langkah: [], lain: [] };
  cur.forEach(function (c, idx) {
    if (!c || harap.indexOf(c) !== -1) return;
    var n = normKolomHartek_(c);
    var ke = harap.indexOf(n) !== -1 ? n : (HARTEK_ALIAS_KOLOM_[n] && harap.indexOf(HARTEK_ALIAS_KOLOM_[n]) !== -1 ? HARTEK_ALIAS_KOLOM_[n] : '');
    if (ke && cur.indexOf(ke) === -1) { langkah.push({ aksi: 'ganti', kol: idx + 1, dari: c, ke: ke }); cur[idx] = ke; }
  });
  for (var i = 0; i < harap.length; i++) {
    if (cur[i] === harap[i]) continue;
    var j = cur.indexOf(harap[i]);
    if (j > i) {
      langkah.push({ aksi: 'pindah', dari: j + 1, ke: i + 1, nama: harap[i] });
      cur.splice(j, 1); cur.splice(i, 0, harap[i]);
    } else if (i >= cur.length) {
      langkah.push({ aksi: 'tambah', kol: i + 1, nama: harap[i] });
      cur[i] = harap[i];
    } else {
      langkah.push({ aksi: 'sisip', kol: i + 1, nama: harap[i] });
      cur.splice(i, 0, harap[i]);
    }
  }
  return { langkah: langkah, lain: cur.slice(harap.length).filter(function (c) { return c; }) };
}

function teksLangkahHartek_(l) {
  if (l.aksi === 'ganti') return 'judul ' + kolomHuruf_(l.kol) + ' "' + l.dari + '" -> "' + l.ke + '"';
  if (l.aksi === 'pindah') return '"' + l.nama + '" pindah ' + kolomHuruf_(l.dari) + ' -> ' + kolomHuruf_(l.ke);
  return 'kolom baru "' + l.nama + '" di ' + kolomHuruf_(l.kol);
}

/** Jalankan rencana ke sheet. Kolom dipindah / disisip utuh, jadi data baris ikut bergeser bersama judulnya. */
function terapkanRencanaHartek_(sh, langkah) {
  langkah.forEach(function (l) {
    if (l.aksi === 'ganti') sh.getRange(1, l.kol).setValue(l.ke);
    else if (l.aksi === 'pindah') sh.moveColumns(sh.getRange(1, l.dari), l.ke);
    else if (l.aksi === 'sisip') { sh.insertColumnBefore(l.kol); sh.getRange(1, l.kol).setValue(l.nama); }
    else {
      var maks = typeof sh.getMaxColumns === 'function' ? sh.getMaxColumns() : sh.getLastColumn();
      if (l.kol > maks) sh.insertColumnsAfter(maks, l.kol - maks);
      sh.getRange(1, l.kol).setValue(l.nama);
    }
  });
}

/** v0.93.1: kolom tanggal berformat teks (@) untuk baris yang belum terisi, supaya Sheets tidak mengubah yyyy-MM-dd
 *  jadi Date. Baris lama tidak disentuh (dibaca aman lewat tglHartek_). Sheet palsu tanpa API format = dilewati. */
function formatTanggalTeksHartek_(sh, h) {
  var col = h.indexOf('tanggal') + 1;
  if (!col || typeof sh.getMaxRows !== 'function') return false;
  var maks = sh.getMaxRows(), awal = Math.max(2, (sh.getLastRow() || 1) + 1);
  if (awal > maks) return false;
  var rg = sh.getRange(awal, col, maks - awal + 1, 1);
  if (typeof rg.setNumberFormat !== 'function') return false;
  rg.setNumberFormat('@');
  return true;
}

/** Satu tab: buat kalau belum ada, sesuaikan kalau beda. Mengembalikan { status, langkah, lain, galat }. `uji` = hanya rencana. */
function siapkanTabHartek_(ss, nama, h, label, uji) {
  var sh = ss.getSheetByName(nama);
  if (!sh) {
    if (uji) { console.log(label + nama + ': AKAN DIBUAT (' + h.length + ' kolom)'); return { status: 'BARU', langkah: [], lain: [] }; }
    sh = ss.insertSheet(nama);
    if (!sh) return { status: 'BARU', langkah: [], lain: [] };
    sh.getRange(1, 1, 1, h.length).setValues([h.slice()]);
    if (typeof sh.setFrozenRows === 'function') sh.setFrozenRows(1);
    formatTanggalTeksHartek_(sh, h);
    console.log(label + nama + ': dibuat (' + h.length + ' kolom)');
    return { status: 'BARU', langkah: [], lain: [] };
  }
  var lebar = Math.max(h.length, sh.getLastColumn() || 1);
  var r = rencanaKolomHartek_(sh.getRange(1, 1, 1, lebar).getValues()[0], h);
  if (r.galat) { console.error(label + nama + ': DILEWATI, ' + r.galat + ' (rapikan manual dulu)'); return { status: 'GAGAL', langkah: [], lain: [], galat: r.galat }; }
  var catLain = r.lain.length ? ' | kolom lain di akhir, tidak dihapus: ' + r.lain.join(', ') : '';
  if (!r.langkah.length) {
    if (!uji) formatTanggalTeksHartek_(sh, h);
    console.log(label + nama + ': struktur OK' + catLain);
    return { status: 'OK', langkah: [], lain: r.lain };
  }
  console.log(label + nama + (uji ? ': AKAN DISESUAIKAN (' : ': disesuaikan (') + r.langkah.length + ' langkah)' + catLain);
  r.langkah.forEach(function (l) { console.log('    - ' + teksLangkahHartek_(l)); });
  if (!uji) {
    terapkanRencanaHartek_(sh, r.langkah);
    if (typeof sh.setFrozenRows === 'function') sh.setFrozenRows(1);
    formatTanggalTeksHartek_(sh, h);
  }
  return { status: 'UBAH', langkah: r.langkah, lain: r.lain };
}

/** Isi sel kosong `kolom` dari `cari(baris)`; hanya baris yang cocok. Mengembalikan { terisi, tanpaPasangan }. */
function isiKosongHartek_(t, kolom, cari) {
  var col = t.header.indexOf(kolom);
  if (col === -1 || !t.rows.length) return { terisi: 0, tanpaPasangan: 0 };
  var akhir = t.rows.reduce(function (m, r) { return Math.max(m, r._baris); }, 1);
  var blok = t.sheet.getRange(2, col + 1, akhir - 1, 1).getValues();   // baris kosong di tengah ikut dibaca, ditulis apa adanya
  var terisi = 0, tanpa = 0;
  t.rows.forEach(function (r) {
    var lama = r[kolom];
    if (lama !== '' && lama !== null && lama !== undefined) return;
    var v = cari(r);
    if (v) { terisi++; blok[r._baris - 2][0] = v; } else tanpa++;
  });
  if (terisi) t.sheet.getRange(2, col + 1, blok.length, 1).setValues(blok);
  return { terisi: terisi, tanpaPasangan: tanpa };
}

/** v0.91.1: kolom relasi baru di baris lama (jenis_id, master_material_id) diisi dari master lewat nama. */
function lengkapiRelasiHartek_() {
  var kunci = function (v) { return String(v || '').trim().replace(/\s+/g, ' ').toLowerCase(); };
  try {
    var jenis = {};
    jenisMasterHartek_(false).forEach(function (r) { if (!jenis[kunci(r.nama)]) jenis[kunci(r.nama)] = String(r.jenis_id); });
    var a = isiKosongHartek_(tabelHartek_(HARTEK_SHEET_.PEKERJAAN), 'jenis_id', function (r) { return jenis[kunci(r.pekerjaan)]; });
    console.log('Isi jenis_id baris lama: ' + a.terisi + ' terisi' + (a.tanpaPasangan ? ', ' + a.tanpaPasangan + ' tidak ada pasangan di db_Jenis_Pekerjaan (HARTEK)' : ''));
  } catch (e) { console.warn('Isi jenis_id dilewati: ' + (e.kode || e.message)); }
  try {
    var mat = {};
    tabelMaterialHartek_().rows.forEach(function (r) { if (r.material_id && !mat[kunci(r.nama_material)]) mat[kunci(r.nama_material)] = String(r.material_id); });
    var b = isiKosongHartek_(tabelHartek_(HARTEK_SHEET_.MATERIAL), 'master_material_id', function (r) { return mat[kunci(r.material)]; });
    console.log('Isi master_material_id baris lama: ' + b.terisi + ' terisi' + (b.tanpaPasangan ? ', ' + b.tanpaPasangan + ' tidak ada pasangan di db_Material' : ''));
  } catch (e2) { console.warn('Isi master_material_id dilewati: ' + (e2.kode || e2.message)); }
}

/** v0.94.0: kolom jenis_pekerjaan + kolom_gaspol di db_Jenis_Pekerjaan (SiSi_Master), ditambah di ujung kanan kalau
 *  belum ada (kolom lain tidak digeser, sama dengan kolom bobot v0.64.3). Mengembalikan jumlah kolom yang (akan) ditambah. */
function pastikanKolomJenisHartek_(ss, label, uji) {
  var sh = ss.getSheetByName('db_Jenis_Pekerjaan');
  if (!sh) { console.error(label + 'db_Jenis_Pekerjaan belum ada (jalankan setup master dulu)'); return -1; }
  var lebar = Math.max(1, sh.getLastColumn() || 1);
  var hdr = sh.getRange(1, 1, 1, lebar).getValues()[0].map(function (x) { return String(x === null || x === undefined ? '' : x).trim(); });
  var kurang = HARTEK_KOLOM_MASTER_JENIS_.filter(function (k) { return hdr.indexOf(k) === -1; });
  if (!kurang.length) { console.log(label + 'db_Jenis_Pekerjaan: kolom Hartek (' + HARTEK_KOLOM_MASTER_JENIS_.join(', ') + ') OK'); return 0; }
  var kol = hdr.length;
  while (kol > 0 && !hdr[kol - 1]) kol--;
  console.log(label + 'db_Jenis_Pekerjaan: ' + (uji ? 'AKAN DITAMBAH' : 'ditambah') + ' kolom ' + kurang.join(', ') + ' mulai kolom ' + kolomHuruf_(kol + 1));
  if (!uji) {
    var maks = typeof sh.getMaxColumns === 'function' ? sh.getMaxColumns() : kol + kurang.length;
    if (kol + kurang.length > maks) sh.insertColumnsAfter(maks, kol + kurang.length - maks);
    sh.getRange(1, kol + 1, 1, kurang.length).setValues([kurang]);
  }
  return kurang.length;
}

/** v0.94.0: aturan klasifikasi GASPOL v1 (_gaspolClassifyHartek, SIE-Teknik-Code.gs) untuk mengisi awal kolom_gaspol. */
function klasifikasiGaspolHartek_(pekerjaan, jenis) {
  var n = function (x) { return String(x === null || x === undefined ? '' : x).toLowerCase().replace(/\s+/g, ' ').trim(); };
  var p = n(pekerjaan), j = n(jenis);
  if (!p || /non[\s-]*teknik/.test(j)) return '';
  var ganti = /(penggant|ganti)/.test(p), perbaikan = /perbaik/.test(p);
  if (/jumperan/.test(p)) return '';
  if (/rekonektor/.test(p)) {
    if (/\bsr\b|sambungan rumah/.test(p)) return 'rekonektorSr';
    if (/jtr|sutr/.test(p)) return 'rekonektorSutr';
    if (/\btm\b|sutm/.test(p)) return 'rekonektorSutm';
    return '';
  }
  if (/\bcld\b/.test(p)) return 'harkomArrester';
  if (/igsw/.test(p)) return 'harkonsGsw';
  if (/key[\s-]*point/.test(p)) return 'harkeypoint';
  if (/protective sleeve|penghalang|satwa/.test(p)) return 'penghalangHewan';
  if (/grounding|arding|galvanis/.test(p)) return j.indexOf('gardu') >= 0 ? 'groundingGardu' : 'groundingTm';
  if (ganti) {
    if (/isolator/.test(p)) return 'harkomIsolator';
    if (/arrester|arester/.test(p)) return 'harkomArrester';
    if (/\bfco\b|fuse cut|cut[\s-]?out/.test(p)) return 'harkomFco';
    if (/trafo|busbar/.test(p)) return 'manajemenGardu';
  }
  if (perbaikan) {
    if (/tiang/.test(p)) return 'harkonsTiang';
    if (/sutm|jtm|a3c|konstruksi tm/.test(p)) return 'harkonsSutm';
    if (/gw-|hgw|ground wire|kawat tanah/.test(p)) return 'harkonsGw';
  }
  return '';
}

/**
 * v0.94.0 (opsional, sekali, seperti _gaspolSeedHartekMap v1): isi kolom_gaspol yang MASIH KOSONG pada baris modul
 * HARTEK di db_Jenis_Pekerjaan memakai aturan klasifikasi v1. Isian yang sudah ada tidak ditimpa. Periksa hasilnya:
 * kolom kosong berarti pekerjaan TIDAK masuk GASPOL, jadi kosongkan lagi kalau tebakan aturan salah.
 */
function ADMIN_isiGaspolHartek() {
  pastikanPemilik_();
  var t = tabel_('MASTER_SHEET_ID', 'db_Jenis_Pekerjaan');
  var col = t.header.indexOf('kolom_gaspol');
  if (col === -1) { console.error('Kolom kolom_gaspol belum ada. Jalankan ADMIN_siapkanSheetHartek dulu.'); return 0; }
  var n = 0;
  denganLock_(function () {
    t.rows.forEach(function (r) {
      if (String(r.modul || '').trim().toUpperCase() !== HARTEK_MODUL_JENIS_) return;
      if (String(r.kolom_gaspol === null || r.kolom_gaspol === undefined ? '' : r.kolom_gaspol).trim()) return;
      var k = klasifikasiGaspolHartek_(r.nama, r.jenis_pekerjaan);
      if (!k) return;
      t.sheet.getRange(r._baris, col + 1).setValue(k);
      n++;
      console.log('baris ' + r._baris + ' "' + r.nama + '" -> ' + k + ' (' + HARTEK_KOLOM_GASPOL_[k] + ')');
    });
  }, 30000);
  console.log('SELESAI. ' + n + ' pekerjaan diisi kolom_gaspol. Periksa lalu jalankan ADMIN_cekKonfigurasi.');
  return n;
}

/** Salinan cadangan spreadsheet sebelum kolom digeser (Drive, folder yang sama). */
function cadanganSheetHartek_(id, label) {
  try {
    var f = DriveApp.getFileById(id);
    var salin = f.makeCopy(f.getName() + ' (cadangan ' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HHmm') + ')');
    console.log(label + 'cadangan dibuat: ' + salin.getName() + ' (' + salin.getId() + ')');
    return true;
  } catch (e) {
    console.error(label + 'cadangan GAGAL (' + (e.message || e) + '). Penyesuaian dibatalkan, tidak ada kolom yang digeser.');
    return false;
  }
}

/**
 * v0.91.1: SATU fungsi untuk membuat DAN menyesuaikan semua sheet Hartek (admin pemilik, idempoten, aman diulang):
 *  1. SiSi_Master > db_Material dan SiSi_Hartek > 6 tab db_Hartek_*: dibuat kalau belum ada.
 *  2. Tab yang sudah ada disesuaikan ke struktur kode: judul lama diganti (mis. nomor_gardu -> no_gardu), kolom baru disisipkan
 *     di posisinya, kolom yang salah urutan dipindah UTUH bersama datanya. Kolom tak dikenal tidak dihapus (digeser ke kanan).
 *  3. Sebelum menggeser kolom, salinan cadangan spreadsheet dibuat dulu. Cadangan gagal = tidak ada yang diubah.
 *  4. Baris lama: jenis_id dan master_material_id yang kosong diisi dari master lewat nama.
 * Dikunci LockService supaya tidak bentrok dengan petugas yang sedang menyimpan.
 * Untuk melihat rencananya saja tanpa mengubah apa pun: jalankan ADMIN_cekSheetHartek.
 */
function ADMIN_siapkanSheetHartek() { jalankanSiapkanHartek_(false); }

/** v0.91.1: sama seperti ADMIN_siapkanSheetHartek tapi hanya menampilkan rencana (tidak membuat / mengubah apa pun). */
function ADMIN_cekSheetHartek() { jalankanSiapkanHartek_(true); }

function jalankanSiapkanHartek_(uji) {
  pastikanPemilik_();
  var c = cfg_();
  var target = [{
    id: c.MASTER_SHEET_ID, label: 'SiSi_Master > ',
    tab: {
      db_Material: HARTEK_MASTER_HEADER_.db_Material,
      db_Kepemilikan_Material: HARTEK_MASTER_HEADER_.db_Kepemilikan_Material,
      db_jenis_peralatan: HARTEK_MASTER_HEADER_.db_jenis_peralatan
    }
  }];
  if (c.HARTEK_SHEET_ID) target.push({ id: c.HARTEK_SHEET_ID, label: 'SiSi_Hartek > ', tab: HARTEK_HEADER_ });
  console.log(uji ? '=== CEK SHEET HARTEK (tidak mengubah apa pun) ===' : '=== SIAPKAN SHEET HARTEK ===');
  var masalah = 0;
  denganLock_(function () {
    target.forEach(function (tg) {
      var ss = bukaSpreadsheet_(tg.id);
      var nama = Object.keys(tg.tab);
      // rencana dulu untuk semua tab spreadsheet ini, supaya cadangan cukup dibuat sekali
      var perluGeser = nama.some(function (n) {
        var sh = ss.getSheetByName(n);
        if (!sh) return false;
        var r = rencanaKolomHartek_(sh.getRange(1, 1, 1, Math.max(tg.tab[n].length, sh.getLastColumn() || 1)).getValues()[0], tg.tab[n]);
        return !r.galat && r.langkah.length > 0;
      });
      if (!uji && perluGeser && !cadanganSheetHartek_(tg.id, tg.label)) { masalah++; return; }
      nama.forEach(function (n) {
        var h = siapkanTabHartek_(ss, n, tg.tab[n], tg.label, uji);
        if (h.status === 'GAGAL') masalah++;
      });
      if (tg.id === c.MASTER_SHEET_ID && pastikanKolomJenisHartek_(ss, tg.label, uji) < 0) masalah++;   // v0.94.0
    });
    if (!c.HARTEK_SHEET_ID) { masalah++; console.error('HARTEK_SHEET_ID kosong: isi Script Property dengan ID spreadsheet SiSi_Hartek, lalu jalankan lagi.'); }
    else if (!uji) { if (typeof SpreadsheetApp.flush === 'function') SpreadsheetApp.flush(); lengkapiRelasiHartek_(); }
  }, 30000);
  console.log(masalah ? 'SELESAI dengan ' + masalah + ' masalah (lihat log di atas).'
    : uji ? 'SELESAI. Jalankan ADMIN_siapkanSheetHartek untuk menerapkan rencana di atas.'
      : 'SELESAI. Lengkapi satuan di db_Material dan pekerjaan modul HARTEK di db_Jenis_Pekerjaan, lalu jalankan ADMIN_cekKonfigurasi.');
  return masalah;
}
