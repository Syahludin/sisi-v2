const test = require('node:test');
const assert = require('node:assert');
const { U, j, kodeError, duniaPakai, A, banyak } = require('./gudangUji');

// ---------- Tugas 8: baca foto Drive privat + alat konsistensi ----------
function pasangDrive(x) {
  x.g.DriveApp = { getFileById: (id) => ({ getThumbnail: () => ({ getBytes: () => [1, 2, 3, id.length] }), getMimeType: () => 'image/jpeg', getBlob: () => ({ getBytes: () => [9, 9] }) }) };
}

test('gudang foto: admin membaca foto pemeriksaan / pemakaian / mutasi; ukuran PENUH memberi file asli', () => {
  const x = duniaPakai();
  pasangDrive(x);
  const idPakai = j(x.pakai()).pemakaianId;
  const idPr = x.kol('db_Stok_Pemeriksaan', x.baris('db_Stok_Pemeriksaan')[0], 'pemeriksaan_id');
  const f1 = j(x.g.getFotoGudang_(x.admin, { jenis: 'PEMAKAIAN', id: idPakai }));
  assert.deepStrictEqual([f1.jenis, f1.kecil, f1.mime], ['PEMAKAIAN', true, 'image/jpeg']);
  const f2 = j(x.g.getFotoGudang_(x.admin, { jenis: 'PEMERIKSAAN', id: idPr, ukuran: 'PENUH' }));
  assert.deepStrictEqual([f2.kecil, f2.ukuranByte], [false, 2]);
  x.tambah(1, { foto: x.fotoUji() });
  const idMut = x.kol('db_Material_Mutasi', x.baris('db_Material_Mutasi').pop(), 'mutasi_id');
  assert.strictEqual(j(x.g.getFotoGudang_(x.admin, { jenis: 'MUTASI', id: idMut })).jenis, 'MUTASI');
});

test('gudang foto: foto kosong = FOTO_TIDAK_ADA; id asing = DATA_TIDAK_DITEMUKAN; jenis dan field dijaga', () => {
  const x = duniaPakai();
  pasangDrive(x);
  x.tambah(1);
  const idMut = x.kol('db_Material_Mutasi', x.baris('db_Material_Mutasi').pop(), 'mutasi_id');
  assert.strictEqual(kodeError(() => x.g.getFotoGudang_(x.admin, { jenis: 'MUTASI', id: idMut })), 'FOTO_TIDAK_ADA');
  assert.strictEqual(kodeError(() => x.g.getFotoGudang_(x.admin, { jenis: 'PEMAKAIAN', id: U() })), 'DATA_TIDAK_DITEMUKAN');
  assert.strictEqual(kodeError(() => x.g.getFotoGudang_(x.admin, { jenis: 'LAIN', id: U() })), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.g.getFotoGudang_(x.admin, { jenis: 'MUTASI', id: idMut, x: 1 })), 'FIELD_TIDAK_DIKENAL');
});

test('gudang foto: petugas Yandal hanya foto timnya; foto gudang dan tim lain ditolak; endpoint admin ditolak untuk petugas', () => {
  const x = duniaPakai();
  pasangDrive(x);
  const idPakai = j(x.pakai()).pemakaianId;
  assert.strictEqual(j(x.g.getFotoGudangYandal_(x.p13, { jenis: 'PEMAKAIAN', id: idPakai })).id, idPakai);
  assert.strictEqual(kodeError(() => x.g.getFotoGudangYandal_(x.p14, { jenis: 'PEMAKAIAN', id: idPakai })), 'BUKAN_MILIK_TIM');
  x.tambah(1, { foto: x.fotoUji() });
  const idMut = x.kol('db_Material_Mutasi', x.baris('db_Material_Mutasi').pop(), 'mutasi_id');
  assert.strictEqual(kodeError(() => x.g.getFotoGudangYandal_(x.p13, { jenis: 'MUTASI', id: idMut })), 'BUKAN_MILIK_TIM', 'mutasi gudang bukan milik tim');
  assert.strictEqual(kodeError(() => x.g.getFotoGudang_(x.p13, { jenis: 'PEMAKAIAN', id: idPakai })), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.g.getFotoGudangYandal_(x.admin, { jenis: 'PEMAKAIAN', id: idPakai })), 'AKSES_DITOLAK');
});

test('gudang konsistensi: ADMIN_cekKonsistensiGudang bersih saat normal, melaporkan mutasi yatim dan pemakaian tanpa mutasi', () => {
  const x = duniaPakai();
  x.g.pastikanPemilik_ = () => {};
  x.pakai(); x.pakai();
  assert.strictEqual(x.g.ADMIN_cekKonsistensiGudang(), 0);
  const m = x.sheets.g.db_Material_Mutasi.data;
  const idxJenis = x.sk.GUDANG_SHEET_ID.db_Material_Mutasi.indexOf('jenis_mutasi');
  const baris = m.findIndex((r, i) => i > 0 && r[idxJenis] === 'PAKAI');
  m.splice(baris, 1);
  assert.strictEqual(x.g.ADMIN_cekKonsistensiGudang(), 1, 'pemakaian tanpa mutasi PAKAI');
  x.sheets.g.db_Pemakaian_MCB.data.splice(2, 1);
  assert.strictEqual(x.g.ADMIN_cekKonsistensiGudang(), 2, 'pemakaian pertama tanpa mutasi + mutasi pemakaian kedua yatim');
});

test('gudang konsistensi: pemakaian BATAL tidak dianggap tanpa mutasi; selisih tanpa pemeriksaan dilaporkan', () => {
  const x = duniaPakai();
  x.g.pastikanPemilik_ = () => {};
  const id = j(x.pakai()).pemakaianId;
  x.g.batalkanPemakaian_(x.admin, { pemakaianId: id, revision: 1, alasan: 'salah' }, 'WEB');
  assert.strictEqual(x.g.ADMIN_cekKonsistensiGudang(), 0);
  const y = duniaPakai({ periksa: false });
  y.g.pastikanPemilik_ = () => {};
  y.periksa(banyak(A, 1));
  y.sheets.g.db_Stok_Pemeriksaan.data.splice(1, 1);
  assert.ok(y.g.ADMIN_cekKonsistensiGudang() >= 1);
});
