/** Baca satu sheet jadi array objek berdasarkan nama header. */
function tabel_(idKey, namaSheet) {
  var id = cfg_()[idKey];
  if (!id) throw new SisiError_('CONFIG_TIDAK_LENGKAP', idKey);
  var sh = SpreadsheetApp.openById(id).getSheetByName(namaSheet);
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
  return { sheet: sh, nama: namaSheet, header: header, rows: rows };
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
