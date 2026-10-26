import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_HI } from '../src/hiGardu.def.js';
import {
  bisaUpdateUkur, cariGardu, galatHi, jenisKategori, isianBerubah, nilaiAwalHi, payloadHi, pilihanIsian, ringkasHasilHi, semuaIsianHi, sudahDiMaster,
} from '../src/pengukuranGardu.js';

test('definisi form HI: 7 tab, 182 isian unik berlabel, tanggal/jam sama v1 (peta kolom diatur server)', () => {
  const f = semuaIsianHi();
  assert.equal(TAB_HI.length, 7);
  assert.equal(f.length, 182);
  assert.equal(new Set(f.map((x) => x.col)).size, 182);
  assert.ok(f.every((x) => x.label && !('sheet' in x)));
  assert.deepEqual(f.filter((x) => x.tipe === 'date' || x.tipe === 'time').map((x) => [x.col, x.tipe]), [['R', 'date'], ['Q', 'time']]);
  assert.deepEqual(f.filter((x) => x.mati).map((x) => x.col), ['B', 'C']);
});

test('cari gardu: nomor tanpa tanda baca, alamat / penyulang / section, status, urut nomor', () => {
  const d = [{ no: 'TB0422', alamat: 'Jl. Raya', penyulang: 'TB-01', section: 'Rias', status: 'AKTIF' },
    { no: 'TB0002', alamat: 'Jl. Pantai', penyulang: 'TB-02', section: 'Kepoh', status: 'AKTIF' },
    { no: 'TB0010', alamat: 'Jl. Raya', penyulang: 'TB-01', section: 'Rias', status: 'BATAL' }];
  assert.deepEqual(cariGardu(d, 'tb-0422').map((g) => g.no), ['TB0422']);
  assert.deepEqual(cariGardu(d, 'raya').map((g) => g.no), ['TB0422']);
  assert.deepEqual(cariGardu(d, 'raya', '').map((g) => g.no), ['TB0010', 'TB0422']);
  assert.deepEqual(cariGardu(d).map((g) => g.no), ['TB0002', 'TB0422']);
});

test('form HI: nilai awal dari db_Gardu (nilai per kunci), kiriman hanya isian berubah + revision, angka, mati tidak dikirim', () => {
  const h = { nilai: { B: 'TOBOALI', C: 'TB0002', D: 'Jl. Lama', R: '2026-09-01', AD: 120, kepemilikan: 'PLN', CD: 45 } };
  const n = nilaiAwalHi(h);
  assert.deepEqual([n.C, n.D, n.R, n.AD, n.kepemilikan, n.CD, n.CE], ['TB0002', 'Jl. Lama', '2026-09-01', '120', 'PLN', '45', '']);
  assert.deepEqual(isianBerubah(n, { ...n, D: 'Jl. Baru' }), ['D']);
  const p = payloadHi('TB0002', 7, n, { ...n, D: ' Jl. Baru ', AD: '130,5', AE: '', CD: '', C: 'TB9999' });
  assert.deepEqual(p, { noGardu: 'TB0002', revision: 7, nilai: { D: 'Jl. Baru', AD: 130.5, CD: '' } });
  assert.deepEqual(payloadHi('TB0002', 7, n, n).nilai, {});
});

test('form HI: galat angka, pilihan select menyimpan nilai lama', () => {
  assert.deepEqual(galatHi({ AD: 'abc', AE: '12,5', T: '-1' }), { AD: 'Isi angka', T: 'Minimal 0' });
  assert.deepEqual(pilihanIsian(['Baik', 'Rusak'], 'Lama'), ['Lama', 'Baik', 'Rusak']);
  assert.deepEqual(pilihanIsian(['Baik'], 'Baik'), ['Baik']);
});

test('kategori beban server: Overload / Buruk merah, Underload kuning, Cukup hijau', () => {
  assert.deepEqual(['Buruk', 'Overload', 'Underload', 'Cukup', ''].map(jenisKategori), ['belum', 'belum', 'proses', 'ok', 'v1']);
});

test('hasil 3 sheet: ok per file, lewat kalau belum diatur, gagal satu tab = file gagal', () => {
  const r = ringkasHasilHi([
    { file: 'Master HI Toboali', tab: 'Master_Gardu', ok: true, jumlah: 3 }, { file: 'Master HI Toboali', tab: 'Suhu & Fisik Trafo', ok: true, jumlah: 1 },
    { file: 'Master HI HP', tab: '1. DATA TRAFO', ok: true, jumlah: 2 }, { file: 'Master HI HP', tab: '2. SUHU & FISIK TRAFO', ok: false, pesan: 'SHEET_TIDAK_ADA' },
    { file: 'Master HI UP3', tab: 'INPUT TBL', ok: false, lewat: 'SHEET_GARDU_UP3 kosong' },
  ]);
  assert.deepEqual(r.map((x) => [x.nama, x.ok, x.lewat, x.jumlah]), [['Master HI Toboali', true, false, 4], ['Master HI HP', false, false, 2], ['Master HI UP3', false, true, 0]]);
});

test('riwayat: update ke master hanya Yandal / Inspeksi Gardu dengan ukurId; sudah di master dibanding kode per periode', () => {
  assert.equal(bisaUpdateUkur({ sumber: 'Inspeksi Gardu', ukurId: 'u1', periode: 'LWBP' }), true);
  assert.equal(bisaUpdateUkur({ sumber: 'Master Gardu', ukurId: '', periode: 'WBP' }), false);
  const g = { kodeUkur: 'K-1', lwbp: { kodeUkur: 'K-2' } };
  assert.equal(sudahDiMaster(g, { periode: 'WBP', kode: 'K-1' }), true);
  assert.equal(sudahDiMaster(g, { periode: 'LWBP', kode: 'K-1' }), false);
  assert.equal(sudahDiMaster({ kodeUkur: 'K-1', lwbp: null }, { periode: 'LWBP', kode: 'K-2' }), false);
});
