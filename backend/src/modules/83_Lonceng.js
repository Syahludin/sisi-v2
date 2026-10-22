/**
 * v1.0.19 (permintaan kvlar 23 Okt 2026): LONCENG NOTIFIKASI di header app (bukan notifikasi latar belakang).
 *  - Admin (bukan PETUGAS): P0 masuk yang masih Menunggu approval (menu OPS_VERIFIKASI_P0) dan temuan inspeksi baru
 *    dari petugas (menu OPS_INPUT_TEMUAN atau OPS_PENERUSAN_WO).
 *  - Tim tindak lanjut (PETUGAS ROW / HARTEK / YANDAL, menu OPS_WO_TIM): WO yang dikirim admin ke tim (TERKIRIM).
 * Hanya item 14 hari terakhir. "Dilihat" per item per akun (sama di semua HP akun itu), disimpan di SiSi_Auth
 * log_Notif_Dilihat (dibuat otomatis saat pertama ditandai). WO yang dipindah lalu dikirim ulang = item baru.
 *
 * getNotifikasi {} -> { belum, item[{kunci, jenis P0|TEMUAN|WO, judul, rincian, waktu, dilihat, tujuan{...}}] }
 * tandaiNotifikasi {kunci[] | semua: true} -> { ditandai, belum }
 */

var LONCENG_SHEET_ = 'log_Notif_Dilihat';
var LONCENG_HEADER_ = ['user_id', 'kunci', 'waktu'];
var LONCENG_HARI_ = 14;
var LONCENG_MAKS_ = 100;

function wajibSesiLonceng_(sesi) {
  if (!sesi || ROLE_VALID_().indexOf(sesi.role) === -1) throw new SisiError_('AKSES_DITOLAK', 'lonceng');
}

function adaMenuLonceng_(sesi, menu) {
  try { return !!aksesUntuk_(sesi.role, sesi.jenisTim, menu, aturanAkses_()); } catch (e) { return false; }
}

/** Tanggal yyyy-MM-dd 14 hari lalu (WIB). */
function batasLonceng_() {
  return tglJakarta_(new Date(Date.now() - LONCENG_HARI_ * 864e5));
}

/** Kunci yang sudah dilihat akun ini. Tab belum ada = kosong. */
function dilihatLonceng_(userId) {
  var hasil = {};
  try {
    tabel_('AUTH_SHEET_ID', LONCENG_SHEET_).rows.forEach(function (r) { if (String(r.user_id) === String(userId)) hasil[String(r.kunci)] = true; });
  } catch (e) { if (!e || e.kode !== 'SHEET_TIDAK_ADA') throw e; }
  return hasil;
}

/** Admin: P0 yang masih Menunggu approval. */
function itemP0Lonceng_(batas) {
  return bacaSheetYandal_(['yan_P0']).yan_P0.rows.filter(function (r) {
    return r.p0_id && String(r.status || 'AKTIF') !== 'BATAL' && tglSel_(r.Tanggal) >= batas && statusApprovalP0_(r) === 'Menunggu';
  }).map(function (r) {
    var tgl = tglSel_(r.Tanggal);
    return { kunci: 'P0:' + r.p0_id, jenis: 'P0', judul: 'P0 masuk: ' + String(r['Nama Pekerjaan'] || 'Pekerjaan').trim(),
             rincian: [String(r['Kode P0'] || '').trim(), String(r.Tim || '').trim()].filter(String).join(' · '),
             waktu: tgl, tujuan: { menu: 'OPS_VERIFIKASI_P0', tanggal: tgl } };
  });
}

/** Admin: temuan baru dari petugas inspeksi (bukan input admin sendiri). */
function itemTemuanLonceng_(batas) {
  return tabelInsJar_(INSJAR_SHEET_.TEMUAN).rows.filter(function (t) {
    return t.temuan_id && String(t.sumber) !== 'ADMIN' && tglInsJar_(t) >= batas;
  }).map(function (t) {
    return { kunci: 'TEMUAN:' + t.temuan_id, jenis: 'TEMUAN', judul: 'Temuan baru: ' + String(t.jenis_temuan || 'Temuan').trim(),
             rincian: [t.penyulang, t.section, t.no_gardu ? 'Gardu ' + t.no_gardu : '', t.tim].map(function (v) { return String(v || '').trim(); }).filter(String).join(' · '),
             waktu: String(t.timestamp || tglInsJar_(t)), tujuan: { menu: 'OPS_INPUT_TEMUAN', temuanId: String(t.temuan_id) } };
  });
}

/** Tim: WO yang dikirim admin ke tim ini (masih Terkirim). */
function itemWoLonceng_(sesi) {
  return tabelInsJar_(INSJAR_SHEET_.TEMUAN).rows.filter(function (t) {
    return String(t.tim_tindak_lanjut_id || '') === String(sesi.timId) && String(t.status_wo) === WO_STATUS_.kirim;
  }).map(function (t) {
    return { kunci: 'WO:' + t.temuan_id + ':' + String(t.waktu_diteruskan || ''), jenis: 'WO',
             judul: 'WO baru: ' + String(t.jenis_temuan || 'Temuan').trim(),
             rincian: [t.penyulang, t.section, t.no_gardu ? 'Gardu ' + t.no_gardu : '', t.catatan_admin].map(function (v) { return String(v || '').trim(); }).filter(String).join(' · '),
             waktu: String(t.waktu_diteruskan || ''), tujuan: { menu: 'OPS_WO_TIM', temuanId: String(t.temuan_id) } };
  });
}

/** Semua item lonceng untuk sesi (tanpa status dilihat), terbaru dulu. Bagian yang sheet-nya belum diatur dilewati. */
function itemLonceng_(sesi) {
  var batas = batasLonceng_(), item = [];
  if (sesi.role === 'PETUGAS') {
    if (adaMenuLonceng_(sesi, 'OPS_WO_TIM') && sesi.timId) item = item.concat(bagianKalender_(function () { return itemWoLonceng_(sesi); }));
  } else {
    if (adaMenuLonceng_(sesi, 'OPS_VERIFIKASI_P0')) item = item.concat(bagianKalender_(function () { return itemP0Lonceng_(batas); }));
    if (adaMenuLonceng_(sesi, 'OPS_INPUT_TEMUAN') || adaMenuLonceng_(sesi, 'OPS_PENERUSAN_WO')) {
      item = item.concat(bagianKalender_(function () { return itemTemuanLonceng_(batas); }));
    }
  }
  return item.sort(function (a, b) { return String(b.waktu).localeCompare(String(a.waktu)); }).slice(0, LONCENG_MAKS_);
}

function getNotifikasi_(sesi) {
  wajibSesiLonceng_(sesi);
  var lihat = dilihatLonceng_(sesi.userId);
  var item = itemLonceng_(sesi).map(function (x) { return Object.assign(x, { dilihat: !!lihat[x.kunci] }); });
  return { belum: item.filter(function (x) { return !x.dilihat; }).length, item: item };
}

/** Tab log_Notif_Dilihat (dibuat kalau belum ada). */
function tabelLonceng_() {
  try { return tabel_('AUTH_SHEET_ID', LONCENG_SHEET_); } catch (e) {
    if (!e || e.kode !== 'SHEET_TIDAK_ADA') throw e;
    var sh = bukaSpreadsheet_(cfg_().AUTH_SHEET_ID).insertSheet(LONCENG_SHEET_);
    sh.getRange(1, 1, 1, LONCENG_HEADER_.length).setValues([LONCENG_HEADER_]);
    return tabel_('AUTH_SHEET_ID', LONCENG_SHEET_);
  }
}

function tandaiNotifikasi_(sesi, data) {
  wajibSesiLonceng_(sesi);
  var d = validasi_(data, { kunci: { tipe: 'teks', maks: 4000 }, semua: { tipe: 'bool' } });
  var aktif = {};
  itemLonceng_(sesi).forEach(function (x) { aktif[x.kunci] = true; });
  var minta = d.semua ? Object.keys(aktif) : String(d.kunci || '').split('|').map(function (k) { return k.trim(); }).filter(function (k) { return aktif[k]; });
  return denganLock_(function () {
    var lihat = dilihatLonceng_(sesi.userId);
    var baru = minta.filter(function (k, i) { return !lihat[k] && minta.indexOf(k) === i; });
    if (baru.length) {
      var t = tabelLonceng_(), w = sekarangIso_();
      tambahBanyak_(t, baru.map(function (k) { return { user_id: sesi.userId, kunci: k, waktu: w }; }));
      baru.forEach(function (k) { lihat[k] = true; });
    }
    return { ditandai: baru.length, belum: Object.keys(aktif).filter(function (k) { return !lihat[k]; }).length };
  }, 15000);
}
