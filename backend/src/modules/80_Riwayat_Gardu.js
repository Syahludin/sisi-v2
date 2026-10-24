/**
 * v1.0.17 (permintaan kvlar 22 Okt 2026): RIWAYAT GARDU untuk menu admin Pengukuran Gardu (OPS_PENGUKURAN_GARDU).
 * Satu panggilan per gardu, hanya baca:
 *   pengukuran : riwayat ukur lengkap (arus R / S / T / N + 6 tegangan + beban, persen, kategori, ketidakseimbangan)
 *                dari Pengecekan Gardu Yandal (yan_Gardu) dan Inspeksi Gardu (db_insdu_pengukuran, LWBP + WBP)
 *   temuan     : riwayat temuan gardu (db_temuan_inspeksi) + riwayat perbaikannya (WO tindak lanjut: tim, pekerjaan,
 *                status, tindak lanjut, waktu selesai)
 *   ba         : Berita Acara yang dipakai gardu ini (Rekap_BA) = history perbaikan & manajemen trafo
 *                (trafo sebelum -> sesudah, status BA / PDF)
 * v1.0.21 (permintaan kvlar 23 Okt 2026): Master Gardu (db_Gardu, pengukuran terakhir yang tercatat) jadi sumber ketiga.
 *   terbaru    : {LWBP, WBP} = pengukuran dengan tanggal (lalu jam) terbaru dari 3 sumber per periode
 *   gardu      : baris Master Gardu terkini (data trafo / nameplate + koordinat), null kalau tidak ada
 * Sumber yang spreadsheet-nya belum diatur dilewati (bagian itu kosong).
 * v1.0.22 (permintaan kvlar 23 Okt 2026): `terbaru` hanya dari Master Gardu (perbandingan 3 sumber terlalu lama di HP).
 *   Riwayat tetap semua sumber (+ ukurId). updateUkurMasterGardu: satu pengukuran riwayat ditulis ke Master Gardu.
 */

var RIWAYAT_GARDU_MAKS_ = 60;

function wajibAdminRiwayatGardu_(sesi) {
  if (!sesi || sesi.role === 'PETUGAS' || ROLE_VALID_().indexOf(sesi.role) === -1) {
    throw new SisiError_('AKSES_DITOLAK', 'riwayat gardu khusus admin');
  }
}

function teksRg_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function angkaRg_(v) { return v === '' || v === null || v === undefined || !isFinite(Number(v)) ? null : Number(v); }

/**
 * v1.0.20 (permintaan kvlar 23 Okt 2026): periode ukur selalu LWBP / WBP supaya admin bisa membedakannya. Isian Waktu
 * Beban lama kosong / tidak baku = dari jam ukur (WBP 17:00-21:59 WIB, sama dengan waktuBebanGardu_).
 */
function periodeUkurRg_(periode, jam) {
  var p = teksRg_(periode).toUpperCase();
  if (/LWBP/.test(p)) return 'LWBP';
  if (/WBP/.test(p)) return 'WBP';
  var m = /^(\d{1,2}):/.exec(teksRg_(jam));
  if (!m) return '';
  var h = Number(m[1]);
  return h >= YAN_WBP_JAM_.mulai && h < YAN_WBP_JAM_.sampai ? 'WBP' : 'LWBP';
}

/** Riwayat ukur Yandal (yan_Gardu). */
function ukurYandalRg_(garduId, noGardu) {
  if (!cfg_().YANDAL_SHEET_ID) return [];
  return bacaSheetYandal_(['yan_Gardu']).yan_Gardu.rows.filter(function (r) {
    return (String(r.gardu_id) === garduId || teksRg_(r['No Gardu']).toUpperCase() === noGardu) && teksRg_(r.status) !== 'BATAL';
  }).map(function (r) {
    return {
      sumber: 'Pengecekan Gardu Yandal', ukurId: teksRg_(r.ukur_id), kode: teksRg_(r['Kode Pengukuran Gardu']), tanggal: tglSel_(r.Tanggal),
      periode: periodeUkurRg_(r['Waktu Beban'], jamUkurSel_(r['Jam Ukur'])),
      jam: jamUkurSel_(r['Jam Ukur']), petugas: teksRg_(r.Petugas || r.Tim),
      bebanR: angkaRg_(r['Beban R (A)']), bebanS: angkaRg_(r['Beban S (A)']), bebanT: angkaRg_(r['Beban T (A)']), bebanN: angkaRg_(r['Beban N (A)']),
      teganganRS: angkaRg_(r['Tegangan R-S (V)']), teganganRT: angkaRg_(r['Tegangan R-T (V)']), teganganST: angkaRg_(r['Tegangan S-T (V)']),
      teganganRN: angkaRg_(r['Tegangan R-N (V)']), teganganSN: angkaRg_(r['Tegangan S-N (V)']), teganganTN: angkaRg_(r['Tegangan T-N (V)']),
      kva: angkaRg_(r['Pembebanan (kVA)']), persen: angkaRg_(r['Persentase Beban (%)']), kategori: teksRg_(r['Kategori Beban']),
      tidakSeimbang: angkaRg_(r['Ketidakseimbangan Beban (%)'])
    };
  });
}

/** Riwayat ukur Inspeksi Gardu (db_insdu_pengukuran): satu baris per periode (LWBP / WBP) yang terisi. */
function ukurInsDuRg_(garduId, noGardu) {
  if (!cfg_().INSDU_SHEET_ID) return [];
  var hasil = [];
  tabelInsDu_(INSDU_SHEET_.PENGUKURAN).rows.forEach(function (r) {
    if (String(r.gardu_id) !== garduId && teksRg_(r.no_gardu).toUpperCase() !== noGardu) return;
    ['LWBP', 'WBP'].forEach(function (p) {
      var a = p.toLowerCase() + '_';
      if (angkaRg_(r[a + 'beban_r']) === null && angkaRg_(r[a + 'tegangan_rn']) === null) return;
      hasil.push({
        sumber: 'Inspeksi Gardu', ukurId: teksRg_(r.pengukuran_id), kode: teksRg_(r.kode_pengukuran), tanggal: tglSel_(r.tanggal), periode: p, jam: jamUkurSel_(r[a + 'waktu']),
        petugas: '',
        bebanR: angkaRg_(r[a + 'beban_r']), bebanS: angkaRg_(r[a + 'beban_s']), bebanT: angkaRg_(r[a + 'beban_t']), bebanN: angkaRg_(r[a + 'beban_n']),
        teganganRS: angkaRg_(r[a + 'tegangan_rs']), teganganRT: angkaRg_(r[a + 'tegangan_rt']), teganganST: angkaRg_(r[a + 'tegangan_st']),
        teganganRN: angkaRg_(r[a + 'tegangan_rn']), teganganSN: angkaRg_(r[a + 'tegangan_sn']), teganganTN: angkaRg_(r[a + 'tegangan_tn']),
        kva: angkaRg_(r[a + 'pembebanan_kva']), persen: angkaRg_(r[a + 'persentase_beban']), kategori: teksRg_(r[a + 'kategori_beban']),
        tidakSeimbang: angkaRg_(r[a + 'ketidakseimbangan'])
      });
    });
  });
  return hasil;
}

/** Riwayat temuan gardu + perbaikannya (WO tindak lanjut). */
function temuanRg_(garduId, noGardu) {
  if (!cfg_().TEMUAN_SHEET_ID) return [];
  var tl = [];
  try { tl = tabelInsJar_(WO_TL_SHEET_).rows; } catch (e) { if (!e || e.kode !== 'SHEET_TIDAK_ADA') throw e; }
  return tabelInsJar_(INSJAR_SHEET_.TEMUAN).rows.filter(function (t) {
    return String(t.gardu_id) === garduId || (noGardu && teksRg_(t.no_gardu).toUpperCase() === noGardu);
  }).map(function (t) {
    return {
      temuanId: String(t.temuan_id), kodeTemuan: teksRg_(t.kode_temuan), tanggal: tglInsJar_(t), jenisTemuan: teksRg_(t.jenis_temuan),
      deskripsi: teksRg_(t.deskripsi), tier: teksRg_(t.tier_inspeksi), sumber: teksRg_(t.sumber), timInspeksi: teksRg_(t.tim),
      status: teksRg_(t.status), statusWo: teksRg_(t.status_wo), timTindakLanjut: teksRg_(t.tim_tindak_lanjut),
      tindakLanjut: teksRg_(t.tindak_lanjut), waktuSelesai: teksRg_(t.waktu_selesai), belumDiperbaiki: teksRg_(t.belum_diperbaiki),
      lanjutanDari: teksRg_(t.temuan_asal_id),
      perbaikan: tl.filter(function (x) { return String(x.temuan_id) === String(t.temuan_id) && teksRg_(x.status) !== 'BATAL'; }).map(function (x) {
        return { kodeTl: teksRg_(x.kode_tl), tanggal: tglSel_(x.tanggal), tim: teksRg_(x.tim), pekerjaan: teksRg_(x.pekerjaan),
                 jumlah: angkaRg_(x.jumlah), satuan: teksRg_(x.satuan), status: teksRg_(x.status), kodeRealisasi: teksRg_(x.kode_realisasi_modul) };
      })
    };
  });
}

/** v1.0.21: baris Master Gardu (bentuk HP, barisGarduHp_) gardu ini: gardu_id dulu, lalu No Gardu. */
function masterGarduRg_(garduId, noGardu) {
  if (!cfg_().GARDU_SHEET_ID) return null;
  var rows = cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu').rows;
  var r = rows.filter(function (x) { return String(x.gardu_id) === garduId; })[0] ||
          (noGardu ? rows.filter(function (x) { return teksRg_(x['No Gardu']).toUpperCase() === noGardu; })[0] : null);
  return r ? barisGarduHp_(r) : null;
}

/**
 * v1.0.21: pengukuran yang tercatat di Master Gardu, bentuk sama dengan riwayat Yandal / Inspeksi Gardu.
 * v1.0.23: dua blok, WBP (kolom lama; baris lama sebelum rombak memakai Waktu Beban-nya) dan LWBP.
 */
function ukurMasterRg_(m) {
  if (!m) return [];
  var satu = function (b, periode) {
    if (!b || !b.tglUkur) return null;
    var u = b.ukur || {};
    return {
      sumber: 'Master Gardu', ukurId: '', kode: b.kodeUkur || '', tanggal: b.tglUkur.slice(0, 10), periode: periode, jam: '',
      petugas: b.sumberUkur || '',
      bebanR: u.bebanR, bebanS: u.bebanS, bebanT: u.bebanT, bebanN: u.bebanN,
      teganganRS: u.teganganRS, teganganRT: u.teganganRT, teganganST: u.teganganST,
      teganganRN: u.teganganRN, teganganSN: u.teganganSN, teganganTN: u.teganganTN,
      kva: b.bebanKva, persen: b.persen, kategori: b.kategori || '', tidakSeimbang: null
    };
  };
  return [satu(m, periodeUkurRg_(m.waktuBeban, '') || 'WBP'), satu(m.lwbp, 'LWBP')].filter(Boolean);
}

/** v1.0.21: pengukuran terbaru per periode (tanggal lalu jam). v1.0.22: dipanggil dengan pengukuran Master Gardu saja. */
function terbaruRg_(ukur) {
  var h = { LWBP: null, WBP: null };
  ukur.forEach(function (u) {
    if (!h.hasOwnProperty(u.periode)) return;
    var a = h[u.periode], k = u.tanggal + ' ' + (u.jam || ''), ka = a ? a.tanggal + ' ' + (a.jam || '') : '';
    if (!a || k > ka) h[u.periode] = u;
  });
  return h;
}

/** Berita Acara gardu (history perbaikan & manajemen trafo). */
function baRg_(garduId, noGardu) {
  if (!cfg_().GARDU_SHEET_ID) return [];
  return tabel_('GARDU_SHEET_ID', 'Rekap_BA').rows.filter(function (b) {
    return String(b.gardu_id) === garduId || (noGardu && teksRg_(b['Asal Nomor Gardu']).toUpperCase() === noGardu && !teksRg_(b.gardu_id));
  }).map(function (b) {
    return {
      baId: teksRg_(b.ba_id), noBa: teksRg_(b['No BA Full']), jenisPekerjaan: teksRg_(b['Jenis Pekerjaan']), tanggalBa: tglSel_(b['Tanggal BA']),
      tanggalPekerjaan: tglSel_(b['Tanggal Pekerjaan']), statusBa: teksRg_(b['Status BA']), statusPdf: teksRg_(b['Status PDF']),
      statusTtd: teksRg_(b['Status TTD']), kesimpulan: teksRg_(b.Kesimpulan), catatan: teksRg_(b.Catatan),
      trafo: { merk: teksRg_(b.Merk), seri: teksRg_(b['Nomor Seri']), tahun: teksRg_(b.Tahun), kva: angkaRg_(b['Kapasitas (kVA)']) },
      trafoSesudah: { merk: teksRg_(b['Merk Sesudah']), seri: teksRg_(b['Nomor Seri Sesudah']), tahun: teksRg_(b['Tahun Sesudah']),
                      kva: angkaRg_(b['Kapasitas Sesudah (kVA)']) },
      asalPeralatan: teksRg_(b['Asal Peralatan']), alasanBongkar: teksRg_(b['Alasan Pembongkaran']), vendor: teksRg_(b['Vendor Pekerja'])
    };
  });
}

function bagianRg_(fn) {
  try { return fn(); } catch (e) {
    if (e && (e.kode === 'CONFIG_TIDAK_LENGKAP' || e.kode === 'SHEET_TIDAK_ADA' || e.kode === 'STRUKTUR_BERUBAH' || e.kode === 'SKEMA_BERUBAH')) return [];
    throw e;
  }
}

function getRiwayatGardu_(sesi, data) {
  wajibAdminRiwayatGardu_(sesi);
  var d = validasi_(data, { garduId: { tipe: 'teks', wajib: true, maks: 60 }, noGardu: { tipe: 'teks', maks: 20 } });
  var id = String(d.garduId), no = teksRg_(d.noGardu).toUpperCase();
  var urutTurun = function (a, b) { return a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : 0; };
  var ukur = bagianRg_(function () { return ukurYandalRg_(id, no); }).concat(bagianRg_(function () { return ukurInsDuRg_(id, no); }));
  var master = null;
  try { master = masterGarduRg_(id, no); } catch (e) {
    if (!e || ['CONFIG_TIDAK_LENGKAP', 'SHEET_TIDAK_ADA', 'STRUKTUR_BERUBAH', 'SKEMA_BERUBAH'].indexOf(e.kode) === -1) throw e;
  }
  // salinan master dari pengukuran yang sudah ada di riwayat (kode sama) tidak ditulis dua kali
  var kode = {};
  ukur.forEach(function (u) { if (u.kode) kode[u.kode] = true; });
  ukur = ukur.concat(ukurMasterRg_(master).filter(function (u) { return !u.kode || !kode[u.kode]; })).sort(urutTurun);
  return {
    garduId: id, noGardu: no,
    gardu: master,
    terbaru: terbaruRg_(ukurMasterRg_(master)),
    pengukuran: ukur.slice(0, RIWAYAT_GARDU_MAKS_),
    temuan: bagianRg_(function () { return temuanRg_(id, no); }).sort(urutTurun),
    ba: bagianRg_(function () { return baRg_(id, no); }).sort(function (a, b) { return a.tanggalBa < b.tanggalBa ? 1 : a.tanggalBa > b.tanggalBa ? -1 : 0; })
  };
}

/* ===== v1.0.22: Update Pengukuran Gardu (riwayat -> Master Gardu) ===== */

var SUMBER_UKUR_RG_ = ['Pengecekan Gardu Yandal', 'Inspeksi Gardu'];

/** Kolom db_Gardu dari satu pengukuran riwayat (bentuk ukurYandalRg_ / ukurInsDuRg_). Angka kosong = sel kosong. */
function kolomMasterUkurRg_(u) {
  var isi = function (v) { return v === null || v === undefined ? '' : v; };
  var hasil = {
    'Tanggal Ukur Terakhir': u.tanggal, 'Kode Ukur Terakhir': u.kode,
    'Pembebanan (kVA)': isi(u.kva), 'Persentase Beban (%)': isi(u.persen), 'Kategori Beban': u.kategori || '',
    'Sumber Data': u.sumber, ukur_id_terakhir: u.ukurId
  };
  YAN_NILAI_GARDU_.forEach(function (n) { hasil[n.kolom] = isi(u[n.kunci]); });
  return kolomUkurPeriode_(u.periode, hasil);   // v1.0.23: blok WBP / LWBP
}

/**
 * updateUkurMasterGardu {garduId, noGardu?, sumber, ukurId, periode}: pengukuran riwayat (Yandal / Inspeksi Gardu)
 * yang dipilih admin menjadi pengukuran terakhir Master Gardu, juga kalau tanggalnya lebih lama (keputusan admin).
 * Jawaban: {gardu (bentuk HP), terbaru}. Versi master gardu ikut berubah (hash isi), HP mengunduh ulang.
 * v1.0.23: ditulis ke blok periodenya (WBP = kolom lama, LWBP = blok LWBP).
 */
function updateUkurMasterGardu_(sesi, data) {
  wajibAdminRiwayatGardu_(sesi);
  var d = validasi_(data, {
    garduId: { tipe: 'teks', wajib: true, maks: 60 }, noGardu: { tipe: 'teks', maks: 20 },
    sumber: { tipe: 'pilihan', wajib: true, pilihan: SUMBER_UKUR_RG_ }, ukurId: { tipe: 'teks', wajib: true, maks: 60 },
    periode: { tipe: 'pilihan', wajib: true, pilihan: ['LWBP', 'WBP'] }
  });
  var id = String(d.garduId), no = teksRg_(d.noGardu).toUpperCase();
  var sumber = d.sumber === 'Inspeksi Gardu' ? ukurInsDuRg_(id, no) : ukurYandalRg_(id, no);
  var u = sumber.filter(function (x) { return x.ukurId === String(d.ukurId) && x.periode === d.periode; })[0];
  if (!u || !u.tanggal) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'pengukuran');
  return denganLock_(function () {
    var tG = tabelGarduUkur_();
    var g = tG.rows.filter(function (x) { return String(x.gardu_id) === id; })[0];
    if (!g) throw new SisiError_('GARDU_TIDAK_DITEMUKAN', no || id);
    if (teksRg_(g['Status Gardu']).toUpperCase() !== 'AKTIF') throw new SisiError_('GARDU_TIDAK_AKTIF', teksRg_(g['No Gardu']));
    var tLog = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var ubah = Object.assign(kolomMasterUkurRg_(u), {
      'Diubah Oleh': sesi.nama || sesi.username || '', 'Timestamp Update': sekarangIso_(), diubah_oleh: sesi.userId || ''
    });
    tulisBlok_(tG, [{ r: g, u: ubah }], [], { bolehId: ['ukur_id_terakhir', 'ukur_id_lwbp'] });
    auditLog_(sesi, 'UPDATE_UKUR_GARDU', teksRg_(g['No Gardu']), u.sumber + ' ' + u.kode + ' ' + u.periode + ' ' + u.tanggal, 'MOBILE', tLog);
    var baru = barisGarduHp_(Object.assign({}, g, ubah, { revision: (Number(g.revision) || 0) + 1 }));
    return { gardu: baru, terbaru: terbaruRg_(ukurMasterRg_(baru)) };
  });
}
