const test = require('node:test');
const assert = require('node:assert');
const { U, j, kodeError, dunia, kJenis } = require('./gudangUji');

// ---------- Tugas 5: Yandal, status stok dan pemeriksaan awal shift ----------
const A = { daya: '2A', merk: 'Schneider', statusMcb: 'Baru' };
const B = { daya: '4A', merk: 'Schneider', statusMcb: 'Ex-Handal' };
const C = { daya: '6A', merk: 'Hager', statusMcb: 'Baru' };
const banyak = (jenis, n) => Array.from({ length: n }, () => ({ ...jenis }));

/** Dunia dengan gudang berisi MCB dan tim Yandal 13 sudah dikirimi: 2 x A + 1 x B. */
function duniaYandal() {
  const x = dunia();
  x.tambah(10); x.tambah(5, { ...B });
  x.kirim(x.tim.y13, 2); x.kirim(x.tim.y13, 1, { ...B });
  x.periksa = (items, o = {}) => x.g.simpanPemeriksaanStok_(o.sesi || x.p13, { item: items, foto: x.fotoUji(), ...(o.tambahan || {}) }, 'MOBILE');
  return x;
}

test('gudang pemeriksaan: hitungan sama dengan perkiraan = COCOK, item tercatat, bolehPakai true', () => {
  const x = duniaYandal();
  const h = j(x.periksa([...banyak(A, 2), ...banyak(B, 1)]));
  assert.strictEqual(h.status, 'COCOK');
  assert.deepStrictEqual(h.selisih, []);
  const p = x.baris('db_Stok_Pemeriksaan');
  assert.strictEqual(p.length, 1);
  assert.deepStrictEqual(['tanggal', 'tim_id', 'shift', 'petugas_id', 'total_input', 'total_perkiraan', 'status', 'No', 'revision'].map((k) => x.kol('db_Stok_Pemeriksaan', p[0], k)),
    ['2026-11-03', x.tim.y13, 1, x.user.p13, 3, 3, 'COCOK', 1, 1]);
  assert.strictEqual(x.kol('db_Stok_Pemeriksaan', p[0], 'link_foto_stok'), 'https://drive.google.com/file/d/f1/view');
  assert.strictEqual(x.baris('db_Stok_Pemeriksaan_Item').length, 2);
  assert.strictEqual(x.baris('db_Stok_Selisih').length, 0);
  assert.strictEqual(j(x.g.getStokYandal_(x.p13, {})).bolehPakai, true);
});

test('gudang pemeriksaan: kurang dan lebih sekaligus = MENUNGGU_ADMIN, satu baris selisih per jenis yang beda', () => {
  const x = duniaYandal();
  const h = j(x.periksa([...banyak(A, 1), ...banyak(B, 1), ...banyak(C, 1)]));
  assert.strictEqual(h.status, 'MENUNGGU_ADMIN');
  const s = h.selisih.sort((a, b) => a.daya.localeCompare(b.daya));
  assert.deepStrictEqual(s.map((r) => [r.daya, r.arah, r.jumlahPerkiraan, r.jumlahInput, r.selisih, r.status]),
    [['2A', 'KURANG', 2, 1, -1, 'MENUNGGU'], ['6A', 'LEBIH', 0, 1, 1, 'MENUNGGU']]);
  assert.strictEqual(x.baris('db_Stok_Selisih').length, 2);
  const g = j(x.g.getStokYandal_(x.p13, {}));
  assert.strictEqual(g.bolehPakai, false);
  assert.strictEqual(g.pemeriksaan.status, 'MENUNGGU_ADMIN');
  assert.strictEqual(g.pemeriksaan.selisih.length, 2);
});

test('gudang pemeriksaan: tim tanpa mutasi apa pun: semua jenis LEBIH; jenis perkiraan yang tidak diinput = KURANG', () => {
  const x = dunia();
  const h = j(x.g.simpanPemeriksaanStok_(x.p14, { item: banyak(A, 2), foto: x.fotoUji() }, 'MOBILE'));
  assert.deepStrictEqual(h.selisih.map((r) => [r.arah, r.selisih]), [['LEBIH', 2]]);
  const y = duniaYandal();
  const k = j(y.periksa([]));
  assert.deepStrictEqual(k.selisih.map((r) => [r.daya, r.arah, r.selisih]).sort(), [['2A', 'KURANG', -2], ['4A', 'KURANG', -1]].sort());
});

test('gudang pemeriksaan: kirim ulang dan petugas lain di tim yang sama tidak menggandakan baris', () => {
  const x = duniaYandal();
  const a = j(x.periksa(banyak(A, 2).concat(banyak(B, 1))));
  const rekan = { ...x.p13, userId: U(), username: '16130.y13b' };
  const b = j(x.periksa([], { sesi: rekan }));
  assert.strictEqual(b.pemeriksaanId, a.pemeriksaanId, 'hasil pemeriksaan pertama dikembalikan, isian kedua diabaikan');
  assert.strictEqual(b.status, 'COCOK');
  assert.strictEqual(x.baris('db_Stok_Pemeriksaan').length, 1);
  assert.strictEqual(x.baris('db_Stok_Pemeriksaan_Item').length, 2);
  assert.strictEqual(x.drive.length, 1, 'foto kedua tidak diunggah');
});

test('gudang pemeriksaan: shift dihitung dari jam server (peralihan 07:59 -> 08:00)', () => {
  const x = duniaYandal();
  x.jam.ms = Date.parse('2026-11-03T07:59:00+07:00');
  x.periksa([...banyak(A, 2), ...banyak(B, 1)]);
  assert.deepStrictEqual(['tanggal', 'shift'].map((k) => x.kol('db_Stok_Pemeriksaan', x.baris('db_Stok_Pemeriksaan')[0], k)), ['2026-11-02', 3]);
  x.jam.ms = Date.parse('2026-11-03T08:00:00+07:00');
  x.periksa([...banyak(A, 2), ...banyak(B, 1)]);
  assert.deepStrictEqual(['tanggal', 'shift'].map((k) => x.kol('db_Stok_Pemeriksaan', x.baris('db_Stok_Pemeriksaan')[1], k)), ['2026-11-03', 1]);
});

test('gudang pemeriksaan: dikembalikan admin = pemeriksaan baru boleh dikirim (baris lama tetap sebagai riwayat)', () => {
  const x = duniaYandal();
  const a = j(x.periksa(banyak(A, 1)));
  const baris = x.sheets.g.db_Stok_Pemeriksaan.data[1];
  baris[x.sk.GUDANG_SHEET_ID.db_Stok_Pemeriksaan.indexOf('status')] = 'DIKEMBALIKAN';
  const b = j(x.periksa([...banyak(A, 2), ...banyak(B, 1)]));
  assert.notStrictEqual(b.pemeriksaanId, a.pemeriksaanId);
  assert.strictEqual(b.status, 'COCOK');
  assert.strictEqual(x.baris('db_Stok_Pemeriksaan').length, 2);
  assert.strictEqual(j(x.g.getStokYandal_(x.p13, {})).pemeriksaan.pemeriksaanId, b.pemeriksaanId, 'yang terakhir berlaku');
});

test('gudang pemeriksaan: guard peran, foto wajib, field asing, MCB tanpa izin, batas isian', () => {
  const x = duniaYandal();
  assert.strictEqual(kodeError(() => x.periksa([], { sesi: x.hartek })), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.periksa([], { sesi: x.admin })), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.g.getStokYandal_(x.admin, {})), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.g.simpanPemeriksaanStok_(x.p13, { item: [] }, 'MOBILE')), 'FOTO_WAJIB');
  assert.strictEqual(kodeError(() => x.periksa([], { tambahan: { timId: x.tim.y14 } })), 'FIELD_TIDAK_DIKENAL', 'tim diambil dari sesi, bukan input');
  assert.strictEqual(kodeError(() => x.g.simpanPemeriksaanStok_(x.p13, { foto: x.fotoUji() }, 'MOBILE')), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => x.periksa([{ ...A, statusMcb: 'Bekas' }])), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.periksa(banyak(A, 501))), 'TERLALU_BANYAK');
  assert.strictEqual(kodeError(() => x.periksa('bukan array')), 'TIPE_SALAH');
  assert.strictEqual(x.baris('db_Stok_Pemeriksaan').length, 0, 'tidak ada yang tertulis');
  const tanpaIzin = dunia({ izin: false });
  assert.strictEqual(kodeError(() => tanpaIzin.g.simpanPemeriksaanStok_(tanpaIzin.p13, { item: [], foto: tanpaIzin.fotoUji() }, 'MOBILE')), 'MATERIAL_TIDAK_DIIZINKAN');
});

test('gudang pemeriksaan: getStokYandal sebelum pemeriksaan = pemeriksaan null, saldo tim dan pilihan material', () => {
  const x = duniaYandal();
  const g = j(x.g.getStokYandal_(x.p13, {}));
  assert.deepStrictEqual([g.shift.tanggal, g.shift.no, g.pemeriksaan, g.bolehPakai], ['2026-11-03', 1, null, false]);
  assert.deepStrictEqual(g.saldo.map((s) => [s.daya, s.jumlah]).sort(), [['2A', 2], ['4A', 1]]);
  assert.deepStrictEqual(g.pilihan.material.map((m) => m.nama), ['MCB']);
  assert.deepStrictEqual(g.jenisTersedia.length, 2);
  assert.strictEqual(kJenis(x).startsWith(x.mat.mcb), true);
});
