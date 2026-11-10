/**
 * v0.77.0 (permintaan Master Guswan 10 Okt 2026): foto BA + PDF BA digabung dalam SATU folder per gardu, supaya semua
 * dokumen satu gardu tertracking di satu tempat:
 *
 *   GARDU_FOTO_FOLDER_ID / Gardu / <No Gardu> / <YYYY-MM-DD>_<Jenis BA> /
 *       <No Gardu>_<Bagian Foto>.jpg   (Nameplate Trafo, Foto Full Gardu, Nameplate PHB-TR, Box PHB-TR)
 *       BA-Pengoperasian-<ID BA>.pdf
 *
 * Tanggal = Tanggal BA. Nomor gardu BA baru baru final saat simpanBaGardu (pesanan bisa hangus = NOMOR_GARDU_BERUBAH),
 * jadi foto yang dikirim SEBELUM simpan masuk dulu ke Gardu / _Upload Sementara / <baId>. Sesudah BA tersimpan,
 * foto dipindah (moveTo, ID file tetap = link di Rekap_BA tetap) + diberi nama rapi, folder sementara dibuang.
 * Foto pengganti (edit BA) langsung masuk folder BA karena nomornya sudah tetap. PDF dibuat langsung di folder BA.
 * Pindah gagal tidak pernah membatalkan BA: dirapikan lagi saat PDF dibuat / ADMIN_rapikanFolderBaGardu.
 * BA_PDF_FOLDER_ID tidak dipakai lagi.
 */
var BA_FOLDER_AKAR_ = 'Gardu';
var BA_FOLDER_UPLOAD_ = '_Upload Sementara';
var BA_FOLDER_LAMA_ = 'BA Gardu';   // folder upload sebelum v0.77.0: BA Gardu / <jenis> / <baId>

function akarFolderBa_() {
  var c = cfg_();
  if (!c.GARDU_FOTO_FOLDER_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'GARDU_FOTO_FOLDER_ID');
  return c.GARDU_FOTO_FOLDER_ID;
}

/** YYYY-MM-DD dari Tanggal BA (kosong / rusak = hari ini WIB). */
function tanggalFolderBa_(r) {
  var t = tglSelBa_(r['Tanggal BA']);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : tglJakarta_(new Date());
}

function noGarduFolderBa_(r) { return namaFolderFoto_(teksBa_(r['Nama Peralatan']).toUpperCase() || 'Tanpa Nomor'); }

/** Path folder BA (untuk log / jawaban): Gardu/<No Gardu>/<YYYY-MM-DD>_<Jenis BA>. */
function jalurFolderBa_(r) {
  // v1.0.49: BA switching = Switching/<Nama Switching>/<YYYY-MM-DD>_<Jenis BA> (sama v1: per nama switching)
  if (teksBa_(r['Jenis Peralatan']).toUpperCase() === 'SWITCHING') {
    return ['Switching', namaFolderFoto_(teksBa_(r['Nama Peralatan']) || 'Tanpa Nama'), namaFolderFoto_(tanggalFolderBa_(r) + '_' + teksBa_(r['Jenis Pekerjaan']))];
  }
  return [BA_FOLDER_AKAR_, noGarduFolderBa_(r), namaFolderFoto_(tanggalFolderBa_(r) + '_' + teksBa_(r['Jenis Pekerjaan']))];
}

/** Folder BA (dibuat kalau belum ada). */
function folderBa_(r) { return folderFoto_(akarFolderBa_(), jalurFolderBa_(r)); }

/** Folder upload sementara BA yang belum tersimpan (dibuat kalau belum ada). */
function folderUploadBa_(baId) { return folderFoto_(akarFolderBa_(), [BA_FOLDER_AKAR_, BA_FOLDER_UPLOAD_, baId]); }

function dibuangDrive_(x) { try { return typeof x.isTrashed === 'function' && x.isTrashed(); } catch (e) { return false; } }

/** Cari folder TANPA membuat (null = tidak ada / sudah dibuang). */
function cariFolderBa_(bagian) {
  var f;
  try { f = DriveApp.getFolderById(akarFolderBa_()); } catch (e) { return null; }
  for (var i = 0; i < bagian.length; i++) {
    var it = f.getFoldersByName(bagian[i]), dapat = null;
    while (it.hasNext()) { var k = it.next(); if (!dibuangDrive_(k)) { dapat = k; break; } }
    if (!dapat) return null;
    f = dapat;
  }
  return f;
}

/** Folder upload BA ini: sementara v0.77.0 lalu folder lama (kiriman HP yang dimulai sebelum update). */
function folderUploadAdaBa_(jenis, baId) {
  return [cariFolderBa_([BA_FOLDER_AKAR_, BA_FOLDER_UPLOAD_, baId]), cariFolderBa_([BA_FOLDER_LAMA_, namaFolderFoto_(jenis), baId])]
    .filter(function (f) { return f; });
}

/** File foto (penanda) di salah satu folder, urut prioritas. null = tidak ada. */
function cariFotoBaDi_(folders, penanda) {
  for (var i = 0; i < folders.length; i++) {
    var f = cariFileFoto_(folders[i], penanda);
    if (f) return f;
  }
  return null;
}

function namaFileFotoBa_(r, label) {
  return (teksBa_(r['Nama Peralatan']).toUpperCase() || 'GARDU') + '_' + String(label).replace(/[\\\/:*?"<>|\x00-\x1f]+/g, '-') + '.jpg';
}

function diFolderBa_(file, idFolder) {
  var it = file.getParents();
  while (it.hasNext()) { if (it.next().getId() === idFolder) return true; }
  return false;
}

/**
 * Pindahkan foto (foto_meta) + PDF (pdf_file_id) BA ke folder BA, nama foto dirapikan. ID file tidak berubah.
 * -> { dipindah, diganti, gagal, folder }. Sudah di tempat + nama sudah rapi = tidak diubah.
 */
function rapikanFolderBa_(r) {
  var hasil = { dipindah: 0, diganti: 0, gagal: 0, folder: jalurFolderBa_(r).join('/') };
  var folder = folderBa_(r), idF = folder.getId();
  var meta = metaFotoBa_(r), daftar = [];
  slotFotoBa_(teksBa_(r['Jenis Pekerjaan'])).forEach(function (s) {
    if (meta[s.slot] && meta[s.slot].fileId) daftar.push({ id: String(meta[s.slot].fileId), nama: namaFileFotoBa_(r, s.label) });
  });
  if (teksBa_(r.pdf_file_id)) daftar.push({ id: teksBa_(r.pdf_file_id), nama: '' });
  daftar.forEach(function (x) {
    try {
      var f = DriveApp.getFileById(x.id);
      if (!diFolderBa_(f, idF)) { f.moveTo(folder); hasil.dipindah++; }
      if (x.nama && f.getName() !== x.nama) { f.setName(x.nama); hasil.diganti++; }
    } catch (e) {
      hasil.gagal++;
      console.warn('Rapikan folder BA ' + teksBa_(r['ID BA']) + ' file ' + x.id + ': ' + ((e && (e.kode || e.message)) || e));
    }
  });
  return hasil;
}

/** Buang folder upload BA ini (sementara + lama) kalau sudah kosong. -> jumlah folder dibuang. */
function bersihkanUploadBa_(jenis, baId) {
  var n = 0;
  folderUploadAdaBa_(jenis, baId).forEach(function (f) {
    try {
      var it = f.getFiles(), isi = false;
      while (it.hasNext()) { if (!dibuangDrive_(it.next())) { isi = true; break; } }
      if (!isi) { f.setTrashed(true); n++; }
    } catch (e) { /* dibiarkan */ }
  });
  return n;
}

/** Sesudah BA tersimpan / diubah / PDF dibuat. Gagal = dicatat saja (BA sudah aman di sheet). */
function rapikanSesudahBa_(r) {
  try {
    var h = rapikanFolderBa_(r);
    bersihkanUploadBa_(teksBa_(r['Jenis Pekerjaan']), String(r.ba_id));
    return h;
  } catch (e) {
    console.warn('Rapikan folder BA ' + teksBa_(r['ID BA']) + ' gagal: ' + ((e && (e.kode || e.message)) || e));
    return null;
  }
}

/**
 * Alat editor: pindahkan foto + PDF BA v2 yang sudah ada (folder lama BA Gardu / ... dan Berita Acara / Gardu / ...)
 * ke Gardu / <No Gardu> / <YYYY-MM-DD>_<Jenis BA>. ID file tetap (link Rekap_BA tetap), sheet tidak ditulis.
 * Hanya baris Rekap_BA dari app v2 (ada ba_id). Batas 270 detik: sisa = jalankan lagi. Sudah rapi = dilewati.
 */
function ADMIN_rapikanFolderBaGardu() {
  pastikanPemilik_();
  var mulai = Date.now(), BATAS = 270e3;
  var rows = cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA').rows.filter(function (r) { return r.ba_id; });
  var jml = { ba: 0, dipindah: 0, diganti: 0, gagal: 0, folderDibuang: 0 }, sisa = 0;
  for (var i = 0; i < rows.length; i++) {
    if (Date.now() - mulai > BATAS) { sisa = rows.length - i; break; }
    var r = rows[i];
    try {
      var h = rapikanFolderBa_(r);
      jml.ba++; jml.dipindah += h.dipindah; jml.diganti += h.diganti; jml.gagal += h.gagal;
      jml.folderDibuang += bersihkanUploadBa_(teksBa_(r['Jenis Pekerjaan']), String(r.ba_id));
      if (h.dipindah || h.diganti) console.log(teksBa_(r['ID BA']) + ' -> ' + h.folder + ' (' + h.dipindah + ' dipindah, ' + h.diganti + ' nama dirapikan)');
    } catch (e) {
      jml.gagal++;
      console.warn(teksBa_(r['ID BA']) + ': ' + ((e && (e.kode || e.message)) || e));
    }
  }
  console.log('Rapikan folder BA: ' + jml.ba + ' BA dicek, ' + jml.dipindah + ' file dipindah, ' + jml.diganti + ' nama foto dirapikan, ' +
    jml.folderDibuang + ' folder upload kosong dibuang, ' + jml.gagal + ' gagal' + (sisa ? '. Waktu habis, ' + sisa + ' BA belum dicek: JALANKAN LAGI.' : '.'));
  return jml;
}
