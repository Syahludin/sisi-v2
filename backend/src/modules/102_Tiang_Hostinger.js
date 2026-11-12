/**
 * Modul tiang di Hostinger (docs/superpowers/specs/2026-11-11-tiang-hostinger-design.md). Sisi Apps Script: tiket HP (93_Mysql.js
 * getTiketApi), alamat API di ping (09_Versi.js TIANG_API_URL), pencabutan tiket akun nonaktif (di sini); impor, tarik, dan arsip foto
 * menyusul di berkas ini.
 *
 * Pencabutan: tiket HP berlaku 8 jam dan diperiksa PHP tanpa menghubungi Apps Script, jadi akun yang dinonaktifkan di db_Users
 * (edit manual) masih diterima sampai tiketnya habis. sinkronCabutTiketTiang_ mengirim DAFTAR LENGKAP akun nonaktif ke cabut.php
 * (menggantikan isi tiang_cabut): akun yang diaktifkan lagi otomatis dilepas dari daftar. Dipanggil dari ADMIN_sinkronCabutTiketTiang
 * (manual) dan pemicu per jam (ADMIN_pasangPemicuTiang, Task 7).
 *
 * Pembekuan tulis (Script Property TIANG_TULIS_BEKU = YA): endpoint Apps Script yang menulis data tiang (bertanda `bekuTiang` di 02_Router.js:
 * simpanVerifikasiTiang, sinkronTiang, uploadFotoTiang, simpanSegmen, simpanSwitching, uploadFotoSwitching) menjawab PINDAH_HOSTINGER, semua
 * platform (HP lama dan website), karena sesudah pindah data tiang ada di MySQL dan Sheet hanya salinan yang ditimpa ADMIN_tarikDataTiang.
 * Endpoint baca tetap jalan; tulis Master Jaringan (simpanSection, setAktifPenyulang) dan tab master tidak dibekukan. Urutan pindah: set
 * TIANG_TULIS_BEKU = YA -> impor penuh (ADMIN_imporTiangKeHostinger + ADMIN_imporFotoTiang) -> set TIANG_API_URL. Urutan MUNDUR:
 * ADMIN_tarikDataTiang({ paksa: true }) -> kosongkan TIANG_API_URL -> kosongkan TIANG_TULIS_BEKU. Kosong = perilaku lama.
 */
var TIANG_CABUT_MAKS_ = 5000;

/** user_id akun yang tidak aktif di db_Users. */
function userNonaktifTiang_() {
  return tabel_('MASTER_SHEET_ID', 'db_Users').rows
    .filter(function (r) { return String(r.user_id || '').trim() && !isAktif_(r.aktif); })
    .map(function (r) { return String(r.user_id).trim(); });
}

/** Kirim daftar akun nonaktif ke API tiang. Hasil { jumlah } atau null (API belum diatur). Gagal = MYSQL_GAGAL. */
function sinkronCabutTiketTiang_() {
  var konf = konfigMysql_();
  if (!konf) return null;
  var ids = userNonaktifTiang_();
  if (ids.length > TIANG_CABUT_MAKS_) throw new SisiError_('TERLALU_BANYAK', 'akun nonaktif');
  return kirimMysql_(konf, '/cabut.php', { cabut: ids });
}

/** Dipanggil proses_ sesudah guard: endpoint tulis tiang (bekuTiang) ditolak PINDAH_HOSTINGER bila TIANG_TULIS_BEKU = YA. */
function cekBekuTiang_(ep) {
  if (!ep || !ep.bekuTiang) return;
  if (String(PropertiesService.getScriptProperties().getProperty('TIANG_TULIS_BEKU') || '').trim().toUpperCase() === 'YA') throw new SisiError_('PINDAH_HOSTINGER');
}

/** Jalankan dari editor Apps Script: cabut tiket akun nonaktif di Hostinger. */
function ADMIN_sinkronCabutTiketTiang() {
  var h = sinkronCabutTiketTiang_();
  console.log(h ? 'Tiket dicabut untuk ' + h.jumlah + ' akun nonaktif.' : 'MYSQL_API_URL belum diatur: tidak ada yang dikirim.');
  return h;
}

/* ===== Impor awal: spreadsheet -> MySQL Hostinger ===== */

var TIANG_IMPOR_KEMAJUAN_ = 'TIANG_IMPOR_KEMAJUAN';
var TIANG_IMPOR_POTONG_ = 300;
var TIANG_IMPOR_MS_ = 4 * 60 * 1000;
/** Urutan impor: master dulu, lalu switching, segmen, tiang, sirkuit. sid = properti ID spreadsheet. */
var TIANG_IMPOR_TABEL_ = [
  { tabel: 'tiang_jaringan', sid: 'MASTER_SHEET_ID', sheet: 'db_Jaringan' },
  { tabel: 'tiang_konstruksi', sid: 'MASTER_SHEET_ID', sheet: 'db_Konstruksi' },
  { tabel: 'tiang_ukuran', sid: 'MASTER_SHEET_ID', sheet: 'db_Ukuran_Tiang' },
  { tabel: 'tiang_pemetaan', sid: 'MASTER_SHEET_ID', sheet: 'db_Tiang_Pemetaan' },
  { tabel: 'tiang_switching', sid: 'TIANG_SHEET_ID', sheet: 'db_Switching' },
  { tabel: 'tiang_segmen', sid: 'TIANG_SHEET_ID', sheet: 'db_Segmen' },
  { tabel: 'tiang_tiang', sid: 'TIANG_SHEET_ID', sheet: 'db_Tiang' },
  { tabel: 'tiang_sirkuit', sid: 'TIANG_SHEET_ID', sheet: 'db_Tiang_Sirkuit' }
];

/** Baris sheet (objek berkunci header) -> objek polos untuk JSON: tanggal jadi ISO, kunci internal (_baris, ...) dibuang. */
function barisImporTiang_(r) {
  var o = {};
  Object.keys(r).forEach(function (k) {
    if (k.charAt(0) === '_') return;
    var v = r[k];
    o[k] = v instanceof Date ? v.toISOString() : (v === undefined ? '' : v);
  });
  return o;
}

/** Baris tab, atau null bila tab master belum ada. */
function barisTabImporTiang_(def) {
  try {
    return (def.sid === 'TIANG_SHEET_ID' ? tabelTiangSisi_(def.sheet) : tabel_(def.sid, def.sheet)).rows;
  } catch (e) {
    if (e && e.kode === 'SHEET_TIDAK_ADA') return null;
    throw e;
  }
}

/**
 * Kirim isi sheet ke Hostinger (impor.php), potongan 300 baris, berurutan master -> sirkuit. Kemajuan disimpan di Script Property
 * (TIANG_IMPOR_KEMAJUAN) sehingga bisa dilanjutkan bila waktu habis (±4 menit per proses). opsi: { tabel: 'tiang_tiang' (satu tabel saja),
 * ulang: true (mulai dari awal) }. Hasil { selesai, tabel: {nama: {terkirim, ditulis, ditolak}}, ditolak: [contoh], berhenti? }.
 */
function imporTiangKeHostinger_(opsi) {
  opsi = opsi || {};
  var konf = konfigMysql_();
  if (!konf) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'MYSQL_API_URL');
  wajibKonfigTiang_();
  var props = PropertiesService.getScriptProperties();
  var kemajuan = {};
  var tunggal = !!opsi.tabel;   // satu tabel: selalu dari awal, kemajuan tidak dibaca / disimpan (pendek dan idempoten)
  if (!opsi.ulang && !tunggal) { try { kemajuan = JSON.parse(props.getProperty(TIANG_IMPOR_KEMAJUAN_) || '{}'); } catch (e) { kemajuan = {}; } }
  var mulai = Date.now(), hasil = { selesai: true, tabel: {}, ditolak: [] };
  for (var t = 0; t < TIANG_IMPOR_TABEL_.length; t++) {
    var def = TIANG_IMPOR_TABEL_[t];
    if (opsi.tabel && opsi.tabel !== def.tabel) continue;
    var rows = barisTabImporTiang_(def);
    var h = hasil.tabel[def.tabel] = { terkirim: 0, ditulis: 0, ditolak: 0, total: rows ? rows.length : 0 };
    if (!rows) continue;
    for (var i = kemajuan[def.tabel] || 0; i < rows.length; i += TIANG_IMPOR_POTONG_) {
      if (Date.now() - mulai > TIANG_IMPOR_MS_) { hasil.selesai = false; hasil.berhenti = def.tabel; if (!tunggal) props.setProperty(TIANG_IMPOR_KEMAJUAN_, JSON.stringify(kemajuan)); return hasil; }
      var potong = rows.slice(i, i + TIANG_IMPOR_POTONG_).map(barisImporTiang_);
      var r = kirimMysql_(konf, '/impor.php', { jenis: 'tabel', tabel: def.tabel, baris: potong, urutAwal: i + 1 });
      h.terkirim += potong.length;
      h.ditulis += r.ditulis;
      h.ditolak += r.ditolak.length;
      r.ditolak.forEach(function (x) { if (hasil.ditolak.length < 20) hasil.ditolak.push(def.tabel + ' baris ' + (i + x.baris) + ': ' + x.alasan); });
      kemajuan[def.tabel] = i + potong.length;
    }
  }
  if (!tunggal) props.deleteProperty(TIANG_IMPOR_KEMAJUAN_);
  return hasil;
}

var TIANG_MASTER_TABEL_ = ['tiang_jaringan', 'tiang_konstruksi', 'tiang_ukuran', 'tiang_pemetaan'];

/**
 * Tab master (SiSi_Master) MASIH diedit di Sheet (Master Jaringan di HP, konstruksi, ukuran tiang): salinannya di MySQL harus ikut,
 * kalau tidak section / konstruksi baru tidak dikenal server tiang. Hanya jalan bila TIANG_API_URL terisi. Hasil {tabel: ringkasan} atau null.
 */
function imporMasterTiang_(daftar) {
  if (!infoVersi_().tiangApi || !konfigMysql_()) return null;
  var h = {};
  (daftar || TIANG_MASTER_TABEL_).forEach(function (t) { h[t] = imporTiangKeHostinger_({ tabel: t }).tabel[t]; });
  return h;
}

/** Dipanggil proses_ sesudah endpoint bertanda imporMasterTiang berhasil (simpanSection, setAktifPenyulang): salinan jaringan di MySQL diperbarui, galat tidak menggagalkan simpan. */
function imporMasterTiangBila_(ep) {
  if (!ep || !ep.imporMasterTiang) return;
  // tidak menunggu Hostinger di dalam permintaan petugas: pemicu sekali jalan ±1 menit lagi (satu saja walau banyak simpan berturut-turut)
  try {
    if (!infoVersi_().tiangApi) return;
    var ada = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'ADMIN_pemicuImporJaringanTiang'; });
    if (!ada) ScriptApp.newTrigger('ADMIN_pemicuImporJaringanTiang').timeBased().after(60 * 1000).create();
  } catch (e) { console.error('impor master tiang: ' + ((e && (e.kode || e.message)) || e)); }
}

/** Pemicu sekali jalan dari imporMasterTiangBila_: salin db_Jaringan ke MySQL lalu hapus pemicunya sendiri. */
function ADMIN_pemicuImporJaringanTiang() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'ADMIN_pemicuImporJaringanTiang') ScriptApp.deleteTrigger(t); });
  try { imporMasterTiang_(['tiang_jaringan']); } catch (e) { console.error('impor master tiang: ' + ((e && (e.kode || e.message)) || e)); }
}

/** Jalankan dari editor Apps Script (boleh berulang sampai "selesai"): sheet -> MySQL Hostinger. */
function ADMIN_imporTiangKeHostinger(opsi) {
  var h = imporTiangKeHostinger_(opsi);
  Object.keys(h.tabel).forEach(function (k) { console.log(k + ': ' + h.tabel[k].ditulis + '/' + h.tabel[k].total + ' ditulis, ' + h.tabel[k].ditolak + ' ditolak'); });
  h.ditolak.forEach(function (x) { console.warn('DITOLAK ' + x); });
  console.log(h.selesai ? 'Selesai.' : 'Belum selesai (waktu habis di ' + h.berhenti + '): jalankan lagi untuk melanjutkan.');
  return h;
}

/* ===== Impor foto lama (Drive -> Hostinger) ===== */

var TIANG_FOTO_IMPOR_ = [
  { pemilik: 'TIANG', sheet: 'db_Tiang', kunci: 'tiang_id', slot: { TIANG: 'foto_tiang_id', KEPALA: 'foto_kepala_id' } },
  { pemilik: 'SWITCHING', sheet: 'db_Switching', kunci: 'switching_id', slot: { UNIT: 'foto_unit_id', NAMEPLATE: 'foto_nameplate_id', KONTROLER: 'foto_kontroler_id' } }
];

/**
 * Pindahkan foto lama (id berkas Drive di kolom foto_*_id sheet) ke Hostinger, satu per satu; yang sudah ada di Hostinger dilewati
 * (impor.php foto_ada), jadi aman diulang. ±4 menit per proses. Hasil { selesai, terkirim, dilewati, gagal: [alasan] }.
 */
function imporFotoTiang_() {
  var konf = konfigMysql_();
  if (!konf) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'MYSQL_API_URL');
  wajibKonfigTiang_();
  var mulai = Date.now(), hasil = { selesai: true, terkirim: 0, dilewati: 0, gagal: [] };
  for (var p = 0; p < TIANG_FOTO_IMPOR_.length; p++) {
    var def = TIANG_FOTO_IMPOR_[p];
    var ada = {};
    kirimMysql_(konf, '/impor.php', { jenis: 'foto_ada', pemilik: def.pemilik }).ada.forEach(function (x) { ada[x] = true; });
    var rows = tabelTiangSisi_(def.sheet).rows;
    for (var i = 0; i < rows.length; i++) {
      var id = String(rows[i][def.kunci] || '').trim();
      if (!id) continue;
      var slots = Object.keys(def.slot);
      for (var s = 0; s < slots.length; s++) {
        var driveId = String(rows[i][def.slot[slots[s]]] || '').trim();
        if (!driveId) continue;
        if (ada[id + '|' + slots[s]]) { hasil.dilewati++; continue; }
        if (Date.now() - mulai > TIANG_IMPOR_MS_) { hasil.selesai = false; return hasil; }
        try {
          var bytes = DriveApp.getFileById(driveId).getBlob().getBytes();
          if (bytes.length > FOTO_MAKS_BYTE_) throw new SisiError_('FOTO_TERLALU_BESAR', bytes.length);
          kirimMysql_(konf, '/impor.php', { jenis: 'foto', pemilik: def.pemilik, id: id, slot: slots[s],
            sha256: bytesKeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)), ukuranByte: bytes.length, data: Utilities.base64Encode(bytes) });
          hasil.terkirim++;
        } catch (e) {
          hasil.gagal.push(def.pemilik + ' ' + id + ' ' + slots[s] + ': ' + ((e && (e.kode || e.message)) || e));
        }
      }
    }
  }
  return hasil;
}

/** Jalankan dari editor Apps Script (boleh berulang sampai "selesai"): foto lama Drive -> Hostinger. */
function ADMIN_imporFotoTiang() {
  var h = imporFotoTiang_();
  console.log('Foto: ' + h.terkirim + ' dikirim, ' + h.dilewati + ' sudah ada, ' + h.gagal.length + ' gagal. ' + (h.selesai ? 'Selesai.' : 'Belum selesai: jalankan lagi.'));
  h.gagal.slice(0, 20).forEach(function (x) { console.warn('GAGAL ' + x); });
  return h;
}

/* ===== Tarik: MySQL Hostinger -> tab SiSi_Tiang (salinan, satu arah) ===== */

var TIANG_TARIK_TERAKHIR_ = 'TIANG_TARIK_TERAKHIR';
var TIANG_TARIK_BATAS_ = 500;
/** Hanya tab SiSi_Tiang. Tab master (SiSi_Master) TIDAK ditarik: masih diedit di Sheet dan diimpor (ADMIN_imporTiangKeHostinger). */
var TIANG_TARIK_TABEL_ = [
  { tabel: 'tiang_switching', sheet: 'db_Switching' },
  { tabel: 'tiang_segmen', sheet: 'db_Segmen' },
  { tabel: 'tiang_tiang', sheet: 'db_Tiang' },
  { tabel: 'tiang_sirkuit', sheet: 'db_Tiang_Sirkuit' }
];
var TIANG_CATATAN_SALINAN_ = 'SALINAN dari server Hostinger (diisi otomatis). Jangan diedit di sini: perubahan tidak masuk ke server dan akan tertimpa.';

/**
 * Tarik isi MySQL ke tab SiSi_Tiang (menimpa seluruh baris data; header tidak disentuh). Hanya jalan bila TIANG_API_URL terisi (HP sudah
 * memakai Hostinger, jadi Sheet memang salinan) atau opsi.paksa. Tab yang di server kosong sedangkan di Sheet ada isi DILEWATI (cegah
 * hapus tak sengaja) kecuali opsi.paksa. Hasil { waktu, tabel: {nama: {baris, dilewati?}} }.
 */
function tarikDataTiang_(opsi) {
  opsi = opsi || {};
  var konf = konfigMysql_();
  if (!konf) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'MYSQL_API_URL');
  if (!infoVersi_().tiangApi && !opsi.paksa) throw new SisiError_('SALINAN_BELUM_AKTIF', 'TIANG_API_URL kosong: Sheet masih sumber data');
  wajibKonfigTiang_();
  var hasil = { waktu: sekarangIso_(), tabel: {} };
  // foto yang belum diarsip hanya punya path Hostinger (bukan id Drive): arsipkan dulu agar Sheet (jalur mundur) memuat id Drive yang sah
  try { hasil.arsip = arsipFotoTiang_(); } catch (eA) { hasil.arsip = { galat: (eA && (eA.kode || eA.message)) || String(eA) }; }
  var fotoPath = 0;
  TIANG_TARIK_TABEL_.forEach(function (def) {
    var baris = [], kursor = null, selesai = false;
    while (!selesai) {
      var h = kirimMysql_(konf, '/ekspor.php', { jenis: 'tabel', tabel: def.tabel, kursor: kursor, batas: TIANG_TARIK_BATAS_ });
      baris = baris.concat(h.baris);
      selesai = h.selesai || !h.kursor;
      kursor = h.kursor;
    }
    var t = tabelTiangSisi_(def.sheet), sh = t.sheet, kolom = t.header.length, terakhir = sh.getLastRow();
    if (!baris.length && terakhir > 1 && !opsi.paksa) { hasil.tabel[def.tabel] = { baris: 0, dilewati: 'server kosong, Sheet berisi ' + (terakhir - 1) + ' baris' }; return; }
    if (baris.length) {
      sh.getRange(2, 1, baris.length, kolom).setValues(baris.map(function (r) {
        return t.header.map(function (k) {
          var v = Object.prototype.hasOwnProperty.call(r, k) ? r[k] : '';
          if (typeof v !== 'string' || v === '') return v;
          if (/^foto_.*_id$/.test(k) && v.indexOf('/') >= 0) { fotoPath++; return ''; }   // path Hostinger: belum ada di Drive
          return nilaiTeksSheet_(v);
        });
      }));
    }
    if (terakhir - 1 > baris.length) {
      var sisa = terakhir - 1 - baris.length;
      sh.getRange(baris.length + 2, 1, sisa, kolom).setValues(Array.apply(null, Array(sisa)).map(function () { return Array.apply(null, Array(kolom)).map(function () { return ''; }); }));
    }
    try { sh.getRange(1, 1).setNote(TIANG_CATATAN_SALINAN_); } catch (eN) { /* catatan hanya penanda */ }
    hasil.tabel[def.tabel] = { baris: baris.length };
  });
  if (fotoPath) hasil.fotoBelumArsip = fotoPath;
  PropertiesService.getScriptProperties().setProperty(TIANG_TARIK_TERAKHIR_, JSON.stringify(hasil));
  return hasil;
}

/**
 * Teks dari MySQL yang akan diubah Sheets menjadi angka / tanggal (ASSETNUM '1001', '0012', ISO waktu, '1.2E+15') diberi awalan "'"
 * agar tetap teks; getValues mengembalikannya tanpa awalan, jadi impor ulang tetap mengirim teks utuh.
 */
function nilaiTeksSheet_(v) {
  var angka = /^\s*[+\-]?\d[\d.,]*([eE][+\-]?\d+)?\s*$/, waktu = /^\s*\d{1,4}[\-\/.:]\d{1,2}/;
  return /^[=+]/.test(v) || angka.test(v) || waktu.test(v) ? "'" + v : v;
}

/** Editor: tarik data tiang dari Hostinger ke Sheet (opsi { paksa: true } untuk menimpa walau server kosong / API belum aktif). */
function ADMIN_tarikDataTiang(opsi) {
  var h = tarikDataTiang_(opsi);
  Object.keys(h.tabel).forEach(function (k) { console.log(k + ': ' + h.tabel[k].baris + ' baris' + (h.tabel[k].dilewati ? ' (DILEWATI: ' + h.tabel[k].dilewati + ')' : '')); });
  return h;
}

/* ===== Arsip foto Hostinger -> Drive (tarik; kredensial Google tetap di Apps Script) ===== */

var TIANG_ARSIP_BATCH_ = 20;

/**
 * Foto yang belum diarsip diunduh dari Hostinger lalu disimpan ke TIANG_FOTO_FOLDER_ID (struktur folder sama dengan jalur lama:
 * Tiang / <kode jalur> / ..., Switching / <id> / ...), lalu ditandai di server dengan id berkas Drive. Idempoten (penanda berkas memuat
 * sidik); foto yang gagal dilewati agar tidak menghalangi yang lain. Hasil { selesai, diarsip, gagal: [alasan] }.
 */
function arsipFotoTiang_() {
  var konf = konfigMysql_();
  if (!konf) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'MYSQL_API_URL');
  wajibKonfigTiang_();
  var folderId = cfg_().TIANG_FOTO_FOLDER_ID;
  if (!folderId) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'TIANG_FOTO_FOLDER_ID');
  var mulai = Date.now(), hasil = { selesai: true, diarsip: 0, gagal: [] };
  for (;;) {
    var daftar = kirimMysql_(konf, '/ekspor.php', { jenis: 'foto_belum_arsip', batas: TIANG_ARSIP_BATCH_, lewati: hasil.gagal.length }).foto;
    if (!daftar.length) break;
    for (var i = 0; i < daftar.length; i++) {
      var f = daftar[i];
      if (Date.now() - mulai > TIANG_IMPOR_MS_) { hasil.selesai = false; return hasil; }
      try {
        var u = kirimMysql_(konf, '/ekspor.php', { jenis: 'foto_unduh', pemilik: f.pemilik, id: f.id, slot: f.slot });
        var bytes = Utilities.base64Decode(u.data);
        if (bytes.length !== u.ukuranByte) throw new SisiError_('FOTO_RUSAK', 'ukuran');
        var bagian = f.pemilik === 'TIANG' ? ['Tiang', u.folder] : ['Switching', f.id];
        var r = simpanFotoLapangan_(folderId, bagian, f.id + '|' + f.slot + '|' + f.sha256, f.id + '_' + f.slot + '.jpg', bytes);
        kirimMysql_(konf, '/ekspor.php', { jenis: 'tandai_arsip', pemilik: f.pemilik, id: f.id, slot: f.slot, sha256: f.sha256, drive_file_id: r.fileId });
        hasil.diarsip++;
      } catch (e) {
        hasil.gagal.push(f.pemilik + ' ' + f.id + ' ' + f.slot + ': ' + ((e && (e.kode || e.message)) || e));
      }
    }
  }
  return hasil;
}

/** Pemakaian ruang foto di Hostinger; melewati ambang (TIANG_FOTO_BATAS_MB, bawaan 12000 MB = 60% dari 20 GB) dicatat sebagai peringatan. */
function cekRuangTiang_() {
  var konf = konfigMysql_();
  if (!konf) return null;
  var r = kirimMysql_(konf, '/ekspor.php', { jenis: 'ruang' });
  var batasMb = Number(PropertiesService.getScriptProperties().getProperty('TIANG_FOTO_BATAS_MB')) || 12000;
  r.melewati = r.foto_bytes > batasMb * 1048576;
  // cadangan harian (cron cadangan.php): tidak ada / lebih dari 36 jam = cron mati atau gagal diam-diam
  var umurJam = r.cadangan && r.cadangan.waktu ? (Date.now() - new Date(r.cadangan.waktu).getTime()) / 3600000 : null;
  r.cadanganTerlambat = umurJam === null || umurJam > 36;
  if (r.cadanganTerlambat) {
    console.warn('Cadangan harian tiang di Hostinger ' + (umurJam === null ? 'belum pernah berjalan' : 'terakhir ' + Math.round(umurJam) + ' jam lalu') + ': periksa cron cadangan.php di hPanel.');
    PropertiesService.getScriptProperties().setProperty('TIANG_CADANGAN_PERINGATAN', sekarangIso_());
  }
  if (r.melewati) {
    console.warn('Foto tiang di Hostinger ' + Math.round(r.foto_bytes / 1048576) + ' MB melewati ambang ' + batasMb + ' MB: pertimbangkan membersihkan / menambah ruang.');
    PropertiesService.getScriptProperties().setProperty('TIANG_RUANG_PERINGATAN', sekarangIso_());
  }
  return r;
}

/** Editor: arsipkan foto tiang dari Hostinger ke Drive (boleh berulang sampai "selesai"). */
function ADMIN_arsipFotoTiang() {
  var h = arsipFotoTiang_();
  console.log('Arsip foto: ' + h.diarsip + ' berkas ke Drive, ' + h.gagal.length + ' gagal. ' + (h.selesai ? 'Selesai.' : 'Belum selesai: jalankan lagi.'));
  h.gagal.slice(0, 20).forEach(function (x) { console.warn('GAGAL ' + x); });
  return h;
}

/* ===== Pemicu ===== */

var TIANG_PEMICU_ = ['ADMIN_pemicuTiangJam', 'ADMIN_pemicuTiangMalam'];

/** Tiap jam: cabut tiket akun nonaktif, salin tab master ke MySQL, arsipkan foto baru ke Drive, cek ruang foto. Galat satu langkah tidak menghentikan yang lain. */
function ADMIN_pemicuTiangJam() {
  [['cabut tiket', sinkronCabutTiketTiang_], ['impor master', imporMasterTiang_], ['arsip foto', arsipFotoTiang_], ['cek ruang', cekRuangTiang_]].forEach(function (x) {
    try { x[1](); } catch (e) { console.error('pemicu tiang (' + x[0] + '): ' + ((e && (e.kode || e.message)) || e)); }
  });
}

/** Tiap malam 01.30 WIB: tarik data tiang dari Hostinger ke Sheet (salinan + cadangan kedua). */
function ADMIN_pemicuTiangMalam() {
  try { tarikDataTiang_({}); } catch (e) { console.error('pemicu tiang (tarik): ' + ((e && (e.kode || e.message)) || e)); }
}

/** Editor: pasang pemicu per jam dan malam (pemicu lama diganti). */
function ADMIN_pasangPemicuTiang() {
  pastikanPemilik_();
  ADMIN_hapusPemicuTiang();
  ScriptApp.newTrigger('ADMIN_pemicuTiangJam').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('ADMIN_pemicuTiangMalam').timeBased().everyDays(1).atHour(1).nearMinute(30).inTimezone('Asia/Jakarta').create();
  console.log('Pemicu tiang dipasang: ADMIN_pemicuTiangJam (tiap jam) dan ADMIN_pemicuTiangMalam (01.30 WIB).');
}

/** Editor: hapus pemicu tiang. */
function ADMIN_hapusPemicuTiang() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (TIANG_PEMICU_.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
}
