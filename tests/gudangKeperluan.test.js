const test = require('node:test');
const assert = require('node:assert');
const { sheetPalsu, j, kodeError, A, banyak, duniaPakai } = require('./gudangUji');

// ---------- Master keperluan penggunaan MCB (db_Keperluan_MCB di SiSi_Master): keperluan dipilih dari master ----------
const KEP_HEADER = ['No', 'keperluan_id', 'keperluan', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'];
const kolP = (x, b, k) => x.kol('db_Pemakaian_MCB', b, k);

/** Pasang sheet db_Keperluan_MCB (baris = [keperluan, aktif]) di dunia uji. */
function pasangKeperluan(x, daftar) {
  x.sheets.m.db_Keperluan_MCB = sheetPalsu(x.log)('db_Keperluan_MCB', [KEP_HEADER.slice(), ...daftar.map(([k, aktif = true], i) => [i + 1, 'id' + i, k, aktif, 1, '', ''])]);
  return x;
}

test('keperluan: skema db_Keperluan_MCB terdaftar di skemaHeader_ SiSi_Master', () => {
  const x = duniaPakai({ periksa: false });
  assert.strictEqual(x.g.GUD_KEPERLUAN_HEADER_.join(','), KEP_HEADER.join(','));
  assert.strictEqual(x.g.skemaHeader_().MASTER_SHEET_ID.db_Keperluan_MCB.join(','), KEP_HEADER.join(','));
});

test('keperluan: master belum ada / kosong = keperluan bebas (belum diberlakukan)', () => {
  const x = duniaPakai();
  assert.doesNotThrow(() => x.pakai({ keperluan: 'Apa saja' }));
  pasangKeperluan(x, []);
  assert.doesNotThrow(() => x.pakai({ keperluan: 'Apa saja lagi', nomorMeter: '14500000010' }));
  assert.deepStrictEqual(j(x.g.daftarKeperluanMcb_()), []);
});

test('keperluan: pemakaian memakai ejaan master; di luar master / nonaktif ditolak tanpa menulis baris atau mutasi', () => {
  const x = duniaPakai();
  pasangKeperluan(x, [['Ganti MCB Rusak'], ['Pasang Baru'], ['Lama', false]]);
  const n = x.baris('db_Material_Mutasi').length;
  assert.strictEqual(kodeError(() => x.pakai({ keperluan: 'ganti mcb rusak banget' })), 'KEPERLUAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.pakai({ keperluan: 'Lama' })), 'KEPERLUAN_TIDAK_VALID');
  assert.strictEqual(x.baris('db_Pemakaian_MCB').length, 0);
  assert.strictEqual(x.baris('db_Material_Mutasi').length, n);
  x.pakai({ keperluan: '  ganti mcb rusak ' });
  assert.strictEqual(kolP(x, x.baris('db_Pemakaian_MCB')[0], 'keperluan'), 'Ganti MCB Rusak');
});

test('keperluan: pemakaian susulan petugas ikut aturan master', () => {
  const x = duniaPakai({ periksa: false });
  const h = j(x.periksa([]));   // perkiraan 2 x A tidak diinput = KURANG
  pasangKeperluan(x, [['Pasang Baru']]);
  const id = h.selisih[0].selisihId;
  assert.strictEqual(kodeError(() => x.susulan({ selisihId: id, keperluan: 'Lupa dicatat' })), 'KEPERLUAN_TIDAK_VALID');
  x.susulan({ selisihId: id, keperluan: 'pasang baru' });
  assert.strictEqual(kolP(x, x.baris('db_Pemakaian_MCB')[0], 'keperluan'), 'Pasang Baru');
});

test('keperluan: admin selesaikan selisih SUSULAN dan koreksi pemakaian ikut master; keperluan lama di luar master yang tidak diubah tetap boleh', () => {
  const x = duniaPakai({ periksa: false });
  const h = j(x.periksa([]));
  pasangKeperluan(x, [['Pasang Baru']]);
  const sel = (o) => x.g.selesaikanSelisih_(x.admin, { selisihId: h.selisih[0].selisihId, cara: 'SUSULAN', catatan: 'cek', nomorMeter: '14500000001', ...o }, 'WEB');
  assert.strictEqual(kodeError(() => sel({ keperluan: 'Sembarang' })), 'KEPERLUAN_TIDAK_VALID');
  sel({ keperluan: 'PASANG BARU' });
  const b = x.baris('db_Pemakaian_MCB')[0];
  assert.strictEqual(kolP(x, b, 'keperluan'), 'Pasang Baru');

  const y = duniaPakai();
  const id = j(y.pakai({ keperluan: 'Ganti MCB rusak' })).pemakaianId;   // dicatat sebelum master ada
  pasangKeperluan(y, [['Pasang Baru']]);
  const kor = (o) => y.g.koreksiPemakaian_(y.admin, { pemakaianId: id, revision: 1, alasan: 'cek', ...o }, 'WEB');
  assert.strictEqual(kodeError(() => kor({ keperluan: 'Salah ketik' })), 'KEPERLUAN_TIDAK_VALID');
  assert.doesNotThrow(() => kor({ nomorMeter: '14500000009', keperluan: 'Ganti MCB rusak' }), 'keperluan tidak berubah');
});

test('keperluan: getIzinMaterial dan getStokYandal membawa daftar aktif terurut; tanpa master = kosong', () => {
  const x = duniaPakai();
  assert.deepStrictEqual(j(x.g.getIzinMaterial_(x.admin, {}).keperluanMcb), []);
  assert.deepStrictEqual(j(x.g.getStokYandal_(x.p13, {}).keperluanMcb), []);
  pasangKeperluan(x, [['Pasang Baru'], ['Lama', false], ['Ganti MCB Rusak']]);
  assert.deepStrictEqual(j(x.g.getIzinMaterial_(x.admin, {}).keperluanMcb), ['Ganti MCB Rusak', 'Pasang Baru']);
  assert.deepStrictEqual(j(x.g.getStokYandal_(x.p13, {}).keperluanMcb), ['Ganti MCB Rusak', 'Pasang Baru']);
});

test('keperluan: ADMIN_siapkanSheetGudang membuat db_Keperluan_MCB (header saja, isi dari admin); ADMIN_lengkapiMaster melengkapi id / No / aktif', () => {
  const x = duniaPakai({ periksa: false });
  x.g.pastikanPemilik_ = () => {};
  assert.strictEqual(x.sheets.m.db_Keperluan_MCB, undefined);
  assert.strictEqual(x.g.ADMIN_cekSheetGudang() > 0, true, 'mode cek melaporkan tab belum ada');
  assert.strictEqual(x.sheets.m.db_Keperluan_MCB, undefined, 'mode cek tidak membuat');
  assert.strictEqual(x.g.ADMIN_siapkanSheetGudang(), 0);
  assert.deepStrictEqual(x.sheets.m.db_Keperluan_MCB.data, [KEP_HEADER], 'hanya header, tidak ada isian karangan');
  assert.strictEqual(x.g.ADMIN_siapkanSheetGudang(), 0, 'aman diulang');
  assert.strictEqual(x.g.ADMIN_cekSheetGudang(), 0);

  x.g.lengkapiDaerahPadam_ = () => 0;
  const buat = sheetPalsu(x.log);
  x.sheets.m.db_Jaringan = buat('db_Jaringan', [['section_id', 'penyulang', 'section', 'urutan', 'parent_section_id', 'aktif']]);
  x.sheets.m.db_Jenis_Pekerjaan = buat('db_Jenis_Pekerjaan', [['jenis_id', 'modul', 'nama', 'aktif', 'bobot']]);
  x.sheets.m.db_Daerah_Padam = buat('db_Daerah_Padam', [['nomor', 'daerah_id', 'penyulang', 'aktif']]);
  const getRangeAsli = x.sheets.m.db_Tim.getRange;
  x.sheets.m.db_Tim.getRange = (...a) => { const r = getRangeAsli(...a); r.setNumberFormat = () => r; return r; };
  x.sheets.m.db_Keperluan_MCB.data.push(['', '', 'Pasang Baru', '', '', '', '']);
  x.g.ADMIN_lengkapiMaster();
  const b = x.sheets.m.db_Keperluan_MCB.data[1];
  assert.deepStrictEqual([b[0], b[2], b[3], b[4], b[6]], [1, 'Pasang Baru', 'TRUE', 1, 'admin-tools']);
  assert.ok(/^[0-9a-f-]{36}$/.test(b[1]), 'keperluan_id UUID');
  assert.deepStrictEqual(j(x.g.daftarKeperluanMcb_()), ['Pasang Baru']);
});
