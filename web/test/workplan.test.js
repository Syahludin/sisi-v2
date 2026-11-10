import assert from 'node:assert/strict';
import test from 'node:test';

import { menuTampil } from '../src/katalog.js';
import { angkaWorkplan, opsiWorkplan, saringWorkplan, tglPendek, tsvWorkplan } from '../src/workplan.js';

const b = (penyulang, jenis, realisasi, total) => ({ penyulang, section: 'S1', jenis, satuan: 'titik', realisasi, total });

test('Workplan UP3: opsi dropdown dari master jaringan (penyulang unik, section milik penyulang terpilih), cadangan dari baris', () => {
  const master = [
    { penyulang: 'BIKANG', section: 'PMT BIKANG' }, { penyulang: 'bikang', section: 'LBS A - LBS B' },
    { penyulang: 'KOTA', section: 'PMT KOTA' }, { penyulang: 'Kota', section: 'PMT KOTA' },
  ];
  assert.deepEqual(opsiWorkplan(master, '').penyulang, ['Bikang', 'Kota']);
  assert.deepEqual(opsiWorkplan(master, '').section, []);
  assert.deepEqual(opsiWorkplan(master, 'Bikang').section, ['LBS A - LBS B', 'PMT BIKANG']);
  assert.deepEqual(opsiWorkplan([], 'KOTA', [b('KOTA', 'Tebang', [], 0)]).section, ['S1']);
  assert.deepEqual(opsiWorkplan(null, '', [b('KOTA', 'Tebang', [], 0)]).penyulang, ['Kota']);
});

test('Workplan UP3: saring penyulang sama persis tanpa beda huruf, section utuh atau salah satu bagian "A / B"', () => {
  const semua = [{ ...b('BIKANG', 'Pangkas', [], 0), section: 'LBS A - LBS B / FCO X' }, b('KOTA', 'Tebang', [], 0), b('BIKANGAN', 'Tebang', [], 0)];
  assert.equal(saringWorkplan(semua, {}).length, 3);
  assert.deepEqual(saringWorkplan(semua, { penyulang: 'bikang' }).map((x) => x.penyulang), ['BIKANG']);
  assert.equal(saringWorkplan(semua, { penyulang: 'Bikang', section: 'fco x' }).length, 1);
  assert.equal(saringWorkplan(semua, { penyulang: 'Bikang', section: 'LBS A - LBS B' }).length, 1);
  assert.equal(saringWorkplan(semua, { penyulang: 'Bikang', section: 'Lain' }).length, 0);
});

test('Workplan UP3: teks salin = judul + satu baris per kegiatan, koma desimal, nol = sel kosong', () => {
  const tsv = tsvWorkplan([b('BIKANG', 'Pangkas', [0, 2.5], 2.5)], ['2026-11-05', '2026-11-06']);
  assert.equal(tsv, 'No\tPenyulang\tSection\tJenis Kegiatan\tSatuan\t05/11\t06/11\tTotal\n1\tBIKANG\tS1\tPangkas\ttitik\t\t2,5\t2,5');
});

test('Workplan UP3: format tampil dan menu sendiri OPS_WORKPLAN_UP3', () => {
  assert.equal(tglPendek('2026-11-05'), '05/11');
  assert.equal(angkaWorkplan(0), '-');
  assert.equal(angkaWorkplan(2.5), '2,5');
  assert.equal(angkaWorkplan(''), '');
  assert.deepEqual(menuTampil({ menu: [{ kode: 'OPS_WORKPLAN_UP3', aksi: 'LIHAT' }] }).map((m) => m.halaman), ['workplan-up3']);
});

import { gabungWorkplan, hariWorkplan, ringkasWorkplan, totalWorkplan } from '../src/workplan.js';

test('Workplan UP3 (review 8 Nov 2026): sel Penyulang / Section bergabung per kelompok berurutan', () => {
  const baris = [
    { penyulang: 'Bikang', section: 'A', jenis: 'Pangkas' }, { penyulang: 'Bikang', section: 'A', jenis: 'Tebang' },
    { penyulang: 'bikang', section: 'B', jenis: 'Pangkas' },
    { penyulang: 'Kota', section: 'B', jenis: 'Pangkas' }, { penyulang: 'Kota', section: 'b', jenis: 'Tebang' },
  ];
  assert.deepEqual(gabungWorkplan(baris), [
    { penyulang: 3, section: 2, grup: 0 }, { penyulang: 0, section: 0, grup: 0 }, { penyulang: 0, section: 1, grup: 0 },
    { penyulang: 2, section: 2, grup: 1 }, { penyulang: 0, section: 0, grup: 1 },
  ]);
  assert.deepEqual(gabungWorkplan([]), []);
});

test('Workplan UP3 (review 8 Nov 2026): total per tanggal, ringkasan per jenis, hari + akhir pekan', () => {
  const baris = [
    { penyulang: 'Bikang', section: 'A', jenis: 'Pangkas', satuan: 'titik', realisasi: [1, 0, 2.5], total: 3.5 },
    { penyulang: 'Bikang', section: 'A', jenis: 'Tebang', satuan: 'titik', realisasi: [0, 4, 0], total: 4 },
    { penyulang: 'Kota', section: 'B', jenis: 'Pangkas', satuan: 'titik', realisasi: [0.1, 0.2, 0], total: 0.3 },
  ];
  assert.deepEqual(totalWorkplan(baris, 3), { kolom: [1.1, 4.2, 2.5], semua: 7.8 });
  assert.deepEqual(ringkasWorkplan(baris), { jenis: [{ jenis: 'Tebang', satuan: 'titik', total: 4 }, { jenis: 'Pangkas', satuan: 'titik', total: 3.8 }], penyulang: 2, section: 2 });
  assert.deepEqual(hariWorkplan('2026-11-07'), { hari: 'Sab', libur: true });
  assert.deepEqual(hariWorkplan('2026-11-08'), { hari: 'Min', libur: true });
  assert.deepEqual(hariWorkplan('2026-11-09'), { hari: 'Sen', libur: false });
  assert.deepEqual(hariWorkplan('x'), { hari: '', libur: false });
});
