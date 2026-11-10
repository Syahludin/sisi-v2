/**
 * v1.0.56 (permintaan Master Guswan 2 Nov 2026): DATA ASET (menu OPS_DATA_ASET), website dulu lalu HP.
 *
 * Sumber = file ITB "ITB ULP Toboali <Bulan Tahun>" (sheet Data_Penyulang) di Script Property MASTER_ITB_SHEET_ID, HANYA
 * DIBACA. Disalin per segmen (satu baris = satu DESCRIPTION) ke tab db_Aset_ITB di file SISI_ITB_SHEET_ID (master ITB SiSi;
 * web membaca dari sini): sudah ada = diperbarui, belum ada =
 * ditambah, ada di master tetapi tidak ada di file bulan itu = diberi keterangan "Tidak ada di ITB <bulan>" (tidak dihapus).
 * Dua cara menentukan penyulang: EAM (CXPENYULANG dari ITB) dan Lapangan (nomor gardu di DESCRIPTION -> db_Gardu, cadangan
 * nama section / switching -> db_Jaringan). Rekap dihitung di klien (web/src/asetItb.js).
 * Rancangan: docs/superpowers/specs/2026-11-02-data-aset-design.md
 */
var ASET_MENU_ = 'OPS_DATA_ASET';
var ASET_SHEET_ = 'db_Aset_ITB';
var ASET_SINKRON_PROP_ = 'ASET_ITB_SINKRON';   // JSON { waktu, bulan, judul, itbSheetId, sumber, ringkas }
var ASET_HILANG_AWAL_ = 'Tidak ada di ITB ';
var ASET_KONFLIK_AWAL_ = 'Konflik gardu: ';
var ASET_PISAH_KET_ = ' | ';   // keterangan = [catatan sistem][ | catatan manual]
var ASET_HEADER_ = ['aset_id', 'kunci', 'cx_unit', 'cx_penyulang', 'penyulang_itb', 'description', 'status', 'endmeasure',
  'jenis_kabel', 'panjang_hantaran', 'ukuran_kawat', 'kategori', 'penyulang_lapangan', 'sumber_pemetaan', 'kode_gardu',
  'keterangan', 'bulan_itb', 'diubah_pada'];
var ASET_BULAN_ = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];

/** Huruf besar, spasi tunggal, tanpa spasi tepi. */
function normSegItb_(t) { return String(t === null || t === undefined ? '' : t).replace(/\s+/g, ' ').trim().toUpperCase(); }

/** Kunci baris master: CXPENYULANG|DESCRIPTION|JENIS_KABEL|UKURAN_KAWAT (dirapikan). */
function kunciSegmenItb_(o) {
  return [o.cx_penyulang, o.description, o.jenis_kabel, o.ukuran_kawat].map(normSegItb_).join('|');
}

/** 'SUTM' | 'SKTM' | 'LAINNYA' menurut nama jenis kabel ITB. */
function kategoriKabelItb_(jenis) {
  var j = normSegItb_(jenis).replace(/\s*-\s*/g, ' - ');
  if (j === 'AAAC' || j === 'AAACS') return 'SUTM';
  if (j === 'N2XSEBY - 1 CORE' || j === 'NA2XSEYBY - 3 CORE') return 'SKTM';
  return 'LAINNYA';
}

/**
 * Isi sheet Data_Penyulang ITB -> { segmen: [...] } (kolom master tanpa pemetaan). Header wajib: DESCRIPTION, CXPENYULANG,
 * JENIS_KABEL, PANJANG_HANTARAN, UKURAN_KAWAT, STATUS (urutan kolom bebas). Tidak ada baris data = galat, supaya sinkron
 * tidak pernah menandai semua segmen master "hilang" karena file kosong / salah sheet.
 */
function susunSegmenItb_(nilai) {
  if (!nilai || !nilai.length) throw new SisiError_('HEADER_KOSONG', 'Data_Penyulang');
  var ix = {};
  nilai[0].forEach(function (h, i) { var k = normSegItb_(h); if (k && !(k in ix)) ix[k] = i; });
  ['DESCRIPTION', 'CXPENYULANG', 'JENIS_KABEL', 'PANJANG_HANTARAN', 'UKURAN_KAWAT', 'STATUS'].forEach(function (k) {
    if (!(k in ix)) throw new SisiError_('FORMAT_SALAH', 'kolom ' + k);
  });
  var sel = function (r, k) { return k in ix ? r[ix[k]] : ''; };
  var angka = function (v) { var a = angkaGgn_(v); return a === '' ? 0 : a; };
  var segmen = [], hitung = {};
  nilai.slice(1).forEach(function (r) {
    var desc = teksGgn_(sel(r, 'DESCRIPTION'));
    if (!desc) return;
    var o = {
      cx_unit: teksGgn_(sel(r, 'CXUNIT')), cx_penyulang: teksGgn_(sel(r, 'CXPENYULANG')),
      penyulang_itb: normSegItb_(sel(r, 'PENYULANG')), description: desc, status: normSegItb_(sel(r, 'STATUS')),
      endmeasure: angka(sel(r, 'ENDMEASURE')), jenis_kabel: normSegItb_(sel(r, 'JENIS_KABEL')),
      panjang_hantaran: angka(sel(r, 'PANJANG_HANTARAN')), ukuran_kawat: teksGgn_(sel(r, 'UKURAN_KAWAT'))
    };
    o.kategori = kategoriKabelItb_(o.jenis_kabel);
    var kunci = kunciSegmenItb_(o);
    hitung[kunci] = (hitung[kunci] || 0) + 1;
    o.kunci = hitung[kunci] > 1 ? kunci + '#' + hitung[kunci] : kunci;
    segmen.push(o);
  });
  if (!segmen.length) throw new SisiError_('FORMAT_SALAH', 'tidak ada baris data');
  return { segmen: segmen };
}

/** Kode gardu di deskripsi (huruf + angka, mis. PY0088), berurutan, tanpa duplikat. */
function kodeGarduDeskripsi_(desc) {
  var semua = normSegItb_(desc).match(/\b[A-Z]{1,4}\d{3,5}\b/g) || [], hasil = [];
  semua.forEach(function (k) { if (hasil.indexOf(k) === -1) hasil.push(k); });
  return hasil;
}

/** Kata jenis perangkat / awalan yang dibuang agar tinggal nama tempatnya ("ACR BEDENGUNG" -> "BEDENGUNG"). */
var ASET_KATA_PERANGKAT_ = { PERC: 1, SKTM: 1, SKTM2: 1, SUTM: 1, JOIN: 1, PMT: 1, ACR: 1, LBS: 1, OG: 1, CO: 1, GH: 1, FCO: 1, DSC: 1, JAR: 1,
  AUTOLINK: 1, INC: 1, 'INC.': 1, MANUAL: 1, WAY: 1, '3WAY': 1, '3W': 1, DSN: 1, DS: 1 };
var ASET_INTI_ABAIKAN_ = { AKHIR: 1 };

/** Nama tempat sebuah ujung segmen / section, tanpa jenis perangkat; '' bila terlalu pendek / umum (< 4 huruf, AKHIR). */
function intiUjungItb_(teks) {
  var inti = normSegItb_(teks).split(' ').filter(function (k) { return k && !ASET_KATA_PERANGKAT_[k]; }).join(' ');
  return inti.length >= 4 && !ASET_INTI_ABAIKAN_[inti] ? inti : '';
}

/** Dua ujung "A - B" (tanpa awalan SEGMEN), sudah dirapikan. */
function ujungSegmenItb_(teks) {
  var t = normSegItb_(teks).replace(/^SEGMEN\s+/, ''), i = t.indexOf(' - ');
  return i < 0 ? [t] : [t.slice(0, i), t.slice(i + 3)];
}

/**
 * Peta pemetaan dari db_Gardu (No Gardu -> Penyulang) dan db_Jaringan: nama section penuh (< 4 huruf diabaikan) dan nama tempat di
 * kedua ujung section -> penyulang (ujung: { INTI: [PENYULANG, ...] }).
 */
function bangunPetaItb_(garduRows, jaringanRows) {
  var peta = { gardu: {}, section: [], ujung: {} };
  (garduRows || []).forEach(function (r) {
    var kode = normSegItb_(r['No Gardu']), pny = normSegItb_(r.Penyulang);
    if (kode && pny && !Object.prototype.hasOwnProperty.call(peta.gardu, kode)) peta.gardu[kode] = pny;
  });
  (jaringanRows || []).forEach(function (r) {
    var nama = normSegItb_(r.section), pny = normSegItb_(r.penyulang);
    if (!pny || !(r.aktif === undefined || isAktif_(r.aktif))) return;
    if (nama.length >= 4) peta.section.push({ nama: nama, penyulang: pny });
    ujungSegmenItb_(nama).forEach(function (u) {
      var inti = intiUjungItb_(u);
      if (!inti) return;
      if (!Object.prototype.hasOwnProperty.call(peta.ujung, inti)) peta.ujung[inti] = [];
      if (peta.ujung[inti].indexOf(pny) === -1) peta.ujung[inti].push(pny);
    });
  });
  return peta;
}

/**
 * Penyulang segmen menurut DESCRIPTION: kode gardu yang ada di peta (GARDU; bila dua gardu menunjuk penyulang berbeda = BELUM +
 * catatan "Konflik gardu"); bila tidak ada, nama section terpanjang yang tercantum (SECTION); lalu nama tempat di ujung segmen yang cocok dengan ujung section, bila hanya satu penyulang (UJUNG);
 * lainnya BELUM.  */
function petakanSegmenItb_(desc, peta) {
  var D = normSegItb_(desc);
  var ada = kodeGarduDeskripsi_(D).filter(function (k) { return Object.prototype.hasOwnProperty.call(peta.gardu, k); });
  if (ada.length) {
    var pny = peta.gardu[ada[0]];
    var beda = ada.filter(function (k) { return peta.gardu[k] !== pny; });
    // dua gardu menunjuk penyulang berbeda: jangan memilih, kosongkan (BELUM) dengan catatan supaya diisi manual
    if (beda.length) return { penyulang: '', sumber: 'BELUM', kodeGardu: '', catatan: ASET_KONFLIK_AWAL_ + ada[0] + '=' + pny + ', ' + beda[0] + '=' + peta.gardu[beda[0]] };
    return { penyulang: pny, sumber: 'GARDU', kodeGardu: ada[0], catatan: '' };
  }
  var terbaik = null, teks = ' ' + D + ' ';
  peta.section.forEach(function (s) {
    if (teks.indexOf(' ' + s.nama + ' ') !== -1 && (!terbaik || s.nama.length > terbaik.nama.length)) terbaik = s;
  });
  if (terbaik) return { penyulang: terbaik.penyulang, sumber: 'SECTION', kodeGardu: '', catatan: '' };
  // cadangan: nama tempat di ujung segmen cocok dengan ujung section db_Jaringan; dipakai hanya bila semua kecocokan menunjuk satu penyulang
  var kandidat = [];
  ujungSegmenItb_(D).forEach(function (u) {
    var inti = intiUjungItb_(u);
    if (inti && peta.ujung && Object.prototype.hasOwnProperty.call(peta.ujung, inti)) {
      peta.ujung[inti].forEach(function (p) { if (kandidat.indexOf(p) === -1) kandidat.push(p); });
    }
  });
  if (kandidat.length === 1) return { penyulang: kandidat[0], sumber: 'UJUNG', kodeGardu: '', catatan: '' };
  return { penyulang: '', sumber: 'BELUM', kodeGardu: '', catatan: '' };
}

/** keterangan -> { sistem, manual }: bagian pertama berawalan "Tidak ada di ITB " / "Konflik gardu: " = sistem. */
function pecahKetAset_(k) {
  var s = String(k || ''), i = s.indexOf(ASET_PISAH_KET_), awal = i < 0 ? s : s.slice(0, i);
  var sistem = awal.indexOf(ASET_HILANG_AWAL_) === 0 || awal.indexOf(ASET_KONFLIK_AWAL_) === 0;
  if (sistem) return { sistem: awal, manual: i < 0 ? '' : s.slice(i + ASET_PISAH_KET_.length) };
  return { sistem: '', manual: s };
}
function gabungKetAset_(sistem, manual) { return sistem && manual ? sistem + ASET_PISAH_KET_ + manual : sistem || manual; }

var ASET_BANDING_ = ['cx_unit', 'penyulang_itb', 'description', 'status', 'endmeasure', 'jenis_kabel', 'panjang_hantaran',
  'ukuran_kawat', 'kategori', 'penyulang_lapangan', 'sumber_pemetaan', 'kode_gardu', 'keterangan'];

/**
 * Upsert per kunci: master + isi file ITB bulan itu -> { baris, ringkas }. Baris master urut tetap, baris baru di akhir.
 * ringkas: tambah, ubah, sama (ada di file, isi sama), hilang (jumlah baris berketerangan hilang sesudah gabung),
 * pulih (hilang lalu muncul lagi), belum (BELUM terpetakan), lainnya (kategori LAINNYA); dua terakhir dari baris ada di file.
 * Koreksi manual (sumber_pemetaan MANUAL, catatan manual di keterangan) tidak ditimpa.
 */
function gabungSegmenItb_(master, itb, peta, opsi) {
  var ringkas = { tambah: 0, ubah: 0, sama: 0, hilang: 0, pulih: 0, belum: 0, lainnya: 0 };
  var salin = function (o) { var r = {}; Object.keys(o).forEach(function (k) { r[k] = o[k]; }); return r; };
  var baris = (master || []).map(salin), indeks = {}, ada = {};
  baris.forEach(function (m) { indeks[m.kunci] = m; });
  var beda = function (a, b) {
    return ASET_BANDING_.some(function (k) { return String(a[k] === undefined || a[k] === null ? '' : a[k]) !== String(b[k] === undefined || b[k] === null ? '' : b[k]); });
  };
  itb.forEach(function (o) {
    ada[o.kunci] = true;
    var m = indeks[o.kunci], p = petakanSegmenItb_(o.description, peta);
    if (!m) {
      var baru = { aset_id: 'a' + sha256Hex_(o.kunci).slice(0, 11), kunci: o.kunci, cx_unit: o.cx_unit, cx_penyulang: o.cx_penyulang,
        penyulang_itb: o.penyulang_itb, description: o.description, status: o.status, endmeasure: o.endmeasure,
        jenis_kabel: o.jenis_kabel, panjang_hantaran: o.panjang_hantaran, ukuran_kawat: o.ukuran_kawat, kategori: o.kategori,
        penyulang_lapangan: p.penyulang, sumber_pemetaan: p.sumber, kode_gardu: p.kodeGardu, keterangan: p.catatan,
        bulan_itb: opsi.bulan, diubah_pada: opsi.sekarang };
      baris.push(baru); indeks[o.kunci] = baru; ringkas.tambah += 1;
      return;
    }
    var ket = pecahKetAset_(m.keterangan), manual = m.sumber_pemetaan === 'MANUAL';
    var lama = salin(m);
    ['cx_unit', 'penyulang_itb', 'description', 'status', 'endmeasure', 'jenis_kabel', 'panjang_hantaran', 'ukuran_kawat', 'kategori']
      .forEach(function (k) { m[k] = o[k]; });
    if (!manual) { m.penyulang_lapangan = p.penyulang; m.sumber_pemetaan = p.sumber; m.kode_gardu = p.kodeGardu; }
    m.keterangan = gabungKetAset_(manual ? '' : p.catatan, ket.manual);
    var berubah = beda(lama, m);
    m.bulan_itb = opsi.bulan;
    if (berubah || ket.sistem.indexOf(ASET_HILANG_AWAL_) === 0) m.diubah_pada = opsi.sekarang;
    if (ket.sistem.indexOf(ASET_HILANG_AWAL_) === 0) ringkas.pulih += 1;
    else if (berubah) ringkas.ubah += 1;
    else ringkas.sama += 1;
  });
  baris.forEach(function (m) {
    if (ada[m.kunci]) {
      if (m.sumber_pemetaan === 'BELUM') ringkas.belum += 1;
      if (m.kategori === 'LAINNYA') ringkas.lainnya += 1;
      return;
    }
    var ket = pecahKetAset_(m.keterangan);
    if (ket.sistem.indexOf(ASET_HILANG_AWAL_) !== 0) {
      m.keterangan = gabungKetAset_(ASET_HILANG_AWAL_ + opsi.bulan, ket.manual);
      m.diubah_pada = opsi.sekarang;
    }
    ringkas.hilang += 1;
  });
  return { baris: baris, ringkas: ringkas };
}

/** "ITB ULP Toboali September 2026" -> '2026-09'; tidak terbaca -> bulan hariIni ('yyyy-MM-dd' -> 'yyyy-MM'). */
function bulanDariJudulItb_(judul, hariIni) {
  var m = new RegExp('(' + ASET_BULAN_.join('|') + ')\\s+(\\d{4})', 'i').exec(String(judul || ''));
  if (!m) return String(hariIni).slice(0, 7);
  var n = ASET_BULAN_.indexOf(m[1].toLowerCase()) + 1;
  return m[2] + '-' + (n < 10 ? '0' : '') + n;
}

/* ===== Endpoint + sinkron (hanya admin, menu OPS_DATA_ASET) ===== */

function wajibAdminAset_(sesi) {
  if (!sesi || sesi.role === 'PETUGAS' || ROLE_VALID_().indexOf(sesi.role) === -1) throw new SisiError_('AKSES_DITOLAK', 'data aset khusus admin');
}

function bacaInfoAset_() {
  var teks = PropertiesService.getScriptProperties().getProperty(ASET_SINKRON_PROP_);
  if (!teks) return null;
  try { return JSON.parse(teks); } catch (e) { return null; }
}

function infoPublikAset_(info) {
  return info ? { waktu: info.waktu, bulan: info.bulan, judul: info.judul, itbSheetId: info.itbSheetId, ringkas: info.ringkas } : null;
}

/** Baris master -> bentuk jawaban ringkas (nama pendek supaya jawaban kecil). */
function keluarAset_(r) {
  var angka = function (v) { var a = angkaGgn_(v); return a === '' ? 0 : a; };
  return { id: String(r.aset_id), cx: teksGgn_(r.cx_penyulang), cxUnit: teksGgn_(r.cx_unit), pny: teksGgn_(r.penyulang_itb),
    desc: teksGgn_(r.description), status: teksGgn_(r.status), akhir: angka(r.endmeasure), jenis: teksGgn_(r.jenis_kabel),
    kategori: teksGgn_(r.kategori), panjang: angka(r.panjang_hantaran), ukuran: teksGgn_(r.ukuran_kawat),
    pnyLap: teksGgn_(r.penyulang_lapangan), sumber: teksGgn_(r.sumber_pemetaan), gardu: teksGgn_(r.kode_gardu),
    ket: String(r.keterangan || ''), hilang: pecahKetAset_(r.keterangan).sistem.indexOf(ASET_HILANG_AWAL_) === 0,
    bulan: teksGgn_(r.bulan_itb) };
}

/** getDataAset {} -> { sinkron, segmen: [...] }. Rekap dihitung di klien. */
function getDataAset_(sesi, data) {
  wajibAdminAset_(sesi);
  cekDataGgn_(data, []);
  var t = tabel_('SISI_ITB_SHEET_ID', ASET_SHEET_);
  return { sinkron: infoPublikAset_(bacaInfoAset_()), segmen: t.rows.filter(function (r) { return r.kunci; }).map(keluarAset_) };
}

function pastikanHeaderAset_(header) {
  if (ASET_HEADER_.some(function (h, i) { return header[i] !== h; })) throw new SisiError_('CONFIG_TIDAK_VALID', 'header ' + ASET_SHEET_);
}

/** Baca file ITB (tidak diubah), gabungkan ke master di dalam lock. Gagal membaca / file kosong = tidak ada yang ditulis. */
function sinkronAsetItb_(idItb, sumber) {
  var c = cfg_();
  if (!c.SISI_ITB_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'SISI_ITB_SHEET_ID');
  if (!c.GARDU_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'GARDU_SHEET_ID');
  var ss = bukaSpreadsheet_(idItb), sh = ss.getSheetByName('Data_Penyulang');
  if (!sh) throw new SisiError_('SHEET_TIDAK_ADA', 'Data_Penyulang');
  // getValues (bukan getDisplayValues): panjang aslinya 3 desimal, nilai tampil dibulatkan 2 desimal dan menggelembungkan total
  var segmen = susunSegmenItb_(sh.getDataRange().getValues()).segmen;
  var judul = typeof ss.getName === 'function' ? String(ss.getName()) : '';
  var bulan = bulanDariJudulItb_(judul, tglJakarta_(new Date()));
  var peta = bangunPetaItb_(tabel_('GARDU_SHEET_ID', 'db_Gardu').rows, tabel_('MASTER_SHEET_ID', 'db_Jaringan').rows);
  return denganLock_(function () {
    var t = tabel_('SISI_ITB_SHEET_ID', ASET_SHEET_);
    pastikanHeaderAset_(t.header);
    var master = t.rows.filter(function (r) { return r.kunci; }).map(function (r) { r.kunci = String(r.kunci); return r; });
    var hasil = gabungSegmenItb_(master, segmen, peta, { bulan: bulan, sekarang: sekarangIso_() });
    var nilai = hasil.baris.map(function (o) { return barisDariObjek_(ASET_HEADER_, o); });
    // hasil gabung tidak pernah lebih pendek dari master (baris hilang tetap ada): cukup menimpa, tanpa mengosongkan dulu,
    // supaya kegagalan di tengah penulisan tidak meninggalkan master kosong
    var sh2 = t.sheet;
    if (sh2.getMaxRows() < nilai.length + 1) sh2.insertRowsAfter(sh2.getMaxRows(), nilai.length + 1 - sh2.getMaxRows());
    sh2.getRange(2, 1, nilai.length, ASET_HEADER_.length).setValues(nilai);
    var info = { waktu: sekarangIso_(), bulan: bulan, judul: judul, itbSheetId: idItb, sumber: sumber, ringkas: hasil.ringkas };
    var p = PropertiesService.getScriptProperties();
    p.setProperty(ASET_SINKRON_PROP_, JSON.stringify(info));
    p.setProperty(CACHE_BACA_REV_PROP_, revBaruCacheBaca_());
    return info;
  }, 30000);
}

/** sinkronDataAset {} -> sinkron. Tombol "Perbarui Data Aset" (akses UBAH): MASTER_ITB_SHEET_ID (dibaca) -> SISI_ITB_SHEET_ID (ditulis). */
function sinkronDataAset_(sesi, data) {
  wajibAdminAset_(sesi);
  cekDataGgn_(data, []);
  var id = cfg_().MASTER_ITB_SHEET_ID;
  if (!id) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'MASTER_ITB_SHEET_ID');
  return infoPublikAset_(sinkronAsetItb_(id, 'WEB:' + String(sesi.username || sesi.userId || '')));
}

/** Editor: buat tab db_Aset_ITB di SISI_ITB_SHEET_ID (sekali; sudah ada = header dicek). Kolom angka dibiarkan, kolom lain teks. */
function ADMIN_siapkanSheetAsetItb() {
  pastikanPemilik_();
  var ss = bukaSpreadsheet_(cfg_().SISI_ITB_SHEET_ID), sh = ss.getSheetByName(ASET_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(ASET_SHEET_);
    sh.getRange(1, 1, 1, ASET_HEADER_.length).setValues([ASET_HEADER_]).setFontWeight('bold');
    ASET_HEADER_.forEach(function (h, i) {
      if (h !== 'endmeasure' && h !== 'panjang_hantaran') sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    });
    sh.getRange(1, 1, 1, ASET_HEADER_.length).setValues([ASET_HEADER_]);
    sh.setFrozenRows(1);
    console.log(ASET_SHEET_ + ' dibuat.');
  }
  pastikanHeaderAset_(sh.getRange(1, 1, 1, ASET_HEADER_.length).getValues()[0].map(function (h) { return String(h).trim(); }));
  console.log(ASET_SHEET_ + ' siap. Lanjut: ADMIN_sinkronAsetItbAwal (atau menu Data Aset > Perbarui Data Aset).');
}

/**
 * Editor: sinkron PERTAMA (migrasi awal) dari file ITB di MASTER_ITB_SHEET_ID; tab db_Aset_ITB dibuat bila belum ada. Aman
 * diulang (upsert, file ITB hanya dibaca). Berikutnya: tombol "Perbarui Data Aset" di website.
 */
function ADMIN_sinkronAsetItbAwal() {
  pastikanPemilik_();
  var id = cfg_().MASTER_ITB_SHEET_ID;
  if (!id) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'MASTER_ITB_SHEET_ID');
  ADMIN_siapkanSheetAsetItb();
  var info = sinkronAsetItb_(id, 'ADMIN:awal');
  console.log('Sinkron awal selesai: file "' + info.judul + '" (bulan ' + info.bulan + '). ' + JSON.stringify(info.ringkas));
  return info.ringkas;
}
