import assert from 'node:assert/strict';
import test from 'node:test';

import { GalatApi } from '../src/api.js';
import {
  aksiP0, bacaBobot, bolehUbahP0, cocokP0, daftarPekerjaan, dataPutuskan, dataUbahJenis, galatAlasan, hitungJumlah,
  muatFoto, namaTampil, pilihBerikutnya, tautanPeta, teksMenit,
} from '../src/approvalP0.js';

const P = (o) => ({ p0Id: 'id', kodeP0: 'P0-01', namaPekerjaan: 'Ganti Fuse', pekerjaanLainnya: '', lainLain: false, penyulang: 'Toboali 1',
  section: '', daerah: 'Rias', tim: 'YANDAL 01', petugas: 'Budi', status: 'Menunggu', sistem: false, revision: 3, ...o });

test('akses ubah: ADMIN/SUPER dengan aksi UBAH di menu P0; ADMIN_ES / LIHAT tidak', () => {
  const s = (role, aksi) => ({ profil: { role }, menu: [{ kode: 'OPS_VERIFIKASI_P0', aksi }] });
  assert.equal(bolehUbahP0(s('ADMIN', 'UBAH')), true);
  assert.equal(bolehUbahP0(s('SUPER', 'UBAH')), true);
  assert.equal(bolehUbahP0(s('ADMIN', 'LIHAT')), false);
  assert.equal(bolehUbahP0(s('ADMIN_ES', 'UBAH')), false);
  assert.equal(bolehUbahP0({ profil: { role: 'ADMIN' }, menu: [] }), false);
});

test('tampilan: nama Lain - Lain + isian, cari di kode/nama/lokasi/tim/petugas, jumlah per status', () => {
  assert.equal(namaTampil(P({ namaPekerjaan: 'Lain - Lain', lainLain: true, pekerjaanLainnya: 'Pasang papan' })), 'Lain - Lain · Pasang papan');
  assert.equal(cocokP0(P(), 'rias'), true);
  assert.equal(cocokP0(P(), 'BUDI'), true);
  assert.equal(cocokP0(P(), 'tebang'), false);
  assert.deepEqual(hitungJumlah([P(), P({ status: 'Approved' }), P({ status: 'Approved' })]), { Menunggu: 1, Approved: 2, Rejected: 0 });
});

test('aksi per status: Menunggu setujui+tolak, Approved hanya tolak, Rejected setujui ulang, sistem/tanpa akses tidak ada', () => {
  assert.deepEqual(aksiP0(P(), true), { setujui: true, tolak: true, ubahJenis: true, labelSetujui: 'Setujui' });
  assert.equal(aksiP0(P({ status: 'Approved' }), true).setujui, false);
  assert.deepEqual(aksiP0(P({ status: 'Rejected' }), true), { setujui: true, tolak: false, ubahJenis: true, labelSetujui: 'Setujui ulang' });
  for (const a of [aksiP0(P({ status: 'Rejected', sistem: true }), true), aksiP0(P(), false)]) {
    assert.deepEqual([a.setujui, a.tolak, a.ubahJenis], [false, false, false]);
  }
});

test('pilih berikutnya setelah keputusan: berikutnya di tab, ujung = sebelumnya, tab kosong = null', () => {
  const lama = ['a', 'b', 'c'].map((p0Id) => ({ p0Id }));
  assert.equal(pilihBerikutnya(lama, [{ p0Id: 'a' }, { p0Id: 'c' }], 'b'), 'c');
  assert.equal(pilihBerikutnya(lama, [{ p0Id: 'a' }, { p0Id: 'b' }], 'c'), 'b');
  assert.equal(pilihBerikutnya(lama, [], 'a'), null);
  assert.equal(pilihBerikutnya(lama, lama, 'b'), 'b'); // masih di tab (mis. koreksi jenis)
});

test('master jenis: YANDAL aktif urut, Lain - Lain sekali di akhir', () => {
  const m = [
    { modul: 'YANDAL', nama: 'Ganti Fuse', urutan: 2, aktif: true }, { modul: 'yandal', nama: 'Pengecekan Gardu', urutan: 1, aktif: true },
    { modul: 'YANDAL', nama: 'lain -  lain', urutan: 0, aktif: true }, { modul: 'ROW', nama: 'Rabas', urutan: 1, aktif: true },
    { modul: 'YANDAL', nama: 'Lama', urutan: 3, aktif: false },
  ];
  assert.deepEqual(daftarPekerjaan(m), ['Pengecekan Gardu', 'Ganti Fuse', 'Lain - Lain']);
});

test('isian: bobot 0-100 maks 2 desimal, alasan wajib/300 huruf/5 baris', () => {
  assert.equal(bacaBobot('12,5'), 12.5);
  assert.equal(bacaBobot('100'), 100);
  for (const s of ['', '101', '-1', '1,234', 'x']) assert.equal(bacaBobot(s), null, s);
  assert.equal(galatAlasan('  '), 'Alasan wajib diisi.');
  assert.equal(galatAlasan('x'.repeat(301)), 'Maks 300 huruf.');
  assert.equal(galatAlasan('1\n2\n3\n4\n5\n6'), 'Maks 5 baris.');
  assert.equal(galatAlasan('Foto buram'), '');
});

test('payload: keputusan + revision, alasan/bobot hanya kalau ada; koreksi jenis lainnya hanya untuk Lain - Lain', () => {
  assert.deepEqual(dataPutuskan(P(), 'Approved'), { p0Id: 'id', keputusan: 'Approved', revision: 3 });
  assert.deepEqual(dataPutuskan(P(), 'Rejected', { alasan: ' Foto buram ' }), { p0Id: 'id', keputusan: 'Rejected', revision: 3, alasan: 'Foto buram' });
  assert.deepEqual(dataPutuskan(P(), 'Approved', { bobot: 0 }), { p0Id: 'id', keputusan: 'Approved', revision: 3, bobot: 0 });
  assert.deepEqual(dataUbahJenis(P(), { nama: 'Ganti Fuse', lainnya: 'abaikan', alasan: ' salah pilih ' }),
    { p0Id: 'id', namaPekerjaan: 'Ganti Fuse', alasan: 'salah pilih', revision: 3 });
  assert.deepEqual(dataUbahJenis(P(), { nama: 'Lain - Lain', lainnya: 'Pasang papan', alasan: 'x', bobot: 5 }),
    { p0Id: 'id', namaPekerjaan: 'Lain - Lain', alasan: 'x', revision: 3, pekerjaanLainnya: 'Pasang papan', bobot: 5 });
});

test('format: durasi, tautan peta', () => {
  assert.equal(teksMenit(45), '45 menit');
  assert.equal(teksMenit(75), '1 jam 15 menit');
  assert.equal(teksMenit(120), '2 jam');
  assert.equal(teksMenit(0.5), '30 detik');
  assert.equal(teksMenit(null), '-');
  assert.equal(tautanPeta('-3.0123, 106.4567'), 'https://www.google.com/maps?q=-3.0123,106.4567');
  assert.equal(tautanPeta('bukan'), '');
});

test('foto: data URL, sekali per foto+ukuran, PENUH memakai batas waktu panjang, gagal tidak disimpan', async () => {
  const log = [];
  let gagal = true;
  const api = async (action, data, opsi) => {
    log.push({ action, data, opsi });
    if (data.slot === 'SESUDAH' && gagal) { gagal = false; throw new GalatApi('JARINGAN'); }
    return { ok: true, data: { mime: 'image/jpeg', data: 'QUJD' } };
  };
  const f = { p0Id: 'p1', jenis: 'GARDU', id: 'g1', slot: 'BEBAN_R' };
  assert.equal(await muatFoto(api, f), 'data:image/jpeg;base64,QUJD');
  await muatFoto(api, f);
  assert.equal(log.length, 1);
  assert.deepEqual(log[0].data, { p0Id: 'p1', jenis: 'GARDU', slot: 'BEBAN_R', ukuran: 'KECIL', id: 'g1' });
  await muatFoto(api, f, 'PENUH');
  assert.equal(log[1].opsi.batasMs, 90000);
  const s = { p0Id: 'p1', jenis: 'P0', slot: 'SESUDAH' };
  await assert.rejects(muatFoto(api, s));
  assert.equal(await muatFoto(api, s), 'data:image/jpeg;base64,QUJD');
});
