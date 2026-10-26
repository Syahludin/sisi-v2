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
  var batas = cekBatasLogin_(username, d.installId);
  try {
    return loginInti_(d, username, platform, c, batas);
  } catch (e) {
    if (e && (e.kode === 'LOGIN_GAGAL' || e.kode === 'GPS_PALSU')) catatGagalLogin_(username, batas);
    throw e;
  }
}

var LOGIN_BATAS_USER_ = 10;     // gagal per username per 15 menit (di atas kunci akun 5x di auth_Password)
var LOGIN_BATAS_GLOBAL_ = 30;   // gagal semua username per menit (tebak massal / spam)
var LOGIN_AUDIT_MAKS_ = 10;     // per menit: gagal ke-11 dst tidak ditulis ke log_Audit (cukup console)

function kunciGagalUser_(username) { return 'login-gagal:u:' + sha256Hex_(username).slice(0, 32); }
function kunciGagalGlobal_() { return 'login-gagal:g:' + Math.floor(Date.now() / 60000); }

/**
 * Lempar LOGIN_DIBATASI. Hasil: { global, kenal, pasangan, users?, perangkat? } (users/perangkat = baris yang sudah
 * dibaca saat indeks HP dikenal dibangun, dipakai ulang loginInti_ supaya sheet tidak dibaca 2x).
 * v0.48 (audit 4 Okt 2026): batas GLOBAL hanya untuk username yang TIDAK terdaftar. Dulu spam login asal
 * (30/menit) mengunci login semua petugas. Username terdaftar hanya kena batas per username.
 * Batas per username dicek tanpa sheet; daftar username terdaftar dari cache (db_Users dibaca maks 1x / 5 menit,
 * hanya saat batas global terlewati).
 * v0.62.4 (keputusan kvlar 7 Okt 2026): HP DIKENAL (installId ini pernah login sukses ke akun ini, barisnya di
 * auth_Perangkat belum dicabut) tidak ikut rem per username maupun kunci akun 5x. Jatahnya sendiri: 5x salah =
 * HP itu saja yang dibatasi 15 menit. Jadi orang lain yang sengaja salah password tidak bisa mengunci petugas di
 * HP-nya sendiri. HP asing / web tetap berbagi satu ember per akun (ganti-ganti installId tidak menambah jatah).
 */
function cekBatasLogin_(username, installId) {
  var cache = CacheService.getScriptCache();
  var g = Number(cache.get(kunciGagalGlobal_())) || 0;
  var pasangan = installId ? pasanganPerangkat_(username, installId) : null;
  if (pasangan) {
    var cek = cekIndeksKenal_(cache, pasangan);
    if (cek.kenal) {
      var n = gagalPerangkat_(cache, username, pasangan);
      if (n >= cfg_().LOGIN_MAKS_GAGAL) {
        console.warn(JSON.stringify({ kode: 'LOGIN_DIBATASI', perangkat: n }));
        throw new SisiError_('LOGIN_DIBATASI', 'perangkat');
      }
      return { global: g, kenal: true, pasangan: pasangan, users: cek.users, perangkat: cek.perangkat };
    }
    cekBatasUser_(cache, username, g);
    return { global: g, kenal: false, pasangan: pasangan, users: cek.users, perangkat: cek.perangkat };
  }
  cekBatasUser_(cache, username, g);
  return { global: g, kenal: false, pasangan: null };
}

/** Rem ember bersama (HP asing / web): per username + global untuk username tidak terdaftar. */
function cekBatasUser_(cache, username, g) {
  var u = Number(cache.get(kunciGagalUser_(username))) || 0;
  if (u >= LOGIN_BATAS_USER_) {
    console.warn(JSON.stringify({ kode: 'LOGIN_DIBATASI', user: u, global: g }));
    throw new SisiError_('LOGIN_DIBATASI');
  }
  // v0.62.5 (review ulang 7 Okt 2026): rem global dijawab LOGIN_GAGAL, bukan LOGIN_DIBATASI. Dulu saat rem global aktif
  // username asing dapat LOGIN_DIBATASI sedangkan username terdaftar lanjut ke LOGIN_GAGAL, jadi orang bisa mengecek
  // username mana yang ada. Tetap tanpa hash, tanpa lock, tanpa baca sheet selain cache daftar username.
  if (g >= LOGIN_BATAS_GLOBAL_ && !usernameTerdaftar_(username)) {
    console.warn(JSON.stringify({ kode: 'LOGIN_DIBATASI', global: g, jawab: 'LOGIN_GAGAL' }));
    throw new SisiError_('LOGIN_GAGAL', 'rem global');
  }
}

// ---------- v0.62.4: HP dikenal ----------
var INDEKS_KENAL_KUNCI_ = 'perangkat-kenal:v1';

/** 16 hex awal sha256(username|installId). Cocok di indeks belum cukup: loginInti_ tetap memastikan ke auth_Perangkat. */
function pasanganPerangkat_(username, installId) {
  return sha256Hex_(String(username).trim().toLowerCase() + '|' + String(installId).trim().toLowerCase()).slice(0, 16);
}

function kunciGagalPerangkat_(pasangan) { return 'login-gagal:d:' + pasangan; }
function kunciBukaUser_(username) { return 'login-buka:u:' + sha256Hex_(username).slice(0, 32); }

/** Jumlah gagal HP dikenal (nilai cache "n:ms terakhir"). Hitungan sebelum ADMIN_bukaKunciLogin diabaikan. */
function gagalPerangkat_(cache, username, pasangan) {
  var v = String(cache.get(kunciGagalPerangkat_(pasangan)) || '').split(':');
  var n = Number(v[0]) || 0, t = Number(v[1]) || 0;
  var buka = Number(cache.get(kunciBukaUser_(username))) || 0;
  return n && t > buka ? n : 0;
}

/** Baris auth_Perangkat yang membuat HP dikenal: user + instalasi sama, belum dicabut, dibuat <= 120 hari. */
function perangkatDikenal_(rows, userId, installId) {
  if (!installId || !userId) return false;
  var batas = Date.now() - INDEKS_TOKEN_SIMPAN_HARI_ * 864e5;
  var ins = String(installId).trim().toLowerCase();
  return rows.some(function (r) {
    if (String(r.user_id) !== String(userId) || String(r.install_id || '').trim().toLowerCase() !== ins || r.dicabut_pada) return false;
    var d = keDate_(r.dibuat_pada);
    return !!(d && d.getTime() >= batas);
  });
}

function bacaIndeksKenal_(cache) {
  var ada = cache.get(INDEKS_KENAL_KUNCI_);
  if (!ada) return null;
  try {
    var x = JSON.parse(ada);
    if (!x || x.e !== cfg_().SESI_EPOCH || !(x.t > 0) || (!x.besar && !Array.isArray(x.h))) return null;
    return x;
  } catch (e) { return null; }
}

/** Baca auth_Perangkat + db_Users sekali (maks 1x / menit oleh pasangan asing), simpan pasangan HP dikenal ke cache. */
function bangunIndeksKenal_(cache) {
  var c = cfg_();
  var perangkat = tabel_('AUTH_SHEET_ID', 'auth_Perangkat').rows;
  var users = tabel_('MASTER_SHEET_ID', 'db_Users').rows;
  var nama = {};
  users.forEach(function (u) { if (u.user_id && u.username && isAktif_(u.aktif)) nama[String(u.user_id)] = String(u.username); });
  var batas = Date.now() - INDEKS_TOKEN_SIMPAN_HARI_ * 864e5;
  var h = [];
  perangkat.forEach(function (r) {
    if (!r.install_id || r.dicabut_pada || !nama[String(r.user_id)]) return;
    var d = keDate_(r.dibuat_pada);
    if (!d || d.getTime() < batas) return;
    var p = pasanganPerangkat_(nama[String(r.user_id)], r.install_id);
    if (h.indexOf(p) === -1) h.push(p);
  });
  var indeks = { t: Date.now(), e: c.SESI_EPOCH, h: h };
  var teks = JSON.stringify(indeks);
  if (teks.length > INDEKS_TOKEN_MAKS_BYTE_) {
    // Fail closed: semua HP diperlakukan asing (perilaku sebelum v0.62.4). Arsipkan baris auth_Perangkat lama.
    console.warn('Indeks HP dikenal ' + teks.length + ' byte > batas: semua login memakai rem akun. Arsipkan auth_Perangkat lama.');
    indeks = { t: Date.now(), e: c.SESI_EPOCH, besar: true };
    teks = JSON.stringify(indeks);
  }
  cache.put(INDEKS_KENAL_KUNCI_, teks, c.CACHE_DETIK);
  return { indeks: indeks, perangkat: perangkat, users: users };
}

/** { kenal, users?, perangkat? }. Pasangan asing hanya memicu bangun ulang kalau indeks lebih tua dari 1 menit. */
function cekIndeksKenal_(cache, pasangan) {
  var x = bacaIndeksKenal_(cache), b = null;
  if (!x || (!x.besar && x.h.indexOf(pasangan) === -1 && Date.now() - x.t >= INDEKS_TOKEN_SEGAR_MS_)) {
    // v0.62.6: sedang dibangun jalan lain (penanda 20 detik) = pakai indeks lama, pasangan ini dianggap HP asing.
    if (x && cache.get(INDEKS_KENAL_KUNCI_ + ':bangun')) return { kenal: false, users: null, perangkat: null };
    cache.put(INDEKS_KENAL_KUNCI_ + ':bangun', '1', 20);
    try { b = bangunIndeksKenal_(cache); } finally { cache.remove(INDEKS_KENAL_KUNCI_ + ':bangun'); }
    x = b.indeks;
  }
  return { kenal: !x.besar && x.h.indexOf(pasangan) !== -1, users: b ? b.users : null, perangkat: b ? b.perangkat : null };
}

/** Login sukses dari HP: pasangan langsung masuk indeks yang ada di cache. */
function tambahIndeksKenal_(pasangan) {
  if (!pasangan) return;
  var cache = CacheService.getScriptCache();
  var x = bacaIndeksKenal_(cache);
  if (!x || x.besar || x.h.indexOf(pasangan) !== -1) return;
  x.h.push(pasangan);
  cache.put(INDEKS_KENAL_KUNCI_, JSON.stringify(x), cfg_().CACHE_DETIK);
}

/** Token dicabut (logout, ADMIN_cabutSesi, ADMIN_setPassword): indeks dibangun ulang dari sheet saat dibutuhkan. */
function buangIndeksKenal_() { CacheService.getScriptCache().remove(INDEKS_KENAL_KUNCI_); }

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

/**
 * Hitung gagal (CacheService tidak atomik; cukup sebagai rem, bukan penghitung pasti).
 * v0.62.4: HP dikenal menambah hitungan HP itu saja, bukan hitungan username (ember bersama HP asing).
 */
function catatGagalLogin_(username, batas) {
  var cache = CacheService.getScriptCache();
  var kg = kunciGagalGlobal_();
  cache.put(kg, String((Number(cache.get(kg)) || 0) + 1), 120);
  if (batas && batas.kenal && batas.pasangan) {
    var n = gagalPerangkat_(cache, username, batas.pasangan) + 1;
    cache.put(kunciGagalPerangkat_(batas.pasangan), n + ':' + Date.now(), cfg_().LOGIN_KUNCI_MENIT * 60);
    return;
  }
  var ku = kunciGagalUser_(username);
  cache.put(ku, String((Number(cache.get(ku)) || 0) + 1), 900);
}

function hapusGagalLogin_(username) { CacheService.getScriptCache().remove(kunciGagalUser_(username)); }

var HASH_DUMMY_SALT_ = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

/**
 * v0.62.3 (audit 6 Okt 2026): hash password (PBKDF2, ~1-2 detik) dan semua baca dikerjakan DI LUAR ScriptLock.
 * Dulu seluruh login (termasuk hash dummy untuk username asing) memegang lock global, jadi spam login dari internet
 * membuat syncRow / uploadFotoRow semua petugas SERVER_SIBUK. Lock hanya dipegang untuk menulis: baris auth_Password
 * dibaca ulang di dalam lock (gagal_login terbaru, password tidak berubah di tengah jalan, belum terkunci).
 */
function loginInti_(d, username, platform, c, batas) {
  var catatAudit = !batas || batas.global < LOGIN_AUDIT_MAKS_;
  var w = stopwatch_();
  // v0.38 (4 Okt 2026): HP yang memakai lokasi palsu ditolak SEBELUM password dicek (tidak membocorkan apa pun).
  // Deteksi tetap di HP (server tidak bisa memverifikasi GPS); server menolak + mencatat untuk admin.
  if (d.gpsPalsu === true) {
    if (catatAudit) auditLog_({ username: username }, 'LOGIN_GPS_PALSU', '', d.perangkat || '', platform);
    throw new SisiError_('GPS_PALSU');
  }
  // 1) BACA + HASH tanpa lock.
  var users = (batas && batas.users) || tabel_('MASTER_SHEET_ID', 'db_Users').rows;
  w('baca_users');
  var cocok = users.filter(function (r) { return String(r.username).trim().toLowerCase() === username; });
  if (cocok.length > 1) throw new SisiError_('USERNAME_GANDA', username);
  var user = cocok[0];
  var auth = user ? cariAuth_(tabel_('AUTH_SHEET_ID', 'auth_Password').rows, user.user_id) : null;
  w('baca_password');

  if (!user || !isAktif_(user.aktif) || !auth) {
    pbkdf2Sha256_('dummy', HASH_DUMMY_SALT_, c.PBKDF2_ITERASI);
    if (catatAudit) auditLog_({ username: username }, 'LOGIN_GAGAL', '', 'akun tidak ada/nonaktif', platform);
    throw new SisiError_('LOGIN_GAGAL');
  }
  // v0.62.4: indeks bilang HP dikenal = pastikan ke auth_Perangkat (indeks cuma awalan hash & bisa telat dicabut).
  // Tidak terbukti = perlakukan sebagai HP asing, termasuk rem per username yang tadi dilewati.
  var kenal = false;
  if (batas && batas.kenal) {
    kenal = perangkatDikenal_(batas.perangkat || tabel_('AUTH_SHEET_ID', 'auth_Perangkat').rows, user.user_id, d.installId);
    if (!kenal) {
      batas.kenal = false;
      cekBatasUser_(CacheService.getScriptCache(), username, batas.global || 0);
    }
  }
  w('cek_perangkat');
  // v0.48: terkunci dijawab sama dengan password salah (tidak membocorkan username ada). Password tidak dicek.
  // v0.62.4: kunci akun hanya untuk HP asing / web.
  if (!kenal && terkunci_(auth)) {
    pbkdf2Sha256_('dummy', HASH_DUMMY_SALT_, c.PBKDF2_ITERASI);
    throw new SisiError_('LOGIN_GAGAL', 'terkunci');
  }
  var iterasi = parseIterasi_(auth.hash_versi);
  var cocokPw = samaAman_(hashPassword_(d.password, String(auth.salt), iterasi), String(auth.password_hash));
  w('hash');

  if (!cocokPw) {
    if (kenal) {
      // HP dikenal: hitungan di cache (catatGagalLogin_), gagal_login akun tidak naik, tidak ambil lock.
      if (catatAudit) auditLog_({ userId: String(user.user_id), username: username }, 'LOGIN_GAGAL', '', 'password salah (HP dikenal)', platform);
      throw new SisiError_('LOGIN_GAGAL');
    }
    denganLock_(function () {
      var authT = tabel_('AUTH_SHEET_ID', 'auth_Password');
      var segar = cariAuth_(authT.rows, user.user_id);
      if (!segar) return;
      var gagal = (Number(segar.gagal_login) || 0) + 1;
      var ubah = { gagal_login: gagal };
      if (gagal >= c.LOGIN_MAKS_GAGAL) {
        ubah.gagal_login = 0;
        ubah.terkunci_sampai = new Date(Date.now() + c.LOGIN_KUNCI_MENIT * 60000).toISOString();
      }
      var logT = catatAudit ? headerTabel_('AUTH_SHEET_ID', 'log_Audit') : null;
      ubahBarisDikenal_(authT, segar, ubah);
      if (logT) auditLog_({ userId: String(user.user_id), username: username }, 'LOGIN_GAGAL', '', 'password salah', platform, logT);
    });
    throw new SisiError_('LOGIN_GAGAL');
  }

  var profil = profilUser_(String(user.user_id), users);   // db_Users tidak dibaca ulang
  w('baca_tim');
  // v1.0.34 web admin (permintaan kvlar 26 Okt 2026): website hanya untuk Admin / Admin ES. Dicek sesudah password benar
  // (tidak membocorkan role ke penebak password) dan tidak menambah hitungan gagal login.
  if (platform === 'WEB' && ROLE_WEB_().indexOf(profil.role) === -1) {
    if (catatAudit) auditLog_(profil, 'LOGIN_WEB_DITOLAK', '', 'role ' + profil.role, platform);
    throw new SisiError_('WEB_KHUSUS_ADMIN');
  }
  // v0.63.0 (keputusan kvlar 7 Okt 2026): akun tim YANDAL = login 2 tahap. Password benar -> tiket (bukan token),
  // lalu pilih 1-2 petugas + konfirmasi (mulaiShiftYandal) baru token dibuat. Menit peralihan shift = ditolak.
  var yandal = petugasYandal_(profil) ? siapkanLoginYandal_(profil) : null;
  w('yandal');
  var menu = yandal ? null : menuUntuk_(profil, platform, aturanAkses_());
  var upgrade = null;
  if (iterasi < c.PBKDF2_ITERASI) {   // upgrade hash otomatis, dihitung di luar lock
    var saltBaru = saltBaru_();
    upgrade = { salt: saltBaru, password_hash: hashPassword_(d.password, saltBaru, c.PBKDF2_ITERASI), hash_versi: versiHash_(c.PBKDF2_ITERASI) };
  }
  var token = tokenBaru_();
  var hashToken = sha256Hex_(token);
  w('akses_hash');

  // 2) LOCK hanya untuk baca ulang baris yang ditulis + semua tulis (dibuffer Sheets, flush sekali di akhir).
  denganLock_(function () {
    var authT = tabel_('AUTH_SHEET_ID', 'auth_Password');
    var segar = cariAuth_(authT.rows, user.user_id);
    // password diganti / akun terkunci di antara hash dan lock = tolak (fail closed)
    if (!segar || String(segar.password_hash) !== String(auth.password_hash) || String(segar.salt) !== String(auth.salt) || (!kenal && terkunci_(segar))) {
      throw new SisiError_('LOGIN_GAGAL', 'berubah saat login');
    }
    var perangkatT = yandal ? null : tabel_('AUTH_SHEET_ID', 'auth_Perangkat');
    var logT = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    w('baca_dalam_lock');

    var reset = {};
    // v0.62.4: sukses dari HP dikenal TIDAK membuka kunci akun (penyerang di HP asing tetap terkunci).
    if (!kenal && (Number(segar.gagal_login) || segar.terkunci_sampai)) { reset.gagal_login = 0; reset.terkunci_sampai = ''; }
    if (upgrade) Object.keys(upgrade).forEach(function (k) { reset[k] = upgrade[k]; });
    if (Object.keys(reset).length) ubahBarisDikenal_(authT, segar, reset);   // tidak menulis kalau tidak berubah

    if (yandal) {   // v0.63.0: tahap 1 YANDAL tidak membuat token (dibuat mulaiShiftYandal)
      auditLog_(profil, 'LOGIN_PILIH_PETUGAS', yandal.info.shift.kunci, d.perangkat || '', platform, logT);
      w('tulis');
      return;
    }
    var sekarang = new Date();
    tulisTokenPerangkat_(perangkatT, profil, d.installId, platform, hashToken, sekarang,
                         sekarang.getTime() + c.TOKEN_TTL_HARI * 864e5);
    auditLog_(profil, 'LOGIN', '', d.perangkat || '', platform, logT);
    w('tulis');
  });
  if (d.installId) {   // v0.62.4
    var pasangan = pasanganPerangkat_(username, d.installId);
    tambahIndeksKenal_(pasangan);
    CacheService.getScriptCache().remove(kunciGagalPerangkat_(pasangan));
  }
  if (!kenal) hapusGagalLogin_(username);   // HP dikenal tidak menghapus hitungan ember HP asing
  var hasil;
  if (yandal) {
    hasil = { tahap: 'PILIH_PETUGAS', tiket: simpanTiketYandal_(profil, d, platform, yandal.info.shift), yandal: yandal.info };
  } else {
    pasangSesiBaru_(profil, hashToken, null);
    hasil = { token: token, profil: profil, menu: menu, offlineSampai: offlineSampai_(new Date()) };
  }
  if (c.ENV === 'staging') hasil._waktu = w.ringkas();   // rincian ms, hanya staging
  return hasil;
}

/**
 * Tulis token baru di auth_Perangkat (WAJIB di dalam lock, perangkatT dibaca di lock yang sama).
 * Login ulang di HP yang sama: token lama user ini di instalasi yang sama dicabut (keputusan 2 Okt 2026).
 * Mengisi profil.deviceId. kedaluwarsaMs = batas token (v0.63.0: akun YANDAL = akhir shift).
 */
function tulisTokenPerangkat_(perangkatT, profil, installId, platform, hashToken, sekarang, kedaluwarsaMs) {
  tokenLamaDicabut_(perangkatT.rows, profil.userId, installId).forEach(function (r) {
    ubahBarisDikenal_(perangkatT, r, { dicabut_pada: sekarang.toISOString() });
    hapusSesiCache_(r.token_hash);
  });
  profil.deviceId = uuid_();
  tambahBaris_(perangkatT, {
    device_id: profil.deviceId,
    user_id: profil.userId,
    install_id: installId || '',
    token_hash: hashToken,
    platform: platform,
    dibuat_pada: sekarang.toISOString(),
    terakhir_dipakai: sekarang.toISOString(),
    kedaluwarsa_pada: new Date(kedaluwarsaMs).toISOString(),
    dicabut_pada: ''
  });
}

/** Sesi langsung masuk cache + indeks token: panggilan pertama sesudah login tidak membaca sheet auth lagi. */
function pasangSesiBaru_(profil, hashToken, sampaiMs) {
  var sesiCache = JSON.parse(JSON.stringify(profil));
  sesiCache._tokenHash = hashToken;
  if (sampaiMs) sesiCache._sampai = sampaiMs;
  simpanSesiCache_(sesiCache);
  tambahIndeksToken_(hashToken);   // v0.62.3
}

function cariAuth_(rows, userId) {
  return rows.filter(function (r) { return String(r.user_id) === String(userId); })[0] || null;
}

function terkunci_(auth) {
  var t = keDate_(auth && auth.terkunci_sampai);
  return !!(t && t.getTime() > Date.now());
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
  var sampai = null;
  denganLock_(function () {
    var t = tabel_('AUTH_SHEET_ID', 'auth_Perangkat');
    var r = barisPerangkat_(t, sesi.deviceId);
    // v0.62.3 (audit 6 Okt 2026): sesi dari cache bisa saja sudah dicabut / kedaluwarsa di sheet (edit manual).
    // Dulu cekSesi tetap memperpanjang + menyegarkan cache. Sekarang ditolak dan cache sesi dihapus.
    var tolakSesi = function (kode, detail) { hapusSesiCache_(sesi._tokenHash); throw new SisiError_(kode, detail); };
    if (r.dicabut_pada) tolakSesi('SESI_DICABUT');
    var exp = keDate_(r.kedaluwarsa_pada);
    if (!exp || exp.getTime() <= Date.now()) tolakSesi('SESI_KEDALUWARSA');
    // v0.48: perpanjangan 30 hari tidak boleh melewati umur mutlak token (TOKEN_MAKS_HARI sejak login).
    var batas = batasMutlakToken_(r, c);
    if (!batas || batas <= Date.now()) tolakSesi('SESI_KEDALUWARSA', 'umur mutlak');
    // v0.63.0: token YANDAL berlaku sampai akhir shift saat token dibuat (07:59 / 15:59 / 23:59 WIB), tidak diperpanjang.
    // v0.63.4: sesudah itu mode sync (hanya kirim data + logout) sampai akhir shift + YAN_SYNC_JAM_.
    if (petugasYandal_(segar)) {
      sampai = akhirShiftToken_(r);
      if (!sampai || syncSampaiYandal_(sampai) <= sekarangMsYandal_()) tolakSesi('SHIFT_BERAKHIR');
      batas = Math.min(batas, syncSampaiYandal_(sampai));
    }
    ubahBarisDikenal_(t, r, {
      terakhir_dipakai: sekarangIso_(),
      kedaluwarsa_pada: new Date(Math.min(Date.now() + c.TOKEN_TTL_HARI * 864e5, batas)).toISOString()
    });
  });
  segar._tokenHash = sesi._tokenHash;
  if (sampai) segar._sampai = sampai;
  simpanSesiCache_(segar);
  var hasil = { profil: profilPublik_(segar), menu: menuUntuk_(segar, platform),
                offlineSampai: offlineSampai_(new Date()), waktuServer: sekarangIso_() };
  if (sampai) {
    hasil.sesiSampai = new Date(sampai).toISOString();
    hasil.offlineSampai = hasil.sesiSampai;
    hasil.syncSampai = new Date(syncSampaiYandal_(sampai)).toISOString();
    hasil.modeSync = sampai <= sekarangMsYandal_();
  }
  return hasil;
}

function logout_(sesi, data, platform) {
  // v0.39: alasan GPS_PALSU = paksa logout dari HP karena lokasi palsu terdeteksi saat sesi aktif.
  // v0.63.4: AKHIR_SHIFT = HP akun YANDAL keluar sendiri sesudah data shift terkirim (yan_Login Alasan Logout).
  var d = validasi_(data, { alasan: { tipe: 'pilihan', pilihan: ['GPS_PALSU', 'AKHIR_SHIFT'] } });
  if (d.alasan === 'AKHIR_SHIFT' && !petugasYandal_(sesi)) throw new SisiError_('PILIHAN_TIDAK_VALID', 'alasan');   // v0.64.1
  denganLock_(function () {
    var t = tabel_('AUTH_SHEET_ID', 'auth_Perangkat');
    var r = barisPerangkat_(t, sesi.deviceId);
    var yan = petugasYandal_(sesi) ? siapkanLogoutYandal_(sesi.deviceId) : null;   // v0.63.0: baca dulu
    ubahBarisDikenal_(t, r, { dicabut_pada: sekarangIso_() });
    if (yan) yan(d.alasan || 'MANUAL');
    // v1.0.29: HP yang logout tidak menerima notifikasi akun ini lagi (YANDAL tetap: pengingat login shift berikutnya)
    if (!petugasYandal_(sesi)) matikanNotifInstall_(teksSel_(r.install_id));
  });
  hapusSesiCache_(sesi._tokenHash);
  buangIndeksKenal_();   // v0.62.4: HP yang logout kembali jadi HP asing sampai login sukses lagi
  var aksiLog = d.alasan === 'GPS_PALSU' ? 'LOGOUT_GPS_PALSU' : d.alasan === 'AKHIR_SHIFT' ? 'LOGOUT_AKHIR_SHIFT' : 'LOGOUT';
  auditLog_(sesi, aksiLog, '', d.alasan === 'GPS_PALSU' ? 'lokasi palsu terdeteksi saat sesi aktif' : '', platform);
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

/** v0.67.0: kunci cache hitungan salah password lama (ganti password) per user. */
function kunciGagalGanti_(userId) { return 'ganti-pw-gagal:' + sha256Hex_(String(userId)).slice(0, 32); }
var GANTI_PW_MAKS_GAGAL_ = 5;   // salah password lama 5x = ditolak 15 menit (cache), mencegah tebak password lewat sesi curian

/**
 * v0.67.0 (keputusan kvlar 9 Okt 2026): Ganti Password oleh pemilik akun (menu Pengaturan).
 * Password lama wajib benar; password baru minimal 10 karakter, beda dari lama dan dari username.
 * Akun tim YANDAL ditolak (dipakai bergantian tiap shift: ganti password lewat admin).
 * Sukses: sesi LAIN akun ini dicabut (sesi yang sedang dipakai tetap), kunci login dibuka, dicatat GANTI_PASSWORD.
 * Hash dihitung di luar lock (seperti login), lock hanya untuk baca ulang + tulis.
 */
function gantiPassword_(sesi, data, platform) {
  if (petugasYandal_(sesi)) throw new SisiError_('AKSES_DITOLAK', 'akun tim Yandal: lewat admin');
  var d = validasi_(data, {
    passwordLama: { tipe: 'teks', wajib: true, maks: 200, mentah: true },
    passwordBaru: { tipe: 'teks', wajib: true, maks: 200, mentah: true }
  });
  if (d.passwordBaru.length < 10) throw new SisiError_('PASSWORD_TERLALU_PENDEK', 'minimal 10');
  if (d.passwordBaru === d.passwordLama) throw new SisiError_('PASSWORD_SAMA');
  if (d.passwordBaru.trim().toLowerCase() === String(sesi.username || '').trim().toLowerCase()) throw new SisiError_('PASSWORD_LEMAH', 'sama username');
  var c = cfg_();
  var cache = CacheService.getScriptCache(), kunci = kunciGagalGanti_(sesi.userId);
  var gagal = Number(cache.get(kunci) || 0);
  if (gagal >= GANTI_PW_MAKS_GAGAL_) throw new SisiError_('TERLALU_SERING', 'ganti password');
  var auth = cariAuth_(tabel_('AUTH_SHEET_ID', 'auth_Password').rows, sesi.userId);
  if (!auth) throw new SisiError_('SESI_TIDAK_VALID');
  var cocok = samaAman_(hashPassword_(d.passwordLama, String(auth.salt), parseIterasi_(auth.hash_versi)), String(auth.password_hash));
  if (!cocok) {
    cache.put(kunci, String(gagal + 1), c.LOGIN_KUNCI_MENIT * 60);
    auditLog_(sesi, 'GANTI_PASSWORD_GAGAL', '', 'password lama salah', platform);
    throw new SisiError_('PASSWORD_LAMA_SALAH');
  }
  var salt = saltBaru_();
  var isi = {
    password_hash: hashPassword_(d.passwordBaru, salt, c.PBKDF2_ITERASI), salt: salt, hash_versi: versiHash_(c.PBKDF2_ITERASI),
    password_diubah_pada: sekarangIso_(), gagal_login: 0, terkunci_sampai: ''
  };
  var dicabut = denganLock_(function () {
    var authT = tabel_('AUTH_SHEET_ID', 'auth_Password');
    var segar = cariAuth_(authT.rows, sesi.userId);
    // password diganti di tempat lain di antara hash dan lock = tolak (fail closed)
    if (!segar || String(segar.password_hash) !== String(auth.password_hash) || String(segar.salt) !== String(auth.salt)) {
      throw new SisiError_('DATA_BERUBAH', 'password');
    }
    var perangkat = tabel_('AUTH_SHEET_ID', 'auth_Perangkat');
    var logT = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    ubahBarisDikenal_(authT, segar, isi);
    var lain = perangkat.rows.filter(function (r) {
      return String(r.user_id) === String(sesi.userId) && !r.dicabut_pada && String(r.device_id) !== String(sesi.deviceId);
    });
    lain.forEach(function (r) {
      ubahBarisDikenal_(perangkat, r, { dicabut_pada: sekarangIso_() });
      hapusSesiCache_(r.token_hash);
    });
    auditLog_(sesi, 'GANTI_PASSWORD', '', lain.length + ' sesi lain dicabut', platform, logT);
    return lain.length;
  });
  cache.remove(kunci);
  buangIndeksKenal_();   // HP yang sesinya dicabut tidak lagi dianggap dikenal
  return { diganti: true, sesiLainDicabut: dicabut };
}
