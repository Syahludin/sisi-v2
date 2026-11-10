import test from 'node:test';
import assert from 'node:assert/strict';
import { bukaRel, feederMenu, GRUP_MENU, KATALOG_MENU, MAKS_REL, menuBelumSiap, relEfektif, saringMenu, sembunyiRel, tutupRel } from '../src/katalog.js';

const sesiSemua = { menu: KATALOG_MENU.map((m) => ({ kode: m.kode, aksi: 'UBAH' })) };

test('katalog: setiap menu berada di salah satu grup menu atas, nama menu tidak ada yang kembar', () => {
  for (const m of KATALOG_MENU) assert.ok(GRUP_MENU.includes(m.grup), m.kode + ' grup ' + m.grup);
  const nama = KATALOG_MENU.map((m) => m.nama);
  assert.equal(new Set(nama).size, nama.length, 'nama ganda: ' + nama.filter((n, i) => nama.indexOf(n) !== i));
});

test('feederMenu: hanya menu siap, nomor feeder mengikuti urutan grup walau grup di depannya kosong', () => {
  const f = feederMenu(sesiSemua);
  assert.deepEqual(f.map((g) => g.no), ['01', '02', '03', '04', '05']);
  assert.ok(f.every((g) => g.menu.every((m) => m.siap)));
  // admin yang hanya punya menu Jaringan: tetap Feeder 05, bukan 01
  const hanyaJaringan = feederMenu({ menu: [{ kode: 'OPS_VERIFIKASI_TIANG', aksi: 'LIHAT' }] });
  assert.deepEqual(hanyaJaringan.map((g) => [g.no, g.grup]), [['05', 'Jaringan & Gardu']]);
  assert.deepEqual(feederMenu({ menu: [] }), []);
});

test('menuBelumSiap: menu tanpa halaman tidak masuk menu atas tetapi terdaftar sebagai segera', () => {
  const segera = menuBelumSiap(sesiSemua).map((m) => m.kode);
  assert.ok(segera.includes('OPS_ENGINE') && segera.includes('ROW_LAPORAN'));
  assert.ok(!feederMenu(sesiSemua).flatMap((g) => g.menu).some((m) => segera.includes(m.kode)));
});

test('saringMenu: cocok pada nama, deskripsi, atau grup; kosong = semua; tanpa hasil = daftar kosong', () => {
  const f = feederMenu(sesiSemua);
  assert.equal(saringMenu(f, '  '), f);
  assert.deepEqual(saringMenu(f, 'TIANG').flatMap((g) => g.menu.map((m) => m.kode)), ['OPS_VERIFIKASI_TIANG']);
  assert.ok(saringMenu(f, 'padam').flatMap((g) => g.menu).some((m) => m.kode === 'OPS_JADWAL_PADAM'));
  assert.deepEqual(saringMenu(f, 'jaringan & gardu').map((g) => g.grup), ['Jaringan & Gardu']);
  assert.deepEqual(saringMenu(f, 'zzzz'), []);
});

test('relEfektif: kode tanpa akses dan ganda dibuang, tersimpan kosong = rel kosong, paling banyak MAKS_REL', () => {
  const siap = feederMenu(sesiSemua).flatMap((g) => g.menu);
  assert.deepEqual(relEfektif(null, siap), []);
  assert.deepEqual(relEfektif(['OPS_DATA_ASET', 'OPS_DATA_ASET', 'KODE_LAMA'], siap), ['OPS_DATA_ASET']);
  const banyak = siap.slice(0, MAKS_REL + 2).map((m) => m.kode);
  assert.deepEqual(relEfektif(banyak, siap), banyak.slice(-MAKS_REL));
});

test('bukaRel: menu baru di ujung, yang sudah ada tidak berubah, penuh = yang terlama dilepas kecuali yang aktif', () => {
  const rel = ['a', 'b'];
  assert.deepEqual(bukaRel(rel, 'c'), ['a', 'b', 'c']);
  assert.equal(bukaRel(rel, 'a'), rel);
  assert.equal(bukaRel(rel, ''), rel);
  const penuh = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.deepEqual(bukaRel(penuh, 'g', 'f'), ['b', 'c', 'd', 'e', 'f', 'g']);
  assert.deepEqual(bukaRel(penuh, 'g', 'a'), ['a', 'c', 'd', 'e', 'f', 'g']);
  assert.deepEqual(bukaRel(['a'], 'b', 'a', 1), ['b']);   // tak ada yang boleh dilepas selain yang aktif: batas tetap dipegang
});

test('tutupRel: membuang satu menu dari rel', () => {
  assert.deepEqual(tutupRel(['a', 'b', 'c'], 'b'), ['a', 'c']);
  assert.deepEqual(tutupRel(['a'], 'z'), ['a']);
});

test('sembunyiRel: yang terlama dilepas dulu, menu aktif dan minimal satu menu tetap tampil', () => {
  const lebar = { a: 100, b: 100, c: 100, d: 100 };
  assert.deepEqual(sembunyiRel(['a', 'b', 'c', 'd'], 'd', lebar, 1000), []);
  // ruang 330 = 76 (tambah) + 104 (N lagi) + 150: hanya satu menu muat
  assert.deepEqual(sembunyiRel(['a', 'b', 'c', 'd'], 'd', lebar, 330), ['a', 'b', 'c']);
  assert.deepEqual(sembunyiRel(['a', 'b', 'c', 'd'], 'a', lebar, 330), ['b', 'c', 'd']);
  assert.deepEqual(sembunyiRel(['a', 'b', 'c', 'd'], 'd', lebar, 470), ['a', 'b']);
  assert.deepEqual(sembunyiRel(['a', 'b'], 'a', lebar, 0), ['b']);
  assert.deepEqual(sembunyiRel(['a'], 'a', lebar, 0), []);
  assert.deepEqual(sembunyiRel(['a', 'b'], '', {}, 500), []);   // belum diukur = tampil dulu
});
