/**
 * C4A (permintaan Master Guswan 15 Nov 2026): menu Temuan Inspeksi admin (OPS_INPUT_TEMUAN) menjadi C4A.
 * Spec: docs/superpowers/specs/2026-11-14-c4a-sinkron-uiw-design.md
 *
 * Laporan C4A (tab c4a_laporan di SiSi_Temuan): 1 penyulang + 1 section, titik awal -> temuan -> titik akhir -> jarak jalan.
 *  - Satu laporan TERBUKA per akun admin. Laporan berlaku satu hari: hari berganti = ditutup otomatis memakai titik temuan
 *    terakhir (tanpa temuan = titik awal, jarak NOL). Dalam hari yang sama boleh buat laporan baru setelah titik akhir diambil.
 *  - c4a_id = 8 hex dibuat di HP (kunci offline + InspeksiID / id KMS di file UIW). Kirim ulang = duplikat.
 *  - HP kedua akun yang sama membuat laporan saat sudah ada yang terbuka = ditolak C4A_SUDAH_ADA + laporan yang ada
 *    (HP memindah temuannya ke laporan itu).
 * Kode laporan: C4A-<ULP><YYMMDD><NNN>. Kode temuan tetap pola PEG (simpanTemuanInspeksi_).
 */

var C4A_POLA_ID_ = /^[0-9a-f]{8}$/;
var C4A_SUMBER_TITIK_ = ['GPS', 'PETA'];
var C4A_KATEGORI_ = ['Komponen', 'Peralatan', 'Pohon'];

function skemaIdC4A_(wajib) { return { tipe: 'teks', wajib: !!wajib, maks: 8, pola: C4A_POLA_ID_ }; }

function tabelLaporanC4A_() { return tabelInsJar_('c4a_laporan'); }

/** Baris laporan untuk HP (camelCase). */
function laporanC4AKeHp_(r) {
  var angka = function (v) { return v === '' || v === null || v === undefined ? null : Number(v); };
  return {
    c4aId: String(r.c4a_id || ''), kodeC4a: String(r.kode_c4a || ''), tanggal: tglTeksC4A_(r.tanggal),
    penyulang: String(r.penyulang || ''), section: String(r.section || ''), sectionId: String(r.section_id || ''),
    koordinatAwal: String(r.koordinat_awal || ''), latAwal: angka(r.lat_awal), lngAwal: angka(r.lng_awal), sumberAwal: String(r.sumber_awal || ''),
    koordinatAkhir: String(r.koordinat_akhir || ''), latAkhir: angka(r.lat_akhir), lngAkhir: angka(r.lng_akhir), sumberAkhir: String(r.sumber_akhir || ''),
    jarakKm: angka(r.jarak_km), metodeJarak: String(r.metode_jarak || ''), statusJarak: String(r.status_jarak || ''),
    status: String(r.status || ''), ditutupOtomatis: r.ditutup_otomatis === true || String(r.ditutup_otomatis).toUpperCase() === 'TRUE',
    jumlahTemuan: Number(r.jumlah_temuan) || 0, revision: Number(r.revision) || 1
  };
}

/** Sel tanggal (teks / Date) jadi yyyy-MM-dd. */
function tglTeksC4A_(v) {
  if (v instanceof Date) return tglJakarta_(v);
  return String(v || '').slice(0, 10);
}

/** Laporan TERBUKA milik user, dari hari ini (laporan terbuka hari lalu dianggap sudah tertutup). */
function laporanTerbukaC4A_(rows, userId, hariIni) {
  return rows.filter(function (r) {
    return String(r.user_id) === String(userId) && String(r.status) === 'TERBUKA' && tglTeksC4A_(r.tanggal) === hariIni;
  })[0] || null;
}

/** Peta jenis_temuan_id -> { kode, kategori, temuan } dari kolom uiw_* db_Jenis_Temuan. */
function petaUiwJenis_() {
  var peta = {};
  tabel_('MASTER_SHEET_ID', 'db_Jenis_Temuan').rows.forEach(function (r) {
    peta[String(r.jenis_temuan_id)] = {
      kode: String(r.uiw_kode || '').trim(), kategori: String(r.uiw_kategori || '').trim(), temuan: String(r.uiw_temuan || '').trim()
    };
  });
  return peta;
}

/** Kategori UIW satu jenis temuan: Komponen / Peralatan / Pohon, belum dipetakan = Lainnya. */
function kategoriUiwTemuan_(jenisTemuanId, peta) {
  var p = peta[String(jenisTemuanId)];
  var k = p ? p.kategori : '';
  return C4A_KATEGORI_.indexOf(k) === -1 ? 'Lainnya' : k;
}

function ringkasanKosongC4A_() { return { Komponen: 0, Peralatan: 0, Pohon: 0, Lainnya: 0 }; }

/** Titik temuan terakhir (urut timestamp) satu laporan, atau null. */
function temuanTerakhirC4A_(rowsTemuan, c4aId) {
  var milik = rowsTemuan.filter(function (t) { return String(t.c4a_id) === String(c4aId) && t.lat !== '' && t.lat !== null && t.lat !== undefined; });
  milik.sort(function (a, b) { return String(a.timestamp) < String(b.timestamp) ? -1 : String(a.timestamp) > String(b.timestamp) ? 1 : 0; });
  return milik.length ? milik[milik.length - 1] : null;
}

/**
 * Tutup otomatis laporan TERBUKA dari hari sebelum hari ini. Titik akhir = temuan terakhir laporan itu; tanpa temuan =
 * titik awal dan jarak NOL (status_jarak SELESAI). WAJIB di dalam denganLock_ (dipanggil buat laporan + pemicu harian).
 */
function tutupOtomatisDalamC4A_(tl, rowsTemuan, hariIni) {
  var n = 0;
  tl.rows.forEach(function (r) {
    if (String(r.status) !== 'TERBUKA' || tglTeksC4A_(r.tanggal) >= hariIni) return;
    var t = temuanTerakhirC4A_(rowsTemuan, r.c4a_id);
    var u = {
      status: 'SELESAI', ditutup_otomatis: true, sumber_akhir: 'TEMUAN_TERAKHIR', waktu_akhir: sekarangIso_(),
      koordinat_akhir: t ? t.koordinat : r.koordinat_awal, lat_akhir: t ? t.lat : r.lat_awal, lng_akhir: t ? t.lng : r.lng_awal,
      diubah_oleh: 'SISTEM'
    };
    if (t) { u.status_jarak = 'MENUNGGU'; u.jarak_km = ''; u.metode_jarak = ''; }
    else { u.status_jarak = 'SELESAI'; u.jarak_km = 0; u.metode_jarak = 'NOL'; }
    ubahBaris_(tl, 'c4a_id', r.c4a_id, u);
    Object.keys(u).forEach(function (k) { r[k] = u[k]; });
    n++;
  });
  return n;
}

/** Pemicu harian (dan dipanggil sebelum buat laporan): tutup otomatis laporan hari lalu. Hasil = jumlah laporan ditutup. */
function tutupOtomatisC4A_() {
  // pemeriksaan murah dulu (hanya c4a_laporan, tanpa lock): tidak ada laporan TERBUKA dari hari lalu = tidak ada yang ditutup,
  // db_temuan_inspeksi (besar) tidak dibaca dan lock tidak diambil
  var hari = tanggalHariIniHartek_();
  if (!tabelLaporanC4A_().rows.some(function (r) { return String(r.status) === 'TERBUKA' && tglTeksC4A_(r.tanggal) < hari; })) return 0;
  return denganLock_(function () {
    var n = tutupOtomatisDalamC4A_(tabelLaporanC4A_(), tabelInsJar_(INSJAR_SHEET_.TEMUAN).rows, tanggalHariIniHartek_());
    if (n) jadwalkanSinkronUiw_();
    return n;
  }, 30000);
}

function buatLaporanC4A_(sesi, data) {
  wajibAdminTemuan_(sesi);
  var d = validasi_(data, {
    c4aId: skemaIdC4A_(true), penyulang: { tipe: 'teks', wajib: true, maks: 80 }, section: { tipe: 'teks', wajib: true, maks: 120 },
    koordinatAwal: { tipe: 'koordinat', wajib: true }, sumberAwal: { tipe: 'pilihan', wajib: true, pilihan: C4A_SUMBER_TITIK_ },
    waktuPerangkat: { tipe: 'waktu' }
  });
  var lokasi = lokasiJaringanInsJar_(d.penyulang, d.section, true);
  return denganLock_(function () {
    var tl = tabelLaporanC4A_();
    var ada = tl.rows.filter(function (r) { return String(r.c4a_id) === d.c4aId; })[0];
    if (ada) {
      if (String(ada.user_id) !== String(sesi.userId)) throw new SisiError_('C4A_ID_BENTROK', d.c4aId);
      var hp = laporanC4AKeHp_(ada);
      hp.duplikat = true;
      return hp;
    }
    var hariIni = tanggalHariIniHartek_();
    tutupOtomatisDalamC4A_(tl, tabelInsJar_(INSJAR_SHEET_.TEMUAN).rows, hariIni);
    var terbuka = laporanTerbukaC4A_(tl.rows, sesi.userId, hariIni);
    if (terbuka) return { ditolak: 'C4A_SUDAH_ADA', laporan: laporanC4AKeHp_(terbuka) };
    var awalan = 'C4A-' + cfg_().KODE_ULP + yymmddInsJar_(hariIni);
    var kode = awalan + pad3_(urutKodeInsJar_(tl.rows, 'kode_c4a', awalan));
    var sekarang = sekarangIso_();
    var baris = sisipAuditInsJar_({
      nomor: tl.rows.length + 1, kode_c4a: kode, tanggal: hariIni, hari: hariTanggalHartek_(hariIni), ulp: cfg_().ULP_NAMA,
      penyulang: lokasi.penyulang, section: lokasi.section,
      koordinat_awal: d.koordinatAwal.teks, lat_awal: d.koordinatAwal.lat, lng_awal: d.koordinatAwal.lng, waktu_awal: sekarang, sumber_awal: d.sumberAwal,
      koordinat_akhir: '', lat_akhir: '', lng_akhir: '', waktu_akhir: '', sumber_akhir: '',
      jarak_km: '', metode_jarak: '', status_jarak: '', status: 'TERBUKA', ditutup_otomatis: false, jumlah_temuan: 0,
      c4a_id: d.c4aId, section_id: lokasi.sectionId, user_id: sesi.userId, waktu_perangkat: d.waktuPerangkat || ''
    }, sesi, sekarang);
    tambahBaris_(tl, baris);
    auditLog_(sesi, 'C4A_BUAT', kode, lokasi.penyulang + ' · ' + lokasi.section, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return laporanC4AKeHp_(baris);
  }, 20000);
}

function tutupLaporanC4A_(sesi, data) {
  wajibAdminTemuan_(sesi);
  var d = validasi_(data, {
    c4aId: skemaIdC4A_(true), koordinatAkhir: { tipe: 'koordinat', wajib: true },
    sumberAkhir: { tipe: 'pilihan', wajib: true, pilihan: C4A_SUMBER_TITIK_ }, waktuPerangkat: { tipe: 'waktu' }
  });
  return denganLock_(function () {
    var tl = tabelLaporanC4A_();
    var r = laporanMilikC4A_(tl.rows, d.c4aId, sesi.userId);
    var otomatis = r.ditutup_otomatis === true || String(r.ditutup_otomatis).toUpperCase() === 'TRUE';
    if (String(r.status) === 'SELESAI' && !otomatis) {
      var hp = laporanC4AKeHp_(r);
      hp.duplikat = true;
      return hp;
    }
    // titik akhir admin selalu menang atas tutup otomatis (TEMUAN_TERAKHIR)
    var u = {
      status: 'SELESAI', ditutup_otomatis: false, sumber_akhir: d.sumberAkhir, waktu_akhir: sekarangIso_(),
      koordinat_akhir: d.koordinatAkhir.teks, lat_akhir: d.koordinatAkhir.lat, lng_akhir: d.koordinatAkhir.lng,
      jarak_km: '', metode_jarak: '', status_jarak: 'MENUNGGU', waktu_perangkat: d.waktuPerangkat || r.waktu_perangkat || '',
      diubah_oleh: sesi.userId
    };
    var rev = ubahBaris_(tl, 'c4a_id', d.c4aId, u);
    Object.keys(u).forEach(function (k) { r[k] = u[k]; });
    r.revision = rev;
    auditLog_(sesi, 'C4A_TUTUP', String(r.kode_c4a), d.sumberAkhir, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    jadwalkanSinkronUiw_();
    return laporanC4AKeHp_(r);
  }, 20000);
}

/** Laporan dengan c4aId milik user (galat C4A_TIDAK_DITEMUKAN / BUKAN_MILIK_ANDA). */
function laporanMilikC4A_(rows, c4aId, userId) {
  var r = rows.filter(function (x) { return String(x.c4a_id) === String(c4aId); })[0];
  if (!r) throw new SisiError_('C4A_TIDAK_DITEMUKAN', c4aId);
  if (String(r.user_id) !== String(userId)) throw new SisiError_('BUKAN_MILIK_ANDA', c4aId);
  return r;
}

/** Laporan terbuka akun ini (hari ini) + ringkasan kategori UIW temuan C4A hari ini milik akun ini. Hanya baca. */
function getLaporanC4A_(sesi, data) {
  wajibAdminTemuan_(sesi);
  validasi_(data || {}, {});
  var hariIni = tanggalHariIniHartek_();
  var rows = tabelLaporanC4A_().rows;
  var milik = {};
  rows.forEach(function (r) { if (String(r.user_id) === String(sesi.userId)) milik[String(r.c4a_id)] = true; });
  var peta = petaUiwJenis_();
  var ringkasan = ringkasanKosongC4A_();
  tabelInsJar_(INSJAR_SHEET_.TEMUAN).rows.forEach(function (t) {
    if (!milik[String(t.c4a_id)] || tglInsJar_(t) !== hariIni) return;
    ringkasan[kategoriUiwTemuan_(t.jenis_temuan_id, peta)]++;
  });
  var terbuka = laporanTerbukaC4A_(rows, sesi.userId, hariIni);
  // riwayat tab Laporan C4A (permintaan Master Guswan 15 Nov 2026): laporan akun yang SELESAI hari ini, terbaru dulu
  var riwayat = rows.filter(function (r) {
    return String(r.user_id) === String(sesi.userId) && String(r.status) === 'SELESAI' && tglTeksC4A_(r.tanggal) === hariIni;
  }).reverse().map(laporanC4AKeHp_);
  return { tanggal: hariIni, terbuka: terbuka ? laporanC4AKeHp_(terbuka) : null, ringkasan: ringkasan, riwayat: riwayat };
}

/* ===== temuan C4A (dipanggil simpanTemuanInspeksi_ bila c4aId terisi) ===== */

/** Laporan induk temuan: cukup ada dan milik user (boleh sudah SELESAI / ditutup otomatis: temuan offline susulan). */
function laporanUntukTemuanC4A_(rows, c4aId, userId) { return laporanMilikC4A_(rows, c4aId, userId); }

/**
 * Temuan admin di Laporan C4A. d = isian tervalidasi simpanTemuanInspeksi_. Penyulang, section, tanggal dari laporan;
 * kode tetap pola PEG (kodeTemuanAdminInsJar_). jumlah_temuan laporan ditulis tanpa menaikkan revision.
 */
function simpanTemuanC4A_(sesi, d) {
  // tanggal dari HP (antrean selalu mengirimnya) diabaikan: tanggal temuan = tanggal laporan
  ['penyulang', 'section', 'garduId'].forEach(function (k) { if (d[k]) throw new SisiError_('FIELD_TIDAK_DIKENAL', k); });
  if (d.objekInspeksi && d.objekInspeksi !== INSJAR_OBJEK_) throw new SisiError_('FIELD_TIDAK_DIKENAL', 'objekInspeksi');
  if (!d.uniqueid) throw new SisiError_('FIELD_WAJIB', 'uniqueid');
  return denganLock_(function () {
    var tt = tabelInsJar_(INSJAR_SHEET_.TEMUAN);
    var ulang = barisUlangInsJar_(tt.rows, 'temuan_id', d.idBaris, sesi.timId);
    if (ulang) return { temuanId: String(ulang.temuan_id), kodeTemuan: String(ulang.kode_temuan), duplikat: true };
    var tl = tabelLaporanC4A_();
    var lap = laporanUntukTemuanC4A_(tl.rows, d.c4aId, sesi.userId);
    if (tt.rows.some(function (t) { return String(t.uniqueid) === d.uniqueid; })) throw new SisiError_('UNIQUEID_BENTROK', d.uniqueid);
    var tanggal = tglTeksC4A_(lap.tanggal);
    var lokasi = { penyulang: String(lap.penyulang), section: String(lap.section), sectionId: String(lap.section_id || '') };
    var tierInspeksi = d.tierInspeksi || '';
    var jenis = jenisTemuanInsJar_(d.jenisTemuanId, INSJAR_OBJEK_, tierInspeksi);
    var k = kodeTemuanAdminInsJar_(tt.rows, tanggal, lokasi.penyulang);
    var id = d.idBaris || uuid_(), sekarang = sekarangIso_();
    tambahBaris_(tt, barisTemuanInsJar_(tt, d, lokasi, jenis, {
      kodeHeader: k.kodeHeader, kodeRealisasi: k.kodeRealisasi, kodeTemuan: k.kodeTemuan, tanggal: tanggal,
      ulp: cfg_().ULP_NAMA, tim: sesi.nama || sesi.username, tier: '', tierInspeksi: tierInspeksi, objekInspeksi: INSJAR_OBJEK_,
      headerId: '', realisasiId: '', timId: sesi.timId || '', sumber: 'ADMIN', c4aId: d.c4aId, uniqueid: d.uniqueid
    }, sesi, sekarang, id));
    var jumlah = tt.rows.filter(function (t) { return String(t.c4a_id) === d.c4aId; }).length + 1;
    var col = tl.header.indexOf('jumlah_temuan');
    tl.sheet.getRange(lap._baris, col + 1).setValue(jumlah);
    auditLog_(sesi, 'C4A_TEMUAN', k.kodeTemuan, jenis.nama, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    jadwalkanSinkronUiw_();
    return { temuanId: id, kodeTemuan: k.kodeTemuan, tanggal: tanggal, c4aId: d.c4aId, uniqueid: d.uniqueid, jumlahTemuan: jumlah };
  }, 20000);
}

/* ===== Arsip C4A ===== */

/**
 * Arsip C4A: satu baris per hari SEBELUM hari ini (semua admin), terbaru dulu. Rincian satu hari diambil HP lewat
 * getTemuanInspeksi({tanggal}) lalu disaring c4aId terisi. Rentang maks TEMUAN_RENTANG_MAKS_HARI_.
 */
function getArsipC4A_(sesi, data) {
  wajibAdminTemuan_(sesi);
  var d = validasi_(data, { dari: { tipe: 'tanggal', wajib: true }, sampai: { tipe: 'tanggal', wajib: true } });
  if (d.dari > d.sampai) throw new SisiError_('RENTANG_TIDAK_VALID', d.dari + '>' + d.sampai);
  var lama = Math.round((Date.parse(d.sampai + 'T00:00:00Z') - Date.parse(d.dari + 'T00:00:00Z')) / 864e5) + 1;
  if (lama > TEMUAN_RENTANG_MAKS_HARI_) throw new SisiError_('RENTANG_TERLALU_PANJANG', String(lama));
  var hariIni = tanggalHariIniHartek_();
  var masuk = function (tg) { return tg >= d.dari && tg <= d.sampai && tg < hariIni; };
  var hari = {};
  var ambil = function (tg) {
    if (!hari[tg]) { hari[tg] = ringkasanKosongC4A_(); hari[tg].tanggal = tg; hari[tg].laporan = 0; hari[tg].pny = {}; hari[tg].sec = {}; }
    return hari[tg];
  };
  var tglLaporan = {};
  tabelLaporanC4A_().rows.forEach(function (r) {
    var tg = tglTeksC4A_(r.tanggal);
    tglLaporan[String(r.c4a_id)] = tg;
    if (!masuk(tg)) return;
    var h = ambil(tg);
    h.laporan++;
    h.pny[String(r.penyulang)] = true;
    h.sec[String(r.penyulang) + '|' + String(r.section)] = true;
  });
  var peta = petaUiwJenis_();
  tabelInsJar_(INSJAR_SHEET_.TEMUAN).rows.forEach(function (t) {
    var tg = tglLaporan[String(t.c4a_id)];
    if (!tg || !masuk(tg)) return;
    ambil(tg)[kategoriUiwTemuan_(t.jenis_temuan_id, peta)]++;
  });
  var daftar = Object.keys(hari).sort().reverse().map(function (tg) {
    var h = hari[tg];
    return { tanggal: tg, jumlahLaporan: h.laporan, penyulang: Object.keys(h.pny).length, section: Object.keys(h.sec).length,
      Komponen: h.Komponen, Peralatan: h.Peralatan, Pohon: h.Pohon, Lainnya: h.Lainnya };
  });
  return { dari: d.dari, sampai: d.sampai, hari: daftar };
}
