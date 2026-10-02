/**
 * SiSi v2 - Konfigurasi.
 *
 * Semua nilai per environment dibaca dari Script Properties
 * (Project Settings > Script Properties). Tidak ada ID yang ditulis di kode.
 *
 * ATURAN v2: tidak ada kode top-level yang bergantung pada file lain.
 * Semua dibangun di dalam fungsi, jadi urutan load file tidak berpengaruh.
 */
var CFG_WAJIB_ = ['ENV', 'MASTER_SHEET_ID', 'AUTH_SHEET_ID', 'KODE_ULP', 'ADMIN_EMAIL'];

function cfg_() {
  var p = PropertiesService.getScriptProperties().getProperties();
  CFG_WAJIB_.forEach(function (k) {
    if (!p[k]) throw new SisiError_('CONFIG_TIDAK_LENGKAP', k);
  });
  if (p.ENV !== 'staging' && p.ENV !== 'production') throw new SisiError_('CONFIG_TIDAK_VALID', 'ENV');
  if (!/^\d{5}$/.test(p.KODE_ULP)) throw new SisiError_('CONFIG_TIDAK_VALID', 'KODE_ULP');
  return {
    ENV: p.ENV,
    MASTER_SHEET_ID: p.MASTER_SHEET_ID,
    AUTH_SHEET_ID: p.AUTH_SHEET_ID,
    ROW_SHEET_ID: p.ROW_SHEET_ID || '',
    ROW_FOTO_FOLDER_ID: p.ROW_FOTO_FOLDER_ID || '',
    KODE_ULP: p.KODE_ULP,
    ADMIN_EMAIL: String(p.ADMIN_EMAIL).trim().toLowerCase(),
    ULP_NAMA: 'Toboali',
    ULP_ALIAS: ['toboali', 'ulp toboali'],
    TOKEN_TTL_HARI: 30,          // token perangkat, diperpanjang tiap cekSesi
    CACHE_DETIK: 300,            // cache sesi & aturan akses (efek perubahan maks 5 menit)
    LOGIN_MAKS_GAGAL: 5,
    LOGIN_KUNCI_MENIT: 15,
    PBKDF2_ITERASI: Number(p.PBKDF2_ITERASI || 5000)
  };
}
