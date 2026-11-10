import test from 'node:test';
import assert from 'node:assert/strict';

import { cekSection, groupPenyulang, isianSectionBaru, isianSectionDari, payloadSection } from '../src/jaringan.js';
import { labelSwitching } from '../src/masterSwitching.js';

test('jaringan: kelompok per penyulang, urut abjad; aktif bila ada section aktif; section urut menurut urutan', () => {
  const g = groupPenyulang([{ sectionId: 'b', penyulang: 'PAYUNG', section: 'B', urutan: 40, aktif: false }, { sectionId: 'a', penyulang: 'PAYUNG', section: 'A', urutan: 20, aktif: false },
    { sectionId: 'c', penyulang: 'KEPOH', section: 'C', urutan: 20, aktif: true }]);
  assert.deepEqual(g.map((x) => [x.penyulang, x.aktif, x.section.map((s) => s.sectionId)]), [['KEPOH', true, ['c']], ['PAYUNG', false, ['a', 'b']]]);
});

test('jaringan: cek isian + payload (baru / ubah)', () => {
  assert.deepEqual(Object.keys(cekSection(isianSectionBaru(''))).sort(), ['penyulang', 'section']);
  assert.equal(cekSection({ ...isianSectionBaru(''), penyulangBaru: true }).penyulang, 'Isi nama penyulang baru.');
  assert.deepEqual(Object.keys(cekSection({ ...isianSectionBaru('X'), section: 'A', urutan: 'a' })), ['urutan']);
  assert.deepEqual(payloadSection({ ...isianSectionBaru(' KEPOH '), section: ' PMT ', urutan: '20' }), { penyulang: 'KEPOH', section: 'PMT', urutan: 20 });
  const ubah = payloadSection({ ...isianSectionDari({ sectionId: 's1', revision: 2, penyulang: 'P', section: 'S', parentSectionId: 's0', urutan: 10, aktif: true }), aktif: false });
  assert.deepEqual(ubah, { penyulang: 'P', section: 'S', parentSectionId: 's0', urutan: 10, sectionId: 's1', revision: 2, aktif: false });
});

test('switching: label pilihan tidak mengulang jenis ("PMT" + "PMT Palas" = "PMT Palas")', () => {
  assert.equal(labelSwitching('PMT', 'PMT Palas'), 'PMT Palas');
  assert.equal(labelSwitching('pmt', 'PMT Palas'), 'PMT Palas');
  assert.equal(labelSwitching('LBS', 'Air Bara'), 'LBS Air Bara');
  assert.equal(labelSwitching('ACR', ''), 'ACR');
});
