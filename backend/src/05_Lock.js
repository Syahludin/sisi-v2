/** Penanda: sedang di dalam ScriptLock pada eksekusi ini (direset tiap eksekusi). */
var LOCK_AKTIF_ = { ya: false };

/** Jalankan fn dengan ScriptLock. Gagal dapat lock = SERVER_SIBUK (klien retry nanti). */
function denganLock_(fn, tungguMs) {
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
