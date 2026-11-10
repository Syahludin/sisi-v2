/**
 * v1.0.10 (permintaan Master Guswan 21 Okt 2026): WO tindak lanjut temuan inspeksi.
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
 * v1.0.16 (permintaan Master Guswan 22 Okt 2026):
 *  - HP mengerjakan WO offline (antrean di HP). Kalau admin memindah WO selama tim lama bekerja offline, kiriman tim
 *    lama ditolak WO_DIPINDAH (tim pernah ditugaskan, db_wo_riwayat). Petugas bisa tetap mengunggah (mulaiWo paksa):
 *    tim lama tercatat KLAIM di db_wo_ganda dan boleh mengunggah pekerjaan + foto. Selama ada klaim, Selesai tim mana
 *    pun DITAHAN (SIAP, menungguVerifikasi) sampai admin memilih tim yang sah (putuskanWoGanda, menu OPS_WO_GANDA).
 *    Tim terpilih: WO jadi milik tim itu (DIKERJAKAN), HP-nya mengirim ulang Selesai otomatis. Tim lain: pekerjaan
 *    BATAL, HP-nya membuang WO itu.
 *  - Koordinat pekerjaan wajib. WO Yandal: foto wajib dari kamera (galeri ditolak), koordinat dari GPS HP.
 *  - Hartek: satu isian boleh banyak pekerjaan + material (kolom rincian JSON), masuk db_Hartek_Pekerjaan +
 *    db_Hartek_Material saat Selesai. Foto tetap satu set per isian.
 *
 * Review 8 Nov 2026: file ini = konstanta, peran, helper bersama, sisi ADMIN (daftar / teruskan / pindah / tarik) dan cek
 * konfigurasi. Sisi petugas = 57_TindakLanjut_Tim.js, Selesai -> realisasi tim = 58_TindakLanjut_Selesai.js, verifikasi WO
 * ganda = 59_TindakLanjut_Ganda.js.
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
 * v1.0.17 (permintaan Master Guswan 22 Okt 2026, integritas audit): temuan yang SUDAH DITERUSKAN ke tim (TERKIRIM) juga terkunci,
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

/** Review 8 Nov 2026: baris dikelompokkan per temuan_id sekali jalan ({ id: [baris] }), pengganti saring ulang per temuan. */
function perTemuanWo_(rows) {
  var o = {};
  (rows || []).forEach(function (r) { var k = String(r.temuan_id); (o[k] = o[k] || []).push(r); });
  return o;
}

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
 * v1.0.17 (permintaan Master Guswan 22 Okt 2026): material MENEMPEL ke pekerjaan yang memakainya. Bentuk tersimpan:
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

/** v1.0.58: selisih daftar WO: perubahan yang tertulis sampai 3 menit sebelum `sejak` ikut dibawa (penulisan yang selesai belakangan). */
var WO_SELISIH_TUMPANG_MS_ = 180000;

/** Cap waktu sel (objek Date dari Sheets atau teks ISO) -> ms; kosong / tidak valid = 0. */
function waktuMsWo_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? 0 : v.getTime();
  var s = teksWo_(v);
  if (!s) return 0;
  var ms = Date.parse(s);
  return isNaN(ms) ? 0 : ms;
}

/**
 * v1.0.58: temuan yang berubah sesudah [batasMs]: baris temuan sendiri, pekerjaan tindak lanjutnya, atau klaim WO ganda
 * (pekerjaan dan ganda berubah tanpa menyentuh baris temuan). Hasil { temuanId: true }.
 */
function idBerubahWo_(rowsTemuan, rowsTl, rowsG, batasMs) {
  var hasil = {};
  rowsTemuan.forEach(function (t) { if (waktuMsWo_(t.timestamp_update) > batasMs) hasil[String(t.temuan_id)] = true; });
  rowsTl.forEach(function (r) { if (waktuMsWo_(r.timestamp_update) > batasMs) hasil[String(r.temuan_id)] = true; });
  rowsG.forEach(function (g) {
    var ms = Math.max(waktuMsWo_(g.timestamp_update), waktuMsWo_(g.waktu_klaim), waktuMsWo_(g.waktu_siap), waktuMsWo_(g.waktu_putusan));
    if (ms > batasMs) hasil[String(g.temuan_id)] = true;
  });
  return hasil;
}

/**
 * status: BARU (belum diteruskan), TERKIRIM, DIKERJAKAN, SELESAI, AKTIF (selain SELESAI, default), SEMUA.
 * v1.0.58 sejak (ISO): hanya temuan yang berubah sesudah itu (status diabaikan, dari / sampai berlaku, tanpa batas 500);
 * ringkas + tim tetap penuh. Jawaban selalu membawa kursor (waktu server sebelum sheet dibaca) = sejak berikutnya.
 */
function getWoAdmin_(sesi, data) {
  wajibAdminWo_(sesi);
  var d = validasi_(data, {
    status: { tipe: 'pilihan', pilihan: ['BARU', 'TERKIRIM', 'DIKERJAKAN', 'SELESAI', 'AKTIF', 'SEMUA'] },
    dari: { tipe: 'tanggal' }, sampai: { tipe: 'tanggal' }, sejak: { tipe: 'waktu' }
  });
  var kursor = sekarangIso_();
  var status = d.status || 'AKTIF';
  var rowsTl = tabelTlWo_().rows, semua = tabelTemuanWo_().rows;
  var rowsG = rowsGandaWo_();
  var berubah = d.sejak ? idBerubahWo_(semua, rowsTl, rowsG, Date.parse(d.sejak) - WO_SELISIH_TUMPANG_MS_) : null;
  // tanggal dihitung sekali per baris, bukan di tiap perbandingan sort
  var rows = semua.map(function (t) { return { t: t, tgl: tglInsJar_(t) }; }).filter(function (x) {
    var s = teksWo_(x.t.status_wo), tgl = x.tgl;
    if (d.dari && tgl < d.dari) return false;
    if (d.sampai && tgl > d.sampai) return false;
    if (berubah) return !!berubah[String(x.t.temuan_id)];
    if (status === 'SEMUA') return true;
    if (status === 'AKTIF') return s !== WO_STATUS_.selesai;
    if (status === 'BARU') return !s;
    return s === WO_STATUS_[{ TERKIRIM: 'kirim', DIKERJAKAN: 'kerja', SELESAI: 'selesai' }[status]];
  }).sort(function (a, b) { return a.tgl < b.tgl ? 1 : a.tgl > b.tgl ? -1 : b.t._baris - a.t._baris; })
    .map(function (x) { return x.t; });
  var ringkas = { baru: 0, terkirim: 0, dikerjakan: 0, selesai: 0 };
  semua.forEach(function (t) {
    var s = teksWo_(t.status_wo);
    if (!s) ringkas.baru++; else if (s === WO_STATUS_.kirim) ringkas.terkirim++; else if (s === WO_STATUS_.kerja) ringkas.dikerjakan++; else if (s === WO_STATUS_.selesai) ringkas.selesai++;
  });
  ringkas.ganda = {};
  rowsG.forEach(function (g) { if (gandaAktifWo_(g)) ringkas.ganda[String(g.temuan_id)] = true; });
  ringkas.ganda = Object.keys(ringkas.ganda).length;
  var tlPer = perTemuanWo_(rowsTl), gPer = perTemuanWo_(rowsG);
  return {
    status: status, selisih: !!berubah, kursor: kursor, ringkas: ringkas, tim: timTujuanWo_(),
    temuan: (berubah ? rows : rows.slice(0, 500)).map(function (t) {
      var id = String(t.temuan_id);
      var o = woKeHp_(t, tlPer[id]);
      o.wo.ganda = (gPer[id] || []).some(gandaAktifWo_);   // v1.0.16: menunggu verifikasi WO ganda
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

/**
 * v1.0.50 (permintaan Master Guswan 30 Okt 2026): menu web Temuan Inspeksi (peta temuan, OPS_PETA_TEMUAN). Isi sama dengan
 * getWoAdmin_ / getFotoWoAdmin_ (baca saja); menu sendiri supaya hak akses peta terpisah dari Penerusan WO.
 */
function getPetaTemuan_(sesi, data) {
  wajibAdminWo_(sesi);
  return getWoAdmin_(sesi, data);
}

/**
 * v1.0.51 getRekapJenisTemuan { dari?, sampai? } (tab Rincian Jenis Temuan, menu OPS_PETA_TEMUAN), port v1
 * getDpgRekapTemuanSectionVolume: semua temuan rentang tanggal (tanpa batas 500), dikelompokkan per
 * penyulang + section + jenis temuan + tier. Volume = jumlah baris temuan. Pivot per section + filter di browser.
 *   -> { dari, sampai, baris: [{ penyulang, section, jenisTemuan, tier, jumlah }] }
 */
function getRekapJenisTemuan_(sesi, data) {
  wajibAdminWo_(sesi);
  var d = validasi_(data, { dari: { tipe: 'tanggal' }, sampai: { tipe: 'tanggal' } });
  var hitung = {}, urut = [];
  tabelTemuanWo_().rows.forEach(function (t) {
    var tgl = tglInsJar_(t), jenis = teksWo_(t.jenis_temuan), sec = teksWo_(t.section);
    if (!jenis || !sec || (d.dari && tgl < d.dari) || (d.sampai && tgl > d.sampai)) return;
    var peny = teksWo_(t.penyulang), tier = teksWo_(t.tier), k = [peny, sec, jenis, tier].join('');
    if (!hitung.hasOwnProperty(k)) { hitung[k] = { penyulang: peny, section: sec, jenisTemuan: jenis, tier: tier, jumlah: 0 }; urut.push(k); }
    hitung[k].jumlah++;
  });
  return { dari: d.dari || '', sampai: d.sampai || '', baris: urut.map(function (k) { return hitung[k]; }) };
}

function getFotoPetaTemuan_(sesi, data) {
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
 * v1.0.18 (permintaan Master Guswan 22 Okt 2026): Pindah Tim TO (menu OPS_PINDAH_TIM_TO). Hanya WO TERKIRIM (belum dimulai tim)
 * yang dipindah ke tim lain. Penerusan WO (teruskanWo) tidak lagi memindah WO terkirim: tab Terkirim di sana hanya lihat.
 */
function pindahWo_(sesi, data) {
  wajibAdminWo_(sesi);
  return kirimWoKeTim_(sesi, data, true);
}

/** v1.0.18: daftar Pindah Tim TO = WO TERKIRIM (isi sama getWoAdmin). */
function getWoPindah_(sesi, data) {
  wajibAdminWo_(sesi);
  // v1.0.58: hanya status SEMUA (sinkron lokal HP, disaring di perangkat) yang lolos; selain itu dipaksa TERKIRIM seperti dulu
  var d = data || {};
  return getWoAdmin_(sesi, d.status === 'SEMUA' ? d : Object.assign({}, d, { status: 'TERKIRIM' }));
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
    return { temuanId: String(d.temuanId), revision: rev, pindah: pindah, temuan: woKeHp_(baru, []) };
  }, 20000);
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
