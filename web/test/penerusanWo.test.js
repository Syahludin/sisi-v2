import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bolehTeruskan, bolehTeruskanDariDaftar, dataTeruskan, temuanTerkirimSementara, galatCatatan, grupTim, infoStatusWo, lokasiTemuan, pilihanFilter, ringkasPekerjaan, saringWo,
  statusWo, tabWo, timInspeksi, urlPeta,
} from '../src/penerusanWo.js';

const T = [
  { temuanId: 'a', kodeTemuan: 'TMN-001', jenisTemuan: 'Pohon dekat JTM', penyulang: 'PALAS', section: 'S1', nomorTiang: 'T12', sumber: 'PETUGAS', tim: 'INSJAR 01', revision: 3, wo: { status: '' } },
  { temuanId: 'b', kodeTemuan: 'TMN-002', jenisTemuan: 'Isolator retak', penyulang: 'KOTA', noGardu: 'TB0002', sumber: 'ADMIN', tim: '', wo: { status: 'TERKIRIM', tim: 'ROW 01' } },
  { temuanId: 'c', kodeTemuan: 'TMN-003', jenisTemuan: 'Pohon', penyulang: 'PALAS', sumber: 'PETUGAS', tim: '', wo: { status: '', ganda: true } },
];

test('status, lokasi, tim inspeksi, boleh teruskan (Baru dan bukan WO ganda)', () => {
  assert.equal(statusWo(T[1]), 'TERKIRIM');
  assert.equal(infoStatusWo('').label, 'Belum diteruskan');
  assert.equal(infoStatusWo('SELESAI').warna, 'hijau');
  assert.equal(lokasiTemuan(T[0]), 'PALAS · S1 · Tiang T12');
  assert.equal(lokasiTemuan(T[1]), 'KOTA · Gardu TB0002');
  assert.deepEqual(T.map(timInspeksi), ['INSJAR 01', 'Admin', 'Petugas']);
  assert.deepEqual(T.map(bolehTeruskan), [true, false, false]);
  assert.equal(tabWo('xx').kode, 'BARU');
  assert.equal(tabWo('SELESAI').kode, 'SELESAI');
});

test('saring: cari semua kata (termasuk tim tindak lanjut), penyulang, tim inspeksi; pilihan filter unik terurut', () => {
  assert.deepEqual(saringWo(T, { cari: 'pohon palas' }).map((t) => t.temuanId), ['a', 'c']);
  assert.deepEqual(saringWo(T, { cari: 'row 01' }).map((t) => t.temuanId), ['b']);
  assert.deepEqual(saringWo(T, { penyulang: 'PALAS', tim: 'Petugas' }).map((t) => t.temuanId), ['c']);
  assert.deepEqual(pilihanFilter(T, (t) => t.penyulang), ['KOTA', 'PALAS']);
  assert.deepEqual(pilihanFilter(T, timInspeksi), ['Admin', 'INSJAR 01', 'Petugas']);
});

test('tim tujuan per jenis urut ROW, HARTEK, YANDAL', () => {
  const g = grupTim([{ timId: '3', nama: 'YAN 1', jenis: 'YANDAL' }, { timId: '1', nama: 'ROW 1', jenis: 'ROW' }, { timId: '2', nama: 'HAR 1', jenis: 'HARTEK' }, { timId: '4', nama: 'ROW 2', jenis: 'ROW' }]);
  assert.deepEqual(g.map((x) => [x.label, x.tim.length]), [['Tim ROW', 2], ['Tim Hartek', 1], ['Tim Yandal', 1]]);
});

test('catatan: maks 300 huruf / 5 baris; data teruskan tanpa catatan kosong', () => {
  assert.equal(galatCatatan(''), '');
  assert.match(galatCatatan('x'.repeat(301)), /300/);
  assert.match(galatCatatan('1\n2\n3\n4\n5\n6'), /5 baris/);
  assert.deepEqual(dataTeruskan(T[0], 'tim1', '  '), { temuanId: 'a', timId: 'tim1', revision: 3 });
  assert.deepEqual(dataTeruskan(T[1], 'tim1', ' segera '), { temuanId: 'b', timId: 'tim1', catatan: 'segera', revision: 1 });
});

test('ringkas pekerjaan ROW / Yandal / Hartek bertingkat + material', () => {
  assert.equal(ringkasPekerjaan({ pekerjaan: 'Tebang Sedang', diameter: 25, jumlah: 1, satuan: 'Batang' }), 'Tebang Sedang Ø 25 cm');
  assert.equal(ringkasPekerjaan({ pekerjaan: 'Lain - Lain', pekerjaanLainnya: 'Rapikan kabel', jumlah: 2, satuan: 'Titik', diameter: null }), 'Lain - Lain (Rapikan kabel) 2 Titik');
  assert.equal(ringkasPekerjaan({ rincian: { pekerjaan: [
    { nama: 'Ganti Arrester', jumlah: 1, satuan: 'Bh', material: [{ nama: 'Arrester', jumlah: 3, satuan: 'Bh', kepemilikan: 'PLN' }] },
    { nama: 'Pasang Isolator', jumlah: 2.5, satuan: 'Bh', material: [] },
  ] } }), 'Ganti Arrester 1 Bh (Arrester 3 Bh PLN), Pasang Isolator 2.5 Bh');
});

test('url peta hanya koordinat valid', () => {
  assert.equal(urlPeta('-3.01, 106.45'), 'https://www.google.com/maps?q=-3.01,106.45');
  assert.equal(urlPeta('95, 10'), '');
  assert.equal(urlPeta('jalan raya'), '');
});

test('v1.0.48 teks WA temuan = format v1 (_stShareWaTemuan), foto terlampir / link', async () => {
  const { teksWaTemuan } = await import('../src/penerusanWo.js');
  const t = { kodeTemuan: 'IJR-TBL-001', penyulang: 'Bikang', section: 'LBS A', segmen: '', jenisTemuan: 'FCO rusak',
    koordinat: '-3.01, 106.5', foto: { TEMUAN: 'https://drive.google.com/file/d/abc/view' } };
  assert.equal(teksWaTemuan(t), '*Temuan Inspeksi*\n\nKode Temuan : *IJR-TBL-001*\nPenyulang : Bikang\nSection : LBS A\nSegmen : -\n'
    + 'Temuan : FCO rusak\n\nLokasi : https://www.google.com/maps?q=-3.01,106.5\n\nFoto Temuan : https://drive.google.com/file/d/abc/view\n\n'
    + '*Segera Tindak Lanjut🔥🔥🔥*');
  assert.match(teksWaTemuan(t, { fotoTerlampir: true }), /Foto Temuan : terlampir\n/);
  assert.match(teksWaTemuan({ kodeTemuan: 'X' }), /Lokasi : -\n\nFoto Temuan : -\n/);
});

test('v1.0.58 bolehTeruskanDariDaftar: hanya admin dengan aksi UBAH di OPS_PENERUSAN_WO dan WO belum diteruskan', () => {
  const sesi = (aksi, kode = 'OPS_PENERUSAN_WO') => ({ menu: aksi ? [{ kode, aksi }] : [] });
  const baru = { wo: { status: '' } };
  assert.equal(bolehTeruskanDariDaftar(sesi('UBAH'), baru), true);
  assert.equal(bolehTeruskanDariDaftar(sesi('LIHAT'), baru), false, 'hanya lihat');
  assert.equal(bolehTeruskanDariDaftar(sesi(''), baru), false, 'tanpa menu');
  assert.equal(bolehTeruskanDariDaftar(sesi('UBAH', 'OPS_PETA_TEMUAN'), baru), false, 'menu lain tidak cukup');
  assert.equal(bolehTeruskanDariDaftar({}, baru), false);
  for (const s of ['TERKIRIM', 'DIKERJAKAN', 'SELESAI']) assert.equal(bolehTeruskanDariDaftar(sesi('UBAH'), { wo: { status: s } }), false, s);
  assert.equal(bolehTeruskanDariDaftar(sesi('UBAH'), { wo: { status: '', ganda: true } }), false, 'WO ganda menunggu verifikasi');
});

test('v1.0.58 temuanTerkirimSementara: tampilan sementara TERKIRIM ke tim terpilih, temuan asli tidak diubah', () => {
  const t = { temuanId: 'a', kodeTemuan: 'K-1', revision: 3, wo: { status: '', catatanAdmin: 'lama', ganda: false } };
  const h = temuanTerkirimSementara(t, { timId: 'tim-1', nama: 'ROW 01', jenis: 'ROW' }, 'segera');
  assert.deepEqual([h.wo.status, h.wo.timId, h.wo.tim, h.wo.jenisTim, h.wo.catatanAdmin], ['TERKIRIM', 'tim-1', 'ROW 01', 'ROW', 'segera']);
  assert.equal(h.revision, 3);
  assert.equal(t.wo.status, '', 'argumen tidak diubah');
  assert.equal(temuanTerkirimSementara({ temuanId: 'b' }, { timId: 'x', nama: 'N' }, '').wo.status, 'TERKIRIM', 'tanpa wo / jenis');
});
