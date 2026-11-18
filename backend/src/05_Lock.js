/** Penanda: sedang di dalam ScriptLock pada eksekusi ini (direset tiap eksekusi). */
var LOCK_AKTIF_ = { ya: false };

/** Jalankan fn dengan ScriptLock. Gagal dapat lock = SERVER_SIBUK (klien retry nanti). */
function denganLock_(fn, tungguMs) {
  if (LOCK_AKTIF_.ya) return fn(); // v1.0.71: sinkronTiang memanggil fungsi simpan yang juga mengunci; lock yang sama dipakai bersama
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(tungguMs || 20000)) throw new SisiError_('SERVER_SIBUK');
  LOCK_AKTIF_.ya = true;
  try {
    return fn();
  } finally {
    LOCK_AKTIF_.ya = false;
    lock.releaseLock();
  }
}

/**
 * Giliran eksklusif untuk kerja LAMA (review 15 Nov 2026): menulis file / sheet eksternal bisa puluhan detik sampai menit, jadi tidak
 * boleh memegang ScriptLock (semua simpan di semua modul akan tertahan). Penanda waktu di Script Property [nama], diambil dan dilepas
 * dalam lock singkat. Sedang dipakai = SERVER_SIBUK (detail = nama). Basi [basiMs] (> lama eksekusi terpanjang) supaya eksekusi
 * yang mati di tengah tidak mengunci selamanya.
 */
function denganGiliran_(nama, basiMs, fn) {
  var p = PropertiesService.getScriptProperties();
  var dapat = denganLock_(function () {
    var t = Number(p.getProperty(nama)) || 0;
    if (t && Date.now() - t < basiMs) return false;
    p.setProperty(nama, String(Date.now()));
    return true;
  }, 10000);
  if (!dapat) throw new SisiError_('SERVER_SIBUK', nama);
  try {
    return fn();
  } finally {
    p.deleteProperty(nama);
  }
}
