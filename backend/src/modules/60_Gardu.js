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
  'Arus Maks per Fasa (A)', 'Pembebanan (kVA)', 'Persentase Beban (%)', 'Kategori Beban', 'Sumber Data', 'Diubah Oleh',
  'Timestamp', 'Timestamp Update', 'gardu_id', 'gardu_id_lanjutan', 'gardu_id_nomor_baru', 'section_id',
  'ba_id_pengoperasian', 'ba_id_terakhir', 'ukur_id_terakhir', 'revision', 'dibuat_oleh', 'diubah_oleh'
];

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
    var tambah = DB_GARDU_HEADER_.filter(function (h) { return head.indexOf(h) === -1; });
    console.log('db_Gardu dirombak: ' + data.length + ' baris, ' + DB_GARDU_HEADER_.length + ' kolom' + (tambah.length ? ', kolom baru: ' + tambah.join(', ') : '') + '. Isi tetap.');
    return { status: 'OK', baris: data.length, tambah: tambah };
  });
}
