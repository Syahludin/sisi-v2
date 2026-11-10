/**
 * v0.98.8 (keputusan 16 Okt 2026): Migrasi data lama Hartek v1 -> SiSi_Hartek v2.
 *
 * Sumber (HANYA DIBACA, tidak pernah ditulis):
 *  - Spreadsheet utama / gabungan v1: Script Property MIGHARTEK_SUMBER_ID (cadangan: MIG_SUMBER_ID).
 *    Opsional file arsip v1 terpisah: MIGHARTEK_ARSIP_ID (digabung otomatis, dedup kode).
 *    Opsional file terpisah grounding + pemerataan v1: MIGHARTEK_GROUNDING_ID (kalau kosong, dicari di file utama dulu).
 *  - Tab sumber v1 (COL_INS.HEADER & COL_HTK dari Tek-Hartek-Code.js v1):
 *      db_Global_Header (Tim = Hartek) -> db_Hartek_Header
 *      db_Hartek_PenyulangGardu        -> db_Hartek_PenyulangGardu
 *      db_Hartek_Pekerjaan             -> db_Hartek_Pekerjaan
 *      db_Hartek_Material              -> db_Hartek_Material (opsional)
 *      db_Hartek_HarGrounding          -> db_Hartek_Grounding (opsional, juga terima nama db_Hartek_Grounding)
 *      db_Hartek_PemerataanBeban       -> db_Hartek_PemerataanBeban (opsional)
 *
 * Tahap (dijalankan dari editor Apps Script oleh pemilik):
 *   ADMIN_migrasiHartekCek    DRY-RUN: baca sumber + master, tulis mightk_Cek + mightk_Ringkas di SiSi_Hartek.
 *                             db_Hartek_* tidak disentuh.
 *   ADMIN_migrasiHartekJalan  Tulis ke 6 tab db_Hartek_* (dibuat_oleh = MIGRASI, ID deterministik dari kode v1,
 *                             idempoten & aman dilanjutkan kalau terpotong batas waktu 4,5 menit) + mightk_Peta.
 *                             Data v2 asli tidak disentuh.
 *   ADMIN_migrasiHartekHapus  Rollback semua baris dibuat_oleh = MIGRASI di 6 tab db_Hartek_* + kosongkan mightk_Peta
 *                             (wajib Script Property MIGHARTEK_IZINKAN_HAPUS=TRUE, sekali pakai).
 *
 * Pemetaan & Aturan:
 *  - Tim: db_Tim jenis HARTEK aktif (alias mightk_Alias jenis TIM, nama Sub-Tim/Tim v1, kode 2 digit, atau default tim
 *    HARTEK pertama bila hanya ada 1 tim HARTEK di v1).
 *  - Induk hilang (PG -> Header, Pekerjaan -> PG): dicari / dibuat otomatis di memori (INDUK_DIBUAT), sama pola ROW & P0.
 *  - Gardu ganda dalam 1 header (mis. 2 baris GRD pada gardu yang sama di v1): digabung ke PG pertama (DIGABUNG),
 *    pekerjaan di bawahnya otomatis ikut PG pertama sehingga aturan v2 (maks 1 GRD + 1 NTK per gardu per header) terjaga.
 *  - Master Pekerjaan (db_Jenis_Pekerjaan modul HARTEK) & Material (db_Material): dicocokkan lewat nama (+ alias mightk_Alias);
 *    bila belum ada di master, teks lama tetap disalin dengan PERINGATAN (tidak memblokir histori).
 */

var MIGHARTEK_OLEH_ = 'MIGRASI';
var MIGHARTEK_JENIS_ = ['header', 'pg', 'pekerjaan', 'material', 'grounding', 'pemerataan'];

var MIGHARTEK_TAB_V1_ = {
  header: ['db_Global_Header', 'db_Hartek_Header'],
  pg: ['db_Hartek_PenyulangGardu'],
  pekerjaan: ['db_Hartek_Pekerjaan'],
  material: ['db_Hartek_Material'],
  grounding: ['db_Hartek_HarGrounding', 'db_Hartek_Grounding'],
  pemerataan: ['db_Hartek_PemerataanBeban']
};

var MIGHARTEK_SHEET_V2_ = {
  header: 'db_Hartek_Header',
  pg: 'db_Hartek_PenyulangGardu',
  pekerjaan: 'db_Hartek_Pekerjaan',
  material: 'db_Hartek_Material',
  grounding: 'db_Hartek_Grounding',
  pemerataan: 'db_Hartek_PemerataanBeban'
};

var MIGHARTEK_ID_V2_ = {
  header: 'header_id',
  pg: 'pg_id',
  pekerjaan: 'pekerjaan_id',
  material: 'material_id',
  grounding: 'grounding_id',
  pemerataan: 'pemerataan_id'
};

var MIGHARTEK_KODE_V2_ = {
  header: 'kode_header',
  pg: 'kode_pg',
  pekerjaan: 'kode_pekerjaan',
  material: 'kode_material',
  grounding: 'kode_grounding',
  pemerataan: 'kode_pemerataan'
};

/** Posisi kolom 0-based sesuai COL_INS.HEADER & COL_HTK di Tek-Hartek-Code.js v1. */
var MIGHARTEK_KOL_ = {
  header: {
    kodeHeader: 1, ulp: 2, hari: 3, tanggal: 4, tim: 5, subTim: 6,
    koordinatAwal: 7, koordinatAkhir: 8, kmAwal: 9, kmAkhir: 10,
    kendala: 11, waText: 12, timestamp: 13, inputBy: 14, timestampUpdate: 15
  },
  pg: {
    kodeHeader: 1, kodePg: 2, ulp: 3, hari: 4, tanggal: 5,
    jenisPekerjaan: 6, penyulang: 7, section: 8, gardu: 9, daerah: 10,
    jumlahGawang: 11, textWa: 12, inputBy: 13, timestamp: 14
  },
  pekerjaan: {
    kodeHeader: 1, kodePg: 2, kodePekerjaan: 3, ulp: 4, hari: 5, tanggal: 6,
    jenisPekerjaan: 7, penyulang: 8, section: 9, gardu: 10, pekerjaan: 11,
    jumlahPekerjaan: 12, satuanPekerjaan: 13, textWaMaterial: 14, inputBy: 15, timestamp: 16
  },
  material: {
    kodeHeader: 1, kodePg: 2, kodePekerjaan: 3, kodeMaterial: 4, ulp: 5, hari: 6, tanggal: 7,
    jenisPekerjaan: 8, penyulang: 9, section: 10, gardu: 11, pekerjaan: 12,
    material: 13, jumlah: 14, satuan: 15, kepemilikan: 16, inputBy: 17, timestamp: 18
  },
  grounding: {
    kodeHeader: 1, kodePg: 2, kodePekerjaan: 3, kodeGrounding: 4,
    hari: 5, tanggal: 6, jenisPeralatan: 7, namaPeralatan: 8, penyulang: 9, section: 10,
    kondisiTanah: 11, hasilSebelum: 12, fotoSebelum: 13, linkFotoSebelum: 14,
    hasilSesudah: 15, fotoSesudah: 16, linkFotoSesudah: 17
  },
  pemerataan: {
    kodeHeader: 1, kodePg: 2, kodePekerjaan: 3, kodePemerataan: 4,
    hari: 5, tanggal: 6, penyulang: 7, section: 8, gardu: 9, alamat: 10,
    sebR: 11, fotoSebR: 12, linkSebR: 13,
    sebS: 14, fotoSebS: 15, linkSebS: 16,
    sebT: 17, fotoSebT: 18, linkSebT: 19,
    sesR: 20, fotoSesR: 21, linkSesR: 22,
    sesS: 23, fotoSesS: 24, linkSesS: 25,
    sesT: 26, fotoSesT: 27, linkSesT: 28
  }
};

var MIGHARTEK_KUNCI_ = {
  header: 'kodeHeader', pg: 'kodePg', pekerjaan: 'kodePekerjaan',
  material: 'kodeMaterial', grounding: 'kodeGrounding', pemerataan: 'kodePemerataan'
};

/** Cek judul kolom kunci (0-based): [indeks, potongan judul huruf kecil tanpa spasi/tanda]. */
var MIGHARTEK_JUDUL_ = {
  header: [[1, 'header'], [4, 'tanggal'], [5, 'tim']],
  pg: [[1, 'header'], [2, 'pg'], [6, 'jenis']],
  pekerjaan: [[2, 'pg'], [3, 'pekerjaan'], [11, 'pekerjaan']],
  material: [[3, 'pekerjaan'], [4, 'material'], [13, 'material']],
  grounding: [[3, 'pekerjaan'], [4, 'grounding'], [7, 'peralatan']],
  pemerataan: [[3, 'pekerjaan'], [4, 'pemerataan'], [11, 'r']]
};

var MIGHARTEK_CEK_KOLOM_ = ['jenis', 'kode_lama', 'kode_baru', 'status', 'alasan', 'saran', 'bulan', 'baris_sumber'];
var MIGHARTEK_RINGKAS_KOLOM_ = ['bulan', 'tim', 'header', 'pg_jaringan', 'pg_gardu', 'pg_nonteknik', 'gawang', 'pekerjaan', 'material', 'grounding', 'pemerataan', 'karantina'];
var MIGHARTEK_PETA_KOLOM_ = ['jenis', 'kode_lama', 'kode_baru', 'id_v2', 'keterangan'];
var MIGHARTEK_BATAS_MS_ = 270000;
var MIGHARTEK_BLOK_ = 2000;

// ---------------- baca sumber ----------------

function cariSheetMigHartek_(ss, daftarNama) {
  if (!ss) return null;
  for (var i = 0; i < daftarNama.length; i++) {
    var sh = ss.getSheetByName(daftarNama[i]);
    if (sh) return sh;
  }
  if (typeof ss.getSheets === 'function') {
    var semua = ss.getSheets();
    var target = daftarNama.map(function (x) { return normJudul_(x); });
    for (var j = 0; j < semua.length; j++) {
      var nm = typeof semua[j].getName === 'function' ? semua[j].getName() : String(semua[j].nama || '');
      if (target.indexOf(normJudul_(nm)) !== -1) return semua[j];
    }
  }
  return null;
}

/** Baca satu tab sumber v1 per posisi kolom (atau nama kolom bila sudah berupa tabel v2). */
function bacaTabMigHartek_(sh, jenis, sumberLabel) {
  var rg = sh.getDataRange(), v = rg.getValues(), t = typeof rg.getDisplayValues === 'function' ? rg.getDisplayValues() : v;
  var judul = (v[0] || []).map(function (h) { return teksMig_(h); });
  var kolKunci = MIGHARTEK_KOL_[jenis][MIGHARTEK_KUNCI_[jenis]];
  // Bila sumber adalah db_Hartek_Header v2 (tanpa kolom Sub-Tim di indeks 6), sesuaikan indeks pembacaan header
  var isHeaderV2 = jenis === 'header' && normJudul_(judul[5]) === 'tim' && normJudul_(judul[6]) === 'koordinatawal';
  var nmSh = typeof sh.getName === 'function' ? sh.getName() : String(sh.nama || jenis);
  var rows = [], tanpaKode = 0;
  for (var i = 1; i < v.length; i++) {
    var isi = false;
    for (var j = 1; j < v[i].length; j++) {
      if (v[i][j] !== '' && v[i][j] !== null && v[i][j] !== undefined) { isi = true; break; }
    }
    if (!isi) continue;
    var rowV = v[i].slice(), rowT = (t[i] || []).slice();
    if (isHeaderV2) {
      // Sisipkan subTim = tim pada indeks 6 agar sesuai posisi COL_INS.HEADER v1
      rowV.splice(6, 0, rowV[5]);
      rowT.splice(6, 0, rowT[5]);
    }
    if (jenis === 'header') {
      var timVal = teksMig_(rowV[5]).toLowerCase();
      var kodeVal = teksMig_(rowV[1]).toUpperCase();
      if (!isHeaderV2 && timVal !== 'hartek' && kodeVal.indexOf('HAR-') !== 0) continue;
    }
    if (!teksMig_(rowV[kolKunci])) { tanpaKode++; continue; }
    rows.push({ v: rowV, t: rowT, baris: i + 1, sumber: sumberLabel || nmSh });
  }
  var judulNorm = isHeaderV2 ? judul.slice(0, 6).concat(['Sub-Tim'], judul.slice(6)) : judul;
  return { judul: judulNorm, rows: rows, tanpaKode: tanpaKode, namaTab: nmSh };
}

/** Baca semua tab sumber Hartek v1 dari ssUtama (+ opsional ssArsip dan ssGrounding). */
function bacaSumberMigHartek_(ssUtama, ssArsip, ssGrounding) {
  var S = { judul: {}, tanpaKode: {}, tidakAda: [], tab: {} };
  MIGHARTEK_JENIS_.forEach(function (j) {
    var utama = (j === 'grounding' || j === 'pemerataan') && ssGrounding
      ? (cariSheetMigHartek_(ssGrounding, MIGHARTEK_TAB_V1_[j]) || cariSheetMigHartek_(ssUtama, MIGHARTEK_TAB_V1_[j]))
      : cariSheetMigHartek_(ssUtama, MIGHARTEK_TAB_V1_[j]);
    var arsip = ssArsip ? cariSheetMigHartek_(ssArsip, MIGHARTEK_TAB_V1_[j]) : null;
    if (!utama && !arsip) {
      if (j === 'header' || j === 'pg' || j === 'pekerjaan') {
        throw new SisiError_('SHEET_TIDAK_ADA', 'sumber: ' + MIGHARTEK_TAB_V1_[j][0]);
      }
      S.tidakAda.push(MIGHARTEK_TAB_V1_[j][0]);
      S[j] = [];
      return;
    }
    var rows = [], tanpa = 0, judul = [], namaTab = [];
    if (utama) {
      var tu = bacaTabMigHartek_(utama, j, 'AKTIF');
      rows = rows.concat(tu.rows); tanpa += tu.tanpaKode; judul = tu.judul; namaTab.push(tu.namaTab);
    }
    if (arsip && (!utama || arsip !== utama)) {
      var ta = bacaTabMigHartek_(arsip, j, 'ARSIP');
      rows = rows.concat(ta.rows); tanpa += ta.tanpaKode;
      if (!judul.length) judul = ta.judul;
      namaTab.push('ARSIP:' + ta.namaTab);
    }
    S[j] = rows; S.judul[j] = judul; S.tanpaKode[j] = tanpa; S.tab[j] = namaTab.join('+');
  });
  return S;
}

function cekJudulMigHartek_(S) {
  var salah = [];
  MIGHARTEK_JENIS_.forEach(function (j) {
    if (!S.judul || !S.judul[j] || !S.judul[j].length) return;
    MIGHARTEK_JUDUL_[j].forEach(function (c) {
      var h = S.judul[j][c[0]];
      if (normJudul_(h).indexOf(c[1]) === -1) {
        salah.push((S.tab && S.tab[j] || j) + ' ' + hurufKolomMigP0_(c[0]) + ' "' + teksMig_(h) + '" (harus memuat "' + c[1] + '")');
      }
    });
  });
  return salah;
}

// ---------------- helper sel & kode v1 ----------------

function teksSelMigHartek_(row, i) {
  if (!row || i === undefined || i === null || i < 0) return '';
  var x = row.v[i];
  return adalahDate_(x) ? teksMig_(row.t && row.t[i] !== undefined ? row.t[i] : '') : teksMig_(x);
}

function tglDariKodeHartekMig_(kode, kodeUlp) {
  var s = teksMig_(kode).toUpperCase();
  var m = /^HAR-(\d{5})(\d{2})(\d{2})(\d{2})(\d{3})/.exec(s);
  if (!m) return null;
  var iso = '20' + m[2] + '-' + m[3] + '-' + m[4];
  var dt = new Date(iso + 'T00:00:00Z');
  if (isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso) return null;
  return { kodeHeader: 'HAR-' + (kodeUlp || m[1]) + m[2] + m[3] + m[4] + m[5], kodeUlp: m[1], tanggal: iso, urut: parseInt(m[5], 10) };
}

function tglSelMigHartek_(row, i, kodeCadangan, kodeUlp) {
  var t = tglLama_(row.v[i]) || tglLama_(row.t && row.t[i]);
  if (t) return t;
  var p = tglDariKodeHartekMig_(kodeCadangan, kodeUlp);
  return p ? p.tanggal : '';
}

function waktuSelMigHartek_(row, i, tglFallback) {
  if (row && i !== undefined && i >= 0) {
    var ms = waktuLama_(row.v[i]) || waktuLama_(row.t && row.t[i]);
    if (ms > 0) return new Date(ms).toISOString();
  }
  return tglFallback ? tglFallback + 'T08:00:00.000Z' : sekarangIso_();
}

function angkaOhmMigHartek_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return isFinite(v) && v >= 0 && v <= 99999 ? v : '';
  var s = String(v).replace(/ohm|\u03A9/gi, '').replace(',', '.').trim();
  if (!s) return '';
  var m = /-?\d+(\.\d+)?/.exec(s);
  if (!m) return '';
  var n = Number(m[0]);
  return isFinite(n) && n >= 0 && n <= 99999 ? n : '';
}

function jenisPgMigHartek_(v, kodePg, noGardu) {
  var s = teksMig_(v).toLowerCase().replace(/\s+/g, ' ');
  if (s === 'jaringan') return 'Jaringan';
  if (s.indexOf('non') !== -1 && s.indexOf('teknik') !== -1) return 'Non - Teknik';
  if (s.indexOf('gardu') !== -1) return 'Gardu';
  var k = teksMig_(kodePg).toUpperCase();
  if (/-PNY\.\d+/.test(k)) return 'Jaringan';
  if (/-NTK\.\d+/.test(k)) return 'Non - Teknik';
  if (/-GRD\.\d+/.test(k)) return 'Gardu';
  return teksMig_(noGardu) ? 'Gardu' : 'Jaringan';
}

function idFotoMigHartek_(linkVal, pathVal) {
  return idDriveArsip_(linkVal) || driveIdDariUrl_(linkVal) || idDriveArsip_(pathVal) || driveIdDariUrl_(pathVal) || '';
}

// ---------------- peta master Hartek ----------------

function petaMasterMigHartek_(M) {
  var P = {
    tim: {}, timKode: {}, timList: [], defaultTim: null,
    penyulang: {}, daftarPenyulang: [],
    gardu: {},
    jenis: {}, jenisPerPg: {}, daftarJenis: [],
    material: {}, daftarMaterial: [],
    kepemilikan: {}, defaultKepemilikan: 'PLN',
    alias: {}
  };
  (M.alias || []).forEach(function (a) {
    var j = teksMig_(a.jenis).toUpperCase();
    if (!j || !teksMig_(a.nilai_lama) || !teksMig_(a.nilai_master)) return;
    P.alias[kunciAliasMigP0_(j, a.penyulang, a.nilai_lama)] = teksMig_(a.nilai_master);
  });
  (M.tim || []).forEach(function (t) {
    if (!t.tim_id || teksMig_(t.jenis).toUpperCase() !== 'HARTEK') return;
    if (t.aktif !== undefined && t.aktif !== '' && !isAktif_(t.aktif)) return;
    P.tim[normNama_(t.nama)] = t;
    if (teksMig_(t.kode)) P.timKode[pad2_(teksMig_(t.kode))] = t;
    P.timList.push(t);
  });
  P.defaultTim = P.timKode['01'] || P.timList[0] || null;

  (M.jaringan || []).forEach(function (r) {
    if (!r.section_id || (r.aktif !== undefined && r.aktif !== '' && !isAktif_(r.aktif))) return;
    var kp = normNama_(r.penyulang);
    var pen = P.penyulang[kp] || (P.penyulang[kp] = { nama: teksMig_(r.penyulang), section: {}, daftar: [] });
    if (!P.daftarPenyulang.some(function (x) { return normNama_(x) === kp; })) P.daftarPenyulang.push(teksMig_(r.penyulang));
    pen.section[normNama_(r.section)] = r;
    pen.daftar.push(teksMig_(r.section));
  });

  (M.gardu || []).forEach(function (g) {
    var no = parseNoGarduLama_(g['No Gardu'] || g.no_gardu);
    if (no && g.gardu_id) P.gardu[no.nomor] = g;
  });

  (M.jenis || []).forEach(function (r) {
    if (!r.jenis_id || teksMig_(r.modul).toUpperCase() !== 'HARTEK' || !teksMig_(r.nama)) return;
    var k = normNama_(r.nama);
    var jp = jenisMasterPgHartek_(r.jenis_pekerjaan) || '';
    if (jp) P.jenisPerPg[k + '|' + jp] = r;
    if (!P.jenis[k] || !jp) P.jenis[k] = r;
    if (P.daftarJenis.indexOf(teksMig_(r.nama)) === -1) P.daftarJenis.push(teksMig_(r.nama));
  });

  (M.material || []).forEach(function (m) {
    if (!m.material_id || !teksMig_(m.nama_material)) return;
    var k = normNama_(m.nama_material);
    if (!P.material[k]) P.material[k] = m;
    P.daftarMaterial.push(teksMig_(m.nama_material));
  });

  (M.kepemilikan || []).forEach(function (km) {
    var nm = teksMig_(km.kepemilikan || km.nama_kepemilikan || km.nama);
    if (nm) P.kepemilikan[normNama_(nm)] = nm;
  });
  return P;
}

function cariTimMigHartek_(P, subTim, tim, inputBy) {
  var kandidat = [subTim, tim, inputBy];
  for (var i = 0; i < kandidat.length; i++) {
    var v = teksMig_(kandidat[i]);
    if (!v) continue;
    var al = aliasMigP0_(P, 'TIM', '', v) || v;
    if (P.tim[normNama_(al)]) return P.tim[normNama_(al)];
    var m = /(\d{1,2})\s*$/.exec(al);
    if (m && P.timKode[pad2_(m[1])]) return P.timKode[pad2_(m[1])];
  }
  return P.defaultTim;
}

function lokasiJaringanMigHartek_(P, penyulang, section) {
  var pAsli = teksMig_(penyulang), sAsli = teksMig_(section);
  var out = { penyulang: pAsli, section: sAsli, masalah: [] };
  if (!pAsli) { out.masalah.push(['PENYULANG_KOSONG', '', '']); return out; }
  var pAl = aliasMigP0_(P, 'PENYULANG', '', pAsli) || pAsli;
  var pen = P.penyulang[normNama_(pAl)];
  if (!pen) {
    out.masalah.push(['PENYULANG_TIDAK_DIKENAL', pAsli, saranNama_(pAsli, P.daftarPenyulang)]);
    return out;
  }
  out.penyulang = pen.nama;
  if (!sAsli) { out.masalah.push(['SECTION_KOSONG', '', '']); return out; }
  var sAl = aliasMigP0_(P, 'SECTION', pen.nama, sAsli) || aliasMigP0_(P, 'SECTION', '', sAsli) || sAsli;
  var sec = pen.section[normNama_(sAl)];
  if (!sec) {
    // Coba pencocokan bagian depan seperti migrasi gardu ("A - B - C" vs "A - C")
    var depan = normNama_(sAl.split(/\s+-\s+/)[0]);
    var calon = Object.keys(pen.section).filter(function (k) { return k.split(/\s+-\s+/)[0] === depan; });
    if (calon.length === 1) sec = pen.section[calon[0]];
  }
  if (!sec) {
    out.masalah.push(['SECTION_TIDAK_DIKENAL', sAsli, saranNama_(sAsli, pen.daftar)]);
    return out;
  }
  out.section = teksMig_(sec.section);
  return out;
}

function cariJenisPekerjaanMigHartek_(P, namaLama, jenisPg) {
  var asli = teksMig_(namaLama);
  if (!asli) return { nama: '', jenisId: '', satuan: '', kolomGaspol: '', dikenal: false, saran: '' };
  var al = aliasMigP0_(P, 'PEKERJAAN', '', asli) || asli;
  // Normalisasi nama v1 "Pemerataan Beban Trafo" / "Pembagian Beban Trafo" -> "... Gardu" (v0.94.1)
  var norm = normNama_(al);
  var normGardu = norm.replace(/\btrafo\b/g, 'gardu');
  var cocok = P.jenisPerPg[norm + '|' + jenisPg] || P.jenisPerPg[normGardu + '|' + jenisPg] ||
    P.jenis[norm] || P.jenis[normGardu] || null;
  if (cocok) {
    var kg = kolomGaspolHartek_(cocok.kolom_gaspol) || klasifikasiGaspolHartek_(cocok.nama, jenisPg);
    return {
      nama: teksMig_(cocok.nama),
      jenisId: String(cocok.jenis_id),
      satuan: teksMig_(cocok.satuan),
      kolomGaspol: kg,
      dikenal: true,
      saran: ''
    };
  }
  return {
    nama: al,
    jenisId: '',
    satuan: '',
    kolomGaspol: klasifikasiGaspolHartek_(al, jenisPg),
    dikenal: false,
    saran: saranNama_(asli, P.daftarJenis)
  };
}

function cariMaterialMigHartek_(P, namaLama) {
  var asli = teksMig_(namaLama);
  if (!asli) return { nama: '', masterId: '', satuan: '', dikenal: false, saran: '' };
  var al = aliasMigP0_(P, 'MATERIAL', '', asli) || asli;
  var m = P.material[normNama_(al)];
  if (m) {
    return { nama: teksMig_(m.nama_material), masterId: String(m.material_id), satuan: teksMig_(m.satuan), dikenal: true, saran: '' };
  }
  return { nama: al, masterId: '', satuan: '', dikenal: false, saran: saranNama_(asli, P.daftarMaterial) };
}

// ---------------- analisis murni (bisa dites di Node) ----------------

/**
 * Analisis & susun rencana migrasi Hartek v1 -> v2 (fungsi murni tanpa layanan Apps Script).
 * S = hasil bacaSumberMigHartek_
 * M = { tim, jaringan, gardu, jenis, material, kepemilikan, alias, v2: { header, pg, pekerjaan, material, grounding, pemerataan } }
 * opsi = { dari, sampai, kodeUlp, ulpNama }
 */
function analisisMigrasiHartek_(S, M, opsi) {
  var P = petaMasterMigHartek_(M);
  var catatan = [], hitung = {}, perBulan = {}, peta = [];
  MIGHARTEK_JENIS_.forEach(function (j) {
    hitung[j] = { sumber: (S[j] || []).length, ganda: 0, dilewati: 0, digabung: 0, indukDibuat: 0, karantina: 0, ok: 0 };
  });
  var catat = function (jenis, kodeLama, kodeBaru, status, alasan, saran, bulan, baris) {
    catatan.push({
      jenis: jenis, kodeLama: kodeLama || '', kodeBaru: kodeBaru || '', status: status,
      alasan: alasan || '', saran: saran || '', bulan: bulan || '', baris: baris || ''
    });
  };
  var bulanan = function (bulan, timNama) {
    var k = (bulan || '-') + '|' + (timNama || 'HARTEK');
    return perBulan[k] || (perBulan[k] = {
      header: 0, pgJaringan: 0, pgGardu: 0, pgNonTeknik: 0, gawang: 0,
      pekerjaan: 0, material: 0, grounding: 0, pemerataan: 0, karantina: 0
    });
  };
  var dalam = function (tgl) { return !!tgl && tgl >= opsi.dari && tgl <= opsi.sampai; };
  var milikUlp = function (ulpSel, kode) {
    var u = teksMig_(ulpSel).toLowerCase();
    if (u && u !== 'toboali' && u !== 'ulp toboali' && u !== String(opsi.ulpNama || '').toLowerCase() && u !== String(opsi.kodeUlp || '')) return false;
    var pk = tglDariKodeHartekMig_(kode, opsi.kodeUlp);
    if (pk && pk.kodeUlp !== opsi.kodeUlp) return false;
    return true;
  };

  // Cek data v2 asli (bukan MIGRASI) agar tidak bentrok
  var v2 = M.v2 || {}, bentrokKode = {}, headerSlotV2 = {};
  MIGHARTEK_JENIS_.forEach(function (j) {
    bentrokKode[j] = {};
    (v2[j] || []).forEach(function (r) {
      if (String(r.dibuat_oleh) === MIGHARTEK_OLEH_) return;
      var kd = teksMig_(r[MIGHARTEK_KODE_V2_[j]]);
      if (kd) bentrokKode[j][kd] = true;
      if (j === 'header' && r.status === 'AKTIF') {
        headerSlotV2[String(r.tim_id) + '|' + tglHartek_(r)] = r;
      }
    });
  });

  // Dedup per kode di setiap tab (aktif + arsip)
  var pilih = {};
  MIGHARTEK_JENIS_.forEach(function (j) {
    var kolIdx = MIGHARTEK_KOL_[j][MIGHARTEK_KUNCI_[j]];
    pilih[j] = dedupMigP0_(S[j] || [], kolIdx, function (kode, l, dipakai) {
      hitung[j].ganda += l.length - 1;
      catat(j, kode, kode, 'PERINGATAN', 'KODE_GANDA (' + l.length + ' baris, dipakai baris ' + dipakai.baris + ')', '', '', dipakai.baris);
    });
  });

  // Hitung jumlah PG per Kode Header untuk memilih header utama bila ada header ganda di hari/tim yang sama
  var nPgPerHeader = {};
  pilih.pg.forEach(function (x) {
    var kh = teksSelMigHartek_(x.row, MIGHARTEK_KOL_.pg.kodeHeader);
    if (kh) nPgPerHeader[kh] = (nPgPerHeader[kh] || 0) + 1;
  });

  // ---- 1. HEADER ----
  var Kh = MIGHARTEK_KOL_.header;
  var grupHeader = {}, petaHeader = {}, headerKodeSumber = {}, headerV2 = [];
  pilih.header.forEach(function (x) {
    var row = x.row, kode = x.kode;
    headerKodeSumber[kode] = true;
    if (!milikUlp(teksSelMigHartek_(row, Kh.ulp), kode)) { hitung.header.dilewati++; return; }
    var tgl = tglSelMigHartek_(row, Kh.tanggal, kode, opsi.kodeUlp);
    if (!tgl) {
      hitung.header.karantina++;
      catat('header', kode, '', 'KARANTINA', 'TANGGAL_TIDAK_VALID', '', '', row.baris);
      return;
    }
    if (!dalam(tgl)) { hitung.header.dilewati++; return; }
    var bulan = tgl.slice(0, 7);
    var tim = cariTimMigHartek_(P, teksSelMigHartek_(row, Kh.subTim), teksSelMigHartek_(row, Kh.tim), teksSelMigHartek_(row, Kh.inputBy));
    if (!tim) {
      hitung.header.karantina++; bulanan(bulan, '-').karantina++;
      catat('header', kode, '', 'KARANTINA', 'TIM_HARTEK_TIDAK_ADA (tambahkan tim jenis HARTEK di db_Tim)', '', bulan, row.baris);
      return;
    }
    if (bentrokKode.header[kode] || headerSlotV2[String(tim.tim_id) + '|' + tgl]) {
      hitung.header.karantina++; bulanan(bulan, tim.nama).karantina++;
      catat('header', kode, '', 'KARANTINA', 'BENTROK_V2 (header tim ' + tim.nama + ' tanggal ' + tgl + ' sudah dibuat di app v2)', '', bulan, row.baris);
      return;
    }
    var kunciSlot = String(tim.tim_id) + '|' + tgl;
    (grupHeader[kunciSlot] = grupHeader[kunciSlot] || []).push({
      kodeLama: kode, tgl: tgl, bulan: bulan, tim: tim, row: row,
      nPg: nPgPerHeader[kode] || 0, ts: waktuLama_(row.v[Kh.timestamp])
    });
  });

  Object.keys(grupHeader).sort().forEach(function (kunciSlot) {
    var anggota = grupHeader[kunciSlot].sort(function (a, b) { return (b.nPg - a.nPg) || (a.ts - b.ts) || (a.row.baris - b.row.baris); });
    var utama = anggota[0];
    var pk = tglDariKodeHartekMig_(utama.kodeLama, opsi.kodeUlp);
    var kodeBaru = pk && pk.tanggal === utama.tgl && pk.kodeUlp === opsi.kodeUlp
      ? utama.kodeLama
      : ('HAR-' + opsi.kodeUlp + utama.tgl.slice(2, 4) + utama.tgl.slice(5, 7) + utama.tgl.slice(8, 10) + '001');
    var ambilSel = function (idx) {
      for (var i = 0; i < anggota.length; i++) {
        var v = teksSelMigHartek_(anggota[i].row, idx);
        if (v) return v;
      }
      return '';
    };
    var kAwal = koordinatMig_(ambilSel(Kh.koordinatAwal)), kAkhir = koordinatMig_(ambilSel(Kh.koordinatAkhir));
    if ((kAwal.ada && !kAwal.ok) || (kAkhir.ada && !kAkhir.ok)) {
      catat('header', utama.kodeLama, kodeBaru, 'PERINGATAN', 'KOORDINAT_HEADER_TIDAK_VALID (dikosongkan)', '', utama.bulan, utama.row.baris);
    }
    var kmAwal = angkaLama_(ambilSel(Kh.kmAwal)), kmAkhir = angkaLama_(ambilSel(Kh.kmAkhir));
    var tsIso = waktuSelMigHartek_(utama.row, Kh.timestamp, utama.tgl);
    var tsUpdIso = waktuSelMigHartek_(utama.row, Kh.timestampUpdate, utama.tgl);
    var idV2 = uuidMig_('HARTEK_HEADER', kodeBaru + '|' + utama.tim.tim_id);
    var objH = {
      kode_header: kodeBaru, ulp: opsi.ulpNama || 'Toboali', hari: hariTanggalHartek_(utama.tgl), tanggal: utama.tgl,
      tim: String(utama.tim.nama),
      koordinat_awal: kAwal.ok ? kAwal.nilai.teks : '', koordinat_akhir: kAkhir.ok ? kAkhir.nilai.teks : '',
      km_awal: kmAwal === null ? '' : kmAwal, km_akhir: kmAkhir === null ? '' : kmAkhir,
      kendala: ambilSel(Kh.kendala), wa_text: ambilSel(Kh.waText),
      timestamp: tsIso, input_by: ambilSel(Kh.inputBy) || String(utama.tim.nama), timestamp_update: tsUpdIso,
      header_id: idV2, tim_id: String(utama.tim.tim_id), status: 'AKTIF', revision: 1,
      dibuat_oleh: MIGHARTEK_OLEH_, waktu_perangkat: '', diubah_oleh: MIGHARTEK_OLEH_
    };
    var nodeH = {
      id: idV2, kode: kodeBaru, tgl: utama.tgl, bulan: utama.bulan, tim: utama.tim, o: objH,
      garduSlot: {}, urutPg: { PNY: 0, GRD: 0, NTK: 0 }, pgDipakai: {}
    };
    anggota.forEach(function (a, idx) {
      petaHeader[a.kodeLama] = nodeH;
      peta.push({ jenis: 'header', kode_lama: a.kodeLama, kode_baru: kodeBaru, id_v2: idV2, keterangan: idx > 0 ? 'DIGABUNG' : '' });
      if (idx > 0) {
        hitung.header.digabung++;
        catat('header', a.kodeLama, kodeBaru, 'DIGABUNG', 'HEADER_GANDA (' + utama.tim.nama + ' ' + utama.tgl + ')', '', utama.bulan, a.row.baris);
      }
    });
    headerV2.push(nodeH);
    petaHeader[kodeBaru] = nodeH;
    petaHeader[kunciSlot] = nodeH;
    hitung.header.ok++;
    bulanan(utama.bulan, utama.tim.nama).header++;
  });

  var cariAtauBuatHeader = function (kodeHeaderLama, kodeAnak, rowAnak, idxTgl, idxInputBy, labelAsal) {
    if (kodeHeaderLama && petaHeader[kodeHeaderLama]) return { h: petaHeader[kodeHeaderLama] };
    var tgl = tglSelMigHartek_(rowAnak, idxTgl, kodeHeaderLama || kodeAnak, opsi.kodeUlp);
    if (!tgl) return { karantina: 'TANGGAL_INDUK_TIDAK_TERBACA' };
    if (!dalam(tgl)) return { luar: true };
    if (kodeHeaderLama && headerKodeSumber[kodeHeaderLama]) {
      return { karantina: 'INDUK_HEADER_TIDAK_LOLOS (' + kodeHeaderLama + ')' };
    }
    var tim = cariTimMigHartek_(P, '', '', teksSelMigHartek_(rowAnak, idxInputBy));
    if (!tim) return { karantina: 'TIM_HARTEK_TIDAK_ADA' };
    var kunciSlot = String(tim.tim_id) + '|' + tgl;
    if (petaHeader[kunciSlot]) return { h: petaHeader[kunciSlot], catatan: 'INDUK_DARI_TIM_TANGGAL' };
    if (headerSlotV2[kunciSlot]) return { karantina: 'BENTROK_V2 (header ' + tgl + ' sudah ada di v2)' };
    var pk = tglDariKodeHartekMig_(kodeHeaderLama || kodeAnak, opsi.kodeUlp);
    var kodeBaru = pk && pk.tanggal === tgl && pk.kodeUlp === opsi.kodeUlp
      ? pk.kodeHeader
      : ('HAR-' + opsi.kodeUlp + tgl.slice(2, 4) + tgl.slice(5, 7) + tgl.slice(8, 10) + '001');
    var bulan = tgl.slice(0, 7);
    var idV2 = uuidMig_('HARTEK_HEADER', kodeBaru + '|' + tim.tim_id);
    var tsIso = waktuSelMigHartek_(rowAnak, -1, tgl);
    var objH = {
      kode_header: kodeBaru, ulp: opsi.ulpNama || 'Toboali', hari: hariTanggalHartek_(tgl), tanggal: tgl,
      tim: String(tim.nama), koordinat_awal: '', koordinat_akhir: '', km_awal: '', km_akhir: '',
      kendala: '', wa_text: '', timestamp: tsIso, input_by: teksSelMigHartek_(rowAnak, idxInputBy) || String(tim.nama),
      timestamp_update: tsIso, header_id: idV2, tim_id: String(tim.tim_id), status: 'AKTIF', revision: 1,
      dibuat_oleh: MIGHARTEK_OLEH_, waktu_perangkat: '', diubah_oleh: MIGHARTEK_OLEH_
    };
    var nodeH = {
      id: idV2, kode: kodeBaru, tgl: tgl, bulan: bulan, tim: tim, o: objH,
      garduSlot: {}, urutPg: { PNY: 0, GRD: 0, NTK: 0 }, pgDipakai: {}
    };
    if (kodeHeaderLama) petaHeader[kodeHeaderLama] = nodeH;
    petaHeader[kodeBaru] = nodeH;
    petaHeader[kunciSlot] = nodeH;
    headerV2.push(nodeH);
    peta.push({ jenis: 'header', kode_lama: kodeHeaderLama || '', kode_baru: kodeBaru, id_v2: idV2, keterangan: 'INDUK_DIBUAT' });
    hitung.header.indukDibuat++; hitung.header.ok++;
    bulanan(bulan, tim.nama).header++;
    catat('header', kodeHeaderLama || '', kodeBaru, 'INDUK_DIBUAT', 'HEADER_DIBUAT dari ' + labelAsal, '', bulan, rowAnak.baris);
    return { h: nodeH };
  };

  // ---- 2. PENYULANG / GARDU (PG) ----
  var Kpg = MIGHARTEK_KOL_.pg;
  var petaPg = {}, pgKodeSumber = {}, pgV2 = [];

  var alokasiKodePg = function (nodeH, tag, kodeLama) {
    var m = new RegExp('^' + nodeH.kode.replace(/[-.]/g, '\\$&') + '-' + tag + '\\.(\\d{3,})$').exec(teksMig_(kodeLama));
    if (m && !nodeH.pgDipakai[tag + '|' + parseInt(m[1], 10)]) {
      var n = parseInt(m[1], 10);
      nodeH.pgDipakai[tag + '|' + n] = true;
      if (n > nodeH.urutPg[tag]) nodeH.urutPg[tag] = n;
      return nodeH.kode + '-' + tag + '.' + pad3_(n);
    }
    do { nodeH.urutPg[tag]++; } while (nodeH.pgDipakai[tag + '|' + nodeH.urutPg[tag]]);
    nodeH.pgDipakai[tag + '|' + nodeH.urutPg[tag]] = true;
    return nodeH.kode + '-' + tag + '.' + pad3_(nodeH.urutPg[tag]);
  };

  pilih.pg.forEach(function (x) {
    var row = x.row, kodeLama = x.kode;
    pgKodeSumber[kodeLama] = true;
    var khLama = teksSelMigHartek_(row, Kpg.kodeHeader) || (tglDariKodeHartekMig_(kodeLama, opsi.kodeUlp) || {}).kodeHeader || '';
    if (!milikUlp(teksSelMigHartek_(row, Kpg.ulp), khLama || kodeLama)) { hitung.pg.dilewati++; return; }
    var ch = cariAtauBuatHeader(khLama, kodeLama, row, Kpg.tanggal, Kpg.inputBy, 'PG ' + kodeLama);
    if (ch.luar) { hitung.pg.dilewati++; return; }
    if (ch.karantina) {
      hitung.pg.karantina++;
      catat('pg', kodeLama, '', 'KARANTINA', ch.karantina, '', '', row.baris);
      return;
    }
    var h = ch.h;
    if (bentrokKode.pg[kodeLama]) {
      hitung.pg.karantina++; bulanan(h.bulan, h.tim.nama).karantina++;
      catat('pg', kodeLama, '', 'KARANTINA', 'BENTROK_V2 (kode PG sudah ada di v2)', '', h.bulan, row.baris);
      return;
    }
    var noGarduRaw = teksSelMigHartek_(row, Kpg.gardu);
    var jenisPg = jenisPgMigHartek_(teksSelMigHartek_(row, Kpg.jenisPekerjaan), kodeLama, noGarduRaw);
    var tag = tagObjekHartek_(jenisPg);
    var peny = teksSelMigHartek_(row, Kpg.penyulang), sec = teksSelMigHartek_(row, Kpg.section);
    var daerah = teksSelMigHartek_(row, Kpg.daerah), noGardu = '', garduId = '', koor = '';
    var gawangVal = angkaLama_(row.v[Kpg.jumlahGawang]);

    if (tag === 'PNY') {
      var lok = lokasiJaringanMigHartek_(P, peny, sec);
      peny = lok.penyulang; sec = lok.section;
      lok.masalah.forEach(function (ms) {
        catat('pg', kodeLama, '', 'PERINGATAN', ms[0] + (ms[1] ? ' (' + ms[1] + ')' : ''), ms[2] || '', h.bulan, row.baris);
      });
    } else {
      var parsedNo = parseNoGarduLama_(noGarduRaw);
      noGardu = parsedNo ? parsedNo.nomor : noGarduRaw.toUpperCase();
      var gMaster = noGardu ? P.gardu[noGardu] : null;
      if (gMaster) {
        garduId = String(gMaster.gardu_id || '');
        peny = peny || teksMig_(gMaster.Penyulang);
        sec = sec || teksMig_(gMaster.Section);
        daerah = daerah || teksMig_(gMaster.Alamat);
        koor = koordinatGarduHartek_(gMaster);
      } else if (noGardu) {
        catat('pg', kodeLama, '', 'PERINGATAN', 'GARDU_TIDAK_DIKENAL (' + noGardu + ')', '', h.bulan, row.baris);
      } else {
        catat('pg', kodeLama, '', 'PERINGATAN', 'NO_GARDU_KOSONG (' + jenisPg + ')', '', h.bulan, row.baris);
      }
      // Aturan v2: satu gardu dalam satu header maks 1 GRD dan 1 NTK. Bila v1 punya duplikat jenis yang sama, gabung ke PG pertama.
      if (noGardu) {
        var kunciGardu = tag + '|' + noGardu;
        if (h.garduSlot[kunciGardu]) {
          var pgUtama = h.garduSlot[kunciGardu];
          petaPg[kodeLama] = pgUtama;
          peta.push({ jenis: 'pg', kode_lama: kodeLama, kode_baru: pgUtama.kode, id_v2: pgUtama.id, keterangan: 'DIGABUNG' });
          hitung.pg.digabung++;
          catat('pg', kodeLama, pgUtama.kode, 'DIGABUNG', 'GARDU_GANDA_SEJENIS (' + noGardu + ' ' + tag + ')', '', h.bulan, row.baris);
          return;
        }
      }
    }

    var kodeBaru = alokasiKodePg(h, tag, kodeLama);
    var idV2 = uuidMig_('HARTEK_PG', kodeBaru);
    var tsIso = waktuSelMigHartek_(row, Kpg.timestamp, h.tgl);
    var objPg = {
      kode_header: h.kode, kode_pg: kodeBaru, tanggal: h.tgl, hari: h.o.hari, ulp: h.o.ulp,
      jenis_pekerjaan: jenisPg, penyulang: peny, section: sec, no_gardu: noGardu, daerah: daerah,
      jumlah_gawang: tag === 'PNY' ? (gawangVal === null ? 0 : Math.max(0, Math.round(gawangVal))) : '',
      koordinat: koor, header_id: h.id, pg_id: idV2, gardu_id: garduId, tim_id: String(h.tim.tim_id),
      dibuat_oleh: MIGHARTEK_OLEH_, diubah_oleh: MIGHARTEK_OLEH_, timestamp: tsIso, timestamp_update: tsIso, revision: 1
    };
    var nodePg = { id: idV2, kode: kodeBaru, kodeLama: kodeLama, h: h, o: objPg, urutPkj: 0, pkjDipakai: {} };
    if (tag !== 'PNY' && noGardu) h.garduSlot[tag + '|' + noGardu] = nodePg;
    petaPg[kodeLama] = nodePg;
    petaPg[kodeBaru] = nodePg;
    pgV2.push(nodePg);
    peta.push({ jenis: 'pg', kode_lama: kodeLama, kode_baru: kodeBaru, id_v2: idV2, keterangan: kodeBaru !== kodeLama ? 'KODE_BARU' : '' });
    hitung.pg.ok++;
    var b = bulanan(h.bulan, h.tim.nama);
    if (jenisPg === 'Jaringan') { b.pgJaringan++; b.gawang += Number(objPg.jumlah_gawang) || 0; }
    else if (jenisPg === 'Gardu') b.pgGardu++;
    else b.pgNonTeknik++;
  });

  var cariAtauBuatPg = function (kodePgLama, kodeHeaderLama, kodeAnak, rowAnak, idxTgl, idxInputBy, idxJenis, idxPeny, idxSec, idxGardu) {
    if (kodePgLama && petaPg[kodePgLama]) return { pg: petaPg[kodePgLama] };
    if (kodePgLama && pgKodeSumber[kodePgLama]) return { karantina: 'INDUK_PG_TIDAK_LOLOS (' + kodePgLama + ')' };
    var kh = kodeHeaderLama || (tglDariKodeHartekMig_(kodePgLama || kodeAnak, opsi.kodeUlp) || {}).kodeHeader || '';
    var ch = cariAtauBuatHeader(kh, kodePgLama || kodeAnak, rowAnak, idxTgl, idxInputBy, 'Pekerjaan ' + kodeAnak);
    if (ch.luar) return { luar: true };
    if (ch.karantina) return { karantina: ch.karantina };
    var h = ch.h;
    var noGarduRaw = teksSelMigHartek_(rowAnak, idxGardu);
    var jenisPg = jenisPgMigHartek_(teksSelMigHartek_(rowAnak, idxJenis), kodePgLama || kodeAnak, noGarduRaw);
    var tag = tagObjekHartek_(jenisPg);
    var parsedNo = parseNoGarduLama_(noGarduRaw);
    var noGardu = tag === 'PNY' ? '' : (parsedNo ? parsedNo.nomor : noGarduRaw.toUpperCase());
    if (tag !== 'PNY' && noGardu && h.garduSlot[tag + '|' + noGardu]) {
      var adaPg = h.garduSlot[tag + '|' + noGardu];
      if (kodePgLama) petaPg[kodePgLama] = adaPg;
      return { pg: adaPg };
    }
    var peny = teksSelMigHartek_(rowAnak, idxPeny), sec = teksSelMigHartek_(rowAnak, idxSec), daerah = '', garduId = '', koor = '';
    if (tag === 'PNY') {
      var lok = lokasiJaringanMigHartek_(P, peny, sec);
      peny = lok.penyulang; sec = lok.section;
    } else if (noGardu && P.gardu[noGardu]) {
      var gm = P.gardu[noGardu];
      garduId = String(gm.gardu_id || '');
      peny = peny || teksMig_(gm.Penyulang);
      sec = sec || teksMig_(gm.Section);
      daerah = teksMig_(gm.Alamat);
      koor = koordinatGarduHartek_(gm);
    }
    var kodeBaru = alokasiKodePg(h, tag, kodePgLama);
    var idV2 = uuidMig_('HARTEK_PG', kodeBaru);
    var tsIso = waktuSelMigHartek_(rowAnak, -1, h.tgl);
    var objPg = {
      kode_header: h.kode, kode_pg: kodeBaru, tanggal: h.tgl, hari: h.o.hari, ulp: h.o.ulp,
      jenis_pekerjaan: jenisPg, penyulang: peny, section: sec, no_gardu: noGardu, daerah: daerah,
      jumlah_gawang: tag === 'PNY' ? 0 : '', koordinat: koor, header_id: h.id, pg_id: idV2,
      gardu_id: garduId, tim_id: String(h.tim.tim_id), dibuat_oleh: MIGHARTEK_OLEH_, diubah_oleh: MIGHARTEK_OLEH_,
      timestamp: tsIso, timestamp_update: tsIso, revision: 1
    };
    var nodePg = { id: idV2, kode: kodeBaru, kodeLama: kodePgLama || '', h: h, o: objPg, urutPkj: 0, pkjDipakai: {} };
    if (tag !== 'PNY' && noGardu) h.garduSlot[tag + '|' + noGardu] = nodePg;
    if (kodePgLama) petaPg[kodePgLama] = nodePg;
    petaPg[kodeBaru] = nodePg;
    pgV2.push(nodePg);
    peta.push({ jenis: 'pg', kode_lama: kodePgLama || '', kode_baru: kodeBaru, id_v2: idV2, keterangan: 'INDUK_DIBUAT' });
    hitung.pg.indukDibuat++; hitung.pg.ok++;
    var b = bulanan(h.bulan, h.tim.nama);
    if (jenisPg === 'Jaringan') b.pgJaringan++; else if (jenisPg === 'Gardu') b.pgGardu++; else b.pgNonTeknik++;
    catat('pg', kodePgLama || '', kodeBaru, 'INDUK_DIBUAT', 'PG_DIBUAT dari Pekerjaan ' + kodeAnak, '', h.bulan, rowAnak.baris);
    return { pg: nodePg };
  };

  // ---- 3. PEKERJAAN ----
  var Kpk = MIGHARTEK_KOL_.pekerjaan;
  var petaPkj = {}, pkjKodeSumber = {}, pkjV2 = [];

  var alokasiKodePkj = function (nodePg, kodeLama) {
    var m = new RegExp('^' + nodePg.kode.replace(/[-.]/g, '\\$&') + '-PKJ\\.(\\d{3,})$').exec(teksMig_(kodeLama));
    if (m && !nodePg.pkjDipakai[parseInt(m[1], 10)]) {
      var n = parseInt(m[1], 10);
      nodePg.pkjDipakai[n] = true;
      if (n > nodePg.urutPkj) nodePg.urutPkj = n;
      return nodePg.kode + '-PKJ.' + pad3_(n);
    }
    do { nodePg.urutPkj++; } while (nodePg.pkjDipakai[nodePg.urutPkj]);
    nodePg.pkjDipakai[nodePg.urutPkj] = true;
    return nodePg.kode + '-PKJ.' + pad3_(nodePg.urutPkj);
  };

  pilih.pekerjaan.forEach(function (x) {
    var row = x.row, kodeLama = x.kode;
    pkjKodeSumber[kodeLama] = true;
    var kpgLama = teksSelMigHartek_(row, Kpk.kodePg) || kodeLama.replace(/-PKJ\.\d+$/i, '');
    var khLama = teksSelMigHartek_(row, Kpk.kodeHeader) || (tglDariKodeHartekMig_(kodeLama, opsi.kodeUlp) || {}).kodeHeader || '';
    if (!milikUlp(teksSelMigHartek_(row, Kpk.ulp), khLama || kodeLama)) { hitung.pekerjaan.dilewati++; return; }
    var cp = cariAtauBuatPg(kpgLama, khLama, kodeLama, row, Kpk.tanggal, Kpk.inputBy, Kpk.jenisPekerjaan, Kpk.penyulang, Kpk.section, Kpk.gardu);
    if (cp.luar) { hitung.pekerjaan.dilewati++; return; }
    if (cp.karantina) {
      hitung.pekerjaan.karantina++;
      catat('pekerjaan', kodeLama, '', 'KARANTINA', cp.karantina, '', '', row.baris);
      return;
    }
    var pg = cp.pg, h = pg.h;
    if (bentrokKode.pekerjaan[kodeLama]) {
      hitung.pekerjaan.karantina++; bulanan(h.bulan, h.tim.nama).karantina++;
      catat('pekerjaan', kodeLama, '', 'KARANTINA', 'BENTROK_V2 (kode pekerjaan sudah ada di v2)', '', h.bulan, row.baris);
      return;
    }
    var namaPkjLama = teksSelMigHartek_(row, Kpk.pekerjaan);
    if (!namaPkjLama) {
      hitung.pekerjaan.karantina++; bulanan(h.bulan, h.tim.nama).karantina++;
      catat('pekerjaan', kodeLama, '', 'KARANTINA', 'PEKERJAAN_KOSONG', '', h.bulan, row.baris);
      return;
    }
    var jpMaster = cariJenisPekerjaanMigHartek_(P, namaPkjLama, pg.o.jenis_pekerjaan);
    if (!jpMaster.dikenal) {
      catat('pekerjaan', kodeLama, '', 'PERINGATAN', 'PEKERJAAN_BELUM_DI_MASTER (' + namaPkjLama + ')', jpMaster.saran, h.bulan, row.baris);
    }
    var jmlVal = angkaLama_(row.v[Kpk.jumlahPekerjaan]);
    var satuan = jpMaster.satuan || teksSelMigHartek_(row, Kpk.satuanPekerjaan);
    var kodeBaru = alokasiKodePkj(pg, kodeLama);
    var idV2 = uuidMig_('HARTEK_PEKERJAAN', kodeBaru);
    var tsIso = waktuSelMigHartek_(row, Kpk.timestamp, h.tgl);
    var objPkj = {
      kode_header: h.kode, kode_pg: pg.kode, kode_pekerjaan: kodeBaru, tanggal: h.tgl, hari: h.o.hari, ulp: h.o.ulp,
      jenis_pekerjaan: pg.o.jenis_pekerjaan, penyulang: pg.o.penyulang, section: pg.o.section, no_gardu: pg.o.no_gardu,
      pekerjaan: jpMaster.nama, jumlah_pekerjaan: jmlVal === null ? 1 : jmlVal, satuan_pekerjaan: satuan,
      kolom_gaspol: jpMaster.kolomGaspol, pekerjaan_id: idV2, jenis_id: jpMaster.jenisId, pg_id: pg.id, header_id: h.id,
      tim_id: String(h.tim.tim_id), dibuat_oleh: MIGHARTEK_OLEH_, diubah_oleh: MIGHARTEK_OLEH_,
      timestamp: tsIso, timestamp_update: tsIso, revision: 1
    };
    var nodePkj = { id: idV2, kode: kodeBaru, kodeLama: kodeLama, pg: pg, h: h, o: objPkj, urutAnak: { MAT: 0, GND: 0, PMR: 0 }, anakDipakai: {} };
    petaPkj[kodeLama] = nodePkj;
    petaPkj[kodeBaru] = nodePkj;
    pkjV2.push(nodePkj);
    peta.push({ jenis: 'pekerjaan', kode_lama: kodeLama, kode_baru: kodeBaru, id_v2: idV2, keterangan: kodeBaru !== kodeLama ? 'KODE_BARU' : '' });
    hitung.pekerjaan.ok++;
    bulanan(h.bulan, h.tim.nama).pekerjaan++;
  });

  var alokasiKodeAnakPkj = function (nodePkj, tag, kodeLama) {
    var m = new RegExp('^' + nodePkj.kode.replace(/[-.]/g, '\\$&') + '-' + tag + '\\.(\\d{3,})$').exec(teksMig_(kodeLama));
    if (m && !nodePkj.anakDipakai[tag + '|' + parseInt(m[1], 10)]) {
      var n = parseInt(m[1], 10);
      nodePkj.anakDipakai[tag + '|' + n] = true;
      if (n > nodePkj.urutAnak[tag]) nodePkj.urutAnak[tag] = n;
      return nodePkj.kode + '-' + tag + '.' + pad3_(n);
    }
    do { nodePkj.urutAnak[tag]++; } while (nodePkj.anakDipakai[tag + '|' + nodePkj.urutAnak[tag]]);
    nodePkj.anakDipakai[tag + '|' + nodePkj.urutAnak[tag]] = true;
    return nodePkj.kode + '-' + tag + '.' + pad3_(nodePkj.urutAnak[tag]);
  };

  // ---- 4. MATERIAL ----
  var Kmt = MIGHARTEK_KOL_.material;
  var matV2 = [];
  pilih.material.forEach(function (x) {
    var row = x.row, kodeLama = x.kode;
    var kpkLama = teksSelMigHartek_(row, Kmt.kodePekerjaan) || kodeLama.replace(/-MAT\.\d+$/i, '');
    var pkj = petaPkj[kpkLama];
    if (!pkj) {
      var tglM = tglSelMigHartek_(row, Kmt.tanggal, kodeLama, opsi.kodeUlp);
      if (tglM && !dalam(tglM)) { hitung.material.dilewati++; return; }
      hitung.material.karantina++;
      catat('material', kodeLama, '', 'KARANTINA', pkjKodeSumber[kpkLama] ? 'INDUK_PEKERJAAN_TIDAK_LOLOS (' + kpkLama + ')' : 'INDUK_PEKERJAAN_TIDAK_ADA (' + kpkLama + ')', '', tglM ? tglM.slice(0, 7) : '', row.baris);
      return;
    }
    var h = pkj.h;
    if (bentrokKode.material[kodeLama]) {
      hitung.material.karantina++; bulanan(h.bulan, h.tim.nama).karantina++;
      catat('material', kodeLama, '', 'KARANTINA', 'BENTROK_V2', '', h.bulan, row.baris);
      return;
    }
    var namaMatLama = teksSelMigHartek_(row, Kmt.material);
    if (!namaMatLama) {
      hitung.material.karantina++; bulanan(h.bulan, h.tim.nama).karantina++;
      catat('material', kodeLama, '', 'KARANTINA', 'MATERIAL_KOSONG', '', h.bulan, row.baris);
      return;
    }
    var matMaster = cariMaterialMigHartek_(P, namaMatLama);
    if (!matMaster.dikenal) {
      catat('material', kodeLama, '', 'PERINGATAN', 'MATERIAL_BELUM_DI_MASTER (' + namaMatLama + ')', matMaster.saran, h.bulan, row.baris);
    }
    var jmlVal = angkaLama_(row.v[Kmt.jumlah]);
    var satuan = matMaster.satuan || teksSelMigHartek_(row, Kmt.satuan);
    var kepRaw = teksSelMigHartek_(row, Kmt.kepemilikan);
    var kep = P.kepemilikan[normNama_(kepRaw)] || kepRaw || P.defaultKepemilikan;
    var kodeBaru = alokasiKodeAnakPkj(pkj, 'MAT', kodeLama);
    var idV2 = uuidMig_('HARTEK_MATERIAL', kodeBaru);
    var tsIso = waktuSelMigHartek_(row, Kmt.timestamp, h.tgl);
    var objMat = {
      kode_header: h.kode, kode_pekerjaan: pkj.kode, kode_material: kodeBaru, tanggal: h.tgl,
      material: matMaster.nama, jumlah: jmlVal === null ? 1 : jmlVal, satuan: satuan, kepemilikan: kep,
      material_id: idV2, master_material_id: matMaster.masterId, pekerjaan_id: pkj.id, pg_id: pkj.pg.id,
      header_id: h.id, tim_id: String(h.tim.tim_id), dibuat_oleh: MIGHARTEK_OLEH_, diubah_oleh: MIGHARTEK_OLEH_,
      timestamp: tsIso, timestamp_update: tsIso, revision: 1
    };
    matV2.push(objMat);
    peta.push({ jenis: 'material', kode_lama: kodeLama, kode_baru: kodeBaru, id_v2: idV2, keterangan: kodeBaru !== kodeLama ? 'KODE_BARU' : '' });
    hitung.material.ok++;
    bulanan(h.bulan, h.tim.nama).material++;
  });

  // ---- 5. GROUNDING ----
  var Kgr = MIGHARTEK_KOL_.grounding;
  var grdV2 = [];
  pilih.grounding.forEach(function (x) {
    var row = x.row, kodeLama = x.kode;
    var kpkLama = teksSelMigHartek_(row, Kgr.kodePekerjaan) || kodeLama.replace(/-GND\.\d+$/i, '');
    var pkj = petaPkj[kpkLama];
    if (!pkj) {
      var tglG = tglSelMigHartek_(row, Kgr.tanggal, kodeLama, opsi.kodeUlp);
      if (tglG && !dalam(tglG)) { hitung.grounding.dilewati++; return; }
      hitung.grounding.karantina++;
      catat('grounding', kodeLama, '', 'KARANTINA', pkjKodeSumber[kpkLama] ? 'INDUK_PEKERJAAN_TIDAK_LOLOS (' + kpkLama + ')' : 'INDUK_PEKERJAAN_TIDAK_ADA (' + kpkLama + ')', '', tglG ? tglG.slice(0, 7) : '', row.baris);
      return;
    }
    var h = pkj.h;
    if (bentrokKode.grounding[kodeLama]) {
      hitung.grounding.karantina++; bulanan(h.bulan, h.tim.nama).karantina++;
      catat('grounding', kodeLama, '', 'KARANTINA', 'BENTROK_V2', '', h.bulan, row.baris);
      return;
    }
    var kodeBaru = alokasiKodeAnakPkj(pkj, 'GND', kodeLama);
    var idV2 = uuidMig_('HARTEK_GROUNDING', kodeBaru);
    var seb = angkaOhmMigHartek_(row.v[Kgr.hasilSebelum]);
    var ses = angkaOhmMigHartek_(row.v[Kgr.hasilSesudah]);
    var fSeb = idFotoMigHartek_(teksSelMigHartek_(row, Kgr.linkFotoSebelum), teksSelMigHartek_(row, Kgr.fotoSebelum));
    var fSes = idFotoMigHartek_(teksSelMigHartek_(row, Kgr.linkFotoSesudah), teksSelMigHartek_(row, Kgr.fotoSesudah));
    var tsIso = pkj.o.timestamp || waktuSelMigHartek_(row, -1, h.tgl);
    var objGrd = {
      kode_header: h.kode, kode_pg: pkj.pg.kode, kode_pekerjaan: pkj.kode, kode_grounding: kodeBaru, tanggal: h.tgl,
      jenis_peralatan: teksSelMigHartek_(row, Kgr.jenisPeralatan) || 'Grounding',
      nama_peralatan: teksSelMigHartek_(row, Kgr.namaPeralatan),
      kondisi_tanah: teksSelMigHartek_(row, Kgr.kondisiTanah),
      hasil_sebelum: seb, hasil_sesudah: ses,
      foto_sebelum_file_id: fSeb, foto_sesudah_file_id: fSes,
      // v1.0.0: link Drive dari file ID v1
      foto_sebelum_link: fSeb ? 'https://drive.google.com/file/d/' + fSeb + '/view' : '',
      foto_sesudah_link: fSes ? 'https://drive.google.com/file/d/' + fSes + '/view' : '',
      grounding_id: idV2, pekerjaan_id: pkj.id, pg_id: pkj.pg.id, header_id: h.id, tim_id: String(h.tim.tim_id),
      dibuat_oleh: MIGHARTEK_OLEH_, diubah_oleh: MIGHARTEK_OLEH_, timestamp: tsIso, timestamp_update: tsIso, revision: 1
    };
    grdV2.push(objGrd);
    peta.push({ jenis: 'grounding', kode_lama: kodeLama, kode_baru: kodeBaru, id_v2: idV2, keterangan: kodeBaru !== kodeLama ? 'KODE_BARU' : '' });
    hitung.grounding.ok++;
    bulanan(h.bulan, h.tim.nama).grounding++;
  });

  // ---- 6. PEMERATAAN BEBAN ----
  var Kpm = MIGHARTEK_KOL_.pemerataan;
  var pmrV2 = [];
  pilih.pemerataan.forEach(function (x) {
    var row = x.row, kodeLama = x.kode;
    var kpkLama = teksSelMigHartek_(row, Kpm.kodePekerjaan) || kodeLama.replace(/-PMR\.\d+$/i, '');
    var pkj = petaPkj[kpkLama];
    if (!pkj) {
      var tglP = tglSelMigHartek_(row, Kpm.tanggal, kodeLama, opsi.kodeUlp);
      if (tglP && !dalam(tglP)) { hitung.pemerataan.dilewati++; return; }
      hitung.pemerataan.karantina++;
      catat('pemerataan', kodeLama, '', 'KARANTINA', pkjKodeSumber[kpkLama] ? 'INDUK_PEKERJAAN_TIDAK_LOLOS (' + kpkLama + ')' : 'INDUK_PEKERJAAN_TIDAK_ADA (' + kpkLama + ')', '', tglP ? tglP.slice(0, 7) : '', row.baris);
      return;
    }
    var h = pkj.h, pg = pkj.pg;
    if (bentrokKode.pemerataan[kodeLama]) {
      hitung.pemerataan.karantina++; bulanan(h.bulan, h.tim.nama).karantina++;
      catat('pemerataan', kodeLama, '', 'KARANTINA', 'BENTROK_V2', '', h.bulan, row.baris);
      return;
    }
    var kodeBaru = alokasiKodeAnakPkj(pkj, 'PMR', kodeLama);
    var idV2 = uuidMig_('HARTEK_PEMERATAAN', kodeBaru);
    var noGarduRaw = teksSelMigHartek_(row, Kpm.gardu) || pg.o.no_gardu;
    var parsedNo = parseNoGarduLama_(noGarduRaw);
    var noGardu = parsedNo ? parsedNo.nomor : noGarduRaw.toUpperCase();
    var angkaBeban = function (idx) { var n = angkaLama_(row.v[idx]); return n === null ? 0 : n; };
    var tsIso = pkj.o.timestamp || waktuSelMigHartek_(row, -1, h.tgl);
    var objPmr = {
      kode_header: h.kode, kode_pg: pg.kode, kode_pekerjaan: pkj.kode, kode_pemerataan: kodeBaru, tanggal: h.tgl,
      penyulang: teksSelMigHartek_(row, Kpm.penyulang) || pg.o.penyulang,
      section: teksSelMigHartek_(row, Kpm.section) || pg.o.section,
      no_gardu: noGardu,
      alamat: teksSelMigHartek_(row, Kpm.alamat) || pg.o.daerah,
      seb_r: angkaBeban(Kpm.sebR), seb_s: angkaBeban(Kpm.sebS), seb_t: angkaBeban(Kpm.sebT),
      ses_r: angkaBeban(Kpm.sesR), ses_s: angkaBeban(Kpm.sesS), ses_t: angkaBeban(Kpm.sesT),
      pemerataan_id: idV2, pekerjaan_id: pkj.id, pg_id: pg.id, header_id: h.id, tim_id: String(h.tim.tim_id),
      dibuat_oleh: MIGHARTEK_OLEH_, diubah_oleh: MIGHARTEK_OLEH_, timestamp: tsIso, timestamp_update: tsIso, revision: 1
    };
    pmrV2.push(objPmr);
    peta.push({ jenis: 'pemerataan', kode_lama: kodeLama, kode_baru: kodeBaru, id_v2: idV2, keterangan: kodeBaru !== kodeLama ? 'KODE_BARU' : '' });
    hitung.pemerataan.ok++;
    bulanan(h.bulan, h.tim.nama).pemerataan++;
  });

  var urutKode = function (kol) {
    return function (a, b) {
      return String(a.tanggal || '').localeCompare(String(b.tanggal || '')) ||
        String(a[kol] || '').localeCompare(String(b[kol] || ''));
    };
  };
  var rencana = {
    header: headerV2.map(function (x) { return x.o; }).sort(urutKode('kode_header')),
    pg: pgV2.map(function (x) { return x.o; }).sort(urutKode('kode_pg')),
    pekerjaan: pkjV2.map(function (x) { return x.o; }).sort(urutKode('kode_pekerjaan')),
    material: matV2.sort(urutKode('kode_material')),
    grounding: grdV2.sort(urutKode('kode_grounding')),
    pemerataan: pmrV2.sort(urutKode('kode_pemerataan'))
  };

  return {
    judulSalah: cekJudulMigHartek_(S),
    tidakAda: S.tidakAda || [],
    tanpaKode: S.tanpaKode || {},
    catatan: catatan,
    rencana: rencana,
    peta: peta,
    hitung: hitung,
    perBulan: perBulan
  };
}

// ---------------- persiapan + laporan ----------------

function siapkanMigrasiHartek_() {
  var c = cfg_(), p = PropertiesService.getScriptProperties();
  var sumberId = teksMig_(p.getProperty('MIGHARTEK_SUMBER_ID')) || teksMig_(p.getProperty('MIG_SUMBER_ID'));
  if (!sumberId) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'MIGHARTEK_SUMBER_ID (ID spreadsheet sumber Hartek v1)');
  if (!c.HARTEK_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'HARTEK_SHEET_ID');
  if ([c.HARTEK_SHEET_ID, c.MASTER_SHEET_ID, c.AUTH_SHEET_ID, c.ROW_SHEET_ID, c.YANDAL_SHEET_ID, c.GARDU_SHEET_ID].indexOf(sumberId) !== -1) {
    throw new SisiError_('MIG_SUMBER_SALAH', 'sumber = sheet v2');
  }
  var dari = teksMig_(p.getProperty('MIGHARTEK_DARI')) || '2000-01-01';
  var sampai = teksMig_(p.getProperty('MIGHARTEK_SAMPAI')) || tglJakarta_(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dari) || !/^\d{4}-\d{2}-\d{2}$/.test(sampai)) {
    throw new SisiError_('FORMAT_SALAH', 'MIGHARTEK_DARI / MIGHARTEK_SAMPAI (yyyy-MM-dd)');
  }
  var ssUtama = SpreadsheetApp.openById(sumberId);
  var arsipId = teksMig_(p.getProperty('MIGHARTEK_ARSIP_ID'));
  var groundingId = teksMig_(p.getProperty('MIGHARTEK_GROUNDING_ID'));
  var ssArsip = arsipId ? SpreadsheetApp.openById(arsipId) : null;
  var ssGrounding = groundingId ? SpreadsheetApp.openById(groundingId) : null;
  var S = bacaSumberMigHartek_(ssUtama, ssArsip, ssGrounding);
  var ssH = bukaSpreadsheet_(c.HARTEK_SHEET_ID);
  var v2 = {};
  MIGHARTEK_JENIS_.forEach(function (j) {
    v2[j] = tabelHartek_(MIGHARTEK_SHEET_V2_[j]).rows;
  });
  var kepemilikanRows = [];
  try { kepemilikanRows = tabel_('MASTER_SHEET_ID', HARTEK_SHEET_.KEPEMILIKAN_MATERIAL).rows; } catch (eK) { kepemilikanRows = []; }
  var M = {
    tim: tabel_('MASTER_SHEET_ID', 'db_Tim').rows,
    jaringan: tabel_('MASTER_SHEET_ID', 'db_Jaringan').rows,
    jenis: tabel_('MASTER_SHEET_ID', 'db_Jenis_Pekerjaan').rows,
    material: tabelMaterialHartek_().rows,
    kepemilikan: kepemilikanRows,
    gardu: c.GARDU_SHEET_ID ? tabel_('GARDU_SHEET_ID', 'db_Gardu').rows : [],
    alias: ssH.getSheetByName('mightk_Alias') ? bacaSumberMig_(ssH, 'mightk_Alias').rows : [],
    v2: v2
  };
  var opsi = { dari: dari, sampai: sampai, kodeUlp: c.KODE_ULP, ulpNama: c.ULP_NAMA };
  return { c: c, p: p, S: S, M: M, opsi: opsi, ss: ssUtama, ssH: ssH };
}

function cetakMigrasiHartek_(x, r) {
  console.log('MIGRASI HARTEK ' + x.c.ENV + ' | sumber "' + (x.ss.getName ? x.ss.getName() : '-') + '" | periode ' + x.opsi.dari + ' s.d. ' + x.opsi.sampai);
  if (r.judulSalah.length) console.log('JUDUL KOLOM TIDAK COCOK (kolom bergeser?): ' + r.judulSalah.join(' | '));
  if (r.tidakAda.length) console.log('Tab opsional tidak ada (dilewati): ' + r.tidakAda.join(', '));
  Object.keys(r.tanpaKode).forEach(function (j) { if (r.tanpaKode[j]) console.log(j + ': ' + r.tanpaKode[j] + ' baris berisi tanpa kode (dilewati)'); });
  MIGHARTEK_JENIS_.forEach(function (j) { console.log(j + ': ' + JSON.stringify(r.hitung[j])); });
  console.log('KARANTINA total: ' + r.catatan.filter(function (c) { return c.status === 'KARANTINA'; }).length);
}

function tulisLaporanMigHartek_(ssH, r) {
  tulisSheetMig_(ssH, 'mightk_Cek', MIGHARTEK_CEK_KOLOM_, r.catatan.map(function (c) {
    return [c.jenis, c.kodeLama, c.kodeBaru, c.status, c.alasan, c.saran, c.bulan, c.baris];
  }));
  tulisSheetMig_(ssH, 'mightk_Ringkas', MIGHARTEK_RINGKAS_KOLOM_, Object.keys(r.perBulan).sort().map(function (k) {
    var b = r.perBulan[k], kk = k.split('|');
    return [kk[0], kk[1], b.header, b.pgJaringan, b.pgGardu, b.pgNonTeknik, b.gawang, b.pekerjaan, b.material, b.grounding, b.pemerataan, b.karantina];
  }));
}

/**
 * Editor: DRY-RUN migrasi Hartek v1 -> v2.
 * Script Property: MIGHARTEK_SUMBER_ID (atau MIG_SUMBER_ID), opsional MIGHARTEK_ARSIP_ID, MIGHARTEK_GROUNDING_ID,
 * MIGHARTEK_DARI / MIGHARTEK_SAMPAI (yyyy-MM-dd), sheet mightk_Alias di SiSi_Hartek.
 * Menulis mightk_Cek + mightk_Ringkas di SiSi_Hartek. Tab db_Hartek_* tidak diubah, sumber tidak pernah ditulis.
 */
function ADMIN_migrasiHartekCek() {
  pastikanPemilik_();
  var w = stopwatch_();
  var x = siapkanMigrasiHartek_();
  w('baca');
  var r = analisisMigrasiHartek_(x.S, x.M, x.opsi);
  w('analisis');
  cetakMigrasiHartek_(x, r);
  tulisLaporanMigHartek_(x.ssH, r);
  w('laporan');
  console.log('Laporan: mightk_Cek (' + r.catatan.length + ' baris) + mightk_Ringkas di SiSi_Hartek. db_Hartek_* TIDAK diubah. Waktu ' + JSON.stringify(w.ringkas()));
  return { catatan: r.catatan.length, karantina: r.catatan.filter(function (c) { return c.status === 'KARANTINA'; }).length, hitung: r.hitung };
}

/**
 * Editor: tulis hasil migrasi Hartek v1 ke 6 tab db_Hartek_* di SiSi_Hartek.
 * Syarat: judul kolom cocok (atau MIGHARTEK_LEWATI_CEK_JUDUL=TRUE), tidak ada KARANTINA (atau MIGHARTEK_IZINKAN_KARANTINA=TRUE).
 * Idempoten & aman dilanjutkan bila terpotong batas waktu 4,5 menit. Data v2 asli tidak disentuh.
 */
function ADMIN_migrasiHartekJalan() {
  pastikanPemilik_();
  var mulai = Date.now(), w = stopwatch_();
  var x = siapkanMigrasiHartek_();
  var r = analisisMigrasiHartek_(x.S, x.M, x.opsi);
  w('analisis');
  if (r.judulSalah.length && x.p.getProperty('MIGHARTEK_LEWATI_CEK_JUDUL') !== 'TRUE') {
    throw new SisiError_('MIG_JUDUL_SALAH', r.judulSalah.join(' | ') + '. Samakan kolom sumber dengan layout v1, ' +
      'atau MIGHARTEK_LEWATI_CEK_JUDUL=TRUE kalau judulnya memang beda tapi posisinya benar.');
  }
  var karantina = r.catatan.filter(function (c) { return c.status === 'KARANTINA'; }).length;
  if (karantina && x.p.getProperty('MIGHARTEK_IZINKAN_KARANTINA') !== 'TRUE') {
    throw new SisiError_('MIG_MASIH_KARANTINA', karantina + ' baris. Bereskan lewat mightk_Alias / master lalu ADMIN_migrasiHartekCek, ' +
      'atau set Script Property MIGHARTEK_IZINKAN_KARANTINA=TRUE untuk meninggalkannya.');
  }
  var hasil = denganLock_(function () {
    var out = { terpotong: false };
    MIGHARTEK_JENIS_.forEach(function (j) {
      var tb = tabelHartek_(MIGHARTEK_SHEET_V2_[j]);
      var kolId = MIGHARTEK_ID_V2_[j], kolKode = MIGHARTEK_KODE_V2_[j];
      var rencanaId = {}, rencanaKode = {};
      r.rencana[j].forEach(function (o) { rencanaId[String(o[kolId])] = true; rencanaKode[teksMig_(o[kolKode])] = true; });
      var ada = {};
      tb.rows.forEach(function (row) {
        var id = String(row[kolId] || '');
        if (String(row.dibuat_oleh) !== MIGHARTEK_OLEH_) {
          if (rencanaKode[teksMig_(row[kolKode])]) {
            throw new SisiError_('MIG_KODE_BENTROK', tb.nama + ' baris ' + row._baris + ' (' + row[kolKode] + ') dibuat app v2');
          }
          return;
        }
        if (!rencanaId[id]) {
          throw new SisiError_('MIG_RENCANA_BERUBAH', tb.nama + ' baris ' + row._baris + ' (' + row[kolKode] + ') tidak ada di rencana sekarang. ' +
            'Rollback dulu (ADMIN_migrasiHartekHapus).');
        }
        ada[id] = true;
      });
      var baru = r.rencana[j].filter(function (o) { return !ada[String(o[kolId])]; });
      var ditulis = 0;
      for (var i = 0; i < baru.length && !out.terpotong; i += MIGHARTEK_BLOK_) {
        if (Date.now() - mulai > MIGHARTEK_BATAS_MS_) { out.terpotong = true; break; }
        var blok = baru.slice(i, i + MIGHARTEK_BLOK_), akhir = tb.sheet.getLastRow();
        var data = blok.map(function (o, k) {
          o.nomor = akhir + k;
          return barisDariObjek_(tb.header, o);
        });
        tb.sheet.getRange(akhir + 1, 1, data.length, tb.header.length).setValues(data);
        blok.forEach(function (o) { ada[String(o[kolId])] = true; ditulis++; });
      }
      out[j] = { sudahAda: Object.keys(ada).length - ditulis, ditulis: ditulis };
    });
    return out;
  }, 60000);
  w('tulis');
  if (!hasil.terpotong) {
    tulisSheetMig_(x.ssH, 'mightk_Peta', MIGHARTEK_PETA_KOLOM_, r.peta.map(function (q) {
      return [q.jenis, q.kode_lama, q.kode_baru, q.id_v2, q.keterangan];
    }));
  }
  tulisLaporanMigHartek_(x.ssH, r);
  w('laporan');
  console.log('MIGRASI HARTEK ' + x.c.ENV + ': ' + JSON.stringify(hasil) + (karantina ? ' | karantina DITINGGAL: ' + karantina : '') +
    ' | waktu ' + JSON.stringify(w.ringkas()));
  console.log(hasil.terpotong ? 'Batas waktu: jalankan ADMIN_migrasiHartekJalan lagi untuk melanjutkan.' : 'MIGRASI HARTEK SELESAI.');
  return hasil;
}

/**
 * Editor: hapus SEMUA baris dibuat_oleh = MIGRASI di 6 tab db_Hartek_*, kosongkan mightk_Peta.
 * Wajib Script Property MIGHARTEK_IZINKAN_HAPUS=TRUE (dihapus otomatis sesudah jalan, sekali pakai).
 * Baris app v2 asli tidak disentuh (ditulis ulang rapat ke atas).
 */
function ADMIN_migrasiHartekHapus() {
  pastikanPemilik_();
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty('MIGHARTEK_IZINKAN_HAPUS') !== 'TRUE') {
    throw new SisiError_('MIG_HAPUS_DIKUNCI', 'set Script Property MIGHARTEK_IZINKAN_HAPUS=TRUE dulu (sekali pakai)');
  }
  var c = cfg_();
  if (!c.HARTEK_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'HARTEK_SHEET_ID');
  var hasil = denganLock_(function () {
    var out = {};
    MIGHARTEK_JENIS_.forEach(function (j) {
      var tb = tabelHartek_(MIGHARTEK_SHEET_V2_[j]), akhir = tb.sheet.getLastRow(), lebar = tb.header.length;
      out[j] = 0;
      if (akhir < 2) return;
      var rg = tb.sheet.getRange(2, 1, akhir - 1, lebar), nilai = rg.getValues();
      var iOleh = tb.header.indexOf('dibuat_oleh'), iNo = tb.header.indexOf('nomor');
      var sisa = nilai.filter(function (b) { return String(b[iOleh]) !== MIGHARTEK_OLEH_; });
      out[j] = nilai.length - sisa.length;
      if (!out[j]) return;
      var kosong = [];
      for (var k = 0; k < lebar; k++) kosong.push('');
      var rapi = sisa.map(function (b, idx) {
        var salin = b.map(amanSheet_);
        if (iNo !== -1) salin[iNo] = idx + 1;
        return salin;
      });
      rg.setValues(rapi.concat(nilai.slice(sisa.length).map(function () { return kosong.slice(); })));
    });
    return out;
  }, 60000);
  var ssH = bukaSpreadsheet_(c.HARTEK_SHEET_ID);
  if (ssH.getSheetByName('mightk_Peta')) tulisSheetMig_(ssH, 'mightk_Peta', MIGHARTEK_PETA_KOLOM_, []);
  p.deleteProperty('MIGHARTEK_IZINKAN_HAPUS');
  console.log('ROLLBACK MIGRASI HARTEK ' + c.ENV + ': baris dihapus ' + JSON.stringify(hasil));
  return hasil;
}

/**
 * Bagian "Migrasi Hartek" di ADMIN_cekKonfigurasi. Hanya membaca. Property kosong = info (opsional).
 */
function cekKonfigMigrasiHartek_(c) {
  var p = PropertiesService.getScriptProperties(), masalah = 0;
  var ambil = function (k) { return teksMig_(p.getProperty(k)); };
  var salah = function (pesan) { masalah++; console.warn('Migrasi Hartek: ' + pesan); };
  console.log('--- Migrasi Hartek v1 -> v2 (ADMIN_migrasiHartekCek) ---');
  var sumberId = ambil('MIGHARTEK_SUMBER_ID');
  if (!sumberId) {
    console.log('MIGHARTEK_SUMBER_ID kosong: migrasi Hartek belum disiapkan (atau otomatis memakai MIG_SUMBER_ID bila diisi). ' +
      'Opsional: MIGHARTEK_ARSIP_ID, MIGHARTEK_GROUNDING_ID, MIGHARTEK_DARI, MIGHARTEK_SAMPAI (yyyy-MM-dd).');
    return 0;
  }
  if ([c.HARTEK_SHEET_ID, c.MASTER_SHEET_ID, c.AUTH_SHEET_ID, c.ROW_SHEET_ID, c.YANDAL_SHEET_ID, c.GARDU_SHEET_ID].indexOf(sumberId) !== -1) {
    salah('MIGHARTEK_SUMBER_ID sama dengan spreadsheet v2 (harus file sumber v1)');
    return masalah;
  }
  try {
    var ss = SpreadsheetApp.openById(sumberId);
    var nama = ss.getName ? ss.getName() : sumberId;
    var info = [];
    ['header', 'pg', 'pekerjaan', 'material', 'grounding', 'pemerataan'].forEach(function (j) {
      var sh = cariSheetMigHartek_(ss, MIGHARTEK_TAB_V1_[j]);
      var label = MIGHARTEK_TAB_V1_[j][0];
      if (!sh) {
        if (j === 'header' || j === 'pg' || j === 'pekerjaan') salah('tab ' + label + ' tidak ada di "' + nama + '" (wajib)');
        else info.push(label + ': tidak ada di file utama (opsional / di MIGHARTEK_GROUNDING_ID)');
      } else {
        info.push(sh.getName() + ': ' + Math.max(0, sh.getLastRow() - 1) + ' baris');
      }
    });
    console.log('MIGHARTEK_SUMBER_ID: "' + nama + '" | ' + info.join(' | '));
  } catch (e) {
    salah('MIGHARTEK_SUMBER_ID tidak bisa dibuka (' + (e.message || e) + '). Bagikan file ke akun pemilik script.');
  }
  var dari = ambil('MIGHARTEK_DARI'), sampai = ambil('MIGHARTEK_SAMPAI');
  [['MIGHARTEK_DARI', dari], ['MIGHARTEK_SAMPAI', sampai]].forEach(function (x) {
    if (x[1] && !/^\d{4}-\d{2}-\d{2}$/.test(x[1])) salah(x[0] + ' "' + x[1] + '" harus yyyy-MM-dd');
  });
  if (dari && sampai && dari > sampai) salah('MIGHARTEK_DARI lebih besar dari MIGHARTEK_SAMPAI');
  return masalah;
}
