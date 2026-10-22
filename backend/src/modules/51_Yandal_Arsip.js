/**
 * v0.63.5 (keputusan kvlar 8 Okt 2026): Arsip P0 + Rank Yandal (hanya baca).
 *
 * getArsipYandal { dari, sampai }: shift tim akun YANDAL sendiri yang SUDAH selesai di rentang tanggal operasional
 *   (maks 31 hari, sampai hari ini), lengkap dengan rekap shift dan daftar P0-nya. HP menyusun tahun > bulan >
 *   tanggal > shift > P0 dan menyimpannya supaya bisa dibuka offline.
 * getRankYandal { periode: 'YYYY-MM' }: rank bulanan semua petugas Yandal (rumus v1, point / jam hanya P0 Approved):
 *   %Shift = semua shift yang dimasuki / 24 (v0.63.6, termasuk shift yang P0-nya semua di-reject), %P0 = point / 1000, %Jam = menit efektif / (shift x 480 x 85%), %VCC = belum ada data (0).
 *   Total = Jam 55% + Shift 15% + P0 18% + VCC 12% (tiap komponen maks 100%). Rank gaya olahraga (seri = rank sama),
 *   urutan seri: total > menit efektif > shift > point > jumlah P0. Disimpan di cache 10 menit.
 */
var YAN_ARSIP_MAKS_HARI_ = 31;
var YAN_RANK_TARGET_ = { shift: 24, point: 1000, efektif: 0.85, menitShift: 480 };
var YAN_RANK_BOBOT_ = { jam: 55, shift: 15, p0: 18, vcc: 12 };
var YAN_RANK_CACHE_DETIK_ = 600;
var YAN_RANK_MAKS_BULAN_ = 24;

/** Sel waktu ke teks WIB 'yyyy-MM-dd HH:mm:ss' (Date dari Sheets) atau apa adanya. */
function teksWaktuYandal_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : waktuWib_(v.getTime(), true);
  return v === null || v === undefined ? '' : String(v);
}

function teksSel_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

function p0Approved_(r) {
  return r.p0_id && String(r.status || 'AKTIF') !== 'BATAL' && teksSel_(r['Status P0']).toUpperCase() === 'SELESAI' &&
    teksSel_(r['Status Approval']).toLowerCase() === 'approved';
}

function ringkasP0Arsip_(r) {
  var nama = teksSel_(r['Nama Pekerjaan']), lain = teksSel_(r['Pekerjaan Lainnya']);
  return {
    p0Id: String(r.p0_id), kodeP0: teksSel_(r['Kode P0']), namaPekerjaan: lain ? nama + ' (' + lain + ')' : nama,
    penyulang: teksSel_(r.Penyulang), section: teksSel_(r.Section), daerah: teksSel_(r.Daerah),
    statusP0: teksSel_(r['Status P0']).toUpperCase(), statusApproval: teksSel_(r['Status Approval']),
    alasanRejected: teksSel_(r['Alasan Rejected']), point: angkaSel_(r.Point), durasi: angkaSel_(r['Durasi (menit)']),
    jarakM: angkaSel_(r['Jarak Closing P0 (m)']), waktuSebelum: teksWaktuYandal_(r['Waktu Sebelum']),
    waktuSesudah: teksWaktuYandal_(r['Waktu Sesudah']), catatan: teksSel_(r.Catatan)
  };
}

function getArsipYandal_(sesi, data, platform) {
  if (!petugasYandal_(sesi) || !sesi.timId) throw new SisiError_('AKSES_DITOLAK', 'arsip P0 hanya akun YANDAL');
  if (platform !== 'MOBILE') throw new SisiError_('AKSES_DITOLAK', 'arsip P0 hanya dari HP');   // v0.64.1
  var d = validasi_(data, { dari: { tipe: 'tanggal', wajib: true }, sampai: { tipe: 'tanggal', wajib: true } });
  if (d.dari > d.sampai) throw new SisiError_('RENTANG_TIDAK_VALID', d.dari + '>' + d.sampai);
  var sekarang = sekarangMsYandal_();
  if (d.sampai > tglJakarta_(new Date(sekarang))) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', d.sampai);
  var hari = Math.round((Date.parse(d.sampai + 'T00:00:00Z') - Date.parse(d.dari + 'T00:00:00Z')) / 864e5) + 1;
  if (hari > YAN_ARSIP_MAKS_HARI_) throw new SisiError_('RENTANG_TERLALU_PANJANG', String(hari));

  var t = bacaSheetYandal_(['yan_Shift', 'yan_P0']);
  var shift = t.yan_Shift.rows.filter(function (r) {
    if (!r.shift_id || r.status !== 'AKTIF' || String(r.tim_id) !== String(sesi.timId)) return false;
    var tgl = tglSel_(r.Tanggal), j = jadwalBarisShift_(r);
    return tgl >= d.dari && tgl <= d.sampai && j && sekarang >= j.sampai;   // shift berjalan tampil di tab Shift ini
  });
  var perShift = {};
  shift.forEach(function (r) { perShift[String(r.shift_id)] = []; });
  t.yan_P0.rows.forEach(function (r) {
    var x = perShift[String(r.shift_id)];
    if (x && r.p0_id && String(r.status || 'AKTIF') !== 'BATAL') x.push(r);
  });
  var hasil = shift.map(function (r) {
    var p0 = perShift[String(r.shift_id)].map(ringkasP0Arsip_).sort(function (a, b) { return a.kodeP0 < b.kodeP0 ? -1 : 1; });
    var tgl = tglSel_(r.Tanggal);
    return {
      shiftId: String(r.shift_id), kodeShift: teksSel_(r['Kode Shift']), tanggal: tgl, hari: hariDari_(tgl),
      shift: Number(r.Shift), jamKerja: teksSel_(r['Jam Kerja']),
      petugas: [teksSel_(r['Petugas 1']), teksSel_(r['Petugas 2'])].filter(Boolean),
      checkIn: teksWaktuYandal_(r['Jam Check-in']), terlambat: angkaSel_(r['Terlambat (menit)']),
      rekapFinal: teksWaktuYandal_(r['Rekap Final']),
      rekap: {
        jumlahP0: angkaSel_(r['Jumlah P0']), proses: angkaSel_(r['P0 Proses']), selesai: angkaSel_(r['P0 Selesai']),
        menunggu: angkaSel_(r['P0 Menunggu Verifikasi']), approved: angkaSel_(r['P0 Approved']), rejected: angkaSel_(r['P0 Rejected']),
        totalPoint: angkaSel_(r['Total Point']), totalDurasi: angkaSel_(r['Total Durasi (menit)']),
        jamEfektif: angkaSel_(r['Jam Efektif']), persenEfektif: angkaSel_(r['% Efektif']), totalJarak: angkaSel_(r['Total Jarak (km)'])
      },
      p0: p0
    };
  }).sort(function (a, b) { return a.tanggal !== b.tanggal ? (a.tanggal < b.tanggal ? 1 : -1) : b.shift - a.shift; });
  return { dari: d.dari, sampai: d.sampai, shift: hasil };
}

/** Menit efektif P0 Approved satu shift (gabungan rentang, dipotong jam shift, maks 480). */
function menitEfektifApproved_(p0, jadwal) {
  var rentang = [];
  p0.forEach(function (r) {
    var a = msWaktu_(r['Waktu Sebelum']), b = msWaktu_(r['Waktu Sesudah']);
    if (a === null || b === null || b <= a) return;
    var x = Math.max(a, jadwal.mulai), y = Math.min(b, jadwal.akhir);
    if (y > x) rentang.push([x, y]);
  });
  rentang.sort(function (p, q) { return p[0] - q[0]; });
  var ms = 0, ujung = -Infinity;
  rentang.forEach(function (p) {
    if (p[1] <= ujung) return;
    ms += p[1] - Math.max(p[0], ujung);
    ujung = p[1];
  });
  return Math.min(YAN_RANK_TARGET_.menitShift, Math.round(ms / 60e3));
}

/** Hitung rank satu periode dari baris sheet (murni, bisa dites). */
function hitungRankYandal_(periode, shiftRows, p0Rows, petugasRows, timRows) {
  var tim = {};
  timYandal_(timRows).forEach(function (t) { tim[String(t.tim_id)] = String(t.nama); });
  var perShift = {};
  p0Rows.forEach(function (r) {
    if (p0Approved_(r)) (perShift[String(r.shift_id)] = perShift[String(r.shift_id)] || []).push(r);
  });
  var agg = {};
  var ambil = function (id) { return agg[id] || (agg[id] = { shift: 0, point: 0, menit: 0, p0: 0 }); };
  shiftRows.forEach(function (r) {
    if (!r.shift_id || r.status !== 'AKTIF' || tglSel_(r.Tanggal).slice(0, 7) !== periode) return;
    // v0.63.6 (keputusan kvlar 8 Okt 2026): SEMUA shift yang dimasuki dihitung, walau P0-nya semua di-reject.
    // Point, menit efektif, dan jumlah P0 tetap hanya dari P0 Approved.
    var ok = perShift[String(r.shift_id)] || [], j = jadwalBarisShift_(r);
    if (!j) return;
    var point = ok.reduce(function (n, x) { return n + angkaSel_(x.Point); }, 0), menit = ok.length ? menitEfektifApproved_(ok, j) : 0;
    crewDari_(r).forEach(function (id) {
      var a = ambil(id);
      a.shift++; a.point += point; a.menit += menit; a.p0 += ok.length;
    });
  });
  var orang = {};
  petugasRows.forEach(function (p) {
    if (!p.petugas_id) return;
    var id = String(p.petugas_id);
    if ((isAktif_(p.aktif) && tim[String(p.tim_yandal)]) || agg[id]) orang[id] = p;
  });
  Object.keys(agg).forEach(function (id) { if (!orang[id]) orang[id] = { petugas_id: id, nama: '-', tim_yandal: '' }; });
  var maks1 = function (x) { return Math.max(0, Math.min(1, x)); };
  var daftar = Object.keys(orang).map(function (id) {
    var p = orang[id], a = agg[id] || { shift: 0, point: 0, menit: 0, p0: 0 };
    var pj = a.shift ? maks1(a.menit / (a.shift * YAN_RANK_TARGET_.menitShift * YAN_RANK_TARGET_.efektif)) : 0;
    var ps = maks1(a.shift / YAN_RANK_TARGET_.shift), pp = maks1(a.point / YAN_RANK_TARGET_.point), pv = 0;
    var total = pj * YAN_RANK_BOBOT_.jam + ps * YAN_RANK_BOBOT_.shift + pp * YAN_RANK_BOBOT_.p0 + pv * YAN_RANK_BOBOT_.vcc;
    return {
      petugasId: id, nama: teksSel_(p.nama) || '-', tim: tim[String(p.tim_yandal)] || '', total: bulat_(total, 2),
      shift: a.shift, point: bulat_(a.point, 2), menitEfektif: a.menit, jumlahP0: a.p0,
      persen: { jam: bulat_(pj * 100, 1), shift: bulat_(ps * 100, 1), p0: bulat_(pp * 100, 1), vcc: null }
    };
  });
  var banding = function (a, b) {
    return (b.total - a.total) || (b.menitEfektif - a.menitEfektif) || (b.shift - a.shift) || (b.point - a.point) || (b.jumlahP0 - a.jumlahP0);
  };
  daftar.sort(function (a, b) { return banding(a, b) || a.nama.localeCompare(b.nama); });
  daftar.forEach(function (x, i) { x.rank = i > 0 && banding(daftar[i - 1], x) === 0 ? daftar[i - 1].rank : i + 1; });
  return daftar;
}

function getRankYandal_(sesi, data) {
  if (!sesi || (sesi.role === 'PETUGAS' && !petugasYandal_(sesi))) throw new SisiError_('AKSES_DITOLAK', 'rank Yandal');
  var sekarang = sekarangMsYandal_();
  var d = validasi_(data, { periode: { tipe: 'teks', maks: 7, pola: /^\d{4}-(0[1-9]|1[0-2])$/ } });
  var bulanIni = tglJakarta_(new Date(sekarang)).slice(0, 7);
  var periode = d.periode || bulanIni;
  // v0.64.1 (audit guard): periode masa depan / lebih dari 24 bulan lalu ditolak (tiap periode = baca sheet penuh).
  var selisih = (Number(bulanIni.slice(0, 4)) - Number(periode.slice(0, 4))) * 12 + Number(bulanIni.slice(5, 7)) - Number(periode.slice(5, 7));
  if (selisih < 0 || selisih > YAN_RANK_MAKS_BULAN_) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', periode);
  var cache = CacheService.getScriptCache(), kunci = 'rank-yandal:v1:' + periode;
  var ada = cache.get(kunci);
  if (ada) { try { return JSON.parse(ada); } catch (e) { /* bangun ulang */ } }
  var t = bacaSheetYandal_(['yan_Shift', 'yan_P0']);
  var hasil = {
    periode: periode, diperbarui: new Date(sekarang).toISOString(),
    target: { shift: YAN_RANK_TARGET_.shift, point: YAN_RANK_TARGET_.point, efektif: YAN_RANK_TARGET_.efektif * 100 },
    bobot: YAN_RANK_BOBOT_, vccTersedia: false,
    petugas: hitungRankYandal_(periode, t.yan_Shift.rows, t.yan_P0.rows, tabelPetugas_().rows, tabel_('MASTER_SHEET_ID', 'db_Tim').rows)
  };
  try { cache.put(kunci, JSON.stringify(hasil), YAN_RANK_CACHE_DETIK_); } catch (e) { /* terlalu besar: tanpa cache */ }
  return hasil;
}
