/**
 * WO tindak lanjut, sisi PETUGAS tim (menu OPS_WO_TIM): daftar WO tim, mulai / klaim, catat pekerjaan + foto.
 * Review 8 Nov 2026: dipecah dari 56_TindakLanjut.js (isi fungsi tidak berubah). Konstanta WO_*, peran, dan helper
 * bersama tetap di 56_TindakLanjut.js; Apps Script memuat semua file ke satu ruang global.
 */

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
      mh.material = materialUntukTim_(sesi.timId).filter(function (r) { return teksWo_(r.nama_material); })   // v1.0.57: izin material per tim

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
  var tlPer = perTemuanWo_(rowsTl), gPer = perTemuanWo_(rowsG);
  return {
    jenisTim: sesi.jenisTim, laporanUtamaAda: siapRealisasiWo_(sesi), slotWajib: WO_SLOT_WAJIB_[sesi.jenisTim].slice(),
    master: masterPekerjaanWo_(sesi, rows), wo: rows.map(function (t) {
      var o = woKeHp_(t, tlPer[String(t.temuan_id)], sesi.timId);
      var g = klaim[String(t.temuan_id)];
      var lain = (gPer[String(t.temuan_id)] || []).some(function (x) { return gandaAktifWo_(x) && String(x.tim_id) !== String(sesi.timId); });
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
function bacaRincianWo_(teks, jenisPg, timId) {
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
  var master = jumlahMt ? materialUntukTim_(timId).filter(function (r) { return teksWo_(r.nama_material); }) : [];   // v1.0.57: izin material per tim
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
      var rc = d.rincian ? bacaRincianWo_(d.rincian, jenisPgWo_(t), sesi.timId) : null;
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
 * v1.0.26 (permintaan Master Guswan 23 Okt 2026): ubah pekerjaan WO (ROW / Hartek / Yandal) yang masih DRAFT, sesudah foto
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

/** Foto pekerjaan WO (slot SEBELUM / PEKERJAAN / SESUDAH). Folder FOTO_TEMUAN_FOLDER_ID / Tindak Lanjut WO / <tgl> / <kode temuan>. */
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
  var folderId = folderFotoTemuan_();
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

