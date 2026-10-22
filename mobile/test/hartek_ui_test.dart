import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/features/hartek/hartek_form.dart';
import 'package:sisi_row/features/hartek/hartek_gaya.dart';
import 'package:sisi_row/features/hartek/hartek_repository.dart';

void main() {
  test('angka: koma, nol, nilai tidak valid, batas, dan bilangan bulat', () {
    expect(angkaDari('1,25'), 1.25);
    expect(angkaDari('0'), 0);
    for (final s in ['', 'abc', 'NaN', 'Infinity']) { expect(angkaDari(s), isNull); }
    const n = IsianHartek('n', 'Jumlah', angka: true, wajib: true, bulat: true, max: 9999);
    expect(n.cek('', {}), isNotNull);
    expect(n.cek('abc', {}), isNotNull);
    expect(n.cek('-1', {}), isNotNull);
    expect(n.cek('10000', {}), isNotNull);
    expect(n.cek('1,5', {}), isNotNull);
    expect(n.cek('0', {}), isNull);
  });

  test('koordinat, panjang teks dan section sesuai penyulang', () {
    const k = IsianHartek('k', 'Koordinat', koordinat: true);
    expect(k.cek('-3.012345, 106.512345', {}), isNull);
    expect(k.cek('1, 2', {}), isNotNull);
    const t = IsianHartek('t', 'Catatan', multi: true, maks: 500);
    expect(t.cek('a\nb\nc\nd\ne\nf', {}), isNotNull);
    final s = IsianHartek('s', 'Section', wajib: true,
      pilihanDari: (n) => n['p'] == 'A' ? ['A1'] : ['B1']);
    expect(s.cek('A1', {'p': 'A'}), isNull);
    expect(s.cek('A1', {'p': 'B'}), isNotNull);
    expect(s.cek('', {'p': 'A'}), isNotNull);
  });

  test('pemerataan tetap dibatasi jenis pekerjaan dan kartu laporan sudah ada', () {
    expect(HartekRepository.pemerataanBoleh(' Pemerataan Beban Gardu '), isTrue);
    expect(HartekRepository.pemerataanBoleh('Pembagian Beban Gardu'), isTrue);
    expect(HartekRepository.pemerataanBoleh('Pemerataan Beban Trafo'), isFalse, reason: 'v0.94.1: nama lama Trafo tidak dipakai lagi');
    expect(HartekRepository.pemerataanBoleh('Ganti FCO'), isFalse);
    expect(pesanHartek('LAPORAN_UTAMA_SUDAH_DIBUAT'), contains('Laporan Utama telah dibuat'));
  });

  test('v0.89.0: selisih beban R/S/T, tanggal Indonesia, dan angka tampil', () {
    expect(HartekRepository.ketidakseimbangan([35, 35, 35]), 0);
    expect(HartekRepository.ketidakseimbangan([40, 35, 30])!.round(), 29);
    expect(HartekRepository.ketidakseimbangan([40, null, 30]), isNull);
    expect(HartekRepository.ketidakseimbangan([0, 0, 0]), isNull);
    expect(tanggalHartek('2026-10-14'), 'Rabu, 14 Oktober 2026');
    expect(tanggalHartek('bukan tanggal'), 'bukan tanggal');
    expect(angkaHartek(32), '32');
    expect(angkaHartek(1.5), '1.5');
  });

  Future<void> buka(WidgetTester tester, {
    required List<IsianHartek> Function(Map<String, String>) daftar,
    required Future<Map<String, dynamic>?> Function(Map<String, String>) simpan,
    Map<String, String> awal = const {},
    String? Function(Map<String, String>)? ringkasan,
  }) async {
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) => Scaffold(
      body: TextButton(
        onPressed: () => bukaFormHartek(context, judul: 'Material terpakai',
          keterangan: 'Contoh pekerjaan', daftar: daftar, simpan: simpan, awal: awal, ringkasan: ringkasan),
        child: const Text('Buka'),
      ),
    ))));
    await tester.tap(find.text('Buka'));
    await tester.pumpAndSettle();
  }

  testWidgets('form layar penuh: angka salah tetap di form dan tidak dikirim', (t) async {
    var kirim = 0;
    await buka(t, daftar: (_) => const [IsianHartek('jumlah', 'Jumlah', angka: true, wajib: true)],
      simpan: (_) async { kirim++; return {}; });
    expect(find.byType(AlertDialog), findsNothing);
    await t.enterText(find.byKey(const ValueKey('input-jumlah')), 'abc');
    await t.tap(find.byKey(const ValueKey('simpan-hartek')));
    await t.pumpAndSettle();
    expect(find.text('Masukkan angka yang valid'), findsOneWidget);
    expect(kirim, 0);
  });

  testWidgets('section lama dikosongkan saat penyulang berubah', (t) async {
    await buka(t, awal: {'penyulang': 'A', 'section': 'A1'},
      daftar: (_) => [
        const IsianHartek('penyulang', 'Penyulang', pilihan: ['A', 'B'], wajib: true),
        IsianHartek('section', 'Section', wajib: true,
          pilihanDari: (n) => n['penyulang'] == 'A' ? ['A1'] : ['B1']),
      ], simpan: (_) async => {});
    await t.tap(find.byKey(const ValueKey('input-penyulang')));
    await t.pumpAndSettle();
    await t.tap(find.text('B').last);
    await t.pumpAndSettle();
    expect(find.text('A1'), findsNothing);
    await t.tap(find.byKey(const ValueKey('simpan-hartek')));
    await t.pumpAndSettle();
    expect(find.text('Section wajib diisi'), findsOneWidget);
  });

  testWidgets('error server mempertahankan isian dan blokir simpan ganda', (t) async {
    final selesai = Completer<Map<String, dynamic>>();
    var kirim = 0;
    await buka(t, daftar: (_) => const [IsianHartek('material', 'Material', wajib: true)],
      simpan: (_) { kirim++; return selesai.future; });
    await t.enterText(find.byKey(const ValueKey('input-material')), 'Kabel NYY');
    await t.tap(find.byKey(const ValueKey('simpan-hartek')));
    await t.pump();
    expect(find.text('Menyimpan…'), findsOneWidget);
    final tombol = t.widget<FilledButton>(find.byKey(const ValueKey('simpan-hartek')));
    expect(tombol.onPressed, isNull);
    expect(kirim, 1);
    selesai.completeError(ApiException('MATERIAL_TIDAK_VALID', kolom: 'material'));
    await t.pumpAndSettle();
    final input = t.widget<TextField>(find.byKey(const ValueKey('input-material')));
    expect(input.controller!.text, 'Kabel NYY');
    expect(find.byType(FormHartekPage), findsOneWidget);
    expect(find.textContaining('Material tidak aktif'), findsWidgets);
  });

  testWidgets('sukses server menutup form; tidak menutup sebelum respons', (t) async {
    await buka(t, daftar: (_) => const [IsianHartek('jumlah', 'Jumlah', angka: true)],
      simpan: (_) async => {'materialId': 'contoh'});
    await t.enterText(find.byKey(const ValueKey('input-jumlah')), '3');
    await t.tap(find.byKey(const ValueKey('simpan-hartek')));
    await t.pumpAndSettle();
    expect(find.byType(FormHartekPage), findsNothing);
  });

  testWidgets('timeout tidak menawarkan retry otomatis', (t) async {
    await buka(t, daftar: (_) => const [IsianHartek('jumlah', 'Jumlah', angka: true)],
      simpan: (_) async => throw TimeoutException('uji'));
    await t.tap(find.byKey(const ValueKey('simpan-hartek')));
    await t.pumpAndSettle();
    expect(find.textContaining('Status simpan belum diketahui'), findsOneWidget);
    expect(find.text('Kembali & segarkan laporan'), findsOneWidget);
  });

  testWidgets('kembali mengingatkan isian yang belum disimpan', (t) async {
    await buka(t, daftar: (_) => const [IsianHartek('jumlah', 'Jumlah', angka: true)],
      simpan: (_) async => {});
    await t.enterText(find.byKey(const ValueKey('input-jumlah')), '2');
    await t.tap(find.byTooltip('Kembali'));
    await t.pumpAndSettle();
    expect(find.text('Tinggalkan isian?'), findsOneWidget);
    await t.tap(find.text('Lanjut isi'));
    await t.pumpAndSettle();
    expect(find.byType(FormHartekPage), findsOneWidget);
  });

  testWidgets('v0.89.0: jenis pekerjaan tampil sebagai ubin pilihan, wajib, dan membuka isian gardu', (t) async {
    Map<String, String>? terkirim;
    await buka(t, daftar: (n) => [
      const IsianHartek('jenis', 'Jenis pekerjaan', wajib: true, segmen: true, pilihan: ['Jaringan', 'Gardu', 'Non - Teknik']),
      if (n['jenis'] == 'Gardu') const IsianHartek('noGardu', 'Nomor gardu', wajib: true),
    ], simpan: (n) async { terkirim = n; return {}; });
    expect(find.byType(DropdownButtonFormField<String>), findsNothing);
    await t.tap(find.byKey(const ValueKey('simpan-hartek')));
    await t.pumpAndSettle();
    expect(find.text('Jenis pekerjaan wajib diisi'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('pilih-jenis-Gardu')));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('input-noGardu')), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('input-noGardu')), 'TB0001');
    await t.tap(find.byKey(const ValueKey('simpan-hartek')));
    await t.pumpAndSettle();
    expect(terkirim, {'jenis': 'Gardu', 'noGardu': 'TB0001'});
  });

  testWidgets('v1.0.15: checklist pilihBanyak (tier) menggabung pilihan sesuai urutan daftar; centang tanpa ikon peralatan', (t) async {
    Map<String, String>? terkirim;
    await buka(t, daftar: (_) => const [
      IsianHartek('tier', 'Tier inspeksi', wajib: true, segmen: true, pilihBanyak: true, pilihan: ['Tier 1', 'Tier 2']),
      IsianHartek('cover', 'Cover FCO atas', wajib: true, segmen: true, centang: true, pilihan: ['Lengkap', 'Belum Lengkap', 'Tidak Ada']),
    ], simpan: (n) async { terkirim = n; return {}; });
    expect(find.byIcon(Icons.handyman_outlined), findsNothing);
    expect(find.byIcon(Icons.check_box_outline_blank_rounded), findsNWidgets(5));
    for (final k in ['pilih-tier-Tier 2', 'pilih-tier-Tier 1', 'pilih-cover-Lengkap', 'pilih-cover-Tidak Ada']) {
      await t.ensureVisible(find.byKey(ValueKey(k)));
      await t.tap(find.byKey(ValueKey(k)));
      await t.pumpAndSettle();
    }
    expect(find.byIcon(Icons.check_box_rounded), findsNWidgets(3), reason: 'cover = satu pilihan');
    await t.tap(find.byKey(const ValueKey('simpan-hartek')));
    await t.pumpAndSettle();
    expect(terkirim, {'tier': 'Tier 1 & Tier 2', 'cover': 'Tidak Ada'});
  });

  test('v1.0.15: validasi pilihBanyak per pilihan', () {
    const i = IsianHartek('tier', 'Tier', wajib: true, pilihBanyak: true, pilihan: ['Tier 1', 'Tier 2']);
    expect(i.cek('Tier 1 & Tier 2', const {}), isNull);
    expect(i.cek('Tier 2', const {}), isNull);
    expect(i.cek('Tier 3', const {}), isNotNull);
    expect(nilaiCentang('Tier 1 & Tier 2'), ['Tier 1', 'Tier 2']);
  });

  testWidgets('v0.89.0: ringkasan hitung tampil dari isian', (t) async {
    await buka(t, daftar: (_) => const [
      IsianHartek('kmAwal', 'KM awal', angka: true),
      IsianHartek('kmAkhir', 'KM akhir', angka: true),
    ], simpan: (_) async => {}, ringkasan: (n) {
      final a = angkaDari(n['kmAwal']), b = angkaDari(n['kmAkhir']);
      return a == null || b == null ? null : 'Jarak tempuh ${angkaHartek(b - a)} km';
    });
    expect(find.textContaining('Jarak tempuh'), findsNothing);
    await t.enterText(find.byKey(const ValueKey('input-kmAwal')), '12480');
    await t.enterText(find.byKey(const ValueKey('input-kmAkhir')), '12512');
    await t.pump();
    expect(find.text('Jarak tempuh 32 km'), findsOneWidget);
  });

  testWidgets('form pada layar sempit tidak overflow', (t) async {
    t.view.physicalSize = const Size(320, 740);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await buka(t, daftar: (_) => const [
      IsianHartek('jumlah', 'Jumlah', wajib: true, angka: true),
      IsianHartek('kepemilikan', 'Kepemilikan'),
      IsianHartek('sebR', 'R', angka: true, akhiran: 'A', baris: 'seb', grup: 'Beban sebelum'),
      IsianHartek('sebS', 'S', angka: true, akhiran: 'A', baris: 'seb'),
      IsianHartek('sebT', 'T', angka: true, akhiran: 'A', baris: 'seb'),
      IsianHartek('jenis', 'Jenis', segmen: true, pilihan: ['Jaringan', 'Gardu', 'Non - Teknik']),
    ], simpan: (_) async => {});
    expect(t.takeException(), isNull);
  });

  testWidgets('v0.96.0: memilih material mengisi satuan default sistem (bacaSaja, tidak dapat diedit)', (t) async {
    Map<String, String>? terkirim;
    await buka(t, daftar: (_) => [
      IsianHartek('material', 'Material', wajib: true, pilihan: const ['Kabel NYY', 'Tiang Beton'],
          isiLain: (v) => {'satuan': v == 'Kabel NYY' ? 'm' : 'btg'}),
      const IsianHartek('jumlah', 'Jumlah', wajib: true, angka: true),
      const IsianHartek('satuan', 'Satuan', bacaSaja: true, contoh: 'Otomatis'),
    ], simpan: (n) async { terkirim = n; return {}; });
    await t.tap(find.byKey(const ValueKey('input-material')));
    await t.pumpAndSettle();
    await t.tap(find.text('Kabel NYY').last);
    await t.pumpAndSettle();
    expect(find.descendant(of: find.byKey(const ValueKey('input-satuan')), matching: find.text('m')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const ValueKey('input-satuan')), matching: find.byType(TextField)), findsNothing);
    await t.enterText(find.byKey(const ValueKey('input-jumlah')), '3');
    await t.tap(find.byKey(const ValueKey('simpan-hartek')));
    await t.pumpAndSettle();
    expect(terkirim?['satuan'], 'm');
  });

  test('v0.91.0: hasil grounding wajib angka, pesan pekerjaan di luar master', () {
    const g = IsianHartek('hasilSebelum', 'Sebelum', angka: true, max: 99999, akhiran: 'Ω');
    expect(g.cek('5 ohm', {}), isNotNull);
    expect(g.cek('7,5', {}), isNull);
    expect(pesanHartek('PEKERJAAN_TIDAK_DIKENAL'), contains('daftar'));
  });

  test('v0.94.0: pilihan pekerjaan disaring jenis lokasi; master tanpa jenis untuk semua; nama kembar = jenis sama didahulukan', () {
    final master = <Map<String, dynamic>>[
      {'jenisId': 'g1', 'nama': 'Penggantian Isolator', 'jenisPekerjaan': 'Jaringan', 'satuan': 'buah', 'kolomGaspol': 'harkomIsolator'},
      {'jenisId': 'g0', 'nama': 'Grounding', 'jenisPekerjaan': '', 'satuan': 'titik', 'kolomGaspol': ''},
      {'jenisId': 'g2', 'nama': 'Grounding', 'jenisPekerjaan': 'Gardu', 'satuan': 'titik', 'kolomGaspol': 'groundingGardu'},
      {'jenisId': 'g4', 'nama': 'Bersih Gardu', 'jenisPekerjaan': 'Non - Teknik', 'satuan': 'unit', 'kolomGaspol': ''},
      {'jenisId': '', 'nama': 'Tanpa ID', 'jenisPekerjaan': ''},
    ];
    final gardu = HartekRepository.pekerjaanUntukJenis(master, 'Gardu');
    expect(gardu.keys.toList(), ['Grounding']);
    expect(gardu['Grounding']!['jenisId'], 'g2');
    final jar = HartekRepository.pekerjaanUntukJenis(master, 'Jaringan');
    expect(jar.keys.toList(), ['Penggantian Isolator', 'Grounding']);
    expect(jar['Grounding']!['jenisId'], 'g0');
    expect(HartekRepository.pekerjaanUntukJenis(master, 'Non - Teknik').keys.toList(), ['Grounding', 'Bersih Gardu']);
    expect(pesanHartek('PEKERJAAN_BEDA_JENIS'), contains('jenis lokasi lain'));
  });

  test('v0.97.0: aturan grounding hanya untuk pekerjaan grounding dan pasang = sesudah saja', () {
    expect(HartekRepository.groundingBoleh('Perbaikan Grounding'), isTrue);
    expect(HartekRepository.groundingBoleh('Pasang Grounding Gardu'), isTrue);
    expect(HartekRepository.groundingBoleh('Ganti Arrester'), isFalse);
    expect(HartekRepository.groundingHanyaSesudah('Pasang Grounding'), isTrue);
    expect(HartekRepository.groundingHanyaSesudah('Perbaikan Grounding'), isFalse);
  });

  testWidgets('v0.97.0: turunan dikosongkan berjenjang saat induk berubah', (t) async {
    Map<String, String>? terkirim;
    await buka(t, awal: {'penyulangGardu': 'PNY-A', 'sectionGardu': 'SEC-1', 'noGardu': 'TB0001', 'koordinat': '-3.01, 106.51'},
      daftar: (_) => [
        const IsianHartek('penyulangGardu', 'Penyulang', wajib: true, pilihan: ['PNY-A', 'PNY-B'],
            turunan: ['sectionGardu', 'noGardu', 'koordinat']),
        IsianHartek('sectionGardu', 'Section', wajib: true,
            pilihanDari: (v) => v['penyulangGardu'] == 'PNY-A' ? ['SEC-1'] : ['SEC-2'],
            turunan: const ['noGardu', 'koordinat']),
        IsianHartek('noGardu', 'Nomor gardu', wajib: true,
            pilihanDari: (v) => v['sectionGardu'] == 'SEC-1' ? ['TB0001'] : ['TB0002'],
            isiLain: (v) => {'koordinat': v == 'TB0002' ? '-3.020000, 106.520000' : ''}),
        const IsianHartek('koordinat', 'Titik lokasi dari Master Gardu', bacaSaja: true, contoh: 'Terisi setelah gardu dipilih'),
      ], simpan: (n) async { terkirim = n; return {}; });
    await t.tap(find.byKey(const ValueKey('input-penyulangGardu')));
    await t.pumpAndSettle();
    await t.tap(find.text('PNY-B').last);
    await t.pumpAndSettle();
    expect(find.text('TB0001'), findsNothing);
    expect(find.text('-3.01, 106.51'), findsNothing);
    await t.tap(find.byKey(const ValueKey('input-sectionGardu')));
    await t.pumpAndSettle();
    await t.tap(find.text('SEC-2').last);
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('input-noGardu')));
    await t.pumpAndSettle();
    await t.tap(find.text('TB0002').last);
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('simpan-hartek')));
    await t.pumpAndSettle();
    expect(terkirim?['noGardu'], 'TB0002');
    expect(terkirim?['koordinat'], '-3.020000, 106.520000');
  });

  testWidgets('v0.98.10: indikator warna akurasi GPS tampil di form laporan header Hartek', (t) async {
    await buka(t,
      awal: {
        'koordinatAwal': '-2.939450, 106.901075',
        '_akurasi_koordinatAwal': '3.5',
      },
      daftar: (_) => const [
        IsianHartek('koordinatAwal', 'Koordinat awal', koordinat: true, grup: 'Berangkat'),
        IsianHartek('koordinatAkhir', 'Koordinat akhir', koordinat: true, grup: 'Kembali'),
      ],
      simpan: (_) async => {},
    );
    expect(find.text('Akurasi Tinggi (±3.5 m)'), findsOneWidget);
    expect(find.text('GPS belum direkam'), findsOneWidget);
    // jika koordinat diubah manual, status berubah menjadi Koordinat Terisi
    await t.enterText(find.byKey(const ValueKey('input-koordinatAwal')), '-2.939500, 106.901100');
    await t.pump();
    expect(find.text('Akurasi Tinggi (±3.5 m)'), findsNothing);
    expect(find.text('Koordinat Terisi'), findsOneWidget);
  });

  test('v0.98.11: nama peralatan hasil grounding otomatis sesuai jenis pekerjaan (Jaringan = switching section, Gardu = nomor gardu)', () {
    expect(
      HartekRepository.namaPeralatanGrounding(jenisPekerjaan: 'Jaringan', section: 'LBS Rias - LBS Bikang'),
      'LBS Rias',
    );
    expect(
      HartekRepository.namaPeralatanGrounding(jenisPekerjaan: 'Gardu', noGardu: 'tb0001'),
      'TB0001',
    );
  });
}
