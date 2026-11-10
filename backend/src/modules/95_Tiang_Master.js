/**
 * Master Tiang + Switching (permintaan Master Guswan 8 Nov 2026; rancangan docs/superpowers/specs/2026-11-08-master-tiang-switching).
 * Verifikasi aset lapangan dari awal: tiang TM (db_Tiang + db_Tiang_Sirkuit), segmen (db_Segmen, dibuat Admin), switching (db_Switching).
 * Spreadsheet SiSi_Tiang (Script Property / CFG_JSON TIANG_SHEET_ID). Referensi di SiSi_Master: db_Konstruksi (kode konstruksi, id / aktif
 * dilengkapi ADMIN_lengkapiMaster) + db_Tiang_Pemetaan (alias nama kolom sheet db_TiangMaster di file ITB, diedit Admin tanpa deploy).
 * Semua tab berkolom pertama `No` (nomor urut baris, BUKAN kunci; pola SiSi_Gudang). Modul ini menyiapkan sheet (header saja). Isi diketik / disinkronkan menyusul; sumber db_TiangMaster HANYA DIBACA.
 */

/** db_Tiang: 1 baris per tiang fisik. Kolom aset (sinkron dari sumber) di depan, kolom verifikasi (lapangan, tidak pernah ditimpa sinkron) di belakang. */
var TIANG_HEADER_ = {
  db_Tiang: [
    'No',
    // identitas
    'tiang_id', 'assetnum_lain', 'digabung_ke', 'ssot_number', 'nama', 'kode_nama_aset',
    // kolom aset (hanya diperbarui sinkron dari db_TiangMaster)
    'lat_aset', 'lng_aset', 'konstruksi_aset', 'jenis_tiang_aset', 'ukuran_tiang_aset', 'kelas_area', 'status_aset', 'bulan_sumber', 'keterangan_sumber',
    // kolom verifikasi (hanya diisi verifikasi lapangan)
    'jumlah_sirkuit', 'jenis_tiang', 'ukuran_tiang', 'konstruksi_lapangan', 'lat', 'lng', 'sumber_koordinat', 'akurasi_m', 'gardu_id',
    'foto_tiang_id', 'foto_kepala_id', 'tanda_cek', 'status_verifikasi', 'verifikasi_terakhir', 'diverifikasi_oleh',
    'aktif', 'revision', 'diubah_pada', 'diubah_oleh'],
  // 1 baris per sirkuit di sebuah tiang (tiang satu sirkuit = satu baris); gawang = dari tiang induk sirkuit ini ke tiang ini
  db_Tiang_Sirkuit: [
    'No', 'sirkuit_id', 'tiang_id', 'penyulang', 'posisi', 'induk_tiang_id', 'gawang_m', 'peran_titik',
    'section_id', 'segmen_id', 'segmen_aset', 'switching_id', 'switching_di_tiang',
    'jenis_kabel', 'ukuran_mm2', 'penghantar_id', 'tanda_cek_gawang', 'status_verifikasi',
    'aktif', 'revision', 'diubah_pada', 'diubah_oleh',
    // konfirmasi induk + keterangan wajib (ditambah 9 Nov 2026; di belakang supaya tab lama cukup diperpanjang)
    'induk_status', 'induk_keterangan', 'switching_keterangan'],
  // dibuat Admin satu per satu (web atau HP); petugas hanya memilih
  db_Segmen: [
    'No', 'segmen_id', 'nama', 'penyulang', 'section_id', 'urutan', 'induk_segmen_id',
    'awal_jenis', 'awal_nama', 'awal_switching_id', 'awal_gardu_id', 'akhir_jenis', 'akhir_nama', 'akhir_switching_id', 'akhir_gardu_id',
    'segmen_itb', 'tiang_awal_id', 'tiang_akhir_id', 'panjang_m', 'jumlah_tiang', 'jumlah_terverifikasi', 'status_verifikasi', 'catatan',
    'aktif', 'revision', 'diubah_pada', 'diubah_oleh',
    // segmen kabel tanah (ditambah 10 Nov 2026; di belakang supaya tab lama cukup diperpanjang)
    'jenis_segmen', 'jenis_kabel', 'ukuran_mm2', 'panjang_kabel_m', 'penghantar_id', 'status_data'],
  // dibangun dari lapangan; data unit (rating, media, penggerak) opsional karena baru sisi kontroler yang bisa dicatat
  db_Switching: [
    'No', 'switching_id', 'nama', 'kode_aset', 'jenis',
    'merk_kontroler', 'tipe_kontroler', 'versi_firmware', 'rasio_ct', 'rasio_vt',
    'merk', 'tipe', 'nomor_seri', 'tahun_pasang', 'rating_kv', 'rating_a', 'kapasitas_putus_ka', 'media', 'penggerak',
    'penyulang', 'section_id', 'tiang_id', 'sirkuit_id', 'lat', 'lng',
    'switching_hulu_id', 'proteksi_hulu_id', 'posisi_normal', 'titik_hubung', 'tiang_sisi_a', 'tiang_sisi_b', 'penyulang_sisi_b',
    'bisa_trip', 'catat_gangguan', 'baca_arus', 'baca_tegangan', 'terhubung_scada', 'kode_rtu', 'media_komunikasi',
    'fungsi_fco', 'gardu_id', 'fuse_tipe', 'fuse_rating',
    'status_operasi', 'status_verifikasi', 'verifikasi_terakhir', 'kondisi', 'catatan',
    'foto_unit_id', 'foto_nameplate_id', 'foto_kontroler_id',
    'aktif', 'revision', 'diubah_pada', 'diubah_oleh']
};

/** Tab referensi di SiSi_Master. Baris diketik Admin; id / aktif / revision / waktu / pengubah dilengkapi ADMIN_lengkapiMaster. */
var TIANG_MASTER_HEADER_ = {
  db_Konstruksi: ['No', 'konstruksi_id', 'kode', 'nama', 'keterangan', 'susunan', 'gmd_m', 'urutan', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'],
  db_Ukuran_Tiang: ['No', 'ukuran_id', 'nama', 'keterangan', 'urutan', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'],
  db_Tiang_Pemetaan: ['No', 'pemetaan_id', 'kolom_logis', 'alias', 'wajib', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh']
};

/** Kolom berformat teks: ID aset berupa angka panjang + waktu supaya Sheets tidak mengubahnya jadi angka / Date. */
var TIANG_KOLOM_TEKS_ = {
  db_Tiang: ['tiang_id', 'assetnum_lain', 'digabung_ke', 'ssot_number', 'nama', 'kode_nama_aset', 'bulan_sumber', 'verifikasi_terakhir', 'diubah_pada'],
  db_Tiang_Sirkuit: ['sirkuit_id', 'tiang_id', 'induk_tiang_id', 'diubah_pada'],
  db_Segmen: ['tiang_awal_id', 'tiang_akhir_id', 'diubah_pada'],
  db_Switching: ['kode_aset', 'nomor_seri', 'tiang_id', 'tiang_sisi_a', 'tiang_sisi_b', 'verifikasi_terakhir', 'diubah_pada'],
  db_Konstruksi: ['kode', 'nama', 'diubah_pada'],
  db_Ukuran_Tiang: ['nama', 'diubah_pada'],
  db_Tiang_Pemetaan: ['kolom_logis', 'alias', 'diubah_pada']
};

/** Salinan skema SiSi_Tiang untuk skemaHeader_() (90_AdminTools.js). */
function tiangSkema_() {
  var h = {};
  Object.keys(TIANG_HEADER_).forEach(function (n) { h[n] = TIANG_HEADER_[n].slice(); });
  return h;
}

/** Salinan tab referensi SiSi_Master untuk skemaHeader_(). */
function tiangMasterSkema_() {
  var h = {};
  Object.keys(TIANG_MASTER_HEADER_).forEach(function (n) { h[n] = TIANG_MASTER_HEADER_[n].slice(); });
  return h;
}

// ====================== Alat admin (jalankan dari editor Apps Script oleh pemilik) ======================

function ADMIN_siapkanSheetTiang() { pastikanPemilik_(); return jalankanSiapkanTiang_(false); }

function ADMIN_cekSheetTiang() { pastikanPemilik_(); return jalankanSiapkanTiang_(true); }

/** Pastikan tab [nama] ada dengan header [header]; header yang beda tidak pernah ditimpa. Hasil: 0 ok, 1 masalah. */
function pastikanTabTiang_(ss, nama, header, kolomTeks, uji) {
  var sh = ss.getSheetByName(nama);
  if (!sh) {
    if (uji) { console.warn(nama + ' belum ada: jalankan ADMIN_siapkanSheetTiang'); return 1; }
    sh = ss.insertSheet(nama);
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    (kolomTeks || []).forEach(function (k) {
      if (typeof sh.getRange(1, 1).setNumberFormat === 'function') sh.getRange(1, header.indexOf(k) + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    });
    if (typeof sh.setFrozenRows === 'function') sh.setFrozenRows(1);
    console.log(nama + ' dibuat');
    return 0;
  }
  var ada = sh.getRange(1, 1, 1, Math.max(header.length, sh.getLastColumn())).getValues()[0].map(function (h) { return String(h).trim(); });
  while (ada.length && !ada[ada.length - 1]) ada.pop();
  // tab lama yang headernya hanya kekurangan kolom di belakang: kolom baru ditambahkan, kolom lama tidak disentuh
  if (ada.length < header.length && ada.join('|') === header.slice(0, ada.length).join('|')) {
    if (uji) { console.warn(nama + ': kolom baru belum ada (' + header.slice(ada.length).join(',') + '): jalankan ADMIN_siapkanSheetTiang'); return 1; }
    sh.getRange(1, ada.length + 1, 1, header.length - ada.length).setValues([header.slice(ada.length)]);
    console.log(nama + ': kolom ' + header.slice(ada.length).join(', ') + ' ditambahkan');
    return 0;
  }
  // tab lama tanpa kolom No di depan (header lain persis sama): sisipkan kolom A bernama No; baris tidak disentuh
  if (header[0] === 'No' && ada.join('|') === header.slice(1).join('|') && typeof sh.insertColumnBefore === 'function') {
    if (uji) { console.warn(nama + ': kolom No belum ada: jalankan ADMIN_siapkanSheetTiang'); return 1; }
    sh.insertColumnBefore(1);
    sh.getRange(1, 1).setValue('No');
    console.log(nama + ': kolom No ditambahkan');
    return 0;
  }
  if (ada.join('|') !== header.join('|')) {
    console.error(nama + ': header beda dari skema (' + ada.join(',') + '), tidak diubah');
    return 1;
  }
  console.log(nama + ': header sesuai');
  return 0;
}

/**
 * Buat spreadsheet SiSi_Tiang (db_Tiang, db_Tiang_Sirkuit, db_Segmen, db_Switching) dan tab referensi SiSi_Master (db_Konstruksi,
 * db_Ukuran_Tiang, db_Tiang_Pemetaan), hanya header. Tab yang sudah ada hanya DICEK: header yang beda tidak pernah ditimpa, baris tidak disentuh. Aman
 * diulang. uji = tidak mengubah apa pun. Hasil: jumlah masalah (0 = siap). Berikutnya: isi baris db_Konstruksi / db_Tiang_Pemetaan
 * manual, lalu ADMIN_lengkapiMaster.
 */
function jalankanSiapkanTiang_(uji) {
  var c = cfg_();
  if (!c.TIANG_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'TIANG_SHEET_ID');
  return denganLock_(function () {
    var masalah = 0, ss = bukaSpreadsheet_(c.TIANG_SHEET_ID), master = bukaSpreadsheet_(c.MASTER_SHEET_ID);
    Object.keys(TIANG_HEADER_).forEach(function (n) { masalah += pastikanTabTiang_(ss, n, TIANG_HEADER_[n], TIANG_KOLOM_TEKS_[n], uji); });
    Object.keys(TIANG_MASTER_HEADER_).forEach(function (n) { masalah += pastikanTabTiang_(master, n, TIANG_MASTER_HEADER_[n], TIANG_KOLOM_TEKS_[n], uji); });
    if (!uji && !masalah) {
      console.log('Master tiang siap. Isi baris db_Konstruksi (kode + nama), db_Ukuran_Tiang (nama) dan db_Tiang_Pemetaan di SiSi_Master, lalu jalankan ADMIN_lengkapiMaster.');
    }
    return masalah;
  });
}
