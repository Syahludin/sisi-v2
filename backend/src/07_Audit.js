/** Catat aksi penting ke SiSi_Auth > log_Audit (tidak disinkron ke HP). */
/** tLog opsional: hasil headerTabel_ yang sudah dibaca lebih dulu (agar tidak ada baca setelah tulis). */
function auditLog_(siapa, aksi, target, detail, platform, tLog) {
  var t = tLog || headerTabel_('AUTH_SHEET_ID', 'log_Audit');   // header saja, bukan seluruh log
  tambahBaris_(t, {
    waktu: sekarangIso_(),
    user_id: siapa ? siapa.userId || '' : '',
    username: siapa ? siapa.username || '' : '',
    role: siapa ? siapa.role || '' : '',
    aksi: aksi,
    target: target || '',
    detail: detail ? String(detail).slice(0, 500) : '',
    platform: platform || '',
    device_id: siapa ? siapa.deviceId || '' : ''
  });
}
