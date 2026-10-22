import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/yandal/sync_akhir_shift_screen.dart';

/// v0.63.4: akhir shift akun YANDAL = tidak bisa input, data tertunda dikirim dulu, baru logout.
void main() {
  Sesi sesi({String? syncSampai}) => Sesi.dariLogin({
        'token': 'd' * 64,
        'profil': {'userId': 'u', 'username': '16130.yandal13', 'role': 'PETUGAS', 'jenisTim': 'YANDAL'},
        'menu': <dynamic>[],
        'offlineSampai': '2026-10-08T08:59:00.000Z',
        'sesiSampai': '2026-10-08T08:59:00.000Z',
        if (syncSampai != null) 'syncSampai': syncSampai,
      });

  test('mode sync: antara akhir shift dan syncSampai saja; tersimpan utuh; cekSesi tidak memperpanjang', () {
    final s = sesi(syncSampai: '2026-10-09T08:59:00.000Z');
    expect(s.bolehSyncAkhir(DateTime.utc(2026, 10, 8, 8, 58)), isFalse, reason: 'shift belum selesai');
    expect(s.bolehSyncAkhir(DateTime.utc(2026, 10, 8, 8, 59)), isTrue);
    expect(s.bolehSyncAkhir(DateTime.utc(2026, 10, 9, 8, 59)), isFalse, reason: 'batas mode sync habis');
    expect(Sesi.dariJson(s.keJson()).syncSampai, s.syncSampai);
    final c = s.denganData({
      'profil': s.profil,
      'menu': <dynamic>[],
      'offlineSampai': '2026-10-08T08:59:00.000Z',
      'sesiSampai': '2026-10-08T08:59:00.000Z',
      'syncSampai': '2026-10-10T08:59:00.000Z',
    });
    expect(c.syncSampai, s.syncSampai, reason: 'tidak pernah diperpanjang');
    expect(sesi().bolehSyncAkhir(DateTime.utc(2026, 10, 8, 9)), isFalse, reason: 'sesi lama tanpa syncSampai = langsung keluar');
  });

  Future<void> pasang(WidgetTester t, {required List<int> hitungan, required DateTime batas, required List<bool> selesai, List<int>? kirim}) =>
      t.pumpWidget(MaterialApp(
        home: SyncAkhirShiftScreen(
          hitung: () async => hitungan.length > 1 ? hitungan.removeAt(0) : hitungan.first,
          kirim: () async => kirim?.add(1),
          onSelesai: (tertinggal) async => selesai.add(tertinggal),
          syncSampai: batas,
          pesan: () => 'Offline. Data aman di HP, dikirim otomatis saat ada sinyal.',
          ulangTiap: const Duration(hours: 1),
          sekarang: () => DateTime.utc(2026, 10, 8, 10),
        ),
      ));

  testWidgets('masih ada data: tetap di gerbang; semua terkirim = keluar sendiri (tertinggal false)', (t) async {
    final selesai = <bool>[];
    final kirim = <int>[];
    await pasang(t, hitungan: [2, 0], batas: DateTime.utc(2026, 10, 9, 8, 59), selesai: selesai, kirim: kirim);
    await t.pump();
    await t.pump();
    expect(find.text('2 data belum terkirim'), findsOneWidget);
    expect(find.textContaining('P0 baru tidak bisa dibuat'), findsOneWidget);
    expect(find.textContaining('Offline'), findsOneWidget);
    expect(selesai, isEmpty);
    await t.ensureVisible(find.text('Kirim sekarang')); // v0.66.4: layout baru lebih tinggi
    await t.pump();
    await t.tap(find.text('Kirim sekarang'));
    await t.pump();
    await t.pump();
    expect(kirim.length, 2);
    expect(selesai, [false]);
    await t.pumpWidget(const SizedBox());
  });

  testWidgets('batas mode sync habis: keluar tanpa mengirim (tertinggal true, data tetap di HP)', (t) async {
    final selesai = <bool>[];
    final kirim = <int>[];
    await pasang(t, hitungan: [3], batas: DateTime.utc(2026, 10, 8, 9, 30), selesai: selesai, kirim: kirim);
    await t.pump();
    await t.pump();
    expect(selesai, [true]);
    expect(kirim, isEmpty);
    await t.pumpWidget(const SizedBox());
  });
}
