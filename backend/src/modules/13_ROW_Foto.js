/**
 * uploadFotoRow (PRD 6. Endpoint > uploadFotoRow, 4. Fitur > F-ROW-FOTO). Keputusan 3 Okt 2026:
 *  - 1 foto per kiriman (base64 JPEG), tanpa chunk. HP kompres (sisi terpanjang 1600 px, kualitas 80).
 *    Server menolak bukan JPEG, > 2 MB, atau sisi terpanjang > 2048 px.
 *  - Idempoten: foto_id sama = DUPLIKAT. Sebelum membuat file, cari file foto_id ini di folder tujuan (nama lama
 *    <foto_id>.jpg atau deskripsi penanda sisi-foto:<foto_id>), jadi upload terputus tidak meninggalkan file kembar.
 *    SHA-256 & ukuran dihitung ulang server.
 *  - v0.64.4 (keputusan Master Guswan 8 Okt 2026): nama file = <Kode Eksekusi>_<SLOT>.jpg, foto pengganti ke-n di slot yang sama
 *    = <Kode Eksekusi>_<SLOT>_<n>.jpg. Contoh R01-16130261008001-PNY.001-EKS.003_SEBELUM.jpg. File lama bernama acak
 *    (<foto_id>.jpg) dirapikan dengan ADMIN_rapikanNamaFotoRow.
 *  - Ganti foto: foto AKTIF lama di slot yang sama jadi BATAL, file lama tidak dihapus.
 *  - Foto TIDAK menaikkan revision eksekusi (supaya ubah yang antre di HP tidak konflik).
 *  - Hanya eksekusi AKTIF milik tim sesi, tanggal dalam 7 hari.
 *  - Folder (3 Okt 2026): Foto/YYYY/MM/DD/<Tim>/<Penyulang>/<Kode Eksekusi>/<nama file>.
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
function folderFoto_(akarId, bagian, memo) {
  // memo (opsional, v0.60) = { kunci path -> Folder } untuk satu jalan: path induk yang sama tidak ditelusuri ulang.
  var cache = CacheService.getScriptCache();
  var kunciDari = function (n) { return 'folder:' + akarId + ':' + bagian.slice(0, n).join('/'); };
  var kunci = kunciDari(bagian.length);
  if (memo && memo[kunci]) return memo[kunci];
  var ada = cache.get(kunci);
  if (ada) {
    // v0.78.0: folder yang sudah dibuang (mis. folder upload sementara BA) tidak dipakai lagi dari cache
    try {
      var fc = DriveApp.getFolderById(ada);
      if (typeof fc.isTrashed === 'function' && fc.isTrashed()) throw new Error('dibuang');
      if (memo) memo[kunci] = fc;
      return fc;
    } catch (e) { cache.remove(kunci); }
  }
  var f = null, mulai = 0;
  if (memo) {
    for (var i = bagian.length - 1; i >= 1; i--) { if (memo[kunciDari(i)]) { f = memo[kunciDari(i)]; mulai = i; break; } }
  }
  if (!f) f = DriveApp.getFolderById(akarId);
  for (var j = mulai; j < bagian.length; j++) {
    var it = f.getFoldersByName(bagian[j]), anak = null;
    while (it.hasNext()) {
      var k = it.next();
      var buang = false;
      try { buang = typeof k.isTrashed === 'function' && k.isTrashed(); } catch (eT) { buang = false; }
      if (!buang) { anak = k; break; }
    }
    f = anak || f.createFolder(bagian[j]);
    if (memo) memo[kunciDari(j + 1)] = f;
  }
  cache.put(kunci, f.getId(), 21600);
  return f;
}

/** Nama folder aman: tanpa / \ dan karakter kontrol, spasi dirapikan, kosong = '_'. */
function namaFolderFoto_(teks) {
  var t = String(teks === undefined || teks === null ? '' : teks).replace(/[\/\\\x00-\x1f]+/g, '-')
    .replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 100) : '_';
}

/** v0.64.4: penanda foto_id di deskripsi file Drive (nama file tidak lagi memuat foto_id). */
var PENANDA_FOTO_ = 'sisi-foto:';

/** v0.64.4: nama file foto ROW. ke = urutan foto di slot itu (1 = pertama, 2+ = pengganti). */
function namaFotoRow_(kodeEksekusi, slot, ke) {
  var kode = String(kodeEksekusi === undefined || kodeEksekusi === null ? '' : kodeEksekusi).trim()
    .replace(/[^0-9A-Za-z._-]+/g, '_').slice(0, 120) || 'EKS';
  var n = Math.floor(Number(ke)) || 1;
  return kode + '_' + String(slot || 'FOTO').toUpperCase() + (n > 1 ? '_' + n : '') + '.jpg';
}

/** File foto ini di folder (nama lama <foto_id>.jpg / deskripsi penanda). null = belum ada. */
function cariFileFoto_(folder, fotoId) {
  var dibuang = function (f) { try { return typeof f.isTrashed === 'function' && f.isTrashed(); } catch (e) { return false; } };
  var lama = folder.getFilesByName(String(fotoId) + '.jpg');
  while (lama.hasNext()) { var l = lama.next(); if (!dibuang(l)) return l; }
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (dibuang(f)) continue;
    var desk = '';
    try { desk = String(f.getDescription() || ''); } catch (e) { desk = ''; }
    if (desk === PENANDA_FOTO_ + fotoId) return f;
  }
  return null;
}

/** Nama file yang belum dipakai di folder, mulai dari urutan ke. Penuh (sangat jarang) = nama + foto_id. */
function namaFotoBebas_(folder, kodeEksekusi, slot, ke, fotoId) {
  var awal = Math.max(1, Math.floor(Number(ke)) || 1);
  for (var n = awal; n < awal + 30; n++) {
    var nm = namaFotoRow_(kodeEksekusi, slot, n);
    if (!folder.getFilesByName(nm).hasNext()) return nm;
  }
  return namaFotoRow_(kodeEksekusi, slot, awal).replace(/\.jpg$/, '_' + String(fotoId).slice(0, 8) + '.jpg');
}

/** Urutan foto (1, 2, ...) di slot eksekusi menurut Timestamp, semua status (BATAL = foto yang sudah diganti). */
function urutanFotoSlot_(rows, eksekusiId, slot) {
  var l = rows.filter(function (r) { return String(r.eksekusi_id) === String(eksekusiId) && String(r.slot) === String(slot); });
  var ms = function (r) { var t = keDate_(r.Timestamp); return t ? t.getTime() : 0; };
  return l.slice().sort(function (a, b) { return ms(a) - ms(b); });
}

/** Bagian path folder foto satu eksekusi (dipakai upload dan migrasi). */
function pathFotoEksekusi_(eks) {
  var tanggal = tanggalDariKode_(eks['Kode Eksekusi']);
  return [tanggal.slice(0, 4), tanggal.slice(5, 7), tanggal.slice(8, 10),
          namaFolderFoto_(eks.Tim), namaFolderFoto_(eks.Penyulang), namaFolderFoto_(eks['Kode Eksekusi'])];
}

/**
 * v0.62.5 (review ulang 7 Okt 2026): file foto wajib private. Dulu file baru mewarisi akses folder, jadi kalau
 * ROW_FOTO_FOLDER_ID (atau subfoldernya) terbagi "siapa saja yang punya link" / domain, foto petugas ikut terbuka.
 * Bukan private = coba dikunci; tetap tidak bisa (mis. shared drive) = file baru dibuang dan upload ditolak.
 */
function pastikanFotoPrivat_(file, fileBaru) {
  var akses = null;
  try { akses = file.getSharingAccess(); } catch (e) { akses = null; }
  if (akses === DriveApp.Access.PRIVATE) return;
  try { file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); akses = file.getSharingAccess(); } catch (e2) { /* shared drive */ }
  if (akses === DriveApp.Access.PRIVATE) return;
  if (fileBaru) { try { file.setTrashed(true); } catch (e3) { /* dibiarkan, tetap ditolak */ } }
  throw new SisiError_('FOTO_TIDAK_PRIVAT', String(akses));
}

function uploadFotoRow_(sesi, data, platform) {
  wajibPetugasRow_(sesi);   // v0.62.4: role PETUGAS + tim ROW. v0.66.2: dicek PALING AWAL (sebelum isi data dibaca)
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
      // v0.62.7 (audit 7 Okt 2026): kiriman ulang setelah upload sebelumnya gagal di tengah (baris row_Foto sudah
      // tertulis, kolom foto eksekusi / hitungan realisasi belum) dulu cuma dijawab DUPLIKAT, jadi foto_lengkap dan
      // hitungan laporan tertinggal selamanya. Sekarang dipulihkan, hanya untuk eksekusi milik tim sesi dalam 7 hari.
      var hdrL = eLama ? headerDari_(ctx, 'eksekusi', eLama) : null;
      if (eLama && hdrL && String(hdrL.tim_id) === sesi.timId && eLama.status === 'AKTIF' && lama.status === 'AKTIF' &&
          dalamBatasTanggal_(ctx, tanggalDariKode_(eLama['Kode Eksekusi']))) {
        var sa = {};
        F.rows.forEach(function (r) {
          if (String(r.eksekusi_id) === d.eksekusiId && r.status === 'AKTIF') sa[String(r.slot)] = true;
        });
        var lengkapL = Object.keys(SLOT_FOTO_).every(function (s) { return sa[s]; });
        var kolL = SLOT_FOTO_[d.slot], urlL = 'https://drive.google.com/file/d/' + lama.drive_file_id + '/view';
        if (isAktif_(eLama.foto_lengkap) !== lengkapL || String(eLama[kolL + ' URL'] || '') !== urlL) {
          var namaL = d.fotoId + '.jpg';   // v0.64.4: nama asli file (format baru); file tidak terbaca = nama lama
          try { namaL = DriveApp.getFileById(String(lama.drive_file_id)).getName() || namaL; } catch (eN) { /* dibiarkan */ }
          eLama._ubah = eLama._ubah || {};
          eLama._ubah[kolL] = namaL; eLama._ubah[kolL + ' URL'] = urlL;
          eLama._ubah.foto_lengkap = lengkapL; eLama._ubah['Timestamp Update'] = sekarang;   // revision TIDAK naik
          Object.keys(eLama._ubah).forEach(function (k) { eLama[k] = eLama._ubah[k]; });
          ctx.kotorRealisasi[String(eLama.realisasi_id)] = true;
          hitungUlangRealisasi_(ctx);
          hitungUlangWa_(ctx);
          tulisSync_(ctx);
          auditLog_(sesi, 'UPLOAD_FOTO_PULIH', String(eLama['Kode Eksekusi']), d.slot + ' ' + d.fotoId, platform, logT);
        }
        return { status: 'DUPLIKAT', fotoId: d.fotoId, slot: d.slot, fotoLengkap: lengkapL };
      }
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
    var file = cariFileFoto_(folder, d.fotoId);
    var fileBaru = !file;
    if (fileBaru) {
      // v0.64.4: <Kode Eksekusi>_<SLOT>[_n].jpg, n = urutan foto di slot ini (pengganti = 2, 3, ...)
      var ke = urutanFotoSlot_(F.rows, d.eksekusiId, d.slot).length + 1;
      file = folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', namaFotoBebas_(folder, eks['Kode Eksekusi'], d.slot, ke, d.fotoId)));
      try { file.setDescription(PENANDA_FOTO_ + d.fotoId); } catch (eD) { /* tanpa penanda: kiriman ulang dapat nama berikutnya */ }
    }
    var namaFile = file.getName();
    pastikanFotoPrivat_(file, fileBaru);   // v0.62.5: sebelum sheet ditulis
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
 * v0.64.4: alat editor. Ganti nama file foto ROW AKTIF yang masih acak (<foto_id>.jpg, hasil upload lama / migrasi) ke
 * format <Kode Eksekusi>_<SLOT>[_n].jpg, lalu kolom Foto Sebelum / Pekerjaan / Sesudah row_Eksekusi ikut diganti.
 * ID file dan URL tidak berubah, isi foto tidak disentuh, revision tidak naik. Drive di luar lock; tulis sheet satu kali
 * per kolom di dalam lock, hanya baris yang URL-nya masih file yang sama. Batas 270 detik: sisa = jalankan lagi.
 * Sudah rapi = dilewati tanpa membuka Drive.
 */
function ADMIN_rapikanNamaFotoRow() {
  pastikanPemilik_();
  var c = cfg_();
  if (!c.ROW_SHEET_ID) { console.error('ROW_SHEET_ID kosong'); return; }
  var mulai = Date.now(), BATAS = 270e3;
  var F = tabel_('ROW_SHEET_ID', 'row_Foto');
  var E = tabel_('ROW_SHEET_ID', 'row_Eksekusi');
  var eksById = {};
  E.rows.forEach(function (r) { if (r.eksekusi_id) eksById[String(r.eksekusi_id)] = r; });
  var ganti = [], lewat = 0, gagal = 0, sisa = 0, cekDrive = 0;
  var aktif = F.rows.filter(function (r) { return r.status === 'AKTIF' && r.drive_file_id && SLOT_FOTO_[String(r.slot)]; });
  for (var i = 0; i < aktif.length; i++) {
    var f = aktif[i], eks = eksById[String(f.eksekusi_id)];
    if (!eks || !eks['Kode Eksekusi']) { gagal++; continue; }
    var kol = SLOT_FOTO_[String(f.slot)];
    var urut = urutanFotoSlot_(F.rows, f.eksekusi_id, f.slot);
    var ke = urut.indexOf(f) + 1;
    var target = namaFotoRow_(eks['Kode Eksekusi'], f.slot, ke);
    var url = 'https://drive.google.com/file/d/' + f.drive_file_id + '/view';
    var namaSheet = String(eks[kol] || '');
    if (String(eks[kol + ' URL'] || '') === url && (namaSheet === target || namaSheet.indexOf(target.replace(/\.jpg$/, '')) === 0)) { lewat++; continue; }
    if (Date.now() - mulai > BATAS) { sisa = aktif.length - i; break; }
    try {
      var file = DriveApp.getFileById(String(f.drive_file_id));
      cekDrive++;
      var nama = file.getName();
      if (nama !== target && nama.indexOf(target.replace(/\.jpg$/, '')) !== 0) {
        var induk = file.getParents();
        var folder = induk.hasNext() ? induk.next() : null;
        nama = folder ? namaFotoBebas_(folder, eks['Kode Eksekusi'], f.slot, ke, f.foto_id) : target;
        file.setName(nama);
      }
      try { if (!file.getDescription()) file.setDescription(PENANDA_FOTO_ + f.foto_id); } catch (eD) { /* dibiarkan */ }
      ganti.push({ eksekusiId: String(f.eksekusi_id), kol: kol, nama: nama, url: url });
    } catch (e) {
      gagal++;
      console.warn('Foto ' + f.foto_id + ' (' + eks['Kode Eksekusi'] + ' ' + f.slot + '): ' + (e.kode || e.message));
    }
  }
  var ditulis = 0;
  if (ganti.length) {
    denganLock_(function () {
      var T = tabel_('ROW_SHEET_ID', 'row_Eksekusi');
      var akhir = T.sheet.getLastRow();
      if (akhir < 2) return;
      var barisById = {};
      T.rows.forEach(function (r) { if (r.eksekusi_id) barisById[String(r.eksekusi_id)] = r; });
      Object.keys(SLOT_FOTO_).forEach(function (slot) {
        var kol = SLOT_FOTO_[slot], idx = T.header.indexOf(kol), idxUrl = T.header.indexOf(kol + ' URL');
        if (idx === -1 || idxUrl === -1) return;
        var nilai = T.sheet.getRange(2, idx + 1, akhir - 1, 1).getValues(), ubah = false;
        ganti.filter(function (g) { return g.kol === kol; }).forEach(function (g) {
          var r = barisById[g.eksekusiId];
          if (!r || String(r[kol + ' URL'] || '') !== g.url) return;   // foto sudah diganti HP sementara itu
          nilai[r._baris - 2][0] = g.nama; ubah = true; ditulis++;
        });
        if (ubah) T.sheet.getRange(2, idx + 1, akhir - 1, 1).setValues(nilai);
      });
    });
  }
  console.log('Rapikan nama foto ROW: ' + ditulis + ' diganti, ' + lewat + ' sudah rapi, ' + gagal + ' gagal, ' + cekDrive + ' file dibuka' +
    (sisa ? '. Waktu habis, ' + sisa + ' foto belum dicek: JALANKAN LAGI.' : '.'));
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
  timLaporan_(sesi, null);   // v0.76.1 audit guard: peran dicek PALING AWAL (PETUGAS non-ROW ditolak sebelum isi data dibaca)
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
