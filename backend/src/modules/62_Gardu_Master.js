/**
 * v0.69.0 (permintaan kvlar 9 Okt 2026): Master Gardu untuk HP (Pengaturan > Master Gardu), dipakai menu
 * Pengukuran Gardu dan Berita Acara Gardu. Modul getMaster OPSIONAL: tidak ikut diunduh kalau HP tidak memintanya
 * (getMaster tanpa `modul` tetap hanya modul master dasar), dan hanya untuk akun yang punya akses menu terkait.
 *   gardu      db_Gardu status AKTIF + TIDAK AKTIF (TIDAK AKTIF hanya dipakai BA Penggantian / Pembongkaran).
 *              BONGKAR RAMPUNG / BATAL tidak dikirim. Akses: OPS_PENGUKURAN_GARDU atau OPS_BA_GARDU, atau
 *              (v0.74.0) akun PETUGAS YANDAL untuk memilih gardu di P0 Pengecekan Gardu.
 *   pejabatBa  db_Pejabat_BA (Pemeriksa / Mengetahui). Akses: OPS_BA_GARDU.
 */
var MENU_GARDU_ = { ukur: 'OPS_PENGUKURAN_GARDU', ba: 'OPS_BA_GARDU' };

var MODUL_MASTER_OPSIONAL_ = {
  gardu: function (sesi) {
    // v0.74.0: petugas YANDAL (Pengecekan Gardu P0) boleh membaca Master Gardu tanpa menu, hanya baca
    // v0.95.0: petugas HARTEK (menu OPS_HARTEK_INPUT) memilih nomor gardu + titiknya dari Master Gardu di HP, hanya baca
    var hartek = sesi && sesi.role === 'PETUGAS' && sesi.jenisTim === 'HARTEK' && !!aksesUntuk_(sesi.role, sesi.jenisTim, 'OPS_HARTEK_INPUT', aturanAkses_());
    // v1.0.21 (permintaan kvlar 23 Okt 2026): petugas INSPEKSI_GARDU (menu OPS_INSDU_INPUT) punya Master Gardu di HP, hanya baca
    var insdu = sesi && sesi.role === 'PETUGAS' && sesi.jenisTim === 'INSPEKSI_GARDU' && !!aksesUntuk_(sesi.role, sesi.jenisTim, 'OPS_INSDU_INPUT', aturanAkses_());
    if (!petugasYandal_(sesi) && !hartek && !insdu) wajibAksesSalahSatu_(sesi, [MENU_GARDU_.ukur, MENU_GARDU_.ba]);
    if (!cfg_().GARDU_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'GARDU_SHEET_ID');
    var t = cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu');
    return t.rows.filter(function (r) {
      var st = teksGarduLama_(r['Status Gardu']).toUpperCase();
      return r.gardu_id && teksGarduLama_(r['No Gardu']) && (st === 'AKTIF' || st === 'TIDAK AKTIF');
    }).map(barisGarduHp_).sort(function (a, b) { return a.no < b.no ? -1 : a.no > b.no ? 1 : 0; });
  },
  // v0.75.0: aturan Yandal (toggle admin "Pengukuran Gardu 2 Hari Sekali"), dibaca petugas YANDAL + admin
  aturanYandal: function (sesi) { return isiAturanYandal_(sesi); },
  pejabatBa: function (sesi) {
    wajibAksesSalahSatu_(sesi, [MENU_GARDU_.ba]);
    return tabel_('MASTER_SHEET_ID', 'db_Pejabat_BA').rows.filter(function (r) { return r.pejabat_id && teksGarduLama_(r.nama); }).map(function (r) {
      return { id: String(r.pejabat_id), nama: teksGarduLama_(r.nama), jabatan: teksGarduLama_(r.jabatan),
               peran: teksGarduLama_(r.peran).toUpperCase(), urutan: Number(r.urutan) || 0, aktif: isAktif_(r.aktif) };
    }).sort(function (a, b) { return a.urutan - b.urutan || (a.nama < b.nama ? -1 : 1); });
  }
};

/** Sesi wajib punya akses (LIHAT / UBAH) ke salah satu menu. Tanpa akses = AKSES_DITOLAK. */
function wajibAksesSalahSatu_(sesi, kode) {
  var aturan = aturanAkses_();
  var ada = kode.some(function (k) { return aksesUntuk_(sesi && sesi.role, sesi && sesi.jenisTim, k, aturan); });
  if (!ada) throw new SisiError_('AKSES_DITOLAK', kode.join('|'));
}

/** Angka sel (number / teks "12,5") -> number, kosong / bukan angka = null. */
function angkaHp_(v) {
  var n = angkaGarduLama_(v);
  return n === '' ? null : n;
}

/** Tanggal sel -> 'yyyy-MM-dd' (Date dari Sheets = tanggal WIB), kosong = ''. */
function tanggalHp_(v) {
  if (v === '' || v === null || v === undefined) return '';
  var t = tanggalLama_(v, Object.prototype.toString.call(v) === '[object Date]' ? undefined : v);
  return t || tglTeksJs_(v) || teksGarduLama_(v).slice(0, 10);   // v1.0.23: 'Fri Oct 16' (String(Date)) ikut terbaca
}

/** Satu baris db_Gardu -> bentuk ringkas untuk HP (kunci pendek, tanpa kolom audit). */
function barisGarduHp_(r) {
  var persen = angkaHp_(r['Persentase Beban (%)']);
  return {
    id: String(r.gardu_id), no: teksGarduLama_(r['No Gardu']).toUpperCase(), prefix: teksGarduLama_(r.Prefix),
    status: teksGarduLama_(r['Status Gardu']).toUpperCase(), asalNomor: teksGarduLama_(r['Asal Nomor']),
    alamat: teksGarduLama_(r.Alamat), penyulang: teksGarduLama_(r.Penyulang), section: teksGarduLama_(r.Section),
    sectionId: teksGarduLama_(r.section_id), ptsLbs: teksGarduLama_(r['PTS/LBS']),
    lat: angkaHp_(r.Lat), lng: angkaHp_(r.Long), konstruksi: teksGarduLama_(r.Konstruksi),
    kva: angkaHp_(r['Kapasitas (kVA)']), merk: teksGarduLama_(r.Merk), seri: teksGarduLama_(r['Nomor Seri']), tahun: angkaHp_(r.Tahun),
    jurusan: teksGarduLama_(r['Jurusan Terpasang']), asalTrafo: teksGarduLama_(r['Asal Trafo']),
    merkPhb: teksGarduLama_(r['Merk PHB-TR']), seriPhb: teksGarduLama_(r['Nomor Seri PHB-TR']), tahunPhb: angkaHp_(r['Tahun PHB-TR']),
    kepemilikan: teksGarduLama_(r.Kepemilikan), ownerId: teksGarduLama_(r.OwnerId), extRef: teksGarduLama_(r['External Reference']),
    baOperasi: teksGarduLama_(r['BA Pengoperasian']), tglOperasi: tanggalHp_(r['Tanggal Operasi']),
    baTerakhir: teksGarduLama_(r['BA Terakhir']), jenisBaTerakhir: teksGarduLama_(r['Jenis BA Terakhir']),
    tglBaTerakhir: tanggalHp_(r['Tanggal BA Terakhir']), jumlahBa: Number(r['Jumlah BA']) || 0,
    tglUkur: tanggalHp_(r['Tanggal Ukur Terakhir']), kodeUkur: teksGarduLama_(r['Kode Ukur Terakhir']),
    // v0.75.1: arus maks per fasa = arus nominal dari kapasitas (data lama dipakai kalau kapasitas kosong)
    arusMaks: arusNominalGardu_(r['Kapasitas (kVA)']) !== '' ? arusNominalGardu_(r['Kapasitas (kVA)']) : angkaHp_(r['Arus Maks per Fasa (A)']), bebanKva: angkaHp_(r['Pembebanan (kVA)']), persen: persen,
    waktuBeban: teksGarduLama_(r['Waktu Beban']), kategori: kategoriBeban_(persen === null ? '' : persen),
    // v1.0.17 (permintaan kvlar 22 Okt 2026): arus per fasa + tegangan pengukuran terakhir untuk rincian Pengukuran Gardu
    ukur: ukurAngkaHp_(r),
    sumberUkur: teksGarduLama_(r['Sumber Data']),
    // v1.0.23: kolom di atas = WBP; pengukuran LWBP (blok sendiri) + 7 isian cover gardu (Inspeksi Gardu)
    lwbp: ukurLwbpHp_(r),
    cover: coverGarduHp_(r),
    revision: Number(r.revision) || 0
  };
}

/** 10 angka pengukuran (nama kolom WBP / lama) -> {bebanR, ..., teganganTN}. */
function ukurAngkaHp_(u) {
  var o = {};
  YAN_NILAI_GARDU_.forEach(function (n) { o[n.kunci] = angkaHp_(u[n.kolom]); });
  return o;
}

/** v1.0.23: blok LWBP db_Gardu untuk HP (bentuk sama dengan kolom WBP). null = belum pernah diukur LWBP. */
function ukurLwbpHp_(r) {
  var b = ukurBlokGardu_(r, 'LWBP'), tgl = tanggalHp_(b['Tanggal Ukur Terakhir']);
  if (!tgl) return null;
  var persen = angkaHp_(b['Persentase Beban (%)']);
  return { tglUkur: tgl, kodeUkur: teksGarduLama_(b['Kode Ukur Terakhir']), bebanKva: angkaHp_(b['Pembebanan (kVA)']), persen: persen,
           kategori: kategoriBeban_(persen === null ? '' : persen), ukur: ukurAngkaHp_(b), sumberUkur: teksGarduLama_(b['Sumber Data']) };
}

/** v1.0.23: cover gardu (Inspeksi Gardu LWBP terbaru). null = belum ada. */
function coverGarduHp_(r) {
  var tgl = tanggalHp_(r['Tanggal Cover']);
  if (!tgl) return null;
  var o = { tanggal: tgl };
  Object.keys(COVER_GARDU_).forEach(function (k) { o[k] = teksGarduLama_(r[COVER_GARDU_[k]]); });
  return o;
}
