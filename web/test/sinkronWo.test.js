import assert from 'node:assert/strict';
import test from 'node:test';

import { sinkronWo } from '../src/sinkronWo.js';

const T = (id, status = '') => ({ temuanId: id, kodeTemuan: 'K-' + id, tanggal: '2026-11-01', wo: { status } });
const R = { baru: 0, terkirim: 0, dikerjakan: 0, selesai: 0, ganda: 0 };

/** simpanan palsu di memori + api palsu yang mencatat panggilan. */
function dunia({ lokal = null, penuh = false, jawaban = [] } = {}) {
  const log = [], tersimpan = {}, penuhSet = new Set(penuh ? ['k'] : []);
  const simpanan = {
    baca: async () => lokal,
    tulis: async (k, d) => { tersimpan[k] = d; log.push('tulis'); },
    sudahPenuh: (k) => penuhSet.has(k),
    tandaiPenuh: (k) => { penuhSet.add(k); log.push('tandaiPenuh'); },
  };
  const panggilan = [];
  const api = async (action, data, opsi) => {
    panggilan.push({ action, data, opsi });
    log.push('api');
    const j = jawaban.shift();
    if (j instanceof Error) throw j;
    return { data: j };
  };
  return { simpanan, api, panggilan, tersimpan, log, penuhSet };
}
const LOKAL = { data: { status: 'SEMUA', kursor: 'k1', ringkas: R, tim: [], temuan: [T('a')] }, waktu: 111 };
const galat = (kode) => Object.assign(new Error(kode), { kode });

test('v1.0.58 sinkronWo: tanpa simpanan = satu panggilan penuh, simpanan ditulis, ditandai penuh', async () => {
  const w = dunia({ jawaban: [{ status: 'SEMUA', kursor: 'k1', ringkas: R, tim: [], temuan: [T('a')] }] });
  const d = await sinkronWo({ action: 'getWoAdmin', param: { dari: '2026-11-01' }, kunci: 'k', api: w.api, simpanan: w.simpanan });
  assert.equal(w.panggilan.length, 1);
  assert.deepEqual(w.panggilan[0].data, { dari: '2026-11-01', status: 'SEMUA' });
  assert.equal(w.panggilan[0].opsi.langsung, undefined);
  assert.equal(w.tersimpan.k, d);
  assert.deepEqual(w.log, ['api', 'tandaiPenuh', 'tulis']);
});

test('v1.0.58 sinkronWo: ada simpanan tapi belum penuh di peluncuran ini = panggilan penuh, bukan selisih', async () => {
  const w = dunia({ lokal: LOKAL, jawaban: [{ status: 'SEMUA', kursor: 'k2', ringkas: R, tim: [], temuan: [T('a'), T('b')] }] });
  const d = await sinkronWo({ action: 'getWoAdmin', kunci: 'k', api: w.api, simpanan: w.simpanan });
  assert.equal(w.panggilan[0].data.sejak, undefined);
  assert.equal(d.temuan.length, 2);
  assert.ok(w.penuhSet.has('k'));
});

test('v1.0.58 sinkronWo: simpanan + sudah penuh = selisih (sejak = kursor, langsung), hasil digabung', async () => {
  const w = dunia({ lokal: LOKAL, penuh: true, jawaban: [{ status: 'SEMUA', selisih: true, kursor: 'k2', ringkas: { ...R, terkirim: 1 }, tim: [], temuan: [T('a', 'TERKIRIM')] }] });
  const d = await sinkronWo({ action: 'getWoAdmin', kunci: 'k', api: w.api, simpanan: w.simpanan });
  assert.equal(w.panggilan[0].data.sejak, 'k1');
  assert.equal(w.panggilan[0].data.status, 'SEMUA');
  assert.equal(w.panggilan[0].opsi.langsung, true);
  assert.deepEqual([d.kursor, d.temuan[0].wo.status, d.ringkas.terkirim], ['k2', 'TERKIRIM', 1]);
  assert.equal(w.tersimpan.k, d);
});

test('v1.0.58 sinkronWo: paksaPenuh = panggilan penuh langsung walau sudah penuh', async () => {
  const w = dunia({ lokal: LOKAL, penuh: true, jawaban: [{ status: 'SEMUA', kursor: 'k3', ringkas: R, tim: [], temuan: [] }] });
  const d = await sinkronWo({ action: 'getWoAdmin', kunci: 'k', api: w.api, simpanan: w.simpanan, paksaPenuh: true });
  assert.equal(w.panggilan[0].data.sejak, undefined);
  assert.equal(w.panggilan[0].opsi.langsung, true);
  assert.equal(d.temuan.length, 0, 'penuh menggantikan, temuan yang hilang di server ikut hilang');
});

test('v1.0.58 sinkronWo: panggilan gagal dengan simpanan = data lokal kembali, simpanan tidak ditimpa, tidak ditandai penuh', async () => {
  const w = dunia({ lokal: LOKAL, jawaban: [galat('WAKTU_HABIS')] });
  const gagal = [];
  const d = await sinkronWo({ action: 'getWoAdmin', kunci: 'k', api: w.api, simpanan: w.simpanan, onGagal: (e) => gagal.push(e.kode) });
  assert.equal(d, LOKAL.data);
  assert.deepEqual(gagal, ['WAKTU_HABIS'], 'pemanggil diberi tahu bahwa data yang tampil belum disegarkan');
  assert.deepEqual(w.log, ['api']);
  assert.equal(w.penuhSet.has('k'), false);
});

test('v1.0.58 sinkronWo: penolakan server (AKSES_DITOLAK) dengan simpanan tetap dilempar, bukan disembunyikan di balik data lokal', async () => {
  const w = dunia({ lokal: LOKAL, jawaban: [galat('AKSES_DITOLAK')] });
  await assert.rejects(() => sinkronWo({ action: 'getWoAdmin', kunci: 'k', api: w.api, simpanan: w.simpanan }), (e) => e.kode === 'AKSES_DITOLAK');
  assert.equal(w.penuhSet.has('k'), false);
});

test('v1.0.58 sinkronWo: gagal tanpa simpanan = galat asli dilempar', async () => {
  const w = dunia({ jawaban: [galat('JARINGAN')] });
  await assert.rejects(() => sinkronWo({ action: 'getWoAdmin', kunci: 'k', api: w.api, simpanan: w.simpanan }), (e) => e.kode === 'JARINGAN');
});

test('v1.0.58 sinkronWo: onLokal dipanggil sebelum api, dengan data dan waktu simpanan', async () => {
  const w = dunia({ lokal: LOKAL, jawaban: [{ status: 'SEMUA', kursor: 'k2', ringkas: R, tim: [], temuan: [] }] });
  const urut = [];
  await sinkronWo({ action: 'getWoAdmin', kunci: 'k', api: (...a) => { urut.push('api'); return w.api(...a); }, simpanan: w.simpanan,
    onLokal: (d, t) => urut.push(['lokal', d.kursor, t]) });
  assert.deepEqual(urut, [['lokal', 'k1', 111], 'api']);
});
