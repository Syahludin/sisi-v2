/**
 * v1.0.50 Request P0 ke Command Center (permintaan Master Guswan 30 Okt 2026).
 * Petugas YANDAL (HP) menekan "Request ke Command Center" di P0 yang sudah tersimpan di server (yan_P0):
 *  - SiSi menambah SATU baris ke tab P0_PENUGASAN di spreadsheet Command Center (Script Property CC_SHEET_ID, bukan
 *    file SiSi; akun pemilik Apps Script wajib punya akses Edit).
 *  - Referensinya dicatat di kolom tambahan yan_P0 (YAN_P0_KOLOM_CC_, di ujung kanan, ditambah otomatis).
 *  - Dua arah: getStatusP0Cc membaca balik status / approved_by / waktu_mulai / foto_mulai yang diisi Command Center.
 * Isian baris P0_PENUGASAN:
 *  id P0-<yyyyMMdd>-<nnnn> (urut per tanggal di sheet CC) | no_p0 <CC_PREFIX_P0 (bawaan TBL)>-<nnnn> (urut terus)
 *  sumber 'request_yantek' | yantek_id + created_by = db_Users.cc_yantek_id / cc_user_id akun yang menekan
 *  jenis_gangguan = Nama Pekerjaan (Lain - Lain = Pekerjaan Lainnya) | detail_pekerjaan = Catatan + Section / Daerah
 *  status 'Open' | created_at = updated_at = jam server WIB | penyulang | foto_url = salinan foto P0 di CC_FOTO_FOLDER_ID
 * CATATAN (dibahas nanti, sengaja kosong): ref_titik_id + prioritas (dari hasil inspeksi), deadline, approved_by,
 * foto_mulai, waktu_mulai (diisi Command Center).
 */
var CC_TAB_P0_ = 'P0_PENUGASAN';
var CC_P0_HEADER_ = ['id', 'no_p0', 'sumber', 'ref_titik_id', 'yantek_id', 'jenis_gangguan', 'detail_pekerjaan', 'prioritas',
  'deadline', 'status', 'created_by', 'approved_by', 'created_at', 'updated_at', 'foto_url', 'penyulang', 'foto_mulai', 'waktu_mulai'];
var CC_SUMBER_ = 'request_yantek';
var CC_STATUS_AWAL_ = 'Open';
// kolom yan_P0 dari Command Center (tanpa akhiran _id: tulisBlok_ mengunci kolom *_id)
var CC_KOLOM_BACA_ = { status: 'CC Status', approved_by: 'CC Approved Oleh', waktu_mulai: 'CC Waktu Mulai', foto_mulai: 'CC Foto Mulai',
  updated_at: 'CC Update' };

/** Sel waktu Command Center (Date atau teks) -> teks WIB 'yyyy-MM-dd HH:mm:ss'. */
function teksWaktuCc_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return waktuWib_(v.getTime(), true);
  return teksP0_(v);
}

/** Nomor urut berikut dari nilai berawalan [awalan] (mis. 'TBL-' -> TBL-0007). Murni. */
function urutCc_(nilai, awalan) {
  var maks = 0;
  nilai.forEach(function (v) {
    var s = teksP0_(v);
    if (s.indexOf(awalan) !== 0) return;
    var n = Number(s.slice(awalan.length));
    if (isFinite(n) && n > maks) maks = n;
  });
  return awalan + ('000' + (maks + 1)).slice(-4);
}

/** Baris P0_PENUGASAN dari baris yan_P0. Murni (foto_url, akun CC, nomor dan jam dari pemanggil). */
function barisCcP0_(r, o) {
  var lain = teksP0_(r['Pekerjaan Lainnya']), nama = teksP0_(r['Nama Pekerjaan']);
  var lokasi = [teksP0_(r.Section), teksP0_(r.Daerah)].filter(String).join(' / ');
  var detail = [teksP0_(r.Catatan), lokasi ? 'Lokasi: ' + lokasi : '', 'Kode SiSi: ' + teksP0_(r['Kode P0'])].filter(String).join('. ');
  return {
    id: o.id, no_p0: o.noP0, sumber: CC_SUMBER_, ref_titik_id: '', yantek_id: o.yantekId,
    jenis_gangguan: lain && /lain/i.test(nama) ? lain : nama, detail_pekerjaan: detail, prioritas: '', deadline: '',
    status: CC_STATUS_AWAL_, created_by: o.userId, approved_by: '', created_at: o.waktu, updated_at: o.waktu,
    foto_url: o.fotoUrl, penyulang: teksP0_(r.Penyulang), foto_mulai: '', waktu_mulai: ''
  };
}

/** Tab P0_PENUGASAN (kolom wajib ada, boleh ada kolom lain). */
function tabelCcP0_() {
  if (!cfg_().CC_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'CC_SHEET_ID');
  var t = tabel_('CC_SHEET_ID', CC_TAB_P0_);
  var kurang = CC_P0_HEADER_.filter(function (h) { return t.header.indexOf(h) === -1; });
  if (kurang.length) throw new SisiError_('CONFIG_TIDAK_VALID', CC_TAB_P0_ + ' kolom kurang: ' + kurang.join(', '));
  return t;
}

/** Akun Command Center dari db_Users (cc_user_id, cc_yantek_id) akun yang login. */
function akunCcUser_(userId) {
  var u = tabel_('MASTER_SHEET_ID', 'db_Users').rows.filter(function (x) { return String(x.user_id) === String(userId); })[0];
  var hasil = { userId: teksP0_(u && u.cc_user_id), yantekId: teksP0_(u && u.cc_yantek_id) };
  if (!hasil.userId || !hasil.yantekId) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'db_Users cc_user_id / cc_yantek_id akun ini');
  return hasil;
}

/** Salin foto P0 pertama yang ada (Sebelum > Pekerjaan > Sesudah) ke folder Command Center. Gagal / tanpa folder = ''. */
function fotoCcP0_(r, noP0) {
  var folderId = cfg_().CC_FOTO_FOLDER_ID;
  if (!folderId) return '';
  var slot = YAN_SLOT_P0_.filter(function (s) { return teksP0_(r[YAN_KOLOM_FOTO_P0_[s].id]); })[0];
  if (!slot) return '';
  try {
    var asal = DriveApp.getFileById(teksP0_(r[YAN_KOLOM_FOTO_P0_[slot].id]));
    return asal.makeCopy(noP0 + '_' + slot + '.jpg', DriveApp.getFolderById(folderId)).getUrl();
  } catch (e) {
    console.warn('Salin foto P0 ke Command Center gagal: ' + String(e && e.message || e).slice(0, 80));
    return '';
  }
}

/** Ringkasan referensi CC satu baris yan_P0 untuk HP. */
function jawabCcP0_(r) {
  return {
    p0Id: String(r.p0_id), ccId: teksP0_(r['CC Id']), noP0: teksP0_(r['CC No P0']), status: teksP0_(r['CC Status']),
    approvedBy: teksP0_(r['CC Approved Oleh']), waktuMulai: teksP0_(r['CC Waktu Mulai']), fotoMulai: teksP0_(r['CC Foto Mulai']),
    update: teksP0_(r['CC Update']), waktuRequest: teksP0_(r['CC Waktu Request'])
  };
}

/** requestP0Cc { p0Id } (PETUGAS YANDAL, HP). Sudah pernah = jawaban lama (aman diulang). */
function requestP0Cc_(sesi, data, platform) {
  wajibPetugasYandalHp_(sesi, platform);
  var d = validasi_(data, { p0Id: { tipe: 'uuid', wajib: true } });
  return denganLock_(function () {
    var t = bacaSheetYandal_(['yan_P0']).yan_P0;
    var r = t.rows.filter(function (x) { return String(x.p0_id) === d.p0Id; })[0];
    if (!r || String(r.tim_id) !== String(sesi.timId)) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'P0 belum terkirim ke server');
    if (String(r.status || 'AKTIF') === 'BATAL') throw new SisiError_('SUDAH_BATAL', d.p0Id);
    if (teksP0_(r['CC Id'])) return jawabCcP0_(r);
    var akun = akunCcUser_(sesi.userId);
    var cc = tabelCcP0_(), c = cfg_(), sekarangMs = Date.now(), waktu = waktuWib_(sekarangMs, true);
    var id = urutCc_(cc.rows.map(function (x) { return x.id; }), 'P0-' + waktu.slice(0, 10).replace(/-/g, '') + '-');
    var noP0 = urutCc_(cc.rows.map(function (x) { return x.no_p0; }), c.CC_PREFIX_P0 + '-');
    tambahBaris_(cc, barisCcP0_(r, { id: id, noP0: noP0, yantekId: akun.yantekId, userId: akun.userId, waktu: waktu,
      fotoUrl: fotoCcP0_(r, noP0) }));
    var u = { 'CC Id': id, 'CC No P0': noP0, 'CC Status': CC_STATUS_AWAL_, 'CC Request Oleh': sesi.username,
      'CC Waktu Request': waktu, 'CC Update': waktu };
    tulisBlok_(t, [{ r: r, u: u }], []);
    return jawabCcP0_(r);
  });
}

/**
 * getStatusP0Cc { p0Ids } (maks 50, P0 tim sesi): baca balik P0_PENUGASAN, perubahan dicatat ke kolom CC yan_P0.
 * P0 yang belum di-request tidak dikembalikan.
 */
function getStatusP0Cc_(sesi, data, platform) {
  wajibPetugasYandalHp_(sesi, platform);
  var ids = Array.isArray(data && data.p0Ids) ? data.p0Ids.map(String).filter(function (x) { return /^[0-9a-f-]{36}$/i.test(x); }) : [];
  if (!ids.length || ids.length > 50) throw new SisiError_('DATA_TIDAK_VALID', 'p0Ids');
  var pilih = function (t) {
    return t.rows.filter(function (r) { return ids.indexOf(String(r.p0_id)) !== -1 && String(r.tim_id) === String(sesi.timId) && teksP0_(r['CC Id']); });
  };
  var t = bacaSheetYandal_(['yan_P0']).yan_P0, punya = pilih(t);
  if (!punya.length) return { p0: [] };
  var cc = {};
  tabelCcP0_().rows.forEach(function (x) { cc[teksP0_(x.id)] = x; });
  var ubah = function (r) {
    var x = cc[teksP0_(r['CC Id'])], u = {};
    if (!x) return u;
    Object.keys(CC_KOLOM_BACA_).forEach(function (k) {
      var v = k === 'updated_at' || k === 'waktu_mulai' ? teksWaktuCc_(x[k]) : teksP0_(x[k]);
      if (v !== teksP0_(r[CC_KOLOM_BACA_[k]])) u[CC_KOLOM_BACA_[k]] = v;
    });
    return u;
  };
  if (punya.some(function (r) { return Object.keys(ubah(r)).length; })) {
    denganLock_(function () {
      t = bacaSheetYandal_(['yan_P0']).yan_P0;
      punya = pilih(t);
      var daftar = punya.map(function (r) { return { r: r, u: ubah(r) }; }).filter(function (x) { return Object.keys(x.u).length; });
      tulisBlok_(t, daftar, []);
    });
  }
  return { p0: punya.map(jawabCcP0_) };
}
