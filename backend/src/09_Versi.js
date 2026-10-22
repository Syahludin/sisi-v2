/**
 * v0.81.0 (permintaan kvlar 10 Okt 2026): notifikasi update app. Versi backend DITULIS DI KODE dan WAJIB sama dengan
 * versi app (mobile/pubspec.yaml), dicek test. Deploy backend = server langsung memberi tahu HP lama untuk update.
 *
 * ping -> data.versi = { server, minimum, linkUnduh, catatan }. Semua jawaban proses_ juga membawa `versi` (server),
 * jadi HP yang sedang terbuka tahu kalau backend baru saja di-deploy.
 * HP: app < minimum = WAJIB update (tidak bisa ditutup); minimum <= app < server = update tersedia (boleh Nanti);
 *     app > server = server belum diperbarui (info).
 *
 * Script Properties (opsional):
 *   VERSI_APP_MINIMUM   x.y.z, kosong / tidak valid = versi server (default: app wajib sama dengan backend).
 *                       Lebih besar dari versi server = dipotong ke versi server.
 *   LINK_UPDATE_APP     https://... tempat APK terbaru (mis. folder Drive / App Distribution). Kosong = minta ke admin.
 *   CATATAN_UPDATE_APP  catatan singkat isi pembaruan (maks 300 karakter, satu baris per poin dipisah |).
 *   WAJIB_VERSI_APP     v0.81.1: 'YA' = server MENOLAK panggilan HP (selain ping) dari app di bawah VERSI_APP_MINIMUM,
 *                       termasuk app lama tanpa fitur update (<= 0.80, tidak mengirim versiApp, mis. production v0.50.0):
 *                       kode UPDATE_APLIKASI_DULU. Nyalakan sesudah APK baru dibagikan. Web (rpc) tidak terpengaruh.
 */
var VERSI_BACKEND_ = '1.0.18';

function pecahVersi_(v) {
  var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(v === null || v === undefined ? '' : v).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** -1 / 0 / 1 (a < b, sama, a > b). Tidak valid = null. */
function bandingVersi_(a, b) {
  var x = pecahVersi_(a), y = pecahVersi_(b);
  if (!x || !y) return null;
  for (var i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; }
  return 0;
}

function infoVersi_() {
  var p = PropertiesService.getScriptProperties();
  var min = String(p.getProperty('VERSI_APP_MINIMUM') || '').trim();
  if (!pecahVersi_(min) || bandingVersi_(min, VERSI_BACKEND_) > 0) min = VERSI_BACKEND_;
  var link = String(p.getProperty('LINK_UPDATE_APP') || '').trim();
  if (!/^https:\/\/[^\s]+$/.test(link) || link.length > 500) link = '';
  var catatan = String(p.getProperty('CATATAN_UPDATE_APP') || '').replace(/[\x00-\x1f]+/g, ' ').trim().slice(0, 300);
  return { server: VERSI_BACKEND_, minimum: min, linkUnduh: link, catatan: catatan };
}

/** v0.81.1: HP di bawah versi minimum ditolak kalau WAJIB_VERSI_APP = YA. versiApp kosong = app lama (<= 0.80). */
function cekVersiHp_(req, platform, nama) {
  if (platform !== 'MOBILE' || nama === 'ping') return;
  if (String(PropertiesService.getScriptProperties().getProperty('WAJIB_VERSI_APP') || '').trim().toUpperCase() !== 'YA') return;
  var v = String(req.versiApp || '');
  var b = bandingVersi_(v, infoVersi_().minimum);
  if (b === null || b < 0) throw new SisiError_('UPDATE_APLIKASI_DULU', v || 'tanpa versi');
}
