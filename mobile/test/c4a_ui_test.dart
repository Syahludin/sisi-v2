import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/c4a/c4a_arsip_tab.dart';
import 'package:sisi_row/features/c4a/c4a_laporan_tab.dart';
import 'package:sisi_row/features/c4a/c4a_model.dart';
import 'package:sisi_row/features/hartek/hartek_store.dart';
import 'package:sisi_row/features/insjar/insjar_form.dart';
import 'package:sisi_row/features/insjar/temuan_admin_antre.dart';
import 'package:sisi_row/widgets/refresh_sisi.dart';

class _Gudang implements GudangHartek {
  final master = <String, String>{};
  @override
  Future<({String json, DateTime diambil})?> bacaMaster(String kunci) async =>
      master[kunci] == null ? null : (json: master[kunci]!, diambil: DateTime(2026));
  @override
  Future<void> tulisMaster(String kunci, String json) async => master[kunci] = json;
  @override
  dynamic noSuchMethod(Invocation i) => throw UnimplementedError('${i.memberName}');
}

final _sesi = Sesi(
  token: 't',
  profil: const {'userId': 'u1', 'username': 'admin', 'role': 'ADMIN'},
  menu: const [
    {'kode': 'OPS_INPUT_TEMUAN', 'aksi': 'UBAH'}
  ],
  offlineSampai: DateTime(2030),
);

final _master = MasterInsJar({
  'penyulang': [
    {'nama': 'PNY-A', 'section': ['ACR Palas - LBS Delas', 'LBS Delas - Ujung']}
  ],
  'jenisTemuan': [
    {'nama': 'Isolator retak', 'jenisTemuanId': 'jt-1', 'uiwKategori': 'Komponen'},
    {'nama': 'Pohon dekat', 'jenisTemuanId': 'jt-2', 'uiwKategori': 'Pohon'},
  ],
});

void main() {
  late _Gudang gudang;
  late AntreanTemuanAdmin antre;
  late List<LaporanC4A> tambahTemuan, dilihat;
  late int refresh;
  final kategoriDilihat = <String>[];

  // antrean dibuat DI DALAM zona testWidgets (FakeAsync): future yang dibuat di setUp (zona nyata) tidak ikut dipompa
  void siapkan() {
    gudang = _Gudang();
    antre = AntreanTemuanAdmin(gudang, (s, aksi, data) async => throw Exception('offline'));
    tambahTemuan = [];
    dilihat = [];
    refresh = 0;
  }

  Widget tab({List<Map<String, dynamic>> temuan = const []}) => MaterialApp(
        home: Scaffold(
          body: LaporanC4ATab(
            sesi: _sesi,
            antre: antre,
            master: _master,
            hariIni: '2026-11-15',
            temuanHariIni: temuan,
            ambilGps: () async => (lat: -3.01, lng: 106.5),
            onTambahTemuan: (l) async => tambahTemuan.add(l),
            onLihatLaporan: dilihat.add,
            onLihatKategori: kategoriDilihat.add,
            onRefresh: () async => refresh++,
          ),
        ),
      );

  testWidgets('tanpa laporan aktif: Buat Laporan C4A ada, + Tambah Temuan tidak ada', (t) async {
    siapkan();
    await t.pumpWidget(tab());
    await t.pumpAndSettle();
    expect(find.text('Buat Laporan C4A'), findsOneWidget);
    expect(find.text('Tambah Temuan'), findsNothing);
  });

  testWidgets('buat laporan (penyulang, section, titik awal GPS) lalu + Tambah Temuan muncul dan memakai laporan itu', (t) async {
    siapkan();
    await t.pumpWidget(tab());
    await t.pumpAndSettle();
    await t.tap(find.text('Buat Laporan C4A'));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('c4a-penyulang')));
    await t.pumpAndSettle();
    await t.tap(find.text('PNY-A').last);
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('c4a-section')));
    await t.pumpAndSettle();
    await t.tap(find.text('ACR Palas - LBS Delas').last);
    await t.pumpAndSettle();
    await t.tap(find.text('Ambil GPS'));
    await t.pumpAndSettle();
    expect(find.text('-3.01, 106.5'), findsOneWidget);
    await t.tap(find.text('Simpan Laporan'));
    await t.pumpAndSettle();
    expect(find.text('Tambah Temuan'), findsOneWidget);
    expect(find.text('Ambil Titik Akhir'), findsOneWidget);
    expect(find.textContaining('Titik awal'), findsNothing, reason: 'chip titik awal dihapus');
    final aktif = await antre.laporanAktif('u1', '2026-11-15');
    expect([aktif!.penyulang, aktif.section, aktif.sumberAwal], ['PNY-A', 'ACR Palas - LBS Delas', 'GPS']);
    await t.tap(find.text('Tambah Temuan'));
    await t.pumpAndSettle();
    expect(tambahTemuan.single.c4aId, aktif.c4aId);
  });

  testWidgets('ambil titik akhir: konfirmasi lalu laporan tidak aktif lagi', (t) async {
    siapkan();
    await antre.bukaLaporan(_sesi,
        LaporanC4A(c4aId: 'aaaa0001', tanggal: '2026-11-15', penyulang: 'PNY-A', section: 'ACR Palas - LBS Delas', latAwal: -3.01, lngAwal: 106.5, sumberAwal: 'GPS'));
    await t.pumpWidget(tab());
    await t.pumpAndSettle();
    await t.tap(find.text('Ambil Titik Akhir'));
    await t.pumpAndSettle();
    await t.tap(find.text('Ambil GPS'));
    await t.pumpAndSettle();
    await t.tap(find.text('Tutup Laporan'));
    await t.pumpAndSettle();
    expect(await antre.laporanAktif('u1', '2026-11-15'), isNull);
    expect(find.text('Buat Laporan C4A'), findsOneWidget);
    // riwayat hari ini: laporan yang ditutup tetap bisa dilihat
    expect(find.text('Laporan selesai hari ini'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('c4a-riwayat-aaaa0001')));
    await t.pumpAndSettle();
    expect(dilihat.single.c4aId, 'aaaa0001');
  });

  testWidgets('tarik untuk refresh memanggil onRefresh', (t) async {
    siapkan();
    await t.pumpWidget(tab());
    await t.pumpAndSettle();
    await t.widget<RefreshSisi>(find.byType(RefreshSisi)).onRefresh();
    expect(refresh, 1);
  });

  testWidgets('ringkasan: 2 Komponen, 1 Pohon dari temuan C4A hari ini', (t) async {
    siapkan();
    await t.pumpWidget(tab(temuan: [
      {'jenisTemuanId': 'jt-1', 'c4aId': 'a'},
      {'jenisTemuanId': 'jt-1', 'c4aId': 'a'},
      {'jenisTemuanId': 'jt-2', 'c4aId': 'a'},
    ]));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('ringkas-Komponen-2')), findsOneWidget);
    expect(find.byKey(const ValueKey('ringkas-Peralatan-0')), findsOneWidget);
    expect(find.byKey(const ValueKey('ringkas-Pohon-1')), findsOneWidget);
  });

  testWidgets('ketuk angka ringkasan = onLihatKategori(kategori); ketuk kartu laporan aktif = onLihatLaporan(laporan itu)', (t) async {
    siapkan();
    kategoriDilihat.clear();
    await t.pumpWidget(tab(temuan: [
      {'jenisTemuanId': 'jt-1', 'c4aId': 'a'},
    ]));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('ringkas-Komponen-1')));
    await t.tap(find.byKey(const ValueKey('ringkas-Pohon-0')));
    expect(kategoriDilihat, ['Komponen', 'Pohon']);
    await antre.bukaLaporan(_sesi, LaporanC4A(c4aId: 'aaaa0001', tanggal: '2026-11-15', penyulang: 'PNY-A', section: 'S1', latAwal: -3.0, lngAwal: 106.5, sumberAwal: 'GPS'));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('c4a-aktif-detail')));
    expect(dilihat.map((l) => l.c4aId), ['aaaa0001']);
  });

  testWidgets('arsip: kartu per hari, ketuk = rincian temuan hari itu', (t) async {
    siapkan();
    final dimuat = <String>[];
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ArsipC4ATab(
          hariIni: '2026-11-15',
          muatArsip: (dari, sampai) async => {
            'hari': [
              {'tanggal': '2026-11-14', 'jumlahLaporan': 2, 'penyulang': 1, 'section': 2, 'Komponen': 3, 'Peralatan': 0, 'Pohon': 1, 'Lainnya': 0}
            ]
          },
          muatRincian: (tanggal) async {
            dimuat.add(tanggal);
            return [
              {'jenisTemuan': 'Isolator retak', 'c4aId': 'a', 'penyulang': 'PNY-A', 'section': 'ACR Palas', 'kodeTemuan': 'PEG-1'},
              {'jenisTemuan': 'Lama', 'c4aId': '', 'kodeTemuan': 'PEG-2'},
            ];
          },
          kartuTemuan: (m) => Text('kartu ${m['jenisTemuan']}'),
        ),
      ),
    ));
    await t.pumpAndSettle();
    expect(find.text('Sabtu, 14 November 2026'), findsOneWidget, reason: 'kartu hari (tombol rentang memakai teks lain)');
    expect(find.text('2 laporan · 1 penyulang · 2 section'), findsOneWidget);
    await t.tap(find.text('Sabtu, 14 November 2026'));
    await t.pumpAndSettle();
    expect(dimuat, ['2026-11-14']);
    expect(find.text('kartu Isolator retak'), findsOneWidget);
    expect(find.text('kartu Lama'), findsNothing, reason: 'hanya temuan C4A');
  });
}
