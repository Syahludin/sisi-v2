/**
 * v1.0.57 Gudang Material: endpoint admin untuk STOK (menu OPS_GUDANG_MATERIAL, web + HP).
 * Tambah stok gudang, kirim ke tim, tarik dari tim, koreksi stok, lihat saldo. Semua tulis = baris baru di db_Material_Mutasi
 * (tidak pernah mengubah / menghapus baris lama). Isian membawa idOperasi (uuid dari klien): kirim ulang = tidak menggandakan.
 */

var GUD_JUMLAH_ = { tipe: 'angka', wajib: true, bulat: true, min: 1, max: 100000 };

/** Validasi isian stok bersama. tambahan = skema khusus endpoint. Hasil: { d, bytes } (bytes foto atau null). */
function bacaIsianStok_(data, tambahan, perluAlasan) {
  var p = pisahFoto_(data);
  if (perluAlasan) alasanWajib_(p.sisa);
  var skema = Object.assign({ idOperasi: { tipe: 'uuid', wajib: true }, catatan: { tipe: 'teks', maks: 200 } }, skemaJenisMcb_(), tambahan);
  var d = validasi_(p.sisa, skema);
  return { d: d, bytes: bacaFotoGudang_(p.foto, false) };
}

/** Baris mutasi dengan idOperasi ini sudah ada = operasi sudah pernah diterima. */
function operasiSudahAda_(mutasiRows, idOperasi) {
  return mutasiRows.some(function (r) { return String(r.ref_id) === idOperasi; });
}

function barisJenis_(d, jenisMutasi, lokasi, jumlah, ref, catatan, foto) {
  return { jenis_mutasi: jenisMutasi, lokasi: lokasi, material_id: d.materialId, daya: d.daya, merk: d.merk, status_mcb: d.statusMcb, jumlah: jumlah,
    ref_jenis: ref, ref_id: d.idOperasi, catatan: catatan || '', foto: foto.fileId, link_foto: foto.link };
}

function auditGudang_(sesi, aksi, detail, platform) {
  auditLog_(sesi, aksi, 'db_Material_Mutasi', detail, platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
}

function tambahStokGudang_(sesi, data, platform) {
  wajibAdminGudang_(sesi);
  wajibKonfigGudang_();
  var h = bacaIsianStok_(data, { jumlah: GUD_JUMLAH_ }, false), d = h.d;
  materialAktifGudang_(d.materialId);
  d.merk = merkBakuMcb_(d.merk);   // stok baru hanya dengan merk dari master (db_Merk_MCB)
  return denganLock_(function () {
    var t = tabelGudang_('db_Material_Mutasi');
    if (operasiSudahAda_(t.rows, d.idOperasi)) return { idOperasi: d.idOperasi, duplikat: true };
    var foto = simpanFotoGudang_(h.bytes, ['Gudang', 'Mutasi', tglJakarta_(new Date(sekarangMsGud_()))], d.idOperasi + '-MASUK', d.idOperasi + '_MASUK.jpg');
    var ids = tulisMutasi_(sesi, t, [barisJenis_(d, 'MASUK_GUDANG', 'GUDANG', d.jumlah, 'TAMBAH', d.catatan, foto)]);
    auditGudang_(sesi, 'GUDANG_TAMBAH', d.jumlah + ' x ' + d.daya + ' ' + d.merk + ' ' + d.statusMcb, platform);
    return { idOperasi: d.idOperasi, duplikat: false, mutasiId: ids[0] };
  });
}

function kirimStokTim_(sesi, data, platform) {
  wajibAdminGudang_(sesi);
  wajibKonfigGudang_();
  var h = bacaIsianStok_(data, { timId: { tipe: 'uuid', wajib: true }, jumlah: GUD_JUMLAH_ }, false), d = h.d;
  materialAktifGudang_(d.materialId);
  return denganLock_(function () {
    var tim = timAktifAda_(d.timId);
    if (!materialUntukTim_(d.timId).some(function (m) { return String(m.material_id) === d.materialId; })) throw new SisiError_('MATERIAL_TIDAK_DIIZINKAN', d.materialId);
    var t = tabelGudang_('db_Material_Mutasi');
    if (operasiSudahAda_(t.rows, d.idOperasi)) return { idOperasi: d.idOperasi, duplikat: true };
    var k = kunciDariIsian_(d);
    if ((saldoLokasi_(t.rows, 'GUDANG')[k] || 0) < d.jumlah) throw new SisiError_('STOK_TIDAK_CUKUP', 'gudang');
    var foto = simpanFotoGudang_(h.bytes, ['Gudang', 'Mutasi', tglJakarta_(new Date(sekarangMsGud_()))], d.idOperasi + '-KIRIM', d.idOperasi + '_KIRIM.jpg');
    var ids = tulisMutasi_(sesi, t, [barisJenis_(d, 'KIRIM_TIM', 'GUDANG', -d.jumlah, 'KIRIM', d.catatan, foto),
      barisJenis_(d, 'KIRIM_TIM', d.timId, d.jumlah, 'KIRIM', d.catatan, foto)]);
    auditGudang_(sesi, 'GUDANG_KIRIM', d.jumlah + ' x ' + d.daya + ' ' + d.merk + ' ' + d.statusMcb + ' -> ' + String(tim.nama), platform);
    return { idOperasi: d.idOperasi, duplikat: false, mutasiId: ids };
  });
}

function tarikStokTim_(sesi, data, platform) {
  wajibAdminGudang_(sesi);
  wajibKonfigGudang_();
  var h = bacaIsianStok_(data, { timId: { tipe: 'uuid', wajib: true }, jumlah: GUD_JUMLAH_, alasan: { tipe: 'teks', wajib: true, maks: 200 } }, true), d = h.d;
  materialAktifGudang_(d.materialId);
  return denganLock_(function () {
    var tim = timAktifAda_(d.timId);
    var t = tabelGudang_('db_Material_Mutasi');
    if (operasiSudahAda_(t.rows, d.idOperasi)) return { idOperasi: d.idOperasi, duplikat: true };
    var k = kunciDariIsian_(d);
    if ((saldoLokasi_(t.rows, d.timId)[k] || 0) < d.jumlah) throw new SisiError_('STOK_TIDAK_CUKUP', 'tim');
    var foto = simpanFotoGudang_(h.bytes, ['Gudang', 'Mutasi', tglJakarta_(new Date(sekarangMsGud_()))], d.idOperasi + '-TARIK', d.idOperasi + '_TARIK.jpg');
    var ids = tulisMutasi_(sesi, t, [barisJenis_(d, 'TARIK_TIM', d.timId, -d.jumlah, 'TARIK', d.alasan, foto),
      barisJenis_(d, 'TARIK_TIM', 'GUDANG', d.jumlah, 'TARIK', d.alasan, foto)]);
    auditGudang_(sesi, 'GUDANG_TARIK', d.jumlah + ' x ' + d.daya + ' ' + d.merk + ' ' + d.statusMcb + ' <- ' + String(tim.nama) + ': ' + d.alasan, platform);
    return { idOperasi: d.idOperasi, duplikat: false, mutasiId: ids };
  });
}

/** Koreksi stok: jumlah BARU suatu jenis di GUDANG atau satu tim. Alasan wajib. Jumlah sama = tanpaPerubahan. */
function koreksiStok_(sesi, data, platform) {
  wajibAdminGudang_(sesi);
  wajibKonfigGudang_();
  var h = bacaIsianStok_(data, { lokasi: { tipe: 'teks', wajib: true, maks: 40 }, alasan: { tipe: 'teks', wajib: true, maks: 200 },
    jumlahBaru: { tipe: 'angka', wajib: true, bulat: true, min: 0, max: 100000 } }, true), d = h.d;
  if (d.lokasi !== 'GUDANG') validasi_({ lokasi: d.lokasi }, { lokasi: { tipe: 'uuid', wajib: true } });
  materialAktifGudang_(d.materialId);
  return denganLock_(function () {
    if (d.lokasi !== 'GUDANG') timAktifAda_(d.lokasi);
    var t = tabelGudang_('db_Material_Mutasi');
    if (operasiSudahAda_(t.rows, d.idOperasi)) return { idOperasi: d.idOperasi, duplikat: true };
    var k = kunciDariIsian_(d), sekarang = saldoLokasi_(t.rows, d.lokasi)[k] || 0, selisih = d.jumlahBaru - sekarang;
    if (selisih === 0) return { idOperasi: d.idOperasi, duplikat: false, tanpaPerubahan: true, jumlah: sekarang };
    var foto = simpanFotoGudang_(h.bytes, ['Gudang', 'Mutasi', tglJakarta_(new Date(sekarangMsGud_()))], d.idOperasi + '-KOREKSI', d.idOperasi + '_KOREKSI.jpg');
    var ids = tulisMutasi_(sesi, t, [barisJenis_(d, d.lokasi === 'GUDANG' ? 'KOREKSI_GUDANG' : 'KOREKSI_TIM', d.lokasi, selisih, 'KOREKSI', d.alasan, foto)]);
    tulisLogKoreksi_(sesi, tabelGudang_('db_Material_LogKoreksi'), [{ jenis_objek: 'STOK', objek_id: d.lokasi + '|' + k, kolom: 'jumlah',
      nilai_lama: sekarang, nilai_baru: d.jumlahBaru, alasan: d.alasan }]);
    auditGudang_(sesi, 'GUDANG_KOREKSI', d.lokasi + ' ' + k + ': ' + sekarang + ' -> ' + d.jumlahBaru + ' (' + d.alasan + ')', platform);
    return { idOperasi: d.idOperasi, duplikat: false, tanpaPerubahan: false, mutasiId: ids[0], jumlah: d.jumlahBaru };
  });
}

function daftarJenis_(saldo) {
  return Object.keys(saldo).sort().map(function (k) { return jenisDariKunci_(k, saldo[k]); });
}

/** Saldo gudang + saldo tiap tim (dipisah: diizinkan / tanpa izin) + 200 mutasi terbaru (boleh disaring timId). */
function getGudangStok_(sesi, data) {
  wajibAdminGudang_(sesi);
  wajibKonfigGudang_();
  var d = validasi_(data, { timId: { tipe: 'uuid' } });
  var mutasi = tabelGudang_('db_Material_Mutasi').rows;
  var izin = izinMaterialRows_(), material = tabelMaterialHartek_().rows;
  var tim = timAktifGudang_().map(function (t) {
    var id = String(t.tim_id), saldo = saldoLokasi_(mutasi, id);
    var boleh = {};
    materialBolehTim_(material, izin, id).forEach(function (m) { boleh[String(m.material_id)] = true; });
    var stok = {}, tanpa = {};
    Object.keys(saldo).forEach(function (k) { (boleh[k.split('|')[0]] ? stok : tanpa)[k] = saldo[k]; });
    var punyaIzin = Object.keys(boleh).length > 0;
    return { timId: id, nama: String(t.nama), jenisTim: String(t.jenis || '').trim().toUpperCase(), stok: daftarJenis_(stok), tanpaIzin: daftarJenis_(tanpa), punyaIzin: punyaIzin };
  }).filter(function (t) { return t.punyaIzin || t.stok.length || t.tanpaIzin.length; });
  var riwayat = mutasi.filter(function (r) { return !d.timId || String(r.lokasi) === d.timId; }).slice(-200).reverse().map(function (r) {
    return { mutasiId: String(r.mutasi_id), waktu: String(r.waktu), jenisMutasi: String(r.jenis_mutasi), lokasi: String(r.lokasi), materialId: String(r.material_id),
      daya: String(r.daya), merk: String(r.merk), statusMcb: String(r.status_mcb), jumlah: Number(r.jumlah), catatan: String(r.catatan || ''), linkFoto: String(r.link_foto || '') };
  });
  return { gudang: daftarJenis_(saldoLokasi_(mutasi, 'GUDANG')), tim: tim, mutasi: riwayat };
}
