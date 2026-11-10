const test = require('node:test');
const assert = require('node:assert');
const { sheetPalsu, j, kodeError, dunia, duniaPakai, A, banyak } = require('./gudangUji');

// ---------- Master merk MCB (db_Merk_MCB di SiSi_Master): merk dipilih dari master, bukan diketik bebas ----------
const MERK_HEADER = ['No', 'merk_id', 'merk', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'];

/** Pasang sheet db_Merk_MCB (baris = [merk, aktif]) di dunia uji. Tanpa panggilan ini sheet tidak ada. */
function pasangMerk(x, daftar) {
  x.sheets.m.db_Merk_MCB = sheetPalsu(x.log)('db_Merk_MCB', [MERK_HEADER.slice(), ...daftar.map(([m, aktif = true], i) => [i + 1, 'id' + i, m, aktif, 1, '', ''])]);
  return x;
}

test('merk: skema db_Merk_MCB terdaftar di skemaHeader_ SiSi_Master', () => {
  const x = dunia();
  assert.strictEqual(x.g.GUD_MERK_HEADER_.join(','), MERK_HEADER.join(','));
  assert.strictEqual(x.g.skemaHeader_().MASTER_SHEET_ID.db_Merk_MCB.join(','), MERK_HEADER.join(','));
});

test('merk: master belum ada atau kosong = isian lama tetap diterima (belum diberlakukan)', () => {
  const x = dunia();
  assert.doesNotThrow(() => x.tambah(1, { merk: 'Apa Saja' }));
  pasangMerk(x, []);
  assert.doesNotThrow(() => x.tambah(1, { merk: 'Apa Saja Lagi' }));
  assert.deepStrictEqual(j(x.g.daftarMerkMcb_()), []);
});

test('merk: tambah stok gudang memakai ejaan master (huruf besar/kecil + spasi diluruskan), merk di luar master / nonaktif ditolak tanpa menulis', () => {
  const x = pasangMerk(dunia(), [['Schneider'], ['Hager'], ['Lama', false]]);
  x.tambah(2, { merk: '  hager ' });
  assert.deepStrictEqual(x.baris('db_Material_Mutasi').map((r) => x.kol('db_Material_Mutasi', r, 'merk')), ['Hager']);
  const n = x.baris('db_Material_Mutasi').length;
  assert.strictEqual(kodeError(() => x.tambah(1, { merk: 'Merk Salah Ketik' })), 'MERK_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.tambah(1, { merk: 'Lama' })), 'MERK_TIDAK_VALID', 'merk nonaktif tidak boleh untuk stok baru');
  assert.strictEqual(x.baris('db_Material_Mutasi').length, n);
});

test('merk: pemeriksaan awal shift menolak merk di luar master dan menyimpan ejaan master', () => {
  const x = duniaPakai({ periksa: false });
  pasangMerk(x, [['Schneider'], ['Hager']]);
  assert.strictEqual(kodeError(() => x.periksa([{ ...A, merk: 'Schnider' }])), 'MERK_TIDAK_VALID');
  assert.strictEqual(x.baris('db_Stok_Pemeriksaan').length, 0, 'tidak ada yang tertulis');
  const h = j(x.periksa(banyak({ ...A, merk: 'SCHNEIDER' }, 2)));
  assert.strictEqual(h.status, 'COCOK', 'ejaan diluruskan ke Schneider sehingga cocok dengan stok tim');
});

test('merk: koreksi pemakaian: merk baru wajib dari master; merk lama (di luar master) yang tidak diubah tetap boleh', () => {
  const x = duniaPakai();
  const id = j(x.pakai()).pemakaianId;
  pasangMerk(x, [['Hager']]);   // Schneider (merk stok & pemakaian) belum ada di master
  const kor = (o) => x.g.koreksiPemakaian_(x.admin, { pemakaianId: id, revision: 1, alasan: 'cek', ...o }, 'WEB');
  assert.strictEqual(kodeError(() => kor({ merk: 'Hagr' })), 'MERK_TIDAK_VALID');
  assert.doesNotThrow(() => kor({ merk: 'Schneider', nomorMeter: '14500000009' }), 'merk tidak berubah');
});

test('merk: getIzinMaterial dan getStokYandal membawa daftar merk aktif terurut; tanpa master = daftar kosong', () => {
  const x = duniaPakai();
  assert.deepStrictEqual(j(x.g.getIzinMaterial_(x.admin, {}).merkMcb), []);
  assert.deepStrictEqual(j(x.g.getStokYandal_(x.p13, {}).merkMcb), []);
  pasangMerk(x, [['Schneider'], ['ABB'], ['Lama', false], ['Hager']]);
  assert.deepStrictEqual(j(x.g.getIzinMaterial_(x.admin, {}).merkMcb), ['ABB', 'Hager', 'Schneider']);
  assert.deepStrictEqual(j(x.g.getStokYandal_(x.p13, {}).merkMcb), ['ABB', 'Hager', 'Schneider']);
});

test('merk: ADMIN_siapkanSheetGudang membuat db_Merk_MCB dari merk yang sudah dipakai (tanpa dobel), aman diulang, tidak menimpa isi master', () => {
  const x = dunia();
  x.g.pastikanPemilik_ = () => {};
  x.tambah(1, { merk: 'Schneider' }); x.tambah(1, { merk: 'schneider ' }); x.tambah(1, { merk: 'Hager' });
  assert.strictEqual(x.sheets.m.db_Merk_MCB, undefined);
  assert.strictEqual(x.g.ADMIN_siapkanSheetGudang(), 0);
  const baris = x.sheets.m.db_Merk_MCB.data;
  assert.strictEqual(baris[0].join(','), MERK_HEADER.join(','));
  assert.deepStrictEqual(baris.slice(1).map((r) => r[2]).sort(), ['Hager', 'Schneider'], 'dedupe tanpa beda huruf besar/kecil');
  assert.deepStrictEqual(baris.slice(1).map((r) => r[0]), [1, 2]);
  assert.strictEqual(baris.slice(1).every((r) => r[3] === true && r[1]), true, 'aktif + merk_id terisi');
  x.sheets.m.db_Merk_MCB.data.push([3, 'idx', 'ABB', true, 1, '', '']);
  assert.strictEqual(x.g.ADMIN_siapkanSheetGudang(), 0);
  assert.strictEqual(x.sheets.m.db_Merk_MCB.data.length, 4, 'diulang tidak menggandakan / menimpa');
  assert.strictEqual(x.g.ADMIN_cekSheetGudang(), 0);
});

// ---------- satu konfigurasi: ADMIN_lengkapiMaster ikut menyiapkan master merk ----------
test('lengkapiMerk: tab dibuat dan diisi dari merk gudang, aman diulang; GUDANG_SHEET_ID kosong = dilewati', () => {
  const x = dunia();
  x.tambah(1, { merk: 'Hager' }); x.tambah(1, { merk: 'schneider' });
  const kunci = () => x.g.denganLock_(() => x.g.lengkapiMerkMcb_());
  assert.strictEqual(kunci(), 0);
  assert.deepStrictEqual(x.sheets.m.db_Merk_MCB.data.slice(1).map((r) => r[2]), ['Hager', 'schneider']);
  assert.strictEqual(kunci(), 0);
  assert.strictEqual(x.sheets.m.db_Merk_MCB.data.length, 3, 'tidak diisi ulang');
  const kosong = require('./harness').buatKonteks({ ENV: 'staging', MASTER_SHEET_ID: 'm', AUTH_SHEET_ID: 'a', KODE_ULP: '16130', ADMIN_EMAIL: 'x@y.z' });
  assert.strictEqual(kosong.lengkapiMerkMcb_(), 0);
});

test('lengkapiMerk: header tab beda = tidak menulis apa pun, melaporkan masalah', () => {
  const x = dunia();
  x.tambah(1, { merk: 'Hager' });
  x.sheets.m.db_Merk_MCB = sheetPalsu(x.log)('db_Merk_MCB', [['No', 'salah']]);
  assert.strictEqual(x.g.denganLock_(() => x.g.lengkapiMerkMcb_()), 1);
  assert.strictEqual(x.sheets.m.db_Merk_MCB.data.length, 1);
});

test('lengkapiMerk: ADMIN_lengkapiMaster membuat + mengisi master merk dan melengkapi baris manual (merk_id, No, aktif, revision)', () => {
  const x = dunia();
  x.g.pastikanPemilik_ = () => {};
  x.g.lengkapiDaerahPadam_ = () => 0;
  const buat = sheetPalsu(x.log);
  x.sheets.m.db_Jaringan = buat('db_Jaringan', [['section_id', 'penyulang', 'section', 'urutan', 'parent_section_id', 'aktif']]);
  x.sheets.m.db_Jenis_Pekerjaan = buat('db_Jenis_Pekerjaan', [['jenis_id', 'modul', 'nama', 'aktif', 'bobot']]);
  x.sheets.m.db_Daerah_Padam = buat('db_Daerah_Padam', [['nomor', 'daerah_id', 'penyulang', 'aktif']]);
  x.tambah(1, { merk: 'Hager' });
  const getRangeAsli = x.sheets.m.db_Tim.getRange;   // fake Sheets tanpa setNumberFormat berantai (dipakai penomoran kode tim)
  x.sheets.m.db_Tim.getRange = (...a) => { const r = getRangeAsli(...a); r.setNumberFormat = () => r; return r; };
  x.g.ADMIN_lengkapiMaster();
  const awal = x.sheets.m.db_Merk_MCB.data;
  assert.deepStrictEqual(awal.slice(1).map((r) => r[2]), ['Hager']);
  awal.push(['', '', 'ABB', '', '', '', '']);   // ditambah manual oleh admin: hanya nama merk
  x.g.ADMIN_lengkapiMaster();
  const b = x.sheets.m.db_Merk_MCB.data[2];
  assert.deepStrictEqual([b[0], b[2], b[3], b[4], b[6]], [2, 'ABB', 'TRUE', 1, 'admin-tools']);
  assert.ok(/^[0-9a-f-]{36}$/.test(b[1]), 'merk_id UUID');
  assert.deepStrictEqual(j(x.g.daftarMerkMcb_()), ['ABB', 'Hager'], 'aktif "TRUE" teks terbaca aktif');
});
