/**
 * v1.0.38 uji integrasi API baca PHP (hosting/sisi-api) dengan kode Apps Script asli (harness): sinkron bertanda dari
 * sinkronMysqlGgn_, tiket dari getTiketApi_, jawaban gangguan.php = getHistoriGangguan_ untuk data yang sama.
 * Butuh PHP 8.3 + pdo_sqlite: PHP_BIN=<path php> node --test tests/php-api.test.js (tanpa PHP_BIN = dilewati).
 */
const assert = require('assert');
const test = require('node:test');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { buatKonteks } = require('./harness.js');

const PHP = process.env.PHP_BIN;
const RHS = 'k'.repeat(48);
const PORT = 18000 + Math.floor(Math.random() * 1000);
const DASAR = 'http://127.0.0.1:' + PORT;

test('v1.0.38 API PHP: sinkron bertanda + tiket + jawaban sama dengan getHistoriGangguan', { skip: !PHP && 'PHP_BIN tidak diatur' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sisi-api-'));
  const cfg = path.join(dir, 'config.php');
  fs.writeFileSync(cfg, `<?php return ['env' => 'staging', 'rahasia' => '${RHS}', 'dsn' => 'sqlite:${path.join(dir, 'db.sqlite').replace(/\\/g, '/')}', 'origin' => ['http://localhost:5173']];`);
  const srv = spawn(PHP, ['-S', '127.0.0.1:' + PORT, '-t', path.join(__dirname, '..', 'hosting', 'sisi-api')], { env: { ...process.env, SISI_API_CONFIG: cfg }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(DASAR + '/status.php'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

    // Apps Script asli (harness) mengirim ke server PHP lewat fetch sinkron (curl)
    const gx = buatKonteks({ MYSQL_API_URL: 'https://contoh.id/sisi-api', MYSQL_API_SECRET: RHS, ENV: 'staging' });
    gx.UrlFetchApp = { fetch: (url, o) => {
      const p = url.replace('https://contoh.id/sisi-api', DASAR);
      const args = ['-s', '-o', '-', '-w', '\n%{http_code}', '-X', (o.method || 'get').toUpperCase(), p];
      Object.entries(o.headers || {}).forEach(([k, v]) => args.push('-H', k + ': ' + v));
      if (o.payload) args.push('-H', 'Content-Type: application/json', '--data-binary', '@-');
      const out = execFileSync('curl', args, { input: o.payload || '' }).toString();
      const i = out.lastIndexOf('\n');
      return { getResponseCode: () => Number(out.slice(i + 1)), getContentText: () => out.slice(0, i) };
    } };
    const tahun = gx.tglJakarta_(new Date()).slice(0, 4);
    const baris = { ggn_Penyulang: [], ggn_AR: [], ggn_PickUp: [] };
    for (let i = 0; i < 14; i++) baris.ggn_Penyulang.push({ penyulang: 'P' + String(i).padStart(2, '0'), waktu_padam: tahun + '-01-0' + (1 + (i % 9)) + ' 10:00', kode_fgtm: '', penyebab: 'Pohon "besar" ✓', durasi_menit: 30 + i });
    baris.ggn_Penyulang.push({ penyulang: 'P00', waktu_padam: tahun + '-01-02', kode_fgtm: 'Pohon - E1', nyala_bertahap: '[{"tahap":1,"jam":"10:00"}]' });
    baris.ggn_Penyulang.push({ penyulang: 'LAMA', waktu_padam: '2020-05-05 10:00' });
    baris.ggn_AR.push({ penyulang: 'KOTA', waktu_ar: tahun + '-02-02 08:00', indikasi: 'GFR' });
    baris.ggn_PickUp.push({ penyulang: 'KOTA', waktu_event: 'tidak terbaca' });
    gx.tabel_ = (_, sh) => ({ rows: baris[sh] });
    const info = { waktu: '2026-10-27T11:00:00.000Z', sumber: 'UJI', jumlah: { penyulang: 16, ar: 1, pickup: 1 }, sidik: { penyulang: 'a', ar: 'b', pickup: 'c' } };
    gx.bacaInfoSinkronGgn_ = () => info;
    const h = gx.sinkronMysqlGgn_(info, false);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(h.data.jumlah)), { penyulang: 16, ar: 1, pickup: 1 });

    // tanda salah / kedaluwarsa ditolak
    const kirimMentah = (body, waktu, tanda) => fetch(DASAR + '/sinkron.php', { method: 'POST', body, headers: { 'X-SiSi-Waktu': waktu, 'X-SiSi-Tanda': tanda } });
    const body = JSON.stringify({ modul: 'ggn', sinkron: {}, jenis: {} });
    const w = String(Math.floor(Date.now() / 1000));
    const benar = (wk, b) => crypto.createHmac('sha256', RHS).update(wk + '.' + crypto.createHash('sha256').update(b).digest('hex')).digest('hex');
    assert.strictEqual((await (await kirimMentah(body, w, 'a'.repeat(64))).json()).kode, 'TANDA_TIDAK_VALID');
    assert.strictEqual((await (await kirimMentah(body, String(Number(w) - 900), benar(String(Number(w) - 900), body))).json()).kode, 'TANDA_KEDALUWARSA');
    assert.strictEqual((await (await kirimMentah(JSON.stringify({ modul: 'ggn', sinkron: {}, jenis: { hapus: [] } }), w, benar(w, JSON.stringify({ modul: 'ggn', sinkron: {}, jenis: { hapus: [] } })))).json()).kode, 'DATA_TIDAK_VALID');

    // tiket asli Apps Script
    gx.cfg_ = () => ({ ENV: 'staging' });
    gx.menuUntuk_ = () => [{ kode: 'OPS_REKAP_GANGGUAN' }];
    const tiket = gx.getTiketApi_({ role: 'ADMIN', userId: 'u1' }, {}, 'WEB').tiket;
    const baca = async (q, tk = tiket) => (await fetch(DASAR + '/gangguan.php' + q, { headers: { 'X-SiSi-Tiket': tk } })).json();
    const banding = (q, data) => {
      const harap = JSON.parse(JSON.stringify(gx.getHistoriGangguan_({ role: 'ADMIN' }, data)));
      return baca(q).then((j) => { assert.strictEqual(j.ok, true); assert.deepStrictEqual(j.data, harap); });
    };
    await banding('', {});
    await banding('?dari=2020-01-01&sampai=2020-12-31', { dari: '2020-01-01', sampai: '2020-12-31' });
    assert.strictEqual((await baca('?dari=2020-01-01&sampai=2022-06-01')).kode, 'DI_LUAR_RENTANG');
    assert.strictEqual((await baca('?dari=2020-02-30')).kode, 'FORMAT_SALAH');
    assert.strictEqual((await baca('?tahun=2026')).kode, 'FIELD_TIDAK_DIKENAL');
    assert.strictEqual((await baca('', 'x.' + 'a'.repeat(64))).kode, 'TIKET_TIDAK_VALID');
    gx.menuUntuk_ = () => [{ kode: 'OPS_LAP_UP3' }];
    assert.strictEqual((await baca('', gx.getTiketApi_({ role: 'ADMIN', userId: 'u1' }, {}, 'WEB').tiket)).kode, 'AKSES_DITOLAK');
    // v1.0.38 jawaban jadi gardu: simpan dari Apps Script, baca website, hapus per gardu / semua, pembacaan lambat ditolak
    gx.menuUntuk_ = () => [{ kode: 'OPS_PENGUKURAN_GARDU' }];
    const tkG = gx.getTiketApi_({ role: 'ADMIN', userId: 'u1' }, {}, 'WEB').tiket;
    const ambilJ = async (aksi, data, tk = tkG) => (await fetch(DASAR + '/jawaban.php?aksi=' + aksi + '&data=' + encodeURIComponent(gx.kanonMysql_(data)), { headers: { 'X-SiSi-Tiket': tk } })).json();
    const rw = { garduId: 'g1', noGardu: 'TB0001' };
    assert.strictEqual((await ambilJ('getRiwayatGardu', rw)).kode, 'BELUM_ADA');
    const isiRw = { garduId: 'g1', pengukuran: [{ tanggal: '2026-10-27', r: 120.5, ket: 'Trafo "lama" ✓' }] };
    let mulai = Date.now();
    assert.strictEqual(gx.simpanJawabanMysql_('getRiwayatGardu', rw, isiRw, mulai).simpan, true);
    gx.simpanJawabanMysql_('getMaster', { modul: ['gardu'] }, { modul: { gardu: { isi: [{ id: 'g1' }] } } }, mulai);
    gx.simpanJawabanMysql_('getRiwayatGardu', { garduId: 'g2', noGardu: 'TB0002' }, { garduId: 'g2' }, mulai);
    assert.deepStrictEqual((await ambilJ('getRiwayatGardu', { noGardu: 'TB0001', garduId: 'g1' })).data, isiRw, 'urutan kunci data tidak berpengaruh');
    assert.strictEqual((await ambilJ('getRiwayatGardu', rw, tiket)).kode, 'AKSES_DITOLAK', 'tiket tanpa menu Pengukuran Gardu');
    // kiriman gardu g1: jawaban g1 + daftar terhapus, g2 tetap
    gx.catatKirimanGarduMysql_('simpanGarduYandal', {}, { garduId: 'g1' });
    assert.strictEqual((await ambilJ('getRiwayatGardu', rw)).kode, 'BELUM_ADA');
    assert.strictEqual((await ambilJ('getMaster', { modul: ['gardu'] })).kode, 'BELUM_ADA');
    assert.deepStrictEqual((await ambilJ('getRiwayatGardu', { garduId: 'g2', noGardu: 'TB0002' })).data, { garduId: 'g2' });
    // pembacaan yang MULAI sebelum kiriman tadi tidak boleh menyimpan data lama
    assert.strictEqual(gx.simpanJawabanMysql_('getRiwayatGardu', rw, { garduId: 'g1', basi: true }, mulai).simpan, false);
    assert.strictEqual((await ambilJ('getRiwayatGardu', rw)).kode, 'BELUM_ADA');
    assert.strictEqual(gx.simpanJawabanMysql_('getRiwayatGardu', rw, isiRw, Date.now() + 5).simpan, true);
    // kiriman tanpa garduId = semua jawaban gardu dihapus
    gx.catatKirimanGarduMysql_('buatPdfBaGardu', { tulis: true, menu: 'OPS_BA_GARDU' }, { baId: 'b1' });
    assert.strictEqual((await ambilJ('getRiwayatGardu', { garduId: 'g2', noGardu: 'TB0002' })).kode, 'BELUM_ADA');
    assert.strictEqual((await ambilJ('getRiwayatGardu', rw)).kode, 'BELUM_ADA');
    // master jaringan: berumur 1 jam (diubah lewat sheet, tanpa kiriman), lalu dianggap belum ada
    gx.simpanJawabanMysql_('getMaster', { modul: ['jaringan'] }, { modul: { jaringan: { isi: [1] } } }, Date.now());
    assert.deepStrictEqual((await ambilJ('getMaster', { modul: ['jaringan'] })).data, { modul: { jaringan: { isi: [1] } } });
    gx.simpanJawabanMysql_('getMaster', { modul: ['jaringan'] }, { modul: { jaringan: { isi: [2] } } }, Date.now() - 2 * 3600e3);
    assert.strictEqual((await ambilJ('getMaster', { modul: ['jaringan'] })).kode, 'BELUM_ADA', 'lebih dari 1 jam');
    // file dalam tidak bisa dibuka langsung
    assert.strictEqual((await fetch(DASAR + '/_lib.php')).status, 404);
    const st = await (await fetch(DASAR + '/status.php')).json();
    assert.deepStrictEqual(st.data, { versi: '1', env: 'staging', sinkronGangguan: info.waktu });
  } finally {
    srv.kill();
  }
});
