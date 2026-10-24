import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/theme/app_colors.dart';
import 'package:sisi_row/widgets/kartu_laporan_tim.dart';

/// v1.0.34: kartu penyulang Ringkasan ROW (desain baru + slot aksi download) tidak overflow di HP sempit.
void main() {
  Widget kartu({String? catatan}) => GrupRingkasan(
        ikon: Icons.forest_rounded,
        warna: AppColors.success700,
        latar: AppColors.success100,
        judul: 'Tanjung Labu Panjang Sekali Nama Penyulangnya',
        sub: 'ROW-16130-261024-001.R01 · 12 eksekusi',
        catatan: catatan,
        angka: const [AngkaRingkas('Rabas', 8), AngkaRingkas('Tebang Sedang', 3), AngkaRingkas('Tebang Besar', 0)],
        baris: const [('FCO Jar Tj. Sangkar - Tj. Sangkar', 'Rabas 5 · Tebang Sedang 2'), ('LBS Rias', 'Rabas 3 · Tebang Sedang 1')],
        onTap: () {},
        labelBuka: 'Lihat eksekusi',
        aksi: OutlinedButton.icon(onPressed: () {}, icon: const Icon(Icons.download_rounded, size: 16), label: const Text('Download Foto')),
      );

  for (final lebar in [320.0, 400.0]) {
    testWidgets('lebar $lebar: tanpa overflow, aksi + peringatan tampil', (t) async {
      await t.binding.setSurfaceSize(Size(lebar, 900));
      await t.pumpWidget(MaterialApp(home: Scaffold(body: ListView(padding: const EdgeInsets.all(16), children: [kartu(catatan: '2 eksekusi foto belum lengkap')]))));
      expect(t.takeException(), isNull);
      expect(find.text('Download Foto'), findsOneWidget);
      expect(find.text('Lihat eksekusi'), findsOneWidget);
      expect(find.text('2 eksekusi foto belum lengkap'), findsOneWidget);
      expect(find.text('Tebang Besar'), findsOneWidget);
      await t.binding.setSurfaceSize(null);
    });
  }

  testWidgets('tanpa catatan / aksi: kaki hanya Lihat eksekusi', (t) async {
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: GrupRingkasan(
                ikon: Icons.forest_rounded,
                warna: AppColors.success700,
                latar: AppColors.success100,
                judul: 'A',
                sub: 'B',
                onTap: () {},
                labelBuka: 'Lihat eksekusi'))));
    expect(find.text('Lihat eksekusi'), findsOneWidget);
    expect(find.byIcon(Icons.add_a_photo_outlined), findsNothing);
  });
}
