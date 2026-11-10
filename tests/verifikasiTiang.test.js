const test = require('node:test');
const assert = require('node:assert');
const { buatKonteks } = require('./harness');
const { sheetPalsu, kodeError, j } = require('./gudangUji');

const PROPS = { ENV: 'staging', MASTER_SHEET_ID: 'm', AUTH_SHEET_ID: 'a', KODE_ULP: '16130', ADMIN_EMAIL: 'x@y.z', TIANG_SHEET_ID: 't', MASTER_ITB_SHEET_ID: 'i', TIANG_FOTO_FOLDER_ID: 'f' };
const KONS = '11111111-1111-4111-8111-111111111111';
const lng = (n) => 106.5 + n * 0.0005;
const itb = (id, nama, lat, x) => [id, 'TIANG TM ' + nama, 'Tiang TM', 'OPERATING', 'SEGMEN A - B', lat, x];

/** Dunia uji: jaringan 2 penyulang, 1 konstruksi, 1 switching, 4 tiang TM hasil migrasi ITB (PLS0001-0003 + cabang PLS0002.C0001). */
function dunia() {
  const g = buatKonteks(PROPS);
  const buat = sheetPalsu([]);
  const sk = g.skemaHeader_();
  const sheets = {
    m: {
      db_Jaringan: buat('db_Jaringan', [sk.MASTER_SHEET_ID.db_Jaringan.slice(), ['s1', 'TOBOALI 1', 'PMT TOBOALI 1', '', 10, true, 1, '', ''],
        ['s2', 'TOBOALI 1', 'LBS AIR BARA', 's1', 20, true, 1, '', ''], ['s3', 'PAYUNG', 'PMT PAYUNG', '', 10, true, 1, '', '']]),
    },
    a: { log_Audit: buat('log_Audit', [['waktu', 'user_id', 'username', 'role', 'aksi', 'target', 'detail', 'platform', 'device_id']]) },
    t: {},
    i: { db_TiangMaster: buat('db_TiangMaster', [['ASSETNUM', 'DESCRIPTION', 'SUBCLASS', 'STATUS', 'PARENT', 'LATITUDEY', 'LONGITUDEX'],
      itb('1001', 'PLS0001', -3, lng(0)), itb('1002', 'PLS0002', -3, lng(1)), itb('1003', 'PLS0003', -3, lng(2)), itb('1004', 'PLS0002.C0001', -3.0005, lng(1))]) },
  };
  g.SpreadsheetApp = { openById: (id) => ({ getName: () => 'ITB ULP Toboali November 2026', getSheetByName: (n) => (sheets[id] || {})[n], insertSheet: (n) => { sheets[id][n] = buat(n, [[]]); return sheets[id][n]; } }) };
  g.Session = { getActiveUser: () => ({ getEmail: () => 'x@y.z' }) };
  const diam = (fn) => { const a = [console.log, console.warn, console.error]; console.log = console.warn = console.error = () => {}; try { return fn(); } finally { [console.log, console.warn, console.error] = a; } };
  diam(() => { g.ADMIN_siapkanSheetTiang(); g.ADMIN_migrasiTiangItb(); });
  sheets.m.db_Konstruksi.data.push([1, KONS, 'TM1', 'TM1', '', '', '', 10, true, 1, '', '']);
  const admin = { userId: 'u-admin', username: '16130.admin', role: 'ADMIN' };
  const swc = j(g.simpanSwitching_(admin, { jenis: 'LBS', nama: 'LBS Air Bara', penyulang: 'TOBOALI 1', posisiNormal: 'NC', statusOperasi: 'OPERASI', koordinat: '-3, 106.5' }, 'MOBILE')).switching;
  const H = sk.TIANG_SHEET_ID;
  const baris = (n) => sheets.t[n].data.slice(1).map((b) => Object.fromEntries(H[n].map((h, i) => [h, b[i]])));
  const segmen = (o = {}) => j(g.simpanSegmen_(admin, { nama: 'LBS Air Bara - TB0011', penyulang: 'toboali 1', sectionId: 's2', awalJenis: 'SWITCHING', awalNama: 'LBS Air Bara',
    awalSwitchingId: swc.switchingId, akhirJenis: 'GARDU', akhirNama: 'TB0011', ...o }, 'MOBILE')).segmen;
  const jalur = (kode = 'PLS') => j(g.getTiangJalur_(admin, { kode })).tiang;
  const verif = (o) => j(g.simpanVerifikasiTiang_(admin, o, 'MOBILE'));
  // sirkuit lengkap (semua kolom wajib Terverifikasi); o menimpa
  const lengkap = (segmenId, o = {}) => ({ penyulang: 'TOBOALI 1', posisi: 'KIRI', segmenId, peranTitik: 'biasa', jenisKabel: 'AAAC', ukuranMm2: 150,
    switchingKeterangan: 'Tidak ada switching', ...o });
  const fisik = { jenisTiang: 'BETON', ukuranTiang: '12 Meter 200 daN', konstruksiId: KONS };
  // 1001 = tiang awal jalur (Tiang Awal SKTM), supaya tiang berikutnya bisa memakainya sebagai induk terverifikasi
  const awal = (segmenId) => { const t = jalur()[0]; return verif({ tiangId: t.tiangId, revision: t.revision, statusVerifikasi: 'TERVERIFIKASI', koordinat: '-3, 106.5', ...fisik,
    sirkuit: [{ sirkuitId: t.sirkuit[0].sirkuitId, ...lengkap(segmenId, { indukStatus: 'TITIK_AWAL', indukKeterangan: 'Tiang Awal SKTM' }) }] }); };
  return { g, sheets, admin, swc, baris, segmen, jalur, verif, diam, lengkap, fisik, awal };
}

test('ukuran tiang: hanya baris aktif ber-nama dari db_Ukuran_Tiang, urut kolom urutan', () => {
  const x = dunia();
  x.sheets.m.db_Ukuran_Tiang.data.push([1, 'u2', '12 Meter 350 daN', '', 20, true, 1, '', ''], [2, 'u1', '11 Meter 200 daN', '', 10, true, 1, '', ''],
    [3, 'u3', '9 Meter 100 daN', '', 5, false, 1, '', ''], [4, 'u4', '', '', 1, true, 1, '', '']);
  assert.deepStrictEqual(j(x.g.getVerifikasiTiang_(x.admin, {})).ukuran, ['11 Meter 200 daN', '12 Meter 350 daN']);
});

test('segmen + tiang: hanya ADMIN / SUPER, sebelum membaca isian', () => {
  const x = dunia();
  for (const s of [{ userId: 'p', role: 'PETUGAS' }, { userId: 'e', role: 'ADMIN_ES' }, null]) {
    for (const f of ['getSegmen_', 'simpanSegmen_', 'getVerifikasiTiang_', 'getTiangJalur_', 'simpanVerifikasiTiang_', 'uploadFotoTiang_', 'getFotoTiang_']) {
      assert.strictEqual(kodeError(() => x.g[f](s, {}, 'MOBILE')), 'AKSES_DITOLAK', f);
    }
  }
  assert.strictEqual(x.baris('db_Segmen').length, 0);
});

test('segmen: ID SGM berurutan, urutan otomatis per penyulang, validasi master, nama unik per section, ubah dengan revision', () => {
  const x = dunia();
  const a = x.segmen();
  assert.deepStrictEqual([a.segmenId, a.penyulang, a.urutan, a.awalSwitchingId], ['SGM-0001', 'TOBOALI 1', 10, x.swc.switchingId]);
  const b = x.segmen({ nama: 'TB0011 - Ujung', awalJenis: 'GARDU', awalNama: 'TB0011', awalSwitchingId: '', akhirJenis: 'UJUNG', akhirNama: 'Ujung', indukSegmenId: 'SGM-0001' });
  assert.deepStrictEqual([b.segmenId, b.urutan, b.indukSegmenId], ['SGM-0002', 20, 'SGM-0001']);
  assert.strictEqual(kodeError(() => x.segmen()), 'NAMA_GANDA');
  assert.strictEqual(kodeError(() => x.segmen({ nama: 'X', sectionId: 's3' })), 'SECTION_BEDA_PENYULANG');
  assert.strictEqual(kodeError(() => x.segmen({ nama: 'X', penyulang: 'ASING' })), 'PENYULANG_TIDAK_DIKENAL');
  assert.strictEqual(kodeError(() => x.segmen({ nama: 'X', akhirSwitchingId: 'SWC-0099' })), 'DATA_TIDAK_DITEMUKAN');
  assert.strictEqual(kodeError(() => x.segmen({ nama: 'X', indukSegmenId: 'SGM-0099' })), 'HULU_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.segmen({ nama: 'X', awalJenis: 'TIANG' })), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.segmen({ segmenId: 'SGM-0001', revision: 9 })), 'KONFLIK_REVISION');
  const c = x.segmen({ segmenId: 'SGM-0001', revision: 1, catatan: 'cek LBS', aktif: false });
  assert.deepStrictEqual([c.catatan, c.aktif, c.revision], ['cek LBS', false, 2]);
  const daftar = j(x.g.getSegmen_(x.admin, {}));
  assert.deepStrictEqual(daftar.segmen.map((s) => s.segmenId), ['SGM-0001', 'SGM-0002']);
  assert.deepStrictEqual(daftar.switching.map((s) => s.switchingId), [x.swc.switchingId]);
  assert.strictEqual(x.sheets.a.log_Audit.data.filter((l) => /^SEGMEN_/.test(l[4])).length, 3);
});

test('segmen kabel tanah: ujung kabel, data kabel, status data, tanpa tiang; udara membersihkan kolom kabel', () => {
  const x = dunia();
  // bawaan: UDARA, kolom kabel kosong, status_data kosong
  const u = x.segmen({ nama: 'SKTM Air Bara - ACR', awalJenis: 'UJUNG_KABEL', awalNama: 'SKTM Air Bara', awalSwitchingId: '', akhirJenis: 'GARDU', akhirNama: 'TB0011' });
  assert.deepStrictEqual([u.jenisSegmen, u.jenisKabel, u.statusData, u.awalJenis], ['UDARA', '', '', 'UJUNG_KABEL']);
  // kabel tanah: data kabel kurang = KURANG, tetap tersimpan
  const k = x.segmen({ nama: 'PMT Air Bara - SKTM Air Bara', jenisSegmen: 'KABEL_TANAH', awalJenis: 'SWITCHING', akhirJenis: 'UJUNG_KABEL', akhirNama: 'SKTM Air Bara', jenisKabel: 'NA2XSEYBY - 3 CORE' });
  assert.deepStrictEqual([k.jenisSegmen, k.jenisKabel, k.ukuranMm2, k.panjangKabelM, k.statusData], ['KABEL_TANAH', 'NA2XSEYBY - 3 CORE', null, null, 'KURANG']);
  const l = x.segmen({ segmenId: k.segmenId, revision: k.revision, nama: k.nama, jenisSegmen: 'KABEL_TANAH', awalJenis: 'SWITCHING', akhirJenis: 'UJUNG_KABEL', akhirNama: 'SKTM Air Bara',
    jenisKabel: 'NA2XSEYBY - 3 CORE', ukuranMm2: 240, panjangKabelM: 212.5, penghantarId: 'PH-240' });
  assert.deepStrictEqual([l.ukuranMm2, l.panjangKabelM, l.penghantarId, l.statusData], [240, 212.5, 'PH-240', 'LENGKAP']);
  assert.strictEqual(kodeError(() => x.segmen({ nama: 'X', jenisSegmen: 'KABEL_TANAH', jenisKabel: 'AAAC' })), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.segmen({ nama: 'X', jenisSegmen: 'LAUT' })), 'PILIHAN_TIDAK_VALID');
  // segmen kabel tanah tidak boleh dipakai tiang
  const t = x.jalur()[0];
  assert.strictEqual(kodeError(() => x.verif({ tiangId: t.tiangId, revision: t.revision, statusVerifikasi: 'TERVERIFIKASI', koordinat: '-3, 106.5', ...x.fisik,
    sirkuit: [{ sirkuitId: t.sirkuit[0].sirkuitId, ...x.lengkap(k.segmenId, { indukStatus: 'TITIK_AWAL', indukKeterangan: 'Tiang Awal SKTM' }) }] })), 'DATA_TIDAK_VALID');
  // segmen udara yang sudah berisi tiang tidak bisa diubah jadi kabel tanah
  x.awal(u.segmenId);
  assert.strictEqual(kodeError(() => x.segmen({ segmenId: u.segmenId, revision: u.revision, nama: u.nama, jenisSegmen: 'KABEL_TANAH', awalJenis: 'UJUNG_KABEL', awalNama: 'SKTM Air Bara', akhirJenis: 'GARDU', akhirNama: 'TB0011' })), 'DATA_TIDAK_VALID');
  // ubah kabel tanah -> udara membersihkan kolom kabel
  const m = x.segmen({ segmenId: k.segmenId, revision: l.revision, nama: k.nama, jenisSegmen: 'UDARA', awalJenis: 'SWITCHING', akhirJenis: 'UJUNG_KABEL', akhirNama: 'SKTM Air Bara',
    jenisKabel: 'NA2XSEYBY - 3 CORE', ukuranMm2: 240, panjangKabelM: 212.5 });
  assert.deepStrictEqual([m.jenisSegmen, m.jenisKabel, m.ukuranMm2, m.panjangKabelM, m.statusData], ['UDARA', '', null, null, '']);
});

test('tiang: ringkasan jalur + pilihan isian, daftar tiang satu jalur beserta sirkuit awal', () => {
  const x = dunia();
  x.segmen();
  const v = j(x.g.getVerifikasiTiang_(x.admin, {}));
  assert.deepStrictEqual(v.jalur, [{ kode: 'PLS', jumlah: 4, terverifikasi: 0, perluDilengkapi: 0, perluPerbaikan: 0, tidakDitemukan: 0, bertanda: 0 }]);
  assert.deepStrictEqual(v.konstruksi, [{ konstruksiId: KONS, kode: 'TM1', nama: 'TM1' }]);
  assert.deepStrictEqual(v.ukuran, [], 'db_Ukuran_Tiang kosong = HP memakai daftar bawaan');
  assert.deepStrictEqual(v.segmen.map((s) => s.segmenId), ['SGM-0001']);
  const t = x.jalur();
  assert.deepStrictEqual(t.map((r) => r.tiangId), ['1001', '1002', '1003', '1004']);
  assert.strictEqual(t[2].sirkuit[0].indukTiangId, '1002');
  assert.strictEqual(kodeError(() => x.g.getTiangJalur_(x.admin, { kode: 'pls' })), 'FORMAT_SALAH');
});

test('tiang: verifikasi = GPS lapangan + data fisik + sirkuit; sirkuit kedua ditambah lalu dilepas; gawang dihitung server', () => {
  const x = dunia();
  const sg = x.segmen();
  const sgP = x.segmen({ nama: 'PMT Payung - TP0001', penyulang: 'payung', sectionId: 's3', awalJenis: 'GI', awalNama: 'GI Toboali', awalSwitchingId: undefined });
  x.awal(sg.segmenId);
  const t = x.jalur()[1];
  const h = x.verif({ tiangId: t.tiangId, revision: t.revision, statusVerifikasi: 'TERVERIFIKASI', koordinat: '-3.000100, 106.500500', akurasiM: 4, dasarKoordinat: 'LAPANGAN', ...x.fisik,
    sirkuit: [{ sirkuitId: t.sirkuit[0].sirkuitId, ...x.lengkap(sg.segmenId, { penyulang: 'toboali 1', indukTiangId: '1001', indukStatus: 'BENAR', switchingId: x.swc.switchingId, switchingKeterangan: undefined }) },
      x.lengkap(sgP.segmenId, { penyulang: 'PAYUNG', posisi: 'KANAN', indukTiangId: '1001', indukStatus: 'DIGANTI' })] });
  assert.ok(h.selisihM > 5 && h.selisihM < 20, 'selisih dari koordinat aset ' + h.selisihM);
  const r = x.baris('db_Tiang').find((b) => String(b.tiang_id) === '1002');
  assert.deepStrictEqual([r.lat, r.lng, r.sumber_koordinat, r.akurasi_m, r.jenis_tiang, r.konstruksi_lapangan, r.jumlah_sirkuit, r.status_verifikasi, r.tanda_cek, r.diverifikasi_oleh],
    [-3.0001, 106.5005, 'lapangan', 4, 'BETON', KONS, 2, 'TERVERIFIKASI', '', 'u-admin']);
  assert.deepStrictEqual([r.lat_aset, r.lng_aset], [-3, lng(1)], 'kolom aset tidak diubah');
  const s = x.baris('db_Tiang_Sirkuit').filter((b) => String(b.tiang_id) === '1002');
  assert.strictEqual(s.length, 2);
  assert.deepStrictEqual([s[0].penyulang, s[0].posisi, s[0].segmen_id, s[0].section_id, s[0].switching_id, s[0].ukuran_mm2, s[0].status_verifikasi],
    ['TOBOALI 1', 'KIRI', 'SGM-0001', 's2', x.swc.switchingId, 150, 'TERVERIFIKASI'], 'section diisi dari segmen');
  assert.deepStrictEqual([s[0].induk_status, s[1].induk_status, h.tiang.kurang], ['BENAR', 'DIGANTI', ['Foto Tiang Utuh', 'Foto Kepala Tiang']], 'foto menyusul sesudah simpan');
  assert.ok(Number(s[0].gawang_m) > 50 && Number(s[0].gawang_m) < 62, 'gawang dari koordinat lapangan ' + s[0].gawang_m);
  assert.deepStrictEqual([s[1].penyulang, s[1].posisi, s[1].aktif], ['PAYUNG', 'KANAN', true]);
  assert.deepStrictEqual(h.tiang.sirkuit.map((c) => c.penyulang), ['TOBOALI 1', 'PAYUNG']);
  // ubah lagi: kirim hanya sirkuit pertama = sirkuit kedua dinonaktifkan
  x.verif({ tiangId: '1002', revision: h.tiang.revision, statusVerifikasi: 'PERLU_PERBAIKAN', koordinat: '-3.0001, 106.5005', dasarKoordinat: 'LAPANGAN', sirkuit: [{ sirkuitId: s[0].sirkuit_id, penyulang: 'TOBOALI 1' }] });
  const s2 = x.baris('db_Tiang_Sirkuit').filter((b) => String(b.tiang_id) === '1002');
  assert.deepStrictEqual(s2.map((b) => b.aktif), [true, false]);
  assert.strictEqual(x.baris('db_Tiang').find((b) => String(b.tiang_id) === '1002').jumlah_sirkuit, 1);
  assert.strictEqual(j(x.g.getSegmen_(x.admin, {})).segmen[0].jumlahTiang, 1, 'hanya tiang awal (1001) yang masih memilih segmen');
});

test('tiang: validasi master + revision + gagal tanpa menulis', () => {
  const x = dunia();
  const sg = x.segmen();
  const t = x.jalur()[1];
  const dasar = { tiangId: t.tiangId, revision: t.revision, statusVerifikasi: 'TERVERIFIKASI', koordinat: '-3, 106.5005' };
  const sir = (o) => ({ ...dasar, sirkuit: [{ sirkuitId: t.sirkuit[0].sirkuitId, penyulang: 'TOBOALI 1', ...o }] });
  const sebelum = JSON.stringify([x.sheets.t.db_Tiang.data, x.sheets.t.db_Tiang_Sirkuit.data]);
  assert.strictEqual(kodeError(() => x.verif({ ...sir({}), revision: 9 })), 'KONFLIK_REVISION');
  assert.strictEqual(kodeError(() => x.verif(sir({ penyulang: 'PAYUNG', segmenId: sg.segmenId }))), 'DATA_TIDAK_VALID', 'segmen milik penyulang lain');
  assert.strictEqual(kodeError(() => x.verif(sir({ sectionId: 's3' }))), 'SECTION_BEDA_PENYULANG');
  assert.strictEqual(kodeError(() => x.verif(sir({ indukTiangId: t.tiangId }))), 'HULU_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.verif(sir({ indukTiangId: '9999' }))), 'DATA_TIDAK_DITEMUKAN');
  assert.strictEqual(kodeError(() => x.verif(sir({ switchingId: 'SWC-0042' }))), 'DATA_TIDAK_DITEMUKAN');
  assert.strictEqual(kodeError(() => x.verif(sir({ sirkuitId: '22222222-2222-4222-8222-222222222222' }))), 'DATA_TIDAK_DITEMUKAN');
  assert.strictEqual(kodeError(() => x.verif({ ...sir({}), konstruksiId: '33333333-3333-4333-8333-333333333333' })), 'DATA_TIDAK_DITEMUKAN');
  assert.strictEqual(kodeError(() => x.verif({ ...dasar, sirkuit: [] })), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => x.verif({ ...dasar, sirkuit: [{}, {}, {}, {}] })), 'TERLALU_BANYAK');
  assert.strictEqual(kodeError(() => x.verif({ ...sir({}), koordinat: undefined })), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => x.verif({ ...sir({}), bebas: 1 })), 'FIELD_TIDAK_DIKENAL');
  assert.strictEqual(JSON.stringify([x.sheets.t.db_Tiang.data, x.sheets.t.db_Tiang_Sirkuit.data]), sebelum);
});

test('tiang: Terverifikasi hanya bila data wajib lengkap + induk dikonfirmasi; Tiang Awal SKTM wajib keterangan', () => {
  const x = dunia();
  const sg = x.segmen();
  let t = x.jalur()[1];
  const kirim = (o = {}, sir = {}, status = 'TERVERIFIKASI') => x.verif({ tiangId: t.tiangId, revision: t.revision, statusVerifikasi: status, koordinat: '-3, 106.5005', ...x.fisik, ...o,
    sirkuit: [{ sirkuitId: t.sirkuit[0].sirkuitId, ...x.lengkap(sg.segmenId, { indukTiangId: '1001', indukStatus: 'BENAR', ...sir }) }] });
  const galat = (fn) => { try { fn(); } catch (e) { return e.kode + ': ' + e.detail; } return 'tidak galat'; };
  assert.strictEqual(galat(() => kirim()), 'DATA_TIDAK_VALID: induk tiang belum terverifikasi', '1001 belum terverifikasi');
  x.awal(sg.segmenId);
  t = x.jalur()[1];
  const sebelum = JSON.stringify(x.sheets.t.db_Tiang_Sirkuit.data);
  assert.strictEqual(galat(() => kirim({ jenisTiang: undefined, ukuranTiang: undefined, konstruksiId: undefined })), 'FIELD_WAJIB: Jenis Tiang, Ukuran Tiang, Konstruksi');
  assert.strictEqual(galat(() => kirim({}, { jenisKabel: undefined, ukuranMm2: undefined, posisi: undefined })), 'FIELD_WAJIB: Posisi, Jenis Kabel, Ukuran mm²');
  assert.strictEqual(galat(() => kirim({}, { indukStatus: undefined })), 'FIELD_WAJIB: Konfirmasi Induk Tiang');
  assert.strictEqual(galat(() => kirim({}, { switchingKeterangan: undefined })), 'FIELD_WAJIB: Switching Hulu atau Keterangan Tanpa Switching');
  assert.strictEqual(galat(() => kirim({}, { indukTiangId: undefined, indukStatus: 'TITIK_AWAL' })), 'FIELD_WAJIB: Keterangan Tiang Awal SKTM');
  assert.strictEqual(galat(() => kirim({}, { indukTiangId: '1001', indukStatus: 'TITIK_AWAL', indukKeterangan: 'Tiang Awal SKTM' })), 'FIELD_WAJIB: Tiang Awal Tidak Boleh Punya Induk');
  assert.strictEqual(JSON.stringify(x.sheets.t.db_Tiang_Sirkuit.data), sebelum, 'gagal tidak menulis');
  assert.strictEqual(galat(() => kirim({ jenisTiang: undefined }, { indukStatus: undefined }, 'PERLU_PERBAIKAN')), 'tidak galat', 'Perlu Perbaikan boleh belum lengkap');
  const t2 = x.jalur()[1];
  const ok = x.verif({ tiangId: t2.tiangId, revision: t2.revision, statusVerifikasi: 'TERVERIFIKASI', koordinat: '-3, 106.5005', ...x.fisik,
    sirkuit: [{ sirkuitId: t2.sirkuit[0].sirkuitId, ...x.lengkap(sg.segmenId, { indukTiangId: '1001', indukStatus: 'BENAR' }) }] });
  assert.deepStrictEqual(ok.tiang.sirkuit.map((c) => [c.indukStatus, c.switchingKeterangan]), [['BENAR', 'Tidak ada switching']]);
  const awal = x.jalur()[0];
  assert.deepStrictEqual([awal.sirkuit[0].indukStatus, awal.sirkuit[0].indukKeterangan], ['TITIK_AWAL', 'Tiang Awal SKTM']);
});

test('tiang: yang sudah Terverifikasi sebelum aturan ini tampil dengan daftar kekurangan; tab lama diperpanjang kolomnya', () => {
  const x = dunia();
  const rT = x.sheets.t.db_Tiang.data, H = x.g.TIANG_HEADER_.db_Tiang;
  rT[1][H.indexOf('status_verifikasi')] = 'TERVERIFIKASI';
  const lama = x.jalur()[0];
  assert.ok(lama.kurang.includes('Jenis Tiang') && lama.kurang.includes('Konfirmasi Induk Tiang') && lama.kurang.includes('Foto Tiang Utuh'));
  assert.strictEqual(x.jalur()[1].kurang, undefined, 'yang belum terverifikasi tidak dinilai');
  // tab db_Tiang_Sirkuit versi lama (tanpa 3 kolom konfirmasi): siapkan menambah kolom, data utuh
  const sh = x.sheets.t.db_Tiang_Sirkuit, n = x.g.TIANG_HEADER_.db_Tiang_Sirkuit.length;
  sh.data.forEach((b) => b.splice(n - 3));
  assert.strictEqual(x.diam(() => x.g.ADMIN_cekSheetTiang()), 1);
  assert.strictEqual(x.diam(() => x.g.ADMIN_siapkanSheetTiang()), 0);
  assert.deepStrictEqual(sh.data[0].slice(-3), ['induk_status', 'induk_keterangan', 'switching_keterangan']);
  assert.strictEqual(x.diam(() => x.g.ADMIN_cekSheetTiang()), 0);
});

test('tiang: selisih koordinat > 10 m dari koordinat terdaftar wajib memilih dasar; TERDAFTAR memakai koordinat aset', () => {
  const x = dunia();
  const sg = x.segmen();
  const t = x.jalur()[0];   // aset -3, 106.5; -3.0001 = sekitar 11 m
  const kirim = (koordinat, o = {}) => x.verif({ tiangId: t.tiangId, revision: x.jalur()[0].revision, statusVerifikasi: 'PERLU_PERBAIKAN', koordinat, ...o,
    sirkuit: [{ sirkuitId: t.sirkuit[0].sirkuitId, penyulang: 'TOBOALI 1' }] });
  const baris = () => x.baris('db_Tiang').find((b) => String(b.tiang_id) === '1001');
  const sebelum = JSON.stringify(x.sheets.t.db_Tiang.data);
  assert.strictEqual(kodeError(() => kirim('-3.0001, 106.5')), 'FIELD_WAJIB', 'lebih dari 10 m tanpa dasar');
  assert.strictEqual(JSON.stringify(x.sheets.t.db_Tiang.data), sebelum);
  assert.strictEqual(kirim('-3.00005, 106.5').selisihM, 6, 'dalam toleransi: tidak perlu dasar');
  assert.deepStrictEqual([baris().lat, baris().sumber_koordinat], [-3.00005, 'lapangan']);
  const a = kirim('-3.0001, 106.5', { dasarKoordinat: 'TERDAFTAR', akurasiM: 4 });
  assert.strictEqual(a.selisihM, 11, 'selisih tetap dilaporkan dari koordinat yang diambil');
  assert.deepStrictEqual([baris().lat, baris().lng, baris().sumber_koordinat, baris().akurasi_m], [-3, 106.5, 'aset', '']);
  kirim('-3.0001, 106.5', { dasarKoordinat: 'LAPANGAN', akurasiM: 4 });
  assert.deepStrictEqual([baris().lat, baris().sumber_koordinat, baris().akurasi_m], [-3.0001, 'lapangan', 4]);
  assert.ok(sg.segmenId);
});

test('tiang: progres jalur hanya menghitung Terverifikasi yang lengkap (data wajib + foto)', () => {
  const x = dunia();
  const sg = x.segmen();
  x.awal(sg.segmenId);
  const pls = () => j(x.g.getVerifikasiTiang_(x.admin, {})).jalur[0];
  assert.deepStrictEqual([pls().terverifikasi, pls().perluDilengkapi], [0, 1], 'tanpa foto = belum dihitung');
  const baris = x.sheets.t.db_Tiang.data, H = x.g.TIANG_HEADER_.db_Tiang;
  baris[1][H.indexOf('foto_tiang_id')] = 'f1';
  baris[1][H.indexOf('foto_kepala_id')] = 'f2';
  assert.deepStrictEqual([pls().terverifikasi, pls().perluDilengkapi], [1, 0]);
});

test('tiang: tidak ditemukan, tiang baru dari lapangan, migrasi ulang menjaga hasil verifikasi', () => {
  const x = dunia();
  const t = x.jalur()[2];
  const h = x.verif({ tiangId: t.tiangId, revision: t.revision, statusVerifikasi: 'TIDAK_DITEMUKAN' });
  assert.strictEqual(h.tiang.statusVerifikasi, 'TIDAK_DITEMUKAN');
  const r = x.baris('db_Tiang').find((b) => String(b.tiang_id) === '1003');
  assert.deepStrictEqual([r.lat, r.sumber_koordinat], [-3, 'aset'], 'koordinat lama tetap');
  assert.strictEqual(x.baris('db_Tiang_Sirkuit').find((b) => String(b.tiang_id) === '1003').status_verifikasi, 'TIDAK_DITEMUKAN');
  assert.strictEqual(kodeError(() => x.verif({ statusVerifikasi: 'TERVERIFIKASI', koordinat: '-3, 106.6', sirkuit: [{ penyulang: 'PAYUNG' }] })), 'FIELD_WAJIB', 'tiang baru wajib nama');
  const b = x.verif({ statusVerifikasi: 'TERVERIFIKASI', nama: 'PLS0003A', kode: 'PLS', koordinat: '-3, 106.5012', sirkuit: [x.lengkap(x.segmen().segmenId, { indukStatus: 'TITIK_AWAL', indukKeterangan: 'Tiang Awal SKTM' })], ...x.fisik });
  assert.deepStrictEqual([b.tiang.tiangId, b.tiang.kode, b.selisihM], ['BARU-0001', 'PLS', null]);
  const baru = x.baris('db_Tiang').find((row) => row.tiang_id === 'BARU-0001');
  assert.deepStrictEqual([baru.status_aset, baru.keterangan_sumber, baru.aktif, Number(baru.No)], ['BARU', 'Tiang baru dari lapangan', true, 5]);
  assert.strictEqual(x.jalur().length, 5);
  x.diam(() => x.g.ADMIN_migrasiTiangItb());
  assert.strictEqual(x.baris('db_Tiang').find((row) => row.tiang_id === 'BARU-0001').keterangan_sumber, 'Tiang baru dari lapangan', 'tiang baru tidak ditandai hilang');
  assert.strictEqual(x.baris('db_Tiang').find((b2) => String(b2.tiang_id) === '1003').status_verifikasi, 'TIDAK_DITEMUKAN', 'migrasi tidak menimpa status');
});

test('tiang: foto TIANG / KEPALA ke Drive privat per kode jalur', () => {
  const x = dunia();
  const drive = [];
  x.g.bytesFotoLapangan_ = () => [1, 2, 3];
  x.g.simpanFotoLapangan_ = (akar, bagian, penanda, nama) => { drive.push({ akar, bagian, nama }); return { fileId: 'ft1', link: 'l' }; };
  const foto = { sha256: 'a'.repeat(64), ukuranByte: 3, data: 'AAAA' };
  assert.strictEqual(kodeError(() => x.g.uploadFotoTiang_(x.admin, { tiangId: '1001', slot: 'ATAS', ...foto }, 'MOBILE')), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.g.uploadFotoTiang_(x.admin, { tiangId: '7777', slot: 'TIANG', ...foto }, 'MOBILE')), 'DATA_TIDAK_DITEMUKAN');
  x.g.uploadFotoTiang_(x.admin, { tiangId: '1001', slot: 'TIANG', ...foto }, 'MOBILE');
  assert.deepStrictEqual(j(drive[0]), { akar: 'f', bagian: ['Tiang', 'PLS'], nama: '1001_TIANG.jpg' });
  assert.strictEqual(x.baris('db_Tiang').find((b) => String(b.tiang_id) === '1001').foto_tiang_id, 'ft1');
  assert.deepStrictEqual(x.jalur()[0].foto, { TIANG: true, KEPALA: false });
});
