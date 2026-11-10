/**
 * v0.70.0 (keputusan Master Guswan 9 Okt 2026): BA Pengoperasian Trafo dari HP (admin), format isian sama v1
 * (SIE-BeritaAcara.html + SIE-BA-Code.js). Tanpa persetujuan berjenjang: BA langsung masuk Rekap_BA dan gardu baru
 * masuk db_Gardu (AKTIF) dalam satu lock. PDF menyusul (Cloud Run v2), Status PDF = BELUM.
 *
 * Alur HP: getNomorGarduBaru (pratinjau nomor + nomor BATAL yang bisa dipakai ulang) -> getOwnerIdGardu (isi otomatis
 * OwnerId / External Reference saat section dipilih) -> uploadFotoBaGardu per slot (foto kamera / galeri, folder sementara
 * Gardu / _Upload Sementara / <baId>, v0.77.0) -> simpanBaGardu (foto dipindah ke Gardu / <No Gardu> / <YYYY-MM-DD>_<Jenis BA>). Nomor gardu, ID BA, No BA Full ditentukan
 * SERVER saat simpan (pratinjau di HP bisa berubah kalau ada BA lain lebih dulu).
 * Kirim ulang baId yang sama = DUPLIKAT (jawaban sama), tidak membuat BA / gardu kedua.
 */
var BA_JENIS_SIAP_ = ['Pengoperasian Trafo', 'Penggantian Trafo', 'Pemeriksaan Trafo',
  // v1.0.49: BA Switching (47_BA_Switching.js)
  'Pengoperasian Switching', 'Penggantian Switching', 'Relokasi Switching', 'Pemeriksaan Switching', 'Kerusakan Switching'];
// v1.0.46: jenis yang mengubah Master Gardu (Update Master) dan punya teks EAM v1. Pemeriksaan Trafo tidak (gardu tetap).
var BA_JENIS_MASTER_ = ['Pengoperasian Trafo', 'Penggantian Trafo'];
var BA_KONSTRUKSI_ = ['Portal', 'Cantol'];
// v0.72.0 (Master Guswan): 'Non-PLN (Lisdes)' -> 'Non-PLN'. Nilai lama dari app lama tetap diterima, disimpan sebagai 'Non-PLN'.
var BA_KEPEMILIKAN_ = ['PLN', 'Non-PLN', 'Non-PLN (Lisdes)'];
var BA_SUMBER_FOTO_ = ['KAMERA', 'GALERI'];
var BA_ASAL_TRAFO_ = ['Gudang UP3 (Baru)', 'Gudang UP3 (Rekondisi)', 'Gudang ULP', 'Eks Bongkaran Gardu Lain', 'Lainnya'];
// slot foto -> kolom Rekap_BA (urutan = urutan di form; wajib: false = opsional, atur oleh kondisional form)
var BA_SLOT_FOTO_ = {
  'Pengoperasian Trafo': [
    { slot: 'NAMEPLATE', kolom: 'Foto Nameplate', label: 'Nameplate Trafo' },
    { slot: 'FULL_GARDU', kolom: 'Foto Konstruksi', label: 'Foto Full Gardu' },
    { slot: 'NAMEPLATE_PHB', kolom: 'Foto Nameplate PHB-TR', label: 'Nameplate PHB-TR' },
    { slot: 'BOX_PHB', kolom: 'Foto Box PHB-TR', label: 'Box PHB-TR' }
  ],
  'Penggantian Trafo': [
    { slot: 'NAMEPLATE', kolom: 'Foto Nameplate', label: 'Nameplate Trafo Sebelum' },
    { slot: 'NAMEPLATE_SESUDAH', kolom: 'Foto Nameplate Sesudah', label: 'Nameplate Trafo Sesudah' },
    { slot: 'FULL_GARDU', kolom: 'Foto Konstruksi', label: 'Konstruksi Trafo Sebelum', wajib: false },
    { slot: 'FULL_GARDU_SESUDAH', kolom: 'Foto Konstruksi Sesudah', label: 'Konstruksi Trafo Sesudah', wajib: false },
    { slot: 'NAMEPLATE_PHB_SESUDAH', kolom: 'Foto Nameplate PHB-TR Sesudah', label: 'Nameplate PHB-TR Sesudah', wajib: false },
    { slot: 'BOX_PHB_SESUDAH', kolom: 'Foto Box PHB-TR Sesudah', label: 'Box PHB-TR Sesudah', wajib: false }
  ],
  // v1.0.46: sama v1 (foto megger 1..6, semua opsional; PDF hanya memuat yang terisi)
  'Pemeriksaan Trafo': [1, 2, 3, 4, 5, 6].map(function (n) {
    return { slot: 'LAMPIRAN_' + n, kolom: 'Foto Pemeriksaan ' + n, label: 'Lampiran ' + n, wajib: false };
  })
};
var BA_KODE_ULP_ = 'TBL';

/** Slot foto satu jenis BA ([] = tidak dikenal). v1.0.49: switching dari 47_BA_Switching.js. */
function slotFotoBa_(jenis) {
  if (BA_SLOT_FOTO_[jenis]) return BA_SLOT_FOTO_[jenis];
  return baSwitching_(jenis) ? slotFotoSwitching_(jenis) : [];
}

/** BA hanya dibuat ADMIN / SUPER (keputusan Master Guswan), di atas akses menu OPS_BA_GARDU. */
function wajibAdminBa_(sesi) {
  if (!sesi || (sesi.role !== 'ADMIN' && sesi.role !== 'SUPER')) throw new SisiError_('AKSES_DITOLAK', 'BA khusus admin');
}

function teksBa_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

/** Sheet lama (GARDU_LAMA_SHEET_ID) atau null kalau tab / file tidak ada. Hanya dibaca. */
function sheetGarduLama_(nama) {
  var c = cfg_();
  if (!c.GARDU_LAMA_SHEET_ID) return null;
  try { return tabLamaGardu_(bukaSpreadsheet_(c.GARDU_LAMA_SHEET_ID), nama); } catch (e) { return null; }
}

/** Tab file lama: nama v1 ('Rekap Gardu') atau salinan dengan garis bawah ('Rekap_Gardu'). null = tidak ada. */
function tabLamaGardu_(ss, nama) {
  return ss.getSheetByName(nama) || ss.getSheetByName(String(nama).replace(/ /g, '_')) || null;
}

/** Isi satu kolom sheet lama (tampilan) dari baris data pertama. Kolom dicari dari judul di baris 1..barisJudul. */
function kolomLama_(sh, alias, barisJudul, barisData) {
  if (!sh) return [];
  var lebar = sh.getLastColumn(), akhir = sh.getLastRow();
  if (lebar < 1 || akhir < barisData) return [];
  var head = sh.getRange(1, 1, barisJudul, lebar).getDisplayValues();
  var kol = -1;
  for (var r = 0; r < head.length && kol < 0; r++) {
    for (var c = 0; c < lebar; c++) if (alias.indexOf(normJudul_(head[r][c])) !== -1) { kol = c + 1; break; }
  }
  if (kol < 0) return [];
  return sh.getRange(barisData, kol, akhir - barisData + 1, 1).getDisplayValues().map(function (b) { return teksBa_(b[0]); });
}

/** Isi kolom posisi tetap sheet lama (mis. Master_Gardu C, Rekap Gardu B). */
function kolomTetapLama_(sh, kolom, barisData) {
  if (!sh) return [];
  var akhir = sh.getLastRow();
  if (akhir < barisData || sh.getLastColumn() < kolom) return [];
  return sh.getRange(barisData, kolom, akhir - barisData + 1, 1).getDisplayValues().map(function (b) { return teksBa_(b[0]); });
}

/** Angka nomor gardu terbesar untuk prefix: db_Gardu (semua status) + Master_Gardu C + Rekap Gardu B (lama). */
function nomorGarduTerbesar_(rowsGardu, prefix) {
  var maks = 0;
  var catat = function (v) { var n = parseNoGarduLama_(v); if (n && n.prefix === prefix && n.angka > maks) maks = n.angka; };
  rowsGardu.forEach(function (r) { catat(r['No Gardu']); });
  kolomTetapLama_(sheetGarduLama_(MIGRASI_GARDU_.master.tab), MIGRASI_GARDU_.master.kol.gardu, MIGRASI_GARDU_.master.barisData).forEach(catat);
  kolomTetapLama_(sheetGarduLama_(MIGRASI_GARDU_.rekap.tab), MIGRASI_GARDU_.rekap.kol.gardu, MIGRASI_GARDU_.rekap.barisData).forEach(catat);
  return maks;
}

function formatNoGardu_(prefix, angka) { return prefix + ('000' + angka).slice(-Math.max(4, String(angka).length)); }

/** Nomor BATAL yang belum dipakai ulang (prefix sama, tidak ada AKTIF / TIDAK AKTIF bernomor sama). */
function nomorBatalTersedia_(rowsGardu, prefix) {
  var dipakai = {};
  rowsGardu.forEach(function (r) {
    var st = teksBa_(r['Status Gardu']).toUpperCase();
    if (st === 'AKTIF' || st === 'TIDAK AKTIF') dipakai[teksBa_(r['No Gardu']).toUpperCase()] = true;
  });
  return rowsGardu.filter(function (r) {
    var no = teksBa_(r['No Gardu']).toUpperCase();
    return r.gardu_id && teksBa_(r['Status Gardu']).toUpperCase() === 'BATAL' && teksBa_(r.Prefix || no.slice(0, 2)) === prefix &&
      !teksBa_(r['Nomor Dipakai Ulang']) && !dipakai[no];
  }).sort(function (a, b) { return teksBa_(a['No Gardu']) < teksBa_(b['No Gardu']) ? -1 : 1; });
}

/**
 * Penghitung BA bulan tanggal BA: ID BA "BA-GRD-TBL-YYYYMM-NNN" dan No BA Full
 * "No. NNN / BA - TRF / ULP - TBL / M / YYYY" (sama v1 _baGenerateIdBA_ / _baGenerateNoBaFull_), melanjutkan
 * Rekap_BA + Rekap Gardu lama. Nomor yang pernah dipakai (termasuk BA BATAL) tidak dipakai ulang.
 */
function nomorBaBerikut_(rowsRekap, tanggalBa, kodeAlat) {
  var y = tanggalBa.slice(0, 4), m = tanggalBa.slice(5, 7), bulan = String(Number(m));
  // v1.0.49 (Master Guswan): ID BA switching memakai SWC (v1: SWT)
  var awalId = 'BA-' + (kodeAlat === 'SWC' ? 'SWC' : 'GRD') + '-' + BA_KODE_ULP_ + '-' + y + m + '-';
  var pola = new RegExp('No\\.\\s*(\\d+)\\s*\\/\\s*BA\\s*-\\s*' + kodeAlat + '\\s*\\/\\s*ULP\\s*-\\s*' + BA_KODE_ULP_ + '\\.?\\s*\\/\\s*(\\d+)\\s*\\/\\s*(\\d{4})', 'i');
  var maksId = 0, maksFull = 0;
  var catatId = function (v) {
    v = teksBa_(v);
    if (v.indexOf(awalId) === 0) { var n = parseInt(v.slice(awalId.length), 10); if (n > maksId) maksId = n; }
  };
  var catatFull = function (v) {
    var x = pola.exec(teksBa_(v));
    if (x && Number(x[2]) === Number(bulan) && x[3] === y && Number(x[1]) > maksFull) maksFull = Number(x[1]);
  };
  rowsRekap.forEach(function (r) { catatId(r['ID BA']); catatFull(r['No BA Full']); });
  // v1.0.49: No BA Full switching melanjutkan Rekap Switching v1 (kolom AJ = 36, data mulai baris 2; pola menyaring judul)
  if (kodeAlat === 'SWC') kolomTetapLama_(sheetGarduLama_('Rekap Switching'), 36, 2).forEach(catatFull);
  var lama = sheetGarduLama_(MIGRASI_GARDU_.rekap.tab);
  kolomLama_(lama, MIGRASI_GARDU_.rekap.aliasIdBa, MIGRASI_GARDU_.rekap.barisHeaderAkhir, MIGRASI_GARDU_.rekap.barisData).forEach(catatId);
  kolomLama_(lama, MIGRASI_GARDU_.rekap.aliasNoBaFull, MIGRASI_GARDU_.rekap.barisHeaderAkhir, MIGRASI_GARDU_.rekap.barisData).forEach(catatFull);
  return {
    idBa: awalId + pad3_(maksId + 1),
    noBaFull: 'No. ' + pad3_(maksFull + 1) + ' / BA - ' + kodeAlat + ' / ULP - ' + BA_KODE_ULP_ + ' / ' + bulan + ' / ' + y
  };
}

/**
 * OwnerId + External Reference dari tab "OwnerId" (file gardu lama), algoritma sama v1 getOwnerIdDanExternalReference:
 * OwnerId = idGI + idULP + idFeeder + idSection (2 digit). Section dicocokkan lewat bagian depan (sebelum " - ").
 * Tidak lengkap / tidak ketemu = kosong + pesan (BA tetap boleh disimpan, sama v1).
 */
function ownerIdGardu_(penyulang, section) {
  var kosong = function (pesan) { return { ditemukan: false, ownerId: '', externalReference: '', pesan: pesan }; };
  penyulang = teksBa_(penyulang); section = teksBa_(section);
  if (!penyulang) return kosong('Penyulang kosong.');
  var sh = sheetGarduLama_('OwnerId');
  if (!sh) return kosong('Tab OwnerId tidak ada.');
  var v = sh.getDataRange().getDisplayValues();
  var key = function (x) { return teksBa_(x).toLowerCase().replace(/\s+/g, ' '); };
  var sel = function (b, c) { return teksBa_(b[c]); };
  var awal = function (x) { return teksBa_(x).split(/\s+-\s+/)[0].trim(); };
  var pad = function (x) { var s = teksBa_(x); while (s.length < 2) s = '0' + s; return s; };
  var A = 0, B = 1, D = 3, E = 4, F = 5, H = 7, I = 8, J = 9, K = 10, L = 11, M = 12;
  var pKey = key(penyulang), i;
  var hVal = '';
  for (i = 0; i < v.length; i++) if (key(sel(v[i], I)) === pKey) { hVal = sel(v[i], H); break; }
  var idGI = '';
  if (hVal) for (i = 0; i < v.length; i++) if (key(sel(v[i], A)) === key(hVal)) { idGI = sel(v[i], B); break; }
  var idULP = '', idFeeder = '';
  for (i = 0; i < v.length; i++) if (key(sel(v[i], D)) === pKey) { idULP = sel(v[i], F); idFeeder = sel(v[i], E); break; }
  var sKey = key(awal(section)), idSection = '', barisSec = null, barisMirip = null;
  if (sKey) {
    for (i = 0; i < v.length; i++) {
      var jk = key(awal(sel(v[i], J)));
      if (!jk) continue;
      if (jk === sKey) { barisSec = v[i]; break; }
      if (!barisMirip && (jk.indexOf(sKey) >= 0 || sKey.indexOf(jk) >= 0)) barisMirip = v[i];
    }
  }
  if (barisSec || barisMirip) idSection = sel(barisSec || barisMirip, K);
  if (!idGI || !idULP || !idFeeder || !idSection) {
    var kurang = [];
    if (!idGI) kurang.push('id GI'); if (!idULP) kurang.push('id ULP'); if (!idFeeder) kurang.push('id Feeder'); if (!idSection) kurang.push('id Section');
    return kosong('Komponen OwnerId belum lengkap untuk penyulang "' + penyulang + '": ' + kurang.join(', ') + '.');
  }
  var up = section.toUpperCase();
  var token = up.indexOf('GI') === 0 ? 'PMT' : up.indexOf('DS') === 0 ? 'DSC' : '';
  var bSection = null, bToken = null, bTokenSaja = null;
  for (i = 0; i < v.length && sKey; i++) {
    var jv = sel(v[i], J);
    if (!jv) continue;
    var k2 = key(awal(jv)), punya = token && jv.toUpperCase().indexOf(token) >= 0;
    var cocok = k2 === sKey || k2.indexOf(sKey) >= 0 || sKey.indexOf(k2) >= 0;
    if (cocok) { if (!bSection) bSection = v[i]; if (punya) { bToken = v[i]; break; } }
    if (punya && !bTokenSaja) bTokenSaja = v[i];
  }
  var bp = bToken || bSection || (token ? bTokenSaja : null);
  var jenis = bp ? sel(bp, L) : '', nama = bp ? sel(bp, M) : '';
  return {
    ditemukan: true, ownerId: pad(idGI) + pad(idULP) + pad(idFeeder) + pad(idSection),
    externalReference: jenis || nama ? 'SECTION - ' + jenis + ' - ' + nama : 'SECTION', pesan: 'OwnerId ditemukan.'
  };
}

/** Baris db_Jaringan aktif untuk sectionId, atau SECTION_TIDAK_VALID. */
function sectionBa_(sectionId) {
  var s = tabel_('MASTER_SHEET_ID', 'db_Jaringan').rows.filter(function (r) { return String(r.section_id) === sectionId && isAktif_(r.aktif); })[0];
  if (!s) throw new SisiError_('SECTION_TIDAK_VALID', sectionId);
  return s;
}

/** Pejabat BA: petugas (PEMERIKSA aktif) + satu MENGETAHUI aktif. */
function pejabatBa_(petugas1Id, petugas2Id) {
  var rows = tabel_('MASTER_SHEET_ID', 'db_Pejabat_BA').rows.filter(function (r) { return r.pejabat_id && isAktif_(r.aktif); });
  var peran = function (r) { return teksBa_(r.peran).toUpperCase(); };
  var cari = function (id, kunci) {
    var p = rows.filter(function (r) { return String(r.pejabat_id) === id && peran(r) === 'PEMERIKSA'; })[0];
    if (!p) throw new SisiError_('PEJABAT_TIDAK_VALID', kunci);
    return p;
  };
  var tahu = rows.filter(function (r) { return peran(r) === 'MENGETAHUI'; });
  if (tahu.length !== 1) throw new SisiError_('PEJABAT_MENGETAHUI_TIDAK_VALID', tahu.length + ' MENGETAHUI aktif');
  return { p1: cari(petugas1Id, 'petugas1Id'), p2: petugas2Id ? cari(petugas2Id, 'petugas2Id') : null, tahu: tahu[0] };
}

function barisBa_(rows, baId) {
  var x = rows.filter(function (r) { return String(r.ba_id) === baId; });
  if (x.length > 1) throw new SisiError_('DATA_GANDA', baId);
  return x[0] || null;
}

/** getNomorGarduBaru {prefix} -> { prefix, nomor (perkiraan), terakhir, batal: [{garduId, noGardu, alamat, penyulang}] }. */
function getNomorGarduBaru_(sesi, data) {
  wajibAdminBa_(sesi);
  var d = validasi_(data, { prefix: { tipe: 'pilihan', wajib: true, pilihan: GARDU_PREFIX_ } });
  var rows = cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu').rows;
  // v0.73.0: pratinjau melewati nomor yang sedang dipesan BA lain (res_NomorGardu)
  var tRes = tabelPesanan_(false), lain = dipesanLain_(tRes ? tRes.rows : [], '', new Date());
  var ada = nomorAdaGardu_(rows, d.prefix), maks = maksAngka_(ada);
  return {
    prefix: d.prefix, nomor: nomorBebasBerikut_(ada, d.prefix, lain, tRes ? tRes.rows : []), terakhir: maks ? formatNoGardu_(d.prefix, maks) : '',
    batal: batalUntukHp_(rows, d.prefix, lain)
  };
}

/** getOwnerIdGardu {sectionId} -> { ditemukan, ownerId, externalReference, pesan }. */
function getOwnerIdGardu_(sesi, data) {
  wajibAdminBa_(sesi);
  var d = validasi_(data, { sectionId: { tipe: 'uuid', wajib: true } });
  var s = sectionBa_(d.sectionId);
  return ownerIdGardu_(s.penyulang, s.section);
}

/** uploadFotoBaGardu {baId, jenis, slot, sumber, sha256, ukuranByte, data} -> { fileId, status }. Ganti = file lama dibuang. */
function uploadFotoBaGardu_(sesi, data) {
  wajibAdminBa_(sesi);
  var d = validasi_(data, {
    baId: { tipe: 'uuid', wajib: true },
    jenis: { tipe: 'pilihan', wajib: true, pilihan: BA_JENIS_SIAP_ },
    slot: { tipe: 'teks', wajib: true, maks: 30 },
    sumber: { tipe: 'pilihan', wajib: true, pilihan: BA_SUMBER_FOTO_ },
    sha256: { tipe: 'teks', wajib: true, maks: 64, pola: /^[0-9a-f]{64}$/ },
    ukuranByte: { tipe: 'angka', wajib: true, bulat: true, min: 1, max: FOTO_MAKS_BYTE_ },
    data: { tipe: 'teks', wajib: true, maks: Math.ceil(FOTO_MAKS_BYTE_ / 3) * 4 + 4 },
    // v0.76.0: true = foto pengganti untuk BA yang SUDAH tersimpan (dipasang oleh ubahBaGardu)
    revisi: { tipe: 'bool' }
  });
  if (!slotFotoBa_(d.jenis).some(function (s) { return s.slot === d.slot; })) throw new SisiError_('FORMAT_SALAH', 'slot');
  var bytes;
  try { bytes = Utilities.base64Decode(d.data); } catch (e) { throw new SisiError_('FORMAT_SALAH', 'data'); }
  if (bytes.length > FOTO_MAKS_BYTE_) throw new SisiError_('FOTO_TERLALU_BESAR', bytes.length);
  if (bytes.length !== d.ukuranByte) throw new SisiError_('FOTO_RUSAK', 'ukuran');
  if (bytesKeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)) !== d.sha256) throw new SisiError_('FOTO_RUSAK', 'sha256');
  var dim = ukuranJpeg_(bytes);
  if (!dim) throw new SisiError_('FORMAT_FOTO_SALAH');
  if (Math.max(dim.lebar, dim.tinggi) > FOTO_MAKS_SISI_) throw new SisiError_('FOTO_TERLALU_BESAR', dim.lebar + 'x' + dim.tinggi);
  return denganLock_(function () {
    var ada = barisBa_(cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA').rows, d.baId);
    if (d.revisi) {
      if (!ada) throw new SisiError_('BA_TIDAK_DITEMUKAN', d.baId);
      if (teksBa_(ada['Status BA']).toUpperCase() === 'BATAL') throw new SisiError_('BA_SUDAH_BATAL', teksBa_(ada['ID BA']));
      if (teksBa_(ada['Jenis Pekerjaan']) !== d.jenis) throw new SisiError_('FORMAT_SALAH', 'jenis');
    } else if (ada) {
      throw new SisiError_('BA_SUDAH_DISIMPAN', d.baId);
    }
    // v0.77.0: foto pengganti langsung ke folder BA (nomor sudah tetap); BA baru ke folder sementara (nomor belum final)
    var folder = d.revisi ? folderBa_(ada) : folderUploadBa_(d.baId);
    var penanda = d.revisi ? penandaRevisiBa_(d.baId, d.slot) : d.baId + '-' + d.slot;
    var lama = cariFileFoto_(folder, penanda);
    if (lama) { try { lama.setTrashed(true); } catch (eT) { /* dibiarkan */ } }
    var file = folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', d.slot + '_' + d.baId.slice(0, 8) + '.jpg'));
    try { file.setDescription(PENANDA_FOTO_ + penanda); } catch (eD) { /* tanpa penanda */ }
    pastikanFotoPrivat_(file, true);
    if (!d.revisi) perpanjangPesanan_(d.baId);   // v0.73.0: upload = aktivitas, pesanan nomor tidak hangus
    return { fileId: file.getId(), slot: d.slot, status: lama ? 'DIGANTI' : 'OK', sumber: d.sumber, revisi: !!d.revisi };
  });
}

/** Jawaban simpan dari baris Rekap_BA. */
function jawabBa_(r, status, tambahan) {
  return Object.assign({
    status: status, baId: String(r.ba_id), idBa: teksBa_(r['ID BA']), noBaFull: teksBa_(r['No BA Full']),
    noGardu: teksBa_(r['Nama Peralatan']), garduId: teksBa_(r.gardu_id), ownerId: teksBa_(r.OwnerId),
    externalReference: teksBa_(r['External Reference']), statusPdf: teksBa_(r['Status PDF'])
  }, tambahan || {});
}

/** simpanBaGardu (Pengoperasian Trafo) -> { status OK | DUPLIKAT, baId, idBa, noBaFull, noGardu, garduId, ownerId, ... }. */
function simpanBaGarduPenggantian_(sesi, data, tahunIni, platform) {
  var d = validasi_(data, {
    baId: { tipe: 'uuid', wajib: true },
    jenis: { tipe: 'pilihan', wajib: true, pilihan: ['Penggantian Trafo'] },
    garduId: { tipe: 'uuid', wajib: true },
    tanggalBa: { tipe: 'tanggal', wajib: true },
    tanggalPekerjaan: { tipe: 'tanggal', wajib: true },
    sectionId: { tipe: 'uuid' },
    alamat: { tipe: 'teks', maks: 200 },
    koordinat: { tipe: 'koordinat' },
    konstruksi: { tipe: 'pilihan', pilihan: BA_KONSTRUKSI_ },
    kva: { tipe: 'angka', min: 1, max: 5000 },
    merk: { tipe: 'teks', maks: 60 },
    seri: { tipe: 'teks', maks: 60 },
    tahun: { tipe: 'angka', bulat: true, min: 1950, max: tahunIni + 1 },
    jurusan: { tipe: 'angka', bulat: true, min: 1, max: 12 },
    merkPhb: { tipe: 'teks', maks: 60 },
    seriPhb: { tipe: 'teks', maks: 60 },
    tahunPhb: { tipe: 'angka', bulat: true, min: 1950, max: tahunIni + 1 },
    kepemilikan: { tipe: 'pilihan', pilihan: BA_KEPEMILIKAN_ },
    kvaSesudah: { tipe: 'angka', wajib: true, min: 1, max: 5000 },
    merkSesudah: { tipe: 'teks', wajib: true, maks: 60 },
    seriSesudah: { tipe: 'teks', wajib: true, maks: 60 },
    tahunSesudah: { tipe: 'angka', wajib: true, bulat: true, min: 1950, max: tahunIni + 1 },
    asalTrafo: { tipe: 'teks', wajib: true, maks: 80 },
    phbDiganti: { tipe: 'bool' },
    merkPhbSesudah: { tipe: 'teks', maks: 60 },
    seriPhbSesudah: { tipe: 'teks', maks: 60 },
    tahunPhbSesudah: { tipe: 'angka', bulat: true, min: 1950, max: tahunIni + 1 },
    jurusanSesudah: { tipe: 'angka', bulat: true, min: 1, max: 12 },
    alasan: { tipe: 'teks', maks: 300 },
    tindakLanjut: { tipe: 'teks', maks: 200 },
    vendor: { tipe: 'teks', maks: 100 },
    catatan: { tipe: 'teks', maks: 500 },
    petugas1Id: { tipe: 'uuid', wajib: true },
    petugas2Id: { tipe: 'uuid' },
    installId: { tipe: 'uuid' }
  });
  if (d.kepemilikan === 'Non-PLN (Lisdes)') d.kepemilikan = 'Non-PLN';
  var hariIni = tglJakarta_(new Date());
  if (d.tanggalBa > hariIni) throw new SisiError_('TANGGAL_TIDAK_VALID', 'tanggalBa di masa depan');
  if (d.tanggalPekerjaan > d.tanggalBa) throw new SisiError_('TANGGAL_TIDAK_VALID', 'tanggalPekerjaan sesudah tanggalBa');
  if (d.petugas2Id && d.petugas2Id === d.petugas1Id) throw new SisiError_('PEJABAT_TIDAK_VALID', 'petugas2Id sama dengan petugas1Id');

  var sec = d.sectionId ? sectionBa_(d.sectionId) : null;
  var pj = pejabatBa_(d.petugas1Id, d.petugas2Id);
  var folders = folderUploadAdaBa_(d.jenis, d.baId);
  var foto = {}, fotoMeta = {}, kurang = [];
  slotFotoBa_(d.jenis).forEach(function (s) {
    var f = cariFotoBaDi_(folders, d.baId + '-' + s.slot);
    if (!f) {
      if (s.wajib !== false) kurang.push(s.label);
      return;
    }
    foto[s.kolom] = 'https://drive.google.com/file/d/' + f.getId() + '/view';
    fotoMeta[s.slot] = { fileId: f.getId() };
  });

  var tersimpan = null;
  var hasil = denganLock_(function () {
    var tR = cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA');
    var tG = cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu');
    var tLog = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var ada = barisBa_(tR.rows, d.baId);
    if (ada) { tersimpan = ada; return jawabBa_(ada, 'DUPLIKAT'); }
    if (kurang.length) throw new SisiError_('FOTO_BELUM_LENGKAP', kurang.join(', '));

    var g = tG.rows.filter(function (r) { return String(r.gardu_id) === d.garduId; })[0];
    if (!g) throw new SisiError_('GARDU_TIDAK_DITEMUKAN', d.garduId);
    var stGardu = teksBa_(g['Status Gardu']).toUpperCase();
    if (stGardu !== 'AKTIF' && stGardu !== 'TIDAK AKTIF') throw new SisiError_('GARDU_TIDAK_AKTIF', teksBa_(g['No Gardu']));

    var noGardu = teksBa_(g['No Gardu']).toUpperCase();
    var sekarang = sekarangIso_(), oleh = sesi.userId || sesi.username;
    var nomor = nomorBaBerikut_(tR.rows, d.tanggalBa, 'TRF');
    var penyulang = sec ? String(sec.penyulang) : teksBa_(g.Penyulang);
    var section = sec ? String(sec.section) : teksBa_(g.Section);
    var secId = sec ? String(sec.section_id) : teksBa_(g.section_id);
    var owner = (teksBa_(g.OwnerId) && (!sec || secId === teksBa_(g.section_id)))
      ? { ditemukan: true, ownerId: teksBa_(g.OwnerId), externalReference: teksBa_(g['External Reference']), pesan: '' }
      : ownerIdGardu_(penyulang, section);

    var kvaSeb = d.kva !== undefined ? d.kva : angkaBa_(g['Kapasitas (kVA)']);
    var merkSeb = d.merk || teksBa_(g.Merk);
    var seriSeb = d.seri || teksBa_(g['Nomor Seri']);
    var tahunSeb = d.tahun !== undefined ? d.tahun : (angkaBa_(g.Tahun) || '');
    var konsSeb = d.konstruksi || teksBa_(g.Konstruksi) || 'Portal';
    var alamatSeb = d.alamat || teksBa_(g.Alamat);
    var latSeb = d.koordinat ? d.koordinat.lat : (angkaBa_(g.Lat) !== null ? angkaBa_(g.Lat) : '');
    var lngSeb = d.koordinat ? d.koordinat.lng : (angkaBa_(g.Long) !== null ? angkaBa_(g.Long) : '');
    var jurSeb = d.jurusan !== undefined ? d.jurusan : (angkaBa_(g['Jurusan Terpasang']) || teksBa_(g['Jurusan Terpasang']));
    var kepSeb = d.kepemilikan || teksBa_(g.Kepemilikan) || 'PLN';
    var mPhbSeb = d.merkPhb !== undefined ? d.merkPhb : teksBa_(g['Merk PHB-TR']);
    var sPhbSeb = d.seriPhb !== undefined ? d.seriPhb : teksBa_(g['Nomor Seri PHB-TR']);
    var tPhbSeb = d.tahunPhb !== undefined ? d.tahunPhb : (angkaBa_(g['Tahun PHB-TR']) || '');

    var mPhbSes = d.merkPhbSesudah !== undefined && d.merkPhbSesudah !== '' ? d.merkPhbSesudah : mPhbSeb;
    var sPhbSes = d.seriPhbSesudah !== undefined && d.seriPhbSesudah !== '' ? d.seriPhbSesudah : sPhbSeb;
    var tPhbSes = d.tahunPhbSesudah !== undefined ? d.tahunPhbSesudah : tPhbSeb;
    var jurSes = d.jurusanSesudah !== undefined ? d.jurusanSesudah : jurSeb;
    var phbDiganti = d.phbDiganti ? 'YA' : 'TIDAK';

    var ug = {
      'Status Gardu': 'AKTIF', Alamat: alamatSeb, Penyulang: penyulang, Section: section, 'PTS/LBS': section || teksBa_(g['PTS/LBS']),
      Lat: latSeb, Long: lngSeb, Konstruksi: konsSeb,
      'Kapasitas (kVA)': d.kvaSesudah, Merk: d.merkSesudah, 'Nomor Seri': d.seriSesudah, Tahun: d.tahunSesudah,
      'Asal Trafo': d.asalTrafo, 'Jurusan Terpasang': jurSes,
      'Merk PHB-TR': mPhbSes, 'Nomor Seri PHB-TR': sPhbSes, 'Tahun PHB-TR': tPhbSes,
      Kepemilikan: kepSeb, OwnerId: owner.ownerId || teksBa_(g.OwnerId), 'External Reference': owner.externalReference || teksBa_(g['External Reference']),
      'BA Terakhir': nomor.noBaFull, 'Jenis BA Terakhir': d.jenis, 'Tanggal BA Terakhir': d.tanggalBa,
      'Jumlah BA': (Number(g['Jumlah BA']) || 0) + 1,
      'Diubah Oleh': sesi.username || '', 'Timestamp Update': sekarang,
      section_id: secId, ba_id_terakhir: d.baId, diubah_oleh: oleh
    };
    if (d.kvaSesudah) {
      var arusNom = arusNominalGardu_(d.kvaSesudah);
      if (arusNom !== '') ug['Arus Maks per Fasa (A)'] = arusNom;
    }
    tulisBlok_(tG, [{ r: g, u: ug }], [], { bolehId: ['section_id', 'ba_id_terakhir'] });

    var noBa = tR.rows.reduce(function (m, r) { return Math.max(m, Number(r.No) || 0); }, 0) + 1;
    var ba = Object.assign({}, foto, {
      No: noBa, 'ID BA': nomor.idBa, 'No BA Full': nomor.noBaFull, 'Jenis Peralatan': 'TRAFO', 'Jenis Pekerjaan': d.jenis,
      'Tanggal BA': d.tanggalBa, 'Tanggal Pekerjaan': d.tanggalPekerjaan, ULP: cfg_().ULP_NAMA,
      'Asal Nomor Gardu': teksBa_(g['Asal Nomor']) || 'LAMA', 'Status Gardu Sesudah BA': 'AKTIF', 'Nama Peralatan': noGardu,
      'BA Sebelumnya': teksBa_(g['BA Terakhir']),
      Alamat: alamatSeb, Penyulang: penyulang, Section: section, Lat: latSeb, Long: lngSeb,
      Konstruksi: konsSeb, 'Kapasitas (kVA)': kvaSeb === null ? '' : kvaSeb, Merk: merkSeb, 'Nomor Seri': seriSeb, Tahun: tahunSeb,
      'Jurusan Terpasang': jurSeb, Kepemilikan: kepSeb,
      OwnerId: owner.ownerId || teksBa_(g.OwnerId), 'External Reference': owner.externalReference || teksBa_(g['External Reference']),
      'Merk PHB-TR': mPhbSeb, 'Nomor Seri PHB-TR': sPhbSeb, 'Tahun PHB-TR': tPhbSeb,
      'Nama Peralatan Sesudah': noGardu, 'Kapasitas Sesudah (kVA)': d.kvaSesudah, 'Merk Sesudah': d.merkSesudah, 'Nomor Seri Sesudah': d.seriSesudah,
      'Tahun Sesudah': d.tahunSesudah, 'Asal Peralatan': d.asalTrafo,
      'PHB-TR Diganti': phbDiganti, 'Merk PHB-TR Sesudah': mPhbSes, 'Nomor Seri PHB-TR Sesudah': sPhbSes,
      'Tahun PHB-TR Sesudah': tPhbSes, 'Jurusan Terpasang Sesudah': jurSes,
      'Vendor Pekerja': d.vendor || '', Catatan: d.catatan || '',
      'Petugas 1': teksBa_(pj.p1.nama), 'Jabatan Petugas 1': teksBa_(pj.p1.jabatan),
      'Petugas 2': pj.p2 ? teksBa_(pj.p2.nama) : '', 'Jabatan Petugas 2': pj.p2 ? teksBa_(pj.p2.jabatan) : '',
      Mengetahui: teksBa_(pj.tahu.nama), 'Jabatan Mengetahui': teksBa_(pj.tahu.jabatan),
      'Status BA': 'AKTIF', 'Status PDF': 'BELUM', 'Revisi BA': 0, 'Status TTD': 'BELUM TTD', 'Diterapkan ke Master': 'YA',
      'Input Oleh': sesi.username || '', Timestamp: sekarang, 'Timestamp Update': sekarang,
      ba_id: d.baId, gardu_id: String(g.gardu_id), section_id: secId,
      pejabat_id_1: String(pj.p1.pejabat_id), pejabat_id_2: pj.p2 ? String(pj.p2.pejabat_id) : '', pejabat_id_mengetahui: String(pj.tahu.pejabat_id),
      foto_meta: JSON.stringify(fotoMeta), install_id: d.installId || '', revision: 1, dibuat_oleh: oleh, diubah_oleh: oleh
    });
    tulisBlok_(tR, [], [ba]);
    auditLog_(sesi, 'BA_GARDU_SIMPAN', nomor.idBa, d.jenis + ' ' + noGardu, platform, tLog);
    tersimpan = ba;
    return jawabBa_(ba, 'OK', { peringatan: [] });
  });
  var rapi = tersimpan ? rapikanSesudahBa_(tersimpan) : null;
  if (rapi) hasil.folder = rapi.folder;
  return hasil;
}

/** Field isian BA Pemeriksaan Trafo (simpan + ubah). Data trafo kosong = diambil dari Master Gardu. */
function fieldPemeriksaanBa_(tahunIni) {
  return {
    tanggalPekerjaan: { tipe: 'tanggal', wajib: true },
    sectionId: { tipe: 'uuid' },
    alamat: { tipe: 'teks', maks: 200 },
    koordinat: { tipe: 'koordinat' },
    konstruksi: { tipe: 'pilihan', pilihan: BA_KONSTRUKSI_ },
    kva: { tipe: 'angka', min: 1, max: 5000 },
    merk: { tipe: 'teks', maks: 60 },
    seri: { tipe: 'teks', maks: 60 },
    tahun: { tipe: 'angka', bulat: true, min: 1950, max: tahunIni + 1 },
    jurusan: { tipe: 'angka', bulat: true, min: 1, max: 12 },
    merkPhb: { tipe: 'teks', maks: 60 },
    seriPhb: { tipe: 'teks', maks: 60 },
    tahunPhb: { tipe: 'angka', bulat: true, min: 1950, max: tahunIni + 1 },
    kesimpulan: { tipe: 'teks', maks: 1000 },
    catatan: { tipe: 'teks', maks: 1000 },
    petugas1Id: { tipe: 'uuid', wajib: true },
    petugas2Id: { tipe: 'uuid' }
  };
}

/** Kolom data trafo Rekap_BA Pemeriksaan: isian HP, kosong = nilai [asal] (baris gardu / baris BA). */
function isiPemeriksaanBa_(d, asal, sec) {
  var angka = function (v, k) { return v !== undefined ? v : (angkaBa_(asal[k]) === null ? teksBa_(asal[k]) : angkaBa_(asal[k])); };
  return {
    Penyulang: sec ? String(sec.penyulang) : teksBa_(asal.Penyulang), Section: sec ? String(sec.section) : teksBa_(asal.Section),
    section_id: sec ? String(sec.section_id) : teksBa_(asal.section_id),
    Alamat: d.alamat !== undefined ? d.alamat : teksBa_(asal.Alamat),
    Lat: d.koordinat ? d.koordinat.lat : angka(undefined, 'Lat'), Long: d.koordinat ? d.koordinat.lng : angka(undefined, 'Long'),
    Konstruksi: d.konstruksi || teksBa_(asal.Konstruksi), 'Kapasitas (kVA)': angka(d.kva, 'Kapasitas (kVA)'),
    Merk: d.merk !== undefined ? d.merk : teksBa_(asal.Merk), 'Nomor Seri': d.seri !== undefined ? d.seri : teksBa_(asal['Nomor Seri']),
    Tahun: angka(d.tahun, 'Tahun'), 'Jurusan Terpasang': angka(d.jurusan, 'Jurusan Terpasang'),
    'Merk PHB-TR': d.merkPhb !== undefined ? d.merkPhb : teksBa_(asal['Merk PHB-TR']),
    'Nomor Seri PHB-TR': d.seriPhb !== undefined ? d.seriPhb : teksBa_(asal['Nomor Seri PHB-TR']),
    'Tahun PHB-TR': angka(d.tahunPhb, 'Tahun PHB-TR')
  };
}

/**
 * v1.0.46 BA Pemeriksaan Trafo (sama v1 simpanBaPemeriksaanTrafo): gardu dari Master Gardu, data trafo diisi otomatis
 * (boleh dikoreksi), Kesimpulan + Catatan, lampiran foto 1..6 opsional. Master Gardu TIDAK diubah.
 */
function simpanBaGarduPemeriksaan_(sesi, data, tahunIni, platform) {
  var d = validasi_(data, Object.assign({
    baId: { tipe: 'uuid', wajib: true },
    jenis: { tipe: 'pilihan', wajib: true, pilihan: ['Pemeriksaan Trafo'] },
    garduId: { tipe: 'uuid', wajib: true },
    tanggalBa: { tipe: 'tanggal', wajib: true },
    installId: { tipe: 'uuid' }
  }, fieldPemeriksaanBa_(tahunIni)));
  var hariIni = tglJakarta_(new Date());
  if (d.tanggalBa > hariIni) throw new SisiError_('TANGGAL_TIDAK_VALID', 'tanggalBa di masa depan');
  if (d.tanggalPekerjaan > d.tanggalBa) throw new SisiError_('TANGGAL_TIDAK_VALID', 'tanggalPekerjaan sesudah tanggalBa');
  if (d.petugas2Id && d.petugas2Id === d.petugas1Id) throw new SisiError_('PEJABAT_TIDAK_VALID', 'petugas2Id sama dengan petugas1Id');

  var sec = d.sectionId ? sectionBa_(d.sectionId) : null;
  var pj = pejabatBa_(d.petugas1Id, d.petugas2Id);
  var folders = folderUploadAdaBa_(d.jenis, d.baId);
  var foto = {}, fotoMeta = {};
  slotFotoBa_(d.jenis).forEach(function (s) {
    var f = cariFotoBaDi_(folders, d.baId + '-' + s.slot);
    if (!f) return;
    foto[s.kolom] = 'https://drive.google.com/file/d/' + f.getId() + '/view';
    fotoMeta[s.slot] = { fileId: f.getId() };
  });

  var tersimpan = null;
  var hasil = denganLock_(function () {
    var tR = cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA');
    var tG = cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu');
    var tLog = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var ada = barisBa_(tR.rows, d.baId);
    if (ada) { tersimpan = ada; return jawabBa_(ada, 'DUPLIKAT'); }
    var g = tG.rows.filter(function (r) { return String(r.gardu_id) === d.garduId; })[0];
    if (!g) throw new SisiError_('GARDU_TIDAK_DITEMUKAN', d.garduId);
    var stGardu = teksBa_(g['Status Gardu']).toUpperCase();
    if (stGardu !== 'AKTIF' && stGardu !== 'TIDAK AKTIF') throw new SisiError_('GARDU_TIDAK_AKTIF', teksBa_(g['No Gardu']));

    var noGardu = teksBa_(g['No Gardu']).toUpperCase();
    var sekarang = sekarangIso_(), oleh = sesi.userId || sesi.username;
    var nomor = nomorBaBerikut_(tR.rows, d.tanggalBa, 'TRF');
    var noBa = tR.rows.reduce(function (m, r) { return Math.max(m, Number(r.No) || 0); }, 0) + 1;
    var ba = Object.assign({}, foto, isiPemeriksaanBa_(d, g, sec), {
      No: noBa, 'ID BA': nomor.idBa, 'No BA Full': nomor.noBaFull, 'Jenis Peralatan': 'TRAFO', 'Jenis Pekerjaan': d.jenis,
      'Tanggal BA': d.tanggalBa, 'Tanggal Pekerjaan': d.tanggalPekerjaan, ULP: cfg_().ULP_NAMA,
      'Asal Nomor Gardu': teksBa_(g['Asal Nomor']) || 'LAMA', 'Status Gardu Sesudah BA': stGardu, 'Nama Peralatan': noGardu,
      'BA Sebelumnya': teksBa_(g['BA Terakhir']), Kepemilikan: teksBa_(g.Kepemilikan),
      OwnerId: teksBa_(g.OwnerId), 'External Reference': teksBa_(g['External Reference']),
      Kesimpulan: d.kesimpulan || '', Catatan: d.catatan || '',
      'Petugas 1': teksBa_(pj.p1.nama), 'Jabatan Petugas 1': teksBa_(pj.p1.jabatan),
      'Petugas 2': pj.p2 ? teksBa_(pj.p2.nama) : '', 'Jabatan Petugas 2': pj.p2 ? teksBa_(pj.p2.jabatan) : '',
      Mengetahui: teksBa_(pj.tahu.nama), 'Jabatan Mengetahui': teksBa_(pj.tahu.jabatan),
      'Status BA': 'AKTIF', 'Status PDF': 'BELUM', 'Revisi BA': 0, 'Status TTD': 'BELUM TTD', 'Diterapkan ke Master': 'TIDAK',
      'Input Oleh': sesi.username || '', Timestamp: sekarang, 'Timestamp Update': sekarang,
      ba_id: d.baId, gardu_id: String(g.gardu_id),
      pejabat_id_1: String(pj.p1.pejabat_id), pejabat_id_2: pj.p2 ? String(pj.p2.pejabat_id) : '', pejabat_id_mengetahui: String(pj.tahu.pejabat_id),
      foto_meta: JSON.stringify(fotoMeta), install_id: d.installId || '', revision: 1, dibuat_oleh: oleh, diubah_oleh: oleh
    });
    tulisBlok_(tR, [], [ba]);
    auditLog_(sesi, 'BA_GARDU_SIMPAN', nomor.idBa, d.jenis + ' ' + noGardu, platform, tLog);
    tersimpan = ba;
    return jawabBa_(ba, 'OK', { peringatan: [] });
  });
  var rapi = tersimpan ? rapikanSesudahBa_(tersimpan) : null;
  if (rapi) hasil.folder = rapi.folder;
  return hasil;
}

function simpanBaGardu_(sesi, data, platform) {
  wajibAdminBa_(sesi);
  var tahunIni = Number(tglJakarta_(new Date()).slice(0, 4));
  if (data && data.jenis === 'Penggantian Trafo') return simpanBaGarduPenggantian_(sesi, data, tahunIni, platform);
  if (data && data.jenis === 'Pemeriksaan Trafo') return simpanBaGarduPemeriksaan_(sesi, data, tahunIni, platform);
  if (data && baSwitching_(data.jenis)) return simpanBaSwitching_(sesi, data, platform);   // v1.0.49
  var d = validasi_(data, {
    baId: { tipe: 'uuid', wajib: true },
    jenis: { tipe: 'pilihan', wajib: true, pilihan: BA_JENIS_PEKERJAAN_.TRAFO.concat(BA_JENIS_PEKERJAAN_.SWITCHING) },
    prefix: { tipe: 'pilihan', wajib: true, pilihan: GARDU_PREFIX_ },
    nomorBatalId: { tipe: 'uuid' },
    tanggalBa: { tipe: 'tanggal', wajib: true },
    tanggalPekerjaan: { tipe: 'tanggal', wajib: true },
    sectionId: { tipe: 'uuid', wajib: true },
    alamat: { tipe: 'teks', wajib: true, maks: 200 },
    koordinat: { tipe: 'koordinat', wajib: true },
    konstruksi: { tipe: 'pilihan', wajib: true, pilihan: BA_KONSTRUKSI_ },
    kva: { tipe: 'angka', wajib: true, min: 1, max: 5000 },
    merk: { tipe: 'teks', wajib: true, maks: 60 },
    seri: { tipe: 'teks', wajib: true, maks: 60 },
    tahun: { tipe: 'angka', wajib: true, bulat: true, min: 1950, max: tahunIni + 1 },
    jurusan: { tipe: 'angka', wajib: true, bulat: true, min: 1, max: 12 },
    merkPhb: { tipe: 'teks', maks: 60 },
    seriPhb: { tipe: 'teks', maks: 60 },
    tahunPhb: { tipe: 'angka', bulat: true, min: 1950, max: tahunIni + 1 },
    kepemilikan: { tipe: 'pilihan', wajib: true, pilihan: BA_KEPEMILIKAN_ },
    perluasanSutm: { tipe: 'angka', min: 0, max: 100 },
    vendor: { tipe: 'teks', maks: 100 },
    catatan: { tipe: 'teks', maks: 500 },
    petugas1Id: { tipe: 'uuid', wajib: true },
    petugas2Id: { tipe: 'uuid' },
    installId: { tipe: 'uuid' },
    // v0.73.0: No Gardu di watermark foto kamera. Beda dengan nomor final = NOMOR_GARDU_BERUBAH (HP render ulang)
    noGarduWatermark: { tipe: 'teks', maks: 12 }
  });
  if (BA_JENIS_SIAP_.indexOf(d.jenis) === -1) throw new SisiError_('JENIS_BA_BELUM_TERSEDIA', d.jenis);
  if (d.kepemilikan === 'Non-PLN (Lisdes)') d.kepemilikan = 'Non-PLN';
  var hariIni = tglJakarta_(new Date());
  if (d.tanggalBa > hariIni) throw new SisiError_('TANGGAL_TIDAK_VALID', 'tanggalBa di masa depan');
  if (d.tanggalPekerjaan > d.tanggalBa) throw new SisiError_('TANGGAL_TIDAK_VALID', 'tanggalPekerjaan sesudah tanggalBa');
  if (d.petugas2Id && d.petugas2Id === d.petugas1Id) throw new SisiError_('PEJABAT_TIDAK_VALID', 'petugas2Id sama dengan petugas1Id');

  // di luar lock: master + Drive (tidak berubah oleh BA lain)
  var sec = sectionBa_(d.sectionId);
  var pj = pejabatBa_(d.petugas1Id, d.petugas2Id);
  var folders = folderUploadAdaBa_(d.jenis, d.baId);
  var foto = {}, fotoMeta = {}, kurang = [];
  slotFotoBa_(d.jenis).forEach(function (s) {
    var f = cariFotoBaDi_(folders, d.baId + '-' + s.slot);
    if (!f) { kurang.push(s.label); return; }
    foto[s.kolom] = 'https://drive.google.com/file/d/' + f.getId() + '/view';
    fotoMeta[s.slot] = { fileId: f.getId() };
  });
  var owner = ownerIdGardu_(sec.penyulang, sec.section);

  var tersimpan = null;
  var hasil = denganLock_(function () {
    var tR = cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA');
    var tG = cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu');
    var tLog = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var ada = barisBa_(tR.rows, d.baId);
    if (ada) { tersimpan = ada; return jawabBa_(ada, 'DUPLIKAT'); }
    if (kurang.length) throw new SisiError_('FOTO_BELUM_LENGKAP', kurang.join(', '));

    var sekarang = sekarangIso_(), oleh = sesi.userId || sesi.username;
    var nomor = nomorBaBerikut_(tR.rows, d.tanggalBa, 'TRF');
    // gardu yang sudah tertulis oleh kiriman sebelumnya (Rekap_BA gagal ditulis) dipakai lagi, bukan nomor baru
    var sudah = tG.rows.filter(function (r) { return String(r.ba_id_pengoperasian) === d.baId; })[0] || null;
    var asal = 'BARU', noGardu, garduId, ulang = null, ns = null;
    if (sudah) {
      noGardu = teksBa_(sudah['No Gardu']).toUpperCase(); garduId = String(sudah.gardu_id); asal = teksBa_(sudah['Asal Nomor']) || 'BARU';
      ns = { tRes: tabelPesanan_(false), pesanan: null };
      if (ns.tRes) ns.pesanan = pesananMilik_(ns.tRes.rows, d.baId)[0] || null;
    } else {
      // v0.73.0: nomor dari pesanan BA ini (pesanNomorGardu); tanpa pesanan = nomor berikut yang tidak dipesan BA lain
      ns = nomorUntukSimpan_(d, tG.rows);
      noGardu = ns.no; asal = ns.asal; ulang = ns.ulang;
      garduId = ulang ? String(ulang.gardu_id) : uuid_();
      if (d.noGarduWatermark && d.noGarduWatermark.toUpperCase() !== noGardu) {
        throw new SisiError_('NOMOR_GARDU_BERUBAH', 'watermark ' + d.noGarduWatermark + ', nomor ' + noGardu);
      }
    }
    var umum = {
      Alamat: d.alamat, Penyulang: String(sec.penyulang), Section: String(sec.section), Lat: d.koordinat.lat, Long: d.koordinat.lng,
      Konstruksi: d.konstruksi, Merk: d.merk, 'Nomor Seri': d.seri, Tahun: d.tahun, 'Kapasitas (kVA)': d.kva, 'Jurusan Terpasang': d.jurusan,
      Kepemilikan: d.kepemilikan, OwnerId: owner.ownerId, 'External Reference': owner.externalReference,
      'Merk PHB-TR': d.merkPhb || '', 'Nomor Seri PHB-TR': d.seriPhb || '', 'Tahun PHB-TR': d.tahunPhb === undefined ? '' : d.tahunPhb
    };

    if (!sudah) {
      var g = Object.assign({}, umum, {
        'Status Gardu': 'AKTIF', 'Asal Nomor': asal, 'PTS/LBS': String(sec.section), 'BA Pengoperasian': nomor.noBaFull,
        'Tanggal Operasi': d.tanggalPekerjaan, 'BA Terakhir': nomor.noBaFull, 'Jenis BA Terakhir': d.jenis, 'Tanggal BA Terakhir': d.tanggalBa,
        'Sumber Data': 'BA V2', 'Diubah Oleh': sesi.username || '', 'Timestamp Update': sekarang,
        section_id: String(sec.section_id), ba_id_pengoperasian: d.baId, ba_id_terakhir: d.baId, diubah_oleh: oleh
      });
      if (ulang) {
        g['Jumlah BA'] = (Number(ulang['Jumlah BA']) || 0) + 1;
        tulisBlok_(tG, [{ r: ulang, u: g }], [], { bolehId: ['section_id', 'ba_id_pengoperasian', 'ba_id_terakhir'] });
      } else {
        var noUrut = tG.rows.reduce(function (m, r) { return Math.max(m, Number(r.No) || 0); }, 0) + 1;
        tulisBlok_(tG, [], [Object.assign(g, {
          No: noUrut, 'No Gardu': noGardu, Prefix: d.prefix, ULP: cfg_().ULP_NAMA, 'Jumlah BA': 1, Timestamp: sekarang,
          gardu_id: garduId, revision: 1, dibuat_oleh: oleh
        })]);
      }
    }

    var noBa = tR.rows.reduce(function (m, r) { return Math.max(m, Number(r.No) || 0); }, 0) + 1;
    var ba = Object.assign({}, umum, foto, {
      No: noBa, 'ID BA': nomor.idBa, 'No BA Full': nomor.noBaFull, 'Jenis Peralatan': 'TRAFO', 'Jenis Pekerjaan': d.jenis,
      'Tanggal BA': d.tanggalBa, 'Tanggal Pekerjaan': d.tanggalPekerjaan, ULP: cfg_().ULP_NAMA, 'Asal Nomor Gardu': asal,
      'Status Gardu Sesudah BA': 'AKTIF', 'Nama Peralatan': noGardu,
      'Panjang Perluasan SUTM (kmS)': d.perluasanSutm === undefined ? '' : d.perluasanSutm, 'Vendor Pekerja': d.vendor || '',
      Catatan: d.catatan || '',
      'Petugas 1': teksBa_(pj.p1.nama), 'Jabatan Petugas 1': teksBa_(pj.p1.jabatan),
      'Petugas 2': pj.p2 ? teksBa_(pj.p2.nama) : '', 'Jabatan Petugas 2': pj.p2 ? teksBa_(pj.p2.jabatan) : '',
      Mengetahui: teksBa_(pj.tahu.nama), 'Jabatan Mengetahui': teksBa_(pj.tahu.jabatan),
      'Status BA': 'AKTIF', 'Status PDF': 'BELUM', 'Revisi BA': 0, 'Status TTD': 'BELUM TTD', 'Diterapkan ke Master': 'YA',
      'Input Oleh': sesi.username || '', Timestamp: sekarang, 'Timestamp Update': sekarang,
      ba_id: d.baId, gardu_id: garduId, section_id: String(sec.section_id),
      pejabat_id_1: String(pj.p1.pejabat_id), pejabat_id_2: pj.p2 ? String(pj.p2.pejabat_id) : '', pejabat_id_mengetahui: String(pj.tahu.pejabat_id),
      foto_meta: JSON.stringify(fotoMeta), install_id: d.installId || '', revision: 1, dibuat_oleh: oleh, diubah_oleh: oleh
    });
    tulisBlok_(tR, [], [ba]);
    if (ns && ns.pesanan) tulisBlok_(ns.tRes, [{ r: ns.pesanan, u: { Status: 'DIPAKAI', 'Timestamp Update': sekarang } }], []);
    auditLog_(sesi, 'BA_GARDU_SIMPAN', nomor.idBa, d.jenis + ' ' + noGardu + ' (' + asal + ')', platform, tLog);
    tersimpan = ba;
    return jawabBa_(ba, 'OK', { peringatan: owner.ditemukan ? [] : ['OwnerId / External Reference kosong: ' + owner.pesan] });
  });
  // v0.77.0: di luar lock, foto pindah ke Gardu / <No Gardu> / <YYYY-MM-DD>_<Jenis BA> (gagal = BA tetap tersimpan)
  var rapi = tersimpan ? rapikanSesudahBa_(tersimpan) : null;
  if (rapi) hasil.folder = rapi.folder;
  return hasil;
}
