import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/widgets/popup_berhasil.dart';

void main() {
  Future<BuildContext> pasang(WidgetTester t, {bool tenang = false}) async {
    late BuildContext ctx;
    await t.pumpWidget(MaterialApp(
      // MediaQuery di atas Navigator supaya overlay pop up ikut membaca "kurangi animasi"
      builder: (c, child) => MediaQuery(data: MediaQuery.of(c).copyWith(disableAnimations: tenang), child: child!),
      home: Builder(builder: (c) {
        ctx = c;
        return const Scaffold(body: SizedBox.expand());
      }),
    ));
    return ctx;
  }

  double opasitasCentang(WidgetTester t) =>
      t.widget<Opacity>(find.byKey(const ValueKey('popup-centang'))).opacity;

  testWidgets('v0.92.0: centang muncul, hilang, muncul, hilang, lalu menetap; pop up hilang sendiri', (t) async {
    final ctx = await pasang(t);
    var selesai = false;
    unawaited(tampilPopupBerhasil(ctx, judul: 'Foto berhasil didownload', keterangan: '3 foto tersimpan di galeri')
        .then((_) => selesai = true));
    await t.pump();
    await t.pump();
    expect(find.text('Foto berhasil didownload'), findsOneWidget);
    // titik waktu (ms dari 2600): puncak muncul ke-1 ~442, hilang ~676, muncul ~858, hilang ~1092, menetap ~1500
    final contoh = <double>[];
    var lalu = 0;
    for (final ms in [442, 676, 858, 1092, 1500]) {
      await t.pump(Duration(milliseconds: ms - lalu));
      lalu = ms;
      contoh.add(opasitasCentang(t));
    }
    expect(contoh[0], greaterThan(0.9));
    expect(contoh[1], lessThan(0.1));
    expect(contoh[2], greaterThan(0.9));
    expect(contoh[3], lessThan(0.1));
    expect(contoh[4], 1.0);
    await t.pump(const Duration(milliseconds: 1200));
    await t.pump();
    expect(find.byKey(const ValueKey('popup-berhasil')), findsNothing);
    expect(selesai, isTrue);
  });

  testWidgets('v0.92.0: ketuk menutup lebih cepat; pop up baru menggantikan yang lama', (t) async {
    final ctx = await pasang(t);
    unawaited(tampilPopupBerhasil(ctx, judul: 'Satu'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 300));
    unawaited(tampilPopupBerhasil(ctx, judul: 'Dua'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 300));
    expect(find.text('Satu'), findsNothing);
    expect(find.text('Dua'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('popup-berhasil')));
    await t.pump();
    await t.pump(const Duration(milliseconds: 300));
    expect(find.byKey(const ValueKey('popup-berhasil')), findsNothing);
  });

  testWidgets('v0.92.0: kurangi animasi = centang langsung tampil tanpa kedip', (t) async {
    final ctx = await pasang(t, tenang: true);
    unawaited(tampilPopupBerhasil(ctx, judul: 'Foto berhasil didownload'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 676));
    expect(opasitasCentang(t), 1.0);
    await t.pump(const Duration(seconds: 3));
  });
}
