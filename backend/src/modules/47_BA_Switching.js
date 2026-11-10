/**
 * v1.0.49 (keputusan Master Guswan 30 Okt 2026): BA Switching dari HP / website, format isian + PDF sama v1 (SIE-BeritaAcara.html
 * swCards + SIE-BA-Code.js simpanBeritaAcaraSwitching + engine v1 build_ba_pdf_switching). Satu tab Rekap_BA dengan BA
 * trafo (Jenis Peralatan = SWITCHING), nomor sendiri: ID BA "BA-SWC-TBL-YYYYMM-NNN", No BA Full
 * "No. NNN / BA - SWC / ULP - TBL / M / YYYY" (melanjutkan Rekap Switching v1).
 *
 * Jenis (BA_JENIS_PEKERJAAN_.SWITCHING): Pengoperasian / Penggantian / Relokasi / Pemeriksaan / Kerusakan Switching.
 *   Penggantian + Relokasi : + data switching SESUDAH (jenis, nama, penyulang / section, merk, tipe, seri, koordinat, asal)
 *                            + foto nameplate / konstruksi sesudah.
 *   Pemeriksaan + Kerusakan: + Keterangan Kerusakan / Pemeriksaan (kolom Kesimpulan).
 * Tanpa OwnerId / External Reference, tanpa Master Gardu, tanpa Kirim EAM / Update Master (v1 tidak punya).
 * Foto: Konstruksi + SLD Sebelum + SLD Sesudah wajib (+ Konstruksi Sesudah untuk Penggantian / Relokasi), nameplate boleh kosong.
 * Nama Switching diketik (sama v1). Penyulang / Section dari db_Jaringan.
 */
var BA_JENIS_ALAT_SWITCHING_ = ['LBS Motorized', 'Recloser', 'Fuse Cut Out (FCO)', 'Disconnecting Switch (DS)'];

function baSwitching_(jenis) { return BA_JENIS_PEKERJAAN_.SWITCHING.indexOf(jenis) !== -1; }
function swPerluSesudah_(jenis) { return jenis === 'Penggantian Switching' || jenis === 'Relokasi Switching'; }
function swPerluKerusakan_(jenis) { return jenis === 'Pemeriksaan Switching' || jenis === 'Kerusakan Switching'; }

/** Slot foto switching per jenis (masuk BA_SLOT_FOTO_). */
function slotFotoSwitching_(jenis) {
  var s = [
    { slot: 'NAMEPLATE', kolom: 'Foto Nameplate', label: swPerluSesudah_(jenis) ? 'Nameplate Switching Sebelum' : 'Nameplate Switching', wajib: false },
    { slot: 'KONSTRUKSI', kolom: 'Foto Konstruksi', label: swPerluSesudah_(jenis) ? 'Konstruksi Switching Sebelum' : 'Konstruksi Switching' }
  ];
  if (swPerluSesudah_(jenis)) {
    s.push({ slot: 'NAMEPLATE_SESUDAH', kolom: 'Foto Nameplate Sesudah', label: 'Nameplate Switching Sesudah', wajib: false },
           { slot: 'KONSTRUKSI_SESUDAH', kolom: 'Foto Konstruksi Sesudah', label: 'Konstruksi Switching Sesudah' });
  }
  s.push({ slot: 'SLD_SEBELUM', kolom: 'Foto SLD Sebelum', label: 'SLD Sebelum' },
         { slot: 'SLD_SESUDAH', kolom: 'Foto SLD Sesudah', label: 'SLD Sesudah' });
  return s;
}

/** Field isian switching (simpan + ubah). */
function fieldSwitchingBa_(jenis) {
  var f = {
    tanggalPekerjaan: { tipe: 'tanggal', wajib: true },
    jenisSwitching: { tipe: 'pilihan', wajib: true, pilihan: BA_JENIS_ALAT_SWITCHING_ },
    namaSwitching: { tipe: 'teks', wajib: true, maks: 100 },
    sectionId: { tipe: 'uuid', wajib: true },
    merk: { tipe: 'teks', maks: 60 },
    tipe: { tipe: 'teks', maks: 60 },
    seri: { tipe: 'teks', maks: 60 },
    koordinat: { tipe: 'koordinat' },
    catatan: { tipe: 'teks', maks: 500 },
    petugas1Id: { tipe: 'uuid', wajib: true },
    petugas2Id: { tipe: 'uuid' }
  };
  if (swPerluKerusakan_(jenis)) f.kerusakan = { tipe: 'teks', maks: 1000 };
  if (swPerluSesudah_(jenis)) {
    Object.assign(f, {
      jenisSwitchingSesudah: { tipe: 'pilihan', wajib: true, pilihan: BA_JENIS_ALAT_SWITCHING_ },
      namaSwitchingSesudah: { tipe: 'teks', wajib: true, maks: 100 },
      sectionIdSesudah: { tipe: 'uuid', wajib: true },
      merkSesudah: { tipe: 'teks', maks: 60 },
      tipeSesudah: { tipe: 'teks', maks: 60 },
      seriSesudah: { tipe: 'teks', maks: 60 },
      koordinatSesudah: { tipe: 'koordinat' },
      asalSwitching: { tipe: 'teks', maks: 80 }
    });
  }
  return f;
}

/** Kolom Rekap_BA dari isian switching (sec / secSes = baris db_Jaringan). */
function isiSwitchingBa_(jenis, d, sec, secSes, pj) {
  var o = {
    'Jenis Peralatan': 'SWITCHING', 'Jenis Switching': d.jenisSwitching, 'Nama Peralatan': d.namaSwitching,
    Penyulang: String(sec.penyulang), Section: String(sec.section), section_id: String(sec.section_id),
    Merk: d.merk || '', Tipe: d.tipe || '', 'Nomor Seri': d.seri || '',
    Lat: d.koordinat ? d.koordinat.lat : '', Long: d.koordinat ? d.koordinat.lng : '',
    Catatan: d.catatan || '', Kesimpulan: swPerluKerusakan_(jenis) ? (d.kerusakan || '') : '',
    'Petugas 1': teksBa_(pj.p1.nama), 'Jabatan Petugas 1': teksBa_(pj.p1.jabatan),
    'Petugas 2': pj.p2 ? teksBa_(pj.p2.nama) : '', 'Jabatan Petugas 2': pj.p2 ? teksBa_(pj.p2.jabatan) : '',
    pejabat_id_1: String(pj.p1.pejabat_id), pejabat_id_2: pj.p2 ? String(pj.p2.pejabat_id) : ''
  };
  if (swPerluSesudah_(jenis)) {
    Object.assign(o, {
      'Jenis Switching Sesudah': d.jenisSwitchingSesudah, 'Nama Peralatan Sesudah': d.namaSwitchingSesudah,
      'Penyulang Sesudah': String(secSes.penyulang), 'Section Sesudah': String(secSes.section), section_id_sesudah: String(secSes.section_id),
      'Merk Sesudah': d.merkSesudah || '', 'Tipe Sesudah': d.tipeSesudah || '', 'Nomor Seri Sesudah': d.seriSesudah || '',
      'Lat Sesudah': d.koordinatSesudah ? d.koordinatSesudah.lat : '', 'Long Sesudah': d.koordinatSesudah ? d.koordinatSesudah.lng : '',
      'Asal Peralatan': d.asalSwitching || ''
    });
  }
  return o;
}

/** Foto upload BA (folder sementara / folder BA): { foto: {kolom: url}, meta: {slot: {fileId}}, kurang: [label] }. */
function fotoUploadSwitching_(jenis, folders, penanda) {
  var foto = {}, meta = {}, kurang = [];
  slotFotoSwitching_(jenis).forEach(function (s) {
    var f = cariFotoBaDi_(folders, penanda(s.slot));
    if (!f) { if (s.wajib !== false) kurang.push(s.label); return; }
    foto[s.kolom] = 'https://drive.google.com/file/d/' + f.getId() + '/view';
    meta[s.slot] = { fileId: f.getId() };
  });
  return { foto: foto, meta: meta, kurang: kurang };
}

function simpanBaSwitching_(sesi, data, platform) {
  var jenis = data && data.jenis;
  var d = validasi_(data, Object.assign({
    baId: { tipe: 'uuid', wajib: true },
    jenis: { tipe: 'pilihan', wajib: true, pilihan: BA_JENIS_PEKERJAAN_.SWITCHING },
    tanggalBa: { tipe: 'tanggal', wajib: true },
    installId: { tipe: 'uuid' }
  }, fieldSwitchingBa_(jenis)));
  if (d.tanggalBa > tglJakarta_(new Date())) throw new SisiError_('TANGGAL_TIDAK_VALID', 'tanggalBa di masa depan');
  if (d.tanggalPekerjaan > d.tanggalBa) throw new SisiError_('TANGGAL_TIDAK_VALID', 'tanggalPekerjaan sesudah tanggalBa');
  if (d.petugas2Id && d.petugas2Id === d.petugas1Id) throw new SisiError_('PEJABAT_TIDAK_VALID', 'petugas2Id sama dengan petugas1Id');

  var sec = sectionBa_(d.sectionId);
  var secSes = swPerluSesudah_(d.jenis) ? sectionBa_(d.sectionIdSesudah) : null;
  var pj = pejabatBa_(d.petugas1Id, d.petugas2Id);
  var up = fotoUploadSwitching_(d.jenis, folderUploadAdaBa_(d.jenis, d.baId), function (slot) { return d.baId + '-' + slot; });

  var tersimpan = null;
  var hasil = denganLock_(function () {
    var tR = cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA');
    var tLog = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var ada = barisBa_(tR.rows, d.baId);
    if (ada) { tersimpan = ada; return jawabBa_(ada, 'DUPLIKAT'); }
    if (up.kurang.length) throw new SisiError_('FOTO_BELUM_LENGKAP', up.kurang.join(', '));
    var sekarang = sekarangIso_(), oleh = sesi.userId || sesi.username;
    var nomor = nomorBaBerikut_(tR.rows, d.tanggalBa, 'SWC');
    var noBa = tR.rows.reduce(function (m, r) { return Math.max(m, Number(r.No) || 0); }, 0) + 1;
    var ba = Object.assign({}, up.foto, isiSwitchingBa_(d.jenis, d, sec, secSes, pj), {
      No: noBa, 'ID BA': nomor.idBa, 'No BA Full': nomor.noBaFull, 'Jenis Pekerjaan': d.jenis,
      'Tanggal BA': d.tanggalBa, 'Tanggal Pekerjaan': d.tanggalPekerjaan, ULP: cfg_().ULP_NAMA,
      Mengetahui: teksBa_(pj.tahu.nama), 'Jabatan Mengetahui': teksBa_(pj.tahu.jabatan), pejabat_id_mengetahui: String(pj.tahu.pejabat_id),
      'Status BA': 'AKTIF', 'Status PDF': 'BELUM', 'Revisi BA': 0, 'Status TTD': 'BELUM TTD', 'Diterapkan ke Master': 'TIDAK',
      'Input Oleh': sesi.username || '', Timestamp: sekarang, 'Timestamp Update': sekarang,
      ba_id: d.baId, foto_meta: JSON.stringify(up.meta), install_id: d.installId || '', revision: 1, dibuat_oleh: oleh, diubah_oleh: oleh
    });
    tulisBlok_(tR, [], [ba], { bolehId: ['section_id_sesudah'] });
    auditLog_(sesi, 'BA_GARDU_SIMPAN', nomor.idBa, d.jenis + ' ' + d.namaSwitching, platform, tLog);
    tersimpan = ba;
    return jawabBa_(ba, 'OK', { peringatan: [] });
  });
  var rapi = tersimpan ? rapikanSesudahBa_(tersimpan) : null;
  if (rapi) hasil.folder = rapi.folder;
  return hasil;
}

/** Koreksi BA switching (isian + foto pengganti). Jenis, ID BA, No BA, Tanggal BA tetap. */
function ubahBaSwitching_(sesi, data, awal, platform) {
  var jenis = teksBa_(awal['Jenis Pekerjaan']);
  var d = validasi_(data, Object.assign({
    baId: { tipe: 'uuid', wajib: true },
    revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 },
    alasan: { tipe: 'teks', maks: 300 }
  }, fieldSwitchingBa_(jenis)));
  if (d.petugas2Id && d.petugas2Id === d.petugas1Id) throw new SisiError_('PEJABAT_TIDAK_VALID', 'petugas2Id sama dengan petugas1Id');
  if (d.tanggalPekerjaan > tglSelBa_(awal['Tanggal BA'])) throw new SisiError_('TANGGAL_TIDAK_VALID', 'tanggalPekerjaan sesudah tanggalBa');
  var sec = sectionBa_(d.sectionId);
  var secSes = swPerluSesudah_(jenis) ? sectionBa_(d.sectionIdSesudah) : null;
  var pj = pejabatBa_(d.petugas1Id, d.petugas2Id);
  var folders = [folderBa_(awal)].concat(folderUploadAdaBa_(jenis, d.baId));
  var revisi = [];
  slotFotoSwitching_(jenis).forEach(function (s) {
    var f = cariFotoBaDi_(folders, penandaRevisiBa_(d.baId, s.slot));
    if (f) revisi.push({ s: s, f: f });
  });

  var diubah = null;
  var hasil = denganLock_(function () {
    if (CacheService.getScriptCache().get('pdfba:' + d.baId)) throw new SisiError_('PDF_SEDANG_DIBUAT', teksBa_(awal['ID BA']));
    var tR = cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA');
    var tLog = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var r = barisBaAktif_(tR.rows, d.baId);
    if ((Number(r.revision) || 0) !== d.revision) throw new SisiError_('DATA_BERUBAH', teksBa_(r['ID BA']));
    var sekarang = sekarangIso_(), oleh = sesi.userId || sesi.username;
    var u = Object.assign(isiSwitchingBa_(jenis, d, sec, secSes, pj), { 'Tanggal Pekerjaan': d.tanggalPekerjaan });
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
    tulisBlok_(tR, [{ r: r, u: u }], [], { bolehId: ['pejabat_id_1', 'pejabat_id_2', 'section_id', 'section_id_sesudah'] });
    revisi.forEach(function (x) { try { x.f.setDescription(PENANDA_FOTO_ + d.baId + '-' + x.s.slot); } catch (eD) { /* penanda tetap REVISI */ } });
    buang.forEach(function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (eB) { /* sudah tidak ada */ } });
    auditLog_(sesi, 'BA_GARDU_UBAH', teksBa_(r['ID BA']), beda.join(', ') + (d.alasan ? ' | ' + d.alasan : ''), platform, tLog);
    // nama switching berubah = folder BA ikut dipindah (rapikanSesudahBa_)
    if (revisi.length || u['Nama Peralatan'] !== teksBa_(awal['Nama Peralatan'])) diubah = Object.assign({}, r, u);
    return Object.assign(jawabBa_(r, 'OK', { peringatan: [] }), { revision: Number(r.revision) || 0, revisiBa: u['Revisi BA'], diubah: beda });
  });
  if (diubah) rapikanSesudahBa_(diubah);
  return hasil;
}

/** Koordinat "lat, lng" dari dua sel ('' kalau kosong). */
function koordinatBa_(lat, lng) {
  var a = teksBa_(lat), b = teksBa_(lng);
  return a && b ? a + ', ' + b : '';
}

/** Baris Rekap_BA switching -> data engine (kunci sama engine v1 build_ba_pdf_switching). */
function dataPdfSwitching_(r) {
  return {
    nomorBA: teksBa_(r['ID BA']), nomorBAFull: teksBa_(r['No BA Full']), jenisPekerjaan: teksBa_(r['Jenis Pekerjaan']),
    tanggalBA: tglSelBa_(r['Tanggal BA']), tanggalPekerjaan: tglSelBa_(r['Tanggal Pekerjaan']),
    jenisSwitching: teksBa_(r['Jenis Switching']), namaSwitching: teksBa_(r['Nama Peralatan']), merk: teksBa_(r.Merk),
    tipe: teksBa_(r.Tipe), nomorSeri: teksBa_(r['Nomor Seri']), penyulang: teksBa_(r.Penyulang), section: teksBa_(r.Section),
    koordinat: koordinatBa_(r.Lat, r.Long),
    jenisSwitchingSesudah: teksBa_(r['Jenis Switching Sesudah']), namaSwitchingSesudah: teksBa_(r['Nama Peralatan Sesudah']),
    merkSesudah: teksBa_(r['Merk Sesudah']), tipeSesudah: teksBa_(r['Tipe Sesudah']), nomorSeriSesudah: teksBa_(r['Nomor Seri Sesudah']),
    penyulangSesudah: teksBa_(r['Penyulang Sesudah']), sectionSesudah: teksBa_(r['Section Sesudah']),
    koordinatSesudah: koordinatBa_(r['Lat Sesudah'], r['Long Sesudah']), asalSwitching: teksBa_(r['Asal Peralatan']),
    keteranganTambahan: teksBa_(r.Catatan), keteranganKerusakan: teksBa_(r.Kesimpulan),
    petugas1: teksBa_(r['Petugas 1']), jabatan1: teksBa_(r['Jabatan Petugas 1']),
    petugas2: teksBa_(r['Petugas 2']), jabatan2: teksBa_(r['Jabatan Petugas 2']),
    mengetahui: teksBa_(r.Mengetahui), jabatanMengetahui: teksBa_(r['Jabatan Mengetahui'])
  };
}

/** Isian BA switching untuk form edit (getBaGardu). */
function detailSwitchingBa_(r) {
  var lat = angkaBa_(r['Lat Sesudah']), lng = angkaBa_(r['Long Sesudah']);
  return {
    jenisSwitching: teksBa_(r['Jenis Switching']), namaSwitching: teksBa_(r['Nama Peralatan']), tipe: teksBa_(r.Tipe),
    kerusakan: teksBa_(r.Kesimpulan),
    jenisSwitchingSesudah: teksBa_(r['Jenis Switching Sesudah']), namaSwitchingSesudah: teksBa_(r['Nama Peralatan Sesudah']),
    sectionIdSesudah: teksBa_(r.section_id_sesudah), penyulangSesudah: teksBa_(r['Penyulang Sesudah']), sectionSesudah: teksBa_(r['Section Sesudah']),
    tipeSesudah: teksBa_(r['Tipe Sesudah']), koordinatSesudah: lat === null || lng === null ? '' : lat + ', ' + lng,
    asalSwitching: teksBa_(r['Asal Peralatan'])
  };
}
