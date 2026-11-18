/** C4A + sinkron UIW (permintaan Master Guswan 15 Nov 2026). Spec: docs/superpowers/specs/2026-11-14-c4a-sinkron-uiw-design.md */
const test = require('node:test');
const assert = require('node:assert');
const { kodeError, j } = require('./gudangUji');
const { duniaC4A, HARI_INI } = require('./duniaC4A');

test('skema: kolom c4a_id + uniqueid + keterangan_tindak_lanjut di kanan db_temuan_inspeksi, uiw_* di kanan db_Jenis_Temuan, kolom lama tidak bergeser', () => {
  const x = duniaC4A();
  const t = x.h.TEMUAN_HEADER_.db_temuan_inspeksi;
  assert.deepStrictEqual(j(t.slice(-3)), ['c4a_id', 'uniqueid', 'keterangan_tindak_lanjut']);
  assert.strictEqual(t.indexOf('temuan_id'), 27, 'temuan_id tetap di posisi lama');
  assert.strictEqual(t.indexOf('revision'), t.length - 4, 'audit tetap di depan kolom baru');
  assert.deepStrictEqual(j(x.h.INSJAR_MASTER_HEADER_.db_Jenis_Temuan.slice(-3)), ['uiw_kode', 'uiw_kategori', 'uiw_temuan']);
  assert.deepStrictEqual(j(x.h.INSJAR_MASTER_HEADER_.db_Jenis_Temuan.slice(0, 7)), ['nomor', 'jenis_temuan', 'objek_inspeksi', 'tier_inspeksi', 'urutan', 'aktif', 'jenis_temuan_id']);
});

test('skema: c4a_laporan + uiw_antrean ada di SiSi_Temuan (disiapkan ADMIN_siapkanSheetInsJar), kolom sesuai spec 5.2', () => {
  const x = duniaC4A();
  const l = x.h.TEMUAN_HEADER_.c4a_laporan;
  assert.deepStrictEqual(j(l), ['nomor', 'kode_c4a', 'tanggal', 'hari', 'ulp', 'penyulang', 'section',
    'koordinat_awal', 'lat_awal', 'lng_awal', 'waktu_awal', 'sumber_awal',
    'koordinat_akhir', 'lat_akhir', 'lng_akhir', 'waktu_akhir', 'sumber_akhir',
    'jarak_km', 'metode_jarak', 'status_jarak', 'status', 'ditutup_otomatis', 'jumlah_temuan',
    'c4a_id', 'section_id', 'user_id',
    'dibuat_oleh', 'waktu_perangkat', 'diubah_oleh', 'timestamp', 'timestamp_update', 'revision']);
  assert.deepStrictEqual(j(x.h.TEMUAN_HEADER_.uiw_antrean), ['nomor', 'jenis', 'kunci', 'c4a_id', 'status', 'bantu', 'percobaan',
    'coba_lagi_setelah', 'waktu_coba', 'waktu_terkirim', 'sidik', 'foto_awal_uiw', 'foto_akhir_uiw', 'antrean_id',
    'dibuat_oleh', 'diubah_oleh', 'timestamp', 'timestamp_update', 'revision']);
  // dibaca lewat tabelInsJar_ (cek struktur SiSi_Temuan)
  assert.strictEqual(x.h.tabelInsJar_('c4a_laporan').rows.length, 0);
  x.sheets.t.c4a_laporan.data[0][1] = 'kode';
  assert.strictEqual(kodeError(() => x.h.tabelInsJar_('c4a_laporan')), 'STRUKTUR_BERUBAH');
});

module.exports = { duniaC4A, HARI_INI, j };

/* ===== Task 2: Laporan C4A (buat / tutup / satu laporan terbuka) ===== */

const ymd = HARI_INI.slice(2, 4) + HARI_INI.slice(5, 7) + HARI_INI.slice(8, 10);

test('laporan: kode C4A-16130<YYMMDD>001, satu laporan terbuka per akun, setelah ditutup boleh buat lagi (002)', () => {
  const x = duniaC4A();
  const a = x.buka();
  assert.deepStrictEqual([a.kodeC4a, a.status, a.revision], ['C4A-16130' + ymd + '001', 'TERBUKA', 1]);
  const b = x.buka();
  assert.strictEqual(b.ditolak, 'C4A_SUDAH_ADA');
  assert.strictEqual(b.laporan.c4aId, a.c4aId);
  assert.strictEqual(x.baris('c4a_laporan').length, 1, 'laporan kedua tidak ditulis');
  // akun lain boleh punya laporan terbuka sendiri
  assert.strictEqual(x.buka({}, x.admin2).status, 'TERBUKA');
  x.tutup(a.c4aId);
  const c = x.buka();
  assert.strictEqual(c.kodeC4a, 'C4A-16130' + ymd + '003');
  const r = x.baris('c4a_laporan')[0];
  assert.deepStrictEqual([r.penyulang, r.section, r.section_id, r.user_id, r.lat_awal, r.sumber_awal, r.tanggal], ['PNY-A', 'ACR Palas - LBS Delas', 'j1', 'u-adm', -3.01, 'GPS', HARI_INI]);
});

test('laporan: c4aId harus 8 hex, kirim ulang = duplikat, c4aId milik user lain = C4A_ID_BENTROK', () => {
  const x = duniaC4A();
  assert.strictEqual(kodeError(() => x.buka({ c4aId: 'ABCDEF12' })), 'FORMAT_SALAH');
  assert.strictEqual(kodeError(() => x.buka({ c4aId: '1234567' })), 'FORMAT_SALAH');
  const a = x.buka({ c4aId: 'aaaa0001' });
  assert.strictEqual(x.buka({ c4aId: 'aaaa0001' }).duplikat, true);
  assert.strictEqual(kodeError(() => x.buka({ c4aId: 'aaaa0001' }, x.admin2)), 'C4A_ID_BENTROK');
  assert.strictEqual(a.c4aId, 'aaaa0001');
});

test('laporan: khusus admin, penyulang + section wajib dari db_Jaringan', () => {
  const x = duniaC4A();
  assert.strictEqual(kodeError(() => x.buka({}, x.petugas)), 'AKSES_DITOLAK');
  assert.strictEqual(kodeError(() => x.buka({ section: 'GH Toboali' })), 'SECTION_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.buka({ penyulang: 'PNY-Z' })), 'PENYULANG_TIDAK_VALID');
  assert.strictEqual(kodeError(() => x.buka({ section: '' })), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => x.buka({ sumberAwal: 'TEBAK' })), 'PILIHAN_TIDAK_VALID');
});

test('tutup: titik akhir dicatat, status SELESAI, status_jarak MENUNGGU, sinkron UIW dijadwalkan; milik user lain ditolak', () => {
  const x = duniaC4A();
  const a = x.buka();
  assert.strictEqual(kodeError(() => x.tutup(a.c4aId, {}, x.admin2)), 'BUKAN_MILIK_ANDA');
  assert.strictEqual(kodeError(() => x.tutup('ffff0000')), 'C4A_TIDAK_DITEMUKAN');
  const t = x.tutup(a.c4aId, { sumberAkhir: 'PETA' });
  assert.deepStrictEqual([t.status, t.statusJarak], ['SELESAI', 'MENUNGGU']);
  const r = x.baris('c4a_laporan')[0];
  assert.deepStrictEqual([r.status, r.lat_akhir, r.sumber_akhir, r.status_jarak, r.ditutup_otomatis], ['SELESAI', -3.02, 'PETA', 'MENUNGGU', false]);
  assert.deepStrictEqual(x.pemicu.map((p) => p.fn), ['ADMIN_pemicuSinkronUiw']);
  assert.strictEqual(x.tutup(a.c4aId).duplikat, true, 'tutup ulang = duplikat');
});

test('tutup otomatis: laporan kemarin TERBUKA ditutup pakai titik temuan terakhir; tanpa temuan = titik awal, jarak NOL', () => {
  const x = duniaC4A();
  const a = x.buka();
  x.temuan(a.c4aId, { koordinat: '-3.0300, 106.5300' });
  x.jam.ms += 60e3;
  x.temuan(a.c4aId, { koordinat: '-3.0400, 106.5400' });
  const b = x.buka({}, x.admin2);
  x.jam.ms += 864e5;   // besok
  assert.strictEqual(x.h.tutupOtomatisC4A_(), 2);
  const [ra, rb] = x.baris('c4a_laporan');
  assert.deepStrictEqual([ra.status, ra.lat_akhir, ra.sumber_akhir, ra.ditutup_otomatis, ra.status_jarak], ['SELESAI', -3.04, 'TEMUAN_TERAKHIR', true, 'MENUNGGU']);
  assert.deepStrictEqual([rb.status, rb.lat_akhir, rb.sumber_akhir, rb.ditutup_otomatis, rb.jarak_km, rb.metode_jarak, rb.status_jarak],
    ['SELESAI', -3.01, 'TEMUAN_TERAKHIR', true, 0, 'NOL', 'SELESAI']);
  assert.strictEqual(b.status, 'TERBUKA');
});

test('buat laporan hari ini saat laporan kemarin masih TERBUKA: kemarin ditutup otomatis dulu, yang baru diterima', () => {
  const x = duniaC4A();
  x.buka();
  x.jam.ms += 864e5;
  const b = x.buka();
  assert.strictEqual(b.status, 'TERBUKA');
  assert.deepStrictEqual(x.baris('c4a_laporan').map((r) => r.status), ['SELESAI', 'TERBUKA']);
});

test('tutup admin setelah ditutup otomatis: titik akhir admin menggantikan TEMUAN_TERAKHIR, ditutup_otomatis false, jarak dihitung ulang', () => {
  const x = duniaC4A();
  const a = x.buka();
  x.jam.ms += 864e5;
  x.h.tutupOtomatisC4A_();
  const t = x.tutup(a.c4aId, { koordinatAkhir: '-3.0500, 106.5500' });
  assert.strictEqual(t.duplikat, undefined);
  const r = x.baris('c4a_laporan')[0];
  assert.deepStrictEqual([r.lat_akhir, r.sumber_akhir, r.ditutup_otomatis, r.status_jarak, r.metode_jarak], [-3.05, 'GPS', false, 'MENUNGGU', '']);
});

test('get laporan: laporan terbuka hari ini + ringkasan kategori UIW temuan hari ini milik akun; laporan kemarin bukan terbuka', () => {
  const x = duniaC4A();
  const a = x.buka();
  x.temuan(a.c4aId, { jenisTemuanId: 'jt-1' });
  x.temuan(a.c4aId, { jenisTemuanId: 'jt-1' });
  x.temuan(a.c4aId, { jenisTemuanId: 'jt-2' });
  x.temuan(a.c4aId, { jenisTemuanId: 'jt-3' });
  const g = j(x.h.getLaporanC4A_(x.admin, {}));
  assert.strictEqual(g.terbuka.c4aId, a.c4aId);
  assert.strictEqual(g.terbuka.jumlahTemuan, 4);
  assert.deepStrictEqual(g.ringkasan, { Komponen: 2, Peralatan: 0, Pohon: 1, Lainnya: 1 });
  assert.strictEqual(j(x.h.getLaporanC4A_(x.admin2, {})).terbuka, null);
  x.jam.ms += 864e5;
  assert.strictEqual(j(x.h.getLaporanC4A_(x.admin, {})).terbuka, null);
});

test('get laporan: riwayat = laporan SELESAI hari ini milik akun (terbaru dulu), laporan terbuka / akun lain / kemarin tidak', () => {
  const x = duniaC4A();
  const a = x.buka();
  x.tutup(a.c4aId);
  const b = x.buka();
  x.temuan(b.c4aId);
  x.tutup(b.c4aId);
  x.buka();
  x.buka({}, x.admin2);
  const g = j(x.h.getLaporanC4A_(x.admin, {}));
  assert.deepStrictEqual(g.riwayat.map((l) => [l.c4aId, l.status, l.jumlahTemuan]), [[b.c4aId, 'SELESAI', 1], [a.c4aId, 'SELESAI', 0]]);
  x.jam.ms += 864e5;
  assert.deepStrictEqual(j(x.h.getLaporanC4A_(x.admin, {})).riwayat, []);
});

test('jadwalkan sinkron UIW: simpan beruntun = satu pemicu 2 menit; tanda basi 10 menit = pasang ulang', () => {
  const x = duniaC4A();
  assert.strictEqual(x.h.jadwalkanSinkronUiw_(), true);
  assert.strictEqual(x.h.jadwalkanSinkronUiw_(), false);
  assert.deepStrictEqual(x.pemicu.map((p) => [p.fn, p.afterMs]), [['ADMIN_pemicuSinkronUiw', 120000]]);
  x.jam.ms += 11 * 60e3;
  assert.strictEqual(x.h.jadwalkanSinkronUiw_(), true);
  assert.strictEqual(x.pemicu.length, 1, 'pemicu lama diganti');
});

/* ===== Task 3: temuan C4A (simpanTemuanInspeksi_ + c4aId / uniqueid) ===== */

test('temuan C4A: penyulang/section dari laporan, kode tetap pola PEG, c4a_id + uniqueid tertulis, jumlah_temuan naik tanpa revision', () => {
  const x = duniaC4A();
  const a = x.buka();
  x.pemicu.length = 0;
  x.h.PropertiesService.getScriptProperties().deleteProperty('UIW_PEMICU');
  const t = x.temuan(a.c4aId, { uniqueid: 'bbbb0001' });
  assert.strictEqual(t.kodeTemuan, 'PEG-16130' + ymd + '001-PNY.001-TJR.001');
  const r = x.baris('db_temuan_inspeksi')[0];
  assert.deepStrictEqual([r.penyulang, r.section, r.section_id, r.c4a_id, r.uniqueid, r.sumber, r.tanggal], ['PNY-A', 'ACR Palas - LBS Delas', 'j1', a.c4aId, 'bbbb0001', 'ADMIN', HARI_INI]);
  assert.strictEqual(r.tim, 'Admin Utama', 'kolom tim = nama db_Users (sesi.nama)');
  const l = x.baris('c4a_laporan')[0];
  assert.deepStrictEqual([l.jumlah_temuan, l.revision], [1, 1]);
  assert.strictEqual(x.pemicu.length, 1, 'sinkron UIW dijadwalkan');
  assert.strictEqual(kodeError(() => x.temuan(a.c4aId, { penyulang: 'PNY-B' })), 'FIELD_TIDAK_DIKENAL');
  assert.strictEqual(kodeError(() => x.temuan(a.c4aId, { section: 'GH Toboali' })), 'FIELD_TIDAK_DIKENAL');
  assert.strictEqual(kodeError(() => x.temuan(a.c4aId, { uniqueid: undefined })), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => x.temuan('ffff0000')), 'C4A_TIDAK_DITEMUKAN');
  assert.strictEqual(kodeError(() => x.temuan(a.c4aId, {}, x.admin2)), 'BUKAN_MILIK_ANDA');
});

test('temuan C4A: diterima walau laporan sudah ditutup otomatis kemarin; tanggal = tanggal laporan', () => {
  const x = duniaC4A();
  const a = x.buka();
  x.jam.ms += 864e5;
  x.h.tutupOtomatisC4A_();
  x.temuan(a.c4aId);
  const r = x.baris('db_temuan_inspeksi')[0];
  assert.strictEqual(r.tanggal, HARI_INI);
  assert.strictEqual(r.kode_temuan, 'PEG-16130' + ymd + '001-PNY.001-TJR.001');
});

test('temuan C4A: payload HP (tanggal laporan ikut dikirim antrean) diterima; tanggal disimpan = tanggal laporan', () => {
  const x = duniaC4A();
  const a = x.buka();
  x.jam.ms += 864e5;
  x.temuan(a.c4aId, { tanggal: '2026-11-16', objekInspeksi: 'Jaringan' });
  assert.strictEqual(x.baris('db_temuan_inspeksi')[0].tanggal, HARI_INI);
});

test('temuan C4A: uniqueid ganda = UNIQUEID_BENTROK, kirim ulang idBaris sama = duplikat', () => {
  const x = duniaC4A();
  const a = x.buka();
  const id = '0c0c0c0c-0000-4000-8000-0000000000aa';
  x.temuan(a.c4aId, { uniqueid: 'cccc0001', idBaris: id });
  assert.strictEqual(x.temuan(a.c4aId, { uniqueid: 'cccc0001', idBaris: id }).duplikat, true);
  assert.strictEqual(kodeError(() => x.temuan(a.c4aId, { uniqueid: 'cccc0001' })), 'UNIQUEID_BENTROK');
  assert.strictEqual(x.baris('db_temuan_inspeksi').length, 1);
});

test('temuan tanpa c4aId: perilaku lama tidak berubah, c4a_id/uniqueid kosong, sinkron UIW tidak dijadwalkan', () => {
  const x = duniaC4A();
  x.h.simpanTemuanInspeksi_(x.admin, { penyulang: 'PNY-B', section: 'GH Toboali', jenisTemuanId: 'jt-1' });
  const r = x.baris('db_temuan_inspeksi')[0];
  assert.deepStrictEqual([r.c4a_id, r.uniqueid, r.penyulang], ['', '', 'PNY-B']);
  assert.strictEqual(x.pemicu.length, 0);
});

/* ===== Task 4: Arsip C4A ===== */

test('arsip: per hari sebelum hari ini, jumlah per kategori, hari ini tidak ikut, rentang > 92 hari ditolak', () => {
  const x = duniaC4A();
  const a = x.buka();
  x.temuan(a.c4aId, { jenisTemuanId: 'jt-1' });
  x.temuan(a.c4aId, { jenisTemuanId: 'jt-2' });
  const b = x.buka({ penyulang: 'PNY-B', section: 'GH Toboali' }, x.admin2);
  x.temuan(b.c4aId, { jenisTemuanId: 'jt-3' }, x.admin2);
  x.jam.ms += 864e5;   // besok
  const c = x.buka();
  x.temuan(c.c4aId, { jenisTemuanId: 'jt-1' });
  const ar = j(x.h.getArsipC4A_(x.admin, { dari: '2026-11-01', sampai: '2026-11-16' }));
  assert.deepStrictEqual(ar.hari, [{ tanggal: HARI_INI, jumlahLaporan: 2, penyulang: 2, section: 2, Komponen: 1, Peralatan: 0, Pohon: 1, Lainnya: 1 }]);
  assert.strictEqual(kodeError(() => x.h.getArsipC4A_(x.admin, { dari: '2026-01-01', sampai: '2026-11-14' })), 'RENTANG_TERLALU_PANJANG');
  assert.strictEqual(kodeError(() => x.h.getArsipC4A_(x.petugas, { dari: '2026-11-01', sampai: '2026-11-14' })), 'AKSES_DITOLAK');
});

test('master temuan: setiap jenis membawa uiwKode / uiwKategori / uiwTemuan untuk label kategori di HP', () => {
  const x = duniaC4A();
  const m = j(x.h.getMasterTemuanInspeksi_(x.admin).jenisTemuan);
  const p = (id) => m.find((z) => z.jenisTemuanId === id);
  assert.deepStrictEqual([p('jt-1').uiwKode, p('jt-1').uiwKategori, p('jt-1').uiwTemuan], ['A3', 'Komponen', 'Isolator Tumpu']);
  assert.deepStrictEqual([p('jt-3').uiwKode, p('jt-3').uiwKategori], ['', '']);
});

test('daftar temuan HP: temuan C4A membawa c4aId + uniqueid (ringkasan / arsip di HP)', () => {
  const x = duniaC4A();
  const a = x.buka({ c4aId: 'aaaa0001' });
  x.temuan(a.c4aId, { uniqueid: 'bbbb0001' });
  const t = j(x.h.getTemuanInspeksi_(x.admin, { tanggal: HARI_INI }).temuan[0]);
  assert.deepStrictEqual([t.c4aId, t.uniqueid], ['aaaa0001', 'bbbb0001']);
});

test('temuan admin tanpa C4A: kolom tim juga = nama db_Users (sesi.nama)', () => {
  const x = duniaC4A();
  x.h.simpanTemuanInspeksi_(x.admin, { penyulang: 'PNY-A', section: 'ACR Palas - LBS Delas', jenisTemuanId: 'jt-1', koordinat: '-3.0150, 106.5050', tanggal: HARI_INI });
  assert.strictEqual(x.baris('db_temuan_inspeksi')[0].tim, 'Admin Utama');
});


test('temuan C4A: Keterangan Tindak Lanjut (P0 / Perlu Padam / Tidak Padam) tersimpan di kolom keterangan_tindak_lanjut; nilai lain ditolak', () => {
  const x = duniaC4A();
  const a = x.buka({ c4aId: 'aaaa0001' });
  x.temuan(a.c4aId, { uniqueid: 'bbbb0001', ketTindakLanjut: 'Perlu Padam' });
  x.temuan(a.c4aId, { uniqueid: 'bbbb0002' });
  assert.deepStrictEqual(x.baris('db_temuan_inspeksi').map((r) => r.keterangan_tindak_lanjut), ['Perlu Padam', '']);
  assert.throws(() => x.temuan(a.c4aId, { uniqueid: 'bbbb0003', ketTindakLanjut: 'Nanti' }));
});

test('ubahTemuanInspeksi: admin ubah temuan C4A (tindak lanjut wajib, revision, hanya temuan admin C4A); petugas tidak punya akses pilihan ini', () => {
  const x = duniaC4A();
  const a = x.buka({ c4aId: 'aaaa0001' });
  x.temuan(a.c4aId, { uniqueid: 'bbbb0001', ketTindakLanjut: 'P0' });
  const t = x.baris('db_temuan_inspeksi')[0];
  const kirim = (o) => x.h.ubahTemuanInspeksi_(x.admin, { temuanId: t.temuan_id, revision: 1, jenisTemuanId: 'jt-2', ketTindakLanjut: 'Tidak Padam', deskripsi: 'baru', ...o });
  assert.strictEqual(kodeError(() => kirim({ ketTindakLanjut: undefined })), 'FIELD_WAJIB');
  assert.strictEqual(kodeError(() => kirim({ ketTindakLanjut: 'Nanti' })), 'PILIHAN_TIDAK_VALID');
  assert.strictEqual(kodeError(() => kirim({ revision: 9 })), 'KONFLIK_REVISION');
  const r = j(kirim({}));
  assert.deepStrictEqual([r.revision, r.temuan.ketTindakLanjut, r.temuan.deskripsi], [2, 'Tidak Padam', 'baru']);
  const b = x.baris('db_temuan_inspeksi')[0];
  assert.deepStrictEqual([b.keterangan_tindak_lanjut, b.jenis_temuan_id, b.penyulang, b.revision], ['Tidak Padam', 'jt-2', t.penyulang, 2]);
  x.ubah('db_temuan_inspeksi', 0, { sumber: 'INSPEKSI' });
  assert.strictEqual(kodeError(() => kirim({ revision: 2 })), 'AKSES_DITOLAK');
  assert.ok(!x.h.skemaUbahTemuanInsJar_().ketTindakLanjut && !x.h.skemaTemuanPetugasInsJar_({}).ketTindakLanjut, 'form petugas tanpa pilihan ini');
});
