import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/insjar/ringkasan_temuan.dart';

/// v1.0.29: kartu section, halaman section (kartu per jenis) dan kartu daftar temuan di layar sempit tanpa overflow.
void main() {
  Map<String, dynamic> t(int i, String jenis, String status, {String section = 'FCO Jar Tj. Sangkar Ujung Panjang Sekali'}) => {
        'temuanId': 'id$i',
        'kodeTemuan': i.isEven ? 'PEG-16130261024001-PNY.001-TJR.00$i' : '',
        'jenisTemuan': jenis,
        'penyulang': 'TANJUNG LABU',
        'section': section,
        'nomorTiang': 'TL-0$i',
        'deskripsi': 'Isolator retak di tiang dekat jalan, perlu penggantian segera sebelum musim hujan datang.',
        'tanggal': '2026-10-24',
        'sumber': 'ADMIN',
        'wo': {'status': status},
      };
  final data = DataRingkasTemuan(
    temuan: [
      t(1, 'Isolator tumpu retak / pecah pada tiang tengah', ''),
      t(2, 'Isolator tumpu retak / pecah pada tiang tengah', 'TERKIRIM'),
      t(3, 'FCO rusak', 'DIKERJAKAN'),
      t(4, 'Pohon menyentuh jaringan', 'SELESAI'),
    ],
    urutan: const {},
    kartu: (c, x) => KartuDaftarTemuan(t: x),
  );

  for (final lebar in [320.0, 400.0]) {
    testWidgets('lebar $lebar: halaman section + daftar temuan tidak overflow', (tester) async {
      tester.view.physicalSize = Size(lebar, 2400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MaterialApp(
          home: RingkasanSectionScreen(data: data, penyulang: 'TANJUNG LABU', section: 'FCO Jar Tj. Sangkar Ujung Panjang Sekali')));
      expect(tester.takeException(), isNull);
      expect(find.text('Isolator tumpu retak / pecah pada tiang tengah'), findsOneWidget);
      expect(find.textContaining('ketuk = daftar temuan'), findsNothing);
      await tester.tap(find.text('FCO rusak'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.byType(KartuDaftarTemuan), findsOneWidget);
      expect(find.text('Dikerjakan'), findsOneWidget);

      await tester.pumpWidget(MaterialApp(home: DaftarTemuanScreen(data: data, judul: 'Semua temuan')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Belum ada kode temuan'), findsWidgets);
    });

    testWidgets('lebar $lebar: rincian ringkasan per jenis + per section tidak overflow', (tester) async {
      tester.view.physicalSize = Size(lebar, 2400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MaterialApp(home: RingkasanTemuanScreen(data: data, modeAwal: ModeRingkasTemuan.jenis)));
      expect(tester.takeException(), isNull);
      expect(find.text('Jumlah per jenis temuan'), findsOneWidget);
      expect(find.textContaining('ketuk = daftar temuan'), findsNothing);
      await tester.pumpWidget(MaterialApp(home: RingkasanTemuanScreen(data: data, modeAwal: ModeRingkasTemuan.section)));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }
}
