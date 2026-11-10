/**
 * v1.0.57 Gudang Material: baca foto Drive privat (stok, pemakaian, mutasi admin) lewat server + alat pemeriksa konsistensi.
 * Admin (OPS_GUDANG_MATERIAL) membaca semua; petugas Yandal (OPS_STOK_MATERIAL) hanya foto timnya.
 */

var GUD_FOTO_SUMBER_ = {
  PEMERIKSAAN: { sheet: 'db_Stok_Pemeriksaan', id: 'pemeriksaan_id', file: 'foto_stok', tim: 'tim_id' },
  PEMAKAIAN: { sheet: 'db_Pemakaian_MCB', id: 'pemakaian_id', file: 'foto_penggunaan', tim: 'tim_id' },
  MUTASI: { sheet: 'db_Material_Mutasi', id: 'mutasi_id', file: 'foto', tim: 'lokasi' }
};

/** {jenis, id, ukuran?} -> foto base64 (KECIL = thumbnail). [bolehTim(timBaris)] = cek kepemilikan baris. */
function fotoGudangDrive_(data, bolehTim) {
  var d = validasi_(data, { jenis: { tipe: 'pilihan', wajib: true, pilihan: Object.keys(GUD_FOTO_SUMBER_) }, id: { tipe: 'uuid', wajib: true },
    ukuran: { tipe: 'pilihan', pilihan: ['KECIL', 'PENUH'] } });
  var k = GUD_FOTO_SUMBER_[d.jenis];
  var r = tabelGudang_(k.sheet).rows.filter(function (x) { return String(x[k.id]) === d.id; })[0];
  if (!r) throw new SisiError_('DATA_TIDAK_DITEMUKAN', d.jenis);
  if (!bolehTim(String(r[k.tim]))) throw new SisiError_('BUKAN_MILIK_TIM', d.jenis);
  return jawabFotoDriveWo_(String(r[k.file] || '').trim(), d.jenis, d.ukuran, { jenis: d.jenis, id: d.id });
}

function getFotoGudang_(sesi, data) {
  wajibAdminGudang_(sesi);
  wajibKonfigGudang_();
  return fotoGudangDrive_(data, function () { return true; });
}

function getFotoGudangYandal_(sesi, data) {
  wajibPetugasGudang_(sesi);
  var tim = String(sesi.timId);
  wajibKonfigGudang_();
  return fotoGudangDrive_(data, function (timBaris) { return timBaris === tim; });
}

/**
 * Alat pemilik: periksa keselarasan buku mutasi dengan baris pemakaian / pemeriksaan / selisih. Penulisan ke beberapa sheet tidak
 * benar-benar atomik; bila satu penulisan gagal di tengah, alat ini yang menemukan sisanya. Hanya MELAPORKAN (tidak mengubah apa pun).
 * Hasil: jumlah masalah (0 = selaras).
 */
function ADMIN_cekKonsistensiGudang() {
  pastikanPemilik_();
  wajibKonfigGudang_();
  var masalah = 0, lapor = function (teks) { masalah++; console.warn('  [PERHATIAN]   ' + teks); };
  var mutasi = tabelGudang_('db_Material_Mutasi').rows, pakai = tabelGudang_('db_Pemakaian_MCB').rows;
  var punyaMutasi = {}, punyaPakai = {};
  mutasi.forEach(function (r) { if (String(r.jenis_mutasi) === 'PAKAI') punyaMutasi[String(r.ref_id)] = true; });
  pakai.forEach(function (r) { punyaPakai[String(r.pemakaian_id)] = true; });
  Object.keys(punyaMutasi).forEach(function (id) { if (!punyaPakai[id]) lapor('mutasi PAKAI tanpa baris pemakaian: ' + id); });
  pakai.forEach(function (r) {
    if (String(r.jenis_catatan) !== 'BATAL' && !punyaMutasi[String(r.pemakaian_id)]) lapor('pemakaian ' + String(r.nomor_pemakaian) + ' tanpa mutasi PAKAI');
  });
  var pemeriksaan = tabelGudang_('db_Stok_Pemeriksaan').rows, adaPr = {}, adaItem = {};
  pemeriksaan.forEach(function (r) { adaPr[String(r.pemeriksaan_id)] = true; });
  tabelGudang_('db_Stok_Pemeriksaan_Item').rows.forEach(function (r) {
    adaItem[String(r.pemeriksaan_id)] = true;
    if (!adaPr[String(r.pemeriksaan_id)]) lapor('item pemeriksaan tanpa pemeriksaan: ' + String(r.pemeriksaan_id));
  });
  pemeriksaan.forEach(function (r) {
    if (Number(r.total_input) + Number(r.total_perkiraan) > 0 && !adaItem[String(r.pemeriksaan_id)]) lapor('pemeriksaan ' + String(r.pemeriksaan_id) + ' tanpa item');
  });
  tabelGudang_('db_Stok_Selisih').rows.forEach(function (r) {
    if (!adaPr[String(r.pemeriksaan_id)]) lapor('selisih ' + String(r.selisih_id) + ' tanpa pemeriksaan');
  });
  console.log(masalah ? 'Konsistensi gudang: ' + masalah + ' masalah' : 'Konsistensi gudang: selaras');
  return masalah;
}
