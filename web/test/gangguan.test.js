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

test('cocokkanKejadian: sama persis, nilai beda, waktu bergeser, hanya di satu sumber', async () => {
  const { cocokkanKejadian, bedaKejadian } = await import('../src/gangguan.js');
  const sl = [
    { penyulang: 'PALAS', waktu_padam: '2026-03-02 10:00', durasi_menit: 30, indikasi: 'GFR', kode_fgtm: 'Pohon - E1', peralatan: 'ACR A' },   // sama (kode FGTM beda tulisan)
    { penyulang: 'PALAS', waktu_padam: '2026-03-03 08:00', durasi_menit: 20, indikasi: 'GFR', peralatan: 'ACR A' },                           // durasi beda 5
    { penyulang: 'KOTA', waktu_padam: '2026-03-04 09:00', durasi_menit: 10 },                                                              // waktu bergeser 7 menit
    { penyulang: 'TUNGKAL', waktu_padam: '2026-03-05 09:00' },                                                                              // hanya SiMonLang
    { penyulang: 'PALAS', waktu_padam: '2026-03-09 09:00' },                                                                                // wilayah jauh (>30 menit): terpisah
  ];
  const wil = [
    { penyulang: 'palas ', waktu_padam: '2026-03-02 10:00', durasi_menit: 30, indikasi: 'gfr', kode_fgtm: 'Pohon E1', peralatan: 'ACR A' },
    { penyulang: 'PALAS', waktu_padam: '2026-03-03 08:00', durasi_menit: 25, indikasi: 'GFR', peralatan: 'ACR A' },
    { penyulang: 'KOTA', waktu_padam: '2026-03-04 09:07', durasi_menit: 10 },
    { penyulang: 'PALAS', waktu_padam: '2026-03-09 11:00' },
  ];
  const h = cocokkanKejadian(sl, wil, 'penyulang');
  assert.equal(h.sama, 2, 'sama persis + waktu bergeser 7 menit (<= 1 jam) tanpa selisih lain = sama');
  assert.equal(h.pasangan.length, 1);
  assert.deepEqual(h.pasangan[0].beda.map((b) => [b.medan, b.sl, b.wil]), [['durasi_menit', 20, 25]]);
  assert.deepEqual(h.hanyaSl.map((o) => o.penyulang + o.waktu_padam.slice(5, 10)), ['TUNGKAL03-05', 'PALAS03-09']);
  assert.deepEqual(h.hanyaWil.map((o) => o.waktu_padam.slice(5, 16)), ['03-09 11:00']);
  // toleransi angka: durasi/ENS selisih 1 dianggap sama; kosong vs terisi = beda
  assert.deepEqual(bedaKejadian({ durasi_menit: 10 }, { durasi_menit: 11 }, 'penyulang'), []);
  assert.deepEqual(bedaKejadian({ cuaca: '' }, { cuaca: 'HUJAN' }, 'penyulang').map((b) => b.medan), ['cuaca']);
  // kembar (penyulang + menit sama) dicocokkan berurutan, tidak saling menimpa
  const k = cocokkanKejadian([{ penyulang: 'A', waktu_ar: '2026-01-01 05:00' }, { penyulang: 'A', waktu_ar: '2026-01-01 05:00' }], [{ penyulang: 'A', waktu_ar: '2026-01-01 05:00' }], 'ar');
  assert.equal(k.sama, 1);
  assert.equal(k.hanyaSl.length, 1);
});

test('normalPeralatan: "- UJUNG", tanda baca, SP / SP. / SIMPANG dianggap sama; peralatan lain tetap beda', async () => {
  const { normalPeralatan, bedaKejadian } = await import('../src/gangguan.js');
  assert.equal(normalPeralatan('ACR POLSEK SIMBA - UJUNG'), normalPeralatan('ACR Polsek Simba'));
  assert.equal(normalPeralatan('ACR PENUTUK - UJUNG'), normalPeralatan('ACR PENUTUK'));
  assert.equal(normalPeralatan('ACR SP. TIGA'), normalPeralatan('acr simpang tiga'));
  assert.equal(normalPeralatan('ACR SP TIGA - UJUNG'), normalPeralatan('ACR Simpang Tiga'));
  assert.notEqual(normalPeralatan('ACR TEBING PANJANG'), normalPeralatan('PMT TANGIT'));
  assert.equal(normalPeralatan('ACR UJUNG'), 'ACR UJUNG', 'UJUNG yang memang bagian nama tidak dibuang');
  assert.deepEqual(bedaKejadian({ peralatan: 'ACR POLSEK SIMBA' }, { peralatan: 'ACR POLSEK SIMBA - UJUNG' }, 'ar'), []);
  assert.deepEqual(bedaKejadian({ peralatan: 'ACR TEBING PANJANG' }, { peralatan: 'PMT TANGIT' }, 'ar').map((b) => b.medan), ['peralatan']);
});

test('cocokkanKejadian: indikasi jadi pembeda - GFR dan OCR di penyulang + menit yang sama dipasangkan sesuai indikasinya', async () => {
  const { cocokkanKejadian } = await import('../src/gangguan.js');
  const w = '2026-11-10 10:00';
  // dua kejadian bersamaan; urutan di dua sumber terbalik, tetap berpasangan menurut indikasi
  const sl = [{ penyulang: 'TUNGKAL', waktu_ar: w, indikasi: 'GFR', arus_r: 10 }, { penyulang: 'TUNGKAL', waktu_ar: w, indikasi: 'OCR', arus_r: 99 }];
  const wil = [{ penyulang: 'TUNGKAL', waktu_ar: w, indikasi: 'OCR', arus_r: 99 }, { penyulang: 'TUNGKAL', waktu_ar: w, indikasi: 'GFR', arus_r: 10 }];
  const h = cocokkanKejadian(sl, wil, 'ar');
  assert.equal(h.sama, 2, 'tidak ada selisih palsu karena urutan');
  assert.equal(h.pasangan.length + h.hanyaSl.length + h.hanyaWil.length, 0);
  // satu kejadian saja tetapi indikasinya diinput berbeda: tetap satu pasangan dengan selisih indikasi (bukan dua "hanya")
  const s = cocokkanKejadian([{ penyulang: 'A', waktu_ar: w, indikasi: 'GFR' }], [{ penyulang: 'A', waktu_ar: w, indikasi: 'OCR' }], 'ar');
  assert.equal(s.pasangan.length, 1);
  assert.deepEqual(s.pasangan[0].beda.map((b) => [b.medan, b.sl, b.wil]), [['indikasi', 'GFR', 'OCR']]);
  assert.equal(s.hanyaSl.length + s.hanyaWil.length, 0);
  // GFR + OCR di satu sumber, hanya GFR di sumber lain: OCR menjadi "hanya", GFR cocok
  const b = cocokkanKejadian([{ penyulang: 'A', waktu_ar: w, indikasi: 'GFR' }, { penyulang: 'A', waktu_ar: w, indikasi: 'OCR' }], [{ penyulang: 'A', waktu_ar: w, indikasi: 'gfr' }], 'ar');
  assert.equal(b.sama, 1);
  assert.deepEqual(b.hanyaSl.map((o) => o.indikasi), ['OCR']);
});

test('selisih jam sampai 1 jam dianggap sama, lebih dari 1 jam berbeda; tanggal jadi acuan utama', async () => {
  const { cocokkanKejadian } = await import('../src/gangguan.js');
  const a = (w, extra = {}) => ({ penyulang: 'PALAS', waktu_padam: w, indikasi: 'GFR', ...extra });
  let h = cocokkanKejadian([a('2026-11-10 10:00')], [a('2026-11-10 11:00')], 'penyulang');
  assert.equal(h.sama, 1, 'tepat 60 menit masih sama');
  h = cocokkanKejadian([a('2026-11-10 10:00')], [a('2026-11-10 11:01')], 'penyulang');
  assert.equal(h.sama + h.pasangan.length, 0);
  assert.equal(h.hanyaSl.length, 1);
  assert.equal(h.hanyaWil.length, 1, '61 menit = dua kejadian berbeda');
  // lewat tengah malam tetap dipasangkan bila <= 1 jam; di hari yang sama didahulukan
  h = cocokkanKejadian([a('2026-11-10 23:50')], [a('2026-11-11 00:20')], 'penyulang');
  assert.equal(h.sama, 1);
  h = cocokkanKejadian([a('2026-11-10 23:50')], [a('2026-11-11 00:20'), a('2026-11-10 23:00')], 'penyulang');
  assert.equal(h.sama, 1);
  assert.equal(h.hanyaWil[0].waktu_padam, '2026-11-11 00:20', 'pasangan = 23:00 (tanggal sama), 00:20 sisa');
  // waktu nyala ikut toleransi 1 jam
  h = cocokkanKejadian([a('2026-11-10 10:00', { waktu_nyala: '2026-11-10 10:30' })], [a('2026-11-10 10:00', { waktu_nyala: '2026-11-10 11:20' })], 'penyulang');
  assert.equal(h.sama, 1);
  h = cocokkanKejadian([a('2026-11-10 10:00', { waktu_nyala: '2026-11-10 10:30' })], [a('2026-11-10 10:00', { waktu_nyala: '2026-11-10 11:45' })], 'penyulang');
  assert.deepEqual(h.pasangan[0].beda.map((b) => b.medan), ['waktu_nyala']);
});

test('normalPeralatan: kurung dan bagian sesudah " - " diabaikan (OG PERMIS, PMT A - B)', async () => {
  const { normalPeralatan, bedaKejadian } = await import('../src/gangguan.js');
  assert.equal(normalPeralatan('OG PERMIS (GH PAYUNG)'), normalPeralatan('OG PERMIS - UJUNG'));
  assert.equal(normalPeralatan('OG SEBAGIN (GH PAYUNG) (GH PAYUNG)'), 'OG SEBAGIN');
  assert.equal(normalPeralatan('PMT A'), normalPeralatan('PMT A - B'));
  assert.notEqual(normalPeralatan('PMT A - B'), normalPeralatan('PMT C - D'));
  assert.equal(normalPeralatan('LBS SP-3'), 'LBS SP 3', 'tanda hubung tanpa spasi tetap bagian nama');
  assert.equal(normalPeralatan('ACR TEBING PANJANG (GH X'), 'ACR TEBING PANJANG', 'kurung tak tertutup');
  assert.deepEqual(bedaKejadian({ peralatan: 'PMT A' }, { peralatan: 'PMT A - B' }, 'penyulang'), []);
  assert.deepEqual(bedaKejadian({ peralatan: 'ACR TEBING PANJANG' }, { peralatan: 'PMT TANGIT' }, 'penyulang').map((b) => b.medan), ['peralatan']);
});

test('normalCuaca: HUJAN DISERTAI PETIR = HUJAN + PETIR; cuaca lain tetap beda', async () => {
  const { normalCuaca, bedaKejadian } = await import('../src/gangguan.js');
  assert.equal(normalCuaca('HUJAN DISERTAI PETIR'), normalCuaca('HUJAN + PETIR'));
  assert.equal(normalCuaca('Hujan  dengan petir'), 'HUJAN PETIR');
  assert.equal(normalCuaca('HUJAN&PETIR'), 'HUJAN PETIR');
  assert.equal(normalCuaca('HUJAN DAN ANGIN'), 'HUJAN ANGIN');
  assert.notEqual(normalCuaca('HUJAN'), normalCuaca('HUJAN + PETIR'));
  assert.notEqual(normalCuaca('CERAH'), normalCuaca('MENDUNG'));
  assert.deepEqual(bedaKejadian({ cuaca: 'HUJAN DISERTAI PETIR' }, { cuaca: 'HUJAN + PETIR' }, 'penyulang'), []);
  assert.deepEqual(bedaKejadian({ cuaca: 'HUJAN' }, { cuaca: 'HUJAN + PETIR' }, 'ar').map((b) => b.medan), ['cuaca']);
  assert.deepEqual(bedaKejadian({ cuaca: '' }, { cuaca: 'CERAH' }, 'ar').map((b) => b.medan), ['cuaca']);
});

test('kejadian yang waktunya hanya tanggal (tanpa jam) tetap dipasangkan; beda indikasi = satu kartu', async () => {
  const { cocokkanKejadian } = await import('../src/gangguan.js');
  const sl = [{ penyulang: 'TUNGKAL', peralatan: 'ACR POLSEK SIMBA', waktu_ar: '2026-11-06', indikasi: 'OCR' }];
  const wil = [{ penyulang: 'TUNGKAL', peralatan: 'ACR POLSEK SIMBA - UJUNG', waktu_ar: '2026-11-06', indikasi: 'GFR' }];
  const h = cocokkanKejadian(sl, wil, 'ar');
  assert.equal(h.pasangan.length, 1);
  assert.deepEqual(h.pasangan[0].beda.map((b) => b.medan), ['indikasi']);
  assert.equal(h.hanyaSl.length + h.hanyaWil.length, 0);
  // dengan jam, jam tanpa nol di depan ('5:57') terbaca
  const j = cocokkanKejadian([{ penyulang: 'A', waktu_ar: '2026-11-06 5:57', indikasi: 'GFR' }], [{ penyulang: 'A', waktu_ar: '2026-11-06 06:30', indikasi: 'OCR' }], 'ar');
  assert.equal(j.pasangan.length, 1, '33 menit = satu kejadian');
  // tanggal berbeda tanpa jam = bukan kejadian yang sama
  const k = cocokkanKejadian([{ penyulang: 'A', waktu_ar: '2026-11-06', indikasi: 'GFR' }], [{ penyulang: 'A', waktu_ar: '2026-11-07', indikasi: 'GFR' }], 'ar');
  assert.equal(k.hanyaSl.length + k.hanyaWil.length, 2);
});

test('satu sumber punya jam trip, sumber lain tidak: dianggap sama bila tanggal, penyulang, dan section sama', async () => {
  const { cocokkanKejadian } = await import('../src/gangguan.js');
  const sl = [{ penyulang: 'TUNGKAL', peralatan: 'ACR POLSEK SIMBA', waktu_ar: '2026-11-06', indikasi: 'GFR' }];                       // tanpa jam
  const wil = [{ penyulang: 'TUNGKAL', peralatan: 'ACR POLSEK SIMBA - UJUNG', waktu_ar: '2026-11-06 21:24', indikasi: 'GFR' }];      // ada jam
  let h = cocokkanKejadian(sl, wil, 'ar');
  assert.equal(h.sama, 1, 'beda hanya "jam tidak tercatat" = sama');
  assert.equal(h.pasangan.length + h.hanyaSl.length + h.hanyaWil.length, 0);
  // section beda = bukan kejadian yang sama
  h = cocokkanKejadian([{ penyulang: 'TUNGKAL', peralatan: 'ACR JELUTUNG', waktu_ar: '2026-11-06', indikasi: 'GFR' }], wil, 'ar');
  assert.equal(h.hanyaSl.length, 1);
  assert.equal(h.hanyaWil.length, 1);
  // tanggal beda = bukan kejadian yang sama
  h = cocokkanKejadian([{ penyulang: 'TUNGKAL', peralatan: 'ACR POLSEK SIMBA', waktu_ar: '2026-11-07', indikasi: 'GFR' }], wil, 'ar');
  assert.equal(h.hanyaSl.length + h.hanyaWil.length, 2);
  // penyulang beda = bukan kejadian yang sama
  h = cocokkanKejadian([{ penyulang: 'PAKU', peralatan: 'ACR POLSEK SIMBA', waktu_ar: '2026-11-06', indikasi: 'GFR' }], wil, 'ar');
  assert.equal(h.hanyaSl.length + h.hanyaWil.length, 2);
  // selain jam, selisih lain tetap dilaporkan (indikasi), satu kartu
  h = cocokkanKejadian([{ penyulang: 'TUNGKAL', peralatan: 'ACR POLSEK SIMBA', waktu_ar: '2026-11-06', indikasi: 'OCR' }], wil, 'ar');
  assert.deepEqual(h.pasangan[0].beda.map((b) => b.medan), ['indikasi']);
  // yang jamnya tercatat didahulukan daripada pasangan tanpa jam
  h = cocokkanKejadian(
    [{ penyulang: 'A', peralatan: 'ACR X', waktu_ar: '2026-11-06 10:00', indikasi: 'GFR' }, { penyulang: 'A', peralatan: 'ACR X', waktu_ar: '2026-11-06', indikasi: 'GFR' }],
    [{ penyulang: 'A', peralatan: 'ACR X', waktu_ar: '2026-11-06 10:20', indikasi: 'GFR' }], 'ar');
  assert.equal(h.sama, 1);
  assert.equal(h.hanyaSl.length, 1);
  assert.equal(h.hanyaSl[0].waktu_ar, '2026-11-06', 'yang tanpa jam jadi sisa, bukan yang berjam');
});

test('normalPeralatan: GG. / GG / GANG satu nama (ACR GANG MAWAR = ACR GG. MAWAR - UJUNG)', async () => {
  const { normalPeralatan } = await import('../src/gangguan.js');
  assert.equal(normalPeralatan('ACR GANG MAWAR'), normalPeralatan('ACR GG. MAWAR - UJUNG'));
  assert.equal(normalPeralatan('ACR gg mawar'), normalPeralatan('ACR Gang. Mawar'));
  assert.notEqual(normalPeralatan('ACR GG MAWAR'), normalPeralatan('ACR GG MELATI'));
});

test('cocokkanKejadian menyimpan pasangan yang cocok sempurna (samaDaftar) untuk rincian per penyulang', async () => {
  const { cocokkanKejadian } = await import('../src/gangguan.js');
  const a = (p, w, ind = 'GFR') => ({ penyulang: p, peralatan: 'ACR X', waktu_ar: w, indikasi: ind });
  const h = cocokkanKejadian(
    [a('PALAS', '2026-11-01 10:00'), a('PALAS', '2026-11-02 10:00', 'OCR'), a('KOTA', '2026-11-03 10:00')],
    [a('PALAS', '2026-11-01 10:20'), a('PALAS', '2026-11-02 10:00', 'GFR'), a('TUNGKAL', '2026-11-04 10:00')], 'ar');
  assert.equal(h.sama, 1);
  assert.equal(h.samaDaftar.length, 1);
  assert.equal(h.samaDaftar[0].sl.penyulang, 'PALAS');
  assert.equal(h.samaDaftar[0].menit, 20, 'jam bergeser <= 1 jam tetap cocok');
  assert.equal(h.pasangan.length, 1);
  assert.deepEqual([h.hanyaSl.length, h.hanyaWil.length], [1, 1]);
});
