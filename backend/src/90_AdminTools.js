/**
 * Alat admin. Jalankan dari editor Apps Script oleh pemilik (ADMIN_EMAIL).
 * Fungsi ini publik supaya muncul di menu Run, jadi WAJIB dicek pemiliknya.
 */
function pastikanPemilik_() {
  var email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email || email !== cfg_().ADMIN_EMAIL) throw new SisiError_('KHUSUS_PEMILIK');
}

/** Header resmi tiap sheet (satu sumber untuk cek konfigurasi & test). */
function skemaHeader_() {
  return {
    MASTER_SHEET_ID: {
      db_Tim: ['tim_id', 'jenis', 'nama', 'kode', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'],
      db_Users: ['user_id', 'username', 'nama', 'email', 'role', 'tim_id', 'aktif', 'revision', 'dibuat_pada', 'diubah_pada', 'diubah_oleh'],
      db_Jaringan: ['section_id', 'penyulang', 'section', 'parent_section_id', 'urutan', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'],
      db_Jenis_Pekerjaan: ['jenis_id', 'modul', 'nama', 'satuan', 'diameter_min', 'diameter_max', 'urutan', 'aktif'],
      db_Menu: ['menu_kode', 'nama', 'platform', 'khusus_super', 'urutan', 'aktif'],
      db_Akses: ['role', 'jenis_tim', 'menu_kode', 'aksi']
    },
    AUTH_SHEET_ID: {
      auth_Password: ['user_id', 'password_hash', 'salt', 'hash_versi', 'password_diubah_pada', 'gagal_login', 'terkunci_sampai'],
      auth_Perangkat: ['device_id', 'user_id', 'install_id', 'token_hash', 'platform', 'dibuat_pada', 'terakhir_dipakai', 'kedaluwarsa_pada', 'dicabut_pada'],
      log_Audit: ['waktu', 'user_id', 'username', 'role', 'aksi', 'target', 'detail', 'platform', 'device_id']
    },
    // Struktur kolom lama dipertahankan (PRD 4. Fitur > Data ROW). Kolom bernama lama = turunan/input,
    // kolom snake_case = teknis. Kode hanya memakai kolom *_id untuk relasi.
    ROW_SHEET_ID: {
      row_Header: ['No', 'Kode Header', 'ULP', 'Hari', 'Tanggal', 'Tim', 'Sub-Tim', 'Koordinat Awal', 'Koordinat Akhir',
        'KM Awal', 'KM Akhir', 'Kendala', 'WA Text', 'TimeStamp', 'Input By', 'TimeStamp Update',
        'header_id', 'tim_id', 'status', 'revision', 'dibuat_oleh', 'waktu_perangkat', 'diubah_oleh'],
      row_Realisasi: ['No', 'Kode Header', 'Kode Pekerjaan', 'Hari', 'Tanggal', 'Tim', 'Penyulang', 'Section',
        'Rabas', 'Sedang', 'Besar', 'Input Oleh', 'Timestamp', 'Timestamp Update',
        'realisasi_id', 'header_id', 'status', 'revision', 'dibuat_oleh', 'waktu_perangkat', 'diubah_oleh'],
      row_Eksekusi: ['No', 'Kode Header', 'Kode Pekerjaan', 'Kode Eksekusi', 'ULP', 'Hari', 'Tanggal', 'Tim',
        'Penyulang', 'Section', 'Nomor Tiang', 'Koordinat Tiang', 'Lat Tiang', 'Long Tiang', 'Koordinat Pekerjaan',
        'Lat Pekerjaan', 'Long Pekerjaan', 'Foto Sebelum', 'Foto Sebelum URL', 'Foto Pekerjaan', 'Foto Pekerjaan URL',
        'Foto Sesudah', 'Foto Sesudah URL', 'Diameter', 'Jenis Pekerjaan', 'Input Oleh', 'Timestamp', 'Timestamp Update',
        'eksekusi_id', 'realisasi_id', 'section_id', 'jenis_id', 'foto_lengkap', 'sumber', 'temuan_id',
        'status', 'revision', 'dibuat_oleh', 'waktu_perangkat', 'diubah_oleh'],
      row_Foto: ['foto_id', 'eksekusi_id', 'slot', 'drive_file_id', 'sha256', 'ukuran_byte', 'mime', 'sumber_foto',
        'diambil_pada', 'lat', 'lng', 'akurasi_m', 'Timestamp', 'Timestamp Update',
        'status', 'revision', 'dibuat_oleh', 'waktu_perangkat', 'diubah_oleh']
    }
  };
}

/**
 * Cari UUID tim dari isian tim_id di db_Users: UUID tim, nama tim, atau kode 2 digit.
 * Hasil: { id } kalau tepat satu cocok, { masalah: 'TIDAK_DITEMUKAN' | 'AMBIGU' } kalau tidak.
 */
function cariTimId_(nilai, daftarTim) {
  var v = String(nilai).trim();
  var aktif = daftarTim.filter(function (t) { return t.tim_id; });
  var persis = aktif.filter(function (t) { return String(t.tim_id) === v; });
  if (persis.length === 1) return { id: String(persis[0].tim_id) };
  var kecil = v.toLowerCase();
  var kode = /^\d{1,2}$/.test(v) ? pad2_(v) : null;
  var cocok = aktif.filter(function (t) {
    return String(t.nama).trim().toLowerCase() === kecil || (kode !== null && pad2_(t.kode) === kode);
  });
  if (cocok.length === 1) return { id: String(cocok[0].tim_id) };
  return { masalah: cocok.length ? 'AMBIGU' : 'TIDAK_DITEMUKAN' };
}

/**
 * Cari UUID section induk: UUID langsung, atau nama section di penyulang yang sama (tanpa beda huruf besar/kecil).
 * Hasil: { id } atau { masalah: 'TIDAK_DITEMUKAN' | 'AMBIGU' }.
 */
function cariSectionId_(nilai, penyulang, daftar) {
  var v = String(nilai).trim();
  var persis = daftar.filter(function (r) { return r.section_id && String(r.section_id) === v; });
  if (persis.length === 1) return { id: String(persis[0].section_id) };
  var p = String(penyulang).trim().toLowerCase(), kecil = v.toLowerCase();
  var cocok = daftar.filter(function (r) {
    return r.section_id && String(r.penyulang).trim().toLowerCase() === p && String(r.section).trim().toLowerCase() === kecil;
  });
  if (cocok.length === 1) return { id: String(cocok[0].section_id) };
  return { masalah: cocok.length ? 'AMBIGU' : 'TIDAK_DITEMUKAN' };
}

/** section_id yang induknya melingkar (A -> B -> A). Topologi harus berupa pohon. */
function sectionBersiklus_(daftar) {
  var induk = {};
  daftar.forEach(function (r) { if (r.section_id) induk[String(r.section_id)] = r.parent_section_id ? String(r.parent_section_id) : ''; });
  return Object.keys(induk).filter(function (id) {
    var lihat = {}, kini = id;
    while (kini) {
      if (lihat[kini]) return kini === id;
      lihat[kini] = true;
      kini = induk[kini] || '';
    }
    return false;
  });
}

/** Cek Script Properties + semua header sheet. Lihat hasilnya di Execution log. */
function ADMIN_cekKonfigurasi() {
  pastikanPemilik_();
  var c = cfg_();
  console.log('ENV = ' + c.ENV + ', KODE_ULP = ' + c.KODE_ULP);
  var skema = skemaHeader_(), masalah = 0;
  Object.keys(skema).forEach(function (idKey) {
    if (idKey === 'ROW_SHEET_ID' && !c.ROW_SHEET_ID) { console.log('ROW_SHEET_ID kosong, cek SiSi_ROW dilewati'); return; }
    Object.keys(skema[idKey]).forEach(function (nama) {
      try {
        var t = tabel_(idKey, nama);
        var kurang = skema[idKey][nama].filter(function (h) { return t.header.indexOf(h) === -1; });
        if (kurang.length) { masalah++; console.warn(nama + ': kolom kurang -> ' + kurang.join(', ')); }
        else console.log(nama + ': OK (' + t.rows.length + ' baris)');
      } catch (e) { masalah++; console.error(nama + ': ' + (e.kode || e.message)); }
    });
  });
  console.log(masalah ? 'SELESAI dengan ' + masalah + ' masalah' : 'SEMUA OK');
}

/**
 * Lengkapi baris master yang diisi manual: ID UUID, revision, waktu, pengubah.
 * Juga cek username ganda dan parent_section_id yang tidak ada.
 */
function ADMIN_lengkapiMaster() {
  pastikanPemilik_();
  var target = { db_Tim: 'tim_id', db_Users: 'user_id', db_Jaringan: 'section_id', db_Jenis_Pekerjaan: 'jenis_id' };
  denganLock_(function () {
    Object.keys(target).forEach(function (nama) {
      var t = tabel_('MASTER_SHEET_ID', nama), kolomId = target[nama], diisi = 0;
      var tulis = function (r, kolom, nilai) {
        var idx = t.header.indexOf(kolom);
        if (idx !== -1 && (r[kolom] === '' || r[kolom] === null || r[kolom] === undefined)) {
          t.sheet.getRange(r._baris, idx + 1).setValue(nilai);
          r[kolom] = nilai;
          return true;
        }
        return false;
      };
      t.rows.forEach(function (r) {
        var ubah = tulis(r, kolomId, uuid_());
        ubah = tulis(r, 'revision', 1) || ubah;
        ubah = tulis(r, 'dibuat_pada', sekarangIso_()) || ubah;
        ubah = tulis(r, 'diubah_pada', sekarangIso_()) || ubah;
        ubah = tulis(r, 'diubah_oleh', 'admin-tools') || ubah;
        ubah = tulis(r, 'aktif', 'TRUE') || ubah;
        if (ubah) diisi++;
      });
      if (nama === 'db_Tim') {
        var idxKode = t.header.indexOf('kode');
        t.rows.forEach(function (r) {
          var cell = t.sheet.getRange(r._baris, idxKode + 1);
          cell.setNumberFormat('@').setValue(pad2_(r.kode));
        });
      }
      if (nama === 'db_Users') {
        // tim_id boleh diketik sebagai nama tim ("ROW 01") atau kode ("01"); diganti jadi UUID tim.
        var daftarTim = tabel_('MASTER_SHEET_ID', 'db_Tim').rows;
        var idxTim = t.header.indexOf('tim_id');
        t.rows.forEach(function (r) {
          var v = r.tim_id;
          if (v === '' || v === null || v === undefined) {
            if (String(r.role).trim().toUpperCase() === 'PETUGAS') console.warn('db_Users baris ' + r._baris + ': PETUGAS tanpa tim_id');
            return;
          }
          var hasil = cariTimId_(v, daftarTim);
          if (hasil.id && hasil.id !== String(v)) {
            t.sheet.getRange(r._baris, idxTim + 1).setValue(hasil.id);
            console.log('db_Users baris ' + r._baris + ': tim "' + v + '" -> ' + hasil.id);
          } else if (hasil.masalah) {
            console.warn('db_Users baris ' + r._baris + ': tim "' + v + '" ' + hasil.masalah + ', tidak diubah');
          }
        });
        var lihat = {};
        t.rows.forEach(function (r) {
          var u = String(r.username || '').trim().toLowerCase();
          if (!u) return console.warn('db_Users baris ' + r._baris + ': username kosong');
          if (/\s/.test(u)) console.warn('db_Users baris ' + r._baris + ': username mengandung spasi');
          if (lihat[u]) console.warn('db_Users: username ganda "' + u + '" (baris ' + lihat[u] + ' & ' + r._baris + ')');
          lihat[u] = r._baris;
        });
      }
      if (nama === 'db_Jaringan') {
        // parent_section_id boleh diketik nama section induk (di penyulang yang sama); diganti jadi UUID.
        var idxParent = t.header.indexOf('parent_section_id');
        var namaGanda = {};
        t.rows.forEach(function (r) {
          var k = String(r.penyulang).trim().toLowerCase() + '|' + String(r.section).trim().toLowerCase();
          if (namaGanda[k]) console.warn('db_Jaringan: section "' + r.section + '" ganda di penyulang "' + r.penyulang + '" (baris ' + namaGanda[k] + ' & ' + r._baris + ')');
          namaGanda[k] = r._baris;
        });
        t.rows.forEach(function (r) {
          var v = r.parent_section_id;
          if (v === '' || v === null || v === undefined) return;
          var hasil = cariSectionId_(v, r.penyulang, t.rows);
          if (hasil.id === String(r.section_id)) {
            console.warn('db_Jaringan baris ' + r._baris + ': section tidak boleh jadi induk dirinya sendiri');
          } else if (hasil.id && hasil.id !== String(v)) {
            t.sheet.getRange(r._baris, idxParent + 1).setValue(hasil.id);
            r.parent_section_id = hasil.id;
            console.log('db_Jaringan baris ' + r._baris + ': induk "' + v + '" -> ' + hasil.id);
          } else if (hasil.masalah) {
            console.warn('db_Jaringan baris ' + r._baris + ': induk "' + v + '" ' + hasil.masalah + ', tidak diubah');
          }
        });
        sectionBersiklus_(t.rows).forEach(function (id) {
          console.warn('db_Jaringan: section ' + id + ' ada di topologi melingkar (induk saling menunjuk)');
        });
      }
      console.log(nama + ': ' + diisi + ' baris dilengkapi');
    });
  });
  CacheService.getScriptCache().remove('akses:v1');
}

/**
 * Set/ganti password. Caranya:
 * 1. Isi Script Properties SETPW_USERNAME dan SETPW_PASSWORD (min 10 karakter)
 * 2. Jalankan fungsi ini. Kedua property otomatis DIHAPUS, semua sesi user itu DICABUT.
 */
function ADMIN_setPassword() {
  pastikanPemilik_();
  var props = PropertiesService.getScriptProperties();
  var username = String(props.getProperty('SETPW_USERNAME') || '').trim().toLowerCase();
  var password = String(props.getProperty('SETPW_PASSWORD') || '');
  try {
    if (!username) throw new SisiError_('FIELD_WAJIB', 'SETPW_USERNAME');
    if (password.length < 10) throw new SisiError_('PASSWORD_TERLALU_PENDEK', 'min 10 karakter');
    var c = cfg_();
    denganLock_(function () {
      var user = tabel_('MASTER_SHEET_ID', 'db_Users').rows
        .filter(function (r) { return String(r.username).trim().toLowerCase() === username; })[0];
      if (!user || !user.user_id) throw new SisiError_('USER_TIDAK_ADA', username + ' (jalankan ADMIN_lengkapiMaster dulu?)');
      var salt = saltBaru_();
      var isi = {
        password_hash: hashPassword_(password, salt, c.PBKDF2_ITERASI), salt: salt,
        hash_versi: versiHash_(c.PBKDF2_ITERASI), password_diubah_pada: sekarangIso_(),
        gagal_login: 0, terkunci_sampai: ''
      };
      var authT = tabel_('AUTH_SHEET_ID', 'auth_Password');
      var ada = authT.rows.some(function (r) { return String(r.user_id) === String(user.user_id); });
      if (ada) ubahBaris_(authT, 'user_id', user.user_id, isi);
      else { isi.user_id = String(user.user_id); tambahBaris_(authT, isi); }

      var perangkat = tabel_('AUTH_SHEET_ID', 'auth_Perangkat');
      perangkat.rows.forEach(function (r) {
        if (String(r.user_id) === String(user.user_id) && !r.dicabut_pada) {
          ubahBaris_(perangkat, 'device_id', r.device_id, { dicabut_pada: sekarangIso_() });
        }
      });
    });
    console.log('Password ' + username + ' diset. Semua sesi lama dicabut.');
  } finally {
    props.deleteProperty('SETPW_USERNAME');
    props.deleteProperty('SETPW_PASSWORD');
  }
}

/** Paksa aturan akses dibaca ulang (setelah edit db_Menu/db_Akses). */
function ADMIN_bersihkanCache() {
  pastikanPemilik_();
  CacheService.getScriptCache().remove('akses:v1');
  console.log('Cache akses dibersihkan.');
}
