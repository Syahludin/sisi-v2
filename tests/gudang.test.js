const test = require('node:test');
const assert = require('node:assert');
const { buatKonteks } = require('./harness');
const { PROPS, U, j, kodeError, siapkanGudang } = require('./gudangUji');

const KOLOM_SPEC = {
  db_Material_Mutasi: 'No,mutasi_id,waktu,jenis_mutasi,lokasi,material_id,daya,merk,status_mcb,jumlah,ref_jenis,ref_id,catatan,foto,link_foto,dibuat_oleh,dibuat_pada',
  db_Stok_Pemeriksaan: 'No,pemeriksaan_id,tanggal,tim_id,shift,petugas_id,waktu_input,total_input,total_perkiraan,status,foto_stok,link_foto_stok,revision,diubah_pada,diubah_oleh',
  db_Stok_Pemeriksaan_Item: 'No,item_id,pemeriksaan_id,daya,merk,status_mcb,jumlah_input,jumlah_perkiraan,selisih',
  db_Pemakaian_MCB: 'No,pemakaian_id,nomor_pemakaian,tanggal,waktu,tim_id,shift,nomor_meter,daya,merk_mcb,keperluan,petugas_id,status_mcb,foto_penggunaan,link_foto,jenis_catatan,diisi_oleh,diisi_pada,revision,diubah_pada,diubah_oleh',
  db_Stok_Selisih: 'No,selisih_id,pemeriksaan_id,tim_id,daya,merk,status_mcb,jumlah_perkiraan,jumlah_input,selisih,arah,status,cara_penyelesaian,pemakaian_id,catatan_admin,diselesaikan_oleh,diselesaikan_pada',
  db_Material_LogKoreksi: 'No,log_id,waktu,jenis_objek,objek_id,kolom,nilai_lama,nilai_baru,alasan,oleh'
};

// ---------- Tugas 1: skema, konfigurasi, alat penyiapan ----------
test('gudang: header skema persis spec, kolom pertama No', () => {
  const x = siapkanGudang();
  Object.keys(KOLOM_SPEC).forEach((n) => {
    assert.strictEqual(x.g.GUD_HEADER_[n].join(','), KOLOM_SPEC[n], n);
    assert.strictEqual(x.g.GUD_HEADER_[n][0], 'No');
    assert.strictEqual(x.g.skemaHeader_().GUDANG_SHEET_ID[n].join(','), KOLOM_SPEC[n], 'skemaHeader_ ' + n);
  });
  assert.strictEqual(x.g.GUD_IZIN_HEADER_.join(','), 'No,izin_id,material_id,tim_id,aktif,revision,diubah_pada,diubah_oleh');
  assert.strictEqual(x.g.skemaHeader_().MASTER_SHEET_ID.db_Material_Tim.join(','), x.g.GUD_IZIN_HEADER_.join(','));
});

test('gudang: wajibKonfigGudang_ menolak GUDANG_SHEET_ID kosong dengan CONFIG_TIDAK_LENGKAP, tabelGudang_ menolak header salah', () => {
  const g0 = buatKonteks(PROPS);
  assert.strictEqual(kodeError(() => g0.wajibKonfigGudang_()), 'CONFIG_TIDAK_LENGKAP');
  const x = siapkanGudang();
  assert.doesNotThrow(() => x.g.tabelGudang_('db_Pemakaian_MCB'));
  x.sheets.g.db_Pemakaian_MCB.data[0][2] = 'salah';
  assert.strictEqual(kodeError(() => x.g.tabelGudang_('db_Pemakaian_MCB')), 'CONFIG_TIDAK_VALID');
});

test('gudang: noBaris_ = nomor urut baris data berikutnya', () => {
  const x = siapkanGudang();
  const t = x.g.tabelGudang_('db_Material_Mutasi');
  assert.strictEqual(x.g.noBaris_(t, 0), 1);
  assert.strictEqual(x.g.noBaris_(t, 2), 3);
});

test('gudang: ADMIN_siapkanSheetGudang membuat sheet, MCB dan izin Yandal 13-17, idempoten', () => {
  const x = siapkanGudang({ izin: false, mcb: false });
  x.g.pastikanPemilik_ = () => {};
  Object.keys(x.sheets.g).forEach((n) => delete x.sheets.g[n]);
  delete x.sheets.m.db_Material_Tim;
  assert.strictEqual(x.g.ADMIN_siapkanSheetGudang(), 0);
  Object.keys(KOLOM_SPEC).forEach((n) => assert.strictEqual(x.sheets.g[n].data[0].join(','), KOLOM_SPEC[n], n));
  const mcb = x.sheets.m.db_Material.data.filter((r) => String(r[1]).toUpperCase() === 'MCB');
  assert.strictEqual(mcb.length, 1);
  assert.strictEqual(mcb[0][2], 'unit');
  const izin = x.sheets.m.db_Material_Tim.data.slice(1);
  assert.strictEqual(izin.length, 2, 'hanya Yandal 13 dan 14 yang ada di db_Tim');
  assert.deepStrictEqual(izin.map((r) => r[3]).sort(), [x.tim.y13, x.tim.y14].sort());
  assert.deepStrictEqual(izin.map((r) => r[0]), [1, 2], 'kolom No terisi berurutan');
  assert.strictEqual(x.g.ADMIN_siapkanSheetGudang(), 0);
  assert.strictEqual(x.sheets.m.db_Material.data.filter((r) => String(r[1]).toUpperCase() === 'MCB').length, 1);
  assert.strictEqual(x.sheets.m.db_Material_Tim.data.length, 3, 'diulang tidak menggandakan');
  assert.strictEqual(x.g.ADMIN_cekSheetGudang(), 0);
});

test('gudang: ADMIN_cekSheetGudang melaporkan sheet hilang dan header beda tanpa mengubah apa pun', () => {
  const x = siapkanGudang();
  x.g.pastikanPemilik_ = () => {};
  delete x.sheets.g.db_Stok_Selisih;
  x.sheets.g.db_Pemakaian_MCB.data[0][3] = 'x';
  assert.strictEqual(x.g.ADMIN_cekSheetGudang(), 4, 'sheet hilang + header beda + db_Merk_MCB dan db_Keperluan_MCB belum dibuat (fixture tidak memilikinya)');
  assert.strictEqual(x.sheets.g.db_Stok_Selisih, undefined, 'mode cek tidak membuat sheet');
});

// ---------- Tugas 2: logika murni stok ----------
const mut = (lokasi, jumlah, jenis = {}, waktuMs) => ({ lokasi, jumlah, material_id: 'm1', daya: '2A', merk: 'Schneider', status_mcb: 'Baru', ...jenis, ...(waktuMs ? { waktu: new Date(waktuMs).toISOString() } : {}) });

test('gudang murni: kunciJenis_ merapikan spasi dan membedakan daya, merk, status', () => {
  const g = buatKonteks(PROPS);
  assert.strictEqual(g.kunciJenis_({ material_id: 'm1', daya: ' 2A ', merk: 'Schneider', status_mcb: 'Baru' }), 'm1|2A|Schneider|Baru');
  assert.notStrictEqual(g.kunciJenis_(mut('t', 1)), g.kunciJenis_(mut('t', 1, { status_mcb: 'Ex-Handal' })));
});

test('gudang murni: saldoLokasi_ menjumlah per jenis dan per lokasi, tanda jumlah dihormati', () => {
  const g = buatKonteks(PROPS);
  const rows = [mut('T1', 5), mut('T1', -2), mut('T1', 3, { daya: '4A' }), mut('GUDANG', 9), mut('T2', 7)];
  assert.deepStrictEqual(j(g.saldoLokasi_(rows, 'T1')), { 'm1|2A|Schneider|Baru': 3, 'm1|4A|Schneider|Baru': 3 });
  assert.deepStrictEqual(j(g.saldoLokasi_(rows, 'GUDANG')), { 'm1|2A|Schneider|Baru': 9 });
  assert.deepStrictEqual(j(g.saldoLokasi_(rows, 'TIDAK_ADA')), {});
});

test('gudang murni: saldoLokasi_ membuang jenis bersaldo nol dan jumlah teks dibaca sebagai angka', () => {
  const g = buatKonteks(PROPS);
  assert.deepStrictEqual(j(g.saldoLokasi_([mut('T1', 2), mut('T1', '-2')], 'T1')), {});
  assert.deepStrictEqual(j(g.saldoLokasi_([mut('T1', '3')], 'T1')), { 'm1|2A|Schneider|Baru': 3 });
});

test('gudang murni: bandingStok_ menandai KURANG dan LEBIH sekaligus, jenis yang hanya ada di perkiraan = KURANG', () => {
  const g = buatKonteks(PROPS);
  const r = j(g.bandingStok_({ A: 2, B: 0 }, { A: 1, C: 1 }));
  assert.deepStrictEqual(r.sort((a, b) => a.kunci.localeCompare(b.kunci)), [
    { kunci: 'A', perkiraan: 2, input: 1, selisih: -1, arah: 'KURANG' },
    { kunci: 'C', perkiraan: 0, input: 1, selisih: 1, arah: 'LEBIH' }]);
  assert.deepStrictEqual(j(g.bandingStok_({ A: 2 }, { A: 2 })), []);
  assert.deepStrictEqual(j(g.bandingStok_({}, {})), []);
});

test('gudang murni: nomorPemakaianBerikut_ memakai nomor tertinggi + 1 dan tidak mengisi lubang', () => {
  const g = buatKonteks(PROPS);
  assert.strictEqual(g.nomorPemakaianBerikut_('Y13-1613026110201-SHF1.001', []), 'Y13-1613026110201-SHF1.001-MCB.001');
  assert.strictEqual(g.nomorPemakaianBerikut_('K', ['K-MCB.001', 'K-MCB.003']), 'K-MCB.004');
  assert.strictEqual(g.nomorPemakaianBerikut_('K', ['LAIN-MCB.009', 'K-MCB.002']), 'K-MCB.003', 'kode shift lain tidak dihitung');
});

test('gudang murni: materialBolehTim_ tanpa baris izin = tidak boleh; izin nonaktif / tim lain tidak dihitung', () => {
  const g = buatKonteks(PROPS);
  const mat = [{ material_id: 'a', nama_material: 'MCB', aktif: true }, { material_id: 'b', nama_material: 'Kabel', aktif: true }, { material_id: 'c', nama_material: 'Mati', aktif: false }, { material_id: '', nama_material: 'Tanpa id', aktif: true }];
  const izin = [{ material_id: 'a', tim_id: 'T1', aktif: true }, { material_id: 'b', tim_id: 'T1', aktif: false }, { material_id: 'b', tim_id: 'T2', aktif: true }, { material_id: 'c', tim_id: 'T1', aktif: true }];
  assert.deepStrictEqual(j(g.materialBolehTim_(mat, izin, 'T1')).map((m) => m.material_id), ['a']);
  assert.deepStrictEqual(j(g.materialBolehTim_(mat, izin, 'T2')).map((m) => m.material_id), ['b']);
  assert.deepStrictEqual(j(g.materialBolehTim_(mat, [], 'T1')), []);
  assert.deepStrictEqual(j(g.materialBolehTim_(mat, izin, '')), []);
});

// ---------- Tugas 3: izin material per tim ----------
const izinAktif = (x) => x.sheets.m.db_Material_Tim.data.slice(1).filter((r) => r[4] === true).map((r) => r[2] + '|' + r[3]);

test('gudang izin: materialUntukTim_ hanya material yang diizinkan; tanpa sheet izin = kosong (bukan galat)', () => {
  const x = siapkanGudang();
  assert.deepStrictEqual(j(x.g.materialUntukTim_(x.tim.y13)).map((m) => m.nama_material), ['MCB']);
  assert.deepStrictEqual(j(x.g.materialUntukTim_(x.tim.hartek)).map((m) => m.nama_material), ['Kabel NYY']);
  delete x.sheets.m.db_Material_Tim;
  assert.deepStrictEqual(j(x.g.materialUntukTim_(x.tim.y13)), []);
});

test('gudang izin: Hartek tidak melihat MCB; sebelum alat awal daftar kosong, sesudahnya penuh', () => {
  const x = siapkanGudang({ izin: false });
  x.g.kepemilikanAktifHartek_ = () => [];
  x.g.jenisPeralatanAktifHartek_ = () => [];
  assert.deepStrictEqual(j(x.g.getMaterialHartek_(x.hartek).material), [], 'tanpa izin = tidak boleh dipakai');
  x.g.pastikanPemilik_ = () => {};
  x.g.ADMIN_isiIzinMaterialAwal();
  const nama = j(x.g.getMaterialHartek_(x.hartek).material).map((m) => m.nama);
  assert.deepStrictEqual(nama.sort(), ['Kabel NYY', 'MCB'], 'alat awal memberi semua material aktif ke tim Hartek');
});

test('gudang izin: ADMIN_isiIzinMaterialAwal hanya tim HARTEK aktif, aman diulang, tidak mengaktifkan izin yang sengaja dicabut', () => {
  const x = siapkanGudang({ izin: false });
  x.g.pastikanPemilik_ = () => {};
  x.g.ADMIN_isiIzinMaterialAwal();
  const awal = x.sheets.m.db_Material_Tim.data.slice(1);
  assert.strictEqual(awal.length, 2, '2 material aktif × 1 tim Hartek aktif (tim mati dan Yandal tidak ikut)');
  assert.ok(awal.every((r) => r[3] === x.tim.hartek && r[4] === true));
  assert.deepStrictEqual(awal.map((r) => r[0]), [1, 2]);
  awal[0][4] = false;
  x.g.ADMIN_isiIzinMaterialAwal();
  assert.strictEqual(x.sheets.m.db_Material_Tim.data.length, 3, 'diulang tidak menggandakan');
  assert.strictEqual(x.sheets.m.db_Material_Tim.data[1][4], false, 'izin yang dicabut tidak dihidupkan lagi');
});

test('gudang izin: WO Hartek: bacaRincianWo_ menolak material tanpa izin tim', () => {
  const x = siapkanGudang();
  x.g.kepemilikanAktifHartek_ = () => [{ kepemilikanId: 'k1', nama: 'PLN' }];
  x.g.jenisMasterHartek_ = () => [{ jenis_id: 'j1', nama: 'Pasang', satuan: 'bh', jenis_pekerjaan: 'Gardu' }];
  const rincian = (materialId) => JSON.stringify({ pekerjaan: [{ id: U(), jenisId: 'j1', jumlah: 1, material: [{ id: U(), materialId, jumlah: 2, kepemilikan: 'PLN' }] }] });
  assert.strictEqual(kodeError(() => x.g.bacaRincianWo_(rincian(x.mat.mcb), 'Gardu', x.tim.hartek)), 'MATERIAL_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.g.bacaRincianWo_(rincian(x.mat.kabel), 'Gardu', x.tim.hartek)), null);
});

test('gudang izin: simpanIzinMaterial mengaktifkan, menonaktifkan, menambah, tidak pernah menghapus baris; stokTertinggal dilaporkan', () => {
  const x = siapkanGudang();
  // MCB: y13 + y14 aktif. Set ke [y14, hartek]: y13 dicabut, hartek ditambah.
  x.sheets.g.db_Material_Mutasi.data.push([1, U(), '', 'KIRIM_TIM', x.tim.y13, x.mat.mcb, '2A', 'S', 'Baru', 4, '', '', '', '', '', '', '']);
  const h = j(x.g.simpanIzinMaterial_(x.admin, { materialId: x.mat.mcb, timIds: [x.tim.y14, x.tim.hartek] }, 'WEB'));
  assert.deepStrictEqual(izinAktif(x).filter((s) => s.startsWith(x.mat.mcb)).sort(), [x.mat.mcb + '|' + x.tim.y14, x.mat.mcb + '|' + x.tim.hartek].sort());
  assert.strictEqual(x.sheets.m.db_Material_Tim.data.length, 5, 'baris dicabut tetap ada (3 awal + 1 baru + ... tidak dihapus)');
  assert.deepStrictEqual(h.stokTertinggal, [{ timId: x.tim.y13, jumlah: 4 }], 'pencabutan boleh walau stok masih ada');
  // aktifkan lagi y13: baris lama dipakai, tidak menambah baris
  const n = x.sheets.m.db_Material_Tim.data.length;
  x.g.simpanIzinMaterial_(x.admin, { materialId: x.mat.mcb, timIds: [x.tim.y13, x.tim.y14, x.tim.hartek] }, 'WEB');
  assert.strictEqual(x.sheets.m.db_Material_Tim.data.length, n, 'mengaktifkan ulang memakai baris lama');
  assert.ok(izinAktif(x).includes(x.mat.mcb + '|' + x.tim.y13));
});

test('gudang izin: simpanIzinMaterial hanya admin, validasi tim / material, baris ganda = DATA_GANDA', () => {
  const x = siapkanGudang();
  assert.strictEqual(kodeError(() => x.g.simpanIzinMaterial_(x.p13, { materialId: x.mat.mcb, timIds: [] }, 'MOBILE')), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.g.getIzinMaterial_(x.hartek, {})), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.g.simpanIzinMaterial_(x.admin, { materialId: U(), timIds: [] }, 'WEB')), 'DATA_TIDAK_DITEMUKAN');
  assert.strictEqual(kodeError(() => x.g.simpanIzinMaterial_(x.admin, { materialId: x.mat.mcb, timIds: [U()] }, 'WEB')), 'DATA_TIDAK_DITEMUKAN');
  assert.strictEqual(kodeError(() => x.g.simpanIzinMaterial_(x.admin, { materialId: x.mat.mcb, timIds: [x.tim.mati] }, 'WEB')), 'DATA_TIDAK_DITEMUKAN', 'tim nonaktif');
  assert.strictEqual(kodeError(() => x.g.simpanIzinMaterial_(x.admin, { materialId: x.mat.mcb, timIds: [x.tim.y13, x.tim.y13] }, 'WEB')), 'ID_GANDA');
  assert.strictEqual(kodeError(() => x.g.simpanIzinMaterial_(x.admin, { materialId: x.mat.mcb, timIds: [], x: 1 }, 'WEB')), 'FIELD_TIDAK_DIKENAL');
  x.sheets.m.db_Material_Tim.data.push([9, U(), x.mat.mcb, x.tim.y13, true, 1, '', '']);
  assert.strictEqual(kodeError(() => x.g.simpanIzinMaterial_(x.admin, { materialId: x.mat.mcb, timIds: [x.tim.y13] }, 'WEB')), 'DATA_GANDA');
});

test('gudang izin: getIzinMaterial memuat material aktif, tim aktif, dan izin', () => {
  const x = siapkanGudang();
  const h = j(x.g.getIzinMaterial_(x.admin, {}));
  assert.deepStrictEqual(h.material.map((m) => m.nama).sort(), ['Kabel NYY', 'MCB']);
  assert.deepStrictEqual(h.tim.map((t) => t.nama).sort(), ['Hartek', 'Yandal 13 Toboali', 'Yandal 14 Toboali']);
  assert.strictEqual(h.tim.find((t) => t.timId === x.tim.hartek).jenis, 'HARTEK');
  assert.strictEqual(h.izin.length, 3);
  assert.deepStrictEqual(Object.keys(h.izin[0]).sort(), ['aktif', 'materialId', 'timId']);
});
