/**
 * v1.0.57 Gudang Material (permintaan Master Guswan 3 Nov 2026; rancangan docs/superpowers/specs/2026-11-03-gudang-material-design.md).
 * Akses sheet + guard + penulis mutasi untuk stok MCB per tim Yandal. Logika murni ada di 74_Gudang_Stok.js.
 * Sheet SiSi_Gudang (GUDANG_SHEET_ID): db_Material_Mutasi (buku stok, SUMBER KEBENARAN), db_Stok_Pemeriksaan, db_Stok_Pemeriksaan_Item,
 * db_Pemakaian_MCB, db_Stok_Selisih, db_Material_LogKoreksi. Sheet SiSi_Master: db_Material_Tim (izin material per tim) + db_Material.
 * Semua sheet berkolom pertama `No` (nomor urut diisi otomatis, BUKAN kunci).
 */

var GUD_HEADER_ = {
  db_Material_Mutasi: ['No', 'mutasi_id', 'waktu', 'jenis_mutasi', 'lokasi', 'material_id', 'daya', 'merk', 'status_mcb', 'jumlah',
    'ref_jenis', 'ref_id', 'catatan', 'foto', 'link_foto', 'dibuat_oleh', 'dibuat_pada'],
  db_Stok_Pemeriksaan: ['No', 'pemeriksaan_id', 'tanggal', 'tim_id', 'shift', 'petugas_id', 'waktu_input', 'total_input', 'total_perkiraan',
    'status', 'foto_stok', 'link_foto_stok', 'revision', 'diubah_pada', 'diubah_oleh'],
  db_Stok_Pemeriksaan_Item: ['No', 'item_id', 'pemeriksaan_id', 'daya', 'merk', 'status_mcb', 'jumlah_input', 'jumlah_perkiraan', 'selisih'],
  db_Pemakaian_MCB: ['No', 'pemakaian_id', 'nomor_pemakaian', 'tanggal', 'waktu', 'tim_id', 'shift', 'nomor_meter', 'daya', 'merk_mcb',
    'keperluan', 'petugas_id', 'status_mcb', 'foto_penggunaan', 'link_foto', 'jenis_catatan', 'diisi_oleh', 'diisi_pada', 'revision',
    'diubah_pada', 'diubah_oleh'],
  db_Stok_Selisih: ['No', 'selisih_id', 'pemeriksaan_id', 'tim_id', 'daya', 'merk', 'status_mcb', 'jumlah_perkiraan', 'jumlah_input',
    'selisih', 'arah', 'status', 'cara_penyelesaian', 'pemakaian_id', 'catatan_admin', 'diselesaikan_oleh', 'diselesaikan_pada'],
  db_Material_LogKoreksi: ['No', 'log_id', 'waktu', 'jenis_objek', 'objek_id', 'kolom', 'nilai_lama', 'nilai_baru', 'alasan', 'oleh']
};

/** db_Material_Tim (SiSi_Master): tim mana boleh memakai material apa. Tanpa baris aktif = tidak boleh. */
var GUD_IZIN_HEADER_ = ['No', 'izin_id', 'material_id', 'tim_id', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'];

/**
 * db_Merk_MCB (SiSi_Master): daftar merk MCB yang boleh dipilih (dropdown HP). Isi diubah admin di sheet (nonaktifkan = aktif FALSE,
 * baris tidak dihapus). Master belum ada / tanpa merk aktif = merk belum divalidasi (isian lama tetap diterima).
 */
var GUD_MERK_HEADER_ = ['No', 'merk_id', 'merk', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'];

/**
 * db_Keperluan_MCB (SiSi_Master): daftar keperluan penggunaan MCB yang boleh dipilih (dropdown HP). Dibuat ADMIN_siapkanSheetGudang
 * (hanya header; isi diketik admin), id / No / aktif dilengkapi ADMIN_lengkapiMaster. Kosong / belum ada = keperluan belum divalidasi.
 */
var GUD_KEPERLUAN_HEADER_ = ['No', 'keperluan_id', 'keperluan', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'];

/** Kolom waktu / tanggal diberi format teks supaya Sheets tidak mengubahnya jadi Date. */
var GUD_KOLOM_TEKS_ = {
  db_Material_Mutasi: ['waktu', 'dibuat_pada'],
  db_Stok_Pemeriksaan: ['tanggal', 'waktu_input', 'diubah_pada'],
  db_Pemakaian_MCB: ['tanggal', 'waktu', 'diisi_pada', 'diubah_pada'],
  db_Stok_Selisih: ['diselesaikan_pada'],
  db_Material_LogKoreksi: ['waktu']
};

var GUD_MATERIAL_MCB_ = 'MCB';
/** Maks MCB dalam satu pemeriksaan awal shift. */
var GUD_ITEM_MAKS_ = 500;

/** Salinan skema SiSi_Gudang untuk skemaHeader_() (90_AdminTools.js). */
function gudangSkema_() {
  var h = {};
  Object.keys(GUD_HEADER_).forEach(function (n) { h[n] = GUD_HEADER_[n].slice(); });
  return h;
}

/** Dipanggil paling awal setelah peran: tanpa spreadsheet gudang tidak ada yang dibaca atau ditulis. */
function wajibKonfigGudang_() {
  if (!cfg_().GUDANG_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'GUDANG_SHEET_ID');
}

function tabelGudang_(nama) {
  wajibKonfigGudang_();
  return cekHeaderSkema_(tabel_('GUDANG_SHEET_ID', nama), 'GUDANG_SHEET_ID', nama);
}

/** Nilai kolom `No` baris baru ke-[i] (0, 1, ...) pada tabel [t]: nomor urut baris data, mulai 1. WAJIB dibaca di dalam lock. */
function noBaris_(t, i) { return Math.max(t.sheet.getLastRow(), 1) + (i || 0); }

function bulatPositif_(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v > 0; }

/* ===== alat penyiapan (pemilik) ===== */

function ADMIN_siapkanSheetGudang() { pastikanPemilik_(); return jalankanSiapkanGudang_(false); }

function ADMIN_cekSheetGudang() { pastikanPemilik_(); return jalankanSiapkanGudang_(true); }

/** Pastikan sheet [nama] ada dengan header [header]; header yang beda tidak pernah ditimpa. Hasil: 0 ok, 1 masalah. */
function pastikanSheetGudang_(ss, nama, header, kolomTeks, uji) {
  var sh = ss.getSheetByName(nama);
  if (!sh) {
    if (uji) { console.warn(nama + ' belum ada: jalankan ADMIN_siapkanSheetGudang'); return 1; }
    sh = ss.insertSheet(nama);
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    (kolomTeks || []).forEach(function (k) {
      if (typeof sh.getRange(1, 1).setNumberFormat === 'function') sh.getRange(1, header.indexOf(k) + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    });
    if (typeof sh.setFrozenRows === 'function') sh.setFrozenRows(1);
    console.log(nama + ' dibuat');
    return 0;
  }
  var ada = sh.getRange(1, 1, 1, Math.max(header.length, sh.getLastColumn())).getValues()[0].map(function (h) { return String(h).trim(); });
  while (ada.length && !ada[ada.length - 1]) ada.pop();
  if (ada.join('|') !== header.join('|')) {
    console.error(nama + ': header beda dari skema (' + ada.join(',') + '), tidak diubah');
    return 1;
  }
  return 0;
}

/**
 * Buat sheet SiSi_Gudang + db_Material_Tim (SiSi_Master); tambah baris material MCB di db_Material bila belum ada dan
 * izin MCB untuk tim YANDAL 13-17 (cocok lewat nama db_Tim). Aman diulang (tidak menggandakan). uji = tidak mengubah apa pun.
 * Hasil: jumlah masalah (0 = siap).
 */
function jalankanSiapkanGudang_(uji) {
  var c = cfg_();
  if (!c.GUDANG_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'GUDANG_SHEET_ID');
  return denganLock_(function () {
    var masalah = 0, ss = bukaSpreadsheet_(c.GUDANG_SHEET_ID), master = bukaSpreadsheet_(c.MASTER_SHEET_ID);
    Object.keys(GUD_HEADER_).forEach(function (n) { masalah += pastikanSheetGudang_(ss, n, GUD_HEADER_[n], GUD_KOLOM_TEKS_[n], uji); });
    masalah += pastikanSheetGudang_(master, 'db_Material_Tim', GUD_IZIN_HEADER_, [], uji);
    masalah += pastikanSheetGudang_(master, 'db_Merk_MCB', GUD_MERK_HEADER_, [], uji);
    masalah += pastikanSheetGudang_(master, 'db_Keperluan_MCB', GUD_KEPERLUAN_HEADER_, [], uji);
    if (uji || masalah) return masalah;

    var mat = tabel_('MASTER_SHEET_ID', 'db_Material');
    var mcb = mat.rows.filter(function (r) { return String(r.nama_material || '').trim().toUpperCase() === GUD_MATERIAL_MCB_; })[0];
    var materialId = mcb ? String(mcb.material_id || '') : '';
    if (!mcb) {
      materialId = uuid_();
      tulisBlok_(mat, [], [{ nomor: noBaris_(mat, 0), nama_material: GUD_MATERIAL_MCB_, satuan: 'unit', aktif: true, material_id: materialId,
        revision: 1, timestamp_update: sekarangIso_(), diubah_oleh: 'admin-tools' }]);
      console.log('db_Material: baris MCB ditambahkan');
    } else if (!materialId) {
      throw new SisiError_('DATA_TIDAK_VALID', 'baris MCB di db_Material belum punya material_id: jalankan ADMIN_lengkapiMaster');
    }

    var izin = tabel_('MASTER_SHEET_ID', 'db_Material_Tim');
    var tim = tabel_('MASTER_SHEET_ID', 'db_Tim').rows.filter(function (t) {
      return t.tim_id && isAktif_(t.aktif) && /yandal\s*1[3-7]\b/i.test(String(t.nama || ''));
    });
    var baru = [];
    tim.forEach(function (t) {
      var ada = izin.rows.some(function (r) { return String(r.material_id) === materialId && String(r.tim_id) === String(t.tim_id); });
      if (!ada) baru.push({ No: noBaris_(izin, baru.length), izin_id: uuid_(), material_id: materialId, tim_id: String(t.tim_id), aktif: true,
        revision: 1, diubah_pada: sekarangIso_(), diubah_oleh: 'admin-tools' });
    });
    tulisBlok_(izin, [], baru);
    console.log('db_Material_Tim: ' + baru.length + ' izin MCB ditambahkan untuk tim Yandal 13-17 (' + tim.length + ' tim cocok)');
    if (lengkapiMerkMcb_()) return 1;   // master merk MCB (juga dijalankan ADMIN_lengkapiMaster)
    return 0;
  });
}

/** Bagian ADMIN_cekKonfigurasi untuk gudang. */
function cekKonfigGudang_(c) {
  console.log('');
  console.log('--- Gudang Material (SiSi_Gudang) ---');
  if (!c.GUDANG_SHEET_ID) {
    console.log('  [DILEWATI]    GUDANG_SHEET_ID kosong (isi di CFG_JSON, lalu ADMIN_siapkanSheetGudang)');
    return 0;
  }
  var masalah = 0;
  Object.keys(GUD_HEADER_).forEach(function (n) {
    try { tabelGudang_(n); console.log('  [OK]          ' + n + ' header sesuai'); }
    catch (e) { masalah++; console.error('  [GAGAL]       ' + n + ': ' + (e.kode || e.message) + ' (jalankan ADMIN_siapkanSheetGudang)'); }
  });
  if (!c.GUDANG_FOTO_FOLDER_ID) { masalah++; console.warn('  [PERHATIAN]   GUDANG_FOTO_FOLDER_ID kosong, foto stok / pemakaian tidak bisa dikirim (folder Drive privat)'); }
  ['OPS_GUDANG_MATERIAL', 'OPS_STOK_MATERIAL'].forEach(function (kode) {
    try {
      var menu = tabel_('MASTER_SHEET_ID', 'db_Menu').rows.filter(function (x) { return String(x.menu_kode).trim() === kode; })[0];
      if (menu) console.log('  [OK]          menu ' + kode + ' ada di db_Menu');
      else { masalah++; console.warn('  [PERHATIAN]   menu ' + kode + ' belum ada di db_Menu (impor docs/db_Menu.tsv)'); }
    } catch (eM) { masalah++; console.error('  [GAGAL]       db_Menu: ' + (eM.kode || eM.message)); }
  });
  return masalah;
}

/* ===== master merk MCB ===== */

/** Baris tab master teks (SiSi_Master); tab belum dibuat = kosong, bukan galat. */
function masterTeksRows_(sheet) {
  try { return tabel_('MASTER_SHEET_ID', sheet).rows; } catch (e) { if (e && e.kode === 'SHEET_TIDAK_ADA') return []; throw e; }
}

/** Nilai kolom [kolom] yang aktif (ejaan master, tanpa dobel beda huruf), urut abjad. [] = master belum diisi. */
function daftarMasterTeks_(rows, kolom) {
  var ada = {}, hasil = [];
  (rows || []).forEach(function (r) {
    var m = String(r[kolom] === null || r[kolom] === undefined ? '' : r[kolom]).trim();
    if (!m || !isAktif_(r.aktif) || ada[m.toLowerCase()]) return;
    ada[m.toLowerCase()] = true;
    hasil.push(m);
  });
  return hasil.sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0; });
}

/**
 * Isian -> ejaan master (tanpa beda huruf besar/kecil + spasi ujung). Di luar master / nonaktif = galat [kode].
 * Master kosong = isian dikembalikan apa adanya (belum diberlakukan).
 */
function bakuMasterTeks_(nilai, daftar, kode) {
  if (!daftar.length) return nilai;
  var kunci = String(nilai).trim().toLowerCase();
  for (var i = 0; i < daftar.length; i++) if (daftar[i].toLowerCase() === kunci) return daftar[i];
  throw new SisiError_(kode, String(nilai).slice(0, 40));
}

/** Baris db_Merk_MCB; sheet belum dibuat = kosong, bukan galat. */
function merkMcbRows_() { return masterTeksRows_('db_Merk_MCB'); }

/** Merk aktif (ejaan master), urut abjad. [] = master belum diisi. */
function daftarMerkMcb_(rows) { return daftarMasterTeks_(rows || merkMcbRows_(), 'merk'); }

/**
 * Merk isian -> ejaan master, selain itu MERK_TIDAK_VALID. Dipakai hanya di jalur yang MEMBUAT jenis MCB dari ketikan
 * (tambah stok, pemeriksaan awal shift, koreksi pemakaian), bukan kirim / tarik / pakai yang bekerja atas stok yang sudah ada.
 */
function merkBakuMcb_(merk, daftar) { return bakuMasterTeks_(merk, daftar || daftarMerkMcb_(), 'MERK_TIDAK_VALID'); }

/** Keperluan penggunaan MCB aktif (ejaan master), urut abjad. [] = master belum diisi. */
function daftarKeperluanMcb_(rows) { return daftarMasterTeks_(rows || masterTeksRows_('db_Keperluan_MCB'), 'keperluan'); }

/** Keperluan isian -> ejaan master, selain itu KEPERLUAN_TIDAK_VALID. Dipakai tiap kali keperluan diketik (pemakaian, susulan, koreksi). */
function keperluanBakuMcb_(keperluan, daftar) { return bakuMasterTeks_(keperluan, daftar || daftarKeperluanMcb_(), 'KEPERLUAN_TIDAK_VALID'); }

/** Merk yang sudah ada di data gudang (mutasi + pemakaian), ejaan pertama tiap merk. Sheet gudang belum dibuat = []. */
function merkTerpakaiGudang_() {
  var ada = {}, hasil = [];
  var tambah = function (v) {
    var m = String(v === null || v === undefined ? '' : v).trim();
    if (m && !ada[m.toLowerCase()]) { ada[m.toLowerCase()] = true; hasil.push(m); }
  };
  try {
    tabelGudang_('db_Material_Mutasi').rows.forEach(function (r) { tambah(r.merk); });
    tabelGudang_('db_Pemakaian_MCB').rows.forEach(function (r) { tambah(r.merk_mcb); });
  } catch (e) {
    if (!e || (e.kode !== 'SHEET_TIDAK_ADA' && e.kode !== 'CONFIG_TIDAK_VALID')) throw e;
    console.warn('db_Merk_MCB: sheet gudang belum siap (' + e.kode + '), master tidak diisi dari data gudang');
  }
  return hasil;
}

/**
 * Siapkan master merk MCB: tab db_Merk_MCB dibuat kalau belum ada, lalu DIISI SEKALI dari merk yang sudah dipakai di data gudang.
 * Tab yang sudah berisi tidak disentuh. Dipanggil ADMIN_lengkapiMaster dan ADMIN_siapkanSheetGudang (WAJIB di dalam denganLock_).
 * GUDANG_SHEET_ID kosong = dilewati. Hasil: 0 ok, 1 masalah (header tab beda dari skema, tidak diubah).
 */
function lengkapiMerkMcb_() {
  var c = cfg_();
  if (!c.GUDANG_SHEET_ID) { console.log('db_Merk_MCB: dilewati (GUDANG_SHEET_ID kosong)'); return 0; }
  if (pastikanSheetGudang_(bukaSpreadsheet_(c.MASTER_SHEET_ID), 'db_Merk_MCB', GUD_MERK_HEADER_, [], false)) return 1;
  if (typeof SpreadsheetApp !== 'undefined' && typeof SpreadsheetApp.flush === 'function') SpreadsheetApp.flush();
  var merk = tabel_('MASTER_SHEET_ID', 'db_Merk_MCB');
  if (merk.rows.length) { console.log('db_Merk_MCB: sudah berisi ' + merk.rows.length + ' baris, tidak diisi ulang'); return 0; }
  var pakai = merkTerpakaiGudang_().sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
  tulisBlok_(merk, [], pakai.map(function (m, i) {
    return { No: noBaris_(merk, i), merk_id: uuid_(), merk: m, aktif: true, revision: 1, diubah_pada: sekarangIso_(), diubah_oleh: 'admin-tools' };
  }));
  console.log('db_Merk_MCB: ' + pakai.length + ' merk diisi dari data gudang (tambah / nonaktifkan merk langsung di sheet)');
  return 0;
}

/* ===== guard + izin material ===== */

/** Admin gudang = ADMIN / SUPER. Dipanggil di baris pertama setiap endpoint admin (sebelum data dibaca). */
function wajibAdminGudang_(sesi) {
  if (!sesi || ['ADMIN', 'SUPER'].indexOf(sesi.role) === -1) throw new SisiError_('AKSES_DITOLAK', 'gudang material khusus admin');
}

/** Baris db_Material_Tim; sheet belum dibuat = kosong (tidak ada izin = tidak ada yang boleh), bukan galat. */
function izinMaterialRows_() {
  try { return tabel_('MASTER_SHEET_ID', 'db_Material_Tim').rows; } catch (e) { if (e && e.kode === 'SHEET_TIDAK_ADA') return []; throw e; }
}

/** Baris db_Material aktif yang boleh dipakai [timId] (satu-satunya pintu pilihan material Hartek / WO / gudang). */
function materialUntukTim_(timId) { return materialBolehTim_(tabelMaterialHartek_().rows, izinMaterialRows_(), timId); }

/* ===== mutasi, foto, validasi bersama ===== */

/** Jam server (diganti di tes). */
function sekarangMsGud_() { return Date.now(); }

var GUD_STATUS_MCB_ = ['Baru', 'Ex-Handal'];

/** Skema isian satu jenis MCB (allowlist), dipakai semua endpoint stok. */
function skemaJenisMcb_() {
  return {
    materialId: { tipe: 'uuid', wajib: true },
    daya: { tipe: 'teks', wajib: true, maks: 20 },
    merk: { tipe: 'teks', wajib: true, maks: 40 },
    statusMcb: { tipe: 'pilihan', wajib: true, pilihan: GUD_STATUS_MCB_ }
  };
}

/** Pisahkan `foto` (objek) dari isian lain supaya validasi_ (primitif saja) bisa dipakai. Hasil: { sisa, foto }. */
function pisahFoto_(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SisiError_('DATA_TIDAK_VALID');
  var sisa = {}, foto = null;
  Object.keys(data).forEach(function (k) { if (k === 'foto') foto = data[k]; else sisa[k] = data[k]; });
  return { sisa: sisa, foto: foto };
}

/**
 * Validasi foto SEBELUM lock: kosong -> null (atau FOTO_WAJIB bila wajib). Hasil: bytes JPEG tervalidasi, atau null.
 * Folder Drive privat GUDANG_FOTO_FOLDER_ID wajib ada setiap kali ada foto.
 */
function bacaFotoGudang_(foto, wajib) {
  if (foto === undefined || foto === null) {
    if (wajib) throw new SisiError_('FOTO_WAJIB');
    return null;
  }
  if (typeof foto !== 'object' || Array.isArray(foto)) throw new SisiError_('TIPE_SALAH', 'foto');
  var d = validasi_(foto, isiFotoLapangan_());
  if (!cfg_().GUDANG_FOTO_FOLDER_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'GUDANG_FOTO_FOLDER_ID');
  return bytesFotoLapangan_(d);
}

/** Tulis foto ke Drive: GUDANG_FOTO_FOLDER_ID / <bagian...> / <nama>.jpg. Tanpa bytes -> { fileId: '', link: '' }. Panggil SEBELUM menulis baris. */
function simpanFotoGudang_(bytes, bagian, penanda, nama) {
  if (!bytes) return { fileId: '', link: '' };
  return simpanFotoLapangan_(cfg_().GUDANG_FOTO_FOLDER_ID, bagian, penanda, nama, bytes);
}

function alasanWajib_(data) {
  if (!String(data && data.alasan !== undefined && data.alasan !== null ? data.alasan : '').trim()) throw new SisiError_('ALASAN_WAJIB');
}

/** Material aktif bernama (db_Material), atau MATERIAL_TIDAK_VALID. */
function materialAktifGudang_(materialId) {
  var m = tabelMaterialHartek_().rows.filter(function (r) { return String(r.material_id) === String(materialId) && isAktif_(r.aktif); })[0];
  if (!m) throw new SisiError_('MATERIAL_TIDAK_VALID', materialId);
  return m;
}

/** Tim aktif (db_Tim) atau DATA_TIDAK_DITEMUKAN. */
function timAktifAda_(timId) {
  var t = tabel_('MASTER_SHEET_ID', 'db_Tim').rows.filter(function (r) { return String(r.tim_id) === String(timId) && isAktif_(r.aktif); })[0];
  if (!t) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'tim');
  return t;
}

/**
 * Tulis baris mutasi sekaligus (satu setValues). [t] = tabelGudang_('db_Material_Mutasi') yang dibaca di dalam lock pemanggil.
 * baris: [{ jenis_mutasi, lokasi, material_id, daya, merk, status_mcb, jumlah, ref_jenis?, ref_id?, catatan?, foto?, link_foto? }].
 * Hasil: mutasi_id berurutan.
 */
function tulisMutasi_(sesi, t, baris) {
  var ms = sekarangMsGud_(), waktu = waktuWib_(ms, true), ids = [];
  var baru = baris.map(function (b, i) {
    var id = uuid_();
    ids.push(id);
    return { No: noBaris_(t, i), mutasi_id: id, waktu: waktu, jenis_mutasi: b.jenis_mutasi, lokasi: b.lokasi, material_id: b.material_id, daya: b.daya,
      merk: b.merk, status_mcb: b.status_mcb, jumlah: b.jumlah, ref_jenis: b.ref_jenis || '', ref_id: b.ref_id || '', catatan: b.catatan || '',
      foto: b.foto || '', link_foto: b.link_foto || '', dibuat_oleh: sesi.userId, dibuat_pada: waktu };
  });
  tulisBlok_(t, [], baru);
  return ids;
}

/** Satu baris db_Material_LogKoreksi. [t] = tabelGudang_('db_Material_LogKoreksi') dibaca di dalam lock. */
function tulisLogKoreksi_(sesi, t, entri) {
  var waktu = waktuWib_(sekarangMsGud_(), true);
  tulisBlok_(t, [], entri.map(function (e, i) {
    return { No: noBaris_(t, i), log_id: uuid_(), waktu: waktu, jenis_objek: e.jenis_objek, objek_id: e.objek_id, kolom: e.kolom,
      nilai_lama: e.nilai_lama, nilai_baru: e.nilai_baru, alasan: e.alasan, oleh: sesi.userId };
  }));
}

/** { materialId, daya, merk, statusMcb, jumlah } dari kunci jenis + jumlah. */
function jenisDariKunci_(kunci, jumlah) {
  var p = kunci.split('|');
  return { materialId: p[0], daya: p[1], merk: p[2], statusMcb: p[3], jumlah: jumlah };
}

function kunciDariIsian_(d) {
  return kunciJenis_({ material_id: d.materialId, daya: d.daya, merk: d.merk, status_mcb: d.statusMcb });
}
