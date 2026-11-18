const test = require('node:test');
const assert = require('node:assert');
const { buatKonteks } = require('./harness');
const { sheetPalsu, j } = require('./gudangUji');

const PROPS = { ENV: 'staging', MASTER_SHEET_ID: 'm', AUTH_SHEET_ID: 'a', KODE_ULP: '16130', ADMIN_EMAIL: 'x@y.z', TIANG_SHEET_ID: 't', TIANG_GIS_SHEET_ID: 'g' };
const G0 = buatKonteks(PROPS);

// ---------- murni ----------

test('gis: header dicari lewat nama (huruf besar/kecil, garis bawah), baris judul dilewati, kolom hilang dilaporkan', () => {
  const ok = j(G0.petakanHeaderGis_([['LAPORAN'], ['FID', 'ido_juru_5', 'X', 'y']]));
  assert.deepStrictEqual([ok.baris, ok.idx, ok.hilang], [1, { nama: 1, lng: 2, lat: 3 }, []]);
  const kurang = j(G0.petakanHeaderGis_([['FID', 'ido_juru_5', 'x']]));
  assert.deepStrictEqual(kurang.hilang, ['Y']);
  assert.strictEqual(j(G0.petakanHeaderGis_([['a', 'b']])).baris, -1);
});

test('gis: nama ganda dan koordinat di luar area dilewati; koma desimal diterima; nama dirapikan', () => {
  const nama = ['PLS0001', ' pls0002 ', 'PLS0003', 'PLS0003', 'PLS0004', 'PLS0005', '', 'PLS0006'];
  const lng = [106.5, '106,6', 106.7, 106.7, 106.8, 106.9, 106.1, 0];
  const lat = [-3.1, '-3,2', -3.3, -3.3, 106.5, -3.5, -3.6, 0];   // PLS0004: x / y tertukar
  const s = j(G0.susunKoordinatGis_(nama, lng, lat));
  assert.deepStrictEqual(Object.keys(s.peta).sort(), ['PLS0001', 'PLS0002', 'PLS0005']);
  assert.deepStrictEqual(s.peta.PLS0002, { lat: -3.2, lng: 106.6 });
  assert.deepStrictEqual(s.ringkas, { baris: 7, ambigu: 1, tidakSah: 2 });
});

test('gis: terapkan mengisi hanya lat_gis / lng_gis, tidak mengosongkan, revision naik hanya bila berubah, banding ke ITB', () => {
  const peta = { PLS0001: { lat: -3, lng: 106.5 }, PLS0002: { lat: -3, lng: 106.6 }, PLS0003: { lat: -3, lng: 106.7 }, PLS0005: { lat: -3, lng: 106.9 } };
  const lama = [
    { nama: 'PLS0001', lat_aset: -3, lng_aset: 106.5, lat: -3, lng: 106.5, revision: 1 },                    // ITB sama dengan GIS
    { nama: 'PLS0002', lat_aset: -3.0019, lng_aset: 106.6069, lat: 9, lng: 9, revision: 1 },                 // ITB bergeser ±795 m
    { nama: 'PLS0003', lat_aset: '', lng_aset: '', revision: 1 },                                           // ITB tanpa koordinat
    { nama: 'PLS0004', lat_aset: -3, lng_aset: 106.8, lat_gis: -3.5, lng_gis: 106.8, revision: 4 },          // tanpa pasangan: isi lama tetap
    { nama: 'PLS0005', lat_aset: -3, lng_aset: 106.9, lat_gis: -3, lng_gis: 106.9, revision: 2 }];          // sudah terisi sama
  const h = G0.terapkanKoordinatGis_(lama, peta, { sekarang: '2026-11-17T00:00:00Z' });
  assert.deepStrictEqual(j(h.ringkas), { cocok: 4, tanpaPasangan: 1, ubah: 3, tanpaAset: 1, sama: 2, bergeser: 1, lain: 0 });
  assert.deepStrictEqual(h.berubah, [true, true, true, false, false]);
  assert.deepStrictEqual([lama[1].lat_gis, lama[1].lng_gis, lama[1].lat, lama[1].lat_aset, lama[1].revision, lama[1].diubah_oleh], [-3, 106.6, 9, -3.0019, 2, 'sinkron-gis']);
  assert.deepStrictEqual([lama[3].lat_gis, lama[3].revision, lama[3].diubah_pada], [-3.5, 4, undefined]);
  assert.strictEqual(lama[4].revision, 2);
});

test('gis: koordinat terdaftar = GIS bila lat_gis dan lng_gis lengkap, kalau tidak ITB, kalau tidak ada = null', () => {
  const k = (o) => j(G0.koordinatTerdaftarTiang_(o));
  assert.deepStrictEqual(k({ lat_aset: -3, lng_aset: 106.5, lat_gis: -3.1, lng_gis: 106.6 }), { lat: -3.1, lng: 106.6 });
  assert.deepStrictEqual(k({ lat_aset: '-3,0', lng_aset: '106,5', lat_gis: -3.1, lng_gis: '' }), { lat: -3, lng: 106.5 }, 'GIS separuh = tidak dipakai');
  assert.deepStrictEqual(k({ lat_aset: '', lng_aset: '', lat_gis: -3.1, lng_gis: 106.6 }), { lat: -3.1, lng: 106.6 });
  assert.strictEqual(k({ lat_aset: '', lng_aset: '' }), null);
  assert.deepStrictEqual(k({ lat_aset: -3, lng_aset: 106.5, lat_taksir: -3.2, lng_taksir: 106.7 }), { lat: -3.2, lng: 106.7 }, 'taksiran mengalahkan ITB');
  assert.deepStrictEqual(k({ lat_aset: -3, lng_aset: 106.5, lat_taksir: -3.2, lng_taksir: 106.7, lat_gis: -3.1, lng_gis: 106.6 }), { lat: -3.1, lng: 106.6 }, 'GIS mengalahkan taksiran');
});

test('gis: taksiran = tiang tanpa GIS meminjam selisih dari tetangga; gawang >= 150 m memutus; tetangga terdekat didahulukan', () => {
  const T = (id, lat, lng) => ({ tiang_id: id, lat_aset: lat, lng_aset: lng });
  const tiang = [T('a', -3, 106.5), T('b', -3, 106.5009), T('c', -3, 106.5018), T('d', -3, 106.6), T('e', '', '')];
  const topo = { b: { induk_tiang_id: 'a' }, c: { induk_tiang_id: 'b' }, d: { induk_tiang_id: 'c' }, e: { induk_tiang_id: 'd' } };
  const gis = { a: { lat: -3.002, lng: 106.507 } };
  const t = j(G0.taksirKoordinatTiang_(tiang, gis, topo));
  assert.deepStrictEqual(Object.keys(t).sort(), ['b', 'c'], 'a punya GIS; d terputus (gawang jauh); e tanpa koordinat');
  assert.ok(Math.abs(t.b.lat - -3.002) < 1e-9 && Math.abs(t.b.lng - 106.5079) < 1e-9);
  assert.ok(Math.abs(t.c.lng - 106.5088) < 1e-9, 'merambat dua langkah');
  assert.deepStrictEqual(j(G0.taksirKoordinatTiang_(tiang, {}, topo)), {}, 'tanpa GIS sama sekali tidak ada taksiran');
});

test('gis: migrasi ITB menghitung gawang + tanda cek dari koordinat terdaftar; lat / lng berlaku mengikuti GIS hanya bila sumbernya aset', () => {
  // koordinat ITB tiang 2 dan 3 bergeser ±795 m (212 m selatan, 765 m timur), koordinat GIS benar: gawang ±50 m
  const gis = [[-3, 106.5], [-3, 106.50045], [-3, 106.5009]];
  const itb = [[-3, 106.5], [-3 - 0.0019, 106.50045 + 0.0069], [-3 - 0.0019, 106.5009 + 0.0069]];
  const sumber = itb.map((c, i) => ({ tiang_id: 'T' + (i + 1), nama: 'PLS000' + (i + 1), kode_nama_aset: 'PLS', segmen_aset: 'SEGMEN A - B', lat_aset: c[0], lng_aset: c[1],
    konstruksi_aset: '', jenis_tiang_aset: '', ukuran_tiang_aset: '', kelas_area: '', status_aset: 'OPERATING' }));
  const lama = (denganGis) => itb.map((c, i) => ({ No: i + 1, tiang_id: 'T' + (i + 1), nama: 'PLS000' + (i + 1), lat_aset: c[0], lng_aset: c[1], lat: c[0], lng: c[1],
    sumber_koordinat: 'aset', status_verifikasi: 'BELUM', aktif: true, revision: 1, lat_gis: denganGis ? gis[i][0] : '', lng_gis: denganGis ? gis[i][1] : '' }));
  const ctx = { bulan: '2026-11', sekarang: '2026-11-17T00:00:00Z', uuid: G0.uuid_ };
  const tanpa = j(G0.gabungMigrasiTiang_(sumber.map((s) => ({ ...s })), lama(false), [], ctx));
  assert.deepStrictEqual(tanpa.sirkuit.map((x) => x.tanda_cek_gawang), ['tanpa_induk', 'gawang_panjang', ''], 'tanpa GIS: gawang T1-T2 ±795 m');
  const h = G0.gabungMigrasiTiang_(sumber.map((s) => ({ ...s })), lama(true), [], ctx);
  const r = j(h);
  assert.deepStrictEqual(r.sirkuit.map((x) => x.tanda_cek_gawang), ['tanpa_induk', '', ''], 'dengan GIS: tidak ada tanda');
  assert.ok(r.sirkuit[1].gawang_m > 40 && r.sirkuit[1].gawang_m < 60, 'gawang dari koordinat GIS: ' + r.sirkuit[1].gawang_m);
  assert.deepStrictEqual(r.tiang.map((t) => [t.lat, t.lng]), gis, 'sumber aset: koordinat berlaku = GIS');
  assert.deepStrictEqual(r.tiang.map((t) => [t.lat_aset, t.lng_aset]), itb, 'kolom ITB tidak diubah');
  // tiang yang sudah diverifikasi lapangan: koordinat berlaku tidak ditimpa GIS
  const l2 = lama(true); l2[1].sumber_koordinat = 'lapangan'; l2[1].lat = -3.0001; l2[1].lng = 106.5004;
  const r2 = j(G0.gabungMigrasiTiang_(sumber.map((s) => ({ ...s })), l2, [], ctx));
  assert.deepStrictEqual([r2.tiang[1].lat, r2.tiang[1].lng, r2.tiang[1].sumber_koordinat], [-3.0001, 106.5004, 'lapangan']);
});

test('gis: migrasi mengisi lat_taksir / lng_taksir untuk tiang tanpa GIS dari tetangga ber-GIS; lat / lng berlaku, gawang ikut; ITB tak berubah', () => {
  const gis = [[-3, 106.5], [-3, 106.50045]];
  const itb = [[-3, 106.5], [-3 - 0.0019, 106.50045 + 0.0069], [-3 - 0.0019, 106.5009 + 0.0069]];
  const sumber = itb.map((c, i) => ({ tiang_id: 'T' + (i + 1), nama: 'PLS000' + (i + 1), kode_nama_aset: 'PLS', segmen_aset: 'SEGMEN A - B', lat_aset: c[0], lng_aset: c[1],
    konstruksi_aset: '', jenis_tiang_aset: '', ukuran_tiang_aset: '', kelas_area: '', status_aset: 'OPERATING' }));
  const lama = itb.map((c, i) => ({ No: i + 1, tiang_id: 'T' + (i + 1), nama: 'PLS000' + (i + 1), lat_aset: c[0], lng_aset: c[1], lat: c[0], lng: c[1],
    sumber_koordinat: 'aset', status_verifikasi: 'BELUM', aktif: true, revision: 1, lat_gis: i < 2 ? gis[i][0] : '', lng_gis: i < 2 ? gis[i][1] : '' }));
  const r = j(G0.gabungMigrasiTiang_(sumber, lama, [], { bulan: '2026-11', sekarang: '2026-11-17T00:00:00Z', uuid: G0.uuid_ }));
  assert.deepStrictEqual(r.tiang.map((t) => [t.lat_taksir || '', t.lng_taksir || '']), [['', ''], ['', ''], [-3, 106.5009]], 'hanya T3 ditaksir; selisih dipinjam dari T2');
  assert.deepStrictEqual([r.tiang[2].lat, r.tiang[2].lng, r.tiang[2].lat_aset, r.tiang[2].lng_aset], [-3, 106.5009, itb[2][0], itb[2][1]]);
  assert.deepStrictEqual(r.sirkuit.map((x) => x.tanda_cek_gawang), ['tanpa_induk', '', ''], 'gawang T2-T3 ±50 m, bukan ±795 m');
});

// ---------- sheet ----------

function dunia({ gis, tiang } = {}) {
  const g = buatKonteks(PROPS), log = [], buat = sheetPalsu(log);
  const sheets = { m: {}, a: {}, t: {}, g: { 'Tiang TBL': buat('Tiang TBL', gis || [
    ['FID', 'objectid', 'ido_juru_5', 'x', 'y', 'ido_feeder'],
    [1, 1, 'PLS0001', 106.5, -3, 2117], [2, 2, 'PLS0002', 106.6, -3, 2117], [3, 3, 'PLS0009', 106.9, -3.5, 2117]]) } };
  g.SpreadsheetApp = { openById: (id) => ({ getName: () => 'x', getSheetByName: (n) => (sheets[id] || {})[n], insertSheet: (n) => { sheets[id][n] = buat(n, [[]]); return sheets[id][n]; } }) };
  g.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  const diam = (fn) => { const a = [console.log, console.warn, console.error]; console.log = console.warn = console.error = () => {}; try { return fn(); } finally { [console.log, console.warn, console.error] = a; } };
  diam(() => g.ADMIN_siapkanSheetTiang());
  const H = g.skemaHeader_().TIANG_SHEET_ID.db_Tiang;
  (tiang || [['1001', 'PLS0001', -3, 106.5], ['1002', 'PLS0002', -3.0019, 106.6069], ['1003', 'PLS0003', -3, 106.7]]).forEach((t, i) => {
    const o = { No: i + 1, tiang_id: t[0], nama: t[1], lat_aset: t[2], lng_aset: t[3], lat: t[2], lng: t[3], aktif: true, revision: 1, status_verifikasi: 'BELUM' };
    sheets.t.db_Tiang.data.push(H.map((h) => (h in o ? o[h] : '')));
  });
  const baris = () => sheets.t.db_Tiang.data.slice(1).map((b) => Object.fromEntries(H.map((h, i) => [h, b[i]])));
  return { g, sheets, log, diam, baris, H };
}

test('gis: db_Tiang punya kolom lat_gis / lng_gis / lat_taksir / lng_taksir di belakang (tab lama cukup diperpanjang)', () => {
  const { g } = dunia();
  const h = g.TIANG_HEADER_.db_Tiang;
  assert.deepStrictEqual(j(h.slice(-5)), ['sisi_jalan', 'lat_gis', 'lng_gis', 'lat_taksir', 'lng_taksir']);
});

test('gis: cek tidak menulis; isi menulis hanya lat_gis / lng_gis; ulang tidak menulis lagi; ringkasan tersimpan', () => {
  const x = dunia();
  const tulis0 = x.log.filter((l) => l === 'TULIS:db_Tiang').length;
  const cek = x.diam(() => j(x.g.ADMIN_cekKoordinatGis()));
  assert.deepStrictEqual([cek.cocok, cek.ubah, cek.tanpaPasangan, cek.sama, cek.bergeser], [2, 2, 1, 1, 1]);
  assert.ok(x.baris().every((b) => b.lat_gis === '' || b.lat_gis === undefined), 'cek tidak mengisi kolom');
  assert.strictEqual(x.log.filter((l) => l === 'TULIS:db_Tiang').length, tulis0, 'cek tidak menulis');
  const r = x.diam(() => j(x.g.ADMIN_isiKoordinatGis()));
  assert.strictEqual(r.ubah, 2);
  const t = x.baris();
  assert.deepStrictEqual(t.map((b) => [b.lat_gis, b.lng_gis]), [[-3, 106.5], [-3, 106.6], ['', '']]);
  assert.deepStrictEqual([t[1].lat_aset, t[1].lng_aset, t[1].lat, t[1].lng, t[1].revision, t[1].diubah_oleh], [-3.0019, 106.6069, -3.0019, 106.6069, 2, 'sinkron-gis']);
  assert.strictEqual(t[2].revision, 1, 'tanpa pasangan tidak disentuh');
  const info = JSON.parse(x.g.PropertiesService.getScriptProperties().getProperty('TIANG_GIS_SINKRON'));
  assert.deepStrictEqual([info.uji, info.pasangan, info.sumber.baris], [false, 3, 3]);
  const tulis = x.log.filter((l) => l === 'TULIS:db_Tiang').length;
  const r2 = x.diam(() => j(x.g.ADMIN_isiKoordinatGis()));
  assert.strictEqual(r2.ubah, 0);
  assert.strictEqual(x.log.filter((l) => l === 'TULIS:db_Tiang').length, tulis, 'tidak ada perubahan = tidak menulis');
});

test('gis: hanya 3 kolom GIS yang dibaca (bukan seluruh sheet lebar)', () => {
  const x = dunia();
  x.diam(() => x.g.ADMIN_cekKoordinatGis());
  assert.ok(!x.log.includes('BACA_PENUH:Tiang TBL'));
});

test('gis: konfigurasi atau kolom wajib hilang = ditolak tanpa menulis', () => {
  const tanpaId = buatKonteks({ ...PROPS, TIANG_GIS_SHEET_ID: undefined });
  tanpaId.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  assert.throws(() => tanpaId.ADMIN_cekKoordinatGis(), (e) => e.kode === 'CONFIG_TIDAK_LENGKAP');
  const x = dunia({ gis: [['FID', 'ido_juru_5', 'x'], [1, 'PLS0001', 106.5]] });
  assert.throws(() => x.diam(() => x.g.ADMIN_isiKoordinatGis()), (e) => e.kode === 'KOLOM_WAJIB_HILANG' && /Y/.test(e.message));
  assert.ok(x.baris().every((b) => b.revision === 1));
});
