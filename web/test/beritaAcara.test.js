import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  aksiBa, bagianUploadTtd, dariBase64, dataDaftarBa, gabungInfoBa, galatFileTtd, galatFilterBa, keBase64, nomorBa, potongBagian, sha256Hex,
  tahapItemBa, TTD_BAGIAN_BYTE,
} from '../src/beritaAcara.js';

const pdf = (n) => { const b = new Uint8Array(n); b.set([0x25, 0x50, 0x44, 0x46, 0x2d]); for (let i = 5; i < n; i++) b[i] = i % 251; return b; };
const BA = (o) => ({ baId: 'b1', idBa: 'BA-GRD-TBL-202610-001', noBaFull: 'No. 001 / BA', jenis: 'Pengoperasian Trafo', statusBa: 'AKTIF', statusPdf: 'SELESAI',
  fileId: 'f1', urlPdf: 'https://drive.google.com/x', pdfBisa: true, tahap: 'PROSES_TTD', statusTtd: 'BELUM TTD', adaTtd: false, ...o });

test('filter daftar: data getDaftarBaGardu (cari dipangkas, kosong tidak dikirim, halaman berikut), rentang tanggal', () => {
  assert.deepEqual(dataDaftarBa({}), { sumber: 'SEMUA', urut: 'TERBARU', batas: 100 });
  assert.deepEqual(dataDaftarBa({ sumber: 'V2', cari: ' tb414 ', terlama: true, dari: '2026-10-01', sampai: '2026-10-31', jenis: 'Penggantian Trafo', tahap: 'SELESAI_TTD' }, 100),
    { sumber: 'V2', urut: 'TERLAMA', batas: 100, cari: 'tb414', dari: '2026-10-01', sampai: '2026-10-31', jenis: 'Penggantian Trafo', tahap: 'SELESAI_TTD', mulai: 100 });
  assert.equal(galatFilterBa({ dari: '2026-11-01', sampai: '2026-10-01' }), 'Tanggal "dari" sesudah "sampai".');
  assert.equal(galatFilterBa({ dari: '2026-10-01' }), '');
  assert.equal(tahapItemBa({ statusBa: 'BATAL' }), 'BATAL');
  assert.equal(nomorBa({ idBa: 'BA-1' }), 'BA-1');
});

test('aksi per tahap: PDF -> TTD -> EAM / master; TTD ulang mengunci EAM; batal / arsip / tanpa akses = baca saja', () => {
  assert.deepEqual(aksiBa(BA({ statusPdf: 'BELUM', fileId: '', urlPdf: '', tahap: 'DRAFT' }), true),
    { buatPdf: true, unduhPdf: false, uploadTtd: false, unduhTtd: false, kirimEam: false, updateMaster: false, alasanEam: 'Upload BA TTD dulu.', alasanPdf: 'Buat PDF dulu.' });
  const proses = aksiBa(BA(), true);
  assert.deepEqual([proses.unduhPdf, proses.uploadTtd, proses.kirimEam], [true, true, false]);
  const selesai = aksiBa(BA({ statusTtd: 'SUDAH TTD', adaTtd: true, tahap: 'SELESAI_TTD' }), true);
  assert.deepEqual([selesai.kirimEam, selesai.updateMaster, selesai.unduhTtd, selesai.alasanEam], [true, true, true, '']);
  const ulang = aksiBa(BA({ statusTtd: 'TTD ULANG', adaTtd: true, tahap: 'TTD_ULANG' }), true);
  assert.deepEqual([ulang.kirimEam, ulang.uploadTtd, /TTD baru/.test(ulang.alasanEam)], [false, true, true]);
  assert.equal(aksiBa(BA({ statusTtd: 'SUDAH TTD', adaTtd: true, jenis: 'Pemeriksaan Trafo', pdfBisa: false }), true).updateMaster, false);
  // v1.0.46: Pemeriksaan Trafo = PDF + TTD, tanpa Kirim EAM / Update Master (gardu tidak berubah)
  const prk = aksiBa(BA({ statusTtd: 'SUDAH TTD', adaTtd: true, jenis: 'Pemeriksaan Trafo', pdfBisa: true }), true);
  assert.deepEqual([prk.buatPdf, prk.uploadTtd, prk.kirimEam, prk.updateMaster], [true, true, false, false]);
  for (const x of [aksiBa(BA({ statusBa: 'BATAL' }), true), aksiBa(BA(), false)]) assert.deepEqual([x.buatPdf, x.uploadTtd, x.kirimEam], [false, false, false]);
  const arsip = aksiBa({ arsip: true, statusPdf: 'SELESAI', adaPdf: true, adaTtd: true, statusTtd: 'SUDAH TTD', jenis: 'Pengoperasian Trafo' }, true);
  assert.deepEqual([arsip.unduhPdf, arsip.unduhTtd, arsip.buatPdf, arsip.kirimEam], [true, true, false, false]);
});

test('gabung info jawaban aksi ke item daftar (hanya kunci alur)', () => {
  const x = gabungInfoBa(BA(), { tahap: 'SELESAI_TTD', statusTtd: 'SUDAH TTD', adaTtd: true, idBa: 'tidak-diubah', data: 'abc' });
  assert.deepEqual([x.tahap, x.statusTtd, x.adaTtd, x.idBa, 'data' in x], ['SELESAI_TTD', 'SUDAH TTD', true, 'BA-GRD-TBL-202610-001', false]);
});

test('file BA TTD: wajib PDF, maks 10 MB, potong 2 MB, sha256 + base64 sama dengan Node', async () => {
  assert.equal(galatFileTtd(new Uint8Array()), 'File kosong.');
  assert.match(galatFileTtd(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]), 'scan.jpg'), /harus PDF \(bukan jpg\)/);
  assert.match(galatFileTtd(pdf(10 * 1024 * 1024 + 1)), /maksimal 10 MB/);
  assert.equal(galatFileTtd(pdf(1000)), '');
  const b = pdf(TTD_BAGIAN_BYTE * 2 + 10);
  assert.deepEqual(potongBagian(b).map((x) => x.length), [TTD_BAGIAN_BYTE, TTD_BAGIAN_BYTE, 10]);
  assert.equal(await sha256Hex(b), crypto.createHash('sha256').update(b).digest('hex'));
  assert.equal(keBase64(b.subarray(0, 70000)), Buffer.from(b.subarray(0, 70000)).toString('base64'));
  assert.deepEqual(dariBase64(keBase64(b.subarray(0, 300))), b.subarray(0, 300));
  const k = await bagianUploadTtd('b1', b, 'x'.repeat(130) + '.pdf', 'u1');
  assert.deepEqual(k.map((x) => [x.ke, x.dari, x.ukuranByte, x.namaFile.length, x.uploadId]), [[1, 3, b.length, 120, 'u1'], [2, 3, b.length, 120, 'u1'], [3, 3, b.length, 120, 'u1']]);
  assert.equal(Buffer.concat(k.map((x) => Buffer.from(x.data, 'base64'))).equals(Buffer.from(b)), true);
});
