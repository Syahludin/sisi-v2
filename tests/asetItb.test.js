const test = require('node:test');
const assert = require('node:assert');
const { buatKonteks } = require('./harness');

const g = buatKonteks({ ENV: 'staging', MASTER_SHEET_ID: 'm', AUTH_SHEET_ID: 'a', KODE_ULP: '16130', ADMIN_EMAIL: 'x@y.z' });
// objek dari konteks VM beda realm: bandingkan lewat JSON
const j = (x) => JSON.parse(JSON.stringify(x));
const kodeError = (fn) => { try { fn(); } catch (e) { return e.kode || e.message; } return null; };

const HDR = ['Penyulang', 'CXUNIT', 'CXPENYULANG', 'DESCRIPTION', 'STATUS', 'ENDMEASURE', 'JENIS_KABEL', 'PANJANG_HANTARAN', 'UKURAN_KAWAT'];
const baris = (cx, desc, jenis, ukuran, panjang, status = 'OPERATING', pny = 'PALAS') => [pny, 'ULP.16130', cx, desc, status, panjang, jenis, panjang, ukuran];
const itb = (...rows) => g.susunSegmenItb_([HDR, ...rows]).segmen;
const PETA0 = { gardu: {}, section: [] };
const OPSI = (bulan) => ({ bulan, sekarang: '2026-11-02T01:00:00.000Z' });

test('aset ITB: kunci segmen dirapikan', () => {
  assert.strictEqual(g.normSegItb_('  segmen   py0088 '), 'SEGMEN PY0088');
  assert.strictEqual(
    g.kunciSegmenItb_({ cx_penyulang: '2456981', description: ' segmen py0088  - perc py0173', jenis_kabel: 'aaac', ukuran_kawat: '70' }),
    '2456981|SEGMEN PY0088 - PERC PY0173|AAAC|70');
});

test('aset ITB: kategori kabel SUTM / SKTM / LAINNYA', () => {
  ['AAAC', 'AAACS', 'aaac '].forEach((k) => assert.strictEqual(g.kategoriKabelItb_(k), 'SUTM'));
  ['N2XSEBY - 1 CORE', 'NA2XSEYBY - 3 CORE'].forEach((k) => assert.strictEqual(g.kategoriKabelItb_(k), 'SKTM'));
  assert.strictEqual(g.kategoriKabelItb_('XYZ'), 'LAINNYA');
});

test('aset ITB: susun segmen, panjang berpoin, kunci kembar, galat header', () => {
  const s = j(itb(
    baris('2456981', 'SEGMEN PY0088 - PERC PY0173', 'AAAC', '70', '0.10'),
    baris('181405', 'SEGMEN LBS DEPAN GI - SKTM PLTD PENGAREM', 'AAACS', '150', '26.77', 'OPERATING', 'KEPOSANG'),
    baris('181405', 'SEGMEN X', 'AAAC', '70', '-'),
    baris('181405', 'SEGMEN X', 'AAAC', '70', ''),
    baris('181405', '', 'AAAC', '70', '1'),
  ));
  assert.strictEqual(s.length, 4, 'baris tanpa DESCRIPTION dibuang');
  assert.strictEqual(s[0].panjang_hantaran, 0.1);
  assert.strictEqual(s[1].panjang_hantaran, 26.77);
  assert.strictEqual(s[2].panjang_hantaran, 0);
  assert.strictEqual(s[0].kategori, 'SUTM');
  assert.strictEqual(s[0].penyulang_itb, 'PALAS');
  assert.strictEqual(s[2].kunci, '181405|SEGMEN X|AAAC|70');
  assert.strictEqual(s[3].kunci, '181405|SEGMEN X|AAAC|70#2');
  assert.strictEqual(kodeError(() => g.susunSegmenItb_([['Penyulang', 'CXPENYULANG'], ['A', '1']])), 'FORMAT_SALAH');
  assert.ok(kodeError(() => g.susunSegmenItb_([HDR])), 'hanya header = galat');
  assert.ok(kodeError(() => g.susunSegmenItb_([])), 'kosong = galat');
});

test('aset ITB: kode gardu di deskripsi', () => {
  assert.deepStrictEqual(j(g.kodeGarduDeskripsi_('SEGMEN PY0088 - PERC PY0173')), ['PY0088', 'PY0173']);
  assert.deepStrictEqual(j(g.kodeGarduDeskripsi_('SEGMEN PY0088 - PY0088')), ['PY0088']);
  assert.deepStrictEqual(j(g.kodeGarduDeskripsi_('SEGMEN LBS DEPAN GI - SKTM PLTD PENGAREM')), []);
});

test('aset ITB: pemetaan gardu, cadangan section, belum, konflik', () => {
  const peta = g.bangunPetaItb_(
    [{ 'No Gardu': 'py0088', Penyulang: 'Palas' }, { 'No Gardu': 'TB0080', Penyulang: 'Tangit' }],
    [{ section: 'ACR Tebing Panjang', penyulang: 'Tangit' }, { section: 'GI', penyulang: 'Palas' }]);
  assert.deepStrictEqual(j(g.petakanSegmenItb_('SEGMEN PY0088 - PERC PY0173', peta)), { penyulang: 'PALAS', sumber: 'GARDU', kodeGardu: 'PY0088', catatan: '' });
  const s = j(g.petakanSegmenItb_('SEGMEN ACR TEBING PANJANG - PERC TB9999', peta));
  assert.deepStrictEqual([s.penyulang, s.sumber], ['TANGIT', 'SECTION']);
  assert.strictEqual(j(g.petakanSegmenItb_('SEGMEN X - Y', peta)).sumber, 'BELUM');
  assert.strictEqual(j(g.petakanSegmenItb_('SEGMEN LBS DEPAN GI - X', peta)).sumber, 'BELUM', 'nama section < 4 huruf diabaikan');
  const k = j(g.petakanSegmenItb_('SEGMEN PY0088 - TB0080', peta));
  assert.deepStrictEqual([k.penyulang, k.sumber], ['', 'BELUM'], 'dua gardu beda penyulang = dikosongkan, diisi manual');
  assert.ok(k.catatan.indexOf('Konflik gardu: PY0088=PALAS, TB0080=TANGIT') === 0, k.catatan);
});

test('aset ITB: gabung baru, idempotent, ubah, hilang, pulih', () => {
  const peta = { gardu: { PY0088: 'PALAS' }, section: [] };
  const a = itb(baris('1', 'SEGMEN PY0088 - X', 'AAAC', '70', '1.5'), baris('1', 'SEGMEN Y - Z', 'AAAC', '35', '2'));
  const r1 = j(g.gabungSegmenItb_([], a, peta, OPSI('2026-10')));
  assert.strictEqual(r1.ringkas.tambah, 2);
  assert.strictEqual(r1.ringkas.belum, 1);
  assert.strictEqual(r1.baris[0].sumber_pemetaan, 'GARDU');
  assert.strictEqual(r1.baris[0].penyulang_lapangan, 'PALAS');
  assert.strictEqual(r1.baris[0].bulan_itb, '2026-10');
  assert.strictEqual(r1.baris[0].aset_id.length, 12);

  const r2 = j(g.gabungSegmenItb_(r1.baris, a, peta, OPSI('2026-10')));
  assert.deepStrictEqual([r2.ringkas.tambah, r2.ringkas.ubah, r2.ringkas.sama, r2.ringkas.hilang], [0, 0, 2, 0]);
  assert.deepStrictEqual(r2.baris, r1.baris, 'sinkron ulang = master identik');

  const b = itb(baris('1', 'SEGMEN PY0088 - X', 'AAAC', '70', '1.9'), baris('1', 'SEGMEN Y - Z', 'AAAC', '35', '2'));
  const r3 = j(g.gabungSegmenItb_(r1.baris, b, peta, OPSI('2026-11')));
  assert.deepStrictEqual([r3.ringkas.ubah, r3.ringkas.sama], [1, 1]);
  assert.strictEqual(r3.baris[0].panjang_hantaran, 1.9);
  assert.strictEqual(r3.baris[1].bulan_itb, '2026-11');

  const c = itb(baris('1', 'SEGMEN PY0088 - X', 'AAAC', '70', '1.9'));
  const r4 = j(g.gabungSegmenItb_(r3.baris, c, peta, OPSI('2026-12')));
  assert.strictEqual(r4.ringkas.hilang, 1);
  assert.strictEqual(r4.baris[1].keterangan, 'Tidak ada di ITB 2026-12');
  const r4b = j(g.gabungSegmenItb_(r4.baris, c, peta, OPSI('2027-01')));
  assert.strictEqual(r4b.baris[1].keterangan, 'Tidak ada di ITB 2026-12', 'bulan hilang pertama dipertahankan');

  const r5 = j(g.gabungSegmenItb_(r4.baris, b, peta, OPSI('2027-01')));
  assert.strictEqual(r5.ringkas.pulih, 1);
  assert.strictEqual(r5.baris[1].keterangan, '');
});

test('aset ITB: koreksi manual tidak ditimpa, catatan manual tetap saat hilang', () => {
  const peta = { gardu: { PY0088: 'PALAS' }, section: [] };
  const a = itb(baris('1', 'SEGMEN PY0088 - X', 'AAAC', '70', '1.5'));
  const m = j(g.gabungSegmenItb_([], a, peta, OPSI('2026-10'))).baris;
  m[0].penyulang_lapangan = 'TUNGKAL'; m[0].sumber_pemetaan = 'MANUAL'; m[0].keterangan = 'cek lapangan';
  const r = j(g.gabungSegmenItb_(m, a, peta, OPSI('2026-11')));
  assert.deepStrictEqual([r.baris[0].penyulang_lapangan, r.baris[0].sumber_pemetaan, r.baris[0].keterangan], ['TUNGKAL', 'MANUAL', 'cek lapangan']);
  const h = j(g.gabungSegmenItb_(r.baris, itb(baris('2', 'SEGMEN LAIN', 'AAAC', '70', '1')), peta, OPSI('2026-12')));
  assert.strictEqual(h.baris[0].keterangan, 'Tidak ada di ITB 2026-12 | cek lapangan');
  const p = j(g.gabungSegmenItb_(h.baris, a, peta, OPSI('2027-01')));
  assert.strictEqual(p.baris[0].keterangan, 'cek lapangan');
});

test('aset ITB: bulan dari judul file', () => {
  assert.strictEqual(g.bulanDariJudulItb_('ITB ULP Toboali September 2026', '2026-11-02'), '2026-09');
  assert.strictEqual(g.bulanDariJudulItb_('ITB Mei 2027', '2026-11-02'), '2027-05');
  assert.strictEqual(g.bulanDariJudulItb_('Judul acak', '2026-11-02'), '2026-11');
});

// ---------- Task 2: tautan, endpoint, sinkron ----------
function sheetPalsu(nilai) {
  const s = {
    nilai,
    getDataRange: () => ({ getValues: () => s.nilai.map((r) => r.slice()), getDisplayValues: () => s.nilai.map((r) => r.map((v) => (typeof v === 'number' ? v.toFixed(2) : String(v)))) }),
    getLastRow: () => s.nilai.length,
    getLastColumn: () => (s.nilai[0] ? s.nilai[0].length : 0),
    getMaxRows: () => 100000,
    insertRowsAfter: () => {},
    getRange: (r, c, nr, nc) => ({
      clearContent: () => { for (let i = 0; i < nr; i++) for (let k = 0; k < nc; k++) if (s.nilai[r - 1 + i]) s.nilai[r - 1 + i][c - 1 + k] = ''; },
      setValues: (v) => { v.forEach((baris, i) => { s.nilai[r - 1 + i] = baris.slice(); }); },
      getValues: () => s.nilai.slice(r - 1, r - 1 + nr).map((b) => b.slice(c - 1, c - 1 + nc)),
    }),
  };
  return s;
}
function siapSinkron(itbData, props = {}) {
  const gs = buatKonteks({ ENV: 'staging', MASTER_SHEET_ID: 'm', GARDU_SHEET_ID: 'gd', SISI_ITB_SHEET_ID: 'si', MASTER_ITB_SHEET_ID: ID_ITB, AUTH_SHEET_ID: 'a', KODE_ULP: '16130', ADMIN_EMAIL: 'x@y.z', ...props });
  const sheets = {
    si: { db_Aset_ITB: sheetPalsu([gs.ASET_HEADER_.slice()]) },
    m: { db_Jaringan: sheetPalsu([['section', 'penyulang', 'aktif'], ['ACR TEBING PANJANG', 'TANGIT', true]]) },
    gd: { db_Gardu: sheetPalsu([['No Gardu', 'Penyulang'], ['PY0088', 'Palas']]) },
    [ID_ITB]: { Data_Penyulang: sheetPalsu(itbData) },
  };
  gs.SpreadsheetApp = { openById: (id) => ({ getName: () => 'ITB ULP Toboali September 2026', getSheetByName: (n) => sheets[id][n] }) };
  return { gs, sheets };
}
const ID_ITB = '1jpBct2hbc0mO_2tjrbO9GFZpHt1pEAqImWLkMJux55I';
const ADM = { role: 'ADMIN', username: 'adm' };

test('aset ITB: endpoint terdaftar dengan menu, cache, tulis', () => {
  const ep = g.endpoints_();
  assert.strictEqual(ep.getDataAset.menu, 'OPS_DATA_ASET');
  assert.ok(ep.getDataAset.cache && !ep.getDataAset.tulis);
  assert.strictEqual(ep.sinkronDataAset.menu, 'OPS_DATA_ASET');
  assert.ok(ep.sinkronDataAset.tulis);
  assert.strictEqual(kodeError(() => g.getDataAset_({ role: 'PETUGAS' }, {})), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => g.sinkronDataAset_({ role: 'PETUGAS' }, {})), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => g.getDataAset_(ADM, { x: 1 })), 'FIELD_TIDAK_DIKENAL');
});

test('aset ITB: sinkron menulis master, ulang idempotent, getDataAset', () => {
  const { gs, sheets } = siapSinkron([HDR,
    baris('2456981', 'SEGMEN PY0088 - PERC PY0173', 'AAAC', '70', '0.10'),
    baris('181440', 'SEGMEN ACR TEBING PANJANG - PERC TB0080', 'AAACS', '150', '0.20', 'INVALID', 'TANGIT')]);
  const r1 = JSON.parse(JSON.stringify(gs.sinkronDataAset_(ADM, {})));
  assert.strictEqual(r1.bulan, '2026-09');
  assert.strictEqual(r1.ringkas.tambah, 2);
  assert.strictEqual(sheets.si.db_Aset_ITB.nilai.length, 3);
  const r2 = JSON.parse(JSON.stringify(gs.sinkronDataAset_(ADM, {})));   // tanpa ID = pakai ID terakhir
  assert.deepStrictEqual([r2.ringkas.tambah, r2.ringkas.ubah, r2.ringkas.sama], [0, 0, 2]);
  const d = JSON.parse(JSON.stringify(gs.getDataAset_(ADM, {})));
  assert.strictEqual(d.segmen.length, 2);
  assert.deepStrictEqual([d.segmen[0].pnyLap, d.segmen[0].sumber, d.segmen[0].kategori, d.segmen[0].panjang, d.segmen[0].hilang], ['PALAS', 'GARDU', 'SUTM', 0.1, false]);
  assert.deepStrictEqual([d.segmen[1].pnyLap, d.segmen[1].sumber, d.segmen[1].status], ['TANGIT', 'SECTION', 'INVALID']);
  assert.strictEqual(d.sinkron.itbSheetId, ID_ITB);
});

test('aset ITB: file ITB kosong / tanpa sheet tidak menyentuh master', () => {
  const { gs, sheets } = siapSinkron([HDR, baris('2456981', 'SEGMEN PY0088 - X', 'AAAC', '70', '1')]);
  gs.sinkronDataAset_(ADM, {});
  const sebelum = JSON.stringify(sheets.si.db_Aset_ITB.nilai);
  sheets[ID_ITB].Data_Penyulang.nilai = [HDR];
  assert.ok(kodeError(() => gs.sinkronDataAset_(ADM, {})));
  assert.strictEqual(JSON.stringify(sheets.si.db_Aset_ITB.nilai), sebelum, 'file kosong: master tidak berubah');
  delete sheets[ID_ITB].Data_Penyulang;
  assert.strictEqual(kodeError(() => gs.sinkronDataAset_(ADM, {})), 'SHEET_TIDAK_ADA');
  assert.strictEqual(JSON.stringify(sheets.si.db_Aset_ITB.nilai), sebelum);
  assert.strictEqual(kodeError(() => gs.sinkronDataAset_(ADM, { itbSheetId: ID_ITB })), 'FIELD_TIDAK_DIKENAL', 'sumber hanya dari MASTER_ITB_SHEET_ID');
});

test('aset ITB: kegagalan menulis tidak mengosongkan master', () => {
  const { gs, sheets } = siapSinkron([HDR, baris('2456981', 'SEGMEN PY0088 - X', 'AAAC', '70', '1'), baris('2456981', 'SEGMEN Y - Z', 'AAAC', '35', '2')]);
  gs.sinkronDataAset_(ADM, {});
  const sebelum = JSON.stringify(sheets.si.db_Aset_ITB.nilai);
  sheets[ID_ITB].Data_Penyulang.nilai = [HDR, baris('2456981', 'SEGMEN PY0088 - X', 'AAAC', '70', '9'), baris('2456981', 'SEGMEN Y - Z', 'AAAC', '35', '2')];
  const asli = sheets.si.db_Aset_ITB.getRange;
  sheets.si.db_Aset_ITB.getRange = (r, c, nr, nc) => { const x = asli(r, c, nr, nc); return { ...x, setValues: () => { throw new Error('kuota habis'); } }; };
  assert.ok(kodeError(() => gs.sinkronDataAset_(ADM, {})));
  assert.strictEqual(JSON.stringify(sheets.si.db_Aset_ITB.nilai), sebelum, 'master tetap utuh bila tulis gagal');
});

test('aset ITB: sinkron awal dari editor memakai MASTER_ITB_SHEET_ID', () => {
  assert.strictEqual(typeof g.ADMIN_sinkronAsetItbAwal, 'function');
  assert.strictEqual(g.ASET_ITB_AWAL_ID_, undefined, 'ID file ITB tidak lagi tertanam di kode');
});

test('aset ITB: sumber dari MASTER_ITB_SHEET_ID, tulis ke SISI_ITB_SHEET_ID, properti kosong = galat', () => {
  const data = [HDR, baris('2456981', 'SEGMEN PY0088 - X', 'AAAC', '70', '1')];
  const a = siapSinkron(data);
  const r = JSON.parse(JSON.stringify(a.gs.sinkronDataAset_(ADM, {})));   // tanpa isian: pakai MASTER_ITB_SHEET_ID
  assert.strictEqual(r.ringkas.tambah, 1);
  assert.strictEqual(a.sheets.si.db_Aset_ITB.nilai.length, 2, 'ditulis ke file SISI_ITB_SHEET_ID');
  assert.strictEqual(JSON.stringify(a.sheets.m.db_Jaringan.nilai).includes('SEGMEN'), false, 'MASTER_SHEET_ID tidak disentuh');
  assert.strictEqual(kodeError(() => siapSinkron(data, { MASTER_ITB_SHEET_ID: '' }).gs.sinkronDataAset_(ADM, {})), 'CONFIG_TIDAK_LENGKAP');
  assert.strictEqual(kodeError(() => siapSinkron(data, { SISI_ITB_SHEET_ID: '' }).gs.sinkronDataAset_(ADM, {})), 'CONFIG_TIDAK_LENGKAP');
  assert.strictEqual(kodeError(() => siapSinkron(data, { SISI_ITB_SHEET_ID: '' }).gs.getDataAset_(ADM, {})), 'CONFIG_TIDAK_LENGKAP');
  assert.strictEqual(a.gs.sinkronDataAset_(ADM, {}).ringkas.sama, 1, 'sinkron ulang tanpa perubahan');
  assert.strictEqual(typeof a.gs.idDariTautanSheet_, 'undefined', 'tidak ada jalur ID dari klien');
});

test('aset ITB: panjang dibaca presisi penuh, bukan nilai tampilan yang dibulatkan', () => {
  const { gs, sheets } = siapSinkron([HDR, baris('2456981', 'SEGMEN PY0088 - X', 'AAAC', 70, 0.098), baris('2456981', 'SEGMEN Y - Z', 'AAAC', 70, 1.435)]);
  gs.sinkronDataAset_(ADM, {});
  const d = JSON.parse(JSON.stringify(gs.getDataAset_(ADM, {})));
  assert.deepStrictEqual(d.segmen.map((x) => x.panjang), [0.098, 1.435]);
  assert.deepStrictEqual(d.segmen.map((x) => x.ukuran), ['70', '70'], 'ukuran angka tetap teks');
  assert.strictEqual(d.segmen[0].cx, '2456981', 'CX angka tetap teks');
});

test('aset ITB: pemetaan lewat ujung nama perangkat di section db_Jaringan (UJUNG)', () => {
  const peta = g.bangunPetaItb_([], [
    { section: 'LBS Irat - GH Payung', penyulang: 'Palas' },
    { section: 'ACR Air Bara - LBS Air Sampik', penyulang: 'Paku' },
    { section: 'LBS Bedengung - ACR Bedengung', penyulang: 'Palas' },
    { section: 'LBS Mekar Jaya - LBS Malik', penyulang: 'Paku' },
    { section: 'FCO Jar Ponpes Bikang - TB0407', penyulang: 'Bikang' },
  ]);
  const p = (d) => JSON.parse(JSON.stringify(g.petakanSegmenItb_(d, peta)));
  assert.deepStrictEqual([p('SEGMEN PERC ACR BEDENGUNG - ACR BEDENGUNG').penyulang, p('SEGMEN PERC ACR BEDENGUNG - ACR BEDENGUNG').sumber], ['PALAS', 'UJUNG']);
  assert.strictEqual(p('SEGMEN LBS AIR BARA - GH PAYUNG').sumber, 'BELUM', 'dua ujung menunjuk penyulang berbeda = tidak ditebak');
  assert.deepStrictEqual([p('SEGMEN LBS MALIK - AKHIR').penyulang, p('SEGMEN LBS MALIK - AKHIR').sumber], ['PAKU', 'UJUNG']);
  assert.deepStrictEqual([p('SEGMEN TB0407 - LBS TIDAK ADA').penyulang, p('SEGMEN TB0407 - LBS TIDAK ADA').sumber], ['BIKANG', 'UJUNG'], 'kode tiang di ujung section ikut dipakai');
  assert.strictEqual(p('SEGMEN LBS DEPAN GI - SKTM PLTD PENGAREM').sumber, 'BELUM');
  assert.strictEqual(p('SEGMEN X - Y').sumber, 'BELUM', 'inti < 4 huruf diabaikan');
  // gardu dan nama section penuh tetap didahulukan
  const peta2 = g.bangunPetaItb_([{ 'No Gardu': 'PY0088', Penyulang: 'Palas' }], [{ section: 'ACR Air Bara - LBS Air Sampik', penyulang: 'Paku' }, { section: 'LBS Irat - GH Payung', penyulang: 'Palas' }]);
  assert.strictEqual(JSON.parse(JSON.stringify(g.petakanSegmenItb_('SEGMEN PY0088 - GH PAYUNG', peta2))).sumber, 'GARDU');
  assert.strictEqual(JSON.parse(JSON.stringify(g.petakanSegmenItb_('SEGMEN ACR AIR BARA - LBS AIR SAMPIK', peta2))).sumber, 'SECTION');
});
