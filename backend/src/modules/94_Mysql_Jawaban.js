/* v1.0.38: dipisah dari 93_Mysql.js (konfig, tiket, kirimMysql_ ada di sana). */
/* ===== v1.0.38 Pengukuran Gardu: jawaban jadi (read-through) ===== */
/*
 * MySQL menyimpan JAWABAN JADI endpoint baca website (logika tetap di Apps Script; PHP hanya menyimpan / mengembalikan):
 *   - Website membaca jawaban.php?aksi=&data= (data = JSON kanonik). Belum ada = baca Apps Script seperti biasa; router
 *     lalu menyimpan jawaban itu ke MySQL (simpanJawabanMysql_), versi = waktu MULAI membaca.
 *   - Kiriman yang mengubah data gardu langsung menghapus jawaban terdampak (hapusJawabanMysql_): per gardu (garduId di
 *     kiriman) + daftar gardu; tanpa garduId = semua jawaban gardu. Versi = waktu SESUDAH tulis. API menolak jawaban yang
 *     mulai disusun sebelum penghapusan terakhir grupnya (pembacaan lambat tidak bisa menimpa data baru dengan data lama).
 *   - Hapus gagal (jaringan) = disimpan di MYSQL_HAPUS_TERTUNDA dan dikirim ulang bersama panggilan MySQL berikutnya.
 */
var MYSQL_HAPUS_TERTUNDA_PROP_ = 'MYSQL_HAPUS_TERTUNDA';
var MYSQL_GRUP_SEMUA_GARDU_ = 'gardu:*';
// aksi baca website -> grup jawaban (dari data + jawaban); null = tidak disimpan
var MYSQL_JAWABAN_ = {
  getRiwayatGardu: function (data, isi) { return isi && isi.garduId ? 'gardu:' + isi.garduId : null; },
  getHiGardu: function (data, isi) { return isi && isi.gardu && isi.gardu.id ? 'gardu:' + isi.gardu.id : null; },
  getMaster: function (data) {
    var k = kanonMysql_(data);
    // master jaringan diubah lewat sheet / editor (tanpa kiriman): API membatasi umurnya 1 jam (jawaban.php UMUR_GRUP)
    return k === '{"modul":["gardu"]}' ? 'gardu:daftar' : k === '{"modul":["jaringan"]}' ? 'master:jaringan' : null;
  },
  // v1.0.50: Temuan Inspeksi / Penerusan Tim (baca sheet temuan + TL + ganda lambat, web sempat batas waktu)
  // v1.0.58: panggilan selisih (sejak) berubah tiap kali = tidak disimpan
  getPetaTemuan: function (data) { return data && data.sejak ? null : 'temuan:daftar'; },
  getWoAdmin: function (data) { return data && data.sejak ? null : 'temuan:daftar'; },
  // Review 8 Nov 2026: menu admin lain. Jawaban TIDAK bergantung pada pengguna (peran hanya dicek di guard), jadi aman dipakai bersama.
  // getLaporanUp3 / getLaporanUiw sengaja tidak (memuat bisaUbah per peran); getLaporanGangguan tidak (menyinkron sumber saat dibaca).
  getRekapJenisTemuan: function () { return 'temuan:daftar'; },
  getCheckpoint: function () { return 'checkpoint:daftar'; },
  getCoverGardu: function () { return 'gardu:daftar'; },
  getDataAset: function () { return 'aset:daftar'; },
  getJadwalPadam: function () { return 'jadwal:daftar'; },
  getMasterJadwalPadam: function () { return 'jadwal:daftar'; },
  getApprovalP0: function () { return 'p0:daftar'; },
  getDaftarBaGardu: function () { return 'ba:daftar'; },
  getBaGardu: function () { return 'ba:daftar'; },
  getGudangStok: function () { return 'gudang:daftar'; },
  getSelisihGudang: function () { return 'gudang:daftar'; },
  getPemakaianGudang: function () { return 'gudang:daftar'; },
  getIzinMaterial: function () { return 'gudang:daftar'; },
  // dibuat dari data harian ROW / Hartek (berubah sepanjang hari, tidak ada kiriman penghapus): umur pendek di jawaban.php (5 menit)
  getWorkplanUp3: function () { return 'laporan:daftar'; },
  getGaspolUp3: function () { return 'laporan:daftar'; }
};
// kiriman yang bisa mengubah daftar temuan inspeksi (temuan, tindak lanjut, tim, ganda)
var MYSQL_MENU_TEMUAN_ = ['OPS_INSDU_INPUT', 'OPS_INSJAR_INPUT', 'OPS_INPUT_TEMUAN', 'OPS_PENERUSAN_WO', 'OPS_PINDAH_TIM_TO', 'OPS_WO_TIM',
  'OPS_WO_GANDA'];
// kiriman yang bisa mengubah data Pengukuran Gardu (db_Gardu, Master / HI lama, yan_Gardu, Inspeksi Gardu, temuan, BA)
var MYSQL_MENU_GARDU_ = ['OPS_BA_GARDU', 'OPS_PENGUKURAN_GARDU', 'OPS_INSDU_INPUT', 'OPS_INSJAR_INPUT', 'OPS_INPUT_TEMUAN', 'OPS_PENERUSAN_WO',
  'OPS_PINDAH_TIM_TO', 'OPS_WO_TIM', 'OPS_WO_GANDA', 'OPS_VERIFIKASI_P0', 'OPS_HARTEK_INPUT'];
var MYSQL_AKSI_GARDU_ = ['simpanP0Yandal', 'simpanGarduYandal', 'uploadFotoGarduYandal', 'simpanSwitchingYandal'];

// Review 8 Nov 2026: kiriman menu ini menghapus grup jawaban menu admin lain (selain gardu / temuan di atas)
var MYSQL_HAPUS_MENU_ = {
  OPS_DATA_ASET: ['aset:daftar'],
  OPS_JADWAL_PADAM: ['jadwal:daftar'],
  OPS_GUDANG_MATERIAL: ['gudang:daftar'],
  OPS_STOK_MATERIAL: ['gudang:daftar'],   // HP Yandal mengubah stok / pemakaian
  OPS_BA_GARDU: ['ba:daftar'],
  OPS_VERIFIKASI_P0: ['p0:daftar'],
  OPS_WO_TIM: ['p0:daftar']   // Selesai WO Yandal membuat P0
};
var MYSQL_HAPUS_AKSI_P0_ = ['simpanP0Yandal', 'simpanGarduYandal', 'uploadFotoGarduYandal', 'simpanSwitchingYandal'];

/** JSON kanonik (kunci objek diurutkan, rekursif). Sama persis dengan web/src/apiBaca.js kanon(). Murni. */
function kanonMysql_(v) {
  var urut = function (x) {
    if (Array.isArray(x)) return x.map(urut);
    if (x && typeof x === 'object') { var o = {}; Object.keys(x).sort().forEach(function (k) { o[k] = urut(x[k]); }); return o; }
    return x;
  };
  return JSON.stringify(urut(v === undefined ? {} : v));
}

/** garduId yang disebut kiriman (kunci garduId / gardu_id, kedalaman <= 5, maks 50). Murni. */
function garduIdKiriman_(data) {
  var hasil = {}, n = 0;
  (function jalan(v, dalam) {
    if (n > 500 || dalam > 5 || !v || typeof v !== 'object') return;
    Object.keys(v).forEach(function (k) {
      n++;
      var x = v[k];
      if (/^gardu_?id$/i.test(k) && typeof x === 'string' && /^[A-Za-z0-9_-]{1,60}$/.test(x)) hasil[x] = true;
      else jalan(x, dalam + 1);
    });
  })(data, 0);
  return Object.keys(hasil).slice(0, 50);
}

/** Grup jawaban yang dihapus oleh kiriman ini, [] = kiriman tidak menyentuh data gardu. Murni. */
function grupHapusGardu_(nama, ep, data) {
  var tulis = (ep && ep.tulis && MYSQL_MENU_GARDU_.indexOf(ep.menu) !== -1) || MYSQL_AKSI_GARDU_.indexOf(nama) !== -1;
  if (!tulis) return [];
  var id = garduIdKiriman_(data);
  var grup = id.length ? id.map(function (x) { return 'gardu:' + x; }).concat(['gardu:daftar']) : [MYSQL_GRUP_SEMUA_GARDU_];
  return ep && MYSQL_MENU_TEMUAN_.indexOf(ep.menu) !== -1 ? grup.concat(['temuan:daftar']) : grup;
}

/**
 * Grup jawaban menu admin lain (BUKAN gardu / temuan: itu grupHapusGardu_) yang dihapus kiriman ini. Murni.
 * Checkpoint dibuat dari temuan + master gardu, jadi ikut dihapus oleh kiriman temuan / gardu.
 */
function grupHapusBaca_(nama, ep) {
  var hasil = [];
  var tambah = function (g) { if (hasil.indexOf(g) === -1) hasil.push(g); };
  var tulis = !!(ep && ep.tulis);
  if (tulis && Object.prototype.hasOwnProperty.call(MYSQL_HAPUS_MENU_, ep.menu)) MYSQL_HAPUS_MENU_[ep.menu].forEach(tambah);
  if (MYSQL_HAPUS_AKSI_P0_.indexOf(nama) !== -1) tambah('p0:daftar');
  if ((tulis && (MYSQL_MENU_TEMUAN_.indexOf(ep.menu) !== -1 || MYSQL_MENU_GARDU_.indexOf(ep.menu) !== -1)) || MYSQL_AKSI_GARDU_.indexOf(nama) !== -1) tambah('checkpoint:daftar');
  return hasil;
}

function bacaTertundaMysql_() {
  try { var v = JSON.parse(PropertiesService.getScriptProperties().getProperty(MYSQL_HAPUS_TERTUNDA_PROP_) || '{}'); return v && typeof v === 'object' ? v : {}; }
  catch (e) { return {}; }
}

/** Kirim ke jawaban.php bersama hapus tertunda. Berhasil = tertunda dikosongkan. Gagal = hapus baru ikut ditunda, lalu dilempar. */
function kirimJawabanMysql_(konf, isi, hapusBaru) {
  var p = PropertiesService.getScriptProperties(), tunda = bacaTertundaMysql_();
  Object.keys(hapusBaru || {}).forEach(function (g) { tunda[g] = Math.max(Number(tunda[g]) || 0, hapusBaru[g]); });
  if (Object.keys(tunda).length) isi.hapus = tunda;
  try {
    var data = kirimMysql_(konf, '/jawaban.php', isi);
    if (isi.hapus) p.deleteProperty(MYSQL_HAPUS_TERTUNDA_PROP_);
    return data;
  } catch (e) {
    if (isi.hapus) p.setProperty(MYSQL_HAPUS_TERTUNDA_PROP_, JSON.stringify(isi.hapus));
    throw e;
  }
}

/** Router, sesudah kiriman berhasil: hapus jawaban gardu terdampak. Gagal tidak menggagalkan kiriman (ditunda). */
function catatKirimanGarduMysql_(nama, ep, data) {
  var grup = grupHapusGardu_(nama, ep, data).concat(grupHapusBaca_(nama, ep));
  if (!grup.length) return;
  try {
    var konf = konfigMysql_();
    if (!konf) return;
    var ver = Date.now(), hapus = {};
    grup.forEach(function (g) { hapus[g] = ver; });
    kirimJawabanMysql_(konf, {}, hapus);
  } catch (e) {
    console.warn('Hapus jawaban MySQL gardu ditunda: ' + (e.kode || '') + ' ' + String(e.detail || e.message || e).slice(0, 80));
  }
}

/** Router, sesudah baca website (bukan dari cache): simpan jawaban jadi. mulaiMs = waktu mulai membaca. Gagal = diam. */
function simpanJawabanMysql_(nama, data, isi, mulaiMs) {
  var fn = MYSQL_JAWABAN_[nama];
  if (!fn) return null;
  try {
    var grup = fn(data, isi), konf = grup && konfigMysql_();
    if (!konf) return null;
    return kirimJawabanMysql_(konf, { simpan: { aksi: nama, data: kanonMysql_(data), grup: grup, ver: mulaiMs, isi: isi } }, null);
  } catch (e) {
    console.warn('Simpan jawaban MySQL ' + nama + ' gagal: ' + (e.kode || '') + ' ' + String(e.detail || e.message || e).slice(0, 80));
    return null;
  }
}

/** Editor / pemicu: hapus SEMUA jawaban gardu (sesudah sinkron harian / ubah sheet manual). */
function hapusSemuaJawabanGarduMysql_() {
  try {
    var konf = konfigMysql_();
    if (!konf) return;
    var ver = Date.now();
    var hapus = {};
    ['gardu', 'master', 'temuan', 'checkpoint', 'aset', 'jadwal', 'gudang', 'p0', 'ba', 'laporan'].forEach(function (p) { hapus[p + ':*'] = ver; });
    kirimJawabanMysql_(konf, {}, hapus);
  } catch (e) {
    console.warn('Hapus semua jawaban MySQL ditunda: ' + (e.kode || '') + ' ' + String(e.detail || e.message || e).slice(0, 80));
  }
}
