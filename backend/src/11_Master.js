/**
 * Master untuk HP, dibagi per modul (database) supaya bisa di-download satu per satu dari Pengaturan:
 *   tim             db_Tim
 *   jaringan        db_Jaringan (penyulang + section)
 *   jenisPekerjaan  db_Jenis_Pekerjaan
 *   pengguna        db_Users (tanpa email; password ada di SiSi_Auth dan tidak pernah dikirim)
 * Tiap modul punya versi (hash isi). HP kirim versiModul; modul yang sama cukup dijawab berubah:false.
 * Baris tanpa ID (belum dilengkapi ADMIN_lengkapiMaster) dilewati.
 *
 * Kompatibel lama: tanpa `modul` + `versiModul`, respons tetap memuat versi/berubah/isi gabungan.
 */
var MODUL_MASTER_ = {
  tim: function () {
    return tabel_('MASTER_SHEET_ID', 'db_Tim').rows.filter(function (r) { return r.tim_id; }).map(function (r) {
      return { id: String(r.tim_id), jenis: String(r.jenis), nama: String(r.nama), kode: pad2_(r.kode), aktif: isAktif_(r.aktif) };
    });
  },
  jaringan: function () {
    return tabel_('MASTER_SHEET_ID', 'db_Jaringan').rows.filter(function (r) { return r.section_id; }).map(function (r) {
      return { id: String(r.section_id), penyulang: String(r.penyulang), section: String(r.section),
               parentId: r.parent_section_id ? String(r.parent_section_id) : null,
               urutan: Number(r.urutan) || 0, baris: Number(r._baris) || 0, aktif: isAktif_(r.aktif) };
    });
  },
  jenisPekerjaan: function () {
    var angkaAtauNull = function (v) { return v === '' || v === null || v === undefined ? null : Number(v); };
    return tabel_('MASTER_SHEET_ID', 'db_Jenis_Pekerjaan').rows.filter(function (r) { return r.jenis_id; }).map(function (r) {
      return { id: String(r.jenis_id), modul: String(r.modul), nama: String(r.nama), satuan: String(r.satuan),
               diameterMin: angkaAtauNull(r.diameter_min), diameterMax: angkaAtauNull(r.diameter_max),
               urutan: Number(r.urutan) || 0, aktif: isAktif_(r.aktif) };
    });
  },
  pengguna: function (sesi) {
    // Sengaja TIDAK mengirim email. Audit 4 Okt 2026: username + role hanya untuk ADMIN/SUPER
    // (daftar username = bahan tebak password massal). PETUGAS hanya anggota tim sendiri; ADMIN_ES semua tim, tanpa username/role.
    var lengkap = sesi && (sesi.role === 'ADMIN' || sesi.role === 'SUPER');
    var timSendiri = sesi && sesi.role === 'PETUGAS' ? String(sesi.timId || '') : null;
    return tabel_('MASTER_SHEET_ID', 'db_Users').rows.filter(function (r) {
      return r.user_id && (timSendiri === null || (timSendiri && String(r.tim_id) === timSendiri));
    }).map(function (r) {
      var o = { id: String(r.user_id), nama: String(r.nama), timId: r.tim_id ? String(r.tim_id) : null, aktif: isAktif_(r.aktif) };
      if (lengkap) { o.username = String(r.username).trim().toLowerCase(); o.role = String(r.role).trim(); }
      return o;
    });
  }
};

function getMaster_(sesi, data) {
  data = data || {};
  if (typeof data !== 'object' || Array.isArray(data)) throw new SisiError_('DATA_TIDAK_VALID');
  var skema = { versi: 1, modul: 1, versiModul: 1 };
  Object.keys(data).forEach(function (k) { if (!skema[k]) throw new SisiError_('FIELD_TIDAK_DIKENAL', k); });
  var semua = Object.keys(MODUL_MASTER_);

  var diminta = semua;
  if (data.modul !== undefined && data.modul !== null) {
    if (!Array.isArray(data.modul) || data.modul.length === 0 || data.modul.length > semua.length) throw new SisiError_('TIPE_SALAH', 'modul');
    diminta = [];
    data.modul.forEach(function (m) {
      if (typeof m !== 'string' || semua.indexOf(m) < 0) throw new SisiError_('FORMAT_SALAH', 'modul');
      if (diminta.indexOf(m) < 0) diminta.push(m);
    });
  }
  var versiModul = {};
  if (data.versiModul !== undefined && data.versiModul !== null) {
    if (typeof data.versiModul !== 'object' || Array.isArray(data.versiModul)) throw new SisiError_('TIPE_SALAH', 'versiModul');
    Object.keys(data.versiModul).forEach(function (m) {
      var v = data.versiModul[m];
      if (semua.indexOf(m) < 0) throw new SisiError_('FORMAT_SALAH', 'versiModul');
      if (typeof v !== 'string' || v.length > 80) throw new SisiError_('TIPE_SALAH', 'versiModul');
      versiModul[m] = v;
    });
  }
  if (data.versi !== undefined && data.versi !== null && (typeof data.versi !== 'string' || data.versi.length > 80)) {
    throw new SisiError_('TIPE_SALAH', 'versi');
  }

  var hasil = { modul: {} };
  var gabungan = {};
  diminta.forEach(function (m) {
    var isi = MODUL_MASTER_[m](sesi);
    gabungan[m] = isi;
    var v = sha256Hex_(JSON.stringify(isi)).slice(0, 16);
    var berubah = versiModul[m] !== v;
    hasil.modul[m] = berubah ? { versi: v, berubah: true, jumlah: isi.length, isi: isi } : { versi: v, berubah: false, jumlah: isi.length };
  });

  // Bentuk lama (dipakai scripts/uji-sync.ps1): hanya kalau HP tidak memakai versi per modul.
  if (data.modul === undefined && data.versiModul === undefined) {
    var versi = sha256Hex_(JSON.stringify(gabungan)).slice(0, 16);
    hasil.versi = versi;
    hasil.berubah = data.versi !== versi;
    if (hasil.berubah) hasil.isi = gabungan;
  }
  return hasil;
}
