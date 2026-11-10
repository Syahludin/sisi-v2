// Langkah 0 optimasi kecepatan (6 Nov 2026): ukur lama tiap permintaan doPost / rpc (backend/src/08_Ukur.js).
const test = require('node:test');
const assert = require('node:assert');
const { buatKonteks } = require('./harness');

const PROPS = { ENV: 'staging', MASTER_SHEET_ID: 'm', AUTH_SHEET_ID: 'a', KODE_ULP: '16130', ADMIN_EMAIL: 'x@y.z' };
const JAM = 36e5;

/** Konteks baru + cache yang bisa diperiksa (getAll ada, seperti Apps Script). */
function siapkan() {
  const g = buatKonteks(PROPS);
  const isi = new Map();
  g.CacheService = {
    getScriptCache: () => ({
      get: (k) => (isi.has(k) ? isi.get(k) : null),
      getAll: (ks) => ks.reduce((o, k) => { if (isi.has(k)) o[k] = isi.get(k); return o; }, {}),
      put: (k, v) => { isi.set(k, v); },
      remove: (k) => isi.delete(k),
      removeAll: (ks) => ks.forEach((k) => isi.delete(k)),
      putAll: (o) => Object.keys(o).forEach((k) => isi.set(k, o[k])),
    }),
  };
  const sheets = {};
  const lembar = () => {
    const data = [];
    return {
      data,
      getLastRow: () => data.length,
      getLastColumn: () => (data[0] ? data[0].length : 0),
      getRange: (r, c, nr, nc) => ({
        getValues: () => data.slice(r - 1, r - 1 + nr).map((b) => b.slice(c - 1, c - 1 + nc)),
        setValues: (v) => v.forEach((b, i) => { data[r - 1 + i] = b.slice(); }),
      }),
    };
  };
  const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = lembar()) };
  g.SpreadsheetApp = { openById: () => ss };
  return { g, isi, sheets };
}

/** Baris log_Ukur sebagai objek header -> nilai. */
function barisLog(sheets) {
  const d = sheets.log_Ukur.data, h = d[0];
  return d.slice(1).map((b) => Object.fromEntries(h.map((k, i) => [k, b[i]])));
}

test('ukur: jam WIB (UTC+7) sebagai yyyyMMddHH', () => {
  const { g } = siapkan();
  assert.strictEqual(g.jamUkur_(Date.parse('2026-11-06T17:30:00Z')), '2026110700');
  assert.strictEqual(g.jamUkur_(Date.parse('2026-11-06T02:59:59Z')), '2026110609');
});

test('ukur: catat beberapa permintaan lalu pindah ke log_Ukur (jumlah, rata, maks, cache, gagal, kode)', () => {
  const { g, sheets } = siapkan();
  const t = Date.now();
  g.catatUkur_('getWoAdmin', 'WEB', t - 3000, { ok: true }, 2048);
  g.catatUkur_('getWoAdmin', 'WEB', t - 1000, { ok: true, cache: true }, 1024);
  g.catatUkur_('getWoAdmin', 'WEB', t - 5000, { ok: false, kode: 'SERVER_SIBUK' }, 100);
  g.catatUkur_('getWoAdmin', 'MOBILE', t - 200, { ok: true }, 10);
  const h = g.pindahUkur_(t + JAM);
  assert.deepStrictEqual([...h.jam], [g.jamUkur_(t)]);
  const rows = barisLog(sheets);
  const web = rows.find((r) => r.Aksi === 'getWoAdmin' && r.Platform === 'WEB');
  assert.strictEqual(web.Jumlah, 3);
  assert.ok(web['Rata (ms)'] >= 3000 && web['Rata (ms)'] < 3100, 'rata ' + web['Rata (ms)']);
  assert.ok(web['Maks (ms)'] >= 5000 && web['Maks (ms)'] < 5100);
  assert.strictEqual(web['Dari Cache'], 1);
  assert.strictEqual(web.Gagal, 1);
  assert.strictEqual(web['Kode Gagal'], 'SERVER_SIBUK x1');
  assert.strictEqual(web['Maks (KB)'], 2);
  assert.strictEqual(rows.find((r) => r.Platform === 'MOBILE').Jumlah, 1);
  assert.match(String(rows[0].Jam), /^\d{4}-\d{2}-\d{2} \d{2}:00$/);
});

test('ukur: aksi asing dan kode aneh tidak masuk apa adanya (kunci cache tidak bisa dicemari)', () => {
  const { g, sheets } = siapkan();
  const t = Date.now();
  g.catatUkur_('hapusSemua<script>', 'MOBILE', t, { ok: false, kode: 'AKSI_TIDAK_DIKENAL' }, 0);
  g.catatUkur_('__proto__', 'MOBILE', t, { ok: false, kode: 'x=1; drop' }, 0);
  g.catatUkur_(undefined, 'MOBILE', t, { ok: false, kode: 'JSON_TIDAK_VALID' }, 0);
  g.pindahUkur_(t + JAM);
  const rows = barisLog(sheets);
  assert.deepStrictEqual(rows.map((r) => r.Aksi), ['(tidak dikenal)']);
  assert.strictEqual(rows[0].Jumlah, 3);
  assert.match(rows[0]['Kode Gagal'], /AKSI_TIDAK_DIKENAL x1/);
  assert.match(rows[0]['Kode Gagal'], /LAIN x1/);
});

test('ukur: p50 / p95 = batas atas kelompok waktu, tidak melebihi maks', () => {
  const { g, sheets } = siapkan();
  const t = Date.now();
  for (let i = 0; i < 9; i++) g.catatUkur_('ping', 'MOBILE', t - 300, { ok: true }, 0);
  g.catatUkur_('ping', 'MOBILE', t - 9000, { ok: true }, 0);
  g.pindahUkur_(t + JAM);
  const r = barisLog(sheets)[0];
  assert.strictEqual(r['p50 (ms)'], 500);
  assert.ok(r['p95 (ms)'] >= 9000 && r['p95 (ms)'] < 9100, 'p95 ' + r['p95 (ms)']);
});

test('ukur: catatUkur_ tidak pernah melempar (cache rusak / galat)', () => {
  const { g } = siapkan();
  g.CacheService = { getScriptCache: () => { throw new Error('cache mati'); } };
  assert.doesNotThrow(() => g.catatUkur_('ping', 'MOBILE', Date.now(), { ok: true }, 0));
  const b = siapkan();
  b.g.CacheService.getScriptCache().put(b.g.kunciUkur_(b.g.jamUkur_(Date.now()), 0), '{rusak');
  assert.doesNotThrow(() => { for (let i = 0; i < 80; i++) b.g.catatUkur_('ping', 'MOBILE', Date.now(), { ok: true }, 0); });
});

test('ukur: jam berjalan tidak dipindah, jam yang sudah dipindah tidak ditulis dua kali, cache dibuang', () => {
  const { g, isi, sheets } = siapkan();
  const t = Date.now();
  g.catatUkur_('ping', 'MOBILE', t, { ok: true }, 0);
  assert.deepStrictEqual([...g.pindahUkur_(t).jam], [], 'jam ini belum selesai');
  assert.strictEqual(sheets.log_Ukur, undefined);
  g.pindahUkur_(t + JAM);
  assert.strictEqual(barisLog(sheets).length, 1);
  assert.strictEqual([...isi.keys()].filter((k) => k.startsWith('ukur:')).length, 0, 'cache jam itu dibuang');
  assert.strictEqual(g.PropertiesService.getScriptProperties().getProperty('UKUR_TERAKHIR'), g.jamUkur_(t));
  g.catatUkur_('ping', 'MOBILE', t, { ok: true }, 0);   // susulan di jam yang sama sesudah dipindah
  assert.deepStrictEqual([...g.pindahUkur_(t + JAM).jam], []);
  assert.strictEqual(barisLog(sheets).length, 1);
});

test('ukur: tab log_Ukur yang headernya diubah = ditolak, tidak menulis ke kolom yang salah', () => {
  const { g, sheets } = siapkan();
  const t = Date.now();
  g.catatUkur_('ping', 'MOBILE', t, { ok: true }, 0);
  g.SpreadsheetApp.openById().insertSheet('log_Ukur').data.push(['Jam', 'Lain']);
  assert.throws(() => g.pindahUkur_(t + JAM), (e) => e.kode === 'STRUKTUR_BERUBAH');
  assert.strictEqual(sheets.log_Ukur.data.length, 1);
});

test('ukur: doPost dan rpc mencatat aksi + platform tanpa mengubah jawaban', () => {
  const { g, sheets } = siapkan();
  g.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ teks: s, setMimeType() { return this; } }) };
  const j = JSON.parse(g.doPost({ postData: { contents: JSON.stringify({ action: 'ping' }) } }).teks);
  assert.strictEqual(j.ok, true);
  assert.strictEqual(JSON.parse(g.doPost({ postData: { contents: '{rusak' } }).teks).kode, 'JSON_TIDAK_VALID');
  assert.strictEqual(g.rpc({ action: 'ping' }).ok, true);
  g.pindahUkur_(Date.now() + JAM);
  const rows = barisLog(sheets);
  assert.strictEqual(rows.find((r) => r.Aksi === 'ping' && r.Platform === 'MOBILE').Jumlah, 1);
  assert.strictEqual(rows.find((r) => r.Aksi === 'ping' && r.Platform === 'WEB').Jumlah, 1);
  assert.strictEqual(rows.find((r) => r.Aksi === '(tidak dikenal)')['Kode Gagal'], 'JSON_TIDAK_VALID x1');
});

test('ukur: pemantau tiap jam (ADMIN_pantauPemakaian) ikut memindah ukur, gagal tidak menghentikan pemantau', () => {
  const { g } = siapkan();
  const badan = g.pantauPemakaianInti_.toString();
  assert.match(badan, /try\s*\{[^}]*pindahUkur_\(/, 'pindahUkur_ dipanggil di dalam try');
});
