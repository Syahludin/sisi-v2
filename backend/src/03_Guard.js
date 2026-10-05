/**
 * Cek sesi + akses menu + platform. Gagal = throw (fail closed).
 * platform: 'MOBILE' (doPost dari HP) atau 'WEB' (rpc halaman web). Menu dengan kolom platform
 * MOBILE/WEB hanya boleh dipanggil dari platform itu; KEDUANYA dari mana saja; nilai lain = tolak.
 */
var GUARD_BATAS_UMUM_ = 90;   // panggilan per sesi per menit, semua endpoint bersesi
var GUARD_TOKEN_GAGAL_MENIT_ = 60;   // v0.47: token ditolak (semua penelepon) per menit sebelum sheet tidak dibaca lagi
var GUARD_TOLAK_DETIK_ = 300;        // v0.47: hash token yang sudah ditolak diingat 5 menit

function guard_(token, ep, platform, nama) {
  var sesi = sesiDariToken_(token);
  remSesi_(sesi, nama || '', ep.batasMenit);
  if (ep.menu) {
    var aturan = aturanAkses_();
    if (!platformCocok_(aturan.menu[ep.menu], platform)) throw new SisiError_('AKSES_DITOLAK', ep.menu + ':' + platform);
    var aksi = aksesUntuk_(sesi.role, sesi.jenisTim, ep.menu, aturan);
    if (!aksi) throw new SisiError_('AKSES_DITOLAK', ep.menu);
    if (ep.tulis && aksi !== 'UBAH') throw new SisiError_('AKSES_DITOLAK', ep.menu + ':UBAH');
  }
  return sesi;
}

/**
 * Rem frekuensi per sesi (v0.42): token sah yang dipakai berulang-ulang (skrip / HP bocor) tidak bisa
 * menghabiskan kuota Apps Script / Drive. Lewat batas = TERLALU_SERING, HP mencoba lagi di putaran berikutnya.
 * Hitungan per menit di CacheService (tidak atomik, cukup sebagai rem).
 */
function remSesi_(sesi, nama, batasEndpoint) {
  var h = String(sesi._tokenHash || sesi.userId || '').slice(0, 24);
  if (!h) return;
  var menit = Math.floor(Date.now() / 60000);
  var cache = CacheService.getScriptCache();
  var cek = function (kunci, batas) {
    var n = (Number(cache.get(kunci)) || 0) + 1;
    if (n > batas) throw new SisiError_('TERLALU_SERING', kunci);
    cache.put(kunci, String(n), 120);
  };
  cek('rem:' + h + ':' + menit, GUARD_BATAS_UMUM_);
  if (batasEndpoint) cek('rem:' + h + ':' + nama + ':' + menit, batasEndpoint);
}

/** Menu tidak ada / platform kosong / platform asing = false. */
function platformCocok_(menu, platform) {
  if (!menu) return false;
  if (platform !== 'MOBILE' && platform !== 'WEB') return false;
  return menu.platform === 'KEDUANYA' || menu.platform === platform;
}

function sesiDariToken_(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) throw new SisiError_('SESI_TIDAK_VALID');
  var hash = sha256Hex_(token);
  var cache = CacheService.getScriptCache();
  var epoch = cfg_().SESI_EPOCH;
  var tersimpan = cache.get('sesi:' + hash);
  if (tersimpan) {
    var s = JSON.parse(tersimpan);
    if (s._epoch === epoch) return s;   // cache dari sebelum ADMIN_bersihkanCache = baca ulang sheet
  }
  // v0.47 (audit 4 Okt 2026): token asal-asalan berformat benar dulu selalu membuat server membaca auth_Perangkat
  // penuh. Sekarang hash yang pernah ditolak dijawab dari cache, dan kalau token ditolak > batas per menit
  // (tanda serangan), pencarian token baru ditahan TERLALU_SERING (bukan SESI_*, supaya HP tidak logout sendiri).
  var tolak = cache.get('sesi-tolak:' + hash);
  if (tolak) throw new SisiError_(tolak);
  var kunciGagal = 'sesi-gagal:' + Math.floor(Date.now() / 60000);
  if ((Number(cache.get(kunciGagal)) || 0) >= GUARD_TOKEN_GAGAL_MENIT_) throw new SisiError_('TERLALU_SERING', 'token ditolak global');
  var gagal = function (kode) {
    cache.put('sesi-tolak:' + hash, kode, GUARD_TOLAK_DETIK_);
    cache.put(kunciGagal, String((Number(cache.get(kunciGagal)) || 0) + 1), 120);
    throw new SisiError_(kode);
  };

  var perangkat = tabel_('AUTH_SHEET_ID', 'auth_Perangkat').rows
    .filter(function (r) { return r.token_hash === hash; })[0];
  if (!perangkat) gagal('SESI_TIDAK_VALID');
  if (perangkat.dicabut_pada) gagal('SESI_DICABUT');
  var kedaluwarsa = keDate_(perangkat.kedaluwarsa_pada);
  if (!kedaluwarsa || kedaluwarsa.getTime() <= Date.now()) gagal('SESI_KEDALUWARSA');
  var mutlak = batasMutlakToken_(perangkat);   // v0.48: umur mutlak 90 hari sejak login
  if (!mutlak || mutlak <= Date.now()) gagal('SESI_KEDALUWARSA');

  var sesi = profilUser_(String(perangkat.user_id));
  sesi.deviceId = String(perangkat.device_id);
  sesi._tokenHash = hash;
  simpanSesiCache_(sesi);
  return sesi;
}

/** Satu-satunya tempat menulis cache sesi (selalu bertanda epoch). */
function simpanSesiCache_(sesi) {
  var c = cfg_();
  sesi._epoch = c.SESI_EPOCH;
  CacheService.getScriptCache().put('sesi:' + sesi._tokenHash, JSON.stringify(sesi), c.CACHE_DETIK);
}

/** Cabut token di cache juga (auth_Perangkat sudah ditandai dicabut_pada oleh pemanggil). */
function hapusSesiCache_(tokenHash) {
  if (tokenHash) CacheService.getScriptCache().remove('sesi:' + tokenHash);
}

/** usersSudahDibaca: baris db_Users yang sudah dibaca di eksekusi ini (login), supaya tidak baca 2x. */
function profilUser_(userId, usersSudahDibaca) {
  var user = (usersSudahDibaca || tabel_('MASTER_SHEET_ID', 'db_Users').rows)
    .filter(function (r) { return String(r.user_id) === userId; })[0];
  if (!user || !isAktif_(user.aktif)) throw new SisiError_('AKUN_NONAKTIF');
  var role = String(user.role || '').trim();
  if (ROLE_VALID_().indexOf(role) === -1) throw new SisiError_('ROLE_TIDAK_VALID', role);

  var tim = null;
  if (user.tim_id) {
    tim = tabel_('MASTER_SHEET_ID', 'db_Tim').rows
      .filter(function (r) { return String(r.tim_id) === String(user.tim_id); })[0];
    if (!tim || !isAktif_(tim.aktif)) throw new SisiError_('TIM_NONAKTIF');
  } else if (role === 'PETUGAS') {
    throw new SisiError_('PETUGAS_TANPA_TIM');
  }
  return {
    userId: String(user.user_id),
    username: String(user.username).toLowerCase(),
    nama: String(user.nama || ''),
    role: role,
    timId: tim ? String(tim.tim_id) : '',
    timNama: tim ? String(tim.nama) : '',
    timKode: tim ? pad2_(tim.kode) : '',
    jenisTim: tim ? String(tim.jenis) : '',
    ulp: cfg_().ULP_NAMA
  };
}

/** Sesi tanpa field internal (awalan "_") untuk dikirim ke klien. */
function profilPublik_(sesi) {
  var o = {};
  Object.keys(sesi).forEach(function (k) { if (k.charAt(0) !== '_') o[k] = sesi[k]; });
  return o;
}

/** Baca db_Menu + db_Akses (di-cache CACHE_DETIK). */
function aturanAkses_() {
  var cache = CacheService.getScriptCache();
  var tersimpan = cache.get('akses:v1');
  if (tersimpan) return JSON.parse(tersimpan);
  var menu = {};
  tabel_('MASTER_SHEET_ID', 'db_Menu').rows.forEach(function (r) {
    if (!r.menu_kode) return;
    menu[String(r.menu_kode)] = {
      kode: String(r.menu_kode), nama: String(r.nama || ''), platform: String(r.platform || ''),
      khususSuper: isAktif_(r.khusus_super), urutan: Number(r.urutan) || 0, aktif: isAktif_(r.aktif)
    };
  });
  var akses = tabel_('MASTER_SHEET_ID', 'db_Akses').rows
    .filter(function (r) { return r.role && r.menu_kode; })
    .map(function (r) {
      return { role: String(r.role).trim(), jenisTim: String(r.jenis_tim || '').trim(),
               menu: String(r.menu_kode).trim(), aksi: String(r.aksi || '').trim().toUpperCase() };
    });
  var hasil = { menu: menu, akses: akses };
  cache.put('akses:v1', JSON.stringify(hasil), cfg_().CACHE_DETIK);
  return hasil;
}

/** Hasil: 'UBAH' | 'LIHAT' | null. Tanpa baris yang cocok = null (ditolak). */
function aksesUntuk_(role, jenisTim, menuKode, aturan) {
  aturan = aturan || aturanAkses_();
  var m = aturan.menu[menuKode];
  if (!m || !m.aktif) return null;
  if (m.khususSuper && role !== 'SUPER') return null;
  var terbaik = null;
  aturan.akses.forEach(function (a) {
    if (a.role !== role) return;
    if (a.jenisTim !== '*' && a.jenisTim !== jenisTim) return;
    if (a.menu !== '*' && a.menu !== menuKode) return;
    if (a.aksi === 'UBAH') terbaik = 'UBAH';
    else if (a.aksi === 'LIHAT' && !terbaik) terbaik = 'LIHAT';
  });
  return terbaik;
}

function menuUntuk_(sesi, platform, aturan) {
  aturan = aturan || aturanAkses_();
  return Object.keys(aturan.menu)
    .map(function (k) { return aturan.menu[k]; })
    .filter(function (m) { return m.aktif && platformCocok_(m, platform); })
    .map(function (m) {
      return { kode: m.kode, nama: m.nama, urutan: m.urutan,
               aksi: aksesUntuk_(sesi.role, sesi.jenisTim, m.kode, aturan) };
    })
    .filter(function (m) { return m.aksi; })
    .sort(function (a, b) { return a.urutan - b.urutan; });
}
