/**
 * uploadFotoRow (PRD 6. Endpoint > uploadFotoRow, 4. Fitur > F-ROW-FOTO). Keputusan 3 Okt 2026:
 *  - 1 foto per kiriman (base64 JPEG), tanpa chunk. HP kompres (sisi terpanjang 1600 px, kualitas 80).
 *    Server menolak bukan JPEG, > 2 MB, atau sisi terpanjang > 2048 px.
 *  - Idempoten: foto_id sama = DUPLIKAT. Sebelum membuat file, cek nama <foto_id>.jpg di folder tujuan
 *    (upload terputus tidak meninggalkan file kembar). SHA-256 & ukuran dihitung ulang server.
 *  - Ganti foto: foto AKTIF lama di slot yang sama jadi BATAL, file lama tidak dihapus.
 *  - Foto TIDAK menaikkan revision eksekusi (supaya ubah yang antre di HP tidak konflik).
 *  - Hanya eksekusi AKTIF milik tim sesi, tanggal dalam 7 hari.
 *  - Folder (3 Okt 2026): Foto/YYYY/MM/DD/<Tim>/<Penyulang>/<Kode Eksekusi>/<foto_id>.jpg.
 *    Tim = kolom Tim eksekusi (sub-tim), Penyulang = nama resmi di realisasi. Kode Eksekusi lengkap
 *    (bukan EKS.xxx saja) supaya header BATAL + header baru di hari yang sama tidak berbagi folder.
 *  - Watermark dibakar di HP (v0.28) untuk foto KAMERA (landscape wajib); server menyimpan file apa adanya.
 */
var FOTO_MAKS_BYTE_ = 2 * 1024 * 1024;
var FOTO_MAKS_SISI_ = 2048;
var SLOT_FOTO_ = { SEBELUM: 'Foto Sebelum', PEKERJAAN: 'Foto Pekerjaan', SESUDAH: 'Foto Sesudah' };

/** Lebar/tinggi dari marker SOF JPEG. null = bukan JPEG valid. */
function ukuranJpeg_(b) {
  var u = function (i) { return b[i] & 0xff; };
  if (b.length < 4 || u(0) !== 0xFF || u(1) !== 0xD8 || u(2) !== 0xFF) return null;
  var i = 2;
  while (i + 8 < b.length) {
    if (u(i) !== 0xFF) { i++; continue; }
    var m = u(i + 1);
    if (m === 0xFF) { i++; continue; }
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    var len = (u(i + 2) << 8) | u(i + 3);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { tinggi: (u(i + 5) << 8) | u(i + 6), lebar: (u(i + 7) << 8) | u(i + 8) };
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

/** Folder anak berdasarkan nama (buat kalau belum ada). ID di-cache 6 jam. */
function folderFoto_(akarId, bagian) {
  var cache = CacheService.getScriptCache();
  var kunci = 'folder:' + akarId + ':' + bagian.join('/');
  var ada = cache.get(kunci);
  if (ada) {
    try { return DriveApp.getFolderById(ada); } catch (e) { cache.remove(kunci); }
  }
  var f = DriveApp.getFolderById(akarId);
  bagian.forEach(function (nama) {
    var it = f.getFoldersByName(nama);
    f = it.hasNext() ? it.next() : f.createFolder(nama);
  });
  cache.put(kunci, f.getId(), 21600);
  return f;
}

/** Nama folder aman: tanpa / \ dan karakter kontrol, spasi dirapikan, kosong = '_'. */
function namaFolderFoto_(teks) {
  var t = String(teks === undefined || teks === null ? '' : teks).replace(/[\/\\\x00-\x1f]+/g, '-')
    .replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 100) : '_';
}

/** Bagian path folder foto satu eksekusi (dipakai upload dan migrasi). */
function pathFotoEksekusi_(eks) {
  var tanggal = tanggalDariKode_(eks['Kode Eksekusi']);
  return [tanggal.slice(0, 4), tanggal.slice(5, 7), tanggal.slice(8, 10),
          namaFolderFoto_(eks.Tim), namaFolderFoto_(eks.Penyulang), namaFolderFoto_(eks['Kode Eksekusi'])];
}

function uploadFotoRow_(sesi, data, platform) {
  var d = validasi_(data, {
    fotoId: { tipe: 'uuid', wajib: true },
    eksekusiId: { tipe: 'uuid', wajib: true },
    slot: { tipe: 'pilihan', wajib: true, pilihan: ['SEBELUM', 'PEKERJAAN', 'SESUDAH'] },
    sumberFoto: { tipe: 'pilihan', wajib: true, pilihan: ['KAMERA', 'GALERI'] },
    mime: { tipe: 'pilihan', wajib: true, pilihan: ['image/jpeg'] },
    sha256: { tipe: 'teks', wajib: true, maks: 64, pola: /^[0-9a-f]{64}$/ },
    ukuranByte: { tipe: 'angka', wajib: true, bulat: true, min: 1, max: FOTO_MAKS_BYTE_ },
    data: { tipe: 'teks', wajib: true, maks: Math.ceil(FOTO_MAKS_BYTE_ / 3) * 4 + 4 },
    diambilPada: { tipe: 'waktu' },
    lat: { tipe: 'angka', min: -90, max: 90 },
    lng: { tipe: 'angka', min: -180, max: 180 },
    akurasiM: { tipe: 'angka', min: 0, max: 100000 },
    waktuPerangkat: { tipe: 'waktu' }
  });
  if (sesi.jenisTim !== 'ROW' || !sesi.timId) throw new SisiError_('AKSES_DITOLAK', 'bukan petugas ROW');
  var c = cfg_();
  if (!c.ROW_SHEET_ID || !c.ROW_FOTO_FOLDER_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'ROW_SHEET_ID/ROW_FOTO_FOLDER_ID');

  // Cek file dulu, di luar lock (murni hitung).
  var bytes;
  try { bytes = Utilities.base64Decode(d.data); } catch (e) { throw new SisiError_('FORMAT_SALAH', 'data'); }
  if (bytes.length > FOTO_MAKS_BYTE_) throw new SisiError_('FOTO_TERLALU_BESAR', bytes.length);
  if (bytes.length !== d.ukuranByte) throw new SisiError_('FOTO_RUSAK', 'ukuran');
  if (bytesKeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)) !== d.sha256) {
    throw new SisiError_('FOTO_RUSAK', 'sha256');
  }
  var dim = ukuranJpeg_(bytes);
  if (!dim) throw new SisiError_('FORMAT_FOTO_SALAH');
  if (Math.max(dim.lebar, dim.tinggi) > FOTO_MAKS_SISI_) throw new SisiError_('FOTO_TERLALU_BESAR', dim.lebar + 'x' + dim.tinggi);

  var waktu = waktuRow_();
  var sekarang = waktu.sekarang;

  return denganLock_(function () {
    var w = stopwatch_();
    // 1) semua baca
    var master = masterRow_();
    var T = bacaJendelaRow_(waktu);
    var F = jendelaRow_('foto', waktu.cutoff);
    var logT = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    w('baca');
    var ctx = konteksSync_(T, master, sesi, c, waktu);

    var lama = F.rows.filter(function (r) { return String(r.foto_id) === d.fotoId; })[0];
    if (lama) {
      if (String(lama.eksekusi_id) !== d.eksekusiId || String(lama.slot) !== d.slot) throw new SisiError_('ID_DIPAKAI');
      var eLama = ctx.byId.eksekusi[d.eksekusiId];
      return { status: 'DUPLIKAT', fotoId: d.fotoId, slot: d.slot, fotoLengkap: !!eLama && isAktif_(eLama.foto_lengkap) };
    }
    var eks = ctx.byId.eksekusi[d.eksekusiId];
    if (!eks) throw new SisiError_('DATA_TIDAK_DITEMUKAN', d.eksekusiId);
    var hdr = headerDari_(ctx, 'eksekusi', eks);
    if (!hdr || String(hdr.tim_id) !== sesi.timId) throw new SisiError_('BUKAN_MILIK_TIM');
    var tanggal = tanggalDariKode_(eks['Kode Eksekusi']);
    if (!dalamBatasTanggal_(ctx, tanggal)) throw new SisiError_('DATA_TERKUNCI');
    if (eks.status !== 'AKTIF') throw new SisiError_('SUDAH_BATAL');

    // 2) Drive: folder + file (cek nama dulu supaya tidak kembar)
    var folder = folderFoto_(c.ROW_FOTO_FOLDER_ID, pathFotoEksekusi_(eks));
    var namaFile = d.fotoId + '.jpg';
    var adaFile = folder.getFilesByName(namaFile);
    var file = adaFile.hasNext() ? adaFile.next() : folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', namaFile));
    var url = 'https://drive.google.com/file/d/' + file.getId() + '/view';
    w('drive');

    // 3) semua tulis sheet
    F.rows.filter(function (r) {
      return String(r.eksekusi_id) === d.eksekusiId && String(r.slot) === d.slot && r.status === 'AKTIF';
    }).forEach(function (r) {
      ubahBarisDikenal_(F, r, { status: 'BATAL', diubah_oleh: sesi.userId, 'Timestamp Update': sekarang });
    });
    var baru = {
      foto_id: d.fotoId, eksekusi_id: d.eksekusiId, slot: d.slot, drive_file_id: file.getId(), sha256: d.sha256,
      ukuran_byte: bytes.length, mime: d.mime, sumber_foto: d.sumberFoto, diambil_pada: d.diambilPada || '',
      lat: d.lat === undefined ? '' : d.lat, lng: d.lng === undefined ? '' : d.lng, akurasi_m: d.akurasiM === undefined ? '' : d.akurasiM,
      Timestamp: sekarang, 'Timestamp Update': sekarang, status: 'AKTIF', revision: 1,
      dibuat_oleh: sesi.userId, waktu_perangkat: d.waktuPerangkat || '', diubah_oleh: sesi.userId
    };
    F.sheet.getRange(F.akhir + 1, 1, 1, F.header.length).setValues([barisDariObjek_(F.header, baru)]);
    F.rows.push(baru);

    var slotAktif = {};
    F.rows.forEach(function (r) {
      if (String(r.eksekusi_id) === d.eksekusiId && r.status === 'AKTIF') slotAktif[String(r.slot)] = true;
    });
    var lengkap = Object.keys(SLOT_FOTO_).every(function (s) { return slotAktif[s]; });
    var kol = SLOT_FOTO_[d.slot];
    eks._ubah = eks._ubah || {};
    eks._ubah[kol] = namaFile; eks._ubah[kol + ' URL'] = url;
    eks._ubah.foto_lengkap = lengkap; eks._ubah['Timestamp Update'] = sekarang;   // revision TIDAK naik
    Object.keys(eks._ubah).forEach(function (k) { eks[k] = eks._ubah[k]; });
    ctx.kotorRealisasi[String(eks.realisasi_id)] = true;
    hitungUlangRealisasi_(ctx);
    hitungUlangWa_(ctx);
    tulisSync_(ctx);
    auditLog_(sesi, 'UPLOAD_FOTO', String(eks['Kode Eksekusi']), d.slot + ' ' + d.fotoId, platform, logT);
    w('tulis');
    var hasil = { status: 'OK', fotoId: d.fotoId, slot: d.slot, fotoLengkap: lengkap };
    if (c.ENV === 'staging') hasil._waktu = w.ringkas();
    return hasil;
  });
}

/**
 * Alat editor: audit folder Foto ROW. Laporkan jumlah file, file/folder yang aksesnya BUKAN "Dibatasi"
 * (PRIVATE), dan nama file kembar (tanda upload ganda). Hanya baca, tidak mengubah apa pun.
 */
function ADMIN_cekAclFoto() {
  pastikanPemilik_();
  var akar = DriveApp.getFolderById(cfg_().ROW_FOTO_FOLDER_ID);
  var jumlah = 0, terbuka = [], nama = {}, kembar = [];
  var cek = function (obj, jalur) {
    var a = obj.getSharingAccess();
    if (a !== DriveApp.Access.PRIVATE) terbuka.push(jalur + ' -> ' + a + ' / ' + obj.getSharingPermission());
  };
  var jalan = function (f, jalur) {
    cek(f, jalur + '/');
    var files = f.getFiles();
    while (files.hasNext()) {
      var x = files.next(), n = x.getName();
      jumlah++;
      cek(x, jalur + '/' + n);
      if (nama[n]) kembar.push(jalur + '/' + n); else nama[n] = true;
    }
    var sub = f.getFolders();
    while (sub.hasNext()) { var s = sub.next(); jalan(s, jalur + '/' + s.getName()); }
  };
  jalan(akar, 'Foto');
  console.log('Jumlah file foto: ' + jumlah);
  console.log(terbuka.length ? 'TIDAK PRIVATE (' + terbuka.length + '):\n' + terbuka.join('\n') : 'Akses umum: SEMUA Dibatasi (private)');
  console.log(kembar.length ? 'NAMA FILE KEMBAR (' + kembar.length + '):\n' + kembar.join('\n') : 'Tidak ada file kembar');
}

/**
 * getFotoRow (PRD 6. Endpoint > getFotoRow). Keputusan 3 Okt 2026: tombol "Download ulang foto" di detail eksekusi.
 *  - Tanpa slot: daftar foto AKTIF eksekusi itu (metadata saja, tanpa isi file).
 *  - Dengan slot: 1 foto + isi base64 (1 foto per panggilan supaya HP bisa tampilkan progres & tidak timeout).
 *  - Hanya baca, tanpa lock. Jendela 7 hari (sama dengan data yang disimpan di HP).
 *  - PETUGAS hanya tim sendiri; ADMIN / ADMIN_ES / SUPER semua tim (akses menu sudah dicek guard).
 *  - File diambil dari drive_file_id di row_Foto; sha256 dikirim supaya HP bisa memverifikasi.
 */
/**
 * v0.47 (audit 4 Okt 2026): drive_file_id di sheet tidak dipercaya begitu saja. File wajib gambar dan SHA-256 isinya
 * wajib sama dengan kolom sha256 baris foto; kalau tidak = FOTO_TIDAK_VALID (mis. ID diarahkan ke file Drive lain).
 */
function bytesFotoTerverifikasi_(fileId, shaHarapan) {
  var file;
  try { file = DriveApp.getFileById(String(fileId || '')); } catch (e) { throw new SisiError_('FOTO_TIDAK_ADA', 'file Drive'); }
  if (String(file.getMimeType() || '').indexOf('image/') !== 0) throw new SisiError_('FOTO_TIDAK_VALID', 'mime');
  var bytes = file.getBlob().getBytes();
  var sha = bytesKeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes));
  if (!shaHarapan || sha !== String(shaHarapan).trim().toLowerCase()) throw new SisiError_('FOTO_TIDAK_VALID', 'sha256');
  return { bytes: bytes, sha256: sha };
}

function getFotoRow_(sesi, data) {
  var d = validasi_(data, {
    eksekusiId: { tipe: 'uuid', wajib: true },
    slot: { tipe: 'pilihan', pilihan: ['SEBELUM', 'PEKERJAAN', 'SESUDAH'] }
  });
  var c = cfg_();
  if (!c.ROW_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'ROW_SHEET_ID');
  var timFilter = timLaporan_(sesi, null);
  var w = stopwatch_();
  var waktu = waktuRow_();
  var T = bacaJendelaRow_(waktu);
  var F = jendelaRow_('foto', waktu.cutoff);
  w('baca');
  var ctx = konteksSync_(T, null, sesi, c, waktu);
  var eks = ctx.byId.eksekusi[d.eksekusiId];
  if (!eks) throw new SisiError_('DATA_TIDAK_DITEMUKAN', d.eksekusiId);
  var hdr = headerDari_(ctx, 'eksekusi', eks);
  if (!hdr || (timFilter && String(hdr.tim_id) !== timFilter)) throw new SisiError_('BUKAN_MILIK_TIM');
  var aktif = F.rows.filter(function (r) {
    return String(r.eksekusi_id) === d.eksekusiId && r.status === 'AKTIF' && (!d.slot || String(r.slot) === d.slot);
  });
  var meta = function (r) {
    return { fotoId: String(r.foto_id), slot: String(r.slot), sha256: String(r.sha256 || ''),
             ukuranByte: Number(r.ukuran_byte) || 0, dibuat: r.Timestamp ? String(r.Timestamp) : '' };
  };
  var hasil;
  if (!d.slot) {
    hasil = { eksekusiId: d.eksekusiId, kodeEksekusi: String(eks['Kode Eksekusi']), foto: aktif.map(meta) };
  } else {
    if (!aktif.length) throw new SisiError_('FOTO_TIDAK_ADA', d.slot);
    var r = aktif[aktif.length - 1];
    var bytes = bytesFotoTerverifikasi_(r.drive_file_id, r.sha256).bytes;
    var m = meta(r);
    m.ukuranByte = bytes.length;
    m.mime = 'image/jpeg';
    m.data = Utilities.base64Encode(bytes);
    hasil = { eksekusiId: d.eksekusiId, kodeEksekusi: String(eks['Kode Eksekusi']), foto: [m] };
  }
  w('drive');
  if (c.ENV === 'staging') hasil._waktu = w.ringkas();
  return hasil;
}
