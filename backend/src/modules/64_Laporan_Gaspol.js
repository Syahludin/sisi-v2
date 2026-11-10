/**
 * v1.0.44: Laporan GASPOL UP3 (v1 SIE-Teknik tab 5, getGaspolRekap / submitGaspolToInputTbl). Rekap pekerjaan lintas
 * modul per Penyulang + Tanggal jadi 38 kolom GASPOL (urutan kolom sama persis dengan COL_GASPOL v1). Hanya dibaca dari
 * modul v2, tidak bisa diedit manual.
 *   - Inspeksi Jaringan (insjar_realisasi, header AKTIF): kmS = total tiang x 0,05; Tier 1 / Tier 2 = jumlah tiang.
 *   - ROW (row_Realisasi AKTIF): Rabas, Sedang, Besar.
 *   - Hartek (db_Hartek_Pekerjaan, header AKTIF): jumlah_pekerjaan ke kolom kolom_gaspol (master db_Jenis_Pekerjaan).
 *   - Inspeksi Gardu (db_insdu_realisasi, header AKTIF, bukan BATAL): No Gardu (teks), Tier 1 / Tier 2 = jumlah gardu.
 *   - Yandal (yan_P0): CFA = P0 Yantek seperti Laporan UP3 (p0YantekMasuk_: pekerjaan ROW, atau non-ROW berbobot 4 / 5;
 *     tidak BATAL / Rejected), dirinci per penyulang.
 * Section = section pangkal penyulang di db_Jaringan; tidak ada = bagian awal section data sumber.
 * Kirim ke GASPOL: tab 'Input TBL' di spreadsheet GASPOL (Script Property GASPOL_SHEET_ID), kunci Penyulang + Tanggal
 * (baris lama ditimpa, baru ditambah setelah baris terakhir kolom B). Kolom D (ULP), E (kmS) dan AM (Penyulang) TIDAK ditulis
 * (terkunci / rumus di sheet, sama dengan v1), nilai 0 jadi sel kosong, kolom A dinomori ulang. Akses = menu sendiri OPS_GASPOL_UP3 (db_Menu + db_Akses; kirim butuh UBAH + ADMIN / SUPER), PETUGAS selalu ditolak.
 */
var GASPOL_KOLOM_ = ['no', 'tanggal', 'section', 'ulp', 'insSutmKms', 'insSutmTier1', 'insSutmTier2', 'rowRabas', 'rowSedang',
  'rowBesar', 'harkomIsolator', 'harkomArrester', 'harkomFco', 'harkonsTiang', 'harkonsSutm', 'harkonsGw', 'harkonsGsw',
  'groundingTm', 'harkeypoint', 'penghalangHewan', 'rekonektorSutm', 'rehabSutm', 'penyulangBaruSutm', 'noGardu',
  'insGarduTier1', 'insGarduTier2', 'manajemenGardu', 'tapChanger', 'penyeimbanganBeban', 'groundingGardu', 'coverGardu',
  'lostContactPhbTr', 'jurusanBaruPecahBeban', 'rekonektorSutr', 'srSeri', 'rekonektorSr', 'cfa', 'pemasanganAvr'];
var GASPOL_ULP_ = 'TBL';
var GASPOL_TAB_INPUT_ = 'Input TBL';
var GASPOL_KOLOM_PENYULANG_ = 38;   // 0-based: kolom AM Input TBL = Penyulang (kunci tambahan)
var GASPOL_MAKS_HARI_ = 366;

function gsTeks_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

/** Section pangkal per penyulang (huruf kecil): section AKTIF tanpa induk, urutan terkecil. Murni. */
function sectionPangkalGaspol_(jaringan) {
  var o = {};
  Object.keys(jaringan || {}).forEach(function (id) {
    var s = jaringan[id];
    if (!s || !s.aktif || s.parent) return;
    var k = gsTeks_(s.penyulang).toLowerCase(), ada = o[k];
    if (!ada || s.urutan < ada.urutan || (s.urutan === ada.urutan && s.baris < ada.baris)) o[k] = s;
  });
  Object.keys(o).forEach(function (k) { o[k] = o[k].section; });
  return o;
}

/**
 * Rekap GASPOL dari baris modul yang sudah disaring (aktif, dalam rentang). Murni (diuji).
 * src: { insJar: [{tanggal, penyulang, tier, tiang, section}], row: [{tanggal, penyulang, rabas, sedang, besar}],
 *        hartek: [{tanggal, penyulang, kolom, jumlah}], gardu: [{tanggal, penyulang, tier, noGardu, section}],
 *        yandal: [{tanggal, penyulang, section}] }
 * Hasil: baris 38 nilai (urutan GASPOL_KOLOM_) + properti penyulang, urut tanggal lalu penyulang.
 */
function susunGaspol_(src, pangkal) {
  var idx = {};
  GASPOL_KOLOM_.forEach(function (k, i) { idx[k] = i; });
  var per = {};
  var ambil = function (x) {
    var p = gsTeks_(x.penyulang), t = gsTeks_(x.tanggal);
    if (!p || !t) return null;
    var k = p + '||' + t;
    if (!per[k]) {
      var b = GASPOL_KOLOM_.map(function () { return 0; });
      b[idx.tanggal] = t; b[idx.ulp] = GASPOL_ULP_; b[idx.noGardu] = '';
      per[k] = { baris: b, penyulang: p, sectionSumber: '', gardu: [] };
    }
    if (x.section && !per[k].sectionSumber) per[k].sectionSumber = gsTeks_(x.section);
    return per[k];
  };
  var tambah = function (g, kolom, n) { g.baris[idx[kolom]] += Number(n) || 0; };
  (src.insJar || []).forEach(function (x) {
    var g = ambil(x); if (!g) return;
    var tier = gsTeks_(x.tier);
    tambah(g, 'insSutmKms', (Number(x.tiang) || 0) * LAP_KMS_PER_TIANG_);
    if (tier.indexOf('1') !== -1) tambah(g, 'insSutmTier1', x.tiang);
    if (tier.indexOf('2') !== -1) tambah(g, 'insSutmTier2', x.tiang);
  });
  (src.row || []).forEach(function (x) {
    var g = ambil(x); if (!g) return;
    tambah(g, 'rowRabas', x.rabas); tambah(g, 'rowSedang', x.sedang); tambah(g, 'rowBesar', x.besar);
  });
  (src.hartek || []).forEach(function (x) {
    if (!(x.kolom in idx) || idx[x.kolom] < 4 || x.kolom === 'noGardu') return;   // kolom GASPOL tak dikenal = tidak masuk
    var g = ambil(x); if (g) tambah(g, x.kolom, x.jumlah);
  });
  (src.gardu || []).forEach(function (x) {
    var g = ambil(x); if (!g) return;
    var no = gsTeks_(x.noGardu), tier = gsTeks_(x.tier);
    if (no && g.gardu.indexOf(no) === -1) g.gardu.push(no);
    if (tier.indexOf('1') !== -1) tambah(g, 'insGarduTier1', 1);
    if (tier.indexOf('2') !== -1) tambah(g, 'insGarduTier2', 1);
  });
  (src.yandal || []).forEach(function (x) { var g = ambil(x); if (g) tambah(g, 'cfa', 1); });

  var hasil = Object.keys(per).map(function (k) {
    var g = per[k], b = g.baris;
    b[idx.section] = (pangkal || {})[g.penyulang.toLowerCase()] || bagianSection_(g.sectionSumber)[0] || '';
    b[idx.noGardu] = g.gardu.join(', ');
    b[idx.insSutmKms] = Math.round(b[idx.insSutmKms] * 100) / 100;
    return { baris: b, penyulang: g.penyulang };
  });
  hasil.sort(function (a, b) {
    var ta = a.baris[idx.tanggal], tb = b.baris[idx.tanggal];
    return ta < tb ? -1 : ta > tb ? 1 : (a.penyulang < b.penyulang ? -1 : a.penyulang > b.penyulang ? 1 : 0);
  });
  hasil.forEach(function (h, i) { h.baris[idx.no] = i + 1; });
  return hasil;
}

/** Baca modul v2 dalam rentang [dari, sampai]. Modul yang belum diatur di server dilewati. */
function sumberGaspol_(dari, sampai) {
  var c = cfg_(), dalam = function (t) { return !!t && t >= dari && t <= sampai; };
  var aktif = function (rows) {
    var o = {};
    rows.forEach(function (h) { if (gsTeks_(h.status || 'AKTIF') === 'AKTIF') o[String(h.header_id)] = true; });
    return o;
  };
  var src = { insJar: [], row: [], hartek: [], gardu: [], yandal: [] };
  if (c.INSJAR_SHEET_ID) {
    var hj = aktif(tabelInsJar_(INSJAR_SHEET_.HEADER).rows);
    tabelInsJar_(INSJAR_SHEET_.REALISASI).rows.forEach(function (r) {
      var t = tglInsJar_(r);
      if (!hj[String(r.header_id)] || !dalam(t)) return;
      src.insJar.push({ tanggal: t, penyulang: r.penyulang, tier: r.tier, tiang: Number(r.total_tiang) || 0, section: r.section });
    });
  }
  if (c.ROW_SHEET_ID) {
    tabel_('ROW_SHEET_ID', ROW_SHEET_.realisasi).rows.forEach(function (r) {
      var t = tanggalDariKode_(r['Kode Pekerjaan']);
      if (r.status !== 'AKTIF' || !dalam(t)) return;
      src.row.push({ tanggal: t, penyulang: r.Penyulang, rabas: r.Rabas, sedang: r.Sedang, besar: r.Besar, section: r.Section });
    });
  }
  if (c.HARTEK_SHEET_ID) {
    var hh = aktif(tabelHartek_(HARTEK_SHEET_.HEADER).rows);
    tabelHartek_(HARTEK_SHEET_.PEKERJAAN).rows.forEach(function (r) {
      var t = tglHartek_(r), kolom = kolomGaspolHartek_(r.kolom_gaspol);
      if (!kolom || !hh[String(r.header_id)] || !dalam(t)) return;
      src.hartek.push({ tanggal: t, penyulang: r.penyulang, kolom: kolom, jumlah: r.jumlah_pekerjaan, section: r.section });
    });
  }
  if (c.INSDU_SHEET_ID) {
    var hd = headerAktifInsDu_(tabelInsDu_(INSDU_SHEET_.HEADER).rows);
    tabelInsDu_(INSDU_SHEET_.REALISASI).rows.forEach(function (r) {
      var t = tglInsJar_(r);
      if (!hd[String(r.header_id)] || realisasiBatalInsDu_(r) || !dalam(t)) return;
      src.gardu.push({ tanggal: t, penyulang: r.penyulang, tier: r.tier, noGardu: r.no_gardu, section: r.section });
    });
  }
  if (c.YANDAL_SHEET_ID) {
    bacaSheetYandal_(['yan_P0']).yan_P0.rows.forEach(function (r) {
      var t = tglSel_(r.Tanggal);
      if (!dalam(t) || !p0YantekMasuk_(r)) return;
      src.yandal.push({ tanggal: t, penyulang: r.Penyulang, section: r.Section });
    });
  }
  return src;
}

function rentangGaspol_(data) {
  var d = validasi_(data, { dari: { tipe: 'tanggal', wajib: true }, sampai: { tipe: 'tanggal', wajib: true } });
  if (d.dari > d.sampai) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', 'dari > sampai');
  if (selisihHari_(d.dari, d.sampai) >= GASPOL_MAKS_HARI_) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', 'maks ' + GASPOL_MAKS_HARI_ + ' hari');
  return d;
}

function rekapGaspol_(d) {
  return susunGaspol_(sumberGaspol_(d.dari, d.sampai), sectionPangkalGaspol_(masterRow_().jaringan));
}

/** getGaspolUp3 { dari, sampai } -> { dari, sampai, kolom, baris: [[38 nilai]], penyulang: [...] }. */
function getGaspolUp3_(sesi, data) {
  peranLaporanUp3_(sesi, false);
  var d = rentangGaspol_(data);
  var r = rekapGaspol_(d);
  return { dari: d.dari, sampai: d.sampai, kolom: GASPOL_KOLOM_, baris: r.map(function (x) { return x.baris; }),
           penyulang: r.map(function (x) { return x.penyulang; }), bisaKirim: !!cfg_().GASPOL_SHEET_ID };
}

/** Baris data terakhir yang NYATA = baris terakhir kolom B (Tanggal) terisi (sheet berisi rumus sampai jauh ke bawah). */
function barisTerakhirGaspol_(kolomB) {
  for (var i = kolomB.length - 1; i >= 0; i--) if (gsTeks_(kolomB[i][0]) !== '') return i + 1;
  return 0;
}

/** Tanggal sel Input TBL (Date / teks) -> yyyy-MM-dd. */
function tglInputGaspol_(v) { return v instanceof Date ? tglJakarta_(v) : tglSel_(v); }

/** kirimGaspolUp3 { dari, sampai }: tulis rekap ke 'Input TBL' (timpa kunci Penyulang + Tanggal, sisanya ditambah). */
function kirimGaspolUp3_(sesi, data) {
  peranLaporanUp3_(sesi, true);
  var c = cfg_();
  if (!c.GASPOL_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'GASPOL_SHEET_ID');
  var d = rentangGaspol_(data);
  var rekap = rekapGaspol_(d);
  if (!rekap.length) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'tidak ada data pada periode ini');
  var sh = bukaSpreadsheet_(c.GASPOL_SHEET_ID).getSheetByName(GASPOL_TAB_INPUT_);
  if (!sh) throw new SisiError_('SHEET_TIDAK_ADA', GASPOL_TAB_INPUT_);
  var akhir = barisTerakhirGaspol_(sh.getRange(1, 2, Math.max(sh.getMaxRows(), 1), 1).getValues());
  var berikut = Math.max(akhir, 1) + 1, idx = {}, tambah = 0, timpa = 0;
  if (akhir >= 2) {
    sh.getRange(2, 1, akhir - 1, GASPOL_KOLOM_PENYULANG_ + 1).getValues().forEach(function (r, i) {
      var k = gsTeks_(r[GASPOL_KOLOM_PENYULANG_]).toLowerCase() + '||' + tglInputGaspol_(r[1]);
      if (k !== '||') idx[k] = i + 2;
    });
  }
  rekap.forEach(function (x) {
    var b = x.baris, k = x.penyulang.toLowerCase() + '||' + b[1], baris = idx[k];
    if (baris) timpa++;
    else { baris = idx[k] = berikut++; tambah++; }
    sh.getRange(baris, 1, 1, 3).setValues([[b[0], b[1], b[2]]]);
    sh.getRange(baris, 6, 1, GASPOL_KOLOM_.length - 5).setValues([b.slice(5).map(function (v) { return v === 0 || v === '' ? '' : v; })]);
  });
  var n = berikut - 2;
  if (n > 0) sh.getRange(2, 1, n, 1).setValues(Array.apply(null, Array(n)).map(function (_, i) { return [i + 1]; }));
  return { total: rekap.length, tambah: tambah, timpa: timpa };
}
