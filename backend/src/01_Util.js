/** Error terkontrol. `kode` dikirim ke klien, `detail` hanya masuk log server. */
function SisiError_(kode, detail) {
  this.name = 'SisiError';
  this.kode = kode;
  this.detail = detail === undefined ? '' : String(detail);
  this.message = kode + (this.detail ? ': ' + this.detail : '');
  this.stack = new Error(this.message).stack;
}
SisiError_.prototype = Object.create(Error.prototype);
SisiError_.prototype.constructor = SisiError_;

function ROLE_VALID_() { return ['SUPER', 'ADMIN', 'ADMIN_ES', 'PETUGAS']; }

function uuid_() { return Utilities.getUuid(); }
function sekarangIso_() { return new Date().toISOString(); }

/** Tanggal yyyy-MM-dd di Asia/Jakarta (UTC+7, tanpa DST). */
function tglJakarta_(d) {
  return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Batas offline: 23:59:59 WIB hari berikutnya sejak cek sesi terakhir. */
function offlineSampai_(d) {
  return tglJakarta_(new Date(d.getTime() + 24 * 3600 * 1000)) + 'T23:59:59+07:00';
}

function keDate_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (v === '' || v === null || v === undefined) return null;
  var d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function isAktif_(v) { return v === true || String(v).trim().toUpperCase() === 'TRUE'; }

function pad2_(v) {
  var s = String(v === undefined || v === null ? '' : v).trim();
  return /^\d$/.test(s) ? '0' + s : s;
}
function pad3_(n) { return ('00' + Number(n)).slice(-3); }

function bytesKeHex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function sha256Hex_(teks) {
  return bytesKeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, teks, Utilities.Charset.UTF_8));
}

/** Bandingkan string tanpa bocor info lewat waktu proses. */
function samaAman_(a, b) {
  a = String(a); b = String(b);
  var r = a.length ^ b.length;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}

/** Cegah formula injection: teks diawali = + - @ tab CR dipaksa jadi teks biasa. */
function amanSheet_(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

function ulpCocok_(nilai, alias) {
  alias = alias || cfg_().ULP_ALIAS;
  return alias.indexOf(String(nilai || '').trim().toLowerCase()) !== -1;
}
