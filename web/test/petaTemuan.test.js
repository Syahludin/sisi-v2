import test from 'node:test';
import assert from 'node:assert/strict';

import { koordinatTemuan, rentangAwalPeta, ringkasPeta, saringPeta, statusPeta } from '../src/petaTemuan.js';

const T = (o) => ({ temuanId: 'x', kodeTemuan: 'IJR-1', jenisTemuan: 'FCO rusak', penyulang: 'Bikang', koordinat: '-3.01, 106.5', wo: { status: '' }, ...o });

test('v1.0.50 peta temuan: status = legenda v1, koordinat dibaca aman', () => {
  assert.deepEqual(['', 'TERKIRIM', 'DIKERJAKAN', 'SELESAI', 'ANEH'].map((s) => statusPeta(T({ wo: { status: s } })).label),
    ['Belum Ada Tim', 'Penugasan Tim', 'Progress Pekerjaan', 'Selesai', 'Belum Ada Tim']);
  assert.deepEqual(koordinatTemuan(T()), [-3.01, 106.5]);
  assert.deepEqual(['', 'abc', '0, 0', '-95, 106', '-3.01;106.5'].map((k) => koordinatTemuan(T({ koordinat: k }))), [null, null, null, null, null]);
  assert.deepEqual(rentangAwalPeta('2026-10-30'), { dari: '2026-10-01', sampai: '2026-10-30' });
});

test('v1.0.50 peta temuan: saring status / penyulang / jenis / cari, ringkasan + tanpa koordinat', () => {
  const d = [T(), T({ temuanId: 'y', kodeTemuan: 'IGD-2', jenisTemuan: 'Trafo bocor', penyulang: 'Kejaksaan', wo: { status: 'SELESAI' }, koordinat: '' })];
  assert.equal(saringPeta(d, { status: 'SELESAI' }).length, 1);
  assert.equal(saringPeta(d, { penyulang: 'Bikang' })[0].kodeTemuan, 'IJR-1');
  assert.equal(saringPeta(d, { jenis: 'Trafo bocor' })[0].kodeTemuan, 'IGD-2');
  // v1.0.50 pilihan ganda: array = salah satu cocok, array kosong = semua
  assert.equal(saringPeta(d, { penyulang: ['Bikang', 'Rias'], jenis: [] }).length, d.filter((t) => ['Bikang', 'Rias'].includes(t.penyulang)).length);
  assert.equal(saringPeta(d, { penyulang: [], jenis: [] }).length, d.length);
  assert.equal(saringPeta(d, { cari: 'igd' }).length, 1);
  assert.deepEqual(ringkasPeta(d), { total: 2, per: { BELUM: 1, TERKIRIM: 0, DIKERJAKAN: 0, SELESAI: 1 }, tanpaKoordinat: 1 });
});

test('rekap jenis temuan: kelompok per jenis, pivot section, filter penyulang & jenis banyak pilihan', async () => {
  const { rekapJenisTemuan, satuanTemuan } = await import('../src/petaTemuan.js');
  const B = [
    { penyulang: 'PALAS', section: 'S1', jenisTemuan: 'Tebang Sedang', tier: 'Tier 1', jumlah: 2 },
    { penyulang: 'TUNGKAL', section: 'S2', jenisTemuan: 'Tebang Sedang', tier: 'Tier 1', jumlah: 1 },
    { penyulang: 'PALAS', section: 'S1', jenisTemuan: 'Isolator Pecah', tier: '', jumlah: 4 },
  ];
  const r = rekapJenisTemuan(B);
  assert.equal(r.total, 7);
  assert.deepEqual(r.kolom.map((c) => [c.penyulang, c.section]), [['PALAS', 'S1'], ['TUNGKAL', 'S2']]);
  // review 8 Nov 2026: tier berurutan Tier 1, Tier 2, ..., Belum dipetakan paling akhir
  assert.deepEqual(r.rows.map((x) => [x.jenisTemuan, x.tier, x.volume, x.satuan]), [['Tebang Sedang', 'Tier 1', 3, 'Btg'], ['Isolator Pecah', 'Belum dipetakan', 4, 'Titik']]);
  assert.deepEqual(r.perTier, [{ tier: 'Tier 1', jenis: 1, volume: 3 }, { tier: 'Belum dipetakan', jenis: 1, volume: 4 }]);
  assert.deepEqual(r.grupPenyulang, [{ penyulang: 'PALAS', jumlahKolom: 1, total: 6 }, { penyulang: 'TUNGKAL', jumlahKolom: 1, total: 1 }]);
  assert.equal(r.maks, 4);
  assert.equal(rekapJenisTemuan(B, { penyulang: ['PALAS'] }).total, 6);
  assert.equal(rekapJenisTemuan(B, { penyulang: ['PALAS', 'TUNGKAL'], jenis: ['Tebang Sedang'] }).total, 3);
  assert.equal(satuanTemuan('Rabas / Pangkas'), 'Gwg');
});

test('rekap jenis temuan (review 8 Nov 2026): section bernama sama di dua penyulang = dua kolom; tier diurut angka', async () => {
  const { rekapJenisTemuan } = await import('../src/petaTemuan.js');
  const r = rekapJenisTemuan([
    { penyulang: 'TUNGKAL', section: 'LBS A - Ujung', jenisTemuan: 'Tiang Miring', tier: 'Tier 10', jumlah: 1 },
    { penyulang: 'PALAS', section: 'LBS A - Ujung', jenisTemuan: 'Tiang Miring', tier: 'Tier 10', jumlah: 2 },
    { penyulang: 'PALAS', section: 'GH - LBS A', jenisTemuan: 'Pohon', tier: 'Tier 2', jumlah: 3 },
  ]);
  assert.deepEqual(r.kolom.map((c) => c.kunci), ['palas|gh - lbs a', 'palas|lbs a - ujung', 'tungkal|lbs a - ujung']);
  assert.deepEqual(r.rows.map((x) => [x.tier, x.perKolom]), [['Tier 2', { 'palas|gh - lbs a': 3 }], ['Tier 10', { 'palas|lbs a - ujung': 2, 'tungkal|lbs a - ujung': 1 }]]);
  assert.deepEqual(r.grupPenyulang.map((g) => [g.penyulang, g.jumlahKolom]), [['PALAS', 2], ['TUNGKAL', 1]]);
  assert.deepEqual(rekapJenisTemuan([]), { kolom: [], grupPenyulang: [], rows: [], perTier: [], total: 0, maks: 0 });
});

test('rekapJenisTemuan: section diurutkan menurut nomor, bukan abjad', async () => {
  const { rekapJenisTemuan } = await import('../src/petaTemuan.js');
  const b = ['Section 10', 'Section 2', 'Section 1'].map((s) => ({ penyulang: 'A', section: s, jenisTemuan: 'X', tier: 'Tier 1', jumlah: 1 }));
  assert.deepEqual(rekapJenisTemuan(b).kolom.map((k) => k.section), ['Section 1', 'Section 2', 'Section 10']);
});
