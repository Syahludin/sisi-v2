/**
 * v0.83.0 (keputusan kvlar 10 Okt 2026): notifikasi push (FCM) pengingat login Yandal.
 *
 *  - HP mendaftarkan token FCM lewat endpoint daftarNotif (akun YANDAL + ADMIN / SUPER, dari HP). Satu baris auth_Notif
 *    per instalasi app (install_id dari auth_Perangkat sesi, bukan dari HP). Ganti akun di HP yang sama = baris pindah akun.
 *  - Pemicu tiap 5 menit (ADMIN_pengingatYandal): untuk SETIAP tim YANDAL aktif yang punya akun, kalau shift sekarang belum
 *    dimulai (belum ada yan_Shift tim itu) maka:
 *      menit ke 0 dan 30 sesudah shift mulai (PENGINGAT_YANDAL_MENIT)  -> pengingat ke HP TERAKHIR yang login di akun tim
 *                                                                       (auth_Perangkat terbaru yang terdaftar notifikasi)
 *      menit ke 60 (PENGINGAT_ADMIN_MENIT)                             -> satu notifikasi ke semua HP admin: daftar tim
 *  - Satu tim satu HP (keputusan kvlar): pengingat tidak dikirim ke HP lain akun itu.
 *  - Riwayat kirim di yan_Pengingat (juga mencegah kirim dobel). Tim yang sudah login tidak diingatkan lagi.
 *
 * Kunci service account Firebase di Script Property FCM_SERVICE_ACCOUNT (JSON utuh, tidak pernah dicetak).
 */
var AUTH_NOTIF_HEADER_ = ['install_id', 'user_id', 'fcm_token', 'platform', 'didaftar_pada', 'diperbarui_pada', 'aktif',
                          'terakhir_kirim', 'pesan'];
var YAN_PENGINGAT_HEADER_ = ['No', 'Waktu', 'Tanggal', 'Shift', 'Tim', 'Jenis', 'Menit', 'Tujuan', 'Hasil', 'tim_id', 'user_id',
                             'install_id'];
var PENGINGAT_MENIT_YANDAL_ = [0, 30];
var PENGINGAT_MENIT_ADMIN_ = 60;
var PENGINGAT_GAGAL_MAKS_ = 3;          // kiriman GAGAL berturut-turut per tim per tahap sebelum berhenti mencoba
var PENGINGAT_RIWAYAT_BARIS_ = 400;     // baris terakhir yan_Pengingat yang dibaca untuk cegah dobel
var NOTIF_SEGAR_MS_ = 24 * 3600e3;      // daftar ulang token yang sama = tulis lagi paling cepat sehari sekali
var FCM_SCOPE_ = 'https://www.googleapis.com/auth/firebase.messaging';
var FCM_TOKEN_URL_ = 'https://oauth2.googleapis.com/token';

/** Akun yang menerima notifikasi: tim YANDAL (pengingat login) dan ADMIN / SUPER (peringatan belum login). */
function penerimaNotif_(sesi) { return petugasYandal_(sesi) || sesi.role === 'ADMIN' || sesi.role === 'SUPER'; }

function tabelNotif_() { return cekHeaderSkema_(tabel_('AUTH_SHEET_ID', 'auth_Notif'), 'AUTH_SHEET_ID', 'auth_Notif'); }

// ---------------- endpoint ----------------

function daftarNotif_(sesi, data, platform) {
  if (platform !== 'MOBILE') throw new SisiError_('AKSES_DITOLAK', 'notifikasi hanya dari HP');
  if (!penerimaNotif_(sesi)) throw new SisiError_('AKSES_DITOLAK', 'notifikasi hanya akun YANDAL / admin');
  var d = validasi_(data, { fcmToken: { tipe: 'teks', wajib: true, maks: 4096, pola: /^[A-Za-z0-9:_.-]{20,4096}$/ } });
  var logT = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
  return denganLock_(function () {
    var p = tabel_('AUTH_SHEET_ID', 'auth_Perangkat').rows.filter(function (r) { return String(r.device_id) === String(sesi.deviceId); })[0];
    var installId = p ? teksSel_(p.install_id) : '';
    if (!installId) throw new SisiError_('PERANGKAT_TANPA_INSTALL_ID');
    var t = tabelNotif_(), iso = sekarangIso_(), ubah = [], baru = [];
    var milik = t.rows.filter(function (r) { return teksSel_(r.install_id) === installId; });
    // token pindah ke instalasi lain (jarang) = baris lama dimatikan; baris ganda instalasi ini = sisanya dimatikan
    t.rows.forEach(function (r) {
      var lain = teksSel_(r.install_id) !== installId && teksSel_(r.fcm_token) === d.fcmToken;
      var ganda = milik.length > 1 && r !== milik[0] && teksSel_(r.install_id) === installId;
      if ((lain || ganda) && isAktif_(r.aktif)) ubah.push({ r: r, u: { aktif: false, pesan: lain ? 'TOKEN_PINDAH' : 'GANDA', diperbarui_pada: iso } });
    });
    var r = milik[0], aksi = null;
    if (!r) {
      baru.push({ install_id: installId, user_id: sesi.userId, fcm_token: d.fcmToken, platform: platform, didaftar_pada: iso,
                  diperbarui_pada: iso, aktif: true, terakhir_kirim: '', pesan: '' });
      aksi = 'DAFTAR_NOTIF';
    } else {
      var sama = String(r.user_id) === String(sesi.userId) && teksSel_(r.fcm_token) === d.fcmToken && isAktif_(r.aktif);
      var segar = (msWaktu_(r.diperbarui_pada) || 0) > Date.now() - NOTIF_SEGAR_MS_;
      if (!sama || !segar) {
        ubah.push({ r: r, u: { user_id: sesi.userId, fcm_token: d.fcmToken, platform: platform, diperbarui_pada: iso, aktif: true, pesan: '' } });
        if (!sama) aksi = String(r.user_id) === String(sesi.userId) ? 'GANTI_TOKEN_NOTIF' : 'PINDAH_AKUN_NOTIF';
      }
    }
    tulisBlok_(t, ubah, baru, { bolehId: ['user_id'] });
    if (aksi) auditLog_(sesi, aksi, installId, '', platform, logT);
    return { terdaftar: true };
  });
}

// ---------------- FCM ----------------

/** Service account dari JSON (client_email, private_key, project_id). Kosong / rusak = null. */
function akunDariJson_(raw) {
  raw = teksSel_(raw);
  if (!raw) return null;
  try {
    var a = JSON.parse(raw);
    if (!a || !a.client_email || !a.private_key || !a.project_id) return null;
    return { email: String(a.client_email), kunci: String(a.private_key), proyek: String(a.project_id) };
  } catch (e) { return null; }
}

/** Service account FCM (Script Property FCM_SERVICE_ACCOUNT). */
function akunFcm_() { return akunDariJson_(PropertiesService.getScriptProperties().getProperty('FCM_SERVICE_ACCOUNT')); }

function b64UrlFcm_(v) { return Utilities.base64EncodeWebSafe(v).replace(/=+$/, ''); }

/** Access token OAuth service account (JWT) untuk satu scope, di-cache sampai 5 menit sebelum habis. */
function aksesGoogle_(akun, scope, baru) {
  var cache = CacheService.getScriptCache(), kunci = 'g-akses:' + sha256Hex_(akun.email + '|' + scope).slice(0, 20);
  if (!baru) { var ada = cache.get(kunci); if (ada) return ada; }
  var iat = Math.floor(Date.now() / 1000);
  var kepala = b64UrlFcm_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var klaim = b64UrlFcm_(JSON.stringify({ iss: akun.email, scope: scope, aud: FCM_TOKEN_URL_, iat: iat, exp: iat + 3600 }));
  var tanda = b64UrlFcm_(Utilities.computeRsaSha256Signature(kepala + '.' + klaim, akun.kunci));
  var res = ambilUrl_(FCM_TOKEN_URL_, {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: kepala + '.' + klaim + '.' + tanda }
  }, 'lain');
  var j = {};
  try { j = JSON.parse(res.getContentText() || '{}'); } catch (e) { j = {}; }
  if (res.getResponseCode() !== 200 || !j.access_token) throw new SisiError_('GOOGLE_AUTH_GAGAL', String(res.getResponseCode()) + ' ' + String(j.error || ''));
  cache.put(kunci, String(j.access_token), Math.max(60, Math.min(21600, (Number(j.expires_in) || 3600) - 300)));
  return String(j.access_token);
}

function aksesFcm_(akun, baru) { return aksesGoogle_(akun, FCM_SCOPE_, baru); }

/**
 * Kirim banyak pesan sekaligus (fetchAll). daftar = [{ token, judul, isi, data, ttlDetik }].
 * Hasil (urutan sama): [{ ok, tidakTerdaftar, pesan }]. Token tidak terdaftar (app di-uninstall) = tidakTerdaftar.
 */
function kirimFcm_(akun, daftar) {
  if (!daftar.length) return [];
  var url = 'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(akun.proyek) + '/messages:send';
  var minta = function (akses) {
    return daftar.map(function (m) {
      var data = {};
      Object.keys(m.data || {}).forEach(function (k) { data[k] = String(m.data[k]); });
      return {
        url: url, method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + akses },
        payload: JSON.stringify({ message: {
          token: m.token, notification: { title: m.judul, body: m.isi }, data: data,
          android: { priority: 'HIGH', ttl: (m.ttlDetik || 1800) + 's', notification: { default_sound: true, notification_priority: 'PRIORITY_HIGH' } }
        } })
      };
    });
  };
  var res = ambilUrlSemua_(minta(aksesFcm_(akun, false)), 'fcm');
  if (res.some(function (x) { return x.getResponseCode() === 401; })) res = ambilUrlSemua_(minta(aksesFcm_(akun, true)), 'fcm');   // token akses basi
  return res.map(function (x) {
    var kode = x.getResponseCode(), teks = String(x.getContentText() || '');
    if (kode === 200) return { ok: true, tidakTerdaftar: false, pesan: '' };
    var tidak = kode === 404 || /UNREGISTERED|registration token|not a valid FCM/i.test(teks);
    var m = /"status"\s*:\s*"([A-Z_]+)"/.exec(teks);
    return { ok: false, tidakTerdaftar: tidak, pesan: 'HTTP ' + kode + (m ? ' ' + m[1] : '') };
  });
}

// ---------------- rencana pengingat (murni, dites di Node) ----------------

/** Menit tahap dari Script Property ("0,30"), 0..420, urut naik. Kosong / rusak = default. */
function menitPengingat_(teks, bawaan) {
  var l = String(teks === null || teks === undefined ? '' : teks).split(',').map(function (x) { return x.trim(); })
    .filter(function (x) { return /^\d{1,3}$/.test(x) && Number(x) <= 420; }).map(Number);
  return l.length ? l.sort(function (a, b) { return a - b; }).filter(function (v, i, a) { return a.indexOf(v) === i; }) : bawaan.slice();
}

/** HP terakhir yang login di akun-akun tim (auth_Perangkat terbaru) yang terdaftar notifikasi untuk akun itu. */
function hpTerakhirTim_(userIds, perangkat, notifAktif) {
  var milik = perangkat.filter(function (p) { return userIds.indexOf(String(p.user_id)) !== -1 && teksSel_(p.install_id); })
    .sort(function (a, b) { return (msWaktu_(b.dibuat_pada) || 0) - (msWaktu_(a.dibuat_pada) || 0); });
  for (var i = 0; i < milik.length; i++) {
    var n = notifAktif[teksSel_(milik[i].install_id)];
    if (n && String(n.user_id) === String(milik[i].user_id)) {
      return { userId: String(n.user_id), installId: teksSel_(n.install_id), token: teksSel_(n.fcm_token),
               loginTerakhir: msWaktu_(milik[i].dibuat_pada) || null, terakhir: i === 0 };
    }
  }
  return null;
}

/**
 * o = { sekarangMs, tim, users, shiftRows, perangkat, notif, riwayat, menitYandal: [0, 30], menitAdmin: 60 }.
 * Hasil { sh, menit, yandal: [{ tim, menit, hp }], admin: [{ tim, hp }], penerimaAdmin: [{ userId, installId, token }] }.
 */
function rencanaPengingat_(o) {
  var sh = shiftYandal_(o.sekarangMs);
  var hasil = { sh: sh, menit: Math.floor((o.sekarangMs - sh.mulai) / 60e3), yandal: [], admin: [], penerimaAdmin: [] };
  if (sh.peralihan) return hasil;
  var menit = hasil.menit;
  var sudah = {}, gagal = {};
  (o.riwayat || []).forEach(function (r) {
    if (tglSel_(r.Tanggal) !== sh.tanggal || Number(r.Shift) !== sh.no) return;
    var k = String(r.tim_id) + '|' + String(r.Jenis), m = Number(r.Menit) || 0;
    if (/^GAGAL/.test(String(r.Hasil))) { gagal[k + '|' + m] = (gagal[k + '|' + m] || 0) + 1; if (gagal[k + '|' + m] < PENGINGAT_GAGAL_MAKS_) return; }
    sudah[k] = Math.max(sudah[k] === undefined ? -1 : sudah[k], m);
  });
  var notifAktif = {};
  (o.notif || []).forEach(function (n) { if (isAktif_(n.aktif) && teksSel_(n.fcm_token)) notifAktif[teksSel_(n.install_id)] = n; });
  var akunTim = {}, peran = {};
  (o.users || []).forEach(function (u) {
    if (!u.user_id || !isAktif_(u.aktif)) return;
    peran[String(u.user_id)] = String(u.role || '').trim();
    if (String(u.role).trim() === 'PETUGAS' && u.tim_id) (akunTim[String(u.tim_id)] = akunTim[String(u.tim_id)] || []).push(String(u.user_id));
  });
  var tahapYandal = (o.menitYandal || PENGINGAT_MENIT_YANDAL_).filter(function (m) { return m <= menit; });
  var tahap = tahapYandal.length ? tahapYandal[tahapYandal.length - 1] : null;
  var menitAdmin = o.menitAdmin === undefined ? PENGINGAT_MENIT_ADMIN_ : o.menitAdmin;
  timYandal_(o.tim || []).forEach(function (t) {
    var id = String(t.tim_id), akun = akunTim[id] || [];
    if (!akun.length) return;   // tim tanpa akun login = tidak diharapkan login
    var masuk;
    try { masuk = !!shiftAktif_(o.shiftRows || [], id, sh); } catch (e) { masuk = true; }   // DATA_GANDA = sudah ada shift
    if (masuk) return;
    var hp = hpTerakhirTim_(akun, o.perangkat || [], notifAktif);
    var info = { timId: id, nama: teksSel_(t.nama), userId: akun[0] };
    var kY = id + '|YANDAL';
    if (tahap !== null && !(sudah[kY] >= tahap)) hasil.yandal.push({ tim: info, menit: tahap, hp: hp });
    if (menit >= menitAdmin && sudah[id + '|ADMIN'] === undefined) hasil.admin.push({ tim: info, hp: hp });
  });
  if (hasil.admin.length) {
    var lihat = {};
    Object.keys(notifAktif).forEach(function (ins) {
      var n = notifAktif[ins], r = peran[String(n.user_id)];
      if ((r === 'ADMIN' || r === 'SUPER') && !lihat[teksSel_(n.fcm_token)]) {
        lihat[teksSel_(n.fcm_token)] = true;
        hasil.penerimaAdmin.push({ userId: String(n.user_id), installId: ins, token: teksSel_(n.fcm_token) });
      }
    });
  }
  return hasil;
}

/** Isi pesan (murni). */
function pesanPengingatYandal_(tim, sh, menit) {
  var tgl = Number(sh.tanggal.slice(8, 10)) + ' ' + BULAN_ID_[Number(sh.tanggal.slice(5, 7)) - 1].slice(0, 3);
  return {
    judul: 'Pengingat Login ' + tim.nama,
    isi: menit > 0
      ? 'Shift ' + sh.no + ' (' + sh.jam + ', ' + tgl + ') sudah berjalan ' + menit + ' menit dan ' + tim.nama + ' belum login. Segera login dan pilih petugas.'
      : 'Shift ' + sh.no + ' (' + sh.jam + ', ' + tgl + ') sudah mulai. Silakan login dan pilih petugas yang bertugas.'
  };
}

function pesanPengingatAdmin_(daftar, sh, menit) {
  var tgl = Number(sh.tanggal.slice(8, 10)) + ' ' + BULAN_ID_[Number(sh.tanggal.slice(5, 7)) - 1].slice(0, 3);
  var nama = daftar.map(function (x) { return x.tim.nama + (x.hp ? '' : ' (HP belum terdaftar notifikasi)'); });
  return {
    judul: daftar.length + ' tim Yandal belum login',
    isi: 'Shift ' + sh.no + ' (' + sh.jam + ', ' + tgl + ') sudah ' + menit + ' menit: ' + nama.join(', ') + '.'
  };
}

// ---------------- pemicu ----------------

/** Baris terakhir yan_Pengingat (cegah dobel). Sheet belum ada = []. */
function riwayatPengingat_(t) {
  var akhir = t.sheet.getLastRow();
  if (akhir < 2) return [];
  var mulai = Math.max(2, akhir - PENGINGAT_RIWAYAT_BARIS_ + 1);
  return t.sheet.getRange(mulai, 1, akhir - mulai + 1, t.header.length).getValues().map(function (b) {
    var o = {};
    t.header.forEach(function (h, i) { o[h] = b[i]; });
    return o;
  });
}

/**
 * Pemicu tiap 5 menit (ADMIN_pasangPemicuPengingatYandal). Hanya membaca kecuali ada yang perlu dikirim:
 * kirim FCM di luar lock, lalu riwayat + status token ditulis di dalam lock.
 */
function ADMIN_pengingatYandal(e) {
  pastikanPemilik_();
  return jalanPemicu_('ADMIN_pengingatYandal', e, pengingatYandalInti_);   // v0.84.0: waktu jalan dicatat + rem kuota
}

/** v0.84.0: isi ADMIN_pengingatYandal (dibungkus jalanPemicu_). */
function pengingatYandalInti_() {
  var c = cfg_();
  if (!c.YANDAL_SHEET_ID) { console.log('YANDAL_SHEET_ID kosong, pengingat dilewati.'); return; }
  var akun = akunFcm_();
  if (!akun) { console.warn('FCM_SERVICE_ACCOUNT kosong / rusak: pengingat login Yandal tidak bisa dikirim.'); return; }
  var p = PropertiesService.getScriptProperties(), sekarang = sekarangMsYandal_();
  var tRiwayat = headerSheetYandal_('yan_Pengingat');
  var r = rencanaPengingat_({
    sekarangMs: sekarang, tim: tabel_('MASTER_SHEET_ID', 'db_Tim').rows, users: tabel_('MASTER_SHEET_ID', 'db_Users').rows,
    shiftRows: bacaSheetYandal_(['yan_Shift']).yan_Shift.rows, perangkat: tabel_('AUTH_SHEET_ID', 'auth_Perangkat').rows,
    notif: tabelNotif_().rows, riwayat: riwayatPengingat_(tRiwayat),
    menitYandal: menitPengingat_(p.getProperty('PENGINGAT_YANDAL_MENIT'), PENGINGAT_MENIT_YANDAL_),
    menitAdmin: menitPengingat_(p.getProperty('PENGINGAT_ADMIN_MENIT'), [PENGINGAT_MENIT_ADMIN_])[0]
  });
  if (!r.yandal.length && !r.admin.length) return;
  var sh = r.sh, kirim = [], baris = [], waktu = new Date(sekarang).toISOString();
  var catat = function (tim, jenis, menit, tujuan, hasil, hp) {
    var b = { Waktu: waktu, Tanggal: sh.tanggal, Shift: sh.no, Tim: tim.nama, Jenis: jenis, Menit: menit, Tujuan: tujuan, Hasil: hasil,
              tim_id: tim.timId, user_id: hp ? hp.userId : tim.userId, install_id: hp ? hp.installId : '' };
    baris.push(b);
    return b;
  };
  r.yandal.forEach(function (x) {
    if (!x.hp) { catat(x.tim, 'YANDAL', x.menit, '-', 'TANPA_HP', null); return; }
    var m = pesanPengingatYandal_(x.tim, sh, x.menit);
    kirim.push({ token: x.hp.token, judul: m.judul, isi: m.isi, ttlDetik: 1800, installId: x.hp.installId,
                 data: { jenis: 'PENGINGAT_LOGIN', tanggal: sh.tanggal, shift: sh.no },
                 baris: [catat(x.tim, 'YANDAL', x.menit, x.hp.terakhir ? 'HP terakhir login' : 'HP terdaftar terakhir', '', x.hp)] });
  });
  if (r.admin.length) {
    var ma = pesanPengingatAdmin_(r.admin, sh, r.menit);
    var bA = r.admin.map(function (x) { return catat(x.tim, 'ADMIN', r.menit, r.penerimaAdmin.length + ' HP admin', r.penerimaAdmin.length ? '' : 'TANPA_HP_ADMIN', null); });
    r.penerimaAdmin.forEach(function (a, i) {
      kirim.push({ token: a.token, judul: ma.judul, isi: ma.isi, ttlDetik: 3600, installId: a.installId,
                   data: { jenis: 'BELUM_LOGIN_YANDAL', tanggal: sh.tanggal, shift: sh.no }, baris: i === 0 ? bA : [], admin: true });
    });
  }
  var hasil = [];
  try { hasil = kirimFcm_(akun, kirim); } catch (e) {
    hasil = kirim.map(function () { return { ok: false, tidakTerdaftar: false, pesan: String(e.kode || e.message || e).slice(0, 80) }; });
  }
  var adminOk = 0, adminGagal = [];
  kirim.forEach(function (k, i) {
    var h = hasil[i] || { ok: false, pesan: 'TANPA_JAWABAN' };
    if (k.admin) { if (h.ok) adminOk++; else adminGagal.push(h.pesan); return; }
    k.baris.forEach(function (b) { b.Hasil = h.ok ? 'TERKIRIM' : 'GAGAL ' + h.pesan; });
  });
  if (r.admin.length && r.penerimaAdmin.length) {
    baris.filter(function (b) { return b.Jenis === 'ADMIN'; }).forEach(function (b) {
      b.Hasil = adminOk ? 'TERKIRIM ' + adminOk + ' HP' : 'GAGAL ' + (adminGagal[0] || '');
    });
  }
  denganLock_(function () {
    var t = headerSheetYandal_('yan_Pengingat'), no = t.sheet.getLastRow();
    baris.forEach(function (b, i) { b.No = no + i; });
    tambahBanyak_(t, baris);
    var tN = tabelNotif_(), perIns = {}, ubah = [];
    tN.rows.forEach(function (n) { perIns[teksSel_(n.install_id)] = n; });
    kirim.forEach(function (k, i) {
      var n = perIns[k.installId], h = hasil[i];
      if (!n || !h) return;
      if (h.ok) ubah.push({ r: n, u: { terakhir_kirim: waktu, pesan: '' } });
      else if (h.tidakTerdaftar) ubah.push({ r: n, u: { aktif: false, pesan: 'TIDAK_TERDAFTAR ' + h.pesan, diperbarui_pada: waktu } });
    });
    tulisBlok_(tN, ubah, []);
  });
  console.log('PENGINGAT YANDAL shift ' + sh.no + ' ' + sh.tanggal + ' menit ' + r.menit + ': ' +
    baris.map(function (b) { return b.Jenis + ' ' + b.Tim + ' = ' + b.Hasil; }).join(' | '));
}

function hapusPemicuPengingat_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'ADMIN_pengingatYandal') ScriptApp.deleteTrigger(t);
  });
}

/** Editor: pasang pemicu pengingat login Yandal tiap 5 menit (pemicu lama diganti). */
function ADMIN_pasangPemicuPengingatYandal() {
  pastikanPemilik_();
  if (!akunFcm_()) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'FCM_SERVICE_ACCOUNT (JSON service account Firebase)');
  hapusPemicuPengingat_();
  ScriptApp.newTrigger('ADMIN_pengingatYandal').timeBased().everyMinutes(5).create();
  console.log('Pemicu ADMIN_pengingatYandal tiap 5 menit dipasang. Pengingat HP Yandal menit ' +
    menitPengingat_(PropertiesService.getScriptProperties().getProperty('PENGINGAT_YANDAL_MENIT'), PENGINGAT_MENIT_YANDAL_).join(', ') +
    ' sesudah shift mulai, admin menit ' + menitPengingat_(PropertiesService.getScriptProperties().getProperty('PENGINGAT_ADMIN_MENIT'), [PENGINGAT_MENIT_ADMIN_])[0] + '.');
}

/** Editor: hentikan pemicu pengingat. */
function ADMIN_berhentiPemicuPengingatYandal() {
  pastikanPemilik_();
  hapusPemicuPengingat_();
  console.log('Pemicu ADMIN_pengingatYandal dihapus.');
}

/** Editor: buat sheet auth_Notif (SiSi_Auth) + yan_Pengingat (SiSi_Yandal) bila belum ada. Aman diulang. */
function ADMIN_siapkanNotifikasi() {
  pastikanPemilik_();
  var c = cfg_();
  [['AUTH_SHEET_ID', 'auth_Notif', AUTH_NOTIF_HEADER_], ['YANDAL_SHEET_ID', 'yan_Pengingat', YAN_PENGINGAT_HEADER_]].forEach(function (s) {
    if (!c[s[0]]) { console.warn(s[0] + ' kosong, ' + s[1] + ' dilewati'); return; }
    var ss = bukaSpreadsheet_(c[s[0]]), sh = ss.getSheetByName(s[1]);
    if (sh) { console.log(s[1] + ': sudah ada'); return; }
    sh = ss.insertSheet(s[1]);
    sh.getRange(1, 1, 1, s[2].length).setValues([s[2]]);
    if (sh.setFrozenRows) sh.setFrozenRows(1);
    console.log(s[1] + ': dibuat');
  });
  console.log(akunFcm_() ? 'FCM_SERVICE_ACCOUNT: OK. Uji: ADMIN_ujiNotifikasi, lalu ADMIN_pasangPemicuPengingatYandal.'
    : 'FCM_SERVICE_ACCOUNT kosong: isi JSON service account Firebase (Project settings > Service accounts > Generate new private key).');
}

/** Editor: kirim notifikasi uji ke semua HP admin yang terdaftar (cek FCM sebelum pemicu dipasang). */
function ADMIN_ujiNotifikasi() {
  pastikanPemilik_();
  var akun = akunFcm_();
  if (!akun) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'FCM_SERVICE_ACCOUNT');
  var peran = {};
  tabel_('MASTER_SHEET_ID', 'db_Users').rows.forEach(function (u) { if (isAktif_(u.aktif)) peran[String(u.user_id)] = String(u.role).trim(); });
  var tujuan = tabelNotif_().rows.filter(function (n) {
    return isAktif_(n.aktif) && teksSel_(n.fcm_token) && (peran[String(n.user_id)] === 'ADMIN' || peran[String(n.user_id)] === 'SUPER');
  });
  if (!tujuan.length) { console.warn('Belum ada HP admin terdaftar notifikasi (login di app 0.83.0, izinkan notifikasi).'); return; }
  var hasil = kirimFcm_(akun, tujuan.map(function (n) {
    return { token: teksSel_(n.fcm_token), judul: 'Uji notifikasi SiSi', isi: 'Notifikasi pengingat Yandal siap dipakai.', ttlDetik: 600, data: { jenis: 'UJI' } };
  }));
  console.log('UJI NOTIFIKASI: ' + hasil.filter(function (h) { return h.ok; }).length + '/' + hasil.length + ' terkirim' +
    hasil.filter(function (h) { return !h.ok; }).map(function (h) { return ' | ' + h.pesan; }).join(''));
}

/** Bagian notifikasi di ADMIN_cekKonfigurasi. Hasil: jumlah masalah. */
function cekKonfigNotif_() {
  console.log('--- Notifikasi pengingat Yandal (FCM) ---');
  var raw = teksSel_(PropertiesService.getScriptProperties().getProperty('FCM_SERVICE_ACCOUNT'));
  if (!raw) { console.log('FCM_SERVICE_ACCOUNT kosong: notifikasi pengingat login Yandal mati.'); return 0; }
  var a = akunFcm_();
  if (!a) { console.warn('FCM_SERVICE_ACCOUNT bukan JSON service account (wajib client_email, private_key, project_id).'); return 1; }
  var pemicu = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'ADMIN_pengingatYandal'; });
  console.log('FCM: proyek ' + a.proyek + ', akun ' + a.email + ' | pemicu tiap 5 menit: ' + (pemicu ? 'aktif' : 'BELUM (ADMIN_pasangPemicuPengingatYandal)'));
  return 0;
}
