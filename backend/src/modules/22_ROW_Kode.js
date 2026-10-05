/**
 * getKodeRow (PRD 6. Endpoint > getKodeRow). Wajib dipanggil app setelah login/reinstall/ganti HP
 * dan setelah KODE_BENTROK, sebelum membuat data ROW baru.
 * Mengembalikan semua kode sub-tim sesi untuk satu tanggal (default hari ini WIB), TERMASUK yang BATAL,
 * karena nomor yang pernah terpakai tidak boleh dipakai ulang. Hanya baca, tanpa lock.
 * Sejak 3 Okt 2026 ikut mengirim isi tampilan (koordinat/KM/kendala header; section, jenis, koordinat eksekusi)
 * supaya salinan HP setelah login ulang / reinstall tidak kosong.
 */
function teksAtauNull_(v) { var s = v === null || v === undefined ? '' : String(v).trim(); return s ? s : null; }
function angkaAtauNull_(v) { return v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v); }

function getKodeRow_(sesi, data) {
  var d = validasi_(data, { tanggal: { tipe: 'tanggal' } });
  if (sesi.jenisTim !== 'ROW' || !sesi.timId) throw new SisiError_('AKSES_DITOLAK', 'bukan petugas ROW');
  var c = cfg_();
  if (!c.ROW_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'ROW_SHEET_ID');
  var w = stopwatch_();
  var sekarang = new Date();
  var hariIni = tglJakarta_(sekarang);
  var batasTgl = tglJakarta_(new Date(sekarang.getTime() - ROW_BATAS_HARI_ * 864e5));
  var tanggal = d.tanggal || hariIni;
  if (tanggal < batasTgl || tanggal > hariIni) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', tanggal);
  var J = bacaJendelaRow_(waktuRow_());
  var H = J.header, R = J.realisasi, E = J.eksekusi;
  w('baca');
  var urutDari = function (kode, jenis) {
    if (jenis === 'header') { var p = parseKodeHeaderRow_(kode); return p ? p.urut : 0; }
    var a = parseKodeAnak_(kode, jenis);
    return a ? a.urut : 0;
  };
  var header = H.rows.filter(function (r) {
    return String(r.tim_id) === sesi.timId && tanggalDariKode_(r['Kode Header']) === tanggal;
  });
  var idHeader = {};
  header.forEach(function (r) { idHeader[String(r.header_id)] = true; });
  var realisasi = R.rows.filter(function (r) { return idHeader[String(r.header_id)]; });
  var idReal = {};
  realisasi.forEach(function (r) { idReal[String(r.realisasi_id)] = true; });
  var eksekusi = E.rows.filter(function (r) { return idReal[String(r.realisasi_id)]; });

  var maks = function (rows, kolomKode, jenis) {
    return rows.reduce(function (m, r) { return Math.max(m, urutDari(String(r[kolomKode]), jenis)); }, 0);
  };
  var hasil = {
    tanggal: tanggal,
    headerBerikutnya: maks(header, 'Kode Header', 'header') + 1,
    header: header.map(function (r) {
      var anak = realisasi.filter(function (x) { return String(x.header_id) === String(r.header_id); });
      return { id: String(r.header_id), kode: String(r['Kode Header']), status: String(r.status),
               revision: Number(r.revision) || 0, pnyBerikutnya: maks(anak, 'Kode Pekerjaan', 'PNY') + 1,
               koordinatAwal: teksAtauNull_(r['Koordinat Awal']), koordinatAkhir: teksAtauNull_(r['Koordinat Akhir']),
               kmAwal: angkaAtauNull_(r['KM Awal']), kmAkhir: angkaAtauNull_(r['KM Akhir']), kendala: teksAtauNull_(r.Kendala) };
    }),
    realisasi: realisasi.map(function (r) {
      var anak = eksekusi.filter(function (x) { return String(x.realisasi_id) === String(r.realisasi_id); });
      return { id: String(r.realisasi_id), headerId: String(r.header_id), kode: String(r['Kode Pekerjaan']),
               penyulang: String(r.Penyulang), status: String(r.status), revision: Number(r.revision) || 0,
               eksBerikutnya: maks(anak, 'Kode Eksekusi', 'EKS') + 1 };
    }),
    eksekusi: eksekusi.map(function (r) {
      return { id: String(r.eksekusi_id), realisasiId: String(r.realisasi_id), kode: String(r['Kode Eksekusi']),
               sectionId: String(r.section_id), nomorTiang: String(r['Nomor Tiang'] || ''), status: String(r.status),
               jenisId: r.jenis_id ? String(r.jenis_id) : null, diameter: angkaAtauNull_(r.Diameter),
               revision: Number(r.revision) || 0, fotoLengkap: isAktif_(r.foto_lengkap),
               // isi tampilan, supaya salinan HP lengkap setelah login ulang / reinstall (bug 3 Okt 2026)
               section: teksAtauNull_(r.Section), jenisNama: teksAtauNull_(r['Jenis Pekerjaan']),
               koordinatTiang: teksAtauNull_(r['Koordinat Tiang']), koordinatPekerjaan: teksAtauNull_(r['Koordinat Pekerjaan']) };
    })
  };
  w('susun');
  if (c.ENV === 'staging') hasil._waktu = w.ringkas();
  return hasil;
}
