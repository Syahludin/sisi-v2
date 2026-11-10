/**
 * v1.0.57 Gudang Material: endpoint admin untuk SELISIH dan PEMAKAIAN (menu OPS_GUDANG_MATERIAL, web + HP).
 * Selisih stok diselesaikan admin per baris dengan satu "cara"; tiap cara menulis sendiri mutasi yang menyamakan saldo jenis itu
 * dengan hitungan petugas (tidak ada koreksi penyama di akhir). Koreksi / pembatalan pemakaian = mutasi pembalik + LogKoreksi;
 * baris lama tidak pernah dihapus. Tahap pertama: material MCB.
 */

var GUD_CARA_KURANG_ = ['HILANG', 'SUSULAN', 'SALAH_HITUNG'];
var GUD_CARA_LEBIH_ = ['TAMBAHAN_MASUK', 'SALAH_CATAT', 'SALAH_HITUNG'];
var GUD_RENTANG_MAKS_HARI_ = 92;

/** Awal shift (ms) untuk tanggal + nomor shift Yandal (shift 3 = 00:00 WIB hari berikutnya dari tanggalnya). */
function mulaiShiftMs_(tanggal, no) {
  if (no === 1) return Date.parse(tanggal + 'T08:00:00+07:00');
  if (no === 2) return Date.parse(tanggal + 'T16:00:00+07:00');
  return Date.parse(tanggal + 'T00:00:00+07:00') + 86400e3;
}

function pemakaianKeJson_(r) {
  return { pemakaianId: String(r.pemakaian_id), nomorPemakaian: String(r.nomor_pemakaian), tanggal: tglSel_(r.tanggal), waktu: String(r.waktu), timId: String(r.tim_id),
    shift: Number(r.shift), nomorMeter: String(r.nomor_meter), daya: String(r.daya), merk: String(r.merk_mcb), keperluan: String(r.keperluan),
    petugasId: String(r.petugas_id), statusMcb: String(r.status_mcb), linkFoto: String(r.link_foto || ''), jenisCatatan: String(r.jenis_catatan),
    diisiOleh: String(r.diisi_oleh), revision: Number(r.revision) || 1 };
}

function getSelisihGudang_(sesi, data) {
  wajibAdminGudang_(sesi);
  wajibKonfigGudang_();
  var d = validasi_(data, { status: { tipe: 'pilihan', pilihan: ['MENUNGGU', 'SELESAI'] }, timId: { tipe: 'uuid' } });
  var pr = {}, tim = {};
  tabelGudang_('db_Stok_Pemeriksaan').rows.forEach(function (r) { pr[String(r.pemeriksaan_id)] = r; });
  timAktifGudang_().forEach(function (t) { tim[String(t.tim_id)] = String(t.nama); });
  var selisih = tabelGudang_('db_Stok_Selisih').rows.filter(function (s) {
    return (!d.status || String(s.status) === d.status) && (!d.timId || String(s.tim_id) === d.timId);
  }).slice(-300).reverse().map(function (s) {
    var p = pr[String(s.pemeriksaan_id)] || {};
    var o = selisihKeJson_(s);
    o.timId = String(s.tim_id); o.timNama = tim[String(s.tim_id)] || ''; o.pemeriksaanId = String(s.pemeriksaan_id);
    o.tanggal = tglSel_(p.tanggal); o.shift = Number(p.shift) || 0; o.catatanAdmin = String(s.catatan_admin || ''); o.pemakaianId = String(s.pemakaian_id || '');
    return o;
  });
  var pem = tabelGudang_('db_Pemakaian_MCB').rows.filter(function (r) { return !d.timId || String(r.tim_id) === d.timId; }).reverse();
  var daftar = function (jenis) { return pem.filter(function (r) { return String(r.jenis_catatan) === jenis; }).slice(0, 300).map(pemakaianKeJson_); };
  return { selisih: selisih, susulan: daftar('SUSULAN'), dikoreksi: daftar('DIKOREKSI') };
}

function getPemakaianGudang_(sesi, data) {
  wajibAdminGudang_(sesi);
  wajibKonfigGudang_();
  var d = validasi_(data, { dari: { tipe: 'tanggal' }, sampai: { tipe: 'tanggal' }, timId: { tipe: 'uuid' }, merk: { tipe: 'teks', maks: 40 } });
  if (!d.dari) throw new SisiError_('FIELD_WAJIB', 'dari');
  if (!d.sampai) throw new SisiError_('FIELD_WAJIB', 'sampai');
  if (d.dari > d.sampai) throw new SisiError_('RENTANG_TIDAK_VALID', d.dari + '>' + d.sampai);
  var hari = Math.round((Date.parse(d.sampai + 'T00:00:00Z') - Date.parse(d.dari + 'T00:00:00Z')) / 864e5) + 1;
  if (hari > GUD_RENTANG_MAKS_HARI_) throw new SisiError_('RENTANG_TERLALU_PANJANG', String(hari));
  var merk = (d.merk || '').toLowerCase();
  var rows = tabelGudang_('db_Pemakaian_MCB').rows.filter(function (r) {
    var tg = tglSel_(r.tanggal);
    return tg >= d.dari && tg <= d.sampai && (!d.timId || String(r.tim_id) === d.timId) && (!merk || String(r.merk_mcb).toLowerCase().indexOf(merk) !== -1);
  }).sort(function (a, b) {
    var ta = tglSel_(a.tanggal), tb = tglSel_(b.tanggal);
    return ta < tb ? 1 : ta > tb ? -1 : String(b.nomor_pemakaian).localeCompare(String(a.nomor_pemakaian));
  });
  return { dari: d.dari, sampai: d.sampai, pemakaian: rows.map(pemakaianKeJson_) };
}

/** Selesaikan satu baris selisih MENUNGGU dengan satu cara (lihat daftar di atas). SUSULAN oleh admin = satu MCB per panggilan. */
function selesaikanSelisih_(sesi, data, platform) {
  wajibAdminGudang_(sesi);
  wajibKonfigGudang_();
  var p = pisahFoto_(data);
  if (!String(p.sisa.catatan === undefined || p.sisa.catatan === null ? '' : p.sisa.catatan).trim()) throw new SisiError_('ALASAN_WAJIB');
  var d = validasi_(p.sisa, { selisihId: { tipe: 'uuid', wajib: true },
    cara: { tipe: 'pilihan', wajib: true, pilihan: ['HILANG', 'TAMBAHAN_MASUK', 'SALAH_CATAT', 'SALAH_HITUNG', 'SUSULAN'] },
    catatan: { tipe: 'teks', wajib: true, maks: 200 }, nomorMeter: { tipe: 'teks', maks: 30 }, keperluan: { tipe: 'teks', maks: 200 }, pemakaianId: { tipe: 'uuid' } });
  if (d.cara === 'SUSULAN') {
    if (!d.nomorMeter) throw new SisiError_('FIELD_WAJIB', 'nomorMeter');
    if (!d.keperluan) throw new SisiError_('FIELD_WAJIB', 'keperluan');
    d.keperluan = keperluanBakuMcb_(d.keperluan);
  }
  var bytes = d.cara === 'SUSULAN' ? bacaFotoGudang_(p.foto, false) : null;
  var mcbId = String(materialMcb_().material_id);
  return denganLock_(function () {
    var ts = tabelGudang_('db_Stok_Selisih'), tp = tabelGudang_('db_Stok_Pemeriksaan');
    var s = ts.rows.filter(function (r) { return String(r.selisih_id) === d.selisihId; })[0];
    if (!s) throw new SisiError_('SELISIH_TIDAK_DITEMUKAN');
    if (String(s.status) !== 'MENUNGGU') throw new SisiError_('SELISIH_TIDAK_VALID');
    var boleh = String(s.arah) === 'KURANG' ? GUD_CARA_KURANG_ : GUD_CARA_LEBIH_;
    if (boleh.indexOf(d.cara) === -1) throw new SisiError_('SELISIH_TIDAK_VALID');
    var pr = tp.rows.filter(function (r) { return String(r.pemeriksaan_id) === String(s.pemeriksaan_id); })[0];
    if (!pr) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'pemeriksaan');
    var tim = String(s.tim_id), sekarang = waktuWib_(sekarangMsGud_(), true), n = Number(s.selisih);
    var k = kunciJenis_({ material_id: mcbId, daya: s.daya, merk: s.merk, status_mcb: s.status_mcb });
    var tm = tabelGudang_('db_Material_Mutasi');
    var mutasi = function (jenis, jumlah) {
      return { jenis_mutasi: jenis, lokasi: tim, material_id: mcbId, daya: String(s.daya), merk: String(s.merk), status_mcb: String(s.status_mcb), jumlah: jumlah,
        ref_jenis: 'SELISIH', ref_id: d.selisihId, catatan: d.catatan };
    };

    if (d.cara === 'SUSULAN') {
      var mulai = mulaiShiftMs_(tglSel_(pr.tanggal), Number(pr.shift)), lalu = shiftYandal_(mulai - 1);
      var ks = kodeShiftTim_(tim, lalu.tanggal, lalu.no);
      if (!ks) throw new SisiError_('SHIFT_SEBELUMNYA_TIDAK_ADA');
      if ((saldoMcbTim_(tm.rows, tim, mcbId)[k] || 0) < 1) throw new SisiError_('STOK_TIDAK_CUKUP');
      var t = tabelGudang_('db_Pemakaian_MCB'), idPakai = d.pemakaianId || uuid_();
      if (pemakaianAda_(t.rows, idPakai)) return { selisihId: d.selisihId, duplikat: true };
      var h = terapkanSusulan_(sesi, { t: t, ts: ts, tp: tp, tm: tm, s: s, pr: pr, ks: ks, lalu: lalu, mcbId: mcbId, pemakaianId: idPakai, nomorMeter: d.nomorMeter,
        keperluan: d.keperluan, bytes: bytes, platform: platform, catatan: d.catatan });
      return { selisihId: d.selisihId, nomorPemakaian: h.nomor, selisih: selisihKeJson_(s), pemeriksaanStatus: h.statusPemeriksaan };
    }

    var statusPr = String(pr.status);
    if (d.cara === 'SALAH_HITUNG') {
      var ubah = ts.rows.filter(function (r) { return String(r.pemeriksaan_id) === String(s.pemeriksaan_id) && String(r.status) === 'MENUNGGU'; }).map(function (r) {
        return { r: r, u: { status: 'SELESAI', cara_penyelesaian: 'SALAH_HITUNG', catatan_admin: d.catatan, diselesaikan_oleh: sesi.userId, diselesaikan_pada: sekarang } };
      });
      tulisBlok_(ts, ubah, []);
      tulisBlok_(tp, [{ r: pr, u: { status: 'DIKEMBALIKAN', diubah_pada: sekarang, diubah_oleh: sesi.userId } }], []);
      statusPr = 'DIKEMBALIKAN';
    } else {
      if (d.cara === 'HILANG' && (saldoMcbTim_(tm.rows, tim, mcbId)[k] || 0) < -n) throw new SisiError_('STOK_TIDAK_CUKUP');
      if (d.cara === 'HILANG') tulisMutasi_(sesi, tm, [mutasi('HILANG', n)]);
      if (d.cara === 'TAMBAHAN_MASUK') tulisMutasi_(sesi, tm, [mutasi('TAMBAHAN', n)]);
      tulisBlok_(ts, [{ r: s, u: { status: 'SELESAI', cara_penyelesaian: d.cara, catatan_admin: d.catatan, diselesaikan_oleh: sesi.userId, diselesaikan_pada: sekarang } }], []);
      var semua = ts.rows.filter(function (r) { return String(r.pemeriksaan_id) === String(s.pemeriksaan_id); }).every(function (r) { return String(r.status) === 'SELESAI'; });
      if (semua) {
        tulisBlok_(tp, [{ r: pr, u: { status: 'DISETUJUI', diubah_pada: sekarang, diubah_oleh: sesi.userId } }], []);
        statusPr = 'DISETUJUI';
      }
    }
    auditLog_(sesi, 'GUDANG_SELISIH', 'db_Stok_Selisih', d.cara + ' ' + String(s.daya) + ' ' + String(s.merk) + ' ' + n + ': ' + d.catatan, platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { selisihId: d.selisihId, selisih: selisihKeJson_(s), pemeriksaanStatus: statusPr };
  });
}

/** Pemakaian + revision yang cocok, bukan BATAL. */
function pemakaianBisaDiubah_(t, id, revision) {
  var r = pemakaianAda_(t.rows, id);
  if (!r) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'pemakaian');
  if (String(r.jenis_catatan) === 'BATAL') throw new SisiError_('PEMAKAIAN_BATAL');
  if ((Number(r.revision) || 1) !== revision) throw new SisiError_('DATA_BERUBAH', 'pemakaian');
  return r;
}

/** Koreksi isi pemakaian (Nomor Meter, Keperluan, Daya, Merk, Status MCB). Ganti jenis MCB memindahkan stok. Alasan wajib. */
function koreksiPemakaian_(sesi, data, platform) {
  wajibAdminGudang_(sesi);
  wajibKonfigGudang_();
  alasanWajib_(data);
  var d = validasi_(data, { pemakaianId: { tipe: 'uuid', wajib: true }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 1 },
    nomorMeter: { tipe: 'teks', maks: 30 }, keperluan: { tipe: 'teks', maks: 200 }, daya: { tipe: 'teks', maks: 20 }, merk: { tipe: 'teks', maks: 40 },
    statusMcb: { tipe: 'pilihan', pilihan: GUD_STATUS_MCB_ }, alasan: { tipe: 'teks', wajib: true, maks: 200 } });
  var mcbId = String(materialMcb_().material_id);
  return denganLock_(function () {
    var t = tabelGudang_('db_Pemakaian_MCB');
    var r = pemakaianBisaDiubah_(t, d.pemakaianId, d.revision);
    if (d.keperluan !== undefined && d.keperluan !== String(r.keperluan)) d.keperluan = keperluanBakuMcb_(d.keperluan);   // keperluan lama di luar master yang tidak diubah tetap sah
    if (d.merk !== undefined && d.merk !== String(r.merk_mcb)) d.merk = merkBakuMcb_(d.merk);   // merk lama di luar master yang tidak diubah tetap sah
    var peta = { nomor_meter: d.nomorMeter, keperluan: d.keperluan, daya: d.daya, merk_mcb: d.merk, status_mcb: d.statusMcb }, u = {}, log = [];
    Object.keys(peta).forEach(function (kol) {
      if (peta[kol] === undefined || peta[kol] === String(r[kol])) return;
      u[kol] = peta[kol];
      log.push({ jenis_objek: 'PEMAKAIAN', objek_id: d.pemakaianId, kolom: kol, nilai_lama: String(r[kol]), nilai_baru: peta[kol], alasan: d.alasan });
    });
    if (!log.length) return { pemakaianId: d.pemakaianId, tanpaPerubahan: true, revision: Number(r.revision) || 1 };
    var lama = kunciJenis_({ material_id: mcbId, daya: r.daya, merk: r.merk_mcb, status_mcb: r.status_mcb });
    var baru = kunciJenis_({ material_id: mcbId, daya: u.daya || r.daya, merk: u.merk_mcb || r.merk_mcb, status_mcb: u.status_mcb || r.status_mcb });
    var tm = null;
    if (lama !== baru) {
      tm = tabelGudang_('db_Material_Mutasi');
      if ((saldoMcbTim_(tm.rows, String(r.tim_id), mcbId)[baru] || 0) < 1) throw new SisiError_('STOK_TIDAK_CUKUP');
    }
    var sekarang = waktuWib_(sekarangMsGud_(), true);
    if (tm) {
      var a = jenisDariKunci_(lama, 0), b = jenisDariKunci_(baru, 0);
      var mut = function (j, jumlah) {
        return { jenis_mutasi: 'KOREKSI_TIM', lokasi: String(r.tim_id), material_id: mcbId, daya: j.daya, merk: j.merk, status_mcb: j.statusMcb, jumlah: jumlah,
          ref_jenis: 'KOREKSI_PEMAKAIAN', ref_id: d.pemakaianId, catatan: d.alasan };
      };
      tulisMutasi_(sesi, tm, [mut(a, 1), mut(b, -1)]);
    }
    u.jenis_catatan = 'DIKOREKSI'; u.diubah_pada = sekarang; u.diubah_oleh = sesi.userId;
    tulisBlok_(t, [{ r: r, u: u }], []);
    tulisLogKoreksi_(sesi, tabelGudang_('db_Material_LogKoreksi'), log);
    auditLog_(sesi, 'GUDANG_KOREKSI_PAKAI', String(r.nomor_pemakaian), log.map(function (e) { return e.kolom; }).join(',') + ': ' + d.alasan, platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { pemakaianId: d.pemakaianId, tanpaPerubahan: false, revision: Number(r.revision) };
  });
}

/** Batalkan pemakaian: MCB kembali ke stok tim (mutasi pembalik), baris ditandai BATAL, nomor tidak dipakai ulang. */
function batalkanPemakaian_(sesi, data, platform) {
  wajibAdminGudang_(sesi);
  wajibKonfigGudang_();
  alasanWajib_(data);
  var d = validasi_(data, { pemakaianId: { tipe: 'uuid', wajib: true }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 1 }, alasan: { tipe: 'teks', wajib: true, maks: 200 } });
  var mcbId = String(materialMcb_().material_id);
  return denganLock_(function () {
    var t = tabelGudang_('db_Pemakaian_MCB');
    var r = pemakaianBisaDiubah_(t, d.pemakaianId, d.revision);
    var tm = tabelGudang_('db_Material_Mutasi');
    tulisMutasi_(sesi, tm, [{ jenis_mutasi: 'KOREKSI_TIM', lokasi: String(r.tim_id), material_id: mcbId, daya: String(r.daya), merk: String(r.merk_mcb), status_mcb: String(r.status_mcb),
      jumlah: 1, ref_jenis: 'BATAL_PEMAKAIAN', ref_id: d.pemakaianId, catatan: d.alasan }]);
    var lama = String(r.jenis_catatan);
    tulisBlok_(t, [{ r: r, u: { jenis_catatan: 'BATAL', diubah_pada: waktuWib_(sekarangMsGud_(), true), diubah_oleh: sesi.userId } }], []);
    tulisLogKoreksi_(sesi, tabelGudang_('db_Material_LogKoreksi'), [{ jenis_objek: 'PEMAKAIAN', objek_id: d.pemakaianId, kolom: 'jenis_catatan', nilai_lama: lama, nilai_baru: 'BATAL', alasan: d.alasan }]);
    auditLog_(sesi, 'GUDANG_BATAL_PAKAI', String(r.nomor_pemakaian), d.alasan, platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    return { pemakaianId: d.pemakaianId, revision: Number(r.revision) };
  });
}
