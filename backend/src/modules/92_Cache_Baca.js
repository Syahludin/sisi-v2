/**
 * v1.0.36 (optimasi kecepatan web admin): jawaban endpoint BACA dari website disimpan di CacheService, jadi pembacaan
 * ulang tidak membuka Sheets (±0,2 dtk, dulu 1-5 dtk). Hanya platform WEB dan endpoint bertanda `cache: true`.
 *   kunci   = revisi data + userId (jawaban bergantung peran / akses, mis. bisaUbah) + action + sha256(data)
 *   revisi  = Script Property CACHE_BACA_REV, naik setiap endpoint TULIS berhasil (kecuali menu petugas yang tidak
 *             mengubah data yang dicache: ROW, Hartek, Inspeksi Jaringan, Laporan UP3 / UIW punya ringkasan sendiri)
 *   umur    = 5 menit: perubahan dari pemicu / editor (tanpa endpoint) paling lambat terlihat 5 menit
 * Jawaban dipecah per 90 KB (batas CacheService 100 KB per kunci), maks 900 KB; lebih besar = tidak dicache.
 * Gagal baca / tulis cache = diabaikan (endpoint tetap jalan normal).
 */
var CACHE_BACA_REV_PROP_ = 'CACHE_BACA_REV';
var CACHE_BACA_DETIK_ = 300;
var CACHE_BACA_POTONG_ = 90000;
var CACHE_BACA_MAKS_ = 10;
// menu tulis yang TIDAK mengubah data endpoint bertanda cache
var CACHE_BACA_BEBAS_ = ['ROW_EKSEKUSI', 'OPS_HARTEK_INPUT', 'OPS_INSJAR_INPUT', 'OPS_LAP_UP3', 'OPS_LAP_UIW', 'OPS_GASPOL_UP3'];   // v1.0.44: kirim GASPOL menulis spreadsheet GASPOL saja

function revCacheBaca_() { return PropertiesService.getScriptProperties().getProperty(CACHE_BACA_REV_PROP_) || '0'; }

/** Revisi baru yang selalu berbeda (dua tulis di milidetik yang sama tetap membuang cache). */
function revBaruCacheBaca_() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/** Sesudah endpoint tulis berhasil: revisi naik = semua jawaban tersimpan kedaluwarsa. */
function catatTulisCacheBaca_(ep) {
  if (!ep || !ep.tulis || CACHE_BACA_BEBAS_.indexOf(ep.menu) !== -1) return;
  try { PropertiesService.getScriptProperties().setProperty(CACHE_BACA_REV_PROP_, revBaruCacheBaca_()); }
  catch (e) { try { console.warn('catatTulisCacheBaca_: ' + e.message); } catch (x) { /* abaikan */ } }
}

/** Editor: buang semua jawaban tersimpan (mis. sesudah mengubah sheet manual). */
function ADMIN_bersihkanCacheBaca() {
  pastikanPemilik_();
  PropertiesService.getScriptProperties().setProperty(CACHE_BACA_REV_PROP_, revBaruCacheBaca_());
  hapusSemuaJawabanGarduMysql_();   // v1.0.38: jawaban jadi gardu di MySQL ikut dibuang
  console.log('Cache baca website dibuang.');
}

/**
 * Jalankan fn() lewat cache. Hasil { isi, dariCache }. Tidak memenuhi syarat = langsung fn().
 */
function denganCacheBaca_(ep, nama, sesi, data, platform, fn) {
  if (!ep || !ep.cache || ep.tulis || platform !== 'WEB' || !sesi) return { isi: fn(), dariCache: false };
  var cache, kunci;
  try {
    cache = CacheService.getScriptCache();
    kunci = 'cb:' + revCacheBaca_() + ':' + String(sesi.userId || '').slice(0, 40) + ':' + nama + ':' + sha256Hex_(JSON.stringify(data)).slice(0, 24);
    var kepala = cache.get(kunci);
    if (kepala) {
      var n = Number(kepala);
      var bagian = [];
      for (var i = 0; i < n; i++) bagian.push(kunci + ':' + i);
      var semua = cache.getAll ? cache.getAll(bagian) : null;
      var teks = '';
      for (var j = 0; j < n; j++) {
        var b = semua ? semua[bagian[j]] : cache.get(bagian[j]);
        if (b === null || b === undefined) { teks = null; break; }
        teks += b;
      }
      if (teks !== null) return { isi: JSON.parse(teks), dariCache: true };
    }
  } catch (e) { cache = null; }
  var isi = fn();
  if (cache) {
    try {
      var t = JSON.stringify(isi);
      var m = Math.ceil(t.length / CACHE_BACA_POTONG_);
      if (m > 0 && m <= CACHE_BACA_MAKS_) {
        var o = {};
        for (var k = 0; k < m; k++) o[kunci + ':' + k] = t.slice(k * CACHE_BACA_POTONG_, (k + 1) * CACHE_BACA_POTONG_);
        cache.putAll(o, CACHE_BACA_DETIK_);
        cache.put(kunci, String(m), CACHE_BACA_DETIK_);   // kepala terakhir: bagian sudah lengkap saat kepala terbaca
      }
    } catch (e2) { /* jawaban terlalu besar / cache penuh: abaikan */ }
  }
  return { isi: isi, dariCache: false };
}
