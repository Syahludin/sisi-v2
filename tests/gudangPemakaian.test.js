const test = require('node:test');
const assert = require('node:assert');
const { U, j, kodeError } = require('./gudangUji');

// ---------- Tugas 6: Yandal, pemakaian dan pemakaian susulan ----------
const { A, banyak, duniaPakai } = require('./gudangUji');
const kolP = (x, b, k) => x.kol('db_Pemakaian_MCB', b, k);

test('gudang pemakaian: baris pelaporan + mutasi PAKAI; nomor MCB.001 lalu .002; saldo berkurang', () => {
  const x = duniaPakai();
  const a = j(x.pakai());
  assert.strictEqual(a.nomorPemakaian, 'Y13-SHF1-MCB.001');
  assert.strictEqual(j(x.pakai({ nomorMeter: '14599999999' })).nomorPemakaian, 'Y13-SHF1-MCB.002');
  const b = x.baris('db_Pemakaian_MCB')[0];
  assert.deepStrictEqual(['No', 'tanggal', 'shift', 'tim_id', 'nomor_meter', 'daya', 'merk_mcb', 'keperluan', 'status_mcb', 'jenis_catatan', 'diisi_oleh', 'petugas_id', 'revision', 'link_foto'].map((k) => kolP(x, b, k)),
    [1, '2026-11-03', 1, x.tim.y13, '14512345678', '2A', 'Schneider', 'Ganti MCB rusak', 'Baru', 'NORMAL', x.user.p13, x.crewBaru.join(','), 1, 'https://drive.google.com/file/d/f2/view']);
  assert.deepStrictEqual(x.saldo(x.tim.y13), {});
  const m = x.baris('db_Material_Mutasi').filter((r) => x.kol('db_Material_Mutasi', r, 'jenis_mutasi') === 'PAKAI');
  assert.deepStrictEqual(m.map((r) => [x.kol('db_Material_Mutasi', r, 'lokasi'), x.kol('db_Material_Mutasi', r, 'jumlah'), x.kol('db_Material_Mutasi', r, 'ref_jenis')]),
    [[x.tim.y13, -1, 'PEMAKAIAN'], [x.tim.y13, -1, 'PEMAKAIAN']]);
});

test('gudang pemakaian: kirim ulang pemakaianId sama = hasil yang ada, tanpa baris atau mutasi kedua', () => {
  const x = duniaPakai();
  const id = U();
  const a = j(x.pakai({ pemakaianId: id }));
  const b = j(x.pakai({ pemakaianId: id }));
  assert.strictEqual(b.duplikat, true);
  assert.strictEqual(b.nomorPemakaian, a.nomorPemakaian);
  assert.strictEqual(x.baris('db_Pemakaian_MCB').length, 1);
  assert.deepStrictEqual(x.saldo(x.tim.y13), { [Object.keys(x.saldo(x.tim.y13))[0]]: 1 });
});

test('gudang pemakaian: ditolak sebelum pemeriksaan, saat selisih menunggu, dan tanpa shift berjalan', () => {
  const x = duniaPakai({ periksa: false });
  assert.strictEqual(kodeError(() => x.pakai()), 'PEMERIKSAAN_BELUM_ADA');
  x.periksa(banyak(A, 1));
  assert.strictEqual(kodeError(() => x.pakai()), 'SELISIH_MENUNGGU');
  assert.strictEqual(x.baris('db_Pemakaian_MCB').length, 0);
  const y = duniaPakai();
  y.sheets.y.yan_Shift.data.splice(1, 1);
  assert.strictEqual(kodeError(() => y.pakai()), 'SHIFT_BELUM_DIMULAI');
});

test('gudang pemakaian: saldo nol atau habis ditolak STOK_TIDAK_CUKUP; jenis lain yang tidak ada ditolak', () => {
  const x = duniaPakai();
  x.pakai(); x.pakai();
  assert.strictEqual(kodeError(() => x.pakai()), 'STOK_TIDAK_CUKUP');
  const y = duniaPakai();
  assert.strictEqual(kodeError(() => y.pakai({ daya: '10A' })), 'STOK_TIDAK_CUKUP');
  assert.strictEqual(y.baris('db_Pemakaian_MCB').length, 0);
});

test('gudang pemakaian: izin dicabut = MATERIAL_TIDAK_DIIZINKAN; foto wajib; field dan peran dijaga', () => {
  const x = duniaPakai();
  assert.strictEqual(kodeError(() => x.pakai({ foto: undefined })), 'FOTO_WAJIB');
  assert.strictEqual(kodeError(() => x.pakai({ nomorMeter: '' })), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => x.pakai({ keperluan: 'k'.repeat(201) })), 'TERLALU_PANJANG');
  assert.strictEqual(kodeError(() => x.pakai({ statusMcb: 'Bekas' })), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.pakai({ timId: x.tim.y14 })), 'FIELD_TIDAK_DIKENAL');
  assert.strictEqual(kodeError(() => x.pakai({}, x.hartek)), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.pakai({}, x.admin)), 'AKSES_DITOLAK');
  x.g.simpanIzinMaterial_(x.admin, { materialId: x.mat.mcb, timIds: [x.tim.y14] }, 'WEB');
  assert.strictEqual(kodeError(() => x.pakai()), 'MATERIAL_TIDAK_DIIZINKAN');
  assert.strictEqual(x.baris('db_Pemakaian_MCB').length, 0);
});

test('gudang susulan: menutup selisih KURANG atas nama shift dan petugas sebelumnya, tanpa menunggu admin', () => {
  const x = duniaPakai({ periksa: false });
  const h = j(x.periksa(banyak(A, 1)));
  assert.strictEqual(h.status, 'MENUNGGU_ADMIN');
  const r = j(x.susulan({ selisihId: h.selisih[0].selisihId }));
  assert.strictEqual(r.nomorPemakaian, 'Y13-SHF3-MCB.001');
  const b = x.baris('db_Pemakaian_MCB')[0];
  assert.deepStrictEqual(['tanggal', 'shift', 'jenis_catatan', 'diisi_oleh', 'petugas_id', 'nomor_pemakaian', 'link_foto'].map((k) => kolP(x, b, k)),
    ['2026-11-02', 3, 'SUSULAN', x.user.p13, x.crewLama.join(','), 'Y13-SHF3-MCB.001', '']);
  assert.strictEqual(r.selisih.status, 'SELESAI');
  assert.strictEqual(r.selisih.caraPenyelesaian, 'SUSULAN');
  assert.strictEqual(r.pemeriksaanStatus, 'DISETUJUI');
  const s = x.baris('db_Stok_Selisih')[0];
  assert.deepStrictEqual(['jumlah_perkiraan', 'jumlah_input', 'selisih', 'pemakaian_id', 'diselesaikan_oleh'].map((k) => x.kol('db_Stok_Selisih', s, k)),
    [1, 1, 0, r.pemakaianId, x.user.p13]);
  assert.strictEqual(j(x.g.getStokYandal_(x.p13, {})).bolehPakai, true, 'petugas langsung boleh lanjut');
  assert.deepStrictEqual(Object.values(x.saldo(x.tim.y13)), [1]);
});

test('gudang susulan: kurang dua = dua susulan; satu susulan baru mengurangi selisih, pemeriksaan tetap menunggu', () => {
  const x = duniaPakai({ periksa: false });
  const h = j(x.periksa([]));
  const id = h.selisih[0].selisihId;
  const a = j(x.susulan({ selisihId: id }));
  assert.deepStrictEqual([a.selisih.status, a.selisih.selisih, a.selisih.jumlahPerkiraan, a.pemeriksaanStatus], ['MENUNGGU', -1, 1, 'MENUNGGU_ADMIN']);
  assert.strictEqual(j(x.g.getStokYandal_(x.p13, {})).bolehPakai, false);
  const b = j(x.susulan({ selisihId: id, nomorMeter: '14500000002' }));
  assert.deepStrictEqual([b.selisih.status, b.pemeriksaanStatus, b.nomorPemakaian], ['SELESAI', 'DISETUJUI', 'Y13-SHF3-MCB.002']);
});

test('gudang susulan: tanpa yan_Shift sebelumnya ditolak; kirim ulang id sama aman; hanya selisih KURANG milik tim sendiri', () => {
  const x = duniaPakai({ periksa: false });
  const h = j(x.periksa(banyak(A, 1)));
  const id = h.selisih[0].selisihId;
  const idPakai = U();
  x.susulan({ selisihId: id, pemakaianId: idPakai });
  assert.strictEqual(j(x.susulan({ selisihId: id, pemakaianId: idPakai })).duplikat, true);
  assert.strictEqual(x.baris('db_Pemakaian_MCB').length, 1);
  assert.strictEqual(kodeError(() => x.susulan({ selisihId: id })), 'SELISIH_TIDAK_VALID', 'sudah SELESAI');
  assert.strictEqual(kodeError(() => x.susulan({ selisihId: U() })), 'SELISIH_TIDAK_DITEMUKAN');

  const y = duniaPakai({ periksa: false });
  y.sheets.y.yan_Shift.data.splice(2, 1);
  const hy = j(y.periksa(banyak(A, 1)));
  assert.strictEqual(kodeError(() => y.susulan({ selisihId: hy.selisih[0].selisihId })), 'SHIFT_SEBELUMNYA_TIDAK_ADA');

  const z = duniaPakai({ periksa: false });
  const hz = j(z.periksa([...banyak(A, 2), { daya: '6A', merk: 'Hager', statusMcb: 'Baru' }]));
  const lebih = hz.selisih.find((s) => s.arah === 'LEBIH');
  assert.strictEqual(kodeError(() => z.susulan({ selisihId: lebih.selisihId })), 'SELISIH_TIDAK_VALID', 'LEBIH tidak bisa disusulkan');
  z.tambah(3); z.kirim(z.tim.y14, 1);
  const hh = j(z.g.simpanPemeriksaanStok_(z.p14, { item: [], foto: z.fotoUji() }, 'MOBILE'));
  assert.strictEqual(kodeError(() => z.susulan({ selisihId: hh.selisih[0].selisihId })), 'BUKAN_MILIK_TIM');
});
