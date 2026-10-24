/**
 * v1.0.10 (permintaan kvlar 21 Okt 2026): WO tindak lanjut temuan inspeksi.
 *
 * Alur: temuan (petugas inspeksi jaringan / gardu, atau input admin) masuk db_temuan_inspeksi status "Penugasan Tim"
 *   -> ADMIN meneruskan WO ke tim aktif db_Tim (ROW / HARTEK / YANDAL): status_wo TERKIRIM, status "Progress Pekerjaan".
 *      Selama TERKIRIM, admin boleh memindah ke tim lain (teruskanWo lagi) atau menarik kembali (tarikWo).
 *   -> PETUGAS tim itu menekan Mulai Kerjakan WO (mulaiWo): status_wo DIKERJAKAN, WO TERKUNCI (tidak bisa dipindah /
 *      ditarik, temuan tidak bisa diubah petugas inspeksi).
 *   -> Petugas mencatat pekerjaan (simpanPekerjaanWo, 1 temuan bisa banyak pekerjaan) + foto (uploadFotoWo), status DRAFT
 *      di db_temuan_tindak_lanjut. Belum masuk realisasi tim.
 *        ROW    : diameter batang -> jenis Rabas / Tebang Sedang / Tebang Besar (aturan db_Jenis_Pekerjaan modul ROW).
 *        HARTEK : pekerjaan master HARTEK + jumlah (banyak pekerjaan per temuan).
 *        YANDAL : nama pekerjaan master YANDAL (1 pekerjaan = 1 P0).
 *   -> Petugas menekan Selesai (selesaiWo): BARU sekarang pekerjaan masuk realisasi tim (satu lock):
 *        ROW    : row_Eksekusi (+ row_Realisasi penyulang bila belum ada, + row_Foto) di Laporan Utama ROW hari ini.
 *        HARTEK : db_Hartek_Pekerjaan (+ db_Hartek_PenyulangGardu bila belum ada) di Laporan Utama Hartek hari ini.
 *        YANDAL : yan_P0 SELESAI (Menunggu verifikasi admin, point lewat Approval P0) di shift aktif.
 *      ID baris modul = tl_id (kirim ulang / gagal di tengah tidak membuat baris kembar). Temuan "Selesai".
 *
 * v1.0.16 (permintaan kvlar 22 Okt 2026):
 *  - HP mengerjakan WO offline (antrean di HP). Kalau admin memindah WO selama tim lama bekerja offline, kiriman tim
 *    lama ditolak WO_DIPINDAH (tim pernah ditugaskan, db_wo_riwayat). Petugas bisa tetap mengunggah (mulaiWo paksa):
 *    tim lama tercatat KLAIM di db_wo_ganda dan boleh mengunggah pekerjaan + foto. Selama ada klaim, Selesai tim mana
 *    pun DITAHAN (SIAP, menungguVerifikasi) sampai admin memilih tim yang sah (putuskanWoGanda, menu OPS_WO_GANDA).
 *    Tim terpilih: WO jadi milik tim itu (DIKERJAKAN), HP-nya mengirim ulang Selesai otomatis. Tim lain: pekerjaan
 *    BATAL, HP-nya membuang WO itu.
 *  - Koordinat pekerjaan wajib. WO Yandal: foto wajib dari kamera (galeri ditolak), koordinat dari GPS HP.
 *  - Hartek: satu isian boleh banyak pekerjaan + material (kolom rincian JSON), masuk db_Hartek_Pekerjaan +
 *    db_Hartek_Material saat Selesai. Foto tetap satu set per isian.
 */

var WO_STATUS_ = { kirim: 'TERKIRIM', kerja: 'DIKERJAKAN', selesai: 'SELESAI' };
var WO_JENIS_TIM_ = ['ROW', 'HARTEK', 'YANDAL'];
var WO_MENU_ = { admin: 'OPS_PENERUSAN_WO', tim: 'OPS_WO_TIM', ganda: 'OPS_WO_GANDA' };
var WO_TL_SHEET_ = 'db_temuan_tindak_lanjut';
var WO_RIWAYAT_SHEET_ = 'db_wo_riwayat';   // v1.0.16
var WO_GANDA_SHEET_ = 'db_wo_ganda';       // v1.0.16
var WO_GANDA_STATUS_ = { klaim: 'KLAIM', siap: 'SIAP', dipilih: 'DIPILIH', ditolak: 'DITOLAK' };
var WO_RINCIAN_MAKS_ = { pekerjaan: 15, material: 30 };
var WO_TL_STATUS_ = { draft: 'DRAFT', tercatat: 'TERCATAT', batal: 'BATAL' };
var WO_TEMUAN_STATUS_ = { tugas: 'Penugasan Tim', progress: 'Progress Pekerjaan', selesai: 'Selesai' };
var WO_SLOT_ = { SEBELUM: 'foto_sebelum', PEKERJAAN: 'foto_pekerjaan', SESUDAH: 'foto_sesudah' };
/** Foto wajib sebelum Selesai: ROW (foto_lengkap row_Eksekusi) + YANDAL (P0 SELESAI) 3 foto; HARTEK sebelum + sesudah. */
var WO_SLOT_WAJIB_ = { ROW: ['SEBELUM', 'PEKERJAAN', 'SESUDAH'], YANDAL: ['SEBELUM', 'PEKERJAAN', 'SESUDAH'], HARTEK: ['SEBELUM', 'SESUDAH'] };
var WO_SELESAI_HARI_ = 7;   // WO selesai masih tampil di daftar tim selama 7 hari

/* ===== peran ===== */

/** Admin: bukan PETUGAS (pola wajibAdminTemuan_). */
function wajibAdminWo_(sesi) {
  if (!sesi || sesi.role === 'PETUGAS' || ROLE_VALID_().indexOf(sesi.role) === -1) {
    throw new SisiError_('AKSES_DITOLAK', 'penerusan WO khusus admin');
  }
}

/** Petugas tim tindak lanjut: PETUGAS ROW / HARTEK / YANDAL dengan tim. YANDAL = HP + token shift (sama P0). */
function wajibPetugasWo_(sesi, platform) {
  if (!sesi || sesi.role !== 'PETUGAS' || WO_JENIS_TIM_.indexOf(sesi.jenisTim) === -1 || !sesi.timId) {
    throw new SisiError_('AKSES_DITOLAK', 'WO hanya petugas ROW / HARTEK / YANDAL');
  }
  if (sesi.jenisTim === 'YANDAL' && (!sesi._sampai || platform !== 'MOBILE')) throw new SisiError_('AKSES_DITOLAK', 'WO Yandal hanya dari HP saat shift');
}

/**
 * Dipakai petugas inspeksi (ubahTemuanInsJar / ubahTemuanInsDu): WO yang sudah dimulai tim = temuan terkunci.
 * v1.0.17 (permintaan kvlar 22 Okt 2026, integritas audit): temuan yang SUDAH DITERUSKAN ke tim (TERKIRIM) juga terkunci,
 * karena tim tindak lanjut bisa sudah menyalin isian petugas inspeksi ke HP (offline). Perbaikan = admin tarik WO dulu.
 */
function cekTemuanBolehDiubahWo_(t) {
  var s = String((t && t.status_wo) || '');
  if (s === WO_STATUS_.kerja || s === WO_STATUS_.selesai) throw new SisiError_('WO_SUDAH_DIMULAI', String(t.kode_temuan || ''));
  if (s === WO_STATUS_.kirim) throw new SisiError_('WO_SUDAH_DITERUSKAN', String(t.kode_temuan || ''));
}

/* ===== helper ===== */

function teksWo_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

function tabelTemuanWo_() { return tabelInsJar_(INSJAR_SHEET_.TEMUAN); }
function tabelTlWo_() { return tabelInsJar_(WO_TL_SHEET_); }

/** v1.0.16: tab tambahan (riwayat / ganda). Belum dibuat ADMIN_siapkanSheetInsJar = null (fitur lama tetap jalan). */
function tabelOpsiWo_(nama) {
  try { return tabelInsJar_(nama); } catch (e) {
    if (e && e.kode === 'SHEET_TIDAK_ADA') return null;
    throw e;
  }
}

/** v1.0.16: catat penugasan ke db_wo_riwayat (tab belum ada = dilewati). */
function catatRiwayatWo_(t, tim, aksi, sesi) {
  var tR = tabelOpsiWo_(WO_RIWAYAT_SHEET_);
  if (!tR) return;
  var sekarang = sekarangIso_();
  tambahBaris_(tR, sisipAuditInsJar_({
    nomor: tR.rows.length + 1, kode_temuan: teksWo_(t.kode_temuan), tim: tim ? tim.nama : '', jenis_tim: tim ? tim.jenis : '',
    aksi: aksi, waktu: sekarang, oleh: sesi.username || sesi.userId, riwayat_id: uuid_(), temuan_id: String(t.temuan_id),
    tim_id: tim ? tim.timId : ''
  }, sesi, sekarang));
}

/** v1.0.16: tim ini pernah ditugaskan WO ini (riwayat teruskan / pindah). */
function pernahDitugaskanWo_(temuanId, timId) {
  var tR = tabelOpsiWo_(WO_RIWAYAT_SHEET_);
  return !!tR && tR.rows.some(function (r) { return String(r.temuan_id) === String(temuanId) && String(r.tim_id) === String(timId); });
}

/** v1.0.16: baris db_wo_ganda satu temuan (semua status). Tab belum ada = []. */
function gandaTemuanWo_(rowsG, temuanId) {
  return (rowsG || []).filter(function (g) { return String(g.temuan_id) === String(temuanId); });
}

function gandaAktifWo_(g) { var s = teksWo_(g.status); return s === WO_GANDA_STATUS_.klaim || s === WO_GANDA_STATUS_.siap; }

/**
 * v1.0.16: akses kerja petugas atas WO. Pemilik (tim_tindak_lanjut_id) = { t, pemilik: true }. Tim lama dengan klaim
 * KLAIM = { t, klaim: baris }. Tim lama tanpa klaim = WO_DIPINDAH (detail: tim baru / 'ditarik admin'). Selain itu
 * BUKAN_MILIK_TIM.
 */
function aksesWo_(rows, temuanId, sesi, rowsG) {
  var t = temuanWo_(rows, temuanId);
  if (String(t.tim_tindak_lanjut_id || '') === String(sesi.timId) && teksWo_(t.status_wo)) return { t: t, pemilik: true };
  var klaim = gandaTemuanWo_(rowsG, temuanId).filter(function (g) { return String(g.tim_id) === String(sesi.timId) && gandaAktifWo_(g); })[0];
  if (klaim) return { t: t, klaim: klaim };
  if (pernahDitugaskanWo_(temuanId, sesi.timId)) {
    throw new SisiError_('WO_DIPINDAH', teksWo_(t.tim_tindak_lanjut) || 'ditarik admin');
  }
  throw new SisiError_('BUKAN_MILIK_TIM', 'WO');
}

/** v1.0.16: pemilik = WO harus DIKERJAKAN; tim klaim = klaim masih KLAIM (belum menekan Selesai). */
function wajibBolehKerjaWo_(a) {
  if (a.pemilik) return wajibWoDikerjakan_(a.t);
  if (teksWo_(a.klaim.status) !== WO_GANDA_STATUS_.klaim) throw new SisiError_('WO_MENUNGGU_VERIFIKASI', teksWo_(a.t.kode_temuan));
}

function rowsGandaWo_() { var tG = tabelOpsiWo_(WO_GANDA_SHEET_); return tG ? tG.rows : []; }

/**
 * v1.0.16: rincian WO Hartek (banyak pekerjaan + material). Baris lama tanpa rincian = 1 pekerjaan (id = tl_id).
 * v1.0.17 (permintaan kvlar 22 Okt 2026): material MENEMPEL ke pekerjaan yang memakainya. Bentuk tersimpan:
 * {pekerjaan: [{id, jenisId, nama, jumlah, satuan, material: [{id, materialId, nama, jumlah, satuan, kepemilikan}]}]}.
 * Hasil selalu berisi pekerjaan[].material + daftar datar material[] (tiap baris + pekerjaanId) untuk pembaca lama.
 * Rincian lama (material di luar pekerjaan) = material dianggap milik pekerjaan pertama.
 */
function rincianWo_(r) {
  var o = null;
  try { o = JSON.parse(String(r.rincian || '')); } catch (e) { o = null; }
  var pk = o && Array.isArray(o.pekerjaan) && o.pekerjaan.length ? o.pekerjaan : [{
    id: String(r.tl_id), jenisId: teksWo_(r.jenis_id), nama: teksWo_(r.pekerjaan), jumlah: Number(r.jumlah) || 0, satuan: teksWo_(r.satuan)
  }];
  var lepas = o && Array.isArray(o.material) ? o.material : [];
  pk = pk.map(function (x, i) {
    var id = i === 0 ? String(r.tl_id) : String(x.id);
    var mt = (Array.isArray(x.material) ? x.material : []).concat(lepas.filter(function (m) {
      return m.pekerjaanId ? String(m.pekerjaanId) === id : i === 0;
    }));
    return Object.assign({}, x, { id: id, material: mt.map(function (m) { return Object.assign({}, m, { pekerjaanId: id }); }) });
  });
  var datar = [];
  pk.forEach(function (x) { datar = datar.concat(x.material); });
  return { pekerjaan: pk, material: datar };
}

/** Tim tujuan WO: db_Tim aktif berjenis ROW / HARTEK / YANDAL. */
function timTujuanWo_() {
  return tabel_('MASTER_SHEET_ID', 'db_Tim').rows.filter(function (r) {
    return r.tim_id && isAktif_(r.aktif) && WO_JENIS_TIM_.indexOf(teksWo_(r.jenis).toUpperCase()) !== -1;
  }).map(function (r) {
    return { timId: String(r.tim_id), nama: teksWo_(r.nama), kode: teksWo_(r.kode), jenis: teksWo_(r.jenis).toUpperCase() };
  }).sort(function (a, b) { return a.jenis.localeCompare(b.jenis) || a.nama.localeCompare(b.nama); });
}

function temuanWo_(rows, temuanId) {
  var l = rows.filter(function (r) { return String(r.temuan_id) === String(temuanId); });
  if (!l.length) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'temuan');
  if (l.length > 1) throw new SisiError_('DATA_GANDA', temuanId);
  return l[0];
}

function wajibWoDikerjakan_(t) {
  var s = teksWo_(t.status_wo);
  if (s === WO_STATUS_.selesai) throw new SisiError_('WO_SUDAH_SELESAI', teksWo_(t.kode_temuan));
  if (s !== WO_STATUS_.kerja) throw new SisiError_('WO_BELUM_DIMULAI', teksWo_(t.kode_temuan));
}

function metaFotoWo_(r) {
  try { var m = JSON.parse(String(r.foto_meta || '{}')); return m && typeof m === 'object' ? m : {}; } catch (e) { return {}; }
}

function tlKeHpWo_(r) {
  var foto = {};
  Object.keys(WO_SLOT_).forEach(function (s) { foto[s] = teksWo_(r[WO_SLOT_[s] + '_link']); });
  return {
    tlId: String(r.tl_id), kodeTl: teksWo_(r.kode_tl), temuanId: String(r.temuan_id), tanggal: tglSel_(r.tanggal),
    pekerjaan: teksWo_(r.pekerjaan), pekerjaanLainnya: teksWo_(r.pekerjaan_lainnya), jumlah: Number(r.jumlah) || 0,
    satuan: teksWo_(r.satuan), diameter: r.diameter === '' || r.diameter === null || r.diameter === undefined ? null : Number(r.diameter),
    nomorTiang: teksWo_(r.nomor_tiang), section: teksWo_(r.section), sectionId: teksWo_(r.section_id), koordinat: teksWo_(r.koordinat),
    catatan: teksWo_(r.catatan), jenisId: teksWo_(r.jenis_id), status: teksWo_(r.status), kodeRealisasiModul: teksWo_(r.kode_realisasi_modul),
    revision: Number(r.revision) || 1, foto: foto,
    rincian: teksWo_(r.jenis_tim) === 'HARTEK' ? rincianWo_(r) : null   // v1.0.16
  };
}

/** [timId] (v1.0.16) = hanya pekerjaan tim itu (WO ganda: tiap tim melihat kirimannya sendiri). */
function woKeHp_(t, rowsTl, timId) {
  var o = temuanKeHpInsJar_(t);
  o.pekerjaanWo = (rowsTl || []).filter(function (x) {
    return String(x.temuan_id) === String(t.temuan_id) && teksWo_(x.status) !== WO_TL_STATUS_.batal && (!timId || String(x.tim_id) === String(timId));
  }).map(tlKeHpWo_);
  return o;
}

/** Ringkasan isian kolom tindak_lanjut temuan, mis. "Tebang Sedang 2 Batang, Rabas / Pangkas 1 Gawang". */
function ringkasTindakLanjutWo_(tls) {
  var urut = [], jml = {}, sat = {};
  var tambah = function (n, jumlah, satuan) {
    if (!jml.hasOwnProperty(n)) { urut.push(n); jml[n] = 0; sat[n] = satuan; }
    jml[n] += Number(jumlah) || 0;
  };
  tls.forEach(function (x) {
    if (teksWo_(x.jenis_tim) === 'HARTEK') {   // v1.0.16: satu isian bisa banyak pekerjaan
      rincianWo_(x).pekerjaan.forEach(function (p) { tambah(teksWo_(p.nama), p.jumlah, teksWo_(p.satuan)); });
      return;
    }
    tambah(teksWo_(x.pekerjaan) + (teksWo_(x.pekerjaan_lainnya) ? ' (' + teksWo_(x.pekerjaan_lainnya) + ')' : ''), x.jumlah, teksWo_(x.satuan));
  });
  return urut.map(function (n) { return n + ' ' + jml[n] + (sat[n] ? ' ' + sat[n] : ''); }).join(', ');
}

/* ===== ADMIN: daftar + teruskan / pindah / tarik ===== */

/** status: BARU (belum diteruskan), TERKIRIM, DIKERJAKAN, SELESAI, AKTIF (selain SELESAI, default), SEMUA. */
function getWoAdmin_(sesi, data) {
  wajibAdminWo_(sesi);
  var d = validasi_(data, {
    status: { tipe: 'pilihan', pilihan: ['BARU', 'TERKIRIM', 'DIKERJAKAN', 'SELESAI', 'AKTIF', 'SEMUA'] },
    dari: { tipe: 'tanggal' }, sampai: { tipe: 'tanggal' }
  });
  var status = d.status || 'AKTIF';
  var rowsTl = tabelTlWo_().rows, semua = tabelTemuanWo_().rows;
  var rows = semua.filter(function (t) {
    var s = teksWo_(t.status_wo), tgl = tglInsJar_(t);
    if (d.dari && tgl < d.dari) return false;
    if (d.sampai && tgl > d.sampai) return false;
    if (status === 'SEMUA') return true;
    if (status === 'AKTIF') return s !== WO_STATUS_.selesai;
    if (status === 'BARU') return !s;
    return s === WO_STATUS_[{ TERKIRIM: 'kirim', DIKERJAKAN: 'kerja', SELESAI: 'selesai' }[status]];
  }).sort(function (a, b) { return tglInsJar_(a) < tglInsJar_(b) ? 1 : tglInsJar_(a) > tglInsJar_(b) ? -1 : b._baris - a._baris; });
  var ringkas = { baru: 0, terkirim: 0, dikerjakan: 0, selesai: 0 };
  semua.forEach(function (t) {
    var s = teksWo_(t.status_wo);
    if (!s) ringkas.baru++; else if (s === WO_STATUS_.kirim) ringkas.terkirim++; else if (s === WO_STATUS_.kerja) ringkas.dikerjakan++; else if (s === WO_STATUS_.selesai) ringkas.selesai++;
  });
  var rowsG = rowsGandaWo_();
  ringkas.ganda = {};
  rowsG.forEach(function (g) { if (gandaAktifWo_(g)) ringkas.ganda[String(g.temuan_id)] = true; });
  ringkas.ganda = Object.keys(ringkas.ganda).length;
  return {
    status: status, ringkas: ringkas, tim: timTujuanWo_(),
    temuan: rows.slice(0, 500).map(function (t) {
      var o = woKeHp_(t, rowsTl);
      o.wo.ganda = gandaTemuanWo_(rowsG, t.temuan_id).some(gandaAktifWo_);   // v1.0.16: menunggu verifikasi WO ganda
      return o;
    })
  };
}

/**
 * v1.0.15: foto temuan (slot TEMUAN / TIANG) untuk layar Penerusan WO. File Drive privat dibaca server:
 * KECIL (default) = thumbnail Drive (belum ada = file penuh), PENUH = file asli.
 * v1.0.16: + foto pekerjaan tim (SEBELUM / PEKERJAAN / SESUDAH + tlId) untuk detail WO dan verifikasi WO ganda.
 */
function getFotoWoAdmin_(sesi, data) {
  wajibAdminWo_(sesi);
  return fotoWoAdmin_(data);
}

/** v1.0.16: foto WO untuk layar Verifikasi WO Ganda (menu OPS_WO_GANDA), isi sama dengan getFotoWoAdmin_. */
function getFotoWoGanda_(sesi, data) {
  wajibAdminWo_(sesi);
  return fotoWoAdmin_(data);
}

function fotoWoAdmin_(data) {
  var d = validasi_(data, {
    temuanId: { tipe: 'uuid', wajib: true },
    tlId: { tipe: 'uuid' },
    slot: { tipe: 'pilihan', wajib: true, pilihan: Object.keys(INSJAR_FOTO_).concat(Object.keys(WO_SLOT_)) },
    ukuran: { tipe: 'pilihan', pilihan: ['KECIL', 'PENUH'] }
  });
  var t = temuanWo_(tabelTemuanWo_().rows, d.temuanId);
  if (INSJAR_FOTO_[d.slot]) return jawabFotoDriveWo_(teksWo_(t[INSJAR_FOTO_[d.slot] + '_file_id']), d.slot, d.ukuran, { temuanId: String(d.temuanId) });
  if (!d.tlId) throw new SisiError_('FIELD_WAJIB', 'tlId');
  var r = tabelTlWo_().rows.filter(function (x) { return String(x.tl_id) === String(d.tlId); })[0];
  if (!r || String(r.temuan_id) !== String(t.temuan_id)) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'pekerjaan');
  return jawabFotoDriveWo_(teksWo_(r[WO_SLOT_[d.slot] + '_file_id']), d.slot, d.ukuran, { temuanId: String(d.temuanId), tlId: String(d.tlId) });
}

/** Jawaban satu foto Drive privat: KECIL = thumbnail (belum ada = penuh), PENUH = file asli. [isi] = kunci tambahan. */
function jawabFotoDriveWo_(fileId, slot, ukuran, isi) {
  if (!fileId) throw new SisiError_('FOTO_TIDAK_ADA', slot);
  var file;
  try { file = DriveApp.getFileById(fileId); } catch (e) { throw new SisiError_('FOTO_TIDAK_ADA', slot); }
  var o = Object.assign({ slot: slot, mime: 'image/jpeg' }, isi);
  if (ukuran !== 'PENUH') {
    try {
      var th = file.getThumbnail(), b = th && th.getBytes ? th.getBytes() : null;
      if (b && b.length) return Object.assign(o, { kecil: true, ukuranByte: b.length, data: Utilities.base64Encode(b) });
    } catch (eT) { /* thumbnail belum ada: penuh */ }
  }
  if (String(file.getMimeType() || '').indexOf('image/') !== 0) throw new SisiError_('FOTO_TIDAK_VALID', 'mime');
  var bytes = file.getBlob().getBytes();
  return Object.assign(o, { kecil: false, ukuranByte: bytes.length, data: Utilities.base64Encode(bytes) });
}

/** Teruskan WO ke tim (juga untuk memindah WO TERKIRIM ke tim lain). WO yang sudah dimulai / selesai ditolak. */
function teruskanWo_(sesi, data) {
  wajibAdminWo_(sesi);
  return kirimWoKeTim_(sesi, data, false);
}

/**
 * v1.0.18 (permintaan kvlar 22 Okt 2026): Pindah Tim TO (menu OPS_PINDAH_TIM_TO). Hanya WO TERKIRIM (belum dimulai tim)
 * yang dipindah ke tim lain. Penerusan WO (teruskanWo) tidak lagi memindah WO terkirim: tab Terkirim di sana hanya lihat.
 */
function pindahWo_(sesi, data) {
  wajibAdminWo_(sesi);
  return kirimWoKeTim_(sesi, data, true);
}

/** v1.0.18: daftar Pindah Tim TO = WO TERKIRIM (isi sama getWoAdmin). */
function getWoPindah_(sesi, data) {
  wajibAdminWo_(sesi);
  return getWoAdmin_(sesi, Object.assign({}, data || {}, { status: 'TERKIRIM' }));
}

/** v1.0.18: foto temuan / tiang di layar Pindah Tim TO (isi sama getFotoWoAdmin). */
function getFotoWoPindah_(sesi, data) {
  wajibAdminWo_(sesi);
  return fotoWoAdmin_(data);
}

/** Teruskan (Penerusan WO) atau pindah (Pindah Tim TO) satu WO ke tim aktif. [pindahSaja] = mode Pindah Tim TO. */
function kirimWoKeTim_(sesi, data, pindahSaja) {
  var d = validasi_(data, {
    temuanId: { tipe: 'uuid', wajib: true },
    timId: { tipe: 'teks', wajib: true, maks: 60 },
    catatan: { tipe: 'teks', maks: 300, multiBaris: true, maksBaris: 5 },
    revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 }
  });
  var kabar = null;   // v1.0.29: notifikasi WO ke HP tim, dikirim sesudah lock dilepas
  var jawab = denganLock_(function () {
    var tt = tabelTemuanWo_();
    var t = temuanWo_(tt.rows, d.temuanId);
    var s = teksWo_(t.status_wo);
    if (s === WO_STATUS_.kerja) throw new SisiError_('WO_SUDAH_DIMULAI', teksWo_(t.kode_temuan));
    if (s === WO_STATUS_.selesai) throw new SisiError_('WO_SUDAH_SELESAI', teksWo_(t.kode_temuan));
    // v1.0.17: kiriman ulang antrean HP sesudah timeout (WO sudah TERKIRIM ke tim + catatan yang sama) = berhasil
    if (Number(t.revision) !== d.revision && s === WO_STATUS_.kirim && String(t.tim_tindak_lanjut_id || '') === String(d.timId) &&
        (d.catatan === undefined || d.catatan === teksWo_(t.catatan_admin))) {
      return { temuanId: String(d.temuanId), revision: Number(t.revision) || 1, pindah: false, duplikat: true, temuan: woKeHp_(t, []) };
    }
    if (Number(t.revision) !== d.revision) throw new SisiError_('KONFLIK_REVISION', d.temuanId);
    if (gandaTemuanWo_(rowsGandaWo_(), d.temuanId).some(gandaAktifWo_)) throw new SisiError_('WO_GANDA_MENUNGGU', teksWo_(t.kode_temuan));
    var tim = timTujuanWo_().filter(function (x) { return x.timId === String(d.timId); })[0];
    if (!tim) throw new SisiError_('TIM_TIDAK_VALID', d.timId);
    var pindah = s === WO_STATUS_.kirim && String(t.tim_tindak_lanjut_id) !== tim.timId;
    if (pindahSaja && s !== WO_STATUS_.kirim) throw new SisiError_('WO_BELUM_DITERUSKAN', teksWo_(t.kode_temuan));
    if (pindah && !pindahSaja) throw new SisiError_('WO_PINDAH_DI_MENU_PINDAH', teksWo_(t.kode_temuan));
    var sekarang = sekarangIso_();
    var u = {
      status: WO_TEMUAN_STATUS_.progress, status_wo: WO_STATUS_.kirim,
      tim_tindak_lanjut: tim.nama, jenis_tim_tindak_lanjut: tim.jenis, tim_tindak_lanjut_id: tim.timId,
      catatan_admin: d.catatan !== undefined ? d.catatan : teksWo_(t.catatan_admin),
      diteruskan_oleh: sesi.username || sesi.userId, waktu_diteruskan: sekarang,
      timestamp_update: sekarang, diubah_oleh: sesi.userId
    };
    var rev = ubahBaris_(tt, 'temuan_id', d.temuanId, u, d.revision);
    var baru = Object.assign({}, t, u, { revision: rev });
    if (String(t.tim_tindak_lanjut_id || '') !== tim.timId) catatRiwayatWo_(t, tim, pindah ? 'PINDAH' : 'TERUSKAN', sesi);   // v1.0.16
    hapusCacheLoncengTim_([tim.timId, String(t.tim_tindak_lanjut_id || '')]);   // v1.0.20: lonceng WO tim langsung terbaru
    auditLog_(sesi, pindah ? 'WO_PINDAH' : 'WO_TERUSKAN', teksWo_(t.kode_temuan),
      (pindah ? teksWo_(t.tim_tindak_lanjut) + ' -> ' : '') + tim.nama, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    if (s !== WO_STATUS_.kirim || pindah) kabar = { timId: tim.timId, t: baru };   // ubah catatan saja = tanpa notifikasi
    return { temuanId: String(d.temuanId), revision: rev, pindah: pindah, temuan: woKeHp_(baru, []) };
  }, 20000);
  if (kabar) notifWoTim_(kabar.timId, kabar.t);
  return jawab;
}

/** Tarik WO TERKIRIM kembali ke admin (belum dimulai tim). */
function tarikWo_(sesi, data) {
  wajibAdminWo_(sesi);
  var d = validasi_(data, { temuanId: { tipe: 'uuid', wajib: true }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 } });
  return denganLock_(function () {
    var tt = tabelTemuanWo_();
    var t = temuanWo_(tt.rows, d.temuanId);
    var s = teksWo_(t.status_wo);
    if (s === WO_STATUS_.kerja) throw new SisiError_('WO_SUDAH_DIMULAI', teksWo_(t.kode_temuan));
    if (s === WO_STATUS_.selesai) throw new SisiError_('WO_SUDAH_SELESAI', teksWo_(t.kode_temuan));
    // v1.0.17: kiriman ulang antrean HP sesudah timeout (WO sudah ditarik, revisi HP tertinggal) = berhasil
    if (s !== WO_STATUS_.kirim && Number(t.revision) !== d.revision) {
      return { temuanId: String(d.temuanId), revision: Number(t.revision) || 1, duplikat: true, temuan: woKeHp_(t, []) };
    }
    if (s !== WO_STATUS_.kirim) throw new SisiError_('WO_BELUM_DITERUSKAN', teksWo_(t.kode_temuan));
    if (Number(t.revision) !== d.revision) throw new SisiError_('KONFLIK_REVISION', d.temuanId);
    if (gandaTemuanWo_(rowsGandaWo_(), d.temuanId).some(gandaAktifWo_)) throw new SisiError_('WO_GANDA_MENUNGGU', teksWo_(t.kode_temuan));
    var u = {
      status: WO_TEMUAN_STATUS_.tugas, status_wo: '', tim_tindak_lanjut: '', jenis_tim_tindak_lanjut: '', tim_tindak_lanjut_id: '',
      diteruskan_oleh: '', waktu_diteruskan: '', timestamp_update: sekarangIso_(), diubah_oleh: sesi.userId
    };
    var rev = ubahBaris_(tt, 'temuan_id', d.temuanId, u, d.revision);
    catatRiwayatWo_(t, null, 'TARIK', sesi);   // v1.0.16
    hapusCacheLoncengTim_([String(t.tim_tindak_lanjut_id || '')]);   // v1.0.20
    auditLog_(sesi, 'WO_TARIK', teksWo_(t.kode_temuan), teksWo_(t.tim_tindak_lanjut), 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { temuanId: String(d.temuanId), revision: rev, temuan: woKeHp_(Object.assign({}, t, u, { revision: rev }), []) };
  }, 20000);
}

/* ===== PETUGAS tim tindak lanjut ===== */

/** Laporan Utama modul tim hari ini sudah ada (syarat Selesai). Hanya informasi untuk HP. */
function siapRealisasiWo_(sesi) {
  try {
    if (sesi.jenisTim === 'ROW') {
      var w = waktuRow_();
      return jendelaRow_('header', w.cutoff).rows.some(function (h) {
        return String(h.tim_id) === String(sesi.timId) && String(h.status) === 'AKTIF' && tanggalDariKode_(h['Kode Header']) === w.hariIni;
      });
    }
    if (sesi.jenisTim === 'HARTEK') return !!headerAktifHariIniHartek_(tabelHartek_(HARTEK_SHEET_.HEADER).rows, sesi.timId);
    shiftSesiP0_(bacaSheetYandal_(['yan_Shift']).yan_Shift.rows, sesi, null);
    return true;
  } catch (e) {
    if (e && e.kode) return false;
    throw e;
  }
}

/** Pilihan isian pekerjaan sesuai jenis tim. */
function masterPekerjaanWo_(sesi, rowsWo) {
  if (sesi.jenisTim === 'ROW') {
    var m = masterRow_(), peny = {};
    rowsWo.forEach(function (t) { peny[teksWo_(t.penyulang).toLowerCase()] = true; });
    return {
      jenis: m.jenis.filter(function (j) { return j.modul === 'ROW' && isAktif_(j.aktif); }).map(function (j) {
        return { jenisId: j.jenis_id, nama: j.nama, satuan: j.satuan, diameterMin: j.diameter_min === '' ? null : Number(j.diameter_min),
                 diameterMax: j.diameter_max === '' || j.diameter_max === undefined ? null : Number(j.diameter_max) };
      }),
      section: Object.keys(m.jaringan).filter(function (id) { var s = m.jaringan[id]; return s.aktif && peny[s.penyulang.toLowerCase()]; })
        .map(function (id) { return { sectionId: id, penyulang: m.jaringan[id].penyulang, section: m.jaringan[id].section, urutan: m.jaringan[id].urutan }; })
        .sort(function (a, b) { return a.penyulang.localeCompare(b.penyulang) || a.urutan - b.urutan; })
    };
  }
  if (sesi.jenisTim === 'HARTEK') {
    var mh = { jenis: jenisMasterHartek_(true).filter(function (r) { return jenisMasterPgHartek_(r.jenis_pekerjaan) !== null; }).map(function (r) {
      return { jenisId: String(r.jenis_id), nama: teksWo_(r.nama), satuan: teksWo_(r.satuan), jenisPekerjaan: jenisMasterPgHartek_(r.jenis_pekerjaan) || '' };
    }), material: [], kepemilikan: [] };
    // v1.0.16: material terpakai dicatat di isian WO yang sama (master db_Material + db_Kepemilikan_Material)
    try {
      mh.material = tabelMaterialHartek_().rows.filter(function (r) { return r.material_id && isAktif_(r.aktif) && teksWo_(r.nama_material); })
        .map(function (r) { return { materialId: String(r.material_id), nama: teksWo_(r.nama_material), satuan: teksWo_(r.satuan) }; })
        .sort(function (a, b) { return a.nama.localeCompare(b.nama); });
      mh.kepemilikan = kepemilikanAktifHartek_();   // v1.0.18: db_Kepemilikan_Material (sama dengan Hartek)
    } catch (eM) { if (!eM || !eM.kode) throw eM; }
    return mh;
  }
  return { jenis: tabel_('MASTER_SHEET_ID', 'db_Jenis_Pekerjaan').rows.filter(function (r) {
    return r.jenis_id && teksWo_(r.modul).toUpperCase() === 'YANDAL' && isAktif_(r.aktif) && !p0Switching_(r.nama) && !p0Gardu_(r.nama);
  }).map(function (r) { return { jenisId: String(r.jenis_id), nama: teksWo_(r.nama) }; }) };
}

/** WO tim sesi: TERKIRIM + DIKERJAKAN + SELESAI 7 hari terakhir, dengan rincian pekerjaan dan pilihan isian. */
function getWoTim_(sesi, data, platform) {
  wajibPetugasWo_(sesi, platform);
  validasi_(data, {});
  var batas = tglJakarta_(new Date(Date.now() - WO_SELESAI_HARI_ * 864e5));
  var rowsTl = tabelTlWo_().rows, rowsG = rowsGandaWo_();
  // v1.0.16: klaim WO ganda tim ini (aktif + keputusan 7 hari terakhir) supaya HP tahu status verifikasinya
  var klaim = {};
  rowsG.forEach(function (g) {
    if (String(g.tim_id) !== String(sesi.timId)) return;
    if (gandaAktifWo_(g) || teksWo_(g.waktu_putusan).slice(0, 10) >= batas) klaim[String(g.temuan_id)] = g;
  });
  var rows = tabelTemuanWo_().rows.filter(function (t) {
    if (String(t.tim_tindak_lanjut_id || '') !== String(sesi.timId)) return !!klaim[String(t.temuan_id)];
    var s = teksWo_(t.status_wo);
    if (s === WO_STATUS_.kirim || s === WO_STATUS_.kerja) return true;
    return s === WO_STATUS_.selesai && teksWo_(t.waktu_selesai).slice(0, 10) >= batas;
  }).sort(function (a, b) {
    var o = { DIKERJAKAN: 0, TERKIRIM: 1, SELESAI: 2 };
    return ((o[teksWo_(a.status_wo)] || 0) - (o[teksWo_(b.status_wo)] || 0)) || (teksWo_(a.waktu_diteruskan) < teksWo_(b.waktu_diteruskan) ? 1 : -1);
  });
  return {
    jenisTim: sesi.jenisTim, laporanUtamaAda: siapRealisasiWo_(sesi), slotWajib: WO_SLOT_WAJIB_[sesi.jenisTim].slice(),
    master: masterPekerjaanWo_(sesi, rows), wo: rows.map(function (t) {
      var o = woKeHp_(t, rowsTl, sesi.timId);
      var g = klaim[String(t.temuan_id)];
      var lain = gandaTemuanWo_(rowsG, t.temuan_id).some(function (x) { return gandaAktifWo_(x) && String(x.tim_id) !== String(sesi.timId); });
      // ganda: status klaim / keputusan tim ini; pemilik = WO milik tim ini; menunggu = Selesai ditahan verifikasi admin
      o.wo.ganda = g || lain ? {
        status: g ? teksWo_(g.status) : '', pemilik: String(t.tim_tindak_lanjut_id || '') === String(sesi.timId),
        menunggu: (g ? gandaAktifWo_(g) : false) || lain, waktuPutusan: g ? teksWo_(g.waktu_putusan) : '', catatan: g ? teksWo_(g.catatan) : ''
      } : null;
      return o;
    })
  };
}

/**
 * v1.0.15: foto WO milik tim sesi untuk layar WO Tim: foto temuan (slot TEMUAN / TIANG) atau foto pekerjaan
 * (slot SEBELUM / PEKERJAAN / SESUDAH + tlId pekerjaan WO itu). Pola sama dengan getFotoWoAdmin_.
 */
function getFotoWoTim_(sesi, data, platform) {
  wajibPetugasWo_(sesi, platform);
  var d = validasi_(data, {
    temuanId: { tipe: 'uuid', wajib: true },
    tlId: { tipe: 'uuid' },
    slot: { tipe: 'pilihan', wajib: true, pilihan: Object.keys(INSJAR_FOTO_).concat(Object.keys(WO_SLOT_)) },
    ukuran: { tipe: 'pilihan', pilihan: ['KECIL', 'PENUH'] }
  });
  var t = aksesWo_(tabelTemuanWo_().rows, d.temuanId, sesi, rowsGandaWo_()).t;
  if (INSJAR_FOTO_[d.slot]) return jawabFotoDriveWo_(teksWo_(t[INSJAR_FOTO_[d.slot] + '_file_id']), d.slot, d.ukuran, { temuanId: String(d.temuanId) });
  if (!d.tlId) throw new SisiError_('FIELD_WAJIB', 'tlId');
  var r = tabelTlWo_().rows.filter(function (x) { return String(x.tl_id) === String(d.tlId); })[0];
  if (!r || String(r.temuan_id) !== String(t.temuan_id)) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'pekerjaan');
  if (String(r.tim_id) !== String(sesi.timId)) throw new SisiError_('BUKAN_MILIK_TIM', 'pekerjaan');
  return jawabFotoDriveWo_(teksWo_(r[WO_SLOT_[d.slot] + '_file_id']), d.slot, d.ukuran, { temuanId: String(d.temuanId), tlId: String(d.tlId) });
}

/**
 * Mulai kerjakan WO: sesudah ini WO tidak bisa dipindah / ditarik admin.
 * v1.0.16: tim lama yang WO-nya sudah dipindah (WO_DIPINDAH) boleh tetap mengunggah dengan paksa = true: tercatat
 * KLAIM di db_wo_ganda, WO tetap milik tim baru sampai admin memutuskan.
 */
function mulaiWo_(sesi, data, platform) {
  wajibPetugasWo_(sesi, platform);
  var d = validasi_(data, {
    temuanId: { tipe: 'uuid', wajib: true }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 }, paksa: { tipe: 'bool' }
  });
  return denganLock_(function () {
    var tt = tabelTemuanWo_();
    var a;
    try { a = aksesWo_(tt.rows, d.temuanId, sesi, rowsGandaWo_()); } catch (e) {
      if (!e || e.kode !== 'WO_DIPINDAH' || !d.paksa) throw e;
      return klaimWo_(sesi, temuanWo_(tt.rows, d.temuanId), platform);
    }
    if (a.klaim) return { temuanId: String(d.temuanId), revision: Number(a.t.revision) || 1, duplikat: true, ganda: true, temuan: woKeHp_(a.t, [], sesi.timId) };
    var t = a.t;
    var s = teksWo_(t.status_wo);
    if (s === WO_STATUS_.kerja) return { temuanId: String(d.temuanId), revision: Number(t.revision) || 1, duplikat: true, temuan: woKeHp_(t, []) };
    if (s === WO_STATUS_.selesai) throw new SisiError_('WO_SUDAH_SELESAI', teksWo_(t.kode_temuan));
    if (Number(t.revision) !== d.revision) throw new SisiError_('KONFLIK_REVISION', d.temuanId);
    var sekarang = sekarangIso_();
    var u = { status_wo: WO_STATUS_.kerja, dimulai_oleh: sesi.nama || sesi.username || sesi.userId, waktu_mulai: sekarang,
              timestamp_update: sekarang, diubah_oleh: sesi.userId };
    var rev = ubahBaris_(tt, 'temuan_id', d.temuanId, u, d.revision);
    auditLog_(sesi, 'WO_MULAI', teksWo_(t.kode_temuan), sesi.timNama || '', platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { temuanId: String(d.temuanId), revision: rev, temuan: woKeHp_(Object.assign({}, t, u, { revision: rev }), []) };
  }, 20000);
}

/** v1.0.16: tim lama tetap mengunggah WO yang sudah dipindah = baris KLAIM db_wo_ganda (WO selesai tim lain ditolak). */
function klaimWo_(sesi, t, platform) {
  if (teksWo_(t.status_wo) === WO_STATUS_.selesai) throw new SisiError_('WO_SUDAH_SELESAI', teksWo_(t.kode_temuan));
  var tG = tabelOpsiWo_(WO_GANDA_SHEET_);
  if (!tG) throw new SisiError_('CONFIG_TIDAK_LENGKAP', WO_GANDA_SHEET_ + ' (jalankan ADMIN_siapkanSheetInsJar)');
  // sudah diputuskan admin (tim ini ditolak / tim lain dipilih) = tidak bisa mengklaim lagi
  var gs = gandaTemuanWo_(tG.rows, t.temuan_id);
  if (gs.some(function (g) {
    return (String(g.tim_id) === String(sesi.timId) && teksWo_(g.status) === WO_GANDA_STATUS_.ditolak) || teksWo_(g.status) === WO_GANDA_STATUS_.dipilih;
  })) throw new SisiError_('WO_GANDA_SUDAH_DIPUTUSKAN', teksWo_(t.kode_temuan));
  var sekarang = sekarangIso_();
  var baris = sisipAuditInsJar_({
    nomor: tG.rows.length + 1, kode_temuan: teksWo_(t.kode_temuan), tim: sesi.timNama || '', jenis_tim: sesi.jenisTim,
    status: WO_GANDA_STATUS_.klaim, waktu_klaim: sekarang, diklaim_oleh: sesi.nama || sesi.username || sesi.userId, waktu_siap: '',
    diputuskan_oleh: '', waktu_putusan: '', catatan: '', ganda_id: uuid_(), temuan_id: String(t.temuan_id), tim_id: sesi.timId
  }, sesi, sekarang);
  tambahBaris_(tG, baris);
  auditLog_(sesi, 'WO_KLAIM_GANDA', teksWo_(t.kode_temuan), (sesi.timNama || '') + ' (WO milik ' + (teksWo_(t.tim_tindak_lanjut) || '-') + ')',
    platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
  return { temuanId: String(t.temuan_id), revision: Number(t.revision) || 1, ganda: true, temuan: woKeHp_(t, [], sesi.timId) };
}

function skemaPekerjaanWo_(jenisTim) {
  var s = {
    temuanId: { tipe: 'uuid', wajib: true }, idBaris: { tipe: 'uuid' },
    // v1.0.16: koordinat pekerjaan wajib (Yandal = GPS HP)
    catatan: { tipe: 'teks', maks: 300, multiBaris: true, maksBaris: 5 }, koordinat: { tipe: 'koordinat', wajib: true }
  };
  if (jenisTim === 'ROW') {
    s.diameter = { tipe: 'angka', wajib: true, bulat: true, min: 0, max: 1000 };
    s.sectionId = { tipe: 'teks', maks: 60 };
    s.nomorTiang = { tipe: 'teks', maks: 40 };
  } else if (jenisTim === 'HARTEK') {
    // v1.0.16: rincian (JSON) = banyak pekerjaan + material; tanpa rincian = satu pekerjaan jenisId + jumlah
    s.jenisId = { tipe: 'teks', maks: 60 };
    s.jumlah = { tipe: 'angka', min: 0, max: 999999 };
    s.rincian = { tipe: 'teks', maks: 8000 };
  } else {
    s.namaPekerjaan = { tipe: 'teks', wajib: true, maks: 100 };
    s.pekerjaanLainnya = { tipe: 'teks', maks: 100 };
  }
  return s;
}

/** Jenis PG Hartek dari temuan: objek Gardu ber-gardu = Gardu, selain itu Jaringan. */
function jenisPgWo_(t) {
  return teksWo_(t.objek_inspeksi).toLowerCase() === 'gardu' && (teksWo_(t.gardu_id) || teksWo_(t.no_gardu)) ? 'Gardu' : 'Jaringan';
}

/**
 * v1.0.16: rincian WO Hartek dari HP (JSON). Nama / satuan dari master. Pekerjaan pertama memakai id baris WO (tl_id).
 * v1.0.17: material per pekerjaan: {pekerjaan: [{id, jenisId, jumlah, material: [{id, materialId, jumlah, kepemilikan}]}]}.
 * HP lama (material di luar pekerjaan, {material: [...]}) tetap diterima: material itu milik pekerjaan pertama.
 * v1.0.18: kepemilikan wajib salah satu baris aktif db_Kepemilikan_Material (kepemilikanAktifHartek_).
 */
function bacaRincianWo_(teks, jenisPg) {
  var o;
  try { o = JSON.parse(teks); } catch (e) { throw new SisiError_('FORMAT_SALAH', 'rincian'); }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new SisiError_('FORMAT_SALAH', 'rincian');
  var pk = Array.isArray(o.pekerjaan) ? o.pekerjaan : [], lepas = Array.isArray(o.material) ? o.material : [];
  if (!pk.length) throw new SisiError_('FIELD_WAJIB', 'pekerjaan');
  var jumlahMt = lepas.length;
  pk.forEach(function (x) { if (x && Array.isArray(x.material)) jumlahMt += x.material.length; });
  if (pk.length > WO_RINCIAN_MAKS_.pekerjaan || jumlahMt > WO_RINCIAN_MAKS_.material) throw new SisiError_('TERLALU_BANYAK', 'rincian');
  var id = {};
  var unik = function (v) { if (id[v]) throw new SisiError_('ID_DIPAKAI', v); id[v] = true; return v; };
  var master = jumlahMt ? tabelMaterialHartek_().rows.filter(function (r) { return r.material_id && isAktif_(r.aktif) && teksWo_(r.nama_material); }) : [];
  var milik = jumlahMt ? kepemilikanAktifHartek_() : [];   // v1.0.18: db_Kepemilikan_Material
  var bacaMt = function (x) {
    var v = validasi_(x, { id: { tipe: 'uuid', wajib: true }, materialId: { tipe: 'teks', wajib: true, maks: 60 },
                           jumlah: { tipe: 'angka', wajib: true, min: 0, max: 999999 }, kepemilikan: { tipe: 'teks', wajib: true, maks: 60 } });
    var m = master.filter(function (r) { return String(r.material_id) === String(v.materialId); })[0];
    if (!m) throw new SisiError_('MATERIAL_TIDAK_VALID', v.materialId);
    // wajib cocok baris aktif db_Kepemilikan_Material (master kosong = ditolak, tidak ada isian bebas)
    var km = milik.filter(function (z) { return z.nama.toLowerCase() === v.kepemilikan.toLowerCase() || z.kepemilikanId === v.kepemilikan; })[0];
    if (!km) throw new SisiError_('KEPEMILIKAN_TIDAK_VALID', v.kepemilikan);
    return { id: unik(v.id), materialId: String(m.material_id), nama: teksWo_(m.nama_material), jumlah: v.jumlah, satuan: teksWo_(m.satuan), kepemilikan: km.nama };
  };
  var hasilPk = pk.map(function (x, i) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw new SisiError_('FORMAT_SALAH', 'pekerjaan');
    var isi = {};
    Object.keys(x).forEach(function (k) { if (k !== 'material') isi[k] = x[k]; });
    var v = validasi_(isi, { id: { tipe: 'uuid', wajib: i > 0 }, jenisId: { tipe: 'teks', wajib: true, maks: 60 }, jumlah: { tipe: 'angka', wajib: true, min: 0, max: 999999 } });
    var j = jenisPekerjaanHartek_(v.jenisId, '', jenisPg);
    return { id: i > 0 ? unik(v.id) : '', jenisId: j.jenisId, nama: j.nama, jumlah: v.jumlah, satuan: j.satuan,
             material: (Array.isArray(x.material) ? x.material : []).map(bacaMt) };
  });
  lepas.forEach(function (m) { hasilPk[0].material.push(bacaMt(m)); });   // HP lama: material milik pekerjaan pertama
  var datar = [];
  hasilPk.forEach(function (p) { datar = datar.concat(p.material); });
  return { pekerjaan: hasilPk, material: datar };
}

/** Catat satu pekerjaan WO (DRAFT). Belum masuk realisasi tim sampai WO Selesai. */
function simpanPekerjaanWo_(sesi, data, platform) {
  wajibPetugasWo_(sesi, platform);
  var d = validasi_(data, skemaPekerjaanWo_(sesi.jenisTim));
  if (sesi.jenisTim === 'HARTEK' && !d.rincian && (!d.jenisId || d.jumlah === undefined)) throw new SisiError_('FIELD_WAJIB', d.jenisId ? 'jumlah' : 'jenisId');
  return denganLock_(function () {
    var tTl = tabelTlWo_();
    var ada = d.idBaris ? tTl.rows.filter(function (x) { return String(x.tl_id) === String(d.idBaris); })[0] : null;
    if (ada) {
      if (String(ada.tim_id) !== String(sesi.timId) || String(ada.temuan_id) !== String(d.temuanId)) throw new SisiError_('ID_DIPAKAI', d.idBaris);
      return { tlId: String(ada.tl_id), kodeTl: teksWo_(ada.kode_tl), duplikat: true, pekerjaan: tlKeHpWo_(ada) };
    }
    var a = aksesWo_(tabelTemuanWo_().rows, d.temuanId, sesi, rowsGandaWo_());
    wajibBolehKerjaWo_(a);
    var t = a.t;
    var isi = isiPekerjaanWo_(sesi, d, t);
    var awalan = teksWo_(t.kode_temuan) + '-TL.';
    var kode = awalan + pad3_(urutBerikutHartek_(tTl.rows, 'kode_tl', awalan));
    var id = d.idBaris || uuid_(), sekarang = sekarangIso_();
    var k = d.koordinat;
    var baris = sisipAuditInsJar_(Object.assign(isi, {
      nomor: tTl.rows.length + 1, kode_temuan: teksWo_(t.kode_temuan), kode_tl: kode, tanggal: tanggalHariIniHartek_(),
      tim: sesi.timNama || '', jenis_tim: sesi.jenisTim, objek_inspeksi: teksWo_(t.objek_inspeksi), penyulang: teksWo_(t.penyulang),
      no_gardu: teksWo_(t.no_gardu), koordinat: k ? k.teks : '', lat: k ? k.lat : '', lng: k ? k.lng : '', catatan: d.catatan || '',
      foto_meta: '{}', status: WO_TL_STATUS_.draft, tl_id: id, temuan_id: String(t.temuan_id), tim_id: sesi.timId
    }), sesi, sekarang);
    tambahBaris_(tTl, baris);
    auditLog_(sesi, 'WO_PEKERJAAN_SIMPAN', kode, isi.pekerjaan, platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { tlId: id, kodeTl: kode, revision: 1, pekerjaan: tlKeHpWo_(baris) };
  }, 20000);
}

/**
 * Kolom isian pekerjaan WO dari [d] (skemaPekerjaanWo_) untuk temuan [t]: ROW (diameter -> jenis, section / tiang
 * terkunci), HARTEK (rincian pekerjaan + material), YANDAL (jenis P0). Dipakai simpan + ubah (v1.0.26).
 */
function isiPekerjaanWo_(sesi, d, t) {
    var isi = { pekerjaan: '', pekerjaan_lainnya: '', jumlah: 1, satuan: '', diameter: '', nomor_tiang: '', jenis_id: '',
                section: teksWo_(t.section), section_id: teksWo_(t.section_id), rincian: '' };
    if (sesi.jenisTim === 'ROW') {
      var m = masterRow_();
      var jenis = klasifikasiJenis_(d.diameter, m.jenis);
      var secId = d.sectionId || teksWo_(t.section_id);
      if (!secId) throw new SisiError_('FIELD_WAJIB', 'sectionId');
      var sec = m.jaringan[secId];
      if (!sec || !sec.aktif || sec.penyulang.toLowerCase() !== teksWo_(t.penyulang).toLowerCase()) throw new SisiError_('SECTION_TIDAK_COCOK', secId);
      // v1.0.17: section + nomor tiang yang sudah diinput petugas inspeksi terkunci (integritas audit)
      var secTemuan = teksWo_(t.section_id);
      if (secTemuan && m.jaringan[secTemuan] && m.jaringan[secTemuan].aktif && secId !== secTemuan) throw new SisiError_('SECTION_TERKUNCI', secId);
      var tiangTemuan = teksWo_(t.nomor_tiang).toUpperCase();
      if (tiangTemuan && d.nomorTiang && d.nomorTiang.toUpperCase() !== tiangTemuan) throw new SisiError_('TIANG_TERKUNCI', d.nomorTiang);
      if (tiangTemuan) d.nomorTiang = tiangTemuan;
      isi = Object.assign(isi, { pekerjaan: jenis.nama, satuan: jenis.satuan, diameter: d.diameter, jenis_id: jenis.jenis_id,
                                 nomor_tiang: d.nomorTiang ? d.nomorTiang.toUpperCase() : '', section: sec.section, section_id: secId });
    } else if (sesi.jenisTim === 'HARTEK') {
      var rc = d.rincian ? bacaRincianWo_(d.rincian, jenisPgWo_(t)) : null;
      var jh = rc ? rc.pekerjaan[0] : jenisPekerjaanHartek_(d.jenisId, '', jenisPgWo_(t));
      isi = Object.assign(isi, { pekerjaan: jh.nama, satuan: jh.satuan, jumlah: rc ? jh.jumlah : d.jumlah, jenis_id: jh.jenisId,
                                 rincian: rc ? JSON.stringify({ pekerjaan: rc.pekerjaan }) : '' });   // v1.0.17: material di dalam pekerjaan
    } else {
      var jy = jenisP0_(d.namaPekerjaan, d.pekerjaanLainnya || '');
      if (p0Switching_(jy.nama) || p0Gardu_(jy.nama)) throw new SisiError_('PEKERJAAN_TIDAK_DIDUKUNG', jy.nama);
      isi = Object.assign(isi, { pekerjaan: jy.nama, pekerjaan_lainnya: jy.nama === YAN_PEKERJAAN_LAIN_ ? (d.pekerjaanLainnya || '') : '', jenis_id: jy.jenisId });
    }
    return isi;
}

/**
 * v1.0.26 (permintaan kvlar 23 Okt 2026): ubah pekerjaan WO (ROW / Hartek / Yandal) yang masih DRAFT, sesudah foto
 * Sebelum dan SEBELUM foto Sesudah diambil. Isian sama dengan simpanPekerjaanWo + tlId + revision. Foto tetap.
 */
function ubahPekerjaanWo_(sesi, data, platform) {
  wajibPetugasWo_(sesi, platform);
  var skema = skemaPekerjaanWo_(sesi.jenisTim);
  delete skema.idBaris;
  skema.tlId = { tipe: 'uuid', wajib: true };
  skema.revision = { tipe: 'angka', wajib: true, bulat: true, min: 0 };
  var d = validasi_(data, skema);
  if (sesi.jenisTim === 'HARTEK' && !d.rincian && (!d.jenisId || d.jumlah === undefined)) throw new SisiError_('FIELD_WAJIB', d.jenisId ? 'jumlah' : 'jenisId');
  return denganLock_(function () {
    var tTl = tabelTlWo_();
    var r = tTl.rows.filter(function (x) { return String(x.tl_id) === String(d.tlId); })[0];
    if (!r) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'pekerjaan');
    if (String(r.tim_id) !== String(sesi.timId) || String(r.temuan_id) !== String(d.temuanId)) throw new SisiError_('BUKAN_MILIK_TIM', 'pekerjaan');
    if (teksWo_(r.status) !== WO_TL_STATUS_.draft) throw new SisiError_('WO_SUDAH_SELESAI', teksWo_(r.kode_tl));
    if (!teksWo_(r[WO_SLOT_.SEBELUM + '_link'])) throw new SisiError_('FOTO_SEBELUM_BELUM_ADA', teksWo_(r.kode_tl));
    if (teksWo_(r[WO_SLOT_.SESUDAH + '_link'])) throw new SisiError_('FOTO_SESUDAH_SUDAH_ADA', teksWo_(r.kode_tl));
    var a = aksesWo_(tabelTemuanWo_().rows, d.temuanId, sesi, rowsGandaWo_());
    wajibBolehKerjaWo_(a);
    var k = d.koordinat;
    var isi = Object.assign(isiPekerjaanWo_(sesi, d, a.t), {
      koordinat: k ? k.teks : '', lat: k ? k.lat : '', lng: k ? k.lng : '', catatan: d.catatan || '',
      timestamp_update: sekarangIso_(), diubah_oleh: sesi.userId
    });
    var rev = ubahBaris_(tTl, 'tl_id', d.tlId, isi, d.revision);
    auditLog_(sesi, 'WO_PEKERJAAN_UBAH', teksWo_(r.kode_tl), isi.pekerjaan, platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { tlId: String(d.tlId), kodeTl: teksWo_(r.kode_tl), revision: rev, pekerjaan: tlKeHpWo_(Object.assign({}, r, isi, { revision: rev })) };
  }, 20000);
}

/** Hapus pekerjaan DRAFT (WO masih dikerjakan). Baris jadi BATAL. */
function hapusPekerjaanWo_(sesi, data, platform) {
  wajibPetugasWo_(sesi, platform);
  var d = validasi_(data, { tlId: { tipe: 'uuid', wajib: true }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 } });
  return denganLock_(function () {
    var tTl = tabelTlWo_();
    var r = tTl.rows.filter(function (x) { return String(x.tl_id) === String(d.tlId); })[0];
    if (!r) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'pekerjaan');
    if (String(r.tim_id) !== String(sesi.timId)) throw new SisiError_('BUKAN_MILIK_TIM', 'pekerjaan');
    if (teksWo_(r.status) === WO_TL_STATUS_.batal) return { tlId: String(d.tlId), duplikat: true };
    if (teksWo_(r.status) !== WO_TL_STATUS_.draft) throw new SisiError_('WO_SUDAH_SELESAI', teksWo_(r.kode_tl));
    wajibBolehKerjaWo_(aksesWo_(tabelTemuanWo_().rows, r.temuan_id, sesi, rowsGandaWo_()));
    var rev = ubahBaris_(tTl, 'tl_id', d.tlId, { status: WO_TL_STATUS_.batal, timestamp_update: sekarangIso_(), diubah_oleh: sesi.userId }, d.revision);
    auditLog_(sesi, 'WO_PEKERJAAN_HAPUS', teksWo_(r.kode_tl), teksWo_(r.pekerjaan), platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { tlId: String(d.tlId), revision: rev };
  }, 20000);
}

/** Foto pekerjaan WO (slot SEBELUM / PEKERJAAN / SESUDAH). Folder INSJAR_FOTO_FOLDER_ID / Tindak Lanjut WO / <tgl> / <kode temuan>. */
function uploadFotoWo_(sesi, data, platform) {
  wajibPetugasWo_(sesi, platform);
  var s = isiFotoLapangan_();
  s.tlId = { tipe: 'uuid', wajib: true };
  s.slot = { tipe: 'pilihan', wajib: true, pilihan: Object.keys(WO_SLOT_) };
  s.sumber = { tipe: 'pilihan', pilihan: ['KAMERA', 'GALERI'] };
  s.waktu = { tipe: 'waktu' };
  s.lat = { tipe: 'angka', min: -90, max: 90 };
  s.lng = { tipe: 'angka', min: -180, max: 180 };
  s.akurasiM = { tipe: 'angka', min: 0, max: 100000 };
  var d = validasi_(data, s);
  if ((d.lat === undefined) !== (d.lng === undefined)) throw new SisiError_('FIELD_WAJIB', d.lat === undefined ? 'lat' : 'lng');
  // v1.0.16: WO Yandal = foto kamera SiSi saja (petugas di lapangan), galeri hanya ROW / Hartek
  if (sesi.jenisTim === 'YANDAL' && d.sumber === 'GALERI') throw new SisiError_('FOTO_HARUS_KAMERA', d.slot);
  var folderId = folderFotoInsJar_();
  var bytes = bytesFotoLapangan_(d);
  return denganLock_(function () {
    var tTl = tabelTlWo_();
    var r = tTl.rows.filter(function (x) { return String(x.tl_id) === String(d.tlId); })[0];
    if (!r) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'pekerjaan');
    if (String(r.tim_id) !== String(sesi.timId)) throw new SisiError_('BUKAN_MILIK_TIM', 'pekerjaan');
    var kol = WO_SLOT_[d.slot], meta = metaFotoWo_(r);
    if (teksWo_(r[kol + '_link'])) {
      if (meta[d.slot] && meta[d.slot].sha256 === d.sha256) return { tlId: String(d.tlId), slot: d.slot, link: teksWo_(r[kol + '_link']), status: 'DUPLIKAT', revision: Number(r.revision) || 1 };
      throw new SisiError_('FOTO_SUDAH_ADA', d.slot);
    }
    if (teksWo_(r.status) !== WO_TL_STATUS_.draft) throw new SisiError_('WO_SUDAH_SELESAI', teksWo_(r.kode_tl));
    wajibBolehKerjaWo_(aksesWo_(tabelTemuanWo_().rows, r.temuan_id, sesi, rowsGandaWo_()));
    var kode = teksWo_(r.kode_tl);
    var f = simpanFotoLapangan_(folderId, ['Tindak Lanjut WO', tglSel_(r.tanggal), teksWo_(r.kode_temuan) || '-'],
      d.tlId + '-' + d.slot, namaFotoRow_(kode, d.slot, 1), bytes);
    meta[d.slot] = { waktu: d.waktu || sekarangIso_(), sumber: d.sumber || 'KAMERA', sha256: d.sha256, ukuran: bytes.length,
                     lat: d.lat === undefined ? null : d.lat, lng: d.lng === undefined ? null : d.lng,
                     akurasi: d.akurasiM === undefined ? null : d.akurasiM, nama: namaFotoRow_(kode, d.slot, 1) };
    var u = { foto_meta: JSON.stringify(meta), timestamp_update: sekarangIso_(), diubah_oleh: sesi.userId };
    u[kol + '_file_id'] = f.fileId;
    u[kol + '_link'] = f.link;
    var rev = ubahBaris_(tTl, 'tl_id', d.tlId, u);
    auditLog_(sesi, 'WO_FOTO_UPLOAD', kode, d.slot, platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { tlId: String(d.tlId), slot: d.slot, link: f.link, status: 'OK', revision: rev };
  }, 30000);
}

/** Baris modul (pekerjaan Hartek / eksekusi ROW / P0) berasal dari WO Selesai (id = tl_id TERCATAT). Tanpa SiSi_Temuan = false. */
function pekerjaanDariWo_(id) {
  if (!cfg_().TEMUAN_SHEET_ID) return false;
  return tabelTlWo_().rows.some(function (x) {
    if (teksWo_(x.status) !== WO_TL_STATUS_.tercatat) return false;
    if (String(x.tl_id) === String(id)) return true;
    // v1.0.16: pekerjaan ke-2 dst. rincian WO Hartek
    return teksWo_(x.rincian) !== '' && rincianWo_(x).pekerjaan.some(function (p) { return String(p.id) === String(id); });
  });
}

/* ===== Selesai: masuk realisasi tim ===== */

/**
 * v1.0.28 (permintaan kvlar 23 Okt 2026): foto WO tetap di folder temuan (INSJAR_FOTO_FOLDER_ID / Tindak Lanjut WO)
 * dan saat masuk realisasi tim disalin ke folder foto tim per pekerjaan, jadi tersimpan di 2 folder. Sheet tim
 * menunjuk salinan. Akar tim kosong / salin gagal = tetap file folder temuan (Selesai tidak gagal karena salinan).
 * Kirim ulang tidak membuat salinan kembar (penanda deskripsi file). Hasil { fileId, link, nama }.
 */
function salinFotoWoKeTim_(akarId, bagian, tl, slot, nama) {
  var kol = WO_SLOT_[slot], asli = { fileId: teksWo_(tl[kol + '_file_id']), link: teksWo_(tl[kol + '_link']), nama: '' };
  if (!akarId || !asli.fileId) return asli;
  var penanda = 'WO-' + teksWo_(tl.tl_id) + '-' + slot;
  try {
    var folder = folderFoto_(akarId, bagian);
    var file = cariFileFoto_(folder, penanda), baru = !file;
    if (baru) {
      file = DriveApp.getFileById(asli.fileId).makeCopy(nama, folder);
      try { file.setDescription(PENANDA_FOTO_ + penanda); } catch (eD) { /* tanpa penanda */ }
    }
    pastikanFotoPrivat_(file, baru);
    return { fileId: String(file.getId()), link: 'https://drive.google.com/file/d/' + file.getId() + '/view', nama: String(file.getName()) };
  } catch (e) {
    console.log('Salin foto WO ke folder tim gagal (' + penanda + '): ' + (e && e.message ? e.message : e));
    return asli;
  }
}

/** ROW: row_Eksekusi (+ row_Realisasi penyulang bila belum ada) + row_Foto di Laporan Utama ROW tim hari ini. */
function catatRealisasiRowWo_(sesi, t, tls) {
  var c = cfg_();
  if (!c.ROW_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'ROW_SHEET_ID');
  var waktu = waktuRow_(), master = masterRow_();
  var T = bacaJendelaRow_(waktu), F = jendelaRow_('foto', waktu.cutoff);
  var ctx = konteksSync_(T, master, sesi, c, waktu);
  var hdr = Object.keys(ctx.byId.header).map(function (id) { return ctx.byId.header[id]; }).filter(function (h) {
    return String(h.tim_id) === String(sesi.timId) && h.status === 'AKTIF' && tanggalDariKode_(h['Kode Header']) === waktu.hariIni;
  })[0];
  if (!hdr) throw new SisiError_('WO_BUTUH_LAPORAN_UTAMA', 'ROW');
  var cari = teksWo_(t.penyulang).toLowerCase(), resmi = '';
  Object.keys(master.jaringan).forEach(function (id) { var s = master.jaringan[id]; if (s.aktif && s.penyulang.toLowerCase() === cari) resmi = s.penyulang; });
  if (!resmi) throw new SisiError_('PENYULANG_TIDAK_ADA', teksWo_(t.penyulang));
  var anakHdr = Object.keys(ctx.byId.realisasi).map(function (id) { return ctx.byId.realisasi[id]; })
    .filter(function (r) { return String(r.header_id) === String(hdr.header_id); });
  var real = anakHdr.filter(function (r) { return r.status === 'AKTIF' && String(r.Penyulang).toLowerCase() === cari; })[0];
  var tanggal = waktu.hariIni;
  if (!real) {
    var urutR = anakHdr.reduce(function (mx, r) { var p = parseKodeAnak_(r['Kode Pekerjaan'], 'PNY'); return Math.max(mx, p ? p.urut : 0); }, 0);
    barisBaru_(ctx, 'realisasi', {
      'Kode Header': hdr['Kode Header'], 'Kode Pekerjaan': kodeAnak_(hdr['Kode Header'], 'PNY', urutR + 1), 'Hari': hariDari_(tanggal),
      'Tanggal': tanggal, 'Tim': hdr['Sub-Tim'], 'Penyulang': resmi, 'Section': '', 'Rabas': 0, 'Sedang': 0, 'Besar': 0,
      realisasi_id: uuid_(), header_id: hdr.header_id, waktu_perangkat: ''
    });
    real = ctx.baru.realisasi[ctx.baru.realisasi.length - 1];
  }
  var semuaEks = Object.keys(ctx.byId.eksekusi).map(function (id) { return ctx.byId.eksekusi[id]; });
  var urutE = semuaEks.filter(function (e) { return String(e.realisasi_id) === String(real.realisasi_id); })
    .reduce(function (mx, e) { var p = parseKodeAnak_(e['Kode Eksekusi'], 'EKS'); return Math.max(mx, p ? p.urut : 0); }, 0);
  var fotoBaru = [], hasil = [];
  tls.forEach(function (tl) {
    var ada = ctx.byId.eksekusi[String(tl.tl_id)];
    if (ada) { hasil.push({ tl: tl, kode: String(ada['Kode Eksekusi']), id: String(tl.tl_id) }); return; }
    var sec = master.jaringan[String(tl.section_id)];
    if (!sec || !sec.aktif || sec.penyulang.toLowerCase() !== cari) throw new SisiError_('SECTION_TIDAK_COCOK', teksWo_(tl.kode_tl));
    var jenis = klasifikasiJenis_(Number(tl.diameter), master.jenis);
    var meta = metaFotoWo_(tl), sb = meta.SEBELUM || {};
    var kp = tl.lat !== '' && tl.lat !== undefined ? { teks: teksWo_(tl.koordinat), lat: tl.lat, lng: tl.lng }
      : (sb.lat !== null && sb.lat !== undefined ? { teks: koordinatTeks_(sb.lat, sb.lng), lat: sb.lat, lng: sb.lng }
        : (t.lat !== '' && t.lat !== undefined ? { teks: teksWo_(t.koordinat), lat: t.lat, lng: t.lng } : { teks: '', lat: '', lng: '' }));
    urutE++;
    var kode = kodeAnak_(real['Kode Pekerjaan'], 'EKS', urutE);
    var isi = {
      'Kode Header': real['Kode Header'], 'Kode Pekerjaan': real['Kode Pekerjaan'], 'Kode Eksekusi': kode,
      'ULP': c.ULP_NAMA, 'Hari': hariDari_(tanggal), 'Tanggal': tanggal, 'Tim': real.Tim, 'Penyulang': real.Penyulang,
      'Section': sec.section, 'Nomor Tiang': teksWo_(tl.nomor_tiang) || teksWo_(t.nomor_tiang),
      'Koordinat Tiang': '', 'Lat Tiang': '', 'Long Tiang': '',
      'Koordinat Pekerjaan': kp.teks, 'Lat Pekerjaan': kp.lat, 'Long Pekerjaan': kp.lng,
      'Diameter': Number(tl.diameter), 'Jenis Pekerjaan': jenis.nama,
      eksekusi_id: String(tl.tl_id), realisasi_id: real.realisasi_id, section_id: String(tl.section_id), jenis_id: jenis.jenis_id,
      foto_lengkap: true, sumber: 'TEMUAN', temuan_id: String(t.temuan_id), waktu_perangkat: ''
    };
    Object.keys(SLOT_FOTO_).forEach(function (slot) {
      var m = meta[slot] || {};
      var sal = salinFotoWoKeTim_(c.ROW_FOTO_FOLDER_ID, pathFotoEksekusi_(isi), tl, slot, namaFotoRow_(kode, slot, 1));   // v1.0.28
      isi[SLOT_FOTO_[slot]] = sal.nama || m.nama || namaFotoRow_(teksWo_(tl.kode_tl), slot, 1);
      isi[SLOT_FOTO_[slot] + ' URL'] = sal.link;
      fotoBaru.push({
        foto_id: uuid_(), eksekusi_id: String(tl.tl_id), slot: slot, drive_file_id: sal.fileId,
        sha256: m.sha256 || '', ukuran_byte: m.ukuran || '', mime: 'image/jpeg', sumber_foto: m.sumber || 'KAMERA',
        diambil_pada: m.waktu || '', lat: m.lat === null || m.lat === undefined ? '' : m.lat, lng: m.lng === null || m.lng === undefined ? '' : m.lng,
        akurasi_m: m.akurasi === null || m.akurasi === undefined ? '' : m.akurasi,
        Timestamp: waktu.sekarang, 'Timestamp Update': waktu.sekarang, status: 'AKTIF', revision: 1,
        dibuat_oleh: sesi.userId, waktu_perangkat: '', diubah_oleh: sesi.userId
      });
    });
    ctx.kotorRealisasi[String(real.realisasi_id)] = true;
    barisBaru_(ctx, 'eksekusi', isi);
    hasil.push({ tl: tl, kode: kode, id: String(tl.tl_id) });
  });
  hitungUlangRealisasi_(ctx);
  hitungUlangWa_(ctx);
  tulisSync_(ctx);
  if (fotoBaru.length) F.sheet.getRange(F.akhir + 1, 1, fotoBaru.length, F.header.length).setValues(fotoBaru.map(function (o) { return barisDariObjek_(F.header, o); }));
  return hasil;
}

/** HARTEK: db_Hartek_Pekerjaan (+ PenyulangGardu bila belum ada) di Laporan Utama Hartek tim hari ini. */
function catatRealisasiHartekWo_(sesi, t, tls, d) {
  if (!cfg_().HARTEK_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'HARTEK_SHEET_ID');
  var hdr = headerAktifHariIniHartek_(tabelHartek_(HARTEK_SHEET_.HEADER).rows, sesi.timId);
  if (!hdr) throw new SisiError_('WO_BUTUH_LAPORAN_UTAMA', 'HARTEK');
  var tPg = tabelHartek_(HARTEK_SHEET_.PG), sekarang = sekarangIso_();
  var jenisPg = jenisPgWo_(t), tag = tagObjekHartek_(jenisPg);
  var pgHdr = tPg.rows.filter(function (p) { return String(p.header_id) === String(hdr.header_id); });
  var pg;
  if (jenisPg === 'Gardu') {
    var gid = teksWo_(t.gardu_id), ng = teksWo_(t.no_gardu).toUpperCase();
    var g = tabel_('GARDU_SHEET_ID', 'db_Gardu').rows.filter(function (r) {
      return gid ? String(r.gardu_id) === gid : teksWo_(r['No Gardu']).toUpperCase() === ng;
    })[0];
    if (!g) throw new SisiError_('GARDU_TIDAK_ADA', ng || gid);
    pg = pgHdr.filter(function (p) { return String(p.gardu_id) === String(g.gardu_id) && teksWo_(p.jenis_pekerjaan) === 'Gardu'; })[0];
    if (!pg) {
      var awG = hdr.kode_header + '-' + tag + '.';
      pg = sisipAuditHartek_({
        nomor: tPg.rows.length + 1, pg_id: uuid_(), kode_pg: awG + pad3_(urutBerikutHartek_(tPg.rows, 'kode_pg', awG)), header_id: hdr.header_id,
        kode_header: hdr.kode_header, tim_id: sesi.timId, tanggal: tglHartek_(hdr), hari: hdr.hari, ulp: hdr.ulp, jenis_pekerjaan: 'Gardu',
        penyulang: teksWo_(g.Penyulang), section: teksWo_(g.Section), gardu_id: String(g.gardu_id || ''), no_gardu: teksWo_(g['No Gardu']).toUpperCase(),
        daerah: teksWo_(g.Alamat), jumlah_gawang: '', koordinat: koordinatGarduHartek_(g)
      }, sesi, sekarang, true);
      tambahBaris_(tPg, pg);
    }
  } else {
    var mp = jaringanAktifHartek_().filter(function (r) {
      return teksWo_(r.penyulang).toLowerCase() === teksWo_(t.penyulang).toLowerCase() && teksWo_(r.section) === teksWo_(t.section);
    })[0];
    if (!mp) throw new SisiError_('SECTION_TIDAK_VALID', teksWo_(t.penyulang) + ' / ' + teksWo_(t.section));
    var pen = teksWo_(mp.penyulang), sec = teksWo_(mp.section);
    pg = pgHdr.filter(function (p) { return teksWo_(p.jenis_pekerjaan) === 'Jaringan' && teksWo_(p.penyulang) === pen && teksWo_(p.section) === sec; })[0];
    if (!pg) {
      if (!d.daerah) throw new SisiError_('FIELD_WAJIB', 'daerah');
      if (d.jumlahGawang === undefined) throw new SisiError_('FIELD_WAJIB', 'jumlahGawang');
      var awJ = hdr.kode_header + '-' + tag + '.';
      pg = sisipAuditHartek_({
        nomor: tPg.rows.length + 1, pg_id: uuid_(), kode_pg: awJ + pad3_(urutBerikutHartek_(tPg.rows, 'kode_pg', awJ)), header_id: hdr.header_id,
        kode_header: hdr.kode_header, tim_id: sesi.timId, tanggal: tglHartek_(hdr), hari: hdr.hari, ulp: hdr.ulp, jenis_pekerjaan: 'Jaringan',
        penyulang: pen, section: sec, gardu_id: '', no_gardu: '', daerah: d.daerah, jumlah_gawang: d.jumlahGawang, koordinat: teksWo_(t.koordinat)
      }, sesi, sekarang, true);
      tambahBaris_(tPg, pg);
    }
  }
  var tPk = tabelHartek_(HARTEK_SHEET_.PEKERJAAN), tMt = tabelHartek_(HARTEK_SHEET_.MATERIAL);
  var awP = pg.kode_pg + '-PKJ.', urut = urutBerikutHartek_(tPk.rows, 'kode_pekerjaan', awP) - 1, baru = [], baruMt = [], hasil = [];
  // v1.0.17: material satu pekerjaan -> db_Hartek_Material dengan pekerjaan_id / kode_pekerjaan PEKERJAAN ITU (dulu
  // semua material menempel ke pekerjaan pertama). Kirim ulang = baris yang sudah ada dilewati.
  var tulisMaterial = function (induk, daftar) {
    var awM = induk.kode_pekerjaan + '-MAT.', urutM = urutBerikutHartek_(tMt.rows.concat(baruMt), 'kode_material', awM) - 1;
    (daftar || []).forEach(function (m) {
      if (tMt.rows.concat(baruMt).some(function (x) { return String(x.material_id) === String(m.id); })) return;
      urutM++;
      baruMt.push(sisipAuditHartek_({
        nomor: tMt.rows.length + baruMt.length + 1, material_id: String(m.id), kode_material: awM + pad3_(urutM),
        pekerjaan_id: induk.pekerjaan_id, kode_pekerjaan: induk.kode_pekerjaan, pg_id: induk.pg_id, header_id: induk.header_id,
        kode_header: induk.kode_header, tim_id: sesi.timId, tanggal: tglHartek_(induk), material: teksWo_(m.nama),
        master_material_id: teksWo_(m.materialId), jumlah: Number(m.jumlah) || 0, satuan: teksWo_(m.satuan), kepemilikan: teksWo_(m.kepemilikan)
      }, sesi, sekarang, true));
    });
  };
  tls.forEach(function (tl) {
    // v1.0.16: satu isian WO = banyak pekerjaan (rincian)
    var rc = rincianWo_(tl), kodeTl = [];
    rc.pekerjaan.forEach(function (p) {
      var ada = tPk.rows.concat(baru).filter(function (x) { return String(x.pekerjaan_id) === String(p.id); })[0];
      if (ada) { kodeTl.push(String(ada.kode_pekerjaan)); tulisMaterial(ada, p.material); return; }
      var jenis = jenisPekerjaanHartek_(teksWo_(p.jenisId), teksWo_(p.nama), jenisPg);
      urut++;
      var kode = awP + pad3_(urut);
      var b = sisipAuditHartek_({
        nomor: tPk.rows.length + baru.length + 1, pekerjaan_id: String(p.id), kode_pekerjaan: kode, pg_id: pg.pg_id, kode_pg: pg.kode_pg,
        header_id: pg.header_id, kode_header: pg.kode_header, tim_id: sesi.timId, tanggal: tglHartek_(pg), hari: pg.hari, ulp: pg.ulp,
        jenis_pekerjaan: pg.jenis_pekerjaan, penyulang: pg.penyulang, section: pg.section, no_gardu: pg.no_gardu,
        pekerjaan: jenis.nama, jenis_id: jenis.jenisId, jumlah_pekerjaan: Number(p.jumlah) || 0,
        satuan_pekerjaan: jenis.satuan || teksWo_(p.satuan), kolom_gaspol: jenis.kolomGaspol
      }, sesi, sekarang, true);
      baru.push(b);
      kodeTl.push(kode);
      tulisMaterial(b, p.material);
    });
    hasil.push({ tl: tl, kode: kodeTl.join(', '), id: String(tl.tl_id) });
    // v1.0.28: foto WO juga disalin ke folder foto Hartek pekerjaan itu (pekerjaan Hartek tanpa kolom foto)
    if (kodeTl.length) {
      Object.keys(WO_SLOT_).forEach(function (slot) {
        salinFotoWoKeTim_(cfg_().HARTEK_FOTO_FOLDER_ID, ['Hartek', tglHartek_(pg), String(pg.kode_header || '-'), namaFolderFoto_(kodeTl[0])],
          tl, slot, namaFotoRow_(kodeTl[0], slot, 1));
      });
    }
  });
  if (baru.length) tambahBanyak_(tPk, baru);
  if (baruMt.length) tambahBanyak_(tMt, baruMt);
  return hasil;
}

/** YANDAL: satu P0 SELESAI (Menunggu verifikasi) per pekerjaan di shift aktif tim. */
function catatRealisasiYandalWo_(sesi, t, tls) {
  var tb = bacaSheetYandal_(['yan_Shift', 'yan_P0']);
  var sh;
  try { sh = shiftSesiP0_(tb.yan_Shift.rows, sesi, null); } catch (e) {
    if (e && e.kode === 'BUKAN_SHIFT_INI') throw new SisiError_('WO_BUTUH_LAPORAN_UTAMA', 'YANDAL');
    throw e;
  }
  var s = sh.r, sekarangMs = sekarangMsYandal_(), iso = new Date(sekarangMs).toISOString();
  var p0Shift = tb.yan_P0.rows.filter(function (r) { return String(r.shift_id) === String(s.shift_id); });
  var lokasi;
  try { lokasi = lokasiP0_(teksWo_(t.penyulang), teksWo_(t.section_id)); } catch (eL) {
    if (!eL || !eL.kode) throw eL;
    lokasi = { penyulang: '', section: '', sectionId: '' };
  }
  var baru = [], hasil = [], noAkhir = tb.yan_P0.rows.length ? Math.max.apply(null, tb.yan_P0.rows.map(function (x) { return x._baris; })) : 1;
  tls.forEach(function (tl) {
    var ada = tb.yan_P0.rows.filter(function (r) { return String(r.p0_id) === String(tl.tl_id); })[0];
    if (ada) { hasil.push({ tl: tl, kode: teksP0_(ada['Kode P0']), id: String(tl.tl_id) }); return; }
    var jenis = jenisP0_(teksWo_(tl.pekerjaan), teksWo_(tl.pekerjaan_lainnya));
    var mf = metaFotoWo_(tl), msOf = function (slot) { var m = mf[slot]; var v = m ? Date.parse(m.waktu) : NaN; return isFinite(v) ? v : null; };
    var mSeb = msOf('SEBELUM'), mPek = msOf('PEKERJAAN'), mSes = msOf('SESUDAH');
    var dibuatMs = mSeb !== null ? mSeb : sekarangMs;
    var meta = { DIBUAT: { waktu: new Date(dibuatMs).toISOString(), waktuHp: new Date(dibuatMs).toISOString(), sumberWaktu: 'HP' }, WO: { temuanId: String(t.temuan_id), tlId: String(tl.tl_id) } };
    var r = {
      No: ++noAkhir, 'Kode Header': s['Kode Header'], 'Kode Shift': s['Kode Shift'],
      'Kode P0': kodeP0Berikut_(p0Shift.concat(baru), teksP0_(s['Kode Shift'])),
      ULP: s.ULP, Hari: s.Hari, Tanggal: tglSel_(s.Tanggal), Tim: s.Tim, Shift: s.Shift,
      Petugas: [teksP0_(s['Petugas 1']), teksP0_(s['Petugas 2'])].filter(Boolean).join(', '),
      'Nama Pekerjaan': jenis.nama, 'Pekerjaan Lainnya': jenis.nama === YAN_PEKERJAAN_LAIN_ ? teksWo_(tl.pekerjaan_lainnya) : '',
      Penyulang: lokasi.penyulang, Section: lokasi.section, Daerah: '',
      Catatan: ('WO ' + teksWo_(t.kode_temuan) + ' ' + teksWo_(t.jenis_temuan) + (teksWo_(tl.catatan) ? '. ' + teksWo_(tl.catatan) : '')).slice(0, 500),
      'Waktu Dibuat': waktuWib_(dibuatMs, true), 'Sumber Waktu': 'HP', 'Selisih Jam HP (menit)': 0, 'Waktu Diterima': waktuWib_(sekarangMs, true),
      'Status P0': 'SELESAI', 'Status Approval': 'Menunggu', 'Alasan Rejected': '', 'Approved Oleh': '', 'Waktu Approve': '',
      Bobot: jenis.bobot, Pengali: pengaliP0_(jenis.nama, dibuatMs), Point: '',
      'Input Oleh': sesi.nama || sesi.username, Timestamp: iso, 'Timestamp Update': iso,
      p0_id: String(tl.tl_id), shift_id: s.shift_id, tim_id: sesi.timId, jenis_id: jenis.jenisId, section_id: lokasi.sectionId,
      petugas_id_1: s.petugas_id_1 || '', petugas_id_2: s.petugas_id_2 || '', install_id: '',
      status: 'AKTIF', revision: 1, dibuat_oleh: sesi.userId, diubah_oleh: sesi.userId
    };
    Object.keys(YAN_KOLOM_FOTO_P0_).forEach(function (slot) {
      var k = YAN_KOLOM_FOTO_P0_[slot], m = mf[slot] || {}, ms = msOf(slot);
      var sal = salinFotoWoKeTim_(cfg_().YANDAL_FOTO_FOLDER_ID, pathFotoP0_(r), tl, slot, namaFotoRow_(teksP0_(r['Kode P0']), slot, 1));   // v1.0.28
      r[k.foto] = sal.nama || m.nama || namaFotoRow_(teksWo_(tl.kode_tl), slot, 1);
      r[k.link] = sal.link;
      r[k.id] = sal.fileId;
      r[k.waktu] = ms === null ? '' : waktuWib_(ms, true);
      meta[slot] = { waktu: m.waktu || '', waktuHp: m.waktu || '', sumberWaktu: 'HP', sumber: m.sumber || 'KAMERA',
                     lat: m.lat === undefined ? null : m.lat, lng: m.lng === undefined ? null : m.lng, akurasi: m.akurasi === undefined ? null : m.akurasi,
                     sha256: m.sha256 || '', ukuran: m.ukuran || '' };
    });
    // v1.0.29 (permintaan kvlar 24 Okt 2026): koordinat P0 = GPS foto Sebelum, koordinat closing = GPS foto Sesudah (HP
    // 1.0.29 mengirim GPS jepret). Foto tanpa GPS = koordinat pekerjaan WO (GPS HP saat isi form), lalu koordinat temuan.
    var titikFoto = function (m) { return m && m.lat !== null && m.lat !== undefined && m.lng !== null && m.lng !== undefined ? { lat: Number(m.lat), lng: Number(m.lng) } : null; };
    var tPek = tl.lat !== '' && tl.lat !== undefined && tl.lat !== null ? { lat: Number(tl.lat), lng: Number(tl.lng) } : null;
    var tTem = t.lat !== '' && t.lat !== undefined && t.lat !== null ? { lat: Number(t.lat), lng: Number(t.lng) } : null;
    var buka = titikFoto(mf.SEBELUM), sBuka = 'SEBELUM';
    if (!buka) { buka = tPek || tTem; sBuka = tPek ? 'PEKERJAAN_WO' : 'TEMUAN'; }
    var tutup = titikFoto(mf.SESUDAH), sTutup = 'SESUDAH';
    if (!tutup) { tutup = tPek; sTutup = 'PEKERJAAN_WO'; }
    var lat = buka ? buka.lat : null, lng = buka ? buka.lng : null;
    if (buka) { r.Lat = lat; r.Long = lng; r.Koordinat = koordinatTeks_(lat, lng); meta.sumberKoordinat = sBuka; }
    if (tutup) {
      r['Lat Closing'] = tutup.lat; r['Long Closing'] = tutup.lng; r['Koordinat Closing'] = koordinatTeks_(tutup.lat, tutup.lng);
      meta.sumberKoordinatClosing = sTutup;
      if (buka && titikSah_(lat, lng)) r['Jarak Closing P0 (m)'] = jarakMeter_(lat, lng, tutup.lat, tutup.lng);
    }
    var menit = mSeb !== null && mSes !== null ? menitP0_(mSes - mSeb) : '';
    r['Durasi (menit)'] = menit;
    r['Skor Durasi'] = menit === '' ? '' : skorDurasiP0_(menit);
    r.foto_meta = JSON.stringify(meta);
    if (mPek === null) r['Waktu Pekerjaan'] = '';
    baru.push(r);
    hasil.push({ tl: tl, kode: r['Kode P0'], id: String(tl.tl_id) });
  });
  if (baru.length) {
    var semua = p0Shift.concat(baru), jarak = jarakAntarP0_(semua), ubah = [];
    p0Shift.forEach(function (r) {
      var v = jarak[String(r.p0_id)];
      if (v !== undefined && String(r['Jarak Antar P0 (m)']) !== String(v)) ubah.push({ r: r, u: { 'Jarak Antar P0 (m)': v } });
    });
    baru.forEach(function (r) { var v = jarak[String(r.p0_id)]; r['Jarak Antar P0 (m)'] = v === undefined ? '' : v; });
    tulisBlok_(tb.yan_P0, ubah, baru);
    rekapShiftId_([s.shift_id], sekarangMs, sesi.userId);
  }
  return hasil;
}

/**
 * Selesai WO: pekerjaan DRAFT (min. 1, foto wajib lengkap) masuk realisasi tim, baris jadi TERCATAT, temuan Selesai.
 * HARTEK lokasi Jaringan yang belum punya PG hari ini: daerah + jumlahGawang wajib.
 */
function selesaiWo_(sesi, data, platform) {
  wajibPetugasWo_(sesi, platform);
  var d = validasi_(data, {
    temuanId: { tipe: 'uuid', wajib: true }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 },
    daerah: { tipe: 'teks', maks: 200 }, jumlahGawang: { tipe: 'angka', min: 0, max: 9999, bulat: true }
  });
  return denganLock_(function () {
    var tt = tabelTemuanWo_(), tG = tabelOpsiWo_(WO_GANDA_SHEET_);
    var a = aksesWo_(tt.rows, d.temuanId, sesi, tG ? tG.rows : []);
    var t = a.t;
    if (a.pemilik && teksWo_(t.status_wo) === WO_STATUS_.selesai) return { temuanId: String(d.temuanId), revision: Number(t.revision) || 1, duplikat: true, temuan: woKeHp_(t, []) };
    if (a.pemilik) wajibWoDikerjakan_(t);
    if (a.pemilik && Number(t.revision) !== d.revision) throw new SisiError_('KONFLIK_REVISION', d.temuanId);
    var tTl = tabelTlWo_();
    var milik = tTl.rows.filter(function (x) {
      return String(x.temuan_id) === String(t.temuan_id) && teksWo_(x.status) !== WO_TL_STATUS_.batal && String(x.tim_id) === String(sesi.timId);
    });
    var draft = milik.filter(function (x) { return teksWo_(x.status) === WO_TL_STATUS_.draft; });
    if (!milik.length) throw new SisiError_('WO_TANPA_PEKERJAAN', teksWo_(t.kode_temuan));
    var wajib = WO_SLOT_WAJIB_[sesi.jenisTim];
    draft.forEach(function (x) {
      wajib.forEach(function (slot) {
        if (!teksWo_(x[WO_SLOT_[slot] + '_link'])) throw new SisiError_('FOTO_BELUM_LENGKAP', teksWo_(x.kode_tl) + ' ' + slot);
      });
    });
    // v1.0.16: WO ganda (ada klaim aktif tim lain / tim ini tim klaim) = Selesai DITAHAN sampai verifikasi admin
    var gandaT = tG ? gandaTemuanWo_(tG.rows, t.temuan_id) : [];
    if (!a.pemilik || gandaT.some(gandaAktifWo_)) return tahanSelesaiWo_(sesi, t, tG, gandaT, d, platform);
    var hasil = !draft.length ? [] : sesi.jenisTim === 'ROW' ? catatRealisasiRowWo_(sesi, t, draft)
      : sesi.jenisTim === 'HARTEK' ? catatRealisasiHartekWo_(sesi, t, draft, d) : catatRealisasiYandalWo_(sesi, t, draft);
    var sekarang = sekarangIso_();
    hasil.forEach(function (h) {
      ubahBaris_(tTl, 'tl_id', h.id, { status: WO_TL_STATUS_.tercatat, kode_realisasi_modul: h.kode, realisasi_modul_id: h.id,
                                        timestamp_update: sekarang, diubah_oleh: sesi.userId });
    });
    var u = {
      status: WO_TEMUAN_STATUS_.selesai, status_wo: WO_STATUS_.selesai, belum_diperbaiki: '',
      tindak_lanjut: ringkasTindakLanjutWo_(milik), jumlah_pekerjaan: milik.length,
      diselesaikan_oleh: sesi.nama || sesi.username || sesi.userId, waktu_selesai: sekarang,
      timestamp_update: sekarang, diubah_oleh: sesi.userId
    };
    var rev = ubahBaris_(tt, 'temuan_id', d.temuanId, u, d.revision);
    auditLog_(sesi, 'WO_SELESAI', teksWo_(t.kode_temuan), sesi.jenisTim + ' ' + hasil.map(function (h) { return h.kode; }).join(', '),
      platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return {
      temuanId: String(d.temuanId), revision: rev, tindakLanjut: u.tindak_lanjut,
      realisasi: hasil.map(function (h) { return { tlId: h.id, kode: h.kode }; }),
      temuan: woKeHp_(Object.assign({}, t, u, { revision: rev }), [])
    };
  }, 30000);
}

/** v1.0.16: tandai tim ini SIAP (sudah Selesai) di db_wo_ganda, isian Selesai Hartek disimpan untuk kirim ulang HP. */
function tahanSelesaiWo_(sesi, t, tG, gandaT, d, platform) {
  var sekarang = sekarangIso_();
  var g = gandaT.filter(function (x) { return String(x.tim_id) === String(sesi.timId) && gandaAktifWo_(x); })[0];
  var catatan = JSON.stringify({ daerah: d.daerah || '', jumlahGawang: d.jumlahGawang === undefined ? '' : d.jumlahGawang });
  if (g) {
    ubahBaris_(tG, 'ganda_id', g.ganda_id, { status: WO_GANDA_STATUS_.siap, waktu_siap: sekarang, catatan: catatan, timestamp_update: sekarang, diubah_oleh: sesi.userId });
  } else {
    tambahBaris_(tG, sisipAuditInsJar_({
      nomor: tG.rows.length + 1, kode_temuan: teksWo_(t.kode_temuan), tim: sesi.timNama || '', jenis_tim: sesi.jenisTim,
      status: WO_GANDA_STATUS_.siap, waktu_klaim: '', diklaim_oleh: '', waktu_siap: sekarang, diputuskan_oleh: '', waktu_putusan: '',
      catatan: catatan, ganda_id: uuid_(), temuan_id: String(t.temuan_id), tim_id: sesi.timId
    }, sesi, sekarang));
  }
  auditLog_(sesi, 'WO_SELESAI_DITAHAN', teksWo_(t.kode_temuan), sesi.timNama || '', platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
  return { temuanId: String(t.temuan_id), revision: Number(t.revision) || 1, menungguVerifikasi: true, temuan: woKeHp_(t, [], sesi.timId) };
}

/* ===== ADMIN: verifikasi WO ganda (v1.0.16, menu OPS_WO_GANDA) ===== */

/**
 * WO yang diunggah lebih dari satu tim. status MENUNGGU (default) = ada klaim aktif; SELESAI = sudah diputuskan
 * (30 hari terakhir). Tiap tim: status klaim, pekerjaan + foto kirimannya.
 */
function getWoGanda_(sesi, data) {
  wajibAdminWo_(sesi);
  var d = validasi_(data, { status: { tipe: 'pilihan', pilihan: ['MENUNGGU', 'SELESAI'] } });
  var status = d.status || 'MENUNGGU';
  var rowsG = rowsGandaWo_();
  var batas = tglJakarta_(new Date(Date.now() - 30 * 864e5));
  var perTemuan = {};
  rowsG.forEach(function (g) { (perTemuan[String(g.temuan_id)] = perTemuan[String(g.temuan_id)] || []).push(g); });
  var rowsT = tabelTemuanWo_().rows, rowsTl = tabelTlWo_().rows, tim = timTujuanWo_();
  var namaTim = {};
  tim.forEach(function (x) { namaTim[x.timId] = x; });
  var hasil = [], menunggu = 0;
  Object.keys(perTemuan).forEach(function (id) {
    var gs = perTemuan[id], aktif = gs.some(gandaAktifWo_);
    if (aktif) menunggu++;
    if (status === 'MENUNGGU' ? !aktif : (aktif || !gs.some(function (g) { return teksWo_(g.waktu_putusan).slice(0, 10) >= batas; }))) return;
    var t = rowsT.filter(function (x) { return String(x.temuan_id) === id; })[0];
    if (!t) return;
    var o = woKeHp_(t, []);
    var timIds = [];
    var pemilik = String(t.tim_tindak_lanjut_id || '');
    if (pemilik) timIds.push(pemilik);
    gs.forEach(function (g) { if (timIds.indexOf(String(g.tim_id)) === -1) timIds.push(String(g.tim_id)); });
    o.tim = timIds.map(function (tid) {
      var g = gs.filter(function (x) { return String(x.tim_id) === tid; }).sort(function (a, b) { return b._baris - a._baris; })[0];
      var pk = rowsTl.filter(function (x) { return String(x.temuan_id) === id && String(x.tim_id) === tid && teksWo_(x.status) !== WO_TL_STATUS_.batal; }).map(tlKeHpWo_);
      return {
        timId: tid, tim: g ? teksWo_(g.tim) : (tid === pemilik ? teksWo_(t.tim_tindak_lanjut) : (namaTim[tid] || {}).nama || ''),
        jenisTim: g ? teksWo_(g.jenis_tim) : (tid === pemilik ? teksWo_(t.jenis_tim_tindak_lanjut) : (namaTim[tid] || {}).jenis || ''),
        pemilik: tid === pemilik, status: g ? teksWo_(g.status) : '', waktuKlaim: g ? teksWo_(g.waktu_klaim) : '',
        diklaimOleh: g ? teksWo_(g.diklaim_oleh) : '', waktuSiap: g ? teksWo_(g.waktu_siap) : '',
        diputuskanOleh: g ? teksWo_(g.diputuskan_oleh) : '', waktuPutusan: g ? teksWo_(g.waktu_putusan) : '', pekerjaan: pk
      };
    });
    o.keduanyaUnggah = o.tim.filter(function (x) { return x.pekerjaan.length; }).length > 1;
    hasil.push(o);
  });
  hasil.sort(function (a, b) { return a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : 0; });
  return { status: status, menunggu: menunggu, ganda: hasil };
}

/**
 * Putuskan tim yang sah mengeksekusi WO ganda. Tim terpilih = pemilik WO (DIKERJAKAN), klaimnya DIPILIH; tim lain
 * DITOLAK + pekerjaan BATAL. HP tim terpilih mengirim ulang Selesai sendiri (realisasi masuk laporan tim itu).
 */
function putuskanWoGanda_(sesi, data) {
  wajibAdminWo_(sesi);
  var d = validasi_(data, {
    temuanId: { tipe: 'uuid', wajib: true }, timId: { tipe: 'teks', wajib: true, maks: 60 },
    catatan: { tipe: 'teks', maks: 300, multiBaris: true, maksBaris: 5 }
  });
  return denganLock_(function () {
    var tG = tabelOpsiWo_(WO_GANDA_SHEET_);
    if (!tG) throw new SisiError_('CONFIG_TIDAK_LENGKAP', WO_GANDA_SHEET_);
    var gs = gandaTemuanWo_(tG.rows, d.temuanId);
    if (!gs.some(gandaAktifWo_)) throw new SisiError_('WO_GANDA_SUDAH_DIPUTUSKAN', d.temuanId);
    var tt = tabelTemuanWo_(), t = temuanWo_(tt.rows, d.temuanId);
    if (teksWo_(t.status_wo) === WO_STATUS_.selesai) throw new SisiError_('WO_SUDAH_SELESAI', teksWo_(t.kode_temuan));
    var pemilik = String(t.tim_tindak_lanjut_id || '');
    var calon = gs.map(function (g) { return String(g.tim_id); }).concat(pemilik ? [pemilik] : []);
    if (calon.indexOf(String(d.timId)) === -1) throw new SisiError_('TIM_TIDAK_VALID', d.timId);
    var sekarang = sekarangIso_(), oleh = sesi.username || sesi.userId;
    var catatan = d.catatan || '';
    // klaim: terpilih DIPILIH, lainnya DITOLAK. Tim terpilih tanpa baris (pemilik yang belum Selesai) dibuatkan baris.
    var ubah = [];
    gs.forEach(function (g) {
      if (!gandaAktifWo_(g)) return;
      var pilih = String(g.tim_id) === String(d.timId);
      ubah.push({ r: g, u: { status: pilih ? WO_GANDA_STATUS_.dipilih : WO_GANDA_STATUS_.ditolak, diputuskan_oleh: oleh, waktu_putusan: sekarang,
                             catatan: pilih ? teksWo_(g.catatan) : catatan, timestamp_update: sekarang, diubah_oleh: sesi.userId } });
    });
    var baru = [];
    var timInfo = timTujuanWo_().filter(function (x) { return x.timId === String(d.timId); })[0];
    var gPilih = gs.filter(function (g) { return String(g.tim_id) === String(d.timId); })[0];
    if (!gPilih) {
      baru.push(sisipAuditInsJar_({
        nomor: tG.rows.length + 1, kode_temuan: teksWo_(t.kode_temuan), tim: teksWo_(t.tim_tindak_lanjut), jenis_tim: teksWo_(t.jenis_tim_tindak_lanjut),
        status: WO_GANDA_STATUS_.dipilih, waktu_klaim: '', diklaim_oleh: '', waktu_siap: '', diputuskan_oleh: oleh, waktu_putusan: sekarang,
        catatan: '', ganda_id: uuid_(), temuan_id: String(t.temuan_id), tim_id: String(d.timId)
      }, sesi, sekarang));
    }
    // pemilik lama yang tidak dipilih dan belum punya baris = DITOLAK (HP-nya tahu WO sudah diputuskan)
    if (pemilik && pemilik !== String(d.timId) && !gs.some(function (g) { return String(g.tim_id) === pemilik; })) {
      baru.push(sisipAuditInsJar_({
        nomor: tG.rows.length + baru.length + 1, kode_temuan: teksWo_(t.kode_temuan), tim: teksWo_(t.tim_tindak_lanjut), jenis_tim: teksWo_(t.jenis_tim_tindak_lanjut),
        status: WO_GANDA_STATUS_.ditolak, waktu_klaim: '', diklaim_oleh: '', waktu_siap: '', diputuskan_oleh: oleh, waktu_putusan: sekarang,
        catatan: catatan, ganda_id: uuid_(), temuan_id: String(t.temuan_id), tim_id: pemilik
      }, sesi, sekarang));
    }
    tulisBlok_(tG, ubah, baru);
    // pekerjaan tim lain = BATAL
    var tTl = tabelTlWo_(), batal = [];
    tTl.rows.forEach(function (x) {
      if (String(x.temuan_id) === String(t.temuan_id) && String(x.tim_id) !== String(d.timId) && teksWo_(x.status) === WO_TL_STATUS_.draft) {
        batal.push({ r: x, u: { status: WO_TL_STATUS_.batal, timestamp_update: sekarang, diubah_oleh: sesi.userId } });
      }
    });
    if (batal.length) tulisBlok_(tTl, batal, []);
    // WO jadi milik tim terpilih, status DIKERJAKAN (HP-nya mengirim ulang Selesai)
    var g0 = gPilih || {};
    var nama = timInfo ? timInfo.nama : teksWo_(g0.tim) || teksWo_(t.tim_tindak_lanjut);
    var jenis = timInfo ? timInfo.jenis : teksWo_(g0.jenis_tim) || teksWo_(t.jenis_tim_tindak_lanjut);
    var u = { status: WO_TEMUAN_STATUS_.progress, status_wo: WO_STATUS_.kerja, tim_tindak_lanjut: nama, jenis_tim_tindak_lanjut: jenis,
              tim_tindak_lanjut_id: String(d.timId), timestamp_update: sekarang, diubah_oleh: sesi.userId };
    if (String(d.timId) !== pemilik || !teksWo_(t.waktu_mulai)) {
      u.dimulai_oleh = teksWo_(g0.diklaim_oleh) || teksWo_(t.dimulai_oleh);
      u.waktu_mulai = teksWo_(g0.waktu_klaim) || teksWo_(t.waktu_mulai) || sekarang;
    }
    var rev = ubahBaris_(tt, 'temuan_id', d.temuanId, u);
    if (String(d.timId) !== pemilik) catatRiwayatWo_(t, { timId: String(d.timId), nama: nama, jenis: jenis }, 'VERIFIKASI', sesi);
    auditLog_(sesi, 'WO_GANDA_PUTUSKAN', teksWo_(t.kode_temuan), nama + (batal.length ? ' (' + batal.length + ' pekerjaan tim lain dibatalkan)' : ''),
      'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { temuanId: String(d.temuanId), timId: String(d.timId), tim: nama, revision: rev, dibatalkan: batal.length };
  }, 30000);
}

/* ===== konfigurasi ===== */

function cekKonfigWo_(c) {
  var masalah = 0;
  var ok = function (p) { console.log('  [OK]          ' + p); };
  var perhatian = function (p) { masalah++; console.warn('  [PERHATIAN]   ' + p); };
  console.log('');
  console.log('--- WO Tindak Lanjut Temuan (db_temuan_tindak_lanjut) ---');
  if (!c.TEMUAN_SHEET_ID) { console.log('  [DILEWATI]    TEMUAN_SHEET_ID kosong'); return 0; }
  try {
    var t = tabel_('TEMUAN_SHEET_ID', WO_TL_SHEET_), hk = TEMUAN_HEADER_[WO_TL_SHEET_];
    var beda = bedaStruktur_(t.header.slice(0, hk.length), hk);
    if (beda.length) perhatian(WO_TL_SHEET_ + ': STRUKTUR BEDA -> ' + beda.slice(0, 5).join(' | ') + ' (jalankan ADMIN_siapkanSheetInsJar)');
    else ok(WO_TL_SHEET_ + ' (' + t.rows.length + ' baris)');
  } catch (e) { perhatian(WO_TL_SHEET_ + ': ' + (e.kode === 'SHEET_TIDAK_ADA' ? 'belum ada (jalankan ADMIN_siapkanSheetInsJar)' : (e.kode || e.message))); }
  try {
    var menu = tabel_('MASTER_SHEET_ID', 'db_Menu').rows.map(function (x) { return String(x.menu_kode).trim(); });
    [WO_MENU_.admin, WO_MENU_.tim, WO_MENU_.ganda].forEach(function (m) {
      if (menu.indexOf(m) === -1) perhatian('menu ' + m + ' belum ada di db_Menu (impor docs/db_Menu.tsv)');
      else ok('menu ' + m + ' ada di db_Menu');
    });
    [WO_RIWAYAT_SHEET_, WO_GANDA_SHEET_].forEach(function (n) {   // v1.0.16
      if (!tabelOpsiWo_(n)) perhatian(n + ' belum ada (jalankan ADMIN_siapkanSheetInsJar): WO ganda / WO dipindah belum dikenali');
      else ok(n + ' ada');
    });
    var tim = timTujuanWo_();
    if (!tim.length) perhatian('belum ada tim aktif ROW / HARTEK / YANDAL di db_Tim (tujuan WO)');
    else ok('tim tujuan WO: ' + tim.length);
  } catch (eM) { perhatian('db_Menu / db_Tim: ' + (eM.kode || eM.message)); }
  return masalah;
}
