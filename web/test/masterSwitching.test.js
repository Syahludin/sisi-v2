import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cekIsian, daftarPenyulang, gantiJenis, isianBaru, isianDari, payloadSimpan, persenTerverifikasi, pilihanHulu, ringkasSwitching,
  saringSwitching, sectionPenyulang, titikSwitching,
} from '../src/masterSwitching.js';

const JAR = [
  { sectionId: 's1', penyulang: 'TOBOALI 1', section: 'PMT TOBOALI 1' },
  { sectionId: 's2', penyulang: 'TOBOALI 1', section: 'LBS AIR BARA' },
  { sectionId: 's3', penyulang: 'Payung', section: 'PMT PAYUNG' },
];
const sw = (o) => ({ switchingId: 'SWC-0001', jenis: 'LBS', nama: 'LBS A', penyulang: 'TOBOALI 1', lat: -3.01, lng: 106.5, statusVerifikasi: 'TERVERIFIKASI', aktif: true, ...o });
const DATA = [
  sw({}),
  sw({ switchingId: 'SWC-0002', jenis: 'ACR', nama: 'ACR Palas', merkKontroler: 'Schneider', statusVerifikasi: 'PERLU_PERBAIKAN' }),
  sw({ switchingId: 'SWC-0003', jenis: 'FCO', nama: 'FCO B', penyulang: 'Payung', lat: null, lng: null, statusVerifikasi: 'BELUM' }),
  sw({ switchingId: 'SWC-0004', nama: 'LBS Lama', aktif: false }),
];

test('masterSwitching: titik, penyulang, section', () => {
  assert.deepEqual(titikSwitching(DATA[0]), [-3.01, 106.5]);
  assert.equal(titikSwitching(DATA[2]), null);
  assert.equal(titikSwitching({ lat: 0, lng: 0 }), null);
  assert.deepEqual(daftarPenyulang(JAR), ['Payung', 'TOBOALI 1']);
  assert.deepEqual(sectionPenyulang(JAR, 'TOBOALI 1').map((s) => s.sectionId), ['s1', 's2']);
});

test('masterSwitching: ringkasan hanya baris aktif + persen terverifikasi', () => {
  const r = ringkasSwitching(DATA);
  assert.equal(r.total, 3);
  assert.deepEqual([r.TERVERIFIKASI, r.PERLU_PERBAIKAN, r.BELUM, r.nonaktif, r.tanpaTitik], [1, 1, 1, 1, 1]);
  assert.deepEqual([r.jenis.LBS, r.jenis.ACR, r.jenis.FCO, r.jenis.PMT], [1, 1, 1, 0]);
  assert.equal(persenTerverifikasi(r), 33);
  assert.equal(persenTerverifikasi(ringkasSwitching([])), 0);
});

test('masterSwitching: saring jenis / penyulang / status / cari / nonaktif', () => {
  const id = (f) => saringSwitching(DATA, f).map((s) => s.switchingId);
  assert.deepEqual(id({}), ['SWC-0001', 'SWC-0002', 'SWC-0003']);
  assert.deepEqual(id({ jenis: 'ACR' }), ['SWC-0002']);
  assert.deepEqual(id({ penyulang: 'Payung' }), ['SWC-0003']);
  assert.deepEqual(id({ status: 'BELUM' }), ['SWC-0003']);
  assert.deepEqual(id({ cari: 'schneider' }), ['SWC-0002']);
  assert.deepEqual(id({ cari: 'swc-0003' }), ['SWC-0003']);
  assert.deepEqual(id({ nonaktif: true }), ['SWC-0004']);
});

test('masterSwitching: cek isian sebelum kirim', () => {
  const ok = { ...isianBaru(), nama: 'LBS X', penyulang: 'Payung', koordinat: '-3.1, 106.4' };
  assert.deepEqual(cekIsian(ok, JAR), {});
  const g = cekIsian({ ...isianBaru(), penyulang: 'ASING', koordinat: '-3.1;106', tahunPasang: '1800', ratingA: 'x', titikHubung: true, penyulangSisiB: '' }, JAR);
  assert.deepEqual(Object.keys(g).sort(), ['koordinat', 'nama', 'penyulang', 'penyulangSisiB', 'ratingA', 'tahunPasang']);
  assert.ok(cekIsian({ ...ok, titikHubung: true, penyulangSisiB: 'Payung' }, JAR).penyulangSisiB, 'sisi lain tidak boleh sama');
});

test('masterSwitching: payload simpan membuang kolom yang tidak berlaku, angka jadi Number', () => {
  const i = { ...isianBaru(), jenis: 'LBS', nama: ' LBS X ', penyulang: 'Payung', koordinat: '-3.1, 106.4', fuseRating: '10K', kodeRtu: 'R1', tahunPasang: '2019', ratingKv: '' };
  const p = payloadSimpan(i);
  assert.equal(p.nama, 'LBS X');
  assert.equal(p.tahunPasang, 2019);
  assert.equal('ratingKv' in p, false);
  assert.equal('fuseRating' in p, false, 'bukan FCO');
  assert.equal('kodeRtu' in p, false, 'SCADA tidak dicentang');
  assert.equal('switchingId' in p, false, 'baris baru');
  assert.equal(p.bisaTrip, false, 'isian baru LBS: bawaan tidak bisa trip');
  assert.equal(payloadSimpan(gantiJenis(isianBaru(), 'ACR')).bisaTrip, true);
  const fco = payloadSimpan({ ...i, jenis: 'FCO', terhubungScada: true });
  assert.deepEqual([fco.fuseRating, fco.kodeRtu], ['10K', 'R1']);
  const ubah = payloadSimpan({ ...isianDari(DATA[1]), revision: 3 });
  assert.deepEqual([ubah.switchingId, ubah.revision, ubah.aktif, ubah.statusVerifikasi], ['SWC-0002', 3, true, 'PERLU_PERBAIKAN']);
  assert.equal(ubah.koordinat, '-3.01, 106.5');
});

test('masterSwitching: ganti jenis mengikuti bawaan bisa trip sampai admin mengubahnya', () => {
  let i = isianBaru();
  i = gantiJenis(i, 'ACR');
  assert.equal(i.bisaTrip, true);
  i = gantiJenis(i, 'LBS');
  assert.equal(i.bisaTrip, false);
  i = gantiJenis({ ...i, bisaTrip: true, bisaTripDiubah: true }, 'DS');
  assert.equal(i.bisaTrip, true, 'pilihan admin dipertahankan');
});

test('masterSwitching: pilihan hulu = aktif, penyulang sama, bukan diri sendiri', () => {
  const h = pilihanHulu(DATA, { switchingId: 'SWC-0001', penyulang: 'TOBOALI 1' }).map((s) => s.switchingId);
  assert.deepEqual(h, ['SWC-0002']);
});
