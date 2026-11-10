const test = require('node:test');
const assert = require('node:assert');
const { U, j, kodeError, dunia, kJenis } = require('./gudangUji');

// ---------- Tugas 4: admin stok (tambah, kirim, tarik, koreksi, lihat) ----------
test('gudang admin: tambahStokGudang menulis MASUK_GUDANG; idOperasi sama tidak menggandakan', () => {
  const x = dunia();
  const id = U();
  x.g.tambahStokGudang_(x.admin, { idOperasi: id, ...x.is(), jumlah: 10, catatan: 'dari PLN' }, 'WEB');
  const r = x.g.tambahStokGudang_(x.admin, { idOperasi: id, ...x.is(), jumlah: 10 }, 'WEB');
  assert.strictEqual(r.duplikat, true);
  assert.deepStrictEqual(x.saldo('GUDANG'), { [kJenis(x)]: 10 });
  const b = x.baris('db_Material_Mutasi')[0];
  assert.deepStrictEqual(['jenis_mutasi', 'lokasi', 'jumlah', 'catatan', 'waktu', 'dibuat_oleh', 'No'].map((k) => x.kol('db_Material_Mutasi', b, k)),
    ['MASUK_GUDANG', 'GUDANG', 10, 'dari PLN', '2026-11-03 08:30:00', x.user.admin, 1]);
});

test('gudang admin: kirimStokTim memindahkan dua baris atomik (gudang minus, tim plus)', () => {
  const x = dunia();
  x.tambah(10);
  x.kirim(x.tim.y13, 4);
  assert.deepStrictEqual(x.saldo('GUDANG'), { [kJenis(x)]: 6 });
  assert.deepStrictEqual(x.saldo(x.tim.y13), { [kJenis(x)]: 4 });
  const m = x.baris('db_Material_Mutasi').slice(1);
  assert.deepStrictEqual(m.map((b) => x.kol('db_Material_Mutasi', b, 'jenis_mutasi')), ['KIRIM_TIM', 'KIRIM_TIM']);
  assert.strictEqual(x.kol('db_Material_Mutasi', m[0], 'ref_id'), x.kol('db_Material_Mutasi', m[1], 'ref_id'), 'dua baris satu operasi');
});

test('gudang admin: kirim ditolak bila saldo gudang kurang, tim tanpa izin, atau tim nonaktif; tidak ada yang tertulis', () => {
  const x = dunia();
  x.tambah(2);
  const n = x.baris('db_Material_Mutasi').length;
  const kirim = (o) => kodeError(() => x.kirim(o.timId || x.tim.y13, o.jumlah || 3));
  assert.strictEqual(kirim({}), 'STOK_TIDAK_CUKUP');
  assert.strictEqual(kirim({ jumlah: 1, timId: x.tim.hartek }), 'MATERIAL_TIDAK_DIIZINKAN');
  assert.strictEqual(kirim({ jumlah: 1, timId: x.tim.mati }), 'DATA_TIDAK_DITEMUKAN');
  assert.strictEqual(x.baris('db_Material_Mutasi').length, n);
});

test('gudang admin: tarikStokTim tim ke gudang; ditolak bila melebihi saldo tim; alasan wajib; boleh untuk stok tanpa izin', () => {
  const x = dunia();
  x.tambah(5);
  x.kirim(x.tim.y13, 5);
  const tarik = (o) => kodeError(() => x.g.tarikStokTim_(x.admin, { idOperasi: U(), timId: x.tim.y13, ...x.is(), jumlah: 2, alasan: 'tim dibubarkan', ...o }, 'WEB'));
  assert.strictEqual(tarik({ jumlah: 6 }), 'STOK_TIDAK_CUKUP');
  assert.strictEqual(tarik({ alasan: '  ' }), 'ALASAN_WAJIB');
  assert.strictEqual(tarik({}), null);
  assert.deepStrictEqual(x.saldo(x.tim.y13), { [kJenis(x)]: 3 });
  assert.deepStrictEqual(x.saldo('GUDANG'), { [kJenis(x)]: 2 });
  x.g.simpanIzinMaterial_(x.admin, { materialId: x.mat.mcb, timIds: [x.tim.y14] }, 'WEB');
  assert.strictEqual(tarik({ jumlah: 3 }), null, 'stok tanpa izin tetap bisa ditarik');
  assert.deepStrictEqual(x.saldo(x.tim.y13), {});
});

test('gudang admin: koreksiStok menulis mutasi selisih + LogKoreksi, alasan wajib, jumlah sama = tanpa perubahan', () => {
  const x = dunia();
  x.tambah(10);
  const kor = (o) => x.g.koreksiStok_(x.admin, { idOperasi: U(), lokasi: 'GUDANG', ...x.is(), jumlahBaru: 7, alasan: 'hitung ulang gudang', ...o }, 'WEB');
  assert.strictEqual(kodeError(() => kor({ alasan: '' })), 'ALASAN_WAJIB');
  kor({});
  assert.deepStrictEqual(x.saldo('GUDANG'), { [kJenis(x)]: 7 });
  const m = x.baris('db_Material_Mutasi').pop();
  assert.deepStrictEqual(['jenis_mutasi', 'jumlah'].map((k) => x.kol('db_Material_Mutasi', m, k)), ['KOREKSI_GUDANG', -3]);
  const l = x.baris('db_Material_LogKoreksi')[0];
  assert.deepStrictEqual(['jenis_objek', 'kolom', 'nilai_lama', 'nilai_baru', 'alasan', 'oleh'].map((k) => x.kol('db_Material_LogKoreksi', l, k)),
    ['STOK', 'jumlah', 10, 7, 'hitung ulang gudang', x.user.admin]);
  assert.strictEqual(kor({ jumlahBaru: 7 }).tanpaPerubahan, true);
  assert.strictEqual(x.baris('db_Material_Mutasi').length, 2);
  x.kirim(x.tim.y14, 2);
  kor({ lokasi: x.tim.y14, jumlahBaru: 0 });
  assert.deepStrictEqual(x.saldo(x.tim.y14), {});
  assert.strictEqual(x.kol('db_Material_Mutasi', x.baris('db_Material_Mutasi').pop(), 'jenis_mutasi'), 'KOREKSI_TIM');
});

test('gudang admin: validasi jumlah, status MCB, field asing; petugas tidak bisa memanggil endpoint admin', () => {
  const x = dunia();
  const t = (o) => kodeError(() => x.g.tambahStokGudang_(x.admin, { idOperasi: U(), ...x.is(), jumlah: 1, ...o }, 'WEB'));
  assert.strictEqual(t({ jumlah: 0 }), 'DI_LUAR_RENTANG');
  assert.strictEqual(t({ jumlah: 1.5 }), 'HARUS_BULAT');
  assert.strictEqual(t({ jumlah: -2 }), 'DI_LUAR_RENTANG');
  assert.strictEqual(t({ statusMcb: 'Bekas' }), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(t({ materialId: x.mat.kabel }), null, 'material aktif apa pun boleh masuk gudang');
  assert.strictEqual(t({ materialId: U() }), 'MATERIAL_TIDAK_VALID');
  assert.strictEqual(t({ asing: 1 }), 'FIELD_TIDAK_DIKENAL');
  assert.strictEqual(t({ idOperasi: undefined }), 'FIELD_WAJIB');
  ['tambahStokGudang_', 'kirimStokTim_', 'tarikStokTim_', 'koreksiStok_', 'getGudangStok_'].forEach((f) => {
    assert.strictEqual(kodeError(() => x.g[f](x.p13, {}, 'MOBILE')), 'AKSES_DITOLAK', f);
  });
});

test('gudang admin: foto opsional disimpan ke Drive gudang dan linknya masuk mutasi', () => {
  const x = dunia();
  x.g.tambahStokGudang_(x.admin, { idOperasi: U(), ...x.is(), jumlah: 3, foto: x.fotoUji() }, 'WEB');
  const m = x.baris('db_Material_Mutasi')[0];
  assert.strictEqual(x.kol('db_Material_Mutasi', m, 'link_foto'), 'https://drive.google.com/file/d/f1/view');
  assert.strictEqual(x.drive[0].akar, 'folder');
  assert.strictEqual(kodeError(() => x.g.tambahStokGudang_(x.admin, { idOperasi: U(), ...x.is(), jumlah: 3, foto: { data: 'x' } }, 'WEB')), 'FIELD_WAJIB');
});

test('gudang admin: getGudangStok memuat saldo gudang, saldo tim (dengan / tanpa izin), dan riwayat terbaru', () => {
  const x = dunia();
  x.tambah(10);
  x.kirim(x.tim.y13, 4);
  let h = j(x.g.getGudangStok_(x.admin, {}));
  assert.deepStrictEqual(h.gudang, [{ materialId: x.mat.mcb, daya: '2A', merk: 'Schneider', statusMcb: 'Baru', jumlah: 6 }]);
  const t13 = h.tim.find((t) => t.timId === x.tim.y13);
  assert.deepStrictEqual([t13.stok.length, t13.stok[0].jumlah, t13.tanpaIzin.length], [1, 4, 0]);
  assert.strictEqual(h.mutasi[0].jenisMutasi, 'KIRIM_TIM');
  x.g.simpanIzinMaterial_(x.admin, { materialId: x.mat.mcb, timIds: [x.tim.y14] }, 'WEB');
  h = j(x.g.getGudangStok_(x.admin, {}));
  const baru13 = h.tim.find((t) => t.timId === x.tim.y13);
  assert.deepStrictEqual([baru13.stok.length, baru13.tanpaIzin.length, baru13.tanpaIzin[0].jumlah], [0, 1, 4]);
  assert.strictEqual(j(x.g.getGudangStok_(x.admin, { timId: x.tim.y14 })).mutasi.length, 0, 'filter tim');
});
