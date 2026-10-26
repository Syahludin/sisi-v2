import assert from 'node:assert/strict';
import test from 'node:test';

import { GalatApi } from '../src/api.js';
import {
  angkaKoma, bacaKms, barisBaru, barisForm, daftarPenyulang, daftarSection, galatDaftar,
  isiSama, kmsTeks, payloadSimpan, simpanPulih,
} from '../src/laporan.js';
import { muatMaster } from '../src/master.js';
import { geserTanggal, hariIniWib, jamDari } from '../src/tanggal.js';

const ID1 = '0b7c2d4e-1f2a-4b3c-8d4e-5f6a7b8c9d01';
const ID2 = '0b7c2d4e-1f2a-4b3c-8d4e-5f6a7b8c9d02';
const SEK = '1a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d';

test('kmS: koma/titik, maks 2 desimal, tampil gaya Indonesia', () => {
  assert.equal(bacaKms('4,6'), 4.6);
  assert.equal(bacaKms(' 12.25 '), 12.25);
  for (const salah of ['', '4,666', '1000', '-1', 'abc', '4,']) assert.equal(bacaKms(salah), null, salah);
  assert.equal(angkaKoma(4.6), '4,6');
  assert.equal(angkaKoma(4), '4');
  assert.equal(angkaKoma(4.355), '4,36');
  assert.equal(kmsTeks(87), '4,35');
});

test('tanggal: hari ini WIB dan geser lintas bulan', () => {
  assert.equal(hariIniWib(new Date('2026-10-26T17:30:00Z')), '2026-10-27'); // 00.30 WIB
  assert.equal(hariIniWib(new Date('2026-10-26T16:59:00Z')), '2026-10-26');
  assert.equal(geserTanggal('2026-11-01', -1), '2026-10-31');
  assert.equal(geserTanggal('2026-12-31', 1), '2027-01-01');
  assert.equal(jamDari('2026-10-26 08:15:42'), '08:15');
  assert.equal(jamDari(''), '');
});

test('validasi UP3: wajib, ganda (tanpa beda huruf besar), batas panjang', () => {
  const a = { ...barisBaru('UP3', ID1), penyulang: 'Toboali 1', realisasiKms: '4,6' };
  const b = { ...barisBaru('UP3', ID2), penyulang: 'TOBOALI 1', realisasiKms: '4,666', temuan: 'x'.repeat(201) };
  const g = galatDaftar('UP3', [a, b]);
  assert.deepEqual(Object.keys(g.get(ID1)), ['penyulang']);
  assert.deepEqual(Object.keys(g.get(ID2)).sort(), ['penyulang', 'realisasiKms', 'temuan']);
  assert.equal(galatDaftar('UP3', [a]).size, 0);
});

test('validasi UIW: section wajib/unik, tiang 1-2000, temuan 0-999', () => {
  const a = { ...barisBaru('UIW', ID1), sectionId: SEK, jumlahTiang: '87' };
  assert.equal(galatDaftar('UIW', [a]).size, 0);
  const b = { ...barisBaru('UIW', ID2), sectionId: SEK, jumlahTiang: '0', temuanRow: '1000' };
  assert.deepEqual(Object.keys(galatDaftar('UIW', [a, b]).get(ID2)).sort(), ['jumlahTiang', 'sectionId', 'temuanRow']);
});

test('payload: hanya field skema, teks kosong tidak dikirim, cuaca hanya UIW', () => {
  const up3 = { ...barisBaru('UP3', ID1), penyulang: 'Toboali 1', realisasiKms: '4,6', temuan: ' pohon ', keterangan: '  ' };
  assert.deepEqual(payloadSimpan('UP3', { tanggal: '2026-10-26', revision: 3, cuaca: 'Cerah', daftar: [up3] }),
    { tanggal: '2026-10-26', revision: 3, c4a: [{ id: ID1, penyulang: 'Toboali 1', realisasiKms: 4.6, temuan: 'pohon' }] });
  const uiw = { ...barisBaru('UIW', ID1), sectionId: SEK, penyulang: 'P', section: 'S', jumlahTiang: '87', temuanRow: '2' };
  assert.deepEqual(payloadSimpan('UIW', { tanggal: '2026-10-26', revision: 0, cuaca: ' Hujan ', daftar: [uiw] }), {
    tanggal: '2026-10-26', revision: 0, cuaca: 'Hujan',
    c4a: [{ id: ID1, sectionId: SEK, jumlahTiang: 87, temuanPeralatan: 0, temuanRow: 2, eksekusi: 0 }],
  });
  assert.equal('cuaca' in payloadSimpan('UIW', { tanggal: '2026-10-26', revision: 0, cuaca: '', daftar: [] }), false);
});

test('isiSama: baris server dibandingkan dengan payload (urutan bebas, penyulang tanpa huruf besar)', () => {
  const kirim = { tanggal: '2026-10-26', revision: 1, c4a: [{ id: ID1, penyulang: 'toboali 1', realisasiKms: 4.6 }] };
  const server = { c4a: [{ id: ID1, penyulang: 'Toboali 1', realisasiKms: 4.6, temuan: '', tindakLanjut: '', eksekusi: '', keterangan: '' }] };
  assert.equal(isiSama('UP3', kirim, server), true);
  assert.equal(isiSama('UP3', kirim, { c4a: [{ ...server.c4a[0], realisasiKms: 4.7 }] }), false);
  const form = barisForm('UP3', server.c4a[0]);
  assert.equal(form.realisasiKms, '4,6');
  assert.equal(form.baru, false);
});

/** kirim palsu: daftar jawaban/galat per panggilan, mencatat action + data. */
function kirimPalsu(urutan) {
  const log = [];
  const kirim = async (action, data) => {
    log.push({ action, data });
    const x = urutan.shift();
    if (x instanceof Error) throw x;
    return { ok: true, data: x };
  };
  return { kirim, log };
}
const tanpaTunda = { tunda: async () => {} };
const DATA = { tanggal: '2026-10-26', revision: 2, c4a: [{ id: ID1, penyulang: 'Toboali 1', realisasiKms: 4.6 }] };

test('simpanPulih: gagal jaringan dikirim ulang dengan payload yang sama', async () => {
  const { kirim, log } = kirimPalsu([new GalatApi('JARINGAN'), { revision: 3 }]);
  assert.deepEqual(await simpanPulih(kirim, 'UP3', DATA, tanpaTunda), { revision: 3 });
  assert.deepEqual(log.map((l) => l.action), ['simpanLaporanUp3', 'simpanLaporanUp3']);
  assert.equal(log[1].data, DATA);
});

test('simpanPulih: KONFLIK setelah gagal + isi server sama = berhasil; tertunda = dikunci dengan revision server', async () => {
  const server = { revision: 3, tertunda: false, c4a: [{ id: ID1, penyulang: 'Toboali 1', realisasiKms: 4.6 }] };
  let p = kirimPalsu([new GalatApi('WAKTU_HABIS'), new GalatApi('KONFLIK_REVISION'), server]);
  assert.equal(await simpanPulih(p.kirim, 'UP3', DATA, tanpaTunda), server);
  assert.deepEqual(p.log[2], { action: 'getLaporanUp3', data: { tanggal: '2026-10-26' } });

  p = kirimPalsu([new GalatApi('JARINGAN'), new GalatApi('KONFLIK_REVISION'), { ...server, tertunda: true }, { revision: 4 }]);
  assert.deepEqual(await simpanPulih(p.kirim, 'UP3', DATA, tanpaTunda), { revision: 4 });
  assert.equal(p.log[3].data.revision, 3);
});

test('simpanPulih: KONFLIK langsung / isi beda / galat validasi diteruskan, ulang dibatasi', async () => {
  let p = kirimPalsu([new GalatApi('KONFLIK_REVISION')]);
  await assert.rejects(simpanPulih(p.kirim, 'UP3', DATA, tanpaTunda), { kode: 'KONFLIK_REVISION' });
  p = kirimPalsu([new GalatApi('JARINGAN'), new GalatApi('KONFLIK_REVISION'), { c4a: [] }]);
  await assert.rejects(simpanPulih(p.kirim, 'UP3', DATA, tanpaTunda), { kode: 'KONFLIK_REVISION' });
  p = kirimPalsu([new GalatApi('PENYULANG_TIDAK_ADA')]);
  await assert.rejects(simpanPulih(p.kirim, 'UP3', DATA, tanpaTunda), { kode: 'PENYULANG_TIDAK_ADA' });
  p = kirimPalsu([new GalatApi('JARINGAN'), new GalatApi('JARINGAN'), new GalatApi('JARINGAN')]);
  await assert.rejects(simpanPulih(p.kirim, 'UP3', DATA, tanpaTunda), { kode: 'JARINGAN' });
  assert.equal(p.log.length, 3);
});

test('master jaringan: penyulang unik aktif, section urut kolom urutan lalu baris', () => {
  const j = [
    { id: 'c', penyulang: 'B', section: 'S3', urutan: 0, baris: 2, aktif: true },
    { id: 'a', penyulang: 'B', section: 'S1', urutan: 2, baris: 9, aktif: true },
    { id: 'b', penyulang: 'b', section: 'S2', urutan: 1, baris: 5, aktif: true },
    { id: 'x', penyulang: 'A', section: 'S9', urutan: 1, baris: 1, aktif: true },
    { id: 'n', penyulang: 'Z', section: 'N', urutan: 1, baris: 1, aktif: false },
  ];
  assert.deepEqual(daftarPenyulang(j), ['A', 'b', 'B']);
  assert.deepEqual(daftarSection(j, 'B').map((s) => s.id), ['b', 'a', 'c']);
});

test('muatMaster: sekali per token+modul, gagal tidak disimpan', async () => {
  let n = 0;
  const api = (gagalPertama) => async (action, data) => {
    n++;
    assert.equal(action, 'getMaster');
    assert.deepEqual(data, { modul: ['jaringan'] });
    if (gagalPertama && n === 1) throw new GalatApi('JARINGAN');
    return { ok: true, data: { modul: { jaringan: { isi: [{ id: 'a' }] } } } };
  };
  assert.deepEqual(await muatMaster(api(false), 't1', 'jaringan'), [{ id: 'a' }]);
  await muatMaster(api(false), 't1', 'jaringan');
  assert.equal(n, 1);
  await muatMaster(api(false), 't1', 'jaringan', { segar: true });
  assert.equal(n, 2);
  n = 0;
  await assert.rejects(muatMaster(api(true), 't2', 'jaringan'));
  assert.deepEqual(await muatMaster(api(true), 't2', 'jaringan'), [{ id: 'a' }]);
});
