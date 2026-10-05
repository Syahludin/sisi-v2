/** PBKDF2-HMAC-SHA256, 32 byte. Apps Script tidak punya bcrypt, jadi ini pilihan terbaik. */
function pbkdf2Sha256_(password, saltBytes, iterasi) {
  if (!(iterasi >= 1000)) throw new SisiError_('ITERASI_TIDAK_VALID');
  var kunci = Utilities.newBlob(password).getBytes();
  var u = Utilities.computeHmacSha256Signature(saltBytes.concat([0, 0, 0, 1]), kunci);
  var t = u.slice();
  for (var i = 1; i < iterasi; i++) {
    u = Utilities.computeHmacSha256Signature(u, kunci);
    for (var j = 0; j < t.length; j++) t[j] = t[j] ^ u[j];
  }
  return Utilities.base64Encode(t);
}

function hashPassword_(password, saltB64, iterasi) {
  return pbkdf2Sha256_(password, Utilities.base64Decode(saltB64), iterasi);
}

function versiHash_(iterasi) { return 'pbkdf2-sha256:' + iterasi; }

function parseIterasi_(versi) {
  var m = /^pbkdf2-sha256:(\d+)$/.exec(String(versi || ''));
  if (!m) throw new SisiError_('HASH_VERSI_TIDAK_DIKENAL', versi);
  return Number(m[1]);
}

function acakHex_(panjang) {
  var s = '';
  while (s.length < panjang) s += Utilities.getUuid().replace(/-/g, '');
  return s.slice(0, panjang);
}

function saltBaru_() {
  var hex = acakHex_(32), bytes = [];
  for (var i = 0; i < 32; i += 2) {
    var b = parseInt(hex.substr(i, 2), 16);
    bytes.push(b > 127 ? b - 256 : b);
  }
  return Utilities.base64Encode(bytes);
}

/** Token perangkat 64 hex. Yang disimpan di Sheet hanya hash-nya. */
function tokenBaru_() { return acakHex_(64); }

function login_(_, data, platform) {
  var d = validasi_(data, {
    username: { tipe: 'teks', wajib: true, maks: 80 },
    password: { tipe: 'teks', wajib: true, maks: 200, mentah: true },
    perangkat: { tipe: 'teks', maks: 120 },
    installId: { tipe: 'uuid' },     // ID instalasi app (HP). Web tidak mengirim.
    gpsPalsu: { tipe: 'bool' }       // v0.38: HP mendeteksi lokasi palsu (mock) sebelum login = ditolak + dicatat
  });
  var c = cfg_();
  var username = d.username.toLowerCase();
  // Audit 4 Okt 2026: rem SEBELUM lock & sebelum baca sheet, supaya spam login dari internet tidak memegang
  // ScriptLock (sync semua petugas SERVER_SIBUK) dan tidak membanjiri log_Audit.
  var batas = cekBatasLogin_(username);
  try {
    return loginInti_(d, username, platform, c, batas);
  } catch (e) {
    if (e && (e.kode === 'LOGIN_GAGAL' || e.kode === 'GPS_PALSU')) catatGagalLogin_(username);
    throw e;
  }
}

var LOGIN_BATAS_USER_ = 10;     // gagal per username per 15 menit (di atas kunci akun 5x di auth_Password)
var LOGIN_BATAS_GLOBAL_ = 30;   // gagal semua username per menit (tebak massal / spam)
var LOGIN_AUDIT_MAKS_ = 10;     // per menit: gagal ke-11 dst tidak ditulis ke log_Audit (cukup console)

function kunciGagalUser_(username) { return 'login-gagal:u:' + sha256Hex_(username).slice(0, 32); }
function kunciGagalGlobal_() { return 'login-gagal:g:' + Math.floor(Date.now() / 60000); }

/**
 * Lempar LOGIN_DIBATASI. Hasil: jumlah gagal global menit ini (untuk batas audit).
 * v0.48 (audit 4 Okt 2026): batas GLOBAL hanya untuk username yang TIDAK terdaftar. Dulu spam login asal
 * (30/menit) mengunci login semua petugas. Username terdaftar hanya kena batas per username.
 * Batas per username dicek tanpa sheet; daftar username terdaftar dari cache (db_Users dibaca maks 1x / 5 menit,
 * hanya saat batas global terlewati).
 */
function cekBatasLogin_(username) {
  var cache = CacheService.getScriptCache();
  var u = Number(cache.get(kunciGagalUser_(username))) || 0;
  var g = Number(cache.get(kunciGagalGlobal_())) || 0;
  var tolak = u >= LOGIN_BATAS_USER_ || (g >= LOGIN_BATAS_GLOBAL_ && !usernameTerdaftar_(username));
  if (tolak) {
    console.warn(JSON.stringify({ kode: 'LOGIN_DIBATASI', user: u, global: g }));
    throw new SisiError_('LOGIN_DIBATASI');
  }
  return { global: g };
}

var KUNCI_USERNAME_TERDAFTAR_ = 'login-user:v1';

/** Username aktif di db_Users (hash 32 hex, di-cache CACHE_DETIK). */
function usernameTerdaftar_(username) {
  var cache = CacheService.getScriptCache();
  var ada = cache.get(KUNCI_USERNAME_TERDAFTAR_);
  var daftar = ada ? JSON.parse(ada) : null;
  if (!daftar) {
    daftar = tabel_('MASTER_SHEET_ID', 'db_Users').rows
      .filter(function (r) { return r.username && isAktif_(r.aktif); })
      .map(function (r) { return sha256Hex_(String(r.username).trim().toLowerCase()).slice(0, 32); });
    cache.put(KUNCI_USERNAME_TERDAFTAR_, JSON.stringify(daftar), cfg_().CACHE_DETIK);
  }
  return daftar.indexOf(sha256Hex_(username).slice(0, 32)) !== -1;
}

/** Hitung gagal (CacheService tidak atomik; cukup sebagai rem, bukan penghitung pasti). */
function catatGagalLogin_(username) {
  var cache = CacheService.getScriptCache();
  var ku = kunciGagalUser_(username), kg = kunciGagalGlobal_();
  cache.put(ku, String((Number(cache.get(ku)) || 0) + 1), 900);
  cache.put(kg, String((Number(cache.get(kg)) || 0) + 1), 120);
}

function hapusGagalLogin_(username) { CacheService.getScriptCache().remove(kunciGagalUser_(username)); }

function loginInti_(d, username, platform, c, batas) {
  var catatAudit = !batas || batas.global < LOGIN_AUDIT_MAKS_;
  return denganLock_(function () {
    var w = stopwatch_();
    // v0.38 (4 Okt 2026): HP yang memakai lokasi palsu ditolak SEBELUM password dicek (tidak membocorkan apa pun).
    // Deteksi tetap di HP (server tidak bisa memverifikasi GPS); server menolak + mencatat untuk admin.
    if (d.gpsPalsu === true) {
      if (catatAudit) auditLog_({ username: username }, 'LOGIN_GPS_PALSU', '', d.perangkat || '', platform);
      throw new SisiError_('GPS_PALSU');
    }
    // 1) SEMUA BACA dulu. Membaca setelah menulis memaksa Sheets flush, jadi tulis dikumpulkan di akhir.
    var users = tabel_('MASTER_SHEET_ID', 'db_Users').rows;
    w('baca_users');
    var cocok = users.filter(function (r) { return String(r.username).trim().toLowerCase() === username; });
    if (cocok.length > 1) throw new SisiError_('USERNAME_GANDA', username);
    var user = cocok[0];
    var authT = tabel_('AUTH_SHEET_ID', 'auth_Password');
    w('baca_password');
    var auth = user ? authT.rows.filter(function (r) { return String(r.user_id) === String(user.user_id); })[0] : null;

    if (!user || !isAktif_(user.aktif) || !auth) {
      pbkdf2Sha256_('dummy', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], c.PBKDF2_ITERASI);
      if (catatAudit) auditLog_({ username: username }, 'LOGIN_GAGAL', '', 'akun tidak ada/nonaktif', platform);
      throw new SisiError_('LOGIN_GAGAL');
    }
    var terkunci = keDate_(auth.terkunci_sampai);
    // v0.48: dulu AKUN_TERKUNCI (membocorkan bahwa username itu ada). Sekarang sama dengan password salah;
    // pesan di HP menyebut kemungkinan dikunci 15 menit. Password tidak dicek selama terkunci.
    if (terkunci && terkunci.getTime() > Date.now()) {
      pbkdf2Sha256_('dummy', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], c.PBKDF2_ITERASI);
      throw new SisiError_('LOGIN_GAGAL', 'terkunci');
    }

    var iterasi = parseIterasi_(auth.hash_versi);
    var cocokPw = samaAman_(hashPassword_(d.password, String(auth.salt), iterasi), String(auth.password_hash));
    w('hash');
    if (!cocokPw) {
      var gagal = (Number(auth.gagal_login) || 0) + 1;
      var ubah = { gagal_login: gagal };
      if (gagal >= c.LOGIN_MAKS_GAGAL) {
        ubah.gagal_login = 0;
        ubah.terkunci_sampai = new Date(Date.now() + c.LOGIN_KUNCI_MENIT * 60000).toISOString();
      }
      ubahBarisDikenal_(authT, auth, ubah);
      if (catatAudit) auditLog_({ userId: String(user.user_id), username: username }, 'LOGIN_GAGAL', '', 'password salah', platform);
      throw new SisiError_('LOGIN_GAGAL');
    }

    var profil = profilUser_(String(user.user_id), users);   // db_Users tidak dibaca ulang
    w('baca_tim');
    var perangkatT = tabel_('AUTH_SHEET_ID', 'auth_Perangkat');
    w('baca_perangkat');
    var menu = menuUntuk_(profil, platform, aturanAkses_());
    var logT = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    w('akses_log');

    // 2) SEMUA TULIS (dibuffer Sheets, flush sekali di akhir eksekusi).
    var reset = {};
    if (Number(auth.gagal_login) || auth.terkunci_sampai) { reset.gagal_login = 0; reset.terkunci_sampai = ''; }
    if (iterasi < c.PBKDF2_ITERASI) {   // upgrade hash otomatis
      var salt = saltBaru_();
      reset.salt = salt;
      reset.password_hash = hashPassword_(d.password, salt, c.PBKDF2_ITERASI);
      reset.hash_versi = versiHash_(c.PBKDF2_ITERASI);
    }
    if (Object.keys(reset).length) ubahBarisDikenal_(authT, auth, reset);   // tidak menulis kalau tidak berubah

    var token = tokenBaru_();
    var sekarang = new Date();
    // Login ulang di HP yang sama: token lama user ini di instalasi yang sama dicabut (keputusan 2 Okt 2026).
    tokenLamaDicabut_(perangkatT.rows, profil.userId, d.installId).forEach(function (r) {
      ubahBarisDikenal_(perangkatT, r, { dicabut_pada: sekarang.toISOString() });
      hapusSesiCache_(r.token_hash);
    });
    profil.deviceId = uuid_();
    tambahBaris_(perangkatT, {
      device_id: profil.deviceId,
      user_id: profil.userId,
      install_id: d.installId || '',
      token_hash: sha256Hex_(token),
      platform: platform,
      dibuat_pada: sekarang.toISOString(),
      terakhir_dipakai: sekarang.toISOString(),
      kedaluwarsa_pada: new Date(sekarang.getTime() + c.TOKEN_TTL_HARI * 864e5).toISOString(),
      dicabut_pada: ''
    });
    auditLog_(profil, 'LOGIN', '', d.perangkat || '', platform, logT);
    // Sesi langsung masuk cache: panggilan pertama sesudah login tidak perlu baca auth_Perangkat/db_Users/db_Tim lagi.
    var sesiCache = JSON.parse(JSON.stringify(profil));
    sesiCache._tokenHash = sha256Hex_(token);
    simpanSesiCache_(sesiCache);
    hapusGagalLogin_(username);
    w('tulis');
    var hasil = { token: token, profil: profil, menu: menu, offlineSampai: offlineSampai_(sekarang) };
    if (c.ENV === 'staging') hasil._waktu = w.ringkas();   // rincian ms, hanya staging
    return hasil;
  });
}

/** Baris auth_Perangkat yang harus dicabut saat login ulang: user sama + instalasi sama + belum dicabut. */
function tokenLamaDicabut_(rows, userId, installId) {
  if (!installId) return [];
  return rows.filter(function (r) {
    return String(r.user_id) === String(userId) && String(r.install_id) === String(installId) && !r.dicabut_pada;
  });
}

function cekSesi_(sesi, data, platform) {
  validasi_(data, {});
  var c = cfg_();
  var segar = profilUser_(sesi.userId);     // jangan percaya cache untuk profil
  segar.deviceId = sesi.deviceId;
  denganLock_(function () {
    var t = tabel_('AUTH_SHEET_ID', 'auth_Perangkat');
    var r = barisPerangkat_(t, sesi.deviceId);
    // v0.48: perpanjangan 30 hari tidak boleh melewati umur mutlak token (TOKEN_MAKS_HARI sejak login).
    var batas = batasMutlakToken_(r, c);
    if (!batas || batas <= Date.now()) throw new SisiError_('SESI_KEDALUWARSA', 'umur mutlak');
    ubahBarisDikenal_(t, r, {
      terakhir_dipakai: sekarangIso_(),
      kedaluwarsa_pada: new Date(Math.min(Date.now() + c.TOKEN_TTL_HARI * 864e5, batas)).toISOString()
    });
  });
  segar._tokenHash = sesi._tokenHash;
  simpanSesiCache_(segar);
  return { profil: profilPublik_(segar), menu: menuUntuk_(segar, platform),
           offlineSampai: offlineSampai_(new Date()), waktuServer: sekarangIso_() };
}

function logout_(sesi, data, platform) {
  // v0.39: alasan GPS_PALSU = paksa logout dari HP karena lokasi palsu terdeteksi saat sesi aktif.
  var d = validasi_(data, { alasan: { tipe: 'pilihan', pilihan: ['GPS_PALSU'] } });
  denganLock_(function () {
    var t = tabel_('AUTH_SHEET_ID', 'auth_Perangkat');
    ubahBarisDikenal_(t, barisPerangkat_(t, sesi.deviceId), { dicabut_pada: sekarangIso_() });
  });
  hapusSesiCache_(sesi._tokenHash);
  auditLog_(sesi, d.alasan ? 'LOGOUT_GPS_PALSU' : 'LOGOUT', '', d.alasan ? 'lokasi palsu terdeteksi saat sesi aktif' : '', platform);
  return { keluar: true };
}

/** Batas mutlak token (ms) = dibuat_pada + TOKEN_MAKS_HARI. dibuat_pada rusak / kosong = null (fail closed). */
function batasMutlakToken_(r, c) {
  var dibuat = keDate_(r && r.dibuat_pada);
  return dibuat ? dibuat.getTime() + (c || cfg_()).TOKEN_MAKS_HARI * 864e5 : null;
}

/** Satu baris auth_Perangkat per device_id. Ganda = tolak (fail closed). */
function barisPerangkat_(t, deviceId) {
  var r = t.rows.filter(function (x) { return String(x.device_id) === String(deviceId); });
  if (r.length !== 1) throw new SisiError_(r.length ? 'ID_GANDA' : 'SESI_TIDAK_VALID', deviceId);
  return r[0];
}
