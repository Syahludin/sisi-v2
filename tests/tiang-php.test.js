/**
 * Modul tiang di Hostinger (docs/superpowers/plans/2026-11-11-tiang-hostinger.md): uji API PHP hosting/sisi-api/tiang.php
 * dengan server PHP bawaan + SQLite. Butuh PHP 8.3 + pdo_sqlite: PHP_BIN=<path php> node --test tests/tiang-php.test.js
 * (tanpa PHP_BIN = dilewati).
 */
const assert = require('assert');
const test = require('node:test');
const { spawn, execFileSync } = require('child_process');
const { dunia } = require('./duniaTiang');
const { j } = require('./gudangUji');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PHP = process.env.PHP_BIN;
const SKIP = !PHP && 'PHP_BIN tidak diatur';
const RHS = 'k'.repeat(48);
const PORT = 19000 + Math.floor(Math.random() * 1000);
const DASAR = 'http://127.0.0.1:' + PORT;
const API = path.join(__dirname, '..', 'hosting', 'sisi-api');

function tiket(isi, rahasia = RHS) {
  const b = Buffer.from(JSON.stringify(isi)).toString('base64url');
  return b + '.' + crypto.createHmac('sha256', rahasia).update('tiket.' + b).digest('hex');
}
const sekarang = () => Math.floor(Date.now() / 1000);
const isiTiket = (o = {}) => ({ u: 'u-1', role: 'ADMIN', m: ['OPS_VERIFIKASI_TIANG'], t: ['OPS_VERIFIKASI_TIANG'], env: 'staging', exp: sekarang() + 3600, ...o });

async function panggil(aksi, data, t, opsi = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (t !== null) h['X-SiSi-Tiket'] = t === undefined ? tiket(isiTiket()) : t;
  const r = await fetch(DASAR + '/tiang.php', { method: opsi.metode || 'POST', headers: h, body: opsi.metode === 'GET' ? undefined : (opsi.mentah ?? JSON.stringify({ action: aksi, data: data || {} })) });
  const teks = await r.text();
  let j = null;
  try { j = JSON.parse(teks); } catch { /* bukan JSON */ }
  return { http: r.status, j, header: r.headers, teks };
}

function phpKode(kode, env) {
  return execFileSync(PHP, ['-r', kode], { env: { ...process.env, ...env }, encoding: 'utf8' });
}

let srv, dir, cfg, dbFile, fotoDir;

test.before(async () => {
  if (SKIP) return;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sisi-tiang-'));
  cfg = path.join(dir, 'config.php');
  dbFile = path.join(dir, 'db.sqlite').split(path.sep).join('/');
  fotoDir = path.join(dir, 'foto');
  fs.writeFileSync(cfg, `<?php return ['env' => 'staging', 'rahasia' => '${RHS}', 'dsn' => 'sqlite:${dbFile}', 'foto_dir' => '${fotoDir.split(path.sep).join('/')}', 'cadangan_dir' => '${path.join(dir, 'cadangan').split(path.sep).join('/')}', 'origin' => ['http://localhost:5173']];`);
  srv = spawn(PHP, ['-S', '127.0.0.1:' + PORT, '-t', API], { env: { ...process.env, SISI_API_CONFIG: cfg }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(DASAR + '/status.php'); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
test.after(() => { if (srv) srv.kill(); });

// hitungan rem laju per menit dikosongkan sebelum tiap tes supaya urutan / kecepatan tes tidak menimbulkan 429 yang tidak disengaja
test.beforeEach(() => {
  if (SKIP || !dbFile || !fs.existsSync(dbFile)) return;
  try { execFileSync(PHP, ['-r', `$p = new PDO('sqlite:${dbFile}'); try { $p->exec('DELETE FROM tiang_laju'); } catch (Throwable $e) {}`]); } catch { /* tabel belum ada */ }
});

test('tiang pintu: tanpa tiket 401, tiket env salah / tanda salah / kedaluwarsa 401', { skip: SKIP }, async () => {
  assert.strictEqual((await panggil('tiangStatus', {}, null)).http, 401);
  assert.strictEqual((await panggil('tiangStatus', {}, tiket(isiTiket({ env: 'production' })))).j.kode, 'TIKET_TIDAK_VALID');
  assert.strictEqual((await panggil('tiangStatus', {}, tiket(isiTiket(), 'x'.repeat(48)))).j.kode, 'TIKET_TIDAK_VALID');
  assert.strictEqual((await panggil('tiangStatus', {}, tiket(isiTiket({ exp: sekarang() - 5 })))).j.kode, 'TIKET_KEDALUWARSA');
});

test('tiang pintu: menu tidak ada 403, action tak dikenal 400, GET 405, JSON rusak 400', { skip: SKIP }, async () => {
  assert.deepStrictEqual((({ http, j }) => [http, j.kode])(await panggil('tiangStatus', {}, tiket(isiTiket({ m: ['OPS_LAIN'] })))), [403, 'AKSES_DITOLAK']);
  assert.deepStrictEqual((({ http, j }) => [http, j.kode])(await panggil('tidakAda', {})), [400, 'AKSI_TIDAK_DIKENAL']);
  assert.strictEqual((await panggil('tiangStatus', {}, undefined, { metode: 'GET' })).http, 405);
  assert.deepStrictEqual((({ http, j }) => [http, j.kode])(await panggil('', {}, undefined, { mentah: '{rusak' })), [400, 'DATA_TIDAK_VALID']);
});

test('tiang pintu: jawaban tiang membawa Cache-Control no-store dan tabel tiang_* terbuat', { skip: SKIP }, async () => {
  const r = await panggil('tiangStatus', {});
  assert.strictEqual(r.http, 200);
  assert.strictEqual(r.j.ok, true);
  assert.match(r.header.get('cache-control'), /no-store/);
  assert.deepStrictEqual(Object.keys(r.j.data.tabel).sort(),
    ['tiang_audit', 'tiang_cabut', 'tiang_foto', 'tiang_jaringan', 'tiang_konstruksi', 'tiang_laju', 'tiang_op', 'tiang_pemetaan', 'tiang_segmen', 'tiang_sirkuit', 'tiang_switching', 'tiang_tiang', 'tiang_ukuran']);
  // tiang_laju berisi baris rem laju dari permintaan tadi; selebihnya masih kosong
  assert.ok(Object.entries(r.j.data.tabel).filter(([t]) => t !== 'tiang_laju').every(([, n]) => n === 0));
});

test('tiang skema: kolom mengikuti header sheet SiSi_Tiang dan dibuat sekali (versi tercatat)', { skip: SKIP }, async () => {
  await panggil('tiangStatus', {});
  const kolom = JSON.parse(phpKode(`$p = new PDO('sqlite:${dbFile}'); $o = [];
    foreach (['tiang_tiang','tiang_sirkuit','tiang_segmen','tiang_switching'] as $t) { $o[$t] = array_column($p->query("PRAGMA table_info($t)")->fetchAll(PDO::FETCH_ASSOC), 'name'); }
    $o['versi'] = $p->query("SELECT isi FROM sinkron_info WHERE modul = 'skema_tiang'")->fetchColumn(); echo json_encode($o);`));
  const header = fs.readFileSync(path.join(__dirname, '..', 'backend', 'src', 'modules', '95_Tiang_Master.js'), 'utf8');
  const daftar = (nama) => {
    const m = new RegExp(nama + ': \\[([\\s\\S]*?)\\]').exec(header);
    return [...m[1].replace(/\/\/.*$/gm, '').matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]).filter((x) => x !== 'No');
  };
  const peta = { tiang_tiang: 'db_Tiang', tiang_sirkuit: 'db_Tiang_Sirkuit', tiang_segmen: 'db_Segmen', tiang_switching: 'db_Switching' };
  Object.entries(peta).forEach(([tabel, sheet]) => assert.deepStrictEqual(kolom[tabel], [...daftar(sheet), 'urut'], tabel + ' = header ' + sheet + ' + urut'));
  assert.ok(kolom.versi);
});

test('tiang laju: >120 permintaan/menit per pengguna → 429 TERLALU_SERING, pengguna lain tidak terkena', { skip: SKIP }, async () => {
  // hitungan per menit kalender: jangan mulai dekat pergantian menit supaya 125 permintaan jatuh di menit yang sama
  const dtk = new Date().getSeconds();
  if (dtk >= 54) await new Promise((r) => setTimeout(r, (61 - dtk) * 1000));
  const t = tiket(isiTiket({ u: 'u-padat' }));
  let ditolak = null;
  for (let i = 0; i < 125; i++) {
    const r = await panggil('tiangStatus', {}, t);
    if (r.http === 429) { ditolak = r; break; }
  }
  assert.ok(ditolak, 'harus ada 429');
  assert.strictEqual(ditolak.j.kode, 'TERLALU_SERING');
  assert.strictEqual((await panggil('tiangStatus', {}, tiket(isiTiket({ u: 'u-lain' })))).http, 200);
});

test('tiang cabut: pengguna di tiang_cabut ditolak 401 TIKET_DICABUT', { skip: SKIP }, async () => {
  await panggil('tiangStatus', {});
  phpKode(`$p = new PDO('sqlite:${dbFile}'); $p->prepare('INSERT INTO tiang_cabut (user_id, sejak) VALUES (?, ?)')->execute(['u-cabut', '2026-11-11T00:00:00Z']);`);
  const r = await panggil('tiangStatus', {}, tiket(isiTiket({ u: 'u-cabut' })));
  assert.deepStrictEqual([r.http, r.j.kode], [401, 'TIKET_DICABUT']);
});

test('tiang izin: aksi tulis butuh menu di daftar t (hak ubah), aksi baca cukup m', { skip: SKIP }, () => {
  const kode = (tiketIsi, def) => JSON.parse(phpKode(`require '${API.replace(/\\/g, '/')}/_lib.php'; require '${API.replace(/\\/g, '/')}/tiang_lib.php'; echo json_encode(izinkanAksi(json_decode('${JSON.stringify(tiketIsi)}', true), json_decode('${JSON.stringify(def)}', true)));`));
  const tulis = { menu: 'OPS_VERIFIKASI_TIANG', ubah: true };
  const baca = { menu: 'OPS_VERIFIKASI_TIANG', ubah: false };
  assert.strictEqual(kode({ role: 'ADMIN', m: ['OPS_VERIFIKASI_TIANG'], t: [] }, tulis), 'AKSES_DITOLAK');
  assert.strictEqual(kode({ role: 'ADMIN', m: ['OPS_VERIFIKASI_TIANG'], t: ['OPS_VERIFIKASI_TIANG'] }, tulis), null);
  assert.strictEqual(kode({ role: 'SUPER', m: ['OPS_VERIFIKASI_TIANG'], t: [] }, baca), null);
  assert.strictEqual(kode({ role: 'ADMIN', m: [], t: [] }, baca), 'AKSES_DITOLAK');
  assert.strictEqual(kode({ role: 'PETUGAS', m: ['OPS_VERIFIKASI_TIANG'], t: ['OPS_VERIFIKASI_TIANG'] }, baca), 'AKSES_DITOLAK', 'wajibAdminTiang_: hanya ADMIN / SUPER');
});

test('tiang galat: KumpulGalat menjawab 422 dengan SEMUA masalah', { skip: SKIP }, () => {
  const out = phpKode(`require '${API.replace(/\\/g, '/')}/_lib.php'; require '${API.replace(/\\/g, '/')}/tiang_lib.php';
    $g = new KumpulGalat(); $g->tambah('koordinat', 'Koordinat wajib diisi.'); $g->tambah('foto', 'Foto belum lengkap.'); $g->tambah('sisi', 'Pilih sisi jalan.'); $g->keluar();`);
  const j = JSON.parse(out);
  assert.strictEqual(j.ok, false);
  assert.strictEqual(j.kode, 'DATA_TIDAK_VALID');
  assert.deepStrictEqual(j.galat.map((x) => x.field), ['koordinat', 'foto', 'sisi']);
});

test('tiang pintu: badan lebih dari 6 MB → 413 PAYLOAD_TERLALU_BESAR', { skip: SKIP }, async () => {
  const r = await panggil('tiangStatus', {}, undefined, { mentah: JSON.stringify({ action: 'tiangStatus', data: { x: 'a'.repeat(6 * 1024 * 1024 + 10) } }) });
  assert.deepStrictEqual([r.http, r.j.kode], [413, 'PAYLOAD_TERLALU_BESAR']);
});

// ---------------------------------------------------------------------------------------------------------------------------
// Task 2: aksi baca = jawaban Apps Script untuk data yang sama (dunia uji duniaTiang.js disemai ke SQLite)
// ---------------------------------------------------------------------------------------------------------------------------

const TABEL_SHEET = { t: { db_Tiang: 'tiang_tiang', db_Tiang_Sirkuit: 'tiang_sirkuit', db_Segmen: 'tiang_segmen', db_Switching: 'tiang_switching' },
  m: { db_Jaringan: 'tiang_jaringan', db_Konstruksi: 'tiang_konstruksi', db_Ukuran_Tiang: 'tiang_ukuran' } };
const garisMiring = (p) => p.split(path.sep).join('/');

/** Isi sheet dunia uji -> { tabelMySQL: [baris berkunci kolom] } (urutan baris sheet = urut). */
function isiSheet(w) {
  const out = {};
  Object.entries(TABEL_SHEET).forEach(([sid, peta]) => Object.entries(peta).forEach(([sheet, tabel]) => {
    const data = (w.sheets[sid][sheet] || { data: [[]] }).data;
    const h = data[0];
    out[tabel] = data.slice(1).filter((b) => b.some((v) => v !== '' && v !== null && v !== undefined)).map((b, i) => ({ ...Object.fromEntries(h.map((k, n) => [k, b[n]])), urut: i + 1 }));
  }));
  return out;
}

function semai(w) {
  const f = garisMiring(path.join(dir, 'seed-' + Math.random().toString(36).slice(2) + '.json'));
  fs.writeFileSync(f, JSON.stringify(isiSheet(w)));
  const A = garisMiring(API);
  phpKode(`require '${A}/_lib.php'; require '${A}/tiang_lib.php'; $pdo = db();
    foreach (daftarTabelTiang() as $t) { if (!in_array($t, ['tiang_laju', 'tiang_cabut'], true)) $pdo->exec("DELETE FROM $t"); }
    foreach (json_decode(file_get_contents('${f}'), true) as $t => $b) { isiBarisTiang($pdo, $t, $b); }`, { SISI_API_CONFIG: cfg });
}

const tiketAdmin = () => tiket(isiTiket({ m: ['OPS_VERIFIKASI_TIANG', 'OPS_MASTER_SWITCHING'], t: [] }));
const JS_AKSI = { getVerifikasiTiang: 'getVerifikasiTiang_', getTiangJalur: 'getTiangJalur_', getPetaTiang: 'getPetaTiang_', getSegmen: 'getSegmen_', getMasterSwitching: 'getMasterSwitching_' };

/** Jawaban PHP sama persis dengan jawaban Apps Script (kunci `waktu` diabaikan). */
async function samaDenganAppsScript(w, aksi, data = {}) {
  const harapan = j(w.g[JS_AKSI[aksi]](w.admin, data));
  const r = await panggil(aksi, data, tiketAdmin());
  assert.strictEqual(r.http, 200, aksi + ': ' + r.teks.slice(0, 300));
  const dapat = r.j.data;
  delete harapan.waktu;
  delete dapat.waktu;
  assert.deepStrictEqual(dapat, harapan, aksi);
  return dapat;
}

/** Dunia uji + segmen + 2 tiang terverifikasi (induk-anak), 1 tidak ditemukan, 1 punya foto, 2 switching tambahan (berhulu). */
function duniaTerisi() {
  const w = dunia();
  const seg = w.segmen();
  w.awal(seg.segmenId);
  const t1 = w.jalur()[1];
  w.verif({ tiangId: t1.tiangId, revision: t1.revision, statusVerifikasi: 'TERVERIFIKASI', koordinat: '-3, 106.5005', ...w.fisik,
    sirkuit: [{ sirkuitId: t1.sirkuit[0].sirkuitId, ...w.lengkap(seg.segmenId, { indukStatus: 'BENAR', indukTiangId: w.jalur()[0].tiangId }) }] });
  const t3 = w.jalur()[2];
  w.verif({ tiangId: t3.tiangId, revision: t3.revision, statusVerifikasi: 'TIDAK_DITEMUKAN' });
  // foto tiang pertama (id Drive tiruan), supaya ada tiang Terverifikasi yang lengkap
  const h = w.sheets.t.db_Tiang.data[0];
  const baris = w.sheets.t.db_Tiang.data.find((b, i) => i > 0 && String(b[h.indexOf('tiang_id')]) === '1001');
  baris[h.indexOf('foto_tiang_id')] = 'drive-1';
  baris[h.indexOf('foto_kepala_id')] = 'drive-2';
  const pmt = j(w.g.simpanSwitching_(w.admin, { jenis: 'PMT', nama: 'PMT Toboali', penyulang: 'TOBOALI 1', posisiNormal: 'NC', statusOperasi: 'OPERASI', koordinat: '-3, 106.5' }, 'MOBILE')).switching;
  j(w.g.simpanSwitching_(w.admin, { jenis: 'LBS', nama: 'LBS Hilir', penyulang: 'TOBOALI 1', posisiNormal: 'NO', statusOperasi: 'OPERASI', koordinat: '-3.001, 106.501', switchingHuluId: pmt.switchingId }, 'MOBILE'));
  return w;
}

test('tiang baca: dunia awal (hasil migrasi ITB) sama dengan Apps Script untuk kelima aksi', { skip: SKIP }, async () => {
  const w = dunia();
  semai(w);
  for (const a of ['getVerifikasiTiang', 'getPetaTiang', 'getSegmen', 'getMasterSwitching']) await samaDenganAppsScript(w, a);
  const jalur = await samaDenganAppsScript(w, 'getTiangJalur', { kode: 'PLS' });
  assert.ok(jalur.tiang.length >= 3);
  await samaDenganAppsScript(w, 'getTiangJalur', { kode: 'LAINNYA' });
});

test('tiang baca: dunia terisi (segmen, tiang terverifikasi induk-anak, tidak ditemukan, switching berhulu) sama dengan Apps Script', { skip: SKIP }, async () => {
  const w = duniaTerisi();
  semai(w);
  const v = await samaDenganAppsScript(w, 'getVerifikasiTiang');
  assert.ok(v.jalur.some((x) => x.terverifikasi > 0) && v.jalur.some((x) => x.perluDilengkapi > 0 || x.tidakDitemukan > 0), 'data uji harus beragam');
  const peta = await samaDenganAppsScript(w, 'getPetaTiang');
  assert.ok(peta.titik.length >= 2 && peta.garis.length >= 1, 'peta: titik dan garis induk-anak');
  await samaDenganAppsScript(w, 'getSegmen');
  const sw = (await samaDenganAppsScript(w, 'getMasterSwitching')).switching;
  assert.ok(sw.some((x) => x.proteksiHuluId), 'proteksi hulu terhitung');
  await samaDenganAppsScript(w, 'getTiangJalur', { kode: 'PLS' });
});

test('tiang baca: kode jalur salah → 422 dengan field kode; role PETUGAS → 403', { skip: SKIP }, async () => {
  const r = await panggil('getTiangJalur', { kode: 'abc' }, tiketAdmin());
  assert.deepStrictEqual([r.http, r.j.kode, r.j.galat[0].field], [422, 'DATA_TIDAK_VALID', 'kode']);
  const p = await panggil('getSegmen', {}, tiket(isiTiket({ role: 'PETUGAS', m: ['OPS_MASTER_SWITCHING'] })));
  assert.deepStrictEqual([p.http, p.j.kode], [403, 'AKSES_DITOLAK']);
});

test('tiang baca: jawaban langsung memuat perubahan terakhir (tanpa cache); petaTiang hanya tiang terverifikasi ber-koordinat', { skip: SKIP }, async () => {
  const w = duniaTerisi();
  semai(w);
  const sebelum = (await panggil('getPetaTiang', {}, tiketAdmin())).j.data;
  phpKode(`$p = new PDO('sqlite:${garisMiring(dbFile)}'); $p->exec("UPDATE tiang_tiang SET lat = NULL, lng = NULL, lat_aset = NULL, lng_aset = NULL WHERE tiang_id = '1002'");`);
  const sesudah = (await panggil('getPetaTiang', {}, tiketAdmin())).j.data;
  assert.strictEqual(sesudah.titik.length, sebelum.titik.length - 1);
  assert.strictEqual(sesudah.tanpaKoordinat, sebelum.tanpaKoordinat + 1);
  assert.ok(sesudah.garis.every((g) => g.tiangId !== '1002' && g.indukTiangId !== '1002'));
});

// ---------------------------------------------------------------------------------------------------------------------------
// Task 3: cabut.php (daftar lengkap akun nonaktif dari Apps Script)
// ---------------------------------------------------------------------------------------------------------------------------

async function kirimCabut(isi, opsi = {}) {
  const body = JSON.stringify(isi);
  const waktu = String(opsi.waktu ?? sekarang());
  const sha = crypto.createHash('sha256').update(body).digest('hex');
  const tanda = opsi.tanda ?? crypto.createHmac('sha256', RHS).update(waktu + '.' + sha).digest('hex');
  const r = await fetch(DASAR + '/cabut.php', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SiSi-Waktu': waktu, 'X-SiSi-Tanda': tanda }, body });
  return { http: r.status, j: await r.json() };
}

test('cabut.php: daftar lengkap menggantikan isi tiang_cabut; tiket akun tercabut ditolak, akun diaktifkan lagi diterima', { skip: SKIP }, async () => {
  const tiketMati = tiket(isiTiket({ u: 'u-mati' }));
  assert.strictEqual((await panggil('tiangStatus', {}, tiketMati)).http, 200);
  const r1 = await kirimCabut({ cabut: ['u-mati', 'u-lain'] });
  assert.deepStrictEqual([r1.http, r1.j.data.jumlah], [200, 2]);
  const tolak = await panggil('tiangStatus', {}, tiketMati);
  assert.deepStrictEqual([tolak.http, tolak.j.kode], [401, 'TIKET_DICABUT']);
  const r2 = await kirimCabut({ cabut: ['u-lain'] });
  assert.strictEqual(r2.j.data.jumlah, 1);
  assert.strictEqual((await panggil('tiangStatus', {}, tiketMati)).http, 200, 'diaktifkan lagi = tidak tercabut');
  const tersisa = JSON.parse(phpKode(`$p = new PDO('sqlite:${garisMiring(dbFile)}'); echo json_encode($p->query("SELECT user_id FROM tiang_cabut ORDER BY user_id")->fetchAll(PDO::FETCH_COLUMN));`));
  assert.deepStrictEqual(tersisa, ['u-lain']);
  assert.strictEqual((await kirimCabut({ cabut: [] })).j.data.jumlah, 0);
});

test('cabut.php: tanpa tanda / tanda salah / kedaluwarsa 401; id tidak sah atau bukan daftar 400', { skip: SKIP }, async () => {
  assert.strictEqual((await kirimCabut({ cabut: [] }, { tanda: 'a'.repeat(64) })).j.kode, 'TANDA_TIDAK_VALID');
  assert.strictEqual((await kirimCabut({ cabut: [] }, { waktu: sekarang() - 1000 })).j.kode, 'TANDA_KEDALUWARSA');
  assert.strictEqual((await kirimCabut({ cabut: ['ok', 'tidak sah;DROP'] })).j.kode, 'DATA_TIDAK_VALID');
  assert.strictEqual((await kirimCabut({ cabut: 'u-1' })).j.kode, 'DATA_TIDAK_VALID');
  assert.strictEqual((await kirimCabut({})).http, 400);
});

test('tiket HP dari Apps Script asli (getTiketApi_ MOBILE) diterima tiang.php: baca boleh, tulis ditolak tanpa hak UBAH', { skip: SKIP }, async () => {
  const { PROPS } = require('./duniaTiang');
  const { buatKonteks } = require('./harness');
  const gx = buatKonteks({ ...PROPS, MYSQL_API_URL: 'https://contoh.id/sisi-api', MYSQL_API_SECRET: RHS });
  gx.menuUntuk_ = () => [{ kode: 'OPS_VERIFIKASI_TIANG', aksi: 'LIHAT' }, { kode: 'OPS_MASTER_SWITCHING', aksi: 'LIHAT' }];
  const t = gx.getTiketApi_({ role: 'ADMIN', userId: 'u-e2e' }, {}, 'MOBILE').tiket;
  const baca = await panggil('getSegmen', {}, t);
  assert.deepStrictEqual([baca.http, baca.j.ok], [200, true]);
  gx.menuUntuk_ = () => [{ kode: 'OPS_VERIFIKASI_TIANG', aksi: 'UBAH' }];
  const t2 = gx.getTiketApi_({ role: 'ADMIN', userId: 'u-e2e' }, {}, 'MOBILE').tiket;
  assert.strictEqual((await panggil('getTiangJalur', { kode: 'PLS' }, t2)).http, 200);
  assert.strictEqual((await panggil('getSegmen', {}, t2)).j.kode, 'AKSES_DITOLAK', 'menu OPS_MASTER_SWITCHING tidak ada di tiket');
});

// ---------------------------------------------------------------------------------------------------------------------------
// Task 4: simpanVerifikasiTiang = aturan Apps Script (kesetaraan) + perilaku baru (opId, galat terkumpul, revision opsional)
// ---------------------------------------------------------------------------------------------------------------------------

const tiketUbah = () => tiket(isiTiket({ u: 'u-admin', m: ['OPS_VERIFIKASI_TIANG', 'OPS_MASTER_SWITCHING'], t: ['OPS_VERIFIKASI_TIANG', 'OPS_MASTER_SWITCHING'] }));
let nomorOp = 0;
const opBaru = () => 'op-uji-' + Date.now() + '-' + (++nomorOp);

function dumpTiang(id) {
  return JSON.parse(phpKode(`$p = new PDO('sqlite:${garisMiring(dbFile)}'); $p->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $t = $p->prepare('SELECT * FROM tiang_tiang WHERE tiang_id = ?'); $t->execute(['${id}']);
    $s = $p->prepare('SELECT * FROM tiang_sirkuit WHERE tiang_id = ? ORDER BY urut'); $s->execute(['${id}']);
    echo json_encode(['tiang' => $t->fetch(), 'sirkuit' => $s->fetchAll()]);`));
}

const BOOL_KOLOM = new Set(['aktif']);
const ABAI_KOLOM = new Set(['No', 'urut', 'diubah_pada', 'verifikasi_terakhir', 'sirkuit_id']);
/** Baris DB / sheet -> bentuk kanonik yang bisa dibandingkan (kosong = '', boolean = '1' / '0', angka = teks). */
function kanon(baris) {
  const o = {};
  Object.keys(baris).filter((k) => !ABAI_KOLOM.has(k)).sort().forEach((k) => {
    let v = baris[k];
    if (v === null || v === undefined) v = '';
    if (BOOL_KOLOM.has(k)) v = v === true || v === 1 || v === '1' || String(v).toUpperCase() === 'TRUE' ? '1' : '0';
    else if (typeof v === 'number') v = String(v);
    else if (typeof v === 'string' && v.trim() !== '' && /^-?\d+(\.\d+)?$/.test(v.trim())) v = String(Number(v.trim()));
    o[k] = typeof v === 'string' ? v.trim() : v;
  });
  return o;
}
function sheetBaris(w, sheet, filter) {
  const data = w.sheets.t[sheet].data;
  return data.slice(1).map((b) => Object.fromEntries(data[0].map((k, i) => [k, b[i]]))).filter(filter);
}
function normApi(t) {
  const x = JSON.parse(JSON.stringify(t));
  x.verifikasiTerakhir = '<waktu>';
  (x.sirkuit || []).forEach((s) => { s.sirkuitId = '<id>'; });
  return x;
}

/**
 * Jalankan [muatan] di Apps Script (dunia uji w) dan di PHP (DB yang disemai dari w SEBELUMNYA). Berhasil di keduanya = respons dan baris
 * DB sama; ditolak di Apps Script = ditolak PHP (status [httpTolak]) dan DB tidak berubah.
 */
async function bandingSimpan(w, muatan, { httpTolak = 422, revisiTetap = false } = {}) {
  // revision memakai nilai sheet saat ini (urutan beberapa simpan dalam satu dunia), kecuali sengaja basi
  const sekarangRev = muatan.tiangId && !revisiTetap ? sheetBaris(w, 'db_Tiang', (b) => String(b.tiang_id) === muatan.tiangId)[0] : null;
  if (sekarangRev) muatan = { ...muatan, revision: Number(sekarangRev.revision) };
  if (muatan.tiangId) beriFoto(w, muatan.tiangId);
  semai(w);
  let harapan = null, kodeJs = null;
  try { harapan = j(w.g.simpanVerifikasiTiang_(w.admin, muatan, 'MOBILE')); } catch (e) { kodeJs = e.kode || String(e); }
  const r = await panggil('simpanVerifikasiTiang', { ...muatan, opId: opBaru() }, tiketUbah());
  if (kodeJs) {
    assert.strictEqual(r.http, httpTolak, 'JS menolak (' + kodeJs + '), PHP: ' + r.teks.slice(0, 300));
    return { ditolak: true, kodeJs, r };
  }
  assert.strictEqual(r.http, 200, 'JS berhasil, PHP: ' + r.teks.slice(0, 400));
  const dapat = r.j.data;
  assert.deepStrictEqual(normApi(dapat.tiang), normApi(harapan.tiang), 'respons tiang');
  assert.strictEqual(dapat.selisihM, harapan.selisihM, 'selisihM');
  const id = harapan.tiang.tiangId;
  const db = dumpTiang(id);
  assert.deepStrictEqual(kanon(db.tiang), kanon(sheetBaris(w, 'db_Tiang', (b) => String(b.tiang_id) === id)[0]), 'baris db_Tiang');
  const sh = sheetBaris(w, 'db_Tiang_Sirkuit', (b) => String(b.tiang_id) === id);
  assert.deepStrictEqual(db.sirkuit.map(kanon), sh.map(kanon), 'baris db_Tiang_Sirkuit');
  return { ditolak: false, dapat, id };
}

/** Foto sudah ada di server (diimpor dari Drive): kolom foto_*_id terisi. Apps Script tidak memeriksa foto saat simpan; PHP menolak Terverifikasi tanpa dua foto. */
function beriFoto(w, tiangId) {
  const h = w.sheets.t.db_Tiang.data[0];
  const baris = w.sheets.t.db_Tiang.data.find((b, i) => i > 0 && String(b[h.indexOf('tiang_id')]) === tiangId);
  if (!baris) return;
  baris[h.indexOf('foto_tiang_id')] = 'PLS/lama_TIANG.jpg';
  baris[h.indexOf('foto_kepala_id')] = 'PLS/lama_KEPALA.jpg';
}

/** Dunia + segmen (+ tiang awal terverifikasi bila [denganAwal]). */
function duniaSimpan(denganAwal = false) {
  const w = dunia();
  const seg = w.segmen();
  if (denganAwal) w.awal(seg.segmenId);
  return { w, seg, jalur: w.jalur() };
}
const sirkuitAwal = (w, t, seg, o = {}) => ({ sirkuitId: t.sirkuit[0].sirkuitId, ...w.lengkap(seg.segmenId, { indukStatus: 'TITIK_AWAL', indukKeterangan: 'Tiang Awal SKTM', ...o }) });
const verifAwal = (w, t, seg, o = {}) => ({ tiangId: t.tiangId, revision: t.revision, statusVerifikasi: 'TERVERIFIKASI', koordinat: '-3, 106.5', ...w.fisik, sirkuit: [sirkuitAwal(w, t, seg)], ...o });

test('simpan: tiang awal Terverifikasi lengkap = Apps Script (respons + baris DB)', { skip: SKIP }, async () => {
  const { w, seg, jalur } = duniaSimpan();
  const h = await bandingSimpan(w, verifAwal(w, jalur[0], seg));
  assert.strictEqual(h.dapat.tiang.statusVerifikasi, 'TERVERIFIKASI');
  assert.strictEqual(h.dapat.selisihM, 0);
});

test('simpan: tiang anak dengan induk Benar (jarak gawang dihitung) = Apps Script', { skip: SKIP }, async () => {
  const { w, seg, jalur } = duniaSimpan(true);
  const t = w.jalur()[1];
  const h = await bandingSimpan(w, { tiangId: t.tiangId, revision: t.revision, statusVerifikasi: 'TERVERIFIKASI', koordinat: '-3, 106.5005', ...w.fisik,
    sirkuit: [{ sirkuitId: t.sirkuit[0].sirkuitId, ...w.lengkap(seg.segmenId, { indukStatus: 'BENAR', indukTiangId: jalur[0].tiangId }) }] });
  assert.ok(h.dapat.tiang.sirkuit[0].gawangM > 0, 'gawang terhitung');
});

test('simpan: ditolak di Apps Script = ditolak di PHP (kurang data, penyulang asing, posisi kembar, induk belum terverifikasi, segmen salah penyulang)', { skip: SKIP }, async () => {
  const { w, seg, jalur } = duniaSimpan();
  const t = jalur[1];
  const dasar = { tiangId: t.tiangId, revision: t.revision, statusVerifikasi: 'TERVERIFIKASI', koordinat: '-3, 106.5005', ...w.fisik };
  const sir = (o = {}) => ({ sirkuitId: t.sirkuit[0].sirkuitId, ...w.lengkap(seg.segmenId, { indukStatus: 'BENAR', indukTiangId: jalur[0].tiangId, ...o }) });
  const kasus = {
    'jenis tiang kosong': { ...dasar, jenisTiang: undefined, sirkuit: [sir()] },
    'penyulang tidak dikenal': { ...dasar, sirkuit: [sir({ penyulang: 'ASING' })] },
    'induk belum terverifikasi': { ...dasar, sirkuit: [sir()] },
    'segmen beda penyulang': { ...dasar, sirkuit: [sir({ penyulang: 'PAYUNG', sectionId: 's3' })] },
    'tanpa koordinat': { ...dasar, koordinat: undefined, sirkuit: [sir()] },
    'sirkuit kosong': { ...dasar, sirkuit: [] },
    'induk tiang sendiri': { ...dasar, sirkuit: [sir({ indukTiangId: t.tiangId })] },
    'switching tidak ada': { ...dasar, sirkuit: [sir({ switchingId: 'SWC-9999' })] },
    'konstruksi tidak ada': { ...dasar, sirkuit: [sir({ konstruksiId: '22222222-2222-4222-8222-222222222222' })] },
  };
  for (const [nama, m] of Object.entries(kasus)) {
    const h = await bandingSimpan(w, JSON.parse(JSON.stringify(m)));
    assert.ok(h.ditolak, nama + ' harus ditolak');
  }
});

test('simpan: TIDAK_DITEMUKAN, tiang baru dari lapangan, koordinat jauh (dasar TERDAFTAR / LAPANGAN), sumber PETA = Apps Script', { skip: SKIP }, async () => {
  const { w, seg, jalur } = duniaSimpan();
  const t = jalur[2];
  const hilang = await bandingSimpan(w, { tiangId: t.tiangId, revision: t.revision, statusVerifikasi: 'TIDAK_DITEMUKAN' });
  assert.strictEqual(hilang.dapat.tiang.statusVerifikasi, 'TIDAK_DITEMUKAN');
  const baru = await bandingSimpan(w, { statusVerifikasi: 'PERLU_PERBAIKAN', nama: 'Tiang Baru Uji', kode: 'PLS', koordinat: '-3.0001, 106.5001', jenisTiang: 'BETON',
    sirkuit: [{ penyulang: 'toboali 1', segmenId: seg.segmenId }] });
  assert.strictEqual(baru.id, 'BARU-0001');
  const t0 = jalur[0];
  const jauh = { ...verifAwal(w, t0, seg), koordinat: '-3.001, 106.5' };
  assert.ok((await bandingSimpan(w, jauh)).ditolak, 'selisih > 10 m tanpa dasar ditolak');
  const lap = await bandingSimpan(w, { ...jauh, dasarKoordinat: 'LAPANGAN', akurasiM: 4.5 });
  assert.ok(lap.dapat.selisihM > 100 && lap.dapat.tiang.sumberKoordinat === 'lapangan');
  const aset = await bandingSimpan(w, { ...jauh, dasarKoordinat: 'TERDAFTAR', akurasiM: 4.5 });
  assert.strictEqual(aset.dapat.tiang.sumberKoordinat, 'aset');
  const peta = await bandingSimpan(w, { ...verifAwal(w, t0, seg), koordinat: '-3, 106.50001', sumberKoordinat: 'PETA', akurasiM: 7 });
  assert.strictEqual(peta.dapat.tiang.sumberKoordinat, 'peta');
});

test('simpan: dua penyulang (posisi berbeda) diterima, posisi kembar ditolak, revision basi = 409', { skip: SKIP }, async () => {
  const { w, seg, jalur } = duniaSimpan();
  const seg2 = w.segmen({ nama: 'Payung Satu', penyulang: 'PAYUNG', sectionId: 's3' });
  const t = jalur[0];
  const dua = (p1, p2) => ({ tiangId: t.tiangId, revision: t.revision, statusVerifikasi: 'TERVERIFIKASI', koordinat: '-3, 106.5', ...w.fisik, sirkuit: [
    { sirkuitId: t.sirkuit[0].sirkuitId, ...w.lengkap(seg.segmenId, { posisi: p1, indukStatus: 'TITIK_AWAL', indukKeterangan: 'SKTM' }) },
    w.lengkap(seg2.segmenId, { penyulang: 'PAYUNG', sectionId: 's3', posisi: p2, indukStatus: 'TITIK_AWAL', indukKeterangan: 'SKTM' })] });
  const ok = await bandingSimpan(w, dua('ATAS', 'TENGAH'));
  assert.strictEqual(ok.dapat.tiang.sirkuit.length, 2);
  assert.ok((await bandingSimpan(w, dua('ATAS', 'ATAS'))).ditolak, 'posisi kembar');
  const basi = await bandingSimpan(w, { ...verifAwal(w, t, seg), revision: t.revision + 5 }, { httpTolak: 409, revisiTetap: true });
  assert.ok(basi.ditolak && basi.r.j.kode === 'KONFLIK_REVISION');
});

test('simpan: semua masalah isian dikumpulkan sekaligus (bukan satu-satu) dengan field form', { skip: SKIP }, async () => {
  const { w, seg, jalur } = duniaSimpan();
  semai(w);
  const t = jalur[0];
  const r = await panggil('simpanVerifikasiTiang', { opId: opBaru(), tiangId: t.tiangId, statusVerifikasi: 'TERVERIFIKASI', koordinat: '-3, 106.5',
    sirkuit: [{ penyulang: 'TOBOALI 1', segmenId: seg.segmenId }] }, tiketUbah());
  assert.deepStrictEqual([r.http, r.j.kode], [422, 'DATA_TIDAK_VALID']);
  const field = r.j.galat.map((x) => x.field);
  ['jenis', 'ukuran', 'sisi', 'sirkuit0'].forEach((f) => assert.ok(field.includes(f), 'galat memuat ' + f + ': ' + field.join(',')));
  assert.ok(r.j.galat.length >= 6, 'banyak masalah sekaligus: ' + r.j.galat.length);
  assert.ok(r.j.galat.every((x) => x.pesan && x.pesan.length > 5), 'pesan berbahasa Indonesia');
  // isian yang bentuknya salah dikumpulkan sekaligus pula (tahap pertama sebelum aturan bisnis)
  const bentuk = await panggil('simpanVerifikasiTiang', { opId: opBaru(), tiangId: t.tiangId, statusVerifikasi: 'SALAH', koordinat: 'bukan', jenisTiang: 'KAYU2', bukanIsian: 1, sirkuit: [] }, tiketUbah());
  const fb = bentuk.j.galat.map((x) => x.field);
  ['statusVerifikasi', 'koordinat', 'jenisTiang', 'bukanIsian', 'sirkuit0'].forEach((f) => assert.ok(fb.includes(f), 'bentuk memuat ' + f + ': ' + fb.join(',')));
});

test('simpan: opId sama dua kali = satu penulisan (revisi naik sekali), jawaban sama; galat tidak menghabiskan opId', { skip: SKIP }, async () => {
  const { w, seg, jalur } = duniaSimpan();
  semai(w);
  const t = jalur[0];
  beriFoto(w, t.tiangId);
  semai(w);
  const muatan = { ...verifAwal(w, t, seg), revision: undefined };
  const salah = { ...muatan, jenisTiang: undefined };
  const op = opBaru();
  const gagal = await panggil('simpanVerifikasiTiang', { ...salah, opId: op }, tiketUbah());
  assert.strictEqual(gagal.http, 422);
  const a = await panggil('simpanVerifikasiTiang', { ...muatan, opId: op }, tiketUbah());
  assert.strictEqual(a.http, 200, 'opId yang pernah ditolak boleh dipakai ulang: ' + a.teks.slice(0, 200));
  const revisi = dumpTiang(t.tiangId).tiang.revision;
  const b = await panggil('simpanVerifikasiTiang', { ...muatan, opId: op }, tiketUbah());
  assert.strictEqual(b.http, 200);
  assert.deepStrictEqual(b.j.data, a.j.data, 'jawaban kirim ulang sama');
  assert.strictEqual(dumpTiang(t.tiangId).tiang.revision, revisi, 'tidak ditulis dua kali');
  assert.strictEqual(JSON.parse(phpKode(`$p = new PDO('sqlite:${garisMiring(dbFile)}'); echo $p->query("SELECT COUNT(*) FROM tiang_audit WHERE objek = '${t.tiangId}'")->fetchColumn();`)), 1);
});

test('simpan: tanpa revision tidak diperiksa (dua simpan berbeda berturut-turut berhasil); tiang baru dua kali = BARU-0001 dan BARU-0002', { skip: SKIP }, async () => {
  const { w, seg, jalur } = duniaSimpan();
  semai(w);
  const t = jalur[0];
  beriFoto(w, t.tiangId);
  semai(w);
  const dasar = { ...verifAwal(w, t, seg), revision: undefined };
  assert.strictEqual((await panggil('simpanVerifikasiTiang', { ...dasar, opId: opBaru() }, tiketUbah())).http, 200);
  const ubah = await panggil('simpanVerifikasiTiang', { ...dasar, ukuranTiang: '11 Meter 350 daN', opId: opBaru() }, tiketUbah());
  assert.strictEqual(ubah.j.data.tiang.ukuranTiang, '11 Meter 350 daN');
  const baru = () => panggil('simpanVerifikasiTiang', { opId: opBaru(), statusVerifikasi: 'PERLU_PERBAIKAN', nama: 'Tiang Baru', koordinat: '-3.0001, 106.5001',
    sirkuit: [{ penyulang: 'TOBOALI 1' }] }, tiketUbah());
  assert.deepStrictEqual([(await baru()).j.data.tiang.tiangId, (await baru()).j.data.tiang.tiangId], ['BARU-0001', 'BARU-0002']);
});

test('simpan: wajib hak UBAH (t) dan opId; tiket hanya lihat → 403', { skip: SKIP }, async () => {
  const { w, seg, jalur } = duniaSimpan();
  semai(w);
  const muatan = verifAwal(w, jalur[0], seg);
  assert.strictEqual((await panggil('simpanVerifikasiTiang', { ...muatan, opId: opBaru() }, tiketAdmin())).j.kode, 'AKSES_DITOLAK');
  const tanpaOp = await panggil('simpanVerifikasiTiang', muatan, tiketUbah());
  assert.deepStrictEqual([tanpaOp.http, tanpaOp.j.galat.some((x) => x.field === 'opId')], [422, true]);
});

// ---------------------------------------------------------------------------------------------------------------------------
// Task 5: foto satu paket dengan data, atomik
// ---------------------------------------------------------------------------------------------------------------------------

const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const fotoKirim = (buf) => ({ sha256: sha256Hex(buf), ukuranByte: buf.length, data: buf.toString('base64') });
function buatJpeg(lebar, tinggi, mutu = 85) {
  const f = garisMiring(path.join(dir, 'j-' + Math.random().toString(36).slice(2) + '.jpg'));
  phpKode(`$im = imagecreatetruecolor(${lebar}, ${tinggi}); imagefilledrectangle($im, 0, 0, ${lebar}, ${tinggi}, imagecolorallocate($im, 200, 120, 40));
    imagestring($im, 5, 20, 20, 'SiSi uji', imagecolorallocate($im, 255, 255, 255)); imagejpeg($im, '${f}', ${mutu});`);
  return fs.readFileSync(f);
}
const daftarBerkas = (sub = '') => {
  const akar = path.join(fotoDir, sub);
  if (!fs.existsSync(akar)) return [];
  const hasil = [];
  (function jalan(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) jalan(p); else hasil.push(garisMiring(path.relative(fotoDir, p))); } })(akar);
  return hasil.sort();
};
const barisFoto = (id) => JSON.parse(phpKode(`$p = new PDO('sqlite:${garisMiring(dbFile)}'); $p->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
  $q = $p->prepare('SELECT slot, path, sha256, bytes FROM tiang_foto WHERE pemilik_id = ? ORDER BY slot'); $q->execute(['${id}']); echo json_encode($q->fetchAll());`));
function kosongkanFoto() {
  fs.rmSync(fotoDir, { recursive: true, force: true });
}

/** Dunia + tiang awal 1001 siap Terverifikasi, tanpa foto di server. */
function siapFoto() {
  kosongkanFoto();
  const { w, seg, jalur } = duniaSimpan();
  semai(w);
  return { w, seg, t: jalur[0], muatan: { ...verifAwal(w, jalur[0], seg), revision: undefined } };
}

test('foto: Terverifikasi tanpa dua foto ditolak (kedua label), tidak menulis berkas maupun baris', { skip: SKIP }, async () => {
  const { t, muatan } = siapFoto();
  const sebelum = dumpTiang(t.tiangId).tiang;
  const r = await panggil('simpanVerifikasiTiang', { ...muatan, opId: opBaru(), foto: { TIANG: fotoKirim(buatJpeg(800, 600)) } }, tiketUbah());
  assert.strictEqual(r.http, 422);
  const pesan = r.j.galat.filter((x) => x.field === 'foto').map((x) => x.pesan).join(' | ');
  assert.match(pesan, /Foto Konstruksi SUTM wajib diisi/);
  assert.doesNotMatch(pesan, /Foto Full Tiang wajib/, 'foto yang dikirim dihitung');
  assert.deepStrictEqual(daftarBerkas(), [], 'tidak ada berkas');
  assert.deepStrictEqual(barisFoto(t.tiangId), []);
  assert.deepStrictEqual(dumpTiang(t.tiangId).tiang, sebelum, 'baris tiang tidak berubah');
});

test('foto: data + dua foto satu paket diterima; berkas, thumbnail, baris tiang_foto, kolom foto, sidik konfirmasi', { skip: SKIP }, async () => {
  const { t, muatan } = siapFoto();
  const a = buatJpeg(800, 600), b = buatJpeg(640, 480, 70);
  const r = await panggil('simpanVerifikasiTiang', { ...muatan, opId: opBaru(), foto: { TIANG: fotoKirim(a), KEPALA: fotoKirim(b) } }, tiketUbah());
  assert.strictEqual(r.http, 200, r.teks.slice(0, 300));
  assert.deepStrictEqual(r.j.data.tiang.foto, { TIANG: true, KEPALA: true });
  assert.strictEqual(r.j.data.tiang.statusVerifikasi, 'TERVERIFIKASI');
  assert.deepStrictEqual(r.j.data.foto.TIANG, { sha256: sha256Hex(a), bytes: a.length });
  assert.deepStrictEqual(r.j.data.foto.KEPALA, { sha256: sha256Hex(b), bytes: b.length });
  const rel = (slot, buf) => `PLS/${t.tiangId}_${slot}_${sha256Hex(buf).slice(0, 8)}.jpg`;
  assert.deepStrictEqual(daftarBerkas(), [rel('KEPALA', b), rel('KEPALA', b).replace('.jpg', '_k.jpg'), rel('TIANG', a), rel('TIANG', a).replace('.jpg', '_k.jpg')].sort());
  assert.deepStrictEqual(fs.readFileSync(path.join(fotoDir, rel('TIANG', a))), a, 'foto kecil disimpan apa adanya');
  assert.deepStrictEqual(barisFoto(t.tiangId).map((x) => [x.slot, x.path]), [['KEPALA', rel('KEPALA', b)], ['TIANG', rel('TIANG', a)]]);
  const db = dumpTiang(t.tiangId).tiang;
  assert.deepStrictEqual([db.foto_tiang_id, db.foto_kepala_id, db.revision], [rel('TIANG', a), rel('KEPALA', b), 2], 'revision naik sekali per simpan');
  assert.deepStrictEqual(r.j.data.tiang.kurang, [], 'lengkap = hijau');
});

test('foto: foto lama dihitung (kirim hanya satu foto baru, atau tanpa foto) dan penggantian membuang berkas lama', { skip: SKIP }, async () => {
  const { t, muatan } = siapFoto();
  const a = buatJpeg(800, 600), b = buatJpeg(640, 480, 70), c = buatJpeg(700, 500, 60);
  const perlu = { ...muatan, statusVerifikasi: 'PERLU_PERBAIKAN' };
  assert.strictEqual((await panggil('simpanVerifikasiTiang', { ...perlu, opId: opBaru(), foto: { TIANG: fotoKirim(a) } }, tiketUbah())).http, 200);
  const ver = await panggil('simpanVerifikasiTiang', { ...muatan, opId: opBaru(), foto: { KEPALA: fotoKirim(b) } }, tiketUbah());
  assert.strictEqual(ver.http, 200, 'foto TIANG lama + KEPALA baru = lengkap: ' + ver.teks.slice(0, 200));
  const tanpa = await panggil('simpanVerifikasiTiang', { ...muatan, ukuranTiang: '11 Meter 350 daN', opId: opBaru() }, tiketUbah());
  assert.strictEqual(tanpa.http, 200, 'tanpa foto baru, foto lama cukup');
  const ganti = await panggil('simpanVerifikasiTiang', { ...muatan, opId: opBaru(), foto: { TIANG: fotoKirim(c) } }, tiketUbah());
  assert.strictEqual(ganti.http, 200);
  const berkas = daftarBerkas();
  assert.ok(!berkas.some((f) => f.includes(sha256Hex(a).slice(0, 8))), 'berkas foto lama dibuang: ' + berkas.join(','));
  assert.ok(berkas.some((f) => f.includes(sha256Hex(c).slice(0, 8))));
  assert.strictEqual(barisFoto(t.tiangId).length, 2);
});

test('foto: ditolak (422, tidak ada yang ditulis) untuk sidik salah, ukuran tidak cocok, bukan JPEG, >2 MB, base64 rusak, slot asing', { skip: SKIP }, async () => {
  const { t, muatan } = siapFoto();
  const sebelum = dumpTiang(t.tiangId).tiang;
  const ok = buatJpeg(800, 600), lain = buatJpeg(640, 480, 70);
  const kasus = {
    'sidik salah': { TIANG: { ...fotoKirim(ok), sha256: sha256Hex(lain) }, KEPALA: fotoKirim(lain) },
    'ukuran tidak cocok': { TIANG: { ...fotoKirim(ok), ukuranByte: ok.length + 1 }, KEPALA: fotoKirim(lain) },
    'bukan JPEG': { TIANG: fotoKirim(Buffer.from('bukan gambar sama sekali')), KEPALA: fotoKirim(lain) },
    'lebih dari 2 MB': { TIANG: { sha256: 'a'.repeat(64), ukuranByte: 3 * 1024 * 1024, data: 'AAAA' }, KEPALA: fotoKirim(lain) },
    'base64 rusak': { TIANG: { ...fotoKirim(ok), data: '###bukan-base64###' }, KEPALA: fotoKirim(lain) },
    'slot asing': { TIANG: fotoKirim(ok), KEPALA: fotoKirim(lain), BELAKANG: fotoKirim(lain) },
    'JPEG terpotong': (() => { const b2 = ok.subarray(0, 200); return { TIANG: fotoKirim(b2), KEPALA: fotoKirim(lain) }; })(),
  };
  for (const [nama, foto] of Object.entries(kasus)) {
    const r = await panggil('simpanVerifikasiTiang', { ...muatan, opId: opBaru(), foto }, tiketUbah());
    assert.strictEqual(r.http, 422, nama + ': ' + r.teks.slice(0, 200));
    assert.ok(r.j.galat.some((x) => x.field === 'foto'), nama + ' → galat field foto');
  }
  assert.deepStrictEqual(daftarBerkas(), []);
  assert.deepStrictEqual(barisFoto(t.tiangId), []);
  assert.deepStrictEqual(dumpTiang(t.tiangId).tiang, sebelum);
});

test('foto: sisi panjang >1600 px diperkecil, thumbnail 320 px', { skip: SKIP }, async () => {
  const { t, muatan } = siapFoto();
  const besar = buatJpeg(2400, 1200), kecil = buatJpeg(800, 600);
  const r = await panggil('simpanVerifikasiTiang', { ...muatan, opId: opBaru(), foto: { TIANG: fotoKirim(besar), KEPALA: fotoKirim(kecil) } }, tiketUbah());
  assert.strictEqual(r.http, 200, r.teks.slice(0, 200));
  const ukuranBerkas = (rel) => JSON.parse(phpKode(`$i = getimagesize('${garisMiring(path.join(fotoDir, rel))}'); echo json_encode([$i[0], $i[1]]);`));
  const [fTiang] = barisFoto(t.tiangId).filter((x) => x.slot === 'TIANG');
  assert.deepStrictEqual(ukuranBerkas(fTiang.path), [1600, 800]);
  assert.deepStrictEqual(ukuranBerkas(fTiang.path.replace('.jpg', '_k.jpg')), [320, 160]);
  assert.strictEqual(r.j.data.foto.TIANG.sha256, sha256Hex(besar), 'sidik konfirmasi = sidik kiriman HP');
  assert.ok(r.j.data.foto.TIANG.bytes < besar.length * 2 && r.j.data.foto.TIANG.bytes === fTiang.bytes);
});

test('foto: transaksi gagal di tengah paket → tidak ada berkas baru, tidak ada baris, revisi tetap', { skip: SKIP }, async () => {
  const { t, muatan } = siapFoto();
  const sebelum = dumpTiang(t.tiangId);
  phpKode(`$p = new PDO('sqlite:${garisMiring(dbFile)}'); $p->exec("CREATE TRIGGER gagal_op BEFORE UPDATE ON tiang_op WHEN NEW.op_id LIKE 'op-gagal%' BEGIN SELECT RAISE(ABORT, 'uji gagal'); END");`);
  try {
    const r = await panggil('simpanVerifikasiTiang', { ...muatan, opId: 'op-gagal-' + Date.now(), foto: { TIANG: fotoKirim(buatJpeg(800, 600)), KEPALA: fotoKirim(buatJpeg(640, 480, 70)) } }, tiketUbah());
    assert.strictEqual(r.http, 500);
  } finally {
    phpKode(`$p = new PDO('sqlite:${garisMiring(dbFile)}'); $p->exec('DROP TRIGGER gagal_op');`);
  }
  assert.deepStrictEqual(daftarBerkas(), [], 'berkas baru dibuang');
  assert.deepStrictEqual(barisFoto(t.tiangId), []);
  assert.deepStrictEqual(dumpTiang(t.tiangId), sebelum, 'baris tiang (status, revisi, kolom foto) dan sirkuit tidak berubah');
  const ulang = await panggil('simpanVerifikasiTiang', { ...muatan, opId: opBaru(), foto: { TIANG: fotoKirim(buatJpeg(800, 600)), KEPALA: fotoKirim(buatJpeg(640, 480, 70)) } }, tiketUbah());
  assert.strictEqual(ulang.http, 200, 'sesudah gagal, kirim ulang berhasil');
});

test('foto: opId sama dua kali tidak menulis ulang berkas dan jawabannya sama', { skip: SKIP }, async () => {
  const { t, muatan } = siapFoto();
  const op = opBaru();
  const paket = { ...muatan, opId: op, foto: { TIANG: fotoKirim(buatJpeg(800, 600)), KEPALA: fotoKirim(buatJpeg(640, 480, 70)) } };
  const a = await panggil('simpanVerifikasiTiang', paket, tiketUbah());
  const mtime = daftarBerkas().map((f) => fs.statSync(path.join(fotoDir, f)).mtimeMs);
  const b = await panggil('simpanVerifikasiTiang', paket, tiketUbah());
  assert.deepStrictEqual(b.j.data, a.j.data);
  assert.deepStrictEqual(daftarBerkas().map((f) => fs.statSync(path.join(fotoDir, f)).mtimeMs), mtime);
  assert.strictEqual(barisFoto(t.tiangId).length, 2);
  assert.strictEqual(dumpTiang(t.tiangId).tiang.revision, 2);
});

test('foto: pemulung membuang berkas tanpa baris tiang_foto yang lebih tua dari 1 jam, menyisakan yang baru dan yang dipakai', { skip: SKIP }, async () => {
  const { t, muatan } = siapFoto();
  await panggil('simpanVerifikasiTiang', { ...muatan, opId: opBaru(), foto: { TIANG: fotoKirim(buatJpeg(800, 600)), KEPALA: fotoKirim(buatJpeg(640, 480, 70)) } }, tiketUbah());
  const dipakai = daftarBerkas();
  const yatimLama = path.join(fotoDir, 'PLS', 'yatim-lama.jpg'), yatimBaru = path.join(fotoDir, 'PLS', 'yatim-baru.jpg'), tmpLama = path.join(fotoDir, 'PLS', 'x.jpg.tmp-ab12');
  [yatimLama, yatimBaru, tmpLama].forEach((f) => fs.writeFileSync(f, 'x'));
  const dua = new Date(Date.now() - 2 * 3600 * 1000);
  [yatimLama, tmpLama].forEach((f) => fs.utimesSync(f, dua, dua));
  const A = garisMiring(API);
  const n = Number(phpKode(`require '${A}/_lib.php'; require '${A}/tiang_lib.php'; echo bersihkanYatim(db());`, { SISI_API_CONFIG: cfg }));
  assert.strictEqual(n, 2);
  assert.deepStrictEqual(daftarBerkas(), [...dipakai, 'PLS/yatim-baru.jpg'].sort());
  assert.strictEqual(barisFoto(t.tiangId).length, 2);
});

test('getFotoTiang: KECIL = thumbnail, PENUH = foto; belum ada = 404 FOTO_TIDAK_ADA; slot salah = 422', { skip: SKIP }, async () => {
  const { t, muatan } = siapFoto();
  const a = buatJpeg(800, 600), b = buatJpeg(640, 480, 70);
  assert.deepStrictEqual((({ http, j }) => [http, j.kode])(await panggil('getFotoTiang', { tiangId: t.tiangId, slot: 'TIANG' }, tiketAdmin())), [404, 'FOTO_TIDAK_ADA']);
  await panggil('simpanVerifikasiTiang', { ...muatan, opId: opBaru(), foto: { TIANG: fotoKirim(a), KEPALA: fotoKirim(b) } }, tiketUbah());
  const penuh = await panggil('getFotoTiang', { tiangId: t.tiangId, slot: 'TIANG', ukuran: 'PENUH' }, tiketAdmin());
  assert.deepStrictEqual([penuh.http, penuh.j.data.kecil, penuh.j.data.mime, penuh.j.data.slot], [200, false, 'image/jpeg', 'TIANG']);
  assert.deepStrictEqual(Buffer.from(penuh.j.data.data, 'base64'), a);
  const kecil = await panggil('getFotoTiang', { tiangId: t.tiangId, slot: 'KEPALA' }, tiketAdmin());
  assert.strictEqual(kecil.j.data.kecil, true);
  assert.ok(Buffer.from(kecil.j.data.data, 'base64').subarray(0, 2).equals(Buffer.from([0xff, 0xd8])));
  assert.ok(kecil.j.data.ukuranByte < b.length, 'thumbnail lebih kecil dari foto');
  assert.strictEqual((await panggil('getFotoTiang', { tiangId: t.tiangId, slot: 'BELAKANG' }, tiketAdmin())).http, 422);
  assert.strictEqual((await panggil('getFotoTiang', { tiangId: '../../etc/passwd', slot: 'TIANG' }, tiketAdmin())).http, 422);
});

// ---------------------------------------------------------------------------------------------------------------------------
// Task 6: simpanSegmen / simpanSwitching = Apps Script; foto switching satu paket
// ---------------------------------------------------------------------------------------------------------------------------

BOOL_KOLOM.add('titik_hubung'); BOOL_KOLOM.add('bisa_trip'); BOOL_KOLOM.add('catat_gangguan');
BOOL_KOLOM.add('baca_arus'); BOOL_KOLOM.add('baca_tegangan'); BOOL_KOLOM.add('terhubung_scada');

function dumpBaris(tabel, kolomId, id) {
  return JSON.parse(phpKode(`$p = new PDO('sqlite:${garisMiring(dbFile)}'); $p->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $q = $p->prepare('SELECT * FROM ${tabel} WHERE ${kolomId} = ?'); $q->execute(['${id}']); echo json_encode($q->fetch());`));
}

/** Satu muatan ke Apps Script (dunia w) dan ke PHP (DB disemai dari w sebelumnya): berhasil sama atau ditolak sama. */
async function bandingEntitas(w, { aksi, fnJs, tabel, sheet, kolomId, kunciJawab, abai = [] }, muatan, { httpTolak = 422, revisiTetap = false } = {}) {
  // revision memakai nilai sheet saat ini (beberapa simpan berurutan dalam satu dunia), kecuali sengaja basi
  const idMuatan = muatan[kolomId.replace(/_(\w)/g, (_, c) => c.toUpperCase())];
  const baris0 = idMuatan && !revisiTetap ? sheetBaris(w, sheet, (b) => String(b[kolomId]) === idMuatan)[0] : null;
  if (baris0) muatan = { ...muatan, revision: Number(baris0.revision) };
  semai(w);
  let harapan = null, kodeJs = null;
  try { harapan = j(w.g[fnJs](w.admin, muatan, 'MOBILE')); } catch (e) { kodeJs = e.kode || String(e); }
  const r = await panggil(aksi, { ...muatan, opId: opBaru() }, tiketUbah());
  if (kodeJs) {
    if (process.env.DEBUG_TIANG) console.log('DEBUG ditolak', aksi, kodeJs, JSON.stringify(muatan).slice(0, 200));
    assert.strictEqual(r.http, httpTolak, aksi + ': JS menolak (' + kodeJs + '), PHP: ' + r.teks.slice(0, 300));
    return { ditolak: true, kodeJs, r };
  }
  assert.strictEqual(r.http, 200, aksi + ': JS berhasil, PHP: ' + r.teks.slice(0, 400));
  const bersih = (o) => { const x = JSON.parse(JSON.stringify(o)); abai.forEach((k) => { delete x[k]; }); return x; };
  assert.deepStrictEqual(bersih(r.j.data[kunciJawab]), bersih(harapan[kunciJawab]), 'respons ' + kunciJawab);
  const id = harapan[kunciJawab][kolomId.replace(/_(\w)/g, (_, c) => c.toUpperCase())];
  const sh = sheetBaris(w, sheet, (b) => String(b[kolomId]) === id)[0];
  assert.deepStrictEqual(kanon(dumpBaris(tabel, kolomId, id)), kanon(sh), 'baris ' + sheet);
  return { ditolak: false, dapat: r.j.data, id };
}
const SGM = { aksi: 'simpanSegmen', fnJs: 'simpanSegmen_', tabel: 'tiang_segmen', sheet: 'db_Segmen', kolomId: 'segmen_id', kunciJawab: 'segmen' };
const SWC = { aksi: 'simpanSwitching', fnJs: 'simpanSwitching_', tabel: 'tiang_switching', sheet: 'db_Switching', kolomId: 'switching_id', kunciJawab: 'switching', abai: ['verifikasiTerakhir', 'diubahPada'] };
const sgmDasar = (o = {}) => ({ nama: 'Segmen Uji', penyulang: 'toboali 1', sectionId: 's2', awalJenis: 'SWITCHING', awalNama: 'LBS Air Bara', awalSwitchingId: 'SWC-0001', akhirJenis: 'GARDU', akhirNama: 'TB0099', ...o });
const swcDasar = (o = {}) => ({ jenis: 'PMT', nama: 'PMT Uji', penyulang: 'TOBOALI 1', posisiNormal: 'NC', statusOperasi: 'OPERASI', koordinat: '-3.0001, 106.5001', ...o });

test('segmen: baru, urutan otomatis +10, ubah (revision), nonaktif, kabel tanah LENGKAP / KURANG = Apps Script', { skip: SKIP }, async () => {
  const w = dunia();
  const a = await bandingEntitas(w, SGM, sgmDasar());
  assert.strictEqual(a.id, 'SGM-0001');
  const b = w.segmen();   // baris pertama (SGM-0001) lewat Apps Script agar ada data lama
  const ubah = await bandingEntitas(w, SGM, sgmDasar({ segmenId: b.segmenId, revision: b.revision, nama: 'Segmen Diganti', urutan: 25, catatan: 'baris 1\nbaris 2' }));
  assert.strictEqual(ubah.dapat.segmen.nama, 'Segmen Diganti');
  assert.strictEqual((await bandingEntitas(w, SGM, sgmDasar({ segmenId: b.segmenId, revision: b.revision, nama: 'Segmen Diganti', aktif: false }))).dapat.segmen.aktif, false);
  const kabel = await bandingEntitas(w, SGM, sgmDasar({ nama: 'Kabel A', jenisSegmen: 'KABEL_TANAH', jenisKabel: 'N2XSEBY - 1 CORE', ukuranMm2: 240, panjangKabelM: 350.5 }));
  assert.strictEqual(kabel.dapat.segmen.statusData, 'LENGKAP');
  const kurang = await bandingEntitas(w, SGM, sgmDasar({ nama: 'Kabel B', jenisSegmen: 'KABEL_TANAH', jenisKabel: 'N2XSEBY - 1 CORE' }));
  assert.strictEqual(kurang.dapat.segmen.statusData, 'KURANG');
});

test('segmen: ditolak di Apps Script = ditolak di PHP (nama ganda, section beda penyulang, switching / induk tidak ada, kabel tanah berisi tiang, revision basi)', { skip: SKIP }, async () => {
  const w = dunia();
  const b = w.segmen();
  w.awal(b.segmenId);   // segmen b kini berisi tiang
  const kasus = {
    'nama ganda di section sama': sgmDasar({ nama: b.nama }),
    'section beda penyulang': sgmDasar({ nama: 'X1', sectionId: 's3' }),
    'penyulang asing': sgmDasar({ nama: 'X2', penyulang: 'ASING' }),
    'section tak ada': sgmDasar({ nama: 'X3', sectionId: 'tidak-ada' }),
    'switching awal tak ada': sgmDasar({ nama: 'X4', awalSwitchingId: 'SWC-9999' }),
    'induk segmen tak ada': sgmDasar({ nama: 'X5', indukSegmenId: 'SGM-9999' }),
    'induk segmen diri sendiri': sgmDasar({ segmenId: b.segmenId, revision: b.revision, indukSegmenId: b.segmenId, nama: b.nama }),
    'kabel tanah berisi tiang': sgmDasar({ segmenId: b.segmenId, revision: b.revision, nama: b.nama, jenisSegmen: 'KABEL_TANAH', jenisKabel: 'N2XSEBY - 1 CORE', ukuranMm2: 240, panjangKabelM: 10 }),
    'jenis kabel tak dikenal': sgmDasar({ nama: 'X6', jenisSegmen: 'KABEL_TANAH', jenisKabel: 'KABEL ASING' }),
    'nama kosong': sgmDasar({ nama: '' }),
  };
  for (const [nama, m] of Object.entries(kasus)) assert.ok((await bandingEntitas(w, SGM, m)).ditolak, nama + ' harus ditolak');
  const basi = await bandingEntitas(w, SGM, sgmDasar({ segmenId: b.segmenId, revision: 99, nama: b.nama }), { httpTolak: 409, revisiTetap: true });
  assert.ok(basi.ditolak && basi.r.j.kode === 'KONFLIK_REVISION');
});

test('switching: PMT / LBS berhulu / FCO / titik hubung / ubah / nonaktif = Apps Script (proteksi hulu ikut dihitung)', { skip: SKIP }, async () => {
  const w = dunia();
  const pmt = await bandingEntitas(w, SWC, swcDasar());
  assert.strictEqual(pmt.dapat.switching.bisaTrip, true, 'PMT bisa trip bawaan');
  const pmtJs = j(w.g.simpanSwitching_(w.admin, swcDasar({ nama: 'PMT Sumber' }), 'MOBILE')).switching;   // SWC-0002 ada di dunia
  const lbs = await bandingEntitas(w, SWC, swcDasar({ jenis: 'LBS', nama: 'LBS Hilir', posisiNormal: 'NO', switchingHuluId: pmtJs.switchingId }));
  assert.strictEqual(lbs.dapat.switching.proteksiHuluId, pmtJs.switchingId);
  const fco = await bandingEntitas(w, SWC, swcDasar({ jenis: 'FCO', nama: 'FCO Cabang', fungsiFco: 'CABANG', fuseTipe: 'K', fuseRating: '10A' }));
  assert.strictEqual(fco.dapat.switching.fuseTipe, 'K');
  const hubung = await bandingEntitas(w, SWC, swcDasar({ jenis: 'LBS', nama: 'LBS Hubung', titikHubung: true, penyulangSisiB: 'payung', tiangSisiA: '1001', tiangSisiB: '1002', terhubungScada: true, kodeRtu: 'RTU-1', mediaKomunikasi: 'GSM' }));
  assert.strictEqual(hubung.dapat.switching.penyulangSisiB, 'PAYUNG');
  const ubah = await bandingEntitas(w, SWC, swcDasar({ switchingId: pmtJs.switchingId, revision: pmtJs.revision, nama: 'PMT Sumber Baru', statusVerifikasi: 'PERLU_PERBAIKAN', catatan: 'cek ulang' }));
  assert.strictEqual(ubah.dapat.switching.statusVerifikasi, 'PERLU_PERBAIKAN');
  assert.strictEqual((await bandingEntitas(w, SWC, swcDasar({ switchingId: pmtJs.switchingId, revision: pmtJs.revision, nama: 'PMT Sumber Baru', aktif: false }))).dapat.switching.aktif, false);
});

test('switching: ditolak di Apps Script = ditolak di PHP (nama ganda, penyulang / section salah, hulu diri sendiri / berputar / tak ada, sisi B sama, revision basi)', { skip: SKIP }, async () => {
  const w = dunia();
  const a = j(w.g.simpanSwitching_(w.admin, swcDasar({ nama: 'PMT A' }), 'MOBILE')).switching;
  const b = j(w.g.simpanSwitching_(w.admin, swcDasar({ nama: 'PMT B', switchingHuluId: a.switchingId }), 'MOBILE')).switching;
  const kasus = {
    'nama ganda': swcDasar({ nama: 'pmt a' }),
    'penyulang asing': swcDasar({ nama: 'Z1', penyulang: 'ASING' }),
    'section beda penyulang': swcDasar({ nama: 'Z2', sectionId: 's3' }),
    'hulu tak ada': swcDasar({ nama: 'Z3', switchingHuluId: 'SWC-9999' }),
    'hulu diri sendiri': swcDasar({ switchingId: a.switchingId, revision: a.revision, nama: 'PMT A', switchingHuluId: a.switchingId }),
    'rantai hulu berputar': swcDasar({ switchingId: a.switchingId, revision: a.revision, nama: 'PMT A', switchingHuluId: b.switchingId }),
    'sisi B sama dengan penyulang': swcDasar({ nama: 'Z4', titikHubung: true, penyulangSisiB: 'TOBOALI 1' }),
    'sisi B asing': swcDasar({ nama: 'Z5', titikHubung: true, penyulangSisiB: 'ASING' }),
    'tanpa koordinat': swcDasar({ nama: 'Z6', koordinat: undefined }),
    'jenis asing': swcDasar({ nama: 'Z7', jenis: 'XYZ' }),
  };
  for (const [nama, m] of Object.entries(kasus)) assert.ok((await bandingEntitas(w, SWC, JSON.parse(JSON.stringify(m)))).ditolak, nama + ' harus ditolak');
  const basi = await bandingEntitas(w, SWC, swcDasar({ switchingId: a.switchingId, revision: 99, nama: 'PMT A' }), { httpTolak: 409, revisiTetap: true });
  assert.ok(basi.ditolak && basi.r.j.kode === 'KONFLIK_REVISION');
});

test('switching + foto: tiga foto satu paket (atomik), foto kecil / penuh lewat getFotoSwitching, tanpa foto tetap boleh', { skip: SKIP }, async () => {
  kosongkanFoto();
  const w = dunia();
  semai(w);
  const u = buatJpeg(800, 600), n = buatJpeg(640, 480, 70);
  const r = await panggil('simpanSwitching', { ...swcDasar(), opId: opBaru(), foto: { UNIT: fotoKirim(u), NAMEPLATE: fotoKirim(n) } }, tiketUbah());
  assert.strictEqual(r.http, 200, r.teks.slice(0, 300));
  const id = r.j.data.switching.switchingId;
  assert.deepStrictEqual(r.j.data.switching.foto, { UNIT: true, NAMEPLATE: true, KONTROLER: false });
  assert.deepStrictEqual(r.j.data.foto.UNIT, { sha256: sha256Hex(u), bytes: u.length });
  assert.ok(daftarBerkas('Switching').length === 4, 'dua foto + dua thumbnail: ' + daftarBerkas().join(','));
  const penuh = await panggil('getFotoSwitching', { switchingId: id, slot: 'UNIT', ukuran: 'PENUH' }, tiketAdmin());
  assert.deepStrictEqual(Buffer.from(penuh.j.data.data, 'base64'), u);
  assert.strictEqual((await panggil('getFotoSwitching', { switchingId: id, slot: 'KONTROLER' }, tiketAdmin())).j.kode, 'FOTO_TIDAK_ADA');
  assert.strictEqual((await panggil('getFotoSwitching', { switchingId: id, slot: 'TIANG' }, tiketAdmin())).http, 422);
  // foto rusak = seluruh paket ditolak, data tidak tersimpan
  const bad = await panggil('simpanSwitching', { ...swcDasar({ nama: 'PMT Foto Rusak' }), opId: opBaru(), foto: { UNIT: { ...fotoKirim(u), sha256: sha256Hex(n) } } }, tiketUbah());
  assert.strictEqual(bad.http, 422);
  const adaNama = JSON.parse(phpKode(`$p = new PDO('sqlite:${garisMiring(dbFile)}'); echo $p->query("SELECT COUNT(*) FROM tiang_switching WHERE nama = 'PMT Foto Rusak'")->fetchColumn();`));
  assert.strictEqual(adaNama, 0);
  // opId sama = tidak menggandakan baris
  const op = opBaru();
  const s1 = await panggil('simpanSwitching', { ...swcDasar({ nama: 'PMT Idempoten' }), opId: op }, tiketUbah());
  const s2 = await panggil('simpanSwitching', { ...swcDasar({ nama: 'PMT Idempoten' }), opId: op }, tiketUbah());
  assert.deepStrictEqual(s2.j.data, s1.j.data);
});

// ---------------------------------------------------------------------------------------------------------------------------
// Task 6: impor.php + impor spreadsheet (Apps Script asli -> PHP)
// ---------------------------------------------------------------------------------------------------------------------------

async function kirimTanda(jalur, isi, opsi = {}) {
  const body = JSON.stringify(isi);
  const waktu = String(opsi.waktu ?? sekarang());
  const sha = crypto.createHash('sha256').update(body).digest('hex');
  const tanda = opsi.tanda ?? crypto.createHmac('sha256', RHS).update(waktu + '.' + sha).digest('hex');
  const r = await fetch(DASAR + '/' + jalur, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SiSi-Waktu': waktu, 'X-SiSi-Tanda': tanda }, body });
  return { http: r.status, j: await r.json() };
}
const hitungTabel = (tabel) => Number(phpKode(`$p = new PDO('sqlite:${garisMiring(dbFile)}'); echo $p->query('SELECT COUNT(*) FROM ${tabel}')->fetchColumn();`));
const kosongSemua = () => phpKode(`require '${garisMiring(API)}/_lib.php'; require '${garisMiring(API)}/tiang_lib.php'; $pdo = db();
  foreach (daftarTabelTiang() as $t) { if (!in_array($t, ['tiang_laju', 'tiang_cabut'], true)) $pdo->exec("DELETE FROM $t"); }`, { SISI_API_CONFIG: cfg });

test('impor.php: upsert tiang idempoten, urutan baris, perubahan menimpa; tanda HMAC wajib', { skip: SKIP }, async () => {
  kosongSemua();
  const baris = [{ No: 1, tiang_id: '1001', nama: 'PLS0001', kode_nama_aset: 'PLS', lat_aset: -3, lng_aset: 106.5, aktif: true, revision: 1 },
    { No: 2, tiang_id: '1002', nama: 'PLS0002', kode_nama_aset: 'PLS', lat_aset: '-3.0005', lng_aset: '106.5005', aktif: 'TRUE', revision: 1 },
    { tiang_id: '', nama: 'baris kosong' }];
  assert.strictEqual((await kirimTanda('impor.php', { jenis: 'tabel', tabel: 'tiang_tiang', baris }, { tanda: 'a'.repeat(64) })).http, 401);
  const a = await kirimTanda('impor.php', { jenis: 'tabel', tabel: 'tiang_tiang', baris });
  assert.deepStrictEqual([a.http, a.j.data.ditulis, a.j.data.ditolak], [200, 2, []], 'baris kosong dilewati tanpa laporan');
  const b = await kirimTanda('impor.php', { jenis: 'tabel', tabel: 'tiang_tiang', baris: [{ ...baris[0], nama: 'PLS0001 baru' }, baris[1]] });
  assert.strictEqual(b.j.data.ditulis, 2);
  assert.strictEqual(hitungTabel('tiang_tiang'), 2, 'tidak ganda');
  const db = dumpTiang('1001').tiang;
  assert.deepStrictEqual([db.nama, db.urut, db.aktif, db.lat_aset], ['PLS0001 baru', 1, 1, -3]);
  assert.strictEqual(dumpTiang('1002').tiang.urut, 2);
  // tanpa No: urutan = urutAwal + indeks
  const c = await kirimTanda('impor.php', { jenis: 'tabel', tabel: 'tiang_sirkuit', baris: [{ sirkuit_id: 's-1', tiang_id: '1001' }, { sirkuit_id: 's-2', tiang_id: '1001' }], urutAwal: 301 });
  assert.strictEqual(c.j.data.ditulis, 2);
  assert.deepStrictEqual(dumpTiang('1001').sirkuit.map((x) => x.urut), [301, 302]);
});

test('impor.php: kolom kunci bukan teks utuh (angka, tanggal, notasi ilmiah) DITOLAK dengan alasan; tabel / jumlah baris tak sah 400', { skip: SKIP }, async () => {
  kosongSemua();
  const r = await kirimTanda('impor.php', { jenis: 'tabel', tabel: 'tiang_tiang', baris: [
    { tiang_id: 1001, nama: 'angka' }, { tiang_id: '1.2E+15', nama: 'ilmiah+' }, { tiang_id: '1.2E15', nama: 'ilmiah' },
    { tiang_id: '2026-11-11T00:00:00.000Z', nama: 'tanggal' }, { tiang_id: 'ok-1', nama: 'sah' }, { tiang_id: 'x'.repeat(41), nama: 'kepanjangan' }] });
  assert.strictEqual(r.http, 200);
  assert.strictEqual(r.j.data.ditulis, 1);
  assert.deepStrictEqual(r.j.data.ditolak.map((x) => x.baris), [1, 2, 3, 4, 6]);
  assert.ok(r.j.data.ditolak.every((x) => /bukan teks utuh/.test(x.alasan)), 'alasan menyebut format kolom');
  assert.strictEqual(hitungTabel('tiang_tiang'), 1);
  assert.strictEqual((await kirimTanda('impor.php', { jenis: 'tabel', tabel: 'tiang_laju', baris: [] })).http, 400);
  assert.strictEqual((await kirimTanda('impor.php', { jenis: 'tabel', tabel: 'tiang_tiang', baris: Array.from({ length: 501 }, (_, i) => ({ tiang_id: 'a' + i })) })).http, 400);
  assert.strictEqual((await kirimTanda('impor.php', { jenis: 'asing' })).http, 400);
});

test('impor.php foto: foto lama masuk tanpa menaikkan revision; sidik sama = sudah; foto_ada; tiang tak ada 404; sidik salah 422', { skip: SKIP }, async () => {
  kosongSemua();
  kosongkanFoto();
  await kirimTanda('impor.php', { jenis: 'tabel', tabel: 'tiang_tiang', baris: [{ tiang_id: '1001', nama: 'PLS0001', kode_nama_aset: 'PLS', aktif: true, revision: 7 }] });
  await kirimTanda('impor.php', { jenis: 'tabel', tabel: 'tiang_switching', baris: [{ switching_id: 'SWC-0001', nama: 'LBS', aktif: true, revision: 3 }] });
  const a = buatJpeg(800, 600);
  const kirim = (o) => kirimTanda('impor.php', { jenis: 'foto', pemilik: 'TIANG', id: '1001', slot: 'TIANG', ...fotoKirim(a), ...o });
  const r1 = await kirim();
  assert.deepStrictEqual([r1.http, r1.j.data.sudah, r1.j.data.sha256], [200, false, sha256Hex(a)]);
  assert.match(r1.j.data.path, /^PLS\/1001_TIANG_[0-9a-f]{8}\.jpg$/);
  const db = dumpTiang('1001').tiang;
  assert.deepStrictEqual([db.revision, db.foto_tiang_id], [7, r1.j.data.path], 'revision tetap, kolom foto menunjuk berkas');
  assert.strictEqual((await kirim()).j.data.sudah, true);
  const sw = await kirimTanda('impor.php', { jenis: 'foto', pemilik: 'SWITCHING', id: 'SWC-0001', slot: 'UNIT', ...fotoKirim(a) });
  assert.match(sw.j.data.path, /^Switching\/SWC-0001_UNIT_/);
  assert.strictEqual(dumpBaris('tiang_switching', 'switching_id', 'SWC-0001').revision, 3);
  assert.deepStrictEqual((await kirimTanda('impor.php', { jenis: 'foto_ada', pemilik: 'TIANG' })).j.data.ada, ['1001|TIANG']);
  assert.deepStrictEqual((await panggil('getFotoTiang', { tiangId: '1001', slot: 'TIANG', ukuran: 'PENUH' }, tiketAdmin())).j.data.ukuranByte > 0, true);
  assert.strictEqual((await kirim({ id: '9999' })).http, 404);
  assert.strictEqual((await kirim({ sha256: sha256Hex(Buffer.from('lain')) })).http, 422);
  assert.strictEqual((await kirim({ slot: 'BELAKANG' })).http, 400);
});

test('impor spreadsheet: Apps Script asli mengimpor dunia uji ke PHP, lalu semua aksi baca sama dengan Apps Script', { skip: SKIP }, async () => {
  kosongSemua();
  const w = duniaTerisi();
  w.g.PropertiesService.getScriptProperties().setProperty('MYSQL_API_URL', 'https://contoh.id/sisi-api');
  w.g.PropertiesService.getScriptProperties().setProperty('MYSQL_API_SECRET', RHS);
  const dikirim = [];
  w.g.UrlFetchApp = { fetch: (url, o) => {
    const p = url.replace('https://contoh.id/sisi-api', DASAR);
    dikirim.push(url.replace('https://contoh.id/sisi-api', ''));
    const args = ['-s', '-o', '-', '-w', '\n%{http_code}', '-X', (o.method || 'get').toUpperCase(), p];
    Object.entries(o.headers || {}).forEach(([k, v]) => args.push('-H', k + ': ' + v));
    if (o.payload) args.push('-H', 'Content-Type: application/json', '--data-binary', '@-');
    const out = execFileSync('curl', args, { input: o.payload || '', maxBuffer: 64 * 1024 * 1024 }).toString();
    const i = out.lastIndexOf('\n');
    return { getResponseCode: () => Number(out.slice(i + 1)), getContentText: () => out.slice(0, i) };
  } };
  const h = j(w.g.imporTiangKeHostinger_({}));
  assert.strictEqual(h.selesai, true);
  assert.deepStrictEqual(h.ditolak, [], 'tidak ada baris ditolak');
  assert.ok(dikirim.every((x) => x === '/impor.php'));
  assert.strictEqual(w.g.PropertiesService.getScriptProperties().getProperty('TIANG_IMPOR_KEMAJUAN'), null, 'kemajuan dibersihkan');
  Object.entries(h.tabel).forEach(([t, x]) => { if (x.total) assert.strictEqual(hitungTabel(t), x.total, t + ' jumlah baris sama'); });
  for (const a of ['getVerifikasiTiang', 'getPetaTiang', 'getSegmen', 'getMasterSwitching']) await samaDenganAppsScript(w, a);
  await samaDenganAppsScript(w, 'getTiangJalur', { kode: 'PLS' });
  // impor ulang = idempoten
  j(w.g.imporTiangKeHostinger_({ ulang: true }));
  Object.entries(h.tabel).forEach(([t, x]) => { if (x.total) assert.strictEqual(hitungTabel(t), x.total, t + ' tidak ganda'); });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Task 7: ekspor.php (tarik ke Sheet, arsip foto Drive)
// ---------------------------------------------------------------------------------------------------------------------------

test('ekspor.php tabel: halaman keyset (urut, id) tanpa duplikat / lompatan, kolom Sheet + No, NULL = kosong, aktif = boolean; tanda HMAC wajib', { skip: SKIP }, async () => {
  kosongSemua();
  const baris = Array.from({ length: 5 }, (_, i) => ({ No: i + 1, tiang_id: 'T' + (i + 1), nama: 'Tiang ' + (i + 1), lat_aset: -3 - i / 1000, aktif: i !== 3, revision: 1 }));
  baris.push({ No: 5, tiang_id: 'T0', nama: 'urut sama dengan T5, id lebih kecil', aktif: true });
  await kirimTanda('impor.php', { jenis: 'tabel', tabel: 'tiang_tiang', baris });
  assert.strictEqual((await kirimTanda('ekspor.php', { jenis: 'tabel', tabel: 'tiang_tiang' }, { tanda: 'a'.repeat(64) })).http, 401);
  let kursor = null, semua = [], halaman = 0;
  for (;;) {
    const r = await kirimTanda('ekspor.php', { jenis: 'tabel', tabel: 'tiang_tiang', kursor, batas: 2 });
    assert.strictEqual(r.http, 200);
    semua = semua.concat(r.j.data.baris);
    halaman++;
    assert.strictEqual(r.j.data.total, 6);
    if (r.j.data.selesai) { assert.strictEqual(r.j.data.kursor, null); break; }
    kursor = r.j.data.kursor;
  }
  assert.strictEqual(halaman, 3);
  assert.deepStrictEqual(semua.map((b) => b.tiang_id), ['T1', 'T2', 'T3', 'T4', 'T0', 'T5'], 'urut lalu id; tanpa duplikat');
  assert.deepStrictEqual(semua.map((b) => b.No), [1, 2, 3, 4, 5, 5]);
  const t4 = semua.find((b) => b.tiang_id === 'T4');
  assert.deepStrictEqual([t4.aktif, t4.lat_aset, t4.assetnum_lain, t4.diubah_pada], [false, -3.003, '', ''], 'boolean, angka, NULL = ""');
  assert.deepStrictEqual(Object.keys(t4).slice(0, 3), ['No', 'tiang_id', 'assetnum_lain'], 'urutan kolom = header Sheet');
  assert.strictEqual((await kirimTanda('ekspor.php', { jenis: 'tabel', tabel: 'tiang_laju' })).http, 400);
  assert.strictEqual((await kirimTanda('ekspor.php', { jenis: 'tabel', tabel: 'tiang_tiang', kursor: { urut: 'x', id: 1 } })).http, 400);
  assert.strictEqual((await kirimTanda('ekspor.php', { jenis: 'asing' })).http, 400);
});

test('ekspor.php foto: daftar belum diarsip (+lewati), unduh, tandai (sidik harus sama), kolom foto_*_id berganti id Drive, ruang', { skip: SKIP }, async () => {
  kosongSemua();
  kosongkanFoto();
  await kirimTanda('impor.php', { jenis: 'tabel', tabel: 'tiang_tiang', baris: [{ tiang_id: '1001', nama: 'PLS0001', kode_nama_aset: 'PLS', aktif: true }] });
  await kirimTanda('impor.php', { jenis: 'tabel', tabel: 'tiang_switching', baris: [{ switching_id: 'SWC-0001', nama: 'LBS', aktif: true }] });
  const a = buatJpeg(800, 600), b = buatJpeg(640, 480, 70);
  await kirimTanda('impor.php', { jenis: 'foto', pemilik: 'TIANG', id: '1001', slot: 'TIANG', ...fotoKirim(a) });
  await kirimTanda('impor.php', { jenis: 'foto', pemilik: 'SWITCHING', id: 'SWC-0001', slot: 'UNIT', ...fotoKirim(b) });
  const belum = (o = {}) => kirimTanda('ekspor.php', { jenis: 'foto_belum_arsip', ...o }).then((r) => r.j.data);
  assert.deepStrictEqual((await belum()).foto.map((x) => [x.pemilik, x.id, x.slot, x.sha256]), [['TIANG', '1001', 'TIANG', sha256Hex(a)], ['SWITCHING', 'SWC-0001', 'UNIT', sha256Hex(b)]], 'dua foto, urut waktu dibuat (TIANG diimpor lebih dulu)');
  const dua = await belum({ batas: 1 });
  assert.deepStrictEqual([dua.foto.length, dua.sisa], [1, 2]);
  assert.strictEqual((await belum({ batas: 1, lewati: 1 })).foto[0].id !== dua.foto[0].id, true, 'lewati melompati yang pertama');
  const u = await kirimTanda('ekspor.php', { jenis: 'foto_unduh', pemilik: 'TIANG', id: '1001', slot: 'TIANG' });
  assert.deepStrictEqual([u.j.data.folder, u.j.data.sha256, u.j.data.ukuranByte], ['PLS', sha256Hex(a), a.length]);
  assert.deepStrictEqual(Buffer.from(u.j.data.data, 'base64'), a);
  assert.strictEqual((await kirimTanda('ekspor.php', { jenis: 'foto_unduh', pemilik: 'SWITCHING', id: 'SWC-0001', slot: 'UNIT' })).j.data.folder, 'Switching');
  assert.strictEqual((await kirimTanda('ekspor.php', { jenis: 'foto_unduh', pemilik: 'TIANG', id: '1001', slot: 'KEPALA' })).j.kode, 'FOTO_TIDAK_ADA');
  const tandai = (o) => kirimTanda('ekspor.php', { jenis: 'tandai_arsip', pemilik: 'TIANG', id: '1001', slot: 'TIANG', sha256: sha256Hex(a), drive_file_id: 'drive1234567890', ...o });
  assert.strictEqual((await tandai({ sha256: sha256Hex(b) })).j.data.ditandai, false, 'sidik beda = foto diganti = jangan ditandai');
  assert.strictEqual((await tandai({ drive_file_id: 'bukan sah!' })).http, 400);
  assert.strictEqual((await tandai()).j.data.ditandai, true);
  assert.deepStrictEqual((await belum()).foto.map((x) => x.id), ['SWC-0001']);
  const tabel = (await kirimTanda('ekspor.php', { jenis: 'tabel', tabel: 'tiang_tiang' })).j.data.baris[0];
  assert.strictEqual(tabel.foto_tiang_id, 'drive1234567890', 'sesudah arsip, kolom foto = id berkas Drive');
  const ruang = (await kirimTanda('ekspor.php', { jenis: 'ruang' })).j.data;
  assert.deepStrictEqual([ruang.foto_berkas, ruang.belum_arsip, ruang.foto_bytes > 0], [2, 1, true]);
});

/** Hubungkan Apps Script dunia uji [w] ke server PHP uji lewat curl (sinkron), dengan MYSQL_API_* + TIANG_API_URL. */
function pasangCurl(w) {
  const p = w.g.PropertiesService.getScriptProperties();
  p.setProperty('MYSQL_API_URL', 'https://contoh.id/sisi-api');
  p.setProperty('MYSQL_API_SECRET', RHS);
  p.setProperty('TIANG_API_URL', 'https://contoh.id/sisi-api');
  w.g.UrlFetchApp = { fetch: (url, o) => {
    const args = ['-s', '-o', '-', '-w', '\n%{http_code}', '-X', (o.method || 'get').toUpperCase(), url.replace('https://contoh.id/sisi-api', DASAR)];
    Object.entries(o.headers || {}).forEach(([k, v]) => args.push('-H', k + ': ' + v));
    if (o.payload) args.push('-H', 'Content-Type: application/json', '--data-binary', '@-');
    const out = execFileSync('curl', args, { input: o.payload || '', maxBuffer: 64 * 1024 * 1024 }).toString();
    const i = out.lastIndexOf('\n');
    return { getResponseCode: () => Number(out.slice(i + 1)), getContentText: () => out.slice(0, i) };
  } };
}

/** Baris sheet bentuk kanonik LENGKAP (termasuk No dan waktu), baris kosong dibuang. */
function barisPenuh(w, sheet) {
  return sheetBaris(w, sheet, (b) => Object.values(b).some((v) => v !== '' && v !== null && v !== undefined)).map((b) => {
    const o = {};
    Object.keys(b).sort().forEach((k) => {
      let v = b[k];
      if (v === null || v === undefined) v = '';
      if (v === true || v === 'TRUE') v = '1'; else if (v === false || v === 'FALSE') v = '0';
      else if (typeof v === 'number') v = String(v);
      else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) v = String(Number(v.trim()));
      o[k] = typeof v === 'string' ? v.trim() : v;
    });
    return o;
  });
}

test('tarik ujung ke ujung: dunia pertama diimpor ke PHP, dunia kedua menarik dan menjadi SAMA dengan dunia pertama (empat tab, termasuk urutan baris)', { skip: SKIP }, async () => {
  kosongSemua();
  const w1 = duniaTerisi();
  pasangCurl(w1);
  assert.strictEqual(j(w1.g.imporTiangKeHostinger_({})).selesai, true);
  const w2 = dunia();   // dunia lain: isi tab tiang-nya berbeda dan akan ditimpa
  pasangCurl(w2);
  const sebelum = barisPenuh(w2, 'db_Tiang').length;
  const h = j(w2.g.tarikDataTiang_({}));
  assert.deepStrictEqual(Object.keys(h.tabel), ['tiang_switching', 'tiang_segmen', 'tiang_tiang', 'tiang_sirkuit']);
  for (const sheet of ['db_Tiang', 'db_Tiang_Sirkuit', 'db_Segmen', 'db_Switching']) {
    assert.deepStrictEqual(barisPenuh(w2, sheet), barisPenuh(w1, sheet), 'tab ' + sheet + ' = dunia pertama');
  }
  assert.ok(sebelum > 0);
  // tab master tidak disentuh
  assert.deepStrictEqual(j(w2.sheets.m.db_Jaringan.data), j(dunia().sheets.m.db_Jaringan.data));
  // tarik ulang = idempoten
  j(w2.g.tarikDataTiang_({}));
  assert.deepStrictEqual(barisPenuh(w2, 'db_Tiang'), barisPenuh(w1, 'db_Tiang'));
});

test('arsip ujung ke ujung: foto di PHP diarsip lewat Apps Script asli, ditandai, dan muncul sebagai id Drive di tarikan berikutnya', { skip: SKIP }, async () => {
  kosongSemua();
  kosongkanFoto();
  const w = dunia();
  pasangCurl(w);
  j(w.g.imporTiangKeHostinger_({ tabel: 'tiang_tiang' }));
  const a = buatJpeg(800, 600);
  await kirimTanda('impor.php', { jenis: 'foto', pemilik: 'TIANG', id: '1001', slot: 'TIANG', ...fotoKirim(a) });
  const simpan = [];
  w.g.simpanFotoLapangan_ = (akar, bagian, penanda, nama, bytes) => { simpan.push({ akar, bagian: Array.from(bagian), nama, ok: Buffer.from(bytes.map((x) => x & 0xff)).equals(a) }); return { fileId: 'DriveId1234567890' }; };
  const h = j(w.g.arsipFotoTiang_());
  assert.deepStrictEqual([h.selesai, h.diarsip, h.gagal], [true, 1, []]);
  assert.deepStrictEqual(simpan, [{ akar: 'f', bagian: ['Tiang', 'PLS'], nama: '1001_TIANG.jpg', ok: true }], 'isi foto utuh sampai ke Drive');
  assert.strictEqual(j(w.g.arsipFotoTiang_()).diarsip, 0, 'sudah diarsip: tidak diulang');
  assert.strictEqual(w.g.cekRuangTiang_().foto_berkas, 1);
});

// ---------------------------------------------------------------------------------------------------------------------------
// Task 8: cadangan harian (cadangan.php, CLI), pemulihan, pemulung, pemantauan
// ---------------------------------------------------------------------------------------------------------------------------

const { spawnSync } = require('child_process');
const zlib = require('zlib');

function cli(args, env = {}) {
  const r = spawnSync(PHP, [path.join(API, 'cadangan.php'), ...args], { env: { ...process.env, SISI_API_CONFIG: cfg, ...env }, encoding: 'utf8' });
  return { status: r.status, out: r.stdout || '', err: r.stderr || '' };
}
const TABEL_CADANGAN = ['tiang_tiang', 'tiang_sirkuit', 'tiang_segmen', 'tiang_switching', 'tiang_jaringan', 'tiang_konstruksi', 'tiang_ukuran', 'tiang_pemetaan', 'tiang_foto', 'tiang_op', 'tiang_audit', 'tiang_cabut'];
function dumpSemua() {
  const o = JSON.parse(phpKode(`$p = new PDO('sqlite:${garisMiring(dbFile)}'); $p->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC); $o = [];
    foreach (${JSON.stringify(TABEL_CADANGAN)} as $t) { $o[$t] = $p->query("SELECT * FROM $t")->fetchAll(); } echo json_encode($o);`));
  Object.keys(o).forEach((t) => o[t].sort((x, y) => (JSON.stringify(x) < JSON.stringify(y) ? -1 : 1)));   // urutan baris tidak dijamin
  return o;
}
const bacaCadangan = (f) => zlib.gunzipSync(fs.readFileSync(f)).toString('utf8').trim().split('\n').map((l) => JSON.parse(l));

/** Isi data beragam: tiang + sirkuit + switching (op, audit) + foto + master + cabut. */
async function isiDataCadangan() {
  kosongSemua();
  kosongkanFoto();
  await kirimTanda('impor.php', { jenis: 'tabel', tabel: 'tiang_jaringan', baris: [{ section_id: 's1', penyulang: 'TOBOALI 1', section: 'PMT', urutan: 10, aktif: true, revision: 1 }] });
  await kirimTanda('impor.php', { jenis: 'tabel', tabel: 'tiang_tiang', baris: [{ No: 1, tiang_id: '1001', nama: 'PLS0001', kode_nama_aset: 'PLS', lat_aset: -3, lng_aset: 106.5, aktif: true, revision: 1, keterangan_sumber: 'baris 1\nbaris 2 "kutip" \\ ✓ unicode' }] });
  await kirimTanda('impor.php', { jenis: 'tabel', tabel: 'tiang_sirkuit', baris: [{ sirkuit_id: 's-1', tiang_id: '1001', penyulang: 'TOBOALI 1', aktif: true, revision: 1, gawang_m: 12.5 }] });
  await kirimTanda('impor.php', { jenis: 'foto', pemilik: 'TIANG', id: '1001', slot: 'TIANG', ...fotoKirim(buatJpeg(800, 600)) });
  const r = await panggil('simpanSwitching', { ...swcDasar({ nama: 'PMT Cadangan' }), opId: opBaru() }, tiketUbah());
  assert.strictEqual(r.http, 200, r.teks.slice(0, 200));
  await kirimCabut({ cabut: ['u-cadangan'] });
}

test('cadangan.php: tulis jsonl.gz utuh (meta + semua baris, unicode / baris baru / kutip selamat), tanpa berkas tmp, hasil dicatat dan terlihat di status', { skip: SKIP }, async () => {
  await isiDataCadangan();
  const dir = path.join(path.dirname(cfg), 'cadangan');
  fs.rmSync(dir, { recursive: true, force: true });
  const r = cli([]);
  assert.strictEqual(r.status, 0, r.err + r.out);
  assert.match(r.out, /Cadangan tiang OK: tiang-\d{8}\.jsonl\.gz/);
  const berkas = fs.readdirSync(dir);
  assert.deepStrictEqual(berkas.length, 1, 'tidak ada berkas .tmp tersisa: ' + berkas.join(','));
  const baris = bacaCadangan(path.join(dir, berkas[0]));
  assert.deepStrictEqual([baris[0].meta.format, baris[0].meta.skema], ['sisi-tiang-cadangan-1', '2']);
  const sebut = (t) => baris.filter((x) => x.t === t);
  assert.strictEqual(sebut('tiang_tiang')[0].r.keterangan_sumber, 'baris 1\nbaris 2 "kutip" \\ ✓ unicode');
  const dump = dumpSemua();
  TABEL_CADANGAN.forEach((t) => assert.strictEqual(sebut(t).length, dump[t].length, t + ' jumlah baris'));
  assert.ok(sebut('tiang_foto').length === 1 && sebut('tiang_op').length >= 1 && sebut('tiang_audit').length >= 1 && sebut('tiang_cabut').length === 1);
  assert.ok(!baris.some((x) => x.t === 'tiang_laju'), 'rem laju tidak dicadangkan');
  const st = await panggil('tiangStatus', {}, tiketAdmin());
  assert.strictEqual(st.j.data.cadangan.berkas, berkas[0]);
  assert.strictEqual(st.j.data.cadangan.baris.tiang_tiang, 1);
  assert.strictEqual((await kirimTanda('ekspor.php', { jenis: 'ruang' })).j.data.cadangan.berkas, berkas[0]);
});

test('cadangan.php: lewat HTTP dijawab 404 (hanya CLI); argumen asing ditolak (kode 2)', { skip: SKIP }, async () => {
  assert.strictEqual((await fetch(DASAR + '/cadangan.php')).status, 404);
  assert.strictEqual(cli(['--aneh']).status, 2);
});

test('cadangan.php: hanya 14 cadangan terbaru disimpan, yang lebih lama dihapus', { skip: SKIP }, async () => {
  const dir = path.join(path.dirname(cfg), 'cadangan');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 1; i <= 16; i++) fs.writeFileSync(path.join(dir, `tiang-202601${String(i).padStart(2, '0')}.jsonl.gz`), 'x');
  fs.writeFileSync(path.join(dir, 'lain.txt'), 'bukan cadangan');
  assert.strictEqual(cli([]).status, 0);
  const sisa = fs.readdirSync(dir).filter((f) => f.startsWith('tiang-')).sort();
  assert.strictEqual(sisa.length, 14);
  assert.ok(sisa.includes(`tiang-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.jsonl.gz`), 'cadangan hari ini ada');
  assert.ok(!sisa.includes('tiang-20260101.jsonl.gz') && !sisa.includes('tiang-20260102.jsonl.gz') && !sisa.includes('tiang-20260103.jsonl.gz'), 'yang tertua dihapus');
  assert.ok(fs.existsSync(path.join(dir, 'lain.txt')), 'berkas lain tidak disentuh');
});

test('cadangan.php: pemulihan mengembalikan semua tabel persis seperti saat dicadangkan; tanpa --ya ditolak; berkas rusak / skema beda tidak mengubah apa pun', { skip: SKIP }, async () => {
  await isiDataCadangan();
  const dir = path.join(path.dirname(cfg), 'cadangan');
  fs.rmSync(dir, { recursive: true, force: true });
  assert.strictEqual(cli([]).status, 0);
  const berkas = path.join(dir, fs.readdirSync(dir)[0]);
  const asli = dumpSemua();
  // kerusakan: hapus isi + ubah satu baris
  kosongSemua();
  await kirimTanda('impor.php', { jenis: 'tabel', tabel: 'tiang_tiang', baris: [{ tiang_id: 'RUSAK', nama: 'x' }] });
  const rusak = dumpSemua();
  const tolak = cli([`pulihkan=${berkas}`]);
  assert.strictEqual(tolak.status, 2);
  assert.match(tolak.err, /--ya/);
  assert.deepStrictEqual(dumpSemua(), rusak, 'tanpa --ya tidak berubah');
  // berkas bukan cadangan / skema beda: ditolak sebelum menghapus
  const aneh = path.join(dir, 'aneh.jsonl.gz');
  fs.writeFileSync(aneh, zlib.gzipSync('{"meta":{"format":"lain","skema":"2"}}\n'));
  assert.strictEqual(cli([`pulihkan=${aneh}`, '--ya']).status, 1);
  fs.writeFileSync(aneh, zlib.gzipSync('{"meta":{"format":"sisi-tiang-cadangan-1","skema":"99"}}\n'));
  const skema = cli([`pulihkan=${aneh}`, '--ya']);
  assert.strictEqual(skema.status, 1);
  assert.match(skema.err, /skema/);
  fs.writeFileSync(aneh, zlib.gzipSync('{"meta":{"format":"sisi-tiang-cadangan-1","skema":"2"}}\n{"t":"tiang_tiang","r":{"tiang_id":"Z"}}\n{"t":"tabel_asing","r":{"a":1}}\n'));
  assert.strictEqual(cli([`pulihkan=${aneh}`, '--ya']).status, 1);
  assert.deepStrictEqual(dumpSemua(), rusak, 'pemulihan gagal di tengah = satu transaksi dibatalkan, tidak ada yang berubah');
  assert.strictEqual(cli(['pulihkan=/tidak/ada.jsonl.gz', '--ya']).status, 1);
  // pemulihan sungguhan
  const ok = cli([`pulihkan=${berkas}`, '--ya']);
  assert.strictEqual(ok.status, 0, ok.err + ok.out);
  assert.deepStrictEqual(dumpSemua(), asli, 'seluruh tabel sama dengan saat dicadangkan');
  assert.deepStrictEqual((await panggil('getTiangJalur', { kode: 'PLS' }, tiketAdmin())).j.data.tiang.map((t) => t.tiangId), ['1001']);
});

test('cadangan.php: berkas foto yatim (>1 jam, tanpa baris tiang_foto) ikut dibersihkan; config hilang = gagal (kode bukan 0)', { skip: SKIP }, async () => {
  await isiDataCadangan();
  const yatim = path.join(fotoDir, 'PLS', 'yatim-tua.jpg');
  fs.writeFileSync(yatim, 'x');
  const dua = new Date(Date.now() - 2 * 3600 * 1000);
  fs.utimesSync(yatim, dua, dua);
  const r = cli([]);
  assert.strictEqual(r.status, 0);
  assert.match(r.out, /foto yatim dihapus: 1/);
  assert.ok(!fs.existsSync(yatim));
  assert.ok(daftarBerkas().length === 2, 'foto yang dipakai (+thumbnail) utuh');
  const gagal = cli([], { SISI_API_CONFIG: path.join(path.dirname(cfg), 'tidak-ada.php') });
  assert.notStrictEqual(gagal.status, 0);
});

// ---------------------------------------------------------------------------------------------------------------------------
// Task 11b: uploadFotoSwitching (foto susulan switching yang sudah ada)
// ---------------------------------------------------------------------------------------------------------------------------

test('uploadFotoSwitching: foto susulan tanpa menaikkan revision; mengganti foto membuang berkas lama; opId sama tidak menggandakan', { skip: SKIP }, async () => {
  kosongkanFoto();
  const w = dunia();
  semai(w);
  const s = await panggil('simpanSwitching', { ...swcDasar({ nama: 'PMT Susulan' }), opId: opBaru() }, tiketUbah());
  const id = s.j.data.switching.switchingId, rev = s.j.data.switching.revision;
  const a = buatJpeg(800, 600), b = buatJpeg(640, 480, 70);
  const op = opBaru();
  const r = await panggil('uploadFotoSwitching', { opId: op, switchingId: id, slot: 'NAMEPLATE', ...fotoKirim(a) }, tiketUbah());
  assert.strictEqual(r.http, 200, r.teks.slice(0, 300));
  assert.deepStrictEqual(r.j.data.switching.foto, { UNIT: false, NAMEPLATE: true, KONTROLER: false });
  assert.strictEqual(r.j.data.switching.revision, rev, 'foto tidak menaikkan revision');
  assert.deepStrictEqual(r.j.data.foto.NAMEPLATE, { sha256: sha256Hex(a), bytes: a.length });
  const ulang = await panggil('uploadFotoSwitching', { opId: op, switchingId: id, slot: 'NAMEPLATE', ...fotoKirim(a) }, tiketUbah());
  assert.deepStrictEqual(ulang.j.data, r.j.data, 'kirim ulang opId sama = jawaban sama');
  assert.strictEqual(barisFoto(id).length, 1);
  const ganti = await panggil('uploadFotoSwitching', { opId: opBaru(), switchingId: id, slot: 'NAMEPLATE', ...fotoKirim(b) }, tiketUbah());
  assert.strictEqual(ganti.http, 200);
  assert.ok(!daftarBerkas('Switching').some((f) => f.includes(sha256Hex(a).slice(0, 8))), 'berkas lama dibuang');
  const penuh = await panggil('getFotoSwitching', { switchingId: id, slot: 'NAMEPLATE', ukuran: 'PENUH' }, tiketAdmin());
  assert.deepStrictEqual(Buffer.from(penuh.j.data.data, 'base64'), b);
  assert.strictEqual(dumpBaris('tiang_switching', 'switching_id', id).revision, rev);
});

test('uploadFotoSwitching: switching tak ada 404, sidik salah / slot asing / tanpa opId 422, hanya lihat 403', { skip: SKIP }, async () => {
  kosongkanFoto();
  const w = dunia();
  semai(w);
  const s = await panggil('simpanSwitching', { ...swcDasar({ nama: 'PMT Tolak' }), opId: opBaru() }, tiketUbah());
  const id = s.j.data.switching.switchingId;
  const a = buatJpeg(800, 600);
  const kirim = (o, t = tiketUbah()) => panggil('uploadFotoSwitching', { opId: opBaru(), switchingId: id, slot: 'UNIT', ...fotoKirim(a), ...o }, t);
  assert.strictEqual((await kirim({ switchingId: 'SWC-9999' })).http, 404);
  assert.strictEqual((await kirim({ sha256: sha256Hex(Buffer.from('lain')) })).http, 422);
  assert.strictEqual((await kirim({ slot: 'TIANG' })).http, 422);
  const tanpaOp = await kirim({ opId: undefined });
  assert.deepStrictEqual([tanpaOp.http, tanpaOp.j.galat.some((x) => x.field === 'opId')], [422, true]);
  assert.strictEqual((await kirim({}, tiketAdmin())).j.kode, 'AKSES_DITOLAK');
  assert.deepStrictEqual(daftarBerkas('Switching'), [], 'tidak ada berkas dari permintaan yang ditolak');
});
