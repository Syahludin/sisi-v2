/**
 * Sisi Apps Script modul tiang di Hostinger (docs/superpowers/plans/2026-11-11-tiang-hostinger.md): tiket HP, alamat API di ping,
 * pencabutan tiket akun nonaktif. Sisi PHP diuji di tests/tiang-php.test.js.
 */
const assert = require('node:assert');
const test = require('node:test');
const crypto = require('crypto');
const { buatKonteks } = require('./harness');
const { kodeError } = require('./gudangUji');
const { PROPS: PROPS_DUNIA } = require('./duniaTiang');

const RHS = 'r'.repeat(40);
const PROPS = { ...PROPS_DUNIA, MYSQL_API_URL: 'https://contoh.id/sisi-api-staging/', MYSQL_API_SECRET: RHS };
const bacaTiket = (t) => {
  const [p, tanda] = t.split('.');
  assert.strictEqual(tanda, crypto.createHmac('sha256', RHS).update('tiket.' + p).digest('hex'), 'tanda tangan tiket');
  return JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
};
const MENU = [{ kode: 'OPS_VERIFIKASI_TIANG', aksi: 'UBAH' }, { kode: 'OPS_MASTER_SWITCHING', aksi: 'LIHAT' }, { kode: 'OPS_WO', aksi: 'UBAH' }];

test('getTiketApi MOBILE: hanya menu tiang; t = menu yang boleh diubah; 8 jam; env + role ikut', () => {
  const g = buatKonteks(PROPS);
  g.menuUntuk_ = () => MENU;
  const hasil = g.getTiketApi_({ role: 'ADMIN', userId: 'u1' }, {}, 'MOBILE');
  const isi = bacaTiket(hasil.tiket);
  assert.deepStrictEqual([isi.u, isi.role, isi.env], ['u1', 'ADMIN', 'staging']);
  assert.deepStrictEqual(Array.from(isi.m), ['OPS_VERIFIKASI_TIANG', 'OPS_MASTER_SWITCHING'], 'menu non-tiang tidak ikut');
  assert.deepStrictEqual(Array.from(isi.t), ['OPS_VERIFIKASI_TIANG'], 'hanya menu berhak UBAH');
  assert.ok(Math.abs(isi.exp - (Date.now() / 1000 + 8 * 3600)) < 5);
  assert.strictEqual(new Date(hasil.sampai).getTime() / 1000, isi.exp);
});

test('getTiketApi MOBILE: SUPER boleh; PETUGAS / YANDAL ditolak; API belum diatur = CONFIG_TIDAK_LENGKAP', () => {
  const g = buatKonteks(PROPS);
  g.menuUntuk_ = () => MENU;
  assert.ok(g.getTiketApi_({ role: 'SUPER', userId: 'u9' }, {}, 'MOBILE').tiket);
  assert.strictEqual(kodeError(() => g.getTiketApi_({ role: 'PETUGAS', userId: 'u2' }, {}, 'MOBILE')), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => g.getTiketApi_({ role: 'YANDAL', userId: 'u3' }, {}, 'MOBILE')), 'AKSES_DITOLAK');
  const kosong = buatKonteks(PROPS_DUNIA);
  kosong.menuUntuk_ = () => MENU;
  assert.strictEqual(kodeError(() => kosong.getTiketApi_({ role: 'ADMIN', userId: 'u1' }, {}, 'MOBILE')), 'CONFIG_TIDAK_LENGKAP');
});

test('ping: versi.tiangApi dari TIANG_API_URL (https saja, garis miring akhir dibuang); kosong / salah = jalur lama', () => {
  const g = buatKonteks({ ENV: 'staging' });
  const props = g.PropertiesService.getScriptProperties();
  assert.strictEqual(g.infoVersi_().tiangApi, '');
  props.setProperty('TIANG_API_URL', 'https://contoh.id/sisi-api-staging/');
  assert.strictEqual(g.infoVersi_().tiangApi, 'https://contoh.id/sisi-api-staging');
  props.setProperty('TIANG_API_URL', 'http://contoh.id/sisi-api');
  assert.strictEqual(g.infoVersi_().tiangApi, '', 'http ditolak');
  props.setProperty('TIANG_API_URL', 'https://contoh.id/sisi api');
  assert.strictEqual(g.infoVersi_().tiangApi, '', 'spasi ditolak');
});

test('sinkronCabutTiketTiang_: mengirim DAFTAR LENGKAP akun nonaktif bertanda HMAC ke cabut.php; API belum diatur = null', () => {
  const g = buatKonteks(PROPS);
  g.tabel_ = () => ({ rows: [
    { user_id: 'u-aktif', aktif: true }, { user_id: 'u-mati', aktif: false }, { user_id: 'u-kosong', aktif: '' }, { user_id: 'u-teks', aktif: 'TRUE' }, { user_id: '', aktif: false },
  ] });
  const kirim = [];
  g.UrlFetchApp = { fetch: (url, o) => {
    kirim.push({ url, payload: o.payload, waktu: o.headers['X-SiSi-Waktu'], tanda: o.headers['X-SiSi-Tanda'] });
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, data: { jumlah: 2 } }) };
  } };
  const h = g.sinkronCabutTiketTiang_();
  assert.strictEqual(h.jumlah, 2);
  assert.strictEqual(kirim[0].url, 'https://contoh.id/sisi-api-staging/cabut.php');
  assert.deepStrictEqual(JSON.parse(kirim[0].payload), { cabut: ['u-mati', 'u-kosong'] });
  const sha = crypto.createHash('sha256').update(kirim[0].payload).digest('hex');
  assert.strictEqual(kirim[0].tanda, crypto.createHmac('sha256', RHS).update(kirim[0].waktu + '.' + sha).digest('hex'));
  assert.strictEqual(buatKonteks(PROPS_DUNIA).sinkronCabutTiketTiang_(), null);
});

test('sinkronCabutTiketTiang_: API gagal = MYSQL_GAGAL (tidak diam-diam)', () => {
  const g = buatKonteks(PROPS);
  g.tabel_ = () => ({ rows: [{ user_id: 'u-mati', aktif: false }] });
  g.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 500, getContentText: () => JSON.stringify({ ok: false, kode: 'KESALAHAN_SERVER' }) }) };
  assert.strictEqual(kodeError(() => g.sinkronCabutTiketTiang_()), 'MYSQL_GAGAL');
});

// ---------------------------------------------------------------------------------------------------------------------------
// Impor spreadsheet -> Hostinger (potongan, urutan, kemajuan) dan impor foto Drive
// ---------------------------------------------------------------------------------------------------------------------------

function duniaImpor(banyak = { tiang_tiang: 650 }) {
  const g = buatKonteks(PROPS);
  const kirim = [];
  g.UrlFetchApp = { fetch: (url, o) => {
    const body = JSON.parse(o.payload);
    kirim.push({ url, body });
    const data = body.jenis === 'tabel' ? { ditulis: body.baris.length, ditolak: body.baris.map((b, i) => (b.tolak ? { baris: i + 1, alasan: 'bukan teks utuh' } : null)).filter(Boolean) }
      : body.jenis === 'foto_ada' ? { ada: [] } : { path: 'x', sha256: body.sha256, bytes: body.ukuranByte, sudah: false };
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, data }) };
  } };
  const baris = (n, mulai = 1) => Array.from({ length: n }, (_, i) => ({ _baris: i + 2, No: mulai + i, tiang_id: 'T' + (mulai + i) }));
  g.tabelTiangSisi_ = (nama) => ({ rows: nama === 'db_Tiang' ? baris(banyak.tiang_tiang || 0) : nama === 'db_Tiang_Sirkuit' ? baris(banyak.tiang_sirkuit || 0) : [] });
  g.tabel_ = (sid, nama) => { if (nama === 'db_Jaringan') return { rows: baris(2) }; const e = new Error('x'); e.kode = 'SHEET_TIDAK_ADA'; throw e; };
  return { g, kirim };
}

test('imporTiangKeHostinger_: potongan 300 baris, urutan master -> sirkuit, urutAwal benar, tab master yang belum ada dilewati, kemajuan dibersihkan', () => {
  const { g, kirim } = duniaImpor({ tiang_tiang: 650, tiang_sirkuit: 10 });
  const h = g.imporTiangKeHostinger_({});
  assert.strictEqual(h.selesai, true);
  assert.deepStrictEqual(kirim.map((k) => [k.body.tabel, k.body.baris.length, k.body.urutAwal]),
    [['tiang_jaringan', 2, 1], ['tiang_tiang', 300, 1], ['tiang_tiang', 300, 301], ['tiang_tiang', 50, 601], ['tiang_sirkuit', 10, 1]]);
  assert.ok(kirim.every((k) => k.url === 'https://contoh.id/sisi-api-staging/impor.php' && k.body.jenis === 'tabel'));
  assert.ok(kirim[0].body.baris.every((b) => !('_baris' in b)), 'kunci internal dibuang');
  assert.strictEqual(h.tabel.tiang_ukuran.total, 0);
  assert.strictEqual(g.PropertiesService.getScriptProperties().getProperty('TIANG_IMPOR_KEMAJUAN'), null);
});

test('imporTiangKeHostinger_: waktu habis berhenti rapi, kemajuan tersimpan, proses berikutnya melanjutkan dan tidak mengirim ulang yang sudah', () => {
  const { g, kirim } = duniaImpor({ tiang_tiang: 650 });
  g.TIANG_IMPOR_POTONG_ = 300;
  // satu potongan lalu "waktu habis": anggaran dipotong sesudah kiriman pertama
  const asli = g.kirimMysql_;
  let n = 0;
  g.kirimMysql_ = (konf, jalur, isi) => { const r = asli(konf, jalur, isi); if (++n === 2) g.TIANG_IMPOR_MS_ = -1; return r; };
  const h1 = g.imporTiangKeHostinger_({});
  assert.deepStrictEqual([h1.selesai, h1.berhenti], [false, 'tiang_tiang']);
  assert.deepStrictEqual(JSON.parse(g.PropertiesService.getScriptProperties().getProperty('TIANG_IMPOR_KEMAJUAN')), { tiang_jaringan: 2, tiang_tiang: 300 });
  const sudahKirim = kirim.length;
  g.TIANG_IMPOR_MS_ = 4 * 60 * 1000;
  g.kirimMysql_ = asli;
  const h2 = g.imporTiangKeHostinger_({});
  assert.strictEqual(h2.selesai, true);
  assert.deepStrictEqual(kirim.slice(sudahKirim).map((k) => [k.body.tabel, k.body.urutAwal]), [['tiang_tiang', 301], ['tiang_tiang', 601]], 'melanjutkan dari potongan berikutnya');
  const h3 = g.imporTiangKeHostinger_({ ulang: true, tabel: 'tiang_jaringan' });
  assert.deepStrictEqual(Object.keys(h3.tabel), ['tiang_jaringan'], 'opsi tabel membatasi');
});

test('imporTiangKeHostinger_: baris ditolak dilaporkan dengan urutan barisnya, API belum diatur = CONFIG_TIDAK_LENGKAP', () => {
  const { g } = duniaImpor({ tiang_tiang: 3 });
  const asli = g.tabelTiangSisi_;
  g.tabelTiangSisi_ = (n) => (n === 'db_Tiang' ? { rows: [{ No: 1, tiang_id: 'T1' }, { No: 2, tiang_id: 'T2', tolak: true }, { No: 3, tiang_id: 'T3' }] } : asli(n));
  const h = g.imporTiangKeHostinger_({});
  assert.strictEqual(h.tabel.tiang_tiang.ditolak, 1);
  assert.deepStrictEqual(Array.from(h.ditolak), ['tiang_tiang baris 2: bukan teks utuh']);
  assert.strictEqual(kodeError(() => buatKonteks(PROPS_DUNIA).imporTiangKeHostinger_({})), 'CONFIG_TIDAK_LENGKAP');
});

test('imporFotoTiang_: yang sudah ada dilewati, foto Drive dikirim dengan sidik benar, gagal satu tidak menghentikan yang lain', () => {
  const g = buatKonteks(PROPS);
  const kirim = [];
  const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3, 4, 5]);
  g.UrlFetchApp = { fetch: (url, o) => {
    const body = JSON.parse(o.payload);
    kirim.push(body);
    const data = body.jenis === 'foto_ada' ? { ada: body.pemilik === 'TIANG' ? ['T1|TIANG'] : [] } : { path: 'x', sha256: body.sha256, bytes: 1, sudah: false };
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, data }) };
  } };
  g.tabelTiangSisi_ = (nama) => ({ rows: nama === 'db_Tiang'
    ? [{ tiang_id: 'T1', foto_tiang_id: 'drive-a', foto_kepala_id: 'drive-b' }, { tiang_id: 'T2', foto_tiang_id: 'drive-hilang', foto_kepala_id: '' }, { tiang_id: 'T3', foto_tiang_id: '', foto_kepala_id: '' }]
    : [{ switching_id: 'SWC-0001', foto_unit_id: 'drive-c', foto_nameplate_id: '', foto_kontroler_id: '' }] });
  g.DriveApp = { getFileById: (id) => {
    if (id === 'drive-hilang') throw new Error('File tidak ditemukan');
    return { getBlob: () => ({ getBytes: () => Array.from(jpeg, (b) => (b > 127 ? b - 256 : b)) }) };
  } };
  const h = g.imporFotoTiang_();
  assert.deepStrictEqual([h.selesai, h.terkirim, h.dilewati, h.gagal.length], [true, 2, 1, 1]);
  assert.match(h.gagal[0], /TIANG T2 TIANG: File tidak ditemukan/);
  const foto = kirim.filter((k) => k.jenis === 'foto');
  assert.deepStrictEqual(foto.map((k) => [k.pemilik, k.id, k.slot]), [['TIANG', 'T1', 'KEPALA'], ['SWITCHING', 'SWC-0001', 'UNIT']]);
  assert.strictEqual(foto[0].sha256, crypto.createHash('sha256').update(jpeg).digest('hex'));
  assert.strictEqual(Buffer.from(foto[0].data, 'base64').equals(jpeg), true);
  assert.strictEqual(foto[0].ukuranByte, jpeg.length);
});

// ---------------------------------------------------------------------------------------------------------------------------
// Task 7: tarik (MySQL -> Sheet), arsip foto -> Drive, pemicu
// ---------------------------------------------------------------------------------------------------------------------------

/** Sheet palsu yang mencatat tulisan: data[0] = header. */
function lembarPalsu(header, isi = []) {
  const data = [header.slice(), ...isi.map((b) => b.slice())];
  return {
    data,
    getLastRow: () => data.length,
    getRange: (r, c, nr = 1, nc = 1) => ({
      setValues: (vals) => vals.forEach((baris, i) => { data[r - 1 + i] = data[r - 1 + i] || []; baris.forEach((v, k) => { data[r - 1 + i][c - 1 + k] = v; }); }),
    }),
  };
}

function duniaTarik({ api = true, server = [], lembar = {} } = {}) {
  const g = buatKonteks({ ...PROPS, ...(api ? { TIANG_API_URL: 'https://contoh.id/sisi-api-staging' } : {}) });
  const header = { db_Tiang: ['No', 'tiang_id', 'nama', 'aktif'], db_Tiang_Sirkuit: ['No', 'sirkuit_id', 'tiang_id'], db_Segmen: ['No', 'segmen_id', 'nama'], db_Switching: ['No', 'switching_id', 'nama'] };
  const sh = {};
  Object.keys(header).forEach((n) => { sh[n] = lembarPalsu(header[n], lembar[n] || []); });
  const dipakai = [];
  g.tabelTiangSisi_ = (nama) => { dipakai.push(nama); return { sheet: sh[nama], header: header[nama], rows: [] }; };
  g.tabel_ = () => { throw new Error('tab master TIDAK boleh disentuh penarikan'); };
  const permintaan = [];
  g.UrlFetchApp = { fetch: (url, o) => {
    const b = JSON.parse(o.payload);
    permintaan.push(b);
    const semua = (server[b.tabel] || []);
    const mulai = b.kursor ? semua.findIndex((x) => x.No === b.kursor.urut && x[Object.keys(x)[1]] === b.kursor.id) + 1 : 0;
    const potong = semua.slice(mulai, mulai + b.batas);
    const selesai = mulai + b.batas >= semua.length;
    const akhir = potong[potong.length - 1];
    const data = { tabel: b.tabel, baris: potong, selesai, kursor: selesai ? null : { urut: akhir.No, id: akhir[Object.keys(akhir)[1]] }, total: semua.length };
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, data }) };
  } };
  return { g, sh, permintaan, dipakai };
}

test('tarikDataTiang_: halaman berurutan, kolom dipetakan menurut header (kunci tak ada = kosong), sisa baris lama dikosongkan, hanya empat tab SiSi_Tiang', () => {
  const server = { tiang_tiang: [1, 2, 3, 4, 5].map((n) => ({ No: n, tiang_id: 'T' + n, nama: 'Tiang ' + n, aktif: n !== 2, kolom_asing: 'x' })), tiang_sirkuit: [{ No: 1, sirkuit_id: 's1', tiang_id: 'T1' }] };
  const { g, sh, permintaan, dipakai } = duniaTarik({ server, lembar: { db_Tiang: [[1, 'LAMA1', 'x', true], [2, 'LAMA2', 'x', true], [3, 'LAMA3', 'x', true], [4, 'LAMA4', 'x', true], [5, 'LAMA5', 'x', true], [6, 'LAMA6', 'x', true], [7, 'LAMA7', 'x', true]] } });
  g.TIANG_TARIK_BATAS_ = 2;
  const h = g.tarikDataTiang_({ paksa: false });
  assert.deepStrictEqual(Object.keys(h.tabel), ['tiang_switching', 'tiang_segmen', 'tiang_tiang', 'tiang_sirkuit']);
  assert.deepStrictEqual(permintaan.filter((p) => p.tabel === 'tiang_tiang').map((p) => p.kursor && p.kursor.id), [null, 'T2', 'T4'], 'halaman keyset sampai selesai');
  assert.deepStrictEqual(sh.db_Tiang.data.slice(1, 6), [[1, 'T1', 'Tiang 1', true], [2, 'T2', 'Tiang 2', false], [3, 'T3', 'Tiang 3', true], [4, 'T4', 'Tiang 4', true], [5, 'T5', 'Tiang 5', true]]);
  assert.deepStrictEqual(sh.db_Tiang.data.slice(6), [['', '', '', ''], ['', '', '', '']], 'sisa baris lama dikosongkan, header tetap');
  assert.deepStrictEqual(sh.db_Tiang.data[0], ['No', 'tiang_id', 'nama', 'aktif']);
  assert.deepStrictEqual(sh.db_Tiang_Sirkuit.data[1], [1, 's1', 'T1']);
  assert.deepStrictEqual(Array.from(new Set(dipakai)).sort(), ['db_Segmen', 'db_Switching', 'db_Tiang', 'db_Tiang_Sirkuit']);
  assert.strictEqual(JSON.parse(g.PropertiesService.getScriptProperties().getProperty('TIANG_TARIK_TERAKHIR')).tabel.tiang_tiang.baris, 5);
});

test('tarikDataTiang_: teks mirip angka / waktu diberi awalan apostrof (tetap teks di Sheet); path foto Hostinger tidak ditulis sebagai id Drive; arsip foto dijalankan lebih dulu', () => {
  const server = { tiang_tiang: [{ No: 1, tiang_id: '1001', nama: '0012', aktif: true, foto_tiang_id: 'PLS/1001_TIANG_ab12.jpg', foto_kepala_id: '1AbCdriveId' }] };
  const { g, sh } = duniaTarik({ server, lembar: {} });
  const hdr = ['No', 'tiang_id', 'nama', 'aktif', 'foto_tiang_id', 'foto_kepala_id'];
  sh.db_Tiang.data[0] = hdr;
  const asli = g.tabelTiangSisi_;
  g.tabelTiangSisi_ = (nama) => (nama === 'db_Tiang' ? { sheet: sh.db_Tiang, header: hdr, rows: [] } : asli(nama));
  let arsip = 0;
  g.arsipFotoTiang_ = () => { arsip++; return { selesai: true, diarsip: 0, gagal: [] }; };
  const h = g.tarikDataTiang_({});
  assert.strictEqual(arsip, 1);
  assert.deepStrictEqual(sh.db_Tiang.data[1], [1, "'1001", "'0012", true, '', '1AbCdriveId']);
  assert.strictEqual(h.fotoBelumArsip, 1);
  assert.deepStrictEqual([g.nilaiTeksSheet_('2026-11-11T01:00:00Z'), g.nilaiTeksSheet_('1.2E+15'), g.nilaiTeksSheet_('BARU-0001'), g.nilaiTeksSheet_('T1')],
    ["'2026-11-11T01:00:00Z", "'1.2E+15", 'BARU-0001', 'T1']);
});

test('tarikDataTiang_: server kosong tidak menghapus Sheet berisi (kecuali paksa); TIANG_API_URL kosong = ditolak (Sheet masih sumber data)', () => {
  const { g, sh } = duniaTarik({ server: {}, lembar: { db_Tiang: [[1, 'T1', 'ada', true]] } });
  const h = g.tarikDataTiang_({});
  assert.match(h.tabel.tiang_tiang.dilewati, /server kosong, Sheet berisi 1 baris/);
  assert.deepStrictEqual(sh.db_Tiang.data[1], [1, 'T1', 'ada', true], 'tidak ditimpa');
  g.tarikDataTiang_({ paksa: true });
  assert.deepStrictEqual(sh.db_Tiang.data[1], ['', '', '', ''], 'paksa = menimpa');
  const mati = duniaTarik({ api: false, server: { tiang_tiang: [{ No: 1, tiang_id: 'T1', nama: 'x', aktif: true }] } });
  assert.strictEqual(kodeError(() => mati.g.tarikDataTiang_({})), 'SALINAN_BELUM_AKTIF');
  assert.strictEqual(mati.permintaan.length, 0, 'tidak menghubungi server sama sekali');
  assert.ok(mati.g.tarikDataTiang_({ paksa: true }).tabel.tiang_tiang);
});

function duniaArsip({ gagalId = [] } = {}) {
  const g = buatKonteks({ ...PROPS_DUNIA, MYSQL_API_URL: 'https://contoh.id/sisi-api-staging/', MYSQL_API_SECRET: RHS });
  const foto = [['TIANG', 'T1', 'TIANG'], ['TIANG', 'T2', 'TIANG'], ['SWITCHING', 'SWC-0001', 'UNIT'], ['TIANG', 'T3', 'KEPALA']].map(([pemilik, id, slot]) => ({ pemilik, id, slot, sha256: crypto.createHash('sha256').update(id + slot).digest('hex'), bytes: 5 }));
  const ditandai = [], simpan = [], permintaan = [];
  const isi = Buffer.from([0xff, 0xd8, 1, 2, 3]);
  g.UrlFetchApp = { fetch: (url, o) => {
    const b = JSON.parse(o.payload);
    permintaan.push(b);
    let data, kode = 200, balas = null;
    if (b.jenis === 'foto_belum_arsip') {
      const sisa = foto.filter((f) => !ditandai.some((d) => d.id === f.id && d.slot === f.slot));
      data = { foto: sisa.slice(b.lewati || 0, (b.lewati || 0) + b.batas), sisa: sisa.length };
    } else if (b.jenis === 'foto_unduh') {
      if (gagalId.includes(b.id)) { kode = 404; balas = { ok: false, kode: 'FOTO_TIDAK_ADA' }; } else data = { sha256: 'x', mime: 'image/jpeg', ukuranByte: isi.length, data: isi.toString('base64'), folder: 'PLS' };
    } else if (b.jenis === 'tandai_arsip') { ditandai.push(b); data = { ditandai: true }; }
    else if (b.jenis === 'ruang') data = { foto_berkas: 4, foto_bytes: 2 * 1048576, belum_arsip: 0 };
    return { getResponseCode: () => kode, getContentText: () => JSON.stringify(balas || { ok: true, data }) };
  } };
  g.simpanFotoLapangan_ = (akar, bagian, penanda, nama, bytes) => { simpan.push({ akar, bagian: Array.from(bagian), penanda, nama, n: bytes.length }); return { fileId: 'drive-' + nama }; };
  return { g, foto, ditandai, simpan, permintaan };
}

test('arsipFotoTiang_: foto diunduh dari Hostinger, disimpan ke Drive dengan struktur folder lama, lalu ditandai; satu gagal tidak menghalangi yang lain', () => {
  const { g, simpan, ditandai, foto } = duniaArsip({ gagalId: ['T2'] });
  const h = g.arsipFotoTiang_();
  assert.deepStrictEqual([h.selesai, h.diarsip, h.gagal.length], [true, 3, 1]);
  assert.match(h.gagal[0], /TIANG T2 TIANG: MYSQL_GAGAL/);
  assert.deepStrictEqual(simpan.map((s) => [s.bagian, s.nama, s.penanda]), [
    [['Tiang', 'PLS'], 'T1_TIANG.jpg', 'T1|TIANG|' + foto[0].sha256],
    [['Switching', 'SWC-0001'], 'SWC-0001_UNIT.jpg', 'SWC-0001|UNIT|' + foto[2].sha256],
    [['Tiang', 'PLS'], 'T3_KEPALA.jpg', 'T3|KEPALA|' + foto[3].sha256]]);
  assert.ok(simpan.every((s) => s.akar === 'f' && s.n === 5));
  assert.deepStrictEqual(ditandai.map((d) => [d.id, d.slot, d.drive_file_id]), [['T1', 'TIANG', 'drive-T1_TIANG.jpg'], ['SWC-0001', 'UNIT', 'drive-SWC-0001_UNIT.jpg'], ['T3', 'KEPALA', 'drive-T3_KEPALA.jpg']]);
  assert.strictEqual(ditandai[0].sha256, foto[0].sha256, 'sidik yang diunduh ikut saat menandai (server menolak bila foto sudah diganti)');
});

test('arsipFotoTiang_: tanpa TIANG_FOTO_FOLDER_ID = CONFIG_TIDAK_LENGKAP; waktu habis berhenti rapi; cekRuangTiang_ memberi peringatan di atas ambang', () => {
  const { g } = duniaArsip();
  g.PropertiesService.getScriptProperties().deleteProperty('TIANG_FOTO_FOLDER_ID');
  assert.strictEqual(kodeError(() => g.arsipFotoTiang_()), 'CONFIG_TIDAK_LENGKAP');
  const { g: g2 } = duniaArsip();
  g2.TIANG_IMPOR_MS_ = -1;
  const h = g2.arsipFotoTiang_();
  assert.deepStrictEqual([h.selesai, h.diarsip], [false, 0]);
  const { g: g3 } = duniaArsip();
  g3.PropertiesService.getScriptProperties().setProperty('TIANG_FOTO_BATAS_MB', '1');
  assert.strictEqual(g3.cekRuangTiang_().melewati, true);
  assert.ok(g3.PropertiesService.getScriptProperties().getProperty('TIANG_RUANG_PERINGATAN'));
  const { g: g4 } = duniaArsip();
  assert.strictEqual(g4.cekRuangTiang_().melewati, false, 'bawaan 12000 MB');
});

test('pemicu tiang: dipasang sekali (yang lama diganti), per jam tiap langkah berdiri sendiri, malam menarik data', () => {
  const g = buatKonteks(PROPS_DUNIA);
  g.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  const pemicu = [{ fn: 'ADMIN_pemicuTiangJam', id: 'lama' }, { fn: 'LAIN', id: 'lain' }];
  const buat = [];
  const bangun = (fn) => { const o = { fn }; const b = { timeBased: () => b, everyHours: (n) => { o.jam = n; return b; }, everyDays: (n) => { o.hari = n; return b; }, atHour: (n) => { o.atHour = n; return b; }, nearMinute: (n) => { o.menit = n; return b; }, inTimezone: (z) => { o.zona = z; return b; }, create: () => { buat.push(o); } }; return b; };
  g.ScriptApp = { getProjectTriggers: () => pemicu.map((p) => ({ getHandlerFunction: () => p.fn, id: p.id })), deleteTrigger: (t) => { pemicu.splice(pemicu.findIndex((p) => p.id === t.id), 1); }, newTrigger: bangun };
  g.ADMIN_pasangPemicuTiang();
  assert.deepStrictEqual(pemicu.map((p) => p.fn), ['LAIN'], 'pemicu tiang lama dihapus, pemicu lain utuh');
  assert.deepStrictEqual(buat, [{ fn: 'ADMIN_pemicuTiangJam', jam: 1 }, { fn: 'ADMIN_pemicuTiangMalam', hari: 1, atHour: 1, menit: 30, zona: 'Asia/Jakarta' }]);
  const dipanggil = [];
  g.sinkronCabutTiketTiang_ = () => { dipanggil.push('cabut'); throw new Error('mati'); };
  g.imporMasterTiang_ = () => { dipanggil.push('master'); };
  g.arsipFotoTiang_ = () => { dipanggil.push('arsip'); };
  g.cekRuangTiang_ = () => { dipanggil.push('ruang'); };
  g.tarikDataTiang_ = () => { dipanggil.push('tarik'); };
  const err = console.error; console.error = () => {};
  try { g.ADMIN_pemicuTiangJam(); g.ADMIN_pemicuTiangMalam(); } finally { console.error = err; }
  assert.deepStrictEqual(dipanggil, ['cabut', 'master', 'arsip', 'ruang', 'tarik'], 'galat cabut tidak menghentikan langkah lain');
});

test('cekRuangTiang_: cadangan harian tidak ada / lebih dari 36 jam = terlambat (cron mati diam-diam ketahuan), baru = aman', () => {
  const g = buatKonteks({ ...PROPS_DUNIA, MYSQL_API_URL: 'https://contoh.id/sisi-api-staging/', MYSQL_API_SECRET: RHS });
  let cadangan = null;
  g.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, data: { foto_berkas: 1, foto_bytes: 1, belum_arsip: 0, cadangan } }) }) };
  const warn = console.warn; const dicatat = []; console.warn = (x) => dicatat.push(x);
  try {
    assert.strictEqual(g.cekRuangTiang_().cadanganTerlambat, true, 'belum pernah berjalan');
    assert.match(dicatat[0], /belum pernah berjalan/);
    cadangan = { waktu: new Date(Date.now() - 40 * 3600 * 1000).toISOString(), berkas: 'x' };
    assert.strictEqual(g.cekRuangTiang_().cadanganTerlambat, true);
    assert.match(dicatat[1], /terakhir 40 jam lalu/);
    assert.ok(g.PropertiesService.getScriptProperties().getProperty('TIANG_CADANGAN_PERINGATAN'));
    cadangan = { waktu: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), berkas: 'x' };
    dicatat.length = 0;
    assert.strictEqual(g.cekRuangTiang_().cadanganTerlambat, false);
    assert.deepStrictEqual(dicatat, [], 'cadangan baru: tidak ada peringatan');
  } finally {
    console.warn = warn;
  }
});

// ---------------------------------------------------------------------------------------------------------------------------
// Task 9: pembekuan tulis Apps Script (TIANG_TULIS_BEKU) dan jalur mundur
// ---------------------------------------------------------------------------------------------------------------------------

const TULIS_TIANG = { simpanVerifikasiTiang: 'simpanVerifikasiTiang_', sinkronTiang: 'sinkronTiang_', uploadFotoTiang: 'uploadFotoTiang_', simpanSegmen: 'simpanSegmen_', simpanSwitching: 'simpanSwitching_', uploadFotoSwitching: 'uploadFotoSwitching_' };
const BACA_TIANG = { getVerifikasiTiang: 'getVerifikasiTiang_', getTiangJalur: 'getTiangJalur_', getPetaTiang: 'getPetaTiang_', getSegmen: 'getSegmen_', getMasterSwitching: 'getMasterSwitching_', getFotoTiang: 'getFotoTiang_', getFotoSwitching: 'getFotoSwitching_' };
const TULIS_MASTER = { simpanSection: 'simpanSection_', setAktifPenyulang: 'setAktifPenyulang_' };

function duniaBeku(beku) {
  const g = buatKonteks({ ...PROPS_DUNIA, ...(beku === undefined ? {} : { TIANG_TULIS_BEKU: beku }) });
  const panggilan = [];
  g.guard_ = () => ({ role: 'ADMIN', userId: 'u-admin', username: 'a' });
  [...Object.values(TULIS_TIANG), ...Object.values(BACA_TIANG), ...Object.values(TULIS_MASTER)].forEach((n) => { g[n] = () => { panggilan.push(n); return { ok: 1 }; }; });
  const coba = (aksi, platform = 'MOBILE') => kodeError(() => g.proses_({ action: aksi, token: 't', data: {} }, platform));
  return { g, panggilan, coba };
}

test('TIANG_TULIS_BEKU=YA: keenam endpoint TULIS tiang ditolak PINDAH_HOSTINGER di HP maupun website dan fungsinya tidak dijalankan', () => {
  const { panggilan, coba } = duniaBeku('YA');
  for (const platform of ['MOBILE', 'WEB']) {
    for (const aksi of Object.keys(TULIS_TIANG)) assert.strictEqual(coba(aksi, platform), 'PINDAH_HOSTINGER', aksi + ' / ' + platform);
  }
  assert.deepStrictEqual(panggilan, [], 'tidak ada penulisan sempat jalan');
});

test('TIANG_TULIS_BEKU=YA: endpoint BACA tiang dan tulis Master Jaringan (simpanSection, setAktifPenyulang) tetap jalan', () => {
  const { panggilan, coba } = duniaBeku('YA');
  for (const aksi of [...Object.keys(BACA_TIANG), ...Object.keys(TULIS_MASTER)]) assert.strictEqual(coba(aksi), null, aksi + ' harus lolos');
  assert.deepStrictEqual(panggilan, [...Object.values(BACA_TIANG), ...Object.values(TULIS_MASTER)]);
});

test('TIANG_TULIS_BEKU: kosong / tidak ada / TIDAK = perilaku lama (tulis jalan); "ya" berspasi tetap membekukan', () => {
  for (const nilai of [undefined, '', 'TIDAK', 'tidak']) {
    const { panggilan, coba } = duniaBeku(nilai);
    for (const aksi of Object.keys(TULIS_TIANG)) assert.strictEqual(coba(aksi), null, aksi + ' dengan ' + JSON.stringify(nilai));
    assert.strictEqual(panggilan.length, 6);
  }
  assert.strictEqual(duniaBeku('  ya ').coba('simpanSegmen'), 'PINDAH_HOSTINGER');
});

test('TIANG_TULIS_BEKU=YA: pemanggil tanpa sesi sah tetap mendapat galat sesi (bukan bocoran status pembekuan)', () => {
  const g = buatKonteks({ ...PROPS_DUNIA, TIANG_TULIS_BEKU: 'YA' });
  const kode = kodeError(() => g.proses_({ action: 'simpanSegmen', token: 'token-ngawur', data: {} }, 'MOBILE'));
  assert.notStrictEqual(kode, 'PINDAH_HOSTINGER');
  assert.ok(kode, 'ditolak guard');
});

test('jalur mundur: pembekuan dibuka lagi dan tulis lama jalan kembali; tarik penuh tetap bisa dengan paksa walau TIANG_API_URL sudah dikosongkan', () => {
  const { g, coba, panggilan } = duniaBeku('YA');
  assert.strictEqual(coba('simpanVerifikasiTiang'), 'PINDAH_HOSTINGER');
  g.PropertiesService.getScriptProperties().deleteProperty('TIANG_TULIS_BEKU');
  assert.strictEqual(coba('simpanVerifikasiTiang'), null);
  assert.deepStrictEqual(panggilan, ['simpanVerifikasiTiang_']);
  assert.strictEqual(g.infoVersi_().tiangApi, '', 'TIANG_API_URL kosong = HP memakai jalur lama');
});

test('impor satu tabel tidak memakai / menyimpan kemajuan (tidak mengganggu impor penuh yang sedang berjalan)', () => {
  const { g } = duniaImpor({ tiang_tiang: 650 });
  const props = g.PropertiesService.getScriptProperties();
  props.setProperty('TIANG_IMPOR_KEMAJUAN', JSON.stringify({ tiang_jaringan: 2, tiang_tiang: 300 }));
  const h = g.imporTiangKeHostinger_({ tabel: 'tiang_jaringan' });
  assert.strictEqual(h.tabel.tiang_jaringan.terkirim, 2, 'dari awal, bukan dari kemajuan tersimpan');
  assert.deepStrictEqual(JSON.parse(props.getProperty('TIANG_IMPOR_KEMAJUAN')), { tiang_jaringan: 2, tiang_tiang: 300 }, 'kemajuan impor penuh tidak disentuh');
});

test('master jaringan berubah (simpanSection / setAktifPenyulang): tidak menunggu Hostinger; SATU pemicu sekali jalan mengimpor tiang_jaringan lalu menghapus dirinya; mati bila TIANG_API_URL kosong; galat tidak menggagalkan simpan', () => {
  const buat = (api) => {
    const g = buatKonteks({ ...PROPS, ...(api ? { TIANG_API_URL: 'https://contoh.id/sisi-api-staging' } : {}) });
    const impor = [], pemicu = [];
    let n = 0;
    g.guard_ = () => ({ role: 'ADMIN', userId: 'u-admin', username: 'a' });
    g.simpanSection_ = () => ({ ok: 1 });
    g.setAktifPenyulang_ = () => ({ ok: 2 });
    g.imporTiangKeHostinger_ = (o) => { impor.push(o.tabel); return { tabel: { [o.tabel]: { terkirim: 1 } } }; };
    g.ScriptApp = {
      getProjectTriggers: () => pemicu.map((p) => ({ getHandlerFunction: () => p.fn, id: p.id })),
      deleteTrigger: (t) => { pemicu.splice(pemicu.findIndex((p) => p.id === t.id), 1); },
      newTrigger: (fn) => ({ timeBased: () => ({ after: (ms) => ({ create: () => { pemicu.push({ fn, ms, id: ++n }); } }) }) }),
    };
    return { g, impor, pemicu };
  };
  const a = buat(true);
  assert.strictEqual(kodeError(() => a.g.proses_({ action: 'simpanSection', token: 't', data: {} }, 'MOBILE')), null);
  assert.strictEqual(kodeError(() => a.g.proses_({ action: 'setAktifPenyulang', token: 't', data: {} }, 'MOBILE')), null);
  assert.deepStrictEqual(a.impor, [], 'tidak ada impor di dalam permintaan');
  assert.deepStrictEqual(a.pemicu.map((p) => [p.fn, p.ms]), [['ADMIN_pemicuImporJaringanTiang', 60000]], 'satu pemicu walau dua simpan');
  a.g.ADMIN_pemicuImporJaringanTiang();
  assert.deepStrictEqual(a.impor, ['tiang_jaringan']);
  assert.deepStrictEqual(a.pemicu, [], 'pemicu menghapus dirinya');
  const mati = buat(false);
  mati.g.proses_({ action: 'simpanSection', token: 't', data: {} }, 'MOBILE');
  assert.deepStrictEqual([mati.impor, mati.pemicu], [[], []], 'jalur lama: tidak ada impor / pemicu');
  const gagal = buat(true);
  gagal.g.ScriptApp.newTrigger = () => { throw new Error('kuota pemicu habis'); };
  const err = console.error; console.error = () => {};
  try { assert.strictEqual(kodeError(() => gagal.g.proses_({ action: 'simpanSection', token: 't', data: {} }, 'MOBILE')), null, 'simpan tetap berhasil'); } finally { console.error = err; }
});

test('imporMasterTiang_: keempat tab master diimpor satu per satu', () => {
  const { g, kirim } = duniaImpor({});
  g.PropertiesService.getScriptProperties().setProperty('TIANG_API_URL', 'https://contoh.id/sisi-api-staging');
  const h = g.imporMasterTiang_();
  assert.deepStrictEqual(Object.keys(h), ['tiang_jaringan', 'tiang_konstruksi', 'tiang_ukuran', 'tiang_pemetaan']);
  assert.deepStrictEqual(kirim.map((k) => k.body.tabel), ['tiang_jaringan'], 'hanya tab yang ada di Sheet yang dikirim');
});
