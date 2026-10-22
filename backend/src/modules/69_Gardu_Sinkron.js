/**
 * v0.79.0 (keputusan kvlar 10 Okt 2026): sinkron harian (pemicu 05:00 WIB) db_Gardu <-> sheet Master Gardu lama,
 * lalu 2 sheet lain (1. DATA TRAFO, INPUT TBL) mengikuti hasilnya. Tidak ada tulis langsung ke sheet lama saat BA /
 * pengukuran disimpan: semua lewat sinkron ini.
 *
 * Arah data:
 *  - Identitas (alamat, penyulang, section, koordinat, konstruksi, trafo, PHB-TR, jurusan): db_Gardu -> sheet lama
 *    (sheet lama disamakan dengan db_Gardu). Nilai kosong di db_Gardu tidak mengosongkan sheet lama.
 *  - Pengukuran: yang TERBARU menang, dua arah, dibanding Tanggal Ukur Terakhir (db_Gardu) vs kolom U Tanggal
 *    Pengukuran (Master_Gardu).
 *      db lebih baru  -> sheet lama: U + 10 angka ke grup WBP atau LWBP (sesuai Waktu Beban), Arus Maks (DG),
 *                        Beban (EW), Persentase (EY).
 *      lama lebih baru -> db_Gardu: Tanggal Ukur Terakhir + 10 angka (grup WBP kalau terisi, selain itu LWBP),
 *                        hasil dihitung ulang (Pembebanan, Persentase, Kategori) seperti pengukuran HP.
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

/** Tulis perubahan: per kolom, baris berurutan digabung jadi satu setValues. */
function tulisSelSinkron_(b, ubah) {
  var perKol = {};
  ubah.forEach(function (u) { (perKol[u.kol] = perKol[u.kol] || {})[u.i] = u.nilai; });
  var panggil = 0;
  Object.keys(perKol).forEach(function (k) {
    var kol = Number(k), m = perKol[k], idx = Object.keys(m).map(Number).sort(function (x, y) { return x - y; });
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

/** 10 angka pengukuran db_Gardu (YAN_NILAI_GARDU_ kolom) -> grup WBP / LWBP sheet lama + tanggal + hasil. */
function ukurKeSheet_(b, ubah, i, g) {
  var S = SINKRON_GARDU_, waktu = teksGarduLama_(g['Waktu Beban']).toUpperCase() === 'LWBP' ? 'LWBP' : 'WBP', n = 0;
  var set = function (kol, v) { if (!kosongSinkron_(v) && !samaNilaiSinkron_(b.tampil[i][kol - 1], v, 'angka') && ubahSelSinkron_(b, ubah, i, kol, v)) n++; };
  if (ubahSelSinkron_(b, ubah, i, S.kolTgl, tglKeSel_(tglSelBa_(g['Tanggal Ukur Terakhir'])))) n++;
  Object.keys(S.grup[waktu]).forEach(function (k) { set(S.grup[waktu][k], g[k]); });
  set(S.kolArus, g['Arus Maks per Fasa (A)']);
  set(S.kolBeban, g['Pembebanan (kVA)']);
  set(S.kolPersen, g['Persentase Beban (%)']);
  return n;
}

/** Pengukuran sheet lama -> kolom db_Gardu (grup WBP kalau ada beban, selain itu LWBP). */
function ukurDariSheet_(b, i, g, tgl) {
  var S = SINKRON_GARDU_, tampil = b.tampil[i];
  var ambil = function (grup) {
    var o = {}, ada = false;
    Object.keys(S.grup[grup]).forEach(function (k) { var v = angkaGarduLama_(tampil[S.grup[grup][k] - 1]); o[k] = v; if (v !== '' && /^Beban/.test(k)) ada = true; });
    return ada ? o : null;
  };
  var waktu = 'WBP', nilai = ambil('WBP');
  if (!nilai) { waktu = 'LWBP'; nilai = ambil('LWBP'); }
  var u = { 'Tanggal Ukur Terakhir': tgl, 'Kode Ukur Terakhir': 'SHEET LAMA', ukur_id_terakhir: '' };
  if (nilai) {
    Object.assign(u, nilai, { 'Waktu Beban': waktu });
    var n = {};
    YAN_NILAI_GARDU_.forEach(function (x) { n[x.kunci] = nilai[x.kolom] === '' ? 0 : nilai[x.kolom]; });
    var h = hasilUkurGardu_(n, g['Kapasitas (kVA)']);
    Object.assign(u, { 'Arus Maks per Fasa (A)': h.arusMaks, 'Pembebanan (kVA)': h.kva, 'Persentase Beban (%)': h.persen, 'Kategori Beban': h.kategori });
  } else {
    // tanpa angka per fasa: pakai hasil yang tertulis di sheet lama (sama migrasi v0.68.0)
    var persen = angkaGarduLama_(tampil[S.kolPersen - 1]);
    Object.assign(u, { 'Arus Maks per Fasa (A)': angkaGarduLama_(tampil[S.kolArus - 1]) || arusNominalGardu_(g['Kapasitas (kVA)']),
      'Pembebanan (kVA)': angkaGarduLama_(tampil[S.kolBeban - 1]), 'Persentase Beban (%)': persen, 'Kategori Beban': kategoriBeban_(persen) });
  }
  return u;
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
    if (denganUkur && tglSelBa_(x.g['Tanggal Ukur Terakhir'])) {
      var S = SINKRON_GARDU_, waktu = teksGarduLama_(x.g['Waktu Beban']).toUpperCase() === 'LWBP' ? 'LWBP' : 'WBP';
      tulis[S.kolTgl - 1] = tglKeSel_(tglSelBa_(x.g['Tanggal Ukur Terakhir']));
      Object.keys(S.grup[waktu]).forEach(function (k) { if (!kosongSinkron_(x.g[k])) tulis[S.grup[waktu][k] - 1] = x.g[k]; });
      [[S.kolArus, 'Arus Maks per Fasa (A)'], [S.kolBeban, 'Pembebanan (kVA)'], [S.kolPersen, 'Persentase Beban (%)']].forEach(function (p) {
        if (!kosongSinkron_(x.g[p[1]])) tulis[p[0] - 1] = x.g[p[1]];
      });
    }
    // nilai hanya di sel tanpa formula acuan; formula disalin relatif (R1C1)
    var r = b.sh.getRange(barisBaru, 1, 1, b.lebar);
    var lama = r.getValues()[0];
    r.setValues([tulis.map(function (v, c) { return rumusBaru.indexOf(c) !== -1 ? lama[c] : v; })]);
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
  var idMaster = String(pp.getProperty('SHEET_GARDU_ULP') || '').trim();
  var hasil = { tulis: !!tulis, master: null, db: { diubah: 0 }, target: [], peringatan: [] };
  if (!c.GARDU_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'GARDU_SHEET_ID');
  if (!idMaster) { hasil.peringatan.push('SHEET_GARDU_ULP kosong: sinkron sheet lama mati'); return hasil; }
  cekTargetSinkron_(idMaster, S.master.tab);
  var tG = cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu');
  var dbAktif = tG.rows.filter(function (g) {
    return parseNoGarduLama_(g['No Gardu']) && teksGarduLama_(g['Status Gardu']).toUpperCase() !== 'BATAL';
  });

  // 1) Master_Gardu <-> db_Gardu
  var b = bacaSheetSinkron_(sheetSinkron_(idMaster, S.master.tab), S.master.barisData, S.master.lebar, S.kolGardu);
  var ubah = [], keDb = [], baru = [], m = { identitas: 0, perKolom: {}, ukurKeLama: 0, ukurKeDb: 0, baru: 0, hanyaDiLama: 0, ganda: b.ganda.slice(0, 10) };
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
    var tDb = tglSelBa_(g['Tanggal Ukur Terakhir']), tLama = tanggalLama_(b.nilai[i][S.kolTgl - 1], b.tampil[i][S.kolTgl - 1]);
    if (tDb && (!tLama || tDb > tLama)) { if (ukurKeSheet_(b, ubah, i, g)) m.ukurKeLama++; }
    else if (tLama && (!tDb || tLama > tDb)) { keDb.push({ g: g, u: ukurDariSheet_(b, i, g, tLama), tLama: tLama }); }
  });
  Object.keys(b.perNo).forEach(function (no) { if (!adaDiDb[no]) m.hanyaDiLama++; });
  m.ukurKeDb = keDb.length;
  m.baru = baru.length;
  if (tulis) {
    m.panggilTulis = tulisSelSinkron_(b, ubah);
    m.baru = sisipGarduSinkron_(b, baru, S.identitas, S.kolGardu, true);
    if (keDb.length) {
      denganLock_(function () {
        var t2 = cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu'), sekarang = sekarangIso_(), isi = [];
        keDb.forEach(function (x) {
          var g2 = t2.rows.filter(function (r) { return String(r.gardu_id) === String(x.g.gardu_id); })[0];
          if (!g2) return;
          var tKini = tglSelBa_(g2['Tanggal Ukur Terakhir']);
          if (tKini && tKini >= x.tLama) return;   // diukur dari HP sementara sinkron berjalan
          isi.push({ r: g2, u: Object.assign({}, x.u, { 'Diubah Oleh': S.oleh, 'Timestamp Update': sekarang, diubah_oleh: S.oleh }) });
        });
        if (isi.length) tulisBlok_(t2, isi, [], { bolehId: ['ukur_id_terakhir'] });
        hasil.db.diubah = isi.length;
      });
    }
  }
  hasil.master = m;

  // 2) sheet penerima: identitas + gardu baru dari db_Gardu (sudah termasuk pengukuran terbaru dari sheet lama)
  S.target.forEach(function (tg) {
    var id = String(pp.getProperty(tg.kunci) || '').trim(), r = { sheet: tg.tab, identitas: 0, baru: 0 };
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
    } catch (e) {
      r.galat = (e && (e.kode ? e.kode + ' ' + (e.detail || '') : e.message)) || String(e);
    }
    hasil.target.push(r);
  });
  return hasil;
}

function cetakSinkronGardu_(h) {
  var m = h.master;
  h.peringatan.forEach(function (p) { console.warn(p); });
  if (m) {
    console.log('Master_Gardu: ' + m.identitas + ' gardu identitas disamakan, ' + m.ukurKeLama + ' pengukuran db -> sheet lama, ' +
      m.ukurKeDb + ' pengukuran sheet lama -> db_Gardu' + (h.tulis ? ' (' + h.db.diubah + ' ditulis)' : '') + ', ' + m.baru + ' gardu baru' +
      (h.tulis ? ' disisipkan' : ' akan disisipkan') + ', ' + m.hanyaDiLama + ' gardu hanya ada di sheet lama (tidak diubah)' +
      (m.ganda.length ? ', No Gardu ganda dilewati: ' + m.ganda.join(', ') : ''));
    var pk = Object.keys(m.perKolom);
    if (pk.length) console.log('  identitas per kolom: ' + pk.map(function (k) { return k + ' ' + m.perKolom[k]; }).join(', '));
  }
  h.target.forEach(function (r) {
    console.log(r.sheet + ': ' + (r.lewat ? 'dilewati (' + r.lewat + ')' : r.galat ? 'GAGAL ' + r.galat : r.identitas + ' gardu identitas disamakan, ' + r.baru + ' gardu baru'));
  });
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
  try {
    var m = h.master || {};
    auditLog_({ userId: SINKRON_GARDU_.oleh, username: SINKRON_GARDU_.oleh, role: 'SISTEM' }, 'SINKRON_GARDU_LAMA', 'Master_Gardu',
      'identitas ' + (m.identitas || 0) + ', ukur ke lama ' + (m.ukurKeLama || 0) + ', ukur ke db ' + (h.db.diubah || 0) + ', baru ' + (m.baru || 0), 'SISTEM');
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
