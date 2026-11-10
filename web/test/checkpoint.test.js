import assert from 'node:assert/strict';
import test from 'node:test';

import { angkaHar, cocokCp, matriksHar, mingguBulan, opsiCp, pangkalSection, properNama } from '../src/checkpoint.js';

const HAR = {
  kolom: ['no', 'tanggal', 'section', 'ulp', 'insSutmKms', 'rowRabas'],
  baris: [[1, '2026-03-02', 'LBS A - GH B', 'TBL', 1.25, 2], [2, '2026-03-09', 'LBS C', 'TBL', 0, 3], [3, '2026-03-03', 'LBS A', 'TBL', 0.5, 0]],
  penyulang: ['PALAS', 'TUNGKAL', 'PALAS'],
};

test('section pangkal + filter penyulang / section', () => {
  assert.equal(pangkalSection('LBS Air Timur - GH Payung / LBS Mekar Jaya'), 'LBS Air Timur');
  assert.equal(cocokCp('Palas', 'LBS A - X', { penyulang: 'PALAS', section: 'LBS A' }), true);
  assert.equal(cocokCp('PALAS', 'LBS C', { section: 'LBS A' }), false);
});

test('matriks Har: slot bulan-minggu (ceil tanggal/7), total, filter', () => {
  const m = matriksHar(HAR);
  assert.deepEqual(m.data.rowRabas, { '2-1': 2, '2-2': 3 });
  assert.equal(m.total.insSutmKms, 1.75);
  assert.equal(matriksHar(HAR, { penyulang: 'PALAS' }).total.rowRabas, 2);
  assert.equal(matriksHar(HAR, { section: 'LBS C' }).total.rowRabas, 3);
  assert.equal(angkaHar(1.75), '1,75');
});

test('nama penyulang format proper', () => {
  assert.equal(properNama('PALAS'), 'Palas');
  assert.equal(properNama('sungai  kelik-2'), 'Sungai  Kelik-2');
  assert.equal(properNama(''), '');
});

test('minggu per bulan dan opsi filter', () => {
  const w = mingguBulan(2026);
  assert.deepEqual([w[0], w[1]], [5, 4]);
  const M = [{ penyulang: 'Palas', section: 'LBS A - X' }, { penyulang: 'PALAS', section: 'lbs a' }, { penyulang: 'Tungkal', section: 'LBS C' }];
  assert.deepEqual(opsiCp(M, ''), { penyulang: ['Palas', 'Tungkal'], section: ['LBS A', 'LBS C'] });
  assert.deepEqual(opsiCp(M, 'PALAS'), { penyulang: ['Palas', 'Tungkal'], section: ['LBS A'] });
});
