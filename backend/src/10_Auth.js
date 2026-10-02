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
    installId: { tipe: 'uuid' }      // ID instalasi app (HP). Web tidak mengirim.
  });
  var c = cfg_();
  var username = d.username.toLowerCase();

  return denganLock_(function () {
    var cocok = tabel_('MASTER_SHEET_ID', 'db_Users').rows
      .filter(function (r) { return String(r.username).trim().toLowerCase() === username; });
    if (cocok.length > 1) throw new SisiError_('USERNAME_GANDA', username);
    var user = cocok[0];
    var authT = tabel_('AUTH_SHEET_ID', 'auth_Password');
    var auth = user ? authT.rows.filter(function (r) { return String(r.user_id) === String(user.user_id); })[0] : null;

    if (!user || !isAktif_(user.aktif) || !auth) {
      pbkdf2Sha256_('dummy', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], c.PBKDF2_ITERASI);
      auditLog_({ username: username }, 'LOGIN_GAGAL', '', 'akun tidak ada/nonaktif', platform);
      throw new SisiError_('LOGIN_GAGAL');
    }
    var terkunci = keDate_(auth.terkunci_sampai);
    if (terkunci && terkunci.getTime() > Date.now()) throw new SisiError_('AKUN_TERKUNCI');

    var iterasi = parseIterasi_(auth.hash_versi);
    if (!samaAman_(hashPassword_(d.password, String(auth.salt), iterasi), String(auth.password_hash))) {
      var gagal = (Number(auth.gagal_login) || 0) + 1;
      var ubah = { gagal_login: gagal };
      if (gagal >= c.LOGIN_MAKS_GAGAL) {
        ubah.gagal_login = 0;
        ubah.terkunci_sampai = new Date(Date.now() + c.LOGIN_KUNCI_MENIT * 60000).toISOString();
      }
      ubahBaris_(authT, 'user_id', user.user_id, ubah);
      auditLog_({ userId: String(user.user_id), username: username }, 'LOGIN_GAGAL', '', 'password salah', platform);
      throw new SisiError_('LOGIN_GAGAL');
    }

    var reset = { gagal_login: 0, terkunci_sampai: '' };
    if (iterasi < c.PBKDF2_ITERASI) {   // upgrade hash otomatis
      var salt = saltBaru_();
      reset.salt = salt;
      reset.password_hash = hashPassword_(d.password, salt, c.PBKDF2_ITERASI);
      reset.hash_versi = versiHash_(c.PBKDF2_ITERASI);
    }
    ubahBaris_(authT, 'user_id', user.user_id, reset);

    var profil = profilUser_(String(user.user_id));
    var token = tokenBaru_();
    var sekarang = new Date();
    var perangkatT = tabel_('AUTH_SHEET_ID', 'auth_Perangkat');
    // Login ulang di HP yang sama: token lama user ini di instalasi yang sama dicabut (keputusan 2 Okt 2026).
    tokenLamaDicabut_(perangkatT.rows, profil.userId, d.installId).forEach(function (r) {
      ubahBaris_(perangkatT, 'device_id', r.device_id, { dicabut_pada: sekarang.toISOString() });
      CacheService.getScriptCache().remove('sesi:' + r.token_hash);
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
    auditLog_(profil, 'LOGIN', '', d.perangkat || '', platform);
    return { token: token, profil: profil, menu: menuUntuk_(profil, platform), offlineSampai: offlineSampai_(sekarang) };
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
    ubahBaris_(tabel_('AUTH_SHEET_ID', 'auth_Perangkat'), 'device_id', sesi.deviceId, {
      terakhir_dipakai: sekarangIso_(),
      kedaluwarsa_pada: new Date(Date.now() + c.TOKEN_TTL_HARI * 864e5).toISOString()
    });
  });
  segar._tokenHash = sesi._tokenHash;
  CacheService.getScriptCache().put('sesi:' + sesi._tokenHash, JSON.stringify(segar), c.CACHE_DETIK);
  return { profil: profilPublik_(segar), menu: menuUntuk_(segar, platform),
           offlineSampai: offlineSampai_(new Date()), waktuServer: sekarangIso_() };
}

function logout_(sesi, data, platform) {
  validasi_(data, {});
  denganLock_(function () {
    ubahBaris_(tabel_('AUTH_SHEET_ID', 'auth_Perangkat'), 'device_id', sesi.deviceId, { dicabut_pada: sekarangIso_() });
  });
  CacheService.getScriptCache().remove('sesi:' + sesi._tokenHash);
  auditLog_(sesi, 'LOGOUT', '', '', platform);
  return { keluar: true };
}
