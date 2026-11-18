/**
 * Koordinat GIS tiang (permintaan Master Guswan 17 Nov 2026): koordinat GIS lebih akurat daripada koordinat aset ITB (lat_aset / lng_aset):
 * ±6.000 tiang koordinat ITB bergeser tetap ±795 m (±212 m selatan, ±765 m timur). Koordinat GIS disimpan di kolom BARU lat_gis / lng_gis
 * di db_Tiang; lat_aset / lng_aset (ITB), lat / lng (verifikasi lapangan) tidak disentuh.
 * Sumber = ekspor GIS "Tiang TBL" (TIANG_GIS_SHEET_ID, HANYA DIBACA). Kunci sambung = NAMA tiang: kolom GIS ido_juru_5 = db_Tiang.nama
 * (tidak ada kolom ID GIS yang cocok dengan ASSETNUM). Nama yang muncul di lebih dari satu baris GIS dilewati (ambigu), begitu pula
 * koordinat di luar area Babel (mis. x / y tertukar). Tiang tanpa pasangan dibiarkan; isi lama tidak pernah dikosongkan.
 * Koordinat terdaftar (GIS dulu, lalu ITB; koordinatTerdaftarTiang_ di 97_Tiang_Itb.js) dipakai migrasi ITB untuk gawang_m, tanda cek, dan
 * koordinat berlaku (lat / lng, selama sumber_koordinat = aset), serta verifikasi tiang (selisih, dasar TERDAFTAR, latAset ke klien).
 * Tiang tanpa GIS: taksirKoordinatTiang_ meminjam selisih dari tetangga; dihitung ulang tiap ADMIN_migrasiTiangItb ke lat_taksir / lng_taksir.
 * Sesudah mengisi: jalankan ADMIN_migrasiTiangItb supaya gawang, tanda cek, dan lat / lng berlaku dihitung ulang.
 * Aman diulang. Alat pemilik: ADMIN_cekKoordinatGis (hanya melaporkan), ADMIN_isiKoordinatGis (menulis).
 */

var TIANG_GIS_SHEET_ = 'Tiang TBL';
var TIANG_GIS_PROP_ = 'TIANG_GIS_SINKRON';
var TIANG_GIS_PENGUBAH_ = 'sinkron-gis';
var TIANG_GIS_KOLOM_ = { nama: 'IDOJURU5', lng: 'X', lat: 'Y' };   // nama kolom GIS (dirapikan normKolomTiang_)
var TIANG_GIS_SAMA_M_ = 25;       // selisih ke lat_aset sampai ini = koordinat ITB sudah cocok
var TIANG_GIS_GESER_M_ = 200;     // lebih dari ini = koordinat ITB bergeser
var TIANG_TAKSIR_GAWANG_M_ = 150; // tetangga hanya dipinjami selisih bila gawang ITB-nya kurang dari ini (satu bingkai pergeseran)

/* ===== murni, diuji ===== */

/** Baris header di [barisAtas] (10 baris pertama) -> { baris, idx: {nama, lng, lat}, hilang: [kolom GIS] }. baris -1 = tidak ketemu. */
function petakanHeaderGis_(barisAtas) {
  var terbaik = { baris: -1, idx: {}, jumlah: 0 };
  (barisAtas || []).slice(0, TIANG_BARIS_HEADER_MAKS_).forEach(function (b, r) {
    var idx = {};
    (b || []).forEach(function (h, k) {
      var n = normKolomTiang_(h);
      Object.keys(TIANG_GIS_KOLOM_).forEach(function (l) { if (n === TIANG_GIS_KOLOM_[l] && !Object.prototype.hasOwnProperty.call(idx, l)) idx[l] = k; });
    });
    var jumlah = Object.keys(idx).length;
    if (jumlah > terbaik.jumlah) terbaik = { baris: r, idx: idx, jumlah: jumlah };
  });
  var hilang = Object.keys(TIANG_GIS_KOLOM_).filter(function (l) { return !Object.prototype.hasOwnProperty.call(terbaik.idx, l); })
    .map(function (l) { return TIANG_GIS_KOLOM_[l]; });
  return { baris: terbaik.baris, idx: terbaik.idx, hilang: hilang };
}

function koordinatSahGis_(lat, lng) {
  return lat !== null && lng !== null && !(lat === 0 && lng === 0) && lat >= TIANG_AREA_.latMin && lat <= TIANG_AREA_.latMax
    && lng >= TIANG_AREA_.lngMin && lng <= TIANG_AREA_.lngMax;
}

/**
 * Tiga kolom GIS sejajar (nama, x = lng, y = lat) -> { peta: {NAMA_BESAR: {lat, lng}}, ringkas: {baris, ambigu, tidakSah} }.
 * Nama ganda (>1 baris GIS dengan nama sama) tidak masuk peta; baris tanpa nama diabaikan.
 */
function susunKoordinatGis_(nama, lng, lat) {
  var ada = {}, hasil = { peta: {}, ringkas: { baris: 0, ambigu: 0, tidakSah: 0 } };
  (nama || []).forEach(function (n, i) {
    var k = teksTiang_(n).toUpperCase();
    if (!k) return;
    hasil.ringkas.baris++;
    var la = angkaKoordTiang_(lat[i]), ln = angkaKoordTiang_(lng[i]);
    if (Object.prototype.hasOwnProperty.call(ada, k)) { ada[k].n++; return; }
    ada[k] = { n: 1, lat: la, lng: ln };
  });
  Object.keys(ada).forEach(function (k) {
    var a = ada[k];
    if (a.n > 1) { hasil.ringkas.ambigu++; return; }
    if (!koordinatSahGis_(a.lat, a.lng)) { hasil.ringkas.tidakSah++; return; }
    hasil.peta[k] = { lat: a.lat, lng: a.lng };
  });
  return hasil;
}

/**
 * Isi lat_gis / lng_gis di [lamaTiang] (baris db_Tiang, diubah di tempat) dari [peta]. Hasil { berubah[i], ringkas }.
 * Baris berubah: revision + 1, diubah_pada, diubah_oleh. ringkas.sama / bergeser = banding ke lat_aset ITB (≤ 25 m / > 200 m).
 */
function terapkanKoordinatGis_(lamaTiang, peta, ctx) {
  var r = { cocok: 0, tanpaPasangan: 0, ubah: 0, tanpaAset: 0, sama: 0, bergeser: 0, lain: 0 };
  var berubah = lamaTiang.map(function () { return false; });
  lamaTiang.forEach(function (o, i) {
    var p = peta[teksTiang_(o.nama).toUpperCase()];
    if (!p) { r.tanpaPasangan++; return; }
    r.cocok++;
    var la = angkaKoordTiang_(o.lat_aset), ln = angkaKoordTiang_(o.lng_aset);
    if (la === null || ln === null) r.tanpaAset++;
    else {
      var d = jarakTiang_({ lat_aset: la, lng_aset: ln }, { lat_aset: p.lat, lng_aset: p.lng });
      if (d <= TIANG_GIS_SAMA_M_) r.sama++; else if (d > TIANG_GIS_GESER_M_) r.bergeser++; else r.lain++;
    }
    var sebelum = tandaTangan_(o, ['lat_gis', 'lng_gis']);
    o.lat_gis = p.lat;
    o.lng_gis = p.lng;
    if (tandaTangan_(o, ['lat_gis', 'lng_gis']) !== sebelum) {
      o.revision = (Number(o.revision) || 0) + 1;
      o.diubah_pada = ctx.sekarang;
      o.diubah_oleh = TIANG_GIS_PENGUBAH_;
      berubah[i] = true;
      r.ubah++;
    }
  });
  return { berubah: berubah, ringkas: r };
}

/**
 * Taksiran koordinat tiang tanpa GIS: koordinat ITB bergeser tetap per kawasan (GIS - ITB hampir sama untuk tiang bertetangga), jadi tiang
 * tanpa GIS meminjam selisih dari tetangga satu jalur (induk / anak menurut [topo] dari koordinat ITB) yang gawang ITB-nya < 150 m.
 * Merambat per putaran dari tiang ber-GIS; tetangga terdekat didahulukan. [tiang] = sumber (lat_aset / lng_aset = ITB murni),
 * [gisPeta] = { tiang_id: {lat, lng} }. Hasil { tiang_id: {lat, lng} } HANYA untuk tiang tanpa GIS yang terjangkau.
 * Validasi data asli (20% GIS disembunyikan): galat median 1 m, p90 9 m, p99 31 m.
 */
function taksirKoordinatTiang_(tiang, gisPeta, topo) {
  var oleh = {}, selisih = {}, tetangga = {}, hasil = {};
  var ada = function (t) { return t && typeof t.lat_aset === 'number' && typeof t.lng_aset === 'number'; };
  tiang.forEach(function (t) { oleh[t.tiang_id] = t; });
  tiang.forEach(function (t) {
    var g = gisPeta[t.tiang_id];
    if (g && ada(t)) selisih[t.tiang_id] = [g.lat - t.lat_aset, g.lng - t.lng_aset];
    var p = topo[t.tiang_id] && topo[t.tiang_id].induk_tiang_id;
    if (!p || !oleh[p]) return;
    var d = ada(t) && ada(oleh[p]) ? jarakTiang_(t, oleh[p]) : null;
    if (d === null || d >= TIANG_TAKSIR_GAWANG_M_) return;
    (tetangga[t.tiang_id] = tetangga[t.tiang_id] || []).push({ id: p, d: d });
    (tetangga[p] = tetangga[p] || []).push({ id: t.tiang_id, d: d });
  });
  for (var baru = true; baru;) {
    var tambah = {};
    baru = false;
    Object.keys(tetangga).forEach(function (id) {
      if (selisih[id]) return;
      var terbaik = null;
      tetangga[id].forEach(function (n) { if (selisih[n.id] && (!terbaik || n.d < terbaik.d)) terbaik = n; });
      if (terbaik) tambah[id] = selisih[terbaik.id];
    });
    Object.keys(tambah).forEach(function (id) {
      selisih[id] = tambah[id];
      hasil[id] = { lat: oleh[id].lat_aset + tambah[id][0], lng: oleh[id].lng_aset + tambah[id][1] };
      baru = true;
    });
  }
  return hasil;
}

/* ===== penulisan + alat pemilik ===== */

function isiKoordinatGis_(uji) {
  var c = cfg_();
  if (!c.TIANG_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'TIANG_SHEET_ID');
  if (!c.TIANG_GIS_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'TIANG_GIS_SHEET_ID');
  var sh = bukaSpreadsheet_(c.TIANG_GIS_SHEET_ID).getSheetByName(TIANG_GIS_SHEET_);
  if (!sh) throw new SisiError_('SHEET_TIDAK_ADA', TIANG_GIS_SHEET_ + ' di file GIS');
  var akhir = sh.getLastRow(), lebar = sh.getLastColumn();
  var h = petakanHeaderGis_(sh.getRange(1, 1, Math.min(TIANG_BARIS_HEADER_MAKS_, akhir), lebar).getValues());
  if (h.baris < 0 || h.hilang.length) throw new SisiError_('KOLOM_WAJIB_HILANG', (h.hilang.length ? h.hilang : Object.keys(TIANG_GIS_KOLOM_)).join(', '));
  var n = akhir - (h.baris + 1);
  if (n < 1) throw new SisiError_('DATA_KOSONG', 'tidak ada baris di ' + TIANG_GIS_SHEET_);
  // hanya 3 kolom yang dibaca (sheet GIS lebar, ±130 kolom)
  var kolom = function (l) { return sh.getRange(h.baris + 2, h.idx[l] + 1, n, 1).getValues().map(function (b) { return b[0]; }); };
  var s = susunKoordinatGis_(kolom('nama'), kolom('lng'), kolom('lat'));
  var jalan = function () {
    var tt = cekHeaderSkema_(tabel_('TIANG_SHEET_ID', 'db_Tiang'), 'TIANG_SHEET_ID', 'db_Tiang');
    var t = terapkanKoordinatGis_(tt.rows, s.peta, { sekarang: sekarangIso_() });
    if (!uji) tulisBarisTiang_(tt, tt.rows, tt.rows.length, t.berubah, TIANG_KOLOM_TEKS_.db_Tiang);
    return t.ringkas;
  };
  var ringkas = uji ? jalan() : denganLock_(jalan, 30000);
  var info = { waktu: sekarangIso_(), uji: !!uji, sumber: s.ringkas, pasangan: Object.keys(s.peta).length, ringkas: ringkas };
  if (!uji) PropertiesService.getScriptProperties().setProperty(TIANG_GIS_PROP_, JSON.stringify(info));
  return info;
}

function laporKoordinatGis_(info) {
  var s = info.sumber, r = info.ringkas;
  console.log('=== Koordinat GIS tiang ' + (info.uji ? '(CEK, tidak menulis)' : '(DITULIS)') + ' ===');
  console.log('GIS: ' + s.baris + ' baris bernama, nama ganda dilewati ' + s.ambigu + ', koordinat tidak sah dilewati ' + s.tidakSah + ', siap dipakai ' + info.pasangan);
  console.log('db_Tiang: cocok ' + r.cocok + ' (kolom lat_gis / lng_gis ' + (info.uji ? 'akan berubah ' : 'berubah ') + r.ubah + '), tanpa pasangan ' + r.tanpaPasangan);
  console.log('Banding ke lat_aset ITB: sama (<= ' + TIANG_GIS_SAMA_M_ + ' m) ' + r.sama + ', bergeser (> ' + TIANG_GIS_GESER_M_ + ' m) ' + r.bergeser + ', di antaranya ' + r.lain + ', ITB tanpa koordinat ' + r.tanpaAset);
}

function ADMIN_isiKoordinatGis() {
  pastikanPemilik_();
  var info = isiKoordinatGis_(false);
  laporKoordinatGis_(info);
  console.log('Selesai. lat_aset / lng_aset dan lat / lng tidak disentuh di sini. Jalankan ADMIN_migrasiTiangItb sekarang: gawang, tanda cek, dan lat / lng berlaku (sumber aset) dihitung ulang dari koordinat GIS.');
  return info.ringkas;
}

function ADMIN_cekKoordinatGis() {
  pastikanPemilik_();
  var info = isiKoordinatGis_(true);
  laporKoordinatGis_(info);
  return info.ringkas;
}
