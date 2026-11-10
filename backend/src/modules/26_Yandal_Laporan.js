/**
 * v0.99.0 (permintaan Master Guswan 18 Okt 2026): Laporan per Tim untuk tim YANDAL (Operasi > Laporan per Tim, admin).
 *
 *  getLaporanTimYandal { tanggal?, timId? }  satu tanggal OPERASIONAL (shift 3 = 00:00-08:00 hari berikutnya), semua tim
 *                                            YANDAL aktif (atau satu tim), tiap tim 3 shift:
 *    - status login shift: BELUM_MULAI (jadwal belum tiba) | BELUM_LOGIN (shift berjalan, belum ada yan_Shift) |
 *      LOGIN (shift berjalan, sudah check-in) | SELESAI (shift lewat, ada yan_Shift) | TIDAK_LOGIN (shift lewat tanpa yan_Shift)
 *    - crew, jam check-in, terlambat, jumlah login, HP yang masih login (yan_Login tanpa logout, sesi belum habis),
 *      riwayat login per HP (yan_Login)
 *    - rekap P0 dihitung langsung dari yan_P0 (mesin rekap shift yang sama, hitungRekapShift_) + daftar P0 shift itu.
 *
 * Hanya baca, tanpa lock. Menu ROW_LAPORAN (sama dengan Laporan per Tim), peran BUKAN PETUGAS (ADMIN / SUPER / ADMIN_ES)
 * dicek paling awal. Tanggal maks 31 hari ke belakang, tidak boleh lewat tanggal operasional sekarang.
 */
var YAN_LAP_MAKS_HARI_ = 31;
var YAN_LAP_STATUS_ = ['BELUM_MULAI', 'BELUM_LOGIN', 'LOGIN', 'SELESAI', 'TIDAK_LOGIN'];

function wajibAdminLaporanYandal_(sesi) {
  if (!sesi || sesi.role === 'PETUGAS' || ROLE_VALID_().indexOf(sesi.role) === -1) {
    throw new SisiError_('AKSES_DITOLAK', 'laporan tim Yandal khusus admin');
  }
}

/** Sel waktu (Date / ISO / 'yyyy-MM-dd HH:mm:ss' WIB) -> 'yyyy-MM-dd HH:mm:ss' WIB, kosong = ''. */
function wibSelYandal_(v) {
  var ms = msWaktu_(v);
  return ms === null ? '' : waktuWib_(ms, true);
}

/** Status login satu shift (murni). ada = baris yan_Shift AKTIF, j = jadwalBarisShift_, now = ms server. */
function statusLoginShift_(ada, j, now) {
  if (now < j.mulai) return 'BELUM_MULAI';
  if (now < j.akhir) return ada ? 'LOGIN' : 'BELUM_LOGIN';
  return ada ? 'SELESAI' : 'TIDAK_LOGIN';
}

/** Riwayat login satu shift dari baris yan_Login (urut waktu masuk). */
function loginShiftYandal_(rows, now) {
  return rows.map(function (r) {
    var sampai = msWaktu_(r['Sesi Sampai']), logout = wibSelYandal_(r['Waktu Logout']);
    return {
      waktuMasuk: wibSelYandal_(r['Waktu Masuk'] || r['Waktu Login']), perangkat: teksSel_(r.Perangkat),
      platform: teksSel_(r.Platform), petugas: teksSel_(r.Petugas), waktuLogout: logout,
      alasanLogout: teksSel_(r['Alasan Logout']),
      aktif: !logout && sampai !== null && now < sampai
    };
  }).sort(function (a, b) { return a.waktuMasuk < b.waktuMasuk ? -1 : a.waktuMasuk > b.waktuMasuk ? 1 : 0; });
}

/** Susun laporan (murni, bisa dites). */
function susunLaporanTimYandal_(o) {
  var tglShift = o.tanggal, now = o.now;
  var shiftTim = {};   // timId|no -> baris yan_Shift
  o.shiftRows.forEach(function (r) {
    if (!r.shift_id || r.status !== 'AKTIF' || tglSel_(r.Tanggal) !== tglShift) return;
    var k = String(r.tim_id) + '|' + Number(r.Shift);
    if (!shiftTim[k]) shiftTim[k] = r;
  });
  var idShift = {};
  Object.keys(shiftTim).forEach(function (k) { idShift[String(shiftTim[k].shift_id)] = k; });
  var p0Per = {}, loginPer = {};
  o.p0Rows.forEach(function (r) {
    var k = idShift[String(r.shift_id)];
    if (k && r.p0_id) (p0Per[k] = p0Per[k] || []).push(r);
  });
  o.loginRows.forEach(function (r) {
    var k = idShift[String(r.shift_id)];
    if (!k && tglSel_(r.Tanggal) === tglShift && r.tim_id) k = String(r.tim_id) + '|' + Number(r.Shift);
    if (k) (loginPer[k] = loginPer[k] || []).push(r);
  });
  var aktifTim = {};
  o.petugasRows.forEach(function (p) {
    if (p.petugas_id && isAktif_(p.aktif) && p.tim) aktifTim[String(p.tim)] = (aktifTim[String(p.tim)] || 0) + 1;
  });
  var tim = timYandal_(o.timRows).filter(function (t) { return !o.timId || String(t.tim_id) === String(o.timId); }).map(function (t) {
    var timId = String(t.tim_id);
    var shift = [1, 2, 3].map(function (no) {
      var k = timId + '|' + no, r = shiftTim[k] || null;
      var j = jadwalBarisShift_({ Tanggal: tglShift, Shift: no });
      var status = statusLoginShift_(!!r, j, now);
      var p0Baris = (p0Per[k] || []).filter(function (x) { return String(x.status || 'AKTIF') !== 'BATAL'; });
      var rek = hitungRekapShift_(p0Baris, j, now >= j.sampai);
      var login = loginShiftYandal_(loginPer[k] || [], now);
      var hasil = {
        no: no, jam: YAN_JAM_SHIFT_[no], status: status,
        mulai: new Date(j.mulai).toISOString(), akhir: new Date(j.akhir).toISOString(),
        menitBelumLogin: status === 'BELUM_LOGIN' ? Math.max(0, Math.floor((now - j.mulai) / 60e3)) : 0,
        shiftId: r ? String(r.shift_id) : '', kodeShift: r ? teksSel_(r['Kode Shift']) : '',
        petugas: r ? [teksSel_(r['Petugas 1']), teksSel_(r['Petugas 2'])].filter(Boolean) : [],
        checkIn: r ? wibSelYandal_(r['Jam Check-in']) : '', terlambat: r ? angkaSel_(r['Terlambat (menit)']) : 0,
        jumlahLogin: r ? Math.max(angkaSel_(r['Jumlah Login']), login.length) : login.length,
        hpAktif: login.filter(function (x) { return x.aktif; }).length,
        login: login,
        rekapFinal: r ? teksWaktuYandal_(r['Rekap Final']) : '',
        rekap: {
          jumlahP0: rek['Jumlah P0'], proses: rek['P0 Proses'], selesai: rek['P0 Selesai'], menunggu: rek['P0 Menunggu Verifikasi'],
          approved: rek['P0 Approved'], rejected: rek['P0 Rejected'], totalPoint: rek['Total Point'],
          totalDurasi: rek['Total Durasi (menit)'] || 0, jamEfektif: rek['Jam Efektif'] || 0,
          persenEfektif: rek['% Efektif'] || 0, totalJarak: rek['Total Jarak (km)'] || 0
        },
        p0: p0Baris.map(ringkasP0Arsip_).sort(function (a, b) { return a.kodeP0 < b.kodeP0 ? -1 : a.kodeP0 > b.kodeP0 ? 1 : 0; })
      };
      return hasil;
    });
    return { timId: timId, nama: String(t.nama), kode: pad2_(t.kode), petugasAktif: aktifTim[timId] || 0, shift: shift };
  });
  var sh = shiftYandal_(now), ringkas = null;
  if (sh.tanggal === tglShift) {
    var sudah = 0;
    tim.forEach(function (t) { if (t.shift[sh.no - 1].status === 'LOGIN') sudah++; });
    ringkas = { shift: sh.no, jam: sh.jam, jumlahTim: tim.length, sudahLogin: sudah, belumLogin: tim.length - sudah };
  }
  return {
    tanggal: tglShift, hari: hariDari_(tglShift),
    sekarang: { no: sh.no, tanggal: sh.tanggal, jam: sh.jam, waktu: waktuWib_(now, true) },
    ringkas: ringkas, tim: tim
  };
}

function getLaporanTimYandal_(sesi, data) {
  wajibAdminLaporanYandal_(sesi);
  var d = validasi_(data, { tanggal: { tipe: 'tanggal' }, timId: { tipe: 'uuid' } });
  var now = sekarangMsYandal_(), sh = shiftYandal_(now);
  var tanggal = d.tanggal || sh.tanggal;
  if (tanggal > sh.tanggal) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', tanggal);
  if (selisihHari_(tanggal, sh.tanggal) > YAN_LAP_MAKS_HARI_) throw new SisiError_('TANGGAL_DI_LUAR_BATAS', tanggal);
  var t = bacaSheetYandal_(['yan_Shift', 'yan_P0', 'yan_Login']);
  return susunLaporanTimYandal_({
    tanggal: tanggal, now: now, timId: d.timId || '',
    timRows: tabel_('MASTER_SHEET_ID', 'db_Tim').rows, petugasRows: tabelPetugas_().rows,
    shiftRows: t.yan_Shift.rows, p0Rows: t.yan_P0.rows, loginRows: t.yan_Login.rows
  });
}
