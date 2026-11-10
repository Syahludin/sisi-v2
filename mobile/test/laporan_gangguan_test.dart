import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/gangguan/laporan_gangguan_bantu.dart';
import 'package:sisi_row/features/gangguan/laporan_gangguan_screen.dart';
import 'package:sisi_row/features/operasi/katalog_operasi.dart';

/// Teks persis dari tes backend `v1.0.59 Laporan Gangguan Penyulang` (teksLaporanGangguan_); web menguji pengurai yang sama
/// langsung terhadap fungsi server (web/test/laporanGangguan.test.js).
final _teksServer = [
  'Yth. Bapak MUP3 Bangka',
  'Asman Teknik Jar & Konst UP3 Bangka',
  '',
  'Izin menyampaikan laporan gangguan ULP Toboali hari Selasa, 3 November 2026, sebagai berikut :',
  '',
  '📍 GANGGUAN PENYULANG',
  '▪️ PMT Trip : 1 kali',
  '- Penyulang : Bikang',
  'Penyebab : Pohon',
  '',
  '▪️ AR Sukses : 1 kali',
  '- Penyulang : Tungkal',
  'Penyebab : -',
  '',
  '▪️ AR Lockout : NIHIL',
  '',
  '📊 REKAP GANGGUAN TERTINGGI BULAN NOVEMBER 2026',
  '▪️ Gangguan Tertinggi (PMT/ACR/GH) :',
  '- Penyulang Bikang (PMT 1 kali & Section 3 kali)',
  '- Penyulang Kejaksaan (PMT 2 kali & Section 2 kali)',
  '',
  '▪️ PMT Trip : 3 kali',
  '- Kejaksaan (2 kali)',
  '- Bikang (1 kali)',
  '',
  '▪️ AR Sukses : 3 kali',
  '- Tungkal (2 kali)',
  '- Tanjung Labu (1 kali)',
  '',
  '▪️ AR Lockout : 5 kali',
  '- Bikang (3 kali)',
  '- Kejaksaan (2 kali)',
  '',
  'Demikian kami sampaikan, Terimakasih.',
].join('\n');

Map<String, dynamic> _data({bool gagal = false, String? teks}) => {
      'tanggal': '2026-11-03',
      'hari': 'Selasa, 3 November 2026',
      'teks': teks ?? _teksServer,
      'jumlah': {'pmt': 7, 'sukses': 8, 'lockout': 9},
      'disusunPada': '2026-11-04T01:12:00.000Z',
      'dariSimpanan': false,
      'sinkron': {'waktu': '2026-11-04T00:30:00.000Z'},
      'sinkronGagal': gagal,
    };

void main() {
  Future<List<bool>> pasang(WidgetTester t, Map<String, dynamic> Function() data) async {
    final panggilan = <bool>[];
    t.view.physicalSize = const Size(800, 2400);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: LaporanGangguanPanel(muat: (segar) async {
          panggilan.add(segar);
          return data();
        }),
      ),
    ));
    await t.pumpAndSettle();
    return panggilan;
  }

  test('urai teks server: hari laporan, tertinggi, rekap; penyebab "-" = kosong', () {
    final u = uraiLaporanGangguan(_teksServer)!;
    expect(u.bulan, 'NOVEMBER 2026');
    expect(u.bulanTampil, 'November 2026');
    expect([for (final k in u.harian) '${k.kategori.kode}:${k.jumlah}'], ['pmt:1', 'sukses:1', 'lockout:0']);
    expect([u.harian[0].kejadian.single.penyulang, u.harian[0].kejadian.single.penyebab], ['Bikang', 'Pohon']);
    expect(u.harian[1].kejadian.single.penyebab, '');
    expect(u.harian[2].kejadian, isEmpty);
    expect([for (final x in u.tertinggi) '${x.nama} ${x.pmt}/${x.section}'], ['Bikang 1/3', 'Kejaksaan 2/2']);
    expect([for (final k in u.rekap) k.total], [3, 3, 5]);
    expect([for (final x in u.rekap[2].daftar) '${x.nama}=${x.jumlah}'], ['Bikang=3', 'Kejaksaan=2']);
  });

  test('teks bukan format laporan = null', () {
    expect(uraiLaporanGangguan(null), isNull);
    expect(uraiLaporanGangguan(''), isNull);
    expect(uraiLaporanGangguan('Yth. Bapak MUP3 Bangka\n▪️ PMT Trip : NIHIL'), isNull);
    expect(uraiLaporanGangguan(_teksServer.replaceFirst('▪️ AR Sukses : 1 kali', '▪️ AR Sukses : banyak')), isNull);
  });

  testWidgets('hero: tanggal H-1 + tiga angka server; tab Hari laporan / Rekap bulan / Teks WA; Perbarui = muat(segar: true)', (t) async {
    final panggilan = await pasang(t, _data);
    expect(panggilan, [false]);
    expect(find.text('H-1'), findsOneWidget);
    expect(find.text('Selasa, 3 November 2026'), findsOneWidget);
    expect(find.text('7'), findsOneWidget, reason: 'angka hero dari jumlah server');
    expect(find.text('8'), findsOneWidget);
    expect(find.text('9'), findsOneWidget);
    expect(find.text('Salin'), findsOneWidget);
    expect(find.text('Kirim WA'), findsOneWidget);
    // Hari laporan (awal): kejadian + NIHIL
    expect(find.text('Bikang'), findsOneWidget);
    expect(find.text('Pohon'), findsOneWidget);
    expect(find.text('Penyebab belum diisi'), findsOneWidget);
    expect(find.text('NIHIL'), findsOneWidget);
    expect(find.textContaining('Data gangguan belum terbaru'), findsNothing, reason: 'status hanya bila perlu');
    // Rekap bulan
    await t.tap(find.text('Rekap bulan'));
    await t.pumpAndSettle();
    expect(find.text('Gangguan tertinggi'), findsOneWidget);
    expect(find.text('November 2026'), findsOneWidget);
    expect(find.text('PMT 1 · Section 3'), findsOneWidget);
    expect(find.text('5 kali'), findsOneWidget);
    // Teks WA utuh
    await t.tap(find.text('Teks WA'));
    await t.pumpAndSettle();
    expect(find.textContaining('Yth. Bapak MUP3 Bangka'), findsOneWidget);
    await t.tap(find.text('Perbarui dari sumber'));
    await t.pumpAndSettle();
    expect(panggilan, [false, true]);
    expect(find.textContaining('Diperbarui dari sumber pukul 08.12'), findsOneWidget);
  });

  testWidgets('teks tidak bisa diurai = teks saja tanpa tab', (t) async {
    await pasang(t, () => _data(teks: 'Yth. Bapak MUP3 Bangka\n▪️ PMT Trip : NIHIL'));
    expect(find.text('Rekap bulan'), findsNothing);
    expect(find.textContaining('Yth. Bapak MUP3 Bangka'), findsOneWidget);
  });

  testWidgets('sinkron gagal = peringatan + Coba lagi; galat server = pesan, tanpa laporan', (t) async {
    final panggilan = await pasang(t, () => _data(gagal: true));
    expect(find.textContaining('belum terbaru dari sumber'), findsOneWidget);
    await t.tap(find.text('Coba lagi'));
    await t.pumpAndSettle();
    expect(panggilan, [false, true]);
    expect(find.textContaining('Diperbarui dari sumber'), findsNothing, reason: 'masih gagal sinkron = tidak ditulis diperbarui');
    await t.pumpWidget(const SizedBox());
    await t.pumpWidget(MaterialApp(home: Scaffold(body: LaporanGangguanPanel(muat: (_) async => throw Exception('putus')))));
    await t.pumpAndSettle();
    expect(find.text('Butuh sinyal untuk Laporan Gangguan Penyulang.'), findsOneWidget);
    expect(find.text('Salin'), findsNothing);
  });

  test('katalog HP: OPS_LAP_GANGGUAN siap di grup Monitoring', () {
    final m = KatalogOperasi.semua.firstWhere((x) => x.kode == 'OPS_LAP_GANGGUAN');
    expect([m.siap, m.grup], [true, 'Monitoring']);
  });
}
