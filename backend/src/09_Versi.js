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
 *   APK_FOLDER_ID       v1.0.19: folder Drive berisi APK (nama memuat versi, mis. SiSi-STG-1.0.19.apk). HP yang login
 *                       memanggil getUpdateApp lalu mengunduh + memasang APK langsung dari app (tanpa unduh terpisah).
 */
var VERSI_BACKEND_ = '1.0.22';

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
  if (platform !== 'MOBILE' || nama === 'ping' || nama === 'getUpdateApp') return;   // v1.0.19: unduh update tetap boleh
  if (String(PropertiesService.getScriptProperties().getProperty('WAJIB_VERSI_APP') || '').trim().toUpperCase() !== 'YA') return;
  var v = String(req.versiApp || '');
  var b = bandingVersi_(v, infoVersi_().minimum);
  if (b === null || b < 0) throw new SisiError_('UPDATE_APLIKASI_DULU', v || 'tanpa versi');
}

/* ===== v1.0.19: update APK dari folder Drive ===== */

var APK_CACHE_ = 'apk:terbaru:v1';

/** Versi x.y.z dari nama file APK (mis. 'SiSi-STG-1.0.19+193.apk' -> '1.0.19'). null = bukan APK berversi. */
function versiNamaApk_(nama) {
  var n = String(nama || '');
  if (!/\.apk$/i.test(n)) return null;
  var m = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})/.exec(n);
  return m ? m[1] + '.' + m[2] + '.' + m[3] : null;
}

/**
 * APK versi tertinggi di APK_FOLDER_ID (cache 10 menit): {versi, nama, fileId, ukuranByte, sha256, url}. File dibuka untuk
 * "siapa saja yang punya link" (hanya baca) supaya HP bisa mengunduh langsung (APK terlalu besar untuk lewat Apps Script).
 * Folder kosong / tidak diatur = null.
 */
function apkTerbaru_() {
  var cache = CacheService.getScriptCache();
  var c = cache.get(APK_CACHE_);
  if (c) return JSON.parse(c);
  var id = String(PropertiesService.getScriptProperties().getProperty('APK_FOLDER_ID') || '').trim();
  if (!id) return null;
  var it = DriveApp.getFolderById(id).getFiles(), pilih = null;
  while (it.hasNext()) {
    var f = it.next(), v = versiNamaApk_(f.getName());
    if (!v || (typeof f.isTrashed === 'function' && f.isTrashed())) continue;
    if (!pilih || bandingVersi_(v, pilih.versi) > 0) pilih = { versi: v, file: f };
  }
  if (!pilih) return null;
  var f2 = pilih.file, fid = String(f2.getId());
  try { f2.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (eS) { /* sudah publik / shared drive: dicoba unduh apa adanya */ }
  var meta = {};
  try { meta = Drive.Files.get(fid, { fields: 'size,sha256Checksum', supportsAllDrives: true }) || {}; } catch (eM) { meta = {}; }
  var hasil = { versi: pilih.versi, nama: String(f2.getName()), fileId: fid, ukuranByte: Number(meta.size || f2.getSize()) || 0,
                sha256: String(meta.sha256Checksum || '').toLowerCase(),
                url: 'https://drive.usercontent.google.com/download?id=' + fid + '&export=download&confirm=t' };
  cache.put(APK_CACHE_, JSON.stringify(hasil), 600);
  return hasil;
}

/** getUpdateApp {versiApp} -> {tersedia, apk?}. Hanya APK yang lebih baru dari app pemanggil. */
function wajibSesiUpdate_(sesi) {
  if (!sesi || ROLE_VALID_().indexOf(sesi.role) === -1) throw new SisiError_('AKSES_DITOLAK', 'update');
}

function getUpdateApp_(sesi, data) {
  wajibSesiUpdate_(sesi);
  var versiApp = validasi_(data, { versiApp: { tipe: 'teks', maks: 20 } }).versiApp;
  var apk = apkTerbaru_();
  if (!apk) return { tersedia: false };
  var lebihBaru = !pecahVersi_(versiApp) || bandingVersi_(apk.versi, versiApp) > 0;
  return lebihBaru ? { tersedia: true, apk: apk } : { tersedia: false, versi: apk.versi };
}
