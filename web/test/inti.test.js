import assert from 'node:assert/strict';
import test from 'node:test';

import { GalatApi, panggil } from '../src/api.js';
import { bacaConfig } from '../src/config.js';
import { namaPerangkat } from '../src/perangkat.js';
import { pesan, SESI_HABIS } from '../src/pesan.js';
import { bacaSesi, hapusSesi, simpanSesi } from '../src/sesi.js';

const URL_EXEC = 'https://script.google.com/macros/s/AKfycbzAsnMU7mkT1AVucY31fkd79u3mVzqx_-bzankSP/exec';

test('config: hanya URL /exec Apps Script yang diterima, env selain production = staging', () => {
  assert.deepEqual(bacaConfig({ SISI_CONFIG: { apiUrl: URL_EXEC, env: 'production' } }), { apiUrl: URL_EXEC, env: 'production', apiBacaUrl: '' });
  assert.deepEqual(bacaConfig({ SISI_CONFIG: { apiUrl: ' ' + URL_EXEC + ' ' } }), { apiUrl: URL_EXEC, env: 'staging', apiBacaUrl: '' });
  for (const salah of ['http://script.google.com/macros/s/AKfycbzAsnMU7mkT1AVucY31fkd79u3m/exec', 'https://evil.example/macros/s/AKfycbzAsnMU7mkT1AVucY31fkd79u3m/exec',
    'https://script.google.com/macros/s/ISI_ID_DEPLOYMENT/exec', URL_EXEC + '?x=1', 42]) {
    assert.equal(bacaConfig({ SISI_CONFIG: { apiUrl: salah } }).apiUrl, '', String(salah));
  }
  assert.deepEqual(bacaConfig({}), { apiUrl: '', env: 'staging', apiBacaUrl: '' });
});

function fetchPalsu(jawab) {
  const panggilan = [];
  const fn = async (url, opsi) => {
    panggilan.push({ url, opsi, body: JSON.parse(opsi.body) });
    if (jawab instanceof Error) throw jawab;
    return typeof jawab === 'function' ? jawab() : { ok: true, json: async () => jawab };
  };
  return { fn, panggilan };
}

test('api: POST text/plain (tanpa preflight CORS) bertanda platform WEB, jawaban ok = amplop', async () => {
  const f = fetchPalsu({ ok: true, data: { token: 'x' }, versi: '1.0.34' });
  const j = await panggil(URL_EXEC, 'login', { data: { username: 'a' } }, f.fn);
  assert.equal(j.data.token, 'x');
  const p = f.panggilan[0];
  assert.equal(p.url, URL_EXEC);
  assert.equal(p.opsi.method, 'POST');
  assert.equal(p.opsi.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.equal(p.opsi.credentials, 'omit');
  assert.deepEqual(p.body, { action: 'login', platform: 'WEB', data: { username: 'a' } }, 'token kosong tidak dikirim');
  await panggil(URL_EXEC, 'cekSesi', { token: 'abc' }, f.fn);
  assert.deepEqual(f.panggilan[1].body, { action: 'cekSesi', platform: 'WEB', token: 'abc', data: {} });
});

test('api: kode error server, jaringan putus, jawaban rusak, config kosong', async () => {
  const kode = async (jawab, url = URL_EXEC) => {
    try { await panggil(url, 'ping', {}, fetchPalsu(jawab).fn); return 'OK'; } catch (e) { assert.ok(e instanceof GalatApi); return e.kode + (e.kolom ? ':' + e.kolom : ''); }
  };
  assert.equal(await kode({ ok: false, kode: 'LOGIN_GAGAL' }), 'LOGIN_GAGAL');
  assert.equal(await kode({ ok: false, kode: 'FIELD_WAJIB', kolom: 'username' }), 'FIELD_WAJIB:username');
  assert.equal(await kode({ ok: false }), 'KESALAHAN_SERVER');
  assert.equal(await kode(new TypeError('Failed to fetch')), 'JARINGAN');
  assert.equal(await kode(Object.assign(new Error('x'), { name: 'AbortError' })), 'WAKTU_HABIS');
  assert.equal(await kode(() => ({ ok: false, json: async () => ({}) })), 'JARINGAN', 'HTTP 5xx');
  assert.equal(await kode(() => ({ ok: true, json: async () => { throw new SyntaxError('html'); } })), 'JAWABAN_TIDAK_VALID');
  assert.equal(await kode({ ok: true }, ''), 'CONFIG_KOSONG');
});

test('pesan: kode dikenal, sesi habis, kode asing tetap menyebut kodenya', () => {
  assert.match(pesan('WEB_KHUSUS_ADMIN'), /khusus akun Admin dan Admin ES/);
  assert.match(pesan('LOGIN_GAGAL'), /Username atau password salah/);
  assert.ok(SESI_HABIS.has('SESI_KEDALUWARSA'));
  assert.equal(pesan('SESI_DICABUT'), 'Sesi berakhir. Silakan login lagi.');
  assert.match(pesan('KODE_BARU'), /KODE_BARU/);
  assert.ok(!SESI_HABIS.has('AKSES_DITOLAK'), 'akses satu menu ditolak tidak mengeluarkan admin');
});

test('sesi: token 64 hex + env sama, sesi backend lain / rusak diabaikan, penyimpanan diblokir aman', () => {
  const isi = new Map();
  const simpan = { getItem: (k) => (isi.has(k) ? isi.get(k) : null), setItem: (k, v) => isi.set(k, v), removeItem: (k) => isi.delete(k) };
  const s = { token: 'a'.repeat(64), profil: { role: 'ADMIN' }, env: 'staging' };
  simpanSesi(s, simpan);
  assert.deepEqual(bacaSesi('staging', simpan), s);
  assert.equal(bacaSesi('production', simpan), null, 'sesi staging tidak dipakai di production');
  simpanSesi({ ...s, token: 'pendek' }, simpan);
  assert.equal(bacaSesi('staging', simpan), null);
  isi.set('sisi.web.sesi.v1', '{rusak');
  assert.equal(bacaSesi('staging', simpan), null);
  hapusSesi(simpan);
  assert.equal(isi.size, 0);
  const diblokir = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
  assert.equal(bacaSesi('staging', diblokir), null);
  assert.doesNotThrow(() => { simpanSesi(s, diblokir); hapusSesi(diblokir); });
});

test('perangkat: nama singkat browser + OS untuk log audit', () => {
  assert.equal(namaPerangkat('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'), 'Web · Chrome · Windows');
  assert.equal(namaPerangkat('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0'), 'Web · Edge · Windows');
  assert.equal(namaPerangkat(''), 'Web');
});
