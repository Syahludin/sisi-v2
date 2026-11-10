/**
 * Master Segmen (permintaan Master Guswan 8 Nov 2026; rancangan docs/superpowers/specs/ (master tiang switching)). Segmen = jalur
 * antar-titik batas (GI / switching / gardu / percabangan / ujung) di dalam satu section. Dibuat Admin SATU PER SATU (web / HP),
 * petugas verifikasi tiang hanya memilih. Tab db_Segmen di SiSi_Tiang. ID SGM-0001 dibuat server; baris tidak dihapus (aktif FALSE).
 * Menu OPS_VERIFIKASI_TIANG (ADMIN / SUPER), sama dengan verifikasi tiang (99_Verifikasi_Tiang.js).
 */

var TIANG_MENU_ = 'OPS_VERIFIKASI_TIANG';
var SGM_SHEET_ = 'db_Segmen';
var SGM_AWAL_ = ['GI', 'SWITCHING', 'GARDU', 'PERCABANGAN', 'UJUNG_KABEL'];
var SGM_AKHIR_ = ['SWITCHING', 'GARDU', 'PERCABANGAN', 'UJUNG_KABEL', 'UJUNG'];
/** Segmen seragam: UDARA (berisi tiang) atau KABEL_TANAH (tanpa tiang; jenis, ukuran, panjang kabel di segmen). */
var SGM_JENIS_ = ['UDARA', 'KABEL_TANAH'];
/** Jenis kabel tanah menurut data aset ITB (kategoriKabelItb_ = SKTM). */
var SGM_KABEL_ = ['N2XSEBY - 1 CORE', 'NA2XSEYBY - 3 CORE'];
var SGM_KOLOM_KABEL_ = ['jenis_kabel', 'ukuran_mm2', 'panjang_kabel_m', 'penghantar_id'];
var SGM_POLA_ID_ = /^SGM-\d{4,}$/;
var SGM_MAKS_BARIS_ = 5000;

/** [nama API, kolom sheet, aturan validasi_]. Isian kosong = kolom dikosongkan (simpan = ganti seluruh isian). */
var SGM_ISIAN_ = [
  ['nama', 'nama', { tipe: 'teks', wajib: true, maks: 100 }],
  ['penyulang', 'penyulang', { tipe: 'teks', wajib: true, maks: 80 }],
  ['sectionId', 'section_id', { tipe: 'teks', wajib: true, maks: 64, pola: /^[0-9A-Za-z_-]+$/ }],
  ['urutan', 'urutan', { tipe: 'angka', bulat: true, min: 1, max: 99999 }],
  ['indukSegmenId', 'induk_segmen_id', { tipe: 'teks', maks: 20, pola: SGM_POLA_ID_ }],
  ['awalJenis', 'awal_jenis', { tipe: 'pilihan', wajib: true, pilihan: SGM_AWAL_ }],
  ['awalNama', 'awal_nama', { tipe: 'teks', wajib: true, maks: 80 }],
  ['awalSwitchingId', 'awal_switching_id', { tipe: 'teks', maks: 20, pola: /^SWC-\d{4,}$/ }],
  ['akhirJenis', 'akhir_jenis', { tipe: 'pilihan', wajib: true, pilihan: SGM_AKHIR_ }],
  ['akhirNama', 'akhir_nama', { tipe: 'teks', wajib: true, maks: 80 }],
  ['akhirSwitchingId', 'akhir_switching_id', { tipe: 'teks', maks: 20, pola: /^SWC-\d{4,}$/ }],
  ['segmenItb', 'segmen_itb', { tipe: 'teks', maks: 200 }],
  ['catatan', 'catatan', { tipe: 'teks', maks: 300, multiBaris: true, maksBaris: 6 }],
  ['jenisSegmen', 'jenis_segmen', { tipe: 'pilihan', pilihan: SGM_JENIS_ }],
  ['jenisKabel', 'jenis_kabel', { tipe: 'pilihan', pilihan: SGM_KABEL_ }],
  ['ukuranMm2', 'ukuran_mm2', { tipe: 'angka', min: 1, max: 2000 }],
  ['panjangKabelM', 'panjang_kabel_m', { tipe: 'angka', min: 0.1, max: 100000 }],
  ['penghantarId', 'penghantar_id', { tipe: 'teks', maks: 40, pola: /^[0-9A-Za-z._-]+$/ }]
];
var SGM_BOLEH_ID_ = ['section_id', 'induk_segmen_id', 'awal_switching_id', 'awal_gardu_id', 'akhir_switching_id', 'akhir_gardu_id', 'tiang_awal_id', 'tiang_akhir_id', 'penghantar_id'];

/** Peran pertama semua endpoint tiang / segmen: ADMIN / SUPER (keputusan Master Guswan 8 Nov 2026). */
function wajibAdminTiang_(sesi) {
  if (!sesi || ['ADMIN', 'SUPER'].indexOf(sesi.role) === -1) throw new SisiError_('AKSES_DITOLAK', 'verifikasi tiang khusus admin');
}

/** Tab SiSi_Tiang dengan header dicek. */
function tabelTiangSisi_(nama) {
  wajibKonfigTiang_();
  return cekHeaderSkema_(tabel_('TIANG_SHEET_ID', nama), 'TIANG_SHEET_ID', nama);
}

/** ID berikutnya <awalan>-nnnn (4 digit, lebih panjang bila lewat 9999) dari kolom [kolom]. */
function idBerikutTiang_(rows, kolom, awalan) {
  var maks = 0, pola = new RegExp('^' + awalan + '-(\\d+)$');
  rows.forEach(function (r) { var m = pola.exec(teksSwc_(r[kolom])); if (m && Number(m[1]) > maks) maks = Number(m[1]); });
  var n = String(maks + 1);
  while (n.length < 4) n = '0' + n;
  return awalan + '-' + n;
}

/** Hitung tiang per segmen dari db_Tiang_Sirkuit aktif: { segmen_id: {jumlah, terverifikasi} }. */
function hitungTiangSegmen_(sirkuit) {
  var h = {};
  sirkuit.forEach(function (r) {
    var id = teksSwc_(r.segmen_id);
    if (!id || !isAktif_(r.aktif)) return;
    var x = h[id] = h[id] || { jumlah: 0, terverifikasi: 0 };
    x.jumlah++;
    if (teksSwc_(r.status_verifikasi) === 'TERVERIFIKASI') x.terverifikasi++;
  });
  return h;
}

function sgmKeApi_(r, hitung) {
  var o = { segmenId: teksSwc_(r.segmen_id) };
  SGM_ISIAN_.forEach(function (x) { o[x[0]] = x[2].tipe === 'angka' ? angkaSwc_(r[x[1]]) : teksSwc_(r[x[1]]); });
  o.jenisSegmen = o.jenisSegmen || 'UDARA';
  o.statusData = teksSwc_(r.status_data);
  var h = hitung[o.segmenId] || { jumlah: 0, terverifikasi: 0 };
  o.jumlahTiang = h.jumlah;
  o.jumlahTerverifikasi = h.terverifikasi;
  o.aktif = isAktif_(r.aktif);
  o.revision = Number(r.revision) || 0;
  return o;
}

/** getSegmen {} -> { segmen: [...], jaringan: [{sectionId, penyulang, section}], switching: [{switchingId, jenis, nama, penyulang}] }. */
function getSegmen_(sesi, data) {
  wajibAdminTiang_(sesi);
  validasi_(data || {}, {});
  var hitung = hitungTiangSegmen_(tabelTiangSisi_('db_Tiang_Sirkuit').rows);
  var segmen = tabelTiangSisi_(SGM_SHEET_).rows.filter(function (r) { return teksSwc_(r.segmen_id); });
  return {
    segmen: segmen.map(function (r) { return sgmKeApi_(r, hitung); }),
    jaringan: jaringanSwitching_().daftar.map(function (x) { return { sectionId: x.sectionId, penyulang: x.penyulang, section: x.section }; }),
    switching: tabelSwitching_().rows.filter(function (r) { return teksSwc_(r.switching_id) && isAktif_(r.aktif); }).map(function (r) {
      return { switchingId: teksSwc_(r.switching_id), jenis: teksSwc_(r.jenis), nama: teksSwc_(r.nama), penyulang: teksSwc_(r.penyulang) };
    })
  };
}

/**
 * simpanSegmen { segmenId?, revision?, aktif?, ...isian } -> { segmen }. Tanpa segmenId = baru (SGM-nnnn). Ubah = revision wajib
 * sama. Aturan: penyulang + section dari db_Jaringan aktif, nama unik per section di antara baris aktif (NAMA_GANDA), induk segmen
 * ada + penyulang sama + bukan diri sendiri, switching batas ada di db_Switching aktif. urutan kosong = melanjutkan urutan terakhir
 * penyulang itu (+10).
 */
function simpanSegmen_(sesi, data, platform) {
  wajibAdminTiang_(sesi);
  var skema = { segmenId: { tipe: 'teks', maks: 20, pola: SGM_POLA_ID_ }, revision: { tipe: 'angka', bulat: true, min: 1 }, aktif: { tipe: 'bool' } };
  SGM_ISIAN_.forEach(function (x) { skema[x[0]] = x[2]; });
  var d = validasi_(data, skema);
  if (d.segmenId && d.revision === undefined) throw new SisiError_('FIELD_WAJIB', 'revision');
  wajibKonfigTiang_();
  var jar = jaringanSwitching_();
  var switching = {};
  tabelSwitching_().rows.forEach(function (r) { if (isAktif_(r.aktif)) switching[teksSwc_(r.switching_id)] = true; });
  return denganLock_(function () {
    var t = tabelTiangSisi_(SGM_SHEET_);
    var rows = t.rows.filter(function (r) { return teksSwc_(r.segmen_id); });
    var lama = d.segmenId ? rows.filter(function (r) { return teksSwc_(r.segmen_id) === d.segmenId; }) : [];
    if (lama.length > 1) throw new SisiError_('ID_GANDA', d.segmenId);
    if (d.segmenId && !lama.length) throw new SisiError_('DATA_TIDAK_DITEMUKAN', d.segmenId);
    if (lama.length && Number(lama[0].revision || 0) !== d.revision) throw new SisiError_('KONFLIK_REVISION', d.segmenId);
    if (!lama.length && rows.length >= SGM_MAKS_BARIS_) throw new SisiError_('TERLALU_BANYAK', SGM_SHEET_);
    var id = d.segmenId || idBerikutTiang_(rows, 'segmen_id', 'SGM');
    var u = {};
    SGM_ISIAN_.forEach(function (x) { u[x[1]] = d[x[0]] === undefined ? '' : d[x[0]]; });
    var pny = jar.penyulang[String(u.penyulang).toUpperCase()];
    if (!pny) throw new SisiError_('PENYULANG_TIDAK_DIKENAL', u.penyulang);
    u.penyulang = pny;
    var sec = jar.section[u.section_id];
    if (!sec) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'section');
    if (sec.penyulang !== pny) throw new SisiError_('SECTION_BEDA_PENYULANG', u.section_id);
    ['awal_switching_id', 'akhir_switching_id'].forEach(function (k) { if (u[k] && !switching[u[k]]) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'switching ' + u[k]); });
    if (u.induk_segmen_id) {
      var induk = rows.filter(function (r) { return teksSwc_(r.segmen_id) === u.induk_segmen_id && isAktif_(r.aktif); })[0];
      if (!induk || u.induk_segmen_id === id) throw new SisiError_('HULU_TIDAK_VALID', 'induk segmen');
      if (teksSwc_(induk.penyulang) !== pny) throw new SisiError_('DATA_TIDAK_VALID', 'induk segmen beda penyulang');
    }
    var nama = String(u.nama).toUpperCase();
    rows.forEach(function (r) {
      if (teksSwc_(r.segmen_id) === id || !isAktif_(r.aktif)) return;
      if (teksSwc_(r.section_id) === u.section_id && teksSwc_(r.nama).toUpperCase() === nama) throw new SisiError_('NAMA_GANDA', u.nama);
    });
    if (u.urutan === '') {
      u.urutan = rows.reduce(function (m, r) { return teksSwc_(r.penyulang) === pny ? Math.max(m, Number(r.urutan) || 0) : m; }, 0) + 10;
    }
    u.jenis_segmen = u.jenis_segmen || 'UDARA';
    if (u.jenis_segmen === 'KABEL_TANAH') {
      var isi = (hitungTiangSegmen_(tabelTiangSisi_('db_Tiang_Sirkuit').rows)[id] || {}).jumlah || 0;
      if (isi) throw new SisiError_('DATA_TIDAK_VALID', 'segmen kabel tanah tidak boleh berisi tiang (' + isi + ' tiang terdaftar)');
      u.status_data = u.jenis_kabel && u.ukuran_mm2 !== '' && u.panjang_kabel_m !== '' ? 'LENGKAP' : 'KURANG';
    } else {
      SGM_KOLOM_KABEL_.forEach(function (k) { u[k] = ''; });
      u.status_data = '';
    }
    u.aktif = d.aktif !== undefined ? d.aktif : lama.length ? isAktif_(lama[0].aktif) : true;
    u.diubah_pada = sekarangIso_();
    u.diubah_oleh = sesi.userId;
    var log = headerTabel_('AUTH_SHEET_ID', 'log_Audit'), baris;
    if (lama.length) {
      var beda = bedaSwitching_(lama[0], u);
      tulisBlok_(t, [{ r: lama[0], u: u }], [], { bolehId: SGM_BOLEH_ID_ });
      baris = lama[0];
      auditLog_(sesi, 'SEGMEN_UBAH', SGM_SHEET_, id + ': ' + (beda || 'tanpa perubahan isian'), platform, log);
    } else {
      baris = Object.assign({ No: noBaris_(t, 0), segmen_id: id, revision: 1, status_verifikasi: 'BELUM' }, u);
      tulisBlok_(t, [], [baris]);
      auditLog_(sesi, 'SEGMEN_BARU', SGM_SHEET_, id + ' ' + u.nama + ' (' + pny + ')', platform, log);
    }
    return { segmen: sgmKeApi_(baris, {}) };
  });
}
