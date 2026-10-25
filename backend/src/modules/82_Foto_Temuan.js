/**
 * v1.0.18 (permintaan kvlar 22 Okt 2026): FOTO TEMUAN.
 *
 * A. ADMIN_migrasiInspeksiFoto: foto temuan hasil migrasi v1 (kolom foto_*_link berisi link AppSheet
 *    https://www.appsheet.com/image/getimageurl?...&fileName=<path>&... atau link Drive) dicari file Drive-nya
 *    (link Drive = file id; link AppSheet = path dari folder MIG_FOTO_AKAR_ID, pathFotoLama_ + fileDariPathMig_),
 *    lalu DIPINDAH ke satu folder FOTO_TEMUAN_FOLDER_ID / db_Temuan_Inspeksi, diberi nama pola ROW
 *    (<kode temuan>_<SLOT>.jpg), dan kolom foto_*_file_id + foto_*_link diisi link Drive. File asli tidak disalin
 *    (keputusan kvlar: pindah, AppSheet v1 tidak lagi bisa menampilkan foto itu). BISA DILANJUTKAN: posisi baris
 *    disimpan (Script Property), tiap jalan ~4,5 menit. Laporan: migins_Foto (SiSi_Temuan).
 * B. ADMIN_rapikanNamaFotoLapangan: file foto temuan (InsJar / InsDu / admin), Hartek (grounding / pemerataan), dan
 *    WO Tindak Lanjut yang namanya belum mengikuti pola ROW (nama acak / UUID) diganti nama <kode>_<SLOT>.jpg.
 *    Hanya nama yang diubah (lokasi, isi, dan link Drive tetap). Aman diulang.
 */

var FOTO_TEMUAN_FOLDER_ = 'db_Temuan_Inspeksi';
var FOTO_TEMUAN_POS_ = 'MIGINS_FOTO_POS';
var FOTO_TEMUAN_KOLOM_ = ['kode_temuan', 'slot', 'status', 'drive_file_id', 'pesan'];

function linkDrive_(id) { return 'https://drive.google.com/file/d/' + id + '/view'; }

/** File Drive dari isi kolom foto v1. akar = folder MIG_FOTO_AKAR_ID (null = link AppSheet tidak bisa dicari). */
function fileFotoMigIns_(fileId, link, akar, cache) {
  var id = teksMig_(fileId) || driveIdDariUrl_(link);
  if (id) {
    try {
      var f = DriveApp.getFileById(id);
      if (!(typeof f.isTrashed === 'function' && f.isTrashed())) return f;
    } catch (e) { /* lanjut cari lewat path */ }
  }
  var path = pathFotoLama_(link);
  return path && akar ? fileDariPathMig_(akar, path, cache) : null;
}

function diFolder_(file, folderId) {
  var it = file.getParents();
  while (it.hasNext()) if (String(it.next().getId()) === String(folderId)) return true;
  return false;
}

/** Satu foto migrasi: cari, pindah ke folder tujuan, ganti nama. Hasil {status, fileId, pesan}. */
function pindahFotoMigIns_(r, slot, tujuan, akar, cache) {
  var kol = INSJAR_FOTO_[slot];
  var link = teksMig_(r[kol + '_link']);
  if (!link) return null;
  var f = fileFotoMigIns_(r[kol + '_file_id'], link, akar, cache);
  if (!f) return { status: 'GAGAL', fileId: '', pesan: akar ? 'file tidak ditemukan: ' + link : 'MIG_FOTO_AKAR_ID kosong (link AppSheet)' };
  var nama = namaFotoRow_(kodeFotoTemuan_(r), slot, 1);
  if (f.getName() !== nama) f.setName(nama);
  var pindah = !diFolder_(f, tujuan.getId());
  if (pindah) f.moveTo(tujuan);
  return { status: pindah ? 'DIPINDAH' : 'SUDAH', fileId: String(f.getId()), pesan: '' };
}

function ADMIN_migrasiInspeksiFoto() {
  pastikanPemilik_();
  var mulai = Date.now();
  var p = PropertiesService.getScriptProperties();
  var akarId = String(p.getProperty('MIG_FOTO_AKAR_ID') || '').trim();
  var akar = akarId ? DriveApp.getFolderById(akarId) : null;
  if (!akar) console.warn('MIG_FOTO_AKAR_ID kosong: hanya foto berlink Drive yang bisa dipindah (link AppSheet dilewati).');
  var tujuan = folderFoto_(folderFotoTemuan_(), [FOTO_TEMUAN_FOLDER_]);
  var cache = {}, laporan = [];
  var hasil = denganLock_(function () {
    var t = tabelInsJar_(INSJAR_SHEET_.TEMUAN);
    var pos = Number(p.getProperty(FOTO_TEMUAN_POS_)) || 0;
    var out = { dipindah: 0, sudah: 0, gagal: 0, posisi: pos, terpotong: false };
    for (var i = pos; i < t.rows.length; i++) {
      if (Date.now() - mulai > MIGINS_BATAS_MS_) { out.terpotong = true; break; }
      var r = t.rows[i];
      out.posisi = i + 1;
      if (teksMig_(r.dibuat_oleh) !== MIGINS_OLEH_) continue;
      var u = {};
      Object.keys(INSJAR_FOTO_).forEach(function (slot) {
        var h;
        try { h = pindahFotoMigIns_(r, slot, tujuan, akar, cache); } catch (e) { h = { status: 'GAGAL', fileId: '', pesan: String(e.message || e) }; }
        if (!h) return;
        laporan.push([teksMig_(r.kode_temuan), slot, h.status, h.fileId, h.pesan]);
        if (h.status === 'GAGAL') { out.gagal++; return; }
        out[h.status === 'DIPINDAH' ? 'dipindah' : 'sudah']++;
        var kol = INSJAR_FOTO_[slot];
        if (teksMig_(r[kol + '_file_id']) !== h.fileId) u[kol + '_file_id'] = h.fileId;
        if (teksMig_(r[kol + '_link']) !== linkDrive_(h.fileId)) u[kol + '_link'] = linkDrive_(h.fileId);
      });
      if (Object.keys(u).length) ubahBaris_(t, 'temuan_id', r.temuan_id, u);
    }
    if (out.terpotong) p.setProperty(FOTO_TEMUAN_POS_, String(out.posisi));
    else p.deleteProperty(FOTO_TEMUAN_POS_);
    return out;
  }, 60000);
  tulisSheetMig_(bukaSpreadsheet_(cfg_().TEMUAN_SHEET_ID), 'migins_Foto', FOTO_TEMUAN_KOLOM_, laporan);
  console.log('MIGRASI FOTO TEMUAN -> ' + FOTO_TEMUAN_FOLDER_ + ': ' + JSON.stringify(hasil));
  console.log(hasil.terpotong ? 'Batas waktu: jalankan ADMIN_migrasiInspeksiFoto lagi untuk melanjutkan.' : 'MIGRASI FOTO TEMUAN SELESAI. Gagal: lihat migins_Foto.');
  return hasil;
}

/** Editor: mulai ulang ADMIN_migrasiInspeksiFoto dari baris pertama (foto yang sudah dipindah dilewati sebagai SUDAH). */
function ADMIN_migrasiInspeksiFotoUlang() {
  pastikanPemilik_();
  PropertiesService.getScriptProperties().deleteProperty(FOTO_TEMUAN_POS_);
  console.log('Posisi migrasi foto temuan dihapus.');
}

/* ===== B. rapikan nama file foto lapangan ===== */

/** Daftar tabel foto lapangan: tabel, kolom id, fungsi kode, peta SLOT -> awalan kolom. */
function tabelFotoLapangan_() {
  var c = cfg_(), daftar = [];
  if (c.TEMUAN_SHEET_ID) {
    daftar.push({ nama: 'db_temuan_inspeksi', tabel: function () { return tabelInsJar_(INSJAR_SHEET_.TEMUAN); }, id: 'temuan_id', kode: kodeFotoTemuan_, slot: INSJAR_FOTO_ });
    daftar.push({ nama: WO_TL_SHEET_, tabel: tabelTlWo_, id: 'tl_id', kode: function (r) { return teksWo_(r.kode_tl); }, slot: WO_SLOT_ });
  }
  if (c.HARTEK_SHEET_ID) {
    Object.keys(HARTEK_FOTO_).forEach(function (j) {
      var k = HARTEK_FOTO_[j];
      daftar.push({ nama: k.sheet, tabel: function () { return tabelHartek_(k.sheet); }, id: k.id, kode: function (r) { return String(r[k.kode] || '').trim(); }, slot: k.slot });
    });
  }
  return daftar;
}

/** Ganti nama file foto satu tabel ke pola ROW. uji = hanya hitung. Hasil {diganti, sudah, gagal}. */
function rapikanNamaFotoTabel_(tg, uji) {
  var out = { diganti: 0, sudah: 0, gagal: 0 };
  var t = tg.tabel();
  t.rows.forEach(function (r) {
    var kode = tg.kode(r);
    if (!kode) return;
    Object.keys(tg.slot).forEach(function (slot) {
      var id = String(r[tg.slot[slot] + '_file_id'] || '').trim();
      if (!id) return;
      var nama = namaFotoRow_(kode, slot, 1);
      try {
        var f = DriveApp.getFileById(id);
        if (f.getName() === nama) { out.sudah++; return; }
        if (!uji) f.setName(nama);
        out.diganti++;
      } catch (e) { out.gagal++; console.warn(tg.nama + ' ' + kode + ' ' + slot + ': ' + (e.message || e)); }
    });
  });
  return out;
}

function jalankanRapikanNamaFoto_(uji) {
  var hasil = {};
  tabelFotoLapangan_().forEach(function (tg) {
    try { hasil[tg.nama] = rapikanNamaFotoTabel_(tg, uji); } catch (e) {
      if (!e || (e.kode !== 'SHEET_TIDAK_ADA' && e.kode !== 'CONFIG_TIDAK_LENGKAP')) throw e;
      hasil[tg.nama] = 'dilewati (' + e.kode + ')';
    }
  });
  console.log((uji ? 'CEK (tidak mengubah) ' : '') + 'NAMA FOTO LAPANGAN -> pola <kode>_<SLOT>.jpg: ' + JSON.stringify(hasil));
  return hasil;
}

/** Editor: ganti nama file foto temuan / Hartek / WO yang belum berpola ROW. */
function ADMIN_rapikanNamaFotoLapangan() { pastikanPemilik_(); return jalankanRapikanNamaFoto_(false); }

/** Editor: lihat berapa file yang akan diganti namanya (tidak mengubah apa pun). */
function ADMIN_cekNamaFotoLapangan() { pastikanPemilik_(); return jalankanRapikanNamaFoto_(true); }
