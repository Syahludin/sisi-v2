/**
 * v0.75.0 (permintaan Master Guswan 10 Okt 2026): Approval P0 (menu OPS_VERIFIKASI_P0, khusus ADMIN / SUPER), alur v1
 * (Verifikasi P0: pilih tanggal > tab Menunggu / Approved / Rejected > kartu dengan 3 foto P0 > Setujui / Tolak),
 * diperbarui untuk v2: keputusan langsung ditulis di dalam lock (tanpa antrean), point + rekap shift dihitung saat itu,
 * foto Drive privat dibaca lewat server (getFotoApprovalP0, thumbnail / penuh), lampiran Pengecekan Switching / Gardu
 * ikut di daftar, dan koreksi jenis pekerjaan (petugas salah input) dengan riwayat di foto_meta.KOREKSI_JENIS.
 *
 *  getApprovalP0        { tanggal, status? }  P0 SELESAI (Menunggu) + yang sudah diputuskan di tanggal operasional itu.
 *  getFotoApprovalP0    { p0Id, jenis, id?, slot, ukuran }  satu foto (P0 / switching / gardu) milik P0 tsb.
 *  simpanApprovalP0     { p0Id, keputusan, alasan?, bobot?, revision? }  Approved / Rejected (alasan wajib).
 *  ubahJenisP0          { p0Id, namaPekerjaan, pekerjaanLainnya?, alasan, bobot?, revision? }  jenis dari master.
 *  simpanAturanYandal   { garduDuaHari }  toggle "Pengukuran Gardu 2 Hari Sekali" (Script Property).
 */
var YAN_APPROVAL_STATUS_ = ['Menunggu', 'Approved', 'Rejected'];
var YAN_ATURAN_GARDU_DUA_HARI_ = 'ATURAN_GARDU_UKUR_2_HARI';
var YAN_GARDU_JEDA_HARI_ = 2;

function wajibAdminP0_(sesi) {
  if (!sesi || (sesi.role !== 'ADMIN' && sesi.role !== 'SUPER')) throw new SisiError_('AKSES_DITOLAK', 'approval P0 khusus admin');
}

// ---------------- aturan Yandal (toggle admin di Pengaturan) ----------------

/** Toggle aktif = petugas tidak bisa mengukur gardu yang sama dalam 2 hari (tanggal operasional). */
function aturanGarduDuaHari_() {
  return String(PropertiesService.getScriptProperties().getProperty(YAN_ATURAN_GARDU_DUA_HARI_) || '') === 'YA';
}

/**
 * v0.98.13: daftar ringkas pengukuran gardu 2 hari terakhir dari yan_Gardu (semua tim, status != BATAL).
 * Dipakai tab "History Pengukuran Gardu" di Shift Yandal & validasi 2 hari di HP tanpa perlu unduh ulang seluruh Master Gardu.
 */
function ukurGarduTerbaru_(tglAcuan) {
  var batas = tambahHari_(tglAcuan, -(YAN_GARDU_JEDA_HARI_ - 1));
  var peta = {};
  try {
    if (!cfg_().YANDAL_SHEET_ID) return [];
    var rows = tabel_('YANDAL_SHEET_ID', 'yan_Gardu').rows;
    rows.forEach(function (x) {
      if (!x.ukur_id || String(x.status || 'AKTIF') === 'BATAL') return;
      var t = tglSel_(x.Tanggal);
      var jam = teksWaktuYandal_(x['Jam Ukur']);
      if (!t && jam.length >= 10) t = jam.slice(0, 10);
      if (!t || t < batas) return;
      var gid = String(x.gardu_id || ''), no = teksP0_(x['No Gardu']).toUpperCase();
      var k = gid || no;
      if (!k) return;
      var lama = peta[k];
      if (!lama || t > lama.tanggal || (t === lama.tanggal && jam > lama.jamUkur)) {
        peta[k] = {
          garduId: gid, noGardu: no, tanggal: t, jamUkur: jam,
          tim: teksP0_(x.Tim), shift: angkaApprovalP0_(x.Shift), petugas: teksP0_(x.Petugas),
          penyulang: teksP0_(x.Penyulang), section: teksP0_(x.Section), alamat: teksP0_(x.Alamat),
          kva: angkaApprovalP0_(x['Kapasitas (kVA)']), bebanKva: angkaApprovalP0_(x['Pembebanan (kVA)']),
          persen: angkaApprovalP0_(x['Persentase Beban (%)']), kategori: teksP0_(x['Kategori Beban']),
          waktuBeban: teksP0_(x['Waktu Beban']), kodeUkur: teksP0_(x['Kode Pengukuran Gardu'])
        };
      }
    });
  } catch (e) { return []; }
  return Object.keys(peta).map(function (k) { return peta[k]; }).sort(function (a, b) {
    return a.tanggal !== b.tanggal ? (a.tanggal < b.tanggal ? 1 : -1) : (a.noGardu < b.noGardu ? -1 : a.noGardu > b.noGardu ? 1 : 0);
  });
}

/** Isi modul getMaster `aturanYandal` (dibaca petugas YANDAL + admin, hanya baca). */
function isiAturanYandal_(sesi) {
  if (!petugasYandal_(sesi) && !(sesi && (sesi.role === 'ADMIN' || sesi.role === 'SUPER'))) throw new SisiError_('AKSES_DITOLAK', 'aturan Yandal');
  var tgl = tglJakarta_(new Date(sekarangMsYandal_()));
  var item = { kunci: 'garduDuaHari', aktif: aturanGarduDuaHari_(), jedaHari: YAN_GARDU_JEDA_HARI_ };
  var terbaru = ukurGarduTerbaru_(tgl);
  if (terbaru.length) item.ukurTerbaru = terbaru;
  return [item];
}

function simpanAturanYandal_(sesi, data, platform) {
  wajibAdminP0_(sesi);
  var d = validasi_(data, { garduDuaHari: { tipe: 'bool', wajib: true } });
  var p = PropertiesService.getScriptProperties();
  var lama = aturanGarduDuaHari_();
  if (lama !== d.garduDuaHari) {
    p.setProperty(YAN_ATURAN_GARDU_DUA_HARI_, d.garduDuaHari ? 'YA' : 'TIDAK');
    auditLog_(sesi, 'ATURAN_GARDU_2_HARI', d.garduDuaHari ? 'AKTIF' : 'NONAKTIF', '', platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
  }
  return { garduDuaHari: d.garduDuaHari };
}

/** Selisih hari kalender dua tanggal 'yyyy-MM-dd' (b - a). */
function selisihHari_(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }

/** Tanggal + n hari ('yyyy-MM-dd'). */
function tambahHari_(tgl, n) { return new Date(Date.parse(tgl + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }

/**
 * Aturan 2 hari: gardu yang sama sudah diukur (yan_Gardu aktif tim mana pun, atau Tanggal Ukur Terakhir master)
 * kurang dari 2 hari sebelum tanggal P0 = GARDU_BARU_DIUKUR. Toggle mati = tidak dicek.
 */
function cekJedaUkurGardu_(semuaUkur, g, tglP0, ukurId) {
  if (!aturanGarduDuaHari_() || !tglP0) return;
  var terakhir = tglUkurTerbaruGardu_(g);   // v1.0.23: WBP atau LWBP
  semuaUkur.forEach(function (x) {
    if (String(x.gardu_id) !== String(g.gardu_id) || String(x.ukur_id) === String(ukurId) || String(x.status || 'AKTIF') === 'BATAL') return;
    var t = tglSel_(x.Tanggal);
    if (t && t > terakhir) terakhir = t;
  });
  if (!terakhir) return;
  if (selisihHari_(terakhir, tglP0) < YAN_GARDU_JEDA_HARI_) {
    throw new SisiError_('GARDU_BARU_DIUKUR', teksP0_(g['No Gardu']) + ' diukur ' + terakhir + ', bisa lagi ' + tambahHari_(terakhir, YAN_GARDU_JEDA_HARI_));
  }
}

// ---------------- daftar approval ----------------

/** Status approval efektif: Approved / Rejected apa adanya, P0 SELESAI tanpa keputusan = Menunggu, lainnya null. */
function statusApprovalP0_(r) {
  var raw = teksP0_(r['Status Approval']);
  if (raw === 'Approved' || raw === 'Rejected') return raw;
  return teksP0_(r['Status P0']) === 'SELESAI' ? 'Menunggu' : null;
}

function angkaApprovalP0_(v) { return v === '' || v === null || v === undefined || !isFinite(Number(v)) ? null : Number(v); }

function ringkasSwitchingApproval_(x) {
  return {
    id: String(x.switching_id), kode: teksP0_(x['Kode Switching']), nama: teksP0_(x['Nama Switching']),
    penyulang: teksP0_(x.Penyulang), section: teksP0_(x.Section), jam: teksWaktuYandal_(x['Jam Pengecekan']),
    koordinat: teksP0_(x.Koordinat), catatan: teksP0_(x.Catatan),
    indikator: { Remote: teksP0_(x['Indikator Remote']), Local: teksP0_(x['Indikator Local']),
                 Protection: teksP0_(x['Indikator Protection']), Reclose: teksP0_(x['Indikator Reclose']) },
    arus: { R: angkaApprovalP0_(x['Arus R (A)']), S: angkaApprovalP0_(x['Arus S (A)']), T: angkaApprovalP0_(x['Arus T (A)']) },
    foto: YAN_SLOT_SWITCHING_.filter(function (s) { return !!teksP0_(x[kolomFotoSwitching_(s).id]); })
  };
}

function ringkasGarduApproval_(x) {
  var nilai = {};
  YAN_NILAI_GARDU_.forEach(function (n) { nilai[n.kunci] = angkaApprovalP0_(x[n.kolom]); });
  return {
    id: String(x.ukur_id), kode: teksP0_(x['Kode Pengukuran Gardu']), noGardu: teksP0_(x['No Gardu']),
    alamat: teksP0_(x.Alamat), penyulang: teksP0_(x.Penyulang), section: teksP0_(x.Section),
    kapasitas: angkaApprovalP0_(x['Kapasitas (kVA)']), jam: teksWaktuYandal_(x['Jam Ukur']), waktuBeban: teksP0_(x['Waktu Beban']),
    koordinat: teksP0_(x.Koordinat), jarakM: angkaApprovalP0_(x['Jarak ke Gardu (m)']), catatan: teksP0_(x.Catatan),
    nilai: nilai,
    hasil: { arusMaks: angkaApprovalP0_(x['Arus Maks per Fasa (A)']), kva: angkaApprovalP0_(x['Pembebanan (kVA)']),
             persen: angkaApprovalP0_(x['Persentase Beban (%)']), kategori: teksP0_(x['Kategori Beban']),
             tidakSeimbang: angkaApprovalP0_(x['Ketidakseimbangan Beban (%)']) },
    diterapkan: teksP0_(x['Diterapkan ke Master']),
    foto: YAN_SLOT_GARDU_.filter(function (s) { return !!teksP0_(x[kolomFotoGardu_(s).id]); })
  };
}

function itemApprovalP0_(r, anak) {
  var meta = metaP0_(r), st = statusApprovalP0_(r);
  return {
    p0Id: String(r.p0_id), kodeP0: teksP0_(r['Kode P0']), kodeShift: teksP0_(r['Kode Shift']), tanggal: tglSel_(r.Tanggal),
    hari: teksP0_(r.Hari), tim: teksP0_(r.Tim), shift: teksP0_(r.Shift), petugas: teksP0_(r.Petugas),
    namaPekerjaan: teksP0_(r['Nama Pekerjaan']), pekerjaanLainnya: teksP0_(r['Pekerjaan Lainnya']),
    lainLain: pekerjaanLainP0_(r['Nama Pekerjaan']),
    penyulang: teksP0_(r.Penyulang), section: teksP0_(r.Section), daerah: teksP0_(r.Daerah), catatan: teksP0_(r.Catatan),
    status: st, sistem: ditolakSistemP0_(r), alasanRejected: teksP0_(r['Alasan Rejected']),
    approvedOleh: teksP0_(r['Approved Oleh']), waktuApprove: teksWaktuYandal_(r['Waktu Approve']),
    waktuSebelum: teksWaktuYandal_(r['Waktu Sebelum']), waktuSesudah: teksWaktuYandal_(r['Waktu Sesudah']),
    waktuPekerjaan: teksWaktuYandal_(r['Waktu Pekerjaan']), waktuDibuat: teksWaktuYandal_(r['Waktu Dibuat']),   // v1.0.31
    durasi: angkaApprovalP0_(r['Durasi (menit)']), jarakClosing: angkaApprovalP0_(r['Jarak Closing P0 (m)']),
    jarakAntar: angkaApprovalP0_(r['Jarak Antar P0 (m)']), koordinat: teksP0_(r.Koordinat), koordinatClosing: teksP0_(r['Koordinat Closing']),
    skorDurasi: angkaApprovalP0_(r['Skor Durasi']), bobot: angkaApprovalP0_(r.Bobot), pengali: angkaApprovalP0_(r.Pengali),
    point: angkaApprovalP0_(r.Point), revision: Number(r.revision) || 0,
    foto: YAN_SLOT_P0_.filter(function (s) { return !!teksP0_(r[YAN_KOLOM_FOTO_P0_[s].id]); }),
    koreksiJenis: Array.isArray(meta.KOREKSI_JENIS) ? meta.KOREKSI_JENIS : [],
    switching: (anak && anak.switching) || [], gardu: (anak && anak.gardu) || []
  };
}

/** Baris anak (switching / gardu) per p0_id. Sheet anak belum dibuat = kosong (tidak menggagalkan daftar). */
function anakApprovalP0_(p0Ids) {
  var perP0 = {};
  p0Ids.forEach(function (id) { perP0[id] = { switching: [], gardu: [] }; });
  var baca = function (nama, fn, ke) {
    var rows;
    try { rows = bacaSheetYandal_([nama])[nama].rows; } catch (e) { return; }
    rows.forEach(function (x) {
      var o = perP0[String(x.p0_id)];
      if (o && String(x.status || 'AKTIF') !== 'BATAL') o[ke].push(fn(x));
    });
  };
  baca('yan_Switching', ringkasSwitchingApproval_, 'switching');
  baca('yan_Gardu', ringkasGarduApproval_, 'gardu');
  return perP0;
}

function getApprovalP0_(sesi, data) {
  wajibAdminP0_(sesi);
  var d = validasi_(data, {
    tanggal: { tipe: 'tanggal', wajib: true },
    status: { tipe: 'pilihan', pilihan: YAN_APPROVAL_STATUS_ }
  });
  var rows = bacaSheetYandal_(['yan_P0']).yan_P0.rows.filter(function (r) {
    return r.p0_id && String(r.status || 'AKTIF') !== 'BATAL' && tglSel_(r.Tanggal) === d.tanggal && statusApprovalP0_(r);
  });
  var jumlah = { Menunggu: 0, Approved: 0, Rejected: 0 };
  rows.forEach(function (r) { jumlah[statusApprovalP0_(r)]++; });
  var pilih = rows.filter(function (r) { return !d.status || statusApprovalP0_(r) === d.status; });
  var anak = anakApprovalP0_(pilih.filter(function (r) { return p0Switching_(r['Nama Pekerjaan']) || p0Gardu_(r['Nama Pekerjaan']); })
    .map(function (r) { return String(r.p0_id); }));
  var urut = { Menunggu: 0, Approved: 1, Rejected: 2 };
  var list = pilih.map(function (r) { return itemApprovalP0_(r, anak[String(r.p0_id)]); }).sort(function (a, b) {
    return urut[a.status] - urut[b.status] || (a.kodeP0 < b.kodeP0 ? -1 : a.kodeP0 > b.kodeP0 ? 1 : 0);
  });
  return { tanggal: d.tanggal, jumlah: jumlah, list: list };
}

// ---------------- foto ----------------

function getFotoApprovalP0_(sesi, data) {
  wajibAdminP0_(sesi);
  var d = validasi_(data, {
    p0Id: { tipe: 'uuid', wajib: true },
    jenis: { tipe: 'pilihan', wajib: true, pilihan: ['P0', 'SWITCHING', 'GARDU'] },
    id: { tipe: 'uuid' },
    slot: { tipe: 'pilihan', wajib: true, pilihan: YAN_SLOT_P0_.concat(YAN_SLOT_SWITCHING_, YAN_SLOT_GARDU_) },
    ukuran: { tipe: 'pilihan', pilihan: ['KECIL', 'PENUH'] }
  });
  var cari = function (rows, kunci, id) {
    var l = rows.filter(function (x) { return String(x[kunci]) === String(id); });
    if (l.length !== 1) throw new SisiError_(l.length ? 'DATA_GANDA' : 'DATA_TIDAK_DITEMUKAN', id);
    return l[0];
  };
  var r, kolomId;
  if (d.jenis === 'P0') {
    if (YAN_SLOT_P0_.indexOf(d.slot) === -1) throw new SisiError_('PILIHAN_TIDAK_VALID', d.slot);
    r = cari(bacaSheetYandal_(['yan_P0']).yan_P0.rows, 'p0_id', d.p0Id);
    kolomId = YAN_KOLOM_FOTO_P0_[d.slot].id;
  } else {
    if (!d.id) throw new SisiError_('FIELD_WAJIB', 'id');
    var sw = d.jenis === 'SWITCHING';
    if ((sw ? YAN_SLOT_SWITCHING_ : YAN_SLOT_GARDU_).indexOf(d.slot) === -1) throw new SisiError_('PILIHAN_TIDAK_VALID', d.slot);
    var nama = sw ? 'yan_Switching' : 'yan_Gardu';
    r = cari(bacaSheetYandal_([nama])[nama].rows, sw ? 'switching_id' : 'ukur_id', d.id);
    if (String(r.p0_id) !== d.p0Id) throw new SisiError_('DATA_TIDAK_DITEMUKAN', d.id);   // anak wajib milik P0 yang diminta
    kolomId = sw ? kolomFotoSwitching_(d.slot).id : kolomFotoGardu_(d.slot).id;
  }
  return jawabFotoYandal_(teksP0_(r[kolomId]), d.slot, d.ukuran, (metaP0_(r)[d.slot] || {}).sha256);
}

/** Isi foto Drive Yandal: KECIL = thumbnail Drive (belum ada = penuh), PENUH = bytes terverifikasi sha256 meta. */
function jawabFotoYandal_(fileId, slot, ukuran, sha256) {
  if (!fileId) throw new SisiError_('FOTO_TIDAK_ADA', slot);
  if (ukuran !== 'PENUH') {
    try {
      var th = DriveApp.getFileById(fileId).getThumbnail();
      var b = th && th.getBytes ? th.getBytes() : null;
      if (b && b.length) return { mime: 'image/jpeg', kecil: true, ukuranByte: b.length, data: Utilities.base64Encode(b) };
    } catch (eT) { /* thumbnail belum ada: kirim penuh */ }
  }
  var v = bytesFotoTerverifikasi_(fileId, sha256);
  return { mime: 'image/jpeg', kecil: false, ukuranByte: v.bytes.length, sha256: v.sha256, data: Utilities.base64Encode(v.bytes) };
}

// ---------------- v1.0.31: P0 dari WO Tindak Lanjut untuk HP tim YANDAL ----------------

/**
 * P0 hasil WO Tindak Lanjut (yan_P0 dengan foto_meta.WO, dicatat saat WO Selesai) di shift sesi, bentuk sama dengan
 * Approval P0 + temuanId / tlId WO. HP menampilkannya seperti P0 lokal (data, foto, download, kirim WA). Hanya baca.
 */
function getP0WoYandal_(sesi, data, platform) {
  wajibPetugasYandalHp_(sesi, platform);
  validasi_(data, {});
  var tb = bacaSheetYandal_(['yan_Shift', 'yan_P0']);
  var sh = shiftSesiP0_(tb.yan_Shift.rows, sesi, null).r;
  return {
    shiftId: String(sh.shift_id),
    list: tb.yan_P0.rows.filter(function (r) {
      return String(r.shift_id) === String(sh.shift_id) && String(r.status || 'AKTIF') !== 'BATAL' && metaP0_(r).WO;
    }).map(function (r) {
      var o = itemApprovalP0_(r), wo = metaP0_(r).WO || {};
      o.temuanId = teksP0_(wo.temuanId);
      o.tlId = teksP0_(wo.tlId);
      return o;
    })
  };
}

/** Foto yan_P0 (Sebelum / Pekerjaan / Sesudah) P0 dari WO milik tim sesi. */
function getFotoP0WoYandal_(sesi, data, platform) {
  wajibPetugasYandalHp_(sesi, platform);
  var d = validasi_(data, {
    p0Id: { tipe: 'uuid', wajib: true },
    slot: { tipe: 'pilihan', wajib: true, pilihan: YAN_SLOT_P0_ },
    ukuran: { tipe: 'pilihan', pilihan: ['KECIL', 'PENUH'] }
  });
  var l = bacaSheetYandal_(['yan_P0']).yan_P0.rows.filter(function (x) { return String(x.p0_id) === d.p0Id; });
  if (l.length > 1) throw new SisiError_('DATA_GANDA', d.p0Id);
  var r = l[0];
  if (!r || String(r.tim_id) !== String(sesi.timId) || !metaP0_(r).WO) throw new SisiError_('DATA_TIDAK_DITEMUKAN', d.p0Id);
  return jawabFotoYandal_(teksP0_(r[YAN_KOLOM_FOTO_P0_[d.slot].id]), d.slot, d.ukuran, (metaP0_(r)[d.slot] || {}).sha256);
}

// ---------------- keputusan + koreksi jenis ----------------

/** Baris P0 untuk diputuskan / dikoreksi admin (dalam lock). */
function barisApprovalP0_(t, p0Id, revision) {
  var l = t.yan_P0.rows.filter(function (x) { return String(x.p0_id) === p0Id; });
  if (!l.length) throw new SisiError_('DATA_TIDAK_DITEMUKAN', p0Id);
  if (l.length > 1) throw new SisiError_('DATA_GANDA', p0Id);
  var r = l[0];
  if (String(r.status || 'AKTIF') === 'BATAL') throw new SisiError_('SUDAH_BATAL', p0Id);
  if (teksP0_(r['Status P0']) !== 'SELESAI') throw new SisiError_('P0_BELUM_SELESAI', teksP0_(r['Kode P0']));
  if (revision !== undefined && Number(r.revision) !== revision) throw new SisiError_('DATA_BERUBAH', teksP0_(r['Kode P0']));
  return r;
}

/** Kolom point (Skor Durasi, Pengali, Point) untuk status + bobot + nama pekerjaan. */
function kolomPointApproval_(r, status, bobot, nama) {
  var h = hitungPointP0_({ statusP0: 'SELESAI', statusApproval: status, durasiMenit: r['Durasi (menit)'], bobot: bobot,
                           namaPekerjaan: nama, dibuatMs: waktuP0Ms_(r, 'DIBUAT', 'Waktu Dibuat') });
  var menit = r['Durasi (menit)'];
  return { 'Skor Durasi': menit === '' || menit === null || menit === undefined ? '' : h.skorDurasi, Pengali: h.pengali,
           Point: status === 'Approved' ? h.point : (status === 'Rejected' ? 0 : '') };
}

function simpanApprovalP0_(sesi, data, platform) {
  wajibAdminP0_(sesi);
  var d = validasi_(data, {
    p0Id: { tipe: 'uuid', wajib: true },
    keputusan: { tipe: 'pilihan', wajib: true, pilihan: ['Approved', 'Rejected'] },
    alasan: { tipe: 'teks', maks: 300, multiBaris: true, maksBaris: 5 },
    bobot: { tipe: 'angka', min: 0, max: 100 },
    revision: { tipe: 'angka', bulat: true, min: 0 }
  });
  if (d.keputusan === 'Rejected' && !d.alasan) throw new SisiError_('FIELD_WAJIB', 'alasan');
  var sekarangMs = sekarangMsYandal_();
  return denganLock_(function () {
    var t = bacaSheetYandal_(['yan_P0']);
    var logT = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var r = barisApprovalP0_(t, d.p0Id, d.revision);
    var nama = teksP0_(r['Nama Pekerjaan']);
    // Lain - Lain: bobot isian admin; keputusan ulang tanpa bobot baru = bobot yang sudah tersimpan
    var bobot = bobotApprovalP0_(nama, r.Bobot, d.bobot !== undefined ? d.bobot : r.Bobot, d.keputusan);
    var u = Object.assign({
      'Status Approval': d.keputusan, 'Alasan Rejected': d.keputusan === 'Rejected' ? d.alasan : '',
      'Approved Oleh': sesi.nama || sesi.username, 'Waktu Approve': waktuWib_(sekarangMs, true),
      'Timestamp Update': new Date(sekarangMs).toISOString(), diubah_oleh: sesi.userId
    }, kolomPointApproval_(r, d.keputusan, bobot, nama));
    if (pekerjaanLainP0_(nama) && d.keputusan === 'Approved') u.Bobot = bobot;
    tulisBlok_(t.yan_P0, [{ r: r, u: u }], []);
    auditLog_(sesi, 'APPROVAL_P0', teksP0_(r['Kode P0']), d.keputusan + (d.alasan ? ': ' + d.alasan : '') + ' point ' + u.Point, platform, logT);
    rekapShiftId_([r.shift_id], sekarangMs, sesi.userId);
    return itemApprovalP0_(r, anakApprovalP0_([String(r.p0_id)])[String(r.p0_id)]);
  });
}

function ubahJenisP0_(sesi, data, platform) {
  wajibAdminP0_(sesi);
  var d = validasi_(data, {
    p0Id: { tipe: 'uuid', wajib: true },
    namaPekerjaan: { tipe: 'teks', wajib: true, maks: 100 },
    pekerjaanLainnya: { tipe: 'teks', maks: 100 },
    alasan: { tipe: 'teks', wajib: true, maks: 300, multiBaris: true, maksBaris: 5 },
    bobot: { tipe: 'angka', min: 0, max: 100 },
    revision: { tipe: 'angka', bulat: true, min: 0 }
  });
  var jenis = jenisP0_(d.namaPekerjaan, d.pekerjaanLainnya || '');   // wajib dari master (bobot ikut master)
  var sekarangMs = sekarangMsYandal_();
  return denganLock_(function () {
    var t = bacaSheetYandal_(['yan_P0']);
    var logT = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var r = barisApprovalP0_(t, d.p0Id, d.revision);
    if (ditolakSistemP0_(r)) throw new SisiError_('P0_DITOLAK_SISTEM', teksP0_(r['Kode P0']));
    var lamaNama = teksP0_(r['Nama Pekerjaan']), lamaLain = teksP0_(r['Pekerjaan Lainnya']);
    var baruLain = jenis.nama === YAN_PEKERJAAN_LAIN_ ? (d.pekerjaanLainnya || '') : '';
    if (lamaNama === jenis.nama && lamaLain === baruLain) return itemApprovalP0_(r, anakApprovalP0_([String(r.p0_id)])[String(r.p0_id)]);
    var status = statusApprovalP0_(r);
    var bobot = jenis.bobot;
    if (jenis.nama === YAN_PEKERJAAN_LAIN_) {
      // Lain - Lain: bobot dari admin. Sudah Approved = wajib diisi sekarang (point dihitung ulang), Menunggu = saat approval.
      bobot = d.bobot !== undefined ? bulat_(d.bobot, 2) : '';
      if (status === 'Approved' && bobot === '') throw new SisiError_('FIELD_WAJIB', 'bobot (Lain - Lain diisi admin)');
    }
    var meta = metaP0_(r);
    var riwayat = Array.isArray(meta.KOREKSI_JENIS) ? meta.KOREKSI_JENIS : [];
    riwayat.push({ dari: lamaLain ? lamaNama + ' (' + lamaLain + ')' : lamaNama, ke: baruLain ? jenis.nama + ' (' + baruLain + ')' : jenis.nama,
                   oleh: sesi.nama || sesi.username, waktu: waktuWib_(sekarangMs, true), alasan: d.alasan });
    meta.KOREKSI_JENIS = riwayat.slice(-10);
    var u = { 'Nama Pekerjaan': jenis.nama, 'Pekerjaan Lainnya': baruLain, Bobot: bobot, jenis_id: jenis.jenisId,
              foto_meta: JSON.stringify(meta), 'Timestamp Update': new Date(sekarangMs).toISOString(), diubah_oleh: sesi.userId };
    var pt = kolomPointApproval_(r, status, bobot, jenis.nama);
    u.Pengali = pt.Pengali;
    if (status === 'Approved') { u.Point = pt.Point; u['Skor Durasi'] = pt['Skor Durasi']; }
    tulisBlok_(t.yan_P0, [{ r: r, u: u }], [], { bolehId: ['jenis_id'] });
    auditLog_(sesi, 'UBAH_JENIS_P0', teksP0_(r['Kode P0']), riwayat[riwayat.length - 1].dari + ' > ' + riwayat[riwayat.length - 1].ke + ': ' + d.alasan, platform, logT);
    rekapShiftId_([r.shift_id], sekarangMs, sesi.userId);
    return itemApprovalP0_(r, anakApprovalP0_([String(r.p0_id)])[String(r.p0_id)]);
  });
}
