/**
 * SiSi v2 - Konfigurasi.
 *
 * Semua nilai per environment dibaca dari Script Properties
 * (Project Settings > Script Properties). Tidak ada ID yang ditulis di kode.
 *
 * ATURAN v2: tidak ada kode top-level yang bergantung pada file lain.
 * Semua dibangun di dalam fungsi, jadi urutan load file tidak berpengaruh.
 */
var PBKDF2_MIN_PRODUCTION_ = 5000;
var CFG_WAJIB_ = ['ENV', 'MASTER_SHEET_ID', 'AUTH_SHEET_ID', 'KODE_ULP', 'ADMIN_EMAIL'];

function cfg_() {
  var p = PropertiesService.getScriptProperties().getProperties();
  CFG_WAJIB_.forEach(function (k) {
    if (!p[k]) throw new SisiError_('CONFIG_TIDAK_LENGKAP', k);
  });
  if (p.ENV !== 'staging' && p.ENV !== 'production') throw new SisiError_('CONFIG_TIDAK_VALID', 'ENV');
  if (!/^\d{5}$/.test(p.KODE_ULP)) throw new SisiError_('CONFIG_TIDAK_VALID', 'KODE_ULP');
  var iterasi = Number(p.PBKDF2_ITERASI || 5000);
  // Audit 4 Okt 2026: production wajib >= 5000 iterasi (fail closed); staging boleh lebih rendah demi waktu login.
  if (!(iterasi >= 1000) || (p.ENV === 'production' && iterasi < PBKDF2_MIN_PRODUCTION_)) {
    throw new SisiError_('CONFIG_TIDAK_VALID', 'PBKDF2_ITERASI');
  }
  return {
    ENV: p.ENV,
    MASTER_SHEET_ID: p.MASTER_SHEET_ID,
    AUTH_SHEET_ID: p.AUTH_SHEET_ID,
    ROW_SHEET_ID: p.ROW_SHEET_ID || '',
    ROW_FOTO_FOLDER_ID: p.ROW_FOTO_FOLDER_ID || '',
    LAPORAN_SHEET_ID: p.LAPORAN_SHEET_ID || '',
    YANDAL_SHEET_ID: p.YANDAL_SHEET_ID || '',
    YANDAL_FOTO_FOLDER_ID: p.YANDAL_FOTO_FOLDER_ID || '',
    // v0.68.1: sumber migrasi gardu lama (tab Master_Gardu + Rekap Gardu, HANYA DIBACA). Kosong = sama dengan GARDU_SHEET_ID.
    // Dipakai staging: GARDU_SHEET_ID = file staging (Rekap_BA, db_Gardu), GARDU_LAMA_SHEET_ID = file asli.
    GARDU_LAMA_SHEET_ID: p.GARDU_LAMA_SHEET_ID || p.GARDU_SHEET_ID || '',
    GARDU_SHEET_ID: p.GARDU_SHEET_ID || '',
    HARTEK_SHEET_ID: p.HARTEK_SHEET_ID || '',   // v0.87.0: spreadsheet SiSi_Hartek (modul 71_Hartek.js)
    INSJAR_SHEET_ID: p.INSJAR_SHEET_ID || '',   // v1.0.0: spreadsheet SiSi_InsJar (modul 73_InsJar.js)
    TEMUAN_SHEET_ID: p.TEMUAN_SHEET_ID || '',   // v1.0.0: spreadsheet SiSi_Temuan (db_temuan_inspeksi, gabungan semua temuan)
    INSDU_SHEET_ID: p.INSDU_SHEET_ID || '',   // v1.0.8: spreadsheet SiSi_InsDu (modul 74_InsDu.js)
    // v1.0.17: SiSi_JadwalPadam (modul 78_JadwalPadam.js) + sumber lama v1 (Rekap_Jadwal_Padam, HANYA DIBACA saat migrasi)
    JADWAL_PADAM_SHEET_ID: p.JADWAL_PADAM_SHEET_ID || '',
    JADWAL_PADAM_LAMA_SHEET_ID: p.JADWAL_PADAM_LAMA_SHEET_ID || '',
    // v1.0.17: sumber migrasi temuan / InsJar / InsDu v1 (spreadsheet v1 lama, HANYA DIBACA)
    INSPEKSI_LAMA_SHEET_ID: p.INSPEKSI_LAMA_SHEET_ID || '',
    HARTEK_FOTO_FOLDER_ID: p.HARTEK_FOTO_FOLDER_ID || '',   // v1.0.0: folder Drive privat foto grounding / pemerataan
    // v1.0.0: folder Drive privat foto temuan inspeksi. v1.0.34 (permintaan kvlar 25 Okt 2026): nama umum FOTO_TEMUAN_FOLDER_ID
    // (gabungan foto temuan InsJar, InsDu, admin, foto WO); nama lama INSJAR_FOTO_FOLDER_ID masih dibaca sampai diganti.
    FOTO_TEMUAN_FOLDER_ID: p.FOTO_TEMUAN_FOLDER_ID || p.INSJAR_FOTO_FOLDER_ID || '',
    GARDU_FOTO_FOLDER_ID: p.GARDU_FOTO_FOLDER_ID || '',   // v0.70.0: folder Drive privat foto BA gardu   // v0.67.0: spreadsheet Pengukuran Gardu Toboali (tab Rekap_BA, db_Gardu)   // v0.65.0: folder Drive foto P0 (privat)     // v0.63.0: SiSi_Yandal (yan_Shift, yan_Login)   // v0.51: SiSi_Laporan (lap_Harian, lap_C4A), file terpisah dari SiSi_ROW
    KODE_ULP: p.KODE_ULP,
    ADMIN_EMAIL: String(p.ADMIN_EMAIL).trim().toLowerCase(),
    ULP_NAMA: 'Toboali',
    ULP_ALIAS: ['toboali', 'ulp toboali'],
    TOKEN_TTL_HARI: 30,          // token perangkat, diperpanjang tiap cekSesi
    TOKEN_MAKS_HARI: 90,         // v0.48: umur mutlak sejak login, perpanjangan tidak boleh lewat ini (login ulang)
    CACHE_DETIK: 300,            // cache sesi & aturan akses (efek perubahan maks 5 menit)
    LOGIN_MAKS_GAGAL: 5,
    LOGIN_KUNCI_MENIT: 15,
    PBKDF2_ITERASI: iterasi,
    SESI_EPOCH: String(p.SESI_EPOCH || '0'),   // dinaikkan ADMIN_bersihkanCache: semua cache sesi lama diabaikan
    MASTER_REVISI: String(p.MASTER_REVISI || '')   // v1.0.22: diisi ADMIN_lengkapiMaster, HP mengunduh ulang master saat berubah
  };
}
