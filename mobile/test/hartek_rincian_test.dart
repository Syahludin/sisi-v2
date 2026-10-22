import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/hartek/hartek_rincian.dart';

/// v0.93.1 (temuan review 14 Okt 2026): layar rincian Hartek diuji tanpa server.
void main() {
  // v0.94.1: ketukan yang tidak kena widget (mis. di luar layar) = tes gagal, bukan hanya warning
  setUp(() => WidgetController.hitTestWarningShouldBeFatal = true);
  tearDown(() => WidgetController.hitTestWarningShouldBeFatal = false);

  Map<String, dynamic> pk(String id, String nama, List<Map<String, dynamic>> material, {String jumlah = '', String satuan = ''}) =>
      {'pekerjaanId': id, 'pekerjaan': nama, 'jumlahPekerjaan': jumlah, 'satuanPekerjaan': satuan,
       'material': material, 'grounding': <dynamic>[], 'pemerataan': <dynamic>[]};
  Map<String, dynamic> mt(String nama, num jumlah, String satuan, [String milik = '']) =>
      {'material': nama, 'jumlah': jumlah, 'satuan': satuan, 'kepemilikan': milik};

  final objek = <Map<String, dynamic>>[
    {'pgId': 'pg1', 'jenisPekerjaan': 'Jaringan', 'penyulang': 'PNY-A', 'section': 'SEC-1', 'daerah': 'Toboali', 'jumlahGawang': 4,
     'pekerjaan': [{...pk('k1', 'Ganti Isolator', [mt('Isolator Tumpu', 3, 'buah', 'PLN')], jumlah: '3', satuan: 'buah'), 'labelGaspol': 'HARKOM · Isolator'}]},
    {'pgId': 'pg2', 'jenisPekerjaan': 'Gardu', 'noGardu': 'TB0001', 'daerah': 'Jl. Merdeka',
     'pekerjaan': [pk('k2', 'Ganti Arrester', [mt('Arrester', 3, 'buah'), mt('Kabel NYY', 12, 'm')]), pk('k3', 'Pemerataan Beban Gardu', [])]},
  ];

  Future<_Catat> pasang(WidgetTester t, List<Map<String, dynamic>> data, {bool boleh = true, double lebar = 400}) async {
    final c = _Catat();
    t.view.physicalSize = Size(lebar, 2400);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: StatefulBuilder(builder: (context, setState) {
          c.terbuka ??= jenisAwalTerbukaHartek(data);
          return ListView(padding: const EdgeInsets.all(20), children: [
            RincianHartek(
              objek: data,
              kodeHeader: 'HAR-16130261014001',
              terbuka: c.terbuka!,
              lokasiTertutup: c.lokasiTertutup,
              boleh: boleh,
              onBukaTutup: (j) => setState(() {
                if (!c.terbuka!.remove(j)) c.terbuka!.add(j);
              }),
              onBukaTutupLokasi: (id) => setState(() {
                if (!c.lokasiTertutup.remove(id)) c.lokasiTertutup.add(id);
              }),
              onBukaLokasi: (id) => c.lokasi.add(id),
              onBukaPekerjaan: (pg, k) => c.pekerjaan.add('$pg/$k'),
              onTambahLokasi: () => c.tambahLokasi++,
              onTambahPekerjaan: (pg) => c.tambahPekerjaan.add('${pg['pgId']}'),
              onTambahMaterial: (p) => c.tambahMaterial.add('${p['pekerjaanId']}'),
              onUbahPekerjaan: boleh ? (pg, p) => c.ubahPekerjaan.add('${pg['pgId']}/${p['pekerjaanId']}') : null,
            ),
          ]);
        }),
      ),
    ));
    return c;
  }

  test('rekap total material dijumlah per material + satuan, urut nama', () {
    final ob = [
      ...objek,
      {'pgId': 'pg3', 'jenisPekerjaan': 'Non - Teknik', 'noGardu': 'TB0002',
       'pekerjaan': [pk('k4', 'Bersih Gardu', [mt('Kabel NYY', 3, 'm'), mt('Kabel NYY', 1, 'roll')])]},
    ];
    expect(rekapMaterialHartek(ob), [('Arrester', '3 buah'), ('Isolator Tumpu', '3 buah'), ('Kabel NYY', '15 m'), ('Kabel NYY', '1 roll')]);
    expect(lokasiHartek(objek[0]), 'PNY-A · SEC-1');
    expect(lokasiHartek(objek[1]), 'Gardu TB0001');
    expect(jenisAwalTerbukaHartek(objek), isEmpty, reason: 'dua jenis = tertutup semua');
    expect(jenisAwalTerbukaHartek([objek[1]]), {'Gardu'}, reason: 'satu jenis = langsung terbuka');
  });

  testWidgets('jenis tertutup dulu; ketuk = muncul pekerjaan beserta materialnya; ketuk lagi = tutup', (t) async {
    await pasang(t, objek);
    expect(find.text('Jaringan'), findsWidgets);
    expect(find.text('1 lokasi · 2 pekerjaan · 2 material'), findsOneWidget, reason: 'ringkasan jenis Gardu');
    expect(find.text('Ganti Arrester'), findsNothing);
    await t.tap(find.byKey(const ValueKey('jenis-Gardu')));
    await t.pumpAndSettle();
    expect(find.text('Gardu TB0001'), findsOneWidget);
    expect(find.text('Ganti Arrester'), findsOneWidget);
    expect(find.text('Pemerataan Beban Gardu'), findsOneWidget);
    // material tampil DI DALAM kartu pekerjaannya
    final kartuArrester = find.byKey(const ValueKey('pekerjaan-k2'));
    expect(find.descendant(of: kartuArrester, matching: find.text('Kabel NYY')), findsOneWidget);
    expect(find.descendant(of: kartuArrester, matching: find.text('12 m')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const ValueKey('pekerjaan-k3')), matching: find.text('Belum ada material')), findsOneWidget);
    expect(find.text('Ganti Isolator'), findsNothing, reason: 'Jaringan tetap tertutup');
    await t.tap(find.byKey(const ValueKey('jenis-Gardu')));
    await t.pumpAndSettle();
    expect(find.text('Ganti Arrester'), findsNothing);
  });

  testWidgets('tombol + Material / + Pekerjaan / lokasi / pekerjaan memanggil aksi dengan data yang benar', (t) async {
    final c = await pasang(t, objek);
    await t.tap(find.byKey(const ValueKey('jenis-Gardu')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('tambah-material-k2')));
    await t.tap(find.byKey(const ValueKey('tambah-material-k3')));
    await t.tap(find.byKey(const ValueKey('tambah-pekerjaan-pg2')));
    await t.tap(find.text('Ganti Arrester'));
    await t.tap(find.text('Gardu TB0001'));
    await t.ensureVisible(find.byKey(const ValueKey('tambah-lokasi')));
    await t.tap(find.byKey(const ValueKey('tambah-lokasi')));
    expect(c.tambahMaterial, ['k2', 'k3']);
    expect(c.tambahPekerjaan, ['pg2']);
    expect(c.pekerjaan, ['pg2/k2']);
    expect(c.lokasi, ['pg2']);
    expect(c.tambahLokasi, 1);
  });

  testWidgets('tanpa hak ubah: tombol tambah disembunyikan / nonaktif, data tetap terbaca', (t) async {
    await pasang(t, [objek[1]], boleh: false);
    await t.pumpAndSettle();
    expect(find.text('Ganti Arrester'), findsOneWidget, reason: 'satu jenis langsung terbuka');
    expect(find.byKey(const ValueKey('tambah-material-k2')), findsNothing);
    expect(find.byKey(const ValueKey('tambah-pekerjaan-pg2')), findsNothing);
    expect(t.widget<FilledButton>(find.byKey(const ValueKey('tambah-lokasi'))).onPressed, isNull);
  });

  testWidgets('laporan kosong = petunjuk tambah lokasi; total material tidak tampil', (t) async {
    await pasang(t, const []);
    expect(find.text('Belum ada lokasi'), findsOneWidget);
    expect(find.text('Total material'), findsNothing);
  });

  testWidgets('layar sempit 320 px semua jenis terbuka tidak overflow', (t) async {
    final panjang = [
      {'pgId': 'pg9', 'jenisPekerjaan': 'Jaringan', 'penyulang': 'PENYULANG SANGAT PANJANG SEKALI', 'section': 'SECTION PANJANG 01',
       'daerah': 'Desa dengan nama yang panjang sekali di Toboali', 'jumlahGawang': 120,
       'pekerjaan': [pk('k9', 'Pemeliharaan jaringan dengan nama pekerjaan sangat panjang', [mt('Kabel twisted 3x70+1x50 mm2', 1250.5, 'meter', 'Pelanggan')], jumlah: '1250', satuan: 'meter')]},
      ...objek,
    ];
    await pasang(t, panjang, lebar: 320);
    for (final j in ['Jaringan', 'Gardu']) {
      // v0.94.1: Jaringan terbuka mendorong kartu Gardu ke bawah layar, gulir dulu supaya ketukan kena
      await t.ensureVisible(find.byKey(ValueKey('jenis-$j')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(ValueKey('jenis-$j')));
      await t.pumpAndSettle();
    }
    expect(t.takeException(), isNull);
    expect(find.text('Ganti Arrester', skipOffstage: false), findsOneWidget, reason: 'Gardu benar-benar terbuka');
    expect(find.textContaining('nama pekerjaan sangat panjang', skipOffstage: false), findsOneWidget, reason: 'Jaringan tetap terbuka');
  });

  testWidgets('v0.96.0: klasifikasi GASPOL tidak ditampilkan di kartu rincian, indikator cloud server tampil', (t) async {
    await pasang(t, objek);
    await t.tap(find.byKey(const ValueKey('jenis-Jaringan')));
    await t.pumpAndSettle();
    expect(find.descendant(of: find.byKey(const ValueKey('pekerjaan-k1')), matching: find.textContaining('GASPOL')), findsNothing);
    expect(find.byIcon(Icons.cloud_done_rounded), findsWidgets);
    expect(find.descendant(of: find.byKey(const ValueKey('pekerjaan-k1')), matching: find.text('PLN')), findsNothing,
        reason: 'v0.97.0: label kepemilikan tidak ditampilkan di rincian material');
    await t.tap(find.byKey(const ValueKey('lipat-lokasi-pg1')));
    await t.pumpAndSettle();
    expect(find.text('Ganti Isolator'), findsNothing, reason: 'v0.97.4: lokasi penyulang/gardu bisa di-minimize');
    await t.tap(find.byKey(const ValueKey('lipat-lokasi-pg1')));
    await t.pumpAndSettle();
    expect(find.text('Ganti Isolator'), findsOneWidget, reason: 'v0.97.4: lokasi penyulang/gardu bisa di-expand lagi');
  });

  test('v0.97.3: waTeksHartek menyusun teks pelaporan WA sesuai format baku ULP Toboali', () {
    final contoh = <Map<String, dynamic>>[
      {
        'pgId': 'g1',
        'jenisPekerjaan': 'Gardu',
        'noGardu': 'TL0001',
        'penyulang': 'Tanjung Labu',
        'section': 'LBS Sp. 3 Tj. Labu - DSC Jar Posko',
        'daerah': 'Tanjung labu',
        'pekerjaan': [
          pk('p1', 'Rekonektorisasi JTR', [], jumlah: '8', satuan: 'Titik'),
          pk('p2', 'Press CCO 70 - 70 mm²', [], jumlah: '8', satuan: 'buah'),
          {
            ...pk('p5', 'Pemerataan Beban Gardu', [], jumlah: '1', satuan: 'Set'),
            'pemerataan': [
              {'noGardu': 'TL0001', 'sebR': '120', 'sebS': '95', 'sebT': '140', 'sesR': '118', 'sesS': '116', 'sesT': '121'},
            ],
          },
        ],
      },
      {
        'pgId': 'j1',
        'jenisPekerjaan': 'Jaringan',
        'penyulang': 'Tanjung Labu',
        'section': 'FCO Tj. Labu - Tj. Labu',
        'daerah': 'Ds. Tj. Labu',
        'jumlahGawang': 4,
        'pekerjaan': [
          pk('p3', 'Pasang Protective Sleeve', [mt('Protective Sleeve', 54, 'buah', 'PLN')], jumlah: '54', satuan: 'buah'),
          pk('p4', 'Penggantian Bending Wire TM', [mt('Bending Wire', 54, 'buah', 'PLN')], jumlah: '54', satuan: 'buah'),
        ],
      },
    ];
    final teks = waTeksHartek(
      tanggal: '2026-09-28',
      header: const {
        'koordinatAwal': '-2.939450, 106.901075',
        'koordinatAkhir': '-2.939450, 106.901075',
      },
      objek: contoh,
    );
    expect(
      teks,
      '*Realisasi Pekerjaan Hartek ULP Toboali*\n'
      '\n'
      'Hari, Tanggal : Senin, 28 September 2026\n'
      'Koordinat Awal Pekerjaan : -2.939450, 106.901075\n'
      'Koordinat Akhir Pekerjaan : -2.939450, 106.901075\n'
      'Lokasi Pekerjaan : Tanjung labu, Ds. Tj. Labu\n'
      '\n'
      '*Pekerjaan Gardu :*\n'
      'I. Gardu : *TL0001*\n'
      'Penyulang : Tanjung Labu\n'
      'Section : LBS Sp. 3 Tj. Labu - DSC Jar Posko\n'
      'Pekerjaan :\n'
      '1. Rekonektorisasi JTR : 8 Titik\n'
      '2. Press CCO 70 - 70 mm² : 8 Buah\n'
      '3. Pemerataan Beban Gardu : 1 Set\n'
      'Beban Sebelum  Beban Sesudah\n'
      'R : 120A       R : 118A\n'
      'S : 95A        S : 116A\n'
      'T : 140A       T : 121A\n'
      '\n'
      '*Pekerjaan Jaringan :*\n'
      'I. Penyulang : *Tanjung Labu*\n'
      'Section : FCO Tj. Labu - Tj. Labu\n'
      'Pekerjaan :\n'
      '1. Pasang Protective Sleeve : 54 Buah\n'
      '- Material :\n'
      '> Protective Sleeve : 54 Buah (PLN)\n'
      '2. Penggantian Bending Wire TM : 54 Buah\n'
      '- Material :\n'
      '> Bending Wire : 54 Buah (PLN)\n'
      '\n'
      '*Pekerjaan Non-Teknik :*\n'
      'Nihil',
    );
  });
}

class _Catat {
  Set<String>? terbuka;
  final lokasiTertutup = <String>{};
  final lokasi = <String>[], pekerjaan = <String>[], tambahPekerjaan = <String>[], tambahMaterial = <String>[], ubahPekerjaan = <String>[];
  int tambahLokasi = 0;
}
