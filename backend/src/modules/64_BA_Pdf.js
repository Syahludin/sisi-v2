/**
 * v0.71.0 (keputusan kvlar 9 Okt 2026): PDF Berita Acara Gardu lewat Cloud Run "sisi-pdf-engine" (STATELESS).
 *
 * Bedanya dengan v1 (ba-pdf-engine): engine tidak membaca sheet dan tidak menyentuh Drive, jadi tidak ada service
 * account key. Apps Script membaca baris Rekap_BA + foto BA dari Drive, mengirimnya ke engine (bertanda HMAC),
 * menerima bytes PDF, lalu menyimpan PDF ke Drive dan menulis Status PDF / File PDF URL / Waktu PDF / pdf_file_id.
 * Layout PDF = port engine v1 (format cetak sama).
 *
 * Script Properties:
 *   PDF_ENGINE_URL     URL Cloud Run (https://...run.app), staging dan production service terpisah
 *   PDF_ENGINE_SECRET  rahasia HMAC (>= 32 karakter), sama dengan env PDF_SECRET engine. Tidak pernah dikirim / dicatat.
 * v0.77.0: PDF disimpan satu folder dengan foto BA (67_BA_Folder.js):
 *   GARDU_FOTO_FOLDER_ID / Gardu / <No Gardu> / <YYYY-MM-DD>_<Jenis BA> / BA-Pengoperasian-<ID BA>.pdf
 *   (BA_PDF_FOLDER_ID tidak dipakai lagi).
 * PDF dibuat TERPISAH dari simpanBaGardu: PDF gagal tidak pernah membatalkan BA, bisa dibuat ulang kapan saja.
 */
var PDF_JENIS_ = {
  'Pengoperasian Trafo': { jalur: '/v2/ba/pengoperasian-trafo', awalan: 'BA-Pengoperasian-' },
  'Penggantian Trafo': { jalur: '/v2/ba/penggantian-trafo', awalan: 'BA-Penggantian-' }
};
var PDF_STATUS_ = ['BELUM', 'PROSES', 'SELESAI', 'GAGAL'];
var PDF_PROSES_DETIK_ = 360;        // = batas eksekusi Apps Script. Penanda "sedang dibuat" (cegah dua admin membuat PDF BA yang sama bersamaan)
var PDF_KODE_SEMENTARA_ = [0, 429, 502, 503, 504];

/** {url, rahasia} dari Script Properties. Rahasia dibaca di sini saja (tidak masuk cfg_ / log / jawaban). */
function konfigPdf_() {
  var p = PropertiesService.getScriptProperties();
  var url = String(p.getProperty('PDF_ENGINE_URL') || '').trim().replace(/\/+$/, '');
  var rahasia = String(p.getProperty('PDF_ENGINE_SECRET') || '');
  if (!url || !rahasia) throw new SisiError_('PDF_ENGINE_BELUM_DISET', !url ? 'PDF_ENGINE_URL' : 'PDF_ENGINE_SECRET');
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url)) throw new SisiError_('CONFIG_TIDAK_VALID', 'PDF_ENGINE_URL');
  if (rahasia.length < 32) throw new SisiError_('CONFIG_TIDAK_VALID', 'PDF_ENGINE_SECRET < 32 karakter');
  return { url: url, rahasia: rahasia };
}

/** hex HMAC-SHA256(rahasia, "<waktu>.<sha256 hex body>"), sama dengan tanda() di engine app.py. */
function tandaPdf_(rahasia, waktu, body) {
  var shaBody = bytesKeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, body, Utilities.Charset.UTF_8));
  return bytesKeHex_(Utilities.computeHmacSha256Signature(String(waktu) + '.' + shaBody, rahasia, Utilities.Charset.UTF_8));
}

/** JSON ASCII murni (non-ASCII jadi \\uXXXX): byte yang ditandatangani = byte yang dikirim, apa pun charset-nya. */
function jsonAscii_(o) {
  return JSON.stringify(o).replace(/[\u007f-\uffff]/g, function (c) { return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4); });
}

/**
 * POST bertanda ke engine. Hasil { kode, bytes, json }. Cold start (min-instances 0): health dibangunkan dulu, lalu
 * 3 percobaan untuk 0 / 429 / 502 / 503 / 504 (jeda 3 s, 6 s), sama pola v1. Selain itu langsung dikembalikan.
 */
function kirimPdfEngine_(konf, jalur, isi, opsi) {
  try { ambilUrl_(konf.url + '/', { method: 'get', muteHttpExceptions: true, followRedirects: false }, 'pdf'); } catch (eW) { /* dibangunkan saja */ }
  var body = jsonAscii_(isi), hasil = { kode: 0, bytes: null, json: null, galat: '' };
  for (var ke = 1; ke <= 3; ke++) {
    var waktu = String(Math.floor(Date.now() / 1000));
    try {
      var res = ambilUrl_(konf.url + jalur, {
        method: 'post', contentType: 'application/json', payload: body, muteHttpExceptions: true, followRedirects: false,
        headers: { 'X-SiSi-Waktu': waktu, 'X-SiSi-Tanda': tandaPdf_(konf.rahasia, waktu, body) }
      }, 'pdf');
      hasil = { kode: res.getResponseCode(), bytes: null, json: null, galat: '' };
      if (hasil.kode === 200 && opsi && opsi.teks) hasil.teks = res.getContentText();
      else if (hasil.kode === 200) hasil.bytes = res.getBlob().getBytes();
      else { try { hasil.json = JSON.parse(res.getContentText() || '{}'); } catch (eJ) { hasil.json = null; } }
    } catch (eF) {
      hasil = { kode: 0, bytes: null, json: null, galat: String((eF && eF.message) || eF).slice(0, 200) };
    }
    var kodeEngine = hasil.json && hasil.json.kode;
    var sementara = PDF_KODE_SEMENTARA_.indexOf(hasil.kode) !== -1 && kodeEngine !== 'KONFIGURASI' && kodeEngine !== 'BATAS_HARIAN';
    if (hasil.kode === 200 || !sementara || ke === 3) break;
    Utilities.sleep(ke * 3000);
  }
  return hasil;
}

/** Hasil engine -> bytes PDF, atau SisiError_ yang jelas (detail = kode HTTP / kode engine, tanpa isi BA). */
function bytesPdfEngine_(h) {
  if (h.kode === 200) {
    var b = h.bytes || [];
    if (b.length < 5 || b[0] !== 37 || b[1] !== 80 || b[2] !== 68 || b[3] !== 70) throw new SisiError_('PDF_GAGAL', 'jawaban bukan PDF');
    return b;
  }
  var kode = h.json && h.json.kode ? String(h.json.kode) : '';
  if (h.kode === 404 || kode === 'JENIS_TIDAK_ADA') throw new SisiError_('PDF_JENIS_BELUM_TERSEDIA', h.kode + ' ' + kode);
  if (h.kode === 401 || kode === 'KONFIGURASI') throw new SisiError_('PDF_ENGINE_DITOLAK', h.kode + ' ' + kode);
  if (h.kode === 0 || h.kode === 502 || h.kode === 503 || h.kode === 504 || h.kode === 429) {
    throw new SisiError_('PDF_ENGINE_TIDAK_SIAP', (h.kode || 'jaringan') + ' ' + (kode || h.galat || ''));
  }
  throw new SisiError_('PDF_GAGAL', h.kode + ' ' + kode);
}

function apakahTanggal_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }

/** Sel tanggal (Date dari Sheets / teks) -> 'yyyy-MM-dd' WIB. */
function tglSelBa_(v) {
  if (apakahTanggal_(v)) return tglJakarta_(v);
  return teksBa_(v).slice(0, 10);
}

/** Angka sel -> teks gaya Indonesia (0.5 -> "0,5"); teks apa adanya. */
function angkaPdf_(v) {
  if (typeof v === 'number' && isFinite(v)) return String(v).replace('.', ',');
  return teksBa_(v);
}

/** Waktu WIB 'yyyy-MM-dd HH:mm:ss'. */
function waktuPdfWib_(d) {
  return new Date((d || new Date()).getTime() + 7 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

/** Baris Rekap_BA -> data engine (kunci sama engine v1, jadi layout port v1 tidak berubah). */
function dataPdfBa_(r) {
  var lat = teksBa_(r.Lat), lng = teksBa_(r.Long);
  var d = {
    nomorBA: teksBa_(r['ID BA']), nomorBAFull: teksBa_(r['No BA Full']), nomorTrafo: teksBa_(r['Nama Peralatan']),
    tanggalBA: tglSelBa_(r['Tanggal BA']), tanggalPekerjaan: tglSelBa_(r['Tanggal Pekerjaan']), jenisPekerjaan: teksBa_(r['Jenis Pekerjaan']),
    penyulang: teksBa_(r.Penyulang), section: teksBa_(r.Section), koordinat: lat && lng ? lat + ', ' + lng : '',
    alamat: teksBa_(r.Alamat), kapasitas: angkaPdf_(r['Kapasitas (kVA)']), merk: teksBa_(r.Merk), nomorSeri: teksBa_(r['Nomor Seri']),
    tahun: teksBa_(r.Tahun), konstruksi: teksBa_(r.Konstruksi), jurusan: teksBa_(r['Jurusan Terpasang']),
    kepemilikan: teksBa_(r.Kepemilikan), ownerId: teksBa_(r.OwnerId), externalRef: teksBa_(r['External Reference']),
    perluasan: angkaPdf_(r['Panjang Perluasan SUTM (kmS)']), vendor: teksBa_(r['Vendor Pekerja']),
    phbMerk: teksBa_(r['Merk PHB-TR']), phbSeri: teksBa_(r['Nomor Seri PHB-TR']), phbTahun: teksBa_(r['Tahun PHB-TR']),
    petugas1: teksBa_(r['Petugas 1']), jabatan1: teksBa_(r['Jabatan Petugas 1']),
    petugas2: teksBa_(r['Petugas 2']), jabatan2: teksBa_(r['Jabatan Petugas 2']),
    mengetahui: teksBa_(r.Mengetahui), jabatanMengetahui: teksBa_(r['Jabatan Mengetahui'])
  };
  if (teksBa_(r['Jenis Pekerjaan']) === 'Penggantian Trafo') {
    Object.assign(d, {
      nomorTrafoSesudah: teksBa_(r['Nama Peralatan Sesudah']) || teksBa_(r['Nama Peralatan']),
      kapasitasSesudah: angkaPdf_(r['Kapasitas Sesudah (kVA)']),
      merkSesudah: teksBa_(r['Merk Sesudah']),
      nomorSeriSesudah: teksBa_(r['Nomor Seri Sesudah']),
      tahunSesudah: teksBa_(r['Tahun Sesudah']),
      asalTrafo: teksBa_(r['Asal Peralatan']),
      phbMerkSesudah: teksBa_(r['Merk PHB-TR Sesudah']) || teksBa_(r['Merk PHB-TR']),
      phbSeriSesudah: teksBa_(r['Nomor Seri PHB-TR Sesudah']) || teksBa_(r['Nomor Seri PHB-TR']),
      phbTahunSesudah: teksBa_(r['Tahun PHB-TR Sesudah']) || teksBa_(r['Tahun PHB-TR']),
      jurusanSesudah: teksBa_(r['Jurusan Terpasang Sesudah']) || teksBa_(r['Jurusan Terpasang'])
    });
  }
  return d;
}

/** Foto BA (foto_meta {slot: {fileId}}) -> {slot: base64}. Foto hilang / bukan JPEG dilewati (engine beri kotak kosong). */
function fotoPdfBa_(r, jenis) {
  var meta = {};
  try { meta = JSON.parse(teksBa_(r.foto_meta) || '{}') || {}; } catch (e) { meta = {}; }
  var hasil = {}, hilang = [];
  (BA_SLOT_FOTO_[jenis] || []).forEach(function (s) {
    var id = meta[s.slot] && meta[s.slot].fileId;
    if (!id) { if (s.wajib !== false) hilang.push(s.label); return; }
    try {
      var f = DriveApp.getFileById(String(id));
      if (String(f.getMimeType()) !== 'image/jpeg') { hilang.push(s.label); return; }
      var b = f.getBlob().getBytes();
      if (!b.length || b.length > FOTO_MAKS_BYTE_) { hilang.push(s.label); return; }
      hasil[s.slot] = Utilities.base64Encode(b);
    } catch (eF) { hilang.push(s.label); }
  });
  return { foto: hasil, hilang: hilang };
}

function namaFilePdfBa_(awalan, idBa) {
  return awalan + String(idBa || 'BA').replace(/[\\\/:*?"<>|\x00-\x1f]+/g, '-').slice(0, 80) + '.pdf';
}

/** PDF wajib tidak terbagi lewat link (akses lewat izin folder). Tidak bisa dikunci = file dibuang + ditolak. */
function pastikanPdfPrivat_(file) {
  try { pastikanFotoPrivat_(file, true); } catch (e) {
    if (e && e.kode === 'FOTO_TIDAK_PRIVAT') throw new SisiError_('PDF_TIDAK_PRIVAT', e.detail);
    throw e;
  }
}

function urlPdf_(fileId) { return 'https://drive.google.com/file/d/' + fileId + '/view'; }

function jawabPdf_(r) {
  return {
    baId: String(r.ba_id), idBa: teksBa_(r['ID BA']), statusPdf: teksBa_(r['Status PDF']) || 'BELUM',
    urlPdf: teksBa_(r['File PDF URL']), fileId: teksBa_(r.pdf_file_id),
    waktuPdf: apakahTanggal_(r['Waktu PDF']) ? waktuPdfWib_(r['Waktu PDF']) : teksBa_(r['Waktu PDF'])
  };
}

/**
 * buatPdfBaGardu {baId} -> { baId, idBa, statusPdf: SELESAI, urlPdf, fileId, waktuPdf, namaFile, fotoHilang }.
 * Buat ulang = PDF baru, file lama dibuang SESUDAH baris menunjuk file baru. Gagal = Status PDF GAGAL (BA tetap utuh).
 */
function buatPdfBaGardu_(sesi, data) {
  wajibAdminBa_(sesi);
  var d = validasi_(data, { baId: { tipe: 'uuid', wajib: true } });
  var konf = konfigPdf_();
  var awal = barisBa_(cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA').rows, d.baId);
  if (!awal) throw new SisiError_('BA_TIDAK_DITEMUKAN', d.baId);
  if (teksBa_(awal['Status BA']).toUpperCase() === 'BATAL') throw new SisiError_('BA_SUDAH_BATAL', teksBa_(awal['ID BA']));
  var jenis = teksBa_(awal['Jenis Pekerjaan']), j = PDF_JENIS_[jenis];
  if (!j) throw new SisiError_('PDF_JENIS_BELUM_TERSEDIA', jenis);
  var cache = CacheService.getScriptCache(), kunci = 'pdfba:' + d.baId;
  var tandai = function (u) {
    return denganLock_(function () {
      var t = cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA');
      var x = barisBa_(t.rows, d.baId);
      if (!x) throw new SisiError_('BA_TIDAK_DITEMUKAN', d.baId);
      var lama = teksBa_(x.pdf_file_id);
      var uu = typeof u === 'function' ? u(x) : u;
      tulisBlok_(t, [{ r: x, u: Object.assign({ 'Timestamp Update': sekarangIso_(), diubah_oleh: sesi.userId || sesi.username || '' }, uu) }], [],
        { bolehId: ['pdf_file_id'] });
      return { baris: x, fileLama: lama };
    });
  };

  // PROSES (atomik di dalam lock): admin lain / ketukan ganda ditolak selama PDF_PROSES_DETIK_
  denganLock_(function () {
    if (cache.get(kunci)) throw new SisiError_('PDF_SEDANG_DIBUAT', teksBa_(awal['ID BA']));
    cache.put(kunci, '1', PDF_PROSES_DETIK_);
  });
  try {
    tandai({ 'Status PDF': 'PROSES', 'Waktu PDF': waktuPdfWib_() });
    var foto = fotoPdfBa_(awal, jenis);
    var bytes;
    try {
      bytes = bytesPdfEngine_(kirimPdfEngine_(konf, j.jalur, { versi: 1, idBa: teksBa_(awal['ID BA']), data: dataPdfBa_(awal), foto: foto.foto }));
    } catch (eE) {
      try { tandai({ 'Status PDF': 'GAGAL', 'Waktu PDF': waktuPdfWib_() }); } catch (eT) { /* status tetap PROSES, kedaluwarsa sendiri */ }
      auditLog_(sesi, 'BA_GARDU_PDF_GAGAL', teksBa_(awal['ID BA']), (eE && (eE.kode + ' ' + (eE.detail || ''))) || String(eE), 'MOBILE');
      throw eE;
    }
    var nama = namaFilePdfBa_(j.awalan, awal['ID BA']);
    var folder = folderBa_(awal);   // v0.77.0: satu folder dengan foto BA
    var file = folder.createFile(Utilities.newBlob(bytes, 'application/pdf', nama));
    try { file.setDescription('sisi-ba-pdf:' + d.baId); } catch (eD) { /* tanpa penanda */ }
    pastikanPdfPrivat_(file);
    var waktu = waktuPdfWib_();
    var tulis;
    try {
      tulis = tandai(function (x) {
        var uPdf = { 'Status PDF': 'SELESAI', 'File PDF URL': urlPdf_(file.getId()), 'Waktu PDF': waktu, pdf_file_id: file.getId() };
        // v0.78.0: PDF baru sesudah BA TTD diupload = TTD lama tidak berlaku, wajib upload ulang
        if (teksBa_(x.ttd_file_id)) uPdf['Status TTD'] = 'TTD ULANG';
        return uPdf;
      });
    } catch (eS) {
      try { file.setTrashed(true); } catch (eX) { /* dibiarkan */ }   // baris tidak menunjuk file ini = jangan tinggalkan yatim
      throw eS;
    }
    if (tulis.fileLama && tulis.fileLama !== file.getId()) {
      try { DriveApp.getFileById(tulis.fileLama).setTrashed(true); } catch (eL) { /* sudah tidak ada */ }
    }
    rapikanSesudahBa_(tulis.baris);   // v0.77.0: foto BA lama (folder sebelum v0.77.0) ikut pindah
    auditLog_(sesi, 'BA_GARDU_PDF', teksBa_(awal['ID BA']), jenis + (tulis.fileLama ? ' (buat ulang)' : '') +
      (foto.hilang.length ? ', foto kosong: ' + foto.hilang.join(', ') : ''), 'MOBILE');
    return Object.assign(jawabPdf_(tulis.baris), { namaFile: nama, fotoHilang: foto.hilang });
  } finally {
    cache.remove(kunci);
  }
}

/**
 * getDaftarBaGardu {cari?, batas?, urut?, dari?, sampai?, jenis?, tahap?} -> { jumlah, ringkasan: {tahap: n}, isi: [{baId, idBa,
 * noBaFull, jenis, noGardu, tanggalBa, penyulang, statusBa, statusPdf, urlPdf, waktuPdf, pdfBisa, tahap, statusTtd, ...}] }.
 * v0.78.0: urut TERBARU (default) / TERLAMA menurut Tanggal BA lalu No; rentang Tanggal BA dari..sampai; jenis BA;
 * tahap (DRAFT | PROSES_TTD | TTD_ULANG | SELESAI_TTD | BATAL). ringkasan dihitung SEBELUM filter tahap (angka di chip).
 * Khusus admin, hanya baca.
 */
function getDaftarBaGardu_(sesi, data) {
  wajibAdminBa_(sesi);
  var d = validasi_(data || {}, {
    cari: { tipe: 'teks', maks: 60 }, batas: { tipe: 'angka', bulat: true, min: 1, max: 200 },
    urut: { tipe: 'pilihan', pilihan: ['TERBARU', 'TERLAMA'] }, dari: { tipe: 'tanggal' }, sampai: { tipe: 'tanggal' },
    jenis: { tipe: 'pilihan', pilihan: BA_JENIS_PEKERJAAN_.TRAFO.concat(BA_JENIS_PEKERJAAN_.SWITCHING) },
    tahap: { tipe: 'pilihan', pilihan: BA_TAHAP_ },
    // v0.86.0: V2 (default, app lama) | V1 (arsip BA v1, baca saja) | SEMUA (satu halaman, urut tanggal)
    sumber: { tipe: 'pilihan', pilihan: ['V2', 'V1', 'SEMUA'] }, mulai: { tipe: 'angka', bulat: true, min: 0, max: 100000 }
  });
  if (d.dari && d.sampai && d.dari > d.sampai) throw new SisiError_('TANGGAL_TIDAK_VALID', 'dari sesudah sampai');
  var cari = teksBa_(d.cari).toLowerCase(), noCari = parseNoGarduLama_(d.cari), batas = d.batas || 50, sumber = d.sumber || 'V2';
  // cari no gardu ditulis bebas (tb414 / TB-0414 = TB0414) atau potongan teks kolom lain
  var cocok = function (nama, kolom) {
    if (!cari) return true;
    if (noCari && teksBa_(nama).toUpperCase() === noCari.nomor) return true;
    return kolom.some(function (v) { return teksBa_(v).toLowerCase().indexOf(cari) !== -1; });
  };
  var dalamTanggal = function (tgl) { return !(d.dari && !(tgl >= d.dari)) && !(d.sampai && !(tgl <= d.sampai)); };
  var semua = [];
  if (sumber !== 'V1') {
    cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA').rows.forEach(function (r) {
      if (!r.ba_id) return;
      var tgl = tglSelBa_(r['Tanggal BA']);
      if (!dalamTanggal(tgl)) return;
      if (d.jenis && teksBa_(r['Jenis Pekerjaan']) !== d.jenis) return;
      if (!cocok(r['Nama Peralatan'], [r['Nama Peralatan'], r['ID BA'], r['No BA Full'], r.Penyulang, r['Jenis Pekerjaan']])) return;
      semua.push({ tgl: tgl, urut: Number(r.No) || 0, v1: false, tahap: tahapBa_(r), r: r });
    });
  }
  var arsip = sumber === 'V2' ? null : bacaArsipBa_();
  (arsip || []).forEach(function (r) {
    var tgl = tglSelBa_(r['Tanggal BA']);
    if (!dalamTanggal(tgl)) return;
    if (d.jenis && teksBa_(r['Jenis Pekerjaan']).toLowerCase() !== d.jenis.toLowerCase()) return;
    if (!cocok(r['Nama Peralatan'], [r['Nama Peralatan'], r['ID BA'], r['No BA Full'], r.Penyulang, r.Section, r['Jenis Pekerjaan'], r.Alamat])) return;
    semua.push({ tgl: tgl, urut: Number(r['Baris Sumber']) || 0, v1: true, tahap: teksBa_(r.Tahap) || 'DRAFT', r: r });
  });
  var ringkasan = {};
  BA_TAHAP_.forEach(function (t) { ringkasan[t] = 0; });
  semua.forEach(function (x) { if (ringkasan[x.tahap] !== undefined) ringkasan[x.tahap]++; });
  if (d.tahap) semua = semua.filter(function (x) { return x.tahap === d.tahap; });
  var arah = d.urut === 'TERLAMA' ? 1 : -1;
  semua.sort(function (a, b) {
    if (a.tgl !== b.tgl) return a.tgl < b.tgl ? -arah : arah;
    if (a.v1 !== b.v1) return (a.v1 ? -1 : 1) * arah;   // tanggal sama: arsip v1 dianggap lebih dulu
    return (a.urut - b.urut) * arah;
  });
  var mulai = d.mulai || 0;
  return {
    jumlah: semua.length, ringkasan: ringkasan, arsipAda: !!arsip,
    arsipDiperbarui: arsip ? teksBa_(PropertiesService.getScriptProperties().getProperty('ARSIP_BA_DIPERBARUI')) : '',
    isi: semua.slice(mulai, mulai + batas).map(function (x) {
      if (x.v1) return itemDaftarArsipBa_(x.r);
      var r = x.r;
      return Object.assign(jawabPdf_(r), {
        noBaFull: teksBa_(r['No BA Full']), jenis: teksBa_(r['Jenis Pekerjaan']), noGardu: teksBa_(r['Nama Peralatan']),
        tanggalBa: tglSelBa_(r['Tanggal BA']), penyulang: teksBa_(r.Penyulang), statusBa: teksBa_(r['Status BA']) || 'AKTIF',
        pdfBisa: !!PDF_JENIS_[teksBa_(r['Jenis Pekerjaan'])] && teksBa_(r['Status BA']).toUpperCase() !== 'BATAL'
      }, infoTtdBa_(r));
    })
  };
}

/** Editor Apps Script (pemilik): uji URL + rahasia engine tanpa membuat PDF. */
function ADMIN_cekPdfEngine() {
  pastikanPemilik_();
  var konf = konfigPdf_();
  var t0 = Date.now();
  var h = kirimPdfEngine_(konf, '/v2/cek', {}, { teks: true });
  var ms = Date.now() - t0;
  if (h.kode === 200) {
    var j = {};
    try { j = JSON.parse(h.teks || '{}'); } catch (e) { j = {}; }
    console.log('PDF engine OK (' + ms + ' ms): ' + (j.engine || '?') + ' v' + (j.versi || '?') + ', jenis: ' + (j.jenis || []).join(', '));
    return;
  }
  var kode = h.json && h.json.kode ? h.json.kode : (h.galat || '');
  if (h.kode === 401) console.error('PDF engine MENOLAK tanda (' + kode + '): PDF_ENGINE_SECRET beda dengan PDF_SECRET engine, atau jam selisih > 5 menit.');
  else if (kode === 'KONFIGURASI') console.error('PDF engine belum punya PDF_SECRET (env Cloud Run). Deploy ulang dengan deploy.sh.');
  else console.error('PDF engine tidak bisa dihubungi: HTTP ' + h.kode + ' ' + kode + ' (cek URL / Logs Cloud Run).');
}
