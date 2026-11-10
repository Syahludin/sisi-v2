import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { bulanTampil, jamWib, KATEGORI_LGP, uraiLaporanGangguan } from '../src/laporanGangguan.js';

// Teks dibuat oleh fungsi server yang SAMA (backend/src lewat harness tes backend): bila format teks server berubah, tes ini gagal.
const { buatKonteks } = createRequire(import.meta.url)('../../tests/harness.js');
const g = buatKonteks({ ENV: 'staging', MASTER_SHEET_ID: 'm', AUTH_SHEET_ID: 'a', KODE_ULP: '16130', ADMIN_EMAIL: 'x@y.z' });
const teksServer = (h, tanggal = '2026-11-03') => g.teksLaporanGangguan_(JSON.parse(JSON.stringify(h)), tanggal);

const H = {
  harian: { pmt: [{ penyulang: 'Bikang', penyebab: 'Pohon' }], sukses: [{ penyulang: 'Tungkal', penyebab: '' }], lockout: [{ penyulang: 'Bikang', penyebab: 'Tidak Diketahui' }] },
  bulan: {
    pmt: [{ nama: 'Kejaksaan', jumlah: 2 }, { nama: 'Bikang', jumlah: 1 }],
    sukses: [{ nama: 'Tungkal', jumlah: 2 }, { nama: 'Tanjung Labu', jumlah: 1 }],
    lockout: [{ nama: 'Bikang', jumlah: 3 }, { nama: 'Kejaksaan', jumlah: 2 }],
  },
  tertinggi: [{ nama: 'Bikang', pmt: 1, section: 3 }, { nama: 'Kejaksaan', pmt: 2, section: 2 }],
};

test('urai teks server: hari laporan per kategori, tertinggi, rekap bulan (penyebab "-" = kosong)', () => {
  const u = uraiLaporanGangguan(teksServer(H));
  assert.equal(u.bulan, 'NOVEMBER 2026');
  assert.deepEqual(u.harian.map((k) => [k.kode, k.label, k.jumlah]), [['pmt', 'PMT Trip', 1], ['sukses', 'AR Sukses', 1], ['lockout', 'AR Lockout', 1]]);
  assert.deepEqual(u.harian[0].kejadian, [{ penyulang: 'Bikang', penyebab: 'Pohon' }]);
  assert.deepEqual(u.harian[1].kejadian, [{ penyulang: 'Tungkal', penyebab: '' }]);
  assert.deepEqual(u.tertinggi, H.tertinggi);
  assert.deepEqual(u.rekap.map((k) => [k.kode, k.total, k.daftar]), [['pmt', 3, H.bulan.pmt], ['sukses', 3, H.bulan.sukses], ['lockout', 5, H.bulan.lockout]]);
});

test('urai teks server kosong = semua NIHIL (jumlah 0, daftar kosong); urutan kategori sama dengan KATEGORI_LGP', () => {
  const u = uraiLaporanGangguan(teksServer(g.hitungLaporanGangguan_([], [], '2026-11-03')));
  assert.deepEqual(u.harian.map((k) => [k.kode, k.jumlah, k.kejadian.length]), KATEGORI_LGP.map((k) => [k.kode, 0, 0]));
  assert.deepEqual(u.tertinggi, []);
  assert.deepEqual(u.rekap.map((k) => [k.total, k.daftar.length]), [[0, 0], [0, 0], [0, 0]]);
});

test('teks bukan format laporan = null (halaman menampilkan teks saja)', () => {
  assert.equal(uraiLaporanGangguan(''), null);
  assert.equal(uraiLaporanGangguan(null), null);
  assert.equal(uraiLaporanGangguan('Yth. Bapak\n▪️ PMT Trip : NIHIL'), null);
  const rusak = teksServer(H).replace('▪️ AR Sukses : 1 kali', '▪️ AR Sukses : banyak');
  assert.equal(uraiLaporanGangguan(rusak), null);
  assert.equal(uraiLaporanGangguan(teksServer(H).replace('\r', '').split('\n').filter((s) => !s.includes('AR Lockout')).join('\n')), null);
});

test('format tampil: bulan, jam WIB', () => {
  assert.equal(bulanTampil('NOVEMBER 2026'), 'November 2026');
  assert.equal(jamWib('2026-11-04T01:12:00.000Z'), '08.12');
  assert.equal(jamWib(''), '');
  assert.equal(jamWib('bukan waktu'), '');
});
