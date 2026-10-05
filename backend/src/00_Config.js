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
    LAPORAN_SHEET_ID: p.LAPORAN_SHEET_ID || '',   // v0.51: SiSi_Laporan (lap_Harian, lap_C4A), file terpisah dari SiSi_ROW
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
    SESI_EPOCH: String(p.SESI_EPOCH || '0')   // dinaikkan ADMIN_bersihkanCache: semua cache sesi lama diabaikan
  };
}
