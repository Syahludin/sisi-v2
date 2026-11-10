/**
 * Verifikasi Tiang di lapangan (permintaan Master Guswan 8 Nov 2026; rancangan docs/superpowers/specs/ (master tiang switching)).
 * Menu OPS_VERIFIKASI_TIANG (ADMIN / SUPER). Admin berjalan berurutan sepanjang jalur (urutan = induk hasil migrasi ITB) dan
 * memverifikasi tiap tiang: GPS, jenis / ukuran / konstruksi, sirkuit (1-3: penyulang, section, segmen, induk, switching, kabel),
 * 2 foto. Verifikasi Admin langsung berlaku (tanpa antrean); pengaman = log_Audit + foto. Kasus khusus: tiang baru dari lapangan
 * (ID BARU-0001), tiang tidak ditemukan (status TIDAK_DITEMUKAN), koordinat aset jauh (GPS lapangan dipakai, selisih dilaporkan).
 * Kolom aset (hasil migrasi ITB) tidak pernah diubah di sini.
 */

var TIANG_STATUS_ = ['TERVERIFIKASI', 'PERLU_PERBAIKAN', 'TIDAK_DITEMUKAN'];
var TIANG_FOTO_ = { TIANG: 'foto_tiang_id', KEPALA: 'foto_kepala_id' };
var TIANG_POLA_ID_ = /^[0-9A-Za-z._-]{1,40}$/;
var TIANG_KODE_LAIN_ = 'LAINNYA';
var TIANG_SIRKUIT_MAKS_ = 3;
var TIANG_STATUS_INDUK_ = ['BENAR', 'DIGANTI', 'TITIK_AWAL'];
/** Selisih maksimum (meter) koordinat lapangan dari koordinat terdaftar tanpa harus memilih koordinat mana yang dipakai. */
var TIANG_TOLERANSI_M_ = 10;
var TIANG_BOLEH_ID_SIRKUIT_ = ['section_id', 'segmen_id', 'induk_tiang_id', 'switching_id', 'penghantar_id'];

/** Isian satu sirkuit: [nama API, kolom sheet, aturan validasi_]. */
var TIANG_ISIAN_SIRKUIT_ = [
  ['penyulang', 'penyulang', { tipe: 'teks', wajib: true, maks: 80 }],
  ['posisi', 'posisi', { tipe: 'pilihan', pilihan: ['KIRI', 'KANAN', 'ATAS', 'BAWAH', 'TENGAH'] }],
  ['sectionId', 'section_id', { tipe: 'teks', maks: 64, pola: /^[0-9A-Za-z_-]+$/ }],
  ['segmenId', 'segmen_id', { tipe: 'teks', maks: 20, pola: /^SGM-\d{4,}$/ }],
  ['indukTiangId', 'induk_tiang_id', { tipe: 'teks', maks: 40, pola: TIANG_POLA_ID_ }],
  ['peranTitik', 'peran_titik', { tipe: 'pilihan', pilihan: ['biasa', 'switching', 'gardu', 'percabangan', 'ujung'] }],
  ['switchingId', 'switching_id', { tipe: 'teks', maks: 20, pola: /^SWC-\d{4,}$/ }],
  ['switchingDiTiang', 'switching_di_tiang', { tipe: 'teks', maks: 20, pola: /^SWC-\d{4,}$/ }],
  ['jenisKabel', 'jenis_kabel', { tipe: 'teks', maks: 30 }],
  ['ukuranMm2', 'ukuran_mm2', { tipe: 'angka', min: 0, max: 1000 }],
  ['indukStatus', 'induk_status', { tipe: 'pilihan', pilihan: TIANG_STATUS_INDUK_ }],
  ['indukKeterangan', 'induk_keterangan', { tipe: 'teks', maks: 120 }],
  ['switchingKeterangan', 'switching_keterangan', { tipe: 'teks', maks: 120 }]
];

/**
 * Kekurangan data satu tiang (bentuk API) agar boleh berstatus Terverifikasi; [] = lengkap. Foto hanya dicek bila t.foto ada
 * (saat simpan, foto baru dikirim sesudahnya). Induk: dikonfirmasi (Benar / Diganti) atau Tiang Awal SKTM dengan keterangan.
 */
function kurangLengkapTiang_(t) {
  var k = [];
  if (!t.jenisTiang) k.push('Jenis Tiang');
  if (!t.ukuranTiang) k.push('Ukuran Tiang');
  if (!t.konstruksiId) k.push('Konstruksi');
  if (t.foto) {
    if (!t.foto.TIANG) k.push('Foto Tiang Utuh');
    if (!t.foto.KEPALA) k.push('Foto Kepala Tiang');
  }
  var s = t.sirkuit || [];
  if (!s.length) k.push('Sirkuit');
  s.forEach(function (c, i) {
    var p = s.length > 1 ? 'Sirkuit ' + (i + 1) + ': ' : '';
    [['penyulang', 'Penyulang'], ['sectionId', 'Section'], ['segmenId', 'Segmen'], ['posisi', 'Posisi'], ['peranTitik', 'Peran Titik'], ['jenisKabel', 'Jenis Kabel']]
      .forEach(function (x) { if (!c[x[0]]) k.push(p + x[1]); });
    if (!c.ukuranMm2) k.push(p + 'Ukuran mm²');
    if (c.indukStatus === 'TITIK_AWAL') {
      if (c.indukTiangId) k.push(p + 'Tiang Awal Tidak Boleh Punya Induk');
      if (!c.indukKeterangan) k.push(p + 'Keterangan Tiang Awal SKTM');
    } else if (TIANG_STATUS_INDUK_.indexOf(c.indukStatus) < 0 || !c.indukTiangId) {
      k.push(p + 'Konfirmasi Induk Tiang');
    }
    if (!c.switchingId && !c.switchingKeterangan) k.push(p + 'Switching Hulu atau Keterangan Tanpa Switching');
  });
  return k;
}

function kodeJalurTiang_(r) { return teksSwc_(r.kode_nama_aset) || TIANG_KODE_LAIN_; }

function sirkuitKeApi_(r) {
  var o = { sirkuitId: teksSwc_(r.sirkuit_id) };
  TIANG_ISIAN_SIRKUIT_.forEach(function (x) { o[x[0]] = x[2].tipe === 'angka' ? angkaSwc_(r[x[1]]) : teksSwc_(r[x[1]]); });
  o.gawangM = angkaSwc_(r.gawang_m);
  o.segmenAset = teksSwc_(r.segmen_aset);
  o.tandaCekGawang = teksSwc_(r.tanda_cek_gawang);
  o.statusVerifikasi = teksSwc_(r.status_verifikasi) || 'BELUM';
  return o;
}

function tiangKeApi_(r, sirkuit) {
  var o = {
    tiangId: teksSwc_(r.tiang_id), nama: teksSwc_(r.nama), kode: kodeJalurTiang_(r),
    latAset: angkaSwc_(r.lat_aset), lngAset: angkaSwc_(r.lng_aset), lat: angkaSwc_(r.lat), lng: angkaSwc_(r.lng),
    sumberKoordinat: teksSwc_(r.sumber_koordinat), jenisTiangAset: teksSwc_(r.jenis_tiang_aset), ukuranTiangAset: teksSwc_(r.ukuran_tiang_aset),
    jenisTiang: teksSwc_(r.jenis_tiang), ukuranTiang: teksSwc_(r.ukuran_tiang), konstruksiId: teksSwc_(r.konstruksi_lapangan),
    jumlahSirkuit: angkaSwc_(r.jumlah_sirkuit) || 1, tandaCek: teksSwc_(r.tanda_cek), statusVerifikasi: teksSwc_(r.status_verifikasi) || 'BELUM',
    verifikasiTerakhir: teksSwc_(r.verifikasi_terakhir), keteranganSumber: teksSwc_(r.keterangan_sumber),
    foto: { TIANG: !!teksSwc_(r.foto_tiang_id), KEPALA: !!teksSwc_(r.foto_kepala_id) }, revision: Number(r.revision) || 0,
    sirkuit: (sirkuit || []).map(sirkuitKeApi_)
  };
  if (o.statusVerifikasi === 'TERVERIFIKASI') o.kurang = kurangLengkapTiang_(o);   // hijau di HP hanya bila kosong
  return o;
}

/** Konstruksi aktif dari db_Konstruksi (urut kolom urutan). Tab belum ada = kosong. */
function daftarKonstruksi_() {
  var rows;
  try { rows = tabel_('MASTER_SHEET_ID', 'db_Konstruksi').rows; } catch (e) { if (e && e.kode === 'SHEET_TIDAK_ADA') return []; throw e; }
  return rows.filter(function (r) { return teksSwc_(r.konstruksi_id) && teksSwc_(r.kode) && isAktif_(r.aktif); })
    .sort(function (a, b) { return (Number(a.urutan) || 0) - (Number(b.urutan) || 0); })
    .map(function (r) { return { konstruksiId: teksSwc_(r.konstruksi_id), kode: teksSwc_(r.kode), nama: teksSwc_(r.nama) || teksSwc_(r.kode) }; });
}

/** Ukuran tiang aktif dari db_Ukuran_Tiang (urut kolom urutan, lalu nama). Tab belum ada = kosong (HP memakai daftar bawaan). */
function daftarUkuranTiang_() {
  var rows;
  try { rows = tabel_('MASTER_SHEET_ID', 'db_Ukuran_Tiang').rows; } catch (e) { if (e && e.kode === 'SHEET_TIDAK_ADA') return []; throw e; }
  return rows.filter(function (r) { return teksSwc_(r.nama) && isAktif_(r.aktif); })
    .sort(function (a, b) { return (Number(a.urutan) || 0) - (Number(b.urutan) || 0); })
    .map(function (r) { return teksSwc_(r.nama); });
}

/**
 * getVerifikasiTiang {} -> { jalur: [{kode, jumlah, terverifikasi (lengkap), perluDilengkapi, perluPerbaikan, tidakDitemukan, bertanda}], konstruksi, ukuran (nama), jaringan,
 * segmen (aktif), switching (aktif) }. Satu panggilan berisi semua pilihan isian form.
 */
function getVerifikasiTiang_(sesi, data) {
  wajibAdminTiang_(sesi);
  validasi_(data || {}, {});
  var jalur = {}, sirkuit = {};
  tabelTiangSisi_('db_Tiang_Sirkuit').rows.forEach(function (r) {
    if (isAktif_(r.aktif)) (sirkuit[teksSwc_(r.tiang_id)] = sirkuit[teksSwc_(r.tiang_id)] || []).push(r);
  });
  tabelTiangSisi_('db_Tiang').rows.forEach(function (r) {
    if (!teksSwc_(r.tiang_id) || !isAktif_(r.aktif)) return;
    var k = kodeJalurTiang_(r), j = jalur[k] = jalur[k] || { kode: k, jumlah: 0, terverifikasi: 0, perluDilengkapi: 0, perluPerbaikan: 0, tidakDitemukan: 0, bertanda: 0 };
    var st = teksSwc_(r.status_verifikasi);
    j.jumlah++;
    // Terverifikasi dihitung hanya bila datanya lengkap (termasuk foto lapangan); kurang = Perlu Dilengkapi, bukan progres
    if (st === 'TERVERIFIKASI') { if (tiangKeApi_(r, sirkuit[teksSwc_(r.tiang_id)]).kurang.length) j.perluDilengkapi++; else j.terverifikasi++; }
    else if (st === 'PERLU_PERBAIKAN') j.perluPerbaikan++;
    else if (st === 'TIDAK_DITEMUKAN') j.tidakDitemukan++;
    if (teksSwc_(r.tanda_cek)) j.bertanda++;
  });
  var s = getSegmen_(sesi, {});
  return {
    jalur: Object.keys(jalur).sort().map(function (k) { return jalur[k]; }),
    konstruksi: daftarKonstruksi_(),
    ukuran: daftarUkuranTiang_(),
    jaringan: s.jaringan,
    segmen: s.segmen.filter(function (x) { return x.aktif; }).map(function (x) { return { segmenId: x.segmenId, nama: x.nama, penyulang: x.penyulang, sectionId: x.sectionId }; }),
    switching: s.switching
  };
}

/** getTiangJalur { kode } -> { kode, tiang: [...] } (tiang aktif satu kode jalur, beserta sirkuit aktifnya). */
function getTiangJalur_(sesi, data) {
  wajibAdminTiang_(sesi);
  var d = validasi_(data, { kode: { tipe: 'teks', wajib: true, maks: 10, pola: /^([A-Z]{3}|LAINNYA)$/ } });
  var sirkuit = {};
  tabelTiangSisi_('db_Tiang_Sirkuit').rows.forEach(function (r) {
    if (isAktif_(r.aktif)) (sirkuit[teksSwc_(r.tiang_id)] = sirkuit[teksSwc_(r.tiang_id)] || []).push(r);
  });
  var tiang = tabelTiangSisi_('db_Tiang').rows.filter(function (r) { return teksSwc_(r.tiang_id) && isAktif_(r.aktif) && kodeJalurTiang_(r) === d.kode; });
  return { kode: d.kode, tiang: tiang.map(function (r) { return tiangKeApi_(r, sirkuit[teksSwc_(r.tiang_id)]); }) };
}

/** Validasi daftar sirkuit kiriman (1-3 item, sirkuitId unik). */
function bacaSirkuitKiriman_(daftar) {
  if (!Array.isArray(daftar)) throw new SisiError_('TIPE_SALAH', 'sirkuit');
  if (!daftar.length) throw new SisiError_('FIELD_WAJIB', 'sirkuit');
  if (daftar.length > TIANG_SIRKUIT_MAKS_) throw new SisiError_('TERLALU_BANYAK', 'sirkuit');
  var skema = { sirkuitId: { tipe: 'uuid' } }, lihat = {};
  TIANG_ISIAN_SIRKUIT_.forEach(function (x) { skema[x[0]] = x[2]; });
  return daftar.map(function (x) {
    var s = validasi_(x, skema);
    if (s.sirkuitId && lihat[s.sirkuitId]) throw new SisiError_('ID_GANDA', s.sirkuitId);
    if (s.sirkuitId) lihat[s.sirkuitId] = true;
    return s;
  });
}

/** Sirkuit kiriman -> kolom sheet, dicek terhadap master (penyulang, section, segmen, switching, induk). */
function isianSirkuit_(s, ctx) {
  var u = {};
  TIANG_ISIAN_SIRKUIT_.forEach(function (x) { u[x[1]] = s[x[0]] === undefined ? '' : s[x[0]]; });
  var pny = ctx.jar.penyulang[String(u.penyulang).toUpperCase()];
  if (!pny) throw new SisiError_('PENYULANG_TIDAK_DIKENAL', u.penyulang);
  u.penyulang = pny;
  if (u.section_id && (!ctx.jar.section[u.section_id] || ctx.jar.section[u.section_id].penyulang !== pny)) throw new SisiError_('SECTION_BEDA_PENYULANG', u.section_id);
  if (u.segmen_id) {
    var g = ctx.segmen[u.segmen_id];
    if (!g) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'segmen ' + u.segmen_id);
    if (g.penyulang !== pny) throw new SisiError_('DATA_TIDAK_VALID', 'segmen beda penyulang');
    if (g.kabelTanah) throw new SisiError_('DATA_TIDAK_VALID', 'segmen kabel tanah tidak berisi tiang');
    if (!u.section_id) u.section_id = g.sectionId;
  }
  ['switching_id', 'switching_di_tiang'].forEach(function (k) { if (u[k] && !ctx.switching[u[k]]) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'switching ' + u[k]); });
  if (u.induk_tiang_id) {
    if (u.induk_tiang_id === ctx.tiangId) throw new SisiError_('HULU_TIDAK_VALID', 'induk tiang diri sendiri');
    var p = ctx.tiang[u.induk_tiang_id];
    if (!p) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'induk tiang ' + u.induk_tiang_id);
    if (ctx.verif && teksSwc_(p.status_verifikasi) !== 'TERVERIFIKASI') throw new SisiError_('DATA_TIDAK_VALID', 'induk tiang belum terverifikasi');
    var a = { lat_aset: angkaSwc_(p.lat), lng_aset: angkaSwc_(p.lng) }, b = { lat_aset: ctx.lat, lng_aset: ctx.lng };
    var jarak = a.lat_aset === null || b.lat_aset === null ? null : jarakTiang_(a, b);
    u.gawang_m = jarak === null ? '' : Math.round(jarak * 10) / 10;
  } else {
    u.gawang_m = '';
  }
  return u;
}

/**
 * simpanVerifikasiTiang { tiangId?, revision?, statusVerifikasi, koordinat?, akurasiM?, jenisTiang?, ukuranTiang?, konstruksiId?,
 * nama?, kode?, sirkuit: [...] } -> { tiang, selisihM }. Tanpa tiangId = tiang baru dari lapangan (nama + kode + koordinat wajib).
 * TIDAK_DITEMUKAN: hanya status yang dicatat (koordinat / sirkuit tidak wajib, data lama tetap).
 */
function simpanVerifikasiTiang_(sesi, data, platform) {
  wajibAdminTiang_(sesi);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SisiError_('DATA_TIDAK_VALID');
  var kiriman = data.sirkuit, sisa = {};
  Object.keys(data).forEach(function (k) { if (k !== 'sirkuit') sisa[k] = data[k]; });
  var d = validasi_(sisa, {
    tiangId: { tipe: 'teks', maks: 40, pola: TIANG_POLA_ID_ }, revision: { tipe: 'angka', bulat: true, min: 1 },
    statusVerifikasi: { tipe: 'pilihan', wajib: true, pilihan: TIANG_STATUS_ }, koordinat: { tipe: 'koordinat' },
    akurasiM: { tipe: 'angka', min: 0, max: 500 }, jenisTiang: { tipe: 'pilihan', pilihan: ['BETON', 'BESI', 'KAYU'] },
    ukuranTiang: { tipe: 'teks', maks: 40 }, konstruksiId: { tipe: 'uuid' },
    dasarKoordinat: { tipe: 'pilihan', pilihan: ['TERDAFTAR', 'LAPANGAN'] },
    nama: { tipe: 'teks', maks: 80 }, kode: { tipe: 'teks', maks: 3, pola: /^[A-Z]{3}$/ }
  });
  var hilang = d.statusVerifikasi === 'TIDAK_DITEMUKAN';
  if (d.tiangId && d.revision === undefined) throw new SisiError_('FIELD_WAJIB', 'revision');
  if (!d.tiangId && (hilang || !d.nama)) throw new SisiError_('FIELD_WAJIB', hilang ? 'tiangId' : 'nama');
  if (!hilang && !d.koordinat) throw new SisiError_('FIELD_WAJIB', 'koordinat');
  var sirkuitKirim = hilang && kiriman === undefined ? [] : bacaSirkuitKiriman_(kiriman);
  wajibKonfigTiang_();
  if (d.konstruksiId && !daftarKonstruksi_().some(function (k) { return k.konstruksiId === d.konstruksiId; })) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'konstruksi');
  var jar = jaringanSwitching_(), switching = {}, segmen = {};
  tabelSwitching_().rows.forEach(function (r) { if (isAktif_(r.aktif)) switching[teksSwc_(r.switching_id)] = true; });
  tabelTiangSisi_(SGM_SHEET_).rows.forEach(function (r) {
    if (teksSwc_(r.segmen_id) && isAktif_(r.aktif)) segmen[teksSwc_(r.segmen_id)] = { penyulang: teksSwc_(r.penyulang), sectionId: teksSwc_(r.section_id), kabelTanah: teksSwc_(r.jenis_segmen) === 'KABEL_TANAH' };
  });
  return denganLock_(function () {
    var tt = tabelTiangSisi_('db_Tiang'), ts = tabelTiangSisi_('db_Tiang_Sirkuit'), petaTiang = {};
    tt.rows.forEach(function (r) { var id = teksSwc_(r.tiang_id); if (id) { if (petaTiang[id]) throw new SisiError_('DATA_GANDA', 'db_Tiang ' + id); petaTiang[id] = r; } });
    var lama = d.tiangId ? petaTiang[d.tiangId] : null;
    if (d.tiangId && !lama) throw new SisiError_('DATA_TIDAK_DITEMUKAN', d.tiangId);
    if (lama && Number(lama.revision || 0) !== d.revision) throw new SisiError_('KONFLIK_REVISION', d.tiangId);
    var id = d.tiangId || idBerikutTiang_(tt.rows, 'tiang_id', 'BARU');
    var sekarang = sekarangIso_();
    var u = { status_verifikasi: d.statusVerifikasi, verifikasi_terakhir: sekarang, diverifikasi_oleh: sesi.userId, diubah_pada: sekarang, diubah_oleh: sesi.userId };
    var selisih = null, pakaiAset = false;
    if (!hilang) {
      // selisih dari koordinat terdaftar > toleransi: admin wajib memilih koordinat mana yang jadi dasar (TERDAFTAR = koordinat aset dipakai)
      var jarakAset = lama && angkaSwc_(lama.lat_aset) !== null && angkaSwc_(lama.lng_aset) !== null
        ? jarakTiang_({ lat_aset: angkaSwc_(lama.lat_aset), lng_aset: angkaSwc_(lama.lng_aset) }, { lat_aset: d.koordinat.lat, lng_aset: d.koordinat.lng }) : null;
      if (jarakAset !== null && jarakAset > TIANG_TOLERANSI_M_) {
        if (!d.dasarKoordinat) throw new SisiError_('FIELD_WAJIB', 'dasarKoordinat');
        pakaiAset = d.dasarKoordinat === 'TERDAFTAR';
      }
      selisih = jarakAset === null ? null : Math.round(jarakAset);
      u.lat = pakaiAset ? angkaSwc_(lama.lat_aset) : d.koordinat.lat;
      u.lng = pakaiAset ? angkaSwc_(lama.lng_aset) : d.koordinat.lng;
      u.sumber_koordinat = pakaiAset ? 'aset' : 'lapangan';
      u.akurasi_m = pakaiAset || d.akurasiM === undefined ? '' : d.akurasiM;
      u.jenis_tiang = d.jenisTiang || '';
      u.ukuran_tiang = d.ukuranTiang || '';
      u.konstruksi_lapangan = d.konstruksiId || '';
      u.jumlah_sirkuit = sirkuitKirim.length;
    }
    if (d.statusVerifikasi === 'TERVERIFIKASI') u.tanda_cek = '';
    // sirkuit: yang dikirim diperbarui / ditambah, sirkuit aktif lain milik tiang ini dinonaktifkan
    var milik = ts.rows.filter(function (r) { return teksSwc_(r.tiang_id) === id; }), petaSirkuit = {};
    milik.forEach(function (r) { petaSirkuit[teksSwc_(r.sirkuit_id)] = r; });
    var ctx = { jar: jar, segmen: segmen, switching: switching, tiang: petaTiang, tiangId: id, lat: hilang ? null : u.lat, lng: hilang ? null : u.lng,
      verif: d.statusVerifikasi === 'TERVERIFIKASI' };
    var ubahS = [], baruS = [], dipakai = {}, usSemua = sirkuitKirim.map(function (s) { return isianSirkuit_(s, ctx); });
    sirkuitKirim.forEach(function (s, n) {
      var us = usSemua[n];
      us.status_verifikasi = d.statusVerifikasi;
      us.tanda_cek_gawang = d.statusVerifikasi === 'TERVERIFIKASI' ? '' : undefined;
      if (us.tanda_cek_gawang === undefined) delete us.tanda_cek_gawang;
      us.aktif = true;
      us.diubah_pada = sekarang;
      us.diubah_oleh = sesi.userId;
      if (s.sirkuitId) {
        var r = petaSirkuit[s.sirkuitId];
        if (!r) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'sirkuit ' + s.sirkuitId);
        dipakai[s.sirkuitId] = true;
        ubahS.push({ r: r, u: us });
      } else {
        baruS.push(Object.assign({ No: noBaris_(ts, baruS.length), sirkuit_id: uuid_(), tiang_id: id, segmen_aset: '', revision: 1 }, us));
      }
    });
    // Terverifikasi = data wajib lengkap + induk dikonfirmasi (nilai sesudah section diisi dari segmen); foto dicek HP, server hanya bila sudah ada
    if (ctx.verif) {
      var kurang = kurangLengkapTiang_({ jenisTiang: d.jenisTiang, ukuranTiang: d.ukuranTiang, konstruksiId: d.konstruksiId, sirkuit: usSemua.map(function (us) {
        var o = {};
        TIANG_ISIAN_SIRKUIT_.forEach(function (x) { o[x[0]] = us[x[1]]; });
        return o;
      }) });
      if (kurang.length) throw new SisiError_('FIELD_WAJIB', kurang.join(', '));
    }
    if (!hilang) {
      milik.forEach(function (r) {
        if (!dipakai[teksSwc_(r.sirkuit_id)] && isAktif_(r.aktif)) ubahS.push({ r: r, u: { aktif: false, diubah_pada: sekarang, diubah_oleh: sesi.userId } });
      });
    } else if (!sirkuitKirim.length) {
      milik.forEach(function (r) { if (isAktif_(r.aktif)) ubahS.push({ r: r, u: { status_verifikasi: 'TIDAK_DITEMUKAN', diubah_pada: sekarang, diubah_oleh: sesi.userId } }); });
    }
    var log = headerTabel_('AUTH_SHEET_ID', 'log_Audit'), baris;
    if (lama) {
      var beda = bedaSwitching_(lama, u);
      tulisBlok_(tt, [{ r: lama, u: u }], []);
      baris = lama;
      auditLog_(sesi, 'TIANG_VERIFIKASI', 'db_Tiang', id + ' ' + d.statusVerifikasi + (selisih !== null ? ' selisih ' + selisih + ' m' : '') + (pakaiAset ? ' dasar koordinat terdaftar' : '') + (beda ? ': ' + beda : ''), platform, log);
    } else {
      baris = Object.assign({ No: noBaris_(tt, 0), tiang_id: id, nama: d.nama, kode_nama_aset: d.kode || '', lat_aset: '', lng_aset: '', status_aset: 'BARU',
        keterangan_sumber: 'Tiang baru dari lapangan', tanda_cek: '', aktif: true, revision: 1 }, u);
      tulisBlok_(tt, [], [baris]);
      auditLog_(sesi, 'TIANG_BARU', 'db_Tiang', id + ' ' + d.nama + ' (' + (d.kode || TIANG_KODE_LAIN_) + ')', platform, log);
    }
    tulisBlok_(ts, ubahS, baruS, { bolehId: TIANG_BOLEH_ID_SIRKUIT_ });
    var sirkuitAkhir = milik.concat(baruS).filter(function (r) { return isAktif_(r.aktif); });
    return { tiang: tiangKeApi_(baris, sirkuitAkhir), selisihM: selisih };
  });
}

/** uploadFotoTiang { tiangId, slot TIANG | KEPALA, sha256, ukuranByte, data } -> { tiangId, slot, revision }. Pola sama dengan foto switching. */
function uploadFotoTiang_(sesi, data, platform) {
  wajibAdminTiang_(sesi);
  var skema = isiFotoLapangan_();
  skema.tiangId = { tipe: 'teks', wajib: true, maks: 40, pola: TIANG_POLA_ID_ };
  skema.slot = { tipe: 'pilihan', wajib: true, pilihan: Object.keys(TIANG_FOTO_) };
  var d = validasi_(data, skema);
  wajibKonfigTiang_();
  var folderId = cfg_().TIANG_FOTO_FOLDER_ID;
  if (!folderId) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'TIANG_FOTO_FOLDER_ID');
  var bytes = bytesFotoLapangan_(d);
  return denganLock_(function () {
    var t = tabelTiangSisi_('db_Tiang');
    var r = t.rows.filter(function (x) { return teksSwc_(x.tiang_id) === d.tiangId; });
    if (r.length > 1) throw new SisiError_('ID_GANDA', d.tiangId);
    if (!r.length) throw new SisiError_('DATA_TIDAK_DITEMUKAN', d.tiangId);
    var kol = TIANG_FOTO_[d.slot];
    var f = simpanFotoLapangan_(folderId, ['Tiang', kodeJalurTiang_(r[0])], d.tiangId + '|' + d.slot + '|' + d.sha256, d.tiangId + '_' + d.slot + '.jpg', bytes);
    if (teksSwc_(r[0][kol]) !== f.fileId) {
      var u = { diubah_pada: sekarangIso_(), diubah_oleh: sesi.userId };
      u[kol] = f.fileId;
      tulisBlok_(t, [{ r: r[0], u: u }], [], { bolehId: [kol] });
      auditLog_(sesi, 'TIANG_FOTO', 'db_Tiang', d.tiangId + ' foto ' + d.slot, platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    }
    return { tiangId: d.tiangId, slot: d.slot, revision: Number(r[0].revision) || 0 };
  });
}

/** getFotoTiang { tiangId, slot, ukuran? KECIL | PENUH } -> foto base64 (KECIL = thumbnail). */
function getFotoTiang_(sesi, data) {
  wajibAdminTiang_(sesi);
  var d = validasi_(data, { tiangId: { tipe: 'teks', wajib: true, maks: 40, pola: TIANG_POLA_ID_ },
    slot: { tipe: 'pilihan', wajib: true, pilihan: Object.keys(TIANG_FOTO_) }, ukuran: { tipe: 'pilihan', pilihan: ['KECIL', 'PENUH'] } });
  var r = tabelTiangSisi_('db_Tiang').rows.filter(function (x) { return teksSwc_(x.tiang_id) === d.tiangId; })[0];
  if (!r) throw new SisiError_('DATA_TIDAK_DITEMUKAN', d.tiangId);
  return jawabFotoDriveWo_(teksSwc_(r[TIANG_FOTO_[d.slot]]), d.slot, d.ukuran, { tiangId: d.tiangId });
}
