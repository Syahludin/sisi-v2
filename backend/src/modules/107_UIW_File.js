/**
 * C4A (permintaan Master Guswan 15 Nov 2026): baca / tulis file Template_Inspeksi.xlsx milik UIW (UIW_FILE_ID).
 * File tetap .xlsx (dibaca AppSheet, Excel, dashboard wilayah), jadi isi file diganti utuh sekali per putaran.
 *
 * Task 0 (spike) lulus di staging 15 Nov 2026: salinan xlsx utuh (sheet lain, rumus, validasi, ID file sama); fungsi uji dihapus.
 */

/* ===== adapter (Task 7) ===== */

var UIW_BATAS_BYTE_ = 40 * 1024 * 1024;
var UIW_MIME_SHEET_ = 'application/vnd.google-apps.spreadsheet';
/** Kolom ID dipaksa teks (awalan kutip): ID 8 hex bisa terbaca angka (12345678, 1e100000) oleh Sheet / Excel. */
var UIW_KOLOM_ID_ = ['InspeksiID', 'Temuan ID', 'Inspeksi ID', 'Id'];
var UIW_CADANGAN_SIMPAN_ = 7;

/**
 * Pemeriksaan awal sekali per putaran (spec 7.4 nomor 1, 2, 3, 5). Nomor 4 (judul kolom) diperiksa tulisFileUiw_ setelah
 * file dibuka. { ok: true } atau { ok: false, bantu }.
 */
function periksaAwalUiw_() {
  var c = cfg_();
  var kurang = ['UIW_FILE_ID', 'UIW_FOTO_FOLDER_ID', 'UIW_UP3'].filter(function (k) { return !c[k]; })[0];
  if (kurang) return { ok: false, bantu: 'property ' + kurang + ' kosong' };
  var f;
  try { f = Drive.Files.get(c.UIW_FILE_ID, { fields: 'size,capabilities/canEdit', supportsAllDrives: true }); } catch (e) { f = null; }
  if (!f || !f.capabilities || !f.capabilities.canEdit) return { ok: false, bantu: 'akses file UIW' };
  var d;
  try { d = Drive.Files.get(c.UIW_FOTO_FOLDER_ID, { fields: 'capabilities/canAddChildren', supportsAllDrives: true }); } catch (e2) { d = null; }
  if (!d || !d.capabilities || !d.capabilities.canAddChildren) return { ok: false, bantu: 'akses folder foto' };
  if (Number(f.size) >= UIW_BATAS_BYTE_) return { ok: false, bantu: 'file mendekati batas' };
  return { ok: true };
}

/** Nilai sel: kolom ID diberi awalan kutip supaya tetap teks. */
function selUiw_(judul, v) {
  if (v === null || v === undefined) return '';
  return UIW_KOLOM_ID_.indexOf(judul) !== -1 && v !== '' ? "'" + String(v) : v;
}

/**
 * Tulis perubahan ke file UIW dalam SATU kali ganti isi file. perubahan = { upsert: [{sheet, nilai}], hapus: [{sheet, kunci}] }.
 * Urutan: salin xlsx jadi Google Sheet sementara -> cek judul kolom (beda = STRUKTUR_UIW_BERUBAH, file asli tidak disentuh)
 * -> upsert / hapus -> cadangan file asli -> ekspor xlsx -> perbarui isi file asli (ID tetap) -> hapus sementara (selalu).
 */
function tulisFileUiw_(perubahan) {
  var fileId = cfg_().UIW_FILE_ID;
  // isi file diganti utuh: kalau UIW mengubah file selama putaran (±1 menit), isian mereka akan tertimpa. Versi dicek sebelum ganti.
  var versi = versiFileUiw_(fileId);
  var tmp = Drive.Files.copy({ name: 'sisi_uiw_sementara', mimeType: UIW_MIME_SHEET_ }, fileId, { supportsAllDrives: true, fields: 'id' });
  try {
    var ss = SpreadsheetApp.openById(tmp.id);
    var lembar = {};
    Object.keys(UIW_KOLOM_).forEach(function (n) {
      var sh = sheetUiw_(ss, n);
      var lebar = UIW_KOLOM_[n].length;
      var judul = sh.getRange(1, 1, 1, lebar).getValues()[0].map(function (v) { return String(v === null || v === undefined ? '' : v).trim(); });
      var beda = bedaStruktur_(judul, UIW_KOLOM_[n]);
      if (beda.length) throw new SisiError_('STRUKTUR_UIW_BERUBAH', n + ': ' + beda.slice(0, 2).join('; '));
      lembar[n] = sh;
    });
    var hasil = { ditulis: 0, dihapus: 0 };
    (perubahan.upsert || []).forEach(function (u) {
      var sh = lembar[u.sheet], kol = UIW_KOLOM_[u.sheet];
      var baris = kol.map(function (k) { return selUiw_(k, u.nilai[k]); });
      var r = cariBarisUiw_(sh, u.sheet, u.nilai[UIW_KUNCI_[u.sheet]]);
      if (r) sh.getRange(r, 1, 1, kol.length).setValues([baris]);
      else sh.appendRow(baris);
      hasil.ditulis++;
    });
    (perubahan.hapus || []).forEach(function (h) {
      var r = cariBarisUiw_(lembar[h.sheet], h.sheet, h.kunci);
      if (!r) return;
      lembar[h.sheet].deleteRow(r);
      hasil.dihapus++;
    });
    SpreadsheetApp.flush();
    cadanganUiw_(fileId);
    var blob = ambilUrl_('https://docs.google.com/spreadsheets/d/' + tmp.id + '/export?format=xlsx', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
    }, 'lain').getBlob().setName('Template_Inspeksi.xlsx');
    if (versiFileUiw_(fileId) !== versi) throw new SisiError_('FILE_UIW_BERUBAH', 'file UIW diubah selama penulisan, dicoba lagi');
    Drive.Files.update({}, fileId, blob, { supportsAllDrives: true });
    return hasil;
  } finally {
    try { Drive.Files.remove(tmp.id, { supportsAllDrives: true }); } catch (e) { console.warn('UIW: gagal hapus sementara ' + tmp.id); }
  }
}

/** Nomor versi file Drive (naik tiap isi / metadata berubah). */
function versiFileUiw_(fileId) {
  var f = Drive.Files.get(fileId, { fields: 'version', supportsAllDrives: true });
  return String(f && f.version || '');
}

/**
 * Sheet UIW [nama]. Nama di file boleh beda spasi / karakter tak kasatmata / huruf besar (hasil konversi xlsx atau ketikan UIW).
 * Tidak ada = STRUKTUR_UIW_BERUBAH berisi daftar sheet di file (untuk UIW_STATUS_FILE).
 */
function sheetUiw_(ss, nama) {
  var sh = ss.getSheetByName(nama);
  if (sh) return sh;
  // hanya huruf + angka dibandingkan (spasi, NBSP, karakter tak kasatmata, huruf besar diabaikan)
  var rapi = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); };
  var semua = ss.getSheets().map(function (s) { return s.getName(); });
  var cocok = semua.filter(function (s) { return rapi(s) === rapi(nama); })[0];
  if (cocok !== undefined) return ss.getSheetByName(cocok);
  throw new SisiError_('STRUKTUR_UIW_BERUBAH', nama + ': sheet tidak ada (sheet di file: ' + JSON.stringify(semua) + ')');
}

/** Nomor baris (1-based) kunci di kolom pertama sheet UIW, atau 0. */
function cariBarisUiw_(sh, nama, kunci) {
  var k = String(kunci === null || kunci === undefined ? '' : kunci).trim();
  if (!k) return 0;
  var akhir = sh.getLastRow();
  if (akhir < 2) return 0;
  var col = UIW_KOLOM_[nama].indexOf(UIW_KUNCI_[nama]) + 1;
  var v = sh.getRange(2, col, akhir - 1, 1).getValues();
  for (var i = 0; i < v.length; i++) if (String(v[i][0]).trim() === k) return i + 2;
  return 0;
}

/** Cadangan file asli sebelum diganti: folder FOTO_TEMUAN_FOLDER_ID / Cadangan UIW, simpan 7 terbaru. */
function cadanganUiw_(fileId) {
  var akar = DriveApp.getFolderById(cfg_().FOTO_TEMUAN_FOLDER_ID || cfg_().UIW_FOTO_FOLDER_ID);
  var it = akar.getFoldersByName('Cadangan UIW');
  var folder = it.hasNext() ? it.next() : akar.createFolder('Cadangan UIW');
  DriveApp.getFileById(fileId).makeCopy('Template_Inspeksi ' + new Date().toISOString().replace(/[:.]/g, '-') + '.xlsx', folder);
  var semua = [];
  var f = folder.getFiles();
  while (f.hasNext()) semua.push(f.next());
  semua.sort(function (a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime(); });
  semua.slice(UIW_CADANGAN_SIMPAN_).forEach(function (x) { x.setTrashed(true); });
}

/** Salin foto asli ke folder Temuan_Images UIW dengan [nama] (tanpa awalan folder). Sudah ada = dilewati. */
function salinFotoUiw_(fileIdAsal, nama) {
  var folder = DriveApp.getFolderById(cfg_().UIW_FOTO_FOLDER_ID);
  if (folder.getFilesByName(nama).hasNext()) return false;
  DriveApp.getFileById(fileIdAsal).makeCopy(nama, folder);
  return true;
}

/** Buang foto [nama] di Temuan_Images ke sampah (temuan dihapus). */
function hapusFotoUiw_(nama) {
  if (!nama) return;
  var it = DriveApp.getFolderById(cfg_().UIW_FOTO_FOLDER_ID).getFilesByName(nama);
  while (it.hasNext()) it.next().setTrashed(true);
}
