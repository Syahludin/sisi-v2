import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/features/gudang/gudang_model.dart';
import 'package:sisi_row/features/gudang/stok_yandal_view.dart';

Map<String, dynamic> _json({String? status, List<Map<String, dynamic>> selisih = const [], bool boleh = false, List<Map<String, dynamic>> saldo = const []}) => {
      'shift': {'tanggal': '2026-11-03', 'no': 1},
      'pemeriksaan': status == null ? null : {'pemeriksaanId': 'p1', 'status': status, 'selisih': selisih},
      'saldo': saldo,
      'bolehPakai': boleh,
    };

Map<String, dynamic> _sel(String id, String arah, int perkiraan, int input, {String status = 'MENUNGGU'}) => {
      'selisihId': id,
      'daya': '2A',
      'merk': 'Schneider',
      'statusMcb': 'Baru',
      'jumlahPerkiraan': perkiraan,
      'jumlahInput': input,
      'selisih': input - perkiraan,
      'arah': arah,
      'status': status,
      'caraPenyelesaian': '',
    };

const _saldo = [
  {'materialId': 'm', 'daya': '2A', 'merk': 'Schneider', 'statusMcb': 'Baru', 'jumlah': 2}
];

void main() {
  late List<List<EntriMcb>> dikirim;
  late List<String> fotoDikirim;
  late List<PemakaianBaru> dipakai;
  late List<List<String>> susulan;
  late Map<String, dynamic> Function() data;
  late Object? galatPeriksa;

  Future<void> pasang(WidgetTester t, {String? foto = '/tmp/foto.jpg'}) async {
    dikirim = [];
    fotoDikirim = [];
    dipakai = [];
    susulan = [];
    galatPeriksa = null;
    t.view.physicalSize = const Size(800, 2000);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    var n = 0;
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: StokYandalPanel(
          muat: () async {
            return StokYandal.dariJson(data());
          },
          periksa: (entri, path) async {
            if (galatPeriksa != null) throw galatPeriksa!;
            dikirim.add(entri);
            fotoDikirim.add(path);
            return const HasilPemeriksaan(pemeriksaanId: 'p1', status: 'COCOK', selisih: []);
          },
          pakai: (p) async {
            dipakai.add(p);
            return 'Y13-SHF1-MCB.001';
          },
          susulan: (selisihId, pemakaianId, meter, perlu) async {
            susulan.add([selisihId, meter, perlu]);
            return 'Y13-SHF3-MCB.001';
          },
          ambilFoto: (label) async => foto,
          idBaru: () => 'id-${n++}',
        ),
      ),
    ));
    await t.pumpAndSettle();
  }

  Future<void> tambahMcb(WidgetTester t, String daya, String merk) async {
    await t.tap(find.byKey(const Key('tambah-mcb')));
    await t.pumpAndSettle();
    await t.enterText(find.descendant(of: find.byKey(const Key('in-daya')), matching: find.byType(TextField)), daya);
    await t.enterText(find.byKey(const Key('in-merk')), merk);
    await t.tap(find.byKey(const Key('simpan-entri')));
    await t.pumpAndSettle();
  }

  testWidgets('belum diperiksa: MCB dimasukkan satu per satu, Kirim mati sampai ada foto, lalu terkirim', (t) async {
    data = () => _json();
    await pasang(t);
    expect(find.text('Pemeriksaan awal shift'), findsOneWidget);
    expect(find.textContaining('Shift 1'), findsOneWidget);
    await tambahMcb(t, '2', 'Schneider');
    await tambahMcb(t, '2', 'Schneider');
    await tambahMcb(t, '4', 'Hager');
    expect(find.byKey(const Key('jumlah-2|Schneider|Baru')), findsOneWidget);
    expect(t.widget<Text>(find.byKey(const Key('jumlah-2|Schneider|Baru'))).data, '2');
    expect(t.widget<Text>(find.byKey(const Key('jumlah-4|Hager|Baru'))).data, '1');
    expect(t.widget<FilledButton>(find.byKey(const Key('kirim-pemeriksaan'))).onPressed, isNull, reason: 'foto stok belum ada');

    await t.tap(find.byKey(const Key('ambil-foto-stok')));
    await t.pumpAndSettle();
    expect(t.widget<FilledButton>(find.byKey(const Key('kirim-pemeriksaan'))).onPressed, isNotNull);
    data = () => _json(status: 'COCOK', boleh: true, saldo: _saldo);
    await t.tap(find.byKey(const Key('kirim-pemeriksaan')));
    await t.pumpAndSettle(const Duration(seconds: 3));
    expect(dikirim.single.map((e) => e.kunci), ['2|Schneider|Baru', '2|Schneider|Baru', '4|Hager|Baru']);
    expect(fotoDikirim.single, '/tmp/foto.jpg');
    expect(find.textContaining('Stok cocok'), findsOneWidget);
    expect(find.byKey(const Key('catat-pemakaian')), findsOneWidget);
  });

  testWidgets('kolom daya hanya angka; status MCB berupa tombol segmen (bukan dropdown); tombol Tambah MCB tegas', (t) async {
    data = () => _json();
    await pasang(t);
    expect(t.widget<FilledButton>(find.byKey(const Key('tambah-mcb'))).onPressed, isNotNull, reason: 'tombol terisi (FilledButton), bukan outline transparan');
    await t.tap(find.byKey(const Key('tambah-mcb')));
    await t.pumpAndSettle();
    await t.enterText(find.descendant(of: find.byKey(const Key('in-daya')), matching: find.byType(TextField)), '2A5x');
    final isi = t.widget<TextField>(find.descendant(of: find.byKey(const Key('in-daya')), matching: find.byType(TextField))).controller!.text;
    expect(isi, '25', reason: 'huruf dibuang');
    expect(find.text('Daya (A)'), findsOneWidget);
    expect(find.byType(SegmentedButton<String>), findsOneWidget);
    expect(find.byType(DropdownButtonFormField<String>), findsNothing);
    await t.tap(find.text('Ex-Handal'));
    await t.pumpAndSettle();
  });

  testWidgets('petunjuk kolom Daya ada DI DALAM kolom (bukan teks bantuan di bawahnya)', (t) async {
    data = () => _json();
    await pasang(t);
    await t.tap(find.byKey(const Key('tambah-mcb')));
    await t.pumpAndSettle();
    final daya = t.widget<TextField>(find.descendant(of: find.byKey(const Key('in-daya')), matching: find.byType(TextField)));
    expect(daya.decoration!.hintText, 'Angka saja, mis. 2');
    expect(daya.decoration!.helperText, isNull);
    expect(find.text('Angka saja, mis. 2'), findsOneWidget, reason: 'petunjuk terlihat sebelum kolom disentuh');
  });

  testWidgets('merk dipilih dari master (bottom sheet), tidak diketik; master kosong = ketik bebas seperti dulu', (t) async {
    data = () => {..._json(), 'merkMcb': ['Hager', 'Schneider']};
    await pasang(t);
    await t.tap(find.byKey(const Key('tambah-mcb')));
    await t.pumpAndSettle();
    expect(find.descendant(of: find.byKey(const Key('in-merk')), matching: find.byType(TextField)), findsNothing, reason: 'bukan kolom ketik');
    await t.enterText(find.descendant(of: find.byKey(const Key('in-daya')), matching: find.byType(TextField)), '4');
    await t.tap(find.byKey(const Key('simpan-entri')));
    await t.pumpAndSettle();
    expect(find.text('Isi daya (angka) dan merk MCB.'), findsOneWidget, reason: 'merk belum dipilih');
    await t.tap(find.byKey(const Key('in-merk')));
    await t.pumpAndSettle();
    await t.tap(find.text('Hager').last);
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('simpan-entri')));
    await t.pumpAndSettle();
    expect(find.byKey(const Key('jumlah-4|Hager|Baru')), findsOneWidget);
  });

  testWidgets('tombol kurangi menghapus satu entri; validasi daya dan merk wajib', (t) async {
    data = () => _json();
    await pasang(t);
    await tambahMcb(t, '2', 'Schneider');
    await tambahMcb(t, '2', 'Schneider');
    await t.tap(find.byKey(const Key('kurang-2|Schneider|Baru')));
    await t.pumpAndSettle();
    expect(t.widget<Text>(find.byKey(const Key('jumlah-2|Schneider|Baru'))).data, '1');
    await t.tap(find.byKey(const Key('tambah-mcb')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('simpan-entri')));
    await t.pumpAndSettle();
    expect(find.text('Isi daya (angka) dan merk MCB.'), findsOneWidget);
  });

  testWidgets('menunggu admin: selisih tampil, KURANG punya tombol susulan, pemakaian belum ada', (t) async {
    data = () => _json(status: 'MENUNGGU_ADMIN', selisih: [_sel('s1', 'KURANG', 2, 1), _sel('s2', 'LEBIH', 0, 1)]);
    await pasang(t);
    expect(find.textContaining('menunggu persetujuan admin'), findsWidgets);
    expect(find.text('Kurang 1: 2A Schneider Baru (perkiraan 2, dihitung 1)'), findsOneWidget);
    expect(find.text('Lebih 1: 2A Schneider Baru (perkiraan 0, dihitung 1)'), findsOneWidget);
    expect(find.byKey(const Key('susulan-s1')), findsOneWidget);
    expect(find.byKey(const Key('susulan-s2')), findsNothing);
    expect(find.byKey(const Key('catat-pemakaian')), findsNothing);

    await t.tap(find.byKey(const Key('susulan-s1')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('simpan-susulan')));
    await t.pumpAndSettle();
    expect(find.text('Isi nomor meter dan keperluan.'), findsOneWidget, reason: 'wajib diisi');
    await t.enterText(find.byKey(const Key('in-meter')), '14500000001');
    await t.enterText(find.byKey(const Key('in-keperluan')), 'Lupa dicatat shift lalu');
    data = () => _json(status: 'DISETUJUI', boleh: true, saldo: _saldo);
    await t.tap(find.byKey(const Key('simpan-susulan')));
    await t.pumpAndSettle(const Duration(seconds: 3));
    expect(susulan.single, ['s1', '14500000001', 'Lupa dicatat shift lalu']);
    expect(find.byKey(const Key('catat-pemakaian')), findsOneWidget, reason: 'setelah susulan menutup semua selisih petugas langsung lanjut');
  });

  testWidgets('catat pemakaian: pilih jenis dari stok, nomor meter + keperluan + foto wajib, lalu tersimpan', (t) async {
    data = () => _json(status: 'COCOK', boleh: true, saldo: _saldo);
    await pasang(t);
    await t.tap(find.byKey(const Key('catat-pemakaian')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('simpan-pemakaian')));
    await t.pumpAndSettle();
    expect(find.text('Isi nomor meter dan keperluan.'), findsOneWidget);
    await t.enterText(find.byKey(const Key('in-meter')), '14512345678');
    await t.enterText(find.byKey(const Key('in-keperluan')), 'Ganti MCB rusak');
    await t.tap(find.byKey(const Key('simpan-pemakaian')));
    await t.pumpAndSettle();
    expect(find.text('Ambil foto penggunaan dulu.'), findsOneWidget);
    await t.tap(find.byKey(const Key('ambil-foto-pakai')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('simpan-pemakaian')));
    await t.pumpAndSettle(const Duration(seconds: 3));
    final p = dipakai.single;
    expect([p.pemakaianId, p.daya, p.merk, p.statusMcb, p.nomorMeter, p.keperluan, p.fotoPath], ['id-0', '2A', 'Schneider', 'Baru', '14512345678', 'Ganti MCB rusak', '/tmp/foto.jpg']);
  });

  testWidgets('keperluan pemakaian dipilih dari master (bottom sheet), tidak diketik', (t) async {
    data = () => {..._json(status: 'COCOK', boleh: true, saldo: _saldo), 'keperluanMcb': ['Ganti MCB Rusak', 'Pasang Baru']};
    await pasang(t);
    await t.tap(find.byKey(const Key('catat-pemakaian')));
    await t.pumpAndSettle();
    expect(find.descendant(of: find.byKey(const Key('in-keperluan')), matching: find.byType(TextField)), findsNothing, reason: 'bukan kolom ketik');
    await t.enterText(find.byKey(const Key('in-meter')), '14512345678');
    await t.tap(find.byKey(const Key('simpan-pemakaian')));
    await t.pumpAndSettle();
    expect(find.text('Isi nomor meter dan keperluan.'), findsOneWidget, reason: 'keperluan belum dipilih');
    await t.tap(find.byKey(const Key('in-keperluan')));
    await t.pumpAndSettle();
    await t.tap(find.text('Pasang Baru').last);
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('ambil-foto-pakai')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('simpan-pemakaian')));
    await t.pumpAndSettle(const Duration(seconds: 3));
    expect(dipakai.single.keperluan, 'Pasang Baru');
  });

  testWidgets('dikembalikan admin: form pemeriksaan tampil lagi dengan pemberitahuan; galat server tampil sebagai pesan', (t) async {
    data = () => _json(status: 'DIKEMBALIKAN');
    await pasang(t);
    expect(find.textContaining('diminta menghitung ulang'), findsOneWidget);
    expect(find.byKey(const Key('tambah-mcb')), findsOneWidget);
    galatPeriksa = ApiException('FOTO_WAJIB');
    await tambahMcb(t, '2', 'Schneider');
    await t.tap(find.byKey(const Key('ambil-foto-stok')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('kirim-pemeriksaan')));
    await t.pumpAndSettle();
    expect(find.text('Foto wajib diambil.'), findsOneWidget);
    expect(dikirim, isEmpty);
  });
}
