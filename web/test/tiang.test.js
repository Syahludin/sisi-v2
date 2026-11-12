import test from 'node:test';
import assert from 'node:assert/strict';

import { cekSegmen, isianSegmenBaru, isianSegmenDari, kabelTanah, payloadSegmen, persenJalur, saringSegmen, totalJalur } from '../src/tiang.js';

const JAR = [{ sectionId: 's1', penyulang: 'TOBOALI 1', section: 'PMT TOBOALI 1' }, { sectionId: 's3', penyulang: 'PAYUNG', section: 'PMT PAYUNG' }];

test('tiang: progres jalur = (terverifikasi + tidak ditemukan) / jumlah, total semua jalur', () => {
  const j = [{ kode: 'PLS', jumlah: 10, terverifikasi: 6, tidakDitemukan: 1, perluPerbaikan: 1, bertanda: 2 }, { kode: 'BIK', jumlah: 10, terverifikasi: 0 }];
  assert.equal(persenJalur(j[0]), 70);
  assert.equal(persenJalur({ jumlah: 0 }), 0);
  assert.deepEqual(totalJalur(j), { jumlah: 20, terverifikasi: 6, perluDilengkapi: 0, perluPerbaikan: 1, tidakDitemukan: 1, bertanda: 2 });
});

test('segmen: saring penyulang / nonaktif, urut penyulang lalu urutan', () => {
  const s = [{ segmenId: 'SGM-0002', nama: 'B', penyulang: 'TOBOALI 1', urutan: 20, aktif: true }, { segmenId: 'SGM-0001', nama: 'A', penyulang: 'TOBOALI 1', urutan: 10, aktif: true },
    { segmenId: 'SGM-0003', nama: 'C', penyulang: 'PAYUNG', urutan: 10, aktif: false }];
  assert.deepEqual(saringSegmen(s).map((x) => x.segmenId), ['SGM-0001', 'SGM-0002']);
  assert.deepEqual(saringSegmen(s, { nonaktif: true }).map((x) => x.segmenId), ['SGM-0003', 'SGM-0001', 'SGM-0002']);
  assert.deepEqual(saringSegmen(s, { penyulang: 'PAYUNG', nonaktif: true }).map((x) => x.segmenId), ['SGM-0003']);
});

test('segmen: cek isian + payload (switching batas hanya bila jenis SWITCHING)', () => {
  assert.deepEqual(Object.keys(cekSegmen(isianSegmenBaru(), JAR)).sort(), ['akhirNama', 'awalNama', 'nama', 'penyulang', 'sectionId']);
  const i = { ...isianSegmenBaru(), nama: ' A - B ', penyulang: 'TOBOALI 1', sectionId: 's3', awalNama: 'LBS A', awalSwitchingId: 'SWC-0001', akhirNama: 'TB01', akhirSwitchingId: 'SWC-0002', urutan: '30' };
  assert.deepEqual(Object.keys(cekSegmen(i, JAR)), ['sectionId'], 'section harus milik penyulang');
  const ok = { ...i, sectionId: 's1' };
  assert.deepEqual(cekSegmen(ok, JAR), {});
  assert.deepEqual(payloadSegmen(ok), { nama: 'A - B', penyulang: 'TOBOALI 1', sectionId: 's1', awalJenis: 'SWITCHING', awalNama: 'LBS A', akhirJenis: 'GARDU', akhirNama: 'TB01',
    awalSwitchingId: 'SWC-0001', urutan: 30, jenisSegmen: 'UDARA' });
  const ubah = payloadSegmen({ ...isianSegmenDari({ segmenId: 'SGM-0001', revision: 2, nama: 'X', urutan: 10, aktif: true }), aktif: false });
  assert.deepEqual([ubah.segmenId, ubah.revision, ubah.aktif, ubah.urutan], ['SGM-0001', 2, false, 10]);
});

test('segmen kabel tanah: data kabel hanya dikirim bila KABEL_TANAH, angka dicek, koma desimal diterima', () => {
  const dasar = { ...isianSegmenBaru(), nama: 'PMT A - SKTM A', penyulang: 'TOBOALI 1', sectionId: 's1', awalNama: 'PMT A', akhirJenis: 'UJUNG_KABEL', akhirNama: 'SKTM A' };
  const udara = { ...dasar, jenisKabel: 'N2XSEBY - 1 CORE', ukuranMm2: '240', panjangKabelM: '212,5' };
  assert.equal(kabelTanah(udara), false);
  assert.deepEqual(Object.keys(payloadSegmen(udara)).filter((k) => /kabel|ukuran|penghantar/i.test(k)), [], 'segmen udara tidak mengirim data kabel');
  const kabel = { ...udara, jenisSegmen: 'KABEL_TANAH', penghantarId: 'PH-240' };
  assert.deepEqual(cekSegmen(kabel, JAR), {});
  const p = payloadSegmen(kabel);
  assert.deepEqual([p.jenisSegmen, p.jenisKabel, p.ukuranMm2, p.panjangKabelM, p.penghantarId, p.akhirJenis], ['KABEL_TANAH', 'N2XSEBY - 1 CORE', 240, 212.5, 'PH-240', 'UJUNG_KABEL']);
  assert.deepEqual(Object.keys(cekSegmen({ ...kabel, ukuranMm2: 'x', panjangKabelM: '0' }, JAR)).sort(), ['panjangKabelM', 'ukuranMm2']);
  assert.deepEqual(cekSegmen({ ...kabel, jenisKabel: '', ukuranMm2: '', panjangKabelM: '' }, JAR), {}, 'data kabel belum lengkap tetap boleh disimpan');
  assert.equal(isianSegmenDari({ segmenId: 'SGM-0002', jenisSegmen: '', ukuranMm2: 240 }).jenisSegmen, 'UDARA');
  assert.equal(isianSegmenDari({ segmenId: 'SGM-0002', ukuranMm2: 240 }).ukuranMm2, '240');
});

test('tiang: status tampil web = warna + label + kelas lencana; terverifikasi tetapi kurang lengkap = Perlu Dilengkapi', async () => {
  const { statusTiang, saringTiang, hitungStatusTiang } = await import('../src/tiang.js');
  assert.deepEqual(statusTiang({ statusVerifikasi: 'TERVERIFIKASI', kurang: [] }), { kunci: 'TERVERIFIKASI', label: 'Terverifikasi', kelas: 'ok' });
  assert.deepEqual(statusTiang({ statusVerifikasi: 'TERVERIFIKASI', kurang: ['Foto Kepala'] }), { kunci: 'DILENGKAPI', label: 'Perlu Dilengkapi', kelas: 'draf' });
  assert.deepEqual(statusTiang({ statusVerifikasi: 'PERLU_PERBAIKAN' }), { kunci: 'PERLU_PERBAIKAN', label: 'Perlu Perbaikan', kelas: 'tolak' });
  assert.deepEqual(statusTiang({ statusVerifikasi: 'TIDAK_DITEMUKAN' }), { kunci: 'TIDAK_DITEMUKAN', label: 'Tidak Ditemukan', kelas: 'belum' });
  assert.deepEqual(statusTiang({}), { kunci: 'BELUM', label: 'Belum Diverifikasi', kelas: 'belum' });
  const daftar = [
    { tiangId: '2', nama: 'PLS0002', statusVerifikasi: 'BELUM' },
    { tiangId: '1', nama: 'PLS0001', statusVerifikasi: 'TERVERIFIKASI', kurang: [] },
    { tiangId: '3', nama: 'PLS0003', statusVerifikasi: 'PERLU_PERBAIKAN', tandaCek: 'x' },
  ];
  assert.deepEqual(saringTiang(daftar, { status: '' }).map((t) => t.nama), ['PLS0001', 'PLS0002', 'PLS0003'], 'urut nama');
  assert.deepEqual(saringTiang(daftar, { status: 'PERLU_PERBAIKAN' }).map((t) => t.tiangId), ['3']);
  assert.deepEqual(saringTiang(daftar, { status: 'CEK' }).map((t) => t.tiangId), ['3'], 'bertanda cek');
  assert.deepEqual(saringTiang(daftar, { cari: 'pls0002' }).map((t) => t.tiangId), ['2']);
  assert.deepEqual(hitungStatusTiang(daftar), { '': 3, BELUM: 1, TERVERIFIKASI: 1, DILENGKAPI: 0, PERLU_PERBAIKAN: 1, TIDAK_DITEMUKAN: 0, CEK: 1 });
});
