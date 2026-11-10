const test = require('node:test');
const assert = require('node:assert');
const { buatKonteks } = require('./harness');
const { sheetPalsu, kodeError, j } = require('./gudangUji');

const PROPS = { ENV: 'staging', MASTER_SHEET_ID: 'm', AUTH_SHEET_ID: 'a', KODE_ULP: '16130', ADMIN_EMAIL: 'x@y.z' };

function dunia() {
  const g = buatKonteks(PROPS);
  const buat = sheetPalsu([]);
  const sk = g.skemaHeader_();
  const sheets = {
    m: { db_Jaringan: buat('db_Jaringan', [sk.MASTER_SHEET_ID.db_Jaringan.slice(), ['s1', 'TOBOALI 1', 'PMT TOBOALI 1', '', 20, true, 1, '', ''], ['s2', 'TOBOALI 1', 'LBS AIR BARA', 's1', 40, true, 1, '', ''],
      ['s3', 'PAYUNG', 'PMT PAYUNG', '', 20, true, 1, '', '']]) },
    a: { log_Audit: buat('log_Audit', [['waktu', 'user_id', 'username', 'role', 'aksi', 'target', 'detail', 'platform', 'device_id']]) },
  };
  g.SpreadsheetApp = { openById: (id) => ({ getSheetByName: (n) => (sheets[id] || {})[n], insertSheet: (n) => { sheets[id][n] = buat(n, [[]]); return sheets[id][n]; } }) };
  const admin = { userId: 'u-admin', username: '16130.admin', role: 'ADMIN' };
  const H = sk.MASTER_SHEET_ID.db_Jaringan;
  const baris = () => sheets.m.db_Jaringan.data.slice(1).map((b) => Object.fromEntries(H.map((h, i) => [h, b[i]])));
  return { g, admin, baris, simpan: (o) => j(g.simpanSection_(admin, o, 'WEB')).section };
}

test('jaringan: hanya ADMIN / SUPER', () => {
  const x = dunia();
  for (const s of [{ userId: 'p', role: 'PETUGAS' }, { userId: 'e', role: 'ADMIN_ES' }, null]) {
    for (const f of ['getJaringan_', 'simpanSection_', 'setAktifPenyulang_']) assert.strictEqual(kodeError(() => x.g[f](s, {}, 'WEB')), 'AKSES_DITOLAK', f);
  }
});

test('jaringan: section baru (penyulang baru / lama), urutan otomatis, nama unik, induk tanpa putaran, ubah dengan revision, master diperbarui', () => {
  const x = dunia();
  const a = x.simpan({ penyulang: 'toboali 1', section: 'GH Payung' });
  assert.deepStrictEqual([a.penyulang, a.urutan, a.aktif, a.revision], ['TOBOALI 1', 60, true, 1], 'ejaan penyulang lama diikuti, urutan = terbesar + 20');
  assert.match(a.sectionId, /^[0-9a-f-]{36}$/i);
  const b = x.simpan({ penyulang: 'KEPOH', section: 'PMT KEPOH' });
  assert.deepStrictEqual([b.penyulang, b.urutan], ['KEPOH', 20], 'penyulang baru = section pertama');
  assert.strictEqual(kodeError(() => x.simpan({ penyulang: 'TOBOALI 1', section: 'lbs air bara' })), 'NAMA_GANDA');
  assert.strictEqual(kodeError(() => x.simpan({ penyulang: 'PAYUNG', section: 'X', parentSectionId: 's1' })), 'DATA_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.simpan({ penyulang: 'PAYUNG', section: 'X', parentSectionId: 'zzz' })), 'HULU_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.simpan({ sectionId: 's1', revision: 1, penyulang: 'TOBOALI 1', section: 'PMT TOBOALI 1', parentSectionId: 's2' })), 'HULU_TIDAK_VALID', 'putaran');
  assert.strictEqual(kodeError(() => x.simpan({ sectionId: 's1', penyulang: 'TOBOALI 1', section: 'X' })), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => x.simpan({ sectionId: 's1', revision: 9, penyulang: 'TOBOALI 1', section: 'X' })), 'KONFLIK_REVISION');
  const c = x.simpan({ sectionId: 's2', revision: 1, penyulang: 'TOBOALI 1', section: 'LBS AIR BARA 2', parentSectionId: 's1', aktif: false });
  assert.deepStrictEqual([c.section, c.aktif, c.revision, c.urutan], ['LBS AIR BARA 2', false, 2, 40]);
  assert.ok(x.g.PropertiesService.getScriptProperties().getProperty('MASTER_REVISI'));
  const daftar = j(x.g.getJaringan_(x.admin, {}));
  assert.strictEqual(daftar.section.length, 5, 'nonaktif ikut tampil');
});

test('jaringan: aktif / nonaktif penyulang = semua section-nya sekaligus', () => {
  const x = dunia();
  assert.deepStrictEqual(j(x.g.setAktifPenyulang_(x.admin, { penyulang: 'TOBOALI 1', aktif: false }, 'WEB')), { penyulang: 'TOBOALI 1', aktif: false, jumlah: 2 });
  assert.deepStrictEqual(x.baris().map((r) => r.aktif), [false, false, true]);
  assert.strictEqual(j(x.g.setAktifPenyulang_(x.admin, { penyulang: 'TOBOALI 1', aktif: false }, 'WEB')).jumlah, 0, 'ulang = tidak ada perubahan');
  assert.strictEqual(j(x.g.setAktifPenyulang_(x.admin, { penyulang: 'TOBOALI 1', aktif: true }, 'WEB')).jumlah, 2);
  assert.strictEqual(kodeError(() => x.g.setAktifPenyulang_(x.admin, { penyulang: 'ASING', aktif: true }, 'WEB')), 'PENYULANG_TIDAK_DIKENAL');
});
