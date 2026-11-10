import assert from 'node:assert/strict';
import test from 'node:test';

import { daftarPenyulangCover, kebutuhanCover, nilaiCover, perSectionCover, ringkasCover, saringCover } from '../src/coverGardu.js';

const L = 'Lengkap';
const G = nilaiCover([
  { no: 'B2', penyulang: 'PALAS', section: 'S1', alamat: 'Jl A', nilai: [L, L, L, L, L, 'A3CS', 'Protective Sleeve'] },
  { no: 'B1', penyulang: 'PALAS', section: 'S2', alamat: 'BTS Menara', nilai: [L, '', L, L, L, L, 'Tidak'] },
  { no: 'A1', penyulang: 'TUNGKAL', section: '', alamat: 'Jl B', nilai: ['A3CS', L, L, L, L, L, L] },
]);

test('full hanya bila 7 komponen lengkap; A3CS hanya sah untuk jumperan', () => {
  const r = ringkasCover(G);
  assert.deepEqual([r.total, r.full.gardu.length, r.belum.gardu.length], [3, 1, 2]);
  assert.deepEqual(G[1].kurang, [1, 6]);
  assert.deepEqual(G[2].kurang, [0]);
});

test('tanpa BTS, urut nomor, hitungan komponen', () => {
  const r = ringkasCover(G);
  assert.deepEqual([r.totalTanpaBts, r.belum.tanpaBts], [2, 1]);
  assert.deepEqual(r.belum.gardu.map((g) => g.no), ['A1', 'B1']);
  assert.equal(r.komponen[0].belum, 1);
  assert.deepEqual(kebutuhanCover(G.filter((g) => g.kurang.length)).filter((x) => x.jumlah).map((x) => x.label), ['FCO Atas', 'FCO Bawah', 'Jumperan Bawah']);
});

test('filter penyulang banyak pilihan, daftar penyulang, per section', () => {
  assert.deepEqual(daftarPenyulangCover(G), ['PALAS', 'TUNGKAL']);
  assert.equal(saringCover(G, []).length, 3);
  assert.equal(saringCover(G, ['PALAS']).length, 2);
  assert.equal(saringCover(G, ['PALAS', 'TUNGKAL']).length, 3);
  assert.deepEqual(perSectionCover(G).map((s) => s.section), ['(Tanpa Section)', 'S1', 'S2']);
});
