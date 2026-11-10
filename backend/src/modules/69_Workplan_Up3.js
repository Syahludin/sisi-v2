/**
 * v1.0.60: Workplan UP3 (menu OPS_WORKPLAN_UP3, khusus web admin). Realisasi ROW dan Hartek per Penyulang + Section + Jenis
 * Kegiatan, satu kolom per tanggal rentang, dengan susunan kolom seperti sheet WORKPLAN PRIORITAS PENYULANG. Sheet workplan
 * hanya acuan susunan kolom: tidak dibaca dan tidak ditulis oleh sistem, admin menyalin angkanya sendiri dari website.
 *   - Tab ROW (row_Realisasi AKTIF): Pangkas = Rabas, Tebang = Sedang + Besar, satuan titik.
 *   - Tab HARKONS (db_Hartek_Pekerjaan, header AKTIF): jumlah_pekerjaan per nama pekerjaan, satuan dari data.
 * Baris hanya untuk kombinasi yang punya realisasi di rentang. Penyulang / Section sama tanpa beda huruf besar/kecil dan spasi.
 */
var WORKPLAN_TAB_ = { ROW: true, HARKONS: true };
var WORKPLAN_MAKS_HARI_ = 62;

function wpTeks_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function wpNorm_(v) { return wpTeks_(v).toLowerCase().replace(/\s+/g, ' '); }

/** Semua tanggal 'yyyy-MM-dd' dari..sampai (termasuk ujung). Murni. */
function wpDaftarTanggal_(dari, sampai) {
  var out = [], t = Date.parse(dari + 'T00:00:00Z'), akhir = Date.parse(sampai + 'T00:00:00Z');
  for (; t <= akhir; t += 864e5) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/**
 * Susun baris workplan dari data realisasi. Murni (diuji).
 * data: ROW = [{tanggal, penyulang, section, rabas, sedang, besar}]; HARKONS = [{tanggal, penyulang, section, pekerjaan, satuan, jumlah}].
 * Hasil: [{ no, penyulang, section, jenis, satuan, realisasi: [nilai per tanggal], total }] urut penyulang, section, jenis
 * (ROW: Pangkas sebelum Tebang). Kombinasi bernilai 0 di seluruh rentang tidak ditampilkan.
 */
function susunWorkplan_(tab, tanggal, data) {
  var idx = {}, per = {}, urut = [];
  tanggal.forEach(function (t, i) { idx[t] = i; });
  var tambah = function (x, jenis, satuan, nilai) {
    if (!(x.tanggal in idx) || !nilai) return;
    var k = wpNorm_(x.penyulang) + '||' + wpNorm_(x.section) + '||' + wpNorm_(jenis);
    if (!per[k]) {
      per[k] = { penyulang: wpTeks_(x.penyulang), section: wpTeks_(x.section), jenis: wpTeks_(jenis), satuan: satuan,
                 realisasi: tanggal.map(function () { return 0; }), total: 0 };
      urut.push(k);
    }
    per[k].realisasi[idx[x.tanggal]] += nilai;
    per[k].total += nilai;
  };
  data.forEach(function (x) {
    if (!wpTeks_(x.penyulang)) return;
    if (tab === 'ROW') {
      tambah(x, 'Pangkas', 'titik', Number(x.rabas) || 0);
      tambah(x, 'Tebang', 'titik', (Number(x.sedang) || 0) + (Number(x.besar) || 0));
    } else if (wpTeks_(x.pekerjaan)) {
      tambah(x, x.pekerjaan, wpTeks_(x.satuan), Number(x.jumlah) || 0);
    }
  });
  var kunci = function (k) {
    var p = per[k];
    return [wpNorm_(p.penyulang), wpNorm_(p.section), p.jenis === 'Pangkas' ? '0' : wpNorm_(p.jenis)].join('||');
  };
  return urut.sort(function (a, b) { var x = kunci(a), y = kunci(b); return x < y ? -1 : x > y ? 1 : 0; }).map(function (k, i) {
    var p = per[k];
    p.realisasi = p.realisasi.map(function (v) { return Math.round(v * 100) / 100; });
    p.total = Math.round(p.total * 100) / 100;
    p.no = i + 1;
    return p;
  });
}

/** Realisasi modul v2 dalam rentang, bentuk masukan susunWorkplan_. Modul yang belum diatur di server = daftar kosong. */
function sumberWorkplan_(tab, dari, sampai) {
  var c = cfg_(), dalam = function (t) { return !!t && t >= dari && t <= sampai; }, hasil = [];
  if (tab === 'ROW') {
    if (!c.ROW_SHEET_ID) return hasil;
    // Per section dihitung dari eksekusi (kolom Section realisasi hanya daftar gabungan "A - B, C - D"). Sama dengan
    // hitungUlangRealisasi_: hanya eksekusi AKTIF dengan foto lengkap, Rabas / Sedang / Besar dari nama jenis pekerjaan.
    var master = masterRow_(), jenisById = {}, induk = {};
    master.jenis.forEach(function (j) { jenisById[j.jenis_id] = j; });
    tabel_('ROW_SHEET_ID', ROW_SHEET_.realisasi).rows.forEach(function (r) {
      var t = tanggalDariKode_(r['Kode Pekerjaan']);
      if (r.status === 'AKTIF' && dalam(t)) induk[String(r.realisasi_id)] = { tanggal: t, penyulang: r.Penyulang };
    });
    tabel_('ROW_SHEET_ID', ROW_SHEET_.eksekusi).rows.forEach(function (e) {
      var r = induk[String(e.realisasi_id)];
      if (!r || e.status !== 'AKTIF' || !isAktif_(e.foto_lengkap)) return;
      var kol = kolomHitungJenis_(jenisById[String(e.jenis_id)]);
      if (!kol) return;
      var j = master.jaringan[String(e.section_id)];
      var o = { tanggal: r.tanggal, penyulang: r.penyulang, section: j ? j.section : e.Section, rabas: 0, sedang: 0, besar: 0 };
      o[kol.toLowerCase()] = 1;
      hasil.push(o);
    });
    return hasil;
  }
  if (!c.HARTEK_SHEET_ID) return hasil;
  var aktif = {};
  tabelHartek_(HARTEK_SHEET_.HEADER).rows.forEach(function (h) {
    if (wpTeks_(h.status || 'AKTIF') === 'AKTIF') aktif[String(h.header_id)] = true;
  });
  tabelHartek_(HARTEK_SHEET_.PEKERJAAN).rows.forEach(function (r) {
    var t = tglHartek_(r);
    if (!aktif[String(r.header_id)] || !dalam(t)) return;
    hasil.push({ tanggal: t, penyulang: r.penyulang, section: r.section, pekerjaan: r.pekerjaan, satuan: r.satuan_pekerjaan, jumlah: r.jumlah_pekerjaan });
  });
  return hasil;
}

/**
 * getWorkplanUp3 { tab: 'ROW' | 'HARKONS', dari, sampai } (maks 62 hari) -> { tab, dari, sampai, tanggal: ['yyyy-MM-dd'],
 *   baris: [{ no, penyulang, section, jenis, satuan, realisasi: [per tanggal], total }] }.
 */
function getWorkplanUp3_(sesi, data) {
  peranLaporanUp3_(sesi, false);
  var d = validasi_(data, {
    tab: { tipe: 'teks', wajib: true, maks: 10 },
    dari: { tipe: 'tanggal', wajib: true },
    sampai: { tipe: 'tanggal', wajib: true }
  });
  // review 8 Nov 2026: hasOwnProperty, bukan WORKPLAN_TAB_[tab] ('constructor' / 'toString' dulu lolos lewat prototipe)
  if (!Object.prototype.hasOwnProperty.call(WORKPLAN_TAB_, d.tab)) throw new SisiError_('FORMAT_SALAH', 'tab');
  if (d.dari > d.sampai) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', 'dari > sampai');
  if (selisihHari_(d.dari, d.sampai) >= WORKPLAN_MAKS_HARI_) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', 'maks ' + WORKPLAN_MAKS_HARI_ + ' hari');
  var tanggal = wpDaftarTanggal_(d.dari, d.sampai);
  return { tab: d.tab, dari: d.dari, sampai: d.sampai, tanggal: tanggal, baris: susunWorkplan_(d.tab, tanggal, sumberWorkplan_(d.tab, d.dari, d.sampai)) };
}
