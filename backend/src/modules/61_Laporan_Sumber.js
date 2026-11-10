/**
 * v1.0.38: sumber data Laporan UP3 di luar modul ROW / Hartek / Inspeksi (dipisah dari 60_Laporan_UP3.js supaya file itu
 * tidak makin besar). Dipakai laporanUp3_ (teksUp3_ bagian A. Gangguan Penyulang dan F. P0 Yantek).
 *   - Gangguan penyulang: salinan History Gangguan (ggn_Penyulang), PMT | Section sama dengan grafik website.
 *   - P0 Yantek: P0 Yandal (yan_P0) pekerjaan ROW berbobot 4 / 5.
 * Masing-masing dibaca sekali per eksekusi (getRingkasanLaporan menyusun 7 tanggal). Gagal / belum diatur = null ("-").
 */

/**
 * v1.0.38: P0 Yantek = P0 Yandal tanggal itu dengan pekerjaan ROW (nama "ROW (...)", bobot berapa pun) ATAU pekerjaan lain
 * berbobot 4 / 5; tidak dibatalkan dan tidak Rejected. Bobot dari baris P0 (bisa diubah admin saat approval). Murni.
 */
function hitungP0YantekLaporan_(rows, tanggal) {
  return (rows || []).filter(function (r) { return tglSel_(r.Tanggal) === tanggal && p0YantekMasuk_(r); }).length;
}

/** v1.0.44: satu baris P0 masuk hitungan P0 Yantek (dipakai juga GASPOL UP3 kolom CFA). Murni. */
function p0YantekMasuk_(r) {
  var bobot = Number(r.Bobot);
  return !!r.p0_id && (/^ROW \(/i.test(String(r['Nama Pekerjaan'] || '').trim()) || bobot === 4 || bobot === 5) && String(r.status || 'AKTIF') !== 'BATAL' && String(r['Status Approval'] || '').trim() !== 'Rejected';
}

var P0_LAPORAN_ROWS_ = { rows: null };   // satu baca per eksekusi
function p0YantekLaporan_(tanggal) {
  if (!cfg_().YANDAL_SHEET_ID) return null;
  try {
    if (!P0_LAPORAN_ROWS_.rows) P0_LAPORAN_ROWS_.rows = bacaSheetYandal_(['yan_P0']).yan_P0.rows;
    return hitungP0YantekLaporan_(P0_LAPORAN_ROWS_.rows, tanggal);
  } catch (e) {
    console.warn('P0 Yantek Laporan UP3 tidak terbaca: ' + (e.kode || e.message));
    return null;
  }
}

/**
 * v1.0.38: kategori peralatan gangguan (sama dengan web/src/gangguan.js kategoriAlat): jenis_peralatan PMT = 'pmt', jenis
 * lain (ACR / OG / ...) = 'section'; jenis kosong = nama peralatan berawalan PMT. Murni.
 */
function kategoriAlatGgn_(o) {
  var jenis = String((o && o.jenis_peralatan) || '').trim().toUpperCase();
  if (jenis) return jenis === 'PMT' ? 'pmt' : 'section';
  return /^PMT\b/i.test(String((o && o.peralatan) || '').trim()) ? 'pmt' : 'section';
}

/** v1.0.38: hitung gangguan penyulang tanggal itu + komulatif bulan (tgl 1 s.d. tanggal) per kategori. Murni. */
function hitungGangguanLaporan_(rows, tanggal) {
  var h = { hari: { pmt: 0, section: 0 }, komulatif: { pmt: 0, section: 0 } }, bulan = tanggal.slice(0, 7);
  (rows || []).forEach(function (o) {
    var w = o.waktu_padam instanceof Date ? tglJakarta_(o.waktu_padam) : String(o.waktu_padam || '').slice(0, 10);
    if (!o.penyulang || w.slice(0, 7) !== bulan || w > tanggal) return;
    var k = kategoriAlatGgn_(o);
    h.komulatif[k] += 1;
    if (w === tanggal) h.hari[k] += 1;
  });
  return h;
}

/** v1.0.38: gangguan penyulang untuk Laporan UP3 dari salinan History Gangguan. Belum diatur / gagal = null ("-"). */
var GGN_LAPORAN_ROWS_ = { rows: null };   // satu baca per eksekusi (getRingkasanLaporan menyusun 7 tanggal)
function gangguanLaporan_(tanggal) {
  if (!cfg_().GANGGUAN_SHEET_ID) return null;
  try {
    if (!GGN_LAPORAN_ROWS_.rows) GGN_LAPORAN_ROWS_.rows = tabel_('GANGGUAN_SHEET_ID', GGN_TAB_.penyulang.sheet).rows;
    return hitungGangguanLaporan_(GGN_LAPORAN_ROWS_.rows, tanggal);
  } catch (e) {
    console.warn('Gangguan Laporan UP3 tidak terbaca: ' + (e.kode || e.message));
    return null;
  }
}
