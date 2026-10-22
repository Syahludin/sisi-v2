import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/row/ringkasan_row_screen.dart';
import 'package:sisi_row/widgets/kartu_laporan_tim.dart';
import 'package:sisi_row/widgets/wa_panel.dart';

void main() {
  test('v0.90.0: koordinat singkat, jarak tempuh, label jenis ROW', () {
    expect(koordinatSingkat('-3.012345, 106.512345'), '-3.0123, 106.5123');
    expect(koordinatSingkat(''), 'Belum diisi');
    expect(koordinatSingkat(null), 'Belum diisi');
    expect(koordinatSingkat('bukan'), 'bukan');
    expect(jarakKm(12480, 12512), 32);
    expect(jarakKm(12512, 12480), isNull);
    expect(jarakKm(null, 12480), isNull);
    expect(labelJenisRow('Rabas / Pangkas'), 'Rabas');
    expect(labelJenisRow('Tebang Sedang'), 'Tebang Sedang');
  });

  Future<List<String>> pasang(WidgetTester t, {double lebar = 390}) async {
    final ketuk = <String>[];
    t.view.physicalSize = Size(lebar, 800);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ListView(padding: const EdgeInsets.all(16), children: [
          KartuLaporanTim(
            judul: 'HAR-16130261014001',
            sub: 'Rabu, 14 Oktober 2026',
            ikon: Icons.engineering_outlined,
            kmAwal: 12480,
            kmAkhir: 12512,
            koordinatAwal: '-3.012345, 106.512345',
            koordinatAkhir: '',
            angka: [
              AngkaRingkas('Jaringan', 1, onTap: () => ketuk.add('jenis:Jaringan')),
              AngkaRingkas('Gardu', 2, onTap: () => ketuk.add('jenis:Gardu')),
              AngkaRingkas('Non-Teknik', 0, onTap: () => ketuk.add('jenis:Non-Teknik')),
              AngkaRingkas('Total Pekerjaan', 3, onTap: () => ketuk.add('total')),
            ],
            catatan: 'Belum diisi: koordinat akhir.',
            onTap: () => ketuk.add('kartu'),
            onUbah: () => ketuk.add('ubah'),
            tampilWa: true,
            onKirimWa: () => ketuk.add('wa'),
            onTambah: () => ketuk.add('tambah'),
            onTapNilai: (k) => ketuk.add('nilai:$k'),
          ),
        ]),
      ),
    ));
    return ketuk;
  }

  testWidgets('kartu laporan tim: pensil, tombol +, dan ketuk kartu terpisah', (t) async {
    final ketuk = await pasang(t);
    expect(find.text('32 km'), findsOneWidget);
    expect(find.text('-3.0123, 106.5123'), findsOneWidget);
    expect(find.text('Belum diisi'), findsOneWidget);
    await t.tap(find.byTooltip('Ubah laporan'));
    await t.tap(find.byKey(const ValueKey('tombol-wa-kartu')));
    await t.tap(find.byIcon(Icons.add_rounded));
    await t.tap(find.text('Gardu'));
    await t.tap(find.text('Total Pekerjaan'));
    await t.tap(find.byKey(const ValueKey('nilai-kmAwal')));
    await t.tap(find.text('HAR-16130261014001'));
    expect(ketuk, ['ubah', 'wa', 'tambah', 'jenis:Gardu', 'total', 'nilai:kmAwal', 'kartu']);
  });

  testWidgets('kartu laporan tim tidak overflow di layar 320', (t) async {
    await pasang(t, lebar: 320);
    expect(t.takeException(), isNull);
  });

  testWidgets('v0.97.5: tanpa onTap kartu, ketuk judul tidak melakukan apa-apa dan ketuk WA belum siap membuka kartu pemberitahuan', (t) async {
    final ketuk = <String>[];
    await t.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: ListView(padding: const EdgeInsets.all(16), children: [
            KartuLaporanTim(
              judul: 'HAR-16130261015001',
              sub: 'Kamis, 15 Oktober 2026',
              ikon: Icons.engineering_outlined,
              kmAwal: 12480,
              kmAkhir: null,
              koordinatAwal: '-3.012345, 106.512345',
              koordinatAkhir: '',
              angka: [
                AngkaRingkas('Jaringan', 1, onTap: () => ketuk.add('jenis:Jaringan')),
                AngkaRingkas('Total Pekerjaan', 1, onTap: () => ketuk.add('total')),
              ],
              tampilWa: true,
              waSiap: false,
              onKirimWa: () => tampilkanWaBelumSiap(
                context,
                kurang: const ['KM akhir', 'Koordinat akhir'],
                onLengkapi: () => ketuk.add('lengkapi'),
              ),
            ),
          ]),
        ),
      ),
    ));
    await t.tap(find.text('HAR-16130261015001'));
    await t.pumpAndSettle();
    expect(ketuk, isEmpty, reason: 'ketuk sembarang di dalam kartu tidak membuka rincian');
    await t.tap(find.byKey(const ValueKey('tombol-wa-kartu')));
    await t.pumpAndSettle();
    expect(find.text('Laporan WA belum siap dikirim'), findsOneWidget);
    expect(find.text('KM akhir'), findsNWidgets(2), reason: 'label kartu + daftar di kartu pemberitahuan WA');
    expect(find.text('Koordinat akhir'), findsOneWidget);
    await t.tap(find.text('Lengkapi data'));
    await t.pumpAndSettle();
    expect(ketuk, ['lengkapi']);
  });
}
