import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/core/cek_versi.dart';
import 'package:sisi_row/core/kunci_update.dart';
import 'package:sisi_row/core/versi.dart';

/// Versi server yang pasti lebih baru dari app ini, dan minimum yang sama dengan app (update tersedia, belum wajib).
InfoVersi _tersedia() => InfoVersi(server: '99.0.0', minimum: versiApp, linkUnduh: 'https://contoh.id/apk', catatan: 'Stok MCB|Perbaikan tampilan');
InfoVersi _wajib() => const InfoVersi(server: '99.0.0', minimum: '99.0.0');

void main() {
  tearDown(() {
    PemeriksaVersi.terakhir.value = null;
    PemeriksaVersi.aktif = null;
    PemeriksaVersi.tokenSesi = null;
    KunciUpdate.aktif.value = false;
  });

  Widget bungkus(Widget w) => MaterialApp(home: Scaffold(backgroundColor: Colors.black, body: Center(child: w)));

  testWidgets('banner halaman login: tidak ada update = tidak tampil; update tersedia / wajib = tampil dengan versi', (t) async {
    await t.pumpWidget(bungkus(const BannerUpdateLogin()));
    expect(find.byKey(const Key('banner-update-login')), findsNothing);

    PemeriksaVersi.terakhir.value = _tersedia();
    await t.pump();
    expect(find.text('Update tersedia'), findsOneWidget);
    expect(find.text('v$versiApp  >  v99.0.0'), findsOneWidget);

    PemeriksaVersi.terakhir.value = _wajib();
    await t.pump();
    expect(find.text('Wajib update aplikasi'), findsOneWidget);

    PemeriksaVersi.terakhir.value = InfoVersi(server: versiApp, minimum: versiApp);
    await t.pump();
    expect(find.byKey(const Key('banner-update-login')), findsNothing, reason: 'sudah terbaru');
  });

  testWidgets('kartu update sebelum login: Update Sekarang (unduh langsung dari app), bukan link browser', (t) async {
    PemeriksaVersi.aktif = PemeriksaVersi(ApiClient(), () => null);
    PemeriksaVersi.tokenSesi = () => null; // belum login
    await t.pumpWidget(MaterialApp(home: Scaffold(body: DialogUpdateVersi(info: _tersedia(), wajib: false, onCekLagi: () async {}))));
    expect(find.text('Update Sekarang'), findsOneWidget);
    expect(find.text('Download Update'), findsNothing);
    expect(find.text('Cek Lagi'), findsOneWidget);
    expect(find.text('Update Tersedia'), findsOneWidget);
    expect(find.textContaining('Stok MCB'), findsOneWidget);
  });

  testWidgets('kartu update tanpa pemeriksa terpasang jatuh ke link browser (perilaku lama)', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: DialogUpdateVersi(info: _tersedia(), wajib: false, onCekLagi: () async {}))));
    expect(find.text('Download Update'), findsOneWidget);
  });

  testWidgets('pita merah: di halaman login mengajak update sebelum masuk; sesudah login tetap menyebut input & sinkron dimatikan', (t) async {
    KunciUpdate.aktif.value = true;
    await t.pumpWidget(MaterialApp(home: PitaKunciUpdate(tampil: true, sudahMasuk: false, child: const Scaffold(body: Text('isi')))));
    expect(find.textContaining('Update sebelum masuk.'), findsOneWidget);
    expect(find.textContaining('Input & sinkron dimatikan'), findsNothing);

    await t.pumpWidget(MaterialApp(home: PitaKunciUpdate(tampil: true, child: const Scaffold(body: Text('isi')))));
    expect(find.textContaining('Input & sinkron dimatikan.'), findsOneWidget);

    KunciUpdate.aktif.value = false;
    await t.pump();
    expect(find.textContaining('Update'), findsNothing, reason: 'tanpa wajib update pita hilang');
  });
}
