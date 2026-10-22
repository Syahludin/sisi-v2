import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/jadwal_padam/jadwal_padam_bantu.dart';
import 'package:sisi_row/widgets/kalender_bulan.dart';

void main() {
  test('v1.0.17 jadwal padam: durasi lewat tengah malam, ENS, format angka & tanggal sama dengan server', () {
    expect(durasiJamJp('22:00', '01:30'), 3.5);
    expect(durasiJamJp('09:00', '12:00'), 3);
    expect(durasiTeksJp(3.5), '3 jam 30 menit');
    expect(durasiTeksJp(0.25), '15 menit');
    expect(ensJp(0.8, 3.5), 4046, reason: 'v1.0.18: 4045,16 dibulatkan ke atas');
    expect(rupiahJp(4045.16), 'Rp 4.046');
    expect(rupiahJp(1444.0000000002), 'Rp 1.444', reason: 'derau float tidak menaikkan rupiah');
    expect(rupiahJp(null), 'Rp 0');
    expect(angkaIdJp(1234567.891, 2), '1.234.567,89');
    expect(angkaIdJp(840), '840');
    expect(labelTanggalJp('2026-10-25'), '25 Oktober 2026');
    expect(jamTeksJp(jamDariTeksJp('7:05', const TimeOfDay(hour: 9, minute: 0))), '07:05');
  });

  testWidgets('v1.0.17 KalenderBulan: hari dengan kegiatan bertanda, ketuk hari = pilih, panah = ganti bulan', (t) async {
    DateTime? dipilih, bulanBaru;
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: KalenderBulan(
            bulan: DateTime(2026, 10, 1),
            tanda: const {'2026-10-25': [TandaHari(WarnaKalender.padam, 2, 'padam')]},
            dipilih: null,
            onPilih: (d) => dipilih = d,
            onGantiBulan: (b) => bulanBaru = b,
          ),
        ),
      ),
    ));
    expect(find.text('Oktober 2026'), findsOneWidget);
    expect(find.text('2'), findsWidgets);
    await t.tap(find.text('25'));
    expect(dipilih, DateTime(2026, 10, 25));
    await t.tap(find.byTooltip('Bulan berikutnya'));
    expect(bulanBaru, DateTime(2026, 11, 1));
    expect(find.bySemanticsLabel(RegExp(r'^25 Oktober 2026, 2 padam$')), findsOneWidget);
  });
}
