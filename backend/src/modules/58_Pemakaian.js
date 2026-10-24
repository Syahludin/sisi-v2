/**
 * v0.84.0 (keputusan kvlar 10 Okt 2026): pantau pemakaian kuota harian Apps Script + engine PDF (Cloud Run).
 *
 * Apps Script tidak punya API untuk membaca sisa kuota, jadi SiSi mencatat sendiri (perkiraan, sengaja dilebihkan):
 *  - Waktu jalan pemicu (kuota "Triggers total runtime": Gmail 90 menit / Workspace 6 jam per hari). Semua handler pemicu
 *    dibungkus jalanPemicu_ (waktu + 0,5 s per jalan). Jalan manual dari editor dicatat terpisah (tidak memakan kuota pemicu).
 *  - Panggilan UrlFetch (Gmail 20.000 / Workspace 100.000 per hari): engine PDF + FCM lewat ambilUrl_ / ambilUrlSemua_.
 *  - Engine PDF per BULAN (gratis Cloud Run: 2 juta request, 180.000 vCPU-detik): jumlah request + durasi.
 * Catatan per hari WIB di Script Property PAKAI_H:<yyyy-MM-dd> (JSON kecil), per bulan PAKAI_B:<yyyy-MM>. Google me-reset
 * kuota per 24 jam (bukan tepat 00:00 WIB), jadi batas diberi jarak aman.
 *
 * Rem otomatis (hanya jalan PEMICU, jalan manual tidak pernah direm):
 *  - RENDAH (salin / cek foto migrasi): berhenti di >= 80% kuota pemicu atau UrlFetch.
 *  - NORMAL (pengingat Yandal, sinkron gardu): berhenti di >= 95%.
 *  - PENTING (rekap Yandal, baris harian laporan, pemantau): tidak pernah direm.
 * v1.0.31 Firebase (FCM): kirimnya gratis tanpa batas biaya, tetapi tiap pesan = 1 UrlFetch. Jatah notifikasi per hari
 * (bawaan 20% kuota UrlFetch, override BATAS_FCM_HARI) supaya PDF / sinkron tetap kebagian. Peringatan 80% / 95%, dan langsung
 * BAHAYA kalau Firebase menolak kiriman (HTTP 429 / RESOURCE_EXHAUSTED).
 * Pemantau tiap jam (ADMIN_pantauPemakaian): tulis ringkasan harian ke log_Pemakaian (SiSi_Auth) + notifikasi admin (FCM)
 * sekali per tingkat (80% / 95%) per hari. HP admin: kartu Pemakaian Server di Pengaturan (endpoint getPemakaian).
 */
var PAKAI_PAKET_ = { GMAIL: { pemicuMenit: 90, urlFetch: 20000, fcmHari: 4000 }, WORKSPACE: { pemicuMenit: 360, urlFetch: 100000, fcmHari: 20000 } };
var PAKAI_PDF_BULAN_ = { request: 2000000, vcpuDetik: 180000 };
var PAKAI_OVERHEAD_MS_ = 500;   // waktu mulai eksekusi yang tidak terukur dari dalam skrip
var PAKAI_PRIORITAS_ = {
  ADMIN_rekapShiftYandal: 'PENTING', ADMIN_buatBarisHarian: 'PENTING', ADMIN_pantauPemakaian: 'PENTING',
  ADMIN_pengingatYandal: 'NORMAL', ADMIN_sinkronGarduLama: 'NORMAL',
  ADMIN_migrasiFoto: 'RENDAH', ADMIN_migrasiCekFoto: 'RENDAH', ADMIN_migrasiP0Foto: 'RENDAH'
};
var PAKAI_REM_ = { RENDAH: 0.8, NORMAL: 0.95 };
var PAKAI_SIMPAN_HARI_ = 8;
var LOG_PEMAKAIAN_HEADER_ = ['Tanggal', 'Paket', 'Pemicu (menit)', 'Batas Pemicu (menit)', 'Pemicu (%)', 'Jalan Pemicu', 'Manual (menit)',
  'UrlFetch', 'Batas UrlFetch', 'UrlFetch (%)', 'PDF Engine', 'PDF Engine (detik)', 'FCM', 'Direm', 'Rincian', 'Diperbarui'];

function kunciHariPakai_(ms) { return 'PAKAI_H:' + tglJakarta_(new Date(ms)); }
function kunciBulanPakai_(ms) { return 'PAKAI_B:' + tglJakarta_(new Date(ms)).slice(0, 7); }

function bacaJsonProp_(p, k) {
  try { var o = JSON.parse(p.getProperty(k) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
}

/** Gabung delta ke catatan (murni): angka dijumlah, objek angka dijumlah per kunci, objek lain ditimpa per kunci. */
function tambahPakai_(o, d) {
  Object.keys(d).forEach(function (k) {
    var v = d[k];
    if (typeof v === 'number') o[k] = (Number(o[k]) || 0) + v;
    else if (v && typeof v === 'object') {
      o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {};
      Object.keys(v).forEach(function (j) {
        o[k][j] = typeof v[j] === 'number' ? (Number(o[k][j]) || 0) + v[j] : v[j];
      });
    }
  });
  return o;
}

/** Catat pemakaian (hari ini + opsional bulan). Tidak pernah melempar: pencatatan gagal tidak boleh mematikan fitur. */
function catatPakai_(dHari, dBulan) {
  try {
    var p = PropertiesService.getScriptProperties(), sekarang = Date.now();
    var tulis = function () {
      var kh = kunciHariPakai_(sekarang);
      p.setProperty(kh, JSON.stringify(tambahPakai_(bacaJsonProp_(p, kh), dHari || {})));
      if (dBulan) { var kb = kunciBulanPakai_(sekarang); p.setProperty(kb, JSON.stringify(tambahPakai_(bacaJsonProp_(p, kb), dBulan))); }
    };
    if (LOCK_AKTIF_.ya) { tulis(); return; }
    var lock = LockService.getScriptLock(), dapat = false;
    try { dapat = lock.tryLock(5000); } catch (eL) { dapat = false; }
    try { tulis(); } finally { if (dapat) lock.releaseLock(); }
  } catch (e) { /* abaikan */ }
}

/** Batas aktif dari Script Properties (PAKET_GOOGLE GMAIL / WORKSPACE + override). */
function batasPemakaian_() {
  var p = PropertiesService.getScriptProperties();
  var paket = String(p.getProperty('PAKET_GOOGLE') || 'GMAIL').trim().toUpperCase();
  if (!PAKAI_PAKET_[paket]) paket = 'GMAIL';
  var angka = function (k, bawaan) { var n = Number(p.getProperty(k)); return isFinite(n) && n > 0 ? n : bawaan; };
  return {
    paket: paket,
    pemicuMenit: angka('BATAS_PEMICU_MENIT', PAKAI_PAKET_[paket].pemicuMenit),
    urlFetch: angka('BATAS_URLFETCH', PAKAI_PAKET_[paket].urlFetch),
    pdfRequest: angka('BATAS_PDF_REQUEST_BULAN', PAKAI_PDF_BULAN_.request),
    pdfVcpuDetik: angka('BATAS_PDF_VCPU_DETIK_BULAN', PAKAI_PDF_BULAN_.vcpuDetik),
    pdfVcpu: angka('PDF_ENGINE_VCPU', 1),
    fcmHari: angka('BATAS_FCM_HARI', PAKAI_PAKET_[paket].fcmHari)
  };
}

/** Persen pemakaian hari ini (murni). */
function persenPakai_(h, b) {
  return {
    pemicu: bulat_((Number(h.pemicu_ms) || 0) / 60000 / b.pemicuMenit * 100, 1),
    url: bulat_((Number(h.url_n) || 0) / b.urlFetch * 100, 1)
  };
}

/** Alasan rem untuk pemicu nama (murni). '' = boleh jalan. */
function remPemicu_(nama, h, b) {
  var batas = PAKAI_REM_[PAKAI_PRIORITAS_[nama] || 'NORMAL'];
  if (!batas) return '';
  var ps = persenPakai_(h, b);
  if (ps.pemicu >= batas * 100) return 'kuota pemicu ' + ps.pemicu + '% (rem ' + batas * 100 + '%)';
  if (ps.url >= batas * 100) return 'kuota UrlFetch ' + ps.url + '% (rem ' + batas * 100 + '%)';
  return '';
}

/**
 * Bungkus handler pemicu. e = event pemicu (ada triggerUid kalau dijalankan pemicu; jalan manual dari editor = undefined).
 * Jalan pemicu direm kalau kuota hampir habis (lihat PAKAI_PRIORITAS_), waktu jalan dicatat.
 */
function jalanPemicu_(nama, e, fn) {
  var pemicu = !!(e && e.triggerUid);
  if (pemicu) {
    var alasan = remPemicu_(nama, bacaJsonProp_(PropertiesService.getScriptProperties(), kunciHariPakai_(Date.now())), batasPemakaian_());
    if (alasan) {
      var rem = {}; rem[nama] = 1;
      catatPakai_({ rem: rem });
      console.warn(nama + ' DIREM: ' + alasan + '. Jalan lagi otomatis sesudah kuota pulih (besok) atau naikkan batas di Script Properties.');
      return null;
    }
  }
  var mulai = Date.now();
  try {
    return fn();
  } finally {
    var ms = Date.now() - mulai + PAKAI_OVERHEAD_MS_, rinci = {};
    rinci[nama] = ms;
    catatPakai_(pemicu ? { pemicu_n: 1, pemicu_ms: ms, fn: rinci } : { manual_n: 1, manual_ms: ms });
  }
}

/** UrlFetchApp.fetch + catat (jenis: 'pdf' / 'fcm' / 'lain'). PDF ikut catatan bulanan engine. */
function ambilUrl_(url, opsi, jenis) {
  var mulai = Date.now();
  try {
    return UrlFetchApp.fetch(url, opsi);
  } finally {
    var ms = Date.now() - mulai, d = { url_n: 1 };
    d[jenis + '_n'] = 1; d[jenis + '_ms'] = ms;
    catatPakai_(d, jenis === 'pdf' ? { pdf_n: 1, pdf_ms: ms } : null);
  }
}

/** UrlFetchApp.fetchAll + catat (dihitung per permintaan). */
function ambilUrlSemua_(daftar, jenis) {
  try {
    return UrlFetchApp.fetchAll(daftar);
  } finally {
    var d = { url_n: daftar.length };
    d[jenis + '_n'] = daftar.length;
    catatPakai_(d, null);
  }
}

// ---------------- ringkasan ----------------

function statusPakai_(persen) { return persen >= 95 ? 'BAHAYA' : persen >= 80 ? 'WASPADA' : 'AMAN'; }

/** Ringkasan untuk HP / log (murni). hari = { tanggal: catatan }, bulan = catatan bulan ini, b = batasPemakaian_(). */
function ringkasPemakaian_(tanggal, hari, bulan, b) {
  var h = hari[tanggal] || {}, ps = persenPakai_(h, b);
  var vcpu = bulat_((Number(bulan.pdf_ms) || 0) / 1000 * b.pdfVcpu, 1);
  var pdfPersen = Math.max(bulat_(vcpu / b.pdfVcpuDetik * 100, 1), bulat_((Number(bulan.pdf_n) || 0) / b.pdfRequest * 100, 1));
  var fungsi = Object.keys(h.fn || {}).map(function (k) { return { nama: k, menit: bulat_(Number(h.fn[k]) / 60000, 2) }; })
    .sort(function (x, y) { return y.menit - x.menit; });
  var riwayat = Object.keys(hari).sort().reverse().slice(0, 7).map(function (t) {
    var x = hari[t] || {}, p = persenPakai_(x, b);
    return { tanggal: t, pemicuMenit: bulat_((Number(x.pemicu_ms) || 0) / 60000, 1), pemicuPersen: p.pemicu, urlFetch: Number(x.url_n) || 0, urlPersen: p.url };
  });
  var fcmKirim = Number(h.fcm_kirim) || 0, fcmTolak = Number(h.fcm_tolak) || 0;
  var fcmPersen = b.fcmHari > 0 ? bulat_(fcmKirim / b.fcmHari * 100, 1) : 0;
  return {
    tanggal: tanggal, paket: b.paket,
    status: statusPakai_(Math.max(ps.pemicu, ps.url, pdfPersen, fcmPersen, fcmTolak ? 95 : 0)),
    pemicu: { menit: bulat_((Number(h.pemicu_ms) || 0) / 60000, 1), batasMenit: b.pemicuMenit, persen: ps.pemicu, jalan: Number(h.pemicu_n) || 0,
              perFungsi: fungsi, direm: h.rem || {} },
    manual: { menit: bulat_((Number(h.manual_ms) || 0) / 60000, 1), jalan: Number(h.manual_n) || 0 },
    urlFetch: { jumlah: Number(h.url_n) || 0, batas: b.urlFetch, persen: ps.url, pdf: Number(h.pdf_n) || 0, fcm: Number(h.fcm_n) || 0 },
    pdfBulan: { bulan: tanggal.slice(0, 7), request: Number(bulan.pdf_n) || 0, batasRequest: b.pdfRequest, vcpuDetik: vcpu,
                batasVcpuDetik: b.pdfVcpuDetik, persen: pdfPersen },
    fcm: { kirim: fcmKirim, batas: b.fcmHari || 0, persen: fcmPersen, gagal: Number(h.fcm_gagal) || 0, ditolak: fcmTolak,
           bulan: Number(bulan.fcm_kirim) || 0, gagalBulan: Number(bulan.fcm_gagal) || 0 },
    riwayat: riwayat
  };
}

/** Catatan harian dari Script Properties (8 hari terakhir) + bulan ini. */
function bacaSemuaPakai_() {
  var semua = PropertiesService.getScriptProperties().getProperties(), hari = {};
  Object.keys(semua).forEach(function (k) {
    var m = /^PAKAI_H:(\d{4}-\d{2}-\d{2})$/.exec(k);
    if (!m) return;
    try { hari[m[1]] = JSON.parse(semua[k] || '{}'); } catch (e) { hari[m[1]] = {}; }
  });
  var bulan = {};
  try { bulan = JSON.parse(semua[kunciBulanPakai_(Date.now())] || '{}'); } catch (e2) { bulan = {}; }
  return { hari: hari, bulan: bulan, semua: semua };
}

/** Endpoint: kartu Pemakaian Server di Pengaturan (ADMIN / SUPER). Hanya membaca Script Properties. */
function getPemakaian_(sesi, data) {
  if (!sesi || (sesi.role !== 'ADMIN' && sesi.role !== 'SUPER')) throw new SisiError_('AKSES_DITOLAK', 'khusus admin');
  var d = validasi_(data, { segarkan: { tipe: 'bool' } });
  var x = bacaSemuaPakai_();
  var r = ringkasPemakaian_(tglJakarta_(new Date()), x.hari, x.bulan, batasPemakaian_());
  r.cloudRun = pemakaianCloudRun_(d.segarkan === true);   // v0.85.0: Cloud Run per layanan (cache 10 menit)
  return r;
}

// ---------------- pemantau ----------------

/** Baris log_Pemakaian satu hari (murni). */
function barisLogPakai_(tanggal, h, b, iso) {
  var ps = persenPakai_(h, b);
  return { Tanggal: tanggal, Paket: b.paket, 'Pemicu (menit)': bulat_((Number(h.pemicu_ms) || 0) / 60000, 1), 'Batas Pemicu (menit)': b.pemicuMenit,
    'Pemicu (%)': ps.pemicu, 'Jalan Pemicu': Number(h.pemicu_n) || 0, 'Manual (menit)': bulat_((Number(h.manual_ms) || 0) / 60000, 1),
    UrlFetch: Number(h.url_n) || 0, 'Batas UrlFetch': b.urlFetch, 'UrlFetch (%)': ps.url, 'PDF Engine': Number(h.pdf_n) || 0,
    'PDF Engine (detik)': bulat_((Number(h.pdf_ms) || 0) / 1000, 1), FCM: Number(h.fcm_n) || 0,
    Direm: Object.keys(h.rem || {}).map(function (k) { return k.replace(/^ADMIN_/, '') + ' x' + h.rem[k]; }).join(', '),
    Rincian: JSON.stringify(h.fn || {}).slice(0, 1000), Diperbarui: iso };
}

/** Tingkat peringatan baru yang belum dikirim hari ini (murni): ['pemicu95', 'url80', ...]. */
function peringatanBaruPakai_(r, sudah) {
  var baru = [], cloud = r.cloudRun && r.cloudRun.aktif ? r.cloudRun.persenMaks : 0;
  var fcm = r.fcm || {};
  [['pemicu', r.pemicu.persen], ['url', r.urlFetch.persen], ['pdf', r.pdfBulan.persen], ['cloud', cloud], ['fcm', fcm.persen || 0],
   ['fcmTolak', fcm.ditolak ? 95 : 0]].forEach(function (x) {
    var tingkat = x[1] >= 95 ? 95 : x[1] >= 80 ? 80 : 0;
    if (tingkat && !(sudah || {})[x[0] + tingkat]) baru.push(x[0] + tingkat);
  });
  return baru;
}

function ADMIN_pantauPemakaian(e) {
  pastikanPemilik_();
  return jalanPemicu_('ADMIN_pantauPemakaian', e, pantauPemakaianInti_);
}

function pantauPemakaianInti_() {
  var c = cfg_(), b = batasPemakaian_(), p = PropertiesService.getScriptProperties(), iso = sekarangIso_();
  var x = bacaSemuaPakai_(), hariIni = tglJakarta_(new Date());
  var r = ringkasPemakaian_(hariIni, x.hari, x.bulan, b);
  r.cloudRun = pemakaianCloudRun_(true);   // v0.85.0
  // 1. ringkasan harian ke log_Pemakaian (SiSi_Auth), satu baris per tanggal (diperbarui)
  if (c.AUTH_SHEET_ID) {
    denganLock_(function () {
      var ss = bukaSpreadsheet_(c.AUTH_SHEET_ID), sh = ss.getSheetByName('log_Pemakaian');
      if (!sh) { sh = ss.insertSheet('log_Pemakaian'); sh.getRange(1, 1, 1, LOG_PEMAKAIAN_HEADER_.length).setValues([LOG_PEMAKAIAN_HEADER_]); }
      var t = tabel_('AUTH_SHEET_ID', 'log_Pemakaian'), ada = {};
      t.rows.forEach(function (row) { ada[tglSel_(row.Tanggal) || String(row.Tanggal)] = row; });
      Object.keys(x.hari).sort().forEach(function (tgl) {
        var o = barisLogPakai_(tgl, x.hari[tgl], b, iso), lama = ada[tgl];
        if (lama) t.sheet.getRange(lama._baris, 1, 1, t.header.length).setValues([barisDariObjek_(t.header, o)]);
        else tambahBaris_(t, o);
      });
    }, 60000);
  }
  // 2. peringatan admin sekali per tingkat per hari
  var sudah = (x.hari[hariIni] || {}).peringatan || {};
  var baru = peringatanBaruPakai_(r, sudah);
  if (baru.length) {
    var label = { pemicu: 'Waktu pemicu ' + r.pemicu.menit + '/' + r.pemicu.batasMenit + ' menit (' + r.pemicu.persen + '%)',
                  url: 'UrlFetch ' + r.urlFetch.jumlah + '/' + r.urlFetch.batas + ' (' + r.urlFetch.persen + '%)',
                  pdf: 'Engine PDF bulan ini ' + r.pdfBulan.persen + '% dari gratis Cloud Run',
                  cloud: 'Cloud Run bulan ini ' + (r.cloudRun.persenMaks || 0) + '% dari kuota gratis',
                  fcm: 'Notifikasi Firebase ' + r.fcm.kirim + '/' + r.fcm.batas + ' hari ini (' + r.fcm.persen + '%)',
                  fcmTolak: 'Firebase menolak ' + r.fcm.ditolak + ' notifikasi (batas kiriman)' };
    var isi = baru.map(function (k) { return label[k.replace(/\d+$/, '')]; }).join('; ');
    console.warn('PEMAKAIAN ' + r.status + ': ' + isi);
    kirimPeringatanAdminPakai_(r.status === 'BAHAYA' ? 'Kuota server hampir habis' : 'Pemakaian server tinggi', isi);
    var tanda = {};
    baru.forEach(function (k) { tanda[k] = true; });
    catatPakai_({ peringatan: tanda });
  }
  // 3. bersihkan catatan lama (sudah ada di log_Pemakaian)
  var batasHari = tglJakarta_(new Date(Date.now() - PAKAI_SIMPAN_HARI_ * 864e5)), batasBulan = tglJakarta_(new Date(Date.now() - 100 * 864e5)).slice(0, 7);
  Object.keys(x.semua).forEach(function (k) {
    var m = /^PAKAI_H:(\d{4}-\d{2}-\d{2})$/.exec(k), n = /^PAKAI_B:(\d{4}-\d{2})$/.exec(k);
    if ((m && m[1] < batasHari) || (n && n[1] < batasBulan)) p.deleteProperty(k);
  });
  console.log('PEMAKAIAN ' + hariIni + ' [' + r.status + ']: pemicu ' + r.pemicu.menit + '/' + r.pemicu.batasMenit + ' menit (' + r.pemicu.persen +
    '%), UrlFetch ' + r.urlFetch.jumlah + '/' + r.urlFetch.batas + ', engine PDF bulan ini ' + r.pdfBulan.request + ' request ~' + r.pdfBulan.vcpuDetik + ' vCPU-detik');
  return r;
}

/** Notifikasi ke HP admin (FCM, kalau sudah disiapkan). Gagal = cukup log. */
function kirimPeringatanAdminPakai_(judul, isi) {
  try {
    var akun = akunFcm_();
    if (!akun || !cfg_().AUTH_SHEET_ID) return 0;
    var peran = {};
    tabel_('MASTER_SHEET_ID', 'db_Users').rows.forEach(function (u) { if (isAktif_(u.aktif)) peran[String(u.user_id)] = String(u.role).trim(); });
    var tujuan = tabelNotif_().rows.filter(function (n) {
      return isAktif_(n.aktif) && teksSel_(n.fcm_token) && (peran[String(n.user_id)] === 'ADMIN' || peran[String(n.user_id)] === 'SUPER');
    });
    var hasil = kirimFcm_(akun, tujuan.map(function (n) {
      return { token: teksSel_(n.fcm_token), judul: judul, isi: isi, ttlDetik: 3600, data: { jenis: 'PEMAKAIAN' } };
    }));
    return hasil.filter(function (h) { return h.ok; }).length;
  } catch (e) {
    console.warn('Notifikasi pemakaian gagal: ' + (e.kode || e.message || e));
    return 0;
  }
}

function hapusPemicuPantau_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'ADMIN_pantauPemakaian') ScriptApp.deleteTrigger(t);
  });
}

/** Editor: pasang pemantau pemakaian tiap jam (pemicu lama diganti), lalu jalan sekali. */
function ADMIN_pasangPemicuPantauPemakaian() {
  pastikanPemilik_();
  hapusPemicuPantau_();
  ScriptApp.newTrigger('ADMIN_pantauPemakaian').timeBased().everyHours(1).create();
  console.log('Pemicu ADMIN_pantauPemakaian tiap jam dipasang.');
  ADMIN_pantauPemakaian();
}

function ADMIN_berhentiPemicuPantauPemakaian() {
  pastikanPemilik_();
  hapusPemicuPantau_();
  console.log('Pemicu ADMIN_pantauPemakaian dihapus.');
}

/** Editor: ringkasan pemakaian di log + daftar pemicu terpasang + rem harian engine PDF (instance). */
function ADMIN_cekPemakaian() {
  pastikanPemilik_();
  var x = bacaSemuaPakai_(), b = batasPemakaian_(), r = ringkasPemakaian_(tglJakarta_(new Date()), x.hari, x.bulan, b);
  console.log('PAKET ' + b.paket + ' [' + r.status + '] ' + r.tanggal);
  console.log('Pemicu hari ini: ' + r.pemicu.menit + ' / ' + r.pemicu.batasMenit + ' menit (' + r.pemicu.persen + '%), ' + r.pemicu.jalan + ' jalan' +
    (Object.keys(r.pemicu.direm).length ? ' | direm: ' + JSON.stringify(r.pemicu.direm) : ''));
  r.pemicu.perFungsi.forEach(function (f) { console.log('  ' + f.nama + ': ' + f.menit + ' menit'); });
  console.log('Jalan manual (tidak memakan kuota pemicu): ' + r.manual.menit + ' menit, ' + r.manual.jalan + ' jalan');
  console.log('UrlFetch hari ini: ' + r.urlFetch.jumlah + ' / ' + r.urlFetch.batas + ' (' + r.urlFetch.persen + '%) | PDF ' + r.urlFetch.pdf + ', FCM ' + r.urlFetch.fcm);
  console.log('Engine PDF ' + r.pdfBulan.bulan + ': ' + r.pdfBulan.request + ' request, ~' + r.pdfBulan.vcpuDetik + ' / ' + r.pdfBulan.batasVcpuDetik + ' vCPU-detik (' + r.pdfBulan.persen + '%)');
  console.log('Firebase (FCM) hari ini: ' + r.fcm.kirim + ' / ' + r.fcm.batas + ' notifikasi (' + r.fcm.persen + '%), gagal ' + r.fcm.gagal +
    ', ditolak ' + r.fcm.ditolak + ' | bulan ini ' + r.fcm.bulan + ' (batas: BATAS_FCM_HARI)');
  r.riwayat.forEach(function (h) { console.log('  ' + h.tanggal + ': pemicu ' + h.pemicuMenit + ' menit (' + h.pemicuPersen + '%), UrlFetch ' + h.urlFetch); });
  var cr = pemakaianCloudRun_(true);   // v0.85.0
  if (!cr.aktif) console.log('Cloud Run: ' + cr.pesan);
  else {
    console.log('Cloud Run ' + cr.proyek + ' ' + cr.bulan + ' (total semua layanan): ' + cr.total.bulan.request + ' request, ' + cr.total.bulan.vcpuDetik +
      ' vCPU-detik, ' + cr.total.bulan.gibDetik + ' GiB-detik = ' + cr.persenMaks + '% kuota gratis');
    cr.layanan.forEach(function (l) {
      console.log('  ' + l.nama + ': hari ini ' + l.hariIni.request + ' request | bulan ini ' + l.bulan.request + ' request, ' + l.bulan.vcpuDetik + ' vCPU-detik');
    });
  }
  var pemicu = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  console.log('Pemicu terpasang (' + pemicu.length + '): ' + (pemicu.join(', ') || '-'));
  if (pemicu.indexOf('ADMIN_pantauPemakaian') === -1) console.warn('Pemantau belum terpasang: ADMIN_pasangPemicuPantauPemakaian');
  try {
    var konf = konfigPdf_();
    var res = ambilUrl_(konf.url + '/guard/status', { method: 'get', muteHttpExceptions: true, followRedirects: false }, 'lain');
    var g = JSON.parse(res.getContentText() || '{}');
    console.log('Rem engine PDF (per instance, reset saat cold start): ' + g.count + ' / ' + g.budget + ' hari ini (' + g.day + ' UTC)');
  } catch (e) { console.log('Engine PDF: status rem tidak terbaca (' + (e.kode || e.message || e) + ')'); }
}

/** Bagian pemakaian di ADMIN_cekKonfigurasi (info saja). */
function cekKonfigPemakaian_() {
  console.log('--- Pemakaian kuota (ADMIN_cekPemakaian) ---');
  var x = bacaSemuaPakai_(), b = batasPemakaian_(), r = ringkasPemakaian_(tglJakarta_(new Date()), x.hari, x.bulan, b);
  var pantau = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'ADMIN_pantauPemakaian'; });
  console.log('Paket ' + b.paket + ' (PAKET_GOOGLE), hari ini [' + r.status + '] pemicu ' + r.pemicu.persen + '%, UrlFetch ' + r.urlFetch.persen +
    '% | pemantau tiap jam: ' + (pantau ? 'aktif' : 'BELUM (ADMIN_pasangPemicuPantauPemakaian)'));
  var p = PropertiesService.getScriptProperties();
  console.log(p.getProperty('CLOUD_RUN_PROJECT') ? 'Cloud Run per layanan: proyek ' + p.getProperty('CLOUD_RUN_PROJECT') + (akunMonitor_() ? '' : ' | akun layanan BELUM diisi (MONITOR_SERVICE_ACCOUNT)')
    : 'CLOUD_RUN_PROJECT kosong: pemakaian Cloud Run per layanan tidak tampil (hanya perkiraan engine PDF dari catatan SiSi).');
  return 0;
}

// ---------------- Cloud Run per layanan (v0.85.0) ----------------
/**
 * Pemakaian nyata Cloud Run dari Cloud Monitoring (gratis dibaca), per layanan (service_name) di CLOUD_RUN_PROJECT:
 * request, vCPU-detik (container/cpu/allocation_time), GiB-detik (container/memory/allocation_time), hari ini + bulan ini.
 * Akun: MONITOR_SERVICE_ACCOUNT (JSON) atau FCM_SERVICE_ACCOUNT, wajib peran "Monitoring Viewer" di proyek Cloud Run.
 * Kuota gratis Cloud Run dihitung per akun billing (semua layanan + proyek digabung), jadi persen = total semua layanan.
 * Hasil di-cache 10 menit (CacheService).
 */
var CLOUD_RUN_METRIK_ = {
  request: 'run.googleapis.com/request_count',
  vcpuDetik: 'run.googleapis.com/container/cpu/allocation_time',
  gibDetik: 'run.googleapis.com/container/memory/allocation_time'
};
var CLOUD_RUN_GRATIS_ = { request: 2000000, vcpuDetik: 180000, gibDetik: 360000 };
var CLOUD_RUN_CACHE_DETIK_ = 600;
var MONITOR_SCOPE_ = 'https://www.googleapis.com/auth/monitoring.read';

function akunMonitor_() {
  var p = PropertiesService.getScriptProperties();
  return akunDariJson_(p.getProperty('MONITOR_SERVICE_ACCOUNT')) || akunDariJson_(p.getProperty('FCM_SERVICE_ACCOUNT'));
}

/** Awal hari ini dan awal bulan ini (00:00 WIB), ms. */
function awalPeriodeWib_(ms) {
  var tgl = tglJakarta_(new Date(ms));
  return { hari: Date.parse(tgl + 'T00:00:00+07:00'), bulan: Date.parse(tgl.slice(0, 7) + '-01T00:00:00+07:00') };
}

/** URL timeSeries.list: satu nilai SUM per layanan untuk rentang [mulai, akhir]. */
function urlDeretMonitor_(proyek, metrik, mulaiMs, akhirMs) {
  var detik = Math.max(60, Math.ceil((akhirMs - mulaiMs) / 60000) * 60);
  var q = {
    filter: 'metric.type="' + metrik + '" AND resource.type="cloud_run_revision"',
    'interval.startTime': new Date(mulaiMs).toISOString(), 'interval.endTime': new Date(akhirMs).toISOString(),
    'aggregation.alignmentPeriod': detik + 's', 'aggregation.perSeriesAligner': 'ALIGN_SUM',
    'aggregation.crossSeriesReducer': 'REDUCE_SUM', 'aggregation.groupByFields': 'resource.labels.service_name'
  };
  return 'https://monitoring.googleapis.com/v3/projects/' + encodeURIComponent(proyek) + '/timeSeries?' +
    Object.keys(q).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]); }).join('&');
}

/** { layanan: total } dari jawaban timeSeries.list (murni). */
function jumlahDeretMonitor_(json) {
  var hasil = {};
  ((json && json.timeSeries) || []).forEach(function (ts) {
    var nama = String(((ts.resource || {}).labels || {}).service_name || '-');
    (ts.points || []).forEach(function (pt) {
      var v = pt.value || {}, n = v.int64Value !== undefined ? Number(v.int64Value) : Number(v.doubleValue || 0);
      if (isFinite(n)) hasil[nama] = (hasil[nama] || 0) + n;
    });
  });
  return hasil;
}

/** Gabung 6 hasil (3 metrik x hari / bulan) jadi daftar layanan + total (murni). filter = daftar nama layanan ([] = semua). */
function susunCloudRun_(data, filter, gratis) {
  var nama = {};
  Object.keys(data).forEach(function (k) { Object.keys(data[k]).forEach(function (n) { nama[n] = true; }); });
  var daftar = Object.keys(nama).filter(function (n) { return !filter.length || filter.indexOf(n) !== -1; }).sort();
  var total = { hariIni: { request: 0, vcpuDetik: 0 }, bulan: { request: 0, vcpuDetik: 0, gibDetik: 0 } };
  var layanan = daftar.map(function (n) {
    var v = function (k) { return Number((data[k] || {})[n]) || 0; };
    var x = {
      nama: n,
      hariIni: { request: v('hari.request'), vcpuDetik: bulat_(v('hari.vcpuDetik'), 1) },
      bulan: { request: v('bulan.request'), vcpuDetik: bulat_(v('bulan.vcpuDetik'), 1), gibDetik: bulat_(v('bulan.gibDetik'), 1) }
    };
    total.hariIni.request += x.hariIni.request; total.hariIni.vcpuDetik += x.hariIni.vcpuDetik;
    total.bulan.request += x.bulan.request; total.bulan.vcpuDetik += x.bulan.vcpuDetik; total.bulan.gibDetik += x.bulan.gibDetik;
    return x;
  });
  ['vcpuDetik', 'gibDetik'].forEach(function (k) { total.bulan[k] = bulat_(total.bulan[k], 1); });
  total.hariIni.vcpuDetik = bulat_(total.hariIni.vcpuDetik, 1);
  var persen = {
    request: bulat_(total.bulan.request / gratis.request * 100, 2),
    vcpuDetik: bulat_(total.bulan.vcpuDetik / gratis.vcpuDetik * 100, 2),
    gibDetik: bulat_(total.bulan.gibDetik / gratis.gibDetik * 100, 2)
  };
  layanan.forEach(function (x) { x.persenVcpu = bulat_(x.bulan.vcpuDetik / gratis.vcpuDetik * 100, 2); });
  return { layanan: layanan, total: total, persen: persen, persenMaks: Math.max(persen.request, persen.vcpuDetik, persen.gibDetik) };
}

/** Pemakaian Cloud Run (cache 10 menit). Belum disiapkan / gagal = { aktif: false, pesan }. */
function pemakaianCloudRun_(segarkan) {
  var p = PropertiesService.getScriptProperties(), proyek = teksSel_(p.getProperty('CLOUD_RUN_PROJECT'));
  if (!proyek) return { aktif: false, pesan: 'CLOUD_RUN_PROJECT belum diisi (ID proyek Google Cloud tempat engine Cloud Run).' };
  var akun = akunMonitor_();
  if (!akun) return { aktif: false, proyek: proyek, pesan: 'Akun layanan belum diisi (MONITOR_SERVICE_ACCOUNT atau FCM_SERVICE_ACCOUNT).' };
  var cache = CacheService.getScriptCache(), kunci = 'cloudrun:v1:' + proyek;
  if (!segarkan) { var ada = cache.get(kunci); if (ada) { try { return JSON.parse(ada); } catch (eC) { /* baca ulang */ } } }
  var gratis = {
    request: Number(p.getProperty('BATAS_PDF_REQUEST_BULAN')) || CLOUD_RUN_GRATIS_.request,
    vcpuDetik: Number(p.getProperty('BATAS_PDF_VCPU_DETIK_BULAN')) || CLOUD_RUN_GRATIS_.vcpuDetik,
    gibDetik: Number(p.getProperty('BATAS_CLOUD_RUN_GIB_DETIK_BULAN')) || CLOUD_RUN_GRATIS_.gibDetik
  };
  var filter = teksSel_(p.getProperty('CLOUD_RUN_LAYANAN')).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  var sekarang = Date.now(), awal = awalPeriodeWib_(sekarang), kunciData = [], minta = [];
  try {
    var akses = aksesGoogle_(akun, MONITOR_SCOPE_, false);
    [['hari', awal.hari], ['bulan', awal.bulan]].forEach(function (w) {
      Object.keys(CLOUD_RUN_METRIK_).forEach(function (m) {
        kunciData.push(w[0] + '.' + m);
        minta.push({ url: urlDeretMonitor_(proyek, CLOUD_RUN_METRIK_[m], w[1], sekarang), method: 'get', muteHttpExceptions: true,
                     headers: { Authorization: 'Bearer ' + akses } });
      });
    });
    var res = ambilUrlSemua_(minta, 'lain'), data = {};
    for (var i = 0; i < res.length; i++) {
      var kode = res[i].getResponseCode();
      if (kode !== 200) {
        var pesan = kode === 403 ? 'Akun ' + akun.email + ' belum punya peran Monitoring Viewer di proyek ' + proyek + ' (atau Cloud Monitoring API belum aktif).'
          : kode === 404 ? 'Proyek ' + proyek + ' tidak ditemukan (cek CLOUD_RUN_PROJECT).' : 'Cloud Monitoring menjawab HTTP ' + kode + '.';
        return { aktif: false, proyek: proyek, pesan: pesan };
      }
      data[kunciData[i]] = jumlahDeretMonitor_(JSON.parse(res[i].getContentText() || '{}'));
    }
    var hasil = susunCloudRun_(data, filter, gratis);
    hasil.aktif = true; hasil.proyek = proyek; hasil.gratis = gratis; hasil.diperbarui = new Date(sekarang).toISOString();
    hasil.bulan = tglJakarta_(new Date(sekarang)).slice(0, 7);
    cache.put(kunci, JSON.stringify(hasil), CLOUD_RUN_CACHE_DETIK_);
    return hasil;
  } catch (e) {
    return { aktif: false, proyek: proyek, pesan: 'Gagal membaca Cloud Monitoring: ' + String(e.kode || e.message || e).slice(0, 120) };
  }
}
