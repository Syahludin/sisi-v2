import assert from 'node:assert/strict';
import test from 'node:test';

import { daftarBelum, daftarHilang, JENIS_KABEL, kartuPenyulang, rincianPenyulang, ringkasAset, teksKm, warnaJenis } from '../src/asetItb.js';

const S = (o) => ({ id: 'x', cx: '', cxUnit: 'ULP.16130', pny: '', desc: 'SEGMEN A - B', status: 'OPERATING', akhir: 0, jenis: 'AAAC', kategori: 'SUTM', panjang: 0,
  ukuran: '70', pnyLap: '', sumber: 'GARDU', gardu: '', ket: '', hilang: false, bulan: '2026-09', ...o });
const PALAS = { cx: '2456981', pny: 'PALAS', pnyLap: 'PALAS' };
const FIX = [
  S({ ...PALAS, jenis: 'AAAC', ukuran: '70', panjang: 101.23 }),
  S({ ...PALAS, jenis: 'AAAC', ukuran: '150', panjang: 30.51 }),
  S({ ...PALAS, jenis: 'AAACS', ukuran: '70', panjang: 11.68 }),
  S({ ...PALAS, jenis: 'AAACS', ukuran: '150', panjang: 1.49 }),
  S({ cx: '181382', pny: 'AIR BANTEN', pnyLap: 'AIR BANTEN', jenis: 'AAACS', ukuran: '150', panjang: 26.69 }),
  S({ ...PALAS, status: 'INVALID', panjang: 1.141 }),
  S({ ...PALAS, hilang: true, panjang: 5 }),
  S({ cx: '999', pny: 'TUNGKAL', pnyLap: '', sumber: 'BELUM', panjang: 2 }),
];

test('ringkas aset: total = SUTM + SKTM + Non-aktif, hilang tidak dihitung, tab Lapangan tanpa BELUM', () => {
  assert.deepEqual(ringkasAset(FIX, 'eam'), { total: 174.741, sutm: 173.6, sktm: 0, lainnya: 0, nonaktif: 1.141, belum: 0, hilang: 1 });
  assert.deepEqual(ringkasAset(FIX, 'lapangan'), { total: 172.741, sutm: 171.6, sktm: 0, lainnya: 0, nonaktif: 1.141, belum: 1, hilang: 1 });
  // pola sheet Rekap: 880,752 + 9,230 + 1,141 = 891,123 (tanpa galat pembulatan)
  const sheet = [S({ kategori: 'SUTM', panjang: 880.752 }), S({ kategori: 'SKTM', jenis: 'NA2XSEYBY - 3 CORE', panjang: 9.23 }), S({ status: 'INVALID', panjang: 1.141 })];
  assert.equal(ringkasAset(sheet, 'eam').total, 891.123);
});

test('kartu penyulang: tab EAM per CX, tab Lapangan tanpa BELUM, filter jenis, urut terpanjang', () => {
  const eam = kartuPenyulang(FIX, 'eam');
  assert.deepEqual(eam.map((k) => k.nama), ['PALAS', 'AIR BANTEN', 'TUNGKAL']);
  assert.equal(eam[0].kunci, '2456981');
  assert.equal(eam[0].total, 144.91);
  assert.equal(eam[0].nonaktif, 1.141);
  assert.deepEqual(eam[0].perJenis, [{ jenis: 'AAAC', km: 131.74 }, { jenis: 'AAACS', km: 13.17 }]);
  const lap = kartuPenyulang(FIX, 'lapangan');
  assert.deepEqual(lap.map((k) => k.nama), ['PALAS', 'AIR BANTEN'], 'BELUM tidak masuk kartu Lapangan');
  const aaacs = kartuPenyulang(FIX, 'eam', 'AAACS');
  assert.deepEqual(aaacs.map((k) => [k.nama, k.total]), [['AIR BANTEN', 26.69], ['PALAS', 13.17]]);
  assert.deepEqual(kartuPenyulang([], 'eam'), []);
});

test('rincian penyulang: matriks ukuran x jenis dan daftar segmen (tanpa hilang)', () => {
  const r = rincianPenyulang(FIX, 'eam', '2456981');
  assert.deepEqual(r.ukuran, ['70', '150']);
  assert.deepEqual(r.matriks, [{ jenis: 'AAAC', km: { 70: 101.23, 150: 30.51 } }, { jenis: 'AAACS', km: { 70: 11.68, 150: 1.49 } }]);
  assert.equal(r.segmen.length, 5);
  assert.equal(r.segmen[0].panjang, 101.23);
});

test('daftar segmen hilang dan belum terpetakan, teks km, warna jenis', () => {
  assert.deepEqual(daftarHilang(FIX).map((s) => s.panjang), [5]);
  assert.deepEqual(daftarBelum(FIX).map((s) => s.cx), ['999']);
  assert.equal(teksKm(26.689), '26,69');
  assert.equal(teksKm(0), '0,00');
  assert.deepEqual(JENIS_KABEL, ['AAAC', 'AAACS', 'N2XSEBY - 1 CORE', 'NA2XSEYBY - 3 CORE']);
  assert.deepEqual(['AAAC', 'AAACS', 'N2XSEBY - 1 CORE', 'NA2XSEYBY - 3 CORE', 'XYZ'].map(warnaJenis), ['k1', 'k2', 'k3', 'k4', 'k5']);
});
