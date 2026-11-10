/**
 * v1.0.57 Gudang Material: endpoint petugas YANDAL (menu OPS_STOK_MATERIAL, HP).
 * Awal tiap shift petugas memasukkan MCB yang ada satu per satu + satu foto; server membandingkannya dengan saldo tim (buku mutasi).
 * Sama = COCOK, boleh memakai material. Beda = MENUNGGU_ADMIN: pemakaian diblokir sampai admin menyelesaikan selisih
 * (kecuali pemakaian susulan). Tim selalu dari sesi, tidak pernah dari isian. Tahap pertama: hanya material MCB.
 */

/** Petugas YANDAL dengan tim. Dicek paling awal; tim diambil dari sesi. */
function wajibPetugasGudang_(sesi) {
  if (!sesi || sesi.role !== 'PETUGAS' || sesi.jenisTim !== 'YANDAL' || !sesi.timId) throw new SisiError_('AKSES_DITOLAK', 'stok material khusus petugas Yandal');
  return { timId: String(sesi.timId) };
}

/** Baris db_Material aktif bernama MCB (tahap pertama; tabel pemeriksaan / selisih / pemakaian tidak punya kolom material_id). */
function materialMcb_() {
  var m = tabelMaterialHartek_().rows.filter(function (r) { return r.material_id && isAktif_(r.aktif) && String(r.nama_material || '').trim().toUpperCase() === GUD_MATERIAL_MCB_; })[0];
  if (!m) throw new SisiError_('MATERIAL_TIDAK_VALID', GUD_MATERIAL_MCB_);
  return m;
}

function mcbBolehTim_(timId, mcbId) {
  return materialUntukTim_(timId).some(function (m) { return String(m.material_id) === String(mcbId); });
}

/** Saldo tim hanya untuk material MCB. */
function saldoMcbTim_(mutasiRows, timId, mcbId) {
  var saldo = saldoLokasi_(mutasiRows, timId), hasil = {};
  Object.keys(saldo).forEach(function (k) { if (k.split('|')[0] === String(mcbId)) hasil[k] = saldo[k]; });
  return hasil;
}

function shiftGudang_() {
  var s = shiftYandal_(sekarangMsGud_());
  return { tanggal: s.tanggal, no: s.no, kunci: s.kunci, mulai: s.mulai };
}

/** Pemeriksaan terakhir tim pada shift itu (nomor baris terbesar); dikembalikan admin lalu dikirim ulang = baris baru, yang terakhir berlaku. */
function pemeriksaanTerakhir_(rows, timId, tanggal, no) {
  var hasil = null;
  rows.forEach(function (r) {
    if (String(r.tim_id) !== String(timId) || tglSel_(r.tanggal) !== tanggal || Number(r.shift) !== no) return;
    if (!hasil || Number(r.No) > Number(hasil.No)) hasil = r;
  });
  return hasil;
}

function selisihKeJson_(r) {
  return { selisihId: String(r.selisih_id), daya: String(r.daya), merk: String(r.merk), statusMcb: String(r.status_mcb),
    jumlahPerkiraan: Number(r.jumlah_perkiraan), jumlahInput: Number(r.jumlah_input), selisih: Number(r.selisih), arah: String(r.arah),
    status: String(r.status), caraPenyelesaian: String(r.cara_penyelesaian || '') };
}

function hasilPemeriksaan_(pr, selisihRows) {
  return { pemeriksaanId: String(pr.pemeriksaan_id), status: String(pr.status),
    selisih: selisihRows.filter(function (s) { return String(s.pemeriksaan_id) === String(pr.pemeriksaan_id); }).map(selisihKeJson_) };
}

function getStokYandal_(sesi, data) {
  wajibPetugasGudang_(sesi);
  var tim = String(sesi.timId);
  wajibKonfigGudang_();
  validasi_(data, {});
  var shift = shiftGudang_();
  var pr = pemeriksaanTerakhir_(tabelGudang_('db_Stok_Pemeriksaan').rows, tim, shift.tanggal, shift.no);
  var pemeriksaan = pr ? hasilPemeriksaan_(pr, tabelGudang_('db_Stok_Selisih').rows) : null;
  var material = materialUntukTim_(tim).map(function (m) { return { materialId: String(m.material_id), nama: String(m.nama_material).trim() }; });
  var saldo = [];
  try {
    var mcb = materialMcb_();
    if (mcbBolehTim_(tim, mcb.material_id)) saldo = daftarJenis_(saldoMcbTim_(tabelGudang_('db_Material_Mutasi').rows, tim, mcb.material_id));
  } catch (e) { if (!e || e.kode !== 'MATERIAL_TIDAK_VALID') throw e; }
  return { shift: { tanggal: shift.tanggal, no: shift.no, kunci: shift.kunci }, pemeriksaan: pemeriksaan, saldo: saldo,
    pilihan: { material: material }, merkMcb: daftarMerkMcb_(), keperluanMcb: daftarKeperluanMcb_(), bolehPakai: !!pr && ['COCOK', 'DISETUJUI'].indexOf(String(pr.status)) !== -1,
    jenisTersedia: saldo.filter(function (s) { return s.jumlah > 0; }) };
}

/**
 * Pemeriksaan awal shift. data: { item: [{daya, merk, statusMcb}] (satu elemen per MCB, maks 500), foto }.
 * Kunci = tim (sesi) + tanggal + nomor shift (jam server): kirim ulang / rekan satu tim = hasil pemeriksaan pertama, tidak menggandakan.
 */
function simpanPemeriksaanStok_(sesi, data, platform) {
  wajibPetugasGudang_(sesi);
  var tim = String(sesi.timId);
  wajibKonfigGudang_();
  var p = pisahFoto_(data);
  Object.keys(p.sisa).forEach(function (k) { if (k !== 'item') throw new SisiError_('FIELD_TIDAK_DIKENAL', k); });
  if (p.sisa.item === undefined || p.sisa.item === null) throw new SisiError_('FIELD_WAJIB', 'item');
  if (!Array.isArray(p.sisa.item)) throw new SisiError_('TIPE_SALAH', 'item');
  if (p.sisa.item.length > GUD_ITEM_MAKS_) throw new SisiError_('TERLALU_BANYAK', 'item');
  var skemaItem = skemaJenisMcb_();
  delete skemaItem.materialId;
  var merkMaster = daftarMerkMcb_();
  var items = p.sisa.item.map(function (x) { var i = validasi_(x, skemaItem); i.merk = merkBakuMcb_(i.merk, merkMaster); return i; });
  var bytes = bacaFotoGudang_(p.foto, true);
  var mcb = materialMcb_(), mcbId = String(mcb.material_id);
  if (!mcbBolehTim_(tim, mcbId)) throw new SisiError_('MATERIAL_TIDAK_DIIZINKAN', GUD_MATERIAL_MCB_);
  return denganLock_(function () {
    var shift = shiftGudang_();
    var tp = tabelGudang_('db_Stok_Pemeriksaan'), ts = tabelGudang_('db_Stok_Selisih');
    var ada = pemeriksaanTerakhir_(tp.rows, tim, shift.tanggal, shift.no);
    if (ada && String(ada.status) !== 'DIKEMBALIKAN') return hasilPemeriksaan_(ada, ts.rows);

    var perkiraan = saldoMcbTim_(tabelGudang_('db_Material_Mutasi').rows, tim, mcbId), hitungan = {};
    items.forEach(function (i) {
      var k = kunciJenis_({ material_id: mcbId, daya: i.daya, merk: i.merk, status_mcb: i.statusMcb });
      hitungan[k] = (hitungan[k] || 0) + 1;
    });
    var beda = bandingStok_(perkiraan, hitungan);
    var id = uuid_(), status = beda.length ? 'MENUNGGU_ADMIN' : 'COCOK', ms = sekarangMsGud_(), waktu = waktuWib_(ms, true);
    var foto = simpanFotoGudang_(bytes, ['Stok', shift.tanggal, 'Shift ' + shift.no], id + '-STOK', id + '_STOK.jpg');
    var jumlah = function (peta) { return Object.keys(peta).reduce(function (a, k) { return a + peta[k]; }, 0); };

    tulisBlok_(tp, [], [{ No: noBaris_(tp, 0), pemeriksaan_id: id, tanggal: shift.tanggal, tim_id: tim, shift: shift.no, petugas_id: sesi.userId, waktu_input: waktu,
      total_input: jumlah(hitungan), total_perkiraan: jumlah(perkiraan), status: status, foto_stok: foto.fileId, link_foto_stok: foto.link,
      revision: 1, diubah_pada: '', diubah_oleh: '' }]);
    var ti = tabelGudang_('db_Stok_Pemeriksaan_Item'), kunci = {};
    Object.keys(perkiraan).concat(Object.keys(hitungan)).forEach(function (k) { kunci[k] = true; });
    var urut = Object.keys(kunci).sort();
    tulisBlok_(ti, [], urut.map(function (k, n) {
      var j = jenisDariKunci_(k, 0), i = hitungan[k] || 0, pk = perkiraan[k] || 0;
      return { No: noBaris_(ti, n), item_id: uuid_(), pemeriksaan_id: id, daya: j.daya, merk: j.merk, status_mcb: j.statusMcb, jumlah_input: i, jumlah_perkiraan: pk, selisih: i - pk };
    }));
    if (beda.length) {
      tulisBlok_(ts, [], beda.map(function (b, n) {
        var j = jenisDariKunci_(b.kunci, 0);
        return { No: noBaris_(ts, n), selisih_id: uuid_(), pemeriksaan_id: id, tim_id: tim, daya: j.daya, merk: j.merk, status_mcb: j.statusMcb, jumlah_perkiraan: b.perkiraan,
          jumlah_input: b.input, selisih: b.selisih, arah: b.arah, status: 'MENUNGGU', cara_penyelesaian: '', pemakaian_id: '', catatan_admin: '', diselesaikan_oleh: '', diselesaikan_pada: '' };
      }));
    }
    auditLog_(sesi, 'GUDANG_PERIKSA', 'db_Stok_Pemeriksaan', shift.tanggal + ' shift ' + shift.no + ': ' + status + ' (input ' + jumlah(hitungan) + ', perkiraan ' + jumlah(perkiraan) + ')',
      platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { pemeriksaanId: id, status: status, selisih: beda.length ? hasilPemeriksaan_({ pemeriksaan_id: id, status: status }, tabelGudang_('db_Stok_Selisih').rows).selisih : [] };
  });
}
