/**
 * v0.79.0 (keputusan Master Guswan 10 Okt 2026): sinkron harian (pemicu 05:00 WIB) db_Gardu <-> sheet Master Gardu lama,
 * lalu 2 sheet lain (1. DATA TRAFO, INPUT TBL) mengikuti hasilnya. Tidak ada tulis langsung ke sheet lama saat BA /
 * pengukuran disimpan: semua lewat sinkron ini.
 *
 * v1.0.35 (keputusan Master Guswan 26 Okt 2026): db_Gardu = SUMBER UTAMA, sinkron SATU ARAH db_Gardu -> sheet lama. Pengukuran
 * sheet lama yang lebih baru TIDAK lagi ditarik ke db_Gardu (hanya dihitung di laporan). Sesudah lintasan massal di bawah,
 * gardu yang berubah sejak tulis sheet lama terakhir ditulis lengkap (isian HI, 3 file) oleh sinkronHiTertunda_
 * (35_Gardu_HI.js); website menulis gardu yang disimpan langsung saat itu juga.
 *
 * Arah data (sebelum v1.0.35, bagian pengukuran dua arah sudah dihapus):
 *  - Identitas (alamat, penyulang, section, koordinat, konstruksi, trafo, PHB-TR, jurusan): db_Gardu -> sheet lama
 *    (sheet lama disamakan dengan db_Gardu). Nilai kosong di db_Gardu tidak mengosongkan sheet lama.
 *  - Pengukuran: yang TERBARU menang, dua arah, dibanding Tanggal Ukur Terakhir (db_Gardu) vs kolom U Tanggal
 *    Pengukuran (Master_Gardu).
 *      db lebih baru  -> sheet lama: U + 10 angka ke grup WBP atau LWBP (sesuai Waktu Beban), Arus Maks (DG),
 *                        Beban (EW), Persentase (EY).
 *      lama lebih baru -> db_Gardu: Tanggal Ukur Terakhir + 10 angka (grup WBP kalau terisi, selain itu LWBP),
 *                        hasil dihitung ulang (Pembebanan, Persentase, Kategori) seperti pengukuran HP.
 *  v1.0.23 (permintaan Master Guswan 23 Okt 2026): db_Gardu punya blok WBP (kolom lama) dan LWBP. Tanggal db = yang terbaru
 *    dari keduanya. Lama lebih baru = grup WBP DAN LWBP yang terisi masuk ke bloknya masing-masing (tanggal sama).
 *    db lebih baru = blok yang bertanggal terbaru ditulis ke grupnya masing-masing.
 *  - Gardu di db_Gardu yang belum ada di sheet lama (BA Pengoperasian v2) = baris baru di bawah gardu terakhir
 *    ber-prefix sama, formula baris acuan ikut disalin. Gardu yang hanya ada di sheet lama = dilaporkan saja.
 *  - 1. DATA TRAFO dan INPUT TBL hanya MENERIMA (identitas + baris gardu baru, posisi kolom v1), tidak dibaca
 *    untuk menentukan data terbaru.
 * Sel berisi formula tidak pernah ditimpa. Gagal di satu sheet tidak menghentikan sheet lain.
 *
 * Script Properties (kosong = sheet itu dilewati; sinkron mati kalau SHEET_GARDU_ULP kosong):
 *   SHEET_GARDU_ULP  file berisi tab Master_Gardu yang DITULIS (produksi: file Master Gardu asli)
 *   SHEET_GARDU_ES   file berisi tab "1. DATA TRAFO"
 *   SHEET_GARDU_UP3  file berisi tab "INPUT TBL" (SHEET_GARDU_UP3_GID opsional, default gid v1)
 * Staging DITOLAK menulis ke file sumber produksi (GARDU_LAMA_SHEET_ID yang beda dengan GARDU_SHEET_ID): pakai salinan.
 */
var SINKRON_GARDU_ = {
  master: { tab: 'Master_Gardu', barisData: 12, lebar: 156 },
  // 1-based (v1 MG_COL / COL_GARDU Tek-InsDu + migrasi v0.68.0). Kepemilikan tidak ditulis (v1 juga tidak).
  identitas: [
    ['Alamat', 4], ['Penyulang', 5], ['Section', 6], ['Lat', 9, 'koord'], ['Long', 10, 'koord'], ['Konstruksi', 11], ['Merk', 12],
    ['Kapasitas (kVA)', 13, 'angka'], ['Nomor Seri', 14], ['Tahun', 15, 'angka'], ['Merk PHB-TR', 17], ['Nomor Seri PHB-TR', 18],
    ['Tahun PHB-TR', 19, 'angka'], ['Jurusan Terpasang', 24, 'angka']
  ],
  kolGardu: 3, kolUlp: 2, kolTgl: 21, kolArus: 111, kolBeban: 153, kolPersen: 155,
  // grup pengukuran Master_Gardu (1-based): nama kolom db_Gardu -> kolom
  grup: {
    WBP: { 'Tegangan R-S (V)': 28, 'Tegangan S-T (V)': 29, 'Tegangan R-T (V)': 30, 'Tegangan R-N (V)': 31, 'Tegangan S-N (V)': 32,
           'Tegangan T-N (V)': 33, 'Beban R (A)': 34, 'Beban S (A)': 35, 'Beban T (A)': 36, 'Beban N (A)': 37 },
    LWBP: { 'Tegangan R-S (V)': 57, 'Tegangan S-T (V)': 58, 'Tegangan R-T (V)': 59, 'Tegangan R-N (V)': 60, 'Tegangan S-N (V)': 61,
            'Tegangan T-N (V)': 62, 'Beban R (A)': 63, 'Beban S (A)': 64, 'Beban T (A)': 65, 'Beban N (A)': 66 }
  },
  target: [
    { kunci: 'SHEET_GARDU_ES', tab: '1. DATA TRAFO', kolGardu: 3, peta: 'master' },
    { kunci: 'SHEET_GARDU_UP3', tab: 'INPUT TBL', gidKunci: 'SHEET_GARDU_UP3_GID', gid: 1401502183, kolGardu: 3,
      // v1 colMap INPUT TBL: tanpa PHB-TR, jurusan di T
      peta: [['Alamat', 4], ['Penyulang', 5], ['Section', 6], ['Lat', 9, 'koord'], ['Long', 10, 'koord'], ['Konstruksi', 11], ['Merk', 12],
             ['Kapasitas (kVA)', 13, 'angka'], ['Nomor Seri', 14], ['Tahun', 15, 'angka'], ['Jurusan Terpasang', 20, 'angka']] }
  ],
  batasMs: 270e3,
  oleh: 'sinkron-gardu'
};

/** Nilai sama? angka dibanding angka (koordinat toleransi 1e-6), teks tanpa beda huruf besar / spasi. */
function samaNilaiSinkron_(lama, baru, jenis) {
  var a = angkaGarduLama_(lama), b = angkaGarduLama_(baru);
  if ((jenis === 'angka' || jenis === 'koord') && a !== '' && b !== '') return Math.abs(a - b) < (jenis === 'koord' ? 1e-6 : 1e-9);
  return teksGarduLama_(lama).toUpperCase() === teksGarduLama_(baru).toUpperCase();
}

function kosongSinkron_(v) { return v === '' || v === null || v === undefined || (typeof v === 'string' && !v.trim()); }

function tglKeSel_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : '';
}

/** Buka tab sinkron. gid (opsional) dicoba dulu, lalu nama tab. */
function sheetSinkron_(id, tab, gid) {
  var ss = bukaSpreadsheet_(id);
  if (gid && typeof ss.getSheets === 'function') {
    var l = ss.getSheets().filter(function (s) { return typeof s.getSheetId === 'function' && s.getSheetId() === gid; });
    if (l.length) return l[0];
  }
  var sh = ss.getSheetByName(tab);
  if (!sh) throw new SisiError_('SHEET_TIDAK_ADA', tab);
  return sh;
}

/** Baca sheet tujuan: { sh, awal, lebar, nilai, tampil, rumus, perNo: {No: indeks}, ganda: [], kosong } (indeks 0 = baris awal). */
function bacaSheetSinkron_(sh, awal, lebarMin, kolGardu) {
  var akhir = sh.getLastRow(), lebar = sh.getLastColumn();
  if (lebar < lebarMin) throw new SisiError_('STRUKTUR_BERUBAH', 'hanya ' + lebar + ' kolom, butuh ' + lebarMin);
  if (akhir < awal) return { sh: sh, awal: awal, lebar: lebar, nilai: [], tampil: [], rumus: [], perNo: {}, ganda: [], kosong: true };
  var r = sh.getRange(awal, 1, akhir - awal + 1, lebar);
  var nilai = r.getValues(), tampil = r.getDisplayValues(), rumus = typeof r.getFormulas === 'function' ? r.getFormulas() : [];
  var perNo = {}, ganda = [];
  tampil.forEach(function (b, i) {
    var no = parseNoGarduLama_(b[kolGardu - 1]);
    if (!no) return;
    if (perNo[no.nomor] !== undefined) { ganda.push(no.nomor); perNo[no.nomor] = -1; return; }
    perNo[no.nomor] = i;
  });
  return { sh: sh, awal: awal, lebar: lebar, nilai: nilai, tampil: tampil, rumus: rumus, perNo: perNo, ganda: ganda, kosong: false };
}

/** Baris header tujuan (baris berisi "GARDU" di kolom nomor gardu, 40 baris pertama). Data = baris sesudahnya. */
function awalDataSinkron_(sh, kolGardu) {
  var n = Math.min(40, sh.getLastRow());
  if (n < 1) return null;
  var kol = sh.getRange(1, kolGardu, n, 1).getDisplayValues();
  for (var i = 0; i < kol.length; i++) {
    if (['gardu', 'nogardu', 'nomorgardu', 'nomortrafo'].indexOf(normJudul_(kol[i][0])) !== -1) return i + 2;
  }
  return null;
}

/** Catat perubahan sel (indeks baris data, kolom 1-based). Sel formula dilewati. */
function ubahSelSinkron_(b, ubah, i, kol, nilai) {
  if (b.rumus[i] && b.rumus[i][kol - 1]) return false;
  ubah.push({ i: i, kol: kol, nilai: nilai });
  return true;
}

/** Pilihan sel dropdown yang menolak isian lain (validasi daftar / rentang). null = bebas. */
function pilihanValidasiSinkron_(dv) {
  if (!dv || typeof dv.getCriteriaType !== 'function') return null;
  if (typeof dv.getAllowInvalid === 'function' && dv.getAllowInvalid()) return null;
  var jenis = String(dv.getCriteriaType()), kriteria = dv.getCriteriaValues() || [];
  if (jenis === 'VALUE_IN_LIST') return (kriteria[0] || []).map(String);
  if (jenis === 'VALUE_IN_RANGE' && kriteria[0] && typeof kriteria[0].getDisplayValues === 'function') {
    return [].concat.apply([], kriteria[0].getDisplayValues()).map(String).filter(function (x) { return x.trim(); });
  }
  return null;
}

/**
 * v1.0.34 (laporan Master Guswan 25 Okt 2026, Merk gardu baru ditolak dropdown Master_Gardu L238): nilai untuk sel dropdown
 * disamakan ke pilihannya (huruf besar / spasi / tanda baca diabaikan). Tidak ada yang cocok = undefined (tidak ditulis)
 * dan dicatat di b.peringatan, supaya satu sel tidak menggagalkan seluruh sinkron.
 */
function nilaiValidasiSinkron_(b, dv, nilai, sel) {
  var pilihan = pilihanValidasiSinkron_(dv);
  if (!pilihan || kosongSinkron_(nilai)) return nilai;
  var kunci = function (x) { return String(x).toUpperCase().replace(/[^A-Z0-9]/g, '') || String(x).trim().toUpperCase(); }, k = kunci(nilai);
  for (var i = 0; i < pilihan.length; i++) {
    if (kunci(pilihan[i]) === k) return typeof nilai === 'number' ? nilai : pilihan[i];
  }
  (b.peringatan = b.peringatan || []).push((typeof b.sh.getName === 'function' ? b.sh.getName() + ' ' : '') + sel + ': "' + nilai +
    '" bukan pilihan dropdown, tidak ditulis (tambah pilihannya di sheet lama atau samakan isian db_Gardu)');
  return undefined;
}

/** Tulis perubahan: per kolom, baris berurutan digabung jadi satu setValues. */
function tulisSelSinkron_(b, ubah) {
  var perKol = {};
  ubah.forEach(function (u) { (perKol[u.kol] = perKol[u.kol] || {})[u.i] = u.nilai; });
  var panggil = 0;
  Object.keys(perKol).forEach(function (k) {
    var kol = Number(k), m = perKol[k];
    var rKol = b.sh.getRange(b.awal, kol, b.nilai.length, 1);
    var dv = typeof rKol.getDataValidations === 'function' ? rKol.getDataValidations() : [];
    Object.keys(m).forEach(function (i) {
      var v = nilaiValidasiSinkron_(b, dv[i] && dv[i][0], m[i], kolomHuruf_(kol) + (b.awal + Number(i)));
      if (v === undefined) delete m[i]; else m[i] = v;
    });
    var idx = Object.keys(m).map(Number).sort(function (x, y) { return x - y; });
    for (var a = 0; a < idx.length;) {
      var z = a;
      while (z + 1 < idx.length && idx[z + 1] === idx[z] + 1) z++;
      var isi = [];
      for (var j = a; j <= z; j++) isi.push([m[idx[j]]]);
      b.sh.getRange(b.awal + idx[a], kol, isi.length, 1).setValues(isi);
      panggil++;
      a = z + 1;
    }
  });
  return panggil;
}

/** Identitas db_Gardu -> baris tujuan. Hasil daftar kolom yang diubah. */
function identitasKeSheet_(b, ubah, i, g, peta) {
  var diubah = [];
  peta.forEach(function (p) {
    var v = g[p[0]];
    if (kosongSinkron_(v)) return;
    if (samaNilaiSinkron_(b.tampil[i][p[1] - 1], v, p[2])) return;
    if (ubahSelSinkron_(b, ubah, i, p[1], v)) diubah.push(p[0]);
  });
  return diubah;
}

/**
 * Blok pengukuran db_Gardu yang bertanggal terbaru -> sel sheet lama: [[kolom, nilai]] (murni). Tanggal (U), grup WBP /
 * LWBP sesuai bloknya, Arus Maks, lalu Beban + Persentase dari blok WBP (kalau tidak bertanggal terbaru: dari LWBP).
 */
function selUkurSinkron_(g) {
  var S = SINKRON_GARDU_, tgl = tglUkurTerbaruGardu_(g), sel = [], hasil = null;
  if (!tgl) return sel;
  sel.push([S.kolTgl, tglKeSel_(tgl)]);
  ['WBP', 'LWBP'].forEach(function (p) {
    var blok = ukurBlokGardu_(g, p);
    if (tglSel_(blok['Tanggal Ukur Terakhir']) !== tgl) return;
    Object.keys(S.grup[p]).forEach(function (k) { sel.push([S.grup[p][k], blok[k]]); });
    hasil = hasil || blok;
  });
  sel.push([S.kolArus, g['Arus Maks per Fasa (A)']]);
  if (hasil) sel.push([S.kolBeban, hasil['Pembebanan (kVA)']], [S.kolPersen, hasil['Persentase Beban (%)']]);
  return sel;
}

/** Pengukuran db_Gardu (blok WBP / LWBP terbaru) -> grup sheet lama + tanggal + hasil. */
function ukurKeSheet_(b, ubah, i, g) {
  var S = SINKRON_GARDU_, n = 0;
  selUkurSinkron_(g).forEach(function (x) {
    if (x[0] === S.kolTgl) { if (ubahSelSinkron_(b, ubah, i, x[0], x[1])) n++; return; }
    if (!kosongSinkron_(x[1]) && !samaNilaiSinkron_(b.tampil[i][x[0] - 1], x[1], 'angka') && ubahSelSinkron_(b, ubah, i, x[0], x[1])) n++;
  });
  return n;
}

/** Sisip gardu baru: di bawah gardu terakhir ber-prefix sama (atau baris data terakhir), formula baris acuan disalin. */
function sisipGarduSinkron_(b, baru, peta, kolGardu, denganUkur) {   // denganUkur = Master_Gardu (ULP + pengukuran ikut)
  var hasil = 0;
  if (!baru.length || b.kosong) return 0;
  // sama v1: di bawah gardu terakhir ber-prefix sama; prefix belum ada = di bawah baris data terakhir
  var rencana = baru.map(function (g) {
    var no = parseNoGarduLama_(g['No Gardu']), acuan = -1, terakhir = -1;
    b.tampil.forEach(function (row, i) {
      var x = parseNoGarduLama_(row[kolGardu - 1]);
      if (!x) return;
      terakhir = i;
      if (x.prefix === no.prefix) acuan = i;
    });
    if (acuan < 0) acuan = terakhir;
    return { g: g, no: no, acuan: acuan };
  }).filter(function (x) { return x.acuan >= 0; });
  // dari bawah ke atas (baris di atas tidak bergeser); acuan sama = nomor terbesar dulu supaya urutan akhir naik
  rencana.sort(function (x, y) { return y.acuan - x.acuan || y.no.angka - x.no.angka; });
  rencana.forEach(function (x) {
    var barisAcuan = b.awal + x.acuan, barisBaru = barisAcuan + 1;
    b.sh.insertRowsAfter(barisAcuan, 1);
    var rAcuan = b.sh.getRange(barisAcuan, 1, 1, b.lebar);
    var rumus = typeof rAcuan.getFormulasR1C1 === 'function' ? rAcuan.getFormulasR1C1()[0] : [];
    var tulis = new Array(b.lebar).fill(''), rumusBaru = [];
    rumus.forEach(function (f, c) { if (f) rumusBaru.push(c); });
    // ULP ikut tulisan baris acuan (mis. TOBOALI), kosong = ULP_NAMA
    if (denganUkur) tulis[SINKRON_GARDU_.kolUlp - 1] = teksGarduLama_(b.tampil[x.acuan][SINKRON_GARDU_.kolUlp - 1]) || cfg_().ULP_NAMA || '';
    tulis[kolGardu - 1] = x.no.nomor;
    peta.forEach(function (p) { if (!kosongSinkron_(x.g[p[0]])) tulis[p[1] - 1] = x.g[p[0]]; });
    if (denganUkur) {
      // v1.0.23: blok WBP / LWBP terbaru ke grupnya
      selUkurSinkron_(x.g).forEach(function (s) { if (!kosongSinkron_(s[1])) tulis[s[0] - 1] = s[1]; });
    }
    // nilai hanya di sel tanpa formula acuan; formula disalin relatif (R1C1)
    var r = b.sh.getRange(barisBaru, 1, 1, b.lebar);
    var lama = r.getValues()[0], dv = typeof r.getDataValidations === 'function' ? r.getDataValidations()[0] : [];
    var isi = tulis.map(function (v, c) {
      if (rumusBaru.indexOf(c) !== -1) return lama[c];
      var n = nilaiValidasiSinkron_(b, dv[c], v, kolomHuruf_(c + 1) + barisBaru + ' (' + x.no.nomor + ')');
      return n === undefined ? '' : n;
    });
    // gagal tulis = baris sisipan dihapus lagi (tidak meninggalkan baris kosong yang disisip ulang besok)
    try { r.setValues([isi]); } catch (e) { b.sh.deleteRow(barisBaru); throw e; }
    rumusBaru.forEach(function (c) { b.sh.getRange(barisBaru, c + 1).setFormulaR1C1(rumus[c]); });
    hasil++;
  });
  return hasil;
}

/** Target staging tidak boleh file sumber produksi. */
function cekTargetSinkron_(id, nama) {
  var c = cfg_();
  if (c.ENV !== 'production' && c.GARDU_LAMA_SHEET_ID && c.GARDU_LAMA_SHEET_ID !== c.GARDU_SHEET_ID && id === c.GARDU_LAMA_SHEET_ID) {
    throw new SisiError_('SINKRON_DITOLAK', nama + ': staging tidak boleh menulis file sumber produksi (pakai salinan)');
  }
}

/**
 * Inti sinkron. tulis false = pratinjau (tidak menulis apa pun). Hasil ringkasan per sheet.
 */
function sinkronGarduLama_(tulis) {
  var c = cfg_(), pp = PropertiesService.getScriptProperties(), S = SINKRON_GARDU_, mulai = Date.now();
  var idMaster = propKonfig_('SHEET_GARDU_ULP');
  var hasil = { tulis: !!tulis, master: null, target: [], hi: null, peringatan: [] };
  if (!c.GARDU_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'GARDU_SHEET_ID');
  if (!idMaster) { hasil.peringatan.push('SHEET_GARDU_ULP kosong: sinkron sheet lama mati'); return hasil; }
  cekTargetSinkron_(idMaster, S.master.tab);
  var tG = cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu');
  var dbAktif = tG.rows.filter(function (g) {
    return parseNoGarduLama_(g['No Gardu']) && teksGarduLama_(g['Status Gardu']).toUpperCase() !== 'BATAL';
  });

  // 1) Master_Gardu <-> db_Gardu
  var b = bacaSheetSinkron_(sheetSinkron_(idMaster, S.master.tab), S.master.barisData, S.master.lebar, S.kolGardu);
  var ubah = [], keDb = [], baru = [], m = { identitas: 0, perKolom: {}, ukurKeLama: 0, lamaLebihBaru: 0, baru: 0, hanyaDiLama: 0, ganda: b.ganda.slice(0, 10) };
  var adaDiDb = {};
  dbAktif.forEach(function (g) {
    var no = parseNoGarduLama_(g['No Gardu']).nomor;
    adaDiDb[no] = true;
    var i = b.perNo[no];
    if (i === undefined) { baru.push(g); return; }
    if (i < 0) return;   // ganda di sheet lama: dilewati, dilaporkan
    var kolId = identitasKeSheet_(b, ubah, i, g, S.identitas);
    if (kolId.length) m.identitas++;
    kolId.forEach(function (k) { m.perKolom[k] = (m.perKolom[k] || 0) + 1; });
    var tDb = tglUkurTerbaruGardu_(g), tLama = tanggalLama_(b.nilai[i][S.kolTgl - 1], b.tampil[i][S.kolTgl - 1]);
    if (tDb && (!tLama || tDb > tLama)) { if (ukurKeSheet_(b, ubah, i, g)) m.ukurKeLama++; }
    else if (tLama && (!tDb || tLama > tDb)) m.lamaLebihBaru++;   // v1.0.35: satu arah, tidak ditarik ke db_Gardu
  });
  Object.keys(b.perNo).forEach(function (no) { if (!adaDiDb[no]) m.hanyaDiLama++; });
  m.baru = baru.length;
  if (tulis) {
    m.panggilTulis = tulisSelSinkron_(b, ubah);
    m.baru = sisipGarduSinkron_(b, baru, S.identitas, S.kolGardu, true);
  }
  hasil.master = m;
  hasil.peringatan = hasil.peringatan.concat(b.peringatan || []);

  // 2) sheet penerima: identitas + gardu baru dari db_Gardu (sudah termasuk pengukuran terbaru dari sheet lama)
  S.target.forEach(function (tg) {
    var id = propKonfig_(tg.kunci), r = { sheet: tg.tab, identitas: 0, baru: 0 };
    if (!id) { r.lewat = tg.kunci + ' kosong'; hasil.target.push(r); return; }
    if (Date.now() - mulai > S.batasMs) { r.lewat = 'waktu habis, tersusul besok'; hasil.target.push(r); return; }
    try {
      cekTargetSinkron_(id, tg.tab);
      var gid = tg.gidKunci ? Number(pp.getProperty(tg.gidKunci) || tg.gid) : null;
      var sh = sheetSinkron_(id, tg.tab, gid);
      var awal = awalDataSinkron_(sh, tg.kolGardu);
      if (!awal) throw new SisiError_('STRUKTUR_BERUBAH', tg.tab + ': judul kolom Nomor Gardu tidak ditemukan');
      var peta = tg.peta === 'master' ? S.identitas : tg.peta;
      var lebar = Math.max.apply(null, peta.map(function (p) { return p[1]; }).concat([tg.kolGardu]));
      var bt = bacaSheetSinkron_(sh, awal, lebar, tg.kolGardu), ub = [], br = [];
      dbAktif.forEach(function (g) {
        var no = parseNoGarduLama_(g['No Gardu']).nomor, i = bt.perNo[no];
        if (i === undefined) { br.push(g); return; }
        if (i >= 0 && identitasKeSheet_(bt, ub, i, g, peta).length) r.identitas++;
      });
      r.baru = br.length;
      if (tulis) { tulisSelSinkron_(bt, ub); r.baru = sisipGarduSinkron_(bt, br, peta, tg.kolGardu, false); }
      hasil.peringatan = hasil.peringatan.concat(bt.peringatan || []);
    } catch (e) {
      r.galat = (e && (e.kode ? e.kode + ' ' + (e.detail || '') : e.message)) || String(e);
    }
    hasil.target.push(r);
  });

  // 3) v1.0.35: gardu yang berubah sejak tulis sheet lama terakhir = ditulis lengkap (isian HI, 3 file), sisa waktu saja
  try { hasil.hi = sinkronHiTertunda_(tG, mulai, S.batasMs, tulis); } catch (e) {
    hasil.peringatan.push('Tulis HI tertunda gagal: ' + ((e && (e.kode || e.message)) || e));
  }
  return hasil;
}

function cetakSinkronGardu_(h) {
  var m = h.master;
  h.peringatan.forEach(function (p) { console.warn(p); });
  if (m) {
    console.log('Master_Gardu: ' + m.identitas + ' gardu identitas disamakan, ' + m.ukurKeLama + ' pengukuran db -> sheet lama, ' +
      m.lamaLebihBaru + ' pengukuran sheet lama lebih baru (tidak ditarik, db_Gardu sumber utama), ' + m.baru + ' gardu baru' +
      (h.tulis ? ' disisipkan' : ' akan disisipkan') + ', ' + m.hanyaDiLama + ' gardu hanya ada di sheet lama (tidak diubah)' +
      (m.ganda.length ? ', No Gardu ganda dilewati: ' + m.ganda.join(', ') : ''));
    var pk = Object.keys(m.perKolom);
    if (pk.length) console.log('  identitas per kolom: ' + pk.map(function (k) { return k + ' ' + m.perKolom[k]; }).join(', '));
  }
  h.target.forEach(function (r) {
    console.log(r.sheet + ': ' + (r.lewat ? 'dilewati (' + r.lewat + ')' : r.galat ? 'GAGAL ' + r.galat : r.identitas + ' gardu identitas disamakan, ' + r.baru + ' gardu baru'));
  });  if (h.hi) console.log('Data HI lengkap ke 3 file: ' + h.hi.perlu + ' gardu perlu ditulis' + (h.tulis ? ', ' + h.hi.ditulis + ' berhasil, ' + h.hi.gagal +
    ' gagal' + (h.hi.sisa ? ', ' + h.hi.sisa + ' tersusul besok (waktu habis)' : '') : ''));
}

/** Editor: pratinjau sinkron (tidak menulis apa pun). */
function ADMIN_cekSinkronGarduLama() {
  pastikanPemilik_();
  var h = sinkronGarduLama_(false);
  console.log('PRATINJAU sinkron gardu (tidak ada yang ditulis):');
  cetakSinkronGardu_(h);
  return h;
}

/** Pemicu 05:00 WIB + manual: sinkron db_Gardu <-> Master_Gardu, lalu 1. DATA TRAFO + INPUT TBL. */
function ADMIN_sinkronGarduLama(e) {
  pastikanPemilik_();
  return jalanPemicu_('ADMIN_sinkronGarduLama', e, sinkronGarduLamaPemicu_);   // v0.84.0: waktu jalan dicatat + rem kuota
}

/** v0.84.0: isi ADMIN_sinkronGarduLama (dibungkus jalanPemicu_). */
function sinkronGarduLamaPemicu_() {
  var h = sinkronGarduLama_(true);
  cetakSinkronGardu_(h);
  hapusSemuaJawabanGarduMysql_();   // v1.0.38: data gardu berubah di luar router = jawaban jadi MySQL dibuang
  try {
    var m = h.master || {};
    auditLog_({ userId: SINKRON_GARDU_.oleh, username: SINKRON_GARDU_.oleh, role: 'SISTEM' }, 'SINKRON_GARDU_LAMA', 'Master_Gardu',
      'identitas ' + (m.identitas || 0) + ', ukur ke lama ' + (m.ukurKeLama || 0) + ', baru ' + (m.baru || 0) +
      (h.hi ? ', HI ditulis ' + h.hi.ditulis + ' gagal ' + h.hi.gagal + ' sisa ' + h.hi.sisa : ''), 'SISTEM');
  } catch (e) { /* log audit gagal tidak membatalkan sinkron */ }
  return h;
}

function hapusPemicuSinkronGardu_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'ADMIN_sinkronGarduLama') ScriptApp.deleteTrigger(t);
  });
}

/** Editor: pasang pemicu harian 05:00 WIB (pemicu lama diganti). Jalankan ADMIN_cekSinkronGarduLama dulu. */
function ADMIN_pasangPemicuSinkronGardu() {
  pastikanPemilik_();
  hapusPemicuSinkronGardu_();
  ScriptApp.newTrigger('ADMIN_sinkronGarduLama').timeBased().everyDays(1).atHour(5).nearMinute(0).inTimezone('Asia/Jakarta').create();
  console.log('Pemicu ADMIN_sinkronGarduLama dipasang: setiap hari 05:00 WIB.');
}

function ADMIN_berhentiPemicuSinkronGardu() {
  pastikanPemilik_();
  hapusPemicuSinkronGardu_();
  console.log('Pemicu ADMIN_sinkronGarduLama dihapus.');
}
