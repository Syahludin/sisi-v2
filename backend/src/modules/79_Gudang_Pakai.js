/**
 * v1.0.57 Gudang Material: pemakaian MCB oleh petugas YANDAL (menu OPS_STOK_MATERIAL).
 * Pemakaian = satu baris db_Pemakaian_MCB + mutasi PAKAI (-1) di tim. Hanya boleh sesudah pemeriksaan awal shift COCOK / DISETUJUI.
 * Pemakaian susulan: MCB yang hilang dari hitungan karena petugas sebelumnya lupa mencatat; dicatat atas nama shift dan petugas
 * sebelumnya, menutup selisih KURANG tanpa menunggu admin.
 */

/** { kode, petugasIds } dari yan_Shift tim pada tanggal + nomor shift, atau null bila shift itu tidak pernah dimulai. */
function kodeShiftTim_(timId, tanggal, no) {
  var rows = bacaSheetYandal_(['yan_Shift']).yan_Shift.rows;
  var r = rows.filter(function (x) {
    return String(x.tim_id) === String(timId) && tglSel_(x.Tanggal) === tanggal && Number(x.Shift) === no && String(x.status || '').toUpperCase() !== 'BATAL';
  })[0];
  if (!r) return null;
  return { kode: String(r['Kode Shift']), petugasIds: [r.petugas_id_1, r.petugas_id_2].map(function (v) { return String(v || '').trim(); }).filter(function (v) { return v; }) };
}

function skemaPakai_(tambahan) {
  return Object.assign({ pemakaianId: { tipe: 'uuid', wajib: true }, nomorMeter: { tipe: 'teks', wajib: true, maks: 30 }, keperluan: { tipe: 'teks', wajib: true, maks: 200 } }, tambahan);
}

/** Baris db_Pemakaian_MCB + mutasi PAKAI -1 (tim). Dipanggil di dalam lock; [t] = tabelGudang_('db_Pemakaian_MCB') yang sudah dibaca. */
function tulisPemakaian_(sesi, t, tm, o) {
  var nomor = nomorPemakaianBerikut_(o.kode, t.rows.map(function (r) { return r.nomor_pemakaian; }));
  var waktu = waktuWib_(sekarangMsGud_(), true);
  tulisBlok_(t, [], [{ No: noBaris_(t, 0), pemakaian_id: o.pemakaianId, nomor_pemakaian: nomor, tanggal: o.tanggal, waktu: waktu, tim_id: o.timId, shift: o.shift,
    nomor_meter: o.nomorMeter, daya: o.daya, merk_mcb: o.merk, keperluan: o.keperluan, petugas_id: o.petugasIds.join(','), status_mcb: o.statusMcb,
    foto_penggunaan: o.foto.fileId, link_foto: o.foto.link, jenis_catatan: o.jenisCatatan, diisi_oleh: sesi.userId, diisi_pada: waktu, revision: 1,
    diubah_pada: '', diubah_oleh: '' }]);
  tulisMutasi_(sesi, tm, [{ jenis_mutasi: 'PAKAI', lokasi: o.timId, material_id: o.materialId, daya: o.daya, merk: o.merk, status_mcb: o.statusMcb, jumlah: -1,
    ref_jenis: 'PEMAKAIAN', ref_id: o.pemakaianId, catatan: o.nomorMeter, foto: o.foto.fileId, link_foto: o.foto.link }]);
  return nomor;
}

function pemakaianAda_(rows, id) {
  return rows.filter(function (r) { return String(r.pemakaian_id) === String(id); })[0] || null;
}

/** Pemakaian di shift berjalan. data: { pemakaianId, daya, merk, statusMcb, nomorMeter, keperluan, foto (wajib) }. */
function simpanPemakaianMcb_(sesi, data, platform) {
  wajibPetugasGudang_(sesi);
  var tim = String(sesi.timId);
  wajibKonfigGudang_();
  var skema = skemaJenisMcb_();
  delete skema.materialId;
  var p = pisahFoto_(data);
  var d = validasi_(p.sisa, Object.assign(skema, skemaPakai_({})));
  d.keperluan = keperluanBakuMcb_(d.keperluan);   // keperluan dari master (db_Keperluan_MCB) bila sudah diisi
  var bytes = bacaFotoGudang_(p.foto, true);
  var mcb = materialMcb_(), mcbId = String(mcb.material_id);
  if (!mcbBolehTim_(tim, mcbId)) throw new SisiError_('MATERIAL_TIDAK_DIIZINKAN', GUD_MATERIAL_MCB_);
  return denganLock_(function () {
    var t = tabelGudang_('db_Pemakaian_MCB');
    var ada = pemakaianAda_(t.rows, d.pemakaianId);
    if (ada) return { pemakaianId: d.pemakaianId, nomorPemakaian: String(ada.nomor_pemakaian), duplikat: true };
    var shift = shiftGudang_();
    var pr = pemeriksaanTerakhir_(tabelGudang_('db_Stok_Pemeriksaan').rows, tim, shift.tanggal, shift.no);
    if (!pr) throw new SisiError_('PEMERIKSAAN_BELUM_ADA');
    if (['COCOK', 'DISETUJUI'].indexOf(String(pr.status)) === -1) throw new SisiError_('SELISIH_MENUNGGU');
    var ks = kodeShiftTim_(tim, shift.tanggal, shift.no);
    if (!ks) throw new SisiError_('SHIFT_BELUM_DIMULAI');
    var tm = tabelGudang_('db_Material_Mutasi');
    var k = kunciJenis_({ material_id: mcbId, daya: d.daya, merk: d.merk, status_mcb: d.statusMcb });
    if ((saldoMcbTim_(tm.rows, tim, mcbId)[k] || 0) < 1) throw new SisiError_('STOK_TIDAK_CUKUP');
    var foto = simpanFotoGudang_(bytes, ['Pemakaian', shift.tanggal, 'Shift ' + shift.no], d.pemakaianId + '-PAKAI', d.pemakaianId + '_PAKAI.jpg');
    var nomor = tulisPemakaian_(sesi, t, tm, { kode: ks.kode, pemakaianId: d.pemakaianId, tanggal: shift.tanggal, shift: shift.no, timId: tim, materialId: mcbId, daya: d.daya,
      merk: d.merk, statusMcb: d.statusMcb, nomorMeter: d.nomorMeter, keperluan: d.keperluan, petugasIds: ks.petugasIds, foto: foto, jenisCatatan: 'NORMAL' });
    auditLog_(sesi, 'GUDANG_PAKAI', nomor, d.nomorMeter + ' ' + d.daya + ' ' + d.merk + ' ' + d.statusMcb, platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { pemakaianId: d.pemakaianId, nomorPemakaian: nomor, duplikat: false };
  });
}

/**
 * Inti pemakaian susulan (dipakai petugas dan admin): tulis pemakaian atas nama shift [lalu] + mutasi PAKAI, kurangi selisih satu;
 * nol = SELESAI (SUSULAN); bila semua selisih pemeriksaan selesai, pemeriksaan DISETUJUI. Dipanggil di dalam lock, semua tabel sudah dibaca.
 * c: { t (pemakaian), ts (selisih), tp (pemeriksaan), tm (mutasi), s (baris selisih), pr (baris pemeriksaan), ks, lalu, mcbId, pemakaianId, nomorMeter, keperluan, bytes, platform }.
 */
function terapkanSusulan_(sesi, c) {
  var s = c.s;
  var foto = simpanFotoGudang_(c.bytes, ['Pemakaian', c.lalu.tanggal, 'Shift ' + c.lalu.no], c.pemakaianId + '-SUSULAN', c.pemakaianId + '_SUSULAN.jpg');
  var nomor = tulisPemakaian_(sesi, c.t, c.tm, { kode: c.ks.kode, pemakaianId: c.pemakaianId, tanggal: c.lalu.tanggal, shift: c.lalu.no, timId: String(s.tim_id), materialId: c.mcbId,
    daya: String(s.daya), merk: String(s.merk), statusMcb: String(s.status_mcb), nomorMeter: c.nomorMeter, keperluan: c.keperluan, petugasIds: c.ks.petugasIds, foto: foto,
    jenisCatatan: 'SUSULAN' });
  var perkiraan = Number(s.jumlah_perkiraan) - 1, selisih = Number(s.jumlah_input) - perkiraan, selesai = selisih === 0, sekarang = waktuWib_(sekarangMsGud_(), true);
  var u = { jumlah_perkiraan: perkiraan, selisih: selisih, pemakaian_id: c.pemakaianId };
  if (selesai) { u.status = 'SELESAI'; u.cara_penyelesaian = 'SUSULAN'; u.diselesaikan_oleh = sesi.userId; u.diselesaikan_pada = sekarang; if (c.catatan) u.catatan_admin = c.catatan; }
  tulisBlok_(c.ts, [{ r: s, u: u }], [], { bolehId: ['pemakaian_id'] });
  var statusPr = String(c.pr.status);
  var semuaSelesai = c.ts.rows.filter(function (r) { return String(r.pemeriksaan_id) === String(c.pr.pemeriksaan_id); }).every(function (r) { return String(r.status) === 'SELESAI'; });
  if (selesai && semuaSelesai) {
    tulisBlok_(c.tp, [{ r: c.pr, u: { status: 'DISETUJUI', diubah_pada: sekarang, diubah_oleh: sesi.userId } }], []);
    statusPr = 'DISETUJUI';
  }
  auditLog_(sesi, 'GUDANG_SUSULAN', nomor, c.nomorMeter + ' selisih ' + selisih, c.platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
  return { nomor: nomor, statusPemeriksaan: statusPr };
}

/**
 * Pemakaian susulan untuk satu MCB pada selisih KURANG (satu panggilan = satu MCB). Jenis MCB diambil dari baris selisih.
 * data: { pemakaianId, selisihId, nomorMeter, keperluan, foto? }. Selisih berkurang satu; nol = SELESAI (cara SUSULAN) dan bila semua
 * selisih pemeriksaan selesai, pemeriksaan DISETUJUI (petugas langsung boleh memakai material).
 */
function simpanPemakaianSusulan_(sesi, data, platform) {
  wajibPetugasGudang_(sesi);
  var tim = String(sesi.timId);
  wajibKonfigGudang_();
  var p = pisahFoto_(data);
  var d = validasi_(p.sisa, skemaPakai_({ selisihId: { tipe: 'uuid', wajib: true } }));
  d.keperluan = keperluanBakuMcb_(d.keperluan);
  var bytes = bacaFotoGudang_(p.foto, false);
  var mcb = materialMcb_(), mcbId = String(mcb.material_id);
  return denganLock_(function () {
    var t = tabelGudang_('db_Pemakaian_MCB');
    var ada = pemakaianAda_(t.rows, d.pemakaianId);
    if (ada) return { pemakaianId: d.pemakaianId, nomorPemakaian: String(ada.nomor_pemakaian), duplikat: true };
    var ts = tabelGudang_('db_Stok_Selisih');
    var s = ts.rows.filter(function (r) { return String(r.selisih_id) === d.selisihId; })[0];
    if (!s) throw new SisiError_('SELISIH_TIDAK_DITEMUKAN');
    if (String(s.tim_id) !== tim) throw new SisiError_('BUKAN_MILIK_TIM', 'selisih');
    var shift = shiftGudang_();
    var tp = tabelGudang_('db_Stok_Pemeriksaan');
    var pr = pemeriksaanTerakhir_(tp.rows, tim, shift.tanggal, shift.no);
    if (!pr || String(pr.pemeriksaan_id) !== String(s.pemeriksaan_id) || String(s.arah) !== 'KURANG' || String(s.status) !== 'MENUNGGU') throw new SisiError_('SELISIH_TIDAK_VALID');
    var lalu = shiftYandal_(shift.mulai - 1);
    var ks = kodeShiftTim_(tim, lalu.tanggal, lalu.no);
    if (!ks) throw new SisiError_('SHIFT_SEBELUMNYA_TIDAK_ADA');
    var tm = tabelGudang_('db_Material_Mutasi');
    var k = kunciJenis_({ material_id: mcbId, daya: s.daya, merk: s.merk, status_mcb: s.status_mcb });
    if ((saldoMcbTim_(tm.rows, tim, mcbId)[k] || 0) < 1) throw new SisiError_('STOK_TIDAK_CUKUP');
    var h = terapkanSusulan_(sesi, { t: t, ts: ts, tp: tp, tm: tm, s: s, pr: pr, ks: ks, lalu: lalu, mcbId: mcbId, pemakaianId: d.pemakaianId,
      nomorMeter: d.nomorMeter, keperluan: d.keperluan, bytes: bytes, platform: platform });
    return { pemakaianId: d.pemakaianId, nomorPemakaian: h.nomor, duplikat: false, selisih: selisihKeJson_(s), pemeriksaanStatus: h.statusPemeriksaan };
  });
}
