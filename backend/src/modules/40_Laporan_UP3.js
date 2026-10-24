/**
 * Laporan UP3 + Laporan Wilayah (UIW) harian (v0.51, struktur sheet v0.55, keputusan kvlar 5 Okt 2026).
 *
 * Sumber:
 *  - ROW dari SiSi_ROW v2 (realisasi AKTIF, hitungan = eksekusi AKTIF foto lengkap). Tebang = Sedang + Besar.
 *  - Input manual di spreadsheet terpisah SiSi_Laporan (Script Property LAPORAN_SHEET_ID), DIPISAH per laporan
 *    karena UP3 dan UIW dikerjakan 2 orang:
 *      lap_Harian_UP3 : 1 baris AKTIF per tanggal, induk lap_C4A_UP3 (salinan teks Laporan UP3)
 *      lap_C4A_UP3    : 1 baris per penyulang; Realisasi kmS diisi langsung; Temuan, Tindak Lanjut, Eksekusi (tim) teks
 *      lap_Harian_UIW : 1 baris AKTIF per tanggal, induk lap_C4A_UIW (Cuaca, Tim ROW, salinan teks Laporan UIW)
 *      lap_C4A_UIW    : 1 baris per section (Jumlah Tiang -> Panjang kmS = tiang x 0,05), Care for Asset
 *  - Modul yang belum pindah ke v2 (Gangguan, Hartek, Inspeksi, P0, Tindak Lanjut gangguan) tampil "-".
 * Format teks mengikuti Tek-LapUP3UIWHarian.js lama. Target ROW per hari (Script Property, default 20 rabas /
 * 6 tebang) dibagi rata ke penyulang hari itu, sisa ke penyulang pertama.
 *
 * Akses (guard, v0.57 menu dipecah): Laporan UP3 = menu OPS_LAP_UP3 (getLaporanUp3 / simpanLaporanUp3), Laporan UIW
 * = menu OPS_LAP_UIW (getLaporanUiw / simpanLaporanUiw), masing-masing lewat guard_ (sesi, menu aktif, platform, UBAH
 * untuk simpan) + peranLaporanUp3_ (PETUGAS selalu ditolak; simpan hanya ADMIN / SUPER). Simpan HANYA hari ini (WIB):
 * UP3 hanya menulis lap_Harian_UP3 + lap_C4A_UP3, UIW hanya lap_Harian_UIW + lap_C4A_UIW, cek revision induknya sendiri.
 * Tanggal dalam 7 hari = dihitung langsung; lebih lama = salinan tersimpan (hanya lihat).
 * Baris harian dibuat pemicu ADMIN_buatBarisHarian (00.05 WIB), atau saat simpan pertama bagian itu.
 */
var LAP_SHEET_ = { up3: 'lap_Harian_UP3', uiw: 'lap_Harian_UIW', c4aUp3: 'lap_C4A_UP3', c4aUiw: 'lap_C4A_UIW' };
var LAP_BAGIAN_ = ['UP3', 'UIW'];
var LAP_MENU_ = { UP3: 'OPS_LAP_UP3', UIW: 'OPS_LAP_UIW' };   // v0.57: menu dipecah, akses per laporan
var LAP_C4A_MAKS_ = 20;
var LAP_KMS_PER_TIANG_ = 0.05;
var LAP_SEP_ = '\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550';
var LAP_TARGET_GARDU_ = 5;

var SKEMA_C4A_UP3_ = {
  id: { tipe: 'uuid', wajib: true },
  penyulang: { tipe: 'teks', wajib: true, maks: 60 },
  realisasiKms: { tipe: 'angka', wajib: true, min: 0, max: 999 },
  temuan: { tipe: 'teks', maks: 200 },
  tindakLanjut: { tipe: 'teks', maks: 200 },
  eksekusi: { tipe: 'teks', maks: 100 },
  keterangan: { tipe: 'teks', maks: 200 }
};

var SKEMA_C4A_ = {
  id: { tipe: 'uuid', wajib: true },
  sectionId: { tipe: 'uuid', wajib: true },
  jumlahTiang: { tipe: 'angka', wajib: true, bulat: true, min: 1, max: 2000 },
  temuanPeralatan: { tipe: 'angka', bulat: true, min: 0, max: 999 },
  temuanRow: { tipe: 'angka', bulat: true, min: 0, max: 999 },
  eksekusi: { tipe: 'angka', bulat: true, min: 0, max: 999 },
  keterangan: { tipe: 'teks', maks: 200 }
};

/** PETUGAS tidak pernah boleh (laporan tingkat ULP). Tulis hanya ADMIN / SUPER (ADMIN_ES hanya lihat). */
function peranLaporanUp3_(sesi, tulis) {
  if (!sesi || sesi.role === 'PETUGAS') throw new SisiError_('AKSES_DITOLAK', 'laporan UP3/UIW bukan untuk PETUGAS');
  if (tulis && sesi.role !== 'ADMIN' && sesi.role !== 'SUPER') throw new SisiError_('AKSES_DITOLAK', 'hanya ADMIN/SUPER');
}

function targetRowHarian_() {
  var p = PropertiesService.getScriptProperties();
  var baca = function (k, awal) {
    var v = p.getProperty(k);
    var n = v === null || v === '' ? awal : Number(v);
    return isFinite(n) && n >= 0 && Math.floor(n) === n ? n : awal;
  };
  return { rabas: baca('TARGET_RABAS_HARIAN', 20), tebang: baca('TARGET_TEBANG_HARIAN', 6) };
}

/**
 * Sel tanggal di sheet bisa Date (diubah otomatis Sheets) atau teks yyyy-MM-dd.
 * v1.0.23: juga teks String(Date) bertahun (mis. 'Fri Oct 16 2026 17:30:00 GMT+0700'), lihat tglTeksJs_.
 */
function tglSel_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : tglJakarta_(v);
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{4}/.test(s) ? tglTeksJs_(s) : '';
}

/** "Senin, 5 Oktober 2026" (tanpa nol di depan tanggal, seperti format lama). */
function tglIndo_(iso) {
  return hariDari_(iso) + ', ' + Number(iso.slice(8, 10)) + ' ' + BULAN_ID_[Number(iso.slice(5, 7)) - 1] + ' ' + iso.slice(0, 4);
}

function bagiTarget_(total, n) {
  var out = [];
  if (n <= 0) return out;
  var dasar = Math.floor(total / n), sisa = total - dasar * n;
  for (var i = 0; i < n; i++) out.push(dasar + (i < sisa ? 1 : 0));
  return out;
}

/** 0 / kosong = "- satuan" (harian, format lama). */
function lapAngka_(v, satuan) {
  if (v === null || v === undefined || v === '' || Number(v) === 0) return '- ' + satuan;
  return v + ' ' + satuan;
}

function kmsTeks_(tiang, spasi) {
  return ((Number(tiang) || 0) * LAP_KMS_PER_TIANG_).toFixed(2).replace('.', ',') + (spasi ? ' kmS' : 'kmS');
}

/** 4.6 -> "4,6", 4 -> "4", 4.355 -> "4,36" (maks 2 desimal, tanpa nol di belakang). */
function angkaKoma_(v) {
  var n = Math.round((Number(v) || 0) * 100) / 100;
  return String(n).replace('.', ',');
}

function lapPenyBlok_(nama, baris) {
  var L = [];
  if (nama) L.push('- Penyulang ' + nama);
  L.push('Target / Realisasi');
  baris.forEach(function (b) { L.push('- ' + b.label + ' : ' + lapAngka_(b.target, b.satuan) + ' / ' + lapAngka_(b.rlz, b.satuan)); });
  return L.join('\n');
}

function labelTimRow_(nama, kode) {
  var m = /(\d+)/.exec(String(kode || '') || String(nama || ''));
  return m ? 'TIM ROW ' + ('0' + Number(m[1])).slice(-2) : 'TIM ' + String(nama || '').toUpperCase();
}

/**
 * Data ROW satu tanggal dari konteks jendela ROW (header 7 hari, realisasi sejak awal bulan).
 * Hasil: perPenyulang (harian, semua tim), komulatif (tgl 1 s.d. tanggal), tim (per tim -> per penyulang).
 */
/**
 * Section UIW (kvlar 5 Okt 2026): satu section = nama lengkap; lebih dari satu = "<awal section urutan terendah> -
 * <akhir section urutan tertinggi>". Nama section berbentuk "Titik A - Titik B" dipecah di " - " (tanda hubung berspasi,
 * jadi "TB-01" tidak terpecah). Urutan = kolom urutan db_Jaringan (urutSection_).
 */
function bagianSection_(nama) { return String(nama || '').trim().split(/\s+[-\u2013]\s+/); }

function sectionRentangUiw_(ids, jaringan) {
  var unik = [];
  ids.forEach(function (id) { if (id && jaringan[id] && unik.indexOf(id) === -1) unik.push(id); });
  if (!unik.length) return '';
  unik.sort(urutSection_(jaringan));
  if (unik.length === 1) return jaringan[unik[0]].section;
  var awal = bagianSection_(jaringan[unik[0]].section)[0];
  var b = bagianSection_(jaringan[unik[unik.length - 1]].section), akhir = b[b.length - 1];
  return awal === akhir ? awal : awal + ' - ' + akhir;
}

function dataRowLaporan_(ctx, tanggal) {
  var jaringan = (ctx.master && ctx.master.jaringan) || {};
  var sectionReal = {};   // realisasi_id -> section_id eksekusi AKTIF foto lengkap
  Object.keys(ctx.byId.eksekusi).forEach(function (id) {
    var e = ctx.byId.eksekusi[id];
    if (e.status !== 'AKTIF' || !isAktif_(e.foto_lengkap)) return;
    (sectionReal[String(e.realisasi_id)] = sectionReal[String(e.realisasi_id)] || []).push(String(e.section_id || ''));
  });
  var headerAktif = {};
  Object.keys(ctx.byId.header).forEach(function (id) {
    var h = ctx.byId.header[id];
    if (h.status === 'AKTIF' && tanggalDariKode_(h['Kode Header']) === tanggal) headerAktif[id] = h;
  });
  var perPenyulang = {}, tim = {}, komulatif = { rabas: 0, tebang: 0 };
  var bulan = tanggal.slice(0, 7);
  Object.keys(ctx.byId.realisasi).forEach(function (id) {
    var r = ctx.byId.realisasi[id];
    if (r.status !== 'AKTIF') return;
    var t = tanggalDariKode_(r['Kode Pekerjaan']);
    if (!t || t.slice(0, 7) !== bulan || t > tanggal) return;
    var rabas = Number(r.Rabas) || 0, tebang = (Number(r.Sedang) || 0) + (Number(r.Besar) || 0);
    komulatif.rabas += rabas; komulatif.tebang += tebang;
    var h = headerAktif[String(r.header_id)];
    if (t !== tanggal || !h || rabas + tebang === 0) return;
    var p = String(r.Penyulang || '').trim() || '-';
    var x = perPenyulang[p] = perPenyulang[p] || { rabas: 0, tebang: 0 };
    x.rabas += rabas; x.tebang += tebang;
    var tid = String(h.tim_id);
    var kodeTim = String(h['Kode Header']).slice(1, 3);
    var g = tim[tid] = tim[tid] || { timId: tid, nama: String(h['Sub-Tim'] || ''), kode: kodeTim, penyulang: [] };
    g.penyulang.push({ kode: String(r['Kode Pekerjaan']), penyulang: p, section: String(r.Section || '').trim(),
                       sectionUiw: sectionRentangUiw_(sectionReal[String(r.realisasi_id)] || [], jaringan), rabas: rabas, tebang: tebang });
  });
  var daftarTim = Object.keys(tim).map(function (k) { return tim[k]; })
    .sort(function (a, b) { return a.kode < b.kode ? -1 : a.kode > b.kode ? 1 : (a.nama < b.nama ? -1 : 1); });
  daftarTim.forEach(function (g) { g.penyulang.sort(function (a, b) { return a.kode < b.kode ? -1 : 1; }); });
  return { perPenyulang: perPenyulang, komulatif: komulatif, tim: daftarTim, headerAktif: headerAktif };
}

/** C4A dikelompokkan per penyulang (urut kemunculan), section digabung koma. */
function grupC4a_(c4a) {
  var urut = [], peta = {};
  c4a.forEach(function (c) {
    var k = c.penyulang.toLowerCase();
    if (!peta[k]) { peta[k] = { penyulang: c.penyulang, sections: [], tiang: 0, peralatan: 0, row: 0, eksekusi: 0 }; urut.push(k); }
    var g = peta[k];
    if (c.section && g.sections.indexOf(c.section) === -1) g.sections.push(c.section);
    g.tiang += c.jumlahTiang; g.peralatan += c.temuanPeralatan; g.row += c.temuanRow; g.eksekusi += c.eksekusi;
  });
  return urut.map(function (k) { return peta[k]; });
}

/** Satuan WA Hartek: huruf awal kapital bila masih huruf kecil semua ('buah' -> 'Buah'). */
function satuanWaLapHartek_(v) {
  var s = lapTeks_(v);
  if (!s) return '';
  if (s.length === 1) return s;
  return s === s.toLowerCase() ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function jumlahSatuanLapHartek_(jml, sat) {
  var j = jml === '' || jml === null || jml === undefined ? '' : String(jml).trim();
  var s = satuanWaLapHartek_(sat);
  return [j, s].filter(Boolean).join(' ');
}

function tambahUnikTeks_(daftar, v) {
  var s = lapTeks_(v);
  if (!s) return;
  var kecil = s.toLowerCase();
  if (!daftar.some(function (x) { return x.toLowerCase() === kecil; })) daftar.push(s);
}

/**
 * v0.98.7: Data modul Hartek untuk satu tanggal + komulatif bulan itu (tgl 1 s.d. tanggal).
 * Dipakai Laporan UP3 (C. Hartek) dan Laporan UIW (Tim Hartek + Realisasi Pekerjaan Hartek).
 * Bila HARTEK_SHEET_ID belum diisi / sheet belum ada = hasil kosong (kompatibel lama).
 */
function dataHartekLaporan_(tanggal) {
  var kosong = { aktif: false, timLapor: 0, statusTim: 'V1', perPenyulang: {}, komulatif: { gardu: 0, jaringan: 0 },
                 penyulangUiw: [], sectionUiw: [], jaringan: [], gardu: [], nonTeknik: [] };
  var c = cfg_();
  if (!c || !c.HARTEK_SHEET_ID || typeof tabelHartek_ !== 'function') return kosong;
  try {
    var H = tabelHartek_(HARTEK_SHEET_.HEADER).rows;
    var PG = tabelHartek_(HARTEK_SHEET_.PG).rows;
    var PK = tabelHartek_(HARTEK_SHEET_.PEKERJAAN).rows;
    var MT = tabelHartek_(HARTEK_SHEET_.MATERIAL).rows;
    var GR = [];
    var PM = [];
    try { GR = tabelHartek_(HARTEK_SHEET_.GROUNDING).rows; } catch (eG) { GR = []; }
    try { PM = tabelHartek_(HARTEK_SHEET_.PEMERATAAN).rows; } catch (eP) { PM = []; }
    var bulan = String(tanggal || '').slice(0, 7);
    var hdrBulan = {}, hdrHari = {}, timHari = {};
    var adaSiap = false, adaLapor = false;
    H.forEach(function (h) {
      if (!h.header_id || h.status !== 'AKTIF') return;
      var t = tglHartek_(h);
      if (!t || t.slice(0, 7) !== bulan || t > tanggal) return;
      var hid = String(h.header_id);
      hdrBulan[hid] = h;
      if (t === tanggal) {
        hdrHari[hid] = h;
        timHari[String(h.tim_id || hid)] = true;
        adaLapor = true;
        if (lapTeks_(h.koordinat_awal) && lapTeks_(h.koordinat_akhir) && h.km_awal !== '' && h.km_awal !== null && h.km_akhir !== '' && h.km_akhir !== null) {
          adaSiap = true;
        }
      }
    });
    var pkPerPg = {}, mtPerPk = {}, grPerPk = {}, pmPerPk = {};
    PK.forEach(function (x) {
      var pid = String(x.pg_id || '');
      if (pid) (pkPerPg[pid] = pkPerPg[pid] || []).push(x);
    });
    MT.forEach(function (m) {
      var kid = String(m.pekerjaan_id || '');
      if (kid) (mtPerPk[kid] = mtPerPk[kid] || []).push(m);
    });
    GR.forEach(function (g) {
      var kid = String(g.pekerjaan_id || '');
      if (kid) (grPerPk[kid] = grPerPk[kid] || []).push(g);
    });
    PM.forEach(function (q) {
      var kid = String(q.pekerjaan_id || '');
      if (kid) (pmPerPk[kid] = pmPerPk[kid] || []).push(q);
    });

    var perPenyulang = {}, komulatif = { gardu: 0, jaringan: 0 };
    var penyulangUiw = [], sectionUiw = [];
    var pgJaringan = [], pgGardu = [], pgNonTeknik = [];

    PG.forEach(function (p) {
      var hid = String(p.header_id || '');
      if (!hdrBulan[hid]) return;
      var pkList = pkPerPg[String(p.pg_id)] || [];
      if (!pkList.length) return;
      var jenis = lapTeks_(p.jenis_pekerjaan);
      var peny = lapTeks_(p.penyulang) || '-';
      var gawang = Number(p.jumlah_gawang) || 0;
      if (jenis === 'Gardu') komulatif.gardu += 1;
      else if (jenis === 'Jaringan') komulatif.jaringan += gawang;

      if (!hdrHari[hid]) return;
      if (jenis === 'Gardu' || jenis === 'Jaringan') {
        var rowP = perPenyulang[peny] = perPenyulang[peny] || { gardu: 0, jaringan: 0 };
        if (jenis === 'Gardu') rowP.gardu += 1;
        else rowP.jaringan += gawang;
      }
      if (lapTeks_(p.penyulang)) tambahUnikTeks_(penyulangUiw, p.penyulang);
      if (lapTeks_(p.section)) tambahUnikTeks_(sectionUiw, p.section);

      var item = {
        noGardu: lapTeks_(p.no_gardu),
        penyulang: lapTeks_(p.penyulang),
        section: lapTeks_(p.section),
        pekerjaan: pkList.map(function (x) {
          var kid = String(x.pekerjaan_id || '');
          return {
            nama: lapTeks_(x.pekerjaan),
            hasil: jumlahSatuanLapHartek_(x.jumlah_pekerjaan, x.satuan_pekerjaan),
            material: (mtPerPk[kid] || []).map(function (m) {
              return {
                nama: lapTeks_(m.material),
                hasil: jumlahSatuanLapHartek_(m.jumlah, m.satuan),
                kepemilikan: lapTeks_(m.kepemilikan)
              };
            }),
            grounding: (grPerPk[kid] || []).map(function (g) {
              return {
                jenisPeralatan: lapTeks_(g.jenis_peralatan),
                hasilSebelum: lapTeks_(g.hasil_sebelum),
                hasilSesudah: lapTeks_(g.hasil_sesudah)
              };
            }),
            pemerataan: (pmPerPk[kid] || []).map(function (q) {
              return {
                noGardu: lapTeks_(q.no_gardu),
                sebR: lapTeks_(q.seb_r), sebS: lapTeks_(q.seb_s), sebT: lapTeks_(q.seb_t),
                sesR: lapTeks_(q.ses_r), sesS: lapTeks_(q.ses_s), sesT: lapTeks_(q.ses_t)
              };
            })
          };
        })
      };
      if (jenis === 'Jaringan') pgJaringan.push(item);
      else if (jenis === 'Gardu') pgGardu.push(item);
      else pgNonTeknik.push(item);
    });

    var adaPekerjaanHari = pgJaringan.length + pgGardu.length + pgNonTeknik.length > 0;
    return {
      aktif: true,
      timLapor: Object.keys(timHari).length,
      statusTim: adaSiap && adaPekerjaanHari ? 'SIAP' : (adaLapor ? 'LAPOR' : 'BELUM'),
      perPenyulang: perPenyulang,
      komulatif: komulatif,
      penyulangUiw: penyulangUiw,
      sectionUiw: sectionUiw,
      jaringan: pgJaringan,
      gardu: pgGardu,
      nonTeknik: pgNonTeknik
    };
  } catch (e) {
    return kosong;
  }
}

function barisGroundingUiw_(pk) {
  var out = [];
  var gr = pk && pk.grounding ? pk.grounding : [];
  if (!gr.length) return out;
  var nm = String((pk && pk.nama) || '').toLowerCase();
  var isPasang = nm.indexOf('pasang') !== -1 || nm.indexOf('pemasangan') !== -1;
  var isPerbaikan = nm.indexOf('perbaikan') !== -1;
  gr.forEach(function (g) {
    var seb = lapTeks_(g.hasilSebelum), ses = lapTeks_(g.hasilSesudah);
    if (!seb && !ses) return;
    var alat = lapTeks_(g.jenisPeralatan);
    var suffixAlat = alat ? ' (' + alat + ')' : '';
    var mode = isPerbaikan ? 'perbaikan' : (isPasang ? 'pemasangan' : ((seb && ses) ? 'perbaikan' : 'pemasangan'));
    if (mode === 'perbaikan') {
      out.push('Hasil Pengukuran Grounding' + suffixAlat + ':');
      out.push('- Sebelum : ' + (seb || '-') + ' \u03A9');
      out.push('- Sesudah : ' + (ses || '-') + ' \u03A9');
    } else {
      out.push('Hasil Pengukuran Grounding' + suffixAlat + ' : ' + (ses || seb) + ' \u03A9');
    }
  });
  return out;
}

function barisPemerataanUiw_(pk) {
  var out = [];
  var pm = pk && pk.pemerataan ? pk.pemerataan : [];
  if (!pm.length) return out;
  var amp = function (v) {
    var s = lapTeks_(v);
    if (!s) return '-';
    return /a$/i.test(s) ? s.replace(/\s+a$/i, 'A') : (s + 'A');
  };
  var padRight = function (str, len) {
    var s = String(str || '');
    while (s.length < len) s += ' ';
    return s;
  };
  pm.forEach(function (q) {
    var sebR = lapTeks_(q.sebR), sebS = lapTeks_(q.sebS), sebT = lapTeks_(q.sebT);
    var sesR = lapTeks_(q.sesR), sesS = lapTeks_(q.sesS), sesT = lapTeks_(q.sesT);
    var adaSeb = !!(sebR || sebS || sebT), adaSes = !!(sesR || sesS || sesT);
    if (!adaSeb && !adaSes) return;
    var gar = lapTeks_(q.noGardu);
    if (out.length) out.push('');
    if (pm.length > 1 && gar) out.push('Gardu ' + gar + ':');
    var kHdr = 'Beban Sebelum';
    var kR = 'R : ' + amp(sebR);
    var kS = 'S : ' + amp(sebS);
    var kT = 'T : ' + amp(sebT);
    var lebarKiri = Math.max(kHdr.length, kR.length, kS.length, kT.length) + 2;
    out.push(padRight(kHdr, lebarKiri) + 'Beban Sesudah');
    out.push(padRight(kR, lebarKiri) + 'R : ' + amp(sesR));
    out.push(padRight(kS, lebarKiri) + 'S : ' + amp(sesS));
    out.push(padRight(kT, lebarKiri) + 'T : ' + amp(sesT));
  });
  return out;
}

/** Blok pekerjaan + material (+ grounding & pemerataan bila ada) untuk seksi Jaringan / Non-Teknik pada Laporan UIW. */
function blokPekerjaanMaterialUiw_(daftarPg) {
  var L = [];
  var semuaPk = [], semuaMt = [], semuaGr = [], semuaPm = [];
  (daftarPg || []).forEach(function (pg) {
    (pg.pekerjaan || []).forEach(function (pk) {
      semuaPk.push(pk.nama + (pk.hasil ? ' : ' + pk.hasil : ''));
      (pk.material || []).forEach(function (m) {
        semuaMt.push(m.nama + (m.hasil ? ' : ' + m.hasil : ''));
      });
      barisGroundingUiw_(pk).forEach(function (b) { semuaGr.push(b); });
      barisPemerataanUiw_(pk).forEach(function (b) { semuaPm.push(b); });
    });
  });
  if (!semuaPk.length) {
    L.push('Pekerjaan : -');
  } else {
    L.push('Pekerjaan :');
    semuaPk.forEach(function (t, i) { L.push((i + 1) + '. ' + t); });
  }
  if (!semuaMt.length) {
    L.push('Material : -');
  } else {
    L.push('Material :');
    semuaMt.forEach(function (t) { L.push('- ' + t); });
  }
  if (semuaGr.length) {
    L.push('');
    semuaGr.forEach(function (b) { L.push(b); });
  }
  if (semuaPm.length) {
    L.push('');
    semuaPm.forEach(function (b) { L.push(b); });
  }
  return L;
}

/** d: { tanggal, ulp, row (dataRowLaporan_), hartek (dataHartekLaporan_), c4aUp3: [...], target: {rabas, tebang} } */
function teksUp3_(d) {
  var L = [];
  L.push('*Laporan Harian Keandalan Distribusi*');
  L.push('Hari ' + tglIndo_(d.tanggal));
  L.push('');
  L.push('ULP ' + d.ulp);
  L.push('');
  // A. Gangguan: modul belum di v2
  L.push('*A. GANGGUAN PENYULANG* \u26A1');
  L.push('');
  L.push('- PMT : - Kali');
  L.push('- Section : - kali');
  L.push('');
  L.push('*Komulatif*');
  L.push('- PMT : - kali');
  L.push('- Section : - kali');
  L.push('');
  // B. ROW (v2)
  L.push('*B. ROW* \uD83C\uDF34');
  L.push('');
  var peny = Object.keys(d.row.perPenyulang).sort();
  var tR = bagiTarget_(d.target.rabas, peny.length), tT = bagiTarget_(d.target.tebang, peny.length);
  peny.forEach(function (p, i) {
    var h = d.row.perPenyulang[p];
    L.push(lapPenyBlok_(p, [{ label: 'Rabas', satuan: 'Gawang', target: tR[i], rlz: h.rabas },
                            { label: 'Tebang', satuan: 'Batang', target: tT[i], rlz: h.tebang }]));
    L.push('');
  });
  if (!peny.length) {
    L.push(lapPenyBlok_(null, [{ label: 'Rabas', satuan: 'Gawang' }, { label: 'Tebang', satuan: 'Batang' }]));
    L.push('');
  }
  L.push('*Komulatif*');
  L.push('- Rabas : ' + (d.row.komulatif.rabas || 0) + ' Gawang');
  L.push('- Tebang : ' + (d.row.komulatif.tebang || 0) + ' Batang');
  L.push('');
  // C. Hartek (v0.98.7: dari SiSi_Hartek bila aktif)
  L.push('*C. Hartek* \uD83D\uDD27');
  L.push('');
  var htk = d.hartek || (d.row && d.row.hartek) || null;
  var penyH = htk && htk.perPenyulang ? Object.keys(htk.perPenyulang).sort() : [];
  if (penyH.length) {
    penyH.forEach(function (p) {
      var x = htk.perPenyulang[p];
      L.push(lapPenyBlok_(p, [{ label: 'Gardu', satuan: 'Unit', target: x.gardu, rlz: x.gardu },
                              { label: 'Jaringan', satuan: 'Gawang', target: x.jaringan, rlz: x.jaringan }]));
      L.push('');
    });
  } else {
    L.push(lapPenyBlok_(null, [{ label: 'Gardu', satuan: 'Unit' }, { label: 'Jaringan', satuan: 'Gawang' }]));
    L.push('');
  }
  L.push('*Komulatif*');
  if (htk && htk.aktif) {
    L.push('- Gardu : ' + (htk.komulatif.gardu || 0) + ' Unit');
    L.push('- Jaringan : ' + (htk.komulatif.jaringan || 0) + ' Gawang');
  } else {
    L.push('- Gardu : - Unit');
    L.push('- Jaringan : - Gawang');
  }
  L.push('');
  // D. Inspeksi (v1.0.6): Jaringan = total tiang per penyulang (Gawang), target = realisasi.
  // v1.0.8: Gardu = jumlah gardu yang sudah ada LWBP (Unit), target tetap LAP_TARGET_GARDU_ per penyulang bila ada realisasi (v1).
  L.push('*D. Inspeksi* \uD83D\uDD2D');
  L.push('');
  var ins = (d.row && d.row.inspeksi) || { perPenyulang: {}, komulatif: { jaringan: 0 } };
  var insG = (d.row && d.row.inspeksiGardu) || { perPenyulang: {}, komulatif: 0 };
  var insPeny = Object.keys(ins.perPenyulang);
  Object.keys(insG.perPenyulang).forEach(function (p) { if (insPeny.indexOf(p) === -1) insPeny.push(p); });
  insPeny.sort();
  if (insPeny.length) {
    insPeny.forEach(function (p) {
      var x = ins.perPenyulang[p] || {}, gd = insG.perPenyulang[p] || 0;
      L.push(lapPenyBlok_(p, [{ label: 'Gardu', satuan: 'Unit', target: gd ? LAP_TARGET_GARDU_ : '', rlz: gd },
                              { label: 'Jaringan', satuan: 'Gawang', target: x.jaringan, rlz: x.jaringan }]));
      L.push('');
    });
  } else {
    L.push(lapPenyBlok_(null, [{ label: 'Gardu', satuan: 'Unit' }, { label: 'Jaringan', satuan: 'Gawang' }]));
    L.push('');
  }
  L.push('*Komulatif*');
  L.push('- Jaringan : ' + lapAngka_(ins.komulatif.jaringan, 'Gawang'));
  L.push('- Gardu : ' + lapAngka_(insG.komulatif, 'Unit'));
  L.push('');
  // E. C4A format UP3 (lap_C4A_UP3), satu blok per penyulang. Keterangan tidak masuk WA.
  L.push('*E. C4A* \uD83E\uDE7A');
  if (!d.c4aUp3.length) L.push('- Nihil');
  d.c4aUp3.forEach(function (c, i) {
    if (i > 0) L.push('');
    L.push('Penyulang ' + c.penyulang);
    L.push('- Realisasi : ' + angkaKoma_(c.realisasiKms) + ' kmS');
    L.push('- Temuan : ' + strip_(c.temuan));
    L.push('- Tindak Lanjut : ' + strip_(c.tindakLanjut));
    L.push('- Eksekusi : ' + strip_(c.eksekusi));
  });
  L.push('');
  L.push('*F. P0 Yantek*');
  L.push('Realisasi - Titik');
  L.push('');
  L.push('*G. Tindak Lanjut*');
  L.push('-');
  L.push('');
  L.push('#Jaringan Andal#');
  L.push('#Gaspol#');
  return L.join('\n');
}

/** d: { tanggal, ulp, row, hartek, c4aUiw, cuaca } */
function teksUiw_(d) {
  var htk = d.hartek || (d.row && d.row.hartek) || null;
  var L = [];
  L.push('*ULP ' + String(d.ulp).toUpperCase() + '*');
  L.push('');
  L.push('\uD83D\uDCC5 Hari / Tanggal : ' + tglIndo_(d.tanggal));
  L.push('\uD83D\uDC77 Tim ROW : ' + d.row.tim.length + ' Tim');
  L.push('\uD83D\uDC77 Tim Hartek : ' + (htk && htk.aktif ? htk.timLapor : '-') + ' Tim');
  L.push('\uD83C\uDF24\uFE0F Cuaca : ' + (String(d.cuaca || '').trim() || '-'));
  L.push(LAP_SEP_);
  L.push('\uD83C\uDF3F CARE FOR ASSET');
  // v1.0.6: CARE FOR ASSET dari Inspeksi Jaringan (per penyulang, format v1). Tanpa data inspeksi = C4A manual.
  var care = (d.row && d.row.inspeksi && d.row.inspeksi.care) || [];
  var grup = care.length ? care.map(function (c) {
    return { penyulang: c.penyulang, sections: [c.section], tiang: c.tiang, peralatan: c.peralatan, row: c.row };
  }) : grupC4a_(d.c4aUiw);
  if (grup.length) {
    grup.forEach(function (g) {
      L.push('');
      L.push('Penyulang : ' + g.penyulang);
      L.push('Section : ' + (g.sections.join(', ') || '-'));
      L.push('Panjang : ' + kmsTeks_(g.tiang, false));
      L.push('');
      L.push('\uD83D\uDD0E Temuan');
      L.push('');
      L.push('Peralatan : ' + g.peralatan + ' Titik');
      L.push('ROW : ' + g.row + ' Titik');
    });
  } else {
    L.push('');
    L.push('Penyulang : -');
    L.push('Section : -');
    L.push('Panjang : -');
    L.push('');
    L.push('\uD83D\uDD0E Temuan');
    L.push('');
    L.push('Peralatan : - Titik');
    L.push('ROW : - Titik');
  }
  L.push(LAP_SEP_);
  L.push('\uD83C\uDF3F REALISASI ROW');
  if (d.row.tim.length) {
    d.row.tim.forEach(function (t) {
      L.push('');
      L.push('\uD83D\uDD39 ' + labelTimRow_(t.nama, t.kode));
      t.penyulang.forEach(function (p, i) {
        if (i > 0) L.push('');
        L.push('- Penyulang : ' + p.penyulang);
        L.push('- Section : ' + (p.sectionUiw || p.section || '-'));
        L.push('- Realisasi');
        L.push('> Rabas : ' + p.rabas + ' Gawang');
        L.push('> Tebang : ' + p.tebang + ' Batang');
      });
    });
  } else {
    L.push('');
    L.push('\uD83D\uDD39 TIM ROW');
    L.push('- Penyulang : -');
    L.push('- Section : -');
    L.push('- Realisasi');
    L.push('> Rabas : - Gawang');
    L.push('> Tebang : - Batang');
  }
  L.push(LAP_SEP_);
  L.push('\u26A1 REALISASI PEKERJAAN HARTEK');
  L.push('Penyulang : ' + (htk && htk.penyulangUiw && htk.penyulangUiw.length ? htk.penyulangUiw.join(', ') : '-'));
  L.push('Section : ' + (htk && htk.sectionUiw && htk.sectionUiw.length ? htk.sectionUiw.join(', ') : '-'));
  L.push(LAP_SEP_);
  L.push('\uD83D\uDD27 PEKERJAAN JARINGAN');
  blokPekerjaanMaterialUiw_(htk ? htk.jaringan : []).forEach(function (b) { L.push(b); });
  L.push(LAP_SEP_);
  L.push('\uD83D\uDCCC PEKERJAAN GARDU');
  if (htk && htk.gardu && htk.gardu.length) {
    htk.gardu.forEach(function (g, idx) {
      if (idx > 0) L.push('');
      L.push('Gardu : *' + (g.noGardu || '-') + '*');
      L.push('Pekerjaan :');
      if (!g.pekerjaan || !g.pekerjaan.length) {
        L.push('-');
      } else {
        g.pekerjaan.forEach(function (pk, j) {
          L.push((j + 1) + '. ' + pk.nama + (pk.hasil ? ' : ' + pk.hasil : ''));
        });
      }
      var matG = [], grG = [], pmG = [];
      (g.pekerjaan || []).forEach(function (pk) {
        (pk.material || []).forEach(function (m) {
          matG.push(m.nama + (m.hasil ? ' : ' + m.hasil : ''));
        });
        barisGroundingUiw_(pk).forEach(function (b) { grG.push(b); });
        barisPemerataanUiw_(pk).forEach(function (b) { pmG.push(b); });
      });
      if (matG.length) {
        L.push('Material :');
        matG.forEach(function (m) { L.push('- ' + m); });
      }
      if (grG.length) {
        L.push('');
        grG.forEach(function (b) { L.push(b); });
      }
      if (pmG.length) {
        L.push('');
        pmG.forEach(function (b) { L.push(b); });
      }
    });
  } else {
    L.push('Pekerjaan : -');
    L.push('Material : -');
  }
  L.push(LAP_SEP_);
  L.push(htk && htk.aktif ? 'PEKERJAAN NON-TEKNIK' : '\uD83D\uDCCB PEKERJAAN NON-TEKNIK');
  blokPekerjaanMaterialUiw_(htk ? htk.nonTeknik : []).forEach(function (b) { L.push(b); });
  L.push(LAP_SEP_);
  L.push('Demikian laporan disampaikan. Terima kasih. \u26A1');
  return L.join('\n');
}

/**
 * Konfigurasi per laporan. sheet = induk harian, c4a = sheet C4A, baris = konversi baris C4A, validasi = cek input HP.
 */
function bagianLap_(bagian) {
  if (bagian === 'UP3') {
    return { bagian: 'UP3', menu: LAP_MENU_.UP3, sheet: LAP_SHEET_.up3, c4a: LAP_SHEET_.c4aUp3, kolomTeks: 'Laporan UP3',
             dariBaris: c4aUp3DariBaris_, validasi: validasiC4aUp3_, cuaca: false };
  }
  if (bagian === 'UIW') {
    return { bagian: 'UIW', menu: LAP_MENU_.UIW, sheet: LAP_SHEET_.uiw, c4a: LAP_SHEET_.c4aUiw, kolomTeks: 'Laporan UIW',
             dariBaris: c4aUiwDariBaris_, validasi: validasiC4aUiw_, cuaca: true };
  }
  throw new SisiError_('PILIHAN_TIDAK_VALID', 'bagian');
}

/** Baca sheet SiSi_Laporan (kecil). nama = daftar sheet. Header wajib sama persis skema. */
function bacaSheetLaporan_(nama) {
  var c = cfg_();
  if (!c.LAPORAN_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'LAPORAN_SHEET_ID');
  var skema = skemaHeader_().LAPORAN_SHEET_ID, hasil = {};
  nama.forEach(function (n) {
    var t = tabel_('LAPORAN_SHEET_ID', n);
    var ada = t.header.slice();
    while (ada.length && !ada[ada.length - 1]) ada.pop();
    if (ada.join('|') !== skema[n].join('|')) throw new SisiError_('CONFIG_TIDAK_VALID', 'header ' + n);
    hasil[n] = t;
  });
  return hasil;
}

/** Baris AKTIF satu tanggal di lap_Harian_UP3 / lap_Harian_UIW (t). Lebih dari satu = DATA_GANDA (fail closed). */
function barisHarian_(t, tanggal) {
  var cocok = t.rows.filter(function (r) { return r.lap_id && r.status === 'AKTIF' && tglSel_(r.Tanggal) === tanggal; });
  if (cocok.length > 1) throw new SisiError_('DATA_GANDA', t.nama + ' ' + tanggal);
  return cocok[0] || null;
}

function lapN_(v) { return Number(v) || 0; }
function lapTeks_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

function c4aUiwDariBaris_(r) {
  return { id: String(r.c4a_id), sectionId: String(r.section_id || ''), penyulang: lapTeks_(r.Penyulang),
           section: lapTeks_(r.Section), jumlahTiang: lapN_(r['Jumlah Tiang']),
           panjangKms: Math.round(lapN_(r['Jumlah Tiang']) * LAP_KMS_PER_TIANG_ * 100) / 100,
           temuanPeralatan: lapN_(r['Temuan Peralatan']), temuanRow: lapN_(r['Temuan ROW']), eksekusi: lapN_(r.Eksekusi),
           keterangan: lapTeks_(r.Keterangan) };
}

function c4aUp3DariBaris_(r) {
  return { id: String(r.c4a_id), penyulang: lapTeks_(r.Penyulang), realisasiKms: lapN_(r['Realisasi kmS']),
           temuan: lapTeks_(r.Temuan), tindakLanjut: lapTeks_(r['Tindak Lanjut']), eksekusi: lapTeks_(r.Eksekusi),
           keterangan: lapTeks_(r.Keterangan) };
}

/** C4A AKTIF milik satu baris harian (lap), urut baris sheet. */
function barisC4a_(t, lap) {
  if (!lap) return [];
  return t.rows.filter(function (r) { return r.c4a_id && r.status === 'AKTIF' && String(r.lap_id) === String(lap.lap_id); })
    .sort(function (a, b) { return a._baris - b._baris; });
}

/** Status sub-tim ROW (db_Tim aktif) untuk tanggal itu: BELUM / LAPOR (header ada) / SIAP (WA tim siap kirim). */
function statusTimRow_(ctx, tanggal) {
  var perTim = {};
  Object.keys(ctx.byId.header).forEach(function (id) {
    var h = ctx.byId.header[id];
    if (h.status !== 'AKTIF' || tanggalDariKode_(h['Kode Header']) !== tanggal) return;
    var s = String(h['WA Text'] || '') ? 'SIAP' : 'LAPOR';
    var tid = String(h.tim_id);
    if (perTim[tid] !== 'SIAP') perTim[tid] = s;
  });
  return tabel_('MASTER_SHEET_ID', 'db_Tim').rows
    .filter(function (t) { return t.tim_id && isAktif_(t.aktif) && String(t.jenis) === 'ROW'; })
    .sort(function (a, b) { return pad2_(a.kode) < pad2_(b.kode) ? -1 : 1; })
    .map(function (t) { return { timId: String(t.tim_id), nama: String(t.nama), kode: pad2_(t.kode), status: perTim[String(t.tim_id)] || 'BELUM' }; });
}

function ringkasLap_(lap) {
  if (!lap) return null;
  var ubah = keDate_(lap['Timestamp Update']);
  var o = { lapId: String(lap.lap_id), revision: Number(lap.revision) || 0, diubahOleh: lapTeks_(lap['Input Oleh']),
            diubahPada: ubah ? ubah.toISOString() : '' };
  if (Object.prototype.hasOwnProperty.call(lap, 'Cuaca')) o.cuaca = lapTeks_(lap.Cuaca);
  return o;
}

/**
 * Data modul ROW untuk satu tanggal (satu kali baca jendela ROW): hitungan per penyulang + per tim, komulatif,
 * target harian, status tim. Dipakai kedua laporan.
 */
function dataRowHari_(sesi, tanggal, waktu) {
  var c = cfg_();
  if (!c.ROW_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'ROW_SHEET_ID');
  var ctx = konteksSync_(bacaJendelaRow_(waktu), masterRow_(), sesi, c, waktu);
  var row = dataRowLaporan_(ctx, tanggal);
  row.target = targetRowHarian_();
  row.statusTim = statusTimRow_(ctx, tanggal);
  row.hartek = dataHartekLaporan_(tanggal);
  row.inspeksi = dataInspeksiHari_(tanggal);   // v1.0.6
  row.inspeksiGardu = dataInspeksiGarduHari_(tanggal);   // v1.0.8
  return row;
}

/** Laporan UP3 dari modul ROW + Hartek + C4A UP3. */
function laporanUp3_(row, tanggal, c4aUp3, hartek) {
  return teksUp3_({ tanggal: tanggal, ulp: cfg_().ULP_NAMA, row: row, hartek: hartek || (row && row.hartek), c4aUp3: c4aUp3, target: row.target });
}

/** Laporan UIW dari modul ROW + Hartek + Cuaca + C4A UIW. */
function laporanUiw_(row, tanggal, c4aUiw, cuaca, hartek) {
  return teksUiw_({ tanggal: tanggal, ulp: cfg_().ULP_NAMA, row: row, hartek: hartek || (row && row.hartek), c4aUiw: c4aUiw, cuaca: cuaca });
}

function teksBagian_(B, row, tanggal, c4a, cuaca) {
  return B.bagian === 'UP3' ? laporanUp3_(row, tanggal, c4a) : laporanUiw_(row, tanggal, c4a, cuaca);
}

/** Ringkasan ROW untuk layar HP (per penyulang + target). */
function ringkasRow_(row) {
  var peny = Object.keys(row.perPenyulang).sort();
  var tR = bagiTarget_(row.target.rabas, peny.length), tT = bagiTarget_(row.target.tebang, peny.length);
  return { penyulang: peny.map(function (p, i) {
             return { penyulang: p, rabas: row.perPenyulang[p].rabas, tebang: row.perPenyulang[p].tebang, targetRabas: tR[i], targetTebang: tT[i] };
           }), komulatif: row.komulatif, timLapor: row.tim.length, target: row.target };
}

/** Ringkasan Hartek untuk layar HP (status tim, per penyulang, komulatif). */
function ringkasHartek_(htk) {
  if (!htk || !htk.aktif) return null;
  var peny = Object.keys(htk.perPenyulang || {}).sort();
  return {
    status: htk.statusTim || 'BELUM',
    timLapor: htk.timLapor || 0,
    penyulang: peny.map(function (p) {
      return { penyulang: p, gardu: htk.perPenyulang[p].gardu || 0, jaringan: htk.perPenyulang[p].jaringan || 0 };
    }),
    komulatif: htk.komulatif || { gardu: 0, jaringan: 0 }
  };
}

/** Hasil satu laporan (get & simpan). ganti = { c4a, cuaca } yang belum ditulis; kosong = dari sheet. */
function susunBagian_(sesi, B, tanggal, waktu, T, ganti) {
  ganti = ganti || {};
  var lap = barisHarian_(T[B.sheet], tanggal);
  // v0.62.9: belum ada baris harian tapi simpan pertama sempat menulis C4A = tampilkan C4A itu (tertunda)
  var induk = lap || { lap_id: lapIdBaru_(T[B.sheet], B.bagian, tanggal) };
  var c4a = ganti.c4a || barisC4a_(T[B.c4a], induk).map(B.dariBaris);
  var cuaca = B.cuaca ? (ganti.cuaca !== undefined ? ganti.cuaca : (lap ? lapTeks_(lap.Cuaca) : '')) : undefined;
  var row = dataRowHari_(sesi, tanggal, waktu);
  var h = {
    bagian: B.bagian, tanggal: tanggal, sumber: 'LANGSUNG', hariIni: tanggal === waktu.hariIni,
    bisaUbah: tanggal === waktu.hariIni && (sesi.role === 'ADMIN' || sesi.role === 'SUPER') &&
              aksesUntuk_(sesi.role, sesi.jenisTim, B.menu) === 'UBAH',
    laporan: ringkasLap_(lap), revision: lap ? Number(lap.revision) || 0 : 0, c4a: c4a,
    tertunda: !ganti.c4a && simpanTertunda_(T[B.c4a], lap, induk.lap_id),
    statusTim: row.statusTim, row: ringkasRow_(row), waText: teksBagian_(B, row, tanggal, c4a, cuaca)
  };
  var rkH = ringkasHartek_(row.hartek);
  if (rkH) h.hartek = rkH;
  if (B.cuaca) h.cuaca = cuaca;
  return h;
}

/** Baca satu laporan. Tanggal > 7 hari = salinan tersimpan (hanya lihat). */
function getLaporanBagian_(sesi, data, bagian) {
  peranLaporanUp3_(sesi, false);
  var B = bagianLap_(bagian);
  var d = validasi_(data, { tanggal: { tipe: 'tanggal' } });
  var waktu = waktuRow_();
  var tanggal = d.tanggal || waktu.hariIni;
  if (tanggal > waktu.hariIni) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', tanggal);
  var w = stopwatch_();
  var T = bacaSheetLaporan_([B.sheet, B.c4a]);
  w('baca');
  var hasil;
  if (tanggal >= waktu.batasTgl) {
    hasil = susunBagian_(sesi, B, tanggal, waktu, T);
  } else {
    var lap = barisHarian_(T[B.sheet], tanggal);
    hasil = { bagian: B.bagian, tanggal: tanggal, sumber: 'ARSIP', hariIni: false, bisaUbah: false, laporan: ringkasLap_(lap),
              revision: null, c4a: barisC4a_(T[B.c4a], lap).map(B.dariBaris), statusTim: null, row: null,
              waText: lap ? lapTeks_(lap[B.kolomTeks]) : '' };
    if (B.cuaca) hasil.cuaca = lap ? lapTeks_(lap.Cuaca) : '';
  }
  w('susun');
  if (cfg_().ENV === 'staging') hasil._waktu = w.ringkas();
  return hasil;
}

function getLaporanUp3_(sesi, data) { peranLaporanUp3_(sesi, false); return getLaporanBagian_(sesi, data, 'UP3'); }
function getLaporanUiw_(sesi, data) { peranLaporanUp3_(sesi, false); return getLaporanBagian_(sesi, data, 'UIW'); }

function daftarC4a_(daftar, nama) {
  if (!Array.isArray(daftar)) throw new SisiError_('TIPE_SALAH', nama);
  if (daftar.length > LAP_C4A_MAKS_) throw new SisiError_('TERLALU_BANYAK', nama);
  var id = {};
  return function (x) {
    if (id[x.id]) throw new SisiError_('ID_GANDA', x.id);
    id[x.id] = true;
  };
}

/** C4A UIW: id unik, section aktif di master, section tidak dobel. */
function validasiC4aUiw_(daftar, master) {
  var cekId = daftarC4a_(daftar, 'c4aUiw'), sek = {};
  return daftar.map(function (mentah) {
    var x = validasi_(mentah, SKEMA_C4A_);
    cekId(x);
    var j = master.jaringan[x.sectionId];
    if (!j || !j.aktif) throw new SisiError_('SECTION_TIDAK_ADA', x.sectionId);
    if (sek[x.sectionId]) throw new SisiError_('SECTION_GANDA', j.section);
    sek[x.sectionId] = true;
    return { id: x.id, sectionId: x.sectionId, penyulang: j.penyulang, section: j.section, jumlahTiang: x.jumlahTiang,
             panjangKms: Math.round(x.jumlahTiang * LAP_KMS_PER_TIANG_ * 100) / 100,
             temuanPeralatan: x.temuanPeralatan || 0, temuanRow: x.temuanRow || 0, eksekusi: x.eksekusi || 0,
             keterangan: x.keterangan || '' };
  });
}

/** C4A UP3: id unik, penyulang aktif di master (nama resmi), 1 baris per penyulang, kmS dibulatkan 2 desimal. */
function validasiC4aUp3_(daftar, master) {
  var cekId = daftarC4a_(daftar, 'c4aUp3'), resmi = {}, dipakai = {};
  Object.keys(master.jaringan).forEach(function (k) {
    var j = master.jaringan[k];
    if (j.aktif && j.penyulang) resmi[j.penyulang.toLowerCase()] = j.penyulang;
  });
  return daftar.map(function (mentah) {
    var x = validasi_(mentah, SKEMA_C4A_UP3_);
    cekId(x);
    var nama = resmi[x.penyulang.toLowerCase()];
    if (!nama) throw new SisiError_('PENYULANG_TIDAK_ADA', x.penyulang);
    if (dipakai[nama]) throw new SisiError_('PENYULANG_GANDA', nama);
    dipakai[nama] = true;
    return { id: x.id, penyulang: nama, realisasiKms: Math.round(x.realisasiKms * 100) / 100,
             temuan: x.temuan || '', tindakLanjut: x.tindakLanjut || '', eksekusi: x.eksekusi || '', keterangan: x.keterangan || '' };
  });
}

/**
 * Rencana tulis satu sheet C4A: baris AKTIF laporan itu yang tidak dikirim = BATAL, yang berubah = ubah kolom,
 * id baru = tambah. kunci = kolom yang tidak boleh berubah setelah dibuat (section_id / Penyulang).
 */
function rencanaC4a_(t, lapId, daftar, kolom, kunci, umum) {
  var milik = {};
  t.rows.forEach(function (r) { if (r.c4a_id) milik[String(r.c4a_id)] = r; });
  daftar.forEach(function (x) {
    var r = milik[x.id];
    if (r && (String(r.lap_id) !== lapId || r.status !== 'AKTIF')) throw new SisiError_('ID_GANDA', x.id);
  });
  var dikirim = {};
  daftar.forEach(function (x) { dikirim[x.id] = x; });
  var ubah = [], baru = [], batal = 0;
  t.rows.forEach(function (r) {
    if (!r.c4a_id || r.status !== 'AKTIF' || String(r.lap_id) !== lapId) return;
    var x = dikirim[String(r.c4a_id)];
    if (!x) { ubah.push({ r: r, u: { status: 'BATAL', 'Timestamp Update': umum.sekarang, diubah_oleh: umum.userId } }); batal++; return; }
    kunci(r, x);
    var isi = kolom(x), beda = {};
    Object.keys(isi).forEach(function (k) { if (!samaNilai_(r[k], isi[k])) beda[k] = isi[k]; });
    if (Object.keys(beda).length) {
      beda['Input Oleh'] = umum.oleh; beda['Timestamp Update'] = umum.sekarang; beda.diubah_oleh = umum.userId;
      ubah.push({ r: r, u: beda });
    }
    delete dikirim[String(r.c4a_id)];
  });
  Object.keys(dikirim).forEach(function (id) {
    var x = dikirim[id];
    baru.push(Object.assign({ Tanggal: umum.tanggal }, kolom(x), umum.tambahan ? umum.tambahan(x) : {}, {
      'Input Oleh': umum.oleh, Timestamp: umum.sekarang, 'Timestamp Update': umum.sekarang, c4a_id: x.id, lap_id: lapId,
      status: 'AKTIF', revision: 1, dibuat_oleh: umum.userId, diubah_oleh: umum.userId }));
  });
  return { t: t, ubah: ubah, baru: baru, batal: batal };
}

/** v0.62.9: semua ubah + BATAL + baris baru C4A dalam satu panggilan tulis (tulisBlok_). */
function tulisC4a_(rencana) {
  if (!rencana.ubah.length && !rencana.baru.length) return;
  var akhir = rencana.t.rows.length ? Math.max.apply(null, rencana.t.rows.map(function (r) { return r._baris; })) : 1;
  rencana.baru.forEach(function (o, i) { o.No = akhir + i; });
  tulisBlok_(rencana.t, rencana.ubah, rencana.baru);
}

/**
 * v0.62.9: lap_id baris harian baru = turunan bagian + tanggal (bukan uuid acak), jadi simpan ulang setelah gagal
 * memakai id yang sama dan C4A yang sempat tertulis tetap terhubung (dulu: id baru -> ID_GANDA).
 * Tanggal yang sudah punya baris (non-AKTIF) diberi urutan -2, -3, ... Dipanggil hanya kalau belum ada baris AKTIF.
 */
function lapIdBaru_(t, bagian, tanggal) {
  var ada = {}, n = 0;
  t.rows.forEach(function (r) {
    if (!r.lap_id) return;
    ada[String(r.lap_id)] = true;
    if (tglSel_(r.Tanggal) === tanggal) n++;
  });
  var dasar = 'LAP-' + bagian + '-' + tanggal, id = n ? dasar + '-' + (n + 1) : dasar;
  while (ada[id]) { n++; id = dasar + '-' + (n + 1); }
  return id;
}

/**
 * v0.62.9: simpan terakhir belum selesai? C4A ditulis dulu, baris harian (revision) terakhir sebagai tanda selesai.
 * Tertunda = ada C4A laporan itu yang lebih baru dari baris harian (toleransi 2 dtk), atau C4A tanpa baris harian.
 * Isi C4A saat tertunda tetap lengkap (satu panggilan tulis), hanya belum dikunci; simpan ulang menyelesaikannya.
 */
function simpanTertunda_(tC4a, lap, lapId) {
  var milik = tC4a.rows.filter(function (r) { return r.c4a_id && String(r.lap_id) === String(lapId); });
  if (!milik.length) return false;
  if (!lap) return true;
  var h = keDate_(lap['Timestamp Update']), batas = h ? h.getTime() + 2000 : 0;
  return milik.some(function (r) { var u = keDate_(r['Timestamp Update']); return !!u && u.getTime() > batas; });
}

/** Baris harian baru di t (lap_Harian_UP3 / lap_Harian_UIW). Wajib di dalam lock. */
function barisHarianBaru_(t, tanggal, lapId, isi, olehId) {
  var no = t.rows.length ? Math.max.apply(null, t.rows.map(function (r) { return r._baris; })) : 1;
  var obj = Object.assign({ No: no, Tanggal: tanggal, Hari: hariDari_(tanggal), ULP: cfg_().ULP_NAMA, Timestamp: isi['Timestamp Update'],
                            lap_id: lapId, status: 'AKTIF', revision: 1, dibuat_oleh: olehId }, isi);
  tambahBaris_(t, obj);
  return obj;
}

/** Rencana C4A satu laporan (kolom + kunci berbeda per laporan). */
function rencanaC4aBagian_(bagian, t, lapId, daftar, umum) {
  if (bagian === 'UP3') {
    return rencanaC4a_(t, lapId, daftar,
      function (x) { return { 'Realisasi kmS': x.realisasiKms, Temuan: x.temuan, 'Tindak Lanjut': x.tindakLanjut, Eksekusi: x.eksekusi,
                              Keterangan: x.keterangan }; },
      function (r, x) { if (lapTeks_(r.Penyulang).toLowerCase() !== x.penyulang.toLowerCase()) throw new SisiError_('KOLOM_TERKUNCI', 'Penyulang'); },
      Object.assign({ tambahan: function (x) { return { Penyulang: x.penyulang }; } }, umum));
  }
  return rencanaC4a_(t, lapId, daftar,
    function (x) { return { Penyulang: x.penyulang, Section: x.section, 'Jumlah Tiang': x.jumlahTiang, 'Panjang kmS': x.panjangKms,
                            'Temuan Peralatan': x.temuanPeralatan, 'Temuan ROW': x.temuanRow, Eksekusi: x.eksekusi, Keterangan: x.keterangan }; },
    function (r, x) { if (!samaNilai_(r.section_id, x.sectionId)) throw new SisiError_('KOLOM_TERKUNCI', 'section_id'); },
    Object.assign({ tambahan: function (x) { return { section_id: x.sectionId }; } }, umum));
}

/**
 * Simpan satu laporan hari ini (v0.57 endpoint terpisah).
 *   simpanLaporanUp3: { tanggal, revision, c4a }          -> lap_Harian_UP3 + lap_C4A_UP3
 *   simpanLaporanUiw: { tanggal, revision, cuaca, c4a }   -> lap_Harian_UIW + lap_C4A_UIW
 * revision = revision baris harian laporan itu yang dilihat HP (0 = belum ada); beda = KONFLIK_REVISION.
 * Laporan lain tidak dibaca dan tidak ditulis, jadi 2 orang bisa bekerja bersamaan.
 * c4a = daftar LENGKAP; baris yang tidak ada lagi = BATAL (tidak dihapus). Semua baca dulu, tulis di akhir.
 */
function simpanLaporanBagian_(sesi, data, platform, bagian) {
  peranLaporanUp3_(sesi, true);
  var B = bagianLap_(bagian);
  var boleh = B.cuaca ? ['tanggal', 'revision', 'cuaca', 'c4a'] : ['tanggal', 'revision', 'c4a'];
  Object.keys(data).forEach(function (k) { if (boleh.indexOf(k) === -1) throw new SisiError_('FIELD_TIDAK_DIKENAL', k); });
  var d = validasi_({ tanggal: data.tanggal, revision: data.revision, cuaca: data.cuaca }, {
    tanggal: { tipe: 'tanggal', wajib: true }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 },
    cuaca: { tipe: 'teks', maks: 40 } });
  var waktu = waktuRow_();
  if (d.tanggal !== waktu.hariIni) throw new SisiError_('HANYA_HARI_INI', d.tanggal);
  // v0.62.7 (audit 7 Okt 2026): c4a WAJIB dikirim (kontrak API). Dulu tidak dikirim = dianggap [] dan SEMUA C4A laporan
  // itu jadi BATAL diam-diam. Kosongkan semua tetap bisa dengan mengirim c4a: [].
  if (!Array.isArray(data.c4a)) throw new SisiError_('FIELD_WAJIB', 'c4a');
  var daftar = B.validasi(data.c4a, masterRow_());
  var cuaca = B.cuaca ? (d.cuaca || '') : undefined;

  return denganLock_(function () {
    var w = stopwatch_();
    var T = bacaSheetLaporan_([B.sheet, B.c4a]);
    var tLog = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var tHarian = T[B.sheet];
    var lap = barisHarian_(tHarian, d.tanggal);
    if ((lap ? Number(lap.revision) || 0 : 0) !== d.revision) throw new SisiError_('KONFLIK_REVISION', B.bagian + ' ' + d.tanggal);
    var lapId = lap ? String(lap.lap_id) : lapIdBaru_(tHarian, B.bagian, d.tanggal);
    var sekarang = new Date(), oleh = sesi.nama || sesi.username;
    var rencana = rencanaC4aBagian_(B.bagian, T[B.c4a], lapId, daftar, { sekarang: sekarang, oleh: oleh, userId: sesi.userId, tanggal: d.tanggal });
    var hasil = susunBagian_(sesi, B, d.tanggal, waktu, T, { c4a: daftar, cuaca: cuaca });
    w('baca');

    var isi = { 'Input Oleh': oleh, 'Timestamp Update': sekarang, diubah_oleh: sesi.userId };
    isi[B.kolomTeks] = hasil.waText;
    if (B.cuaca) { isi.Cuaca = cuaca; isi['Tim ROW'] = hasil.row.timLapor; }
    // ---- tulis, hanya sheet laporan ini ----
    // v0.62.9 (audit 7 Okt 2026): C4A DULU (satu panggilan), baris harian + revision TERAKHIR (satu panggilan) sebagai
    // tanda simpan selesai. Gagal di antaranya = revision belum naik, simpan ulang payload yang sama aman (id sama,
    // tidak dobel). Dulu baris harian ditulis duluan: gagal di C4A = revision sudah naik, ulang = KONFLIK_REVISION.
    tulisC4a_(rencana);
    if (lap) tulisBlok_(tHarian, [{ r: lap, u: isi }], []);
    else lap = barisHarianBaru_(tHarian, d.tanggal, lapId, isi, sesi.userId);
    auditLog_(sesi, 'SIMPAN_LAPORAN_' + B.bagian, d.tanggal, 'c4a=' + daftar.length + ' baru=' + rencana.baru.length +
              ' batal=' + rencana.batal + (B.cuaca ? ' cuaca=' + (cuaca ? 'ya' : 'kosong') : ''), platform, tLog);
    w('tulis');
    hasil.laporan = ringkasLap_(lap);
    hasil.revision = hasil.laporan.revision;
    hasil.tertunda = false;
    if (cfg_().ENV === 'staging') hasil._waktu = w.ringkas();
    return hasil;
  });
}

function simpanLaporanUp3_(sesi, data, platform) { peranLaporanUp3_(sesi, true); return simpanLaporanBagian_(sesi, data, platform, 'UP3'); }
function simpanLaporanUiw_(sesi, data, platform) { peranLaporanUp3_(sesi, true); return simpanLaporanBagian_(sesi, data, platform, 'UIW'); }

/**
 * Buat baris harian hari ini di lap_Harian_UP3 dan lap_Harian_UIW kalau belum ada (salinan teks awal dari modul ROW,
 * Cuaca kosong, Input Oleh / dibuat_oleh = SISTEM). Idempoten. Hasil: { up3, uiw } = 'DIBUAT' | 'SUDAH_ADA'.
 */
function buatBarisHarian_(tanggal) {
  return denganLock_(function () {
    var T = bacaSheetLaporan_([LAP_SHEET_.up3, LAP_SHEET_.uiw]);
    var tUp3 = T[LAP_SHEET_.up3], tUiw = T[LAP_SHEET_.uiw];
    var adaUp3 = !!barisHarian_(tUp3, tanggal), adaUiw = !!barisHarian_(tUiw, tanggal);
    if (adaUp3 && adaUiw) return { up3: 'SUDAH_ADA', uiw: 'SUDAH_ADA' };
    var sistem = { userId: 'SISTEM', username: 'sistem', nama: 'SISTEM', role: 'SUPER', jenisTim: '' };
    var row = dataRowHari_(sistem, tanggal, waktuRow_());
    var isi = function () { return { 'Input Oleh': 'SISTEM', 'Timestamp Update': new Date(), diubah_oleh: 'SISTEM' }; };
    if (!adaUp3) barisHarianBaru_(tUp3, tanggal, lapIdBaru_(tUp3, 'UP3', tanggal), Object.assign(isi(), { 'Laporan UP3': laporanUp3_(row, tanggal, []) }), 'SISTEM');
    if (!adaUiw) {
      barisHarianBaru_(tUiw, tanggal, lapIdBaru_(tUiw, 'UIW', tanggal), Object.assign(isi(), { Cuaca: '', 'Tim ROW': row.tim.length,
        'Laporan UIW': laporanUiw_(row, tanggal, [], '') }), 'SISTEM');
    }
    return { up3: adaUp3 ? 'SUDAH_ADA' : 'DIBUAT', uiw: adaUiw ? 'SUDAH_ADA' : 'DIBUAT' };
  });
}

/** Pemicu harian (dan bisa dijalankan manual dari editor): baris lap_Harian_UP3 + lap_Harian_UIW hari ini. */
function ADMIN_buatBarisHarian(e) {
  pastikanPemilik_();
  return jalanPemicu_('ADMIN_buatBarisHarian', e, buatBarisHarianPemicu_);   // v0.84.0: waktu jalan dicatat + rem kuota
}

/** v0.84.0: isi ADMIN_buatBarisHarian (dibungkus jalanPemicu_). */
function buatBarisHarianPemicu_() {
  var tanggal = tglJakarta_(new Date());
  var h = buatBarisHarian_(tanggal);
  console.log(tanggal + ': lap_Harian_UP3 ' + h.up3 + ', lap_Harian_UIW ' + h.uiw);
}

function hapusPemicuLaporan_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'ADMIN_buatBarisHarian') ScriptApp.deleteTrigger(t);
  });
}

/** Editor: pasang pemicu harian 00.05 WIB pembuat baris harian (pemicu lama diganti), lalu buat baris hari ini. */
function ADMIN_pasangPemicuLaporan() {
  pastikanPemilik_();
  hapusPemicuLaporan_();
  ScriptApp.newTrigger('ADMIN_buatBarisHarian').timeBased().everyDays(1).atHour(0).nearMinute(5).inTimezone('Asia/Jakarta').create();
  var tanggal = tglJakarta_(new Date());
  var h = buatBarisHarian_(tanggal);
  console.log('Pemicu harian ADMIN_buatBarisHarian (00.05 WIB) dipasang. ' + tanggal + ': lap_Harian_UP3 ' + h.up3 + ', lap_Harian_UIW ' + h.uiw);
}

/** Editor: hapus pemicu harian laporan. */
function ADMIN_berhentiPemicuLaporan() {
  pastikanPemilik_();
  hapusPemicuLaporan_();
  console.log('Pemicu ADMIN_buatBarisHarian dihapus.');
}
