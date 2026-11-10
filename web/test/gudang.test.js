import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adaStokTanpaIzin, bolehUbahGudang, dataKirim, dataKoreksi, dataStok, dataTarik, labelCara, pilihanCara, ringkasJenis, teksSelisih, totalJenis,
} from '../src/gudang.js';

const ID = '11111111-1111-4111-8111-111111111111';
const F = (o) => ({ materialId: 'm1', daya: ' 2A ', merk: 'Schneider ', statusMcb: 'Baru', jumlah: '3', ...o });
const galat = (fn) => { try { fn(); } catch (e) { return e.kode; } return null; };

test('akses ubah: ADMIN/SUPER dengan aksi UBAH di menu Material Gudang; ADMIN_ES / LIHAT / tanpa menu tidak', () => {
  const s = (role, aksi) => ({ profil: { role }, menu: [{ kode: 'OPS_GUDANG_MATERIAL', aksi }] });
  assert.equal(bolehUbahGudang(s('ADMIN', 'UBAH')), true);
  assert.equal(bolehUbahGudang(s('SUPER', 'UBAH')), true);
  assert.equal(bolehUbahGudang(s('ADMIN', 'LIHAT')), false);
  assert.equal(bolehUbahGudang(s('ADMIN_ES', 'UBAH')), false);
  assert.equal(bolehUbahGudang({ profil: { role: 'ADMIN' }, menu: [] }), false);
});

test('ringkasan jenis MCB dan total', () => {
  const l = [{ daya: '2A', merk: 'Schneider', statusMcb: 'Baru', jumlah: 3 }, { daya: '4A', merk: 'Hager', statusMcb: 'Ex-Handal', jumlah: 1 }];
  assert.equal(totalJenis(l), 4);
  assert.equal(ringkasJenis(l), '3 × 2A Schneider Baru; 1 × 4A Hager Ex-Handal');
  assert.equal(ringkasJenis([]), '-');
  assert.equal(totalJenis([]), 0);
});

test('dataStok / dataKirim: rapikan teks, jumlah angka bulat > 0, idOperasi ikut, catatan hanya bila diisi', () => {
  assert.deepEqual(dataStok(F({}), ID), { idOperasi: ID, materialId: 'm1', daya: '2A', merk: 'Schneider', statusMcb: 'Baru', jumlah: 3 });
  assert.deepEqual(dataKirim(F({ timId: 't1', catatan: ' dari PLN ' }), ID),
    { idOperasi: ID, timId: 't1', materialId: 'm1', daya: '2A', merk: 'Schneider', statusMcb: 'Baru', jumlah: 3, catatan: 'dari PLN' });
  assert.equal(galat(() => dataKirim(F({}), ID)), 'FIELD_WAJIB', 'tim wajib');
  for (const [jumlah, kode] of [['', 'FIELD_WAJIB'], ['0', 'DI_LUAR_RENTANG'], ['-2', 'DI_LUAR_RENTANG'], ['1.5', 'HARUS_BULAT'], ['abc', 'TIPE_SALAH'], ['100001', 'DI_LUAR_RENTANG']]) {
    assert.equal(galat(() => dataStok(F({ jumlah }), ID)), kode, 'jumlah ' + jumlah);
  }
  assert.equal(galat(() => dataStok(F({ daya: ' ' }), ID)), 'FIELD_WAJIB');
  assert.equal(galat(() => dataStok(F({ merk: '' }), ID)), 'FIELD_WAJIB');
  assert.equal(galat(() => dataStok(F({ statusMcb: 'Bekas' }), ID)), 'PILIHAN_TIDAK_VALID');
  assert.equal(galat(() => dataStok(F({ materialId: '' }), ID)), 'FIELD_WAJIB');
});

test('dataTarik wajib alasan; dataKoreksi menerima nol tetapi bukan negatif dan wajib alasan', () => {
  assert.equal(galat(() => dataTarik(F({ timId: 't1', alasan: '  ' }), ID)), 'ALASAN_WAJIB');
  assert.deepEqual(dataTarik(F({ timId: 't1', alasan: 'tim bubar' }), ID),
    { idOperasi: ID, timId: 't1', materialId: 'm1', daya: '2A', merk: 'Schneider', statusMcb: 'Baru', jumlah: 3, alasan: 'tim bubar' });
  const k = { materialId: 'm1', daya: '2A', merk: 'S', statusMcb: 'Baru', lokasi: 'GUDANG', jumlahBaru: '0', alasan: 'hitung ulang' };
  assert.deepEqual(dataKoreksi(k, ID), { idOperasi: ID, lokasi: 'GUDANG', materialId: 'm1', daya: '2A', merk: 'S', statusMcb: 'Baru', jumlahBaru: 0, alasan: 'hitung ulang' });
  assert.equal(galat(() => dataKoreksi({ ...k, jumlahBaru: '-1' }, ID)), 'DI_LUAR_RENTANG');
  assert.equal(galat(() => dataKoreksi({ ...k, alasan: '' }, ID)), 'ALASAN_WAJIB');
  assert.equal(galat(() => dataKoreksi({ ...k, lokasi: '' }, ID)), 'FIELD_WAJIB');
});

test('cara penyelesaian selisih mengikuti arah; label terbaca', () => {
  assert.deepEqual(pilihanCara('KURANG'), ['HILANG', 'SUSULAN', 'SALAH_HITUNG']);
  assert.deepEqual(pilihanCara('LEBIH'), ['TAMBAHAN_MASUK', 'SALAH_CATAT', 'SALAH_HITUNG']);
  assert.deepEqual(pilihanCara('lain'), []);
  assert.equal(labelCara('SALAH_HITUNG'), 'Petugas salah hitung (dikembalikan)');
  assert.equal(labelCara('TIDAK_ADA'), 'TIDAK_ADA');
});

test('teks selisih dan penanda stok tanpa izin', () => {
  assert.equal(teksSelisih({ arah: 'KURANG', daya: '2A', merk: 'Schneider', statusMcb: 'Baru', jumlahPerkiraan: 2, jumlahInput: 1, selisih: -1 }),
    'Kurang 1: 2A Schneider Baru (perkiraan 2, dihitung 1)');
  assert.equal(teksSelisih({ arah: 'LEBIH', daya: '6A', merk: 'Hager', statusMcb: 'Ex-Handal', jumlahPerkiraan: 0, jumlahInput: 2, selisih: 2 }),
    'Lebih 2: 6A Hager Ex-Handal (perkiraan 0, dihitung 2)');
  assert.equal(adaStokTanpaIzin({ tanpaIzin: [{ jumlah: 1 }] }), true);
  assert.equal(adaStokTanpaIzin({ tanpaIzin: [] }), false);
  assert.equal(adaStokTanpaIzin({}), false);
});

test('daya: angka diberi satuan A di tampilan; isian hanya angka', async () => {
  const { teksDaya, hanyaAngka } = await import('../src/gudang.js');
  assert.equal(teksDaya('2'), '2A');
  assert.equal(teksDaya(' 10 '), '10A');
  assert.equal(teksDaya('2A'), '2A');
  assert.equal(hanyaAngka('2A5x'), '25');
  assert.equal(hanyaAngka(''), '');
  assert.equal(ringkasJenis([{ daya: '4', merk: 'Hager', statusMcb: 'Baru', jumlah: 2 }]), '2 × 4A Hager Baru');
});
