/**
 * v0.78.0 (permintaan kvlar 10 Okt 2026): BA TTD, Kirim EAM, Update Master Gardu dari Daftar BA (HP admin).
 *
 *  uploadTtdBaGardu  {baId, uploadId, ke, dari, mime, namaFile, sha256, ukuranByte, data}
 *                    file BA yang sudah ditandatangani (PDF / JPEG / PNG, <= 10 MB) dikirim per bagian <= 2 MB
 *                    (batas body 4 MB). Bagian disimpan sementara di Gardu / _Upload Sementara / <baId>; bagian
 *                    terakhir = digabung, dicek ukuran + sha256 + jenis file, disimpan di folder BA
 *                    (Gardu / <No Gardu> / <YYYY-MM-DD>_<Jenis BA> / BA-TTD-<ID BA>.pdf). Upload ulang = file lama
 *                    dibuang SESUDAH baris menunjuk file baru. Rekap_BA: Link BA TTD, ttd_file_id, Status TTD SUDAH TTD,
 *                    Waktu TTD. Syarat: PDF BA sudah dibuat (Status PDF SELESAI).
 *  getTtdBaGardu     {baId} bytes BA TTD (base64) lewat server, tanpa link Drive.
 *  kirimEamBaGardu   {baId} teks WhatsApp EAM format v1 (getLinkWaBeritaAcara Pengoperasian) + file TTD dilampirkan
 *                    HP. v0.80.0: file TTD dibagikan (Viewer, tanpa link publik) ke akun Google EAM (Script Property
 *                    EAM_EMAIL, dipisah koma), jadi baris "Link BA" v1 kembali: EAM bisa membuka lagi kapan saja tanpa
 *                    minta ke ULP. EAM_EMAIL kosong = "File BA : terlampir" saja. Dicatat di riwayat_meta.eam + log_Audit.
 *  updateMasterGarduBa {baId} terapkan isian BA ke db_Gardu (sama v1 updateMasterGarduDariBA): hanya kalau BA TTD
 *                    sudah diupload (SUDAH TTD) dan tidak ada BA lebih baru untuk gardu itu. Hasil: kolom yang berubah.
 *                    v1.0.35: db_Gardu berubah = gardu itu langsung ditulis ke 3 file sheet lama (sheet: {ok, hasil}).
 *
 * Status TTD: BELUM TTD -> SUDAH TTD -> TTD ULANG (PDF dibuat ulang / BA diedit sesudah TTD = TTD lama tidak berlaku,
 * Kirim EAM + Update Master dikunci sampai BA TTD baru diupload).
 * Tahap BA (filter daftar): DRAFT (PDF belum) | PROSES_TTD (PDF siap, belum TTD) | TTD_ULANG | SELESAI_TTD | BATAL.
 */
var BA_TTD_MAKS_BYTE_ = 10 * 1024 * 1024;
var BA_TTD_BAGIAN_MAKS_ = 2 * 1024 * 1024;
var BA_TTD_MIME_ = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };
var BA_TAHAP_ = ['DRAFT', 'PROSES_TTD', 'TTD_ULANG', 'SELESAI_TTD', 'BATAL'];

function riwayatBa_(r) {
  try { var m = JSON.parse(String(r.riwayat_meta || '{}')); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; } catch (e) { return {}; }
}

/** Status TTD baris (kosong = BELUM TTD). */
function statusTtdBa_(r) {
  var s = teksBa_(r['Status TTD']).toUpperCase();
  if (!teksBa_(r.ttd_file_id)) return 'BELUM TTD';
  return s === 'TTD ULANG' ? 'TTD ULANG' : 'SUDAH TTD';
}

/** Tahap gabungan untuk filter / badge daftar BA. */
function tahapBa_(r) {
  if (teksBa_(r['Status BA']).toUpperCase() === 'BATAL') return 'BATAL';
  var ttd = statusTtdBa_(r);
  if (ttd === 'SUDAH TTD') return 'SELESAI_TTD';
  if (ttd === 'TTD ULANG') return 'TTD_ULANG';
  return teksBa_(r['Status PDF']) === 'SELESAI' && teksBa_(r.pdf_file_id) ? 'PROSES_TTD' : 'DRAFT';
}

/** Ringkasan TTD / EAM / master untuk HP (daftar + detail). */
function infoTtdBa_(r) {
  var rw = riwayatBa_(r);
  return {
    tahap: tahapBa_(r), statusTtd: statusTtdBa_(r), adaTtd: !!teksBa_(r.ttd_file_id),
    waktuTtd: apakahTanggal_(r['Waktu TTD']) ? waktuPdfWib_(r['Waktu TTD']) : teksBa_(r['Waktu TTD']),
    eamTerakhir: rw.eam ? teksBa_(rw.eam.waktu) : '', eamKali: rw.eam ? Number(rw.eam.kali) || 0 : 0,
    masterTerakhir: rw.master ? teksBa_(rw.master.waktu) : ''
  };
}

/** Bytes gabungan bagian upload (urut ke). */
function gabungBytes_(daftar) {
  var n = daftar.reduce(function (m, b) { return m + b.length; }, 0), hasil = new Array(n), i = 0;
  daftar.forEach(function (b) { for (var j = 0; j < b.length; j++) hasil[i++] = b[j]; });
  return hasil;
}

/** Jenis file dari bytes awal (bukan dari nama / mime kiriman). */
function mimeDariBytes_(b) {
  var u = function (i) { return b[i] & 0xFF; };
  if (b.length > 4 && u(0) === 0x25 && u(1) === 0x50 && u(2) === 0x44 && u(3) === 0x46) return 'application/pdf';
  if (b.length > 3 && u(0) === 0xFF && u(1) === 0xD8 && u(2) === 0xFF) return 'image/jpeg';
  if (b.length > 8 && u(0) === 0x89 && u(1) === 0x50 && u(2) === 0x4E && u(3) === 0x47) return 'image/png';
  return '';
}

/** v0.80.0: akun Google EAM (Script Property EAM_EMAIL, dipisah koma / spasi). Email tidak valid dilewati. */
function emailEam_() {
  return String(PropertiesService.getScriptProperties().getProperty('EAM_EMAIL') || '').split(/[\s,;]+/)
    .map(function (e) { return e.trim().toLowerCase(); })
    .filter(function (e) { return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e); });
}

/** Bagikan file ke akun EAM sebagai Viewer (akses link tetap Dibatasi). Hasil jumlah akun yang bisa membuka. */
function bagikanKeEam_(file) {
  var daftar = emailEam_();
  if (!daftar.length) return 0;
  var ada = {};
  try { (file.getViewers() || []).forEach(function (u) { ada[String(u.getEmail()).toLowerCase()] = true; }); } catch (e) { /* daftar viewer tidak terbaca */ }
  var ok = 0;
  daftar.forEach(function (e) {
    if (ada[e]) { ok++; return; }
    try { file.addViewer(e); ok++; } catch (eV) { console.warn('Bagikan BA TTD ke ' + e + ' gagal: ' + (eV && eV.message)); }
  });
  pastikanPdfPrivat_(file);   // tetap tanpa link publik
  return ok;
}

function namaBagianTtd_(uploadId, ke) { return 'ttd-' + uploadId + '-' + ke + '.part'; }

function uploadTtdBaGardu_(sesi, data, platform) {
  wajibAdminBa_(sesi);
  var d = validasi_(data, {
    baId: { tipe: 'uuid', wajib: true },
    uploadId: { tipe: 'uuid', wajib: true },
    ke: { tipe: 'angka', wajib: true, bulat: true, min: 1, max: 5 },
    dari: { tipe: 'angka', wajib: true, bulat: true, min: 1, max: 5 },
    mime: { tipe: 'pilihan', wajib: true, pilihan: Object.keys(BA_TTD_MIME_) },
    namaFile: { tipe: 'teks', maks: 120 },
    sha256: { tipe: 'teks', wajib: true, maks: 64, pola: /^[0-9a-f]{64}$/ },
    ukuranByte: { tipe: 'angka', wajib: true, bulat: true, min: 1, max: BA_TTD_MAKS_BYTE_ },
    data: { tipe: 'teks', wajib: true, maks: Math.ceil(BA_TTD_BAGIAN_MAKS_ / 3) * 4 + 4 }
  });
  if (d.mime !== 'application/pdf') throw new SisiError_('FORMAT_FILE_SALAH', d.mime);
  if (d.ke > d.dari) throw new SisiError_('FORMAT_SALAH', 'ke');
  if (Math.ceil(d.ukuranByte / BA_TTD_BAGIAN_MAKS_) !== d.dari) throw new SisiError_('FORMAT_SALAH', 'dari');
  var bytes;
  try { bytes = Utilities.base64Decode(d.data); } catch (e) { throw new SisiError_('FORMAT_SALAH', 'data'); }
  if (!bytes.length || bytes.length > BA_TTD_BAGIAN_MAKS_) throw new SisiError_('FILE_TERLALU_BESAR', bytes.length);
  if (d.ke === 1 && mimeDariBytes_(bytes) !== 'application/pdf') {
    throw new SisiError_('FORMAT_FILE_SALAH', mimeDariBytes_(bytes) || 'bukan PDF');
  }
  var r = barisBaAktif_(cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA').rows, d.baId);
  if (teksBa_(r['Status PDF']) !== 'SELESAI' || !teksBa_(r.pdf_file_id)) throw new SisiError_('PDF_BELUM_ADA', teksBa_(r['ID BA']));
  var sementara = folderUploadBa_(d.baId);
  var nama = namaBagianTtd_(d.uploadId, d.ke);
  var lamaBagian = sementara.getFilesByName(nama);
  while (lamaBagian.hasNext()) { try { lamaBagian.next().setTrashed(true); } catch (eL) { /* dibiarkan */ } }
  if (d.ke < d.dari) {
    if (bytes.length !== BA_TTD_BAGIAN_MAKS_) throw new SisiError_('FORMAT_SALAH', 'ukuran bagian');
    var part = sementara.createFile(Utilities.newBlob(bytes, 'application/octet-stream', nama));
    pastikanFotoPrivat_(part, true);
    return { status: 'BAGIAN', ke: d.ke, dari: d.dari };
  }
  // bagian terakhir: gabung + cek
  var bagian = [], partFile = [];
  for (var k = 1; k < d.dari; k++) {
    var it = sementara.getFilesByName(namaBagianTtd_(d.uploadId, k)), f = null;
    while (it.hasNext()) { var x = it.next(); if (!dibuangDrive_(x)) { f = x; break; } }
    if (!f) throw new SisiError_('BAGIAN_HILANG', k);
    bagian.push(f.getBlob().getBytes()); partFile.push(f);
  }
  bagian.push(bytes);
  var semua = gabungBytes_(bagian);
  var buangBagian = function () { partFile.forEach(function (f) { try { f.setTrashed(true); } catch (eB) { /* dibiarkan */ } }); };
  if (semua.length !== d.ukuranByte) { buangBagian(); throw new SisiError_('FILE_RUSAK', 'ukuran'); }
  if (bytesKeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, semua)) !== d.sha256) { buangBagian(); throw new SisiError_('FILE_RUSAK', 'sha256'); }
  var mime = mimeDariBytes_(semua);
  if (mime !== 'application/pdf') { buangBagian(); throw new SisiError_('FORMAT_FILE_SALAH', mime || 'bukan PDF'); }

  var namaTtd = 'BA-TTD-' + String(teksBa_(r['ID BA']) || d.baId).replace(/[\\\/:*?"<>|\x00-\x1f]+/g, '-').slice(0, 80) + BA_TTD_MIME_[mime];
  var file = folderBa_(r).createFile(Utilities.newBlob(semua, mime, namaTtd));
  try { file.setDescription('sisi-ba-ttd:' + d.baId); } catch (eD) { /* tanpa penanda */ }
  pastikanPdfPrivat_(file);
  bagikanKeEam_(file);   // v0.80.0: EAM bisa membuka lagi lewat Link BA
  buangBagian();
  var tulis;
  try {
    tulis = denganLock_(function () {
      var t = cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA');
      var tLog = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
      var x2 = barisBaAktif_(t.rows, d.baId);
      var lama = teksBa_(x2.ttd_file_id), waktu = waktuPdfWib_();
      tulisBlok_(t, [{ r: x2, u: {
        'Link BA TTD': urlPdf_(file.getId()), ttd_file_id: file.getId(), 'Status TTD': 'SUDAH TTD', 'Waktu TTD': waktu,
        'Timestamp Update': sekarangIso_(), diubah_oleh: sesi.userId || sesi.username || ''
      } }], [], { bolehId: ['ttd_file_id'] });
      auditLog_(sesi, 'BA_GARDU_TTD', teksBa_(x2['ID BA']), (lama ? 'upload ulang ' : 'upload ') + namaTtd + ' (' + semua.length + ' byte)', platform, tLog);
      return { baris: x2, lama: lama };
    });
  } catch (eS) {
    try { file.setTrashed(true); } catch (eX) { /* dibiarkan */ }
    throw eS;
  }
  if (tulis.lama && tulis.lama !== file.getId()) { try { DriveApp.getFileById(tulis.lama).setTrashed(true); } catch (eT) { /* sudah tidak ada */ } }
  bersihkanUploadBa_(teksBa_(r['Jenis Pekerjaan']), d.baId);
  return Object.assign({ status: 'OK', baId: d.baId, idBa: teksBa_(r['ID BA']), namaFile: namaTtd, fileId: file.getId(), ulang: !!tulis.lama },
    infoTtdBa_(tulis.baris));
}

function getTtdBaGardu_(sesi, data) {
  wajibAdminBa_(sesi);
  var d = validasi_(data, { baId: { tipe: 'uuid', wajib: true } });
  var r = barisBa_(cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA').rows, d.baId);
  if (!r) throw new SisiError_('BA_TIDAK_DITEMUKAN', d.baId);
  var id = teksBa_(r.ttd_file_id);
  if (!id) throw new SisiError_('TTD_BELUM_ADA', teksBa_(r['ID BA']));
  var file;
  try { file = DriveApp.getFileById(id); } catch (e) { throw new SisiError_('TTD_BELUM_ADA', 'file Drive'); }
  var bytes = file.getBlob().getBytes();
  if (bytes.length > BA_TTD_MAKS_BYTE_) throw new SisiError_('FILE_TERLALU_BESAR', bytes.length);
  var mime = mimeDariBytes_(bytes);
  if (!mime) throw new SisiError_('FORMAT_FILE_SALAH', 'file TTD');
  return Object.assign({ baId: d.baId, idBa: teksBa_(r['ID BA']), namaFile: file.getName(), mime: mime, ukuranByte: bytes.length,
    data: Utilities.base64Encode(bytes) }, infoTtdBa_(r));
}

/** TTD wajib SUDAH TTD (bukan belum / perlu ulang) untuk Kirim EAM + Update Master. */
function wajibTtdBa_(r) {
  var s = statusTtdBa_(r);
  if (s === 'BELUM TTD') throw new SisiError_('TTD_BELUM_ADA', teksBa_(r['ID BA']));
  if (s === 'TTD ULANG') throw new SisiError_('TTD_PERLU_ULANG', teksBa_(r['ID BA']));
}

function tglPanjangBa_(v) {
  var t = tglSelBa_(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return Number(t.slice(8, 10)) + ' ' + BULAN_ID_[Number(t.slice(5, 7)) - 1] + ' ' + t.slice(0, 4);
}

/** Teks WA EAM format v1 (getLinkWaBeritaAcara, Pengoperasian). File BA TTD dilampirkan HP; link kalau EAM punya akses. */
function teksEamBa_(r, namaFile, link) {
  var jenis = teksBa_(r['Jenis Pekerjaan']);
  var lat = teksBa_(r.Lat), lng = teksBa_(r.Long);
  var ekor = (link ? ['Link BA : ' + link] : []).concat(['File BA : terlampir (' + namaFile + ')']);
  if (jenis === 'Penggantian Trafo') {
    return [
      '*' + jenis.toUpperCase() + ' ULP TOBOALI*', '',
      'Tanggal : ' + tglPanjangBa_(r['Tanggal BA']), '',
      '*DATA TRAFO SEBELUM*',
      'Nomor Gardu : ' + teksBa_(r['Nama Peralatan']),
      'Kapasitas : ' + angkaPdf_(r['Kapasitas (kVA)']) + 'kVA',
      'Merk : ' + teksBa_(r.Merk),
      'Nomor Seri : ' + teksBa_(r['Nomor Seri']),
      'Tahun : ' + teksBa_(r.Tahun),
      'Konstruksi : ' + teksBa_(r.Konstruksi),
      'Alamat : ' + teksBa_(r.Alamat), '',
      '*DATA TRAFO SESUDAH*',
      'Nomor Gardu : ' + teksBa_(r['Nama Peralatan']),
      'Kapasitas : ' + angkaPdf_(r['Kapasitas Sesudah (kVA)']) + 'kVA',
      'Merk : ' + teksBa_(r['Merk Sesudah']),
      'Nomor Seri : ' + teksBa_(r['Nomor Seri Sesudah']),
      'Tahun : ' + teksBa_(r['Tahun Sesudah']),
      'Alamat : ' + teksBa_(r.Alamat),
      'Asal Trafo : ' + teksBa_(r['Asal Peralatan']), '',
      '*DATA PHB-TR SEBELUM*',
      'Merk PHB-TR : ' + teksBa_(r['Merk PHB-TR']),
      'Nomor Seri PHB-TR : ' + teksBa_(r['Nomor Seri PHB-TR']),
      'Tahun PHB-TR : ' + teksBa_(r['Tahun PHB-TR']),
      'Jumlah Jurusan : ' + teksBa_(r['Jurusan Terpasang']), '',
      '*DATA PHB-TR SESUDAH*',
      'Merk PHB-TR : ' + (teksBa_(r['Merk PHB-TR Sesudah']) || teksBa_(r['Merk PHB-TR'])),
      'Nomor Seri PHB-TR : ' + (teksBa_(r['Nomor Seri PHB-TR Sesudah']) || teksBa_(r['Nomor Seri PHB-TR'])),
      'Tahun PHB-TR : ' + (teksBa_(r['Tahun PHB-TR Sesudah']) || teksBa_(r['Tahun PHB-TR'])),
      'Jumlah Jurusan : ' + (teksBa_(r['Jurusan Terpasang Sesudah']) || teksBa_(r['Jurusan Terpasang'])), ''
    ].concat(ekor).join('\n');
  }
  if (jenis.toLowerCase().indexOf('pengoperasian') === -1) throw new SisiError_('JENIS_BA_BELUM_TERSEDIA', jenis);
  return [
    '*' + jenis.toUpperCase() + ' ULP TOBOALI*', '',
    'Tanggal : ' + tglPanjangBa_(r['Tanggal BA']), '',
    '*DATA TRAFO*',
    'Nomor Gardu : ' + teksBa_(r['Nama Peralatan']),
    'Kapasitas : ' + angkaPdf_(r['Kapasitas (kVA)']) + 'kVA',
    'Merk : ' + teksBa_(r.Merk),
    'Nomor Seri : ' + teksBa_(r['Nomor Seri']),
    'Tahun : ' + teksBa_(r.Tahun),
    'Konstruksi : ' + teksBa_(r.Konstruksi),
    'Alamat : ' + teksBa_(r.Alamat),
    'Penyulang : ' + teksBa_(r.Penyulang),
    'Section : ' + teksBa_(r.Section),
    'Koordinat : ' + lat + ', ' + lng,
    'Kepemilikan : ' + teksBa_(r.Kepemilikan),
    'OwnerID : ' + teksBa_(r.OwnerId),
    'External Reference : ' + teksBa_(r['External Reference']),
    'Perluasan SUTM : ' + angkaPdf_(r['Panjang Perluasan SUTM (kmS)']) + 'kmS',
    'Vendor Pelaksana : ' + teksBa_(r['Vendor Pekerja']), '',
    '*DATA PHB-TR*',
    'Merk : ' + teksBa_(r['Merk PHB-TR']),
    'Nomor Seri : ' + teksBa_(r['Nomor Seri PHB-TR']),
    'Tahun : ' + teksBa_(r['Tahun PHB-TR']),
    'Jurusan : ' + teksBa_(r['Jurusan Terpasang']), ''
  ].concat(ekor).join('\n');
}

function kirimEamBaGardu_(sesi, data, platform) {
  wajibAdminBa_(sesi);
  var d = validasi_(data, { baId: { tipe: 'uuid', wajib: true } });
  var awal = barisBaAktif_(cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA').rows, d.baId);
  wajibTtdBa_(awal);
  var namaFile = '', fTtd, akunEam = 0;
  try { fTtd = DriveApp.getFileById(teksBa_(awal.ttd_file_id)); namaFile = fTtd.getName(); } catch (e) { throw new SisiError_('TTD_BELUM_ADA', 'file Drive'); }
  akunEam = bagikanKeEam_(fTtd);   // file lama (sebelum EAM_EMAIL diisi) ikut dibagikan
  var teks = teksEamBa_(awal, namaFile, akunEam ? urlPdf_(fTtd.getId()) : '');
  return denganLock_(function () {
    var t = cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA');
    var tLog = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var r = barisBaAktif_(t.rows, d.baId);
    wajibTtdBa_(r);
    var rw = riwayatBa_(r), waktu = waktuPdfWib_();
    rw.eam = { waktu: waktu, oleh: sesi.username || '', kali: ((rw.eam && Number(rw.eam.kali)) || 0) + 1 };
    tulisBlok_(t, [{ r: r, u: { riwayat_meta: JSON.stringify(rw), 'Timestamp Update': sekarangIso_(), diubah_oleh: sesi.userId || sesi.username || '' } }], []);
    auditLog_(sesi, 'BA_GARDU_EAM', teksBa_(r['ID BA']), 'kirim EAM ke-' + rw.eam.kali, platform, tLog);
    return Object.assign({ baId: d.baId, idBa: teksBa_(r['ID BA']), teks: teks, namaFile: namaFile, aksesEam: akunEam,
      peringatan: akunEam ? [] : ['EAM_EMAIL belum diisi: EAM hanya menerima lampiran, belum bisa membuka lagi lewat link'] }, infoTtdBa_(r));
  });
}

/** Kolom db_Gardu <- kolom Rekap_BA (Pengoperasian Trafo). */
var BA_KE_MASTER_ = [
  ['Alamat', 'Alamat'], ['Penyulang', 'Penyulang'], ['Section', 'Section'], ['PTS/LBS', 'Section'], ['Lat', 'Lat'], ['Long', 'Long'],
  ['Konstruksi', 'Konstruksi'], ['Kapasitas (kVA)', 'Kapasitas (kVA)'], ['Merk', 'Merk'], ['Nomor Seri', 'Nomor Seri'], ['Tahun', 'Tahun'],
  ['Jurusan Terpasang', 'Jurusan Terpasang'], ['Merk PHB-TR', 'Merk PHB-TR'], ['Nomor Seri PHB-TR', 'Nomor Seri PHB-TR'],
  ['Tahun PHB-TR', 'Tahun PHB-TR'], ['Kepemilikan', 'Kepemilikan'], ['OwnerId', 'OwnerId'], ['External Reference', 'External Reference'],
  ['section_id', 'section_id']
];

function nilaiBanding_(v) {
  if (apakahTanggal_(v)) return tglSelBa_(v);
  return String(v === null || v === undefined ? '' : v).trim();
}

function updateMasterGarduBa_(sesi, data, platform) {
  wajibAdminBa_(sesi);
  var d = validasi_(data, { baId: { tipe: 'uuid', wajib: true } });
  return denganLock_(function () {
    var tR = cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA');
    var tG = cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu');
    var tLog = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var r = barisBaAktif_(tR.rows, d.baId);
    var jenis = teksBa_(r['Jenis Pekerjaan']);
    if (BA_JENIS_SIAP_.indexOf(jenis) === -1) throw new SisiError_('JENIS_BA_BELUM_TERSEDIA', jenis);
    wajibTtdBa_(r);
    var g = tG.rows.filter(function (x) { return String(x.gardu_id) === teksBa_(r.gardu_id); })[0] || null;
    if (!g) throw new SisiError_('GARDU_TIDAK_DITEMUKAN', teksBa_(r['Nama Peralatan']));
    var tglBa = tglSelBa_(r['Tanggal BA']), tglMaster = tglSelBa_(g['Tanggal BA Terakhir']);
    // sama v1: master hanya ditimpa BA yang tidak lebih lama dari BA terakhir gardu itu
    if (String(g.ba_id_terakhir) !== d.baId && tglMaster && tglMaster > tglBa) {
      throw new SisiError_('MASTER_LEBIH_BARU', teksBa_(g['No Gardu']) + ' BA terakhir ' + tglMaster);
    }
    var u = {};
    BA_KE_MASTER_.forEach(function (p) { u[p[0]] = r[p[1]] === undefined ? '' : r[p[1]]; });
    if (jenis === 'Penggantian Trafo') {
      u['Kapasitas (kVA)'] = r['Kapasitas Sesudah (kVA)'] === undefined ? '' : r['Kapasitas Sesudah (kVA)'];
      u.Merk = teksBa_(r['Merk Sesudah']);
      u['Nomor Seri'] = teksBa_(r['Nomor Seri Sesudah']);
      u.Tahun = r['Tahun Sesudah'] === undefined ? '' : r['Tahun Sesudah'];
      u['Asal Trafo'] = teksBa_(r['Asal Peralatan']);
      if (teksBa_(r['Jurusan Terpasang Sesudah']) !== '') u['Jurusan Terpasang'] = r['Jurusan Terpasang Sesudah'];
      if (teksBa_(r['Merk PHB-TR Sesudah']) !== '') u['Merk PHB-TR'] = r['Merk PHB-TR Sesudah'];
      if (teksBa_(r['Nomor Seri PHB-TR Sesudah']) !== '') u['Nomor Seri PHB-TR'] = r['Nomor Seri PHB-TR Sesudah'];
      if (teksBa_(r['Tahun PHB-TR Sesudah']) !== '') u['Tahun PHB-TR'] = r['Tahun PHB-TR Sesudah'];
    }
    Object.assign(u, { 'BA Terakhir': teksBa_(r['No BA Full']), 'Jenis BA Terakhir': jenis, 'Tanggal BA Terakhir': tglBa, ba_id_terakhir: d.baId });
    if (String(g.ba_id_pengoperasian) === d.baId) {
      u['BA Pengoperasian'] = teksBa_(r['No BA Full']);
      u['Tanggal Operasi'] = tglSelBa_(r['Tanggal Pekerjaan']);
    }
    var diubah = Object.keys(u).filter(function (k) { return nilaiBanding_(g[k]) !== nilaiBanding_(u[k]); }).map(function (k) {
      return { kolom: k, lama: nilaiBanding_(g[k]), baru: nilaiBanding_(u[k]) };
    });
    var sekarang = sekarangIso_(), oleh = sesi.userId || sesi.username || '', waktu = waktuPdfWib_(), sheet = null;
    if (diubah.length) {
      tulisBlok_(tG, [{ r: g, u: Object.assign(u, { 'Diubah Oleh': sesi.username || '', 'Timestamp Update': sekarang, diubah_oleh: oleh }) }], [],
        { bolehId: ['section_id', 'ba_id_terakhir'] });
      // v1.0.35 (keputusan kvlar 26 Okt 2026): db_Gardu sumber utama, 3 file sheet lama langsung mengikuti (gagal = disusul 05:00)
      var t = tulisGarduKeSheetLama_(konteksSheetLama_(), g);
      catatSinkronHi_(tG, g, t);
      sheet = { ok: t.ok, hasil: t.hasil };
    }
    var rw = riwayatBa_(r);
    rw.master = { waktu: waktu, oleh: sesi.username || '', kolom: diubah.length };
    tulisBlok_(tR, [{ r: r, u: { 'Diterapkan ke Master': 'YA', riwayat_meta: JSON.stringify(rw), 'Timestamp Update': sekarang, diubah_oleh: oleh } }], []);
    auditLog_(sesi, 'BA_GARDU_MASTER', teksBa_(r['ID BA']), teksBa_(g['No Gardu']) + ': ' +
      (diubah.length ? diubah.map(function (x) { return x.kolom; }).join(', ') : 'sudah sama'), platform, tLog);
    return Object.assign({ status: diubah.length ? 'OK' : 'TIDAK_BERUBAH', baId: d.baId, noGarduMaster: teksBa_(g['No Gardu']), diubah: diubah, sheet: sheet },
      infoTtdBa_(r));
  });
}

/** v0.80.0 editor: bagikan SEMUA BA TTD yang sudah ada ke akun EAM_EMAIL (sesudah email EAM diisi / diganti). */
function ADMIN_bagikanTtdKeEam() {
  pastikanPemilik_();
  var daftar = emailEam_();
  if (!daftar.length) { console.error('EAM_EMAIL kosong / tidak valid: isi Script Property EAM_EMAIL (pisah koma).'); return { dibagikan: 0 }; }
  var mulai = Date.now(), n = 0, gagal = 0, sisa = 0;
  var rows = cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA').rows.filter(function (r) { return teksBa_(r.ttd_file_id); });
  for (var i = 0; i < rows.length; i++) {
    if (Date.now() - mulai > 270e3) { sisa = rows.length - i; break; }
    try { if (bagikanKeEam_(DriveApp.getFileById(teksBa_(rows[i].ttd_file_id)))) n++; } catch (e) { gagal++; }
  }
  console.log('BA TTD dibagikan ke ' + daftar.join(', ') + ': ' + n + ' file, ' + gagal + ' gagal' + (sisa ? ', sisa ' + sisa + ': JALANKAN LAGI.' : '.'));
  return { dibagikan: n, gagal: gagal, sisa: sisa };
}
