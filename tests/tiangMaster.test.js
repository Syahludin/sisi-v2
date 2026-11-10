const test = require('node:test');
const assert = require('node:assert');
const { buatKonteks } = require('./harness');
const { sheetPalsu, kodeError } = require('./gudangUji');

const PROPS = { ENV: 'staging', MASTER_SHEET_ID: 'm', AUTH_SHEET_ID: 'a', KODE_ULP: '16130', ADMIN_EMAIL: 'x@y.z', TIANG_SHEET_ID: 't' };

/** Dunia uji master tiang: SiSi_Tiang ('t') kosong, SiSi_Master ('m') tanpa tab referensi tiang, sesi = pemilik. */
function dunia(props = PROPS) {
  const g = buatKonteks(props);
  const log = [];
  const buat = sheetPalsu(log);
  const sheets = { m: {}, a: {}, t: {} };
  g.SpreadsheetApp = { openById: (id) => ({ getSheetByName: (n) => (sheets[id] || {})[n], insertSheet: (n) => { sheets[id][n] = buat(n, [[]]); return sheets[id][n]; } }) };
  g.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  return { g, sheets, buat, log };
}

/** Bungkam console selama [fn]; hasil atau galat diteruskan. */
function diam(fn) {
  const a = { l: console.log, w: console.warn, e: console.error };
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  try { return fn(); } finally { console.log = a.l; console.warn = a.w; console.error = a.e; }
}

test('tiang: skema tanpa kolom ganda, kunci ada, terdaftar di skemaHeader_', () => {
  const { g } = dunia();
  const sk = g.skemaHeader_();
  for (const [nama, header] of Object.entries({ ...g.TIANG_HEADER_, ...g.TIANG_MASTER_HEADER_ })) {
    assert.strictEqual(new Set(header).size, header.length, nama + ' punya kolom ganda');
    // db_Tiang_Sirkuit: kolom konfirmasi induk ditambah di belakang kolom audit (tab lama cukup diperpanjang)
    // db_Segmen: kolom segmen kabel tanah (10 Nov 2026) juga di belakang kolom audit
    const tanpaTambahan = nama === 'db_Tiang_Sirkuit' ? header.slice(0, -3) : nama === 'db_Segmen' ? header.slice(0, -6) : header;
    assert.strictEqual(tanpaTambahan.slice(-1)[0], 'diubah_oleh', nama + ' berakhir dengan kolom audit');
    assert.strictEqual(header[0], 'No', nama + ' berkolom pertama No');
  }
  assert.deepStrictEqual([...sk.TIANG_SHEET_ID.db_Tiang], [...g.TIANG_HEADER_.db_Tiang]);
  assert.deepStrictEqual(Object.keys(sk.TIANG_SHEET_ID), ['db_Tiang', 'db_Tiang_Sirkuit', 'db_Segmen', 'db_Switching']);
  assert.deepStrictEqual([...sk.MASTER_SHEET_ID.db_Konstruksi], ['No', 'konstruksi_id', 'kode', 'nama', 'keterangan', 'susunan', 'gmd_m', 'urutan', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh']);
  assert.deepStrictEqual([...sk.MASTER_SHEET_ID.db_Ukuran_Tiang], ['No', 'ukuran_id', 'nama', 'keterangan', 'urutan', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh']);
  assert.deepStrictEqual([...sk.MASTER_SHEET_ID.db_Tiang_Pemetaan], ['No', 'pemetaan_id', 'kolom_logis', 'alias', 'wajib', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh']);
  // kolom berformat teks harus ada di headernya (kalau tidak, indexOf -1 memformat kolom yang salah)
  for (const [nama, kolom] of Object.entries(g.TIANG_KOLOM_TEKS_)) {
    const header = g.TIANG_HEADER_[nama] || g.TIANG_MASTER_HEADER_[nama];
    for (const k of kolom) assert.ok(header.includes(k), nama + ' tidak punya kolom teks ' + k);
  }
  assert.strictEqual(g.cfg_().TIANG_SHEET_ID, 't');
  assert.strictEqual(dunia({ ...PROPS, TIANG_SHEET_ID: undefined }).g.cfg_().TIANG_SHEET_ID, '');
});

test('tiang: kolom aset dan kolom verifikasi db_Tiang terpisah (sinkron tidak boleh menimpa verifikasi)', () => {
  const { g } = dunia();
  const h = g.TIANG_HEADER_.db_Tiang;
  const aset = ['lat_aset', 'lng_aset', 'konstruksi_aset', 'jenis_tiang_aset', 'ukuran_tiang_aset', 'kelas_area', 'status_aset', 'bulan_sumber', 'keterangan_sumber'];
  const verif = ['jumlah_sirkuit', 'jenis_tiang', 'ukuran_tiang', 'konstruksi_lapangan', 'lat', 'lng', 'sumber_koordinat', 'akurasi_m', 'gardu_id', 'status_verifikasi', 'verifikasi_terakhir'];
  const akhirAset = Math.max(...aset.map((k) => h.indexOf(k)));
  assert.ok(aset.every((k) => h.includes(k)) && verif.every((k) => h.includes(k)));
  assert.ok(verif.every((k) => h.indexOf(k) > akhirAset), 'semua kolom verifikasi ada sesudah kolom aset');
});

test('tiang: ADMIN_siapkanSheetTiang membuat 4 tab SiSi_Tiang + 3 tab referensi SiSi_Master; cek tidak mengubah; ulang aman; header asing tidak ditimpa', () => {
  const { g, sheets } = dunia();
  diam(() => {
    assert.strictEqual(g.ADMIN_cekSheetTiang(), 7, 'cek: 7 tab belum ada');
    assert.deepStrictEqual([Object.keys(sheets.t), Object.keys(sheets.m)], [[], []], 'cek tidak membuat apa pun');
    assert.strictEqual(g.ADMIN_siapkanSheetTiang(), 0);
    for (const n of Object.keys(g.TIANG_HEADER_)) assert.deepStrictEqual([...sheets.t[n].data[0]], [...g.TIANG_HEADER_[n]], n);
    for (const n of Object.keys(g.TIANG_MASTER_HEADER_)) assert.deepStrictEqual([...sheets.m[n].data[0]], [...g.TIANG_MASTER_HEADER_[n]], n);
    assert.strictEqual(g.ADMIN_cekSheetTiang(), 0);
    sheets.m.db_Konstruksi.data.push(['', '', 'TM1', 'TM1']);
    sheets.t.db_Tiang.data.push(['17074727']);
    assert.strictEqual(g.ADMIN_siapkanSheetTiang(), 0);
    assert.strictEqual(sheets.m.db_Konstruksi.data.length, 2, 'ulang tidak menggandakan / menghapus baris');
    assert.strictEqual(sheets.t.db_Tiang.data.length, 2);
    sheets.t.db_Segmen.data[0][3] = 'lain';
    assert.strictEqual(g.ADMIN_siapkanSheetTiang(), 1, 'header asing = masalah');
    assert.strictEqual(sheets.t.db_Segmen.data[0][3], 'lain', 'header asing tidak ditimpa');
  });
});

test('tiang: hanya pemilik; TIANG_SHEET_ID kosong = CONFIG_TIDAK_LENGKAP', () => {
  const x = dunia();
  x.g.Session = { getActiveUser: () => ({ getEmail: () => 'lain@y.z' }) };
  assert.strictEqual(kodeError(() => x.g.ADMIN_siapkanSheetTiang()), 'KHUSUS_PEMILIK');
  assert.strictEqual(kodeError(() => x.g.ADMIN_cekSheetTiang()), 'KHUSUS_PEMILIK');
  const y = dunia({ ...PROPS, TIANG_SHEET_ID: undefined });
  assert.strictEqual(kodeError(() => y.g.ADMIN_siapkanSheetTiang()), 'CONFIG_TIDAK_LENGKAP');
});

test('tiang: ADMIN_lengkapiMaster melengkapi id / aktif / revision baris db_Konstruksi dan db_Tiang_Pemetaan yang diketik manual', () => {
  const x = dunia();
  const { g, sheets, buat } = x;
  diam(() => {
    g.ADMIN_siapkanSheetTiang();
    // tab master wajib lain (kosong) supaya ADMIN_lengkapiMaster bisa jalan
    const sk = g.skemaHeader_().MASTER_SHEET_ID;
    for (const n of ['db_Tim', 'db_Users', 'db_Jaringan', 'db_Jenis_Pekerjaan']) sheets.m[n] = buat(n, [sk[n].slice()]);
    sheets.m.db_Konstruksi.data.push(['', '', 'TM1', 'TM1', '', '', '', 10, '', '', '', '']);
    sheets.m.db_Konstruksi.data.push(['', '', 'TM Kooi-HGW', 'TM Kooi-HGW', '', '', '', 140, '', '', '', '']);
    sheets.m.db_Ukuran_Tiang.data.push(['', '', '11 Meter 350 daN', '', 10, '', '', '', '']);
    sheets.m.db_Tiang_Pemetaan.data.push(['', '', 'lat_aset', 'LATITUDEY|LATITUDE|LAT', 'ya', '', '', '', '']);
    g.ADMIN_lengkapiMaster();
  });
  const H = g.TIANG_MASTER_HEADER_;
  const nomor = [];
  for (const r of sheets.m.db_Konstruksi.data.slice(1)) {
    const o = Object.fromEntries(H.db_Konstruksi.map((k, i) => [k, r[i]]));
    nomor.push(Number(o.No));
    assert.match(String(o.konstruksi_id), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    assert.strictEqual(String(o.aktif).toUpperCase(), 'TRUE');
    assert.strictEqual(Number(o.revision), 1);
  }
  assert.deepStrictEqual(nomor, [1, 2], 'No = nomor urut baris data');
  const u = sheets.m.db_Ukuran_Tiang.data[1];
  assert.match(String(u[1]), /^[0-9a-f]{8}-/i);
  assert.deepStrictEqual([Number(u[0]), String(u[5]).toUpperCase(), Number(u[6])], [1, 'TRUE', 1]);
  const p = sheets.m.db_Tiang_Pemetaan.data[1];
  assert.strictEqual(Number(p[0]), 1);
  assert.match(String(p[1]), /^[0-9a-f-]{36}$/i);
  assert.strictEqual(p[3], 'LATITUDEY|LATITUDE|LAT', 'isi manual tidak diubah');
});
