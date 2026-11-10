const crypto = require('crypto');
const { buatKonteks } = require('./harness');

const PROPS = { ENV: 'staging', MASTER_SHEET_ID: 'm', AUTH_SHEET_ID: 'a', KODE_ULP: '16130', ADMIN_EMAIL: 'x@y.z' };
const U = () => crypto.randomUUID();
const j = (v) => JSON.parse(JSON.stringify(v));
const kodeError = (fn) => { try { fn(); } catch (e) { return e.kode || e.message; } return null; };

/** Spreadsheet palsu (salinan sheetPalsu di backend.test.js): data = array of array, header di baris pertama. */
function sheetPalsu(log) {
  const sel = (v) => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v);
  return (nama, data) => ({
    data,
    getDataRange: () => ({ getValues: () => { log.push('BACA_PENUH:' + nama); return data.map((r) => r.slice()); } }),
    getLastColumn: () => data[0].length,
    getLastRow: () => data.length,
    getMaxRows: () => 1000,
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => data.slice(r - 1, r - 1 + nr).map((x) => { const b = x.slice(c - 1, c - 1 + nc); while (b.length < nc) b.push(''); return b; }),
      getValue: () => data[r - 1][c - 1],
      setValue: (v) => { data[r - 1][c - 1] = sel(v); },
      setValues: (vals) => {
        log.push('TULIS:' + nama);
        vals.forEach((baris, i) => { data[r - 1 + i] = data[r - 1 + i] || []; baris.forEach((v, k) => { data[r - 1 + i][c - 1 + k] = sel(v); }); });
      },
      setNumberFormat: () => {},
    }),
    appendRow: (v) => { log.push('TULIS:' + nama); data.push(v.map(sel)); },
    setFrozenRows: () => {},
  });
}

/** Dunia uji gudang: tim Yandal 13/14 + Hartek, material MCB, izin MCB untuk Yandal 13 dan 14, semua sheet SiSi_Gudang kosong. */
function siapkanGudang({ izin = true, mcb = true } = {}) {
  const gg = buatKonteks({ ...PROPS, GUDANG_SHEET_ID: 'g', GUDANG_FOTO_FOLDER_ID: 'folder', YANDAL_SHEET_ID: 'y' });
  const log = [];
  const buat = sheetPalsu(log);
  const sk = gg.skemaHeader_();
  const tim = { y13: U(), y14: U(), hartek: U(), mati: U() };
  const user = { admin: U(), p13: U(), p14: U(), hartek: U() };
  const mat = { mcb: U(), kabel: U() };
  const matHdr = ['nomor', 'nama_material', 'satuan', 'aktif', 'material_id', 'revision', 'timestamp_update', 'diubah_oleh'];
  const sheets = {
    m: {
      db_Users: buat('db_Users', [['user_id', 'username', 'nama', 'role', 'tim_id', 'aktif'],
        [user.admin, '16130.admin', 'Admin Utama', 'ADMIN', '', true], [user.p13, '16130.y13', 'Petugas 13', 'PETUGAS', tim.y13, true],
        [user.p14, '16130.y14', 'Petugas 14', 'PETUGAS', tim.y14, true], [user.hartek, '16130.h', 'Hartek 1', 'PETUGAS', tim.hartek, true]]),
      db_Tim: buat('db_Tim', [['tim_id', 'kode', 'nama', 'jenis', 'aktif'],
        [tim.y13, '13', 'Yandal 13 Toboali', 'YANDAL', true], [tim.y14, '14', 'Yandal 14 Toboali', 'YANDAL', true],
        [tim.hartek, '01', 'Hartek', 'HARTEK', true], [tim.mati, '99', 'Tim Lama', 'HARTEK', false]]),
      db_Material: buat('db_Material', [matHdr.slice(), ...(mcb ? [[1, 'MCB', 'unit', true, mat.mcb, 1, '', '']] : []), [mcb ? 2 : 1, 'Kabel NYY', 'm', true, mat.kabel, 1, '', '']]),
      db_Material_Tim: buat('db_Material_Tim', [sk.MASTER_SHEET_ID.db_Material_Tim.slice(),
        ...(izin ? [[1, U(), mat.mcb, tim.y13, true, 1, '', ''], [2, U(), mat.mcb, tim.y14, true, 1, '', ''], [3, U(), mat.kabel, tim.hartek, true, 1, '', '']] : [])]),
    },
    a: { log_Audit: buat('log_Audit', [['waktu', 'user_id', 'username', 'role', 'aksi', 'target', 'detail', 'platform', 'device_id']]) },
    g: {},
    y: { yan_Shift: buat('yan_Shift', [sk.YANDAL_SHEET_ID.yan_Shift.slice()]) },
  };
  Object.keys(sk.GUDANG_SHEET_ID).forEach((n) => { sheets.g[n] = buat(n, [sk.GUDANG_SHEET_ID[n].slice()]); });
  gg.SpreadsheetApp = { openById: (id) => ({ getSheetByName: (n) => sheets[id][n], insertSheet: (n) => { sheets[id][n] = buat(n, [[]]); return sheets[id][n]; } }) };
  const sesi = (u, role, nama, timId, jenisTim) => ({ userId: u, username: nama, role, timId: timId || '', jenisTim: jenisTim || '' });
  /** Baris yan_Shift (shift Yandal yang sudah dimulai) untuk tim [timId]; petugas = [id1, id2?]. */
  const mulaiShift = (timId, tanggal, no, kode, petugas = []) => {
    const hdr = sk.YANDAL_SHEET_ID.yan_Shift;
    const o = { 'Kode Shift': kode, Tanggal: tanggal, Shift: no, tim_id: timId, status: 'AKTIF', petugas_id_1: petugas[0] || '', petugas_id_2: petugas[1] || '',
      Petugas: petugas.join(' & '), shift_id: U() };
    sheets.y.yan_Shift.data.push(hdr.map((h) => (h in o ? o[h] : '')));
  };
  return {
    g: gg, sheets, tim, user, mat, log, sk, j, mulaiShift,
    admin: sesi(user.admin, 'ADMIN', '16130.admin'),
    p13: sesi(user.p13, 'PETUGAS', '16130.y13', tim.y13, 'YANDAL'),
    p14: sesi(user.p14, 'PETUGAS', '16130.y14', tim.y14, 'YANDAL'),
    hartek: sesi(user.hartek, 'PETUGAS', '16130.h', tim.hartek, 'HARTEK'),
    baris: (nama) => sheets.g[nama].data.slice(1),
    kol: (nama, b, k) => b[sk.GUDANG_SHEET_ID[nama].indexOf(k)],
  };
}

const JENIS_UJI = { daya: '2A', merk: 'Schneider', statusMcb: 'Baru' };
const kJenis = (x, o = {}) => [x.mat.mcb, o.daya || '2A', o.merk || 'Schneider', o.statusMcb || 'Baru'].join('|');

/** siapkanGudang + jam tetap 3 Nov 2026 08:30 WIB, foto / Drive palsu, dan jalan pintas untuk tes admin. */
function dunia(opsi) {
  const x = siapkanGudang(opsi);
  x.jam = { ms: Date.parse('2026-11-03T08:30:00+07:00') };
  x.g.sekarangMsGud_ = () => x.jam.ms;
  x.is = (o = {}) => ({ materialId: x.mat.mcb, ...JENIS_UJI, ...o });
  x.tambah = (n, o = {}) => x.g.tambahStokGudang_(x.admin, { idOperasi: U(), ...x.is(), jumlah: n, ...o }, 'WEB');
  x.kirim = (timId, n, o = {}) => x.g.kirimStokTim_(x.admin, { idOperasi: U(), timId, ...x.is(), jumlah: n, ...o }, 'WEB');
  x.saldo = (lokasi) => j(x.g.saldoLokasi_(x.g.tabelGudang_('db_Material_Mutasi').rows, lokasi));
  x.fotoUji = () => ({ sha256: 'a'.repeat(64), ukuranByte: 3, data: 'AAAA' });
  x.g.bytesFotoLapangan_ = () => [1, 2, 3];
  x.drive = [];
  x.g.simpanFotoLapangan_ = (akar, bagian, penanda, nama) => {
    x.drive.push({ akar, bagian, penanda, nama });
    return { fileId: 'f' + x.drive.length, link: 'https://drive.google.com/file/d/f' + x.drive.length + '/view' };
  };
  return x;
}

const A = { daya: '2A', merk: 'Schneider', statusMcb: 'Baru' };
const banyak = (jenis, n) => Array.from({ length: n }, () => ({ ...jenis }));

/** Tim Yandal 13 punya 2 x A, shift 08:30 (shift 1 3 Nov) dan shift sebelumnya (shift 3 2 Nov) sudah tercatat di yan_Shift. */
function duniaPakai({ periksa = true } = {}) {
  const x = dunia();
  x.tambah(10); x.kirim(x.tim.y13, 2);
  x.crewBaru = [U(), U()]; x.crewLama = [U()];
  x.mulaiShift(x.tim.y13, '2026-11-03', 1, 'Y13-SHF1', x.crewBaru);
  x.mulaiShift(x.tim.y13, '2026-11-02', 3, 'Y13-SHF3', x.crewLama);
  x.periksa = (items) => x.g.simpanPemeriksaanStok_(x.p13, { item: items, foto: x.fotoUji() }, 'MOBILE');
  if (periksa) x.periksa(banyak(A, 2));
  x.pakai = (o = {}, sesi = x.p13) => x.g.simpanPemakaianMcb_(sesi, { pemakaianId: U(), ...A, nomorMeter: '14512345678', keperluan: 'Ganti MCB rusak', foto: x.fotoUji(), ...o }, 'MOBILE');
  x.susulan = (o = {}, sesi = x.p13) => x.g.simpanPemakaianSusulan_(sesi, { pemakaianId: U(), nomorMeter: '14500000001', keperluan: 'Lupa dicatat', ...o }, 'MOBILE');
  return x;
}

module.exports = { PROPS, U, j, kodeError, sheetPalsu, siapkanGudang, dunia, kJenis, JENIS_UJI, A, banyak, duniaPakai };
