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
  const lengkap = (segmenId, o = {}) => ({ penyulang: 'TOBOALI 1', posisi: 'ATAS', konstruksiId: KONS, segmenId, peranTitik: 'biasa', jenisKabel: 'AAAC', ukuranMm2: 150,
    switchingKeterangan: 'Tidak ada switching', ...o });
  const fisik = { jenisTiang: 'BETON', ukuranTiang: '12 Meter 200 daN', sisiJalan: 'KIRI' };
  // 1001 = tiang awal jalur (Tiang Awal SKTM), supaya tiang berikutnya bisa memakainya sebagai induk terverifikasi
  const awal = (segmenId) => { const t = jalur()[0]; return verif({ tiangId: t.tiangId, revision: t.revision, statusVerifikasi: 'TERVERIFIKASI', koordinat: '-3, 106.5', ...fisik,
    sirkuit: [{ sirkuitId: t.sirkuit[0].sirkuitId, ...lengkap(segmenId, { indukStatus: 'TITIK_AWAL', indukKeterangan: 'Tiang Awal SKTM' }) }] }); };
  return { g, sheets, admin, swc, baris, segmen, jalur, verif, diam, lengkap, fisik, awal };
}


module.exports = { dunia, PROPS, KONS, lng, itb };
