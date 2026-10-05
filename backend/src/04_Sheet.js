/**
 * Spreadsheet yang sudah dibuka dalam SATU eksekusi. openById ~600-900 ms di Apps Script,
 * jadi cukup sekali per file per request. Global Apps Script direset tiap eksekusi,
 * sehingga cache ini tidak pernah bocor ke request lain. (Literal kosong, tidak bergantung file lain.)
 */
var BUKA_SS_ = {};

function bukaSpreadsheet_(id) {
  if (!Object.prototype.hasOwnProperty.call(BUKA_SS_, id)) BUKA_SS_[id] = SpreadsheetApp.openById(id);
  return BUKA_SS_[id];
}

/** Baca satu sheet jadi array objek berdasarkan nama header. Selalu baca ulang isinya (tidak di-cache). */
function tabel_(idKey, namaSheet) {
  var id = cfg_()[idKey];
  if (!id) throw new SisiError_('CONFIG_TIDAK_LENGKAP', idKey);
  var sh = bukaSpreadsheet_(id).getSheetByName(namaSheet);
  if (!sh) throw new SisiError_('SHEET_TIDAK_ADA', namaSheet);
  var nilai = sh.getDataRange().getValues();
  if (!nilai.length) throw new SisiError_('HEADER_KOSONG', namaSheet);
  var header = nilai[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < nilai.length; i++) {
    var o = { _baris: i + 1 };
    var kosong = true;
    for (var j = 0; j < header.length; j++) {
      if (!header[j]) continue;
      o[header[j]] = nilai[i][j];
      if (nilai[i][j] !== '' && nilai[i][j] !== null) kosong = false;
    }
    if (!kosong) rows.push(o);
  }
  return { sheet: sh, nama: namaSheet, header: header, rows: rows, dalamLock: LOCK_AKTIF_.ya };
}

/**
 * Hanya baris header (1 panggilan kecil), untuk sheet yang cuma ditambah baris
 * seperti log_Audit. Jangan baca seluruh isi log hanya untuk append.
 */
function headerTabel_(idKey, namaSheet) {
  var id = cfg_()[idKey];
  if (!id) throw new SisiError_('CONFIG_TIDAK_LENGKAP', idKey);
  var sh = bukaSpreadsheet_(id).getSheetByName(namaSheet);
  if (!sh) throw new SisiError_('SHEET_TIDAK_ADA', namaSheet);
  var kolom = sh.getLastColumn();
  if (kolom < 1) throw new SisiError_('HEADER_KOSONG', namaSheet);
  var header = sh.getRange(1, 1, 1, kolom).getValues()[0].map(function (h) { return String(h).trim(); });
  return { sheet: sh, nama: namaSheet, header: header, rows: null, dalamLock: LOCK_AKTIF_.ya };
}

function barisDariObjek_(header, obj) {
  return header.map(function (h) {
    var v = obj[h];
    return v === undefined || v === null ? '' : amanSheet_(v);
  });
}

function tambahBaris_(t, obj) { t.sheet.appendRow(barisDariObjek_(t.header, obj)); }

function tambahBanyak_(t, daftar) {
  if (!daftar.length) return;
  var data = daftar.map(function (o) { return barisDariObjek_(t.header, o); });
  t.sheet.getRange(t.sheet.getLastRow() + 1, 1, data.length, t.header.length).setValues(data);
}

/**
 * Ubah sebagian kolom satu baris, dengan cek revision (optimistic concurrency).
 * Hanya kolom yang disebut yang ditulis, bukan satu baris penuh.
 * WAJIB dipanggil di dalam denganLock_().
 */
function ubahBaris_(t, kolomId, id, perubahan, revisionLama) {
  var idxId = t.header.indexOf(kolomId);
  if (idxId === -1) throw new SisiError_('KOLOM_TIDAK_ADA', kolomId);
  var kunci = Object.keys(perubahan);
  kunci.forEach(function (k) {
    if (t.header.indexOf(k) === -1) throw new SisiError_('KOLOM_TIDAK_ADA', k);
    if (k === kolomId || k === 'revision') throw new SisiError_('KOLOM_TERKUNCI', k);
  });

  var akhir = t.sheet.getLastRow();
  if (akhir < 2) throw new SisiError_('DATA_TIDAK_DITEMUKAN', id);
  var ids = t.sheet.getRange(2, idxId + 1, akhir - 1, 1).getValues();
  var baris = -1;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) !== String(id)) continue;
    if (baris !== -1) throw new SisiError_('ID_GANDA', id);
    baris = i + 2;
  }
  if (baris === -1) throw new SisiError_('DATA_TIDAK_DITEMUKAN', id);

  var idxRev = t.header.indexOf('revision');
  var revSekarang = null;
  if (idxRev !== -1) {
    revSekarang = Number(t.sheet.getRange(baris, idxRev + 1).getValue() || 0);
    if (revisionLama !== undefined && revisionLama !== null && revSekarang !== Number(revisionLama)) {
      throw new SisiError_('KONFLIK_REVISION', id);
    }
  }
  kunci.forEach(function (k) {
    t.sheet.getRange(baris, t.header.indexOf(k) + 1).setValue(amanSheet_(perubahan[k]));
  });
  if (idxRev !== -1) t.sheet.getRange(baris, idxRev + 1).setValue(revSekarang + 1);
  return revSekarang === null ? null : revSekarang + 1;
}

/**
 * Ubah baris yang SUDAH dibaca lewat tabel_() di dalam lock yang sama, tanpa membaca ulang
 * kolom ID. Membaca setelah menulis memaksa Sheets flush (~0.3-0.6 s per kali), jadi alur
 * yang sering (login, cekSesi) pakai ini. Di luar lock = tolak, pakai ubahBaris_().
 */
function ubahBarisDikenal_(t, row, perubahan) {
  if (!t.dalamLock || !LOCK_AKTIF_.ya) throw new SisiError_('HARUS_DALAM_LOCK', t.nama);
  if (!row || !row._baris) throw new SisiError_('DATA_TIDAK_DITEMUKAN', t.nama);
  Object.keys(perubahan).forEach(function (k) {
    var idx = t.header.indexOf(k);
    if (idx === -1) throw new SisiError_('KOLOM_TIDAK_ADA', k);
    if (k === 'revision' || /_id$/.test(k)) throw new SisiError_('KOLOM_TERKUNCI', k);
    t.sheet.getRange(row._baris, idx + 1).setValue(amanSheet_(perubahan[k]));
    row[k] = perubahan[k];
  });
  var idxRev = t.header.indexOf('revision');
  if (idxRev !== -1) {
    row.revision = (Number(row.revision) || 0) + 1;
    t.sheet.getRange(row._baris, idxRev + 1).setValue(row.revision);
  }
}
