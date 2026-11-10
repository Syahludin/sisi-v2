const test = require('node:test');
const assert = require('node:assert');
const { U, j, kodeError, A, banyak, duniaPakai } = require('./gudangUji');

// ---------- Tugas 7: admin, selisih, koreksi pemakaian, pembatalan ----------
const C6 = { daya: '6A', merk: 'Hager', statusMcb: 'Baru' };
const kunci = (x, o) => [x.mat.mcb, o.daya, o.merk, o.statusMcb].join('|');
const sel = (x, cara, id, o = {}) => x.g.selesaikanSelisih_(x.admin, { selisihId: id, cara, catatan: 'dicek admin', ...o }, 'WEB');
const kolS = (x, b, k) => x.kol('db_Stok_Selisih', b, k);

/** Pemeriksaan awal dengan hitungan [items]; hasilnya selisih. Perkiraan tim: 2 x A. */
function duniaSelisih(items) {
  const x = duniaPakai({ periksa: false });
  x.h = j(x.periksa(items));
  x.idSel = (arah) => x.h.selisih.find((s) => s.arah === arah).selisihId;
  return x;
}

test('gudang selisih: HILANG pada KURANG menyamakan saldo (mutasi HILANG), pemeriksaan DISETUJUI', () => {
  const x = duniaSelisih(banyak(A, 1));
  const r = j(sel(x, 'HILANG', x.idSel('KURANG')));
  assert.strictEqual(r.pemeriksaanStatus, 'DISETUJUI');
  assert.deepStrictEqual(x.saldo(x.tim.y13), { [kunci(x, A)]: 1 }, 'saldo tim = hitungan petugas');
  const m = x.baris('db_Material_Mutasi').pop();
  assert.deepStrictEqual(['jenis_mutasi', 'lokasi', 'jumlah'].map((k) => x.kol('db_Material_Mutasi', m, k)), ['HILANG', x.tim.y13, -1]);
  const s = x.baris('db_Stok_Selisih')[0];
  assert.deepStrictEqual(['status', 'cara_penyelesaian', 'catatan_admin', 'diselesaikan_oleh'].map((k) => kolS(x, s, k)), ['SELESAI', 'HILANG', 'dicek admin', x.user.admin]);
  assert.strictEqual(j(x.g.getStokYandal_(x.p13, {})).bolehPakai, true, 'sesudah disetujui stok yang ada langsung dapat digunakan');
});

test('gudang selisih: TAMBAHAN_MASUK pada LEBIH menambah saldo; SALAH_CATAT pada LEBIH tanpa mutasi', () => {
  const x = duniaSelisih([...banyak(A, 2), ...banyak(C6, 2)]);
  const lebih = x.idSel('LEBIH');
  sel(x, 'TAMBAHAN_MASUK', lebih);
  assert.deepStrictEqual(x.saldo(x.tim.y13), { [kunci(x, A)]: 2, [kunci(x, C6)]: 2 });
  const y = duniaSelisih([...banyak(A, 2), ...banyak(C6, 1)]);
  const n = y.baris('db_Material_Mutasi').length;
  const r = j(sel(y, 'SALAH_CATAT', y.idSel('LEBIH')));
  assert.strictEqual(y.baris('db_Material_Mutasi').length, n, 'tanpa mutasi');
  assert.strictEqual(r.pemeriksaanStatus, 'DISETUJUI');
  assert.deepStrictEqual(y.saldo(y.tim.y13), { [kunci(y, A)]: 2 });
});

test('gudang selisih: cara yang tidak cocok dengan arah ditolak dan tidak menulis apa pun', () => {
  const x = duniaSelisih([...banyak(A, 1), ...banyak(C6, 1)]);
  const n = x.baris('db_Material_Mutasi').length;
  assert.strictEqual(kodeError(() => sel(x, 'SALAH_CATAT', x.idSel('KURANG'))), 'SELISIH_TIDAK_VALID');
  assert.strictEqual(kodeError(() => sel(x, 'HILANG', x.idSel('LEBIH'))), 'SELISIH_TIDAK_VALID');
  assert.strictEqual(kodeError(() => sel(x, 'TAMBAHAN_MASUK', x.idSel('KURANG'))), 'SELISIH_TIDAK_VALID');
  assert.strictEqual(kodeError(() => sel(x, 'SUSULAN', x.idSel('LEBIH'), { nomorMeter: '1', keperluan: 'k' })), 'SELISIH_TIDAK_VALID');
  assert.strictEqual(kodeError(() => sel(x, 'HILANG', x.idSel('KURANG'), { catatan: ' ' })), 'ALASAN_WAJIB');
  assert.strictEqual(kodeError(() => sel(x, 'NGAWUR', x.idSel('KURANG'))), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => sel(x, 'HILANG', U())), 'SELISIH_TIDAK_DITEMUKAN');
  assert.strictEqual(x.baris('db_Material_Mutasi').length, n);
});

test('gudang selisih: selisih yang sudah SELESAI tidak bisa diselesaikan lagi; pemeriksaan DISETUJUI hanya bila semua selesai', () => {
  const x = duniaSelisih([...banyak(A, 1), ...banyak(C6, 1)]);
  const r1 = j(sel(x, 'HILANG', x.idSel('KURANG')));
  assert.strictEqual(r1.pemeriksaanStatus, 'MENUNGGU_ADMIN', 'masih ada selisih LEBIH');
  assert.strictEqual(kodeError(() => sel(x, 'HILANG', x.idSel('KURANG'))), 'SELISIH_TIDAK_VALID');
  const r2 = j(sel(x, 'TAMBAHAN_MASUK', x.idSel('LEBIH')));
  assert.strictEqual(r2.pemeriksaanStatus, 'DISETUJUI');
});

test('gudang selisih: SALAH_HITUNG mengembalikan pemeriksaan, menutup semua selisihnya, petugas boleh menghitung ulang', () => {
  const x = duniaSelisih([...banyak(A, 1), ...banyak(C6, 1)]);
  const n = x.baris('db_Material_Mutasi').length;
  const r = j(sel(x, 'SALAH_HITUNG', x.idSel('KURANG')));
  assert.strictEqual(r.pemeriksaanStatus, 'DIKEMBALIKAN');
  assert.strictEqual(x.baris('db_Material_Mutasi').length, n, 'tanpa mutasi');
  assert.deepStrictEqual(x.baris('db_Stok_Selisih').map((s) => [kolS(x, s, 'status'), kolS(x, s, 'cara_penyelesaian')]), [['SELESAI', 'SALAH_HITUNG'], ['SELESAI', 'SALAH_HITUNG']]);
  const ulang = j(x.periksa(banyak(A, 2)));
  assert.strictEqual(ulang.status, 'COCOK');
  assert.strictEqual(j(x.g.getStokYandal_(x.p13, {})).bolehPakai, true);
});

test('gudang selisih: admin mengisi SUSULAN atas nama shift sebelumnya, satu MCB per panggilan', () => {
  const x = duniaSelisih([]);
  const id = x.idSel('KURANG');
  const a = j(sel(x, 'SUSULAN', id, { nomorMeter: '145000001', keperluan: 'diisi admin' }));
  assert.strictEqual(a.selisih.status, 'MENUNGGU');
  const b = j(sel(x, 'SUSULAN', id, { nomorMeter: '145000002', keperluan: 'diisi admin' }));
  assert.strictEqual(b.selisih.status, 'SELESAI');
  assert.strictEqual(b.pemeriksaanStatus, 'DISETUJUI');
  const p = x.baris('db_Pemakaian_MCB');
  assert.deepStrictEqual(p.map((r) => [x.kol('db_Pemakaian_MCB', r, 'jenis_catatan'), x.kol('db_Pemakaian_MCB', r, 'diisi_oleh'), x.kol('db_Pemakaian_MCB', r, 'nomor_pemakaian')]),
    [['SUSULAN', x.user.admin, 'Y13-SHF3-MCB.001'], ['SUSULAN', x.user.admin, 'Y13-SHF3-MCB.002']]);
  assert.strictEqual(kodeError(() => sel(duniaSelisih([]), 'SUSULAN', duniaSelisih([]).idSel('KURANG'))), 'FIELD_WAJIB', 'nomorMeter dan keperluan wajib');
});

test('gudang pemakaian admin: koreksi mengubah isi, menaikkan revision, menandai DIKOREKSI, menulis LogKoreksi', () => {
  const x = duniaPakai();
  const id = j(x.pakai()).pemakaianId;
  const kor = (o) => x.g.koreksiPemakaian_(x.admin, { pemakaianId: id, revision: 1, alasan: 'salah ketik meter', ...o }, 'WEB');
  const r = j(kor({ nomorMeter: '14599998888' }));
  assert.strictEqual(r.revision, 2);
  const b = x.baris('db_Pemakaian_MCB')[0];
  assert.deepStrictEqual(['nomor_meter', 'jenis_catatan', 'revision', 'diubah_oleh'].map((k) => x.kol('db_Pemakaian_MCB', b, k)), ['14599998888', 'DIKOREKSI', 2, x.user.admin]);
  const l = x.baris('db_Material_LogKoreksi');
  assert.deepStrictEqual(l.map((r2) => ['jenis_objek', 'objek_id', 'kolom', 'nilai_lama', 'nilai_baru', 'alasan'].map((k) => x.kol('db_Material_LogKoreksi', r2, k))),
    [['PEMAKAIAN', id, 'nomor_meter', '14512345678', '14599998888', 'salah ketik meter']]);
  assert.strictEqual(kodeError(() => kor({ keperluan: 'x' })), 'DATA_BERUBAH', 'revision lama ditolak');
  assert.strictEqual(kodeError(() => kor({ revision: 2, alasan: '' })), 'ALASAN_WAJIB');
  assert.strictEqual(j(kor({ revision: 2, nomorMeter: '14599998888' })).tanpaPerubahan, true);
});

test('gudang pemakaian admin: koreksi jenis MCB memindahkan stok; jenis baru bersaldo nol ditolak tanpa menulis', () => {
  const x = duniaPakai();
  x.tambah(3, { ...C6 }); x.kirim(x.tim.y13, 1, { ...C6 });
  const id = j(x.pakai()).pemakaianId;
  assert.deepStrictEqual(x.saldo(x.tim.y13), { [kunci(x, A)]: 1, [kunci(x, C6)]: 1 });
  const n = x.baris('db_Material_Mutasi').length;
  assert.strictEqual(kodeError(() => x.g.koreksiPemakaian_(x.admin, { pemakaianId: id, revision: 1, daya: '10A', alasan: 'salah jenis' }, 'WEB')), 'STOK_TIDAK_CUKUP');
  assert.strictEqual(x.baris('db_Material_Mutasi').length, n);
  x.g.koreksiPemakaian_(x.admin, { pemakaianId: id, revision: 1, daya: '6A', merk: 'Hager', alasan: 'salah jenis' }, 'WEB');
  assert.deepStrictEqual(x.saldo(x.tim.y13), { [kunci(x, A)]: 2 }, 'A kembali +1, C6 dipakai');
  const kolom = x.baris('db_Material_LogKoreksi').map((r) => x.kol('db_Material_LogKoreksi', r, 'kolom')).sort();
  assert.deepStrictEqual(kolom, ['daya', 'merk_mcb']);
});

test('gudang pemakaian admin: batalkan mengembalikan MCB ke tim, tandai BATAL, tidak bisa dikoreksi / dibatalkan lagi', () => {
  const x = duniaPakai();
  const id = j(x.pakai()).pemakaianId;
  assert.deepStrictEqual(Object.values(x.saldo(x.tim.y13)), [1]);
  x.g.batalkanPemakaian_(x.admin, { pemakaianId: id, revision: 1, alasan: 'salah input' }, 'WEB');
  assert.deepStrictEqual(Object.values(x.saldo(x.tim.y13)), [2]);
  assert.strictEqual(x.kol('db_Pemakaian_MCB', x.baris('db_Pemakaian_MCB')[0], 'jenis_catatan'), 'BATAL');
  assert.strictEqual(kodeError(() => x.g.batalkanPemakaian_(x.admin, { pemakaianId: id, revision: 2, alasan: 'lagi' }, 'WEB')), 'PEMAKAIAN_BATAL');
  assert.strictEqual(kodeError(() => x.g.koreksiPemakaian_(x.admin, { pemakaianId: id, revision: 2, nomorMeter: '1', alasan: 'x' }, 'WEB')), 'PEMAKAIAN_BATAL');
  assert.strictEqual(j(x.pakai()).nomorPemakaian, 'Y13-SHF1-MCB.002', 'nomor yang dibatalkan tidak dipakai ulang');
});

test('gudang pemakaian admin: getSelisihGudang dan getPemakaianGudang; petugas ditolak di semua endpoint', () => {
  const x = duniaSelisih([...banyak(A, 1), ...banyak(C6, 1)]);
  const m = j(x.g.getSelisihGudang_(x.admin, { status: 'MENUNGGU' }));
  assert.strictEqual(m.selisih.length, 2);
  assert.ok(['arah', 'caraPenyelesaian', 'daya', 'jumlahInput', 'timNama', 'tanggal', 'shift'].every((k) => k in m.selisih[0]));
  assert.strictEqual(m.selisih[0].timId, x.tim.y13);
  assert.strictEqual(j(x.g.getSelisihGudang_(x.admin, { status: 'SELESAI' })).selisih.length, 0);
  x.susulan({ selisihId: x.idSel('KURANG') });
  const s = j(x.g.getSelisihGudang_(x.admin, {}));
  assert.strictEqual(s.susulan.length, 1);
  assert.strictEqual(s.susulan[0].jenisCatatan, 'SUSULAN');
  const p = j(x.g.getPemakaianGudang_(x.admin, { dari: '2026-11-01', sampai: '2026-11-03' }));
  assert.strictEqual(p.pemakaian.length, 1);
  assert.strictEqual(j(x.g.getPemakaianGudang_(x.admin, { dari: '2026-11-03', sampai: '2026-11-03' })).pemakaian.length, 0, 'filter tanggal');
  assert.strictEqual(kodeError(() => x.g.getPemakaianGudang_(x.admin, { dari: '2026-11-03' })), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => x.g.getPemakaianGudang_(x.admin, { dari: '2026-11-03', sampai: '2026-11-01' })), 'RENTANG_TIDAK_VALID');
  ['getSelisihGudang_', 'selesaikanSelisih_', 'getPemakaianGudang_', 'koreksiPemakaian_', 'batalkanPemakaian_'].forEach((f) => {
    assert.strictEqual(kodeError(() => x.g[f](x.p13, {}, 'MOBILE')), 'AKSES_DITOLAK', f);
  });
});
