/**
 * v1.0.51 (permintaan Master Guswan 31 Okt 2026): menu web Checkpoint Jaringan (OPS_CHECKPOINT), port v1 "Data Pendukung CheckPoint"
 * (Tek-Data-Checkpoint). Satu aksi, dimuat per sub-tab supaya ringan; filter Penyulang / Section di browser.
 *   getCheckpoint { bagian, tahun }
 *     har      -> { tahun, kolom, baris, penyulang } = rekap GASPOL tahun itu (64_Laporan_Gaspol.js); matriks kriteria x
 *                 bulan / minggu (minggu ke = ceil(tanggal / 7), sama v1) disusun di browser
 *     cover    -> { gardu } = getCoverGardu (31_Gardu_Master.js)
 *     gangguan -> isi getHistoriGangguan 1 Jan .. 31 Des tahun itu (s.d. hari ini untuk tahun berjalan)
 *     temuan   -> isi getRekapJenisTemuan tahun itu
 * Semua jawaban membawa master = [{ penyulang, section }] dari db_Jaringan (aktif), sumber tunggal pilihan dropdown Penyulang /
 * Section (data sumber bisa beda tulisan: Palas / PALAS; pencocokan di browser tanpa beda huruf besar / kecil).
 * Akses: admin (PETUGAS ditolak) + menu OPS_CHECKPOINT (db_Menu platform WEB / KEDUANYA).
 */
var BAGIAN_CHECKPOINT_ = ['har', 'cover', 'gangguan', 'temuan'];

function getCheckpoint_(sesi, data) {
  wajibAdminGgn_(sesi);
  var d = validasi_(data, { bagian: { tipe: 'pilihan', wajib: true, pilihan: BAGIAN_CHECKPOINT_ }, tahun: { tipe: 'angka', bulat: true, min: 2022, max: 2100 } });
  var hariIni = tglJakarta_(new Date()), tahunIni = Number(hariIni.slice(0, 4));
  var tahun = Number(d.tahun) || tahunIni;
  if (tahun < 2022 || tahun > tahunIni) throw new SisiError_('DI_LUAR_RENTANG', 'tahun');
  var dari = tahun + '-01-01', sampai = tahun === tahunIni ? hariIni : tahun + '-12-31';
  var hasil;
  if (d.bagian === 'cover') hasil = daftarCoverGardu_();
  else if (d.bagian === 'gangguan') hasil = getHistoriGangguan_(sesi, { dari: dari, sampai: sampai });
  else if (d.bagian === 'temuan') hasil = getRekapJenisTemuan_(sesi, { dari: dari, sampai: sampai });
  else {
    var r = rekapGaspol_({ dari: dari, sampai: sampai });
    hasil = { tahun: tahun, kolom: GASPOL_KOLOM_, baris: r.map(function (x) { return x.baris; }), penyulang: r.map(function (x) { return x.penyulang; }) };
  }
  hasil.master = masterJaringanCheckpoint_();
  return hasil;
}

/** Penyulang + section AKTIF db_Jaringan (master), urut penyulang lalu urutan section. */
function masterJaringanCheckpoint_() {
  var j = masterRow_().jaringan;
  return Object.keys(j).map(function (id) { return j[id]; }).filter(function (x) { return x.aktif && x.penyulang; })
    .sort(function (a, b) { return a.penyulang < b.penyulang ? -1 : a.penyulang > b.penyulang ? 1 : a.urutan - b.urutan || a.baris - b.baris; })
    .map(function (x) { return { penyulang: x.penyulang, section: x.section }; });
}
