/**
 * Master untuk HP. Data kecil, jadi dikirim utuh + versi (hash isi).
 * HP kirim versi terakhir; kalau sama, server cukup jawab berubah:false.
 * Baris tanpa ID (belum dilengkapi ADMIN_lengkapiMaster) dilewati.
 */
function getMaster_(sesi, data) {
  var d = validasi_(data, { versi: { tipe: 'teks', maks: 80 } });
  var angkaAtauNull = function (v) { return v === '' || v === null || v === undefined ? null : Number(v); };
  var isi = {
    tim: tabel_('MASTER_SHEET_ID', 'db_Tim').rows.filter(function (r) { return r.tim_id; }).map(function (r) {
      return { id: String(r.tim_id), jenis: String(r.jenis), nama: String(r.nama), kode: pad2_(r.kode), aktif: isAktif_(r.aktif) };
    }),
    jaringan: tabel_('MASTER_SHEET_ID', 'db_Jaringan').rows.filter(function (r) { return r.section_id; }).map(function (r) {
      return { id: String(r.section_id), penyulang: String(r.penyulang), section: String(r.section),
               parentId: r.parent_section_id ? String(r.parent_section_id) : null,
               urutan: Number(r.urutan) || 0, aktif: isAktif_(r.aktif) };
    }),
    jenisPekerjaan: tabel_('MASTER_SHEET_ID', 'db_Jenis_Pekerjaan').rows.filter(function (r) { return r.jenis_id; }).map(function (r) {
      return { id: String(r.jenis_id), modul: String(r.modul), nama: String(r.nama), satuan: String(r.satuan),
               diameterMin: angkaAtauNull(r.diameter_min), diameterMax: angkaAtauNull(r.diameter_max),
               urutan: Number(r.urutan) || 0, aktif: isAktif_(r.aktif) };
    })
  };
  var versi = sha256Hex_(JSON.stringify(isi)).slice(0, 16);
  if (d.versi && d.versi === versi) return { versi: versi, berubah: false };
  return { versi: versi, berubah: true, isi: isi };
}
