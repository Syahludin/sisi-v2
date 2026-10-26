import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aksiJadwal, dampak, daftarPenyulangJp, daftarSectionJp, durasiJam, durasiTeks, ensRupiah, gabungJadwal, galatIsi, geserBulan,
  gridBulan, isiAwal, labelTanggalJp, payloadJadwal, perTanggal, rentangBulan, ringkasJadwal, rupiah, saringJadwal, tandaKalender,
} from '../src/jadwalPadam.js';
import { aksiMenu } from '../src/katalog.js';

const MASTER = [
  { penyulang: 'Toboali 1', section: 'PMT - LBS Rias', jumlahGardu: 12, jumlahPelanggan: 850, daerahSection: 'Rias', pelangganVip: '', bebanMw: 1.2, arus: 52 },
  { penyulang: 'Toboali 1', section: 'LBS Rias - Ujung', jumlahGardu: 4, jumlahPelanggan: 120, daerahSection: 'Ujung', pelangganVip: 'RSUD', bebanMw: 0.3, arus: 14 },
  { penyulang: 'Lepar', section: 'PMT - Penutuk', jumlahGardu: 7, jumlahPelanggan: 300, daerahSection: 'Penutuk', pelangganVip: '', bebanMw: 0.5, arus: 20 },
];
const J = (o) => ({ jadwalId: 'a', tanggal: '2026-10-26', jamPadam: '09:00', penyulang: 'Toboali 1', status: 'Terjadwal',
  statusPekerjaan: 'Padam', jumlahPelanggan: 100, ensRupiah: 5000, revision: 2, ...o });

test('durasi (lewat tengah malam) + ENS rupiah bulat ke atas, sama dengan server', () => {
  assert.equal(durasiJam('09:00', '12:30'), 3.5);
  assert.equal(durasiJam('22:00', '02:00'), 4);
  assert.equal(durasiJam('9:00', '12:00'), 0);
  assert.equal(ensRupiah(1.2, 3), 5201); // 5200,92 -> bulat ke atas
  assert.equal(ensRupiah(1, 1), 1445);
  assert.equal(ensRupiah(0, 3), 0);
});

test('format: durasi, rupiah, tanggal', () => {
  assert.equal(durasiTeks(3.5), '3 jam 30 menit');
  assert.equal(durasiTeks(0.75), '45 menit');
  assert.equal(durasiTeks(2), '2 jam');
  assert.equal(rupiah(1234567.2), 'Rp 1.234.568');
  assert.equal(labelTanggalJp('2026-10-05'), '5 Oktober 2026');
});

test('bulan: rentang, geser lintas tahun, grid Senin-pertama', () => {
  assert.deepEqual(rentangBulan('2026-02'), { dari: '2026-02-01', sampai: '2026-02-28' });
  assert.equal(geserBulan('2026-12', 1), '2027-01');
  assert.equal(geserBulan('2026-01', -1), '2025-12');
  const g = gridBulan('2026-10'); // 1 Okt 2026 = Kamis
  assert.deepEqual(g[0], [null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  assert.equal(g.flat().filter(Boolean).length, 31);
  assert.ok(g.every((m) => m.length === 7));
});

test('daftar: saring, ringkasan (batal / tanpa padam tidak dihitung), tanda kalender, kelompok tanggal', () => {
  const l = [J(), J({ jadwalId: 'b', status: 'Batal Pemadaman' }), J({ jadwalId: 'c', statusPekerjaan: 'Tanpa Padam', penyulang: 'Lepar' }),
    J({ jadwalId: 'd', tanggal: '2026-10-27', status: 'Terealisasi' })];
  assert.deepEqual(saringJadwal(l, { penyulang: 'toboali 1', status: 'Terjadwal' }).map((j) => j.jadwalId), ['a']);
  assert.deepEqual(saringJadwal(l, { tanggal: '2026-10-27' }).map((j) => j.jadwalId), ['d']);
  assert.deepEqual(ringkasJadwal(l), { total: 4, terjadwal: 2, terealisasi: 1, batal: 1, padam: 2, pelanggan: 200, ens: 10000 });
  assert.deepEqual(tandaKalender(l), { '2026-10-26': { padam: 1, tanpa: 1 }, '2026-10-27': { padam: 1, tanpa: 0 } });
  assert.deepEqual(perTanggal(l).map((g) => [g.tanggal, g.isi.length]), [['2026-10-26', 3], ['2026-10-27', 1]]);
});

test('akses + aksi: hanya UBAH, hanya selama Terjadwal', () => {
  const sesi = { menu: [{ kode: 'OPS_JADWAL_PADAM', aksi: 'UBAH' }, { kode: 'X', aksi: 'LIHAT' }] };
  assert.equal(aksiMenu(sesi, 'OPS_JADWAL_PADAM'), 'UBAH');
  assert.equal(aksiMenu(sesi, 'Y'), '');
  assert.deepEqual(aksiJadwal(J(), true), { ubah: true, realisasi: true, batal: true, hapus: true });
  assert.equal(aksiJadwal(J({ status: 'Terealisasi' }), true).ubah, false);
  assert.equal(aksiJadwal(J(), false).hapus, false);
});

test('master: penyulang (+ dari jadwal), section, pratinjau dampak', () => {
  assert.deepEqual(daftarPenyulangJp(MASTER, [J({ penyulang: 'Koba 3' })]), ['Koba 3', 'Lepar', 'Toboali 1']);
  assert.deepEqual(daftarSectionJp(MASTER, 'toboali 1'), ['LBS Rias - Ujung', 'PMT - LBS Rias']);
  const d = dampak(MASTER, { penyulang: 'Toboali 1', section: 'PMT - LBS Rias', jamPadam: '09:00', jamNyala: '12:00' });
  assert.equal(d.jumlahPelanggan, 850);
  assert.equal(d.durasi, 3);
  assert.equal(d.ens, ensRupiah(1.2, 3));
  assert.equal(dampak(MASTER, { penyulang: 'Toboali 1', section: '', jamPadam: '09:00', jamNyala: '12:00' }), null);
});

test('form: galat per kolom, payload baru (idBaris) vs ubah (jadwalId + revision)', () => {
  const isi = { ...isiAwal(null, '2026-10-26'), penyulang: 'Toboali 1', section: 'PMT - LBS Rias', jenis: ' Pemeliharaan PMT ' };
  assert.deepEqual(galatIsi(MASTER, isi), {});
  const salah = { ...isiAwal(null, '2026-10-26'), penyulang: 'Lepar', section: 'PMT - LBS Rias', jamNyala: '09:00', lokasi: 'x'.repeat(301) };
  assert.deepEqual(Object.keys(galatIsi(MASTER, salah)).sort(), ['jamNyala', 'jenis', 'lokasi', 'section']);
  assert.deepEqual(payloadJadwal(isi, { idBaris: 'id-1' }), { penyulang: 'Toboali 1', section: 'PMT - LBS Rias', jenis: 'Pemeliharaan PMT',
    tanggal: '2026-10-26', jamPadam: '09:00', jamNyala: '12:00', statusPekerjaan: 'Padam', idBaris: 'id-1' });
  const ubah = payloadJadwal({ ...isi, lokasi: ' Jl. Raya ' }, { jadwal: J() });
  assert.equal(ubah.jadwalId, 'a');
  assert.equal(ubah.revision, 2);
  assert.equal(ubah.lokasi, 'Jl. Raya');
  assert.equal('idBaris' in ubah, false);
});

test('gabung hasil simpan: ganti yang sama, tambah baru, urut tanggal + jam', () => {
  const l = [J({ jadwalId: 'a', jamPadam: '10:00' }), J({ jadwalId: 'b', tanggal: '2026-10-28' })];
  assert.deepEqual(gabungJadwal(l, J({ jadwalId: 'c', jamPadam: '08:00' })).map((j) => j.jadwalId), ['c', 'a', 'b']);
  assert.equal(gabungJadwal(l, J({ jadwalId: 'a', status: 'Terealisasi', jamPadam: '10:00' }))[0].status, 'Terealisasi');
});
