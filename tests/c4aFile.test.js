/** C4A: adapter file UIW .xlsx (permintaan Master Guswan 15 Nov 2026). Drive / Sheet / UrlFetch dipalsukan. */
const test = require('node:test');
const assert = require('node:assert');
const { j, kodeError } = require('./gudangUji');
const { duniaC4A, duniaFile } = require('./duniaC4A');

test('periksa awal: properti kosong / file tidak bisa dibuka / tanpa hak edit / folder / ukuran 41 MB -> ok false dengan bantu', () => {
  assert.deepStrictEqual(j(duniaC4A().h.periksaAwalUiw_()), { ok: false, bantu: 'property UIW_FILE_ID kosong' });
  let x = duniaFile();
  assert.strictEqual(x.h.periksaAwalUiw_().ok, true);
  x.gagal.get = 'UIWX';
  assert.deepStrictEqual(j(x.h.periksaAwalUiw_()), { ok: false, bantu: 'akses file UIW' });
  assert.deepStrictEqual(j(duniaFile({ bisaEdit: false }).h.periksaAwalUiw_()), { ok: false, bantu: 'akses file UIW' });
  assert.deepStrictEqual(j(duniaFile({ folderBisa: false }).h.periksaAwalUiw_()), { ok: false, bantu: 'akses folder foto' });
  assert.deepStrictEqual(j(duniaFile({ ukuran: 41 * 1024 * 1024 }).h.periksaAwalUiw_()), { ok: false, bantu: 'file mendekati batas' });
});

test('tulis: judul kolom Temuan diubah -> STRUKTUR_UIW_BERUBAH, cadangan dan update tidak dipanggil, sementara dihapus (Review Focus 4)', () => {
  const x = duniaFile();
  x.tmp.Temuan.data[0][2] = 'Kategori Temuan';
  assert.strictEqual(kodeError(() => x.h.tulisFileUiw_({ upsert: [], hapus: [] })), 'STRUKTUR_UIW_BERUBAH');
  assert.deepStrictEqual(x.panggil.filter((p) => /^(cadangan|update)/.test(p)), []);
  assert.ok(x.panggil.includes('remove:tmp'));
});

test('tulis: nama sheet beda spasi / karakter tak kasatmata / huruf besar tetap dikenali; sheet hilang = galat menyebut sheet yang ada', () => {
  const x = duniaFile();
  const aneh = ' kms​';
  x.tmp[aneh] = x.tmp['KMS'];
  delete x.tmp['KMS'];
  const h = x.h.tulisFileUiw_({ upsert: [{ sheet: 'KMS', nilai: { Id: 'aaaa0001', UP3: 'U', ULP: 'L', Penyulang: 'P', Section: 'S', Panjang: 1.5 } }], hapus: [] });
  assert.strictEqual(h.ditulis, 1);
  assert.deepStrictEqual(x.tmp[aneh].data.slice(1).map((r) => r[0]), ['aaaa0001']);
  delete x.tmp[aneh];
  let galat;
  try { x.h.tulisFileUiw_({ upsert: [], hapus: [] }); } catch (e) { galat = e; }
  assert.strictEqual(galat.kode, 'STRUKTUR_UIW_BERUBAH');
  assert.strictEqual(galat.detail, 'KMS: sheet tidak ada (sheet di file: ["Inspeksi","Temuan","Chart_Persentase","Rekap"])');
});

test('tulis: upsert berdasarkan kunci, ID dipaksa teks, hapus baris, sheet lain utuh, ID file sama, urutan cadangan -> update', () => {
  const x = duniaFile();
  const h = x.h.tulisFileUiw_({
    upsert: [
      { sheet: 'Inspeksi', nilai: { InspeksiID: '81701029', Tanggal: '2026-11-15', UP3: 'UP3 BANGKA', ULP: 'TOBOALI', Penyulang: 'PNY-A', Section: 'ACR Palas', Petugas: 'Admin Utama' } },
      { sheet: 'Inspeksi', nilai: { InspeksiID: '1e100000', Tanggal: '2026-11-15', UP3: 'UP3 BANGKA', ULP: 'TOBOALI', Penyulang: 'PNY-B', Section: 'GH', Petugas: 'Admin Dua' } },
      { sheet: 'KMS', nilai: { Id: '1e100000', UP3: 'UP3 BANGKA', ULP: 'TOBOALI', Penyulang: 'PNY-B', Section: 'GH', Panjang: 1.5 } },
    ],
    hapus: [{ sheet: 'Temuan', kunci: 'zzzz0000' }],
  });
  assert.deepStrictEqual(j(h), { ditulis: 3, dihapus: 0 });
  assert.deepStrictEqual(x.tmp.Inspeksi.data.map((r) => r[0]), ['InspeksiID', '81701029', '1e100000']);
  assert.strictEqual(x.tmp.Inspeksi.data[1][6], 'Admin Utama', 'baris lama diperbarui, bukan ditambah');
  assert.deepStrictEqual(x.tmp.Chart_Persentase.data, [['Label', 'Nilai'], ['Close', '=X'], ['Open', '=Y']]);
  const urut = x.panggil.filter((p) => /^(copy|cadangan|ekspor|update|remove)/.test(p));
  assert.deepStrictEqual(urut, ['copy:UIWX:application/vnd.google-apps.spreadsheet', 'cadangan:UIWX', 'ekspor', 'update:UIWX', 'remove:tmp']);
  // hapus baris yang ada
  const h2 = x.h.tulisFileUiw_({ upsert: [], hapus: [{ sheet: 'Inspeksi', kunci: '1e100000' }, { sheet: 'KMS', kunci: '1e100000' }] });
  assert.deepStrictEqual(j(h2), { ditulis: 0, dihapus: 2 });
  assert.deepStrictEqual(x.tmp.Inspeksi.data.map((r) => r[0]), ['InspeksiID', '81701029']);
});

test('tulis: ID ditulis dengan awalan kutip supaya Sheet tidak mengubahnya jadi angka', () => {
  const x = duniaFile();
  const ditulis = [];
  const asli = x.tmp.Inspeksi.appendRow;
  x.tmp.Inspeksi.appendRow = (v) => { ditulis.push(v.slice()); asli(v); };
  x.h.tulisFileUiw_({ upsert: [{ sheet: 'Inspeksi', nilai: { InspeksiID: '12345678', Tanggal: '2026-11-15', UP3: 'U', ULP: 'L', Penyulang: 'P', Section: 'S', Petugas: 'A' } }], hapus: [] });
  assert.strictEqual(ditulis[0][0], "'12345678");
});

test('tulis: ekspor / update gagal -> galat dilempar, sementara tetap dihapus', () => {
  const x = duniaFile();
  x.gagal.update = true;
  assert.throws(() => x.h.tulisFileUiw_({ upsert: [], hapus: [] }), /upload gagal/);
  assert.ok(x.panggil.includes('remove:tmp'));
});

test('salin foto ke Temuan_Images: sudah ada dengan nama sama = tidak disalin lagi; hapus foto = buang ke sampah', () => {
  const x = duniaFile();
  x.h.salinFotoUiw_('F1', 'bbbb0001.Foto Awal.090000.jpg');
  x.h.salinFotoUiw_('F1', 'bbbb0001.Foto Awal.090000.jpg');
  assert.deepStrictEqual(x.drive.salinan.map((s) => [s.id, s.nama, s.folder]), [['F1', 'bbbb0001.Foto Awal.090000.jpg', 'FOLD']]);
  x.h.hapusFotoUiw_('bbbb0001.Foto Awal.090000.jpg');
  assert.deepStrictEqual(x.drive.dihapus, ['n:bbbb0001.Foto Awal.090000.jpg']);
});

