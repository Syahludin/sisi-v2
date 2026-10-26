/**
 * v1.0.35 (keputusan kvlar 26 Okt 2026): DATA GARDU LENGKAP (form Update Data Gardu v1 / HI, 182 isian) dengan
 * db_Gardu sebagai SUMBER UTAMA, untuk website admin menu Pengukuran Gardu (OPS_PENGUKURAN_GARDU).
 *
 * Alur:
 *  1. updateHiGardu dari website menulis HANYA ke db_Gardu (satu baris, revision dicek). Isian -> kolom db lewat katalog
 *     HI_GARDU_KATALOG_TEKS_ (60_Gardu.js): identitas, blok WBP / LWBP (hasil dihitung ulang), cover, 137 kolom HI.
 *  2. Sesudah db_Gardu tersimpan, gardu itu langsung DITULIS ke 3 file sheet lama yang MENGIKUTI db_Gardu (posisi kolom v1
 *     updateHiUp3): Master HI Toboali = SHEET_GARDU_ULP (Master_Gardu + Suhu & Fisik Trafo), Master HI HP = SHEET_GARDU_ES
 *     (1. DATA TRAFO + 2. SUHU & FISIK TRAFO), Master HI UP3 = SHEET_GARDU_UP3 (INPUT TBL, huruf kolom = kunci isian).
 *     Berhasil semua = kolom 'Sinkron Sheet Lama' diisi waktu tulis; gagal = dicoba lagi oleh sinkron harian 05:00
 *     (69_Gardu_Sinkron.js: gardu yang Timestamp Update-nya lebih baru dari Sinkron Sheet Lama ditulis ulang).
 *  3. Sinkron harian SATU ARAH db_Gardu -> sheet lama (sheet lama tidak lagi dibaca untuk mengisi db_Gardu).
 *
 * Aturan tulis sheet lama (sama sinkron): nilai kosong di db_Gardu TIDAK mengosongkan sel sheet lama; sel formula tidak
 * ditimpa; sel dropdown disamakan ke pilihannya; hanya sel yang berubah; baris Suhu & Fisik yang belum ada disisip (v1);
 * baris Master_Gardu / DATA TRAFO / INPUT TBL yang belum ada dibuat sinkron harian (sisipGarduSinkron_). Staging tidak
 * boleh menulis file sumber produksi (cekTargetSinkron_). Data HI lama dari sheet diimpor sekali ke db_Gardu:
 * ADMIN_cekImporHiGardu (pratinjau) lalu ADMIN_imporHiGardu.
 */
var HI_GARDU_ = {
  // posisi kolom v1 HI_SRC (1-based): mg / INPUT TBL = Nomor Gardu C + ULP B, Suhu & Fisik = Nomor Gardu B
  file: [
    { kunci: 'SHEET_GARDU_ULP', nama: 'Master HI Toboali',
      mg: { tab: 'Master_Gardu', gid: null, kolGardu: 3, kolUlp: 2 }, sf: { tab: 'Suhu & Fisik Trafo', gid: 1815443245, kolGardu: 2 } },
    { kunci: 'SHEET_GARDU_ES', nama: 'Master HI HP',
      mg: { tab: '1. DATA TRAFO', gid: 2129497099, kolGardu: 3, kolUlp: 2 }, sf: { tab: '2. SUHU & FISIK TRAFO', gid: 198498101, kolGardu: 2 } },
    { kunci: 'SHEET_GARDU_UP3', nama: 'Master HI UP3', gidKunci: 'SHEET_GARDU_UP3_GID',
      it: { tab: 'INPUT TBL', gid: 1401502183, kolGardu: 3, kolUlp: 2 } }
  ],
  tanggalUkur: '@TANGGAL_UKUR',
  kolomJam: 'Jam Ukur WBP',
  kodeUkur: 'WEB ADMIN',
  sumberUkur: 'Website Admin',
  maksTeks: 200,
  bulan: ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember']
};

/** 'A' -> 1, 'FV' -> 178. */
function hurufKeKolom_(h) {
  var n = 0;
  for (var i = 0; i < h.length; i++) n = n * 26 + (h.charCodeAt(i) - 64);
  return n;
}

/** Jam sel (Date jam / '8:15' / '08:15:00') -> 'HH:MM', tidak terbaca = teks apa adanya. */
function jamHiGardu_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return jamSelJp_(v);
  var s = teksGarduLama_(v), m = /^(\d{1,2}):(\d{2})/.exec(s);
  return m ? pad2_(Number(m[1])) + ':' + m[2] : s;
}

/** Tanggal sel (Date / ISO / dd/mm/yyyy / "26 Oktober 2026") -> yyyy-MM-dd atau ''. */
function tglHiGardu_(v, tampil) {
  var iso = tanggalLama_(v, tampil);
  if (iso) return iso;
  var m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(teksGarduLama_(tampil !== undefined ? tampil : v));
  var b = m ? HI_GARDU_.bulan.indexOf(m[2].toLowerCase()) : -1;
  return b >= 0 ? m[3] + '-' + pad2_(b + 1) + '-' + pad2_(Number(m[1])) : '';
}

/** Nama kolom db blok [periode] dari nama kolom WBP / lama (Beban R (A) -> Beban R LWBP (A)). */
function kolomBlokHi_(periode, kolomWbp) { return periode === 'LWBP' && UKUR_BLOK_LWBP_[kolomWbp] ? UKUR_BLOK_LWBP_[kolomWbp] : kolomWbp; }

/** { kolom db: periode } untuk 10 angka pengukuran WBP + LWBP. */
function kolomUkurHi_() {
  if (kolomUkurHi_.memo) return kolomUkurHi_.memo;
  var o = {};
  ['WBP', 'LWBP'].forEach(function (p) { YAN_NILAI_GARDU_.forEach(function (n) { o[kolomBlokHi_(p, n.kolom)] = p; }); });
  kolomUkurHi_.memo = o;
  return o;
}

/** Nilai satu isian dari baris db_Gardu (bentuk form: angka tetap angka, tanggal ISO, jam HH:MM, lainnya teks). */
function nilaiDbHi_(g, k) {
  if (k.kolom === HI_GARDU_.tanggalUkur) return tglUkurTerbaruGardu_(g);
  var v = g[k.kolom];
  if (k.tipe === 'time' || k.kolom === HI_GARDU_.kolomJam) return jamHiGardu_(v);
  if (typeof v === 'number') return isFinite(v) ? v : '';
  if (Object.prototype.toString.call(v) === '[object Date]') return tglJakarta_(v);
  return teksGarduLama_(v);
}

/** Semua isian form dari baris db_Gardu: { kunci: nilai }. */
function nilaiHiDariDb_(g) {
  var o = {};
  katalogHiGardu_().forEach(function (k) { o[k.kunci] = nilaiDbHi_(g, k); });
  return o;
}

/** Baris db_Gardu bernomor ini (bukan BATAL); ganda = DATA_GANDA, tidak ada = null. */
function dbGarduHi_(tG, nomor) {
  var l = tG.rows.filter(function (r) {
    var x = parseNoGarduLama_(r['No Gardu']);
    return x && x.nomor === nomor && teksGarduLama_(r['Status Gardu']).toUpperCase() !== 'BATAL';
  });
  if (l.length > 1) throw new SisiError_('DATA_GANDA', nomor);
  return l[0] || null;
}

function nomorHi_(teks) {
  var no = parseNoGarduLama_(teks);
  if (!no) throw new SisiError_('FORMAT_SALAH', 'noGardu');
  return no.nomor;
}

function sinkronHiDb_(g) { return { waktu: teksGarduLama_(g['Sinkron Sheet Lama']), hasil: teksGarduLama_(g['Hasil Sinkron Sheet Lama']) }; }

/**
 * getHiGardu { noGardu }: isi form Update Data Gardu dari db_Gardu (sumber utama). Jawaban
 * { noGardu, revision, nilai: {kunci: nilai}, gardu (bentuk getMaster), sinkron: {waktu, hasil} }.
 */
function getHiGardu_(sesi, data) {
  wajibAdminRiwayatGardu_(sesi);
  var d = validasi_(data, { noGardu: { tipe: 'teks', wajib: true, maks: 20 } });
  var nomor = nomorHi_(d.noGardu);
  var g = dbGarduHi_(tabelGarduUkur_(), nomor);
  if (!g) throw new SisiError_('GARDU_TIDAK_DITEMUKAN', nomor);
  return { noGardu: nomor, revision: Number(g.revision) || 0, nilai: nilaiHiDariDb_(g), gardu: barisGarduHp_(g), sinkron: sinkronHiDb_(g) };
}

/** Satu nilai kiriman sesuai tipe isian: angka / '' , tanggal ISO, jam HH:MM, teks <= 200 huruf. */
function nilaiKirimHi_(k, v) {
  if (v === null || v === undefined || v === '') return '';
  if (k.tipe === 'number') {
    var n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
    if (typeof v === 'string' && !/^-?\d+([.,]\d+)?$/.test(v.trim())) throw new SisiError_('TIPE_SALAH', k.kunci);
    if (!isFinite(n)) throw new SisiError_('TIPE_SALAH', k.kunci);
    return n;
  }
  if (typeof v === 'number' && isFinite(v) && (k.tipe === 'text' || k.tipe === 'select')) return v;
  if (typeof v !== 'string') throw new SisiError_('TIPE_SALAH', k.kunci);
  var s = v.trim();
  if (k.tipe === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new SisiError_('FORMAT_SALAH', k.kunci);
  if (k.tipe === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new SisiError_('FORMAT_SALAH', k.kunci);
  if (s.length > HI_GARDU_.maksTeks) throw new SisiError_('TERLALU_PANJANG', k.kunci);
  return s;
}

/**
 * Perubahan kolom db_Gardu dari isian yang dikirim (hanya yang beda dengan db). Pengukuran: blok periode yang angkanya
 * berubah (atau tanggalnya diganti) ditulis ulang utuh dengan tanggal form + hasil dihitung ulang (Kode Ukur WEB ADMIN).
 * Penyulang / Section baru wajib ada di db_Jaringan (section_id ikut). Cover berubah = Tanggal Cover hari ini.
 */
function ubahDbHi_(g, nilai, jaringan) {
  var kat = katalogHiGardu_(), perKunci = {}, u = {}, ukur = kolomUkurHi_(), blokUbah = {}, tglBaru = '', angkaDb = {};
  kat.forEach(function (k) { perKunci[k.kunci] = k; });
  // kolom identitas db yang berupa angka (Kapasitas, Tahun, Lat / Long, Jurusan): isian select / teks disimpan sebagai angka
  SINKRON_GARDU_.identitas.forEach(function (p) { if (p[2]) angkaDb[p[0]] = true; });
  Object.keys(nilai).forEach(function (kunci) {
    var k = perKunci[kunci], v = nilai[kunci];
    if (angkaDb[k.kolom] && typeof v === 'string' && angkaGarduLama_(v) !== '') v = angkaGarduLama_(v);
    if (k.kolom === HI_GARDU_.tanggalUkur) { if (v && v !== tglUkurTerbaruGardu_(g)) tglBaru = v; return; }
    var lama = nilaiDbHi_(g, k);
    if (v === lama || (v !== '' && lama !== '' && samaNilaiSinkron_(lama, v, typeof v === 'number' ? 'angka' : ''))) return;
    u[k.kolom] = v;
    if (ukur[k.kolom]) blokUbah[ukur[k.kolom]] = true;
  });
  // Penyulang / Section
  if (u.Penyulang !== undefined || u.Section !== undefined) {
    var p = u.Penyulang !== undefined ? u.Penyulang : g.Penyulang, s = u.Section !== undefined ? u.Section : g.Section;
    var j = jaringan.filter(function (x) { return x.aktif && kunciNama_(x.penyulang) === kunciNama_(p) && kunciNama_(x.section) === kunciNama_(s); })[0];
    if (!j) throw new SisiError_('SECTION_TIDAK_VALID', p + ' / ' + s);
    u.Penyulang = j.penyulang; u.Section = j.section; u.section_id = j.id;
  }
  var kva = u['Kapasitas (kVA)'] !== undefined ? u['Kapasitas (kVA)'] : g['Kapasitas (kVA)'];
  if (u['Kapasitas (kVA)'] !== undefined) u['Arus Maks per Fasa (A)'] = arusNominalGardu_(kva);
  // blok pengukuran: angka berubah, atau tanggal diganti untuk blok yang berisi beban
  ['WBP', 'LWBP'].forEach(function (p) {
    var n = {}, ada = false;
    YAN_NILAI_GARDU_.forEach(function (x) {
      var kol = kolomBlokHi_(p, x.kolom), v = u[kol] !== undefined ? u[kol] : g[kol];
      n[x.kunci] = v === '' || v === null || v === undefined ? '' : Number(v);
      if (n[x.kunci] !== '' && /^beban/.test(x.kunci)) ada = true;
    });
    if (!blokUbah[p] && !(tglBaru && ada)) return;
    var tgl = tglBaru || tglUkurTerbaruGardu_(g) || tglJakarta_(new Date());
    var angka = {};
    YAN_NILAI_GARDU_.forEach(function (x) { angka[x.kunci] = n[x.kunci] === '' ? 0 : n[x.kunci]; });
    var h = hasilUkurGardu_(angka, kva), blok = {};
    YAN_NILAI_GARDU_.forEach(function (x) { blok[x.kolom] = n[x.kunci]; });
    Object.assign(u, kolomUkurPeriode_(p, Object.assign(blok, {
      'Tanggal Ukur Terakhir': tgl, 'Kode Ukur Terakhir': HI_GARDU_.kodeUkur, ukur_id_terakhir: '',
      'Pembebanan (kVA)': ada ? h.kva : '', 'Persentase Beban (%)': ada ? h.persen : '', 'Kategori Beban': ada ? h.kategori : '',
      'Sumber Data': HI_GARDU_.sumberUkur })));
    u['Arus Maks per Fasa (A)'] = h.arusMaks;
  });
  if (Object.keys(COVER_GARDU_).some(function (c) { return u[COVER_GARDU_[c]] !== undefined; })) u['Tanggal Cover'] = tglJakarta_(new Date());
  return u;
}

// ---------------- tulis sheet lama (mengikuti db_Gardu) ----------------

/** Konteks tulis sheet lama: file / tab dibuka sekali, peta Nomor Gardu -> baris dibuat sekali per tab. */
function konteksSheetLama_() { return { pp: PropertiesService.getScriptProperties(), tab: {} }; }

/** Tab sheet lama (dibuka sekali per konteks): { sh, cfg, perNo } atau { galat }. */
function tabSheetLama_(ctx, f, t) {
  var kunci = f.kunci + '|' + t;
  if (ctx.tab[kunci]) return ctx.tab[kunci];
  var id = String(ctx.pp.getProperty(f.kunci) || '').trim(), hasil;
  if (!id) hasil = { lewat: f.kunci + ' kosong' };
  else {
    try {
      cekTargetSinkron_(id, f.nama);
      var gid = f.gidKunci ? Number(ctx.pp.getProperty(f.gidKunci) || f[t].gid) : f[t].gid;
      hasil = { sh: sheetSinkron_(id, f[t].tab, gid), cfg: f[t] };
      petaBarisLama_(hasil);
    } catch (e) { hasil = { galat: (e && (e.kode ? e.kode + (e.detail ? ' ' + e.detail : '') : e.message)) || String(e) }; }
  }
  ctx.tab[kunci] = hasil;
  return hasil;
}

/** Peta Nomor Gardu (dinormalkan) -> baris (1-based); nomor ganda: yang ULP-nya ULP_NAMA, masih ganda = -1. */
function petaBarisLama_(tb) {
  var akhir = tb.sh.getLastRow(), perNo = {};
  if (akhir >= 1) {
    var kol = tb.sh.getRange(1, tb.cfg.kolGardu, akhir, 1).getDisplayValues();
    var ulp = tb.cfg.kolUlp ? tb.sh.getRange(1, tb.cfg.kolUlp, akhir, 1).getDisplayValues() : null;
    var ulpKita = teksGarduLama_(cfg_().ULP_NAMA).toUpperCase();
    kol.forEach(function (b, i) {
      var x = parseNoGarduLama_(b[0]);
      if (!x) return;
      var ini = { baris: i + 1, kita: !ulp || teksGarduLama_(ulp[i][0]).toUpperCase() === ulpKita };
      var ada = perNo[x.nomor];
      if (!ada) perNo[x.nomor] = ini;
      else if (ada.baris !== -1) {
        if (ini.kita && !ada.kita) perNo[x.nomor] = ini;
        else if (ini.kita === ada.kita) perNo[x.nomor] = { baris: -1 };
      }
    });
  }
  tb.perNo = perNo;
}

/**
 * Nilai sel sheet lama dari nilai db (tanggal ukur -> Date, jam -> teks HH:MM, angka tetap). '' = tidak ditulis.
 * Teks lewat amanSheet_ lagi: db_Gardu menyimpan "'=..." sebagai teks "=..." (tanda ' tersembunyi), tanpa ini jadi formula.
 */
function nilaiSelLama_(g, k) {
  if (k.kolom === HI_GARDU_.tanggalUkur) { var t = tglUkurTerbaruGardu_(g); return t ? tglKeSel_(t) : ''; }
  var v = nilaiDbHi_(g, k);
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? amanSheet_(v) : v;
}

/**
 * Isi sel per tab dari baris db_Gardu: { mg: {huruf: nilai}, sf: {...}, it: {...}, mgUlp: {...} }. Kosong tidak ikut
 * (tidak mengosongkan sheet lama). mgUlp = tambahan khusus Master_Gardu: Arus Maks (DG), Beban (EW), Persentase (EY)
 * dari blok pengukuran terbaru, sama sinkron harian. Nomor Gardu / ULP tidak pernah ditulis (kunci baris).
 */
function selSheetLama_(g) {
  var isi = { mg: {}, sf: {}, it: {}, mgUlp: {} };
  katalogHiGardu_().forEach(function (k) {
    if (k.kunci === 'B' || k.kunci === 'C') return;
    var v = nilaiSelLama_(g, k);
    if (kosongSinkron_(v)) return;
    isi[k.tab][k.huruf] = v;
    if (/^[A-Z]+$/.test(k.kunci)) isi.it[k.kunci] = v;
  });
  var S = SINKRON_GARDU_, tgl = tglUkurTerbaruGardu_(g);
  if (tgl) {
    var blok = tglSel_(g['Tanggal Ukur Terakhir']) === tgl ? ukurBlokGardu_(g, 'WBP') : ukurBlokGardu_(g, 'LWBP');
    [[S.kolArus, g['Arus Maks per Fasa (A)']], [S.kolBeban, blok['Pembebanan (kVA)']], [S.kolPersen, blok['Persentase Beban (%)']]].forEach(function (x) {
      if (!kosongSinkron_(x[1])) isi.mgUlp[kolomHuruf_(x[0])] = x[1];
    });
  }
  return isi;
}

/** Nilai sel sekarang sama dengan nilai baru? (tanggal per hari, angka dibanding angka, teks tanpa beda huruf besar). */
function samaSelHi_(lama, tampil, baru) {
  if (Object.prototype.toString.call(baru) === '[object Date]') return tanggalLama_(lama, tampil) === tglJakarta_(baru);
  var jenis = typeof baru === 'number' ? 'angka' : '';
  if (samaNilaiSinkron_(tampil, baru, jenis)) return true;
  // "'=x" (amanSheet_) tampil di sel Sheets sebagai "=x"
  return typeof baru === 'string' && baru.charAt(0) === "'" && samaNilaiSinkron_(tampil, baru.slice(1), '');
}

/**
 * Tulis { huruf: nilai } ke satu baris: hanya sel yang berubah, sel formula dilewati, dropdown disamakan, kolom
 * berurutan digabung jadi satu setValues. Hasil { jumlah, rumus (dilewati), peringatan }.
 */
function tulisBarisHi_(sh, row, isi) {
  var huruf = Object.keys(isi);
  if (!huruf.length) return { jumlah: 0, rumus: 0, peringatan: [] };
  var lebar = Math.max.apply(null, huruf.map(hurufKeKolom_));
  var r = sh.getRange(row, 1, 1, lebar), nilai = r.getValues()[0], tampil = r.getDisplayValues()[0];
  var rumus = typeof r.getFormulas === 'function' ? r.getFormulas()[0] : [];
  var dv = typeof r.getDataValidations === 'function' ? r.getDataValidations()[0] : [];
  var b = { sh: sh, peringatan: [] }, ubah = {}, nRumus = 0;
  huruf.forEach(function (h) {
    var i = hurufKeKolom_(h) - 1;
    if (rumus[i]) { nRumus++; return; }
    var v = nilaiValidasiSinkron_(b, dv[i], isi[h], h + row);
    if (v === undefined || samaSelHi_(nilai[i], tampil[i], v)) return;
    ubah[i] = v;
  });
  var idx = Object.keys(ubah).map(Number).sort(function (x, y) { return x - y; });
  for (var a = 0; a < idx.length;) {
    var z = a;
    while (z + 1 < idx.length && idx[z + 1] === idx[z] + 1) z++;
    var baris = [];
    for (var j = a; j <= z; j++) baris.push(ubah[idx[j]]);
    sh.getRange(row, idx[a] + 1, 1, baris.length).setValues([baris]);
    a = z + 1;
  }
  return { jumlah: idx.length, rumus: nRumus, peringatan: b.peringatan };
}

/**
 * Sisip baris Suhu & Fisik gardu yang belum ada (v1 _hiSisipBarisSf_): di bawah gardu terakhir ber-prefix sama (atau baris
 * data terakhir), formula baris acuan disalin, Nomor Gardu + C Alamat, D Merk, E kVA dari db_Gardu. Hasil nomor baris baru.
 */
function sisipSfHi_(tb, nomor, g) {
  var sh = tb.sh, prefix = parseNoGarduLama_(nomor).prefix, acuan = -1, terakhir = -1;
  Object.keys(tb.perNo).forEach(function (no) {
    var b = tb.perNo[no].baris;
    if (b < 1) return;
    if (b > terakhir) terakhir = b;
    if (parseNoGarduLama_(no).prefix === prefix && b > acuan) acuan = b;
  });
  var sumber = acuan > 0 ? acuan : terakhir;
  if (sumber < 1) throw new SisiError_('STRUKTUR_BERUBAH', sh.getName() + ': belum ada baris gardu');
  sh.insertRowsAfter(sumber, 1);
  var baru = sumber + 1, f = sh.getRange(sumber, 1, 1, sh.getLastColumn()).getFormulasR1C1()[0];
  f.forEach(function (x, c) { if (x) sh.getRange(baru, c + 1).setFormulaR1C1(x); });
  var isi = {};
  isi[kolomHuruf_(tb.cfg.kolGardu)] = nomor;
  if (teksGarduLama_(g.Alamat)) isi.C = teksGarduLama_(g.Alamat);
  if (teksGarduLama_(g.Merk)) isi.D = teksGarduLama_(g.Merk);
  if (angkaGarduLama_(g['Kapasitas (kVA)']) !== '') isi.E = angkaGarduLama_(g['Kapasitas (kVA)']);
  tulisBarisHi_(sh, baru, isi);
  petaBarisLama_(tb);   // baris di bawahnya bergeser
  return baru;
}

/**
 * Tulis satu gardu (baris db_Gardu) ke 3 file sheet lama. Hasil { ok, hasil: [{file, tab, ok, jumlah, ...}], ringkas }.
 * ok = semua tab yang diatur berhasil (property kosong = dilewati, tidak dihitung gagal).
 */
function tulisGarduKeSheetLama_(ctx, g) {
  var nomor = parseNoGarduLama_(g['No Gardu']).nomor, isi = selSheetLama_(g), hasil = [];
  HI_GARDU_.file.forEach(function (f, iFile) {
    ['mg', 'sf', 'it'].filter(function (t) { return f[t]; }).forEach(function (t) {
      var r = { file: f.nama, tab: f[t].tab, ok: false, jumlah: 0 }, tb = tabSheetLama_(ctx, f, t);
      if (tb.lewat) { r.lewat = tb.lewat; hasil.push(r); return; }
      if (tb.galat) { r.pesan = tb.galat; hasil.push(r); return; }
      try {
        var sel = t === 'mg' && iFile === 0 ? Object.assign({}, isi.mg, isi.mgUlp) : isi[t];
        var ada = tb.perNo[nomor], row = ada ? ada.baris : 0;
        if (row === -1) throw new SisiError_('DATA_GANDA', f[t].tab + ' ' + nomor);
        if (!row && t === 'sf') { row = sisipSfHi_(tb, nomor, g); r.disisipkan = true; }
        if (!row) { r.pesan = 'Gardu ' + nomor + ' belum ada di ' + f[t].tab + ' (dibuat sinkron harian 05:00)'; hasil.push(r); return; }
        var w = tulisBarisHi_(tb.sh, row, sel);
        r.ok = true; r.jumlah = w.jumlah;
        if (w.rumus) r.rumus = w.rumus;
        if (w.peringatan.length) r.peringatan = w.peringatan;
      } catch (e) {
        r.pesan = (e && (e.kode ? e.kode + (e.detail ? ' ' + e.detail : '') : e.message)) || String(e);
      }
      hasil.push(r);
    });
  });
  var ok = hasil.every(function (r) { return r.ok || r.lewat; });
  var ringkas = hasil.map(function (r) { return r.tab + ': ' + (r.ok ? r.jumlah : r.lewat ? 'lewat' : 'GAGAL ' + r.pesan); }).join('; ');
  return { ok: ok, hasil: hasil, ringkas: ringkas.slice(0, 500) };
}

/** Catat hasil tulis sheet lama di baris db_Gardu (dalam lock). Berhasil = Sinkron Sheet Lama = sekarang. */
function catatSinkronHi_(tG, g, t) {
  var u = { 'Hasil Sinkron Sheet Lama': t.ringkas };
  if (t.ok) u['Sinkron Sheet Lama'] = sekarangIso_();
  tulisBlok_(tG, [{ r: g, u: u }], []);
}

/**
 * updateHiGardu { noGardu, revision, nilai: {kunci: nilai} }: db_Gardu ditulis (revision beda = KONFLIK_REVISION), lalu
 * gardu itu langsung ditulis ke 3 file sheet lama. Jawaban { noGardu, revision, nilai, gardu, db: {jumlah}, sheet: {ok,
 * hasil}, sinkron }. Gagal tulis sheet tidak membatalkan db_Gardu (dicoba lagi sinkron harian).
 */
function updateHiGardu_(sesi, data, platform) {
  wajibAdminRiwayatGardu_(sesi);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SisiError_('DATA_TIDAK_VALID');
  Object.keys(data).forEach(function (k) { if (['noGardu', 'revision', 'nilai'].indexOf(k) === -1) throw new SisiError_('FIELD_TIDAK_DIKENAL', k); });
  var d = validasi_({ noGardu: data.noGardu, revision: data.revision },
    { noGardu: { tipe: 'teks', wajib: true, maks: 20 }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 } });
  var nomor = nomorHi_(d.noGardu);
  if (!data.nilai || typeof data.nilai !== 'object' || Array.isArray(data.nilai)) throw new SisiError_('TIPE_SALAH', 'nilai');
  var perKunci = {}, nilai = {};
  katalogHiGardu_().forEach(function (k) { perKunci[k.kunci] = k; });
  Object.keys(data.nilai).forEach(function (kunci) {
    var k = perKunci[kunci];
    if (!k) throw new SisiError_('FIELD_TIDAK_DIKENAL', 'nilai.' + kunci);
    if (kunci === 'B' || kunci === 'C') throw new SisiError_('KOLOM_TERKUNCI', kunci);
    nilai[kunci] = nilaiKirimHi_(k, data.nilai[kunci]);
  });
  if (!Object.keys(nilai).length) throw new SisiError_('FIELD_WAJIB', 'nilai');
  var jaringan = MODUL_MASTER_.jaringan();

  return denganLock_(function () {
    var tG = tabelGarduUkur_(), g = dbGarduHi_(tG, nomor);
    if (!g) throw new SisiError_('GARDU_TIDAK_DITEMUKAN', nomor);
    if ((Number(g.revision) || 0) !== d.revision) throw new SisiError_('KONFLIK_REVISION', nomor);
    if (teksGarduLama_(g['Status Gardu']).toUpperCase() !== 'AKTIF') throw new SisiError_('GARDU_TIDAK_AKTIF', nomor);
    var u = ubahDbHi_(g, nilai, jaringan), jumlah = Object.keys(u).length;
    if (jumlah) {
      Object.assign(u, { 'Diubah Oleh': sesi.nama || sesi.username || '', 'Timestamp Update': sekarangIso_(), diubah_oleh: sesi.userId || '' });
      tulisBlok_(tG, [{ r: g, u: u }], [], { bolehId: ['section_id', 'ukur_id_terakhir', 'ukur_id_lwbp'] });
    }
    // db_Gardu sudah tersimpan: sheet lama mengikuti (gagal di sini tidak membatalkan db)
    var t = tulisGarduKeSheetLama_(konteksSheetLama_(), g);
    catatSinkronHi_(tG, g, t);
    auditLog_(sesi, 'UPDATE_HI_GARDU', nomor, 'db_Gardu ' + jumlah + ' kolom; ' + t.ringkas, platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { noGardu: nomor, revision: Number(g.revision) || 0, nilai: nilaiHiDariDb_(g), gardu: barisGarduHp_(g), db: { jumlah: jumlah },
             sheet: { ok: t.ok, hasil: t.hasil }, sinkron: sinkronHiDb_(g) };
  }, 30000);
}

/**
 * Sinkron harian (dipanggil sinkronGarduLama_): gardu AKTIF yang berubah sesudah tulis sheet lama terakhir (Timestamp Update >
 * Sinkron Sheet Lama, atau belum pernah) ditulis ulang ke 3 file, sampai batas waktu. Hasil { ditulis, gagal, sisa }.
 */
function sinkronHiTertunda_(tG, mulaiMs, batasMs, tulis) {
  var perlu = tG.rows.filter(function (g) {
    if (!parseNoGarduLama_(g['No Gardu']) || teksGarduLama_(g['Status Gardu']).toUpperCase() !== 'AKTIF') return false;
    var s = keDate_(g['Sinkron Sheet Lama']), u = keDate_(g['Timestamp Update']);
    return !s || (u && u.getTime() > s.getTime());
  });
  var h = { perlu: perlu.length, ditulis: 0, gagal: 0, sisa: 0 };
  if (!tulis || !perlu.length) return h;
  var ctx = konteksSheetLama_(), selesai = [];
  for (var i = 0; i < perlu.length; i++) {
    if (Date.now() - mulaiMs > batasMs) { h.sisa = perlu.length - i; break; }
    var t = tulisGarduKeSheetLama_(ctx, perlu[i]);
    selesai.push({ id: String(perlu[i].gardu_id), ubah: String(perlu[i]['Timestamp Update']), t: t });
    if (t.ok) h.ditulis++; else h.gagal++;
  }
  // tandai dalam satu lock; baris yang diubah lagi selama penulisan tidak ditandai (tersusul berikutnya)
  denganLock_(function () {
    var t2 = tabelGarduUkur_(), isi = [];
    selesai.forEach(function (x) {
      var g = t2.rows.filter(function (r) { return String(r.gardu_id) === x.id; })[0];
      if (!g || String(g['Timestamp Update']) !== x.ubah) return;
      var u = { 'Hasil Sinkron Sheet Lama': x.t.ringkas };
      if (x.t.ok) u['Sinkron Sheet Lama'] = sekarangIso_();
      isi.push({ r: g, u: u });
    });
    if (isi.length) tulisBlok_(t2, isi, []);
  });
  return h;
}

// ---------------- impor sekali: data HI sheet lama -> kolom HI db_Gardu ----------------

/** Isi tab sheet lama gsheet1 per Nomor Gardu: { nomor: {huruf: nilai} } (nilai angka / tanggal ISO / jam / teks). */
function bacaTabImporHi_(ctx, t) {
  var tb = tabSheetLama_(ctx, HI_GARDU_.file[0], t);
  if (tb.lewat || tb.galat) throw new SisiError_('CONFIG_TIDAK_LENGKAP', tb.lewat || tb.galat);
  var akhir = tb.sh.getLastRow(), lebar = tb.sh.getLastColumn(), hasil = {};
  if (akhir < 1) return hasil;
  var r = tb.sh.getRange(1, 1, akhir, lebar), nilai = r.getValues(), tampil = r.getDisplayValues();
  Object.keys(tb.perNo).forEach(function (no) {
    var b = tb.perNo[no].baris;
    if (b > 0) hasil[no] = { nilai: nilai[b - 1], tampil: tampil[b - 1] };
  });
  return hasil;
}

/**
 * Impor data HI dari Master_Gardu + Suhu & Fisik Trafo (SHEET_GARDU_ULP) ke kolom HI BARU db_Gardu yang masih kosong.
 * Kolom lama (identitas, pengukuran, cover) tidak disentuh. tulis false = pratinjau. Aman diulang.
 */
function imporHiGardu_(tulis) {
  var ctx = konteksSheetLama_(), lama = { mg: bacaTabImporHi_(ctx, 'mg'), sf: bacaTabImporHi_(ctx, 'sf') };
  var kat = katalogHiGardu_().filter(function (k) { return HI_GARDU_KOLOM_BARU_.indexOf(k.kolom) !== -1; });
  return denganLock_(function () {
    var tG = tabelGarduUkur_(), ubah = [], h = { gardu: 0, sel: 0, tanpaSheet: 0 };
    tG.rows.forEach(function (g) {
      var no = parseNoGarduLama_(g['No Gardu']);
      if (!no || teksGarduLama_(g['Status Gardu']).toUpperCase() === 'BATAL') return;
      if (!lama.mg[no.nomor] && !lama.sf[no.nomor]) { h.tanpaSheet++; return; }
      var u = {};
      kat.forEach(function (k) {
        var src = lama[k.tab][no.nomor];
        if (!src || !kosongSinkron_(g[k.kolom])) return;
        var i = hurufKeKolom_(k.huruf) - 1, v = src.nilai[i];
        v = k.kolom === HI_GARDU_.kolomJam ? jamHiGardu_(v) : typeof v === 'number' ? v : teksGarduLama_(src.tampil[i]);
        if (!kosongSinkron_(v)) u[k.kolom] = v;
      });
      if (Object.keys(u).length) { ubah.push({ r: g, u: u }); h.gardu++; h.sel += Object.keys(u).length; }
    });
    if (tulis && ubah.length) tulisBlok_(tG, ubah, []);
    return h;
  }, 30000);
}

/** Editor: pratinjau impor data HI sheet lama ke db_Gardu (tidak menulis). */
function ADMIN_cekImporHiGardu() {
  pastikanPemilik_();
  var h = imporHiGardu_(false);
  console.log('PRATINJAU impor HI: ' + h.gardu + ' gardu, ' + h.sel + ' sel akan diisi; ' + h.tanpaSheet + ' gardu db tidak ada di sheet lama.');
  return h;
}

/** Editor: impor data HI sheet lama ke kolom HI db_Gardu yang masih kosong (sekali, sesudah ADMIN_rombakDbGardu). */
function ADMIN_imporHiGardu() {
  pastikanPemilik_();
  var h = imporHiGardu_(true);
  console.log('Impor HI selesai: ' + h.gardu + ' gardu, ' + h.sel + ' sel diisi; ' + h.tanpaSheet + ' gardu db tidak ada di sheet lama.');
  return h;
}
