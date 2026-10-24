/**
 * Alat admin. Jalankan dari editor Apps Script oleh pemilik (ADMIN_EMAIL).
 * Fungsi ini publik supaya muncul di menu Run, jadi WAJIB dicek pemiliknya.
 */
function pastikanPemilik_() {
  // v0.62.5 (review ulang 7 Okt 2026): fallback getEffectiveUser dari v0.62.4 DICABUT. Web app ini "execute as me" +
  // akses anonim: untuk pemanggil anonim getActiveUser kosong dan getEffectiveUser = PEMILIK, jadi fallback itu membuat
  // semua ADMIN_* bisa dipanggil siapa saja begitu ada halaman HtmlService (google.script.run). Wajib active user.
  // Pemicu waktu yang dipasang pemilik tetap jalan karena berjalan dengan otorisasi pemilik (email tersedia).
  var email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email || email !== cfg_().ADMIN_EMAIL) throw new SisiError_('KHUSUS_PEMILIK');
}

/** Header resmi tiap sheet (satu sumber untuk cek konfigurasi & test). */
function skemaHeader_() {
  return {
    MASTER_SHEET_ID: {
      db_Tim: ['tim_id', 'jenis', 'nama', 'kode', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'],
      db_Users: ['user_id', 'username', 'nama', 'email', 'role', 'tim_id', 'aktif', 'revision', 'dibuat_pada', 'diubah_pada', 'diubah_oleh'],
      db_Jaringan: ['section_id', 'penyulang', 'section', 'parent_section_id', 'urutan', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'],
      // v0.64.3: + bobot (bobot P0 Yandal, wajib untuk modul YANDAL)
      // v0.94.0: + jenis_pekerjaan, kolom_gaspol (baris modul HARTEK, ditambah ADMIN_siapkanSheetHartek)
      db_Jenis_Pekerjaan: ['jenis_id', 'modul', 'nama', 'satuan', 'diameter_min', 'diameter_max', 'urutan', 'aktif', 'bobot', 'jenis_pekerjaan', 'kolom_gaspol'],
      db_Menu: ['menu_kode', 'nama', 'platform', 'khusus_super', 'urutan', 'aktif'],
      db_Akses: ['role', 'jenis_tim', 'menu_kode', 'aksi'],
      // v0.63.0: petugas Yandal (orang), tim_yandal = tim_id tim YANDAL. Diubah lewat menu Pindah Tim Petugas Yandal.
      db_Petugas: ['petugas_id', 'nama', 'tim_yandal', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'],
      // v0.67.0: pejabat penandatangan BA (Pemeriksa / Mengetahui). Dibuat ADMIN_siapkanSheetGardu.
      db_Pejabat_BA: DB_PEJABAT_BA_HEADER_.slice()
    },
    AUTH_SHEET_ID: {
      auth_Password: ['user_id', 'password_hash', 'salt', 'hash_versi', 'password_diubah_pada', 'gagal_login', 'terkunci_sampai'],
      auth_Perangkat: ['device_id', 'user_id', 'install_id', 'token_hash', 'platform', 'dibuat_pada', 'terakhir_dipakai', 'kedaluwarsa_pada', 'dicabut_pada'],
      log_Audit: ['waktu', 'user_id', 'username', 'role', 'aksi', 'target', 'detail', 'platform', 'device_id'],
      // v0.83.0: token notifikasi FCM per instalasi app (dibuat ADMIN_siapkanNotifikasi)
      auth_Notif: AUTH_NOTIF_HEADER_.slice()
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
    },
    // v0.51 (keputusan kvlar 4 Okt 2026): spreadsheet terpisah SiSi_Laporan. Kolom baca di depan, teknis snake_case di belakang.
    LAPORAN_SHEET_ID: {
      // v0.55 (keputusan kvlar 5 Okt 2026): laporan harian dipisah per laporan, masing-masing induk C4A-nya.
      lap_Harian_UP3: ['No', 'Tanggal', 'Hari', 'ULP', 'Laporan UP3', 'Input Oleh', 'Timestamp', 'Timestamp Update',
        'lap_id', 'status', 'revision', 'dibuat_oleh', 'diubah_oleh'],
      lap_Harian_UIW: ['No', 'Tanggal', 'Hari', 'ULP', 'Cuaca', 'Tim ROW', 'Laporan UIW', 'Input Oleh', 'Timestamp',
        'Timestamp Update', 'lap_id', 'status', 'revision', 'dibuat_oleh', 'diubah_oleh'],
      // v0.52: C4A dipisah. UP3 = per penyulang, kmS diisi langsung. UIW (Care for Asset) = per section, kmS dari tiang.
      // v0.53: Temuan, Tindak Lanjut, Eksekusi (tim pelaksana tindak lanjut) berupa teks.
      lap_C4A_UP3: ['No', 'Tanggal', 'Penyulang', 'Realisasi kmS', 'Temuan', 'Tindak Lanjut', 'Eksekusi', 'Keterangan', 'Input Oleh',
        'Timestamp', 'Timestamp Update', 'c4a_id', 'lap_id', 'status', 'revision', 'dibuat_oleh', 'diubah_oleh'],
      lap_C4A_UIW: ['No', 'Tanggal', 'Penyulang', 'Section', 'Jumlah Tiang', 'Panjang kmS', 'Temuan Peralatan', 'Temuan ROW',
        'Eksekusi', 'Keterangan', 'Input Oleh', 'Timestamp', 'Timestamp Update', 'c4a_id', 'lap_id', 'section_id',
        'status', 'revision', 'dibuat_oleh', 'diubah_oleh']
    },
    // v0.63.0 (keputusan kvlar 7 Okt 2026): spreadsheet terpisah SiSi_Yandal. yan_Shift = 1 baris per tim per shift
    // (crew 1-2 petugas), yan_Login = SETIAP login akun YANDAL (jam login, HP, logout).
    YANDAL_SHEET_ID: {
      // v0.63.3 (keputusan kvlar 8 Okt 2026): jam kerja + jadwal, petugas dipisah, check-in & terlambat, jumlah login,
      // rekap P0 (diisi modul P0). Header lama v0.63.0 dipindah ke YAN_SHIFT_HEADER_V630_ (ADMIN_perbaruiYanShift).
      yan_Shift: YAN_SHIFT_HEADER_.slice(),
      // v0.63.4: Penugasan P0 (rekap shift dihitung dari sini lewat shift_id)
      yan_P0: YAN_P0_HEADER_.slice(),
      // v0.66.0: Pengecekan Switching (anak P0)
      yan_Switching: YAN_SWITCHING_HEADER_.slice(),
      // v0.74.0: Pengecekan Gardu (anak P0)
      yan_Gardu: YAN_GARDU_HEADER_.slice(),
      yan_Login: ['No', 'Waktu Login', 'Waktu Masuk', 'Tanggal', 'Shift', 'Tim', 'Petugas', 'Platform', 'Perangkat', 'Sesi Sampai',
        'Waktu Logout', 'Alasan Logout', 'login_id', 'shift_id', 'tim_id', 'user_id', 'device_id', 'petugas_id_1', 'petugas_id_2'],
      // v0.83.0: riwayat pengingat login (cegah kirim dobel), dibuat ADMIN_siapkanNotifikasi
      yan_Pengingat: YAN_PENGINGAT_HEADER_.slice()
    },
    // v0.67.0 (keputusan kvlar 9 Okt 2026): tab baru di spreadsheet Pengukuran Gardu Toboali. Struktur dikunci (sama persis).
    GARDU_SHEET_ID: {
      Rekap_BA: REKAP_BA_HEADER_.slice(),
      db_Gardu: DB_GARDU_HEADER_.slice(),
      res_NomorGardu: RES_NOMOR_HEADER_.slice()   // v0.73.0 (jalankan ADMIN_siapkanSheetGardu sekali)
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
  var c = cfg_(), masalah = 0;
  var bagian = function (judul) { console.log(''); console.log('--- ' + judul + ' ---'); };
  var ok = function (p) { console.log('  [OK]          ' + p); };
  var info = function (p) { console.log('  [INFO]        ' + p); };
  var lewati = function (p) { console.log('  [DILEWATI]    ' + p); };
  var perhatian = function (p) { masalah++; console.warn('  [PERHATIAN]   ' + p); };
  var gagal = function (p) { masalah++; console.error('  [GAGAL]       ' + p); };

  console.log('=== Cek konfigurasi SiSi v2 (backend ' + VERSI_BACKEND_ + ') ===');

  bagian('Umum');
  info('ENV ' + c.ENV + ' | KODE_ULP ' + c.KODE_ULP + ' | PBKDF2_ITERASI ' + c.PBKDF2_ITERASI);
  if (c.PBKDF2_ITERASI < PBKDF2_MIN_PRODUCTION_) perhatian('PBKDF2_ITERASI di bawah ' + PBKDF2_MIN_PRODUCTION_ + ', hanya boleh di staging (production ditolak)');

  var skema = skemaHeader_();
  var sumberOpsional = { ROW_SHEET_ID: 'cek SiSi_ROW', LAPORAN_SHEET_ID: 'cek SiSi_Laporan', YANDAL_SHEET_ID: 'cek SiSi_Yandal', GARDU_SHEET_ID: 'cek Rekap_BA / db_Gardu' };
  Object.keys(skema).forEach(function (idKey) {
    bagian(idKey);
    if (sumberOpsional[idKey] && !c[idKey]) { lewati(idKey + ' kosong, ' + sumberOpsional[idKey] + ' dilewati'); return; }
    try {
      var ss = bukaSpreadsheet_(c[idKey]);
      var nmSs = typeof ss.getName === 'function' ? ss.getName() : '';
      info('file: ' + (nmSs || '-') + ' (' + c[idKey] + ')');
      if (c.ENV !== 'production' && nmSs && !/staging|stg|uji|test|salin|copy/i.test(nmSs)) {
        perhatian(idKey + ' di ENV=' + c.ENV + ' menunjuk ke "' + nmSs + '" — pastikan bukan spreadsheet production!');
      }
      var zona = typeof ss.getSpreadsheetTimeZone === 'function' ? ss.getSpreadsheetTimeZone() : 'Asia/Jakarta';
      if (zona !== 'Asia/Jakarta') perhatian('zona waktu spreadsheet ' + zona + ', ganti ke (GMT+07:00) Jakarta di File > Setelan');
    } catch (eZ) { /* tiap tab dicek di bawah */ }
    Object.keys(skema[idKey]).forEach(function (nama) {
      try {
        var t = tabel_(idKey, nama);
        // v0.67.0: sheet gardu / BA = struktur dikunci, harus sama persis (urutan + judul)
        var kunci = strukturGardu_().some(function (s) { return s.idKey === idKey && s.nama === nama; });
        var beda = kunci ? bedaStruktur_(t.header, skema[idKey][nama]) : [];
        var kurang = kunci ? [] : skema[idKey][nama].filter(function (h) { return t.header.indexOf(h) === -1; });
        if (beda.length) perhatian(nama + ': STRUKTUR BERUBAH -> ' + beda.slice(0, 5).join(' | '));
        else if (kurang.length) perhatian(nama + ': kolom kurang -> ' + kurang.join(', '));
        else ok(nama + ' (' + t.rows.length + ' baris)');
      } catch (e) {
        var saran = e.kode === 'SHEET_TIDAK_ADA' && strukturGardu_().some(function (s) { return s.nama === nama; }) ? ' (jalankan ADMIN_siapkanSheetGardu)' :
          e.kode === 'SHEET_TIDAK_ADA' && (nama === 'auth_Notif' || nama === 'yan_Pengingat') ? ' (jalankan ADMIN_siapkanNotifikasi)' : '';
        gagal(nama + ': ' + (e.kode || e.message) + saran);
      }
    });
    if (idKey === 'YANDAL_SHEET_ID' && !c.YANDAL_FOTO_FOLDER_ID) perhatian('YANDAL_FOTO_FOLDER_ID kosong, foto P0 tidak bisa dikirim (folder Drive privat)');
    if (idKey === 'GARDU_SHEET_ID') cekFiturGardu_(c, info, ok, perhatian, gagal);
  });

  masalah += cekKonfigHartek_(c);   // v0.88.2
  masalah += cekKonfigInsJar_(c);   // v1.0.0
  masalah += cekKonfigInsDu_(c);   // v1.0.8
  masalah += cekKonfigWo_(c);   // v1.0.10
  masalah += cekKonfigV1017_(c);   // v1.0.17: jadwal padam, sinkron atomik, kepemilikan WO, sumber migrasi
  masalah += cekKonfigMigrasiHartek_(c);   // v0.98.8
  masalah += cekKonfigMigrasiP0_(c);   // v0.82.1
  masalah += cekKonfigNotif_();   // v0.83.0
  masalah += cekKonfigPemakaian_();   // v0.84.0
  if (c.GARDU_SHEET_ID) masalah += cekKonfigArsipBa_();   // v0.86.0
  masalah += cekKonfigProperti_(c);   // v1.0.22: jatah 50 Script Properties + properti migrasi selesai

  console.log('');
  console.log(masalah ? '=== SELESAI: ' + masalah + ' masalah. Cari [GAGAL] dan [PERHATIAN] di atas ===' : '=== SEMUA OK ===');
}

/** Cek fitur tambahan Gardu (foto, PDF engine, sinkron sheet lama, sumber migrasi, kapasitas sel). Dipanggil dari ADMIN_cekKonfigurasi. */
function cekFiturGardu_(c, info, ok, perhatian, gagal) {
  var pp = PropertiesService.getScriptProperties();
  console.log('  > fitur Gardu');
  if (!c.GARDU_FOTO_FOLDER_ID) perhatian('GARDU_FOTO_FOLDER_ID kosong, foto BA gardu tidak bisa dikirim (folder Drive privat)');
  else ok('GARDU_FOTO_FOLDER_ID terisi');
  // v0.71.0: PDF BA lewat Cloud Run (rahasia tidak pernah dicetak)
  var urlPdf = String(pp.getProperty('PDF_ENGINE_URL') || ''), rhsPdf = String(pp.getProperty('PDF_ENGINE_SECRET') || '');
  if (!urlPdf || !rhsPdf) perhatian('PDF_ENGINE_URL / PDF_ENGINE_SECRET kosong, PDF BA belum bisa dibuat (deploy engines/sisi-pdf-engine, lalu ADMIN_cekPdfEngine)');
  else if (!/^https:\/\//.test(urlPdf) || rhsPdf.length < 32) perhatian('PDF_ENGINE_URL harus https dan PDF_ENGINE_SECRET minimal 32 karakter');
  else ok('PDF engine ' + urlPdf + ' (rahasia ' + rhsPdf.length + ' karakter), uji: ADMIN_cekPdfEngine');
  if (pp.getProperty('SHEET_GARDU_ULP')) info('sinkron sheet lama aktif (pratinjau ADMIN_cekSinkronGarduLama, pemicu 05:00 ADMIN_pasangPemicuSinkronGardu)');
  else info('SHEET_GARDU_ULP kosong, sinkron harian db_Gardu ke Master_Gardu lama mati');
  if (pp.getProperty('EAM_EMAIL')) info('EAM_EMAIL: ' + emailEam_().length + ' akun EAM (BA TTD dibagikan sebagai Viewer + Link BA di pesan EAM)');
  else info('EAM_EMAIL kosong, Kirim EAM hanya lampiran (belum ada Link BA)');
  info('Foto + PDF BA disimpan di GARDU_FOTO_FOLDER_ID / Gardu / <No Gardu> / <YYYY-MM-DD>_<Jenis BA> (BA lama: ADMIN_rapikanFolderBaGardu)');
  if (pp.getProperty('BA_PDF_FOLDER_ID')) perhatian('BA_PDF_FOLDER_ID tidak dipakai lagi sejak v0.77.0, boleh dihapus');
  // v0.68.1: sumber migrasi gardu lama (boleh file lain, hanya dibaca)
  if (c.GARDU_LAMA_SHEET_ID !== c.GARDU_SHEET_ID) {
    try {
      var ssLama = bukaSpreadsheet_(c.GARDU_LAMA_SHEET_ID);
      var tabLama = ['Master_Gardu', 'Rekap Gardu'].filter(function (n) { return !ssLama.getSheetByName(n); });
      if (tabLama.length) perhatian('GARDU_LAMA_SHEET_ID: tab ' + tabLama.join(', ') + ' tidak ada');
      else ok('GARDU_LAMA_SHEET_ID: Master_Gardu + Rekap Gardu ada (sumber migrasi, hanya dibaca)');
    } catch (eL) { gagal('GARDU_LAMA_SHEET_ID tidak bisa dibuka: ' + (eL.message || eL)); }
  }
  // v0.67.0: batas 10 juta sel per spreadsheet (file gardu berat)
  var sel = jumlahSelSpreadsheet_(c.GARDU_SHEET_ID);
  if (sel) {
    if (sel.sel > 8e6) perhatian('GARDU_SHEET_ID: ' + sel.sel + ' sel (' + sel.sheet + ' tab), mendekati batas 10 juta');
    else ok('GARDU_SHEET_ID: ' + sel.sel + ' sel (' + sel.sheet + ' tab), batas 10 juta');
  }
}

/* ===== v1.0.22: Script Properties maks 50 (batas Apps Script) ===== */

var PROPERTI_MAKS_ = 50;

/**
 * Keluarga properti migrasi: awalan kunci + tab tujuan migrasi (baris dibuat_oleh = MIGRASI). Awalan 'MIG_' tidak
 * menangkap MIGP0_ / MIGHARTEK_ / MIGINS_ / MIGJP_ (huruf sesudah MIG bukan garis bawah).
 */
function keluargaMigrasi_() {
  return [
    { awalan: 'MIG_', nama: 'ROW', idKey: 'ROW_SHEET_ID', tabel: function () { return tabel_('ROW_SHEET_ID', ROW_SHEET_.header); } },
    { awalan: 'MIGP0_', nama: 'P0 Yandal', idKey: 'YANDAL_SHEET_ID', tabel: function () { return tabel_('YANDAL_SHEET_ID', MIGP0_SHEET_V2_.p0); } },
    { awalan: 'MIGHARTEK_', nama: 'Hartek', idKey: 'HARTEK_SHEET_ID', tabel: function () { return tabelHartek_(MIGHARTEK_SHEET_V2_.header); } },
    { awalan: 'MIGINS_', nama: 'Inspeksi', idKey: 'TEMUAN_SHEET_ID', tabel: function () { return MIGINS_TARGET_[4].tabel(); } },
    { awalan: 'MIGJP_', nama: 'Jadwal Padam', idKey: 'JADWAL_PADAM_SHEET_ID', tabel: tabelJp_ }
  ];
}

/** Jumlah baris hasil migrasi (dibuat_oleh = MIGRASI) + tanggal tulis terakhir (yyyy-MM-dd). Hanya 2 kolom yang dibaca. */
function ringkasMigrasiTab_(tb) {
  var iOleh = tb.header.indexOf('dibuat_oleh'), akhir = tb.sheet.getLastRow(), hasil = { jumlah: 0, terakhir: '' };
  if (iOleh === -1 || akhir < 2) return hasil;
  var iWaktu = ['dibuat_pada', 'Timestamp', 'diubah_pada'].map(function (k) { return tb.header.indexOf(k); }).filter(function (i) { return i !== -1; })[0];
  var oleh = tb.sheet.getRange(2, iOleh + 1, akhir - 1, 1).getValues();
  var waktu = iWaktu === undefined ? [] : tb.sheet.getRange(2, iWaktu + 1, akhir - 1, 1).getValues();
  oleh.forEach(function (b, i) {
    if (String(b[0]) !== 'MIGRASI') return;
    hasil.jumlah++;
    var t = waktu[i] ? tglSel_(waktu[i][0]) : '';
    if (t > hasil.terakhir) hasil.terakhir = t;
  });
  return hasil;
}

/**
 * Saran untuk satu keluarga properti migrasi (murni). Data migrasi sudah ada di sheet dan ditulis SEBELUM hari
 * cekKonfigurasi dijalankan = HAPUS (migrasi selesai, properti tinggal memakan jatah 50). Ditulis hari ini = HARI_INI
 * (cek hasil dulu). Belum ada data = BELUM (properti masih dipakai). Kunci foto ditunda sampai migrasi foto selesai.
 */
function saranPropertiMigrasi_(kunci, ringkas, hariIni) {
  var foto = kunci.filter(function (k) { return /FOTO/.test(k); });
  var lain = kunci.filter(function (k) { return !/FOTO/.test(k); });
  var status = !ringkas.jumlah ? 'BELUM' : (ringkas.terakhir && ringkas.terakhir >= hariIni ? 'HARI_INI' : 'HAPUS');
  return { status: status, hapus: status === 'HAPUS' ? lain : [], tunda: status === 'HAPUS' ? foto : [] };
}

/**
 * Dipanggil ADMIN_cekKonfigurasi: jumlah Script Properties + properti migrasi selesai.
 * v1.0.31: properti migrasi berstatus HAPUS langsung dihapus (kunci foto tetap, hapus manual sesudah migrasi foto selesai).
 * Masih hampir penuh = penanda jendela ROW (ROW_JENDELA_*) ikut dihapus; sinkron berikutnya membaca dari baris 2 lalu
 * membuatnya lagi. Di atas 50 tombol Edit di Project Settings hilang.
 */
function cekKonfigProperti_(c) {
  var props = PropertiesService.getScriptProperties();
  var semua = Object.keys(props.getProperties()), masalah = 0, hariIni = tglJakarta_(new Date()), dihapus = [];
  var hapus = function (k) { props.deleteProperty(k); dihapus.push(k); };
  console.log('');
  console.log('[Script Properties] ' + semua.length + ' dari ' + PROPERTI_MAKS_);
  keluargaMigrasi_().forEach(function (k) {
    var kunci = semua.filter(function (x) { return x.indexOf(k.awalan) === 0; }).sort();
    if (!kunci.length) return;
    var ringkas;
    try { ringkas = c[k.idKey] ? ringkasMigrasiTab_(k.tabel()) : { jumlah: 0, terakhir: '' }; } catch (e) {
      console.warn('  [PERHATIAN] migrasi ' + k.nama + ': tab tujuan tidak terbaca (' + (e.kode || e.message) + '), properti ' + kunci.join(', '));
      masalah++;
      return;
    }
    var s = saranPropertiMigrasi_(kunci, ringkas, hariIni);
    if (s.status === 'BELUM') {
      console.log('  [INFO] migrasi ' + k.nama + ': belum ada data di sheet, properti masih dipakai (' + kunci.join(', ') + ')');
    } else if (s.status === 'HARI_INI') {
      console.log('  [INFO] migrasi ' + k.nama + ': ' + ringkas.jumlah + ' baris ditulis hari ini. Cek hasilnya, lalu hapus properti ' + kunci.join(', '));
    } else {
      s.hapus.forEach(hapus);
      console.log('  [DIHAPUS] migrasi ' + k.nama + ' sudah ada di sheet (' + ringkas.jumlah + ' baris, terakhir ' + (ringkas.terakhir || '-') +
        '): ' + (s.hapus.join(', ') || '-'));
      if (s.tunda.length) {
        console.warn('  [PERHATIAN] migrasi ' + k.nama + ': hapus manual sesudah migrasi foto selesai: ' + s.tunda.join(', '));
        masalah++;
      }
    }
  });
  if (semua.length - dihapus.length >= PROPERTI_MAKS_ - 5) {
    var jendela = semua.filter(function (k) { return k.indexOf('ROW_JENDELA_') === 0; });
    jendela.forEach(hapus);
    if (jendela.length) console.log('  [DIHAPUS] penanda jendela ROW (dibuat ulang otomatis): ' + jendela.join(', '));
  }
  var sisa = semua.length - dihapus.length;
  if (dihapus.length) console.log('  [INFO] ' + dihapus.length + ' properti dihapus, sekarang ' + sisa + ' dari ' + PROPERTI_MAKS_);
  if (sisa >= PROPERTI_MAKS_ - 5) {
    console.warn('  [PERHATIAN] tinggal ' + Math.max(0, PROPERTI_MAKS_ - sisa) + ' slot. Hapus properti yang tidak dipakai lagi.');
    masalah++;
  }
  return masalah;
}

/**
 * Lengkapi baris master yang diisi manual: ID UUID, revision, waktu, pengubah.
 * Juga cek username ganda dan parent_section_id yang tidak ada.
 * db_Jaringan (v0.46): `urutan` kosong / 0 diisi kelipatan 20 per penyulang, setelah nomor terbesar.
 */
function ADMIN_lengkapiMaster() {
  pastikanPemilik_();
  var target = { db_Tim: 'tim_id', db_Users: 'user_id', db_Jaringan: 'section_id', db_Jenis_Pekerjaan: 'jenis_id', db_Petugas: 'petugas_id',
                 db_Pejabat_BA: 'pejabat_id',   // v0.67.0
                 db_Material: 'material_id',    // v0.95.0: master material Hartek
                 db_Kepemilikan_Material: 'kepemilikan_id',   // v0.96.0: master kepemilikan material Hartek
                 db_jenis_peralatan: 'peralatan_id',          // v0.98.11: master jenis peralatan hasil grounding
                 db_Daerah_Padam: 'daerah_id' };              // v1.0.18: sumber dampak Jadwal Padam per penyulang + section
  // tab opsional (modul belum dipakai = dilewati) dan tab berkolom `nomor`
  var opsional = ['db_Petugas', 'db_Pejabat_BA', 'db_Material', 'db_Kepemilikan_Material', 'db_jenis_peralatan'];
  var bernomor = ['db_Material', 'db_Kepemilikan_Material', 'db_jenis_peralatan', 'db_Daerah_Padam'];
  denganLock_(function () {
    lengkapiDaerahPadam_();   // v1.0.18: tab dibuat + baris penyulang / section db_Jaringan yang belum ada ditambahkan
    Object.keys(target).forEach(function (nama) {
      var t, kolomId = target[nama], diisi = 0;
      try { t = tabel_('MASTER_SHEET_ID', nama); } catch (e) {
        if (opsional.indexOf(nama) !== -1 && e.kode === 'SHEET_TIDAK_ADA') { console.warn(nama + ' belum ada, dilewati'); return; }
        throw e;
      }
      var tulis = function (r, kolom, nilai) {
        var idx = t.header.indexOf(kolom);
        if (idx !== -1 && (r[kolom] === '' || r[kolom] === null || r[kolom] === undefined)) {
          t.sheet.getRange(r._baris, idx + 1).setValue(nilai);
          r[kolom] = nilai;
          return true;
        }
        return false;
      };
      var polaUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      t.rows.forEach(function (r) {
        var idLama = r[kolomId];
        if (idLama !== '' && idLama !== null && idLama !== undefined && !polaUuid.test(String(idLama))) {
          console.warn(nama + ' baris ' + r._baris + ': ' + kolomId + ' "' + idLama + '" bukan UUID. Kosongkan sel ini supaya diisi otomatis.');
        }
        var ubah = tulis(r, kolomId, uuid_());
        ubah = tulis(r, 'revision', 1) || ubah;
        ubah = tulis(r, 'dibuat_pada', sekarangIso_()) || ubah;
        ubah = tulis(r, 'diubah_pada', sekarangIso_()) || ubah;
        ubah = tulis(r, 'diubah_oleh', 'admin-tools') || ubah;
        ubah = tulis(r, 'timestamp_update', sekarangIso_()) || ubah;   // v0.95.0: db_Material memakai timestamp_update
        if (bernomor.indexOf(nama) !== -1) ubah = tulis(r, 'nomor', r._baris - 1) || ubah;
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
          if (String(r.username).trim() !== u) console.warn('db_Users baris ' + r._baris + ': username harus huruf kecil semua');
          if (u.indexOf(cfg_().KODE_ULP + '.') !== 0) console.warn('db_Users baris ' + r._baris + ': username "' + u + '" harus diawali ' + cfg_().KODE_ULP + '.');
          if (lihat[u]) console.warn('db_Users: username ganda "' + u + '" (baris ' + lihat[u] + ' & ' + r._baris + ')');
          lihat[u] = r._baris;
        });
      }
      if (nama === 'db_Jenis_Pekerjaan') {
        // v0.64.3: kolom bobot (P0 Yandal). Belum ada = header ditambah di kolom kosong pertama setelah header terakhir.
        if (t.header.indexOf('bobot') === -1) {
          var kol = t.header.length;
          while (kol > 0 && !t.header[kol - 1]) kol--;
          t.sheet.getRange(1, kol + 1).setValue('bobot');
          console.log('db_Jenis_Pekerjaan: kolom bobot ditambahkan (kolom ' + (kol + 1) + '). Isi bobot untuk modul YANDAL.');
        } else {
          t.rows.forEach(function (r) {
            if (String(r.modul).trim().toUpperCase() !== 'YANDAL' || !isAktif_(r.aktif)) return;
            var bb = r.bobot;
            // v0.64.6: Lain - Lain sengaja kosong, bobot diisi admin per P0 saat approval
            if (pekerjaanLainP0_(r.nama)) {
              if (bb !== '' && bb !== null && bb !== undefined) console.warn('db_Jenis_Pekerjaan baris ' + r._baris + ': bobot Lain - Lain diabaikan (diisi admin saat approval). Kosongkan saja.');
              else console.log('db_Jenis_Pekerjaan baris ' + r._baris + ': Lain - Lain, bobot diisi admin saat approval');
              return;
            }
            if (bb === '' || bb === null || bb === undefined || !isFinite(Number(bb)) || Number(bb) < 0) {
              console.warn('db_Jenis_Pekerjaan baris ' + r._baris + ': bobot YANDAL "' + r.nama + '" kosong / tidak valid');
            }
          });
        }
      }
      if (nama === 'db_Petugas') {
        // v0.63.0: tim_yandal boleh diketik nama tim ("YANDAL 13") atau kode ("13"); diganti jadi UUID tim YANDAL.
        var timY = tabel_('MASTER_SHEET_ID', 'db_Tim').rows.filter(function (x) { return String(x.jenis) === 'YANDAL'; });
        var idxTY = t.header.indexOf('tim_yandal'), namaP = {};
        t.rows.forEach(function (r) {
          var v = r.tim_yandal;
          if (v === '' || v === null || v === undefined) return console.warn('db_Petugas baris ' + r._baris + ': tim_yandal kosong');
          var hasil = cariTimId_(v, timY);
          if (hasil.id && hasil.id !== String(v)) {
            t.sheet.getRange(r._baris, idxTY + 1).setValue(hasil.id);
            console.log('db_Petugas baris ' + r._baris + ': tim "' + v + '" -> ' + hasil.id);
          } else if (hasil.masalah) {
            console.warn('db_Petugas baris ' + r._baris + ': tim YANDAL "' + v + '" ' + hasil.masalah + ', tidak diubah');
          }
          var k = String(r.nama || '').trim().toLowerCase();
          if (!k) console.warn('db_Petugas baris ' + r._baris + ': nama kosong');
          else if (namaP[k] && isAktif_(r.aktif)) console.warn('db_Petugas: nama ganda "' + r.nama + '" (baris ' + namaP[k] + ' & ' + r._baris + ')');
          else if (isAktif_(r.aktif)) namaP[k] = r._baris;
        });
      }
      if (nama === 'db_Pejabat_BA') {
        // v0.67.0: peran PEMERIKSA / MENGETAHUI (huruf besar), nama + jabatan wajib, MENGETAHUI aktif hanya satu
        var idxPeran = t.header.indexOf('peran'), tahu = [];
        t.rows.forEach(function (r) {
          var peran = String(r.peran || '').trim().toUpperCase();
          if (peran !== String(r.peran || '') && PEJABAT_PERAN_.indexOf(peran) !== -1) t.sheet.getRange(r._baris, idxPeran + 1).setValue(peran);
          if (PEJABAT_PERAN_.indexOf(peran) === -1) console.warn('db_Pejabat_BA baris ' + r._baris + ': peran "' + r.peran + '" bukan PEMERIKSA / MENGETAHUI');
          if (!String(r.nama || '').trim() || !String(r.jabatan || '').trim()) console.warn('db_Pejabat_BA baris ' + r._baris + ': nama / jabatan kosong');
          if (peran === 'MENGETAHUI' && isAktif_(r.aktif)) tahu.push(r._baris);
        });
        if (tahu.length > 1) console.warn('db_Pejabat_BA: MENGETAHUI aktif lebih dari satu (baris ' + tahu.join(', ') + ')');
        if (!tahu.length && t.rows.length) console.warn('db_Pejabat_BA: belum ada MENGETAHUI yang aktif');
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
        // v0.46: urutan section per penyulang. Yang kosong / 0 diisi kelipatan 20 setelah nomor terbesar (urutan tetap).
        var idxUrutan = t.header.indexOf('urutan');
        if (idxUrutan === -1) console.warn('db_Jaringan: kolom urutan tidak ada');
        else {
          var rencana = rencanaUrutanSection_(t.rows);
          rencana.peringatan.forEach(function (w) { console.warn(w); });
          rencana.isi.forEach(function (x) {
            t.sheet.getRange(x.baris, idxUrutan + 1).setValue(x.nilai);
            console.log('db_Jaringan baris ' + x.baris + ': urutan ' + x.nilai + ' (' + x.penyulang + ' / ' + x.section + ')');
          });
          if (rencana.isi.length) diisi += rencana.isi.length;
        }
      }
      console.log(nama + ': ' + diisi + ' baris dilengkapi');
    });
  });
  CacheService.getScriptCache().removeAll(['akses:v1', 'master-row:v3']);
  // v1.0.22 (permintaan kvlar 23 Okt 2026): HP yang login mengunduh ulang Master Data + Master Gardu otomatis
  // (revisi ikut di setiap jawaban server, lihat proses_). Satu Script Property, ditimpa setiap jalan.
  var revisi = sekarangIso_();
  PropertiesService.getScriptProperties().setProperty('MASTER_REVISI', revisi);
  console.log('MASTER_REVISI ' + revisi + ': HP mengunduh ulang Master Data + Master Gardu saat berikutnya terhubung ke server');
}

/**
 * Lihat urutan section yang dipakai laporan, per penyulang (hanya baca, tidak menulis apa pun).
 * Cek ini setelah mengubah kolom urutan db_Jaringan.
 */
function ADMIN_cekUrutanSection() {
  pastikanPemilik_();
  var t = tabel_('MASTER_SHEET_ID', 'db_Jaringan'), grup = {};
  var jaringan = {};
  t.rows.forEach(function (r) {
    var p = String(r.penyulang || '').trim();
    if (!p || !String(r.section || '').trim()) return;
    var id = 'b' + r._baris;
    jaringan[id] = { section: String(r.section).trim(), urutan: Number(r.urutan) || 0, baris: r._baris, aktif: isAktif_(r.aktif) };
    (grup[p] = grup[p] || []).push(id);
  });
  Object.keys(grup).sort().forEach(function (p) {
    var baris = grup[p].sort(urutSection_(jaringan)).map(function (id, i) {
      var x = jaringan[id];
      return (i + 1) + '. [' + (x.urutan || '-') + '] ' + x.section + (x.aktif ? '' : ' (nonaktif)');
    });
    console.log(p + ':\n' + baris.join('\n'));
  });
  rencanaUrutanSection_(t.rows).peringatan.forEach(function (w) { console.warn(w); });
}

/**
 * Set/ganti password. Caranya:
 * 1. Isi Script Properties SETPW_USERNAME dan SETPW_PASSWORD (min 10 karakter)
 * 2. Jalankan fungsi ini. Kedua property otomatis DIHAPUS, semua sesi user itu DICABUT.
 */
function ADMIN_setPassword() {
  pastikanPemilik_();
  var props = PropertiesService.getScriptProperties();
  var semua = props.getProperties();
  var mirip = Object.keys(semua).filter(function (k) { return /setpw/i.test(k); });
  var username = String(semua.SETPW_USERNAME || '').trim().toLowerCase();
  var adaPassword = Object.prototype.hasOwnProperty.call(semua, 'SETPW_PASSWORD');
  var password = String(semua.SETPW_PASSWORD || '');
  try {
    if (!username) throw new SisiError_('FIELD_WAJIB', 'SETPW_USERNAME tidak ada. Property mirip: ' + (mirip.join(', ') || '-'));
    if (!adaPassword) throw new SisiError_('FIELD_WAJIB', 'SETPW_PASSWORD tidak ada (cek ejaan nama property). Property mirip: ' + (mirip.join(', ') || '-'));
    if (password.length < 10) throw new SisiError_('PASSWORD_TERLALU_PENDEK', 'terbaca ' + password.length + ' karakter, minimal 10');
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
          hapusSesiCache_(r.token_hash);   // audit 4 Okt 2026: tanpa ini token lama masih lolos sampai 5 menit
        }
      });
      buangIndeksKenal_();   // v0.62.4: semua HP akun ini jadi HP asing
    });
    console.log('Password ' + username + ' diset. Semua sesi lama dicabut.');
  } finally {
    // Selalu dihapus, berhasil atau gagal, supaya password tidak tertinggal. Kalau gagal, isi ulang keduanya.
    mirip.forEach(function (k) { props.deleteProperty(k); });
  }
}

/**
 * Paksa aturan akses, master ROW, dan SEMUA sesi dibaca ulang dari sheet. Jalankan setelah edit manual
 * db_Menu / db_Akses / db_Users (mis. akun dinonaktifkan, role/tim diganti) / auth_Perangkat (dicabut_pada diisi),
 * supaya berlaku seketika, bukan menunggu cache 5 menit habis.
 */
/**
 * v0.63.3: ubah sheet yan_Shift dari header v0.63.0 (23 kolom) ke header baru TANPA kehilangan data.
 * v0.63.4: juga dari header v0.63.3 (40 kolom, tambah Rekap Final) dan membuat sheet yan_P0 kalau belum ada.
 * Petugas dipecah ke Petugas 1 / 2, Jam Shift -> Jam Kerja, Login Pertama -> Jam Check-in (+ Terlambat),
 * Jumlah Login dihitung dari yan_Login, rekap P0 lain = 0. Header sudah baru = tidak ada yang ditulis.
 * Header tidak dikenal = berhenti tanpa menulis. Satu panggilan tulis (masuk semua atau tidak sama sekali).
 */
/**
 * v0.64.3: yan_P0 dari header v0.63.4 (48 kolom) ke header 66 kolom TANPA kehilangan data (pindah per nama kolom,
 * Koordinat / Koordinat Closing diisi dari Lat/Long). Sudah header baru = tidak menulis. Header tidak dikenal = berhenti.
 * Dipanggil dari ADMIN_perbaruiYanShift (di dalam lock).
 */
function perbaruiYanP0_() {
  var t = tabel_('YANDAL_SHEET_ID', 'yan_P0');
  var ada = t.header.slice();
  while (ada.length && !ada[ada.length - 1]) ada.pop();
  if (ada.join('|') === YAN_P0_HEADER_.join('|')) { console.log('yan_P0 sudah header terbaru, tidak ada yang diubah.'); return false; }
  var dari643 = ada.join('|') === YAN_P0_HEADER_V643_.join('|');   // v0.65.8: 66 kolom km -> meter
  var dari658 = ada.join('|') === YAN_P0_HEADER_V658_.join('|');   // v0.65.9: Jarak (m) -> Jarak Closing P0 (m)
  var dari659 = ada.join('|') === YAN_P0_HEADER_V659_.join('|');   // v0.65.10: Jarak Closing P0 -> Jarak Closing P0 (m)
  if (!dari643 && !dari658 && !dari659 && ada.join('|') !== YAN_P0_HEADER_V634_.join('|')) {
    console.error('Header yan_P0 tidak dikenal (bukan v0.63.4 / v0.64.3 / v0.65.8 / v0.65.9). Tidak diubah. Samakan dulu dengan template.');
    return false;
  }
  var lebar = YAN_P0_HEADER_.length, akhir = Math.max(t.sheet.getLastRow(), 1);
  var data = [YAN_P0_HEADER_.slice()];
  for (var b = 2; b <= akhir; b++) data.push(YAN_P0_HEADER_.map(function () { return ''; }));
  t.rows.forEach(function (r) {
    var o = {};
    YAN_P0_HEADER_.forEach(function (h) { if (Object.prototype.hasOwnProperty.call(r, h)) o[h] = r[h]; });
    o['Koordinat'] = koordinatTeks_(r.Lat, r.Long);
    o['Koordinat Closing'] = koordinatTeks_(r['Lat Closing'], r['Long Closing']);
    // v0.65.8: jarak meter dihitung ulang dari titik (nilai km lama bisa 0 karena pembulatan 2 desimal)
    o['Jarak Closing P0 (m)'] = titikSah_(r.Lat, r.Long) && titikSah_(r['Lat Closing'], r['Long Closing'])
      ? jarakMeter_(Number(r.Lat), Number(r.Long), Number(r['Lat Closing']), Number(r['Long Closing'])) : '';
    data[r._baris - 1] = barisDariObjek_(YAN_P0_HEADER_, o);
  });
  var perShift = {};
  t.rows.forEach(function (r) { if (r.shift_id) (perShift[String(r.shift_id)] = perShift[String(r.shift_id)] || []).push(r); });
  var iAntar = YAN_P0_HEADER_.indexOf('Jarak Antar P0 (m)');
  Object.keys(perShift).forEach(function (k) {
    var jarak = jarakAntarP0_(perShift[k]);
    perShift[k].forEach(function (r) {
      if (Object.prototype.hasOwnProperty.call(jarak, String(r.p0_id))) data[r._baris - 1][iAntar] = jarak[String(r.p0_id)];
    });
  });
  if (typeof t.sheet.getMaxColumns === 'function' && t.sheet.getMaxColumns() < lebar) {
    t.sheet.insertColumnsAfter(t.sheet.getMaxColumns(), lebar - t.sheet.getMaxColumns());
  }
  t.sheet.getRange(1, 1, data.length, lebar).setValues(data);
  console.log('yan_P0 diperbarui ke header terbaru (' + lebar + ' kolom' + (dari643 ? ', jarak km -> meter' : dari658 || dari659 ? ', kolom jarak -> Jarak Closing P0 (m)' : '') + '): ' +
    t.rows.length + ' baris P0 dipindahkan.');
  return true;
}

function ADMIN_perbaruiYanShift() {
  pastikanPemilik_();
  if (!cfg_().YANDAL_SHEET_ID) { console.error('YANDAL_SHEET_ID kosong'); return; }
  denganLock_(function () {
    var ss = bukaSpreadsheet_(cfg_().YANDAL_SHEET_ID);
    if (!ss.getSheetByName('yan_P0')) {
      var shP0 = ss.insertSheet('yan_P0');
      shP0.getRange(1, 1, 1, YAN_P0_HEADER_.length).setValues([YAN_P0_HEADER_.slice()]);
      if (typeof shP0.setFrozenRows === 'function') shP0.setFrozenRows(1);
      console.log('Sheet yan_P0 dibuat (' + YAN_P0_HEADER_.length + ' kolom).');
    } else perbaruiYanP0_();
    if (!ss.getSheetByName('yan_Switching')) {   // v0.66.0
      var shSw = ss.insertSheet('yan_Switching');
      shSw.getRange(1, 1, 1, YAN_SWITCHING_HEADER_.length).setValues([YAN_SWITCHING_HEADER_.slice()]);
      if (typeof shSw.setFrozenRows === 'function') shSw.setFrozenRows(1);
      console.log('Sheet yan_Switching dibuat (' + YAN_SWITCHING_HEADER_.length + ' kolom).');
    }
    if (!ss.getSheetByName('yan_Gardu')) {   // v0.74.0
      var shGr = ss.insertSheet('yan_Gardu');
      shGr.getRange(1, 1, 1, YAN_GARDU_HEADER_.length).setValues([YAN_GARDU_HEADER_.slice()]);
      if (typeof shGr.setFrozenRows === 'function') shGr.setFrozenRows(1);
      console.log('Sheet yan_Gardu dibuat (' + YAN_GARDU_HEADER_.length + ' kolom).');
    }
    var t = tabel_('YANDAL_SHEET_ID', 'yan_Shift');
    var ada = t.header.slice();
    while (ada.length && !ada[ada.length - 1]) ada.pop();
    if (ada.join('|') === YAN_SHIFT_HEADER_.join('|')) { console.log('yan_Shift sudah header terbaru, tidak ada yang diubah.'); return; }
    var dari633 = ada.join('|') === YAN_SHIFT_HEADER_V633_.join('|');
    if (!dari633 && ada.join('|') !== YAN_SHIFT_HEADER_V630_.join('|')) {
      console.error('Header yan_Shift tidak dikenal (bukan v0.63.0 / v0.63.3). Tidak diubah. Samakan dulu dengan template.');
      return;
    }
    var login = {};
    try {
      tabel_('YANDAL_SHEET_ID', 'yan_Login').rows.forEach(function (r) {
        if (r.shift_id) login[String(r.shift_id)] = (login[String(r.shift_id)] || 0) + 1;
      });
    } catch (e) { console.warn('yan_Login tidak terbaca, Jumlah Login = 1: ' + (e.kode || e.message)); }
    var lebar = YAN_SHIFT_HEADER_.length, akhir = Math.max(t.sheet.getLastRow(), 1);
    var data = [YAN_SHIFT_HEADER_.slice()];
    for (var b = 2; b <= akhir; b++) data.push(YAN_SHIFT_HEADER_.map(function () { return ''; }));
    t.rows.forEach(function (r) {
      var o = {};
      YAN_SHIFT_HEADER_.forEach(function (h) { if (Object.prototype.hasOwnProperty.call(r, h)) o[h] = r[h]; });
      if (dari633) { data[r._baris - 1] = barisDariObjek_(YAN_SHIFT_HEADER_, o); return; }   // cukup geser kolom, Rekap Final kosong
      var tgl = tglSel_(r.Tanggal), no = Number(r.Shift);
      var crew = String(r.Petugas || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      if (tgl && YAN_JAM_SHIFT_[no]) {
        var mulai = Date.parse(tgl + 'T00:00:00+07:00') + (no === 1 ? 8 : no === 2 ? 16 : 24) * 3600e3;
        var jadwal = kolomShiftYandal_({ jam: YAN_JAM_SHIFT_[no], mulai: mulai }, crew);
        Object.keys(jadwal).forEach(function (k) { o[k] = jadwal[k]; });
        var masuk = keDate_(r['Login Pertama']);
        if (masuk) {
          o['Jam Check-in'] = waktuWib_(masuk.getTime(), true);
          o['Terlambat (menit)'] = terlambatMenit_(masuk.getTime(), mulai);
        }
      } else {
        o['Jam Kerja'] = r['Jam Shift'];
        o['Petugas 1'] = crew[0] || ''; o['Petugas 2'] = crew[1] || ''; o['Jumlah Petugas'] = crew.length;
      }
      o['Jumlah Login'] = login[String(r.shift_id)] || 1;
      YAN_REKAP_P0_.forEach(function (k) { if (o[k] === undefined || o[k] === '') o[k] = 0; });
      data[r._baris - 1] = barisDariObjek_(YAN_SHIFT_HEADER_, o);
    });
    if (typeof t.sheet.getMaxColumns === 'function' && t.sheet.getMaxColumns() < lebar) {
      t.sheet.insertColumnsAfter(t.sheet.getMaxColumns(), lebar - t.sheet.getMaxColumns());
    }
    t.sheet.getRange(1, 1, data.length, lebar).setValues(data);
    console.log('yan_Shift diperbarui ke header terbaru (' + lebar + ' kolom): ' + t.rows.length + ' baris shift dipindahkan.');
  });
}

function ADMIN_bersihkanCache() {
  pastikanPemilik_();
  var cache = CacheService.getScriptCache();
  cache.removeAll(['akses:v1', 'master-row:v3', KUNCI_USERNAME_TERDAFTAR_, INDEKS_TOKEN_KUNCI_, INDEKS_KENAL_KUNCI_]);
  PropertiesService.getScriptProperties().setProperty('SESI_EPOCH', String(Date.now()));
  console.log('Cache akses + master ROW dibersihkan. Semua sesi dicek ulang ke sheet di panggilan berikutnya.');
}

/**
 * Buka kunci login satu akun (petugas terkunci karena salah password / dispam orang lain). Isi Script Property
 * BUKA_USERNAME = username, lalu jalankan. Menghapus hitungan rem login (cache) dan kunci 5x gagal di auth_Password.
 * Property selalu dihapus setelahnya. Password dan sesi tidak berubah.
 */
function ADMIN_bukaKunciLogin() {
  pastikanPemilik_();
  var props = PropertiesService.getScriptProperties();
  var username = String(props.getProperty('BUKA_USERNAME') || '').trim().toLowerCase();
  try {
    if (!username) throw new SisiError_('FIELD_WAJIB', 'Script Property BUKA_USERNAME belum diisi');
    denganLock_(function () {
      var user = tabel_('MASTER_SHEET_ID', 'db_Users').rows
        .filter(function (r) { return String(r.username).trim().toLowerCase() === username; })[0];
      if (!user || !user.user_id) throw new SisiError_('USER_TIDAK_ADA', username);
      var authT = tabel_('AUTH_SHEET_ID', 'auth_Password');
      var auth = authT.rows.filter(function (r) { return String(r.user_id) === String(user.user_id); })[0];
      if (auth && (Number(auth.gagal_login) || auth.terkunci_sampai)) ubahBarisDikenal_(authT, auth, { gagal_login: 0, terkunci_sampai: '' });
      hapusGagalLogin_(username);
      // v0.62.4: hitungan per HP dikenal tidak bisa dicari satu-satu; tanda waktu ini membuat semuanya diabaikan.
      CacheService.getScriptCache().put(kunciBukaUser_(username), String(Date.now()), cfg_().LOGIN_KUNCI_MENIT * 60);
      auditLog_({ username: 'ADMIN_EDITOR' }, 'BUKA_KUNCI_LOGIN', username, '', 'EDITOR');
    });
    console.log('Kunci login ' + username + ' dibuka. Petugas bisa login lagi sekarang.');
  } finally {
    props.deleteProperty('BUKA_USERNAME');
  }
}

/**
 * Cabut SEMUA sesi aktif satu akun seketika (HP hilang, petugas pindah/keluar). Isi Script Property
 * CABUT_USERNAME = username, lalu jalankan. Property selalu dihapus setelahnya. Password tidak berubah.
 */
function ADMIN_cabutSesi() {
  pastikanPemilik_();
  var props = PropertiesService.getScriptProperties();
  var username = String(props.getProperty('CABUT_USERNAME') || '').trim().toLowerCase();
  try {
    if (!username) throw new SisiError_('FIELD_WAJIB', 'Script Property CABUT_USERNAME belum diisi');
    var n = denganLock_(function () {
      var user = tabel_('MASTER_SHEET_ID', 'db_Users').rows
        .filter(function (r) { return String(r.username).trim().toLowerCase() === username; })[0];
      if (!user || !user.user_id) throw new SisiError_('USER_TIDAK_ADA', username);
      var perangkat = tabel_('AUTH_SHEET_ID', 'auth_Perangkat');
      var aktif = perangkat.rows.filter(function (r) { return String(r.user_id) === String(user.user_id) && !r.dicabut_pada; });
      aktif.forEach(function (r) {
        ubahBarisDikenal_(perangkat, r, { dicabut_pada: sekarangIso_() });
        hapusSesiCache_(r.token_hash);
      });
      buangIndeksKenal_();   // v0.62.4: HP yang dicabut tidak lagi kebal kunci akun
      auditLog_({ username: 'ADMIN_EDITOR' }, 'CABUT_SESI', username, aktif.length + ' perangkat', 'EDITOR');
      return aktif.length;
    });
    console.log('Sesi ' + username + ' dicabut: ' + n + ' perangkat. HP akan diminta login ulang.');
  } finally {
    props.deleteProperty('CABUT_USERNAME');
  }
}

/**
 * Ukur bagian yang lambat: hitung hash vs buka/baca sheet. Tidak menulis apa pun.
 * Dipakai untuk menyetel PBKDF2_ITERASI (target login < 2 detik).
 */
function ADMIN_ukurWaktu() {
  pastikanPemilik_();
  var c = cfg_();
  var ukur = function (label, fn) {
    var t0 = Date.now(); fn(); var ms = Date.now() - t0;
    console.log(label + ': ' + ms + ' ms');
    return ms;
  };
  console.log('PBKDF2_ITERASI terbaca = ' + c.PBKDF2_ITERASI);
  var salt = saltBaru_();
  ukur('hash 1000 iterasi', function () { hashPassword_('contoh-password-uji', salt, 1000); });
  var hash = ukur('hash ' + c.PBKDF2_ITERASI + ' iterasi (setting sekarang)', function () { hashPassword_('contoh-password-uji', salt, c.PBKDF2_ITERASI); });
  var sheet = 0;
  sheet += ukur('baca db_Users', function () { tabel_('MASTER_SHEET_ID', 'db_Users'); });
  sheet += ukur('baca auth_Password', function () { tabel_('AUTH_SHEET_ID', 'auth_Password'); });
  sheet += ukur('baca auth_Perangkat', function () { tabel_('AUTH_SHEET_ID', 'auth_Perangkat'); });
  sheet += ukur('baca db_Tim + db_Menu + db_Akses', function () {
    tabel_('MASTER_SHEET_ID', 'db_Tim'); tabel_('MASTER_SHEET_ID', 'db_Menu'); tabel_('MASTER_SHEET_ID', 'db_Akses');
  });
  console.log('Perkiraan login: hash ' + hash + ' ms + sheet ' + sheet + ' ms + tulis ~500 ms');
  console.log('(Spreadsheet yang sama hanya dibuka sekali per eksekusi; baca berikutnya jauh lebih cepat.)');
}

