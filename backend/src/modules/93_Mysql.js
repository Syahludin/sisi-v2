/**
 * v1.0.38 (keputusan Master Guswan 27 Okt 2026): salinan BACA MySQL di Hostinger untuk website admin (docs/rancangan-hybrid-mysql.md).
 * Google Sheet tetap sumber utama; sinkron satu arah Sheet -> MySQL lewat API PHP (hosting/sisi-api). Modul pertama:
 * History Gangguan (tab ggn_*).
 *   - Sinkron: sesudah sinkronGgn_ (pemicu 18.00 / Perbarui dari sumber), jenis yang sidiknya belum terkirim dikirim
 *     utuh ke sinkron.php (satu POST bertanda HMAC, pola mesin PDF). Gagal = dicatat, Sheet tetap benar, dikirim ulang
 *     di sinkron berikutnya (sidik terkirim disimpan di MYSQL_TERKIRIM).
 *   - Tiket web: getTiketApi (website, tiap ~15 menit) = { u, m: menu WEB yang boleh, env, exp } bertanda HMAC. API PHP
 *     memeriksa tanda + exp + menu tanpa membaca sesi SiSi.
 * Script Properties: MYSQL_API_URL (https://<domain>/sisi-api[-staging]), MYSQL_API_SECRET (>= 32 karakter, sama dengan
 * config PHP; beda production / staging). Kosong = fitur mati (website membaca dari Apps Script seperti biasa).
 */
var MYSQL_TIKET_DETIK_ = 15 * 60;
var MYSQL_TERKIRIM_PROP_ = 'MYSQL_TERKIRIM';
var MYSQL_KOLOM_WAKTU_GGN_ = { penyulang: 'waktu_padam', ar: 'waktu_ar', pickup: 'waktu_event' };

/** { url, rahasia } atau null (belum diatur). Diatur tapi salah = CONFIG_TIDAK_VALID. */
function konfigMysql_() {
  var p = PropertiesService.getScriptProperties();
  var url = String(p.getProperty('MYSQL_API_URL') || '').trim().replace(/\/+$/, '');
  var rahasia = String(p.getProperty('MYSQL_API_SECRET') || '');
  if (!url && !rahasia) return null;
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._-]+)*$/i.test(url)) throw new SisiError_('CONFIG_TIDAK_VALID', 'MYSQL_API_URL');
  if (rahasia.length < 32) throw new SisiError_('CONFIG_TIDAK_VALID', 'MYSQL_API_SECRET < 32 karakter');
  return { url: url, rahasia: rahasia };
}

function base64UrlMysql_(s) {
  return Utilities.base64Encode(Utilities.newBlob(s).getBytes()).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Tiket = base64url(json ASCII) + '.' + hex HMAC-SHA256(rahasia, 'tiket.' + bagian pertama). Murni selain waktu. */
function buatTiketMysql_(rahasia, isi) {
  var p = base64UrlMysql_(jsonAscii_(isi));
  return p + '.' + bytesKeHex_(Utilities.computeHmacSha256Signature('tiket.' + p, rahasia, Utilities.Charset.UTF_8));
}

/** Tiket hanya untuk website (platform WEB) akun Admin / Admin ES / Super (ROLE_WEB_), dicek paling awal. */
function wajibWebTiket_(sesi, platform) {
  if (platform !== 'WEB' || !sesi || ROLE_WEB_().indexOf(sesi.role) === -1) throw new SisiError_('AKSES_DITOLAK', 'tiket API khusus website admin');
}

/** getTiketApi {} -> { tiket, sampai } untuk website (platform WEB, admin). API PHP belum diatur = CONFIG_TIDAK_LENGKAP. */
function getTiketApi_(sesi, data, platform) {
  wajibWebTiket_(sesi, platform);
  validasi_(data, {});
  var konf = konfigMysql_();
  if (!konf) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'MYSQL_API_URL');
  return tiketWebMysql_(konf, sesi, menuUntuk_(sesi, 'WEB'));
}

function tiketWebMysql_(konf, sesi, menu) {
  var exp = Math.floor(Date.now() / 1000) + MYSQL_TIKET_DETIK_;
  return {
    tiket: buatTiketMysql_(konf.rahasia, { u: String(sesi.userId), m: menu.map(function (m) { return m.kode; }), env: cfg_().ENV, exp: exp }),
    sampai: new Date(exp * 1000).toISOString()
  };
}

/**
 * v1.0.38: tiket ikut jawaban cekSesi website (dipanggil saat website dibuka), jadi baca MySQL pertama tidak menunggu
 * getTiketApi. menu = menu WEB yang sudah dihitung cekSesi. Belum diatur / galat = tanpa tiket (website memintanya nanti).
 */
function tiketCekSesiMysql_(sesi, platform, menu) {
  if (platform !== 'WEB' || !sesi || ROLE_WEB_().indexOf(sesi.role) === -1) return null;
  try { var konf = konfigMysql_(); return konf ? tiketWebMysql_(konf, sesi, menu) : null; } catch (e) { return null; }
}

/** Baris tab ggn_ satu jenis -> baris MySQL { penyulang, tgl, isi } (isi = bentuk jawaban getHistoriGangguan). */
function barisMysqlGgn_(jenis) {
  var tab = GGN_TAB_[jenis], kunci = MYSQL_KOLOM_WAKTU_GGN_[jenis];
  return tabel_('GANGGUAN_SHEET_ID', tab.sheet).rows.map(function (o) {
    var w = o[kunci] instanceof Date ? tglJakarta_(o[kunci]) : String(o[kunci] || ''), d = w.slice(0, 10);
    return { penyulang: String(o.penyulang || ''), tgl: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '', isi: keluarGgn_(o, tab.header) };
  });
}

function bacaTerkirimMysql_() {
  try { var v = JSON.parse(PropertiesService.getScriptProperties().getProperty(MYSQL_TERKIRIM_PROP_) || '{}'); return v && typeof v === 'object' ? v : {}; }
  catch (e) { return {}; }
}

/** POST bertanda ke API PHP. Hasil data jawaban; galat = SisiError_ MYSQL_GAGAL (detail kode HTTP / kode API). */
function kirimMysql_(konf, jalur, isi) {
  var body = jsonAscii_(isi), waktu = String(Math.floor(Date.now() / 1000));
  var res = ambilUrl_(konf.url + jalur, {
    method: 'post', contentType: 'application/json', payload: body, muteHttpExceptions: true, followRedirects: false,
    headers: { 'X-SiSi-Waktu': waktu, 'X-SiSi-Tanda': tandaPdf_(konf.rahasia, waktu, body) }
  }, 'mysql');
  var kode = res.getResponseCode(), j = null;
  try { j = JSON.parse(res.getContentText() || '{}'); } catch (e) { j = null; }
  if (kode !== 200 || !j || j.ok !== true) throw new SisiError_('MYSQL_GAGAL', kode + ' ' + ((j && j.kode) || ''));
  return j.data;
}

/**
 * Kirim History Gangguan ke MySQL: jenis yang sidiknya belum terkirim (paksa = semua) + info sinkron (selalu, supaya
 * "Diperbarui ..." di website ikut). Hasil { dikirim: [jenis], data } atau null (fitur mati / belum ada info sinkron).
 */
function sinkronMysqlGgn_(info, paksa) {
  var konf = konfigMysql_();
  if (!konf || !info) return null;
  var terkirim = bacaTerkirimMysql_(), sidik = info.sidik || {}, jenis = {}, dikirim = [];
  GGN_JENIS_.forEach(function (j) {
    if (!paksa && sidik[j] && terkirim[j] === sidik[j]) return;
    jenis[j] = barisMysqlGgn_(j);
    dikirim.push(j);
  });
  var data = kirimMysql_(konf, '/sinkron.php', { modul: 'ggn', sinkron: infoPublikGgn_(info), jenis: jenis });
  dikirim.forEach(function (j) { terkirim[j] = sidik[j] || ''; });
  PropertiesService.getScriptProperties().setProperty(MYSQL_TERKIRIM_PROP_, JSON.stringify(terkirim));
  return { dikirim: dikirim, data: data };
}

/** Dipanggil sesudah sinkronGgn_: gagal tidak menggagalkan sinkron Sheet (dikirim ulang di sinkron berikutnya). */
function sinkronMysqlGgnAman_(info) {
  try { return sinkronMysqlGgn_(info, false); } catch (e) {
    console.error('Sinkron MySQL History Gangguan gagal: ' + (e.kode || '') + ' ' + String(e.detail || e.message || e).slice(0, 120));
    return null;
  }
}

/** Editor: kirim ulang SEMUA History Gangguan ke MySQL (sinkron pertama / sesudah tabel dikosongkan). */
function ADMIN_sinkronMysql() {
  pastikanPemilik_();
  if (!konfigMysql_()) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'MYSQL_API_URL / MYSQL_API_SECRET');
  var info = bacaInfoSinkronGgn_();
  if (!info) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'History Gangguan belum pernah disinkron (ADMIN_siapkanSheetGangguan)');
  var h = sinkronMysqlGgn_(info, true);
  console.log('MySQL History Gangguan terkirim: ' + h.dikirim.join(', ') + ' -> ' + JSON.stringify(h.data));
}

/** Editor: cek API PHP (status.php) tanpa data. */
function ADMIN_cekMysqlApi() {
  pastikanPemilik_();
  var konf = konfigMysql_();
  if (!konf) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'MYSQL_API_URL / MYSQL_API_SECRET');
  var res = ambilUrl_(konf.url + '/status.php', { method: 'get', muteHttpExceptions: true, followRedirects: false }, 'mysql');
  console.log('API MySQL: HTTP ' + res.getResponseCode() + ' ' + String(res.getContentText() || '').slice(0, 300));
}
