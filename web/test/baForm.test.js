import test from 'node:test';
import assert from 'node:assert/strict';

import {
  angkaIsian, cekAngka, cekKoordinat, dataSimpanBa, dataUbahBa, galatFileFoto, galatIsianBa, isianAwalBa, isianDariGardu, jenisGambarBytes,
  pilihanKvaBa, skalaFoto, slotFormBa,
} from '../src/baForm.js';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0, 0, 0, 0, 0]);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff, 0, 0]);
const GARDU = { id: 'g-1', no: 'TB0012', penyulang: 'Bikang', sectionId: 's-1', alamat: 'Jl. Raya', lat: -3.01, lng: 106.5, konstruksi: 'cantol',
  kva: 100, merk: 'Trafindo', seri: 'SN-1', tahun: 2015, jurusan: '2', merkPhb: 'MZM', seriPhb: '195', tahunPhb: 2016, kepemilikan: 'PLN' };

test('v1.0.47 guard foto: hanya JPG / PNG / WebP (tipe, ekstensi, dan isi file), ukuran dibatasi', () => {
  assert.equal(galatFileFoto('a.jpg', 'image/jpeg', 1000, JPEG), '');
  assert.equal(galatFileFoto('a.PNG', 'image/png', 1000, PNG), '');
  assert.equal(galatFileFoto('a.webp', 'image/webp', 1000, WEBP), '');
  assert.match(galatFileFoto('a.pdf', 'application/pdf', 1000, PDF), /Hanya file foto/);
  assert.match(galatFileFoto('a.heic', 'image/heic', 1000, JPEG), /Hanya file foto/, 'HEIC tidak bisa dibaca semua browser');
  assert.match(galatFileFoto('virus.jpg', 'image/jpeg', 1000, EXE), /Isi file bukan foto/, 'ekstensi dipalsukan');
  assert.match(galatFileFoto('a.jpg', 'image/jpeg', 0, JPEG), /kosong/);
  assert.match(galatFileFoto('a.jpg', 'image/jpeg', 26 * 1024 * 1024, JPEG), /terlalu besar/);
  assert.deepEqual([JPEG, PNG, WEBP, PDF, new Uint8Array(3)].map(jenisGambarBytes), ['JPEG', 'PNG', 'WEBP', null, null]);
  assert.deepEqual(skalaFoto(4000, 3000), { lebar: 2048, tinggi: 1536 });
  assert.deepEqual(skalaFoto(800, 600), { lebar: 800, tinggi: 600 });
});

test('v1.0.47 angka / koordinat sama aturan server', () => {
  assert.deepEqual([angkaIsian('12,5'), angkaIsian(''), angkaIsian('-'), Number.isNaN(angkaIsian('abc'))], [12.5, null, null, true]);
  assert.equal(cekAngka('2', { min: 1, max: 12, bulat: true }), '');
  assert.equal(cekAngka('2,5', { min: 1, max: 12, bulat: true }), 'Harus angka bulat');
  assert.equal(cekAngka('', { min: 1, max: 12, wajib: false }), '');
  assert.equal(cekKoordinat('-3.012345, 106.456789'), '');
  assert.match(cekKoordinat('abc'), /Format/);
  assert.equal(cekKoordinat('', false), '');
  assert.deepEqual(pilihanKvaBa([100, 75, 2.5, 9999]).slice(0, 4), [25, 50, 75, 100]);
});

test('v1.0.47 slot foto per jenis: wajib sama HP, foto PHB-TR sesudah hanya kalau PHB-TR diganti', () => {
  assert.deepEqual(slotFormBa('Pengoperasian Trafo').map((s) => s.wajib), [true, true, true, true]);
  assert.deepEqual(slotFormBa('Penggantian Trafo').map((s) => s.slot), ['NAMEPLATE', 'NAMEPLATE_SESUDAH', 'FULL_GARDU', 'FULL_GARDU_SESUDAH']);
  assert.equal(slotFormBa('Penggantian Trafo', { phbDiganti: true }).length, 6);
  assert.deepEqual(slotFormBa('Pemeriksaan Trafo').map((s) => [s.slot, s.wajib]).slice(0, 2), [['LAMPIRAN_1', false], ['LAMPIRAN_2', false]]);
});

test('v1.0.47 Pengoperasian: cek isian urut form + data simpan / ubah', () => {
  const isi = { ...isianAwalBa('2026-10-29'), prefix: 'TB', penyulang: 'Bikang', sectionId: 's-1', alamat: 'Jl. Raya', koordinat: '-3.01,106.5',
    kva: '100', merk: 'Trafindo', seri: 'SN', tahun: '2024', jurusan: '4', perluasanSutm: '0,5', petugas1Id: 'p1' };
  const semua = new Set(['NAMEPLATE', 'FULL_GARDU', 'NAMEPLATE_PHB', 'BOX_PHB']);
  assert.equal(galatIsianBa('Pengoperasian Trafo', { ...isi, prefix: '' }, semua).kolom, 'prefix');
  assert.equal(galatIsianBa('Pengoperasian Trafo', { ...isi, kva: '0' }, semua).kolom, 'kva');
  assert.match(galatIsianBa('Pengoperasian Trafo', isi, new Set(['NAMEPLATE'])).pesan, /Foto Full Gardu, Nameplate PHB-TR, Box PHB-TR/);
  assert.equal(galatIsianBa('Pengoperasian Trafo', { ...isi, petugas2Id: 'p1' }, semua).kolom, 'petugas2Id');
  assert.equal(galatIsianBa('Pengoperasian Trafo', isi, semua), null);
  const d = dataSimpanBa('Pengoperasian Trafo', 'ba-1', isi);
  assert.deepEqual([d.prefix, d.sectionId, d.koordinat, d.kva, d.tahun, d.perluasanSutm, d.kepemilikan, 'garduId' in d, 'petugas2Id' in d],
    ['TB', 's-1', '-3.01, 106.5', 100, 2024, 0.5, 'PLN', false, false]);
  const u = dataUbahBa('Pengoperasian Trafo', 'ba-1', isi, 3);
  assert.deepEqual([u.baId, u.revision, 'jenis' in u, 'prefix' in u, 'tanggalBa' in u, u.sectionId], ['ba-1', 3, false, false, false, 's-1']);
  // edit: nomor gardu tetap = prefix tidak dicek
  assert.equal(galatIsianBa('Pengoperasian Trafo', { ...isi, prefix: '' }, semua, { edit: true }), null);
});

test('v1.0.47 Penggantian / Pemeriksaan: data trafo dari Master Gardu, data kirim sama HP', () => {
  const awal = { ...isianAwalBa('2026-10-29'), ...isianDariGardu(GARDU), petugas1Id: 'p1' };
  assert.deepEqual([awal.konstruksi, awal.koordinat, awal.kva, awal.merkPhbSesudah], ['Cantol', '-3.01, 106.5', '100', 'MZM']);
  // Penggantian: trafo sesudah wajib, foto 2 nameplate wajib
  assert.equal(galatIsianBa('Penggantian Trafo', awal, new Set(['NAMEPLATE', 'NAMEPLATE_SESUDAH'])).kolom, 'kvaSesudah');
  const ganti = { ...awal, kvaSesudah: '50', merkSesudah: 'Sintra', seriSesudah: 'X1', tahunSesudah: '2016' };
  assert.equal(galatIsianBa('Penggantian Trafo', ganti, new Set(['NAMEPLATE'])).kolom, 'foto');
  assert.equal(galatIsianBa('Penggantian Trafo', ganti, new Set(['NAMEPLATE', 'NAMEPLATE_SESUDAH'])), null);
  let d = dataSimpanBa('Penggantian Trafo', 'ba-2', ganti);
  assert.deepEqual([d.garduId, d.kvaSesudah, d.phbDiganti, d.merkPhbSesudah, d.jurusanSesudah, d.asalTrafo], ['g-1', 50, false, 'MZM', 2, 'Gudang UP3 (Rekondisi)']);
  d = dataSimpanBa('Penggantian Trafo', 'ba-2', { ...ganti, phbDiganti: true, merkPhbSesudah: 'Baru', jurusanSesudah: '4' });
  assert.deepEqual([d.merkPhbSesudah, d.seriPhbSesudah, d.jurusanSesudah], ['Baru', '195', 4]);
  // Pemeriksaan: lampiran opsional, kesimpulan / catatan ikut, tanpa kepemilikan / vendor (ditolak server)
  assert.equal(galatIsianBa('Pemeriksaan Trafo', { ...awal, garduId: '' }, new Set()).kolom, 'garduId');
  assert.equal(galatIsianBa('Pemeriksaan Trafo', awal, new Set()), null);
  d = dataSimpanBa('Pemeriksaan Trafo', 'ba-3', { ...awal, kesimpulan: 'Baik' });
  assert.deepEqual([d.jenis, d.kesimpulan, d.catatan, 'kepemilikan' in d, 'vendor' in d, d.tahunPhb], ['Pemeriksaan Trafo', 'Baik', '', false, false, 2016]);
  const u = dataUbahBa('Pemeriksaan Trafo', 'ba-3', awal, 1);
  assert.deepEqual(['garduId' in u, 'jenis' in u, u.revision], [false, false, 1]);
});

test('v1.0.49 BA Switching: foto wajib Konstruksi + SLD (+ Konstruksi Sesudah Penggantian / Relokasi), data kirim tanpa OwnerId', () => {
  assert.deepEqual(slotFormBa('Pengoperasian Switching').map((s) => [s.slot, s.wajib]),
    [['NAMEPLATE', false], ['KONSTRUKSI', true], ['SLD_SEBELUM', true], ['SLD_SESUDAH', true]]);
  assert.deepEqual(slotFormBa('Relokasi Switching').filter((s) => s.wajib).map((s) => s.slot), ['KONSTRUKSI', 'KONSTRUKSI_SESUDAH', 'SLD_SEBELUM', 'SLD_SESUDAH']);
  const isi = { ...isianAwalBa('2026-10-30'), jenisSwitching: 'Recloser', namaSwitching: 'REC Bukit', penyulang: 'Bikang', sectionId: 's-1',
    tipe: 'OSM', koordinat: '-3.01,106.5', petugas1Id: 'p1' };
  const foto = new Set(['KONSTRUKSI', 'SLD_SEBELUM', 'SLD_SESUDAH']);
  assert.equal(galatIsianBa('Pengoperasian Switching', { ...isi, namaSwitching: ' ' }, foto).kolom, 'namaSwitching');
  assert.equal(galatIsianBa('Pengoperasian Switching', isi, new Set(['KONSTRUKSI'])).kolom, 'foto');
  assert.equal(galatIsianBa('Pengoperasian Switching', isi, foto), null);
  assert.equal(galatIsianBa('Penggantian Switching', isi, foto).kolom, 'jenisSwitchingSesudah');
  const d = dataSimpanBa('Pengoperasian Switching', 'ba-1', isi);
  assert.deepEqual([d.jenisSwitching, d.namaSwitching, d.sectionId, d.tipe, d.koordinat, 'ownerId' in d, 'garduId' in d, 'kerusakan' in d, 'namaSwitchingSesudah' in d],
    ['Recloser', 'REC Bukit', 's-1', 'OSM', '-3.01, 106.5', false, false, false, false]);
  assert.equal(dataSimpanBa('Kerusakan Switching', 'ba-1', { ...isi, kerusakan: 'Kontak aus' }).kerusakan, 'Kontak aus');
  const g = dataSimpanBa('Penggantian Switching', 'ba-2', { ...isi, jenisSwitchingSesudah: 'LBS Motorized', namaSwitchingSesudah: 'LBS Baru', sectionIdSesudah: 's-2' });
  assert.deepEqual([g.jenisSwitchingSesudah, g.namaSwitchingSesudah, g.sectionIdSesudah], ['LBS Motorized', 'LBS Baru', 's-2']);
  const u = dataUbahBa('Penggantian Switching', 'ba-2', isi, 4);
  assert.deepEqual(['jenis' in u, 'tanggalBa' in u, u.revision], [false, false, 4]);
});
