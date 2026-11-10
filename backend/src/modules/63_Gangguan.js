/**
 * v1.0.37 (permintaan Master Guswan 27 Okt 2026): HISTORY GANGGUAN (menu OPS_REKAP_GANGGUAN), website dulu lalu HP.
 *
 * Sumber = spreadsheet aktif "Rekap_Gangguan ULP Toboali" (Script Property GANGGUAN_SUMBER_SHEET_ID), HANYA DIBACA:
 *   Gangguan_Dashboard_Wilayah  gangguan penyulang (padam); IMPORTRANGE dari Dashboard_Padam_PLN_BABEL (se-wilayah, disaring kolom ULP)
 *   AR_Dashboard_Wilayah        auto reclose; IMPORTRANGE yang sama
 *   Tarikan_PickUp_UP3          pick up recloser (se-UP3, disaring ULP Toboali)
 * Data lama penyulang / AR (sumber Tarikan_SiMonLang / Tarikan_AR) disimpan beku sebagai ggn_Penyulang_SiMonLang /
 * ggn_AR_SiMonLang (ADMIN_migrasiGangguanSumberBaru) untuk pembanding (ADMIN_bandingGangguan).
 * Disalin (dinormalkan, kolom yang dipakai saja) ke spreadsheet SiSi_Gangguan (GANGGUAN_SHEET_ID): ggn_Penyulang, ggn_AR,
 * ggn_PickUp. Endpoint baca hanya membuka salinan ini (sempit, cepat, dicache), tidak pernah membuka sumber.
 *
 * Sinkron: pemicu harian jam 18 WIB (ADMIN_jadwalkanSinkronGangguan, 1 eksekusi / hari ±10-20 dtk) + tombol "Perbarui
 * dari sumber" di website (sinkronHistoriGangguan, akses UBAH). Tab yang isinya tidak berubah tidak ditulis ulang.
 */
var GGN_MENU_ = 'OPS_REKAP_GANGGUAN';
var GGN_SINKRON_PROP_ = 'GGN_SINKRON';   // JSON { waktu, sumber, jumlah: {..}, sidik: {..} }
var GGN_PEMICU_FN_ = 'ADMIN_pemicuSinkronGangguan';
var GGN_JAM_PEMICU_ = 18;

var GGN_TAB_ = {
  penyulang: {
    sheet: 'ggn_Penyulang', sumber: 'Gangguan_Dashboard_Wilayah', acuan: 'ggn_Penyulang_SiMonLang',
    header: ['gangguan_id', 'no_apkt', 'up3', 'ulp', 'penyulang', 'kode_aset', 'peralatan', 'jenis_peralatan', 'waktu_padam',
      'waktu_nyala', 'durasi_menit', 'indikasi', 'status', 'arus_r', 'arus_s', 'arus_t', 'arus_n', 'beban_a', 'pelanggan',
      'pelanggan_x_durasi', 'pelanggan_vip', 'ens_kwh', 'scada', 'status_scada', 'cuaca', 'kode_fgtm', 'penyebab',
      'ket_penyebab', 'lokasi', 'daerah_padam', 'jumlah_gardu', 'keterangan', 'petugas', 'pengawas', 'koordinat',
      'nyala_bertahap', 'masih_padam']
  },
  ar: {
    sheet: 'ggn_AR', sumber: 'AR_Dashboard_Wilayah', acuan: 'ggn_AR_SiMonLang',
    header: ['ar_id', 'ulp', 'penyulang', 'kode_aset', 'peralatan', 'jenis_peralatan', 'waktu_ar', 'indikasi', 'arus_r',
      'arus_s', 'arus_t', 'arus_n', 'beban_a', 'pelanggan', 'ens_kwh', 'scada', 'status_scada', 'cuaca', 'kode_fgtm',
      'penyebab', 'ket_penyebab', 'lokasi', 'keterangan', 'petugas', 'pengawas', 'koordinat']
  },
  pickup: {
    sheet: 'ggn_PickUp', sumber: 'Tarikan_PickUp_UP3',
    header: ['pickup_id', 'ulp', 'penyulang', 'recloser', 'waktu_event', 'indikasi_relay', 'fasa', 'waktu_tindak_lanjut',
      'temuan', 'status', 'koordinat_temuan', 'koordinat_ujung', 'petugas_eksekusi', 'foto_arus', 'foto_ujung',
      'foto_temuan', 'foto_sesudah']
  }
};
var GGN_JENIS_ = ['penyulang', 'ar', 'pickup'];

var GGN_BULAN_ = { jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, maret: 3, apr: 4, april: 4, mei: 5, may: 5, jun: 6,
  juni: 6, jul: 7, juli: 7, agu: 8, agt: 8, agustus: 8, aug: 8, sep: 9, september: 9, okt: 10, oktober: 10, oct: 10,
  nov: 11, november: 11, des: 12, desember: 12, dec: 12 };

/* ===== normalisasi (murni, diuji) ===== */

function teksGgn_(v) { return String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim(); }

/** Teks tanggal sumber -> 'yyyy-MM-dd HH:mm' (jam opsional, '' = tidak terbaca). */
function waktuGgn_(tgl, jam) {
  var s = teksGgn_(tgl), m, y, b, d;
  if (/^\d{5}(?:[.,]\d+)?$/.test(s)) s = serialGgn_(s);   // sel tanpa format tanggal: nomor seri Sheets
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) { y = +m[1]; b = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) { d = +m[1]; b = +m[2]; y = +m[3]; }
  else if ((m = /^(\d{1,2})[ -]([A-Za-z]+)[ -](\d{4})/.exec(s)) && GGN_BULAN_[m[2].toLowerCase()]) { d = +m[1]; b = GGN_BULAN_[m[2].toLowerCase()]; y = +m[3]; }
  else return '';
  if (!(y >= 2000 && y <= 2100 && b >= 1 && b <= 12 && d >= 1 && d <= 31)) return '';
  var jm = jamGgn_(jam === undefined ? s.slice(m[0].length) : jam);
  var hasil = y + '-' + pad2_(String(b)) + '-' + pad2_(String(d));
  return jm ? hasil + ' ' + jm : hasil;
}

/** Nomor seri tanggal Sheets ('46000', '46000,5') -> 'yyyy-MM-dd[ HH:mm]'. */
function serialGgn_(s) {
  var n = Number(s.replace(',', '.')), hari = Math.floor(n), sisa = Math.round((n - hari) * 1440) % 1440;
  var tgl = new Date(Date.UTC(1899, 11, 30) + hari * 864e5).toISOString().slice(0, 10);
  return sisa ? tgl + ' ' + ('0' + Math.floor(sisa / 60)).slice(-2) + ':' + ('0' + (sisa % 60)).slice(-2) : tgl;
}

/** Jam sumber -> 'HH:mm' ('' = tidak terbaca): '03:50', '3.50', '19:55:00', atau pecahan hari sel tanpa format jam ('0,4583' = 11:00). */
function jamGgn_(v) {
  var s = teksGgn_(v), x;
  if (/^[01]?[.,]\d+$/.test(s) || s === '0') {
    x = Math.round(Number(s.replace(',', '.')) * 1440) % 1440;
    return ('0' + Math.floor(x / 60)).slice(-2) + ':' + ('0' + (x % 60)).slice(-2);
  }
  var j = /(\d{1,2})[:.](\d{2})/.exec(s);
  return j && +j[1] < 24 && +j[2] < 60 ? pad2_(j[1]) + ':' + j[2] : '';
}

/** Angka sumber ('47', '1,5', 'Rp59.203') -> number, '' = kosong / bukan angka. */
function angkaGgn_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : '';
  var s = teksGgn_(v);
  if (!s) return '';
  if (/^rp/i.test(s)) s = s.replace(/^rp\.?\s*/i, '').replace(/\./g, '').replace(',', '.');
  else if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');   // '1.502,3181' / '0,0833'
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : '';
}

/** 'yyyy-MM-dd' + n hari. */
function tambahHariGgn_(ymd, n) {
  var d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Sumber baru hanya menyimpan jam nyala: tanggal = tanggal padam, jam nyala < jam padam = lewat tengah malam (+1 hari). */
function nyalaGgn_(padam, jamNyala) {
  var jm = jamGgn_(jamNyala);
  if (!padam || !jm) return '';
  var hasil = padam.slice(0, 10) + ' ' + jm;
  return padam.length > 10 && hasil < padam ? tambahHariGgn_(padam.slice(0, 10), 1) + hasil.slice(10) : hasil;
}

/** Penyebab Padam sumber baru = label Kode FGTM tanpa kode; kode dilekatkan supaya grafik FGTM website tetap jalan. */
var GGN_FGTM_ = [[/^komponen\s*jtm/i, 'I1'], [/^peralatan\s*jtm/i, 'I2'], [/^trafo/i, 'I3'], [/^tiang/i, 'I4'], [/^pohon/i, 'E1'],
  [/^bencana/i, 'E2'], [/^pekerjaan\s*pihak/i, 'E3'], [/^layang/i, 'E4']];
function fgtmGgn_(penyebab) {
  var s = teksGgn_(penyebab);
  if (!s || /\b[IE]\s*-?\s*\d\s*$/i.test(s)) return s;
  for (var i = 0; i < GGN_FGTM_.length; i++) if (GGN_FGTM_[i][0].test(s)) return s + ' - ' + GGN_FGTM_[i][1];
  return s;   // 'Tidak Diketahui' / 'Belum Diketahui' / lainnya: website membaca sebagai E (tidak diketahui)
}

/** 'ACR POLSEK SIMBA - UJUNG' -> 'ACR'. Awalan lain = '' (website menilai dari nama peralatan). */
function jenisAlatGgn_(nama) {
  var m = /^\s*(PMT|ACR|OG|LBS|RECLOSER|SSO)\b/i.exec(String(nama || ''));
  return m ? m[1].toUpperCase() : '';
}

/** Sel JSON daftar ('[]', '[{..}]') -> array; bukan JSON daftar = null. */
function daftarJsonGgn_(v) {
  var s = teksGgn_(v);
  if (s.charAt(0) !== '[') return null;
  try { var x = JSON.parse(s); return Array.isArray(x) ? x : null; } catch (e) { return null; }
}

/** 'Tahapan Nyala' [{section, jam, gardu, cust, daerah}] -> [{tahap, section, jam, gardu, pelanggan, daerah}]. */
function tahapanGgn_(v) {
  var daftar = daftarJsonGgn_(v) || [];
  return daftar.filter(function (t) { return t && typeof t === 'object'; }).map(function (t, i) {
    return { tahap: i + 1, section: teksGgn_(t.section), jam: teksGgn_(t.jam), gardu: angkaGgn_(t.gardu),
      pelanggan: angkaGgn_(t.cust), daerah: teksGgn_(t.daerah) };
  });
}

/** 'Section Masih Padam' -> { gardu, pelanggan, daerah } atau '' (kosong / '[]'). Teks biasa = daerah saja. */
function masihPadamGgn_(v) {
  var s = teksGgn_(v), daftar = daftarJsonGgn_(s);
  if (!daftar) return s ? { gardu: '', pelanggan: '', daerah: s } : '';
  daftar = daftar.filter(function (t) { return t && typeof t === 'object'; });
  if (!daftar.length) return '';
  var jml = function (k) { var n = 0, ada = false; daftar.forEach(function (t) { var a = angkaGgn_(t[k]); if (a !== '') { n += a; ada = true; } }); return ada ? n : ''; };
  return { gardu: jml('gardu'), pelanggan: jml('cust'),
    daerah: daftar.map(function (t) { return teksGgn_(t.section) || teksGgn_(t.daerah); }).filter(Boolean).join('; ') };
}

/** 'lat<tab>lng' / 'lat lng' / 'lat, lng' -> 'lat, lng'. */
function koordinatTeksGgn_(v) { return teksGgn_(v).replace(/^(-?\d+(?:\.\d+)?)\s*[;\s]\s*(-?\d+(?:\.\d+)?)$/, '$1, $2'); }

function koordinatGgn_(a, b) {
  var la = angkaGgn_(a), lo = angkaGgn_(b);
  return la !== '' && lo !== '' && la !== 0 && lo !== 0 ? la + ', ' + lo : '';
}

function penyulangGgn_(v) { return teksGgn_(v).toUpperCase(); }

/** Baris sumber (objek per nama header) -> objek tab ggn_. null = bukan ULP ini / tanpa waktu. */
function normalGgn_(jenis, r, alias) {
  var ulp = teksGgn_(r['ULP'] || r['ULP '] || '');
  // sumber wilayah (se-Babel): hanya ULP ini, kolom ULP kosong dibuang; pick up lama: kolom kosong dibiarkan
  if (jenis === 'pickup' ? ulp && !ulpCocok_(ulp, alias) : !ulpCocok_(ulp, alias)) return null;
  if (jenis === 'penyulang') {
    var padam = waktuGgn_(r['Tanggal Padam'], r['Jam Padam']);
    var tahap = tahapanGgn_(r['Tahapan Nyala']), masih = masihPadamGgn_(r['Section Masih Padam']);
    var jam = angkaGgn_(r['Durasi (jam)']);
    var o = {
      gangguan_id: teksGgn_(r['ID']), no_apkt: teksGgn_(r['Nomor APKT']), up3: teksGgn_(r['UP3']), ulp: ulp,
      penyulang: penyulangGgn_(r['Nama Penyulang']), kode_aset: teksGgn_(r['Kode Aset']), peralatan: teksGgn_(r['Nama Aset']),
      jenis_peralatan: jenisAlatGgn_(r['Nama Aset']), waktu_padam: padam, waktu_nyala: nyalaGgn_(padam, r['Jam Nyala']),
      durasi_menit: jam === '' ? '' : Math.round(jam * 60), indikasi: teksGgn_(r['Indikasi Padam']).toUpperCase(),
      status: teksGgn_(r['Status']), arus_r: angkaGgn_(r['IR (A)']), arus_s: angkaGgn_(r['IS (A)']), arus_t: angkaGgn_(r['IT (A)']),
      arus_n: angkaGgn_(r['IN (A)']), beban_a: angkaGgn_(r['Arus Sebelum Trip (A)']), pelanggan: angkaGgn_(r['Jumlah Pelanggan']),
      pelanggan_x_durasi: angkaGgn_(r['Pelanggan x Durasi']), pelanggan_vip: teksGgn_(r['Pelanggan VIP']),
      ens_kwh: angkaGgn_(r['ENS (kWh)']), scada: teksGgn_(r['Keberhasilan SCADA']).toUpperCase(), status_scada: teksGgn_(r['Status SCADA']),
      cuaca: teksGgn_(r['Cuaca']).toUpperCase(), kode_fgtm: fgtmGgn_(r['Penyebab Padam']), penyebab: teksGgn_(r['Penyebab Padam']),
      ket_penyebab: teksGgn_(r['Keterangan Penyebab']), lokasi: teksGgn_(r['Lokasi Gangguan']), daerah_padam: teksGgn_(r['Daerah Padam']),
      jumlah_gardu: angkaGgn_(r['Jumlah Gardu']), keterangan: teksGgn_(r['Keterangan']), petugas: teksGgn_(r['Nama Petugas P2D']),
      pengawas: teksGgn_(r['Nama Pengawas']), koordinat: koordinatTeksGgn_(r['Koordinat Gangguan']),
      nyala_bertahap: tahap.length ? JSON.stringify(tahap) : '', masih_padam: masih ? JSON.stringify(masih) : ''
    };
    return o.waktu_padam && o.penyulang ? o : null;
  }
  if (jenis === 'ar') {
    var a = {
      ar_id: teksGgn_(r['ID']), ulp: ulp, penyulang: penyulangGgn_(r['Nama Penyulang']), kode_aset: teksGgn_(r['Kode Aset']),
      peralatan: teksGgn_(r['Nama Aset']), jenis_peralatan: jenisAlatGgn_(r['Nama Aset']),
      waktu_ar: waktuGgn_(r['Tanggal Padam'], r['Jam Padam']), indikasi: teksGgn_(r['Indikasi Padam']).toUpperCase(),
      arus_r: angkaGgn_(r['IR (A)']), arus_s: angkaGgn_(r['IS (A)']), arus_t: angkaGgn_(r['IT (A)']), arus_n: angkaGgn_(r['IN (A)']),
      beban_a: angkaGgn_(r['Arus Sebelum Trip (A)']), pelanggan: angkaGgn_(r['Jumlah Pelanggan']), ens_kwh: angkaGgn_(r['ENS (kWh)']),
      scada: teksGgn_(r['Keberhasilan SCADA']).toUpperCase(), status_scada: teksGgn_(r['Status SCADA']), cuaca: teksGgn_(r['Cuaca']).toUpperCase(),
      kode_fgtm: fgtmGgn_(r['Penyebab Padam']), penyebab: teksGgn_(r['Penyebab Padam']), ket_penyebab: teksGgn_(r['Keterangan Penyebab']),
      lokasi: teksGgn_(r['Lokasi Gangguan']), keterangan: teksGgn_(r['Keterangan']), petugas: teksGgn_(r['Nama Petugas P2D']),
      pengawas: teksGgn_(r['Nama Pengawas']), koordinat: koordinatTeksGgn_(r['Koordinat Gangguan'])
    };
    return a.waktu_ar && a.penyulang ? a : null;
  }
  var p = {
    pickup_id: '', ulp: ulp, penyulang: penyulangGgn_(r['Penyulang_Fix'] || r['PENYULANG']), recloser: teksGgn_(r['RECLOSER']),
    waktu_event: waktuGgn_(r['TANGGAL EVENT'], r['JAM EVENT']), indikasi_relay: teksGgn_(r['INDIKASI RELAY']).toUpperCase(),
    fasa: teksGgn_(r['PHASE']).toUpperCase(), waktu_tindak_lanjut: waktuGgn_(r['TANGGAL TINDAK LANJUT']),
    temuan: teksGgn_(r['TEMUAN']), status: teksGgn_(r['STATUS']).toUpperCase(),
    koordinat_temuan: teksGgn_(r['KOORDINAT TEMUAN']), koordinat_ujung: teksGgn_(r['KOORDINAT GARDU UJUNG / UJUNG JARINGAN']),
    petugas_eksekusi: teksGgn_(r['PETUGAS EKSEKUSI']),
    foto_arus: linkGgn_(r['LINK FOTO ARUS PICK UP']), foto_ujung: linkGgn_(r['LINK FOTO GARDU UJUNG / UJUNG JARINGAN']),
    foto_temuan: linkGgn_(r['LINK FOTO TEMUAN']), foto_sesudah: linkGgn_(r['LINK FOTO SESUDAH DIEKSEKUSI'])
  };
  return p.waktu_event && p.penyulang ? p : null;
}

/** Hanya tautan https (foto AppSheet); lainnya dibuang (tidak pernah jadi href mentah di website). */
function linkGgn_(v) { var s = teksGgn_(v); return /^https:\/\/[^\s"'<>]+$/.test(s) ? s : ''; }

/** Tabel sumber (baris pertama header) -> baris ggn_ terurut waktu terbaru dulu. Pick up diberi id stabil. */
function susunTabGgn_(jenis, nilai, alias) {
  if (!nilai || !nilai.length) return [];
  var header = nilai[0].map(teksGgn_), hasil = [];
  for (var i = 1; i < nilai.length; i++) {
    var r = {};
    for (var j = 0; j < header.length; j++) if (header[j] && !(header[j] in r)) r[header[j]] = nilai[i][j];
    var o = normalGgn_(jenis, r, alias);
    if (o) hasil.push(o);
  }
  var kunciWaktu = { penyulang: 'waktu_padam', ar: 'waktu_ar', pickup: 'waktu_event' }[jenis];
  if (jenis === 'pickup') {
    var kembar = {};
    hasil.forEach(function (o) {
      var dasar = [o.waktu_event, o.penyulang, o.recloser, o.indikasi_relay, o.fasa].join('|');
      kembar[dasar] = (kembar[dasar] || 0) + 1;
      o.pickup_id = sha256Hex_(dasar + '|' + kembar[dasar]).slice(0, 12);
    });
  }
  hasil.sort(function (a, b) { return a[kunciWaktu] < b[kunciWaktu] ? 1 : a[kunciWaktu] > b[kunciWaktu] ? -1 : 0; });
  return hasil;
}

/* ===== sinkron ===== */

function bacaInfoSinkronGgn_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(GGN_SINKRON_PROP_) || 'null'); } catch (e) { return null; }
}

/** Baca 3 tab sumber, tulis tab ggn_ yang isinya berubah. Hasil = info sinkron. */
function sinkronGgn_(sumber) {
  var c = cfg_();
  if (!c.GANGGUAN_SUMBER_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'GANGGUAN_SUMBER_SHEET_ID');
  if (!c.GANGGUAN_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'GANGGUAN_SHEET_ID');
  var src = bukaSpreadsheet_(c.GANGGUAN_SUMBER_SHEET_ID), tujuan = bukaSpreadsheet_(c.GANGGUAN_SHEET_ID);
  var data = {};
  GGN_JENIS_.forEach(function (j) {
    var sh = src.getSheetByName(GGN_TAB_[j].sumber);
    if (!sh) throw new SisiError_('SHEET_TIDAK_ADA', GGN_TAB_[j].sumber);
    data[j] = susunTabGgn_(j, sh.getDataRange().getDisplayValues(), c.ULP_ALIAS);
  });
  var hasil = denganLock_(function () {
    var lama = bacaInfoSinkronGgn_() || {}, sidikLama = lama.sidik || {};
    var info = { waktu: sekarangIso_(), sumber: sumber, jumlah: {}, sidik: {}, ditulis: [] };
    GGN_JENIS_.forEach(function (j) {
      var tab = GGN_TAB_[j], sh = tujuan.getSheetByName(tab.sheet);
      if (!sh) throw new SisiError_('SHEET_TIDAK_ADA', tab.sheet);
      var baris = data[j].map(function (o) { return barisDariObjek_(tab.header, o); });
      var sidik = sha256Hex_(JSON.stringify(baris)).slice(0, 16);
      info.jumlah[j] = baris.length;
      info.sidik[j] = sidik;
      if (sidik === sidikLama[j] && sh.getLastRow() === baris.length + 1) return;
      var ada = sh.getLastRow();
      if (ada > 1) sh.getRange(2, 1, ada - 1, Math.max(sh.getLastColumn(), tab.header.length)).clearContent();
      if (baris.length) sh.getRange(2, 1, baris.length, tab.header.length).setValues(baris);
      info.ditulis.push(tab.sheet);
    });
    var p = PropertiesService.getScriptProperties();
    p.setProperty(GGN_SINKRON_PROP_, JSON.stringify(info));
    // pemicu tidak lewat router: jawaban baca tersimpan dibuang di sini
    if (info.ditulis.length) p.setProperty(CACHE_BACA_REV_PROP_, revBaruCacheBaca_());
    return info;
  }, 30000);
  sinkronMysqlGgnAman_(hasil);   // v1.0.38: salinan baca MySQL website (di luar lock; gagal tidak menggagalkan sinkron)
  return hasil;
}

/** Editor: buat spreadsheet tab ggn_ (sekali; sudah ada = header dicek), lalu sinkron pertama. */
function ADMIN_siapkanSheetGangguan() {
  pastikanPemilik_();
  var ss = bukaSpreadsheet_(cfg_().GANGGUAN_SHEET_ID);
  GGN_JENIS_.forEach(function (j) {
    var tab = GGN_TAB_[j], sh = ss.getSheetByName(tab.sheet);
    if (!sh) {
      sh = ss.insertSheet(tab.sheet);
      sh.getRange(1, 1, 1, tab.header.length).setValues([tab.header]).setFontWeight('bold');
      sh.setFrozenRows(1);
      console.log(tab.sheet + ' dibuat.');
    }
    var h = sh.getRange(1, 1, 1, tab.header.length).getValues()[0].map(teksGgn_);
    if (tab.header.some(function (x, i) { return h[i] !== x; })) throw new SisiError_('CONFIG_TIDAK_VALID', 'header ' + tab.sheet);
  });
  var info = sinkronGgn_('ADMIN');
  console.log('Sinkron selesai: ' + JSON.stringify(info.jumlah) + '. Pasang pemicu harian: ADMIN_jadwalkanSinkronGangguan.');
}

/**
 * Editor, sekali (4 Nov 2026): pindah penyulang + AR ke sumber baru. Isi lama ggn_Penyulang / ggn_AR disalin utuh jadi
 * ggn_Penyulang_SiMonLang / ggn_AR_SiMonLang (beku, pembanding), lalu tab ggn_ dikosongkan berheader baru dan disinkron.
 * Tab yang sudah berheader baru dilewati; acuan yang sudah ada tidak pernah ditimpa.
 */
function ADMIN_migrasiGangguanSumberBaru() {
  pastikanPemilik_();
  var ss = bukaSpreadsheet_(cfg_().GANGGUAN_SHEET_ID);
  denganLock_(function () {
    ['penyulang', 'ar'].forEach(function (j) {
      var tab = GGN_TAB_[j], sh = ss.getSheetByName(tab.sheet);
      if (!sh) throw new SisiError_('SHEET_TIDAK_ADA', tab.sheet);
      var h = sh.getRange(1, 1, 1, tab.header.length).getValues()[0].map(teksGgn_);
      if (!tab.header.some(function (x, k) { return h[k] !== x; })) { console.log(tab.sheet + ' sudah berheader baru, dilewati.'); return; }
      if (ss.getSheetByName(tab.acuan)) throw new SisiError_('CONFIG_TIDAK_VALID', tab.acuan + ' sudah ada');
      var salin = sh.copyTo(ss).setName(tab.acuan);
      if (salin.getLastRow() !== sh.getLastRow()) throw new SisiError_('CONFIG_TIDAK_VALID', 'salinan ' + tab.acuan + ' tidak sama');
      sh.clear();
      sh.getRange(1, 1, 1, tab.header.length).setValues([tab.header]).setFontWeight('bold');
      sh.setFrozenRows(1);
      console.log(tab.sheet + ' disalin ke ' + tab.acuan + ' (' + (salin.getLastRow() - 1) + ' baris), header baru dipasang.');
    });
  }, 30000);
  var info = sinkronGgn_('ADMIN');
  console.log('Sinkron sumber baru selesai: ' + JSON.stringify(info.jumlah) + '. Periksa: ADMIN_bandingGangguan.');
}

/* ===== pembanding data lama (SiMonLang) vs sumber baru ===== */

var GGN_BANDING_ = {
  penyulang: { waktu: 'waktu_padam', medan: ['peralatan', 'waktu_nyala', 'durasi_menit', 'indikasi', 'arus_r', 'arus_s', 'arus_t', 'arus_n', 'ens_kwh', 'cuaca'],
    toleransi: { durasi_menit: 1, ens_kwh: 1 } },
  ar: { waktu: 'waktu_ar', medan: ['peralatan', 'indikasi', 'arus_r', 'arus_s', 'arus_t', 'arus_n', 'cuaca'], toleransi: {} }
};

/** Sel tab ggn_ (teks atau Date hasil konversi Sheets) -> 'yyyy-MM-dd HH:mm' WIB. */
function waktuSelGgn_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return new Date(v.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
  return teksGgn_(v).slice(0, 16);
}

function samaGgn_(a, b, toleransi) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= (toleransi || 0);
  return waktuSelGgn_(a).toUpperCase() === waktuSelGgn_(b).toUpperCase();
}

/**
 * Bandingkan baris lama dan baru satu jenis, kunci = penyulang + waktu (menit). Hanya rentang tanggal yang ada di
 * KEDUA sumber (baru mulai dari tanggal paling awal sumber baru; sampai tanggal terakhir yang lebih pendek).
 * Hasil { rentang, jumlah: { lama, baru, sama, hanyaLama, hanyaBaru, beda }, baris: [[kunci, status, kolom, lama, baru]] }.
 */
function bandingGgn_(jenis, lama, baru) {
  var cfg = GGN_BANDING_[jenis];
  var indeks = function (rows) {
    var peta = {}, urut = {}, semua = [];
    rows.forEach(function (o) {
      var w = waktuSelGgn_(o[cfg.waktu]), p = String(o.penyulang || '').trim().toUpperCase();
      if (!w || !p) return;
      var k = p + ' | ' + w;
      urut[k] = (urut[k] || 0) + 1;
      peta[k + ' #' + urut[k]] = o;
      semua.push(w);
    });
    semua.sort();
    return { peta: peta, awal: semua[0] || '', akhir: semua[semua.length - 1] || '' };
  };
  var L = indeks(lama), B = indeks(baru);
  var dari = B.awal.slice(0, 10), sampai = (L.akhir < B.akhir ? L.akhir : B.akhir).slice(0, 10);
  var dalam = function (k) { var d = k.split(' | ')[1].slice(0, 10); return d >= dari && d <= sampai; };
  var hasil = { rentang: { dari: dari, sampai: sampai }, jumlah: { lama: 0, baru: 0, sama: 0, hanyaLama: 0, hanyaBaru: 0, beda: 0 }, baris: [] };
  Object.keys(L.peta).filter(dalam).sort().forEach(function (k) {
    hasil.jumlah.lama++;
    var b = B.peta[k];
    if (!b) { hasil.jumlah.hanyaLama++; hasil.baris.push([k, 'HANYA_LAMA', '', '', '']); return; }
    var selisih = cfg.medan.filter(function (m) { return !samaGgn_(L.peta[k][m], b[m], cfg.toleransi[m]); });
    if (!selisih.length) { hasil.jumlah.sama++; return; }
    hasil.jumlah.beda++;
    selisih.forEach(function (m) { hasil.baris.push([k, 'BEDA', m, waktuSelGgn_(L.peta[k][m]), waktuSelGgn_(b[m])]); });
  });
  Object.keys(B.peta).filter(dalam).sort().forEach(function (k) {
    hasil.jumlah.baru++;
    if (!L.peta[k]) { hasil.jumlah.hanyaBaru++; hasil.baris.push([k, 'HANYA_BARU', '', '', '']); }
  });
  return hasil;
}

var GGN_BANDING_SHEET_ = 'ggn_Banding';
var GGN_BANDING_MAKS_ = 5000;

/** Editor (hanya baca data): bandingkan ggn_*_SiMonLang dengan ggn_ baru, ringkasan di log, rincian di tab ggn_Banding. */
function ADMIN_bandingGangguan() {
  pastikanPemilik_();
  var ss = bukaSpreadsheet_(cfg_().GANGGUAN_SHEET_ID), sh = ss.getSheetByName(GGN_BANDING_SHEET_) || ss.insertSheet(GGN_BANDING_SHEET_);
  var keluar = [];
  ['penyulang', 'ar'].forEach(function (j) {
    var tab = GGN_TAB_[j];
    var h = bandingGgn_(j, tabel_('GANGGUAN_SHEET_ID', tab.acuan).rows, tabel_('GANGGUAN_SHEET_ID', tab.sheet).rows);
    console.log(j + ' ' + h.rentang.dari + ' s.d. ' + h.rentang.sampai + ': ' + JSON.stringify(h.jumlah));
    h.baris.forEach(function (b) { keluar.push([j].concat(b)); });
  });
  var tampil = keluar.slice(0, GGN_BANDING_MAKS_);
  sh.clear();
  sh.getRange(1, 1, 1, 6).setValues([['jenis', 'kunci', 'status', 'kolom', 'lama', 'baru']]).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (tampil.length) sh.getRange(2, 1, tampil.length, 6).setValues(tampil.map(function (b) { return b.map(function (v) { return amanSheet_(v); }); }));
  console.log('Rincian ' + tampil.length + ' dari ' + keluar.length + ' selisih ditulis ke ' + GGN_BANDING_SHEET_ + '.');
}

/** Editor: pemicu harian jam 18 WIB (satu-satunya; dipanggil ulang = diganti). */
function ADMIN_jadwalkanSinkronGangguan() {
  pastikanPemilik_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === GGN_PEMICU_FN_) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger(GGN_PEMICU_FN_).timeBased().atHour(GGN_JAM_PEMICU_).nearMinute(5).everyDays(1).inTimezone('Asia/Jakarta').create();
  console.log('Pemicu sinkron History Gangguan terpasang: setiap hari ±' + GGN_JAM_PEMICU_ + ':05 WIB.');
}

function ADMIN_pemicuSinkronGangguan(e) {
  pastikanPemilik_();
  return jalanPemicu_(GGN_PEMICU_FN_, e, function () {
    var info = sinkronGgn_(e && e.triggerUid ? 'PEMICU' : 'ADMIN');
    console.log('Sinkron History Gangguan: ' + JSON.stringify(info.jumlah) + ' ditulis: ' + (info.ditulis.join(', ') || '-'));
    return info;
  });
}

/* ===== endpoint ===== */

/** History Gangguan khusus admin (menu OPS_REKAP_GANGGUAN), peran dicek sebelum isi data. */
function wajibAdminGgn_(sesi) {
  if (!sesi || sesi.role === 'PETUGAS' || ROLE_VALID_().indexOf(sesi.role) === -1) throw new SisiError_('AKSES_DITOLAK', 'history gangguan khusus admin');
}

function infoPublikGgn_(info) {
  return info ? { waktu: info.waktu, sumber: info.sumber, jumlah: info.jumlah } : null;
}

function cekDataGgn_(data, boleh) {
  Object.keys(data || {}).forEach(function (k) { if (boleh.indexOf(k) === -1) throw new SisiError_('FIELD_TIDAK_DIKENAL', k); });
}

/** Isi sel tab ggn_ -> nilai jawaban (angka tetap angka, JSON bertahap diurai). */
function keluarGgn_(o, header) {
  var r = {};
  header.forEach(function (h) {
    var v = o[h];
    if (v instanceof Date) v = tglJakarta_(v);
    if ((h === 'nyala_bertahap' || h === 'masih_padam') && v) { try { v = JSON.parse(v); } catch (e) { v = null; } }
    if (v !== '' && v !== undefined && v !== null) r[h] = v;   // kosong tidak dikirim (jawaban lebih kecil)
  });
  return r;
}

/**
 * getHistoriGangguan { dari?, sampai? } (yyyy-MM-dd, maks GGN_RENTANG_MAKS_ hari; bawaan 1 Januari tahun ini s.d. hari ini)
 *   -> { dari, sampai, tahunTop, sinkron, top: { penyulang|ar|pickup: [{ nama, jumlah }] x12 }, penyulang: [..], ar, pickup }.
 * top = 12 penyulang terbanyak TAHUN BERJALAN (tidak ikut rentang / filter). Baris rentang dikirim, saring + ringkasan di klien.
 */
var GGN_RENTANG_MAKS_ = 731;
function getHistoriGangguan_(sesi, data) {
  wajibAdminGgn_(sesi);
  cekDataGgn_(data, ['dari', 'sampai']);
  var hariIni = tglJakarta_(new Date()), tahunIni = hariIni.slice(0, 4);
  var tgl = function (k, bawaan) {
    var v = data[k] === undefined || data[k] === null || data[k] === '' ? bawaan : String(data[k]);
    var d = new Date(v + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new SisiError_('FORMAT_SALAH', k);
    return v;
  };
  var dari = tgl('dari', tahunIni + '-01-01'), sampai = tgl('sampai', hariIni);
  if (dari > sampai) throw new SisiError_('DI_LUAR_RENTANG', 'dari');
  if ((Date.parse(sampai) - Date.parse(dari)) / 864e5 > GGN_RENTANG_MAKS_) throw new SisiError_('DI_LUAR_RENTANG', 'sampai');
  var hasil = { dari: dari, sampai: sampai, tahunTop: Number(tahunIni), sinkron: infoPublikGgn_(bacaInfoSinkronGgn_()), top: {} };
  var kunciWaktu = { penyulang: 'waktu_padam', ar: 'waktu_ar', pickup: 'waktu_event' };
  GGN_JENIS_.forEach(function (j) {
    var tab = GGN_TAB_[j], t = tabel_('GANGGUAN_SHEET_ID', tab.sheet), hitung = {};
    hasil[j] = [];
    t.rows.forEach(function (o) {
      var w = o[kunciWaktu[j]] instanceof Date ? tglJakarta_(o[kunciWaktu[j]]) : String(o[kunciWaktu[j]] || ''), d = w.slice(0, 10);
      if (w.slice(0, 4) === tahunIni && o.penyulang) hitung[o.penyulang] = (hitung[o.penyulang] || 0) + 1;
      if (d >= dari && d <= sampai) hasil[j].push(keluarGgn_(o, tab.header));
    });
    hasil.top[j] = Object.keys(hitung).map(function (n) { return { nama: n, jumlah: hitung[n] }; })
      .sort(function (a, b) { return b.jumlah - a.jumlah || (a.nama < b.nama ? -1 : 1); }).slice(0, 12);
  });
  return hasil;
}

/** sinkronHistoriGangguan {} -> info sinkron. Tombol "Perbarui dari sumber" (akses UBAH). */
function sinkronHistoriGangguan_(sesi, data) {
  wajibAdminGgn_(sesi);
  cekDataGgn_(data, []);
  return infoPublikGgn_(sinkronGgn_('WEB:' + String(sesi.username || sesi.userId || '')));
}
