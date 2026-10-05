const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { buatKonteks } = require('./harness');

const PROPS = { ENV: 'staging', MASTER_SHEET_ID: 'm', AUTH_SHEET_ID: 'a', KODE_ULP: '16130', ADMIN_EMAIL: 'x@y.z' };
const g = buatKonteks(PROPS);
const kodeError = (fn) => { try { fn(); } catch (e) { return e.kode || e.message; } return null; };

test('PBKDF2 sama persis dengan implementasi standar Node', () => {
  const saltB64 = g.saltBaru_();
  const hasil = g.hashPassword_('Rahasia-Toboali-2026', saltB64, 1000);
  const standar = crypto.pbkdf2Sync('Rahasia-Toboali-2026', Buffer.from(saltB64, 'base64'), 1000, 32, 'sha256').toString('base64');
  assert.strictEqual(hasil, standar);
});

test('versi hash & token', () => {
  assert.strictEqual(g.parseIterasi_('pbkdf2-sha256:5000'), 5000);
  assert.strictEqual(kodeError(() => g.parseIterasi_('sha256')), 'HASH_VERSI_TIDAK_DIKENAL');
  assert.match(g.tokenBaru_(), /^[0-9a-f]{64}$/);
});

test('router menolak aksi asing & prototype', () => {
  for (const a of ['hapusSemua', '__proto__', 'constructor', 'toString']) {
    assert.strictEqual(kodeError(() => g.proses_({ action: a }, 'MOBILE')), 'AKSI_TIDAK_DIKENAL');
  }
  assert.strictEqual(kodeError(() => g.proses_([], 'MOBILE')), 'REQUEST_TIDAK_VALID');
  assert.strictEqual(kodeError(() => g.proses_({ action: 'cekSesi', token: 'abc' }, 'MOBILE')), 'SESI_TIDAK_VALID');
});

test('validasi: allowlist, trim, mentah, angka, tanggal, uuid', () => {
  assert.strictEqual(kodeError(() => g.validasi_({ a: 1, x: 2 }, { a: { tipe: 'angka' } })), 'FIELD_TIDAK_DIKENAL');
  assert.strictEqual(kodeError(() => g.validasi_({}, { a: { tipe: 'teks', wajib: true } })), 'FIELD_WAJIB');
  assert.strictEqual(g.validasi_({ a: '  hai ' }, { a: { tipe: 'teks' } }).a, 'hai');
  assert.strictEqual(g.validasi_({ p: ' pw ' }, { p: { tipe: 'teks', mentah: true } }).p, ' pw ');
  assert.strictEqual(g.validasi_({ d: '12.5' }, { d: { tipe: 'angka', min: 0, max: 1000 } }).d, 12.5);
  assert.strictEqual(kodeError(() => g.validasi_({ d: -1 }, { d: { tipe: 'angka', min: 0 } })), 'DI_LUAR_RENTANG');
  assert.strictEqual(kodeError(() => g.validasi_({ d: '1e3' }, { d: { tipe: 'angka' } })), 'TIPE_SALAH');
  assert.strictEqual(kodeError(() => g.validasi_({ t: '2026-02-30' }, { t: { tipe: 'tanggal' } })), 'FORMAT_SALAH');
  assert.strictEqual(g.validasi_({ t: '2026-10-02' }, { t: { tipe: 'tanggal' } }).t, '2026-10-02');
  const id = crypto.randomUUID().toUpperCase();
  assert.strictEqual(g.validasi_({ i: id }, { i: { tipe: 'uuid' } }).i, id.toLowerCase());
});

test('koordinat: satu sumber & area Babel', () => {
  const k = g.validasi_({ k: '-2.642435, 105.965072' }, { k: { tipe: 'koordinat' } }).k;
  assert.strictEqual(k.lat, -2.642435);
  assert.strictEqual(k.lng, 105.965072);
  assert.strictEqual(k.teks, '-2.642435, 105.965072');
  assert.strictEqual(kodeError(() => g.validasi_({ k: '-6.2, 106.8' }, { k: { tipe: 'koordinat' } })), 'KOORDINAT_DI_LUAR_AREA');
  assert.strictEqual(kodeError(() => g.validasi_({ k: '-2.6;105.9' }, { k: { tipe: 'koordinat' } })), 'FORMAT_SALAH');
});

test('amanSheet_ mencegah formula injection', () => {
  assert.strictEqual(g.amanSheet_('=IMPORTXML("x")'), "'=IMPORTXML(\"x\")");
  assert.strictEqual(g.amanSheet_('@SUM(A1)'), "'@SUM(A1)");
  assert.strictEqual(g.amanSheet_('Pangkas'), 'Pangkas');
  assert.strictEqual(g.amanSheet_(-2.5), -2.5);
});

test('batas offline = 23:59 WIB hari berikutnya', () => {
  assert.strictEqual(g.offlineSampai_(new Date('2026-10-02T23:30:00+07:00')), '2026-10-03T23:59:59+07:00');
  assert.strictEqual(g.offlineSampai_(new Date('2026-10-02T00:30:00+07:00')), '2026-10-03T23:59:59+07:00');
  assert.strictEqual(g.tglJakarta_(new Date('2026-10-01T18:00:00Z')), '2026-10-02');
});

test('kode berantai ROW', () => {
  const h = g.kodeHeaderRow_('3', '16130', '2026-10-02', 1);
  assert.strictEqual(h, 'R03-16130261002001');
  assert.deepStrictEqual({ ...g.parseKodeHeaderRow_(h) }, { subTim: '03', kodeUlp: '16130', tanggal: '2026-10-02', urut: 1 });
  const harapan = { subTim: '03', kodeUlp: '16130', tanggal: '2026-10-02' };
  assert.ok(g.cekKodeHeaderRow_(h, harapan));
  assert.strictEqual(kodeError(() => g.cekKodeHeaderRow_(h, { ...harapan, subTim: '04' })), 'KODE_TIDAK_VALID');
  assert.strictEqual(kodeError(() => g.cekKodeHeaderRow_(h, { ...harapan, tanggal: '2026-10-03' })), 'KODE_TIDAK_VALID');
  assert.strictEqual(kodeError(() => g.cekKodeHeaderRow_('R03-K261002001', harapan)), 'KODE_TIDAK_VALID');
  const pny = g.kodeAnak_(h, 'PNY', 2);
  const eks = g.kodeAnak_(pny, 'EKS', 15);
  assert.strictEqual(eks, 'R03-16130261002001-PNY.002-EKS.015');
  assert.deepStrictEqual({ ...g.parseKodeAnak_(eks, 'EKS') }, { induk: pny, urut: 15 });
  assert.strictEqual(g.parseKodeAnak_(pny + '-EKS.000', 'EKS'), null);
});

test('klasifikasi diameter sesuai keputusan 2 Okt 2026', () => {
  const jenis = [
    { modul: 'ROW', nama: 'Rabas / Pangkas', diameter_min: 0, diameter_max: 0, aktif: 'TRUE' },
    { modul: 'ROW', nama: 'Tebang Sedang', diameter_min: 25, diameter_max: 50, aktif: 'TRUE' },
    { modul: 'ROW', nama: 'Tebang Besar', diameter_min: 51, diameter_max: '', aktif: 'TRUE' },
  ];
  assert.strictEqual(g.klasifikasiJenis_(0, jenis).nama, 'Rabas / Pangkas');
  for (const d of [1, 10, 24]) assert.strictEqual(kodeError(() => g.klasifikasiJenis_(d, jenis)), 'DIAMETER_DI_LUAR_KATEGORI');
  assert.strictEqual(g.klasifikasiJenis_(25, jenis).nama, 'Tebang Sedang');
  assert.strictEqual(g.klasifikasiJenis_(50, jenis).nama, 'Tebang Sedang');
  assert.strictEqual(g.klasifikasiJenis_(51, jenis).nama, 'Tebang Besar');
  assert.strictEqual(g.klasifikasiJenis_(1000, jenis).nama, 'Tebang Besar');
  for (const d of [50.5, -1, 1001, '30', NaN]) assert.strictEqual(kodeError(() => g.klasifikasiJenis_(d, jenis)), 'DIAMETER_TIDAK_VALID');
  const tumpang = jenis.concat([{ modul: 'ROW', nama: 'X', diameter_min: 40, diameter_max: 60, aktif: true }]);
  assert.strictEqual(kodeError(() => g.klasifikasiJenis_(45, tumpang)), 'JENIS_AMBIGU');
});

test('akses: wildcard, khusus_super, ADMIN_ES LIHAT/UBAH, tanpa baris = tolak', () => {
  const aturan = {
    menu: {
      ROW_EKSEKUSI: { kode: 'ROW_EKSEKUSI', platform: 'KEDUANYA', khususSuper: false, urutan: 1, aktif: true },
      ROW_REKAP: { kode: 'ROW_REKAP', platform: 'WEB', khususSuper: false, urutan: 2, aktif: true },
      USER_KELOLA: { kode: 'USER_KELOLA', platform: 'WEB', khususSuper: true, urutan: 9, aktif: true },
      LAMA: { kode: 'LAMA', platform: 'WEB', khususSuper: false, urutan: 3, aktif: false },
    },
    akses: [
      { role: 'SUPER', jenisTim: '*', menu: '*', aksi: 'UBAH' },
      { role: 'ADMIN', jenisTim: '*', menu: '*', aksi: 'UBAH' },
      { role: 'ADMIN_ES', jenisTim: '*', menu: 'ROW_REKAP', aksi: 'LIHAT' },
      { role: 'PETUGAS', jenisTim: 'ROW', menu: 'ROW_EKSEKUSI', aksi: 'UBAH' },
    ],
  };
  const a = (r, j, m) => g.aksesUntuk_(r, j, m, aturan);
  assert.strictEqual(a('SUPER', '', 'USER_KELOLA'), 'UBAH');
  assert.strictEqual(a('ADMIN', '', 'USER_KELOLA'), null);
  assert.strictEqual(a('ADMIN', '', 'ROW_REKAP'), 'UBAH');
  assert.strictEqual(a('ADMIN', '', 'LAMA'), null);
  assert.strictEqual(a('ADMIN_ES', '', 'ROW_REKAP'), 'LIHAT');
  assert.strictEqual(a('ADMIN_ES', '', 'ROW_EKSEKUSI'), null);
  assert.strictEqual(a('PETUGAS', 'ROW', 'ROW_EKSEKUSI'), 'UBAH');
  assert.strictEqual(a('PETUGAS', 'YANDAL', 'ROW_EKSEKUSI'), null);
  const menuWeb = [...g.menuUntuk_({ role: 'ADMIN_ES', jenisTim: '' }, 'WEB', aturan)].map((m) => m.kode + ':' + m.aksi);
  assert.deepStrictEqual(menuWeb, ['ROW_REKAP:LIHAT']);
  const menuHp = [...g.menuUntuk_({ role: 'PETUGAS', jenisTim: 'ROW' }, 'MOBILE', aturan)].map((m) => m.kode);
  assert.deepStrictEqual(menuHp, ['ROW_EKSEKUSI']);
});

test('config wajib lengkap (fail closed)', () => {
  const g2 = buatKonteks({ ...PROPS, KODE_ULP: 'K' });
  assert.strictEqual(kodeError(() => g2.cfg_()), 'CONFIG_TIDAK_VALID');
  const g3 = buatKonteks({ ENV: 'staging' });
  assert.strictEqual(kodeError(() => g3.cfg_()), 'CONFIG_TIDAK_LENGKAP');
});

test('skema SiSi_ROW sesuai PRD (jumlah kolom & tanpa duplikat)', () => {
  const row = g.skemaHeader_().ROW_SHEET_ID;
  const jumlah = { row_Header: 23, row_Realisasi: 21, row_Eksekusi: 40, row_Foto: 19 };
  for (const [nama, n] of Object.entries(jumlah)) {
    assert.strictEqual(row[nama].length, n, nama);
    assert.strictEqual(new Set(row[nama]).size, n, nama + ' ada kolom ganda');
  }
  for (const k of ['header_id', 'realisasi_id', 'eksekusi_id']) {
    assert.ok(Object.values(row).some((h) => h.includes(k)));
  }
  assert.ok(!row.row_Header.includes('urut') && !row.row_Eksekusi.includes('Tampil Foto Sebelum'));
});

test('login ulang di HP yang sama mencabut token lama user itu saja', () => {
  const ins = '11111111-1111-4111-8111-111111111111';
  const rows = [
    { device_id: 'a', user_id: 'u1', install_id: ins, dicabut_pada: '' },
    { device_id: 'b', user_id: 'u1', install_id: ins, dicabut_pada: '2026-10-01T00:00:00Z' },
    { device_id: 'c', user_id: 'u1', install_id: '22222222-2222-4222-8222-222222222222', dicabut_pada: '' },
    { device_id: 'd', user_id: 'u2', install_id: ins, dicabut_pada: '' },
  ];
  assert.deepStrictEqual(g.tokenLamaDicabut_(rows, 'u1', ins).map((r) => r.device_id), ['a']);
  assert.strictEqual(g.tokenLamaDicabut_(rows, 'u1', '').length, 0);
});

test('tim_id di db_Users boleh diketik nama atau kode tim', () => {
  const tim = [
    { tim_id: 'uuid-1', nama: 'ROW 01', kode: '01' },
    { tim_id: 'uuid-2', nama: 'ROW 02', kode: 2 },
    { tim_id: 'uuid-3', nama: 'YANDAL 02', kode: '02' },
    { tim_id: '', nama: 'ROW 09', kode: '09' },
  ];
  assert.deepStrictEqual({ ...g.cariTimId_('uuid-1', tim) }, { id: 'uuid-1' });
  assert.deepStrictEqual({ ...g.cariTimId_(' row 01 ', tim) }, { id: 'uuid-1' });
  assert.deepStrictEqual({ ...g.cariTimId_('01', tim) }, { id: 'uuid-1' });
  assert.deepStrictEqual({ ...g.cariTimId_(1, tim) }, { id: 'uuid-1' });
  assert.deepStrictEqual({ ...g.cariTimId_('02', tim) }, { masalah: 'AMBIGU' });
  assert.deepStrictEqual({ ...g.cariTimId_('ROW 02', tim) }, { id: 'uuid-2' });
  assert.deepStrictEqual({ ...g.cariTimId_('ROW 09', tim) }, { masalah: 'TIDAK_DITEMUKAN' });
});

test('parent_section_id boleh diketik nama section induk di penyulang yang sama', () => {
  const j = [
    { section_id: 's1', penyulang: 'PNY A', section: 'Section 1', parent_section_id: '' },
    { section_id: 's2', penyulang: 'PNY A', section: 'Section 2', parent_section_id: 'Section 1' },
    { section_id: 's3', penyulang: 'PNY B', section: 'Section 1', parent_section_id: '' },
  ];
  assert.deepStrictEqual({ ...g.cariSectionId_('section 1', 'PNY A', j) }, { id: 's1' });
  assert.deepStrictEqual({ ...g.cariSectionId_('Section 1', 'PNY B', j) }, { id: 's3' });
  assert.deepStrictEqual({ ...g.cariSectionId_('s2', 'PNY B', j) }, { id: 's2' });
  assert.deepStrictEqual({ ...g.cariSectionId_('Section 9', 'PNY A', j) }, { masalah: 'TIDAK_DITEMUKAN' });
});

test('topologi section melingkar terdeteksi', () => {
  const pohon = [
    { section_id: 'a', parent_section_id: '' }, { section_id: 'b', parent_section_id: 'a' }, { section_id: 'c', parent_section_id: 'b' },
  ];
  assert.deepStrictEqual([...g.sectionBersiklus_(pohon)], []);
  const lingkar = pohon.concat([{ section_id: 'x', parent_section_id: 'y' }, { section_id: 'y', parent_section_id: 'x' }, { section_id: 'z', parent_section_id: 'x' }]);
  assert.deepStrictEqual([...g.sectionBersiklus_(lingkar)].sort(), ['x', 'y']);
});

test('spreadsheet yang sama hanya dibuka sekali per eksekusi', () => {
  let dibuka = 0;
  g.SpreadsheetApp = { openById: (id) => { dibuka++; return { id }; } };
  g.bukaSpreadsheet_('A'); g.bukaSpreadsheet_('A'); g.bukaSpreadsheet_('B');
  assert.strictEqual(dibuka, 2);
});

/** Spreadsheet palsu yang mencatat urutan baca/tulis, untuk mengunci pola hemat login. */
function sheetPalsu(log) {
  // Seperti Sheets asli: awalan ' (paksa teks) tidak ikut tersimpan sebagai isi sel.
  const sel = (v) => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v);
  const buat = (nama, data) => ({
    data,
    getDataRange: () => ({ getValues: () => { log.push('BACA_PENUH:' + nama); return data.map((r) => r.slice()); } }),
    getLastColumn: () => data[0].length,
    getLastRow: () => data.length,
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => { log.push('BACA:' + nama); return data.slice(r - 1, r - 1 + nr).map((x) => x.slice(c - 1, c - 1 + nc)); },
      getValue: () => { log.push('BACA:' + nama); return data[r - 1][c - 1]; },
      setValue: (v) => { log.push('TULIS:' + nama); data[r - 1][c - 1] = sel(v); },
      setValues: (vals) => {
        log.push('TULIS:' + nama);
        vals.forEach((baris, i) => { data[r - 1 + i] = data[r - 1 + i] || []; baris.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = sel(v); }); });
      },
    }),
    appendRow: (v) => { log.push('TULIS:' + nama); data.push(v.map(sel)); },
  });
  return buat;
}

test('login: baca semua dulu, tulis di akhir, db_Users 1x, log_Audit tidak dibaca penuh', () => {
  const g4 = buatKonteks({ ...PROPS, PBKDF2_ITERASI: '1000' });
  const log = [];
  const buat = sheetPalsu(log);
  const salt = Buffer.from('0123456789abcdef').toString('base64');
  const hash = g4.hashPassword_('Rahasia-Toboali-2026', salt, 1000);
  const sheets = {
    m: {
      db_Users: buat('db_Users', [['user_id', 'username', 'nama', 'role', 'tim_id', 'aktif'],
        ['u1', '16130.uji.row01', 'ROW 01', 'PETUGAS', 't1', true]]),
      db_Tim: buat('db_Tim', [['tim_id', 'kode', 'nama', 'jenis', 'aktif'], ['t1', '01', 'ROW 01', 'ROW', true]]),
      db_Menu: buat('db_Menu', [['menu_kode', 'nama', 'platform', 'khusus_super', 'urutan', 'aktif'],
        ['ROW_EKSEKUSI', 'Eksekusi ROW', 'MOBILE', false, 1, true]]),
      db_Akses: buat('db_Akses', [['role', 'jenis_tim', 'menu_kode', 'aksi'], ['PETUGAS', 'ROW', 'ROW_EKSEKUSI', 'UBAH']]),
    },
    a: {
      auth_Password: buat('auth_Password', [['user_id', 'password_hash', 'salt', 'hash_versi', 'password_diubah_pada', 'gagal_login', 'terkunci_sampai'],
        ['u1', hash, salt, 'pbkdf2-sha256:1000', '', 0, '']]),
      auth_Perangkat: buat('auth_Perangkat', [['device_id', 'user_id', 'install_id', 'token_hash', 'platform', 'dibuat_pada', 'terakhir_dipakai', 'kedaluwarsa_pada', 'dicabut_pada']]),
      log_Audit: buat('log_Audit', [['waktu', 'user_id', 'username', 'role', 'aksi', 'target', 'detail', 'platform', 'device_id']]),
    },
  };
  g4.SpreadsheetApp = { openById: (id) => ({ getSheetByName: (n) => sheets[id][n] }) };
  const ins = '11111111-1111-4111-8111-111111111111';
  const masuk = () => g4.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026', installId: ins }, 'MOBILE');

  const r1 = masuk();
  assert.ok(/^[0-9a-f]{64}$/.test(r1.token));
  assert.ok(r1._waktu && r1._waktu.total >= 0, 'rincian waktu ada di staging');
  assert.strictEqual(log.filter((x) => x === 'BACA_PENUH:db_Users').length, 1, 'db_Users dibaca sekali');
  assert.ok(!log.includes('BACA_PENUH:log_Audit'), 'log_Audit tidak dibaca penuh');
  assert.ok(!log.includes('TULIS:auth_Password'), 'gagal_login sudah 0: tidak ada tulis');
  const tulisPertama = log.findIndex((x) => x.startsWith('TULIS'));
  assert.ok(!log.slice(tulisPertama).some((x) => x.startsWith('BACA')), 'tidak ada baca setelah tulis (flush paksa)');

  // login ulang di HP yang sama: token lama dicabut tanpa membaca ulang sheet
  log.length = 0;
  masuk();
  const perangkat = sheets.a.auth_Perangkat.data;
  assert.strictEqual(perangkat.length, 3);
  assert.ok(perangkat[1][8] && !perangkat[2][8], 'baris lama dicabut, baris baru aktif');
  const idx = log.findIndex((x) => x.startsWith('TULIS'));
  assert.ok(!log.slice(idx).some((x) => x.startsWith('BACA')));

  // production tidak membocorkan rincian waktu
  const g5 = buatKonteks({ ...PROPS, ENV: 'production', PBKDF2_ITERASI: '5000' });   // production wajib >= 5000 (audit 4 Okt)
  g5.SpreadsheetApp = g4.SpreadsheetApp;
  assert.strictEqual(g5.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026' }, 'MOBILE')._waktu, undefined);
});

// ---------- syncRow ----------
const U = () => crypto.randomUUID();
function siapkanRow({ propsTambahan = {} } = {}) {
  const g6 = buatKonteks({ ...PROPS, ROW_SHEET_ID: 'r', ROW_FOTO_FOLDER_ID: 'akar', ...propsTambahan });
  const log = [];
  const buat = sheetPalsu(log);
  const skema = g6.skemaHeader_().ROW_SHEET_ID;
  const sekA = U(), sekB = U(), sekC = U(), jRabas = U(), jSedang = U(), jBesar = U();
  const sheets = {
    m: {
      db_Jaringan: buat('db_Jaringan', [['section_id', 'penyulang', 'section', 'parent_section_id', 'urutan', 'aktif'],
        [sekA, 'TB-01', 'GH Toboali', '', 1, true], [sekB, 'TB-01', 'Kampung Baru', sekA, 2, true], [sekC, 'TB-01', 'Rias', sekA, 3, true]]),
      db_Jenis_Pekerjaan: buat('db_Jenis_Pekerjaan', [['jenis_id', 'modul', 'nama', 'satuan', 'diameter_min', 'diameter_max', 'urutan', 'aktif'],
        [jRabas, 'ROW', 'Rabas / Pangkas', 'Gawang', 0, 0, 1, true], [jSedang, 'ROW', 'Tebang Sedang', 'Batang', 25, 50, 2, true],
        [jBesar, 'ROW', 'Tebang Besar', 'Batang', 51, '', 3, true]]),
    },
    a: { log_Audit: buat('log_Audit', [['waktu', 'user_id', 'username', 'role', 'aksi', 'target', 'detail', 'platform', 'device_id']]) },
    r: {
      row_Header: buat('row_Header', [skema.row_Header.slice()]),
      row_Realisasi: buat('row_Realisasi', [skema.row_Realisasi.slice()]),
      row_Eksekusi: buat('row_Eksekusi', [skema.row_Eksekusi.slice()]),
      row_Foto: buat('row_Foto', [skema.row_Foto.slice()]),
    },
  };
  g6.SpreadsheetApp = { openById: (id) => ({ getSheetByName: (n) => sheets[id][n] }) };
  const timId = U();
  const sesi = { userId: U(), username: '16130.uji.row01', role: 'PETUGAS', timId, timNama: 'ROW 01', timKode: '01', jenisTim: 'ROW' };
  const hariIni = g6.tglJakarta_(new Date());
  const kodeH = g6.kodeHeaderRow_('01', '16130', hariIni, 1);
  const sync = (operasi, s = sesi) => JSON.parse(JSON.stringify(g6.syncRow_(s, { operasi }, 'MOBILE')));
  const op = (jenis, aksi, id, kode, isi, revision) => ({ opId: U(), jenis, aksi, id, kode, isi, revision, waktuPerangkat: new Date().toISOString() });
  return { g: g6, log, sheets, sesi, hariIni, kodeH, sync, op, sekA, sekB, sekC, jRabas, jSedang, jBesar, skema };
}
const kolom = (ctx, nama, baris, k) => ctx.sheets.r[nama].data[baris][ctx.skema[nama].indexOf(k)];

test('syncRow: header -> realisasi -> eksekusi masuk, baca dulu tulis belakangan, kirim ulang = DUPLIKAT', () => {
  const x = siapkanRow();
  const hId = U(), rId = U(), eId = U();
  const batch = [
    x.op('header', 'buat', hId, x.kodeH, { tanggal: x.hariIni, kendala: 'hujan' }),
    x.op('realisasi', 'buat', rId, x.kodeH + '-PNY.001', { headerId: hId, penyulang: 'tb-01' }),
    x.op('eksekusi', 'buat', eId, x.kodeH + '-PNY.001-EKS.001', {
      realisasiId: rId, sectionId: x.sekB, nomorTiang: 'TB01-123', koordinatPekerjaan: '-3.0, 106.5', diameter: 30, jenisId: x.jSedang }),
  ];
  const r1 = x.sync(batch);
  assert.deepStrictEqual(r1.hasil.map((h) => h.status), ['OK', 'OK', 'OK']);
  assert.ok(r1._waktu, 'rincian waktu staging');
  assert.strictEqual(x.sheets.r.row_Header.data.length, 2);
  assert.strictEqual(kolom(x, 'row_Header', 1, 'Sub-Tim'), 'ROW 01');
  assert.strictEqual(kolom(x, 'row_Header', 1, 'No'), 1);
  assert.strictEqual(kolom(x, 'row_Realisasi', 1, 'Penyulang'), 'TB-01', 'nama penyulang resmi dari master');
  assert.strictEqual(kolom(x, 'row_Eksekusi', 1, 'Jenis Pekerjaan'), 'Tebang Sedang');
  assert.strictEqual(kolom(x, 'row_Eksekusi', 1, 'Lat Pekerjaan'), -3);
  const tulis1 = x.log.findIndex((l) => l.startsWith('TULIS'));
  assert.ok(!x.log.slice(tulis1).some((l) => l.startsWith('BACA')), 'tidak ada baca setelah tulis');
  assert.strictEqual(x.sheets.a.log_Audit.data.at(-1)[4], 'SYNC_ROW');

  const r2 = x.sync(batch.map((o) => ({ ...o, opId: U() })));
  assert.deepStrictEqual(r2.hasil.map((h) => h.status), ['DUPLIKAT', 'DUPLIKAT', 'DUPLIKAT']);
  assert.strictEqual(x.sheets.r.row_Eksekusi.data.length, 2, 'tidak ada baris ganda');
  assert.strictEqual(r2.hasil[2].kode, x.kodeH + '-PNY.001-EKS.001');
});

test('syncRow: header ganda, kode bentrok, anak ikut induk', () => {
  const x = siapkanRow();
  const h1 = U();
  x.sync([x.op('header', 'buat', h1, x.kodeH, { tanggal: x.hariIni })]);
  // HP kedua sub-tim sama, hari sama
  const h2 = U(), r2 = U();
  const r = x.sync([
    x.op('header', 'buat', h2, x.kodeH, { tanggal: x.hariIni }),
    x.op('realisasi', 'buat', r2, x.kodeH + '-PNY.001', { headerId: h2, penyulang: 'TB-01' }),
  ]);
  assert.strictEqual(r.hasil[0].alasan, 'HEADER_GANDA');
  assert.strictEqual(r.hasil[1].alasan, 'INDUK_GAGAL');
  // header 001 dibatalkan, HP lain masih pakai nomor 001 -> KODE_BENTROK, anak ikut
  x.sync([x.op('header', 'batal', h1, undefined, {}, 1)]);
  const h3 = U(), r3 = U();
  const b = x.sync([
    x.op('header', 'buat', h3, x.kodeH, { tanggal: x.hariIni }),
    x.op('realisasi', 'buat', r3, x.kodeH + '-PNY.001', { headerId: h3, penyulang: 'TB-01' }),
  ]);
  assert.deepStrictEqual(b.hasil.map((h) => h.status), ['KODE_BENTROK', 'KODE_BENTROK']);
  assert.strictEqual(b.hasil[1].alasan, 'INDUK_BENTROK');
  assert.ok(x.sheets.a.log_Audit.data.some((l) => l[4] === 'KODE_BENTROK'), 'bentrok tercatat di log_Audit');
  // nomor baru 002 diterima
  const kode2 = x.g.kodeHeaderRow_('01', '16130', x.hariIni, 2);
  const c = x.sync([x.op('header', 'buat', h3, kode2, { tanggal: x.hariIni })]);
  assert.strictEqual(c.hasil[0].status, 'OK');
});

test('syncRow: batas tanggal 7 hari, diameter & jenis, penyulang ganda, milik tim lain', () => {
  const x = siapkanRow();
  const lama = x.g.tglJakarta_(new Date(Date.now() - 8 * 864e5));
  const besok = x.g.tglJakarta_(new Date(Date.now() + 864e5));
  const r = x.sync([
    x.op('header', 'buat', U(), x.g.kodeHeaderRow_('01', '16130', lama, 1), { tanggal: lama }),
    x.op('header', 'buat', U(), x.g.kodeHeaderRow_('01', '16130', besok, 1), { tanggal: besok }),
    x.op('header', 'buat', U(), x.g.kodeHeaderRow_('02', '16130', x.hariIni, 1), { tanggal: x.hariIni }),
  ]);
  assert.deepStrictEqual(r.hasil.map((h) => h.alasan), ['TANGGAL_DI_LUAR_BATAS', 'TANGGAL_DI_LUAR_BATAS', 'KODE_TIDAK_VALID']);

  const hId = U(), rId = U();
  x.sync([x.op('header', 'buat', hId, x.kodeH, { tanggal: x.hariIni }),
          x.op('realisasi', 'buat', rId, x.kodeH + '-PNY.001', { headerId: hId, penyulang: 'TB-01' })]);
  const eks = (n, diameter, jenisId) => x.op('eksekusi', 'buat', U(), x.kodeH + '-PNY.001-EKS.00' + n,
    { realisasiId: rId, sectionId: x.sekA, nomorTiang: 'T' + n, koordinatPekerjaan: '-3.0, 106.5', diameter, jenisId });
  const d = x.sync([eks(1, 24, x.jSedang), eks(2, 51, x.jSedang), eks(3, 0, x.jRabas),
    x.op('realisasi', 'buat', U(), x.kodeH + '-PNY.002', { headerId: hId, penyulang: 'TB-01' })]);
  assert.deepStrictEqual(d.hasil.map((h) => h.alasan || h.status), ['DIAMETER_DI_LUAR_KATEGORI', 'JENIS_TIDAK_COCOK', 'OK', 'PENYULANG_GANDA']);

  const lain = { ...x.sesi, userId: U(), timId: U(), timNama: 'ROW 02', timKode: '02' };
  const e = x.sync([x.op('header', 'buat', hId, x.g.kodeHeaderRow_('02', '16130', x.hariIni, 1), { tanggal: x.hariIni }),
                    x.op('header', 'ubah', hId, undefined, { kendala: 'x' }, 1)], lain);
  assert.deepStrictEqual(e.hasil.map((h) => h.alasan), ['ID_DIPAKAI', 'BUKAN_MILIK_TIM']);
  assert.throws(() => x.sync([], x.sesi), /FIELD_WAJIB/);
  assert.throws(() => x.sync([x.op('header', 'buat', U(), x.kodeH, {})], { ...x.sesi, jenisTim: 'YANDAL' }), /AKSES_DITOLAK/);
});

test('syncRow: ubah dengan revision, kirim ulang ubah = DUPLIKAT, hitung ulang hanya foto lengkap', () => {
  const x = siapkanRow();
  const hId = U(), rId = U(), eId = U();
  x.sync([x.op('header', 'buat', hId, x.kodeH, { tanggal: x.hariIni }),
          x.op('realisasi', 'buat', rId, x.kodeH + '-PNY.001', { headerId: hId, penyulang: 'TB-01' }),
          x.op('eksekusi', 'buat', eId, x.kodeH + '-PNY.001-EKS.001', {
            realisasiId: rId, sectionId: x.sekA, nomorTiang: 'T1', koordinatPekerjaan: '-3.0, 106.5', diameter: 30, jenisId: x.jSedang })]);
  assert.strictEqual(kolom(x, 'row_Realisasi', 1, 'Sedang'), 0, 'foto belum lengkap = belum dihitung');
  // anggap uploadFotoRow sudah melengkapi foto
  x.sheets.r.row_Eksekusi.data[1][x.skema.row_Eksekusi.indexOf('foto_lengkap')] = true;

  const ubah = x.op('eksekusi', 'ubah', eId, undefined, { sectionId: x.sekB, diameter: 60, jenisId: x.jBesar }, 1);
  const a = x.sync([ubah]);
  assert.deepStrictEqual([a.hasil[0].status, a.hasil[0].revision], ['OK', 2]);
  assert.strictEqual(kolom(x, 'row_Eksekusi', 1, 'Jenis Pekerjaan'), 'Tebang Besar');
  assert.strictEqual(kolom(x, 'row_Realisasi', 1, 'Besar'), 1);
  assert.strictEqual(kolom(x, 'row_Realisasi', 1, 'Section'), 'Kampung Baru');

  assert.strictEqual(x.sync([{ ...ubah, opId: U() }]).hasil[0].status, 'DUPLIKAT', 'kiriman ulang setelah timeout');
  const basi = x.sync([x.op('eksekusi', 'ubah', eId, undefined, { nomorTiang: 'T9' }, 1)]);
  assert.deepStrictEqual([basi.hasil[0].status, basi.hasil[0].revision], ['KONFLIK_REVISION', 2]);
  assert.strictEqual(kolom(x, 'row_Eksekusi', 1, 'Nomor Tiang'), 'T1', 'tidak menimpa');
  // Edit dari HP: nomor tiang opsional boleh dihapus, koordinat pekerjaan tetap wajib
  const hapus = x.sync([x.op('eksekusi', 'ubah', eId, undefined, { nomorTiang: '', koordinatTiang: null }, 2)]);
  assert.deepStrictEqual([hapus.hasil[0].status, hapus.hasil[0].revision], ['OK', 3]);
  assert.strictEqual(kolom(x, 'row_Eksekusi', 1, 'Nomor Tiang'), '');
  const wajib = x.sync([x.op('eksekusi', 'ubah', eId, undefined, { koordinatPekerjaan: '' }, 3)]);
  assert.strictEqual(wajib.hasil[0].alasan, 'FIELD_WAJIB');
  const kunci = x.sync([x.op('realisasi', 'ubah', rId, undefined, { penyulang: 'TB-02' }, 1)]);
  assert.strictEqual(kunci.hasil[0].alasan, 'AKSI_TIDAK_DIIZINKAN');
});

test('syncRow: batal berantai dalam satu kiriman diproses anak dulu', () => {
  const x = siapkanRow();
  const hId = U(), rId = U(), eId = U();
  x.sync([x.op('header', 'buat', hId, x.kodeH, { tanggal: x.hariIni }),
          x.op('realisasi', 'buat', rId, x.kodeH + '-PNY.001', { headerId: hId, penyulang: 'TB-01' }),
          x.op('eksekusi', 'buat', eId, x.kodeH + '-PNY.001-EKS.001', {
            realisasiId: rId, sectionId: x.sekA, nomorTiang: 'T1', koordinatPekerjaan: '-3.0, 106.5', diameter: 0, jenisId: x.jRabas })]);
  assert.strictEqual(x.sync([x.op('header', 'batal', hId, undefined, {}, 1)]).hasil[0].alasan, 'MASIH_ADA_ANAK');
  const b = x.sync([x.op('header', 'batal', hId, undefined, {}, 1), x.op('realisasi', 'batal', rId, undefined, {}, 1),
                    x.op('eksekusi', 'batal', eId, undefined, {}, 1)]);
  assert.deepStrictEqual(b.hasil.map((h) => h.status), ['OK', 'OK', 'OK']);
  assert.strictEqual(kolom(x, 'row_Header', 1, 'status'), 'BATAL');
  assert.strictEqual(x.sync([x.op('eksekusi', 'batal', eId, undefined, {}, 1)]).hasil[0].status, 'DUPLIKAT');
});

test('syncRow: hanya membaca jendela 7 hari, penunjuk maju sendiri', () => {
  const x = siapkanRow();
  const sk = x.skema.row_Header;
  const lama = sk.map(() => '');
  lama[sk.indexOf('Kode Header')] = 'R01-16130250101001';
  lama[sk.indexOf('TimeStamp')] = new Date(Date.now() - 30 * 864e5);
  lama[sk.indexOf('header_id')] = U();
  x.sheets.r.row_Header.data.push(lama);
  x.sync([x.op('header', 'buat', U(), x.kodeH, { tanggal: x.hariIni })]);
  assert.strictEqual(x.g.PropertiesService.getScriptProperties().getProperty('ROW_JENDELA_row_Header'), '3');
  assert.strictEqual(x.sheets.r.row_Header.data.length, 3, 'baris baru di bawah baris lama');
});

test('section realisasi = daftar section eksekusi, tanpa penggabungan, urut kolom urutan', () => {
  // v0.46: urutan = kolom urutan db_Jaringan; kosong/0 di belakang urut baris; seri dipecah baris
  const j = { a: { section: 'LBS Pergam - ACR Tepus', parent: '', urutan: 20, baris: 2 }, b: { section: 'ACR Tepus - LBS Kp. Jawa', parent: 'a', urutan: 30, baris: 3 },
              c: { section: 'GH Toboali - LBS Pergam', parent: '', urutan: 10, baris: 9 }, d: { section: 'Tanpa Urutan', urutan: 0, baris: 4 },
              e: { section: 'Sisipan', urutan: 15, baris: 12 }, f: { section: 'Tanpa Apa-apa', urutan: 0 } };
  assert.strictEqual(g.sectionDaftar_(['a'], j), 'LBS Pergam - ACR Tepus', 'satu section = namanya');
  assert.strictEqual(g.sectionDaftar_(['b', 'a', 'b', 'c'], j), 'GH Toboali - LBS Pergam, LBS Pergam - ACR Tepus, ACR Tepus - LBS Kp. Jawa',
    'tidak digabung jadi rentang, urut kolom urutan (bukan baris), tanpa duplikat');
  assert.strictEqual(g.sectionDaftar_(['b', 'e', 'a', 'c'], j), 'GH Toboali - LBS Pergam, Sisipan, LBS Pergam - ACR Tepus, ACR Tepus - LBS Kp. Jawa',
    'urutan 15 nyisip di antara 10 dan 20 walau barisnya paling bawah');
  assert.strictEqual(g.sectionDaftar_(['x', ''], j), '', 'section tak dikenal diabaikan');
  assert.strictEqual(g.sectionDaftar_(['f', 'd', 'b', 'c'], j), 'GH Toboali - LBS Pergam, ACR Tepus - LBS Kp. Jawa, Tanpa Urutan, Tanpa Apa-apa',
    'tanpa urutan di belakang, urut baris; tanpa baris paling akhir');
  const seri = { p: { section: 'P', urutan: 10, baris: 5 }, q: { section: 'Q', urutan: 10, baris: 3 } };
  assert.strictEqual(g.sectionDaftar_(['p', 'q'], seri), 'Q, P', 'urutan seri dipecah baris');
});

test('rencanaUrutanSection_: isi kosong kelipatan 20 setelah nomor terbesar, urutan tidak berubah, peringatan', () => {
  const rows = [
    { _baris: 2, penyulang: 'TB 01', section: 'A', urutan: '' },
    { _baris: 3, penyulang: 'TB 01', section: 'B', urutan: 0 },
    { _baris: 4, penyulang: 'TB 02', section: 'X', urutan: 10 },
    { _baris: 5, penyulang: 'tb 02 ', section: 'Y', urutan: 15 },
    { _baris: 6, penyulang: 'TB 02', section: 'Z', urutan: '' },
    { _baris: 7, penyulang: 'TB 02', section: 'W', urutan: 10 },
    { _baris: 8, penyulang: 'TB 03', section: 'K', urutan: 'satu' },
    { _baris: 9, penyulang: '', section: 'Tanpa Penyulang', urutan: '' },
  ];
  const r = g.rencanaUrutanSection_(rows);
  assert.strictEqual(JSON.stringify(r.isi.map((x) => [x.baris, x.nilai])), '[[2,20],[3,40],[6,20]]', 'TB 01 mulai 20; TB 02 lanjut setelah 15 -> 20');
  assert.ok(r.peringatan.some((w) => /urutan 10 ganda/.test(w) && /baris 4 & 7/.test(w)), 'ganda diperingatkan');
  assert.ok(r.peringatan.some((w) => /baris 8/.test(w) && /bukan angka/.test(w)), 'teks tidak ditimpa');
  // setelah diisi, urutan laporan sama dengan sebelum diisi
  const sebelum = {}, sesudah = {};
  rows.slice(0, 7).forEach((x) => { sebelum['b' + x._baris] = { section: x.section, urutan: Number(x.urutan) || 0, baris: x._baris }; });
  Object.keys(sebelum).forEach((k) => { sesudah[k] = { ...sebelum[k] }; });
  r.isi.forEach((x) => { sesudah['b' + x.baris].urutan = x.nilai; });
  const tb02 = ['b4', 'b5', 'b6', 'b7'];
  assert.strictEqual(tb02.slice().sort(g.urutSection_(sebelum)).join(), tb02.slice().sort(g.urutSection_(sesudah)).join(), 'urutan tidak berubah');
  assert.strictEqual(tb02.slice().sort(g.urutSection_(sesudah)).join(), 'b4,b7,b5,b6');
});

test('getKodeRow: kode sub-tim sendiri termasuk BATAL, nomor berikutnya = terbesar + 1', () => {
  const x = siapkanRow();
  const hId = U(), r1 = U(), r2 = U(), e1 = U();
  x.sync([x.op('header', 'buat', hId, x.kodeH, { tanggal: x.hariIni }),
          x.op('realisasi', 'buat', r1, x.kodeH + '-PNY.001', { headerId: hId, penyulang: 'TB-01' }),
          x.op('eksekusi', 'buat', e1, x.kodeH + '-PNY.001-EKS.001', {
            realisasiId: r1, sectionId: x.sekA, nomorTiang: 'T1', koordinatPekerjaan: '-3.0, 106.5', diameter: 0, jenisId: x.jRabas })]);
  x.sync([x.op('eksekusi', 'batal', e1, undefined, {}, 1), x.op('realisasi', 'batal', r1, undefined, {}, 1)]);
  x.sync([x.op('realisasi', 'buat', r2, x.kodeH + '-PNY.002', { headerId: hId, penyulang: 'TB-01' })]);
  // tim lain di hari yang sama tidak boleh terlihat
  const lain = { ...x.sesi, userId: U(), timId: U(), timNama: 'ROW 02', timKode: '02' };
  x.sync([x.op('header', 'buat', U(), x.g.kodeHeaderRow_('02', '16130', x.hariIni, 1), { tanggal: x.hariIni })], lain);

  const k = JSON.parse(JSON.stringify(x.g.getKodeRow_(x.sesi, {})));
  assert.strictEqual(k.tanggal, x.hariIni);
  assert.strictEqual(k.headerBerikutnya, 2);
  assert.strictEqual(k.header.length, 1);
  assert.strictEqual(k.header[0].pnyBerikutnya, 3, 'PNY.001 BATAL tetap terhitung');
  assert.strictEqual(k.realisasi.find((r) => r.id === r1).eksBerikutnya, 2);
  assert.strictEqual(k.eksekusi[0].status, 'BATAL');
  const lama = x.g.tglJakarta_(new Date(Date.now() - 8 * 864e5));
  assert.throws(() => x.g.getKodeRow_(x.sesi, { tanggal: lama }), /TANGGAL_DI_LUAR_BATAS/);
  assert.throws(() => x.g.getKodeRow_({ ...x.sesi, jenisTim: 'YANDAL' }, {}), /AKSES_DITOLAK/);
});

test('login langsung mengisi cache sesi: panggilan berikutnya tidak membaca auth_Perangkat', () => {
  const g7 = buatKonteks({ ...PROPS, PBKDF2_ITERASI: '1000' });
  const log = [];
  const buat = sheetPalsu(log);
  const salt = Buffer.from('0123456789abcdef').toString('base64');
  const sheets = {
    m: {
      db_Users: buat('db_Users', [['user_id', 'username', 'nama', 'role', 'tim_id', 'aktif'], ['u1', '16130.uji.row01', 'ROW 01', 'PETUGAS', 't1', true]]),
      db_Tim: buat('db_Tim', [['tim_id', 'kode', 'nama', 'jenis', 'aktif'], ['t1', '01', 'ROW 01', 'ROW', true]]),
      db_Menu: buat('db_Menu', [['menu_kode', 'nama', 'platform', 'khusus_super', 'urutan', 'aktif'], ['ROW_EKSEKUSI', 'Eksekusi ROW', 'MOBILE', false, 1, true]]),
      db_Akses: buat('db_Akses', [['role', 'jenis_tim', 'menu_kode', 'aksi'], ['PETUGAS', 'ROW', 'ROW_EKSEKUSI', 'UBAH']]),
    },
    a: {
      auth_Password: buat('auth_Password', [['user_id', 'password_hash', 'salt', 'hash_versi', 'password_diubah_pada', 'gagal_login', 'terkunci_sampai'],
        ['u1', g7.hashPassword_('Rahasia-Toboali-2026', salt, 1000), salt, 'pbkdf2-sha256:1000', '', 0, '']]),
      auth_Perangkat: buat('auth_Perangkat', [['device_id', 'user_id', 'install_id', 'token_hash', 'platform', 'dibuat_pada', 'terakhir_dipakai', 'kedaluwarsa_pada', 'dicabut_pada']]),
      log_Audit: buat('log_Audit', [['waktu', 'user_id', 'username', 'role', 'aksi', 'target', 'detail', 'platform', 'device_id']]),
    },
  };
  g7.SpreadsheetApp = { openById: (id) => ({ getSheetByName: (n) => sheets[id][n] }) };
  const r = g7.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026' }, 'MOBILE');
  log.length = 0;
  const sesi = g7.sesiDariToken_(r.token);
  assert.strictEqual(sesi.deviceId, r.profil.deviceId);
  assert.strictEqual(sesi.timKode, '01');
  assert.strictEqual(log.length, 0, 'tidak ada baca sheet sama sekali');
});

// ---------- uploadFotoRow ----------
function jpeg(lebar, tinggi, isi = 64) {
  const b = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00, 0xFF, 0xC0, 0x00, 0x11, 0x08,
    tinggi >> 8, tinggi & 255, lebar >> 8, lebar & 255, 3];
  for (let i = 0; i < isi; i++) b.push((i * 7) & 0x7f);
  b.push(0xFF, 0xD9);
  return Buffer.from(b);
}
function driveTiruan() {
  const folders = {}; let n = 0; const dibuat = [];
  const folder = (id, nama) => {
    const f = folders[id] = folders[id] || { id, nama, anak: {}, file: {} };
    const it = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
    return {
      getId: () => id,
      getFoldersByName: (nm) => it(f.anak[nm] ? [folder(f.anak[nm], nm)] : []),
      createFolder: (nm) => { const nid = 'f' + (++n); f.anak[nm] = nid; return folder(nid, nm); },
      getFilesByName: (nm) => it(f.file[nm] ? [f.file[nm]] : []),
      createFile: (blob) => { const fid = 'file' + (++n); const o = { getId: () => fid, getMimeType: () => blob.mime || 'image/jpeg', getBlob: () => ({ getBytes: () => blob.bytes }) }; f.file[blob.nama] = o; semuaFile[fid] = o; dibuat.push(fid); return o; },
    };
  };
  const semuaFile = {};
  const getFileById = (id) => { if (!semuaFile[id]) throw new Error('tidak ada'); return semuaFile[id]; };
  return { DriveApp: { getFolderById: (id) => folder(id), getFileById }, folders, dibuat };
}
function siapkanFoto() {
  const x = siapkanRow();
  const dr = driveTiruan();
  x.g.DriveApp = dr.DriveApp;
  x.g.Utilities.newBlob = (bytes, mime, nama) => ({ bytes, mime, nama });
  const hId = U(), rId = U(), eId = U();
  x.sync([x.op('header', 'buat', hId, x.kodeH, { tanggal: x.hariIni }),
          x.op('realisasi', 'buat', rId, x.kodeH + '-PNY.001', { headerId: hId, penyulang: 'TB-01' }),
          x.op('eksekusi', 'buat', eId, x.kodeH + '-PNY.001-EKS.001', {
            realisasiId: rId, sectionId: x.sekB, nomorTiang: 'T1', koordinatPekerjaan: '-3.0, 106.5', diameter: 30, jenisId: x.jSedang })]);
  const kirim = (slot, buf = jpeg(1600, 1200), fotoId = U(), ubah = {}) => JSON.parse(JSON.stringify(x.g.uploadFotoRow_(x.sesi, {
    fotoId, eksekusiId: eId, slot, sumberFoto: 'GALERI', mime: 'image/jpeg',
    sha256: crypto.createHash('sha256').update(buf).digest('hex'), ukuranByte: buf.length, data: buf.toString('base64'), ...ubah,
  }, 'MOBILE')));
  return { ...x, dr, eId, rId, kirim };
}

test('uploadFotoRow: 3 slot -> foto lengkap -> realisasi dihitung, revision eksekusi tidak naik', () => {
  const x = siapkanFoto();
  const a = x.kirim('SEBELUM');
  assert.deepStrictEqual([a.status, a.fotoLengkap], ['OK', false]);
  x.kirim('PEKERJAAN');
  const c = x.kirim('SESUDAH');
  assert.strictEqual(c.fotoLengkap, true);
  assert.strictEqual(kolom(x, 'row_Eksekusi', 1, 'foto_lengkap'), true);
  assert.strictEqual(kolom(x, 'row_Eksekusi', 1, 'revision'), 1, 'revision eksekusi tetap');
  assert.ok(String(kolom(x, 'row_Eksekusi', 1, 'Foto Sesudah URL')).includes('drive.google.com/file/d/'));
  assert.strictEqual(kolom(x, 'row_Realisasi', 1, 'Sedang'), 1);
  assert.strictEqual(kolom(x, 'row_Realisasi', 1, 'Section'), 'Kampung Baru');
  assert.strictEqual(x.sheets.r.row_Foto.data.length, 4);
  // folder Foto/YYYY/MM/DD/<Tim>/<Penyulang>/<Kode Eksekusi> (3 Okt 2026)
  const eks = x.sheets.r.row_Eksekusi.data[1], ske = x.skema.row_Eksekusi;
  const jalur = [x.hariIni.slice(0, 4), x.hariIni.slice(5, 7), x.hariIni.slice(8, 10),
    String(eks[ske.indexOf('Tim')]), 'TB-01', x.kodeH + '-PNY.001-EKS.001'];
  let f = x.dr.folders.akar;
  jalur.forEach((nm) => { assert.ok(f.anak[nm], 'folder ' + nm); f = x.dr.folders[f.anak[nm]]; });
  assert.strictEqual(Object.keys(f.file).length, 3, '3 foto di folder kode eksekusi');
});

test('namaFolderFoto_: garis miring dan spasi dirapikan, kosong jadi _', () => {
  const x = siapkanRow();
  assert.strictEqual(x.g.namaFolderFoto_('  Pongok / Bikang  '), 'Pongok - Bikang');
  assert.strictEqual(x.g.namaFolderFoto_('A\\B'), 'A-B');
  assert.strictEqual(x.g.namaFolderFoto_(''), '_');
  assert.strictEqual(x.g.namaFolderFoto_('R01-16130-2610030001-PNY.001-EKS.001'), 'R01-16130-2610030001-PNY.001-EKS.001', 'tanda - tetap');
  assert.strictEqual(x.g.namaFolderFoto_('A\tB\nC'), 'A-B-C', 'karakter kontrol');
});

test('uploadFotoRow: kirim ulang = DUPLIKAT tanpa file kembar, ganti foto membatalkan yang lama', () => {
  const x = siapkanFoto();
  const fotoId = U(), buf = jpeg(800, 600);
  x.kirim('SEBELUM', buf, fotoId);
  assert.strictEqual(x.kirim('SEBELUM', buf, fotoId).status, 'DUPLIKAT');
  assert.strictEqual(x.dr.dibuat.length, 1);
  const ganti = x.kirim('SEBELUM', jpeg(800, 600, 80));
  assert.strictEqual(ganti.status, 'OK');
  const f = x.sheets.r.row_Foto.data, sk = x.skema.row_Foto;
  assert.strictEqual(f[1][sk.indexOf('status')], 'BATAL');
  assert.strictEqual(f[2][sk.indexOf('status')], 'AKTIF');
  assert.strictEqual(x.dr.dibuat.length, 2, 'file lama tidak dihapus');
});

test('uploadFotoRow: tolak bukan JPEG, terlalu besar, sha256/ukuran salah, eksekusi tim lain', () => {
  const x = siapkanFoto();
  const err = (fn) => { try { fn(); } catch (e) { return e.kode; } return 'TIDAK_ERROR'; };
  assert.strictEqual(err(() => x.kirim('SEBELUM', Buffer.from('bukan foto sama sekali'))), 'FORMAT_FOTO_SALAH');
  assert.strictEqual(err(() => x.kirim('SEBELUM', jpeg(3000, 2000))), 'FOTO_TERLALU_BESAR');
  assert.strictEqual(err(() => x.kirim('SEBELUM', jpeg(800, 600), U(), { sha256: 'a'.repeat(64) })), 'FOTO_RUSAK');
  assert.strictEqual(err(() => x.kirim('SEBELUM', jpeg(800, 600), U(), { ukuranByte: 5 })), 'FOTO_RUSAK');
  assert.strictEqual(err(() => x.kirim('SEBELUM', jpeg(800, 600), U(), { mime: 'image/png' })), 'PILIHAN_TIDAK_VALID');
  const lain = { ...x.sesi, timId: U() };
  const buf = jpeg(800, 600);
  assert.strictEqual(err(() => x.g.uploadFotoRow_(lain, { fotoId: U(), eksekusiId: x.eId, slot: 'SEBELUM', sumberFoto: 'KAMERA',
    mime: 'image/jpeg', sha256: crypto.createHash('sha256').update(buf).digest('hex'), ukuranByte: buf.length, data: buf.toString('base64') }, 'MOBILE')), 'BUKAN_MILIK_TIM');
  assert.strictEqual(x.dr.dibuat.length, 0, 'tidak ada file dibuat untuk kiriman yang ditolak');
});

test('getFotoRow: daftar tanpa isi, per slot dengan isi sama persis, foto BATAL tidak ikut, tim lain ditolak', () => {
  const x = siapkanFoto();
  const err = (fn) => { try { fn(); } catch (e) { return e.kode; } return 'TIDAK_ERROR'; };
  const b1 = jpeg(800, 600), b2 = jpeg(800, 600, 90);
  x.kirim('SEBELUM', b1);
  x.kirim('SEBELUM', b2);           // ganti: b1 jadi BATAL
  x.kirim('SESUDAH', jpeg(640, 480));
  const ambil = (d, s = x.sesi) => JSON.parse(JSON.stringify(x.g.getFotoRow_(s, d)));
  const daftar = ambil({ eksekusiId: x.eId });
  assert.deepStrictEqual(daftar.foto.map((f) => f.slot).sort(), ['SEBELUM', 'SESUDAH']);
  assert.ok(daftar.foto.every((f) => f.data === undefined), 'daftar tanpa isi file');
  const satu = ambil({ eksekusiId: x.eId, slot: 'SEBELUM' });
  assert.strictEqual(satu.foto.length, 1);
  assert.strictEqual(Buffer.from(satu.foto[0].data, 'base64').toString('hex'), b2.toString('hex'), 'foto terbaru, isi utuh');
  assert.strictEqual(satu.foto[0].sha256, crypto.createHash('sha256').update(b2).digest('hex'));
  assert.strictEqual(err(() => ambil({ eksekusiId: x.eId, slot: 'PEKERJAAN' })), 'FOTO_TIDAK_ADA');
  assert.strictEqual(err(() => ambil({ eksekusiId: U() })), 'DATA_TIDAK_DITEMUKAN');
  assert.strictEqual(err(() => ambil({ eksekusiId: x.eId }, { ...x.sesi, timId: U() })), 'BUKAN_MILIK_TIM');
  assert.strictEqual(err(() => ambil({ eksekusiId: x.eId }, { ...x.sesi, role: 'ADMIN', timId: '' })), 'TIDAK_ERROR', 'admin boleh lihat');
  const fileId = x.sheets.r.row_Foto.data.slice(1).find((r) => r[x.skema.row_Foto.indexOf('slot')] === 'SESUDAH')[x.skema.row_Foto.indexOf('drive_file_id')];
  const asli = x.g.DriveApp.getFileById(fileId);
  const ganti = x.g.DriveApp.getFileById;
  x.g.DriveApp.getFileById = (id) => (id === fileId ? { getMimeType: () => 'image/jpeg', getBlob: () => ({ getBytes: () => [1, 2, 3] }) } : ganti(id));
  assert.strictEqual(err(() => ambil({ eksekusiId: x.eId, slot: 'SESUDAH' })), 'FOTO_TIDAK_VALID', 'file Drive diganti = ditolak');
  x.g.DriveApp.getFileById = (id) => (id === fileId ? { ...asli, getMimeType: () => 'text/plain' } : ganti(id));
  assert.strictEqual(err(() => ambil({ eksekusiId: x.eId, slot: 'SESUDAH' })), 'FOTO_TIDAK_VALID', 'bukan gambar = ditolak');
  x.g.DriveApp.getFileById = ganti;
  assert.ok(x.g.endpoints_().getFotoRow, 'terdaftar di router');
});

// ---------- laporan + WA ----------
test('WA: kosong sebelum foto lengkap, terisi setelah 3 foto, label dari master, sama dengan getLaporanRow', () => {
  const x = siapkanFoto();
  const wa = () => kolom(x, 'row_Header', 1, 'WA Text');
  assert.strictEqual(wa(), '', 'belum ada foto lengkap = WA kosong');
  const awal = JSON.parse(JSON.stringify(x.g.getLaporanRow_(x.sesi, {})));
  assert.strictEqual(awal.laporan[0].menungguFoto, 1);
  assert.ok(awal.laporan[0].peringatan.includes('MENUNGGU_FOTO'));
  x.kirim('SEBELUM'); x.kirim('PEKERJAAN'); x.kirim('SESUDAH');
  assert.strictEqual(wa(), '', 'foto lengkap tapi header belum lengkap = WA kosong');
  const belum = JSON.parse(JSON.stringify(x.g.getLaporanRow_(x.sesi, {}))).laporan[0];
  assert.deepStrictEqual([belum.siapKirim, belum.headerKurang], [false, ['koordinatAwal', 'koordinatAkhir', 'kmAwal', 'kmAkhir']]);
  assert.ok(belum.peringatan.includes('HEADER_BELUM_LENGKAP'));
  const hId = x.sheets.r.row_Header.data[1][x.skema.row_Header.indexOf('header_id')];
  // kendala tetap kosong (opsional)
  x.sync([x.op('header', 'ubah', hId, undefined, { koordinatAwal: '-3.01, 106.51', koordinatAkhir: '-3.02, 106.52', kmAwal: 10, kmAkhir: 12 }, 1)]);
  const t = wa();
  assert.ok(t.startsWith('*Realisasi Team ROW 01 ULP Toboali*'), t);
  assert.ok(t.includes('Hari / Tanggal : ' + x.g.tanggalPanjang_(x.hariIni)));
  assert.ok(t.includes('Koordinat Awal : -3.010000, 106.510000'));
  assert.ok(t.includes('Km Sebelum / Sesudah : 10 / 12'));
  assert.ok(t.includes('Kendala : -'), 'kendala opsional');
  assert.ok(t.includes('Penyulang : *TB-01*'));
  assert.ok(t.includes('Section : Kampung Baru'));
  assert.ok(t.includes('1. Rabas / Pangkas : 0 Gawang'));
  assert.ok(t.includes('2. Tebang Sedang kll>78,5cm <157cm : 1 Batang'), 'label keliling lama');
  assert.ok(t.includes('3. Tebang Besar >157cm : 0 Batang'));
  assert.ok(t.includes('Total Bulanan Rabas / Pangkas : 0 Gawang'));
  assert.ok(t.includes('Total Bulanan Tebang Pohon Keliling >78,5cm <157cm : 1 Batang'));
  assert.ok(t.includes('Total Bulanan Tebang Pohon Keliling >157cm : 0 Batang'));
  assert.ok(!t.includes('Ø'), 'tidak ada label diameter di WA');
  const lap = JSON.parse(JSON.stringify(x.g.getLaporanRow_(x.sesi, {})));
  assert.strictEqual(lap.laporan.length, 1);
  assert.strictEqual(lap.laporan[0].waText, t, 'pratinjau = teks di sheet');
  assert.strictEqual(lap.laporan[0].siapKirim, true);
  assert.deepStrictEqual(lap.laporan[0].peringatan, []);
  assert.deepStrictEqual(lap.laporan[0].total, { rabas: 0, sedang: 1, besar: 0 });
});

test('WA: ubah kendala & batal eksekusi menghitung ulang; total bulanan s.d. tanggal laporan', () => {
  const x = siapkanFoto();
  x.kirim('SEBELUM'); x.kirim('PEKERJAAN'); x.kirim('SESUDAH');
  const hId = x.sheets.r.row_Header.data[1][x.skema.row_Header.indexOf('header_id')];
  x.sync([x.op('header', 'ubah', hId, undefined, { kendala: 'Hujan deras', kmAwal: 10, kmAkhir: 12,
    koordinatAwal: '-3.01, 106.51', koordinatAkhir: '-3.02, 106.52' }, 1)]);
  const t = kolom(x, 'row_Header', 1, 'WA Text');
  assert.ok(t.includes('Kendala : Hujan deras') && t.includes('Km Sebelum / Sesudah : 10 / 12'));
  x.sync([x.op('eksekusi', 'batal', x.eId, undefined, {}, 1)]);
  assert.strictEqual(kolom(x, 'row_Header', 1, 'WA Text'), '', 'tanpa eksekusi terhitung = WA kosong');
  assert.strictEqual(kolom(x, 'row_Realisasi', 1, 'Sedang'), 0);
});

test('WA: total bulanan ikut hari sebelumnya di bulan yang sama', (t) => {
  const x = siapkanRow();
  const kemarin = x.g.tglJakarta_(new Date(Date.now() - 864e5));
  if (kemarin.slice(0, 7) !== x.hariIni.slice(0, 7)) { t.skip('hari ini tanggal 1'); return; }
  const isiSheet = (tgl, urut) => {
    const kode = x.g.kodeHeaderRow_('01', '16130', tgl, urut);
    const h = U(), r = U(), e = U();
    x.sync([x.op('header', 'buat', h, kode, { tanggal: tgl }),
            x.op('realisasi', 'buat', r, kode + '-PNY.001', { headerId: h, penyulang: 'TB-01' }),
            x.op('eksekusi', 'buat', e, kode + '-PNY.001-EKS.001', {
              realisasiId: r, sectionId: x.sekA, nomorTiang: 'T', koordinatPekerjaan: '-3.0, 106.5', diameter: 60, jenisId: x.jBesar })]);
    return e;
  };
  const e1 = isiSheet(kemarin, 1);
  isiSheet(x.hariIni, 1);
  // tandai foto lengkap langsung di sheet lalu picu hitung ulang lewat ubah nomor tiang
  const sk = x.skema.row_Eksekusi;
  x.sheets.r.row_Eksekusi.data.slice(1).forEach((b) => { b[sk.indexOf('foto_lengkap')] = true; });
  x.sync([x.op('eksekusi', 'ubah', e1, undefined, { nomorTiang: 'T1' }, 1)]);
  const eHariIni = x.sheets.r.row_Eksekusi.data[2][sk.indexOf('eksekusi_id')];
  x.sync([x.op('eksekusi', 'ubah', eHariIni, undefined, { nomorTiang: 'T2' }, 1)]);
  const lap = JSON.parse(JSON.stringify(x.g.getLaporanRow_(x.sesi, {})));
  assert.deepStrictEqual(lap.laporan[0].bulanan, { rabas: 0, sedang: 0, besar: 2 });
  const lapKemarin = JSON.parse(JSON.stringify(x.g.getLaporanRow_(x.sesi, { tanggal: kemarin })));
  assert.deepStrictEqual(lapKemarin.laporan[0].bulanan, { rabas: 0, sedang: 0, besar: 1 }, 'tidak ikut hari sesudahnya');
});

test('getLaporanRow: petugas hanya tim sendiri, admin semua sub-tim, batas 7 hari', () => {
  const x = siapkanRow();
  x.sync([x.op('header', 'buat', U(), x.kodeH, { tanggal: x.hariIni })]);
  const lain = { ...x.sesi, userId: U(), timId: U(), timNama: 'ROW 02', timKode: '02' };
  x.sync([x.op('header', 'buat', U(), x.g.kodeHeaderRow_('02', '16130', x.hariIni, 1), { tanggal: x.hariIni })], lain);
  assert.strictEqual(x.g.getLaporanRow_(x.sesi, {}).laporan.length, 1);
  assert.throws(() => x.g.getLaporanRow_(x.sesi, { timId: lain.timId }), /AKSES_DITOLAK/);
  const admin = { userId: U(), username: '16130.uji.admin', role: 'ADMIN', timId: '', jenisTim: '' };
  assert.strictEqual(x.g.getLaporanRow_(admin, {}).laporan.length, 2);
  assert.strictEqual(x.g.getLaporanRow_(admin, { timId: lain.timId }).laporan.length, 1);
  const lama = x.g.tglJakarta_(new Date(Date.now() - 8 * 864e5));
  assert.throws(() => x.g.getLaporanRow_(admin, { tanggal: lama }), /TANGGAL_DI_LUAR_BATAS/);
});

test('getMaster per modul: versi per database, pengguna tanpa email, bentuk lama tetap jalan', () => {
  const gm = buatKonteks(PROPS);
  const data = {
    db_Tim: [{ tim_id: 't1', jenis: 'ROW', nama: 'ROW 01', kode: 1, aktif: true }],
    db_Jaringan: [{ section_id: 's1', penyulang: 'TB-01', section: 'A', parent_section_id: '', urutan: 1, aktif: true }, { section_id: '' }],
    db_Jenis_Pekerjaan: [{ jenis_id: 'j1', modul: 'ROW', nama: 'Rabas / Pangkas', satuan: 'pohon', diameter_min: 0, diameter_max: 0, urutan: 1, aktif: true }],
    db_Users: [{ user_id: 'u1', username: ' 16130.Row01 ', nama: 'Petugas 1', email: 'rahasia@x.y', role: 'PETUGAS', tim_id: 't1', aktif: true }],
  };
  const dibaca = [];
  gm.tabel_ = (prop, nama) => { dibaca.push(nama); return { rows: data[nama] }; };
  const sesi = { userId: 'u1', role: 'ADMIN' };

  const a = JSON.parse(JSON.stringify(gm.getMaster_(sesi, { modul: ['pengguna', 'jaringan'] })));
  assert.deepStrictEqual(Object.keys(a.modul).sort(), ['jaringan', 'pengguna']);
  assert.deepStrictEqual(dibaca.sort(), ['db_Jaringan', 'db_Users'], 'hanya modul diminta yang dibaca');
  assert.strictEqual(a.modul.jaringan.jumlah, 1, 'baris tanpa ID dilewati');
  assert.strictEqual(a.modul.pengguna.isi[0].username, '16130.row01');
  assert.strictEqual(a.modul.pengguna.isi[0].email, undefined, 'email tidak dikirim');
  assert.strictEqual(a.versi, undefined, 'bentuk lama tidak dikirim saat pakai modul');

  const b = JSON.parse(JSON.stringify(gm.getMaster_(sesi, { versiModul: { jaringan: a.modul.jaringan.versi } })));
  assert.deepStrictEqual(Object.keys(b.modul).sort(), ['jaringan', 'jenisPekerjaan', 'pengguna', 'tim']);
  assert.strictEqual(b.modul.jaringan.berubah, false);
  assert.strictEqual(b.modul.jaringan.isi, undefined);
  assert.strictEqual(b.modul.tim.berubah, true);

  const lama = JSON.parse(JSON.stringify(gm.getMaster_(sesi, {})));
  assert.strictEqual(lama.berubah, true);
  assert.strictEqual(lama.isi.jaringan.length, 1);
  assert.strictEqual(JSON.parse(JSON.stringify(gm.getMaster_(sesi, { versi: lama.versi }))).berubah, false);

  assert.throws(() => gm.getMaster_(sesi, { modul: ['auth'] }), /FORMAT_SALAH/);
  assert.throws(() => gm.getMaster_(sesi, { modul: 'tim' }), /TIPE_SALAH/);
  assert.throws(() => gm.getMaster_(sesi, { lain: 1 }), /FIELD_TIDAK_DIKENAL/);

  // audit 4 Okt 2026: username + role hanya ADMIN/SUPER; PETUGAS hanya tim sendiri
  data.db_Users.push({ user_id: 'u2', username: '16130.row02', nama: 'Petugas 2', role: 'PETUGAS', tim_id: 't2', aktif: true });
  const p = JSON.parse(JSON.stringify(gm.getMaster_({ userId: 'u1', role: 'PETUGAS', timId: 't1' }, { modul: ['pengguna'] })));
  assert.deepStrictEqual(p.modul.pengguna.isi, [{ id: 'u1', nama: 'Petugas 1', timId: 't1', aktif: true }]);
  const es = JSON.parse(JSON.stringify(gm.getMaster_({ userId: 'x', role: 'ADMIN_ES' }, { modul: ['pengguna'] })));
  assert.strictEqual(es.modul.pengguna.isi.length, 2);
  assert.ok(es.modul.pengguna.isi.every((u) => u.username === undefined && u.role === undefined));
  const tanpaTim = JSON.parse(JSON.stringify(gm.getMaster_({ userId: 'u9', role: 'PETUGAS', timId: '' }, { modul: ['pengguna'] })));
  assert.strictEqual(tanpaTim.modul.pengguna.isi.length, 0, 'PETUGAS tanpa tim tidak melihat siapa pun');
});

test('guard: platform menu ditegakkan (WEB hanya rpc, MOBILE hanya doPost, KEDUANYA dua-duanya)', () => {
  const gp = buatKonteks(PROPS);
  gp.aturanAkses_ = () => ({
    menu: {
      ROW_EKSEKUSI: { kode: 'ROW_EKSEKUSI', platform: 'KEDUANYA', aktif: true },
      ROW_REKAP: { kode: 'ROW_REKAP', platform: 'WEB', aktif: true },
      HP_SAJA: { kode: 'HP_SAJA', platform: 'MOBILE', aktif: true },
      ANEH: { kode: 'ANEH', platform: 'semua', aktif: true },
    },
    akses: [{ role: 'ADMIN', jenisTim: '*', menu: '*', aksi: 'UBAH' }],
  });
  gp.sesiDariToken_ = () => ({ userId: 'u1', role: 'ADMIN', jenisTim: '' });
  const kodeG = (menu, platform) => kodeError(() => gp.guard_('x', { menu }, platform));
  assert.strictEqual(kodeG('ROW_EKSEKUSI', 'MOBILE'), null);
  assert.strictEqual(kodeG('ROW_EKSEKUSI', 'WEB'), null);
  assert.strictEqual(kodeG('ROW_REKAP', 'WEB'), null);
  assert.strictEqual(kodeG('ROW_REKAP', 'MOBILE'), 'AKSES_DITOLAK');
  assert.strictEqual(kodeG('HP_SAJA', 'WEB'), 'AKSES_DITOLAK');
  assert.strictEqual(kodeG('ANEH', 'MOBILE'), 'AKSES_DITOLAK', 'platform asing = tolak');
  assert.strictEqual(kodeG('TIDAK_ADA', 'MOBILE'), 'AKSES_DITOLAK');
  assert.strictEqual(kodeG('ROW_EKSEKUSI', undefined), 'AKSES_DITOLAK', 'platform tidak diketahui = tolak');
  // endpoint tanpa menu (cekSesi, getMaster) cukup sesi sah
  assert.strictEqual(kodeError(() => gp.guard_('x', {}, 'MOBILE')), null);
});

test('syncRow: nomor tiang boleh kosong; getKodeRow ikut kirim jenisId + diameter', () => {
  const x = siapkanRow();
  const hId = U(), rId = U(), eId = U();
  const r = x.sync([
    x.op('header', 'buat', hId, x.kodeH, { tanggal: x.hariIni, kmAwal: 12, kendala: 'hujan' }),
    x.op('realisasi', 'buat', rId, x.kodeH + '-PNY.001', { headerId: hId, penyulang: 'TB-01' }),
    x.op('eksekusi', 'buat', eId, x.kodeH + '-PNY.001-EKS.001', {
      realisasiId: rId, sectionId: x.sekA, koordinatPekerjaan: '-3.0, 106.5', diameter: 30, jenisId: x.jSedang }),
  ]);
  assert.deepStrictEqual(r.hasil.map((h) => h.status), ['OK', 'OK', 'OK']);
  assert.strictEqual(kolom(x, 'row_Eksekusi', 1, 'Nomor Tiang'), '');
  const k = JSON.parse(JSON.stringify(x.g.getKodeRow_(x.sesi, {})));
  assert.strictEqual(k.eksekusi[0].nomorTiang, '');
  assert.strictEqual(k.eksekusi[0].jenisId, x.jSedang);
  assert.strictEqual(k.eksekusi[0].diameter, 30);
  // isi tampilan ikut dikirim (bug 3 Okt: Jenis/Section kosong di detail setelah login ulang)
  assert.strictEqual(k.eksekusi[0].section, kolom(x, 'row_Eksekusi', 1, 'Section'));
  assert.ok(k.eksekusi[0].section, 'nama section terisi');
  assert.strictEqual(k.eksekusi[0].jenisNama, 'Tebang Sedang');
  assert.strictEqual(k.eksekusi[0].koordinatPekerjaan, kolom(x, 'row_Eksekusi', 1, 'Koordinat Pekerjaan'));
  assert.strictEqual(k.eksekusi[0].koordinatTiang, null);
  assert.deepStrictEqual([k.header[0].kmAwal, k.header[0].kmAkhir, k.header[0].kendala, k.header[0].koordinatAwal], [12, null, 'hujan', null]);
});

test('getArsipRow: sampai kemarin (hari H tidak masuk), maks 31 hari, AKTIF saja, tim sendiri, rincian per penyulang', () => {
  const x = siapkanRow();
  const kemarin = x.g.tglJakarta_(new Date(Date.now() - 864e5));
  const kodeK = x.g.kodeHeaderRow_('01', '16130', kemarin, 1);
  const h1 = U(), h2 = U(), hHariIni = U(), rId = U();
  x.sync([x.op('header', 'buat', h1, kodeK, { tanggal: kemarin, kmAwal: 10 }),
          x.op('realisasi', 'buat', rId, kodeK + '-PNY.001', { headerId: h1, penyulang: 'TB-01' }),
          x.op('header', 'buat', hHariIni, x.kodeH, { tanggal: x.hariIni })]);
  const lain = { ...x.sesi, userId: U(), timId: U(), timNama: 'ROW 02', timKode: '02' };
  x.sync([x.op('header', 'buat', h2, x.g.kodeHeaderRow_('02', '16130', kemarin, 1), { tanggal: kemarin })], lain);
  x.sheets.r.row_Header.data[1][x.skema.row_Header.indexOf('WA Text')] = '*Realisasi Team ROW 01*';
  x.sheets.r.row_Realisasi.data[1][x.skema.row_Realisasi.indexOf('Sedang')] = 2;

  const dari = x.g.tglJakarta_(new Date(Date.now() - 30 * 864e5));
  const a = JSON.parse(JSON.stringify(x.g.getArsipRow_(x.sesi, { dari, sampai: kemarin })));
  assert.strictEqual(a.laporan.length, 1, 'tim lain & hari H tidak terlihat');
  assert.strictEqual(a.laporan[0].kodeHeader, kodeK);
  assert.strictEqual(a.laporan[0].penyulang, 1);
  assert.strictEqual(a.laporan[0].total.sedang, 2);
  assert.deepStrictEqual(a.laporan[0].rincian, [{ kode: kodeK + '-PNY.001', penyulang: 'TB-01', section: '', rabas: 0, sedang: 2, besar: 0 }]);
  assert.strictEqual(a.laporan[0].kmAwal, 10);
  assert.strictEqual(a.laporan[0].siapKirim, true);
  assert.strictEqual(a.laporan[0].waText, '*Realisasi Team ROW 01*');
  const admin = { userId: U(), username: '16130.uji.admin', role: 'ADMIN', timId: '', jenisTim: '' };
  assert.strictEqual(x.g.getArsipRow_(admin, { dari, sampai: kemarin }).laporan.length, 2);

  assert.throws(() => x.g.getArsipRow_(x.sesi, { dari, sampai: x.hariIni }), /TANGGAL_DI_LUAR_BATAS/, 'hari H ditolak');
  assert.throws(() => x.g.getArsipRow_(x.sesi, { dari, sampai: kemarin, timId: lain.timId }), /AKSES_DITOLAK/);
  const jauh = x.g.tglJakarta_(new Date(Date.now() - 32 * 864e5));
  assert.throws(() => x.g.getArsipRow_(x.sesi, { dari: jauh, sampai: kemarin }), /RENTANG_TERLALU_PANJANG/);
  assert.throws(() => x.g.getArsipRow_(x.sesi, { dari: kemarin, sampai: dari }), /RENTANG_TIDAK_VALID/);
  assert.throws(() => x.g.getArsipRow_(x.sesi, { dari }), /FIELD_WAJIB/);
});

// ---------- audit guard (3 Okt 2026): semua pintu masuk terjaga ----------
test('audit guard: hanya doPost/doGet/rpc + ADMIN_* (wajib pastikanPemilik_) yang publik di Apps Script', () => {
  const fs = require('fs');
  const path = require('path');
  const akar = path.join(__dirname, '..', 'backend', 'src');
  const file = [];
  const jalan = (d) => fs.readdirSync(d).forEach((n) => {
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) jalan(p); else if (n.endsWith('.js')) file.push(p);
  });
  jalan(akar);
  const publik = [];
  for (const f of file) {
    const isi = fs.readFileSync(f, 'utf8');
    for (const m of isi.matchAll(/^function\s+([A-Za-z0-9]+)\s*\(/gm)) if (!m[1].endsWith('_')) publik.push(m[1]);
    assert.ok(!/^(var|let|const)\s+[A-Za-z0-9]*[^_\s]\s*=\s*function/m.test(isi), 'tidak ada fungsi anonim global (lolos audit nama): ' + f);
  }
  const bebas = ['doPost', 'doGet', 'rpc'];
  for (const n of publik) {
    if (bebas.includes(n)) continue;
    assert.ok(n.startsWith('ADMIN_'), 'fungsi publik tak dikenal: ' + n);
    const badan = g[n].toString().split('{').slice(1).join('{').trim();
    assert.ok(badan.startsWith('pastikanPemilik_();'), n + ' wajib diawali pastikanPemilik_()');
  }
});

test('audit guard: semua endpoint lewat guard_, menu & tulis sesuai, kepemilikan dicek di fungsi', () => {
  const ep = g.endpoints_();
  const publik = Object.keys(ep).filter((k) => ep[k].publik);
  assert.deepStrictEqual(publik.sort(), ['login', 'ping'], 'hanya ping & login tanpa sesi');
  const tanpaMenu = Object.keys(ep).filter((k) => !ep[k].publik && !ep[k].menu).sort();
  assert.deepStrictEqual(tanpaMenu, ['cekSesi', 'getMaster', 'logout'], 'endpoint tanpa menu hanya yang milik sesi sendiri');
  const tulis = Object.keys(ep).filter((k) => ep[k].tulis && !ep[k].publik).sort();
  assert.deepStrictEqual(tulis, ['simpanLaporanUiw', 'simpanLaporanUp3', 'syncRow', 'uploadFotoRow'], 'endpoint tulis butuh UBAH');
  // data ROW: fungsi wajib membatasi ke tim sesi (PETUGAS) sendiri
  const cekMilik = { getKodeRow: /sesi\.timId/, syncRow: /BUKAN_MILIK_TIM|timId/, uploadFotoRow: /BUKAN_MILIK_TIM/,
    getFotoRow: /timLaporan_/, getLaporanRow: /timLaporan_/, getArsipRow: /timLaporan_/,
    getArsipHariRow: /timLaporan_/, getFotoArsipRow: /kunciArsipFoto_\(sesi/,
    getLaporanUp3: /peranLaporanUp3_\(sesi, false\)/, getLaporanUiw: /peranLaporanUp3_\(sesi, false\)/,
    simpanLaporanUp3: /peranLaporanUp3_\(sesi, true\)/, simpanLaporanUiw: /peranLaporanUp3_\(sesi, true\)/ };
  for (const k of Object.keys(ep).filter((k) => ep[k].menu)) {
    assert.ok(cekMilik[k], 'endpoint menu baru belum diaudit kepemilikannya: ' + k);
    assert.match(ep[k].fn.toString(), cekMilik[k], k + ' tidak membatasi data ke tim sesi');
  }

  // perilaku: token salah / tanpa akses / platform salah = ditolak SEBELUM fungsi endpoint jalan
  const gp = buatKonteks(PROPS);
  const dipanggil = [];
  const nama = Object.keys(gp.endpoints_());
  for (const k of nama) {
    const fnNama = gp.endpoints_()[k].fn.name;
    gp[fnNama] = () => { dipanggil.push(k); return {}; };
  }
  gp.aturanAkses_ = () => ({
    menu: { ROW_EKSEKUSI: { kode: 'ROW_EKSEKUSI', platform: 'MOBILE', aktif: true }, ROW_LAPORAN: { kode: 'ROW_LAPORAN', platform: 'KEDUANYA', aktif: true } },
    akses: [{ role: 'ADMIN_ES', jenisTim: '*', menu: 'ROW_LAPORAN', aksi: 'LIHAT' }],
  });
  for (const k of nama.filter((k) => !gp.endpoints_()[k].publik)) {
    assert.strictEqual(kodeError(() => gp.proses_({ action: k, token: 'bukan-token' }, 'MOBILE')), 'SESI_TIDAK_VALID', k);
  }
  gp.sesiDariToken_ = () => ({ userId: 'u', role: 'ADMIN_ES', jenisTim: '' });
  for (const k of nama.filter((k) => gp.endpoints_()[k].menu === 'ROW_EKSEKUSI')) {
    assert.strictEqual(kodeError(() => gp.proses_({ action: k, token: 'x' }, 'MOBILE')), 'AKSES_DITOLAK', k + ' tanpa akses menu');
  }
  gp.sesiDariToken_ = () => ({ userId: 'u', role: 'PETUGAS', jenisTim: 'ROW', timId: 't' });
  gp.aturanAkses_ = () => ({
    menu: { ROW_EKSEKUSI: { kode: 'ROW_EKSEKUSI', platform: 'MOBILE', aktif: true } },
    akses: [{ role: 'PETUGAS', jenisTim: 'ROW', menu: 'ROW_EKSEKUSI', aksi: 'LIHAT' }],
  });
  for (const k of ['syncRow', 'uploadFotoRow']) {
    assert.strictEqual(kodeError(() => gp.proses_({ action: k, token: 'x' }, 'MOBILE')), 'AKSES_DITOLAK', k + ' LIHAT tidak boleh tulis');
  }
  assert.strictEqual(kodeError(() => gp.proses_({ action: 'getFotoRow', token: 'x' }, 'WEB')), 'AKSES_DITOLAK', 'menu MOBILE dari web');
  assert.deepStrictEqual(dipanggil, [], 'tidak ada fungsi endpoint yang jalan saat ditolak');
  gp.aturanAkses_ = () => ({
    menu: { ROW_LAPORAN: { kode: 'ROW_LAPORAN', platform: 'KEDUANYA', aktif: true } },
    akses: [{ role: 'PETUGAS', jenisTim: 'ROW', menu: 'ROW_LAPORAN', aksi: 'LIHAT' }],
  });
  assert.strictEqual(kodeError(() => gp.proses_({ action: 'getLaporanRow', token: 'x' }, 'MOBILE')), null);
  assert.deepStrictEqual(dipanggil, ['getLaporanRow'], 'kontrol: akses sah memang sampai ke fungsi');
});

// ---------- migrasi: dry-run (keputusan 3 Okt 2026) ----------
test('migrasi helper: tanggal lama, angka, URL Drive, UUID deterministik', () => {
  assert.strictEqual(g.tglLama_('15/09/2026'), '2026-09-15');
  assert.strictEqual(g.tglLama_('5/9/2026 08:00:00'), '2026-09-05');
  assert.strictEqual(g.tglLama_('2026-09-15'), '2026-09-15');
  assert.strictEqual(g.tglLama_(new Date('2026-09-14T17:00:00Z')), '2026-09-15', 'Date dari Sheets (00:00 WIB)');
  assert.strictEqual(g.tglLama_('kemarin'), '');
  assert.strictEqual(g.angkaLama_('12,5'), 12.5);
  assert.strictEqual(g.angkaLama_(''), null);
  assert.strictEqual(g.angkaLama_('abc'), null);
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  for (const u of [`https://drive.google.com/file/d/${id}/view`, `https://drive.google.com/open?id=${id}`,
    `https://drive.google.com/uc?export=view&id=${id}`, `https://lh3.googleusercontent.com/d/${id}=w800`]) {
    assert.strictEqual(g.driveIdDariUrl_(u), id, u);
  }
  assert.strictEqual(g.driveIdDariUrl_('Foto Sebelum.jpg'), null);
  const a = g.uuidMig_('header', 'R01-16130260915001');
  assert.strictEqual(a, g.uuidMig_('header', 'R01-16130260915001'), 'deterministik');
  assert.notStrictEqual(a, g.uuidMig_('realisasi', 'R01-16130260915001'));
  assert.strictEqual(g.validasi_({ x: a }, { x: { tipe: 'uuid' } }).x, a, 'lolos validasi uuid v2');
});

function sampelMigrasi() {
  const jRabas = U(), jSedang = U(), jBesar = U(), secA = U(), secB = U(), timRow01 = U();
  const M = {
    tim: [{ tim_id: timRow01, jenis: 'ROW', kode: '01', nama: 'ROW 01' }, { tim_id: U(), jenis: 'YANDAL', kode: '09', nama: 'Yandal' }],
    jaringan: { [secA]: { penyulang: 'Bikang', section: 'LBS Pergam' }, [secB]: { penyulang: 'Parit Tujuh', section: 'Kampung Baru' } },
    jenis: [
      { jenis_id: jRabas, modul: 'ROW', nama: 'Rabas / Pangkas', diameter_min: 0, diameter_max: 0, aktif: 'TRUE' },
      { jenis_id: jSedang, modul: 'ROW', nama: 'Tebang Sedang', diameter_min: 25, diameter_max: 50, aktif: 'TRUE' },
      { jenis_id: jBesar, modul: 'ROW', nama: 'Tebang Besar', diameter_min: 51, diameter_max: '', aktif: 'TRUE' }],
  };
  const fid = (n) => `https://drive.google.com/file/d/1FotoContohIdYangCukupPanjang${n}/view`;
  const H = (kode, tgl, extra = {}) => ({ 'Kode Header': kode, ULP: 'Toboali', Tanggal: tgl, Tim: 'ROW', 'Sub-Tim': 'ROW 01',
    'Koordinat Awal': '-3.01, 106.51', 'Koordinat Akhir': '-3.02, 106.52', 'KM Awal': 10, 'KM Akhir': 20, Kendala: '',
    TimeStamp: tgl + ' 08:00:00', 'Input By': '16130.row01', ...extra });
  const R = (kh, kp, peny, tgl, sedang = 0) => ({ 'Kode Header': kh, 'Kode Pekerjaan': kp, Tanggal: tgl, Tim: 'ROW 01', Penyulang: peny,
    Rabas: 0, Sedang: sedang, Besar: 0, Timestamp: tgl + ' 09:00:00' });
  const E = (kp, ke, peny, sec, d, jenis, tgl, extra = {}) => ({ 'Kode Header': '', 'Kode Pekerjaan': kp, 'Kode Eksekusi': ke, Tanggal: tgl,
    Tim: 'ROW 01', Penyulang: peny, Section: sec, 'Nomor Tiang': 'T1', 'Koordinat Tiang': '-3.0, 106.5', 'Koordinat Pekerjaan': '-3.0, 106.5',
    'Foto Sebelum URL': fid(1), 'Foto Pekerjaan URL': fid(2), 'Foto Sesudah URL': fid(3), Diameter: d, 'Jenis Pekerjaan': jenis,
    'Input Oleh': '16130.row01', Timestamp: tgl + ' 10:00:00', ...extra });
  const h1 = 'R01-16130260915001', h2 = 'R01-16130260915002';
  const S = {
    header: [
      H(h1, '15/09/2026'),
      H(h2, '15/09/2026', { 'KM Akhir': '' }),                 // header ganda, digabung ke h1
      H('R01-16130260916001', '16/09/2026', { 'KM Awal': '' }), // WA akan kosong
      H('ROWX-LAMA-1', '17/09/2026'),                         // kode bukan format v2 -> dibuat ulang
      H('R01-16130251231001', '31/12/2025'),                  // luar periode
      H('IGD-1', '15/09/2026', { Tim: 'INSPEKSI' }),          // bukan ROW
      H('R01-16130260918001', '18/09/2026', { 'Sub-Tim': 'ROW 07' }), // tim tidak ada
    ],
    realisasi: [
      R(h1, h1 + '-PNY.001', 'Bikang', '15/09/2026', 2),
      R(h2, h2 + '-PNY.001', 'Parit Tujuh', '15/09/2026', 1),  // pindah ke h1 jadi PNY.002
      R(h2, h2 + '-PNY.002', 'bikang', '15/09/2026'),          // penyulang dobel setelah gabung
      R('ROWX-LAMA-1', 'ROWX-LAMA-1-P1', 'Bikang', '17/09/2026'),
      R(h1, h1 + '-PNY.009', 'Penyulang Hantu', '15/09/2026'), // tidak ada di master
    ],
    eksekusi: [
      E(h1 + '-PNY.001', h1 + '-PNY.001-EKS.001', 'Bikang', 'LBS Pergam', 30, 'Tebang Sedang', '15/09/2026'),
      E(h1 + '-PNY.001', h1 + '-PNY.001-EKS.002', 'Bikang', 'LBS Pergam', 12, 'Tebang Sedang', '15/09/2026'), // 1-24 cm
      E(h2 + '-PNY.002', 'A1B2C3D4', 'Bikang', 'LBS Pergam', 60, 'Tebang Sedang', '15/09/2026'),            // jenis berubah -> Besar
      E(h2 + '-PNY.001', h2 + '-PNY.001-EKS.001', 'Parit Tujuh', 'Kampung Baru', 0, 'Rabas / Pangkas', '15/09/2026', { 'Foto Sesudah URL': '' }),
      E(h1 + '-PNY.001', h1 + '-PNY.001-EKS.003', 'Bikang', 'Section Hantu', 30, 'Tebang Sedang', '15/09/2026'),
      E(h1 + '-PNY.001', h1 + '-PNY.001-EKS.004', 'Bikang', 'LBS Pergam', '', 'Tebang Sedang', '15/09/2026'),
      E(h1 + '-PNY.001', h1 + '-PNY.001-EKS.005', 'Bikang', 'LBS Pergam', 40, 'Tebang Sedang', '15/09/2026', { 'Koordinat Tiang': '', 'Koordinat Pekerjaan': '' }),
      E('', 'B1B2C3D4', 'Bikang', 'LBS Pergam', 45.6, 'Tebang Sedang', '17/09/2026'),  // induk kosong, ditebak Tim+Penyulang+Tanggal
      E(h1 + '-PNY.001', h1 + '-PNY.001-EKS.001', 'Bikang', 'LBS Pergam', 30, 'Tebang Sedang', '15/09/2026', { Timestamp: '15/09/2026 07:00:00' }), // duplikat lebih lama
    ],
    kolom: { header: g.MIG_KOLOM_WAJIB_.header, realisasi: g.MIG_KOLOM_WAJIB_.realisasi, eksekusi: g.MIG_KOLOM_WAJIB_.eksekusi },
  };
  return { S, M, opsi: { dari: '2026-01-01', sampai: '2026-10-03', kodeUlp: '16130' } };
}

test('migrasi dry-run: header ganda digabung, kode dibuat ulang, jenis dari diameter, karantina, foto, ringkasan per bulan', () => {
  const { S, M, opsi } = sampelMigrasi();
  const r = JSON.parse(JSON.stringify(g.analisisMigrasi_(S, M, opsi)));
  const ada = (jenis, kode, alasan) => r.catatan.some((c) => c.jenis === jenis && c.kodeLama === kode && c.alasan.startsWith(alasan));
  const baru = (jenis, kode) => (r.catatan.find((c) => c.jenis === jenis && c.kodeLama === kode && c.alasan === 'KODE_DIBUAT_ULANG') || {}).kodeBaru;
  assert.deepStrictEqual(r.kolomKurang, {});
  // header
  assert.strictEqual(r.hitung.header.lolos, 3, 'h1(+h2), 16 Sep, 17 Sep');
  assert.strictEqual(r.hitung.header.digabung, 1);
  assert.strictEqual(r.hitung.header.bukanRow, 1);
  assert.strictEqual(r.hitung.header.luarPeriode, 1);
  assert.ok(ada('header', 'R01-16130260915002', 'HEADER_GANDA'));
  assert.ok(ada('header', 'R01-16130260918001', 'TIM_TIDAK_ADA'));
  assert.ok(ada('header', 'R01-16130260916001', 'WA_AKAN_KOSONG'));
  assert.ok(!ada('header', 'R01-16130260915001', 'WA_AKAN_KOSONG'), 'KM Akhir header gabungan diambil dari header utama');
  assert.strictEqual(baru('header', 'ROWX-LAMA-1'), 'R01-16130260917001');
  // realisasi
  assert.strictEqual(baru('realisasi', 'R01-16130260915002-PNY.001'), 'R01-16130260915001-PNY.002', 'pindah ke header utama, nomor lanjut');
  assert.ok(ada('realisasi', 'R01-16130260915002-PNY.002', 'PENYULANG_GANDA'));
  assert.ok(ada('realisasi', 'R01-16130260915001-PNY.009', 'PENYULANG_TIDAK_ADA'));
  assert.strictEqual(baru('realisasi', 'ROWX-LAMA-1-P1'), 'R01-16130260917001-PNY.001');
  // eksekusi
  assert.ok(ada('eksekusi', 'R01-16130260915001-PNY.001-EKS.002', 'DIAMETER_DI_LUAR_KATEGORI'), '1-24 cm karantina');
  assert.ok(ada('eksekusi', 'A1B2C3D4', 'JENIS_BERUBAH (Sedang -> Besar)'));
  assert.strictEqual(baru('eksekusi', 'A1B2C3D4'), 'R01-16130260915001-PNY.001-EKS.002', 'ikut realisasi Bikang hasil gabung, nomor setelah EKS.001');
  assert.ok(ada('eksekusi', 'R01-16130260915001-PNY.001-EKS.003', 'SECTION_TIDAK_ADA'));
  assert.ok(ada('eksekusi', 'R01-16130260915001-PNY.001-EKS.004', 'DIAMETER_KOSONG'));
  assert.ok(ada('eksekusi', 'R01-16130260915001-PNY.001-EKS.005', 'KOORDINAT_WAJIB'));
  assert.ok(ada('eksekusi', 'B1B2C3D4', 'INDUK_DARI_TIM_PENYULANG_TANGGAL'));
  assert.ok(ada('eksekusi', 'B1B2C3D4', 'DIAMETER_DIBULATKAN'));
  assert.strictEqual(baru('eksekusi', 'B1B2C3D4'), 'R01-16130260917001-PNY.001-EKS.001');
  assert.strictEqual(r.hitung.eksekusi.duplikatSumber, 1);
  assert.strictEqual(r.hitung.eksekusi.lolos, 4);
  assert.strictEqual(r.hitung.eksekusi.karantina, 4);
  assert.deepStrictEqual(r.foto, { slot: 12, siapSalin: 11, kosong: 1, urlRusak: 0, dariPath: 0 });
  // ringkasan per bulan
  const b = r.perBulan['2026-09|ROW 01'];
  assert.strictEqual(b.header, 3);
  assert.deepStrictEqual(b.lama, { rabas: 0, sedang: 3, besar: 0 });
  assert.deepStrictEqual(b.baru, { rabas: 1, sedang: 2, besar: 1 });
  assert.deepStrictEqual(b.baruFotoLengkap, { rabas: 0, sedang: 2, besar: 1 }, 'rabas foto sesudah kosong');
  // idempoten: dijalankan ulang = hasil sama persis
  assert.deepStrictEqual(JSON.parse(JSON.stringify(g.analisisMigrasi_(sampelMigrasi().S, M, opsi))).catatan, r.catatan);
});

test('migrasi dry-run: nama dirapikan otomatis, mig_Alias dipakai, sisanya karantina + saran', () => {
  const { S, M, opsi } = sampelMigrasi();
  S.realisasi[0].Penyulang = 'PENYULANG  Bikang';                 // rapikan otomatis
  S.eksekusi[0].Section = 'lbs pergam';
  S.realisasi[3].Penyulang = 'Bkang';                              // salah ketik -> karantina + saran
  M.alias = [{ jenis: 'SECTION', penyulang: 'Bikang', nilai_lama: 'Section Hantu', nilai_master: 'LBS Pergam' }];
  const r = JSON.parse(JSON.stringify(g.analisisMigrasi_(S, M, opsi)));
  const cari = (kode) => r.catatan.filter((c) => c.kodeLama === kode).map((c) => c.alasan);
  assert.ok(!cari('R01-16130260915001-PNY.001').some((a) => a.startsWith('PENYULANG_TIDAK_ADA')), 'awalan + spasi + huruf besar dirapikan');
  assert.ok(!cari('R01-16130260915001-PNY.001-EKS.001').some((a) => a.startsWith('SECTION_TIDAK_ADA')));
  assert.ok(!cari('R01-16130260915001-PNY.001-EKS.003').some((a) => a.startsWith('SECTION_TIDAK_ADA')), 'alias section dipakai');
  assert.ok(cari('ROWX-LAMA-1-P1').includes('PENYULANG_TIDAK_ADA (Bkang) saran: Bikang'), 'saran tidak dipakai otomatis');
  assert.strictEqual(g.normNama_('  Peny. TUGU   Nanas '), 'tugu nanas');
  assert.strictEqual(g.normNama_('LBS Pergam-ACR Tepus'), g.normNama_('lbs pergam - acr tepus'));
});

test('migrasi dry-run: perbaikan induk eksekusi -> realisasi -> header (dicari dulu, baru dibuat)', () => {
  const { S, M, opsi } = sampelMigrasi();
  const E0 = S.eksekusi[0];
  const E = (extra) => ({ ...E0, ...extra });
  // a) realisasi dengan Kode Header yang tidak ada di sumber -> header dicari lewat tim + tanggal (17 Sep ada)
  S.realisasi.push({ ...S.realisasi[0], 'Kode Header': 'HILANG-1', 'Kode Pekerjaan': 'RX-1', Penyulang: 'Parit Tujuh', Tanggal: '17/09/2026', Timestamp: '17/09/2026 11:00:00' });
  // b) realisasi 20 Sep tanpa header sama sekali -> header dibuat
  S.realisasi.push({ ...S.realisasi[0], 'Kode Header': '', 'Kode Pekerjaan': 'RX-2', Penyulang: 'Bikang', Tanggal: '20/09/2026' });
  S.eksekusi.push(
    // c) Kode Pekerjaan tidak ada di sumber, 16 Sep ada header tapi belum ada realisasi Bikang -> realisasi dibuat
    E({ 'Kode Pekerjaan': 'TIDAK-ADA', 'Kode Eksekusi': 'EX-1', Tanggal: '16/09/2026' }),
    E({ 'Kode Pekerjaan': '', 'Kode Eksekusi': 'EX-2', Tanggal: '16/09/2026' }),             // ikut realisasi buatan EX-1
    // d) 21 Sep: tanpa header & realisasi -> dua-duanya dibuat; tanggal juga bisa dibaca dari kode
    E({ 'Kode Pekerjaan': '', 'Kode Eksekusi': 'R01-16130260921001-PNY.001-EKS.001', Tanggal: '' }),
    // e) induknya ADA di sumber tapi karantina (penyulang hantu) -> ikut karantina, tidak dibuatkan induk
    E({ 'Kode Pekerjaan': 'R01-16130260915001-PNY.009', 'Kode Eksekusi': 'EX-3' }),
    // f) penyulang eksekusi tidak ada di master -> tidak bisa dibuatkan induk
    E({ 'Kode Pekerjaan': '', 'Kode Eksekusi': 'EX-4', Tanggal: '22/09/2026', Penyulang: 'Bkang' }),
    // g) tim tidak ada
    E({ 'Kode Pekerjaan': '', 'Kode Eksekusi': 'EX-5', Tanggal: '23/09/2026', Tim: 'ROW 07' }));
  const r = JSON.parse(JSON.stringify(g.analisisMigrasi_(S, M, opsi)));
  const cari = (jenis, kode) => r.catatan.filter((c) => c.jenis === jenis && c.kodeLama === kode);
  const alasan = (jenis, kode) => cari(jenis, kode).map((c) => c.alasan);
  const dibuat = (jenis) => r.catatan.filter((c) => c.jenis === jenis && c.status === 'INDUK_DIBUAT');
  // a
  assert.ok(alasan('realisasi', 'RX-1').includes('INDUK_DARI_TIM_TANGGAL'));
  assert.strictEqual(r.catatan.find((c) => c.kodeLama === 'RX-1' && c.alasan === 'KODE_DIBUAT_ULANG').kodeBaru, 'R01-16130260917001-PNY.002');
  // b + d: header dibuat untuk 20 Sep dan 21 Sep, WA kosong
  assert.deepStrictEqual(dibuat('header').map((c) => c.kodeBaru).sort(), ['R01-16130260920001', 'R01-16130260921001']);
  assert.ok(alasan('realisasi', 'RX-2').includes('HEADER_DIBUAT'));
  // c: realisasi Bikang 16 Sep dibuat sekali, dipakai EX-1 dan EX-2
  const rDibuat = dibuat('realisasi');
  assert.deepStrictEqual(rDibuat.map((c) => c.kodeBaru).sort(), ['R01-16130260916001-PNY.001', 'R01-16130260921001-PNY.001']);
  assert.ok(alasan('eksekusi', 'EX-1').includes('INDUK_DIBUAT (realisasi)'));
  assert.ok(alasan('eksekusi', 'EX-2').includes('INDUK_DARI_TIM_PENYULANG_TANGGAL'));
  const kb = (kode) => (cari('eksekusi', kode).find((c) => c.alasan === 'KODE_DIBUAT_ULANG') || {}).kodeBaru;
  assert.deepStrictEqual([kb('EX-1'), kb('EX-2')], ['R01-16130260916001-PNY.001-EKS.001', 'R01-16130260916001-PNY.001-EKS.002']);
  // d: kode lama sudah cocok dengan induk buatan -> dipertahankan
  assert.ok(alasan('eksekusi', 'R01-16130260921001-PNY.001-EKS.001').includes('INDUK_DIBUAT (realisasi + header)'));
  assert.ok(!kb('R01-16130260921001-PNY.001-EKS.001'), 'kode lama dipakai');
  // e, f, g
  assert.ok(alasan('eksekusi', 'EX-3').includes('INDUK_TIDAK_LOLOS (R01-16130260915001-PNY.009)'));
  assert.ok(alasan('eksekusi', 'EX-4').some((a) => a.startsWith('INDUK_TIDAK_ADA, PENYULANG_TIDAK_ADA (Bkang) saran: Bikang')));
  assert.ok(alasan('eksekusi', 'EX-5').includes('TIM_TIDAK_ADA (ROW 07)'));
  assert.strictEqual(r.hitung.header.dibuat, 2);
  assert.strictEqual(r.hitung.realisasi.dibuat, 2);
  assert.strictEqual(r.perBulan['2026-09|ROW 01'].header, 5);
  // idempoten
  assert.deepStrictEqual(JSON.parse(JSON.stringify(g.analisisMigrasi_(S, M, opsi))).catatan, r.catatan);
});

test('migrasi mig_Koreksi: baris sumber dikoreksi sebelum dianalisis (sumber asli tidak berubah)', () => {
  const { S, M, opsi } = sampelMigrasi();
  const eks2 = 'R01-16130260915001-PNY.001-EKS.002';                 // diameter 12 -> karantina
  M.koreksi = [
    { jenis: 'EKSEKUSI', kode_lama: eks2, kolom: 'Diameter', nilai_baru: 26 },
    { jenis: 'eksekusi', kode_lama: 'R01-16130260915001-PNY.001-EKS.003', kolom: 'Section', nilai_baru: 'LBS Pergam' },
    { jenis: 'EKSEKUSI', kode_lama: 'TIDAK-ADA', kolom: 'Diameter', nilai_baru: 30 },
    { jenis: 'EKSEKUSI', kode_lama: eks2, kolom: 'Kolom Ngawur', nilai_baru: 1 },
  ];
  const r = JSON.parse(JSON.stringify(g.analisisMigrasi_(S, M, opsi)));
  const alasan = (kode) => r.catatan.filter((c) => c.kodeLama === kode).map((c) => c.alasan);
  assert.ok(alasan(eks2).includes('DIKOREKSI (Diameter)'));
  assert.ok(!alasan(eks2).some((a) => a.startsWith('DIAMETER_DI_LUAR_KATEGORI')), 'tidak karantina lagi');
  assert.ok(!alasan('R01-16130260915001-PNY.001-EKS.003').some((a) => a.startsWith('SECTION_TIDAK_ADA')));
  assert.ok(alasan('TIDAK-ADA').some((a) => a.startsWith('KOREKSI_TIDAK_TERPAKAI')));
  assert.ok(r.catatan.some((c) => c.alasan === 'KOREKSI_KOLOM_TIDAK_DIKENAL (Kolom Ngawur)'));
  assert.strictEqual(S.eksekusi[1].Diameter, 12, 'sumber asli tidak diubah');
  assert.strictEqual(r.hitung.eksekusi.karantina, 2);
});

test('migrasi tahap A: rencana baris v2 lengkap, urut Timestamp, antrean foto + peta, ID deterministik', () => {
  const { S, M, opsi } = sampelMigrasi();
  const sekarang = new Date('2026-10-03T15:00:00Z');
  const buat = () => g.rencanaMigrasi_(g.analisisMigrasi_(sampelMigrasi().S, M, opsi), { ulpNama: 'Toboali', sekarang });
  const a = g.rencanaMigrasi_(g.analisisMigrasi_(S, M, opsi), { ulpNama: 'Toboali', sekarang });
  const skema = g.skemaHeader_().ROW_SHEET_ID;
  // semua kolom yang diisi memang ada di skema (No diisi saat tulis)
  for (const [j, sh] of [['header', 'row_Header'], ['realisasi', 'row_Realisasi'], ['eksekusi', 'row_Eksekusi']]) {
    for (const o of a[j]) for (const k of Object.keys(o)) assert.ok(skema[sh].includes(k), `${sh}.${k}`);
    for (const o of a[j]) assert.deepStrictEqual([o.status, o.revision, o.dibuat_oleh, o.diubah_oleh], ['AKTIF', 1, 'MIGRASI', 'MIGRASI']);
  }
  assert.strictEqual(a.header.length, 3);
  assert.strictEqual(a.realisasi.length, 3);
  assert.strictEqual(a.eksekusi.length, 4);
  const h = a.header.find((x) => x['Kode Header'] === 'R01-16130260915001');
  assert.deepStrictEqual([h.Hari, h.Tim, h['Sub-Tim'], h['KM Akhir'], h['Koordinat Awal'], h['WA Text']],
    ['Selasa', 'ROW', 'ROW 01', 20, '-3.010000, 106.510000', '']);
  // urut Timestamp naik (jendela baca sync)
  for (const j of ['header', 'realisasi', 'eksekusi']) {
    const t = Array.from(a[j], (o) => new Date(o.Timestamp ?? o.TimeStamp).getTime());
    assert.deepStrictEqual(t, [...t].sort((x, y) => x - y), j);
  }
  const e = a.eksekusi.find((x) => x['Kode Eksekusi'] === 'R01-16130260915001-PNY.001-EKS.002');
  assert.deepStrictEqual([e['Jenis Pekerjaan'], e.Diameter, e.Section, e.foto_lengkap, e['Foto Sebelum URL'], e.sumber],
    ['Tebang Besar', 60, 'LBS Pergam', false, '', 'LANGSUNG']);
  assert.strictEqual(e['Kode Pekerjaan'], 'R01-16130260915001-PNY.001');
  const r1 = a.realisasi.find((x) => x['Kode Pekerjaan'] === 'R01-16130260915001-PNY.001');
  assert.deepStrictEqual([r1.Rabas, r1.Sedang, r1.Besar, r1.Section], [0, 0, 0, ''], 'hitungan diisi tahap C');
  assert.strictEqual(e.realisasi_id, r1.realisasi_id);
  // foto: 11 slot ber-URL dari 4 eksekusi lolos? hanya eksekusi lolos yang diantre
  assert.ok(a.foto.length >= 9 && a.foto.every((q) => q.status === 'ANTRE' && q.sumber_drive_id));
  assert.ok(a.peta.some((q) => q.jenis === 'header' && q.kode_lama === 'R01-16130260915002' && q.keterangan === 'DIGABUNG'));
  // deterministik: dijalankan ulang = ID & urutan sama
  const b = buat();
  assert.deepStrictEqual(b.eksekusi.map((o) => o.eksekusi_id), a.eksekusi.map((o) => o.eksekusi_id));
  assert.deepStrictEqual(b.foto.map((o) => o.foto_id), a.foto.map((o) => o.foto_id));
});

test('migrasi foto AppSheet: path dari URL getimageurl / kolom path, diantre dengan sumber_path', () => {
  const url = 'https://www.appsheet.com/image/getimageurl?appName=SiSi-22191477&tableName=db_ROW_Eksekusi&fileName=' +
    'AppSheet%20SiSi%20-%20ULP%20Toboali%2FEksekusi%20ROW%2F2026%2F10.%20Oktober%2F01%2FROW%2004%2F20f43145%2F20f43145.Foto%20Pekerjaan.025850.jpg' +
    '&appVersion=1.001226&signature=4bae46499a1a';
  assert.strictEqual(g.pathFotoLama_(url),
    'AppSheet SiSi - ULP Toboali/Eksekusi ROW/2026/10. Oktober/01/ROW 04/20f43145/20f43145.Foto Pekerjaan.025850.jpg');
  assert.strictEqual(g.pathFotoLama_('Eksekusi ROW/2026/x.Foto Sebelum.1.jpg'), 'Eksekusi ROW/2026/x.Foto Sebelum.1.jpg');
  assert.strictEqual(g.pathFotoLama_('https://example.com/foto.jpg'), null, 'URL lain tanpa fileName ditolak');
  assert.strictEqual(g.pathFotoLama_('../rahasia.jpg'), null);
  assert.strictEqual(g.pathFotoLama_('dokumen.pdf'), null);

  const { S, M, opsi } = sampelMigrasi();
  S.eksekusi[0]['Foto Sebelum URL'] = url;
  S.eksekusi[0]['Foto Pekerjaan URL'] = '';
  S.eksekusi[0]['Foto Pekerjaan'] = 'AppSheet SiSi - ULP Toboali/Eksekusi ROW/a/b.Foto Pekerjaan.1.jpg';   // kolom path
  const r = g.analisisMigrasi_(S, M, opsi);
  assert.strictEqual(r.foto.dariPath, 2);
  assert.strictEqual(r.foto.urlRusak, 0);
  const a = g.rencanaMigrasi_(r, { ulpNama: 'Toboali', sekarang: new Date() });
  const q = Array.from(a.foto).filter((x) => x.sumber_path);
  assert.strictEqual(q.length, 2);
  assert.ok(q.every((x) => x.sumber_drive_id === '' && x.status === 'ANTRE'));
});

test('migrasi dry-run: kolom sumber yang kurang dilaporkan', () => {
  const { S, M, opsi } = sampelMigrasi();
  S.kolom.eksekusi = S.kolom.eksekusi.filter((k) => k !== 'Diameter');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(g.analisisMigrasi_(S, M, opsi).kolomKurang)), { eksekusi: ['Diameter'] });
});

test('WA & realisasi: dipisah per penyulang lalu per section, section realisasi = daftar (tanpa rentang)', () => {
  const x = siapkanRow();
  const hId = U(), rId = U(), e1 = U(), e2 = U(), e3 = U();
  const eks = (id, n, sek, d, j) => x.op('eksekusi', 'buat', id, x.kodeH + '-PNY.001-EKS.00' + n, {
    realisasiId: rId, sectionId: sek, koordinatPekerjaan: '-3.0, 106.5', diameter: d, jenisId: j });
  x.sync([x.op('header', 'buat', hId, x.kodeH, { tanggal: x.hariIni, koordinatAwal: '-3.01, 106.51', koordinatAkhir: '-3.02, 106.52', kmAwal: 1, kmAkhir: 2 }),
          x.op('realisasi', 'buat', rId, x.kodeH + '-PNY.001', { headerId: hId, penyulang: 'TB-01' }),
          eks(e1, 1, x.sekC, 60, x.jBesar), eks(e2, 2, x.sekB, 30, x.jSedang), eks(e3, 3, x.sekB, 0, x.jRabas)]);
  const sk = x.skema.row_Eksekusi;
  for (let i = 1; i <= 3; i++) x.sheets.r.row_Eksekusi.data[i][sk.indexOf('foto_lengkap')] = true;   // anggap 3 foto sudah lengkap
  x.sync([x.op('eksekusi', 'ubah', e1, undefined, { nomorTiang: 'T1' }, 1)]);                    // memicu hitung ulang
  assert.strictEqual(kolom(x, 'row_Realisasi', 1, 'Section'), 'Kampung Baru, Rias', 'daftar section, urut db_Jaringan');
  const wa = kolom(x, 'row_Header', 1, 'WA Text');
  assert.ok(wa.includes([
    'Penyulang : *TB-01*',
    'Section : Kampung Baru',
    'Realisasi ROW',
    '1. Rabas / Pangkas : 1 Gawang',
    '2. Tebang Sedang kll>78,5cm <157cm : 1 Batang',
    '3. Tebang Besar >157cm : 0 Batang',
    '',
    'Section : Rias',
    'Realisasi ROW',
    '1. Rabas / Pangkas : 0 Gawang',
    '2. Tebang Sedang kll>78,5cm <157cm : 0 Batang',
    '3. Tebang Besar >157cm : 1 Batang',
  ].join('\n')), wa);
  assert.ok(!wa.includes('GH Toboali'), 'section tanpa pekerjaan tidak tampil');
  const lap = JSON.parse(JSON.stringify(x.g.getLaporanRow_(x.sesi, {}))).laporan[0];
  assert.deepStrictEqual(lap.penyulang[0].sections.map((s) => [s.section, s.rabas, s.sedang, s.besar]),
    [['Kampung Baru', 1, 1, 0], ['Rias', 0, 0, 1]]);
  assert.deepStrictEqual(lap.total, { rabas: 1, sedang: 1, besar: 1 });
});

// ---------- audit guard 4 Okt 2026 ----------
function konteksLogin(props = {}) {
  const gl = buatKonteks({ ...PROPS, PBKDF2_ITERASI: '1000', ...props });
  const log = [];
  const buat = sheetPalsu(log);
  const salt = Buffer.from('0123456789abcdef').toString('base64');
  const sheets = {
    m: {
      db_Users: buat('db_Users', [['user_id', 'username', 'nama', 'role', 'tim_id', 'aktif'], ['u1', '16130.uji.row01', 'ROW 01', 'PETUGAS', 't1', true]]),
      db_Tim: buat('db_Tim', [['tim_id', 'kode', 'nama', 'jenis', 'aktif'], ['t1', '01', 'ROW 01', 'ROW', true]]),
      db_Menu: buat('db_Menu', [['menu_kode', 'nama', 'platform', 'khusus_super', 'urutan', 'aktif'], ['ROW_EKSEKUSI', 'Eksekusi ROW', 'MOBILE', false, 1, true]]),
      db_Akses: buat('db_Akses', [['role', 'jenis_tim', 'menu_kode', 'aksi'], ['PETUGAS', 'ROW', 'ROW_EKSEKUSI', 'UBAH']]),
    },
    a: {
      auth_Password: buat('auth_Password', [['user_id', 'password_hash', 'salt', 'hash_versi', 'password_diubah_pada', 'gagal_login', 'terkunci_sampai'],
        ['u1', gl.hashPassword_('Rahasia-Toboali-2026', salt, 1000), salt, 'pbkdf2-sha256:1000', '', 0, '']]),
      auth_Perangkat: buat('auth_Perangkat', [['device_id', 'user_id', 'install_id', 'token_hash', 'platform', 'dibuat_pada', 'terakhir_dipakai', 'kedaluwarsa_pada', 'dicabut_pada']]),
      log_Audit: buat('log_Audit', [['waktu', 'user_id', 'username', 'role', 'aksi', 'target', 'detail', 'platform', 'device_id']]),
    },
  };
  gl.SpreadsheetApp = { openById: (id) => ({ getSheetByName: (n) => sheets[id][n] }) };
  gl.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  return { gl, log, sheets };
}

test('audit: login dibatasi lewat cache SEBELUM lock & baca sheet (per username + global)', () => {
  const { gl, log, sheets } = konteksLogin();
  let lock = 0;
  gl.LockService = { getScriptLock: () => ({ tryLock: () => { lock++; return true; }, releaseLock: () => {} }) };
  const salah = (u) => kodeError(() => gl.login_(null, { username: u, password: 'salah-salah-salah' }, 'MOBILE'));
  for (let i = 0; i < 10; i++) assert.match(salah('16130.uji.row01'), /LOGIN_GAGAL|AKUN_TERKUNCI/);
  const lockSebelum = lock; log.length = 0;
  assert.strictEqual(salah('16130.uji.row01'), 'LOGIN_DIBATASI');
  assert.strictEqual(lock, lockSebelum, 'tidak ambil lock');
  assert.strictEqual(log.length, 0, 'tidak baca/tulis sheet');
  // global: 30 gagal per menit dari banyak username
  for (let i = 0; i < 20; i++) salah('16130.tebak' + i);
  assert.strictEqual(salah('16130.lain'), 'LOGIN_DIBATASI');
  // log_Audit dibatasi: tidak lebih dari batas audit per menit
  const audit = sheets.a.log_Audit.data.length;
  if (audit !== null) assert.ok(audit - 1 <= 10, 'log_Audit tidak membanjir: ' + (audit - 1));
});

test('audit: login sukses menghapus hitungan gagal username itu', () => {
  const { gl } = konteksLogin();
  for (let i = 0; i < 3; i++) kodeError(() => gl.login_(null, { username: '16130.uji.row01', password: 'salah-salah-salah' }, 'MOBILE'));
  gl.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026' }, 'MOBILE');
  assert.strictEqual(gl.CacheService.getScriptCache().get(gl.kunciGagalUser_('16130.uji.row01')), null);
});

test('audit: ADMIN_bersihkanCache (SESI_EPOCH) membuat cache sesi lama diabaikan', () => {
  const { gl, log } = konteksLogin();
  const r = gl.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026' }, 'MOBILE');
  log.length = 0;
  gl.sesiDariToken_(r.token);
  assert.strictEqual(log.length, 0, 'cache dipakai');
  gl.ADMIN_bersihkanCache();
  gl.sesiDariToken_(r.token);
  assert.ok(log.some((x) => /auth_Perangkat/.test(x)), 'setelah epoch naik, auth_Perangkat dibaca ulang');
});

test('audit: ADMIN_cabutSesi mencabut token seketika (cache ikut dihapus)', () => {
  const { gl } = konteksLogin();
  const r = gl.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026' }, 'MOBILE');
  assert.ok(gl.sesiDariToken_(r.token));
  gl.PropertiesService.getScriptProperties().setProperty('CABUT_USERNAME', '16130.uji.row01');
  gl.ADMIN_cabutSesi();
  assert.strictEqual(kodeError(() => gl.sesiDariToken_(r.token)), 'SESI_DICABUT');
  assert.strictEqual(gl.PropertiesService.getScriptProperties().getProperty('CABUT_USERNAME'), null, 'property dihapus');
});

test('audit: production menolak PBKDF2_ITERASI < 5000', () => {
  const gp = buatKonteks({ ...PROPS, ENV: 'production', PBKDF2_ITERASI: '1000' });
  assert.strictEqual(kodeError(() => gp.cfg_()), 'CONFIG_TIDAK_VALID');
  assert.strictEqual(buatKonteks({ ...PROPS, ENV: 'production' }).cfg_().PBKDF2_ITERASI, 5000);
  assert.strictEqual(buatKonteks({ ...PROPS, PBKDF2_ITERASI: '1000' }).cfg_().PBKDF2_ITERASI, 1000, 'staging boleh');
});

// ---------- arsip per tanggal (v0.37) ----------
test('getArsipHariRow: header+realisasi+eksekusi+foto tanggal itu, tim sendiri, drive_file_id tidak bocor', () => {
  const ga = buatKonteks({ ...PROPS, ROW_SHEET_ID: 'r' });
  const tgl = ga.tglJakarta_(new Date(Date.now() - 20 * 864e5));
  const yy = tgl.slice(2, 4) + tgl.slice(5, 7) + tgl.slice(8, 10);
  const kh = 'R01-16130' + yy + '001', kp = kh + '-PNY.001', ke = kp + '-EKS.001';
  const khLain = 'R02-16130' + yy + '001';
  const [h1, h2, r1, e1, e2] = [U(), U(), U(), U(), U()];
  const [f1, f2, f3, f4] = [U(), U(), U(), U()];
  const data = {
    row_Header: [
      { header_id: h1, 'Kode Header': kh, tim_id: 't1', status: 'AKTIF', 'Sub-Tim': 'ROW 01', 'KM Awal': 10, 'WA Text': 'WA!' },
      { header_id: h2, 'Kode Header': khLain, tim_id: 't2', status: 'AKTIF' },
    ],
    row_Realisasi: [{ realisasi_id: r1, header_id: h1, 'Kode Pekerjaan': kp, Penyulang: 'TB-01', status: 'AKTIF', Sedang: 1 }],
    row_Eksekusi: [
      { eksekusi_id: e1, realisasi_id: r1, 'Kode Eksekusi': ke, status: 'AKTIF', Diameter: 30, 'Jenis Pekerjaan': 'Tebang Sedang', foto_lengkap: true },
      { eksekusi_id: e2, realisasi_id: r1, 'Kode Eksekusi': kp + '-EKS.002', status: 'BATAL' },
    ],
    row_Foto: [
      { foto_id: f1, eksekusi_id: e1, slot: 'SEBELUM', drive_file_id: 'DRV1', sha256: 'a', status: 'AKTIF', Timestamp: new Date('2026-01-01') },
      { foto_id: f2, eksekusi_id: e1, slot: 'SEBELUM', drive_file_id: 'DRV2', sha256: crypto.createHash('sha256').update('foto-uji').digest('hex'), status: 'AKTIF', Timestamp: new Date('2026-01-02') },
      { foto_id: f3, eksekusi_id: e1, slot: 'SESUDAH', drive_file_id: 'DRV3', status: 'BATAL' },
      { foto_id: f4, eksekusi_id: e1, slot: 'PEKERJAAN', drive_file_id: 'DRV4', status: 'AKTIF' },
    ],
  };
  ga.tabel_ = (_p, nama) => ({ rows: data[nama] });
  const sesi = { userId: 'u1', role: 'PETUGAS', jenisTim: 'ROW', timId: 't1', _tokenHash: 'a'.repeat(64) };
  const hasil = JSON.parse(JSON.stringify(ga.getArsipHariRow_(sesi, { tanggal: tgl })));
  assert.strictEqual(hasil.laporan.length, 1, 'header tim lain tidak ikut');
  const l = hasil.laporan[0];
  assert.strictEqual(l.kodeHeader, kh);
  assert.strictEqual(l.waText, 'WA!');
  assert.strictEqual(l.realisasi[0].eksekusi.length, 1, 'eksekusi BATAL tidak ikut');
  const foto = l.realisasi[0].eksekusi[0].foto;
  assert.deepStrictEqual(foto.map((f) => f.slot), ['SEBELUM', 'PEKERJAAN'], 'urut slot, foto BATAL tidak ikut');
  assert.strictEqual(foto[0].fotoId, f2, 'foto terbaru per slot');
  assert.ok(!JSON.stringify(hasil).includes('DRV'), 'drive_file_id tidak dikirim');

  assert.throws(() => ga.getArsipHariRow_(sesi, { tanggal: ga.tglJakarta_(new Date()) }), /TANGGAL_DI_LUAR_BATAS/, 'PETUGAS: hari H ditolak');
  const admHari = { userId: 'a', role: 'ADMIN', _tokenHash: 'e'.repeat(64) };
  assert.ok(ga.getArsipHariRow_(admHari, { tanggal: ga.tglJakarta_(new Date()) }), 'v0.50: admin boleh hari ini');
  assert.throws(() => ga.getArsipHariRow_(admHari, { tanggal: ga.tglJakarta_(new Date(Date.now() + 2 * 864e5)) }), /TANGGAL_DI_LUAR_BATAS/, 'masa depan ditolak');
  assert.throws(() => ga.getArsipHariRow_(sesi, { tanggal: tgl, timId: '22222222-2222-4222-8222-222222222222' }), /AKSES_DITOLAK/);
  assert.throws(() => ga.getArsipHariRow_({ ...sesi, jenisTim: 'YANDAL' }, { tanggal: tgl }), /AKSES_DITOLAK/);

  // foto: hanya yang sudah lolos di sesi yang sama
  const bytes = Buffer.from('foto-uji');
  let mimeUji = 'image/jpeg', isiUji = bytes;
  ga.DriveApp = { getFileById: (id) => { assert.strictEqual(id, 'DRV2'); return { getMimeType: () => mimeUji, getBlob: () => ({ getBytes: () => Array.from(isiUji) }) }; } };
  const f = ga.getFotoArsipRow_(sesi, { fotoId: f2 });
  assert.strictEqual(Buffer.from(f.data, 'base64').toString(), 'foto-uji');
  assert.strictEqual(f.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.throws(() => ga.getFotoArsipRow_({ ...sesi, _tokenHash: 'b'.repeat(64) }, { fotoId: f2 }), /ARSIP_FOTO_KEDALUWARSA/, 'sesi lain ditolak');
  // v0.47: file wajib gambar + sha256 sama dengan baris row_Foto
  mimeUji = 'application/pdf';
  assert.throws(() => ga.getFotoArsipRow_(sesi, { fotoId: f2 }), /FOTO_TIDAK_VALID/, 'bukan gambar ditolak');
  mimeUji = 'image/jpeg'; isiUji = Buffer.from('file-lain');
  assert.throws(() => ga.getFotoArsipRow_(sesi, { fotoId: f2 }), /FOTO_TIDAK_VALID/, 'sha256 beda ditolak');
  isiUji = bytes;
  ga.CacheService.getScriptCache().put(ga.kunciArsipFoto_(sesi, f2), 'DRV2');
  assert.throws(() => ga.getFotoArsipRow_(sesi, { fotoId: f2 }), /ARSIP_FOTO_KEDALUWARSA/, 'izin format lama = minta detail ulang');
  assert.throws(() => ga.getFotoArsipRow_(sesi, { fotoId: f3 }), /ARSIP_FOTO_KEDALUWARSA/, 'foto BATAL tidak pernah diizinkan');

  // admin: semua tim
  const adm = JSON.parse(JSON.stringify(ga.getArsipHariRow_({ userId: 'a', role: 'ADMIN', _tokenHash: 'c'.repeat(64) }, { tanggal: tgl })));
  assert.strictEqual(adm.laporan.length, 2);
});

test('login: gpsPalsu = ditolak GPS_PALSU sebelum password dicek, dicatat di log_Audit', () => {
  const { gl, sheets } = konteksLogin();
  const auditAwal = sheets.a.log_Audit.data.length;
  assert.strictEqual(kodeError(() => gl.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026', gpsPalsu: true }, 'MOBILE')), 'GPS_PALSU');
  const baris = sheets.a.log_Audit.data.slice(auditAwal);
  assert.strictEqual(baris.length, 1);
  assert.ok(baris[0].includes('LOGIN_GPS_PALSU'));
  assert.strictEqual(sheets.a.auth_Perangkat.data.length, 1, 'tidak ada token dibuat');
  assert.ok(gl.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026', gpsPalsu: false }, 'MOBILE').token);
  assert.strictEqual(kodeError(() => gl.login_(null, { username: '16130.uji.row01', password: 'x', gpsPalsu: 'ya' }, 'MOBILE')), 'TIPE_SALAH');
});

test('logout alasan GPS_PALSU: token dicabut seketika + LOGOUT_GPS_PALSU di log_Audit', () => {
  const { gl, sheets } = konteksLogin();
  const r = gl.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026' }, 'MOBILE');
  const sesi = gl.sesiDariToken_(r.token);
  gl.logout_(sesi, { alasan: 'GPS_PALSU' }, 'MOBILE');
  assert.strictEqual(kodeError(() => gl.sesiDariToken_(r.token)), 'SESI_DICABUT');
  assert.ok(sheets.a.log_Audit.data.some((b) => b.includes('LOGOUT_GPS_PALSU')));
  const r2 = gl.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026' }, 'MOBILE');
  assert.strictEqual(kodeError(() => gl.logout_(gl.sesiDariToken_(r2.token), { alasan: 'LAIN' }, 'MOBILE')), 'PILIHAN_TIDAK_VALID');
});

test('audit v0.42: rem frekuensi per sesi di guard_ (umum + endpoint berat)', () => {
  const gr = buatKonteks(PROPS);
  gr.sesiDariToken_ = () => ({ userId: 'u', role: 'PETUGAS', jenisTim: 'ROW', timId: 't1', _tokenHash: 'c'.repeat(64) });
  gr.aturanAkses_ = () => ({ menu: { ROW_LAPORAN: { kode: 'ROW_LAPORAN', platform: 'KEDUANYA', aktif: true } },
    akses: [{ role: 'PETUGAS', jenisTim: 'ROW', menu: 'ROW_LAPORAN', aksi: 'LIHAT' }] });
  const ep = gr.endpoints_();
  // semua endpoint bersesi lewat guard_ (rem umum); endpoint berat punya batas sendiri
  for (const k of ['getArsipRow', 'getArsipHariRow', 'getFotoArsipRow', 'syncRow', 'uploadFotoRow', 'getFotoRow']) assert.ok(ep[k].batasMenit > 0, k + ' wajib punya batasMenit');
  for (let i = 0; i < 10; i++) assert.strictEqual(kodeError(() => gr.guard_('x', ep.getArsipHariRow, 'MOBILE', 'getArsipHariRow')), null);
  assert.strictEqual(kodeError(() => gr.guard_('x', ep.getArsipHariRow, 'MOBILE', 'getArsipHariRow')), 'TERLALU_SERING');
  // endpoint lain belum kena batas endpoint, tapi rem umum tetap jalan
  let kena = null;
  for (let i = 0; i < 100 && !kena; i++) kena = kodeError(() => gr.guard_('x', ep.cekSesi, 'MOBILE', 'cekSesi'));
  assert.strictEqual(kena, 'TERLALU_SERING');
  // sesi lain tidak terpengaruh
  gr.sesiDariToken_ = () => ({ userId: 'u2', role: 'PETUGAS', jenisTim: 'ROW', timId: 't1', _tokenHash: 'd'.repeat(64) });
  assert.strictEqual(kodeError(() => gr.guard_('x', ep.cekSesi, 'MOBILE', 'cekSesi')), null);
});

// ---------- audit guard v0.47 ----------
test('audit v0.47: token ditolak diingat, rem global token gagal, tidak baca sheet lagi', () => {
  const gt = buatKonteks(PROPS);
  let baca = 0;
  gt.tabel_ = (_p, nama) => { if (nama === 'auth_Perangkat') baca++; return { rows: [] }; };
  const tok = 'a'.repeat(64);
  assert.strictEqual(kodeError(() => gt.sesiDariToken_(tok)), 'SESI_TIDAK_VALID');
  assert.strictEqual(kodeError(() => gt.sesiDariToken_(tok)), 'SESI_TIDAK_VALID');
  assert.strictEqual(baca, 1, 'token yang sama tidak membaca auth_Perangkat 2x');
  for (let i = 1; i < 60; i++) kodeError(() => gt.sesiDariToken_(i.toString(16).padStart(64, '0')));
  assert.strictEqual(baca, 60);
  assert.strictEqual(kodeError(() => gt.sesiDariToken_('f'.repeat(64))), 'TERLALU_SERING', 'lewat 60 token gagal/menit = ditahan');
  assert.strictEqual(baca, 60, 'tanpa baca sheet saat ditahan');
});

test('audit v0.47: payload maks 4 MB sebelum JSON.parse', () => {
  const gp = buatKonteks(PROPS);
  gp.ContentService = { MimeType: { JSON: 'j' }, createTextOutput: (t) => ({ setMimeType: () => t }) };
  const besar = JSON.parse(gp.doPost({ postData: { contents: 'x'.repeat(4 * 1024 * 1024 + 1) } }));
  assert.strictEqual(besar.kode, 'PAYLOAD_TERLALU_BESAR');
  const kecil = JSON.parse(gp.doPost({ postData: { contents: '{"action":"ping"}' } }));
  assert.strictEqual(kecil.ok, true);
});

test('audit v0.47: teks dibersihkan (karakter kontrol, satu baris), kendala maks 5 baris, WA kendala satu baris', () => {
  assert.strictEqual(g.validasi_({ t: ' T\n12\tA ' }, { t: { tipe: 'teks' } }).t, 'T 12 A', 'satu baris');
  assert.strictEqual(g.validasi_({ k: 'a\r\n\r\n b \u0007\nc' }, { k: { tipe: 'teks', multiBaris: true } }).k, 'a\nb\nc', 'multi baris rapi');
  assert.strictEqual(kodeError(() => g.validasi_({ k: '1\n2\n3\n4\n5\n6' }, { k: { tipe: 'teks', multiBaris: true, maksBaris: 5 } })), 'TERLALU_BANYAK_BARIS');
  assert.strictEqual(g.validasi_({ p: ' pw\n ' }, { p: { tipe: 'teks', mentah: true } }).p, ' pw\n ', 'password tidak disentuh');
  assert.strictEqual(g.kendalaWa_('Hujan\nTotal Bulanan Rabas / Pangkas : 999'), 'Hujan; Total Bulanan Rabas / Pangkas : 999', 'tidak bisa meniru baris sendiri');
  assert.strictEqual(g.kendalaWa_(''), '-');
  assert.strictEqual(g.ISI_ROW_.header.buat.kendala.multiBaris, true);
  assert.ok(!g.ISI_ROW_.eksekusi.buat.nomorTiang.multiBaris, 'nomor tiang satu baris');
});

// ---------- audit v0.48 ----------
test('audit v0.48: rem global tidak mengunci username terdaftar; terkunci = LOGIN_GAGAL; ADMIN_bukaKunciLogin', () => {
  const { gl, sheets } = konteksLogin();
  const coba = (u, p = 'salah-salah-salah') => kodeError(() => gl.login_(null, { username: u, password: p }, 'MOBILE'));
  for (let i = 0; i < 35; i++) coba('16130.spam' + i);
  assert.strictEqual(coba('16130.tak.ada'), 'LOGIN_DIBATASI', 'username asing tetap direm global');
  const ok = gl.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026' }, 'MOBILE');
  assert.ok(ok.token, 'petugas asli tetap bisa login saat spam');
  // 5x salah = terkunci, tapi jawabannya tetap LOGIN_GAGAL (tidak bocor username ada)
  for (let i = 0; i < 5; i++) assert.strictEqual(coba('16130.uji.row01'), 'LOGIN_GAGAL');
  assert.strictEqual(coba('16130.uji.row01', 'Rahasia-Toboali-2026'), 'LOGIN_GAGAL', 'terkunci: password benar pun ditolak, kode sama');
  gl.PropertiesService.getScriptProperties().setProperty('BUKA_USERNAME', '16130.uji.row01');
  gl.ADMIN_bukaKunciLogin();
  assert.strictEqual(gl.PropertiesService.getScriptProperties().getProperty('BUKA_USERNAME'), null, 'property dihapus');
  assert.ok(gl.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026' }, 'MOBILE').token, 'bisa login lagi');
  assert.ok(sheets.a.log_Audit.data.some((r) => r.includes('BUKA_KUNCI_LOGIN')));
});

test('audit v0.48: token punya umur mutlak 90 hari (cekSesi tidak memperpanjang lewat batas)', () => {
  const { gl, sheets } = konteksLogin();
  const r = gl.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026' }, 'MOBILE');
  const P = sheets.a.auth_Perangkat.data, h = P[0];
  const baris = P[P.length - 1];
  // cekSesi: kedaluwarsa tidak melewati dibuat + 90 hari
  baris[h.indexOf('dibuat_pada')] = new Date(Date.now() - 80 * 864e5).toISOString();
  gl.cekSesi_(gl.sesiDariToken_(r.token), {}, 'MOBILE');
  const exp = new Date(baris[h.indexOf('kedaluwarsa_pada')]).getTime();
  assert.ok(exp <= Date.now() + 10 * 864e5 + 5000, 'perpanjangan dipotong di batas mutlak');
  // lewat 90 hari: ditolak walau kedaluwarsa_pada masih jauh
  baris[h.indexOf('dibuat_pada')] = new Date(Date.now() - 91 * 864e5).toISOString();
  baris[h.indexOf('kedaluwarsa_pada')] = new Date(Date.now() + 20 * 864e5).toISOString();
  gl.ADMIN_bersihkanCache();
  assert.strictEqual(kodeError(() => gl.sesiDariToken_(r.token)), 'SESI_KEDALUWARSA');
});

// ---------- v0.51 / v0.52: Laporan UP3 / UIW ----------
function siapkanUp3() {
  const x = siapkanRow({ propsTambahan: { LAPORAN_SHEET_ID: 'l' } });
  const buat = sheetPalsu(x.log);
  const lap = x.g.skemaHeader_().LAPORAN_SHEET_ID;
  x.sheets.l = {};
  for (const n of Object.keys(lap)) x.sheets.l[n] = buat(n, [lap[n].slice()]);
  x.timA = x.sesi.timId; x.timB = U(); x.timC = U();
  x.sheets.m.db_Tim = buat('db_Tim', [['tim_id', 'jenis', 'nama', 'kode', 'aktif'],
    [x.timA, 'ROW', 'ROW 01', '01', true], [x.timB, 'ROW', 'ROW 02', '02', true], [x.timC, 'ROW', 'ROW 03', '03', true],
    [U(), 'YANDAL', 'YANDAL 01', '01', true]]);
  x.sekD = U();
  x.sheets.m.db_Jaringan.data.push([x.sekD, 'TB-02', 'Serdang', '', 20, true], [U(), 'TB-09', 'Lama', '', 20, false]);
  x.g.aturanAkses_ = () => ({
    menu: { OPS_LAP_UP3: { kode: 'OPS_LAP_UP3', platform: 'MOBILE', aktif: true }, OPS_LAP_UIW: { kode: 'OPS_LAP_UIW', platform: 'MOBILE', aktif: true } },
    akses: [{ role: 'ADMIN', jenisTim: '*', menu: '*', aksi: 'UBAH' }, { role: 'ADMIN_ES', jenisTim: '*', menu: 'OPS_LAP_UP3', aksi: 'LIHAT' },
      { role: 'ADMIN_ES', jenisTim: '*', menu: 'OPS_LAP_UIW', aksi: 'LIHAT' }],
  });
  x.admin = { userId: U(), username: '16130.uji.admin', nama: 'Admin Uji', role: 'ADMIN', timId: '', jenisTim: '' };
  x.es = { ...x.admin, userId: U(), role: 'ADMIN_ES' };
  x.lapSkema = lap;
  x.lapKolom = (nama, baris, k) => x.sheets.l[nama].data[baris][lap[nama].indexOf(k)];
  // ROW 01: TB-01 Kampung Baru (1 sedang + 1 besar foto lengkap), ROW 02: header tanpa hitungan
  const hId = U(), rId = U(), e1 = U(), e2 = U();
  x.sync([x.op('header', 'buat', hId, x.kodeH, { tanggal: x.hariIni }),
    x.op('realisasi', 'buat', rId, x.kodeH + '-PNY.001', { headerId: hId, penyulang: 'TB-01' }),
    x.op('eksekusi', 'buat', e1, x.kodeH + '-PNY.001-EKS.001', { realisasiId: rId, sectionId: x.sekB, koordinatPekerjaan: '-3.0, 106.5', diameter: 30, jenisId: x.jSedang }),
    x.op('eksekusi', 'buat', e2, x.kodeH + '-PNY.001-EKS.002', { realisasiId: rId, sectionId: x.sekB, koordinatPekerjaan: '-3.0, 106.5', diameter: 60, jenisId: x.jBesar })]);
  const sk = x.skema.row_Eksekusi;
  x.sheets.r.row_Eksekusi.data.slice(1).forEach((b) => { b[sk.indexOf('foto_lengkap')] = true; });
  x.sync([x.op('eksekusi', 'ubah', e1, undefined, { nomorTiang: 'T1' }, 1)]);
  const lain = { ...x.sesi, userId: U(), timId: x.timB, timNama: 'ROW 02', timKode: '02' };
  x.sync([x.op('header', 'buat', U(), x.g.kodeHeaderRow_('02', '16130', x.hariIni, 1), { tanggal: x.hariIni })], lain);
  const j = (v) => JSON.parse(JSON.stringify(v));
  x.getUp3 = (s, data = {}) => j(x.g.getLaporanUp3_(s, data));
  x.getUiw = (s, data = {}) => j(x.g.getLaporanUiw_(s, data));
  x.simpanUp3 = (s, data) => j(x.g.simpanLaporanUp3_(s, data, 'MOBILE'));
  x.simpanUiw = (s, data) => j(x.g.simpanLaporanUiw_(s, data, 'MOBILE'));
  return x;
}

test('skema SiSi_Laporan v0.55: harian UP3 & UIW terpisah, masing-masing induk C4A-nya, tanpa kolom ganda', () => {
  const lap = g.skemaHeader_().LAPORAN_SHEET_ID;
  assert.deepStrictEqual(Object.keys(lap), ['lap_Harian_UP3', 'lap_Harian_UIW', 'lap_C4A_UP3', 'lap_C4A_UIW']);
  const jumlah = { lap_Harian_UP3: 13, lap_Harian_UIW: 15, lap_C4A_UP3: 17, lap_C4A_UIW: 20 };
  for (const [n, k] of Object.entries(jumlah)) {
    assert.strictEqual(lap[n].length, k, n);
    assert.strictEqual(new Set(lap[n]).size, k, n + ' kolom ganda');
    for (const t of ['lap_id', 'status', 'revision', 'dibuat_oleh', 'diubah_oleh']) assert.ok(lap[n].includes(t), n + ' ' + t);
  }
  assert.ok(!lap.lap_Harian_UP3.includes('Cuaca') && !lap.lap_Harian_UP3.includes('Laporan UIW'));
  assert.ok(lap.lap_Harian_UIW.includes('Cuaca') && lap.lap_Harian_UIW.includes('Tim ROW') && !lap.lap_Harian_UIW.includes('Laporan UP3'));
});

test('UP3/UIW teks dari modul ROW: target dibagi, 0 = "- satuan", modul lain "-", C4A UP3 per penyulang, UIW per section', () => {
  assert.deepStrictEqual([...g.bagiTarget_(20, 3)], [7, 7, 6]);
  assert.deepStrictEqual([...g.bagiTarget_(6, 4)], [2, 2, 1, 1]);
  assert.deepStrictEqual([...g.bagiTarget_(20, 0)], []);
  assert.deepStrictEqual([4.6, 4, 4.355, 0].map((v) => g.angkaKoma_(v)), ['4,6', '4', '4,36', '0']);
  const row = { perPenyulang: { 'TB-02': { rabas: 0, tebang: 3 }, 'TB-01': { rabas: 12, tebang: 0 } }, komulatif: { rabas: 40, tebang: 9 },
    tim: [{ nama: 'ROW 01', kode: '01', penyulang: [{ penyulang: 'TB-01', section: 'GH Toboali, Rias', rabas: 12, tebang: 0 }] }],
    target: { rabas: 20, tebang: 6 } };
  const c4aUiw = [
    { penyulang: 'TB-01', section: 'GH Toboali', jumlahTiang: 40, temuanPeralatan: 1, temuanRow: 2, eksekusi: 1 },
    { penyulang: 'TB-01', section: 'Rias', jumlahTiang: 47, temuanPeralatan: 0, temuanRow: 1, eksekusi: 0 },
  ];
  const c4aUp3 = [{ penyulang: 'TB-01', realisasiKms: 4.6, temuan: 'Pohon sentuh JTM 3 titik', tindakLanjut: 'Rabas', eksekusi: 'Tim ROW 01', keterangan: 'tidak ke WA' },
    { penyulang: 'TB-02', realisasiKms: 2, temuan: '', tindakLanjut: '', eksekusi: '' }];
  const up3 = g.laporanUp3_(row, '2026-10-05', c4aUp3);
  assert.ok(up3.startsWith('*Laporan Harian Keandalan Distribusi*\nHari Senin, 5 Oktober 2026\n\nULP Toboali'), up3);
  assert.ok(up3.includes('- Penyulang TB-01\nTarget / Realisasi\n- Rabas : 10 Gawang / 12 Gawang\n- Tebang : 3 Batang / - Batang'));
  assert.ok(up3.includes('- Penyulang TB-02\nTarget / Realisasi\n- Rabas : 10 Gawang / - Gawang\n- Tebang : 3 Batang / 3 Batang'));
  assert.ok(up3.includes('*Komulatif*\n- Rabas : 40 Gawang\n- Tebang : 9 Batang'));
  assert.ok(up3.includes('*A. GANGGUAN PENYULANG* \u26A1\n\n- PMT : - Kali\n- Section : - kali\n\n*Komulatif*\n- PMT : - kali\n- Section : - kali'));
  assert.ok(up3.includes('*C. Hartek* \uD83D\uDD27\n\nTarget / Realisasi\n- Gardu : - Unit / - Unit\n- Jaringan : - Gawang / - Gawang\n\n*Komulatif*\n- Gardu : - Unit\n- Jaringan : - Gawang'));
  assert.ok(up3.includes('*D. Inspeksi* \uD83D\uDD2D\n\nTarget / Realisasi\n- Gardu : - Unit / - Unit'));
  assert.ok(up3.includes('*F. P0 Yantek*\nRealisasi - Titik') && up3.includes('*G. Tindak Lanjut*\n-\n'), 'modul lain = "-"');
  assert.ok(up3.includes('*E. C4A* \uD83E\uDE7A\nPenyulang TB-01\n- Realisasi : 4,6 kmS\n- Temuan : Pohon sentuh JTM 3 titik\n- Tindak Lanjut : Rabas\n- Eksekusi : Tim ROW 01\n\nPenyulang TB-02\n- Realisasi : 2 kmS\n- Temuan : -\n- Tindak Lanjut : -\n- Eksekusi : -\n\n*F. P0'), up3);
  assert.ok(!up3.includes('tidak ke WA') && !up3.includes('4,35'), 'C4A UP3 tidak memakai data UIW / keterangan');
  assert.ok(up3.endsWith('#Jaringan Andal#\n#Gaspol#'));
  const uiw = g.laporanUiw_(row, '2026-10-05', c4aUiw, 'Cerah');
  assert.ok(uiw.startsWith('*ULP TOBOALI*\n\n\uD83D\uDCC5 Hari / Tanggal : Senin, 5 Oktober 2026\n\uD83D\uDC77 Tim ROW : 1 Tim\n\uD83D\uDC77 Tim Hartek : - Tim'), uiw);
  assert.ok(uiw.includes('Cuaca : Cerah'));
  assert.ok(uiw.includes('Penyulang : TB-01\nSection : GH Toboali, Rias\nPanjang : 4,35kmS'));
  assert.ok(uiw.includes('Peralatan : 1 Titik\nROW : 3 Titik'));
  assert.ok(uiw.includes('\uD83D\uDD39 TIM ROW 01\n- Penyulang : TB-01\n- Section : GH Toboali, Rias\n- Realisasi\n> Rabas : 12 Gawang\n> Tebang : 0 Batang'));
  assert.ok(uiw.includes('\u26A1 REALISASI PEKERJAAN HARTEK\nPenyulang : -\nSection : -') && uiw.includes('\uD83D\uDD27 PEKERJAAN JARINGAN\nPekerjaan : -\nMaterial : -'));
  assert.ok(uiw.endsWith('Demikian laporan disampaikan. Terima kasih. \u26A1'));
  const kosong = { perPenyulang: {}, komulatif: { rabas: 0, tebang: 0 }, tim: [], target: { rabas: 20, tebang: 6 } };
  const up3k = g.laporanUp3_(kosong, '2026-10-05', []), uiwk = g.laporanUiw_(kosong, '2026-10-05', [], '');
  assert.ok(up3k.includes('*B. ROW* \uD83C\uDF34\n\nTarget / Realisasi\n- Rabas : - Gawang / - Gawang'));
  assert.ok(up3k.includes('*E. C4A* \uD83E\uDE7A\n- Nihil'));
  assert.ok(uiwk.includes('Cuaca : -') && uiwk.includes('Tim ROW : 0 Tim') && uiwk.includes('\uD83D\uDD39 TIM ROW\n- Penyulang : -'));
});

test('get Laporan UP3 / UIW: endpoint terpisah, ROW v2 (foto lengkap), status tim, revision sendiri, PETUGAS ditolak', () => {
  const x = siapkanUp3();
  const u = x.getUp3(x.admin), w = x.getUiw(x.admin);
  assert.deepStrictEqual([u.bagian, w.bagian, u.sumber, u.bisaUbah, w.bisaUbah], ['UP3', 'UIW', 'LANGSUNG', true, true]);
  assert.deepStrictEqual([u.laporan, u.revision, w.laporan, w.revision, u.c4a, w.c4a], [null, 0, null, 0, [], []], 'belum pernah disimpan');
  assert.ok(!('cuaca' in u) && w.cuaca === '', 'cuaca hanya Laporan UIW');
  assert.ok(!('waUiw' in u) && !('waUp3' in w), 'tiap endpoint hanya teks laporannya');
  assert.deepStrictEqual(u.row.penyulang, [{ penyulang: 'TB-01', rabas: 0, tebang: 2, targetRabas: 20, targetTebang: 6 }]);
  assert.deepStrictEqual(u.row.komulatif, { rabas: 0, tebang: 2 });
  assert.deepStrictEqual(u.statusTim.map((t) => t.nama + ':' + t.status), ['ROW 01:LAPOR', 'ROW 02:LAPOR', 'ROW 03:BELUM'], 'hanya tim ROW');
  assert.ok(u.waText.includes('- Penyulang TB-01\nTarget / Realisasi\n- Rabas : 20 Gawang / - Gawang\n- Tebang : 6 Batang / 2 Batang'), u.waText);
  assert.ok(w.waText.includes('Tim ROW : 1 Tim'), 'ROW 02 tanpa hitungan tidak masuk');
  assert.ok(w.waText.includes('TIM ROW 01\n- Penyulang : TB-01\n- Section : Kampung Baru'));
  assert.strictEqual(x.getUp3(x.es).bisaUbah, false, 'ADMIN_ES hanya lihat');
  // akses per menu: ADMIN_ES hanya diberi UIW = UP3 tetap terbaca (guard di router), tapi bisaUbah ikut menu masing-masing
  x.g.aturanAkses_ = () => ({ menu: { OPS_LAP_UP3: { kode: 'OPS_LAP_UP3', platform: 'MOBILE', aktif: true }, OPS_LAP_UIW: { kode: 'OPS_LAP_UIW', platform: 'MOBILE', aktif: true } },
    akses: [{ role: 'ADMIN', jenisTim: '*', menu: 'OPS_LAP_UIW', aksi: 'UBAH' }, { role: 'ADMIN', jenisTim: '*', menu: 'OPS_LAP_UP3', aksi: 'LIHAT' }] });
  assert.deepStrictEqual([x.getUp3(x.admin).bisaUbah, x.getUiw(x.admin).bisaUbah], [false, true], 'bisaUbah per menu');
  assert.throws(() => x.getUp3(x.sesi), /AKSES_DITOLAK/);
  assert.throws(() => x.getUiw(x.sesi), /AKSES_DITOLAK/);
  assert.throws(() => x.getUp3(x.admin, { tanggal: x.hariIni, lain: 1 }), /FIELD_TIDAK_DIKENAL/);
  const besok = x.g.tglJakarta_(new Date(Date.now() + 864e5));
  assert.throws(() => x.getUiw(x.admin, { tanggal: besok }), /TANGGAL_DI_LUAR_BATAS/);
});

test('simpanLaporanUp3: hanya lap_Harian_UP3 + lap_C4A_UP3, per penyulang, teks, BATAL, dikunci, revision', () => {
  const x = siapkanUp3();
  const a = U(), b = U();
  const item = (id, penyulang, kms, extra = {}) => ({ id, penyulang, realisasiKms: kms, temuan: 'Layangan di JTM', tindakLanjut: 'Dilepas', eksekusi: 'Yantek', ...extra });
  const T = 'lap_C4A_UP3', H = 'lap_Harian_UP3';
  const up3 = (c4a, revision = x.getUp3(x.admin).revision, extra = {}) => x.simpanUp3(x.admin, { tanggal: x.hariIni, revision, c4a, ...extra });
  assert.throws(() => x.simpanUp3(x.es, { tanggal: x.hariIni, revision: 0, c4a: [] }), /AKSES_DITOLAK/);
  assert.throws(() => x.simpanUp3(x.sesi, { tanggal: x.hariIni, revision: 0, c4a: [] }), /AKSES_DITOLAK/);
  const kemarin = x.g.tglJakarta_(new Date(Date.now() - 864e5));
  assert.throws(() => x.simpanUp3(x.admin, { tanggal: kemarin, revision: 0, c4a: [] }), /HANYA_HARI_INI/);
  assert.throws(() => up3([], 0, { cuaca: 'Cerah' }), /FIELD_TIDAK_DIKENAL/, 'cuaca milik Laporan UIW');
  assert.throws(() => up3([], 0, { bagian: 'UP3' }), /FIELD_TIDAK_DIKENAL/, 'bentuk v0.55 ditolak');
  assert.throws(() => up3([], 0, { c4aUp3: [] }), /FIELD_TIDAK_DIKENAL/);
  assert.throws(() => up3([item(a, 'TB-01', 1), item(b, 'tb-01', 2)]), /PENYULANG_GANDA/);
  assert.throws(() => up3([item(a, 'TB-99', 1)]), /PENYULANG_TIDAK_ADA/);
  assert.throws(() => up3([item(a, 'TB-09', 1)]), /PENYULANG_TIDAK_ADA/, 'penyulang nonaktif');
  assert.throws(() => up3([item(a, 'TB-01', -1)]), /DI_LUAR_RENTANG/);
  assert.throws(() => up3([item(a, 'TB-01', 1, { temuan: 3 })]), /TIPE_SALAH/, 'temuan teks');
  assert.throws(() => up3([item(a, 'TB-01', 1, { eksekusi: 'x'.repeat(101) })]), /TERLALU_PANJANG/);
  assert.throws(() => up3([{ id: a, sectionId: x.sekA, jumlahTiang: 4 }]), /FIELD_TIDAK_DIKENAL|FIELD_WAJIB/, 'isian UIW ke UP3 ditolak');
  assert.throws(() => up3(Array.from({ length: 21 }, () => item(U(), 'TB-01', 1))), /TERLALU_BANYAK/);
  for (const n of Object.keys(x.sheets.l)) assert.strictEqual(x.sheets.l[n].data.length, 1, 'yang ditolak tidak menulis ' + n);

  const s1 = up3([item(a, ' tb-01 ', 4.567), item(b, 'TB-02', 2, { keterangan: '=HYPERLINK("x")' })], 0);
  assert.deepStrictEqual([s1.revision, s1.laporan.revision], [1, 1]);
  assert.deepStrictEqual(s1.c4a.map((c) => c.penyulang + ':' + c.realisasiKms), ['TB-01:4.57', 'TB-02:2']);
  assert.ok(s1.waText.includes('Penyulang TB-01\n- Realisasi : 4,57 kmS\n- Temuan : Layangan di JTM\n- Tindak Lanjut : Dilepas\n- Eksekusi : Yantek'), s1.waText);
  assert.strictEqual(x.lapKolom(H, 1, 'Laporan UP3'), s1.waText, 'salinan teks UP3');
  assert.strictEqual(x.lapKolom(H, 1, 'Input Oleh'), 'Admin Uji');
  assert.strictEqual(x.lapKolom(T, 1, 'lap_id'), x.lapKolom(H, 1, 'lap_id'), 'induk = lap_Harian_UP3');
  assert.strictEqual(x.sheets.l.lap_Harian_UIW.data.length, 1, 'harian UIW tidak tersentuh');
  assert.strictEqual(x.sheets.l.lap_C4A_UIW.data.length, 1, 'C4A UIW tidak tersentuh');
  assert.strictEqual(x.lapKolom(T, 1, 'Penyulang'), 'TB-01', 'nama resmi master');
  assert.strictEqual(x.lapKolom(T, 1, 'Realisasi kmS'), 4.57);
  assert.strictEqual(x.lapKolom(T, 1, 'Tindak Lanjut'), 'Dilepas');
  assert.strictEqual(x.lapKolom(T, 2, 'Keterangan'), '=HYPERLINK("x")', 'tersimpan sebagai teks');
  assert.ok(x.log.includes('TULIS:log_Audit'));

  assert.throws(() => up3([], 0), /KONFLIK_REVISION/, 'HP lain masih memegang revision lama');
  const s2 = up3([item(a, 'TB-01', 3.1, { temuan: 'Isolator retak\n1 titik', eksekusi: '' })], 1);
  assert.strictEqual(s2.revision, 2);
  assert.ok(s2.waText.includes('- Temuan : Isolator retak 1 titik\n- Tindak Lanjut : Dilepas\n- Eksekusi : -'), 'teks satu baris, kosong = -');
  assert.strictEqual(x.sheets.l[H].data.length, 2, 'satu baris per tanggal');
  assert.strictEqual(x.lapKolom(T, 2, 'status'), 'BATAL', 'tidak dihapus');
  assert.deepStrictEqual([x.lapKolom(T, 1, 'Realisasi kmS'), x.lapKolom(T, 1, 'Temuan'), x.lapKolom(T, 1, 'Eksekusi'), x.lapKolom(T, 1, 'revision')],
    [3.1, 'Isolator retak 1 titik', '', 2]);
  assert.throws(() => up3([item(b, 'TB-02', 1)]), /ID_GANDA/, 'BATAL tidak dihidupkan');
  assert.throws(() => up3([item(a, 'TB-02', 1)]), /KOLOM_TERKUNCI/);
});

test('Laporan UP3 dan UIW dikerjakan 2 orang bersamaan: revision terpisah, tidak saling KONFLIK, tidak saling menimpa', () => {
  const x = siapkanUp3();
  const orangB = { ...x.admin, userId: U(), nama: 'Admin UIW' };
  const rUp3 = x.getUp3(x.admin).revision, rUiw = x.getUiw(orangB).revision;   // dua HP membuka bersamaan
  const s1 = x.simpanUp3(x.admin, { tanggal: x.hariIni, revision: rUp3,
    c4a: [{ id: U(), penyulang: 'TB-01', realisasiKms: 4.6, temuan: 'Pohon', tindakLanjut: 'Rabas', eksekusi: 'ROW 01' }] });
  const s2 = x.simpanUiw(orangB, { tanggal: x.hariIni, revision: rUiw, cuaca: 'Cerah',
    c4a: [{ id: U(), sectionId: x.sekA, jumlahTiang: 40, temuanPeralatan: 1, temuanRow: 0, eksekusi: 0 }] });
  assert.deepStrictEqual([s1.revision, s2.revision, s2.cuaca], [1, 1, 'Cerah']);
  assert.deepStrictEqual([x.lapKolom('lap_Harian_UIW', 1, 'Cuaca'), x.lapKolom('lap_Harian_UIW', 1, 'Tim ROW'), x.lapKolom('lap_Harian_UIW', 1, 'Input Oleh')],
    ['Cerah', 1, 'Admin UIW']);
  assert.strictEqual(x.lapKolom('lap_Harian_UIW', 1, 'Laporan UIW'), s2.waText);
  assert.strictEqual(x.lapKolom('lap_Harian_UP3', 1, 'Laporan UP3'), s1.waText, 'salinan UP3 tetap milik orang A');
  assert.strictEqual(x.lapKolom('lap_C4A_UIW', 1, 'lap_id'), x.lapKolom('lap_Harian_UIW', 1, 'lap_id'), 'induk = lap_Harian_UIW');
  assert.notStrictEqual(x.lapKolom('lap_Harian_UIW', 1, 'lap_id'), x.lapKolom('lap_Harian_UP3', 1, 'lap_id'));
  const s3 = x.simpanUp3(x.admin, { tanggal: x.hariIni, revision: s1.revision, c4a: [] });
  assert.strictEqual(s3.revision, 2);
  assert.ok(s3.waText.includes('*E. C4A* \uD83E\uDE7A\n- Nihil'));
  assert.strictEqual(x.lapKolom('lap_Harian_UIW', 1, 'Cuaca'), 'Cerah', 'simpan UP3 tidak menimpa cuaca');
  assert.throws(() => x.simpanUiw(orangB, { tanggal: x.hariIni, revision: 0, cuaca: 'Hujan' }), /KONFLIK_REVISION/);
  x.simpanUiw(orangB, { tanggal: x.hariIni, revision: 1, cuaca: 'Hujan' });
  assert.deepStrictEqual([x.getUp3(x.admin).revision, x.getUiw(x.admin).revision], [2, 2]);
});

test('pemicu harian: 2 baris (UP3 + UIW) hari ini dibuat sekali (idempoten), simpan pertama memakai baris itu', () => {
  const x = siapkanUp3();
  assert.deepStrictEqual({ ...x.g.buatBarisHarian_(x.hariIni) }, { up3: 'DIBUAT', uiw: 'DIBUAT' });
  assert.deepStrictEqual({ ...x.g.buatBarisHarian_(x.hariIni) }, { up3: 'SUDAH_ADA', uiw: 'SUDAH_ADA' });
  for (const H of ['lap_Harian_UP3', 'lap_Harian_UIW']) {
    assert.strictEqual(x.sheets.l[H].data.length, 2, H);
    assert.deepStrictEqual([x.lapKolom(H, 1, 'Input Oleh'), x.lapKolom(H, 1, 'dibuat_oleh'), x.lapKolom(H, 1, 'revision'), x.lapKolom(H, 1, 'Hari'),
      x.lapKolom(H, 1, 'ULP'), x.lapKolom(H, 1, 'status')], ['SISTEM', 'SISTEM', 1, x.g.hariDari_(x.hariIni), 'Toboali', 'AKTIF'], H);
  }
  assert.ok(x.lapKolom('lap_Harian_UP3', 1, 'Laporan UP3').startsWith('*Laporan Harian Keandalan Distribusi*'));
  assert.ok(x.lapKolom('lap_Harian_UIW', 1, 'Laporan UIW').startsWith('*ULP TOBOALI*'));
  assert.deepStrictEqual([x.lapKolom('lap_Harian_UIW', 1, 'Cuaca'), x.lapKolom('lap_Harian_UIW', 1, 'Tim ROW')], ['', 1]);
  const y = siapkanUp3();
  y.simpanUiw(y.admin, { tanggal: y.hariIni, revision: 0, cuaca: 'Cerah' });
  assert.deepStrictEqual({ ...y.g.buatBarisHarian_(y.hariIni) }, { up3: 'DIBUAT', uiw: 'SUDAH_ADA' });
  assert.strictEqual(y.sheets.l.lap_Harian_UIW.data.length, 2);
  assert.deepStrictEqual([x.getUp3(x.admin).revision, x.getUiw(x.admin).revision], [1, 1]);
  assert.throws(() => x.simpanUiw(x.admin, { tanggal: x.hariIni, revision: 0, cuaca: 'Cerah' }), /KONFLIK_REVISION/);
  x.simpanUiw(x.admin, { tanggal: x.hariIni, revision: 1, cuaca: 'Cerah' });
  assert.strictEqual(x.sheets.l.lap_Harian_UIW.data.length, 2, 'simpan memakai baris pemicu');
  assert.strictEqual(x.lapKolom('lap_Harian_UIW', 1, 'revision'), 2);
});

test('simpanLaporanUiw: per section, kmS dari tiang, section dikunci; UP3 tidak tersentuh', () => {
  const x = siapkanUp3();
  const c1 = U(), c2 = U();
  const item = (id, sectionId, tiang, extra = {}) => ({ id, sectionId, jumlahTiang: tiang, temuanPeralatan: 1, temuanRow: 2, eksekusi: 1, ...extra });
  const T = 'lap_C4A_UIW';
  const uiw = (c4a) => x.simpanUiw(x.admin, { tanggal: x.hariIni, revision: x.getUiw(x.admin).revision, c4a });
  assert.throws(() => uiw([item(c1, x.sekA, 10), item(c2, x.sekA, 5)]), /SECTION_GANDA/);
  assert.throws(() => uiw([item(c1, U(), 10)]), /SECTION_TIDAK_ADA/);
  assert.throws(() => uiw([item(c1, x.sekA, 1.5)]), /HARUS_BULAT/);
  assert.throws(() => uiw([{ id: c1, penyulang: 'TB-01', realisasiKms: 2 }]), /FIELD_TIDAK_DIKENAL|FIELD_WAJIB/, 'isian UP3 ke UIW ditolak');
  const s1 = uiw([item(c1, x.sekA, 40), item(c2, x.sekC, 47)]);
  assert.ok(s1.waText.includes('Section : GH Toboali, Rias\nPanjang : 4,35kmS'));
  assert.strictEqual(x.lapKolom(T, 1, 'Panjang kmS'), 2, 'kmS dihitung server');
  assert.strictEqual(x.sheets.l.lap_C4A_UP3.data.length, 1);
  assert.strictEqual(x.sheets.l.lap_Harian_UP3.data.length, 1, 'harian UP3 tidak tersentuh');
  assert.ok(x.getUp3(x.admin).waText.includes('*E. C4A* \uD83E\uDE7A\n- Nihil'), 'UP3 tidak memakai C4A UIW');
  uiw([item(c1, x.sekA, 20)]);
  assert.strictEqual(x.lapKolom(T, 2, 'status'), 'BATAL');
  assert.strictEqual(x.lapKolom(T, 1, 'Jumlah Tiang'), 20);
  assert.throws(() => uiw([item(c1, x.sekB, 5)]), /KOLOM_TERKUNCI/);
});

test('Laporan UP3 / UIW > 7 hari = salinan tersimpan (ARSIP, hanya lihat); header wajib persis; DATA_GANDA', () => {
  const x = siapkanUp3();
  const lama = x.g.tglJakarta_(new Date(Date.now() - 20 * 864e5));
  const baris = (n, isi) => x.sheets.l[n].data.push(x.lapSkema[n].map((k) => (isi[k] ?? '')));
  const idUp3 = U(), idUiw = U();
  baris('lap_Harian_UP3', { No: 1, Tanggal: lama, 'Laporan UP3': 'UP3 lama', lap_id: idUp3, status: 'AKTIF', revision: 3 });
  baris('lap_Harian_UIW', { No: 1, Tanggal: lama, Cuaca: 'Cerah', 'Laporan UIW': 'UIW lama', lap_id: idUiw, status: 'AKTIF', revision: 2 });
  baris('lap_C4A_UP3', { Penyulang: 'TB-01', 'Realisasi kmS': 1.5, Temuan: 'Pohon', c4a_id: U(), lap_id: idUp3, status: 'AKTIF' });
  baris('lap_C4A_UP3', { Penyulang: 'TB-02', 'Realisasi kmS': 9, c4a_id: U(), lap_id: idUiw, status: 'AKTIF' });   // salah induk = tidak ikut
  const u = x.getUp3(x.admin, { tanggal: lama }), w = x.getUiw(x.admin, { tanggal: lama });
  assert.deepStrictEqual([u.sumber, u.bisaUbah, u.waText, u.statusTim, u.revision, u.laporan.revision], ['ARSIP', false, 'UP3 lama', null, null, 3]);
  assert.deepStrictEqual([w.sumber, w.waText, w.cuaca, w.laporan.revision], ['ARSIP', 'UIW lama', 'Cerah', 2]);
  assert.deepStrictEqual(u.c4a.map((c) => c.penyulang + ':' + c.realisasiKms + ':' + c.temuan), ['TB-01:1.5:Pohon']);
  x.sheets.l.lap_Harian_UIW.data[0][4] = 'Cuaca Hari';
  assert.throws(() => x.getUiw(x.admin), /CONFIG_TIDAK_VALID/);
  assert.strictEqual(x.getUp3(x.admin).sumber, 'LANGSUNG', 'UP3 hanya membaca sheet UP3, tidak ikut gagal');
  const y = siapkanUp3();
  const dobel = () => y.lapSkema.lap_Harian_UP3.map((k) => ({ Tanggal: y.hariIni, lap_id: U(), status: 'AKTIF' }[k] ?? ''));
  y.sheets.l.lap_Harian_UP3.data.push(dobel(), dobel());
  assert.throws(() => y.getUp3(y.admin), /DATA_GANDA/, 'dua baris AKTIF satu tanggal = fail closed');
  const z = siapkanUp3();
  z.g.cfg_ = ((asli) => () => ({ ...asli(), LAPORAN_SHEET_ID: '' }))(z.g.cfg_);
  assert.throws(() => z.getUp3(z.admin), /CONFIG_TIDAK_LENGKAP/);
});

test('guard Laporan UP3 / UIW lewat router: sesi, menu masing-masing, platform, UBAH, peran (PETUGAS / ADMIN_ES)', () => {
  const gp = buatKonteks({ ...PROPS, LAPORAN_SHEET_ID: 'l', ROW_SHEET_ID: 'r' });
  const jalan = [];
  for (const f of ['getLaporanUp3_', 'getLaporanUiw_', 'simpanLaporanUp3_', 'simpanLaporanUiw_']) {
    gp[f] = ((asli) => function (s, d, p) { jalan.push(f); return asli(s, d, p); })(gp[f]);
  }
  gp.bacaSheetLaporan_ = () => { throw new Error('tidak boleh sampai baca sheet'); };
  const menu = { OPS_LAP_UP3: { kode: 'OPS_LAP_UP3', platform: 'MOBILE', aktif: true }, OPS_LAP_UIW: { kode: 'OPS_LAP_UIW', platform: 'MOBILE', aktif: true } };
  gp.aturanAkses_ = () => ({ menu, akses: [
    { role: 'ADMIN', jenisTim: '*', menu: '*', aksi: 'UBAH' },
    { role: 'ADMIN_ES', jenisTim: '*', menu: 'OPS_LAP_UIW', aksi: 'LIHAT' },             // ADMIN_ES hanya diberi UIW
    { role: 'PETUGAS', jenisTim: 'ROW', menu: 'OPS_LAP_UP3', aksi: 'UBAH' }] });           // salah isi pun PETUGAS ditolak
  const req = (action, data = {}) => ({ action, token: 'a'.repeat(64), data });
  const hari = gp.tglJakarta_(new Date());
  const simpan = { tanggal: hari, revision: 0, c4a: [] };
  for (const a of ['getLaporanUp3', 'getLaporanUiw', 'simpanLaporanUp3', 'simpanLaporanUiw']) {
    assert.strictEqual(kodeError(() => gp.proses_({ action: a, token: 'x' }, 'MOBILE')), 'SESI_TIDAK_VALID', a);
  }
  assert.strictEqual(kodeError(() => gp.proses_({ action: 'getLaporanUp3Uiw', token: 'x' }, 'MOBILE')), 'AKSI_TIDAK_DIKENAL', 'endpoint lama dihapus');
  gp.sesiDariToken_ = () => ({ userId: 'u', role: 'ADMIN_ES', jenisTim: '', _tokenHash: 'h1' });
  assert.strictEqual(kodeError(() => gp.proses_(req('getLaporanUp3'), 'MOBILE')), 'AKSES_DITOLAK', 'ADMIN_ES tanpa menu UP3');
  assert.strictEqual(kodeError(() => gp.proses_(req('simpanLaporanUiw', simpan), 'MOBILE')), 'AKSES_DITOLAK', 'ADMIN_ES LIHAT tidak boleh simpan');
  assert.strictEqual(kodeError(() => gp.proses_(req('getLaporanUiw'), 'WEB')), 'AKSES_DITOLAK', 'menu MOBILE dari web');
  assert.deepStrictEqual(jalan, [], 'ditolak guard_ sebelum fungsi jalan');
  gp.sesiDariToken_ = () => ({ userId: 'p', role: 'PETUGAS', jenisTim: 'ROW', timId: 't', _tokenHash: 'h2' });
  assert.strictEqual(kodeError(() => gp.proses_(req('getLaporanUp3'), 'MOBILE')), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => gp.proses_(req('simpanLaporanUp3', simpan), 'MOBILE')), 'AKSES_DITOLAK');
  gp.sesiDariToken_ = () => ({ userId: 'a', role: 'ADMIN', jenisTim: '', _tokenHash: 'h3' });
  assert.strictEqual(kodeError(() => gp.proses_(req('simpanLaporanUiw', { ...simpan, tanggal: '2026-01-01' }), 'MOBILE')), 'HANYA_HARI_INI');
  assert.strictEqual(kodeError(() => gp.proses_(req('simpanLaporanUp3', { ...simpan, cuaca: 'x' }), 'MOBILE')), 'FIELD_TIDAK_DIKENAL');
  // PETUGAS & ADMIN ditolak di fungsi sebelum sheet dibaca (bacaSheetLaporan_ melempar Error biasa = kode lain)
  assert.deepStrictEqual(jalan, ['getLaporanUp3_', 'simpanLaporanUp3_', 'simpanLaporanUiw_', 'simpanLaporanUp3_']);
});

test('UIW section: satu = nama lengkap, banyak = awal section urutan terendah - akhir section urutan tertinggi', () => {
  const j = {
    a: { section: 'GH Toboali - LBS Kampung Baru', urutan: 20, baris: 2 },
    b: { section: 'LBS Kampung Baru - Rec Rias', urutan: 40, baris: 3 },
    c: { section: 'Rec Rias – Ujung Serdang', urutan: 60, baris: 4 },   // en dash ikut dipecah
    d: { section: 'TB-01 Ujung', urutan: 0, baris: 5 },                 // tanpa pemisah, urutan kosong = paling belakang
  };
  assert.strictEqual(g.sectionRentangUiw_(['b'], j), 'LBS Kampung Baru - Rec Rias');
  assert.strictEqual(g.sectionRentangUiw_(['c', 'a', 'b', 'a'], j), 'GH Toboali - Ujung Serdang', 'urutan dari kolom urutan, bukan urutan input');
  assert.strictEqual(g.sectionRentangUiw_(['a', 'd'], j), 'GH Toboali - TB-01 Ujung', 'TB-01 tidak terpecah');
  assert.strictEqual(g.sectionRentangUiw_(['x', ''], j), '');
  assert.strictEqual(g.sectionRentangUiw_(['a', 'b'], { a: { section: 'Rias', urutan: 1 }, b: { section: 'Rias', urutan: 2 } }), 'Rias');
  // integrasi: 2 section foto lengkap di satu penyulang
  const x = siapkanUp3();
  const sk = x.skema.row_Eksekusi;
  const rId = x.sheets.r.row_Eksekusi.data[1][sk.indexOf('realisasi_id')];
  const e3 = U();
  x.sync([x.op('eksekusi', 'buat', e3, x.kodeH + '-PNY.001-EKS.003', { realisasiId: rId, sectionId: x.sekC, koordinatPekerjaan: '-3.0, 106.5', diameter: 0, jenisId: x.jRabas })]);
  x.sheets.r.row_Eksekusi.data.slice(1).forEach((b) => { b[sk.indexOf('foto_lengkap')] = true; });
  x.sync([x.op('eksekusi', 'ubah', e3, undefined, { nomorTiang: 'T3' }, 1)]);
  const r = x.getUiw(x.admin);
  assert.ok(r.waText.includes('TIM ROW 01\n- Penyulang : TB-01\n- Section : Kampung Baru - Rias\n- Realisasi\n> Rabas : 1 Gawang\n> Tebang : 2 Batang'), r.waText);
});

test('ADMIN_migrasiCekFoto v0.59: bisa dilanjutkan per jalan, data lama bertambah tidak mengulang, selesai = posisi + pemicu dihapus', () => {
  const g = buatKonteks({ ...PROPS, ROW_SHEET_ID: 'r', MIG_SUMBER_ID: 'lama', MIG_FOTO_AKAR_ID: 'akar' });
  let jam = 0;
  g.Date = class extends Date { static now() { return jam; } };
  g.pastikanPemilik_ = () => {};
  const isi = [];
  const sheet = { getLastRow: () => isi.length, getRange: (r, c, n) => ({ setValues: (v) => { assert.strictEqual(r, isi.length + 1); assert.strictEqual(v.length, n); isi.push(...v); } }) };
  g.tulisSheetMig_ = (_ss, _n, kepala, baris) => { isi.length = 0; isi.push(kepala, ...baris); return sheet; };
  let foto = Array.from({ length: 7 }, (_, i) => ({ foto_id: 'f' + i, kode_eksekusi: 'E' + i, slot: 'FOTO_1', sumber_path: 'a/' + i + '.jpg' }));
  g.siapkanMigrasi_ = () => ({ c: { ULP_NAMA: 'Toboali' }, p: g.PropertiesService.getScriptProperties(), ssRow: { getSheetByName: () => sheet } });
  g.analisisMigrasi_ = () => ({});
  g.rencanaMigrasi_ = () => ({ foto });
  g.DriveApp = { getFolderById: () => ({ getName: () => 'AppSheet SiSi' }) };
  g.fileDariPathMig_ = (_a, path) => { jam += 100000; return path === 'a/3.jpg' ? null : { getName: () => path }; };   // 3 foto per jalan (BATAS 270 s)
  const pemicu = [{ getHandlerFunction: () => 'ADMIN_migrasiCekFoto' }, { getHandlerFunction: () => 'ADMIN_buatBarisHarian' }];
  g.ScriptApp = { getProjectTriggers: () => pemicu, deleteTrigger: (t) => pemicu.splice(pemicu.indexOf(t), 1) };
  const props = g.PropertiesService.getScriptProperties();
  const jalan = () => { jam = 0; g.ADMIN_migrasiCekFoto(); };
  jalan();
  assert.deepStrictEqual(isi.slice(1).map((b) => b[0]), ['E0', 'E1', 'E2']);
  assert.strictEqual(JSON.parse(props.getProperty('MIG_CEKFOTO_POS')).terakhir, 'f2');
  assert.strictEqual(props.getProperty('MIG_CEKFOTO_SIBUK'), null, 'kunci jalan dilepas');
  foto = [...foto, { foto_id: 'f7', kode_eksekusi: 'E7', slot: 'FOTO_1', sumber_path: 'a/7.jpg' }];   // app lama menambah data
  jalan();
  assert.deepStrictEqual(isi.slice(1).map((b) => b[0]), ['E0', 'E1', 'E2', 'E3', 'E4', 'E5'], 'lanjut, tidak mengulang');
  assert.deepStrictEqual(Array.from(isi[4].slice(3)), ['TIDAK', ''], 'tidak ketemu dicatat');
  props.setProperty('MIG_CEKFOTO_SIBUK', '0');   // sisa jalan macet lama (> 6 menit) tidak memblok
  jam = 0;
  props.setProperty('MIG_CEKFOTO_SIBUK', String(-400000));
  g.ADMIN_migrasiCekFoto();
  assert.strictEqual(isi.length, 1 + 8, 'semua 8 foto tercatat sekali');
  assert.strictEqual(props.getProperty('MIG_CEKFOTO_POS'), null, 'selesai = posisi dihapus');
  assert.deepStrictEqual(pemicu.map((t) => t.getHandlerFunction()), ['ADMIN_buatBarisHarian'], 'hanya pemicu cek foto yang dihapus');
  // jalan lain masih berlangsung (< 6 menit) = dilewati, tidak menulis
  props.setProperty('MIG_CEKFOTO_SIBUK', String(-1000));
  jam = 0;
  const sebelum = isi.length;
  g.ADMIN_migrasiCekFoto();
  assert.strictEqual(isi.length, sebelum);
  // posisi yang tidak ada lagi di rencana = mulai ulang dari awal
  props.deleteProperty('MIG_CEKFOTO_SIBUK');
  props.setProperty('MIG_CEKFOTO_POS', JSON.stringify({ terakhir: 'hilang', ada: 9, hilang: 9, jalan: 9 }));
  jalan();
  assert.deepStrictEqual(isi.slice(1).map((b) => b[0]), ['E0', 'E1', 'E2']);
  assert.strictEqual(JSON.parse(props.getProperty('MIG_CEKFOTO_POS')).ada, 3);
});

// ---------- v0.60: ADMIN_migrasiFoto pakai checksum Drive API ----------
function siapkanMigFoto({ api = true, shaSalinBeda = false } = {}) {
  const g = buatKonteks({ ...PROPS, ROW_SHEET_ID: 'r', ROW_FOTO_FOLDER_ID: 'akarV2', MIG_FOTO_AKAR_ID: 'akarLama' });
  g.pastikanPemilik_ = () => {};
  const hitung = { blob: 0, getFoldersByName: 0, getFilesByName: 0, getFiles: 0, apiGet: 0, apiCopy: 0, makeCopy: 0 };
  const it = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const files = {}; let n = 0;
  const buatFile = (folder, nama, bytes) => {
    const id = 'F' + (++n);
    const o = { id, nama, bytes, folder, trash: false,
      getId: () => id, getName: () => nama, getMimeType: () => 'image/jpeg',
      getBlob: () => { hitung.blob++; return { getBytes: () => Array.from(bytes, (b) => (b > 127 ? b - 256 : b)) }; },
      getSharingAccess: () => 'PRIVATE', setTrashed: () => { o.trash = true; delete folder.file[nama]; },
      makeCopy: (nm, tujuan) => { hitung.makeCopy++; return buatFile(tujuan._f, nm, bytes); } };
    folder.file[nama] = o; files[id] = o; return o;
  };
  const folders = {};
  const fold = (id, nama) => {
    const f = folders[id] = folders[id] || { id, nama, anak: {}, file: {} };
    const api = { _f: f, getId: () => id, getName: () => nama,
      getFoldersByName: (nm) => { hitung.getFoldersByName++; return it(f.anak[nm] ? [fold(f.anak[nm], nm)] : []); },
      createFolder: (nm) => { const nid = 'D' + (++n); f.anak[nm] = nid; return fold(nid, nm); },
      getFilesByName: (nm) => { hitung.getFilesByName++; return it(f.file[nm] ? [f.file[nm]] : []); },
      getFiles: () => { hitung.getFiles++; return it(Object.values(f.file)); } };
    return api;
  };
  g.DriveApp = { getFolderById: (id) => fold(id, id === 'akarLama' ? 'AppSheet SiSi' : id), getFileById: (id) => { if (!files[id]) throw new Error('tidak ada'); return files[id]; },
    Access: { PRIVATE: 'PRIVATE' }, Permission: { NONE: 'NONE' } };
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  if (api) {
    g.Drive = { Files: {
      get: (id) => { hitung.apiGet++; const f = files[id]; return { size: String(f.bytes.length), sha256Checksum: (shaSalinBeda && f.folder.id !== 'Dsumber' ? sha(Buffer.from('rusak')) : sha(f.bytes)).toUpperCase(), mimeType: 'image/jpeg' }; },
      copy: (res, id) => { hitung.apiCopy++; const s = files[id]; const c = buatFile(folders[res.parents[0]], res.name, s.bytes);
        return { id: c.id, size: String(c.bytes.length), sha256Checksum: shaSalinBeda ? sha(Buffer.from('rusak')) : sha(c.bytes) }; } } };
  }
  // sumber lama: akar/Eksekusi ROW/<kode lama>/<3 foto>
  const akar = folders.akarLama = { id: 'akarLama', nama: 'AppSheet SiSi', anak: { 'Eksekusi ROW': 'Deks' }, file: {} };
  folders.Deks = { id: 'Deks', nama: 'Eksekusi ROW', anak: { '9e90a393': 'Dsumber' }, file: {} };
  folders.Dsumber = { id: 'Dsumber', nama: '9e90a393', anak: {}, file: {} };
  const isi = {};
  ['SEBELUM', 'PEKERJAAN', 'SESUDAH'].forEach((s, i) => { isi[s] = Buffer.from('jpeg-' + s + '-' + i); buatFile(folders.Dsumber, '9e90a393.Foto ' + s + '.jpg', isi[s]); });
  void akar;
  const eksId = U(), kodeE = 'R01-16130261003001-PNY.001-EKS.001';
  const eks = { eksekusi_id: eksId, 'Kode Eksekusi': kodeE, Tim: 'ROW 01', Penyulang: 'TB-01', _baris: 2 };
  const kolomF = ['foto_id', 'eksekusi_id', 'kode_eksekusi', 'slot', 'sumber_drive_id', 'sumber_path', 'status', 'percobaan', 'drive_file_id', 'pesan', 'diubah_pada'];
  const antre = ['SEBELUM', 'PEKERJAAN', 'SESUDAH'].map((s, i) => ({ foto_id: 'foto' + i, eksekusi_id: eksId, kode_eksekusi: kodeE, slot: s, sumber_drive_id: '',
    sumber_path: 'AppSheet SiSi/Eksekusi ROW/9e90a393/9e90a393.Foto ' + s + '.jpg', status: 'ANTRE', percobaan: 0, _baris: i + 2 }));
  const ditulis = { rowFoto: [], eks: null, mig: null };
  g.bukaSpreadsheet_ = () => ({ getSheetByName: () => ({}) });
  g.bacaSumberMig_ = () => ({ rows: antre, kolom: kolomF });
  g.tabel_ = (_id, nama) => (nama === 'row_Eksekusi' ? { rows: [eks], header: [] } : { rows: [], header: [] });
  const headerF = ['foto_id', 'eksekusi_id', 'slot', 'drive_file_id', 'sha256', 'ukuran_byte', 'mime', 'sumber_foto', 'status'];
  g.headerTabel_ = () => ({ header: headerF, sheet: { getLastRow: () => 1, getRange: () => ({ setValues: (v) => ditulis.rowFoto.push(...v) }) } });
  g.tulisKolomBerubah_ = (t, rows) => { const salin = Array.from(rows, (r) => ({ ...r._ubah })); if (t.sheet) ditulis.mig = salin; else ditulis.eks = salin; };
  g.ScriptApp = { getProjectTriggers: () => [], deleteTrigger: () => {} };
  return { g, hitung, ditulis, isi, sha, folders };
}

test('ADMIN_migrasiFoto v0.60: checksum Drive API (tanpa download), salinan diverifikasi, folder & isi folder tidak dicari ulang', () => {
  const x = siapkanMigFoto();
  x.g.ADMIN_migrasiFoto();
  assert.strictEqual(x.hitung.blob, 0, 'tidak ada foto yang di-download');
  assert.deepStrictEqual([x.hitung.apiCopy, x.hitung.makeCopy], [3, 0]);
  assert.strictEqual(x.hitung.getFiles, 2, 'isi folder sumber + tujuan masing-masing didaftar sekali');
  assert.strictEqual(x.hitung.getFilesByName, 0, 'tidak cari file per nama');
  assert.ok(x.hitung.getFoldersByName <= 2 + 6, 'path tujuan 6 tingkat ditelusuri sekali untuk 3 foto: ' + x.hitung.getFoldersByName);
  assert.deepStrictEqual(x.ditulis.mig.map((q) => q.status), ['SELESAI', 'SELESAI', 'SELESAI']);
  const kol = { sha: 4, ukuran: 5, sumber: 7 };
  assert.deepStrictEqual(x.ditulis.rowFoto.map((r) => r[kol.sha]), ['SEBELUM', 'PEKERJAAN', 'SESUDAH'].map((s) => x.sha(x.isi[s])), 'sha256 hex kecil = isi file');
  assert.deepStrictEqual(x.ditulis.rowFoto.map((r) => r[kol.ukuran]), ['SEBELUM', 'PEKERJAAN', 'SESUDAH'].map((s) => x.isi[s].length));
  assert.strictEqual(x.ditulis.eks[0].foto_lengkap, true);
  const tujuan = Object.values(x.folders).find((f) => f.nama === 'R01-16130261003001-PNY.001-EKS.001');
  assert.deepStrictEqual(Object.keys(tujuan.file).sort(), ['foto0.jpg', 'foto1.jpg', 'foto2.jpg']);
});

test('ADMIN_migrasiFoto v0.60: checksum salinan beda = dibuang + ULANG; tanpa Drive API = cara lama (download + hitung)', () => {
  const x = siapkanMigFoto({ shaSalinBeda: true });
  x.g.ADMIN_migrasiFoto();
  assert.deepStrictEqual(x.ditulis.mig.map((q) => q.status), ['ULANG', 'ULANG', 'ULANG']);
  assert.strictEqual(x.ditulis.rowFoto.length, 0, 'salinan rusak tidak pernah dicatat');
  const tujuan = Object.values(x.folders).find((f) => f.nama === 'R01-16130261003001-PNY.001-EKS.001');
  assert.deepStrictEqual(Object.keys(tujuan.file), [], 'salinan rusak dibuang');
  const y = siapkanMigFoto({ api: false });
  y.g.ADMIN_migrasiFoto();
  assert.deepStrictEqual(y.ditulis.mig.map((q) => q.status), ['SELESAI', 'SELESAI', 'SELESAI']);
  assert.deepStrictEqual([y.hitung.makeCopy, y.hitung.blob], [3, 6], 'sumber + salinan di-download');
  assert.deepStrictEqual(y.ditulis.rowFoto.map((r) => r[4]), ['SEBELUM', 'PEKERJAAN', 'SESUDAH'].map((s) => y.sha(y.isi[s])), 'sha sama dengan jalur API');
});
