/**
 * WO tindak lanjut, Selesai: pekerjaan WO masuk realisasi tim (ROW / HARTEK / YANDAL) + salinan foto ke folder tim.
 * Review 8 Nov 2026: dipecah dari 56_TindakLanjut.js (isi fungsi tidak berubah). Konstanta WO_*, peran, dan helper
 * bersama tetap di 56_TindakLanjut.js; Apps Script memuat semua file ke satu ruang global.
 */

/* ===== Selesai: masuk realisasi tim ===== */

/**
 * v1.0.28 (permintaan Master Guswan 23 Okt 2026): foto WO tetap di folder temuan (FOTO_TEMUAN_FOLDER_ID / Tindak Lanjut WO)
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
    // v1.0.29 (permintaan Master Guswan 24 Okt 2026): koordinat P0 = GPS foto Sebelum, koordinat closing = GPS foto Sesudah (HP
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

