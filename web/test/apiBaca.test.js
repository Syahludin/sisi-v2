import assert from 'node:assert/strict';
import test from 'node:test';

import { bacaMysql, bolehBacaMysql, kanon, lupakanTiket, simpanTiket, tiketBaca, urlBaca } from '../src/apiBaca.js';
import { bacaConfig } from '../src/config.js';

const res = (status, isi) => ({ ok: status === 200, status, json: async () => isi });

test('config: apiBacaUrl hanya https / path domain sama, garis miring akhir dibuang', () => {
  const c = (apiBacaUrl) => bacaConfig({ SISI_CONFIG: { apiUrl: '', apiBacaUrl } }).apiBacaUrl;
  assert.equal(c('/sisi-api-staging/'), '/sisi-api-staging');
  assert.equal(c('https://sisi-ulp-toboali.com/sisi-api'), 'https://sisi-ulp-toboali.com/sisi-api');
  assert.equal(c('http://contoh.id/api'), '');
  assert.equal(c('javascript:alert(1)'), '');
  assert.equal(c(undefined), '');
});

test('url baca: file PHP aksi + query terurut, kosong tidak dikirim', () => {
  assert.equal(urlBaca('/sisi-api', 'getHistoriGangguan', { sampai: '2026-10-27', dari: '2026-01-01', x: '' }),
    '/sisi-api/gangguan.php?dari=2026-01-01&sampai=2026-10-27');
  assert.equal(urlBaca('/sisi-api', 'getHistoriGangguan', {}), '/sisi-api/gangguan.php');
});

test('jawaban jadi gardu: kunci kanonik sama dengan backend, hanya aksi gardu yang dibaca dari MySQL', () => {
  assert.equal(kanon({ noGardu: 'TB1', garduId: 'g1', x: { b: 1, a: 2 } }), '{"garduId":"g1","noGardu":"TB1","x":{"a":2,"b":1}}');
  assert.equal(urlBaca('/sisi-api', 'getRiwayatGardu', { noGardu: 'TB1', garduId: 'g1' }),
    '/sisi-api/jawaban.php?aksi=getRiwayatGardu&data=' + encodeURIComponent('{"garduId":"g1","noGardu":"TB1"}'));
  assert.equal(bolehBacaMysql('getMaster', { modul: ['gardu'] }), true);
  assert.equal(bolehBacaMysql('getMaster', { modul: ['jaringan'] }), true);
  assert.equal(bolehBacaMysql('getMaster', { modul: ['pejabatBa'] }), false);
  assert.equal(bolehBacaMysql('getHiGardu', { noGardu: 'TB1' }), true);
  assert.equal(bolehBacaMysql('updateHiGardu', {}), false, 'tulis tidak pernah lewat MySQL');
});

test('tiket: disimpan di memori per token, diperbarui bila sisa < 1 menit', async () => {
  lupakanTiket();
  let n = 0;
  const ambil = async () => { n += 1; return { tiket: 't' + n, sampai: new Date(Date.now() + 15 * 60000).toISOString() }; };
  assert.equal(await tiketBaca('A', ambil), 't1');
  assert.equal(await tiketBaca('A', ambil), 't1');
  assert.equal(await tiketBaca('B', ambil), 't2', 'token lain = tiket baru');
  assert.equal(await tiketBaca('B', ambil, Date.now() + 14.5 * 60000), 't3', 'hampir habis = diperbarui');
  await assert.rejects(tiketBaca('C', async () => ({ tiket: 'x' })), { kode: 'JAWABAN_TIDAK_VALID' });
});

test('tiket: baca bersamaan = satu getTiketApi; tiket dari cekSesi dipakai langsung', async () => {
  lupakanTiket();
  let n = 0;
  const ambil = async () => { n += 1; await new Promise((r) => setTimeout(r, 20)); return { tiket: 'b' + n, sampai: new Date(Date.now() + 9e5).toISOString() }; };
  const hasil = await Promise.all([tiketBaca('A', ambil), tiketBaca('A', ambil), tiketBaca('A', ambil)]);
  assert.deepEqual([hasil, n], [['b1', 'b1', 'b1'], 1]);
  lupakanTiket();
  assert.equal(simpanTiket('A', { tiket: 'dariCek', sampai: new Date(Date.now() + 9e5).toISOString() }), true);
  assert.equal(await tiketBaca('A', ambil), 'dariCek');
  assert.equal(n, 1, 'tanpa getTiketApi');
  assert.equal(simpanTiket('A', undefined), false, 'cekSesi tanpa tiket (API belum diatur) = diabaikan');
});

test('baca MySQL: header tiket, amplop ok, galat API / belum sinkron / jaringan = GalatApi (pemanggil kembali ke Apps Script)', async () => {
  let minta;
  const data = { dari: '2026-01-01', sinkron: { waktu: 'x' }, penyulang: [] };
  const j = await bacaMysql('/sisi-api', 'getHistoriGangguan', { dari: '2026-01-01' }, 'TK', {}, async (url, o) => { minta = { url, o }; return res(200, { ok: true, data }); });
  assert.deepEqual(j.data, data);
  assert.equal(minta.url, '/sisi-api/gangguan.php?dari=2026-01-01');
  assert.equal(minta.o.headers['X-SiSi-Tiket'], 'TK');
  await assert.rejects(bacaMysql('/a', 'getHistoriGangguan', {}, 'T', {}, async () => res(401, { ok: false, kode: 'TIKET_KEDALUWARSA' })), { kode: 'TIKET_KEDALUWARSA' });
  await assert.rejects(bacaMysql('/a', 'getHistoriGangguan', {}, 'T', {}, async () => res(200, { ok: true, data: { sinkron: null } })), { kode: 'MYSQL_BELUM_SINKRON' });
  await assert.rejects(bacaMysql('/a', 'getHistoriGangguan', {}, 'T', {}, async () => { throw new Error('putus'); }), { kode: 'JARINGAN' });
  await assert.rejects(bacaMysql('/a', 'getHistoriGangguan', {}, 'T', {}, async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } })), { kode: 'JARINGAN' });
});
