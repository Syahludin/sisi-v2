/**
 * v1.0.51 Absensi safety briefing (permintaan Master Guswan 1 Nov 2026).
 * Dua pengabsen (ADMIN_ES + ADMIN) mengisi staf berbeda dari HP, tiap staf satu dari 8 status per hari.
 * Satu baris per tanggal + petugas_id di abs_Absensi (ABSENSI_SHEET_ID). Rekap bulanan TIDAK disimpan: dihitung dari baris harian.
 * Bagian pertama berkas ini murni (tanpa akses sheet): status, rekap bulan, teks WhatsApp.
 */

/** Delapan status. Urutan ABS_URUTAN_SIMBOL_ = urutan simbol di teks WhatsApp (HADIR tidak dihitung, hanya penanda hari ini). */
var ABS_STATUS_ = {
  HADIR: { simbol: '✅', nama: 'Hadir Tepat Waktu' },
  TELAT: { simbol: '*️⃣', nama: 'Hadir Telat' },
  TANPA_KET: { simbol: '❌', nama: 'Tidak Hadir Tanpa Keterangan' },
  ABSEN: { simbol: '🚷', nama: 'Absen/Tidak masuk kerja tanpa keterangan' },
  KET: { simbol: '📌', nama: 'Tidak Hadir dengan Keterangan', wajibKet: true },
  TMK: { simbol: '🇨🇭', nama: 'TMK, sakit dengan SKS' },
  CUTI: { simbol: '🆓', nama: 'Cuti kerja' },
  IZIN: { simbol: '🔤', nama: 'Izin tidak masuk kerja', wajibKet: true }
};
var ABS_URUTAN_SIMBOL_ = ['TMK', 'CUTI', 'IZIN', 'KET', 'TELAT', 'TANPA_KET', 'ABSEN'];

function absStatusAda_(s) { return Object.prototype.hasOwnProperty.call(ABS_STATUS_, s); }

/**
 * Hitungan per petugas untuk bulan [bulan] ('yyyy-MM') sampai [sampaiTanggal] ('yyyy-MM-dd', hari itu ikut).
 * Baris: { tanggal, petugas_id, status }. HADIR dan status tak dikenal tidak dihitung; petugas tanpa hitungan tidak muncul.
 */
function rekapBulan_(baris, bulan, sampaiTanggal) {
  var hasil = {};
  baris.forEach(function (r) {
    var tgl = String(r.tanggal);
    if (tgl.slice(0, 7) !== bulan || tgl > sampaiTanggal) return;
    if (!absStatusAda_(r.status) || r.status === 'HADIR') return;
    var id = String(r.petugas_id);
    var o = hasil[id] = hasil[id] || { TELAT: 0, TANPA_KET: 0, ABSEN: 0, KET: 0, TMK: 0, CUTI: 0, IZIN: 0 };
    o[r.status]++;
  });
  return hasil;
}

var ABS_LEGENDA_ = [
  '*Note/Catatan:*', '✅ Hadir Tepat Waktu', '❌ Tidak Hadir tanpa Keterangan', '*️⃣ Hadir Namun Telat', '📌 Tidak hadir dengan keterangan',
  '🇨🇭 TMK - sakit dgn SKS', '🆓 Cuti kerja', '🔤 Izin tdk masuk kerja (sakit tanpa SKS, atau izin di luar izin resmi perusahaan)', '🚷 Absen/Tidak masuk kerja tanpa keterangan', '⏳ Belum diabsen'
];

/**
 * Teks WhatsApp harian.
 *   tanggal 'yyyy-MM-dd' (hari ini), jamSimpan 'HH.mm',
 *   tim [{ nama, jenis }] (urutan = urutan tampil), staf [{ petugasId, nama, timIndex }] (diurut nama di dalam tim),
 *   hariIni { petugasId: { status, keterangan } }, rekap = hasil rekapBulan_ (sampai hari ini).
 * Baris staf: "* Nama" + simbol+jumlah (urutan ABS_URUTAN_SIMBOL_, angka selalu) + "✅" bila hari ini HADIR + alasan hari ini.
 * Belum diabsen: staf Yandal tidak ditulis (bisa bukan shift pagi), staf lain "⏳ belum diabsen". Kelompok tanpa baris tidak ditulis.
 */
function teksWa_(o) {
  var baris = ['*Absensi kehadiran safety breafing ' + BULAN_ID_[Number(o.tanggal.slice(5, 7)) - 1] + ' ' + o.tanggal.slice(0, 4) + '*',
    tglIndo_(o.tanggal), 'Pukul : ' + o.jamSimpan + ' WIB'];   // tglIndo_ / BULAN_ID_: 60_Laporan_UP3.js, 14_ROW_Laporan.js
  o.tim.forEach(function (t, i) {
    var anggota = o.staf.filter(function (s) { return s.timIndex === i; })
      .sort(function (a, b) { return String(a.nama).localeCompare(String(b.nama)); });
    var isi = [];
    anggota.forEach(function (s) {
      var h = o.hariIni[s.petugasId];
      if (!h && t.jenis === 'YANDAL') return;
      var bagian = ['* ' + String(s.nama).trim()];
      var hit = o.rekap[s.petugasId];
      if (hit) ABS_URUTAN_SIMBOL_.forEach(function (k) { if (hit[k] > 0) bagian.push(ABS_STATUS_[k].simbol + hit[k]); });
      if (!h) bagian.push('⏳ belum diabsen');
      else {
        if (h.status === 'HADIR') bagian.push(ABS_STATUS_.HADIR.simbol);
        if (h.keterangan) bagian.push(String(h.keterangan).trim());
      }
      isi.push(bagian.join(' '));
    });
    if (isi.length) baris = baris.concat(['*' + t.nama + '*'], isi);
  });
  return baris.concat(ABS_LEGENDA_).join('\n');
}

// ====================== Sheet + aksi server ======================

var ABS_HEADER_ = ['tanggal', 'petugas_id', 'tim_id', 'status', 'keterangan', 'diabsen_oleh', 'diabsen_pada', 'diubah_oleh', 'diubah_pada', 'revision'];
var ABS_ISIAN_MAKS_ = 100;
var ABS_KET_MAKS_ = 200;

/** Jam server (ms). Dipisah supaya uji bisa mengganti. */
function sekarangMsAbs_() { return Date.now(); }

/** Hanya ADMIN / ADMIN_ES / SUPER. Dicek PALING AWAL di setiap aksi, sebelum isi data dibaca. */
function wajibPengabsen_(sesi) {
  if (!sesi || ['ADMIN', 'ADMIN_ES', 'SUPER'].indexOf(sesi.role) === -1) {
    throw new SisiError_('AKSES_DITOLAK', 'absensi khusus koordinator / admin');
  }
}

/** Dipanggil paling awal setelah peran: tanpa spreadsheet absensi tidak ada yang dibaca atau ditulis. */
function wajibKonfigAbsensi_() {
  if (!cfg_().ABSENSI_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'ABSENSI_SHEET_ID');
}

function tabelAbsensi_() {
  wajibKonfigAbsensi_();
  return cekHeaderSkema_(tabel_('ABSENSI_SHEET_ID', 'abs_Absensi'), 'ABSENSI_SHEET_ID', 'abs_Absensi');
}

/** Sel waktu (teks WIB atau Date yang diubah Sheets) -> 'yyyy-MM-dd HH:mm:ss' WIB. */
function waktuSelAbs_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : waktuWib_(v.getTime(), true);
  return v === null || v === undefined ? '' : String(v).trim();
}

/** Peserta absensi = petugas aktif dengan tim terisi yang aktif di db_Tim. Petugas ganda = DATA_GANDA (fail closed). */
function pesertaAbsensi_(petugasRows, timRows) {
  var timAktifById = {};
  timRows.forEach(function (t) { if (t.tim_id && isAktif_(t.aktif)) timAktifById[String(t.tim_id)] = true; });
  var lihat = {}, hasil = [];
  petugasRows.forEach(function (p) {
    if (!p.petugas_id) return;
    var id = String(p.petugas_id);
    if (lihat[id]) throw new SisiError_('DATA_GANDA', 'db_Petugas ' + id);
    lihat[id] = true;
    if (isAktif_(p.aktif) && p.tim && timAktifById[String(p.tim)]) hasil.push({ petugasId: id, nama: String(p.nama).trim(), timId: String(p.tim) });
  });
  return hasil;
}

/** { 'yyyy-MM-dd|petugas_id': baris }. Kunci kembar = DATA_GANDA (fail closed: hitungan dan kunci pengabsen jadi tidak pasti). */
function indeksAbsensi_(rows) {
  var peta = {};
  rows.forEach(function (r) {
    var k = tglSel_(r.tanggal) + '|' + String(r.petugas_id);
    if (peta[k]) throw new SisiError_('DATA_GANDA', 'abs_Absensi ' + k);
    peta[k] = r;
  });
  return peta;
}

function ketSelAbs_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

function getAbsensi_(sesi, data) {
  wajibPengabsen_(sesi);
  wajibKonfigAbsensi_();
  validasi_(data, {});
  var hari = tglJakarta_(new Date(sekarangMsAbs_()));
  var timRows = tabel_('MASTER_SHEET_ID', 'db_Tim').rows;
  var peserta = pesertaAbsensi_(tabelPetugas_().rows, timRows);
  var rows = tabelAbsensi_().rows;
  var peta = indeksAbsensi_(rows);
  var nama = {};
  tabel_('MASTER_SHEET_ID', 'db_Users').rows.forEach(function (u) { if (u.user_id) nama[String(u.user_id)] = String(u.nama || '').trim(); });

  var tim = timRows.filter(function (t) { return t.tim_id && peserta.some(function (p) { return p.timId === String(t.tim_id); }); })
    .map(function (t) { return { timId: String(t.tim_id), nama: String(t.nama), jenis: String(t.jenis || '') }; });
  var indexTim = {};
  tim.forEach(function (t, i) { indexTim[t.timId] = i; });
  peserta.sort(function (a, b) { return indexTim[a.timId] - indexTim[b.timId] || a.nama.localeCompare(b.nama); });

  var hariIni = {}, terakhir = '';
  var staf = peserta.map(function (p) {
    var r = peta[hari + '|' + p.petugasId];
    if (!r) return { petugasId: p.petugasId, nama: p.nama, timId: p.timId, status: null, keterangan: '', diabsenOleh: null, milikSaya: false };
    hariIni[p.petugasId] = { status: String(r.status), keterangan: ketSelAbs_(r.keterangan) };
    var pada = waktuSelAbs_(r.diubah_pada) || waktuSelAbs_(r.diabsen_pada);
    if (pada > terakhir) terakhir = pada;
    var oleh = String(r.diabsen_oleh);
    return { petugasId: p.petugasId, nama: p.nama, timId: p.timId, status: String(r.status), keterangan: ketSelAbs_(r.keterangan),
             diabsenOleh: { userId: oleh, nama: nama[oleh] || '' }, milikSaya: oleh === String(sesi.userId) };
  });
  var semua = rekapBulan_(rows.map(function (r) { return { tanggal: tglSel_(r.tanggal), petugas_id: String(r.petugas_id), status: String(r.status) }; }),
    hari.slice(0, 7), hari);
  var rekap = {};
  peserta.forEach(function (p) { if (semua[p.petugasId]) rekap[p.petugasId] = semua[p.petugasId]; });
  var jamSimpan = (terakhir || waktuWib_(sekarangMsAbs_(), true)).slice(11, 16).replace(':', '.');
  return {
    tanggal: hari, tim: tim, staf: staf, rekap: rekap, jamSimpan: jamSimpan,
    teksWa: teksWa_({ tanggal: hari, jamSimpan: jamSimpan, tim: tim,
      staf: peserta.map(function (p) { return { petugasId: p.petugasId, nama: p.nama, timIndex: indexTim[p.timId] }; }), hariIni: hariIni, rekap: rekap })
  };
}

/**
 * Simpan isian absensi HARI INI (WIB). data: { tanggal, isian: [{ petugasId, status, keterangan? }] }.
 * Hasil: { tanggal, diterima: [petugasId], ditolak: [{ petugasId, kode }] } (parsial: yang sah tetap tersimpan).
 * Tanggal bukan hari ini = HARI_LAMPAU / HARI_DEPAN untuk seluruh panggilan. Baris yang diabsen_oleh-nya akun lain
 * = DIKUNCI_PENGABSEN_LAIN (dicek di dalam lock). Isian sama dari pengabsen yang sama = diterima tanpa mengubah baris (kirim ulang aman).
 */
function simpanAbsensi_(sesi, data, platform) {
  wajibPengabsen_(sesi);
  wajibKonfigAbsensi_();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SisiError_('DATA_TIDAK_VALID');
  Object.keys(data).forEach(function (k) { if (k !== 'tanggal' && k !== 'isian') throw new SisiError_('FIELD_TIDAK_DIKENAL', k); });
  var tanggal = validasi_({ tanggal: data.tanggal }, { tanggal: { tipe: 'tanggal', wajib: true } }).tanggal;
  var isian = data.isian;
  if (isian === undefined || isian === null) throw new SisiError_('FIELD_WAJIB', 'isian');
  if (!Array.isArray(isian)) throw new SisiError_('TIPE_SALAH', 'isian');
  if (!isian.length) throw new SisiError_('FIELD_WAJIB', 'isian');
  if (isian.length > ABS_ISIAN_MAKS_) throw new SisiError_('TERLALU_BANYAK', 'isian');
  var hari = tglJakarta_(new Date(sekarangMsAbs_()));
  if (tanggal < hari) throw new SisiError_('HARI_LAMPAU', tanggal);
  if (tanggal > hari) throw new SisiError_('HARI_DEPAN', tanggal);
  var lihat = {};
  isian = isian.map(function (x) {
    var v = validasi_(x, {
      petugasId: { tipe: 'uuid', wajib: true },
      status: { tipe: 'teks', wajib: true, maks: 12, pola: /^[A-Z_]+$/ },
      keterangan: { tipe: 'teks', maks: ABS_KET_MAKS_ }
    });
    if (!absStatusAda_(v.status)) throw new SisiError_('FORMAT_SALAH', 'status');
    if (ABS_STATUS_[v.status].wajibKet && !v.keterangan) throw new SisiError_('FIELD_WAJIB', 'keterangan');
    if (!ABS_STATUS_[v.status].wajibKet && v.keterangan) throw new SisiError_('FIELD_TIDAK_DIKENAL', 'keterangan');
    if (lihat[v.petugasId]) throw new SisiError_('ID_GANDA', v.petugasId);
    lihat[v.petugasId] = true;
    v.keterangan = v.keterangan || '';
    return v;
  });

  return denganLock_(function () {
    var peserta = {};
    pesertaAbsensi_(tabelPetugas_().rows, tabel_('MASTER_SHEET_ID', 'db_Tim').rows).forEach(function (p) { peserta[p.petugasId] = p; });
    var t = tabelAbsensi_();
    var peta = indeksAbsensi_(t.rows);
    var logT = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var sekarang = waktuWib_(sekarangMsAbs_(), true);
    var diterima = [], ditolak = [], ubah = [], baru = [];
    isian.forEach(function (x) {
      var p = peserta[x.petugasId];
      if (!p) return ditolak.push({ petugasId: x.petugasId, kode: 'PETUGAS_BUKAN_PESERTA' });
      var ada = peta[hari + '|' + x.petugasId];
      if (!ada) {
        baru.push({ tanggal: hari, petugas_id: x.petugasId, tim_id: p.timId, status: x.status, keterangan: x.keterangan,
                    diabsen_oleh: sesi.userId, diabsen_pada: sekarang, diubah_oleh: '', diubah_pada: '', revision: 1 });
      } else if (String(ada.diabsen_oleh) !== String(sesi.userId)) {
        return ditolak.push({ petugasId: x.petugasId, kode: 'DIKUNCI_PENGABSEN_LAIN' });
      } else if (String(ada.status) !== x.status || ketSelAbs_(ada.keterangan) !== x.keterangan) {
        ubah.push({ r: ada, u: { status: x.status, keterangan: x.keterangan, diubah_oleh: sesi.userId, diubah_pada: sekarang } });
      }
      diterima.push(x.petugasId);
    });
    tulisBlok_(t, ubah, baru);
    auditLog_(sesi, 'SIMPAN_ABSENSI', 'abs_Absensi', hari + ': diterima ' + diterima.length + ' (baru ' + baru.length + ', ubah ' + ubah.length + '), ditolak ' + ditolak.length, platform, logT);
    return { tanggal: hari, diterima: diterima, ditolak: ditolak };
  });
}

// ====================== Alat admin (jalankan dari editor Apps Script oleh pemilik) ======================

function ADMIN_siapkanSheetAbsensi() { pastikanPemilik_(); return jalankanSiapkanAbsensi_(false); }

function ADMIN_cekSheetAbsensi() { pastikanPemilik_(); return jalankanSiapkanAbsensi_(true); }

/**
 * Buat tab abs_Absensi (header + kolom waktu berformat teks) bila belum ada. Tab yang sudah ada hanya DICEK: header yang
 * beda tidak pernah ditimpa. Hasil: jumlah masalah (0 = siap). uji = tidak mengubah apa pun.
 */
function jalankanSiapkanAbsensi_(uji) {
  var id = cfg_().ABSENSI_SHEET_ID;
  if (!id) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'ABSENSI_SHEET_ID');
  return denganLock_(function () {
    var ss = bukaSpreadsheet_(id), sh = ss.getSheetByName('abs_Absensi');
    if (!sh) {
      if (uji) { console.warn('abs_Absensi belum ada: jalankan ADMIN_siapkanSheetAbsensi'); return 1; }
      sh = ss.insertSheet('abs_Absensi');
      sh.getRange(1, 1, 1, ABS_HEADER_.length).setValues([ABS_HEADER_]);
      ['tanggal', 'diabsen_pada', 'diubah_pada'].forEach(function (k) {
        if (typeof sh.getRange(1, 1).setNumberFormat === 'function') sh.getRange(1, ABS_HEADER_.indexOf(k) + 1, sh.getMaxRows(), 1).setNumberFormat('@');
      });
      if (typeof sh.setFrozenRows === 'function') sh.setFrozenRows(1);
      console.log('abs_Absensi dibuat');
      return 0;
    }
    var ada = sh.getRange(1, 1, 1, Math.max(ABS_HEADER_.length, sh.getLastColumn())).getValues()[0].map(function (h) { return String(h).trim(); });
    while (ada.length && !ada[ada.length - 1]) ada.pop();
    if (ada.join('|') !== ABS_HEADER_.join('|')) {
      console.error('abs_Absensi: header beda dari skema (' + ada.join(',') + '), tidak diubah');
      return 1;
    }
    console.log('abs_Absensi: header sesuai');
    return 0;
  });
}

/** Bagian ADMIN_cekKonfigurasi untuk absensi. */
function cekKonfigAbsensi_(c) {
  if (!c.ABSENSI_SHEET_ID) {
    console.log('');
    console.log('--- Absensi (SiSi_Absensi) ---');
    console.log('  [DILEWATI]    ABSENSI_SHEET_ID kosong (isi di CFG_JSON, lalu ADMIN_siapkanSheetAbsensi)');
    return 0;
  }
  var masalah = 0;
  console.log('');
  console.log('--- Absensi (SiSi_Absensi) ---');
  try {
    tabelAbsensi_();
    console.log('  [OK]          abs_Absensi header sesuai');
  } catch (e) { masalah++; console.error('  [GAGAL]       abs_Absensi: ' + (e.kode || e.message) + ' (jalankan ADMIN_siapkanSheetAbsensi)'); }
  try {
    var menu = tabel_('MASTER_SHEET_ID', 'db_Menu').rows.filter(function (x) { return String(x.menu_kode).trim() === 'OPS_ABSENSI'; })[0];
    if (menu) console.log('  [OK]          menu OPS_ABSENSI ada di db_Menu');
    else { masalah++; console.warn('  [PERHATIAN]   menu OPS_ABSENSI belum ada di db_Menu (impor docs/db_Menu.tsv)'); }
  } catch (eM) { masalah++; console.error('  [GAGAL]       db_Menu: ' + (eM.kode || eM.message)); }
  return masalah;
}
