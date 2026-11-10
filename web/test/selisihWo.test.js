import assert from 'node:assert/strict';
import test from 'node:test';

import { gabungSelisihWo, saringStatusWo, ubahTemuanWo } from '../src/selisihWo.js';

const T = (id, tanggal, status, o = {}) => ({ temuanId: id, kodeTemuan: 'K-' + id, tanggal, wo: { status }, ...o });
const R = (o = {}) => ({ baru: 0, terkirim: 0, dikerjakan: 0, selesai: 0, ganda: 0, ...o });

test('v1.0.58 gabungSelisihWo: selisih menimpa, menambah, menjaga yang tak berubah; ringkas, tim, kursor dari selisih', () => {
  const lokal = { status: 'SEMUA', kursor: 'k1', ringkas: R({ baru: 2 }), tim: [{ timId: 't1' }], temuan: [T('a', '2026-11-01', ''), T('b', '2026-11-03', '')] };
  const selisih = { status: 'SEMUA', selisih: true, kursor: 'k2', ringkas: R({ baru: 2, terkirim: 1 }), tim: [{ timId: 't1' }, { timId: 't2' }],
    temuan: [T('a', '2026-11-01', 'TERKIRIM'), T('c', '2026-11-04', '')] };
  const h = gabungSelisihWo(lokal, selisih);
  assert.deepEqual(h.temuan.map((t) => [t.temuanId, t.wo.status]), [['c', ''], ['b', ''], ['a', 'TERKIRIM']], 'tanggal turun');
  assert.equal(h.kursor, 'k2');
  assert.deepEqual(h.ringkas, selisih.ringkas);
  assert.equal(h.tim.length, 2);
  assert.equal(lokal.temuan.length, 2, 'argumen tidak diubah');
});

test('v1.0.58 gabungSelisihWo: tanggal sama diurut kodeTemuan turun; tanpa lokal = isi selisih', () => {
  const h = gabungSelisihWo(null, { kursor: 'k', ringkas: R(), tim: [], temuan: [T('a', '2026-11-01', ''), T('b', '2026-11-01', '')] });
  assert.deepEqual(h.temuan.map((t) => t.temuanId), ['b', 'a']);
  assert.deepEqual(gabungSelisihWo({ temuan: [] }, { kursor: 'k', ringkas: R(), tim: [], temuan: [] }).temuan, []);
});

test('v1.0.58 ubahTemuanWo: ganti satu temuan, ringkas ikut pindah ember, temuan baru ditambah', () => {
  const lokal = { kursor: 'k', ringkas: R({ baru: 2, terkirim: 1, ganda: 1 }), tim: [], temuan: [T('a', '2026-11-01', ''), T('b', '2026-11-02', 'TERKIRIM')] };
  const h = ubahTemuanWo(lokal, T('a', '2026-11-01', 'TERKIRIM'));
  assert.equal(h.temuan.find((t) => t.temuanId === 'a').wo.status, 'TERKIRIM');
  assert.deepEqual(h.ringkas, R({ baru: 1, terkirim: 2, ganda: 1 }));
  const tarik = ubahTemuanWo(h, T('b', '2026-11-02', ''));
  assert.deepEqual(tarik.ringkas, R({ baru: 2, terkirim: 1, ganda: 1 }));
  const baru = ubahTemuanWo(lokal, T('z', '2026-11-05', ''));
  assert.deepEqual([baru.temuan[0].temuanId, baru.ringkas.baru], ['z', 3]);
  assert.equal(lokal.temuan.length, 2, 'argumen tidak diubah');
});

test('v1.0.58 saringStatusWo: BARU / TERKIRIM / DIKERJAKAN / SELESAI / AKTIF / SEMUA sama dengan aturan server', () => {
  const d = [T('a', 'x', ''), T('b', 'x', 'TERKIRIM'), T('c', 'x', 'DIKERJAKAN'), T('d', 'x', 'SELESAI'), { temuanId: 'e' }];
  const id = (s) => saringStatusWo(d, s).map((t) => t.temuanId).join('');
  assert.deepEqual(['BARU', 'TERKIRIM', 'DIKERJAKAN', 'SELESAI', 'AKTIF', 'SEMUA', ''].map(id), ['ae', 'b', 'c', 'd', 'abce', 'abcde', 'abcde']);
});
