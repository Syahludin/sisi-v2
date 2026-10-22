/**
 * v0.63.0 Modul Yandal: shift + pilih petugas saat login + pindah tim petugas (keputusan kvlar 7 Okt 2026).
 *
 * Akun tim YANDAL (db_Tim jenis YANDAL, satu akun db_Users per tim) login 2 tahap:
 *   1) login: password benar -> TIKET 10 menit (bukan token) + daftar petugas tim (db_Petugas.tim_yandal)
 *      + crew shift ini kalau shift sudah dimulai HP lain.
 *   2) mulaiShiftYandal: 1-2 petugas yang dipilih + dikonfirmasi di HP -> baris yan_Shift (sekali per tim per shift),
 *      baris yan_Login (SETIAP login, jam login tercatat), token berlaku sampai akhir shift.
 * Shift (WIB): 1 = 08:00-15:59, 2 = 16:00-23:59, 3 = 00:00-07:59 (tanggal operasional = kemarin).
 * Menit peralihan 07:59 / 15:59 / 23:59: semua token YANDAL habis (SHIFT_BERAKHIR) dan login ditolak (SHIFT_PERALIHAN).
 * Login paling cepat 08:00 / 16:00 / 00:00.
 */
var YAN_TIKET_DETIK_ = 600;
var YAN_TIKET_COBA_ = 10;
var YAN_PETUGAS_MAKS_ = 2;
var YAN_JAM_SHIFT_ = { 1: '08:00 - 16:00', 2: '16:00 - 00:00', 3: '00:00 - 08:00' };
var YAN_ANGGOTA_MIN_ = 2;   // peringatan saja (SK tim bisa berubah), tidak menolak
var YAN_ANGGOTA_MAKS_ = 8;
var YAN_UBAH_MAKS_ = 50;

/** v0.63.3 header yan_Shift (40 kolom), dipakai ADMIN_perbaruiYanShift untuk sheet lama. */
var YAN_SHIFT_HEADER_V633_ = ['No', 'Kode Header', 'Kode Shift', 'ULP', 'Hari', 'Tanggal', 'Tim', 'Shift', 'Jam Kerja',
  'Mulai Shift', 'Selesai Shift', 'Petugas 1', 'Petugas 2', 'Jumlah Petugas', 'Jam Check-in', 'Terlambat (menit)', 'Jumlah Login',
  'Jumlah P0', 'P0 Proses', 'P0 Selesai', 'P0 Menunggu Verifikasi', 'P0 Approved', 'P0 Rejected', 'Total Point',
  'Total Durasi (menit)', 'Jam Efektif', '% Efektif', 'Total Jarak (km)', 'Catatan Shift',
  'Input Oleh', 'Timestamp', 'Timestamp Update', 'shift_id', 'tim_id', 'petugas_id_1', 'petugas_id_2',
  'status', 'revision', 'dibuat_oleh', 'diubah_oleh'];

/** v0.63.4 header yan_Shift (41 kolom): + Rekap Final (waktu rekap akhir shift, kosong = belum direkap). */
var YAN_SHIFT_HEADER_ = YAN_SHIFT_HEADER_V633_.slice(0, 29).concat(['Rekap Final'], YAN_SHIFT_HEADER_V633_.slice(29));

/** Header yan_P0 v0.63.4 (48 kolom), untuk migrasi ADMIN_perbaruiYanShift. */
var YAN_P0_HEADER_V634_ = ['No', 'Kode P0', 'Kode Shift', 'ULP', 'Hari', 'Tanggal', 'Tim', 'Shift', 'Petugas', 'Nama Pekerjaan',
  'Pekerjaan Lainnya', 'Bobot', 'Penyulang', 'Section', 'Daerah', 'Lat', 'Long', 'Lat Closing', 'Long Closing', 'Jarak (km)',
  'Waktu Dibuat', 'Waktu Sebelum', 'Waktu Pekerjaan', 'Waktu Sesudah', 'Durasi (menit)', 'Status P0', 'Status Approval',
  'Alasan Rejected', 'Approved Oleh', 'Waktu Approve', 'Point', 'Foto Sebelum', 'Foto Pekerjaan', 'Foto Sesudah', 'Catatan',
  'Input Oleh', 'Timestamp', 'Timestamp Update', 'Waktu Diterima', 'p0_id', 'shift_id', 'tim_id', 'jenis_id', 'section_id',
  'status', 'revision', 'dibuat_oleh', 'diubah_oleh'];

/**
 * v0.64.3 yan_P0 (66 kolom, draf disetujui kvlar 8 Okt 2026), satu baris per Penugasan P0. Diisi modul Penugasan P0.
 * A Identitas | B Pekerjaan | C Lokasi | D Waktu | E Foto | F Status, Approval, Point | G Audit | H Teknis.
 * - Kode P0 = <Kode Shift>-P0.nnn dibuat SERVER saat pertama diterima (nomor HP hanya sementara), reset per shift.
 * - Petugas = salinan kru shift saat P0 dibuat. Koordinat / Koordinat Closing = teks "lat,long" 6 desimal (dari Lat/Long).
 * - Lat/Long = GPS foto Sebelum, Lat/Long Closing = GPS foto Sesudah. Jarak = closing ke pekerjaan, Jarak Antar P0 = dari P0
 *   sebelumnya di shift yang sama (urut Waktu Dibuat), P0 pertama 0.
 * - Waktu * = jam terpercaya HP (server + monoton), WIB 'yyyy-MM-dd HH:mm:ss'. Sumber Waktu SERVER / HP / CAMPUR,
 *   Selisih Jam HP = selisih terbesar jam HP vs jam terpercaya. Waktu Diterima = jam server saat data terakhir masuk.
 * - Foto * = nama file ber-WM, Link Drive * = URL file privat (=IMAGE() tidak bisa untuk file privat).
 * - Status P0 PROSES / SELESAI. Status Approval kosong (PROSES) / Menunggu / Approved / Rejected.
 * - Point = Skor Durasi + Bobot x Pengali (hitungPointP0_), Rejected = 0. Bobot disalin dari db_Jenis_Pekerjaan.bobot;
 *   Lain - Lain = kosong sampai admin mengisi bobot saat approval (bobotApprovalP0_).
 */
var YAN_P0_HEADER_ = [
  // A Identitas
  'No', 'Kode Header', 'Kode Shift', 'Kode P0', 'ULP', 'Hari', 'Tanggal', 'Tim', 'Shift', 'Petugas',
  // B Pekerjaan
  'Nama Pekerjaan', 'Pekerjaan Lainnya', 'Penyulang', 'Section', 'Daerah', 'Catatan',
  // C Lokasi
  'Koordinat', 'Lat', 'Long', 'Koordinat Closing', 'Lat Closing', 'Long Closing', 'Jarak Closing P0 (m)', 'Jarak Antar P0 (m)',
  // D Waktu
  'Waktu Dibuat', 'Waktu Sebelum', 'Waktu Pekerjaan', 'Waktu Sesudah', 'Durasi (menit)', 'Sumber Waktu',
  'Selisih Jam HP (menit)', 'Waktu Diterima',
  // E Foto
  'Foto Sebelum', 'Link Drive Sebelum', 'Foto Pekerjaan', 'Link Drive Pekerjaan', 'Foto Sesudah', 'Link Drive Sesudah',
  // F Status, Approval, Point
  'Status P0', 'Status Approval', 'Alasan Rejected', 'Approved Oleh', 'Waktu Approve', 'Skor Durasi', 'Bobot', 'Pengali', 'Point',
  // G Audit
  'Input Oleh', 'Timestamp', 'Timestamp Update',
  // H Teknis
  'p0_id', 'shift_id', 'tim_id', 'jenis_id', 'section_id', 'petugas_id_1', 'petugas_id_2',
  'foto_id_sebelum', 'foto_id_pekerjaan', 'foto_id_sesudah', 'foto_meta', 'install_id',
  'status', 'revision', 'dibuat_oleh', 'diubah_oleh'];

/**
 * v0.65.8 / v0.65.9 (keputusan kvlar 8 Okt 2026): jarak P0 dalam METER (bulat), kolom jarak closing bernama
 * "Jarak Closing P0 (m)". Header lama 66 kolom disimpan untuk migrasi perbaruiYanP0_ (nama diganti, nilai dihitung ulang):
 *  v0.64.3: Jarak (km), Jarak Antar P0 (km)      v0.65.8: Jarak (m)      v0.65.9: Jarak Closing P0 (tanpa satuan)
 */
var YAN_P0_GANTI_NAMA_V658_ = { 'Jarak (km)': 'Jarak Closing P0 (m)', 'Jarak Antar P0 (km)': 'Jarak Antar P0 (m)' };
function headerP0Lama_(ganti) {
  return YAN_P0_HEADER_.map(function (h) {
    for (var k in ganti) if (ganti[k] === h) return k;
    return h;
  });
}
var YAN_P0_HEADER_V643_ = headerP0Lama_(YAN_P0_GANTI_NAMA_V658_);
var YAN_P0_HEADER_V658_ = headerP0Lama_({ 'Jarak (m)': 'Jarak Closing P0 (m)' });
var YAN_P0_HEADER_V659_ = headerP0Lama_({ 'Jarak Closing P0': 'Jarak Closing P0 (m)' });   // v0.65.10: + satuan (m)

/**
 * v0.66.0 (draf disetujui kvlar 9 Okt 2026): yan_Switching = anak P0 "Pengecekan Switching" (61 kolom).
 * Satu P0 boleh beberapa switching, Kode Switching = <Kode P0>-SWC.nnn (nomor per P0). Nama Switching = bagian depan
 * nama section ("LBS A - LBS B" = "LBS A"), hanya LBS / ACR. Indikator Nyala / Padam, Arus R/S/T (sisi TM, tanpa N).
 * Foto Arus wajib (Jam Pengecekan + koordinat dari foto ini), Foto Arus Gangguan 1-5 opsional.
 */
var YAN_SWITCHING_HEADER_ = [
  // A Identitas
  'No', 'Kode Header', 'Kode Shift', 'Kode P0', 'Kode Switching', 'ULP', 'Hari', 'Tanggal', 'Tim', 'Shift', 'Petugas',
  // B Switching
  'Penyulang', 'Section', 'Nama Switching', 'Catatan',
  // C Lokasi
  'Koordinat', 'Lat', 'Long',
  // D Pengecekan
  'Jam Pengecekan', 'Indikator Remote', 'Indikator Local', 'Indikator Protection', 'Indikator Reclose',
  'Arus R (A)', 'Arus S (A)', 'Arus T (A)',
  // E Waktu
  'Sumber Waktu', 'Selisih Jam HP (menit)', 'Waktu Diterima',
  // F Foto
  'Foto Arus', 'Link Drive Arus',
  'Foto Arus Gangguan 1', 'Link Drive Arus Gangguan 1', 'Foto Arus Gangguan 2', 'Link Drive Arus Gangguan 2',
  'Foto Arus Gangguan 3', 'Link Drive Arus Gangguan 3', 'Foto Arus Gangguan 4', 'Link Drive Arus Gangguan 4',
  'Foto Arus Gangguan 5', 'Link Drive Arus Gangguan 5',
  // G Audit
  'Input Oleh', 'Timestamp', 'Timestamp Update',
  // H Teknis
  'switching_id', 'p0_id', 'shift_id', 'tim_id', 'section_id', 'foto_id_arus',
  'foto_id_gangguan_1', 'foto_id_gangguan_2', 'foto_id_gangguan_3', 'foto_id_gangguan_4', 'foto_id_gangguan_5',
  'foto_meta', 'install_id', 'status', 'revision', 'dibuat_oleh', 'diubah_oleh'];

/** v0.65.12: durasi (ms) ke menit 2 desimal, negatif = 0. */
function menitP0_(ms) { return Math.max(0, bulat_(ms / 60e3, 2)); }

/** Jarak dua titik dalam meter (bulat), dari jarakKm_. */
function jarakMeter_(lat1, lon1, lat2, lon2) { return Math.round(jarakKm_(lat1, lon1, lat2, lon2) * 1000); }

/**
 * v0.64.6 (keputusan kvlar 8 Okt 2026): "Lain - Lain" = baris master db_Jenis_Pekerjaan (modul YANDAL) dengan bobot KOSONG.
 * Bobot P0 Lain - Lain diisi admin per P0 saat approval (seperti bobotManual v1), wajib sebelum Approved.
 */
var YAN_PEKERJAAN_LAIN_ = 'Lain - Lain';

/** Nama pekerjaan = Lain - Lain (tanpa beda huruf besar/kecil & spasi ganda). */
function pekerjaanLainP0_(nama) {
  return String(nama || '').trim().replace(/\s+/g, ' ').toLowerCase() === YAN_PEKERJAAN_LAIN_.toLowerCase();
}

/**
 * Bobot yang dipakai saat approval. Biasa = bobot master (disalin ke yan_P0 saat diterima). Lain - Lain = bobot isian
 * admin (wajib saat Approved, angka 0..100). Rejected tidak butuh bobot. Hasil angka, atau '' kalau tidak dipakai.
 */
function bobotApprovalP0_(namaPekerjaan, bobotBaris, bobotAdmin, keputusan) {
  if (keputusan === 'Rejected') return pekerjaanLainP0_(namaPekerjaan) ? '' : bobotBaris;
  if (!pekerjaanLainP0_(namaPekerjaan)) return bobotBaris;
  var kosong = bobotAdmin === '' || bobotAdmin === null || bobotAdmin === undefined;
  var b = Number(bobotAdmin);
  if (kosong) throw new SisiError_('FIELD_WAJIB', 'bobot (Lain - Lain diisi admin)');
  if (!isFinite(b) || b < 0 || b > 100) throw new SisiError_('FORMAT_SALAH', 'bobot');
  return Math.round(b * 100) / 100;
}

/** Skor durasi P0 (menit): <=30 1, <=60 2, <=120 3, <=240 4, lebih 5. Kosong / negatif = 0. */
function skorDurasiP0_(menit) {
  var m = Number(menit);
  if (menit === '' || menit === null || menit === undefined || !isFinite(m) || m < 0) return 0;
  return m <= 30 ? 1 : m <= 60 ? 2 : m <= 120 ? 3 : m <= 240 ? 4 : 5;
}

/** Pengali bobot: 2, jadi 2,5 kalau nama pekerjaan mengandung "ROW" DAN dibuat pukul 22:00-05:00 WIB. */
function pengaliP0_(namaPekerjaan, dibuatMs) {
  if (String(namaPekerjaan || '').toUpperCase().indexOf('ROW') === -1 || !isFinite(Number(dibuatMs))) return 2;
  var menitHari = Math.floor(((Number(dibuatMs) + 7 * 3600e3) % 86400e3 + 86400e3) % 86400e3 / 60000);
  return menitHari >= 1320 || menitHari <= 300 ? 2.5 : 2;
}

/**
 * Komponen point satu P0: { skorDurasi, pengali, point }. Rejected / belum SELESAI = point 0 (komponen tetap diisi).
 * p = { statusP0, statusApproval, durasiMenit, bobot, namaPekerjaan, dibuatMs }
 */
function hitungPointP0_(p) {
  var skor = skorDurasiP0_(p.durasiMenit), pengali = pengaliP0_(p.namaPekerjaan, p.dibuatMs);
  var bobot = Number(p.bobot);
  if (!isFinite(bobot) || bobot < 0) bobot = 0;
  var dapat = String(p.statusP0 || '').toUpperCase() === 'SELESAI' && String(p.statusApproval || '') !== 'Rejected';
  return { skorDurasi: skor, pengali: pengali, point: dapat ? Math.round((skor + bobot * pengali) * 100) / 100 : 0 };
}

/** Teks koordinat "lat,long" 6 desimal tanpa spasi. Angka tidak valid = ''. */
function koordinatTeks_(lat, lng) {
  if (lat === '' || lat === null || lat === undefined || lng === '' || lng === null || lng === undefined) return '';
  var a = Number(lat), b = Number(lng);
  if (!isFinite(a) || !isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return '';
  return a.toFixed(6) + ',' + b.toFixed(6);
}

/**
 * v0.63.4 (keputusan kvlar 8 Okt 2026): sesudah akhir shift token YANDAL tidak dipakai input lagi, hanya untuk
 * KIRIM data yang sudah ada (endpoint syncShift: cekSesi, logout, nanti kirim P0 + foto). HP memaksa sync dulu,
 * baru logout. Batas mode sync = akhir shift + 24 jam; lewat itu data tetap di HP dan dikirim setelah login lagi.
 */
var YAN_SYNC_JAM_ = 24;
function syncSampaiYandal_(sampaiMs) { return sampaiMs + YAN_SYNC_JAM_ * 3600e3; }

/** Header yan_Shift v0.63.0 (untuk ADMIN_perbaruiYanShift). */
var YAN_SHIFT_HEADER_V630_ = ['No', 'Kode Header', 'Kode Shift', 'ULP', 'Hari', 'Tanggal', 'Tim', 'Shift', 'Jam Shift', 'Petugas',
  'Jumlah P0', 'Login Pertama', 'Input Oleh', 'Timestamp', 'Timestamp Update', 'shift_id', 'tim_id', 'petugas_id_1', 'petugas_id_2',
  'status', 'revision', 'dibuat_oleh', 'diubah_oleh'];

/** Kolom rekap P0 yan_Shift (awal 0). */
var YAN_REKAP_P0_ = ['Jumlah P0', 'P0 Proses', 'P0 Selesai', 'P0 Menunggu Verifikasi', 'P0 Approved', 'P0 Rejected', 'Total Point',
  'Total Durasi (menit)', 'Jam Efektif', '% Efektif', 'Total Jarak (km)'];

/** Waktu WIB 'yyyy-MM-dd HH:mm[:ss]' untuk kolom yang dibaca orang di sheet. */
function waktuWib_(ms, detik) {
  var s = new Date(ms + 7 * 3600e3).toISOString();
  return s.slice(0, 10) + ' ' + s.slice(11, detik ? 19 : 16);
}

/** Terlambat (menit, dibulatkan ke bawah, minimal 0) dari jadwal mulai shift. */
function terlambatMenit_(checkInMs, mulaiMs) { return Math.max(0, Math.floor((checkInMs - mulaiMs) / 60e3)); }

/** Kolom jadwal + crew baris yan_Shift. */
function kolomShiftYandal_(sh, crew) {
  return { 'Jam Kerja': sh.jam, 'Mulai Shift': waktuWib_(sh.mulai), 'Selesai Shift': waktuWib_(sh.mulai + 8 * 3600e3),
           'Petugas 1': crew[0] || '', 'Petugas 2': crew[1] || '', 'Jumlah Petugas': crew.filter(Boolean).length };
}

/** Jam server (ms). Satu pintu supaya bisa diganti di test. */
function sekarangMsYandal_() { return Date.now(); }

function petugasYandal_(sesi) { return !!sesi && sesi.role === 'PETUGAS' && sesi.jenisTim === 'YANDAL'; }

/**
 * Shift pada waktu ms. Hasil: { no, tanggal (operasional), kunci, jam, mulai, sampai, peralihan }.
 * sampai = menit peralihan (hh:59:00 WIB): token dibuat di shift ini berlaku SEBELUM waktu itu.
 */
function shiftYandal_(ms) {
  var w = new Date(ms + 7 * 3600e3);
  var jam = w.getUTCHours(), menit = w.getUTCMinutes();
  var no = jam < 8 ? 3 : (jam < 16 ? 1 : 2);
  var hari0 = Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) - 7 * 3600e3;   // 00:00 WIB
  var mulai = hari0 + (no === 1 ? 8 : no === 2 ? 16 : 0) * 3600e3;
  var tanggal = tglJakarta_(new Date(no === 3 ? hari0 - 1 : hari0));
  return { no: no, tanggal: tanggal, kunci: tanggal + '|' + no, jam: YAN_JAM_SHIFT_[no], mulai: mulai,
           sampai: mulai + 8 * 3600e3 - 60e3, peralihan: menit === 59 && (jam === 7 || jam === 15 || jam === 23) };
}

/** Batas token YANDAL = akhir shift saat token dibuat (dibuat_pada auth_Perangkat). Rusak / kosong = null (tolak). */
function akhirShiftToken_(r) {
  var dibuat = keDate_(r && r.dibuat_pada);
  return dibuat ? shiftYandal_(dibuat.getTime()).sampai : null;
}

/** Kode lama v1: header Y<kode tim>-<KODE_ULP><yyMMdd><00n>, shift <header>-SHF<n>.001 (1 shift per header). */
function kodeShiftYandal_(timKode, tanggal, no) {
  var h = 'Y' + pad2_(timKode) + '-' + cfg_().KODE_ULP + tanggal.slice(2).replace(/-/g, '') + pad3_(no);
  return { header: h, shift: h + '-SHF' + no + '.001' };
}

/** Sheet SiSi_Yandal (penuh), header wajib persis skema. */
function bacaSheetYandal_(nama) {
  if (!cfg_().YANDAL_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'YANDAL_SHEET_ID');
  var hasil = {};
  nama.forEach(function (n) { hasil[n] = cekHeaderSkema_(tabel_('YANDAL_SHEET_ID', n), 'YANDAL_SHEET_ID', n); });
  return hasil;
}

/** Header saja (sheet yang cuma ditambah baris, mis. yan_Login). */
function headerSheetYandal_(n) {
  if (!cfg_().YANDAL_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'YANDAL_SHEET_ID');
  return cekHeaderSkema_(headerTabel_('YANDAL_SHEET_ID', n), 'YANDAL_SHEET_ID', n);
}

function cekHeaderSkema_(t, idKey, n) {
  var ada = t.header.slice();
  while (ada.length && !ada[ada.length - 1]) ada.pop();
  if (ada.join('|') !== skemaHeader_()[idKey][n].join('|')) throw new SisiError_('CONFIG_TIDAK_VALID', 'header ' + n);
  return t;
}

/** db_Petugas (SiSi_Master). Header wajib persis skema (kolom tim_yandal = tim_id tim YANDAL). */
function tabelPetugas_() {
  return cekHeaderSkema_(tabel_('MASTER_SHEET_ID', 'db_Petugas'), 'MASTER_SHEET_ID', 'db_Petugas');
}

/** Petugas AKTIF satu tim, urut nama. */
function petugasTim_(rows, timId) {
  return rows.filter(function (p) { return p.petugas_id && isAktif_(p.aktif) && String(p.tim_yandal) === String(timId); })
    .sort(function (a, b) { return String(a.nama).localeCompare(String(b.nama)); });
}

/** { petugas_id: nama } semua baris db_Petugas (aktif atau tidak). */
function namaPetugas_(rows) {
  var o = {};
  rows.forEach(function (p) { if (p.petugas_id) o[String(p.petugas_id)] = String(p.nama).trim(); });
  return o;
}

function samaShift_(r, sh) { return r.status === 'AKTIF' && tglSel_(r.Tanggal) === sh.tanggal && Number(r.Shift) === sh.no; }

/** Baris yan_Shift AKTIF tim itu di shift sh. Lebih dari satu = DATA_GANDA (fail closed). */
function shiftAktif_(rows, timId, sh) {
  var cocok = rows.filter(function (r) { return r.shift_id && String(r.tim_id) === String(timId) && samaShift_(r, sh); });
  if (cocok.length > 1) throw new SisiError_('DATA_GANDA', 'yan_Shift ' + timId + ' ' + sh.kunci);
  return cocok[0] || null;
}

function crewDari_(r) { return [r.petugas_id_1, r.petugas_id_2].map(String).filter(function (v) { return v && v !== 'undefined'; }); }

/** petugas_id yang sedang bertugas di tim LAIN pada shift sh. */
function sibukTimLain_(rows, timId, sh) {
  var sibuk = {};
  rows.forEach(function (r) {
    if (r.shift_id && String(r.tim_id) !== String(timId) && samaShift_(r, sh)) crewDari_(r).forEach(function (id) { sibuk[id] = true; });
  });
  return sibuk;
}

function infoShift_(sh) {
  return { no: sh.no, tanggal: sh.tanggal, hari: hariDari_(sh.tanggal), jam: sh.jam, kunci: sh.kunci,
           sampai: new Date(sh.sampai).toISOString() };
}

/** Login tahap 1 (dipanggil loginInti_ setelah password benar, di luar lock). */
function siapkanLoginYandal_(profil) {
  var sh = shiftYandal_(sekarangMsYandal_());
  if (sh.peralihan) throw new SisiError_('SHIFT_PERALIHAN');
  var semua = tabelPetugas_().rows;
  var petugas = petugasTim_(semua, profil.timId);
  var shiftRows = bacaSheetYandal_(['yan_Shift']).yan_Shift.rows;
  var aktif = shiftAktif_(shiftRows, profil.timId, sh);
  if (!petugas.length && !aktif) throw new SisiError_('PETUGAS_KOSONG', profil.timNama);
  var sibuk = sibukTimLain_(shiftRows, profil.timId, sh);
  var daftar = petugas.map(function (p) { return { petugasId: String(p.petugas_id), nama: String(p.nama).trim(), sibuk: !!sibuk[String(p.petugas_id)] }; });
  if (aktif) {
    // v0.63.1 (audit guard 8 Okt 2026): crew shift yang sedang berjalan tetap tampil walau sudah dipindah / dinonaktifkan
    // admin di tengah shift (pindah tim berlaku login berikutnya). Dulu HP kedua tim itu tidak bisa ikut masuk.
    var nama = namaPetugas_(semua);
    crewDari_(aktif).forEach(function (id) {
      if (!daftar.some(function (x) { return x.petugasId === id; })) daftar.push({ petugasId: id, nama: nama[id] || '-', sibuk: false });
    });
  }
  return { info: {
    tim: { timId: profil.timId, nama: profil.timNama, kode: profil.timKode },
    shift: infoShift_(sh),
    petugas: daftar,
    // shift sudah dimulai HP lain = crew dikunci, HP ini cukup konfirmasi (ganti crew = admin)
    terpilih: aktif ? crewDari_(aktif) : [],
    min: 1, maks: YAN_PETUGAS_MAKS_
  } };
}

function simpanTiketYandal_(profil, d, platform, shift) {
  var tiket = tokenBaru_();
  CacheService.getScriptCache().put('yan-tiket:' + sha256Hex_(tiket), JSON.stringify({
    u: profil.userId, i: d.installId || '', p: platform, d: d.perangkat || '', t: sekarangMsYandal_(), k: shift.kunci,
    e: cfg_().SESI_EPOCH }), YAN_TIKET_DETIK_);
  return tiket;
}

function bacaTiketYandal_(cache, kunci, installId) {
  var ada = cache.get(kunci), tk = null;
  try { tk = ada ? JSON.parse(ada) : null; } catch (e) { tk = null; }
  if (!tk || tk.e !== cfg_().SESI_EPOCH || String(tk.i || '') !== String(installId || '')) throw new SisiError_('TIKET_TIDAK_VALID');
  return tk;
}

/**
 * Login tahap 2 (publik, tanpa token): { tiket, petugasIds: [1-2 petugas_id], installId }.
 * Validasi: tiket sah (sekali pakai, HP yang sama, shift yang sama), petugas aktif di tim akun, belum bertugas di tim
 * lain shift ini. Shift tim sudah dimulai HP lain = crew harus sama persis (SHIFT_SUDAH_DIMULAI).
 */
function mulaiShiftYandal_(_, data, platform) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SisiError_('DATA_TIDAK_VALID');
  var sisa = {};
  Object.keys(data).forEach(function (k) { if (k !== 'petugasIds') sisa[k] = data[k]; });
  var d = validasi_(sisa, { tiket: { tipe: 'teks', wajib: true, maks: 64, pola: /^[0-9a-f]{64}$/ }, installId: { tipe: 'uuid' } });
  if (!Array.isArray(data.petugasIds)) throw new SisiError_('FIELD_WAJIB', 'petugasIds');
  if (data.petugasIds.length < 1 || data.petugasIds.length > YAN_PETUGAS_MAKS_) throw new SisiError_('JUMLAH_PETUGAS', String(data.petugasIds.length));
  var ids = data.petugasIds.map(function (v) { return validasi_({ id: v }, { id: { tipe: 'uuid', wajib: true } }).id; });
  if (ids.length === 2 && ids[0] === ids[1]) throw new SisiError_('ID_GANDA', ids[0]);

  var cache = CacheService.getScriptCache(), h = sha256Hex_(d.tiket), kunci = 'yan-tiket:' + h;
  // v0.63.1: tiket asing ditolak dulu (cache saja), baru hitungan percobaan: spam tiket acak tidak mengisi cache.
  var tk = bacaTiketYandal_(cache, kunci, d.installId);
  var coba = (Number(cache.get('yan-tiket-coba:' + h)) || 0) + 1;
  if (coba > YAN_TIKET_COBA_) { cache.remove(kunci); throw new SisiError_('TERLALU_SERING', 'tiket yandal'); }
  cache.put('yan-tiket-coba:' + h, String(coba), YAN_TIKET_DETIK_);
  var sekarangMs = sekarangMsYandal_(), sh = shiftYandal_(sekarangMs);
  if (sh.peralihan || sh.kunci !== tk.k) { cache.remove(kunci); throw new SisiError_('SHIFT_BERAKHIR', 'tiket dari shift lain'); }
  var profil = profilUser_(String(tk.u));
  if (!petugasYandal_(profil)) { cache.remove(kunci); throw new SisiError_('AKSES_DITOLAK', 'bukan akun YANDAL'); }
  var menu = menuUntuk_(profil, tk.p, aturanAkses_());   // dibaca sebelum lock (tidak ada baca setelah tulis)
  var c = cfg_(), token = tokenBaru_(), hashToken = sha256Hex_(token), hasil = null;

  denganLock_(function () {
    bacaTiketYandal_(cache, kunci, d.installId);   // dipakai panggilan lain selagi menunggu lock = tolak
    var anggota = {}, semua = tabelPetugas_().rows, nama = namaPetugas_(semua);
    petugasTim_(semua, profil.timId).forEach(function (p) { anggota[String(p.petugas_id)] = p; });
    var tShift = bacaSheetYandal_(['yan_Shift']).yan_Shift;
    var tLogin = headerSheetYandal_('yan_Login');
    var perangkatT = tabel_('AUTH_SHEET_ID', 'auth_Perangkat');
    var logT = headerTabel_('AUTH_SHEET_ID', 'log_Audit');

    var aktif = shiftAktif_(tShift.rows, profil.timId, sh);
    if (aktif) {
      // shift sudah dimulai: crew = baris shift (petugas yang dipindah admin di tengah shift tetap sah sampai shift selesai)
      if (crewDari_(aktif).slice().sort().join('|') !== ids.slice().sort().join('|')) {
        throw new SisiError_('SHIFT_SUDAH_DIMULAI', aktif['Kode Shift']);
      }
      ids = crewDari_(aktif);   // urutan crew mengikuti baris shift
    } else {
      ids.forEach(function (id) { if (!anggota[id]) throw new SisiError_('PETUGAS_TIDAK_VALID', id); });
      var sibuk = sibukTimLain_(tShift.rows, profil.timId, sh);
      ids.forEach(function (id) { if (sibuk[id]) throw new SisiError_('PETUGAS_SEDANG_BERTUGAS', id); });
    }
    var dipilih = ids.map(function (id) { return { petugas_id: id, nama: nama[id] || '-' }; });
    var namaCrew = dipilih.map(function (p) { return String(p.nama).trim(); }).join(', ');
    var waktuLogin = new Date(tk.t), sekarang = new Date(sekarangMs);
    var noLogin = Math.max(1, tLogin.sheet.getLastRow());

    // ---- tulis (tanpa baca lagi) ----
    if (!aktif) {
      var kode = kodeShiftYandal_(profil.timKode, sh.tanggal, sh.no);
      aktif = {
        No: tShift.rows.length ? Math.max.apply(null, tShift.rows.map(function (r) { return r._baris; })) : 1,
        'Kode Header': kode.header, 'Kode Shift': kode.shift, ULP: c.ULP_NAMA, Hari: hariDari_(sh.tanggal), Tanggal: sh.tanggal,
        Tim: profil.timNama, Shift: sh.no,
        // v0.63.3: Jam Check-in = verifikasi petugas selesai (shift resmi dimulai), Terlambat dari jadwal mulai shift
        'Jam Check-in': waktuWib_(sekarangMs, true), 'Terlambat (menit)': terlambatMenit_(sekarangMs, sh.mulai), 'Jumlah Login': 1,
        'Catatan Shift': '', 'Input Oleh': profil.nama || profil.username,
        Timestamp: sekarang.toISOString(), 'Timestamp Update': sekarang.toISOString(),
        shift_id: uuid_(), tim_id: profil.timId, petugas_id_1: ids[0], petugas_id_2: ids[1] || '',
        status: 'AKTIF', revision: 1, dibuat_oleh: profil.userId, diubah_oleh: profil.userId
      };
      var jadwal = kolomShiftYandal_(sh, dipilih.map(function (p) { return String(p.nama).trim(); }));
      Object.keys(jadwal).forEach(function (k) { aktif[k] = jadwal[k]; });
      YAN_REKAP_P0_.forEach(function (k) { aktif[k] = 0; });
      tambahBaris_(tShift, aktif);
    } else {
      // HP lain / login ulang di shift yang sama: Jumlah Login +1 (satu panggilan tulis, baris dicek tidak bergeser)
      tulisBlok_(tShift, [{ r: aktif, u: { 'Jumlah Login': (Number(aktif['Jumlah Login']) || 0) + 1,
        'Timestamp Update': sekarang.toISOString(), diubah_oleh: profil.userId } }], []);
    }
    tulisTokenPerangkat_(perangkatT, profil, tk.i, tk.p, hashToken, sekarang, syncSampaiYandal_(sh.sampai));   // v0.63.4
    tambahBaris_(tLogin, {
      No: noLogin, 'Waktu Login': waktuLogin.toISOString(), 'Waktu Masuk': sekarang.toISOString(),
      Tanggal: sh.tanggal, Shift: sh.no, Tim: profil.timNama, Petugas: namaCrew, Platform: tk.p, Perangkat: tk.d,
      'Sesi Sampai': new Date(sh.sampai).toISOString(), 'Waktu Logout': '', 'Alasan Logout': '',
      login_id: uuid_(), shift_id: aktif.shift_id, tim_id: profil.timId, user_id: profil.userId, device_id: profil.deviceId,
      petugas_id_1: ids[0], petugas_id_2: ids[1] || ''
    });
    auditLog_(profil, 'LOGIN', aktif['Kode Shift'], 'yandal: ' + namaCrew + (tk.d ? ' | ' + tk.d : ''), tk.p, logT);
    cache.remove(kunci);
    hasil = {
      token: token, profil: profil, menu: menu,
      offlineSampai: new Date(sh.sampai).toISOString(), sesiSampai: new Date(sh.sampai).toISOString(),
      syncSampai: new Date(syncSampaiYandal_(sh.sampai)).toISOString(),
      yandal: { shiftId: String(aktif.shift_id), kodeShift: String(aktif['Kode Shift']), shift: infoShift_(sh),
                petugas: dipilih.map(function (p) { return { petugasId: String(p.petugas_id), nama: String(p.nama).trim() }; }) }
    };
  });
  pasangSesiBaru_(profil, hashToken, sh.sampai);
  return hasil;
}

/**
 * Logout akun YANDAL: baris yan_Login HP ini diberi Waktu Logout + alasan. Dipanggil di dalam lock logout_
 * SEBELUM tulis apa pun (hanya baca kolom device_id 1000 baris terakhir); hasil = fungsi tulis atau null.
 * Logout paksa akhir shift tidak tercatat di sini (token sudah habis): lihat kolom Sesi Sampai.
 */
function siapkanLogoutYandal_(deviceId) {
  if (!cfg_().YANDAL_SHEET_ID) return null;
  var t = headerSheetYandal_('yan_Login');
  var iDev = t.header.indexOf('device_id'), iW = t.header.indexOf('Waktu Logout'), iA = t.header.indexOf('Alasan Logout');
  var akhir = t.sheet.getLastRow();
  if (akhir < 2) return null;
  var mulai = Math.max(2, akhir - 999);
  var nilai = t.sheet.getRange(mulai, iDev + 1, akhir - mulai + 1, 1).getValues();
  var baris = -1;
  for (var i = nilai.length - 1; i >= 0; i--) {
    if (String(nilai[i][0]) === String(deviceId)) { baris = mulai + i; break; }
  }
  if (baris === -1) return null;
  return function (alasan) {
    t.sheet.getRange(baris, iW + 1).setValue(sekarangIso_());
    t.sheet.getRange(baris, iA + 1).setValue(alasan);
  };
}

// ====================== Pindah Tim Petugas Yandal (ADMIN / SUPER) ======================

function peranPetugasYandal_(sesi, tulis) {
  if (!sesi || sesi.role === 'PETUGAS') throw new SisiError_('AKSES_DITOLAK', 'petugas yandal bukan untuk PETUGAS');
  if (tulis && sesi.role !== 'ADMIN' && sesi.role !== 'SUPER') throw new SisiError_('AKSES_DITOLAK', 'hanya ADMIN/SUPER');
}

function timYandal_(timRows) {
  return timRows.filter(function (t) { return t.tim_id && String(t.jenis) === 'YANDAL' && isAktif_(t.aktif); })
    .sort(function (a, b) { return pad2_(a.kode) < pad2_(b.kode) ? -1 : 1; });
}

/** Crew yang sedang bertugas (shift saat ini) per petugas_id; tanpa YANDAL_SHEET_ID = kosong. */
function bertugasSekarang_() {
  if (!cfg_().YANDAL_SHEET_ID) return {};
  var sh = shiftYandal_(sekarangMsYandal_()), hasil = {};
  bacaSheetYandal_(['yan_Shift']).yan_Shift.rows.forEach(function (r) {
    if (r.shift_id && samaShift_(r, sh)) crewDari_(r).forEach(function (id) { hasil[id] = String(r.tim_id); });
  });
  return hasil;
}

function susunPetugasYandal_(timRows, petugasRows, bertugas) {
  var tim = timYandal_(timRows), idTim = {};
  tim.forEach(function (t) { idTim[String(t.tim_id)] = true; });
  var petugas = petugasRows.filter(function (p) { return p.petugas_id; }).map(function (p) {
    return { petugasId: String(p.petugas_id), nama: String(p.nama).trim(), timId: String(p.tim_yandal || ''),
             aktif: isAktif_(p.aktif), revision: Number(p.revision) || 0, bertugas: !!bertugas[String(p.petugas_id)] };
  }).sort(function (a, b) { return a.nama.localeCompare(b.nama); });
  var jumlah = {};
  petugas.forEach(function (p) { if (p.aktif && idTim[p.timId]) jumlah[p.timId] = (jumlah[p.timId] || 0) + 1; });
  return {
    tim: tim.map(function (t) { return { timId: String(t.tim_id), nama: String(t.nama), kode: pad2_(t.kode), jumlah: jumlah[String(t.tim_id)] || 0 }; }),
    petugas: petugas,
    peringatan: tim.filter(function (t) { var n = jumlah[String(t.tim_id)] || 0; return n < YAN_ANGGOTA_MIN_ || n > YAN_ANGGOTA_MAKS_; })
      .map(function (t) { return { timId: String(t.tim_id), nama: String(t.nama), jumlah: jumlah[String(t.tim_id)] || 0 }; }),
    batas: { min: YAN_ANGGOTA_MIN_, maks: YAN_ANGGOTA_MAKS_ }
  };
}

function getPetugasYandal_(sesi, data) {
  peranPetugasYandal_(sesi, false);
  validasi_(data, {});
  return susunPetugasYandal_(tabel_('MASTER_SHEET_ID', 'db_Tim').rows, tabelPetugas_().rows, bertugasSekarang_());
}

/**
 * Simpan perubahan petugas (sekaligus, mis. satu SK):
 *   ubah: [{ petugasId, revision, timId?, aktif?, nama? }]  (revision = yang dilihat HP; beda = KONFLIK_REVISION)
 *   baru: [{ nama, timId }]
 * Pindah tim berlaku untuk login berikutnya; shift yang sedang berjalan tidak berubah (yan_Shift menyimpan crew saat itu).
 */
function simpanPetugasYandal_(sesi, data, platform) {
  peranPetugasYandal_(sesi, true);
  Object.keys(data).forEach(function (k) { if (k !== 'ubah' && k !== 'baru') throw new SisiError_('FIELD_TIDAK_DIKENAL', k); });
  var ubah = data.ubah === undefined ? [] : data.ubah, baru = data.baru === undefined ? [] : data.baru;
  if (!Array.isArray(ubah)) throw new SisiError_('TIPE_SALAH', 'ubah');
  if (!Array.isArray(baru)) throw new SisiError_('TIPE_SALAH', 'baru');
  if (!ubah.length && !baru.length) throw new SisiError_('FIELD_WAJIB', 'ubah');
  if (ubah.length + baru.length > YAN_UBAH_MAKS_) throw new SisiError_('TERLALU_BANYAK', 'petugas');
  var skemaNama = { tipe: 'teks', maks: 80, pola: /^[\p{L}0-9 .,'()\-]{3,80}$/u };
  ubah = ubah.map(function (x) {
    return validasi_(x, { petugasId: { tipe: 'uuid', wajib: true }, revision: { tipe: 'angka', wajib: true, bulat: true, min: 0 },
                          timId: { tipe: 'uuid' }, aktif: { tipe: 'bool' }, nama: skemaNama });
  });
  baru = baru.map(function (x) { return validasi_(x, { nama: Object.assign({ wajib: true }, skemaNama), timId: { tipe: 'uuid', wajib: true } }); });
  var lihat = {};
  ubah.forEach(function (x) { if (lihat[x.petugasId]) throw new SisiError_('ID_GANDA', x.petugasId); lihat[x.petugasId] = true; });

  return denganLock_(function () {
    var timRows = tabel_('MASTER_SHEET_ID', 'db_Tim').rows;
    var tP = tabelPetugas_();
    var bertugas = bertugasSekarang_();
    var logT = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var tim = {};
    timYandal_(timRows).forEach(function (t) { tim[String(t.tim_id)] = String(t.nama); });
    var cekTim = function (id) { if (!tim[id]) throw new SisiError_('TIM_TIDAK_VALID', id); };
    var byId = {};
    tP.rows.forEach(function (r) {
      if (!r.petugas_id) return;
      if (byId[String(r.petugas_id)]) throw new SisiError_('DATA_GANDA', 'db_Petugas ' + r.petugas_id);
      byId[String(r.petugas_id)] = r;
    });
    var sekarang = sekarangIso_(), rencana = [], catatan = [], akhir = {};
    tP.rows.forEach(function (r) { if (r.petugas_id) akhir[String(r.petugas_id)] = { nama: String(r.nama).trim(), aktif: isAktif_(r.aktif) }; });
    ubah.forEach(function (x) {
      var r = byId[x.petugasId];
      if (!r) throw new SisiError_('DATA_TIDAK_DITEMUKAN', x.petugasId);
      if ((Number(r.revision) || 0) !== x.revision) throw new SisiError_('KONFLIK_REVISION', x.petugasId);
      var u = {};
      if (x.timId !== undefined && x.timId !== String(r.tim_yandal)) {
        cekTim(x.timId);
        u.tim_yandal = x.timId;
        catatan.push(String(r.nama).trim() + ': ' + (tim[String(r.tim_yandal)] || '-') + ' -> ' + tim[x.timId]);
      }
      if (x.aktif !== undefined && x.aktif !== isAktif_(r.aktif)) {
        u.aktif = x.aktif;
        catatan.push(String(r.nama).trim() + ': ' + (x.aktif ? 'aktif' : 'nonaktif'));
      }
      if (x.nama !== undefined && x.nama !== String(r.nama).trim()) {
        u.nama = x.nama;
        catatan.push(String(r.nama).trim() + ' -> ' + x.nama);
      }
      if (!Object.keys(u).length) return;
      if (u.aktif === true) cekTim(String(u.tim_yandal !== undefined ? u.tim_yandal : r.tim_yandal));   // diaktifkan lagi = timnya harus sah
      u.diubah_pada = sekarang; u.diubah_oleh = sesi.userId;
      rencana.push({ r: r, u: u });
      akhir[x.petugasId] = { nama: u.nama !== undefined ? u.nama : String(r.nama).trim(), aktif: u.aktif !== undefined ? u.aktif : isAktif_(r.aktif) };
    });
    var barisBaru = baru.map(function (x) {
      cekTim(x.timId);
      var o = { petugas_id: uuid_(), nama: x.nama, tim_yandal: x.timId, aktif: true, revision: 1, diubah_pada: sekarang, diubah_oleh: sesi.userId };
      akhir[o.petugas_id] = { nama: x.nama, aktif: true };
      catatan.push('baru ' + x.nama + ' -> ' + tim[x.timId]);
      return o;
    });
    // nama petugas AKTIF unik (layar login memilih berdasarkan nama)
    var nama = {};
    Object.keys(akhir).forEach(function (id) {
      if (!akhir[id].aktif) return;
      var k = akhir[id].nama.toLowerCase();
      if (nama[k]) throw new SisiError_('PETUGAS_GANDA', akhir[id].nama);
      nama[k] = true;
    });
    if (!rencana.length && !barisBaru.length) {
      return Object.assign(susunPetugasYandal_(timRows, tP.rows, bertugas), { diubah: 0 });
    }
    // ---- tulis: perubahan + baris baru dalam satu panggilan ----
    tulisBlok_(tP, rencana, barisBaru);
    auditLog_(sesi, 'SIMPAN_PETUGAS_YANDAL', 'db_Petugas', catatan.join('; '), platform, logT);
    return Object.assign(susunPetugasYandal_(timRows, tP.rows.concat(barisBaru), bertugas), { diubah: rencana.length + barisBaru.length });
  });
}


// ====================== Rekap shift (v0.63.4, keputusan kvlar 8 Okt 2026) ======================
// Rekap = DIHITUNG ULANG dari semua P0 shift itu (lewat shift_id, bukan tanggal hari ini), jadi approve / reject di
// hari lain tetap masuk ke shift asalnya dan diulang berapa kali pun hasilnya sama (tidak dobel).
// Jumlah / status / point: setiap rekap. Durasi, Jam Efektif, % Efektif, Jarak: hanya setelah shift selesai.
// P0 Rejected tidak dihitung ke durasi, jam efektif, dan jarak.

var YAN_REKAP_BATAS_ = 300;   // baris shift per jalan pemicu (sisanya jalan berikutnya)
var YAN_PEMICU_JAM_ = [0, 8, 16];   // pemicu harian 00:15 / 08:15 / 16:15 WIB

/** Jadwal baris yan_Shift dari Tanggal (operasional) + Shift. Rusak = null. sampai = menit peralihan (hh:59). */
function jadwalBarisShift_(r) {
  var tgl = tglSel_(r.Tanggal), no = Number(r.Shift);
  if (!tgl || !YAN_JAM_SHIFT_[no]) return null;
  var mulai = Date.parse(tgl + 'T00:00:00+07:00') + (no === 1 ? 8 : no === 2 ? 16 : 24) * 3600e3;
  return { no: no, mulai: mulai, akhir: mulai + 8 * 3600e3, sampai: mulai + 8 * 3600e3 - 60e3 };
}

/** Sel waktu: Date (diubah Sheets), 'yyyy-MM-dd HH:mm[:ss]' (WIB), atau ISO. Hasil ms / null. */
function msWaktu_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!s) return null;
  var m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/.exec(s);
  var ms = m ? Date.parse(m[1] + 'T' + m[2] + (m[3] || ':00') + '+07:00') : Date.parse(s);
  return isFinite(ms) ? ms : null;
}

function angkaSel_(v) { var n = Number(v); return isFinite(n) ? n : 0; }

/**
 * v0.65.1: waktu P0 (ms) dari foto_meta (ISO dari HP, kebal zona waktu spreadsheet), cadangan sel sheet.
 * Sel 'yyyy-MM-dd HH:mm:ss' diubah Sheets jadi Date menurut zona waktu SPREADSHEET; kalau zona spreadsheet bukan
 * Asia/Jakarta, jamnya bergeser (penyebab WAKTU_TIDAK_URUT palsu di v0.65.0). kunci = DIBUAT | SEBELUM | PEKERJAAN | SESUDAH.
 */
function waktuP0Ms_(r, kunci, kolom) {
  var m = null;
  try { m = JSON.parse(String(r.foto_meta || '{}'))[kunci]; } catch (e) { m = null; }
  var ms = m && m.waktu ? Date.parse(m.waktu) : NaN;
  return isFinite(ms) ? ms : msWaktu_(r[kolom]);
}
function bulat_(n, d) { var f = Math.pow(10, d); return Math.round(n * f) / f; }

/** Jarak garis lurus (km), haversine. */
function jarakKm_(lat1, lon1, lat2, lon2) {
  var R = 6371, rad = Math.PI / 180;
  var dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function titikSah_(lat, lon) {
  var a = Number(lat), b = Number(lon);
  return String(lat) !== '' && String(lon) !== '' && isFinite(a) && isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0);
}

/**
 * Kolom rekap satu shift dari baris yan_P0 shift itu. final = shift sudah selesai (durasi / efektif / jarak dihitung).
 * Jam Efektif = gabungan rentang Waktu Sebelum s.d. Waktu Sesudah (tumpang tindih tidak dobel), dipotong jam shift.
 * Total Jarak = jarak tempuh antar lokasi P0 berurutan (urut Waktu Sebelum / Waktu Dibuat), P0 pertama = 0.
 */
function hitungRekapShift_(p0, jadwal, final) {
  var aktif = p0.filter(function (r) { return r.p0_id && String(r.status || 'AKTIF') !== 'BATAL'; });
  var st = function (r) { return String(r['Status P0'] || '').trim().toUpperCase(); };
  var ap = function (r) { return String(r['Status Approval'] || '').trim().toLowerCase(); };
  var selesai = aktif.filter(function (r) { return st(r) === 'SELESAI'; });
  var approved = selesai.filter(function (r) { return ap(r) === 'approved'; });
  // v0.65.0: Rejected = semua P0 Rejected, termasuk Rejected SISTEM "P0 Tidak Selesai" (status P0 tetap PROSES)
  var rejected = aktif.filter(function (r) { return ap(r) === 'rejected'; });
  var rejectedSelesai = selesai.filter(function (r) { return ap(r) === 'rejected'; });
  var hasil = {
    'Jumlah P0': aktif.length,
    'P0 Proses': aktif.filter(function (r) { return st(r) !== 'SELESAI'; }).length,
    'P0 Selesai': selesai.length,
    'P0 Menunggu Verifikasi': selesai.length - approved.length - rejectedSelesai.length,
    'P0 Approved': approved.length,
    'P0 Rejected': rejected.length,
    'Total Point': bulat_(approved.reduce(function (n, r) { return n + angkaSel_(r.Point); }, 0), 2)
  };
  if (!final) return hasil;
  var sah = aktif.filter(function (r) { return ap(r) !== 'rejected'; });
  var rentang = [], durasi = 0;
  sah.forEach(function (r) {
    if (st(r) !== 'SELESAI') return;
    var a = waktuP0Ms_(r, 'SEBELUM', 'Waktu Sebelum'), b = waktuP0Ms_(r, 'SESUDAH', 'Waktu Sesudah');
    if (a === null || b === null || b <= a) return;
    durasi += (b - a) / 60e3;
    var x = Math.max(a, jadwal.mulai), y = Math.min(b, jadwal.akhir);
    if (y > x) rentang.push([x, y]);
  });
  rentang.sort(function (p, q) { return p[0] - q[0]; });
  var efektifMs = 0, ujung = -Infinity;
  rentang.forEach(function (p) {
    if (p[1] <= ujung) return;
    efektifMs += p[1] - Math.max(p[0], ujung);
    ujung = p[1];
  });
  var titik = sah.filter(function (r) { return titikSah_(r.Lat, r.Long); }).map(function (r) {
    var w = waktuP0Ms_(r, 'SEBELUM', 'Waktu Sebelum');
    return { w: w === null ? (waktuP0Ms_(r, 'DIBUAT', 'Waktu Dibuat') || 0) : w, lat: Number(r.Lat), lon: Number(r.Long) };
  }).sort(function (p, q) { return p.w - q.w; });
  var jarak = 0;
  for (var i = 1; i < titik.length; i++) jarak += jarakKm_(titik[i - 1].lat, titik[i - 1].lon, titik[i].lat, titik[i].lon);
  var jam = bulat_(efektifMs / 3600e3, 2);
  hasil['Total Durasi (menit)'] = bulat_(durasi, 2);   // v0.65.12: 2 desimal (P0 < 1 menit tidak hilang)
  hasil['Jam Efektif'] = jam;
  hasil['% Efektif'] = bulat_(jam / 8 * 100, 1);
  hasil['Total Jarak (km)'] = bulat_(jarak, 2);
  return hasil;
}

/**
 * Rekap baris yan_Shift yang dipilih (pilih(row, jadwal, p0) = true). WAJIB di dalam denganLock_. Satu panggilan tulis.
 * Dipakai pemicu (shift selesai yang belum final / P0-nya berubah sesudah rekap) dan nanti oleh kirim P0 + approval
 * (rekapShiftId_), supaya P0 yang masuk / di-approve sesudah shift selesai langsung ikut.
 */
function rekapShiftYandal_(pilih, sekarangMs, oleh) {
  var t = bacaSheetYandal_(['yan_Shift', 'yan_P0']);
  var perShift = {};
  t.yan_P0.rows.forEach(function (r) {
    if (r.shift_id) (perShift[String(r.shift_id)] = perShift[String(r.shift_id)] || []).push(r);
  });
  var ubah = [], final = 0, sisa = 0;
  t.yan_Shift.rows.forEach(function (r) {
    if (!r.shift_id || r.status !== 'AKTIF') return;
    var j = jadwalBarisShift_(r), p0 = perShift[String(r.shift_id)] || [];
    if (!j || !pilih(r, j, p0)) return;
    if (ubah.length >= YAN_REKAP_BATAS_) { sisa++; return; }
    var selesai = sekarangMs >= j.sampai;
    var u = hitungRekapShift_(p0, j, selesai);
    if (selesai) { u['Rekap Final'] = waktuWib_(sekarangMs, true); final++; }
    u['Timestamp Update'] = new Date(sekarangMs).toISOString();
    u.diubah_oleh = oleh || 'SISTEM';
    ubah.push({ r: r, u: u });
  });
  tulisBlok_(t.yan_Shift, ubah, []);
  return { direkap: ubah.length, final: final, sisa: sisa };
}

/** Rekap shift tertentu (shift_id). WAJIB di dalam denganLock_. */
function rekapShiftId_(ids, sekarangMs, oleh) {
  var cari = {};
  ids.forEach(function (id) { cari[String(id)] = true; });
  return rekapShiftYandal_(function (r) { return cari[String(r.shift_id)]; }, sekarangMs, oleh);
}

/** Pilihan pemicu: shift sudah selesai DAN (belum final ATAU ada P0 yang berubah sesudah rekap terakhir). */
function perluRekapFinal_(r, j, p0, sekarangMs) {
  if (sekarangMs < j.sampai) return false;
  if (!String(r['Rekap Final'] || '').trim()) return true;
  var terakhir = msWaktu_(r['Timestamp Update']) || 0;
  return p0.some(function (x) { return (msWaktu_(x['Timestamp Update']) || 0) > terakhir; });
}

/**
 * Pemicu (00:15 / 08:15 / 16:15 WIB) dan bisa dijalankan manual: rekap semua shift yang sudah selesai dan belum final,
 * plus shift final yang P0-nya berubah sesudah rekap (mis. P0 terlambat sync / approve hari lain). Terlewat satu
 * putaran = tersusul di putaran berikutnya.
 */
function ADMIN_rekapShiftYandal(e) {
  pastikanPemilik_();
  return jalanPemicu_('ADMIN_rekapShiftYandal', e, rekapShiftYandalPemicu_);   // v0.84.0: waktu jalan dicatat + rem kuota
}

/** v0.84.0: isi ADMIN_rekapShiftYandal (dibungkus jalanPemicu_). */
function rekapShiftYandalPemicu_() {
  if (!cfg_().YANDAL_SHEET_ID) { console.log('YANDAL_SHEET_ID kosong, rekap Yandal dilewati.'); return; }
  var sekarang = sekarangMsYandal_(), h = null, tolak = 0;
  denganLock_(function () {
    tolak = tolakP0KedaluwarsaYandal_(sekarang);   // v0.65.0: P0 masih PROSES lewat batas mode sync = Rejected SISTEM
    h = rekapShiftYandal_(function (r, j, p0) { return perluRekapFinal_(r, j, p0, sekarang); }, sekarang, 'SISTEM');
  });
  console.log('Rekap Yandal: ' + h.direkap + ' shift direkap (' + h.final + ' final)' + (h.sisa ? ', sisa ' + h.sisa + ' di putaran berikutnya.' : '.') +
    (tolak ? ' ' + tolak + ' P0 tidak selesai di-Rejected SISTEM.' : ''));
}

function hapusPemicuRekapYandal_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'ADMIN_rekapShiftYandal') ScriptApp.deleteTrigger(t);
  });
}

/** Editor: pasang 3 pemicu harian rekap Yandal (00:15 / 08:15 / 16:15 WIB, pemicu lama diganti), lalu rekap sekarang. */
function ADMIN_pasangPemicuRekapYandal() {
  pastikanPemilik_();
  hapusPemicuRekapYandal_();
  YAN_PEMICU_JAM_.forEach(function (jam) {
    ScriptApp.newTrigger('ADMIN_rekapShiftYandal').timeBased().everyDays(1).atHour(jam).nearMinute(15).inTimezone('Asia/Jakarta').create();
  });
  console.log('Pemicu ADMIN_rekapShiftYandal dipasang: 00:15, 08:15, 16:15 WIB.');
  ADMIN_rekapShiftYandal();
}

/** Editor: hapus pemicu rekap Yandal. */
function ADMIN_berhentiPemicuRekapYandal() {
  pastikanPemilik_();
  hapusPemicuRekapYandal_();
  console.log('Pemicu ADMIN_rekapShiftYandal dihapus.');
}
