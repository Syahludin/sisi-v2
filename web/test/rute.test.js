import test from 'node:test';
import assert from 'node:assert/strict';

import { alamatRute, bacaRute } from '../src/rute.js';
import { bacaTembolok, bolehTembolok, kosongkanTembolok, kunciSesi, kunciTembolok, tulisTembolok } from '../src/tembolok.js';

test('rute: baca alamat di bawah folder /sisi/ (halaman, id, query)', () => {
  assert.deepEqual(bacaRute('/sisi/', '', '/sisi/'), { halaman: '', id: '', query: {} });
  assert.deepEqual(bacaRute('/sisi', '', '/sisi/'), { halaman: '', id: '', query: {} });
  assert.deepEqual(bacaRute('/sisi/ukur-gardu/TB0002', '?tab=ukur', '/sisi/'), { halaman: 'ukur-gardu', id: 'TB0002', query: { tab: 'ukur' } });
  assert.deepEqual(bacaRute('/sisi/berita-acara/BA%2001', '', '/sisi/').id, 'BA 01');
  assert.deepEqual(bacaRute('/laporan-up3', '?tanggal=2026-10-25', '/').query, { tanggal: '2026-10-25' });
});

test('rute: susun alamat (query kosong dibuang, urutan tetap) dan bolak-balik', () => {
  assert.equal(alamatRute({}, '/sisi/'), '/sisi/');
  assert.equal(alamatRute({ halaman: 'approval-p0', id: 'x', query: { tab: '', tanggal: '2026-10-25' } }, '/sisi/'), '/sisi/approval-p0/x?tanggal=2026-10-25');
  const r = { halaman: 'berita-acara', id: 'a/b c', query: { tahap: 'DRAFT', cari: 'TB 01' } };
  const a = alamatRute(r, '/sisi/');
  const [p, q] = a.split('?');
  assert.deepEqual(bacaRute(p, '?' + q, '/sisi/'), r);
});

test('tembolok: kunci tidak bergantung urutan field, hanya baca (bukan unduhan berkas)', () => {
  assert.equal(kunciTembolok('t', 'getX', { a: 1, b: { d: 2, c: 3 } }), kunciTembolok('t', 'getX', { b: { c: 3, d: 2 }, a: 1 }));
  assert.notEqual(kunciTembolok('t', 'getX', { a: 1 }), kunciTembolok('u', 'getX', { a: 1 }));
  assert.deepEqual(['getDaftarBaGardu', 'getPdfBaGardu', 'getTtdBaGardu', 'getFileArsipBaGardu', 'simpanX', 'login'].map(bolehTembolok),
    [true, false, false, false, false, false]);
});

test('v1.0.45 tembolok laporan: per akun di localStorage (bertahan login ulang), tidak dibuang saat simpan, dibuang saat keluar', () => {
  const wadah = () => { const m = new Map(); return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  globalThis.window = { localStorage: wadah(), sessionStorage: wadah() };
  try {
    const s1 = { token: 'tokenA'.repeat(4), profil: { userId: 'u-1' } }, s2 = { token: 'tokenB'.repeat(4), profil: { userId: 'u-1' } };
    const k = kunciSesi(s1, 'getLaporanUp3', { tanggal: '2026-10-29' });
    assert.equal(k, kunciSesi(s2, 'getLaporanUp3', { tanggal: '2026-10-29' }), 'login ulang = kunci sama');
    assert.notEqual(k, kunciSesi({ ...s1, profil: { userId: 'u-2' } }, 'getLaporanUp3', { tanggal: '2026-10-29' }));
    assert.notEqual(kunciSesi(s1, 'getMaster', {}), kunciSesi(s2, 'getMaster', {}), 'action lain tetap per token');
    assert.notEqual(kunciSesi(s1, 'getWoAdmin', { status: 'BARU' }), kunciSesi(s2, 'getWoAdmin', { status: 'BARU' }), 'v1.0.58: daftar WO pindah ke simpananWo.js (IndexedDB); tembolok biasa per token');
    tulisTembolok(k, { ok: true, data: { x: 1 } });
    tulisTembolok(kunciSesi(s1, 'getMaster', {}), { ok: true });
    assert.equal(window.localStorage.length, 1);
    assert.equal(window.sessionStorage.length, 1);
    kosongkanTembolok();   // penyimpanan berhasil
    assert.deepEqual([window.localStorage.length, window.sessionStorage.length], [1, 0]);
    assert.deepEqual(bacaTembolok(k).j, { ok: true, data: { x: 1 } }, 'dibaca ulang dari localStorage');
    kosongkanTembolok(true);   // keluar
    assert.deepEqual([window.localStorage.length, bacaTembolok(k)], [0, null]);
  } finally {
    delete globalThis.window;
  }
});
