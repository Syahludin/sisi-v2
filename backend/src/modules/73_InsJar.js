/**
 * v1.0.0 (permintaan kvlar 19 Okt 2026): modul Inspeksi Jaringan (InsJar), inputan petugas (HP) + Input Temuan
 * Inspeksi khusus admin. Port dari v1 (SiSi_BackEnd/Inspeksi_Jaringan/Tek-InsJar-Code.js + Core/Tek-Temuan-Code.js)
 * ke arsitektur v2, alur sama dengan Hartek dan ROW:
 *   1. Laporan Utama (insjar_header)   KM + koordinat awal / akhir, 1 baris per tim per hari (kode IJR-<ULP><YYMMDD><NNN>)
 *   2. Penyulang utama (insjar_realisasi)   penyulang + tier + section awal / akhir + total tiang (kode <header>-PNY.<NNN>)
 *   3. Temuan (db_temuan_inspeksi)     section, jenis temuan, nomor tiang, deskripsi, koordinat (kode <PNY>-TJR.<NNN>)
 *
 * Spreadsheet SiSi_InsJar (Script Property INSJAR_SHEET_ID): insjar_header, insjar_realisasi.
 * Spreadsheet SiSi_Temuan (Script Property TEMUAN_SHEET_ID, keputusan kvlar 19 Okt 2026): db_temuan_inspeksi, terpisah
 * dari SiSi_InsJar karena nanti menampung SEMUA temuan (inspeksi jaringan, inspeksi gardu, input admin). objek_inspeksi
 * membedakan sumber objeknya (Jaringan / Gardu).
 * Master jenis temuan: db_Jenis_Temuan di SiSi_Master (MASTER_SHEET_ID), sama seperti db_Material Hartek.
 * Penyulang + section: db_Jaringan (master penyulang SiSi_Master) aktif, section urut kolom urutan.
 *
 * Input Temuan Inspeksi (admin, menu OPS_INPUT_TEMUAN): form temuan yang sama, ditambah pilihan penyulang. Tanpa header
 * dan realisasi (pola PEG v1, _generateKodeTemuanPegMandiri): kode_header = PEG-<ULP><YYMMDD>001 bersama per tanggal,
 * kode_realisasi = <PEG>-PNY.<NNN> (penyulang sama = PNY sama), kode_temuan = <PNY>-TJR.<NNN>. Baris header / realisasi
 * TIDAK ditulis; header_id dan realisasi_id kosong, sumber = ADMIN.
 *
 * Aturan: petugas INSPEKSI_JARINGAN (menu OPS_INSJAR_INPUT) hanya menulis ke header tim sendiri dengan tanggal hari ini.
 * Kolom audit semua tabel: dibuat_oleh, diubah_oleh, timestamp, timestamp_update, revision (sama dengan Hartek).
 * Struktur kolom DIKUNCI: dicek setiap baca untuk tulis (STRUKTUR_BERUBAH), disiapkan ADMIN_siapkanSheetInsJar.
 * v1.0.0: foto temuan + foto tiang ke Drive (FOTO_TEMUAN_FOLDER_ID, dulu INSJAR_FOTO_FOLDER_ID), kolom *_file_id + *_link.
 * v1.0.5 (permintaan kvlar 20 Okt 2026): penyulang utama hanya SATU kolom section (section_awal / section_akhir dan
 * segmen dihapus dari insjar_realisasi; ADMIN_siapkanSheetInsJar menghapus kolom lama). Segmen tetap ada di
 * db_temuan_inspeksi, opsional, hanya untuk object Jaringan. Endpoint baru ubahTemuanInsJar (petugas, hari ini).
 * Belum di versi ini: hapus temuan, penugasan WO.
 */

var INSJAR_SHEET_ = {
  HEADER: 'insjar_header', REALISASI: 'insjar_realisasi', TEMUAN: 'db_temuan_inspeksi', JENIS_TEMUAN: 'db_Jenis_Temuan'
};

var INSJAR_AUDIT_ = ['dibuat_oleh', 'diubah_oleh', 'timestamp', 'timestamp_update', 'revision'];

/** Struktur 2 tab SiSi_InsJar. Pola sama dengan SiSi_Hartek: kolom 1 = nomor, kode berantai, data baca, ID relasi, audit. */
var INSJAR_HEADER_ = {
  // = db_Hartek_Header (kolom & urutan sama persis)
  insjar_header: ['nomor', 'kode_header', 'ulp', 'hari', 'tanggal', 'tim', 'koordinat_awal', 'koordinat_akhir',
    'km_awal', 'km_akhir', 'kendala', 'wa_text', 'timestamp', 'input_by', 'timestamp_update',
    'header_id', 'tim_id', 'status', 'revision', 'dibuat_oleh', 'waktu_perangkat', 'diubah_oleh'],
  // penyulang utama yang diinspeksi (v1 db_InsJar_Realisasi: Penyulang, Section, Segmen, Tier, Total Tiang, Jumlah Temuan)
  // v1.0.5: satu kolom section (section_awal / section_akhir / segmen dihapus)
  insjar_realisasi: ['nomor', 'kode_header', 'kode_realisasi', 'tanggal', 'hari', 'ulp', 'tim', 'penyulang', 'tier',
    'section', 'total_tiang', 'jumlah_temuan',
    'realisasi_id', 'header_id', 'tim_id'].concat(INSJAR_AUDIT_)
};

/** v1.0.5: kolom lama yang dihapus ADMIN_siapkanSheetInsJar (sesudah cadangan spreadsheet dibuat). */
var INSJAR_KOLOM_USANG_ = { insjar_realisasi: ['section_awal', 'section_akhir', 'segmen'] };

/** v1.0.0: SiSi_Temuan (TEMUAN_SHEET_ID), gabungan temuan seluruh inspeksi + admin. */
var TEMUAN_HEADER_ = {
  // temuan (v1 db_INS_Temuan kolom B..AA). status = status tindak lanjut (Penugasan Tim > Progress Pekerjaan > Selesai)
  db_temuan_inspeksi: ['nomor', 'kode_header', 'kode_realisasi', 'kode_temuan', 'tanggal', 'hari', 'ulp', 'tim',
    'objek_inspeksi', 'tier_inspeksi', 'penyulang', 'tier', 'section', 'segmen', 'nomor_tiang',
    'no_gardu',   // v1.0.8: Inspeksi Gardu (objek Gardu), kosong untuk Jaringan
    'jenis_temuan', 'deskripsi',
    'koordinat', 'lat', 'lng',
    // v1.0.0: link Drive foto temuan + foto tiang (diisi uploadFotoInsJar / uploadFotoTemuanInspeksi)
    'foto_temuan_file_id', 'foto_temuan_link', 'foto_tiang_file_id', 'foto_tiang_link', 'status', 'sumber',
    'temuan_id', 'jenis_temuan_id', 'section_id', 'realisasi_id', 'header_id', 'tim_id',
    // v1.0.8: gardu_id (db_Gardu) + temuan_asal_id (temuan pertama di rantai lanjutan Inspeksi Gardu)
    'gardu_id', 'temuan_asal_id', 'belum_diperbaiki',
    // v1.0.10: WO tindak lanjut. status_wo '' (belum diteruskan) / TERKIRIM (boleh dipindah) / DIKERJAKAN (terkunci) / SELESAI
    'status_wo', 'tim_tindak_lanjut', 'jenis_tim_tindak_lanjut', 'catatan_admin', 'diteruskan_oleh', 'waktu_diteruskan',
    'dimulai_oleh', 'waktu_mulai', 'tindak_lanjut', 'jumlah_pekerjaan', 'diselesaikan_oleh', 'waktu_selesai',
    'tim_tindak_lanjut_id'].concat(INSJAR_AUDIT_),
  // v1.0.10: rincian pekerjaan tindak lanjut WO (1 temuan bisa banyak baris). DRAFT selama dikerjakan, TERCATAT sesudah
  // WO selesai (baris masuk realisasi modul tim: row_Eksekusi / db_Hartek_Pekerjaan / yan_P0, id baris modul = tl_id).
  db_temuan_tindak_lanjut: ['nomor', 'kode_temuan', 'kode_tl', 'tanggal', 'tim', 'jenis_tim', 'objek_inspeksi', 'penyulang',
    'section', 'no_gardu', 'pekerjaan', 'pekerjaan_lainnya', 'jumlah', 'satuan', 'diameter', 'nomor_tiang', 'koordinat', 'lat', 'lng',
    'catatan', 'foto_sebelum_file_id', 'foto_sebelum_link', 'foto_pekerjaan_file_id', 'foto_pekerjaan_link',
    'foto_sesudah_file_id', 'foto_sesudah_link', 'foto_meta', 'status', 'kode_realisasi_modul',
    'tl_id', 'temuan_id', 'tim_id', 'jenis_id', 'section_id', 'realisasi_modul_id',
    // v1.0.16: JSON rincian WO Hartek (banyak pekerjaan + material dalam satu isian): {pekerjaan: [...], material: [...]}
    'rincian'].concat(INSJAR_AUDIT_),
  // v1.0.16: riwayat penugasan WO (teruskan / pindah / tarik). Dipakai untuk mengenali tim lama yang mengunggah WO
  // offline sesudah WO dipindah admin (WO_DIPINDAH, bukan BUKAN_MILIK_TIM).
  db_wo_riwayat: ['nomor', 'kode_temuan', 'tim', 'jenis_tim', 'aksi', 'waktu', 'oleh', 'riwayat_id', 'temuan_id', 'tim_id'].concat(INSJAR_AUDIT_),
  // v1.0.16: WO ganda (dua tim mengunggah WO yang sama). Satu baris per tim: KLAIM (tim lama tetap mengunggah) /
  // SIAP (tim sudah menekan Selesai, menunggu verifikasi) -> DIPILIH / DITOLAK (keputusan admin menu OPS_WO_GANDA).
  db_wo_ganda: ['nomor', 'kode_temuan', 'tim', 'jenis_tim', 'status', 'waktu_klaim', 'diklaim_oleh', 'waktu_siap', 'diputuskan_oleh',
    'waktu_putusan', 'catatan', 'ganda_id', 'temuan_id', 'tim_id'].concat(INSJAR_AUDIT_)
};

/** Master di SiSi_Master. Pola sama dengan db_Material / db_Kepemilikan_Material. */
var INSJAR_MASTER_HEADER_ = {
  db_Jenis_Temuan: ['nomor', 'jenis_temuan', 'objek_inspeksi', 'tier_inspeksi', 'urutan', 'aktif', 'jenis_temuan_id', 'revision', 'timestamp_update', 'diubah_oleh']
};

var INSJAR_JENIS_TIM_ = 'INSPEKSI_JARINGAN';
var INSDU_JENIS_TIM_ = 'INSPEKSI_GARDU';
var INSPEKSI_OBJEK_ = ['Jaringan', 'Gardu'];
var INSJAR_MENU_ = { petugas: 'OPS_INSJAR_INPUT', admin: 'OPS_INPUT_TEMUAN' };
var INSJAR_TIER_ = ['Tier 1', 'Tier 2'];   // sama dengan pilihan v1 (modal Tambah Realisasi)
var INSJAR_OBJEK_ = 'Jaringan';
var INSJAR_STATUS_TEMUAN_ = 'Penugasan Tim';   // STATUS_INS.PENUGASAN v1, awal tindak lanjut
var INSJAR_AWALAN_ = { petugas: 'IJR', admin: 'PEG' };   // INSJAR_MODUL v1 = IJR, temuan admin tanpa induk = PEG
var INSJAR_ADMIN_MUNDUR_HARI_ = 31;   // admin boleh mencatat temuan s.d. 31 hari ke belakang

/* ===== peran ===== */

function objekInspeksiSesi_(sesi) {
  if (!sesi || sesi.role !== 'PETUGAS') return '';
  if (sesi.jenisTim === INSJAR_JENIS_TIM_) return 'Jaringan';
  if (sesi.jenisTim === INSDU_JENIS_TIM_) return 'Gardu';
  return '';
}

function wajibPetugasInsJar_(sesi) {
  if (!sesi || sesi.role !== 'PETUGAS' || !objekInspeksiSesi_(sesi) || !sesi.timId) {
    throw new SisiError_('AKSES_DITOLAK', 'bukan petugas inspeksi jaringan / gardu');
  }
}

/** Input Temuan Inspeksi: ADMIN / SUPER / ADMIN_ES (bukan PETUGAS). Tulis tetap butuh aksi UBAH (dicek guard_). */
function wajibAdminTemuan_(sesi) {
  if (!sesi || sesi.role === 'PETUGAS' || ROLE_VALID_().indexOf(sesi.role) === -1) {
    throw new SisiError_('AKSES_DITOLAK', 'input temuan inspeksi khusus admin');
  }
}

/* ===== helper ===== */

/** Tab SiSi_InsJar dengan cek struktur (urutan + judul sama persis; kolom tambahan di kanan dibiarkan). */
function tabelInsJar_(nama) {
  var prop = TEMUAN_HEADER_[nama] ? 'TEMUAN_SHEET_ID' : 'INSJAR_SHEET_ID';
  if (!cfg_()[prop]) throw new SisiError_('CONFIG_TIDAK_LENGKAP', prop);
  var t = tabel_(prop, nama);
  var hk = INSJAR_HEADER_[nama] || TEMUAN_HEADER_[nama];
  if (hk) {
    var beda = bedaStruktur_(t.header.slice(0, hk.length), hk);
    if (beda.length) throw new SisiError_('STRUKTUR_BERUBAH', nama + ' ' + beda.slice(0, 3).join('; '));
  }
  return t;
}

/** Tanggal baris sebagai teks yyyy-MM-dd. Sumber utama = kode_header (IJR- / PEG-<KODE_ULP><YYMMDD>...), cadangan = sel. */
function tglInsJar_(r) {
  var kode = String((r && r.kode_header) || '').trim();
  var ulp = String(cfg_().KODE_ULP || '');
  var awal = [INSJAR_AWALAN_.petugas + '-' + ulp, INSJAR_AWALAN_.admin + '-' + ulp, 'IGD-' + ulp]   // v1.0.8: + Inspeksi Gardu
    .filter(function (a) { return kode.indexOf(a) === 0; })[0];
  if (awal) {
    var m = /^(\d{2})(\d{2})(\d{2})\d{3,}/.exec(kode.slice(awal.length));
    if (m) {
      var iso = '20' + m[1] + '-' + m[2] + '-' + m[3];
      var dt = new Date(iso + 'T00:00:00Z');
      if (!isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso) return iso;
    }
  }
  return tglSel_(r ? r.tanggal : '');
}

function yymmddInsJar_(tanggal) { return tanggal.slice(2, 4) + tanggal.slice(5, 7) + tanggal.slice(8, 10); }

function sisipAuditInsJar_(obj, sesi, sekarang) {
  obj.dibuat_oleh = sesi.userId;
  obj.diubah_oleh = sesi.userId;
  obj.timestamp = sekarang;
  obj.timestamp_update = sekarang;
  obj.revision = 1;
  return obj;
}

function kmInsJar_(kmAwal, kmAkhir) {
  if (typeof kmAwal === 'number' && typeof kmAkhir === 'number' && kmAkhir < kmAwal) throw new SisiError_('KM_AKHIR_KURANG', 'kmAkhir');
}

/** Induk harus ada dan milik tim sesi; hanya induk hari ini yang boleh diisi petugas. */
function indukInsJarMilikTim_(rows, idKolom, id, timId, nama) {
  var r = rows.filter(function (x) { return String(x[idKolom]) === String(id); })[0];
  if (!r) throw new SisiError_('DATA_TIDAK_DITEMUKAN', nama);
  if (String(r.tim_id) !== String(timId)) throw new SisiError_('BUKAN_MILIK_TIM', nama);
  if (tglInsJar_(r) !== tanggalHariIniHartek_()) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', nama);
  // v1.0.2 (guard): Laporan Utama yang tidak AKTIF tidak bisa diisi / diubah lagi
  if (idKolom === 'header_id' && String(r.status || 'AKTIF') !== 'AKTIF') throw new SisiError_('SUDAH_BATAL', nama);
  return r;
}

/** ID baris dari HP (idBaris). Sudah ada = kiriman ulang: milik tim sendiri -> baris itu, tim lain -> ID_DIPAKAI. */
function barisUlangInsJar_(rows, kolomId, idBaris, timId) {
  if (!idBaris) return null;
  var r = rows.filter(function (x) { return String(x[kolomId]) === String(idBaris); })[0];
  if (!r) return null;
  if (String(r.tim_id) !== String(timId || '')) throw new SisiError_('ID_DIPAKAI', idBaris);
  return r;
}

/** Penyulang + section dari db_Jaringan aktif (cocok persis, nama dari master). section kosong = hanya penyulang. */
function lokasiJaringanInsJar_(penyulang, section, wajibSection) {
  var pen = String(penyulang || '').trim(), sec = String(section || '').trim();
  if (!pen) throw new SisiError_('FIELD_WAJIB', 'penyulang');
  var masterP = jaringanAktifHartek_().filter(function (r) { return String(r.penyulang).trim() === pen; });
  if (!masterP.length) throw new SisiError_('PENYULANG_TIDAK_VALID', pen);
  if (!sec) {
    if (wajibSection) throw new SisiError_('FIELD_WAJIB', 'section');
    return { penyulang: String(masterP[0].penyulang).trim(), section: '', sectionId: '' };
  }
  var masterS = masterP.filter(function (r) { return String(r.section).trim() === sec; })[0];
  if (!masterS) throw new SisiError_('SECTION_TIDAK_VALID', sec);
  return { penyulang: String(masterS.penyulang).trim(), section: String(masterS.section).trim(), sectionId: String(masterS.section_id || '') };
}

/** Kriteria tier di master: kosong = semua tier (kompatibel dengan data lama), pemisah koma / ; / | / &. */
function tierTemuanMaster_(r) {
  var raw = String(r.tier_inspeksi || '').trim();
  if (!raw) return INSJAR_TIER_.slice();
  return raw.split(/[;,|&]+/).map(function (x) { return String(x).trim(); }).filter(function (x) { return x; });
}

function objekTemuanMaster_(r) {
  var raw = String(r.objek_inspeksi || '').trim();
  if (!raw) return INSPEKSI_OBJEK_.slice();
  return raw.split(/[;,|&]+/).map(function (x) { return String(x).trim(); }).filter(function (x) { return x; });
}

/** Jenis temuan aktif dari db_Jenis_Temuan (SiSi_Master), objek Jaringan atau kosong, urut kolom urutan lalu nama. */
function jenisTemuanAktifInsJar_(objek, tier) {
  var rows;
  try { rows = tabel_('MASTER_SHEET_ID', INSJAR_SHEET_.JENIS_TEMUAN).rows; } catch (e) {
    if (e && e.kode === 'SHEET_TIDAK_ADA') return [];
    throw e;
  }
  var obj = String(objek || '').trim().toLowerCase(), tr = String(tier || '').trim();
  var urut = function (r) { var n = Number(r.urutan); return r.urutan === '' || r.urutan === null || r.urutan === undefined || !isFinite(n) ? 1e9 : n; };
  return rows.filter(function (r) {
    var objs = objekTemuanMaster_(r).map(function (x) { return x.toLowerCase(); });
    var tiers = tierTemuanMaster_(r);
    return r.jenis_temuan_id && isAktif_(r.aktif) && String(r.jenis_temuan || '').trim() &&
      (!obj || objs.indexOf(obj) !== -1) && (!tr || tiers.indexOf(tr) !== -1);
  }).sort(function (a, b) {
    return urut(a) - urut(b) || String(a.jenis_temuan).trim().localeCompare(String(b.jenis_temuan).trim());
  }).map(function (r) {
    return {
      jenisTemuanId: String(r.jenis_temuan_id), nama: String(r.jenis_temuan).trim(),
      objekInspeksi: objekTemuanMaster_(r), tierInspeksi: tierTemuanMaster_(r)
    };
  });
}

function jenisTemuanInsJar_(jenisTemuanId, objek, tier) {
  var j = jenisTemuanAktifInsJar_(objek, tier).filter(function (x) { return x.jenisTemuanId === String(jenisTemuanId); })[0];
  if (!j) throw new SisiError_('JENIS_TEMUAN_TIDAK_VALID', String(jenisTemuanId || ''));
  return j;
}

/** Dropdown form (petugas & admin sama): penyulang + section urut db_Jaringan, jenis temuan, tier. */
function masterInsJar_(sesi) {
  var j = petaJaringanUrut_();
  var objek = objekInspeksiSesi_(sesi);
  return {
    objekInspeksi: objek ? [objek] : INSPEKSI_OBJEK_.slice(),
    penyulang: j.penyulang,
    jenisTemuan: jenisTemuanAktifInsJar_(objek, ''),
    tier: INSJAR_TIER_.slice()
  };
}

/** Bentuk satu temuan untuk HP. */
function temuanKeHpInsJar_(t) {
  return {
    temuanId: String(t.temuan_id), kodeTemuan: String(t.kode_temuan || ''), kodeRealisasi: String(t.kode_realisasi || ''),
    tanggal: tglInsJar_(t), objekInspeksi: String(t.objek_inspeksi || ''), tierInspeksi: String(t.tier_inspeksi || ''),
    penyulang: String(t.penyulang || ''), tier: String(t.tier || ''), section: String(t.section || ''),
    segmen: String(t.segmen || ''), nomorTiang: String(t.nomor_tiang || ''), jenisTemuan: String(t.jenis_temuan || ''),
    jenisTemuanId: String(t.jenis_temuan_id || ''), deskripsi: String(t.deskripsi || ''), koordinat: String(t.koordinat || ''),
    status: String(t.status || ''), sumber: String(t.sumber || ''), tim: String(t.tim || ''), realisasiId: String(t.realisasi_id || ''),
    noGardu: String(t.no_gardu || ''), garduId: String(t.gardu_id || ''), temuanAsalId: String(t.temuan_asal_id || ''),
    belumDiperbaiki: String(t.belum_diperbaiki || ''),
    // v1.0.10: WO tindak lanjut
    wo: { status: String(t.status_wo || ''), timId: String(t.tim_tindak_lanjut_id || ''), tim: String(t.tim_tindak_lanjut || ''),
          jenisTim: String(t.jenis_tim_tindak_lanjut || ''), catatanAdmin: String(t.catatan_admin || ''),
          diteruskanOleh: String(t.diteruskan_oleh || ''), waktuDiteruskan: String(t.waktu_diteruskan || ''),
          dimulaiOleh: String(t.dimulai_oleh || ''), waktuMulai: String(t.waktu_mulai || ''),
          tindakLanjut: String(t.tindak_lanjut || ''), jumlahPekerjaan: Number(t.jumlah_pekerjaan) || 0,
          diselesaikanOleh: String(t.diselesaikan_oleh || ''), waktuSelesai: String(t.waktu_selesai || '') },
    revision: Number(t.revision) || 1,
    foto: fotoLinkInsJar_(t)
  };
}

/** Kunci nomor urut berikut untuk kode berawalan, dari baris temuan (dan realisasi bila ada). */
function urutKodeInsJar_(rows, kolom, awalan) { return urutBerikutHartek_(rows, kolom, awalan); }

/* ===== endpoint baca (petugas) ===== */

function getMasterInsJar_(sesi) {
  wajibPetugasInsJar_(sesi);
  return masterInsJar_(sesi);
}

/** Laporan hari ini (atau tanggal diminta) tim sesi: header > penyulang utama > temuan. */
function getInsJarHarian_(sesi, data) {
  wajibPetugasInsJar_(sesi);
  var d = validasi_(data, { tanggal: { tipe: 'tanggal' } });
  var tanggal = d.tanggal || tanggalHariIniHartek_();
  var h = tabelInsJar_(INSJAR_SHEET_.HEADER).rows.filter(function (x) {
    return String(x.tim_id) === String(sesi.timId) && tglInsJar_(x) === tanggal && x.status === 'AKTIF';
  })[0];
  if (!h) return { tanggal: tanggal, header: null, realisasi: [] };
  return dokInsJarBaris_(h, tanggal, tabelInsJar_(INSJAR_SHEET_.REALISASI).rows, tabelInsJar_(INSJAR_SHEET_.TEMUAN).rows);
}

/** v1.0.17: dokumen satu laporan Inspeksi Jaringan (bentuk getInsJarHarian) dari baris sheet; dipakai harian + arsip. */
function dokInsJarBaris_(h, tanggal, rowsReal, rowsTemu) {
  var real = rowsReal.filter(function (r) { return String(r.header_id) === String(h.header_id); });
  var temu = rowsTemu.filter(function (r) { return String(r.header_id) === String(h.header_id); });
  var realisasi = real.map(function (r) {
    return {
      realisasiId: String(r.realisasi_id), kodeRealisasi: String(r.kode_realisasi || ''), penyulang: String(r.penyulang || ''),
      tier: String(r.tier || ''), section: String(r.section || ''),
      totalTiang: r.total_tiang === undefined || r.total_tiang === null ? '' : r.total_tiang,
      revision: Number(r.revision) || 1,
      temuan: temu.filter(function (t) { return String(t.realisasi_id) === String(r.realisasi_id); }).map(temuanKeHpInsJar_)
    };
  });
  return {
    tanggal: tanggal,
    header: {
      headerId: String(h.header_id), kodeHeader: String(h.kode_header), hari: String(h.hari || ''), revision: Number(h.revision) || 1,
      koordinatAwal: String(h.koordinat_awal || ''), koordinatAkhir: String(h.koordinat_akhir || ''),
      kmAwal: h.km_awal === '' ? '' : h.km_awal, kmAkhir: h.km_akhir === '' ? '' : h.km_akhir, kendala: String(h.kendala || '')
    },
    realisasi: realisasi
  };
}

/* ===== endpoint tulis: Laporan Utama (1 header per tim per hari, tanpa batal / hapus, sama dengan Hartek) ===== */

var INSJAR_ISI_HEADER_ = {
  buat: {
    headerId: { tipe: 'uuid' },
    koordinatAwal: { tipe: 'koordinat' }, koordinatAkhir: { tipe: 'koordinat' },
    kmAwal: { tipe: 'angka', min: 0, max: 100000 }, kmAkhir: { tipe: 'angka', min: 0, max: 100000 },
    kendala: { tipe: 'teks', maks: 500, multiBaris: true, maksBaris: 5 }
  },
  ubah: {
    headerId: { tipe: 'uuid', wajib: true }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 },
    koordinatAwal: { tipe: 'koordinat' }, koordinatAkhir: { tipe: 'koordinat' },
    kmAwal: { tipe: 'angka', min: 0, max: 100000 }, kmAkhir: { tipe: 'angka', min: 0, max: 100000 },
    kendala: { tipe: 'teks', maks: 500, multiBaris: true, maksBaris: 5 }
  }
};

/** Perangkat pembuat header (log_Audit INSJAR_HEADER_BUAT). Kosong kalau tidak tercatat. */
function perangkatBuatHeaderInsJar_(kode) {
  var log = tabel_('AUTH_SHEET_ID', 'log_Audit').rows.filter(function (r) {
    return r.aksi === 'INSJAR_HEADER_BUAT' && String(r.target) === String(kode);
  })[0];
  return log ? String(log.device_id || '') : '';
}

function buatHeaderInsJar_(sesi, data) {
  wajibPetugasInsJar_(sesi);
  var d = validasi_(data, INSJAR_ISI_HEADER_.buat);
  kmInsJar_(d.kmAwal, d.kmAkhir);
  return denganLock_(function () {
    var t = tabelInsJar_(INSJAR_SHEET_.HEADER);
    var tanggal = tanggalHariIniHartek_();
    var ada = t.rows.filter(function (h) {
      return String(h.tim_id) === String(sesi.timId) && tglInsJar_(h) === tanggal && h.status === 'AKTIF';
    })[0];
    // kiriman ulang header yang sama (ID sama) = berhasil tanpa membuat apa pun
    if (ada && d.headerId && String(ada.header_id) === String(d.headerId)) {
      return { headerId: String(ada.header_id), kodeHeader: String(ada.kode_header), tanggal: tanggal, duplikat: true };
    }
    if (ada) {
      // perangkat sama = ditolak; perangkat lain tim yang sama = ikut header pertama (pola Hartek v0.87.8)
      var asal = perangkatBuatHeaderInsJar_(ada.kode_header);
      if (!asal || asal === String(sesi.deviceId || '')) throw new SisiError_('LAPORAN_UTAMA_SUDAH_DIBUAT', ada.kode_header);
      auditLog_(sesi, 'INSJAR_HEADER_GABUNG', ada.kode_header, 'perangkat ' + String(sesi.deviceId || '') + ' ikut header pertama', 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
      return { headerId: String(ada.header_id), kodeHeader: String(ada.kode_header), tanggal: tanggal, duplikat: false, digabung: true };
    }
    if (d.headerId && t.rows.some(function (h) { return String(h.header_id) === String(d.headerId); })) throw new SisiError_('ID_DIPAKAI', d.headerId);
    var c = cfg_();
    var awalan = INSJAR_AWALAN_.petugas + '-' + c.KODE_ULP + yymmddInsJar_(tanggal);
    var kode = awalan + pad3_(urutKodeInsJar_(t.rows, 'kode_header', awalan));
    var id = d.headerId || uuid_(), sekarang = sekarangIso_();
    tambahBaris_(t, {
      nomor: t.rows.length + 1, kode_header: kode, ulp: c.ULP_NAMA, hari: hariTanggalHartek_(tanggal), tanggal: tanggal,
      tim: sesi.timNama || '',
      koordinat_awal: d.koordinatAwal ? d.koordinatAwal.teks : '', koordinat_akhir: d.koordinatAkhir ? d.koordinatAkhir.teks : '',
      km_awal: d.kmAwal === undefined ? '' : d.kmAwal, km_akhir: d.kmAkhir === undefined ? '' : d.kmAkhir,
      kendala: d.kendala || '', wa_text: '',
      timestamp: sekarang, input_by: sesi.username || sesi.userId, timestamp_update: sekarang,
      header_id: id, tim_id: sesi.timId, status: 'AKTIF', revision: 1, dibuat_oleh: sesi.userId,
      waktu_perangkat: '', diubah_oleh: sesi.userId
    });
    auditLog_(sesi, 'INSJAR_HEADER_BUAT', kode, sesi.timNama || '', 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { headerId: id, kodeHeader: kode, tanggal: tanggal, duplikat: false };
  }, 20000);
}

function ubahHeaderInsJar_(sesi, data) {
  wajibPetugasInsJar_(sesi);
  var d = validasi_(data, INSJAR_ISI_HEADER_.ubah);
  kmInsJar_(d.kmAwal, d.kmAkhir);
  return denganLock_(function () {
    var t = tabelInsJar_(INSJAR_SHEET_.HEADER);
    var h = indukInsJarMilikTim_(t.rows, 'header_id', d.headerId, sesi.timId, 'header');
    var u = {};
    if (d.koordinatAwal !== undefined) u.koordinat_awal = d.koordinatAwal.teks;
    if (d.koordinatAkhir !== undefined) u.koordinat_akhir = d.koordinatAkhir.teks;
    if (d.kmAwal !== undefined) u.km_awal = d.kmAwal;
    if (d.kmAkhir !== undefined) u.km_akhir = d.kmAkhir;
    if (d.kendala !== undefined) u.kendala = d.kendala;
    if (!Object.keys(u).length) throw new SisiError_('FIELD_WAJIB', 'koordinatAwal');
    // KM gabungan nilai lama + baru juga dicek (mis. hanya KM akhir yang dikirim)
    var awal = u.km_awal !== undefined ? u.km_awal : (h.km_awal === '' ? undefined : Number(h.km_awal));
    var akhir = u.km_akhir !== undefined ? u.km_akhir : (h.km_akhir === '' ? undefined : Number(h.km_akhir));
    kmInsJar_(awal, akhir);
    u.timestamp_update = sekarangIso_();
    u.diubah_oleh = sesi.userId;
    ubahBaris_(t, 'header_id', d.headerId, u, d.revision);
    auditLog_(sesi, 'INSJAR_HEADER_UBAH', h.kode_header, Object.keys(u).join(', '), 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { headerId: String(d.headerId), kodeHeader: String(h.kode_header), revision: d.revision + 1 };
  }, 20000);
}

/* ===== endpoint tulis: penyulang utama (insjar_realisasi) ===== */

// v1.0.5: satu section (dari db_Jaringan penyulang itu), segmen tidak lagi di penyulang utama
var INSJAR_ISI_REALISASI_ = {
  tier: { tipe: 'pilihan', pilihan: INSJAR_TIER_ },
  section: { tipe: 'teks', maks: 80 },
  totalTiang: { tipe: 'angka', min: 0, max: 9999, bulat: true }
};

function skemaRealisasiInsJar_(tambahan) {
  var s = {};
  Object.keys(tambahan).forEach(function (k) { s[k] = tambahan[k]; });
  Object.keys(INSJAR_ISI_REALISASI_).forEach(function (k) { s[k] = INSJAR_ISI_REALISASI_[k]; });
  return s;
}

/** v1.0.5: section penyulang utama harus section penyulang itu (db_Jaringan), nama baku dari master. Kosong = ''. */
function sectionRealisasiInsJar_(penyulang, section) {
  return section ? lokasiJaringanInsJar_(penyulang, section, true).section : '';
}


/** v1 (simpanRealisasiInsJar): penyulang + tier yang sama tidak boleh dua kali di satu header. */
function cekRealisasiGandaInsJar_(rows, headerId, penyulang, tier, section, kecualiId) {
  var ganda = rows.some(function (r) {
    return String(r.header_id) === String(headerId) && String(r.penyulang).trim() === penyulang &&
      String(r.tier || '').trim() === String(tier || '') && String(r.section || '').trim() === String(section || '') &&
      (!kecualiId || String(r.realisasi_id) !== String(kecualiId));
  });
  if (ganda) throw new SisiError_('REALISASI_GANDA', penyulang + (tier ? ' ' + tier : '') + (section ? ' ' + section : ''));
}

function simpanRealisasiInsJar_(sesi, data) {
  wajibPetugasInsJar_(sesi);
  var d = validasi_(data, skemaRealisasiInsJar_({
    headerId: { tipe: 'uuid', wajib: true },
    penyulang: { tipe: 'teks', wajib: true, maks: 80 },
    idBaris: { tipe: 'uuid' }
  }));
  if (!d.tier) throw new SisiError_('FIELD_WAJIB', 'tier');
  if (!d.section) throw new SisiError_('FIELD_WAJIB', 'section');
  if (d.totalTiang === undefined) throw new SisiError_('FIELD_WAJIB', 'totalTiang');
  return denganLock_(function () {
    var t = tabelInsJar_(INSJAR_SHEET_.REALISASI);
    var ulang = barisUlangInsJar_(t.rows, 'realisasi_id', d.idBaris, sesi.timId);
    if (ulang) return { realisasiId: String(ulang.realisasi_id), kodeRealisasi: String(ulang.kode_realisasi), duplikat: true };
    var hdr = indukInsJarMilikTim_(tabelInsJar_(INSJAR_SHEET_.HEADER).rows, 'header_id', d.headerId, sesi.timId, 'header');
    var pen = lokasiJaringanInsJar_(d.penyulang, '', false).penyulang;
    var sec = sectionRealisasiInsJar_(pen, d.section);
    cekRealisasiGandaInsJar_(t.rows, hdr.header_id, pen, d.tier, sec, null);
    var awalan = hdr.kode_header + '-PNY.';
    var kode = awalan + pad3_(urutKodeInsJar_(t.rows, 'kode_realisasi', awalan));
    var id = d.idBaris || uuid_(), sekarang = sekarangIso_();
    tambahBaris_(t, sisipAuditInsJar_({
      nomor: t.rows.length + 1, kode_header: hdr.kode_header, kode_realisasi: kode, tanggal: tglInsJar_(hdr), hari: hdr.hari,
      ulp: hdr.ulp, tim: hdr.tim, penyulang: pen, tier: d.tier, section: sec, total_tiang: d.totalTiang, jumlah_temuan: 0,
      realisasi_id: id, header_id: hdr.header_id, tim_id: sesi.timId
    }, sesi, sekarang));
    auditLog_(sesi, 'INSJAR_REALISASI_SIMPAN', kode, pen + ' ' + d.tier, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { realisasiId: id, kodeRealisasi: kode };
  }, 20000);
}

/** Ubah penyulang utama hari ini (tier, section, total tiang). Penyulang tidak bisa diubah:
 *  temuan di bawahnya sudah menempel ke penyulang itu. Revision wajib. */
function ubahRealisasiInsJar_(sesi, data) {
  wajibPetugasInsJar_(sesi);
  var d = validasi_(data, skemaRealisasiInsJar_({
    realisasiId: { tipe: 'uuid', wajib: true },
    revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 }
  }));
  return denganLock_(function () {
    var t = tabelInsJar_(INSJAR_SHEET_.REALISASI);
    var r = indukInsJarMilikTim_(t.rows, 'realisasi_id', d.realisasiId, sesi.timId, 'penyulang utama');
    if (Number(r.revision) !== d.revision) throw new SisiError_('KONFLIK_REVISION', d.realisasiId);
    var pen = String(r.penyulang).trim();
    var u = {};
    var tierBaru = d.tier !== undefined ? d.tier : String(r.tier || '');
    var secBaru = d.section !== undefined ? sectionRealisasiInsJar_(pen, d.section) : String(r.section || '');
    if (d.tier !== undefined || d.section !== undefined) cekRealisasiGandaInsJar_(t.rows, r.header_id, pen, tierBaru, secBaru, d.realisasiId);
    if (d.tier !== undefined) u.tier = d.tier;
    if (d.section !== undefined && secBaru !== String(r.section || '')) {
      // section dikunci kalau sudah ada temuan (temuan mengikuti section penyulang utama)
      var adaTemuan = tabelInsJar_(INSJAR_SHEET_.TEMUAN).rows.some(function (x) { return String(x.realisasi_id) === String(d.realisasiId); });
      if (adaTemuan) throw new SisiError_('SECTION_TERKUNCI', d.realisasiId);
      u.section = secBaru;
    }
    if (d.totalTiang !== undefined) u.total_tiang = d.totalTiang;
    if (!Object.keys(u).length) throw new SisiError_('FIELD_WAJIB', 'totalTiang');
    u.timestamp_update = sekarangIso_();
    u.diubah_oleh = sesi.userId;
    ubahBaris_(t, 'realisasi_id', d.realisasiId, u, d.revision);
    auditLog_(sesi, 'INSJAR_REALISASI_UBAH', r.kode_realisasi, Object.keys(u).join(', '), 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { realisasiId: String(d.realisasiId), kodeRealisasi: String(r.kode_realisasi), revision: d.revision + 1 };
  }, 20000);
}

/* ===== temuan (petugas & admin memakai isian yang sama) ===== */

/** Isian temuan. Admin = + penyulang (+ tanggal). Petugas = + realisasiId (penyulang dari penyulang utama). */
var INSJAR_ISI_TEMUAN_ = {
  objekInspeksi: { tipe: 'pilihan', pilihan: INSPEKSI_OBJEK_ },
  tierInspeksi: { tipe: 'pilihan', pilihan: INSJAR_TIER_ },
  section: { tipe: 'teks', maks: 80 },
  jenisTemuanId: { tipe: 'teks', wajib: true, maks: 60 },
  nomorTiang: { tipe: 'teks', maks: 30 },
  segmen: { tipe: 'teks', maks: 60 },
  deskripsi: { tipe: 'teks', maks: 500, multiBaris: true, maksBaris: 5 },
  koordinat: { tipe: 'koordinat' },
  idBaris: { tipe: 'uuid' }
};

function skemaTemuanInsJar_(tambahan) {
  var s = {};
  Object.keys(INSJAR_ISI_TEMUAN_).forEach(function (k) { s[k] = INSJAR_ISI_TEMUAN_[k]; });
  Object.keys(tambahan).forEach(function (k) { s[k] = tambahan[k]; });
  return s;
}

/** v1.0.5: segmen temuan opsional dan hanya untuk object Jaringan (object lain = kosong). */
function segmenTemuanInsJar_(objek, segmen) {
  return String(objek || '') === INSJAR_OBJEK_ && segmen ? String(segmen) : '';
}

/** Baris temuan baru (isi bersama). konteks = { kodeHeader, kodeRealisasi, kodeTemuan, tanggal, ulp, tim, tier, headerId, realisasiId, timId, sumber } */
function barisTemuanInsJar_(t, d, lokasi, jenis, konteks, sesi, sekarang, id) {
  var objek = konteks.objekInspeksi || INSJAR_OBJEK_;
  return sisipAuditInsJar_({
    nomor: t.rows.length + 1, kode_header: konteks.kodeHeader, kode_realisasi: konteks.kodeRealisasi, kode_temuan: konteks.kodeTemuan,
    tanggal: konteks.tanggal, hari: hariTanggalHartek_(konteks.tanggal), ulp: konteks.ulp, tim: konteks.tim,
    objek_inspeksi: objek, tier_inspeksi: d.tierInspeksi || konteks.tierInspeksi || konteks.tier || '',
    penyulang: lokasi.penyulang, tier: konteks.tier || '', section: lokasi.section,
    segmen: segmenTemuanInsJar_(objek, d.segmen), nomor_tiang: d.nomorTiang ? String(d.nomorTiang).toUpperCase() : '',
    jenis_temuan: jenis.nama, deskripsi: d.deskripsi || '',
    koordinat: d.koordinat ? d.koordinat.teks : '', lat: d.koordinat ? d.koordinat.lat : '', lng: d.koordinat ? d.koordinat.lng : '',
    foto_temuan_file_id: '', foto_temuan_link: '', foto_tiang_file_id: '', foto_tiang_link: '',
    status: INSJAR_STATUS_TEMUAN_, sumber: konteks.sumber,
    temuan_id: id, jenis_temuan_id: jenis.jenisTemuanId, section_id: lokasi.sectionId,
    realisasi_id: konteks.realisasiId || '', header_id: konteks.headerId || '', tim_id: konteks.timId || '',
    no_gardu: konteks.noGardu || '', gardu_id: konteks.garduId || '', temuan_asal_id: konteks.temuanAsalId || '',
    belum_diperbaiki: konteks.belumDiperbaiki || ''
  }, sesi, sekarang);
}

/** Jumlah temuan di realisasi = jumlah baris temuan realisasi itu (ditulis tanpa menaikkan revision realisasi,
 *  supaya form ubah penyulang utama di HP tidak bentrok KONFLIK_REVISION karena temuan baru). */
function hitungTemuanRealisasiInsJar_(tReal, tTemuan, realisasiId, tambahan) {
  var r = tReal.rows.filter(function (x) { return String(x.realisasi_id) === String(realisasiId); })[0];
  var col = tReal.header.indexOf('jumlah_temuan');
  if (!r || col === -1) return 0;
  var n = tTemuan.rows.filter(function (x) { return String(x.realisasi_id) === String(realisasiId); }).length + (tambahan || 0);
  tReal.sheet.getRange(r._baris, col + 1).setValue(n);
  return n;
}

/** v1.0.5: petugas tidak memilih section; section = section penyulang utama (realisasi) tempat temuan dicatat. */
function skemaTemuanPetugasInsJar_(tambahan) {
  var s = skemaTemuanInsJar_(tambahan);
  delete s.section;
  return s;
}

function simpanTemuanInsJar_(sesi, data) {
  wajibPetugasInsJar_(sesi);
  var d = validasi_(data, skemaTemuanPetugasInsJar_({ realisasiId: { tipe: 'uuid', wajib: true } }));
  return denganLock_(function () {
    var tt = tabelInsJar_(INSJAR_SHEET_.TEMUAN);
    var ulang = barisUlangInsJar_(tt.rows, 'temuan_id', d.idBaris, sesi.timId);
    if (ulang) return { temuanId: String(ulang.temuan_id), kodeTemuan: String(ulang.kode_temuan), duplikat: true };
    var tr = tabelInsJar_(INSJAR_SHEET_.REALISASI);
    var real = indukInsJarMilikTim_(tr.rows, 'realisasi_id', d.realisasiId, sesi.timId, 'penyulang utama');
    var objek = objekInspeksiSesi_(sesi);
    var tierInspeksi = d.tierInspeksi || real.tier;
    var lokasi = lokasiJaringanInsJar_(real.penyulang, real.section, true);
    var jenis = jenisTemuanInsJar_(d.jenisTemuanId, objek, tierInspeksi);
    var awalan = real.kode_realisasi + '-TJR.';
    var kode = awalan + pad3_(urutKodeInsJar_(tt.rows, 'kode_temuan', awalan));
    var id = d.idBaris || uuid_(), sekarang = sekarangIso_();
    tambahBaris_(tt, barisTemuanInsJar_(tt, d, lokasi, jenis, {
      kodeHeader: real.kode_header, kodeRealisasi: real.kode_realisasi, kodeTemuan: kode, tanggal: tglInsJar_(real),
      ulp: real.ulp, tim: real.tim, tier: real.tier, tierInspeksi: tierInspeksi, objekInspeksi: objek,
      headerId: real.header_id, realisasiId: real.realisasi_id,
      timId: sesi.timId, sumber: 'INSPEKSI'
    }, sesi, sekarang, id));
    var jumlah = hitungTemuanRealisasiInsJar_(tr, tt, real.realisasi_id, 1);
    auditLog_(sesi, 'INSJAR_TEMUAN_SIMPAN', kode, jenis.nama, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { temuanId: id, kodeTemuan: kode, jumlahTemuan: jumlah, revision: 1 };
  }, 20000);
}

/**
 * v1.0.5 (permintaan kvlar 20 Okt 2026): ubah temuan petugas (hari ini, tim sendiri). Isian dikirim LENGKAP seperti
 * form: tier inspeksi, section, jenis temuan wajib; nomor tiang / segmen / deskripsi / koordinat yang tidak dikirim =
 * dikosongkan. Penyulang, penyulang utama, kode, dan foto tidak berubah. Revision wajib (KONFLIK_REVISION).
 */
function skemaUbahTemuanInsJar_() {
  var s = skemaTemuanPetugasInsJar_({ temuanId: { tipe: 'uuid', wajib: true }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 } });
  delete s.idBaris;
  return s;
}

function ubahTemuanInsJar_(sesi, data) {
  wajibPetugasInsJar_(sesi);
  var d = validasi_(data, skemaUbahTemuanInsJar_());
  return denganLock_(function () {
    var tt = tabelInsJar_(INSJAR_SHEET_.TEMUAN);
    var t = indukInsJarMilikTim_(tt.rows, 'temuan_id', d.temuanId, sesi.timId, 'temuan');
    cekTemuanBolehDiubahWo_(t);   // v1.0.10: WO sudah dimulai tim tindak lanjut = temuan terkunci
    if (Number(t.revision) !== d.revision) throw new SisiError_('KONFLIK_REVISION', d.temuanId);
    var objek = objekInspeksiSesi_(sesi);
    var tierInspeksi = d.tierInspeksi || String(t.tier_inspeksi || t.tier || '');
    var jenis = jenisTemuanInsJar_(d.jenisTemuanId, objek, tierInspeksi);
    var u = {
      tier_inspeksi: tierInspeksi,
      jenis_temuan: jenis.nama, jenis_temuan_id: jenis.jenisTemuanId,
      nomor_tiang: d.nomorTiang ? String(d.nomorTiang).toUpperCase() : '', segmen: segmenTemuanInsJar_(objek, d.segmen),
      deskripsi: d.deskripsi || '',
      koordinat: d.koordinat ? d.koordinat.teks : '', lat: d.koordinat ? d.koordinat.lat : '', lng: d.koordinat ? d.koordinat.lng : '',
      timestamp_update: sekarangIso_(), diubah_oleh: sesi.userId
    };
    var rev = ubahBaris_(tt, 'temuan_id', d.temuanId, u, d.revision);
    var baru = {};
    Object.keys(t).forEach(function (k) { baru[k] = t[k]; });
    Object.keys(u).forEach(function (k) { baru[k] = u[k]; });
    baru.revision = rev;
    auditLog_(sesi, 'INSJAR_TEMUAN_UBAH', t.kode_temuan, jenis.nama, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { temuanId: String(d.temuanId), kodeTemuan: String(t.kode_temuan || ''), revision: rev, temuan: temuanKeHpInsJar_(baru) };
  }, 20000);
}

/* ===== Input Temuan Inspeksi (admin) ===== */

function getMasterTemuanInspeksi_(sesi) {
  wajibAdminTemuan_(sesi);
  var m = masterInsJar_();
  // v1.0.11: temuan objek Gardu memilih gardu AKTIF db_Gardu (kosong kalau GARDU_SHEET_ID belum diatur)
  try { m.gardu = daftarGarduInsDu_(); } catch (e) { if (e && e.kode) m.gardu = []; else throw e; }
  return m;
}

/** v1.0.17: rentang terpanjang daftar temuan offline (tab Daftar Temuan menu Temuan Inspeksi). */
var TEMUAN_RENTANG_MAKS_HARI_ = 92;

/**
 * Daftar temuan satu tanggal (semua sumber: petugas INSPEKSI + ADMIN), urut kode. Hanya baca.
 * v1.0.17: dari + sampai = rentang tanggal (maks 92 hari) untuk daftar temuan OFFLINE di HP admin (diunduh sekali,
 * disaring di HP: jenis temuan, tanggal inspeksi, penyulang, tim inspeksi). Urut tanggal terbaru dulu lalu kode.
 */
function getTemuanInspeksi_(sesi, data) {
  wajibAdminTemuan_(sesi);
  var d = validasi_(data, { tanggal: { tipe: 'tanggal' }, penyulang: { tipe: 'teks', maks: 80 }, dari: { tipe: 'tanggal' }, sampai: { tipe: 'tanggal' } });
  if (d.dari || d.sampai) {
    if (!d.dari || !d.sampai) throw new SisiError_('FIELD_WAJIB', d.dari ? 'sampai' : 'dari');
    if (d.dari > d.sampai) throw new SisiError_('RENTANG_TIDAK_VALID', d.dari + '>' + d.sampai);
    var hari = Math.round((Date.parse(d.sampai + 'T00:00:00Z') - Date.parse(d.dari + 'T00:00:00Z')) / 864e5) + 1;
    if (hari > TEMUAN_RENTANG_MAKS_HARI_) throw new SisiError_('RENTANG_TERLALU_PANJANG', String(hari));
    var rentang = tabelInsJar_(INSJAR_SHEET_.TEMUAN).rows.filter(function (t) {
      var tg = tglInsJar_(t);
      return tg >= d.dari && tg <= d.sampai && (!d.penyulang || String(t.penyulang).trim() === d.penyulang);
    }).sort(function (a, b) {
      var ta = tglInsJar_(a), tb = tglInsJar_(b);
      return ta < tb ? 1 : ta > tb ? -1 : String(a.kode_temuan).localeCompare(String(b.kode_temuan));
    });
    // v1.0.19: urutan section per penyulang (kolom urutan db_Jaringan) untuk ringkasan per penyulang / section di HP
    return { dari: d.dari, sampai: d.sampai, diambil: sekarangIso_(), temuan: rentang.map(temuanKeHpInsJar_),
             urutanSection: bagianKalender_(function () { return petaJaringanUrut_().penyulang; }) };
  }
  var tanggal = d.tanggal || tanggalHariIniHartek_();
  var rows = tabelInsJar_(INSJAR_SHEET_.TEMUAN).rows.filter(function (t) {
    return tglInsJar_(t) === tanggal && (!d.penyulang || String(t.penyulang).trim() === d.penyulang);
  }).sort(function (a, b) { return String(a.kode_temuan).localeCompare(String(b.kode_temuan)); });
  return { tanggal: tanggal, temuan: rows.map(temuanKeHpInsJar_) };
}

/** Tanggal temuan admin: kosong = hari ini; tidak boleh lewat hari ini atau lebih dari 31 hari ke belakang. */
function tanggalTemuanAdmin_(tanggal) {
  var hariIni = tanggalHariIniHartek_();
  if (!tanggal) return hariIni;
  var selisih = (new Date(hariIni + 'T00:00:00Z').getTime() - new Date(tanggal + 'T00:00:00Z').getTime()) / 864e5;
  if (selisih < 0 || selisih > INSJAR_ADMIN_MUNDUR_HARI_) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', 'tanggal');
  return tanggal;
}

/** Kode PEG v1: header bersama per tanggal (…001), PNY sama untuk penyulang sama, TJR naik. Hanya dari baris temuan. */
function kodeTemuanAdminInsJar_(rows, tanggal, penyulang) {
  var kodeHeader = INSJAR_AWALAN_.admin + '-' + cfg_().KODE_ULP + yymmddInsJar_(tanggal) + '001';
  var awalPny = kodeHeader + '-PNY.';
  var pnyPenyulang = null, maksPny = 0;
  rows.forEach(function (r) {
    var kp = String(r.kode_realisasi || '');
    if (kp.indexOf(awalPny) !== 0) return;
    var n = parseInt(kp.slice(awalPny.length), 10);
    if (!isFinite(n)) return;
    if (n > maksPny) maksPny = n;
    if (pnyPenyulang === null && String(r.penyulang).trim() === penyulang) pnyPenyulang = n;
  });
  var kodeRealisasi = awalPny + pad3_(pnyPenyulang === null ? maksPny + 1 : pnyPenyulang);
  var awalTjr = kodeRealisasi + '-TJR.';
  return { kodeHeader: kodeHeader, kodeRealisasi: kodeRealisasi, kodeTemuan: awalTjr + pad3_(urutKodeInsJar_(rows, 'kode_temuan', awalTjr)) };
}

function simpanTemuanInspeksi_(sesi, data) {
  wajibAdminTemuan_(sesi);
  var d = validasi_(data, skemaTemuanInsJar_({
    objekInspeksi: { tipe: 'pilihan', pilihan: INSPEKSI_OBJEK_ },
    tierInspeksi: { tipe: 'pilihan', pilihan: INSJAR_TIER_ },
    penyulang: { tipe: 'teks', maks: 80 },
    garduId: { tipe: 'teks', maks: 60 },
    tanggal: { tipe: 'tanggal' }
  }));
  var tanggal = tanggalTemuanAdmin_(d.tanggal);
  // v1.0.11: object Gardu = pilih gardu (penyulang + section dari db_Gardu); object Jaringan = penyulang wajib, tanpa gardu
  var garduAdmin = null;
  if ((d.objekInspeksi || INSJAR_OBJEK_) === 'Gardu') {
    if (!d.garduId) throw new SisiError_('FIELD_WAJIB', 'garduId');
    garduAdmin = garduInsDu_(d.garduId);
  } else {
    if (d.garduId) throw new SisiError_('FIELD_TIDAK_DIKENAL', 'garduId');
    if (!d.penyulang) throw new SisiError_('FIELD_WAJIB', 'penyulang');
  }
  return denganLock_(function () {
    var tt = tabelInsJar_(INSJAR_SHEET_.TEMUAN);
    var ulang = barisUlangInsJar_(tt.rows, 'temuan_id', d.idBaris, sesi.timId);
    if (ulang) return { temuanId: String(ulang.temuan_id), kodeTemuan: String(ulang.kode_temuan), duplikat: true };
    var objek = d.objekInspeksi || INSJAR_OBJEK_;
    var tierInspeksi = d.tierInspeksi || '';
    var lokasi = garduAdmin ? lokasiGarduTemuanAdmin_(garduAdmin) : lokasiJaringanInsJar_(d.penyulang, d.section, true);
    var jenis = jenisTemuanInsJar_(d.jenisTemuanId, objek, tierInspeksi);
    var k = kodeTemuanAdminInsJar_(tt.rows, tanggal, lokasi.penyulang);
    var id = d.idBaris || uuid_(), sekarang = sekarangIso_();
    tambahBaris_(tt, barisTemuanInsJar_(tt, d, lokasi, jenis, {
      kodeHeader: k.kodeHeader, kodeRealisasi: k.kodeRealisasi, kodeTemuan: k.kodeTemuan, tanggal: tanggal,
      ulp: cfg_().ULP_NAMA, tim: sesi.timNama || 'Admin ULP', tier: '', tierInspeksi: tierInspeksi, objekInspeksi: objek,
      headerId: '', realisasiId: '',
      timId: sesi.timId || '', sumber: 'ADMIN',
      noGardu: garduAdmin ? String(garduAdmin['No Gardu'] || '').trim() : '', garduId: garduAdmin ? String(garduAdmin.gardu_id) : ''
    }, sesi, sekarang, id));
    auditLog_(sesi, 'INSJAR_TEMUAN_ADMIN', k.kodeTemuan, jenis.nama, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { temuanId: id, kodeTemuan: k.kodeTemuan, tanggal: tanggal };
  }, 20000);
}

/* ===== v1.0.0: foto temuan + foto tiang ===== */

var INSJAR_FOTO_ = { TEMUAN: 'foto_temuan', TIANG: 'foto_tiang' };

function fotoLinkInsJar_(t) {
  var o = {};
  Object.keys(INSJAR_FOTO_).forEach(function (s) {
    var link = String(t[INSJAR_FOTO_[s] + '_link'] || '').trim();
    if (link) o[s] = link;
  });
  return o;
}

function skemaFotoInsJar_() {
  var skema = isiFotoLapangan_();
  skema.temuanId = { tipe: 'uuid', wajib: true };
  skema.slot = { tipe: 'pilihan', wajib: true, pilihan: Object.keys(INSJAR_FOTO_) };
  return skema;
}

/** Tulis foto ke Drive: FOTO_TEMUAN_FOLDER_ID / Inspeksi Jaringan / <tanggal> / <kode header> / <kode temuan>_<SLOT>.jpg. */
function tulisFotoTemuanInsJar_(sesi, t, r, d, bytes, folderId) {
  var kol = INSJAR_FOTO_[d.slot];
  var ada = String(r[kol + '_link'] || '').trim();
  if (ada) return { temuanId: d.temuanId, slot: d.slot, link: ada, status: 'DUPLIKAT', revision: Number(r.revision) || 1 };
  var kode = kodeFotoTemuan_(r);
  var f = simpanFotoLapangan_(folderId, ['Inspeksi Jaringan', tglInsJar_(r), String(r.kode_header || '-')],
    d.temuanId + '-' + d.slot, namaFotoRow_(kode, d.slot, 1), bytes);
  var u = { timestamp_update: sekarangIso_(), diubah_oleh: sesi.userId };
  u[kol + '_file_id'] = f.fileId;
  u[kol + '_link'] = f.link;
  // v1.0.5: revision temuan ikut naik; dikirim ke HP supaya ubahTemuanInsJar berikutnya tidak KONFLIK_REVISION
  var rev = ubahBaris_(t, 'temuan_id', d.temuanId, u);
  auditLog_(sesi, 'INSJAR_FOTO_UPLOAD', kode, d.slot, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
  return { temuanId: d.temuanId, slot: d.slot, link: f.link, status: 'OK', revision: rev };
}

function folderFotoTemuan_() {
  var c = cfg_();
  if (!c.FOTO_TEMUAN_FOLDER_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'FOTO_TEMUAN_FOLDER_ID');
  return c.FOTO_TEMUAN_FOLDER_ID;
}

/** Petugas: foto temuan milik tim sesi, hari ini. */
function uploadFotoInsJar_(sesi, data) {
  wajibPetugasInsJar_(sesi);
  var d = validasi_(data, skemaFotoInsJar_());
  var folderId = folderFotoTemuan_();
  var bytes = bytesFotoLapangan_(d);
  return denganLock_(function () {
    var t = tabelInsJar_(INSJAR_SHEET_.TEMUAN);
    var r = indukInsJarMilikTim_(t.rows, 'temuan_id', d.temuanId, sesi.timId, 'temuan');
    return tulisFotoTemuanInsJar_(sesi, t, r, d, bytes, folderId);
  }, 30000);
}

/** Admin (Input Temuan Inspeksi): hanya temuan sumber ADMIN, tanggal maks 31 hari ke belakang. */
function uploadFotoTemuanInspeksi_(sesi, data) {
  wajibAdminTemuan_(sesi);
  var d = validasi_(data, skemaFotoInsJar_());
  var folderId = folderFotoTemuan_();
  var bytes = bytesFotoLapangan_(d);
  return denganLock_(function () {
    var t = tabelInsJar_(INSJAR_SHEET_.TEMUAN);
    var r = t.rows.filter(function (x) { return String(x.temuan_id) === String(d.temuanId); })[0];
    if (!r) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'temuan');
    if (String(r.sumber) !== 'ADMIN') throw new SisiError_('BUKAN_MILIK_TIM', 'temuan petugas');
    tanggalTemuanAdmin_(tglInsJar_(r));
    return tulisFotoTemuanInsJar_(sesi, t, r, d, bytes, folderId);
  }, 30000);
}

/* ===== v1.0.19: foto temuan (kartu temuan tidak lagi hanya ikon awan) ===== */

/**
 * v1.0.19 (permintaan kvlar 23 Okt 2026): foto temuan / tiang dibaca lewat server (Drive privat), satu endpoint per menu
 * supaya tiap layar hanya membawa beban + hak aksesnya sendiri. [boleh(t)] = cek kepemilikan baris temuan.
 * {temuanId, slot TEMUAN|TIANG, ukuran KECIL|PENUH} -> {temuanId, slot, mime, kecil, ukuranByte, data base64}.
 */
function fotoTemuanDrive_(data, boleh) {
  var d = validasi_(data, {
    temuanId: { tipe: 'uuid', wajib: true },
    slot: { tipe: 'pilihan', wajib: true, pilihan: Object.keys(INSJAR_FOTO_) },
    ukuran: { tipe: 'pilihan', pilihan: ['KECIL', 'PENUH'] }
  });
  var t = tabelInsJar_(INSJAR_SHEET_.TEMUAN).rows.filter(function (x) { return String(x.temuan_id) === String(d.temuanId); })[0];
  if (!t) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'temuan');
  if (!boleh(t)) throw new SisiError_('BUKAN_MILIK_TIM', 'temuan');
  return jawabFotoDriveWo_(String(t[INSJAR_FOTO_[d.slot] + '_file_id'] || '').trim(), d.slot, d.ukuran, { temuanId: String(d.temuanId) });
}

/** Admin (menu OPS_INPUT_TEMUAN): semua temuan. */
function getFotoTemuanInspeksi_(sesi, data) {
  wajibAdminTemuan_(sesi);
  return fotoTemuanDrive_(data, function () { return true; });
}

/** Petugas Inspeksi Jaringan: temuan tim sendiri. */
function getFotoTemuanInsJar_(sesi, data) {
  wajibPetugasInsJar_(sesi);
  return fotoTemuanDrive_(data, function (t) { return String(t.tim_id) === String(sesi.timId); });
}

/* ===== v1.0.6: data laporan UP3 (D. Inspeksi) dan UIW (CARE FOR ASSET) ===== */

/** Kata kunci temuan ROW (sama dengan v1 Tek-LapUP3UIWHarian.js); selain itu = Peralatan. */
var INSJAR_ROW_KATA_ = ['pohon', 'rabas', 'pangkas', 'tebang'];

/** Rentang section untuk UIW: satu section = namanya; lebih dari satu = awal (urutan db_Jaringan terendah) - akhir (tertinggi). */
function rentangSectionInsJar_(pen, names) {
  var uniq = names.filter(function (n, i) { return n && names.indexOf(n) === i; });
  if (!uniq.length) return '';
  if (uniq.length === 1) return uniq[0];
  var master = (petaJaringanUrut_().penyulang.filter(function (p) { return p.nama === pen; })[0] || { section: [] }).section;
  var pos = function (n) { var i = master.indexOf(n); return i < 0 ? 1e9 : i; };
  uniq.sort(function (a, b) { return pos(a) - pos(b) || a.localeCompare(b); });
  var awal = bagianSection_(uniq[0])[0];
  var akhirParts = bagianSection_(uniq[uniq.length - 1]);
  var akhir = akhirParts[akhirParts.length - 1];
  return awal === akhir ? awal : awal + ' - ' + akhir;
}

/**
 * Inspeksi Jaringan satu tanggal (hanya baca). Hasil:
 *  perPenyulang: { penyulang: { jaringan: total tiang } }   (D. Inspeksi UP3, Gawang)
 *  komulatif: { jaringan: total tiang tgl 1 s.d. tanggal }
 *  care: [{ penyulang, section (rentang), tiang, peralatan, row }]   (CARE FOR ASSET UIW)
 *  status, timLapor: kartu Status tim (v1.0.35, statusTimHeader_)
 * Penyulang utama hanya dihitung kalau header-nya AKTIF. Temuan admin (tanpa header) ikut dihitung.
 * v1.0.34 (aturan v1 Tek-LapUP3UIWHarian, permintaan kvlar 26 Okt 2026): Tier 2 dilaporkan H+1 di D. Inspeksi UP3
 * (harian + komulatif); Tier 2 di tanggal akhir bulan tidak terbawa ke bulan berikutnya. CARE FOR ASSET UIW tetap
 * pada tanggal inspeksinya (sama v1).
 * Konfigurasi belum lengkap = kosong (laporan tetap jalan).
 */
function dataInspeksiHari_(tanggal) {
  // v1.0.35: status / timLapor = kartu Status tim laporan (statusTimHeader_); V1 = modul belum disiapkan di server
  var kosong = { perPenyulang: {}, komulatif: { jaringan: 0 }, care: [], status: 'V1', timLapor: 0 };
  var c = cfg_();
  if (!c.INSJAR_SHEET_ID || !c.TEMUAN_SHEET_ID) return kosong;
  var bulan = tanggal.slice(0, 7);
  var aktif = {}, H = tabelInsJar_(INSJAR_SHEET_.HEADER).rows, R = tabelInsJar_(INSJAR_SHEET_.REALISASI).rows;
  H.forEach(function (h) {
    if (String(h.status || 'AKTIF') === 'AKTIF') aktif[String(h.header_id)] = true;
  });
  var perPenyulang = {}, komulatif = 0, urutPen = [], agg = {};
  R.forEach(function (r) {
    if (!aktif[String(r.header_id)]) return;
    var t = tglInsJar_(r);
    if (t.slice(0, 7) !== bulan) return;
    var tiang = Number(r.total_tiang) || 0, p = String(r.penyulang || '').trim() || '-';
    var efektif = /tier\s*2/i.test(String(r.tier || '')) ? tambahHari_(t, 1) : t;
    if (efektif.slice(0, 7) === bulan && efektif <= tanggal) {
      komulatif += tiang;
      if (efektif === tanggal) perPenyulang[p] = { jaringan: (perPenyulang[p] ? perPenyulang[p].jaringan : 0) + tiang };
    }
    if (t !== tanggal) return;
    if (!agg[p]) { agg[p] = { tiang: 0, sections: [], peralatan: 0, row: 0 }; urutPen.push(p); }
    agg[p].tiang += tiang;
    var sec = String(r.section || '').trim();
    if (sec && agg[p].sections.indexOf(sec) === -1) agg[p].sections.push(sec);
  });
  tabelInsJar_(INSJAR_SHEET_.TEMUAN).rows.forEach(function (t) {
    if (tglInsJar_(t) !== tanggal) return;
    if (String(t.objek_inspeksi || 'Jaringan').trim().toLowerCase() !== 'jaringan') return;
    if (t.header_id && !aktif[String(t.header_id)]) return;
    var p = String(t.penyulang || '').trim() || '-';
    if (!agg[p]) { agg[p] = { tiang: 0, sections: [], peralatan: 0, row: 0 }; urutPen.push(p); }
    var nama = String(t.jenis_temuan || '').toLowerCase();
    var isRow = INSJAR_ROW_KATA_.some(function (k) { return nama.indexOf(k) !== -1; });
    if (isRow) agg[p].row++; else agg[p].peralatan++;
  });
  var care = urutPen.slice().sort().map(function (p) {
    var a = agg[p];
    return { penyulang: p, section: rentangSectionInsJar_(p, a.sections) || '-', tiang: a.tiang, peralatan: a.peralatan, row: a.row };
  });
  return Object.assign({ perPenyulang: perPenyulang, komulatif: { jaringan: komulatif }, care: care },
    statusTimHeader_(H, R, tanggal, tglInsJar_));
}

/* ===== cek konfigurasi (dipanggil ADMIN_cekKonfigurasi) ===== */

function cekKonfigInsJar_(c) {
  var masalah = 0;
  var ok = function (p) { console.log('  [OK]          ' + p); };
  var perhatian = function (p) { masalah++; console.warn('  [PERHATIAN]   ' + p); };
  var gagal = function (p) { masalah++; console.error('  [GAGAL]       ' + p); };
  console.log('');
  console.log('--- Inspeksi Jaringan (SiSi_InsJar + SiSi_Temuan + db_Jenis_Temuan di SiSi_Master) ---');
  if (!c.INSJAR_SHEET_ID) {
    console.log('  [DILEWATI]    INSJAR_SHEET_ID kosong, modul Inspeksi Jaringan belum disiapkan (isi Script Property, lalu ADMIN_siapkanSheetInsJar)');
    return 0;
  }
  if (!c.FOTO_TEMUAN_FOLDER_ID) perhatian('FOTO_TEMUAN_FOLDER_ID kosong, foto temuan (InsJar, InsDu, admin) dan foto WO tidak bisa dikirim (folder Drive privat)');
  else if (!PropertiesService.getScriptProperties().getProperty('FOTO_TEMUAN_FOLDER_ID')) {
    perhatian('Script Property INSJAR_FOTO_FOLDER_ID (nama lama) masih dipakai: buat FOTO_TEMUAN_FOLDER_ID dengan isi yang sama, lalu hapus nama lama');
  } else ok('FOTO_TEMUAN_FOLDER_ID terisi (foto temuan InsJar, InsDu, admin, foto WO)');
  try { bukaSpreadsheet_(c.INSJAR_SHEET_ID); } catch (e) {
    gagal('INSJAR_SHEET_ID tidak bisa dibuka: ' + (e.message || e));
    return masalah;
  }
  var tabCek = Object.keys(INSJAR_HEADER_).map(function (n) { return { prop: 'INSJAR_SHEET_ID', nama: n, hk: INSJAR_HEADER_[n] }; });
  if (!c.TEMUAN_SHEET_ID) gagal('TEMUAN_SHEET_ID kosong: isi dengan ID spreadsheet SiSi_Temuan (db_temuan_inspeksi), lalu ADMIN_siapkanSheetInsJar');
  else {
    try {
      bukaSpreadsheet_(c.TEMUAN_SHEET_ID);
      Object.keys(TEMUAN_HEADER_).forEach(function (n) { tabCek.push({ prop: 'TEMUAN_SHEET_ID', nama: n, hk: TEMUAN_HEADER_[n] }); });
    } catch (eTm) { gagal('TEMUAN_SHEET_ID tidak bisa dibuka: ' + (eTm.message || eTm)); }
  }
  tabCek.forEach(function (tc) {
    var nama = tc.nama;
    try {
      var t = tabel_(tc.prop, nama), hk = tc.hk;
      var beda = bedaStruktur_(t.header.slice(0, hk.length), hk);
      if (beda.length) perhatian(nama + ': STRUKTUR BEDA -> ' + beda.slice(0, 5).join(' | ') + ' (jalankan ADMIN_siapkanSheetInsJar)');
      else ok(nama + ' (' + t.rows.length + ' baris)');
    } catch (e) {
      if (e.kode === 'SHEET_TIDAK_ADA') gagal(nama + ' belum ada (jalankan ADMIN_siapkanSheetInsJar)');
      else gagal(nama + ': ' + (e.kode || e.message));
    }
  });
  try {
    var jt = tabel_('MASTER_SHEET_ID', INSJAR_SHEET_.JENIS_TEMUAN);
    var kurang = INSJAR_MASTER_HEADER_.db_Jenis_Temuan.filter(function (h) { return jt.header.indexOf(h) === -1; });
    if (kurang.length) gagal('db_Jenis_Temuan (SiSi_Master): kolom kurang -> ' + kurang.join(', ') + ' (jalankan ADMIN_siapkanSheetInsJar)');
    else {
      var tanpaId = jt.rows.filter(function (r) { return String(r.jenis_temuan || '').trim() && !String(r.jenis_temuan_id || '').trim(); }).length;
      if (tanpaId) perhatian('db_Jenis_Temuan: ' + tanpaId + ' baris tanpa jenis_temuan_id (jalankan ADMIN_lengkapiMaster untuk mengisi)');
      var aktif = jenisTemuanAktifInsJar_().length;
      if (aktif) ok('db_Jenis_Temuan (SiSi_Master): ' + aktif + ' jenis temuan aktif (objek Jaringan)');
      else perhatian('db_Jenis_Temuan: belum ada jenis temuan aktif, dropdown temuan di HP kosong');
    }
  } catch (eJ) {
    gagal(eJ.kode === 'SHEET_TIDAK_ADA' ? 'db_Jenis_Temuan belum ada di SiSi_Master (jalankan ADMIN_siapkanSheetInsJar)' : 'db_Jenis_Temuan: ' + (eJ.kode || eJ.message));
  }
  try {
    var jar = jaringanAktifHartek_().length;
    if (jar) ok('db_Jaringan (SiSi_Master): ' + jar + ' baris aktif, dropdown penyulang / section terisi');
    else perhatian('db_Jaringan (SiSi_Master): tidak ada baris aktif, dropdown penyulang / section kosong');
  } catch (eJr) { gagal('db_Jaringan: ' + (eJr.kode || eJr.message)); }
  try {
    var menu = tabel_('MASTER_SHEET_ID', 'db_Menu').rows;
    var akses = tabel_('MASTER_SHEET_ID', 'db_Akses').rows;
    [[INSJAR_MENU_.petugas, 'Input Inspeksi Jaringan'], [INSJAR_MENU_.admin, 'Temuan Inspeksi']].forEach(function (m) {
      var r = menu.filter(function (x) { return String(x.menu_kode).trim() === m[0]; })[0];
      if (!r) perhatian('menu ' + m[0] + ' belum ada di db_Menu (impor docs/db_Menu.tsv)');
      else if (!isAktif_(r.aktif)) perhatian('menu ' + m[0] + ' nonaktif di db_Menu');
      else if (String(r.nama).trim() !== m[1]) perhatian('db_Menu ' + m[0] + ': nama "' + String(r.nama).trim() + '", ganti jadi "' + m[1] + '"');
      else ok('menu ' + m[0] + ' (' + m[1] + ') aktif di db_Menu');
    });
    var punya = akses.some(function (r) {
      return String(r.role).trim() === 'PETUGAS' && String(r.jenis_tim || '').trim().toUpperCase() === INSJAR_JENIS_TIM_ &&
        String(r.menu_kode).trim() === INSJAR_MENU_.petugas && String(r.aksi || '').trim().toUpperCase() === 'UBAH';
    });
    if (punya) ok('db_Akses: PETUGAS / INSPEKSI_JARINGAN -> OPS_INSJAR_INPUT (UBAH)');
    else perhatian('db_Akses belum punya PETUGAS / INSPEKSI_JARINGAN / OPS_INSJAR_INPUT / UBAH (impor docs/db_Akses.tsv)');
  } catch (eA) { gagal('db_Menu / db_Akses: ' + (eA.kode || eA.message)); }
  try {
    var timI = tabel_('MASTER_SHEET_ID', 'db_Tim').rows.filter(function (r) {
      return String(r.jenis || '').trim().toUpperCase() === INSJAR_JENIS_TIM_ && isAktif_(r.aktif);
    });
    if (!timI.length) perhatian('belum ada tim INSPEKSI_JARINGAN aktif di db_Tim');
    else {
      var idTim = timI.map(function (r) { return String(r.tim_id); });
      var akun = tabel_('MASTER_SHEET_ID', 'db_Users').rows.filter(function (u) {
        return String(u.role).trim() === 'PETUGAS' && idTim.indexOf(String(u.tim_id)) !== -1 && isAktif_(u.aktif);
      }).length;
      ok(timI.length + ' tim INSPEKSI_JARINGAN aktif, ' + akun + ' akun login tim (role PETUGAS)');
      if (!akun) perhatian('belum ada akun login tim aktif (role PETUGAS) di tim INSPEKSI_JARINGAN');
    }
  } catch (eT) { gagal('db_Tim / db_Users: ' + (eT.kode || eT.message)); }
  return masalah;
}

/* ===== setup sheet (admin, idempoten): buat + sesuaikan struktur, sama dengan ADMIN_siapkanSheetHartek ===== */

/**
 * Membuat DAN menyesuaikan sheet Inspeksi Jaringan (aman diulang):
 *  1. SiSi_InsJar > insjar_header, insjar_realisasi.
 *  2. SiSi_Temuan > db_temuan_inspeksi (v1.0.0, spreadsheet terpisah).
 *  3. SiSi_Master > db_Jenis_Temuan.
 * Tab yang sudah ada disesuaikan ke struktur kode (judul diganti, kolom disisip / dipindah utuh, kolom asing tidak dihapus).
 * v1.0.5: KECUALI kolom usang INSJAR_KOLOM_USANG_ (insjar_realisasi: section_awal, section_akhir, segmen) yang dihapus.
 * Sebelum menggeser kolom dibuat salinan cadangan spreadsheet. v1.0.34: jenis_temuan_id kosong diisi ADMIN_lengkapiMaster
 * (sama dengan ID master lain), bukan di sini lagi.
 * Lihat rencananya saja tanpa mengubah apa pun: ADMIN_cekSheetInsJar.
 */
function ADMIN_siapkanSheetInsJar() { pastikanPemilik_(); return jalankanSiapkanInsJar_(false); }

function ADMIN_cekSheetInsJar() { pastikanPemilik_(); return jalankanSiapkanInsJar_(true); }

/** v1.0.5: kolom usang yang masih ada di tab [{ kol (1-based), nama }], dari kanan ke kiri. */
function kolomUsangInsJar_(sh, nama) {
  var daftar = INSJAR_KOLOM_USANG_[nama];
  if (!daftar || !sh) return [];
  var lebar = sh.getLastColumn() || 0;
  if (!lebar) return [];
  var judul = sh.getRange(1, 1, 1, lebar).getValues()[0].map(function (x) { return String(x === null || x === undefined ? '' : x).trim(); });
  var hasil = [];
  judul.forEach(function (j, i) { if (daftar.indexOf(j) !== -1) hasil.push({ kol: i + 1, nama: j }); });
  return hasil.sort(function (a, b) { return b.kol - a.kol; });
}

function hapusKolomUsangInsJar_(sh, kolom, label, uji) {
  kolom.forEach(function (k) {
    if (uji) { console.log(label + ': kolom lama "' + k.nama + '" (' + kolomHuruf_(k.kol) + ') AKAN DIHAPUS'); return; }
    sh.deleteColumn(k.kol);
    console.log(label + ': kolom lama "' + k.nama + '" (' + kolomHuruf_(k.kol) + ') dihapus');
  });
}

function jalankanSiapkanInsJar_(uji) {
  var c = cfg_();
  var target = [{ id: c.MASTER_SHEET_ID, label: 'SiSi_Master > ', tab: INSJAR_MASTER_HEADER_ }];
  if (c.INSJAR_SHEET_ID) target.push({ id: c.INSJAR_SHEET_ID, label: 'SiSi_InsJar > ', tab: INSJAR_HEADER_ });
  if (c.TEMUAN_SHEET_ID) target.push({ id: c.TEMUAN_SHEET_ID, label: 'SiSi_Temuan > ', tab: TEMUAN_HEADER_ });
  console.log(uji ? '=== CEK SHEET INSPEKSI JARINGAN (tidak mengubah apa pun) ===' : '=== SIAPKAN SHEET INSPEKSI JARINGAN ===');
  var masalah = 0;
  denganLock_(function () {
    target.forEach(function (tg) {
      var ss = bukaSpreadsheet_(tg.id);
      var nama = Object.keys(tg.tab);
      var usang = {};
      var perluGeser = nama.some(function (n) {
        var sh = ss.getSheetByName(n);
        if (!sh) return false;
        usang[n] = kolomUsangInsJar_(sh, n);
        var r = rencanaKolomHartek_(sh.getRange(1, 1, 1, Math.max(tg.tab[n].length, sh.getLastColumn() || 1)).getValues()[0], tg.tab[n]);
        return usang[n].length > 0 || (!r.galat && r.langkah.length > 0);
      });
      if (!uji && perluGeser && !cadanganSheetHartek_(tg.id, tg.label)) { masalah++; return; }
      nama.forEach(function (n) {
        if (usang[n] && usang[n].length) hapusKolomUsangInsJar_(ss.getSheetByName(n), usang[n], tg.label + n, uji);
      });
      nama.forEach(function (n) {
        if (siapkanTabHartek_(ss, n, tg.tab[n], tg.label, uji).status === 'GAGAL') masalah++;
      });
    });
    if (!c.INSJAR_SHEET_ID) { masalah++; console.error('INSJAR_SHEET_ID kosong: isi Script Property dengan ID spreadsheet SiSi_InsJar, lalu jalankan lagi.'); }
    if (!c.TEMUAN_SHEET_ID) { masalah++; console.error('TEMUAN_SHEET_ID kosong: isi Script Property dengan ID spreadsheet SiSi_Temuan (db_temuan_inspeksi), lalu jalankan lagi.'); }
  }, 30000);
  console.log(masalah ? 'SELESAI dengan ' + masalah + ' masalah (lihat log di atas).'
    : uji ? 'SELESAI. Jalankan ADMIN_siapkanSheetInsJar untuk menerapkan rencana di atas.'
      : 'SELESAI. Isi jenis temuan di db_Jenis_Temuan (SiSi_Master), jalankan ADMIN_lengkapiMaster (isi jenis_temuan_id), impor db_Menu / db_Akses InsJar, lalu ADMIN_bersihkanCache + ADMIN_cekKonfigurasi.');
  return masalah;
}
