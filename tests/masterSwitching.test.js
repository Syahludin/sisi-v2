const test = require('node:test');
const assert = require('node:assert');
const { buatKonteks } = require('./harness');
const { sheetPalsu, kodeError, j } = require('./gudangUji');

const PROPS = { ENV: 'staging', MASTER_SHEET_ID: 'm', AUTH_SHEET_ID: 'a', KODE_ULP: '16130', ADMIN_EMAIL: 'x@y.z', TIANG_SHEET_ID: 't', TIANG_FOTO_FOLDER_ID: 'fold' };
const KOORD = '-3.012345, 106.512345';

/** Dunia uji: db_Jaringan (2 penyulang, 3 section), db_Switching kosong, log_Audit. */
function dunia(props = PROPS) {
  const g = buatKonteks(props);
  const log = [];
  const buat = sheetPalsu(log);
  const sk = g.skemaHeader_();
  const sheets = {
    m: {
      db_Jaringan: buat('db_Jaringan', [sk.MASTER_SHEET_ID.db_Jaringan.slice(),
        ['s1', 'TOBOALI 1', 'PMT TOBOALI 1', '', 10, true, 1, '', ''],
        ['s2', 'TOBOALI 1', 'LBS AIR BARA', 's1', 20, true, 1, '', ''],
        ['s3', 'Payung', 'PMT PAYUNG', '', 10, true, 1, '', ''],
        ['s4', 'LAMA', 'PMT LAMA', '', 10, false, 1, '', '']]),
    },
    a: { log_Audit: buat('log_Audit', [['waktu', 'user_id', 'username', 'role', 'aksi', 'target', 'detail', 'platform', 'device_id']]) },
    t: { db_Switching: buat('db_Switching', [sk.TIANG_SHEET_ID.db_Switching.slice()]) },
  };
  g.SpreadsheetApp = { openById: (id) => ({ getSheetByName: (n) => (sheets[id] || {})[n], insertSheet: (n) => { sheets[id][n] = buat(n, [[]]); return sheets[id][n]; } }) };
  const admin = { userId: 'u-admin', username: '16130.admin', role: 'ADMIN' };
  const H = sk.TIANG_SHEET_ID.db_Switching;
  const baris = () => sheets.t.db_Switching.data.slice(1).map((b) => Object.fromEntries(H.map((h, i) => [h, b[i]])));
  const isi = (o = {}) => ({ jenis: 'LBS', nama: 'LBS Air Bara', penyulang: 'toboali 1', posisiNormal: 'NC', statusOperasi: 'OPERASI', koordinat: KOORD, ...o });
  const simpan = (o, sesi = admin) => j(g.simpanSwitching_(sesi, isi(o), 'MOBILE'));
  return { g, sheets, admin, baris, isi, simpan };
}

test('switching: hanya ADMIN / SUPER; TIANG_SHEET_ID kosong ditolak; field asing ditolak', () => {
  const x = dunia();
  const petugas = { userId: 'p', role: 'PETUGAS' }, es = { userId: 'e', role: 'ADMIN_ES' };
  for (const s of [petugas, es, null]) {
    assert.strictEqual(kodeError(() => x.g.getMasterSwitching_(s, {})), 'AKSES_DITOLAK');
    assert.strictEqual(kodeError(() => x.g.simpanSwitching_(s, x.isi(), 'MOBILE')), 'AKSES_DITOLAK');
    assert.strictEqual(kodeError(() => x.g.uploadFotoSwitching_(s, {}, 'MOBILE')), 'AKSES_DITOLAK');
    assert.strictEqual(kodeError(() => x.g.getFotoSwitching_(s, {})), 'AKSES_DITOLAK');
  }
  assert.strictEqual(x.baris().length, 0, 'ditolak sebelum menulis');
  const y = dunia({ ...PROPS, TIANG_SHEET_ID: undefined });
  assert.strictEqual(kodeError(() => y.g.getMasterSwitching_(y.admin, {})), 'CONFIG_TIDAK_LENGKAP');
  assert.strictEqual(kodeError(() => y.simpan()), 'CONFIG_TIDAK_LENGKAP');
  assert.strictEqual(kodeError(() => x.simpan({ bebas: 1 })), 'FIELD_TIDAK_DIKENAL');
  assert.strictEqual(kodeError(() => x.g.getMasterSwitching_(x.admin, { a: 1 })), 'FIELD_TIDAK_DIKENAL');
});

test('switching: baris baru = ID SWC-0001 berurutan, penyulang dieja sesuai db_Jaringan, verifikasi langsung berlaku, log audit', () => {
  const x = dunia();
  const a = x.simpan().switching;
  assert.strictEqual(a.switchingId, 'SWC-0001');
  assert.strictEqual(a.penyulang, 'TOBOALI 1');
  assert.strictEqual(a.statusVerifikasi, 'TERVERIFIKASI');
  assert.strictEqual(a.bisaTrip, false, 'LBS bawaan tidak bisa trip');
  assert.deepStrictEqual([a.lat, a.lng, a.koordinat], [-3.012345, 106.512345, '-3.012345, 106.512345']);
  const b = x.simpan({ jenis: 'ACR', nama: 'ACR Palas', fuseRating: '10K', fungsiFco: 'CABANG' }).switching;
  assert.strictEqual(b.switchingId, 'SWC-0002');
  assert.strictEqual(b.bisaTrip, true, 'ACR bawaan bisa trip');
  assert.deepStrictEqual([b.fuseRating, b.fungsiFco], ['', ''], 'kolom FCO dikosongkan untuk selain FCO');
  const r = x.baris();
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].diubah_oleh, 'u-admin');
  assert.strictEqual(String(r[0].revision), '1');
  assert.deepStrictEqual(r.map((x) => Number(x.No)), [1, 2], 'No = nomor urut baris, tidak menimpa kunci');
  assert.ok(r[0].verifikasi_terakhir);
  const audit = x.sheets.a.log_Audit.data.slice(1).map((l) => l[4]);
  assert.deepStrictEqual(audit, ['SWITCHING_BARU', 'SWITCHING_BARU']);
  const m = j(x.g.getMasterSwitching_(x.admin, {}));
  assert.deepStrictEqual(m.switching.map((s) => s.switchingId), ['SWC-0001', 'SWC-0002']);
  assert.deepStrictEqual(m.jaringan.map((s) => s.sectionId), ['s3', 's1', 's2'], 'section aktif saja, urut penyulang lalu urutan');
});

test('switching: validasi bisnis (penyulang, section, titik hubung, koordinat, nama ganda, wajib)', () => {
  const x = dunia();
  assert.strictEqual(kodeError(() => x.simpan({ penyulang: 'TIDAK ADA' })), 'PENYULANG_TIDAK_DIKENAL');
  assert.strictEqual(kodeError(() => x.simpan({ penyulang: 'LAMA' })), 'PENYULANG_TIDAK_DIKENAL', 'penyulang nonaktif tidak boleh');
  assert.strictEqual(kodeError(() => x.simpan({ sectionId: 's3' })), 'SECTION_BEDA_PENYULANG');
  assert.strictEqual(kodeError(() => x.simpan({ sectionId: 's9' })), 'DATA_TIDAK_DITEMUKAN');
  assert.strictEqual(kodeError(() => x.simpan({ titikHubung: true })), 'PENYULANG_TIDAK_DIKENAL');
  assert.strictEqual(kodeError(() => x.simpan({ titikHubung: true, penyulangSisiB: 'Toboali 1' })), 'DATA_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.simpan({ koordinat: '-6.2, 106.8' })), 'KOORDINAT_DI_LUAR_AREA');
  assert.strictEqual(kodeError(() => x.simpan({ jenis: 'GARDU' })), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.simpan({ nama: '' })), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => x.simpan({ koordinat: '' })), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => x.simpan({ tahunPasang: 1800 })), 'DI_LUAR_RENTANG');
  assert.strictEqual(x.baris().length, 0, 'semua ditolak sebelum menulis');
  const hub = x.simpan({ titikHubung: true, penyulangSisiB: 'payung', tiangSisiA: '17074727', sectionId: 's2' }).switching;
  assert.deepStrictEqual([hub.penyulangSisiB, hub.tiangSisiA, hub.sectionId], ['Payung', '17074727', 's2']);
  assert.strictEqual(kodeError(() => x.simpan({ nama: 'lbs air bara' })), 'NAMA_GANDA');
  assert.doesNotThrow(() => x.simpan({ nama: 'LBS Air Bara', penyulang: 'Payung' }), 'nama sama di penyulang lain boleh');
});

test('switching: ubah memakai revision, kolom berubah tercatat di log, aktif lama dipertahankan', () => {
  const x = dunia();
  const a = x.simpan().switching;
  assert.strictEqual(kodeError(() => x.simpan({ switchingId: a.switchingId })), 'FIELD_WAJIB', 'ubah tanpa revision');
  assert.strictEqual(kodeError(() => x.simpan({ switchingId: a.switchingId, revision: 5 })), 'KONFLIK_REVISION');
  assert.strictEqual(kodeError(() => x.simpan({ switchingId: 'SWC-0099', revision: 1 })), 'DATA_TIDAK_DITEMUKAN');
  const b = x.simpan({ switchingId: a.switchingId, revision: 1, nama: 'LBS Air Bara Baru', merkKontroler: 'Schneider', statusVerifikasi: 'PERLU_PERBAIKAN', aktif: false }).switching;
  assert.deepStrictEqual([b.switchingId, b.nama, b.merkKontroler, b.statusVerifikasi, b.aktif, b.revision], ['SWC-0001', 'LBS Air Bara Baru', 'Schneider', 'PERLU_PERBAIKAN', false, 2]);
  assert.strictEqual(x.baris().length, 1, 'ubah tidak menambah baris');
  const detail = x.sheets.a.log_Audit.data.slice(-1)[0][6];
  assert.match(detail, /nama: LBS Air Bara -> LBS Air Bara Baru/);
  assert.match(detail, /merk_kontroler: - -> Schneider/);
  const c = x.simpan({ switchingId: a.switchingId, revision: 2, nama: 'LBS Air Bara Baru' }).switching;
  assert.strictEqual(c.aktif, false, 'tanpa isian aktif = status aktif lama tetap');
  assert.strictEqual(c.merkKontroler, '', 'simpan = ganti seluruh isian (kosong = dikosongkan)');
});

test('switching: rantai hulu (proteksi hulu = PMT / ACR terdekat yang bisa trip, putaran ditolak)', () => {
  const x = dunia();
  const pmt = x.simpan({ jenis: 'PMT', nama: 'PMT Toboali 1' }).switching;
  const acr = x.simpan({ jenis: 'ACR', nama: 'ACR Palas', switchingHuluId: pmt.switchingId }).switching;
  const lbs = x.simpan({ jenis: 'LBS', nama: 'LBS A', switchingHuluId: acr.switchingId }).switching;
  const fco = x.simpan({ jenis: 'FCO', nama: 'FCO Cabang B', switchingHuluId: lbs.switchingId, fungsiFco: 'CABANG', fuseTipe: 'K', fuseRating: '10K' }).switching;
  assert.strictEqual(acr.proteksiHuluId, pmt.switchingId);
  assert.strictEqual(lbs.proteksiHuluId, acr.switchingId, 'LBS tidak bisa trip: proteksi hulunya ACR');
  assert.strictEqual(fco.proteksiHuluId, acr.switchingId, 'melewati LBS sampai ACR');
  assert.deepStrictEqual([fco.fungsiFco, fco.fuseTipe, fco.fuseRating, fco.bisaTrip], ['CABANG', 'K', '10K', true]);
  assert.strictEqual(kodeError(() => x.simpan({ switchingId: pmt.switchingId, revision: 1, jenis: 'PMT', nama: 'PMT Toboali 1', switchingHuluId: fco.switchingId })), 'HULU_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.simpan({ switchingId: lbs.switchingId, revision: 1, nama: 'LBS A', switchingHuluId: lbs.switchingId })), 'HULU_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.simpan({ nama: 'LBS Z', switchingHuluId: 'SWC-0404' })), 'DATA_TIDAK_DITEMUKAN');
  const m = j(x.g.getMasterSwitching_(x.admin, {}));
  assert.deepStrictEqual(m.switching.map((s) => s.proteksiHuluId), ['', pmt.switchingId, acr.switchingId, acr.switchingId]);
});

test('switching: foto per slot ke Drive privat, kolom foto diisi, ulang foto sama tidak menulis lagi', () => {
  const x = dunia();
  const a = x.simpan().switching;
  const foto = { sha256: 'a'.repeat(64), ukuranByte: 3, data: 'AAAA' };
  const drive = [];
  x.g.bytesFotoLapangan_ = () => [1, 2, 3];
  x.g.simpanFotoLapangan_ = (akar, bagian, penanda, nama) => { drive.push({ akar, bagian, penanda, nama }); return { fileId: 'f1', link: 'l' }; };
  assert.strictEqual(kodeError(() => x.g.uploadFotoSwitching_(x.admin, { switchingId: a.switchingId, slot: 'ATAP', ...foto }, 'MOBILE')), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.g.uploadFotoSwitching_(x.admin, { switchingId: 'SWC-0009', slot: 'UNIT', ...foto }, 'MOBILE')), 'DATA_TIDAK_DITEMUKAN');
  const h = j(x.g.uploadFotoSwitching_(x.admin, { switchingId: a.switchingId, slot: 'UNIT', ...foto }, 'MOBILE'));
  assert.deepStrictEqual(h, { switchingId: 'SWC-0001', slot: 'UNIT', revision: 2 });
  assert.deepStrictEqual(j(drive[0]), { akar: 'fold', bagian: ['Switching', 'SWC-0001'], penanda: 'SWC-0001|UNIT|' + 'a'.repeat(64), nama: 'SWC-0001_UNIT.jpg' });
  assert.strictEqual(x.baris()[0].foto_unit_id, 'f1');
  const h2 = j(x.g.uploadFotoSwitching_(x.admin, { switchingId: a.switchingId, slot: 'UNIT', ...foto }, 'MOBILE'));
  assert.strictEqual(h2.revision, 2, 'file sama = baris tidak ditulis ulang');
  assert.deepStrictEqual(j(x.g.getMasterSwitching_(x.admin, {})).switching[0].foto, { UNIT: true, NAMEPLATE: false, KONTROLER: false });
  const y = dunia({ ...PROPS, TIANG_FOTO_FOLDER_ID: undefined });
  y.simpan();
  y.g.bytesFotoLapangan_ = () => [1, 2, 3];
  assert.strictEqual(kodeError(() => y.g.uploadFotoSwitching_(y.admin, { switchingId: 'SWC-0001', slot: 'UNIT', ...foto }, 'MOBILE')), 'CONFIG_TIDAK_LENGKAP');
});
