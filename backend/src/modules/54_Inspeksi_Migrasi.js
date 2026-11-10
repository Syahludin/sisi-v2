/**
 * v1.0.17 (permintaan Master Guswan 22 Okt 2026): MIGRASI DATA LAMA v1 -> v2 untuk Temuan Inspeksi, Inspeksi Jaringan (Insjar),
 * Inspeksi Gardu (Insdu), dan Jadwal Padam. Pola sama dengan migrasi ROW / P0 / Hartek: Cek (dry-run, laporan) ->
 * Jalan (tulis, idempoten, aman dilanjutkan) -> Hapus (rollback baris MIGRASI, sekali pakai). Sumber HANYA DIBACA.
 *
 * A. Inspeksi (Script Property INSPEKSI_LAMA_SHEET_ID, cadangan MIG_SUMBER_ID), posisi kolom v1 Core/Code.js:
 *      db_Global_Header (kode IJR- / IGD-)  -> insjar_header / db_insdu_header      (COL_INS.HEADER)
 *      db_InsJar_Realisasi                   -> insjar_realisasi                     (COL_INS.REALISASI)
 *      db_InsDu_Realisasi                    -> db_insdu_realisasi                   (COL_INSDU.REALISASI)
 *      db_INS_Temuan                         -> db_temuan_inspeksi (SiSi_Temuan)     (COL_INS.TEMUAN)
 *    - Kode v1 sudah format v2 (IJR- / IGD- / PEG-, -PNY. / -GDU., -TJR.) dan dipakai apa adanya. ID = uuidMig_.
 *    - v1.0.34 (permintaan Master Guswan 25 Okt 2026): induk yang TIDAK ADA di v1 dibuat otomatis (PERINGATAN, bukan karantina):
 *      penyulang utama / gardu tanpa Laporan Utama -> Laporan Utama dari tanggal / tim anaknya; temuan tanpa penyulang
 *      utama / gardu -> penyulang utama / gardu (dan Laporan Utama kalau perlu) dari kolom temuan. Kode induk kosong =
 *      dipotong dari kode anak (-PNY. / -GDU. / -TJR.). Induk yang ADA di v1 tapi dikarantina tetap menahan anaknya.
 *    - Tim: db_Tim jenis INSPEKSI_JARINGAN / INSPEKSI_GARDU (nama / kode Sub-Tim, atau satu-satunya tim jenis itu).
 *    - Temuan PEG (input admin v1) = sumber ADMIN tanpa header / realisasi (sama dengan v2).
 *    - Temuan Selesai di v1 = status_wo SELESAI + tindak_lanjut (jenis pekerjaan + diameter v1). Temuan v1 yang belum
 *      selesai masuk sebagai "Penugasan Tim" tanpa WO (PERINGATAN: teruskan ulang di Penerusan WO) karena alur WO v1
 *      tidak bisa dilanjutkan di HP v2.
 *    - Foto temuan / tiang: link Drive v1 disalin ke kolom *_link (+ *_file_id dari URL bila terbaca).
 *    - Pengukuran Inspeksi Gardu v1 hidup di Master_Gardu (bukan per inspeksi), jadi tidak dimigrasi; header InsDu MIGRASI
 *      dikecualikan dari aturan tunggakan WBP (53_InsDu.js).
 * B. Jadwal Padam (Script Property JADWAL_PADAM_LAMA_SHEET_ID): Rekap_Jadwal_Padam -> db_jadwal_padam,
 *    Master Daerah Padam -> db_Daerah_Padam (SiSi_Master). Dibaca lewat JUDUL kolom (sama dengan v1 _jpGet_).
 *
 * Fungsi editor: ADMIN_migrasiInspeksiCek / Jalan / Hapus, ADMIN_migrasiJadwalPadamCek / Jalan / Hapus.
 */

var MIGINS_OLEH_ = 'MIGRASI';
var MIGINS_BATAS_MS_ = 270000;
var MIGINS_BLOK_ = 200;
var MIGINS_CEK_KOLOM_ = ['jenis', 'kode_lama', 'status', 'alasan'];

/** Posisi kolom v1 (0-based), salinan COL_INS / COL_INSDU SiSi_BackEnd/Core/Code.js + Inspeksi_Gardu/Tek-InsDu-Code.js. */
var MIGINS_KOL_ = {
  header: { kodeHeader: 1, ulp: 2, hari: 3, tanggal: 4, tim: 5, subTim: 6, koordinatAwal: 7, koordinatAkhir: 8, kmAwal: 9, kmAkhir: 10,
            kendala: 11, waText: 12, timestamp: 13, inputBy: 14, timestampUpdate: 15 },
  realisasi: { kodeHeader: 1, kodePekerjaanPeny: 2, hari: 3, tanggal: 4, penyulang: 5, section: 6, segmen: 7, tier: 8, totalTiang: 9,
               jumlahTemuan: 10, inputBy: 11, timestamp: 12 },
  insdu: { kodeHeader: 1, kodePekerjaanGardu: 2, hari: 3, tanggal: 4, penyulang: 5, section: 6, nomorGardu: 7, tier: 8, jumlahTemuan: 9,
           inputBy: 10, timestamp: 11 },
  temuan: { kodeHeader: 1, kodePekerjaanPeny: 2, kodePekerjaan: 3, ulp: 4, hari: 5, tanggal: 6, timInspeksi: 7, objekInspeksi: 8, penyulang: 9,
            section: 10, segmen: 11, nomorTiang: 12, nomorGardu: 13, tier: 14, temuan: 15, fotoTemuan: 16, fotoTemuanUrl: 17, fotoTiang: 18,
            fotoTiangUrl: 19, deskripsi: 20, koordinat: 21, lat: 22, long: 23, inputBy: 24, timestamp: 25, status: 26, forwardBy: 27,
            tglForward: 28, timEksekusi: 29, catatan: 30, diameter: 31, jenisPekerjaan: 32, tglSelesai: 37, petugas: 38, inputBySelesai: 39,
            timestampSelesai: 40 }
};
var MIGINS_TAB_V1_ = { header: 'db_Global_Header', realisasi: 'db_InsJar_Realisasi', insdu: 'db_InsDu_Realisasi', temuan: 'db_INS_Temuan' };

function selMigIns_(row, kol) { return row && row.length > kol ? row[kol] : ''; }

function isoMigIns_(v) {
  var ms = waktuLama_(v);
  return ms ? new Date(ms).toISOString() : '';
}

function auditMigIns_(o, ts) {
  o.dibuat_oleh = MIGINS_OLEH_;
  o.diubah_oleh = MIGINS_OLEH_;
  o.timestamp = ts || '';
  o.timestamp_update = ts || '';
  o.revision = 1;
  return o;
}

/** Peta tim inspeksi: Sub-Tim v1 -> baris db_Tim (nama / kode, atau satu-satunya tim jenis itu). */
function timMigIns_(timRows, jenis, subTim) {
  var tim = timRows.filter(function (t) { return teksMig_(t.jenis).toUpperCase() === jenis && isAktif_(t.aktif) && t.tim_id; });
  var n = normNama_(subTim);
  var nama = tim.filter(function (t) { return normNama_(t.nama) === n; });   // nama persis dulu, baru kode 2 digit
  if (nama.length === 1) return nama[0];
  var kode = tim.filter(function (t) { return teksMig_(t.kode) && n.slice(-2) === teksMig_(t.kode).slice(-2); });
  if (kode.length === 1) return kode[0];
  return tim.length === 1 ? tim[0] : null;
}

/** Tim tindak lanjut v1 (nama tim eksekusi) -> db_Tim ROW / HARTEK / YANDAL. */
function timTlMigIns_(timRows, nama) {
  var n = normNama_(nama);
  if (!n) return null;
  return timRows.filter(function (t) {
    return ['ROW', 'HARTEK', 'YANDAL'].indexOf(teksMig_(t.jenis).toUpperCase()) !== -1 && normNama_(t.nama) === n;
  })[0] || null;
}

/** v1.0.34: kode induk dari pola kode v1: <header>-PNY.nnn / -GDU.nnn (realisasi), <realisasi>-TJR.nnn (temuan). */
function kodeIndukMig_(kode, tingkat) {
  var m = tingkat === 'realisasi' ? /^(.+)-TJR\.\d+$/i.exec(kode) : /^(.+?)-(?:PNY|GDU)\./i.exec(kode);
  return m ? m[1] : '';
}

/**
 * Analisis murni (tanpa Sheets): S = baris array per tab v1, M = { tim, jenisTemuan, gardu } baris objek master v2.
 * Hasil { rencana: {tab v2: [objek]}, catatan: [{jenis, kode_lama, status, alasan}], hitung }.
 */
function analisisMigrasiInspeksi_(S, M) {
  var catatan = [], rencana = { insjar_header: [], insjar_realisasi: [], db_insdu_header: [], db_insdu_realisasi: [], db_temuan_inspeksi: [] };
  var catat = function (jenis, kode, status, alasan) { catatan.push({ jenis: jenis, kode_lama: kode, status: status, alasan: alasan || '' }); };
  var H = MIGINS_KOL_.header, R = MIGINS_KOL_.realisasi, D = MIGINS_KOL_.insdu, T = MIGINS_KOL_.temuan;
  var kodeDipakai = {};
  var unik = function (jenis, kode) {
    if (!kode) return false;
    var k = jenis + '|' + kode;
    if (kodeDipakai[k]) { catat(jenis, kode, 'KARANTINA', 'kode ganda di sumber (baris berikutnya dilewati)'); return false; }
    kodeDipakai[k] = true;
    return true;
  };
  // v1.0.34: kode induk yang ADA di sumber (termigrasi atau dikarantina) + petunjuk tanggal / tim / ULP untuk induk buatan
  var diSumber = { header: {}, realisasi: {} }, petunjuk = {}, jumlahTemuan = {};
  (S.header || []).forEach(function (row) { diSumber.header[teksMig_(selMigIns_(row, H.kodeHeader))] = true; });
  (S.realisasi || []).forEach(function (row) { diSumber.realisasi[teksMig_(selMigIns_(row, R.kodePekerjaanPeny))] = true; });
  (S.insdu || []).forEach(function (row) { diSumber.realisasi[teksMig_(selMigIns_(row, D.kodePekerjaanGardu))] = true; });
  var kodeTemuan = function (row) {
    var kt = teksMig_(selMigIns_(row, T.kodePekerjaan));
    var kr = teksMig_(selMigIns_(row, T.kodePekerjaanPeny)) || kodeIndukMig_(kt, 'realisasi');
    return { temuan: kt, realisasi: kr, header: teksMig_(selMigIns_(row, T.kodeHeader)) || kodeIndukMig_(kr, 'header') };
  };
  (S.temuan || []).forEach(function (row) {
    var k = kodeTemuan(row);
    if (k.temuan.indexOf('PEG-') === 0) return;
    jumlahTemuan[k.realisasi] = (jumlahTemuan[k.realisasi] || 0) + 1;
    if (k.header && !petunjuk[k.header]) {
      petunjuk[k.header] = { tim: teksMig_(selMigIns_(row, T.timInspeksi)), ulp: teksMig_(selMigIns_(row, T.ulp)) };
    }
  });
  // header
  var headerPorKode = {};
  (S.header || []).forEach(function (row) {
    var kode = teksMig_(selMigIns_(row, H.kodeHeader));
    var gardu = kode.indexOf('IGD-') === 0;
    if (kode.indexOf('IJR-') !== 0 && !gardu) return;   // header modul lain (ROW / Hartek / PEG) bukan bagian migrasi ini
    if (!unik('header', kode)) return;
    var tab = gardu ? 'db_insdu_header' : 'insjar_header';
    var tim = timMigIns_(M.tim || [], gardu ? 'INSPEKSI_GARDU' : 'INSPEKSI_JARINGAN', selMigIns_(row, H.subTim) || selMigIns_(row, H.tim));
    if (!tim) { catat('header', kode, 'KARANTINA', 'tim inspeksi "' + teksMig_(selMigIns_(row, H.subTim)) + '" tidak ada di db_Tim'); return; }
    var tanggal = tglLama_(selMigIns_(row, H.tanggal));
    var ts = isoMigIns_(selMigIns_(row, H.timestamp));
    var o = auditMigIns_({
      kode_header: kode, ulp: teksMig_(selMigIns_(row, H.ulp)), hari: teksMig_(selMigIns_(row, H.hari)), tanggal: tanggal,
      tim: teksMig_(tim.nama), koordinat_awal: teksMig_(selMigIns_(row, H.koordinatAwal)), koordinat_akhir: teksMig_(selMigIns_(row, H.koordinatAkhir)),
      km_awal: angkaLama_(selMigIns_(row, H.kmAwal)) === null ? '' : angkaLama_(selMigIns_(row, H.kmAwal)),
      km_akhir: angkaLama_(selMigIns_(row, H.kmAkhir)) === null ? '' : angkaLama_(selMigIns_(row, H.kmAkhir)),
      kendala: teksMig_(selMigIns_(row, H.kendala)), wa_text: teksMig_(selMigIns_(row, H.waText)), input_by: teksMig_(selMigIns_(row, H.inputBy)),
      header_id: uuidMig_(tab, kode), tim_id: String(tim.tim_id), status: 'AKTIF', waktu_perangkat: ''
    }, ts);
    o.timestamp_update = isoMigIns_(selMigIns_(row, H.timestampUpdate)) || ts;
    rencana[tab].push(o);
    headerPorKode[kode] = { o: o, tab: tab };
    catat('header', kode, 'OK', gardu ? 'Inspeksi Gardu' : 'Inspeksi Jaringan');
  });
  /**
   * v1.0.34: Laporan Utama induk. Sudah termigrasi = dipakai; ada di v1 tapi dikarantina = { alasan }; tidak ada di v1 =
   * dibuat dari data anak x { tanggal, hari, ulp, tim, inputBy, ts } (tim / ULP kosong = dari temuan ber-header sama).
   */
  var headerInduk = function (kodeH, gardu, x, asal) {
    if (headerPorKode[kodeH]) return headerPorKode[kodeH];
    if (!kodeH) return { alasan: 'kode Laporan Utama induk kosong' };
    if (diSumber.header[kodeH]) return { alasan: 'Laporan Utama induk ' + kodeH + ' ada di v1 tapi tidak termigrasi (lihat baris header-nya)' };
    var tab = gardu ? 'db_insdu_header' : 'insjar_header', p = petunjuk[kodeH] || {}, namaTim = x.tim || p.tim || '';
    var tim = timMigIns_(M.tim || [], gardu ? 'INSPEKSI_GARDU' : 'INSPEKSI_JARINGAN', namaTim);
    if (!tim) return { alasan: 'Laporan Utama induk ' + kodeH + ' tidak ada di v1, tim inspeksi "' + namaTim + '" tidak ada di db_Tim untuk membuatnya' };
    var o = auditMigIns_({
      kode_header: kodeH, ulp: x.ulp || p.ulp || '', hari: x.hari || '', tanggal: x.tanggal || '', tim: teksMig_(tim.nama),
      koordinat_awal: '', koordinat_akhir: '', km_awal: '', km_akhir: '', kendala: '', wa_text: '', input_by: x.inputBy || '',
      header_id: uuidMig_(tab, kodeH), tim_id: String(tim.tim_id), status: 'AKTIF', waktu_perangkat: ''
    }, x.ts);
    rencana[tab].push(o);
    headerPorKode[kodeH] = { o: o, tab: tab };
    catat('header', kodeH, 'PERINGATAN', 'Laporan Utama tidak ada di v1, dibuat otomatis dari ' + asal);
    return headerPorKode[kodeH];
  };
  var realJar = function (h, kode, penyulang, section, tier, totalTiang, jumlah, ts) {
    var o = auditMigIns_({
      kode_header: h.o.kode_header, kode_realisasi: kode, tanggal: h.o.tanggal, hari: h.o.hari, ulp: h.o.ulp, tim: h.o.tim,
      penyulang: penyulang, tier: tier, section: section, total_tiang: totalTiang, jumlah_temuan: jumlah,
      realisasi_id: uuidMig_('insjar_realisasi', kode), header_id: h.o.header_id, tim_id: h.o.tim_id
    }, ts);
    rencana.insjar_realisasi.push(o);
    realPorKode[kode] = o;
    return o;
  };
  // realisasi Inspeksi Jaringan
  var realPorKode = {};
  (S.realisasi || []).forEach(function (row) {
    var kode = teksMig_(selMigIns_(row, R.kodePekerjaanPeny));
    if (!unik('realisasi', kode)) return;
    var kodeH = teksMig_(selMigIns_(row, R.kodeHeader)) || kodeIndukMig_(kode, 'header');
    var h = headerInduk(kodeH, false, { tanggal: tglLama_(selMigIns_(row, R.tanggal)), hari: teksMig_(selMigIns_(row, R.hari)),
      inputBy: teksMig_(selMigIns_(row, R.inputBy)), ts: isoMigIns_(selMigIns_(row, R.timestamp)) }, 'penyulang utama ' + kode);
    if (!h.o || h.tab !== 'insjar_header') { catat('realisasi', kode, 'KARANTINA', h.alasan || 'Laporan Utama induk ' + kodeH + ' bukan Inspeksi Jaringan'); return; }
    realJar(h, kode, teksMig_(selMigIns_(row, R.penyulang)), teksMig_(selMigIns_(row, R.section)), teksMig_(selMigIns_(row, R.tier)),
      angkaLama_(selMigIns_(row, R.totalTiang)) === null ? '' : angkaLama_(selMigIns_(row, R.totalTiang)),
      angkaLama_(selMigIns_(row, R.jumlahTemuan)) || 0, isoMigIns_(selMigIns_(row, R.timestamp)));
    if (teksMig_(selMigIns_(row, R.segmen))) catat('realisasi', kode, 'PERINGATAN', 'segmen v1 "' + teksMig_(selMigIns_(row, R.segmen)) + '" tidak ada kolomnya di v2 (hanya di temuan)');
  });
  // realisasi Inspeksi Gardu
  var garduPorNo = {};
  (M.gardu || []).forEach(function (g) { var n = teksMig_(g['No Gardu']).toUpperCase(); if (n) garduPorNo[n] = g; });
  var realDu = function (h, kode, no, penyulang, section, tier, jumlah, ts) {
    var g = garduPorNo[no];
    if (!g) catat('realisasi', kode, 'PERINGATAN', 'gardu ' + no + ' tidak ada di db_Gardu (gardu_id kosong)');
    var o = auditMigIns_({
      kode_header: h.o.kode_header, kode_realisasi: kode, tanggal: h.o.tanggal, hari: h.o.hari, ulp: h.o.ulp, tim: h.o.tim, no_gardu: no,
      penyulang: penyulang || teksMig_(g && g.Penyulang), section: section || teksMig_(g && g.Section),
      alamat: teksMig_(g && g.Alamat), kapasitas_kva: g && angkaLama_(g['Kapasitas (kVA)']) !== null ? angkaLama_(g['Kapasitas (kVA)']) : '',
      merk_trafo: teksMig_(g && g.Merk), tier: tier, status_ukur: '', jumlah_temuan: jumlah,
      jumlah_temuan_lanjutan: 0, realisasi_id: uuidMig_('db_insdu_realisasi', kode), header_id: h.o.header_id, tim_id: h.o.tim_id,
      gardu_id: g ? String(g.gardu_id || '') : '', section_id: g ? teksMig_(g.section_id) : ''
    }, ts);
    rencana.db_insdu_realisasi.push(o);
    realPorKode[kode] = o;
    return o;
  };
  (S.insdu || []).forEach(function (row) {
    var kode = teksMig_(selMigIns_(row, D.kodePekerjaanGardu));
    if (!unik('realisasi', kode)) return;
    var kodeH = teksMig_(selMigIns_(row, D.kodeHeader)) || kodeIndukMig_(kode, 'header');
    var h = headerInduk(kodeH, true, { tanggal: tglLama_(selMigIns_(row, D.tanggal)), hari: teksMig_(selMigIns_(row, D.hari)),
      inputBy: teksMig_(selMigIns_(row, D.inputBy)), ts: isoMigIns_(selMigIns_(row, D.timestamp)) }, 'gardu ' + kode);
    if (!h.o || h.tab !== 'db_insdu_header') { catat('realisasi', kode, 'KARANTINA', h.alasan || 'Laporan Utama induk ' + kodeH + ' bukan Inspeksi Gardu'); return; }
    realDu(h, kode, teksMig_(selMigIns_(row, D.nomorGardu)).toUpperCase(), teksMig_(selMigIns_(row, D.penyulang)), teksMig_(selMigIns_(row, D.section)),
      teksMig_(selMigIns_(row, D.tier)), angkaLama_(selMigIns_(row, D.jumlahTemuan)) || 0, isoMigIns_(selMigIns_(row, D.timestamp)));
  });
  // jenis temuan master (nama tanpa beda huruf besar / kecil)
  var jenisPorNama = {};
  (M.jenisTemuan || []).forEach(function (j) { var n = normNama_(j.jenis_temuan); if (n && j.jenis_temuan_id) jenisPorNama[n] = j; });
  // temuan
  (S.temuan || []).forEach(function (row) {
    var kd = kodeTemuan(row), kode = kd.temuan;
    if (!unik('temuan', kode)) return;
    var peg = kode.indexOf('PEG-') === 0;
    var kodeReal = peg ? teksMig_(selMigIns_(row, T.kodePekerjaanPeny)) : kd.realisasi, kodeH = peg ? teksMig_(selMigIns_(row, T.kodeHeader)) : kd.header;
    var objek = teksMig_(selMigIns_(row, T.objekInspeksi)) || (kodeH.indexOf('IGD-') === 0 ? 'Gardu' : 'Jaringan');
    var r = peg ? null : realPorKode[kodeReal], h = r ? headerPorKode[r.kode_header] : null;
    if (!peg && !r) {
      // v1.0.34: penyulang utama / gardu induk tidak ada di v1 = dibuat dari kolom temuan (Laporan Utama juga kalau perlu)
      var gardu = objek === 'Gardu' || kodeH.indexOf('IGD-') === 0, alasan = '';
      if (!kodeReal) alasan = 'kode penyulang utama / gardu induk kosong';
      else if (diSumber.realisasi[kodeReal]) alasan = 'penyulang utama / gardu induk ' + kodeReal + ' ada di v1 tapi tidak termigrasi (lihat baris realisasi-nya)';
      else {
        h = headerInduk(kodeH, gardu, { tanggal: tglLama_(selMigIns_(row, T.tanggal)), hari: teksMig_(selMigIns_(row, T.hari)), ulp: teksMig_(selMigIns_(row, T.ulp)),
          tim: teksMig_(selMigIns_(row, T.timInspeksi)), inputBy: teksMig_(selMigIns_(row, T.inputBy)), ts: isoMigIns_(selMigIns_(row, T.timestamp)) }, 'temuan ' + kode);
        if (!h.o) alasan = h.alasan;
        else if (h.tab !== (gardu ? 'db_insdu_header' : 'insjar_header')) alasan = 'Laporan Utama induk ' + kodeH + ' beda modul dengan temuan (' + objek + ')';
      }
      if (alasan) { catat('temuan', kode, 'KARANTINA', alasan); return; }
      var tierT = teksMig_(selMigIns_(row, T.tier)), tsT = isoMigIns_(selMigIns_(row, T.timestamp)), nT = jumlahTemuan[kodeReal] || 0;
      r = gardu
        ? realDu(h, kodeReal, teksMig_(selMigIns_(row, T.nomorGardu)).toUpperCase(), teksMig_(selMigIns_(row, T.penyulang)), teksMig_(selMigIns_(row, T.section)), tierT, nT, tsT)
        : realJar(h, kodeReal, teksMig_(selMigIns_(row, T.penyulang)), teksMig_(selMigIns_(row, T.section)), tierT, '', nT, tsT);
      catat('realisasi', kodeReal, 'PERINGATAN', (gardu ? 'gardu' : 'penyulang utama') + ' tidak ada di v1, dibuat otomatis dari temuan ' + kode);
    }
    var namaJenis = teksMig_(selMigIns_(row, T.temuan));
    var jenis = jenisPorNama[normNama_(namaJenis)];
    if (!jenis) catat('temuan', kode, 'PERINGATAN', 'jenis temuan "' + namaJenis + '" belum ada di db_Jenis_Temuan (teks disalin, jenis_temuan_id kosong)');
    var noGardu = teksMig_(selMigIns_(row, T.nomorGardu)).toUpperCase();
    var g = noGardu ? garduPorNo[noGardu] : null;
    var urlTemuan = teksMig_(selMigIns_(row, T.fotoTemuanUrl)) || teksMig_(selMigIns_(row, T.fotoTemuan));
    var urlTiang = teksMig_(selMigIns_(row, T.fotoTiangUrl)) || teksMig_(selMigIns_(row, T.fotoTiang));
    var k = koordinatMig_(selMigIns_(row, T.koordinat));
    var selesai = /selesai/i.test(teksMig_(selMigIns_(row, T.status)));
    var timTl = timTlMigIns_(M.tim || [], selMigIns_(row, T.timEksekusi));
    var diameter = angkaLama_(selMigIns_(row, T.diameter));
    var o = auditMigIns_({
      kode_header: peg ? kodeH : h.o.kode_header, kode_realisasi: peg ? kodeReal : r.kode_realisasi, kode_temuan: kode,
      tanggal: tglLama_(selMigIns_(row, T.tanggal)) || (h ? h.o.tanggal : ''), hari: teksMig_(selMigIns_(row, T.hari)),
      ulp: teksMig_(selMigIns_(row, T.ulp)), tim: peg ? 'Admin' : h.o.tim, objek_inspeksi: objek,
      tier_inspeksi: teksMig_(selMigIns_(row, T.tier)), penyulang: teksMig_(selMigIns_(row, T.penyulang)), tier: r ? teksMig_(r.tier) : teksMig_(selMigIns_(row, T.tier)),
      section: teksMig_(selMigIns_(row, T.section)), segmen: objek === 'Jaringan' ? teksMig_(selMigIns_(row, T.segmen)) : '',
      nomor_tiang: teksMig_(selMigIns_(row, T.nomorTiang)).toUpperCase(), no_gardu: noGardu,
      jenis_temuan: jenis ? teksMig_(jenis.jenis_temuan) : namaJenis, deskripsi: teksMig_(selMigIns_(row, T.deskripsi)),
      koordinat: k.ok ? k.nilai.teks : teksMig_(selMigIns_(row, T.koordinat)),
      lat: k.ok ? k.nilai.lat : (angkaLama_(selMigIns_(row, T.lat)) === null ? '' : angkaLama_(selMigIns_(row, T.lat))),
      lng: k.ok ? k.nilai.lng : (angkaLama_(selMigIns_(row, T.long)) === null ? '' : angkaLama_(selMigIns_(row, T.long))),
      foto_temuan_file_id: driveIdDariUrl_(urlTemuan) || '', foto_temuan_link: urlTemuan,
      foto_tiang_file_id: driveIdDariUrl_(urlTiang) || '', foto_tiang_link: urlTiang,
      status: selesai ? 'Selesai' : 'Penugasan Tim', sumber: peg ? 'ADMIN' : 'INSPEKSI',
      temuan_id: uuidMig_('temuan', kode), jenis_temuan_id: jenis ? String(jenis.jenis_temuan_id) : '', section_id: '',
      realisasi_id: peg ? '' : r.realisasi_id, header_id: peg ? '' : h.o.header_id, tim_id: peg ? '' : h.o.tim_id,
      gardu_id: g ? String(g.gardu_id || '') : '', temuan_asal_id: '', belum_diperbaiki: '',
      status_wo: selesai ? 'SELESAI' : '', tim_tindak_lanjut: selesai ? teksMig_(selMigIns_(row, T.timEksekusi)) : '',
      jenis_tim_tindak_lanjut: selesai && timTl ? teksMig_(timTl.jenis).toUpperCase() : '',
      catatan_admin: teksMig_(selMigIns_(row, T.catatan)), diteruskan_oleh: teksMig_(selMigIns_(row, T.forwardBy)),
      waktu_diteruskan: isoMigIns_(selMigIns_(row, T.tglForward)), dimulai_oleh: '', waktu_mulai: '',
      tindak_lanjut: selesai ? [teksMig_(selMigIns_(row, T.jenisPekerjaan)), diameter !== null ? 'Ø ' + diameter + ' cm' : ''].filter(String).join(' ') : '',
      jumlah_pekerjaan: selesai ? 1 : '',
      diselesaikan_oleh: selesai ? (teksMig_(selMigIns_(row, T.petugas)) || teksMig_(selMigIns_(row, T.inputBySelesai))) : '',
      waktu_selesai: selesai ? (isoMigIns_(selMigIns_(row, T.tglSelesai)) || isoMigIns_(selMigIns_(row, T.timestampSelesai))) : '',
      tim_tindak_lanjut_id: selesai && timTl ? String(timTl.tim_id) : ''
    }, isoMigIns_(selMigIns_(row, T.timestamp)));
    if (!selesai && teksMig_(selMigIns_(row, T.timEksekusi))) {
      catat('temuan', kode, 'PERINGATAN', 'WO v1 belum selesai (' + teksMig_(selMigIns_(row, T.timEksekusi)) + '): masuk Penugasan Tim, teruskan ulang di Penerusan WO');
    }
    rencana.db_temuan_inspeksi.push(o);
  });
  var hitung = {};
  Object.keys(rencana).forEach(function (t) { hitung[t] = rencana[t].length; });
  hitung.karantina = catatan.filter(function (c) { return c.status === 'KARANTINA'; }).length;
  hitung.peringatan = catatan.filter(function (c) { return c.status === 'PERINGATAN'; }).length;
  return { rencana: rencana, catatan: catatan, hitung: hitung };
}

/* ===== Jadwal Padam ===== */

function kunciJudulMigJp_(v) { return teksMig_(v).toLowerCase().replace(/[^a-z0-9]/g, ''); }

/** Nilai kolom v1 lewat beberapa kemungkinan judul (sama dengan _jpGet_ v1). */
function ambilMigJp_(o) {
  var peta = {};
  Object.keys(o).forEach(function (k) { peta[kunciJudulMigJp_(k)] = o[k]; });
  return function () {
    for (var i = 0; i < arguments.length; i++) {
      var v = peta[kunciJudulMigJp_(arguments[i])];
      if (v !== undefined) return v;
    }
    return '';
  };
}

/** Tanggal v1 jadwal ('dd MMMM yyyy' Indonesia, Date, yyyy-MM-dd, dd/MM/yyyy). */
function tglMigJp_(v) {
  var t = tglLama_(v);
  if (t) return t;
  var m = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})/.exec(teksMig_(v).toLowerCase());
  if (!m) return '';
  var b = JP_BULAN_.map(function (x) { return x.toLowerCase(); }).indexOf(m[2]);
  return b === -1 ? '' : m[3] + '-' + ('0' + (b + 1)).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}

function jamMigJp_(v) {
  if (adalahDate_(v)) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, 'Asia/Jakarta', 'HH:mm');
  var m = /^(\d{1,2})[:.](\d{2})/.exec(teksMig_(v));
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : '';
}

/** v1.0.18: ENS v1 (angka / teks "Rp 1.234,5") -> rupiah bulat ke atas; kosong = dihitung dari beban MW master x durasi. */
function ensMigJp_(v, m, durasi) {
  var e = ensRupiahJp_(v);
  if (e !== null) return e;
  return m && Number(m.beban_mw) && durasi ? hitungEnsJp_(m.beban_mw, durasi) : '';
}

/** Analisis murni Jadwal Padam v1: rekap = baris objek Rekap_Jadwal_Padam, master = baris objek Master Daerah Padam. */
function analisisMigrasiJadwalPadam_(rekap, master) {
  var catatan = [], rencana = { db_Daerah_Padam: [], db_jadwal_padam: [] };
  var catat = function (jenis, kode, status, alasan) { catatan.push({ jenis: jenis, kode_lama: kode, status: status, alasan: alasan || '' }); };
  var daerah = {};
  (master || []).forEach(function (row) {
    var g = ambilMigJp_(row);
    var pen = teksMig_(g('Penyulang')), sec = teksMig_(g('Section'));
    if (!pen || !sec) return;
    var kunci = normNama_(pen) + '|' + normNama_(sec);
    if (daerah[kunci]) { catat('daerah', pen + ' / ' + sec, 'PERINGATAN', 'ganda di Master Daerah Padam (baris pertama dipakai)'); return; }
    var o = {
      ulp: teksMig_(g('ULP')), up3: teksMig_(g('UP3')), gi: teksMig_(g('GI')), penyulang: pen, section: sec,
      jumlah_gardu: angkaLama_(g('Jumlah Gardu')) || 0, jumlah_pelanggan: angkaLama_(g('Jumlah Pelanggan')) || 0,
      daerah_section: teksMig_(g('Daerah Section', 'Daerah Padam', 'Dearah Padam')), pelanggan_vip: teksMig_(g('Pelanggan VIP', 'Pelanggan VIP Padam')),
      beban_mw: angkaLama_(g('Beban MW', 'Beban')) || 0, arus_a: angkaLama_(g('Arus (A)', 'Arus')) === null ? '' : angkaLama_(g('Arus (A)', 'Arus')),
      aktif: true, daerah_id: uuidMig_('daerah_padam', kunci), revision: 1, timestamp_update: '', diubah_oleh: MIGINS_OLEH_
    };
    daerah[kunci] = o;
    rencana.db_Daerah_Padam.push(o);
  });
  var kodeDipakai = {};
  (rekap || []).forEach(function (row, i) {
    var g = ambilMigJp_(row);
    var kode = teksMig_(g('Kode Jadwal Padam')) || ('JP-MIG-' + (row._baris || i + 2));
    if (kodeDipakai[kode]) { catat('jadwal', kode, 'KARANTINA', 'kode ganda di Rekap_Jadwal_Padam'); return; }
    kodeDipakai[kode] = true;
    var tanggal = tglMigJp_(g('Tanggal'));
    var pen = teksMig_(g('Penyulang')), sec = teksMig_(g('Section'));
    if (!tanggal || !pen) { catat('jadwal', kode, 'KARANTINA', 'tanggal / penyulang kosong atau tidak terbaca'); return; }
    var m = daerah[normNama_(pen) + '|' + normNama_(sec)];
    var jp = jamMigJp_(g('Jam Padam')), jn = jamMigJp_(g('Jam Nyala'));
    var durasi = angkaLama_(g('Durasi'));
    if (durasi === null && jp && jn) durasi = durasiJp_(jp, jn);
    var st = teksMig_(g('Status Jadwal Padam', 'Status Jadwal Pekerjaan', 'Status')) || JP_STATUS_.jadwal;
    if (/^batal/i.test(st)) st = JP_STATUS_.batal;
    if (!m) catat('jadwal', kode, 'PERINGATAN', 'penyulang + section "' + pen + ' / ' + sec + '" tidak ada di Master Daerah Padam (kolom disalin dari rekap)');
    var o = auditMigIns_({
      kode_jadwal: kode, ulp: teksMig_(g('ULP')), penyulang: pen, section: sec, jenis_pekerjaan: teksMig_(g('Jenis Pekerjaan', 'Jenis Pekejaan')),
      hari: teksMig_(g('Hari')) || hariJp_(tanggal), tanggal: tanggal, jam_padam: jp, jam_nyala: jn, durasi: durasi === null ? '' : durasi,
      jumlah_gardu: angkaLama_(g('Jumlah Gardu')) || 0, jumlah_pelanggan: angkaLama_(g('Jumlah Pelanggan')) || 0,
      daerah_padam: teksMig_(g('Daerah Section', 'Daerah Padam', 'Dearah Padam')),
      beban_a: angkaLama_(g('Beban (A)', 'Arus (A)', 'Beban')) === null ? (m ? m.arus_a : '') : angkaLama_(g('Beban (A)', 'Arus (A)', 'Beban')),
      beban_mw: m ? m.beban_mw : '', ens_rupiah: ensMigJp_(g('ENS (Rupiah)', 'ENS'), m, durasi),
      pelanggan_vip: teksMig_(g('Pelanggan VIP', 'Pelanggan VIP Padam')), lokasi_pekerjaan: teksMig_(g('Lokasi Pekerjaan')),
      status_jadwal: st, status_pekerjaan: teksMig_(g('Status Pekerjaan')) || 'Padam', jadwal_id: uuidMig_('jadwal_padam', kode)
    }, '');
    rencana.db_jadwal_padam.push(o);
  });
  return {
    rencana: rencana, catatan: catatan,
    hitung: { daerah: rencana.db_Daerah_Padam.length, jadwal: rencana.db_jadwal_padam.length,
              karantina: catatan.filter(function (c) { return c.status === 'KARANTINA'; }).length }
  };
}

/* ===== tulis (bersama) ===== */

/**
 * Tulis rencana ke satu tabel v2: baris MIGRASI yang sudah ada dilewati (idempoten), kode bentrok dengan baris app v2 =
 * MIG_KODE_BENTROK. [kolOleh] = kolom penanda migrasi (dibuat_oleh, atau diubah_oleh untuk tabel master).
 */
function tulisRencanaMigIns_(t, rencana, kolId, kolKode, kolOleh, mulai) {
  var adaId = {}, ditulis = 0, terpotong = false;
  var kodeRencana = {};
  rencana.forEach(function (o) { if (kolKode) kodeRencana[teksMig_(o[kolKode])] = true; });
  t.rows.forEach(function (row) {
    if (String(row[kolOleh]) === MIGINS_OLEH_) { adaId[String(row[kolId])] = true; return; }
    if (kolKode && kodeRencana[teksMig_(row[kolKode])]) throw new SisiError_('MIG_KODE_BENTROK', t.nama + ' baris ' + row._baris + ' (' + row[kolKode] + ') dibuat app v2');
  });
  var baru = rencana.filter(function (o) { return !adaId[String(o[kolId])]; });
  for (var i = 0; i < baru.length; i += MIGINS_BLOK_) {
    if (Date.now() - mulai > MIGINS_BATAS_MS_) { terpotong = true; break; }
    var blok = baru.slice(i, i + MIGINS_BLOK_), akhir = t.sheet.getLastRow();
    t.sheet.getRange(akhir + 1, 1, blok.length, t.header.length).setValues(blok.map(function (o, k) {
      if (t.header.indexOf('nomor') !== -1) o.nomor = akhir + k;
      return barisDariObjek_(t.header, o);
    }));
    ditulis += blok.length;
  }
  return { sudahAda: Object.keys(adaId).length, ditulis: ditulis, terpotong: terpotong };
}

/** Hapus baris MIGRASI satu tabel (tulis ulang rapat). Hasil = jumlah dihapus. */
function hapusBarisMigIns_(t, kolOleh) {
  var akhir = t.sheet.getLastRow(), lebar = t.header.length;
  if (akhir < 2) return 0;
  var rg = t.sheet.getRange(2, 1, akhir - 1, lebar), nilai = rg.getValues();
  var iOleh = t.header.indexOf(kolOleh), iNo = t.header.indexOf('nomor');
  var sisa = nilai.filter(function (b) { return String(b[iOleh]) !== MIGINS_OLEH_; });
  var hapus = nilai.length - sisa.length;
  if (!hapus) return 0;
  var kosong = [];
  for (var k = 0; k < lebar; k++) kosong.push('');
  // sama dengan rollback Hartek: baris app v2 asli ditulis ulang rapat ke atas, sisa bawah dikosongkan
  rg.setValues(sisa.map(function (b, idx) {
    var salin = b.map(amanSheet_);
    if (iNo !== -1) salin[iNo] = idx + 1;
    return salin;
  }).concat(nilai.slice(sisa.length).map(function () { return kosong.slice(); })));
  return hapus;
}

function bacaPosisiMigIns_(ss, nama, wajib) {
  var sh = ss.getSheetByName(nama);
  if (!sh) {
    if (wajib) throw new SisiError_('SHEET_TIDAK_ADA', 'sumber: ' + nama);
    return [];
  }
  return sh.getDataRange().getValues().slice(1).filter(function (r) { return r.some(function (v) { return v !== '' && v !== null; }); });
}

/* ===== editor: Inspeksi ===== */

function siapkanMigrasiInspeksi_() {
  var c = cfg_(), p = PropertiesService.getScriptProperties();
  var id = c.INSPEKSI_LAMA_SHEET_ID || String(p.getProperty('MIG_SUMBER_ID') || '').trim();
  if (!id) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'INSPEKSI_LAMA_SHEET_ID');
  if ([c.MASTER_SHEET_ID, c.AUTH_SHEET_ID, c.INSJAR_SHEET_ID, c.INSDU_SHEET_ID, c.TEMUAN_SHEET_ID].indexOf(id) !== -1) {
    throw new SisiError_('MIG_SUMBER_SALAH', 'sumber = sheet v2');
  }
  ['INSJAR_SHEET_ID', 'INSDU_SHEET_ID', 'TEMUAN_SHEET_ID'].forEach(function (k) { if (!c[k]) throw new SisiError_('CONFIG_TIDAK_LENGKAP', k); });
  var ss = SpreadsheetApp.openById(id);
  var S = {
    header: bacaPosisiMigIns_(ss, MIGINS_TAB_V1_.header, true), realisasi: bacaPosisiMigIns_(ss, MIGINS_TAB_V1_.realisasi, false),
    insdu: bacaPosisiMigIns_(ss, MIGINS_TAB_V1_.insdu, false), temuan: bacaPosisiMigIns_(ss, MIGINS_TAB_V1_.temuan, false)
  };
  var gardu = [];
  try { gardu = tabel_('GARDU_SHEET_ID', 'db_Gardu').rows; } catch (e) { if (!e || !e.kode) throw e; }
  var jenis = [];
  try { jenis = tabel_('MASTER_SHEET_ID', INSJAR_SHEET_.JENIS_TEMUAN).rows; } catch (e2) { if (!e2 || e2.kode !== 'SHEET_TIDAK_ADA') throw e2; }
  return { c: c, p: p, S: S, M: { tim: tabel_('MASTER_SHEET_ID', 'db_Tim').rows, jenisTemuan: jenis, gardu: gardu } };
}

function laporanMigIns_(idKey, nama, r) {
  tulisSheetMig_(bukaSpreadsheet_(cfg_()[idKey]), nama, MIGINS_CEK_KOLOM_, r.catatan.map(function (x) { return [x.jenis, x.kode_lama, x.status, x.alasan]; }));
}

function ADMIN_migrasiInspeksiCek() {
  pastikanPemilik_();
  var x = siapkanMigrasiInspeksi_();
  var r = analisisMigrasiInspeksi_(x.S, x.M);
  laporanMigIns_('TEMUAN_SHEET_ID', 'migins_Cek', r);
  console.log('DRY-RUN MIGRASI INSPEKSI: ' + JSON.stringify(r.hitung) + '. Laporan migins_Cek di SiSi_Temuan. Tidak ada data v2 yang diubah.');
  return r.hitung;
}

var MIGINS_TARGET_ = [
  { tab: 'insjar_header', id: 'header_id', kode: 'kode_header', tabel: function () { return tabelInsJar_(INSJAR_SHEET_.HEADER); } },
  { tab: 'insjar_realisasi', id: 'realisasi_id', kode: 'kode_realisasi', tabel: function () { return tabelInsJar_(INSJAR_SHEET_.REALISASI); } },
  { tab: 'db_insdu_header', id: 'header_id', kode: 'kode_header', tabel: function () { return tabelInsDu_(INSDU_SHEET_.HEADER); } },
  { tab: 'db_insdu_realisasi', id: 'realisasi_id', kode: 'kode_realisasi', tabel: function () { return tabelInsDu_(INSDU_SHEET_.REALISASI); } },
  { tab: 'db_temuan_inspeksi', id: 'temuan_id', kode: 'kode_temuan', tabel: function () { return tabelInsJar_(INSJAR_SHEET_.TEMUAN); } }
];

function ADMIN_migrasiInspeksiJalan() {
  pastikanPemilik_();
  var mulai = Date.now();
  var x = siapkanMigrasiInspeksi_();
  var r = analisisMigrasiInspeksi_(x.S, x.M);
  if (r.hitung.karantina && x.p.getProperty('MIGINS_IZINKAN_KARANTINA') !== 'TRUE') {
    throw new SisiError_('MIG_MASIH_KARANTINA', r.hitung.karantina + ' baris. Lihat migins_Cek, atau MIGINS_IZINKAN_KARANTINA=TRUE untuk meninggalkannya.');
  }
  var hasil = denganLock_(function () {
    var out = { terpotong: false };
    MIGINS_TARGET_.forEach(function (tg) {
      if (out.terpotong) return;
      var h = tulisRencanaMigIns_(tg.tabel(), r.rencana[tg.tab], tg.id, tg.kode, 'dibuat_oleh', mulai);
      out[tg.tab] = h;
      if (h.terpotong) out.terpotong = true;
    });
    return out;
  }, 60000);
  laporanMigIns_('TEMUAN_SHEET_ID', 'migins_Cek', r);
  console.log('MIGRASI INSPEKSI ' + x.c.ENV + ': ' + JSON.stringify(hasil));
  console.log(hasil.terpotong ? 'Batas waktu: jalankan ADMIN_migrasiInspeksiJalan lagi untuk melanjutkan.' : 'MIGRASI INSPEKSI SELESAI.');
  return hasil;
}

function ADMIN_migrasiInspeksiHapus() {
  pastikanPemilik_();
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty('MIGINS_IZINKAN_HAPUS') !== 'TRUE') throw new SisiError_('MIG_HAPUS_DIKUNCI', 'set Script Property MIGINS_IZINKAN_HAPUS=TRUE dulu (sekali pakai)');
  var hasil = denganLock_(function () {
    var out = {};
    MIGINS_TARGET_.forEach(function (tg) { out[tg.tab] = hapusBarisMigIns_(tg.tabel(), 'dibuat_oleh'); });
    return out;
  }, 60000);
  p.deleteProperty('MIGINS_IZINKAN_HAPUS');
  console.log('ROLLBACK MIGRASI INSPEKSI: ' + JSON.stringify(hasil));
  return hasil;
}

/* ===== editor: Jadwal Padam ===== */

function siapkanMigrasiJadwalPadam_() {
  var c = cfg_(), p = PropertiesService.getScriptProperties();
  if (!c.JADWAL_PADAM_LAMA_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'JADWAL_PADAM_LAMA_SHEET_ID');
  if (!c.JADWAL_PADAM_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'JADWAL_PADAM_SHEET_ID');
  if (c.JADWAL_PADAM_LAMA_SHEET_ID === c.JADWAL_PADAM_SHEET_ID) throw new SisiError_('MIG_SUMBER_SALAH', 'sumber = sheet v2');
  var ss = SpreadsheetApp.openById(c.JADWAL_PADAM_LAMA_SHEET_ID);
  var cari = function (nama) {
    var sh = ss.getSheetByName(nama);
    if (sh) return nama;
    var k = kunciJudulMigJp_(nama);
    var lain = (ss.getSheets ? ss.getSheets() : []).filter(function (x) { return kunciJudulMigJp_(x.getName()) === k; })[0];
    return lain ? lain.getName() : null;
  };
  var nRekap = cari('Rekap_Jadwal_Padam'), nMaster = cari('Master Daerah Padam');
  if (!nRekap) throw new SisiError_('SHEET_TIDAK_ADA', 'sumber: Rekap_Jadwal_Padam');
  return { c: c, p: p, rekap: bacaSumberMig_(ss, nRekap).rows, master: nMaster ? bacaSumberMig_(ss, nMaster).rows : [] };
}

function ADMIN_migrasiJadwalPadamCek() {
  pastikanPemilik_();
  var x = siapkanMigrasiJadwalPadam_();
  var r = analisisMigrasiJadwalPadam_(x.rekap, x.master);
  laporanMigIns_('JADWAL_PADAM_SHEET_ID', 'migjp_Cek', r);
  console.log('DRY-RUN MIGRASI JADWAL PADAM: ' + JSON.stringify(r.hitung) + '. Laporan migjp_Cek di SiSi_JadwalPadam.');
  return r.hitung;
}

function ADMIN_migrasiJadwalPadamJalan() {
  pastikanPemilik_();
  var mulai = Date.now();
  var x = siapkanMigrasiJadwalPadam_();
  var r = analisisMigrasiJadwalPadam_(x.rekap, x.master);
  if (r.hitung.karantina && x.p.getProperty('MIGJP_IZINKAN_KARANTINA') !== 'TRUE') {
    throw new SisiError_('MIG_MASIH_KARANTINA', r.hitung.karantina + ' baris. Lihat migjp_Cek, atau MIGJP_IZINKAN_KARANTINA=TRUE.');
  }
  var hasil = denganLock_(function () {
    var dm = tulisRencanaMigIns_(tabel_('MASTER_SHEET_ID', JP_MASTER_SHEET_), r.rencana.db_Daerah_Padam, 'daerah_id', '', 'diubah_oleh', mulai);
    var jd = dm.terpotong ? { terpotong: true } : tulisRencanaMigIns_(tabelJp_(), r.rencana.db_jadwal_padam, 'jadwal_id', 'kode_jadwal', 'dibuat_oleh', mulai);
    return { db_Daerah_Padam: dm, db_jadwal_padam: jd, terpotong: !!(dm.terpotong || jd.terpotong) };
  }, 60000);
  laporanMigIns_('JADWAL_PADAM_SHEET_ID', 'migjp_Cek', r);
  console.log('MIGRASI JADWAL PADAM ' + x.c.ENV + ': ' + JSON.stringify(hasil));
  return hasil;
}

function ADMIN_migrasiJadwalPadamHapus() {
  pastikanPemilik_();
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty('MIGJP_IZINKAN_HAPUS') !== 'TRUE') throw new SisiError_('MIG_HAPUS_DIKUNCI', 'set Script Property MIGJP_IZINKAN_HAPUS=TRUE dulu (sekali pakai)');
  var hasil = denganLock_(function () {
    return { db_jadwal_padam: hapusBarisMigIns_(tabelJp_(), 'dibuat_oleh'),
             db_Daerah_Padam: hapusBarisMigIns_(tabel_('MASTER_SHEET_ID', JP_MASTER_SHEET_), 'diubah_oleh') };
  }, 60000);
  p.deleteProperty('MIGJP_IZINKAN_HAPUS');
  console.log('ROLLBACK MIGRASI JADWAL PADAM: ' + JSON.stringify(hasil));
  return hasil;
}
