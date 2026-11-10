/**
 * v1.0.9 (keputusan Master Guswan 21 Okt 2026): modul Inspeksi Gardu (InsDu), inputan petugas tim INSPEKSI_GARDU.
 * Port dari v1 (SiSi_BackEnd/Inspeksi_Gardu/Tek-InsDu-Code.js + Tek-PengukuranGardu.html) ke arsitektur v2.
 *
 * Spreadsheet SiSi_InsDu (Script Property INSDU_SHEET_ID), 3 tab:
 *   1. db_insdu_header      Laporan Utama, kolom sama dengan insjar_header. Kode IGD-<ULP><YYMMDD><NNN>, 1 per tim per hari.
 *   2. db_insdu_realisasi   1 baris = 1 gardu yang diinspeksi hari itu (gardu dari db_Gardu). Kode <header>-GDU.<NNN>.
 *   3. db_insdu_pengukuran  1 baris per realisasi: pengukuran LWBP + WBP (tegangan 6 + beban 4, hasil dihitung) dan
 *                           hasil inspeksi cover gardu (7 item, pilihan sama v1). Kode <realisasi>-UKR.
 * Temuan: db_temuan_inspeksi di SiSi_Temuan (TEMUAN_SHEET_ID), objek_inspeksi = Gardu, no_gardu + gardu_id terisi.
 * Kode temuan <realisasi>-TGD.<NNN>.
 *
 * Aturan (keputusan Master Guswan 20 Okt 2026):
 *  - Realisasi = gardu yang SUDAH ADA pengukuran LWBP. Gardu tanpa LWBP tidak masuk laporan harian / UP3.
 *    v1.0.14: kecuali gardu Tier 2 saja (tanpa pengukuran) = langsung masuk. Tier boleh 'Tier 1 & Tier 2'.
 *  - WBP hari itu belum diinput setelah hari berganti = petugas TIDAK bisa membuat Laporan Utama baru
 *    (PENGUKURAN_H1_BELUM_LENGKAP) sampai WBP laporan sebelumnya dilengkapi. Hanya WBP laporan terakhir tim yang
 *    boleh diisi susulan (bukan isian lain).
 *  - Gardu baru di realisasi: temuan gardu itu dari inspeksi sebelumnya yang BELUM Selesai tidak disalin ulang.
 *    Baris terakhir dari tiap rantai diberi penanda belum_diperbaiki = YA dan ditampilkan sebagai riwayat tertinggal.
 *    Satu rantai dianggap selesai kalau salah satu barisnya berstatus Selesai.
 *  - Pengukuran disimpan juga ke db_Gardu (pengukuran terakhir), kecuali master punya ukur lebih baru.
 *  - v1.0.16 (Master Guswan 22 Okt 2026): tunggakan = gardu laporan terakhir yang perlu ukur tapi LWBP ATAU WBP belum ada
 *    (dulu hanya LWBP tanpa WBP; gardu tanpa LWBP hilang diam-diam dari laporan). Petugas memilih: isi LWBP + WBP
 *    susulan (masuk ke realisasi tanggal laporan itu) atau hapus gardu itu dari laporan (hapusRealisasiInsDu,
 *    status_ukur = BATAL, baris tidak dihapus fisik; ditolak kalau gardu sudah punya temuan).
 */

var INSDU_SHEET_ = { HEADER: 'db_insdu_header', REALISASI: 'db_insdu_realisasi', PENGUKURAN: 'db_insdu_pengukuran' };
var INSDU_MENU_ = 'OPS_INSDU_INPUT';
var INSDU_AWALAN_ = 'IGD';
var INSDU_OBJEK_ = 'Gardu';
var INSDU_PERIODE_ = ['LWBP', 'WBP'];
var INSDU_STATUS_UKUR_ = { belum: 'BELUM', lwbp: 'LWBP', lengkap: 'LENGKAP', tanpa: 'TANPA_UKUR', batal: 'BATAL' };
/** v1.0.14 (Master Guswan 21 Okt 2026): satu gardu boleh diinspeksi Tier 1 + Tier 2 sekaligus di hari yang sama.
 *  Tier 1 (atau Tier 1 & Tier 2) = pengukuran LWBP / WBP + cover wajib; Tier 2 saja = tanpa pengukuran. */
var INSDU_TIER_PILIHAN_ = ['Tier 1', 'Tier 2', 'Tier 1 & Tier 2'];

/** Nilai pengukuran per periode: kunci HP -> akhiran kolom sheet. Urutan tegangan sama dengan db_Gardu. */
var INSDU_NILAI_ = [
  { kunci: 'teganganRS', kolom: 'tegangan_rs', master: 'Tegangan R-S (V)', jenis: 'tegangan' },
  { kunci: 'teganganRT', kolom: 'tegangan_rt', master: 'Tegangan R-T (V)', jenis: 'tegangan' },
  { kunci: 'teganganST', kolom: 'tegangan_st', master: 'Tegangan S-T (V)', jenis: 'tegangan' },
  { kunci: 'teganganRN', kolom: 'tegangan_rn', master: 'Tegangan R-N (V)', jenis: 'tegangan' },
  { kunci: 'teganganSN', kolom: 'tegangan_sn', master: 'Tegangan S-N (V)', jenis: 'tegangan' },
  { kunci: 'teganganTN', kolom: 'tegangan_tn', master: 'Tegangan T-N (V)', jenis: 'tegangan' },
  { kunci: 'bebanR', kolom: 'beban_r', master: 'Beban R (A)', jenis: 'beban' },
  { kunci: 'bebanS', kolom: 'beban_s', master: 'Beban S (A)', jenis: 'beban' },
  { kunci: 'bebanT', kolom: 'beban_t', master: 'Beban T (A)', jenis: 'beban' },
  { kunci: 'bebanN', kolom: 'beban_n', master: 'Beban N (A)', jenis: 'beban' }
];
/** Hasil dihitung server (hasilUkurGardu_, sama dengan Pengecekan Gardu Yandal). */
var INSDU_HASIL_ = ['pembebanan_kva', 'persentase_beban', 'kategori_beban', 'ketidakseimbangan'];

/** Hasil inspeksi cover gardu (v1 Tek-PengukuranGardu.html subtab Cover Gardu). */
var INSDU_COVER_ = [
  { kunci: 'coverFcoAtas', kolom: 'cover_fco_atas', pilihan: ['Lengkap', 'Belum Lengkap', 'Tidak Ada'] },
  { kunci: 'coverFcoBawah', kolom: 'cover_fco_bawah', pilihan: ['Lengkap', 'Belum Lengkap', 'Tidak Ada'] },
  { kunci: 'coverBushingTm', kolom: 'cover_bushing_tm', pilihan: ['Lengkap', 'Belum Lengkap', 'Tidak Ada'] },
  { kunci: 'coverBushingTr', kolom: 'cover_bushing_tr', pilihan: ['Lengkap', 'Belum Lengkap', 'Tidak Ada'] },
  { kunci: 'coverArrester', kolom: 'cover_arrester', pilihan: ['Lengkap', 'Belum Lengkap', 'Tidak Ada'] },
  { kunci: 'jumperanAtas', kolom: 'jumperan_atas', pilihan: ['A3C', 'A3CS', 'Protective Sleeve'] },
  { kunci: 'jumperanBawah', kolom: 'jumperan_bawah', pilihan: ['A3C', 'A3CS', 'Protective Sleeve'] }
];

function kolomPeriodeInsDu_(p) {
  var a = p.toLowerCase() + '_';
  return [a + 'waktu'].concat(INSDU_NILAI_.map(function (n) { return a + n.kolom; }), INSDU_HASIL_.map(function (h) { return a + h; }));
}

/** Struktur 3 tab SiSi_InsDu. Fungsi (bukan var) karena memakai global modul lain (urutan muat file bebas). */
function headerInsDu_() {
  if (headerInsDu_.c) return headerInsDu_.c;
  return (headerInsDu_.c = {
  // = insjar_header / db_Hartek_Header (kolom & urutan sama persis)
  db_insdu_header: INSJAR_HEADER_.insjar_header.slice(),
  db_insdu_realisasi: ['nomor', 'kode_header', 'kode_realisasi', 'tanggal', 'hari', 'ulp', 'tim',
    // gardu (salinan db_Gardu saat dipilih, untuk laporan; relasi tetap lewat gardu_id)
    'no_gardu', 'penyulang', 'section', 'alamat', 'kapasitas_kva', 'merk_trafo', 'tier',
    // ringkasan (diisi server): BELUM / LWBP / LENGKAP, jumlah temuan (termasuk lanjutan) dan yang lanjutan
    'status_ukur', 'jumlah_temuan', 'jumlah_temuan_lanjutan',
    'realisasi_id', 'header_id', 'tim_id', 'gardu_id', 'section_id'].concat(INSJAR_AUDIT_),
  db_insdu_pengukuran: ['nomor', 'kode_realisasi', 'kode_pengukuran', 'tanggal', 'no_gardu', 'kapasitas_kva']
    .concat(kolomPeriodeInsDu_('LWBP'), kolomPeriodeInsDu_('WBP'), INSDU_COVER_.map(function (c) { return c.kolom; }),
      ['catatan', 'pengukuran_id', 'realisasi_id', 'header_id', 'tim_id', 'gardu_id'], INSJAR_AUDIT_)
  });
}

/* ===== peran & helper ===== */

function wajibPetugasInsDu_(sesi) {
  if (!sesi || sesi.role !== 'PETUGAS' || sesi.jenisTim !== INSDU_JENIS_TIM_ || !sesi.timId) {
    throw new SisiError_('AKSES_DITOLAK', 'bukan petugas inspeksi gardu');
  }
}

function tabelInsDu_(nama) {
  var prop = headerInsDu_()[nama] ? 'INSDU_SHEET_ID' : 'TEMUAN_SHEET_ID';
  if (!cfg_()[prop]) throw new SisiError_('CONFIG_TIDAK_LENGKAP', prop);
  if (prop === 'TEMUAN_SHEET_ID') return tabelInsJar_(nama);
  var t = tabel_(prop, nama), hk = headerInsDu_()[nama];
  var beda = bedaStruktur_(t.header.slice(0, hk.length), hk);
  if (beda.length) throw new SisiError_('STRUKTUR_BERUBAH', nama + ' ' + beda.slice(0, 3).join('; '));
  return t;
}

function teksInsDu_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function angkaInsDu_(v) { return v === '' || v === null || v === undefined || !isFinite(Number(v)) ? null : Number(v); }

/** Header tim aktif (status AKTIF). */
function headerAktifInsDu_(rows) {
  var o = {};
  rows.forEach(function (h) { if (String(h.status || 'AKTIF') === 'AKTIF') o[String(h.header_id)] = h; });
  return o;
}

/** Induk (header / realisasi / temuan) milik tim sesi, hari ini, header AKTIF. */
function indukInsDu_(rows, idKolom, id, sesi, nama, headerAktif) {
  var r = rows.filter(function (x) { return String(x[idKolom]) === String(id); })[0];
  if (!r) throw new SisiError_('DATA_TIDAK_DITEMUKAN', nama);
  if (String(r.tim_id) !== String(sesi.timId)) throw new SisiError_('BUKAN_MILIK_TIM', nama);
  if (tglInsJar_(r) !== tanggalHariIniHartek_()) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', nama);
  if (idKolom === 'header_id' && String(r.status || 'AKTIF') !== 'AKTIF') throw new SisiError_('SUDAH_BATAL', nama);
  if (headerAktif && idKolom !== 'header_id' && r.header_id && !headerAktif[String(r.header_id)]) throw new SisiError_('SUDAH_BATAL', nama);
  return r;
}

function pengukuranRealisasiInsDu_(rowsP, realisasiId) {
  return rowsP.filter(function (p) { return String(p.realisasi_id) === String(realisasiId); })[0] || null;
}

function adaPeriodeInsDu_(p, periode) { return !!(p && teksInsDu_(p[periode.toLowerCase() + '_waktu'])); }

/** Tier realisasi sebagai daftar: 'Tier 1 & Tier 2' -> ['Tier 1', 'Tier 2']. */
function tierDaftarInsDu_(v) {
  return teksInsDu_(v).split('&').map(function (x) { return x.trim(); }).filter(function (x) { return INSJAR_TIER_.indexOf(x) !== -1; });
}

/** Gardu perlu pengukuran LWBP / WBP = tier-nya memuat Tier 1. Data lama tanpa tier dianggap perlu. */
function perluUkurInsDu_(tier) {
  var l = tierDaftarInsDu_(tier);
  return !l.length || l.indexOf('Tier 1') !== -1;
}

/** v1.0.16: gardu dihapus petugas dari laporan (tunggakan tidak dilengkapi). */
function realisasiBatalInsDu_(r) { return teksInsDu_(r && r.status_ukur) === INSDU_STATUS_UKUR_.batal; }

/** Gardu masuk laporan harian: Tier 2 saja = langsung; Tier 1 = setelah LWBP. Gardu BATAL tidak pernah masuk. */
function masukLaporanInsDu_(r, p) { return !realisasiBatalInsDu_(r) && (!perluUkurInsDu_(r.tier) || adaPeriodeInsDu_(p, 'LWBP')); }

function statusUkurRealisasiInsDu_(r, p) { return perluUkurInsDu_(r.tier) ? statusUkurInsDu_(p) : INSDU_STATUS_UKUR_.tanpa; }

/** Tier temuan = salah satu tier gardu. Gardu satu tier = otomatis; dua tier = wajib dipilih. */
function tierTemuanInsDu_(r, diminta) {
  var l = tierDaftarInsDu_(r && r.tier);
  if (diminta) {
    if (l.length && l.indexOf(diminta) === -1) throw new SisiError_('TIER_TIDAK_SESUAI', diminta);
    return diminta;
  }
  if (l.length === 1) return l[0];
  throw new SisiError_('FIELD_WAJIB', 'tierInspeksi');
}

function statusUkurInsDu_(p) {
  if (!adaPeriodeInsDu_(p, 'LWBP')) return INSDU_STATUS_UKUR_.belum;
  return adaPeriodeInsDu_(p, 'WBP') ? INSDU_STATUS_UKUR_.lengkap : INSDU_STATUS_UKUR_.lwbp;
}

/**
 * Tunggakan: Laporan Utama TERAKHIR tim sebelum hari ini yang punya gardu perlu ukur (Tier 1) dengan LWBP atau WBP
 * belum ada (v1.0.16, dulu hanya LWBP tanpa WBP). kurang = 'LWBP' (belum diukur sama sekali) / 'WBP'.
 * null = tidak ada tunggakan. Hanya laporan terakhir yang dilihat (laporan lebih lama tidak memblokir).
 */
function tunggakanWbpInsDu_(timId, rowsH, rowsR, rowsP) {
  var hariIni = tanggalHariIniHartek_();
  var aktif = headerAktifInsDu_(rowsH);
  // v1.0.17: header hasil migrasi v1 (dibuat_oleh MIGRASI) tidak dihitung: pengukuran v1 tidak tersimpan per inspeksi
  var lalu = rowsH.filter(function (h) {
    return aktif[String(h.header_id)] && String(h.tim_id) === String(timId) && tglInsJar_(h) && tglInsJar_(h) < hariIni &&
      String(h.dibuat_oleh || '') !== 'MIGRASI';
  }).sort(function (a, b) { return tglInsJar_(a) < tglInsJar_(b) ? 1 : tglInsJar_(a) > tglInsJar_(b) ? -1 : 0; });
  if (!lalu.length) return null;
  var h = lalu[0];
  var kurang = rowsR.filter(function (r) { return String(r.header_id) === String(h.header_id); }).filter(function (r) {
    if (realisasiBatalInsDu_(r) || !perluUkurInsDu_(r.tier)) return false;
    return !adaPeriodeInsDu_(pengukuranRealisasiInsDu_(rowsP, r.realisasi_id), 'WBP');
  });
  if (!kurang.length) return null;
  return {
    headerId: String(h.header_id), kodeHeader: String(h.kode_header), tanggal: tglInsJar_(h),
    realisasi: kurang.map(function (r) {
      var p = pengukuranRealisasiInsDu_(rowsP, r.realisasi_id);
      return {
        realisasiId: String(r.realisasi_id), kodeRealisasi: String(r.kode_realisasi || ''), noGardu: teksInsDu_(r.no_gardu),
        garduId: String(r.gardu_id || ''), penyulang: teksInsDu_(r.penyulang), alamat: teksInsDu_(r.alamat),
        kapasitasKva: angkaInsDu_(r.kapasitas_kva), tier: teksInsDu_(r.tier), revision: Number(r.revision) || 1,
        kurang: adaPeriodeInsDu_(p, 'LWBP') ? 'WBP' : 'LWBP', pengukuran: pengukuranKeHpInsDu_(p)
      };
    })
  };
}

/** Gardu AKTIF di db_Gardu (relasi lewat gardu_id). */
function garduInsDu_(garduId) {
  var tG = tabelGarduUkur_();
  var l = tG.rows.filter(function (x) { return String(x.gardu_id) === String(garduId); });
  if (!l.length) throw new SisiError_('GARDU_TIDAK_DIKENAL', garduId);
  if (l.length > 1) throw new SisiError_('DATA_GANDA', garduId);
  if (teksInsDu_(l[0]['Status Gardu']).toUpperCase() !== 'AKTIF') throw new SisiError_('GARDU_TIDAK_AKTIF', teksInsDu_(l[0]['No Gardu']));
  return l[0];
}

/* ===== bentuk untuk HP ===== */

function periodeKeHpInsDu_(p, periode) {
  if (!adaPeriodeInsDu_(p, periode)) return null;
  var a = periode.toLowerCase() + '_';
  var o = { waktu: teksInsDu_(p[a + 'waktu']) };
  INSDU_NILAI_.forEach(function (n) { o[n.kunci] = angkaInsDu_(p[a + n.kolom]); });
  o.kva = angkaInsDu_(p[a + 'pembebanan_kva']);
  o.persen = angkaInsDu_(p[a + 'persentase_beban']);
  o.kategori = teksInsDu_(p[a + 'kategori_beban']);
  o.tidakSeimbang = angkaInsDu_(p[a + 'ketidakseimbangan']);
  return o;
}

function pengukuranKeHpInsDu_(p) {
  if (!p) return null;
  var cover = {};
  INSDU_COVER_.forEach(function (c) { cover[c.kunci] = teksInsDu_(p[c.kolom]); });
  return {
    pengukuranId: String(p.pengukuran_id), kodePengukuran: teksInsDu_(p.kode_pengukuran), revision: Number(p.revision) || 1,
    lwbp: periodeKeHpInsDu_(p, 'LWBP'), wbp: periodeKeHpInsDu_(p, 'WBP'), cover: cover, catatan: teksInsDu_(p.catatan)
  };
}

function realisasiKeHpInsDu_(r, rowsP, rowsT) {
  var p = pengukuranRealisasiInsDu_(rowsP, r.realisasi_id);
  var tertinggal = temuanTerbukaGarduInsDu_(rowsT, r.gardu_id, r.no_gardu, tglInsJar_(r))
    .map(function (x) { return temuanKeHpInsJar_(x.terakhir); });
  return {
    realisasiId: String(r.realisasi_id), kodeRealisasi: teksInsDu_(r.kode_realisasi), garduId: String(r.gardu_id || ''),
    noGardu: teksInsDu_(r.no_gardu), penyulang: teksInsDu_(r.penyulang), section: teksInsDu_(r.section), alamat: teksInsDu_(r.alamat),
    kapasitasKva: angkaInsDu_(r.kapasitas_kva), merkTrafo: teksInsDu_(r.merk_trafo), tier: teksInsDu_(r.tier),
    statusUkur: statusUkurRealisasiInsDu_(r, p), masukLaporan: masukLaporanInsDu_(r, p), perluUkur: perluUkurInsDu_(r.tier),
    revision: Number(r.revision) || 1,
    pengukuran: pengukuranKeHpInsDu_(p),
    temuan: rowsT.filter(function (t) { return String(t.realisasi_id) === String(r.realisasi_id); }).map(temuanKeHpInsJar_),
    temuanTertinggal: tertinggal
  };
}

/* ===== endpoint baca ===== */

/** Gardu AKTIF db_Gardu untuk dropdown HP (petugas Inspeksi Gardu + v1.0.11 input temuan admin). */
function daftarGarduInsDu_() {
  return tabelGarduUkur_().rows.filter(function (g) {
    return g.gardu_id && teksInsDu_(g['Status Gardu']).toUpperCase() === 'AKTIF' && teksInsDu_(g['No Gardu']);
  }).map(function (g) {
    return { garduId: String(g.gardu_id), noGardu: teksInsDu_(g['No Gardu']), penyulang: teksInsDu_(g.Penyulang),
             section: teksInsDu_(g.Section), alamat: teksInsDu_(g.Alamat), kapasitasKva: angkaInsDu_(g['Kapasitas (kVA)']),
             merk: teksInsDu_(g.Merk), nomorSeri: teksInsDu_(g['Nomor Seri']), tahun: teksInsDu_(g.Tahun),
             merkPhb: teksInsDu_(g['Merk PHB-TR']), seriPhb: teksInsDu_(g['Nomor Seri PHB-TR']), tahunPhb: teksInsDu_(g['Tahun PHB-TR']),
             koordinat: koordinatGarduInsDu_(g) };   // v1.0.14: koordinat awal temuan
  }).sort(function (a, b) { return a.noGardu.localeCompare(b.noGardu); });
}

/** v1.0.14: 'lat, lng' dari kolom Lat / Long db_Gardu ('' kalau kosong / bukan angka). */
function koordinatGarduInsDu_(g) {
  var lat = angkaInsDu_(g.Lat), lng = angkaInsDu_(g.Long);
  if (lat === null || lng === null || (lat === 0 && lng === 0)) return '';
  return lat.toFixed(6) + ', ' + lng.toFixed(6);
}

/** v1.0.11: lokasi temuan admin objek Gardu = penyulang + section gardu di db_Gardu. Section yang tidak ada di
 *  db_Jaringan tetap ditulis apa adanya (tanpa section_id), penyulang wajib aktif. */
function lokasiGarduTemuanAdmin_(g) {
  var pen = teksInsDu_(g.Penyulang), sec = teksInsDu_(g.Section);
  try {
    return lokasiJaringanInsJar_(pen, sec, false);
  } catch (e) {
    if (e && e.kode === 'SECTION_TIDAK_VALID') return { penyulang: lokasiJaringanInsJar_(pen, '', false).penyulang, section: sec, sectionId: '' };
    throw e;
  }
}

/** Dropdown: gardu AKTIF (db_Gardu), jenis temuan objek Gardu, tier, pilihan cover. */
function getMasterInsDu_(sesi) {
  wajibPetugasInsDu_(sesi);
  return {
    gardu: daftarGarduInsDu_(),
    jenisTemuan: jenisTemuanAktifInsJar_(INSDU_OBJEK_, ''),
    tier: INSJAR_TIER_.slice(),
    tierGardu: INSDU_TIER_PILIHAN_.slice(),   // v1.0.14
    cover: INSDU_COVER_.map(function (c) { return { kunci: c.kunci, pilihan: c.pilihan.slice() }; })
  };
}

/** Laporan hari ini tim sesi + tunggakan WBP laporan sebelumnya (kalau ada). */
function getInsDuHarian_(sesi, data) {
  wajibPetugasInsDu_(sesi);
  validasi_(data, {});
  var tanggal = tanggalHariIniHartek_();
  var tH = tabelInsDu_(INSDU_SHEET_.HEADER), tR = tabelInsDu_(INSDU_SHEET_.REALISASI), tP = tabelInsDu_(INSDU_SHEET_.PENGUKURAN);
  var tunggakan = tunggakanWbpInsDu_(sesi.timId, tH.rows, tR.rows, tP.rows);
  var h = tH.rows.filter(function (x) {
    return String(x.tim_id) === String(sesi.timId) && tglInsJar_(x) === tanggal && String(x.status || 'AKTIF') === 'AKTIF';
  })[0];
  if (!h) return { tanggal: tanggal, header: null, realisasi: [], tunggakan: tunggakan };
  // Baca seluruh riwayat temuan Gardu agar kartu hari ini bisa menampilkan temuan tertinggal.
  var doc = dokInsDuBaris_(h, tanggal, tR.rows, tP.rows, tabelInsDu_(INSJAR_SHEET_.TEMUAN).rows);
  doc.tunggakan = tunggakan;
  return doc;
}

/** v1.0.17: dokumen satu laporan Inspeksi Gardu (bentuk getInsDuHarian, tanpa tunggakan) dari baris sheet; harian + arsip. */
function dokInsDuBaris_(h, tanggal, rowsR, rowsP, rowsT) {
  return {
    tanggal: tanggal,
    header: {
      headerId: String(h.header_id), kodeHeader: String(h.kode_header), hari: teksInsDu_(h.hari), revision: Number(h.revision) || 1,
      koordinatAwal: teksInsDu_(h.koordinat_awal), koordinatAkhir: teksInsDu_(h.koordinat_akhir),
      kmAwal: h.km_awal === '' ? '' : h.km_awal, kmAkhir: h.km_akhir === '' ? '' : h.km_akhir, kendala: teksInsDu_(h.kendala)
    },
    realisasi: rowsR.filter(function (r) { return String(r.header_id) === String(h.header_id); })
      .map(function (r) { return realisasiKeHpInsDu_(r, rowsP, rowsT); })
  };
}

/* ===== Laporan Utama ===== */

function perangkatBuatHeaderInsDu_(kode) {
  var log = tabel_('AUTH_SHEET_ID', 'log_Audit').rows.filter(function (r) {
    return r.aksi === 'INSDU_HEADER_BUAT' && String(r.target) === String(kode);
  })[0];
  return log ? String(log.device_id || '') : '';
}

function buatHeaderInsDu_(sesi, data) {
  wajibPetugasInsDu_(sesi);
  var d = validasi_(data, INSJAR_ISI_HEADER_.buat);
  kmInsJar_(d.kmAwal, d.kmAkhir);
  return denganLock_(function () {
    var t = tabelInsDu_(INSDU_SHEET_.HEADER);
    var tanggal = tanggalHariIniHartek_();
    var ada = t.rows.filter(function (h) {
      return String(h.tim_id) === String(sesi.timId) && tglInsJar_(h) === tanggal && String(h.status || 'AKTIF') === 'AKTIF';
    })[0];
    if (ada && d.headerId && String(ada.header_id) === String(d.headerId)) {
      return { headerId: String(ada.header_id), kodeHeader: String(ada.kode_header), tanggal: tanggal, duplikat: true };
    }
    if (ada) {
      var asal = perangkatBuatHeaderInsDu_(ada.kode_header);
      if (!asal || asal === String(sesi.deviceId || '')) throw new SisiError_('LAPORAN_UTAMA_SUDAH_DIBUAT', ada.kode_header);
      auditLog_(sesi, 'INSDU_HEADER_GABUNG', ada.kode_header, 'perangkat ' + String(sesi.deviceId || '') + ' ikut header pertama', 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
      return { headerId: String(ada.header_id), kodeHeader: String(ada.kode_header), tanggal: tanggal, duplikat: false, digabung: true };
    }
    // v1.0.8: WBP laporan sebelumnya wajib lengkap dulu
    var tunggak = tunggakanWbpInsDu_(sesi.timId, t.rows, tabelInsDu_(INSDU_SHEET_.REALISASI).rows, tabelInsDu_(INSDU_SHEET_.PENGUKURAN).rows);
    if (tunggak) {
      throw new SisiError_('PENGUKURAN_H1_BELUM_LENGKAP', tunggak.kodeHeader + ': ' + tunggak.realisasi.map(function (r) { return r.noGardu; }).join(', '));
    }
    if (d.headerId && t.rows.some(function (h) { return String(h.header_id) === String(d.headerId); })) throw new SisiError_('ID_DIPAKAI', d.headerId);
    var c = cfg_();
    var awalan = INSDU_AWALAN_ + '-' + c.KODE_ULP + yymmddInsJar_(tanggal);
    var kode = awalan + pad3_(urutBerikutHartek_(t.rows, 'kode_header', awalan));
    var id = d.headerId || uuid_(), sekarang = sekarangIso_();
    tambahBaris_(t, {
      nomor: t.rows.length + 1, kode_header: kode, ulp: c.ULP_NAMA, hari: hariTanggalHartek_(tanggal), tanggal: tanggal,
      tim: sesi.timNama || '',
      koordinat_awal: d.koordinatAwal ? d.koordinatAwal.teks : '', koordinat_akhir: d.koordinatAkhir ? d.koordinatAkhir.teks : '',
      km_awal: d.kmAwal === undefined ? '' : d.kmAwal, km_akhir: d.kmAkhir === undefined ? '' : d.kmAkhir,
      kendala: d.kendala || '', wa_text: '',
      timestamp: sekarang, input_by: sesi.username || sesi.userId, timestamp_update: sekarang,
      header_id: id, tim_id: sesi.timId, status: 'AKTIF', revision: 1, dibuat_oleh: sesi.userId,
      waktu_perangkat: '', diubah_oleh: sesi.userId
    });
    auditLog_(sesi, 'INSDU_HEADER_BUAT', kode, sesi.timNama || '', 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { headerId: id, kodeHeader: kode, tanggal: tanggal, duplikat: false };
  }, 20000);
}

function ubahHeaderInsDu_(sesi, data) {
  wajibPetugasInsDu_(sesi);
  var d = validasi_(data, INSJAR_ISI_HEADER_.ubah);
  kmInsJar_(d.kmAwal, d.kmAkhir);
  return denganLock_(function () {
    var t = tabelInsDu_(INSDU_SHEET_.HEADER);
    var h = indukInsDu_(t.rows, 'header_id', d.headerId, sesi, 'header');
    var u = {};
    if (d.koordinatAwal !== undefined) u.koordinat_awal = d.koordinatAwal.teks;
    if (d.koordinatAkhir !== undefined) u.koordinat_akhir = d.koordinatAkhir.teks;
    if (d.kmAwal !== undefined) u.km_awal = d.kmAwal;
    if (d.kmAkhir !== undefined) u.km_akhir = d.kmAkhir;
    if (d.kendala !== undefined) u.kendala = d.kendala;
    if (!Object.keys(u).length) throw new SisiError_('FIELD_WAJIB', 'koordinatAwal');
    var awal = u.km_awal !== undefined ? u.km_awal : (h.km_awal === '' ? undefined : Number(h.km_awal));
    var akhir = u.km_akhir !== undefined ? u.km_akhir : (h.km_akhir === '' ? undefined : Number(h.km_akhir));
    kmInsJar_(awal, akhir);
    u.timestamp_update = sekarangIso_();
    u.diubah_oleh = sesi.userId;
    ubahBaris_(t, 'header_id', d.headerId, u, d.revision);
    auditLog_(sesi, 'INSDU_HEADER_UBAH', h.kode_header, Object.keys(u).join(', '), 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { headerId: String(d.headerId), kodeHeader: String(h.kode_header), revision: d.revision + 1 };
  }, 20000);
}

/* ===== realisasi (gardu yang diinspeksi) + temuan lanjutan ===== */

/** Tulis ringkasan realisasi tanpa menaikkan revision (sama dengan jumlah_temuan InsJar). */
function tulisRingkasRealisasiInsDu_(tR, realisasiId, nilai) {
  var r = tR.rows.filter(function (x) { return String(x.realisasi_id) === String(realisasiId); })[0];
  if (!r) return;
  Object.keys(nilai).forEach(function (k) {
    var col = tR.header.indexOf(k);
    if (col !== -1) tR.sheet.getRange(r._baris, col + 1).setValue(nilai[k]);
  });
}

function hitungTemuanInsDu_(rowsT, realisasiId, tambahan) {
  var l = rowsT.filter(function (t) { return String(t.realisasi_id) === String(realisasiId); }).concat(tambahan || []);
  return { jumlah_temuan: l.length, jumlah_temuan_lanjutan: l.filter(function (t) { return String(t.sumber) === 'LANJUTAN'; }).length };
}

/** Temuan gardu yang belum Selesai dari inspeksi sebelumnya: baris TERAKHIR tiap rantai (temuan_asal_id). */
function temuanTerbukaGarduInsDu_(rowsT, garduId, noGardu, tanggal) {
  var ng = teksInsDu_(noGardu).toUpperCase();
  var rantai = {}, urut = [];
  rowsT.forEach(function (t) {
    if (teksInsDu_(t.objek_inspeksi).toLowerCase() !== INSDU_OBJEK_.toLowerCase()) return;
    var cocok = t.gardu_id ? String(t.gardu_id) === String(garduId) : (ng && teksInsDu_(t.no_gardu).toUpperCase() === ng);
    if (!cocok) return;
    var akar = teksInsDu_(t.temuan_asal_id) || String(t.temuan_id);
    if (!rantai[akar]) { rantai[akar] = []; urut.push(akar); }
    rantai[akar].push(t);
  });
  var hasil = [];
  urut.forEach(function (akar) {
    var l = rantai[akar];
    if (l.some(function (t) { return teksInsDu_(t.status).toLowerCase() === 'selesai'; })) return;
    if (l.some(function (t) { return tglInsJar_(t) === tanggal; })) return;   // sudah dicatat hari ini
    l.sort(function (a, b) { return tglInsJar_(a) < tglInsJar_(b) ? -1 : tglInsJar_(a) > tglInsJar_(b) ? 1 : a._baris - b._baris; });
    hasil.push({ akar: akar, terakhir: l[l.length - 1] });
  });
  return hasil;
}

function simpanRealisasiInsDu_(sesi, data) {
  wajibPetugasInsDu_(sesi);
  var d = validasi_(data, {
    headerId: { tipe: 'uuid', wajib: true },
    garduId: { tipe: 'teks', wajib: true, maks: 60 },
    tier: { tipe: 'pilihan', wajib: true, pilihan: INSDU_TIER_PILIHAN_ },
    idBaris: { tipe: 'uuid' },
    kapasitasKva: INSDU_SKEMA_TRAFO_.kapasitasKva, merkTrafo: INSDU_SKEMA_TRAFO_.merkTrafo   // v1.0.38: diisi petugas
  });
  var master = false;
  var hasil = denganLock_(function () {
    var tR = tabelInsDu_(INSDU_SHEET_.REALISASI);
    var ulang = barisUlangInsJar_(tR.rows, 'realisasi_id', d.idBaris, sesi.timId);
    if (ulang) return { realisasiId: String(ulang.realisasi_id), kodeRealisasi: String(ulang.kode_realisasi), duplikat: true };
    var hdr = indukInsDu_(tabelInsDu_(INSDU_SHEET_.HEADER).rows, 'header_id', d.headerId, sesi, 'header');
    var g = garduInsDu_(d.garduId);
    if (tR.rows.some(function (r) { return String(r.header_id) === String(hdr.header_id) && String(r.gardu_id) === String(g.gardu_id); })) {
      throw new SisiError_('GARDU_GANDA', teksInsDu_(g['No Gardu']));
    }
    var tanggal = tglInsJar_(hdr);
    var awalan = hdr.kode_header + '-GDU.';
    var kode = awalan + pad3_(urutBerikutHartek_(tR.rows, 'kode_realisasi', awalan));
    var id = d.idBaris || uuid_(), sekarang = sekarangIso_();
    // Temuan belum selesai dari inspeksi gardu sebelumnya tidak disalin ulang.
    // Baris terakhir tiap rantai ditandai agar riwayat tetap terlihat di spreadsheet dan kartu gardu.
    var tT = tabelInsDu_(INSJAR_SHEET_.TEMUAN);
    var terbuka = temuanTerbukaGarduInsDu_(tT.rows, g.gardu_id, g['No Gardu'], tanggal);
    var tertinggal;
    var tanda = terbuka.map(function (x) {
      return { r: x.terakhir, u: { belum_diperbaiki: 'YA', timestamp_update: sekarang, diubah_oleh: sesi.userId } };
    });
    if (tanda.length) tulisBlok_(tT, tanda, []);
    tertinggal = terbuka.map(function (x) { return temuanKeHpInsJar_(x.terakhir); });
    var baru = [];
    var hitung = hitungTemuanInsDu_([], id, []);
    tambahBaris_(tR, sisipAuditInsJar_({
      nomor: tR.rows.length + 1, kode_header: hdr.kode_header, kode_realisasi: kode, tanggal: tanggal, hari: hdr.hari,
      ulp: hdr.ulp, tim: hdr.tim, no_gardu: teksInsDu_(g['No Gardu']), penyulang: teksInsDu_(g.Penyulang),
      section: teksInsDu_(g.Section), alamat: teksInsDu_(g.Alamat),
      kapasitas_kva: d.kapasitasKva !== undefined ? d.kapasitasKva : g['Kapasitas (kVA)'],
      merk_trafo: d.merkTrafo !== undefined ? d.merkTrafo : teksInsDu_(g.Merk),
      tier: d.tier, status_ukur: statusUkurRealisasiInsDu_({ tier: d.tier }, null),
      jumlah_temuan: hitung.jumlah_temuan, jumlah_temuan_lanjutan: hitung.jumlah_temuan_lanjutan,
      realisasi_id: id, header_id: hdr.header_id, tim_id: sesi.timId, gardu_id: String(g.gardu_id), section_id: String(g.section_id || '')
    }, sesi, sekarang));
    auditLog_(sesi, 'INSDU_REALISASI_SIMPAN', kode, teksInsDu_(g['No Gardu']) + ' ' + d.tier + (tertinggal.length ? ', tertinggal ' + tertinggal.length : ''),
      'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    master = perbaruiTrafoMasterInsDu_(g.gardu_id, d.kapasitasKva, d.merkTrafo, sesi);   // v1.0.38
    return { realisasiId: id, kodeRealisasi: kode, temuanLanjutan: [], temuanTertinggal: tertinggal, masterGardu: master };
  }, 30000);
  if (master) jadwalSheetLamaInsDu_();
  return hasil;
}

/* ===== v1.0.38: merk / kapasitas trafo diisi petugas, ikut ke Master Gardu ===== */
var INSDU_SKEMA_TRAFO_ = {
  kapasitasKva: { tipe: 'angka', min: 1, max: 5000 },
  merkTrafo: { tipe: 'teks', maks: 60 }
};

/**
 * Merk / kapasitas dari lapangan ditulis ke db_Gardu lewat jalur form Update HI (ubahDbHi_: Arus Maks ikut dihitung,
 * hanya kolom yang berbeda). Timestamp Update baru = 3 sheet lama menyusul pemicu (jadwalSheetLamaInsDu_ sesudah lock).
 * WAJIB di dalam lock. Hasil true = Master Gardu berubah.
 */
function perbaruiTrafoMasterInsDu_(garduId, kap, merk, sesi) {
  if (kap === undefined && merk === undefined) return false;
  var tG = tabelGarduUkur_();
  var g = tG.rows.filter(function (x) { return String(x.gardu_id) === String(garduId); })[0];
  if (!g) return false;
  var kunci = {};
  katalogHiGardu_().forEach(function (k) { if (k.kolom === 'Merk' || k.kolom === 'Kapasitas (kVA)') kunci[k.kolom] = k.kunci; });
  var nilai = {};
  if (kap !== undefined && kunci['Kapasitas (kVA)']) nilai[kunci['Kapasitas (kVA)']] = kap;
  if (merk !== undefined && kunci.Merk) nilai[kunci.Merk] = merk;
  var u = ubahDbHi_(g, nilai, []);   // tanpa Penyulang / Section: daftar jaringan tidak dipakai
  if (!Object.keys(u).length) return false;
  Object.assign(u, { 'Diubah Oleh': sesi.nama || sesi.username || '', 'Timestamp Update': sekarangIso_(), diubah_oleh: sesi.userId || '' });
  tulisBlok_(tG, [{ r: g, u: u }], [], { bolehId: ['section_id', 'ukur_id_terakhir', 'ukur_id_lwbp'] });
  return true;
}

/** Sesudah lock: 3 sheet lama Master Gardu menyusul (pemicu sekali jalan, cadangan sinkron 05:00). Gagal = diam. */
function jadwalSheetLamaInsDu_() {
  try { jadwalkanSheetLamaHi_(); } catch (e) { console.warn('InsDu: pemicu sheet lama gagal dijadwalkan: ' + (e.message || e)); }
}

/** Kapasitas berubah sesudah pengukuran ada: hasil (kVA, %, kategori) tiap periode dihitung ulang. Hasil periode yang diubah. */
function hitungUlangUkurInsDu_(tP, p, kap, sesi, sekarang) {
  if (!p) return [];
  var u = { kapasitas_kva: kap }, periode = [];
  ['LWBP', 'WBP'].forEach(function (per) {
    if (!adaPeriodeInsDu_(p, per)) return;
    var a = per.toLowerCase() + '_', nilai = {};
    INSDU_NILAI_.forEach(function (n) { nilai[n.kunci] = Number(p[a + n.kolom]) || 0; });
    var h = hasilUkurGardu_(nilai, kap);
    u[a + 'pembebanan_kva'] = h.kva; u[a + 'persentase_beban'] = h.persen; u[a + 'kategori_beban'] = h.kategori;
    periode.push(per);
  });
  u.timestamp_update = sekarang; u.diubah_oleh = sesi.userId;
  ubahBaris_(tP, 'pengukuran_id', p.pengukuran_id, u);
  Object.keys(u).forEach(function (k) { p[k] = u[k]; });
  return periode;
}

/**
 * v1.0.14: ubah gardu yang sudah diinput (hari ini). Tier boleh diganti (Tier 1 / Tier 2 / keduanya), kecuali:
 *  - pengukuran sudah ada dan tier baru tanpa Tier 1 (TIER_TERKUNCI), atau ada temuan dengan tier yang dihapus.
 * Gardu boleh diganti selama belum ada pengukuran dan temuan (GARDU_TERKUNCI); gardu kembar = GARDU_GANDA.
 */
function ubahRealisasiInsDu_(sesi, data) {
  wajibPetugasInsDu_(sesi);
  var d = validasi_(data, {
    realisasiId: { tipe: 'uuid', wajib: true }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 },
    garduId: { tipe: 'teks', maks: 60 }, tier: { tipe: 'pilihan', wajib: true, pilihan: INSDU_TIER_PILIHAN_ },
    kapasitasKva: INSDU_SKEMA_TRAFO_.kapasitasKva, merkTrafo: INSDU_SKEMA_TRAFO_.merkTrafo   // v1.0.38
  });
  var master = false;
  var hasil = denganLock_(function () {
    var tH = tabelInsDu_(INSDU_SHEET_.HEADER), tR = tabelInsDu_(INSDU_SHEET_.REALISASI), tP = tabelInsDu_(INSDU_SHEET_.PENGUKURAN);
    var tT = tabelInsDu_(INSJAR_SHEET_.TEMUAN);
    var r = indukInsDu_(tR.rows, 'realisasi_id', d.realisasiId, sesi, 'gardu', headerAktifInsDu_(tH.rows));
    if (Number(r.revision) !== d.revision) throw new SisiError_('KONFLIK_REVISION', d.realisasiId);
    var p = pengukuranRealisasiInsDu_(tP.rows, r.realisasi_id);
    var adaUkur = adaPeriodeInsDu_(p, 'LWBP') || adaPeriodeInsDu_(p, 'WBP');
    var temuan = tT.rows.filter(function (t) { return String(t.realisasi_id) === String(r.realisasi_id); });
    var tierBaru = tierDaftarInsDu_(d.tier);
    if (adaUkur && tierBaru.indexOf('Tier 1') === -1) throw new SisiError_('TIER_TERKUNCI', 'pengukuran sudah ada');
    temuan.forEach(function (t) {
      var ti = teksInsDu_(t.tier_inspeksi);
      if (ti && tierBaru.indexOf(ti) === -1) throw new SisiError_('TIER_TERKUNCI', ti + ' dipakai temuan ' + teksInsDu_(t.kode_temuan));
    });
    var sekarang = sekarangIso_();
    var u = { tier: d.tier };
    if (d.garduId && String(d.garduId) !== String(r.gardu_id)) {
      if (adaUkur || temuan.length) throw new SisiError_('GARDU_TERKUNCI', teksInsDu_(r.no_gardu));
      var g = garduInsDu_(d.garduId);
      if (tR.rows.some(function (x) {
        return String(x.header_id) === String(r.header_id) && String(x.gardu_id) === String(g.gardu_id) && String(x.realisasi_id) !== String(r.realisasi_id);
      })) throw new SisiError_('GARDU_GANDA', teksInsDu_(g['No Gardu']));
      u.no_gardu = teksInsDu_(g['No Gardu']); u.penyulang = teksInsDu_(g.Penyulang); u.section = teksInsDu_(g.Section);
      u.alamat = teksInsDu_(g.Alamat); u.kapasitas_kva = g['Kapasitas (kVA)']; u.merk_trafo = teksInsDu_(g.Merk);
      u.gardu_id = String(g.gardu_id); u.section_id = String(g.section_id || '');
      var terbuka = temuanTerbukaGarduInsDu_(tT.rows, g.gardu_id, g['No Gardu'], tglInsJar_(r));
      if (terbuka.length) {
        tulisBlok_(tT, terbuka.map(function (x) {
          return { r: x.terakhir, u: { belum_diperbaiki: 'YA', timestamp_update: sekarang, diubah_oleh: sesi.userId } };
        }), []);
      }
    }
    // v1.0.38: merk / kapasitas dari petugas. Kapasitas berubah + pengukuran ada = hasil ukur dihitung ulang (+ Master Gardu)
    var garduAkhir = u.gardu_id || r.gardu_id, ulangUkur = [];
    if (d.merkTrafo !== undefined && d.merkTrafo !== teksInsDu_(u.merk_trafo !== undefined ? u.merk_trafo : r.merk_trafo)) u.merk_trafo = d.merkTrafo;
    if (d.kapasitasKva !== undefined && d.kapasitasKva !== Number(u.kapasitas_kva !== undefined ? u.kapasitas_kva : r.kapasitas_kva)) {
      u.kapasitas_kva = d.kapasitasKva;
      ulangUkur = hitungUlangUkurInsDu_(tP, p, d.kapasitasKva, sesi, sekarang);
    }
    master = perbaruiTrafoMasterInsDu_(garduAkhir, d.kapasitasKva, d.merkTrafo, sesi);
    ulangUkur.forEach(function (per) {
      try { terapkanUkurInsDu_(p, per, sesi, sekarang); } catch (e) { console.warn('InsDu: db_Gardu tidak diperbarui: ' + (e.kode || e.message)); }
    });
    u.status_ukur = statusUkurRealisasiInsDu_({ tier: d.tier }, p);
    u.timestamp_update = sekarang;
    u.diubah_oleh = sesi.userId;
    var rev = ubahBaris_(tR, 'realisasi_id', r.realisasi_id, u, d.revision);
    var baru = {};
    Object.keys(r).forEach(function (k) { baru[k] = r[k]; });
    Object.keys(u).forEach(function (k) { baru[k] = u[k]; });
    baru.revision = rev;
    auditLog_(sesi, 'INSDU_REALISASI_UBAH', teksInsDu_(r.kode_realisasi), teksInsDu_(baru.no_gardu) + ' ' + d.tier, 'MOBILE',
      headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { realisasiId: String(r.realisasi_id), kodeRealisasi: teksInsDu_(r.kode_realisasi), revision: rev,
             realisasi: realisasiKeHpInsDu_(baru, tP.rows, tT.rows), masterGardu: master };
  }, 30000);
  if (master) jadwalSheetLamaInsDu_();
  return hasil;
}

/* ===== pengukuran LWBP / WBP + cover ===== */

function skemaPengukuranInsDu_() {
  var s = {
    realisasiId: { tipe: 'uuid', wajib: true },
    periode: { tipe: 'pilihan', wajib: true, pilihan: INSDU_PERIODE_ },
    waktu: { tipe: 'waktu' },
    catatan: { tipe: 'teks', maks: 300, multiBaris: true, maksBaris: 5 }
  };
  INSDU_NILAI_.forEach(function (n) {
    s[n.kunci] = { tipe: 'angka', wajib: true, min: 0, max: n.jenis === 'beban' ? YAN_BEBAN_MAKS_ : YAN_TEGANGAN_MAKS_ };
  });
  INSDU_COVER_.forEach(function (c) { s[c.kunci] = { tipe: 'pilihan', pilihan: c.pilihan }; });
  return s;
}

/** Simpan pengukuran ke db_Gardu (pengukuran terakhir). Master lebih baru / milik ukur lain lebih baru = dilewati. */
function terapkanUkurInsDu_(p, periode, sesi, iso) {
  var tG = tabelGarduUkur_();
  var g = tG.rows.filter(function (x) { return String(x.gardu_id) === String(p.gardu_id); })[0];
  if (!g || teksInsDu_(g['Status Gardu']).toUpperCase() !== 'AKTIF') return 'TIDAK';
  var a = periode.toLowerCase() + '_';
  // v1.0.23: waktu bisa sel tanggal (diubah Sheets), dulu dipotong jadi 'Fri Oct 16'. Blok master sesuai periode
  // (WBP dan LWBP tidak lagi saling menimpa); LWBP membawa 7 isian cover gardu.
  var tgl = tglSel_(p[a + 'waktu']) || tglSel_(p.tanggal);
  var blok = ukurBlokGardu_(g, periode);
  var milikIni = String(blok.ukur_id_terakhir || '') === String(p.pengukuran_id);
  var tglMaster = tglSel_(blok['Tanggal Ukur Terakhir']);
  if (!milikIni && tglMaster && tglMaster > tgl) return 'TIDAK';
  var u = {
    'Tanggal Ukur Terakhir': tgl, 'Kode Ukur Terakhir': teksInsDu_(p.kode_pengukuran),
    'Arus Maks per Fasa (A)': arusNominalGardu_(p.kapasitas_kva), 'Pembebanan (kVA)': p[a + 'pembebanan_kva'],
    'Persentase Beban (%)': p[a + 'persentase_beban'], 'Kategori Beban': teksInsDu_(p[a + 'kategori_beban']),
    'Sumber Data': 'Inspeksi Gardu', ukur_id_terakhir: String(p.pengukuran_id),
    'Diubah Oleh': sesi.nama || sesi.username, 'Timestamp Update': iso, diubah_oleh: sesi.userId
  };
  INSDU_NILAI_.forEach(function (n) { u[n.master] = p[a + n.kolom]; });
  u = kolomUkurPeriode_(periode, u);
  if (periode === 'LWBP') {
    var tglCover = tglSel_(g['Tanggal Cover']);
    if (!tglCover || tglCover <= tgl) {
      u['Tanggal Cover'] = tgl;
      INSDU_COVER_.forEach(function (c) { u[COVER_GARDU_[c.kunci]] = teksInsDu_(p[c.kolom]); });
    }
  }
  tulisBlok_(tG, [{ r: g, u: u }], [], { bolehId: ['ukur_id_terakhir', 'ukur_id_lwbp'] });
  return 'YA';
}

/**
 * LWBP: realisasi hari ini, cover 7 item wajib. WBP: sesudah LWBP; realisasi hari ini atau tunggakan WBP laporan
 * terakhir tim (susulan H-1). Simpan ulang periode yang sama = menimpa (masih di batas tanggal di atas).
 */
function simpanPengukuranInsDu_(sesi, data) {
  wajibPetugasInsDu_(sesi);
  var d = validasi_(data, skemaPengukuranInsDu_());
  if (d.periode === 'LWBP') {
    INSDU_COVER_.forEach(function (c) { if (!d[c.kunci]) throw new SisiError_('FIELD_WAJIB', c.kunci); });
  } else {
    INSDU_COVER_.forEach(function (c) { if (d[c.kunci]) throw new SisiError_('FIELD_TIDAK_DIKENAL', c.kunci); });
  }
  return denganLock_(function () {
    var tH = tabelInsDu_(INSDU_SHEET_.HEADER), tR = tabelInsDu_(INSDU_SHEET_.REALISASI), tP = tabelInsDu_(INSDU_SHEET_.PENGUKURAN);
    var aktif = headerAktifInsDu_(tH.rows);
    var r = tR.rows.filter(function (x) { return String(x.realisasi_id) === String(d.realisasiId); })[0];
    if (!r) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'gardu');
    if (String(r.tim_id) !== String(sesi.timId)) throw new SisiError_('BUKAN_MILIK_TIM', 'gardu');
    if (!aktif[String(r.header_id)] || realisasiBatalInsDu_(r)) throw new SisiError_('SUDAH_BATAL', 'gardu');
    if (!perluUkurInsDu_(r.tier)) throw new SisiError_('TIER_TANPA_PENGUKURAN', teksInsDu_(r.no_gardu));   // v1.0.14
    var hariIni = tanggalHariIniHartek_(), tglR = tglInsJar_(r);
    var p = pengukuranRealisasiInsDu_(tP.rows, r.realisasi_id);
    if (tglR !== hariIni) {
      // susulan gardu tunggakan: WBP, atau LWBP (+ cover) kalau LWBP-nya juga belum ada (v1.0.16)
      var tunggak = tunggakanWbpInsDu_(sesi.timId, tH.rows, tR.rows, tP.rows);
      var x = tunggak && tunggak.realisasi.filter(function (y) { return y.realisasiId === String(r.realisasi_id); })[0];
      if (!x || (d.periode === 'LWBP' && x.kurang !== 'LWBP')) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', 'gardu');
    }
    if (d.periode === 'WBP' && !adaPeriodeInsDu_(p, 'LWBP')) throw new SisiError_('URUTAN_PENGUKURAN', 'LWBP dulu');
    var a = d.periode.toLowerCase() + '_', sekarang = sekarangIso_();
    var nilai = {};
    INSDU_NILAI_.forEach(function (n) { nilai[n.kunci] = d[n.kunci]; });
    var hasil = hasilUkurGardu_(nilai, r.kapasitas_kva);
    var u = {};
    u[a + 'waktu'] = d.waktu || sekarang;
    INSDU_NILAI_.forEach(function (n) { u[a + n.kolom] = d[n.kunci]; });
    u[a + 'pembebanan_kva'] = hasil.kva; u[a + 'persentase_beban'] = hasil.persen;
    u[a + 'kategori_beban'] = hasil.kategori; u[a + 'ketidakseimbangan'] = hasil.tidakSeimbang;
    if (d.periode === 'LWBP') INSDU_COVER_.forEach(function (c) { u[c.kolom] = d[c.kunci]; });
    if (d.catatan !== undefined) u.catatan = d.catatan;
    var baris;
    if (p) {
      u.timestamp_update = sekarang; u.diubah_oleh = sesi.userId;
      ubahBaris_(tP, 'pengukuran_id', p.pengukuran_id, u);
      baris = {};
      Object.keys(p).forEach(function (k) { baris[k] = p[k]; });
      Object.keys(u).forEach(function (k) { baris[k] = u[k]; });
      baris.revision = (Number(p.revision) || 1) + 1;
    } else {
      baris = sisipAuditInsJar_(Object.assign({
        nomor: tP.rows.length + 1, kode_realisasi: r.kode_realisasi, kode_pengukuran: r.kode_realisasi + '-UKR', tanggal: tglR,
        no_gardu: r.no_gardu, kapasitas_kva: r.kapasitas_kva,
        pengukuran_id: uuid_(), realisasi_id: r.realisasi_id, header_id: r.header_id, tim_id: r.tim_id, gardu_id: r.gardu_id
      }, u), sesi, sekarang);
      tambahBaris_(tP, baris);
    }
    tulisRingkasRealisasiInsDu_(tR, r.realisasi_id, { status_ukur: statusUkurRealisasiInsDu_(r, baris) });
    var diterapkan = '';
    try { diterapkan = terapkanUkurInsDu_(baris, d.periode, sesi, sekarang); } catch (e) {
      diterapkan = 'TIDAK';
      console.warn('InsDu: db_Gardu tidak diperbarui: ' + (e.kode || e.message));
    }
    auditLog_(sesi, 'INSDU_UKUR_' + d.periode, r.kode_realisasi, teksInsDu_(r.no_gardu), 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return {
      realisasiId: String(r.realisasi_id), periode: d.periode, statusUkur: statusUkurRealisasiInsDu_(r, baris), masukLaporan: masukLaporanInsDu_(r, baris),
      pengukuran: pengukuranKeHpInsDu_(baris), diterapkan: diterapkan
    };
  }, 30000);
}

/**
 * v1.0.16: hapus gardu tunggakan dari laporan sebelumnya (pilihan petugas selain isi pengukuran susulan).
 * Hanya gardu tunggakan laporan terakhir tim, tanpa temuan. status_ukur = BATAL: tidak masuk laporan / UP3 / tunggakan.
 */
function hapusRealisasiInsDu_(sesi, data) {
  wajibPetugasInsDu_(sesi);
  var d = validasi_(data, { realisasiId: { tipe: 'uuid', wajib: true }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 } });
  return denganLock_(function () {
    var tH = tabelInsDu_(INSDU_SHEET_.HEADER), tR = tabelInsDu_(INSDU_SHEET_.REALISASI), tP = tabelInsDu_(INSDU_SHEET_.PENGUKURAN);
    var r = tR.rows.filter(function (x) { return String(x.realisasi_id) === String(d.realisasiId); })[0];
    if (!r) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'gardu');
    if (String(r.tim_id) !== String(sesi.timId)) throw new SisiError_('BUKAN_MILIK_TIM', 'gardu');
    if (realisasiBatalInsDu_(r)) return { realisasiId: String(r.realisasi_id), duplikat: true };
    var tunggak = tunggakanWbpInsDu_(sesi.timId, tH.rows, tR.rows, tP.rows);
    if (!tunggak || !tunggak.realisasi.some(function (x) { return x.realisasiId === String(r.realisasi_id); })) {
      throw new SisiError_('TANGGAL_DI_LUAR_BATAS', 'gardu');
    }
    var punyaTemuan = tabelInsDu_(INSJAR_SHEET_.TEMUAN).rows.some(function (t) { return String(t.realisasi_id) === String(r.realisasi_id); });
    if (punyaTemuan) throw new SisiError_('GARDU_PUNYA_TEMUAN', teksInsDu_(r.no_gardu));
    var rev = ubahBaris_(tR, 'realisasi_id', d.realisasiId,
      { status_ukur: INSDU_STATUS_UKUR_.batal, timestamp_update: sekarangIso_(), diubah_oleh: sesi.userId }, d.revision);
    auditLog_(sesi, 'INSDU_REALISASI_HAPUS', teksInsDu_(r.kode_realisasi), teksInsDu_(r.no_gardu), 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { realisasiId: String(r.realisasi_id), revision: rev };
  }, 30000);
}

/* ===== temuan gardu (diinput di kartu gardu) ===== */

function isiTemuanInsDu_() {
  return {
    tierInspeksi: { tipe: 'pilihan', pilihan: INSJAR_TIER_ },
    jenisTemuanId: { tipe: 'teks', wajib: true, maks: 60 },
    deskripsi: { tipe: 'teks', maks: 500, multiBaris: true, maksBaris: 5 },
    koordinat: { tipe: 'koordinat', wajib: true }   // v1.0.14: wajib (HP mengisi awal dari Lat / Long db_Gardu)
  };
}

function simpanTemuanInsDu_(sesi, data) {
  wajibPetugasInsDu_(sesi);
  var s = { realisasiId: { tipe: 'uuid', wajib: true }, idBaris: { tipe: 'uuid' } };
  var isiT = isiTemuanInsDu_();
  Object.keys(isiT).forEach(function (k) { s[k] = isiT[k]; });
  var d = validasi_(data, s);
  return denganLock_(function () {
    var tT = tabelInsDu_(INSJAR_SHEET_.TEMUAN);
    var ulang = barisUlangInsJar_(tT.rows, 'temuan_id', d.idBaris, sesi.timId);
    if (ulang) return { temuanId: String(ulang.temuan_id), kodeTemuan: String(ulang.kode_temuan), duplikat: true };
    var tR = tabelInsDu_(INSDU_SHEET_.REALISASI);
    var r = indukInsDu_(tR.rows, 'realisasi_id', d.realisasiId, sesi, 'gardu', headerAktifInsDu_(tabelInsDu_(INSDU_SHEET_.HEADER).rows));
    var tier = tierTemuanInsDu_(r, d.tierInspeksi);   // v1.0.14: tier temuan dari tier gardu
    var jenis = jenisTemuanInsJar_(d.jenisTemuanId, INSDU_OBJEK_, tier);
    var awalan = r.kode_realisasi + '-TGD.';
    var kode = awalan + pad3_(urutBerikutHartek_(tT.rows, 'kode_temuan', awalan));
    var id = d.idBaris || uuid_(), sekarang = sekarangIso_();
    var baris = barisTemuanInsJar_(tT, d, { penyulang: teksInsDu_(r.penyulang), section: teksInsDu_(r.section), sectionId: String(r.section_id || '') }, jenis, {
      kodeHeader: r.kode_header, kodeRealisasi: r.kode_realisasi, kodeTemuan: kode, tanggal: tglInsJar_(r),
      ulp: r.ulp, tim: r.tim, tier: tier, tierInspeksi: tier, objekInspeksi: INSDU_OBJEK_,
      headerId: r.header_id, realisasiId: r.realisasi_id, timId: sesi.timId, sumber: 'INSPEKSI',
      noGardu: teksInsDu_(r.no_gardu), garduId: String(r.gardu_id || '')
    }, sesi, sekarang, id);
    tambahBaris_(tT, baris);
    var h = hitungTemuanInsDu_(tT.rows, r.realisasi_id, [baris]);
    tulisRingkasRealisasiInsDu_(tR, r.realisasi_id, h);
    auditLog_(sesi, 'INSDU_TEMUAN_SIMPAN', kode, jenis.nama, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { temuanId: id, kodeTemuan: kode, jumlahTemuan: h.jumlah_temuan, revision: 1 };
  }, 20000);
}

/** Ubah temuan gardu hari ini (termasuk temuan lanjutan). Isian lengkap seperti ubahTemuanInsJar. */
function ubahTemuanInsDu_(sesi, data) {
  wajibPetugasInsDu_(sesi);
  var s = { temuanId: { tipe: 'uuid', wajib: true }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 } };
  var isiT = isiTemuanInsDu_();
  Object.keys(isiT).forEach(function (k) { s[k] = isiT[k]; });
  var d = validasi_(data, s);
  return denganLock_(function () {
    var tT = tabelInsDu_(INSJAR_SHEET_.TEMUAN);
    var t = indukInsDu_(tT.rows, 'temuan_id', d.temuanId, sesi, 'temuan');
    if (teksInsDu_(t.objek_inspeksi) !== INSDU_OBJEK_) throw new SisiError_('BUKAN_MILIK_TIM', 'temuan');
    cekTemuanBolehDiubahWo_(t);   // v1.0.10
    if (Number(t.revision) !== d.revision) throw new SisiError_('KONFLIK_REVISION', d.temuanId);
    var rInduk = tabelInsDu_(INSDU_SHEET_.REALISASI).rows.filter(function (x) { return String(x.realisasi_id) === String(t.realisasi_id); })[0];
    var tier = rInduk ? tierTemuanInsDu_(rInduk, d.tierInspeksi || teksInsDu_(t.tier_inspeksi)) : (d.tierInspeksi || teksInsDu_(t.tier_inspeksi || t.tier));
    var jenis = jenisTemuanInsJar_(d.jenisTemuanId, INSDU_OBJEK_, tier);
    var u = {
      tier_inspeksi: tier, jenis_temuan: jenis.nama, jenis_temuan_id: jenis.jenisTemuanId, deskripsi: d.deskripsi || '',
      koordinat: d.koordinat ? d.koordinat.teks : '', lat: d.koordinat ? d.koordinat.lat : '', lng: d.koordinat ? d.koordinat.lng : '',
      timestamp_update: sekarangIso_(), diubah_oleh: sesi.userId
    };
    var rev = ubahBaris_(tT, 'temuan_id', d.temuanId, u, d.revision);
    var baru = {};
    Object.keys(t).forEach(function (k) { baru[k] = t[k]; });
    Object.keys(u).forEach(function (k) { baru[k] = u[k]; });
    baru.revision = rev;
    auditLog_(sesi, 'INSDU_TEMUAN_UBAH', t.kode_temuan, jenis.nama, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { temuanId: String(d.temuanId), kodeTemuan: teksInsDu_(t.kode_temuan), revision: rev, temuan: temuanKeHpInsJar_(baru) };
  }, 20000);
}

/** Foto temuan + foto gardu (slot TEMUAN / TIANG, kolom sama dengan Inspeksi Jaringan). */
function uploadFotoInsDu_(sesi, data) {
  wajibPetugasInsDu_(sesi);
  var d = validasi_(data, skemaFotoInsJar_());
  var folderId = folderFotoTemuan_();
  var bytes = bytesFotoLapangan_(d);
  return denganLock_(function () {
    var t = tabelInsDu_(INSJAR_SHEET_.TEMUAN);
    var r = indukInsDu_(t.rows, 'temuan_id', d.temuanId, sesi, 'temuan');
    if (teksInsDu_(r.objek_inspeksi) !== INSDU_OBJEK_) throw new SisiError_('BUKAN_MILIK_TIM', 'temuan');
    var kol = INSJAR_FOTO_[d.slot];
    var ada = teksInsDu_(r[kol + '_link']);
    if (ada) return { temuanId: d.temuanId, slot: d.slot, link: ada, status: 'DUPLIKAT', revision: Number(r.revision) || 1 };
    var kode = kodeFotoTemuan_(r);
    var f = simpanFotoLapangan_(folderId, ['Inspeksi Gardu', tglInsJar_(r), String(r.kode_header || '-')],
      d.temuanId + '-' + d.slot, namaFotoRow_(kode, d.slot, 1), bytes);
    var u = { timestamp_update: sekarangIso_(), diubah_oleh: sesi.userId };
    u[kol + '_file_id'] = f.fileId;
    u[kol + '_link'] = f.link;
    var rev = ubahBaris_(t, 'temuan_id', d.temuanId, u);
    auditLog_(sesi, 'INSDU_FOTO_UPLOAD', kode, d.slot, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { temuanId: d.temuanId, slot: d.slot, link: f.link, status: 'OK', revision: rev };
  }, 30000);
}

/* ===== laporan UP3 (D. Inspeksi, Gardu) ===== */

/**
 * Inspeksi Gardu satu tanggal (hanya baca, untuk laporan UP3). Realisasi = gardu yang SUDAH ADA LWBP, header AKTIF.
 * v1.0.34: gardu hasil migrasi v1 (dibuat_oleh MIGRASI) dihitung seperti v1 (1 baris = 1 Unit): pengukuran v1 hidup di
 * Master_Gardu, bukan per inspeksi, jadi tidak pernah punya LWBP di v2.
 * Hasil: { perPenyulang: { penyulang: jumlah gardu }, komulatif: jumlah gardu tgl 1 s.d. tanggal, status, timLapor (v1.0.35 kartu
 * Status tim) }. Konfigurasi kosong = 0 / status V1.
 */
function dataInspeksiGarduHari_(tanggal) {
  var kosong = { perPenyulang: {}, komulatif: 0, status: 'V1', timLapor: 0 };   // v1.0.35: + status tim (statusTimHeader_)
  if (!cfg_().INSDU_SHEET_ID) return kosong;
  var H = tabelInsDu_(INSDU_SHEET_.HEADER).rows, R = tabelInsDu_(INSDU_SHEET_.REALISASI).rows;
  var aktif = headerAktifInsDu_(H);
  var rowsP = tabelInsDu_(INSDU_SHEET_.PENGUKURAN).rows;
  var bulan = tanggal.slice(0, 7), per = {}, kom = 0;
  R.forEach(function (r) {
    if (!aktif[String(r.header_id)]) return;
    var t = tglInsJar_(r);
    if (t.slice(0, 7) !== bulan || t > tanggal) return;
    var migrasi = String(r.dibuat_oleh || '') === MIGINS_OLEH_;
    if (migrasi ? realisasiBatalInsDu_(r) : !masukLaporanInsDu_(r, pengukuranRealisasiInsDu_(rowsP, r.realisasi_id))) return;   // v1.0.14: Tier 2 saja tanpa ukur
    kom++;
    if (t !== tanggal) return;
    var p = teksInsDu_(r.penyulang) || '-';
    per[p] = (per[p] || 0) + 1;
  });
  return Object.assign({ perPenyulang: per, komulatif: kom }, statusTimHeader_(H, R, tanggal, tglInsJar_));
}

/* ===== setup sheet + cek konfigurasi ===== */

/**
 * Membuat DAN menyesuaikan sheet Inspeksi Gardu (aman diulang), pola sama dengan ADMIN_siapkanSheetInsJar:
 *  SiSi_InsDu > db_insdu_header, db_insdu_realisasi, db_insdu_pengukuran; SiSi_Temuan > db_temuan_inspeksi (kolom
 *  baru no_gardu, gardu_id, temuan_asal_id). Cadangan spreadsheet dibuat sebelum kolom digeser.
 *  Pratinjau tanpa mengubah: ADMIN_cekSheetInsDu.
 */
function ADMIN_siapkanSheetInsDu() { pastikanPemilik_(); return jalankanSiapkanInsDu_(false); }

function ADMIN_cekSheetInsDu() { pastikanPemilik_(); return jalankanSiapkanInsDu_(true); }

function jalankanSiapkanInsDu_(uji) {
  var c = cfg_();
  var target = [];
  if (c.INSDU_SHEET_ID) target.push({ id: c.INSDU_SHEET_ID, label: 'SiSi_InsDu > ', tab: headerInsDu_() });
  if (c.TEMUAN_SHEET_ID) target.push({ id: c.TEMUAN_SHEET_ID, label: 'SiSi_Temuan > ', tab: TEMUAN_HEADER_ });
  console.log(uji ? '=== CEK SHEET INSPEKSI GARDU (tidak mengubah apa pun) ===' : '=== SIAPKAN SHEET INSPEKSI GARDU ===');
  var masalah = 0;
  denganLock_(function () {
    target.forEach(function (tg) {
      var ss = bukaSpreadsheet_(tg.id);
      var nama = Object.keys(tg.tab);
      var perluGeser = nama.some(function (n) {
        var sh = ss.getSheetByName(n);
        if (!sh) return false;
        var r = rencanaKolomHartek_(sh.getRange(1, 1, 1, Math.max(tg.tab[n].length, sh.getLastColumn() || 1)).getValues()[0], tg.tab[n]);
        return !r.galat && r.langkah.length > 0;
      });
      if (!uji && perluGeser && !cadanganSheetHartek_(tg.id, tg.label)) { masalah++; return; }
      nama.forEach(function (n) { if (siapkanTabHartek_(ss, n, tg.tab[n], tg.label, uji).status === 'GAGAL') masalah++; });
    });
    if (!c.INSDU_SHEET_ID) { masalah++; console.error('INSDU_SHEET_ID kosong: isi Script Property dengan ID spreadsheet SiSi_InsDu, lalu jalankan lagi.'); }
    if (!c.TEMUAN_SHEET_ID) { masalah++; console.error('TEMUAN_SHEET_ID kosong: isi Script Property dengan ID spreadsheet SiSi_Temuan, lalu jalankan lagi.'); }
  }, 30000);
  console.log(masalah ? 'SELESAI dengan ' + masalah + ' masalah (lihat log di atas).'
    : uji ? 'SELESAI. Jalankan ADMIN_siapkanSheetInsDu untuk menerapkan rencana di atas.'
      : 'SELESAI. Isi jenis temuan objek Gardu di db_Jenis_Temuan, impor db_Menu / db_Akses InsDu, lalu ADMIN_bersihkanCache + ADMIN_cekKonfigurasi.');
  return masalah;
}

function cekKonfigInsDu_(c) {
  var masalah = 0;
  var ok = function (p) { console.log('  [OK]          ' + p); };
  var perhatian = function (p) { masalah++; console.warn('  [PERHATIAN]   ' + p); };
  var gagal = function (p) { masalah++; console.error('  [GAGAL]       ' + p); };
  console.log('');
  console.log('--- Inspeksi Gardu (SiSi_InsDu + db_temuan_inspeksi + db_Gardu) ---');
  if (!c.INSDU_SHEET_ID) {
    console.log('  [DILEWATI]    INSDU_SHEET_ID kosong, modul Inspeksi Gardu belum disiapkan (isi Script Property, lalu ADMIN_siapkanSheetInsDu)');
    return 0;
  }
  if (!c.GARDU_SHEET_ID) gagal('GARDU_SHEET_ID kosong: gardu yang diinspeksi dipilih dari db_Gardu');
  Object.keys(headerInsDu_()).forEach(function (n) {
    try {
      var t = tabel_('INSDU_SHEET_ID', n), hk = headerInsDu_()[n];
      var beda = bedaStruktur_(t.header.slice(0, hk.length), hk);
      if (beda.length) perhatian(n + ': STRUKTUR BEDA -> ' + beda.slice(0, 5).join(' | ') + ' (jalankan ADMIN_siapkanSheetInsDu)');
      else ok(n + ' (' + t.rows.length + ' baris)');
    } catch (e) { gagal(n + ': ' + (e.kode === 'SHEET_TIDAK_ADA' ? 'belum ada (jalankan ADMIN_siapkanSheetInsDu)' : (e.kode || e.message))); }
  });
  try {
    var jt = jenisTemuanAktifInsJar_(INSDU_OBJEK_, '').length;
    if (jt) ok('db_Jenis_Temuan: ' + jt + ' jenis temuan aktif objek Gardu');
    else perhatian('db_Jenis_Temuan: belum ada jenis temuan aktif objek Gardu');
  } catch (eJ) { gagal('db_Jenis_Temuan: ' + (eJ.kode || eJ.message)); }
  try {
    var menu = tabel_('MASTER_SHEET_ID', 'db_Menu').rows.filter(function (x) { return String(x.menu_kode).trim() === INSDU_MENU_; })[0];
    if (!menu) perhatian('menu ' + INSDU_MENU_ + ' belum ada di db_Menu (impor docs/db_Menu.tsv)');
    else ok('menu ' + INSDU_MENU_ + ' ada di db_Menu');
  } catch (eM) { gagal('db_Menu: ' + (eM.kode || eM.message)); }
  return masalah;
}

/** v1.0.19: foto temuan Inspeksi Gardu tim sendiri (kartu temuan, termasuk temuan tertinggal). */
function getFotoTemuanInsDu_(sesi, data) {
  wajibPetugasInsDu_(sesi);
  return fotoTemuanDrive_(data, function (t) { return String(t.tim_id) === String(sesi.timId); });
}
