/**
 * v0.66.0 (draf disetujui Master Guswan 9 Okt 2026): Pengecekan Switching = anak P0 "Pengecekan Switching" (yan_Switching).
 *
 *  simpanSwitchingYandal      data satu switching (section LBS / ACR penyulang P0, indikator Nyala / Padam, Arus R/S/T).
 *                             Kirim ulang = tidak dobel (kunci switching_id). Sesudah disimpan hanya Arus R/S/T yang
 *                             boleh diubah, selama P0 belum SELESAI. Section / indikator / catatan terkunci.
 *  uploadFotoSwitchingYandal  satu foto (ARUS wajib dulu, lalu GANGGUAN_1..5 opsional), kamera SiSi saja, foto yang sudah
 *                             diterima tidak bisa diganti. Foto ARUS = Jam Pengecekan + Koordinat.
 *
 * Syarat: P0 milik tim + shift token, Nama Pekerjaan "Pengecekan Switching", foto Sebelum P0 sudah diterima server,
 * P0 belum SELESAI. Foto Sesudah P0 Pengecekan Switching ditolak server kalau belum ada switching ber-foto arus
 * (cekSwitchingSebelumSesudah_, dipanggil uploadFotoP0Yandal_). Guard, lock, tulisBlok_, audit sama dengan P0.
 */
var YAN_PEKERJAAN_SWITCHING_ = 'Pengecekan Switching';
var YAN_SLOT_SWITCHING_ = ['ARUS', 'GANGGUAN_1', 'GANGGUAN_2', 'GANGGUAN_3', 'GANGGUAN_4', 'GANGGUAN_5'];
var YAN_INDIKATOR_ = ['Nyala', 'Padam'];
var YAN_SWITCHING_MAKS_PER_P0_ = 1;   // v0.66.3 (keputusan Master Guswan 9 Okt 2026): SATU switching per P0
var YAN_ARUS_MAKS_ = 5000;   // ampere sisi TM

/** Kolom sheet per slot foto switching. */
function kolomFotoSwitching_(slot) {
  if (slot === 'ARUS') return { foto: 'Foto Arus', link: 'Link Drive Arus', id: 'foto_id_arus' };
  var n = String(slot).replace('GANGGUAN_', '');
  return { foto: 'Foto Arus Gangguan ' + n, link: 'Link Drive Arus Gangguan ' + n, id: 'foto_id_gangguan_' + n };
}

function kunciNama_(v) { return String(v === undefined || v === null ? '' : v).trim().replace(/\s+/g, ' ').toLowerCase(); }

/** P0 ini butuh switching (Nama Pekerjaan "Pengecekan Switching", huruf besar / kecil bebas). */
function p0Switching_(nama) { return kunciNama_(nama) === kunciNama_(YAN_PEKERJAAN_SWITCHING_); }

/** Nama Switching = bagian depan nama section sebelum " - " ("LBS A - LBS B" = "LBS A"). */
function namaSwitching_(section) {
  var s = String(section === undefined || section === null ? '' : section).trim();
  var i = s.indexOf(' - ');
  return (i === -1 ? s : s.slice(0, i)).trim();
}

/** Hanya switching LBS / ACR (keputusan Master Guswan 9 Okt 2026). */
function switchingSah_(nama) { return /^(LBS|ACR)(\b|[^A-Za-z])/i.test(String(nama || '').trim()); }

/** Kode berikutnya per P0 (semua status): <Kode P0>-SWC.nnn. */
function kodeSwitchingBerikut_(rowsP0, kodeP0) {
  var maks = 0;
  rowsP0.forEach(function (r) {
    var m = /-SWC\.(\d+)$/.exec(teksP0_(r['Kode Switching']));
    if (m) maks = Math.max(maks, Number(m[1]));
  });
  return kodeP0 + '-SWC.' + pad3_(maks + 1);
}

/** Section switching dari db_Jaringan: wajib section penyulang P0 dan LBS / ACR. */
function sectionSwitching_(sectionId, penyulangP0) {
  var s = tabel_('MASTER_SHEET_ID', 'db_Jaringan').rows.filter(function (r) { return String(r.section_id) === sectionId; })[0];
  if (!s) throw new SisiError_('SECTION_TIDAK_DIKENAL', sectionId);
  if (!teksP0_(penyulangP0)) throw new SisiError_('FIELD_WAJIB', 'penyulang P0');
  if (kunciNama_(s.penyulang) !== kunciNama_(penyulangP0)) throw new SisiError_('SECTION_BUKAN_PENYULANG', sectionId);
  var nama = namaSwitching_(s.section);
  if (!switchingSah_(nama)) throw new SisiError_('BUKAN_SWITCHING', nama);
  return { penyulang: String(s.penyulang).trim(), section: String(s.section).trim(), nama: nama };
}

/** P0 induk (tim + shift token, aktif, Pengecekan Switching, foto Sebelum sudah di server). */
function p0IndukSwitching_(rowsP0, sesi, shift, p0Id) {
  var l = rowsP0.filter(function (x) { return String(x.p0_id) === String(p0Id); });
  if (!l.length) throw new SisiError_('DATA_TIDAK_DITEMUKAN', p0Id);
  if (l.length > 1) throw new SisiError_('DATA_GANDA', p0Id);
  var r = l[0];
  if (String(r.tim_id) !== String(sesi.timId) || String(r.shift_id) !== String(shift.shift_id)) throw new SisiError_('BUKAN_MILIK_TIM', p0Id);
  if (String(r.status || 'AKTIF') === 'BATAL') throw new SisiError_('SUDAH_BATAL', p0Id);
  if (!p0Switching_(r['Nama Pekerjaan'])) throw new SisiError_('BUKAN_PENGECEKAN_SWITCHING', teksP0_(r['Nama Pekerjaan']));
  if (!teksP0_(r.foto_id_sebelum)) throw new SisiError_('URUTAN_FOTO', 'foto SEBELUM P0 belum ada');
  return r;
}

function p0Selesai_(r) { return teksP0_(r['Status P0']) === 'SELESAI'; }

function jawabSwitching_(r) {
  return {
    switchingId: String(r.switching_id), p0Id: String(r.p0_id), kodeSwitching: teksP0_(r['Kode Switching']),
    namaSwitching: teksP0_(r['Nama Switching']),
    fotoServer: YAN_SLOT_SWITCHING_.filter(function (s) { return !!teksP0_(r[kolomFotoSwitching_(s).id]); })
  };
}

function simpanSwitchingYandal_(sesi, data, platform) {
  wajibPetugasYandalHp_(sesi, platform);
  var ind = { tipe: 'pilihan', wajib: true, pilihan: YAN_INDIKATOR_ };
  var arus = { tipe: 'angka', wajib: true, min: 0, max: YAN_ARUS_MAKS_ };
  var d = validasi_(data, {
    switchingId: { tipe: 'uuid', wajib: true },
    p0Id: { tipe: 'uuid', wajib: true },
    sectionId: { tipe: 'uuid', wajib: true },
    indikatorRemote: ind, indikatorLocal: ind, indikatorProtection: ind, indikatorReclose: ind,
    arusR: arus, arusS: arus, arusT: arus,
    catatan: { tipe: 'teks', maks: 300, multiBaris: true, maksBaris: 5 },
    // v0.66.2 (audit guard): jam switching dibuat di HP (jam terpercaya). Switching BARU wajib di dalam jam shift,
    // tidak sebelum foto Sebelum P0, tidak lewat jam server: mode sync sesudah shift tidak bisa menambah switching baru.
    dibuat: { tipe: 'waktu', wajib: true },
    installId: { tipe: 'uuid' }
  });
  var sekarangMs = sekarangMsYandal_(), dibuatMs = Date.parse(d.dibuat);

  return denganLock_(function () {
    var t = bacaSheetYandal_(['yan_Shift', 'yan_P0', 'yan_Switching']);
    var logT = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var sh = shiftSesiP0_(t.yan_Shift.rows, sesi, null), s = sh.r;
    var p = p0IndukSwitching_(t.yan_P0.rows, sesi, s, d.p0Id);
    var semua = t.yan_Switching.rows;
    var lama = semua.filter(function (x) { return String(x.switching_id) === d.switchingId; });
    if (lama.length > 1) throw new SisiError_('DATA_GANDA', d.switchingId);
    var r = lama[0] || null;
    var iso = new Date(sekarangMs).toISOString(), terima = waktuWib_(sekarangMs, true), aksi;
    var arusBaru = { 'Arus R (A)': d.arusR, 'Arus S (A)': d.arusS, 'Arus T (A)': d.arusT };

    if (r) {
      if (String(r.p0_id) !== d.p0Id || String(r.tim_id) !== String(sesi.timId)) throw new SisiError_('ID_DIPAKAI', d.switchingId);
      if (String(r.status || 'AKTIF') === 'BATAL') throw new SisiError_('SUDAH_BATAL', d.switchingId);
      // terkunci sesudah disimpan: section, indikator, catatan (keputusan Master Guswan 9 Okt 2026: yang boleh diubah hanya angka arus)
      var kunci = String(r.section_id) !== d.sectionId ||
        teksP0_(r['Indikator Remote']) !== d.indikatorRemote || teksP0_(r['Indikator Local']) !== d.indikatorLocal ||
        teksP0_(r['Indikator Protection']) !== d.indikatorProtection || teksP0_(r['Indikator Reclose']) !== d.indikatorReclose ||
        teksP0_(r.Catatan) !== (d.catatan || '');
      // v0.66.1: kode sendiri (DATA_TERKUNCI sudah dipakai ROW untuk data lebih dari 7 hari, pesan HP-nya beda)
      if (kunci) throw new SisiError_('SWITCHING_TERKUNCI', 'hanya Arus R/S/T yang boleh diubah');
      var berubah = Object.keys(arusBaru).filter(function (k) { return Number(r[k]) !== arusBaru[k]; });
      if (!berubah.length) return jawabSwitching_(r);   // kirim ulang tanpa perubahan
      if (p0Selesai_(p)) throw new SisiError_('P0_SUDAH_SELESAI', teksP0_(p['Kode P0']));
      var u = { 'Waktu Diterima': terima, 'Timestamp Update': iso, diubah_oleh: sesi.userId };
      berubah.forEach(function (k) { u[k] = arusBaru[k]; });
      tulisBlok_(t.yan_Switching, [{ r: r, u: u }], []);
      Object.assign(r, u);
      aksi = 'UBAH_ARUS_SWITCHING';
    } else {
      if (p0Selesai_(p)) throw new SisiError_('P0_SUDAH_SELESAI', teksP0_(p['Kode P0']));
      cekWaktuShiftP0_(dibuatMs, sh.j, sekarangMs, 'dibuat switching');
      var mulaiMs = waktuP0Ms_(p, 'SEBELUM', 'Waktu Sebelum');
      if (mulaiMs !== null && dibuatMs < mulaiMs - 60e3) throw new SisiError_('WAKTU_TIDAK_URUT', 'switching sebelum foto Sebelum P0');
      var milikP0 = semua.filter(function (x) { return String(x.p0_id) === d.p0Id; });
      if (milikP0.filter(function (x) { return String(x.status || 'AKTIF') !== 'BATAL'; }).length >= YAN_SWITCHING_MAKS_PER_P0_) {
        throw new SisiError_('SWITCHING_SUDAH_ADA', 'satu switching per P0');
      }
      // v0.66.4: Nama Switching = section P0 (dipilih di form P0, bisa diubah lewat edit P0 sebelum switching disimpan)
      if (teksP0_(p.section_id) !== d.sectionId) throw new SisiError_('SECTION_BEDA_P0', d.sectionId);
      var sec = sectionSwitching_(d.sectionId, p.Penyulang);
      var baru = {
        No: (semua.length ? Math.max.apply(null, semua.map(function (x) { return x._baris; })) : 1),
        'Kode Header': p['Kode Header'], 'Kode Shift': p['Kode Shift'], 'Kode P0': p['Kode P0'],
        'Kode Switching': kodeSwitchingBerikut_(milikP0, teksP0_(p['Kode P0'])),
        ULP: p.ULP, Hari: p.Hari, Tanggal: tglSel_(p.Tanggal), Tim: p.Tim, Shift: p.Shift, Petugas: p.Petugas,
        Penyulang: sec.penyulang, Section: sec.section, 'Nama Switching': sec.nama, Catatan: d.catatan || '',
        'Indikator Remote': d.indikatorRemote, 'Indikator Local': d.indikatorLocal,
        'Indikator Protection': d.indikatorProtection, 'Indikator Reclose': d.indikatorReclose,
        'Waktu Diterima': terima, 'Input Oleh': sesi.nama || sesi.username, Timestamp: iso, 'Timestamp Update': iso,
        switching_id: d.switchingId, p0_id: d.p0Id, shift_id: p.shift_id, tim_id: sesi.timId, section_id: d.sectionId,
        foto_meta: '{}', install_id: d.installId || '', status: 'AKTIF', revision: 1, dibuat_oleh: sesi.userId, diubah_oleh: sesi.userId
      };
      Object.assign(baru, arusBaru);
      tulisBlok_(t.yan_Switching, [], [baru]);
      r = baru;
      aksi = 'SIMPAN_SWITCHING';
    }
    auditLog_(sesi, aksi, teksP0_(r['Kode Switching']), teksP0_(r['Nama Switching']), platform, logT);
    return jawabSwitching_(r);
  });
}

function uploadFotoSwitchingYandal_(sesi, data, platform) {
  wajibPetugasYandalHp_(sesi, platform);
  var d = validasi_(data, {
    switchingId: { tipe: 'uuid', wajib: true },
    slot: { tipe: 'pilihan', wajib: true, pilihan: YAN_SLOT_SWITCHING_ },
    sumber: { tipe: 'pilihan', wajib: true, pilihan: ['KAMERA'] },
    sha256: { tipe: 'teks', wajib: true, maks: 64, pola: /^[0-9a-f]{64}$/ },
    ukuranByte: { tipe: 'angka', wajib: true, bulat: true, min: 1, max: FOTO_MAKS_BYTE_ },
    data: { tipe: 'teks', wajib: true, maks: Math.ceil(FOTO_MAKS_BYTE_ / 3) * 4 + 4 },
    waktu: { tipe: 'waktu', wajib: true },
    waktuHp: { tipe: 'waktu' },
    sumberWaktu: { tipe: 'pilihan', pilihan: ['SERVER', 'HP'] },
    lat: { tipe: 'angka', min: -90, max: 90 },
    lng: { tipe: 'angka', min: -180, max: 180 },
    akurasiM: { tipe: 'angka', min: 0, max: 100000 },
    gpsSusulanDetik: { tipe: 'angka', bulat: true, min: 0, max: YAN_P0_SUSULAN_MAKS_DETIK_ }
  });
  var c = cfg_();
  if (!c.YANDAL_FOTO_FOLDER_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'YANDAL_FOTO_FOLDER_ID');
  var bytes;
  try { bytes = Utilities.base64Decode(d.data); } catch (e) { throw new SisiError_('FORMAT_SALAH', 'data'); }
  if (bytes.length > FOTO_MAKS_BYTE_) throw new SisiError_('FOTO_TERLALU_BESAR', bytes.length);
  if (bytes.length !== d.ukuranByte) throw new SisiError_('FOTO_RUSAK', 'ukuran');
  if (bytesKeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)) !== d.sha256) throw new SisiError_('FOTO_RUSAK', 'sha256');
  var dim = ukuranJpeg_(bytes);
  if (!dim) throw new SisiError_('FORMAT_FOTO_SALAH');
  if (Math.max(dim.lebar, dim.tinggi) > FOTO_MAKS_SISI_) throw new SisiError_('FOTO_TERLALU_BESAR', dim.lebar + 'x' + dim.tinggi);
  if ((d.lat === undefined) !== (d.lng === undefined)) throw new SisiError_('FIELD_WAJIB', d.lat === undefined ? 'lat' : 'lng');
  if (d.gpsSusulanDetik !== undefined && d.lat === undefined) throw new SisiError_('FIELD_WAJIB', 'lat');
  var waktuMs = Date.parse(d.waktu);
  var sekarangMs = sekarangMsYandal_();

  return denganLock_(function () {
    var t = bacaSheetYandal_(['yan_Shift', 'yan_P0', 'yan_Switching']);
    var logT = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var sh = shiftSesiP0_(t.yan_Shift.rows, sesi, null), s = sh.r, j = sh.j;
    var l = t.yan_Switching.rows.filter(function (x) { return String(x.switching_id) === d.switchingId; });
    if (!l.length) throw new SisiError_('DATA_TIDAK_DITEMUKAN', d.switchingId);
    if (l.length > 1) throw new SisiError_('DATA_GANDA', d.switchingId);
    var r = l[0];
    if (String(r.tim_id) !== String(sesi.timId) || String(r.shift_id) !== String(s.shift_id)) throw new SisiError_('BUKAN_MILIK_TIM', d.switchingId);
    if (String(r.status || 'AKTIF') === 'BATAL') throw new SisiError_('SUDAH_BATAL', d.switchingId);
    var p = p0IndukSwitching_(t.yan_P0.rows, sesi, s, r.p0_id);
    var k = kolomFotoSwitching_(d.slot), meta = metaP0_(r);
    if (teksP0_(r[k.id])) {
      if (meta[d.slot] && meta[d.slot].sha256 === d.sha256) return Object.assign(jawabSwitching_(r), { status: 'DUPLIKAT' });
      throw new SisiError_('FOTO_SUDAH_ADA', d.slot);
    }
    if (p0Selesai_(p)) throw new SisiError_('P0_SUDAH_SELESAI', teksP0_(p['Kode P0']));
    if (d.slot !== 'ARUS' && !teksP0_(r.foto_id_arus)) throw new SisiError_('URUTAN_FOTO', 'foto ARUS belum ada');
    cekWaktuShiftP0_(waktuMs, j, sekarangMs, 'waktu foto');
    var mulaiMs = waktuP0Ms_(p, 'SEBELUM', 'Waktu Sebelum');
    if (mulaiMs !== null && waktuMs < mulaiMs - 1000) throw new SisiError_('WAKTU_TIDAK_URUT', 'foto switching sebelum foto Sebelum P0');

    var folder = folderFoto_(c.YANDAL_FOTO_FOLDER_ID, pathFotoP0_(p));
    var penanda = d.switchingId + '-' + d.slot;
    var file = cariFileFoto_(folder, penanda), fileBaru = !file;
    if (fileBaru) {
      file = folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', namaFotoBebas_(folder, teksP0_(r['Kode Switching']), d.slot, 1, d.switchingId)));
      try { file.setDescription(PENANDA_FOTO_ + penanda); } catch (eD) { /* tanpa penanda */ }
    }
    pastikanFotoPrivat_(file, fileBaru);

    meta[d.slot] = { waktu: d.waktu, waktuHp: d.waktuHp || d.waktu, sumberWaktu: d.sumberWaktu || 'HP', sumber: d.sumber,
                     lat: d.lat === undefined ? null : d.lat, lng: d.lng === undefined ? null : d.lng,
                     akurasi: d.akurasiM === undefined ? null : d.akurasiM, sha256: d.sha256, ukuran: bytes.length };
    if (d.gpsSusulanDetik !== undefined) meta[d.slot].gpsSusulanDetik = d.gpsSusulanDetik;
    var rw = ringkasWaktuP0_(meta), iso = new Date(sekarangMs).toISOString();
    var u = {};
    u[k.foto] = file.getName();
    u[k.link] = 'https://drive.google.com/file/d/' + file.getId() + '/view';
    u[k.id] = file.getId();
    u.foto_meta = JSON.stringify(meta);
    u['Sumber Waktu'] = rw.sumber;
    u['Selisih Jam HP (menit)'] = rw.selisih;
    u['Waktu Diterima'] = waktuWib_(sekarangMs, true);
    u['Timestamp Update'] = iso;
    u.diubah_oleh = sesi.userId;
    if (d.slot === 'ARUS') {
      u['Jam Pengecekan'] = waktuWib_(waktuMs, true);
      if (d.lat !== undefined) { u.Lat = d.lat; u.Long = d.lng; u.Koordinat = koordinatTeks_(d.lat, d.lng); }
    }
    tulisBlok_(t.yan_Switching, [{ r: r, u: u }], []);
    Object.assign(r, u);
    auditLog_(sesi, 'UPLOAD_FOTO_SWITCHING', teksP0_(r['Kode Switching']), d.slot + ' ' + file.getId(), platform, logT);
    return Object.assign(jawabSwitching_(r), { status: 'OK' });
  });
}

/**
 * Foto Sesudah P0 "Pengecekan Switching" hanya boleh kalau sudah ada switching (aktif) ber-foto arus.
 * Dipanggil uploadFotoP0Yandal_ di dalam lock. P0 jenis lain = tidak membaca yan_Switching.
 */
function cekSwitchingSebelumSesudah_(r) {
  if (!p0Switching_(r['Nama Pekerjaan'])) return;
  var sw = bacaSheetYandal_(['yan_Switching']).yan_Switching.rows.filter(function (x) {
    return String(x.p0_id) === String(r.p0_id) && String(x.status || 'AKTIF') !== 'BATAL' && teksP0_(x.foto_id_arus);
  });
  if (!sw.length) throw new SisiError_('SWITCHING_BELUM_ADA', teksP0_(r['Kode P0']));
}
