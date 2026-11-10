import assert from 'node:assert/strict';
import test from 'node:test';

import { daftarPenyulang, grupBulanGgn, ringkasGgn, saringGgn, teksDurasi, terbanyak } from '../src/gangguan.js';

const PYL = [
  { penyulang: 'PALAS', waktu_padam: '2026-03-02 10:00', durasi_menit: 30, ens_kwh: 10, pelanggan: 100, penyebab: 'Pohon', indikasi: 'GFR', peralatan: 'ACR A' },
  { penyulang: 'TUNGKAL', waktu_padam: '2026-03-01 08:00', durasi_menit: 90, ens_kwh: null, pelanggan: 50, penyebab: '', indikasi: 'OCR', peralatan: 'OG B' },
  { penyulang: 'PALAS', waktu_padam: '2026-01-05 07:00', durasi_menit: null, ens_kwh: 2, pelanggan: null, penyebab: 'Pohon', indikasi: 'GFR', peralatan: 'ACR A' },
];

test('saring per penyulang, bulan, kata cari (semua kata harus ada)', () => {
  assert.equal(saringGgn(PYL, 'penyulang', { penyulang: 'PALAS' }).length, 2);
  assert.equal(saringGgn(PYL, 'penyulang', { bulan: 3 }).length, 2);
  assert.equal(saringGgn(PYL, 'penyulang', { penyulang: 'PALAS', bulan: 3 }).length, 1);
  assert.equal(saringGgn(PYL, 'penyulang', { cari: 'pohon acr' }).length, 2);
  assert.equal(saringGgn(PYL, 'penyulang', { cari: 'pohon ocr' }).length, 0);
});

test('ringkasan penyulang: per bulan, durasi, ENS, penyebab kosong = Tidak diisi', () => {
  const r = ringkasGgn(PYL, 'penyulang');
  assert.equal(r.jumlah, 3);
  assert.deepEqual(r.perBulan.slice(0, 3), [1, 0, 2]);
  assert.equal(r.durasiMenit, 120);
  assert.equal(r.rataMenit, 40);
  assert.equal(r.ensKwh, 12);
  assert.equal(r.pelanggan, 150);
  assert.deepEqual(r.sebab, [{ nama: 'Pohon', jumlah: 2 }, { nama: 'Tidak diisi', jumlah: 1 }]);
  assert.deepEqual(r.perPenyulang[0], { nama: 'PALAS', jumlah: 2 });
});

test('ringkasan pick up: selesai vs terbuka; daftar penyulang lintas jenis', () => {
  const pu = [{ penyulang: 'PALAS', waktu_event: '2026-02-01', status: 'DONE' }, { penyulang: 'X', waktu_event: '2026-02-03', status: 'OPEN' }];
  const r = ringkasGgn(pu, 'pickup');
  assert.deepEqual([r.selesai, r.terbuka], [1, 1]);
  assert.deepEqual(daftarPenyulang({ penyulang: PYL, ar: [], pickup: pu }).map((p) => p.nama), ['PALAS', 'TUNGKAL', 'X']);
  assert.deepEqual(terbanyak([{ a: 'x' }, { a: 'y' }, { a: 'x' }], 'a', 1), [{ nama: 'x', jumlah: 2 }]);
});

test('grup per bulan berurutan + teks durasi', () => {
  const g = grupBulanGgn(PYL, 'penyulang');
  assert.deepEqual(g.map((x) => [x.label, x.isi.length]), [['Maret 2026', 2], ['Januari 2026', 1]]);
  assert.equal(teksDurasi(135), '2 j 15 m');
  assert.equal(teksDurasi(45), '45 m');
  assert.equal(teksDurasi(120), '2 j');
  assert.equal(teksDurasi(null), '-');
});

import { bulanRentang, cocokKode, kodeFgtm, perBulanRentang, pieFgtm, saringFilter } from '../src/gangguan.js';

test('kode FGTM: format penyulang (- E1) dan AR (E1), tanpa kode = E Tidak Diketahui, kosong = Belum diisi', () => {
  assert.deepEqual(kodeFgtm('Pohon - E1'), { kode: 'E1', label: 'Pohon', grup: 'EXTERNAL' });
  assert.equal(kodeFgtm('Pekerjaan Pihak III Binatang E3').kode, 'E3');
  assert.deepEqual(kodeFgtm('Tiang - I4'), { kode: 'I4', label: 'Tiang', grup: 'INTERNAL' });
  assert.equal(kodeFgtm('Komponen JTM I1').grup, 'INTERNAL');
  for (const t of ['Tidak Diketahui', 'Proses Penelusuran', 'Event Gangguan Tidak Terbaca di Lapangan']) assert.equal(kodeFgtm(t).kode, 'E', t);
  assert.deepEqual(kodeFgtm(''), { kode: '', label: 'Belum diisi', grup: '' });
  assert.equal(kodeFgtm('Kode Baru - I7').grup, 'INTERNAL', 'kode baru tetap masuk grupnya');
  assert.ok(cocokKode('Pohon E1', 'EXTERNAL') && cocokKode('Pohon E1', 'E1') && !cocokKode('Pohon E1', 'INTERNAL') && cocokKode('', ''));
});

test('pie FGTM per tab, bulan rentang lintas tahun, saring filter', () => {
  const b = [{ kode_fgtm: 'Pohon - E1' }, { kode_fgtm: 'Pohon E1' }, { kode_fgtm: 'Trafo - I3' }, { kode_fgtm: 'Tidak Diketahui' }, {}];
  assert.deepEqual(pieFgtm(b).map((x) => [x.kode, x.jumlah]), [['E1', 2], ['', 1], ['E', 1], ['I3', 1]]);
  assert.deepEqual(pieFgtm(b, 'INTERNAL').map((x) => x.kode), ['I3']);
  assert.deepEqual(pieFgtm(b, 'EXTERNAL').map((x) => x.kode), ['E1', 'E']);
  assert.deepEqual(bulanRentang('2025-11-15', '2026-02-01'), ['2025-11', '2025-12', '2026-01', '2026-02']);
  const r = [{ penyulang: 'A', waktu_padam: '2025-12-03 10:00', kode_fgtm: 'Pohon E1' }, { penyulang: 'B', waktu_padam: '2026-01-05', kode_fgtm: 'Trafo I3' }];
  assert.deepEqual(perBulanRentang(r, 'penyulang', '2025-12-01', '2026-01-31').map((x) => [x.label, x.jumlah]), [["Des '25", 1], ["Jan '26", 1]]);
  assert.equal(saringFilter(r, 'penyulang', { fgtm: 'INTERNAL' }).length, 1);
  assert.equal(saringFilter(r, 'penyulang', { dari: '2026-01-01' }).length, 1);
  assert.equal(saringFilter([{ penyulang: 'A', waktu_event: '2026-01-01' }], 'pickup', { fgtm: 'E1' }).length, 1, 'pick up tidak punya kode');
});

import { hitungKategori, kategoriAlat, perTahunGgn, rentangTahun, tigaTahun, topPenyulang } from '../src/gangguan.js';

test('kategori PMT | Section: jenis peralatan dulu, pick up dari nama recloser', () => {
  assert.equal(kategoriAlat({ jenis_peralatan: 'PMT', peralatan: 'PMT KOTA' }, 'penyulang'), 'pmt');
  assert.equal(kategoriAlat({ jenis_peralatan: 'ACR', peralatan: 'ACR PALAS' }, 'ar'), 'section');
  assert.equal(kategoriAlat({ jenis_peralatan: 'OG', peralatan: 'ACR POLSEK SIMBA' }, 'penyulang'), 'section');
  assert.equal(kategoriAlat({ recloser: 'PMT TANGIT' }, 'pickup'), 'pmt');
  assert.equal(kategoriAlat({ recloser: 'LBS JERNANG' }, 'pickup'), 'section');
  assert.equal(kategoriAlat({ recloser: '' }, 'pickup'), 'section');
  assert.deepEqual(hitungKategori([{ jenis_peralatan: 'PMT' }, { jenis_peralatan: 'ACR' }, { jenis_peralatan: 'OG' }], 'penyulang'), { jumlah: 3, pmt: 1, section: 2 });
});

test('rentang tahun + tiga tahun', () => {
  assert.deepEqual(rentangTahun(2026, '2026-10-27'), { dari: '2026-01-01', sampai: '2026-10-27' });
  assert.deepEqual(rentangTahun(2025, '2026-10-27'), { dari: '2025-01-01', sampai: '2025-12-31' });
  assert.deepEqual(tigaTahun(2026), [2024, 2025, 2026]);
});

test('top penyulang satu tahun + jumlah 3 tahun, per tahun PMT | Section', () => {
  const r = [
    { penyulang: 'PALAS', waktu_ar: '2026-02-01', jenis_peralatan: 'PMT' },
    { penyulang: 'PALAS', waktu_ar: '2026-03-01', jenis_peralatan: 'ACR' },
    { penyulang: 'KOTA', waktu_ar: '2026-03-01', jenis_peralatan: 'ACR' },
    { penyulang: 'KOTA', waktu_ar: '2025-03-01', jenis_peralatan: 'ACR' },
    { penyulang: 'BIKANG', waktu_ar: '2024-03-01', jenis_peralatan: 'ACR' },
    { penyulang: 'TUA', waktu_ar: '2022-03-01', jenis_peralatan: 'ACR' },
  ];
  const t = topPenyulang(r, 'ar', 2026);
  assert.deepEqual(t.map((x) => [x.nama, x.jumlah, x.pmt, x.section]), [['PALAS', 2, 1, 1], ['KOTA', 1, 0, 1]]);
  assert.deepEqual(t[1].tahun, { 2024: 0, 2025: 1, 2026: 1 });
  assert.deepEqual(topPenyulang(r, 'ar', 2024).map((x) => x.nama), ['BIKANG']);
  assert.deepEqual(perTahunGgn(r, 'ar', 2026).map((x) => [x.tahun, x.jumlah, x.pmt]), [[2024, 1, 0], [2025, 1, 0], [2026, 3, 1]]);
  assert.equal(topPenyulang(Array.from({ length: 20 }, (_, i) => ({ penyulang: 'P' + i, waktu_ar: '2026-01-01' })), 'ar', 2026).length, 12);
});

import { perBulanTigaTahun } from '../src/gangguan.js';

test('perBulanTigaTahun: Jan-Des x 3 tahun, PMT vs Section, batas tahun dan bulan tidak valid dibuang', () => {
  const r = [
    { waktu_padam: '2026-03-02 10:00', jenis_peralatan: 'PMT' },
    { waktu_padam: '2026-03-20 11:00', jenis_peralatan: 'ACR' },
    { waktu_padam: '2025-03-05 07:00', peralatan: 'PMT GI TOBOALI' },
    { waktu_padam: '2024-12-31 23:59', peralatan: 'OG X' },
    { waktu_padam: '2023-03-01 08:00', jenis_peralatan: 'PMT' },   // di luar 3 tahun
    { waktu_padam: '2027-01-01 08:00', jenis_peralatan: 'PMT' },   // di luar 3 tahun
    { waktu_padam: '2026-13-01 08:00', jenis_peralatan: 'PMT' },   // bulan tidak valid
    { waktu_padam: '' },
  ];
  const h = perBulanTigaTahun(r, 'penyulang', 2026);
  assert.equal(h.length, 12);
  assert.deepEqual(h.map((b) => b.pendek).slice(0, 3), ['Jan', 'Feb', 'Mar']);
  assert.deepEqual(h[2].tahun, [
    { tahun: 2024, jumlah: 0, pmt: 0, section: 0 },
    { tahun: 2025, jumlah: 1, pmt: 1, section: 0 },
    { tahun: 2026, jumlah: 2, pmt: 1, section: 1 },
  ]);
  assert.deepEqual(h[11].tahun.map((t) => [t.tahun, t.jumlah, t.section]), [[2024, 1, 1], [2025, 0, 0], [2026, 0, 0]]);
  assert.equal(h.reduce((n, b) => n + b.tahun.reduce((m, t) => m + t.jumlah, 0), 0), 4);
  assert.deepEqual(perBulanTigaTahun(null, 'ar', 2026)[0].tahun.map((t) => t.jumlah), [0, 0, 0]);
});

test('samaPenyulang + saringGgn: nama penyulang dicocokkan tanpa beda huruf besar-kecil dan spasi tepi', async () => {
  const { samaPenyulang, saringFilter } = await import('../src/gangguan.js');
  assert.equal(samaPenyulang('PALAS', ' palas '), true);
  assert.equal(samaPenyulang('PALAS', 'PALAS 2'), false);
  assert.equal(samaPenyulang(null, ''), true);
  const baris = [{ penyulang: 'Palas', waktu_padam: '2026-11-01 10:00', kode_fgtm: '' }, { penyulang: 'KELAPA', waktu_padam: '2026-11-02 10:00', kode_fgtm: '' }];
  assert.equal(saringFilter(baris, 'penyulang', { penyulang: 'PALAS' }).length, 1);
  assert.equal(saringGgn(baris, 'penyulang', { penyulang: 'palas' }).length, 1);
});
