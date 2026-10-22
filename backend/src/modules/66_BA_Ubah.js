/**
 * v0.76.0 (permintaan kvlar 10 Okt 2026): BA Gardu tanpa Drive di HP + edit BA tersimpan.
 *
 *  getBaGardu      { baId }               isian lengkap satu BA (untuk form edit), khusus admin.
 *  getFotoBaGardu  { baId, slot, ukuran } foto BA lewat server (KECIL = thumbnail Drive, cadangan penuh; PENUH).
 *  getPdfBaGardu   { baId }               bytes PDF (base64) lewat server: HP menampilkan / mengunduh tanpa membuka Drive.
 *  ubahBaGardu     { baId, revision, ...} koreksi isian BA. Nomor gardu, ID BA, No BA, Tanggal BA, jenis TETAP.
 *                  Foto pengganti dikirim dulu lewat uploadFotoBaGardu { revisi: true } (penanda <baId>-<slot>-REVISI),
 *                  dipasang di sini; foto lama dibuang SESUDAH baris menunjuk foto baru. Revisi BA +1, Status PDF BELUM
 *                  (HP langsung membuat ulang PDF). db_Gardu ikut diperbarui hanya kalau BA ini BA terakhir gardu tsb.
 */
var BA_PDF_MAKS_BYTE_ = 20 * 1024 * 1024;

function penandaRevisiBa_(baId, slot) { return baId + '-' + slot + '-REVISI'; }

/** Baris Rekap_BA aktif milik baId (BATAL = ditolak). */
function barisBaAktif_(rows, baId) {
  var r = barisBa_(rows, baId);
  if (!r) throw new SisiError_('BA_TIDAK_DITEMUKAN', baId);
  if (teksBa_(r['Status BA']).toUpperCase() === 'BATAL') throw new SisiError_('BA_SUDAH_BATAL', teksBa_(r['ID BA']));
  return r;
}

function metaFotoBa_(r) {
  try { var m = JSON.parse(String(r.foto_meta || '{}')); return m && typeof m === 'object' ? m : {}; } catch (e) { return {}; }
}

function angkaBa_(v) { return v === '' || v === null || v === undefined || !isFinite(Number(v)) ? null : Number(v); }

function getBaGardu_(sesi, data) {
  wajibAdminBa_(sesi);
  var d = validasi_(data, { baId: { tipe: 'uuid', wajib: true } });
  var r = barisBaAktif_(cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA').rows, d.baId);
  var jenis = teksBa_(r['Jenis Pekerjaan']);
  var meta = metaFotoBa_(r);
  var lat = angkaBa_(r.Lat), lng = angkaBa_(r.Long);
  return Object.assign(jawabPdf_(r), {
    jenis: jenis, noGardu: teksBa_(r['Nama Peralatan']), noBaFull: teksBa_(r['No BA Full']), garduId: teksBa_(r.gardu_id),
    tanggalBa: tglSelBa_(r['Tanggal BA']), tanggalPekerjaan: tglSelBa_(r['Tanggal Pekerjaan']),
    sectionId: teksBa_(r.section_id), penyulang: teksBa_(r.Penyulang), section: teksBa_(r.Section),
    alamat: teksBa_(r.Alamat), koordinat: lat === null || lng === null ? '' : lat + ', ' + lng,
    konstruksi: teksBa_(r.Konstruksi), kva: angkaBa_(r['Kapasitas (kVA)']), merk: teksBa_(r.Merk), seri: teksBa_(r['Nomor Seri']),
    tahun: angkaBa_(r.Tahun), jurusan: angkaBa_(r['Jurusan Terpasang']),
    merkPhb: teksBa_(r['Merk PHB-TR']), seriPhb: teksBa_(r['Nomor Seri PHB-TR']), tahunPhb: angkaBa_(r['Tahun PHB-TR']),
    kvaSesudah: angkaBa_(r['Kapasitas Sesudah (kVA)']), merkSesudah: teksBa_(r['Merk Sesudah']),
    seriSesudah: teksBa_(r['Nomor Seri Sesudah']), tahunSesudah: angkaBa_(r['Tahun Sesudah']),
    asalTrafo: teksBa_(r['Asal Peralatan']), phbDiganti: teksBa_(r['PHB-TR Diganti']).toUpperCase() === 'YA',
    merkPhbSesudah: teksBa_(r['Merk PHB-TR Sesudah']), seriPhbSesudah: teksBa_(r['Nomor Seri PHB-TR Sesudah']),
    tahunPhbSesudah: angkaBa_(r['Tahun PHB-TR Sesudah']), jurusanSesudah: angkaBa_(r['Jurusan Terpasang Sesudah']),
    kepemilikan: teksBa_(r.Kepemilikan), perluasanSutm: angkaBa_(r['Panjang Perluasan SUTM (kmS)']),
    vendor: teksBa_(r['Vendor Pekerja']), catatan: teksBa_(r.Catatan),
    petugas1Id: teksBa_(r.pejabat_id_1), petugas2Id: teksBa_(r.pejabat_id_2), mengetahui: teksBa_(r.Mengetahui),
    revisiBa: Number(r['Revisi BA']) || 0, revision: Number(r.revision) || 0, statusBa: teksBa_(r['Status BA']) || 'AKTIF',
    ownerId: teksBa_(r.OwnerId), externalReference: teksBa_(r['External Reference']), jabatanMengetahui: teksBa_(r['Jabatan Mengetahui']),
    petugas1: teksBa_(r['Petugas 1']), petugas2: teksBa_(r['Petugas 2']), folder: jalurFolderBa_(r).join('/'),
    foto: (BA_SLOT_FOTO_[jenis] || []).filter(function (s) { return meta[s.slot] && meta[s.slot].fileId; }).map(function (s) { return s.slot; })
  }, infoTtdBa_(r));
}

function getFotoBaGardu_(sesi, data) {
  wajibAdminBa_(sesi);
  var d = validasi_(data, {
    baId: { tipe: 'uuid', wajib: true },
    slot: { tipe: 'teks', wajib: true, maks: 30 },
    ukuran: { tipe: 'pilihan', pilihan: ['KECIL', 'PENUH'] }
  });
  var r = barisBa_(cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA').rows, d.baId);
  if (!r) throw new SisiError_('BA_TIDAK_DITEMUKAN', d.baId);
  var slot = (BA_SLOT_FOTO_[teksBa_(r['Jenis Pekerjaan'])] || []).filter(function (s) { return s.slot === d.slot; })[0];
  if (!slot) throw new SisiError_('FORMAT_SALAH', 'slot');
  var m = metaFotoBa_(r)[d.slot];
  if (!m || !m.fileId) throw new SisiError_('FOTO_TIDAK_ADA', d.slot);
  var file;
  try { file = DriveApp.getFileById(String(m.fileId)); } catch (e) { throw new SisiError_('FOTO_TIDAK_ADA', d.slot); }
  if (d.ukuran !== 'PENUH') {
    try {
      var th = file.getThumbnail(), b = th && th.getBytes ? th.getBytes() : null;
      if (b && b.length) return { slot: d.slot, mime: 'image/jpeg', kecil: true, ukuranByte: b.length, data: Utilities.base64Encode(b) };
    } catch (eT) { /* thumbnail belum ada: penuh */ }
  }
  if (String(file.getMimeType() || '').indexOf('image/') !== 0) throw new SisiError_('FOTO_TIDAK_VALID', 'mime');
  var bytes = file.getBlob().getBytes();
  return { slot: d.slot, mime: 'image/jpeg', kecil: false, ukuranByte: bytes.length, data: Utilities.base64Encode(bytes) };
}

function getPdfBaGardu_(sesi, data) {
  wajibAdminBa_(sesi);
  var d = validasi_(data, { baId: { tipe: 'uuid', wajib: true } });
  var r = barisBa_(cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA').rows, d.baId);
  if (!r) throw new SisiError_('BA_TIDAK_DITEMUKAN', d.baId);
  var id = teksBa_(r.pdf_file_id);
  if (teksBa_(r['Status PDF']) !== 'SELESAI' || !id) throw new SisiError_('PDF_BELUM_ADA', teksBa_(r['ID BA']));
  var file;
  try { file = DriveApp.getFileById(id); } catch (e) { throw new SisiError_('PDF_BELUM_ADA', 'file Drive'); }
  var bytes = file.getBlob().getBytes();
  if (bytes.length > BA_PDF_MAKS_BYTE_) throw new SisiError_('PDF_TERLALU_BESAR', bytes.length);
  // %PDF
  if (bytes.length < 5 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) throw new SisiError_('PDF_GAGAL', 'bukan PDF');
  return Object.assign(jawabPdf_(r), { namaFile: file.getName(), mime: 'application/pdf', ukuranByte: bytes.length, data: Utilities.base64Encode(bytes) });
}

function ubahBaGarduPenggantian_(sesi, data, awal, tahunIni) {
  var d = validasi_(data, {
    baId: { tipe: 'uuid', wajib: true },
    revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 },
    tanggalPekerjaan: { tipe: 'tanggal', wajib: true },
    sectionId: { tipe: 'uuid' },
    alamat: { tipe: 'teks', maks: 200 },
    koordinat: { tipe: 'koordinat' },
    konstruksi: { tipe: 'pilihan', pilihan: BA_KONSTRUKSI_ },
    kva: { tipe: 'angka', min: 1, max: 5000 },
    merk: { tipe: 'teks', maks: 60 },
    seri: { tipe: 'teks', maks: 60 },
    tahun: { tipe: 'angka', bulat: true, min: 1950, max: tahunIni + 1 },
    jurusan: { tipe: 'angka', bulat: true, min: 1, max: 12 },
    merkPhb: { tipe: 'teks', maks: 60 },
    seriPhb: { tipe: 'teks', maks: 60 },
    tahunPhb: { tipe: 'angka', bulat: true, min: 1950, max: tahunIni + 1 },
    kepemilikan: { tipe: 'pilihan', pilihan: BA_KEPEMILIKAN_ },
    kvaSesudah: { tipe: 'angka', wajib: true, min: 1, max: 5000 },
    merkSesudah: { tipe: 'teks', wajib: true, maks: 60 },
    seriSesudah: { tipe: 'teks', wajib: true, maks: 60 },
    tahunSesudah: { tipe: 'angka', wajib: true, bulat: true, min: 1950, max: tahunIni + 1 },
    asalTrafo: { tipe: 'teks', wajib: true, maks: 80 },
    phbDiganti: { tipe: 'bool' },
    merkPhbSesudah: { tipe: 'teks', maks: 60 },
    seriPhbSesudah: { tipe: 'teks', maks: 60 },
    tahunPhbSesudah: { tipe: 'angka', bulat: true, min: 1950, max: tahunIni + 1 },
    jurusanSesudah: { tipe: 'angka', bulat: true, min: 1, max: 12 },
    alasan: { tipe: 'teks', maks: 300 },
    tindakLanjut: { tipe: 'teks', maks: 200 },
    vendor: { tipe: 'teks', maks: 100 },
    catatan: { tipe: 'teks', maks: 500 },
    petugas1Id: { tipe: 'uuid', wajib: true },
    petugas2Id: { tipe: 'uuid' }
  });
  if (d.kepemilikan === 'Non-PLN (Lisdes)') d.kepemilikan = 'Non-PLN';
  if (d.petugas2Id && d.petugas2Id === d.petugas1Id) throw new SisiError_('PEJABAT_TIDAK_VALID', 'petugas2Id sama dengan petugas1Id');
  if (d.tanggalPekerjaan > tglSelBa_(awal['Tanggal BA'])) throw new SisiError_('TANGGAL_TIDAK_VALID', 'tanggalPekerjaan sesudah tanggalBa');

  var jenis = 'Penggantian Trafo';
  var sec = d.sectionId ? sectionBa_(d.sectionId) : null;
  var pj = pejabatBa_(d.petugas1Id, d.petugas2Id);
  var folders = [folderBa_(awal)].concat(folderUploadAdaBa_(jenis, d.baId));
  var revisi = [];
  BA_SLOT_FOTO_[jenis].forEach(function (s) {
    var f = cariFotoBaDi_(folders, penandaRevisiBa_(d.baId, s.slot));
    if (f) revisi.push({ s: s, f: f });
  });

  var diubah = null;
  var hasil = denganLock_(function () {
    if (CacheService.getScriptCache().get('pdfba:' + d.baId)) throw new SisiError_('PDF_SEDANG_DIBUAT', teksBa_(awal['ID BA']));
    var tR = cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA');
    var tG = cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu');
    var tLog = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var r = barisBaAktif_(tR.rows, d.baId);
    if ((Number(r.revision) || 0) !== d.revision) throw new SisiError_('DATA_BERUBAH', teksBa_(r['ID BA']));
    var sekarang = sekarangIso_(), oleh = sesi.userId || sesi.username;
    var penyulang = sec ? String(sec.penyulang) : teksBa_(r.Penyulang);
    var section = sec ? String(sec.section) : teksBa_(r.Section);
    var secId = sec ? String(sec.section_id) : teksBa_(r.section_id);
    var mPhbSeb = d.merkPhb !== undefined ? d.merkPhb : teksBa_(r['Merk PHB-TR']);
    var sPhbSeb = d.seriPhb !== undefined ? d.seriPhb : teksBa_(r['Nomor Seri PHB-TR']);
    var tPhbSeb = d.tahunPhb !== undefined ? d.tahunPhb : (angkaBa_(r['Tahun PHB-TR']) || '');
    var jurSeb = d.jurusan !== undefined ? d.jurusan : (angkaBa_(r['Jurusan Terpasang']) || teksBa_(r['Jurusan Terpasang']));

    var mPhbSes = d.merkPhbSesudah !== undefined && d.merkPhbSesudah !== '' ? d.merkPhbSesudah : mPhbSeb;
    var sPhbSes = d.seriPhbSesudah !== undefined && d.seriPhbSesudah !== '' ? d.seriPhbSesudah : sPhbSeb;
    var tPhbSes = d.tahunPhbSesudah !== undefined ? d.tahunPhbSesudah : tPhbSeb;
    var jurSes = d.jurusanSesudah !== undefined ? d.jurusanSesudah : jurSeb;

    var u = {
      'Tanggal Pekerjaan': d.tanggalPekerjaan,
      Alamat: d.alamat !== undefined ? d.alamat : teksBa_(r.Alamat),
      Penyulang: penyulang, Section: section, section_id: secId,
      Lat: d.koordinat ? d.koordinat.lat : r.Lat,
      Long: d.koordinat ? d.koordinat.lng : r.Long,
      Konstruksi: d.konstruksi || teksBa_(r.Konstruksi),
      'Kapasitas (kVA)': d.kva !== undefined ? d.kva : r['Kapasitas (kVA)'],
      Merk: d.merk !== undefined ? d.merk : teksBa_(r.Merk),
      'Nomor Seri': d.seri !== undefined ? d.seri : teksBa_(r['Nomor Seri']),
      Tahun: d.tahun !== undefined ? d.tahun : r.Tahun,
      'Jurusan Terpasang': jurSeb,
      Kepemilikan: d.kepemilikan || teksBa_(r.Kepemilikan),
      'Merk PHB-TR': mPhbSeb, 'Nomor Seri PHB-TR': sPhbSeb, 'Tahun PHB-TR': tPhbSeb,
      'Kapasitas Sesudah (kVA)': d.kvaSesudah, 'Merk Sesudah': d.merkSesudah,
      'Nomor Seri Sesudah': d.seriSesudah, 'Tahun Sesudah': d.tahunSesudah,
      'Asal Peralatan': d.asalTrafo,
      'PHB-TR Diganti': d.phbDiganti ? 'YA' : 'TIDAK',
      'Merk PHB-TR Sesudah': mPhbSes, 'Nomor Seri PHB-TR Sesudah': sPhbSes,
      'Tahun PHB-TR Sesudah': tPhbSes, 'Jurusan Terpasang Sesudah': jurSes,
      'Vendor Pekerja': d.vendor !== undefined ? d.vendor : teksBa_(r['Vendor Pekerja']),
      Catatan: d.catatan !== undefined ? d.catatan : teksBa_(r.Catatan),
      'Petugas 1': teksBa_(pj.p1.nama), 'Jabatan Petugas 1': teksBa_(pj.p1.jabatan),
      'Petugas 2': pj.p2 ? teksBa_(pj.p2.nama) : '', 'Jabatan Petugas 2': pj.p2 ? teksBa_(pj.p2.jabatan) : '',
      pejabat_id_1: String(pj.p1.pejabat_id), pejabat_id_2: pj.p2 ? String(pj.p2.pejabat_id) : ''
    };
    var beda = Object.keys(u).filter(function (k) {
      var lama = r[k];
      if (apakahTanggal_(lama)) lama = tglSelBa_(lama);
      return String(lama === null || lama === undefined ? '' : lama) !== String(u[k] === null || u[k] === undefined ? '' : u[k]);
    });
    var meta = metaFotoBa_(r), buang = [];
    revisi.forEach(function (x) {
      if (meta[x.s.slot] && meta[x.s.slot].fileId) buang.push(String(meta[x.s.slot].fileId));
      meta[x.s.slot] = { fileId: x.f.getId(), revisi: sekarang };
      u[x.s.kolom] = 'https://drive.google.com/file/d/' + x.f.getId() + '/view';
      beda.push('foto ' + x.s.label);
    });
    if (!beda.length) return Object.assign(jawabBa_(r, 'TIDAK_BERUBAH'), { revision: Number(r.revision) || 0, diubah: [] });
    if (teksBa_(r.ttd_file_id)) u['Status TTD'] = 'TTD ULANG';
    Object.assign(u, {
      foto_meta: JSON.stringify(meta), 'Revisi BA': (Number(r['Revisi BA']) || 0) + 1, 'Status PDF': 'BELUM',
      'Timestamp Update': sekarang, diubah_oleh: oleh
    });
    tulisBlok_(tR, [{ r: r, u: u }], [], { bolehId: ['pejabat_id_1', 'pejabat_id_2', 'section_id'] });
    var peringatan = [];
    var g = tG.rows.filter(function (x) { return String(x.gardu_id) === teksBa_(r.gardu_id); })[0] || null;
    if (g && String(g.ba_id_terakhir) === d.baId) {
      var ug = {
        Alamat: u.Alamat, Penyulang: penyulang, Section: section, 'PTS/LBS': section, section_id: secId,
        Lat: u.Lat, Long: u.Long, Konstruksi: u.Konstruksi,
        'Kapasitas (kVA)': d.kvaSesudah, Merk: d.merkSesudah, 'Nomor Seri': d.seriSesudah, Tahun: d.tahunSesudah,
        'Asal Trafo': d.asalTrafo, 'Jurusan Terpasang': jurSes,
        'Merk PHB-TR': mPhbSes, 'Nomor Seri PHB-TR': sPhbSes, 'Tahun PHB-TR': tPhbSes,
        Kepemilikan: u.Kepemilikan, 'Diubah Oleh': sesi.username || '', 'Timestamp Update': sekarang, diubah_oleh: oleh
      };
      var arusNom = arusNominalGardu_(d.kvaSesudah);
      if (arusNom !== '') ug['Arus Maks per Fasa (A)'] = arusNom;
      tulisBlok_(tG, [{ r: g, u: ug }], [], { bolehId: ['section_id'] });
    } else if (g) {
      peringatan.push('Master Gardu ' + teksBa_(g['No Gardu']) + ' tidak diubah: sudah ada BA lebih baru.');
    }
    revisi.forEach(function (x) { try { x.f.setDescription(PENANDA_FOTO_ + d.baId + '-' + x.s.slot); } catch (eD) { /* penanda tetap REVISI */ } });
    buang.forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (eB) { /* sudah tidak ada */ } });
    auditLog_(sesi, 'BA_GARDU_UBAH', teksBa_(r['ID BA']), beda.join(', ') + (d.alasan ? ' | ' + d.alasan : ''), 'MOBILE', tLog);
    if (revisi.length) diubah = r;
    return Object.assign(jawabBa_(r, 'OK', { peringatan: peringatan }), { revision: Number(r.revision) || 0, revisiBa: u['Revisi BA'], diubah: beda });
  });
  if (diubah) rapikanSesudahBa_(diubah);
  return hasil;
}

function ubahBaGardu_(sesi, data) {
  wajibAdminBa_(sesi);
  var tahunIni = Number(tglJakarta_(new Date()).slice(0, 4));
  if (data && data.baId && typeof data.baId === 'string') {
    var cekAwal = barisBa_(cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA').rows, data.baId);
    if (cekAwal && teksBa_(cekAwal['Jenis Pekerjaan']) === 'Penggantian Trafo') {
      if (teksBa_(cekAwal['Status BA']).toUpperCase() === 'BATAL') throw new SisiError_('BA_SUDAH_BATAL', teksBa_(cekAwal['ID BA']));
      return ubahBaGarduPenggantian_(sesi, data, cekAwal, tahunIni);
    }
  }
  var d = validasi_(data, {
    baId: { tipe: 'uuid', wajib: true },
    revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 },
    tanggalPekerjaan: { tipe: 'tanggal', wajib: true },
    sectionId: { tipe: 'uuid', wajib: true },
    alamat: { tipe: 'teks', wajib: true, maks: 200 },
    koordinat: { tipe: 'koordinat', wajib: true },
    konstruksi: { tipe: 'pilihan', wajib: true, pilihan: BA_KONSTRUKSI_ },
    kva: { tipe: 'angka', wajib: true, min: 1, max: 5000 },
    merk: { tipe: 'teks', wajib: true, maks: 60 },
    seri: { tipe: 'teks', wajib: true, maks: 60 },
    tahun: { tipe: 'angka', wajib: true, bulat: true, min: 1950, max: tahunIni + 1 },
    jurusan: { tipe: 'angka', wajib: true, bulat: true, min: 1, max: 12 },
    merkPhb: { tipe: 'teks', maks: 60 },
    seriPhb: { tipe: 'teks', maks: 60 },
    tahunPhb: { tipe: 'angka', bulat: true, min: 1950, max: tahunIni + 1 },
    kepemilikan: { tipe: 'pilihan', wajib: true, pilihan: BA_KEPEMILIKAN_ },
    perluasanSutm: { tipe: 'angka', min: 0, max: 100 },
    vendor: { tipe: 'teks', maks: 100 },
    catatan: { tipe: 'teks', maks: 500 },
    alasan: { tipe: 'teks', maks: 300 },
    petugas1Id: { tipe: 'uuid', wajib: true },
    petugas2Id: { tipe: 'uuid' }
  });
  if (d.kepemilikan === 'Non-PLN (Lisdes)') d.kepemilikan = 'Non-PLN';
  if (d.petugas2Id && d.petugas2Id === d.petugas1Id) throw new SisiError_('PEJABAT_TIDAK_VALID', 'petugas2Id sama dengan petugas1Id');
  var awal = barisBaAktif_(cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA').rows, d.baId);
  var jenis = teksBa_(awal['Jenis Pekerjaan']);
  if (BA_JENIS_SIAP_.indexOf(jenis) === -1) throw new SisiError_('JENIS_BA_BELUM_TERSEDIA', jenis);
  if (d.tanggalPekerjaan > tglSelBa_(awal['Tanggal BA'])) throw new SisiError_('TANGGAL_TIDAK_VALID', 'tanggalPekerjaan sesudah tanggalBa');

  // di luar lock: master + Drive
  var sec = sectionBa_(d.sectionId);
  var pj = pejabatBa_(d.petugas1Id, d.petugas2Id);
  var owner = ownerIdGardu_(sec.penyulang, sec.section);
  // v0.77.0: foto pengganti di folder BA; kiriman sebelum update masih di folder upload lama
  var folders = [folderBa_(awal)].concat(folderUploadAdaBa_(jenis, d.baId));
  var revisi = [];
  BA_SLOT_FOTO_[jenis].forEach(function (s) {
    var f = cariFotoBaDi_(folders, penandaRevisiBa_(d.baId, s.slot));
    if (f) revisi.push({ s: s, f: f });
  });

  var diubah = null;
  var hasil = denganLock_(function () {
    if (CacheService.getScriptCache().get('pdfba:' + d.baId)) throw new SisiError_('PDF_SEDANG_DIBUAT', teksBa_(awal['ID BA']));
    var tR = cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA');
    var tG = cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu');
    var tLog = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var r = barisBaAktif_(tR.rows, d.baId);
    if ((Number(r.revision) || 0) !== d.revision) throw new SisiError_('DATA_BERUBAH', teksBa_(r['ID BA']));
    var sekarang = sekarangIso_(), oleh = sesi.userId || sesi.username;
    var umum = {
      Alamat: d.alamat, Penyulang: String(sec.penyulang), Section: String(sec.section), Lat: d.koordinat.lat, Long: d.koordinat.lng,
      Konstruksi: d.konstruksi, Merk: d.merk, 'Nomor Seri': d.seri, Tahun: d.tahun, 'Kapasitas (kVA)': d.kva, 'Jurusan Terpasang': d.jurusan,
      Kepemilikan: d.kepemilikan, OwnerId: owner.ownerId, 'External Reference': owner.externalReference,
      'Merk PHB-TR': d.merkPhb || '', 'Nomor Seri PHB-TR': d.seriPhb || '', 'Tahun PHB-TR': d.tahunPhb === undefined ? '' : d.tahunPhb
    };
    var u = Object.assign({}, umum, {
      'Tanggal Pekerjaan': d.tanggalPekerjaan,
      'Panjang Perluasan SUTM (kmS)': d.perluasanSutm === undefined ? '' : d.perluasanSutm, 'Vendor Pekerja': d.vendor || '',
      Catatan: d.catatan || '',
      'Petugas 1': teksBa_(pj.p1.nama), 'Jabatan Petugas 1': teksBa_(pj.p1.jabatan),
      'Petugas 2': pj.p2 ? teksBa_(pj.p2.nama) : '', 'Jabatan Petugas 2': pj.p2 ? teksBa_(pj.p2.jabatan) : '',
      pejabat_id_1: String(pj.p1.pejabat_id), pejabat_id_2: pj.p2 ? String(pj.p2.pejabat_id) : '', section_id: String(sec.section_id)
    });
    // kolom yang benar-benar berubah (audit); sel Date dibandingkan sebagai tanggal
    var beda = Object.keys(u).filter(function (k) {
      var lama = r[k];
      if (apakahTanggal_(lama)) lama = tglSelBa_(lama);
      return String(lama === null || lama === undefined ? '' : lama) !== String(u[k] === null || u[k] === undefined ? '' : u[k]);
    });
    var meta = metaFotoBa_(r), buang = [];
    revisi.forEach(function (x) {
      if (meta[x.s.slot] && meta[x.s.slot].fileId) buang.push(String(meta[x.s.slot].fileId));
      meta[x.s.slot] = { fileId: x.f.getId(), revisi: sekarang };
      u[x.s.kolom] = 'https://drive.google.com/file/d/' + x.f.getId() + '/view';
      beda.push('foto ' + x.s.label);
    });
    if (!beda.length) return Object.assign(jawabBa_(r, 'TIDAK_BERUBAH'), { revision: Number(r.revision) || 0, diubah: [] });
    if (teksBa_(r.ttd_file_id)) u['Status TTD'] = 'TTD ULANG';   // v0.78.0: isi BA berubah = BA TTD lama tidak berlaku
    Object.assign(u, {
      foto_meta: JSON.stringify(meta), 'Revisi BA': (Number(r['Revisi BA']) || 0) + 1, 'Status PDF': 'BELUM',
      'Timestamp Update': sekarang, diubah_oleh: oleh
    });
    tulisBlok_(tR, [{ r: r, u: u }], [], { bolehId: ['pejabat_id_1', 'pejabat_id_2', 'section_id'] });
    var peringatan = [];
    var g = tG.rows.filter(function (x) { return String(x.gardu_id) === teksBa_(r.gardu_id); })[0] || null;
    if (g && String(g.ba_id_terakhir) === d.baId) {
      var ug = Object.assign({}, umum, { 'PTS/LBS': String(sec.section), section_id: String(sec.section_id), 'Diubah Oleh': sesi.username || '',
        'Timestamp Update': sekarang, diubah_oleh: oleh });
      if (String(g.ba_id_pengoperasian) === d.baId) ug['Tanggal Operasi'] = d.tanggalPekerjaan;
      tulisBlok_(tG, [{ r: g, u: ug }], [], { bolehId: ['section_id'] });
    } else if (g) {
      peringatan.push('Master Gardu ' + teksBa_(g['No Gardu']) + ' tidak diubah: sudah ada BA lebih baru.');
    }
    // foto pengganti jadi foto utama, foto lama dibuang SESUDAH baris menunjuk foto baru
    revisi.forEach(function (x) { try { x.f.setDescription(PENANDA_FOTO_ + d.baId + '-' + x.s.slot); } catch (eD) { /* penanda tetap REVISI */ } });
    buang.forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (eB) { /* sudah tidak ada */ } });
    auditLog_(sesi, 'BA_GARDU_UBAH', teksBa_(r['ID BA']), beda.join(', ') + (d.alasan ? ' | ' + d.alasan : ''), 'MOBILE', tLog);
    if (revisi.length) diubah = r;
    return Object.assign(jawabBa_(r, 'OK', { peringatan: peringatan }), { revision: Number(r.revision) || 0, revisiBa: u['Revisi BA'], diubah: beda });
  });
  if (diubah) rapikanSesudahBa_(diubah);   // v0.77.0: nama foto pengganti dirapikan (gagal = BA tetap tersimpan)
  return hasil;
}
