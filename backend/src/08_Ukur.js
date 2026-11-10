/**
 * Langkah 0 optimasi kecepatan (permintaan Master Guswan 6 Nov 2026, uji 1 minggu): lama setiap permintaan doPost / rpc per aksi +
 * platform, supaya menu yang lambat terbukti dengan angka sebelum ada yang dioptimasi.
 *   - Per permintaan: SATU get + SATU put CacheService (tanpa Sheet, Script Properties, atau lock), digabung per jam WIB.
 *     Tidak mencatat siapa / isi data: hanya nama aksi (dari daftar endpoint), platform, lama, ukuran jawaban, kode gagal.
 *   - Pemantau tiap jam (ADMIN_pantauPemakaian) memindah jam yang sudah lewat ke tab log_Ukur (SiSi_Auth), satu baris per
 *     jam + aksi + platform. ADMIN_pindahUkur = pindah sekarang dari editor.
 * Angka = perkiraan:
 *   - get + put tidak atomik: dua permintaan di slot yang sama pada saat bersamaan = satu hilang (slot acak 1 dari 40).
 *   - Lama = dari doPost / rpc mulai sampai jawaban siap. Waktu Apps Script menyalakan eksekusi, redirect 302, dan jaringan
 *     TIDAK terhitung, jadi yang dirasakan pengguna lebih lama. Baca web yang dijawab API MySQL tidak lewat sini.
 *   - p50 / p95 = batas atas kelompok waktu (UKUR_KELOMPOK_MS_), tidak melebihi maks.
 *   - Biaya Catat = get cache + gabung (put tidak terukur): beban pengukuran itu sendiri.
 *   - Cache Apps Script maks 6 jam: pemantau tidak jalan lebih dari 5 jam = jam itu hilang.
 */
var UKUR_SLOT_ = 40;
var UKUR_DETIK_ = 21600;
var UKUR_MUNDUR_JAM_ = 5;
var UKUR_KELOMPOK_MS_ = [250, 500, 1000, 2000, 3000, 5000, 8000, 13000, 20000, 30000, 60000];   // + satu kelompok > 60 dtk
var UKUR_KODE_MAKS_ = 8;
var UKUR_PROP_ = 'UKUR_TERAKHIR';   // jam terakhir yang sudah dipindah (yyyyMMddHH)
var UKUR_SHEET_ = 'log_Ukur';
var UKUR_HEADER_ = ['Jam', 'Aksi', 'Platform', 'Jumlah', 'Rata (ms)', 'p50 (ms)', 'p95 (ms)', 'Maks (ms)', 'Dari Cache', 'Gagal',
  'Kode Gagal', 'Rata (KB)', 'Maks (KB)', 'Biaya Catat (ms)'];
var UKUR_AKSI_ASING_ = '(tidak dikenal)';

/** Jam WIB (UTC+7, tanpa musim panas) sebagai yyyyMMddHH. Murni. */
function jamUkur_(ms) { return new Date(ms + 7 * 36e5).toISOString().slice(0, 13).replace(/[-T]/g, ''); }

function kunciUkur_(jam, slot) { return 'ukur:v1:' + jam + ':' + slot; }

/** Nama aksi yang dicatat: hanya nama endpoint terdaftar, selain itu satu nama tetap (kunci cache tidak bisa dicemari). */
function aksiUkur_(nama) {
  return typeof nama === 'string' && Object.prototype.hasOwnProperty.call(endpoints_(), nama) ? nama : UKUR_AKSI_ASING_;
}

function entriUkur_() { return { n: 0, t: 0, x: 0, c: 0, g: 0, b: 0, bx: 0, u: 0, h: [], k: {} }; }

/** Tambah satu permintaan ke catatan slot o (diubah). Hasil = entri aksi itu. */
function tambahUkur_(o, kunci, ms, hasil, byte) {
  var e = o[kunci] && typeof o[kunci] === 'object' ? o[kunci] : (o[kunci] = entriUkur_());
  var i = 0;
  while (i < UKUR_KELOMPOK_MS_.length && ms > UKUR_KELOMPOK_MS_[i]) i++;
  e.h[i] = (Number(e.h[i]) || 0) + 1;
  e.n++; e.t += ms; e.x = Math.max(e.x, ms);
  if (hasil && hasil.cache === true) e.c++;
  if (!hasil || hasil.ok !== true) {
    e.g++;
    var kode = hasil && typeof hasil.kode === 'string' && /^[A-Z][A-Z0-9_]{0,39}$/.test(hasil.kode) ? hasil.kode : 'LAIN';
    if (!Object.prototype.hasOwnProperty.call(e.k, kode) && Object.keys(e.k).length >= UKUR_KODE_MAKS_) kode = 'LAIN';
    e.k[kode] = (Number(e.k[kode]) || 0) + 1;
  }
  byte = Number(byte) || 0;
  e.b += byte; e.bx = Math.max(e.bx, byte);
  return e;
}

/**
 * Router (doPost / rpc), sesudah jawaban siap. Tidak pernah melempar: pengukuran tidak boleh mengganggu jawaban.
 * hasil = amplop jawaban ({ ok, kode?, cache? }), byte = panjang jawaban (0 = tidak diketahui).
 */
function catatUkur_(nama, platform, mulaiMs, hasil, byte) {
  try {
    var akhir = Date.now(), cache = CacheService.getScriptCache();
    var kunci = kunciUkur_(jamUkur_(akhir), Math.floor(Math.random() * UKUR_SLOT_));
    var o = null;
    try { o = JSON.parse(cache.get(kunci) || '{}'); } catch (eJ) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
    var e = tambahUkur_(o, aksiUkur_(nama) + '|' + (platform === 'WEB' ? 'WEB' : 'MOBILE'), Math.max(0, akhir - mulaiMs), hasil, byte);
    e.u += Date.now() - akhir;
    cache.put(kunci, JSON.stringify(o), UKUR_DETIK_);
  } catch (e) { /* cache penuh / mati: permintaan ini tidak tercatat */ }
}

/** Gabung catatan slot b ke a (diubah). Murni selain a. */
function gabungUkur_(a, b) {
  Object.keys(b || {}).forEach(function (k) {
    var y = b[k];
    if (!y || typeof y !== 'object') return;
    var x = a[k] || (a[k] = entriUkur_());
    ['n', 't', 'c', 'g', 'b', 'u'].forEach(function (f) { x[f] += Number(y[f]) || 0; });
    x.x = Math.max(x.x, Number(y.x) || 0);
    x.bx = Math.max(x.bx, Number(y.bx) || 0);
    (Array.isArray(y.h) ? y.h : []).forEach(function (v, i) { x.h[i] = (Number(x.h[i]) || 0) + (Number(v) || 0); });
    Object.keys(y.k || {}).forEach(function (kd) { x.k[kd] = (Number(x.k[kd]) || 0) + (Number(y.k[kd]) || 0); });
  });
  return a;
}

/** Persentil p (0..1) dari kelompok waktu: batas atas kelompok yang memuat urutan itu, tidak melebihi maks. Murni. */
function persenUkur_(e, p) {
  var target = Math.ceil(e.n * p), jalan = 0;
  for (var i = 0; i < UKUR_KELOMPOK_MS_.length; i++) {
    jalan += Number(e.h[i]) || 0;
    if (jalan >= target) return Math.min(UKUR_KELOMPOK_MS_[i], e.x);
  }
  return e.x;
}

/** Baris log_Ukur satu jam, beban terbesar (jumlah x rata) dulu. Murni. */
function barisUkur_(jam, gabung) {
  var label = jam.slice(0, 4) + '-' + jam.slice(4, 6) + '-' + jam.slice(6, 8) + ' ' + jam.slice(8, 10) + ':00';
  return Object.keys(gabung).filter(function (k) { return gabung[k].n > 0; })
    .sort(function (a, b) { return gabung[b].t - gabung[a].t || (a < b ? -1 : 1); })
    .map(function (k) {
      var e = gabung[k], i = k.lastIndexOf('|');
      var kode = Object.keys(e.k).sort(function (a, b) { return e.k[b] - e.k[a] || (a < b ? -1 : 1); })
        .map(function (kd) { return kd + ' x' + e.k[kd]; }).join(', ');
      return { Jam: label, Aksi: k.slice(0, i), Platform: k.slice(i + 1), Jumlah: e.n, 'Rata (ms)': Math.round(e.t / e.n),
        'p50 (ms)': persenUkur_(e, 0.5), 'p95 (ms)': persenUkur_(e, 0.95), 'Maks (ms)': e.x, 'Dari Cache': e.c, Gagal: e.g,
        'Kode Gagal': kode, 'Rata (KB)': bulat_(e.b / e.n / 1024, 1), 'Maks (KB)': bulat_(e.bx / 1024, 1),
        'Biaya Catat (ms)': bulat_(e.u / e.n, 1) };
    });
}

/** Tab log_Ukur di SiSi_Auth (dibuat bila belum ada). Header diubah orang = STRUKTUR_BERUBAH (tidak menulis ke kolom salah). */
function tabelUkur_() {
  var ss = bukaSpreadsheet_(cfg_().AUTH_SHEET_ID);
  if (!ss.getSheetByName(UKUR_SHEET_)) ss.insertSheet(UKUR_SHEET_).getRange(1, 1, 1, UKUR_HEADER_.length).setValues([UKUR_HEADER_]);
  var t = headerTabel_('AUTH_SHEET_ID', UKUR_SHEET_);
  var beda = bedaStruktur_(t.header.slice(0, UKUR_HEADER_.length), UKUR_HEADER_);
  if (beda.length) throw new SisiError_('STRUKTUR_BERUBAH', UKUR_SHEET_ + ' ' + beda.slice(0, 3).join('; '));
  return t;
}

/** Satu jam: gabung 40 slot, tulis ke log_Ukur + UKUR_TERAKHIR dalam lock, lalu buang cache-nya. Hasil = jumlah baris, -1 = dilewati. */
function pindahJamUkur_(jam, cache, p) {
  var kunci = [];
  for (var s = 0; s < UKUR_SLOT_; s++) kunci.push(kunciUkur_(jam, s));
  var isi = cache.getAll ? cache.getAll(kunci) : kunci.reduce(function (o, k) { o[k] = cache.get(k); return o; }, {});
  var gabung = {};
  kunci.forEach(function (k) {
    if (!isi[k]) return;
    try { gabungUkur_(gabung, JSON.parse(isi[k])); } catch (e) { /* slot rusak: dilewati */ }
  });
  var baris = barisUkur_(jam, gabung);
  if (!baris.length) return -1;   // jam kosong: tidak menulis apa pun
  var ditulis = denganLock_(function () {
    if (jam <= String(p.getProperty(UKUR_PROP_) || '')) return false;   // pemicu + editor bersamaan
    tambahBanyak_(tabelUkur_(), baris);
    p.setProperty(UKUR_PROP_, jam);
    return true;
  }, 30000);
  if (!ditulis) return -1;
  cache.removeAll(kunci);
  return baris.length;
}

/**
 * Pindah jam yang sudah lewat (maks UKUR_MUNDUR_JAM_ ke belakang, sesudah UKUR_TERAKHIR) dari cache ke log_Ukur.
 * Jam berjalan tidak pernah dipindah. Hasil { jam: [yyyyMMddHH yang ditulis], baris }.
 */
function pindahUkur_(sekarangMs) {
  var cache = CacheService.getScriptCache(), p = PropertiesService.getScriptProperties();
  var jamIni = jamUkur_(sekarangMs), hasil = { jam: [], baris: 0 };
  for (var i = UKUR_MUNDUR_JAM_; i >= 1; i--) {
    var jam = jamUkur_(sekarangMs - i * 36e5);
    if (jam >= jamIni || jam <= String(p.getProperty(UKUR_PROP_) || '')) continue;
    var n = pindahJamUkur_(jam, cache, p);
    if (n < 0) continue;
    hasil.jam.push(jam);
    hasil.baris += n;
  }
  return hasil;
}

/** Editor: pindah ukur jam yang sudah lewat sekarang, tanpa menunggu pemantau tiap jam. */
function ADMIN_pindahUkur() {
  pastikanPemilik_();
  var h = pindahUkur_(Date.now());
  console.log('Ukur ke log_Ukur: ' + (h.jam.join(', ') || '-') + ' (' + h.baris + ' baris). Jam berjalan dipindah sesudah jam berganti.');
}
