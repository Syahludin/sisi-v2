/** Dunia uji C4A (permintaan Master Guswan 15 Nov 2026): pola konteksInsJar (backend.test.js) + db_Users, peta UIW jenis temuan, jam tetap. */
const { buatKonteks } = require('./harness');
const { sheetPalsu, PROPS } = require('./gudangUji');

const HARI_INI = '2026-11-15';

function duniaC4A({ props = {} } = {}) {
  const h = buatKonteks({ ...PROPS, INSJAR_SHEET_ID: 'i', TEMUAN_SHEET_ID: 't', KODE_ULP: '16130', UIW_UP3: 'UP3 BANGKA', ...props });
  const log = [];
  const buat = sheetPalsu(log);
  const sheets = { i: {}, t: {}, a: {}, m: {} };
  for (const [nama, hdr] of Object.entries(h.INSJAR_HEADER_)) sheets.i[nama] = buat(nama, [hdr.slice()]);
  for (const [nama, hdr] of Object.entries(h.TEMUAN_HEADER_)) sheets.t[nama] = buat(nama, [hdr.slice()]);
  sheets.a.log_Audit = buat('log_Audit', [['waktu', 'user_id', 'username', 'role', 'aksi', 'target', 'detail', 'platform', 'device_id']]);
  sheets.m.db_Users = buat('db_Users', [['user_id', 'username', 'nama', 'role', 'tim_id', 'aktif'],
    ['u-adm', '16130.admin', 'Admin Utama', 'ADMIN', '', true], ['u-adm2', '16130.admin2', 'Admin Dua', 'ADMIN', '', true]]);
  sheets.m.db_Jaringan = buat('db_Jaringan', [['section_id', 'penyulang', 'section', 'parent_section_id', 'urutan', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'],
    ['j1', 'PNY-A', 'ACR Palas - LBS Delas', '', 1, true, 1, '', ''], ['j2', 'PNY-A', 'LBS Delas - Ujung', '', 2, true, 1, '', ''],
    ['j3', 'PNY-B', 'GH Toboali', '', 1, true, 1, '', '']]);
  // jt-1 dan jt-2 sudah dipetakan ke Daftar Kategori UIW, jt-3 belum
  sheets.m.db_Jenis_Temuan = buat('db_Jenis_Temuan', [h.INSJAR_MASTER_HEADER_.db_Jenis_Temuan.slice(),
    [1, 'Isolator retak', 'Jaringan', '', 2, true, 'jt-1', 1, '', '', 'A3', 'Komponen', 'Isolator Tumpu'],
    [2, 'Pohon dekat jaringan', 'Jaringan', '', 1, true, 'jt-2', 1, '', '', 'C1', 'Pohon', 'Rabas'],
    [3, 'Bentang kendur', 'Jaringan', '', 3, true, 'jt-3', 1, '', '', '', '', '']]);
  h.SpreadsheetApp = { openById: (id) => { const bag = sheets[id]; return { getSheetByName: (n) => bag[n] || null, insertSheet: (n) => { bag[n] = buat(n, [[]]); return bag[n]; } }; } };
  const jam = { ms: Date.parse(HARI_INI + 'T09:00:00+07:00') };
  h.Date = class extends Date { constructor(...a) { if (a.length) super(...a); else super(jam.ms); } static now() { return jam.ms; } };
  // pemicu palsu: [{fn, afterMs, harian}]
  const pemicu = [];
  h.ScriptApp = {
    newTrigger: (fn) => {
      const p = { fn };
      const b = { timeBased: () => b, after: (ms) => { p.afterMs = ms; return b; }, everyDays: () => { p.harian = true; return b; }, everyMinutes: (m) => { p.menitan = m; return b; },
        atHour: (jj) => { p.jam = jj; return b; }, nearMinute: (mm) => { p.menit = mm; return b; }, inTimezone: () => b,
        create: () => { pemicu.push(p); return p; } };
      return b;
    },
    getProjectTriggers: () => pemicu.map((p) => ({ getHandlerFunction: () => p.fn, _p: p })),
    deleteTrigger: (t) => { const i = pemicu.indexOf(t._p); if (i !== -1) pemicu.splice(i, 1); },
  };
  const admin = { userId: 'u-adm', username: '16130.admin', nama: 'Admin Utama', role: 'ADMIN', jenisTim: '', timId: '', timNama: '' };
  const admin2 = { userId: 'u-adm2', username: '16130.admin2', role: 'ADMIN', jenisTim: '', timId: '', timNama: '' };
  const petugas = { userId: 'u-ins', username: '16130.insjar01', role: 'PETUGAS', jenisTim: 'INSPEKSI_JARINGAN', timId: 'tim-i1', timNama: 'INSPEKSI 01' };
  const kol = (nama) => h.TEMUAN_HEADER_[nama];
  const baris = (nama) => sheets.t[nama].data.slice(1).map((r) => Object.fromEntries(kol(nama).map((k, i) => [k, r[i]])));
  /** Ubah sel baris ke-i (0 = baris data pertama) tab SiSi_Temuan dengan objek {kolom: nilai}. */
  const ubah = (nama, i, o) => { for (const [k, v] of Object.entries(o)) sheets.t[nama].data[i + 1][kol(nama).indexOf(k)] = v; };
  const tambah = (nama, o) => sheets.t[nama].data.push(kol(nama).map((k) => (k in o ? o[k] : '')));
  // Drive palsu: file foto asli + folder Temuan_Images
  const drive = { hilang: new Set(), salinan: [], dihapus: [] };
  const fileDrive = (id) => ({ getId: () => id, getSize: () => 1000,
    makeCopy: (nama, folder) => { drive.salinan.push({ id, nama, folder: folder.id }); return fileDrive('c-' + id); },
    setTrashed: () => { drive.dihapus.push(id); } });
  h.DriveApp = {
    getFileById: (id) => { if (drive.hilang.has(id)) throw new Error('File not found: ' + id); return fileDrive(id); },
    getFolderById: (id) => ({ id,
      getFilesByName: (n) => { const ada = drive.salinan.filter((s) => s.folder === id && s.nama === n && !drive.dihapus.includes('n:' + n));
        let i = 0; return { hasNext: () => i < ada.length, next: () => { const s = ada[i++]; return { getId: () => 'c-' + s.id, setTrashed: () => drive.dihapus.push('n:' + s.nama) }; } }; } }),
  };
  let nHex = 0;
  const hex = () => (0x10000000 + nHex++).toString(16).slice(-8);
  const buka = (o = {}, sesi = admin) => h.buatLaporanC4A_(sesi, { c4aId: hex(), penyulang: 'PNY-A', section: 'ACR Palas - LBS Delas',
    koordinatAwal: '-3.0100, 106.5000', sumberAwal: 'GPS', ...o });
  const tutup = (c4aId, o = {}, sesi = admin) => h.tutupLaporanC4A_(sesi, { c4aId, koordinatAkhir: '-3.0200, 106.5100', sumberAkhir: 'GPS', ...o });
  const temuan = (c4aId, o = {}, sesi = admin) => h.simpanTemuanInspeksi_(sesi, { c4aId, uniqueid: hex(), jenisTemuanId: 'jt-1',
    koordinat: '-3.0150, 106.5050', ...o });
  return { h, sheets, log, jam, pemicu, drive, admin, admin2, petugas, kol, baris, ubah, tambah, HARI_INI, hex, buka, tutup, temuan };
}

const JUDUL = {
  Inspeksi: ['InspeksiID', 'Tanggal', 'UP3', 'ULP', 'Penyulang', 'Section', 'Petugas'],
  Temuan: ['Temuan ID', 'Inspeksi ID', 'Kategori', 'Temuan Awal', 'Foto Awal', 'Lokasi Awal', 'Keterangan Awal', 'Tindak Lanjut', 'Status', 'Foto Akhir', 'Lokasi Akhir', 'Keterangan Akhir', 'Tanggal Selesai'],
  'KMS': ['Id', 'UP3', 'ULP', 'Penyulang', 'Section', 'Panjang'],
};

/** File UIW palsu: Google Sheet sementara 'tmp' (salinan xlsx) + catatan panggilan Drive. */
/** Dunia uji file UIW: Google Sheet sementara 'tmp' (salinan xlsx) + Drive / UrlFetch palsu. */
function duniaFile({ ukuran = 1000, bisaEdit = true, folderBisa = true } = {}) {
  const x = duniaC4A({ props: { UIW_FILE_ID: 'UIWX', UIW_FOTO_FOLDER_ID: 'FOLD', FOTO_TEMUAN_FOLDER_ID: 'SISI' } });
  const log = [];
  const buat = sheetPalsu(log);
  const tmp = {};
  for (const [n, h] of Object.entries(JUDUL)) tmp[n] = buat(n, [h.slice()]);
  tmp.Inspeksi.data.push(['81701029', '2026-01-02', 'UP3', 'ULP', 'P', 'S', 'Lama']);
  tmp.Chart_Persentase = buat('Chart_Persentase', [['Label', 'Nilai'], ['Close', '=X'], ['Open', '=Y']]);
  tmp.Rekap = buat('Rekap', [['']]); // file asli UIW: sheet Rekap (kosong) terpisah dari sheet KMS
  for (const s of Object.values(tmp)) s.deleteRow = (r) => { log.push('HAPUS:' + r); s.data.splice(r - 1, 1); };
  const asliOpen = x.h.SpreadsheetApp.openById;
  x.h.SpreadsheetApp = { openById: (id) => (id === 'tmp' ? { getSheetByName: (n) => tmp[n] || null, getSheets: () => Object.keys(tmp).map((n) => ({ ...tmp[n], getName: () => n, _n: n })) } : asliOpen(id)), flush: () => {} };
  x.panggil = [];
  x.gagal = {};
  x.h.Drive = { Files: {
    get: (id) => { x.panggil.push('get:' + id); if (x.gagal.get === id) throw new Error('not found');
      return id === 'FOLD' ? { capabilities: { canAddChildren: folderBisa } } : { size: String(ukuran), capabilities: { canEdit: bisaEdit } }; },
    copy: (meta, id) => { x.panggil.push('copy:' + id + ':' + meta.mimeType); return { id: 'tmp' }; },
    update: (meta, id) => { x.panggil.push('update:' + id); if (x.gagal.update) throw new Error('upload gagal'); return { id }; },
    remove: (id) => { x.panggil.push('remove:' + id); },
  } };
  x.h.UrlFetchApp = { fetch: (url) => { x.panggil.push('ekspor'); if (x.gagal.ekspor) throw new Error('ekspor gagal'); return { getBlob: () => ({ setName: () => ({ blob: true }) }) }; } };
  x.h.ScriptApp.getOAuthToken = () => 'tok';
  x.cadangan = [];
  x.h.cadanganUiw_ = (fileId) => { x.panggil.push('cadangan:' + fileId); };
  x.tmp = tmp;
  return x;
}

/** Maps palsu: respons per panggilan, catat titik. */
function pasangMaps(x, jawab) {
  x.maps = [];
  x.h.Maps = {
    DirectionFinder: { Mode: { DRIVING: 'driving' } },
    newDirectionFinder: () => {
      const q = { singgah: [] };
      const f = { setOrigin: (lat, lng) => { q.asal = [lat, lng]; return f; }, setDestination: (lat, lng) => { q.tujuan = [lat, lng]; return f; },
        addWaypoint: (lat, lng) => { q.singgah.push([lat, lng]); return f; }, setMode: (m) => { q.mode = m; return f; },
        getDirections: () => { x.maps.push(q); return typeof jawab === 'function' ? jawab(q) : jawab; } };
      return f;
    },
  };
}
const rute = (...m) => ({ status: 'OK', routes: [{ legs: m.map((v) => ({ distance: { value: v } })) }] });

module.exports = { duniaC4A, duniaFile, pasangMaps, rute, JUDUL, HARI_INI };

