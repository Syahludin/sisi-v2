/**
 * v0.74.0 (draf disetujui Master Guswan 9 Okt 2026): Pengecekan Gardu = anak P0 "Pengecekan Gardu" (yan_Gardu, 90 kolom).
 *
 *  simpanGarduYandal      data satu pengukuran gardu: gardu dipilih dari Master Gardu (db_Gardu AKTIF) di penyulang P0,
 *                         Beban R/S/T/N (A) + Tegangan R-S/R-T/S-T/R-N/S-N/T-N (V) + satu Catatan (maks 300).
 *                         Kirim ulang = tidak dobel (kunci ukur_id). Sesudah disimpan gardu TERKUNCI; angka + catatan
 *                         boleh dikoreksi selama P0 belum SELESAI (hasil + master dihitung ulang).
 *  uploadFotoGarduYandal  satu foto per nilai ukur (10 wajib) + Foto Kondisi / Temuan Gardu (opsional), kamera SiSi saja,
 *                         foto yang sudah diterima tidak bisa diganti. BEBAN_R wajib PERTAMA: Jam Ukur, Waktu Beban,
 *                         Koordinat dan Jarak ke Gardu diambil dari foto ini.
 *
 * Hasil dihitung SERVER (hasilUkurGardu_): Arus Maks per Fasa = arus nominal trafo kVA x 1000 / (akar 3 x 400) (v0.75.1); Pembebanan kVA = (R x RN + S x SN + T x TN) / 1000;
 * % = kVA / Kapasitas x 100; Kategori Underload < 50, Cukup < 80, Overload < 100, Buruk >= 100 (kategoriBeban_);
 * Ketidakseimbangan = (max - rata2) / rata2 x 100 (R,S,T); Waktu Beban WBP 17:00-21:59 WIB, selain itu LWBP.
 * Master (db_Gardu) diperbarui begitu 10 foto wajib lengkap (pengukuran terbukti foto), lalu setiap koreksi angka:
 * Tanggal / Kode Ukur Terakhir, Arus Maks, Pembebanan, Persentase, Waktu Beban, Kategori, ukur_id_terakhir.
 * Pengukuran yang lebih lama dari ukur terakhir di master tidak menimpa (Diterapkan ke Master = TIDAK).
 *
 * Syarat: P0 milik tim + shift token, Nama Pekerjaan "Pengecekan Gardu" (wajib penyulang), foto Sebelum P0 sudah di
 * server, P0 belum SELESAI, SATU pengukuran per P0. Foto Sesudah P0 Pengecekan Gardu ditolak kalau 10 foto wajib belum
 * lengkap (cekGarduSebelumSesudah_, dipanggil uploadFotoP0Yandal_). Guard, lock, tulisBlok_, audit sama dengan switching.
 */
var YAN_PEKERJAAN_GARDU_ = 'Pengecekan Gardu';
var YAN_GARDU_MAKS_PER_P0_ = 1;
var YAN_BEBAN_MAKS_ = 3000;      // ampere sisi TR
var YAN_TEGANGAN_MAKS_ = 1000;   // volt sisi TR
var YAN_WBP_JAM_ = { mulai: 17, sampai: 22 };   // WBP 17:00 sampai sebelum 22:00 WIB

/** Nilai ukur: kunci data HP, kolom sheet, slot foto (urutan = urutan di form HP). */
var YAN_NILAI_GARDU_ = [
  { kunci: 'bebanR', kolom: 'Beban R (A)', slot: 'BEBAN_R', label: 'Beban R', jenis: 'BEBAN' },
  { kunci: 'bebanS', kolom: 'Beban S (A)', slot: 'BEBAN_S', label: 'Beban S', jenis: 'BEBAN' },
  { kunci: 'bebanT', kolom: 'Beban T (A)', slot: 'BEBAN_T', label: 'Beban T', jenis: 'BEBAN' },
  { kunci: 'bebanN', kolom: 'Beban N (A)', slot: 'BEBAN_N', label: 'Beban N', jenis: 'BEBAN' },
  { kunci: 'teganganRS', kolom: 'Tegangan R-S (V)', slot: 'TEGANGAN_RS', label: 'Tegangan R-S', jenis: 'TEGANGAN' },
  { kunci: 'teganganRT', kolom: 'Tegangan R-T (V)', slot: 'TEGANGAN_RT', label: 'Tegangan R-T', jenis: 'TEGANGAN' },
  { kunci: 'teganganST', kolom: 'Tegangan S-T (V)', slot: 'TEGANGAN_ST', label: 'Tegangan S-T', jenis: 'TEGANGAN' },
  { kunci: 'teganganRN', kolom: 'Tegangan R-N (V)', slot: 'TEGANGAN_RN', label: 'Tegangan R-N', jenis: 'TEGANGAN' },
  { kunci: 'teganganSN', kolom: 'Tegangan S-N (V)', slot: 'TEGANGAN_SN', label: 'Tegangan S-N', jenis: 'TEGANGAN' },
  { kunci: 'teganganTN', kolom: 'Tegangan T-N (V)', slot: 'TEGANGAN_TN', label: 'Tegangan T-N', jenis: 'TEGANGAN' }
];
var YAN_SLOT_GARDU_WAJIB_ = YAN_NILAI_GARDU_.map(function (n) { return n.slot; });
var YAN_SLOT_GARDU_ = YAN_SLOT_GARDU_WAJIB_.concat(['KONDISI']);

/**
 * yan_Gardu (90 kolom A-CL). Kode Pengukuran Gardu = <Kode P0>-GRD.nnn (nomor per P0).
 * A Identitas | B Gardu | C Lokasi | D Pengukuran | E Hasil | F Waktu | G Foto Beban | H Foto Tegangan |
 * I Kondisi / Temuan | J Audit | K Teknis.
 */
var YAN_GARDU_HEADER_ = [
  // A Identitas
  'No', 'Kode Header', 'Kode Shift', 'Kode P0', 'Kode Pengukuran Gardu', 'ULP', 'Hari', 'Tanggal', 'Tim', 'Shift', 'Petugas',
  // B Gardu
  'Penyulang', 'Section', 'No Gardu', 'Alamat', 'Kapasitas (kVA)',
  // C Lokasi
  'Koordinat', 'Lat', 'Long', 'Jarak ke Gardu (m)',
  // D Pengukuran
  'Jam Ukur', 'Waktu Beban', 'Beban R (A)', 'Beban S (A)', 'Beban T (A)', 'Beban N (A)',
  'Tegangan R-S (V)', 'Tegangan R-T (V)', 'Tegangan S-T (V)', 'Tegangan R-N (V)', 'Tegangan S-N (V)', 'Tegangan T-N (V)',
  // E Hasil
  'Arus Maks per Fasa (A)', 'Pembebanan (kVA)', 'Persentase Beban (%)', 'Kategori Beban', 'Ketidakseimbangan Beban (%)',
  'Diterapkan ke Master',
  // F Waktu
  'Sumber Waktu', 'Selisih Jam HP (menit)', 'Waktu Diterima',
  // G Foto Beban
  'Foto Beban R', 'Link Drive Beban R', 'Foto Beban S', 'Link Drive Beban S', 'Foto Beban T', 'Link Drive Beban T',
  'Foto Beban N', 'Link Drive Beban N',
  // H Foto Tegangan
  'Foto Tegangan R-S', 'Link Drive Tegangan R-S', 'Foto Tegangan R-T', 'Link Drive Tegangan R-T',
  'Foto Tegangan S-T', 'Link Drive Tegangan S-T', 'Foto Tegangan R-N', 'Link Drive Tegangan R-N',
  'Foto Tegangan S-N', 'Link Drive Tegangan S-N', 'Foto Tegangan T-N', 'Link Drive Tegangan T-N',
  // I Kondisi / Temuan
  'Foto Kondisi / Temuan Gardu', 'Link Drive Kondisi / Temuan Gardu', 'Catatan',
  // J Audit
  'Input Oleh', 'Timestamp', 'Timestamp Update',
  // K Teknis
  'ukur_id', 'p0_id', 'shift_id', 'tim_id', 'gardu_id', 'section_id',
  'foto_id_beban_r', 'foto_id_beban_s', 'foto_id_beban_t', 'foto_id_beban_n',
  'foto_id_tegangan_rs', 'foto_id_tegangan_rt', 'foto_id_tegangan_st', 'foto_id_tegangan_rn', 'foto_id_tegangan_sn',
  'foto_id_tegangan_tn', 'foto_id_kondisi', 'foto_meta', 'install_id', 'status', 'revision', 'dibuat_oleh', 'diubah_oleh'];

/** Kolom sheet per slot foto gardu. */
function kolomFotoGardu_(slot) {
  if (slot === 'KONDISI') {
    return { foto: 'Foto Kondisi / Temuan Gardu', link: 'Link Drive Kondisi / Temuan Gardu', id: 'foto_id_kondisi', label: 'Kondisi / Temuan' };
  }
  var n = YAN_NILAI_GARDU_.filter(function (x) { return x.slot === slot; })[0];
  if (!n) throw new SisiError_('PILIHAN_TIDAK_VALID', slot);
  return { foto: 'Foto ' + n.label, link: 'Link Drive ' + n.label, id: 'foto_id_' + slot.toLowerCase(), label: n.label };
}

/** P0 ini butuh pengukuran gardu (Nama Pekerjaan "Pengecekan Gardu", huruf besar / kecil bebas). */
function p0Gardu_(nama) { return kunciNama_(nama) === kunciNama_(YAN_PEKERJAAN_GARDU_); }

/** P0 Pengecekan Gardu wajib penyulang DAN section (v0.87.11: section menyaring gardu yang muncul di HP,
 *  supaya tidak terlalu banyak gardu yang tidak perlu tampil). */
function cekLokasiGarduP0_(lokasi) {
  if (!lokasi.penyulang) throw new SisiError_('FIELD_WAJIB', 'penyulang');
  if (!lokasi.sectionId) throw new SisiError_('FIELD_WAJIB', 'section');
}

/** Waktu Beban dari jam WIB: WBP 17:00-21:59, selain itu LWBP. */
function waktuBebanGardu_(ms) {
  if (!isFinite(ms)) return '';
  var jam = new Date(ms + 7 * 3600e3).getUTCHours();
  return jam >= YAN_WBP_JAM_.mulai && jam < YAN_WBP_JAM_.sampai ? 'WBP' : 'LWBP';
}

/**
 * Hasil pengukuran (fungsi murni, dipakai juga test). n = { bebanR.., teganganRN.. } angka, kva = kapasitas trafo.
 * Kapasitas kosong / 0 = Persentase + Kategori kosong (tidak bisa dihitung).
 */
var YAN_TEGANGAN_NOMINAL_V_ = 400;   // v0.75.1: tegangan nominal TR (fasa-fasa) untuk arus maks per fasa

/** v0.75.1: Arus Maks per Fasa (A) = arus nominal trafo = kVA x 1000 / (akar 3 x 400 V). Kapasitas kosong = ''. */
function arusNominalGardu_(kva) {
  var k = Number(kva);
  return isFinite(k) && k > 0 ? bulat_(k * 1000 / (Math.sqrt(3) * YAN_TEGANGAN_NOMINAL_V_), 2) : '';
}

function hasilUkurGardu_(n, kva) {
  var r = Number(n.bebanR) || 0, s = Number(n.bebanS) || 0, t = Number(n.bebanT) || 0;
  var maks = Math.max(r, s, t), rata = (r + s + t) / 3;
  var beban = (r * (Number(n.teganganRN) || 0) + s * (Number(n.teganganSN) || 0) + t * (Number(n.teganganTN) || 0)) / 1000;
  var kap = Number(kva);
  var persen = isFinite(kap) && kap > 0 ? bulat_(beban / kap * 100, 2) : '';
  return {
    arusMaks: arusNominalGardu_(kva), kva: bulat_(beban, 2), persen: persen, kategori: kategoriBeban_(persen),
    tidakSeimbang: rata > 0 ? bulat_((maks - rata) / rata * 100, 2) : 0
  };
}

function kolomHasilGardu_(h) {
  return { 'Arus Maks per Fasa (A)': h.arusMaks, 'Pembebanan (kVA)': h.kva, 'Persentase Beban (%)': h.persen,
           'Kategori Beban': h.kategori, 'Ketidakseimbangan Beban (%)': h.tidakSeimbang };
}

/** Kode berikutnya per P0 (semua status): <Kode P0>-GRD.nnn. */
function kodeGarduBerikut_(rowsP0, kodeP0) {
  var maks = 0;
  rowsP0.forEach(function (r) {
    var m = /-GRD\.(\d+)$/.exec(teksP0_(r['Kode Pengukuran Gardu']));
    if (m) maks = Math.max(maks, Number(m[1]));
  });
  return kodeP0 + '-GRD.' + pad3_(maks + 1);
}

/** P0 induk (tim + shift token, aktif, Pengecekan Gardu, foto Sebelum sudah di server). */
function p0IndukGardu_(rowsP0, sesi, shift, p0Id) {
  var l = rowsP0.filter(function (x) { return String(x.p0_id) === String(p0Id); });
  if (!l.length) throw new SisiError_('DATA_TIDAK_DITEMUKAN', p0Id);
  if (l.length > 1) throw new SisiError_('DATA_GANDA', p0Id);
  var r = l[0];
  if (String(r.tim_id) !== String(sesi.timId) || String(r.shift_id) !== String(shift.shift_id)) throw new SisiError_('BUKAN_MILIK_TIM', p0Id);
  if (String(r.status || 'AKTIF') === 'BATAL') throw new SisiError_('SUDAH_BATAL', p0Id);
  if (!p0Gardu_(r['Nama Pekerjaan'])) throw new SisiError_('BUKAN_PENGECEKAN_GARDU', teksP0_(r['Nama Pekerjaan']));
  if (!teksP0_(r.foto_id_sebelum)) throw new SisiError_('URUTAN_FOTO', 'foto SEBELUM P0 belum ada');
  return r;
}

/** db_Gardu (struktur dikunci) untuk pengukuran. */
function tabelGarduUkur_() {
  if (!cfg_().GARDU_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'GARDU_SHEET_ID');
  return cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu');
}

/** Gardu master: wajib ada, AKTIF, di penyulang P0. */
function garduUntukUkur_(tG, garduId, penyulangP0) {
  var l = tG.rows.filter(function (x) { return String(x.gardu_id) === String(garduId); });
  if (!l.length) throw new SisiError_('GARDU_TIDAK_DIKENAL', garduId);
  if (l.length > 1) throw new SisiError_('DATA_GANDA', garduId);
  var g = l[0];
  if (teksP0_(g['Status Gardu']).toUpperCase() !== 'AKTIF') throw new SisiError_('GARDU_TIDAK_AKTIF', teksP0_(g['No Gardu']));
  if (!teksP0_(penyulangP0)) throw new SisiError_('FIELD_WAJIB', 'penyulang P0');
  if (kunciNama_(g.Penyulang) !== kunciNama_(penyulangP0)) throw new SisiError_('GARDU_BUKAN_PENYULANG', teksP0_(g['No Gardu']));
  return g;
}

function fotoGarduLengkap_(r) { return YAN_SLOT_GARDU_WAJIB_.every(function (s) { return !!teksP0_(r[kolomFotoGardu_(s).id]); }); }

/**
 * Terapkan hasil ke db_Gardu (dalam lock yang sama). Hanya kalau 10 foto wajib lengkap dan Jam Ukur ada.
 * Ukur lain yang lebih baru di master = tidak ditimpa. Hasil 'YA' / 'TIDAK' / '' (belum lengkap).
 */
function terapkanUkurGardu_(r, sesi, iso) {
  if (!fotoGarduLengkap_(r) || !teksP0_(r['Jam Ukur'])) return '';
  var tG = tabelGarduUkur_();
  var g = tG.rows.filter(function (x) { return String(x.gardu_id) === String(r.gardu_id); })[0];
  if (!g || teksP0_(g['Status Gardu']).toUpperCase() !== 'AKTIF') return 'TIDAK';
  // v1.0.23: Jam Ukur bisa sel tanggal (diubah Sheets), dulu dipotong jadi 'Fri Oct 16'. Blok master sesuai periode.
  var tgl = tglSel_(r['Jam Ukur']);
  if (!tgl) return '';
  var periode = periodeUkurRg_(r['Waktu Beban'], jamUkurSel_(r['Jam Ukur'])) || 'WBP';
  var blok = ukurBlokGardu_(g, periode);
  var tglMaster = tglSel_(blok['Tanggal Ukur Terakhir']);
  var milikIni = String(blok.ukur_id_terakhir || '') === String(r.ukur_id);
  if (!milikIni && tglMaster && tglMaster > tgl) return 'TIDAK';
  var angka = {};   // v0.79.0: 10 angka pengukuran ikut ke master
  YAN_NILAI_GARDU_.forEach(function (n) { angka[n.kolom] = r[n.kolom]; });
  tulisBlok_(tG, [{ r: g, u: kolomUkurPeriode_(periode, Object.assign(angka, {
    'Tanggal Ukur Terakhir': tgl, 'Kode Ukur Terakhir': teksP0_(r['Kode Pengukuran Gardu']),
    'Arus Maks per Fasa (A)': r['Arus Maks per Fasa (A)'], 'Pembebanan (kVA)': r['Pembebanan (kVA)'],
    'Persentase Beban (%)': r['Persentase Beban (%)'], 'Kategori Beban': teksP0_(r['Kategori Beban']),
    'Sumber Data': 'Pengecekan Gardu Yandal', ukur_id_terakhir: String(r.ukur_id),
    'Diubah Oleh': sesi.nama || sesi.username, 'Timestamp Update': iso, diubah_oleh: sesi.userId
  })) }], [], { bolehId: ['ukur_id_terakhir', 'ukur_id_lwbp'] });
  return 'YA';
}

function jawabGarduYandal_(r) {
  var angka = function (v) { return v === '' || v === null || v === undefined || !isFinite(Number(v)) ? null : Number(v); };
  return {
    ukurId: String(r.ukur_id), p0Id: String(r.p0_id), kodeUkur: teksP0_(r['Kode Pengukuran Gardu']),
    garduId: String(r.gardu_id), noGardu: teksP0_(r['No Gardu']),
    hasil: { arusMaks: angka(r['Arus Maks per Fasa (A)']), kva: angka(r['Pembebanan (kVA)']), persen: angka(r['Persentase Beban (%)']),
             kategori: teksP0_(r['Kategori Beban']), tidakSeimbang: angka(r['Ketidakseimbangan Beban (%)']),
             waktuBeban: teksP0_(r['Waktu Beban']), jarakM: angka(r['Jarak ke Gardu (m)']) },
    diterapkan: teksP0_(r['Diterapkan ke Master']),
    fotoServer: YAN_SLOT_GARDU_.filter(function (s) { return !!teksP0_(r[kolomFotoGardu_(s).id]); })
  };
}

function simpanGarduYandal_(sesi, data, platform) {
  wajibPetugasYandalHp_(sesi, platform);
  var aturan = {
    ukurId: { tipe: 'uuid', wajib: true },
    p0Id: { tipe: 'uuid', wajib: true },
    garduId: { tipe: 'uuid', wajib: true },
    catatan: { tipe: 'teks', maks: 300, multiBaris: true, maksBaris: 5 },
    // jam dibuat di HP (jam terpercaya): pengukuran BARU wajib di jam shift, sesudah foto Sebelum P0, tidak lewat jam server
    dibuat: { tipe: 'waktu', wajib: true },
    installId: { tipe: 'uuid' }
  };
  YAN_NILAI_GARDU_.forEach(function (n) {
    aturan[n.kunci] = { tipe: 'angka', wajib: true, min: 0, max: n.jenis === 'BEBAN' ? YAN_BEBAN_MAKS_ : YAN_TEGANGAN_MAKS_ };
  });
  var d = validasi_(data, aturan);
  var sekarangMs = sekarangMsYandal_(), dibuatMs = Date.parse(d.dibuat);

  return denganLock_(function () {
    var t = bacaSheetYandal_(['yan_Shift', 'yan_P0', 'yan_Gardu']);
    var logT = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var sh = shiftSesiP0_(t.yan_Shift.rows, sesi, null), s = sh.r;
    var p = p0IndukGardu_(t.yan_P0.rows, sesi, s, d.p0Id);
    var semua = t.yan_Gardu.rows;
    var lama = semua.filter(function (x) { return String(x.ukur_id) === d.ukurId; });
    if (lama.length > 1) throw new SisiError_('DATA_GANDA', d.ukurId);
    var r = lama[0] || null;
    var iso = new Date(sekarangMs).toISOString(), terima = waktuWib_(sekarangMs, true), aksi;
    var nilaiBaru = {};
    YAN_NILAI_GARDU_.forEach(function (n) { nilaiBaru[n.kolom] = d[n.kunci]; });
    var hasil = hasilUkurGardu_(d, r ? r['Kapasitas (kVA)'] : null);

    if (r) {
      if (String(r.p0_id) !== d.p0Id || String(r.tim_id) !== String(sesi.timId)) throw new SisiError_('ID_DIPAKAI', d.ukurId);
      if (String(r.status || 'AKTIF') === 'BATAL') throw new SisiError_('SUDAH_BATAL', d.ukurId);
      // keputusan Master Guswan 9 Okt 2026: gardu terkunci sesudah disimpan, angka (+ catatan) boleh dikoreksi sampai P0 SELESAI
      if (String(r.gardu_id) !== d.garduId) throw new SisiError_('GARDU_TERKUNCI', 'gardu tidak bisa diganti');
      var berubah = Object.keys(nilaiBaru).filter(function (k) { return Number(r[k]) !== nilaiBaru[k]; });
      var catatanBerubah = teksP0_(r.Catatan) !== (d.catatan || '');
      if (!berubah.length && !catatanBerubah) return jawabGarduYandal_(r);   // kirim ulang tanpa perubahan
      if (p0Selesai_(p)) throw new SisiError_('P0_SUDAH_SELESAI', teksP0_(p['Kode P0']));
      var u = Object.assign({ 'Waktu Diterima': terima, 'Timestamp Update': iso, diubah_oleh: sesi.userId }, nilaiBaru, kolomHasilGardu_(hasil));
      if (catatanBerubah) u.Catatan = d.catatan || '';
      var ter = terapkanUkurGardu_(Object.assign({}, r, u), sesi, iso);   // master dulu, lalu baris ukur (satu tulis)
      if (ter) u['Diterapkan ke Master'] = ter;
      tulisBlok_(t.yan_Gardu, [{ r: r, u: u }], []);
      aksi = 'UBAH_UKUR_GARDU';
    } else {
      if (p0Selesai_(p)) throw new SisiError_('P0_SUDAH_SELESAI', teksP0_(p['Kode P0']));
      cekWaktuShiftP0_(dibuatMs, sh.j, sekarangMs, 'dibuat pengukuran gardu');
      var mulaiMs = waktuP0Ms_(p, 'SEBELUM', 'Waktu Sebelum');
      if (mulaiMs !== null && dibuatMs < mulaiMs - 60e3) throw new SisiError_('WAKTU_TIDAK_URUT', 'pengukuran sebelum foto Sebelum P0');
      var milikP0 = semua.filter(function (x) { return String(x.p0_id) === d.p0Id; });
      if (milikP0.filter(function (x) { return String(x.status || 'AKTIF') !== 'BATAL'; }).length >= YAN_GARDU_MAKS_PER_P0_) {
        throw new SisiError_('PENGUKURAN_GARDU_SUDAH_ADA', 'satu pengukuran gardu per P0');
      }
      var g = garduUntukUkur_(tabelGarduUkur_(), d.garduId, p.Penyulang);
      cekJedaUkurGardu_(semua, g, tglSel_(p.Tanggal), d.ukurId);   // v0.75.0: toggle admin "Pengukuran Gardu 2 Hari Sekali"
      var kap = angkaGarduLama_(g['Kapasitas (kVA)']);
      hasil = hasilUkurGardu_(d, kap);
      var baru = {
        No: (semua.length ? Math.max.apply(null, semua.map(function (x) { return x._baris; })) : 1),
        'Kode Header': p['Kode Header'], 'Kode Shift': p['Kode Shift'], 'Kode P0': p['Kode P0'],
        'Kode Pengukuran Gardu': kodeGarduBerikut_(milikP0, teksP0_(p['Kode P0'])),
        ULP: p.ULP, Hari: p.Hari, Tanggal: tglSel_(p.Tanggal), Tim: p.Tim, Shift: p.Shift, Petugas: p.Petugas,
        Penyulang: teksP0_(g.Penyulang), Section: teksP0_(g.Section), 'No Gardu': teksP0_(g['No Gardu']).toUpperCase(),
        Alamat: teksP0_(g.Alamat), 'Kapasitas (kVA)': kap, Catatan: d.catatan || '', 'Diterapkan ke Master': '',
        'Waktu Diterima': terima, 'Input Oleh': sesi.nama || sesi.username, Timestamp: iso, 'Timestamp Update': iso,
        ukur_id: d.ukurId, p0_id: d.p0Id, shift_id: p.shift_id, tim_id: sesi.timId, gardu_id: d.garduId,
        section_id: teksP0_(g.section_id), foto_meta: '{}', install_id: d.installId || '', status: 'AKTIF', revision: 1,
        dibuat_oleh: sesi.userId, diubah_oleh: sesi.userId
      };
      Object.assign(baru, nilaiBaru, kolomHasilGardu_(hasil));
      tulisBlok_(t.yan_Gardu, [], [baru]);
      r = baru;
      aksi = 'SIMPAN_UKUR_GARDU';
    }
    auditLog_(sesi, aksi, teksP0_(r['Kode Pengukuran Gardu']), teksP0_(r['No Gardu']), platform, logT);
    return jawabGarduYandal_(r);
  });
}

function uploadFotoGarduYandal_(sesi, data, platform) {
  wajibPetugasYandalHp_(sesi, platform);
  var d = validasi_(data, {
    ukurId: { tipe: 'uuid', wajib: true },
    slot: { tipe: 'pilihan', wajib: true, pilihan: YAN_SLOT_GARDU_ },
    sumber: { tipe: 'pilihan', wajib: true, pilihan: ['KAMERA'] },
    sha256: { tipe: 'teks', wajib: true, maks: 64, pola: /^[0-9a-f]{64}$/ },
    ukuranByte: { tipe: 'angka', wajib: true, bulat: true, min: 1, max: FOTO_MAKS_BYTE_ },
    data: { tipe: 'teks', wajib: true, maks: Math.ceil(FOTO_MAKS_BYTE_ / 3) * 4 + 4 },
    waktu: { tipe: 'waktu', wajib: true },
    waktuHp: { tipe: 'waktu' },
    sumberWaktu: { tipe: 'pilihan', pilihan: ['SERVER', 'HP'] },
    lat: { tipe: 'angka', min: -90, max: 90 },
    lng: { tipe: 'angka', min: -180, max: 180 },
    akurasiM: { tipe: 'angka', min: 0, max: 100000 },
    gpsSusulanDetik: { tipe: 'angka', bulat: true, min: 0, max: YAN_P0_SUSULAN_MAKS_DETIK_ }
  });
  var c = cfg_();
  if (!c.YANDAL_FOTO_FOLDER_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'YANDAL_FOTO_FOLDER_ID');
  var bytes;
  try { bytes = Utilities.base64Decode(d.data); } catch (e) { throw new SisiError_('FORMAT_SALAH', 'data'); }
  if (bytes.length > FOTO_MAKS_BYTE_) throw new SisiError_('FOTO_TERLALU_BESAR', bytes.length);
  if (bytes.length !== d.ukuranByte) throw new SisiError_('FOTO_RUSAK', 'ukuran');
  if (bytesKeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)) !== d.sha256) throw new SisiError_('FOTO_RUSAK', 'sha256');
  var dim = ukuranJpeg_(bytes);
  if (!dim) throw new SisiError_('FORMAT_FOTO_SALAH');
  if (Math.max(dim.lebar, dim.tinggi) > FOTO_MAKS_SISI_) throw new SisiError_('FOTO_TERLALU_BESAR', dim.lebar + 'x' + dim.tinggi);
  if ((d.lat === undefined) !== (d.lng === undefined)) throw new SisiError_('FIELD_WAJIB', d.lat === undefined ? 'lat' : 'lng');
  if (d.gpsSusulanDetik !== undefined && d.lat === undefined) throw new SisiError_('FIELD_WAJIB', 'lat');
  var waktuMs = Date.parse(d.waktu);
  var sekarangMs = sekarangMsYandal_();

  return denganLock_(function () {
    var t = bacaSheetYandal_(['yan_Shift', 'yan_P0', 'yan_Gardu']);
    var logT = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var sh = shiftSesiP0_(t.yan_Shift.rows, sesi, null), s = sh.r, j = sh.j;
    var l = t.yan_Gardu.rows.filter(function (x) { return String(x.ukur_id) === d.ukurId; });
    if (!l.length) throw new SisiError_('DATA_TIDAK_DITEMUKAN', d.ukurId);
    if (l.length > 1) throw new SisiError_('DATA_GANDA', d.ukurId);
    var r = l[0];
    if (String(r.tim_id) !== String(sesi.timId) || String(r.shift_id) !== String(s.shift_id)) throw new SisiError_('BUKAN_MILIK_TIM', d.ukurId);
    if (String(r.status || 'AKTIF') === 'BATAL') throw new SisiError_('SUDAH_BATAL', d.ukurId);
    var p = p0IndukGardu_(t.yan_P0.rows, sesi, s, r.p0_id);
    var k = kolomFotoGardu_(d.slot), meta = metaP0_(r);
    if (teksP0_(r[k.id])) {
      if (meta[d.slot] && meta[d.slot].sha256 === d.sha256) return Object.assign(jawabGarduYandal_(r), { status: 'DUPLIKAT' });
      throw new SisiError_('FOTO_SUDAH_ADA', d.slot);
    }
    if (p0Selesai_(p)) throw new SisiError_('P0_SUDAH_SELESAI', teksP0_(p['Kode P0']));
    if (d.slot !== 'BEBAN_R' && !teksP0_(r.foto_id_beban_r)) throw new SisiError_('URUTAN_FOTO', 'foto BEBAN_R belum ada');
    cekWaktuShiftP0_(waktuMs, j, sekarangMs, 'waktu foto');
    var mulaiMs = waktuP0Ms_(p, 'SEBELUM', 'Waktu Sebelum');
    if (mulaiMs !== null && waktuMs < mulaiMs - 1000) throw new SisiError_('WAKTU_TIDAK_URUT', 'foto gardu sebelum foto Sebelum P0');

    var folder = folderFoto_(c.YANDAL_FOTO_FOLDER_ID, pathFotoP0_(p));
    var penanda = d.ukurId + '-' + d.slot;
    var file = cariFileFoto_(folder, penanda), fileBaru = !file;
    if (fileBaru) {
      file = folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', namaFotoBebas_(folder, teksP0_(r['Kode Pengukuran Gardu']), d.slot, 1, d.ukurId)));
      try { file.setDescription(PENANDA_FOTO_ + penanda); } catch (eD) { /* tanpa penanda */ }
    }
    pastikanFotoPrivat_(file, fileBaru);

    meta[d.slot] = { waktu: d.waktu, waktuHp: d.waktuHp || d.waktu, sumberWaktu: d.sumberWaktu || 'HP', sumber: d.sumber,
                     lat: d.lat === undefined ? null : d.lat, lng: d.lng === undefined ? null : d.lng,
                     akurasi: d.akurasiM === undefined ? null : d.akurasiM, sha256: d.sha256, ukuran: bytes.length };
    if (d.gpsSusulanDetik !== undefined) meta[d.slot].gpsSusulanDetik = d.gpsSusulanDetik;
    var rw = ringkasWaktuP0_(meta), iso = new Date(sekarangMs).toISOString();
    var u = {};
    u[k.foto] = file.getName();
    u[k.link] = 'https://drive.google.com/file/d/' + file.getId() + '/view';
    u[k.id] = file.getId();
    u.foto_meta = JSON.stringify(meta);
    u['Sumber Waktu'] = rw.sumber;
    u['Selisih Jam HP (menit)'] = rw.selisih;
    u['Waktu Diterima'] = waktuWib_(sekarangMs, true);
    u['Timestamp Update'] = iso;
    u.diubah_oleh = sesi.userId;
    if (d.slot === 'BEBAN_R') {
      u['Jam Ukur'] = waktuWib_(waktuMs, true);
      u['Waktu Beban'] = waktuBebanGardu_(waktuMs);
      if (d.lat !== undefined) {
        u.Lat = d.lat; u.Long = d.lng; u.Koordinat = koordinatTeks_(d.lat, d.lng);
        var g = tabelGarduUkur_().rows.filter(function (x) { return String(x.gardu_id) === String(r.gardu_id); })[0];
        var gLat = g ? angkaGarduLama_(g.Lat) : '', gLng = g ? angkaGarduLama_(g.Long) : '';
        u['Jarak ke Gardu (m)'] = gLat !== '' && gLng !== '' ? jarakMeter_(d.lat, d.lng, gLat, gLng) : '';
      }
    }
    var ter = terapkanUkurGardu_(Object.assign({}, r, u), sesi, iso);   // foto wajib terakhir = master diperbarui
    if (ter) u['Diterapkan ke Master'] = ter;
    tulisBlok_(t.yan_Gardu, [{ r: r, u: u }], []);
    auditLog_(sesi, 'UPLOAD_FOTO_UKUR_GARDU', teksP0_(r['Kode Pengukuran Gardu']), d.slot + ' ' + file.getId(), platform, logT);
    return Object.assign(jawabGarduYandal_(r), { status: 'OK' });
  });
}

/**
 * Foto Sesudah P0 "Pengecekan Gardu" hanya boleh kalau pengukuran (aktif) dengan 10 foto wajib sudah lengkap.
 * Dipanggil uploadFotoP0Yandal_ di dalam lock. P0 jenis lain = tidak membaca yan_Gardu.
 */
function cekGarduSebelumSesudah_(r) {
  if (!p0Gardu_(r['Nama Pekerjaan'])) return;
  var ada = bacaSheetYandal_(['yan_Gardu']).yan_Gardu.rows.some(function (x) {
    return String(x.p0_id) === String(r.p0_id) && String(x.status || 'AKTIF') !== 'BATAL' && fotoGarduLengkap_(x);
  });
  if (!ada) throw new SisiError_('PENGUKURAN_GARDU_BELUM_LENGKAP', teksP0_(r['Kode P0']));
}

/** Edit lokasi P0 Pengecekan Gardu: penyulang wajib, dan terkunci sesudah pengukuran disimpan (gardu milik penyulang). */
function cekUbahLokasiGarduP0_(r, lokasi) {
  if (!p0Gardu_(r['Nama Pekerjaan'])) return;
  cekLokasiGarduP0_(lokasi);
  if (kunciNama_(r.Penyulang) === kunciNama_(lokasi.penyulang)) return;
  var ada = bacaSheetYandal_(['yan_Gardu']).yan_Gardu.rows.some(function (x) {
    return String(x.p0_id) === String(r.p0_id) && String(x.status || 'AKTIF') !== 'BATAL';
  });
  if (ada) throw new SisiError_('GARDU_TERKUNCI', 'penyulang terkunci, pengukuran gardu sudah ada');
}
