/**
 * Migrasi Master Tiang dari ITB (permintaan Master Guswan 8 Nov 2026; rancangan docs/superpowers/specs/ (master tiang switching, 8 Nov 2026)).
 * Sumber = sheet db_TiangMaster di file ITB (MASTER_ITB_SHEET_ID, HANYA DIBACA), hanya tiang TM. Tujuan = db_Tiang (1 baris per tiang) +
 * satu baris awal db_Tiang_Sirkuit per tiang (usulan induk / gawang / peran titik dari nama tiang) di SiSi_Tiang (TIANG_SHEET_ID).
 *
 * Aturan:
 *  - Header sumber dibaca lewat NAMA (bukan posisi kolom): alias bawaan + sheet db_Tiang_Pemetaan (diedit Admin tanpa deploy), baris
 *    header dicari otomatis di 10 baris pertama, kolom tambahan diabaikan. Kolom wajib (ASSETNUM, DESCRIPTION, koordinat) hilang =
 *    TIDAK ADA yang ditulis (KOLOM_WAJIB_HILANG).
 *  - Sinkron ulang hanya memperbarui KOLOM ASET. Kolom verifikasi (lapangan) tidak pernah ditimpa. Koordinat berlaku (lat / lng) hanya
 *    mengikuti koordinat aset selama sumber_koordinat masih "aset". Baris yang hilang dari sumber diberi keterangan, tidak dihapus.
 *  - Aman diulang (upsert per tiang_id); gagal / waktu habis di tengah = jalankan lagi, yang sudah masuk dikenali.
 * Alat pemilik: ADMIN_cekMigrasiTiangItb (hanya melaporkan), ADMIN_migrasiTiangItb (menulis).
 */

var TIANG_ITB_SHEET_ = 'db_TiangMaster';
var TIANG_ITB_PROP_ = 'TIANG_ITB_SINKRON';
var TIANG_HILANG_AWAL_ = 'Tidak ada di sumber ';
var TIANG_ITB_PENGUBAH_ = 'migrasi-itb';
var TIANG_BARIS_HEADER_MAKS_ = 10;
var TIANG_GAWANG_PANJANG_M_ = 150;
var TIANG_GAWANG_JAUH_M_ = 5000;
var TIANG_GAWANG_PENDEK_M_ = 3;
var TIANG_DOUBLE_M_ = 3;
var TIANG_ZIGZAG_RASIO_ = 2;
var TIANG_ZIGZAG_MIN_M_ = 40;
var TIANG_BLOK_TULIS_ = 2000;

/**
 * Kolom logis SiSi -> alias nama kolom sumber (dirapikan: huruf besar, tanpa spasi / simbol). `awalan` = kolom berpola
 * (KODE_KONSTRUKSI_1, _2, ... berapa pun jumlahnya). Alias tambahan diisi Admin di db_Tiang_Pemetaan.
 */
var TIANG_KOLOM_LOGIS_ = {
  tiang_id: { alias: ['ASSETNUM', 'ASSET_NUM', 'NOMOR_ASET', 'ASSET_NUMBER'], wajib: true },
  nama: { alias: ['DESCRIPTION', 'NAMA_TIANG', 'NAMA'], wajib: true },
  lat_aset: { alias: ['LATITUDEY', 'LATITUDE', 'LAT', 'LATITUDE_Y'], wajib: true },
  lng_aset: { alias: ['LONGITUDEX', 'LONGITUDE', 'LNG', 'LON', 'LONG', 'LONGITUDE_X'], wajib: true },
  ssot_number: { alias: ['SSOTNUMBER', 'SSOT_NUMBER', 'SSOT'] },
  segmen_aset: { alias: ['PARENT', 'SEGMEN'] },
  subclass: { alias: ['SUBCLASS', 'SUB_CLASS', 'JENIS_ASET'] },
  status_aset: { alias: ['STATUS'] },
  jenis_tiang_aset: { alias: ['JENIS_TIANG'] },
  ukuran_tiang_aset: { alias: ['UKURAN_TIANG'] },
  kelas_area: { alias: ['ASSETCLASSHI', 'KELAS_AREA'] },
  konstruksi_aset: { alias: [], awalan: ['KODE_KONSTRUKSI'] }
};

/** Kolom db_Tiang yang dikelola migrasi (kolom aset + turunan). Selain ini tidak pernah disentuh sinkron. */
var TIANG_KOLOM_KELOLA_ = ['ssot_number', 'nama', 'kode_nama_aset', 'lat_aset', 'lng_aset', 'konstruksi_aset', 'jenis_tiang_aset', 'ukuran_tiang_aset',
  'kelas_area', 'status_aset', 'bulan_sumber', 'keterangan_sumber', 'lat', 'lng', 'sumber_koordinat', 'tanda_cek', 'aktif'];
var TIANG_KOLOM_KELOLA_SIRKUIT_ = ['induk_tiang_id', 'gawang_m', 'peran_titik', 'tanda_cek_gawang'];

/* ===== pembacaan sumber (murni, diuji) ===== */

/** Nama kolom dirapikan untuk pencocokan: huruf besar, hanya A-Z 0-9. */
function normKolomTiang_(h) { return String(h === null || h === undefined ? '' : h).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

function teksTiang_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return isFinite(v) ? String(v) : '';
  if (typeof v === 'object') return '';   // Date / objek lain bukan isian teks sumber
  return String(v).replace(/\s+/g, ' ').trim();
}

/** Koordinat longgar: angka, atau teks dengan koma desimal. Tidak valid = null. */
function angkaKoordTiang_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (s === '') return null;
  var n = Number(s.replace(',', '.'));
  return isFinite(n) ? n : null;
}

/**
 * Aturan pemetaan = bawaan + baris db_Tiang_Pemetaan aktif { kolom_logis, alias ('A|B'), wajib }. Hasil { aturan, abaikan }:
 * aturan[logis] = { alias: {NORMAL: true}, awalan: [NORMAL...], wajib }; abaikan = kolom_logis di sheet yang tidak dikenal.
 */
function aturanPemetaanTiang_(barisPemetaan) {
  var aturan = {}, abaikan = [];
  Object.keys(TIANG_KOLOM_LOGIS_).forEach(function (l) {
    var d = TIANG_KOLOM_LOGIS_[l], a = { alias: {}, awalan: (d.awalan || []).map(normKolomTiang_), wajib: !!d.wajib };
    d.alias.forEach(function (x) { a.alias[normKolomTiang_(x)] = true; });
    aturan[l] = a;
  });
  (barisPemetaan || []).forEach(function (r) {
    if (String(r.aktif === undefined || r.aktif === null ? '' : r.aktif).trim() !== '' && !isAktif_(r.aktif)) return;
    var l = teksTiang_(r.kolom_logis).toLowerCase();
    if (!l) return;
    if (!Object.prototype.hasOwnProperty.call(aturan, l)) { abaikan.push(l); return; }
    String(r.alias === undefined || r.alias === null ? '' : r.alias).split(/[|,;]/).forEach(function (x) {
      var n = normKolomTiang_(x);
      if (n) aturan[l].alias[n] = true;
    });
    var w = teksTiang_(r.wajib).toLowerCase();
    if (w === 'ya' || w === 'true') aturan[l].wajib = true;
    else if (w === 'tidak' || w === 'false') aturan[l].wajib = false;
  });
  return { aturan: aturan, abaikan: abaikan };
}

/**
 * Cari baris header (di 10 baris pertama, yang paling banyak cocok) dan petakan kolom. Hasil:
 * { baris, idx: {logis: kolom}, konstruksi: [kolom...], wajibHilang: [logis], tidakDikenal: [nama header], terpetakan: [logis] }.
 * baris -1 = tidak ada nama kolom yang dikenal.
 */
function petakanHeaderTiang_(nilai, aturan) {
  var terbaik = null, batas = Math.min((nilai || []).length, TIANG_BARIS_HEADER_MAKS_);
  for (var r = 0; r < batas; r++) {
    var idx = {}, kons = [], dikenal = {};
    (nilai[r] || []).forEach(function (h, k) {
      var n = normKolomTiang_(h);
      if (!n) return;
      Object.keys(aturan).forEach(function (l) {
        var a = aturan[l];
        if (a.alias[n] && !Object.prototype.hasOwnProperty.call(idx, l)) { idx[l] = k; dikenal[k] = true; }
        else if (a.awalan.some(function (w) { return n.indexOf(w) === 0; })) { kons.push(k); dikenal[k] = true; }
      });
    });
    var jumlah = Object.keys(idx).length + (kons.length ? 1 : 0);
    if (jumlah > 0 && (!terbaik || jumlah > terbaik.jumlah)) terbaik = { baris: r, idx: idx, kons: kons, dikenal: dikenal, jumlah: jumlah };
  }
  var hasil = { baris: -1, idx: {}, konstruksi: [], wajibHilang: [], tidakDikenal: [], terpetakan: [] };
  if (!terbaik) {
    Object.keys(aturan).forEach(function (l) { if (aturan[l].wajib) hasil.wajibHilang.push(l); });
    return hasil;
  }
  hasil.baris = terbaik.baris;
  hasil.idx = terbaik.idx;
  hasil.konstruksi = terbaik.kons;
  Object.keys(aturan).forEach(function (l) {
    var ada = Object.prototype.hasOwnProperty.call(terbaik.idx, l) || (l === 'konstruksi_aset' && terbaik.kons.length > 0);
    if (ada) hasil.terpetakan.push(l);
    else if (aturan[l].wajib) hasil.wajibHilang.push(l);
  });
  (nilai[terbaik.baris] || []).forEach(function (h, k) { if (teksTiang_(h) && !terbaik.dikenal[k]) hasil.tidakDikenal.push(teksTiang_(h)); });
  return hasil;
}

/** "TIANG TM PLS0908.C0215.B0071A" -> { bersih: 'PLS0908.C0215.B0071A', kode: 'PLS', segmen: [{h,n}...], sisip: 'A' }. Tidak baku: segmen null. */
function uraiNamaTiang_(deskripsi) {
  var bersih = teksTiang_(deskripsi).replace(/^TIANG (TM|TR) /i, '');
  var m = /^([A-Z]{3})(\d{4})((?:\.[A-Z]\d{4})*)([A-Z]?)$/.exec(bersih.toUpperCase());
  if (!m) return { bersih: bersih, kode: '', segmen: null, sisip: '' };
  var segmen = [{ h: m[1], n: Number(m[2]) }];
  if (m[3]) m[3].slice(1).split('.').forEach(function (s) { segmen.push({ h: s.charAt(0), n: Number(s.slice(1)) }); });
  return { bersih: bersih, kode: m[1], segmen: segmen, sisip: m[4] };
}

function namaSegmenTiang_(segmen, sisip) {
  return segmen.map(function (s) { return s.h + ('0000' + s.n).slice(-4); }).join('.') + (sisip || '');
}

/**
 * Isi sheet sumber -> { petaHeader, tiang: [...], ringkas: {baris, tm, bukanTm, tanpaKunci, idGanda} }. Hanya baris TM
 * (kolom SUBCLASS memuat "TM"; tanpa kolom itu, deskripsi berawalan "TIANG TM"). ID ganda: baris pertama menang. Kolom wajib
 * hilang = tiang kosong (pemanggil menolak).
 */
function susunTiangItb_(nilai, pemetaan) {
  var peta = aturanPemetaanTiang_(pemetaan);
  var p = petakanHeaderTiang_(nilai, peta.aturan);
  var hasil = { petaHeader: p, abaikan: peta.abaikan, tiang: [], ringkas: { baris: 0, tm: 0, bukanTm: 0, tanpaKunci: 0, idGanda: 0 } };
  if (p.baris < 0 || p.wajibHilang.length) return hasil;
  var lihat = {}, namaHitung = {};
  for (var i = p.baris + 1; i < nilai.length; i++) {
    var b = nilai[i] || [];
    if (!b.some(function (v) { return teksTiang_(v) !== ''; })) continue;
    hasil.ringkas.baris++;
    var g = function (l) { return Object.prototype.hasOwnProperty.call(p.idx, l) ? teksTiang_(b[p.idx[l]]) : ''; };
    var id = g('tiang_id'), nama = g('nama');
    if (!id || !nama) { hasil.ringkas.tanpaKunci++; continue; }
    var sub = g('subclass');
    var tm = sub ? /(^|[^A-Z])TM($|[^A-Z])/i.test(sub) : /^TIANG TM( |$)/i.test(nama);
    if (!tm) { hasil.ringkas.bukanTm++; continue; }
    if (lihat[id]) { hasil.ringkas.idGanda++; continue; }
    lihat[id] = true;
    hasil.ringkas.tm++;
    var u = uraiNamaTiang_(nama);
    var kons = [];
    p.konstruksi.forEach(function (k) { var v = teksTiang_(b[k]); if (v && kons.indexOf(v) === -1) kons.push(v); });
    var lat = angkaKoordTiang_(b[p.idx.lat_aset]), lng = angkaKoordTiang_(b[p.idx.lng_aset]);
    hasil.tiang.push({
      tiang_id: id, ssot_number: g('ssot_number'), nama: u.bersih, kode_nama_aset: u.kode, segmen_aset: g('segmen_aset'),
      lat_aset: lat === null || lng === null ? '' : lat, lng_aset: lat === null || lng === null ? '' : lng,
      konstruksi_aset: kons.join('|'), jenis_tiang_aset: g('jenis_tiang_aset'), ukuran_tiang_aset: g('ukuran_tiang_aset'),
      kelas_area: g('kelas_area'), status_aset: g('status_aset').toUpperCase() || 'OPERATING'
    });
    namaHitung[u.bersih.toUpperCase()] = (namaHitung[u.bersih.toUpperCase()] || 0) + 1;
  }
  hasil.tiang.forEach(function (t) { t.nama_ganda = namaHitung[t.nama.toUpperCase()] > 1; });
  return hasil;
}

/* ===== topologi + tanda cek (murni, diuji) ===== */

/** Jarak meter (haversine) antara dua tiang berkoordinat; koordinat kosong = null. */
function jarakTiang_(a, b) {
  if (a.lat_aset === '' || b.lat_aset === '') return null;
  var rad = Math.PI / 180, dLat = (b.lat_aset - a.lat_aset) * rad, dLng = (b.lng_aset - a.lng_aset) * rad;
  var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat_aset * rad) * Math.cos(b.lat_aset * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(x)));
}

var TIANG_AREA_ = { latMin: -3.6, latMax: -1.3, lngMin: 105.0, lngMax: 109.0 };

/**
 * Tanda cek dari koordinat: { tiang_id: 'a|b' }. koordinat_kosong (tidak ada / 0,0 / di luar area Babel), kemungkinan_double_feeder
 * (ada tiang lain < 3 m, termasuk koordinat sama), nama_ganda, nama_tidak_baku, status_invalid.
 */
function tandaCekTiang_(tiang) {
  var hasil = {}, sel = {}, kunci = function (t) { return Math.round(t.lat_aset * 20000) + ',' + Math.round(t.lng_aset * 20000); };
  var sah = function (t) {
    return t.lat_aset !== '' && !(t.lat_aset === 0 && t.lng_aset === 0) && t.lat_aset >= TIANG_AREA_.latMin && t.lat_aset <= TIANG_AREA_.latMax
      && t.lng_aset >= TIANG_AREA_.lngMin && t.lng_aset <= TIANG_AREA_.lngMax;
  };
  tiang.forEach(function (t) { if (sah(t) && t.status_aset !== 'INVALID') (sel[kunci(t)] = sel[kunci(t)] || []).push(t); });
  tiang.forEach(function (t) {
    var tanda = [];
    if (!sah(t)) tanda.push('koordinat_kosong');
    else if (t.status_aset !== 'INVALID') {
      var la = Math.round(t.lat_aset * 20000), ln = Math.round(t.lng_aset * 20000), dekat = false;
      for (var a = -1; a <= 1 && !dekat; a++) {
        for (var b = -1; b <= 1 && !dekat; b++) {
          (sel[(la + a) + ',' + (ln + b)] || []).forEach(function (o) { if (o !== t && jarakTiang_(t, o) < TIANG_DOUBLE_M_) dekat = true; });
        }
      }
      if (dekat) tanda.push('kemungkinan_double_feeder');
    }
    if (t.nama_ganda) tanda.push('nama_ganda');
    if (!uraiNamaTiang_(t.nama).segmen) tanda.push('nama_tidak_baku');
    if (t.status_aset === 'INVALID') tanda.push('status_invalid');
    hasil[t.tiang_id] = tanda.join('|');
  });
  return hasil;
}

/**
 * Usulan induk tiang dari nama (tiang berstatus INVALID dilewati): tiap jalur (awalan + huruf cabang) diurutkan menurut nomor lalu
 * sisipan (647 < 647A < 648); induk = tiang sebelumnya di jalur yang sama, tiang pertama jalur = tiang asal cabang (nama = awalan).
 * Hasil { tiang_id: {induk_tiang_id, gawang_m, peran_titik, tanda_cek_gawang} }. Tanda: tanpa_induk, jauh (> 5 km), gawang_panjang
 * (> 150 m), gawang_pendek (< 3 m), gawang_tak_terhitung, zigzag (A-B-C jauh lebih panjang daripada A-C).
 */
function hitungTopologiTiang_(tiang) {
  var aktif = tiang.filter(function (t) { return t.status_aset !== 'INVALID'; });
  var urai = {}, grup = {}, oleh = {};
  aktif.forEach(function (t) {
    var u = urai[t.tiang_id] = uraiNamaTiang_(t.nama);
    if (!u.segmen) return;
    var awalan = u.segmen.length > 1 ? namaSegmenTiang_(u.segmen.slice(0, -1), '') : '';
    var akhir = u.segmen[u.segmen.length - 1], kg = awalan + '|' + akhir.h;
    (grup[kg] = grup[kg] || { awalan: awalan, isi: [] }).isi.push({ t: t, n: akhir.n, sisip: u.sisip });
    var kn = namaSegmenTiang_(u.segmen, u.sisip);
    if (!Object.prototype.hasOwnProperty.call(oleh, kn)) oleh[kn] = t;
  });
  var induk = {}, anak = {};
  Object.keys(grup).forEach(function (kg) {
    var g = grup[kg];
    g.isi.sort(function (a, b) { return a.n - b.n || (a.sisip < b.sisip ? -1 : a.sisip > b.sisip ? 1 : 0); });
    g.isi.forEach(function (e, i) {
      var p = i > 0 ? g.isi[i - 1].t : (g.awalan && Object.prototype.hasOwnProperty.call(oleh, g.awalan) ? oleh[g.awalan] : null);
      induk[e.t.tiang_id] = p;
      if (p) (anak[p.tiang_id] = anak[p.tiang_id] || []).push(e.t);
    });
  });
  var hasil = {};
  aktif.forEach(function (t) {
    var p = induk[t.tiang_id] || null, tanda = [], d = p ? jarakTiang_(p, t) : null;
    if (!p) tanda.push('tanpa_induk');
    else if (d === null) tanda.push('gawang_tak_terhitung');
    else if (d > TIANG_GAWANG_JAUH_M_) tanda.push('jauh');
    else if (d > TIANG_GAWANG_PANJANG_M_) tanda.push('gawang_panjang');
    else if (d < TIANG_GAWANG_PENDEK_M_) tanda.push('gawang_pendek');
    var kids = anak[t.tiang_id] || [];
    if (p && d !== null && kids.length === 1) {
      var bc = jarakTiang_(t, kids[0]), ac = jarakTiang_(p, kids[0]);
      if (bc !== null && ac !== null && d > TIANG_ZIGZAG_MIN_M_ && bc > TIANG_ZIGZAG_MIN_M_ && (d + bc) / Math.max(ac, 1) > TIANG_ZIGZAG_RASIO_) tanda.push('zigzag');
    }
    hasil[t.tiang_id] = {
      induk_tiang_id: p ? p.tiang_id : '', gawang_m: d === null ? '' : Math.round(d * 10) / 10,
      peran_titik: !urai[t.tiang_id].segmen ? '' : kids.length > 1 ? 'percabangan' : kids.length === 0 ? 'ujung' : 'biasa',
      tanda_cek_gawang: tanda.join('|')
    };
  });
  return hasil;
}

/* ===== gabung ke master SiSi (murni, diuji) ===== */

function tandaTangan_(o, kolom) {
  return kolom.map(function (k) {
    var v = o[k];
    if (k === 'aktif') return isAktif_(v) ? '1' : '0';   // boolean dari sheet vs 'TRUE' teks dianggap sama
    return v === undefined || v === null ? '' : String(v);
  }).join('');
}

function barisTiangBaru_(s, tanda, ctx, no) {
  var invalid = s.status_aset === 'INVALID';
  return {
    No: no, tiang_id: s.tiang_id, assetnum_lain: '', digabung_ke: '', ssot_number: s.ssot_number, nama: s.nama, kode_nama_aset: s.kode_nama_aset,
    lat_aset: s.lat_aset, lng_aset: s.lng_aset, konstruksi_aset: s.konstruksi_aset, jenis_tiang_aset: s.jenis_tiang_aset,
    ukuran_tiang_aset: s.ukuran_tiang_aset, kelas_area: s.kelas_area, status_aset: s.status_aset, bulan_sumber: ctx.bulan, keterangan_sumber: '',
    jumlah_sirkuit: 1, jenis_tiang: '', ukuran_tiang: '', konstruksi_lapangan: '', lat: s.lat_aset, lng: s.lng_aset, sumber_koordinat: 'aset',
    akurasi_m: '', gardu_id: '', foto_tiang_id: '', foto_kepala_id: '', tanda_cek: tanda, status_verifikasi: 'BELUM', verifikasi_terakhir: '',
    diverifikasi_oleh: '', aktif: !invalid, revision: 1, diubah_pada: ctx.sekarang, diubah_oleh: TIANG_ITB_PENGUBAH_
  };
}

function barisSirkuitBaru_(s, topo, ctx, no) {
  return {
    No: no, sirkuit_id: ctx.uuid(), tiang_id: s.tiang_id, penyulang: '', posisi: '', induk_tiang_id: topo.induk_tiang_id, gawang_m: topo.gawang_m,
    peran_titik: topo.peran_titik, section_id: '', segmen_id: '', segmen_aset: s.segmen_aset, switching_id: '', switching_di_tiang: '',
    jenis_kabel: '', ukuran_mm2: '', penghantar_id: '', tanda_cek_gawang: topo.tanda_cek_gawang, status_verifikasi: 'BELUM',
    aktif: true, revision: 1, diubah_pada: ctx.sekarang, diubah_oleh: TIANG_ITB_PENGUBAH_
  };
}

/**
 * Gabung sumber ke master. [lamaTiang] / [lamaSirkuit] = baris sheet sekarang (objek, diubah di tempat). Hasil:
 * { tiang, sirkuit (daftar lengkap: lama + baru), tiangBerubah[i], sirkuitBerubah[i], jumlahTiangLama, jumlahSirkuitLama, ringkas }.
 * Kolom verifikasi tidak disentuh; baris lama hanya berubah bila kolom yang dikelola berubah (revision + 1).
 */
function gabungMigrasiTiang_(sumber, lamaTiang, lamaSirkuit, ctx) {
  var topo = hitungTopologiTiang_(sumber), tanda = tandaCekTiang_(sumber);
  var r = { tiangBaru: 0, tiangUbah: 0, tiangSama: 0, tiangHilang: 0, tiangPulih: 0, sirkuitBaru: 0, sirkuitUbah: 0,
    tandaCek: {}, gawang: {}, invalid: 0 };
  var masuk = {};
  sumber.forEach(function (s) { masuk[s.tiang_id] = s; });
  var ada = {};
  lamaTiang.forEach(function (o) {
    var id = String(o.tiang_id);
    if (Object.prototype.hasOwnProperty.call(ada, id)) throw new SisiError_('DATA_GANDA', 'db_Tiang ' + id);
    ada[id] = o;
  });
  var tiangBerubah = lamaTiang.map(function () { return false; });
  lamaTiang.forEach(function (o, i) {
    var s = masuk[String(o.tiang_id)], sebelum = tandaTangan_(o, TIANG_KOLOM_KELOLA_);
    if (!s) {
      // tiang baru dari lapangan (BARU-nnnn) memang tidak ada di sumber: tidak ditandai hilang
      if (!/^BARU-/.test(String(o.tiang_id)) && String(o.keterangan_sumber || '').indexOf(TIANG_HILANG_AWAL_) !== 0) {
        o.keterangan_sumber = TIANG_HILANG_AWAL_ + ctx.bulan;
        r.tiangHilang++;
      }
    } else {
      if (String(o.keterangan_sumber || '').indexOf(TIANG_HILANG_AWAL_) === 0) r.tiangPulih++;
      var t = tanda[s.tiang_id], belum = String(o.status_verifikasi || 'BELUM') === 'BELUM';
      ['ssot_number', 'nama', 'kode_nama_aset', 'lat_aset', 'lng_aset', 'konstruksi_aset', 'jenis_tiang_aset', 'ukuran_tiang_aset', 'kelas_area', 'status_aset']
        .forEach(function (k) { o[k] = s[k]; });
      o.bulan_sumber = ctx.bulan;
      o.keterangan_sumber = '';
      var sumberKoord = String(o.sumber_koordinat || 'aset');
      if (sumberKoord === 'aset') { o.lat = s.lat_aset; o.lng = s.lng_aset; o.sumber_koordinat = 'aset'; }
      o.tanda_cek = String(o.status_verifikasi) === 'TERVERIFIKASI' ? '' : t;
      if (belum) o.aktif = s.status_aset !== 'INVALID';
    }
    if (tandaTangan_(o, TIANG_KOLOM_KELOLA_) !== sebelum) {
      o.revision = (Number(o.revision) || 0) + 1;
      o.diubah_pada = ctx.sekarang;
      o.diubah_oleh = TIANG_ITB_PENGUBAH_;
      tiangBerubah[i] = true;
      if (s) r.tiangUbah++;
    } else if (s) r.tiangSama++;
  });
  var tiang = lamaTiang.slice();
  sumber.forEach(function (s) {
    if (Object.prototype.hasOwnProperty.call(ada, s.tiang_id)) return;
    tiang.push(barisTiangBaru_(s, tanda[s.tiang_id], ctx, tiang.length + 1));
    r.tiangBaru++;
  });
  sumber.forEach(function (s) {
    if (s.status_aset === 'INVALID') { r.invalid++; return; }
    tanda[s.tiang_id].split('|').filter(Boolean).forEach(function (k) { r.tandaCek[k] = (r.tandaCek[k] || 0) + 1; });
  });
  // sirkuit: satu baris awal per tiang (kecuali INVALID); baris lama "awal" = No terkecil milik tiang itu
  var awal = {}, sirkuitBerubah = lamaSirkuit.map(function () { return false; });
  lamaSirkuit.forEach(function (o, i) {
    var id = String(o.tiang_id);
    if (!awal[id] || Number(o.No) < Number(lamaSirkuit[awal[id].i].No)) awal[id] = { i: i, o: o };
  });
  var sirkuit = lamaSirkuit.slice();
  sumber.forEach(function (s) {
    if (s.status_aset === 'INVALID') return;
    var tp = topo[s.tiang_id], a = awal[s.tiang_id];
    tp.tanda_cek_gawang.split('|').filter(Boolean).forEach(function (k) { r.gawang[k] = (r.gawang[k] || 0) + 1; });
    if (!a) { sirkuit.push(barisSirkuitBaru_(s, tp, ctx, sirkuit.length + 1)); r.sirkuitBaru++; return; }
    var o = a.o, sebelum = tandaTangan_(o, TIANG_KOLOM_KELOLA_SIRKUIT_.concat(['segmen_aset']));
    o.segmen_aset = s.segmen_aset;
    if (String(o.status_verifikasi || 'BELUM') === 'BELUM') TIANG_KOLOM_KELOLA_SIRKUIT_.forEach(function (k) { o[k] = tp[k]; });
    if (tandaTangan_(o, TIANG_KOLOM_KELOLA_SIRKUIT_.concat(['segmen_aset'])) !== sebelum) {
      o.revision = (Number(o.revision) || 0) + 1;
      o.diubah_pada = ctx.sekarang;
      o.diubah_oleh = TIANG_ITB_PENGUBAH_;
      sirkuitBerubah[a.i] = true;
      r.sirkuitUbah++;
    }
  });
  return { tiang: tiang, sirkuit: sirkuit, tiangBerubah: tiangBerubah, sirkuitBerubah: sirkuitBerubah,
    jumlahTiangLama: lamaTiang.length, jumlahSirkuitLama: lamaSirkuit.length, ringkas: r };
}

/* ===== penulisan + alat pemilik ===== */

/** Baris pemetaan (db_Tiang_Pemetaan); tab belum ada = kosong (alias bawaan saja). */
function barisPemetaanTiang_() {
  try { return tabel_('MASTER_SHEET_ID', 'db_Tiang_Pemetaan').rows; } catch (e) { if (e && e.kode === 'SHEET_TIDAK_ADA') return []; throw e; }
}

/**
 * Tulis hasil gabung: baris lama yang berubah ditulis per blok, baris baru ditambah di bawah (format teks dulu supaya ID tidak jadi
 * angka). Baris sheet wajib rapat dari baris 2 (tanpa baris kosong di tengah); kalau tidak, gagal tanpa menulis (DATA_TIDAK_VALID).
 */
function tulisBarisTiang_(t, semua, jumlahLama, berubah, kolomTeks) {
  var lebar = t.header.length, sh = t.sheet, lama = t.rows;
  for (var i = 0; i < lama.length; i++) {
    if (lama[i]._baris !== i + 2) throw new SisiError_('DATA_TIDAK_VALID', t.nama + ' punya baris kosong di tengah (baris ' + (i + 2) + ')');
  }
  var butuh = semua.length + 1;
  if (sh.getMaxRows() < butuh && typeof sh.insertRowsAfter === 'function') sh.insertRowsAfter(sh.getMaxRows(), butuh - sh.getMaxRows());
  var ke = function (o) { return barisDariObjek_(t.header, o); };
  for (var a = 0; a < jumlahLama; a += TIANG_BLOK_TULIS_) {
    var b = Math.min(a + TIANG_BLOK_TULIS_, jumlahLama), ubah = false;
    for (var k = a; k < b; k++) if (berubah[k]) { ubah = true; break; }
    if (ubah) sh.getRange(a + 2, 1, b - a, lebar).setValues(semua.slice(a, b).map(ke));
  }
  for (var c = jumlahLama; c < semua.length; c += TIANG_BLOK_TULIS_) {
    var d = Math.min(c + TIANG_BLOK_TULIS_, semua.length);
    (kolomTeks || []).forEach(function (nama) {
      var j = t.header.indexOf(nama);
      if (j !== -1) sh.getRange(c + 2, j + 1, d - c, 1).setNumberFormat('@');
    });
    sh.getRange(c + 2, 1, d - c, lebar).setValues(semua.slice(c, d).map(ke));
  }
}

function migrasiTiangItb_(uji) {
  var c = cfg_();
  if (!c.TIANG_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'TIANG_SHEET_ID');
  if (!c.MASTER_ITB_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'MASTER_ITB_SHEET_ID');
  var ss = bukaSpreadsheet_(c.MASTER_ITB_SHEET_ID), sh = ss.getSheetByName(TIANG_ITB_SHEET_);
  if (!sh) throw new SisiError_('SHEET_TIDAK_ADA', TIANG_ITB_SHEET_ + ' di file ITB');
  var judul = typeof ss.getName === 'function' ? String(ss.getName()) : '';
  var bulan = bulanDariJudulItb_(judul, tglJakarta_(new Date()));
  var s = susunTiangItb_(sh.getDataRange().getValues(), barisPemetaanTiang_());
  if (s.petaHeader.baris < 0) throw new SisiError_('KOLOM_WAJIB_HILANG', 'tidak ada nama kolom yang dikenal di ' + TIANG_ITB_SHEET_);
  if (s.petaHeader.wajibHilang.length) throw new SisiError_('KOLOM_WAJIB_HILANG', s.petaHeader.wajibHilang.join(', '));
  if (!s.tiang.length) throw new SisiError_('DATA_KOSONG', 'tidak ada tiang TM di ' + TIANG_ITB_SHEET_);
  var jalan = function () {
    var tt = cekHeaderSkema_(tabel_('TIANG_SHEET_ID', 'db_Tiang'), 'TIANG_SHEET_ID', 'db_Tiang');
    var ts = cekHeaderSkema_(tabel_('TIANG_SHEET_ID', 'db_Tiang_Sirkuit'), 'TIANG_SHEET_ID', 'db_Tiang_Sirkuit');
    var h = gabungMigrasiTiang_(s.tiang, tt.rows, ts.rows, { bulan: bulan, sekarang: sekarangIso_(), uuid: uuid_ });
    if (!uji) {
      tulisBarisTiang_(tt, h.tiang, h.jumlahTiangLama, h.tiangBerubah, TIANG_KOLOM_TEKS_.db_Tiang);
      tulisBarisTiang_(ts, h.sirkuit, h.jumlahSirkuitLama, h.sirkuitBerubah, TIANG_KOLOM_TEKS_.db_Tiang_Sirkuit);
    }
    return h.ringkas;
  };
  var ringkas = uji ? jalan() : denganLock_(jalan, 30000);
  var info = { waktu: sekarangIso_(), bulan: bulan, judul: judul, uji: !!uji, sumber: s.ringkas,
    header: { terpetakan: s.petaHeader.terpetakan, tidakDikenal: s.petaHeader.tidakDikenal, abaikan: s.abaikan }, ringkas: ringkas };
  if (!uji) PropertiesService.getScriptProperties().setProperty(TIANG_ITB_PROP_, JSON.stringify(info));
  return info;
}

function laporMigrasiTiang_(info) {
  var s = info.sumber, r = info.ringkas, h = info.header, daftar = function (o) { return Object.keys(o).map(function (k) { return k + ' ' + o[k]; }).join(', ') || '-'; };
  console.log('=== Migrasi Master Tiang dari ITB ' + (info.uji ? '(CEK, tidak menulis)' : '(DITULIS)') + ' | file "' + info.judul + '" (bulan ' + info.bulan + ') ===');
  console.log('Sumber ' + TIANG_ITB_SHEET_ + ': ' + s.baris + ' baris, TM ' + s.tm + ', bukan TM ' + s.bukanTm + ', tanpa ID / nama ' + s.tanpaKunci + ', ID ganda ' + s.idGanda);
  console.log('Kolom terpetakan: ' + h.terpetakan.join(', '));
  if (h.tidakDikenal.length) console.log('Kolom sumber belum terpetakan (abaikan, atau tambahkan alias di db_Tiang_Pemetaan): ' + h.tidakDikenal.join(', '));
  if (h.abaikan.length) console.warn('db_Tiang_Pemetaan: kolom_logis tidak dikenal (diabaikan): ' + h.abaikan.join(', '));
  console.log('db_Tiang: baru ' + r.tiangBaru + ', diperbarui ' + r.tiangUbah + ', sama ' + r.tiangSama + ', hilang dari sumber ' + r.tiangHilang + ', muncul lagi ' + r.tiangPulih + ', INVALID ' + r.invalid);
  console.log('db_Tiang_Sirkuit: baru ' + r.sirkuitBaru + ', diperbarui ' + r.sirkuitUbah);
  console.log('Tanda cek tiang: ' + daftar(r.tandaCek));
  console.log('Tanda cek gawang: ' + daftar(r.gawang));
}

function ADMIN_migrasiTiangItb() {
  pastikanPemilik_();
  var info = migrasiTiangItb_(false);
  laporMigrasiTiang_(info);
  console.log('Selesai. Kolom verifikasi tidak disentuh; jalankan lagi kapan saja untuk memperbarui dari ITB.');
  return info.ringkas;
}

function ADMIN_cekMigrasiTiangItb() {
  pastikanPemilik_();
  var info = migrasiTiangItb_(true);
  laporMigrasiTiang_(info);
  return info.ringkas;
}
