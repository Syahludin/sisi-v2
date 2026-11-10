/**
 * Spreadsheet yang sudah dibuka dalam SATU eksekusi. openById ~600-900 ms di Apps Script,
 * jadi cukup sekali per file per request. Global Apps Script direset tiap eksekusi,
 * sehingga cache ini tidak pernah bocor ke request lain. (Literal kosong, tidak bergantung file lain.)
 */
var BUKA_SS_ = {};

function bukaSpreadsheet_(id) {
  if (!id) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'SHEET_ID');
  if (!Object.prototype.hasOwnProperty.call(BUKA_SS_, id)) {
    try {
      BUKA_SS_[id] = SpreadsheetApp.openById(id);
    } catch (e) {
      if (e && e.kode) throw e;
      throw new SisiError_('CONFIG_TIDAK_VALID', 'Spreadsheet tidak bisa dibuka');
    }
  }
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
 * v1.0.58: tab berkolom timestamp_update selalu dicap waktu server saat baris diubah (selisih daftar WO membacanya).
 * Pemanggil yang mengisi timestamp_update sendiri tetap menang. Mengembalikan salinan; argumen tidak diubah.
 */
function capWaktuUbah_(t, perubahan) {
  if (t.header.indexOf('timestamp_update') === -1 || Object.prototype.hasOwnProperty.call(perubahan, 'timestamp_update')) return perubahan;
  return Object.assign({}, perubahan, { timestamp_update: sekarangIso_() });
}

/**
 * Ubah sebagian kolom satu baris, dengan cek revision (optimistic concurrency).
 * Hanya kolom yang disebut yang ditulis, bukan satu baris penuh.
 * WAJIB dipanggil di dalam denganLock_().
 */
function ubahBaris_(t, kolomId, id, perubahan, revisionLama) {
  perubahan = capWaktuUbah_(t, perubahan);
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
 * v0.62.9 (Laporan UP3 / UIW): tulis beberapa perubahan baris + baris baru satu sheet dalam SATU setValues.
 * Blok = dari baris ubah teratas s.d. baris baru terakhir, dibaca ulang dulu (dalam lock) supaya sel yang tidak
 * diubah ditulis kembali apa adanya. Satu panggilan tulis = masuk semua atau tidak sama sekali, beda dengan
 * ubahBarisDikenal_ yang menulis sel per sel (gagal di tengah = setengah jadi).
 * ubah = [{ r, u }] (r = baris dari tabel_ yang sama, u = kolom baru); revision baris ubah +1; kolom *_id & revision terkunci.
 * baru = objek baris lengkap (ditambah di bawah). WAJIB dipanggil di dalam denganLock_().
 */
function tulisBlok_(t, ubah, baru, opsi) {
  // v0.66.4: opsi.bolehId = kolom *_id REFERENSI yang boleh diubah (mis. section_id P0); id baris tetap terkunci.
  var bolehId = (opsi && opsi.bolehId) || [];
  if (!t.dalamLock || !LOCK_AKTIF_.ya) throw new SisiError_('HARUS_DALAM_LOCK', t.nama);
  ubah = ubah || []; baru = baru || [];
  if (!ubah.length && !baru.length) return;
  var lebar = t.header.length, akhir = Math.max(t.sheet.getLastRow(), 1);
  var idxRev = t.header.indexOf('revision');
  ubah = ubah.map(function (x) { return { r: x.r, u: capWaktuUbah_(t, x.u) }; });
  ubah.forEach(function (x) {
    if (!x.r || !x.r._baris || x.r._baris < 2 || x.r._baris > akhir) throw new SisiError_('DATA_TIDAK_DITEMUKAN', t.nama);
    Object.keys(x.u).forEach(function (k) {
      if (t.header.indexOf(k) === -1) throw new SisiError_('KOLOM_TIDAK_ADA', k);
      if (k === 'revision' || (/_id$/.test(k) && bolehId.indexOf(k) === -1)) throw new SisiError_('KOLOM_TERKUNCI', k);
    });
  });
  var mulai = ubah.length ? Math.min.apply(null, ubah.map(function (x) { return x.r._baris; })) : akhir + 1;
  var lama = mulai <= akhir ? t.sheet.getRange(mulai, 1, akhir - mulai + 1, lebar).getValues() : [];
  var data = lama.map(function (b) { return b.map(amanSheet_); });
  ubah.forEach(function (x) {
    var b = data[x.r._baris - mulai];
    // baris di sheet harus baris yang sama dengan yang dibaca (semua kolom *_id sama)
    t.header.forEach(function (h, i) {
      if (/_id$/.test(h) && String(lama[x.r._baris - mulai][i]) !== String(x.r[h] === undefined ? '' : x.r[h])) {
        throw new SisiError_('DATA_BERUBAH', t.nama + ' baris ' + x.r._baris);
      }
    });
    Object.keys(x.u).forEach(function (k) { b[t.header.indexOf(k)] = amanSheet_(x.u[k]); });
    if (idxRev !== -1) b[idxRev] = (Number(x.r.revision) || 0) + 1;
  });
  baru.forEach(function (o) { data.push(barisDariObjek_(t.header, o)); });
  t.sheet.getRange(mulai, 1, data.length, lebar).setValues(data);
  // memori diperbarui hanya setelah tulis berhasil
  ubah.forEach(function (x) {
    Object.keys(x.u).forEach(function (k) { x.r[k] = x.u[k]; });
    if (idxRev !== -1) x.r.revision = (Number(x.r.revision) || 0) + 1;
  });
  baru.forEach(function (o, i) { o._baris = akhir + 1 + i; });
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
