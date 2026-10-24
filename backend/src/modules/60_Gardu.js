/**
 * v0.67.0 (keputusan kvlar 9 Okt 2026): penerapan sheet Gardu + BA.
 * - Spreadsheet gardu (Script Property GARDU_SHEET_ID, file "Pengukuran Gardu Toboali"), tab BARU milik v2:
 *   Rekap_BA (BA trafo + switching, 1 baris per BA) dan db_Gardu (1 baris per gardu fisik di lokasinya).
 *   Tab lama (Master_Gardu, Rekap Gardu, dst) tidak disentuh.
 * - db_Pejabat_BA di SiSi_Master (Pemeriksa / Mengetahui untuk BA).
 * Struktur DIKUNCI: header harus sama persis dengan konstanta di bawah (urutan + judul), dicek setiap kali dibaca
 * untuk ditulis (cekStrukturGardu_) dan di ADMIN_cekKonfigurasi. Kolom baru hanya boleh DITAMBAH di versi berikutnya
 * lewat migrasi resmi, tidak pernah dikurangi / digeser.
 */
var REKAP_BA_HEADER_ = [
  'No', 'ID BA', 'No BA Full', 'Jenis Peralatan', 'Jenis Pekerjaan', 'Tanggal BA', 'Tanggal Pekerjaan', 'ULP',
  'Asal Nomor Gardu', 'Status Gardu Sesudah BA', 'Penyulang', 'Section', 'Alamat', 'Lat', 'Long', 'Nama Peralatan',
  'Konstruksi', 'Jenis Switching', 'Tipe', 'Merk', 'Nomor Seri', 'Tahun', 'Kapasitas (kVA)', 'Jurusan Terpasang',
  'Kepemilikan', 'OwnerId', 'External Reference', 'Merk PHB-TR', 'Nomor Seri PHB-TR', 'Tahun PHB-TR',
  'Nama Peralatan Sesudah', 'Jenis Switching Sesudah', 'Tipe Sesudah', 'Merk Sesudah', 'Nomor Seri Sesudah',
  'Tahun Sesudah', 'Kapasitas Sesudah (kVA)', 'Jurusan Terpasang Sesudah', 'Asal Peralatan', 'PHB-TR Diganti',
  'Merk PHB-TR Sesudah', 'Nomor Seri PHB-TR Sesudah', 'Tahun PHB-TR Sesudah', 'Penyulang Sesudah', 'Section Sesudah',
  'Lat Sesudah', 'Long Sesudah', 'Panjang Perluasan SUTM (kmS)', 'Vendor Pekerja', 'Kesimpulan', 'Catatan',
  'Alasan Pembongkaran', 'Lokasi Penyimpanan', 'Foto Nameplate', 'Foto Konstruksi', 'Foto Nameplate PHB-TR',
  'Foto Box PHB-TR', 'Foto SLD Sebelum', 'Foto Nameplate Sesudah', 'Foto Konstruksi Sesudah',
  'Foto Nameplate PHB-TR Sesudah', 'Foto Box PHB-TR Sesudah', 'Foto SLD Sesudah', 'Foto Pemeriksaan 1',
  'Foto Pemeriksaan 2', 'Foto Pemeriksaan 3', 'Foto Pemeriksaan 4', 'Foto Pemeriksaan 5', 'Foto Pemeriksaan 6',
  'Petugas 1', 'Jabatan Petugas 1', 'Petugas 2', 'Jabatan Petugas 2', 'Mengetahui', 'Jabatan Mengetahui',
  'Status BA', 'Alasan Batal', 'Waktu Batal', 'BA Sebelumnya', 'Menggantikan BA', 'Digantikan Oleh BA', 'Status PDF',
  'File PDF URL', 'Waktu PDF', 'Revisi BA', 'Alasan Revisi', 'Link BA TTD', 'Status TTD', 'Waktu TTD',
  'Diterapkan ke Master', 'Input Oleh', 'Timestamp', 'Timestamp Update', 'ba_id', 'gardu_id', 'switching_id',
  'section_id', 'section_id_sesudah', 'pejabat_id_1', 'pejabat_id_2', 'pejabat_id_mengetahui', 'foto_meta',
  'pdf_file_id', 'ttd_file_id', 'riwayat_meta', 'install_id', 'ba_id_sebelumnya', 'ba_id_asal', 'ba_id_pengganti',
  'revision', 'dibuat_oleh', 'diubah_oleh'
];

var DB_GARDU_HEADER_ = [
  'No', 'No Gardu', 'Prefix', 'ULP', 'Status Gardu', 'Asal Nomor', 'Lanjutan Dari Gardu', 'Nomor Dipakai Ulang',
  'Alamat', 'Penyulang', 'Section', 'PTS/LBS', 'Lat', 'Long', 'Konstruksi', 'Kapasitas (kVA)', 'Merk', 'Nomor Seri',
  'Tahun', 'Jurusan Terpasang', 'Asal Trafo', 'Merk PHB-TR', 'Nomor Seri PHB-TR', 'Tahun PHB-TR', 'Kepemilikan',
  'OwnerId', 'External Reference', 'BA Pengoperasian', 'Tanggal Operasi', 'BA Terakhir', 'Jenis BA Terakhir',
  'Tanggal BA Terakhir', 'Jumlah BA',
  // pengukuran terakhir (v0.80.0: 10 angka disisipkan di sini, nama sama yan_Gardu)
  'Tanggal Ukur Terakhir', 'Kode Ukur Terakhir', 'Waktu Beban',
  'Beban R (A)', 'Beban S (A)', 'Beban T (A)', 'Beban N (A)', 'Tegangan R-S (V)', 'Tegangan R-T (V)', 'Tegangan S-T (V)',
  'Tegangan R-N (V)', 'Tegangan S-N (V)', 'Tegangan T-N (V)',
  'Arus Maks per Fasa (A)', 'Pembebanan (kVA)', 'Persentase Beban (%)', 'Kategori Beban', 'Sumber Data',
  // v1.0.23 (keputusan kvlar 23 Okt 2026): kolom pengukuran di atas = WBP; blok LWBP lengkap + cover gardu (Inspeksi Gardu)
  'Tanggal Ukur LWBP', 'Kode Ukur LWBP',
  'Beban R LWBP (A)', 'Beban S LWBP (A)', 'Beban T LWBP (A)', 'Beban N LWBP (A)', 'Tegangan R-S LWBP (V)', 'Tegangan R-T LWBP (V)',
  'Tegangan S-T LWBP (V)', 'Tegangan R-N LWBP (V)', 'Tegangan S-N LWBP (V)', 'Tegangan T-N LWBP (V)',
  'Pembebanan LWBP (kVA)', 'Persentase Beban LWBP (%)', 'Kategori Beban LWBP', 'Sumber Data LWBP',
  'Tanggal Cover', 'Cover FCO Atas', 'Cover FCO Bawah', 'Cover Bushing TM', 'Cover Bushing TR', 'Cover Arrester', 'Jumperan Atas', 'Jumperan Bawah',
  'Diubah Oleh',
  'Timestamp', 'Timestamp Update', 'gardu_id', 'gardu_id_lanjutan', 'gardu_id_nomor_baru', 'section_id',
  'ba_id_pengoperasian', 'ba_id_terakhir', 'ukur_id_terakhir', 'ukur_id_lwbp', 'revision', 'dibuat_oleh', 'diubah_oleh'
];

/**
 * v1.0.23: kolom blok pengukuran per periode. Kolom lama (Tanggal Ukur Terakhir, 10 angka, Pembebanan, Persentase,
 * Kategori, Sumber Data, ukur_id_terakhir) = WBP; LWBP punya blok sendiri. Arus Maks per Fasa (nominal trafo) bersama.
 */
var UKUR_BLOK_LWBP_ = {
  'Tanggal Ukur Terakhir': 'Tanggal Ukur LWBP', 'Kode Ukur Terakhir': 'Kode Ukur LWBP',
  'Beban R (A)': 'Beban R LWBP (A)', 'Beban S (A)': 'Beban S LWBP (A)', 'Beban T (A)': 'Beban T LWBP (A)', 'Beban N (A)': 'Beban N LWBP (A)',
  'Tegangan R-S (V)': 'Tegangan R-S LWBP (V)', 'Tegangan R-T (V)': 'Tegangan R-T LWBP (V)', 'Tegangan S-T (V)': 'Tegangan S-T LWBP (V)',
  'Tegangan R-N (V)': 'Tegangan R-N LWBP (V)', 'Tegangan S-N (V)': 'Tegangan S-N LWBP (V)', 'Tegangan T-N (V)': 'Tegangan T-N LWBP (V)',
  'Pembebanan (kVA)': 'Pembebanan LWBP (kVA)', 'Persentase Beban (%)': 'Persentase Beban LWBP (%)', 'Kategori Beban': 'Kategori Beban LWBP',
  'Sumber Data': 'Sumber Data LWBP', ukur_id_terakhir: 'ukur_id_lwbp'
};

/** v1.0.23: 7 isian cover Inspeksi Gardu (kunci INSDU_COVER_) -> kolom db_Gardu. */
var COVER_GARDU_ = { coverFcoAtas: 'Cover FCO Atas', coverFcoBawah: 'Cover FCO Bawah', coverBushingTm: 'Cover Bushing TM',
  coverBushingTr: 'Cover Bushing TR', coverArrester: 'Cover Arrester', jumperanAtas: 'Jumperan Atas', jumperanBawah: 'Jumperan Bawah' };

/** v1.0.23: kolom tanggal db_Gardu, format tampil sel dd mmmm yyyy (16 Oktober 2026). */
var KOLOM_TANGGAL_GARDU_ = ['Tanggal Operasi', 'Tanggal BA Terakhir', 'Tanggal Ukur Terakhir', 'Tanggal Ukur LWBP', 'Tanggal Cover'];

/**
 * v1.0.23: isian pengukuran (bernama kolom lama / WBP) -> kolom blok [periode]. WBP = nama sama + Waktu Beban WBP.
 * Kunci di luar blok (Arus Maks, Diubah Oleh, Timestamp, ...) ikut apa adanya.
 */
function kolomUkurPeriode_(periode, u) {
  var hasil = {};
  Object.keys(u).forEach(function (k) {
    if (k === 'Waktu Beban') return;
    hasil[periode === 'LWBP' && UKUR_BLOK_LWBP_[k] ? UKUR_BLOK_LWBP_[k] : k] = u[k];
  });
  if (periode !== 'LWBP') hasil['Waktu Beban'] = 'WBP';
  return hasil;
}

/** v1.0.23: nilai blok [periode] dari baris db_Gardu, dengan nama kolom lama / WBP (kebalikan kolomUkurPeriode_). */
function ukurBlokGardu_(g, periode) {
  var hasil = {};
  Object.keys(UKUR_BLOK_LWBP_).forEach(function (k) { hasil[k] = g[periode === 'LWBP' ? UKUR_BLOK_LWBP_[k] : k]; });
  return hasil;
}

/** v1.0.23: tanggal ukur terbaru gardu (WBP atau LWBP), yyyy-MM-dd atau ''. */
function tglUkurTerbaruGardu_(g) {
  var a = tglSel_(g['Tanggal Ukur Terakhir']), b = tglSel_(g['Tanggal Ukur LWBP']);
  return a > b ? a : b;
}

var DB_PEJABAT_BA_HEADER_ = ['pejabat_id', 'nama', 'jabatan', 'peran', 'urutan', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'];

var BA_JENIS_PERALATAN_ = ['TRAFO', 'SWITCHING'];
var BA_JENIS_PEKERJAAN_ = {
  TRAFO: ['Pengoperasian Trafo', 'Penggantian Trafo', 'Pemeriksaan Trafo', 'Pembongkaran Sementara Trafo', 'Pembongkaran Trafo'],
  SWITCHING: ['Pengoperasian Switching', 'Penggantian Switching', 'Relokasi Switching', 'Pemeriksaan Switching', 'Kerusakan Switching']
};
var GARDU_STATUS_ = ['AKTIF', 'TIDAK AKTIF', 'BONGKAR RAMPUNG', 'BATAL'];
var GARDU_ASAL_NOMOR_ = ['BARU', 'ULANG BATAL', 'ULANG LOKASI SAMA', 'ULANG LOKASI LAIN'];
var GARDU_PREFIX_ = ['TB', 'PY', 'TL', 'PG'];
var PEJABAT_PERAN_ = ['PEMERIKSA', 'MENGETAHUI'];

/** Kategori beban trafo (sama v1 gardu_card_widgets): Underload < 50, Cukup < 80, Overload < 100, Buruk >= 100. */
function kategoriBeban_(persen) {
  var p = Number(persen);
  if (persen === '' || persen === null || persen === undefined || !isFinite(p)) return '';
  if (p < 50) return 'Underload';
  if (p < 80) return 'Cukup';
  if (p < 100) return 'Overload';
  return 'Buruk';
}

/** Header sheet (tanpa kolom kosong di ujung) dibanding header harapan. Hasil: daftar beda, kosong = sama persis. */
function bedaStruktur_(ada, harap) {
  var a = (ada || []).map(function (x) { return String(x === null || x === undefined ? '' : x).trim(); });
  while (a.length && !a[a.length - 1]) a.pop();
  var beda = [];
  for (var i = 0; i < Math.max(a.length, harap.length); i++) {
    if (a[i] !== harap[i]) beda.push(kolomHuruf_(i + 1) + ': harap "' + (harap[i] || '-') + '", ada "' + (a[i] || '-') + '"');
  }
  return beda;
}

function kolomHuruf_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Struktur gardu per sheet (idKey, nama, header). */
function strukturGardu_() {
  return [
    { idKey: 'GARDU_SHEET_ID', nama: 'Rekap_BA', header: REKAP_BA_HEADER_ },
    { idKey: 'GARDU_SHEET_ID', nama: 'db_Gardu', header: DB_GARDU_HEADER_ },
    { idKey: 'GARDU_SHEET_ID', nama: 'res_NomorGardu', header: RES_NOMOR_HEADER_ },   // v0.73.0 pesan nomor per BA
    { idKey: 'MASTER_SHEET_ID', nama: 'db_Pejabat_BA', header: DB_PEJABAT_BA_HEADER_ }
  ];
}

/** Baca sheet gardu untuk ditulis: struktur beda sedikit saja = tolak (STRUKTUR_BERUBAH), tidak ada yang ditulis. */
function cekStrukturGardu_(idKey, nama) {
  var s = strukturGardu_().filter(function (x) { return x.idKey === idKey && x.nama === nama; })[0];
  if (!s) throw new SisiError_('SHEET_TIDAK_ADA', nama);
  var t = tabel_(idKey, nama);
  var beda = bedaStruktur_(t.header, s.header);
  if (beda.length) throw new SisiError_('STRUKTUR_BERUBAH', nama + ' ' + beda.slice(0, 3).join('; '));
  return t;
}

/** Validasi dropdown di kolom (baris 2 ke bawah). Gagal (mis. stub) = diabaikan, bukan inti keamanan. */
function pasangDropdown_(sh, header, kolom, pilihan) {
  var i = header.indexOf(kolom);
  if (i === -1 || typeof SpreadsheetApp.newDataValidation !== 'function') return;
  var aturan = SpreadsheetApp.newDataValidation().requireValueInList(pilihan, true).setAllowInvalid(false).build();
  sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(aturan);
}

/**
 * Proteksi tab: hanya akun script (pemilik deploy) yang boleh edit, orang lain lihat saja.
 * Hasil: teks status untuk log. Gagal (bukan pemilik file / domain membatasi) = peringatan, bukan error.
 */
function proteksiSheet_(sh) {
  try {
    if (typeof sh.protect !== 'function') return 'proteksi dilewati (tidak didukung)';
    var p = sh.protect().setDescription('SiSi v2: hanya ditulis script');
    var aku = Session.getEffectiveUser();
    p.addEditor(aku);
    p.removeEditors(p.getEditors().filter(function (e) { return e.getEmail() !== aku.getEmail(); }));
    if (p.canDomainEdit()) p.setDomainEdit(false);
    return 'diproteksi (editor: ' + aku.getEmail() + ')';
  } catch (e) {
    return 'PERINGATAN proteksi gagal: ' + (e.message || e) + '. Proteksi manual: Data > Lindungi sheet.';
  }
}

/**
 * v0.67.0: buat tab Rekap_BA + db_Gardu (GARDU_SHEET_ID) dan db_Pejabat_BA (SiSi_Master) bila belum ada:
 * header, baris 1 dibekukan, dropdown, proteksi. Sudah ada = HANYA dicek strukturnya (tidak ditulis ulang).
 * Jalankan dari editor Apps Script sesudah deploy. Aman dijalankan berulang.
 */
function ADMIN_siapkanSheetGardu() {
  pastikanPemilik_();
  var c = cfg_();
  if (!c.GARDU_SHEET_ID) { console.error('GARDU_SHEET_ID kosong: isi Script Property dengan ID spreadsheet Pengukuran Gardu Toboali.'); return; }
  var masalah = 0;
  denganLock_(function () {
    strukturGardu_().forEach(function (s) {
      var ss = bukaSpreadsheet_(c[s.idKey]);
      var sh = ss.getSheetByName(s.nama);
      if (!sh) {
        sh = ss.insertSheet(s.nama);
        if (typeof sh.getMaxColumns === 'function' && sh.getMaxColumns() < s.header.length) {
          sh.insertColumnsAfter(sh.getMaxColumns(), s.header.length - sh.getMaxColumns());
        }
        sh.getRange(1, 1, 1, s.header.length).setValues([s.header.slice()]);
        if (typeof sh.setFrozenRows === 'function') sh.setFrozenRows(1);
        if (s.nama === 'Rekap_BA') {
          pasangDropdown_(sh, s.header, 'Jenis Peralatan', BA_JENIS_PERALATAN_);
          pasangDropdown_(sh, s.header, 'Jenis Pekerjaan', BA_JENIS_PEKERJAAN_.TRAFO.concat(BA_JENIS_PEKERJAAN_.SWITCHING));
          pasangDropdown_(sh, s.header, 'Status BA', ['AKTIF', 'BATAL']);
          pasangDropdown_(sh, s.header, 'Status PDF', PDF_STATUS_);   // v0.71.0
          pasangDropdown_(sh, s.header, 'Status Gardu Sesudah BA', GARDU_STATUS_);
        }
        if (s.nama === 'db_Gardu') {
          pasangDropdown_(sh, s.header, 'Status Gardu', GARDU_STATUS_);
          pasangDropdown_(sh, s.header, 'Asal Nomor', GARDU_ASAL_NOMOR_);
          formatTanggalGardu_(sh, s.header);   // v1.0.23
        }
        if (s.nama === 'db_Pejabat_BA') pasangDropdown_(sh, s.header, 'peran', PEJABAT_PERAN_);
        if (s.nama === 'res_NomorGardu') pasangDropdown_(sh, s.header, 'Status', RES_STATUS_);
        var pr = s.idKey === 'GARDU_SHEET_ID' ? proteksiSheet_(sh) : 'master (proteksi mengikuti SiSi_Master)';
        if (/PERINGATAN/.test(pr)) masalah++;
        console.log(s.nama + ': dibuat (' + s.header.length + ' kolom), ' + pr);
        return;
      }
      var t = tabel_(s.idKey, s.nama);
      var beda = bedaStruktur_(t.header, s.header);
      if (beda.length) {
        masalah++;
        console.error(s.nama + ': STRUKTUR BERUBAH (' + beda.length + ' kolom beda), tidak diubah. ' + beda.slice(0, 5).join(' | ') +
          (s.nama === 'db_Gardu' ? ' -> jalankan ADMIN_rombakDbGardu (susun ulang kolom menurut nama, isi tetap)' : ''));
      } else console.log(s.nama + ': sudah ada, struktur OK (' + t.rows.length + ' baris).');
    });
  });
  console.log(masalah ? 'SELESAI dengan ' + masalah + ' masalah' : 'SEMUA OK');
}

/** v1.0.23: jam ukur HH:mm dari sel: Date (Sheets) = jam WIB, teks ISO = jam di teks, 'HH:mm...' = apa adanya. */
function jamUkurSel_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, 'Asia/Jakarta', 'HH:mm');
  var s = String(v === null || v === undefined ? '' : v).trim(), m = /T(\d{2}:\d{2})/.exec(s) || /^(\d{1,2}:\d{2})/.exec(s);
  return m ? m[1] : '';
}

var BULAN_JS_ = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

/**
 * v1.0.23 (laporan kvlar: tanggal ukur 'Fri Oct 16'): teks tanggal gaya JavaScript = String(Date) dari sel yang diubah
 * Sheets menjadi tanggal, kadang terpotong 10 huruf. -> yyyy-MM-dd. Tanpa tahun = tahun terdekat yang tidak melewati
 * [hariIni] (pengukuran tidak pernah di masa depan). Bukan pola ini = ''.
 */
function tglTeksJs_(v, hariIni) {
  var m = /^(?:[A-Z][a-z]{2} )?([A-Z][a-z]{2}) (\d{1,2})(?: (\d{4}))?/.exec(String(v === null || v === undefined ? '' : v).trim());
  if (!m || !BULAN_JS_[m[1]]) return '';
  var bd = pad2_(BULAN_JS_[m[1]]) + '-' + pad2_(Number(m[2]));
  if (m[3]) return m[3] + '-' + bd;
  var hari = hariIni || tglJakarta_(new Date()), y = Number(hari.slice(0, 4));
  return (y + '-' + bd) > hari ? (y - 1) + '-' + bd : y + '-' + bd;
}

/**
 * v1.0.23 editor: perbaiki tanggal db_Gardu yang tersimpan sebagai teks String(Date) (mis. 'Fri Oct 16') menjadi
 * yyyy-MM-dd, lalu format kolom tanggal dd mmmm yyyy. Tanggal yang sudah benar tidak disentuh. Aman diulang.
 */
function ADMIN_perbaikiTanggalGardu() {
  pastikanPemilik_();
  return denganLock_(function () {
    var t = cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu'), isi = [], hariIni = tglJakarta_(new Date());
    t.rows.forEach(function (r) {
      var u = perbaikanTanggalGardu_(r, hariIni);
      if (Object.keys(u).length) isi.push({ r: r, u: u });
    });
    if (isi.length) tulisBlok_(t, isi, []);
    formatTanggalGardu_(t.sheet, t.header);
    console.log('Tanggal db_Gardu diperbaiki: ' + isi.length + ' gardu' +
      (isi.length ? ' (' + isi.slice(0, 10).map(function (x) { return teksGarduLama_(x.r['No Gardu']); }).join(', ') + (isi.length > 10 ? ', ...' : '') + ')' : '') +
      '. Kolom tanggal tampil dd mmmm yyyy.');
    return { diperbaiki: isi.length };
  });
}

/** Kolom tanggal satu baris db_Gardu yang berisi teks String(Date) -> {kolom: yyyy-MM-dd} (murni). */
function perbaikanTanggalGardu_(r, hariIni) {
  var u = {};
  KOLOM_TANGGAL_GARDU_.forEach(function (k) {
    var v = r[k];
    if (v === '' || v === null || v === undefined || Object.prototype.toString.call(v) === '[object Date]') return;
    if (/^\d{4}-\d{2}-\d{2}/.test(String(v).trim())) return;
    var t = tglTeksJs_(v, hariIni);
    if (t) u[k] = t;
  });
  return u;
}

/** v1.0.23: kolom tanggal db_Gardu tampil dd mmmm yyyy (16 Oktober 2026). Stub tanpa format = dilewati. */
function formatTanggalGardu_(sh, header) {
  KOLOM_TANGGAL_GARDU_.forEach(function (k) {
    var i = header.indexOf(k);
    if (i === -1 || typeof sh.getMaxRows !== 'function') return;
    var r = sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1);
    if (typeof r.setNumberFormat === 'function') r.setNumberFormat('dd mmmm yyyy');
  });
}

/**
 * v1.0.23 (murni, mengubah [baris] di tempat): kolom lama berisi pengukuran LWBP (Waktu Beban LWBP) dan blok LWBP masih
 * kosong = nilainya dipindah ke blok LWBP, kolom lama dikosongkan (kolom lama sekarang khusus WBP). Hasil: jumlah baris.
 */
function pindahUkurLwbpGardu_(baris, header) {
  var i = function (k) { return header.indexOf(k); }, n = 0;
  baris.forEach(function (b) {
    if (String(b[i('Waktu Beban')] || '').trim().toUpperCase() !== 'LWBP') return;
    if (String(b[i('Tanggal Ukur LWBP')] || '').trim()) return;
    Object.keys(UKUR_BLOK_LWBP_).forEach(function (k) {
      b[i(UKUR_BLOK_LWBP_[k])] = b[i(k)];
      b[i(k)] = '';
    });
    b[i('Waktu Beban')] = '';
    n++;
  });
  return n;
}

/** v0.67.0: jumlah sel spreadsheet (batas Google 10 juta). Hasil { sel, sheet } atau null kalau tidak terbaca. */
function jumlahSelSpreadsheet_(id) {
  try {
    var sh = bukaSpreadsheet_(id).getSheets();
    var n = 0;
    sh.forEach(function (s) { n += s.getMaxRows() * s.getMaxColumns(); });
    return { sel: n, sheet: sh.length };
  } catch (e) { return null; }
}


/**
 * v0.80.0 (keputusan kvlar 10 Okt 2026, masih staging): susun ulang db_Gardu ke struktur terbaru MENURUT NAMA KOLOM.
 * Isi tiap sel ikut kolomnya (tidak ada yang hilang): kolom lama yang tidak dikenal / judul ganda = dibatalkan tanpa menulis.
 * Kolom baru = kosong. Revision tidak berubah. Sudah sesuai = tidak menulis apa pun.
 */
function ADMIN_rombakDbGardu() {
  pastikanPemilik_();
  var c = cfg_();
  if (!c.GARDU_SHEET_ID) { console.error('GARDU_SHEET_ID kosong'); return; }
  return denganLock_(function () {
    var sh = bukaSpreadsheet_(c.GARDU_SHEET_ID).getSheetByName('db_Gardu');
    if (!sh) { console.error('Tab db_Gardu tidak ada: jalankan ADMIN_siapkanSheetGardu'); return { status: 'TIDAK_ADA' }; }
    var semua = sh.getDataRange().getValues();
    var head = (semua[0] || []).map(function (x) { return String(x === null || x === undefined ? '' : x).trim(); });
    while (head.length && !head[head.length - 1]) head.pop();
    if (!bedaStruktur_(head, DB_GARDU_HEADER_).length) { console.log('db_Gardu sudah sesuai struktur terbaru (' + DB_GARDU_HEADER_.length + ' kolom).'); return { status: 'SUDAH' }; }
    var asing = head.filter(function (h) { return h && DB_GARDU_HEADER_.indexOf(h) === -1; });
    var ganda = head.filter(function (h, i) { return h && head.indexOf(h) !== i; });
    var kosongJudul = head.some(function (h) { return !h; });
    if (asing.length || ganda.length || kosongJudul) {
      console.error('Rombak db_Gardu DIBATALKAN (tidak ada yang ditulis): ' + (asing.length ? 'kolom tidak dikenal ' + asing.join(', ') + '; ' : '') +
        (ganda.length ? 'judul ganda ' + ganda.join(', ') + '; ' : '') + (kosongJudul ? 'ada kolom tanpa judul di tengah' : ''));
      return { status: 'BATAL', asing: asing, ganda: ganda };
    }
    var data = semua.slice(1).filter(function (r) { return r.some(function (v) { return v !== '' && v !== null && v !== undefined; }); });
    var baru = [DB_GARDU_HEADER_.slice()].concat(data.map(function (r) {
      return DB_GARDU_HEADER_.map(function (h) { var i = head.indexOf(h); return i === -1 || r[i] === undefined || r[i] === null ? '' : r[i]; });
    }));
    // v1.0.23: kolom lama = WBP. Pengukuran LWBP yang tersimpan di kolom lama dipindah ke blok LWBP (yang masih kosong).
    var pindah = pindahUkurLwbpGardu_(baru.slice(1), DB_GARDU_HEADER_);
    var lebarLama = Math.max(semua[0] ? semua[0].length : 0, sh.getLastColumn());
    if (typeof sh.getMaxColumns === 'function' && sh.getMaxColumns() < DB_GARDU_HEADER_.length) {
      sh.insertColumnsAfter(sh.getMaxColumns(), DB_GARDU_HEADER_.length - sh.getMaxColumns());
    }
    sh.getRange(1, 1, baru.length, DB_GARDU_HEADER_.length).setValues(baru);
    if (lebarLama > DB_GARDU_HEADER_.length) {
      var sisa = lebarLama - DB_GARDU_HEADER_.length;
      sh.getRange(1, DB_GARDU_HEADER_.length + 1, baru.length, sisa).setValues(baru.map(function () { return new Array(sisa).fill(''); }));
    }
    pasangDropdown_(sh, DB_GARDU_HEADER_, 'Status Gardu', GARDU_STATUS_);
    pasangDropdown_(sh, DB_GARDU_HEADER_, 'Asal Nomor', GARDU_ASAL_NOMOR_);
    formatTanggalGardu_(sh, DB_GARDU_HEADER_);
    var tambah = DB_GARDU_HEADER_.filter(function (h) { return head.indexOf(h) === -1; });
    console.log('db_Gardu dirombak: ' + data.length + ' baris, ' + DB_GARDU_HEADER_.length + ' kolom' + (tambah.length ? ', kolom baru: ' + tambah.join(', ') : '') +
      '. Isi tetap' + (pindah ? ', ' + pindah + ' pengukuran LWBP dipindah ke blok LWBP' : '') + '.');
    return { status: 'OK', baris: data.length, tambah: tambah, pindahLwbp: pindah };
  });
}
