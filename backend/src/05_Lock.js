/** Jalankan fn dengan ScriptLock. Gagal dapat lock = SERVER_SIBUK (klien retry nanti). */
function denganLock_(fn, tungguMs) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(tungguMs || 20000)) throw new SisiError_('SERVER_SIBUK');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
