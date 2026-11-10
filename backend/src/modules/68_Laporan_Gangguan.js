/**
 * v1.0.59 (permintaan Master Guswan 5 Nov 2026): LAPORAN GANGGUAN PENYULANG (menu OPS_LAP_GANGGUAN, WEB, khusus admin), teks WhatsApp
 * ke Asman Teknik Jar & Konst UP3 Bangka. Dua bagian dalam satu kiriman:
 *   1. Gangguan penyulang H-1 saja (tanggal tetap, tidak bisa diubah): 00:00 - 23:59 WIB hari kemarin, dilaporkan hari ini.
 *   2. Rekap bulan itu (tanggal 1 s.d. H-1): komulatif per kategori + Gangguan Tertinggi (PMT + Section per penyulang).
 * Sumber = salinan History Gangguan (63_Gangguan.js), HANYA DIBACA: PMT Trip = ggn_Penyulang jenis PMT, AR Lockout =
 * ggn_Penyulang selain PMT (gangguan section), AR Sukses = ggn_AR. Penyebab = kolom M sumber (ggn_ penyebab).
 * Hasil disimpan per tanggal di tab `lap_Gangguan_Penyulang` (LAPORAN_SHEET_ID; ADMIN_siapkanSheetLaporanGangguan), 1 baris /
 * tanggal (No, lap_id, Dibuat Oleh = pengguna yang membuka / SISTEM). Pemicu harian 06.00 WIB menyusunnya otomatis
 * (ADMIN_pasangPemicuLaporanGangguan). Salinan ggn_ disinkron jam 18.00, kejadian sesudahnya belum masuk: laporan yang disusun sebelum hari H-1 berakhir
 * (atau tersimpan sebelum itu) memicu sinkron dari sumber dulu. Belum disiapkan tabnya = tetap jalan, disusun saat dibuka.
 */
var LGG_MENU_ = 'OPS_LAP_GANGGUAN';
var LGG_SHEET_ = 'lap_Gangguan_Penyulang';
var LGG_HEADER_ = ['No', 'lap_id', 'Tanggal', 'Disusun Pada', 'Dibuat Oleh', 'PMT Trip', 'AR Sukses', 'AR Lockout', 'Teks', 'revision'];
var LGG_HEADER_LAMA_ = ['Tanggal', 'Disusun Pada', 'PMT Trip', 'AR Sukses', 'AR Lockout', 'Teks', 'revision'];   // sebelum 5 Nov 2026 (dimigrasi)
var LGG_PEMICU_FN_ = 'ADMIN_pemicuLaporanGangguan';
var LGG_JAM_PEMICU_ = 6;
var LGG_OLEH_PEMICU_ = 'SISTEM (pemicu 06.00)';
var LGG_KATEGORI_ = [['pmt', 'PMT Trip'], ['sukses', 'AR Sukses'], ['lockout', 'AR Lockout']];

/** 'TANJUNG LABU' -> 'Tanjung Labu'. */
function lggNama_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase()
    .replace(/(^|[\s\-\/(])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
}

function lggTgl_(v) { return v instanceof Date ? tglJakarta_(v) : String(v === null || v === undefined ? '' : v).slice(0, 10); }

/**
 * Rekap dari baris ggn_Penyulang + ggn_AR. Murni (diuji).
 * Hasil { harian: { pmt|sukses|lockout: [{ penyulang, penyebab }] }, bulan: { pmt|sukses|lockout: [{ nama, jumlah }] },
 * tertinggi: [{ nama, pmt, section }] }. bulan / tertinggi = tanggal 1 bulan itu s.d. tanggal (urut jumlah lalu nama).
 */
function hitungLaporanGangguan_(penyulang, ar, tanggal) {
  var bulan = tanggal.slice(0, 7), harian = {}, hitung = {};
  LGG_KATEGORI_.forEach(function (k) { harian[k[0]] = []; hitung[k[0]] = {}; });
  var catat = function (kat, o, waktu) {
    var nama = lggNama_(o.penyulang), w = lggTgl_(waktu);
    if (!nama || w.slice(0, 7) !== bulan || w > tanggal) return;
    hitung[kat][nama] = (hitung[kat][nama] || 0) + 1;
    if (w === tanggal) harian[kat].push({ penyulang: nama, penyebab: String(o.penyebab === null || o.penyebab === undefined ? '' : o.penyebab).replace(/\s+/g, ' ').trim() });
  };
  (penyulang || []).forEach(function (o) { catat(kategoriAlatGgn_(o) === 'pmt' ? 'pmt' : 'lockout', o, o.waktu_padam); });
  (ar || []).forEach(function (o) { catat('sukses', o, o.waktu_ar); });
  var urut = function (m) {
    return Object.keys(m).map(function (n) { return { nama: n, jumlah: m[n] }; })
      .sort(function (a, b) { return b.jumlah - a.jumlah || (a.nama < b.nama ? -1 : 1); });
  };
  var gabung = {};
  Object.keys(hitung.pmt).forEach(function (n) { gabung[n] = { nama: n, pmt: hitung.pmt[n], section: 0 }; });
  Object.keys(hitung.lockout).forEach(function (n) { (gabung[n] = gabung[n] || { nama: n, pmt: 0, section: 0 }).section = hitung.lockout[n]; });
  var semua = Object.keys(gabung).map(function (n) { return gabung[n]; });
  var maks = semua.reduce(function (m, x) { return Math.max(m, x.pmt + x.section); }, 0);
  var tertinggi = semua.filter(function (x) { return maks > 0 && x.pmt + x.section === maks; })
    .sort(function (a, b) { return a.nama < b.nama ? -1 : 1; });
  harian.pmt.reverse(); harian.sukses.reverse(); harian.lockout.reverse();   // tab ggn_ terbaru dulu -> urut kejadian
  return { harian: harian, bulan: { pmt: urut(hitung.pmt), sukses: urut(hitung.sukses), lockout: urut(hitung.lockout) }, tertinggi: tertinggi };
}

/**
 * Teks laporan WhatsApp. h = hasil hitungLaporanGangguan_, tanggal = H-1 (yyyy-MM-dd), ulp = cfg_().ULP_NAMA (kosong = Toboali;
 * review 8 Nov 2026: dulu "ULP Toboali" tertulis tetap, salah untuk project ULP lain). Murni (diuji).
 */
function teksLaporanGangguan_(h, tanggal, ulp) {
  var bagian = tglIndo_(tanggal).split(' ');   // ['Selasa,', '3', 'November', '2026']
  var judulBulan = bagian[2].toUpperCase() + ' ' + bagian[3];
  var L = [];
  L.push('Yth. Bapak MUP3 Bangka');
  L.push('Asman Teknik Jar & Konst UP3 Bangka');
  L.push('');
  L.push('Izin menyampaikan laporan gangguan ULP ' + (ulp || 'Toboali') + ' hari ' + tglIndo_(tanggal) + ', sebagai berikut :');
  L.push('');
  L.push('📍 GANGGUAN PENYULANG');
  LGG_KATEGORI_.forEach(function (k, i) {
    var daftar = h.harian[k[0]];
    L.push('▪️ ' + k[1] + ' : ' + (daftar.length ? daftar.length + ' kali' : 'NIHIL'));
    daftar.forEach(function (x) {
      L.push('- Penyulang : ' + x.penyulang);
      L.push('Penyebab : ' + (x.penyebab || '-'));
    });
    if (i < LGG_KATEGORI_.length - 1) L.push('');
  });
  L.push('');
  L.push('📊 REKAP GANGGUAN TERTINGGI BULAN ' + judulBulan);
  L.push('▪️ Gangguan Tertinggi (PMT/ACR/GH) :' + (h.tertinggi.length ? '' : ' NIHIL'));
  h.tertinggi.forEach(function (x) { L.push('- Penyulang ' + x.nama + ' (PMT ' + x.pmt + ' kali & Section ' + x.section + ' kali)'); });
  LGG_KATEGORI_.forEach(function (k) {
    var daftar = h.bulan[k[0]], total = daftar.reduce(function (s, x) { return s + x.jumlah; }, 0);
    L.push('');
    L.push('▪️ ' + k[1] + ' : ' + (total ? total + ' kali' : 'NIHIL'));
    daftar.forEach(function (x) { L.push('- ' + x.nama + ' (' + x.jumlah + ' kali)'); });
  });
  L.push('');
  L.push('Demikian kami sampaikan, Terimakasih.');
  return L.join('\n');
}

/** Akhir hari tanggal (00:00 WIB hari berikutnya) dalam milidetik. */
function akhirHariLaporanGangguan_(tanggal) { return Date.parse(geserTglIso_(tanggal, 1) + 'T00:00:00+07:00'); }

/** Salinan ggn_ perlu disinkron dulu bila terakhir disinkron sebelum hari laporan berakhir (kejadian sesudahnya belum masuk). Murni. */
function perluSinkronLaporanGangguan_(info, tanggal) {
  var w = info && info.waktu ? Date.parse(info.waktu) : NaN;
  return isNaN(w) || w < akhirHariLaporanGangguan_(tanggal);
}

/** Tab lap_Gangguan_Penyulang, null = belum disiapkan (laporan tetap disusun, tidak disimpan). */
function tabelLaporanGangguan_() {
  var t;
  try { t = tabel_('LAPORAN_SHEET_ID', LGG_SHEET_); } catch (e) { if (e.kode === 'SHEET_TIDAK_ADA') return null; throw e; }
  if (LGG_HEADER_.some(function (h, i) { return t.header[i] !== h; })) throw new SisiError_('CONFIG_TIDAK_VALID', 'header ' + LGG_SHEET_);
  return t;
}

/**
 * Editor: buat tab lap_Gangguan_Penyulang (sekali). Sudah ada = dicek; tab berheader lama (tanpa No / lap_id / Dibuat Oleh)
 * diubah ke susunan baru, isinya dipertahankan (Dibuat Oleh = MIGRASI).
 */
function ADMIN_siapkanSheetLaporanGangguan() {
  pastikanPemilik_();
  var ss = bukaSpreadsheet_(cfg_().LAPORAN_SHEET_ID), sh = ss.getSheetByName(LGG_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(LGG_SHEET_);
    sh.getRange(1, 1, 1, LGG_HEADER_.length).setValues([LGG_HEADER_]).setFontWeight('bold');
    sh.setFrozenRows(1);
    console.log(LGG_SHEET_ + ' dibuat.');
  } else {
    var h = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(function (x) { return String(x).trim(); });
    if (LGG_HEADER_LAMA_.every(function (x, i) { return h[i] === x; }) && !h[LGG_HEADER_LAMA_.length]) {
      var ada = Math.max(sh.getLastRow() - 1, 0);
      var isi = ada ? sh.getRange(2, 1, ada, LGG_HEADER_LAMA_.length).getValues() : [];
      var baru = isi.map(function (r, i) { return [i + 1, uuid_(), r[0], r[1], 'MIGRASI', r[2], r[3], r[4], r[5], r[6]]; });
      sh.clearContents();
      sh.getRange(1, 1, 1, LGG_HEADER_.length).setValues([LGG_HEADER_]).setFontWeight('bold');
      if (baru.length) sh.getRange(2, 1, baru.length, LGG_HEADER_.length).setValues(baru);
      console.log(LGG_SHEET_ + ' diubah ke susunan baru (' + baru.length + ' baris dipertahankan).');
    }
  }
  sh.getRange(2, 2, Math.max(sh.getMaxRows() - 1, 1), 2).setNumberFormat('@');   // lap_id + Tanggal teks supaya tidak diubah Sheets
  tabelLaporanGangguan_();
  console.log(LGG_SHEET_ + ' siap.');
}

function bentukLaporanGangguan_(tanggal, teks, jumlah, disusunPada, dibuatOleh) {
  return { tanggal: tanggal, hari: tglIndo_(tanggal), teks: teks, jumlah: jumlah, disusunPada: disusunPada, dibuatOleh: dibuatOleh };
}

/** Baris tersimpan tanggal itu bila masih sah (disusun sesudah hari itu berakhir), selain itu null. */
function bacaLaporanGangguan_(tanggal) {
  var t = tabelLaporanGangguan_();
  var r = t && t.rows.filter(function (x) { return tglSel_(x.Tanggal) === tanggal; })[0];
  var ubah = r && keDate_(r['Disusun Pada']);
  if (!r || !ubah || ubah.getTime() < akhirHariLaporanGangguan_(tanggal) || !String(r.Teks || '')) return null;
  return bentukLaporanGangguan_(tanggal, String(r.Teks), { pmt: Number(r['PMT Trip']) || 0, sukses: Number(r['AR Sukses']) || 0, lockout: Number(r['AR Lockout']) || 0 },
    ubah.toISOString(), String(r['Dibuat Oleh'] || ''));
}

/** Simpan / timpa satu tanggal (di dalam lock). No dan lap_id tetap bila tanggal sudah ada. Tab belum ada = diam. */
function simpanLaporanGangguan_(tanggal, teks, jumlah, disusunPada, dibuatOleh) {
  var tulis = function () {
    var t = tabelLaporanGangguan_();
    if (!t) return;
    var r = t.rows.filter(function (x) { return tglSel_(x.Tanggal) === tanggal; })[0];
    var no = r ? Number(r.No) || 0 : t.rows.reduce(function (m, x) { return Math.max(m, Number(x.No) || 0); }, 0) + 1;
    var nilai = [no, r && r.lap_id ? String(r.lap_id) : uuid_(), tanggal, disusunPada, dibuatOleh, jumlah.pmt, jumlah.sukses, jumlah.lockout, teks,
      r ? (Number(r.revision) || 0) + 1 : 1];
    if (r) t.sheet.getRange(r._baris, 1, 1, nilai.length).setValues([nilai]);
    else t.sheet.getRange(Math.max(t.sheet.getLastRow(), 1) + 1, 1, 1, nilai.length).setValues([nilai]);
  };
  return LOCK_AKTIF_.ya ? tulis() : denganLock_(tulis);
}

/**
 * Susun laporan H-1 (tanggal) dari salinan ggn_ dan simpan. Salinan disinkron dulu bila segar atau terakhir disinkron sebelum
 * hari laporan berakhir; sinkron gagal = hasil tetap dikembalikan (sinkronGagal) tetapi tidak disimpan. oleh = pembuat.
 */
function susunLaporanGangguan_(tanggal, segar, oleh) {
  var gagal = false;
  if (segar || perluSinkronLaporanGangguan_(bacaInfoSinkronGgn_(), tanggal)) {
    try { sinkronGgn_('LAPORAN:' + oleh); }
    catch (e) { gagal = true; console.warn('Sinkron gangguan untuk laporan gagal: ' + (e.kode || e.message)); }
  }
  var h = hitungLaporanGangguan_(tabel_('GANGGUAN_SHEET_ID', GGN_TAB_.penyulang.sheet).rows, tabel_('GANGGUAN_SHEET_ID', GGN_TAB_.ar.sheet).rows, tanggal);
  var teks = teksLaporanGangguan_(h, tanggal, cfg_().ULP_NAMA), sekarang = sekarangIso_();
  var jumlah = { pmt: h.harian.pmt.length, sukses: h.harian.sukses.length, lockout: h.harian.lockout.length };
  // gagal sinkron = data mungkin belum lengkap: tidak disimpan supaya dibuka berikutnya dicoba lagi
  if (!gagal) simpanLaporanGangguan_(tanggal, teks, jumlah, sekarang, oleh);
  var o = bentukLaporanGangguan_(tanggal, teks, jumlah, sekarang, oleh);
  o.dariSimpanan = false; o.sinkron = infoPublikGgn_(bacaInfoSinkronGgn_()); o.sinkronGagal = gagal;
  return o;
}

/**
 * getLaporanGangguan { segar? } -> { tanggal, hari, teks, jumlah: { pmt, sukses, lockout }, disusunPada, dibuatOleh, dariSimpanan,
 * sinkron, sinkronGagal }. Tanggal selalu H-1 (WIB), tidak ada isian tanggal. segar: sinkron dari sumber + susun ulang paksa.
 */
function getLaporanGangguan_(sesi, data) {
  peranLaporanUp3_(sesi, false);
  var d = validasi_(data, { segar: { tipe: 'bool' } });
  var tanggal = geserTglIso_(waktuRow_().hariIni, -1);
  if (d.segar !== true) {
    var ada = bacaLaporanGangguan_(tanggal);
    if (ada) { ada.dariSimpanan = true; ada.sinkron = infoPublikGgn_(bacaInfoSinkronGgn_()); ada.sinkronGagal = false; return ada; }
  }
  return susunLaporanGangguan_(tanggal, d.segar === true, String(sesi.username || sesi.userId || ''));
}

/* ===== pemicu harian 06.00 ===== */

/**
 * Pemicu harian (jam 06.00 WIB): susun laporan H-1 otomatis supaya sudah siap saat admin membuka menu. Sudah ada laporan sah
 * tanggal itu (mis. disusun admin lebih dulu) = dilewati. Aman dipanggil manual dari editor.
 */
function ADMIN_pemicuLaporanGangguan(e) {
  pastikanPemilik_();
  return jalanPemicu_(LGG_PEMICU_FN_, e, function () {
    var tanggal = geserTglIso_(waktuRow_().hariIni, -1);
    if (bacaLaporanGangguan_(tanggal)) { console.log('Laporan gangguan ' + tanggal + ' sudah ada, dilewati.'); return null; }
    var o = susunLaporanGangguan_(tanggal, false, LGG_OLEH_PEMICU_);
    console.log('Laporan gangguan ' + tanggal + ' disusun' + (o.sinkronGagal ? ' (sinkron gagal, TIDAK disimpan)' : '') + ': ' + JSON.stringify(o.jumlah));
    return o;
  });
}

/** Editor: pasang pemicu harian jam 06.00 WIB (pemicu lama fungsi ini diganti). */
function ADMIN_pasangPemicuLaporanGangguan() {
  pastikanPemilik_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === LGG_PEMICU_FN_) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger(LGG_PEMICU_FN_).timeBased().everyDays(1).atHour(LGG_JAM_PEMICU_).nearMinute(0).inTimezone('Asia/Jakarta').create();
  console.log('Pemicu ' + LGG_PEMICU_FN_ + ' dipasang tiap hari ' + LGG_JAM_PEMICU_ + ':00 WIB (+/- 15 menit).');
}
