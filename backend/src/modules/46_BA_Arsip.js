/**
 * v0.86.0 (keputusan Master Guswan 13 Okt 2026): Arsip BA v1, BACA SAJA, untuk tracking riwayat BA gardu / switching lama.
 *
 * Sumber (GARDU_LAMA_SHEET_ID, HANYA DIBACA, sama v1 getDataBeritaAcara + getDataSwitching):
 *   - Rekap Gardu     : BA trafo, judul baris 1-9, data mulai baris 10. B Nomor Gardu, D Tanggal BA, E Jenis Pekerjaan,
 *                       F kVA, K Alamat, L Penyulang, M Section; idBA / NO BA Full dicari dari judul (kosong = CI / CE);
 *                       CG Link BA TTD, CK File PDF URL, CL File ID, CM Status PDF, CN Waktu Selesai (kolom tetap v1).
 *   - Rekap Switching : judul dicari di 15 baris pertama (idBA / Nama Switching). B Tanggal BA, D Jenis Pekerjaan,
 *                       E Jenis Switching, F Nama Switching, G Penyulang, H Section, AI idBA, AJ NO BA Full,
 *                       AK File PDF URL, AL File ID, AM Status PDF, AN Waktu Selesai, AO Link BA TTD.
 * Tujuan: sheet arsip_BA_V1 di GARDU_SHEET_ID = SALINAN (snapshot), ditulis ulang utuh tiap ADMIN_migrasiArsipBa.
 * Rekap_BA v2, db_Gardu, dan file lama tidak pernah ditulis. Jalankan ulang kapan saja untuk menarik BA lama terbaru.
 *
 * HP (menu OPS_BA_GARDU, ADMIN / SUPER): satu halaman dengan BA v2 di Berita Acara > Lihat BA & PDF
 * (getDaftarBaGardu sumber SEMUA / V1) + getFileArsipBaGardu (PDF / BA TTD lama dibaca server dari Drive).
 * Tidak ada edit, buat ulang PDF, kirim EAM.
 */
var ARSIP_BA_SHEET_ = 'arsip_BA_V1';
var ARSIP_BA_HEADER_ = ['arsip_id', 'Sumber', 'Baris Sumber', 'Peralatan', 'ID BA', 'No BA Full', 'Jenis Pekerjaan', 'Nama Peralatan',
  'gardu_id', 'Tanggal BA', 'Penyulang', 'Section', 'Alamat', 'Kapasitas (kVA)', 'Jenis Switching', 'Tahap', 'File PDF URL', 'pdf_file_id', 'Status PDF',
  'Waktu PDF', 'Link BA TTD', 'ttd_file_id', 'dimigrasi_pada'];
var ARSIP_BA_TAHAP_ = ['DRAFT', 'PROSES_TTD', 'SELESAI_TTD'];
var ARSIP_BA_SUMBER_ = {
  TRAFO: {
    tab: 'Rekap Gardu', label: 'REKAP GARDU', barisJudul: 9, barisData: 10, lebarMin: 13,
    kol: { nama: 2, tanggal: 4, jenis: 5, kva: 6, alamat: 11, penyulang: 12, section: 13, noBaFull: 83, ttd: 85, idBa: 87,
           pdfUrl: 89, pdfId: 90, statusPdf: 91, waktuPdf: 92 }
  },
  SWITCHING: {
    tab: 'Rekap Switching', label: 'REKAP SWITCHING', cariJudul: 15, lebarMin: 8,
    kol: { tanggal: 2, jenis: 4, jenisAlat: 5, nama: 6, penyulang: 7, section: 8, idBa: 35, noBaFull: 36, pdfUrl: 37, pdfId: 38,
           statusPdf: 39, waktuPdf: 40, ttd: 41 }
  }
};

/** ID file Drive dari link (/d/<id>, ?id=<id>) atau ID polos. Bukan link Drive = ''. */
function idDriveArsip_(v) {
  var s = teksBa_(v);
  if (!s) return '';
  var m = s.match(/\/d\/([\w-]{20,})/) || s.match(/[?&]id=([\w-]{20,})/) || s.match(/^([\w-]{20,})$/);
  return m ? m[1] : '';
}

/** Tahap arsip (sama badge v1): ada BA TTD = SELESAI_TTD, ada PDF = PROSES_TTD, selain itu DRAFT. */
function tahapArsipBa_(ttdId, ttdUrl, pdfId, pdfUrl) {
  if (ttdId || ttdUrl) return 'SELESAI_TTD';
  return pdfId || pdfUrl ? 'PROSES_TTD' : 'DRAFT';
}

/** Kolom dari judul (alias dinormalkan) di baris judul, kosong = posisi tetap v1. */
function kolomArsip_(head, alias, tetap) {
  for (var r = 0; r < head.length; r++) {
    for (var c = 0; c < head[r].length; c++) if (alias.indexOf(normJudul_(head[r][c])) !== -1) return c + 1;
  }
  return tetap;
}

/** Baca satu sumber lama -> { baris: [...], info } (murni terhadap isi sheet). Tab tidak ada = peringatan. */
function bacaSumberArsipBa_(ss, peralatan, garduIdPerNomor) {
  var S = ARSIP_BA_SUMBER_[peralatan];
  var info = { tab: S.tab, ada: false, baris: 0, kosong: 0, tanpaNomor: 0, garduTakDikenal: [], judulTetap: {} };
  var sh = tabLamaGardu_(ss, S.tab);
  if (!sh) return { baris: [], info: info, peringatan: ['Tab ' + S.tab + ' tidak ada di file lama'] };
  info.ada = true;
  var akhir = sh.getLastRow(), lebar = sh.getLastColumn();
  if (lebar < S.lebarMin) return { baris: [], info: info, peringatan: [S.tab + ' hanya ' + lebar + ' kolom'] };
  var lebarBaca = Math.max(lebar, S.kol.waktuPdf || 0, S.kol.ttd || 0);
  var barisJudul = S.barisJudul, barisData = S.barisData;
  if (!barisData) {   // Rekap Switching: baris judul dicari (sama v1 _swFindHeaderRow_)
    var atas = bacaRentang_(sh, 1, 1, Math.min(S.cariJudul, Math.max(1, akhir)), lebar).tampil, ketemu = 0;
    for (var r = 0; r < atas.length && !ketemu; r++) {
      for (var c = 0; c < atas[r].length; c++) {
        var j = normJudul_(atas[r][c]);
        if (j === 'idba' || j === 'namaswitching') { ketemu = r + 1; break; }
      }
    }
    barisJudul = ketemu || 1;
    barisData = barisJudul + 1;
  }
  if (akhir < barisData) return { baris: [], info: info, peringatan: [] };
  var head = bacaRentang_(sh, 1, 1, barisJudul, lebar).tampil;
  var K = {};
  Object.keys(S.kol).forEach(function (k) { K[k] = S.kol[k]; });
  K.idBa = kolomArsip_(head, MIGRASI_GARDU_.rekap.aliasIdBa, S.kol.idBa);
  K.noBaFull = kolomArsip_(head, MIGRASI_GARDU_.rekap.aliasNoBaFull, S.kol.noBaFull);
  ['idBa', 'noBaFull', 'pdfUrl', 'pdfId', 'statusPdf', 'waktuPdf', 'ttd'].forEach(function (k) {
    info.judulTetap[k] = kolomHuruf_(K[k]) + ' "' + (K[k] <= lebar ? teksBa_(head.map(function (b) { return b[K[k] - 1]; }).filter(Boolean).join(' / ')) : '(di luar sheet)') + '"';
  });
  var data = bacaRentang_(sh, barisData, 1, akhir - barisData + 1, lebar);
  var hasil = [];
  data.nilai.forEach(function (bn, i) {
    var bt = data.tampil[i];
    while (bt.length < lebarBaca) bt.push('');
    var ambil = function (k) { return K[k] ? teksGarduLama_(bt[K[k] - 1]) : ''; };
    var namaMentah = ambil('nama'), idBa = ambil('idBa'), noBaFull = ambil('noBaFull'), jenis = ambil('jenis');
    if (!namaMentah && !idBa && !noBaFull) { info.kosong++; return; }
    if (!idBa && !noBaFull) info.tanpaNomor++;
    var nama = namaMentah, garduId = '';
    if (peralatan === 'TRAFO') {
      var no = parseNoGarduLama_(namaMentah);
      if (no) nama = no.nomor;
      garduId = garduIdPerNomor[nama] || '';
      if (nama && !garduId && info.garduTakDikenal.indexOf(nama) === -1) info.garduTakDikenal.push(nama);
    }
    var pdfUrl = ambil('pdfUrl'), ttdUrl = ambil('ttd');
    var pdfId = idDriveArsip_(ambil('pdfId')) || idDriveArsip_(pdfUrl), ttdId = idDriveArsip_(ttdUrl);
    hasil.push({
      sumber: S.label, baris: barisData + i, peralatan: peralatan, idBa: idBa, noBaFull: noBaFull, jenis: jenis,
      nama: nama, garduId: garduId, tanggal: tanggalLama_(bn[K.tanggal - 1], bt[K.tanggal - 1]),
      penyulang: ambil('penyulang'), section: ambil('section'), alamat: ambil('alamat'),
      kva: peralatan === 'TRAFO' ? angkaGarduLama_(ambil('kva')) : '', jenisAlat: ambil('jenisAlat'),
      tahap: tahapArsipBa_(ttdId, ttdUrl, pdfId, pdfUrl), pdfUrl: pdfUrl, pdfId: pdfId, statusPdf: ambil('statusPdf'),
      waktuPdf: ambil('waktuPdf'), ttdUrl: ttdUrl, ttdId: ttdId
    });
  });
  info.baris = hasil.length;
  return { baris: hasil, info: info, peringatan: [] };
}

/** Rencana arsip dari file lama: baris sheet arsip_BA_V1 + ringkasan. */
function rencanaArsipBa_(ssLama, rowsGardu, waktu) {
  var perNomor = {};
  rowsGardu.forEach(function (g) { if (g.gardu_id && g['No Gardu']) perNomor[teksBa_(g['No Gardu']).toUpperCase()] = String(g.gardu_id); });
  var semua = [], info = {}, peringatan = [];
  Object.keys(ARSIP_BA_SUMBER_).forEach(function (p) {
    var h = bacaSumberArsipBa_(ssLama, p, perNomor);
    semua = semua.concat(h.baris);
    info[p] = h.info;
    peringatan = peringatan.concat(h.peringatan);
  });
  var dipakai = {}, ganda = [], perTahap = {}, perTahun = {};
  ARSIP_BA_TAHAP_.forEach(function (t) { perTahap[t] = 0; });
  var baris = semua.map(function (b) {
    var kunci = b.sumber + '|' + (b.idBa || b.noBaFull || ('baris ' + b.baris));
    if (dipakai[kunci]) { if (b.idBa || b.noBaFull) ganda.push(b.idBa || b.noBaFull); kunci += '#' + b.baris; }
    dipakai[kunci] = true;
    perTahap[b.tahap]++;
    var th = b.tanggal ? b.tanggal.slice(0, 4) : 'tanpa tanggal';
    perTahun[th] = (perTahun[th] || 0) + 1;
    var o = {
      arsip_id: uuidMig_('ARSIP_BA', kunci), Sumber: b.sumber, 'Baris Sumber': b.baris, Peralatan: b.peralatan, 'ID BA': b.idBa,
      'No BA Full': b.noBaFull, 'Jenis Pekerjaan': b.jenis, 'Nama Peralatan': b.nama, gardu_id: b.garduId, 'Tanggal BA': b.tanggal,
      Penyulang: b.penyulang, Section: b.section, Alamat: b.alamat, 'Kapasitas (kVA)': b.kva, 'Jenis Switching': b.jenisAlat, Tahap: b.tahap,
      'File PDF URL': b.pdfUrl, pdf_file_id: b.pdfId, 'Status PDF': b.statusPdf, 'Waktu PDF': b.waktuPdf, 'Link BA TTD': b.ttdUrl,
      ttd_file_id: b.ttdId, dimigrasi_pada: waktu
    };
    return ARSIP_BA_HEADER_.map(function (k) { return o[k] === undefined ? '' : o[k]; });
  });
  return { baris: baris, info: info, peringatan: peringatan, ringkas: { jumlah: baris.length, perTahap: perTahap, perTahun: perTahun, ganda: ganda } };
}

function cetakRencanaArsipBa_(r) {
  Object.keys(r.info).forEach(function (p) {
    var i = r.info[p];
    if (!i.ada) return;
    console.log(i.tab + ': ' + i.baris + ' BA (baris kosong dilewati ' + i.kosong + ', tanpa ID BA / No BA ' + i.tanpaNomor + ')');
    console.log('  kolom dipakai: ' + Object.keys(i.judulTetap).map(function (k) { return k + ' ' + i.judulTetap[k]; }).join(' | '));
    if (i.garduTakDikenal.length) cetakDaftar_('  No Gardu tidak ada di db_Gardu (tetap diarsip, tanpa gardu_id)', i.garduTakDikenal);
  });
  r.peringatan.forEach(function (p) { console.warn(p); });
  console.log('Total ' + r.ringkas.jumlah + ' BA | per tahap ' + JSON.stringify(r.ringkas.perTahap) + ' | per tahun ' + JSON.stringify(r.ringkas.perTahun));
  if (r.ringkas.ganda.length) cetakDaftar_('ID BA / No BA ganda di sumber (semua tetap diarsip)', r.ringkas.ganda);
}

function siapkanArsipBa_() {
  var c = cfg_();
  if (!c.GARDU_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'GARDU_SHEET_ID');
  return { c: c, ssLama: bukaSpreadsheet_(c.GARDU_LAMA_SHEET_ID), gardu: tabel_('GARDU_SHEET_ID', 'db_Gardu').rows };
}

/** Editor: pratinjau arsip BA v1 (tidak menulis apa pun). */
function ADMIN_cekArsipBa() {
  pastikanPemilik_();
  var x = siapkanArsipBa_();
  console.log('ARSIP BA v1 (pratinjau) ' + x.c.ENV + ' | sumber ' + sumberMigrasiGardu_(x.c));
  var r = rencanaArsipBa_(x.ssLama, x.gardu, sekarangIso_());
  cetakRencanaArsipBa_(r);
  console.log(r.ringkas.jumlah ? 'SIAP: jalankan ADMIN_migrasiArsipBa (salinan baca saja di ' + ARSIP_BA_SHEET_ + ', boleh diulang)' : 'Tidak ada BA lama yang terbaca');
  return r.ringkas;
}

/** Editor: tulis ulang utuh sheet arsip_BA_V1 dari file lama. Aman diulang (salinan, bukan data kerja). */
function ADMIN_migrasiArsipBa() {
  pastikanPemilik_();
  var x = siapkanArsipBa_();
  var waktu = sekarangIso_();
  var r = rencanaArsipBa_(x.ssLama, x.gardu, waktu);
  cetakRencanaArsipBa_(r);
  if (!r.ringkas.jumlah) { console.warn('Tidak ada BA lama yang terbaca: arsip tidak diubah'); return { ditulis: 0 }; }
  denganLock_(function () {
    var tLog = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var ss = bukaSpreadsheet_(x.c.GARDU_SHEET_ID);
    var sh = ss.getSheetByName(ARSIP_BA_SHEET_);
    var baru = !sh;
    if (!sh) sh = ss.insertSheet(ARSIP_BA_SHEET_);
    sh.clearContents();
    var isi = [ARSIP_BA_HEADER_].concat(r.baris);
    sh.getRange(1, 1, isi.length, ARSIP_BA_HEADER_.length).setValues(isi.map(function (b) { return b.map(amanSheet_); }));
    if (baru) {
      try { sh.setFrozenRows(1); } catch (eF) { /* stub */ }
      console.log(ARSIP_BA_SHEET_ + ' dibuat, ' + proteksiSheet_(sh));
    }
    PropertiesService.getScriptProperties().setProperty('ARSIP_BA_DIPERBARUI', waktu);
    auditLog_({ username: 'ADMIN_EDITOR' }, 'ARSIP_BA_V1', ARSIP_BA_SHEET_, r.ringkas.jumlah + ' BA; ' + JSON.stringify(r.ringkas.perTahap), 'EDITOR', tLog);
  }, 30000);
  console.log('SELESAI: ' + r.ringkas.jumlah + ' BA lama di ' + ARSIP_BA_SHEET_ + ' (baca saja). Menu HP: Berita Acara > Lihat BA & PDF');
  return { ditulis: r.ringkas.jumlah };
}

/**
 * Baris arsip_BA_V1. Judul berubah = ARSIP_BA_RUSAK (jalankan ulang ADMIN_migrasiArsipBa).
 * v1.0.36: sheet belum dibuat = dibaca langsung dari file lama (arsip_id sama, jadi PDF / BA TTD tetap bisa dibuka);
 * file lama tidak terbaca / kosong = null.
 */
function bacaArsipBa_() {
  var t;
  try { t = tabel_('GARDU_SHEET_ID', ARSIP_BA_SHEET_); } catch (e) { if (e.kode === 'SHEET_TIDAK_ADA' || e.kode === 'HEADER_KOSONG') return bacaArsipBaLangsung_(); throw e; }
  if (bedaStruktur_(t.header, ARSIP_BA_HEADER_).length) throw new SisiError_('ARSIP_BA_RUSAK', 'jalankan ulang ADMIN_migrasiArsipBa');
  return t.rows.filter(function (r) { return r.arsip_id; });
}

var ARSIP_BA_LANGSUNG_ = { ada: false, rows: null };   // satu eksekusi cukup sekali baca

function bacaArsipBaLangsung_() {
  if (ARSIP_BA_LANGSUNG_.ada) return ARSIP_BA_LANGSUNG_.rows;
  var rows = null;
  try {
    var x = siapkanArsipBa_();
    var r = rencanaArsipBa_(x.ssLama, x.gardu, '');
    if (r.baris.length) rows = r.baris.map(function (b) { var o = {}; ARSIP_BA_HEADER_.forEach(function (k, i) { o[k] = b[i]; }); return o; });
  } catch (e) { rows = null; }
  ARSIP_BA_LANGSUNG_ = { ada: true, rows: rows };
  return rows;
}

function itemArsipBa_(r) {
  return {
    arsipId: String(r.arsip_id), sumber: teksBa_(r.Sumber), peralatan: teksBa_(r.Peralatan), idBa: teksBa_(r['ID BA']),
    noBaFull: teksBa_(r['No BA Full']), jenis: teksBa_(r['Jenis Pekerjaan']), nama: teksBa_(r['Nama Peralatan']),
    garduId: teksBa_(r.gardu_id), tanggalBa: tglSelBa_(r['Tanggal BA']), penyulang: teksBa_(r.Penyulang), section: teksBa_(r.Section),
    alamat: teksBa_(r.Alamat), kva: typeof r['Kapasitas (kVA)'] === 'number' ? r['Kapasitas (kVA)'] : null, jenisSwitching: teksBa_(r['Jenis Switching']),
    tahap: teksBa_(r.Tahap) || 'DRAFT',
    adaPdf: !!teksBa_(r.pdf_file_id), adaTtd: !!teksBa_(r.ttd_file_id), urlPdf: teksBa_(r['File PDF URL']), urlTtd: teksBa_(r['Link BA TTD']),
    statusPdf: teksBa_(r['Status PDF']), waktuPdf: apakahTanggal_(r['Waktu PDF']) ? waktuPdfWib_(r['Waktu PDF']) : teksBa_(r['Waktu PDF'])
  };
}

/** v0.86.0: item arsip di Daftar BA (satu halaman dengan BA v2). Baca saja: tidak ada baId / pdfBisa. */
function itemDaftarArsipBa_(r) {
  var a = itemArsipBa_(r);
  return Object.assign(a, {
    arsip: true, baId: '', noGardu: a.nama, statusBa: 'ARSIP', pdfBisa: false, fileId: '',
    statusPdfV1: a.statusPdf, statusPdf: a.adaPdf ? 'SELESAI' : 'BELUM', statusTtd: a.adaTtd ? 'SUDAH TTD' : 'BELUM TTD'
  });
}

/** getFileArsipBaGardu {arsipId, berkas: PDF | TTD} -> { arsipId, berkas, namaFile, mime, ukuranByte, url, data base64 }. */
function getFileArsipBaGardu_(sesi, data) {
  wajibAdminBa_(sesi);
  var d = validasi_(data, { arsipId: { tipe: 'uuid', wajib: true }, berkas: { tipe: 'pilihan', wajib: true, pilihan: ['PDF', 'TTD'] } });
  var r = (bacaArsipBa_() || []).filter(function (x) { return String(x.arsip_id).toLowerCase() === d.arsipId; })[0];
  if (!r) throw new SisiError_('ARSIP_BA_TIDAK_ADA', d.arsipId);
  var pdf = d.berkas === 'PDF', id = teksBa_(pdf ? r.pdf_file_id : r.ttd_file_id), url = teksBa_(pdf ? r['File PDF URL'] : r['Link BA TTD']);
  if (!id) throw new SisiError_('ARSIP_FILE_TIDAK_ADA', pdf ? 'PDF' : 'BA TTD');
  var file;
  try { file = DriveApp.getFileById(id); } catch (e) { throw new SisiError_('ARSIP_FILE_TIDAK_ADA', 'file Drive tidak bisa dibuka'); }
  var bytes = file.getBlob().getBytes();
  if (bytes.length > (pdf ? BA_PDF_MAKS_BYTE_ : BA_TTD_MAKS_BYTE_)) throw new SisiError_('FILE_TERLALU_BESAR', bytes.length);
  var mime = mimeDariBytes_(bytes);
  if (!mime || (pdf && mime !== 'application/pdf')) throw new SisiError_('FORMAT_FILE_SALAH', pdf ? 'PDF lama' : 'BA TTD lama');
  var nama = teksBa_(file.getName()) || ((pdf ? 'BA-' : 'BA-TTD-') + (teksBa_(r['ID BA']) || teksBa_(r['Nama Peralatan'])) + BA_TTD_MIME_[mime]);
  return { arsipId: d.arsipId, berkas: d.berkas, namaFile: nama, mime: mime, ukuranByte: bytes.length, url: url || urlPdf_(id),
           data: Utilities.base64Encode(bytes) };
}

/** Baris cekKonfigurasi (info, tidak dihitung masalah). */
function cekKonfigArsipBa_() {
  try {
    var rows = bacaArsipBa_();
    var waktu = PropertiesService.getScriptProperties().getProperty('ARSIP_BA_DIPERBARUI') || '-';
    console.log(rows ? ARSIP_BA_SHEET_ + ': ' + rows.length + ' BA lama (baca saja), diperbarui ' + waktu + '. Tarik ulang: ADMIN_migrasiArsipBa'
      : ARSIP_BA_SHEET_ + ' belum ada: arsip BA v1 belum tampil di HP (ADMIN_cekArsipBa lalu ADMIN_migrasiArsipBa)');
    return 0;
  } catch (e) {
    console.warn(ARSIP_BA_SHEET_ + ': ' + (e.kode || e.message || e));
    return 1;
  }
}
