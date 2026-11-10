/**
 * v1.0.57 Gudang Material: endpoint ADMIN (menu OPS_GUDANG_MATERIAL, web + HP) dan alat pemilik.
 * Izin material per tim (db_Material_Tim): tanpa baris izin aktif = material tidak boleh dipakai tim itu.
 */

function izinTimTabel_() { return tabel_('MASTER_SHEET_ID', 'db_Material_Tim'); }

function timAktifGudang_() {
  return tabel_('MASTER_SHEET_ID', 'db_Tim').rows.filter(function (t) { return t.tim_id && isAktif_(t.aktif); });
}

function getIzinMaterial_(sesi, data) {
  wajibAdminGudang_(sesi);
  wajibKonfigGudang_();
  validasi_(data, {});
  var material = tabelMaterialHartek_().rows.filter(function (m) { return m.material_id && isAktif_(m.aktif) && String(m.nama_material || '').trim(); })
    .map(function (m) { return { materialId: String(m.material_id), nama: String(m.nama_material).trim(), satuan: String(m.satuan || '').trim() }; })
    .sort(function (a, b) { return a.nama.localeCompare(b.nama); });
  var tim = timAktifGudang_().map(function (t) { return { timId: String(t.tim_id), nama: String(t.nama), jenis: String(t.jenis || '').trim().toUpperCase() }; })
    .sort(function (a, b) { return a.jenis.localeCompare(b.jenis) || a.nama.localeCompare(b.nama); });
  var izin = izinMaterialRows_().map(function (r) { return { materialId: String(r.material_id), timId: String(r.tim_id), aktif: isAktif_(r.aktif) }; });
  return { material: material, tim: tim, izin: izin, merkMcb: daftarMerkMcb_(), keperluanMcb: daftarKeperluanMcb_() };
}

/**
 * Set izin AKTIF material [materialId] persis pada [timIds]. Baris izin tidak pernah dihapus (dinonaktifkan / diaktifkan ulang).
 * Pencabutan boleh walau tim masih punya stok: hasil memuat stokTertinggal [{timId, jumlah}] (stok jadi "tanpa izin").
 */
function simpanIzinMaterial_(sesi, data, platform) {
  wajibAdminGudang_(sesi);
  wajibKonfigGudang_();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SisiError_('DATA_TIDAK_VALID');
  Object.keys(data).forEach(function (k) { if (k !== 'materialId' && k !== 'timIds') throw new SisiError_('FIELD_TIDAK_DIKENAL', k); });
  var d = validasi_({ materialId: data.materialId }, { materialId: { tipe: 'uuid', wajib: true } });
  var timIds = data.timIds;
  if (!Array.isArray(timIds)) throw new SisiError_('TIPE_SALAH', 'timIds');
  if (timIds.length > 100) throw new SisiError_('TERLALU_BANYAK', 'timIds');
  var lihat = {};
  timIds = timIds.map(function (v) {
    var id = validasi_({ v: v }, { v: { tipe: 'uuid', wajib: true } }).v;
    if (lihat[id]) throw new SisiError_('ID_GANDA', id);
    lihat[id] = true;
    return id;
  });
  return denganLock_(function () {
    var mat = tabelMaterialHartek_().rows.filter(function (m) { return String(m.material_id) === d.materialId && isAktif_(m.aktif); })[0];
    if (!mat) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'material');
    var aktifTim = {};
    timAktifGudang_().forEach(function (t) { aktifTim[String(t.tim_id)] = true; });
    timIds.forEach(function (id) { if (!aktifTim[id]) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'tim'); });
    var t = izinTimTabel_();
    var rowTim = {};
    t.rows.filter(function (r) { return String(r.material_id) === d.materialId; }).forEach(function (r) {
      var k = String(r.tim_id);
      if (rowTim[k]) throw new SisiError_('DATA_GANDA', 'db_Material_Tim ' + d.materialId + '|' + k);
      rowTim[k] = r;
    });
    var sekarang = sekarangIso_(), ubah = [], baru = [], dicabut = [];
    Object.keys(rowTim).forEach(function (k) {
      var r = rowTim[k], mau = !!lihat[k], ada = isAktif_(r.aktif);
      if (mau && !ada) ubah.push({ r: r, u: { aktif: true, diubah_pada: sekarang, diubah_oleh: sesi.userId } });
      if (!mau && ada) { ubah.push({ r: r, u: { aktif: false, diubah_pada: sekarang, diubah_oleh: sesi.userId } }); dicabut.push(k); }
    });
    timIds.forEach(function (id) {
      if (!rowTim[id]) baru.push({ No: noBaris_(t, baru.length), izin_id: uuid_(), material_id: d.materialId, tim_id: id, aktif: true, revision: 1,
        diubah_pada: sekarang, diubah_oleh: sesi.userId });
    });
    var tertinggal = [];
    if (dicabut.length) {
      var mutasi = tabelGudang_('db_Material_Mutasi').rows;
      dicabut.forEach(function (timId) {
        var jumlah = 0, saldo = saldoLokasi_(mutasi, timId);
        Object.keys(saldo).forEach(function (kunci) { if (kunci.split('|')[0] === d.materialId) jumlah += saldo[kunci]; });
        if (jumlah > 0) tertinggal.push({ timId: timId, jumlah: jumlah });
      });
    }
    tulisBlok_(t, ubah, baru);
    auditLog_(sesi, 'GUDANG_IZIN', 'db_Material_Tim', String(mat.nama_material).trim() + ': aktif ' + timIds.length + ' tim (ubah ' + ubah.length + ', baru ' + baru.length + ')',
      platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { materialId: d.materialId, timIds: timIds, stokTertinggal: tertinggal };
  });
}

/**
 * Alat pemilik, jalankan SEBELUM aturan izin aktif di lingkungan mana pun: semua material aktif x semua tim aktif berjenis HARTEK
 * (material lama hanya dipakai Hartek). Baris yang sudah ada (aktif atau sengaja dicabut) tidak diubah. Aman diulang.
 */
function ADMIN_isiIzinMaterialAwal() {
  pastikanPemilik_();
  return denganLock_(function () {
    var t = izinTimTabel_();
    var tim = timAktifGudang_().filter(function (x) { return String(x.jenis || '').trim().toUpperCase() === 'HARTEK'; });
    var ada = {};
    t.rows.forEach(function (r) { ada[String(r.material_id) + '|' + String(r.tim_id)] = true; });
    var baru = [], sekarang = sekarangIso_();
    tabelMaterialHartek_().rows.forEach(function (m) {
      if (!m.material_id || !isAktif_(m.aktif) || !String(m.nama_material || '').trim()) return;
      tim.forEach(function (x) {
        var k = String(m.material_id) + '|' + String(x.tim_id);
        if (ada[k]) return;
        ada[k] = true;
        baru.push({ No: noBaris_(t, baru.length), izin_id: uuid_(), material_id: String(m.material_id), tim_id: String(x.tim_id), aktif: true, revision: 1,
          diubah_pada: sekarang, diubah_oleh: 'admin-tools' });
      });
    });
    tulisBlok_(t, [], baru);
    console.log('db_Material_Tim: ' + baru.length + ' izin ditambahkan untuk ' + tim.length + ' tim Hartek');
    return baru.length;
  });
}
