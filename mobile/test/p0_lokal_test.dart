import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/gps.dart';
import 'package:sisi_row/features/row/watermark.dart';
import 'package:sisi_row/features/yandal/p0_form_screen.dart' show daftarPekerjaanP0;
import 'package:sisi_row/features/yandal/p0_model.dart';
import 'package:sisi_row/features/yandal/p0_repository.dart' show P0Repository;

/// v0.64.0: tab Pekerjaan Shift + P0 di HP (logika murni).
void main() {
  final t0 = DateTime.utc(2026, 10, 8, 2); // 09:00 WIB
  // v0.64.7: default foto sudah disimpan (terkunci); kunci: false = baru diambil, belum disimpan
  FotoP0 f(int menit, {bool kunci = true, double lat = -3.0, double lng = 106.5}) =>
      FotoP0(path: '/x/$menit.jpg', waktu: t0.add(Duration(minutes: menit)), sumber: 'KAMERA', lat: lat, lng: lng, terkunci: kunci);
  P0Lokal p0({String nama = 'Pengecekan Gardu', String lain = '', Map<String, FotoP0> foto = const {}, int no = 1}) => P0Lokal(
        id: 'id$no',
        userId: 'u',
        shiftId: 's1',
        kodeShift: 'Y13-16130261008001-SHF1.001',
        no: no,
        namaPekerjaan: nama,
        pekerjaanLainnya: lain,
        penyulang: 'TB-01',
        daerah: 'Toboali',
        dibuat: t0,
        foto: foto,
      );

  test('tahap & status mengikuti foto (v1): Sebelum = mulai, Pekerjaan = proses, Sesudah = selesai', () {
    expect(p0().tahap, 'Belum mulai');
    expect(p0(foto: {'SEBELUM': f(0)}).tahap, 'Memulai pekerjaan');
    expect(p0(foto: {'SEBELUM': f(0), 'PEKERJAAN': f(20)}).tahap, 'Proses pekerjaan');
    final s = p0(foto: {'SEBELUM': f(0), 'PEKERJAAN': f(20), 'SESUDAH': f(75)});
    expect([s.tahap, s.status, s.selesai], ['P0 selesai', 'SELESAI', true]);
    expect(s.durasi, const Duration(minutes: 75));
    expect(p0(foto: {'SEBELUM': f(0)}).durasi, isNull);
    expect(p0().status, 'PROSES');
  });

  test('foto wajib urut (v0.64.7: foto yang sudah disimpan terkunci)', () {
    expect(p0().bolehFoto('SEBELUM'), isTrue);
    expect(p0().bolehFoto('PEKERJAAN'), isFalse);
    expect(p0().bolehFoto('SESUDAH'), isFalse);
    final a = p0(foto: {'SEBELUM': f(0)});
    expect(a.bolehFoto('PEKERJAAN'), isTrue);
    expect(a.bolehFoto('SESUDAH'), isFalse);
    expect(a.bolehFoto('SEBELUM'), isFalse, reason: 'v0.64.7: foto sudah disimpan tidak bisa diambil ulang');
    expect(p0().bolehFoto('LAIN'), isFalse);
  });

  test('v0.64.5 -> v0.64.7: ambil ulang hanya foto yang belum disimpan; tahap berikutnya setelah disimpan', () {
    expect(p0().bolehAmbilUlang('SEBELUM'), isFalse, reason: 'slot kosong = ambil pertama');
    final a = p0(foto: {'SEBELUM': f(0, kunci: false)});
    expect([a.bolehAmbilUlang('SEBELUM'), a.bolehFoto('SEBELUM'), a.alasanTidakUlang('SEBELUM')], [true, true, null]);
    expect(a.bolehFoto('PEKERJAAN'), isFalse, reason: 'Sebelum belum disimpan');
    expect(a.alasanBelumBoleh('PEKERJAAN'), 'Simpan foto Sebelum dulu.');
    expect(p0().alasanBelumBoleh('SESUDAH'), 'Ambil foto Pekerjaan dulu.');
    expect([a.belumDisimpan, a.tahap, a.selesai], [['SEBELUM'], 'Simpan foto Sebelum', false]);
    final k = a.denganFotoDikunci();
    expect([k.bolehAmbilUlang('SEBELUM'), k.bolehFoto('SEBELUM'), k.bolehFoto('PEKERJAAN'), k.belumDisimpan], [false, false, true, <String>[]]);
    expect(k.alasanTidakUlang('SEBELUM'), 'Foto Sebelum sudah disimpan, tidak bisa diambil ulang.');
    final c = p0(foto: {'SEBELUM': f(0), 'PEKERJAAN': f(20), 'SESUDAH': f(75, kunci: false)});
    expect([c.selesai, c.status, c.bolehAmbilUlang('SESUDAH')], [false, 'PROSES', true], reason: 'Sesudah belum disimpan = belum selesai');
    expect(c.denganFotoDikunci().selesai, isTrue);
    expect(c.alasanTidakUlang('LAIN'), isNull);
  });

  test('v0.64.7: foto lama tanpa kunci = sudah disimpan; kunci ikut json; koordinat, jarak; v0.64.8 teks WA', () {
    final j = f(0, kunci: false).keJson();
    expect(j['terkunci'], false);
    expect(FotoP0.dariJson(j).terkunci, isFalse);
    expect(FotoP0.dariJson({...j}..remove('terkunci')).terkunci, isTrue);
    final x = p0(nama: 'Ganti FCO', foto: {'SEBELUM': f(0, lat: -3.012345, lng: 106.456789), 'PEKERJAAN': f(20), 'SESUDAH': f(75, lat: -3.0213, lng: 106.4568)});
    expect(P0Lokal.dariJson(x.keJson()).foto['SESUDAH']!.terkunci, isTrue);
    expect(x.foto['SEBELUM']!.koordinat, '-3.012345,106.456789');
    expect(x.jarakKm!, closeTo(0.996, 0.01));
    expect(p0(foto: {'SEBELUM': f(0)}).jarakKm, isNull);
    expect([teksJarak(0.25), teksJarak(1.234)], ['250 m', '1,23 km']);
    // v0.64.8: FORMAT PENUGASAN KHUSUS
    final r = p0(nama: 'ROW (Pangkas)').keJson();
    final y = P0Lokal.dariJson({...r, 'penyulang': 'Tanjung Labu', 'section': 'FCO Jar Tj. Sangkar - Tj. Sangkar', 'daerah': 'Tj . Sangkar'});
    expect(teksWaP0(y, petugas: ['hartono pane', 'sufiyanto']),
        '*FORMAT PENUGASAN KHUSUS*\n\nPekerjaan : ROW (Pangkas)\nPenyulang : Tanjung Labu\nSection : FCO Jar Tj. Sangkar - Tj. Sangkar\n'
        'Daerah : Tj . Sangkar\nPetugas : hartono pane dan sufiyanto');
    final kosong = teksWaP0(p0(nama: 'Lain - Lain', lain: 'Ganti FCO'), petugas: ['A', 'B', 'C']);
    expect(kosong, contains('Pekerjaan : Ganti FCO'));
    expect(kosong, contains('Section : -'));
    expect(kosong, endsWith('Petugas : A, B dan C'));
    expect(teksWaP0(p0(), petugas: const []), endsWith('Petugas : -'));
  });

  test('Lain - Lain tampil sebagai pekerjaan lainnya; json bolak-balik utuh', () {
    final x = p0(nama: pekerjaanLainLain, lain: 'Ganti FCO', foto: {'SEBELUM': f(0)}, no: 7);
    expect(x.namaTampil, 'Ganti FCO');
    expect(x.kodeTampil, 'P0 #007');
    expect(x.lokasi, 'TB-01 · Toboali');
    final y = P0Lokal.dariJson(x.keJson());
    expect([y.namaTampil, y.no, y.foto['SEBELUM']!.waktu, y.foto['SEBELUM']!.lat], ['Ganti FCO', 7, x.foto['SEBELUM']!.waktu, -3.0]);
    expect(y.denganFoto('PEKERJAAN', f(10)).foto.keys, ['SEBELUM', 'PEKERJAAN']);
  });

  test('rincian per jenis pekerjaan: sedang & selesai dipisah, terbanyak dulu', () {
    final g = kelompokP0([
      p0(no: 1),
      p0(no: 2, foto: {'SEBELUM': f(0), 'SESUDAH': f(30)}),
      p0(no: 3, nama: 'Pengecekan Switching'),
      p0(no: 4, foto: {'SEBELUM': f(0)}),
    ]);
    expect(g.map((k) => k.nama), ['Pengecekan Gardu', 'Pengecekan Switching']);
    expect([g.first.proses.length, g.first.selesai.length, g.first.jumlah], [2, 1, 3]);
  });

  test('kemajuan shift dari batas sesi (hh:59): mulai, persen, sisa', () {
    final sampai = DateTime.utc(2026, 10, 8, 8, 59); // 15:59 WIB
    final j = jadwalShiftDari(sampai);
    expect(j.mulai, DateTime.utc(2026, 10, 8, 1)); // 08:00 WIB
    final k = kemajuanShift(sampai, DateTime.utc(2026, 10, 8, 5)); // 12:00 WIB
    expect(k.lewat, closeTo(.5, .001));
    expect(teksDurasi(k.sisa), '3 j 59 mnt');
    expect(kemajuanShift(sampai, DateTime.utc(2026, 10, 8, 10)).sisa, Duration.zero);
    expect(teksDurasi(const Duration(minutes: 12)), '12 mnt');
  });

  test('v0.65.12: durasi di bawah 1 menit tetap tampil (detik); durasi menit desimal dari server', () {
    expect([teksDurasi(const Duration(seconds: 45)), teksDurasi(Duration.zero), teksDurasi(const Duration(seconds: -3))],
        ['45 dtk', '0 dtk', '0 dtk']);
    expect(teksDurasi(const Duration(minutes: 1, seconds: 30)), '1 mnt');
    expect([teksMenit(0.75), teksMenit(0.17), teksMenit(90), teksMenit('1,5'), teksMenit(null), teksMenit('x')],
        ['45 dtk', '10 dtk', '1 j 30 mnt', '1 mnt', '-', '-']);
  });

  test('daftar pekerjaan P0 dari master modul YANDAL (aktif, urut), Lain - Lain selalu terakhir', () {
    final l = daftarPekerjaanP0([
      {'modul': 'YANDAL', 'nama': 'Pengecekan Switching', 'urutan': 2, 'aktif': true},
      {'modul': 'YANDAL', 'nama': 'Pengecekan Gardu', 'urutan': 1, 'aktif': true},
      {'modul': 'YANDAL', 'nama': 'Lama', 'urutan': 3, 'aktif': false},
      {'modul': 'ROW', 'nama': 'Rabas', 'urutan': 1, 'aktif': true},
      {'modul': 'yandal', 'nama': pekerjaanLainLain, 'urutan': 0, 'aktif': true},
    ]);
    expect(l, ['Pengecekan Gardu', 'Pengecekan Switching', pekerjaanLainLain]);
    expect(daftarPekerjaanP0(const []), [pekerjaanLainLain]);
    // v0.64.6: baris master "Lain - Lain" (bobot kosong) beda huruf / spasi tetap tidak dobel
    expect(daftarPekerjaanP0([
      {'modul': 'YANDAL', 'nama': 'LAIN  - lain', 'urutan': 999, 'aktif': true, 'bobot': null},
      {'modul': 'YANDAL', 'nama': 'Ganti FCO', 'urutan': 1, 'aktif': true, 'bobot': 3},
    ]), ['Ganti FCO', pekerjaanLainLain]);
  });

  test('watermark P0: label Kode P0 & Petugas, tanpa Diameter; watermark ROW tidak berubah', () {
    final d = DataWatermark(
      kodeEksekusi: 'Y13 P0 #001',
      ulp: 'Toboali',
      tim: 'YANDAL 13',
      subTim: 'Andi, Budi',
      penyulang: 'TB-01',
      section: 'Toboali',
      waktu: t0,
      koordinat: '-3.000000, 106.500000',
      akurasiM: 5,
      diameter: null,
      jenis: 'Pengecekan Gardu',
      slot: 'Sebelum',
      labelKode: 'Kode P0',
      labelSubTim: 'Petugas',
      tampilDiameter: false,
    );
    expect(d.baris.map((b) => b.$1).toList(),
        ['Kode P0', 'ULP', 'Tim', 'Petugas', 'Penyulang', 'Section', 'Waktu', 'Koordinat', 'Jenis Pekerjaan']);
    expect(d.copyWith(waktu: t0).baris.map((b) => b.$1).first, 'Kode P0', reason: 'copyWith membawa label');
  });

  test('v0.65.0: status kirim P0: perluKirim (data, foto disimpan, final akhir shift), jawaban server, kode resmi', () {
    final a = p0(foto: {'SEBELUM': f(0), 'PEKERJAAN': f(20, kunci: false)});
    expect([a.terkirim, a.perluKirim(akhirShift: false), a.slotDisimpan], [false, true, ['SEBELUM']]);
    expect([a.kodeTampil, a.kodeWatermark], ['P0 #001', 'Y13-16130261008001-SHF1.001 P0 #001']);
    final b = a.denganServer({'kodeP0': 'Y13-16130261008001-SHF1.001-P0.004', 'statusApproval': '', 'fotoServer': ['SEBELUM']});
    expect([b.terkirim, b.kodeTampil, b.kodeWatermark, b.foto['SEBELUM']!.terkirim, b.foto['PEKERJAAN']!.terkirim],
        [true, 'Y13-16130261008001-SHF1.001-P0.004', 'Y13-16130261008001-SHF1.001-P0.004', true, false]);
    expect(b.perluKirim(akhirShift: false), isFalse, reason: 'foto Pekerjaan belum disimpan = belum dikirim');
    expect(b.perluKirim(akhirShift: true), isTrue, reason: 'akhir shift: dikunci otomatis + tanda final');
    final c = b.denganServer({'statusApproval': 'Rejected', 'alasanRejected': 'P0 Tidak Selesai', 'fotoServer': ['SEBELUM', 'PEKERJAAN']},
        finalTerkirim: true);
    expect([c.perluKirim(akhirShift: true), c.statusApproval, c.alasanRejected, c.kodeResmi],
        [false, 'Rejected', 'P0 Tidak Selesai', 'Y13-16130261008001-SHF1.001-P0.004']);
    final e = a.denganError('WAKTU_DI_LUAR_SHIFT');
    expect([e.errorKirim, e.perluKirim(akhirShift: true)], ['WAKTU_DI_LUAR_SHIFT', false], reason: 'ditolak server tidak menahan sync akhir shift');
    expect(e.denganError('').perluKirim(akhirShift: false), isTrue);
    final j = P0Lokal.dariJson(c.keJson());
    expect([j.kodeResmi, j.finalTerkirim, j.statusApproval, j.alasanRejected, j.terkirim, j.foto['PEKERJAAN']!.terkirim],
        [c.kodeResmi, true, 'Rejected', 'P0 Tidak Selesai', true, true]);
    expect(P0Lokal.dariJson(p0().keJson()..remove('kodeResmi')).kodeResmi, '');
  });

  // ---------- v0.65.2: koordinat foto menyusul maks 30 detik ----------
  test('GpsSusulan.pilih: hanya sampel 0..30 detik sesudah jepret; sampel PERTAMA yang cukup akurat, selain itu yang terbaik', () {
    final j = DateTime.utc(2026, 10, 8, 3);
    SampelSusulan s(int detik, double akurasi, {double lat = -3.0}) => (s: (lat: lat, lng: 106.5, akurasi: akurasi), t: j.add(Duration(seconds: detik)));
    expect(GpsSusulan.pilih([], j), isNull);
    expect(GpsSusulan.pilih([s(-5, 4), s(31, 4)], j), isNull, reason: 'sebelum jepret / lewat 30 detik = tidak dipakai');
    final a = GpsSusulan.pilih([s(20, 3, lat: -3.2), s(8, 12, lat: -3.1), s(4, 40)], j)!;
    expect([a.lat, a.detik], [-3.1, 8], reason: 'pertama yang <= 15 m, bukan yang paling akurat belakangan');
    final b = GpsSusulan.pilih([s(3, 60), s(9, 25, lat: -3.3), s(15, 45)], j)!;
    expect([b.lat, b.akurasi, b.detik], [-3.3, 25.0, 9], reason: 'tidak ada yang cukup = terbaik');
    expect(GpsSusulan.pilih([(s: (lat: 0.0, lng: 0.0, akurasi: 5.0), t: j)], j), isNull, reason: 'sampel tidak valid');
    expect([GpsSusulan.cukup((lat: -3.0, lng: 106.5, akurasi: 15)), GpsSusulan.cukup((lat: -3.0, lng: 106.5, akurasi: 16))], [true, false]);
  });

  test('FotoP0 susulan tersimpan di JSON; titik pekerjaan cadangan dari foto Pekerjaan, Sesudah tidak dipakai', () {
    final s = FotoP0(path: '/a.jpg', waktu: t0, sumber: 'KAMERA', lat: -3.0, lng: 106.5, akurasiM: 8, gpsSusulanDetik: 12);
    final b = FotoP0.dariJson(s.keJson());
    expect([b.gpsSusulanDetik, b.dikunci().gpsSusulanDetik, b.dikirim().gpsSusulanDetik], [12, 12, 12]);
    expect(FotoP0.dariJson(f(0).keJson()).gpsSusulanDetik, isNull);
    expect(f(0).keJson().containsKey('gpsSusulanDetik'), isFalse);
    FotoP0 tanpa(int m) => FotoP0(path: '/t$m.jpg', waktu: t0.add(Duration(minutes: m)), sumber: 'KAMERA', terkunci: true);
    final ada = p0(foto: {'SEBELUM': f(0, lat: -3.0), 'PEKERJAAN': f(5, lat: -3.5), 'SESUDAH': f(9, lat: -3.009)});
    expect(ada.slotTitikPekerjaan, 'SEBELUM');
    final cad = p0(foto: {'SEBELUM': tanpa(0), 'PEKERJAAN': f(5, lat: -3.0), 'SESUDAH': f(9, lat: -3.009)});
    expect(cad.slotTitikPekerjaan, 'PEKERJAAN');
    expect((cad.jarakKm! - 1).abs() < 0.01, isTrue);
    final kosong = p0(foto: {'SEBELUM': tanpa(0), 'PEKERJAAN': tanpa(5), 'SESUDAH': f(9)});
    expect([kosong.slotTitikPekerjaan, kosong.fotoTitikPekerjaan, kosong.jarakKm], [null, null, null]);
  });

  test('watermark P0: baris Koordinat menandai susulan; ROW tidak berubah', () {
    DataWatermark w({int? n}) => DataWatermark(kodeEksekusi: 'K', ulp: 'Toboali', tim: 'T', subTim: 'S', penyulang: null, section: null,
        waktu: t0, koordinat: '-3.000000, 106.500000', akurasiM: 8, diameter: null, jenis: null, slot: 'Sebelum', gpsSusulanDetik: n);
    String k(DataWatermark d) => d.baris.firstWhere((b) => b.$1 == 'Koordinat').$2;
    expect(k(w()), '-3.000000, 106.500000 (±8 m)');
    expect(k(w(n: 12)), '-3.000000, 106.500000 (±8 m, susulan 12 dtk)');
    expect(k(w(n: 12).copyWith(waktu: t0)), '-3.000000, 106.500000 (±8 m, susulan 12 dtk)');
  });

  test('v0.65.3: umur foto sejak jepret (review) mengurangi jam simpan: 0..10 menit', () {
    expect(P0Repository.umurFoto(null), Duration.zero);
    expect(P0Repository.umurFoto(const Duration(seconds: -3)), Duration.zero);
    expect(P0Repository.umurFoto(const Duration(seconds: 25)), const Duration(seconds: 25));
    expect(P0Repository.umurFoto(const Duration(minutes: 30)), const Duration(minutes: 10));
  });

  // ---------- v0.66.0: Pengecekan Switching ----------
  test('v0.66.0: nama switching dari depan section, hanya LBS / ACR; P0 Pengecekan Switching', () {
    expect(['LBS A - LBS B', 'ACR Toboali - LBS X', 'LBS Tunggal', 'PMT Keposang - Inc. Keposang', ''].map(namaSwitching).toList(),
        ['LBS A', 'ACR Toboali', 'LBS Tunggal', 'PMT Keposang', '']);
    expect(['LBS A', 'lbs.12', 'ACR Toboali', 'PMT Keposang', 'FCO Jar', 'LBSX', 'Acr-1', ''].map(switchingSah).toList(),
        [true, true, true, false, false, false, true, false]);
    expect([p0Switching('Pengecekan Switching'), p0Switching(' pengecekan  SWITCHING '), p0Switching('Pengecekan Gardu')], [true, true, false]);
    expect([teksArus(45), teksArus(47.5), teksArus(0)], ['45', '47,5', '0']);
  });

  test('v0.66.0: switching: Sesudah P0 terkunci sampai ada foto arus; tambah setelah Sebelum disimpan; kirim data / arus / foto; JSON', () {
    SwitchingLokal w({Map<String, FotoP0> foto = const {}, List<double>? terkirim}) => SwitchingLokal(
        id: 'w1', no: 1, sectionId: 's1', section: 'LBS A - LBS B',
        indikator: const {'Remote': 'Nyala', 'Local': 'Padam', 'Protection': 'Nyala', 'Reclose': 'Nyala'},
        arusR: 45, arusS: 47.5, arusT: 44, dibuat: t0, foto: foto, arusTerkirim: terkirim);
    final kosong = p0(nama: 'Pengecekan Switching', foto: {'SEBELUM': f(0), 'PEKERJAAN': f(5)});
    expect([kosong.butuhSwitching, kosong.bolehTambahSwitching, kosong.bolehFoto('SESUDAH')], [true, true, false]);
    expect(kosong.alasanBelumBoleh('SESUDAH'), 'Simpan data switching dan Foto Arus dulu.');
    expect(p0(nama: 'Pengecekan Switching', foto: {'SEBELUM': f(0, kunci: false)}).bolehTambahSwitching, isFalse);
    // v0.74.0: default helper = Pengecekan Gardu (butuh ukur gardu), jadi pekerjaan lain diuji dengan Ganti FCO
    expect(p0(nama: 'Ganti FCO', foto: {'SEBELUM': f(0), 'PEKERJAAN': f(5)}).bolehFoto('SESUDAH'), isTrue, reason: 'pekerjaan lain tidak butuh switching');
    final tanpaArus = kosong.denganSwitching([w()]);
    expect([tanpaArus.adaSwitchingArus, tanpaArus.bolehFoto('SESUDAH')], [false, false]);
    final sw = w(foto: {'ARUS': f(6)});
    final ada = kosong.denganSwitching([sw]);
    expect([ada.adaSwitchingArus, ada.bolehFoto('SESUDAH')], [true, true]);
    expect([tanpaArus.bolehTambahSwitching, ada.bolehTambahSwitching], [false, false], reason: 'v0.66.3: 1 switching per P0');
    expect(p0(nama: 'Pengecekan Switching', foto: {'SEBELUM': f(0), 'PEKERJAAN': f(5), 'SESUDAH': f(9)}).bolehTambahSwitching, isFalse);
    // v0.75.0: foto switching urutan bebas (tanpa menunggu Arus / Simpan), tanpa ambil ulang
    expect([w().bolehFoto('ARUS'), w().bolehFoto('GANGGUAN_1'), sw.bolehFoto('GANGGUAN_1'), sw.bolehFoto('ARUS')], [true, true, true, false]);
    expect(w().alasanBelumBoleh('GANGGUAN_2'), isNull);
    // v0.75.0: draf (foto sebelum Simpan): tidak dikirim, Sesudah terkunci, section terkunci, JSON bolak-balik
    final draf = SwitchingLokal(
        id: 'w2', no: 1, sectionId: 's1', section: 'LBS A - LBS B', indikator: const {'Remote': 'Nyala'},
        arusR: 0, arusS: 0, arusT: 0, dibuat: t0, foto: {'ARUS': f(6)}, disimpan: false, isianDraf: const {'R': '13'});
    final pDraf = kosong.denganSwitching([draf]);
    expect([draf.perluKirim, pDraf.adaSwitchingArus, pDraf.bolehFoto('SESUDAH'), pDraf.bolehTambahSwitching, pDraf.bolehUbahLokasi],
        [false, false, false, true, false]);
    expect(pDraf.alasanTidakUbahLokasi, 'Sudah ada foto switching. Hapus foto draf dulu untuk mengubah section.');
    final jDraf = P0Lokal.dariJson(pDraf.keJson()).switching.first;
    expect([jDraf.disimpan, jDraf.isianDraf['R'], jDraf.indikator['Remote'], jDraf.adaFotoArus], [false, '13', 'Nyala', true]);
    final disimpan = draf.disimpanDari(
        indikator: const {'Remote': 'Nyala', 'Local': 'Padam', 'Protection': 'Nyala', 'Reclose': 'Padam'},
        arusR: 13, arusS: 14, arusT: 15, catatan: 'ok', dibuat: t0.add(const Duration(minutes: 7)));
    expect([disimpan.disimpan, disimpan.perluKirim, disimpan.isianDraf.isEmpty, disimpan.indikator['Reclose'], disimpan.foto.length],
        [true, true, true, 'Padam', 1]);
    expect(kosong.denganSwitching([disimpan]).bolehFoto('SESUDAH'), isTrue);
    expect(w().keJson().containsKey('disimpan'), isFalse);
    // kirim: data baru, arus diubah sesudah terkirim, foto belum terkirim
    expect([w().perluKirimData, w(terkirim: [45, 47.5, 44]).perluKirimData, w(terkirim: [45, 47.5, 44]).denganArus(46, 47.5, 44).perluKirimData],
        [true, false, true]);
    final terkirim = w(terkirim: [45, 47.5, 44]);
    expect([terkirim.perluKirim, w(foto: {'ARUS': f(6)}, terkirim: [45, 47.5, 44]).perluKirim], [false, true]);
    final dariServer = w(foto: {'ARUS': f(6)}).denganServer({'kodeSwitching': 'K-P0.001-SWC.001', 'fotoServer': ['ARUS']}, arusDikirim: [45, 47.5, 44]);
    expect([dariServer.kodeResmi, dariServer.foto['ARUS']!.terkirim, dariServer.perluKirim], ['K-P0.001-SWC.001', true, false]);
    expect(kosong.denganSwitching([w()]).perluKirim(akhirShift: false), isTrue);
    // JSON P0 + switching
    final j = P0Lokal.dariJson(ada.ubahSwitching('w1', (e) => e.denganArus(50, 51, 52)).keJson());
    expect([j.switching.length, j.switching.first.arusR, j.switching.first.nama, j.switching.first.indikator['Local'], j.switching.first.adaFotoArus],
        [1, 50.0, 'LBS A', 'Padam', true]);
    expect(P0Lokal.dariJson(p0().keJson()).switching, isEmpty);
    expect(p0().keJson().containsKey('switching'), isFalse);
  });

  test('v0.66.4: section Pengecekan Switching hanya LBS / ACR; Nama Switching dari section P0; edit lokasi & kirim ulang', () {
    const semua = [
      (id: 'a', nama: 'PMT Kota - ACR Kolong Bakung'),
      (id: 'b', nama: 'ACR Kolong Bakung - LBS Honda'),
      (id: 'c', nama: 'FCO Jar Angsana - TB0214'),
      (id: 'd', nama: 'LBS Ampera - LBS Gg. Asem'),
    ];
    expect(sectionUntukPekerjaan(semua, 'Pengecekan Switching').map((e) => e.id), ['b', 'd']);
    expect(sectionUntukPekerjaan(semua, 'Ganti FCO').length, 4);
    final sw = p0(nama: 'Pengecekan Switching', foto: {'SEBELUM': f(0)})
        .denganLokasi(penyulang: 'Kota', section: 'LBS Ampera - LBS Gg. Asem', sectionId: 'd', daerah: '');
    expect([sw.namaSwitchingP0, sw.lokasiBelumTerkirim, sw.bolehUbahLokasi], ['LBS Ampera', false, true], reason: 'belum terkirim = ikut kiriman pertama');
    expect(p0(nama: 'Pengecekan Switching').denganLokasi(penyulang: 'Kota', section: 'FCO Jar - TB1', sectionId: 'c', daerah: '').namaSwitchingP0, '');
    // sudah terkirim: edit = tandai kirim ulang; jawaban server membersihkan tanda
    final kirim = sw.denganServer({'kodeP0': 'K-P0.001'});
    final ubah = kirim.denganLokasi(
        penyulang: 'Kota', section: 'ACR Kolong Bakung - LBS Honda', sectionId: 'b', daerah: 'Kolong Bakung', diubah: t0.add(const Duration(minutes: 3)));
    expect([ubah.lokasiBelumTerkirim, ubah.perluKirim(akhirShift: false), ubah.namaSwitchingP0], [true, true, 'ACR Kolong Bakung']);
    expect([P0Lokal.dariJson(ubah.keJson()).lokasiBelumTerkirim, P0Lokal.dariJson(ubah.keJson()).lokasiDiubah], [true, t0.add(const Duration(minutes: 3))]);
    expect(ubah.denganServer({}).lokasiDiubah, ubah.lokasiDiubah, reason: 'v0.66.5: jam edit ikut tersimpan');
    expect(ubah.denganServerData({'kodeP0': 'K-P0.001'}, ubah).lokasiBelumTerkirim, isFalse);
    expect(ubah.denganServerData({'kodeP0': 'K-P0.001'}, kirim).lokasiBelumTerkirim, isTrue, reason: 'diedit lagi saat kirim');
    // terkunci: switching sudah disimpan / P0 selesai
    final adaSw = ubah.denganSwitching([
      SwitchingLokal(id: 'w', no: 1, sectionId: 'b', section: ubah.section, indikator: const {}, arusR: 1, arusS: 1, arusT: 1, dibuat: t0),
    ]);
    expect([adaSw.bolehUbahLokasi, adaSw.alasanTidakUbahLokasi], [false, 'Data switching sudah disimpan, section tidak bisa diubah lagi.']);
    expect(p0(foto: {'SEBELUM': f(0), 'PEKERJAAN': f(5), 'SESUDAH': f(9)}).bolehUbahLokasi, isFalse);
    expect(p0().denganSwitching([adaSw.switching.first]).bolehUbahLokasi, isTrue, reason: 'pekerjaan lain tidak terkunci switching');
  });
}
