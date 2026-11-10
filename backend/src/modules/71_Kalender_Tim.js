/**
 * v1.0.17 (permintaan Master Guswan 22 Okt 2026): KALENDER TIM. Semua modul tim (ROW, Hartek, Yandal, Inspeksi Jaringan,
 * Inspeksi Gardu) melihat rincian jadwal dan pekerjaan bulan yang dipilih:
 *   PEKERJAAN : laporan / pekerjaan tim sendiri per hari (ringkasan dari sheet modulnya)
 *   WO        : WO tindak lanjut yang diterima / diselesaikan tim (ROW, Hartek, Yandal)
 *   PADAM     : jadwal padam ULP (SiSi_JadwalPadam, tanpa yang dibatalkan) supaya tim tahu rencana pemadaman
 * Hanya baca, data tim sesi sendiri (tanpa menu; v1.0.18: akun non-tim hanya menerima jadwal padam). Bagian yang spreadsheet-nya
 * belum diatur dilewati (kalender tetap tampil sebagian).
 */

var KALENDER_JENIS_TIM_ = ['ROW', 'HARTEK', 'YANDAL', 'INSPEKSI_JARINGAN', 'INSPEKSI_GARDU'];

/**
 * v1.0.18 (permintaan Master Guswan 22 Okt 2026): kalender juga tampil di Beranda untuk semua akun. Petugas tim modul di atas =
 * pekerjaan + WO tim sendiri + jadwal padam; akun lain (admin, petugas tanpa tim modul) = jadwal padam saja.
 */
function kalenderTimSendiri_(sesi) {
  return !!(sesi && sesi.role === 'PETUGAS' && sesi.timId && KALENDER_JENIS_TIM_.indexOf(sesi.jenisTim) !== -1);
}

function wajibSesiKalender_(sesi) {
  if (!sesi || ROLE_VALID_().indexOf(sesi.role) === -1) throw new SisiError_('AKSES_DITOLAK', 'kalender');
}

/** Jalankan [fn]; spreadsheet / tab belum diatur = [] (bagian kalender itu dilewati). */
function bagianKalender_(fn) {
  try { return fn(); } catch (e) {
    if (e && (e.kode === 'CONFIG_TIDAK_LENGKAP' || e.kode === 'SHEET_TIDAK_ADA' || e.kode === 'STRUKTUR_BERUBAH')) return [];
    throw e;
  }
}

function dalamBulanKalender_(tgl, bulan) { return String(tgl || '').slice(0, 7) === bulan; }

/** Pekerjaan tim per hari sesuai jenis tim. */
function pekerjaanKalender_(sesi, bulan) {
  var tim = String(sesi.timId), hasil = [];
  if (sesi.jenisTim === 'ROW') {
    var H = tabel_('ROW_SHEET_ID', ROW_SHEET_.header).rows, R = tabel_('ROW_SHEET_ID', ROW_SHEET_.realisasi).rows;
    H.filter(function (h) { return String(h.tim_id) === tim && h.status === 'AKTIF' && dalamBulanKalender_(tanggalDariKode_(h['Kode Header']), bulan); })
      .forEach(function (h) {
        var r = R.filter(function (x) { return String(x.header_id) === String(h.header_id) && x.status === 'AKTIF'; });
        var j = function (k) { return r.reduce(function (a, x) { return a + (Number(x[k]) || 0); }, 0); };
        hasil.push({ tanggal: tanggalDariKode_(h['Kode Header']), jenis: 'PEKERJAAN', judul: 'Laporan ROW ' + String(h['Kode Header']),
                     rincian: r.length + ' penyulang · Rabas ' + j('Rabas') + ' · Sedang ' + j('Sedang') + ' · Besar ' + j('Besar') });
      });
  } else if (sesi.jenisTim === 'HARTEK') {
    var hh = tabelHartek_(HARTEK_SHEET_.HEADER).rows.filter(function (h) { return String(h.tim_id) === tim && h.status === 'AKTIF' && dalamBulanKalender_(tglHartek_(h), bulan); });
    if (hh.length) {
      var pg = tabelHartek_(HARTEK_SHEET_.PG).rows, pk = tabelHartek_(HARTEK_SHEET_.PEKERJAAN).rows;
      hh.forEach(function (h) {
        var pkH = pk.filter(function (x) { return String(x.header_id) === String(h.header_id); });
        var nama = {};
        pkH.forEach(function (x) { var n = String(x.pekerjaan || '').trim(); if (n) nama[n] = (nama[n] || 0) + 1; });
        hasil.push({ tanggal: tglHartek_(h), jenis: 'PEKERJAAN', judul: 'Laporan Hartek ' + String(h.kode_header),
                     rincian: pg.filter(function (x) { return String(x.header_id) === String(h.header_id); }).length + ' lokasi · ' + pkH.length + ' pekerjaan' +
                       (Object.keys(nama).length ? ': ' + Object.keys(nama).slice(0, 4).join(', ') : '') });
      });
    }
  } else if (sesi.jenisTim === 'INSPEKSI_JARINGAN' || sesi.jenisTim === 'INSPEKSI_GARDU') {
    var gardu = sesi.jenisTim === 'INSPEKSI_GARDU';
    var tH = gardu ? tabelInsDu_(INSDU_SHEET_.HEADER) : tabelInsJar_(INSJAR_SHEET_.HEADER);
    var hi = tH.rows.filter(function (h) { return String(h.tim_id) === tim && String(h.status || 'AKTIF') === 'AKTIF' && dalamBulanKalender_(tglInsJar_(h), bulan); });
    if (hi.length) {
      var re = (gardu ? tabelInsDu_(INSDU_SHEET_.REALISASI) : tabelInsJar_(INSJAR_SHEET_.REALISASI)).rows;
      var te = tabelInsJar_(INSJAR_SHEET_.TEMUAN).rows;
      hi.forEach(function (h) {
        var nR = re.filter(function (x) { return String(x.header_id) === String(h.header_id); }).length;
        var nT = te.filter(function (x) { return String(x.header_id) === String(h.header_id); }).length;
        hasil.push({ tanggal: tglInsJar_(h), jenis: 'PEKERJAAN', judul: (gardu ? 'Inspeksi Gardu ' : 'Inspeksi Jaringan ') + String(h.kode_header),
                     rincian: nR + (gardu ? ' gardu' : ' penyulang') + ' · ' + nT + ' temuan' });
      });
    }
  } else if (sesi.jenisTim === 'YANDAL') {
    var per = {};
    bacaSheetYandal_(['yan_P0']).yan_P0.rows.forEach(function (p) {
      if (String(p.tim_id) !== tim || String(p.status || '') === 'BATAL') return;
      var t = tglSel_(p.Tanggal);
      if (!dalamBulanKalender_(t, bulan)) return;
      var x = per[t] || (per[t] = { n: 0, nama: {} });
      x.n++;
      var n = String(p['Nama Pekerjaan'] || '').trim();
      if (n) x.nama[n] = (x.nama[n] || 0) + 1;
    });
    Object.keys(per).forEach(function (t) {
      hasil.push({ tanggal: t, jenis: 'PEKERJAAN', judul: per[t].n + ' P0 Yandal',
                   rincian: Object.keys(per[t].nama).slice(0, 5).map(function (k) { return k + ' ' + per[t].nama[k]; }).join(', ') });
    });
  }
  return hasil;
}

/** WO yang diterima / diselesaikan tim bulan ini (tim tindak lanjut ROW / Hartek / Yandal). */
function woKalender_(sesi, bulan) {
  if (['ROW', 'HARTEK', 'YANDAL'].indexOf(sesi.jenisTim) === -1 || !cfg_().TEMUAN_SHEET_ID) return [];
  var hasil = [];
  tabelInsJar_(INSJAR_SHEET_.TEMUAN).rows.forEach(function (t) {
    if (String(t.tim_tindak_lanjut_id || '') !== String(sesi.timId)) return;
    var lokasi = [t.penyulang, t.section, t.no_gardu ? 'Gardu ' + t.no_gardu : ''].map(function (v) { return String(v || '').trim(); }).filter(String).join(' · ');
    var tgl = function (iso) { var d = new Date(String(iso || '')); return isNaN(d.getTime()) ? '' : tglJakarta_(d); };
    var terima = tgl(t.waktu_diteruskan), selesai = tgl(t.waktu_selesai);
    if (dalamBulanKalender_(terima, bulan)) {
      hasil.push({ tanggal: terima, jenis: 'WO', judul: 'WO diterima: ' + String(t.jenis_temuan || 'Temuan'), rincian: lokasi + ' · ' + String(t.kode_temuan || '') });
    }
    if (String(t.status_wo) === WO_STATUS_.selesai && dalamBulanKalender_(selesai, bulan)) {
      hasil.push({ tanggal: selesai, jenis: 'WO', judul: 'WO selesai: ' + String(t.jenis_temuan || 'Temuan'), rincian: String(t.tindak_lanjut || lokasi) });
    }
  });
  return hasil;
}

/**
 * Jadwal padam ULP bulan ini (tanpa yang dibatalkan).
 * v1.0.21: [padam] = rincian terstruktur untuk kartu pemadaman Beranda (jam, penyulang, section, daerah, dampak);
 * judul / rincian teks tetap untuk app lama.
 */
function padamKalender_(bulan) {
  return jadwalPadamBulan_(bulan).map(function (j) {
    return { tanggal: j.tanggal, jenis: 'PADAM', jam: j.jamPadam, judul: (j.statusPekerjaan === 'Tanpa Padam' ? 'Pekerjaan tanpa padam: ' : 'Padam ') + j.penyulang + ' · ' + j.section,
             rincian: j.jamPadam + ' – ' + j.jamNyala + ' WIB · ' + j.jenis + (j.daerah ? ' · ' + j.daerah : ''), status: j.status,
             padam: { penyulang: j.penyulang, section: j.section, jamPadam: j.jamPadam, jamNyala: j.jamNyala, durasi: j.durasi, pekerjaan: j.jenis,
                      daerah: j.daerah, lokasi: j.lokasi, pelanggan: j.jumlahPelanggan, gardu: j.jumlahGardu, statusPekerjaan: j.statusPekerjaan } };
  });
}

function getKalenderTim_(sesi, data) {
  wajibSesiKalender_(sesi);
  var d = validasi_(data, { bulan: { tipe: 'teks', wajib: true, maks: 7 } });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(d.bulan)) throw new SisiError_('FORMAT_SALAH', 'bulan');
  var tim = kalenderTimSendiri_(sesi);
  // v1.0.20 (rekonstruksi): Beranda membuka kalender tiap kali tampil; isi per tim / umum + bulan di-cache 60 detik
  var kegiatan = cacheJson_('kalender:v2:' + (tim ? 'tim:' + sesi.timId : 'umum') + ':' + d.bulan, 60, function () {
    return kegiatanKalender_(sesi, d.bulan, tim);
  });
  return { bulan: d.bulan, jenisTim: sesi.jenisTim || '', timSendiri: tim, kegiatan: kegiatan };
}

function kegiatanKalender_(sesi, bulan, tim) {
  return []
    .concat(tim ? bagianKalender_(function () { return pekerjaanKalender_(sesi, bulan); }) : [])
    .concat(tim ? bagianKalender_(function () { return woKalender_(sesi, bulan); }) : [])
    .concat(bagianKalender_(function () { return padamKalender_(bulan); }))
    .sort(function (a, b) {
      return a.tanggal.localeCompare(b.tanggal) || String(a.jam || '').localeCompare(String(b.jam || '')) || a.jenis.localeCompare(b.jenis);
    });
}
