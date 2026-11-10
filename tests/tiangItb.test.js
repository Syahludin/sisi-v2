const test = require('node:test');
const assert = require('node:assert');
const { buatKonteks } = require('./harness');
const { sheetPalsu, kodeError, j } = require('./gudangUji');

const PROPS = { ENV: 'staging', MASTER_SHEET_ID: 'm', AUTH_SHEET_ID: 'a', KODE_ULP: '16130', ADMIN_EMAIL: 'x@y.z', TIANG_SHEET_ID: 't', MASTER_ITB_SHEET_ID: 'i' };
const G = buatKonteks(PROPS);

// ---------- murni ----------

test('itb: nama tiang diurai (jalur utama, cabang, sisipan, tidak baku)', () => {
  const a = j(G.uraiNamaTiang_('TIANG TM PLS0908.C0215.B0071A'));
  assert.deepStrictEqual([a.bersih, a.kode, a.sisip, a.segmen.map((s) => s.h + s.n)], ['PLS0908.C0215.B0071A', 'PLS', 'A', ['PLS908', 'C215', 'B71']]);
  assert.strictEqual(G.namaSegmenTiang_(a.segmen, a.sisip), 'PLS0908.C0215.B0071A');
  const b = j(G.uraiNamaTiang_('  tiang  tm  TKL0920 '));
  assert.deepStrictEqual([b.bersih, b.kode, b.segmen.length], ['TKL0920', 'TKL', 1]);
  for (const x of ['TIANG TM TIANG TB0397', 'TIANG TM 0400015553', 'TIANG TM BIK0451S1']) assert.strictEqual(G.uraiNamaTiang_(x).segmen, null, x);
});

test('itb: header dicari lewat nama, bukan posisi; baris judul, alias, kolom tambahan, kolom berpola', () => {
  const nilai = [['DATA ASET TIANG', '', ''], [], ['Kolom Baru', 'Asset Num', 'Description', 'LATITUDE_Y', 'Longitude X', 'KODE_KONSTRUKSI_1', 'KODE_KONSTRUKSI_2', 'SubClass']];
  const { aturan } = G.aturanPemetaanTiang_([]);
  const p = j(G.petakanHeaderTiang_(nilai, aturan));
  assert.strictEqual(p.baris, 2);
  assert.deepStrictEqual(p.idx, { tiang_id: 1, nama: 2, lat_aset: 3, lng_aset: 4, subclass: 7 });
  assert.deepStrictEqual(p.konstruksi, [5, 6]);
  assert.deepStrictEqual(p.wajibHilang, []);
  assert.deepStrictEqual(p.tidakDikenal, ['Kolom Baru']);
  const hilang = j(G.petakanHeaderTiang_([['ASSETNUM', 'DESCRIPTION', 'LATITUDEY']], aturan));
  assert.deepStrictEqual(hilang.wajibHilang, ['lng_aset']);
  assert.strictEqual(j(G.petakanHeaderTiang_([['x', 'y']], aturan)).baris, -1);
});

test('itb: alias tambahan dari db_Tiang_Pemetaan (aktif saja), kolom_logis asing dilaporkan, wajib bisa diubah', () => {
  const peta = G.aturanPemetaanTiang_([
    { kolom_logis: 'lat_aset', alias: 'LAT_Y | GARIS LINTANG', wajib: '', aktif: true },
    { kolom_logis: 'ssot_number', alias: 'SSOT_X', wajib: 'ya', aktif: 'TRUE' },
    { kolom_logis: 'nama', alias: 'URAIAN', aktif: false },
    { kolom_logis: 'asing', alias: 'X', aktif: true },
  ]);
  assert.ok(peta.aturan.lat_aset.alias.LATY && peta.aturan.lat_aset.alias.GARISLINTANG);
  assert.strictEqual(peta.aturan.ssot_number.wajib, true);
  assert.ok(!peta.aturan.nama.alias.URAIAN, 'baris nonaktif diabaikan');
  assert.deepStrictEqual(j(peta.abaikan), ['asing']);
});

test('itb: susun tiang TM saja, ID ganda baris pertama, koordinat koma desimal, status bawaan', () => {
  const nilai = [['ASSETNUM', 'DESCRIPTION', 'SUBCLASS', 'STATUS', 'LATITUDEY', 'LONGITUDEX', 'PARENT', 'KODE_KONSTRUKSI_1'],
    [17074727, 'TIANG TM PLS0001', 'Tiang TM', 'OPERATING', '-2,6128', '106,1125', 'SEGMEN A - B', 'A1'],
    ['17074728', 'TIANG TM PLS0002', 'Tiang TM', '', -2.6129, 106.1126, '', 'A1'],
    ['17074729', 'TIANG TR TKL0001', 'Tiang TR', 'OPERATING', -2.7, 106.2, '', ''],
    ['17074727', 'TIANG TM PLS0001', 'Tiang TM', 'OPERATING', -2.6, 106.1, '', ''],
    ['', 'TIANG TM PLS0003', 'Tiang TM', '', 1, 1, '', ''],
    ['17074730', 'TIANG TM PLS0004', 'Tiang TM', 'OPERATING', '', '', '', ''],
    [null, null, null],
  ];
  const s = G.susunTiangItb_(nilai, []);
  assert.deepStrictEqual(j(s.ringkas), { baris: 6, tm: 3, bukanTm: 1, tanpaKunci: 1, idGanda: 1 });
  const t = j(s.tiang);
  assert.deepStrictEqual(t.map((x) => x.tiang_id), ['17074727', '17074728', '17074730']);
  assert.deepStrictEqual([t[0].lat_aset, t[0].lng_aset, t[0].segmen_aset, t[0].konstruksi_aset, t[0].nama], [-2.6128, 106.1125, 'SEGMEN A - B', 'A1', 'PLS0001']);
  assert.strictEqual(t[1].status_aset, 'OPERATING', 'status kosong = OPERATING');
  assert.deepStrictEqual([t[2].lat_aset, t[2].lng_aset], ['', ''], 'koordinat kosong bukan 0');
  const tanpaSub = G.susunTiangItb_([['ASSETNUM', 'DESCRIPTION', 'LATITUDEY', 'LONGITUDEX'], ['1', 'TIANG TM PLS0001', -2.6, 106.1], ['2', 'TIANG TR PLS0002', -2.6, 106.1]], []);
  assert.strictEqual(tanpaSub.tiang.length, 1, 'tanpa kolom SUBCLASS: dari deskripsi');
});

const T = (id, nama, lat, lng, st = 'OPERATING') => ({ tiang_id: id, nama, lat_aset: lat, lng_aset: lng, status_aset: st, nama_ganda: false });
// gawang ~ 55 m: 0.0005 derajat bujur di lintang -3 = 55,5 m
const lng = (n) => 106.5 + n * 0.0005;

test('itb: topologi: induk = tiang sebelumnya, sisipan, cabang, peran titik, tanda gawang', () => {
  const tiang = [
    T('1', 'PLS0001', -3, lng(0)), T('2', 'PLS0002', -3, lng(1)), T('3', 'PLS0002A', -3, lng(2)), T('4', 'PLS0003', -3, lng(3)),
    T('5', 'PLS0002.C0001', -3.0005, lng(1)), T('6', 'PLS0002.C0002', -3.001, lng(1)),
    T('9', 'PLS0009', -3, lng(40)),            // gawang jauh (lompat nomor) = gawang_panjang
    T('10', 'TIANG TIANG TB0001', -3, lng(0)), // nama tidak baku
    T('11', 'PLS0100', -3, 106.5, 'INVALID'),
  ];
  const h = j(G.hitungTopologiTiang_(tiang));
  assert.strictEqual(h['1'].induk_tiang_id, '', 'tiang pertama jalur utama: tanpa induk');
  assert.strictEqual(h['1'].tanda_cek_gawang, 'tanpa_induk');
  assert.strictEqual(h['2'].induk_tiang_id, '1');
  assert.strictEqual(h['3'].induk_tiang_id, '2', 'sisipan 2A sesudah 2');
  assert.strictEqual(h['4'].induk_tiang_id, '3', '3 sesudah sisipan 2A');
  assert.strictEqual(h['5'].induk_tiang_id, '2', 'tiang pertama cabang = tiang asal cabang');
  assert.strictEqual(h['6'].induk_tiang_id, '5');
  assert.strictEqual(h['2'].peran_titik, 'percabangan', 'dua anak: 2A dan cabang C0001');
  assert.deepStrictEqual([h['1'].peran_titik, h['4'].peran_titik, h['6'].peran_titik, h['9'].peran_titik], ['biasa', 'biasa', 'ujung', 'ujung']);
  assert.ok(h['2'].gawang_m > 50 && h['2'].gawang_m < 61, 'gawang ' + h['2'].gawang_m);
  assert.strictEqual(h['2'].tanda_cek_gawang, '');
  assert.strictEqual(h['9'].induk_tiang_id, '4');
  assert.strictEqual(h['9'].tanda_cek_gawang, 'gawang_panjang');
  assert.strictEqual(h['10'].tanda_cek_gawang, 'tanpa_induk');
  assert.strictEqual(h['10'].peran_titik, '');
  assert.ok(!('11' in h), 'tiang INVALID tidak ikut topologi');
});

test('itb: zigzag (A-B-C jauh lebih panjang dari A-C), gawang pendek, tak terhitung, tanpa induk jalur putus', () => {
  const zz = j(G.hitungTopologiTiang_([T('1', 'KEP0001', -3, lng(0)), T('2', 'KEP0002', -3.0009, lng(0.5)), T('3', 'KEP0003', -3, lng(1))]));
  assert.ok(zz['2'].tanda_cek_gawang.split('|').includes('zigzag'), zz['2'].tanda_cek_gawang);
  assert.ok(!zz['3'].tanda_cek_gawang.includes('zigzag'));
  const lain = j(G.hitungTopologiTiang_([T('1', 'KEP0001', -3, lng(0)), T('2', 'KEP0002', -3, lng(0) + 0.00001), T('3', 'KEP0003', '', ''), T('4', 'KEP0004.B0001', -3, lng(2))]));
  assert.strictEqual(lain['2'].tanda_cek_gawang, 'gawang_pendek');
  assert.strictEqual(lain['3'].tanda_cek_gawang, 'gawang_tak_terhitung');
  assert.strictEqual(lain['4'].tanda_cek_gawang, 'tanpa_induk', 'asal cabang (KEP0004) tidak ada');
});

test('itb: tanda cek tiang (koordinat, double feeder, nama ganda, tidak baku, INVALID)', () => {
  const a = T('1', 'PLS0001', -3, 106.5), b = T('2', 'PLS0001.C0001', -3, 106.5), c = T('3', 'PLS0002', -3, 106.50002);
  const d = T('4', 'PLS0003', 0, 0), e = T('5', 'PLS0004', -6.2, 106.8), f = T('6', 'PLS0005', '', ''), g = T('7', 'ABC', -3.2, 106.7);
  const dup = T('8', 'PLS0009', -3.3, 106.3); dup.nama_ganda = true;
  const inv = T('9', 'PLS0010', -3, 106.5, 'INVALID');
  const t = j(G.tandaCekTiang_([a, b, c, d, e, f, g, dup, inv]));
  assert.strictEqual(t['1'], 'kemungkinan_double_feeder', 'koordinat sama dengan tiang 2');
  assert.strictEqual(t['2'], 'kemungkinan_double_feeder');
  assert.strictEqual(t['3'], 'kemungkinan_double_feeder', '2,2 m dari tiang 1');
  assert.strictEqual(t['4'], 'koordinat_kosong', '0,0');
  assert.strictEqual(t['5'], 'koordinat_kosong', 'di luar area Babel');
  assert.strictEqual(t['6'], 'koordinat_kosong');
  assert.strictEqual(t['7'], 'nama_tidak_baku');
  assert.strictEqual(t['8'], 'nama_ganda');
  assert.strictEqual(t['9'], 'status_invalid');
});

// ---------- uji menyeluruh dengan sheet palsu ----------

const HDR_ITB = ['SITEID', 'ASSETNUM', 'DESCRIPTION', 'SUBCLASS', 'STATUS', 'PARENT', 'LATITUDEY', 'LONGITUDEX', 'JENIS_TIANG', 'UKURAN_TIANG', 'KODE_KONSTRUKSI_1', 'KODE_KONSTRUKSI_2', 'ASSETCLASSHI', 'SSOTNUMBER', 'EXTRA_BARU'];
const itbBaris = (id, nama, lat, lng, o = {}) => ['6611', id, nama, o.sub || 'Tiang TM', o.status || 'OPERATING', o.parent || 'SEGMEN X - Y', lat, lng, 'BETON', '12 Meter 200 daN', 'A1', 'A1', 'PEDESAAN', 'SSOT' + id, 'x'];
const DATA_ITB = () => [HDR_ITB.slice(),
  itbBaris('1001', 'TIANG TM PLS0001', -3, lng(0)), itbBaris('1002', 'TIANG TM PLS0002', -3, lng(1)), itbBaris('1003', 'TIANG TM PLS0003', -3, lng(2)),
  itbBaris('1004', 'TIANG TM PLS0003.C0001', -3.0005, lng(2)), itbBaris('1005', 'TIANG TR TKL0001', -3, lng(9), { sub: 'Tiang TR' }),
  itbBaris('1006', 'TIANG TM PLS0099', -3.4, lng(3), { status: 'INVALID' }), itbBaris('1007', 'TIANG TM PLS0004', -3, '')];

function dunia(isiItb = DATA_ITB(), props = PROPS, siapkan = true) {
  const g = buatKonteks(props);
  const log = [];
  const buat = sheetPalsu(log);
  const sheets = { m: {}, a: {}, t: {}, i: { db_TiangMaster: buat('db_TiangMaster', isiItb) } };
  g.SpreadsheetApp = { openById: (id) => ({ getName: () => 'ITB ULP Toboali November 2026', getSheetByName: (n) => (sheets[id] || {})[n], insertSheet: (n) => { sheets[id][n] = buat(n, [[]]); return sheets[id][n]; } }) };
  g.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  const diam = (fn) => { const a = [console.log, console.warn, console.error]; console.log = console.warn = console.error = () => {}; try { return fn(); } finally { [console.log, console.warn, console.error] = a; } };
  if (siapkan) diam(() => g.ADMIN_siapkanSheetTiang());
  const H = g.skemaHeader_().TIANG_SHEET_ID;
  const baris = (n) => sheets.t[n].data.slice(1).map((b) => Object.fromEntries(H[n].map((h, i) => [h, b[i]])));
  const ubah = (n, id, o) => { const i = H[n].indexOf('tiang_id'); const b = sheets.t[n].data.slice(1).find((r) => String(r[i]) === id); Object.entries(o).forEach(([k, v]) => { b[H[n].indexOf(k)] = v; }); };
  return { g, sheets, baris, ubah, diam, H, buat };
}

test('itb: migrasi awal: hanya TM, db_Tiang + 1 sirkuit awal per tiang, INVALID tanpa sirkuit, ringkasan tersimpan', () => {
  const x = dunia();
  const cek = x.diam(() => x.g.ADMIN_cekMigrasiTiangItb());
  assert.strictEqual(j(cek).tiangBaru, 6);
  assert.strictEqual(x.baris('db_Tiang').length, 0, 'cek tidak menulis');
  const r = j(x.diam(() => x.g.ADMIN_migrasiTiangItb()));
  assert.deepStrictEqual([r.tiangBaru, r.tiangUbah, r.sirkuitBaru, r.invalid], [6, 0, 5, 1]);
  const t = x.baris('db_Tiang');
  assert.deepStrictEqual(t.map((b) => [Number(b.No), String(b.tiang_id)]), [[1, '1001'], [2, '1002'], [3, '1003'], [4, '1004'], [5, '1006'], [6, '1007']]);
  const o = t[0];
  assert.deepStrictEqual([o.nama, o.kode_nama_aset, o.lat_aset, o.lat, o.sumber_koordinat, o.status_verifikasi, o.jumlah_sirkuit, o.bulan_sumber, o.diubah_oleh, Number(o.revision)],
    ['PLS0001', 'PLS', -3, -3, 'aset', 'BELUM', 1, '2026-11', 'migrasi-itb', 1]);
  assert.strictEqual(o.konstruksi_aset, 'A1', 'kolom berpola digabung, nilai kembar sekali');
  assert.strictEqual(t.find((b) => String(b.tiang_id) === '1006').aktif, false, 'INVALID: aktif FALSE');
  assert.strictEqual(t.find((b) => String(b.tiang_id) === '1007').tanda_cek, 'koordinat_kosong');
  assert.ok(!t.some((b) => String(b.tiang_id) === '1005'), 'tiang TR tidak diimpor');
  const s = x.baris('db_Tiang_Sirkuit');
  assert.deepStrictEqual(s.map((b) => String(b.tiang_id)), ['1001', '1002', '1003', '1004', '1007']);
  assert.deepStrictEqual(s.map((b) => Number(b.No)), [1, 2, 3, 4, 5]);
  const s3 = s.find((b) => String(b.tiang_id) === '1003'), s4 = s.find((b) => String(b.tiang_id) === '1004');
  assert.deepStrictEqual([String(s3.induk_tiang_id), s3.peran_titik, String(s4.induk_tiang_id), s4.peran_titik, s3.segmen_aset, s3.status_verifikasi], ['1002', 'percabangan', '1003', 'ujung', 'SEGMEN X - Y', 'BELUM']);
  assert.match(s3.sirkuit_id, /^[0-9a-f-]{36}$/i);
  assert.ok(Number(s3.gawang_m) > 50 && Number(s3.gawang_m) < 61);
  assert.ok(JSON.parse(x.g.PropertiesService.getScriptProperties().getProperty('TIANG_ITB_SINKRON')).sumber.tm === 6);
});

test('itb: sinkron ulang: tanpa perubahan = tidak ada yang ditulis; kolom verifikasi tetap; hilang diberi keterangan; muncul lagi dipulihkan', () => {
  const x = dunia();
  x.diam(() => x.g.ADMIN_migrasiTiangItb());
  const r2 = j(x.diam(() => x.g.ADMIN_migrasiTiangItb()));
  assert.deepStrictEqual([r2.tiangBaru, r2.tiangUbah, r2.tiangSama, r2.sirkuitBaru, r2.sirkuitUbah], [0, 0, 6, 0, 0], 'idempoten');
  // verifikasi lapangan: koordinat baru dari GPS, jenis tiang dikoreksi, status terverifikasi
  x.ubah('db_Tiang', '1002', { lat: -3.1, lng: 106.6, sumber_koordinat: 'lapangan', jenis_tiang: 'BESI', status_verifikasi: 'TERVERIFIKASI', konstruksi_lapangan: 'k-1', jumlah_sirkuit: 2 });
  x.ubah('db_Tiang_Sirkuit', '1002', { penyulang: 'TOBOALI 1', status_verifikasi: 'TERVERIFIKASI', induk_tiang_id: '1001', peran_titik: 'switching' });
  // sumber berubah: 1002 pindah koordinat + ganti PARENT, 1003 hilang, 1008 baru
  const sumber = x.sheets.i.db_TiangMaster.data;
  sumber[2][6] = -3.5; sumber[2][7] = 106.9; sumber[2][5] = 'SEGMEN BARU';
  sumber.splice(3, 1);
  sumber.push(itbBaris('1008', 'TIANG TM PLS0005', -3, lng(4)));
  const r3 = j(x.diam(() => x.g.ADMIN_migrasiTiangItb()));
  assert.deepStrictEqual([r3.tiangBaru, r3.tiangHilang, r3.tiangUbah], [1, 1, 1]);
  const t2 = x.baris('db_Tiang').find((b) => String(b.tiang_id) === '1002');
  assert.deepStrictEqual([t2.lat_aset, t2.lng_aset], [-3.5, 106.9], 'kolom aset ikut sumber');
  assert.deepStrictEqual([t2.lat, t2.lng, t2.sumber_koordinat, t2.jenis_tiang, t2.status_verifikasi, t2.konstruksi_lapangan, Number(t2.jumlah_sirkuit)],
    [-3.1, 106.6, 'lapangan', 'BESI', 'TERVERIFIKASI', 'k-1', 2], 'kolom verifikasi tidak ditimpa');
  assert.strictEqual(t2.tanda_cek, '', 'tiang terverifikasi: tanda cek dikosongkan');
  assert.strictEqual(Number(t2.revision), 2);
  const t3 = x.baris('db_Tiang').find((b) => String(b.tiang_id) === '1003');
  assert.strictEqual(t3.keterangan_sumber, 'Tidak ada di sumber 2026-11');
  assert.strictEqual(x.baris('db_Tiang').length, 7, 'baris hilang tidak dihapus');
  const s2 = x.baris('db_Tiang_Sirkuit').find((b) => String(b.tiang_id) === '1002');
  assert.deepStrictEqual([s2.segmen_aset, s2.penyulang, s2.status_verifikasi, String(s2.induk_tiang_id), s2.peran_titik], ['SEGMEN BARU', 'TOBOALI 1', 'TERVERIFIKASI', '1001', 'switching'],
    'sirkuit terverifikasi: hanya segmen_aset yang ikut sumber');
  // 1003 muncul lagi
  sumber.splice(3, 0, itbBaris('1003', 'TIANG TM PLS0003', -3, lng(2)));
  const r4 = j(x.diam(() => x.g.ADMIN_migrasiTiangItb()));
  assert.strictEqual(r4.tiangPulih, 1);
  assert.strictEqual(x.baris('db_Tiang').find((b) => String(b.tiang_id) === '1003').keterangan_sumber, '');
});

test('itb: struktur sumber berubah: alias lewat db_Tiang_Pemetaan; kolom wajib hilang = tidak ada yang ditulis', () => {
  const baru = DATA_ITB();
  baru[0][baru[0].indexOf('LATITUDEY')] = 'GARIS_LINTANG_Y';
  const x = dunia(baru);
  const gagal = kodeError(() => x.diam(() => x.g.ADMIN_migrasiTiangItb()));
  assert.strictEqual(gagal, 'KOLOM_WAJIB_HILANG');
  assert.strictEqual(x.baris('db_Tiang').length, 0);
  assert.strictEqual(x.baris('db_Tiang_Sirkuit').length, 0);
  x.sheets.m.db_Tiang_Pemetaan.data.push(['', '', 'lat_aset', 'GARIS_LINTANG_Y', 'ya', 'TRUE', '', '', '']);
  const ok = j(x.diam(() => x.g.ADMIN_migrasiTiangItb()));
  assert.strictEqual(ok.tiangBaru, 6, 'alias baru dikenali tanpa deploy');
  // kolom diacak urutannya + baris judul di atas
  const acak = DATA_ITB().map((b) => b.slice().reverse());
  acak.unshift(['LAPORAN ASET'], []);
  const y = dunia(acak);
  assert.strictEqual(j(y.diam(() => y.g.ADMIN_migrasiTiangItb())).tiangBaru, 6);
});

test('itb: gagal tertutup: sumber kosong, sheet sumber / tab tujuan hilang, header tujuan beda, baris kosong di tengah, konfigurasi, pemilik', () => {
  const kosong = dunia([HDR_ITB.slice()]);
  assert.strictEqual(kodeError(() => kosong.diam(() => kosong.g.ADMIN_migrasiTiangItb())), 'DATA_KOSONG');
  const tanpaSheet = dunia();
  delete tanpaSheet.sheets.i.db_TiangMaster;
  assert.strictEqual(kodeError(() => tanpaSheet.diam(() => tanpaSheet.g.ADMIN_cekMigrasiTiangItb())), 'SHEET_TIDAK_ADA');
  const header = dunia();
  header.sheets.t.db_Tiang.data[0][5] = 'lain';
  assert.strictEqual(kodeError(() => header.diam(() => header.g.ADMIN_migrasiTiangItb())), 'CONFIG_TIDAK_VALID');
  assert.strictEqual(header.baris('db_Tiang_Sirkuit').length, 0, 'tidak menulis ke tab lain');
  const bolong = dunia();
  bolong.diam(() => bolong.g.ADMIN_migrasiTiangItb());
  bolong.sheets.t.db_Tiang.data.splice(2, 0, bolong.H.db_Tiang.map(() => ''));   // baris kosong di tengah (Sheets: sel kosong = '')
  const sebelum = JSON.stringify(bolong.sheets.t.db_Tiang.data);
  bolong.sheets.i.db_TiangMaster.data.push(itbBaris('1009', 'TIANG TM PLS0009', -3, lng(7)));
  assert.strictEqual(kodeError(() => bolong.diam(() => bolong.g.ADMIN_migrasiTiangItb())), 'DATA_TIDAK_VALID');
  assert.strictEqual(JSON.stringify(bolong.sheets.t.db_Tiang.data), sebelum, 'gagal sebelum menulis apa pun');
  const tanpaTiang = dunia(DATA_ITB(), { ...PROPS, TIANG_SHEET_ID: undefined }, false);
  assert.strictEqual(kodeError(() => tanpaTiang.g.ADMIN_migrasiTiangItb()), 'CONFIG_TIDAK_LENGKAP');
  const tanpaItb = dunia(DATA_ITB(), { ...PROPS, MASTER_ITB_SHEET_ID: undefined }, false);
  assert.strictEqual(kodeError(() => tanpaItb.g.ADMIN_migrasiTiangItb()), 'CONFIG_TIDAK_LENGKAP');
  const orang = dunia();
  orang.g.Session = { getActiveUser: () => ({ getEmail: () => 'lain@y.z' }) };
  assert.strictEqual(kodeError(() => orang.g.ADMIN_migrasiTiangItb()), 'KHUSUS_PEMILIK');
  assert.strictEqual(kodeError(() => orang.g.ADMIN_cekMigrasiTiangItb()), 'KHUSUS_PEMILIK');
});
