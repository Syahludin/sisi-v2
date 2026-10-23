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

test('v1.0.18 amanSheet_: teks angka berawalan 0 (OwnerId BA) dipaksa teks supaya 0 di depan tidak hilang', () => {
  assert.strictEqual(g.amanSheet_('06135'), "'06135");
  assert.strictEqual(g.amanSheet_('07020304'), "'07020304");
  assert.strictEqual(g.amanSheet_('6135'), '6135', 'tanpa 0 di depan tidak diubah');
  assert.strictEqual(g.amanSheet_('0'), '0', 'nol tunggal tetap angka');
  assert.strictEqual(g.amanSheet_('0.5'), '0.5', 'desimal tidak diubah');
  assert.strictEqual(g.amanSheet_(6135), 6135);
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
    getDataRange: () => ({ getValues: () => { log.push('BACA_PENUH:' + nama); return data.map((r) => r.slice()); },
      getDisplayValues: () => { log.push('BACA_PENUH:' + nama); return data.map((r) => r.map((v) => (v === null || v === undefined ? '' : String(v)))); } }),
    getLastColumn: () => data[0].length,
    getLastRow: () => data.length,
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => { log.push('BACA:' + nama); return data.slice(r - 1, r - 1 + nr).map((x) => x.slice(c - 1, c - 1 + nc)); },
      getDisplayValues: () => { log.push('BACA:' + nama); return data.slice(r - 1, r - 1 + nr).map((x) => { const b = x.slice(c - 1, c - 1 + nc); while (b.length < nc) b.push(''); return b.map((v) => (v === null || v === undefined ? '' : String(v))); }); },
      getValue: () => { log.push('BACA:' + nama); return data[r - 1][c - 1]; },
      setValue: (v) => { log.push('TULIS:' + nama); data[r - 1][c - 1] = sel(v); },
      setValues: (vals) => {
        log.push('TULIS:' + nama);
        vals.forEach((baris, i) => { data[r - 1 + i] = data[r - 1 + i] || []; baris.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = sel(v); }); });
      },
    }),
    appendRow: (v) => { log.push('TULIS:' + nama); data.push(v.map(sel)); },
    deleteRow: (r) => { log.push('HAPUS:' + nama); data.splice(r - 1, 1); },
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
  const atur = { akses: 'PRIVATE', bisaDikunci: true };   // v0.62.5: akses yang diwarisi file baru dari folder
  const folder = (id, nama) => {
    const f = folders[id] = folders[id] || { id, nama, anak: {}, file: {} };
    const it = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
    return {
      getId: () => id,
      // v0.77.0: folder bisa dibuang (tetap tercatat di induk, seperti Drive)
      isTrashed: () => !!f.dibuang, setTrashed: (t) => { f.dibuang = t; },
      getFoldersByName: (nm) => it(f.anak[nm] ? [folder(f.anak[nm], nm)] : []),
      createFolder: (nm) => { const nid = 'f' + (++n); f.anak[nm] = nid; return folder(nid, nm); },
      getFilesByName: (nm) => it(f.file[nm] ? [f.file[nm]] : []),
      getFiles: () => it(Object.values(f.file)),   // v0.64.4
      createFile: (blob) => {
        const fid = 'file' + (++n);
        const o = { getId: () => fid, getMimeType: () => blob.mime || 'image/jpeg', getBlob: () => ({ getBytes: () => blob.bytes }),
          akses: atur.akses, getSharingAccess: () => o.akses, nama: blob.nama, desk: '',
          setSharing: (a) => { if (!atur.bisaDikunci) throw new Error('shared drive'); o.akses = a; },
          setTrashed: (t) => { o.dibuang = t; if (t && o.f.file[o.nama] === o) delete o.f.file[o.nama]; },
          // v0.64.4: nama + deskripsi + induk
          getName: () => o.nama, setName: (nm) => { if (o.f.file[o.nama] === o) delete o.f.file[o.nama]; o.nama = nm; o.f.file[nm] = o; return o; },
          getDescription: () => o.desk, setDescription: (d) => { o.desk = d; return o; },
          getParents: () => it([folder(o.f.id, o.f.nama)]),
          // v0.80.0: viewer per akun (akses link tetap Dibatasi)
          viewer: [], addViewer: (e) => { o.viewer.push(e); return o; }, getViewers: () => o.viewer.map((e) => ({ getEmail: () => e })),
          // v0.77.0: pindah folder, ID tetap
          moveTo: (tujuan) => { if (o.f.file[o.nama] === o) delete o.f.file[o.nama]; o.f = folders[tujuan.getId()]; o.f.file[o.nama] = o; o.pindah = (o.pindah || 0) + 1; return o; },
          f };
        f.file[blob.nama] = o; semuaFile[fid] = o; dibuat.push(fid); return o;
      },
    };
  };
  const semuaFile = {};
  const getFileById = (id) => { if (!semuaFile[id]) throw new Error('tidak ada'); return semuaFile[id]; };
  return { DriveApp: { getFolderById: (id) => folder(id), getFileById, Access: { PRIVATE: 'PRIVATE', ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { NONE: 'NONE' } },
    folders, dibuat, semuaFile, atur };
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
  // v0.63.0: mulaiShiftYandal = login tahap 2 (tiket sekali pakai dari login, bukan token)
  assert.deepStrictEqual(publik.sort(), ['login', 'mulaiShiftYandal', 'ping'], 'hanya ping & login (2 tahap) tanpa sesi');
  const tanpaMenu = Object.keys(ep).filter((k) => !ep[k].publik && !ep[k].menu).sort();
  assert.deepStrictEqual(tanpaMenu, ['cekSesi', 'daftarNotif', 'gantiPassword', 'getArsipYandal', 'getKalenderTim', 'getMaster', 'getNotifikasi', 'getRankYandal', 'getUpdateApp', 'logout', 'simpanGarduYandal', 'simpanP0Yandal', 'simpanSwitchingYandal',
    'tandaiNotifikasi', 'uploadFotoGarduYandal', 'uploadFotoP0Yandal', 'uploadFotoSwitchingYandal'],
    'endpoint tanpa menu hanya yang milik sesi sendiri');
  // v0.67.0: gantiPassword hanya akun sesi sendiri (sesi.userId), password lama wajib, tim YANDAL ditolak paling awal
  assert.match(g.gantiPassword_.toString(), /^function gantiPassword_\(sesi, data, platform\) \{\s*if \(petugasYandal_\(sesi\)\)[\s\S]*sesi\.userId[\s\S]*PASSWORD_LAMA_SALAH/);
  // v0.65.0: kirim P0 tanpa menu = dibatasi di fungsi ke PETUGAS YANDAL dari HP, shift token sendiri, tim sesi
  assert.match(g.simpanP0Yandal_.toString(), /wajibPetugasYandalHp_\(sesi, platform\)[\s\S]*shiftSesiP0_\([\s\S]*sesi\.timId/);
  assert.match(g.uploadFotoP0Yandal_.toString(), /wajibPetugasYandalHp_\(sesi, platform\)[\s\S]*BUKAN_MILIK_TIM/);
  assert.match(g.wajibPetugasYandalHp_.toString(), /petugasYandal_\(sesi\)[\s\S]*platform !== 'MOBILE'/);
  // v0.66.0: switching = aturan sama (PETUGAS YANDAL HP, shift token, tim sesi lewat P0 induk / baris switching)
  assert.match(g.simpanSwitchingYandal_.toString(), /wajibPetugasYandalHp_\(sesi, platform\)[\s\S]*shiftSesiP0_\([\s\S]*p0IndukSwitching_/);
  assert.match(g.uploadFotoSwitchingYandal_.toString(), /wajibPetugasYandalHp_\(sesi, platform\)[\s\S]*BUKAN_MILIK_TIM[\s\S]*p0IndukSwitching_/);
  assert.match(g.p0IndukSwitching_.toString(), /sesi\.timId[\s\S]*BUKAN_MILIK_TIM/);
  // v0.74.0: Pengecekan Gardu = aturan sama dengan switching
  assert.match(g.simpanGarduYandal_.toString(), /wajibPetugasYandalHp_\(sesi, platform\)[\s\S]*shiftSesiP0_\([\s\S]*p0IndukGardu_/);
  assert.match(g.uploadFotoGarduYandal_.toString(), /wajibPetugasYandalHp_\(sesi, platform\)[\s\S]*BUKAN_MILIK_TIM[\s\S]*p0IndukGardu_/);
  assert.match(g.p0IndukGardu_.toString(), /sesi\.timId[\s\S]*BUKAN_MILIK_TIM/);
  // v0.63.5: tanpa menu = dibatasi di fungsi (arsip: akun YANDAL tim sendiri; rank: YANDAL / admin, hanya baca)
  assert.match(g.getArsipYandal_.toString(), /petugasYandal_\(sesi\)[\s\S]*sesi\.timId/);
  assert.match(g.getRankYandal_.toString(), /sesi\.role === 'PETUGAS' && !petugasYandal_\(sesi\)/);
  // v0.83.0: daftar notifikasi = HP saja, akun YANDAL / admin, install_id dari auth_Perangkat sesi (bukan dari HP)
  // v0.84.0: pemakaian server = ADMIN / SUPER saja (hanya baca Script Properties)
  assert.match(g.getPemakaian_.toString(), /^function getPemakaian_\(sesi, data\) \{\s*if \(!sesi \|\| \(sesi\.role !== 'ADMIN' && sesi\.role !== 'SUPER'\)\)/);
  assert.match(g.daftarNotif_.toString(), /platform !== 'MOBILE'[\s\S]*penerimaNotif_\(sesi\)[\s\S]*sesi\.deviceId/);
  const tulis = Object.keys(ep).filter((k) => ep[k].tulis && !ep[k].publik && !/Hartek|InsJar|InsDu|TemuanInspeksi|JadwalPadam|(Wo|WoAdmin|WoTim|WoGanda)_$/.test(ep[k].fn.name)).sort();
  // v1.0.17: Jadwal Padam = admin paling awal, menu OPS_JADWAL_PADAM, tulis butuh UBAH
  const epJp = Object.keys(ep).filter((k) => /JadwalPadam/.test(ep[k].fn.name)).sort();
  assert.deepStrictEqual(epJp.filter((k) => ep[k].tulis), ['hapusJadwalPadam', 'simpanJadwalPadam', 'ubahJadwalPadam', 'ubahStatusJadwalPadam']);
  for (const k of epJp) assert.strictEqual(ep[k].menu, 'OPS_JADWAL_PADAM', k);
  assert.deepStrictEqual(tulis, ['buatPdfBaGardu', 'kirimEamBaGardu', 'lepasNomorGardu', 'pesanNomorGardu', 'simpanApprovalP0', 'simpanAturanYandal', 'simpanBaGardu', 'simpanLaporanUiw', 'simpanLaporanUp3', 'simpanPetugasYandal', 'syncRow', 'ubahBaGardu', 'ubahJenisP0', 'updateMasterGarduBa', 'uploadFotoBaGardu', 'uploadFotoRow', 'uploadTtdBaGardu'], 'endpoint tulis butuh UBAH');
  // data ROW: fungsi wajib membatasi ke tim sesi (PETUGAS) sendiri
  const cekMilik = { getKodeRow: /wajibPetugasRow_\(sesi\)[\s\S]*sesi\.timId/, syncRow: /wajibPetugasRow_\(sesi\)/,
    uploadFotoRow: /wajibPetugasRow_\(sesi\)[\s\S]*BUKAN_MILIK_TIM/,
    getFotoRow: /timLaporan_/, getLaporanRow: /timLaporan_/, getArsipRow: /timLaporan_/,
    getArsipHariRow: /timLaporan_/, getFotoArsipRow: /kunciArsipFoto_\(sesi/,
    getLaporanUp3: /peranLaporanUp3_\(sesi, false\)/, getLaporanUiw: /peranLaporanUp3_\(sesi, false\)/,
    simpanLaporanUp3: /peranLaporanUp3_\(sesi, true\)/, simpanLaporanUiw: /peranLaporanUp3_\(sesi, true\)/,
    getPetugasYandal: /peranPetugasYandal_\(sesi, false\)/, simpanPetugasYandal: /peranPetugasYandal_\(sesi, true\)/,
    // v0.99.0: Laporan per Tim Yandal = data bersama ULP, khusus admin (bukan PETUGAS) paling awal
    getLaporanTimYandal: /^function getLaporanTimYandal_\(sesi, data\) \{\s*wajibAdminLaporanYandal_\(sesi\)/,
    // v0.70.0: BA gardu = data bersama ULP, khusus ADMIN / SUPER (dicek paling awal)
    getNomorGarduBaru: /^function getNomorGarduBaru_\(sesi, data\) \{\s*wajibAdminBa_\(sesi\)/, getOwnerIdGardu: /^function getOwnerIdGardu_\(sesi, data\) \{\s*wajibAdminBa_\(sesi\)/,
    uploadFotoBaGardu: /^function uploadFotoBaGardu_\(sesi, data\) \{\s*wajibAdminBa_\(sesi\)/, simpanBaGardu: /^function simpanBaGardu_\(sesi, data\) \{\s*wajibAdminBa_\(sesi\)/,
    // v0.71.0: PDF BA + daftar BA, sama: khusus ADMIN / SUPER paling awal
    getBaGardu: /^function getBaGardu_\(sesi, data\) \{\s*wajibAdminBa_\(sesi\)/, getFotoBaGardu: /^function getFotoBaGardu_\(sesi, data\) \{\s*wajibAdminBa_\(sesi\)/,
    getPdfBaGardu: /^function getPdfBaGardu_\(sesi, data\) \{\s*wajibAdminBa_\(sesi\)/, ubahBaGardu: /^function ubahBaGardu_\(sesi, data\) \{\s*wajibAdminBa_\(sesi\)/,
    getDaftarBaGardu: /^function getDaftarBaGardu_\(sesi, data\) \{\s*wajibAdminBa_\(sesi\)/, buatPdfBaGardu: /^function buatPdfBaGardu_\(sesi, data\) \{\s*wajibAdminBa_\(sesi\)/,
    // v0.78.0: BA TTD / Kirim EAM / Update Master Gardu, khusus ADMIN / SUPER paling awal
    uploadTtdBaGardu: /^function uploadTtdBaGardu_\(sesi, data\) \{\s*wajibAdminBa_\(sesi\)/, getTtdBaGardu: /^function getTtdBaGardu_\(sesi, data\) \{\s*wajibAdminBa_\(sesi\)/,
    kirimEamBaGardu: /^function kirimEamBaGardu_\(sesi, data\) \{\s*wajibAdminBa_\(sesi\)/, updateMasterGarduBa: /^function updateMasterGarduBa_\(sesi, data\) \{\s*wajibAdminBa_\(sesi\)/,
    // v0.73.0: pesan / lepas nomor gardu per BA, khusus ADMIN / SUPER paling awal
    pesanNomorGardu: /^function pesanNomorGardu_\(sesi, data\) \{\s*wajibAdminBa_\(sesi\)/, lepasNomorGardu: /^function lepasNomorGardu_\(sesi, data\) \{\s*wajibAdminBa_\(sesi\)/,
    // v0.75.0: Approval P0 + aturan Yandal = data bersama ULP, khusus ADMIN / SUPER paling awal
    getApprovalP0: /^function getApprovalP0_\(sesi, data\) \{\s*wajibAdminP0_\(sesi\)/, getFotoApprovalP0: /^function getFotoApprovalP0_\(sesi, data\) \{\s*wajibAdminP0_\(sesi\)/,
    simpanApprovalP0: /^function simpanApprovalP0_\(sesi, data, platform\) \{\s*wajibAdminP0_\(sesi\)/, ubahJenisP0: /^function ubahJenisP0_\(sesi, data, platform\) \{\s*wajibAdminP0_\(sesi\)/,
    simpanAturanYandal: /^function simpanAturanYandal_\(sesi, data, platform\) \{\s*wajibAdminP0_\(sesi\)/,
    // v0.85.0: menu Pemakaian Engine = ADMIN / SUPER paling awal, hanya baca
    getPemakaian: /^function getPemakaian_\(sesi, data\) \{\s*if \(!sesi \|\| \(sesi\.role !== 'ADMIN' && sesi\.role !== 'SUPER'\)\)/,
    // v0.86.0: arsip BA v1 (baca saja) = admin BA paling awal
    getFileArsipBaGardu: /^function getFileArsipBaGardu_\(sesi, data\) \{\s*wajibAdminBa_\(sesi\)/ };
  // v0.87.0: Hartek petugas = peran PETUGAS HARTEK paling awal
  for (const k of Object.keys(ep).filter((k) => /Hartek/.test(ep[k].fn.name))) cekMilik[k] = new RegExp('^function ' + ep[k].fn.name + '\\(sesi(, data)?(, platform)?\\) \\{\\s*wajibPetugasHartek_\\(sesi\\)');
  // v1.0.0: Inspeksi Jaringan petugas = peran PETUGAS INSPEKSI_JARINGAN paling awal; Input Temuan Inspeksi = admin paling awal
  for (const k of Object.keys(ep).filter((k) => /InsJar/.test(ep[k].fn.name))) cekMilik[k] = new RegExp('^function ' + ep[k].fn.name + '\\(sesi(, data)?\\) \\{\\s*wajibPetugasInsJar_\\(sesi\\)');
  for (const k of Object.keys(ep).filter((k) => /TemuanInspeksi/.test(ep[k].fn.name))) cekMilik[k] = new RegExp('^function ' + ep[k].fn.name + '\\(sesi(, data)?\\) \\{\\s*wajibAdminTemuan_\\(sesi\\)');
  // v1.0.8: Inspeksi Gardu petugas = peran PETUGAS INSPEKSI_GARDU paling awal, tulis butuh UBAH di OPS_INSDU_INPUT
  for (const k of Object.keys(ep).filter((k) => /InsDu/.test(ep[k].fn.name))) cekMilik[k] = new RegExp('^function ' + ep[k].fn.name + '\\(sesi(, data)?\\) \\{\\s*wajibPetugasInsDu_\\(sesi\\)');
  assert.deepStrictEqual(Object.keys(ep).filter((k) => /InsDu/.test(ep[k].fn.name) && ep[k].tulis).sort(), ['buatHeaderInsDu', 'hapusRealisasiInsDu', 'segelSinkronInsDu', 'simpanPengukuranInsDu', 'simpanRealisasiInsDu', 'simpanTemuanInsDu', 'ubahHeaderInsDu', 'ubahRealisasiInsDu', 'ubahTemuanInsDu', 'uploadFotoInsDu'], 'endpoint tulis InsDu butuh UBAH');
  for (const k of Object.keys(ep).filter((k) => /InsDu/.test(ep[k].fn.name))) assert.strictEqual(ep[k].menu, 'OPS_INSDU_INPUT', k);
  // v1.0.10: WO tindak lanjut. Admin = bukan PETUGAS paling awal; tim = PETUGAS ROW / HARTEK / YANDAL (YANDAL HP + shift) paling awal
  const epWo = Object.keys(ep).filter((k) => /(Wo|WoAdmin|WoTim|WoPindah)_$/.test(ep[k].fn.name));
  assert.deepStrictEqual(epWo.sort(), ['getFotoWoAdmin', 'getFotoWoPindah', 'getFotoWoTim', 'getWoAdmin', 'getWoPindah', 'getWoTim', 'hapusPekerjaanWo', 'mulaiWo', 'pindahWo', 'selesaiWo', 'simpanPekerjaanWo', 'tarikWo', 'teruskanWo', 'uploadFotoWo']);
  // v1.0.18: pindah / tarik WO terkirim = menu Pindah Tim TO; Penerusan WO hanya daftar + teruskan
  const menuAdminWo = { getWoAdmin: 'OPS_PENERUSAN_WO', getFotoWoAdmin: 'OPS_PENERUSAN_WO', teruskanWo: 'OPS_PENERUSAN_WO',
                        tarikWo: 'OPS_PINDAH_TIM_TO', getWoPindah: 'OPS_PINDAH_TIM_TO', getFotoWoPindah: 'OPS_PINDAH_TIM_TO', pindahWo: 'OPS_PINDAH_TIM_TO' };
  for (const k of Object.keys(menuAdminWo)) {
    cekMilik[k] = new RegExp('^function ' + ep[k].fn.name + '\\(sesi, data\\) \\{\\s*wajibAdminWo_\\(sesi\\)');
    assert.strictEqual(ep[k].menu, menuAdminWo[k], k);
  }
  for (const k of epWo.filter((k) => !menuAdminWo[k])) {
    cekMilik[k] = new RegExp('^function ' + ep[k].fn.name + '\\(sesi, data, platform\\) \\{\\s*wajibPetugasWo_\\(sesi, platform\\)');
    assert.strictEqual(ep[k].menu, 'OPS_WO_TIM', k);
  }
  assert.deepStrictEqual(epWo.filter((k) => ep[k].tulis).sort(), ['hapusPekerjaanWo', 'mulaiWo', 'pindahWo', 'selesaiWo', 'simpanPekerjaanWo', 'tarikWo', 'teruskanWo', 'uploadFotoWo'], 'tulis WO butuh UBAH');
  // v1.0.16: verifikasi WO ganda = admin paling awal, menu OPS_WO_GANDA, putuskan butuh UBAH
  const epGanda = Object.keys(ep).filter((k) => /WoGanda_$/.test(ep[k].fn.name)).sort();
  assert.deepStrictEqual(epGanda, ['getFotoWoGanda', 'getWoGanda', 'putuskanWoGanda']);
  for (const k of epGanda) {
    cekMilik[k] = new RegExp('^function ' + ep[k].fn.name + '\\(sesi, data\\) \\{\\s*wajibAdminWo_\\(sesi\\)');
    assert.strictEqual(ep[k].menu, 'OPS_WO_GANDA', k);
  }
  assert.deepStrictEqual(epGanda.filter((k) => ep[k].tulis), ['putuskanWoGanda']);
  const tulisInsJar = Object.keys(ep).filter((k) => /InsJar|TemuanInspeksi/.test(ep[k].fn.name) && ep[k].tulis).sort();
  assert.deepStrictEqual(tulisInsJar, ['buatHeaderInsJar', 'segelSinkronInsJar', 'simpanRealisasiInsJar', 'simpanTemuanInsJar', 'simpanTemuanInspeksi', 'ubahHeaderInsJar', 'ubahRealisasiInsJar', 'ubahTemuanInsJar', 'uploadFotoInsJar', 'uploadFotoTemuanInspeksi'], 'endpoint tulis InsJar butuh UBAH');
  for (const k of Object.keys(ep).filter((k) => /InsJar/.test(ep[k].fn.name))) assert.strictEqual(ep[k].menu, 'OPS_INSJAR_INPUT', k);
  for (const k of Object.keys(ep).filter((k) => /TemuanInspeksi/.test(ep[k].fn.name))) assert.strictEqual(ep[k].menu, 'OPS_INPUT_TEMUAN', k);
  // v1.0.17: riwayat gardu = data bersama ULP, khusus admin paling awal
  cekMilik.getRiwayatGardu = /^function getRiwayatGardu_\(sesi, data\) \{\s*wajibAdminRiwayatGardu_\(sesi\)/;
  // v1.0.17: Jadwal Padam = admin paling awal
  for (const k of epJp) cekMilik[k] = new RegExp('^function ' + ep[k].fn.name + '\\(sesi(, data)?\\) \\{\\s*wajibAdminJadwalPadam_\\(sesi\\)');
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
  assert.strictEqual(salah('16130.lain'), 'LOGIN_GAGAL', 'v0.62.5: rem global dijawab sama dengan password salah');
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
  // v0.62.7: token sama tapi akun dipindah ke tim lain (sesi segar) = izin cache tidak berlaku lagi
  assert.throws(() => ga.getFotoArsipRow_({ ...sesi, timId: 't2' }, { fotoId: f2 }), /AKSES_DITOLAK/, 'tim berubah ditolak');
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
test('audit v0.47 + v0.62.3: token ditolak diingat; token asing ditolak dari indeks tanpa baca sheet', () => {
  const gt = buatKonteks(PROPS);
  let baca = 0;
  gt.tabel_ = (_p, nama) => { if (nama === 'auth_Perangkat') baca++; return { rows: [] }; };
  const tok = 'a'.repeat(64);
  assert.strictEqual(kodeError(() => gt.sesiDariToken_(tok)), 'SESI_TIDAK_VALID', 'indeks baru dibangun = pasti tidak ada');
  assert.strictEqual(kodeError(() => gt.sesiDariToken_(tok)), 'SESI_TIDAK_VALID', 'diingat');
  assert.strictEqual(baca, 1);
  for (let i = 1; i < 300; i++) assert.strictEqual(kodeError(() => gt.sesiDariToken_(i.toString(16).padStart(64, '0'))), 'TERLALU_SERING');
  assert.strictEqual(baca, 1, '300 token asing = tetap 1x baca sheet');
});

// ---------- audit v0.62.3 ----------
test('audit v0.62.3: spam token asing tidak memblokir petugas asli (dulu rem global 60/menit)', () => {
  const gt = buatKonteks(PROPS);
  const tokenAsli = 'b'.repeat(64);
  const nanti = 'c'.repeat(64);
  const rows = [{ device_id: 'd1', user_id: 'u1', token_hash: gt.sha256Hex_(tokenAsli), dibuat_pada: new Date().toISOString(),
    kedaluwarsa_pada: new Date(Date.now() + 864e5).toISOString(), dicabut_pada: '' }];
  let baca = 0;
  gt.tabel_ = (_p, nama) => { if (nama === 'auth_Perangkat') baca++; return { rows: rows.slice() }; };
  gt.profilUser_ = (id) => ({ userId: id, username: 'x', role: 'PETUGAS', timId: 't1', jenisTim: 'ROW' });
  for (let i = 0; i < 500; i++) kodeError(() => gt.sesiDariToken_(crypto.randomBytes(32).toString('hex')));
  assert.strictEqual(baca, 1, 'spam hanya membangun indeks sekali');
  assert.strictEqual(gt.sesiDariToken_(tokenAsli).userId, 'u1', 'petugas asli (cache sesi habis) tetap masuk');
  // baris baru yang belum masuk indeks muda: TERLALU_SERING (HP coba lagi, tidak logout), bukan SESI_TIDAK_VALID
  rows.push({ ...rows[0], device_id: 'd2', token_hash: gt.sha256Hex_(nanti) });
  assert.strictEqual(kodeError(() => gt.sesiDariToken_(nanti)), 'TERLALU_SERING');
  // indeks lewat 1 menit = dibangun ulang sekali, token baru dikenali
  const c = gt.CacheService.getScriptCache();
  const x = JSON.parse(c.get(gt.INDEKS_TOKEN_KUNCI_)); x.t -= 61000; c.put(gt.INDEKS_TOKEN_KUNCI_, JSON.stringify(x));
  const sebelum = baca;
  assert.strictEqual(gt.sesiDariToken_(nanti).userId, 'u1');
  assert.strictEqual(baca, sebelum + 1, 'bangun ulang + validasi = 1 baca (rows dipakai ulang)');
});

test('audit v0.62.3: login memasukkan token ke indeks; ADMIN_bersihkanCache membuang indeks', () => {
  const { gl } = konteksLogin();
  kodeError(() => gl.sesiDariToken_('e'.repeat(64)));   // indeks terbangun sebelum login
  const r = gl.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026' }, 'MOBILE');
  gl.hapusSesiCache_(gl.sha256Hex_(r.token));           // seolah cache sesi habis / tergusur
  assert.strictEqual(gl.sesiDariToken_(r.token).username, '16130.uji.row01', 'tidak TERLALU_SERING: token sudah di indeks');
  gl.ADMIN_bersihkanCache();
  assert.strictEqual(gl.CacheService.getScriptCache().get(gl.INDEKS_TOKEN_KUNCI_), null);
  assert.ok(gl.sesiDariToken_(r.token), 'indeks dibangun ulang dari sheet');
});

test('audit v0.62.3: hash password tidak pernah di dalam ScriptLock; username asing tanpa lock sama sekali', () => {
  const { gl, sheets } = konteksLogin();
  let lock = 0, hmacDalamLock = 0;
  gl.LockService = { getScriptLock: () => ({ tryLock: () => { lock++; return true; }, releaseLock: () => {} }) };
  const asli = gl.Utilities.computeHmacSha256Signature;
  gl.Utilities.computeHmacSha256Signature = (v, k) => { if (gl.LOCK_AKTIF_.ya) hmacDalamLock++; return asli(v, k); };
  const coba = (u, p) => kodeError(() => gl.login_(null, { username: u, password: p }, 'MOBILE'));
  assert.strictEqual(coba('16130.tidak.ada', 'apa-saja-apa-saja'), 'LOGIN_GAGAL');
  assert.strictEqual(lock, 0, 'username asing: tidak ambil lock');
  assert.strictEqual(coba('16130.uji.row01', 'salah-salah-salah'), 'LOGIN_GAGAL');
  assert.strictEqual(lock, 1, 'password salah: lock hanya untuk tulis gagal_login');
  assert.strictEqual(sheets.a.auth_Password.data[1][5], 1, 'gagal_login tercatat');
  assert.ok(gl.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026' }, 'MOBILE').token);
  assert.strictEqual(sheets.a.auth_Password.data[1][5], 0, 'gagal_login direset');
  assert.strictEqual(hmacDalamLock, 0, 'PBKDF2 selalu di luar lock');
  // upgrade iterasi juga dihitung di luar lock
  const gu = konteksLogin({ PBKDF2_ITERASI: '1200' });
  let hu = 0;
  const a2 = gu.gl.Utilities.computeHmacSha256Signature;
  gu.gl.Utilities.computeHmacSha256Signature = (v, k) => { if (gu.gl.LOCK_AKTIF_.ya) hu++; return a2(v, k); };
  assert.ok(gu.gl.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026' }, 'MOBILE').token);
  assert.strictEqual(gu.sheets.a.auth_Password.data[1][3], 'pbkdf2-sha256:1200');
  assert.strictEqual(hu, 0);
});

test('audit v0.62.3: password diganti di antara hash dan lock = LOGIN_GAGAL, tanpa token', () => {
  const { gl, sheets } = konteksLogin();
  const asli = gl.denganLock_;
  gl.denganLock_ = (fn, t) => { sheets.a.auth_Password.data[1][1] = 'hash-baru-admin'; return asli(fn, t); };
  assert.strictEqual(kodeError(() => gl.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026' }, 'MOBILE')), 'LOGIN_GAGAL');
  assert.strictEqual(sheets.a.auth_Perangkat.data.length, 1, 'tidak ada token dibuat');
});

test('audit v0.62.3: cekSesi menolak token yang dicabut / kedaluwarsa di sheet walau masih di cache', () => {
  for (const [kolom, nilai, kode] of [['dicabut_pada', new Date().toISOString(), 'SESI_DICABUT'],
    ['kedaluwarsa_pada', new Date(Date.now() - 1000).toISOString(), 'SESI_KEDALUWARSA']]) {
    const { gl, sheets } = konteksLogin();
    const r = gl.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026' }, 'MOBILE');
    const sesi = gl.sesiDariToken_(r.token);   // dari cache
    const P = sheets.a.auth_Perangkat.data;
    P[P.length - 1][P[0].indexOf(kolom)] = nilai;   // edit manual tanpa ADMIN_bersihkanCache
    const expAwal = P[P.length - 1][P[0].indexOf('kedaluwarsa_pada')];
    assert.strictEqual(kodeError(() => gl.cekSesi_(sesi, {}, 'MOBILE')), kode, kolom);
    assert.strictEqual(P[P.length - 1][P[0].indexOf('kedaluwarsa_pada')], expAwal, 'tidak diperpanjang');
    assert.strictEqual(kodeError(() => gl.sesiDariToken_(r.token)), kode, 'cache sesi ikut dihapus');
  }
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
  assert.strictEqual(coba('16130.tak.ada'), 'LOGIN_GAGAL', 'username asing tetap direm global (v0.62.5: kode sama, tidak bocor)');
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
  assert.throws(() => x.simpanUiw(orangB, { tanggal: x.hariIni, revision: 0, cuaca: 'Hujan', c4a: [] }), /KONFLIK_REVISION/);
  x.simpanUiw(orangB, { tanggal: x.hariIni, revision: 1, cuaca: 'Hujan', c4a: [] });
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
  y.simpanUiw(y.admin, { tanggal: y.hariIni, revision: 0, cuaca: 'Cerah', c4a: [] });
  assert.deepStrictEqual({ ...y.g.buatBarisHarian_(y.hariIni) }, { up3: 'DIBUAT', uiw: 'SUDAH_ADA' });
  assert.strictEqual(y.sheets.l.lap_Harian_UIW.data.length, 2);
  assert.deepStrictEqual([x.getUp3(x.admin).revision, x.getUiw(x.admin).revision], [1, 1]);
  assert.throws(() => x.simpanUiw(x.admin, { tanggal: x.hariIni, revision: 0, cuaca: 'Cerah', c4a: [] }), /KONFLIK_REVISION/);
  x.simpanUiw(x.admin, { tanggal: x.hariIni, revision: 1, cuaca: 'Cerah', c4a: [] });
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

test('ADMIN_migrasiHitung v0.60.1: ditolak selama antrean foto tahap B belum habis (GAGAL tidak menahan), MIG_HITUNG_PAKSA membuka', () => {
  const r0 = g.sisaAntreFotoMig_([{ status: 'ANTRE', percobaan: 0 }, { status: 'ULANG', percobaan: 2 }, { status: 'ULANG', percobaan: 3 },
    { status: 'SELESAI' }, { status: 'GAGAL', percobaan: 3 }]);
  assert.deepStrictEqual([r0.sisa, r0.selesai, r0.gagal, r0.tanpaKode], [2, 1, 2, 2]);
  const siapkan = (antre, paksa) => {
    const x = buatKonteks({ ...PROPS, ROW_SHEET_ID: 'r', ...(paksa ? { MIG_HITUNG_PAKSA: 'TRUE' } : {}) });
    x.pastikanPemilik_ = () => {};
    let dihitung = 0;
    x.bukaSpreadsheet_ = () => ({ getSheetByName: (nm) => (nm === 'mig_Foto' && antre ? {} : null) });
    x.bacaSumberMig_ = () => ({ rows: antre || [], kolom: [] });
    x.denganLock_ = () => { dihitung++; return { bulan: 0, sisa: 0, blokDitulis: 0 }; };
    return { x, jalan: () => kodeError(() => x.ADMIN_migrasiHitung()), dihitung: () => dihitung };
  };
  const a = siapkan([{ status: 'SELESAI' }, { status: 'ANTRE', percobaan: 0 }]);
  assert.strictEqual(a.jalan(), 'TAHAP_B_BELUM_SELESAI');
  assert.strictEqual(a.dihitung(), 0, 'tidak menyentuh row_* saat ditolak');
  const b = siapkan([{ status: 'SELESAI' }, { status: 'GAGAL', percobaan: 3 }]);
  assert.strictEqual(b.jalan(), null);
  assert.strictEqual(b.dihitung(), 1);
  const c = siapkan([{ status: 'ANTRE', percobaan: 0 }], true);
  assert.strictEqual(c.jalan(), null, 'MIG_HITUNG_PAKSA=TRUE membuka');
  assert.strictEqual(siapkan(null).jalan(), 'SHEET_TIDAK_ADA', 'tanpa mig_Foto = ditolak');
});

// ---------- v0.60.2: prioritas bulan tahap B + kunci tahap C per blok ----------
test('v0.60.2: blokFotoMig_ + urutPrioritasFotoMig_ (MIG_FOTO_PRIORITAS mendahulukan bulan, sisanya urutan tetap)', () => {
  assert.strictEqual(g.blokFotoMig_({ kode_eksekusi: 'R01-16130261003001-PNY.001-EKS.001' }), 'R01-161302610');
  assert.strictEqual(g.blokFotoMig_({ kode_eksekusi: '' }), '');
  assert.strictEqual(g.blokFotoMig_({ kode_eksekusi: 'X01-16130261003001' }), '');
  const q = (k, id) => ({ id, kode_eksekusi: k });
  const todo = [q('R01-16130260101001-PNY.001-EKS.001', 'a'), q('R02-16130261005001-PNY.001-EKS.001', 'b'),
    q('R03-16130260902001-PNY.001-EKS.001', 'c'), q('R01-16130261001001-PNY.001-EKS.001', 'd'), q('', 'e')];
  assert.deepStrictEqual(Array.from(g.urutPrioritasFotoMig_(todo, '2610'), (x) => x.id), ['b', 'd', 'a', 'c', 'e']);
  assert.deepStrictEqual(Array.from(g.urutPrioritasFotoMig_(todo, '2610, 2609'), (x) => x.id), ['b', 'c', 'd', 'a', 'e']);
  assert.deepStrictEqual(Array.from(g.urutPrioritasFotoMig_(todo, ''), (x) => x.id), ['a', 'b', 'c', 'd', 'e']);
  assert.deepStrictEqual(Array.from(g.urutPrioritasFotoMig_(todo, 'Okt'), (x) => x.id), ['a', 'b', 'c', 'd', 'e'], 'isi asing diabaikan');
});

test('v0.60.2: ADMIN_migrasiHitung melewati blok yang fotonya belum habis, blok yang habis dihitung + dicatat selesai', () => {
  const siapkan = (antre, extra = {}) => {
    const x = buatKonteks({ ...PROPS, ROW_SHEET_ID: 'r', ...extra });
    x.pastikanPemilik_ = () => {};
    x.bukaSpreadsheet_ = () => ({ getSheetByName: () => ({}) });
    x.bacaSumberMig_ = () => ({ rows: antre, kolom: [] });
    x.denganLock_ = (fn) => fn();
    const h = (kode) => ({ header_id: kode, 'Kode Header': kode, dibuat_oleh: 'MIGRASI', tim_id: 't' });
    const rows = { row_Header: [h('R01-16130260905001'), h('R01-16130261003001'), h('R02-16130261003001')], row_Realisasi: [], row_Eksekusi: [] };
    x.tabel_ = (_id, nama) => ({ rows: rows[nama] || [], header: [] });
    x.masterRow_ = () => ({});
    const dihitung = [];
    x.hitungUlangRealisasi_ = () => {};
    x.hitungUlangWa_ = (ctx) => { dihitung.push(Object.keys(ctx.kotorHeader).join(',')); };
    x.tulisKolomBerubah_ = () => 0;
    return { x, dihitung, props: () => x.PropertiesService.getScriptProperties() };
  };
  const antre = [{ status: 'ANTRE', percobaan: 0, kode_eksekusi: 'R01-16130260905001-PNY.001-EKS.001' },
    { status: 'SELESAI', kode_eksekusi: 'R01-16130261003001-PNY.001-EKS.001' },
    { status: 'GAGAL', percobaan: 3, kode_eksekusi: 'R02-16130261003001-PNY.001-EKS.001' }];
  const a = siapkan(antre);
  a.x.ADMIN_migrasiHitung();
  assert.deepStrictEqual(a.dihitung, ['R01-16130261003001', 'R02-16130261003001'], 'Oktober dihitung, September (foto antre) dilewati');
  assert.strictEqual(a.props().getProperty('MIG_HITUNG_SELESAI'), 'R01-161302610,R02-161302610', 'blok yang dilewati tidak dicatat selesai');
  const b = siapkan(antre, { MIG_HITUNG_PAKSA: 'TRUE' });
  b.x.ADMIN_migrasiHitung();
  assert.strictEqual(b.dihitung.length, 3, 'PAKSA = semua blok');
  const c = siapkan([{ status: 'ANTRE', percobaan: 0, kode_eksekusi: '' }]);
  assert.strictEqual(kodeError(() => c.x.ADMIN_migrasiHitung()), 'TAHAP_B_BELUM_SELESAI', 'antrean tanpa kode = semua ditahan');
});

// ---------- v0.62 (M4): batal dengan alasan ----------
test('syncRow v0.62: batal menerima alasan + catatan (opsional), dicatat BATAL_ROW; alasan asing / field lain ditolak', () => {
  const x = siapkanRow();
  const hId = U(), rId = U(), e1 = U(), e2 = U();
  const eks = (id, n) => x.op('eksekusi', 'buat', id, x.kodeH + '-PNY.001-EKS.00' + n, {
    realisasiId: rId, sectionId: x.sekA, nomorTiang: 'T' + n, koordinatPekerjaan: '-3.0, 106.5', diameter: 0, jenisId: x.jRabas });
  x.sync([x.op('header', 'buat', hId, x.kodeH, { tanggal: x.hariIni }),
          x.op('realisasi', 'buat', rId, x.kodeH + '-PNY.001', { headerId: hId, penyulang: 'TB-01' }), eks(e1, 1), eks(e2, 2)]);
  const asing = x.sync([x.op('eksekusi', 'batal', e1, undefined, { alasan: 'BOSAN' }, 1)]);
  assert.strictEqual(asing.hasil[0].status, 'DITOLAK');
  assert.strictEqual(asing.hasil[0].alasan, 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(x.sync([x.op('eksekusi', 'batal', e1, undefined, { alasan: 'DOBEL', x: 1 }, 1)]).hasil[0].alasan, 'FIELD_TIDAK_DIKENAL');
  const ok = x.sync([x.op('eksekusi', 'batal', e1, undefined, { alasan: 'DOBEL', catatan: 'input dua kali' }, 1)]);
  assert.strictEqual(ok.hasil[0].status, 'OK');
  const log = x.sheets.a.log_Audit.data.filter((l) => l[4] === 'BATAL_ROW');
  assert.strictEqual(log.length, 1);
  assert.strictEqual(log[0][5], x.kodeH + '-PNY.001-EKS.001');
  assert.strictEqual(log[0][6], 'eksekusi | DOBEL | input dua kali');
  assert.strictEqual(x.sync([x.op('eksekusi', 'batal', e1, undefined, { alasan: 'DOBEL' }, 1)]).hasil[0].status, 'DUPLIKAT');
  assert.strictEqual(x.sheets.a.log_Audit.data.filter((l) => l[4] === 'BATAL_ROW').length, 1, 'DUPLIKAT tidak dicatat ulang');
  assert.strictEqual(x.sync([x.op('eksekusi', 'batal', e2, undefined, {}, 1)]).hasil[0].status, 'OK', 'tanpa isi tetap diterima (APK lama)');
  assert.strictEqual(x.sheets.a.log_Audit.data.filter((l) => l[4] === 'BATAL_ROW').at(-1)[6], 'eksekusi | -');
});

test('migrasi tahap A: eksekusi urut Timestamp lintas sub-tim (regresi _ms v0.62.3)', () => {
  const mk = (tim, tgl, kode) => {
    const ts = Date.parse(tgl + 'T03:00:00Z');
    return { id: 'h' + tim, kode, tgl, timKode: tim, tim: { nama: 'ROW ' + tim, tim_id: 't' + tim }, ts, anggota: [kode],
      kAwal: '', kAkhir: '', kmAwal: null, kmAkhir: null, kendala: '', inputBy: '', waLama: '',
      penyulangUrut: [{ id: 'r' + tim, kode: kode + '-PNY.001', penyulang: 'P', ts, inputOleh: '',
        eksekusi: [{ id: 'e' + tim, kode: kode + '-PNY.001-EKS.001', ts, secId: 's', secNama: 'S', nomorTiang: '', kTiang: null,
          kKerja: null, d: 0, jenis: { nama: 'Rabas', jenis_id: 'j' }, fotoId: {}, inputOleh: '', kodeWo: '' }] }] };
  };
  const r = {};
  Object.defineProperty(r, 'headerV2', { value: [mk('01', '2026-10-01', 'R01-16130261001001'), mk('02', '2026-09-01', 'R02-16130260901001')] });
  const a = g.rencanaMigrasi_(r, { ulpNama: 'Toboali', sekarang: new Date() });
  for (const j of ['header', 'realisasi', 'eksekusi']) {
    const t = Array.from(a[j], (o) => new Date(o.Timestamp ?? o.TimeStamp).getTime());
    assert.deepStrictEqual(t, [...t].sort((x, y) => x - y), j);
    assert.ok(a[j].every((o) => !('_ms' in o)), j + ' _ms dibuang');
  }
  assert.deepStrictEqual(Array.from(a.eksekusi, (o) => o['Kode Eksekusi'].slice(0, 3)), ['R02', 'R01']);
});

// ---------- v0.62.4: HP dikenal kebal kunci akun (keputusan kvlar 7 Okt 2026) ----------
const INS_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INS_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PW = 'Rahasia-Toboali-2026';
const UNAME = '16130.uji.row01';

test('v0.62.4: penyerang tidak bisa mengunci petugas di HP-nya sendiri; HP asing tetap terkunci', () => {
  const { gl, sheets } = konteksLogin();
  const coba = (p, installId) => kodeError(() => gl.login_(null, { username: UNAME, password: p, ...(installId ? { installId } : {}) }, 'MOBILE'));
  assert.ok(gl.login_(null, { username: UNAME, password: PW, installId: INS_A }, 'MOBILE').token, 'HP A pernah login');
  // penyerang: web (tanpa installId) + ganti-ganti installId acak, semua satu ember
  for (let i = 0; i < 3; i++) assert.strictEqual(coba('salah-salah-salah'), 'LOGIN_GAGAL');
  for (let i = 0; i < 9; i++) assert.match(coba('salah-salah-salah', crypto.randomUUID()), /LOGIN_GAGAL|LOGIN_DIBATASI/);
  const A = sheets.a.auth_Password.data;
  assert.ok(A[1][6], 'akun terkunci untuk HP asing');
  assert.strictEqual(coba(PW, crypto.randomUUID()), 'LOGIN_DIBATASI', 'HP asing: password benar pun ditolak');
  assert.strictEqual(coba(PW), 'LOGIN_DIBATASI', 'web juga');
  // petugas di HP A tetap masuk, dan kunci untuk HP asing tidak ikut dibuka
  const ok = gl.login_(null, { username: UNAME, password: PW, installId: INS_A }, 'MOBILE');
  assert.ok(ok.token, 'HP dikenal tetap bisa login');
  assert.ok(A[1][6], 'kunci akun tetap ada');
  assert.match(coba(PW, crypto.randomUUID()), /LOGIN_GAGAL|LOGIN_DIBATASI/, 'HP asing masih ditolak');
});

test('v0.62.4: HP dikenal punya jatah 5x sendiri, tanpa lock & tanpa gagal_login; HP lain aman; ADMIN_bukaKunciLogin', () => {
  const { gl, sheets } = konteksLogin();
  const masuk = (installId, p = PW) => gl.login_(null, { username: UNAME, password: p, installId }, 'MOBILE');
  assert.ok(masuk(INS_A).token); assert.ok(masuk(INS_B).token);
  let lock = 0;
  gl.LockService = { getScriptLock: () => ({ tryLock: () => { lock++; return true; }, releaseLock: () => {} }) };
  for (let i = 0; i < 5; i++) assert.strictEqual(kodeError(() => masuk(INS_A, 'salah-salah-salah')), 'LOGIN_GAGAL');
  assert.strictEqual(lock, 0, 'gagal dari HP dikenal tidak ambil ScriptLock');
  assert.strictEqual(sheets.a.auth_Password.data[1][5], 0, 'gagal_login akun tidak naik');
  assert.strictEqual(kodeError(() => masuk(INS_A)), 'LOGIN_DIBATASI', 'HP A dibatasi');
  assert.ok(masuk(INS_B).token, 'HP B (dikenal juga) tidak terdampak');
  assert.ok(gl.login_(null, { username: UNAME, password: PW }, 'MOBILE').token, 'akun tidak terkunci untuk web');
  gl.PropertiesService.getScriptProperties().setProperty('BUKA_USERNAME', UNAME);
  gl.ADMIN_bukaKunciLogin();
  assert.ok(masuk(INS_A).token, 'dibuka admin');
});

test('v0.62.4: HP dicabut admin / logout kembali jadi HP asing; indeks yang telat tetap dicek ke sheet', () => {
  const kunciAkun = (gl) => { for (let i = 0; i < 5; i++) kodeError(() => gl.login_(null, { username: UNAME, password: 'salah-salah-salah' }, 'MOBILE')); };
  // ADMIN_cabutSesi
  let k = konteksLogin();
  assert.ok(k.gl.login_(null, { username: UNAME, password: PW, installId: INS_A }, 'MOBILE').token);
  k.gl.PropertiesService.getScriptProperties().setProperty('CABUT_USERNAME', UNAME);
  k.gl.ADMIN_cabutSesi();
  kunciAkun(k.gl);
  assert.strictEqual(kodeError(() => k.gl.login_(null, { username: UNAME, password: PW, installId: INS_A }, 'MOBILE')), 'LOGIN_GAGAL', 'dicabut admin = ikut kunci akun');
  // logout
  k = konteksLogin();
  const r = k.gl.login_(null, { username: UNAME, password: PW, installId: INS_A }, 'MOBILE');
  k.gl.logout_(k.gl.sesiDariToken_(r.token), {}, 'MOBILE');
  kunciAkun(k.gl);
  assert.strictEqual(kodeError(() => k.gl.login_(null, { username: UNAME, password: PW, installId: INS_A }, 'MOBILE')), 'LOGIN_GAGAL', 'sesudah logout = HP asing');
  // edit manual dicabut_pada tanpa ADMIN_bersihkanCache: indeks masih bilang dikenal, sheet tidak
  k = konteksLogin();
  k.gl.login_(null, { username: UNAME, password: PW, installId: INS_A }, 'MOBILE');
  const P = k.sheets.a.auth_Perangkat.data;
  P[P.length - 1][P[0].indexOf('dicabut_pada')] = new Date().toISOString();
  kunciAkun(k.gl);
  assert.strictEqual(kodeError(() => k.gl.login_(null, { username: UNAME, password: PW, installId: INS_A }, 'MOBILE')), 'LOGIN_GAGAL', 'indeks telat tidak memberi kebal');
});

test('v0.62.4: spam installId acak membangun ulang indeks HP dikenal maks 1x per menit', () => {
  const { gl, log } = konteksLogin();
  gl.login_(null, { username: UNAME, password: PW, installId: INS_A }, 'MOBILE');
  log.length = 0;
  for (let i = 0; i < 20; i++) kodeError(() => gl.login_(null, { username: '16130.tebak' + i, password: 'x-x-x-x-x-x', installId: crypto.randomUUID() }, 'MOBILE'));
  assert.ok(log.filter((x) => x === 'BACA_PENUH:auth_Perangkat').length <= 1, 'auth_Perangkat tidak dibaca tiap percobaan');
  assert.strictEqual(gl.pasanganPerangkat_(' 16130.UJI.row01 ', INS_A.toUpperCase()), gl.pasanganPerangkat_(UNAME, INS_A), 'normalisasi');
});

test('v0.62.4: syncRow / uploadFotoRow / getKodeRow hanya PETUGAS tim ROW (admin bertim ROW ditolak)', () => {
  for (const role of ['ADMIN', 'ADMIN_ES', 'SUPER']) {
    const s = { userId: 'u', role, jenisTim: 'ROW', timId: 't1' };
    assert.strictEqual(kodeError(() => g.syncRow_(s, { operasi: [{}] }, 'MOBILE')), 'AKSES_DITOLAK', 'syncRow ' + role);
    assert.strictEqual(kodeError(() => g.getKodeRow_(s, {})), 'AKSES_DITOLAK', 'getKodeRow ' + role);
    assert.strictEqual(kodeError(() => g.wajibPetugasRow_(s)), 'AKSES_DITOLAK', role);
  }
  assert.strictEqual(kodeError(() => g.wajibPetugasRow_({ role: 'PETUGAS', jenisTim: 'YANDAL', timId: 't' })), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => g.wajibPetugasRow_({ role: 'PETUGAS', jenisTim: 'ROW', timId: '' })), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => g.wajibPetugasRow_({ role: 'PETUGAS', jenisTim: 'ROW', timId: 't' })), null);
  const foto = { fotoId: U(), eksekusiId: U(), slot: 'SEBELUM', sumberFoto: 'KAMERA', mime: 'image/jpeg', sha256: 'a'.repeat(64), ukuranByte: 3, data: 'AAAA' };
  assert.strictEqual(kodeError(() => g.uploadFotoRow_({ userId: 'u', role: 'ADMIN', jenisTim: 'ROW', timId: 't1' }, foto, 'MOBILE')), 'AKSES_DITOLAK', 'uploadFotoRow');
});

test('v0.62.4: versi app di Pengaturan = pubspec; tidak ada string >= 40 karakter (cek CI)', () => {
  const fs = require('fs'), path = require('path');
  const akar = path.join(__dirname, '..');
  const pub = /^version:\s*([0-9.]+)\+/m.exec(fs.readFileSync(path.join(akar, 'mobile/pubspec.yaml'), 'utf8'))[1];
  const versi = /versiApp = '([0-9.]+)'/.exec(fs.readFileSync(path.join(akar, 'mobile/lib/core/versi.dart'), 'utf8'))[1];
  assert.strictEqual(versi, pub);
  // v0.81.0: versi backend = versi app (notifikasi update membandingkan keduanya)
  assert.strictEqual(buatKonteks(PROPS).VERSI_BACKEND_, pub, 'VERSI_BACKEND_ (09_Versi.js) wajib sama dengan pubspec');
  const panjang = [];
  const jalan = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) jalan(p);
      else if (/\.(js|dart|json)$/.test(f)) fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
        if (/[0-9A-Za-z_-]{40,}/.test(l)) panjang.push(p.slice(akar.length) + ':' + (i + 1));
      });
    }
  };
  jalan(path.join(akar, 'backend/src'));
  jalan(path.join(akar, 'mobile/lib'));
  assert.deepStrictEqual(panjang, [], 'baris yang akan ditandai CI');
});

// ---------- v0.62.5: review ulang 7 Okt 2026 ----------
test('v0.62.5: pastikanPemilik_ wajib active user; effective user pemilik (web anonim) TIDAK cukup', () => {
  const gp = buatKonteks(PROPS);
  gp.Session = { getActiveUser: () => ({ getEmail: () => '' }), getEffectiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  assert.strictEqual(kodeError(() => gp.pastikanPemilik_()), 'KHUSUS_PEMILIK', 'anonim di web app execute-as-me');
  gp.Session = { getActiveUser: () => ({ getEmail: () => 'lain@y.z' }), getEffectiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  assert.strictEqual(kodeError(() => gp.pastikanPemilik_()), 'KHUSUS_PEMILIK', 'editor lain');
  gp.Session = { getActiveUser: () => ({ getEmail: () => ' X@Y.Z ' }) };
  assert.strictEqual(kodeError(() => gp.pastikanPemilik_()), null, 'pemilik');
  assert.ok(!/getEffectiveUser\(\)/.test(gp.pastikanPemilik_.toString()), 'fallback tidak kembali');
});

test('v0.62.5: foto yang mewarisi akses link dikunci private; tidak bisa dikunci = file dibuang & upload ditolak', () => {
  const x = siapkanFoto();
  x.dr.atur.akses = 'ANYONE_WITH_LINK';
  assert.strictEqual(x.kirim('SEBELUM').status, 'OK');
  const f1 = x.dr.semuaFile[x.dr.dibuat[x.dr.dibuat.length - 1]];
  assert.strictEqual(f1.getSharingAccess(), 'PRIVATE', 'dikunci saat upload');
  x.dr.atur.bisaDikunci = false;
  const barisAwal = x.sheets.r.row_Foto.data.length;
  assert.strictEqual(kodeError(() => x.kirim('PEKERJAAN')), 'FOTO_TIDAK_PRIVAT');
  const f2 = x.dr.semuaFile[x.dr.dibuat[x.dr.dibuat.length - 1]];
  assert.strictEqual(f2.dibuang, true, 'file baru dibuang');
  assert.strictEqual(x.sheets.r.row_Foto.data.length, barisAwal, 'row_Foto tidak ditulis');
});

test('v0.62.5: rpc menolak payload > 4 MB seperti doPost', () => {
  const gp = buatKonteks(PROPS);
  assert.strictEqual(gp.rpc({ action: 'ping', data: { x: 'a'.repeat(4 * 1024 * 1024 + 10) } }).kode, 'PAYLOAD_TERLALU_BESAR');
  assert.strictEqual(gp.rpc({ action: 'ping' }).ok, true);
});

test('v0.62.6: indeks token / HP dikenal yang sedang dibangun jalan lain tidak dibangun ulang bersamaan', () => {
  const gt = buatKonteks(PROPS);
  let baca = 0;
  gt.tabel_ = (_p, nama) => { if (nama === 'auth_Perangkat') baca++; return { rows: [] }; };
  kodeError(() => gt.sesiDariToken_('d'.repeat(64)));   // indeks pertama
  const c = gt.CacheService.getScriptCache();
  const x = JSON.parse(c.get(gt.INDEKS_TOKEN_KUNCI_)); x.t -= 61000; c.put(gt.INDEKS_TOKEN_KUNCI_, JSON.stringify(x));
  c.put(gt.INDEKS_TOKEN_KUNCI_ + ':bangun', '1');         // jalan lain sedang membangun
  const sebelum = baca;
  assert.strictEqual(kodeError(() => gt.sesiDariToken_('e'.repeat(64))), 'TERLALU_SERING');
  assert.strictEqual(baca, sebelum, 'tidak ikut membaca auth_Perangkat');
  c.remove(gt.INDEKS_TOKEN_KUNCI_ + ':bangun');
  kodeError(() => gt.sesiDariToken_('e'.repeat(64)));
  assert.strictEqual(baca, sebelum + 1, 'penanda selesai = boleh membangun');
  assert.strictEqual(c.get(gt.INDEKS_TOKEN_KUNCI_ + ':bangun'), null, 'penanda dihapus setelah selesai');
});

test('v0.62.6: migrasi foto tidak mengisi slot yang sudah diisi HP selama salin berjalan; foto_lengkap dari bacaan segar', () => {
  const x = siapkanMigFoto();
  const asli = x.g.tabel_;
  let dalamLock = false;
  const lock = x.g.denganLock_;
  x.g.denganLock_ = (fn, t) => lock(() => { dalamLock = true; try { return fn(); } finally { dalamLock = false; } }, t);
  x.g.tabel_ = (id, nama) => (nama === 'row_Foto' && dalamLock
    ? { rows: [{ foto_id: 'hp1', eksekusi_id: asli(id, 'row_Eksekusi').rows[0].eksekusi_id, slot: 'SEBELUM', status: 'AKTIF' }], header: [] }
    : asli(id, nama));
  x.g.ADMIN_migrasiFoto();
  assert.deepStrictEqual(x.ditulis.rowFoto.map((r) => r[2]), ['PEKERJAAN', 'SESUDAH'], 'slot SEBELUM milik HP tidak ditimpa');
  assert.ok(!('Foto Sebelum' in x.ditulis.eks[0]), 'nama/URL foto HP tidak ditimpa');
  assert.strictEqual(x.ditulis.eks[0].foto_lengkap, true, 'lengkap dihitung dari bacaan segar (HP + 2 migrasi)');
  assert.match(x.ditulis.mig[0].pesan, /SLOT_SUDAH_TERISI/);
  const tujuan = Object.values(x.folders).find((f) => f.nama === 'R01-16130261003001-PNY.001-EKS.001');
  assert.deepStrictEqual(Object.keys(tujuan.file).sort(), ['foto1.jpg', 'foto2.jpg'], 'salinan slot SEBELUM dibuang');
});

test('v0.62.6: cache header ROW ikut SESI_EPOCH (ADMIN_bersihkanCache memaksa cek ulang)', () => {
  assert.match(g.headerRowTerverifikasi_.toString(), /SESI_EPOCH/);
});

test('v0.62.7: simpanLaporan tanpa c4a ditolak (dulu = semua C4A jadi BATAL diam-diam)', () => {
  const x = siapkanUp3();
  assert.throws(() => x.simpanUiw(x.admin, { tanggal: x.hariIni, revision: 0, cuaca: 'Cerah' }), /FIELD_WAJIB/);
  assert.throws(() => x.simpanUp3(x.admin, { tanggal: x.hariIni, revision: 0 }), /FIELD_WAJIB/);
  assert.throws(() => x.simpanUp3(x.admin, { tanggal: x.hariIni, revision: 0, c4a: 'x' }), /FIELD_WAJIB/);
});

test('v0.62.7: upload foto yang gagal di tengah dipulihkan saat dikirim ulang (bukan cuma DUPLIKAT)', () => {
  const x = siapkanFoto();
  x.kirim('SEBELUM'); x.kirim('PEKERJAAN');
  const asli = x.g.tulisSync_;
  x.g.tulisSync_ = () => { throw new Error('Sheets error sementara'); };
  const id = U();
  assert.throws(() => x.kirim('SESUDAH', undefined, id));
  x.g.tulisSync_ = asli;
  assert.notStrictEqual(kolom(x, 'row_Eksekusi', 1, 'foto_lengkap'), true, 'sebelum dipulihkan masih belum lengkap');
  const r = x.kirim('SESUDAH', undefined, id);
  assert.deepStrictEqual([r.status, r.fotoLengkap], ['DUPLIKAT', true]);
  assert.strictEqual(kolom(x, 'row_Eksekusi', 1, 'foto_lengkap'), true, 'kolom eksekusi dipulihkan');
  assert.strictEqual(kolom(x, 'row_Eksekusi', 1, 'Foto Sesudah'), x.kodeH + '-PNY.001-EKS.001_SESUDAH.jpg', 'v0.64.4: nama format baru');
  assert.strictEqual(kolom(x, 'row_Realisasi', 1, 'Sedang'), 1, 'hitungan realisasi ikut');
  // tim lain tidak bisa memicu pemulihan / tulis
  const lain = { ...x.sesi, timId: U() };
  const r2 = JSON.parse(JSON.stringify(x.g.uploadFotoRow_(lain, { fotoId: id, eksekusiId: x.eId, slot: 'SESUDAH', sumberFoto: 'GALERI',
    mime: 'image/jpeg', sha256: crypto.createHash('sha256').update(jpeg(1600, 1200)).digest('hex'), ukuranByte: jpeg(1600, 1200).length,
    data: jpeg(1600, 1200).toString('base64') }, 'MOBILE')));
  assert.strictEqual(r2.status, 'DUPLIKAT');
});

test('v0.62.7: migrasi foto menolak sumber bukan gambar (GAGAL, tidak ikut foto_lengkap)', () => {
  const x = siapkanMigFoto();
  const get = x.g.Drive.Files.get;
  x.g.Drive.Files.get = (id, o) => ({ ...get(id, o), mimeType: 'application/pdf' });
  x.g.ADMIN_migrasiFoto();
  assert.deepStrictEqual(x.ditulis.mig.map((q) => q.status), ['GAGAL', 'GAGAL', 'GAGAL']);
  assert.match(x.ditulis.mig[0].pesan, /BUKAN_GAMBAR/);
  assert.strictEqual(x.ditulis.rowFoto.length, 0);
});

// ---------- v0.62.9: Laporan UP3 / UIW simpan tanpa setengah jadi ----------
/** Gagalkan panggilan tulis berikutnya ke sheet nama (setValues / appendRow) satu kali, seperti "Service Spreadsheets failed". */
function gagalSekali(x, nama) {
  const sh = x.sheets.l[nama], asliRange = sh.getRange, asliAppend = sh.appendRow;
  let aktif = true;
  const lempar = () => { aktif = false; throw new Error('Service Spreadsheets failed (uji)'); };
  sh.getRange = (...a) => {
    const r = asliRange(...a), sv = r.setValues, s1 = r.setValue;
    r.setValues = (v) => (aktif ? lempar() : sv(v));
    r.setValue = (v) => (aktif ? lempar() : s1(v));
    return r;
  };
  sh.appendRow = (v) => (aktif ? lempar() : asliAppend(v));
}
const isiSheet = (x, nama, kolom) => x.sheets.l[nama].data.slice(1).map((b) => kolom.map((k) => b[x.lapSkema[nama].indexOf(k)]));
const mundurkan = (x, nama, baris) => { x.sheets.l[nama].data[baris][x.lapSkema[nama].indexOf('Timestamp Update')] = new Date(Date.now() - 6e4).toISOString(); };

test('v0.62.9: Laporan UP3 gagal di tengah (C4A tertulis, baris harian belum) -> revision tetap, tertunda, ulang = sama dengan simpan bersih', () => {
  const a = U(), b = U(), c = U();
  const it = (id, p, kms) => ({ id, penyulang: p, realisasiKms: kms, temuan: 'Pohon', tindakLanjut: 'Rabas', eksekusi: 'ROW 01' });
  const awal = [it(a, 'TB-01', 1), it(b, 'TB-02', 2)], kedua = [it(a, 'TB-01', 3.5), it(c, 'TB-02', 1.25)];
  const kolom = ['Penyulang', 'Realisasi kmS', 'c4a_id', 'status', 'revision'];

  const bersih = siapkanUp3();
  bersih.simpanUp3(bersih.admin, { tanggal: bersih.hariIni, revision: 0, c4a: awal });
  const sB = bersih.simpanUp3(bersih.admin, { tanggal: bersih.hariIni, revision: 1, c4a: kedua });

  const x = siapkanUp3();
  x.simpanUp3(x.admin, { tanggal: x.hariIni, revision: 0, c4a: awal });
  mundurkan(x, 'lap_Harian_UP3', 1);
  gagalSekali(x, 'lap_Harian_UP3');
  assert.throws(() => x.simpanUp3(x.admin, { tanggal: x.hariIni, revision: 1, c4a: kedua }), /Service Spreadsheets failed/);
  assert.strictEqual(x.lapKolom('lap_Harian_UP3', 1, 'revision'), 1, 'revision belum naik');
  const g1 = x.getUp3(x.admin);
  assert.deepStrictEqual([g1.revision, g1.tertunda], [1, true]);
  assert.deepStrictEqual(g1.c4a.map((q) => q.id).sort(), [a, c].sort(), 'C4A lengkap (satu panggilan tulis), bukan setengah');
  const s = x.simpanUp3(x.admin, { tanggal: x.hariIni, revision: 1, c4a: kedua });   // ulang payload + revision yang sama
  assert.deepStrictEqual([s.revision, s.tertunda], [2, false]);
  assert.strictEqual(x.getUp3(x.admin).tertunda, false);
  assert.deepStrictEqual(isiSheet(x, 'lap_C4A_UP3', kolom), isiSheet(bersih, 'lap_C4A_UP3', kolom), 'isi C4A identik dengan simpan bersih');
  assert.deepStrictEqual([s.waText, s.c4a], [sB.waText, sB.c4a]);
  assert.strictEqual(x.lapKolom('lap_Harian_UP3', 1, 'Laporan UP3'), sB.waText);
});

test('v0.62.9: gagal saat menulis C4A = tidak ada yang tertulis; simpan pertama gagal di baris harian = lap_id sama saat diulang', () => {
  const x = siapkanUp3();
  const c4a = [{ id: U(), sectionId: x.sekA, jumlahTiang: 10, temuanPeralatan: 1, temuanRow: 0, eksekusi: 0 }];
  gagalSekali(x, 'lap_C4A_UIW');
  assert.throws(() => x.simpanUiw(x.admin, { tanggal: x.hariIni, revision: 0, cuaca: 'Cerah', c4a }), /Service Spreadsheets failed/);
  for (const n of Object.keys(x.sheets.l)) assert.strictEqual(x.sheets.l[n].data.length, 1, 'tidak ada yang tertulis: ' + n);

  gagalSekali(x, 'lap_Harian_UIW');
  assert.throws(() => x.simpanUiw(x.admin, { tanggal: x.hariIni, revision: 0, cuaca: 'Cerah', c4a }), /Service Spreadsheets failed/);
  assert.strictEqual(x.sheets.l.lap_C4A_UIW.data.length, 2, 'C4A sempat tertulis');
  const g1 = x.getUiw(x.admin);
  assert.deepStrictEqual([g1.laporan, g1.revision, g1.tertunda, g1.c4a.length], [null, 0, true, 1], 'belum final, tapi tidak hilang');
  const s = x.simpanUiw(x.admin, { tanggal: x.hariIni, revision: 0, cuaca: 'Cerah', c4a });   // dulu: ID_GANDA (lap_id acak baru)
  assert.deepStrictEqual([s.revision, s.tertunda, s.cuaca, s.c4a.length], [1, false, 'Cerah', 1]);
  assert.strictEqual(x.sheets.l.lap_C4A_UIW.data.length, 2, 'tidak dobel');
  assert.strictEqual(x.lapKolom('lap_C4A_UIW', 1, 'lap_id'), x.lapKolom('lap_Harian_UIW', 1, 'lap_id'));
  assert.strictEqual(x.lapKolom('lap_Harian_UIW', 1, 'lap_id'), 'LAP-UIW-' + x.hariIni);
  assert.strictEqual(x.getUiw(x.admin).tertunda, false);
});

test('v0.62.9: lap_id baris harian deterministik (pemicu & simpan), C4A satu panggilan tulis, baris harian satu panggilan tulis', () => {
  const x = siapkanUp3();
  x.g.buatBarisHarian_(x.hariIni);
  assert.deepStrictEqual([x.lapKolom('lap_Harian_UP3', 1, 'lap_id'), x.lapKolom('lap_Harian_UIW', 1, 'lap_id')],
    ['LAP-UP3-' + x.hariIni, 'LAP-UIW-' + x.hariIni]);
  const t = { rows: [{ lap_id: 'LAP-UP3-2026-10-07', Tanggal: '2026-10-07', status: 'BATAL' }] };
  assert.strictEqual(x.g.lapIdBaru_(t, 'UP3', '2026-10-07'), 'LAP-UP3-2026-10-07-2', 'tanggal yang pernah punya baris');
  const it = (id, kms) => ({ id, penyulang: 'TB-01', realisasiKms: kms });
  const a = U();
  x.simpanUp3(x.admin, { tanggal: x.hariIni, revision: 1, c4a: [it(a, 1)] });
  x.log.length = 0;
  x.simpanUp3(x.admin, { tanggal: x.hariIni, revision: 2, c4a: [{ id: U(), penyulang: 'TB-02', realisasiKms: 2 }] });   // a BATAL + 1 baru
  assert.strictEqual(x.log.filter((q) => q === 'TULIS:lap_C4A_UP3').length, 1, 'C4A: satu panggilan tulis');
  assert.strictEqual(x.log.filter((q) => q === 'TULIS:lap_Harian_UP3').length, 1, 'baris harian + revision: satu panggilan tulis');
  const urut = x.log.filter((q) => q.startsWith('TULIS:lap_'));
  assert.deepStrictEqual(urut, ['TULIS:lap_C4A_UP3', 'TULIS:lap_Harian_UP3'], 'C4A dulu, baris harian terakhir');
  assert.deepStrictEqual([x.lapKolom('lap_C4A_UP3', 1, 'status'), x.lapKolom('lap_C4A_UP3', 1, 'revision'), x.lapKolom('lap_Harian_UP3', 1, 'revision')],
    ['BATAL', 2, 3]);
});

test('v0.62.9: tulisBlok_ menolak di luar lock, kolom terkunci, dan baris yang bergeser', () => {
  const x = siapkanUp3();
  x.simpanUp3(x.admin, { tanggal: x.hariIni, revision: 0, c4a: [{ id: U(), penyulang: 'TB-01', realisasiKms: 1 }] });
  const t = () => x.g.tabel_('LAPORAN_SHEET_ID', 'lap_C4A_UP3');
  assert.strictEqual(kodeError(() => x.g.tulisBlok_(t(), [], [{}])), 'HARUS_DALAM_LOCK');
  x.g.denganLock_(() => {
    const tb = t();
    assert.strictEqual(kodeError(() => x.g.tulisBlok_(tb, [{ r: tb.rows[0], u: { revision: 9 } }], [])), 'KOLOM_TERKUNCI');
    assert.strictEqual(kodeError(() => x.g.tulisBlok_(tb, [{ r: tb.rows[0], u: { lap_id: 'x' } }], [])), 'KOLOM_TERKUNCI');
    const palsu = { ...tb.rows[0], c4a_id: 'lain' };
    assert.strictEqual(kodeError(() => x.g.tulisBlok_(tb, [{ r: palsu, u: { Temuan: 'x' } }], [])), 'DATA_BERUBAH');
  });
});

// ---------- v0.63.0: Yandal (login 2 tahap, shift, pindah tim petugas) ----------
function siapkanYandal() {
  const gy = buatKonteks({ ...PROPS, PBKDF2_ITERASI: '1000', YANDAL_SHEET_ID: 'y' });
  const log = [];
  const buat = sheetPalsu(log);
  const sk = gy.skemaHeader_();
  const salt = Buffer.from('0123456789abcdef').toString('base64');
  const hash = gy.hashPassword_('Rahasia-Toboali-2026', salt, 1000);
  const tim = { t13: U(), t14: U(), t15: U(), t16: U(), t17: U(), row: U() };
  const user = { y13: U(), y14: U(), row: U(), admin: U() };
  const p = { a: U(), b: U(), c: U(), lama: U(), d: U() };
  const sheets = {
    m: {
      db_Users: buat('db_Users', [['user_id', 'username', 'nama', 'role', 'tim_id', 'aktif'],
        [user.y13, '16130.yandal13', 'YANDAL 13', 'PETUGAS', tim.t13, true], [user.y14, '16130.yandal14', 'YANDAL 14', 'PETUGAS', tim.t14, true],
        [user.row, '16130.row01', 'ROW 01', 'PETUGAS', tim.row, true], [user.admin, '16130.admin', 'Admin', 'ADMIN', '', true]]),
      db_Tim: buat('db_Tim', [['tim_id', 'kode', 'nama', 'jenis', 'aktif'],
        [tim.t13, '13', 'YANDAL 13', 'YANDAL', true], [tim.t14, '14', 'YANDAL 14', 'YANDAL', true], [tim.t15, '15', 'YANDAL 15', 'YANDAL', true],
        [tim.t16, '16', 'YANDAL 16', 'YANDAL', true], [tim.t17, '17', 'YANDAL 17', 'YANDAL', true], [tim.row, '01', 'ROW 01', 'ROW', true]]),
      db_Menu: buat('db_Menu', [['menu_kode', 'nama', 'platform', 'khusus_super', 'urutan', 'aktif'],
        ['ROW_EKSEKUSI', 'Eksekusi ROW', 'MOBILE', false, 1, true], ['OPS_PETUGAS_YANDAL', 'Pindah Tim Petugas Yandal', 'MOBILE', false, 31, true]]),
      db_Akses: buat('db_Akses', [['role', 'jenis_tim', 'menu_kode', 'aksi'], ['PETUGAS', 'ROW', 'ROW_EKSEKUSI', 'UBAH'], ['ADMIN', '*', '*', 'UBAH']]),
      db_Petugas: buat('db_Petugas', [sk.MASTER_SHEET_ID.db_Petugas.slice(),
        [p.b, 'Budi', tim.t13, true, 1, '', ''], [p.a, 'Andi', tim.t13, true, 1, '', ''], [p.lama, 'Lama', tim.t13, false, 1, '', ''],
        [p.c, 'Candra', tim.t14, true, 1, '', ''], [p.d, 'Dedi', tim.t14, true, 1, '', '']]),
    },
    a: {
      auth_Password: buat('auth_Password', [['user_id', 'password_hash', 'salt', 'hash_versi', 'password_diubah_pada', 'gagal_login', 'terkunci_sampai'],
        ...Object.values(user).map((u) => [u, hash, salt, 'pbkdf2-sha256:1000', '', 0, ''])]),
      auth_Perangkat: buat('auth_Perangkat', [['device_id', 'user_id', 'install_id', 'token_hash', 'platform', 'dibuat_pada', 'terakhir_dipakai', 'kedaluwarsa_pada', 'dicabut_pada']]),
      log_Audit: buat('log_Audit', [['waktu', 'user_id', 'username', 'role', 'aksi', 'target', 'detail', 'platform', 'device_id']]),
    },
    y: { yan_Shift: buat('yan_Shift', [sk.YANDAL_SHEET_ID.yan_Shift.slice()]), yan_Login: buat('yan_Login', [sk.YANDAL_SHEET_ID.yan_Login.slice()]),
         yan_P0: buat('yan_P0', [sk.YANDAL_SHEET_ID.yan_P0.slice()]), yan_Switching: buat('yan_Switching', [sk.YANDAL_SHEET_ID.yan_Switching.slice()]),
         yan_Gardu: buat('yan_Gardu', [sk.YANDAL_SHEET_ID.yan_Gardu.slice()]) },
  };
  gy.SpreadsheetApp = { openById: (id) => ({ getSheetByName: (n) => sheets[id][n], insertSheet: (n) => { sheets[id][n] = buat(n, [[]]); return sheets[id][n]; } }) };
  // jam palsu: 2 hari ke depan (token tetap "belum kedaluwarsa" terhadap jam asli)
  const hari = gy.tglJakarta_(new Date(Date.now() + 2 * 864e5));
  const jam = { ms: Date.parse(hari + 'T10:00:00+07:00') };
  jam.atur = (hhmm, tgl = hari) => { jam.ms = Date.parse(tgl + 'T' + hhmm + '+07:00'); };
  gy.sekarangMsYandal_ = () => jam.ms;
  const ins1 = '11111111-1111-4111-8111-111111111111', ins2 = '22222222-2222-4222-8222-222222222222';
  const j = (v) => JSON.parse(JSON.stringify(v));
  const login = (username, installId = ins1) => j(gy.login_(null, { username, password: 'Rahasia-Toboali-2026', installId, perangkat: 'HP Uji' }, 'MOBILE'));
  const mulai = (tiket, petugasIds, installId = ins1) => j(gy.mulaiShiftYandal_(null, { tiket, petugasIds, installId }, 'MOBILE'));
  const kol = (n, baris, k) => sheets.y[n].data[baris][sk.YANDAL_SHEET_ID[n].indexOf(k)];
  const kolP = (baris, k) => sheets.m.db_Petugas.data[baris][sk.MASTER_SHEET_ID.db_Petugas.indexOf(k)];
  const cache = gy.CacheService.getScriptCache();
  const sesiAdmin = { userId: user.admin, username: '16130.admin', nama: 'Admin', role: 'ADMIN', timId: '', jenisTim: '' };
  return { g: gy, log, sheets, tim, user, p, hari, jam, ins1, ins2, login, mulai, kol, kolP, cache, sesiAdmin, j };
}

test('v0.63.0: shift Yandal (WIB): 08-16 / 16-00 / 00-08, menit peralihan :59, shift 3 = tanggal kemarin, kode v1', () => {
  const s = (iso) => { const x = g.shiftYandal_(Date.parse(iso)); return [x.no, x.tanggal, x.peralihan]; };
  assert.deepStrictEqual(s('2026-10-07T07:58:59+07:00'), [3, '2026-10-06', false]);
  assert.deepStrictEqual(s('2026-10-07T07:59:00+07:00'), [3, '2026-10-06', true]);
  assert.deepStrictEqual(s('2026-10-07T08:00:00+07:00'), [1, '2026-10-07', false]);
  assert.deepStrictEqual(s('2026-10-07T15:59:59+07:00'), [1, '2026-10-07', true]);
  assert.deepStrictEqual(s('2026-10-07T16:00:00+07:00'), [2, '2026-10-07', false]);
  assert.deepStrictEqual(s('2026-10-07T23:59:10+07:00'), [2, '2026-10-07', true]);
  assert.deepStrictEqual(s('2026-10-08T00:00:00+07:00'), [3, '2026-10-07', false]);
  const x = g.shiftYandal_(Date.parse('2026-10-07T10:00:00+07:00'));
  assert.strictEqual(new Date(x.sampai).toISOString(), '2026-10-07T08:59:00.000Z', 'shift 1 habis 15:59 WIB');
  assert.strictEqual(new Date(g.shiftYandal_(Date.parse('2026-10-08T03:00:00+07:00')).sampai).toISOString(), '2026-10-08T00:59:00.000Z');
  assert.strictEqual(new Date(g.shiftYandal_(Date.parse('2026-10-07T20:00:00+07:00')).sampai).toISOString(), '2026-10-07T16:59:00.000Z');
  assert.deepStrictEqual({ ...g.kodeShiftYandal_('13', '2026-10-07', 2) }, { header: 'Y13-16130261007002', shift: 'Y13-16130261007002-SHF2.001' });
});

test('v0.63.0: login YANDAL = tiket (tanpa token), daftar petugas tim sendiri yang aktif; akun ROW tetap token', () => {
  const x = siapkanYandal();
  const r = x.login('16130.yandal13');
  assert.strictEqual(r.tahap, 'PILIH_PETUGAS');
  assert.match(r.tiket, /^[0-9a-f]{64}$/);
  assert.strictEqual(r.token, undefined, 'belum ada token');
  assert.strictEqual(x.sheets.a.auth_Perangkat.data.length, 1, 'auth_Perangkat tidak ditulis di tahap 1');
  assert.deepStrictEqual(r.yandal.petugas.map((p) => p.nama), ['Andi', 'Budi'], 'tim sendiri, aktif, urut nama');
  assert.deepStrictEqual([r.yandal.tim.nama, r.yandal.shift.no, r.yandal.shift.tanggal, r.yandal.shift.jam, r.yandal.terpilih, r.yandal.maks],
    ['YANDAL 13', 1, x.hari, '08:00 - 16:00', [], 2]);
  assert.strictEqual(x.sheets.a.log_Audit.data.at(-1)[4], 'LOGIN_PILIH_PETUGAS');
  const row = x.login('16130.row01');
  assert.ok(/^[0-9a-f]{64}$/.test(row.token) && !row.tahap, 'akun ROW tidak terpengaruh');
});

test('v0.63.0: menit peralihan (07:59 / 15:59 / 23:59) login YANDAL ditolak, bukan dihitung salah password', () => {
  const x = siapkanYandal();
  for (const hhmm of ['07:59:00', '15:59:30', '23:59:59']) {
    x.jam.atur(hhmm);
    assert.strictEqual(kodeError(() => x.login('16130.yandal13')), 'SHIFT_PERALIHAN', hhmm);
  }
  x.jam.atur('16:00:00');
  assert.strictEqual(x.login('16130.yandal13').yandal.shift.no, 2, 'login lagi mulai 16:00');
  assert.strictEqual(x.sheets.a.auth_Password.data[1][5], 0, 'gagal_login tidak naik');
});

test('v0.63.0: mulai shift: 1-2 petugas, yan_Shift + yan_Login tercatat, token sampai 15:59, tiket sekali pakai, habis = SHIFT_BERAKHIR', () => {
  const x = siapkanYandal();
  x.jam.atur('08:05:00');
  const r1 = x.login('16130.yandal13');
  x.jam.atur('08:07:00');
  assert.strictEqual(kodeError(() => x.mulai(r1.tiket, [])), 'JUMLAH_PETUGAS');
  assert.strictEqual(kodeError(() => x.mulai(r1.tiket, [x.p.a, x.p.b, x.p.a])), 'JUMLAH_PETUGAS', 'maksimal 2');
  assert.strictEqual(kodeError(() => x.mulai(r1.tiket, [x.p.a, x.p.a])), 'ID_GANDA');
  assert.strictEqual(kodeError(() => x.mulai(r1.tiket, [x.p.c])), 'PETUGAS_TIDAK_VALID', 'petugas tim lain');
  assert.strictEqual(kodeError(() => x.mulai(r1.tiket, [x.p.lama])), 'PETUGAS_TIDAK_VALID', 'petugas nonaktif');
  assert.strictEqual(kodeError(() => x.mulai(r1.tiket, [x.p.a], x.ins2)), 'TIKET_TIDAK_VALID', 'HP lain');
  assert.strictEqual(kodeError(() => x.mulai('f'.repeat(64), [x.p.a])), 'TIKET_TIDAK_VALID');
  for (const n of ['yan_Shift', 'yan_Login']) assert.strictEqual(x.sheets.y[n].data.length, 1, 'yang ditolak tidak menulis ' + n);

  const s = x.mulai(r1.tiket, [x.p.b, x.p.a]);
  assert.match(s.token, /^[0-9a-f]{64}$/);
  assert.strictEqual(s.sesiSampai, new Date(Date.parse(x.hari + 'T15:59:00+07:00')).toISOString());
  assert.strictEqual(s.offlineSampai, s.sesiSampai, 'input offline juga berhenti di akhir shift');
  assert.deepStrictEqual(s.yandal.petugas.map((p) => p.nama), ['Budi', 'Andi'], 'urutan pilihan');
  assert.strictEqual(s.yandal.kodeShift, 'Y13-16130' + x.hari.slice(2).replace(/-/g, '') + '001-SHF1.001');
  assert.deepStrictEqual([x.kol('yan_Shift', 1, 'Tim'), x.kol('yan_Shift', 1, 'Shift'), x.kol('yan_Shift', 1, 'Petugas 1'), x.kol('yan_Shift', 1, 'Petugas 2'),
    x.kol('yan_Shift', 1, 'Tanggal'), x.kol('yan_Shift', 1, 'petugas_id_1'), x.kol('yan_Shift', 1, 'Jam Check-in'), x.kol('yan_Shift', 1, 'status')],
  ['YANDAL 13', 1, 'Budi', 'Andi', x.hari, x.p.b, x.hari + ' 08:07:00', 'AKTIF']);
  assert.deepStrictEqual([x.kol('yan_Login', 1, 'Waktu Login'), x.kol('yan_Login', 1, 'Waktu Masuk'), x.kol('yan_Login', 1, 'Perangkat'), x.kol('yan_Login', 1, 'device_id')],
    [new Date(Date.parse(x.hari + 'T08:05:00+07:00')).toISOString(), new Date(Date.parse(x.hari + 'T08:07:00+07:00')).toISOString(), 'HP Uji', s.profil.deviceId]);
  const perangkat = x.sheets.a.auth_Perangkat.data;
  assert.strictEqual(perangkat.length, 2);
  assert.strictEqual(s.syncSampai, new Date(Date.parse(x.hari + 'T15:59:00+07:00') + 24 * 3600e3).toISOString(), 'v0.63.4: mode sync 24 jam');
  assert.strictEqual(perangkat[1][7], s.syncSampai, 'kedaluwarsa_pada = akhir mode sync');
  assert.strictEqual(x.sheets.a.log_Audit.data.at(-1)[4], 'LOGIN');
  assert.strictEqual(kodeError(() => x.mulai(r1.tiket, [x.p.a])), 'TIKET_TIDAK_VALID', 'tiket sekali pakai');

  // token berlaku sampai 15:58:59, cekSesi tidak memperpanjang lewat akhir shift
  x.jam.atur('15:58:00');
  const c = x.j(x.g.proses_({ action: 'cekSesi', token: s.token }, 'MOBILE')).data;
  assert.strictEqual(c.sesiSampai, s.sesiSampai);
  assert.strictEqual(c.modeSync, false);
  assert.strictEqual(x.sheets.a.auth_Perangkat.data[1][7], s.syncSampai, 'perpanjangan dibatasi akhir mode sync');
  // v0.63.4: sesudah akhir shift = mode sync: hanya endpoint syncShift (cekSesi, logout), lainnya SHIFT_BERAKHIR
  x.jam.atur('15:59:00');
  assert.strictEqual(kodeError(() => x.g.proses_({ action: 'getMaster', token: s.token }, 'MOBILE')), 'SHIFT_BERAKHIR', 'dari cache sesi');
  const m = x.j(x.g.proses_({ action: 'cekSesi', token: s.token }, 'MOBILE')).data;
  assert.deepStrictEqual([m.modeSync, m.sesiSampai, m.syncSampai], [true, s.sesiSampai, s.syncSampai], 'cekSesi tetap jalan, tidak memperpanjang');
  x.cache.remove('sesi:' + x.g.sha256Hex_(s.token));
  x.jam.atur('16:30:00');
  assert.strictEqual(kodeError(() => x.g.proses_({ action: 'getMaster', token: s.token }, 'MOBILE')), 'SHIFT_BERAKHIR', 'dari sheet');
  assert.strictEqual(x.j(x.g.proses_({ action: 'cekSesi', token: s.token }, 'MOBILE')).data.modeSync, true);
  // lewat 24 jam: semua ditolak (cache maupun sheet)
  x.jam.ms = Date.parse(s.syncSampai);
  assert.strictEqual(kodeError(() => x.g.proses_({ action: 'cekSesi', token: s.token }, 'MOBILE')), 'SHIFT_BERAKHIR', 'mode sync habis (cache)');
  x.cache.remove('sesi:' + x.g.sha256Hex_(s.token));
  x.cache.remove('sesi-tolak:' + x.g.sha256Hex_(s.token));
  assert.strictEqual(kodeError(() => x.g.proses_({ action: 'logout', token: s.token }, 'MOBILE')), 'SHIFT_BERAKHIR', 'mode sync habis (sheet)');
});

test('v0.63.0: tiket dari shift sebelumnya ditolak; HP kedua di shift yang sama wajib crew yang sama', () => {
  const x = siapkanYandal();
  x.jam.atur('15:50:00');
  const lama = x.login('16130.yandal13');
  x.jam.atur('16:01:00');
  assert.strictEqual(kodeError(() => x.mulai(lama.tiket, [x.p.a])), 'SHIFT_BERAKHIR');
  const r1 = x.login('16130.yandal13');
  x.mulai(r1.tiket, [x.p.a]);
  const r2 = x.login('16130.yandal13', x.ins2);
  assert.deepStrictEqual(r2.yandal.terpilih, [x.p.a], 'HP kedua melihat crew yang sudah dipilih');
  assert.strictEqual(kodeError(() => x.mulai(r2.tiket, [x.p.a, x.p.b], x.ins2)), 'SHIFT_SUDAH_DIMULAI');
  const s2 = x.mulai(r2.tiket, [x.p.a], x.ins2);
  assert.ok(s2.token);
  assert.strictEqual(x.sheets.y.yan_Shift.data.length, 2, 'satu baris shift per tim per shift');
  assert.strictEqual(x.sheets.y.yan_Login.data.length, 3, 'setiap login tercatat');
  assert.strictEqual(x.kol('yan_Shift', 1, 'Shift'), 2);
  x.jam.atur('00:10:00', x.g.tglJakarta_(new Date(Date.parse(x.hari + 'T12:00:00+07:00') + 864e5)));
  const r3 = x.login('16130.yandal13');
  assert.deepStrictEqual([r3.yandal.shift.no, r3.yandal.shift.tanggal, r3.yandal.terpilih], [3, x.hari, []], 'shift 3 = tanggal operasional kemarin');
});

test('v0.63.0: pindah tim di tengah shift: petugas yang sedang bertugas tidak bisa dipilih tim lain di shift yang sama', () => {
  const x = siapkanYandal();
  const r1 = x.login('16130.yandal13');
  x.mulai(r1.tiket, [x.p.a]);
  const h = x.j(x.g.simpanPetugasYandal_(x.sesiAdmin, { ubah: [{ petugasId: x.p.a, revision: 1, timId: x.tim.t14 }] }, 'MOBILE'));
  assert.ok(h.petugas.find((p) => p.petugasId === x.p.a).bertugas, 'ditandai sedang bertugas');
  const r2 = x.login('16130.yandal14');
  const andi = r2.yandal.petugas.find((p) => p.petugasId === x.p.a);
  assert.deepStrictEqual([andi.nama, andi.sibuk], ['Andi', true]);
  assert.strictEqual(kodeError(() => x.mulai(r2.tiket, [x.p.a, x.p.c])), 'PETUGAS_SEDANG_BERTUGAS');
  x.mulai(r2.tiket, [x.p.c]);
  assert.strictEqual(x.kol('yan_Shift', 1, 'petugas_id_1'), x.p.a, 'shift tim 13 yang berjalan tidak berubah');
});

test('v0.63.3: yan_Shift mencatat jam kerja, jadwal, petugas 1/2, check-in, terlambat, jumlah login, rekap P0 awal 0', () => {
  const x = siapkanYandal();
  assert.strictEqual(x.g.skemaHeader_().YANDAL_SHEET_ID.yan_Shift.length, 41);
  x.jam.atur('16:20:00');
  const r1 = x.login('16130.yandal13');
  x.jam.atur('16:23:40');
  x.mulai(r1.tiket, [x.p.a]);
  const k = (n) => x.kol('yan_Shift', 1, n);
  assert.deepStrictEqual([k('Shift'), k('Jam Kerja'), k('Mulai Shift'), k('Selesai Shift'), k('Petugas 1'), k('Petugas 2'), k('Jumlah Petugas')],
    [2, '16:00 - 00:00', x.hari + ' 16:00', x.g.tglJakarta_(new Date(Date.parse(x.hari + 'T12:00:00+07:00') + 864e5)) + ' 00:00', 'Andi', '', 1]);
  assert.deepStrictEqual([k('Jam Check-in'), k('Terlambat (menit)'), k('Jumlah Login'), k('revision')], [x.hari + ' 16:23:40', 23, 1, 1]);
  for (const n of ['Jumlah P0', 'P0 Proses', 'P0 Selesai', 'P0 Menunggu Verifikasi', 'P0 Approved', 'P0 Rejected', 'Total Point',
    'Total Durasi (menit)', 'Jam Efektif', '% Efektif', 'Total Jarak (km)']) assert.strictEqual(k(n), 0, n);
  // HP kedua shift yang sama: baris tidak bertambah, Jumlah Login +1, Jam Check-in tetap
  x.jam.atur('17:00:00');
  x.mulai(x.login('16130.yandal13', x.ins2).tiket, [x.p.a], x.ins2);
  assert.strictEqual(x.sheets.y.yan_Shift.data.length, 2);
  assert.deepStrictEqual([k('Jumlah Login'), k('revision'), k('Jam Check-in'), k('Terlambat (menit)')], [2, 2, x.hari + ' 16:23:40', 23]);
  // shift 3: tanggal operasional kemarin, jadwal 00:00 - 08:00 tanggal berikutnya, tepat waktu = 0
  const besok = x.g.tglJakarta_(new Date(Date.parse(x.hari + 'T12:00:00+07:00') + 864e5));
  x.jam.atur('00:00:30', besok);
  x.mulai(x.login('16130.yandal14').tiket, [x.p.c, x.p.d]);
  const k2 = (n) => x.kol('yan_Shift', 2, n);
  assert.deepStrictEqual([k2('Tanggal'), k2('Shift'), k2('Mulai Shift'), k2('Selesai Shift'), k2('Jumlah Petugas'), k2('Terlambat (menit)')],
    [x.hari, 3, besok + ' 00:00', besok + ' 08:00', 2, 0]);
});

test('v0.63.3: ADMIN_perbaruiYanShift memindah data header lama tanpa hilang; header baru / tak dikenal tidak ditulis', () => {
  const x = siapkanYandal();
  const lama = x.g.YAN_SHIFT_HEADER_V630_.slice();
  const baris = lama.map(() => '');
  const isi = { No: 2, 'Kode Shift': 'Y13-X-SHF3.001', Tanggal: x.hari, Tim: 'YANDAL 13', Shift: 3, 'Jam Shift': '00:00 - 08:00',
    Petugas: 'Budi, Andi', 'Jumlah P0': 4, 'Login Pertama': new Date(Date.parse(x.hari + 'T00:00:00+07:00') + 864e5 + 15 * 60e3).toISOString(),
    shift_id: 'sh-1', tim_id: x.tim.t13, petugas_id_1: x.p.b, petugas_id_2: x.p.a, status: 'AKTIF', revision: 1 };
  Object.keys(isi).forEach((h) => { baris[lama.indexOf(h)] = isi[h]; });
  x.sheets.y.yan_Shift.data.length = 0;
  x.sheets.y.yan_Shift.data.push(lama, baris);
  const L = x.g.skemaHeader_().YANDAL_SHEET_ID.yan_Login;
  for (let i = 0; i < 3; i++) { const b = L.map(() => ''); b[L.indexOf('shift_id')] = 'sh-1'; x.sheets.y.yan_Login.data.push(b); }
  x.g.Session = { getEffectiveUser: () => ({ getEmail: () => 'x@y.z' }), getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  x.g.ADMIN_perbaruiYanShift();
  assert.deepStrictEqual(x.sheets.y.yan_Shift.data[0], x.g.YAN_SHIFT_HEADER_.slice());
  const k = (n) => x.kol('yan_Shift', 1, n);
  assert.deepStrictEqual([k('Kode Shift'), k('Petugas 1'), k('Petugas 2'), k('Jumlah Petugas'), k('Jam Kerja'), k('Jumlah P0'), k('P0 Approved'),
    k('Terlambat (menit)'), k('Jumlah Login'), k('shift_id'), k('petugas_id_2'), k('revision')],
  ['Y13-X-SHF3.001', 'Budi', 'Andi', 2, '00:00 - 08:00', 4, 0, 15, 3, 'sh-1', x.p.a, 1]);
  const sekali = JSON.stringify(x.sheets.y.yan_Shift.data);
  x.g.ADMIN_perbaruiYanShift();
  assert.strictEqual(JSON.stringify(x.sheets.y.yan_Shift.data), sekali, 'jalan ulang tidak mengubah apa pun');
  // login normal tetap jalan di header baru
  x.jam.atur('08:10:00');
  x.mulai(x.login('16130.yandal14').tiket, [x.p.c]);
  assert.strictEqual(x.kol('yan_Shift', 2, 'Terlambat (menit)'), 10);
  // header asing: tidak ditulis
  x.sheets.y.yan_Shift.data[0] = ['No', 'Aneh'];
  const asing = JSON.stringify(x.sheets.y.yan_Shift.data);
  x.g.ADMIN_perbaruiYanShift();
  assert.strictEqual(JSON.stringify(x.sheets.y.yan_Shift.data), asing);
});

// ---------- v0.63.4: rekap shift dari yan_P0 + mode sync akhir shift ----------
function barisP0(x, isi) {
  const H = x.g.skemaHeader_().YANDAL_SHEET_ID.yan_P0;
  const b = H.map(() => '');
  Object.keys(isi).forEach((k) => { assert.ok(H.includes(k), 'kolom yan_P0: ' + k); b[H.indexOf(k)] = isi[k]; });
  x.sheets.y.yan_P0.data.push(b);
  return x.sheets.y.yan_P0.data.length - 1;
}
const setP0 = (x, baris, k, v) => { x.sheets.y.yan_P0.data[baris][x.g.skemaHeader_().YANDAL_SHEET_ID.yan_P0.indexOf(k)] = v; };

test('v0.63.4: hitungRekapShift_: status & point tiap saat, durasi / jam efektif (tanpa dobel, dipotong jam shift) / jarak hanya final, Rejected tidak dihitung', () => {
  const j = g.jadwalBarisShift_({ Tanggal: '2026-10-07', Shift: 1 });
  assert.strictEqual(new Date(j.mulai).toISOString(), '2026-10-07T01:00:00.000Z');
  assert.strictEqual(new Date(g.jadwalBarisShift_({ Tanggal: '2026-10-07', Shift: 3 }).mulai).toISOString(), '2026-10-07T17:00:00.000Z', 'shift 3 = 00:00 hari berikutnya');
  const p = (o) => ({ p0_id: U(), status: 'AKTIF', ...o });
  const p0 = [
    p({ 'Status P0': 'SELESAI', 'Status Approval': 'Approved', Point: 7.5, 'Waktu Sebelum': '2026-10-07 07:30:00', 'Waktu Sesudah': '2026-10-07 09:00:00', Lat: -3.0, Long: 106.5 }),
    p({ 'Status P0': 'SELESAI', 'Status Approval': 'Approved', Point: 4, 'Waktu Sebelum': '2026-10-07 08:30:00', 'Waktu Sesudah': '2026-10-07 10:00:00', Lat: -3.01, Long: 106.5 }),
    p({ 'Status P0': 'SELESAI', 'Status Approval': 'Rejected', Point: 9, 'Waktu Sebelum': '2026-10-07 11:00:00', 'Waktu Sesudah': '2026-10-07 13:00:00', Lat: -3.5, Long: 106 }),
    p({ 'Status P0': 'SELESAI', 'Status Approval': 'Menunggu', Point: '', 'Waktu Sebelum': '2026-10-07 15:30:00', 'Waktu Sesudah': '2026-10-07 16:30:00', Lat: -3.02, Long: 106.5 }),
    p({ 'Status P0': 'PROSES', 'Waktu Sebelum': '2026-10-07 14:00:00', Lat: '', Long: '' }),
    p({ 'Status P0': 'SELESAI', 'Status Approval': 'Approved', Point: 100, status: 'BATAL' }),
  ];
  const awal = { ...g.hitungRekapShift_(p0, j, false) };
  assert.deepStrictEqual(awal, { 'Jumlah P0': 5, 'P0 Proses': 1, 'P0 Selesai': 4, 'P0 Menunggu Verifikasi': 1, 'P0 Approved': 2, 'P0 Rejected': 1, 'Total Point': 11.5 });
  const f = { ...g.hitungRekapShift_(p0, j, true) };
  assert.strictEqual(f['Total Durasi (menit)'], 90 + 90 + 60, 'durasi kotor P0 selesai non-rejected');
  // 08:00-10:00 (07:30 dipotong, 08:30-09:00 tidak dobel) + 15:30-16:00 = 2,5 jam
  assert.deepStrictEqual([f['Jam Efektif'], f['% Efektif']], [2.5, 31.3]);
  assert.ok(Math.abs(f['Total Jarak (km)'] - 2.22) < 0.02, 'jarak 3 titik berurutan, rejected & tanpa GPS dilewati: ' + f['Total Jarak (km)']);
  assert.strictEqual(f['Total Point'], 11.5);
});

test('v0.63.4: ADMIN_rekapShiftYandal: shift selesai direkap final sekali, P0 yang di-approve hari lain masuk ke shift asalnya', () => {
  const x = siapkanYandal();
  x.g.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  x.jam.atur('08:05:00');
  const s = x.mulai(x.login('16130.yandal13').tiket, [x.p.a, x.p.b]);
  const k = (n) => x.kol('yan_Shift', 1, n);
  const H = (j) => x.hari + ' ' + j;
  const b1 = barisP0(x, { p0_id: U(), shift_id: s.yandal.shiftId, status: 'AKTIF', 'Status P0': 'SELESAI', 'Status Approval': 'Menunggu',
    'Waktu Sebelum': H('09:00:00'), 'Waktu Sesudah': H('10:30:00'), Lat: -3.0, Long: 106.5, 'Timestamp Update': new Date(Date.parse(x.hari + 'T10:31:00+07:00')).toISOString() });
  barisP0(x, { p0_id: U(), shift_id: s.yandal.shiftId, status: 'AKTIF', 'Status P0': 'PROSES', 'Waktu Sebelum': H('15:00:00'), Lat: -3.01, Long: 106.5,
    'Timestamp Update': new Date(Date.parse(x.hari + 'T15:01:00+07:00')).toISOString() });
  // shift belum selesai: pemicu tidak menyentuh
  x.jam.atur('12:00:00');
  x.g.ADMIN_rekapShiftYandal();
  assert.deepStrictEqual([k('Jumlah P0'), k('Rekap Final')], [0, '']);
  // 16:15: final
  x.jam.atur('16:15:00');
  x.g.ADMIN_rekapShiftYandal();
  assert.deepStrictEqual([k('Jumlah P0'), k('P0 Proses'), k('P0 Menunggu Verifikasi'), k('Total Durasi (menit)'), k('Jam Efektif'), k('% Efektif'), k('Rekap Final')],
    [2, 1, 1, 90, 1.5, 18.8, H('16:15:00')]);
  assert.ok(k('Total Jarak (km)') > 1.1 && k('Total Jarak (km)') < 1.12);
  const rev = k('revision');
  x.jam.atur('08:15:00', x.g.tglJakarta_(new Date(Date.parse(x.hari + 'T12:00:00+07:00') + 864e5)));
  x.g.ADMIN_rekapShiftYandal();
  assert.strictEqual(k('revision'), rev, 'sudah final & P0 tidak berubah = tidak ditulis ulang');
  // 2 hari kemudian admin approve (dengan point) -> rekap ulang shift asal lewat shift_id
  const lusa = x.g.tglJakarta_(new Date(Date.parse(x.hari + 'T12:00:00+07:00') + 2 * 864e5));
  x.jam.atur('09:00:00', lusa);
  setP0(x, b1, 'Status Approval', 'Approved');
  setP0(x, b1, 'Point', 6);
  setP0(x, b1, 'Timestamp Update', new Date(x.jam.ms).toISOString());
  x.g.denganLock_(() => x.g.rekapShiftId_([s.yandal.shiftId], x.jam.ms, x.user.admin));
  assert.deepStrictEqual([k('P0 Approved'), k('P0 Menunggu Verifikasi'), k('Total Point'), k('Jam Efektif'), k('Tanggal')], [1, 0, 6, 1.5, x.hari],
    'baris shift tanggal asal yang berubah, bukan shift hari approve');
  // reject lewat jalur pemicu (P0 berubah sesudah rekap terakhir) juga tersusul
  x.jam.atur('10:00:00', lusa);
  setP0(x, b1, 'Status Approval', 'Rejected');
  setP0(x, b1, 'Timestamp Update', new Date(x.jam.ms).toISOString());
  x.jam.atur('16:15:00', lusa);
  x.g.ADMIN_rekapShiftYandal();
  // v0.65.0: P0 kedua masih PROSES lewat batas mode sync (akhir shift + 24 jam) = Rejected SISTEM "P0 Tidak Selesai"
  assert.deepStrictEqual([k('P0 Approved'), k('P0 Rejected'), k('Total Point'), k('Total Durasi (menit)'), k('Jam Efektif')], [0, 2, 0, 0, 0]);
});

test('v0.63.4: pemicu rekap: 3 pemicu harian 00:15 / 08:15 / 16:15 WIB, pemicu lama diganti', () => {
  const x = siapkanYandal();
  x.g.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  const pemicu = [{ getHandlerFunction: () => 'ADMIN_rekapShiftYandal' }, { getHandlerFunction: () => 'ADMIN_buatBarisHarian' }];
  const dibuat = [];
  const pembuat = (fn) => {
    const c = { fn };
    const b = { timeBased: () => b, everyDays: (n) => { c.hari = n; return b; }, atHour: (h) => { c.jam = h; return b; },
      nearMinute: (m) => { c.menit = m; return b; }, inTimezone: (z) => { c.tz = z; return b; }, create: () => { dibuat.push(c); pemicu.push({ getHandlerFunction: () => fn }); } };
    return b;
  };
  x.g.ScriptApp = { getProjectTriggers: () => pemicu.slice(), deleteTrigger: (t) => pemicu.splice(pemicu.indexOf(t), 1), newTrigger: pembuat };
  x.g.ADMIN_pasangPemicuRekapYandal();
  assert.deepStrictEqual(dibuat.map((c) => [c.fn, c.hari, c.jam, c.menit, c.tz]),
    [0, 8, 16].map((h) => ['ADMIN_rekapShiftYandal', 1, h, 15, 'Asia/Jakarta']));
  assert.strictEqual(pemicu.filter((t) => t.getHandlerFunction() === 'ADMIN_rekapShiftYandal').length, 3, 'yang lama dihapus');
  assert.strictEqual(pemicu.filter((t) => t.getHandlerFunction() === 'ADMIN_buatBarisHarian').length, 1, 'pemicu lain tidak disentuh');
  x.g.ADMIN_berhentiPemicuRekapYandal();
  assert.strictEqual(pemicu.filter((t) => t.getHandlerFunction() === 'ADMIN_rekapShiftYandal').length, 0);
});

test('v0.63.4: mode sync: logout AKHIR_SHIFT sesudah shift tercatat di yan_Login; ADMIN_perbaruiYanShift dari v0.63.3 + buat yan_P0', () => {
  const x = siapkanYandal();
  const s = x.mulai(x.login('16130.yandal13').tiket, [x.p.b]);
  x.jam.atur('17:10:00');
  x.g.proses_({ action: 'logout', token: s.token, data: { alasan: 'AKHIR_SHIFT' } }, 'MOBILE');
  assert.strictEqual(x.kol('yan_Login', 1, 'Alasan Logout'), 'AKHIR_SHIFT');
  assert.strictEqual(x.sheets.a.log_Audit.data.at(-1)[4], 'LOGOUT_AKHIR_SHIFT');
  assert.strictEqual(kodeError(() => x.g.proses_({ action: 'logout', token: s.token, data: { alasan: 'LAIN' } }, 'MOBILE')), 'SESI_DICABUT');

  // sheet v0.63.3 (40 kolom) tanpa yan_P0
  const y = siapkanYandal();
  y.g.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  const lama = y.g.YAN_SHIFT_HEADER_V633_.slice();
  const baris = lama.map((h) => (h === 'shift_id' ? 'sh-9' : h === 'Jumlah Login' ? 3 : h === 'Petugas 1' ? 'Budi' : h === 'status' ? 'AKTIF' : ''));
  y.sheets.y.yan_Shift.data.splice(0, 1, lama, baris);
  delete y.sheets.y.yan_P0;
  y.g.ADMIN_perbaruiYanShift();
  const H = y.g.skemaHeader_().YANDAL_SHEET_ID;
  assert.deepStrictEqual([...y.sheets.y.yan_Shift.data[0]], [...H.yan_Shift]);
  const kk = (n) => y.sheets.y.yan_Shift.data[1][H.yan_Shift.indexOf(n)];
  assert.deepStrictEqual([kk('shift_id'), kk('Jumlah Login'), kk('Petugas 1'), kk('Rekap Final'), kk('status')], ['sh-9', 3, 'Budi', '', 'AKTIF']);
  assert.deepStrictEqual([...y.sheets.y.yan_P0.data[0]], [...H.yan_P0], 'yan_P0 dibuat dengan header resmi');
  assert.strictEqual(H.yan_P0.length, 66, 'v0.64.3: yan_P0 66 kolom');
});

// ---------- v0.63.5: Arsip P0 + Rank Yandal ----------
test('v0.63.5: getArsipYandal: tim sendiri, shift yang sudah selesai saja, P0 ikut, rentang dibatasi', () => {
  const x = siapkanYandal();
  x.jam.atur('08:05:00');
  const s1 = x.mulai(x.login('16130.yandal13').tiket, [x.p.a, x.p.b]);
  x.jam.atur('08:10:00');
  x.mulai(x.login('16130.yandal14').tiket, [x.p.c]);
  barisP0(x, { p0_id: U(), shift_id: s1.yandal.shiftId, 'Kode P0': s1.yandal.kodeShift + '-P0.001', status: 'AKTIF', 'Status P0': 'SELESAI',
    'Status Approval': 'Approved', Point: 5, 'Nama Pekerjaan': 'Lain - Lain', 'Pekerjaan Lainnya': 'Ganti FCO', Penyulang: 'TB-01' });
  barisP0(x, { p0_id: U(), shift_id: s1.yandal.shiftId, 'Kode P0': s1.yandal.kodeShift + '-P0.002', status: 'BATAL', 'Status P0': 'PROSES' });
  const sesi13 = x.g.profilUser_(x.user.y13);
  const arsip = (d) => x.j(x.g.getArsipYandal_(sesi13, d, 'MOBILE'));
  x.jam.atur('12:00:00');
  assert.strictEqual(arsip({ dari: x.hari, sampai: x.hari }).shift.length, 0, 'shift berjalan belum masuk arsip');
  x.jam.atur('16:30:00');
  const a = arsip({ dari: x.hari, sampai: x.hari });
  assert.strictEqual(a.shift.length, 1, 'hanya tim sendiri');
  const sh = a.shift[0];
  assert.deepStrictEqual([sh.shiftId, sh.shift, sh.petugas, sh.jamKerja, sh.checkIn, sh.p0.length], [s1.yandal.shiftId, 1, ['Andi', 'Budi'], '08:00 - 16:00', x.hari + ' 08:05:00', 1]);
  assert.deepStrictEqual([sh.p0[0].namaPekerjaan, sh.p0[0].statusApproval, sh.p0[0].point, sh.p0[0].penyulang], ['Lain - Lain (Ganti FCO)', 'Approved', 5, 'TB-01']);
  const besok = x.g.tglJakarta_(new Date(Date.parse(x.hari + 'T12:00:00+07:00') + 864e5));
  assert.strictEqual(kodeError(() => arsip({ dari: x.hari, sampai: besok })), 'TANGGAL_DI_LUAR_BATAS');
  assert.strictEqual(kodeError(() => arsip({ dari: '2026-01-01', sampai: '2026-03-01' })), 'RENTANG_TERLALU_PANJANG');
  assert.strictEqual(kodeError(() => arsip({ dari: x.hari, sampai: '2026-01-01' })), 'RENTANG_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.g.getArsipYandal_(x.sesiAdmin, { dari: x.hari, sampai: x.hari }, 'MOBILE')), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.g.getArsipYandal_(x.g.profilUser_(x.user.row), { dari: x.hari, sampai: x.hari }, 'MOBILE')), 'AKSES_DITOLAK');
});

test('v0.63.5: rank Yandal: point & jam hanya P0 Approved, semua shift dihitung (v0.63.6), Jam 55 / Shift 15 / P0 18 / VCC 12, seri = rank sama', () => {
  const tim = [{ tim_id: 't13', kode: '13', nama: 'YANDAL 13', jenis: 'YANDAL', aktif: true }, { tim_id: 't14', kode: '14', nama: 'YANDAL 14', jenis: 'YANDAL', aktif: true }];
  const petugas = [
    { petugas_id: 'a', nama: 'Andi', tim_yandal: 't13', aktif: true }, { petugas_id: 'b', nama: 'Budi', tim_yandal: 't13', aktif: true },
    { petugas_id: 'c', nama: 'Candra', tim_yandal: 't14', aktif: true }, { petugas_id: 'z', nama: 'Zaki', tim_yandal: 't14', aktif: false },
  ];
  const shift = [
    { shift_id: 's1', status: 'AKTIF', Tanggal: '2026-10-07', Shift: 1, petugas_id_1: 'a', petugas_id_2: 'b' },
    { shift_id: 's2', status: 'AKTIF', Tanggal: '2026-10-07', Shift: 2, petugas_id_1: 'c', petugas_id_2: '' },
    { shift_id: 's3', status: 'AKTIF', Tanggal: '2026-09-30', Shift: 1, petugas_id_1: 'c', petugas_id_2: '' },
  ];
  const p = (o) => ({ p0_id: U(), status: 'AKTIF', 'Status P0': 'SELESAI', 'Status Approval': 'Approved', ...o });
  const p0 = [
    p({ shift_id: 's1', Point: 300, 'Waktu Sebelum': '2026-10-07 08:00:00', 'Waktu Sesudah': '2026-10-07 12:00:00' }),
    p({ shift_id: 's1', Point: 200, 'Waktu Sebelum': '2026-10-07 11:00:00', 'Waktu Sesudah': '2026-10-07 14:00:00' }),
    p({ shift_id: 's1', Point: 999, 'Status Approval': 'Rejected', 'Waktu Sebelum': '2026-10-07 14:00:00', 'Waktu Sesudah': '2026-10-07 16:00:00' }),
    p({ shift_id: 's2', Point: 50, 'Status Approval': 'Menunggu', 'Waktu Sebelum': '2026-10-07 17:00:00', 'Waktu Sesudah': '2026-10-07 18:00:00' }),
    p({ shift_id: 's3', Point: 900, 'Waktu Sebelum': '2026-09-30 08:00:00', 'Waktu Sesudah': '2026-09-30 15:00:00' }),
  ];
  const r = JSON.parse(JSON.stringify(g.hitungRankYandal_('2026-10', shift, p0, petugas, tim)));
  assert.deepStrictEqual(r.map((x) => [x.nama, x.rank]), [['Andi', 1], ['Budi', 1], ['Candra', 3]], 'nonaktif tanpa data tidak tampil, seri = rank sama');
  const andi = r[0];
  // 1 shift, point 500, efektif 08-14 = 360 menit / (480 x 85%) = 88,2%
  assert.deepStrictEqual([andi.shift, andi.point, andi.menitEfektif, andi.jumlahP0, andi.tim], [1, 500, 360, 2, 'YANDAL 13']);
  assert.deepStrictEqual([andi.persen.jam, andi.persen.shift, andi.persen.p0, andi.persen.vcc], [88.2, 4.2, 50, null]);
  assert.strictEqual(andi.total, Math.round((360 / 408 * 55 + 1 / 24 * 15 + 0.5 * 18) * 100) / 100);
  // v0.63.6: shift tetap dihitung walau tidak ada P0 Approved; point / jam / P0 tidak
  assert.deepStrictEqual([r[2].shift, r[2].point, r[2].menitEfektif, r[2].jumlahP0, r[2].persen.jam, r[2].total], [1, 0, 0, 0, 0, 0.63],
    'P0 Menunggu tidak dihitung, shift bulan lain tidak ikut');
  // shift yang semua P0-nya di-reject tetap 1 shift
  const tolak = JSON.parse(JSON.stringify(g.hitungRankYandal_('2026-10',
    [{ shift_id: 's9', status: 'AKTIF', Tanggal: '2026-10-07', Shift: 3, petugas_id_1: 'c', petugas_id_2: '' }],
    [p({ shift_id: 's9', Point: 70, 'Status Approval': 'Rejected', 'Waktu Sebelum': '2026-10-08 01:00:00', 'Waktu Sesudah': '2026-10-08 03:00:00' })],
    petugas, tim)));
  const c = tolak.find((x) => x.nama === 'Candra');
  assert.deepStrictEqual([c.shift, c.point, c.menitEfektif, c.rank], [1, 0, 0, 1]);
});

test('v0.63.5: getRankYandal: akun YANDAL & admin boleh, PETUGAS lain ditolak, periode divalidasi, cache 10 menit', () => {
  const x = siapkanYandal();
  const sesi13 = x.g.profilUser_(x.user.y13);
  const r = x.j(x.g.getRankYandal_(sesi13, {}));
  assert.strictEqual(r.periode, x.hari.slice(0, 7));
  assert.deepStrictEqual(r.petugas.map((p) => p.nama).sort(), ['Andi', 'Budi', 'Candra', 'Dedi']);
  assert.ok(x.j(x.g.getRankYandal_(x.sesiAdmin, { periode: '2026-09' })).petugas);
  assert.strictEqual(kodeError(() => x.g.getRankYandal_(x.g.profilUser_(x.user.row), {})), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.g.getRankYandal_(sesi13, { periode: '2026-13' })), 'FORMAT_SALAH');
  assert.ok(x.cache.get('rank-yandal:v1:' + x.hari.slice(0, 7)), 'tersimpan di cache');
});

test('v0.64.1 audit guard Yandal: arsip hanya dari HP, periode rank dibatasi, AKHIR_SHIFT hanya akun YANDAL, sync mode hanya cekSesi/logout', () => {
  const x = siapkanYandal();
  const sesi13 = x.g.profilUser_(x.user.y13);
  assert.strictEqual(kodeError(() => x.g.getArsipYandal_(sesi13, { dari: x.hari, sampai: x.hari }, 'WEB')), 'AKSES_DITOLAK');
  assert.ok(x.g.getArsipYandal_(sesi13, { dari: x.hari, sampai: x.hari }, 'MOBILE'));
  const bulanDepan = x.g.tglJakarta_(new Date(Date.parse(x.hari.slice(0, 7) + '-15T00:00:00Z') + 31 * 864e5)).slice(0, 7);
  assert.strictEqual(kodeError(() => x.g.getRankYandal_(sesi13, { periode: bulanDepan })), 'TANGGAL_DI_LUAR_BATAS', 'masa depan');
  assert.strictEqual(kodeError(() => x.g.getRankYandal_(sesi13, { periode: '2020-01' })), 'TANGGAL_DI_LUAR_BATAS', 'terlalu lama');
  // AKHIR_SHIFT dari akun ROW ditolak, token tetap sah
  const row = x.login('16130.row01');
  assert.strictEqual(kodeError(() => x.g.proses_({ action: 'logout', token: row.token, data: { alasan: 'AKHIR_SHIFT' } }, 'MOBILE')), 'PILIHAN_TIDAK_VALID');
  assert.ok(x.g.proses_({ action: 'cekSesi', token: row.token }, 'MOBILE').ok);
  // semua endpoint selain syncShift ditolak di mode sync
  const s = x.mulai(x.login('16130.yandal13').tiket, [x.p.a]);
  x.jam.atur('16:30:00');
  const ep = x.g.endpoints_();
  const boleh = Object.keys(ep).filter((k) => ep[k].syncShift).sort();
  assert.deepStrictEqual(boleh, ['cekSesi', 'daftarNotif', 'logout', 'simpanGarduYandal', 'simpanP0Yandal', 'simpanSwitchingYandal', 'uploadFotoGarduYandal', 'uploadFotoP0Yandal', 'uploadFotoSwitchingYandal'],
    'daftar endpoint mode sync (v0.65.0: + kirim P0, v0.66.0: + switching, v0.74.0: + pengukuran gardu, v0.83.0: + daftar notifikasi)');
  for (const k of Object.keys(ep).filter((k) => !ep[k].publik && !ep[k].syncShift)) {
    assert.strictEqual(kodeError(() => x.g.proses_({ action: k, token: s.token, data: {} }, 'MOBILE')), 'SHIFT_BERAKHIR', k);
  }
});

test('v0.64.2: semua jawaban (berhasil maupun gagal) membawa waktu server untuk jam terpercaya HP', () => {
  const x = siapkanYandal();
  const ok = x.g.proses_({ action: 'ping' }, 'MOBILE');
  assert.ok(ok.ok && !isNaN(Date.parse(ok.waktu)), 'berhasil');
  const gagal = x.g.gagal_(new x.g.SisiError_('SESI_TIDAK_VALID'));
  assert.ok(!gagal.ok && !isNaN(Date.parse(gagal.waktu)), 'gagal');
  assert.ok(Math.abs(Date.parse(ok.waktu) - Date.now()) < 5000);
});

test('v0.63.0: logout akun YANDAL mencatat Waktu Logout + alasan di yan_Login', () => {
  const x = siapkanYandal();
  const s = x.mulai(x.login('16130.yandal13').tiket, [x.p.b]);
  x.g.proses_({ action: 'logout', token: s.token }, 'MOBILE');
  assert.ok(x.kol('yan_Login', 1, 'Waktu Logout'));
  assert.strictEqual(x.kol('yan_Login', 1, 'Alasan Logout'), 'MANUAL');
  assert.strictEqual(kodeError(() => x.g.proses_({ action: 'cekSesi', token: s.token }, 'MOBILE')), 'SESI_DICABUT');
});

test('v0.63.0: Pindah Tim Petugas Yandal: ADMIN/SUPER, revision, tim YANDAL saja, nama unik, tambah & nonaktifkan, audit', () => {
  const x = siapkanYandal();
  const simpan = (data, s = x.sesiAdmin) => x.j(x.g.simpanPetugasYandal_(s, data, 'MOBILE'));
  const petugasRow = { userId: x.user.y13, role: 'PETUGAS', jenisTim: 'YANDAL', timId: x.tim.t13 };
  assert.strictEqual(kodeError(() => x.g.getPetugasYandal_(petugasRow, {})), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => simpan({ baru: [{ nama: 'Eko', timId: x.tim.t15 }] }, { ...x.sesiAdmin, role: 'ADMIN_ES' })), 'AKSES_DITOLAK');
  const awal = x.j(x.g.getPetugasYandal_(x.sesiAdmin, {}));
  assert.deepStrictEqual(awal.tim.map((t) => t.nama + ':' + t.jumlah), ['YANDAL 13:2', 'YANDAL 14:2', 'YANDAL 15:0', 'YANDAL 16:0', 'YANDAL 17:0'], 'hanya tim YANDAL');
  assert.deepStrictEqual(awal.peringatan.map((t) => t.nama), ['YANDAL 15', 'YANDAL 16', 'YANDAL 17'], 'kurang dari 2 anggota');
  assert.strictEqual(kodeError(() => simpan({})), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => simpan({ ubah: [{ petugasId: x.p.a, revision: 1, timId: x.tim.row }] })), 'TIM_TIDAK_VALID', 'bukan tim YANDAL');
  assert.strictEqual(kodeError(() => simpan({ ubah: [{ petugasId: x.p.a, revision: 0, timId: x.tim.t15 }] })), 'KONFLIK_REVISION');
  assert.strictEqual(kodeError(() => simpan({ baru: [{ nama: 'andi', timId: x.tim.t15 }] })), 'PETUGAS_GANDA');
  assert.strictEqual(kodeError(() => simpan({ baru: [{ nama: '=HYPERLINK(1)', timId: x.tim.t15 }] })), 'FORMAT_SALAH');
  assert.strictEqual(kodeError(() => simpan({ nomorSk: '1', baru: [] })), 'FIELD_TIDAK_DIKENAL', 'tanpa nomor SK (keputusan kvlar)');
  assert.strictEqual(x.sheets.m.db_Petugas.data.length, 6, 'yang ditolak tidak menulis');

  const h = simpan({ ubah: [{ petugasId: x.p.a, revision: 1, timId: x.tim.t15 }, { petugasId: x.p.b, revision: 1, aktif: false }],
    baru: [{ nama: 'Eko Saputra', timId: x.tim.t15 }] });
  assert.strictEqual(h.diubah, 3);
  assert.deepStrictEqual([x.kolP(2, 'tim_yandal'), x.kolP(2, 'revision'), x.kolP(1, 'aktif'), x.kolP(1, 'revision')], [x.tim.t15, 2, false, 2]);
  assert.deepStrictEqual([x.kolP(6, 'nama'), x.kolP(6, 'tim_yandal'), x.kolP(6, 'aktif'), x.kolP(6, 'revision')], ['Eko Saputra', x.tim.t15, true, 1]);
  assert.match(x.kolP(6, 'petugas_id'), /^[0-9a-f-]{36}$/);
  assert.deepStrictEqual(h.tim.map((t) => t.jumlah), [0, 2, 2, 0, 0]);
  const audit = x.sheets.a.log_Audit.data.at(-1);
  assert.strictEqual(audit[4], 'SIMPAN_PETUGAS_YANDAL');
  assert.match(audit[6], /Andi: YANDAL 13 -> YANDAL 15; Budi: nonaktif; baru Eko Saputra -> YANDAL 15/);
  assert.strictEqual(kodeError(() => x.login('16130.yandal13')), 'PETUGAS_KOSONG', 'tim tanpa petugas aktif tidak bisa mulai shift');
  assert.deepStrictEqual(x.login('16130.yandal14').yandal.petugas.map((q) => q.nama), ['Candra', 'Dedi']);
});

test('v0.63.1: crew shift berjalan yang dipindah / dinonaktifkan admin tetap bisa dipakai HP kedua sampai shift selesai', () => {
  const x = siapkanYandal();
  x.mulai(x.login('16130.yandal13').tiket, [x.p.a, x.p.b]);
  x.g.simpanPetugasYandal_(x.sesiAdmin, { ubah: [{ petugasId: x.p.a, revision: 1, timId: x.tim.t14 }, { petugasId: x.p.b, revision: 1, aktif: false }] }, 'MOBILE');
  const r2 = x.login('16130.yandal13', x.ins2);
  assert.deepStrictEqual(r2.yandal.terpilih, [x.p.a, x.p.b]);
  assert.deepStrictEqual(r2.yandal.petugas.map((p) => p.nama).sort(), ['Andi', 'Budi'], 'crew tampil walau tim 13 kini kosong');
  const s2 = x.mulai(r2.tiket, [x.p.b, x.p.a], x.ins2);
  assert.deepStrictEqual(s2.yandal.petugas.map((p) => p.nama), ['Andi', 'Budi'], 'urutan crew baris shift');
  x.jam.atur('16:05:00');
  assert.strictEqual(kodeError(() => x.login('16130.yandal13')), 'PETUGAS_KOSONG', 'shift berikutnya ikut susunan baru');
});

test('v0.63.1: tiket asing tidak menambah hitungan percobaan; > 10 percobaan = tiket dibuang', () => {
  const x = siapkanYandal();
  const acak = 'e'.repeat(64);
  assert.strictEqual(kodeError(() => x.mulai(acak, [x.p.a])), 'TIKET_TIDAK_VALID');
  assert.strictEqual(x.cache.get('yan-tiket-coba:' + x.g.sha256Hex_(acak)), null, 'tidak mengisi cache');
  const r = x.login('16130.yandal13');
  for (let i = 0; i < 10; i++) assert.strictEqual(kodeError(() => x.mulai(r.tiket, [x.p.c])), 'PETUGAS_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.mulai(r.tiket, [x.p.a])), 'TERLALU_SERING');
  assert.strictEqual(kodeError(() => x.mulai(r.tiket, [x.p.a])), 'TIKET_TIDAK_VALID', 'login ulang');
});

// ---------- v0.64.3: struktur yan_P0 66 kolom + bobot master ----------
test('v0.64.3: header yan_P0 66 kolom: urutan grup sesuai draf, kolom v0.63.4 tidak ada yang hilang, tanpa nama ganda', () => {
  const H = [...g.YAN_P0_HEADER_];
  assert.strictEqual(H.length, 66);
  assert.strictEqual(new Set(H).size, 66, 'nama kolom unik');
  // v0.65.8 / v0.65.9: hanya Jarak (km) yang berganti nama jadi Jarak Closing P0 (m) (meter, keputusan kvlar)
  g.YAN_P0_HEADER_V634_.forEach((k) => assert.ok(H.includes(g.YAN_P0_GANTI_NAMA_V658_[k] || k), 'kolom lama tetap ada: ' + k));
  assert.deepStrictEqual(H.slice(0, 4), ['No', 'Kode Header', 'Kode Shift', 'Kode P0']);
  assert.deepStrictEqual(H.slice(16, 24), ['Koordinat', 'Lat', 'Long', 'Koordinat Closing', 'Lat Closing', 'Long Closing', 'Jarak Closing P0 (m)', 'Jarak Antar P0 (m)']);
  assert.deepStrictEqual(H.slice(32, 38), ['Foto Sebelum', 'Link Drive Sebelum', 'Foto Pekerjaan', 'Link Drive Pekerjaan', 'Foto Sesudah', 'Link Drive Sesudah']);
  assert.deepStrictEqual(H.slice(43, 47), ['Skor Durasi', 'Bobot', 'Pengali', 'Point']);
  assert.strictEqual(H.indexOf('p0_id'), 50, 'kolom teknis mulai kolom 51');
  assert.strictEqual(H.at(-1), 'diubah_oleh');
  assert.ok(g.skemaHeader_().MASTER_SHEET_ID.db_Jenis_Pekerjaan.includes('bobot'));
});

test('v0.64.3: point P0 = Skor Durasi + Bobot x Pengali (ROW malam 2,5), Rejected / PROSES = 0; koordinat teks', () => {
  assert.deepStrictEqual([0, 30, 31, 60, 61, 120, 121, 240, 241, '', -5].map((m) => g.skorDurasiP0_(m)), [1, 1, 2, 2, 3, 3, 4, 4, 5, 0, 0]);
  const ms = (jam) => Date.parse('2026-10-08T' + jam + '+07:00');
  assert.deepStrictEqual(['21:59:00', '22:00:00', '02:00:00', '05:00:59', '05:01:00'].map((j) => g.pengaliP0_('Pemangkasan ROW', ms(j))), [2, 2.5, 2.5, 2.5, 2]);
  assert.strictEqual(g.pengaliP0_('Ganti FCO', ms('23:00:00')), 2, 'bukan ROW = 2');
  const p = (x) => ({ ...g.hitungPointP0_({ statusP0: 'SELESAI', statusApproval: 'Approved', durasiMenit: 45, bobot: 3, namaPekerjaan: 'Ganti FCO', dibuatMs: ms('10:00:00'), ...x }) });
  assert.deepStrictEqual(p({}), { skorDurasi: 2, pengali: 2, point: 8 });
  assert.deepStrictEqual(p({ namaPekerjaan: 'Pemangkasan ROW', dibuatMs: ms('23:30:00') }), { skorDurasi: 2, pengali: 2.5, point: 9.5 });
  assert.strictEqual(p({ statusApproval: 'Rejected' }).point, 0);
  assert.strictEqual(p({ statusP0: 'PROSES' }).point, 0);
  assert.strictEqual(p({ bobot: '' }).point, 2, 'bobot kosong = 0');
  assert.strictEqual(g.koordinatTeks_(-3.0123456, 106.4567891), '-3.012346,106.456789');
  assert.deepStrictEqual([g.koordinatTeks_('', 106), g.koordinatTeks_(-3, null), g.koordinatTeks_(91, 1), g.koordinatTeks_('x', 1)], ['', '', '', '']);
});

test('v0.64.3: ADMIN_perbaruiYanShift memindah yan_P0 v0.63.4 (48) ke 66 kolom per nama + isi Koordinat; header baru / asing tidak ditulis', () => {
  const y = siapkanYandal();
  y.g.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  const lama = [...y.g.YAN_P0_HEADER_V634_];
  const isi = { p0_id: 'p-1', 'Kode P0': 'K-P0.001', Bobot: 3, Lat: -3.01, Long: 106.45, 'Lat Closing': -3.02, 'Long Closing': 106.46, Point: 8, status: 'AKTIF' };
  y.sheets.y.yan_P0.data.splice(0, 1, lama, lama.map((h) => (h in isi ? isi[h] : '')));
  y.g.ADMIN_perbaruiYanShift();
  const H = [...y.g.YAN_P0_HEADER_];
  const d = y.sheets.y.yan_P0.data;
  assert.deepStrictEqual([...d[0]], H);
  const k = (n) => d[1][H.indexOf(n)];
  assert.deepStrictEqual([k('p0_id'), k('Kode P0'), k('Bobot'), k('Point'), k('status'), k('Koordinat'), k('Koordinat Closing'), k('Kode Header')],
    ['p-1', 'K-P0.001', 3, 8, 'AKTIF', '-3.010000,106.450000', '-3.020000,106.460000', '']);
  // sudah baru: tidak ada tulis ke yan_P0
  y.log.length = 0;
  y.g.ADMIN_perbaruiYanShift();
  assert.ok(!y.log.includes('TULIS:yan_P0'));
  // header asing: tidak ditulis
  y.sheets.y.yan_P0.data.splice(0, 1, ['No', 'Aneh']);
  y.log.length = 0;
  y.g.ADMIN_perbaruiYanShift();
  assert.ok(!y.log.includes('TULIS:yan_P0'));
  assert.deepStrictEqual([...y.sheets.y.yan_P0.data[0]], ['No', 'Aneh']);
});

test('v0.64.3: master jenisPekerjaan membawa bobot (angka / null kalau kosong / sheet lama)', () => {
  const gx = buatKonteks(PROPS);
  const buat = sheetPalsu([]);
  const sheets = { m: { db_Jenis_Pekerjaan: buat('db_Jenis_Pekerjaan', [
    ['jenis_id', 'modul', 'nama', 'satuan', 'diameter_min', 'diameter_max', 'urutan', 'aktif', 'bobot'],
    ['j1', 'YANDAL', 'Ganti FCO', '', '', '', 1, true, 3], ['j2', 'YANDAL', 'Patroli', '', '', '', 2, true, '']]) } };
  gx.SpreadsheetApp = { openById: (id) => ({ getSheetByName: (n) => sheets[id][n] }) };
  const l = JSON.parse(JSON.stringify(gx.MODUL_MASTER_.jenisPekerjaan()));
  assert.deepStrictEqual(l.map((x) => x.bobot), [3, null]);
  sheets.m.db_Jenis_Pekerjaan = buat('db_Jenis_Pekerjaan', [['jenis_id', 'modul', 'nama', 'satuan', 'diameter_min', 'diameter_max', 'urutan', 'aktif'],
    ['j1', 'ROW', 'Rabas', 'btg', 0, 25, 1, true]]);
  gx.CacheService.getScriptCache().removeAll(['master-row:v3']);
  assert.strictEqual(JSON.parse(JSON.stringify(gx.MODUL_MASTER_.jenisPekerjaan()))[0].bobot, null);
});

// ---------- v0.64.4: format nama foto ROW ----------
test('v0.64.4: namaFotoRow_ = <Kode Eksekusi>_<SLOT>[_n].jpg, karakter aneh diganti _', () => {
  assert.strictEqual(g.namaFotoRow_('R01-16130261008001-PNY.001-EKS.003', 'SEBELUM', 1), 'R01-16130261008001-PNY.001-EKS.003_SEBELUM.jpg');
  assert.strictEqual(g.namaFotoRow_('R01-16130261008001-PNY.001-EKS.003', 'sesudah', 2), 'R01-16130261008001-PNY.001-EKS.003_SESUDAH_2.jpg');
  assert.strictEqual(g.namaFotoRow_('A/B C', 'PEKERJAAN'), 'A_B_C_PEKERJAAN.jpg');
  assert.strictEqual(g.namaFotoRow_('', 'SEBELUM', 1), 'EKS_SEBELUM.jpg');
});

test('v0.64.4: upload foto ROW memberi nama format baru + penanda foto_id; pengganti _2; kiriman ulang setelah gagal tidak membuat file kembar', () => {
  const x = siapkanFoto();
  const kode = x.kodeH + '-PNY.001-EKS.001';
  const id1 = U();
  x.kirim('SEBELUM', undefined, id1);
  assert.strictEqual(kolom(x, 'row_Eksekusi', 1, 'Foto Sebelum'), kode + '_SEBELUM.jpg');
  const f1 = x.dr.semuaFile[x.dr.dibuat[0]];
  assert.deepStrictEqual([f1.getName(), f1.getDescription()], [kode + '_SEBELUM.jpg', 'sisi-foto:' + id1]);
  // ganti foto di slot yang sama
  x.kirim('SEBELUM', jpeg(1600, 1200, 80));
  assert.strictEqual(kolom(x, 'row_Eksekusi', 1, 'Foto Sebelum'), kode + '_SEBELUM_2.jpg');
  // gagal setelah file dibuat (baris row_Foto belum tertulis), lalu dikirim ulang foto_id sama
  const sh = x.sheets.r.row_Foto, asli = sh.getRange;
  sh.getRange = (...a) => ({ ...asli(...a), setValues: () => { throw new Error('Sheets error sementara'); } });
  const id3 = U();
  const sebelumGagal = x.dr.dibuat.length;
  assert.throws(() => x.kirim('PEKERJAAN', undefined, id3));
  assert.strictEqual(x.dr.dibuat.length, sebelumGagal + 1, 'file sudah terbuat sebelum gagal');
  sh.getRange = asli;
  const jumlahFile = x.dr.dibuat.length;
  const r = x.kirim('PEKERJAAN', undefined, id3);
  assert.strictEqual(r.status, 'OK');
  assert.strictEqual(x.dr.dibuat.length, jumlahFile, 'file yang sudah ada dipakai lagi');
  assert.strictEqual(kolom(x, 'row_Eksekusi', 1, 'Foto Pekerjaan'), kode + '_PEKERJAAN.jpg');
});

test('v0.64.4: ADMIN_rapikanNamaFotoRow mengganti nama acak (foto lama / migrasi) + kolom sheet, URL tetap; jalan kedua tidak membuka Drive', () => {
  const x = siapkanFoto();
  x.g.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  const kode = x.kodeH + '-PNY.001-EKS.001';
  const idA = U(), idB = U();
  x.kirim('SEBELUM', undefined, idA); x.kirim('SESUDAH', undefined, idB);
  // jadikan seperti data lama: nama file + kolom = <foto_id>.jpg, tanpa deskripsi
  const fA = x.dr.semuaFile[x.dr.dibuat[0]], fB = x.dr.semuaFile[x.dr.dibuat[1]];
  fA.setName(idA + '.jpg'); fA.setDescription(''); fB.setName(idB + '.jpg');
  const H = x.skema.row_Eksekusi, b = x.sheets.r.row_Eksekusi.data[1];
  b[H.indexOf('Foto Sebelum')] = idA + '.jpg'; b[H.indexOf('Foto Sesudah')] = idB + '.jpg';
  const urlA = b[H.indexOf('Foto Sebelum URL')], rev = b[H.indexOf('revision')];
  x.g.ADMIN_rapikanNamaFotoRow();
  assert.deepStrictEqual([fA.getName(), fB.getName(), fA.getDescription()], [kode + '_SEBELUM.jpg', kode + '_SESUDAH.jpg', 'sisi-foto:' + idA]);
  assert.deepStrictEqual([kolom(x, 'row_Eksekusi', 1, 'Foto Sebelum'), kolom(x, 'row_Eksekusi', 1, 'Foto Sesudah')], [kode + '_SEBELUM.jpg', kode + '_SESUDAH.jpg']);
  assert.deepStrictEqual([kolom(x, 'row_Eksekusi', 1, 'Foto Sebelum URL'), kolom(x, 'row_Eksekusi', 1, 'revision')], [urlA, rev], 'URL + revision tetap');
  // jalan kedua: semua sudah rapi, Drive tidak dibuka
  const asli = x.g.DriveApp.getFileById;
  let dibuka = 0;
  x.g.DriveApp.getFileById = (i) => { dibuka++; return asli(i); };
  x.g.ADMIN_rapikanNamaFotoRow();
  assert.strictEqual(dibuka, 0);
  // bukan pemilik ditolak
  x.g.Session = { getActiveUser: () => ({ getEmail: () => 'lain@y.z' }) };
  assert.strictEqual(kodeError(() => x.g.ADMIN_rapikanNamaFotoRow()), 'KHUSUS_PEMILIK');
});

// ---------- v0.64.6: bobot Lain - Lain diisi admin saat approval ----------
test('v0.64.6: Lain - Lain = bobot isian admin (wajib saat Approved, 0..100), jenis lain = bobot master; Rejected tanpa bobot', () => {
  assert.strictEqual(g.YAN_PEKERJAAN_LAIN_, 'Lain - Lain');
  assert.deepStrictEqual(['Lain - Lain', ' lain  -  lain ', 'LAIN - LAIN', 'Lain-Lain', 'Ganti FCO'].map((n) => g.pekerjaanLainP0_(n)), [true, true, true, false, false]);
  assert.strictEqual(g.bobotApprovalP0_('Ganti FCO', 3, 9, 'Approved'), 3, 'bobot master, isian admin diabaikan');
  assert.strictEqual(g.bobotApprovalP0_('Lain - Lain', '', 2.5, 'Approved'), 2.5);
  assert.strictEqual(g.bobotApprovalP0_('Lain - Lain', '', '4', 'Approved'), 4);
  assert.strictEqual(g.bobotApprovalP0_('Lain - Lain', '', 0, 'Approved'), 0, '0 boleh');
  assert.strictEqual(kodeError(() => g.bobotApprovalP0_('Lain - Lain', '', '', 'Approved')), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => g.bobotApprovalP0_('Lain - Lain', '', undefined, 'Approved')), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => g.bobotApprovalP0_('Lain - Lain', '', -1, 'Approved')), 'FORMAT_SALAH');
  assert.strictEqual(kodeError(() => g.bobotApprovalP0_('Lain - Lain', '', 101, 'Approved')), 'FORMAT_SALAH');
  assert.strictEqual(kodeError(() => g.bobotApprovalP0_('Lain - Lain', '', 'x', 'Approved')), 'FORMAT_SALAH');
  assert.strictEqual(g.bobotApprovalP0_('Lain - Lain', '', '', 'Rejected'), '', 'Rejected tanpa bobot');
  assert.strictEqual(g.bobotApprovalP0_('Ganti FCO', 3, '', 'Rejected'), 3);
  const p = g.hitungPointP0_({ statusP0: 'SELESAI', statusApproval: 'Approved', durasiMenit: 45, namaPekerjaan: 'Lain - Lain',
    bobot: g.bobotApprovalP0_('Lain - Lain', '', 3, 'Approved'), dibuatMs: Date.parse('2026-10-08T23:00:00+07:00') });
  assert.deepStrictEqual({ ...p }, { skorDurasi: 2, pengali: 2, point: 8 });
});

// ---------- v0.65.0: kirim P0 + foto P0 ke yan_P0 ----------
function siapkanP0() {
  const x = siapkanYandal();
  x.g.PropertiesService.getScriptProperties().setProperty('YANDAL_FOTO_FOLDER_ID', 'yfoto');
  const buat = sheetPalsu(x.log);
  const sk = x.g.skemaHeader_().MASTER_SHEET_ID;
  const j = { fco: U(), row: U(), lain: U(), mati: U(), sw: U() }, sek = { a: U(), b: U(), lbs: U(), acr: U(), lbsB: U() };
  x.sheets.m.db_Jenis_Pekerjaan = buat('db_Jenis_Pekerjaan', [sk.db_Jenis_Pekerjaan.slice(),
    [j.fco, 'YANDAL', 'Ganti FCO', '', '', '', 1, true, 3], [j.row, 'YANDAL', 'Pemangkasan ROW', '', '', '', 2, true, 2],
    [j.lain, 'YANDAL', 'Lain - Lain', '', '', '', 999, true, ''], [j.mati, 'YANDAL', 'Lama', '', '', '', 3, false, 1],
    [j.sw, 'YANDAL', 'Pengecekan Switching', '', '', '', 4, true, 2]]);
  x.sheets.m.db_Jaringan = buat('db_Jaringan', [['section_id', 'penyulang', 'section', 'parent_section_id', 'urutan', 'aktif'],
    [sek.a, 'Tanjung Labu', 'FCO Jar Tj. Sangkar', '', 1, true], [sek.b, 'Bikang', 'PMT Bikang', '', 1, true],
    [sek.lbs, 'Tanjung Labu', 'LBS Tj. Labu A - LBS Tj. Labu B', '', 2, true], [sek.acr, 'Tanjung Labu', 'ACR Toboali - LBS Pasir', '', 3, true],
    [sek.lbsB, 'Bikang', 'LBS Bikang 1 - LBS Bikang 2', '', 2, true]]);
  const dr = driveTiruan();
  x.g.DriveApp = dr.DriveApp;
  const blobAsli = x.g.Utilities.newBlob;   // password hash tetap memakai newBlob(teks)
  x.g.Utilities.newBlob = (bytes, mime, nama) => (mime ? { bytes, mime, nama } : blobAsli(bytes));
  x.jam.atur('08:05:00');
  const s = x.mulai(x.login('16130.yandal13').tiket, [x.p.a, x.p.b]);
  const H = x.g.skemaHeader_().YANDAL_SHEET_ID.yan_P0;
  const kol = (baris, k) => x.sheets.y.yan_P0.data[baris][H.indexOf(k)];
  const kolS = (k) => x.kol('yan_Shift', 1, k);
  const panggil = (action, data, token = s.token, platform = 'MOBILE') => x.j(x.g.proses_({ action, token, data }, platform)).data;
  const iso = (jam) => new Date(Date.parse(x.hari + 'T' + jam + '+07:00')).toISOString();
  const p0 = (isi = {}) => ({ p0Id: U(), shiftId: s.yandal.shiftId, namaPekerjaan: 'Ganti FCO', penyulang: 'Tanjung Labu', sectionId: sek.a,
    daerah: 'Tj. Sangkar', dibuat: iso('09:00:00'), dibuatHp: iso('09:00:20'), sumberWaktu: 'SERVER', installId: x.ins1, slotHp: '', ...isi });
  const foto = (p0Id, slot, jam, isi = {}, buf = jpeg(1600, 1200, 64 + slot.length + jam.length)) => ({ p0Id, slot, sumber: 'KAMERA',
    sha256: crypto.createHash('sha256').update(buf).digest('hex'), ukuranByte: buf.length, data: buf.toString('base64'),
    waktu: iso(jam), waktuHp: iso(jam), sumberWaktu: 'SERVER', lat: -3.0, lng: 106.5, akurasiM: 5, ...isi });
  return { ...x, s, j, sek, dr, kol, kolS, panggil, iso, p0, foto, H };
}

test('v0.65.0: simpanP0Yandal: baris yan_P0 (kode resmi server, kru shift, bobot master), kirim ulang tidak dobel, guard waktu / pekerjaan / section / shift', () => {
  const x = siapkanP0();
  x.jam.atur('09:01:00');
  const a = x.p0();
  const r = x.panggil('simpanP0Yandal', a);
  assert.deepStrictEqual([r.kodeP0, r.statusP0, r.statusApproval, r.fotoServer], [x.s.yandal.kodeShift + '-P0.001', 'PROSES', '', []]);
  assert.strictEqual(x.sheets.y.yan_P0.data.length, 2);
  const k = (n) => x.kol(1, n);
  assert.deepStrictEqual([k('Kode Header'), k('Kode Shift'), k('Tim'), k('Shift'), k('Petugas'), k('Nama Pekerjaan'), k('Penyulang'), k('Section'), k('Daerah')],
    [x.kolS('Kode Header'), x.s.yandal.kodeShift, 'YANDAL 13', 1, 'Andi, Budi', 'Ganti FCO', 'Tanjung Labu', 'FCO Jar Tj. Sangkar', 'Tj. Sangkar']);
  assert.deepStrictEqual([k('Waktu Dibuat'), k('Sumber Waktu'), k('Bobot'), k('Pengali'), k('Point'), k('jenis_id'), k('section_id'), k('install_id'), k('status')],
    [x.hari + ' 09:00:00', 'SERVER', 3, 2, '', x.j.fco, x.sek.a, x.ins1, 'AKTIF']);
  assert.deepStrictEqual([k('petugas_id_1'), k('petugas_id_2'), k('tim_id'), k('shift_id')], [x.kolS('petugas_id_1'), x.kolS('petugas_id_2'), x.tim.t13, x.s.yandal.shiftId]);
  assert.strictEqual(x.kolS('Jumlah P0'), 1, 'rekap shift ikut');
  // kirim ulang (respons hilang) = baris sama, kode sama
  assert.strictEqual(x.panggil('simpanP0Yandal', a).kodeP0, r.kodeP0);
  assert.strictEqual(x.sheets.y.yan_P0.data.length, 2);
  // P0 kedua = nomor berikutnya; Lain - Lain = bobot kosong (diisi admin), tanpa penyulang boleh
  const b = x.panggil('simpanP0Yandal', x.p0({ namaPekerjaan: 'Lain - Lain', pekerjaanLainnya: 'Standby Event', penyulang: undefined, sectionId: undefined }));
  assert.strictEqual(b.kodeP0, x.s.yandal.kodeShift + '-P0.002');
  assert.deepStrictEqual([x.kol(2, 'Nama Pekerjaan'), x.kol(2, 'Pekerjaan Lainnya'), x.kol(2, 'Bobot'), x.kol(2, 'jenis_id'), x.kol(2, 'Penyulang')],
    ['Lain - Lain', 'Standby Event', '', x.j.lain, '']);
  const e = (isi) => kodeError(() => x.panggil('simpanP0Yandal', x.p0(isi)));
  assert.strictEqual(e({ namaPekerjaan: 'Lain - Lain' }), 'FIELD_WAJIB');
  assert.strictEqual(e({ namaPekerjaan: 'Ngarang' }), 'PEKERJAAN_TIDAK_DIKENAL');
  assert.strictEqual(e({ namaPekerjaan: 'Lama' }), 'PEKERJAAN_TIDAK_DIKENAL', 'master nonaktif');
  assert.strictEqual(e({ penyulang: 'Bikang' }), 'SECTION_BUKAN_PENYULANG');
  assert.strictEqual(e({ dibuat: x.iso('07:30:00') }), 'WAKTU_DI_LUAR_SHIFT');
  assert.strictEqual(e({ dibuat: x.iso('09:30:00') }), 'WAKTU_MELEWATI_SERVER', 'lebih maju dari jam server');
  assert.strictEqual(e({ shiftId: U() }), 'BUKAN_SHIFT_INI');
  assert.strictEqual(kodeError(() => x.panggil('simpanP0Yandal', x.p0(), x.s.token, 'WEB')), 'AKSES_DITOLAK');
  // tim lain tidak bisa memakai p0_id tim ini
  const s14 = x.mulai(x.login('16130.yandal14', x.ins2).tiket, [x.p.c], x.ins2);
  assert.strictEqual(kodeError(() => x.panggil('simpanP0Yandal', { ...a, shiftId: s14.yandal.shiftId }, s14.token)), 'ID_DIPAKAI');
  assert.strictEqual(x.sheets.y.yan_P0.data.length, 3);
});

test('v0.65.0: uploadFotoP0Yandal: urut, kamera saja, foto tersimpan tidak bisa diganti, Sesudah = SELESAI + Menunggu, kolom turunan + rekap', () => {
  const x = siapkanP0();
  x.jam.atur('09:01:00');
  const a = x.p0(), id = a.p0Id;
  x.panggil('simpanP0Yandal', a);
  x.jam.atur('09:10:00');
  assert.strictEqual(kodeError(() => x.panggil('uploadFotoP0Yandal', x.foto(id, 'PEKERJAAN', '09:05:00'))), 'URUTAN_FOTO');
  assert.strictEqual(kodeError(() => x.panggil('uploadFotoP0Yandal', x.foto(id, 'SEBELUM', '09:05:00', { sumber: 'GALERI' }))), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.panggil('uploadFotoP0Yandal', x.foto(id, 'SEBELUM', '08:58:00'))), 'WAKTU_TIDAK_URUT');
  const f1 = x.foto(id, 'SEBELUM', '09:05:00', { lat: -3.012345, lng: 106.456789 });
  const r1 = x.panggil('uploadFotoP0Yandal', f1);
  assert.deepStrictEqual([r1.status, r1.fotoServer], ['OK', ['SEBELUM']]);
  const k = (n) => x.kol(1, n);
  const kode = x.s.yandal.kodeShift + '-P0.001';
  assert.deepStrictEqual([k('Foto Sebelum'), k('Waktu Sebelum'), k('Lat'), k('Long'), k('Koordinat'), k('Jarak Antar P0 (m)')],
    [kode + '_SEBELUM.jpg', x.hari + ' 09:05:00', -3.012345, 106.456789, '-3.012345,106.456789', 0]);
  assert.ok(String(k('Link Drive Sebelum')).includes('drive.google.com/file/d/' + k('foto_id_sebelum')));
  const file = x.dr.semuaFile[k('foto_id_sebelum')];
  assert.deepStrictEqual([file.akses, file.getDescription()], ['PRIVATE', 'sisi-foto:' + id + '-SEBELUM']);
  assert.strictEqual(x.panggil('uploadFotoP0Yandal', f1).status, 'DUPLIKAT', 'kirim ulang foto sama');
  assert.strictEqual(kodeError(() => x.panggil('uploadFotoP0Yandal', x.foto(id, 'SEBELUM', '09:06:00', {}, jpeg(1600, 1200, 99)))), 'FOTO_SUDAH_ADA');
  assert.strictEqual(Object.keys(x.dr.semuaFile).length, 1);
  x.panggil('uploadFotoP0Yandal', x.foto(id, 'PEKERJAAN', '09:08:00'));
  x.jam.atur('10:00:00');
  assert.strictEqual(kodeError(() => x.panggil('uploadFotoP0Yandal', x.foto(id, 'SESUDAH', '09:07:00'))), 'WAKTU_TIDAK_URUT');
  const r3 = x.panggil('uploadFotoP0Yandal', x.foto(id, 'SESUDAH', '09:50:00', { lat: -3.0213, lng: 106.4568, sumberWaktu: 'HP', waktuHp: x.iso('09:54:00') }));
  assert.deepStrictEqual([r3.statusP0, r3.statusApproval, r3.fotoServer], ['SELESAI', 'Menunggu', ['SEBELUM', 'PEKERJAAN', 'SESUDAH']]);
  assert.deepStrictEqual([k('Durasi (menit)'), k('Skor Durasi'), k('Koordinat Closing'), k('Sumber Waktu'), k('Selisih Jam HP (menit)'), k('Point')],
    [45, 2, '-3.021300,106.456800', 'CAMPUR', 4, '']);
  assert.ok(Math.abs(k('Jarak Closing P0 (m)') - 1000) < 10 && Number.isInteger(k('Jarak Closing P0 (m)')), 'jarak closing ke pekerjaan (meter bulat)');
  assert.deepStrictEqual(Object.keys(JSON.parse(k('foto_meta'))).sort(), ['DIBUAT', 'PEKERJAAN', 'SEBELUM', 'SESUDAH', 'sumberKoordinat'], 'v0.65.2: + sumberKoordinat');
  assert.deepStrictEqual([x.kolS('Jumlah P0'), x.kolS('P0 Selesai'), x.kolS('P0 Menunggu Verifikasi')], [1, 1, 1]);
  // P0 kedua: Jarak Antar P0 dari P0 pertama
  const b = x.p0({ dibuat: x.iso('09:55:00') });
  x.panggil('simpanP0Yandal', b);
  x.panggil('uploadFotoP0Yandal', x.foto(b.p0Id, 'SEBELUM', '09:58:00', { lat: -3.0213, lng: 106.456789 }));
  assert.ok(Math.abs(x.kol(2, 'Jarak Antar P0 (m)') - 990) < 20);
  // tim lain tidak bisa mengirim foto ke P0 ini
  const s14 = x.mulai(x.login('16130.yandal14', x.ins2).tiket, [x.p.c], x.ins2);
  assert.strictEqual(kodeError(() => x.panggil('uploadFotoP0Yandal', x.foto(b.p0Id, 'PEKERJAAN', '09:59:00'), s14.token)), 'BUKAN_MILIK_TIM');
});

test('v0.65.0: akhir shift: P0 belum selesai = Rejected SISTEM "P0 Tidak Selesai" Point 0 (final dari HP / pemicu lewat batas sync); Sesudah menyusul = Menunggu lagi', () => {
  const x = siapkanP0();
  x.g.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  x.jam.atur('09:01:00');
  const a = x.p0(), b = x.p0(), c = x.p0();
  [a, b, c].forEach((p) => x.panggil('simpanP0Yandal', p));
  x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'SEBELUM', '09:00:30'));
  // final sebelum akhir shift diabaikan
  assert.strictEqual(x.panggil('simpanP0Yandal', { ...a, final: true, slotHp: 'SEBELUM' }).statusApproval, '');
  // mode sync (sesudah 15:59): HP mengirim final, P0 a & b tanpa Sesudah = Rejected SISTEM
  x.jam.atur('16:10:00');
  const ra = x.panggil('simpanP0Yandal', { ...a, final: true, slotHp: 'SEBELUM' });
  assert.deepStrictEqual([ra.statusP0, ra.statusApproval, ra.alasanRejected], ['PROSES', 'Rejected', 'P0 Tidak Selesai']);
  assert.deepStrictEqual([x.kol(1, 'Approved Oleh'), x.kol(1, 'Point'), x.kol(1, 'Waktu Approve')], ['SISTEM', 0, x.hari + ' 16:10:00']);
  // final dengan slotHp berisi Sesudah (foto masih dikirim) = belum ditolak
  assert.strictEqual(x.panggil('simpanP0Yandal', { ...b, final: true, slotHp: 'SEBELUM,PEKERJAAN,SESUDAH' }).statusApproval, '');
  assert.deepStrictEqual([x.kolS('P0 Rejected'), x.kolS('P0 Proses')], [1, 3]);
  // Sesudah a ternyata masuk belakangan (diambil dalam shift) = batal ditolak, Menunggu verifikasi
  x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'PEKERJAAN', '10:00:00'));
  const r = x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'SESUDAH', '15:50:00'));
  assert.deepStrictEqual([r.statusP0, r.statusApproval, r.alasanRejected, x.kol(1, 'Approved Oleh'), x.kol(1, 'Point')], ['SELESAI', 'Menunggu', '', '', '']);
  // foto di luar jam shift ditolak walau mode sync
  assert.strictEqual(kodeError(() => x.panggil('uploadFotoP0Yandal', x.foto(b.p0Id, 'SEBELUM', '16:05:00'))), 'WAKTU_DI_LUAR_SHIFT');
  // pemicu: lewat batas mode sync (akhir shift + 24 jam), P0 b & c masih PROSES = Rejected SISTEM
  const besok = x.g.tglJakarta_(new Date(Date.parse(x.hari + 'T12:00:00+07:00') + 864e5));
  x.jam.atur('08:15:00', besok);
  x.g.ADMIN_rekapShiftYandal();
  assert.deepStrictEqual([x.kol(2, 'Status Approval'), x.kol(3, 'Status Approval')], ['', ''], 'belum lewat batas sync');
  x.jam.atur('16:15:00', besok);
  x.g.ADMIN_rekapShiftYandal();
  assert.deepStrictEqual([x.kol(2, 'Status Approval'), x.kol(2, 'Alasan Rejected'), x.kol(3, 'Approved Oleh'), x.kol(1, 'Status Approval')],
    ['Rejected', 'P0 Tidak Selesai', 'SISTEM', 'Menunggu']);
  assert.deepStrictEqual([x.kolS('P0 Rejected'), x.kolS('P0 Menunggu Verifikasi'), x.kolS('Total Point')], [2, 1, 0]);
});

test('v0.65.1: waktu P0 dibaca dari foto_meta (ISO): sel waktu yang diubah Sheets ke zona waktu lain tidak membuat WAKTU_TIDAK_URUT', () => {
  const x = siapkanP0();
  x.jam.atur('10:12:00');
  const a = x.p0({ dibuat: x.iso('10:11:00') });
  x.panggil('simpanP0Yandal', a);
  // seperti spreadsheet zona GMT: "yyyy-MM-dd 10:11:00" dibaca jadi Date 10:11 UTC (= 17:11 WIB)
  const geser = (k) => { const b = x.sheets.y.yan_P0.data[1]; const i = x.H.indexOf(k); b[i] = new Date(Date.parse(String(b[i]).replace(' ', 'T') + 'Z')); };
  geser('Waktu Dibuat');
  x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'SEBELUM', '10:11:23'));
  geser('Waktu Sebelum');
  x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'PEKERJAAN', '10:11:28'));
  geser('Waktu Pekerjaan');
  const r = x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'SESUDAH', '10:11:33'));
  assert.deepStrictEqual([r.statusP0, r.statusApproval, x.kol(1, 'Durasi (menit)')], ['SELESAI', 'Menunggu', 0.17], 'v0.65.12: 10 detik = 0.17 menit');
  assert.match(x.g.ADMIN_cekKonfigurasi.toString(), /getSpreadsheetTimeZone/);
});

test('v0.65.2: koordinat foto P0 menyusul maks 30 detik (ditandai di foto_meta); Sebelum tanpa GPS = titik pekerjaan dari foto Pekerjaan, Sesudah tidak dipakai', () => {
  const x = siapkanP0();
  x.jam.atur('09:01:00');
  const tanpa = { lat: undefined, lng: undefined, akurasiM: undefined };
  const a = x.p0();
  x.panggil('simpanP0Yandal', a);
  x.jam.atur('09:20:00');
  // susulan lewat 30 detik / susulan tanpa titik = ditolak
  assert.strictEqual(kodeError(() => x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'SEBELUM', '09:05:00', { gpsSusulanDetik: 31 }))), 'DI_LUAR_RENTANG');
  assert.strictEqual(kodeError(() => x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'SEBELUM', '09:05:00', { ...tanpa, gpsSusulanDetik: 5 }))), 'FIELD_WAJIB');
  // Sebelum dengan titik susulan 12 detik
  x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'SEBELUM', '09:05:00', { lat: -3.01, lng: 106.45, akurasiM: 9, gpsSusulanDetik: 12 }));
  const m = JSON.parse(x.kol(1, 'foto_meta'));
  assert.deepStrictEqual([m.SEBELUM.gpsSusulanDetik, m.sumberKoordinat, x.kol(1, 'Koordinat')], [12, 'SEBELUM', '-3.010000,106.450000']);
  // Pekerjaan TIDAK menimpa titik dari Sebelum
  x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'PEKERJAAN', '09:08:00', { lat: -3.5, lng: 106.9 }));
  assert.deepStrictEqual([x.kol(1, 'Lat'), JSON.parse(x.kol(1, 'foto_meta')).sumberKoordinat], [-3.01, 'SEBELUM']);

  // P0 kedua: Sebelum tanpa GPS sama sekali
  const b = x.p0({ dibuat: x.iso('09:10:00') });
  x.panggil('simpanP0Yandal', b);
  x.panggil('uploadFotoP0Yandal', x.foto(b.p0Id, 'SEBELUM', '09:11:00', tanpa));
  assert.deepStrictEqual([x.kol(2, 'Lat'), x.kol(2, 'Koordinat'), x.kol(2, 'Jarak Antar P0 (m)')], ['', '', '']);
  assert.strictEqual(JSON.parse(x.kol(2, 'foto_meta')).sumberKoordinat, undefined);
  // Pekerjaan ber-GPS = cadangan titik pekerjaan (+ Jarak Antar P0 ikut dihitung)
  x.panggil('uploadFotoP0Yandal', x.foto(b.p0Id, 'PEKERJAAN', '09:12:00', { lat: -3.0, lng: 106.45 }));
  assert.deepStrictEqual([x.kol(2, 'Lat'), x.kol(2, 'Long'), x.kol(2, 'Koordinat'), JSON.parse(x.kol(2, 'foto_meta')).sumberKoordinat],
    [-3.0, 106.45, '-3.000000,106.450000', 'PEKERJAAN']);
  assert.ok(Math.abs(x.kol(2, 'Jarak Antar P0 (m)') - 1110) < 20, 'jarak antar P0 dari titik cadangan');
  x.panggil('uploadFotoP0Yandal', x.foto(b.p0Id, 'SESUDAH', '09:15:00', { lat: -3.009, lng: 106.45 }));
  assert.ok(Math.abs(x.kol(2, 'Jarak Closing P0 (m)') - 1000) < 10, 'jarak closing ke titik cadangan');
  assert.deepStrictEqual([x.kol(2, 'Lat'), x.kol(2, 'Lat Closing')], [-3.0, -3.009], 'Sesudah = closing, bukan titik pekerjaan');

  // P0 ketiga: Sebelum & Pekerjaan tanpa GPS: titik pekerjaan tetap kosong walau Sesudah ber-GPS
  const c = x.p0({ dibuat: x.iso('09:16:00') });
  x.panggil('simpanP0Yandal', c);
  x.panggil('uploadFotoP0Yandal', x.foto(c.p0Id, 'SEBELUM', '09:16:30', tanpa));
  x.panggil('uploadFotoP0Yandal', x.foto(c.p0Id, 'PEKERJAAN', '09:17:00', tanpa));
  x.panggil('uploadFotoP0Yandal', x.foto(c.p0Id, 'SESUDAH', '09:18:00', { lat: -3.0, lng: 106.45 }));
  assert.deepStrictEqual([x.kol(3, 'Lat'), x.kol(3, 'Jarak Closing P0 (m)'), x.kol(3, 'Koordinat Closing')], ['', '', '-3.000000,106.450000']);
});

test('v0.65.8: Jarak Closing P0 (m) dalam meter bulat: jarak beberapa meter tidak tertulis 0 (kasus HP 5 m, sheet 0)', () => {
  const x = siapkanP0();
  x.jam.atur('09:01:00');
  const a = x.p0();
  x.panggil('simpanP0Yandal', a);
  x.jam.atur('09:10:00');
  x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'SEBELUM', '09:05:00', { lat: -2.607114, lng: 106.14425 }));
  x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'PEKERJAAN', '09:06:00'));
  x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'SESUDAH', '09:07:00', { lat: -2.607091, lng: 106.144216 }));
  assert.strictEqual(x.kol(1, 'Jarak Closing P0 (m)'), 5);
  const b = x.p0({ dibuat: x.iso('09:08:00') });
  x.panggil('simpanP0Yandal', b);
  x.panggil('uploadFotoP0Yandal', x.foto(b.p0Id, 'SEBELUM', '09:09:00', { lat: -2.607091, lng: 106.144216 }));
  assert.strictEqual(x.kol(2, 'Jarak Antar P0 (m)'), 5);
});

test('v0.65.8: ADMIN_perbaruiYanShift: yan_P0 66 kolom km -> meter (nama kolom + nilai dihitung ulang dari titik, termasuk yang dulu 0)', () => {
  const y = siapkanYandal();
  y.g.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  const lama = [...y.g.YAN_P0_HEADER_V643_];
  assert.deepStrictEqual([lama[22], lama[23]], ['Jarak (km)', 'Jarak Antar P0 (km)']);
  const meta = (jam) => JSON.stringify({ DIBUAT: { waktu: '2026-10-08T' + jam + '+07:00' } });
  const a = { p0_id: 'p-1', shift_id: 's-1', 'Kode P0': 'K-P0.001', Lat: -2.607114, Long: 106.14425, 'Lat Closing': -2.607091,
    'Long Closing': 106.144216, 'Jarak (km)': 0, 'Jarak Antar P0 (km)': 0, foto_meta: meta('09:00:00'), Point: 8, status: 'AKTIF' };
  const b = { p0_id: 'p-2', shift_id: 's-1', 'Kode P0': 'K-P0.002', Lat: -2.616114, Long: 106.14425, 'Jarak (km)': '',
    'Jarak Antar P0 (km)': 1, foto_meta: meta('10:00:00'), status: 'AKTIF' };
  y.sheets.y.yan_P0.data.splice(0, 1, lama, ...[a, b].map((isi) => lama.map((h) => (h in isi ? isi[h] : ''))));
  y.g.ADMIN_perbaruiYanShift();
  const H = [...y.g.YAN_P0_HEADER_];
  const d = y.sheets.y.yan_P0.data;
  assert.deepStrictEqual([...d[0]], H);
  const k = (i, n) => d[i][H.indexOf(n)];
  assert.deepStrictEqual([k(1, 'Jarak Closing P0 (m)'), k(1, 'Jarak Antar P0 (m)'), k(1, 'Kode P0'), k(1, 'Point')], [5, 0, 'K-P0.001', 8]);
  assert.deepStrictEqual([k(2, 'Jarak Closing P0 (m)'), k(2, 'Jarak Antar P0 (m)')], ['', 1001]);
  y.log.length = 0;
  y.g.ADMIN_perbaruiYanShift();
  assert.ok(!y.log.includes('TULIS:yan_P0'), 'sudah meter: tidak ditulis lagi');
});

test('v0.65.9: ADMIN_perbaruiYanShift: header v0.65.8 Jarak (m) -> Jarak Closing P0 (m) (nilai tetap meter)', () => {
  const y = siapkanYandal();
  y.g.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  const lama = [...y.g.YAN_P0_HEADER_V658_];
  assert.strictEqual(lama[22], 'Jarak (m)');
  const a = { p0_id: 'p-1', shift_id: 's-1', Lat: -2.607114, Long: 106.14425, 'Lat Closing': -2.607091, 'Long Closing': 106.144216,
    'Jarak (m)': 5, 'Jarak Antar P0 (m)': 0, status: 'AKTIF' };
  y.sheets.y.yan_P0.data.splice(0, 1, lama, lama.map((h) => (h in a ? a[h] : '')));
  y.g.ADMIN_perbaruiYanShift();
  const H = [...y.g.YAN_P0_HEADER_];
  assert.deepStrictEqual([...y.sheets.y.yan_P0.data[0]], H);
  assert.strictEqual(H[22], 'Jarak Closing P0 (m)');
  assert.strictEqual(y.sheets.y.yan_P0.data[1][22], 5);
});

test('v0.65.10: header Jarak Closing P0 (m); ADMIN_perbaruiYanShift juga mengenali header v0.65.9 (tanpa satuan)', () => {
  const y = siapkanYandal();
  y.g.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  assert.strictEqual(y.g.YAN_P0_HEADER_[22], 'Jarak Closing P0 (m)');
  const lama = [...y.g.YAN_P0_HEADER_V659_];
  assert.strictEqual(lama[22], 'Jarak Closing P0');
  const a = { p0_id: 'p-1', shift_id: 's-1', Lat: -2.607114, Long: 106.14425, 'Lat Closing': -2.607091, 'Long Closing': 106.144216,
    'Jarak Closing P0': 5, status: 'AKTIF' };
  y.sheets.y.yan_P0.data.splice(0, 1, lama, lama.map((h) => (h in a ? a[h] : '')));
  y.g.ADMIN_perbaruiYanShift();
  assert.deepStrictEqual([...y.sheets.y.yan_P0.data[0]], [...y.g.YAN_P0_HEADER_]);
  assert.strictEqual(y.sheets.y.yan_P0.data[1][22], 5);
});

test('v0.65.12: Durasi (menit) P0 2 desimal: di bawah 1 menit tidak tertulis 0; skor durasi tetap; Total Durasi shift ikut', () => {
  assert.deepStrictEqual([g.menitP0_(45e3), g.menitP0_(10e3), g.menitP0_(90.6e3), g.menitP0_(-5e3), g.menitP0_(0)], [0.75, 0.17, 1.51, 0, 0]);
  const x = siapkanP0();
  x.jam.atur('09:01:00');
  const a = x.p0();
  x.panggil('simpanP0Yandal', a);
  x.jam.atur('09:10:00');
  x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'SEBELUM', '09:05:00'));
  x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'PEKERJAAN', '09:05:20'));
  x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'SESUDAH', '09:05:45'));
  assert.deepStrictEqual([x.kol(1, 'Durasi (menit)'), x.kol(1, 'Skor Durasi')], [0.75, 1]);
});

// ---------- v0.66.0: yan_Switching (anak P0 Pengecekan Switching) ----------
test('v0.66.0: header yan_Switching 61 kolom; Nama Switching dari depan section, hanya LBS / ACR', () => {
  const H = [...g.YAN_SWITCHING_HEADER_];
  assert.strictEqual(H.length, 61);
  assert.strictEqual(new Set(H).size, 61);
  assert.deepStrictEqual(H.slice(19, 26), ['Indikator Remote', 'Indikator Local', 'Indikator Protection', 'Indikator Reclose', 'Arus R (A)', 'Arus S (A)', 'Arus T (A)']);
  assert.ok(!H.includes('Arus N (A)') && !H.some((h) => /opsional/i.test(h)));
  assert.deepStrictEqual([...g.skemaHeader_().YANDAL_SHEET_ID.yan_Switching], H);
  assert.deepStrictEqual(['LBS A - LBS B', 'ACR Toboali - LBS X', 'LBS Tunggal', '  PMT Keposang - Inc. Keposang', ''].map((x) => g.namaSwitching_(x)),
    ['LBS A', 'ACR Toboali', 'LBS Tunggal', 'PMT Keposang', '']);
  assert.deepStrictEqual(['LBS A', 'lbs.12', 'ACR Toboali', 'PMT Keposang', 'FCO Jar', 'LBSX', 'Acr-1', ''].map((x) => g.switchingSah_(x)),
    [true, true, true, false, false, false, true, false]);
  assert.deepStrictEqual(['Pengecekan Switching', ' pengecekan  SWITCHING ', 'Pengecekan Gardu'].map((x) => g.p0Switching_(x)), [true, true, false]);
});

test('v0.66.0: switching: syarat P0 (jenis, penyulang, foto Sebelum), section LBS/ACR penyulang P0, kunci kecuali arus, foto ARUS dulu, Sesudah butuh switching ber-foto arus', () => {
  const x = siapkanP0();
  const sw = (p0Id, isi = {}) => ({ switchingId: U(), p0Id, sectionId: x.sek.lbs, indikatorRemote: 'Nyala', indikatorLocal: 'Padam',
    indikatorProtection: 'Nyala', indikatorReclose: 'Nyala', arusR: 45, arusS: 47.5, arusT: 44, dibuat: x.iso('09:09:00'), ...isi });
  const fs_ = (switchingId, slot, jam, isi = {}, buf = jpeg(1600, 1200, 80 + slot.length + jam.length)) => ({ switchingId, slot, sumber: 'KAMERA',
    sha256: crypto.createHash('sha256').update(buf).digest('hex'), ukuranByte: buf.length, data: buf.toString('base64'),
    waktu: x.iso(jam), waktuHp: x.iso(jam), sumberWaktu: 'SERVER', lat: -3.01, lng: 106.45, akurasiM: 4, ...isi });
  const e = (aksi, d, tok) => kodeError(() => x.panggil(aksi, d, tok));
  x.jam.atur('09:01:00');
  assert.strictEqual(e('simpanP0Yandal', x.p0({ namaPekerjaan: 'Pengecekan Switching', penyulang: undefined, sectionId: undefined })), 'FIELD_WAJIB', 'penyulang wajib');
  // v0.66.4: section juga wajib, dan harus LBS / ACR
  assert.strictEqual(e('simpanP0Yandal', x.p0({ namaPekerjaan: 'Pengecekan Switching', sectionId: undefined })), 'FIELD_WAJIB', 'section wajib');
  assert.strictEqual(e('simpanP0Yandal', x.p0({ namaPekerjaan: 'Pengecekan Switching' })), 'BUKAN_SWITCHING', 'FCO bukan LBS / ACR');
  assert.strictEqual(x.sheets.y.yan_P0.data.length, 1);
  const a = x.p0({ namaPekerjaan: 'Pengecekan Switching', sectionId: x.sek.lbs });
  const ra = x.panggil('simpanP0Yandal', a);
  x.jam.atur('09:30:00');
  const s1 = sw(a.p0Id);
  assert.strictEqual(e('simpanSwitchingYandal', s1), 'URUTAN_FOTO', 'foto Sebelum P0 belum ada');
  x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'SEBELUM', '09:05:00'));
  // v0.66.4: switching wajib section P0 itu sendiri
  assert.strictEqual(e('simpanSwitchingYandal', sw(a.p0Id, { sectionId: x.sek.acr })), 'SECTION_BEDA_P0');
  assert.strictEqual(e('simpanSwitchingYandal', sw(a.p0Id, { sectionId: x.sek.lbsB })), 'SECTION_BEDA_P0');
  assert.strictEqual(e('simpanSwitchingYandal', sw(a.p0Id, { indikatorRemote: 'ON' })), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(e('simpanSwitchingYandal', sw(a.p0Id, { arusR: -1 })), 'DI_LUAR_RENTANG');
  // v0.66.2: jam dibuat switching baru wajib di jam shift, sesudah foto Sebelum P0, tidak lewat jam server
  assert.strictEqual(e('simpanSwitchingYandal', sw(a.p0Id, { dibuat: undefined })), 'FIELD_WAJIB');
  assert.strictEqual(e('simpanSwitchingYandal', sw(a.p0Id, { dibuat: x.iso('07:50:00') })), 'WAKTU_DI_LUAR_SHIFT');
  assert.strictEqual(e('simpanSwitchingYandal', sw(a.p0Id, { dibuat: x.iso('09:02:00') })), 'WAKTU_TIDAK_URUT');
  assert.strictEqual(e('simpanSwitchingYandal', sw(a.p0Id, { dibuat: x.iso('09:40:00') })), 'WAKTU_MELEWATI_SERVER');
  const r1 = x.panggil('simpanSwitchingYandal', s1);
  const kode1 = ra.kodeP0 + '-SWC.001';
  assert.deepStrictEqual([r1.kodeSwitching, r1.namaSwitching, r1.fotoServer], [kode1, 'LBS Tj. Labu A', []]);
  const H = x.g.YAN_SWITCHING_HEADER_;
  const k = (b, n) => x.sheets.y.yan_Switching.data[b][H.indexOf(n)];
  assert.deepStrictEqual([k(1, 'Kode P0'), k(1, 'Penyulang'), k(1, 'Section'), k(1, 'Indikator Local'), k(1, 'Arus S (A)'), k(1, 'Tim'), k(1, 'status')],
    [ra.kodeP0, 'Tanjung Labu', 'LBS Tj. Labu A - LBS Tj. Labu B', 'Padam', 47.5, 'YANDAL 13', 'AKTIF']);
  assert.strictEqual(x.panggil('simpanSwitchingYandal', s1).kodeSwitching, kode1, 'kirim ulang = baris sama');
  assert.strictEqual(x.sheets.y.yan_Switching.data.length, 2);
  // terkunci kecuali arus
  assert.strictEqual(e('simpanSwitchingYandal', { ...s1, indikatorRemote: 'Padam' }), 'SWITCHING_TERKUNCI');
  assert.strictEqual(e('simpanSwitchingYandal', { ...s1, sectionId: x.sek.acr }), 'SWITCHING_TERKUNCI');
  assert.strictEqual(e('simpanSwitchingYandal', { ...s1, catatan: 'ubah' }), 'SWITCHING_TERKUNCI');
  x.panggil('simpanSwitchingYandal', { ...s1, arusR: 46 });
  assert.deepStrictEqual([k(1, 'Arus R (A)'), k(1, 'revision')], [46, 2]);
  // foto: ARUS dulu
  assert.strictEqual(e('uploadFotoSwitchingYandal', fs_(s1.switchingId, 'GANGGUAN_1', '09:10:00')), 'URUTAN_FOTO');
  assert.strictEqual(e('uploadFotoSwitchingYandal', fs_(s1.switchingId, 'ARUS', '09:04:00')), 'WAKTU_TIDAK_URUT', 'sebelum foto Sebelum P0');
  // Sesudah P0 sebelum ada switching ber-foto arus = ditolak
  x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'PEKERJAAN', '09:08:00'));
  assert.strictEqual(e('uploadFotoP0Yandal', x.foto(a.p0Id, 'SESUDAH', '09:20:00')), 'SWITCHING_BELUM_ADA');
  const fa = fs_(s1.switchingId, 'ARUS', '09:10:00', { lat: -3.012, lng: 106.4511 });
  const r2 = x.panggil('uploadFotoSwitchingYandal', fa);
  assert.deepStrictEqual([r2.status, r2.fotoServer], ['OK', ['ARUS']]);
  assert.deepStrictEqual([k(1, 'Foto Arus'), k(1, 'Jam Pengecekan'), k(1, 'Koordinat'), k(1, 'Lat')],
    [kode1 + '_ARUS.jpg', x.hari + ' 09:10:00', '-3.012000,106.451100', -3.012]);
  assert.deepStrictEqual([x.dr.semuaFile[k(1, 'foto_id_arus')].akses, x.dr.semuaFile[k(1, 'foto_id_arus')].getDescription()],
    ['PRIVATE', 'sisi-foto:' + s1.switchingId + '-ARUS']);
  assert.strictEqual(x.panggil('uploadFotoSwitchingYandal', fa).status, 'DUPLIKAT');
  assert.strictEqual(e('uploadFotoSwitchingYandal', fs_(s1.switchingId, 'ARUS', '09:11:00', {}, jpeg(1600, 1200, 7))), 'FOTO_SUDAH_ADA');
  x.panggil('uploadFotoSwitchingYandal', fs_(s1.switchingId, 'GANGGUAN_3', '09:12:00'));
  assert.strictEqual(k(1, 'Foto Arus Gangguan 3'), kode1 + '_GANGGUAN_3.jpg');
  // v0.66.3: SATU switching per P0
  const s2 = sw(a.p0Id, { sectionId: x.sek.acr });
  assert.strictEqual(e('simpanSwitchingYandal', s2), 'SWITCHING_SUDAH_ADA');
  assert.strictEqual(x.sheets.y.yan_Switching.data.length, 2);
  // sekarang Sesudah boleh; sesudah SELESAI semua terkunci
  assert.strictEqual(x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'SESUDAH', '09:20:00')).statusP0, 'SELESAI');
  assert.strictEqual(e('simpanSwitchingYandal', { ...s1, arusR: 50 }), 'P0_SUDAH_SELESAI');
  assert.strictEqual(x.panggil('simpanSwitchingYandal', { ...s1, arusR: 46 }).kodeSwitching, kode1, 'kirim ulang tanpa perubahan tetap OK');
  assert.strictEqual(e('simpanSwitchingYandal', sw(a.p0Id)), 'P0_SUDAH_SELESAI');
  assert.strictEqual(e('uploadFotoSwitchingYandal', fs_(s1.switchingId, 'GANGGUAN_2', '09:15:00')), 'P0_SUDAH_SELESAI');
  // P0 jenis lain: bukan switching, Sesudah tidak butuh switching
  const b = x.p0({ dibuat: x.iso('09:21:00') });
  x.panggil('simpanP0Yandal', b);
  x.panggil('uploadFotoP0Yandal', x.foto(b.p0Id, 'SEBELUM', '09:22:00'));
  assert.strictEqual(e('simpanSwitchingYandal', sw(b.p0Id)), 'BUKAN_PENGECEKAN_SWITCHING');
  x.panggil('uploadFotoP0Yandal', x.foto(b.p0Id, 'PEKERJAAN', '09:23:00'));
  assert.strictEqual(x.panggil('uploadFotoP0Yandal', x.foto(b.p0Id, 'SESUDAH', '09:24:00')).statusP0, 'SELESAI');
  // tim lain
  const s14 = x.mulai(x.login('16130.yandal14', x.ins2).tiket, [x.p.c], x.ins2);
  assert.strictEqual(e('simpanSwitchingYandal', s1, s14.token), 'BUKAN_MILIK_TIM');
  assert.strictEqual(e('uploadFotoSwitchingYandal', fs_(s1.switchingId, 'GANGGUAN_4', '09:15:00'), s14.token), 'BUKAN_MILIK_TIM');
  assert.strictEqual(kodeError(() => x.panggil('simpanSwitchingYandal', s1, x.s.token, 'WEB')), 'AKSES_DITOLAK');
});

test('v0.66.4/v0.66.5: edit lokasi P0 (ubahLokasi + lokasiDiubah): penyulang / section / daerah, switching hanya LBS / ACR & sebelum switching disimpan', () => {
  const x = siapkanP0();
  const e = (aksi, d, tok) => kodeError(() => x.panggil(aksi, d, tok));
  const H = x.g.YAN_P0_HEADER_;
  const k = (b, n) => x.sheets.y.yan_P0.data[b][H.indexOf(n)];
  x.jam.atur('09:01:00');
  const a = x.p0({ namaPekerjaan: 'Pengecekan Switching', sectionId: x.sek.lbs });
  const ra = x.panggil('simpanP0Yandal', a);
  x.jam.atur('09:30:00');
  // tanpa ubahLokasi: data baru diabaikan (kirim ulang lama tidak menimpa)
  x.panggil('simpanP0Yandal', { ...a, sectionId: x.sek.acr });
  assert.strictEqual(k(1, 'Section'), 'LBS Tj. Labu A - LBS Tj. Labu B');
  // ubah ke section bukan LBS / ACR = ditolak, penyulang lain = ditolak
  assert.strictEqual(e('simpanP0Yandal', { ...a, sectionId: x.sek.a, ubahLokasi: true, lokasiDiubah: x.iso('09:25:00') }), 'BUKAN_SWITCHING');
  assert.strictEqual(e('simpanP0Yandal', { ...a, sectionId: x.sek.lbsB, ubahLokasi: true, lokasiDiubah: x.iso('09:25:00') }), 'SECTION_BUKAN_PENYULANG');
  assert.strictEqual(e('simpanP0Yandal', { ...a, sectionId: undefined, ubahLokasi: true, lokasiDiubah: x.iso('09:25:00') }), 'FIELD_WAJIB');
  // v0.66.5: jam edit wajib, di jam shift, sesudah P0 dibuat, tidak lewat jam server
  const ub = { ...a, sectionId: x.sek.acr, ubahLokasi: true };
  assert.strictEqual(e('simpanP0Yandal', ub), 'FIELD_WAJIB', 'lokasiDiubah wajib');
  assert.strictEqual(e('simpanP0Yandal', { ...ub, lokasiDiubah: x.iso('07:30:00') }), 'WAKTU_DI_LUAR_SHIFT');
  assert.strictEqual(e('simpanP0Yandal', { ...ub, lokasiDiubah: x.iso('09:45:00') }), 'WAKTU_MELEWATI_SERVER');
  assert.strictEqual(e('simpanP0Yandal', { ...ub, lokasiDiubah: x.iso('08:30:00') }), 'WAKTU_TIDAK_URUT', 'sebelum P0 dibuat');
  assert.strictEqual(k(1, 'Section'), 'LBS Tj. Labu A - LBS Tj. Labu B');
  const rv = k(1, 'revision');
  const r1 = x.panggil('simpanP0Yandal', { ...a, sectionId: x.sek.acr, daerah: 'Pasir Putih', ubahLokasi: true, lokasiDiubah: x.iso('09:25:00') });
  assert.strictEqual(r1.kodeP0, ra.kodeP0);
  assert.deepStrictEqual([k(1, 'Section'), k(1, 'section_id'), k(1, 'Daerah'), k(1, 'revision')],
    ['ACR Toboali - LBS Pasir', x.sek.acr, 'Pasir Putih', rv + 1]);
  assert.ok(x.sheets.a.log_Audit.data.some((b) => b.includes('UBAH_LOKASI_P0')));
  x.panggil('simpanP0Yandal', { ...a, sectionId: x.sek.acr, daerah: 'Pasir Putih', ubahLokasi: true, lokasiDiubah: x.iso('09:25:00') });
  assert.strictEqual(k(1, 'revision'), rv + 2, 'sama = tanpa ubah lokasi (hanya Waktu Diterima)');
  // switching wajib section P0 yang baru; sesudah switching disimpan lokasi terkunci
  x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'SEBELUM', '09:05:00'));
  const sw = { switchingId: U(), p0Id: a.p0Id, sectionId: x.sek.lbs, indikatorRemote: 'Nyala', indikatorLocal: 'Padam',
    indikatorProtection: 'Nyala', indikatorReclose: 'Nyala', arusR: 45, arusS: 47.5, arusT: 44, dibuat: x.iso('09:09:00') };
  assert.strictEqual(e('simpanSwitchingYandal', sw), 'SECTION_BEDA_P0');
  assert.strictEqual(x.panggil('simpanSwitchingYandal', { ...sw, sectionId: x.sek.acr }).namaSwitching, 'ACR Toboali');
  assert.strictEqual(e('simpanP0Yandal', { ...a, sectionId: x.sek.lbs, ubahLokasi: true, lokasiDiubah: x.iso('09:25:00') }), 'SWITCHING_TERKUNCI');
  // P0 jenis lain: section bebas / boleh dikosongkan; P0 selesai = terkunci
  const b = x.p0({ dibuat: x.iso('09:21:00') });
  x.panggil('simpanP0Yandal', b);
  x.panggil('simpanP0Yandal', { ...b, penyulang: undefined, sectionId: undefined, daerah: 'Kantor', ubahLokasi: true, lokasiDiubah: x.iso('09:25:00') });
  assert.deepStrictEqual([k(2, 'Penyulang'), k(2, 'Section'), k(2, 'section_id'), k(2, 'Daerah')], ['', '', '', 'Kantor']);
  x.panggil('uploadFotoP0Yandal', x.foto(b.p0Id, 'SEBELUM', '09:22:00'));
  x.panggil('uploadFotoP0Yandal', x.foto(b.p0Id, 'PEKERJAAN', '09:23:00'));
  x.panggil('uploadFotoP0Yandal', x.foto(b.p0Id, 'SESUDAH', '09:24:00'));
  assert.strictEqual(e('simpanP0Yandal', { ...b, daerah: 'Lain', ubahLokasi: true, lokasiDiubah: x.iso('09:25:00') }), 'P0_SUDAH_SELESAI');
  assert.strictEqual(x.panggil('simpanP0Yandal', { ...b, penyulang: undefined, sectionId: undefined, daerah: 'Kantor', ubahLokasi: true, lokasiDiubah: x.iso('09:25:00') }).kodeP0, k(2, 'Kode P0'));
});

test('v0.66.0: ADMIN_perbaruiYanShift membuat sheet yan_Switching kalau belum ada', () => {
  const y = siapkanYandal();
  y.g.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  delete y.sheets.y.yan_Switching;
  y.g.ADMIN_perbaruiYanShift();
  assert.deepStrictEqual([...y.sheets.y.yan_Switching.data[0]].slice(0, 61), [...y.g.YAN_SWITCHING_HEADER_]);
});

// ---------- v0.66.2: audit guard semua endpoint (matriks akun x platform) ----------
test('v0.66.2: matriks guard: tiap endpoint bersesi hanya lolos untuk akun + platform yang berhak (isi data dicek SESUDAH peran)', () => {
  const x = siapkanP0();
  x.jam.atur('09:01:00');
  const akun = { yandal: x.s.token, row: x.login('16130.row01', x.ins2).token, admin: x.login('16130.admin', U()).token };
  const ep = x.g.endpoints_();
  const cek = (k, tok, pf) => { try { x.g.proses_({ action: k, token: tok, data: {} }, pf); return 'OK'; } catch (e) { return e.kode; } };
  const tolak = ['AKSES_DITOLAK', 'PILIHAN_TIDAK_VALID'];
  const matriks = {};
  // v0.78.0: endpoint x 2 platform > rem umum 90/menit per token; rem umum dilonggarkan di matriks ini saja (rem diuji di test sendiri)
  x.g.GUARD_BATAS_UMUM_ = 1000;
  for (const k of Object.keys(ep).filter((n) => !ep[n].publik && n !== 'logout').sort()) {
    matriks[k] = [];
    for (const [a, tok] of Object.entries(akun)) for (const pf of ['MOBILE', 'WEB']) if (!tolak.includes(cek(k, tok, pf))) matriks[k].push(a + '/' + pf);
  }
  const semua = ['yandal/MOBILE', 'yandal/WEB', 'row/MOBILE', 'row/WEB', 'admin/MOBILE', 'admin/WEB'];
  assert.deepStrictEqual(JSON.parse(JSON.stringify(matriks)), {
    cekSesi: semua, getMaster: semua,
    // menu ROW_LAPORAN / OPS_LAP_* tidak ada di db_Menu uji = semua ditolak (fail closed)
    getArsipHariRow: [], getArsipRow: [], getFotoArsipRow: [], getLaporanRow: [], getLaporanUiw: [], getLaporanUp3: [],
    simpanLaporanUiw: [], simpanLaporanUp3: [],
    // v0.70.0: OPS_BA_GARDU tidak ada di db_Menu uji = semua ditolak (peran admin dicek di test BA sendiri)
    getNomorGarduBaru: [], getOwnerIdGardu: [], simpanBaGardu: [], uploadFotoBaGardu: [],
    getDaftarBaGardu: [], buatPdfBaGardu: [], getBaGardu: [], getFotoBaGardu: [], getPdfBaGardu: [], ubahBaGardu: [],
    uploadTtdBaGardu: [], getTtdBaGardu: [], kirimEamBaGardu: [], updateMasterGarduBa: [], getFileArsipBaGardu: [],
    pesanNomorGardu: [], lepasNomorGardu: [],
    // v0.87.0: Hartek petugas, menu OPS_HARTEK_INPUT tidak ada di db_Menu uji = semua ditolak (fail closed)
    getMaterialHartek: [], getHartekHarian: [], getJaringanHartek: [], getJenisPekerjaanHartek: [], buatHeaderHartek: [], ubahHeaderHartek: [], simpanPgHartek: [], simpanPekerjaanHartek: [], ubahPekerjaanHartek: [],
    simpanMaterialHartek: [], simpanGroundingHartek: [], simpanPemerataanHartek: [], uploadFotoHartek: [],
    // v1.0.0: OPS_INSJAR_INPUT / OPS_INPUT_TEMUAN tidak ada di db_Menu uji = semua ditolak (fail closed)
    getMasterInsJar: [], getInsJarHarian: [], buatHeaderInsJar: [], ubahHeaderInsJar: [], simpanRealisasiInsJar: [], ubahRealisasiInsJar: [], simpanTemuanInsJar: [], ubahTemuanInsJar: [], uploadFotoInsJar: [],
    getMasterTemuanInspeksi: [], getTemuanInspeksi: [], simpanTemuanInspeksi: [], uploadFotoTemuanInspeksi: [],
    // v1.0.8: OPS_INSDU_INPUT tidak ada di db_Menu uji = semua ditolak (fail closed)
    getMasterInsDu: [], getInsDuHarian: [], buatHeaderInsDu: [], ubahHeaderInsDu: [], simpanRealisasiInsDu: [], ubahRealisasiInsDu: [], simpanPengukuranInsDu: [], hapusRealisasiInsDu: [], simpanTemuanInsDu: [], ubahTemuanInsDu: [], uploadFotoInsDu: [],
    // v1.0.10: OPS_PENERUSAN_WO / OPS_WO_TIM tidak ada di db_Menu uji = semua ditolak (fail closed)
    getWoAdmin: [], getFotoWoAdmin: [], teruskanWo: [], tarikWo: [], getWoPindah: [], getFotoWoPindah: [], pindahWo: [], getWoTim: [], getFotoWoTim: [], mulaiWo: [], simpanPekerjaanWo: [], hapusPekerjaanWo: [], uploadFotoWo: [], selesaiWo: [],
    getWoGanda: [], getFotoWoGanda: [], putuskanWoGanda: [],
    // v1.0.17: segel sinkron atomik, menu modul tim tidak ada di db_Menu uji = semua ditolak
    segelSinkronHartek: [], segelSinkronInsJar: [], segelSinkronInsDu: [],
    getArsipHartek: [], getArsipInsJar: [], getArsipInsDu: [],
    getMasterJadwalPadam: [], getJadwalPadam: [], getWaJadwalPadam: [], simpanJadwalPadam: [], ubahJadwalPadam: [], ubahStatusJadwalPadam: [], hapusJadwalPadam: [],
    // v1.0.17: kalender tim = petugas bertim (data tim sendiri, hanya baca). v1.0.18: semua akun (Beranda), non-tim = jadwal padam saja
    getKalenderTim: ['yandal/MOBILE', 'yandal/WEB', 'row/MOBILE', 'row/WEB', 'admin/MOBILE', 'admin/WEB'],
    // v1.0.19: lonceng + update APK = semua akun bersesi; foto temuan per menu (menu uji tidak ada = ditolak)
    getNotifikasi: ['yandal/MOBILE', 'yandal/WEB', 'row/MOBILE', 'row/WEB', 'admin/MOBILE', 'admin/WEB'],
    tandaiNotifikasi: ['yandal/MOBILE', 'yandal/WEB', 'row/MOBILE', 'row/WEB', 'admin/MOBILE', 'admin/WEB'],
    getUpdateApp: ['yandal/MOBILE', 'yandal/WEB', 'row/MOBILE', 'row/WEB', 'admin/MOBILE', 'admin/WEB'],
    getFotoTemuanInspeksi: [], getFotoTemuanInsJar: [], getFotoTemuanInsDu: [],
    getRiwayatGardu: [],
    // v0.75.0: OPS_VERIFIKASI_P0 tidak ada di db_Menu uji = semua ditolak (peran admin dicek di test approval)
    getApprovalP0: [], getFotoApprovalP0: [], simpanApprovalP0: [], ubahJenisP0: [], simpanAturanYandal: [],
    getArsipYandal: ['yandal/MOBILE'], getRankYandal: ['yandal/MOBILE', 'yandal/WEB', 'admin/MOBILE', 'admin/WEB'],
    // v0.99.0: menu ROW_LAPORAN tidak ada di db_Menu uji = semua ditolak (peran admin dicek di test laporan Yandal)
    getLaporanTimYandal: [],
    simpanP0Yandal: ['yandal/MOBILE'], uploadFotoP0Yandal: ['yandal/MOBILE'],
    simpanSwitchingYandal: ['yandal/MOBILE'], uploadFotoSwitchingYandal: ['yandal/MOBILE'],
    simpanGarduYandal: ['yandal/MOBILE'], uploadFotoGarduYandal: ['yandal/MOBILE'],
    getPetugasYandal: ['admin/MOBILE'], simpanPetugasYandal: ['admin/MOBILE'],
    // ROW tulis: hanya PETUGAS ROW dari HP; admin dengan menu * tetap ditolak (wajibPetugasRow_ paling awal)
    getKodeRow: ['row/MOBILE'], syncRow: ['row/MOBILE'], uploadFotoRow: ['row/MOBILE'],
    // getFotoRow baca: PETUGAS ROW tim sendiri, admin (menu *) semua tim
    getFotoRow: ['row/MOBILE', 'admin/MOBILE'],
    // v0.67.0: ganti password pemilik akun, semua platform; akun tim YANDAL ditolak (lewat admin)
    gantiPassword: ['row/MOBILE', 'row/WEB', 'admin/MOBILE', 'admin/WEB'],
    // v0.83.0: token notifikasi hanya dari HP, akun YANDAL + admin
    daftarNotif: ['yandal/MOBILE', 'admin/MOBILE'],
    // v0.85.0: menu OPS_ENGINE tidak ada di db_Menu uji = semua ditolak (peran admin dicek di test pemakaian)
    getPemakaian: [],
  });
});

// ---------- v0.67.0: sheet Gardu + BA (struktur dikunci) dan Ganti Password ----------
test('v0.67.0: header Rekap_BA 112 / db_Gardu 64 (v0.79.0) / db_Pejabat_BA 9, unik, masuk skema; kategori beban v1; beda struktur', () => {
  assert.deepStrictEqual([g.REKAP_BA_HEADER_.length, g.DB_GARDU_HEADER_.length, g.DB_PEJABAT_BA_HEADER_.length], [112, 64, 9]);
  for (const h of [g.REKAP_BA_HEADER_, g.DB_GARDU_HEADER_]) assert.strictEqual(new Set(h).size, h.length);
  const sk = g.skemaHeader_();
  assert.deepStrictEqual([...sk.GARDU_SHEET_ID.Rekap_BA], [...g.REKAP_BA_HEADER_]);
  assert.deepStrictEqual([...sk.GARDU_SHEET_ID.db_Gardu], [...g.DB_GARDU_HEADER_]);
  assert.deepStrictEqual([...sk.MASTER_SHEET_ID.db_Pejabat_BA], [...g.DB_PEJABAT_BA_HEADER_]);
  assert.deepStrictEqual([...g.REKAP_BA_HEADER_.slice(0, 5)], ['No', 'ID BA', 'No BA Full', 'Jenis Peralatan', 'Jenis Pekerjaan']);
  assert.ok(['Status BA', 'Revisi BA', 'Link BA TTD', 'Status TTD', 'BA Sebelumnya', 'Menggantikan BA', 'Digantikan Oleh BA', 'Asal Nomor Gardu',
    'Status Gardu Sesudah BA', 'switching_id', 'riwayat_meta', 'ttd_file_id'].every((h) => g.REKAP_BA_HEADER_.includes(h)));
  assert.ok(!g.REKAP_BA_HEADER_.some((h) => /Convert|Forward WA/i.test(h)), 'kolom convert / WA EAM dihapus');
  assert.ok(['No Gardu', 'Status Gardu', 'Asal Nomor', 'Lanjutan Dari Gardu', 'Nomor Dipakai Ulang', 'Kategori Beban', 'gardu_id'].every((h) => g.DB_GARDU_HEADER_.includes(h)));
  assert.deepStrictEqual([...g.GARDU_STATUS_], ['AKTIF', 'TIDAK AKTIF', 'BONGKAR RAMPUNG', 'BATAL']);
  assert.deepStrictEqual([0, 49.99, 50, 79.9, 80, 99.9, 100, 140, '', 'x'].map((v) => g.kategoriBeban_(v)),
    ['Underload', 'Underload', 'Cukup', 'Cukup', 'Overload', 'Overload', 'Buruk', 'Buruk', '', '']);
  assert.deepStrictEqual([...g.bedaStruktur_(['A', 'B', '', ''], ['A', 'B'])], []);
  assert.deepStrictEqual([...g.bedaStruktur_(['A', 'X', 'B'], ['A', 'B'])], ['B: harap "B", ada "X"', 'C: harap "-", ada "B"']);
  assert.strictEqual(g.kolomHuruf_(112), 'DH');
});

test('v0.67.0: ADMIN_siapkanSheetGardu membuat Rekap_BA + db_Gardu + db_Pejabat_BA; sudah ada = hanya dicek; struktur berubah = tolak tulis', () => {
  const gg = buatKonteks({ ...PROPS, PBKDF2_ITERASI: '1000', GARDU_SHEET_ID: 'g' });
  const log = [];
  const buat = sheetPalsu(log);
  const sheets = { m: {}, g: { Master_Gardu: buat('Master_Gardu', [['NO', 'ULP', 'GARDU'], [1, 'TOBOALI', 'PG0001']]) } };
  gg.SpreadsheetApp = { openById: (id) => ({ getSheetByName: (n) => sheets[id][n], insertSheet: (n) => { sheets[id][n] = buat(n, [[]]); return sheets[id][n]; } }) };
  gg.pastikanPemilik_ = () => {};
  gg.ADMIN_siapkanSheetGardu();
  assert.deepStrictEqual(sheets.g.Rekap_BA.data[0], [...gg.REKAP_BA_HEADER_]);
  assert.deepStrictEqual(sheets.g.db_Gardu.data[0], [...gg.DB_GARDU_HEADER_]);
  assert.deepStrictEqual(sheets.m.db_Pejabat_BA.data[0], [...gg.DB_PEJABAT_BA_HEADER_]);
  assert.deepStrictEqual(sheets.g.Master_Gardu.data, [['NO', 'ULP', 'GARDU'], [1, 'TOBOALI', 'PG0001']], 'tab lama tidak disentuh');
  // jalan ulang: tidak menulis apa pun
  sheets.g.db_Gardu.data.push(['1', 'TB0001']);
  const sebelum = JSON.stringify(sheets.g);
  log.length = 0;
  gg.ADMIN_siapkanSheetGardu();
  assert.strictEqual(JSON.stringify(sheets.g), sebelum);
  assert.ok(!log.some((x) => x.startsWith('TULIS')), 'sudah ada = hanya baca');
  assert.strictEqual(gg.cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu').rows.length, 1);
  // kolom disisipkan / diganti = STRUKTUR_BERUBAH (dikunci), ADMIN_siapkanSheetGardu tidak memperbaiki sendiri
  sheets.g.Rekap_BA.data[0].splice(3, 0, 'Kolom Sisipan');
  assert.strictEqual(kodeError(() => gg.cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA')), 'STRUKTUR_BERUBAH');
  gg.ADMIN_siapkanSheetGardu();
  assert.strictEqual(sheets.g.Rekap_BA.data[0][3], 'Kolom Sisipan');
  sheets.g.db_Gardu.data[0][1] = 'Nomor Gardu';
  assert.strictEqual(kodeError(() => gg.cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu')), 'STRUKTUR_BERUBAH');
  assert.strictEqual(kodeError(() => gg.cekStrukturGardu_('GARDU_SHEET_ID', 'Master_Gardu')), 'SHEET_TIDAK_ADA', 'bukan sheet v2');
});

test('v0.67.0: gantiPassword: password lama wajib benar, baru >= 10 & beda, sesi lain dicabut, sesi ini tetap, akun YANDAL ditolak', () => {
  const x = siapkanYandal();
  const lama = 'Rahasia-Toboali-2026', baru = 'Toboali-Baru-2026!';
  const s1 = x.login('16130.row01', x.ins1), s2 = x.login('16130.row01', x.ins2);
  const ganti = (tok, d) => kodeError(() => x.g.proses_({ action: 'gantiPassword', token: tok, data: d }, 'MOBILE'));
  assert.strictEqual(ganti(s1.token, { passwordLama: 'salah-salah-salah', passwordBaru: baru }), 'PASSWORD_LAMA_SALAH');
  assert.strictEqual(ganti(s1.token, { passwordLama: lama, passwordBaru: 'pendek' }), 'PASSWORD_TERLALU_PENDEK');
  assert.strictEqual(ganti(s1.token, { passwordLama: lama, passwordBaru: lama }), 'PASSWORD_SAMA');
  const r = x.j(x.g.proses_({ action: 'gantiPassword', token: s1.token, data: { passwordLama: lama, passwordBaru: baru } }, 'MOBILE')).data;
  assert.deepStrictEqual(r, { diganti: true, sesiLainDicabut: 1 });
  assert.strictEqual(kodeError(() => x.g.proses_({ action: 'cekSesi', token: s2.token, data: {} }, 'MOBILE')), 'SESI_DICABUT', 'HP lain keluar');
  assert.ok(x.g.proses_({ action: 'cekSesi', token: s1.token, data: {} }, 'MOBILE').ok, 'HP ini tetap masuk');
  assert.strictEqual(kodeError(() => x.g.login_(null, { username: '16130.row01', password: lama, installId: U() }, 'MOBILE')), 'LOGIN_GAGAL');
  assert.match(x.j(x.g.login_(null, { username: '16130.row01', password: baru, installId: U() }, 'MOBILE')).token, /^[0-9a-f]{64}$/);
  const aksi = x.sheets.a.log_Audit.data.map((b) => b[4]);
  assert.ok(aksi.includes('GANTI_PASSWORD') && aksi.includes('GANTI_PASSWORD_GAGAL'));
  assert.ok(!JSON.stringify(x.sheets.a.log_Audit.data).includes(baru), 'password tidak masuk log');
  // salah password lama 5x = ditolak sementara (tanpa lewat rem endpoint)
  const sesi = { userId: x.user.admin, username: '16130.admin', role: 'ADMIN', jenisTim: '', deviceId: 'd' };
  for (let i = 0; i < 5; i++) assert.strictEqual(kodeError(() => x.g.gantiPassword_(sesi, { passwordLama: 'salah' + i, passwordBaru: baru }, 'MOBILE')), 'PASSWORD_LAMA_SALAH');
  assert.strictEqual(kodeError(() => x.g.gantiPassword_(sesi, { passwordLama: lama, passwordBaru: baru }, 'MOBILE')), 'TERLALU_SERING');
  assert.strictEqual(kodeError(() => x.g.gantiPassword_({ ...sesi, username: 'toboali-admin1' }, { passwordLama: lama, passwordBaru: 'TOBOALI-ADMIN1' }, 'MOBILE')), 'PASSWORD_LEMAH');
  // akun tim YANDAL
  const y = x.mulai(x.login('16130.yandal13').tiket, [x.p.a]);
  assert.strictEqual(ganti(y.token, { passwordLama: lama, passwordBaru: baru }), 'AKSES_DITOLAK');
});

// ---------- v0.68.0 migrasi gardu ----------
function siapkanMigrasiGardu() {
  const gg = buatKonteks({ ...PROPS, PBKDF2_ITERASI: '1000', GARDU_SHEET_ID: 'g' });
  gg.pastikanPemilik_ = () => {};
  const log = [];
  const buat = sheetPalsu(log);
  const secA = U(), secB = U(), secC = U(), secD = U(), secE = U(), secF = U();
  const L = 156;
  const baris = (isi = {}) => { const b = new Array(L).fill(''); Object.entries(isi).forEach(([k, v]) => { b[Number(k) - 1] = v; }); return b; };
  const mg = [];
  for (let i = 1; i <= 10; i++) mg.push(baris(i === 7 ? { 1: 'NO', 2: 'ULP', 3: 'GARDU', 4: 'ALAMAT', 5: 'PENYULANG', 6: 'PTS/LBS' } : {}));
  mg.push(baris(Object.fromEntries(Array.from({ length: L }, (_, i) => [i + 1, i + 1]))));   // baris 11: nomor kolom
  const g1 = (no, isi = {}) => baris({ 1: 1, 2: 'TOBOALI', 3: no, 4: 'Jl. ' + no, 5: 'TB-01', ...isi });
  mg.push(baris({ 3: 'TB' }));                                                        // 12 pemisah prefix (oranye)
  mg.push(g1('TB0001', { 6: 'GH Toboali', 9: '-3,001234', 10: '106,456789', 11: 'PORTAL', 12: 'Trafindo', 13: '100', 15: '2019', 21: new Date('2026-09-01T17:00:00Z'), 22: 'PLN', 24: '4', 111: '120,5', 153: '85,3', 155: '85,3%' }));
  mg.push(g1('TB 2', { 6: 'GH Toboali' }));                                           // 14 dirapikan -> TB0002 (sudah ada di db_Gardu)
  mg.push(g1('TB0005', { 6: 'Kampung Baru - TB0003 - TB0005', 9: '106,1', 10: '-2,9' }));   // 15 versi lengkap, 2 calon -> bagian belakang; koordinat tertukar
  mg.push(g1('TB0009', { 6: 'Rias Baru - TB0011 - TB0040', 155: '120%' }));         // 2 calon, belakang tidak cocok = AMBIGU
  mg.push(g1('PG0007', { 5: 'TB-02', 6: 'Rias', 9: '-6,2', 10: '106,8' }));          // section unik di penyulang lain, koordinat di luar Babel
  mg.push(g1('XX0001'));                                                              // prefix asing
  mg.push(baris({ 2: 'KOBA', 3: 'TB0100' }));                                         // ULP lain
  const RL = 90;
  const rb = (isi = {}) => { const b = new Array(RL).fill(''); Object.entries(isi).forEach(([k, v]) => { b[Number(k) - 1] = v; }); return b; };
  const rk = [];
  for (let i = 1; i <= 9; i++) rk.push(rb(i === 6 ? { 2: 'Nomor Gardu', 4: 'Tanggal', 5: 'Jenis Pekerjaan', 80: 'NO BA Full' } : {}));
  rk.push(rb({ 2: 'TB0001', 4: new Date('2025-01-05T00:00:00Z'), 5: 'Pengoperasian Gardu', 21: 'OWN-1', 22: 'EXT-1', 80: 'No. 001 / BA - TRF / ULP - TBL / I / 2025' }));
  rk.push(rb({ 2: 'TB0009', 4: '10/02/2025', 5: 'Pengoperasian Trafo', 80: 'No. 002 / BA - TRF / ULP - TBL / II / 2025' }));
  rk.push(rb({ 2: 'TB0001', 4: '01/03/2026', 5: 'Penggantian Trafo', 37: '160', 80: 'No. 003 / BA - TRF / ULP - TBL / III / 2026' }));
  rk.push(rb({ 2: 'TB0009', 4: '05/04/2026', 5: 'Pembongkaran Sementara Trafo', 80: 'No. 004 / BA - TRF / ULP - TBL / IV / 2026' }));
  rk.push(rb({ 2: 'TB0010', 4: '06/01/2024', 5: 'Pengoperasian Trafo', 11: 'Jl. Rekap', 12: 'TB-01', 13: 'GH Toboali - TB0010', 6: '50', 7: 'B&D', 17: '-3,1', 18: '106,5', 80: 'No. 009 / BA - TRF / ULP - TBL / I / 2024' }));
  rk.push(rb({ 2: 'TB0010', 4: '07/05/2026', 5: 'Pembongkaran Trafo', 80: 'No. 010 / BA - TRF / ULP - TBL / V / 2026' }));
  rk.push(rb({ 2: 'LBS-01', 4: '07/05/2026', 5: 'Pengoperasian Switching' }));
  const dbg = [[...gg.DB_GARDU_HEADER_], gg.DB_GARDU_HEADER_.map((h) => ({ No: 1, 'No Gardu': 'TB0002', 'Status Gardu': 'AKTIF', gardu_id: U(), revision: 1 }[h] ?? ''))];
  const sheets = {
    m: { db_Jaringan: buat('db_Jaringan', [['section_id', 'penyulang', 'section', 'parent_section_id', 'urutan', 'aktif'],
      [secA, 'TB-01', 'GH Toboali', '', 1, true], [secB, 'TB-01', 'Kampung Baru - TB0005', secA, 2, true], [secC, 'TB-03', 'Rias', '', 1, true],
      [secD, 'TB-01', 'Kampung Baru - TB0099', secA, 3, true], [secE, 'TB-01', 'Rias Baru - TB0020', secA, 4, true], [secF, 'TB-01', 'Rias Baru - TB0030', secA, 5, true]]) },
    a: { log_Audit: buat('log_Audit', [['waktu', 'user_id', 'username', 'role', 'aksi', 'target', 'detail', 'platform', 'device_id']]) },
    g: { Master_Gardu: buat('Master_Gardu', mg), 'Rekap Gardu': buat('Rekap Gardu', rk), db_Gardu: buat('db_Gardu', dbg) },
  };
  gg.SpreadsheetApp = { openById: (id) => ({ getSheetByName: (n) => sheets[id][n] }) };
  return { gg, sheets, log, secA, secB, secC, secD, secE, secF };
}

test('v0.68.0: ADMIN_cekMigrasiGardu = pratinjau tanpa tulis', () => {
  const x = siapkanMigrasiGardu();
  const r = x.gg.ADMIN_cekMigrasiGardu();
  assert.ok(!x.log.some((l) => l.startsWith('TULIS')), 'pratinjau tidak menulis');
  assert.strictEqual(r.master, 5, 'TB0001, TB0002, TB0005, TB0009, PG0007 (pemisah, prefix asing, ULP lain dilewati)');
  assert.strictEqual(r.sudahAda, 1);
  assert.strictEqual(r.akanDitambah, 5, '4 dari Master + TB0010 dari Rekap');
  assert.strictEqual(r.hanyaRekap, 1);
  assert.strictEqual(r.rekapBa, 6, 'BA switching tidak ikut');
  assert.strictEqual(r.kolomNomorBa, 'CB');
  assert.strictEqual(r.blokir, 0);
  assert.deepStrictEqual([...r.nomorTerakhir], ['PG0007', 'TB0010']);
  assert.strictEqual(r.ambiguSection, 1);
  assert.strictEqual(r.penyulangBeda, 1, 'PG0007 TB-02 -> TB-03');
  assert.strictEqual(r.tanpaSection, 0);
  assert.strictEqual(r.koordinatKosong, 1);
});

test('v0.68.2: cocokSectionLama_ lewat bagian depan section (db_Jaringan = versi singkat yang benar)', () => {
  const j = [
    { section_id: 'a', penyulang: 'Pongok', section: 'FCO Jar Air Sagu - PG0004' },
    { section_id: 'b', penyulang: 'Pongok', section: 'LBS Pongok - PG0008' },
    { section_id: 'c', penyulang: 'Pongok', section: 'LBS Pongok - PG0010' },
    { section_id: 'd', penyulang: 'Kota', section: 'FCO Kota' },
  ];
  const c = (s, p) => { const r = g.cocokSectionLama_(s, p, j); return r.sec ? r.sec.section_id : r.alasan; };
  assert.strictEqual(c('FCO Jar Air Sagu - PG0001 - PG0004', 'Pongok'), 'a');
  assert.strictEqual(c('fco jar air sagu - PG0002', 'pongok'), 'a', 'huruf besar/kecil diabaikan');
  assert.strictEqual(c('LBS Pongok - PG0005 - PG0010', 'Pongok'), 'c', '2 calon: bagian belakang menentukan');
  assert.strictEqual(c('LBS Pongok - PG0005 - PG0009', 'Pongok'), 'AMBIGU');
  assert.strictEqual(c('LBS Pongok', 'Pongok'), 'AMBIGU');
  assert.strictEqual(c('FCO Kota - TB0001', 'Salah Ketik'), 'd', 'penyulang tanpa calon: unik di semua penyulang');
  assert.strictEqual(c('FCO Tidak Ada - X', 'Pongok'), 'TIDAK_ADA');
  assert.strictEqual(g.cocokSectionLama_('', 'Pongok', j).sec, undefined);
});

test('v0.68.0: ADMIN_migrasiGardu: pemetaan kolom, status dari BA lama, section db_Jaringan, koordinat, idempoten, sumber tidak ditulis', () => {
  const x = siapkanMigrasiGardu();
  const sebelumMg = JSON.stringify(x.sheets.g.Master_Gardu.data), sebelumRk = JSON.stringify(x.sheets.g['Rekap Gardu'].data);
  assert.deepStrictEqual({ ...x.gg.ADMIN_migrasiGardu() }, { ditulis: 5 });
  assert.strictEqual(JSON.stringify(x.sheets.g.Master_Gardu.data), sebelumMg, 'Master_Gardu tidak disentuh');
  assert.strictEqual(JSON.stringify(x.sheets.g['Rekap Gardu'].data), sebelumRk, 'Rekap Gardu tidak disentuh');
  const H = [...x.gg.DB_GARDU_HEADER_];
  const rows = x.sheets.g.db_Gardu.data.slice(1).map((b) => Object.fromEntries(H.map((h, i) => [h, b[i]])));
  const by = Object.fromEntries(rows.map((r) => [r['No Gardu'], r]));
  assert.deepStrictEqual(Object.keys(by).sort(), ['PG0007', 'TB0001', 'TB0002', 'TB0005', 'TB0009', 'TB0010']);
  const a = by.TB0001;
  assert.strictEqual(a.No, 2, 'No melanjutkan baris yang ada');
  assert.strictEqual(a.Prefix, 'TB');
  assert.strictEqual(a['Status Gardu'], 'AKTIF');
  assert.strictEqual(a['Asal Nomor'], 'BARU');
  assert.strictEqual(a.Section, 'GH Toboali');
  assert.strictEqual(a.section_id, x.secA);
  assert.strictEqual(a['PTS/LBS'], 'GH Toboali');
  assert.strictEqual(a.Lat, -3.001234);
  assert.strictEqual(a.Long, 106.456789);
  assert.strictEqual(a.Konstruksi, 'PORTAL');
  assert.strictEqual(a['Kapasitas (kVA)'], 100, 'Master_Gardu didahulukan dari BA Penggantian lama');
  assert.strictEqual(a.Tahun, 2019);
  assert.strictEqual(a['Jurusan Terpasang'], 4);
  assert.strictEqual(a.Kepemilikan, 'PLN');
  assert.strictEqual(a['Tanggal Ukur Terakhir'], '2026-09-02');
  assert.strictEqual(a['Arus Maks per Fasa (A)'], 120.5);
  assert.strictEqual(a['Pembebanan (kVA)'], 85.3);
  assert.strictEqual(a['Persentase Beban (%)'], 85.3);
  assert.strictEqual(a['Kategori Beban'], 'Overload');
  assert.strictEqual(a.OwnerId, 'OWN-1');
  assert.strictEqual(a['External Reference'], 'EXT-1');
  assert.strictEqual(a['BA Pengoperasian'], 'No. 001 / BA - TRF / ULP - TBL / I / 2025');
  assert.strictEqual(a['Tanggal Operasi'], '2025-01-05');
  assert.strictEqual(a['BA Terakhir'], 'No. 003 / BA - TRF / ULP - TBL / III / 2026');
  assert.strictEqual(a['Jenis BA Terakhir'], 'Penggantian Trafo');
  assert.strictEqual(a['Tanggal BA Terakhir'], '2026-03-01');
  assert.strictEqual(a['Jumlah BA'], 2);
  assert.strictEqual(a['Sumber Data'], 'MIGRASI V1 MASTER_GARDU baris 13');
  assert.match(a.gardu_id, /^[0-9a-f-]{36}$/);
  assert.strictEqual(a.revision, 1);
  assert.strictEqual(by.TB0005.Section, 'Kampung Baru - TB0005', 'bagian depan sama (2 calon), dipilih yang bagian belakangnya sama');
  assert.strictEqual(by.TB0005.section_id, x.secB);
  assert.strictEqual(by.TB0005['PTS/LBS'], 'Kampung Baru - TB0003 - TB0005', 'versi lengkap Master_Gardu disimpan');
  assert.strictEqual(by.TB0005.Lat, -2.9, 'koordinat tertukar dibalik');
  assert.strictEqual(by.TB0005.Long, 106.1);
  assert.strictEqual(by.TB0005['Jumlah BA'], 0);
  assert.strictEqual(by.TB0005['Status Gardu'], 'AKTIF', 'tanpa BA lama = AKTIF');
  assert.strictEqual(by.TB0009['Status Gardu'], 'TIDAK AKTIF', 'Pembongkaran Sementara terakhir');
  assert.strictEqual(by.TB0009.Section, '', 'AMBIGU = kosong');
  assert.strictEqual(by.TB0009.section_id, '');
  assert.strictEqual(by.TB0009['PTS/LBS'], 'Rias Baru - TB0011 - TB0040', 'teks asli disimpan');
  assert.strictEqual(by.TB0009['Kategori Beban'], 'Buruk');
  assert.strictEqual(by.PG0007.Section, 'Rias', 'section unik di penyulang lain');
  assert.strictEqual(by.PG0007.Penyulang, 'TB-03', 'penyulang ikut db_Jaringan');
  assert.strictEqual(by.PG0007.Lat, '', 'di luar Babel = dikosongkan');
  const r10 = by.TB0010;
  assert.strictEqual(r10['Status Gardu'], 'BONGKAR RAMPUNG');
  assert.strictEqual(r10.Alamat, 'Jl. Rekap');
  assert.strictEqual(r10.section_id, x.secA, 'GH Toboali - TB0010 -> bagian depan GH Toboali');
  assert.strictEqual(r10.Section, 'GH Toboali');
  assert.strictEqual(r10['Kapasitas (kVA)'], 50);
  assert.strictEqual(r10.Merk, 'B&D');
  assert.strictEqual(r10.Lat, -3.1);
  assert.strictEqual(r10.ULP, 'Toboali');
  assert.strictEqual(r10['Sumber Data'], 'MIGRASI V1 REKAP GARDU baris 14');
  assert.strictEqual(r10['Jumlah BA'], 2);
  assert.ok(x.sheets.a.log_Audit.data.some((b) => b[4] === 'MIGRASI_GARDU'));
  // jalan ulang: tidak ada yang ditambah, baris yang ada tidak ditimpa
  x.sheets.g.db_Gardu.data[2][H.indexOf('Alamat')] = 'diubah admin';
  const sebelum = JSON.stringify(x.sheets.g.db_Gardu.data);
  assert.deepStrictEqual({ ...x.gg.ADMIN_migrasiGardu() }, { ditulis: 0 });
  assert.strictEqual(JSON.stringify(x.sheets.g.db_Gardu.data), sebelum);
});

test('v0.68.0: ADMIN_migrasiGardu ditolak (tidak menulis) bila No Gardu ganda / kolom Master_Gardu bergeser / db_Gardu berubah struktur', () => {
  const x = siapkanMigrasiGardu();
  const mg = x.sheets.g.Master_Gardu.data;
  mg.push([...mg[14]]); mg[mg.length - 1][2] = 'TB-0005';
  assert.deepStrictEqual({ ...x.gg.ADMIN_migrasiGardu() }, { ditulis: 0, blokir: 1 });
  assert.strictEqual(x.sheets.g.db_Gardu.data.length, 2);
  mg.pop();
  mg[10].splice(5, 0, 'x');   // kolom disisipkan: nomor kolom bergeser
  assert.ok(x.gg.ADMIN_migrasiGardu().blokir >= 1);
  assert.strictEqual(x.sheets.g.db_Gardu.data.length, 2);
  mg[10].splice(5, 1);
  x.sheets.g['Rekap Gardu'].data[5][4] = 'Uraian';   // judul kolom E Rekap Gardu bukan Jenis Pekerjaan
  assert.strictEqual(x.gg.ADMIN_migrasiGardu().blokir, 1);
  x.sheets.g['Rekap Gardu'].data[5][4] = 'Jenis Pekerjaan';
  x.sheets.g.db_Gardu.data[0][3] = 'Unit';
  assert.strictEqual(kodeError(() => x.gg.ADMIN_migrasiGardu()), 'STRUKTUR_BERUBAH');
  x.sheets.g.db_Gardu.data[0][3] = 'ULP';
  assert.strictEqual(x.gg.ADMIN_migrasiGardu().ditulis, 5);
});

test('v0.68.0: pembaca nilai lama (nomor gardu, angka, tahun, koordinat, tanggal, jenis BA)', () => {
  const p = g.parseNoGarduLama_;
  assert.strictEqual(p('tb 414').nomor, 'TB0414');
  assert.strictEqual(p('PG-0007').nomor, 'PG0007');
  assert.strictEqual(p('TB0414').dinormalkan, false);
  assert.strictEqual(p('TB'), null);
  assert.strictEqual(p('TB0000'), null);
  assert.strictEqual(g.angkaGarduLama_('1.234,5'), 1234.5);
  assert.strictEqual(g.angkaGarduLama_('85,3%'), 85.3);
  assert.strictEqual(g.angkaGarduLama_('100 kVA'), 100);
  assert.strictEqual(g.angkaGarduLama_('-'), '');
  assert.strictEqual(g.tahunLama_('2019'), 2019);
  assert.strictEqual(g.tahunLama_('19'), '');
  assert.deepStrictEqual({ ...g.koordinatLama_('-2.64, 105.96', '') }, { lat: -2.64, lng: 105.96 });
  assert.deepStrictEqual({ ...g.koordinatLama_('', '') }, {});
  assert.ok(g.koordinatLama_('-6.2', '106.8').masalah);
  assert.strictEqual(g.tanggalLama_('', '05/04/2026'), '2026-04-05');
  assert.strictEqual(g.tanggalLama_('', 'kemarin'), '');
  assert.strictEqual(g.jenisBaLama_('Pembongkaran Sementara Trafo'), 'BONGKAR_SEMENTARA');
  assert.strictEqual(g.jenisBaLama_('Bongkar Gardu'), 'BONGKAR');
  assert.strictEqual(g.jenisBaLama_('Pengoperasian Gardu'), 'OPERASI');
  assert.strictEqual(g.jenisBaLama_('Penggantian Trafo'), 'GANTI');
  assert.strictEqual(g.jenisBaLama_('Pemeriksaan Trafo'), 'PERIKSA');
  assert.strictEqual(g.jenisBaLama_('Pengoperasian LBS'), 'LAIN');
});

test('v0.68.0: tidak ada nama fungsi / var global ganda antar file backend (Apps Script = satu ruang nama, yang terakhir dimuat menimpa)', () => {
  const fs = require('fs'), path = require('path');
  const src = path.join(__dirname, '..', 'backend', 'src');
  const files = [];
  (function jalan(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) jalan(p); else if (f.endsWith('.js')) files.push(p); } })(src);
  const lihat = {}, ganda = [];
  for (const f of files) {
    const teks = fs.readFileSync(f, 'utf8');
    for (const m of teks.matchAll(/^(?:function\s+([A-Za-z0-9_$]+)\s*\(|var\s+([A-Za-z0-9_$]+)\s*=)/gm)) {
      const n = m[1] || m[2];
      if (lihat[n] && lihat[n] !== f) ganda.push(n + ' (' + path.basename(lihat[n]) + ', ' + path.basename(f) + ')');
      else lihat[n] = f;
    }
  }
  assert.deepStrictEqual(ganda, []);
});

test('v0.68.1: GARDU_LAMA_SHEET_ID: sumber lama dibaca dari file lain (hanya dibaca), db_Gardu ditulis di GARDU_SHEET_ID; kosong = file yang sama', () => {
  const x = siapkanMigrasiGardu();
  const gg = buatKonteks({ ...PROPS, PBKDF2_ITERASI: '1000', GARDU_SHEET_ID: 'g', GARDU_LAMA_SHEET_ID: 'asli' });
  gg.pastikanPemilik_ = () => {};
  const lama = { Master_Gardu: x.sheets.g.Master_Gardu, 'Rekap Gardu': x.sheets.g['Rekap Gardu'] };
  delete x.sheets.g.Master_Gardu; delete x.sheets.g['Rekap Gardu'];
  x.sheets.asli = lama;
  gg.SpreadsheetApp = x.gg.SpreadsheetApp;
  assert.strictEqual(gg.cfg_().GARDU_LAMA_SHEET_ID, 'asli');
  assert.strictEqual(x.gg.cfg_().GARDU_LAMA_SHEET_ID, 'g', 'kosong = GARDU_SHEET_ID');
  const sebelum = JSON.stringify(x.sheets.asli);
  x.log.length = 0;
  assert.strictEqual(gg.ADMIN_migrasiGardu().ditulis, 5);
  assert.strictEqual(JSON.stringify(x.sheets.asli), sebelum, 'file asli tidak ditulis');
  assert.ok(!x.log.some((l) => /^TULIS:(Master_Gardu|Rekap Gardu)$/.test(l)));
  assert.strictEqual(x.sheets.g.db_Gardu.data.length, 7);
  // file staging tanpa tab lama & tanpa GARDU_LAMA_SHEET_ID = BLOKIR, tidak menulis
  assert.deepStrictEqual({ ...x.gg.ADMIN_migrasiGardu() }, { ditulis: 0, blokir: 1 });
});

// ---------- v0.69.0 master gardu (getMaster modul opsional) ----------
function siapkanMasterGardu() {
  const gg = buatKonteks({ ...PROPS, PBKDF2_ITERASI: '1000', GARDU_SHEET_ID: 'g' });
  const buat = sheetPalsu([]);
  const H = [...gg.DB_GARDU_HEADER_];
  const gb = (isi) => H.map((h) => (isi[h] === undefined ? '' : isi[h]));
  const id = { a: U(), b: U(), c: U(), d: U() };
  const sheets = {
    m: {
      db_Menu: buat('db_Menu', [['menu_kode', 'nama', 'platform', 'khusus_super', 'urutan', 'aktif'],
        ['OPS_PENGUKURAN_GARDU', 'Pengukuran Gardu', 'MOBILE', false, 40, true], ['OPS_BA_GARDU', 'Berita Acara Gardu', 'MOBILE', false, 41, true],
        ['ROW_EKSEKUSI', 'Eksekusi ROW', 'MOBILE', false, 1, true]]),
      db_Akses: buat('db_Akses', [['role', 'jenis_tim', 'menu_kode', 'aksi'], ['ADMIN', '*', '*', 'UBAH'],
        ['ADMIN_ES', '*', 'OPS_PENGUKURAN_GARDU', 'LIHAT'], ['PETUGAS', 'ROW', 'ROW_EKSEKUSI', 'UBAH']]),
      db_Tim: buat('db_Tim', [['tim_id', 'kode', 'nama', 'jenis', 'aktif']]),
      db_Jaringan: buat('db_Jaringan', [['section_id', 'penyulang', 'section', 'parent_section_id', 'urutan', 'aktif']]),
      db_Jenis_Pekerjaan: buat('db_Jenis_Pekerjaan', [['jenis_id', 'modul', 'nama', 'satuan', 'diameter_min', 'diameter_max', 'urutan', 'aktif']]),
      db_Users: buat('db_Users', [['user_id', 'username', 'nama', 'role', 'tim_id', 'aktif']]),
      db_Pejabat_BA: buat('db_Pejabat_BA', [[...gg.DB_PEJABAT_BA_HEADER_],
        [U(), 'Budi', 'Supervisor Teknik', 'pemeriksa', 2, true, 1, '', ''], [U(), 'Andi', 'Manager ULP', 'MENGETAHUI', 1, true, 1, '', ''], ['', 'Tanpa ID', 'x', 'PEMERIKSA', 3, true, 1, '', '']]),
    },
    g: {
      db_Gardu: buat('db_Gardu', [H,
        gb({ No: 1, 'No Gardu': 'TB0002', Prefix: 'TB', 'Status Gardu': 'AKTIF', Alamat: 'Jl. A', Penyulang: 'TB-01', 'Kapasitas (kVA)': 100, Lat: -3.01, Long: 106.45,
             'Persentase Beban (%)': '85,3', 'Tanggal Ukur Terakhir': new Date('2026-09-01T17:00:00Z'), 'Jumlah BA': 2, gardu_id: id.a, revision: 3 }),
        gb({ No: 2, 'No Gardu': 'TB0001', Prefix: 'TB', 'Status Gardu': 'TIDAK AKTIF', gardu_id: id.b, revision: 1 }),
        gb({ No: 3, 'No Gardu': 'TB0003', Prefix: 'TB', 'Status Gardu': 'BONGKAR RAMPUNG', gardu_id: id.c, revision: 1 }),
        gb({ No: 4, 'No Gardu': 'TB0004', Prefix: 'TB', 'Status Gardu': 'BATAL', gardu_id: id.d, revision: 1 }),
        gb({ No: 5, 'No Gardu': 'TB0005', Prefix: 'TB', 'Status Gardu': 'AKTIF', revision: 1 })]),   // tanpa gardu_id
    },
  };
  gg.SpreadsheetApp = { openById: (i) => ({ getSheetByName: (n) => sheets[i][n] }) };
  const sesi = (role, jenisTim = '') => ({ userId: U(), username: 'u', role, jenisTim, timId: '' });
  return { gg, sheets, id, sesi };
}

test('v0.69.0: getMaster modul gardu + pejabatBa: opsional, AKTIF + TIDAK AKTIF saja, akses per menu, versi', () => {
  const x = siapkanMasterGardu();
  const admin = x.sesi('ADMIN');
  const r = JSON.parse(JSON.stringify(x.gg.getMaster_(admin, { modul: ['gardu', 'pejabatBa'] })));
  const gardu = r.modul.gardu.isi;
  assert.deepStrictEqual(gardu.map((g) => [g.no, g.status]), [['TB0001', 'TIDAK AKTIF'], ['TB0002', 'AKTIF']], 'urut No Gardu, BONGKAR / BATAL / tanpa id tidak dikirim');
  const a = gardu[1];
  assert.strictEqual(a.id, x.id.a);
  assert.strictEqual(a.kva, 100);
  assert.strictEqual(a.lat, -3.01);
  assert.strictEqual(a.persen, 85.3);
  assert.strictEqual(a.kategori, 'Overload');
  assert.strictEqual(a.tglUkur, '2026-09-02', 'Date sheet = tanggal WIB');
  assert.strictEqual(a.jumlahBa, 2);
  assert.strictEqual(a.revision, 3);
  assert.strictEqual(gardu[0].persen, null);
  assert.strictEqual(gardu[0].kategori, '');
  assert.deepStrictEqual(r.modul.pejabatBa.isi.map((p) => [p.nama, p.peran]), [['Andi', 'MENGETAHUI'], ['Budi', 'PEMERIKSA']]);
  // versi sama = tidak dikirim ulang
  const r2 = x.gg.getMaster_(admin, { modul: ['gardu'], versiModul: { gardu: r.modul.gardu.versi } });
  assert.strictEqual(r2.modul.gardu.berubah, false);
  assert.strictEqual(r2.modul.gardu.isi, undefined);
  // default (tanpa modul) tidak ikut membaca gardu
  const def = x.gg.getMaster_(x.sesi('ADMIN'), {});
  assert.ok(!('gardu' in def.modul) && !('pejabatBa' in def.modul));
  // akses
  assert.strictEqual(kodeError(() => x.gg.getMaster_(x.sesi('PETUGAS', 'ROW'), { modul: ['gardu'] })), 'AKSES_DITOLAK');
  assert.strictEqual(x.gg.getMaster_(x.sesi('ADMIN_ES'), { modul: ['gardu'] }).modul.gardu.jumlah, 2, 'LIHAT Pengukuran Gardu cukup');
  assert.strictEqual(kodeError(() => x.gg.getMaster_(x.sesi('ADMIN_ES'), { modul: ['pejabatBa'] })), 'AKSES_DITOLAK', 'pejabat hanya menu BA');
  assert.strictEqual(kodeError(() => x.gg.getMaster_(admin, { modul: ['constructor'] })), 'FORMAT_SALAH');
  // struktur db_Gardu berubah = ditolak
  x.sheets.g.db_Gardu.data[0][1] = 'Nomor';
  assert.strictEqual(kodeError(() => x.gg.getMaster_(admin, { modul: ['gardu'] })), 'STRUKTUR_BERUBAH');
});

// ---------- v0.70.0 BA Pengoperasian Trafo ----------
function siapkanBa() {
  const gg = buatKonteks({ ...PROPS, PBKDF2_ITERASI: '1000', GARDU_SHEET_ID: 'g', GARDU_LAMA_SHEET_ID: 'lama', GARDU_FOTO_FOLDER_ID: 'akarBa' });
  const log = [];
  const buat = sheetPalsu(log);
  const dr = driveTiruan();
  gg.DriveApp = dr.DriveApp;
  gg.Utilities.newBlob = (bytes, mime, nama) => ({ bytes, mime, nama });
  const hari = gg.tglJakarta_(new Date()), y = hari.slice(0, 4), m = hari.slice(5, 7);
  const sec = { kb: U(), gh: U() }, pj = { a: U(), b: U(), tahu: U(), mati: U() }, batalId = U();
  const HG = [...gg.DB_GARDU_HEADER_], HR = [...gg.REKAP_BA_HEADER_];
  const baris = (H, isi) => H.map((h) => (isi[h] === undefined ? '' : isi[h]));
  const kosong = (n, L) => Array.from({ length: n }, () => new Array(L).fill(''));
  const mg = kosong(11, 30); mg.push(Object.assign(new Array(30).fill(''), { 2: 'TB0419' }), Object.assign(new Array(30).fill(''), { 2: 'PG0008' }));
  const rk = kosong(9, 90); rk[5][1] = 'Nomor Gardu'; rk[5][79] = 'NO BA Full'; rk[5][80] = 'idBA';
  rk.push(Object.assign(new Array(90).fill(''), { 1: 'TB0421', 79: `No. 007 / BA - TRF / ULP - TBL / ${Number(m)} / ${y}`, 80: `BA-GRD-TBL-${y}${m}-009` }));
  const own = kosong(5, 13);
  own[0][8] = 'TB-01'; own[0][7] = 'GI Toboali'; own[1][0] = 'GI Toboali'; own[1][1] = '7';
  own[2][3] = 'TB-01'; own[2][4] = '3'; own[2][5] = '2';
  own[3][9] = 'KAMPUNG BARU - TB0005 - X'; own[3][10] = '4'; own[3][11] = 'LBS'; own[3][12] = 'LBS Kampung Baru';
  const sheets = {
    m: {
      db_Jaringan: buat('db_Jaringan', [['section_id', 'penyulang', 'section', 'parent_section_id', 'urutan', 'aktif'],
        [sec.kb, 'TB-01', 'Kampung Baru - TB0005', '', 1, true], [sec.gh, 'TB-01', 'GH Toboali', '', 2, false]]),
      db_Pejabat_BA: buat('db_Pejabat_BA', [[...gg.DB_PEJABAT_BA_HEADER_],
        [pj.a, 'Andi', 'Supervisor Teknik', 'PEMERIKSA', 1, true, 1, '', ''], [pj.b, 'Budi', 'Teknisi', 'pemeriksa', 2, true, 1, '', ''],
        [pj.tahu, 'Citra', 'Manager ULP Toboali', 'MENGETAHUI', 3, true, 1, '', ''], [pj.mati, 'Dodi', 'Lama', 'PEMERIKSA', 4, false, 1, '', '']]),
    },
    a: { log_Audit: buat('log_Audit', [['waktu', 'user_id', 'username', 'role', 'aksi', 'target', 'detail', 'platform', 'device_id']]) },
    g: {
      db_Gardu: buat('db_Gardu', [HG,
        baris(HG, { No: 1, 'No Gardu': 'TB0002', Prefix: 'TB', 'Status Gardu': 'AKTIF', gardu_id: U(), revision: 1 }),
        baris(HG, { No: 2, 'No Gardu': 'TB0010', Prefix: 'TB', 'Status Gardu': 'BATAL', Alamat: 'Lama', 'Jumlah BA': 1, gardu_id: batalId, revision: 2 })]),
      Rekap_BA: buat('Rekap_BA', [HR, baris(HR, { No: 1, 'ID BA': `BA-GRD-TBL-${y}${m}-003`, 'No BA Full': `No. 008 / BA - TRF / ULP - TBL / ${Number(m)} / ${y}`, ba_id: U() })]),
    },
    lama: { Master_Gardu: buat('Master_Gardu', mg), 'Rekap Gardu': buat('Rekap Gardu', rk), OwnerId: buat('OwnerId', own) },
  };
  gg.SpreadsheetApp = { openById: (i) => ({ getSheetByName: (n) => sheets[i][n] }) };
  const admin = { userId: U(), username: '16130.admin', role: 'ADMIN', jenisTim: '', timId: '', deviceId: 'd1' };
  const foto = (baId, slot, buf = jpeg(800, 600), sumber = 'GALERI') =>
    gg.uploadFotoBaGardu_(admin, { baId, jenis: 'Pengoperasian Trafo', slot, sumber, sha256: crypto.createHash('sha256').update(buf).digest('hex'), ukuranByte: buf.length, data: buf.toString('base64') });
  const semuaFoto = (baId) => ['NAMEPLATE', 'FULL_GARDU', 'NAMEPLATE_PHB', 'BOX_PHB'].map((s) => foto(baId, s));
  const isi = (baId, tambah = {}) => ({ baId, jenis: 'Pengoperasian Trafo', prefix: 'TB', tanggalBa: hari, tanggalPekerjaan: hari, sectionId: sec.kb,
    alamat: 'Jl. Baru', koordinat: '-3.012345, 106.456789', konstruksi: 'Portal', kva: 100, merk: 'Trafindo', seri: 'SN-1', tahun: 2025, jurusan: 4,
    merkPhb: 'Schneider', seriPhb: 'P-1', tahunPhb: 2025, kepemilikan: 'PLN', perluasanSutm: 0.5, vendor: 'CV Maju', petugas1Id: pj.a, petugas2Id: pj.b, ...tambah });
  const objek = (H, b) => Object.fromEntries(H.map((h, i) => [h, b[i]]));
  return { gg, sheets, dr, admin, foto, semuaFoto, isi, sec, pj, batalId, y, m, hari, HG, HR, objek };
}

test('v0.70.0: getNomorGarduBaru: lanjut nomor terbesar db_Gardu + Master_Gardu + Rekap Gardu lama, tawarkan nomor BATAL; khusus admin', () => {
  const x = siapkanBa();
  const r = JSON.parse(JSON.stringify(x.gg.getNomorGarduBaru_(x.admin, { prefix: 'TB' })));
  assert.deepStrictEqual([r.nomor, r.terakhir], ['TB0422', 'TB0421'], 'Rekap Gardu lama TB0421 > Master_Gardu TB0419');
  assert.deepStrictEqual(r.batal.map((b) => b.noGardu), ['TB0010']);
  assert.strictEqual(x.gg.getNomorGarduBaru_(x.admin, { prefix: 'PG' }).nomor, 'PG0009');
  assert.strictEqual(x.gg.getNomorGarduBaru_(x.admin, { prefix: 'TL' }).nomor, 'TL0001');
  assert.strictEqual(kodeError(() => x.gg.getNomorGarduBaru_({ ...x.admin, role: 'ADMIN_ES' }, { prefix: 'TB' })), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.gg.getNomorGarduBaru_(x.admin, { prefix: 'XX' })), 'PILIHAN_TIDAK_VALID');
  const o = x.gg.getOwnerIdGardu_(x.admin, { sectionId: x.sec.kb });
  assert.deepStrictEqual([o.ditemukan, o.ownerId, o.externalReference], [true, '07020304', 'SECTION - LBS - LBS Kampung Baru'], 'algoritma OwnerId v1');
  assert.strictEqual(kodeError(() => x.gg.getOwnerIdGardu_(x.admin, { sectionId: x.sec.gh })), 'SECTION_TIDAK_VALID', 'section nonaktif');
});

test('v0.70.0: simpanBaGardu Pengoperasian Trafo: foto wajib, nomor dari server, Rekap_BA + db_Gardu satu lock, DUPLIKAT, foto terkunci sesudah simpan', () => {
  const x = siapkanBa();
  const baId = U();
  assert.strictEqual(kodeError(() => x.gg.simpanBaGardu_(x.admin, x.isi(baId))), 'FOTO_BELUM_LENGKAP');
  const up = x.semuaFoto(baId);
  assert.ok(up.every((u) => u.status === 'OK'));
  assert.strictEqual(x.foto(baId, 'NAMEPLATE', jpeg(640, 480), 'KAMERA').status, 'DIGANTI', 'pilih ulang foto sebelum simpan');
  assert.strictEqual(kodeError(() => x.foto(baId, 'SLD')), 'FORMAT_SALAH');
  const r = JSON.parse(JSON.stringify(x.gg.simpanBaGardu_(x.admin, x.isi(baId))));
  assert.strictEqual(r.status, 'OK');
  assert.strictEqual(r.noGardu, 'TB0422');
  assert.strictEqual(r.idBa, `BA-GRD-TBL-${x.y}${x.m}-010`, 'lanjut idBA lama 009 (Rekap_BA 003)');
  assert.strictEqual(r.noBaFull, `No. 009 / BA - TRF / ULP - TBL / ${Number(x.m)} / ${x.y}`, 'lanjut No BA Full Rekap_BA 008 (lama 007)');
  assert.strictEqual(r.ownerId, '07020304');
  assert.deepStrictEqual(r.peringatan, []);
  const g = x.objek(x.HG, x.sheets.g.db_Gardu.data[3]);
  assert.deepStrictEqual([g.No, g['No Gardu'], g.Prefix, g['Status Gardu'], g['Asal Nomor'], g.Penyulang, g.Section, g.section_id, g.Lat, g.Long],
    [3, 'TB0422', 'TB', 'AKTIF', 'BARU', 'TB-01', 'Kampung Baru - TB0005', x.sec.kb, -3.012345, 106.456789]);
  assert.deepStrictEqual([g['Kapasitas (kVA)'], g.Merk, g.Tahun, g['Jurusan Terpasang'], g.Konstruksi, g.Kepemilikan, g['Merk PHB-TR']], [100, 'Trafindo', 2025, 4, 'Portal', 'PLN', 'Schneider']);
  assert.deepStrictEqual([g['BA Pengoperasian'], g['BA Terakhir'], g['Jenis BA Terakhir'], g['Jumlah BA'], g.ba_id_pengoperasian, g.ba_id_terakhir, g['Sumber Data']],
    [r.noBaFull, r.noBaFull, 'Pengoperasian Trafo', 1, baId, baId, 'BA V2']);
  assert.strictEqual(g.gardu_id, r.garduId);
  const b = x.objek(x.HR, x.sheets.g.Rekap_BA.data[2]);
  assert.deepStrictEqual([b.No, b['Jenis Peralatan'], b['Jenis Pekerjaan'], b['Nama Peralatan'], b['Status Gardu Sesudah BA'], b['Asal Nomor Gardu'], b['Status BA'], b['Status PDF']],
    [2, 'TRAFO', 'Pengoperasian Trafo', 'TB0422', 'AKTIF', 'BARU', 'AKTIF', 'BELUM']);
  assert.deepStrictEqual([b['Petugas 1'], b['Jabatan Petugas 1'], b['Petugas 2'], b.Mengetahui, b['Jabatan Mengetahui'], b.pejabat_id_mengetahui],
    ['Andi', 'Supervisor Teknik', 'Budi', 'Citra', 'Manager ULP Toboali', x.pj.tahu]);
  assert.deepStrictEqual([b['Panjang Perluasan SUTM (kmS)'], b['Vendor Pekerja'], b.OwnerId, b['External Reference']], [0.5, 'CV Maju', '07020304', 'SECTION - LBS - LBS Kampung Baru']);
  for (const k of ['Foto Nameplate', 'Foto Konstruksi', 'Foto Nameplate PHB-TR', 'Foto Box PHB-TR']) assert.match(b[k], /^https:\/\/drive\.google\.com\/file\/d\/file\d+\/view$/);
  assert.strictEqual(Object.keys(JSON.parse(b.foto_meta)).length, 4);
  assert.strictEqual(b.gardu_id, g.gardu_id);
  assert.ok(x.sheets.a.log_Audit.data.some((l) => l[4] === 'BA_GARDU_SIMPAN'));
  // kirim ulang = DUPLIKAT, tidak ada baris baru
  const r2 = x.gg.simpanBaGardu_(x.admin, x.isi(baId));
  assert.deepStrictEqual([r2.status, r2.noGardu, r2.idBa], ['DUPLIKAT', 'TB0422', r.idBa]);
  assert.deepStrictEqual([x.sheets.g.db_Gardu.data.length, x.sheets.g.Rekap_BA.data.length], [4, 3]);
  assert.strictEqual(kodeError(() => x.foto(baId, 'BOX_PHB')), 'BA_SUDAH_DISIMPAN');
  // BA berikutnya: nomor berikut
  const id2 = U(); x.semuaFoto(id2);
  const r3 = x.gg.simpanBaGardu_(x.admin, x.isi(id2));
  assert.deepStrictEqual([r3.noGardu, r3.idBa], ['TB0423', `BA-GRD-TBL-${x.y}${x.m}-011`]);
});

test('v0.70.0: simpanBaGardu pakai ulang nomor BATAL (baris & gardu_id sama), validasi isian, perbaikan kiriman setengah jadi', () => {
  const x = siapkanBa();
  const id1 = U(); x.semuaFoto(id1);
  const r = x.gg.simpanBaGardu_(x.admin, x.isi(id1, { nomorBatalId: x.batalId }));
  assert.deepStrictEqual([r.noGardu, r.garduId], ['TB0010', x.batalId]);
  const g = x.objek(x.HG, x.sheets.g.db_Gardu.data[2]);
  assert.deepStrictEqual([g['Status Gardu'], g['Asal Nomor'], g.Alamat, g['Jumlah BA'], g.revision, g.ba_id_pengoperasian], ['AKTIF', 'ULANG BATAL', 'Jl. Baru', 2, 3, id1]);
  assert.strictEqual(x.sheets.g.db_Gardu.data.length, 3, 'tidak ada baris gardu baru');
  assert.strictEqual(x.objek(x.HR, x.sheets.g.Rekap_BA.data[2])['Asal Nomor Gardu'], 'ULANG BATAL');
  const id2 = U(); x.semuaFoto(id2);
  assert.strictEqual(kodeError(() => x.gg.simpanBaGardu_(x.admin, x.isi(id2, { nomorBatalId: x.batalId }))), 'NOMOR_BATAL_TIDAK_TERSEDIA', 'sudah dipakai');
  // validasi
  const besok = x.gg.tglJakarta_(new Date(Date.now() + 2 * 864e5));
  const salah = (t) => kodeError(() => x.gg.simpanBaGardu_(x.admin, x.isi(id2, t)));
  assert.strictEqual(salah({ tanggalBa: besok, tanggalPekerjaan: besok }), 'TANGGAL_TIDAK_VALID');
  assert.strictEqual(salah({ tanggalPekerjaan: besok }), 'TANGGAL_TIDAK_VALID');
  assert.strictEqual(salah({ petugas1Id: x.pj.tahu }), 'PEJABAT_TIDAK_VALID', 'MENGETAHUI bukan pemeriksa');
  assert.strictEqual(salah({ petugas1Id: x.pj.mati }), 'PEJABAT_TIDAK_VALID', 'nonaktif');
  assert.strictEqual(salah({ petugas2Id: x.pj.a }), 'PEJABAT_TIDAK_VALID', 'petugas 2 = petugas 1');
  assert.strictEqual(salah({ jenis: 'Pemeriksaan Trafo' }), 'JENIS_BA_BELUM_TERSEDIA');
  assert.strictEqual(salah({ konstruksi: 'Menara' }), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(salah({ koordinat: '-6.2, 106.8' }), 'KOORDINAT_DI_LUAR_AREA');
  assert.strictEqual(salah({ jurusan: 0 }), 'DI_LUAR_RENTANG');
  assert.strictEqual(kodeError(() => x.gg.simpanBaGardu_({ ...x.admin, role: 'PETUGAS' }, x.isi(id2))), 'AKSES_DITOLAK');
  x.sheets.m.db_Pejabat_BA.data[3][5] = false;
  assert.strictEqual(salah({}), 'PEJABAT_MENGETAHUI_TIDAK_VALID');
  x.sheets.m.db_Pejabat_BA.data[3][5] = true;
  // Rekap_BA gagal ditulis sesudah db_Gardu: kirim ulang memakai gardu yang sudah tertulis, bukan nomor baru
  const asli = x.gg.tulisBlok_;
  let sekali = true;
  x.gg.tulisBlok_ = function (t, u, b, o) { if (t.nama === 'Rekap_BA' && sekali) { sekali = false; throw new Error('jaringan putus'); } return asli(t, u, b, o); };
  assert.strictEqual(kodeError(() => x.gg.simpanBaGardu_(x.admin, x.isi(id2))), 'jaringan putus');
  assert.strictEqual(x.sheets.g.db_Gardu.data.length, 4);
  const r2 = x.gg.simpanBaGardu_(x.admin, x.isi(id2));
  assert.deepStrictEqual([r2.status, r2.noGardu], ['OK', 'TB0422']);
  assert.strictEqual(x.sheets.g.db_Gardu.data.length, 4, 'tidak ada gardu kembar');
  assert.strictEqual(x.sheets.g.Rekap_BA.data.length, 4);
  // OwnerId tidak ketemu = tetap tersimpan + peringatan (sama v1)
  delete x.sheets.lama.OwnerId;
  const id3 = U(); x.semuaFoto(id3);
  const r3 = x.gg.simpanBaGardu_(x.admin, x.isi(id3));
  assert.strictEqual(r3.ownerId, '');
  assert.match(r3.peringatan[0], /OwnerId/);
});

// ---------- v0.71.0 PDF BA lewat Cloud Run (stateless) ----------
function siapkanPdf() {
  const x = siapkanBa();
  const baId = U(); x.semuaFoto(baId);
  const r = x.gg.simpanBaGardu_(x.admin, x.isi(baId, { alamat: 'Jl. Raya Toboali – Desa Kampung Baru' }));
  const RAHASIA = 'k'.repeat(40);
  const props = x.gg.PropertiesService.getScriptProperties();
  const panggil = [];
  let jawab = () => ({ kode: 200, isi: Buffer.from('%PDF-1.7 contoh') });
  const tidur = [];
  x.gg.Utilities.sleep = (ms) => tidur.push(ms);
  x.gg.UrlFetchApp = {
    fetch: (url, o) => {
      const p = { url, metode: o.method, o };
      panggil.push(p);
      if (o.method === 'get') return { getResponseCode: () => 200, getContentText: () => 'ok' };
      const h = jawab(p);
      return {
        getResponseCode: () => h.kode,
        getBlob: () => ({ getBytes: () => Array.from(h.isi, (b) => (b > 127 ? b - 256 : b)) }),
        getContentText: () => (h.teks !== undefined ? h.teks : JSON.stringify(h.json || {})),
      };
    },
  };
  const atur = () => { props.setProperty('PDF_ENGINE_URL', 'https://sisi2-pdf-staging-xyz.a.run.app/'); props.setProperty('PDF_ENGINE_SECRET', RAHASIA); };
  const tandaBenar = (p) => {
    const w = p.o.headers['X-SiSi-Waktu'];
    const sha = crypto.createHash('sha256').update(Buffer.from(p.o.payload, 'utf8')).digest('hex');
    return crypto.createHmac('sha256', RAHASIA).update(w + '.' + sha).digest('hex') === p.o.headers['X-SiSi-Tanda'];
  };
  const baris = () => x.objek(x.HR, x.sheets.g.Rekap_BA.data[2]);
  return { ...x, baId, r, props, panggil, tidur, atur, tandaBenar, baris, setJawab: (f) => { jawab = f; } };
}

test('v0.71.0: buatPdfBaGardu: data + foto dikirim bertanda HMAC, PDF disimpan di Drive (folder gardu v0.77.0), Rekap_BA SELESAI, buat ulang buang file lama', () => {
  const x = siapkanPdf();
  assert.strictEqual(kodeError(() => x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId })), 'PDF_ENGINE_BELUM_DISET');
  x.atur();
  const h = JSON.parse(JSON.stringify(x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId })));
  assert.strictEqual(h.statusPdf, 'SELESAI');
  assert.strictEqual(h.namaFile, `BA-Pengoperasian-${x.r.idBa}.pdf`);
  assert.deepStrictEqual(h.fotoHilang, []);
  assert.match(h.urlPdf, /^https:\/\/drive\.google\.com\/file\/d\/file\d+\/view$/);
  // panggilan: bangunkan GET / lalu satu POST bertanda, URL tanpa garis miring ganda
  assert.deepStrictEqual(x.panggil.map((p) => [p.metode, p.url]), [['get', 'https://sisi2-pdf-staging-xyz.a.run.app/'], ['post', 'https://sisi2-pdf-staging-xyz.a.run.app/v2/ba/pengoperasian-trafo']]);
  const post = x.panggil[1];
  assert.ok(x.tandaBenar(post), 'HMAC(waktu.sha256(body)) sama dengan engine');
  assert.ok(Math.abs(Number(post.o.headers['X-SiSi-Waktu']) - Date.now() / 1000) < 5);
  assert.ok(/^[\x00-\x7f]*$/.test(post.o.payload), 'body ASCII murni (en dash jadi \\u2013)');
  assert.ok(!post.o.payload.includes('k'.repeat(40)) && !post.url.includes('secret'), 'rahasia tidak pernah di body / URL');
  const isi = JSON.parse(post.o.payload);
  assert.strictEqual(isi.versi, 1);
  assert.strictEqual(isi.idBa, x.r.idBa);
  assert.deepStrictEqual(Object.keys(isi.foto).sort(), ['BOX_PHB', 'FULL_GARDU', 'NAMEPLATE', 'NAMEPLATE_PHB']);
  assert.ok(Buffer.from(isi.foto.NAMEPLATE, 'base64')[0] === 0xFF, 'foto JPEG asli');
  assert.deepStrictEqual([isi.data.nomorTrafo, isi.data.nomorBAFull, isi.data.tanggalBA, isi.data.kapasitas, isi.data.perluasan, isi.data.koordinat, isi.data.alamat],
    ['TB0422', x.r.noBaFull, x.hari, '100', '0,5', '-3.012345, 106.456789', 'Jl. Raya Toboali – Desa Kampung Baru']);
  assert.deepStrictEqual([isi.data.petugas1, isi.data.jabatan2, isi.data.mengetahui, isi.data.ownerId, isi.data.phbMerk, isi.data.jurusan],
    ['Andi', 'Teknisi', 'Citra', '07020304', 'Schneider', '4']);
  // Rekap_BA + Drive
  const b = x.baris();
  assert.deepStrictEqual([b['Status PDF'], b['File PDF URL'], b.pdf_file_id], ['SELESAI', h.urlPdf, h.fileId]);
  assert.match(b['Waktu PDF'], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  const f = x.dr.semuaFile[h.fileId];
  assert.strictEqual(f.nama, h.namaFile);
  assert.strictEqual(f.akses, 'PRIVATE');
  // v0.77.0: satu folder dengan foto BA
  const jalur = ['Gardu', 'TB0422', `${x.hari}_Pengoperasian Trafo`];
  let fd = x.dr.folders.akarBa;
  for (const nm of jalur) { assert.ok(fd.anak[nm], 'folder ' + nm); fd = x.dr.folders[fd.anak[nm]]; }
  assert.ok(fd.file[h.namaFile]);
  assert.ok(x.sheets.a.log_Audit.data.some((l) => l[4] === 'BA_GARDU_PDF'));
  // buat ulang: file baru, file lama dibuang SESUDAH baris menunjuk file baru
  const h2 = x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId });
  assert.notStrictEqual(h2.fileId, h.fileId);
  assert.strictEqual(x.dr.semuaFile[h.fileId].dibuang, true);
  assert.strictEqual(x.baris().pdf_file_id, h2.fileId);
  assert.ok(fd.file['TB0422_Nameplate Trafo.jpg'], 'foto BA satu folder dengan PDF');
  // v0.77.0: BA_PDF_FOLDER_ID tidak dipakai lagi
  x.props.setProperty('BA_PDF_FOLDER_ID', 'akarPdf');
  const h3 = x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId });
  assert.ok(fd.file[h3.namaFile] && !x.dr.folders.akarPdf);
});

test('v0.71.0: buatPdfBaGardu gagal: engine tidur dicoba 3x lalu PDF_ENGINE_TIDAK_SIAP, tanda ditolak / bukan PDF langsung berhenti, Status PDF GAGAL, BA tetap utuh', () => {
  const x = siapkanPdf();
  x.atur();
  x.setJawab(() => ({ kode: 503, json: { ok: false } }));
  assert.strictEqual(kodeError(() => x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId })), 'PDF_ENGINE_TIDAK_SIAP');
  assert.strictEqual(x.panggil.filter((p) => p.metode === 'post').length, 3);
  assert.deepStrictEqual(x.tidur, [3000, 6000]);
  const b = x.baris();
  assert.deepStrictEqual([b['Status PDF'], b['Status BA'], b.pdf_file_id], ['GAGAL', 'AKTIF', '']);
  assert.ok(x.sheets.a.log_Audit.data.some((l) => l[4] === 'BA_GARDU_PDF_GAGAL'));
  x.panggil.length = 0;
  x.setJawab(() => ({ kode: 401, json: { ok: false, kode: 'TANDA_SALAH' } }));
  assert.strictEqual(kodeError(() => x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId })), 'PDF_ENGINE_DITOLAK');
  assert.strictEqual(x.panggil.filter((p) => p.metode === 'post').length, 1, '401 tidak diulang');
  x.setJawab(() => ({ kode: 503, json: { ok: false, kode: 'KONFIGURASI' } }));
  assert.strictEqual(kodeError(() => x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId })), 'PDF_ENGINE_DITOLAK', 'engine tanpa PDF_SECRET');
  x.setJawab(() => ({ kode: 200, isi: Buffer.from('<html>login</html>') }));
  assert.strictEqual(kodeError(() => x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId })), 'PDF_GAGAL');
  x.setJawab(() => ({ kode: 500, json: { ok: false, kode: 'RENDER_GAGAL' } }));
  assert.strictEqual(kodeError(() => x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId })), 'PDF_GAGAL');
  assert.strictEqual(Object.keys(x.dr.semuaFile).filter((k) => x.dr.semuaFile[k].nama.endsWith('.pdf')).length, 0, 'tidak ada PDF yatim');
  // sesudah engine pulih: berhasil, foto yang hilang di Drive = kotak kosong + dicatat
  x.setJawab(() => ({ kode: 200, isi: Buffer.from('%PDF-1.7') }));
  const meta = JSON.parse(x.baris().foto_meta);
  delete x.dr.semuaFile[meta.BOX_PHB.fileId];
  const h = x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId });
  assert.deepStrictEqual(JSON.parse(JSON.stringify([h.statusPdf, h.fotoHilang])), ['SELESAI', ['Box PHB-TR']]);
  // config salah
  x.props.setProperty('PDF_ENGINE_SECRET', 'pendek');
  assert.strictEqual(kodeError(() => x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId })), 'CONFIG_TIDAK_VALID');
  x.atur(); x.props.setProperty('PDF_ENGINE_URL', 'http://engine.local');
  assert.strictEqual(kodeError(() => x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId })), 'CONFIG_TIDAK_VALID', 'wajib https');
});

test('v0.71.0: buatPdfBaGardu: sedang dibuat ditolak, BA batal / tidak ada / jenis belum didukung, khusus admin; getDaftarBaGardu terbaru dulu + cari', () => {
  const x = siapkanPdf();
  x.atur();
  x.gg.CacheService.getScriptCache().put('pdfba:' + x.baId, '1', 60);
  assert.strictEqual(kodeError(() => x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId })), 'PDF_SEDANG_DIBUAT');
  assert.strictEqual(x.panggil.length, 0);
  x.gg.CacheService.getScriptCache().remove('pdfba:' + x.baId);
  x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId });
  assert.strictEqual(x.gg.CacheService.getScriptCache().get('pdfba:' + x.baId), null, 'penanda dilepas');
  assert.strictEqual(kodeError(() => x.gg.buatPdfBaGardu_(x.admin, { baId: U() })), 'BA_TIDAK_DITEMUKAN');
  assert.strictEqual(kodeError(() => x.gg.buatPdfBaGardu_({ ...x.admin, role: 'ADMIN_ES' }, { baId: x.baId })), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.gg.getDaftarBaGardu_({ ...x.admin, role: 'PETUGAS' }, {})), 'AKSES_DITOLAK');
  const kolom = (k) => x.HR.indexOf(k);
  x.sheets.g.Rekap_BA.data[2][kolom('Jenis Pekerjaan')] = 'Pemeriksaan Trafo';
  assert.strictEqual(kodeError(() => x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId })), 'PDF_JENIS_BELUM_TERSEDIA');
  x.sheets.g.Rekap_BA.data[2][kolom('Jenis Pekerjaan')] = 'Pengoperasian Trafo';
  // daftar
  const id2 = U(); x.semuaFoto(id2);
  const r2 = x.gg.simpanBaGardu_(x.admin, x.isi(id2));
  const dft = JSON.parse(JSON.stringify(x.gg.getDaftarBaGardu_(x.admin, {})));
  assert.strictEqual(dft.jumlah, 3);
  assert.deepStrictEqual(dft.isi.map((b) => b.idBa).slice(0, 2), [r2.idBa, x.r.idBa], 'No terbesar dulu');
  const a = dft.isi[1];
  assert.deepStrictEqual([a.noGardu, a.jenis, a.statusPdf, a.statusBa, a.pdfBisa, a.tanggalBa], ['TB0422', 'Pengoperasian Trafo', 'SELESAI', 'AKTIF', true, x.hari]);
  assert.match(a.urlPdf, /drive\.google\.com/);
  assert.strictEqual(dft.isi[0].statusPdf, 'BELUM');
  assert.strictEqual(dft.isi[2].pdfBisa, false, 'baris lama tanpa jenis');
  assert.deepStrictEqual([...x.gg.getDaftarBaGardu_(x.admin, { cari: 'tb0423' }).isi.map((b) => b.noGardu)], ['TB0423']);
  assert.strictEqual(x.gg.getDaftarBaGardu_(x.admin, { batas: 1 }).isi.length, 1);
  // BA batal
  x.sheets.g.Rekap_BA.data[2][kolom('Status BA')] = 'BATAL';
  assert.strictEqual(kodeError(() => x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId })), 'BA_SUDAH_BATAL');
  assert.strictEqual(x.gg.getDaftarBaGardu_(x.admin, {}).isi[1].pdfBisa, false);
});

test('v0.71.0: tandaPdf_ = HMAC engine (Python), jsonAscii_ bisa dibaca ulang, scope UrlFetch ada, rahasia tidak masuk cfg_', () => {
  const fs = require('fs'), path = require('path');
  const g = buatKonteks(PROPS);
  const body = g.jsonAscii_({ a: 'Desa – Toboali ✓', n: 1 });
  assert.ok(/^[\x00-\x7f]*$/.test(body));
  assert.deepStrictEqual(JSON.parse(body), { a: 'Desa – Toboali ✓', n: 1 });
  // nilai sama dengan app.tanda() di engines/sisi-pdf-engine (dicek manual: 'k'*32, '1700000000', b'{}')
  assert.strictEqual(g.tandaPdf_('k'.repeat(32), '1700000000', '{}'), 'ecaa1db56e7c6fefdf0d5b1ba5cbab0034cfbc5c0cf1b65220fce81bb6da0820');
  const man = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'backend', 'src', 'appsscript.json'), 'utf8'));
  assert.ok(man.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'));
  const g2 = buatKonteks({ ...PROPS, PDF_ENGINE_SECRET: 'r'.repeat(40) });
  assert.ok(!JSON.stringify(g2.cfg_()).includes('r'.repeat(40)));
  // engine: kontrak jalur + slot sama dengan Apps Script
  const py = fs.readFileSync(path.join(__dirname, '..', 'engines', 'sisi-pdf-engine', 'render_ba.py'), 'utf8');
  assert.match(py, /"pengoperasian-trafo": \(build_pengoperasian_trafo, SLOT_PENGOPERASIAN\)/);
  assert.match(py, /SLOT_PENGOPERASIAN = \["NAMEPLATE", "FULL_GARDU", "NAMEPLATE_PHB", "BOX_PHB"\]/);
  assert.deepStrictEqual([...g.BA_SLOT_FOTO_['Pengoperasian Trafo'].map((s) => s.slot)], ['NAMEPLATE', 'FULL_GARDU', 'NAMEPLATE_PHB', 'BOX_PHB']);
  assert.strictEqual(g.PDF_JENIS_['Pengoperasian Trafo'].jalur, '/v2/ba/pengoperasian-trafo');
});

test('v0.72.0: error validasi menyebut nama kolom (bukan nilai), error lain tanpa kolom; Kepemilikan Non-PLN (nilai lama Lisdes disimpan Non-PLN)', () => {
  const g = buatKonteks(PROPS);
  const j = g.gagal_(new g.SisiError_('DI_LUAR_RENTANG', 'tahunPhb'));
  assert.deepStrictEqual([j.ok, j.kode, j.kolom], [false, 'DI_LUAR_RENTANG', 'tahunPhb']);
  assert.strictEqual(g.gagal_(new g.SisiError_('SESI_TIDAK_VALID', 'token lama')).kolom, undefined);
  assert.strictEqual(g.gagal_(new g.SisiError_('DI_LUAR_RENTANG', 'nilai 123 ditolak')).kolom, undefined, 'detail bukan nama kunci = tidak dikirim');
  assert.strictEqual(g.gagal_(new Error('x')).kolom, undefined);
  // lewat validasi_ asli
  let e; try { g.validasi_({ tahunPhb: 123 }, { tahunPhb: { tipe: 'angka', min: 1950, max: 2027 } }); } catch (x) { e = x; }
  assert.strictEqual(g.gagal_(e).kolom, 'tahunPhb');
  const x = siapkanBa();
  const id1 = U(); x.semuaFoto(id1);
  x.gg.simpanBaGardu_(x.admin, x.isi(id1, { kepemilikan: 'Non-PLN' }));
  assert.strictEqual(x.objek(x.HR, x.sheets.g.Rekap_BA.data[2]).Kepemilikan, 'Non-PLN');
  const id2 = U(); x.semuaFoto(id2);
  x.gg.simpanBaGardu_(x.admin, x.isi(id2, { kepemilikan: 'Non-PLN (Lisdes)' }));
  assert.strictEqual(x.objek(x.HR, x.sheets.g.Rekap_BA.data[3]).Kepemilikan, 'Non-PLN', 'app lama');
  assert.strictEqual(x.objek(x.HG, x.sheets.g.db_Gardu.data[4]).Kepemilikan, 'Non-PLN');
  assert.strictEqual(kodeError(() => x.gg.simpanBaGardu_(x.admin, x.isi(U(), { kepemilikan: 'Swasta' }))), 'PILIHAN_TIDAK_VALID');
});

// ---------- v0.73.0 pesan nomor gardu per BA ----------
function siapkanPesan() {
  const x = siapkanBa();
  const buat = sheetPalsu([]);
  x.sheets.g.res_NomorGardu = buat('res_NomorGardu', [[...x.gg.RES_NOMOR_HEADER_]]);
  const HP = [...x.gg.RES_NOMOR_HEADER_];
  const admin2 = { ...x.admin, userId: U(), username: '16130.admin2' };
  const pesan = (baId, prefix = 'TB', tambah = {}, siapa = x.admin) => JSON.parse(JSON.stringify(x.gg.pesanNomorGardu_(siapa, { baId, prefix, ...tambah })));
  const res = () => x.sheets.g.res_NomorGardu.data.slice(1).map((b) => x.objek(HP, b));
  return { ...x, admin2, pesan, res, HP };
}

test('v0.73.0: pesanNomorGardu: nomor dipesan per BA, admin kedua dapat nomor berikut, pesan ulang = nomor sama, ganti prefix / BATAL = pesanan lama dilepas', () => {
  const x = siapkanPesan();
  const a = U(), b = U();
  const pa = x.pesan(a);
  assert.deepStrictEqual([pa.nomor, pa.asal, pa.terakhir, pa.menitBerlaku], ['TB0422', 'BARU', 'TB0421', 180]);
  const pb = x.pesan(b, 'TB', {}, x.admin2);
  assert.strictEqual(pb.nomor, 'TB0423', 'TB0422 dipegang BA lain');
  assert.strictEqual(x.pesan(a).nomor, 'TB0422', 'pesan ulang = nomor sama (diperpanjang)');
  assert.strictEqual(x.res().length, 2, 'tidak ada baris pesanan ganda');
  assert.strictEqual(x.gg.getNomorGarduBaru_(x.admin, { prefix: 'TB' }).nomor, 'TB0424', 'pratinjau melewati nomor yang dipesan');
  // ganti prefix: TB0422 dilepas, admin ketiga dapat TB0422 lagi (tidak bolong)
  assert.strictEqual(x.pesan(a, 'PG').nomor, 'PG0009');
  assert.deepStrictEqual(x.res().filter((r) => r.ba_id === a).map((r) => [r['No Gardu'], r.Status]), [['TB0422', 'DILEPAS'], ['PG0009', 'DIPESAN']]);
  const c = U();
  assert.strictEqual(x.pesan(c).nomor, 'TB0422');
  // nomor BATAL: dipesan satu BA saja
  const pc = x.pesan(c, 'TB', { nomorBatalId: x.batalId });
  assert.deepStrictEqual([pc.nomor, pc.asal, pc.garduId], ['TB0010', 'ULANG BATAL', x.batalId]);
  assert.strictEqual(kodeError(() => x.pesan(b, 'TB', { nomorBatalId: x.batalId }, x.admin2)), 'NOMOR_BATAL_TIDAK_TERSEDIA');
  assert.deepStrictEqual(x.pesan(b, 'TB', {}, x.admin2).batal, [], 'BATAL yang dipesan BA lain tidak ditawarkan');
  // lepas
  assert.strictEqual(x.gg.lepasNomorGardu_(x.admin, { baId: c }).dilepas, 1);
  assert.strictEqual(x.pesan(U()).nomor, 'TB0422', 'TB0422 bebas lagi');
  assert.strictEqual(kodeError(() => x.gg.pesanNomorGardu_({ ...x.admin, role: 'ADMIN_ES' }, { baId: a, prefix: 'TB' })), 'AKSES_DITOLAK');
});

test('v0.73.0: simpanBaGardu memakai nomor pesanan, cek noGarduWatermark, pesanan hangus diambil BA lain = NOMOR_GARDU_BERUBAH tanpa menulis apa pun', () => {
  const x = siapkanPesan();
  const a = U(), b = U();
  x.pesan(a); x.pesan(b, 'TB', {}, x.admin2);   // a = TB0422, b = TB0423
  x.semuaFoto(b);
  const rb = x.gg.simpanBaGardu_(x.admin2, x.isi(b, { noGarduWatermark: 'tb0423' }));
  assert.strictEqual(rb.noGardu, 'TB0423', 'BA kedua tersimpan lebih dulu tetap memakai nomornya');
  assert.strictEqual(x.res().find((r) => r.ba_id === b).Status, 'DIPAKAI');
  assert.strictEqual(kodeError(() => x.pesan(b, 'TB', {}, x.admin2)), 'BA_SUDAH_DISIMPAN', 'BA tersimpan tidak bisa pesan lagi');
  x.semuaFoto(a);
  const jmlG = x.sheets.g.db_Gardu.data.length, jmlR = x.sheets.g.Rekap_BA.data.length;
  assert.strictEqual(kodeError(() => x.gg.simpanBaGardu_(x.admin, x.isi(a, { noGarduWatermark: 'TB0499' }))), 'NOMOR_GARDU_BERUBAH', 'watermark beda');
  assert.deepStrictEqual([x.sheets.g.db_Gardu.data.length, x.sheets.g.Rekap_BA.data.length], [jmlG, jmlR], 'tidak ada yang ditulis');
  assert.strictEqual(kodeError(() => x.gg.simpanBaGardu_(x.admin, x.isi(a, { prefix: 'PG' }))), 'NOMOR_GARDU_BERUBAH', 'prefix beda pesanan');
  // pesanan a hangus, lalu BA lain mengambil TB0422 dan menyimpan
  const ia = x.HP.indexOf('Aktif Sampai');
  const baris = x.sheets.g.res_NomorGardu.data.findIndex((r) => r[x.HP.indexOf('ba_id')] === a);
  x.sheets.g.res_NomorGardu.data[baris][ia] = new Date(Date.now() - 60000).toISOString();
  const c = U();
  assert.strictEqual(x.pesan(c).nomor, 'TB0422', 'pesanan hangus = nomor dipakai lagi');
  x.semuaFoto(c);
  x.gg.simpanBaGardu_(x.admin, x.isi(c, { noGarduWatermark: 'TB0422' }));
  assert.strictEqual(kodeError(() => x.gg.simpanBaGardu_(x.admin, x.isi(a, { noGarduWatermark: 'TB0422' }))), 'NOMOR_GARDU_BERUBAH');
  // HP: pesan ulang -> nomor baru, render ulang watermark, simpan lagi
  assert.strictEqual(x.pesan(a).nomor, 'TB0424');
  const ra = x.gg.simpanBaGardu_(x.admin, x.isi(a, { noGarduWatermark: 'TB0424' }));
  assert.deepStrictEqual([ra.status, ra.noGardu], ['OK', 'TB0424']);
  // BATAL lewat pesanan
  const d = U(); x.pesan(d, 'TB', { nomorBatalId: x.batalId }); x.semuaFoto(d);
  const rd = x.gg.simpanBaGardu_(x.admin, x.isi(d, { noGarduWatermark: 'TB0010' }));
  assert.deepStrictEqual([rd.noGardu, rd.garduId], ['TB0010', x.batalId]);
  // tanpa pesanan (app lama) tetap jalan, melewati nomor yang dipesan BA lain
  const e = U(); x.pesan(e);   // TB0425
  const f = U(); x.semuaFoto(f);
  assert.strictEqual(x.gg.simpanBaGardu_(x.admin, x.isi(f)).noGardu, 'TB0426');
  // upload foto memperpanjang pesanan
  const sebelum = x.res().find((r) => r.ba_id === e)['Aktif Sampai'];
  x.sheets.g.res_NomorGardu.data[x.sheets.g.res_NomorGardu.data.findIndex((r) => r[x.HP.indexOf('ba_id')] === e)][ia] = new Date(Date.now() + 60000).toISOString();
  x.foto(e, 'NAMEPLATE');
  assert.ok(Date.parse(x.res().find((r) => r.ba_id === e)['Aktif Sampai']) > Date.now() + 170 * 60000, 'diperpanjang 3 jam ' + sebelum);
});

// ---------- v0.74.0: yan_Gardu (anak P0 Pengecekan Gardu) ----------
function siapkanUkurGardu() {
  const x = siapkanP0();
  x.g.PropertiesService.getScriptProperties().setProperty('GARDU_SHEET_ID', 'g');
  const buat = sheetPalsu(x.log);
  const jg = U();
  x.sheets.m.db_Jenis_Pekerjaan.data.push([jg, 'YANDAL', 'Pengecekan Gardu', '', '', '', 5, true, 2]);
  const HG = [...x.g.DB_GARDU_HEADER_];
  const gb = (isi) => HG.map((h) => (isi[h] === undefined ? '' : isi[h]));
  const gid = { a: U(), b: U(), mati: U(), lain: U() };
  x.sheets.g = {
    db_Gardu: buat('db_Gardu', [HG,
      gb({ No: 1, 'No Gardu': 'TB0101', Prefix: 'TB', 'Status Gardu': 'AKTIF', Alamat: 'Jl. Sangkar', Penyulang: 'Tanjung Labu',
           Section: 'FCO Jar Tj. Sangkar', 'Kapasitas (kVA)': 100, Lat: -3.0, Long: 106.5, 'Tanggal Ukur Terakhir': '2026-01-05',
           'Persentase Beban (%)': 40, gardu_id: gid.a, section_id: x.sek.a, revision: 1 }),
      gb({ No: 2, 'No Gardu': 'TB0102', Prefix: 'TB', 'Status Gardu': 'AKTIF', Penyulang: 'Tanjung Labu', 'Kapasitas (kVA)': '',
           gardu_id: gid.b, revision: 1 }),
      gb({ No: 3, 'No Gardu': 'TB0103', Prefix: 'TB', 'Status Gardu': 'TIDAK AKTIF', Penyulang: 'Tanjung Labu', gardu_id: gid.mati, revision: 1 }),
      gb({ No: 4, 'No Gardu': 'PY0001', Prefix: 'PY', 'Status Gardu': 'AKTIF', Penyulang: 'Bikang', 'Kapasitas (kVA)': 50, gardu_id: gid.lain, revision: 1 })]),
  };
  const nilai = { bebanR: 80, bebanS: 60, bebanT: 70, bebanN: 12, teganganRS: 395, teganganRT: 398, teganganST: 396,
    teganganRN: 228, teganganSN: 230, teganganTN: 229 };
  const ukur = (p0Id, isi = {}) => ({ ukurId: U(), p0Id, garduId: gid.a, ...nilai, catatan: 'Kabel NH kendor', dibuat: x.iso('09:09:00'), installId: x.ins1, ...isi });
  const fg = (ukurId, slot, jam, isi = {}, buf = jpeg(1600, 1200, 90 + slot.length + jam.length)) => ({ ukurId, slot, sumber: 'KAMERA',
    sha256: crypto.createHash('sha256').update(buf).digest('hex'), ukuranByte: buf.length, data: buf.toString('base64'),
    waktu: x.iso(jam), waktuHp: x.iso(jam), sumberWaktu: 'SERVER', lat: -3.0005, lng: 106.5, akurasiM: 4, ...isi });
  const e = (aksi, d, tok) => kodeError(() => x.panggil(aksi, d, tok));
  const H = x.g.YAN_GARDU_HEADER_;
  const k = (b, n) => x.sheets.y.yan_Gardu.data[b][H.indexOf(n)];
  const kg = (b, n) => x.sheets.g.db_Gardu.data[b][HG.indexOf(n)];
  return { ...x, gid, nilai, ukur, fg, e, HY: H, k, kg };
}

test('v0.74.0: header yan_Gardu 90 kolom (A-CL) per grup; hasil ukur (kVA, %, kategori, ketidakseimbangan); WBP / LWBP', () => {
  const H = [...g.YAN_GARDU_HEADER_];
  assert.strictEqual(H.length, 90);
  assert.strictEqual(new Set(H).size, 90);
  assert.strictEqual(g.kolomHuruf_(H.length), 'CL');
  assert.deepStrictEqual([...g.skemaHeader_().YANDAL_SHEET_ID.yan_Gardu], H);
  assert.deepStrictEqual(H.slice(0, 5), ['No', 'Kode Header', 'Kode Shift', 'Kode P0', 'Kode Pengukuran Gardu']);
  assert.deepStrictEqual(H.slice(11, 16), ['Penyulang', 'Section', 'No Gardu', 'Alamat', 'Kapasitas (kVA)']);
  assert.deepStrictEqual(H.slice(16, 20), ['Koordinat', 'Lat', 'Long', 'Jarak ke Gardu (m)']);
  assert.strictEqual(H[20], 'Jam Ukur');
  assert.deepStrictEqual(H.slice(32, 38), ['Arus Maks per Fasa (A)', 'Pembebanan (kVA)', 'Persentase Beban (%)', 'Kategori Beban',
    'Ketidakseimbangan Beban (%)', 'Diterapkan ke Master']);
  assert.deepStrictEqual(H.slice(61, 64), ['Foto Kondisi / Temuan Gardu', 'Link Drive Kondisi / Temuan Gardu', 'Catatan']);
  assert.strictEqual(H.filter((h) => h === 'Catatan').length, 1, 'satu catatan saja (grup I)');
  assert.strictEqual(H[67], 'ukur_id');
  assert.strictEqual(H.filter((h) => /^Foto /.test(h)).length, 11);
  assert.strictEqual(H.filter((h) => /^foto_id_/.test(h)).length, 11);
  for (const s of g.YAN_SLOT_GARDU_) { const kf = g.kolomFotoGardu_(s); assert.ok(H.includes(kf.foto) && H.includes(kf.link) && H.includes(kf.id), s); }
  for (const n of g.YAN_NILAI_GARDU_) assert.ok(H.includes(n.kolom), n.kolom);
  // R 80 x 228 + S 60 x 230 + T 70 x 229 = 18240 + 13800 + 16030 = 48070 VA = 48,07 kVA; 100 kVA = 48,07 % Underload
  const h = { ...g.hasilUkurGardu_({ bebanR: 80, bebanS: 60, bebanT: 70, teganganRN: 228, teganganSN: 230, teganganTN: 229 }, 100) };
  // v0.75.1: arus maks per fasa = arus nominal 100 kVA / (akar 3 x 400 V) = 144,34 A
  assert.deepStrictEqual(h, { arusMaks: 144.34, kva: 48.07, persen: 48.07, kategori: 'Underload', tidakSeimbang: 14.29 });
  assert.deepStrictEqual([g.arusNominalGardu_(50), g.arusNominalGardu_(160), g.arusNominalGardu_(''), g.arusNominalGardu_(0)], [72.17, 230.94, '', '']);
  assert.strictEqual(g.hasilUkurGardu_({ bebanR: 250, bebanS: 250, bebanT: 250, teganganRN: 230, teganganSN: 230, teganganTN: 230 }, 160).kategori, 'Buruk');
  assert.strictEqual(g.hasilUkurGardu_({ bebanR: 150, bebanS: 140, bebanT: 145, teganganRN: 230, teganganSN: 230, teganganTN: 230 }, 160).kategori, 'Cukup');
  assert.strictEqual(g.hasilUkurGardu_({ bebanR: 0, bebanS: 0, bebanT: 0 }, 100).tidakSeimbang, 0);
  const tanpaKap = g.hasilUkurGardu_({ bebanR: 10, bebanS: 10, bebanT: 10, teganganRN: 230, teganganSN: 230, teganganTN: 230 }, '');
  assert.deepStrictEqual([tanpaKap.persen, tanpaKap.kategori, tanpaKap.kva], ['', '', 6.9]);
  const w = (jam) => g.waktuBebanGardu_(Date.parse('2026-10-09T' + jam + '+07:00'));
  assert.deepStrictEqual(['16:59:59', '17:00:00', '21:59:59', '22:00:00', '03:00:00'].map(w), ['LWBP', 'WBP', 'WBP', 'LWBP', 'LWBP']);
  assert.deepStrictEqual(['Pengecekan Gardu', ' pengecekan  GARDU ', 'Pengecekan Switching'].map((x) => g.p0Gardu_(x)), [true, true, false]);
});

test('v0.74.0: pengukuran gardu: syarat P0, gardu AKTIF di penyulang P0, satu per P0, gardu terkunci, koreksi angka, foto BEBAN_R dulu, master saat 10 foto lengkap, Sesudah butuh foto lengkap', () => {
  const x = siapkanUkurGardu();
  const { e, k, kg } = x;
  x.jam.atur('09:01:00');
  assert.strictEqual(e('simpanP0Yandal', x.p0({ namaPekerjaan: 'Pengecekan Gardu', penyulang: undefined, sectionId: undefined })), 'FIELD_WAJIB', 'penyulang wajib');
  const a = x.p0({ namaPekerjaan: 'Pengecekan Gardu' });
  const ra = x.panggil('simpanP0Yandal', a);
  x.jam.atur('09:30:00');
  const u1 = x.ukur(a.p0Id);
  assert.strictEqual(e('simpanGarduYandal', u1), 'URUTAN_FOTO', 'foto Sebelum P0 belum ada');
  x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'SEBELUM', '09:05:00'));
  assert.strictEqual(e('simpanGarduYandal', x.ukur(a.p0Id, { garduId: x.gid.lain })), 'GARDU_BUKAN_PENYULANG');
  assert.strictEqual(e('simpanGarduYandal', x.ukur(a.p0Id, { garduId: x.gid.mati })), 'GARDU_TIDAK_AKTIF');
  assert.strictEqual(e('simpanGarduYandal', x.ukur(a.p0Id, { garduId: U() })), 'GARDU_TIDAK_DIKENAL');
  assert.strictEqual(e('simpanGarduYandal', x.ukur(a.p0Id, { bebanR: -1 })), 'DI_LUAR_RENTANG');
  assert.strictEqual(e('simpanGarduYandal', x.ukur(a.p0Id, { teganganRN: 1001 })), 'DI_LUAR_RENTANG');
  assert.strictEqual(e('simpanGarduYandal', x.ukur(a.p0Id, { bebanN: undefined })), 'FIELD_WAJIB');
  assert.strictEqual(e('simpanGarduYandal', x.ukur(a.p0Id, { catatan: 'x'.repeat(301) })), 'TERLALU_PANJANG');
  assert.strictEqual(e('simpanGarduYandal', x.ukur(a.p0Id, { dibuat: x.iso('07:50:00') })), 'WAKTU_DI_LUAR_SHIFT');
  assert.strictEqual(e('simpanGarduYandal', x.ukur(a.p0Id, { dibuat: x.iso('09:02:00') })), 'WAKTU_TIDAK_URUT');
  assert.strictEqual(e('simpanGarduYandal', x.ukur(a.p0Id, { dibuat: x.iso('09:40:00') })), 'WAKTU_MELEWATI_SERVER');
  assert.strictEqual(x.sheets.y.yan_Gardu.data.length, 1, 'yang ditolak tidak menulis');
  const r1 = x.panggil('simpanGarduYandal', u1);
  const kode1 = ra.kodeP0 + '-GRD.001';
  assert.deepStrictEqual([r1.kodeUkur, r1.noGardu, r1.fotoServer, r1.diterapkan, r1.hasil.kva, r1.hasil.persen, r1.hasil.kategori],
    [kode1, 'TB0101', [], '', 48.07, 48.07, 'Underload']);
  assert.deepStrictEqual([k(1, 'Kode P0'), k(1, 'Penyulang'), k(1, 'Section'), k(1, 'Alamat'), k(1, 'Kapasitas (kVA)'), k(1, 'Beban N (A)'),
    k(1, 'Tegangan S-T (V)'), k(1, 'Arus Maks per Fasa (A)'), k(1, 'Ketidakseimbangan Beban (%)'), k(1, 'Catatan'), k(1, 'gardu_id'), k(1, 'status')],
  [ra.kodeP0, 'Tanjung Labu', 'FCO Jar Tj. Sangkar', 'Jl. Sangkar', 100, 12, 396, 144.34, 14.29, 'Kabel NH kendor', x.gid.a, 'AKTIF']);
  assert.strictEqual(x.panggil('simpanGarduYandal', u1).kodeUkur, kode1, 'kirim ulang = baris sama');
  assert.strictEqual(x.sheets.y.yan_Gardu.data.length, 2);
  // satu per P0, gardu terkunci
  assert.strictEqual(e('simpanGarduYandal', x.ukur(a.p0Id, { garduId: x.gid.b })), 'PENGUKURAN_GARDU_SUDAH_ADA');
  assert.strictEqual(e('simpanGarduYandal', { ...u1, garduId: x.gid.b }), 'GARDU_TERKUNCI');
  // koreksi angka + catatan: hasil dihitung ulang, master belum (foto belum lengkap)
  const rk = x.panggil('simpanGarduYandal', { ...u1, bebanR: 160, catatan: 'Kabel NH kendor, sudah dikencangkan' });
  assert.deepStrictEqual([k(1, 'Beban R (A)'), k(1, 'Arus Maks per Fasa (A)'), k(1, 'revision'), k(1, 'Catatan'), rk.hasil.kva],
    [160, 144.34, 2, 'Kabel NH kendor, sudah dikencangkan', 66.31]);
  assert.strictEqual(kg(1, 'Kode Ukur Terakhir'), '', 'master belum diubah');
  // penyulang P0 terkunci sesudah pengukuran disimpan
  assert.strictEqual(e('simpanP0Yandal', { ...a, penyulang: 'Bikang', sectionId: x.sek.b, ubahLokasi: true, lokasiDiubah: x.iso('09:25:00') }), 'GARDU_TERKUNCI');
  // foto: BEBAN_R dulu
  assert.strictEqual(e('uploadFotoGarduYandal', x.fg(u1.ukurId, 'BEBAN_S', '09:10:00')), 'URUTAN_FOTO');
  assert.strictEqual(e('uploadFotoGarduYandal', x.fg(u1.ukurId, 'BEBAN_R', '09:04:00')), 'WAKTU_TIDAK_URUT');
  assert.strictEqual(e('uploadFotoGarduYandal', { ...x.fg(u1.ukurId, 'BEBAN_R', '09:10:00'), sumber: 'GALERI' }), 'PILIHAN_TIDAK_VALID', 'kamera SiSi saja');
  x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'PEKERJAAN', '09:08:00'));
  assert.strictEqual(e('uploadFotoP0Yandal', x.foto(a.p0Id, 'SESUDAH', '09:20:00')), 'PENGUKURAN_GARDU_BELUM_LENGKAP');
  const fr = x.fg(u1.ukurId, 'BEBAN_R', '09:10:00');
  const r2 = x.panggil('uploadFotoGarduYandal', fr);
  assert.deepStrictEqual([r2.status, r2.fotoServer, r2.hasil.waktuBeban, r2.hasil.jarakM], ['OK', ['BEBAN_R'], 'LWBP', 56]);
  assert.deepStrictEqual([k(1, 'Foto Beban R'), k(1, 'Jam Ukur'), k(1, 'Koordinat'), k(1, 'Waktu Beban'), k(1, 'Jarak ke Gardu (m)')],
    [kode1 + '_BEBAN_R.jpg', x.hari + ' 09:10:00', '-3.000500,106.500000', 'LWBP', 56]);
  assert.deepStrictEqual([x.dr.semuaFile[k(1, 'foto_id_beban_r')].akses, x.dr.semuaFile[k(1, 'foto_id_beban_r')].getDescription()],
    ['PRIVATE', 'sisi-foto:' + u1.ukurId + '-BEBAN_R']);
  assert.strictEqual(x.panggil('uploadFotoGarduYandal', fr).status, 'DUPLIKAT');
  assert.strictEqual(e('uploadFotoGarduYandal', x.fg(u1.ukurId, 'BEBAN_R', '09:11:00', {}, jpeg(1600, 1200, 7))), 'FOTO_SUDAH_ADA');
  // opsional KONDISI tidak membuat lengkap; 9 foto wajib lain
  x.panggil('uploadFotoGarduYandal', x.fg(u1.ukurId, 'KONDISI', '09:11:00'));
  const sisa = x.g.YAN_SLOT_GARDU_WAJIB_.slice(1);
  sisa.slice(0, -1).forEach((s, i) => x.panggil('uploadFotoGarduYandal', x.fg(u1.ukurId, s, '09:1' + (2 + Math.floor(i / 3)) + ':0' + (i % 3) )));
  assert.strictEqual(k(1, 'Diterapkan ke Master'), '', 'belum lengkap = belum ke master');
  assert.strictEqual(e('uploadFotoP0Yandal', x.foto(a.p0Id, 'SESUDAH', '09:20:00')), 'PENGUKURAN_GARDU_BELUM_LENGKAP');
  const rTerakhir = x.panggil('uploadFotoGarduYandal', x.fg(u1.ukurId, sisa.at(-1), '09:16:00'));
  assert.strictEqual(rTerakhir.fotoServer.length, 11);
  assert.strictEqual(rTerakhir.diterapkan, 'YA');
  assert.deepStrictEqual([kg(1, 'Tanggal Ukur Terakhir'), kg(1, 'Kode Ukur Terakhir'), kg(1, 'Arus Maks per Fasa (A)'), kg(1, 'Pembebanan (kVA)'),
    kg(1, 'Persentase Beban (%)'), kg(1, 'Waktu Beban'), kg(1, 'Kategori Beban'), kg(1, 'ukur_id_terakhir'), kg(1, 'revision'), kg(1, 'Diubah Oleh')],
  [x.hari, kode1, 144.34, 66.31, 66.31, 'LWBP', 'Cukup', u1.ukurId, 2, 'YANDAL 13']);
  assert.strictEqual(kg(2, 'Kode Ukur Terakhir'), '', 'gardu lain tidak tersentuh');
  // v0.79.0: 10 angka pengukuran ikut ke db_Gardu
  assert.deepStrictEqual(x.g.YAN_NILAI_GARDU_.map((n) => kg(1, n.kolom)), x.g.YAN_NILAI_GARDU_.map((n) => k(1, n.kolom)));
  assert.ok(typeof kg(1, 'Beban R (A)') === 'number');
  // koreksi sesudah lengkap = master ikut diperbarui
  x.panggil('simpanGarduYandal', { ...u1, bebanR: 80, catatan: 'Kabel NH kendor, sudah dikencangkan' });
  assert.strictEqual(kg(1, 'Beban R (A)'), 80);
  assert.deepStrictEqual([kg(1, 'Pembebanan (kVA)'), kg(1, 'Kategori Beban'), kg(1, 'revision')], [48.07, 'Underload', 3]);
  // Sesudah sekarang boleh; sesudah SELESAI semua terkunci
  assert.strictEqual(x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'SESUDAH', '09:20:00')).statusP0, 'SELESAI');
  assert.strictEqual(e('simpanGarduYandal', { ...u1, bebanR: 90, catatan: 'Kabel NH kendor, sudah dikencangkan' }), 'P0_SUDAH_SELESAI');
  assert.strictEqual(x.panggil('simpanGarduYandal', { ...u1, bebanR: 80, catatan: 'Kabel NH kendor, sudah dikencangkan' }).kodeUkur, kode1, 'kirim ulang tanpa perubahan tetap OK');
  // P0 jenis lain: bukan pengukuran gardu
  const b = x.p0({ dibuat: x.iso('09:21:00') });
  x.panggil('simpanP0Yandal', b);
  x.panggil('uploadFotoP0Yandal', x.foto(b.p0Id, 'SEBELUM', '09:22:00'));
  assert.strictEqual(e('simpanGarduYandal', x.ukur(b.p0Id, { dibuat: x.iso('09:23:00') })), 'BUKAN_PENGECEKAN_GARDU');
  // tim lain + web
  const s14 = x.mulai(x.login('16130.yandal14', x.ins2).tiket, [x.p.c], x.ins2);
  assert.strictEqual(e('simpanGarduYandal', u1, s14.token), 'BUKAN_MILIK_TIM');
  assert.strictEqual(e('uploadFotoGarduYandal', x.fg(u1.ukurId, 'BEBAN_S', '09:15:00'), s14.token), 'BUKAN_MILIK_TIM');
  assert.strictEqual(kodeError(() => x.panggil('simpanGarduYandal', u1, x.s.token, 'WEB')), 'AKSES_DITOLAK');
});

test('v0.74.0: master gardu: ukur yang lebih lama tidak menimpa ukur lebih baru; kapasitas kosong = persen kosong; Master Gardu boleh dibaca petugas YANDAL', () => {
  const x = siapkanUkurGardu();
  const { k, kg } = x;
  x.sheets.g.db_Gardu.data[2][x.g.DB_GARDU_HEADER_.indexOf('Tanggal Ukur Terakhir')] = '2099-01-01';
  x.jam.atur('09:01:00');
  const a = x.p0({ namaPekerjaan: 'Pengecekan Gardu' });
  x.panggil('simpanP0Yandal', a);
  x.jam.atur('09:30:00');
  x.panggil('uploadFotoP0Yandal', x.foto(a.p0Id, 'SEBELUM', '09:05:00'));
  const u = x.ukur(a.p0Id, { garduId: x.gid.b, catatan: undefined });
  const r = x.panggil('simpanGarduYandal', u);
  assert.deepStrictEqual([r.hasil.persen, r.hasil.kategori, r.hasil.kva], [null, '', 48.07]);
  x.g.YAN_SLOT_GARDU_WAJIB_.forEach((s, i) => x.panggil('uploadFotoGarduYandal', x.fg(u.ukurId, s, '09:1' + Math.floor(i / 5) + ':0' + (i % 5), i ? {} : { lat: undefined, lng: undefined })));
  assert.deepStrictEqual([k(1, 'Diterapkan ke Master'), k(1, 'Koordinat'), k(1, 'Jarak ke Gardu (m)')], ['TIDAK', '', '']);
  assert.strictEqual(kg(2, 'Kode Ukur Terakhir'), '', 'master lebih baru tidak ditimpa');
  // getMaster gardu: petugas YANDAL boleh, ROW tetap tidak
  const sesiY = x.g.profilUser_(x.user.y13);
  assert.ok(x.g.getMaster_(sesiY, { modul: ['gardu'] }).modul.gardu.jumlah >= 3);
  assert.strictEqual(kodeError(() => x.g.getMaster_(x.g.profilUser_(x.user.row), { modul: ['gardu'] })), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.g.getMaster_(sesiY, { modul: ['pejabatBa'] })), 'AKSES_DITOLAK', 'pejabat BA tetap khusus menu BA');
});

test('v0.74.0: ADMIN_perbaruiYanShift membuat sheet yan_Gardu kalau belum ada', () => {
  const y = siapkanYandal();
  y.g.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  delete y.sheets.y.yan_Gardu;
  y.g.ADMIN_perbaruiYanShift();
  assert.deepStrictEqual([...y.sheets.y.yan_Gardu.data[0]].slice(0, 90), [...y.g.YAN_GARDU_HEADER_]);
});

// ---------- v0.75.0: Approval P0 (admin) + aturan Pengukuran Gardu 2 Hari Sekali ----------
function siapkanApproval() {
  const x = siapkanUkurGardu();
  x.sheets.m.db_Menu.data.push(['OPS_VERIFIKASI_P0', 'Approval P0', 'MOBILE', false, 32, true]);
  x.cache.remove('akses:v1');   // aturan menu di-cache sejak login pertama
  x.jam.atur('09:01:00');
  const admin = x.login('16130.admin', U()).token;
  // P0 selesai: Ganti FCO (bobot 3) + Lain - Lain (bobot admin) + satu masih PROSES
  const a = x.p0({ dibuat: x.iso('09:00:00') }), b = x.p0({ namaPekerjaan: 'Lain - Lain', pekerjaanLainnya: 'Bantu UP3', dibuat: x.iso('09:00:30') }),
    c = x.p0({ dibuat: x.iso('09:00:40') });
  for (const p of [a, b, c]) x.panggil('simpanP0Yandal', p);
  x.jam.atur('09:40:00');
  for (const p of [a, b]) {
    x.panggil('uploadFotoP0Yandal', x.foto(p.p0Id, 'SEBELUM', '09:05:00'));
    x.panggil('uploadFotoP0Yandal', x.foto(p.p0Id, 'PEKERJAAN', '09:10:00'));
    x.panggil('uploadFotoP0Yandal', x.foto(p.p0Id, 'SESUDAH', '09:35:00'));
  }
  const ap = (action, data, tok = admin) => x.panggil(action, data, tok);
  const ea = (action, data, tok = admin) => kodeError(() => x.panggil(action, data, tok));
  const kP = (p0Id, n) => { const b2 = x.sheets.y.yan_P0.data.findIndex((r) => r[x.H.indexOf('p0_id')] === p0Id); return x.sheets.y.yan_P0.data[b2][x.H.indexOf(n)]; };
  return { ...x, admin, a, b, c, ap, ea, kP };
}

test('v0.75.0: Approval P0: daftar per tanggal + jumlah per status, keputusan + point + rekap, Lain - Lain wajib bobot, alasan Rejected wajib, khusus admin', () => {
  const x = siapkanApproval();
  const l = x.ap('getApprovalP0', { tanggal: x.hari });
  assert.deepStrictEqual(l.jumlah, { Menunggu: 2, Approved: 0, Rejected: 0 }, 'P0 PROSES tidak masuk');
  assert.deepStrictEqual(l.list.map((i) => [i.namaPekerjaan, i.status, i.foto.length]), [['Ganti FCO', 'Menunggu', 3], ['Lain - Lain', 'Menunggu', 3]]);
  assert.strictEqual(l.list[1].lainLain, true);
  assert.strictEqual(x.ap('getApprovalP0', { tanggal: x.hari, status: 'Approved' }).list.length, 0);
  // petugas YANDAL / ROW tidak boleh
  assert.strictEqual(x.ea('getApprovalP0', { tanggal: x.hari }, x.s.token), 'AKSES_DITOLAK');
  // keputusan
  assert.strictEqual(x.ea('simpanApprovalP0', { p0Id: x.c.p0Id, keputusan: 'Approved' }), 'P0_BELUM_SELESAI');
  assert.strictEqual(x.ea('simpanApprovalP0', { p0Id: x.a.p0Id, keputusan: 'Rejected' }), 'FIELD_WAJIB', 'alasan wajib');
  assert.strictEqual(x.ea('simpanApprovalP0', { p0Id: x.a.p0Id, keputusan: 'Approved', revision: 1 }), 'DATA_BERUBAH');
  const r1 = x.ap('simpanApprovalP0', { p0Id: x.a.p0Id, keputusan: 'Approved' });
  // durasi 30 menit = skor 1, bobot 3 x pengali 2 = 7
  assert.deepStrictEqual([r1.status, r1.point, r1.skorDurasi, r1.approvedOleh], ['Approved', 7, 1, 'Admin']);
  assert.deepStrictEqual([x.kP(x.a.p0Id, 'Status Approval'), x.kP(x.a.p0Id, 'Point'), x.kP(x.a.p0Id, 'Approved Oleh')], ['Approved', 7, 'Admin']);
  assert.strictEqual(x.kolS('P0 Approved'), 1, 'rekap shift ikut');
  assert.strictEqual(x.kolS('Total Point'), 7);
  assert.strictEqual(x.ea('simpanApprovalP0', { p0Id: x.b.p0Id, keputusan: 'Approved' }), 'FIELD_WAJIB', 'Lain - Lain wajib bobot');
  const r2 = x.ap('simpanApprovalP0', { p0Id: x.b.p0Id, keputusan: 'Approved', bobot: 4 });
  assert.deepStrictEqual([r2.point, x.kP(x.b.p0Id, 'Bobot')], [9, 4]);
  // keputusan diubah: Rejected = point 0 + alasan, rekap ikut
  const r3 = x.ap('simpanApprovalP0', { p0Id: x.a.p0Id, keputusan: 'Rejected', alasan: 'Foto Sesudah buram' });
  assert.deepStrictEqual([r3.status, r3.point, r3.alasanRejected], ['Rejected', 0, 'Foto Sesudah buram']);
  assert.deepStrictEqual([x.kolS('P0 Approved'), x.kolS('P0 Rejected'), x.kolS('Total Point')], [1, 1, 9]);
  const j = x.ap('getApprovalP0', { tanggal: x.hari }).jumlah;
  assert.deepStrictEqual(j, { Menunggu: 0, Approved: 1, Rejected: 1 });
  assert.ok(x.sheets.a.log_Audit.data.some((b) => b.includes('APPROVAL_P0')));
});

test('v0.75.0: koreksi jenis pekerjaan: dari master, alasan wajib, bobot + point dihitung ulang, riwayat tersimpan', () => {
  const x = siapkanApproval();
  assert.strictEqual(x.ea('ubahJenisP0', { p0Id: x.a.p0Id, namaPekerjaan: 'Pemangkasan ROW' }), 'FIELD_WAJIB', 'alasan wajib');
  assert.strictEqual(x.ea('ubahJenisP0', { p0Id: x.a.p0Id, namaPekerjaan: 'Tidak Ada', alasan: 'salah' }), 'PEKERJAAN_TIDAK_DIKENAL');
  x.ap('simpanApprovalP0', { p0Id: x.a.p0Id, keputusan: 'Approved' });
  const r = x.ap('ubahJenisP0', { p0Id: x.a.p0Id, namaPekerjaan: 'Pemangkasan ROW', alasan: 'Petugas salah pilih' });
  // bobot ROW 2 x pengali 2 + skor 1 = 5
  assert.deepStrictEqual([r.namaPekerjaan, r.bobot, r.point, r.koreksiJenis.length, r.koreksiJenis[0].dari, r.koreksiJenis[0].ke],
    ['Pemangkasan ROW', 2, 5, 1, 'Ganti FCO', 'Pemangkasan ROW']);
  assert.deepStrictEqual([x.kP(x.a.p0Id, 'Nama Pekerjaan'), x.kP(x.a.p0Id, 'jenis_id'), x.kolS('Total Point')], ['Pemangkasan ROW', x.j.row, 5]);
  // ke Lain - Lain sesudah Approved = bobot wajib
  assert.strictEqual(x.ea('ubahJenisP0', { p0Id: x.a.p0Id, namaPekerjaan: 'Lain - Lain', pekerjaanLainnya: 'Bantu', alasan: 'x' }), 'FIELD_WAJIB');
  const r2 = x.ap('ubahJenisP0', { p0Id: x.a.p0Id, namaPekerjaan: 'Lain - Lain', pekerjaanLainnya: 'Bantu', alasan: 'x', bobot: 1 });
  assert.deepStrictEqual([r2.point, r2.pekerjaanLainnya, r2.koreksiJenis.length], [3, 'Bantu', 2]);
  // Menunggu: bobot master, point belum
  const r3 = x.ap('ubahJenisP0', { p0Id: x.b.p0Id, namaPekerjaan: 'Ganti FCO', alasan: 'bukan lain-lain' });
  assert.deepStrictEqual([r3.status, r3.bobot, r3.point, r3.pekerjaanLainnya], ['Menunggu', 3, null, '']);
  assert.strictEqual(x.ea('ubahJenisP0', { p0Id: x.c.p0Id, namaPekerjaan: 'Ganti FCO', alasan: 'x' }), 'P0_BELUM_SELESAI');
});

test('v0.75.0: foto approval: P0 + anak gardu, anak wajib milik P0, thumbnail kalau ada; lampiran gardu ikut di daftar', () => {
  const x = siapkanApproval();
  const g = x.p0({ namaPekerjaan: 'Pengecekan Gardu', dibuat: x.iso('09:36:00') });
  x.panggil('simpanP0Yandal', g);
  x.panggil('uploadFotoP0Yandal', x.foto(g.p0Id, 'SEBELUM', '09:37:00'));
  const u = x.ukur(g.p0Id, { dibuat: x.iso('09:37:30') });
  x.panggil('simpanGarduYandal', u);
  x.g.YAN_SLOT_GARDU_WAJIB_.forEach((s, i) => x.panggil('uploadFotoGarduYandal', x.fg(u.ukurId, s, '09:38:0' + Math.floor(i / 2))));
  x.panggil('uploadFotoP0Yandal', x.foto(g.p0Id, 'PEKERJAAN', '09:39:00'));
  x.panggil('uploadFotoP0Yandal', x.foto(g.p0Id, 'SESUDAH', '09:39:30'));
  const item = x.ap('getApprovalP0', { tanggal: x.hari }).list.find((i) => i.p0Id === g.p0Id);
  assert.deepStrictEqual([item.gardu.length, item.gardu[0].noGardu, item.gardu[0].foto.length, item.gardu[0].hasil.kategori, item.gardu[0].diterapkan],
    [1, 'TB0101', 10, 'Underload', 'YA']);
  const f = x.ap('getFotoApprovalP0', { p0Id: g.p0Id, jenis: 'P0', slot: 'SEBELUM', ukuran: 'PENUH' });
  assert.ok(f.data.length > 10 && f.kecil === false);
  const fg = x.ap('getFotoApprovalP0', { p0Id: g.p0Id, jenis: 'GARDU', id: u.ukurId, slot: 'BEBAN_R' });
  assert.strictEqual(fg.mime, 'image/jpeg');
  assert.strictEqual(x.ea('getFotoApprovalP0', { p0Id: x.a.p0Id, jenis: 'GARDU', id: u.ukurId, slot: 'BEBAN_R' }), 'DATA_TIDAK_DITEMUKAN', 'anak P0 lain');
  assert.strictEqual(x.ea('getFotoApprovalP0', { p0Id: g.p0Id, jenis: 'GARDU', id: u.ukurId, slot: 'KONDISI' }), 'FOTO_TIDAK_ADA');
  assert.strictEqual(x.ea('getFotoApprovalP0', { p0Id: g.p0Id, jenis: 'P0', slot: 'BEBAN_R' }), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(x.ea('getFotoApprovalP0', { p0Id: g.p0Id, jenis: 'P0', slot: 'SEBELUM' }, x.s.token), 'AKSES_DITOLAK');
});

test('v0.75.0: aturan Pengukuran Gardu 2 Hari Sekali: toggle admin, gardu sama ditolak < 2 hari (master / yan_Gardu), mati = bebas', () => {
  const x = siapkanApproval();
  const aturan = (tok) => JSON.parse(JSON.stringify(x.g.getMaster_(x.g.profilUser_(tok), { modul: ['aturanYandal'] }).modul.aturanYandal.isi));
  assert.deepStrictEqual(aturan(x.user.y13), [{ kunci: 'garduDuaHari', aktif: false, jedaHari: 2 }]);
  assert.strictEqual(kodeError(() => x.g.getMaster_(x.g.profilUser_(x.user.row), { modul: ['aturanYandal'] })), 'AKSES_DITOLAK');
  assert.strictEqual(x.ea('simpanAturanYandal', { garduDuaHari: true }, x.s.token), 'AKSES_DITOLAK');
  assert.deepStrictEqual(x.ap('simpanAturanYandal', { garduDuaHari: true }), { garduDuaHari: true });
  assert.strictEqual(aturan(x.user.y13)[0].aktif, true);
  // master: TB0101 terakhir diukur kemarin = ditolak; TB0102 belum pernah = boleh
  const kemarin = x.g.tglJakarta_(new Date(Date.parse(x.hari + 'T12:00:00+07:00') - 864e5));
  x.sheets.g.db_Gardu.data[1][x.g.DB_GARDU_HEADER_.indexOf('Tanggal Ukur Terakhir')] = kemarin;
  const g1 = x.p0({ namaPekerjaan: 'Pengecekan Gardu', dibuat: x.iso('09:36:00') });
  x.panggil('simpanP0Yandal', g1);
  x.panggil('uploadFotoP0Yandal', x.foto(g1.p0Id, 'SEBELUM', '09:37:00'));
  const e1 = kodeError(() => x.panggil('simpanGarduYandal', x.ukur(g1.p0Id, { dibuat: x.iso('09:37:30') })));
  assert.strictEqual(e1, 'GARDU_BARU_DIUKUR');
  x.panggil('simpanGarduYandal', x.ukur(g1.p0Id, { garduId: x.gid.b, dibuat: x.iso('09:37:30') }));
  // yan_Gardu hari ini: TB0102 di P0 lain = ditolak
  const g2 = x.p0({ namaPekerjaan: 'Pengecekan Gardu', dibuat: x.iso('09:38:00') });
  x.panggil('simpanP0Yandal', g2);
  x.panggil('uploadFotoP0Yandal', x.foto(g2.p0Id, 'SEBELUM', '09:38:30'));
  assert.strictEqual(kodeError(() => x.panggil('simpanGarduYandal', x.ukur(g2.p0Id, { garduId: x.gid.b, dibuat: x.iso('09:39:00') }))), 'GARDU_BARU_DIUKUR');
  // v0.98.13: aturanYandal juga menyertakan ukurTerbaru 2 hari terakhir dari yan_Gardu
  const ut = aturan(x.user.y13)[0].ukurTerbaru;
  assert.ok(Array.isArray(ut) && ut.some((u) => u.noGardu === 'TB0102' && u.tanggal === x.hari), 'ukurTerbaru memuat TB0102 hari ini');
  // dua hari lalu = boleh
  x.sheets.g.db_Gardu.data[1][x.g.DB_GARDU_HEADER_.indexOf('Tanggal Ukur Terakhir')] = x.g.tglJakarta_(new Date(Date.parse(x.hari + 'T12:00:00+07:00') - 2 * 864e5));
  assert.strictEqual(x.panggil('simpanGarduYandal', x.ukur(g2.p0Id, { dibuat: x.iso('09:39:00') })).noGardu, 'TB0101');
  // toggle mati = gardu sama boleh lagi
  x.ap('simpanAturanYandal', { garduDuaHari: false });
  const g3 = x.p0({ namaPekerjaan: 'Pengecekan Gardu', dibuat: x.iso('09:39:20') });
  x.panggil('simpanP0Yandal', g3);
  x.panggil('uploadFotoP0Yandal', x.foto(g3.p0Id, 'SEBELUM', '09:39:30'));
  assert.strictEqual(x.panggil('simpanGarduYandal', x.ukur(g3.p0Id, { garduId: x.gid.b, dibuat: x.iso('09:39:40') })).noGardu, 'TB0102');
});


// ---------- v0.76.0: BA tanpa Drive di HP + edit BA ----------
test('v0.76.0: getBaGardu + getFotoBaGardu + getPdfBaGardu: isian form edit, foto & PDF lewat server, khusus admin', () => {
  const x = siapkanPdf();
  const d = JSON.parse(JSON.stringify(x.gg.getBaGardu_(x.admin, { baId: x.baId })));
  assert.deepStrictEqual([d.noGardu, d.jenis, d.sectionId, d.koordinat, d.kva, d.merk, d.tahun, d.jurusan, d.kepemilikan, d.petugas1Id, d.petugas2Id, d.revisiBa],
    ['TB0422', 'Pengoperasian Trafo', x.sec.kb, '-3.012345, 106.456789', 100, 'Trafindo', 2025, 4, 'PLN', x.pj.a, x.pj.b, 0]);
  assert.deepStrictEqual(d.foto, ['NAMEPLATE', 'FULL_GARDU', 'NAMEPLATE_PHB', 'BOX_PHB']);
  assert.strictEqual(kodeError(() => x.gg.getBaGardu_({ ...x.admin, role: 'PETUGAS' }, { baId: x.baId })), 'AKSES_DITOLAK');
  const f = x.gg.getFotoBaGardu_(x.admin, { baId: x.baId, slot: 'NAMEPLATE' });
  assert.strictEqual(Buffer.from(f.data, 'base64')[0], 0xFF);
  assert.strictEqual(kodeError(() => x.gg.getFotoBaGardu_(x.admin, { baId: x.baId, slot: 'SLD' })), 'FORMAT_SALAH');
  assert.strictEqual(kodeError(() => x.gg.getPdfBaGardu_(x.admin, { baId: x.baId })), 'PDF_BELUM_ADA');
  x.atur();
  x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId });
  const p = x.gg.getPdfBaGardu_(x.admin, { baId: x.baId });
  assert.strictEqual(Buffer.from(p.data, 'base64').toString().slice(0, 5), '%PDF-');
  assert.deepStrictEqual([p.namaFile, p.mime, p.statusPdf], [`BA-Pengoperasian-${x.r.idBa}.pdf`, 'application/pdf', 'SELESAI']);
});

test('v0.76.0: ubahBaGardu: isian + foto pengganti, nomor / tanggal BA tetap, Revisi BA +1, PDF BELUM, db_Gardu ikut, revision dicek', () => {
  const x = siapkanPdf();
  const d = x.gg.getBaGardu_(x.admin, { baId: x.baId });
  const isi = { baId: x.baId, revision: d.revision, tanggalPekerjaan: d.tanggalPekerjaan, sectionId: d.sectionId, alamat: 'Jl. Baru 2',
    koordinat: '-3.1, 106.4', konstruksi: 'Cantol', kva: 160, merk: 'Unindo', seri: 'SN-2', tahun: 2024, jurusan: 3, kepemilikan: 'PLN',
    petugas1Id: x.pj.b, petugas2Id: x.pj.a };
  // foto pengganti: BA belum tersimpan tidak boleh revisi, BA tersimpan tanpa revisi tetap ditolak
  const buf = jpeg(700, 500), sha = crypto.createHash('sha256').update(buf).digest('hex');
  const up = (baId, revisi) => x.gg.uploadFotoBaGardu_(x.admin, { baId, jenis: 'Pengoperasian Trafo', slot: 'NAMEPLATE', sumber: 'KAMERA', sha256: sha,
    ukuranByte: buf.length, data: buf.toString('base64'), ...(revisi ? { revisi: true } : {}) });
  assert.strictEqual(kodeError(() => up(x.baId, false)), 'BA_SUDAH_DISIMPAN');
  assert.strictEqual(kodeError(() => up(U(), true)), 'BA_TIDAK_DITEMUKAN');
  const lama = JSON.parse(x.baris().foto_meta).NAMEPLATE.fileId;
  const u = up(x.baId, true);
  assert.strictEqual(u.revisi, true);
  assert.strictEqual(x.baris().foto_meta.includes(u.fileId), false, 'belum dipasang sebelum ubahBaGardu');
  const r = JSON.parse(JSON.stringify(x.gg.ubahBaGardu_(x.admin, isi)));
  assert.strictEqual(r.status, 'OK');
  assert.ok(r.diubah.includes('Kapasitas (kVA)') && r.diubah.includes('foto Nameplate Trafo') && r.diubah.includes('Petugas 1'));
  const b = x.baris();
  assert.deepStrictEqual([b['Nama Peralatan'], b['ID BA'], b['No BA Full'], b['Kapasitas (kVA)'], b.Konstruksi, b.Alamat, b['Petugas 1'], b['Revisi BA'], b['Status PDF']],
    ['TB0422', x.r.idBa, x.r.noBaFull, 160, 'Cantol', 'Jl. Baru 2', 'Budi', 1, 'BELUM']);
  assert.strictEqual(JSON.parse(b.foto_meta).NAMEPLATE.fileId, u.fileId);
  assert.strictEqual(x.dr.semuaFile[lama].dibuang, true, 'foto lama dibuang sesudah dipasang');
  const g = x.objek(x.HG, x.sheets.g.db_Gardu.data.find((row) => row[x.HG.indexOf('gardu_id')] === x.r.garduId));
  assert.deepStrictEqual([g['Kapasitas (kVA)'], g.Merk, g.Lat, g.Konstruksi], [160, 'Unindo', -3.1, 'Cantol'], 'BA terakhir gardu = master ikut');
  assert.ok(x.sheets.a.log_Audit.data.some((l) => l[4] === 'BA_GARDU_UBAH'));
  // revision lama = DATA_BERUBAH; isian sama = TIDAK_BERUBAH
  assert.strictEqual(kodeError(() => x.gg.ubahBaGardu_(x.admin, isi)), 'DATA_BERUBAH');
  const sama = x.gg.ubahBaGardu_(x.admin, { ...isi, revision: Number(x.baris().revision) });
  assert.deepStrictEqual([sama.status, sama.diubah.length], ['TIDAK_BERUBAH', 0]);
  // tanggal pekerjaan sesudah tanggal BA ditolak, field nomor tidak dikenal
  assert.strictEqual(kodeError(() => x.gg.ubahBaGardu_(x.admin, { ...isi, revision: Number(x.baris().revision), tanggalPekerjaan: '2999-01-01' })), 'TANGGAL_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.gg.ubahBaGardu_(x.admin, { ...isi, prefix: 'PY' })), 'FIELD_TIDAK_DIKENAL');
  assert.strictEqual(kodeError(() => x.gg.ubahBaGardu_({ ...x.admin, role: 'ADMIN_ES' }, isi)), 'AKSES_DITOLAK');
});


// ---------- v0.77.0: foto + PDF BA satu folder per gardu ----------
test('v0.77.0: folder BA: upload ke folder sementara, simpan memindah foto ke Gardu / <No Gardu> / <YYYY-MM-DD>_<Jenis BA> (ID tetap), foto revisi + PDF di folder yang sama, kiriman lama tetap terbaca, ADMIN_rapikanFolderBaGardu', () => {
  const x = siapkanPdf();
  const akar = x.dr.folders.akarBa;
  const ke = (f, jalur) => jalur.reduce((d, nm) => (d && d.anak[nm] ? x.dr.folders[d.anak[nm]] : null), f);
  const fBa = ke(akar, ['Gardu', 'TB0422', `${x.hari}_Pengoperasian Trafo`]);
  assert.ok(fBa, 'folder Gardu/TB0422/<tanggal>_Pengoperasian Trafo');
  assert.deepStrictEqual(Object.keys(fBa.file).sort(), ['TB0422_Box PHB-TR.jpg', 'TB0422_Foto Full Gardu.jpg', 'TB0422_Nameplate PHB-TR.jpg', 'TB0422_Nameplate Trafo.jpg']);
  const meta = JSON.parse(x.baris().foto_meta);
  assert.strictEqual(fBa.file['TB0422_Nameplate Trafo.jpg'].getId(), meta.NAMEPLATE.fileId, 'ID file tetap = link Rekap_BA tetap');
  assert.strictEqual(x.baris()['Foto Nameplate'], `https://drive.google.com/file/d/${meta.NAMEPLATE.fileId}/view`);
  const sementara = ke(akar, ['Gardu', '_Upload Sementara', x.baId]);
  assert.ok(sementara && sementara.dibuang, 'folder upload sementara dibuang sesudah kosong');
  assert.ok(!akar.anak['BA Gardu'] && !akar.anak['Berita Acara'], 'folder lama tidak dibuat lagi');
  assert.strictEqual(x.r.folder, `Gardu/TB0422/${x.hari}_Pengoperasian Trafo`);
  // nomor belum final: foto BA baru menunggu di folder sementara; nomor berubah = foto tetap di sana
  const id2 = U(); x.semuaFoto(id2);
  const s2 = ke(akar, ['Gardu', '_Upload Sementara', id2]);
  assert.strictEqual(Object.keys(s2.file).length, 4);
  assert.strictEqual(kodeError(() => x.gg.simpanBaGardu_(x.admin, x.isi(id2, { noGarduWatermark: 'TB0999' }))), 'NOMOR_GARDU_BERUBAH');
  assert.strictEqual(Object.keys(s2.file).length, 4, 'gagal simpan = foto tidak dipindah');
  const r2 = x.gg.simpanBaGardu_(x.admin, x.isi(id2));
  assert.strictEqual(r2.noGardu, 'TB0423');
  assert.strictEqual(Object.keys(ke(akar, ['Gardu', 'TB0423', `${x.hari}_Pengoperasian Trafo`]).file).length, 4);
  // kiriman HP yang dimulai sebelum update (folder BA Gardu / <jenis> / <baId>) tetap terbaca lalu dipindah
  const id3 = U(), buf = jpeg(800, 600);
  const lama = x.gg.folderFoto_('akarBa', ['BA Gardu', 'Pengoperasian Trafo', id3]);
  for (const sl of ['NAMEPLATE', 'FULL_GARDU', 'NAMEPLATE_PHB', 'BOX_PHB']) {
    const f = lama.createFile({ bytes: buf, mime: 'image/jpeg', nama: sl + '_lama.jpg' }); f.setDescription('sisi-foto:' + id3 + '-' + sl);
  }
  const r3 = x.gg.simpanBaGardu_(x.admin, x.isi(id3));
  assert.strictEqual(r3.status, 'OK');
  assert.strictEqual(Object.keys(ke(akar, ['Gardu', r3.noGardu, `${x.hari}_Pengoperasian Trafo`]).file).length, 4);
  assert.ok(x.dr.folders[lama.getId()].dibuang);
  // foto pengganti (edit BA) langsung ke folder BA, nama dirapikan sesudah dipasang
  const d = x.gg.getBaGardu_(x.admin, { baId: x.baId });
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const u = x.gg.uploadFotoBaGardu_(x.admin, { baId: x.baId, jenis: 'Pengoperasian Trafo', slot: 'BOX_PHB', sumber: 'KAMERA', sha256: sha, ukuranByte: buf.length, data: buf.toString('base64'), revisi: true });
  assert.ok(Object.values(fBa.file).some((f) => f.getId() === u.fileId), 'foto revisi di folder BA');
  const ub = x.gg.ubahBaGardu_(x.admin, { baId: x.baId, revision: d.revision, tanggalPekerjaan: d.tanggalPekerjaan, sectionId: d.sectionId, alamat: d.alamat,
    koordinat: d.koordinat, konstruksi: d.konstruksi, kva: d.kva, merk: d.merk, seri: d.seri, tahun: d.tahun, jurusan: d.jurusan, kepemilikan: d.kepemilikan,
    merkPhb: d.merkPhb, seriPhb: d.seriPhb, tahunPhb: d.tahunPhb, perluasanSutm: d.perluasanSutm, vendor: d.vendor, petugas1Id: d.petugas1Id, petugas2Id: d.petugas2Id });
  assert.deepStrictEqual([...ub.diubah], ['foto Box PHB-TR']);
  assert.strictEqual(fBa.file['TB0422_Box PHB-TR.jpg'].getId(), u.fileId);
  assert.strictEqual(Object.keys(fBa.file).length, 4, 'foto lama dibuang, tidak dobel');
  // PDF ke folder yang sama
  x.atur();
  const p = x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId });
  assert.ok(fBa.file[p.namaFile]);
  // alat editor: file BA v2 di folder lain dipindah, jalan kedua tidak memindah apa pun
  const nyasar = x.dr.semuaFile[JSON.parse(x.baris().foto_meta).NAMEPLATE.fileId];
  nyasar.moveTo(x.gg.folderFoto_('akarBa', ['BA Gardu', 'Pengoperasian Trafo', 'x'])); nyasar.setName('acak.jpg');
  x.gg.pastikanPemilik_ = () => {};
  const j = x.gg.ADMIN_rapikanFolderBaGardu();
  assert.deepStrictEqual([j.dipindah, j.diganti, j.gagal], [1, 1, 0]);
  assert.strictEqual(fBa.file['TB0422_Nameplate Trafo.jpg'], nyasar);
  assert.deepStrictEqual([x.gg.ADMIN_rapikanFolderBaGardu().dipindah, x.gg.ADMIN_rapikanFolderBaGardu().diganti], [0, 0]);
});

// ---------- v0.78.0: daftar BA berfilter, BA TTD, Kirim EAM, Update Master Gardu ----------
function kirimTtd(x, baId, buf, mime = 'application/pdf', potong = 2 * 1024 * 1024) {
  const sha = crypto.createHash('sha256').update(buf).digest('hex'), uploadId = U();
  const dari = Math.ceil(buf.length / potong);
  let h;
  for (let ke = 1; ke <= dari; ke++) {
    h = x.gg.uploadTtdBaGardu_(x.admin, { baId, uploadId, ke, dari, mime, namaFile: 'scan.pdf', sha256: sha, ukuranByte: buf.length,
      data: buf.subarray((ke - 1) * potong, ke * potong).toString('base64') });
  }
  return h;
}
const pdfPalsu = (n) => { const b = Buffer.alloc(n, 0x41); b.write('%PDF-1.4'); return b; };

test('v0.78.0: getDaftarBaGardu: urut terbaru / terlama (Tanggal BA), rentang tanggal, jenis, tahap + ringkasan per tahap', () => {
  const x = siapkanPdf();
  const id2 = U(); x.semuaFoto(id2);
  const kemarin = x.gg.tglJakarta_(new Date(Date.now() - 86400e3));
  x.gg.simpanBaGardu_(x.admin, x.isi(id2, { tanggalBa: kemarin, tanggalPekerjaan: kemarin }));
  const d = (f) => JSON.parse(JSON.stringify(x.gg.getDaftarBaGardu_(x.admin, f)));
  const semua = d({});
  assert.deepStrictEqual(semua.isi.slice(0, 2).map((b) => b.baId), [x.baId, id2], 'Tanggal BA terbaru dulu (bukan No)');
  assert.deepStrictEqual(d({ urut: 'TERLAMA' }).isi.filter((b) => b.baId).map((b) => b.baId).slice(-2), [id2, x.baId]);
  assert.deepStrictEqual(d({ dari: kemarin, sampai: kemarin }).isi.map((b) => b.baId), [id2]);
  assert.deepStrictEqual(d({ dari: x.hari }).isi.map((b) => b.baId), [x.baId]);
  assert.strictEqual(kodeError(() => x.gg.getDaftarBaGardu_(x.admin, { dari: x.hari, sampai: kemarin })), 'TANGGAL_TIDAK_VALID');
  assert.strictEqual(d({ jenis: 'Penggantian Trafo' }).jumlah, 0);
  assert.strictEqual(d({ jenis: 'Pengoperasian Trafo' }).jumlah, 2);
  assert.strictEqual(kodeError(() => x.gg.getDaftarBaGardu_(x.admin, { tahap: 'LAIN' })), 'PILIHAN_TIDAK_VALID');
  x.atur();
  x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId });
  const r = d({ tahap: 'PROSES_TTD' });
  assert.deepStrictEqual([r.isi.map((b) => b.baId), r.ringkasan.PROSES_TTD, r.ringkasan.DRAFT], [[x.baId], 1, 2]);
  assert.deepStrictEqual([r.isi[0].tahap, r.isi[0].statusTtd, r.isi[0].adaTtd], ['PROSES_TTD', 'BELUM TTD', false]);
  kirimTtd(x, x.baId, pdfPalsu(5000));
  assert.deepStrictEqual(d({ tahap: 'SELESAI_TTD' }).isi.map((b) => b.baId), [x.baId]);
});

test('v0.78.0: upload BA TTD: wajib PDF BA dulu, per bagian 2 MB digabung + dicek sha / jenis file, satu folder dengan BA, upload ulang buang file lama, PDF / edit ulang = TTD ULANG', () => {
  const x = siapkanPdf();
  assert.strictEqual(kodeError(() => kirimTtd(x, x.baId, pdfPalsu(3000))), 'PDF_BELUM_ADA');
  x.atur();
  x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId });
  // file 2,5 MB = 2 bagian
  const besar = pdfPalsu(2.5 * 1024 * 1024);
  const h = JSON.parse(JSON.stringify(kirimTtd(x, x.baId, besar)));
  assert.deepStrictEqual([h.status, h.ulang, h.statusTtd, h.tahap], ['OK', false, 'SUDAH TTD', 'SELESAI_TTD']);
  assert.strictEqual(h.namaFile, `BA-TTD-${x.r.idBa}.pdf`);
  const fBa = x.dr.folders[x.dr.folders[x.dr.folders[x.dr.folders.akarBa.anak.Gardu].anak.TB0422].anak[`${x.hari}_Pengoperasian Trafo`]];
  assert.ok(fBa.file[h.namaFile], 'BA TTD satu folder dengan foto + PDF');
  assert.strictEqual(Buffer.from(x.dr.semuaFile[h.fileId].getBlob().getBytes()).length, besar.length);
  const b = x.baris();
  assert.deepStrictEqual([b['Status TTD'], b.ttd_file_id, b['Link BA TTD']], ['SUDAH TTD', h.fileId, `https://drive.google.com/file/d/${h.fileId}/view`]);
  assert.match(b['Waktu TTD'], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.ok(!Object.keys(x.dr.semuaFile).some((id) => x.dr.semuaFile[id].nama.endsWith('.part') && !x.dr.semuaFile[id].dibuang), 'bagian sementara dibuang');
  assert.ok(x.sheets.a.log_Audit.data.some((l) => l[4] === 'BA_GARDU_TTD'));
  // unduh lewat server
  const t = x.gg.getTtdBaGardu_(x.admin, { baId: x.baId });
  assert.deepStrictEqual([t.mime, t.ukuranByte, t.namaFile], ['application/pdf', besar.length, h.namaFile]);
  // rusak / bukan PDF / bagian hilang
  const kecil = pdfPalsu(4000), sha = crypto.createHash('sha256').update(kecil).digest('hex');
  const satu = (o) => x.gg.uploadTtdBaGardu_(x.admin, { baId: x.baId, uploadId: U(), ke: 1, dari: 1, mime: 'application/pdf', sha256: sha, ukuranByte: kecil.length, data: kecil.toString('base64'), ...o });
  assert.strictEqual(kodeError(() => satu({ sha256: 'a'.repeat(64) })), 'FILE_RUSAK');
  assert.strictEqual(kodeError(() => satu({ mime: 'image/jpeg' })), 'FORMAT_FILE_SALAH');
  assert.strictEqual(kodeError(() => satu({ ke: 2, dari: 2, ukuranByte: 3 * 1024 * 1024 })), 'BAGIAN_HILANG');
  assert.strictEqual(kodeError(() => satu({ dari: 2 })), 'FORMAT_SALAH');
  assert.strictEqual(kodeError(() => satu({ ukuranByte: 11 * 1024 * 1024, dari: 6 })), 'DI_LUAR_RENTANG');
  // non-PDF (JPEG / PNG) ditolak; upload ulang PDF membuang file lama
  const jp = jpeg(800, 600, 500);
  assert.strictEqual(kodeError(() => kirimTtd(x, x.baId, jp, 'image/jpeg')), 'FORMAT_FILE_SALAH');
  const hj = kirimTtd(x, x.baId, kecil, 'application/pdf');
  assert.deepStrictEqual([hj.ulang, hj.namaFile], [true, `BA-TTD-${x.r.idBa}.pdf`]);
  assert.strictEqual(x.dr.semuaFile[h.fileId].dibuang, true, 'TTD lama dibuang sesudah baris menunjuk file baru');
  // PDF dibuat ulang sesudah TTD = TTD ULANG; upload ulang = SUDAH TTD lagi
  x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId });
  assert.deepStrictEqual([x.baris()['Status TTD'], x.gg.getDaftarBaGardu_(x.admin, {}).isi[0].tahap], ['TTD ULANG', 'TTD_ULANG']);
  assert.strictEqual(kodeError(() => x.gg.kirimEamBaGardu_(x.admin, { baId: x.baId })), 'TTD_PERLU_ULANG');
  assert.strictEqual(kodeError(() => x.gg.updateMasterGarduBa_(x.admin, { baId: x.baId })), 'TTD_PERLU_ULANG');
  kirimTtd(x, x.baId, kecil);
  assert.strictEqual(x.baris()['Status TTD'], 'SUDAH TTD');
  // edit BA sesudah TTD = TTD ULANG
  const d = x.gg.getBaGardu_(x.admin, { baId: x.baId });
  x.gg.ubahBaGardu_(x.admin, { baId: x.baId, revision: d.revision, tanggalPekerjaan: d.tanggalPekerjaan, sectionId: d.sectionId, alamat: 'Jl. Ubah',
    koordinat: d.koordinat, konstruksi: d.konstruksi, kva: d.kva, merk: d.merk, seri: d.seri, tahun: d.tahun, jurusan: d.jurusan, kepemilikan: d.kepemilikan,
    petugas1Id: d.petugas1Id });
  assert.strictEqual(x.baris()['Status TTD'], 'TTD ULANG');
  assert.strictEqual(kodeError(() => x.gg.uploadTtdBaGardu_({ ...x.admin, role: 'ADMIN_ES' }, {})), 'AKSES_DITOLAK');
});

test('v0.78.0: Kirim EAM format v1 (Pengoperasian) dengan file TTD terlampir + Update Master Gardu dari BA TTD (cek BA lebih baru, kolom berubah)', () => {
  const x = siapkanPdf();
  assert.strictEqual(kodeError(() => x.gg.kirimEamBaGardu_(x.admin, { baId: x.baId })), 'TTD_BELUM_ADA');
  assert.strictEqual(kodeError(() => x.gg.updateMasterGarduBa_(x.admin, { baId: x.baId })), 'TTD_BELUM_ADA');
  x.atur();
  x.gg.buatPdfBaGardu_(x.admin, { baId: x.baId });
  kirimTtd(x, x.baId, pdfPalsu(3000));
  const e = JSON.parse(JSON.stringify(x.gg.kirimEamBaGardu_(x.admin, { baId: x.baId })));
  const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][Number(x.m) - 1];
  const baris = e.teks.split('\n');
  assert.deepStrictEqual(baris.slice(0, 7), ['*PENGOPERASIAN TRAFO ULP TOBOALI*', '', `Tanggal : ${Number(x.hari.slice(8))} ${bulan} ${x.y}`, '', '*DATA TRAFO*',
    'Nomor Gardu : TB0422', 'Kapasitas : 100kVA']);
  for (const l of ['Koordinat : -3.012345, 106.456789', 'OwnerID : 07020304', 'External Reference : SECTION - LBS - LBS Kampung Baru', 'Perluasan SUTM : 0,5kmS',
    'Vendor Pelaksana : CV Maju', '*DATA PHB-TR*', 'Merk : Schneider', 'Jurusan : 4']) assert.ok(baris.includes(l), l);
  assert.strictEqual(baris[baris.length - 1], `File BA : terlampir (BA-TTD-${x.r.idBa}.pdf)`);
  assert.deepStrictEqual([e.namaFile, e.eamKali, e.aksesEam], [`BA-TTD-${x.r.idBa}.pdf`, 1, 0]);
  assert.match(e.peringatan[0], /EAM_EMAIL/);
  // v0.80.0: akun EAM diisi = file TTD dibagikan (Viewer, link tetap Dibatasi) + baris Link BA v1 kembali
  x.props.setProperty('EAM_EMAIL', 'eam.babel@pln.co.id, salah-email, EAM2@pln.co.id');
  const e2 = JSON.parse(JSON.stringify(x.gg.kirimEamBaGardu_(x.admin, { baId: x.baId })));
  const fT = x.dr.semuaFile[x.baris().ttd_file_id];
  assert.deepStrictEqual([e2.aksesEam, e2.eamKali, [...fT.viewer], fT.akses], [2, 2, ['eam.babel@pln.co.id', 'eam2@pln.co.id'], 'PRIVATE']);
  const b2 = e2.teks.split('\n');
  assert.deepStrictEqual(b2.slice(-2), [`Link BA : https://drive.google.com/file/d/${fT.getId()}/view`, `File BA : terlampir (BA-TTD-${x.r.idBa}.pdf)`]);
  x.gg.kirimEamBaGardu_(x.admin, { baId: x.baId });
  assert.strictEqual(fT.viewer.length, 2, 'tidak dibagikan dobel');
  // upload ulang TTD = file baru langsung dibagikan; alat editor membagikan file lama
  kirimTtd(x, x.baId, pdfPalsu(3100));
  assert.strictEqual(x.dr.semuaFile[x.baris().ttd_file_id].viewer.length, 2);
  x.gg.pastikanPemilik_ = () => {};
  x.props.setProperty('EAM_EMAIL', 'eam3@pln.co.id');
  assert.strictEqual(x.gg.ADMIN_bagikanTtdKeEam().dibagikan, 1);
  assert.ok(x.dr.semuaFile[x.baris().ttd_file_id].viewer.includes('eam3@pln.co.id'));
  x.props.setProperty('EAM_EMAIL', '');
  kirimTtd(x, x.baId, pdfPalsu(3000));
  assert.ok(x.sheets.a.log_Audit.data.some((l) => l[4] === 'BA_GARDU_EAM'));
  // master gardu: isian BA sama dengan master = TIDAK_BERUBAH; master diubah manual = dikembalikan ke isian BA
  const gIdx = () => x.sheets.g.db_Gardu.data.findIndex((row) => row[x.HG.indexOf('gardu_id')] === x.r.garduId);
  const m0 = JSON.parse(JSON.stringify(x.gg.updateMasterGarduBa_(x.admin, { baId: x.baId })));
  assert.deepStrictEqual([m0.status, m0.diubah, m0.noGarduMaster], ['TIDAK_BERUBAH', [], 'TB0422']);
  x.sheets.g.db_Gardu.data[gIdx()][x.HG.indexOf('Merk')] = 'Salah';
  x.sheets.g.db_Gardu.data[gIdx()][x.HG.indexOf('Alamat')] = 'Lama';
  const m1 = JSON.parse(JSON.stringify(x.gg.updateMasterGarduBa_(x.admin, { baId: x.baId })));
  assert.strictEqual(m1.status, 'OK');
  assert.deepStrictEqual(m1.diubah.map((d) => [d.kolom, d.lama, d.baru]).sort(), [['Alamat', 'Lama', 'Jl. Raya Toboali – Desa Kampung Baru'], ['Merk', 'Salah', 'Trafindo']]);
  const g = x.objek(x.HG, x.sheets.g.db_Gardu.data[gIdx()]);
  assert.deepStrictEqual([g.Merk, g.ba_id_terakhir, g['Diubah Oleh']], ['Trafindo', x.baId, '16130.admin']);
  assert.ok(m1.masterTerakhir);
  assert.strictEqual(x.baris()['Diterapkan ke Master'], 'YA');
  // gardu sudah punya BA lebih baru = ditolak, tidak ada yang ditulis
  x.sheets.g.db_Gardu.data[gIdx()][x.HG.indexOf('ba_id_terakhir')] = U();
  x.sheets.g.db_Gardu.data[gIdx()][x.HG.indexOf('Tanggal BA Terakhir')] = '2999-01-01';
  x.sheets.g.db_Gardu.data[gIdx()][x.HG.indexOf('Merk')] = 'Baru';
  assert.strictEqual(kodeError(() => x.gg.updateMasterGarduBa_(x.admin, { baId: x.baId })), 'MASTER_LEBIH_BARU');
  assert.strictEqual(x.objek(x.HG, x.sheets.g.db_Gardu.data[gIdx()]).Merk, 'Baru');
  assert.ok(x.sheets.a.log_Audit.data.some((l) => l[4] === 'BA_GARDU_MASTER'));
  assert.strictEqual(kodeError(() => x.gg.kirimEamBaGardu_({ ...x.admin, role: 'PETUGAS' }, { baId: x.baId })), 'AKSES_DITOLAK');
});

// ---------- v0.79.0: kolom pengukuran db_Gardu + sinkron harian sheet lama ----------
/** Sheet tiruan dengan formula + sisip baris (Master_Gardu / DATA TRAFO lama). rumus: {'baris,kolom': 'R1C1'} (1-based). */
function sheetLamaPalsu(data, rumus = {}, id = 0) {
  const tulis = [];
  const geserRumus = (setelah) => {
    const baru = {};
    for (const [k, f] of Object.entries(rumus)) { const [r, c] = k.split(',').map(Number); baru[(r > setelah ? r + 1 : r) + ',' + c] = f; }
    for (const k of Object.keys(rumus)) delete rumus[k];
    Object.assign(rumus, baru);
  };
  const sh = {
    data, rumus, tulis,
    getSheetId: () => id,
    getLastRow: () => data.length,
    getLastColumn: () => Math.max(...data.map((r) => r.length)),
    insertRowsAfter: (r, n) => { for (let i = 0; i < n; i++) data.splice(r, 0, new Array(sh.getLastColumn()).fill('')); geserRumus(r); },
    getRange: (r, c, nr = 1, nc = 1) => {
      const sel = (f) => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => f(r + i, c + j)));
      return {
        getValues: () => sel((a, b) => (data[a - 1] || [])[b - 1] ?? ''),
        getDisplayValues: () => sel((a, b) => { const v = (data[a - 1] || [])[b - 1]; return v === null || v === undefined ? '' : String(v); }),
        getFormulas: () => sel((a, b) => (rumus[a + ',' + b] ? '=' + rumus[a + ',' + b] : '')),
        getFormulasR1C1: () => sel((a, b) => rumus[a + ',' + b] || ''),
        setFormulaR1C1: (f) => { rumus[r + ',' + c] = f; },
        setValues: (vals) => { tulis.push([r, c, vals.length, vals[0].length]); vals.forEach((b, i) => b.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = v; delete rumus[(r + i) + ',' + (c + j)]; })); },
      };
    },
  };
  return sh;
}

test('v0.80.0: ADMIN_rombakDbGardu: db_Gardu lama disusun ulang menurut nama kolom (10 kolom pengukuran di tengah), isi ikut kolomnya; kolom asing = batal', () => {
  const gg = buatKonteks({ ...PROPS, PBKDF2_ITERASI: '1000', GARDU_SHEET_ID: 'g' });
  const buat = sheetPalsu([]);
  const H = [...gg.DB_GARDU_HEADER_], baru10 = [...gg.YAN_NILAI_GARDU_.map((n) => n.kolom)];
  assert.strictEqual(H.indexOf('Beban R (A)'), H.indexOf('Waktu Beban') + 1, 'angka ukur di tengah, sesudah Waktu Beban');
  assert.strictEqual(H.indexOf('Arus Maks per Fasa (A)'), H.indexOf('Tegangan T-N (V)') + 1);
  assert.strictEqual(H.at(-1), 'diubah_oleh');
  // struktur v0.78 (54 kolom, Waktu Beban sesudah Persentase)
  const lama = H.filter((h) => !baru10.includes(h) && h !== 'Waktu Beban');
  lama.splice(lama.indexOf('Persentase Beban (%)') + 1, 0, 'Waktu Beban');
  const isi = (h) => (h === 'revision' ? 3 : 'v:' + h);
  const sheets = { m: {}, g: { db_Gardu: buat('db_Gardu', [[...lama], lama.map(isi), lama.map(isi)]) } };
  gg.SpreadsheetApp = { openById: (id) => ({ getSheetByName: (n) => sheets[id][n] }) };
  gg.pastikanPemilik_ = () => {};
  assert.strictEqual(kodeError(() => gg.cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu')), 'STRUKTUR_BERUBAH');
  const r = JSON.parse(JSON.stringify(gg.ADMIN_rombakDbGardu()));
  assert.deepStrictEqual([r.status, r.baris, r.tambah], ['OK', 2, baru10]);
  const d = sheets.g.db_Gardu.data;
  assert.deepStrictEqual(d[0], H);
  for (const h of lama) assert.strictEqual(d[1][H.indexOf(h)], isi(h), h);
  assert.deepStrictEqual(baru10.map((h) => d[2][H.indexOf(h)]), new Array(10).fill(''));
  assert.strictEqual(gg.cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu').rows.length, 2);
  assert.strictEqual(gg.ADMIN_rombakDbGardu().status, 'SUDAH');
  // kolom tidak dikenal = tidak ada yang ditulis
  sheets.g.db_Gardu = buat('db_Gardu', [[...lama, 'Kolom Asing'], [...lama.map(isi), 'x']]);
  const sebelum = JSON.stringify(sheets.g.db_Gardu.data);
  assert.strictEqual(gg.ADMIN_rombakDbGardu().status, 'BATAL');
  assert.strictEqual(JSON.stringify(sheets.g.db_Gardu.data), sebelum);
});

function siapkanSinkron() {
  const x = siapkanPdf();   // db_Gardu: TB0002 AKTIF, TB0010 BATAL, TB0422 (BA v2)
  const HG = x.HG, kol = (n) => HG.indexOf(n);
  const db = x.sheets.g.db_Gardu.data;
  const gRow = (no) => db.find((r) => r[kol('No Gardu')] === no);
  const tb2 = gRow('TB0002');
  Object.assign(tb2, { [kol('Alamat')]: 'Jl. DB Baru', [kol('Merk')]: 'Trafindo', [kol('Kapasitas (kVA)')]: 100, [kol('Lat')]: -3.1, [kol('Long')]: 106.4,
    [kol('Tanggal Ukur Terakhir')]: '2026-10-01', [kol('Waktu Beban')]: 'WBP', [kol('Arus Maks per Fasa (A)')]: 144.34, [kol('Pembebanan (kVA)')]: 60,
    [kol('Persentase Beban (%)')]: 60, [kol('Beban R (A)')]: 90, [kol('Beban S (A)')]: 80, [kol('Beban T (A)')]: 85, [kol('Beban N (A)')]: 5,
    [kol('Tegangan R-N (V)')]: 230, [kol('Tegangan S-N (V)')]: 231, [kol('Tegangan T-N (V)')]: 229, [kol('Tegangan R-S (V)')]: 400,
    [kol('Tegangan R-T (V)')]: 401, [kol('Tegangan S-T (V)')]: 399 });
  db.push(HG.map((h) => ({ No: 9, 'No Gardu': 'TB0500', Prefix: 'TB', 'Status Gardu': 'AKTIF', Alamat: 'Jl. Gardu Baru', Merk: 'Unindo', 'Kapasitas (kVA)': 50,
    gardu_id: U(), revision: 1 }[h] ?? '')));
  // Master_Gardu lama: 11 baris judul, data mulai baris 12, 156 kolom
  const L = 156, baris = (isi) => { const b = new Array(L).fill(''); for (const [c, v] of Object.entries(isi)) b[Number(c) - 1] = v; return b; };
  const judul = Array.from({ length: 11 }, (_, i) => baris(i === 9 ? { 3: 'GARDU', 4: 'ALAMAT' } : {}));
  const mg = sheetLamaPalsu([...judul,
    baris({ 3: 'TB' }),
    baris({ 2: 'TOBOALI', 3: 'TB0001', 4: 'Jl. Hanya Lama', 21: '01/08/2026' }),
    baris({ 2: 'TOBOALI', 3: 'TB0002', 4: 'Jl. Lama', 12: 'TRAFINDO', 13: '100', 21: '01/09/2026', 34: 10 }),
    baris({ 2: 'TOBOALI', 3: 'TB0422', 4: 'Jl. Raya Toboali – Desa Kampung Baru', 21: '05/10/2026', 63: 70, 64: 60, 65: 65, 66: 4, 60: 225, 61: 226, 62: 227, 57: 390, 58: 391, 59: 392 }),
    baris({ 3: 'PG' }),
    baris({ 2: 'TOBOALI', 3: 'PG0005', 4: 'Jl. Pangkal' }),
  ], { '14,155': 'R[0]C[-2]/R[0]C[-142]*100', '15,155': 'R[0]C[-2]/R[0]C[-142]*100' });
  const dt = sheetLamaPalsu([baris({}), baris({ 3: 'GARDU' }), baris({ 3: 'TB0002', 4: 'Jl. Lama' }), baris({ 3: 'TB0422', 4: 'x' })]);
  const file = { lama: { Master_Gardu: mg }, lama2: { Master_Gardu: mg }, dt: { '1. DATA TRAFO': dt } };
  const asli = x.gg.SpreadsheetApp.openById;
  x.gg.SpreadsheetApp = { openById: (id) => (file[id] ? { getSheetByName: (n) => file[id][n] || null, getSheets: () => Object.values(file[id]) } : asli(id)) };
  x.gg.pastikanPemilik_ = () => {};
  return { ...x, mg, dt, gRow, kol };
}

test('v0.79.0: sinkron sheet lama: identitas db -> Master_Gardu, pengukuran terbaru menang dua arah (WBP / LWBP), formula tidak ditimpa, gardu baru disisip per prefix, DATA TRAFO ikut', () => {
  const x = siapkanSinkron();
  // mati kalau target belum diisi; staging tidak boleh menulis file sumber produksi
  assert.deepStrictEqual([...x.gg.ADMIN_cekSinkronGarduLama().peringatan], ['SHEET_GARDU_ULP kosong: sinkron sheet lama mati']);
  x.props.setProperty('SHEET_GARDU_ULP', 'lama');
  assert.strictEqual(kodeError(() => x.gg.ADMIN_sinkronGarduLama()), 'SINKRON_DITOLAK');
  x.props.setProperty('SHEET_GARDU_ULP', 'lama2');
  x.props.setProperty('SHEET_GARDU_ES', 'dt');
  // pratinjau: tidak menulis apa pun
  const sebelum = JSON.stringify(x.mg.data);
  const p = JSON.parse(JSON.stringify(x.gg.ADMIN_cekSinkronGarduLama()));
  assert.strictEqual(JSON.stringify(x.mg.data), sebelum);
  assert.deepStrictEqual([p.master.identitas, p.master.ukurKeLama, p.master.ukurKeDb, p.master.baru, p.master.hanyaDiLama], [2, 1, 1, 1, 2]);
  // tulis
  const h = JSON.parse(JSON.stringify(x.gg.ADMIN_sinkronGarduLama()));
  const cari = (no) => x.mg.data.findIndex((r) => r[2] === no);
  const tb2 = x.mg.data[cari('TB0002')];
  assert.deepStrictEqual([tb2[3], tb2[11], tb2[8], tb2[9]], ['Jl. DB Baru', 'TRAFINDO', -3.1, 106.4], 'identitas ikut db (huruf besar beda = sama)');
  assert.ok(Object.prototype.toString.call(tb2[20]) === '[object Date]' && tb2[20].getDate() === 1 && tb2[20].getMonth() === 9, 'U = tanggal ukur db');
  assert.deepStrictEqual([tb2[27], tb2[28], tb2[29], tb2[30], tb2[33], tb2[34], tb2[35], tb2[36]], [400, 399, 401, 230, 90, 80, 85, 5], 'grup WBP');
  assert.deepStrictEqual([tb2[56], tb2[62]], ['', ''], 'LWBP tidak disentuh');
  assert.deepStrictEqual([tb2[110], tb2[152]], [144.34, 60]);
  assert.strictEqual(x.mg.rumus[(cari('TB0002') + 1) + ',155'], 'R[0]C[-2]/R[0]C[-142]*100', 'sel formula EY tidak ditimpa');
  // sheet lama lebih baru (TB0422, LWBP) -> db_Gardu dihitung ulang
  const g = x.objek(x.HG, x.gRow('TB0422'));
  assert.deepStrictEqual([g['Tanggal Ukur Terakhir'], g['Kode Ukur Terakhir'], g['Waktu Beban'], g['Beban R (A)'], g['Tegangan R-N (V)'], g['Tegangan R-S (V)'], g['Diubah Oleh']],
    ['2026-10-05', 'SHEET LAMA', 'LWBP', 70, 225, 390, 'sinkron-gardu']);
  assert.strictEqual(g['Pembebanan (kVA)'], Math.round((70 * 225 + 60 * 226 + 65 * 227) / 1000 * 100) / 100);
  assert.strictEqual(h.db.diubah, 1);
  // gardu baru: di bawah TB terakhir (TB0422), sebelum pemisah PG, formula baris acuan disalin
  const iBaru = cari('TB0500');
  assert.strictEqual(iBaru, cari('TB0422') + 1);
  assert.deepStrictEqual([x.mg.data[iBaru][1], x.mg.data[iBaru][3], x.mg.data[iBaru][11], x.mg.data[iBaru + 1][2]], ['TOBOALI', 'Jl. Gardu Baru', 'Unindo', 'PG']);
  assert.strictEqual(x.mg.rumus[(iBaru + 1) + ',155'], 'R[0]C[-2]/R[0]C[-142]*100');
  assert.strictEqual(x.mg.data[cari('TB0001')][3], 'Jl. Hanya Lama', 'gardu hanya di sheet lama tidak diubah');
  assert.ok(!x.mg.data.some((r) => r[2] === 'TB0010'), 'gardu BATAL tidak disisip');
  // DATA TRAFO: identitas + gardu baru, tanpa pengukuran
  const t = h.target.find((r) => r.sheet === '1. DATA TRAFO');
  assert.deepStrictEqual([t.identitas, t.baru], [2, 1]);
  assert.strictEqual(x.dt.data.find((r) => r[2] === 'TB0002')[3], 'Jl. DB Baru');
  assert.strictEqual(x.dt.data.at(-1)[2], 'TB0500');
  assert.strictEqual(h.target.find((r) => r.sheet === 'INPUT TBL').lewat, 'SHEET_GARDU_UP3 kosong');
  assert.ok(x.sheets.a.log_Audit.data.some((l) => l[4] === 'SINKRON_GARDU_LAMA'));
  // jalan kedua: sudah sama = tidak ada yang ditulis
  const tulisAwal = x.mg.tulis.length;
  const h2 = x.gg.ADMIN_sinkronGarduLama();
  assert.deepStrictEqual([h2.master.identitas, h2.master.ukurKeLama, h2.master.ukurKeDb, h2.master.baru], [0, 0, 0, 0]);
  assert.strictEqual(x.mg.tulis.length, tulisAwal);
});

test('v0.79.0: pemicu sinkron gardu 05:00 WIB (diganti, bukan ditambah) + berhenti', () => {
  const x = siapkanSinkron();
  const pemicu = [];
  const b = { timeBased: () => b, everyDays: (n) => { b.hari = n; return b; }, atHour: (j) => { b.jam = j; return b; }, nearMinute: (m) => { b.menit = m; return b; },
    inTimezone: (z) => { b.zona = z; return b; }, create: () => { pemicu.push({ fn: b.fn, jam: b.jam, menit: b.menit, zona: b.zona, getHandlerFunction: () => b.fn }); } };
  x.gg.ScriptApp = { newTrigger: (fn) => { b.fn = fn; return b; }, getProjectTriggers: () => pemicu.slice(), deleteTrigger: (t) => pemicu.splice(pemicu.indexOf(t), 1) };
  x.gg.ADMIN_pasangPemicuSinkronGardu();
  x.gg.ADMIN_pasangPemicuSinkronGardu();
  assert.deepStrictEqual(pemicu.map((p) => [p.fn, p.jam, p.menit, p.zona]), [['ADMIN_sinkronGarduLama', 5, 0, 'Asia/Jakarta']]);
  x.gg.ADMIN_berhentiPemicuSinkronGardu();
  assert.strictEqual(pemicu.length, 0);
});

// ---------- v0.81.0: notifikasi update versi ----------
test('v0.81.0: ping membawa info versi (server, minimum, link, catatan), semua jawaban membawa versi server; properti tidak valid diabaikan', () => {
  const gv = buatKonteks(PROPS);
  const props = gv.PropertiesService.getScriptProperties();
  const v0 = JSON.parse(JSON.stringify(gv.proses_({ action: 'ping' }, 'MOBILE')));
  assert.deepStrictEqual([v0.ok, v0.versi, v0.data.versi], [true, gv.VERSI_BACKEND_, { server: gv.VERSI_BACKEND_, minimum: gv.VERSI_BACKEND_, linkUnduh: '', catatan: '' }]);
  props.setProperty('VERSI_APP_MINIMUM', '0.75.0');
  props.setProperty('LINK_UPDATE_APP', 'https://drive.google.com/drive/folders/abc');
  props.setProperty('CATATAN_UPDATE_APP', 'Notifikasi update\nversi');
  const v1 = gv.infoVersi_();
  assert.deepStrictEqual([v1.minimum, v1.linkUnduh, v1.catatan], ['0.75.0', 'https://drive.google.com/drive/folders/abc', 'Notifikasi update versi']);
  props.setProperty('VERSI_APP_MINIMUM', '9.0.0');
  props.setProperty('LINK_UPDATE_APP', 'http://bukan-https.example');
  assert.deepStrictEqual([gv.infoVersi_().minimum, gv.infoVersi_().linkUnduh], [gv.VERSI_BACKEND_, ''], 'minimum > server dipotong, link non-https dibuang');
  props.setProperty('VERSI_APP_MINIMUM', 'satu');
  assert.strictEqual(gv.infoVersi_().minimum, gv.VERSI_BACKEND_);
  assert.deepStrictEqual(['0.80.0', '0.81.0', '0.81.1', '1.0.0', '0.100.0', 'x'].map((v) => gv.bandingVersi_(v, '0.81.0')), [-1, 0, 1, 1, 1, null]);
});

test('v0.81.1: WAJIB_VERSI_APP = YA: HP di bawah minimum / app lama tanpa versiApp ditolak UPDATE_APLIKASI_DULU (termasuk login), ping + web tetap jalan', () => {
  const gv = buatKonteks(PROPS);
  const props = gv.PropertiesService.getScriptProperties();
  const k = (req, pf = 'MOBILE') => { try { gv.proses_(req, pf); return 'OK'; } catch (e) { return e.kode; } };
  assert.notStrictEqual(k({ action: 'login', data: {} }), 'UPDATE_APLIKASI_DULU', 'mati = tidak dicek');
  props.setProperty('WAJIB_VERSI_APP', 'YA');
  assert.strictEqual(k({ action: 'login', data: {} }), 'UPDATE_APLIKASI_DULU', 'app lama (v0.50.0) tidak mengirim versiApp');
  assert.strictEqual(k({ action: 'cekSesi', token: 'x', versiApp: '0.80.0' }), 'UPDATE_APLIKASI_DULU');
  assert.notStrictEqual(k({ action: 'login', data: {}, versiApp: gv.VERSI_BACKEND_ }), 'UPDATE_APLIKASI_DULU');
  assert.strictEqual(k({ action: 'ping' }), 'OK', 'ping tetap (HP lama / baru bisa cek versi)');
  assert.notStrictEqual(k({ action: 'cekSesi', token: 'x' }, 'WEB'), 'UPDATE_APLIKASI_DULU', 'web tidak terpengaruh');
  props.setProperty('VERSI_APP_MINIMUM', '0.80.0');
  assert.notStrictEqual(k({ action: 'login', data: {}, versiApp: '0.80.0' }), 'UPDATE_APLIKASI_DULU');
});

// ---------- v0.76.1: audit guard menyeluruh ----------
test('v0.76.1: audit guard: semua endpoint bersesi punya rem per menit, peran dicek sebelum isi data, endpoint publik tanpa batas hanya ping', () => {
  const ep = g.endpoints_();
  const tanpaRem = Object.keys(ep).filter((k) => !ep[k].publik && !(ep[k].batasMenit > 0));
  assert.deepStrictEqual(tanpaRem, [], 'endpoint bersesi tanpa batasMenit');
  for (const k of Object.keys(ep).filter((k) => !ep[k].publik)) assert.ok(ep[k].batasMenit <= 80, k + ' rem terlalu longgar');
  // peran / pemilik dicek PALING AWAL (baris pertama badan fungsi), sebelum validasi_ membaca isi data
  const awal = {
    getKodeRow: 'wajibPetugasRow_(sesi)', syncRow: 'wajibPetugasRow_(sesi)', uploadFotoRow: 'wajibPetugasRow_(sesi)',
    getFotoRow: 'timLaporan_(sesi, null)', getLaporanRow: 'timLaporan_(sesi, null)', getArsipRow: 'timLaporan_(sesi, null)',
    getArsipHariRow: 'timLaporan_(sesi, null)', getFotoArsipRow: 'timLaporan_(sesi, null)',
    getLaporanUp3: 'peranLaporanUp3_(sesi, false)', getLaporanUiw: 'peranLaporanUp3_(sesi, false)',
    simpanLaporanUp3: 'peranLaporanUp3_(sesi, true)', simpanLaporanUiw: 'peranLaporanUp3_(sesi, true)',
    getPetugasYandal: 'peranPetugasYandal_(sesi, false)', simpanPetugasYandal: 'peranPetugasYandal_(sesi, true)',
    getLaporanTimYandal: 'wajibAdminLaporanYandal_(sesi)',
    gantiPassword: 'if (petugasYandal_(sesi))', daftarNotif: "if (platform !== 'MOBILE')", getPemakaian: "if (!sesi || (sesi.role !== 'ADMIN'", getArsipYandal: 'if (!petugasYandal_(sesi)', getRankYandal: 'if (!sesi || (sesi.role',
  };
  for (const k of Object.keys(ep)) {
    const nama = ep[k].fn.name;
    if (/Yandal_$/.test(nama) && /^(simpan|upload)/.test(nama)) awal[k] = awal[k] || 'wajibPetugasYandalHp_(sesi, platform)';
    if (/BaGardu_$|GarduBa_$|NomorGardu|OwnerIdGardu/.test(nama)) awal[k] = 'wajibAdminBa_(sesi)';
    if (/Hartek/.test(nama)) awal[k] = 'wajibPetugasHartek_(sesi)';   // v0.87.0
    if (/InsJar/.test(nama)) awal[k] = 'wajibPetugasInsJar_(sesi)';   // v1.0.0
    if (/InsDu/.test(nama)) awal[k] = 'wajibPetugasInsDu_(sesi)';   // v1.0.8
    if (['getWoAdmin_', 'getFotoWoAdmin_', 'teruskanWo_', 'tarikWo_', 'getWoGanda_', 'getFotoWoGanda_', 'putuskanWoGanda_', 'getWoPindah_', 'getFotoWoPindah_', 'pindahWo_'].includes(nama)) awal[k] = 'wajibAdminWo_(sesi)';   // v1.0.10, v1.0.15 foto, v1.0.16 ganda
    else if (/(Wo|WoTim)_$/.test(nama)) awal[k] = 'wajibPetugasWo_(sesi, platform)';
    if (/TemuanInspeksi/.test(nama)) awal[k] = 'wajibAdminTemuan_(sesi)';   // v1.0.0
    if (/JadwalPadam/.test(nama)) awal[k] = 'wajibAdminJadwalPadam_(sesi)';   // v1.0.17
    if (nama === 'getKalenderTim_') awal[k] = 'wajibSesiKalender_(sesi)';   // v1.0.17, v1.0.18 semua akun
    if (['getNotifikasi_', 'tandaiNotifikasi_'].includes(nama)) awal[k] = 'wajibSesiLonceng_(sesi)';   // v1.0.19
    if (nama === 'getUpdateApp_') awal[k] = 'wajibSesiUpdate_(sesi)';   // v1.0.19
    if (nama === 'getRiwayatGardu_') awal[k] = 'wajibAdminRiwayatGardu_(sesi)';   // v1.0.17
    if (['getApprovalP0', 'getFotoApprovalP0', 'simpanApprovalP0', 'ubahJenisP0', 'simpanAturanYandal'].includes(k)) awal[k] = 'wajibAdminP0_(sesi)';
  }
  const bebasAwal = ['ping', 'login', 'mulaiShiftYandal', 'cekSesi', 'logout', 'getMaster'];   // publik / milik sesi sendiri (modul dicek per modul)
  for (const k of Object.keys(ep)) {
    if (bebasAwal.includes(k)) continue;
    assert.ok(awal[k], 'endpoint belum masuk audit peran-paling-awal: ' + k);
    const badan = ep[k].fn.toString().split('{').slice(1).join('{').trim();
    assert.ok(badan.startsWith(awal[k]), k + ' wajib diawali ' + awal[k]);
  }
  // getMaster: modul opsional berisi data terbatas dicek per modul
  const op = g.MODUL_MASTER_OPSIONAL_;
  assert.match(op.gardu.toString(), /petugasYandal_\(sesi\)[\s\S]*wajibAksesSalahSatu_/);
  assert.match(op.pejabatBa.toString(), /wajibAksesSalahSatu_\(sesi, \[MENU_GARDU_\.ba\]\)/);
  assert.match(g.isiAturanYandal_.toString(), /petugasYandal_\(sesi\)[\s\S]*AKSES_DITOLAK/);
  assert.match(g.MODUL_MASTER_.pengguna.toString(), /sesi\.role === 'ADMIN' \|\| sesi\.role === 'SUPER'/);
});

// ---------- v0.82.0 migrasi Yandal P0 v1 -> v2 (file gabungan) ----------
function siapkanMigP0() {
  const x = siapkanUkurGardu();
  const gm = x.g, props = gm.PropertiesService.getScriptProperties();
  gm.pastikanPemilik_ = () => {};
  gm.ScriptApp = { getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => {} }) }) }) };
  props.setProperty('MIGP0_SUMBER_ID', 'src');
  props.setProperty('MIGP0_DARI', '2026-01-01');
  props.setProperty('MIGP0_FOTO_AKAR_ID', 'akarLama');
  const buat = sheetPalsu(x.log);
  const W = { shift: 12, p0: 50, switching: 50, gardu: 24 };
  const kosong = (n) => Array.from({ length: n }, () => '');
  const judul = (n, isi) => { const b = kosong(n).map((_, i) => 'Kolom ' + i); Object.keys(isi).forEach((k) => { b[k] = isi[k]; }); return b; };
  const baris = (n, isi) => { const b = kosong(n); Object.keys(isi).forEach((k) => { b[k] = isi[k]; }); return b; };
  const t = (tgl, jam) => new Date(tgl + 'T' + jam + '+07:00');
  // ---- foto lama di Drive ----
  const lama = x.dr.DriveApp.getFolderById('lama');
  const isiFoto = {};
  const fileLama = (folder, nama, idPanjang) => {
    const buf = Buffer.from('jpeg-lama-' + nama);
    const f = folder.createFile({ bytes: Array.from(buf), mime: 'image/jpeg', nama });
    f.makeCopy = (nm, tujuan) => tujuan.createFile({ bytes: Array.from(buf), mime: 'image/jpeg', nama: nm });
    isiFoto[nama] = buf;
    if (idPanjang) x.dr.semuaFile[idPanjang] = f;
    return f;
  };
  const ID = { s1: 'SRCSEBELUM1aaaaaaaaaaaaaaaaaa', z1: 'SRCSESUDAH1aaaaaaaaaaaaaaaaaa', z2: 'SRCSESUDAH2aaaaaaaaaaaaaaaaaa',
    z4: 'SRCSESUDAH4aaaaaaaaaaaaaaaaaa', z5: 'SRCSESUDAH5aaaaaaaaaaaaaaaaaa', z7: 'SRCSESUDAH7aaaaaaaaaaaaaaaaaa', arus: 'SRCARUSaaaaaaaaaaaaaaaaaaaaaa' };
  Object.keys(ID).forEach((k) => fileLama(lama, k + '.jpg', ID[k]));
  const getFolder = x.dr.DriveApp.getFolderById;
  x.dr.DriveApp.getFolderById = (id) => Object.assign(getFolder(id), { getName: () => (id === 'akarLama' ? 'AppSheet SiSi' : id) });
  const akar = x.dr.DriveApp.getFolderById('akarLama');
  const fp = akar.createFolder('Yandal P0').createFolder('P1');
  fileLama(fp, 'P1.Foto Pekerjaan.jpg');
  const link = (id) => 'https://drive.usercontent.google.com/download?id=' + id + '&export=download';
  const appsheet = (path) => 'https://www.appsheet.com/image/getimageurl?appName=SiSi&tableName=P0&fileName=' + encodeURIComponent(path);
  // ---- sumber gabungan ----
  const H1 = 'Y13-16130260815001', S1 = H1 + '-SHF1.001', H2 = 'Y14-16130260815003', S2 = H2 + '-SHF3.001';
  const S3 = 'Y13-16130260816001-SHF2.001', S9 = 'Y13-16130251231001-SHF1.001';
  const sh = (kh, ks, tgl, tim, shift, petugas) => baris(W.shift, { 0: 1, 1: kh, 2: ks, 4: new Date(tgl + 'T00:00:00+07:00'), 5: 'Toboali', 6: tim, 7: shift, 8: petugas, 10: 'admin v1', 11: t(tgl, '08:01:00') });
  const p0 = (ks, kode, tgl, isi) => baris(W.p0, { 1: ks.split('-SHF')[0], 2: ks, 3: kode, 4: 'Toboali', 6: new Date(tgl + 'T00:00:00+07:00'), ...isi });
  const kp = (n, ks = S1) => ks + '-P0.00' + n;
  const src = {
    db_Yandal_Shift: buat('db_Yandal_Shift', [judul(W.shift, { 1: 'Kode Header', 2: 'Kode Pekerjaan Shift', 4: 'Tanggal', 6: 'Tim', 8: 'Petugas' }),
      sh(H1, S1, '2026-08-15', 'YANDAL 13', '1', 'Andi, Budi'),
      sh(H2, S2, '2026-08-15', 'Yandal 14', 'Shift 3', 'Candra / Dedy'),
      sh('Y13-16130251231001', S9, '2025-12-31', 'YANDAL 13', '1', 'Andi'),
      baris(W.shift, { 0: 9 })]),
    db_Yandal_P0: buat('db_Yandal_P0', [judul(W.p0, { 3: 'Kode Pekerjaan P0', 6: 'Tanggal', 7: 'Nama Pekerjaan', 21: 'Petugas', 41: 'Status Approval', 42: 'Alasan Rejected', 45: 'Point' }),
      p0(S1, kp(1), '2026-08-15', { 3: kp(1), 7: 'Ganti FCO' }),   // salinan ARSIP tidak lengkap (kode ganda)
      p0(S1, kp(1), '2026-08-15', { 7: 'Ganti FCO', 9: 'Tanjung Labu', 10: 'FCO Jar Tj. Sangkar', 11: 'Tj. Sangkar', 13: -3.0, 14: 106.5, 16: -3.001, 17: 106.5,
        21: 'Andi, Budi', 22: t('2026-08-15', '09:00:00'), 26: link(ID.s1), 27: t('2026-08-15', '09:10:00'),
        30: appsheet('AppSheet SiSi/Yandal P0/P1/P1.Foto Pekerjaan.jpg'), 32: t('2026-08-15', '09:40:00'), 36: link(ID.z1),
        38: 'YANDAL 13', 39: t('2026-08-15', '09:41:00'), 41: 'Approved', 43: 'Admin v1', 44: t('2026-08-15', '12:00:00'), 45: 8 }),
      p0(S1, kp(2), '2026-08-15', { 7: 'Pengecekan Switching', 9: 'Tanjung Labu', 10: 'LBS Tj. Labu A - LBS Tj. Labu B', 13: -3.01, 14: 106.51,
        22: t('2026-08-15', '10:00:00'), 32: t('2026-08-15', '10:30:00'), 36: link(ID.z2), 39: t('2026-08-15', '10:31:00') }),
      p0(S1, kp(3), '2026-08-15', { 7: 'Lainnya', 8: 'Bantu warga', 22: t('2026-08-15', '10:40:00'), 39: t('2026-08-15', '10:41:00') }),
      p0(S1, kp(4), '2026-08-15', { 7: 'Lain - Lain', 8: 'Perbaiki papan', 22: t('2026-08-15', '11:00:00'), 32: t('2026-08-15', '11:20:00'), 36: link(ID.z4),
        41: 'Approved', 45: 10 }),
      p0(S3, kp(1, S3), '2026-08-16', { 7: 'Pengecekan Gardu', 9: 'Tanjung Labu', 20: 'YANDAL 13', 21: 'Andi', 22: t('2026-08-16', '17:00:00'),
        32: t('2026-08-16', '17:30:00'), 36: link(ID.z5), 41: 'Approved', 45: 6 }),
      p0(S2, kp(1, S2), '2026-08-15', { 7: 'Ganti FCO', 22: t('2026-08-16', '01:00:00') }),
      p0(S1, kp(7), '2026-08-15', { 7: 'Ganti Fco Tm', 22: t('2026-08-15', '13:00:00'), 32: t('2026-08-15', '13:30:00'), 36: link(ID.z7),
        41: 'Rejected', 42: 'Foto buram' }),
      p0(S9, kp(1, S9), '2025-12-31', { 7: 'Ganti FCO' })]),
    db_Yandal_Pengecekan_Switching: buat('db_Yandal_Pengecekan_Switching', [judul(W.switching, { 3: 'Kode Pekerjaan P0', 4: 'Kode Switching', 20: 'Arus R' }),
      baris(W.switching, { 3: kp(2), 4: kp(2) + '-SWC.001', 10: 'Tanjung Labu', 11: 'LBS Tj. Labu A', 12: '10:10', 14: -3.0101, 15: 106.5101,
        16: 'Nyala', 17: 'Padam', 18: 'ON', 19: 'off', 20: '12,5', 21: 13, 22: 14, 26: link(ID.arus), 47: 'YANDAL 13', 48: t('2026-08-15', '10:12:00') }),
      baris(W.switching, { 3: 'Y13-X-P0.009', 4: 'Y13-X-P0.009-SWC.001' })]),
    'Pengukuran Gardu Toboali': buat('Pengukuran Gardu Toboali', [judul(W.gardu, { 3: 'Kode Pekerjaan P0', 4: 'Kode Pengukuran Gardu', 10: 'No Gardu', 13: 'Beban R' }),
      baris(W.gardu, { 3: kp(1, S3), 4: kp(1, S3) + '-GRD.001', 8: 'Tanjung Labu', 10: 'TB 101', 12: '17:10', 13: 80, 14: 60, 15: 70, 16: 12,
        17: 395, 18: 398, 19: 396, 20: 228, 21: 230, 22: 229, 23: 'Andi' })]),
  };
  x.sheets.src = src;
  const lengkapi = (nama, s) => { if (!s) return s; s.getName = () => nama; s.clearContents = () => { s.data.splice(0, s.data.length, []); }; return s; };
  Object.keys(gm.BUKA_SS_).forEach((k) => delete gm.BUKA_SS_[k]);
  gm.SpreadsheetApp = { openById: (id) => ({
    getName: () => 'File ' + id,
    getSheetByName: (n) => lengkapi(n, x.sheets[id][n]),
    getSheets: () => Object.keys(x.sheets[id]).map((n) => lengkapi(n, x.sheets[id][n])),
    insertSheet: (n) => { x.sheets[id][n] = buat(n, [[]]); return lengkapi(n, x.sheets[id][n]); } }) };
  const alias = (...rows) => { x.sheets.y.migp0_Alias = buat('migp0_Alias', [['jenis', 'penyulang', 'nilai_lama', 'nilai_master'], ...rows]); };
  const isi = (nama) => { const d = x.sheets.y[nama].data; return d.slice(1).filter((b) => b.some((v) => v !== '' && v !== undefined)).map((b) => Object.fromEntries(d[0].map((h, i) => [h, b[i]]))); };
  const analisis = () => { const s = gm.siapkanMigrasiP0_(); return JSON.parse(JSON.stringify(gm.analisisMigrasiP0_(s.S, s.M, s.opsi))); };
  return { ...x, props, src, alias, isi, analisis, isiFoto, ID, S1, S2, S3, kp };
}

test('v0.82.0 migrasi P0: dry-run membaca file gabungan per posisi kolom v1, karantina + alias, induk dibuat, kode ganda, periode', () => {
  const x = siapkanMigP0();
  const r = x.analisis();
  assert.deepStrictEqual(r.judulSalah, []);
  const k = (status) => r.catatan.filter((c) => c.status === status).map((c) => c.jenis + ' ' + c.kode + ' ' + c.alasan.split(' (')[0]).sort();
  assert.deepStrictEqual(k('KARANTINA'), [
    'p0 ' + x.kp(1, x.S2) + ' INDUK_TIDAK_LOLOS', 'p0 ' + x.kp(7) + ' PEKERJAAN_TIDAK_DIKENAL',
    'shift ' + x.S2 + ' PETUGAS_TIDAK_DIKENAL', 'switching Y13-X-P0.009-SWC.001 INDUK_TIDAK_ADA'].sort());
  assert.ok(r.catatan.some((c) => c.alasan.startsWith('PETUGAS_TIDAK_DIKENAL (Dedy)') && c.saran === 'Dedy -> Dedi'), 'saran nama terdekat');
  assert.ok(r.catatan.some((c) => c.kode === x.kp(7) && c.saran === 'Ganti FCO'));
  assert.ok(r.catatan.some((c) => c.status === 'INDUK_DIBUAT' && c.kode === x.S3));
  assert.ok(r.catatan.some((c) => c.status === 'PERINGATAN' && c.kode === x.kp(1) && /^KODE_GANDA \(2 baris: 2, 3, dipakai baris 3\)/.test(c.alasan)));
  assert.ok(r.catatan.some((c) => c.status === 'INFO' && c.kode === x.kp(1, x.S3) && /POINT_BEDA \(v1 6, rumus v2 5/.test(c.alasan)));
  assert.deepStrictEqual([r.hitung.shift.dilewati, r.hitung.p0.dilewati, r.hitung.shift.indukDibuat, r.hitung.p0.ganda], [1, 1, 1, 1]);
  assert.strictEqual(r.rencana.p0.length, 5, 'P0 lolos: 1, 2, 3, 4 shift 1 + gardu shift induk dibuat');
  // alias membereskan petugas + pekerjaan, sisa 1 karantina (switching tanpa induk)
  x.alias(['PETUGAS', '', 'Dedy', 'Dedi'], ['PEKERJAAN', '', 'Ganti Fco Tm', 'Ganti FCO']);
  const r2 = x.analisis();
  assert.deepStrictEqual(r2.catatan.filter((c) => c.status === 'KARANTINA').map((c) => c.kode), ['Y13-X-P0.009-SWC.001']);
  assert.deepStrictEqual([r2.rencana.shift.length, r2.rencana.p0.length, r2.rencana.switching.length, r2.rencana.gardu.length], [3, 7, 1, 1]);
  // laporan dry-run
  x.g.ADMIN_migrasiP0Cek();
  assert.ok(x.sheets.y.migp0_Cek.data.length > 3);
  assert.deepStrictEqual(x.sheets.y.migp0_Cek.data[0], [...x.g.MIGP0_CEK_KOLOM_]);
  const ring = x.isi('migp0_Ringkas').find((b) => b.bulan === '2026-08' && b.tim === 'YANDAL 13');
  assert.deepStrictEqual([ring.shift, ring.p0, ring.approved, ring.rejected, ring.rejected_sistem, ring.menunggu, ring.point_v1, ring.switching, ring.gardu],
    [2, 6, 3, 2, 1, 1, 24, 1, 1]);
  assert.strictEqual(x.sheets.y.yan_P0.data.length, 1, 'dry-run tidak menulis yan_*');
  // kolom bergeser = judul salah
  x.src.db_Yandal_P0.data[0][42] = 'Approved By';
  assert.ok(x.analisis().judulSalah.some((s) => /db_Yandal_P0 AQ "Approved By"/.test(s)));
});

test('v0.82.0 migrasi P0: tahap A tulis yan_* (status, point, bobot Lain - Lain, rekap shift, switching, gardu), ulang aman, v2 asli utuh, rollback', () => {
  const x = siapkanMigP0();
  const shiftV2 = JSON.stringify(x.sheets.y.yan_Shift.data[1]);
  assert.strictEqual(kodeError(() => x.g.ADMIN_migrasiP0Jalan()), 'MIG_MASIH_KARANTINA');
  x.alias(['PETUGAS', '', 'Dedy', 'Dedi'], ['PEKERJAAN', '', 'Ganti Fco Tm', 'Ganti FCO']);
  assert.strictEqual(kodeError(() => x.g.ADMIN_migrasiP0Jalan()), 'MIG_MASIH_KARANTINA', 'switching tanpa induk masih karantina');
  x.props.setProperty('MIGP0_IZINKAN_KARANTINA', 'TRUE');
  x.g.ADMIN_migrasiP0Jalan();
  assert.strictEqual(JSON.stringify(x.sheets.y.yan_Shift.data[1]), shiftV2, 'shift app v2 tidak disentuh');
  const shift = x.isi('yan_Shift').filter((b) => b.dibuat_oleh === 'MIGRASI');
  const p0 = x.isi('yan_P0'), cari = (kode) => p0.find((b) => b['Kode P0'] === kode);
  assert.strictEqual(shift.length, 3);
  const s1 = shift.find((b) => b['Kode Shift'] === x.S1);
  assert.deepStrictEqual([s1.Tim, s1.Shift, s1.Tanggal, s1['Petugas 1'], s1['Petugas 2'], s1.petugas_id_1, s1.petugas_id_2, s1['Jam Kerja'], s1['Mulai Shift']],
    ['YANDAL 13', 1, '2026-08-15', 'Andi', 'Budi', x.p.a, x.p.b, '08:00 - 16:00', '2026-08-15 08:00']);
  assert.deepStrictEqual([s1['Jumlah P0'], s1['P0 Proses'], s1['P0 Selesai'], s1['P0 Approved'], s1['P0 Rejected'], s1['P0 Menunggu Verifikasi'], s1['Total Point']],
    [5, 1, 4, 2, 2, 1, 18]);
  assert.ok(s1['Rekap Final'], 'rekap final langsung');
  const s2 = shift.find((b) => b['Kode Shift'] === x.S2);
  assert.deepStrictEqual([s2.Shift, s2.Tim, s2.petugas_id_1, s2.petugas_id_2], [3, 'YANDAL 14', x.p.c, x.p.d]);
  assert.strictEqual(shift.find((b) => b['Kode Shift'] === x.S3)['Petugas 1'], 'Andi', 'induk dibuat dari P0');
  const a = cari(x.kp(1));
  assert.deepStrictEqual([a['Status P0'], a['Status Approval'], a.Point, a['Durasi (menit)'], a['Skor Durasi'], a.Bobot, a.Pengali, a.Section, a.section_id, a.jenis_id],
    ['SELESAI', 'Approved', 8, 40, 2, 3, 2, 'FCO Jar Tj. Sangkar', x.sek.a, x.j.fco]);
  assert.deepStrictEqual([a['Waktu Dibuat'], a['Waktu Sesudah'], a.Koordinat, a['Jarak Closing P0 (m)'], a['Jarak Antar P0 (m)'], a.revision],
    ['2026-08-15 09:00:00', '2026-08-15 09:40:00', '-3.000000,106.500000', 111, 0, 1]);
  assert.strictEqual(JSON.parse(a.foto_meta).SESUDAH.waktu, '2026-08-15T02:40:00.000Z');
  assert.deepStrictEqual([cari(x.kp(2))['Status Approval'], cari(x.kp(2)).Point], ['Menunggu', '']);
  const lain = cari(x.kp(3));
  assert.deepStrictEqual([lain['Nama Pekerjaan'], lain['Pekerjaan Lainnya'], lain['Status P0'], lain['Status Approval'], lain['Alasan Rejected'], lain['Approved Oleh'], lain.Point],
    ['Lain - Lain', 'Bantu warga', 'PROSES', 'Rejected', 'P0 Tidak Selesai', 'SISTEM', 0]);
  assert.deepStrictEqual([cari(x.kp(4)).Bobot, cari(x.kp(4)).Point], [4.5, 10], 'bobot isian admin v1 dihitung balik dari point');
  assert.deepStrictEqual([cari(x.kp(7))['Status Approval'], cari(x.kp(7))['Alasan Rejected'], cari(x.kp(7)).Point], ['Rejected', 'Foto buram', 0]);
  assert.ok(!cari(x.kp(1, 'Y13-16130251231001-SHF1.001')), 'di luar periode tidak ditulis');
  const sw = x.isi('yan_Switching')[0];
  assert.deepStrictEqual([sw['Kode Switching'], sw['Nama Switching'], sw.Section, sw['Jam Pengecekan'], sw['Indikator Remote'], sw['Indikator Local'],
    sw['Indikator Protection'], sw['Indikator Reclose'], sw['Arus R (A)'], sw.p0_id, sw.section_id],
    [x.kp(2) + '-SWC.001', 'LBS Tj. Labu A', 'LBS Tj. Labu A - LBS Tj. Labu B', '2026-08-15 10:10:00', 'Nyala', 'Padam', 'Nyala', 'Padam', 12.5, cari(x.kp(2)).p0_id, x.sek.lbs]);
  const gr = x.isi('yan_Gardu')[0];
  assert.deepStrictEqual([gr['No Gardu'], gr.gardu_id, gr['Kapasitas (kVA)'], gr['Jam Ukur'], gr['Waktu Beban'], gr['Pembebanan (kVA)'], gr['Persentase Beban (%)'],
    gr['Kategori Beban'], gr['Diterapkan ke Master'], gr['Beban R (A)']], ['TB0101', x.gid.a, 100, '2026-08-16 17:10:00', 'WBP', 48.07, 48.07, 'Underload', 'TIDAK', 80]);
  const antre = x.isi('migp0_Foto');
  assert.deepStrictEqual(antre.map((q) => q.kode + ' ' + q.slot).sort(), [x.kp(1) + ' SEBELUM', x.kp(1) + ' PEKERJAAN', x.kp(1) + ' SESUDAH',
    x.kp(2) + ' SESUDAH', x.kp(4) + ' SESUDAH', x.kp(1, x.S3) + ' SESUDAH', x.kp(7) + ' SESUDAH', x.kp(2) + '-SWC.001 ARUS'].sort());
  assert.strictEqual(antre.find((q) => q.slot === 'PEKERJAAN').sumber_path, 'AppSheet SiSi/Yandal P0/P1/P1.Foto Pekerjaan.jpg');
  assert.strictEqual(antre.find((q) => q.kode === x.kp(1) && q.slot === 'SESUDAH').sumber_drive_id, x.ID.z1);
  assert.ok(x.isi('migp0_Peta').length >= 12);
  // ulang = tidak dobel
  const n = [x.sheets.y.yan_P0.data.length, x.sheets.y.migp0_Foto.data.length];
  x.g.ADMIN_migrasiP0Jalan();
  assert.deepStrictEqual([x.sheets.y.yan_P0.data.length, x.sheets.y.migp0_Foto.data.length], n);
  // ARSIP susulan: P0 baru di shift yang sudah dimigrasi = shift direkap ulang
  x.src.db_Yandal_P0.data.push(x.src.db_Yandal_P0.data[3].map((v, i) => (i === 3 ? x.kp(8) : v)));
  x.g.ADMIN_migrasiP0Jalan();
  assert.strictEqual(x.isi('yan_Shift').find((b) => b['Kode Shift'] === x.S1)['Jumlah P0'], 6);
  // rencana berubah (periode dipersempit) = ditolak, rollback dulu
  x.props.setProperty('MIGP0_DARI', '2026-08-16');
  assert.strictEqual(kodeError(() => x.g.ADMIN_migrasiP0Jalan()), 'MIG_RENCANA_BERUBAH');
  assert.strictEqual(kodeError(() => x.g.ADMIN_migrasiP0Hapus()), 'MIG_HAPUS_DIKUNCI');
  x.props.setProperty('MIGP0_IZINKAN_HAPUS', 'TRUE');
  x.g.ADMIN_migrasiP0Hapus();
  assert.strictEqual(x.props.getProperty('MIGP0_IZINKAN_HAPUS'), null, 'izin hapus sekali pakai');
  assert.deepStrictEqual(x.isi('yan_Shift').map((b) => b.dibuat_oleh), [x.user.y13], 'hanya shift app v2 yang tersisa');
  assert.deepStrictEqual([x.isi('yan_P0').length, x.isi('yan_Switching').length, x.isi('yan_Gardu').length, x.isi('migp0_Foto').length], [0, 0, 0, 0]);
  x.g.ADMIN_migrasiP0Jalan();
  assert.strictEqual(x.isi('yan_Shift').filter((b) => b.dibuat_oleh === 'MIGRASI').length, 1, 'migrasi ulang periode baru');
});

test('v0.82.0 migrasi P0: kode bentrok dengan data app v2 = karantina, tidak ditimpa', () => {
  const x = siapkanMigP0();
  x.alias(['PETUGAS', '', 'Dedy', 'Dedi'], ['PEKERJAAN', '', 'Ganti Fco Tm', 'Ganti FCO']);
  const H = x.g.skemaHeader_().YANDAL_SHEET_ID.yan_Shift;
  x.sheets.y.yan_Shift.data[1][H.indexOf('Kode Shift')] = x.S1;
  const r = x.analisis();
  assert.ok(r.catatan.some((c) => c.kode === x.S1 && c.status === 'KARANTINA' && /^BENTROK_V2/.test(c.alasan)));
  assert.ok(r.catatan.some((c) => c.kode === x.kp(1) && /^INDUK_TIDAK_LOLOS/.test(c.alasan)));
});

test('v0.82.0 migrasi P0: tahap B salin foto (ID Drive + path AppSheet), sha256 terverifikasi, kolom foto + meta terisi, revision tetap', () => {
  const x = siapkanMigP0();
  x.alias(['PETUGAS', '', 'Dedy', 'Dedi'], ['PEKERJAAN', '', 'Ganti Fco Tm', 'Ganti FCO']);
  x.props.setProperty('MIGP0_IZINKAN_KARANTINA', 'TRUE');
  x.g.ADMIN_migrasiP0Jalan();
  x.g.ADMIN_migrasiP0Foto();
  assert.deepStrictEqual([...new Set(x.isi('migp0_Foto').map((q) => q.status))], ['SELESAI']);
  const a = x.isi('yan_P0').find((b) => b['Kode P0'] === x.kp(1));
  const sha = (nama) => crypto.createHash('sha256').update(x.isiFoto[nama]).digest('hex');
  const meta = JSON.parse(a.foto_meta);
  assert.deepStrictEqual([a['Foto Sebelum'], a['Foto Pekerjaan'], a['Foto Sesudah']],
    [x.kp(1) + '_SEBELUM.jpg', x.kp(1) + '_PEKERJAAN.jpg', x.kp(1) + '_SESUDAH.jpg']);
  assert.deepStrictEqual([meta.SEBELUM.sha256, meta.PEKERJAAN.sha256, meta.SESUDAH.sha256], [sha('s1.jpg'), sha('P1.Foto Pekerjaan.jpg'), sha('z1.jpg')]);
  assert.strictEqual(meta.SESUDAH.waktu, '2026-08-15T02:40:00.000Z', 'waktu lama tetap');
  assert.strictEqual(a.revision, 1);
  const f = x.dr.semuaFile[a.foto_id_sesudah];
  assert.ok(f && f.desk === 'sisi-foto:' + a.p0_id + '-SESUDAH' && f.akses === 'PRIVATE');
  assert.ok(String(a['Link Drive Sesudah']).includes(a.foto_id_sesudah));
  assert.doesNotThrow(() => x.g.bytesFotoTerverifikasi_(a.foto_id_sesudah, meta.SESUDAH.sha256), 'foto terbaca lewat jalur approval v2');
  const sw = x.isi('yan_Switching')[0];
  assert.strictEqual(JSON.parse(sw.foto_meta).ARUS.sha256, sha('arus.jpg'));
  assert.ok(sw.foto_id_arus);
  // folder tujuan = Foto Yandal / YYYY / MM / DD / Tim / Kode Shift
  let fo = x.dr.folders.yfoto;
  ['2026', '08', '15', 'YANDAL 13', x.S1].forEach((nm) => { assert.ok(fo.anak[nm], nm); fo = x.dr.folders[fo.anak[nm]]; });
  // jalan lagi: antrean kosong, tidak menyalin ulang
  const jumlah = Object.keys(x.dr.semuaFile).length;
  x.g.ADMIN_migrasiP0Foto();
  assert.strictEqual(Object.keys(x.dr.semuaFile).length, jumlah);
});

test('v0.82.1: ADMIN_cekKonfigurasi menampilkan bagian Migrasi P0 (property, tab sumber, periode, folder foto)', () => {
  assert.match(g.ADMIN_cekKonfigurasi.toString(), /cekKonfigMigrasiP0_\(c\)/);
  const x = siapkanMigP0();
  const tangkap = (fn) => {
    const log = [], asli = { log: console.log, warn: console.warn };
    console.log = (m) => log.push('L ' + m); console.warn = (m) => log.push('W ' + m);
    let n;
    try { n = fn(); } finally { console.log = asli.log; console.warn = asli.warn; }
    return { n, log: log.join('\n') };
  };
  const c = x.g.cfg_();
  const ok = tangkap(() => x.g.cekKonfigMigrasiP0_(c));
  assert.strictEqual(ok.n, 0, ok.log);
  assert.match(ok.log, /MIGP0_SUMBER_ID: "File src" \| db_Yandal_Shift: 4 baris \| db_Yandal_P0: 9 baris \| db_Yandal_Pengecekan_Switching: 2 baris \| Pengukuran Gardu \("Pengukuran Gardu Toboali"\): 1 baris/);
  assert.match(ok.log, /Periode migrasi P0: 2026-01-01 s\.d\. hari ini/);
  assert.match(ok.log, /MIGP0_FOTO_AKAR_ID: folder "AppSheet SiSi"/);
  // kosong = info saja, bukan masalah
  x.props.deleteProperty('MIGP0_SUMBER_ID');
  const kosong = tangkap(() => x.g.cekKonfigMigrasiP0_(c));
  assert.strictEqual(kosong.n, 0);
  assert.match(kosong.log, /MIGP0_SUMBER_ID kosong: migrasi P0 belum disiapkan/);
  // salah = masalah
  x.props.setProperty('MIGP0_SUMBER_ID', 'y');
  x.props.setProperty('MIGP0_DARI', '01-09-2026');
  x.props.setProperty('MIGP0_IZINKAN_KARANTINA', 'TRUE');
  const salah = tangkap(() => x.g.cekKonfigMigrasiP0_(c));
  assert.strictEqual(salah.n, 2, salah.log);
  assert.match(salah.log, /sama dengan spreadsheet v2/);
  assert.match(salah.log, /MIGP0_DARI "01-09-2026" harus yyyy-MM-dd/);
  assert.match(salah.log, /W MIGP0_IZINKAN_KARANTINA = TRUE/);
  x.props.setProperty('MIGP0_DARI', '2026-09-01');
  x.props.setProperty('MIGP0_SUMBER_ID', 'src');
  delete x.sheets.src.db_Yandal_P0;
  const tab = tangkap(() => x.g.cekKonfigMigrasiP0_(c));
  assert.strictEqual(tab.n, 1, tab.log);
  assert.match(tab.log, /tab db_Yandal_P0 tidak ada di "File src" \(wajib\)/);
  const buka = x.g.SpreadsheetApp.openById;
  x.g.SpreadsheetApp.openById = (id) => { if (id === 'tidakada') throw new Error('Akses ditolak'); return buka(id); };
  x.props.setProperty('MIGP0_SUMBER_ID', 'tidakada');
  const g2 = tangkap(() => x.g.cekKonfigMigrasiP0_(c));
  assert.strictEqual(g2.n, 1, g2.log);
  assert.match(g2.log, /tidak bisa dibuka \(Akses ditolak\)\. Bagikan file ke akun pemilik script/);
});

// ---------- v0.83.0 notifikasi pengingat login Yandal (FCM) ----------
test('v0.83.0: rencanaPengingat_: tahap 0 / 30 ke HP terakhir tim yang belum login, admin di menit 60, tidak dobel, peralihan diam', () => {
  const ms = (s) => Date.parse(s);
  const tim = [{ tim_id: 'A', jenis: 'YANDAL', aktif: true, kode: '13', nama: 'YANDAL 13' }, { tim_id: 'B', jenis: 'YANDAL', aktif: true, kode: '14', nama: 'YANDAL 14' },
    { tim_id: 'C', jenis: 'YANDAL', aktif: true, kode: '15', nama: 'YANDAL 15' }, { tim_id: 'R', jenis: 'ROW', aktif: true, kode: '01', nama: 'ROW 01' }];
  const users = [{ user_id: 'uA', role: 'PETUGAS', tim_id: 'A', aktif: true }, { user_id: 'uB', role: 'PETUGAS', tim_id: 'B', aktif: true },
    { user_id: 'uR', role: 'PETUGAS', tim_id: 'R', aktif: true }, { user_id: 'adm', role: 'ADMIN', tim_id: '', aktif: true },
    { user_id: 'sup', role: 'SUPER', tim_id: '', aktif: true }, { user_id: 'mati', role: 'ADMIN', tim_id: '', aktif: false }];
  const perangkat = [{ user_id: 'uA', install_id: 'ins1', dibuat_pada: '2026-10-09T03:00:00.000Z' }, { user_id: 'uA', install_id: 'ins9', dibuat_pada: '2026-10-09T17:00:00.000Z' },
    { user_id: 'uB', install_id: 'ins2', dibuat_pada: '2026-10-09T09:00:00.000Z' }, { user_id: 'uR', install_id: 'insR', dibuat_pada: '2026-10-09T09:00:00.000Z' }];
  const notif = [{ install_id: 'ins1', user_id: 'uA', fcm_token: 'tokA', aktif: true }, { install_id: 'ins2', user_id: 'uB', fcm_token: 'tokB', aktif: true },
    { install_id: 'insR', user_id: 'uR', fcm_token: 'tokR', aktif: true }, { install_id: 'ins3', user_id: 'adm', fcm_token: 'tokAdm', aktif: true },
    { install_id: 'ins4', user_id: 'mati', fcm_token: 'tokX', aktif: true }, { install_id: 'ins5', user_id: 'sup', fcm_token: 'tokS', aktif: false }];
  const r = (sekarang, riwayat = [], shiftRows = []) => JSON.parse(JSON.stringify(g.rencanaPengingat_({ sekarangMs: ms(sekarang), tim, users, shiftRows, perangkat, notif, riwayat,
    menitYandal: [0, 30], menitAdmin: 60 })));
  const awal = r('2026-10-10T08:00:40+07:00');
  assert.deepStrictEqual(awal.yandal.map((x) => [x.tim.nama, x.menit, x.hp.token, x.hp.terakhir]), [['YANDAL 13', 0, 'tokA', false], ['YANDAL 14', 0, 'tokB', true]],
    'tim tanpa akun (15) + tim ROW tidak diingatkan; HP terakhir login ins9 belum daftar notifikasi = HP terdaftar sebelumnya');
  assert.deepStrictEqual(awal.admin, []);
  const sudah0 = [{ Tanggal: '2026-10-10', Shift: 1, tim_id: 'A', Jenis: 'YANDAL', Menit: 0, Hasil: 'TERKIRIM' }, { Tanggal: '2026-10-10', Shift: 1, tim_id: 'B', Jenis: 'YANDAL', Menit: 0, Hasil: 'TERKIRIM' }];
  assert.deepStrictEqual(r('2026-10-10T08:20:00+07:00', sudah0).yandal, [], 'tahap 0 sudah = diam sampai menit 30');
  const r61 = r('2026-10-10T09:01:00+07:00', [...sudah0, { Tanggal: '2026-10-10', Shift: 1, tim_id: 'A', Jenis: 'YANDAL', Menit: 30, Hasil: 'TERKIRIM' },
    { Tanggal: '2026-10-09', Shift: 1, tim_id: 'B', Jenis: 'YANDAL', Menit: 30, Hasil: 'TERKIRIM' }]);
  assert.deepStrictEqual(r61.yandal.map((x) => [x.tim.nama, x.menit]), [['YANDAL 14', 30]], 'riwayat shift lain tidak dihitung');
  assert.deepStrictEqual(r61.admin.map((x) => x.tim.nama), ['YANDAL 13', 'YANDAL 14']);
  assert.deepStrictEqual(r61.penerimaAdmin.map((x) => x.token), ['tokAdm'], 'admin aktif + token aktif saja');
  // tim yang sudah mulai shift tidak diingatkan
  const masuk = r('2026-10-10T09:01:00+07:00', [], [{ shift_id: 's', status: 'AKTIF', Tanggal: '2026-10-10', Shift: 1, tim_id: 'B' }]);
  assert.deepStrictEqual(masuk.admin.map((x) => x.tim.nama), ['YANDAL 13']);
  // GAGAL dicoba lagi sampai 3x, admin yang sudah dikirim tidak dobel
  const gagal = (n) => Array.from({ length: n }, () => ({ Tanggal: '2026-10-10', Shift: 1, tim_id: 'A', Jenis: 'YANDAL', Menit: 0, Hasil: 'GAGAL HTTP 500' }));
  assert.strictEqual(r('2026-10-10T08:10:00+07:00', gagal(2)).yandal.filter((x) => x.tim.timId === 'A').length, 1);
  assert.strictEqual(r('2026-10-10T08:10:00+07:00', gagal(3)).yandal.filter((x) => x.tim.timId === 'A').length, 0);
  assert.deepStrictEqual(r('2026-10-10T10:00:00+07:00', [{ Tanggal: '2026-10-10', Shift: 1, tim_id: 'A', Jenis: 'ADMIN', Menit: 60, Hasil: 'TERKIRIM 1 HP' }]).admin.map((x) => x.tim.timId), ['B']);
  // shift 3 = tanggal kemarin; menit peralihan = diam
  const s3 = r('2026-10-11T00:31:00+07:00');
  assert.deepStrictEqual([s3.sh.tanggal, s3.sh.no, s3.yandal.map((x) => x.menit)], ['2026-10-10', 3, [30, 30]]);
  assert.deepStrictEqual(r('2026-10-10T15:59:10+07:00').yandal, []);
  // pesan + menit dari property
  assert.deepStrictEqual([...g.menitPengingat_('30, 0,x,30,999', [0])], [0, 30]);
  assert.deepStrictEqual([...g.menitPengingat_('', [0, 30])], [0, 30]);
  const sh = g.shiftYandal_(ms('2026-10-10T08:31:00+07:00'));
  assert.strictEqual(g.pesanPengingatYandal_({ nama: 'YANDAL 13' }, sh, 30).isi,
    'Shift 1 (08:00 - 16:00, 10 Okt) sudah berjalan 30 menit dan YANDAL 13 belum login. Segera login dan pilih petugas.');
  assert.strictEqual(g.pesanPengingatAdmin_([{ tim: { nama: 'YANDAL 13' }, hp: {} }, { tim: { nama: 'YANDAL 14' }, hp: null }], sh, 61).isi,
    'Shift 1 (08:00 - 16:00, 10 Okt) sudah 61 menit: YANDAL 13, YANDAL 14 (HP belum terdaftar notifikasi).');
});

function siapkanNotif() {
  const x = siapkanYandal();
  const buat = sheetPalsu(x.log);
  x.sheets.a.auth_Notif = buat('auth_Notif', [[...x.g.AUTH_NOTIF_HEADER_]]);
  x.sheets.y.yan_Pengingat = buat('yan_Pengingat', [[...x.g.YAN_PENGINGAT_HEADER_]]);
  const props = x.g.PropertiesService.getScriptProperties();
  props.setProperty('FCM_SERVICE_ACCOUNT', JSON.stringify({ client_email: 'sisi@proyek.iam.gserviceaccount.com', private_key: 'KUNCI', project_id: 'sisi-uji' }));
  x.g.pastikanPemilik_ = () => {};
  const fcm = { kirim: [], mati: new Set(), auth: 0 };
  x.g.Utilities.base64EncodeWebSafe = (v) => (typeof v === 'string' ? Buffer.from(v) : Buffer.from(v.map((b) => b & 255))).toString('base64url') + '==';
  x.g.Utilities.computeRsaSha256Signature = (teks, kunci) => { assert.strictEqual(kunci, 'KUNCI'); return [1, 2, 3]; };
  x.g.UrlFetchApp = {
    fetch: (url, o) => { fcm.auth++; assert.strictEqual(url, 'https://oauth2.googleapis.com/token'); assert.ok(o.payload.assertion.split('.').length === 3);
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ access_token: 'akses-1', expires_in: 3600 }) }; },
    fetchAll: (reqs) => reqs.map((q) => {
      const m = JSON.parse(q.payload).message;
      assert.strictEqual(q.headers.Authorization, 'Bearer akses-1');
      assert.ok(q.url.endsWith('/projects/sisi-uji/messages:send'));
      fcm.kirim.push({ token: m.token, judul: m.notification.title, isi: m.notification.body, jenis: m.data.jenis });
      return fcm.mati.has(m.token) ? { getResponseCode: () => 404, getContentText: () => '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}' }
        : { getResponseCode: () => 200, getContentText: () => '{"name":"x"}' };
    }),
  };
  const daftar = (token, fcmToken, pf = 'MOBILE') => x.j(x.g.proses_({ action: 'daftarNotif', token, data: { fcmToken } }, pf)).data;
  const notif = () => x.sheets.a.auth_Notif.data.slice(1).map((b) => Object.fromEntries(x.g.AUTH_NOTIF_HEADER_.map((h, i) => [h, b[i]])));
  const riwayat = () => x.sheets.y.yan_Pengingat.data.slice(1).map((b) => Object.fromEntries(x.g.YAN_PENGINGAT_HEADER_.map((h, i) => [h, b[i]])));
  return { ...x, fcm, daftar, notif, riwayat, props };
}

test('v0.83.0: daftarNotif: HP saja, akun YANDAL / admin, satu baris per instalasi, kirim ulang tidak menulis, ganti akun = baris pindah', () => {
  const x = siapkanNotif();
  x.jam.atur('08:05:00');
  const s = x.mulai(x.login('16130.yandal13').tiket, [x.p.a]);
  const tok = 'fcmA:' + 'a'.repeat(30);
  assert.deepStrictEqual(x.daftar(s.token, tok), { terdaftar: true });
  assert.deepStrictEqual(x.notif().map((n) => [n.install_id, n.user_id, n.fcm_token, n.aktif]), [[x.ins1, x.user.y13, tok, true]]);
  assert.strictEqual(x.sheets.a.log_Audit.data.at(-1)[4], 'DAFTAR_NOTIF');
  const audit = x.sheets.a.log_Audit.data.length, tulis = x.log.filter((l) => l === 'TULIS:auth_Notif').length;
  x.daftar(s.token, tok);
  assert.deepStrictEqual([x.sheets.a.log_Audit.data.length, x.log.filter((l) => l === 'TULIS:auth_Notif').length], [audit, tulis], 'sama + segar = tidak menulis');
  assert.strictEqual(kodeError(() => x.daftar(s.token, tok, 'WEB')), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.daftar(s.token, 'pendek')), 'FORMAT_SALAH');
  const row = x.login('16130.row01', x.ins2).token;
  assert.strictEqual(kodeError(() => x.daftar(row, tok)), 'AKSES_DITOLAK', 'akun ROW tidak menerima notifikasi');
  // admin login di HP yang sama: baris instalasi pindah ke admin (bukan baris baru)
  const adm = x.login('16130.admin', x.ins1).token;
  x.daftar(adm, tok);
  assert.deepStrictEqual(x.notif().map((n) => [n.install_id, n.user_id]), [[x.ins1, x.user.admin]]);
  assert.strictEqual(x.sheets.a.log_Audit.data.at(-1)[4], 'PINDAH_AKUN_NOTIF');
});

test('v0.83.0: ADMIN_pengingatYandal: pengingat ke HP Yandal terakhir login (FCM), admin sesudah 1 jam, riwayat cegah dobel, token mati dinonaktifkan', () => {
  const x = siapkanNotif();
  const hariIni = x.hari, kemarin = x.g.tglJakarta_(new Date(Date.parse(hariIni + 'T12:00:00+07:00') - 864e5));
  // shift 3 (dini hari): HP tim 13 + 14 login lalu daftar notifikasi; admin daftar dari HP sendiri
  x.jam.atur('03:00:00');
  const s13 = x.mulai(x.login('16130.yandal13', x.ins1).tiket, [x.p.a], x.ins1);
  x.daftar(s13.token, 'tok13:' + 'a'.repeat(30));
  const s14 = x.mulai(x.login('16130.yandal14', x.ins2).tiket, [x.p.c], x.ins2);
  x.daftar(s14.token, 'tok14:' + 'b'.repeat(30));
  const insAdm = '33333333-3333-4333-8333-333333333333';
  x.daftar(x.login('16130.admin', insAdm).token, 'tokAdm:' + 'c'.repeat(30));
  void kemarin;
  // 08:00 shift 1 mulai, belum ada yang login: 2 pengingat ke HP tim
  x.jam.atur('08:00:40');
  x.g.ADMIN_pengingatYandal();
  assert.deepStrictEqual(x.fcm.kirim.map((k) => [k.token.split(':')[0], k.jenis]), [['tok13', 'PENGINGAT_LOGIN'], ['tok14', 'PENGINGAT_LOGIN']]);
  assert.strictEqual(x.fcm.kirim[0].judul, 'Pengingat Login YANDAL 13');
  assert.deepStrictEqual(x.riwayat().map((b) => [b.Tim, b.Jenis, b.Menit, b.Hasil, b.Tujuan]),
    [['YANDAL 13', 'YANDAL', 0, 'TERKIRIM', 'HP terakhir login'], ['YANDAL 14', 'YANDAL', 0, 'TERKIRIM', 'HP terakhir login']]);
  assert.strictEqual(x.fcm.auth, 1);
  x.jam.atur('08:05:00');
  x.g.ADMIN_pengingatYandal();
  assert.strictEqual(x.fcm.kirim.length, 2, 'tidak dobel');
  // tim 13 login 08:20, menit 30 hanya tim 14
  x.jam.atur('08:20:00');
  x.mulai(x.login('16130.yandal13', x.ins1).tiket, [x.p.b], x.ins1);
  x.jam.atur('08:31:00');
  x.g.ADMIN_pengingatYandal();
  assert.deepStrictEqual(x.fcm.kirim.slice(2).map((k) => k.token.split(':')[0]), ['tok14']);
  assert.match(x.fcm.kirim[2].isi, /sudah berjalan 31 menit|sudah berjalan 30 menit/);
  // 09:01 admin: tim 14 belum login
  x.jam.atur('09:01:00');
  x.g.ADMIN_pengingatYandal();
  assert.deepStrictEqual(x.fcm.kirim.slice(3).map((k) => [k.token.split(':')[0], k.judul, k.jenis]), [['tokAdm', '1 tim Yandal belum login', 'BELUM_LOGIN_YANDAL']]);
  assert.match(x.fcm.kirim[3].isi, /^Shift 1 \(08:00 - 16:00, .*\) sudah 61 menit: YANDAL 14\.$/);
  assert.deepStrictEqual(x.riwayat().at(-1).Hasil, 'TERKIRIM 1 HP');
  x.jam.atur('09:30:00');
  x.g.ADMIN_pengingatYandal();
  assert.strictEqual(x.fcm.kirim.length, 4, 'admin sekali per tim per shift');
  // shift 2: token tim 14 sudah tidak terdaftar (app di-uninstall) = baris dimatikan, kiriman berikut TANPA_HP
  x.fcm.mati.add('tok14:' + 'b'.repeat(30));
  x.jam.atur('16:00:30');
  x.g.ADMIN_pengingatYandal();
  const n14 = x.notif().find((n) => n.install_id === x.ins2);
  assert.deepStrictEqual([n14.aktif, /^TIDAK_TERDAFTAR HTTP 404/.test(n14.pesan)], [false, true]);
  assert.ok(x.riwayat().some((b) => b.Tim === 'YANDAL 14' && b.Shift === 2 && /^GAGAL HTTP 404/.test(b.Hasil)));
  x.jam.atur('16:30:30');
  x.g.ADMIN_pengingatYandal();
  assert.ok(x.riwayat().some((b) => b.Tim === 'YANDAL 14' && b.Shift === 2 && b.Menit === 30 && b.Hasil === 'TANPA_HP'));
  // tanpa service account = tidak mengirim apa pun
  x.props.deleteProperty('FCM_SERVICE_ACCOUNT');
  const n = x.fcm.kirim.length;
  x.jam.atur('17:01:00');
  x.g.ADMIN_pengingatYandal();
  assert.strictEqual(x.fcm.kirim.length, n);
});

// ---------- v0.84.0 pantau pemakaian kuota ----------
test('v0.84.0: jalanPemicu_ mencatat waktu pemicu vs manual, rem RENDAH 80% / NORMAL 95%, PENTING tidak pernah direm; ambilUrl_ menghitung UrlFetch + engine PDF bulanan', () => {
  const gp = buatKonteks(PROPS);
  const props = gp.PropertiesService.getScriptProperties();
  const hari = () => JSON.parse(props.getProperty(gp.kunciHariPakai_(Date.now())) || '{}');
  const ev = { triggerUid: '123' };
  let jalan = 0;
  assert.strictEqual(gp.jalanPemicu_('ADMIN_migrasiFoto', ev, () => { jalan++; return 'ok'; }), 'ok');
  gp.jalanPemicu_('ADMIN_migrasiFoto', undefined, () => { jalan++; });
  let h = hari();
  assert.deepStrictEqual([h.pemicu_n, h.manual_n, jalan], [1, 1, 2]);
  assert.ok(h.pemicu_ms >= 500 && h.fn.ADMIN_migrasiFoto >= 500, 'overhead 0,5 s ikut dihitung');
  // error tetap dicatat
  assert.throws(() => gp.jalanPemicu_('ADMIN_pengingatYandal', ev, () => { throw new Error('x'); }));
  assert.strictEqual(hari().pemicu_n, 2);
  // 81% kuota pemicu Gmail (90 menit): RENDAH direm, NORMAL + PENTING jalan
  props.setProperty(gp.kunciHariPakai_(Date.now()), JSON.stringify({ pemicu_ms: 0.81 * 90 * 60000, url_n: 10 }));
  const hasil = ['ADMIN_migrasiFoto', 'ADMIN_migrasiP0Foto', 'ADMIN_pengingatYandal', 'ADMIN_rekapShiftYandal'].map((n) => gp.jalanPemicu_(n, ev, () => 'jalan'));
  assert.deepStrictEqual(hasil, [null, null, 'jalan', 'jalan']);
  assert.deepStrictEqual({ ...hari().rem }, { ADMIN_migrasiFoto: 1, ADMIN_migrasiP0Foto: 1 });
  assert.strictEqual(gp.jalanPemicu_('ADMIN_migrasiFoto', undefined, () => 'manual'), 'manual', 'jalan manual tidak direm');
  props.setProperty(gp.kunciHariPakai_(Date.now()), JSON.stringify({ pemicu_ms: 0, url_n: 19500 }));
  assert.deepStrictEqual(['ADMIN_pengingatYandal', 'ADMIN_rekapShiftYandal', 'ADMIN_pantauPemakaian'].map((n) => gp.jalanPemicu_(n, ev, () => 'jalan')), [null, 'jalan', 'jalan'], 'UrlFetch 97,5%');
  props.setProperty('PAKET_GOOGLE', 'WORKSPACE');
  assert.strictEqual(gp.jalanPemicu_('ADMIN_pengingatYandal', ev, () => 'jalan'), 'jalan', 'Workspace 100.000 UrlFetch');
  // UrlFetch
  props.deleteProperty(gp.kunciHariPakai_(Date.now()));
  gp.UrlFetchApp = { fetch: () => ({ ok: 1 }), fetchAll: (d) => d.map(() => ({})) };
  gp.ambilUrl_('https://x', {}, 'pdf'); gp.ambilUrl_('https://x', {}, 'pdf'); gp.ambilUrlSemua_([{}, {}, {}], 'fcm');
  h = hari();
  assert.deepStrictEqual([h.url_n, h.pdf_n, h.fcm_n], [5, 2, 3]);
  assert.strictEqual(JSON.parse(props.getProperty(gp.kunciBulanPakai_(Date.now()))).pdf_n, 2);
  gp.UrlFetchApp = { fetch: () => { throw new Error('jaringan'); } };
  assert.throws(() => gp.ambilUrl_('https://x', {}, 'pdf'));
  assert.strictEqual(hari().url_n, 6, 'gagal tetap dihitung (kuota tetap terpakai)');
});

test('v0.84.0: ringkasPemakaian_ + getPemakaian (admin) + ADMIN_pantauPemakaian: log harian, peringatan sekali per tingkat, catatan lama dibersihkan', () => {
  const b = { paket: 'GMAIL', pemicuMenit: 90, urlFetch: 20000, pdfRequest: 2000000, pdfVcpuDetik: 180000, pdfVcpu: 1 };
  const r = JSON.parse(JSON.stringify(g.ringkasPemakaian_('2026-10-10', {
    '2026-10-10': { pemicu_n: 30, pemicu_ms: 45 * 60000, url_n: 1000, pdf_n: 3, fcm_n: 20, fn: { ADMIN_pengingatYandal: 30 * 60000, ADMIN_rekapShiftYandal: 15 * 60000 }, rem: { ADMIN_migrasiFoto: 2 } },
    '2026-10-09': { pemicu_ms: 9 * 60000, url_n: 50 } }, { pdf_n: 40, pdf_ms: 400000 }, b)));
  assert.deepStrictEqual([r.status, r.pemicu.menit, r.pemicu.persen, r.urlFetch.persen, r.pdfBulan.vcpuDetik, r.pdfBulan.persen], ['AMAN', 45, 50, 5, 400, 0.2]);
  assert.deepStrictEqual(r.pemicu.perFungsi.map((f) => [f.nama, f.menit]), [['ADMIN_pengingatYandal', 30], ['ADMIN_rekapShiftYandal', 15]]);
  assert.deepStrictEqual(r.riwayat.map((x) => [x.tanggal, x.pemicuPersen]), [['2026-10-10', 50], ['2026-10-09', 10]]);
  assert.deepStrictEqual([...g.peringatanBaruPakai_({ pemicu: { persen: 96 }, urlFetch: { persen: 81 }, pdfBulan: { persen: 1 } }, { url80: true })], ['pemicu95']);
  // endpoint + pemantau
  const x = siapkanNotif();
  const props = x.props;
  const tgl = x.g.tglJakarta_(new Date()), lama = '2026-01-01';
  props.setProperty('PAKAI_H:' + tgl, JSON.stringify({ pemicu_n: 200, pemicu_ms: 0.85 * 90 * 60000, url_n: 300 }));
  props.setProperty('PAKAI_H:' + lama, JSON.stringify({ pemicu_ms: 1 }));
  x.sheets.m.db_Menu.data.push(['OPS_ENGINE', 'Pemakaian Engine', 'MOBILE', false, 40, true]);   // v0.85.0: endpoint lewat menu
  const adm = x.login('16130.admin', x.ins1).token;
  const data = x.j(x.g.proses_({ action: 'getPemakaian', token: adm, data: {} }, 'MOBILE')).data;
  assert.deepStrictEqual([data.status, data.pemicu.persen, data.paket], ['WASPADA', 85, 'GMAIL']);
  assert.strictEqual(kodeError(() => x.g.proses_({ action: 'getPemakaian', token: adm, data: { a: 1 } }, 'MOBILE')), 'FIELD_TIDAK_DIKENAL');
  x.daftar(adm, 'tokAdm:' + 'c'.repeat(30));
  x.g.ADMIN_pantauPemakaian();
  const log = x.sheets.a.log_Pemakaian.data;
  assert.deepStrictEqual(log[0], [...x.g.LOG_PEMAKAIAN_HEADER_]);
  const baris = log.slice(1).find((b) => b[0] === tgl);
  assert.deepStrictEqual([baris[2], baris[3], baris[4]], [76.5, 90, 85]);
  assert.deepStrictEqual(x.fcm.kirim.map((k) => [k.judul, k.jenis]), [['Pemakaian server tinggi', 'PEMAKAIAN']]);
  assert.match(x.fcm.kirim[0].isi, /^Waktu pemicu 76\.5\/90 menit \(85%\)/);
  assert.strictEqual(props.getProperty('PAKAI_H:' + lama), null, 'catatan > 8 hari dihapus');
  x.g.ADMIN_pantauPemakaian();
  assert.strictEqual(x.fcm.kirim.length, 1, 'peringatan 80% sekali sehari');
  assert.strictEqual(x.sheets.a.log_Pemakaian.data.filter((b) => b[0] === tgl).length, 1, 'satu baris per tanggal (diperbarui)');
  const h = JSON.parse(props.getProperty('PAKAI_H:' + tgl));
  props.setProperty('PAKAI_H:' + tgl, JSON.stringify({ ...h, pemicu_ms: 0.96 * 90 * 60000 }));
  x.g.ADMIN_pantauPemakaian();
  assert.deepStrictEqual(x.fcm.kirim.slice(1).map((k) => k.judul), ['Kuota server hampir habis']);
  assert.ok(JSON.parse(props.getProperty('PAKAI_H:' + tgl)).manual_n >= 3, 'jalan pemantau manual ikut tercatat');
});

test('v0.85.0: Cloud Run per layanan dari Cloud Monitoring: hari ini + bulan ini, total vs kuota gratis, cache 10 menit, salah izin = pesan jelas', () => {
  // murni
  const json = { timeSeries: [
    { resource: { labels: { service_name: 'sisi2-pdf-staging' } }, points: [{ value: { int64Value: '12' } }, { value: { int64Value: '3' } }] },
    { resource: { labels: { service_name: 'sisi2-pdf-production' } }, points: [{ value: { doubleValue: 4.5 } }] }] };
  assert.deepStrictEqual({ ...g.jumlahDeretMonitor_(json) }, { 'sisi2-pdf-staging': 15, 'sisi2-pdf-production': 4.5 });
  const url = g.urlDeretMonitor_('db-sisi', 'run.googleapis.com/request_count', Date.parse('2026-10-10T00:00:00+07:00'), Date.parse('2026-10-10T00:00:30+07:00'));
  assert.match(url, /^https:\/\/monitoring\.googleapis\.com\/v3\/projects\/db-sisi\/timeSeries\?filter=/);
  assert.match(decodeURIComponent(url), /aggregation\.alignmentPeriod=60s&.*groupByFields=resource\.labels\.service_name/);
  // lewat getPemakaian
  const x = siapkanNotif();
  x.sheets.m.db_Menu.data.push(['OPS_ENGINE', 'Pemakaian Engine', 'MOBILE', false, 40, true]);
  const adm = x.login('16130.admin', x.ins1).token;
  const ambil = (data = {}) => x.j(x.g.proses_({ action: 'getPemakaian', token: adm, data }, 'MOBILE')).data.cloudRun;
  assert.match(ambil().pesan, /^CLOUD_RUN_PROJECT belum diisi/);
  x.props.setProperty('CLOUD_RUN_PROJECT', 'db-sisi-toboali');
  const nilai = {   // [hari, bulan] per metrik per layanan
    request_count: { 'sisi2-pdf-staging': [3, 40], 'sisi2-pdf-production': [5, 400000], 'ba-pdf-engine': [0, 10] },
    'cpu/allocation_time': { 'sisi2-pdf-staging': [12.5, 300], 'sisi2-pdf-production': [20, 89700], 'ba-pdf-engine': [0, 0] },
    'memory/allocation_time': { 'sisi2-pdf-staging': [6, 150], 'sisi2-pdf-production': [10, 44850], 'ba-pdf-engine': [0, 0] } };
  let panggil = 0, kodeHttp = 200;
  const fetchAsli = x.g.UrlFetchApp.fetchAll;
  x.g.UrlFetchApp.fetchAll = (reqs) => {
    if (!reqs[0].url.startsWith('https://monitoring')) return fetchAsli(reqs);
    panggil++;
    return reqs.map((q, i) => {
      const u = decodeURIComponent(q.url);
      const metrik = Object.keys(nilai).find((m) => u.includes('run.googleapis.com/' + (m === 'request_count' ? m : 'container/' + m)));
      const bulan = i >= 3;   // urutan: 3 metrik hari ini, lalu 3 metrik bulan ini
      const ts = Object.entries(nilai[metrik]).map(([n, v]) => ({ resource: { labels: { service_name: n } }, points: [{ value: metrik === 'request_count' ? { int64Value: String(v[bulan ? 1 : 0]) } : { doubleValue: v[bulan ? 1 : 0] } }] }));
      return { getResponseCode: () => kodeHttp, getContentText: () => JSON.stringify({ timeSeries: ts }) };
    });
  };
  const cr = ambil();
  assert.strictEqual(cr.aktif, true, JSON.stringify(cr));
  assert.deepStrictEqual(cr.layanan.map((l) => [l.nama, l.hariIni.request, l.bulan.request, l.bulan.vcpuDetik]),
    [['ba-pdf-engine', 0, 10, 0], ['sisi2-pdf-production', 5, 400000, 89700], ['sisi2-pdf-staging', 3, 40, 300]]);
  assert.deepStrictEqual([cr.total.bulan.request, cr.total.bulan.vcpuDetik, cr.persen.vcpuDetik, cr.persen.request, cr.persenMaks], [400050, 90000, 50, 20, 50]);
  ambil();
  assert.strictEqual(panggil, 1, 'cache 10 menit');
  ambil({ segarkan: true });
  assert.strictEqual(panggil, 2, 'segarkan = baca ulang');
  x.props.setProperty('CLOUD_RUN_LAYANAN', 'sisi2-pdf-staging, sisi2-pdf-production');
  assert.deepStrictEqual(ambil({ segarkan: true }).layanan.map((l) => l.nama), ['sisi2-pdf-production', 'sisi2-pdf-staging']);
  kodeHttp = 403;
  assert.match(ambil({ segarkan: true }).pesan, /belum punya peran Monitoring Viewer di proyek db-sisi-toboali/);
  // peringatan Cloud Run ikut pemantau
  assert.deepStrictEqual([...x.g.peringatanBaruPakai_({ pemicu: { persen: 0 }, urlFetch: { persen: 0 }, pdfBulan: { persen: 0 }, cloudRun: { aktif: true, persenMaks: 82 } }, {})], ['cloud80']);
});

// ---------- v0.86.0 Arsip BA v1 (baca saja) ----------
test('v0.86.0: arsip BA v1: Rekap Gardu + Rekap Switching lama -> arsip_BA_V1 (salinan, diulang aman), satu halaman Daftar BA (sumber V1 / SEMUA), file PDF / TTD lewat server', () => {
  const x = siapkanBa();
  const gg = x.gg;
  gg.pastikanPemilik_ = () => {};
  const buat = sheetPalsu([]);
  // Rekap Gardu: judul baris 6, data mulai baris 10, kolom tetap v1 (CE No BA Full, CG TTD, CI idBA, CK-CN PDF)
  const L = 95, kosong = (n) => Array.from({ length: n }, () => new Array(L).fill(''));
  const rk = kosong(9);
  Object.assign(rk[5], { 1: 'Nomor Gardu', 3: 'Tanggal BA', 4: 'Jenis Pekerjaan', 82: 'NO BA Full', 84: 'Link BA TTD', 86: 'idBA', 88: 'File PDF URL', 89: 'File ID', 90: 'Status PDF', 91: 'Waktu Selesai' });
  const bRk = (isi) => Object.assign(new Array(L).fill(''), isi);
  const idPdf1 = 'PDFsatuAAAAAAAAAAAAAAAAAAA', idTtd1 = 'TTDsatuAAAAAAAAAAAAAAAAAAA', idPdf2 = 'PDFduaBBBBBBBBBBBBBBBBBBBB', idPdfSw = 'PDFswCCCCCCCCCCCCCCCCCCCCC';
  rk.push(
    bRk({ 1: 'TB0002', 3: '05/03/2025', 4: 'Pengoperasian Trafo', 5: '100', 10: 'Jl. Lama', 11: 'TB-01', 12: 'Kampung Baru', 82: 'No. 001 / BA - TRF / ULP - TBL / 3 / 2025',
      84: `https://drive.google.com/file/d/${idTtd1}/view`, 86: 'BA-GRD-TBL-202503-001', 88: `https://drive.google.com/file/d/${idPdf1}/view`, 89: idPdf1, 90: 'SELESAI', 91: '2025-03-05 10:00:00' }),
    bRk({ 1: 'tb 421', 3: '2025-06-10', 4: 'Penggantian Trafo', 11: 'TB-02', 86: 'BA-GRD-TBL-202506-004', 88: `https://drive.google.com/open?id=${idPdf2}` }),
    bRk({}),
    bRk({ 1: 'TB0002', 3: '2025-04-01', 4: 'Pemeriksaan Trafo' }),
    bRk({ 1: 'TB0002', 3: '2025-03-05', 4: 'Pengoperasian Trafo', 86: 'BA-GRD-TBL-202503-001' }));
  // Rekap Switching: judul di baris 4 (dicari), kolom tetap v1 (AI idBA, AK-AN PDF, AO TTD)
  const sw = Array.from({ length: 3 }, () => new Array(45).fill(''));
  sw.push(Object.assign(new Array(45).fill(''), { 1: 'Tanggal BA', 3: 'Jenis Pekerjaan', 5: 'Nama Switching', 34: 'idBA' }));
  sw.push(Object.assign(new Array(45).fill(''), { 1: '2025-08-01', 3: 'Pengoperasian Switching', 4: 'LBS', 5: 'LBS Kampung Baru', 6: 'TB-01', 7: 'Kampung Baru',
    34: 'BA-SWT-TBL-202508-001', 35: 'No. 001 / BA - SWC / ULP - TBL / 8 / 2025', 36: `https://drive.google.com/file/d/${idPdfSw}/view`, 37: idPdfSw }));
  x.sheets.lama['Rekap Gardu'] = buat('Rekap Gardu', rk);
  x.sheets.lama['Rekap Switching'] = buat('Rekap Switching', sw);
  gg.SpreadsheetApp = { openById: (i) => ({
    getSheetByName: (n) => x.sheets[i][n],
    insertSheet: (n) => { const sh = buat(n, [[]]); sh.clearContents = () => { sh.data.length = 0; }; x.sheets[i][n] = sh; return sh; },
  }) };
  const sebelumRk = JSON.stringify(rk), sebelumRekapBa = JSON.stringify(x.sheets.g.Rekap_BA.data);

  // pratinjau: tidak menulis
  const cek = JSON.parse(JSON.stringify(gg.ADMIN_cekArsipBa()));
  assert.deepStrictEqual([cek.jumlah, cek.perTahap, cek.ganda], [5, { DRAFT: 2, PROSES_TTD: 2, SELESAI_TTD: 1 }, ['BA-GRD-TBL-202503-001']]);
  assert.strictEqual(x.sheets.g.arsip_BA_V1, undefined, 'cek tidak membuat sheet');
  const kosongArsip = gg.getDaftarBaGardu_(x.admin, { sumber: 'SEMUA' });
  assert.deepStrictEqual([kosongArsip.arsipAda, kosongArsip.jumlah], [false, 1], 'belum dimigrasi = hanya BA v2, bukan error');

  // tulis
  assert.strictEqual(gg.ADMIN_migrasiArsipBa().ditulis, 5);
  const sh = x.sheets.g.arsip_BA_V1;
  assert.deepStrictEqual(sh.data[0], [...gg.ARSIP_BA_HEADER_]);
  assert.strictEqual(sh.data.length, 6);
  assert.strictEqual(JSON.stringify(rk), sebelumRk, 'Rekap Gardu lama tidak disentuh');
  assert.strictEqual(JSON.stringify(x.sheets.g.Rekap_BA.data), sebelumRekapBa, 'Rekap_BA v2 tidak disentuh');
  assert.ok(x.sheets.a.log_Audit.data.some((b) => b[4] === 'ARSIP_BA_V1'));
  const idPertama = sh.data.slice(1).map((b) => b[0]);
  assert.strictEqual(gg.ADMIN_migrasiArsipBa().ditulis, 5, 'diulang = ditulis ulang utuh');
  assert.deepStrictEqual(sh.data.slice(1).map((b) => b[0]), idPertama, 'arsip_id tetap (deterministik)');
  assert.strictEqual(sh.data.length, 6, 'tidak menumpuk');

  // daftar arsip (sumber V1): terbaru dulu, tahap, gardu_id
  const d = (f) => JSON.parse(JSON.stringify(gg.getDaftarBaGardu_(x.admin, { sumber: 'V1', ...f })));
  const semua = d({});
  assert.strictEqual(semua.arsipAda, true);
  assert.ok(semua.isi.every((b) => b.arsip === true && b.baId === '' && b.pdfBisa === false && b.statusBa === 'ARSIP'), 'arsip = baca saja');
  assert.deepStrictEqual(semua.isi.map((b) => b.noGardu), semua.isi.map((b) => b.nama));
  assert.deepStrictEqual(semua.isi.map((b) => [b.nama, b.tanggalBa, b.tahap]), [
    ['LBS Kampung Baru', '2025-08-01', 'PROSES_TTD'], ['TB0421', '2025-06-10', 'PROSES_TTD'], ['TB0002', '2025-04-01', 'DRAFT'],
    ['TB0002', '2025-03-05', 'DRAFT'], ['TB0002', '2025-03-05', 'SELESAI_TTD']]);
  const b1 = semua.isi[4];
  assert.deepStrictEqual([b1.peralatan, b1.idBa, b1.noBaFull, b1.kva, b1.adaPdf, b1.adaTtd, b1.penyulang, b1.alamat, b1.waktuPdf],
    ['TRAFO', 'BA-GRD-TBL-202503-001', 'No. 001 / BA - TRF / ULP - TBL / 3 / 2025', 100, true, true, 'TB-01', 'Jl. Lama', '2025-03-05 10:00:00']);
  assert.ok(b1.garduId, 'TB0002 ada di db_Gardu');
  assert.deepStrictEqual([semua.isi[1].garduId, semua.isi[1].adaPdf], ['', true], 'TB0421 tidak di db_Gardu tetap diarsip, id PDF dari link ?id=');
  assert.deepStrictEqual([semua.isi[0].peralatan, semua.isi[0].jenisSwitching, semua.isi[0].idBa], ['SWITCHING', 'LBS', 'BA-SWT-TBL-202508-001']);
  assert.deepStrictEqual(semua.ringkasan, { DRAFT: 2, PROSES_TTD: 2, TTD_ULANG: 0, SELESAI_TTD: 1, BATAL: 0 });
  assert.deepStrictEqual([b1.statusPdf, b1.statusPdfV1, b1.statusTtd], ['SELESAI', 'SELESAI', 'SUDAH TTD']);
  // tracking: cari no gardu ditulis bebas (tb2 = TB0002), ID BA, filter
  assert.deepStrictEqual(d({ cari: 'tb2' }).isi.map((b) => b.jenis), ['Pemeriksaan Trafo', 'Pengoperasian Trafo', 'Pengoperasian Trafo']);
  assert.strictEqual(d({ cari: 'TB-0421' }).jumlah, 1);
  assert.strictEqual(d({ cari: '202508' }).isi[0].peralatan, 'SWITCHING');
  const tt = d({ tahap: 'SELESAI_TTD' });
  assert.deepStrictEqual([tt.jumlah, tt.ringkasan.DRAFT], [1, 2], 'ringkasan dihitung sebelum filter tahap');
  assert.deepStrictEqual(d({ jenis: 'Pengoperasian Trafo' }).jumlah, 2);
  assert.deepStrictEqual(d({ urut: 'TERLAMA', mulai: 1, batas: 2 }).isi.map((b) => b.tanggalBa), ['2025-03-05', '2025-04-01']);
  assert.deepStrictEqual(d({ dari: '2025-06-01', sampai: '2025-07-01' }).isi.map((b) => b.nama), ['TB0421']);
  // satu halaman: SEMUA = BA v2 + arsip v1, urut tanggal; V2 (default, app lama) tanpa arsip
  const gab = JSON.parse(JSON.stringify(gg.getDaftarBaGardu_(x.admin, { sumber: 'SEMUA', urut: 'TERLAMA' })));
  assert.strictEqual(gab.jumlah, 6);
  assert.deepStrictEqual(gab.isi.map((b) => !!b.arsip), [false, true, true, true, true, true], 'BA v2 tanpa Tanggal BA paling atas saat terlama');
  assert.strictEqual(gg.getDaftarBaGardu_(x.admin, {}).jumlah, 1, 'tanpa sumber = hanya v2 (app lama)');
  assert.strictEqual(gg.getDaftarBaGardu_(x.admin, {}).arsipAda, false);
  assert.strictEqual(kodeError(() => gg.getDaftarBaGardu_({ ...x.admin, role: 'PETUGAS' }, { sumber: 'V1' })), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => gg.getDaftarBaGardu_(x.admin, { sumber: 'LAIN' })), 'PILIHAN_TIDAK_VALID');

  // file lama lewat server (Drive dibaca server, HP tanpa akses Drive)
  const pdfBytes = [...Buffer.from('%PDF-1.4 arsip')], pngBytes = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2];
  const file = (nama, bytes) => ({ getName: () => nama, getBlob: () => ({ getBytes: () => bytes }) });
  const isiDrive = { [idPdf1]: file('BA-Pengoperasian-TB0002.pdf', pdfBytes), [idTtd1]: file('TTD.png', pngBytes), [idPdf2]: file('rusak.pdf', [1, 2, 3, 4, 5]) };
  gg.DriveApp = { getFileById: (id) => { if (!isiDrive[id]) throw new Error('tidak ada'); return isiDrive[id]; } };
  const f = gg.getFileArsipBaGardu_(x.admin, { arsipId: b1.arsipId, berkas: 'PDF' });
  assert.deepStrictEqual([f.mime, f.namaFile, f.ukuranByte, Buffer.from(f.data, 'base64').toString().slice(0, 4)], ['application/pdf', 'BA-Pengoperasian-TB0002.pdf', pdfBytes.length, '%PDF']);
  assert.match(f.url, /\/file\/d\//);
  assert.strictEqual(gg.getFileArsipBaGardu_(x.admin, { arsipId: b1.arsipId, berkas: 'TTD' }).mime, 'image/png');
  assert.strictEqual(kodeError(() => gg.getFileArsipBaGardu_(x.admin, { arsipId: semua.isi[1].arsipId, berkas: 'TTD' })), 'ARSIP_FILE_TIDAK_ADA');
  assert.strictEqual(kodeError(() => gg.getFileArsipBaGardu_(x.admin, { arsipId: semua.isi[1].arsipId, berkas: 'PDF' })), 'FORMAT_FILE_SALAH');
  assert.strictEqual(kodeError(() => gg.getFileArsipBaGardu_(x.admin, { arsipId: semua.isi[0].arsipId, berkas: 'PDF' })), 'ARSIP_FILE_TIDAK_ADA', 'file Drive tidak bisa dibuka');
  assert.strictEqual(kodeError(() => gg.getFileArsipBaGardu_(x.admin, { arsipId: U(), berkas: 'PDF' })), 'ARSIP_BA_TIDAK_ADA');
  assert.strictEqual(kodeError(() => gg.getFileArsipBaGardu_({ ...x.admin, role: 'ADMIN_ES' }, { arsipId: b1.arsipId, berkas: 'PDF' })), 'AKSES_DITOLAK');
  // judul arsip diubah manual = ditolak, jalankan ulang migrasi
  sh.data[0][1] = 'Asal';
  assert.strictEqual(kodeError(() => gg.getDaftarBaGardu_(x.admin, { sumber: 'SEMUA' })), 'ARSIP_BA_RUSAK');
  assert.strictEqual(gg.getDaftarBaGardu_(x.admin, {}).jumlah, 1, 'BA v2 tetap jalan walau arsip rusak');
});

// ---------- v0.86.0-fix2: perbaikan temuan audit guard 13 Okt 2026 ----------
test('fix2 temuan 1: token akun nonaktif ditolak dan DIINGAT (tidak baca sheet lagi); ADMIN_bersihkanCache membukanya', () => {
  const { gl, log, sheets } = konteksLogin();
  const r = gl.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026' }, 'MOBILE');
  const cache = gl.CacheService.getScriptCache();
  const hash = gl.sha256Hex_(r.token);
  sheets.m.db_Users.data[1][5] = false;           // admin menonaktifkan akun
  cache.remove('sesi:' + hash);                   // cache sesi 5 menit habis
  assert.strictEqual(kodeError(() => gl.sesiDariToken_(r.token)), 'AKUN_NONAKTIF');
  log.length = 0;
  for (let i = 0; i < 20; i++) assert.strictEqual(kodeError(() => gl.sesiDariToken_(r.token)), 'AKUN_NONAKTIF');
  assert.strictEqual(log.length, 0, 'penolakan diingat: tidak ada baca sheet sama sekali');
  assert.strictEqual(kodeError(() => gl.proses_({ action: 'cekSesi', token: r.token }, 'MOBILE')), 'AKUN_NONAKTIF');
  // akun diaktifkan lagi + ADMIN_bersihkanCache (epoch naik) = penolakan lama diabaikan
  sheets.m.db_Users.data[1][5] = true;
  gl.ADMIN_bersihkanCache();
  assert.strictEqual(gl.sesiDariToken_(r.token).userId, 'u1');
});

test('fix2 temuan 1: tim nonaktif juga diingat; kode lama tanpa epoch tetap terbaca', () => {
  const { gl, log, sheets } = konteksLogin();
  const r = gl.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026' }, 'MOBILE');
  const cache = gl.CacheService.getScriptCache();
  const hash = gl.sha256Hex_(r.token);
  sheets.m.db_Tim.data[1][4] = false;
  cache.remove('sesi:' + hash);
  assert.strictEqual(kodeError(() => gl.sesiDariToken_(r.token)), 'TIM_NONAKTIF');
  log.length = 0;
  assert.strictEqual(kodeError(() => gl.sesiDariToken_(r.token)), 'TIM_NONAKTIF');
  assert.strictEqual(log.length, 0);
  cache.put('sesi-tolak:' + hash, 'SESI_DICABUT', 300);   // format lama (sebelum fix2)
  assert.strictEqual(kodeError(() => gl.sesiDariToken_(r.token)), 'SESI_DICABUT');
});

test('fix2 temuan 4: cache sesi / aturan akses korup dibuang lalu dibaca ulang dari sheet (bukan KESALAHAN_SERVER)', () => {
  const { gl, sheets } = konteksLogin();
  const r = gl.login_(null, { username: '16130.uji.row01', password: 'Rahasia-Toboali-2026' }, 'MOBILE');
  const cache = gl.CacheService.getScriptCache();
  cache.put('sesi:' + gl.sha256Hex_(r.token), '{bukan json', 300);
  assert.strictEqual(gl.sesiDariToken_(r.token).userId, 'u1', 'baca ulang sheet');
  assert.ok(JSON.parse(cache.get('sesi:' + gl.sha256Hex_(r.token))).userId === 'u1', 'cache diganti yang sehat');
  // token yang sudah dicabut di sheet TIDAK hidup lagi lewat cache korup
  sheets.a.auth_Perangkat.data[1][8] = new Date().toISOString();
  gl.hapusSesiCache_(gl.sha256Hex_(r.token));
  cache.put('sesi:' + gl.sha256Hex_(r.token), '[[[', 300);
  assert.strictEqual(kodeError(() => gl.sesiDariToken_(r.token)), 'SESI_DICABUT', 'fail closed');
  cache.put('akses:v1', 'rusak{', 300);
  assert.ok(gl.aturanAkses_().menu.ROW_EKSEKUSI, 'aturan akses dibaca ulang');
  cache.put('akses:v1', '{"x":1}', 300);
  assert.ok(gl.aturanAkses_().menu.ROW_EKSEKUSI, 'bentuk salah juga dibaca ulang');
});

test('fix2 temuan 6: endpoint publik tidak punya flag tulis (hanya endpoint bersesi yang memakainya)', () => {
  const ep = g.endpoints_();
  for (const k of Object.keys(ep).filter((n) => ep[n].publik)) assert.strictEqual(ep[k].tulis, undefined, k);
});

// ---------- v0.87.0: inputan Hartek petugas (modules/71_Hartek.js) ----------
function x0() { return buatKonteks({ ...PROPS }); }

function konteksHartek() {
  const h = buatKonteks({ ...PROPS, HARTEK_SHEET_ID: 'h', GARDU_SHEET_ID: 'g', KODE_ULP: '16130' });
  const log = [];
  const buat = sheetPalsu(log);
  const sheets = { h: {}, g: {}, a: {} };
  for (const [nama, hdr] of Object.entries(h.HARTEK_HEADER_)) {
    sheets.h[nama] = buat(nama, [hdr.slice()]);
  }
  sheets.g.db_Gardu = buat('db_Gardu', [['No Gardu', 'gardu_id', 'Penyulang', 'Section', 'Alamat'], ['TB0001', 'gar-1', 'PNY-A', 'SEC-1', 'Jl. Merdeka'], ['TB0002', 'gar-2', 'PNY-A', 'SEC-1', 'Jl. Lain']]);
  sheets.a.log_Audit = buat('log_Audit', [['waktu', 'user_id', 'username', 'role', 'aksi', 'target', 'detail', 'platform', 'device_id']]);
  sheets.m = { db_Jaringan: buat('db_Jaringan', [['section_id', 'penyulang', 'section', 'parent_section_id', 'urutan', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'], ['j1', 'PNY-A', 'SEC-1', '', 1, true, 1, '', ''], ['j2', 'PNY-A', 'SEC-2', '', 2, true, 1, '', ''], ['j3', 'PNY-B', 'SEC-X', '', 1, false, 1, '', '']]) };
  sheets.m.db_Material = buat('db_Material', [h.HARTEK_MASTER_HEADER_.db_Material.slice(), [1, 'Kabel NYY', 'm', true, 'mat-1', 1, '', ''], [2, 'Tiang Beton', 'btg', false, 'mat-2', 1, '', '']]);
  sheets.m.db_Kepemilikan_Material = buat('db_Kepemilikan_Material', [h.HARTEK_MASTER_HEADER_.db_Kepemilikan_Material.slice(), [1, 'PLN', true, 'kep-1', 1, '', ''], [2, 'Pelanggan', true, 'kep-2', 1, '', '']]);
  // v0.91.0: pekerjaan Hartek dari db_Jenis_Pekerjaan modul HARTEK
  sheets.m.db_Jenis_Pekerjaan = buat('db_Jenis_Pekerjaan', [['jenis_id', 'modul', 'nama', 'satuan', 'diameter_min', 'diameter_max', 'urutan', 'aktif', 'bobot'],
    ['jh2', 'HARTEK', 'Ganti Arrester', 'buah', '', '', 2, true, ''], ['jh1', 'HARTEK', 'Pemerataan Beban Gardu', 'unit', '', '', 1, true, ''],
    ['jh3', 'HARTEK', 'Ganti Isolator', 'buah', '', '', 3, false, ''], ['jr1', 'ROW', 'Rabas / Pangkas', 'pohon', 0, 0, 1, true, ''],
    // v0.97.0: pekerjaan grounding (perbaikan = sebelum + sesudah, pasang = hanya sesudah)
    ['jh4', 'HARTEK', 'Perbaikan Grounding', 'titik', '', '', 4, true, ''], ['jh5', 'HARTEK', 'Pasang Grounding', 'titik', '', '', 5, true, '']]);
  const pilih = { h: 'h', g: 'g', a: 'a', m: 'm' };
  h.SpreadsheetApp = { openById: (id) => { const bag = sheets[Object.keys(pilih).find((k) => pilih[k] === id)]; return { getSheetByName: (n) => bag[n] || null, insertSheet: (n) => { bag[n] = buat(n, [[]]); return bag[n]; } }; } };
  h.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  const hariIni = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const sesi = { userId: 'u-hartek', username: '16130.hartek01', role: 'PETUGAS', jenisTim: 'HARTEK', timId: 'tim-h1', timNama: 'HARTEK 01', deviceId: 'dev1' };
  return { h, sheets, sesi, hariIni, log };
}

test('hartek: buat header hari ini (kode HAR-<ULP><YYMMDD>001); kedua kali = LAPORAN_UTAMA_SUDAH_DIBUAT (tanpa pengecualian); tim lain bebas', () => {
  const x = konteksHartek();
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  assert.strictEqual(a.duplikat, false);
  assert.match(a.kodeHeader, /^HAR-16130\d{6}001$/);
  assert.strictEqual(a.kodeHeader.slice(-9, -3), x.hariIni.slice(2, 4) + x.hariIni.slice(5, 7) + x.hariIni.slice(8, 10));
  assert.strictEqual(kodeError(() => x.h.buatHeaderHartek_(x.sesi, {})), 'LAPORAN_UTAMA_SUDAH_DIBUAT', 'pembuatan ulang langsung ditolak');
  // v0.95.0: ID sama = kiriman ulang dari antrean HP (jawaban server hilang), bukan pembuatan ulang: berhasil tanpa baris baru
  const ulang = x.h.buatHeaderHartek_(x.sesi, { headerId: a.headerId });
  assert.deepStrictEqual([ulang.duplikat, ulang.headerId, ulang.kodeHeader], [true, a.headerId, a.kodeHeader]);
  assert.strictEqual(kodeError(() => x.h.buatHeaderHartek_(x.sesi, { headerId: '0c0c0c0c-0000-4000-8000-000000000001' })), 'LAPORAN_UTAMA_SUDAH_DIBUAT', 'perangkat sama, header lain: tetap ditolak');
  assert.strictEqual(x.sheets.h.db_Hartek_Header.data.length, 2, 'hanya 1 baris header');
  const lain = { ...x.sesi, userId: 'u2', timId: 'tim-h2' };
  assert.notStrictEqual(x.h.buatHeaderHartek_(lain, {}).headerId, a.headerId, 'tim lain = header sendiri');
  // perangkat BEDA tim yang sama: digabung, isian kosong diisi, header tetap satu
  const hp2 = { ...x.sesi, deviceId: 'dev2', userId: 'u-hartek-2' };
  const g = x.h.buatHeaderHartek_(hp2, { kmAwal: 7, kendala: 'hujan' });
  assert.deepStrictEqual([g.digabung, g.headerId], [true, a.headerId], 'digabung ke header yang sama');
  const kol = x.h.HARTEK_HEADER_.db_Hartek_Header;
  assert.deepStrictEqual([x.sheets.h.db_Hartek_Header.data[1][kol.indexOf('km_awal')], x.sheets.h.db_Hartek_Header.data[1][kol.indexOf('kendala')]], ['', ''], 'koordinat/KM/kendala tetap dari permintaan pertama');
  const pgGabung = x.h.simpanPgHartek_(hp2, { headerId: a.headerId, jenisPekerjaan: 'Jaringan', penyulang: 'PNY-A', section: 'SEC-2', daerah: 'Toboali', jumlahGawang: 3 });
  assert.strictEqual(pgGabung.kodePg, a.kodeHeader + '-PNY.001', 'data perangkat kedua masuk ke header yang sama');
  assert.strictEqual(x.sheets.h.db_Hartek_Header.data.length, 3, 'tidak ada header baru selain tim 2');
});

test('hartek: ubah header (revision, KM, kepemilikan, hanya AKTIF dan hari ini)', () => {
  const x = konteksHartek();
  const a = x.h.buatHeaderHartek_(x.sesi, { kmAwal: 10, kmAkhir: 12, koordinatAwal: undefined });
  assert.strictEqual(kodeError(() => x.h.ubahHeaderHartek_(x.sesi, { headerId: a.headerId, revision: 1, kmAwal: 20, kmAkhir: 5 })), 'KM_AKHIR_KURANG');
  assert.strictEqual(kodeError(() => x.h.ubahHeaderHartek_(x.sesi, { headerId: a.headerId, revision: 9, kendala: 'hujan' })), 'KONFLIK_REVISION');
  assert.strictEqual(kodeError(() => x.h.ubahHeaderHartek_({ ...x.sesi, timId: 'tim-lain' }, { headerId: a.headerId, revision: 1, kendala: 'x' })), 'BUKAN_MILIK_TIM');
  const u = x.h.ubahHeaderHartek_(x.sesi, { headerId: a.headerId, revision: 1, kendala: 'hujan' });
  assert.strictEqual(u.revision, 2);
  const kol = x.h.HARTEK_HEADER_.db_Hartek_Header;
  const baris = x.sheets.h.db_Hartek_Header.data[1];
  assert.strictEqual(baris[kol.indexOf('kendala')], 'hujan');
  assert.strictEqual(baris[kol.indexOf('revision')], 2);
  assert.strictEqual(kodeError(() => x.h.ubahHeaderHartek_(x.sesi, { headerId: a.headerId, revision: 2 })), 'FIELD_WAJIB', 'tanpa perubahan = ditolak');
});

test('v0.88.2: cekKonfigHartek_ dilewati kalau HARTEK_SHEET_ID kosong; dengan konteks uji tab dan material dicek', () => {
  const tangkap = (fn) => {
    const log = [], asli = { log: console.log, warn: console.warn, error: console.error };
    console.log = (m) => log.push(m); console.warn = (m) => log.push(m); console.error = (m) => log.push(m);
    let n;
    try { n = fn(); } finally { console.log = asli.log; console.warn = asli.warn; console.error = asli.error; }
    return { n, log: log.join('\n') };
  };
  assert.match(tangkap(() => x0().cekKonfigHartek_({})).log, /\[DILEWATI\]\s+HARTEK_SHEET_ID kosong/);
  assert.strictEqual(tangkap(() => x0().cekKonfigHartek_({})).n, 0);
  const x = konteksHartek();
  const r = tangkap(() => x.h.cekKonfigHartek_(x.h.cfg_()));
  assert.match(r.log, /\[OK\]\s+db_Hartek_Header \(0 baris\)/);
  assert.match(r.log, /db_Material \(SiSi_Master\): 1 material aktif/);
  assert.match(r.log, /db_Jaringan \(SiSi_Master\)/);
  assert.strictEqual(typeof r.n, 'number');
});

test('hartek: getHartekHarian mengirim revision dan isi header (dipakai layar HP untuk ubah)', () => {
  const x = konteksHartek();
  const a = x.h.buatHeaderHartek_(x.sesi, { kmAwal: 10, kmAkhir: 12, kendala: 'cerah' });
  x.h.ubahHeaderHartek_(x.sesi, { headerId: a.headerId, revision: 1, kendala: 'hujan' });
  const r = x.h.getHartekHarian_(x.sesi, {});
  assert.strictEqual(r.header.headerId, a.headerId);
  assert.deepStrictEqual([r.header.revision, r.header.kmAwal, r.header.kmAkhir, r.header.kendala], [2, 10, 12, 'hujan']);
  x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Jaringan', penyulang: 'PNY-A', section: 'SEC-1', daerah: 'Toboali', jumlahGawang: 6 });
  assert.strictEqual(x.h.getHartekHarian_(x.sesi, {}).objek[0].jumlahGawang, 6, 'v0.89.0: jumlah gawang ikut dikirim ke HP');
});

test('hartek: penolakan peran, tim, dan tanggal (PETUGAS ROW / ADMIN / tanpa tim)', () => {
  const x = konteksHartek();
  assert.strictEqual(kodeError(() => x.h.buatHeaderHartek_({ ...x.sesi, jenisTim: 'ROW' }, {})), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.h.buatHeaderHartek_({ ...x.sesi, role: 'ADMIN' }, {})), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.h.getMaterialHartek_({ ...x.sesi, timId: '' })), 'AKSES_DITOLAK');
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  assert.strictEqual(kodeError(() => x.h.simpanPgHartek_({ ...x.sesi, timId: 'tim-lain' }, { headerId: a.headerId, jenisPekerjaan: 'Jaringan', penyulang: 'P', section: 'S' })), 'BUKAN_MILIK_TIM');
  // header kemarin tidak boleh diisi petugas
  const kolHdr = x.h.HARTEK_HEADER_.db_Hartek_Header;
  const kemarin = x.sheets.h.db_Hartek_Header.data[1].slice();
  // v0.93.1: tanggal dibaca dari kode_header (sumber utama), jadi header lama = kode + tanggal lama
  x.sheets.h.db_Hartek_Header.data[1][kolHdr.indexOf('tanggal')] = '2000-01-01';
  x.sheets.h.db_Hartek_Header.data[1][kolHdr.indexOf('kode_header')] = 'HAR-16130000101001';
  assert.strictEqual(kodeError(() => x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Jaringan', penyulang: 'P', section: 'S' })), 'TANGGAL_DI_LUAR_BATAS');
  x.sheets.h.db_Hartek_Header.data[1] = kemarin;
});

test('hartek: PG jaringan (PNY) butuh penyulang+section; PG gardu (GRD) ambil data dari db_Gardu; gardu tidak dikenal ditolak', () => {
  const x = konteksHartek();
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  assert.strictEqual(kodeError(() => x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Jaringan', penyulang: 'P' })), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Jaringan', penyulang: 'PNY-X', section: 'SEC-1' })), 'PENYULANG_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Jaringan', penyulang: 'PNY-A', section: 'SEC-9' })), 'SECTION_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Jaringan', penyulang: 'PNY-B', section: 'SEC-X' })), 'PENYULANG_TIDAK_VALID', 'db_Jaringan nonaktif');
  const j = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Jaringan', penyulang: 'PNY-A', section: 'SEC-2', daerah: 'Toboali', jumlahGawang: 4 });
  assert.strictEqual(j.kodePg, a.kodeHeader + '-PNY.001');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(x.h.getJaringanHartek_(x.sesi).penyulang)), [{ nama: 'PNY-A', section: ['SEC-1', 'SEC-2'] }], 'dropdown dari db_Jaringan aktif');
  const g = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'tb0001' });
  assert.strictEqual(g.kodePg, a.kodeHeader + '-GRD.001');
  const row = x.sheets.h.db_Hartek_PenyulangGardu.data[2];
  const kol = x.h.HARTEK_HEADER_.db_Hartek_PenyulangGardu;
  assert.deepStrictEqual([row[kol.indexOf('penyulang')], row[kol.indexOf('section')], row[kol.indexOf('gardu_id')], row[kol.indexOf('daerah')]], ['PNY-A', 'SEC-1', 'gar-1', 'Jl. Merdeka']);
  assert.strictEqual(kodeError(() => x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB9999' })), 'GARDU_TIDAK_ADA');
  const ntk = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Non - Teknik', noGardu: 'TB0001' });
  assert.strictEqual(ntk.kodePg, a.kodeHeader + '-NTK.001');
});

test('hartek: pekerjaan, material (dari master aktif), grounding, dan pemerataan (hanya jenis beban gardu) berantai kodenya', () => {
  const x = konteksHartek();
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  const pg = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0001' });
  const pk = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, pekerjaan: 'Pemerataan Beban Gardu', jumlahPekerjaan: 1, satuanPekerjaan: 'unit' });
  assert.strictEqual(pk.kodePekerjaan, pg.kodePg + '-PKJ.001');
  const mt = x.h.simpanMaterialHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, material: 'kabel nyy', jumlah: 20, satuan: 'm', kepemilikan: 'PLN' });
  assert.strictEqual(mt.kodeMaterial, pk.kodePekerjaan + '-MAT.001');
  assert.strictEqual(x.sheets.h.db_Hartek_Material.data[1][x.h.HARTEK_HEADER_.db_Hartek_Material.indexOf('material')], 'Kabel NYY', 'nama dari master');
  assert.strictEqual(kodeError(() => x.h.simpanMaterialHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, material: 'Tiang Beton', jumlah: 1, kepemilikan: 'PLN' })), 'MATERIAL_TIDAK_VALID', 'master nonaktif');
  assert.strictEqual(kodeError(() => x.h.simpanMaterialHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, material: 'Bukan Ada', jumlah: 1, kepemilikan: 'PLN' })), 'MATERIAL_TIDAK_VALID');
  const pm = x.h.simpanPemerataanHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, sebR: 40, sebS: 35, sebT: 30, sesR: 35, sesS: 35, sesT: 35 });
  assert.strictEqual(pm.kodePemerataan, pk.kodePekerjaan + '-PMR.001');
  const lain = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, pekerjaan: 'Perbaikan Grounding', jumlahPekerjaan: 1 });
  assert.strictEqual(kodeError(() => x.h.simpanPemerataanHartek_(x.sesi, { pekerjaanId: lain.pekerjaanId, sebR: 1, sebS: 1, sebT: 1, sesR: 1, sesS: 1, sesT: 1 })), 'PEKERJAAN_TIDAK_SESUAI');
  // v0.97.0: rincian grounding hanya untuk pekerjaan yang namanya mengandung "grounding"
  const gr = x.h.simpanGroundingHartek_(x.sesi, { pekerjaanId: lain.pekerjaanId, jenisPeralatan: 'Arrester', hasilSebelum: 5, hasilSesudah: 2 });
  assert.strictEqual(gr.kodeGrounding, lain.kodePekerjaan + '-GND.001');
  assert.strictEqual(kodeError(() => x.h.simpanGroundingHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, jenisPeralatan: 'Arrester', hasilSebelum: 5, hasilSesudah: 2 })), 'PEKERJAAN_TIDAK_SESUAI');
  const pohon = x.h.getHartekHarian_(x.sesi, {});
  assert.strictEqual(pohon.objek.length, 1);
  assert.strictEqual(pohon.objek[0].pekerjaan.length, 2);
  assert.strictEqual(pohon.objek[0].pekerjaan[0].material.length, 1);
  assert.strictEqual(pohon.objek[0].pekerjaan[0].grounding.length, 0, 'pemerataan beban gardu tidak punya rincian grounding');
  assert.strictEqual(pohon.objek[0].pekerjaan[1].grounding.length, 1);
  assert.strictEqual(pohon.objek[0].pekerjaan[0].pemerataan.length, 1);
  // v0.95.0: HP menggabungkan data lokal dengan server per ID baris
  assert.strictEqual(pohon.objek[0].pekerjaan[0].material[0].idBaris, mt.materialId);
  assert.strictEqual(pohon.objek[0].pekerjaan[1].grounding[0].idBaris, gr.groundingId);
  assert.strictEqual(pohon.objek[0].pekerjaan[0].pemerataan[0].idBaris, pm.pemerataanId);
});

test('hartek: ADMIN_siapkanSheetHartek hanya untuk admin (pemilik), dan endpoint Hartek tulis butuh menu UBAH', () => {
  const x = konteksHartek();
  assert.ok(x.h.endpoints_().simpanPgHartek.tulis === true && x.h.endpoints_().getMaterialHartek.tulis === undefined);
  assert.ok(typeof x.h.ADMIN_siapkanSheetHartek === 'function');
});

test('v0.88.3: ADMIN_siapkanSheetHartek membuat db_Material di SiSi_Master dan 6 tab di SiSi_Hartek (idempoten)', () => {
  const x = konteksHartek();
  // tab yang belum ada dibuat dengan header persis, tab yang sudah ada hanya dicek
  const dibuat = {};
  const fake = {
    getSheetByName: () => null,
    insertSheet: (nama) => ({ getRange: () => ({ setValues: (v) => { dibuat[nama] = v[0]; } }), setFrozenRows() {} })
  };
  const asli = { log: console.log, err: console.error };
  const log = [];
  console.log = (m) => log.push(String(m)); console.error = (m) => log.push(String(m));
  try {
    x.h.siapkanTabHartek_(fake, 'db_Material', x.h.HARTEK_MASTER_HEADER_.db_Material, 'SiSi_Master > ');
    x.h.ADMIN_siapkanSheetHartek();
  } finally { console.log = asli.log; console.error = asli.err; }
  assert.strictEqual(JSON.stringify(dibuat.db_Material), JSON.stringify(x.h.HARTEK_MASTER_HEADER_.db_Material));
  assert.ok(log.some((m) => /SiSi_Master > db_Material: struktur OK/.test(m)), log.join('\n'));
  assert.ok(log.some((m) => /SiSi_Hartek > db_Hartek_Header: struktur OK/.test(m)), log.join('\n'));
  assert.ok(!('db_Material' in x.h.HARTEK_HEADER_), 'db_Material tidak lagi dibuat di SiSi_Hartek');
});

test('hartek: setiap endpoint Hartek lewat guard_ (token, menu, lalu peran HARTEK di fungsi)', () => {
  const x = konteksHartek();
  const ep = x.h.endpoints_();
  const hartek = Object.keys(ep).filter((k) => ep[k].menu === 'OPS_HARTEK_INPUT');
  assert.ok(hartek.length >= 9, 'semua endpoint Hartek terdaftar: ' + hartek.join(','));
  // 1) token tidak valid = ditolak guard
  for (const k of hartek) assert.strictEqual(kodeError(() => x.h.proses_({ action: k, token: 'bukan-token', data: {} }, 'MOBILE')), 'SESI_TIDAK_VALID', k + ' tanpa token');
  // 2) menu OPS_HARTEK_INPUT diberikan ke ADMIN dan PETUGAS ROW: guard lolos, fungsi tetap menolak (peran HARTEK)
  x.h.aturanAkses_ = () => ({
    menu: { OPS_HARTEK_INPUT: { kode: 'OPS_HARTEK_INPUT', platform: 'MOBILE', aktif: true, khususSuper: false } },
    akses: [{ role: 'ADMIN', jenisTim: '*', menu: '*', aksi: 'UBAH' }, { role: 'PETUGAS', jenisTim: 'ROW', menu: 'OPS_HARTEK_INPUT', aksi: 'UBAH' }],
  });
  const tokenValid = 'a'.repeat(64);
  for (const peran of [{ ...x.sesi, role: 'ADMIN', jenisTim: '' }, { ...x.sesi, jenisTim: 'ROW' }]) {
    x.h.sesiDariToken_ = () => peran;
    for (const k of hartek) {
      const data = { headerId: '00000000-0000-4000-8000-000000000000', pgId: '00000000-0000-4000-8000-000000000000', pekerjaanId: '00000000-0000-4000-8000-000000000000' };
      assert.strictEqual(kodeError(() => x.h.proses_({ action: k, token: tokenValid, data }, 'MOBILE')), 'AKSES_DITOLAK', k + ' peran ' + peran.role + '/' + peran.jenisTim);
    }
  }
  // 3) menu MOBILE tidak boleh dari web
  x.h.sesiDariToken_ = () => x.sesi;
  for (const k of hartek) assert.strictEqual(kodeError(() => x.h.proses_({ action: k, token: tokenValid, data: {} }, 'WEB')), 'AKSES_DITOLAK', k + ' dari web');
  // 4) petugas HARTEK di menu tanpa baris UBAH = tulis ditolak; baca boleh
  x.h.aturanAkses_ = () => ({
    menu: { OPS_HARTEK_INPUT: { kode: 'OPS_HARTEK_INPUT', platform: 'MOBILE', aktif: true, khususSuper: false } },
    akses: [{ role: 'PETUGAS', jenisTim: 'HARTEK', menu: 'OPS_HARTEK_INPUT', aksi: 'LIHAT' }],
  });
  assert.strictEqual(kodeError(() => x.h.proses_({ action: 'buatHeaderHartek', token: tokenValid, data: {} }, 'MOBILE')), 'AKSES_DITOLAK', 'LIHAT tidak boleh tulis');
  assert.ok(x.h.proses_({ action: 'getMaterialHartek', token: tokenValid, data: {} }, 'MOBILE').data.material.length >= 1, 'LIHAT boleh baca');
});

test('hartek: struktur db_Hartek_Header sesuai kvlar 13 Okt 2026 (WA Text di header, tanpa Sub-Tim)', () => {
  const g = buatKonteks({ ...PROPS });
  assert.deepStrictEqual([...g.HARTEK_HEADER_.db_Hartek_Header], ['nomor', 'kode_header', 'ulp', 'hari', 'tanggal', 'tim', 'koordinat_awal', 'koordinat_akhir', 'km_awal', 'km_akhir', 'kendala', 'wa_text', 'timestamp', 'input_by', 'timestamp_update', 'header_id', 'tim_id', 'status', 'revision', 'dibuat_oleh', 'waktu_perangkat', 'diubah_oleh']);
  assert.deepStrictEqual([...g.HARTEK_HEADER_.db_Hartek_PenyulangGardu].slice(0, 3), ['nomor', 'kode_header', 'kode_pg']);
  for (const k of ['db_Hartek_PenyulangGardu', 'db_Hartek_Pekerjaan', 'db_Hartek_Material', 'db_Hartek_Grounding', 'db_Hartek_PemerataanBeban']) assert.strictEqual(g.HARTEK_HEADER_[k][0], 'nomor', k);
  assert.ok(!('db_Material' in g.HARTEK_HEADER_), 'db_Material ada di SiSi_Master, bukan SiSi_Hartek');
  assert.strictEqual(g.HARTEK_MASTER_HEADER_.db_Material[0], 'nomor');
  assert.ok(!g.HARTEK_HEADER_.db_Hartek_PenyulangGardu.includes('wa_text') && g.HARTEK_HEADER_.db_Hartek_PenyulangGardu.includes('timestamp_update'));
});

test('hartek: baris header yang ditulis mengikuti layout row_Header (Hartek, nama kolom)', () => {
  const x = konteksHartek();
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  const kol = x.h.HARTEK_HEADER_.db_Hartek_Header;
  const baris = x.sheets.h.db_Hartek_Header.data[1];
  const nilai = (k) => baris[kol.indexOf(k)];
  assert.strictEqual(nilai('header_id'), a.headerId);
  assert.strictEqual(nilai('kode_header'), a.kodeHeader);
  assert.strictEqual(nilai('ulp'), 'Toboali');
  assert.strictEqual(nilai('tanggal'), x.hariIni);
  assert.strictEqual(nilai('tim'), 'HARTEK 01');
  assert.strictEqual(nilai('input_by'), '16130.hartek01');
  assert.strictEqual(nilai('tim_id'), 'tim-h1');
  assert.strictEqual(nilai('status'), 'AKTIF');
  assert.strictEqual(nilai('revision'), 1);
  assert.strictEqual(nilai('dibuat_oleh'), 'u-hartek');
  // kolom khusus ROW tetap ada dan kosong untuk Hartek
  for (const k of ['koordinat_awal', 'koordinat_akhir', 'km_awal', 'km_akhir', 'kendala', 'wa_text']) assert.strictEqual(nilai(k), '', k);
  // PG jaringan mewarisi tanggal dan kode header dari baris header (nama kolom)
  const pg = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Jaringan', penyulang: 'PNY-A', section: 'SEC-1', daerah: 'Toboali', jumlahGawang: 2 });
  const kolPg = x.h.HARTEK_HEADER_.db_Hartek_PenyulangGardu;
  const rowPg = x.sheets.h.db_Hartek_PenyulangGardu.data[1];
  assert.strictEqual(rowPg[kolPg.indexOf('kode_header')], a.kodeHeader);
  assert.strictEqual(rowPg[kolPg.indexOf('tanggal')], x.hariIni);
  assert.strictEqual(pg.kodePg, a.kodeHeader + '-PNY.001');
});

test('v0.87.10: penyulang diisi = section wajib; penyulang kosong = section diabaikan (P0 Yandal)', () => {
  const x = siapkanP0();
  x.jam.atur('09:01:00');
  const e = (isi) => kodeError(() => x.panggil('simpanP0Yandal', x.p0(isi)));
  assert.strictEqual(e({ namaPekerjaan: 'Ganti FCO', penyulang: 'Tanjung Labu', sectionId: undefined }), 'FIELD_WAJIB', 'penyulang diisi, section kosong = ditolak');
  const kosong = x.panggil('simpanP0Yandal', x.p0({ namaPekerjaan: 'Ganti FCO', penyulang: undefined, sectionId: x.sek.a }));
  assert.ok(kosong.kodeP0, 'penyulang kosong: section diabaikan, P0 tetap tersimpan');
  assert.strictEqual(e({ namaPekerjaan: 'Ganti FCO', penyulang: 'Bikang', sectionId: x.sek.a }), 'SECTION_BUKAN_PENYULANG', 'section harus milik penyulang');
});

test('v0.87.11: Pengecekan Gardu wajib penyulang DAN section (section menyaring gardu yang tampil)', () => {
  const x = siapkanUkurGardu();
  x.jam.atur('09:01:00');
  const e = (isi) => kodeError(() => x.panggil('simpanP0Yandal', x.p0(isi)));
  assert.strictEqual(e({ namaPekerjaan: 'Pengecekan Gardu', penyulang: 'Tanjung Labu', sectionId: undefined }), 'FIELD_WAJIB', 'section wajib');
  assert.strictEqual(e({ namaPekerjaan: 'Pengecekan Gardu', penyulang: undefined, sectionId: x.sek.a }), 'FIELD_WAJIB', 'penyulang wajib (section saja tidak cukup)');
  assert.ok(x.panggil('simpanP0Yandal', x.p0({ namaPekerjaan: 'Pengecekan Gardu', penyulang: 'Tanjung Labu', sectionId: x.sek.a })).kodeP0);
});

test('hartek header: guard (peran HARTEK paling awal, tim sendiri, hari ini, ID tidak bentrok, revision)', () => {
  const x = konteksHartek();
  const h = x.h;
  // peran: semua endpoint header ditolak paling awal untuk selain PETUGAS HARTEK (fungsi dicek sebelum data)
  for (const f of [h.buatHeaderHartek_, h.ubahHeaderHartek_, h.getHartekHarian_]) {
    assert.ok(/^function \w+\(sesi, data\) \{\s*wajibPetugasHartek_\(sesi\)/.test(f.toString()), f.name + ' wajib peran di baris pertama');
  }
  for (const peran of [{ ...x.sesi, role: 'ADMIN', jenisTim: '' }, { ...x.sesi, role: 'PETUGAS', jenisTim: 'YANDAL' }, { ...x.sesi, timId: '' }]) {
    assert.strictEqual(kodeError(() => h.buatHeaderHartek_(peran, { kendala: 'x' })), 'AKSES_DITOLAK');
    assert.strictEqual(kodeError(() => h.ubahHeaderHartek_(peran, { headerId: '00000000-0000-4000-8000-000000000001', revision: 1, kendala: 'x' })), 'AKSES_DITOLAK');
    assert.strictEqual(kodeError(() => h.getHartekHarian_(peran, {})), 'AKSES_DITOLAK');
  }
  // ubah: header tim lain, dan revisi basi, ditolak
  const a = h.buatHeaderHartek_(x.sesi, {});
  assert.strictEqual(kodeError(() => h.ubahHeaderHartek_({ ...x.sesi, timId: 'tim-lain' }, { headerId: a.headerId, revision: 1, kendala: 'x' })), 'BUKAN_MILIK_TIM');
  assert.strictEqual(kodeError(() => h.ubahHeaderHartek_(x.sesi, { headerId: a.headerId, revision: 5, kendala: 'x' })), 'KONFLIK_REVISION');
  // ubah header hari sebelumnya: ditolak (hanya hari ini)
  const kH = x.h.HARTEK_HEADER_.db_Hartek_Header, asliH = x.sheets.h.db_Hartek_Header.data[1].slice();
  x.sheets.h.db_Hartek_Header.data[1][kH.indexOf('tanggal')] = '2000-01-01';
  x.sheets.h.db_Hartek_Header.data[1][kH.indexOf('kode_header')] = 'HAR-16130000101001';
  assert.strictEqual(kodeError(() => h.ubahHeaderHartek_(x.sesi, { headerId: a.headerId, revision: 1, kendala: 'x' })), 'TANGGAL_DI_LUAR_BATAS');
  x.sheets.h.db_Hartek_Header.data[1] = asliH;
  // buat dengan ID header yang sudah dipakai tim lain: ditolak (ID tidak boleh bentrok)
  const lain = { ...x.sesi, userId: 'u2', timId: 'tim-h2' };
  assert.strictEqual(kodeError(() => h.buatHeaderHartek_(lain, { headerId: a.headerId })), 'ID_DIPAKAI');
  // getHartekHarian hanya membaca header tim sendiri
  const pohonLain = h.getHartekHarian_(lain, {});
  assert.strictEqual(pohonLain.header, null, 'tim lain tidak melihat header tim pertama');
});

test('hartek PG: tidak ada ubah / hapus PG lewat endpoint (v1.0.20: ubahPgHartek tidak dipakai HP, dihapus)', () => {
  const x = konteksHartek();
  assert.strictEqual(typeof x.h.ubahPgHartek_, 'undefined');
  assert.strictEqual(typeof x.h.hapusPgHartek_, 'undefined', 'hapus PG ditolak (fungsi hapus tidak ada)');
});

test('hartek PG: gardu ganda hanya boleh GRD + NTK satu-satu dalam satu header', () => {
  const x = konteksHartek();
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  const grd = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0001' });
  assert.strictEqual(kodeError(() => x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0001' })), 'GARDU_GANDA', 'GRD + GRD ditolak');
  const ntk = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Non - Teknik', noGardu: 'TB0001' });
  assert.strictEqual(ntk.kodePg, a.kodeHeader + '-NTK.001');
  assert.strictEqual(kodeError(() => x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Non - Teknik', noGardu: 'TB0001' })), 'GARDU_GANDA', 'GRD + NTK + NTK ditolak');
  const grd2 = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0002' });
  assert.ok(grd2.pgId && grd.pgId);
});

test('v0.91.0: kolom Hartek baru (koordinat PG, jenis_id, master_material_id, satuan master, no_gardu pemerataan) dan posisinya', () => {
  const H = g.HARTEK_HEADER_;
  const pg = H.db_Hartek_PenyulangGardu, pk = H.db_Hartek_Pekerjaan, mt = H.db_Hartek_Material, pm = H.db_Hartek_PemerataanBeban;
  assert.strictEqual(pg.indexOf('koordinat'), pg.indexOf('jumlah_gawang') + 1, 'koordinat setelah jumlah_gawang (data lapangan, bukan pendukung)');
  assert.strictEqual(pk.indexOf('jenis_id'), pk.indexOf('pekerjaan_id') + 1);
  assert.strictEqual(mt.indexOf('master_material_id'), mt.indexOf('material_id') + 1);
  assert.ok(pm.includes('no_gardu') && !pm.includes('nomor_gardu'), 'pemerataan pakai no_gardu seperti tabel lain');
  assert.deepStrictEqual([...g.HARTEK_MASTER_HEADER_.db_Material], ['nomor', 'nama_material', 'satuan', 'aktif', 'material_id', 'revision', 'timestamp_update', 'diubah_oleh']);
  for (const k of Object.keys(H)) assert.ok(H[k].every((c) => c === c.toLowerCase() && !/\s/.test(c)), k + ' tetap snake_case');
});

test('v0.91.0: pekerjaan dari master HARTEK (jenisId / nama), satuan & nama dari master, dropdown urut', () => {
  const x = konteksHartek();
  const d = JSON.parse(JSON.stringify(x.h.getJenisPekerjaanHartek_(x.sesi).jenis));
  assert.deepStrictEqual(d.map((j) => j.nama), ['Pemerataan Beban Gardu', 'Ganti Arrester', 'Perbaikan Grounding', 'Pasang Grounding'], 'hanya HARTEK aktif, urut kolom urutan');
  assert.deepStrictEqual([d[0].pemerataan, d[1].pemerataan, d[0].satuan], [true, false, 'unit']);
  assert.strictEqual(kodeError(() => x.h.getJenisPekerjaanHartek_({ ...x.sesi, jenisTim: 'ROW' })), 'AKSES_DITOLAK');
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  const pg = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0001' });
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId })), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, jenisId: 'jh3' })), 'PEKERJAAN_TIDAK_DIKENAL', 'master nonaktif');
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, jenisId: 'jr1' })), 'PEKERJAAN_TIDAK_DIKENAL', 'modul lain ditolak');
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, pekerjaan: 'Ngarang' })), 'PEKERJAAN_TIDAK_DIKENAL');
  const p1 = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, jenisId: 'jh2', jumlahPekerjaan: 2 });
  const p2 = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, pekerjaan: '  pemerataan   beban gardu ', jumlahPekerjaan: 1 });
  assert.deepStrictEqual([p1.pekerjaan, p2.jenisId], ['Ganti Arrester', 'jh1']);
  const kol = x.h.HARTEK_HEADER_.db_Hartek_Pekerjaan, b = x.sheets.h.db_Hartek_Pekerjaan.data;
  assert.deepStrictEqual([b[1][kol.indexOf('jenis_id')], b[1][kol.indexOf('satuan_pekerjaan')], b[2][kol.indexOf('pekerjaan')]], ['jh2', 'buah', 'Pemerataan Beban Gardu']);
  const pm = x.h.simpanPemerataanHartek_(x.sesi, { pekerjaanId: p2.pekerjaanId, sebR: 1, sebS: 1, sebT: 1, sesR: 1, sesS: 1, sesT: 1 });
  assert.ok(pm.kodePemerataan);
  const kpm = x.h.HARTEK_HEADER_.db_Hartek_PemerataanBeban;
  assert.strictEqual(x.sheets.h.db_Hartek_PemerataanBeban.data[1][kpm.indexOf('no_gardu')], 'TB0001');
  assert.strictEqual(x.h.getHartekHarian_(x.sesi, {}).objek[0].pekerjaan[0].jenisId, 'jh2');
});

test('v0.91.0: material lewat materialId, master_material_id + satuan master; grounding angka; koordinat PG', () => {
  const x = konteksHartek();
  const m = JSON.parse(JSON.stringify(x.h.getMaterialHartek_(x.sesi).material));
  assert.deepStrictEqual(m, [{ materialId: 'mat-1', nama: 'Kabel NYY', satuan: 'm' }]);
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  const pg = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Jaringan', penyulang: 'PNY-A', section: 'SEC-1', daerah: 'Toboali', jumlahGawang: 2, koordinat: '-3.0044, 106.4712' });
  const kpg = x.h.HARTEK_HEADER_.db_Hartek_PenyulangGardu;
  assert.match(String(x.sheets.h.db_Hartek_PenyulangGardu.data[1][kpg.indexOf('koordinat')]), /^-3\.0044/);
  assert.strictEqual(kodeError(() => x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Jaringan', penyulang: 'PNY-A', section: 'SEC-2', koordinat: 'bukan' })), kodeError(() => x.h.validasi_({ k: 'bukan' }, { k: { tipe: 'koordinat' } })));
  const o = x.h.getHartekHarian_(x.sesi, {}).objek[0];
  assert.deepStrictEqual([o.koordinat.slice(0, 7), o.revision], ['-3.0044', 1]);
  const pk = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, jenisId: 'jh4', jumlahPekerjaan: 1 });
  assert.strictEqual(kodeError(() => x.h.simpanMaterialHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, jumlah: 1 })), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => x.h.simpanMaterialHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, materialId: 'mat-2', jumlah: 1, kepemilikan: 'PLN' })), 'MATERIAL_TIDAK_VALID', 'nonaktif');
  x.h.simpanMaterialHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, materialId: 'mat-1', jumlah: 12, kepemilikan: 'PLN' });
  x.h.simpanMaterialHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, material: 'kabel nyy', jumlah: 3, satuan: 'roll', kepemilikan: 'Pelanggan' });
  const kmt = x.h.HARTEK_HEADER_.db_Hartek_Material, bm = x.sheets.h.db_Hartek_Material.data;
  assert.deepStrictEqual([bm[1][kmt.indexOf('master_material_id')], bm[1][kmt.indexOf('satuan')], bm[2][kmt.indexOf('satuan')]], ['mat-1', 'm', 'm'], 'satuan master selalu dipakai sebagai default sistem');
  assert.strictEqual(kodeError(() => x.h.simpanGroundingHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, jenisPeralatan: 'Arrester', hasilSebelum: '5 ohm' })), 'TIPE_SALAH');
  assert.strictEqual(kodeError(() => x.h.simpanGroundingHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, jenisPeralatan: 'Arrester', hasilSesudah: -1 })), 'DI_LUAR_RENTANG');
  x.h.simpanGroundingHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, jenisPeralatan: 'Arrester', hasilSebelum: '7.5', hasilSesudah: 2 });
  const gr = x.h.getHartekHarian_(x.sesi, {}).objek[0].pekerjaan[0].grounding[0];
  assert.deepStrictEqual([gr.hasilSebelum, gr.hasilSesudah], [7.5, 2]);
});

// ---------- v0.91.1: ADMIN_siapkanSheetHartek = buat + sesuaikan struktur ----------
function sheetKolomPalsu(data) {
  const lebar = () => Math.max(0, ...data.map((r) => r.length));
  const sh = {
    data, maks: Math.max(26, lebar()),
    getLastColumn: () => { let n = 0; data.forEach((r) => r.forEach((v, i) => { if (v !== '' && v !== null && v !== undefined) n = Math.max(n, i + 1); })); return n; },
    getLastRow: () => data.length,
    getMaxColumns: () => sh.maks,
    getDataRange: () => ({ getValues: () => { const w = sh.getLastColumn(); return data.map((r) => { const b = r.slice(0, w); while (b.length < w) b.push(''); return b; }); } }),
    getRange: (r, c, nr = 1, nc = 1) => ({
      kol: c,
      getValues: () => data.slice(r - 1, r - 1 + nr).map((x) => { const b = x.slice(c - 1, c - 1 + nc); while (b.length < nc) b.push(''); return b; }),
      setValue: (v) => { data[r - 1][c - 1] = v; },
      setValues: (vals) => vals.forEach((b, i) => b.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = v; })),
    }),
    insertColumnBefore: (k) => { data.forEach((r) => { while (r.length < k - 1) r.push(''); r.splice(k - 1, 0, ''); }); sh.maks++; },
    insertColumnsAfter: (k, n) => { sh.maks += n; },
    moveColumns: (range, ke) => {
      const dari = range.kol;
      data.forEach((r) => { while (r.length < Math.max(dari, ke)) r.push(''); const [v] = r.splice(dari - 1, 1); r.splice(ke > dari ? ke - 2 : ke - 1, 0, v); });
    },
    setFrozenRows() {},
  };
  return sh;
}

test('v0.91.1: rencanaKolomHartek_ (ganti judul / alias, pindah, sisip, tambah; kolom asing tidak dihapus; judul ganda ditolak)', () => {
  const r = g.rencanaKolomHartek_(['nomor', 'Nomor_Gardu', 'B', 'x_lama', 'a', ''], ['nomor', 'a', 'no_gardu', 'baru', 'B']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.langkah)), [
    { aksi: 'ganti', kol: 2, dari: 'Nomor_Gardu', ke: 'no_gardu' },
    { aksi: 'pindah', dari: 5, ke: 2, nama: 'a' },
    { aksi: 'sisip', kol: 4, nama: 'baru' }]);
  // simulasi hasil akhir lewat sheet palsu
  const sh = sheetKolomPalsu([['nomor', 'Nomor_Gardu', 'B', 'x_lama', 'a'], [1, 'TB01', 'b1', 'x1', 'a1']]);
  g.terapkanRencanaHartek_(sh, r.langkah);
  assert.deepStrictEqual(sh.data[0].slice(0, 6), ['nomor', 'a', 'no_gardu', 'baru', 'B', 'x_lama']);
  assert.deepStrictEqual(sh.data[1].slice(0, 6), [1, 'a1', 'TB01', '', 'b1', 'x1'], 'data ikut kolomnya');
  assert.deepStrictEqual([...r.lain], ['x_lama']);
  assert.match(g.rencanaKolomHartek_(['a', 'a'], ['a']).galat, /ganda/);
  assert.strictEqual(g.rencanaKolomHartek_(['nomor', 'a'], ['nomor', 'a']).langkah.length, 0, 'sudah sesuai = tanpa langkah');
  const t = g.rencanaKolomHartek_(['nomor'], ['nomor', 'z']);
  assert.deepStrictEqual([t.langkah[0].aksi, t.langkah[0].kol], ['tambah', 2]);
});

test('v0.91.1: ADMIN_siapkanSheetHartek menyesuaikan sheet v0.90 (data aman, cadangan dulu, relasi baris lama terisi); ADMIN_cekSheetHartek tidak mengubah', () => {
  const x = konteksHartek();
  const H = x.h.HARTEK_HEADER_;
  const lama = (nama, buang, ganti = {}) => H[nama].filter((k) => !buang.includes(k)).map((k) => ganti[k] || k);
  const isi = (hdr, o) => hdr.map((k) => (k in o ? o[k] : ''));
  const hdrPk = lama('db_Hartek_Pekerjaan', ['jenis_id']), hdrMt = lama('db_Hartek_Material', ['master_material_id']);
  const hdrPm = lama('db_Hartek_PemerataanBeban', [], { no_gardu: 'nomor_gardu' }), hdrPg = lama('db_Hartek_PenyulangGardu', ['koordinat']);
  const hdrMat = x.h.HARTEK_MASTER_HEADER_.db_Material.filter((k) => k !== 'satuan');
  const sh = {
    db_Hartek_Pekerjaan: sheetKolomPalsu([hdrPk, isi(hdrPk, { nomor: 1, pekerjaan: 'Ganti Arrester', pekerjaan_id: 'pk1', revision: 3 }), isi(hdrPk, { nomor: 2, pekerjaan: 'Ngarang', pekerjaan_id: 'pk2' })]),
    db_Hartek_Material: sheetKolomPalsu([hdrMt, hdrMt.map(() => ''), isi(hdrMt, { nomor: 1, material: 'kabel nyy', jumlah: 4, material_id: 'row-mat-1' })]),
    db_Hartek_PemerataanBeban: sheetKolomPalsu([hdrPm, isi(hdrPm, { nomor: 1, nomor_gardu: 'TB0001', seb_r: 40 })]),
    db_Hartek_PenyulangGardu: sheetKolomPalsu([hdrPg, isi(hdrPg, { nomor: 1, pg_id: 'pg1', daerah: 'Toboali', tim_id: 'tim-h1' })]),
  };
  const mat = sheetKolomPalsu([hdrMat, isi(hdrMat, { nomor: 1, nama_material: 'Kabel NYY', aktif: true, material_id: 'mat-1' })]);
  for (const [n, s] of Object.entries(sh)) x.sheets.h[n] = s;
  x.sheets.m.db_Material = mat;
  const salinan = [];
  x.h.DriveApp = { getFileById: (id) => ({ getName: () => 'SS-' + id, makeCopy: (n) => { salinan.push(n); return { getName: () => n, getId: () => 'cp' }; } }) };
  x.h.Utilities.formatDate = () => '2026-10-14 0820';
  const jalan = (fn) => { const log = [], a = { l: console.log, w: console.warn, e: console.error };
    console.log = (m) => log.push(String(m)); console.warn = console.log; console.error = console.log;
    try { return { n: fn(), log: log.join('\n') }; } finally { console.log = a.l; console.warn = a.w; console.error = a.e; } };

  const sebelum = JSON.stringify(Object.values(sh).map((s) => s.data));
  const cek = jalan(() => x.h.jalankanSiapkanHartek_(true));
  assert.strictEqual(JSON.stringify(Object.values(sh).map((s) => s.data)), sebelum, 'mode cek tidak mengubah sheet');
  assert.strictEqual(salinan.length, 0, 'mode cek tidak membuat cadangan');
  assert.match(cek.log, /db_Hartek_PemerataanBeban: AKAN DISESUAIKAN/);
  assert.match(cek.log, /judul [A-Z]+ "nomor_gardu" -> "no_gardu"/);

  const r = jalan(() => x.h.jalankanSiapkanHartek_(false));
  assert.strictEqual(r.n, 0, r.log);
  assert.deepStrictEqual(salinan, ['SS-m (cadangan 2026-10-14 0820)', 'SS-h (cadangan 2026-10-14 0820)'], 'satu cadangan per spreadsheet yang digeser');
  for (const [n, s] of Object.entries(sh)) assert.deepStrictEqual(s.data[0].slice(0, H[n].length), H[n], n + ' sesuai struktur');
  assert.deepStrictEqual(mat.data[0], x.h.HARTEK_MASTER_HEADER_.db_Material);
  const nilai = (s, hdr, k, i = 1) => s.data[i][hdr.indexOf(k)];
  assert.deepStrictEqual([nilai(sh.db_Hartek_Pekerjaan, H.db_Hartek_Pekerjaan, 'pekerjaan'), nilai(sh.db_Hartek_Pekerjaan, H.db_Hartek_Pekerjaan, 'revision'), nilai(sh.db_Hartek_Pekerjaan, H.db_Hartek_Pekerjaan, 'jenis_id')], ['Ganti Arrester', 3, 'jh2'], 'data tetap, jenis_id diisi dari master');
  assert.strictEqual(nilai(sh.db_Hartek_Pekerjaan, H.db_Hartek_Pekerjaan, 'jenis_id', 2), '', 'tanpa pasangan dibiarkan kosong');
  assert.match(r.log, /Isi jenis_id baris lama: 1 terisi, 1 tidak ada pasangan/);
  assert.deepStrictEqual([nilai(sh.db_Hartek_Material, H.db_Hartek_Material, 'material_id', 2), nilai(sh.db_Hartek_Material, H.db_Hartek_Material, 'master_material_id', 2), nilai(sh.db_Hartek_Material, H.db_Hartek_Material, 'master_material_id', 1)], ['row-mat-1', 'mat-1', ''], 'baris kosong di tengah tidak menggeser isian');
  assert.strictEqual(nilai(sh.db_Hartek_PemerataanBeban, H.db_Hartek_PemerataanBeban, 'no_gardu'), 'TB0001');
  assert.deepStrictEqual([nilai(sh.db_Hartek_PenyulangGardu, H.db_Hartek_PenyulangGardu, 'daerah'), nilai(sh.db_Hartek_PenyulangGardu, H.db_Hartek_PenyulangGardu, 'koordinat'), nilai(sh.db_Hartek_PenyulangGardu, H.db_Hartek_PenyulangGardu, 'tim_id')], ['Toboali', '', 'tim-h1']);
  assert.deepStrictEqual([nilai(mat, x.h.HARTEK_MASTER_HEADER_.db_Material, 'nama_material'), nilai(mat, x.h.HARTEK_MASTER_HEADER_.db_Material, 'material_id')], ['Kabel NYY', 'mat-1']);

  // diulang: idempoten, tanpa cadangan baru
  const ulang = jalan(() => x.h.jalankanSiapkanHartek_(false));
  assert.strictEqual(ulang.n, 0);
  assert.strictEqual(salinan.length, 2, 'tidak ada yang digeser = tidak ada cadangan');
  assert.ok(!/disesuaikan/.test(ulang.log), ulang.log);

  // cadangan gagal = tidak ada kolom yang digeser
  const y = konteksHartek();
  const pm = sheetKolomPalsu([lama('db_Hartek_PemerataanBeban', [], { no_gardu: 'nomor_gardu' })]);   // salinan baru (hdrPm ikut tergeser di atas)
  y.sheets.h.db_Hartek_PemerataanBeban = pm;
  y.h.DriveApp = { getFileById: () => { throw new Error('tanpa izin'); } };
  y.h.Utilities.formatDate = () => '';
  const gagal = jalan(() => y.h.jalankanSiapkanHartek_(false));
  assert.ok(gagal.n >= 1, gagal.log);
  assert.ok(pm.data[0].includes('nomor_gardu'), 'sheet tidak disentuh');
  assert.match(gagal.log, /cadangan GAGAL/);
});

// ---------- v0.93.1: temuan review 14 Okt 2026 ----------
test('v0.93.1 temuan 1: Sheets mengubah teks tanggal jadi Date: header tetap terbaca, tidak dobel, PG / pekerjaan tetap bisa disimpan', () => {
  const x = konteksHartek();
  // simulasi Sheets "General": setiap teks yyyy-MM-dd di kolom tanggal berubah jadi Date (tengah malam WIB)
  // Date dibuat di realm konteks Apps Script (instanceof Date di kode server harus benar)
  const dateKonteks = (iso) => require('vm').runInContext('new Date(' + JSON.stringify(iso) + ')', x.h);
  const keDate = () => {
    for (const [nama, hdr] of Object.entries(x.h.HARTEK_HEADER_)) {
      const k = hdr.indexOf('tanggal');
      x.sheets.h[nama].data.forEach((r, i) => { if (i > 0 && typeof r[k] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r[k])) r[k] = dateKonteks(r[k] + 'T00:00:00+07:00'); });
    }
  };
  const a = x.h.buatHeaderHartek_(x.sesi, { kmAwal: 3 });
  keDate();
  const kHd = x.h.HARTEK_HEADER_.db_Hartek_Header;
  assert.ok(x.sheets.h.db_Hartek_Header.data[1][kHd.indexOf('tanggal')] instanceof require('vm').runInContext('Date', x.h), 'sel sudah Date (kondisi temuan)');
  const r = x.h.getHartekHarian_(x.sesi, {});
  assert.ok(r.header && r.header.headerId === a.headerId, 'header hari ini tetap terbaca');
  assert.strictEqual(kodeError(() => x.h.buatHeaderHartek_(x.sesi, {})), 'LAPORAN_UTAMA_SUDAH_DIBUAT', 'tidak ada header kedua');
  assert.strictEqual(x.sheets.h.db_Hartek_Header.data.length, 2);
  const pg = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0001' });
  keDate();
  const pk = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, jenisId: 'jh2', jumlahPekerjaan: 1 });
  const kPk = x.h.HARTEK_HEADER_.db_Hartek_Pekerjaan;
  assert.strictEqual(x.sheets.h.db_Hartek_Pekerjaan.data[1][kPk.indexOf('tanggal')], x.hariIni, 'anak ditulis teks yyyy-MM-dd walau induknya Date');
  keDate();
  x.h.simpanMaterialHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, materialId: 'mat-1', jumlah: 1, kepemilikan: 'PLN' });
  x.h.ubahHeaderHartek_(x.sesi, { headerId: a.headerId, revision: 1, kendala: 'hujan' });
  assert.strictEqual(x.h.getHartekHarian_(x.sesi, {}).objek[0].pekerjaan[0].material.length, 1);
  // tanpa kode yang bisa dibaca: cadangan = sel tanggal (Date pun aman)
  assert.strictEqual(x.h.tglHartek_({ kode_header: 'X', tanggal: dateKonteks(x.hariIni + 'T00:00:00+07:00') }), x.hariIni);
  assert.strictEqual(x.h.tglHartek_({ kode_header: 'HAR-16130261399001', tanggal: '2026-01-02' }), '2026-01-02', 'kode tanggal mustahil = pakai sel');
});

test('v0.93.1 temuan 1: siapkanSheetHartek memformat kolom tanggal baris kosong jadi teks (@)', () => {
  const x = konteksHartek();
  const format = [];
  const sh = { getMaxRows: () => 1000, getLastRow: () => 5, getRange: (r, c, nr, nc) => ({ setNumberFormat: (f) => format.push([r, c, nr, nc, f]) }) };
  const h = x.h.HARTEK_HEADER_.db_Hartek_PenyulangGardu;
  assert.strictEqual(x.h.formatTanggalTeksHartek_(sh, h), true);
  assert.deepStrictEqual(format, [[6, h.indexOf('tanggal') + 1, 995, 1, '@']], 'baris lama (1-5) tidak disentuh');
  assert.strictEqual(x.h.formatTanggalTeksHartek_({ getLastRow: () => 1 }, h), false, 'sheet tanpa API format dilewati');
});

test('v0.93.1 temuan 3: jenisPekerjaan PG hanya Jaringan / Gardu / Non - Teknik (huruf bebas, disimpan baku)', () => {
  const x = konteksHartek();
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  assert.strictEqual(kodeError(() => x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'xyz', noGardu: 'TB0001' })), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Pemeliharaan Gardu', noGardu: 'TB0001' })), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(x.sheets.h.db_Hartek_PenyulangGardu.data.length, 1, 'tidak ada yang tersimpan');
  const j = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: '  jaringan ', penyulang: 'PNY-A', section: 'SEC-1', daerah: 'Toboali', jumlahGawang: 2 });
  const n = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'NON-TEKNIK', noGardu: 'TB0001' });
  assert.match(j.kodePg, /-PNY\.001$/);
  assert.match(n.kodePg, /-NTK\.001$/);
  const k = x.h.HARTEK_HEADER_.db_Hartek_PenyulangGardu, d = x.sheets.h.db_Hartek_PenyulangGardu.data;
  assert.deepStrictEqual([d[1][k.indexOf('jenis_pekerjaan')], d[2][k.indexOf('jenis_pekerjaan')]], ['Jaringan', 'Non - Teknik']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(x.h.getHartekHarian_(x.sesi, {}).objek.map((o) => o.jenisPekerjaan))), ['Jaringan', 'Non - Teknik'], 'muncul di daftar HP');
});

test('v0.93.1 temuan 4: jenis tim "Hartek" / " hartek " dinormalkan di sesi dan db_Akses; cekKonfig memberi PERHATIAN', () => {
  const x = buatKonteks({ ...PROPS });
  const log = [];
  const buat = sheetPalsu(log);
  const sheets = { m: {
    db_Users: buat('db_Users', [['user_id', 'username', 'nama', 'role', 'tim_id', 'aktif'], ['u1', '16130.hartek01', 'H', 'PETUGAS', 't1', true]]),
    db_Tim: buat('db_Tim', [['tim_id', 'kode', 'nama', 'jenis', 'aktif'], ['t1', '01', 'HARTEK 01', ' Hartek ', true]]),
    db_Menu: buat('db_Menu', [['menu_kode', 'nama', 'platform', 'khusus_super', 'urutan', 'aktif'], ['OPS_HARTEK_INPUT', 'Hartek', 'MOBILE', false, 1, true]]),
    db_Akses: buat('db_Akses', [['role', 'jenis_tim', 'menu_kode', 'aksi'], ['PETUGAS', 'hartek', 'OPS_HARTEK_INPUT', 'UBAH']]),
  } };
  x.SpreadsheetApp = { openById: (id) => ({ getSheetByName: (n) => (sheets[id] || {})[n] || null }) };
  assert.strictEqual(x.profilUser_('u1').jenisTim, 'HARTEK', 'sesi: trim + huruf besar');
  const aturan = x.aturanAkses_();
  assert.strictEqual(aturan.akses[0].jenisTim, 'HARTEK');
  assert.strictEqual(x.aksesUntuk_('PETUGAS', 'HARTEK', 'OPS_HARTEK_INPUT', aturan), 'UBAH', 'akses cocok setelah normalisasi');
  // cekKonfig Hartek: jenis tidak baku = PERHATIAN (daftar tim di modul lain membandingkan persis)
  const y = konteksHartek();
  y.sheets.m.db_Tim = sheetPalsu([])('db_Tim', [['tim_id', 'kode', 'nama', 'jenis', 'aktif'], ['tim-h1', '01', 'HARTEK 01', 'Hartek', true]]);
  y.sheets.m.db_Users = sheetPalsu([])('db_Users', [['user_id', 'username', 'nama', 'role', 'tim_id', 'aktif'], ['u-hartek', '16130.hartek01', 'H', 'PETUGAS', 'tim-h1', true]]);
  const tangkap = [], asli = { l: console.log, w: console.warn, e: console.error };
  console.log = (m) => tangkap.push(String(m)); console.warn = console.log; console.error = console.log;
  try { y.h.cekKonfigHartek_(y.h.cfg_()); } finally { console.log = asli.l; console.warn = asli.w; console.error = asli.e; }
  assert.ok(tangkap.some((m) => /\[PERHATIAN\].*db_Tim: 1 tim jenis "Hartek", tulis persis HARTEK/.test(m)), tangkap.join('\n'));
});

// ---------- v0.94.0: master pekerjaan Hartek (jenis, satuan, GASPOL) + Hartek kerja per tim ----------
function konteksJenisHartek94() {
  const x = konteksHartek();
  const H = ['jenis_id', 'modul', 'nama', 'satuan', 'diameter_min', 'diameter_max', 'urutan', 'aktif', 'bobot', 'jenis_pekerjaan', 'kolom_gaspol'];
  x.sheets.m.db_Jenis_Pekerjaan = sheetPalsu([])('db_Jenis_Pekerjaan', [H,
    ['g1', 'HARTEK', 'Penggantian Isolator', 'buah', '', '', 1, true, '', 'Jaringan', 'harkomIsolator'],
    ['g2', 'HARTEK', 'Grounding', 'titik', '', '', 2, true, '', 'Gardu', 'groundingGardu'],
    ['g3', 'HARTEK', 'Grounding', 'titik', '', '', 3, true, '', 'Jaringan', 'groundingTm'],
    ['g4', 'HARTEK', 'Bersih Gardu', 'unit', '', '', 4, true, '', 'non-teknik', ''],
    ['g5', 'HARTEK', 'Pemerataan Beban Gardu', 'unit', '', '', 5, true, '', '', 'penyeimbanganBeban'],
    ['g6', 'HARTEK', 'Pekerjaan Aneh', '', '', '', 6, true, '', 'Udara', 'bukanKolom'],
    ['g7', 'HARTEK', 'Survey', '', '', '', 7, true, '', 'Jaringan', ''],
  ]);
  return x;
}

test('v0.94.0: dropdown pekerjaan membawa jenis PG, satuan, dan klasifikasi GASPOL (jenis tak dikenal disembunyikan)', () => {
  const x = konteksJenisHartek94();
  const j = JSON.parse(JSON.stringify(x.h.getJenisPekerjaanHartek_(x.sesi).jenis));
  assert.deepStrictEqual(j.map((r) => r.jenisId), ['g1', 'g2', 'g3', 'g4', 'g5', 'g7'], 'g6 jenis "Udara" disembunyikan');
  assert.deepStrictEqual([j[0].jenisPekerjaan, j[0].satuan, j[0].kolomGaspol, j[0].labelGaspol], ['Jaringan', 'buah', 'harkomIsolator', 'HARKOM · Isolator']);
  assert.deepStrictEqual([j[3].jenisPekerjaan, j[3].kolomGaspol, j[4].jenisPekerjaan, j[4].pemerataan], ['Non - Teknik', '', '', true], 'jenis kosong = semua jenis');
});

test('v0.94.0: simpan pekerjaan: jenis PG harus cocok, satuan dari master, kolom_gaspol disimpan, jumlah wajib kalau masuk GASPOL', () => {
  const x = konteksJenisHartek94();
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  const grd = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0001' });
  const jar = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Jaringan', penyulang: 'PNY-A', section: 'SEC-1', daerah: 'Toboali', jumlahGawang: 2 });
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanHartek_(x.sesi, { pgId: grd.pgId, jenisId: 'g1', jumlahPekerjaan: 1 })), 'PEKERJAAN_BEDA_JENIS', 'pekerjaan Jaringan di lokasi Gardu');
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanHartek_(x.sesi, { pgId: jar.pgId, jenisId: 'g1' })), 'FIELD_WAJIB', 'masuk GASPOL tanpa jumlah');
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanHartek_(x.sesi, { pgId: jar.pgId, jenisId: 'g6', jumlahPekerjaan: 1 })), 'PEKERJAAN_TIDAK_DIKENAL', 'master jenis tidak dikenal tidak bisa dipakai');
  const p1 = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: jar.pgId, jenisId: 'g1', jumlahPekerjaan: 3, satuanPekerjaan: 'set' });
  const p2 = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: grd.pgId, pekerjaan: 'grounding', jumlahPekerjaan: 2 });
  const p3 = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: jar.pgId, jenisId: 'g7', jumlahPekerjaan: 1, satuanPekerjaan: 'km' });
  const p4 = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: grd.pgId, jenisId: 'g5', jumlahPekerjaan: 1 });
  assert.deepStrictEqual([p1.kolomGaspol, p2.jenisId, p2.kolomGaspol, p3.kolomGaspol, p4.kolomGaspol], ['harkomIsolator', 'g2', 'groundingGardu', '', 'penyeimbanganBeban'],
    'nama "grounding" di lokasi Gardu = baris Gardu (kunci pekerjaan||jenis v1); jenis kosong = boleh di semua jenis');
  const k = x.h.HARTEK_HEADER_.db_Hartek_Pekerjaan, d = x.sheets.h.db_Hartek_Pekerjaan.data;
  assert.deepStrictEqual([d[1][k.indexOf('satuan_pekerjaan')], d[1][k.indexOf('kolom_gaspol')], d[3][k.indexOf('satuan_pekerjaan')]], ['buah', 'harkomIsolator', 'km'],
    'satuan master menang; master tanpa satuan = isian HP');
  const o = x.h.getHartekHarian_(x.sesi, {}).objek;
  assert.deepStrictEqual([o[1].pekerjaan[0].kolomGaspol, o[1].pekerjaan[0].labelGaspol, o[1].pekerjaan[1].labelGaspol], ['harkomIsolator', 'HARKOM · Isolator', '']);
  assert.ok(k.indexOf('kolom_gaspol') === k.indexOf('satuan_pekerjaan') + 1);
});

test('v0.94.0: klasifikasi GASPOL v1, ADMIN_isiGaspolHartek hanya isi yang kosong, siapkan menambah kolom master di kanan', () => {
  const k = g.klasifikasiGaspolHartek_;
  assert.deepStrictEqual([
    k('Penggantian Isolator Tumpu', 'Jaringan'), k('Ganti Arrester', 'Gardu'), k('Ganti FCO', 'Jaringan'), k('Penggantian Trafo', 'Gardu'),
    k('Perbaikan Tiang Miring', 'Jaringan'), k('Perbaikan Konstruksi TM', 'Jaringan'), k('Grounding', 'Gardu'), k('Grounding', 'Jaringan'),
    k('Rekonektorisasi SR', 'Jaringan'), k('Pasang Keypoint', 'Jaringan'), k('Pasang CLD', 'Jaringan'), k('Ganti Isolator', 'Non - Teknik'), k('Jumperan Gardu', 'Gardu'), k('Survey', 'Jaringan')],
    ['harkomIsolator', 'harkomArrester', 'harkomFco', 'manajemenGardu', 'harkonsTiang', 'harkonsSutm', 'groundingGardu', 'groundingTm',
     'rekonektorSr', 'harkeypoint', 'harkomArrester', '', '', '']);
  const x = konteksJenisHartek94();
  const d = x.sheets.m.db_Jenis_Pekerjaan.data;
  d.push(['g8', 'HARTEK', 'Penggantian FCO', 'buah', '', '', 8, true, '', 'Jaringan', '']);
  const kol = d[0].indexOf('kolom_gaspol');
  const sebelum = d.map((r) => r[kol]);
  const diam = (fn) => { const a = { l: console.log, e: console.error }; console.log = () => {}; console.error = () => {}; try { return fn(); } finally { console.log = a.l; console.error = a.e; } };
  assert.strictEqual(diam(() => x.h.ADMIN_isiGaspolHartek()), 1);
  assert.strictEqual(d[8][kol], 'harkomFco');
  assert.deepStrictEqual(d.slice(0, 8).map((r) => r[kol]), sebelum.slice(0, 8), 'isian lama / kosong sengaja (Survey) tidak ditimpa aturan yang tidak cocok');
  // siapkan: kolom jenis_pekerjaan + kolom_gaspol ditambah di kanan kalau belum ada
  const y = konteksHartek();
  const hdrLama = y.sheets.m.db_Jenis_Pekerjaan.data[0].slice();
  assert.strictEqual(diam(() => y.h.pastikanKolomJenisHartek_({ getSheetByName: (n) => y.sheets.m[n] }, '', true)), 2, 'mode cek: hanya laporan');
  assert.deepStrictEqual(y.sheets.m.db_Jenis_Pekerjaan.data[0], hdrLama);
  assert.strictEqual(diam(() => y.h.pastikanKolomJenisHartek_({ getSheetByName: (n) => y.sheets.m[n] }, '', false)), 2);
  assert.deepStrictEqual(y.sheets.m.db_Jenis_Pekerjaan.data[0], [...hdrLama, 'jenis_pekerjaan', 'kolom_gaspol']);
  assert.strictEqual(diam(() => y.h.pastikanKolomJenisHartek_({ getSheetByName: (n) => y.sheets.m[n] }, '', false)), 0, 'diulang aman');
});

test('v0.94.0: cekKonfig Hartek melaporkan jenis / kolom GASPOL / satuan master yang salah', () => {
  const x = konteksJenisHartek94();
  const log = [], a = { l: console.log, w: console.warn, e: console.error };
  console.log = (m) => log.push(String(m)); console.warn = console.log; console.error = console.log;
  try { x.h.cekKonfigHartek_(x.h.cfg_()); } finally { console.log = a.l; console.warn = a.w; console.error = a.e; }
  const t = log.join('\n');
  assert.match(t, /"Pekerjaan Aneh": jenis_pekerjaan "Udara" bukan Jaringan/);
  assert.match(t, /"Pekerjaan Aneh": kolom_gaspol "bukanKolom" tidak dikenal/);
  assert.match(t, /"Survey": satuan kosong/);
  assert.match(t, /HARTEK per jenis: Jaringan 3, Gardu 1, Non - Teknik 1, semua jenis 1; 4 masuk GASPOL/);
});

test('v0.94.0: akun tim HARTEK login langsung dapat token (tanpa pilih petugas seperti Yandal), data dicatat atas nama tim', () => {
  const g4 = buatKonteks({ ...PROPS, PBKDF2_ITERASI: '1000' });
  const buat = sheetPalsu([]);
  const salt = Buffer.from('0123456789abcdef').toString('base64');
  const hash = g4.hashPassword_('Rahasia-Toboali-2026', salt, 1000);
  const sheets = {
    m: {
      db_Users: buat('db_Users', [['user_id', 'username', 'nama', 'role', 'tim_id', 'aktif'], ['u1', '16130.hartek01', 'HARTEK 01', 'PETUGAS', 't1', true]]),
      db_Tim: buat('db_Tim', [['tim_id', 'kode', 'nama', 'jenis', 'aktif'], ['t1', '01', 'HARTEK 01', 'HARTEK', true]]),
      db_Menu: buat('db_Menu', [['menu_kode', 'nama', 'platform', 'khusus_super', 'urutan', 'aktif'], ['OPS_HARTEK_INPUT', 'Input Hartek', 'MOBILE', false, 1, true]]),
      db_Akses: buat('db_Akses', [['role', 'jenis_tim', 'menu_kode', 'aksi'], ['PETUGAS', 'HARTEK', 'OPS_HARTEK_INPUT', 'UBAH']]),
      db_Petugas: buat('db_Petugas', [['petugas_id', 'nama', 'tim_yandal', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh']]),
    },
    a: {
      auth_Password: buat('auth_Password', [['user_id', 'password_hash', 'salt', 'hash_versi', 'password_diubah_pada', 'gagal_login', 'terkunci_sampai'], ['u1', hash, salt, 'pbkdf2-sha256:1000', '', 0, '']]),
      auth_Perangkat: buat('auth_Perangkat', [['device_id', 'user_id', 'install_id', 'token_hash', 'platform', 'dibuat_pada', 'terakhir_dipakai', 'kedaluwarsa_pada', 'dicabut_pada']]),
      log_Audit: buat('log_Audit', [['waktu', 'user_id', 'username', 'role', 'aksi', 'target', 'detail', 'platform', 'device_id']]),
    },
  };
  g4.SpreadsheetApp = { openById: (id) => ({ getSheetByName: (n) => sheets[id][n] }) };
  const r = g4.login_(null, { username: '16130.hartek01', password: 'Rahasia-Toboali-2026', installId: '11111111-1111-4111-8111-111111111111' }, 'MOBILE');
  assert.ok(r.tahap === undefined && /^[0-9a-f]{64}$/.test(r.token), 'bukan tahap PILIH_PETUGAS');
  assert.deepStrictEqual([r.profil.jenisTim, r.profil.timNama], ['HARTEK', 'HARTEK 01']);
  assert.ok(r.menu.some((m) => m.kode === 'OPS_HARTEK_INPUT'), 'menu Hartek ikut');
  assert.ok(!g4.petugasYandal_(r.profil), 'tidak lewat alur petugas Yandal');
  // data Hartek dicatat atas nama tim (kolom tim + input_by akun tim), tidak ada kolom petugas individu
  const x = konteksHartek();
  x.h.buatHeaderHartek_(x.sesi, {});
  const kol = x.h.HARTEK_HEADER_.db_Hartek_Header, b = x.sheets.h.db_Hartek_Header.data[1];
  assert.deepStrictEqual([b[kol.indexOf('tim')], b[kol.indexOf('input_by')]], ['HARTEK 01', '16130.hartek01']);
  for (const [n, h] of Object.entries(x.h.HARTEK_HEADER_)) assert.ok(!h.some((c) => /petugas/.test(c)), n + ' tanpa kolom petugas');
});

test('v0.94.1: kriteria GASPOL harkomSutm + huruf bebas (harKeypoint), pemerataan = Pemerataan / Pembagian Beban Gardu', () => {
  assert.deepStrictEqual([g.kolomGaspolHartek_('harkomSutm'), g.kolomGaspolHartek_('harKeypoint'), g.kolomGaspolHartek_(' HARKOMISOLATOR '), g.kolomGaspolHartek_('ngarang')],
    ['harkomSutm', 'harkeypoint', 'harkomIsolator', '']);
  assert.strictEqual(g.HARTEK_KOLOM_GASPOL_.harkomSutm, 'HARKOM · SUTM');
  const x = konteksJenisHartek94();
  const d = x.sheets.m.db_Jenis_Pekerjaan.data;
  d.push(['g9', 'HARTEK', 'Penggantian Bending Wire TM', 'buah', '', '', 9, true, '', 'Jaringan', 'harkomSutm']);
  d.push(['g10', 'HARTEK', 'Penggantian Recloser', 'buah', '', '', 10, true, '', 'Jaringan', 'harKeypoint']);
  d.push(['g11', 'HARTEK', 'Pembagian Beban Gardu', 'set', '', '', 11, true, '', 'Gardu', 'penyeimbanganBeban']);
  const log = [], a = { l: console.log, w: console.warn, e: console.error };
  console.log = (m) => log.push(String(m)); console.warn = console.log; console.error = console.log;
  try { x.h.cekKonfigHartek_(x.h.cfg_()); } finally { console.log = a.l; console.warn = a.w; console.error = a.e; }
  const t = log.join('\n');
  assert.ok(!/Bending Wire TM.*tidak dikenal|Recloser.*tidak dikenal/.test(t), t);
  assert.ok(!/belum ada "Pemerataan Beban Gardu"/.test(t), 'master sudah punya Pemerataan Beban Gardu');
  const j = JSON.parse(JSON.stringify(x.h.getJenisPekerjaanHartek_(x.sesi).jenis));
  const r = (id) => j.find((q) => q.jenisId === id);
  assert.deepStrictEqual([r('g9').labelGaspol, r('g10').kolomGaspol, r('g11').pemerataan, r('g5').pemerataan], ['HARKOM · SUTM', 'harkeypoint', true, true]);
  // simpan: pemerataan hanya untuk nama Gardu, kolom_gaspol ditulis baku
  const h = x.h.buatHeaderHartek_(x.sesi, {});
  const jar = x.h.simpanPgHartek_(x.sesi, { headerId: h.headerId, jenisPekerjaan: 'Jaringan', penyulang: 'PNY-A', section: 'SEC-1', daerah: 'Toboali', jumlahGawang: 2 });
  const grd = x.h.simpanPgHartek_(x.sesi, { headerId: h.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0001' });
  const rc = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: jar.pgId, jenisId: 'g10', jumlahPekerjaan: 1 });
  assert.strictEqual(rc.kolomGaspol, 'harkeypoint');
  const pb = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: grd.pgId, jenisId: 'g11', jumlahPekerjaan: 1 });
  assert.ok(x.h.simpanPemerataanHartek_(x.sesi, { pekerjaanId: pb.pekerjaanId, sebR: 1, sebS: 1, sebT: 1, sesR: 1, sesS: 1, sesT: 1 }).kodePemerataan);
  assert.strictEqual(kodeError(() => x.h.simpanPemerataanHartek_(x.sesi, { pekerjaanId: rc.pekerjaanId, sebR: 1, sebS: 1, sebT: 1, sesR: 1, sesS: 1, sesT: 1 })), 'PEKERJAAN_TIDAK_SESUAI');
});

// ---------- v0.95.0: input Hartek lokal + kirim otomatis, section urut, gardu dari master ----------
test('v0.95.0: kiriman ulang dengan idBaris (PG / pekerjaan / material / grounding / pemerataan) tidak membuat baris dobel; ID tim lain ditolak', () => {
  const x = konteksJenisHartek94();
  const id = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
  const a = x.h.buatHeaderHartek_(x.sesi, { headerId: id(1) });
  assert.strictEqual(a.headerId, id(1));
  const pg1 = x.h.simpanPgHartek_(x.sesi, { idBaris: id(2), headerId: id(1), jenisPekerjaan: 'Gardu', noGardu: 'TB0001' });
  const pg2 = x.h.simpanPgHartek_(x.sesi, { idBaris: id(2), headerId: id(1), jenisPekerjaan: 'Gardu', noGardu: 'TB0001' });
  assert.deepStrictEqual([pg1.pgId, pg2.duplikat, pg2.kodePg], [id(2), true, pg1.kodePg], 'GARDU_GANDA tidak terpicu oleh kiriman ulang');
  const pk1 = x.h.simpanPekerjaanHartek_(x.sesi, { idBaris: id(3), pgId: id(2), jenisId: 'g5', jumlahPekerjaan: 1 });
  const pk2 = x.h.simpanPekerjaanHartek_(x.sesi, { idBaris: id(3), pgId: id(2), jenisId: 'g5', jumlahPekerjaan: 1 });
  assert.deepStrictEqual([pk1.pekerjaanId, pk2.duplikat, pk2.kodePekerjaan], [id(3), true, pk1.kodePekerjaan]);
  // v0.97.0: rincian grounding butuh pekerjaan grounding sendiri (g2 = Grounding di lokasi Gardu)
  const pkg = x.h.simpanPekerjaanHartek_(x.sesi, { idBaris: id(7), pgId: id(2), jenisId: 'g2', jumlahPekerjaan: 1 });
  assert.strictEqual(x.h.simpanPekerjaanHartek_(x.sesi, { idBaris: id(7), pgId: id(2), jenisId: 'g2', jumlahPekerjaan: 1 }).duplikat, true);
  for (let i = 0; i < 2; i++) {
    x.h.simpanMaterialHartek_(x.sesi, { idBaris: id(4), pekerjaanId: id(3), materialId: 'mat-1', jumlah: 2, kepemilikan: 'PLN' });
    x.h.simpanGroundingHartek_(x.sesi, { idBaris: id(5), pekerjaanId: pkg.pekerjaanId, jenisPeralatan: 'Body', hasilSebelum: 4, hasilSesudah: 2 });
    x.h.simpanPemerataanHartek_(x.sesi, { idBaris: id(6), pekerjaanId: id(3), sebR: 1, sebS: 1, sebT: 1, sesR: 1, sesS: 1, sesT: 1 });
  }
  for (const n of ['db_Hartek_PenyulangGardu', 'db_Hartek_Material', 'db_Hartek_Grounding', 'db_Hartek_PemerataanBeban']) {
    assert.strictEqual(x.sheets.h[n].data.length, 2, n + ' satu baris saja');
  }
  assert.strictEqual(x.sheets.h.db_Hartek_Pekerjaan.data.length, 3, 'pemerataan + grounding, tanpa baris dobel');
  const kM = x.h.HARTEK_HEADER_.db_Hartek_Material;
  assert.strictEqual(x.sheets.h.db_Hartek_Material.data[1][kM.indexOf('material_id')], id(4), 'ID baris = ID dari HP');
  const lain = { ...x.sesi, userId: 'u9', timId: 'tim-h9', deviceId: 'd9' };
  const b = x.h.buatHeaderHartek_(lain, {});
  assert.strictEqual(kodeError(() => x.h.simpanPgHartek_(lain, { idBaris: id(2), headerId: b.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0002' })), 'ID_DIPAKAI');
  assert.strictEqual(kodeError(() => x.h.simpanPgHartek_(x.sesi, { idBaris: 'bukan-uuid', headerId: id(1), jenisPekerjaan: 'Gardu', noGardu: 'TB0002' })), 'FORMAT_SALAH');
});

test('v0.95.0: section dropdown urut kolom urutan db_Jaringan; PG gardu tanpa koordinat = titik dari db_Gardu', () => {
  const x = konteksHartek();
  const J = x.sheets.m.db_Jaringan.data;
  J.length = 1;
  J.push(['s1', 'PNY-A', 'Zeta', '', 1, true, 1, '', ''], ['s2', 'PNY-A', 'Alfa', '', 30, true, 1, '', ''], ['s3', 'PNY-A', 'Beta', '', 2, true, 1, '', ''], ['s4', 'PNY-A', 'Akhir', '', '', true, 1, '', '']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(x.h.getJaringanHartek_(x.sesi).penyulang[0].section)), ['Zeta', 'Beta', 'Alfa', 'Akhir']);
  x.sheets.g.db_Gardu = sheetPalsu([])('db_Gardu', [['No Gardu', 'gardu_id', 'Penyulang', 'Section', 'Alamat', 'Lat', 'Long'],
    ['TB0001', 'gar-1', 'PNY-A', 'SEC-1', 'Jl. Merdeka', -3.0012, 106.4561], ['TB0002', 'gar-2', 'PNY-A', 'SEC-1', 'Jl. Lain', '', ''], ['TB0003', 'gar-3', 'PNY-A', 'SEC-1', 'Luar', 10, 10]]);
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0001' });
  x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0002' });
  x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Non - Teknik', noGardu: 'TB0003' });
  x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Non - Teknik', noGardu: 'TB0001', koordinat: '-3.1, 106.5' });
  const k = x.h.HARTEK_HEADER_.db_Hartek_PenyulangGardu.indexOf('koordinat');
  assert.deepStrictEqual(x.sheets.h.db_Hartek_PenyulangGardu.data.slice(1).map((r) => r[k]), ['-3.001200, 106.456100', '', '', '-3.100000, 106.500000'],
    'kosong / di luar area = kosong; isian HP menang');
});

test('v0.95.0: Master Gardu boleh dibaca petugas HARTEK (menu OPS_HARTEK_INPUT), akun lain tanpa menu ditolak', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../backend/src/modules/62_Gardu_Master.js'), 'utf8');
  assert.match(src, /sesi\.jenisTim === 'HARTEK' && !!aksesUntuk_\(sesi\.role, sesi\.jenisTim, 'OPS_HARTEK_INPUT', aturanAkses_\(\)\)/);
  const x = konteksHartek();
  const buat = sheetPalsu([]);
  x.sheets.g.db_Gardu = buat('db_Gardu', [x.h.DB_GARDU_HEADER_.slice()]);
  const baris = x.h.DB_GARDU_HEADER_.map((k) => ({ 'No Gardu': 'TB0001', gardu_id: 'gar-1', 'Status Gardu': 'AKTIF', Penyulang: 'PNY-A', Section: 'SEC-1', Lat: -3.0012, Long: 106.4561 }[k] ?? ''));
  x.sheets.g.db_Gardu.data.push(baris);
  x.sheets.m.db_Menu = buat('db_Menu', [['menu_kode', 'nama', 'platform', 'khusus_super', 'urutan', 'aktif'], ['OPS_HARTEK_INPUT', 'Hartek', 'MOBILE', false, 1, true]]);
  x.sheets.m.db_Akses = buat('db_Akses', [['role', 'jenis_tim', 'menu_kode', 'aksi'], ['PETUGAS', 'HARTEK', 'OPS_HARTEK_INPUT', 'UBAH']]);
  const isi = x.h.MODUL_MASTER_OPSIONAL_.gardu(x.sesi);
  assert.deepStrictEqual([isi.length, isi[0].no, isi[0].lat, isi[0].lng], [1, 'TB0001', -3.0012, 106.4561]);
  assert.strictEqual(kodeError(() => x.h.MODUL_MASTER_OPSIONAL_.gardu({ ...x.sesi, jenisTim: 'ROW' })), 'AKSES_DITOLAK');
  // v1.0.21: petugas INSPEKSI_GARDU dengan menu OPS_INSDU_INPUT juga boleh (hanya baca)
  const insdu = { ...x.sesi, jenisTim: 'INSPEKSI_GARDU' };
  assert.strictEqual(kodeError(() => x.h.MODUL_MASTER_OPSIONAL_.gardu(insdu)), 'AKSES_DITOLAK', 'tanpa menu OPS_INSDU_INPUT');
  x.sheets.m.db_Menu.data.push(['OPS_INSDU_INPUT', 'Inspeksi Gardu', 'MOBILE', false, 2, true]);
  x.sheets.m.db_Akses.data.push(['PETUGAS', 'INSPEKSI_GARDU', 'OPS_INSDU_INPUT', 'UBAH']);
  x.h.CacheService.getScriptCache().remove('akses:v1');
  assert.strictEqual(x.h.MODUL_MASTER_OPSIONAL_.gardu(insdu).length, 1);
  x.sheets.m.db_Akses.data.length = 1;
  x.h.CacheService.getScriptCache().remove('akses:v1');   // aturan akses di-cache
  assert.strictEqual(kodeError(() => x.h.MODUL_MASTER_OPSIONAL_.gardu(x.sesi)), 'AKSES_DITOLAK', 'HARTEK tanpa akses menu');
});

test('v0.95.0: ADMIN_lengkapiMaster mengisi material_id, nomor, revision, timestamp_update di db_Material', () => {
  const x = konteksHartek();
  const H = x.h.HARTEK_MASTER_HEADER_.db_Material;
  const kosong = H.map((k) => ({ nama_material: 'Kabel Baru', satuan: 'm' }[k] ?? ''));
  x.sheets.m.db_Material.data.push(kosong);
  const buat = sheetPalsu([]);
  for (const [n, h] of Object.entries({ db_Tim: ['tim_id', 'kode', 'nama', 'jenis', 'aktif'], db_Users: ['user_id', 'username', 'nama', 'role', 'tim_id', 'aktif'],
    db_Jenis_Pekerjaan: ['jenis_id', 'modul', 'nama'] })) x.sheets.m[n] = x.sheets.m[n] || buat(n, [h]);
  const a = { l: console.log, w: console.warn }; console.log = () => {}; console.warn = () => {};
  try { x.h.ADMIN_lengkapiMaster(); } finally { console.log = a.l; console.warn = a.w; }
  const r = x.sheets.m.db_Material.data[3];
  assert.match(String(r[H.indexOf('material_id')]), /^[0-9a-f-]{36}$/);
  assert.deepStrictEqual([r[H.indexOf('nomor')], r[H.indexOf('revision')], r[H.indexOf('aktif')], r[H.indexOf('diubah_oleh')]], [3, 1, 'TRUE', 'admin-tools']);
  assert.ok(String(r[H.indexOf('timestamp_update')]).length > 10);
  assert.strictEqual(x.sheets.m.db_Material.data[1][H.indexOf('material_id')], 'mat-1', 'ID lama tidak diubah');
});

test('v1.0.18: ADMIN_lengkapiMaster membuat db_Daerah_Padam + baris penyulang / section db_Jaringan, baris lama tidak diubah', () => {
  const x = konteksHartek();
  const buat = sheetPalsu([]);
  for (const [n, h] of Object.entries({ db_Tim: ['tim_id', 'kode', 'nama', 'jenis', 'aktif'], db_Users: ['user_id', 'username', 'nama', 'role', 'tim_id', 'aktif'],
    db_Jenis_Pekerjaan: ['jenis_id', 'modul', 'nama'] })) x.sheets.m[n] = x.sheets.m[n] || buat(n, [h]);
  const J = x.sheets.m.db_Jaringan.data[0];
  const jar = (pen, sec, aktif) => J.map((k) => ({ penyulang: pen, section: sec, aktif, section_id: U(), urutan: 20, revision: 1 }[k] ?? ''));
  x.sheets.m.db_Jaringan.data.push(jar('PNY-B', 'SEC-9', true), jar('PNY-C', 'SEC-X', false));
  const diam = () => { const a = { l: console.log, w: console.warn }; console.log = () => {}; console.warn = () => {}; return () => { console.log = a.l; console.warn = a.w; }; };
  let pulih = diam();
  try { x.h.ADMIN_lengkapiMaster(); } finally { pulih(); }
  const D = x.h.JP_MASTER_HEADER_.db_Daerah_Padam;
  const t = x.sheets.m.db_Daerah_Padam;
  assert.ok(t, 'tab dibuat');
  assert.deepStrictEqual([...t.data[0].slice(0, D.length)], [...D]);
  const isi = t.data.slice(1).map((r) => [r[D.indexOf('penyulang')], r[D.indexOf('section')], r[D.indexOf('aktif')], r[D.indexOf('nomor')]]);
  assert.ok(isi.some((r) => r[0] === 'PNY-B' && r[1] === 'SEC-9' && r[2] === 'TRUE'), 'section aktif db_Jaringan ikut');
  assert.ok(!isi.some((r) => r[0] === 'PNY-C'), 'section nonaktif tidak ikut');
  assert.ok(t.data.slice(1).every((r) => /^[0-9a-f-]{36}$/.test(String(r[D.indexOf('daerah_id')]))), 'daerah_id terisi');
  // diisi admin lalu dijalankan ulang: tidak ada baris ganda, isian tidak ditimpa
  const n = t.data.length;
  const b = t.data.findIndex((r) => r[D.indexOf('section')] === 'SEC-9');
  t.data[b][D.indexOf('jumlah_gardu')] = 7;
  pulih = diam();
  try { x.h.ADMIN_lengkapiMaster(); } finally { pulih(); }
  assert.strictEqual(t.data.length, n, 'idempoten');
  assert.strictEqual(t.data[b][D.indexOf('jumlah_gardu')], 7);
});

test('v0.96.0: db_Kepemilikan_Material di SiSi_Master (dropdown kepemilikan, validasi simpanMaterialHartek, ADMIN_siapkanSheetHartek & ADMIN_lengkapiMaster)', () => {
  const x = konteksHartek();
  const Hk = x.h.HARTEK_MASTER_HEADER_.db_Kepemilikan_Material;
  assert.deepStrictEqual([...Hk], ['nomor', 'kepemilikan', 'aktif', 'kepemilikan_id', 'revision', 'timestamp_update', 'diubah_oleh']);
  x.sheets.m.db_Kepemilikan_Material = sheetPalsu([])('db_Kepemilikan_Material', [
    Hk.slice(),
    [1, 'PLN', true, 'kep-1', 1, '', ''],
    [2, 'Pelanggan', true, 'kep-2', 1, '', ''],
    [3, 'Nonaktif', false, 'kep-3', 1, '', ''],
  ]);
  const res = JSON.parse(JSON.stringify(x.h.getMaterialHartek_(x.sesi)));
  assert.deepStrictEqual(res.kepemilikan, [{ kepemilikanId: 'kep-1', nama: 'PLN' }, { kepemilikanId: 'kep-2', nama: 'Pelanggan' }]);
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  const pg = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0001' });
  const pk = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, jenisId: 'jh2', jumlahPekerjaan: 1 });
  assert.strictEqual(kodeError(() => x.h.simpanMaterialHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, materialId: 'mat-1', jumlah: 2, kepemilikan: 'Asing' })), 'KEPEMILIKAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.h.simpanMaterialHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, materialId: 'mat-1', jumlah: 2 })), 'FIELD_WAJIB', 'v0.97.0: kepemilikan wajib diisi');
  x.h.simpanMaterialHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, materialId: 'mat-1', jumlah: 2, kepemilikan: 'pelanggan' });
  const kM = x.h.HARTEK_HEADER_.db_Hartek_Material;
  assert.strictEqual(x.sheets.h.db_Hartek_Material.data[1][kM.indexOf('kepemilikan')], 'Pelanggan', 'nama baku dari master');
});

// ---------- v0.97.0: wajib isi, ubah pekerjaan, aturan rincian grounding ----------
test('v0.97.0: daerah + jumlah gawang wajib untuk PG Jaringan (Gardu / Non - Teknik ambil alamat dari db_Gardu)', () => {
  const x = konteksHartek();
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  const pny = { headerId: a.headerId, jenisPekerjaan: 'Jaringan', penyulang: 'PNY-A', section: 'SEC-1' };
  assert.strictEqual(kodeError(() => x.h.simpanPgHartek_(x.sesi, { ...pny, jumlahGawang: 3 })), 'FIELD_WAJIB', 'daerah kosong');
  assert.strictEqual(kodeError(() => x.h.simpanPgHartek_(x.sesi, { ...pny, daerah: 'Toboali' })), 'FIELD_WAJIB', 'jumlah gawang kosong');
  assert.strictEqual(x.sheets.h.db_Hartek_PenyulangGardu.data.length, 1, 'tidak ada baris yang lolos');
  const j = x.h.simpanPgHartek_(x.sesi, { ...pny, daerah: 'Toboali', jumlahGawang: 0 });
  assert.match(j.kodePg, /-PNY\.001$/, 'jumlah gawang 0 tetap sah (angka terisi)');
  const grd = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0001' });
  const kol = x.h.HARTEK_HEADER_.db_Hartek_PenyulangGardu;
  assert.strictEqual(x.sheets.h.db_Hartek_PenyulangGardu.data[2][kol.indexOf('daerah')], 'Jl. Merdeka', 'gardu tidak perlu isian petugas');
  assert.ok(grd.kodePg);
});

test('v0.97.0: jumlah pekerjaan wajib untuk semua pekerjaan, bukan hanya yang masuk GASPOL', () => {
  const x = konteksHartek();
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  const pg = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0001' });
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, jenisId: 'jh2' })), 'FIELD_WAJIB');
  assert.strictEqual(x.sheets.h.db_Hartek_Pekerjaan.data.length, 1);
  assert.ok(x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, jenisId: 'jh2', jumlahPekerjaan: 4 }).kodePekerjaan);
});

test('v0.97.0 / v0.97.4: ubahPekerjaanHartek mengubah jumlah dan/atau jenis pekerjaan (revision, hanya tim sendiri)', () => {
  const x = konteksHartek();
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  const pg = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0001' });
  const pk = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, jenisId: 'jh2', jumlahPekerjaan: 2 });
  assert.strictEqual(x.h.getHartekHarian_(x.sesi, {}).objek[0].pekerjaan[0].revision, 1, 'revision dikirim ke HP untuk ubah');
  const e = (sesi, d) => kodeError(() => x.h.ubahPekerjaanHartek_(sesi, d));
  assert.strictEqual(e(x.sesi, { pekerjaanId: pk.pekerjaanId, revision: 1 }), 'FIELD_WAJIB', 'jumlah wajib');
  assert.strictEqual(e(x.sesi, { pekerjaanId: pk.pekerjaanId, revision: 9, jumlahPekerjaan: 5 }), 'KONFLIK_REVISION');
  assert.strictEqual(e({ ...x.sesi, timId: 'tim-lain' }, { pekerjaanId: pk.pekerjaanId, revision: 1, jumlahPekerjaan: 5 }), 'BUKAN_MILIK_TIM');
  assert.strictEqual(e(x.sesi, { pekerjaanId: pk.pekerjaanId, revision: 1, jumlahPekerjaan: 5, pekerjaan: 'Ganti Isolator' }), 'PEKERJAAN_TIDAK_DIKENAL', 'master nonaktif ditolak');
  const u = x.h.ubahPekerjaanHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, revision: 1, jumlahPekerjaan: 5 });
  assert.deepStrictEqual([u.revision, u.kodePekerjaan], [2, pk.kodePekerjaan]);
  const kol = x.h.HARTEK_HEADER_.db_Hartek_Pekerjaan, b = x.sheets.h.db_Hartek_Pekerjaan.data[1];
  assert.deepStrictEqual([b[kol.indexOf('jumlah_pekerjaan')], b[kol.indexOf('pekerjaan')], b[kol.indexOf('revision')]], [5, 'Ganti Arrester', 2]);
  // v0.97.4: ubah pekerjaan + jumlah sekaligus, satuan ikut master pekerjaan baru
  const u2 = x.h.ubahPekerjaanHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, revision: 2, jenisId: 'jh1', jumlahPekerjaan: 1 });
  assert.deepStrictEqual([u2.revision, u2.pekerjaan, u2.jenisId, u2.satuanPekerjaan], [3, 'Pemerataan Beban Gardu', 'jh1', 'unit']);
  const b2 = x.sheets.h.db_Hartek_Pekerjaan.data[1];
  assert.deepStrictEqual([b2[kol.indexOf('pekerjaan')], b2[kol.indexOf('jenis_id')], b2[kol.indexOf('satuan_pekerjaan')], b2[kol.indexOf('jumlah_pekerjaan')], b2[kol.indexOf('revision')]], ['Pemerataan Beban Gardu', 'jh1', 'unit', 1, 3]);
  assert.strictEqual(x.sheets.h.db_Hartek_Pekerjaan.data.length, 2, 'diubah di tempat, bukan baris baru');
  assert.ok(x.h.endpoints_().ubahPekerjaanHartek.tulis === true && x.h.endpoints_().ubahPekerjaanHartek.menu === 'OPS_HARTEK_INPUT');
  assert.ok(x.sheets.a.log_Audit.data.some((r) => r[4] === 'HARTEK_PEKERJAAN_UBAH'));
});

test('v0.97.0: rincian grounding hanya untuk pekerjaan grounding; Pasang = sesudah saja, perbaikan = sebelum + sesudah', () => {
  const x = konteksHartek();
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  const pg = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0001' });
  const bukan = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, jenisId: 'jh2', jumlahPekerjaan: 1 });
  const baik = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, jenisId: 'jh4', jumlahPekerjaan: 1 });
  const pasang = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, jenisId: 'jh5', jumlahPekerjaan: 1 });
  assert.deepStrictEqual([x.h.groundingBolehHartek_('Ganti Arrester'), x.h.groundingBolehHartek_('Perbaikan Grounding'),
    x.h.groundingHanyaSesudahHartek_('Pasang Grounding'), x.h.groundingHanyaSesudahHartek_('Perbaikan Grounding')], [false, true, true, false]);
  const e = (id, d) => kodeError(() => x.h.simpanGroundingHartek_(x.sesi, { pekerjaanId: id, jenisPeralatan: 'Body', ...d }));
  assert.strictEqual(e(bukan.pekerjaanId, { hasilSebelum: 5, hasilSesudah: 2 }), 'PEKERJAAN_TIDAK_SESUAI');
  assert.strictEqual(e(baik.pekerjaanId, { hasilSebelum: 5 }), 'FIELD_WAJIB', 'sesudah wajib');
  assert.strictEqual(e(baik.pekerjaanId, { hasilSesudah: 2 }), 'FIELD_WAJIB', 'perbaikan: sebelum wajib');
  assert.strictEqual(e(pasang.pekerjaanId, { hasilSebelum: 5 }), 'FIELD_WAJIB', 'pasang: sesudah tetap wajib');
  assert.strictEqual(x.sheets.h.db_Hartek_Grounding.data.length, 1, 'tidak ada yang lolos');
  x.h.simpanGroundingHartek_(x.sesi, { pekerjaanId: baik.pekerjaanId, jenisPeralatan: 'Body', hasilSebelum: 7.5, hasilSesudah: 2 });
  x.h.simpanGroundingHartek_(x.sesi, { pekerjaanId: pasang.pekerjaanId, jenisPeralatan: 'Body', hasilSebelum: 9, hasilSesudah: 3 });
  const kol = x.h.HARTEK_HEADER_.db_Hartek_Grounding, d = x.sheets.h.db_Hartek_Grounding.data;
  assert.deepStrictEqual([d[1][kol.indexOf('hasil_sebelum')], d[1][kol.indexOf('hasil_sesudah')]], [7.5, 2]);
  assert.deepStrictEqual([d[2][kol.indexOf('hasil_sebelum')], d[2][kol.indexOf('hasil_sesudah')]], ['', 3], 'pasang grounding: nilai sebelum tidak ikut disimpan');
});

test('v0.98.11: db_jenis_peralatan di SiSi_Master dan nama_peralatan otomatis hasil grounding (Jaringan = nama switching section, Gardu = nomor gardu)', () => {
  const x = konteksHartek();
  const Hp = x.h.HARTEK_MASTER_HEADER_.db_jenis_peralatan;
  assert.deepStrictEqual([...Hp], ['nomor', 'jenis_peralatan', 'aktif', 'peralatan_id', 'revision', 'timestamp_update', 'diubah_oleh']);
  x.sheets.m.db_jenis_peralatan = sheetPalsu([])('db_jenis_peralatan', [
    Hp.slice(),
    [1, 'Trafo', true, 'alat-1', 1, '', ''],
    [2, 'Arrester', true, 'alat-2', 1, '', ''],
    [3, 'LBS', true, 'alat-3', 1, '', ''],
    [4, 'Nonaktif', false, 'alat-4', 1, '', ''],
  ]);
  x.sheets.m.db_Jaringan.data.push(['s-lbs', 'PNY-A', 'LBS Rias - LBS Bikang', '', 10, true, 1, '', '']);
  const res = JSON.parse(JSON.stringify(x.h.getMaterialHartek_(x.sesi)));
  assert.deepStrictEqual(res.jenisPeralatan, [
    { peralatanId: 'alat-1', nama: 'Trafo' },
    { peralatanId: 'alat-2', nama: 'Arrester' },
    { peralatanId: 'alat-3', nama: 'LBS' },
  ]);
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  const pgGrd = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'tb0001' });
  const pkGrd = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pgGrd.pgId, jenisId: 'jh4', jumlahPekerjaan: 1 });
  assert.strictEqual(
    kodeError(() => x.h.simpanGroundingHartek_(x.sesi, { pekerjaanId: pkGrd.pekerjaanId, jenisPeralatan: 'Asing', hasilSebelum: 8, hasilSesudah: 2 })),
    'JENIS_PERALATAN_TIDAK_VALID'
  );
  x.h.simpanGroundingHartek_(x.sesi, { pekerjaanId: pkGrd.pekerjaanId, jenisPeralatan: 'trafo', hasilSebelum: 8, hasilSesudah: 2 });
  const pgJar = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Jaringan', penyulang: 'PNY-A', section: 'LBS Rias - LBS Bikang', daerah: 'Rias', jumlahGawang: 2 });
  const pkJar = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pgJar.pgId, jenisId: 'jh5', jumlahPekerjaan: 1 });
  x.h.simpanGroundingHartek_(x.sesi, { pekerjaanId: pkJar.pekerjaanId, jenisPeralatan: 'lbs', hasilSesudah: 3 });
  const kol = x.h.HARTEK_HEADER_.db_Hartek_Grounding, d = x.sheets.h.db_Hartek_Grounding.data;
  assert.deepStrictEqual([d[1][kol.indexOf('jenis_peralatan')], d[1][kol.indexOf('nama_peralatan')]], ['Trafo', 'TB0001'], 'Gardu otomatis nomor gardu');
  assert.deepStrictEqual([d[2][kol.indexOf('jenis_peralatan')], d[2][kol.indexOf('nama_peralatan')]], ['LBS', 'LBS Rias'], 'Jaringan otomatis nama switching sesuai section');
});


test('v0.98.0: BA Penggantian Trafo: simpan dari gardu ada (AKTIF / TIDAK AKTIF -> AKTIF), foto nameplate sebelum + sesudah, buatPdf /v2/ba/penggantian-trafo, ubahBaGardu, kirimEam, updateMaster', () => {
  const x = siapkanPdf();
  x.atur();
  const garduRow = x.objek(x.HG, x.sheets.g.db_Gardu.data[1]); // TB0002 AKTIF
  const garduId = garduRow.gardu_id;
  const baId = U();
  const upGanti = (slot, buf = jpeg(800, 600), revisi = false) =>
    x.gg.uploadFotoBaGardu_(x.admin, {
      baId, jenis: 'Penggantian Trafo', slot, sumber: 'KAMERA',
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      ukuranByte: buf.length, data: buf.toString('base64'),
      ...(revisi ? { revisi: true } : {}),
    });
  // foto wajib: NAMEPLATE dan NAMEPLATE_SESUDAH
  upGanti('NAMEPLATE');
  const isiGanti = (tambah = {}) => ({
    baId, jenis: 'Penggantian Trafo', garduId, tanggalBa: x.hari, tanggalPekerjaan: x.hari,
    sectionId: x.sec.kb, alamat: 'Ds. Keposang Kec. Toboali', koordinat: '-3.012345, 106.456789',
    konstruksi: 'Cantol', kva: 100, merk: 'TRAFINDO', seri: '15069174', tahun: 2015, jurusan: 2,
    merkPhb: 'MZM', seriPhb: '195', tahunPhb: 2016, kepemilikan: 'PLN',
    kvaSesudah: 50, merkSesudah: 'SINARINDO', seriSesudah: '163308344', tahunSesudah: 2016,
    asalTrafo: 'Gudang UP3 (Rekondisi)', phbDiganti: false,
    merkPhbSesudah: 'MZM', seriPhbSesudah: '195', tahunPhbSesudah: 2016, jurusanSesudah: 2,
    alasan: 'Trafo rusak gangguan', tindakLanjut: 'Kembali ke Gudang ULP',
    petugas1Id: x.pj.a, petugas2Id: x.pj.b, ...tambah,
  });
  assert.strictEqual(kodeError(() => x.gg.simpanBaGardu_(x.admin, isiGanti())), 'FOTO_BELUM_LENGKAP');
  upGanti('NAMEPLATE_SESUDAH');
  const r = JSON.parse(JSON.stringify(x.gg.simpanBaGardu_(x.admin, isiGanti())));
  assert.deepStrictEqual([r.status, r.noGardu, r.garduId], ['OK', 'TB0002', garduId]);
  // cek db_Gardu diperbarui dengan data trafo sesudah
  const gAfter = x.objek(x.HG, x.sheets.g.db_Gardu.data[1]);
  assert.deepStrictEqual(
    [gAfter['Status Gardu'], gAfter['Kapasitas (kVA)'], gAfter.Merk, gAfter['Nomor Seri'], gAfter.Tahun, gAfter['Asal Trafo'], gAfter['Jenis BA Terakhir']],
    ['AKTIF', 50, 'SINARINDO', '163308344', 2016, 'Gudang UP3 (Rekondisi)', 'Penggantian Trafo']
  );
  // cek detail getBaGardu
  const det = JSON.parse(JSON.stringify(x.gg.getBaGardu_(x.admin, { baId })));
  assert.deepStrictEqual(
    [det.jenis, det.noGardu, det.kva, det.kvaSesudah, det.merkSesudah, det.seriSesudah, det.tahunSesudah, det.asalTrafo, det.phbDiganti, det.foto],
    ['Penggantian Trafo', 'TB0002', 100, 50, 'SINARINDO', '163308344', 2016, 'Gudang UP3 (Rekondisi)', false, ['NAMEPLATE', 'NAMEPLATE_SESUDAH']]
  );
  // buat PDF -> memanggil /v2/ba/penggantian-trafo tanpa fotoHilang meski hanya 2 foto nameplate
  x.panggil.length = 0;
  const pdf = JSON.parse(JSON.stringify(x.gg.buatPdfBaGardu_(x.admin, { baId })));
  assert.deepStrictEqual([pdf.statusPdf, pdf.namaFile, pdf.fotoHilang], ['SELESAI', `BA-Penggantian-${r.idBa}.pdf`, []]);
  const post = x.panggil.find((p) => p.metode === 'post');
  assert.strictEqual(post.url, 'https://sisi2-pdf-staging-xyz.a.run.app/v2/ba/penggantian-trafo');
  const payload = JSON.parse(post.o.payload);
  assert.deepStrictEqual(
    [payload.data.nomorTrafo, payload.data.kapasitas, payload.data.kapasitasSesudah, payload.data.merkSesudah, payload.data.nomorSeriSesudah, payload.data.asalTrafo],
    ['TB0002', '100', '50', 'SINARINDO', '163308344', 'Gudang UP3 (Rekondisi)']
  );
  // ubahBaGardu Penggantian Trafo
  const detTerbaru = x.gg.getBaGardu_(x.admin, { baId });
  const { jenis: _j, garduId: _g, tanggalBa: _tb, ...isiUbah } = isiGanti({ kvaSesudah: 160, merkSesudah: 'UNINDO' });
  const ub = JSON.parse(JSON.stringify(x.gg.ubahBaGardu_(x.admin, {
    ...isiUbah,
    revision: detTerbaru.revision,
  })));
  assert.strictEqual(ub.status, 'OK');
  assert.strictEqual(x.objek(x.HG, x.sheets.g.db_Gardu.data[1])['Kapasitas (kVA)'], 160);
  // buat ulang PDF + upload TTD + kirim EAM + updateMasterGarduBa
  x.gg.buatPdfBaGardu_(x.admin, { baId });
  kirimTtd(x, baId, pdfPalsu(3000));
  const eam = JSON.parse(JSON.stringify(x.gg.kirimEamBaGardu_(x.admin, { baId })));
  assert.ok(eam.teks.includes('*PENGGANTIAN TRAFO ULP TOBOALI*'));
  assert.ok(eam.teks.includes('*DATA TRAFO SEBELUM*'));
  assert.ok(eam.teks.includes('*DATA TRAFO SESUDAH*'));
  assert.ok(eam.teks.includes('Asal Trafo : Gudang UP3 (Rekondisi)'));
  x.sheets.g.db_Gardu.data[1][x.HG.indexOf('Merk')] = 'LAMA';
  const upMaster = JSON.parse(JSON.stringify(x.gg.updateMasterGarduBa_(x.admin, { baId })));
  assert.strictEqual(upMaster.status, 'OK');
  assert.strictEqual(x.objek(x.HG, x.sheets.g.db_Gardu.data[1]).Merk, 'UNINDO');
});

test('v0.98.7: Laporan UP3 & UIW menyertakan data Hartek (per penyulang, komulatif, tim, gardu, jaringan, non-teknik)', () => {
  const row = {
    perPenyulang: { Bikang: { rabas: 15, tebang: 0 } },
    komulatif: { rabas: 481, tebang: 334 },
    tim: [{ nama: 'ROW 01', kode: '01', penyulang: [{ penyulang: 'Bikang', section: 'ACR Gg. Mawar', rabas: 14, tebang: 0 }] }],
    target: { rabas: 20, tebang: 6 },
  };
  const hartek = {
    aktif: true,
    timLapor: 1,
    statusTim: 'SIAP',
    perPenyulang: {
      Kejaksaan: { gardu: 1, jaringan: 0 },
      'Tanjung Labu': { gardu: 1, jaringan: 0 },
    },
    komulatif: { gardu: 8, jaringan: 40 },
    penyulangUiw: ['Kejaksaan', 'Tanjung Labu'],
    sectionUiw: ['LBS SPBU Bukit - LBS Honda', 'LBS Pasir Putih - DSC Tj. Kemirai'],
    jaringan: [],
    gardu: [
      {
        noGardu: 'TB0032',
        pekerjaan: [
          { nama: 'Pasang Tiang Beton 9m', hasil: '2 Batang', material: [] },
          { nama: 'Bongkar Tiang Beton 9m', hasil: '1 Batang', material: [] },
        ],
      },
      {
        noGardu: 'TB0393',
        pekerjaan: [
          {
            nama: 'Perbaikan Trafo Rembes',
            hasil: '1 Set',
            material: [],
          },
          {
            nama: 'Perbaikan Grounding Gardu',
            hasil: '1 Titik',
            material: [],
            grounding: [{ jenisPeralatan: 'Body Trafo', hasilSebelum: '8.5', hasilSesudah: '2.1' }],
          },
          {
            nama: 'Pemerataan Beban Gardu',
            hasil: '1 Set',
            material: [],
            pemerataan: [{ noGardu: 'TB0393', sebR: '120', sebS: '95', sebT: '140', sesR: '118', sesS: '116', sesT: '121' }],
          },
        ],
      },
    ],
    nonTeknik: [],
  };
  const up3 = g.laporanUp3_(row, '2026-08-14', [], hartek);
  assert.ok(up3.includes('*C. Hartek* \uD83D\uDD27\n\n- Penyulang Kejaksaan\nTarget / Realisasi\n- Gardu : 1 Unit / 1 Unit\n- Jaringan : - Gawang / - Gawang'), up3);
  assert.ok(up3.includes('- Penyulang Tanjung Labu\nTarget / Realisasi\n- Gardu : 1 Unit / 1 Unit\n- Jaringan : - Gawang / - Gawang'), up3);
  assert.ok(up3.includes('*Komulatif*\n- Gardu : 8 Unit\n- Jaringan : 40 Gawang'), up3);

  const uiw = g.laporanUiw_(row, '2026-08-14', [], 'Cerah', hartek);
  assert.ok(uiw.includes('\uD83D\uDC77 Tim ROW : 1 Tim\n\uD83D\uDC77 Tim Hartek : 1 Tim\n\uD83C\uDF24\uFE0F Cuaca : Cerah'), uiw);
  assert.ok(uiw.includes('\u26A1 REALISASI PEKERJAAN HARTEK\nPenyulang : Kejaksaan, Tanjung Labu\nSection : LBS SPBU Bukit - LBS Honda, LBS Pasir Putih - DSC Tj. Kemirai'), uiw);
  assert.ok(uiw.includes('\uD83D\uDD27 PEKERJAAN JARINGAN\nPekerjaan : -\nMaterial : -'), uiw);
  assert.ok(uiw.includes('\uD83D\uDCCC PEKERJAAN GARDU\nGardu : *TB0032*\nPekerjaan :\n1. Pasang Tiang Beton 9m : 2 Batang\n2. Bongkar Tiang Beton 9m : 1 Batang\n\nGardu : *TB0393*\nPekerjaan :\n1. Perbaikan Trafo Rembes : 1 Set\n2. Perbaikan Grounding Gardu : 1 Titik\n3. Pemerataan Beban Gardu : 1 Set'), uiw);
  assert.ok(uiw.includes('Hasil Pengukuran Grounding (Body Trafo):\n- Sebelum : 8.5 \u03A9\n- Sesudah : 2.1 \u03A9'), uiw);
  assert.ok(uiw.includes('Beban Sebelum  Beban Sesudah\nR : 120A       R : 118A\nS : 95A        S : 116A\nT : 140A       T : 121A'), uiw);
  assert.ok(uiw.includes('PEKERJAAN NON-TEKNIK\nPekerjaan : -\nMaterial : -'), uiw);
});

test('v0.98.8: Migrasi Hartek v1 -> v2 (ADMIN_migrasiHartekCek, ADMIN_migrasiHartekJalan, ADMIN_migrasiHartekHapus)', () => {
  const mh = buatKonteks({ ...PROPS, HARTEK_SHEET_ID: 'h', GARDU_SHEET_ID: 'g', MIGHARTEK_SUMBER_ID: 's1', KODE_ULP: '16130' });
  mh.pastikanPemilik_ = () => {};
  const buat = (nama, data) => {
    const sh = sheetPalsu([])(nama, data);
    sh.getName = () => nama;
    sh.clearContents = () => { sh.data.splice(0, sh.data.length, []); };
    return sh;
  };
  const sheets = { h: {}, g: {}, a: {}, m: {}, s1: {} };
  for (const [nama, hdr] of Object.entries(mh.HARTEK_HEADER_)) {
    sheets.h[nama] = buat(nama, [hdr.slice()]);
  }
  sheets.g.db_Gardu = buat('db_Gardu', [
    ['No Gardu', 'gardu_id', 'Penyulang', 'Section', 'Alamat', 'Lat', 'Long'],
    ['TB0001', 'gar-1', 'PNY-A', 'SEC-1', 'Jl. Merdeka', -3.001, 106.451],
  ]);
  sheets.m.db_Tim = buat('db_Tim', [
    ['tim_id', 'jenis', 'nama', 'kode', 'aktif'],
    ['tim-h1', 'HARTEK', 'HARTEK 01', '01', true],
  ]);
  sheets.m.db_Jaringan = buat('db_Jaringan', [
    ['section_id', 'penyulang', 'section', 'parent_section_id', 'urutan', 'aktif'],
    ['j1', 'PNY-A', 'SEC-1', '', 1, true],
  ]);
  sheets.m.db_Jenis_Pekerjaan = buat('db_Jenis_Pekerjaan', [
    ['jenis_id', 'modul', 'nama', 'satuan', 'diameter_min', 'diameter_max', 'urutan', 'aktif', 'bobot', 'jenis_pekerjaan', 'kolom_gaspol'],
    ['jh1', 'HARTEK', 'Pemerataan Beban Gardu', 'set', '', '', 1, true, '', 'Gardu', 'penyeimbanganBeban'],
    ['jh2', 'HARTEK', 'Perbaikan Grounding', 'titik', '', '', 2, true, '', 'Jaringan', 'groundingTm'],
  ]);
  sheets.m.db_Material = buat('db_Material', [
    mh.HARTEK_MASTER_HEADER_.db_Material.slice(),
    [1, 'Kabel NYY', 'm', true, 'mat-1', 1, '', ''],
  ]);
  sheets.m.db_Kepemilikan_Material = buat('db_Kepemilikan_Material', [
    mh.HARTEK_MASTER_HEADER_.db_Kepemilikan_Material.slice(),
    [1, 'PLN', true, 'kep-1', 1, '', ''],
  ]);

  const kh = 'HAR-16130260814001';
  const kpgJar = kh + '-PNY.001';
  const kpgGrd1 = kh + '-GRD.001';
  const kpgGrd2 = kh + '-GRD.002'; // gardu sama (TB0001) di v1 -> digabung ke GRD.001
  const kpkJar = kpgJar + '-PKJ.001';
  const kpkGrd = kpgGrd2 + '-PKJ.001';
  const kmat = kpkJar + '-MAT.001';
  const kgnd = kpkJar + '-GND.001';
  const kpmr = kpkGrd + '-PMR.001';

  sheets.s1.db_Global_Header = buat('db_Global_Header', [
    ['No', 'Kode Header', 'ULP', 'Hari', 'Tanggal', 'Tim', 'Sub-Tim', 'Koordinat Awal', 'Koordinat Akhir', 'KM Awal', 'KM Akhir', 'Kendala', 'WA Text', 'TimeStamp', 'Input By', 'TimeStamp Update', 'Status Text WA'],
    [1, kh, 'Toboali', 'Jumat', '2026-08-14', 'Hartek', 'Hartek', '-3.001, 106.451', '-3.002, 106.452', 10, 25, 'Cerah', '*WA LAMA*', '2026-08-14 08:00:00', 'petugas_htk', '2026-08-14 16:00:00', 'OK'],
    [2, 'R01-16130260814001', 'Toboali', 'Jumat', '2026-08-14', 'ROW', 'ROW 01', '', '', '', '', '', '', '', '', '', ''],
  ]);
  sheets.s1.db_Hartek_PenyulangGardu = buat('db_Hartek_PenyulangGardu', [
    ['No', 'Kode Header', 'Kode PG', 'ULP', 'Hari', 'Tanggal', 'Jenis Pekerjaan', 'Penyulang', 'Section', 'Gardu', 'Daerah', 'Jumlah Gawang', 'TextWA', 'Input By', 'TimeStamp'],
    [1, kh, kpgJar, 'Toboali', 'Jumat', '2026-08-14', 'Jaringan', 'PNY-A', 'SEC-1', '', 'Desa Rias', 5, '', 'petugas_htk', '2026-08-14 09:00:00'],
    [2, kh, kpgGrd1, 'Toboali', 'Jumat', '2026-08-14', 'Pemeliharaan Gardu', '', '', 'tb 1', '', '', '', 'petugas_htk', '2026-08-14 10:00:00'],
    [3, kh, kpgGrd2, 'Toboali', 'Jumat', '2026-08-14', 'Gardu', '', '', 'TB0001', '', '', '', 'petugas_htk', '2026-08-14 10:30:00'],
  ]);
  sheets.s1.db_Hartek_Pekerjaan = buat('db_Hartek_Pekerjaan', [
    ['No', 'Kode Header', 'Kode PG', 'Kode Pekerjaan', 'ULP', 'Hari', 'Tanggal', 'Jenis Pekerjaan', 'Penyulang', 'Section', 'Gardu', 'Pekerjaan', 'Jumlah Pekerjaan', 'Satuan Pekerjaan', 'TextWA Material', 'Input By', 'Timestamp'],
    [1, kh, kpgJar, kpkJar, 'Toboali', 'Jumat', '2026-08-14', 'Jaringan', 'PNY-A', 'SEC-1', '', 'Perbaikan Grounding', 2, 'titik', '', 'petugas_htk', '2026-08-14 09:15:00'],
    [2, kh, kpgGrd2, kpkGrd, 'Toboali', 'Jumat', '2026-08-14', 'Gardu', '', '', 'TB0001', 'Pemerataan Beban Trafo', 1, 'set', '', 'petugas_htk', '2026-08-14 10:45:00'],
  ]);
  sheets.s1.db_Hartek_Material = buat('db_Hartek_Material', [
    ['No', 'Kode Header', 'Kode PG', 'Kode Pekerjaan', 'Kode Material', 'ULP', 'Hari', 'Tanggal', 'Jenis Pekerjaan', 'Penyulang', 'Section', 'Gardu', 'Pekerjaan', 'Material', 'Jumlah', 'Satuan', 'Kepemilikan', 'Input By', 'Timestamp'],
    [1, kh, kpgJar, kpkJar, kmat, 'Toboali', 'Jumat', '2026-08-14', 'Jaringan', 'PNY-A', 'SEC-1', '', 'Perbaikan Grounding', 'kabel nyy', 15, '', 'PLN', 'petugas_htk', '2026-08-14 09:20:00'],
  ]);
  sheets.s1.db_Hartek_HarGrounding = buat('db_Hartek_HarGrounding', [
    ['No', 'Kode Header', 'Kode PG', 'Kode Pekerjaan', 'Kode Grounding', 'Hari', 'Tanggal', 'Jenis Peralatan', 'Nama Peralatan', 'Penyulang', 'Section', 'Kondisi Tanah', 'Hasil Sebelum', 'Foto Sebelum', 'Link Foto Sebelum', 'Hasil Sesudah', 'Foto Sesudah', 'Link Foto Sesudah'],
    [1, kh, kpgJar, kpkJar, kgnd, 'Jumat', '2026-08-14', 'Arrester', 'Arr-01', 'PNY-A', 'SEC-1', 'Lembab', '8,5 Ω', '', 'https://drive.google.com/file/d/1234567890abcdefghij12345/view', '2.1', '', 'https://drive.google.com/file/d/1234567890abcdefghij67890/view'],
  ]);
  sheets.s1.db_Hartek_PemerataanBeban = buat('db_Hartek_PemerataanBeban', [
    ['No', 'Kode Header', 'Kode PG', 'Kode Pekerjaan', 'Kode Pemerataan', 'Hari', 'Tanggal', 'Penyulang', 'Section', 'Gardu', 'Alamat', 'Seb R', 'Foto Seb R', 'Link Seb R', 'Seb S', 'Foto Seb S', 'Link Seb S', 'Seb T', 'Foto Seb T', 'Link Seb T', 'Ses R', 'Foto Ses R', 'Link Ses R', 'Ses S', 'Foto Ses S', 'Link Ses S', 'Ses T', 'Foto Ses T', 'Link Ses T'],
    [1, kh, kpgGrd2, kpkGrd, kpmr, 'Jumat', '2026-08-14', '', '', 'TB0001', '', 90, '', '', 40, '', '', 30, '', '', 55, '', '', 52, '', '', 53, '', ''],
  ]);

  mh.SpreadsheetApp = {
    openById: (id) => ({
      getName: () => 'SS-' + id,
      getSheetByName: (n) => (sheets[id] || {})[n] || null,
      getSheets: () => Object.values(sheets[id] || {}),
      insertSheet: (n) => { sheets[id][n] = buat(n, [[]]); return sheets[id][n]; },
    }),
  };

  const diam = (fn) => {
    const a = { l: console.log, w: console.warn, e: console.error };
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    try { return fn(); } finally { console.log = a.l; console.warn = a.w; console.error = a.e; }
  };

  // 1) Dry-run: menulis mightk_Cek + mightk_Ringkas tanpa mengubah 6 tab db_Hartek_*
  const cek = diam(() => mh.ADMIN_migrasiHartekCek());
  assert.strictEqual(cek.karantina, 0);
  assert.strictEqual(sheets.h.db_Hartek_Header.data.length, 1, 'dry-run tidak menulis db_Hartek_Header');
  assert.ok(sheets.h.mightk_Cek && sheets.h.mightk_Ringkas, 'sheet laporan dry-run dibuat');

  // 2) Jalan: menulis ke 6 tab db_Hartek_* + mightk_Peta, dan idempoten saat dijalankan ulang
  const jalan1 = diam(() => mh.ADMIN_migrasiHartekJalan());
  assert.deepStrictEqual(
    [jalan1.header.ditulis, jalan1.pg.ditulis, jalan1.pekerjaan.ditulis, jalan1.material.ditulis, jalan1.grounding.ditulis, jalan1.pemerataan.ditulis],
    [1, 2, 2, 1, 1, 1],
    'PG GRD ganda pada gardu TB0001 digabung menjadi 1 PG GRD'
  );
  const jalan2 = diam(() => mh.ADMIN_migrasiHartekJalan());
  assert.deepStrictEqual(
    [jalan2.header.ditulis, jalan2.pg.ditulis, jalan2.pekerjaan.ditulis, jalan2.material.ditulis, jalan2.grounding.ditulis, jalan2.pemerataan.ditulis],
    [0, 0, 0, 0, 0, 0],
    'jalan ulang idempoten (0 baris baru)'
  );

  // Verifikasi isi baris hasil migrasi
  const kolPk = mh.HARTEK_HEADER_.db_Hartek_Pekerjaan;
  const rowPkGrd = sheets.h.db_Hartek_Pekerjaan.data.slice(1).find((r) => r[kolPk.indexOf('kode_pg')] === kpgGrd1);
  assert.strictEqual(rowPkGrd[kolPk.indexOf('pekerjaan')], 'Pemerataan Beban Gardu', 'Pemerataan Beban Trafo v1 -> Pemerataan Beban Gardu v2');
  assert.strictEqual(rowPkGrd[kolPk.indexOf('kode_pg')], kpgGrd1, 'anak PG kedua ikut ke PG pertama hasil gabung');
  assert.strictEqual(rowPkGrd[kolPk.indexOf('kolom_gaspol')], 'penyeimbanganBeban');

  const kolGr = mh.HARTEK_HEADER_.db_Hartek_Grounding;
  const rowGr = sheets.h.db_Hartek_Grounding.data[1];
  assert.deepStrictEqual(
    [rowGr[kolGr.indexOf('hasil_sebelum')], rowGr[kolGr.indexOf('hasil_sesudah')], rowGr[kolGr.indexOf('foto_sebelum_file_id')]],
    [8.5, 2.1, '1234567890abcdefghij12345']
  );

  // 3) Rollback: wajib MIGHARTEK_IZINKAN_HAPUS=TRUE, menghapus semua baris MIGRASI
  assert.strictEqual(kodeError(() => diam(() => mh.ADMIN_migrasiHartekHapus())), 'MIG_HAPUS_DIKUNCI');
  mh.PropertiesService.getScriptProperties().setProperty('MIGHARTEK_IZINKAN_HAPUS', 'TRUE');
  const hapus = diam(() => mh.ADMIN_migrasiHartekHapus());
  assert.deepStrictEqual([hapus.header, hapus.pg, hapus.pekerjaan, hapus.material, hapus.grounding, hapus.pemerataan], [1, 2, 2, 1, 1, 1]);
});


// ---------- v0.99.0: Laporan per Tim Yandal (admin) ----------
test('v0.99.0: getLaporanTimYandal: status login per shift, HP aktif, rekap & daftar P0, hanya admin, tanggal dibatasi', () => {
  const x = siapkanYandal();
  x.jam.atur('08:05:00');
  const s1 = x.mulai(x.login('16130.yandal13').tiket, [x.p.a, x.p.b]);
  barisP0(x, { p0_id: U(), shift_id: s1.yandal.shiftId, 'Kode P0': s1.yandal.kodeShift + '-P0.001', status: 'AKTIF', 'Status P0': 'SELESAI',
    'Status Approval': 'Approved', Point: 5, 'Nama Pekerjaan': 'Lain - Lain', 'Pekerjaan Lainnya': 'Ganti FCO', Penyulang: 'TB-01' });
  barisP0(x, { p0_id: U(), shift_id: s1.yandal.shiftId, 'Kode P0': s1.yandal.kodeShift + '-P0.002', status: 'AKTIF', 'Status P0': 'PROSES', 'Nama Pekerjaan': 'Pengecekan Gardu' });
  barisP0(x, { p0_id: U(), shift_id: s1.yandal.shiftId, 'Kode P0': s1.yandal.kodeShift + '-P0.003', status: 'BATAL', 'Status P0': 'PROSES' });
  x.jam.atur('09:30:00');
  const lap = (d = {}, sesi = x.sesiAdmin) => x.j(x.g.getLaporanTimYandal_(sesi, d));
  const r = lap();
  assert.strictEqual(r.tanggal, x.hari);
  assert.deepStrictEqual(r.tim.map((t) => t.nama), ['YANDAL 13', 'YANDAL 14', 'YANDAL 15', 'YANDAL 16', 'YANDAL 17']);
  assert.deepStrictEqual(r.ringkas, { shift: 1, jam: '08:00 - 16:00', jumlahTim: 5, sudahLogin: 1, belumLogin: 4 });
  const t13 = r.tim[0], t14 = r.tim[1];
  assert.deepStrictEqual(t13.shift.map((s) => s.status), ['LOGIN', 'BELUM_MULAI', 'BELUM_MULAI']);
  const a = t13.shift[0];
  assert.deepStrictEqual([a.petugas, a.checkIn, a.terlambat, a.jumlahLogin, a.hpAktif, a.login.length, a.login[0].perangkat],
    [['Andi', 'Budi'], x.hari + ' 08:05:00', 5, 1, 1, 1, 'HP Uji']);
  assert.deepStrictEqual([a.rekap.jumlahP0, a.rekap.proses, a.rekap.approved, a.rekap.totalPoint], [2, 1, 1, 5], 'P0 BATAL tidak dihitung');
  assert.deepStrictEqual(a.p0.map((p) => p.namaPekerjaan), ['Lain - Lain (Ganti FCO)', 'Pengecekan Gardu']);
  assert.deepStrictEqual([t14.shift[0].status, t14.shift[0].menitBelumLogin, t14.petugasAktif], ['BELUM_LOGIN', 90, 2]);
  // logout = HP tidak aktif lagi, shift tetap LOGIN
  const H = x.g.skemaHeader_().YANDAL_SHEET_ID.yan_Login;
  x.sheets.y.yan_Login.data[1][H.indexOf('Waktu Logout')] = new Date(x.jam.ms).toISOString();
  assert.deepStrictEqual([lap().tim[0].shift[0].status, lap().tim[0].shift[0].hpAktif], ['LOGIN', 0]);
  // sesudah shift: SELESAI / TIDAK_LOGIN, satu tim saja lewat timId
  x.jam.atur('17:00:00');
  const s = lap({ timId: x.tim.t14 });
  assert.deepStrictEqual([s.tim.length, s.tim[0].shift.map((v) => v.status)], [1, ['TIDAK_LOGIN', 'BELUM_LOGIN', 'BELUM_MULAI']]);
  assert.strictEqual(lap().tim[0].shift[0].status, 'SELESAI');
  // shift 3 = jam 00-08 hari berikutnya tetap tanggal operasional kemarin
  const besok = x.g.tglJakarta_(new Date(Date.parse(x.hari + 'T12:00:00+07:00') + 864e5));
  x.jam.atur('02:00:00', besok);
  const malam = lap();
  assert.deepStrictEqual([malam.tanggal, malam.ringkas.shift, malam.tim[0].shift[2].status], [x.hari, 3, 'BELUM_LOGIN']);
  assert.strictEqual(kodeError(() => lap({ tanggal: besok })), 'TANGGAL_DI_LUAR_BATAS', 'tanggal operasional belum tiba');
  assert.strictEqual(kodeError(() => lap({ tanggal: '2026-01-01' })), 'TANGGAL_DI_LUAR_BATAS', 'lebih dari 31 hari');
  // akses: PETUGAS (YANDAL / ROW) ditolak, ADMIN_ES boleh lihat
  assert.strictEqual(kodeError(() => lap({}, x.g.profilUser_(x.user.y13))), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => lap({}, x.g.profilUser_(x.user.row))), 'AKSES_DITOLAK');
  assert.ok(lap({}, { ...x.sesiAdmin, role: 'ADMIN_ES' }).tim.length);
  assert.deepStrictEqual(g.endpoints_().getLaporanTimYandal.menu, 'ROW_LAPORAN');
});

// ---------- v1.0.0: Inspeksi Jaringan (modules/73_InsJar.js) ----------
function konteksInsJar() {
  const h = buatKonteks({ ...PROPS, INSJAR_SHEET_ID: 'i', TEMUAN_SHEET_ID: 't', KODE_ULP: '16130' });
  const log = [];
  const buat = sheetPalsu(log);
  const sheets = { i: {}, t: {}, a: {}, m: {} };
  for (const [nama, hdr] of Object.entries(h.INSJAR_HEADER_)) sheets.i[nama] = buat(nama, [hdr.slice()]);
  for (const [nama, hdr] of Object.entries(h.TEMUAN_HEADER_)) sheets.t[nama] = buat(nama, [hdr.slice()]);
  sheets.a.log_Audit = buat('log_Audit', [['waktu', 'user_id', 'username', 'role', 'aksi', 'target', 'detail', 'platform', 'device_id']]);
  sheets.m.db_Jaringan = buat('db_Jaringan', [['section_id', 'penyulang', 'section', 'parent_section_id', 'urutan', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'],
    ['j1', 'PNY-A', 'SEC-2', '', 2, true, 1, '', ''], ['j2', 'PNY-A', 'SEC-1', '', 1, true, 1, '', ''], ['j3', 'PNY-B', 'SEC-X', '', 1, true, 1, '', '']]);
  sheets.m.db_Jenis_Temuan = buat('db_Jenis_Temuan', [h.INSJAR_MASTER_HEADER_.db_Jenis_Temuan.slice(),
    [1, 'Isolator retak', 'Jaringan', '', 2, true, 'jt-1', 1, '', ''], [2, 'Pohon dekat jaringan', '', '', 1, true, 'jt-2', 1, '', ''],
    [3, 'Trafo bocor', 'Gardu', '', 1, true, 'jt-3', 1, '', ''], [4, 'Lama', 'Jaringan', '', 3, false, 'jt-4', 1, '', '']]);
  h.SpreadsheetApp = { openById: (id) => { const bag = sheets[id]; return { getSheetByName: (n) => bag[n] || null, insertSheet: (n) => { bag[n] = buat(n, [[]]); return bag[n]; } }; } };
  const hariIni = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const sesi = { userId: 'u-ins', username: '16130.insjar01', role: 'PETUGAS', jenisTim: 'INSPEKSI_JARINGAN', timId: 'tim-i1', timNama: 'INSPEKSI 01', deviceId: 'dev1' };
  const admin = { userId: 'u-adm', username: '16130.admin', role: 'ADMIN', jenisTim: '', timId: '', timNama: '' };
  return { h, sheets, sesi, admin, hariIni };
}

test('v1.0.0 insjar: header IJR, penyulang utama PNY (master db_Jaringan), temuan TJR, jumlah temuan, harian berjenjang', () => {
  const x = konteksInsJar();
  const ymd = x.hariIni.slice(2, 4) + x.hariIni.slice(5, 7) + x.hariIni.slice(8, 10);
  assert.strictEqual(kodeError(() => x.h.buatHeaderInsJar_({ ...x.sesi, jenisTim: 'HARTEK' }, {})), 'AKSES_DITOLAK');
  const hd = x.h.buatHeaderInsJar_(x.sesi, { kmAwal: 10, koordinatAwal: '-3.01, 106.5' });
  assert.strictEqual(hd.kodeHeader, 'IJR-16130' + ymd + '001');
  assert.strictEqual(kodeError(() => x.h.buatHeaderInsJar_(x.sesi, {})), 'LAPORAN_UTAMA_SUDAH_DIBUAT');
  assert.strictEqual(x.h.buatHeaderInsJar_(x.sesi, { headerId: hd.headerId }).duplikat, true);
  assert.strictEqual(kodeError(() => x.h.ubahHeaderInsJar_(x.sesi, { headerId: hd.headerId, revision: 1, kmAkhir: 5 })), 'KM_AKHIR_KURANG');
  // dropdown: section urut kolom urutan, jenis temuan objek Jaringan / kosong + aktif saja
  const m = x.h.getMasterInsJar_(x.sesi);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m.penyulang)), [{ nama: 'PNY-A', section: ['SEC-1', 'SEC-2'] }, { nama: 'PNY-B', section: ['SEC-X'] }]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m.jenisTemuan.map((j) => j.nama))), ['Pohon dekat jaringan', 'Isolator retak']);
  assert.strictEqual(kodeError(() => x.h.simpanRealisasiInsJar_(x.sesi, { headerId: hd.headerId, penyulang: 'PNY-Z', tier: 'Tier 1', totalTiang: 3, section: 'SEC-1' })), 'PENYULANG_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.h.simpanRealisasiInsJar_(x.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', tier: 'Tier 1', totalTiang: 3, section: 'SEC-X' })), 'SECTION_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.h.simpanRealisasiInsJar_(x.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', tier: 'Tier 1', totalTiang: 3, sectionAwal: 'SEC-1' })), 'FIELD_TIDAK_DIKENAL', 'v1.0.5: section awal dihapus');
  assert.strictEqual(kodeError(() => x.h.simpanRealisasiInsJar_(x.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', tier: 'Tier 1', totalTiang: 3, segmen: 'A' })), 'FIELD_TIDAK_DIKENAL', 'v1.0.5: segmen penyulang utama dihapus');
  assert.strictEqual(kodeError(() => x.h.simpanRealisasiInsJar_(x.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', totalTiang: 3 })), 'FIELD_WAJIB');
  const r = x.h.simpanRealisasiInsJar_(x.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', tier: 'Tier 1', totalTiang: 12, section: 'SEC-2' });
  assert.strictEqual(r.kodeRealisasi, hd.kodeHeader + '-PNY.001');
  assert.strictEqual(kodeError(() => x.h.simpanRealisasiInsJar_(x.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', tier: 'Tier 1', totalTiang: 1, section: 'SEC-2' })), 'REALISASI_GANDA');
  assert.strictEqual(x.h.simpanRealisasiInsJar_(x.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', tier: 'Tier 2', totalTiang: 1, section: 'SEC-2' }).kodeRealisasi, hd.kodeHeader + '-PNY.002');
  // v1.0.5: section berbeda di penyulang + tier yang sama = baris penyulang utama baru
  assert.strictEqual(x.h.simpanRealisasiInsJar_(x.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', tier: 'Tier 1', totalTiang: 2, section: 'SEC-1' }).kodeRealisasi, hd.kodeHeader + '-PNY.003');
  assert.strictEqual(kodeError(() => x.h.simpanRealisasiInsJar_(x.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', tier: 'Tier 1', totalTiang: 1 })), 'FIELD_WAJIB', 'section wajib');
  // temuan petugas: penyulang dari penyulang utama, section wajib milik penyulang itu
  assert.strictEqual(kodeError(() => x.h.simpanTemuanInsJar_(x.sesi, { realisasiId: r.realisasiId, section: 'SEC-X', jenisTemuanId: 'jt-1' })), 'FIELD_TIDAK_DIKENAL', 'v1.0.5: petugas tidak kirim section');
  assert.strictEqual(kodeError(() => x.h.simpanTemuanInsJar_(x.sesi, { realisasiId: r.realisasiId, jenisTemuanId: 'jt-3' })), 'JENIS_TEMUAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.h.simpanTemuanInsJar_(x.sesi, { realisasiId: r.realisasiId, jenisTemuanId: 'jt-1', penyulang: 'PNY-B' })), 'FIELD_TIDAK_DIKENAL');
  const id = '0c0c0c0c-0000-4000-8000-0000000000aa';
  const t1 = x.h.simpanTemuanInsJar_(x.sesi, { realisasiId: r.realisasiId, jenisTemuanId: 'jt-1', nomorTiang: 'tb-12', koordinat: '-3.02, 106.51', idBaris: id });
  assert.deepStrictEqual([t1.kodeTemuan, t1.jumlahTemuan], [r.kodeRealisasi + '-TJR.001', 1]);
  assert.strictEqual(x.h.simpanTemuanInsJar_(x.sesi, { realisasiId: r.realisasiId, jenisTemuanId: 'jt-1', idBaris: id }).duplikat, true);
  assert.strictEqual(kodeError(() => x.h.simpanTemuanInsJar_({ ...x.sesi, timId: 'tim-lain' }, { realisasiId: r.realisasiId, jenisTemuanId: 'jt-1' })), 'BUKAN_MILIK_TIM');
  const kol = x.h.TEMUAN_HEADER_.db_temuan_inspeksi, baris = x.sheets.t.db_temuan_inspeksi.data[1];
  assert.deepStrictEqual([baris[kol.indexOf('penyulang')], baris[kol.indexOf('tier')], baris[kol.indexOf('nomor_tiang')], baris[kol.indexOf('lat')], baris[kol.indexOf('status')], baris[kol.indexOf('sumber')]],
    ['PNY-A', 'Tier 1', 'TB-12', -3.02, 'Penugasan Tim', 'INSPEKSI']);
  const kr = x.h.INSJAR_HEADER_.insjar_realisasi, rr = x.sheets.i.insjar_realisasi.data[1];
  assert.deepStrictEqual([rr[kr.indexOf('jumlah_temuan')], rr[kr.indexOf('revision')], rr[kr.indexOf('section')]], [1, 1, 'SEC-2'], 'jumlah temuan tanpa menaikkan revision');
  assert.ok(!kr.includes('section_awal') && !kr.includes('section_akhir') && !kr.includes('segmen'), 'v1.0.5: satu kolom section');
  const u = x.h.ubahRealisasiInsJar_(x.sesi, { realisasiId: r.realisasiId, revision: 1, totalTiang: 20 });
  assert.strictEqual(u.revision, 2);
  const hr = x.h.getInsJarHarian_(x.sesi, {});
  assert.deepStrictEqual([hr.header.kodeHeader, hr.realisasi.length, hr.realisasi[0].temuan.length, hr.realisasi[0].totalTiang], [hd.kodeHeader, 3, 1, 20]);
  // struktur dikunci
  x.sheets.i.insjar_realisasi.data[0][7] = 'nama_penyulang';
  assert.strictEqual(kodeError(() => x.h.getInsJarHarian_(x.sesi, {})), 'STRUKTUR_BERUBAH');
});

test('v1.0.0 Input Temuan Inspeksi (admin): form sama + penyulang, kode PEG bersama per tanggal, PNY per penyulang, petugas ditolak', () => {
  const x = konteksInsJar();
  const ymd = x.hariIni.slice(2, 4) + x.hariIni.slice(5, 7) + x.hariIni.slice(8, 10);
  assert.strictEqual(kodeError(() => x.h.simpanTemuanInspeksi_(x.sesi, {})), 'AKSES_DITOLAK');
  const mp = x.h.getMasterInsJar_(x.sesi), ma = x.h.getMasterTemuanInspeksi_(x.admin);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(mp.objekInspeksi)), ['Jaringan'], 'petugas jaringan objek dikunci');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ma.objekInspeksi)), ['Jaringan', 'Gardu'], 'admin memilih objek');
  assert.ok(ma.jenisTemuan.some((j) => j.objekInspeksi.includes('Gardu')), 'admin melihat master gardu');
  const peg = 'PEG-16130' + ymd + '001';
  const a = x.h.simpanTemuanInspeksi_(x.admin, { penyulang: 'PNY-A', section: 'SEC-2', jenisTemuanId: 'jt-2' });
  const b = x.h.simpanTemuanInspeksi_(x.admin, { penyulang: 'PNY-A', section: 'SEC-1', jenisTemuanId: 'jt-1' });
  const c = x.h.simpanTemuanInspeksi_(x.admin, { penyulang: 'PNY-B', section: 'SEC-X', jenisTemuanId: 'jt-1' });
  assert.deepStrictEqual([a.kodeTemuan, b.kodeTemuan, c.kodeTemuan], [peg + '-PNY.001-TJR.001', peg + '-PNY.001-TJR.002', peg + '-PNY.002-TJR.001']);
  assert.strictEqual(kodeError(() => x.h.simpanTemuanInspeksi_(x.admin, { penyulang: 'PNY-A', section: 'SEC-X', jenisTemuanId: 'jt-1' })), 'SECTION_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.h.simpanTemuanInspeksi_(x.admin, { penyulang: 'PNY-A', section: 'SEC-1', jenisTemuanId: 'jt-1', tanggal: '2099-01-01' })), 'TANGGAL_DI_LUAR_BATAS');
  assert.strictEqual(x.sheets.i.insjar_header.data.length, 1, 'admin tidak menulis header');
  const daftar = x.h.getTemuanInspeksi_(x.admin, {});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(daftar.temuan.map((t) => [t.sumber, t.tanggal]))), [['ADMIN', x.hariIni], ['ADMIN', x.hariIni], ['ADMIN', x.hariIni]]);
});

test('v1.0.4 temuan: tier_inspeksi di master menyaring jenis per object + tier dan ditulis ke sheet', () => {
  const x = konteksInsJar();
  const h = x.h.TEMUAN_HEADER_.db_temuan_inspeksi;
  const hm = x.h.INSJAR_MASTER_HEADER_.db_Jenis_Temuan;
  const sh = x.sheets.m.db_Jenis_Temuan;
  sh.data.push([5, 'Jaringan Tier 2', 'Jaringan', 'Tier 2', 4, true, 'jt-5', 1, '', '']);
  sh.data.push([6, 'Gardu Tier 1', 'Gardu', 'Tier 1', 5, true, 'jt-6', 1, '', '']);
  const m = x.h.getMasterTemuanInspeksi_(x.admin);
  const j = m.jenisTemuan.filter((z) => z.jenisTemuanId === 'jt-5')[0];
  assert.deepStrictEqual(JSON.parse(JSON.stringify(j.tierInspeksi)), ['Tier 2']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(j.objekInspeksi)), ['Jaringan']);
  const hd = x.h.buatHeaderInsJar_(x.sesi, {});
  const r = x.h.simpanRealisasiInsJar_(x.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', tier: 'Tier 2', totalTiang: 2, section: 'SEC-1' });
  const t = x.h.simpanTemuanInsJar_(x.sesi, { realisasiId: r.realisasiId, jenisTemuanId: 'jt-5', tierInspeksi: 'Tier 2', objekInspeksi: 'Jaringan' });
  const row = x.sheets.t.db_temuan_inspeksi.data[1];
  assert.strictEqual(row[h.indexOf('objek_inspeksi')], 'Jaringan');
  assert.strictEqual(row[h.indexOf('tier_inspeksi')], 'Tier 2');
  assert.strictEqual(kodeError(() => x.h.simpanTemuanInsJar_(x.sesi, { realisasiId: r.realisasiId, jenisTemuanId: 'jt-5', tierInspeksi: 'Tier 1', objekInspeksi: 'Jaringan' })), 'JENIS_TEMUAN_TIDAK_VALID');
  assert.ok(t.temuanId);
});

test('v1.0.0 ADMIN_siapkanSheetInsJar: buat 2 tab SiSi_InsJar + db_temuan_inspeksi di SiSi_Temuan + db_Jenis_Temuan, aman diulang', () => {
  const x = konteksInsJar();
  x.h.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  delete x.sheets.i.insjar_realisasi;
  delete x.sheets.t.db_temuan_inspeksi;
  x.sheets.m.db_Jenis_Temuan.data[1][x.h.INSJAR_MASTER_HEADER_.db_Jenis_Temuan.indexOf('jenis_temuan_id')] = '';
  assert.strictEqual(x.h.ADMIN_siapkanSheetInsJar(), 0);
  assert.deepStrictEqual(JSON.stringify(x.sheets.i.insjar_realisasi.data[0]), JSON.stringify(x.h.INSJAR_HEADER_.insjar_realisasi));
  assert.deepStrictEqual(JSON.stringify(x.sheets.t.db_temuan_inspeksi.data[0]), JSON.stringify(x.h.TEMUAN_HEADER_.db_temuan_inspeksi));
  assert.strictEqual(x.sheets.i.db_temuan_inspeksi, undefined, 'temuan tidak dibuat di SiSi_InsJar');
  assert.deepStrictEqual(Object.keys(x.h.INSJAR_HEADER_), ['insjar_header', 'insjar_realisasi']);
  const idCol = x.h.INSJAR_MASTER_HEADER_.db_Jenis_Temuan.indexOf('jenis_temuan_id');
  assert.match(String(x.sheets.m.db_Jenis_Temuan.data[1][idCol]), /^[0-9a-f-]{36}$/);
  assert.strictEqual(x.h.ADMIN_siapkanSheetInsJar(), 0);
});

test('v1.0.5 insjar: ubahTemuanInsJar (isian lengkap, revision, segmen hanya Jaringan), ubah section penyulang utama, foto menaikkan revision', () => {
  const x = konteksInsJar();
  const hd = x.h.buatHeaderInsJar_(x.sesi, {});
  const r = x.h.simpanRealisasiInsJar_(x.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', tier: 'Tier 1', totalTiang: 4, section: 'SEC-1' });
  const kr = x.h.INSJAR_HEADER_.insjar_realisasi;
  const u = x.h.ubahRealisasiInsJar_(x.sesi, { realisasiId: r.realisasiId, revision: 1, section: 'SEC-2' });
  assert.strictEqual(u.revision, 2);
  assert.strictEqual(x.sheets.i.insjar_realisasi.data[1][kr.indexOf('section')], 'SEC-2');
  assert.strictEqual(kodeError(() => x.h.ubahRealisasiInsJar_(x.sesi, { realisasiId: r.realisasiId, revision: 2, section: 'SEC-X' })), 'SECTION_TIDAK_VALID');
  const hr0 = x.h.getInsJarHarian_(x.sesi, {});
  assert.deepStrictEqual(Object.keys(hr0.realisasi[0]).filter((k) => /section|segmen/i.test(k)), ['section']);
  const t = x.h.simpanTemuanInsJar_(x.sesi, { realisasiId: r.realisasiId, jenisTemuanId: 'jt-1', nomorTiang: 'tb-1', segmen: 'SG-1', deskripsi: 'retak', koordinat: '-3.02, 106.51' });
  assert.strictEqual(t.revision, 1);
  const kol = x.h.TEMUAN_HEADER_.db_temuan_inspeksi, row = () => x.sheets.t.db_temuan_inspeksi.data[1];
  assert.strictEqual(row()[kol.indexOf('segmen')], 'SG-1');
  // ubah: isian lengkap, yang tidak dikirim dikosongkan; penyulang & kode tetap
  assert.strictEqual(kodeError(() => x.h.ubahTemuanInsJar_(x.sesi, { temuanId: t.temuanId, revision: 1, jenisTemuanId: 'jt-3' })), 'JENIS_TEMUAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.h.ubahTemuanInsJar_(x.sesi, { temuanId: t.temuanId, revision: 1, jenisTemuanId: 'jt-2', penyulang: 'PNY-B' })), 'FIELD_TIDAK_DIKENAL');
  assert.strictEqual(kodeError(() => x.h.ubahTemuanInsJar_({ ...x.sesi, timId: 'tim-lain' }, { temuanId: t.temuanId, revision: 1, jenisTemuanId: 'jt-2' })), 'BUKAN_MILIK_TIM');
  const ub = x.h.ubahTemuanInsJar_(x.sesi, { temuanId: t.temuanId, revision: 1, objekInspeksi: 'Jaringan', tierInspeksi: 'Tier 1', jenisTemuanId: 'jt-2', nomorTiang: 'tb-9' });
  assert.deepStrictEqual([ub.revision, ub.kodeTemuan, ub.temuan.jenisTemuan, ub.temuan.section, ub.temuan.nomorTiang, ub.temuan.penyulang], [2, t.kodeTemuan, 'Pohon dekat jaringan', 'SEC-2', 'TB-9', 'PNY-A']);
  assert.deepStrictEqual([row()[kol.indexOf('segmen')], row()[kol.indexOf('deskripsi')], row()[kol.indexOf('koordinat')], row()[kol.indexOf('lat')], row()[kol.indexOf('section_id')], row()[kol.indexOf('revision')]],
    ['', '', '', '', 'j1', 2], 'isian opsional yang tidak dikirim dikosongkan');
  assert.strictEqual(kodeError(() => x.h.ubahTemuanInsJar_(x.sesi, { temuanId: t.temuanId, revision: 1, jenisTemuanId: 'jt-2' })), 'KONFLIK_REVISION');
  // segmen admin: hanya object Jaringan
  const a1 = x.h.simpanTemuanInspeksi_(x.admin, { penyulang: 'PNY-A', section: 'SEC-1', jenisTemuanId: 'jt-1', objekInspeksi: 'Jaringan', segmen: 'SG-A' });
  // v1.0.11: object Gardu admin wajib memilih gardu (garduId), segmen tetap hanya Jaringan
  assert.strictEqual(kodeError(() => x.h.simpanTemuanInspeksi_(x.admin, { penyulang: 'PNY-A', section: 'SEC-1', jenisTemuanId: 'jt-3', objekInspeksi: 'Gardu', segmen: 'SG-B' })), 'FIELD_WAJIB');
  const seg = (id) => x.sheets.t.db_temuan_inspeksi.data.filter((b) => b[kol.indexOf('temuan_id')] === id)[0][kol.indexOf('segmen')];
  assert.deepStrictEqual([seg(a1.temuanId)], ['SG-A']);
  // temuan hari lain tidak bisa diubah
  row()[kol.indexOf('kode_header')] = 'IJR-16130200101001';
  row()[kol.indexOf('tanggal')] = '2020-01-01';
  assert.strictEqual(kodeError(() => x.h.ubahTemuanInsJar_(x.sesi, { temuanId: t.temuanId, revision: 2, jenisTemuanId: 'jt-2' })), 'TANGGAL_DI_LUAR_BATAS');
});

test('v1.0.5 insjar: section temuan = section penyulang utama (klien tidak memilih), section dikunci kalau sudah ada temuan, tambah section per penyulang + tier', () => {
  const x = konteksInsJar();
  const hd = x.h.buatHeaderInsJar_(x.sesi, {});
  const r1 = x.h.simpanRealisasiInsJar_(x.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', tier: 'Tier 1', totalTiang: 2, section: 'SEC-1' });
  const r2 = x.h.simpanRealisasiInsJar_(x.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', tier: 'Tier 1', totalTiang: 3, section: 'SEC-2' });
  const kt = x.h.TEMUAN_HEADER_.db_temuan_inspeksi, rowT = (id) => x.sheets.t.db_temuan_inspeksi.data.filter((b) => b[kt.indexOf('temuan_id')] === id)[0];
  const t2 = x.h.simpanTemuanInsJar_(x.sesi, { realisasiId: r2.realisasiId, jenisTemuanId: 'jt-1' });
  assert.deepStrictEqual([rowT(t2.temuanId)[kt.indexOf('section')], rowT(t2.temuanId)[kt.indexOf('section_id')], rowT(t2.temuanId)[kt.indexOf('realisasi_id')]], ['SEC-2', 'j1', r2.realisasiId]);
  assert.strictEqual(kodeError(() => x.h.ubahRealisasiInsJar_(x.sesi, { realisasiId: r2.realisasiId, revision: 1, tier: 'Tier 2', section: 'SEC-1' })), 'SECTION_TERKUNCI', 'section sudah ada temuan');
  assert.strictEqual(kodeError(() => x.h.ubahRealisasiInsJar_(x.sesi, { realisasiId: r1.realisasiId, revision: 1, section: 'SEC-2' })), 'REALISASI_GANDA', 'SEC-2 sudah dipakai');
  assert.strictEqual(x.h.ubahRealisasiInsJar_(x.sesi, { realisasiId: r1.realisasiId, revision: 1, tier: 'Tier 2' }).revision, 2, 'tanpa temuan boleh ganti tier');
  assert.strictEqual(kodeError(() => x.h.ubahRealisasiInsJar_(x.sesi, { realisasiId: r1.realisasiId, revision: 2, section: 'SEC-X' })), 'SECTION_TIDAK_VALID');
});

test('v1.0.5 ADMIN_siapkanSheetInsJar: kolom section_awal / section_akhir / segmen insjar_realisasi dihapus sesudah cadangan, data lain utuh', () => {
  const x = konteksInsJar();
  x.h.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  const salinan = [];
  x.h.DriveApp = { getFileById: (id) => ({ getName: () => 'SS-' + id, makeCopy: (n) => { salinan.push(n); return { getName: () => n, getId: () => 'cp' }; } }) };
  x.h.Utilities.formatDate = () => '2026-10-20 1100';
  const lama = ['nomor', 'kode_header', 'kode_realisasi', 'tanggal', 'hari', 'ulp', 'tim', 'penyulang', 'tier',
    'section_awal', 'section_akhir', 'section', 'segmen', 'total_tiang', 'jumlah_temuan', 'realisasi_id', 'header_id', 'tim_id',
    'dibuat_oleh', 'diubah_oleh', 'timestamp', 'timestamp_update', 'revision'];
  const isi = [1, 'IJR-1', 'IJR-1-PNY.001', '2026-10-20', 'Selasa', 'ULP', 'INSPEKSI 01', 'PNY-A', 'Tier 1',
    'SEC-1', 'SEC-2', 'SEC-1 s.d. SEC-2', 'SG', 7, 2, 'r1', 'h1', 'tim-i1', 'u', 'u', 't', 't', 3];
  const sh = x.sheets.i.insjar_realisasi;
  sh.data.length = 0; sh.data.push(lama.slice(), isi.slice());
  sh.deleteColumn = (c) => { sh.data.forEach((b) => b.splice(c - 1, 1)); };
  x.h.ADMIN_cekSheetInsJar();
  assert.deepStrictEqual(sh.data[0], lama, 'cek tidak mengubah apa pun');
  assert.strictEqual(x.h.ADMIN_siapkanSheetInsJar(), 0);
  assert.strictEqual(salinan.length, 1, 'cadangan dulu');
  assert.deepStrictEqual(JSON.stringify(sh.data[0]), JSON.stringify(x.h.INSJAR_HEADER_.insjar_realisasi));
  const k = x.h.INSJAR_HEADER_.insjar_realisasi;
  assert.deepStrictEqual([sh.data[1][k.indexOf('section')], sh.data[1][k.indexOf('total_tiang')], sh.data[1][k.indexOf('realisasi_id')], sh.data[1][k.indexOf('revision')]], ['SEC-1 s.d. SEC-2', 7, 'r1', 3]);
  assert.strictEqual(x.h.ADMIN_siapkanSheetInsJar(), 0);
  assert.strictEqual(salinan.length, 1, 'diulang: tidak ada yang dihapus lagi');
});

test('v1.0.6 laporan UP3/UIW: data inspeksi per penyulang (tiang, temuan Peralatan/ROW, rentang section) masuk teks UP3 dan UIW', () => {
  const x = konteksInsJar();
  const hd = x.h.buatHeaderInsJar_(x.sesi, {});
  const r1 = x.h.simpanRealisasiInsJar_(x.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', tier: 'Tier 1', totalTiang: 12, section: 'SEC-1' });
  const r2 = x.h.simpanRealisasiInsJar_(x.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', tier: 'Tier 1', totalTiang: 8, section: 'SEC-2' });
  x.h.simpanTemuanInsJar_(x.sesi, { realisasiId: r1.realisasiId, jenisTemuanId: 'jt-2' }); // Pohon dekat jaringan = ROW
  x.h.simpanTemuanInsJar_(x.sesi, { realisasiId: r2.realisasiId, jenisTemuanId: 'jt-1' }); // Isolator retak = Peralatan
  const d = x.h.dataInspeksiHari_(x.hariIni);
  assert.strictEqual(d.perPenyulang['PNY-A'].jaringan, 20);
  assert.strictEqual(d.komulatif.jaringan, 20);
  assert.deepStrictEqual([d.care[0].penyulang, d.care[0].section, d.care[0].tiang, d.care[0].peralatan, d.care[0].row], ['PNY-A', 'SEC-1 - SEC-2', 20, 1, 1]);
  const up3 = x.h.teksUp3_({ tanggal: x.hariIni, ulp: 'TOBOALI', row: { perPenyulang: {}, komulatif: { rabas: 0, tebang: 0 }, tim: [], inspeksi: d }, c4aUp3: [], target: { rabas: 20, tebang: 6 } });
  assert.ok(up3.includes('- Jaringan : 20 Gawang / 20 Gawang'), up3);
  assert.ok(up3.includes('*Komulatif*\n- Jaringan : 20 Gawang'), up3);
  const uiw = x.h.teksUiw_({ tanggal: x.hariIni, ulp: 'TOBOALI', row: { tim: [], inspeksi: d }, c4aUiw: [], cuaca: 'Cerah' });
  assert.ok(uiw.includes('Penyulang : PNY-A\nSection : SEC-1 - SEC-2\nPanjang : 1,00kmS\n\n🔎 Temuan\n\nPeralatan : 1 Titik\nROW : 1 Titik'), uiw);
  // tanpa data inspeksi UIW tetap pakai C4A manual
  const kosong = x.h.teksUiw_({ tanggal: x.hariIni, ulp: 'TOBOALI', row: { tim: [], inspeksi: { care: [] } }, c4aUiw: [], cuaca: '' });
  assert.ok(kosong.includes('Penyulang : -'));
});

// ---------- v1.0.0: foto lapangan Hartek (grounding / pemerataan) + Inspeksi Jaringan (temuan / tiang) ----------
function fotoUji(buf) {
  const b = buf || jpeg(1600, 1200);
  return { sha256: require('crypto').createHash('sha256').update(b).digest('hex'), ukuranByte: b.length, data: b.toString('base64') };
}

test('v1.0.0 hartek: kolom link Drive grounding + 4 foto pemerataan; uploadFotoHartek tulis file_id + link, ulang = DUPLIKAT, aturan slot', () => {
  const kg = buatKonteks(PROPS).HARTEK_HEADER_;
  const gr = kg.db_Hartek_Grounding, pm = kg.db_Hartek_PemerataanBeban;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(gr.slice(gr.indexOf('hasil_sesudah') + 1, gr.indexOf('grounding_id')))),
    ['foto_sebelum_file_id', 'foto_sebelum_link', 'foto_sesudah_file_id', 'foto_sesudah_link']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(pm.slice(pm.indexOf('ses_t') + 1, pm.indexOf('pemerataan_id')))),
    ['foto_arus_sebelum_file_id', 'foto_arus_sebelum_link', 'foto_tegangan_sebelum_file_id', 'foto_tegangan_sebelum_link',
     'foto_arus_sesudah_file_id', 'foto_arus_sesudah_link', 'foto_tegangan_sesudah_file_id', 'foto_tegangan_sesudah_link']);
  const x = konteksHartek();
  const dr = driveTiruan();
  x.h.DriveApp = dr.DriveApp;
  x.h.Utilities.newBlob = (bytes, mime, nama) => ({ bytes, mime, nama });
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  const pg = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0001' });
  const pk = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, pekerjaan: 'Pemerataan Beban Gardu', jumlahPekerjaan: 1 });
  const pr = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, pekerjaan: 'Perbaikan Grounding', jumlahPekerjaan: 1 });
  const ps = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, pekerjaan: 'Pasang Grounding', jumlahPekerjaan: 1 });
  const g1 = x.h.simpanGroundingHartek_(x.sesi, { pekerjaanId: pr.pekerjaanId, jenisPeralatan: 'Arrester', hasilSebelum: 5, hasilSesudah: 2 });
  const g2 = x.h.simpanGroundingHartek_(x.sesi, { pekerjaanId: ps.pekerjaanId, jenisPeralatan: 'Arrester', hasilSesudah: 2 });
  const p1 = x.h.simpanPemerataanHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, sebR: 40, sebS: 35, sebT: 30, sesR: 35, sesS: 35, sesT: 35 });
  const kirim = (jenis, idBaris, slot, sesi = x.sesi) => x.h.uploadFotoHartek_(sesi, { jenis, idBaris, slot, ...fotoUji() });
  assert.strictEqual(kodeError(() => kirim('grounding', g1.groundingId, 'SEBELUM')), 'CONFIG_TIDAK_LENGKAP', 'tanpa folder foto');
  x.h.PropertiesService.getScriptProperties().setProperty('HARTEK_FOTO_FOLDER_ID', 'akarH');
  assert.strictEqual(kodeError(() => kirim('grounding', g1.groundingId, 'ARUS_SEBELUM')), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => kirim('grounding', g2.groundingId, 'SEBELUM')), 'PEKERJAAN_TIDAK_SESUAI', 'pasang grounding: hanya sesudah');
  assert.strictEqual(kodeError(() => kirim('grounding', g1.groundingId, 'SEBELUM', { ...x.sesi, timId: 'tim-lain' })), 'BUKAN_MILIK_TIM');
  assert.strictEqual(kodeError(() => x.h.uploadFotoHartek_(x.sesi, { jenis: 'grounding', idBaris: g1.groundingId, slot: 'SEBELUM', ...fotoUji(), sha256: 'a'.repeat(64) })), 'FOTO_RUSAK');
  const h1 = kirim('grounding', g1.groundingId, 'SEBELUM');
  assert.match(h1.link, /^https:\/\/drive\.google\.com\/file\/d\/file\d+\/view$/);
  assert.strictEqual(kirim('grounding', g1.groundingId, 'SEBELUM').status, 'DUPLIKAT');
  for (const s of ['ARUS_SEBELUM', 'TEGANGAN_SEBELUM', 'ARUS_SESUDAH', 'TEGANGAN_SESUDAH']) assert.strictEqual(kirim('pemerataan', p1.pemerataanId, s).status, 'OK');
  assert.strictEqual(dr.dibuat.length, 5, '1 grounding + 4 pemerataan, ulang tidak membuat file');
  const baris = x.sheets.h.db_Hartek_Grounding.data[1];
  assert.deepStrictEqual(JSON.parse(JSON.stringify([baris[gr.indexOf('foto_sebelum_link')], baris[gr.indexOf('foto_sebelum_file_id')]])), [h1.link, dr.dibuat[0]]);
  assert.strictEqual(dr.semuaFile[dr.dibuat[0]].nama, g1.kodeGrounding + '_SEBELUM.jpg');
  const pohon = x.h.getHartekHarian_(x.sesi, {});
  const pkS = pohon.objek[0].pekerjaan;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(Object.keys(pkS.find((k) => k.pekerjaanId === pk.pekerjaanId).pemerataan[0].foto).sort())), ['ARUS_SEBELUM', 'ARUS_SESUDAH', 'TEGANGAN_SEBELUM', 'TEGANGAN_SESUDAH']);
  assert.strictEqual(pkS.find((k) => k.pekerjaanId === pr.pekerjaanId).grounding[0].foto.SEBELUM, h1.link);
});

test('v1.0.0 insjar: kolom link foto temuan + tiang; upload petugas (tim sendiri) dan admin (hanya temuan sumber ADMIN)', () => {
  const kt = buatKonteks(PROPS).TEMUAN_HEADER_.db_temuan_inspeksi;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(kt.slice(kt.indexOf('lng') + 1, kt.indexOf('status')))), ['foto_temuan_file_id', 'foto_temuan_link', 'foto_tiang_file_id', 'foto_tiang_link']);
  const x = konteksInsJar();
  const dr = driveTiruan();
  x.h.DriveApp = dr.DriveApp;
  x.h.Utilities.newBlob = (bytes, mime, nama) => ({ bytes, mime, nama });
  x.h.PropertiesService.getScriptProperties().setProperty('INSJAR_FOTO_FOLDER_ID', 'akarI');
  const hd = x.h.buatHeaderInsJar_(x.sesi, {});
  const r = x.h.simpanRealisasiInsJar_(x.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', tier: 'Tier 1', totalTiang: 3, section: 'SEC-1' });
  const t = x.h.simpanTemuanInsJar_(x.sesi, { realisasiId: r.realisasiId, jenisTemuanId: 'jt-1' });
  const ta = x.h.simpanTemuanInspeksi_(x.admin, { penyulang: 'PNY-B', section: 'SEC-X', jenisTemuanId: 'jt-2' });
  const up = (fn, sesi, temuanId, slot) => x.h[fn](sesi, { temuanId, slot, ...fotoUji() });
  assert.strictEqual(kodeError(() => up('uploadFotoInsJar_', x.admin, t.temuanId, 'TEMUAN')), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => up('uploadFotoInsJar_', x.sesi, t.temuanId, 'GARDU')), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(up('uploadFotoInsJar_', x.sesi, t.temuanId, 'TEMUAN').status, 'OK');
  assert.strictEqual(up('uploadFotoInsJar_', x.sesi, t.temuanId, 'TIANG').status, 'OK');
  assert.strictEqual(kodeError(() => up('uploadFotoTemuanInspeksi_', x.admin, t.temuanId, 'TEMUAN')), 'BUKAN_MILIK_TIM', 'admin tidak menimpa temuan petugas');
  assert.strictEqual(up('uploadFotoTemuanInspeksi_', x.admin, ta.temuanId, 'TEMUAN').status, 'OK');
  const hr = x.h.getInsJarHarian_(x.sesi, {});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(Object.keys(hr.realisasi[0].temuan[0].foto).sort())), ['TEMUAN', 'TIANG']);
  const baris = x.sheets.t.db_temuan_inspeksi.data[1];
  assert.match(String(baris[kt.indexOf('foto_tiang_link')]), /^https:\/\/drive\.google\.com\/file\/d\//);
  assert.strictEqual(dr.semuaFile[dr.dibuat[0]].nama, t.kodeTemuan + '_TEMUAN.jpg');
});

test('v1.0.0 SiSi_Temuan terpisah: input temuan admin cukup TEMUAN_SHEET_ID, kosong = CONFIG_TIDAK_LENGKAP', () => {
  const x = konteksInsJar();
  const props = x.h.PropertiesService.getScriptProperties();
  props.setProperty('INSJAR_SHEET_ID', '');
  x.h.CacheService && x.h.CacheService.getScriptCache && x.h.CacheService.getScriptCache().removeAll && x.h.CacheService.getScriptCache().removeAll([]);
  const a = x.h.simpanTemuanInspeksi_(x.admin, { penyulang: 'PNY-A', section: 'SEC-1', jenisTemuanId: 'jt-1' });
  assert.match(a.kodeTemuan, /-TJR\.001$/);
  assert.strictEqual(x.sheets.t.db_temuan_inspeksi.data.length, 2);
  assert.strictEqual(kodeError(() => x.h.buatHeaderInsJar_(x.sesi, {})), 'CONFIG_TIDAK_LENGKAP');
  props.setProperty('TEMUAN_SHEET_ID', '');
  assert.strictEqual(kodeError(() => x.h.getTemuanInspeksi_(x.admin, {})), 'CONFIG_TIDAK_LENGKAP');
});

test('v1.0.2 guard hartek + insjar: slot prototipe ditolak, Laporan Utama non-AKTIF terkunci, tim lain / hari lain ditolak', () => {
  const x = konteksHartek();
  x.h.DriveApp = driveTiruan().DriveApp;
  x.h.Utilities.newBlob = (bytes, mime, nama) => ({ bytes, mime, nama });
  x.h.PropertiesService.getScriptProperties().setProperty('HARTEK_FOTO_FOLDER_ID', 'akarH');
  const a = x.h.buatHeaderHartek_(x.sesi, {});
  const pg = x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0001' });
  const pk = x.h.simpanPekerjaanHartek_(x.sesi, { pgId: pg.pgId, pekerjaan: 'Perbaikan Grounding', jumlahPekerjaan: 1 });
  const g = x.h.simpanGroundingHartek_(x.sesi, { pekerjaanId: pk.pekerjaanId, jenisPeralatan: 'Arrester', hasilSebelum: 5, hasilSesudah: 2 });
  for (const slot of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.strictEqual(kodeError(() => x.h.uploadFotoHartek_(x.sesi, { jenis: 'grounding', idBaris: g.groundingId, slot, ...fotoUji() })), 'PILIHAN_TIDAK_VALID', slot);
  }
  assert.strictEqual(kodeError(() => x.h.uploadFotoHartek_({ ...x.sesi, jenisTim: 'INSPEKSI_JARINGAN' }, { jenis: 'grounding', idBaris: g.groundingId, slot: 'SESUDAH', ...fotoUji() })), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.h.uploadFotoHartek_(x.sesi, { jenis: 'pemerataan', idBaris: g.groundingId, slot: 'ARUS_SEBELUM', ...fotoUji() })), 'DATA_TIDAK_DITEMUKAN', 'ID grounding bukan pemerataan');
  // Laporan Utama dibatalkan: tidak bisa diisi lagi
  const kh = x.h.HARTEK_HEADER_.db_Hartek_Header;
  x.sheets.h.db_Hartek_Header.data[1][kh.indexOf('status')] = 'BATAL';
  assert.strictEqual(kodeError(() => x.h.simpanPgHartek_(x.sesi, { headerId: a.headerId, jenisPekerjaan: 'Gardu', noGardu: 'TB0002' })), 'SUDAH_BATAL');

  const y = konteksInsJar();
  y.h.DriveApp = driveTiruan().DriveApp;
  y.h.Utilities.newBlob = (bytes, mime, nama) => ({ bytes, mime, nama });
  y.h.PropertiesService.getScriptProperties().setProperty('INSJAR_FOTO_FOLDER_ID', 'akarI');
  const hd = y.h.buatHeaderInsJar_(y.sesi, {});
  const r = y.h.simpanRealisasiInsJar_(y.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', tier: 'Tier 1', totalTiang: 3, section: 'SEC-1' });
  const t = y.h.simpanTemuanInsJar_(y.sesi, { realisasiId: r.realisasiId, jenisTemuanId: 'jt-1' });
  for (const slot of ['constructor', '__proto__', 'GARDU']) {
    assert.strictEqual(kodeError(() => y.h.uploadFotoInsJar_(y.sesi, { temuanId: t.temuanId, slot, ...fotoUji() })), 'PILIHAN_TIDAK_VALID', slot);
  }
  assert.strictEqual(kodeError(() => y.h.uploadFotoInsJar_({ ...y.sesi, timId: 'tim-lain' }, { temuanId: t.temuanId, slot: 'TEMUAN', ...fotoUji() })), 'BUKAN_MILIK_TIM');
  assert.strictEqual(kodeError(() => y.h.uploadFotoTemuanInspeksi_(y.sesi, { temuanId: t.temuanId, slot: 'TEMUAN', ...fotoUji() })), 'AKSES_DITOLAK', 'petugas tidak lewat endpoint admin');
  assert.strictEqual(kodeError(() => y.h.simpanTemuanInspeksi_({ ...y.admin, role: 'PETUGAS' }, { penyulang: 'PNY-A', section: 'SEC-1', jenisTemuanId: 'jt-1' })), 'AKSES_DITOLAK');
  // ID baris tim lain dipakai ulang = ID_DIPAKAI (tidak membocorkan / menimpa temuan tim lain)
  assert.strictEqual(kodeError(() => y.h.simpanTemuanInspeksi_(y.admin, { penyulang: 'PNY-A', section: 'SEC-1', jenisTemuanId: 'jt-1', idBaris: t.temuanId })), 'ID_DIPAKAI');
  // header hari lain tidak bisa diisi petugas
  const kj = y.h.INSJAR_HEADER_.insjar_header;
  y.sheets.i.insjar_header.data[1][kj.indexOf('kode_header')] = 'IJR-16130200101001';
  assert.strictEqual(kodeError(() => y.h.simpanRealisasiInsJar_(y.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', tier: 'Tier 2', totalTiang: 1, section: 'SEC-1' })), 'TANGGAL_DI_LUAR_BATAS');
  y.sheets.i.insjar_header.data[1][kj.indexOf('kode_header')] = hd.kodeHeader;
  y.sheets.i.insjar_header.data[1][kj.indexOf('status')] = 'BATAL';
  assert.strictEqual(kodeError(() => y.h.simpanRealisasiInsJar_(y.sesi, { headerId: hd.headerId, penyulang: 'PNY-A', tier: 'Tier 2', totalTiang: 1, section: 'SEC-1' })), 'SUDAH_BATAL');
});

/* ===== v1.0.8 Inspeksi Gardu (74_InsDu.js) ===== */

function konteksInsDu() {
  const x = konteksInsJar();
  const h = x.h;
  h.PropertiesService.getScriptProperties().setProperty('INSDU_SHEET_ID', 'd');
  h.PropertiesService.getScriptProperties().setProperty('GARDU_SHEET_ID', 'g');
  const buat = sheetPalsu([]);
  x.sheets.d = {};
  for (const [nama, hdr] of Object.entries(h.headerInsDu_())) x.sheets.d[nama] = buat(nama, [hdr.slice()]);
  const HG = [...h.DB_GARDU_HEADER_];
  const gb = (isi) => HG.map((k) => (isi[k] === undefined ? '' : isi[k]));
  const gid = { a: 'gd-a', b: 'gd-b', mati: 'gd-mati', lain: 'gd-lain' };
  x.sheets.g = { db_Gardu: buat('db_Gardu', [HG,
    gb({ No: 1, 'No Gardu': 'TB0101', Prefix: 'TB', 'Status Gardu': 'AKTIF', Alamat: 'Jl. Sangkar', Penyulang: 'PNY-A', Section: 'SEC-1',
         'Kapasitas (kVA)': 100, Merk: 'Trafindo', 'Tanggal Ukur Terakhir': '2026-01-05', gardu_id: gid.a, section_id: 'j2', revision: 1 }),
    gb({ No: 2, 'No Gardu': 'TB0102', Prefix: 'TB', 'Status Gardu': 'AKTIF', Penyulang: 'PNY-A', Section: 'SEC-2', 'Kapasitas (kVA)': 50, gardu_id: gid.b, revision: 1 }),
    gb({ No: 3, 'No Gardu': 'TB0103', Prefix: 'TB', 'Status Gardu': 'TIDAK AKTIF', Penyulang: 'PNY-A', gardu_id: gid.mati, revision: 1 }),
    gb({ No: 4, 'No Gardu': 'PY0001', Prefix: 'PY', 'Status Gardu': 'AKTIF', Penyulang: 'PNY-B', 'Kapasitas (kVA)': 25, gardu_id: gid.lain, revision: 1 })]) };
  const sesi = { userId: 'u-igd', username: '16130.insdu01', role: 'PETUGAS', jenisTim: 'INSPEKSI_GARDU', timId: 'tim-g1', timNama: 'INSPEKSI GARDU 01', deviceId: 'dev1' };
  const ymd = x.hariIni.slice(2, 4) + x.hariIni.slice(5, 7) + x.hariIni.slice(8, 10);
  const kmrn = new Date(Date.parse(x.hariIni + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
  const ymdK = kmrn.slice(2, 4) + kmrn.slice(5, 7) + kmrn.slice(8, 10);
  // geser semua data hari ini (SiSi_InsDu + temuan) ke kemarin: tanggal dibaca dari kode_header
  const keKemarin = () => {
    for (const bag of [x.sheets.d, x.sheets.t]) for (const sh of Object.values(bag)) sh.data.forEach((b, i) => {
      if (!i) return;
      b.forEach((v, j) => { if (typeof v === 'string') b[j] = v.split('IGD-16130' + ymd).join('IGD-16130' + ymdK).split(x.hariIni).join(kmrn); });
    });
  };
  const nilai = { bebanR: 80, bebanS: 60, bebanT: 70, bebanN: 12, teganganRS: 395, teganganRT: 398, teganganST: 396, teganganRN: 228, teganganSN: 230, teganganTN: 229 };
  const cover = { coverFcoAtas: 'Lengkap', coverFcoBawah: 'Lengkap', coverBushingTm: 'Belum Lengkap', coverBushingTr: 'Lengkap', coverArrester: 'Tidak Ada', jumperanAtas: 'A3C', jumperanBawah: 'A3CS' };
  const kol = (tab, nama) => h.headerInsDu_()[tab].indexOf(nama);
  const kg = (b, n) => x.sheets.g.db_Gardu.data[b][HG.indexOf(n)];
  return { ...x, sesi, gid, ymd, kmrn, keKemarin, nilai, cover, kol, kg };
}

test('v1.0.8 insdu: struktur 3 tab (header = insjar_header), kolom unik, kolom baru db_temuan_inspeksi', () => {
  const H = g.headerInsDu_();
  assert.deepStrictEqual(Object.keys(H), ['db_insdu_header', 'db_insdu_realisasi', 'db_insdu_pengukuran']);
  assert.deepStrictEqual(H.db_insdu_header, g.INSJAR_HEADER_.insjar_header);
  for (const n of Object.keys(H)) assert.strictEqual(new Set(H[n]).size, H[n].length, n + ' kolom unik');
  for (const k of ['lwbp_waktu', 'lwbp_beban_r', 'lwbp_kategori_beban', 'wbp_waktu', 'wbp_tegangan_tn', 'wbp_ketidakseimbangan', 'cover_fco_atas', 'jumperan_bawah', 'catatan']) assert.ok(H.db_insdu_pengukuran.includes(k), k);
  for (const k of ['no_gardu', 'status_ukur', 'jumlah_temuan_lanjutan', 'gardu_id']) assert.ok(H.db_insdu_realisasi.includes(k), k);
  const T = g.TEMUAN_HEADER_.db_temuan_inspeksi;
  assert.strictEqual(T.indexOf('no_gardu'), T.indexOf('nomor_tiang') + 1);
  assert.ok(T.includes('gardu_id') && T.includes('temuan_asal_id'));
});

test('v1.0.8 insdu: header IGD, gardu dari db_Gardu, GARDU_GANDA, LWBP (cover wajib) lalu WBP, db_Gardu ikut, laporan hanya gardu ber-LWBP', () => {
  const x = konteksInsDu();
  assert.strictEqual(kodeError(() => x.h.buatHeaderInsDu_({ ...x.sesi, jenisTim: 'INSPEKSI_JARINGAN' }, {})), 'AKSES_DITOLAK');
  const hd = x.h.buatHeaderInsDu_(x.sesi, { kmAwal: 5 });
  assert.strictEqual(hd.kodeHeader, 'IGD-16130' + x.ymd + '001');
  assert.strictEqual(kodeError(() => x.h.buatHeaderInsDu_(x.sesi, {})), 'LAPORAN_UTAMA_SUDAH_DIBUAT');
  const m = x.h.getMasterInsDu_(x.sesi);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m.gardu.map((z) => z.noGardu))), ['PY0001', 'TB0101', 'TB0102'], 'hanya AKTIF');
  assert.ok(m.jenisTemuan.some((j) => j.nama === 'Trafo bocor') && !m.jenisTemuan.some((j) => j.nama === 'Isolator retak'), 'jenis objek Gardu');
  assert.strictEqual(m.cover.length, 7);
  assert.strictEqual(kodeError(() => x.h.simpanRealisasiInsDu_(x.sesi, { headerId: hd.headerId, garduId: x.gid.mati, tier: 'Tier 1' })), 'GARDU_TIDAK_AKTIF');
  assert.strictEqual(kodeError(() => x.h.simpanRealisasiInsDu_(x.sesi, { headerId: hd.headerId, garduId: 'zz', tier: 'Tier 1' })), 'GARDU_TIDAK_DIKENAL');
  const r1 = x.h.simpanRealisasiInsDu_(x.sesi, { headerId: hd.headerId, garduId: x.gid.a, tier: 'Tier 1' });
  assert.strictEqual(r1.kodeRealisasi, hd.kodeHeader + '-GDU.001');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r1.temuanLanjutan)), []);
  const rr = x.sheets.d.db_insdu_realisasi.data[1];
  assert.deepStrictEqual([rr[x.kol('db_insdu_realisasi', 'no_gardu')], rr[x.kol('db_insdu_realisasi', 'penyulang')], rr[x.kol('db_insdu_realisasi', 'merk_trafo')], rr[x.kol('db_insdu_realisasi', 'status_ukur')]],
    ['TB0101', 'PNY-A', 'Trafindo', 'BELUM']);
  assert.strictEqual(kodeError(() => x.h.simpanRealisasiInsDu_(x.sesi, { headerId: hd.headerId, garduId: x.gid.a, tier: 'Tier 2' })), 'GARDU_GANDA');
  const r2 = x.h.simpanRealisasiInsDu_(x.sesi, { headerId: hd.headerId, garduId: x.gid.b, tier: 'Tier 1' });
  // urutan + cover
  assert.strictEqual(kodeError(() => x.h.simpanPengukuranInsDu_(x.sesi, { realisasiId: r1.realisasiId, periode: 'WBP', ...x.nilai })), 'URUTAN_PENGUKURAN');
  assert.strictEqual(kodeError(() => x.h.simpanPengukuranInsDu_(x.sesi, { realisasiId: r1.realisasiId, periode: 'LWBP', ...x.nilai })), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => x.h.simpanPengukuranInsDu_(x.sesi, { realisasiId: r1.realisasiId, periode: 'LWBP', ...x.nilai, ...x.cover, coverArrester: 'Rusak' })), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.h.simpanPengukuranInsDu_({ ...x.sesi, timId: 'tim-lain' }, { realisasiId: r1.realisasiId, periode: 'LWBP', ...x.nilai, ...x.cover })), 'BUKAN_MILIK_TIM');
  const l = x.h.simpanPengukuranInsDu_(x.sesi, { realisasiId: r1.realisasiId, periode: 'LWBP', ...x.nilai, ...x.cover, waktu: x.hariIni + 'T10:00:00+07:00' });
  assert.deepStrictEqual([l.statusUkur, l.masukLaporan, l.pengukuran.lwbp.kva, l.pengukuran.lwbp.persen, l.pengukuran.wbp, l.diterapkan], ['LWBP', true, 48.07, 48.07, null, 'YA']);
  assert.strictEqual(l.pengukuran.cover.coverBushingTm, 'Belum Lengkap');
  const p = x.sheets.d.db_insdu_pengukuran.data[1];
  assert.deepStrictEqual([p[x.kol('db_insdu_pengukuran', 'kode_pengukuran')], p[x.kol('db_insdu_pengukuran', 'lwbp_beban_r')], p[x.kol('db_insdu_pengukuran', 'jumperan_atas')]], [r1.kodeRealisasi + '-UKR', 80, 'A3C']);
  assert.strictEqual(x.sheets.d.db_insdu_realisasi.data[1][x.kol('db_insdu_realisasi', 'status_ukur')], 'LWBP');
  assert.deepStrictEqual([x.kg(1, 'Waktu Beban'), x.kg(1, 'Beban R (A)'), x.kg(1, 'Tanggal Ukur Terakhir'), x.kg(1, 'Kode Ukur Terakhir')], ['LWBP', 80, x.hariIni, r1.kodeRealisasi + '-UKR']);
  assert.strictEqual(kodeError(() => x.h.simpanPengukuranInsDu_(x.sesi, { realisasiId: r1.realisasiId, periode: 'WBP', ...x.nilai, ...x.cover })), 'FIELD_TIDAK_DIKENAL', 'cover hanya di LWBP');
  const w = x.h.simpanPengukuranInsDu_(x.sesi, { realisasiId: r1.realisasiId, periode: 'WBP', ...x.nilai, bebanR: 100, waktu: x.hariIni + 'T19:00:00+07:00' });
  assert.deepStrictEqual([w.statusUkur, x.kg(1, 'Waktu Beban'), x.kg(1, 'Beban R (A)')], ['LENGKAP', 'WBP', 100]);
  // koreksi LWBP tidak menimpa WBP di master
  x.h.simpanPengukuranInsDu_(x.sesi, { realisasiId: r1.realisasiId, periode: 'LWBP', ...x.nilai, bebanR: 81, ...x.cover });
  assert.deepStrictEqual([x.kg(1, 'Waktu Beban'), x.kg(1, 'Beban R (A)'), x.sheets.d.db_insdu_pengukuran.data.length], ['WBP', 100, 2]);
  // laporan: r2 belum ada LWBP = tidak dihitung
  const lap = x.h.dataInspeksiGarduHari_(x.hariIni);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(lap)), { perPenyulang: { 'PNY-A': 1 }, komulatif: 1 });
  const hr = x.h.getInsDuHarian_(x.sesi, {});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(hr.realisasi.map((z) => [z.noGardu, z.statusUkur, z.masukLaporan]))), [['TB0101', 'LENGKAP', true], ['TB0102', 'BELUM', false]]);
  assert.strictEqual(hr.tunggakan, null);
  assert.strictEqual(r2.kodeRealisasi, hd.kodeHeader + '-GDU.002');
  // temuan di kartu gardu: objek Gardu, no_gardu + gardu_id terisi
  assert.strictEqual(kodeError(() => x.h.simpanTemuanInsDu_(x.sesi, { koordinat: '-3.02, 106.51', realisasiId: r1.realisasiId, jenisTemuanId: 'jt-1' })), 'JENIS_TEMUAN_TIDAK_VALID');
  const t = x.h.simpanTemuanInsDu_(x.sesi, { koordinat: '-3.02, 106.51', realisasiId: r1.realisasiId, jenisTemuanId: 'jt-3', deskripsi: 'rembes' });
  assert.deepStrictEqual([t.kodeTemuan, t.jumlahTemuan], [r1.kodeRealisasi + '-TGD.001', 1]);
  const T = x.h.TEMUAN_HEADER_.db_temuan_inspeksi, bt = x.sheets.t.db_temuan_inspeksi.data[1];
  assert.deepStrictEqual([bt[T.indexOf('objek_inspeksi')], bt[T.indexOf('no_gardu')], bt[T.indexOf('gardu_id')], bt[T.indexOf('penyulang')], bt[T.indexOf('sumber')]], ['Gardu', 'TB0101', x.gid.a, 'PNY-A', 'INSPEKSI']);
  assert.strictEqual(x.sheets.d.db_insdu_realisasi.data[1][x.kol('db_insdu_realisasi', 'jumlah_temuan')], 1);
  const u = x.h.ubahTemuanInsDu_(x.sesi, { koordinat: '-3.02, 106.51', temuanId: t.temuanId, revision: 1, jenisTemuanId: 'jt-2', deskripsi: 'pohon' });
  assert.deepStrictEqual([u.revision, u.temuan.jenisTemuan], [2, 'Pohon dekat jaringan']);
  // laporan UP3 D. Inspeksi: gardu target 5 Unit bila ada realisasi
  const teks = x.h.teksUp3_({ tanggal: x.hariIni, ulp: 'Toboali', row: { perPenyulang: {}, komulatif: { rabas: 0, tebang: 0 }, tim: [], inspeksi: { perPenyulang: { 'PNY-B': { jaringan: 4 } }, komulatif: { jaringan: 4 } }, inspeksiGardu: lap }, c4aUp3: [], target: { rabas: 20, tebang: 6 } });
  const d = teks.slice(teks.indexOf('*D. Inspeksi*'), teks.indexOf('*E. C4A*'));
  assert.match(d, /- Penyulang PNY-A\nTarget \/ Realisasi\n- Gardu : 5 Unit \/ 1 Unit\n- Jaringan : - Gawang \/ - Gawang/);
  assert.match(d, /- Penyulang PNY-B\nTarget \/ Realisasi\n- Gardu : - Unit \/ - Unit\n- Jaringan : 4 Gawang \/ 4 Gawang/, 'penyulang tanpa gardu: target gardu kosong');
  assert.match(d, /\*Komulatif\*\n- Jaringan : 4 Gawang\n- Gardu : 1 Unit/);
});

test('v1.0.8 insdu: WBP H-1 belum diisi = Laporan Utama baru ditolak, hanya WBP susulan; temuan belum Selesai terbawa ke inspeksi berikut', () => {
  const x = konteksInsDu();
  const hd = x.h.buatHeaderInsDu_(x.sesi, {});
  const r1 = x.h.simpanRealisasiInsDu_(x.sesi, { headerId: hd.headerId, garduId: x.gid.a, tier: 'Tier 1' });
  const r2 = x.h.simpanRealisasiInsDu_(x.sesi, { headerId: hd.headerId, garduId: x.gid.b, tier: 'Tier 1' });   // v1.0.16: tanpa ukur = tunggakan kurang LWBP
  x.h.simpanPengukuranInsDu_(x.sesi, { realisasiId: r1.realisasiId, periode: 'LWBP', ...x.nilai, ...x.cover });
  const t1 = x.h.simpanTemuanInsDu_(x.sesi, { koordinat: '-3.02, 106.51', realisasiId: r1.realisasiId, jenisTemuanId: 'jt-3', deskripsi: 'rembes' });
  x.keKemarin();
  const e = kodeError(() => x.h.buatHeaderInsDu_(x.sesi, {}));
  assert.strictEqual(e, 'PENGUKURAN_H1_BELUM_LENGKAP');
  let pesan = '';
  try { x.h.buatHeaderInsDu_(x.sesi, {}); } catch (er) { pesan = er.message + ' ' + (er.detail || ''); }
  assert.match(pesan, /TB0101/);
  assert.strictEqual(kodeError(() => x.h.buatHeaderInsDu_({ ...x.sesi, timId: 'tim-g2' }, {})), null, 'tim lain tidak terblokir');
  const hr = x.h.getInsDuHarian_(x.sesi, {});
  assert.deepStrictEqual([hr.header, hr.tunggakan.kodeHeader, hr.tunggakan.realisasi.map((z) => z.noGardu + ':' + z.kurang).join()],
    [null, 'IGD-16130' + x.kmrn.slice(2, 4) + x.kmrn.slice(5, 7) + x.kmrn.slice(8, 10) + '001', 'TB0101:WBP,TB0102:LWBP']);
  assert.strictEqual(kodeError(() => x.h.simpanPengukuranInsDu_(x.sesi, { realisasiId: r1.realisasiId, periode: 'LWBP', ...x.nilai, ...x.cover })), 'TANGGAL_DI_LUAR_BATAS', 'LWBP sudah ada: hanya WBP');
  assert.strictEqual(kodeError(() => x.h.simpanTemuanInsDu_(x.sesi, { koordinat: '-3.02, 106.51', realisasiId: r1.realisasiId, jenisTemuanId: 'jt-3' })), 'TANGGAL_DI_LUAR_BATAS');
  assert.strictEqual(kodeError(() => x.h.hapusRealisasiInsDu_(x.sesi, { realisasiId: r1.realisasiId, revision: 1 })), 'GARDU_PUNYA_TEMUAN', 'gardu bertemuan tidak bisa dihapus');
  assert.strictEqual(x.h.simpanPengukuranInsDu_(x.sesi, { realisasiId: r1.realisasiId, periode: 'WBP', ...x.nilai }).statusUkur, 'LENGKAP', 'WBP susulan');
  assert.strictEqual(kodeError(() => x.h.buatHeaderInsDu_(x.sesi, {})), 'PENGUKURAN_H1_BELUM_LENGKAP', 'gardu tanpa LWBP masih memblokir');
  // v1.0.16: gardu tanpa LWBP dihapus dari laporan kemarin: status_ukur BATAL, tidak masuk laporan, tunggakan selesai
  const rv2 = x.h.getInsDuHarian_(x.sesi, {}).tunggakan.realisasi[0].revision;
  assert.ok(x.h.hapusRealisasiInsDu_(x.sesi, { realisasiId: r2.realisasiId, revision: rv2 }).revision > rv2);
  assert.strictEqual(x.h.hapusRealisasiInsDu_(x.sesi, { realisasiId: r2.realisasiId, revision: rv2 }).duplikat, true, 'kirim ulang aman');
  assert.strictEqual(x.sheets.d.db_insdu_realisasi.data[2][x.kol('db_insdu_realisasi', 'status_ukur')], 'BATAL');
  assert.strictEqual(kodeError(() => x.h.simpanPengukuranInsDu_(x.sesi, { realisasiId: r2.realisasiId, periode: 'LWBP', ...x.nilai, ...x.cover })), 'SUDAH_BATAL');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(x.h.dataInspeksiGarduHari_(x.kmrn).perPenyulang)), { 'PNY-A': 1 }, 'gardu BATAL tidak dihitung');
  assert.strictEqual(x.h.getInsDuHarian_(x.sesi, {}).tunggakan, null);
  const hd2 = x.h.buatHeaderInsDu_(x.sesi, {});
  // gardu yang sama diinspeksi lagi: temuan kemarin tidak disalin, hanya ditandai tertinggal
  const r = x.h.simpanRealisasiInsDu_(x.sesi, { headerId: hd2.headerId, garduId: x.gid.a, tier: 'Tier 2' });
  assert.strictEqual(r.temuanLanjutan.length, 0);
  assert.strictEqual(r.temuanTertinggal.length, 1);
  const T = x.h.TEMUAN_HEADER_.db_temuan_inspeksi, rows = x.sheets.t.db_temuan_inspeksi.data;
  const lama = rows[1];
  assert.strictEqual(rows.length, 2, 'tidak ada baris temuan LANJUTAN baru');
  assert.deepStrictEqual([lama[T.indexOf('sumber')], lama[T.indexOf('kode_realisasi')], lama[T.indexOf('belum_diperbaiki')]],
    ['INSPEKSI', r1.kodeRealisasi.replace(x.ymd, x.kmrn.slice(2, 4) + x.kmrn.slice(5, 7) + x.kmrn.slice(8, 10)), 'YA'], 'baris lama ditandai tertinggal');
  const kr = (n) => x.sheets.d.db_insdu_realisasi.data[3][x.kol('db_insdu_realisasi', n)];
  assert.deepStrictEqual([kr('jumlah_temuan'), kr('jumlah_temuan_lanjutan')], [0, 0]);
  const t2 = x.h.simpanTemuanInsDu_(x.sesi, { koordinat: '-3.02, 106.51', realisasiId: r.realisasiId, jenisTemuanId: 'jt-2' });
  assert.deepStrictEqual([t2.kodeTemuan, t2.jumlahTemuan, kr('jumlah_temuan_lanjutan')], [r.kodeRealisasi + '-TGD.001', 1, 0]);
  assert.deepStrictEqual([x.h.getInsDuHarian_(x.sesi, {}).realisasi[0].temuan.length, x.h.getInsDuHarian_(x.sesi, {}).realisasi[0].temuanTertinggal.length], [1, 1]);
  // gardu tanpa riwayat temuan = tidak ada lanjutan
  assert.strictEqual(x.h.simpanRealisasiInsDu_(x.sesi, { headerId: hd2.headerId, garduId: x.gid.lain, tier: 'Tier 1' }).temuanLanjutan.length, 0);
});

test('v1.0.16 insdu: gardu kemarin tanpa LWBP = tunggakan kurang LWBP, LWBP + WBP susulan masuk realisasi tanggal kemarin', () => {
  const x = konteksInsDu();
  const hd = x.h.buatHeaderInsDu_(x.sesi, {});
  const r1 = x.h.simpanRealisasiInsDu_(x.sesi, { headerId: hd.headerId, garduId: x.gid.a, tier: 'Tier 1 & Tier 2' });
  x.keKemarin();
  const tg = x.h.getInsDuHarian_(x.sesi, {}).tunggakan;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(tg.realisasi.map((z) => [z.noGardu, z.kurang, z.tier, z.pengukuran]))), [['TB0101', 'LWBP', 'Tier 1 & Tier 2', null]]);
  assert.strictEqual(kodeError(() => x.h.simpanPengukuranInsDu_(x.sesi, { realisasiId: r1.realisasiId, periode: 'WBP', ...x.nilai })), 'URUTAN_PENGUKURAN', 'tetap LWBP dulu');
  assert.strictEqual(kodeError(() => x.h.simpanPengukuranInsDu_(x.sesi, { realisasiId: r1.realisasiId, periode: 'LWBP', ...x.nilai })), 'FIELD_WAJIB', 'LWBP susulan tetap wajib cover');
  const l = x.h.simpanPengukuranInsDu_(x.sesi, { realisasiId: r1.realisasiId, periode: 'LWBP', ...x.nilai, ...x.cover });
  assert.deepStrictEqual([l.statusUkur, l.masukLaporan], ['LWBP', true]);
  assert.strictEqual(x.h.getInsDuHarian_(x.sesi, {}).tunggakan.realisasi[0].kurang, 'WBP');
  assert.strictEqual(x.h.simpanPengukuranInsDu_(x.sesi, { realisasiId: r1.realisasiId, periode: 'WBP', ...x.nilai }).statusUkur, 'LENGKAP');
  const P = x.sheets.d.db_insdu_pengukuran.data;
  assert.strictEqual(P.length, 2, 'satu baris pengukuran');
  assert.strictEqual(x.h.tglInsJar_({ tanggal: P[1][x.kol('db_insdu_pengukuran', 'tanggal')] }), x.kmrn, 'pengukuran tercatat di tanggal laporan kemarin');
  assert.strictEqual(x.h.getInsDuHarian_(x.sesi, {}).tunggakan, null);
  assert.strictEqual(kodeError(() => x.h.buatHeaderInsDu_(x.sesi, {})), null);
});

test('v1.0.8 insdu: rantai temuan gardu: Selesai di salah satu baris = tidak terbawa, baris terakhir rantai yang disalin, hari yang sama dilewati', () => {
  const x = konteksInsDu();
  const kode = (tgl) => 'IGD-16130' + tgl.slice(2, 4) + tgl.slice(5, 7) + tgl.slice(8, 10) + '001';
  const rows = [
    { temuan_id: 'a1', temuan_asal_id: '', objek_inspeksi: 'Gardu', gardu_id: 'G', status: 'Penugasan Tim', kode_header: kode('2026-09-01'), _baris: 2 },
    { temuan_id: 'a2', temuan_asal_id: 'a1', objek_inspeksi: 'Gardu', gardu_id: 'G', status: 'Penugasan Tim', deskripsi: 'baru', kode_header: kode('2026-09-15'), _baris: 3 },
    { temuan_id: 'b1', temuan_asal_id: '', objek_inspeksi: 'Gardu', gardu_id: 'G', status: 'Penugasan Tim', kode_header: kode('2026-09-01'), _baris: 4 },
    { temuan_id: 'b2', temuan_asal_id: 'b1', objek_inspeksi: 'Gardu', gardu_id: 'G', status: 'Selesai', kode_header: kode('2026-09-15'), _baris: 5 },
    { temuan_id: 'c1', temuan_asal_id: '', objek_inspeksi: 'Jaringan', gardu_id: '', no_gardu: '', status: 'Penugasan Tim', kode_header: kode('2026-09-01'), _baris: 6 },
    { temuan_id: 'd1', temuan_asal_id: '', objek_inspeksi: 'Gardu', gardu_id: '', no_gardu: 'tb0101', status: 'Penugasan Tim', kode_header: kode('2026-09-02'), _baris: 7 },
    { temuan_id: 'e1', temuan_asal_id: '', objek_inspeksi: 'Gardu', gardu_id: 'G', status: 'Penugasan Tim', kode_header: kode('2026-10-01'), _baris: 8 },
  ];
  const h = x.h.temuanTerbukaGarduInsDu_(rows, 'G', 'TB0101', '2026-10-01');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(h.map((z) => [z.akar, z.terakhir.temuan_id]))), [['a1', 'a2'], ['d1', 'd1']], 'b selesai, c jaringan, d tanpa gardu_id dicocokkan no_gardu, e hari yang sama');
  const h2 = x.h.temuanTerbukaGarduInsDu_(rows.map((r) => (r.temuan_id === 'd1' ? r : { ...r, gardu_id: '' })), 'X', 'TB0101', '2026-10-01');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(h2.map((z) => z.akar))), ['d1'], 'tanpa gardu_id dicocokkan dengan no_gardu (huruf besar/kecil sama)');
});

test('v1.0.8 ADMIN_siapkanSheetInsDu: buat 3 tab SiSi_InsDu + kolom baru temuan, aman diulang; cekKonfigInsDu_ dilewati tanpa INSDU_SHEET_ID', () => {
  const x = konteksInsDu();
  x.h.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  x.sheets.d = {};
  assert.strictEqual(x.h.ADMIN_siapkanSheetInsDu(), 0);
  assert.deepStrictEqual(Object.keys(x.sheets.d).sort(), ['db_insdu_header', 'db_insdu_pengukuran', 'db_insdu_realisasi']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(x.sheets.d.db_insdu_pengukuran.data[0])), JSON.parse(JSON.stringify(x.h.headerInsDu_().db_insdu_pengukuran)));
  assert.strictEqual(x.h.ADMIN_siapkanSheetInsDu(), 0, 'diulang aman');
  assert.strictEqual(x.h.ADMIN_cekSheetInsDu(), 0);
  x.h.PropertiesService.getScriptProperties().setProperty('INSDU_SHEET_ID', '');
  assert.strictEqual(x.h.cekKonfigInsDu_(x.h.cfg_()), 0);
  assert.strictEqual(x.h.dataInspeksiGarduHari_(x.hariIni).komulatif, 0);
});

/* ===== v1.0.10 WO tindak lanjut temuan (75_TindakLanjut.js) ===== */

function barisTemuanWo(h, isi) {
  const H = h.TEMUAN_HEADER_.db_temuan_inspeksi;
  return H.map((k) => (isi[k] === undefined ? '' : isi[k]));
}
function fotoWo(tlId, slot, isi = {}) {
  const buf = jpeg(1200, 900, 70 + slot.length);
  return { tlId, slot, sha256: crypto.createHash('sha256').update(buf).digest('hex'), ukuranByte: buf.length, data: buf.toString('base64'),
    waktu: new Date().toISOString(), lat: -3.01, lng: 106.51, akurasiM: 4, ...isi };
}

function konteksWo() {
  const x = siapkanRow({ propsTambahan: { TEMUAN_SHEET_ID: 't', HARTEK_SHEET_ID: 'h', GARDU_SHEET_ID: 'g', INSJAR_FOTO_FOLDER_ID: 'wofoto' } });
  const h = x.g;
  const buat = sheetPalsu(x.log);
  x.sheets.t = {};
  for (const [nama, hdr] of Object.entries(h.TEMUAN_HEADER_)) x.sheets.t[nama] = buat(nama, [hdr.slice()]);
  x.sheets.h = {};
  for (const [nama, hdr] of Object.entries(h.HARTEK_HEADER_)) x.sheets.h[nama] = buat(nama, [hdr.slice()]);
  x.sheets.g = { db_Gardu: buat('db_Gardu', [['No Gardu', 'gardu_id', 'Penyulang', 'Section', 'Alamat'], ['TB0001', 'gar-1', 'TB-01', 'Kampung Baru', 'Jl. Merdeka']]) };
  const timH = U(), timY = U(), timMati = U();
  x.sheets.m.db_Tim = buat('db_Tim', [['tim_id', 'jenis', 'nama', 'kode', 'aktif'],
    [x.sesi.timId, 'ROW', 'ROW 01', '01', true], [timH, 'HARTEK', 'HARTEK 01', '01', true], [timY, 'YANDAL', 'YANDAL 13', '13', true],
    [timMati, 'ROW', 'ROW 09', '09', false], [U(), 'INSPEKSI_JARINGAN', 'INSPEKSI 01', '01', true]]);
  x.sheets.m.db_Jenis_Pekerjaan.data.push(['jh1', 'HARTEK', 'Ganti Arrester', 'buah', '', '', 1, true], ['jh2', 'HARTEK', 'Perbaikan Jumper', 'titik', '', '', 2, true]);
  const dr = driveTiruan();
  h.DriveApp = dr.DriveApp;
  h.Utilities.newBlob = (bytes, mime, nama) => ({ bytes, mime, nama });
  h.SpreadsheetApp = { openById: (id) => ({ getSheetByName: (n) => (x.sheets[id] || {})[n] || null, insertSheet: (n) => { x.sheets[id][n] = buat(n, [[]]); return x.sheets[id][n]; } }) };
  const ymd = x.hariIni.slice(2, 4) + x.hariIni.slice(5, 7) + x.hariIni.slice(8, 10);
  const timIns = U();
  const temuan = (isi = {}) => {
    const id = U();
    const n = x.sheets.t.db_temuan_inspeksi.data.length;
    x.sheets.t.db_temuan_inspeksi.data.push(barisTemuanWo(h, { nomor: n, kode_header: 'IJR-16130' + ymd + '001', kode_temuan: 'IJR-16130' + ymd + '001-PNY.001-TJR.00' + n,
      tanggal: x.hariIni, objek_inspeksi: 'Jaringan', penyulang: 'TB-01', section: 'Kampung Baru', section_id: x.sekB, jenis_temuan: 'Pohon dekat jaringan',
      koordinat: '-3.000000, 106.500000', lat: -3, lng: 106.5, status: 'Penugasan Tim', sumber: 'INSPEKSI', temuan_id: id, tim_id: timIns, revision: 1, ...isi }));
    return id;
  };
  const kt = (id, k) => { const H = h.TEMUAN_HEADER_.db_temuan_inspeksi; const b = x.sheets.t.db_temuan_inspeksi.data.find((r) => r[H.indexOf('temuan_id')] === id); return b[H.indexOf(k)]; };
  const admin = { userId: U(), username: '16130.admin', role: 'ADMIN', jenisTim: '', timId: '' };
  const sesiH = { userId: U(), username: '16130.hartek01', role: 'PETUGAS', jenisTim: 'HARTEK', timId: timH, timNama: 'HARTEK 01', deviceId: 'dev1' };
  const j = (v) => JSON.parse(JSON.stringify(v));
  return { ...x, h, dr, timH, timY, timMati, timIns, temuan, kt, admin, sesiH, j, ymd };
}

test('v1.0.10 WO: admin teruskan / pindah / tarik selama TERKIRIM; mulai mengunci; tim lain & admin ditolak; temuan inspeksi terkunci', () => {
  const x = konteksWo();
  const id = x.temuan();
  const daftar = x.j(x.h.getWoAdmin_(x.admin, {}));
  assert.deepStrictEqual([daftar.ringkas.baru, daftar.temuan.length], [1, 1]);
  assert.deepStrictEqual(daftar.tim.map((t) => t.nama), ['HARTEK 01', 'ROW 01', 'YANDAL 13'], 'hanya tim aktif ROW / HARTEK / YANDAL');
  assert.strictEqual(kodeError(() => x.h.getWoAdmin_(x.sesi, {})), 'AKSES_DITOLAK', 'petugas bukan admin');
  assert.strictEqual(kodeError(() => x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.timMati, revision: 1 })), 'TIM_TIDAK_VALID');
  const a = x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.sesi.timId, catatan: 'segera', revision: 1 });
  assert.deepStrictEqual([a.revision, a.pindah, x.kt(id, 'status'), x.kt(id, 'status_wo'), x.kt(id, 'tim_tindak_lanjut'), x.kt(id, 'jenis_tim_tindak_lanjut'), x.kt(id, 'catatan_admin')],
    [2, false, 'Progress Pekerjaan', 'TERKIRIM', 'ROW 01', 'ROW', 'segera']);
  assert.strictEqual(kodeError(() => x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.timH, revision: 1 })), 'KONFLIK_REVISION');
  // pindah ke Hartek (belum dimulai), lalu ROW tidak lagi melihat WO. v1.0.18: pindah hanya lewat Pindah Tim TO
  assert.strictEqual(kodeError(() => x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.timH, revision: 2 })), 'WO_PINDAH_DI_MENU_PINDAH');
  assert.strictEqual(x.h.pindahWo_(x.admin, { temuanId: id, timId: x.timH, revision: 2 }).pindah, true);
  assert.strictEqual(x.h.getWoTim_(x.sesi, {}, 'MOBILE').wo.length, 0);
  assert.strictEqual(x.h.getWoTim_(x.sesiH, {}, 'MOBILE').wo.length, 1);
  assert.strictEqual(kodeError(() => x.h.mulaiWo_(x.sesi, { temuanId: id, revision: 3 }, 'MOBILE')), 'WO_DIPINDAH', 'v1.0.16: tim lama dikenali dari riwayat');
  assert.strictEqual(kodeError(() => x.h.mulaiWo_(x.sesiY0 || { ...x.sesi, timId: x.timMati }, { temuanId: id, revision: 3 }, 'MOBILE')), 'BUKAN_MILIK_TIM', 'tim yang tidak pernah ditugaskan');
  // tarik kembali ke admin, lalu teruskan ke ROW lagi
  const tr = x.h.tarikWo_(x.admin, { temuanId: id, revision: 3 });
  assert.deepStrictEqual([x.kt(id, 'status'), x.kt(id, 'status_wo'), x.kt(id, 'tim_tindak_lanjut_id')], ['Penugasan Tim', '', '']);
  assert.strictEqual(kodeError(() => x.h.tarikWo_(x.admin, { temuanId: id, revision: tr.revision })), 'WO_BELUM_DITERUSKAN');
  x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.sesi.timId, revision: tr.revision });
  const wo = x.h.getWoTim_(x.sesi, {}, 'MOBILE');
  assert.deepStrictEqual([wo.jenisTim, wo.laporanUtamaAda, wo.wo[0].wo.status, wo.master.jenis.length], ['ROW', false, 'TERKIRIM', 3]);
  assert.ok(wo.master.section.some((s) => s.section === 'Kampung Baru'));
  // pekerjaan sebelum mulai = ditolak
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesi, { koordinat: '-3.010000, 106.510000', temuanId: id, diameter: 30 }, 'MOBILE')), 'WO_BELUM_DIMULAI');
  const m = x.h.mulaiWo_(x.sesi, { temuanId: id, revision: wo.wo[0].revision }, 'MOBILE');
  assert.deepStrictEqual([x.kt(id, 'status_wo'), x.kt(id, 'dimulai_oleh') !== ''], ['DIKERJAKAN', true]);
  assert.strictEqual(x.h.mulaiWo_(x.sesi, { temuanId: id, revision: m.revision }, 'MOBILE').duplikat, true);
  // sudah dimulai = tidak bisa dipindah / ditarik admin
  assert.strictEqual(kodeError(() => x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.timH, revision: m.revision })), 'WO_SUDAH_DIMULAI');
  assert.strictEqual(kodeError(() => x.h.tarikWo_(x.admin, { temuanId: id, revision: m.revision })), 'WO_SUDAH_DIMULAI');
  // petugas inspeksi tidak bisa mengubah temuan yang WO-nya sudah dimulai
  const ins = { userId: U(), username: '16130.insjar01', role: 'PETUGAS', jenisTim: 'INSPEKSI_JARINGAN', timId: x.timIns, timNama: 'INSPEKSI 01' };
  assert.strictEqual(kodeError(() => x.h.ubahTemuanInsJar_(ins, { temuanId: id, revision: m.revision, jenisTemuanId: 'jt-1' })), 'WO_SUDAH_DIMULAI');
  // peran
  assert.strictEqual(kodeError(() => x.h.getWoTim_({ ...x.sesi, jenisTim: 'INSPEKSI_JARINGAN' }, {}, 'MOBILE')), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.h.getWoTim_({ ...x.sesi, role: 'ADMIN' }, {}, 'MOBILE')), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.h.getWoTim_({ ...x.sesi, jenisTim: 'YANDAL' }, {}, 'MOBILE')), 'AKSES_DITOLAK', 'YANDAL tanpa token shift');
  assert.strictEqual(kodeError(() => x.h.getWoTim_({ ...x.sesi, jenisTim: 'YANDAL', _sampai: Date.now() + 36e5 }, {}, 'WEB')), 'AKSES_DITOLAK', 'YANDAL hanya HP');
});

test('v1.0.15 WO: getFotoWoAdmin_ membaca foto temuan / tiang dari Drive privat, khusus admin', () => {
  const x = konteksWo();
  const f = x.dr.DriveApp.getFolderById('wofoto').createFile({ bytes: [9, 8, 7], mime: 'image/jpeg', nama: 'T_TEMUAN.jpg' });
  const id = x.temuan({ foto_temuan_file_id: f.getId(), foto_temuan_link: 'https://drive.google.com/file/d/' + f.getId() + '/view' });
  const r = x.h.getFotoWoAdmin_(x.admin, { temuanId: id, slot: 'TEMUAN' });
  assert.deepStrictEqual([r.slot, r.kecil, r.ukuranByte, r.data], ['TEMUAN', false, 3, Buffer.from([9, 8, 7]).toString('base64')], 'tanpa thumbnail = file penuh');
  assert.strictEqual(kodeError(() => x.h.getFotoWoAdmin_(x.admin, { temuanId: id, slot: 'TIANG' })), 'FOTO_TIDAK_ADA');
  assert.strictEqual(kodeError(() => x.h.getFotoWoAdmin_(x.admin, { temuanId: id, slot: 'SEBELUM' })), 'FIELD_WAJIB', 'v1.0.16: foto pekerjaan butuh tlId');
  assert.strictEqual(kodeError(() => x.h.getFotoWoAdmin_(x.admin, { temuanId: id, slot: 'LAIN' })), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.h.getFotoWoAdmin_(x.sesi, { temuanId: id, slot: 'TEMUAN' })), 'AKSES_DITOLAK', 'petugas bukan admin');
});

test('v1.0.15 WO: getFotoWoTim_ hanya foto WO tim sendiri (temuan + pekerjaan), tlId wajib untuk foto pekerjaan', () => {
  const x = konteksWo();
  const ft = x.dr.DriveApp.getFolderById('wofoto').createFile({ bytes: [5, 5], mime: 'image/jpeg', nama: 'T_TIANG.jpg' });
  const id = x.temuan({ foto_tiang_file_id: ft.getId() });
  x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.sesi.timId, revision: 1 });
  x.h.mulaiWo_(x.sesi, { temuanId: id, revision: 2 }, 'MOBILE');
  assert.strictEqual(x.h.getFotoWoTim_(x.sesi, { temuanId: id, slot: 'TIANG' }, 'MOBILE').ukuranByte, 2);
  const p = x.h.simpanPekerjaanWo_(x.sesi, { koordinat: '-3.010000, 106.510000', temuanId: id, diameter: 30, sectionId: x.sekB }, 'MOBILE');
  x.h.uploadFotoWo_(x.sesi, fotoWo(p.tlId, 'SEBELUM'), 'MOBILE');
  const f = x.h.getFotoWoTim_(x.sesi, { temuanId: id, tlId: p.tlId, slot: 'SEBELUM', ukuran: 'PENUH' }, 'MOBILE');
  assert.deepStrictEqual([f.slot, f.tlId, f.kecil, f.data], ['SEBELUM', p.tlId, false, fotoWo(p.tlId, 'SEBELUM').data]);
  assert.strictEqual(kodeError(() => x.h.getFotoWoTim_(x.sesi, { temuanId: id, slot: 'SEBELUM' }, 'MOBILE')), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => x.h.getFotoWoTim_(x.sesi, { temuanId: id, tlId: p.tlId, slot: 'SESUDAH' }, 'MOBILE')), 'FOTO_TIDAK_ADA');
  assert.strictEqual(kodeError(() => x.h.getFotoWoTim_(x.sesiH, { temuanId: id, slot: 'TIANG' }, 'MOBILE')), 'BUKAN_MILIK_TIM', 'tim lain');
  assert.strictEqual(kodeError(() => x.h.getFotoWoTim_(x.admin, { temuanId: id, slot: 'TIANG' }, 'MOBILE')), 'AKSES_DITOLAK');
});

test('v1.0.10 WO ROW: diameter -> jenis, foto wajib 3, butuh Laporan Utama ROW, Selesai = row_Realisasi + row_Eksekusi (sumber TEMUAN) + row_Foto', () => {
  const x = konteksWo();
  const id = x.temuan();
  let rev = x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.sesi.timId, revision: 1 }).revision;
  rev = x.h.mulaiWo_(x.sesi, { temuanId: id, revision: rev }, 'MOBILE').revision;
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesi, { koordinat: '-3.010000, 106.510000', temuanId: id, diameter: 10 }, 'MOBILE')), 'DIAMETER_DI_LUAR_KATEGORI');
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesi, { koordinat: '-3.010000, 106.510000', temuanId: id, jenisId: 'jh1', jumlah: 1 }, 'MOBILE')), 'FIELD_TIDAK_DIKENAL', 'isian Hartek ditolak untuk ROW');
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesi, { koordinat: '-3.010000, 106.510000', temuanId: id, diameter: 30, sectionId: U() }, 'MOBILE')), 'SECTION_TIDAK_COCOK');
  const idb = U();
  const p1 = x.h.simpanPekerjaanWo_(x.sesi, { koordinat: '-3.010000, 106.510000', temuanId: id, diameter: 30, nomorTiang: 'tb01-5', idBaris: idb }, 'MOBILE');
  assert.deepStrictEqual([p1.kodeTl.endsWith('-TL.001'), p1.pekerjaan.pekerjaan, p1.pekerjaan.satuan, p1.pekerjaan.section], [true, 'Tebang Sedang', 'Batang', 'Kampung Baru']);
  assert.strictEqual(x.h.simpanPekerjaanWo_(x.sesi, { koordinat: '-3.010000, 106.510000', temuanId: id, diameter: 30, idBaris: idb }, 'MOBILE').duplikat, true);
  // v1.0.17: section + nomor tiang hasil input petugas inspeksi terkunci
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesi, { koordinat: '-3.010000, 106.510000', temuanId: id, diameter: 0, sectionId: x.sekC }, 'MOBILE')), 'SECTION_TERKUNCI');
  const p2 = x.h.simpanPekerjaanWo_(x.sesi, { koordinat: '-3.010000, 106.510000', temuanId: id, diameter: 0, sectionId: x.sekB }, 'MOBILE');
  const p3 = x.h.simpanPekerjaanWo_(x.sesi, { koordinat: '-3.010000, 106.510000', temuanId: id, diameter: 60 }, 'MOBILE');
  x.h.hapusPekerjaanWo_(x.sesi, { tlId: p3.tlId, revision: 1 }, 'MOBILE');
  assert.strictEqual(kodeError(() => x.h.selesaiWo_(x.sesi, { temuanId: id, revision: rev }, 'MOBILE')), 'FOTO_BELUM_LENGKAP');
  for (const p of [p1, p2]) for (const s of ['SEBELUM', 'PEKERJAAN', 'SESUDAH']) assert.strictEqual(x.h.uploadFotoWo_(x.sesi, fotoWo(p.tlId, s), 'MOBILE').status, 'OK');
  assert.strictEqual(x.h.uploadFotoWo_(x.sesi, fotoWo(p1.tlId, 'SEBELUM'), 'MOBILE').status, 'DUPLIKAT');
  assert.strictEqual(kodeError(() => x.h.uploadFotoWo_({ ...x.sesi, timId: x.timH, jenisTim: 'HARTEK' }, fotoWo(p1.tlId, 'SESUDAH'), 'MOBILE')), 'BUKAN_MILIK_TIM');
  // belum masuk realisasi sebelum Selesai
  assert.strictEqual(x.sheets.r.row_Eksekusi.data.length, 1);
  assert.strictEqual(kodeError(() => x.h.selesaiWo_(x.sesi, { temuanId: id, revision: rev }, 'MOBILE')), 'WO_BUTUH_LAPORAN_UTAMA');
  x.sync([x.op('header', 'buat', U(), x.kodeH, { tanggal: x.hariIni })]);
  assert.strictEqual(x.h.getWoTim_(x.sesi, {}, 'MOBILE').laporanUtamaAda, true);
  const s = x.j(x.h.selesaiWo_(x.sesi, { temuanId: id, revision: rev }, 'MOBILE'));
  assert.deepStrictEqual(s.realisasi.map((r) => r.kode), [x.kodeH + '-PNY.001-EKS.001', x.kodeH + '-PNY.001-EKS.002']);
  assert.strictEqual(s.tindakLanjut, 'Tebang Sedang 1 Batang, Rabas / Pangkas 1 Gawang');
  assert.deepStrictEqual([kolom(x, 'row_Realisasi', 1, 'Penyulang'), kolom(x, 'row_Realisasi', 1, 'Sedang'), kolom(x, 'row_Realisasi', 1, 'Rabas'), kolom(x, 'row_Realisasi', 1, 'Section')],
    ['TB-01', 1, 1, 'Kampung Baru']);
  assert.deepStrictEqual([kolom(x, 'row_Eksekusi', 1, 'sumber'), kolom(x, 'row_Eksekusi', 1, 'temuan_id'), kolom(x, 'row_Eksekusi', 1, 'eksekusi_id'), kolom(x, 'row_Eksekusi', 1, 'foto_lengkap'),
    kolom(x, 'row_Eksekusi', 1, 'Nomor Tiang'), kolom(x, 'row_Eksekusi', 1, 'Diameter')], ['TEMUAN', id, p1.tlId, true, 'TB01-5', 30]);
  assert.ok(String(kolom(x, 'row_Eksekusi', 1, 'Foto Sesudah URL')).startsWith('https://drive.google.com/file/d/'));
  assert.strictEqual(x.sheets.r.row_Foto.data.length, 7, '6 foto masuk row_Foto');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(x.h.getLaporanRow_(x.sesi, {}))).laporan[0].total, { rabas: 1, sedang: 1, besar: 0 }, 'masuk laporan harian ROW');
  assert.deepStrictEqual([x.kt(id, 'status'), x.kt(id, 'status_wo'), x.kt(id, 'jumlah_pekerjaan')], ['Selesai', 'SELESAI', 2]);
  const TL = x.h.TEMUAN_HEADER_.db_temuan_tindak_lanjut;
  assert.deepStrictEqual(x.sheets.t.db_temuan_tindak_lanjut.data.slice(1).map((b) => b[TL.indexOf('status')]), ['TERCATAT', 'TERCATAT', 'BATAL']);
  // kirim ulang = tidak dobel; sesudah selesai pekerjaan terkunci
  assert.strictEqual(x.h.selesaiWo_(x.sesi, { temuanId: id, revision: s.revision }, 'MOBILE').duplikat, true);
  assert.strictEqual(x.sheets.r.row_Eksekusi.data.length, 3);
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesi, { koordinat: '-3.010000, 106.510000', temuanId: id, diameter: 0 }, 'MOBILE')), 'WO_SUDAH_SELESAI');
  assert.strictEqual(kodeError(() => x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.timH, revision: s.revision })), 'WO_SUDAH_SELESAI');
  assert.strictEqual(x.j(x.h.getWoAdmin_(x.admin, { status: 'SELESAI' })).temuan[0].pekerjaanWo.length, 2);
  // WO kedua di penyulang yang sama memakai row_Realisasi yang sama
  const id2 = x.temuan();
  let r2 = x.h.teruskanWo_(x.admin, { temuanId: id2, timId: x.sesi.timId, revision: 1 }).revision;
  r2 = x.h.mulaiWo_(x.sesi, { temuanId: id2, revision: r2 }, 'MOBILE').revision;
  const q = x.h.simpanPekerjaanWo_(x.sesi, { koordinat: '-3.010000, 106.510000', temuanId: id2, diameter: 55 }, 'MOBILE');
  for (const sl of ['SEBELUM', 'PEKERJAAN', 'SESUDAH']) x.h.uploadFotoWo_(x.sesi, fotoWo(q.tlId, sl), 'MOBILE');
  assert.deepStrictEqual(x.j(x.h.selesaiWo_(x.sesi, { temuanId: id2, revision: r2 }, 'MOBILE')).realisasi.map((r) => r.kode), [x.kodeH + '-PNY.001-EKS.003']);
  assert.deepStrictEqual([x.sheets.r.row_Realisasi.data.length, kolom(x, 'row_Realisasi', 1, 'Besar')], [2, 1]);
  // eksekusi dari WO dikunci di syncRow (ubah / batal dari HP ditolak)
  const eksWo = kolom(x, 'row_Eksekusi', 1, 'eksekusi_id');
  assert.deepStrictEqual(x.sync([x.op('eksekusi', 'batal', eksWo, undefined, {}, 1), x.op('eksekusi', 'ubah', eksWo, undefined, { nomorTiang: 'X' }, 1)]).hasil.map((h) => h.alasan), ['TERKUNCI_WO', 'TERKUNCI_WO']);
});

test('v1.0.10 WO HARTEK: banyak pekerjaan per temuan, foto sebelum + sesudah, Selesai = PG Gardu + db_Hartek_Pekerjaan; Jaringan baru butuh daerah + gawang', () => {
  const x = konteksWo();
  const id = x.temuan({ objek_inspeksi: 'Gardu', no_gardu: 'TB0001', gardu_id: 'gar-1', jenis_temuan: 'Trafo bocor' });
  let rev = x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.timH, revision: 1 }).revision;
  rev = x.h.mulaiWo_(x.sesiH, { temuanId: id, revision: rev }, 'MOBILE').revision;
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesiH, { koordinat: '-3.010000, 106.510000', temuanId: id, diameter: 30 }, 'MOBILE')), 'FIELD_TIDAK_DIKENAL');
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesiH, { koordinat: '-3.010000, 106.510000', temuanId: id, jenisId: 'jx', jumlah: 1 }, 'MOBILE')), 'PEKERJAAN_TIDAK_DIKENAL');
  const a = x.h.simpanPekerjaanWo_(x.sesiH, { koordinat: '-3.010000, 106.510000', temuanId: id, jenisId: 'jh1', jumlah: 3 }, 'MOBILE');
  const b = x.h.simpanPekerjaanWo_(x.sesiH, { koordinat: '-3.010000, 106.510000', temuanId: id, jenisId: 'jh2', jumlah: 2 }, 'MOBILE');
  for (const p of [a, b]) for (const s of ['SEBELUM', 'SESUDAH']) x.h.uploadFotoWo_(x.sesiH, fotoWo(p.tlId, s), 'MOBILE');
  assert.strictEqual(kodeError(() => x.h.selesaiWo_(x.sesiH, { temuanId: id, revision: rev }, 'MOBILE')), 'WO_BUTUH_LAPORAN_UTAMA');
  const hd = x.h.buatHeaderHartek_(x.sesiH, {});
  const s = x.j(x.h.selesaiWo_(x.sesiH, { temuanId: id, revision: rev }, 'MOBILE'));
  const HP = x.h.HARTEK_HEADER_.db_Hartek_PenyulangGardu, HK = x.h.HARTEK_HEADER_.db_Hartek_Pekerjaan;
  const pg = x.sheets.h.db_Hartek_PenyulangGardu.data[1];
  assert.deepStrictEqual([pg[HP.indexOf('kode_pg')], pg[HP.indexOf('jenis_pekerjaan')], pg[HP.indexOf('no_gardu')], pg[HP.indexOf('gardu_id')]], [hd.kodeHeader + '-GRD.001', 'Gardu', 'TB0001', 'gar-1']);
  const pk = x.sheets.h.db_Hartek_Pekerjaan.data.slice(1);
  assert.deepStrictEqual(pk.map((r) => [r[HK.indexOf('kode_pekerjaan')], r[HK.indexOf('pekerjaan')], r[HK.indexOf('jumlah_pekerjaan')], r[HK.indexOf('pekerjaan_id')]]),
    [[hd.kodeHeader + '-GRD.001-PKJ.001', 'Ganti Arrester', 3, a.tlId], [hd.kodeHeader + '-GRD.001-PKJ.002', 'Perbaikan Jumper', 2, b.tlId]]);
  assert.strictEqual(s.tindakLanjut, 'Ganti Arrester 3 buah, Perbaikan Jumper 2 titik');
  // pekerjaan sudah jadi milik Hartek hari ini: tim masih bisa menambah material di modul Hartek
  assert.ok(x.h.getHartekHarian_(x.sesiH, {}).header);
  const rk = x.sheets.h.db_Hartek_Pekerjaan.data[1][HK.indexOf('revision')];
  assert.strictEqual(kodeError(() => x.h.ubahPekerjaanHartek_(x.sesiH, { pekerjaanId: a.tlId, revision: rk, jumlahPekerjaan: 9 })), 'TERKUNCI_WO');
  // temuan Jaringan, PG penyulang/section belum ada = daerah + jumlah gawang wajib
  const id2 = x.temuan();
  let r2 = x.h.teruskanWo_(x.admin, { temuanId: id2, timId: x.timH, revision: 1 }).revision;
  r2 = x.h.mulaiWo_(x.sesiH, { temuanId: id2, revision: r2 }, 'MOBILE').revision;
  const c = x.h.simpanPekerjaanWo_(x.sesiH, { koordinat: '-3.010000, 106.510000', temuanId: id2, jenisId: 'jh2', jumlah: 1 }, 'MOBILE');
  for (const sl of ['SEBELUM', 'SESUDAH']) x.h.uploadFotoWo_(x.sesiH, fotoWo(c.tlId, sl), 'MOBILE');
  assert.strictEqual(kodeError(() => x.h.selesaiWo_(x.sesiH, { temuanId: id2, revision: r2 }, 'MOBILE')), 'FIELD_WAJIB');
  x.h.selesaiWo_(x.sesiH, { temuanId: id2, revision: r2, daerah: 'Kampung Baru', jumlahGawang: 4 }, 'MOBILE');
  const pg2 = x.sheets.h.db_Hartek_PenyulangGardu.data[2];
  assert.deepStrictEqual([pg2[HP.indexOf('kode_pg')], pg2[HP.indexOf('penyulang')], pg2[HP.indexOf('section')], pg2[HP.indexOf('jumlah_gawang')]], [hd.kodeHeader + '-PNY.001', 'TB-01', 'Kampung Baru', 4]);
});

test('v1.0.16 WO HARTEK: satu isian banyak pekerjaan + material (rincian), Selesai = db_Hartek_Pekerjaan + db_Hartek_Material; koordinat wajib', () => {
  const x = konteksWo();
  const buat = sheetPalsu(x.log);
  x.sheets.m.db_Material = buat('db_Material', [x.h.HARTEK_MASTER_HEADER_.db_Material.slice(), [1, 'Kabel NYY', 'm', true, 'mat-1', 1, '', ''], [2, 'Tiang Beton', 'btg', false, 'mat-2', 1, '', '']]);
  x.sheets.m.db_Kepemilikan_Material = buat('db_Kepemilikan_Material', [x.h.HARTEK_MASTER_HEADER_.db_Kepemilikan_Material.slice(), [1, 'PLN', true, 'kep-1', 1, '', '']]);
  const id = x.temuan({ objek_inspeksi: 'Gardu', no_gardu: 'TB0001', gardu_id: 'gar-1', jenis_temuan: 'Trafo bocor' });
  let rev = x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.timH, revision: 1 }).revision;
  rev = x.h.mulaiWo_(x.sesiH, { temuanId: id, revision: rev }, 'MOBILE').revision;
  const m = x.j(x.h.getWoTim_(x.sesiH, {}, 'MOBILE').master);
  assert.deepStrictEqual([m.material.map((z) => z.nama), m.kepemilikan.map((z) => z.nama)], [['Kabel NYY'], ['PLN']], 'master material aktif ikut getWoTim');
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesiH, { temuanId: id, jenisId: 'jh1', jumlah: 1 }, 'MOBILE')), 'FIELD_WAJIB', 'koordinat wajib');
  const k = '-3.010000, 106.510000';
  const pk2 = U(), mt1 = U();
  const rinci = (o) => JSON.stringify(o);
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesiH, { koordinat: k, temuanId: id, rincian: rinci({ pekerjaan: [] }) }, 'MOBILE')), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesiH, { koordinat: k, temuanId: id, rincian: rinci({ pekerjaan: [{ jenisId: 'jh1', jumlah: 1 }], material: [{ id: mt1, materialId: 'mat-2', jumlah: 1, kepemilikan: 'PLN' }] }) }, 'MOBILE')), 'MATERIAL_TIDAK_VALID', 'material nonaktif');
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesiH, { koordinat: k, temuanId: id, rincian: rinci({ pekerjaan: [{ jenisId: 'jh1', jumlah: 1 }], material: [{ id: mt1, materialId: 'mat-1', jumlah: 1, kepemilikan: 'Pemda' }] }) }, 'MOBILE')), 'KEPEMILIKAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesiH, { koordinat: k, temuanId: id, rincian: '{x' }, 'MOBILE')), 'FORMAT_SALAH');
  const a = x.h.simpanPekerjaanWo_(x.sesiH, { koordinat: k, temuanId: id, rincian: rinci({
    pekerjaan: [{ jenisId: 'jh1', jumlah: 3 }, { id: pk2, jenisId: 'jh2', jumlah: 2 }],
    material: [{ id: mt1, materialId: 'mat-1', jumlah: 12.5, kepemilikan: 'PLN' }] }) }, 'MOBILE');
  const r = x.j(a.pekerjaan.rincian);
  assert.deepStrictEqual([a.pekerjaan.pekerjaan, a.pekerjaan.jumlah, r.pekerjaan.map((z) => [z.id === a.tlId || z.id === pk2, z.nama, z.jumlah]), r.material.map((z) => [z.nama, z.jumlah, z.satuan, z.kepemilikan])],
    ['Ganti Arrester', 3, [[true, 'Ganti Arrester', 3], [true, 'Perbaikan Jumper', 2]], [['Kabel NYY', 12.5, 'm', 'PLN']]]);
  for (const sl of ['SEBELUM', 'SESUDAH']) x.h.uploadFotoWo_(x.sesiH, fotoWo(a.tlId, sl), 'MOBILE');
  const hd = x.h.buatHeaderHartek_(x.sesiH, {});
  const s1 = x.j(x.h.selesaiWo_(x.sesiH, { temuanId: id, revision: rev }, 'MOBILE'));
  const HK = x.h.HARTEK_HEADER_.db_Hartek_Pekerjaan, HM = x.h.HARTEK_HEADER_.db_Hartek_Material;
  assert.deepStrictEqual(x.sheets.h.db_Hartek_Pekerjaan.data.slice(1).map((b) => [b[HK.indexOf('pekerjaan')], b[HK.indexOf('jumlah_pekerjaan')], b[HK.indexOf('pekerjaan_id')]]),
    [['Ganti Arrester', 3, a.tlId], ['Perbaikan Jumper', 2, pk2]]);
  const mt = x.sheets.h.db_Hartek_Material.data.slice(1);
  assert.deepStrictEqual(mt.map((b) => [b[HM.indexOf('kode_material')], b[HM.indexOf('material')], b[HM.indexOf('jumlah')], b[HM.indexOf('kepemilikan')], b[HM.indexOf('pekerjaan_id')], b[HM.indexOf('material_id')]]),
    [[hd.kodeHeader + '-GRD.001-PKJ.001-MAT.001', 'Kabel NYY', 12.5, 'PLN', a.tlId, mt1]]);
  assert.deepStrictEqual([s1.tindakLanjut, s1.realisasi[0].kode], ['Ganti Arrester 3 buah, Perbaikan Jumper 2 titik', hd.kodeHeader + '-GRD.001-PKJ.001, ' + hd.kodeHeader + '-GRD.001-PKJ.002']);
  const rk = x.sheets.h.db_Hartek_Pekerjaan.data[2][HK.indexOf('revision')];
  assert.strictEqual(kodeError(() => x.h.ubahPekerjaanHartek_(x.sesiH, { pekerjaanId: pk2, revision: rk, jumlahPekerjaan: 9 })), 'TERKUNCI_WO', 'pekerjaan ke-2 rincian juga terkunci');
});

test('v1.0.16 WO ganda: WO dipindah saat tim lama offline = WO_DIPINDAH, tetap unggah = KLAIM, Selesai ditahan, admin memilih tim', () => {
  const x = konteksWo();
  const k = '-3.010000, 106.510000';
  const id = x.temuan({ objek_inspeksi: 'Gardu', no_gardu: 'TB0001', gardu_id: 'gar-1' });
  // admin teruskan ke ROW, ROW mulai offline (belum terkirim), admin pindah ke Hartek
  const r1 = x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.sesi.timId, revision: 1 }).revision;
  const r2 = x.h.pindahWo_(x.admin, { temuanId: id, timId: x.timH, revision: r1 }).revision;
  assert.deepStrictEqual(x.sheets.t.db_wo_riwayat.data.slice(1).map((b) => b[x.h.TEMUAN_HEADER_.db_wo_riwayat.indexOf('aksi')]), ['TERUSKAN', 'PINDAH']);
  let pesan = '';
  try { x.h.mulaiWo_(x.sesi, { temuanId: id, revision: r1 }, 'MOBILE'); } catch (e) { pesan = e.kode + ' ' + (e.detail || ''); }
  assert.match(pesan, /^WO_DIPINDAH HARTEK 01/);
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesi, { koordinat: k, temuanId: id, diameter: 30 }, 'MOBILE')), 'WO_DIPINDAH');
  // tim lama tetap unggah: KLAIM, WO tetap milik Hartek
  const kl = x.h.mulaiWo_(x.sesi, { temuanId: id, revision: r1, paksa: true }, 'MOBILE');
  assert.strictEqual(kl.ganda, true);
  assert.strictEqual(x.h.mulaiWo_(x.sesi, { temuanId: id, revision: r1, paksa: true }, 'MOBILE').duplikat, true, 'klaim ulang aman');
  assert.deepStrictEqual([x.kt(id, 'tim_tindak_lanjut_id'), x.kt(id, 'status_wo')], [x.timH, 'TERKIRIM']);
  assert.strictEqual(kodeError(() => x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.timY, revision: r2 })), 'WO_GANDA_MENUNGGU', 'admin tidak bisa memindah selama ganda');
  const pr = x.h.simpanPekerjaanWo_(x.sesi, { koordinat: k, temuanId: id, diameter: 30, sectionId: x.sekB }, 'MOBILE');
  for (const sl of ['SEBELUM', 'PEKERJAAN', 'SESUDAH']) x.h.uploadFotoWo_(x.sesi, fotoWo(pr.tlId, sl), 'MOBILE');
  const sr = x.h.selesaiWo_(x.sesi, { temuanId: id, revision: r1 }, 'MOBILE');
  assert.strictEqual(sr.menungguVerifikasi, true, 'Selesai tim klaim ditahan');
  assert.strictEqual(x.sheets.r.row_Eksekusi.data.length, 1, 'belum masuk realisasi ROW');
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesi, { koordinat: k, temuanId: id, diameter: 0 }, 'MOBILE')), 'WO_MENUNGGU_VERIFIKASI', 'sesudah Selesai tidak bisa menambah');
  // tim baru (pemilik) juga mengunggah + Selesai = ditahan juga
  const rH = x.h.mulaiWo_(x.sesiH, { temuanId: id, revision: r2 }, 'MOBILE').revision;
  const ph = x.h.simpanPekerjaanWo_(x.sesiH, { koordinat: k, temuanId: id, jenisId: 'jh1', jumlah: 1 }, 'MOBILE');
  for (const sl of ['SEBELUM', 'SESUDAH']) x.h.uploadFotoWo_(x.sesiH, fotoWo(ph.tlId, sl), 'MOBILE');
  x.h.buatHeaderHartek_(x.sesiH, {});
  assert.strictEqual(x.h.selesaiWo_(x.sesiH, { temuanId: id, revision: rH }, 'MOBILE').menungguVerifikasi, true);
  // tiap tim hanya melihat pekerjaannya sendiri
  const woR = x.j(x.h.getWoTim_(x.sesi, {}, 'MOBILE').wo), woH = x.j(x.h.getWoTim_(x.sesiH, {}, 'MOBILE').wo);
  assert.deepStrictEqual([woR.length, woR[0].pekerjaanWo.map((z) => z.tlId), woR[0].wo.ganda.status, woR[0].wo.ganda.pemilik, woR[0].wo.ganda.menunggu], [1, [pr.tlId], 'SIAP', false, true]);
  assert.deepStrictEqual([woH[0].pekerjaanWo.map((z) => z.tlId), woH[0].wo.ganda.pemilik, woH[0].wo.ganda.menunggu], [[ph.tlId], true, true]);
  // panel admin
  assert.strictEqual(kodeError(() => x.h.getWoGanda_(x.sesi, {})), 'AKSES_DITOLAK');
  const g = x.j(x.h.getWoGanda_(x.admin, {}));
  assert.deepStrictEqual([g.menunggu, g.ganda.length, g.ganda[0].keduanyaUnggah, g.ganda[0].tim.map((z) => [z.tim, z.pemilik, z.status, z.pekerjaan.length])],
    [1, 1, true, [['HARTEK 01', true, 'SIAP', 1], ['ROW 01', false, 'SIAP', 1]]]);
  assert.strictEqual(x.j(x.h.getWoAdmin_(x.admin, {})).ringkas.ganda, 1);
  assert.strictEqual(x.h.getFotoWoGanda_(x.admin, { temuanId: id, tlId: pr.tlId, slot: 'SEBELUM' }).slot, 'SEBELUM');
  assert.strictEqual(kodeError(() => x.h.putuskanWoGanda_(x.admin, { temuanId: id, timId: x.timY })), 'TIM_TIDAK_VALID', 'hanya tim yang mengunggah');
  // admin memilih ROW (tim lama): WO milik ROW DIKERJAKAN, pekerjaan Hartek BATAL, Hartek tahu ditolak
  const pu = x.h.putuskanWoGanda_(x.admin, { temuanId: id, timId: x.sesi.timId, catatan: 'ROW yang ke lokasi' });
  assert.deepStrictEqual([pu.tim, pu.dibatalkan, x.kt(id, 'tim_tindak_lanjut_id'), x.kt(id, 'status_wo'), x.kt(id, 'jenis_tim_tindak_lanjut')], ['ROW 01', 1, x.sesi.timId, 'DIKERJAKAN', 'ROW']);
  assert.strictEqual(kodeError(() => x.h.putuskanWoGanda_(x.admin, { temuanId: id, timId: x.sesi.timId })), 'WO_GANDA_SUDAH_DIPUTUSKAN');
  const woH2 = x.j(x.h.getWoTim_(x.sesiH, {}, 'MOBILE').wo);
  assert.deepStrictEqual([woH2.length, woH2[0].wo.ganda.status, woH2[0].wo.ganda.pemilik], [1, 'DITOLAK', false], 'HP Hartek membuang WO');
  assert.strictEqual(kodeError(() => x.h.mulaiWo_(x.sesiH, { temuanId: id, revision: 1, paksa: true }, 'MOBILE')), 'WO_GANDA_SUDAH_DIPUTUSKAN', 'tim ditolak tidak bisa klaim lagi');
  // HP ROW mengirim ulang Selesai: masuk realisasi ROW
  x.sync([x.op('header', 'buat', U(), x.kodeH, { tanggal: x.hariIni })]);
  const woR2 = x.j(x.h.getWoTim_(x.sesi, {}, 'MOBILE').wo);
  assert.deepStrictEqual([woR2[0].wo.status, woR2[0].wo.ganda.status, woR2[0].wo.ganda.menunggu], ['DIKERJAKAN', 'DIPILIH', false]);
  const sf = x.j(x.h.selesaiWo_(x.sesi, { temuanId: id, revision: woR2[0].revision }, 'MOBILE'));
  assert.deepStrictEqual([sf.realisasi.length, x.kt(id, 'status_wo')], [1, 'SELESAI']);
  assert.strictEqual(x.j(x.h.getWoGanda_(x.admin, { status: 'SELESAI' })).ganda.length, 1);
});

test('v1.0.16 WO: tim pernah ditugaskan lalu WO ditarik = WO_DIPINDAH; WO selesai tim lain tidak bisa diklaim; WO Yandal tolak foto galeri', () => {
  const x = konteksWo();
  const id = x.temuan();
  const r1 = x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.sesi.timId, revision: 1 }).revision;
  x.h.tarikWo_(x.admin, { temuanId: id, revision: r1 });
  let pesan = '';
  try { x.h.mulaiWo_(x.sesi, { temuanId: id, revision: r1 }, 'MOBILE'); } catch (e) { pesan = e.kode + ' ' + (e.detail || ''); }
  assert.match(pesan, /^WO_DIPINDAH ditarik admin/);
  const id2 = x.temuan();
  let rv = x.h.teruskanWo_(x.admin, { temuanId: id2, timId: x.sesi.timId, revision: 1 }).revision;
  rv = x.h.pindahWo_(x.admin, { temuanId: id2, timId: x.timH, revision: rv }).revision;
  rv = x.h.mulaiWo_(x.sesiH, { temuanId: id2, revision: rv }, 'MOBILE').revision;
  const ph = x.h.simpanPekerjaanWo_(x.sesiH, { koordinat: '-3.010000, 106.510000', temuanId: id2, jenisId: 'jh2', jumlah: 1 }, 'MOBILE');
  for (const sl of ['SEBELUM', 'SESUDAH']) x.h.uploadFotoWo_(x.sesiH, fotoWo(ph.tlId, sl), 'MOBILE');
  x.h.buatHeaderHartek_(x.sesiH, {});
  x.h.selesaiWo_(x.sesiH, { temuanId: id2, revision: rv, daerah: 'Kampung Baru', jumlahGawang: 2 }, 'MOBILE');
  assert.strictEqual(kodeError(() => x.h.mulaiWo_(x.sesi, { temuanId: id2, revision: 1, paksa: true }, 'MOBILE')), 'WO_SUDAH_SELESAI');
  // tab db_wo_ganda belum dibuat = klaim butuh setup admin, fitur lama tetap jalan
  const id3 = x.temuan();
  const r3 = x.h.teruskanWo_(x.admin, { temuanId: id3, timId: x.sesi.timId, revision: 1 }).revision;
  x.h.pindahWo_(x.admin, { temuanId: id3, timId: x.timH, revision: r3 });
  delete x.sheets.t.db_wo_ganda;
  assert.strictEqual(kodeError(() => x.h.mulaiWo_(x.sesi, { temuanId: id3, revision: 1, paksa: true }, 'MOBILE')), 'CONFIG_TIDAK_LENGKAP');
  assert.strictEqual(x.h.getWoTim_(x.sesiH, {}, 'MOBILE').wo.length, 2);
});

test('v1.0.10 WO YANDAL: hanya HP + shift, Selesai = yan_P0 SELESAI Menunggu verifikasi (foto dari WO), pekerjaan switching / gardu ditolak', () => {
  const x = siapkanP0();
  const props = x.g.PropertiesService.getScriptProperties();
  props.setProperty('TEMUAN_SHEET_ID', 't');
  props.setProperty('INSJAR_FOTO_FOLDER_ID', 'wofoto');
  const buat = sheetPalsu(x.log);
  x.sheets.t = {};
  for (const [nama, hdr] of Object.entries(x.g.TEMUAN_HEADER_)) x.sheets.t[nama] = buat(nama, [hdr.slice()]);
  const id = U();
  const tgl = x.hari;
  x.sheets.t.db_temuan_inspeksi.data.push(barisTemuanWo(x.g, { nomor: 1, kode_header: 'IJR-16130' + tgl.slice(2, 4) + tgl.slice(5, 7) + tgl.slice(8, 10) + '001',
    kode_temuan: 'IJR-X-TJR.001', tanggal: tgl, objek_inspeksi: 'Jaringan', penyulang: 'Tanjung Labu', section: 'FCO Jar Tj. Sangkar', section_id: x.sek.a,
    jenis_temuan: 'FCO rusak', status: 'Penugasan Tim', sumber: 'ADMIN', temuan_id: id, revision: 1 }));
  const sesi = x.g.sesiDariToken_(x.s.token);
  x.jam.atur('09:00:00');
  let rev = x.g.teruskanWo_(x.sesiAdmin, { temuanId: id, timId: x.tim.t13, revision: 1 }).revision;
  assert.strictEqual(kodeError(() => x.g.mulaiWo_(sesi, { temuanId: id, revision: rev }, 'WEB')), 'AKSES_DITOLAK');
  rev = x.g.mulaiWo_(sesi, { temuanId: id, revision: rev }, 'MOBILE').revision;
  assert.strictEqual(kodeError(() => x.g.simpanPekerjaanWo_(sesi, { koordinat: '-3.010000, 106.510000', temuanId: id, namaPekerjaan: 'Pengecekan Switching' }, 'MOBILE')), 'PEKERJAAN_TIDAK_DIDUKUNG');
  const p = x.g.simpanPekerjaanWo_(sesi, { koordinat: '-3.010000, 106.510000', temuanId: id, namaPekerjaan: 'Ganti FCO', catatan: 'FCO fasa R' }, 'MOBILE');
  const jamF = { SEBELUM: '09:05:00', PEKERJAAN: '09:20:00', SESUDAH: '09:35:00' };
  // v1.0.16: WO Yandal = kamera saja (galeri ditolak)
  assert.strictEqual(kodeError(() => x.g.uploadFotoWo_(sesi, fotoWo(p.tlId, 'SEBELUM', { sumber: 'GALERI' }), 'MOBILE')), 'FOTO_HARUS_KAMERA');
  for (const sl of ['SEBELUM', 'PEKERJAAN', 'SESUDAH']) x.g.uploadFotoWo_(sesi, fotoWo(p.tlId, sl, { waktu: x.iso(jamF[sl]), lat: -3.0, lng: 106.5 }), 'MOBILE');
  const awal = x.sheets.y.yan_P0.data.length;
  const s = JSON.parse(JSON.stringify(x.g.selesaiWo_(sesi, { temuanId: id, revision: rev }, 'MOBILE')));
  assert.strictEqual(x.sheets.y.yan_P0.data.length, awal + 1);
  const b = x.sheets.y.yan_P0.data.length - 1;
  assert.deepStrictEqual([x.kol(b, 'Kode P0'), x.kol(b, 'Nama Pekerjaan'), x.kol(b, 'Status P0'), x.kol(b, 'Status Approval'), x.kol(b, 'p0_id'), x.kol(b, 'Durasi (menit)'), x.kol(b, 'Bobot'), x.kol(b, 'Penyulang')],
    [x.s.yandal.kodeShift + '-P0.001', 'Ganti FCO', 'SELESAI', 'Menunggu', p.tlId, 30, 3, 'Tanjung Labu']);
  assert.ok(String(x.kol(b, 'Link Drive Sesudah')).startsWith('https://drive.google.com/file/d/'));
  assert.match(String(x.kol(b, 'Catatan')), /^WO IJR-X-TJR\.001 FCO rusak\. FCO fasa R/);
  assert.strictEqual(x.kolS('Jumlah P0'), 1, 'rekap shift ikut');
  assert.deepStrictEqual(s.realisasi.map((r) => r.kode), [x.s.yandal.kodeShift + '-P0.001']);
});

test('v1.0.10 WO: struktur db_temuan_inspeksi + db_temuan_tindak_lanjut, ADMIN_siapkanSheetInsJar membuat tab baru, cekKonfigWo_', () => {
  const T = g.TEMUAN_HEADER_;
  for (const k of ['status_wo', 'tim_tindak_lanjut', 'jenis_tim_tindak_lanjut', 'catatan_admin', 'waktu_mulai', 'tindak_lanjut', 'tim_tindak_lanjut_id']) assert.ok(T.db_temuan_inspeksi.includes(k), k);
  for (const n of Object.keys(T)) assert.strictEqual(new Set(T[n]).size, T[n].length, n + ' unik');
  for (const k of ['kode_tl', 'diameter', 'jumlah', 'satuan', 'foto_sebelum_link', 'foto_sesudah_file_id', 'kode_realisasi_modul', 'tl_id', 'realisasi_modul_id']) assert.ok(T.db_temuan_tindak_lanjut.includes(k), k);
  const x = konteksWo();
  x.h.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  delete x.sheets.t.db_temuan_tindak_lanjut;
  x.h.PropertiesService.getScriptProperties().setProperty('INSJAR_SHEET_ID', 'i');
  x.sheets.i = {};
  for (const [nama, hdr] of Object.entries(x.h.INSJAR_HEADER_)) x.sheets.i[nama] = sheetPalsu([])(nama, [hdr.slice()]);
  x.sheets.m.db_Jenis_Temuan = sheetPalsu([])('db_Jenis_Temuan', [x.h.INSJAR_MASTER_HEADER_.db_Jenis_Temuan.slice()]);
  x.h.ADMIN_siapkanSheetInsJar();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(x.sheets.t.db_temuan_tindak_lanjut.data[0])), JSON.parse(JSON.stringify(T.db_temuan_tindak_lanjut)));
  x.sheets.m.db_Menu = sheetPalsu([])('db_Menu', [['menu_kode', 'nama', 'platform', 'urutan', 'aktif', 'khusus_super'], ['OPS_PENERUSAN_WO', 'x', 'MOBILE', 1, true, false], ['OPS_WO_TIM', 'y', 'MOBILE', 2, true, false], ['OPS_WO_GANDA', 'z', 'MOBILE', 3, true, false]]);
  assert.strictEqual(x.h.cekKonfigWo_(x.h.cfg_()), 0);
  // v1.0.16: tab riwayat + ganda dibuat, kolom rincian di tindak lanjut
  assert.ok(T.db_temuan_tindak_lanjut.includes('rincian'));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(x.sheets.t.db_wo_ganda.data[0])), JSON.parse(JSON.stringify(T.db_wo_ganda)));
  delete x.sheets.t.db_wo_riwayat;
  assert.strictEqual(x.h.cekKonfigWo_(x.h.cfg_()), 1, 'tab riwayat belum ada = perhatian');
});

test('v1.0.11 temuan admin object Gardu: pilih gardu AKTIF (penyulang + section dari db_Gardu), no_gardu + gardu_id tertulis, master admin berisi gardu', () => {
  const x = konteksInsDu();
  const m = x.h.getMasterTemuanInspeksi_(x.admin);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m.gardu.map((g) => g.noGardu))), ['PY0001', 'TB0101', 'TB0102']);
  const jg = x.h.getMasterInsDu_(x.sesi).jenisTemuan[0].jenisTemuanId;
  assert.strictEqual(kodeError(() => x.h.simpanTemuanInspeksi_(x.admin, { objekInspeksi: 'Gardu', jenisTemuanId: jg })), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => x.h.simpanTemuanInspeksi_(x.admin, { objekInspeksi: 'Gardu', jenisTemuanId: jg, garduId: x.gid.mati })), 'GARDU_TIDAK_AKTIF');
  assert.strictEqual(kodeError(() => x.h.simpanTemuanInspeksi_(x.admin, { penyulang: 'PNY-A', section: 'SEC-1', jenisTemuanId: 'jt-1', garduId: x.gid.a })), 'FIELD_TIDAK_DIKENAL');
  assert.strictEqual(kodeError(() => x.h.simpanTemuanInspeksi_(x.admin, { section: 'SEC-1', jenisTemuanId: 'jt-1' })), 'FIELD_WAJIB', 'Jaringan tetap wajib penyulang');
  const t = x.h.simpanTemuanInspeksi_(x.admin, { objekInspeksi: 'Gardu', jenisTemuanId: jg, garduId: x.gid.a, deskripsi: 'cover hilang' });
  const kol = x.h.TEMUAN_HEADER_.db_temuan_inspeksi;
  const b = x.sheets.t.db_temuan_inspeksi.data.filter((r) => r[kol.indexOf('temuan_id')] === t.temuanId)[0];
  assert.deepStrictEqual(['objek_inspeksi', 'penyulang', 'section', 'no_gardu', 'gardu_id', 'sumber'].map((k) => b[kol.indexOf(k)]),
    ['Gardu', 'PNY-A', 'SEC-1', 'TB0101', x.gid.a, 'ADMIN']);
  const hp = x.h.getTemuanInspeksi_(x.admin, {}).temuan.filter((z) => z.temuanId === t.temuanId)[0];
  assert.deepStrictEqual([hp.noGardu, hp.garduId], ['TB0101', x.gid.a]);
});

test('v1.0.14 insdu: tier ganda Tier 1 & Tier 2, Tier 2 saja tanpa ukur (langsung masuk laporan), tier temuan dari tier gardu, koordinat wajib', () => {
  const x = konteksInsDu();
  x.sheets.g.db_Gardu.data[1][x.h.DB_GARDU_HEADER_.indexOf('Lat')] = -3.0123;
  x.sheets.g.db_Gardu.data[1][x.h.DB_GARDU_HEADER_.indexOf('Long')] = 106.5;
  const m = x.h.getMasterInsDu_(x.sesi);
  assert.strictEqual(m.gardu.filter((g) => g.noGardu === 'TB0101')[0].koordinat, '-3.012300, 106.500000');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m.tierGardu)), ['Tier 1', 'Tier 2', 'Tier 1 & Tier 2']);
  const hd = x.h.buatHeaderInsDu_(x.sesi, {});
  const rDua = x.h.simpanRealisasiInsDu_(x.sesi, { headerId: hd.headerId, garduId: x.gid.a, tier: 'Tier 1 & Tier 2' });
  const rT2 = x.h.simpanRealisasiInsDu_(x.sesi, { headerId: hd.headerId, garduId: x.gid.b, tier: 'Tier 2' });
  assert.strictEqual(kodeError(() => x.h.simpanPengukuranInsDu_(x.sesi, { realisasiId: rT2.realisasiId, periode: 'LWBP', ...x.nilai, ...x.cover })), 'TIER_TANPA_PENGUKURAN');
  let hr = x.h.getInsDuHarian_(x.sesi, {});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(hr.realisasi.map((z) => [z.noGardu, z.perluUkur, z.statusUkur, z.masukLaporan]))),
    [['TB0101', true, 'BELUM', false], ['TB0102', false, 'TANPA_UKUR', true]]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(x.h.dataInspeksiGarduHari_(x.hariIni))), { perPenyulang: { 'PNY-A': 1 }, komulatif: 1 }, 'Tier 2 saja ikut laporan');
  // temuan: gardu 2 tier = tier wajib dipilih; tier di luar tier gardu ditolak; koordinat wajib
  assert.strictEqual(kodeError(() => x.h.simpanTemuanInsDu_(x.sesi, { realisasiId: rDua.realisasiId, jenisTemuanId: 'jt-3' })), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => x.h.simpanTemuanInsDu_(x.sesi, { realisasiId: rDua.realisasiId, jenisTemuanId: 'jt-3', koordinat: '-3.02, 106.51' })), 'FIELD_WAJIB', 'tier wajib untuk gardu 2 tier');
  assert.strictEqual(kodeError(() => x.h.simpanTemuanInsDu_(x.sesi, { realisasiId: rT2.realisasiId, jenisTemuanId: 'jt-3', koordinat: '-3.02, 106.51', tierInspeksi: 'Tier 1' })), 'TIER_TIDAK_SESUAI');
  const t2 = x.h.simpanTemuanInsDu_(x.sesi, { realisasiId: rT2.realisasiId, jenisTemuanId: 'jt-3', koordinat: '-3.02, 106.51' });
  const T = x.h.TEMUAN_HEADER_.db_temuan_inspeksi;
  const bt = x.sheets.t.db_temuan_inspeksi.data.filter((b) => b[T.indexOf('temuan_id')] === t2.temuanId)[0];
  assert.strictEqual(bt[T.indexOf('tier_inspeksi')], 'Tier 2', 'gardu 1 tier = tier otomatis');
  x.h.simpanTemuanInsDu_(x.sesi, { realisasiId: rDua.realisasiId, jenisTemuanId: 'jt-3', koordinat: '-3.02, 106.51', tierInspeksi: 'Tier 2' });
  // ubah gardu: tier
  assert.strictEqual(kodeError(() => x.h.ubahRealisasiInsDu_(x.sesi, { realisasiId: rDua.realisasiId, revision: 1, tier: 'Tier 1' })), 'TIER_TERKUNCI', 'temuan Tier 2 masih ada');
  x.h.simpanPengukuranInsDu_(x.sesi, { realisasiId: rDua.realisasiId, periode: 'LWBP', ...x.nilai, ...x.cover });
  assert.strictEqual(kodeError(() => x.h.ubahRealisasiInsDu_(x.sesi, { realisasiId: rDua.realisasiId, revision: 1, tier: 'Tier 2' })), 'TIER_TERKUNCI', 'pengukuran sudah ada');
  assert.strictEqual(kodeError(() => x.h.ubahRealisasiInsDu_(x.sesi, { realisasiId: rDua.realisasiId, revision: 1, tier: 'Tier 1 & Tier 2', garduId: x.gid.lain })), 'GARDU_TERKUNCI');
  assert.strictEqual(kodeError(() => x.h.ubahRealisasiInsDu_(x.sesi, { realisasiId: rDua.realisasiId, revision: 9, tier: 'Tier 1 & Tier 2' })), 'KONFLIK_REVISION');
  // gardu tanpa ukur / temuan: boleh ganti gardu + tier
  const rBaru = x.h.simpanRealisasiInsDu_(x.sesi, { headerId: hd.headerId, garduId: x.gid.lain, tier: 'Tier 2' });
  assert.strictEqual(kodeError(() => x.h.ubahRealisasiInsDu_(x.sesi, { realisasiId: rBaru.realisasiId, revision: 1, tier: 'Tier 2', garduId: x.gid.b })), 'GARDU_GANDA');
  x.h.ubahTemuanInsDu_; // tetap ada
  const u = x.h.ubahRealisasiInsDu_(x.sesi, { realisasiId: rT2.realisasiId, revision: 1, tier: 'Tier 1 & Tier 2' });
  assert.deepStrictEqual([u.revision, u.realisasi.tier, u.realisasi.perluUkur, u.realisasi.masukLaporan, u.realisasi.statusUkur], [2, 'Tier 1 & Tier 2', true, false, 'BELUM']);
  hr = x.h.getInsDuHarian_(x.sesi, {});
  assert.strictEqual(hr.realisasi.filter((z) => z.realisasiId === rT2.realisasiId)[0].tier, 'Tier 1 & Tier 2');
});

// ---------- v1.0.17 ----------

test('v1.0.18 WO HARTEK: material menempel ke pekerjaan yang memakainya, kepemilikan dari db_Kepemilikan_Material (tanpa isian bebas)', () => {
  const x = konteksWo();
  const buat = sheetPalsu(x.log);
  x.sheets.m.db_Material = buat('db_Material', [x.h.HARTEK_MASTER_HEADER_.db_Material.slice(), [1, 'Kabel NYY', 'm', true, 'mat-1', 1, '', ''], [2, 'Arrester', 'bh', true, 'mat-2', 1, '', '']]);
  // v1.0.18: WO memakai db_Kepemilikan_Material; db_Kepemilikan (tab lain) tidak dibaca lagi
  x.sheets.m.db_Kepemilikan_Material = buat('db_Kepemilikan_Material', [x.h.HARTEK_MASTER_HEADER_.db_Kepemilikan_Material.slice(), [1, 'PLN', true, 'kp-1', 1, '', ''], [2, 'Pelanggan', true, 'kp-2', 1, '', ''], [3, 'Pemda', false, 'kp-3', 1, '', '']]);
  x.sheets.m.db_Kepemilikan = buat('db_Kepemilikan', [x.h.HARTEK_MASTER_HEADER_.db_Kepemilikan_Material.slice(), [1, 'Swasta', true, 'lain-1', 1, '', '']]);
  const id = x.temuan({ objek_inspeksi: 'Gardu', no_gardu: 'TB0001', gardu_id: 'gar-1', jenis_temuan: 'Trafo bocor' });
  let rev = x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.timH, revision: 1 }).revision;
  rev = x.h.mulaiWo_(x.sesiH, { temuanId: id, revision: rev }, 'MOBILE').revision;
  const m = x.j(x.h.getWoTim_(x.sesiH, {}, 'MOBILE').master);
  assert.deepStrictEqual(m.kepemilikan.map((z) => z.nama), ['PLN', 'Pelanggan'], 'pilihan kepemilikan = baris aktif db_Kepemilikan_Material');
  const k = '-3.010000, 106.510000';
  const pk2 = U(), mt1 = U(), mt2 = U(), mt3 = U();
  const rinci = (o) => JSON.stringify(o);
  const isi = (milik2) => ({ koordinat: k, temuanId: id, rincian: rinci({ pekerjaan: [
    { jenisId: 'jh1', jumlah: 3, material: [{ id: mt1, materialId: 'mat-2', jumlah: 3, kepemilikan: 'PLN' }] },
    { id: pk2, jenisId: 'jh2', jumlah: 2, material: [{ id: mt2, materialId: 'mat-1', jumlah: 12.5, kepemilikan: milik2 }, { id: mt3, materialId: 'mat-2', jumlah: 1, kepemilikan: 'kp-1' }] }] }) });
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesiH, isi('Pemda'), 'MOBILE')), 'KEPEMILIKAN_TIDAK_VALID', 'kepemilikan nonaktif');
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesiH, isi('Bebas'), 'MOBILE')), 'KEPEMILIKAN_TIDAK_VALID', 'di luar master');
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesiH, isi('Swasta'), 'MOBILE')), 'KEPEMILIKAN_TIDAK_VALID', 'db_Kepemilikan tidak dipakai');
  // db_Kepemilikan_Material kosong = material ditolak (tidak ada isian bebas)
  const km = x.sheets.m.db_Kepemilikan_Material;
  x.sheets.m.db_Kepemilikan_Material = buat('db_Kepemilikan_Material', [x.h.HARTEK_MASTER_HEADER_.db_Kepemilikan_Material.slice()]);
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesiH, isi('Pelanggan'), 'MOBILE')), 'KEPEMILIKAN_TIDAK_VALID', 'master kosong');
  x.sheets.m.db_Kepemilikan_Material = km;
  const a = x.h.simpanPekerjaanWo_(x.sesiH, isi('Pelanggan'), 'MOBILE');
  const r = x.j(a.pekerjaan.rincian);
  assert.deepStrictEqual(r.pekerjaan.map((p) => [p.nama, p.material.map((z) => [z.nama, z.jumlah, z.kepemilikan, z.pekerjaanId])]),
    [['Ganti Arrester', [['Arrester', 3, 'PLN', a.tlId]]], ['Perbaikan Jumper', [['Kabel NYY', 12.5, 'Pelanggan', pk2], ['Arrester', 1, 'PLN', pk2]]]]);
  assert.strictEqual(r.material.length, 3, 'daftar datar untuk pembaca lama');
  const TL = x.h.TEMUAN_HEADER_.db_temuan_tindak_lanjut;
  const simpan = JSON.parse(x.sheets.t.db_temuan_tindak_lanjut.data[1][TL.indexOf('rincian')]);
  assert.strictEqual(simpan.material, undefined, 'tersimpan: material hanya di dalam pekerjaan (tidak ganda)');
  for (const sl of ['SEBELUM', 'SESUDAH']) x.h.uploadFotoWo_(x.sesiH, fotoWo(a.tlId, sl), 'MOBILE');
  const hd = x.h.buatHeaderHartek_(x.sesiH, {});
  x.h.selesaiWo_(x.sesiH, { temuanId: id, revision: rev }, 'MOBILE');
  const HM = x.h.HARTEK_HEADER_.db_Hartek_Material;
  assert.deepStrictEqual(x.sheets.h.db_Hartek_Material.data.slice(1).map((b) => [b[HM.indexOf('kode_material')], b[HM.indexOf('material')], b[HM.indexOf('pekerjaan_id')], b[HM.indexOf('kepemilikan')]]), [
    [hd.kodeHeader + '-GRD.001-PKJ.001-MAT.001', 'Arrester', a.tlId, 'PLN'],
    [hd.kodeHeader + '-GRD.001-PKJ.002-MAT.001', 'Kabel NYY', pk2, 'Pelanggan'],
    [hd.kodeHeader + '-GRD.001-PKJ.002-MAT.002', 'Arrester', pk2, 'PLN'],
  ], 'material ditulis di bawah pekerjaannya masing-masing');
  // rincian lama (material di luar pekerjaan) tetap terbaca = milik pekerjaan pertama
  const lama = x.h.rincianWo_({ tl_id: 'tl-1', rincian: JSON.stringify({ pekerjaan: [{ jenisId: 'jh1' }, { id: 'p2', jenisId: 'jh2' }], material: [{ id: 'm9', nama: 'Kabel' }] }) });
  assert.deepStrictEqual(x.j(lama.pekerjaan.map((p) => p.material.map((z) => [z.id, z.pekerjaanId]))), [[['m9', 'tl-1']], []]);
});

test('v1.0.17 WO admin: teruskan / tarik dikirim ulang sesudah timeout = berhasil (duplikat); perubahan lain tetap KONFLIK_REVISION', () => {
  const x = konteksWo();
  const id = x.temuan();
  const a = x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.timH, catatan: 'cek', revision: 1 });
  const ulang = x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.timH, catatan: 'cek', revision: 1 });
  assert.deepStrictEqual([ulang.duplikat, ulang.revision, x.kt(id, 'tim_tindak_lanjut_id')], [true, a.revision, x.timH]);
  assert.strictEqual(x.sheets.t.db_wo_riwayat.data.length, 2, 'kiriman ulang tidak menambah riwayat');
  assert.strictEqual(kodeError(() => x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.timH, catatan: 'beda', revision: 1 })), 'KONFLIK_REVISION');
  assert.strictEqual(kodeError(() => x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.timY, revision: 1 })), 'KONFLIK_REVISION');
  const t = x.h.tarikWo_(x.admin, { temuanId: id, revision: a.revision });
  const tUlang = x.h.tarikWo_(x.admin, { temuanId: id, revision: a.revision });
  assert.deepStrictEqual([tUlang.duplikat, tUlang.revision, x.kt(id, 'status_wo')], [true, t.revision, '']);
  assert.strictEqual(kodeError(() => x.h.tarikWo_(x.admin, { temuanId: id, revision: t.revision })), 'WO_BELUM_DITERUSKAN', 'revisi terbaru tanpa penugasan tetap ditolak');
});

test('v1.0.17 sinkron atomik: segel = ringkasan HP sama dengan server; admin SIAP WA hanya sesudah segel dan isi belum berubah', () => {
  const x = konteksWo();
  const buat = sheetPalsu(x.log);
  // paritas rumus dengan HP (mobile/test/sinkron_atomik_test.dart)
  assert.strictEqual(x.h.fnv1aSegel_('SiSi Toboali'), 'a9e44bc3');
  assert.deepStrictEqual(x.j(x.h.ringkasSegel_('HARTEK', { header: { headerId: 'h1' }, objek: [{ pgId: 'p1', pekerjaan: [{ pekerjaanId: 'k1', material: [{ idBaris: 'm1' }],
    grounding: [{ idBaris: 'g1', foto: { SEBELUM: 'L1', SESUDAH: '' } }], pemerataan: [] }] }, { pgId: 'p2', pekerjaan: [] }] })),
  { header: 1, lokasi: 2, pekerjaan: 1, material: 1, grounding: 1, pemerataan: 0, foto: 1, sidik: '6f9d8a58' });
  assert.deepStrictEqual(x.j(x.h.ringkasSegel_('INSJAR', { header: { headerId: 'h2' }, realisasi: [{ realisasiId: 'r1', temuan: [{ temuanId: 't1', foto: { TEMUAN: 'a', TIANG: 'b' } }, { temuanId: 't2', foto: {} }] }] })),
    { header: 1, realisasi: 1, temuan: 2, foto: 2, sidik: 'eba90ab5' });
  // peran: endpoint Hartek hanya petugas HARTEK
  assert.strictEqual(kodeError(() => x.h.segelSinkronHartek_(x.sesi, { ringkas: '{}' })), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.h.segelSinkronHartek_(x.sesiH, { ringkas: '{}' })), 'DATA_TIDAK_DITEMUKAN', 'belum ada Laporan Utama');
  const hd = x.h.buatHeaderHartek_(x.sesiH, {});
  const tgl = x.h.tanggalHariIniHartek_();
  const lap = () => x.j(x.h.laporanHartekRingkasAdmin_(tgl, null))[0];
  assert.strictEqual(lap().sinkron, '', 'log_Sinkron belum disiapkan = perilaku lama');
  x.sheets.a.log_Sinkron = buat('log_Sinkron', [x.h.SEGEL_HEADER_.slice()]);
  assert.strictEqual(lap().sinkron, 'PROSES', 'belum disegel HP');
  const hp = x.h.ringkasSegel_('HARTEK', x.h.getHartekHarian_(x.sesiH, {}));
  assert.strictEqual(kodeError(() => x.h.segelSinkronHartek_(x.sesiH, { ringkas: 'x' })), 'FORMAT_SALAH');
  const beda = x.j(x.h.segelSinkronHartek_(x.sesiH, { ringkas: JSON.stringify({ ...hp, lokasi: 1 }) }));
  assert.deepStrictEqual([beda.cocok, beda.status, x.sheets.a.log_Sinkron.data.length], [false, 'TIDAK_COCOK', 1], 'HP masih punya data yang belum sampai server');
  const ok = x.j(x.h.segelSinkronHartek_(x.sesiH, { ringkas: JSON.stringify(hp) }));
  assert.deepStrictEqual([ok.cocok, ok.status, ok.disimpan, x.sheets.a.log_Sinkron.data.length], [true, 'LENGKAP', true, 2]);
  x.h.segelSinkronHartek_(x.sesiH, { ringkas: JSON.stringify(hp) });
  assert.strictEqual(x.sheets.a.log_Sinkron.data.length, 2, 'segel ulang = baris sama diperbarui');
  const SL = x.h.SEGEL_HEADER_;
  assert.deepStrictEqual([x.sheets.a.log_Sinkron.data[1][SL.indexOf('modul')], x.sheets.a.log_Sinkron.data[1][SL.indexOf('kunci')], x.sheets.a.log_Sinkron.data[1][SL.indexOf('status')]],
    ['HARTEK', hd.headerId, 'LENGKAP']);
  assert.strictEqual(lap().sinkron, 'LENGKAP');
  // lokasi baru masuk server sesudah segel (antrean HP berjalan lagi) = kembali PROSES, SIAP WA dicabut
  const HP = x.h.HARTEK_HEADER_.db_Hartek_PenyulangGardu;
  const b = HP.map(() => '');
  b[HP.indexOf('pg_id')] = U();
  b[HP.indexOf('header_id')] = hd.headerId;
  b[HP.indexOf('jenis_pekerjaan')] = 'Jaringan';
  x.sheets.h.db_Hartek_PenyulangGardu.data.push(b);
  assert.deepStrictEqual([lap().sinkron, lap().siapKirim], ['PROSES', false]);
});

test('v1.0.17 penguncian: temuan yang sudah diteruskan tidak bisa diubah petugas inspeksi; nomor tiang temuan terkunci di WO ROW', () => {
  const x = konteksWo();
  const id = x.temuan({ nomor_tiang: 'TB-7' });
  const ins = { userId: U(), username: '16130.insjar01', role: 'PETUGAS', jenisTim: 'INSPEKSI_JARINGAN', timId: x.timIns, timNama: 'INSPEKSI 01' };
  let rev = x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.sesi.timId, revision: 1 }).revision;
  assert.strictEqual(kodeError(() => x.h.ubahTemuanInsJar_(ins, { temuanId: id, revision: rev, jenisTemuanId: 'jt-1' })), 'WO_SUDAH_DITERUSKAN');
  rev = x.h.mulaiWo_(x.sesi, { temuanId: id, revision: rev }, 'MOBILE').revision;
  assert.strictEqual(kodeError(() => x.h.ubahTemuanInsJar_(ins, { temuanId: id, revision: rev, jenisTemuanId: 'jt-1' })), 'WO_SUDAH_DIMULAI');
  const k = '-3.010000, 106.510000';
  assert.strictEqual(kodeError(() => x.h.simpanPekerjaanWo_(x.sesi, { koordinat: k, temuanId: id, diameter: 30, nomorTiang: 'TB-9' }, 'MOBILE')), 'TIANG_TERKUNCI');
  const p = x.h.simpanPekerjaanWo_(x.sesi, { koordinat: k, temuanId: id, diameter: 30 }, 'MOBILE');
  assert.deepStrictEqual([p.pekerjaan.nomorTiang, p.pekerjaan.section], ['TB-7', 'Kampung Baru'], 'tiang + section dari input petugas inspeksi');
  assert.strictEqual(x.h.simpanPekerjaanWo_(x.sesi, { koordinat: k, temuanId: id, diameter: 0, nomorTiang: 'tb-7', sectionId: x.sekB }, 'MOBILE').pekerjaan.nomorTiang, 'TB-7');
});

test('v1.0.17 arsip laporan Hartek / InsJar / InsDu: sampai kemarin, maks 31 hari, tim sendiri, dokumen sama dengan harian', () => {
  const x = konteksWo();
  const hari = x.h.tanggalHariIniHartek_();
  const kemarin = x.h.tglJakarta_(new Date(Date.now() - 864e5));
  const ymd = (t) => t.slice(2, 4) + t.slice(5, 7) + t.slice(8, 10);
  const HH = x.h.HARTEK_HEADER_.db_Hartek_Header;
  const baris = (tgl, timId, id) => { const b = HH.map(() => ''); b[HH.indexOf('kode_header')] = 'HAR-16130' + ymd(tgl) + '001'; b[HH.indexOf('tanggal')] = tgl;
    b[HH.indexOf('header_id')] = id; b[HH.indexOf('tim_id')] = timId; b[HH.indexOf('status')] = 'AKTIF'; b[HH.indexOf('revision')] = 1; return b; };
  const hk = U();
  x.sheets.h.db_Hartek_Header.data.push(baris(kemarin, x.timH, hk), baris(kemarin, U(), U()));
  x.h.buatHeaderHartek_(x.sesiH, {});   // hari ini: tidak masuk arsip
  assert.strictEqual(kodeError(() => x.h.getArsipHartek_(x.sesiH, { dari: kemarin, sampai: hari })), 'TANGGAL_DI_LUAR_BATAS');
  assert.strictEqual(kodeError(() => x.h.getArsipHartek_(x.sesiH, { dari: '2026-01-01', sampai: '2026-03-01' })), 'RENTANG_TERLALU_PANJANG');
  assert.strictEqual(kodeError(() => x.h.getArsipHartek_(x.sesi, { dari: kemarin, sampai: kemarin })), 'AKSES_DITOLAK');
  const a = x.j(x.h.getArsipHartek_(x.sesiH, { dari: kemarin, sampai: kemarin }));
  assert.deepStrictEqual([a.laporan.length, a.laporan[0].tanggal, a.laporan[0].header.headerId, a.laporan[0].objek], [1, kemarin, hk, []], 'tim lain tidak ikut');
  assert.deepStrictEqual(x.j(x.h.getHartekHarian_(x.sesiH, { tanggal: kemarin })), a.laporan[0], 'bentuk sama dengan harian');
  const ins = { userId: U(), username: '16130.insjar01', role: 'PETUGAS', jenisTim: 'INSPEKSI_JARINGAN', timId: x.timIns, timNama: 'INSPEKSI 01' };
  x.sheets.ij = x.sheets.ij || {};
  assert.strictEqual(kodeError(() => x.h.getArsipInsJar_(ins, { dari: kemarin, sampai: hari })), 'TANGGAL_DI_LUAR_BATAS');
  assert.strictEqual(kodeError(() => x.h.getArsipInsDu_(ins, { dari: kemarin, sampai: kemarin })), 'AKSES_DITOLAK', 'petugas InsJar bukan InsDu');
});

function konteksJadwalPadam() {
  const x = siapkanRow({ propsTambahan: { JADWAL_PADAM_SHEET_ID: 'jp' } });
  const h = x.g;
  const buat = sheetPalsu(x.log);
  x.sheets.jp = { db_jadwal_padam: buat('db_jadwal_padam', [h.JP_HEADER_.db_jadwal_padam.slice()]) };
  x.sheets.m.db_Daerah_Padam = buat('db_Daerah_Padam', [h.JP_MASTER_HEADER_.db_Daerah_Padam.slice(),
    [1, 'Toboali', 'Bangka', 'GI Toboali', 'TB-01', 'Kampung Baru', 12, 840, 'Kampung Baru, Jl. Merdeka', 'RSUD Toboali', 0.8, 42.5, true, 'd1', 1, '', ''],
    [2, 'Toboali', 'Bangka', 'GI Toboali', 'TB-02', 'Rias', 5, 210, 'Rias', '', 0.3, 15, false, 'd2', 1, '', '']]);
  const admin = { userId: U(), username: '16130.admin', role: 'ADMIN', jenisTim: '', timId: '' };
  return { ...x, h, admin, j: (v) => JSON.parse(JSON.stringify(v)) };
}

test('v1.0.17 Jadwal Padam (port v1): khusus admin, kolom dari Master Daerah Padam, durasi lewat tengah malam, ENS, status, hapus, WA rentang tanggal', () => {
  const x = konteksJadwalPadam();
  assert.strictEqual(kodeError(() => x.h.getMasterJadwalPadam_(x.sesi, {})), 'AKSES_DITOLAK', 'petugas ditolak');
  assert.deepStrictEqual(x.j(x.h.getMasterJadwalPadam_(x.admin, {})).daerah.map((d) => [d.penyulang, d.section]), [['TB-01', 'Kampung Baru']], 'hanya master aktif');
  const isi = { penyulang: 'tb-01', section: 'kampung baru', jenis: 'Pemeliharaan JTM', tanggal: '2026-10-25', jamPadam: '22:00', jamNyala: '01:30', statusPekerjaan: 'Padam', lokasi: 'Jl. Merdeka' };
  assert.strictEqual(kodeError(() => x.h.simpanJadwalPadam_(x.admin, { ...isi, section: 'Rias' })), 'SECTION_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.h.simpanJadwalPadam_(x.admin, { ...isi, jamPadam: '9:00' })), 'FORMAT_SALAH');
  assert.strictEqual(kodeError(() => x.h.simpanJadwalPadam_(x.admin, { ...isi, statusPekerjaan: 'Siaga' })), 'PILIHAN_TIDAK_VALID');
  const idb = U();
  const a = x.j(x.h.simpanJadwalPadam_(x.admin, { ...isi, idBaris: idb }));
  assert.deepStrictEqual([a.kode, a.jadwal.penyulang, a.jadwal.section, a.jadwal.hari, a.jadwal.durasi, a.jadwal.jumlahGardu, a.jadwal.jumlahPelanggan,
    a.jadwal.daerah, a.jadwal.bebanA, a.jadwal.ensRupiah, a.jadwal.vip, a.jadwal.status],
  ['JP-16130261025001', 'TB-01', 'Kampung Baru', 'Minggu', 3.5, 12, 840, 'Kampung Baru, Jl. Merdeka', 42.5, Math.ceil(0.8 * 3.5 * 1444.7), 'RSUD Toboali', 'Terjadwal']);
  assert.strictEqual(x.h.simpanJadwalPadam_(x.admin, { ...isi, idBaris: idb }).duplikat, true, 'kirim ulang tidak membuat jadwal kembar');
  const b = x.j(x.h.simpanJadwalPadam_(x.admin, { ...isi, tanggal: '2026-10-26', jamPadam: '08:00', jamNyala: '10:00', statusPekerjaan: 'Tanpa Padam' }));
  const c = x.j(x.h.simpanJadwalPadam_(x.admin, { ...isi, tanggal: '2026-10-27', jamPadam: '09:00', jamNyala: '12:00' }));
  // ubah selama Terjadwal; status Terealisasi / Batal mengunci jadwal
  const u = x.j(x.h.ubahJadwalPadam_(x.admin, { ...isi, jadwalId: a.jadwalId, revision: 1, jamNyala: '23:00' }));
  assert.deepStrictEqual([u.revision, u.jadwal.durasi], [2, 1]);
  assert.strictEqual(kodeError(() => x.h.ubahJadwalPadam_(x.admin, { ...isi, jadwalId: a.jadwalId, revision: 1 })), 'KONFLIK_REVISION');
  const s = x.j(x.h.ubahStatusJadwalPadam_(x.admin, { jadwalId: c.jadwalId, revision: 1, status: 'Batal Pekerjaan' }));
  assert.strictEqual(s.jadwal.status, 'Batal Pemadaman', 'istilah v1 Batal Pekerjaan = Batal Pemadaman');
  assert.strictEqual(kodeError(() => x.h.ubahJadwalPadam_(x.admin, { ...isi, jadwalId: c.jadwalId, revision: s.revision })), 'JADWAL_TERKUNCI');
  assert.strictEqual(kodeError(() => x.h.hapusJadwalPadam_(x.admin, { jadwalId: c.jadwalId, revision: s.revision })), 'JADWAL_TERKUNCI', 'hanya Terjadwal yang bisa dihapus');
  x.h.hapusJadwalPadam_(x.admin, { jadwalId: b.jadwalId, revision: 1 });
  assert.strictEqual(x.h.hapusJadwalPadam_(x.admin, { jadwalId: b.jadwalId, revision: 1 }).duplikat, true);
  const l = x.j(x.h.getJadwalPadam_(x.admin, { dari: '2026-10-01', sampai: '2026-10-31' }));
  assert.deepStrictEqual(l.jadwal.map((j) => [j.tanggal, j.status]), [['2026-10-25', 'Terjadwal'], ['2026-10-27', 'Batal Pemadaman']], 'jadwal dihapus tidak tampil');
  assert.deepStrictEqual([l.ringkas.terjadwal, l.ringkas.batal, l.ringkas.padam, l.ringkas.pelanggan], [1, 1, 1, 840]);
  assert.strictEqual(kodeError(() => x.h.getJadwalPadam_(x.admin, { dari: '2026-01-01', sampai: '2027-06-01' })), 'RENTANG_TERLALU_PANJANG');
  // WA rentang tanggal: hanya Padam & tidak batal, format v1
  const wa = x.j(x.h.getWaJadwalPadam_(x.admin, { dari: '2026-10-25', sampai: '2026-10-31' }));
  assert.strictEqual(wa.jumlah, 1);
  assert.strictEqual(wa.teks, ['*RENCANA PADAM PEKERJAAN PEMELIHARAAN PENYULANG ULP TOBOALI*', '*Periode:* 25 Oktober 2026 s.d. 31 Oktober 2026', '',
    '*1. Hari/Tanggal:* Minggu, 25 Oktober 2026', '*ULP:* Toboali', '*Penyulang:* TB-01', '*Section Pemadaman:* Kampung Baru',
    '*Jenis Pekerjaan:* Pemeliharaan JTM', '*Jam Padam:* 22:00 WIB', '*Jam Nyala:* 23:00 WIB', '*Durasi:* 60 Menit',
    '*Daerah Padam:* Kampung Baru, Jl. Merdeka', '*Jumlah Gardu:* 12 Unit', '*Jumlah Pelanggan:* 840 Pelanggan', '*Beban:* 42,50 A',
    '*ENS:* Rp1.156'].join('\n'), 'v1.0.18: ENS rupiah bulat ke atas tanpa koma (0,8 x 1 x 1444,7 = 1155,76)');
  assert.strictEqual(kodeError(() => x.h.getWaJadwalPadam_(x.admin, { dari: '2026-11-01', sampai: '2026-11-30' })), 'JADWAL_PADAM_KOSONG');
  assert.strictEqual(x.h.angkaIdJp_(1234567.891, 2), '1.234.567,89');
  assert.deepStrictEqual(x.j(x.h.jadwalPadamBulan_('2026-10')).map((j) => j.kode), [a.kode], 'kalender tim: tanpa batal');
  assert.ok(x.sheets.a.log_Audit.data.some((r) => r.includes('JADWAL_PADAM_SIMPAN')));
});

test('v1.0.18 ENS Jadwal Padam: rupiah bulat dibulatkan ke atas, teks lama terbaca, kolom lama dirapikan, migrasi', () => {
  const x = konteksJadwalPadam();
  const e = x.h.ensRupiahJp_;
  assert.deepStrictEqual([e(4045.16), e(1444), e(1444.0000000002), e('Rp 1.234.567,89'), e('4045,16'), e('1.445'), e('1,445'), e('Rp4.045'), e(''), e('abc'), e(null)],
    [4046, 1444, 1444, 1234568, 4046, 1445, 1445, 4045, null, null, null]);
  assert.strictEqual(x.h.hitungEnsJp_(0.8, 3.5), 4046, '0,8 x 3,5 x 1444,7 = 4045,16 -> 4046');
  const a = x.j(x.h.simpanJadwalPadam_(x.admin, { penyulang: 'TB-01', section: 'Kampung Baru', jenis: 'Har', tanggal: '2026-10-25', jamPadam: '22:00', jamNyala: '01:30', statusPekerjaan: 'Padam' }));
  const H = x.h.JP_HEADER_.db_jadwal_padam;
  const t = x.sheets.jp.db_jadwal_padam;
  assert.strictEqual(t.data[1][H.indexOf('ens_rupiah')], 4046, 'tersimpan bulat');
  t.data[1][H.indexOf('ens_rupiah')] = 'Rp 4.045,16';
  assert.strictEqual(x.j(x.h.getJadwalPadam_(x.admin, { dari: '2026-10-01', sampai: '2026-10-31' })).jadwal[0].ensRupiah, 4046, 'teks lama terbaca');
  assert.strictEqual(x.h.rapikanEnsJp_(), 1);
  assert.strictEqual(t.data[1][H.indexOf('ens_rupiah')], 4046, 'kolom lama dirapikan');
  assert.strictEqual(x.h.rapikanEnsJp_(), 0, 'idempoten');
  assert.ok(a.kode);
  const m = JSON.parse(JSON.stringify(x.h.analisisMigrasiJadwalPadam_([
    { 'Kode Jadwal Padam': 'JP-A', Penyulang: 'TB-01', Section: 'Kampung Baru', Tanggal: '2026-10-25', 'Jam Padam': '08:00', 'Jam Nyala': '10:00', ENS: 'Rp 2.311,52' },
    { 'Kode Jadwal Padam': 'JP-B', Penyulang: 'TB-01', Section: 'Kampung Baru', Tanggal: '2026-10-25', 'Jam Padam': '08:00', 'Jam Nyala': '10:00' },
  ], [{ Penyulang: 'TB-01', Section: 'Kampung Baru', 'Beban MW': '0,8' }])));
  assert.deepStrictEqual(m.rencana.db_jadwal_padam.map((j) => j.ens_rupiah), [2312, 2312], 'teks v1 dibaca; kosong = dihitung dari beban x durasi');
});

test('v1.0.17 kalender tim: pekerjaan tim sendiri + WO diterima / selesai + jadwal padam per hari; v1.0.18 admin = jadwal padam saja; bulan wajib yyyy-MM', () => {
  const x = konteksWo();
  const buat = sheetPalsu(x.log);
  x.g.PropertiesService.getScriptProperties().setProperty('JADWAL_PADAM_SHEET_ID', 'jp');
  x.sheets.jp = { db_jadwal_padam: buat('db_jadwal_padam', [x.h.JP_HEADER_.db_jadwal_padam.slice()]) };
  x.sheets.m.db_Daerah_Padam = buat('db_Daerah_Padam', [x.h.JP_MASTER_HEADER_.db_Daerah_Padam.slice(),
    [1, 'Toboali', '', '', 'TB-01', 'Kampung Baru', 3, 120, 'Kampung Baru', '', 0.5, 20, true, 'd1', 1, '', '']]);
  const bulan = x.hariIni.slice(0, 7);
  assert.strictEqual(kodeError(() => x.h.getKalenderTim_(null, { bulan })), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.h.getKalenderTim_(x.sesiH, { bulan: '2026-13' })), 'FORMAT_SALAH');
  const admin = { ...x.admin };
  x.h.simpanJadwalPadam_(admin, { penyulang: 'TB-01', section: 'Kampung Baru', jenis: 'Pemeliharaan', tanggal: x.hariIni, jamPadam: '09:00', jamNyala: '11:00', statusPekerjaan: 'Padam' });
  const id = x.temuan();
  const rev = x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.timH, revision: 1 }).revision;
  x.h.mulaiWo_(x.sesiH, { temuanId: id, revision: rev }, 'MOBILE');
  x.h.buatHeaderHartek_(x.sesiH, {});
  const k = x.j(x.h.getKalenderTim_(x.sesiH, { bulan }));
  assert.strictEqual(k.jenisTim, 'HARTEK');
  assert.deepStrictEqual(k.kegiatan.map((e) => [e.tanggal, e.jenis]).sort(), [[x.hariIni, 'PADAM'], [x.hariIni, 'PEKERJAAN'], [x.hariIni, 'WO']].sort());
  assert.ok(k.kegiatan.find((e) => e.jenis === 'PADAM').rincian.startsWith('09:00 – 11:00 WIB'));
  // v1.0.21: rincian terstruktur untuk kartu pemadaman Beranda
  const pd = k.kegiatan.find((e) => e.jenis === 'PADAM').padam;
  assert.deepStrictEqual([pd.penyulang, pd.section, pd.jamPadam, pd.jamNyala, pd.pekerjaan, pd.statusPekerjaan],
    ['TB-01', 'Kampung Baru', '09:00', '11:00', 'Pemeliharaan', 'Padam']);
  // tim ROW tidak melihat WO tim Hartek, tetap melihat jadwal padam
  const r = x.j(x.h.getKalenderTim_(x.sesi, { bulan }));
  assert.deepStrictEqual(r.kegiatan.map((e) => e.jenis), ['PADAM']);
  // v1.0.18: Beranda admin = jadwal padam saja (tanpa pekerjaan / WO tim mana pun)
  const a = x.j(x.h.getKalenderTim_(x.admin, { bulan }));
  assert.deepStrictEqual([a.timSendiri, a.kegiatan.map((e) => e.jenis)], [false, ['PADAM']]);
});

test('v1.0.17 riwayat gardu (admin Pengukuran Gardu): temuan + perbaikan WO, BA / manajemen trafo, sumber kosong dilewati; master gardu HP + arus / tegangan', () => {
  const x = konteksWo();
  const buat = sheetPalsu(x.log);
  assert.strictEqual(kodeError(() => x.h.getRiwayatGardu_(x.sesiH, { garduId: 'gar-1' })), 'AKSES_DITOLAK');
  const id = x.temuan({ objek_inspeksi: 'Gardu', no_gardu: 'TB0001', gardu_id: 'gar-1', jenis_temuan: 'Trafo bocor' });
  x.temuan({ objek_inspeksi: 'Gardu', no_gardu: 'TB0002', gardu_id: 'gar-2' });
  x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.timH, catatan: 'segera', revision: 1 });
  const H = x.h.REKAP_BA_HEADER_;
  const ba = H.map(() => '');
  ba[H.indexOf('ba_id')] = 'ba-1'; ba[H.indexOf('gardu_id')] = 'gar-1'; ba[H.indexOf('No BA Full')] = '001/BA/2026';
  ba[H.indexOf('Jenis Pekerjaan')] = 'Penggantian Trafo'; ba[H.indexOf('Tanggal BA')] = '2026-10-01'; ba[H.indexOf('Merk')] = 'Trafindo';
  ba[H.indexOf('Kapasitas (kVA)')] = 100; ba[H.indexOf('Merk Sesudah')] = 'Sintra'; ba[H.indexOf('Kapasitas Sesudah (kVA)')] = 160; ba[H.indexOf('Status BA')] = 'SELESAI';
  x.sheets.g.Rekap_BA = buat('Rekap_BA', [H.slice(), ba]);
  const r = x.j(x.h.getRiwayatGardu_(x.admin, { garduId: 'gar-1', noGardu: 'tb0001' }));
  assert.deepStrictEqual([r.pengukuran, r.temuan.map((t) => [t.jenisTemuan, t.statusWo, t.timTindakLanjut])], [[], [['Trafo bocor', 'TERKIRIM', 'HARTEK 01']]]);
  assert.deepStrictEqual([r.ba.length, r.ba[0].jenisPekerjaan, r.ba[0].trafo.kva, r.ba[0].trafoSesudah.merk, r.ba[0].trafoSesudah.kva], [1, 'Penggantian Trafo', 100, 'Sintra', 160]);
  // master gardu HP: arus per fasa + tegangan pengukuran terakhir
  const G = x.h.DB_GARDU_HEADER_;
  const g = G.map(() => '');
  g[G.indexOf('gardu_id')] = 'gar-9'; g[G.indexOf('No Gardu')] = 'TB0009'; g[G.indexOf('Status Gardu')] = 'AKTIF'; g[G.indexOf('Kapasitas (kVA)')] = 100;
  g[G.indexOf('Beban R (A)')] = 80; g[G.indexOf('Beban N (A)')] = 12; g[G.indexOf('Tegangan R-N (V)')] = 228; g[G.indexOf('Sumber Data')] = 'Inspeksi Gardu';
  const hp = x.j(x.h.barisGarduHp_(Object.fromEntries(G.map((k, i) => [k, g[i]]))));
  assert.deepStrictEqual([hp.ukur.bebanR, hp.ukur.bebanS, hp.ukur.bebanN, hp.ukur.teganganRN, hp.sumberUkur], [80, null, 12, 228, 'Inspeksi Gardu']);
});

test('v1.0.17 migrasi inspeksi v1: header IJR / IGD, realisasi, temuan (PEG = admin, Selesai = WO SELESAI), karantina tim / induk, idempoten + rollback', () => {
  const x = konteksWo();
  const h = x.h;
  x.sheets.m.db_Tim.data.push([x.timIns, 'INSPEKSI_JARINGAN', 'Inspeksi Jaringan 01', '01', true], ['tig-1', 'INSPEKSI_GARDU', 'Inspeksi Gardu 01', '01', true]);
  const baris = (n, isi) => { const b = Array(n).fill(''); for (const [k, v] of Object.entries(isi)) b[k] = v; return b; };
  const H = h.MIGINS_KOL_.header, R = h.MIGINS_KOL_.realisasi, D = h.MIGINS_KOL_.insdu, T = h.MIGINS_KOL_.temuan;
  const S = {
    header: [
      baris(17, { [H.kodeHeader]: 'IJR-16130261001001', [H.ulp]: 'Toboali', [H.tanggal]: '2026-10-01', [H.subTim]: 'Inspeksi Jaringan 01', [H.kmAwal]: '12', [H.timestamp]: '01/10/2026 08:00:00' }),
      baris(17, { [H.kodeHeader]: 'IGD-16130261002001', [H.tanggal]: '2026-10-02', [H.subTim]: 'Inspeksi Gardu 01' }),
      baris(17, { [H.kodeHeader]: 'R01-16130261002001', [H.subTim]: 'ROW 01' }),
      baris(17, { [H.kodeHeader]: 'IJR-16130261003001', [H.subTim]: 'Tim Asing' }),
    ],
    realisasi: [
      baris(13, { [R.kodeHeader]: 'IJR-16130261001001', [R.kodePekerjaanPeny]: 'IJR-16130261001001-PNY.001', [R.penyulang]: 'TB-01', [R.section]: 'Kampung Baru', [R.tier]: 'Tier 1', [R.totalTiang]: 40, [R.segmen]: 'A' }),
      baris(13, { [R.kodeHeader]: 'IJR-16130261003001', [R.kodePekerjaanPeny]: 'IJR-16130261003001-PNY.001' }),
    ],
    insdu: [baris(12, { [D.kodeHeader]: 'IGD-16130261002001', [D.kodePekerjaanGardu]: 'IGD-16130261002001-GDU.001', [D.nomorGardu]: 'tb0001', [D.tier]: 'Tier 1' })],
    temuan: [
      baris(43, { [T.kodeHeader]: 'IJR-16130261001001', [T.kodePekerjaanPeny]: 'IJR-16130261001001-PNY.001', [T.kodePekerjaan]: 'IJR-16130261001001-PNY.001-TJR.001',
        [T.tanggal]: '2026-10-01', [T.penyulang]: 'TB-01', [T.temuan]: 'pohon dekat jaringan', [T.status]: 'Selesai', [T.timEksekusi]: 'ROW 01',
        [T.jenisPekerjaan]: 'Tebang Sedang', [T.diameter]: '30', [T.koordinat]: '-3.000000, 106.500000',
        [T.fotoTemuanUrl]: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view' }),
      baris(43, { [T.kodeHeader]: 'PEG-16130261005001', [T.kodePekerjaanPeny]: 'PEG-16130261005001-PNY.001', [T.kodePekerjaan]: 'PEG-16130261005001-PNY.001-TJR.001',
        [T.tanggal]: '2026-10-05', [T.temuan]: 'Isolator retak', [T.status]: 'Penugasan Tim', [T.timEksekusi]: 'HARTEK 01' }),
      baris(43, { [T.kodeHeader]: 'IJR-X', [T.kodePekerjaanPeny]: 'IJR-X-PNY.009', [T.kodePekerjaan]: 'IJR-X-PNY.009-TJR.001' }),
    ],
  };
  const M = { tim: x.sheets.m.db_Tim.data.slice(1).map((r) => ({ tim_id: r[0], jenis: r[1], nama: r[2], kode: r[3], aktif: r[4] })),
    jenisTemuan: [{ jenis_temuan: 'Pohon Dekat Jaringan', jenis_temuan_id: 'jt-1' }], gardu: [{ 'No Gardu': 'TB0001', gardu_id: 'gar-1', Penyulang: 'TB-01', Section: 'Kampung Baru' }] };
  const a = x.j(h.analisisMigrasiInspeksi_(S, M));
  assert.deepStrictEqual([a.hitung.insjar_header, a.hitung.db_insdu_header, a.hitung.insjar_realisasi, a.hitung.db_insdu_realisasi, a.hitung.db_temuan_inspeksi, a.hitung.karantina],
    [1, 1, 1, 1, 2, 3], 'header ROW diabaikan; tim asing + induk hilang = karantina');
  const t1 = a.rencana.db_temuan_inspeksi[0], t2 = a.rencana.db_temuan_inspeksi[1];
  assert.deepStrictEqual([t1.jenis_temuan, t1.jenis_temuan_id, t1.status, t1.status_wo, t1.tindak_lanjut, t1.tim_tindak_lanjut_id, t1.foto_temuan_file_id, t1.tim_id, t1.dibuat_oleh],
    ['Pohon Dekat Jaringan', 'jt-1', 'Selesai', 'SELESAI', 'Tebang Sedang Ø 30 cm', x.sesi.timId, '1AbCdEfGhIjKlMnOpQrStUvWxYz012345', x.timIns, 'MIGRASI']);
  assert.deepStrictEqual([t2.sumber, t2.header_id, t2.status, t2.status_wo], ['ADMIN', '', 'Penugasan Tim', ''], 'PEG = admin, WO v1 belum selesai = tanpa WO');
  assert.ok(a.catatan.some((c) => c.status === 'PERINGATAN' && /teruskan ulang/.test(c.alasan)));
  assert.strictEqual(a.rencana.db_insdu_realisasi[0].gardu_id, 'gar-1');
  assert.strictEqual(x.h.uuidMig_('temuan', 'IJR-16130261001001-PNY.001-TJR.001'), t1.temuan_id, 'ID deterministik');
  // tulis idempoten + rollback (tabel temuan v2)
  const n0 = x.sheets.t.db_temuan_inspeksi.data.length;
  assert.strictEqual(h.tulisRencanaMigIns_(h.tabelInsJar_('db_temuan_inspeksi'), a.rencana.db_temuan_inspeksi, 'temuan_id', 'kode_temuan', 'dibuat_oleh', Date.now()).ditulis, 2);
  assert.strictEqual(h.tulisRencanaMigIns_(h.tabelInsJar_('db_temuan_inspeksi'), a.rencana.db_temuan_inspeksi, 'temuan_id', 'kode_temuan', 'dibuat_oleh', Date.now()).ditulis, 0, 'dijalankan ulang = tidak dobel');
  assert.strictEqual(x.sheets.t.db_temuan_inspeksi.data.length, n0 + 2);
  const idv2 = x.temuan();   // data app v2 asli
  assert.strictEqual(h.hapusBarisMigIns_(h.tabelInsJar_('db_temuan_inspeksi'), 'dibuat_oleh'), 2);
  assert.ok(x.sheets.t.db_temuan_inspeksi.data.some((r) => r.includes(idv2)), 'baris app v2 tetap ada');
});

test('v1.0.17 migrasi Jadwal Padam v1: judul kolom v1, tanggal teks Indonesia, jam titik / titik dua, Batal Pekerjaan = Batal Pemadaman, master daerah', () => {
  const x = konteksJadwalPadam();
  const h = x.h;
  const master = [
    { 'Beban MW': '0,8', 'Arus (A)': 42.5, ULP: 'Toboali', UP3: 'Bangka', GI: 'GI Toboali', Penyulang: 'TB-01', Section: 'Kampung Baru', 'Jumlah Gardu': 12, 'Jumlah Pelanggan': 840, 'Daerah Section': 'Kampung Baru', 'Pelanggan VIP': 'RSUD' },
    { Penyulang: 'TB-01', Section: 'kampung  baru' },
  ];
  const rekap = [
    { 'Kode Jadwal Padam': 'JP-20261001-080000', ULP: 'Toboali', Penyulang: 'TB-01', Section: 'Kampung Baru', 'Jenis Pekejaan': 'Pemeliharaan', Tanggal: '25 oktober 2026',
      'Jam Padam': '22.00', 'Jam Nyala': '01:30', 'Jumlah Gardu': 12, 'Jumlah Pelanggan': 840, ENS: 4045.16, 'Status Jadwal Padam': 'Batal Pekerjaan' },
    { 'Kode Jadwal Padam': 'JP-2', Penyulang: 'TB-09', Section: 'X', Tanggal: '2026-10-26', 'Jam Padam': '08:00', 'Jam Nyala': '09:00' },
    { 'Kode Jadwal Padam': 'JP-3', Penyulang: '', Tanggal: '' },
  ];
  const a = JSON.parse(JSON.stringify(h.analisisMigrasiJadwalPadam_(rekap, master)));
  assert.deepStrictEqual([a.hitung.daerah, a.hitung.jadwal, a.hitung.karantina], [1, 2, 1]);
  const j = a.rencana.db_jadwal_padam[0];
  assert.deepStrictEqual([j.tanggal, j.hari, j.jam_padam, j.jam_nyala, j.durasi, j.jenis_pekerjaan, j.status_jadwal, j.status_pekerjaan, j.beban_mw, j.dibuat_oleh],
    ['2026-10-25', 'Minggu', '22:00', '01:30', 3.5, 'Pemeliharaan', 'Batal Pemadaman', 'Padam', 0.8, 'MIGRASI']);
  assert.ok(a.catatan.some((c) => c.kode_lama === 'JP-2' && c.status === 'PERINGATAN'));
  assert.strictEqual(a.rencana.db_Daerah_Padam[0].daerah_id, h.uuidMig_('daerah_padam', 'tb - 01|kampung baru'));
  // tulis ke v2 lalu tampil di daftar admin
  h.tulisRencanaMigIns_(h.tabel_('MASTER_SHEET_ID', 'db_Daerah_Padam'), a.rencana.db_Daerah_Padam, 'daerah_id', '', 'diubah_oleh', Date.now());
  h.tulisRencanaMigIns_(h.tabelJp_(), a.rencana.db_jadwal_padam, 'jadwal_id', 'kode_jadwal', 'dibuat_oleh', Date.now());
  const l = JSON.parse(JSON.stringify(h.getJadwalPadam_(x.admin, { dari: '2026-10-01', sampai: '2026-10-31' })));
  assert.deepStrictEqual(l.jadwal.map((z) => [z.kode, z.status]), [['JP-20261001-080000', 'Batal Pemadaman'], ['JP-2', 'Terjadwal']]);
});

// ---------- v1.0.18 ----------

test('v1.0.18 foto temuan migrasi: link AppSheet / Drive dicari, DIPINDAH ke db_Temuan_Inspeksi, nama pola ROW, link Drive ditulis, bisa diulang', () => {
  const x = konteksInsJar();
  const dr = driveTiruan();
  x.h.DriveApp = dr.DriveApp;
  x.h.Utilities.newBlob = (bytes, mime, nama) => ({ bytes, mime, nama });
  const props = { INSJAR_FOTO_FOLDER_ID: 'akarIns', MIG_FOTO_AKAR_ID: 'akarAs' };
  const sp = x.h.PropertiesService.getScriptProperties();
  for (const [k, v] of Object.entries(props)) sp.setProperty(k, v);
  x.h.Session = { getActiveUser: () => ({ getEmail: () => x.h.cfg_().ADMIN_EMAIL }) };
  x.h.cfg_ = ((asli) => () => ({ ...asli(), INSJAR_FOTO_FOLDER_ID: 'akarIns' }))(x.h.cfg_);
  const laporan = {};
  x.h.tulisSheetMig_ = (ss, nama, kepala, baris) => { laporan[nama] = baris; };
  // file AppSheet: AppSheet SiSi - ULP Toboali/Temuan Inspeksi/2026/07. Juli/01/<kode>/<kode>.Foto Temuan.115650.jpg
  dr.DriveApp.getFolderById('akarAs');
  const akar = dr.folders.akarAs; akar.nama = 'AppSheet SiSi - ULP Toboali';
  let f = dr.DriveApp.getFolderById('akarAs');
  for (const nm of ['Temuan Inspeksi', '2026', '07. Juli', '01', 'IJR-16130260701001-PNY.001-TJR.003']) f = f.createFolder(nm);
  const fAs = f.createFile({ bytes: [1], mime: 'image/jpeg', nama: 'IJR-16130260701001-PNY.001-TJR.003.Foto Temuan.115650.jpg' });
  const lain = dr.DriveApp.getFolderById('v1Drive').createFile({ bytes: [2], mime: 'image/jpeg', nama: 'acak-123.jpg' });
  const idPanjang = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123';   // id Drive asli >= 20 karakter
  dr.semuaFile[idPanjang] = lain;
  const ambilFolder = dr.DriveApp.getFolderById;
  dr.DriveApp.getFolderById = (id) => ({ ...ambilFolder(id), getName: () => dr.folders[id].nama });
  const urlAs = 'https://www.appsheet.com/image/getimageurl?appName=SiSi-22191477&tableName=db_Ins_Temuan&fileName=AppSheet%20SiSi%20-%20ULP%20Toboali%2FTemuan%20Inspeksi%2F2026%2F07.%20Juli%2F01%2FIJR-16130260701001-PNY.001-TJR.003%2FIJR-16130260701001-PNY.001-TJR.003.Foto%20Temuan.115650.jpg&appVersion=1.001009&signature=3a32';
  const T = x.h.TEMUAN_HEADER_.db_temuan_inspeksi;
  const baris = (o) => T.map((k) => (o[k] ?? ''));
  x.sheets.t.db_temuan_inspeksi.data.push(
    baris({ temuan_id: U(), kode_temuan: 'IJR-16130260701001-PNY.001-TJR.003', foto_temuan_link: urlAs, foto_tiang_link: 'https://drive.google.com/file/d/' + idPanjang + '/view', dibuat_oleh: 'MIGRASI', revision: 1 }),
    baris({ temuan_id: U(), kode_temuan: 'IJR-X-TJR.009', foto_temuan_link: urlAs.replace('TJR.003.Foto', 'TJR.009.Foto'), dibuat_oleh: 'MIGRASI', revision: 1 }),
    baris({ temuan_id: U(), kode_temuan: 'APP-V2', foto_temuan_link: 'https://drive.google.com/file/d/' + lain.getId() + '/view', dibuat_oleh: 'u-ins', revision: 1 }));
  const diam = () => { const a = { l: console.log, w: console.warn }; console.log = () => {}; console.warn = () => {}; return () => { console.log = a.l; console.warn = a.w; }; };
  let pulih = diam();
  let h;
  try { h = x.h.ADMIN_migrasiInspeksiFoto(); } finally { pulih(); }
  assert.deepStrictEqual([h.dipindah, h.sudah, h.gagal, h.terpotong], [2, 0, 1, false], 'foto ke-3 (TJR.009) tidak ada di Drive = gagal; baris app v2 tidak disentuh');
  const tujuan = Object.values(dr.folders).find((z) => z.nama === 'db_Temuan_Inspeksi');
  assert.ok(tujuan, 'folder db_Temuan_Inspeksi dibuat');
  assert.deepStrictEqual(Object.keys(tujuan.file).sort(), ['IJR-16130260701001-PNY.001-TJR.003_TEMUAN.jpg', 'IJR-16130260701001-PNY.001-TJR.003_TIANG.jpg']);
  assert.strictEqual(fAs.pindah, 1, 'dipindah, bukan disalin');
  const r = x.sheets.t.db_temuan_inspeksi.data[1];
  assert.deepStrictEqual([r[T.indexOf('foto_temuan_file_id')], r[T.indexOf('foto_temuan_link')]], [fAs.getId(), 'https://drive.google.com/file/d/' + fAs.getId() + '/view']);
  assert.strictEqual(x.sheets.t.db_temuan_inspeksi.data[3][T.indexOf('foto_temuan_file_id')], '', 'baris app v2 tidak diubah');
  assert.ok(laporan.migins_Foto.some((b) => b[0] === 'IJR-X-TJR.009' && b[2] === 'GAGAL'));
  // jalan ulang: sudah di folder = SUDAH, tidak dipindah lagi
  pulih = diam();
  try { h = x.h.ADMIN_migrasiInspeksiFoto(); } finally { pulih(); }
  assert.deepStrictEqual([h.dipindah, h.sudah], [0, 2]);
  assert.strictEqual(fAs.pindah, 1);
});

test('v1.0.18 nama foto lapangan: pola ROW <kode>_<SLOT>.jpg, kode temuan kosong bukan UUID, ADMIN_rapikanNamaFotoLapangan mengganti nama acak', () => {
  const x = konteksInsJar();
  assert.strictEqual(x.h.kodeFotoTemuan_({ kode_temuan: 'IJR-1-PNY.001-TJR.002' }), 'IJR-1-PNY.001-TJR.002');
  assert.strictEqual(x.h.kodeFotoTemuan_({ kode_temuan: '', kode_realisasi: 'IJR-1-PNY.001' }), 'IJR-1-PNY.001-TEMUAN');
  assert.strictEqual(x.h.namaFotoRow_('IJR-1-PNY.001-TJR.002', 'TIANG', 1), 'IJR-1-PNY.001-TJR.002_TIANG.jpg');
  const dr = driveTiruan();
  x.h.DriveApp = dr.DriveApp;
  const fd = dr.DriveApp.getFolderById('fotoIns');
  const acak = fd.createFile({ bytes: [1], nama: '3f2a9c1e-7b1d-4c55-9e0a-7d4b2c1e0f99-TEMUAN.jpg' });
  const benar = fd.createFile({ bytes: [1], nama: 'IJR-2-TJR.001_TIANG.jpg' });
  const T = x.h.TEMUAN_HEADER_.db_temuan_inspeksi;
  x.sheets.t.db_temuan_inspeksi.data.push(T.map((k) => ({ temuan_id: U(), kode_temuan: 'IJR-2-TJR.001', foto_temuan_file_id: acak.getId(), foto_tiang_file_id: benar.getId(), revision: 1 }[k] ?? '')));
  const a = { l: console.log, w: console.warn }; console.log = () => {}; console.warn = () => {};
  let cek, jalan;
  try { cek = JSON.parse(JSON.stringify(x.h.jalankanRapikanNamaFoto_(true))); jalan = JSON.parse(JSON.stringify(x.h.jalankanRapikanNamaFoto_(false))); } finally { console.log = a.l; console.warn = a.w; }
  assert.deepStrictEqual(cek.db_temuan_inspeksi, { diganti: 1, sudah: 1, gagal: 0 });
  assert.strictEqual(acak.getName(), 'IJR-2-TJR.001_TEMUAN.jpg');
  assert.deepStrictEqual(jalan.db_temuan_inspeksi, { diganti: 1, sudah: 1, gagal: 0 });
});

test('v1.0.18 Pindah Tim TO: hanya WO TERKIRIM, daftar = terkirim saja; Penerusan WO tidak memindah WO terkirim', () => {
  const x = konteksWo();
  const id = x.temuan();
  assert.strictEqual(kodeError(() => x.h.pindahWo_(x.admin, { temuanId: id, timId: x.timH, revision: 1 })), 'WO_BELUM_DITERUSKAN', 'belum diteruskan = pakai Penerusan WO');
  assert.strictEqual(kodeError(() => x.h.pindahWo_(x.sesi, { temuanId: id, timId: x.timH, revision: 1 })), 'AKSES_DITOLAK');
  const r1 = x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.sesi.timId, revision: 1 }).revision;
  assert.strictEqual(x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.sesi.timId, revision: 1 }).duplikat, true, 'kiriman ulang antrean tetap berhasil');
  assert.strictEqual(kodeError(() => x.h.teruskanWo_(x.admin, { temuanId: id, timId: x.timH, revision: r1 })), 'WO_PINDAH_DI_MENU_PINDAH');
  const daftar = JSON.parse(JSON.stringify(x.h.getWoPindah_(x.admin, { status: 'BARU' })));
  assert.deepStrictEqual(daftar.temuan.map((t) => t.wo.status), ['TERKIRIM'], 'status dipaksa TERKIRIM');
  const p = x.h.pindahWo_(x.admin, { temuanId: id, timId: x.timH, revision: r1 });
  assert.deepStrictEqual([p.pindah, x.kt(id, 'tim_tindak_lanjut_id')], [true, x.timH]);
  const m = x.h.mulaiWo_(x.sesiH, { temuanId: id, revision: p.revision }, 'MOBILE');
  assert.strictEqual(kodeError(() => x.h.pindahWo_(x.admin, { temuanId: id, timId: x.sesi.timId, revision: m.revision })), 'WO_SUDAH_DIMULAI');
});

// ---------- v1.0.19 ----------

function konteksLonceng() {
  const x = konteksWo();
  const buat = sheetPalsu(x.log);
  x.sheets.m.db_Menu = buat('db_Menu', [['menu_kode', 'nama', 'platform', 'khusus_super', 'urutan', 'aktif'],
    ['OPS_INPUT_TEMUAN', 'Temuan', 'MOBILE', false, 1, true], ['OPS_WO_TIM', 'WO', 'MOBILE', false, 2, true], ['OPS_PENERUSAN_WO', 'P', 'MOBILE', false, 3, true]]);
  x.sheets.m.db_Akses = buat('db_Akses', [['role', 'jenis_tim', 'menu_kode', 'aksi'], ['ADMIN', '*', '*', 'UBAH'], ['PETUGAS', 'ROW', 'OPS_WO_TIM', 'UBAH'], ['PETUGAS', 'HARTEK', 'OPS_WO_TIM', 'UBAH']]);
  x.h.CacheService.getScriptCache().remove('akses:v1');
  return x;
}

test('v1.0.19 lonceng: admin = temuan inspeksi baru (bukan input admin), tim = WO terkirim ke timnya; dilihat per item per akun; kirim ulang = item baru', () => {
  const x = konteksLonceng();
  const t1 = x.temuan();
  x.temuan({ sumber: 'ADMIN' });
  let a = x.j(x.h.getNotifikasi_(x.admin));
  assert.deepStrictEqual([a.belum, a.item.map((i) => [i.jenis, i.dilihat])], [1, [['TEMUAN', false]]], 'temuan input admin sendiri tidak dihitung');
  assert.strictEqual(a.item[0].tujuan.temuanId, t1);
  assert.deepStrictEqual(x.j(x.h.getNotifikasi_(x.sesi)).item, [], 'tim belum punya WO');
  const r1 = x.h.teruskanWo_(x.admin, { temuanId: t1, timId: x.sesi.timId, revision: 1 }).revision;
  let t = x.j(x.h.getNotifikasi_(x.sesi));
  assert.deepStrictEqual([t.belum, t.item[0].jenis], [1, 'WO']);
  assert.strictEqual(x.j(x.h.getNotifikasi_(x.sesiH)).belum, 0, 'tim lain tidak melihat');
  const tanda = x.h.tandaiNotifikasi_(x.sesi, { kunci: t.item[0].kunci + '|kunci-asing' });
  assert.deepStrictEqual([tanda.ditandai, tanda.belum], [1, 0], 'kunci di luar daftar akun diabaikan');
  assert.strictEqual(x.h.tandaiNotifikasi_(x.sesi, { kunci: t.item[0].kunci }).ditandai, 0, 'idempoten');
  t = x.j(x.h.getNotifikasi_(x.sesi));
  assert.deepStrictEqual([t.belum, t.item[0].dilihat], [0, true]);
  assert.strictEqual(x.j(x.h.getNotifikasi_(x.admin)).belum, 1, 'dilihat per akun, admin belum');
  // dipindah ke Hartek lalu ke ROW lagi = kiriman baru, muncul lagi
  const r2 = x.h.pindahWo_(x.admin, { temuanId: t1, timId: x.timH, revision: r1 }).revision;
  assert.strictEqual(x.j(x.h.getNotifikasi_(x.sesiH)).belum, 1);
  x.h.pindahWo_(x.admin, { temuanId: t1, timId: x.sesi.timId, revision: r2 });
  assert.strictEqual(x.j(x.h.getNotifikasi_(x.sesi)).belum, 1, 'kiriman ulang = item baru');
  assert.deepStrictEqual(x.h.tandaiNotifikasi_(x.admin, { semua: true }).belum, 0);
  assert.ok(x.sheets.a.log_Notif_Dilihat, 'tab dibuat otomatis');
});

test('v1.0.19 update APK: versi tertinggi di folder, hanya bila lebih baru dari app, file dibuka link, link unduh langsung', () => {
  const x = konteksWo();
  const sp = x.h.PropertiesService.getScriptProperties();
  assert.deepStrictEqual(x.j(x.h.getUpdateApp_(x.sesi, { versiApp: '1.0.18' })), { tersedia: false }, 'folder belum diatur');
  sp.setProperty('APK_FOLDER_ID', 'apk');
  const f = x.dr.DriveApp.getFolderById('apk');
  for (const n of ['SiSi-STG-1.0.18.apk', 'SiSi-STG-1.0.19+193.apk', 'catatan-1.0.99.txt', 'SiSi-STG-1.0.9.apk']) f.createFile({ bytes: [1], nama: n });
  x.dr.semuaFile.file3 && (x.dr.semuaFile.file3.setSharing = function (a) { this.akses = a; });
  for (const o of Object.values(x.dr.semuaFile)) { o.getSize = () => 123; o.setSharing = (a) => { o.akses = a; }; }
  x.h.Drive = { Files: { get: () => ({ size: '75000000', sha256Checksum: 'ABC' }) } };
  x.h.CacheService.getScriptCache().remove('apk:terbaru:v1');
  const u = x.j(x.h.getUpdateApp_(x.sesi, { versiApp: '1.0.18' }));
  assert.deepStrictEqual([u.tersedia, u.apk.versi, u.apk.nama, u.apk.ukuranByte, u.apk.sha256], [true, '1.0.19', 'SiSi-STG-1.0.19+193.apk', 75000000, 'abc']);
  assert.match(u.apk.url, /^https:\/\/drive\.usercontent\.google\.com\/download\?id=.+&export=download&confirm=t$/);
  assert.strictEqual(x.dr.semuaFile[u.apk.fileId].akses, 'ANYONE_WITH_LINK');
  assert.deepStrictEqual(x.j(x.h.getUpdateApp_(x.sesi, { versiApp: '1.0.19' })), { tersedia: false, versi: '1.0.19' });
  assert.strictEqual(kodeError(() => x.h.getUpdateApp_(null, {})), 'AKSES_DITOLAK');
  assert.strictEqual(x.h.versiNamaApk_('SiSi.apk'), null);
});

test('v1.0.19 foto temuan: admin semua temuan, petugas InsJar hanya temuan timnya, tanpa foto = FOTO_TIDAK_ADA', () => {
  const x = konteksWo();
  const fd = x.dr.DriveApp.getFolderById('wofoto');
  const file = fd.createFile({ bytes: [0xff, 0xd8, 1], mime: 'image/jpeg', nama: 'IJR_TEMUAN.jpg' });
  file.getThumbnail = () => ({ getBytes: () => [9, 9] });
  const id = x.temuan({ foto_temuan_file_id: file.getId() });
  const a = x.h.getFotoTemuanInspeksi_(x.admin, { temuanId: id, slot: 'TEMUAN' });
  assert.deepStrictEqual([a.temuanId, a.slot, a.kecil, a.data], [id, 'TEMUAN', true, Buffer.from([9, 9]).toString('base64')]);
  assert.strictEqual(kodeError(() => x.h.getFotoTemuanInspeksi_(x.admin, { temuanId: id, slot: 'TIANG' })), 'FOTO_TIDAK_ADA');
  const ins = { userId: U(), role: 'PETUGAS', jenisTim: 'INSPEKSI_JARINGAN', timId: x.timIns };
  assert.strictEqual(x.h.getFotoTemuanInsJar_(ins, { temuanId: id, slot: 'TEMUAN' }).slot, 'TEMUAN');
  assert.strictEqual(kodeError(() => x.h.getFotoTemuanInsJar_({ ...ins, timId: U() }, { temuanId: id, slot: 'TEMUAN' })), 'BUKAN_MILIK_TIM');
  assert.strictEqual(kodeError(() => x.h.getFotoTemuanInspeksi_(x.sesi, { temuanId: id, slot: 'TEMUAN' })), 'AKSES_DITOLAK');
});

// ---------- v1.0.20 ----------

test('v1.0.21 riwayat gardu: pengukuran terbaru LWBP / WBP dari 3 sumber (Yandal, Inspeksi Gardu, Master Gardu)', () => {
  const x = konteksWo();
  const t = x.h.terbaruRg_([
    { sumber: 'Pengecekan Gardu Yandal', tanggal: '2026-10-20', jam: '19:00', periode: 'WBP' },
    { sumber: 'Inspeksi Gardu', tanggal: '2026-10-21', jam: '10:00', periode: 'LWBP' },
    { sumber: 'Inspeksi Gardu', tanggal: '2026-10-21', jam: '18:30', periode: 'WBP' },
    { sumber: 'Master Gardu', tanggal: '2026-10-22', jam: '', periode: 'LWBP' },
    { sumber: 'Master Gardu', tanggal: '2026-10-21', jam: '', periode: 'WBP' },
    { sumber: 'x', tanggal: '2026-10-30', jam: '', periode: '' },
  ]);
  assert.deepStrictEqual([t.LWBP.sumber, t.LWBP.tanggal, t.WBP.sumber, t.WBP.jam], ['Master Gardu', '2026-10-22', 'Inspeksi Gardu', '18:30']);
  const m = x.h.ukurMasterRg_({ tglUkur: '2026-10-22', waktuBeban: 'WBP', kodeUkur: 'K1', ukur: { bebanR: 80, teganganRN: 228 }, bebanKva: 50, persen: 50 });
  assert.deepStrictEqual([m[0].sumber, m[0].periode, m[0].bebanR, m[0].teganganRN, m[0].kva], ['Master Gardu', 'WBP', 80, 228, 50]);
  assert.strictEqual(x.h.ukurMasterRg_({ tglUkur: '' }).length, 0);
  assert.deepStrictEqual({ ...x.h.terbaruRg_([]) }, { LWBP: null, WBP: null });
});

test('v1.0.20 riwayat gardu: periode ukur selalu LWBP / WBP (isian baku dipakai, kosong = dari jam ukur WBP 17:00-21:59)', () => {
  const x = konteksWo();
  const p = x.h.periodeUkurRg_;
  assert.deepStrictEqual([p('WBP', '10:00'), p('lwbp', '18:00'), p('', '17:00'), p('', '21:59'), p('', '22:00'), p('', '08:15'), p('', ''), p('Siang', '19:30')],
    ['WBP', 'LWBP', 'WBP', 'WBP', 'LWBP', 'LWBP', '', 'WBP']);
});
