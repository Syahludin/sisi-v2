/**
 * C4A (permintaan Master Guswan 15 Nov 2026): pemicu + putaran sinkron ke file UIW. Pola 35_Gardu_HI.js (jadwalkanSheetLamaHi_):
 * simpan yang mengubah data UIW memasang SATU pemicu sekali jalan ±2 menit lagi (simpan beruntun = satu putaran),
 * putaran menjadwalkan dirinya lagi selama antrean masih bersisa. Tanpa data = tanpa putaran (hemat kuota pemicu).
 * Pemicu berkala setiap 5 menit (ADMIN_pemicuHarianC4A, nama lama dipertahankan; diubah 15 Nov 2026 atas permintaan Master Guswan):
 * tutup otomatis laporan hari lalu + putaran sinkron langsung, hasilnya dicatat di log eksekusi.
 */

var UIW_PEMICU_FN_ = 'ADMIN_pemicuSinkronUiw';
var UIW_PEMICU_HARIAN_FN_ = 'ADMIN_pemicuHarianC4A';
var UIW_PEMICU_PROP_ = 'UIW_PEMICU';
var UIW_KOTOR_PROP_ = 'UIW_KOTOR';   // waktu perubahan data terakhir yang belum dikirim
var UIW_SAPU_PROP_ = 'UIW_SAPU';     // waktu sapuan penuh terakhir
var UIW_SAPU_MS_ = 60 * 60000;       // sapuan penuh tiap 60 menit: menangkap perbaikan manual (pemetaan jenis, isi sheet) tanpa tanda
var UIW_PEMICU_MS_ = 120000;
var UIW_PEMICU_BASI_MS_ = 10 * 60000;
var UIW_BATAS_PUTARAN_MS_ = 270000;   // 4,5 menit (batas eksekusi Apps Script ±6 menit)
var UIW_JEDA_FILE_MS_ = 3600000;      // file / folder bermasalah: coba lagi 60 menit
var UIW_JEDA_MENUNGGU_MS_ = 900000;   // foto belum terunggah: cek lagi 15 menit
var UIW_STATUS_SELESAI_ = ['TERKIRIM', 'TERHAPUS'];

/** Satu pemicu sekali jalan [jedaMs] lagi (bawaan 2 menit), kecuali sudah ada yang menunggu. true = baru dipasang. */
function jadwalkanSinkronUiw_(jedaMs) {
  var p = PropertiesService.getScriptProperties(), tanda = Number(p.getProperty(UIW_PEMICU_PROP_)) || 0;
  // setiap perubahan data UIW (simpan / tutup / ubah temuan, WO selesai, tutup otomatis) menandai "ada yang perlu dikirim":
  // pemicu 5 menit tidak membaca sheet apa pun selama tanda ini kosong (lihat harianC4A_)
  p.setProperty(UIW_KOTOR_PROP_, String(Date.now()));
  if (tanda && Date.now() - tanda < UIW_PEMICU_BASI_MS_) return false;
  hapusPemicuSinkronUiw_();
  ScriptApp.newTrigger(UIW_PEMICU_FN_).timeBased().after(jedaMs || UIW_PEMICU_MS_).create();
  p.setProperty(UIW_PEMICU_PROP_, String(Date.now()));
  return true;
}

function hapusPemicuSinkronUiw_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === UIW_PEMICU_FN_) ScriptApp.deleteTrigger(t); });
}

function ADMIN_pemicuSinkronUiw(e) {
  pastikanPemilik_();
  return jalanPemicu_(UIW_PEMICU_FN_, e, function () { return putaranSinkronUiw_(false); });
}

function ADMIN_pemicuHarianC4A(e) {
  pastikanPemilik_();
  return jalanPemicu_(UIW_PEMICU_HARIAN_FN_, e, harianC4A_);
}

/** Pasang pemicu berkala setiap 5 menit. Aman dijalankan ulang (pemicu lama, termasuk harian 00.05, diganti). */
function ADMIN_pasangPemicuC4A() {
  pastikanPemilik_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === UIW_PEMICU_HARIAN_FN_) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger(UIW_PEMICU_HARIAN_FN_).timeBased().everyMinutes(5).create();
  console.log('Pemicu C4A dipasang (setiap 5 menit).');
}

/**
 * Pemicu 5 menit: tutup otomatis (hanya membaca c4a_laporan yang kecil), lalu putaran sinkron HANYA bila ada tanda perubahan (UIW_KOTOR)
 * atau sapuan penuh tiap 60 menit (UIW_SAPU: baris PERLU_DATA dicek ulang, perbaikan manual terbaca). Tanpa keduanya pemicu ini tidak
 * membaca satu sheet data pun (dulu tiap 5 menit membaca semua temuan + tindak lanjut + master). Baris yang gagal / menunggu foto punya
 * pemicu susulan sendiri (jadwalUlangUiw_), jadi tidak bergantung pada pemicu ini. Hasil dicatat di log.
 */
function harianC4A_() {
  var p = PropertiesService.getScriptProperties();
  var n = tutupOtomatisC4A_();
  var kotor = p.getProperty(UIW_KOTOR_PROP_), sapu = Number(p.getProperty(UIW_SAPU_PROP_)) || 0;
  var penuh = Date.now() - sapu >= UIW_SAPU_MS_;
  var hasil = { ditutup: n, putaran: { status: 'LEWAT' } };
  if (kotor || penuh) {
    if (penuh) p.setProperty(UIW_SAPU_PROP_, String(Date.now()));
    hasil.putaran = putaranSinkronUiw_(penuh);
    // tanda dihapus hanya bila tidak berubah selama putaran (perubahan baru selama putaran tetap menandai)
    if (kotor && p.getProperty(UIW_KOTOR_PROP_) === kotor && hasil.putaran.status === 'OK') p.deleteProperty(UIW_KOTOR_PROP_);
  }
  console.log(JSON.stringify(hasil));
  return hasil;
}

function angkaPropUiw_(p, k, bawaan) { var v = Number(p.getProperty(k)); return v > 0 ? v : bawaan; }

/**
 * Giliran putaran (review 15 Nov 2026): putaran bisa ±4,5 menit (Maps, salin foto, ganti isi file), jadi TIDAK memegang ScriptLock
 * sepanjang jalan (semua simpan di semua modul akan tertahan = SERVER_SIBUK). uiw_antrean hanya ditulis putaran, jadi cukup satu
 * putaran pada satu waktu (denganGiliran_). Basi 7 menit (> batas eksekusi Apps Script).
 */
var UIW_GILIRAN_PROP_ = 'UIW_PUTARAN_JALAN';
var UIW_GILIRAN_BASI_MS_ = 7 * 60000;

/**
 * Satu putaran sinkron (spec 7.4 + 7.5): segarkan antrean, hitung jarak, periksa awal file, proses baris dengan batas waktu,
 * tulis file SEKALI, tandai status, jadwalkan putaran berikutnya bila ada sisa. Satu putaran pada satu waktu (lain jalan = jadwal ulang).
 */
function putaranSinkronUiw_(penuh) {
  hapusPemicuSinkronUiw_();
  var p = PropertiesService.getScriptProperties();
  p.deleteProperty(UIW_PEMICU_PROP_);
  try {
    return denganGiliran_(UIW_GILIRAN_PROP_, UIW_GILIRAN_BASI_MS_, function () { return putaranDalamUiw_(p, penuh !== false); });
  } catch (e) {
    if (e && e.kode === 'SERVER_SIBUK' && (e.detail === UIW_GILIRAN_PROP_ || !e.detail)) { jadwalkanSinkronUiw_(); return { status: 'SIBUK' }; }
    throw e;
  }
}

function putaranDalamUiw_(p, penuh) {
  var mulai = Date.now(), batas = mulai + UIW_BATAS_PUTARAN_MS_;
  var durTulis = angkaPropUiw_(p, 'UIW_DURASI_TULIS_MS', 60000), durBaris = angkaPropUiw_(p, 'UIW_DURASI_BARIS_MS', 3000);
  var pesanan = durTulis * 1.5;
  var ctx = bacaKonteksUiw_();
  ctx.penuh = penuh !== false;   // false = baris TERKIRIM yang sumbernya tidak berubah tidak dihitung ulang sidiknya
  segarkanAntreanUiw_(ctx);
  prosesJarakC4A_(ctx, batas - pesanan);
  var hasil = { status: 'OK', ditulis: 0, dihapus: 0, sisa: 0, alasanSisa: '', bantuFile: '', proses: [] };
  var catat = function (r, st, bantu) { hasil.proses.push(r.jenis + ' ' + r.kunci + ': ' + st + (bantu ? ' (' + bantu + ')' : '')); };
  var an = ctx.an, sekarang = Date.now();
  var calon = an.rows.filter(function (r) {
    return UIW_STATUS_SELESAI_.indexOf(String(r.status)) === -1 && (!r.coba_lagi_setelah || msUiw_(r.coba_lagi_setelah) <= sekarang);
  }).sort(function (a, b) { return (msUiw_(a.waktu_coba) - msUiw_(b.waktu_coba)) || (Number(a.nomor) - Number(b.nomor)); });
  // pemicu 5 menit tanpa antrean: tidak perlu memeriksa file / folder di Drive
  if (!calon.length) return hasil;
  var awal = periksaAwalUiw_();
  if (!awal.ok) return gagalFileUiw_(p, hasil, awal.bantu);
  p.deleteProperty('UIW_STATUS_FILE');
  var lolos = [], adaGagal = false, tungguFoto = false, waktuHabis = false, mulaiBaris = Date.now(), nBaris = 0;
  for (var i = 0; i < calon.length; i++) {
    if (batas - Date.now() <= pesanan + durBaris) { waktuHabis = true; hasil.sisa = calon.length - i; break; }
    var r = calon[i];
    nBaris++;
    if (String(r.status) === 'HAPUS') { lolos.push({ r: r, hapus: true }); continue; }
    var b = barisUiw_(r, ctx);
    if (!b.ok) {
      ubahAntreanUiw_(an, r, { status: b.status, bantu: b.bantu, waktu_coba: sekarangIso_() });
      catat(r, b.status, b.bantu);
      if (b.status === 'MENUNGGU' && b.bantu === 'foto belum terunggah') tungguFoto = true;
      continue;
    }
    var galatFoto = salinSemuaFotoUiw_(b.foto);
    if (galatFoto) { tandaGagalUiw_(an, r, galatFoto); catat(r, 'GAGAL', galatFoto); adaGagal = true; continue; }
    lolos.push({ r: r, b: b });
  }
  if (nBaris) p.setProperty('UIW_DURASI_BARIS_MS', String(Math.round(durBaris * 0.7 + (Date.now() - mulaiBaris) / nBaris * 0.3)));
  if (lolos.length) {
    var mulaiTulis = Date.now(), tulis;
    try {
      tulis = tulisFileUiw_({
        upsert: lolos.filter(function (x) { return x.b; }).map(function (x) { return { sheet: x.b.sheet, nilai: x.b.nilai }; }),
        hapus: lolos.filter(function (x) { return x.hapus; }).map(function (x) { return { sheet: UIW_SHEET_JENIS_[x.r.jenis], kunci: x.r.kunci }; })
      });
    } catch (e) {
      if (e && e.kode === 'STRUKTUR_UIW_BERUBAH') return gagalFileUiw_(p, hasil, 'struktur file UIW berubah: ' + e.detail);
      var pesan = 'tulis file: ' + String(e && e.message || e).slice(0, 200);
      lolos.forEach(function (x) { tandaGagalUiw_(an, x.r, pesan); catat(x.r, 'GAGAL', pesan); });
      hasil.alasanSisa = 'GAGAL';
      hasil.sisa += lolos.length;
      jadwalUlangUiw_(an, false, tungguFoto, true);
      return hasil;
    }
    p.setProperty('UIW_DURASI_TULIS_MS', String(Math.round(durTulis * 0.7 + (Date.now() - mulaiTulis) * 0.3)));
    lolos.forEach(function (x) { tandaSelesaiUiw_(an, x, ctx); catat(x.r, x.hapus ? 'TERHAPUS' : 'TERKIRIM'); });
    hasil.ditulis = tulis.ditulis;
    hasil.dihapus = tulis.dihapus;
  }
  if (waktuHabis) hasil.alasanSisa = 'WAKTU';
  else if (adaGagal) hasil.alasanSisa = 'GAGAL';
  jadwalUlangUiw_(an, waktuHabis, tungguFoto, adaGagal);
  return hasil;
}

/** Salin semua foto baris ke Temuan_Images. Hasil = pesan galat pertama, atau ''. */
function salinSemuaFotoUiw_(foto) {
  for (var i = 0; i < foto.length; i++) {
    try { salinFotoUiw_(foto[i].fileId, foto[i].nama); } catch (e) { return 'salin foto: ' + String(e && e.message || e).slice(0, 200); }
  }
  return '';
}

/** Sesudah file berhasil ditulis: HAPUS -> buang foto + TERHAPUS; lainnya -> TERKIRIM + sidik sumber + nama foto. */
function tandaSelesaiUiw_(an, x, ctx) {
  if (x.hapus) {
    if (x.r.jenis === 'TEMUAN') { hapusFotoUiw_(String(x.r.foto_awal_uiw || '')); hapusFotoUiw_(String(x.r.foto_akhir_uiw || '')); }
    ubahAntreanUiw_(an, x.r, { status: 'TERHAPUS', bantu: '', waktu_coba: sekarangIso_(), coba_lagi_setelah: '' });
    return;
  }
  var foto = {};
  x.b.foto.forEach(function (f) { foto[f.slot] = f.nama; });
  ubahAntreanUiw_(an, x.r, { status: 'TERKIRIM', bantu: '', percobaan: 0, coba_lagi_setelah: '', waktu_coba: sekarangIso_(),
    waktu_terkirim: sekarangIso_(), sidik: sidikSumberUiw_(x.r, ctx), foto_awal_uiw: foto.AWAL || '', foto_akhir_uiw: foto.AKHIR || '' });
}

/** Baris gagal: percobaan +1, coba lagi setelah jeda bertahap. */
function tandaGagalUiw_(an, r, bantu) {
  var n = (Number(r.percobaan) || 0) + 1;
  ubahAntreanUiw_(an, r, { status: 'GAGAL', bantu: bantu, percobaan: n, waktu_coba: sekarangIso_(),
    coba_lagi_setelah: new Date(Date.now() + jedaGagalUiw_(n)).toISOString() });
}

/** Masalah file / folder (bukan baris): status sekali di Script Property UIW_STATUS_FILE, baris tidak diubah, coba 60 menit lagi. */
function gagalFileUiw_(p, hasil, bantu) {
  p.setProperty('UIW_STATUS_FILE', bantu + ' · ' + sekarangIso_());
  console.warn('Sinkron UIW berhenti: ' + bantu);
  jadwalkanSinkronUiw_(UIW_JEDA_FILE_MS_);
  hasil.status = 'FILE';
  hasil.bantuFile = bantu;
  return hasil;
}

/** Jadwal putaran berikutnya: waktu habis 2 menit, gagal = jeda GAGAL terdekat, foto ditunggu 15 menit. PERLU_DATA = pemicu 5 menit. */
function jadwalUlangUiw_(an, waktuHabis, tungguFoto, adaGagal) {
  if (waktuHabis) { jadwalkanSinkronUiw_(UIW_PEMICU_MS_); return; }
  var jeda = 0, kini = Date.now();
  if (adaGagal) {
    an.rows.forEach(function (r) {
      if (String(r.status) !== 'GAGAL') return;
      var d = Math.max(UIW_PEMICU_MS_, msUiw_(r.coba_lagi_setelah) - kini);
      if (!jeda || d < jeda) jeda = d;
    });
  }
  if (tungguFoto && (!jeda || UIW_JEDA_MENUNGGU_MS_ < jeda)) jeda = UIW_JEDA_MENUNGGU_MS_;
  if (jeda) jadwalkanSinkronUiw_(jeda);
}
