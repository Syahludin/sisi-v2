/**
 * WO tindak lanjut, ADMIN verifikasi WO ganda (menu OPS_WO_GANDA): dua tim mengunggah WO yang sama.
 * Review 8 Nov 2026: dipecah dari 56_TindakLanjut.js (isi fungsi tidak berubah). Konstanta WO_*, peran, dan helper
 * bersama tetap di 56_TindakLanjut.js; Apps Script memuat semua file ke satu ruang global.
 */

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

