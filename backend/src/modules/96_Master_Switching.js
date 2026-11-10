/**
 * Master Switching (permintaan Master Guswan 8 Nov 2026; rancangan docs/superpowers/specs/2026-11-08-master-tiang-switching).
 * Pendataan aset switching dari lapangan (menu OPS_MASTER_SWITCHING, khusus ADMIN / SUPER, web + HP). Tab db_Switching di SiSi_Tiang
 * (TIANG_SHEET_ID, dibuat ADMIN_siapkanSheetTiang). Verifikasi Admin langsung berlaku (tanpa antrean persetujuan); pengamannya
 * log_Audit (nilai lama dan baru) + foto. Foto di Drive privat TIANG_FOTO_FOLDER_ID / Switching / <switching_id>.
 * ID dibuat server (SWC-0001, ...), tidak berubah walau nama diganti. Baris tidak pernah dihapus (aktif = FALSE).
 */

var SWC_MENU_ = 'OPS_MASTER_SWITCHING';
var SWC_SHEET_ = 'db_Switching';
var SWC_JENIS_ = ['PMT', 'ACR', 'SSO', 'LBS', 'FCO', 'DS'];
/** Bawaan bisa_trip per jenis (bisa diubah di isian): PMT / ACR memutus arus gangguan, FCO lewat fuse; LBS / SSO / DS tidak. */
var SWC_BISA_TRIP_ = { PMT: true, ACR: true, FCO: true };
var SWC_STATUS_VERIFIKASI_ = ['BELUM', 'TERVERIFIKASI', 'PERLU_PERBAIKAN'];
var SWC_FOTO_ = { UNIT: 'foto_unit_id', NAMEPLATE: 'foto_nameplate_id', KONTROLER: 'foto_kontroler_id' };
var SWC_MAKS_BARIS_ = 3000;

/**
 * Isian yang boleh diubah lewat simpanSwitching: [nama API, kolom sheet, aturan validasi_]. Kolom lain (switching_id, lat / lng,
 * proteksi_hulu_id, status, foto, audit) diisi server. Isian kosong = kolom dikosongkan (simpan = ganti seluruh isian).
 */
var SWC_ISIAN_ = [
  ['jenis', 'jenis', { tipe: 'pilihan', wajib: true, pilihan: SWC_JENIS_ }],
  ['nama', 'nama', { tipe: 'teks', wajib: true, maks: 80 }],
  ['penyulang', 'penyulang', { tipe: 'teks', wajib: true, maks: 80 }],
  ['sectionId', 'section_id', { tipe: 'teks', maks: 64, pola: /^[0-9A-Za-z_-]+$/ }],
  ['kodeAset', 'kode_aset', { tipe: 'teks', maks: 40 }],
  ['merkKontroler', 'merk_kontroler', { tipe: 'teks', maks: 60 }],
  ['tipeKontroler', 'tipe_kontroler', { tipe: 'teks', maks: 60 }],
  ['versiFirmware', 'versi_firmware', { tipe: 'teks', maks: 40 }],
  ['rasioCt', 'rasio_ct', { tipe: 'teks', maks: 30 }],
  ['rasioVt', 'rasio_vt', { tipe: 'teks', maks: 30 }],
  ['merk', 'merk', { tipe: 'teks', maks: 60 }],
  ['tipe', 'tipe', { tipe: 'teks', maks: 60 }],
  ['nomorSeri', 'nomor_seri', { tipe: 'teks', maks: 60 }],
  ['tahunPasang', 'tahun_pasang', { tipe: 'angka', bulat: true, min: 1950, max: 2100 }],
  ['ratingKv', 'rating_kv', { tipe: 'angka', min: 0, max: 1000 }],
  ['ratingA', 'rating_a', { tipe: 'angka', min: 0, max: 100000 }],
  ['kapasitasPutusKa', 'kapasitas_putus_ka', { tipe: 'angka', min: 0, max: 1000 }],
  ['media', 'media', { tipe: 'pilihan', pilihan: ['VAKUM', 'SF6', 'MINYAK', 'UDARA'] }],
  ['penggerak', 'penggerak', { tipe: 'pilihan', pilihan: ['MANUAL', 'MOTOR'] }],
  ['tiangId', 'tiang_id', { tipe: 'teks', maks: 40, pola: /^[0-9A-Za-z._-]+$/ }],
  ['switchingHuluId', 'switching_hulu_id', { tipe: 'teks', maks: 20, pola: /^SWC-\d{4,}$/ }],
  ['posisiNormal', 'posisi_normal', { tipe: 'pilihan', wajib: true, pilihan: ['NC', 'NO'] }],
  ['titikHubung', 'titik_hubung', { tipe: 'bool' }],
  ['tiangSisiA', 'tiang_sisi_a', { tipe: 'teks', maks: 40, pola: /^[0-9A-Za-z._-]+$/ }],
  ['tiangSisiB', 'tiang_sisi_b', { tipe: 'teks', maks: 40, pola: /^[0-9A-Za-z._-]+$/ }],
  ['penyulangSisiB', 'penyulang_sisi_b', { tipe: 'teks', maks: 80 }],
  ['bisaTrip', 'bisa_trip', { tipe: 'bool' }],
  ['catatGangguan', 'catat_gangguan', { tipe: 'bool' }],
  ['bacaArus', 'baca_arus', { tipe: 'bool' }],
  ['bacaTegangan', 'baca_tegangan', { tipe: 'bool' }],
  ['terhubungScada', 'terhubung_scada', { tipe: 'bool' }],
  ['kodeRtu', 'kode_rtu', { tipe: 'teks', maks: 40 }],
  ['mediaKomunikasi', 'media_komunikasi', { tipe: 'pilihan', pilihan: ['GSM', 'RADIO', 'FO'] }],
  ['fungsiFco', 'fungsi_fco', { tipe: 'pilihan', pilihan: ['CABANG', 'GARDU'] }],
  ['fuseTipe', 'fuse_tipe', { tipe: 'pilihan', pilihan: ['K', 'T', 'H'] }],
  ['fuseRating', 'fuse_rating', { tipe: 'teks', maks: 20 }],
  ['statusOperasi', 'status_operasi', { tipe: 'pilihan', wajib: true, pilihan: ['OPERASI', 'TIDAK_OPERASI', 'DIBONGKAR'] }],
  ['kondisi', 'kondisi', { tipe: 'pilihan', pilihan: ['BAIK', 'PERLU_PERBAIKAN', 'RUSAK'] }],
  ['catatan', 'catatan', { tipe: 'teks', maks: 300, multiBaris: true, maksBaris: 6 }]
];
var SWC_KOLOM_FCO_ = ['fungsi_fco', 'fuse_tipe', 'fuse_rating'];
var SWC_BOOL_ = ['titik_hubung', 'bisa_trip', 'catat_gangguan', 'baca_arus', 'baca_tegangan', 'terhubung_scada'];
/** Kolom *_id referensi yang boleh diubah tulisBlok_ (switching_id sendiri tetap terkunci). */
var SWC_BOLEH_ID_ = ['section_id', 'tiang_id', 'switching_hulu_id', 'proteksi_hulu_id', 'foto_unit_id', 'foto_nameplate_id', 'foto_kontroler_id'];

/** Peran pertama: ADMIN / SUPER (keputusan Master Guswan 8 Nov 2026: pendataan + verifikasi hanya Admin). */
function wajibAdminSwitching_(sesi) {
  if (!sesi || ['ADMIN', 'SUPER'].indexOf(sesi.role) === -1) throw new SisiError_('AKSES_DITOLAK', 'master switching khusus admin');
}

function wajibKonfigTiang_() {
  if (!cfg_().TIANG_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'TIANG_SHEET_ID');
}

function tabelSwitching_() {
  wajibKonfigTiang_();
  return cekHeaderSkema_(tabel_('TIANG_SHEET_ID', SWC_SHEET_), 'TIANG_SHEET_ID', SWC_SHEET_);
}

function teksSwc_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

function angkaSwc_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

/** Penyulang + section aktif dari db_Jaringan: { penyulang: {KUNCI: nama}, section: {section_id: {penyulang, section}}, daftar }. */
function jaringanSwitching_() {
  var hasil = { penyulang: {}, section: {}, daftar: [] };
  tabel_('MASTER_SHEET_ID', 'db_Jaringan').rows.forEach(function (r) {
    var pny = teksSwc_(r.penyulang), id = teksSwc_(r.section_id);
    if (!pny || !id || !isAktif_(r.aktif)) return;
    hasil.penyulang[pny.toUpperCase()] = pny;
    hasil.section[id] = { penyulang: pny, section: teksSwc_(r.section) };
    hasil.daftar.push({ sectionId: id, penyulang: pny, section: teksSwc_(r.section), urutan: angkaSwc_(r.urutan) });
  });
  hasil.daftar.sort(function (a, b) { return a.penyulang.localeCompare(b.penyulang) || (a.urutan || 0) - (b.urutan || 0) || a.section.localeCompare(b.section); });
  return hasil;
}

/**
 * Proteksi hulu tiap switching: berjalan ke hulu lewat switching_hulu_id sampai switching aktif yang bisa_trip (bukan dirinya).
 * Rantai putus / berputar = ''. Hasil {switching_id: proteksi_hulu_id}.
 */
function proteksiHuluSwc_(rows) {
  var peta = {}, hasil = {};
  rows.forEach(function (r) { if (teksSwc_(r.switching_id)) peta[teksSwc_(r.switching_id)] = r; });
  Object.keys(peta).forEach(function (id) {
    var lihat = {}, cur = teksSwc_(peta[id].switching_hulu_id), dapat = '';
    lihat[id] = true;
    while (cur && !lihat[cur] && peta[cur]) {
      lihat[cur] = true;
      if (isAktif_(peta[cur].aktif) && isAktif_(peta[cur].bisa_trip)) { dapat = cur; break; }
      cur = teksSwc_(peta[cur].switching_hulu_id);
    }
    hasil[id] = dapat;
  });
  return hasil;
}

/** Baris sheet -> objek API. */
function swcKeApi_(r, proteksiHulu) {
  var o = { switchingId: teksSwc_(r.switching_id) };
  SWC_ISIAN_.forEach(function (x) {
    var k = x[1], v = r[k];
    if (SWC_BOOL_.indexOf(k) !== -1) o[x[0]] = isAktif_(v);
    else if (x[2].tipe === 'angka') o[x[0]] = angkaSwc_(v);
    else o[x[0]] = teksSwc_(v);
  });
  o.lat = angkaSwc_(r.lat);
  o.lng = angkaSwc_(r.lng);
  o.koordinat = o.lat !== null && o.lng !== null ? o.lat + ', ' + o.lng : '';
  o.proteksiHuluId = proteksiHulu !== undefined ? proteksiHulu : teksSwc_(r.proteksi_hulu_id);
  o.statusVerifikasi = teksSwc_(r.status_verifikasi) || 'BELUM';
  o.verifikasiTerakhir = teksSwc_(r.verifikasi_terakhir);
  o.foto = { UNIT: !!teksSwc_(r.foto_unit_id), NAMEPLATE: !!teksSwc_(r.foto_nameplate_id), KONTROLER: !!teksSwc_(r.foto_kontroler_id) };
  o.aktif = isAktif_(r.aktif);
  o.revision = Number(r.revision) || 0;
  o.diubahPada = teksSwc_(r.diubah_pada);
  return o;
}

/** getMasterSwitching {} -> { switching: [...], jaringan: [{sectionId, penyulang, section}], waktu }. Baris nonaktif ikut (bisa diaktifkan ulang). */
function getMasterSwitching_(sesi, data) {
  wajibAdminSwitching_(sesi);
  validasi_(data || {}, {});
  var rows = tabelSwitching_().rows.filter(function (r) { return teksSwc_(r.switching_id); });
  var hulu = proteksiHuluSwc_(rows);
  var jar = jaringanSwitching_();
  return {
    switching: rows.map(function (r) { return swcKeApi_(r, hulu[teksSwc_(r.switching_id)]); }),
    jaringan: jar.daftar.map(function (x) { return { sectionId: x.sectionId, penyulang: x.penyulang, section: x.section }; }),
    waktu: sekarangIso_()
  };
}

/** Nomor berikutnya SWC-nnnn (4 digit, lebih panjang bila lewat 9999). */
function idSwitchingBaru_(rows) {
  var maks = 0;
  rows.forEach(function (r) {
    var m = /^SWC-(\d+)$/.exec(teksSwc_(r.switching_id));
    if (m && Number(m[1]) > maks) maks = Number(m[1]);
  });
  var n = String(maks + 1);
  while (n.length < 4) n = '0' + n;
  return 'SWC-' + n;
}

/**
 * Isian -> kolom sheet, divalidasi + aturan bisnis (penyulang / section dari db_Jaringan, titik hubung, hulu tanpa putaran,
 * kolom FCO hanya untuk FCO, nama unik per penyulang di antara baris aktif). [id] = switching_id baris yang diubah ('' = baru).
 */
function isianSwitching_(d, rows, jar, id) {
  var u = {};
  SWC_ISIAN_.forEach(function (x) {
    var v = d[x[0]];
    if (v === undefined) v = SWC_BOOL_.indexOf(x[1]) !== -1 ? false : '';
    u[x[1]] = v;
  });
  var pny = jar.penyulang[String(u.penyulang).toUpperCase()];
  if (!pny) throw new SisiError_('PENYULANG_TIDAK_DIKENAL', u.penyulang);
  u.penyulang = pny;
  if (u.section_id) {
    var sec = jar.section[u.section_id];
    if (!sec) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'section');
    if (sec.penyulang !== pny) throw new SisiError_('SECTION_BEDA_PENYULANG', u.section_id);
  }
  if (u.titik_hubung) {
    var b = jar.penyulang[String(u.penyulang_sisi_b).toUpperCase()];
    if (!b) throw new SisiError_('PENYULANG_TIDAK_DIKENAL', 'penyulangSisiB');
    if (b === pny) throw new SisiError_('DATA_TIDAK_VALID', 'penyulangSisiB sama dengan penyulang');
    u.penyulang_sisi_b = b;
  } else {
    u.tiang_sisi_a = ''; u.tiang_sisi_b = ''; u.penyulang_sisi_b = '';
  }
  if (d.bisaTrip === undefined) u.bisa_trip = !!SWC_BISA_TRIP_[u.jenis];
  if (u.jenis !== 'FCO') SWC_KOLOM_FCO_.forEach(function (k) { u[k] = ''; });
  if (!u.terhubung_scada) { u.kode_rtu = ''; u.media_komunikasi = ''; }

  var peta = {};
  rows.forEach(function (r) { peta[teksSwc_(r.switching_id)] = r; });
  if (u.switching_hulu_id) {
    if (u.switching_hulu_id === id) throw new SisiError_('HULU_TIDAK_VALID', 'diri sendiri');
    if (!peta[u.switching_hulu_id] || !isAktif_(peta[u.switching_hulu_id].aktif)) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'switching hulu');
    // putaran: berjalan ke hulu dari hulu baru tidak boleh kembali ke baris ini
    var lihat = {}, cur = u.switching_hulu_id;
    while (cur && peta[cur] && !lihat[cur]) {
      if (id && cur === id) throw new SisiError_('HULU_TIDAK_VALID', 'rantai hulu berputar');
      lihat[cur] = true;
      cur = teksSwc_(peta[cur].switching_hulu_id);
    }
  }
  var nama = String(u.nama).toUpperCase();
  rows.forEach(function (r) {
    if (teksSwc_(r.switching_id) === id || !isAktif_(r.aktif)) return;
    if (teksSwc_(r.penyulang).toUpperCase() === pny.toUpperCase() && teksSwc_(r.nama).toUpperCase() === nama) throw new SisiError_('NAMA_GANDA', u.nama);
  });
  return u;
}

/**
 * simpanSwitching { switchingId?, revision?, koordinat, statusVerifikasi?, aktif?, ...isian } -> { switching }.
 * Tanpa switchingId = baris baru (ID dibuat server). Dengan switchingId = ubah, revision wajib sama dengan di sheet (KONFLIK_REVISION).
 * Simpan oleh Admin = verifikasi langsung berlaku (status TERVERIFIKASI kecuali dipilih PERLU_PERBAIKAN), verifikasi_terakhir = sekarang.
 */
function simpanSwitching_(sesi, data, platform) {
  wajibAdminSwitching_(sesi);
  var skema = { switchingId: { tipe: 'teks', maks: 20, pola: /^SWC-\d{4,}$/ }, revision: { tipe: 'angka', bulat: true, min: 1 },
    koordinat: { tipe: 'koordinat', wajib: true }, statusVerifikasi: { tipe: 'pilihan', pilihan: ['TERVERIFIKASI', 'PERLU_PERBAIKAN'] },
    aktif: { tipe: 'bool' } };
  SWC_ISIAN_.forEach(function (x) { skema[x[0]] = x[2]; });
  var d = validasi_(data, skema);
  if (d.switchingId && d.revision === undefined) throw new SisiError_('FIELD_WAJIB', 'revision');
  wajibKonfigTiang_();
  var jar = jaringanSwitching_();
  return denganLock_(function () {
    var t = tabelSwitching_();
    var rows = t.rows.filter(function (r) { return teksSwc_(r.switching_id); });
    var lama = d.switchingId ? rows.filter(function (r) { return teksSwc_(r.switching_id) === d.switchingId; }) : [];
    if (lama.length > 1) throw new SisiError_('ID_GANDA', d.switchingId);
    if (d.switchingId && !lama.length) throw new SisiError_('DATA_TIDAK_DITEMUKAN', d.switchingId);
    if (lama.length && Number(lama[0].revision || 0) !== d.revision) throw new SisiError_('KONFLIK_REVISION', d.switchingId);
    if (!lama.length && rows.length >= SWC_MAKS_BARIS_) throw new SisiError_('TERLALU_BANYAK', SWC_SHEET_);
    var id = d.switchingId || idSwitchingBaru_(rows);
    var u = isianSwitching_(d, rows, jar, d.switchingId || '');
    var sekarang = sekarangIso_();
    u.lat = d.koordinat.lat;
    u.lng = d.koordinat.lng;
    u.status_verifikasi = d.statusVerifikasi || 'TERVERIFIKASI';
    u.verifikasi_terakhir = sekarang;
    u.aktif = d.aktif !== undefined ? d.aktif : lama.length ? isAktif_(lama[0].aktif) : true;
    u.diubah_pada = sekarang;
    u.diubah_oleh = sesi.userId;
    var semua = rows.map(function (r) { return r === lama[0] ? Object.assign({}, r, u) : r; });
    if (!lama.length) semua.push(Object.assign({ switching_id: id }, u));
    u.proteksi_hulu_id = proteksiHuluSwc_(semua)[id] || '';
    var baris;
    if (lama.length) {
      var beda = bedaSwitching_(lama[0], u);
      tulisBlok_(t, [{ r: lama[0], u: u }], [], { bolehId: SWC_BOLEH_ID_ });
      baris = lama[0];
      auditLog_(sesi, 'SWITCHING_UBAH', SWC_SHEET_, id + ': ' + (beda || 'tanpa perubahan isian (verifikasi ulang)'), platform,
        headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    } else {
      baris = Object.assign({ No: noBaris_(t, 0), switching_id: id, revision: 1, foto_unit_id: '', foto_nameplate_id: '', foto_kontroler_id: '', sirkuit_id: '' }, u);
      tulisBlok_(t, [], [baris]);
      auditLog_(sesi, 'SWITCHING_BARU', SWC_SHEET_, id + ' ' + u.jenis + ' ' + u.nama + ' (' + u.penyulang + ')', platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    }
    return { switching: swcKeApi_(baris, u.proteksi_hulu_id) };
  });
}

/** Ringkas kolom yang berubah untuk log_Audit: "kolom: lama -> baru; ..." (waktu / pengubah diabaikan). */
function bedaSwitching_(lama, u) {
  var abai = { diubah_pada: true, diubah_oleh: true, verifikasi_terakhir: true };
  return Object.keys(u).filter(function (k) { return !abai[k] && teksSwc_(lama[k]) !== teksSwc_(u[k]); })
    .map(function (k) { return k + ': ' + (teksSwc_(lama[k]) || '-') + ' -> ' + (teksSwc_(u[k]) || '-'); }).join('; ');
}

/**
 * uploadFotoSwitching { switchingId, slot UNIT | NAMEPLATE | KONTROLER, sha256, ukuranByte, data } -> { switchingId, slot }.
 * Foto baru menggantikan foto slot itu (file lama tetap di Drive). Kiriman ulang foto yang sama = file yang sama.
 */
function uploadFotoSwitching_(sesi, data, platform) {
  wajibAdminSwitching_(sesi);
  var skema = isiFotoLapangan_();
  skema.switchingId = { tipe: 'teks', wajib: true, maks: 20, pola: /^SWC-\d{4,}$/ };
  skema.slot = { tipe: 'pilihan', wajib: true, pilihan: Object.keys(SWC_FOTO_) };
  var d = validasi_(data, skema);
  wajibKonfigTiang_();
  var folderId = cfg_().TIANG_FOTO_FOLDER_ID;
  if (!folderId) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'TIANG_FOTO_FOLDER_ID');
  var bytes = bytesFotoLapangan_(d);
  return denganLock_(function () {
    var t = tabelSwitching_();
    var r = t.rows.filter(function (x) { return teksSwc_(x.switching_id) === d.switchingId; });
    if (r.length > 1) throw new SisiError_('ID_GANDA', d.switchingId);
    if (!r.length) throw new SisiError_('DATA_TIDAK_DITEMUKAN', d.switchingId);
    var kol = SWC_FOTO_[d.slot];
    var f = simpanFotoLapangan_(folderId, ['Switching', d.switchingId], d.switchingId + '|' + d.slot + '|' + d.sha256,
      d.switchingId + '_' + d.slot + '.jpg', bytes);
    if (teksSwc_(r[0][kol]) !== f.fileId) {
      var u = { diubah_pada: sekarangIso_(), diubah_oleh: sesi.userId };
      u[kol] = f.fileId;
      tulisBlok_(t, [{ r: r[0], u: u }], [], { bolehId: [kol] });
      auditLog_(sesi, 'SWITCHING_FOTO', SWC_SHEET_, d.switchingId + ' foto ' + d.slot, platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    }
    return { switchingId: d.switchingId, slot: d.slot, revision: Number(r[0].revision) || 0 };
  });
}

/** getFotoSwitching { switchingId, slot, ukuran? KECIL | PENUH } -> foto base64 (KECIL = thumbnail). */
function getFotoSwitching_(sesi, data) {
  wajibAdminSwitching_(sesi);
  var d = validasi_(data, { switchingId: { tipe: 'teks', wajib: true, maks: 20, pola: /^SWC-\d{4,}$/ },
    slot: { tipe: 'pilihan', wajib: true, pilihan: Object.keys(SWC_FOTO_) }, ukuran: { tipe: 'pilihan', pilihan: ['KECIL', 'PENUH'] } });
  var r = tabelSwitching_().rows.filter(function (x) { return teksSwc_(x.switching_id) === d.switchingId; })[0];
  if (!r) throw new SisiError_('DATA_TIDAK_DITEMUKAN', d.switchingId);
  return jawabFotoDriveWo_(teksSwc_(r[SWC_FOTO_[d.slot]]), d.slot, d.ukuran, { switchingId: d.switchingId });
}
