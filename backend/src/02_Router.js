/**
 * Satu-satunya pintu masuk. Hanya doPost, doGet, rpc yang publik.
 * Semua fungsi lain diakhiri "_" sehingga tidak bisa dipanggil dari luar.
 *
 * publik : tanpa sesi (cuma ping & login)
 * menu   : kode menu di db_Menu yang wajib dimiliki sesi
 * tulis  : butuh aksi UBAH (ADMIN_ES dengan LIHAT otomatis ditolak)
 */
function endpoints_() {
  return {
    ping:      { fn: ping_, publik: true },
    login:     { fn: login_, publik: true, tulis: true },
    cekSesi:   { fn: cekSesi_ },
    logout:    { fn: logout_ },
    getMaster: { fn: getMaster_ },
    syncRow:   { fn: syncRow_, menu: 'ROW_EKSEKUSI', tulis: true }
  };
}

function doPost(e) {
  var hasil;
  try {
    var teks = (e && e.postData && e.postData.contents) || '';
    if (teks.length > 20 * 1024 * 1024) throw new SisiError_('PAYLOAD_TERLALU_BESAR');
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
  var sesi = ep.publik ? null : guard_(req.token, ep);
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
