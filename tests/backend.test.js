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
