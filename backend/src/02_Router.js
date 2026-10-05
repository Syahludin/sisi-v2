/**
 * Satu-satunya pintu masuk. Hanya doPost, doGet, rpc yang publik.
 * Semua fungsi lain diakhiri "_" sehingga tidak bisa dipanggil dari luar.
 *
 * publik : tanpa sesi (cuma ping & login)
 * menu   : kode menu di db_Menu yang wajib dimiliki sesi
 * tulis  : butuh aksi UBAH (ADMIN_ES dengan LIHAT otomatis ditolak)
 * platform: menu WEB hanya lewat rpc, menu MOBILE hanya lewat doPost, KEDUANYA dua-duanya (guard_)
 * batasMenit: rem per sesi untuk endpoint berat (baca sheet penuh / Drive). Semua endpoint bersesi juga kena
 *            rem umum GUARD_BATAS_UMUM_ per sesi per menit (v0.42, audit 4 Okt 2026).
 */
var PAYLOAD_MAKS_ = 4 * 1024 * 1024;

function endpoints_() {
  return {
    ping:      { fn: ping_, publik: true },
    login:     { fn: login_, publik: true, tulis: true },
    cekSesi:   { fn: cekSesi_ },
    logout:    { fn: logout_ },
    getMaster: { fn: getMaster_ },
    getKodeRow: { fn: getKodeRow_, menu: 'ROW_EKSEKUSI' },
    syncRow:   { fn: syncRow_, menu: 'ROW_EKSEKUSI', tulis: true, batasMenit: 20 },
    uploadFotoRow: { fn: uploadFotoRow_, menu: 'ROW_EKSEKUSI', tulis: true, batasMenit: 30 },
    getFotoRow: { fn: getFotoRow_, menu: 'ROW_EKSEKUSI', batasMenit: 40 },
    getLaporanRow: { fn: getLaporanRow_, menu: 'ROW_LAPORAN' },
    getArsipRow: { fn: getArsipRow_, menu: 'ROW_LAPORAN', batasMenit: 20 },
    getArsipHariRow: { fn: getArsipHariRow_, menu: 'ROW_LAPORAN', batasMenit: 10 },
    getFotoArsipRow: { fn: getFotoArsipRow_, menu: 'ROW_LAPORAN', batasMenit: 40 },
    // v0.57: Laporan UP3 dan Laporan UIW jadi 2 menu (akses per laporan di db_Akses)
    getLaporanUp3: { fn: getLaporanUp3_, menu: 'OPS_LAP_UP3', batasMenit: 20 },
    simpanLaporanUp3: { fn: simpanLaporanUp3_, menu: 'OPS_LAP_UP3', tulis: true, batasMenit: 10 },
    getLaporanUiw: { fn: getLaporanUiw_, menu: 'OPS_LAP_UIW', batasMenit: 20 },
    simpanLaporanUiw: { fn: simpanLaporanUiw_, menu: 'OPS_LAP_UIW', tulis: true, batasMenit: 10 }
  };
}

function doPost(e) {
  var hasil;
  try {
    var teks = (e && e.postData && e.postData.contents) || '';
    // v0.47: maks 4 MB (foto terbesar 2 MB = ~2,8 MB base64). Dicek sebelum JSON.parse & sebelum sesi.
    if (teks.length > PAYLOAD_MAKS_) throw new SisiError_('PAYLOAD_TERLALU_BESAR');
    var req;
    try { req = JSON.parse(teks || '{}'); } catch (x) { throw new SisiError_('JSON_TIDAK_VALID'); }
    hasil = proses_(req, 'MOBILE');
  } catch (err) {
    hasil = gagal_(err);
  }
  return ContentService.createTextOutput(JSON.stringify(hasil)).setMimeType(ContentService.MimeType.JSON);
}

/** Health check. Tidak pernah membaca token dari query string. */
function doGet() {
  var hasil;
  try { hasil = { ok: true, env: cfg_().ENV, data: { layanan: 'sisi-v2' } }; } catch (err) { hasil = gagal_(err); }
  return ContentService.createTextOutput(JSON.stringify(hasil)).setMimeType(ContentService.MimeType.JSON);
}

/** Untuk halaman web: google.script.run.rpc({action, token, data}). */
function rpc(req) {
  try { return proses_(req || {}, 'WEB'); } catch (err) { return gagal_(err); }
}

function proses_(req, platform) {
  if (!req || typeof req !== 'object' || Array.isArray(req)) throw new SisiError_('REQUEST_TIDAK_VALID');
  var daftar = endpoints_();
  var nama = String(req.action || '');
  if (!Object.prototype.hasOwnProperty.call(daftar, nama)) throw new SisiError_('AKSI_TIDAK_DIKENAL');
  var ep = daftar[nama];
  var sesi = ep.publik ? null : guard_(req.token, ep, platform, nama);
  var data = req.data === undefined || req.data === null ? {} : req.data;
  if (typeof data !== 'object' || Array.isArray(data)) throw new SisiError_('DATA_TIDAK_VALID');
  return { ok: true, env: cfg_().ENV, data: ep.fn(sesi, data, platform) };
}

function gagal_(err) {
  var kode = err && err.kode ? err.kode : 'KESALAHAN_SERVER';
  try {
    console.error(JSON.stringify({ kode: kode, detail: err && (err.detail || err.message), stack: err && err.stack }));
  } catch (x) { /* abaikan */ }
  return { ok: false, kode: kode };
}

function ping_() { return { waktuServer: sekarangIso_() }; }
