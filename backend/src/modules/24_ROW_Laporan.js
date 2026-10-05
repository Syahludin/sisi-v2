/**
 * Laporan ROW + teks WA (PRD 4. Fitur > F-ROW-LAPORAN, 6. Endpoint > getLaporanRow). Keputusan 3 Okt 2026:
 *  - Rincian WA dipisah per penyulang lalu per section (3 Okt 2026); Section realisasi = daftar section, tanpa rentang.
 *  - Format WA lama dipertahankan. Revisi 3 Okt 2026: label Tebang Sedang/Besar kembali ke teks KELILING
 *    versi lama (kll>78,5cm <157cm / >157cm = keliling dari Ø 25-50 / Ø >50). Input tetap diameter.
 *    Satuan tetap dari db_Jenis_Pekerjaan. Menggantikan label "Ø 25-50 cm" dari master.
 *  - Tanpa sheet row_Laporan_Harian di fase 1: WA ditulis ke row_Header "WA Text", dihitung ulang
 *    tiap sync/upload foto yang menyentuh header itu (dan header hari berikutnya di bulan yang sama).
 *  - Total bulanan = tanggal 1 s.d. tanggal laporan, dari kode (R<tim>-16130YYMM...).
 *  - WA kosong sampai ada >= 1 eksekusi AKTIF foto lengkap; penyulang tanpa hitungan tidak ditampilkan.
 *  - WA kosong sampai kolom header lengkap: Koordinat Awal, Koordinat Akhir, KM Awal, KM Akhir.
 *    Kendala opsional (tampil "-"). Revisi 3 Okt 2026, menggantikan "koordinat/KM kosong tampil -".
 *  - getLaporanRow hanya tanggal dalam 7 hari. PETUGAS = tim sendiri; ADMIN/ADMIN_ES/SUPER = semua sub-tim.
 */
var BULAN_ID_ = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
var KOLOM_HITUNG_ = ['Rabas', 'Sedang', 'Besar'];
var HEADER_WAJIB_WA_ = { 'Koordinat Awal': 'koordinatAwal', 'Koordinat Akhir': 'koordinatAkhir', 'KM Awal': 'kmAwal', 'KM Akhir': 'kmAkhir' };

function tanggalPanjang_(iso) {
  return hariDari_(iso) + ', ' + iso.slice(8, 10) + ' ' + BULAN_ID_[Number(iso.slice(5, 7)) - 1] + ' ' + iso.slice(0, 4);
}

/** Teks label WA versi lama (keliling). baris = rincian per penyulang, total = baris Total Bulanan. */
var LABEL_WA_ROW_ = {
  Rabas: { baris: 'Rabas / Pangkas', total: 'Rabas / Pangkas', satuan: 'Gawang' },
  Sedang: { baris: 'Tebang Sedang kll>78,5cm <157cm', total: 'Tebang Pohon Keliling >78,5cm <157cm', satuan: 'Batang' },
  Besar: { baris: 'Tebang Besar >157cm', total: 'Tebang Pohon Keliling >157cm', satuan: 'Batang' }
};

/** Label + satuan per kolom hitungan. Label = teks keliling lama; satuan dari master bila ada. */
function labelJenisRow_(master) {
  var hasil = {};
  KOLOM_HITUNG_.forEach(function (k) {
    hasil[k] = { label: LABEL_WA_ROW_[k].baris, total: LABEL_WA_ROW_[k].total, satuan: LABEL_WA_ROW_[k].satuan };
  });
  ((master && master.jenis) || []).filter(function (j) { return j.modul === 'ROW' && isAktif_(j.aktif); })
    .sort(function (a, b) { return a.urutan - b.urutan; })
    .forEach(function (j) {
      var kol = kolomHitungJenis_(j);
      if (kol && hasil[kol] && !hasil[kol]._master && j.satuan) { hasil[kol].satuan = String(j.satuan); hasil[kol]._master = true; }
    });
  return hasil;
}

/** Kendala di WA selalu SATU baris (v0.47): baris baru digabung "; " supaya tidak bisa meniru baris Total Bulanan. */
function kendalaWa_(v) {
  var t = String(v === null || v === undefined ? '' : v).replace(/[\u0000-\u001F\u007F\u2028\u2029]+/g, '\n')
    .split('\n').map(function (b) { return b.trim(); }).filter(function (b) { return b; }).join('; ');
  return strip_(t);
}

function strip_(v) { return v === '' || v === null || v === undefined ? '-' : String(v); }

/** Hitung isi laporan satu header dari konteks (baris sudah dihitung ulang). */
function laporanHeader_(ctx, h) {
  var hid = String(h.header_id);
  var kodeH = String(h['Kode Header']);
  var tanggal = tanggalDariKode_(kodeH);
  var real = Object.keys(ctx.byId.realisasi).map(function (id) { return ctx.byId.realisasi[id]; })
    .filter(function (r) { return String(r.header_id) === hid && r.status === 'AKTIF'; })
    .sort(function (a, b) { return String(a['Kode Pekerjaan']) < String(b['Kode Pekerjaan']) ? -1 : 1; });
  var idReal = {};
  real.forEach(function (r) { idReal[String(r.realisasi_id)] = true; });
  var menunggu = Object.keys(ctx.byId.eksekusi).filter(function (id) {
    var e = ctx.byId.eksekusi[id];
    return idReal[String(e.realisasi_id)] && e.status === 'AKTIF' && !isAktif_(e.foto_lengkap);
  }).length;
  var angka = function (r) { var o = {}; KOLOM_HITUNG_.forEach(function (k) { o[k] = Number(r[k]) || 0; }); return o; };
  // Hitungan per section (dari eksekusi AKTIF foto lengkap), dipisah per penyulang. Keputusan 3 Okt 2026.
  var jenisById = {};
  ((ctx.master && ctx.master.jenis) || []).forEach(function (j) { jenisById[String(j.jenis_id)] = j; });
  var jaringan = (ctx.master && ctx.master.jaringan) || {};
  var perSection = {};   // realisasi_id -> { section_id -> hitungan }
  Object.keys(ctx.byId.eksekusi).forEach(function (id) {
    var e = ctx.byId.eksekusi[id];
    var rid = String(e.realisasi_id);
    if (!idReal[rid] || e.status !== 'AKTIF' || !isAktif_(e.foto_lengkap)) return;
    var kol = kolomHitungJenis_(jenisById[String(e.jenis_id)]);
    if (!kol) return;
    var sid = String(e.section_id || '');
    var m = perSection[rid] = perSection[rid] || {};
    var x = m[sid] = m[sid] || { sectionId: sid, section: (jaringan[sid] && jaringan[sid].section) || String(e.Section || ''),
                                 rabas: 0, sedang: 0, besar: 0 };
    x[kol === 'Rabas' ? 'rabas' : kol === 'Sedang' ? 'sedang' : 'besar']++;
  });
  var detail = real.map(function (r) {
    var a = angka(r);
    var m = perSection[String(r.realisasi_id)] || {};
    var sections = Object.keys(m).sort(urutSection_(jaringan)).map(function (sid) { return m[sid]; });
    return { kode: String(r['Kode Pekerjaan']), penyulang: String(r.Penyulang), section: String(r.Section || ''),
             rabas: a.Rabas, sedang: a.Sedang, besar: a.Besar, sections: sections };
  }).filter(function (d) { return d.rabas + d.sedang + d.besar > 0; });
  var total = { rabas: 0, sedang: 0, besar: 0 };
  detail.forEach(function (d) { total.rabas += d.rabas; total.sedang += d.sedang; total.besar += d.besar; });

  var awalanBulan = kodeH.slice(0, 13);   // R01-16130 + YYMM
  var bulanan = { rabas: 0, sedang: 0, besar: 0 };
  Object.keys(ctx.byId.realisasi).forEach(function (id) {
    var r = ctx.byId.realisasi[id];
    var k = String(r['Kode Pekerjaan']);
    if (r.status !== 'AKTIF' || k.slice(0, 13) !== awalanBulan || tanggalDariKode_(k) > tanggal) return;
    var a = angka(r);
    bulanan.rabas += a.Rabas; bulanan.sedang += a.Sedang; bulanan.besar += a.Besar;
  });

  var kurang = Object.keys(HEADER_WAJIB_WA_).filter(function (k) {
    return h[k] === '' || h[k] === null || h[k] === undefined;
  }).map(function (k) { return HEADER_WAJIB_WA_[k]; });
  var peringatan = [];
  if (kurang.length) peringatan.push('HEADER_BELUM_LENGKAP');
  if (!detail.length) peringatan.push('BELUM_ADA_FOTO_LENGKAP');
  if (menunggu) peringatan.push('MENUNGGU_FOTO');
  var siap = detail.length > 0 && kurang.length === 0;

  var teks = '';
  if (siap) {
    var L = labelJenisRow_(ctx.master);
    var baris = function (no, kol, n) { return no + '. ' + L[kol].label + ' : ' + n + (L[kol].satuan ? ' ' + L[kol].satuan : ''); };
    var bagian = [
      '*Realisasi Team ' + h['Sub-Tim'] + ' ULP ' + h.ULP + '*',
      '-------------------------------------------------',
      'Hari / Tanggal : ' + tanggalPanjang_(tanggal),
      'Koordinat Awal : ' + strip_(h['Koordinat Awal']),
      'Koordinat Akhir : ' + strip_(h['Koordinat Akhir']),
      '',
      'Km Sebelum / Sesudah : ' + strip_(h['KM Awal']) + ' / ' + strip_(h['KM Akhir']),
      ''
    ];
    // WA dipisah per penyulang, lalu per section di dalamnya (3 Okt 2026). Section tanpa hitungan tidak tampil.
    detail.forEach(function (d, i) {
      bagian.push((detail.length > 1 ? (i + 1) + '. ' : '') + 'Penyulang : *' + d.penyulang + '*');
      var blok = d.sections.length ? d.sections : [{ section: d.section, rabas: d.rabas, sedang: d.sedang, besar: d.besar }];
      blok.forEach(function (x) {
        bagian.push('Section : ' + strip_(x.section));
        bagian.push('Realisasi ROW');
        bagian.push(baris(1, 'Rabas', x.rabas));
        bagian.push(baris(2, 'Sedang', x.sedang));
        bagian.push(baris(3, 'Besar', x.besar));
        bagian.push('');
      });
    });
    bagian.push('Kendala : ' + kendalaWa_(h.Kendala));
    bagian.push('');
    bagian.push('Total Bulanan ' + L.Rabas.total + ' : ' + bulanan.rabas + (L.Rabas.satuan ? ' ' + L.Rabas.satuan : ''));
    bagian.push('Total Bulanan ' + L.Sedang.total + ' : ' + bulanan.sedang + (L.Sedang.satuan ? ' ' + L.Sedang.satuan : ''));
    bagian.push('Total Bulanan ' + L.Besar.total + ' : ' + bulanan.besar + (L.Besar.satuan ? ' ' + L.Besar.satuan : ''));
    teks = bagian.join('\n');
  }
  return { headerId: hid, kodeHeader: kodeH, tanggal: tanggal, timId: String(h.tim_id), subTim: String(h['Sub-Tim']),
           status: String(h.status), siapKirim: siap, waText: teks, headerKurang: kurang, penyulang: detail,
           total: total, bulanan: bulanan, menungguFoto: menunggu, peringatan: peringatan };
}

/**
 * Tulis ulang WA Text header yang tersentuh + header tim yang sama di bulan yang sama dengan tanggal
 * sesudahnya (total bulanannya ikut berubah). Dipanggil di dalam lock, sebelum tulisSync_.
 */
function hitungUlangWa_(ctx) {
  var target = {};
  Object.keys(ctx.kotorHeader).forEach(function (hid) {
    var h = ctx.byId.header[hid];
    if (!h) return;
    target[hid] = h;
    var tgl = tanggalDariKode_(h['Kode Header']), awalan = String(h['Kode Header']).slice(0, 13);
    Object.keys(ctx.byId.header).forEach(function (id) {
      var x = ctx.byId.header[id];
      var k = String(x['Kode Header']);
      if (k.slice(0, 13) === awalan && String(x.tim_id) === String(h.tim_id) && tanggalDariKode_(k) > tgl) target[id] = x;
    });
  });
  Object.keys(target).forEach(function (hid) {
    var h = target[hid];
    var teks = h.status === 'AKTIF' ? laporanHeader_(ctx, h).waText : '';
    if (samaNilai_(h['WA Text'], teks)) return;
    h['WA Text'] = teks;
    h['TimeStamp Update'] = ctx.waktu.sekarang;
    if (!h._baru) {
      h._ubah = h._ubah || {};
      h._ubah['WA Text'] = teks;
      h._ubah['TimeStamp Update'] = ctx.waktu.sekarang;
    }
  });
}

function getLaporanRow_(sesi, data) {
  var d = validasi_(data, { tanggal: { tipe: 'tanggal' }, timId: { tipe: 'uuid' } });
  var c = cfg_();
  if (!c.ROW_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'ROW_SHEET_ID');
  var timFilter = timLaporan_(sesi, d.timId);
  var w = stopwatch_();
  var waktu = waktuRow_();
  var tanggal = d.tanggal || waktu.hariIni;
  if (tanggal < waktu.batasTgl || tanggal > waktu.hariIni) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', tanggal);
  var master = masterRow_();
  var T = bacaJendelaRow_(waktu);
  w('baca');
  var ctx = konteksSync_(T, master, sesi, c, waktu);
  var laporan = Object.keys(ctx.byId.header).map(function (id) { return ctx.byId.header[id]; })
    .filter(function (h) {
      return h.status === 'AKTIF' && tanggalDariKode_(h['Kode Header']) === tanggal && (!timFilter || String(h.tim_id) === timFilter);
    })
    .sort(function (a, b) { return String(a['Kode Header']) < String(b['Kode Header']) ? -1 : 1; })
    .map(function (h) { return laporanHeader_(ctx, h); });
  w('susun');
  var hasil = { tanggal: tanggal, laporan: laporan };
  if (c.ENV === 'staging') hasil._waktu = w.ringkas();
  return hasil;
}

/** PETUGAS: hanya tim sendiri (tim lain = tolak). ADMIN / ADMIN_ES / SUPER: semua sub-tim atau timId pilihan. */
function timLaporan_(sesi, timId) {
  if (sesi.role === 'PETUGAS') {
    if (sesi.jenisTim !== 'ROW' || !sesi.timId) throw new SisiError_('AKSES_DITOLAK', 'bukan petugas ROW');
    if (timId && timId !== sesi.timId) throw new SisiError_('AKSES_DITOLAK', 'tim lain');
    return sesi.timId;
  }
  return timId || null;   // akses menu sudah dicek guard
}

var ARSIP_MAKS_HARI_ = 31;

/**
 * Arsip laporan ROW (tab Arsip di HP): header AKTIF dalam rentang tanggal, maks 31 hari, sampai KEMARIN
 * (hari H tidak termasuk; hari H ada di tab Hari ini). Revisi 3 Okt 2026. HP mengunduh rentang panjang per bulan
 * lalu menyimpannya lokal (kartu tahun > bulan > hari). rincian = per penyulang (realisasi AKTIF).
 * Hanya baca. WA diambil dari kolom WA Text (sudah dihitung server saat sync/upload foto), tidak dihitung ulang.
 * Membaca row_Header + row_Realisasi penuh (bukan jendela 7 hari) karena arsip boleh lebih tua dari 7 hari.
 */
function getArsipRow_(sesi, data) {
  var d = validasi_(data, { dari: { tipe: 'tanggal', wajib: true }, sampai: { tipe: 'tanggal', wajib: true }, timId: { tipe: 'uuid' } });
  var c = cfg_();
  if (!c.ROW_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'ROW_SHEET_ID');
  var timFilter = timLaporan_(sesi, d.timId);
  var waktu = waktuRow_();
  if (d.dari > d.sampai) throw new SisiError_('RENTANG_TIDAK_VALID', d.dari + '>' + d.sampai);
  if (d.sampai >= waktu.hariIni) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', d.sampai);   // hari H tidak masuk arsip
  var hari = Math.round((Date.parse(d.sampai + 'T00:00:00Z') - Date.parse(d.dari + 'T00:00:00Z')) / 864e5) + 1;
  if (hari > ARSIP_MAKS_HARI_) throw new SisiError_('RENTANG_TERLALU_PANJANG', String(hari));

  var w = stopwatch_();
  var H = tabel_('ROW_SHEET_ID', ROW_SHEET_.header).rows;
  var R = tabel_('ROW_SHEET_ID', ROW_SHEET_.realisasi).rows;
  w('baca');
  var header = H.filter(function (h) {
    if (!h.header_id || h.status !== 'AKTIF') return false;
    var t = tanggalDariKode_(h['Kode Header']);
    return t && t >= d.dari && t <= d.sampai && (!timFilter || String(h.tim_id) === timFilter);
  });
  var perHeader = {};
  header.forEach(function (h) { perHeader[String(h.header_id)] = { penyulang: 0, rabas: 0, sedang: 0, besar: 0, rincian: [] }; });
  R.forEach(function (r) {
    var x = perHeader[String(r.header_id)];
    if (!x || r.status !== 'AKTIF') return;
    var a = { rabas: Number(r.Rabas) || 0, sedang: Number(r.Sedang) || 0, besar: Number(r.Besar) || 0 };
    x.penyulang++;
    x.rabas += a.rabas; x.sedang += a.sedang; x.besar += a.besar;
    x.rincian.push({ kode: String(r['Kode Pekerjaan']), penyulang: String(r.Penyulang || ''), section: String(r.Section || ''),
                     rabas: a.rabas, sedang: a.sedang, besar: a.besar });
  });
  var teks = function (v) { return v === null || v === undefined ? '' : String(v); };
  var angka = function (v) { return v === '' || v === null || v === undefined ? null : Number(v); };
  var laporan = header
    .sort(function (a, b) { return String(a['Kode Header']) < String(b['Kode Header']) ? 1 : -1; })
    .map(function (h) {
      var x = perHeader[String(h.header_id)];
      var wa = teks(h['WA Text']);
      return { headerId: String(h.header_id), kodeHeader: String(h['Kode Header']), tanggal: tanggalDariKode_(h['Kode Header']),
               timId: String(h.tim_id), subTim: teks(h['Sub-Tim']),
               koordinatAwal: teks(h['Koordinat Awal']), koordinatAkhir: teks(h['Koordinat Akhir']),
               kmAwal: angka(h['KM Awal']), kmAkhir: angka(h['KM Akhir']), kendala: teks(h.Kendala),
               penyulang: x.penyulang, total: { rabas: x.rabas, sedang: x.sedang, besar: x.besar },
               rincian: x.rincian.sort(function (p, q) { return p.kode < q.kode ? -1 : 1; }),
               siapKirim: wa !== '', waText: wa };
    });
  w('susun');
  var hasil = { dari: d.dari, sampai: d.sampai, laporan: laporan };
  if (c.ENV === 'staging') hasil._waktu = w.ringkas();
  return hasil;
}
