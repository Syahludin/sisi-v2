/**
 * Cek sesi + akses menu + platform. Gagal = throw (fail closed).
 * platform: 'MOBILE' (doPost dari HP) atau 'WEB' (rpc halaman web). Menu dengan kolom platform
 * MOBILE/WEB hanya boleh dipanggil dari platform itu; KEDUANYA dari mana saja; nilai lain = tolak.
 */
var GUARD_BATAS_UMUM_ = 90;   // panggilan per sesi per menit, semua endpoint bersesi
var GUARD_TOKEN_GAGAL_MENIT_ = 60;   // v0.47: rem global token ditolak; sejak v0.62.3 hanya cadangan kalau indeks token terlalu besar
var GUARD_PROFIL_TOLAK_ = ['AKUN_NONAKTIF', 'TIM_NONAKTIF', 'ROLE_TIDAK_VALID', 'PETUGAS_TANPA_TIM'];   // v0.86.0-fix2
var GUARD_TOLAK_DETIK_ = 300;        // v0.47: hash token yang sudah ditolak diingat 5 menit

function guard_(token, ep, platform, nama) {
  var sesi = sesiDariToken_(token);
  // v0.63.4: sesudah akhir shift akun YANDAL hanya boleh endpoint syncShift (kirim data + logout), sampai syncSampai.
  if (sesi._sampai && sesi._sampai <= sekarangMsYandal_()) {
    if (!ep.syncShift) throw new SisiError_('SHIFT_BERAKHIR');
    sesi.modeSync = true;
  }
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
  var s = null;
  if (tersimpan) {
    // v0.86.0-fix2 (audit guard 13 Okt 2026): cache korup = dibuang lalu baca ulang dari sheet (fail closed), bukan KESALAHAN_SERVER.
    try { s = JSON.parse(tersimpan); } catch (eJ) { s = null; cache.remove('sesi:' + hash); }
  }
  if (s && typeof s === 'object') {
    if (s._epoch === epoch) {   // cache dari sebelum ADMIN_bersihkanCache = baca ulang sheet
      // v0.63.0: token YANDAL habis di akhir shift, walau sesi masih di cache. v0.63.4: sampai akhir mode sync
      // (akhir shift + YAN_SYNC_JAM_); antara akhir shift dan itu guard_ hanya meloloskan endpoint syncShift.
      if (s._sampai && syncSampaiYandal_(s._sampai) <= sekarangMsYandal_()) throw new SisiError_('SHIFT_BERAKHIR');
      return s;
    }
  }
  // v0.47 (audit 4 Okt 2026): hash yang pernah ditolak dijawab dari cache.
  // v0.86.0-fix2: nilai = kode@epoch. ADMIN_bersihkanCache (epoch naik) membuat penolakan lama diabaikan, jadi akun yang
  // diaktifkan lagi admin bisa langsung masuk. Nilai lama tanpa "@" tetap dibaca sebagai kode saja.
  var tolak = cache.get('sesi-tolak:' + hash);
  if (tolak) {
    var pt = String(tolak).split('@');
    if (pt.length === 1 || pt[1] === epoch) throw new SisiError_(pt[0]);
  }
  var kunciGagal = 'sesi-gagal:' + Math.floor(Date.now() / 60000);
  var gagal = function (kode) {
    cache.put('sesi-tolak:' + hash, kode + '@' + epoch, GUARD_TOLAK_DETIK_);
    cache.put(kunciGagal, String((Number(cache.get(kunciGagal)) || 0) + 1), 120);
    throw new SisiError_(kode);
  };

  // v0.62.3: indeks token (awalan hash semua baris auth_Perangkat) di cache. Dulu rem global "60 token ditolak / menit"
  // membuat 1 request/detik dari internet memblokir SEMUA petugas yang cache sesinya habis. Sekarang token asing
  // ditolak dari indeks tanpa baca sheet, jadi rem global itu tidak perlu lagi (hanya dipakai kalau indeks terlalu besar).
  var awalan = awalanToken_(hash);
  var rowsDibaca = null, dibangun = false;
  var indeks = bacaIndeksToken_(cache);
  if (!indeks || (!indeks.besar && indeks.h.indexOf(awalan) === -1 && Date.now() - indeks.t >= INDEKS_TOKEN_SEGAR_MS_)) {
    // v0.62.6 (audit 7 Okt 2026): banyak token asing bersamaan = jangan semuanya membaca auth_Perangkat. Selama satu
    // jalan sedang membangun (penanda 20 detik), yang lain memakai indeks lama: token tidak ada = TERLALU_SERING.
    if (indeks && cache.get(INDEKS_TOKEN_KUNCI_ + ':bangun')) throw new SisiError_('TERLALU_SERING', 'indeks token sedang dibangun');
    cache.put(INDEKS_TOKEN_KUNCI_ + ':bangun', '1', 20);
    var b;
    try { b = bangunIndeksToken_(cache); } finally { cache.remove(INDEKS_TOKEN_KUNCI_ + ':bangun'); }   // maks 1x per INDEKS_TOKEN_SEGAR_MS_ untuk token asing
    indeks = b.indeks; rowsDibaca = b.rows; dibangun = true;
  }
  if (indeks.besar) {
    // cadangan (indeks melebihi batas cache): perilaku v0.47
    if (!rowsDibaca && (Number(cache.get(kunciGagal)) || 0) >= GUARD_TOKEN_GAGAL_MENIT_) throw new SisiError_('TERLALU_SERING', 'token ditolak global');
  } else if (indeks.h.indexOf(awalan) === -1) {
    // Indeks baru dibangun = pasti tidak ada. Indeks lebih tua: bisa saja login baru belum masuk (cache tidak atomik),
    // jadi jawab TERLALU_SERING (HP mencoba lagi, tidak logout); indeks dibangun ulang paling lambat 1 menit lagi.
    if (dibangun) gagal('SESI_TIDAK_VALID');
    throw new SisiError_('TERLALU_SERING', 'token belum ada di indeks');
  }

  var perangkat = (rowsDibaca || tabel_('AUTH_SHEET_ID', 'auth_Perangkat').rows)
    .filter(function (r) { return r.token_hash === hash; })[0];
  if (!perangkat) gagal('SESI_TIDAK_VALID');
  if (perangkat.dicabut_pada) gagal('SESI_DICABUT');
  var kedaluwarsa = keDate_(perangkat.kedaluwarsa_pada);
  if (!kedaluwarsa || kedaluwarsa.getTime() <= Date.now()) gagal('SESI_KEDALUWARSA');
  var mutlak = batasMutlakToken_(perangkat);   // v0.48: umur mutlak 90 hari sejak login
  if (!mutlak || mutlak <= Date.now()) gagal('SESI_KEDALUWARSA');

  // v0.86.0-fix2 (audit guard 13 Okt 2026, temuan 1): akun / tim nonaktif, role rusak, PETUGAS tanpa tim = token ditolak
  // dan DIINGAT 5 menit. Dulu tiap request membaca ulang auth_Perangkat + db_Users + db_Tim tanpa rem (kuota habis).
  var sesi;
  try { sesi = profilUser_(String(perangkat.user_id)); } catch (eP) {
    if (eP && GUARD_PROFIL_TOLAK_.indexOf(eP.kode) !== -1) {
      cache.put('sesi-tolak:' + hash, eP.kode + '@' + epoch, GUARD_TOLAK_DETIK_);
    }
    throw eP;
  }
  sesi.deviceId = String(perangkat.device_id);
  sesi._tokenHash = hash;
  if (petugasYandal_(sesi)) {   // v0.63.0
    var sampai = akhirShiftToken_(perangkat);
    if (!sampai || syncSampaiYandal_(sampai) <= sekarangMsYandal_()) gagal('SHIFT_BERAKHIR');
    sesi._sampai = sampai;
  }
  simpanSesiCache_(sesi);
  return sesi;
}

var INDEKS_TOKEN_KUNCI_ = 'token-sah:v1';
var INDEKS_TOKEN_SEGAR_MS_ = 60000;     // token tidak dikenal boleh memicu bangun ulang indeks maks 1x per menit
var INDEKS_TOKEN_MAKS_BYTE_ = 90000;    // batas nilai CacheService 100 KB
var INDEKS_TOKEN_SIMPAN_HARI_ = 120;    // baris lebih tua dari umur mutlak token (90 hari) + 30 hari tidak diindeks

/** 16 hex awal hash token (64 bit): cukup untuk menyaring token asing; kecocokan penuh tetap dicek ke sheet. */
function awalanToken_(hash) { return String(hash || '').slice(0, 16); }

/** Indeks dari cache. Epoch beda (ADMIN_bersihkanCache) / rusak = null. */
function bacaIndeksToken_(cache) {
  var ada = cache.get(INDEKS_TOKEN_KUNCI_);
  if (!ada) return null;
  try {
    var x = JSON.parse(ada);
    if (!x || x.e !== cfg_().SESI_EPOCH || !(x.t > 0) || (!x.besar && !Array.isArray(x.h))) return null;
    return x;
  } catch (e) { return null; }
}

/** Baca auth_Perangkat sekali, simpan awalan hash ke cache. Hasil { indeks, rows } (rows dipakai ulang pemanggil). */
function bangunIndeksToken_(cache) {
  var c = cfg_();
  var rows = tabel_('AUTH_SHEET_ID', 'auth_Perangkat').rows;
  var batas = Date.now() - INDEKS_TOKEN_SIMPAN_HARI_ * 864e5;
  var h = [];
  rows.forEach(function (r) {
    if (!r.token_hash) return;
    var d = keDate_(r.dibuat_pada);
    if (d && d.getTime() < batas) return;   // pasti ditolak umur mutlak
    var a = awalanToken_(r.token_hash);
    if (h.indexOf(a) === -1) h.push(a);
  });
  var indeks = { t: Date.now(), e: c.SESI_EPOCH, h: h };
  var teks = JSON.stringify(indeks);
  if (teks.length > INDEKS_TOKEN_MAKS_BYTE_) {
    console.warn('Indeks token ' + teks.length + ' byte > batas: guard memakai rem global lama. Arsipkan baris auth_Perangkat lama.');
    indeks = { t: Date.now(), e: c.SESI_EPOCH, besar: true };
    teks = JSON.stringify(indeks);
  }
  cache.put(INDEKS_TOKEN_KUNCI_, teks, c.CACHE_DETIK);
  return { indeks: indeks, rows: rows };
}

/** Login: token baru langsung masuk indeks yang ada di cache (kalau belum ada indeks, dibangun saat dibutuhkan). */
function tambahIndeksToken_(hash) {
  var cache = CacheService.getScriptCache();
  var x = bacaIndeksToken_(cache);
  if (!x || x.besar) return;
  var a = awalanToken_(hash);
  if (x.h.indexOf(a) !== -1) return;
  x.h.push(a);
  cache.put(INDEKS_TOKEN_KUNCI_, JSON.stringify(x), cfg_().CACHE_DETIK);
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
    // v0.93.1 (temuan review 14 Okt 2026): jenis tim dinormalkan (trim + huruf besar), sama dengan ADMIN_cekKonfigurasi.
    // Dulu "Hartek" lolos cek tapi ditolak guard (perbandingan persis 'HARTEK'). Berlaku semua modul (ROW / YANDAL / HARTEK).
    jenisTim: tim ? String(tim.jenis || '').trim().toUpperCase() : '',
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
  if (tersimpan) {
    try { var ada = JSON.parse(tersimpan); if (ada && ada.menu && Array.isArray(ada.akses)) return ada; } catch (eA) { /* korup: baca ulang sheet */ }
    cache.remove('akses:v1');
  }
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
      return { role: String(r.role).trim(), jenisTim: String(r.jenis_tim || '').trim().toUpperCase(),   // v0.93.1: '*' tetap '*'
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
