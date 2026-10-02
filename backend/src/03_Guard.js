/** Cek sesi + akses menu. Gagal = throw (fail closed). */
function guard_(token, ep) {
  var sesi = sesiDariToken_(token);
  if (ep.menu) {
    var aksi = aksesUntuk_(sesi.role, sesi.jenisTim, ep.menu);
    if (!aksi) throw new SisiError_('AKSES_DITOLAK', ep.menu);
    if (ep.tulis && aksi !== 'UBAH') throw new SisiError_('AKSES_DITOLAK', ep.menu + ':UBAH');
  }
  return sesi;
}

function sesiDariToken_(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) throw new SisiError_('SESI_TIDAK_VALID');
  var hash = sha256Hex_(token);
  var cache = CacheService.getScriptCache();
  var tersimpan = cache.get('sesi:' + hash);
  if (tersimpan) return JSON.parse(tersimpan);

  var perangkat = tabel_('AUTH_SHEET_ID', 'auth_Perangkat').rows
    .filter(function (r) { return r.token_hash === hash; })[0];
  if (!perangkat) throw new SisiError_('SESI_TIDAK_VALID');
  if (perangkat.dicabut_pada) throw new SisiError_('SESI_DICABUT');
  var kedaluwarsa = keDate_(perangkat.kedaluwarsa_pada);
  if (!kedaluwarsa || kedaluwarsa.getTime() <= Date.now()) throw new SisiError_('SESI_KEDALUWARSA');

  var sesi = profilUser_(String(perangkat.user_id));
  sesi.deviceId = String(perangkat.device_id);
  sesi._tokenHash = hash;
  cache.put('sesi:' + hash, JSON.stringify(sesi), cfg_().CACHE_DETIK);
  return sesi;
}

function profilUser_(userId) {
  var user = tabel_('MASTER_SHEET_ID', 'db_Users').rows
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
    .filter(function (m) { return m.aktif && (m.platform === 'KEDUANYA' || m.platform === platform); })
    .map(function (m) {
      return { kode: m.kode, nama: m.nama, urutan: m.urutan,
               aksi: aksesUntuk_(sesi.role, sesi.jenisTim, m.kode, aturan) };
    })
    .filter(function (m) { return m.aksi; })
    .sort(function (a, b) { return a.urutan - b.urutan; });
}
