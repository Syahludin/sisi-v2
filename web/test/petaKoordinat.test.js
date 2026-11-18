import test from 'node:test';
import assert from 'node:assert/strict';

import { bacaTiangPeta, jarakM, ringkasPeta, saringPeta } from '../src/petaKoordinat.js';

const baris = [
  ['1', 'PLS0001', -3, 106.5, -3.002, 106.507, '', '', '', '', '', '', '', '', 'BELUM'],                          // GIS, bergeser ±795 m
  ['2', 'PLS0002', -3, 106.5009, '', '', -3.002, 106.5079, '', '', '', '1', 50, '', 'BELUM'],                    // taksiran
  ['3', 'PLS0003', -3, 106.5018, '', '', '', '', -3.0001, 106.5019, 'lapangan', '2', 220, 'gawang_panjang|zigzag', 'TERVERIFIKASI'],   // hanya ITB + lapangan
  ['4', 'PLS0004', '', '', '', '', '', '', '', '', '', '', '', '', 'BELUM'],                                      // tanpa koordinat
];

test('peta koordinat: terdaftar = GIS, lalu taksiran, lalu ITB; selisih ke ITB hanya untuk GIS / taksiran', () => {
  const d = bacaTiangPeta(baris);
  assert.deepEqual(d.map((t) => t.sumber), ['GIS', 'TAKSIRAN', 'ITB', null]);
  assert.deepEqual(d[0].terdaftar, [-3.002, 106.507]);
  assert.ok(d[0].selisihM > 700 && d[0].selisihM < 900, 'bergeser ±795 m: ' + d[0].selisihM);
  assert.equal(d[2].selisihM, null);
  assert.deepEqual([d[2].tanda, d[2].gawangM, d[2].indukId, d[2].lapangan], [['gawang_panjang', 'zigzag'], 220, '2', [-3.0001, 106.5019]]);
  assert.equal(d[3].terdaftar, null);
});

test('peta koordinat: saring per sumber, tanda gawang, bergeser, dan nama; tanpa koordinat tak pernah tampil', () => {
  const d = bacaTiangPeta(baris);
  assert.deepEqual(saringPeta(d).map((t) => t.id), ['1', '2', '3']);
  assert.deepEqual(saringPeta(d, { sumber: ['GIS'] }).map((t) => t.id), ['1']);
  assert.deepEqual(saringPeta(d, { hanyaTanda: true }).map((t) => t.id), ['3']);
  assert.deepEqual(saringPeta(d, { hanyaBergeser: true }).map((t) => t.id), ['1', '2']);
  assert.deepEqual(saringPeta(d, { cari: ' pls0002 ' }).map((t) => t.id), ['2']);
});

test('peta koordinat: ringkasan jumlah per sumber, bertanda, bergeser, lapangan; jarak haversine', () => {
  assert.deepEqual(ringkasPeta(bacaTiangPeta(baris)), { total: 4, GIS: 1, TAKSIRAN: 1, ITB: 1, tanpa: 1, bertanda: 1, bergeser: 2, lapangan: 1 });
  assert.ok(Math.abs(jarakM([-3, 106.5], [-3, 106.501]) - 111.2) < 1);
});
