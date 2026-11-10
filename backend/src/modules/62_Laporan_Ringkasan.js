/**
 * v1.0.36 (keputusan Master Guswan 26 Okt 2026): Laporan UP3 / UIW tidak lagi menyusun data modul (ROW + Hartek + Inspeksi)
 * dari nol setiap dibuka. Hasil dataRowHari_ per tanggal disimpan di tab `lap_Ringkasan` (LAPORAN_SHEET_ID).
 *   1. Kiriman petugas (ROW / Hartek / Inspeksi Jaringan / Inspeksi Gardu) berhasil = tanggal ditandai kotor
 *      (Script Property, milidetik) + satu pemicu sekali jalan ~10 menit lagi (v1.0.38, dulu ~1 menit) bila belum ada yang menunggu (debounce).
 *   2. Pemicu menyusun tanggal kotor, menyimpan ke lap_Ringkasan, lalu menghapus dirinya. Tidak ada pemicu berkala.
 *   3. getLaporanUp3 / Uiw membaca ringkasan tersimpan. Belum ada / masih kotor / segar:true = disusun saat itu juga
 *      (cadangan bila pemicu gagal), lalu disimpan.
 *   4. getRingkasanLaporan (HP admin): laporan UP3 + UIW jendela 7 hari, hanya tanggal yang versinya berubah (offline).
 * Data bertanggal D juga mengubah komulatif bulan untuk tanggal sesudahnya: D s.d. hari ini ikut ditandai.
 *
 * v1.0.45 (keputusan Master Guswan 29 Okt 2026, kuota pemicu harian habis): kiriman petugas hanya menandai kotor, tidak lagi
 * membuat pemicu sekali jalan. Satu pemicu harian 18:00 WIB menyusun semua tanggal kotor; di luar itu tanggal kotor
 * disusun saat laporan dibuka admin (web / HP), jadi tetap terbaru tanpa memakai kuota pemicu.
 */
var LAP_RINGKAS_SHEET_ = 'lap_Ringkasan';
var LAP_RINGKAS_JSON_ = 4;           // json dipecah ke 4 sel (batas 50.000 karakter per sel)
var LAP_RINGKAS_SEL_ = 45000;
var LAP_RINGKAS_HEADER_ = ['Tanggal', 'Disusun Pada', 'Durasi (ms)', 'Sumber', 'json_1', 'json_2', 'json_3', 'json_4', 'revision'];
var LAP_KOTOR_PROP_ = 'LAP_KOTOR';
var LAP_AKTIF_PROP_ = 'LAP_RINGKAS_AKTIF';   // diisi ADMIN_siapkanRingkasanLaporan; hapus = tanda + pemicu mati
var LAP_PEMICU_FN_ = 'ADMIN_pemicuRingkasanLaporan';
var LAP_JAM_PEMICU_ = 18;   // v1.0.45: pemicu harian (WIB)
// menu tulis petugas yang datanya masuk Laporan UP3 / UIW
var LAP_MENU_SUMBER_ = ['ROW_EKSEKUSI', 'OPS_HARTEK_INPUT', 'OPS_INSJAR_INPUT', 'OPS_INSDU_INPUT'];

/* ===== tanda kotor ===== */

/** Tanggal (yyyy-MM-dd) yang disebut kiriman: isian tanggal atau kode berawalan kode header ROW / modul. Maks 500 nilai. */
function tanggalKiriman_(data, waktu) {
  var hasil = {}, n = 0;
  (function jalan(v, dalam) {
    if (n > 500 || dalam > 5 || v === null || v === undefined) return;
    if (typeof v === 'string') {
      n++;
      if (v.length > 100) return;   // isi foto base64 / teks panjang
      var t = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : tanggalDariKode_(v);
      if (t && t >= waktu.batasTgl && t <= waktu.hariIni) hasil[t] = true;
      return;
    }
    if (typeof v !== 'object') return;
    Object.keys(v).forEach(function (k) { jalan(v[k], dalam + 1); });
  })(data, 0);
  return Object.keys(hasil);
}

/** Tanggal s.d. hari ini (komulatif bulan ikut berubah), dibatasi jendela laporan. */
function rentangKotor_(tgl, waktu) {
  var o = [], d = new Date(tgl + 'T00:00:00Z');
  for (var i = 0; i < 40; i++) {
    var t = d.toISOString().slice(0, 10);
    if (t > waktu.hariIni) break;
    if (t >= waktu.batasTgl) o.push(t);
    d = new Date(d.getTime() + 864e5);
  }
  return o;
}

function bacaKotor_() {
  try { var v = JSON.parse(PropertiesService.getScriptProperties().getProperty(LAP_KOTOR_PROP_) || '[]'); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}

/** Tandai tanggal kotor (gabung dengan yang sudah ada; yang di luar jendela dibuang). */
function tandaiKotor_(tanggal, waktu) {
  var p = PropertiesService.getScriptProperties(), ada = {};
  bacaKotor_().concat(tanggal).forEach(function (t) { if (t >= waktu.batasTgl && t <= waktu.hariIni) ada[t] = true; });
  p.setProperty(LAP_KOTOR_PROP_, JSON.stringify(Object.keys(ada).sort()));
}

/**
 * Dipanggil router sesudah endpoint tulis berhasil. Bukan kiriman petugas modul laporan = diam. v1.0.45: hanya menandai
 * kotor (tanpa pemicu). Gagal di sini tidak boleh menggagalkan kiriman petugas (laporan tetap disusun saat dibuka).
 */
function catatKirimanLaporan_(ep, data) {
  if (!ep || !ep.tulis || LAP_MENU_SUMBER_.indexOf(ep.menu) === -1) return;
  try {
    if (!cfg_().LAPORAN_SHEET_ID || PropertiesService.getScriptProperties().getProperty(LAP_AKTIF_PROP_) !== 'YA') return;
    var waktu = waktuRow_(), tgl = tanggalKiriman_(data, waktu);
    if (!tgl.length) tgl = [waktu.hariIni];
    var semua = [];
    tgl.forEach(function (t) { semua = semua.concat(rentangKotor_(t, waktu)); });
    tandaiKotor_(semua, waktu);
  } catch (e) {
    try { console.warn('catatKirimanLaporan_: ' + (e.kode || e.message)); } catch (x) { /* abaikan */ }
  }
}

/* ===== simpan / baca ringkasan ===== */

/** Tab lap_Ringkasan, null = belum disiapkan (laporan tetap jalan, disusun langsung tanpa disimpan). */
function tabelRingkasan_() {
  var t;
  try { t = tabel_('LAPORAN_SHEET_ID', LAP_RINGKAS_SHEET_); } catch (e) { if (e.kode === 'SHEET_TIDAK_ADA') return null; throw e; }
  if (LAP_RINGKAS_HEADER_.some(function (h, i) { return t.header[i] !== h; })) throw new SisiError_('CONFIG_TIDAK_VALID', 'header ' + LAP_RINGKAS_SHEET_);
  return t;
}

/** Editor: buat tab lap_Ringkasan (sekali). Sudah ada = hanya dicek. */
function ADMIN_siapkanRingkasanLaporan() {
  pastikanPemilik_();
  var ss = bukaSpreadsheet_(cfg_().LAPORAN_SHEET_ID);
  if (!ss.getSheetByName(LAP_RINGKAS_SHEET_)) {
    var sh = ss.insertSheet(LAP_RINGKAS_SHEET_);
    sh.getRange(1, 1, 1, LAP_RINGKAS_HEADER_.length).setValues([LAP_RINGKAS_HEADER_]);
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    sh.setFrozenRows(1);
    console.log(LAP_RINGKAS_SHEET_ + ' dibuat.');
  }
  tabelRingkasan_();
  PropertiesService.getScriptProperties().setProperty(LAP_AKTIF_PROP_, 'YA');
  console.log(LAP_RINGKAS_SHEET_ + ' siap. Laporan UP3 / UIW memakai ringkasan tersimpan.');
}

function barisRingkasan_(t, tanggal) {
  return t.rows.filter(function (r) { return tglSel_(r.Tanggal) === tanggal; })[0] || null;
}

/** Baris tersimpan -> { row, disusunPada, revision } atau null (rusak = null, disusun ulang). */
function bacaRingkasan_(r) {
  if (!r) return null;
  var teks = '';
  for (var i = 1; i <= LAP_RINGKAS_JSON_; i++) teks += String(r['json_' + i] || '');
  try {
    var ubah = keDate_(r['Disusun Pada']);
    return { row: JSON.parse(teks), disusunPada: ubah ? ubah.toISOString() : '', revision: Number(r.revision) || 0 };
  } catch (e) { return null; }
}

/** Simpan / timpa ringkasan satu tanggal (di dalam lock). */
function simpanRingkasan_(tanggal, row, durasi, sumber) {
  var teks = JSON.stringify(row), sel = [];
  for (var i = 0; i < LAP_RINGKAS_JSON_; i++) sel.push(teks.slice(i * LAP_RINGKAS_SEL_, (i + 1) * LAP_RINGKAS_SEL_));
  if (teks.length > LAP_RINGKAS_SEL_ * LAP_RINGKAS_JSON_) throw new SisiError_('TERLALU_BESAR', LAP_RINGKAS_SHEET_ + ' ' + tanggal);
  var tulis = function () {
    var t = tabelRingkasan_(), sekarang = sekarangIso_();
    if (!t) return { disusunPada: sekarang, revision: 0 };
    var r = barisRingkasan_(t, tanggal);
    var nilai = [tanggal, sekarang, durasi, sumber].concat(sel, [r ? (Number(r.revision) || 0) + 1 : 1]);
    // teks apa adanya (json tidak diawali = / + / - / @); kolom Tanggal teks supaya tidak diubah Sheets
    if (r) t.sheet.getRange(r._baris, 1, 1, nilai.length).setValues([nilai]);
    else {
      var akhir = Math.max(t.sheet.getLastRow(), 1);
      t.sheet.getRange(akhir + 1, 1, 1, nilai.length).setValues([nilai]);
    }
    return { disusunPada: sekarang, revision: nilai[nilai.length - 1] };
  };
  // dipanggil juga dari simpanLaporan (sudah di dalam lock): lock bersarang = lock luar dilepas lebih awal
  return LOCK_AKTIF_.ya ? tulis() : denganLock_(tulis);
}

/** Susun data modul satu tanggal (bagian berat), simpan, dan buang tanda kotornya. */
function susunRingkasan_(tanggal, waktu, sumber) {
  var mulai = Date.now();
  var row = dataRowHari_({ role: 'SISTEM', userId: 'sistem' }, tanggal, waktu);
  row = JSON.parse(JSON.stringify(row));   // bentuk sama persis dengan yang dibaca ulang dari sheet
  var s = simpanRingkasan_(tanggal, row, Date.now() - mulai, sumber);
  var kotor = bacaKotor_();
  if (kotor.indexOf(tanggal) !== -1) {
    PropertiesService.getScriptProperties().setProperty(LAP_KOTOR_PROP_, JSON.stringify(kotor.filter(function (t) { return t !== tanggal; })));
  }
  return { row: row, disusunPada: s.disusunPada, revision: s.revision };
}

/**
 * Data modul untuk Laporan UP3 / UIW satu tanggal: ringkasan tersimpan bila ada dan tidak kotor, selain itu disusun.
 * Hasil { row, disusunPada, revision, dariSimpanan }.
 */
function rowHariLaporan_(tanggal, waktu, segar) {
  if (!segar && bacaKotor_().indexOf(tanggal) === -1) {
    var t = tabelRingkasan_();
    var ada = t && bacaRingkasan_(barisRingkasan_(t, tanggal));
    if (ada) { ada.dariSimpanan = true; return ada; }
  }
  var baru = susunRingkasan_(tanggal, waktu, segar ? 'SEGAR' : 'LANGSUNG');
  baru.dariSimpanan = false;
  return baru;
}

/* ===== pemicu ===== */

/** Pemicu harian 18:00 (v1.0.45): susun semua tanggal kotor (terbaru dulu). Aman dipanggil manual. */
function ADMIN_pemicuRingkasanLaporan(e) {
  pastikanPemilik_();
  return jalanPemicu_(LAP_PEMICU_FN_, e, pemicuRingkasanLaporan_);
}

/** Editor: v1.0.45 pasang pemicu harian 18:00 WIB (pemicu lama, termasuk sekali jalan per kiriman, diganti). */
function ADMIN_pasangPemicuRingkasanLaporan() {
  pastikanPemilik_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === LAP_PEMICU_FN_) ScriptApp.deleteTrigger(t); });
  PropertiesService.getScriptProperties().deleteProperty('LAP_PEMICU');   // tanda pemicu sekali jalan v1.0.36-v1.0.44
  ScriptApp.newTrigger(LAP_PEMICU_FN_).timeBased().everyDays(1).atHour(LAP_JAM_PEMICU_).nearMinute(0).inTimezone('Asia/Jakarta').create();
  console.log('Pemicu ' + LAP_PEMICU_FN_ + ' dipasang tiap hari ' + LAP_JAM_PEMICU_ + ':00 WIB (+/- 15 menit).');
}

function pemicuRingkasanLaporan_() {
  var waktu = waktuRow_(), hasil = [];
  bacaKotor_().filter(function (t) { return t >= waktu.batasTgl && t <= waktu.hariIni; }).sort().reverse().forEach(function (t) {
    try { susunRingkasan_(t, waktu, 'PEMICU'); hasil.push(t); }
    catch (e) { console.error('Ringkasan laporan ' + t + ' gagal: ' + (e.kode || e.message)); }
  });
  console.log('Ringkasan laporan disusun: ' + (hasil.join(', ') || '-'));
  return hasil;
}

/* ===== endpoint HP admin (offline) ===== */

/**
 * getRingkasanLaporan { versi: { 'yyyy-MM-dd': 'sidik' } } -> { hariIni, batasTgl, laporan: [{ tanggal, versi, berubah,
 * up3?, uiw? }] } untuk jendela 7 hari. Laporan sama persis dengan getLaporanUp3 / Uiw (sumber RINGKASAN).
 * Bagian tanpa akses menu tidak dikirim.
 */
function getRingkasanLaporan_(sesi, data) {
  peranLaporanUp3_(sesi, false);
  var d = data || {};
  Object.keys(d).forEach(function (k) { if (k !== 'versi') throw new SisiError_('FIELD_TIDAK_DIKENAL', k); });
  var versi = d.versi === undefined || d.versi === null ? {} : d.versi;
  if (typeof versi !== 'object' || Array.isArray(versi)) throw new SisiError_('TIPE_SALAH', 'versi');
  Object.keys(versi).forEach(function (k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || typeof versi[k] !== 'string' || versi[k].length > 40) throw new SisiError_('FORMAT_SALAH', 'versi');
  });
  var waktu = waktuRow_();
  var bagian = LAP_BAGIAN_.filter(function (b) { return !!aksesUntuk_(sesi.role, sesi.jenisTim, LAP_MENU_[b]); });
  if (!bagian.length) throw new SisiError_('AKSES_DITOLAK', 'OPS_LAP_UP3|OPS_LAP_UIW');
  var B = bagian.map(bagianLap_);
  var nama = [];
  B.forEach(function (b) { nama.push(b.sheet, b.c4a); });
  var T = bacaSheetLaporan_(nama);
  var hasil = [];
  for (var t = waktu.hariIni; t >= waktu.batasTgl; t = geserTglIso_(t, -1)) {
    var rh = rowHariLaporan_(t, waktu, false), o = { tanggal: t };
    B.forEach(function (b) { o[b.bagian.toLowerCase()] = susunBagian_(sesi, b, t, waktu, T, null, rh); });
    // versi = isi laporan saja (sumber LANGSUNG / RINGKASAN bukan perubahan isi)
    var v = sha256Hex_(JSON.stringify(o, function (k, x) { return k === 'sumber' ? undefined : x; })).slice(0, 16);
    hasil.push(versi[t] === v ? { tanggal: t, versi: v, berubah: false } : Object.assign({ versi: v, berubah: true }, o));
  }
  return { hariIni: waktu.hariIni, batasTgl: waktu.batasTgl, laporan: hasil };
}

function geserTglIso_(t, hari) { return new Date(new Date(t + 'T00:00:00Z').getTime() + hari * 864e5).toISOString().slice(0, 10); }
