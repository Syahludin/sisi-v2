/** C4A: antrean + sinkron file UIW (permintaan Master Guswan 15 Nov 2026). Spec: docs/superpowers/specs/2026-11-14-c4a-sinkron-uiw-design.md */
const test = require('node:test');
const assert = require('node:assert');
const { j } = require('./gudangUji');
const { duniaC4A, HARI_INI } = require('./duniaC4A');

/** Laporan PNY-A terbuka (aaaa0001) + 1 temuan jt-1 (bbbb0001) ber-foto F1. */
function duniaAntre() {
  const x = duniaC4A();
  const a = x.buka({ c4aId: 'aaaa0001' });
  x.temuan(a.c4aId, { uniqueid: 'bbbb0001', deskripsi: 'Isolator pecah' });
  x.ubah('db_temuan_inspeksi', 0, { foto_temuan_file_id: 'F1' });
  x.ctx = () => x.h.bacaKonteksUiw_();
  x.ent = (jenis, kunci, c4aId) => ({ jenis, kunci, c4a_id: c4aId || 'aaaa0001' });
  return x;
}

/* ===== Task 5: pemetaan baris + pemeriksaan per baris ===== */

test('section awal UIW: teks sebelum " - " pertama, tanpa " - " = utuh, di-trim', () => {
  const x = duniaC4A();
  assert.strictEqual(x.h.sectionAwalUiw_('ACR Palas - LBS Delas'), 'ACR Palas');
  assert.strictEqual(x.h.sectionAwalUiw_('ACR A - LBS B - Ujung'), 'ACR A');
  assert.strictEqual(x.h.sectionAwalUiw_('GH Toboali'), 'GH Toboali');
  assert.strictEqual(x.h.sectionAwalUiw_('  ACR Palas  -  LBS  '), 'ACR Palas');
  assert.strictEqual(x.h.sectionAwalUiw_('ACR-Palas'), 'ACR-Palas', 'tanda hubung tanpa spasi bukan pemisah');
});

test('barisUiw Inspeksi: InspeksiID = c4a_id, UP3 dari UIW_UP3, Section awal, Petugas = nama db_Users', () => {
  const x = duniaAntre();
  const b = j(x.h.barisUiw_(x.ent('INSPEKSI', 'aaaa0001'), x.ctx()));
  assert.deepStrictEqual(b, { ok: true, sheet: 'Inspeksi', foto: [],
    nilai: { InspeksiID: 'aaaa0001', Tanggal: HARI_INI, UP3: 'UP3 BANGKA', ULP: b.nilai.ULP, Penyulang: 'PNY-A', Section: 'ACR Palas', Petugas: 'Admin Utama' } });
  assert.deepStrictEqual(j(x.h.UIW_KOLOM_.Inspeksi), ['InspeksiID', 'Tanggal', 'UP3', 'ULP', 'Penyulang', 'Section', 'Petugas']);
  assert.deepStrictEqual(j(x.h.UIW_KOLOM_['KMS']), ['Id', 'UP3', 'ULP', 'Penyulang', 'Section', 'Panjang']);
});

test('barisUiw Temuan: kategori/temuan teks dari uiw_*, Lokasi "lat, lng", Open; WO SELESAI = Close + tindak lanjut gabungan + data akhir TL terakhir', () => {
  const x = duniaAntre();
  let b = j(x.h.barisUiw_(x.ent('TEMUAN', 'bbbb0001'), x.ctx()));
  assert.strictEqual(b.ok, true);
  assert.strictEqual(b.sheet, 'Temuan');
  const n = b.nilai;
  assert.deepStrictEqual([n['Temuan ID'], n['Inspeksi ID'], n.Kategori, n['Temuan Awal'], n['Lokasi Awal'], n['Keterangan Awal'], n.Status, n['Tindak Lanjut'], n['Foto Akhir']],
    ['bbbb0001', 'aaaa0001', 'Komponen', 'Isolator Tumpu', '-3.015, 106.505', 'Isolator retak', 'Open', '', '']);
  assert.match(n['Foto Awal'], /^Temuan_Images\/bbbb0001\.Foto Awal\.\d{6}\.jpg$/);
  assert.deepStrictEqual(b.foto.map((f) => [f.slot, f.fileId]), [['AWAL', 'F1']]);
  // WO selesai: dua baris tindak lanjut, data akhir dari yang terakhir
  x.ubah('db_temuan_inspeksi', 0, { status_wo: 'SELESAI', waktu_selesai: '2026-11-16T03:00:00.000Z', keterangan_tindak_lanjut: 'Perlu Padam' });
  const tid = x.baris('db_temuan_inspeksi')[0].temuan_id;
  x.tambah('db_temuan_tindak_lanjut', { temuan_id: tid, pekerjaan: 'Ganti isolator', koordinat: '-3.1, 106.6', lat: -3.1, lng: 106.6, catatan: 'awal', foto_sesudah_file_id: 'S1', timestamp: '2026-11-16T01:00:00.000Z' });
  x.tambah('db_temuan_tindak_lanjut', { temuan_id: tid, pekerjaan: 'Rabas', koordinat: '-3.2, 106.7', lat: -3.2, lng: 106.7, catatan: 'beres', foto_sesudah_file_id: 'S2', timestamp: '2026-11-16T02:00:00.000Z' });
  b = j(x.h.barisUiw_(x.ent('TEMUAN', 'bbbb0001'), x.ctx()));
  assert.deepStrictEqual([b.nilai.Status, b.nilai['Tindak Lanjut'], b.nilai['Lokasi Akhir'], b.nilai['Keterangan Akhir'], b.nilai['Tanggal Selesai']],
    ['Close', 'Perlu Padam', '-3.2, 106.7', 'beres', '2026-11-16']);
  assert.match(b.nilai['Foto Akhir'], /^Temuan_Images\/bbbb0001\.Foto Akhir\.\d{6}\.jpg$/);
  assert.deepStrictEqual(b.foto.map((f) => [f.slot, f.fileId]), [['AWAL', 'F1'], ['AKHIR', 'S2']]);
});

test('barisUiw Temuan: pekerjaan terakhir tanpa foto sesudah = foto / lokasi / keterangan akhir dari pekerjaan terakhir yang berfoto', () => {
  const x = duniaAntre();
  x.ubah('db_temuan_inspeksi', 0, { status_wo: 'SELESAI', waktu_selesai: '2026-11-16T03:00:00.000Z' });
  const tid = x.baris('db_temuan_inspeksi')[0].temuan_id;
  x.tambah('db_temuan_tindak_lanjut', { temuan_id: tid, pekerjaan: 'Ganti isolator', lat: -3.1, lng: 106.6, catatan: 'tuntas', foto_sesudah_file_id: 'S1', timestamp: '2026-11-16T01:00:00.000Z' });
  x.tambah('db_temuan_tindak_lanjut', { temuan_id: tid, pekerjaan: 'Rabas', lat: -3.2, lng: 106.7, catatan: 'tanpa foto', timestamp: '2026-11-16T02:00:00.000Z' });
  const b = j(x.h.barisUiw_(x.ent('TEMUAN', 'bbbb0001'), x.ctx()));
  assert.deepStrictEqual([b.nilai['Lokasi Akhir'], b.nilai['Keterangan Akhir']], ['-3.1, 106.6', 'tuntas']);
  assert.deepStrictEqual(b.foto.map((f) => [f.slot, f.fileId]), [['AWAL', 'F1'], ['AKHIR', 'S1']]);
});

test('barisUiw Temuan: Keterangan Awal = jenis temuan saja; Keterangan Akhir = catatan, kosong = "<tim> - Perbaikan <jenis temuan>"', () => {
  const x = duniaC4A();
  const a = x.buka({ c4aId: 'aaaa0001' });
  x.temuan(a.c4aId, { uniqueid: 'bbbb0002', nomorTiang: 'TB-123' });
  x.ubah('db_temuan_inspeksi', 0, { foto_temuan_file_id: 'F1' });
  const ent = { jenis: 'TEMUAN', kunci: 'bbbb0002', c4a_id: 'aaaa0001' };
  const sidik1 = x.h.sidikSumberUiw_(ent, x.h.bacaKonteksUiw_());
  assert.strictEqual(j(x.h.barisUiw_(ent, x.h.bacaKonteksUiw_())).nilai['Keterangan Awal'], 'Isolator retak');
  x.ubah('db_temuan_inspeksi', 0, { jenis_temuan: 'Isolator pecah' });
  assert.notStrictEqual(x.h.sidikSumberUiw_(ent, x.h.bacaKonteksUiw_()), sidik1, 'jenis temuan berubah = kirim ulang');
  x.ubah('db_temuan_inspeksi', 0, { status_wo: 'SELESAI', waktu_selesai: '2026-11-16T03:00:00.000Z' });
  const tid = x.baris('db_temuan_inspeksi')[0].temuan_id;
  x.tambah('db_temuan_tindak_lanjut', { temuan_id: tid, pekerjaan: 'Ganti isolator', tim: 'ROW 01', lat: -3.1, lng: 106.6, catatan: '', timestamp: '2026-11-16T01:00:00.000Z' });
  assert.strictEqual(j(x.h.barisUiw_(ent, x.h.bacaKonteksUiw_())).nilai['Keterangan Akhir'], 'ROW 01 - Perbaikan Isolator pecah');
});

test('barisUiw: jenis tanpa peta UIW = PERLU_DATA dengan bantu persis; setelah uiw_* diisi = ok (Review Focus 3)', () => {
  const x = duniaAntre();
  x.temuan('aaaa0001', { uniqueid: 'bbbb0002', jenisTemuanId: 'jt-3' });
  x.ubah('db_temuan_inspeksi', 1, { foto_temuan_file_id: 'F2' });
  assert.deepStrictEqual(j(x.h.barisUiw_(x.ent('TEMUAN', 'bbbb0002'), x.ctx())),
    { ok: false, status: 'PERLU_DATA', bantu: 'kategori UIW belum dipetakan untuk "Bentang kendur"' });
  x.sheets.m.db_Jenis_Temuan.data[3].splice(-3, 3, 'A1', 'Komponen', 'Konduktor');
  assert.strictEqual(x.h.barisUiw_(x.ent('TEMUAN', 'bbbb0002'), x.ctx()).ok, true);
});

test('barisUiw: foto belum terunggah = MENUNGGU (lewat 24 jam = kirim tanpa foto); file foto hilang = PERLU_DATA', () => {
  const x = duniaAntre();
  x.ubah('db_temuan_inspeksi', 0, { foto_temuan_file_id: '' });
  assert.deepStrictEqual(j(x.h.barisUiw_(x.ent('TEMUAN', 'bbbb0001'), x.ctx())), { ok: false, status: 'MENUNGGU', bantu: 'foto belum terunggah' });
  x.jam.ms += 25 * 3600e3;
  const b = j(x.h.barisUiw_(x.ent('TEMUAN', 'bbbb0001'), x.ctx()));
  assert.deepStrictEqual([b.ok, b.nilai['Foto Awal'], b.foto.length], [true, '', 0]);
  x.ubah('db_temuan_inspeksi', 0, { foto_temuan_file_id: 'F1' });
  x.drive.hilang.add('F1');
  assert.deepStrictEqual(j(x.h.barisUiw_(x.ent('TEMUAN', 'bbbb0001'), x.ctx())), { ok: false, status: 'PERLU_DATA', bantu: 'foto asli hilang' });
});

test('barisUiw: kolom wajib kosong = PERLU_DATA "kolom <nama> kosong"', () => {
  const x = duniaAntre();
  x.ubah('db_temuan_inspeksi', 0, { lat: '', lng: '', koordinat: '' });
  assert.deepStrictEqual(j(x.h.barisUiw_(x.ent('TEMUAN', 'bbbb0001'), x.ctx())), { ok: false, status: 'PERLU_DATA', bantu: 'kolom Lokasi Awal kosong' });
  x.sheets.m.db_Users.data[1][2] = '';
  assert.deepStrictEqual(j(x.h.barisUiw_(x.ent('INSPEKSI', 'aaaa0001'), x.ctx())), { ok: false, status: 'PERLU_DATA', bantu: 'kolom Petugas kosong' });
});

test('barisUiw KMS: jarak belum dihitung = MENUNGGU; sesudah dihitung Id = c4a_id, Panjang = jarak_km', () => {
  const x = duniaAntre();
  assert.deepStrictEqual(j(x.h.barisUiw_(x.ent('KMS', 'aaaa0001'), x.ctx())), { ok: false, status: 'MENUNGGU', bantu: 'jarak belum dihitung' });
  x.tutup('aaaa0001');
  x.ubah('c4a_laporan', 0, { jarak_km: 1.234, metode_jarak: 'RUTE_JALAN', status_jarak: 'SELESAI' });
  const b = j(x.h.barisUiw_(x.ent('KMS', 'aaaa0001'), x.ctx()));
  assert.deepStrictEqual([b.sheet, b.nilai.Id, b.nilai.Section, b.nilai.Panjang], ['KMS', 'aaaa0001', 'ACR Palas', 1.234]);
});

test('segarkan antrean: laporan + temuan C4A masuk ANTRE, perubahan sumber mengembalikan TERKIRIM ke ANTRE, sumber hilang = HAPUS, temuan tanpa c4a_id diabaikan', () => {
  const x = duniaAntre();
  x.h.simpanTemuanInspeksi_(x.admin, { penyulang: 'PNY-B', section: 'GH Toboali', jenisTemuanId: 'jt-1' });
  const an = () => x.baris('uiw_antrean').map((r) => [r.jenis, r.kunci, r.status]);
  assert.deepStrictEqual(j(x.h.segarkanAntreanUiw_(x.ctx())), { antre: 3, hapus: 0 });
  assert.deepStrictEqual(an(), [['INSPEKSI', 'aaaa0001', 'ANTRE'], ['KMS', 'aaaa0001', 'ANTRE'], ['TEMUAN', 'bbbb0001', 'ANTRE']]);
  assert.deepStrictEqual(j(x.h.segarkanAntreanUiw_(x.ctx())), { antre: 0, hapus: 0 }, 'tanpa perubahan = tidak ada yang baru');
  // anggap semua sudah terkirim dengan sidik sumber sekarang
  const ctx = x.ctx();
  x.baris('uiw_antrean').forEach((r, i) => x.ubah('uiw_antrean', i, { status: 'TERKIRIM', sidik: x.h.sidikSumberUiw_(r, ctx) }));
  assert.deepStrictEqual(j(x.h.segarkanAntreanUiw_(x.ctx())), { antre: 0, hapus: 0 });
  x.ubah('db_temuan_inspeksi', 0, { status_wo: 'SELESAI' });
  assert.deepStrictEqual(j(x.h.segarkanAntreanUiw_(x.ctx())), { antre: 1, hapus: 0 });
  assert.strictEqual(an()[2][2], 'ANTRE');
  // temuan dihapus manual dari sheet
  x.sheets.t.db_temuan_inspeksi.data.splice(1, 1);
  assert.deepStrictEqual(j(x.h.segarkanAntreanUiw_(x.ctx())), { antre: 0, hapus: 1 });
  assert.strictEqual(an()[2][2], 'HAPUS');
});

test('jeda gagal: percobaan 1 = 5 menit, 2 = 15 menit, 3+ = 60 menit', () => {
  const x = duniaC4A();
  assert.deepStrictEqual([1, 2, 3, 9].map((n) => x.h.jedaGagalUiw_(n)), [300000, 900000, 3600000, 3600000]);
});

module.exports = { duniaAntre };
