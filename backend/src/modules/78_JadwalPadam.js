/**
 * v1.0.17 (permintaan kvlar 22 Okt 2026): JADWAL PADAM, port dari v1 (SiSi_BackEnd/Teknik/Jadwal-Padam-Code.js,
 * Jadwal-Padam-Delete.js, ZZ-Jadwal-Padam-Calendar-Compat.js, Core/ZZ-T08-Jadwal-Ownership.js) ke arsitektur v2.
 * KHUSUS ADMIN (menu OPS_JADWAL_PADAM, bukan PETUGAS), termasuk format WA rentang tanggal.
 *
 * Kolom sama dengan v1 Rekap_Jadwal_Padam (No, Kode Jadwal Padam, ULP, Penyulang, Section, Jenis Pekerjaan, Hari,
 * Tanggal, Jam Padam, Jam Nyala, Durasi, Jumlah Gardu, Jumlah Pelanggan, Daerah Section, Beban (A), ENS, Pelanggan VIP,
 * Lokasi Pekerjaan, Status Jadwal Padam, Status Pekerjaan) ditambah kolom v2 (beban_mw, jadwal_id, audit).
 * Spreadsheet SiSi_JadwalPadam (Script Property JADWAL_PADAM_SHEET_ID): db_jadwal_padam.
 * Master Daerah Padam v1 -> SiSi_Master db_Daerah_Padam (penyulang + section: gardu, pelanggan, daerah, VIP, beban).
 *
 * Aturan v1 yang dipertahankan:
 *  - penyulang + section wajib ada di master; jumlah gardu / pelanggan / daerah / beban / VIP diambil dari master.
 *  - durasi (jam) = jam nyala - jam padam (lewat tengah malam = +24 jam). ENS (Rp) = beban MW x durasi x 1444,7
 *    (v1.0.18: rupiah bulat, dibulatkan ke atas, ensRupiahJp_).
 *  - status jadwal: Terjadwal (baru) -> Terealisasi / Batal Pemadaman; status pekerjaan: Padam / Tanpa Padam.
 *  - hapus hanya jadwal Terjadwal (v2: ditandai Dihapus, baris tetap untuk audit, tidak tampil lagi).
 *  - WA: hanya status pekerjaan Padam dalam rentang tanggal (dari .. sampai), urut tanggal + jam padam.
 * Tambahan v2: ubah hanya selama Terjadwal (data realisasi terkunci), idBaris = kirim ulang tidak membuat jadwal kembar,
 * revision (KONFLIK_REVISION), log_Audit.
 */

var JP_SHEET_ = 'db_jadwal_padam';
var JP_MASTER_SHEET_ = 'db_Daerah_Padam';
var JP_MENU_ = 'OPS_JADWAL_PADAM';
var JP_TARIF_KWH_ = 1444.7;   // sama dengan JADWAL_PADAM_TARIF_KWH v1
var JP_STATUS_ = { jadwal: 'Terjadwal', realisasi: 'Terealisasi', batal: 'Batal Pemadaman', hapus: 'Dihapus' };
var JP_STATUS_PEKERJAAN_ = ['Padam', 'Tanpa Padam'];
var JP_RENTANG_MAKS_HARI_ = 366;
var JP_HARI_ = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
var JP_BULAN_ = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

var JP_HEADER_ = {
  db_jadwal_padam: ['nomor', 'kode_jadwal', 'ulp', 'penyulang', 'section', 'jenis_pekerjaan', 'hari', 'tanggal', 'jam_padam', 'jam_nyala',
    'durasi', 'jumlah_gardu', 'jumlah_pelanggan', 'daerah_padam', 'beban_a', 'beban_mw', 'ens_rupiah', 'pelanggan_vip',
    'lokasi_pekerjaan', 'status_jadwal', 'status_pekerjaan', 'jadwal_id',
    'dibuat_oleh', 'diubah_oleh', 'timestamp', 'timestamp_update', 'revision']   // audit = INSJAR_AUDIT_ (tanpa rujukan lintas file di top-level)
};
var JP_MASTER_HEADER_ = {
  db_Daerah_Padam: ['nomor', 'ulp', 'up3', 'gi', 'penyulang', 'section', 'jumlah_gardu', 'jumlah_pelanggan', 'daerah_section',
    'pelanggan_vip', 'beban_mw', 'arus_a', 'aktif', 'daerah_id', 'revision', 'timestamp_update', 'diubah_oleh']
};

/* ===== peran & helper ===== */

/** Jadwal Padam khusus admin (bukan PETUGAS). Tulis tetap butuh aksi UBAH (guard_). */
function wajibAdminJadwalPadam_(sesi) {
  if (!sesi || sesi.role === 'PETUGAS' || ROLE_VALID_().indexOf(sesi.role) === -1) {
    throw new SisiError_('AKSES_DITOLAK', 'jadwal padam khusus admin');
  }
}

function teksJp_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function normJp_(v) { return teksJp_(v).toLowerCase().replace(/\s+/g, ' '); }

function tabelJp_() {
  if (!cfg_().JADWAL_PADAM_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'JADWAL_PADAM_SHEET_ID');
  var t = tabel_('JADWAL_PADAM_SHEET_ID', JP_SHEET_);
  var beda = bedaStruktur_(t.header.slice(0, JP_HEADER_[JP_SHEET_].length), JP_HEADER_[JP_SHEET_]);
  if (beda.length) throw new SisiError_('STRUKTUR_BERUBAH', JP_SHEET_ + ' ' + beda.slice(0, 3).join('; '));
  return t;
}

/** Master Daerah Padam aktif. */
function masterDaerahPadam_() {
  var rows;
  try { rows = tabel_('MASTER_SHEET_ID', JP_MASTER_SHEET_).rows; } catch (e) {
    if (e && e.kode === 'SHEET_TIDAK_ADA') return [];
    throw e;
  }
  return rows.filter(function (r) { return isAktif_(r.aktif) && teksJp_(r.penyulang) && teksJp_(r.section); }).map(function (r) {
    return {
      daerahId: teksJp_(r.daerah_id), ulp: teksJp_(r.ulp), up3: teksJp_(r.up3), gi: teksJp_(r.gi),
      penyulang: teksJp_(r.penyulang), section: teksJp_(r.section),
      jumlahGardu: Number(r.jumlah_gardu) || 0, jumlahPelanggan: Number(r.jumlah_pelanggan) || 0,
      daerahSection: teksJp_(r.daerah_section), pelangganVip: teksJp_(r.pelanggan_vip),
      bebanMw: Number(String(r.beban_mw).replace(',', '.')) || 0, arus: r.arus_a === '' || r.arus_a === undefined ? '' : Number(r.arus_a)
    };
  }).sort(function (a, b) { return a.penyulang.localeCompare(b.penyulang) || a.section.localeCompare(b.section); });
}

function masterJpUntuk_(master, penyulang, section) {
  var m = master.filter(function (x) { return normJp_(x.penyulang) === normJp_(penyulang) && normJp_(x.section) === normJp_(section); })[0];
  if (!m) throw new SisiError_('SECTION_TIDAK_VALID', penyulang + ' / ' + section);
  return m;
}

/** 'HH:mm' -> menit (null = salah format). */
function menitJp_(s) {
  var m = /^(\d{2}):(\d{2})$/.exec(teksJp_(s));
  if (!m) return null;
  var h = Number(m[1]), n = Number(m[2]);
  return h < 24 && n < 60 ? h * 60 + n : null;
}

/** Durasi jam (lewat tengah malam = +24 jam), sama dengan v1. */
function durasiJp_(jamPadam, jamNyala) {
  var a = menitJp_(jamPadam), b = menitJp_(jamNyala);
  if (a === null) throw new SisiError_('FORMAT_SALAH', 'jamPadam');
  if (b === null) throw new SisiError_('FORMAT_SALAH', 'jamNyala');
  if (b < a) b += 1440;
  return (b - a) / 60;
}

function hariJp_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? JP_HARI_[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()] : '';
}

function tanggalLabelJp_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(teksJp_(iso));
  return m ? m[3] + ' ' + JP_BULAN_[Number(m[2]) - 1] + ' ' + m[1] : teksJp_(iso);
}

/** Jam dari sel (teks 'HH:mm' / Date dari Sheets). */
function jamSelJp_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Jakarta', 'HH:mm');
  return teksJp_(v).slice(0, 5);
}

/** Angka format Indonesia: ribuan '.', desimal ','. */
function angkaIdJp_(n, digit) {
  var x = Number(n);
  if (!isFinite(x)) x = 0;
  var s = Math.abs(x).toFixed(digit || 0).split('.');
  s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (x < 0 ? '-' : '') + s.join(',');
}

/**
 * v1.0.18 (permintaan kvlar 22 Okt 2026): ENS = rupiah bulat, dibulatkan ke atas, tanpa desimal. Menerima angka atau teks
 * lama (mis. "Rp 1.234.567,89", "4045,16", "1.445"). Derau pecahan float dibuang dulu (1444,0000001 tetap 1444).
 * Hasil null = kosong / tidak terbaca.
 */
function ensRupiahJp_(v) {
  if (v === null || v === undefined) return null;
  var x = v;
  if (typeof v !== 'number') {
    var s = String(v).replace(/rp\.?/i, '').replace(/\s+/g, '');
    if (!s) return null;
    if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) {
      s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (s.indexOf(',') !== -1) {
      s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    x = Number(s);
  }
  if (!isFinite(x)) return null;
  return Math.ceil(Math.round(x * 100) / 100);
}

/** ENS (Rp) = beban MW x durasi jam x tarif, rupiah bulat ke atas. */
function hitungEnsJp_(bebanMw, durasi) { return ensRupiahJp_((Number(bebanMw) || 0) * (Number(durasi) || 0) * JP_TARIF_KWH_); }

function jadwalKeHp_(r) {
  return {
    jadwalId: teksJp_(r.jadwal_id), kode: teksJp_(r.kode_jadwal), ulp: teksJp_(r.ulp), penyulang: teksJp_(r.penyulang),
    section: teksJp_(r.section), jenis: teksJp_(r.jenis_pekerjaan), tanggal: tglSel_(r.tanggal), hari: teksJp_(r.hari) || hariJp_(tglSel_(r.tanggal)),
    jamPadam: jamSelJp_(r.jam_padam), jamNyala: jamSelJp_(r.jam_nyala), durasi: Number(r.durasi) || 0,
    jumlahGardu: Number(r.jumlah_gardu) || 0, jumlahPelanggan: Number(r.jumlah_pelanggan) || 0, daerah: teksJp_(r.daerah_padam),
    bebanA: r.beban_a === '' || r.beban_a === undefined ? '' : Number(r.beban_a), bebanMw: Number(r.beban_mw) || 0,
    ensRupiah: ensRupiahJp_(r.ens_rupiah) || hitungEnsJp_(r.beban_mw, r.durasi), vip: teksJp_(r.pelanggan_vip), lokasi: teksJp_(r.lokasi_pekerjaan),
    status: teksJp_(r.status_jadwal) || JP_STATUS_.jadwal, statusPekerjaan: teksJp_(r.status_pekerjaan) || 'Padam',
    revision: Number(r.revision) || 1
  };
}

/** Jadwal (bukan Dihapus) dalam rentang, urut tanggal lalu jam padam. Dipakai daftar, WA, dan kalender tim. */
function jadwalPadamRentang_(dari, sampai, saring) {
  var s = saring || {};
  return tabelJp_().rows.map(jadwalKeHp_).filter(function (x) {
    if (!x.jadwalId || x.status === JP_STATUS_.hapus) return false;
    if (x.tanggal < dari || x.tanggal > sampai) return false;
    if (s.penyulang && normJp_(x.penyulang) !== normJp_(s.penyulang)) return false;
    if (s.status && normJp_(x.status) !== normJp_(s.status)) return false;
    if (s.statusPekerjaan && normJp_(x.statusPekerjaan) !== normJp_(s.statusPekerjaan)) return false;
    return true;
  }).sort(function (a, b) { return a.tanggal.localeCompare(b.tanggal) || a.jamPadam.localeCompare(b.jamPadam); });
}

function rentangJp_(d) {
  if (d.dari > d.sampai) throw new SisiError_('RENTANG_TIDAK_VALID', d.dari + '>' + d.sampai);
  var hari = Math.round((Date.parse(d.sampai + 'T00:00:00Z') - Date.parse(d.dari + 'T00:00:00Z')) / 864e5) + 1;
  if (hari > JP_RENTANG_MAKS_HARI_) throw new SisiError_('RENTANG_TERLALU_PANJANG', String(hari));
}

/* ===== endpoint baca ===== */

function getMasterJadwalPadam_(sesi) {
  wajibAdminJadwalPadam_(sesi);
  return { daerah: masterDaerahPadam_(), statusPekerjaan: JP_STATUS_PEKERJAAN_.slice(), tarifKwh: JP_TARIF_KWH_ };
}

function getJadwalPadam_(sesi, data) {
  wajibAdminJadwalPadam_(sesi);
  var d = validasi_(data, {
    dari: { tipe: 'tanggal', wajib: true }, sampai: { tipe: 'tanggal', wajib: true },
    penyulang: { tipe: 'teks', maks: 80 },
    status: { tipe: 'pilihan', pilihan: [JP_STATUS_.jadwal, JP_STATUS_.realisasi, JP_STATUS_.batal] },
    statusPekerjaan: { tipe: 'pilihan', pilihan: JP_STATUS_PEKERJAAN_ }
  });
  rentangJp_(d);
  var rows = jadwalPadamRentang_(d.dari, d.sampai, d);
  var ringkas = { total: rows.length, terjadwal: 0, terealisasi: 0, batal: 0, padam: 0, pelanggan: 0, ens: 0 };
  rows.forEach(function (x) {
    if (x.status === JP_STATUS_.jadwal) ringkas.terjadwal++;
    else if (x.status === JP_STATUS_.realisasi) ringkas.terealisasi++;
    else if (x.status === JP_STATUS_.batal) ringkas.batal++;
    if (x.statusPekerjaan === 'Padam' && x.status !== JP_STATUS_.batal) { ringkas.padam++; ringkas.pelanggan += x.jumlahPelanggan; ringkas.ens += x.ensRupiah; }
  });
  return { dari: d.dari, sampai: d.sampai, ringkas: ringkas, jadwal: rows };
}

/** Teks WA rentang tanggal (format v1 getJadwalPadamWaText): hanya status pekerjaan Padam, tanpa yang dibatalkan. */
function teksWaJadwalPadam_(rows, dari, sampai, ulp) {
  var b = [
    '*RENCANA PADAM PEKERJAAN PEMELIHARAAN PENYULANG ULP ' + teksJp_(ulp || cfg_().ULP_NAMA).toUpperCase() + '*',
    '*Periode:* ' + tanggalLabelJp_(dari) + ' s.d. ' + tanggalLabelJp_(sampai),
    ''
  ];
  rows.forEach(function (x, i) {
    b.push(
      '*' + (i + 1) + '. Hari/Tanggal:* ' + (x.hari || hariJp_(x.tanggal)) + ', ' + tanggalLabelJp_(x.tanggal),
      '*ULP:* ' + x.ulp,
      '*Penyulang:* ' + x.penyulang,
      '*Section Pemadaman:* ' + x.section,
      '*Jenis Pekerjaan:* ' + x.jenis,
      '*Jam Padam:* ' + x.jamPadam + ' WIB',
      '*Jam Nyala:* ' + x.jamNyala + ' WIB',
      '*Durasi:* ' + angkaIdJp_((Number(x.durasi) || 0) * 60, 0) + ' Menit',
      '*Daerah Padam:* ' + x.daerah,
      '*Jumlah Gardu:* ' + angkaIdJp_(x.jumlahGardu, 0) + ' Unit',
      '*Jumlah Pelanggan:* ' + angkaIdJp_(x.jumlahPelanggan, 0) + ' Pelanggan',
      '*Beban:* ' + angkaIdJp_(x.bebanA, 2) + ' A',
      '*ENS:* Rp' + angkaIdJp_(x.ensRupiah, 0),
      ''
    );
  });
  return b.join('\n').replace(/\n+$/, '');
}

function getWaJadwalPadam_(sesi, data) {
  wajibAdminJadwalPadam_(sesi);
  var d = validasi_(data, {
    dari: { tipe: 'tanggal', wajib: true }, sampai: { tipe: 'tanggal', wajib: true }, penyulang: { tipe: 'teks', maks: 80 },
    status: { tipe: 'pilihan', pilihan: [JP_STATUS_.jadwal, JP_STATUS_.realisasi] }
  });
  rentangJp_(d);
  var rows = jadwalPadamRentang_(d.dari, d.sampai, { penyulang: d.penyulang, status: d.status, statusPekerjaan: 'Padam' })
    .filter(function (x) { return x.status !== JP_STATUS_.batal; });
  if (!rows.length) throw new SisiError_('JADWAL_PADAM_KOSONG', d.dari + '..' + d.sampai);
  return { dari: d.dari, sampai: d.sampai, jumlah: rows.length, teks: teksWaJadwalPadam_(rows, d.dari, d.sampai, rows[0].ulp) };
}

/* ===== endpoint tulis ===== */

var JP_ISI_ = {
  penyulang: { tipe: 'teks', wajib: true, maks: 80 }, section: { tipe: 'teks', wajib: true, maks: 120 },
  jenis: { tipe: 'teks', wajib: true, maks: 200 }, tanggal: { tipe: 'tanggal', wajib: true },
  jamPadam: { tipe: 'teks', wajib: true, maks: 5 }, jamNyala: { tipe: 'teks', wajib: true, maks: 5 },
  statusPekerjaan: { tipe: 'pilihan', wajib: true, pilihan: JP_STATUS_PEKERJAAN_ },
  lokasi: { tipe: 'teks', maks: 300, multiBaris: true, maksBaris: 5 }
};

/** Kolom turunan master + durasi + ENS (sama dengan simpanJadwalPadam v1). */
function isiJadwalDariMaster_(d) {
  var m = masterJpUntuk_(masterDaerahPadam_(), d.penyulang, d.section);
  var durasi = durasiJp_(d.jamPadam, d.jamNyala);
  return {
    ulp: m.ulp || cfg_().ULP_NAMA, penyulang: m.penyulang, section: m.section, jenis_pekerjaan: d.jenis, hari: hariJp_(d.tanggal),
    tanggal: d.tanggal, jam_padam: d.jamPadam, jam_nyala: d.jamNyala, durasi: durasi, jumlah_gardu: m.jumlahGardu,
    jumlah_pelanggan: m.jumlahPelanggan, daerah_padam: m.daerahSection, beban_a: m.arus, beban_mw: m.bebanMw,
    ens_rupiah: hitungEnsJp_(m.bebanMw, durasi), pelanggan_vip: m.pelangganVip,
    lokasi_pekerjaan: d.lokasi || '', status_pekerjaan: d.statusPekerjaan
  };
}

function simpanJadwalPadam_(sesi, data) {
  wajibAdminJadwalPadam_(sesi);
  var s = Object.assign({ idBaris: { tipe: 'uuid' } }, JP_ISI_);
  var d = validasi_(data, s);
  var isi = isiJadwalDariMaster_(d);
  return denganLock_(function () {
    var t = tabelJp_();
    if (d.idBaris) {
      var ada = t.rows.filter(function (r) { return teksJp_(r.jadwal_id) === d.idBaris; })[0];
      if (ada) return { jadwalId: d.idBaris, kode: teksJp_(ada.kode_jadwal), duplikat: true, jadwal: jadwalKeHp_(ada) };
    }
    var awalan = 'JP-' + cfg_().KODE_ULP + yymmddInsJar_(d.tanggal);
    var kode = awalan + pad3_(urutBerikutHartek_(t.rows, 'kode_jadwal', awalan));
    var sekarang = sekarangIso_();
    var baris = sisipAuditInsJar_(Object.assign({ nomor: t.rows.length + 1, kode_jadwal: kode, status_jadwal: JP_STATUS_.jadwal,
      jadwal_id: d.idBaris || uuid_() }, isi), sesi, sekarang);
    tambahBaris_(t, baris);
    auditLog_(sesi, 'JADWAL_PADAM_SIMPAN', kode, isi.penyulang + ' ' + isi.section + ' ' + d.tanggal, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { jadwalId: baris.jadwal_id, kode: kode, revision: 1, jadwal: jadwalKeHp_(baris) };
  }, 20000);
}

function cariJadwal_(t, jadwalId) {
  var r = t.rows.filter(function (x) { return teksJp_(x.jadwal_id) === String(jadwalId); });
  if (!r.length || teksJp_(r[0].status_jadwal) === JP_STATUS_.hapus) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'jadwal');
  if (r.length > 1) throw new SisiError_('DATA_GANDA', jadwalId);
  return r[0];
}

/** Ubah jadwal (hanya selama Terjadwal; jadwal terealisasi / batal terkunci untuk audit). */
function ubahJadwalPadam_(sesi, data) {
  wajibAdminJadwalPadam_(sesi);
  var s = Object.assign({ jadwalId: { tipe: 'uuid', wajib: true }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 } }, JP_ISI_);
  var d = validasi_(data, s);
  var isi = isiJadwalDariMaster_(d);
  return denganLock_(function () {
    var t = tabelJp_();
    var r = cariJadwal_(t, d.jadwalId);
    if (teksJp_(r.status_jadwal) !== JP_STATUS_.jadwal) throw new SisiError_('JADWAL_TERKUNCI', teksJp_(r.status_jadwal));
    if (Number(r.revision) !== d.revision) throw new SisiError_('KONFLIK_REVISION', d.jadwalId);
    isi.timestamp_update = sekarangIso_();
    isi.diubah_oleh = sesi.userId;
    var rev = ubahBaris_(t, 'jadwal_id', d.jadwalId, isi, d.revision);
    auditLog_(sesi, 'JADWAL_PADAM_UBAH', teksJp_(r.kode_jadwal), isi.penyulang + ' ' + isi.section + ' ' + d.tanggal, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { jadwalId: d.jadwalId, kode: teksJp_(r.kode_jadwal), revision: rev, jadwal: jadwalKeHp_(Object.assign({}, r, isi, { revision: rev })) };
  }, 20000);
}

/** Terealisasi / Batal Pemadaman (v1 updateStatusJadwalPadam; "Batal Pekerjaan" v1 = Batal Pemadaman). */
function ubahStatusJadwalPadam_(sesi, data) {
  wajibAdminJadwalPadam_(sesi);
  var d = validasi_(data, {
    jadwalId: { tipe: 'uuid', wajib: true }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 },
    status: { tipe: 'pilihan', wajib: true, pilihan: [JP_STATUS_.realisasi, JP_STATUS_.batal, 'Batal Pekerjaan'] }
  });
  var status = d.status === 'Batal Pekerjaan' ? JP_STATUS_.batal : d.status;
  return denganLock_(function () {
    var t = tabelJp_();
    var r = cariJadwal_(t, d.jadwalId);
    if (teksJp_(r.status_jadwal) === status) return { jadwalId: d.jadwalId, revision: Number(r.revision) || 1, duplikat: true, jadwal: jadwalKeHp_(r) };
    if (teksJp_(r.status_jadwal) !== JP_STATUS_.jadwal) throw new SisiError_('JADWAL_TERKUNCI', teksJp_(r.status_jadwal));
    if (Number(r.revision) !== d.revision) throw new SisiError_('KONFLIK_REVISION', d.jadwalId);
    var u = { status_jadwal: status, timestamp_update: sekarangIso_(), diubah_oleh: sesi.userId };
    var rev = ubahBaris_(t, 'jadwal_id', d.jadwalId, u, d.revision);
    auditLog_(sesi, 'JADWAL_PADAM_STATUS', teksJp_(r.kode_jadwal), status, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { jadwalId: d.jadwalId, revision: rev, jadwal: jadwalKeHp_(Object.assign({}, r, u, { revision: rev })) };
  }, 20000);
}

/** Hapus (v1 hapusJadwalPadam): hanya Terjadwal. v2 = ditandai Dihapus (baris tetap untuk audit). */
function hapusJadwalPadam_(sesi, data) {
  wajibAdminJadwalPadam_(sesi);
  var d = validasi_(data, { jadwalId: { tipe: 'uuid', wajib: true }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 } });
  return denganLock_(function () {
    var t = tabelJp_();
    var semua = t.rows.filter(function (x) { return teksJp_(x.jadwal_id) === String(d.jadwalId); });
    if (semua.length === 1 && teksJp_(semua[0].status_jadwal) === JP_STATUS_.hapus) return { jadwalId: d.jadwalId, duplikat: true };
    var r = cariJadwal_(t, d.jadwalId);
    if (teksJp_(r.status_jadwal) !== JP_STATUS_.jadwal) throw new SisiError_('JADWAL_TERKUNCI', teksJp_(r.status_jadwal));
    if (Number(r.revision) !== d.revision) throw new SisiError_('KONFLIK_REVISION', d.jadwalId);
    var rev = ubahBaris_(t, 'jadwal_id', d.jadwalId, { status_jadwal: JP_STATUS_.hapus, timestamp_update: sekarangIso_(), diubah_oleh: sesi.userId }, d.revision);
    auditLog_(sesi, 'JADWAL_PADAM_HAPUS', teksJp_(r.kode_jadwal), '', 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { jadwalId: d.jadwalId, revision: rev };
  }, 20000);
}

/* ===== kalender (dipakai Kalender Tim, modules/79_Kalender_Tim.js) ===== */

/** Jadwal satu bulan (yyyy-MM) untuk kalender. Tanpa SiSi_JadwalPadam = [] (fitur lain tetap jalan). */
function jadwalPadamBulan_(bulan) {
  if (!cfg_().JADWAL_PADAM_SHEET_ID) return [];
  var akhir = new Date(Date.UTC(Number(bulan.slice(0, 4)), Number(bulan.slice(5, 7)), 0)).getUTCDate();
  try {
    return jadwalPadamRentang_(bulan + '-01', bulan + '-' + ('0' + akhir).slice(-2), {}).filter(function (x) { return x.status !== JP_STATUS_.batal; });
  } catch (e) {
    if (e && (e.kode === 'SHEET_TIDAK_ADA' || e.kode === 'STRUKTUR_BERUBAH')) return [];
    throw e;
  }
}

/**
 * v1.0.18 (permintaan kvlar 22 Okt 2026): db_Daerah_Padam = sumber jumlah gardu, jumlah pelanggan, daerah section, dan
 * pelanggan VIP per section padam. Dipanggil ADMIN_lengkapiMaster (di dalam lock): tab dibuat kalau belum ada, lalu
 * setiap penyulang + section aktif db_Jaringan yang belum punya baris ditambahkan (angka dampak dikosongkan, diisi admin).
 * Baris yang sudah ada tidak pernah diubah. Hasil = jumlah baris baru.
 */
function lengkapiDaerahPadam_() {
  var ss = bukaSpreadsheet_(cfg_().MASTER_SHEET_ID);
  siapkanTabHartek_(ss, JP_MASTER_SHEET_, JP_MASTER_HEADER_[JP_MASTER_SHEET_], 'SiSi_Master > ', false);
  if (typeof SpreadsheetApp !== 'undefined' && typeof SpreadsheetApp.flush === 'function') SpreadsheetApp.flush();
  var t = tabel_('MASTER_SHEET_ID', JP_MASTER_SHEET_);
  var ada = {};
  t.rows.forEach(function (r) { ada[normJp_(r.penyulang) + '|' + normJp_(r.section)] = true; });
  var baru = [];
  tabel_('MASTER_SHEET_ID', 'db_Jaringan').rows.forEach(function (r) {
    var k = normJp_(r.penyulang) + '|' + normJp_(r.section);
    if (!isAktif_(r.aktif) || !teksJp_(r.penyulang) || !teksJp_(r.section) || ada[k]) return;
    ada[k] = true;
    baru.push({ nomor: t.rows.length + baru.length + 1, ulp: cfg_().ULP_NAMA, penyulang: teksJp_(r.penyulang), section: teksJp_(r.section),
                aktif: 'TRUE', daerah_id: uuid_(), revision: 1, timestamp_update: sekarangIso_(), diubah_oleh: 'admin-tools' });
  });
  tambahBanyak_(t, baru);
  console.log('db_Daerah_Padam: ' + baru.length + ' penyulang + section baru dari db_Jaringan' +
    (baru.length ? ' (isi jumlah_gardu, jumlah_pelanggan, daerah_section, pelanggan_vip, beban_mw, arus_a)' : ''));
  return baru.length;
}

/* ===== ADMIN: siapkan sheet ===== */

function ADMIN_siapkanSheetJadwalPadam() { pastikanPemilik_(); return jalankanSiapkanJadwalPadam_(false); }

function ADMIN_cekSheetJadwalPadam() { pastikanPemilik_(); return jalankanSiapkanJadwalPadam_(true); }

function jalankanSiapkanJadwalPadam_(uji) {
  var c = cfg_();
  var target = [{ id: c.MASTER_SHEET_ID, label: 'SiSi_Master > ', tab: JP_MASTER_HEADER_ }];
  if (c.JADWAL_PADAM_SHEET_ID) target.push({ id: c.JADWAL_PADAM_SHEET_ID, label: 'SiSi_JadwalPadam > ', tab: JP_HEADER_ });
  console.log(uji ? '=== CEK SHEET JADWAL PADAM (tidak mengubah apa pun) ===' : '=== SIAPKAN SHEET JADWAL PADAM ===');
  var masalah = 0;
  denganLock_(function () {
    target.forEach(function (tg) {
      var ss = bukaSpreadsheet_(tg.id);
      Object.keys(tg.tab).forEach(function (n) {
        if (siapkanTabHartek_(ss, n, tg.tab[n], tg.label, uji).status === 'GAGAL') masalah++;
      });
    });
    if (!c.JADWAL_PADAM_SHEET_ID) { masalah++; console.error('JADWAL_PADAM_SHEET_ID kosong: isi Script Property dengan ID spreadsheet SiSi_JadwalPadam.'); }
    if (!uji) {
      if (typeof SpreadsheetApp.flush === 'function') SpreadsheetApp.flush();
      try {
        var dm = tabel_('MASTER_SHEET_ID', JP_MASTER_SHEET_);
        var isi = isiKosongHartek_({ sheet: dm.sheet, header: dm.header, rows: dm.rows.filter(function (r) { return teksJp_(r.penyulang); }) },
          'daerah_id', function () { return uuid_(); });
        if (isi.terisi) console.log('SiSi_Master > db_Daerah_Padam: ' + isi.terisi + ' daerah_id diisi');
      } catch (e) { if (!e || e.kode !== 'SHEET_TIDAK_ADA') throw e; }
      if (c.JADWAL_PADAM_SHEET_ID) console.log('SiSi_JadwalPadam > db_jadwal_padam: ' + rapikanEnsJp_() + ' nilai ENS dibulatkan ke rupiah');
    }
  }, 30000);
  console.log(masalah ? 'SELESAI dengan ' + masalah + ' masalah.' : 'SELESAI. Isi db_Daerah_Padam (atau ADMIN_migrasiJadwalPadam), impor db_Menu OPS_JADWAL_PADAM.');
  return masalah;
}

/** v1.0.18: kolom ens_rupiah lama (desimal / teks "Rp ...") ditulis ulang jadi rupiah bulat ke atas. Hasil = jumlah sel diubah. */
function rapikanEnsJp_() {
  var t = tabelJp_();
  var col = t.header.indexOf('ens_rupiah') + 1, n = 0;
  t.rows.forEach(function (r) {
    var v = ensRupiahJp_(r.ens_rupiah);
    if (v === null || v === r.ens_rupiah) return;
    t.sheet.getRange(r._baris, col).setValue(v);
    n++;
  });
  return n;
}

/**
 * v1.0.17: bagian ADMIN_cekKonfigurasi untuk fitur v1.0.17 (Jadwal Padam, log_Sinkron sinkron atomik, kepemilikan
 * WO Hartek, sumber migrasi v1). Hasil = jumlah masalah.
 */
function cekKonfigV1017_(c) {
  var masalah = 0;
  var ok = function (p) { console.log('  [OK]          ' + p); };
  var lewati = function (p) { console.log('  [DILEWATI]    ' + p); };
  var perhatian = function (p) { masalah++; console.warn('  [PERHATIAN]   ' + p); };
  console.log('');
  console.log('--- v1.0.17: Jadwal Padam, Sinkron Atomik, Kepemilikan WO, Migrasi v1 ---');
  if (!c.JADWAL_PADAM_SHEET_ID) {
    lewati('JADWAL_PADAM_SHEET_ID kosong: menu Jadwal Padam + jadwal di Kalender Tim belum aktif');
  } else {
    try { ok('db_jadwal_padam (' + tabelJp_().rows.length + ' baris)'); } catch (e) { perhatian('db_jadwal_padam: ' + (e.kode || e.message) + ' (jalankan ADMIN_siapkanSheetJadwalPadam)'); }
    var dm = masterDaerahPadam_().length;
    if (dm) ok('db_Daerah_Padam: ' + dm + ' penyulang + section aktif'); else perhatian('db_Daerah_Padam kosong: jadwal baru tidak bisa dibuat (isi master / ADMIN_migrasiJadwalPadamJalan)');
  }
  try { ok('log_Sinkron (' + tabel_('AUTH_SHEET_ID', SEGEL_SHEET_).rows.length + ' segel)'); } catch (e2) {
    perhatian('log_Sinkron belum ada di SiSi_Auth: SIAP WA admin Hartek memakai perilaku lama (jalankan ADMIN_siapkanSheetSinkron)');
  }
  // v1.0.18: kepemilikan WO Hartek = db_Kepemilikan_Material (sumber yang sama dengan form Hartek)
  var kp = kepemilikanAktifHartek_().length;
  if (kp) ok('db_Kepemilikan_Material: ' + kp + ' kepemilikan aktif (WO Hartek)'); else perhatian('db_Kepemilikan_Material kosong / belum ada: material WO Hartek akan ditolak');
  if (c.INSPEKSI_LAMA_SHEET_ID) ok('INSPEKSI_LAMA_SHEET_ID terisi (ADMIN_migrasiInspeksiCek)'); else lewati('INSPEKSI_LAMA_SHEET_ID kosong (migrasi temuan / InsJar / InsDu v1)');
  if (c.JADWAL_PADAM_LAMA_SHEET_ID) ok('JADWAL_PADAM_LAMA_SHEET_ID terisi (ADMIN_migrasiJadwalPadamCek)'); else lewati('JADWAL_PADAM_LAMA_SHEET_ID kosong (migrasi Jadwal Padam v1)');
  return masalah;
}
