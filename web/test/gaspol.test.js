import assert from 'node:assert/strict';
import test from 'node:test';

import { angkaGaspol, galatRentang, GRUP_GASPOL, KOLOM_GASPOL, rentangAwal } from '../src/gaspol.js';
import { menuTampil } from '../src/katalog.js';

test('GASPOL UP3: 38 kolom, grup kepala menutup kolom 5..38, No Gardu = kolom X', () => {
  assert.equal(KOLOM_GASPOL.length, 38);
  assert.equal(4 + GRUP_GASPOL.reduce((n, g) => n + g.n, 0), 38);
  assert.equal(KOLOM_GASPOL[23], 'No Gardu');
  assert.equal(KOLOM_GASPOL[36], 'Care For Asset / CFA (Gwg)');
});

test('GASPOL UP3: rentang bawaan awal bulan s.d. hari ini, urutan dan batas 366 hari', () => {
  assert.deepEqual(rentangAwal('2026-10-28'), { dari: '2026-10-01', sampai: '2026-10-28' });
  assert.equal(galatRentang('2026-10-01', '2026-10-28'), '');
  assert.match(galatRentang('', '2026-10-28'), /Isi/);
  assert.match(galatRentang('2026-10-29', '2026-10-28'), /melebihi/);
  assert.match(galatRentang('2025-10-01', '2026-10-02'), /maksimal/);
  assert.equal(galatRentang('2025-10-02', '2026-10-01'), '');
  assert.equal(angkaGaspol(1.65), '1,65');
});

test('GASPOL UP3: menu sendiri OPS_GASPOL_UP3, terpisah dari Laporan UP3', () => {
  const hal = (menu) => menuTampil({ menu }).map((m) => m.halaman);
  assert.deepEqual(hal([{ kode: 'OPS_LAP_UP3', aksi: 'LIHAT' }]), ['laporan-up3']);
  assert.deepEqual(hal([{ kode: 'OPS_GASPOL_UP3', aksi: 'LIHAT' }]), ['gaspol-up3']);
  assert.deepEqual(hal([{ kode: 'OPS_LAP_UIW', aksi: 'LIHAT' }]), ['laporan-uiw']);
});
