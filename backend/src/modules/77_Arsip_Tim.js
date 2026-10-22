/**
 * v1.0.17 (permintaan kvlar 22 Okt 2026): ARSIP LAPORAN modul Hartek, Inspeksi Jaringan, Inspeksi Gardu, meniru tab
 * Arsip ROW (getArsipRow_): laporan tim sendiri dalam rentang tanggal, maks 31 hari per panggilan, sampai KEMARIN
 * (hari H ada di tab Hari ini). HP mengunduh per bulan, menyimpan di HP, lalu menampilkan kartu tahun > bulan > hari.
 * Hanya baca. Isi tiap laporan = dokumen bentuk get<Modul>Harian (header + rincian), jadi HP memakai ulang rincian dan
 * format WA yang sama dengan hari ini.
 */

var ARSIP_TIM_MAKS_HARI_ = 31;

/** dari / sampai wajib, dari <= sampai, sampai < hari ini, maks 31 hari. */
function rentangArsipTim_(data) {
  var d = validasi_(data, { dari: { tipe: 'tanggal', wajib: true }, sampai: { tipe: 'tanggal', wajib: true } });
  if (d.dari > d.sampai) throw new SisiError_('RENTANG_TIDAK_VALID', d.dari + '>' + d.sampai);
  if (d.sampai >= tanggalHariIniHartek_()) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', d.sampai);   // hari H tidak masuk arsip
  var hari = Math.round((Date.parse(d.sampai + 'T00:00:00Z') - Date.parse(d.dari + 'T00:00:00Z')) / 864e5) + 1;
  if (hari > ARSIP_TIM_MAKS_HARI_) throw new SisiError_('RENTANG_TERLALU_PANJANG', String(hari));
  return d;
}

/** Urut tanggal terbaru dulu. */
function urutArsipTim_(a, b) { return a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : 0; }

function getArsipHartek_(sesi, data) {
  wajibPetugasHartek_(sesi);
  var d = rentangArsipTim_(data);
  var hdr = tabelHartek_(HARTEK_SHEET_.HEADER).rows.filter(function (h) {
    var tg = tglHartek_(h);
    return String(h.tim_id) === String(sesi.timId) && h.status === 'AKTIF' && tg >= d.dari && tg <= d.sampai;
  });
  if (!hdr.length) return { dari: d.dari, sampai: d.sampai, laporan: [] };
  var pg = tabelHartek_(HARTEK_SHEET_.PG).rows, pk = tabelHartek_(HARTEK_SHEET_.PEKERJAAN).rows, mt = tabelHartek_(HARTEK_SHEET_.MATERIAL).rows;
  var gr = tabelHartek_(HARTEK_SHEET_.GROUNDING).rows, pm = tabelHartek_(HARTEK_SHEET_.PEMERATAAN).rows;
  return {
    dari: d.dari, sampai: d.sampai,
    laporan: hdr.map(function (h) { return dokHartekBaris_(h, tglHartek_(h), pg, pk, mt, gr, pm); }).sort(urutArsipTim_)
  };
}

function getArsipInsJar_(sesi, data) {
  wajibPetugasInsJar_(sesi);
  var d = rentangArsipTim_(data);
  var hdr = tabelInsJar_(INSJAR_SHEET_.HEADER).rows.filter(function (h) {
    var tg = tglInsJar_(h);
    return String(h.tim_id) === String(sesi.timId) && h.status === 'AKTIF' && tg >= d.dari && tg <= d.sampai;
  });
  if (!hdr.length) return { dari: d.dari, sampai: d.sampai, laporan: [] };
  var real = tabelInsJar_(INSJAR_SHEET_.REALISASI).rows, temu = tabelInsJar_(INSJAR_SHEET_.TEMUAN).rows;
  return {
    dari: d.dari, sampai: d.sampai,
    laporan: hdr.map(function (h) { return dokInsJarBaris_(h, tglInsJar_(h), real, temu); }).sort(urutArsipTim_)
  };
}

function getArsipInsDu_(sesi, data) {
  wajibPetugasInsDu_(sesi);
  var d = rentangArsipTim_(data);
  var hdr = tabelInsDu_(INSDU_SHEET_.HEADER).rows.filter(function (h) {
    var tg = tglInsJar_(h);
    return String(h.tim_id) === String(sesi.timId) && String(h.status || 'AKTIF') === 'AKTIF' && tg >= d.dari && tg <= d.sampai;
  });
  if (!hdr.length) return { dari: d.dari, sampai: d.sampai, laporan: [] };
  var tR = tabelInsDu_(INSDU_SHEET_.REALISASI).rows, tP = tabelInsDu_(INSDU_SHEET_.PENGUKURAN).rows, tT = tabelInsDu_(INSJAR_SHEET_.TEMUAN).rows;
  return {
    dari: d.dari, sampai: d.sampai,
    laporan: hdr.map(function (h) { return dokInsDuBaris_(h, tglInsJar_(h), tR, tP, tT); }).sort(urutArsipTim_)
  };
}
