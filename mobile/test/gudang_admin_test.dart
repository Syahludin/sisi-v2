import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/gudang/gudang_admin_screen.dart';
import 'package:sisi_row/features/gudang/gudang_model.dart';
import 'package:sisi_row/features/gudang/gudang_repository.dart';

Sesi _sesi(String aksi, {String role = 'ADMIN'}) => Sesi(
      token: 't',
      profil: {'userId': 'u1', 'username': 'admin', 'role': role},
      menu: [
        {'kode': 'OPS_GUDANG_MATERIAL', 'aksi': aksi}
      ],
      offlineSampai: DateTime(2030),
    );

const _jenis = {'materialId': 'm1', 'daya': '2A', 'merk': 'Schneider', 'statusMcb': 'Baru'};

class _RepoPalsu extends GudangRepository {
  _RepoPalsu() : super(ApiClient());
  final panggilan = <String>[];
  final dikirim = <Map<String, dynamic>>[];
  var selisihData = <SelisihStok>[];
  var pemakaianData = <Map<String, dynamic>>[];

  @override
  Future<StokGudang> stokGudang(Sesi s) async => StokGudang.dariJson({
        'gudang': [
          {..._jenis, 'jumlah': 6}
        ],
        'tim': [
          {
            'timId': 't13',
            'nama': 'Yandal 13',
            'stok': [
              {..._jenis, 'jumlah': 4}
            ],
            'tanpaIzin': [
              {..._jenis, 'daya': '6A', 'jumlah': 1}
            ],
          }
        ],
        'mutasi': <Map<String, dynamic>>[],
      });

  @override
  Future<Map<String, dynamic>> izin(Sesi s) async => {
        'material': [
          {'materialId': 'm1', 'nama': 'MCB', 'satuan': 'unit'}
        ],
        'tim': [
          {'timId': 't13', 'nama': 'Yandal 13', 'jenis': 'YANDAL'},
          {'timId': 'th', 'nama': 'Hartek 1', 'jenis': 'HARTEK'},
        ],
        'izin': [
          {'materialId': 'm1', 'timId': 't13', 'aktif': true}
        ],
      };

  @override
  Future<Map<String, dynamic>> ubahStok(Sesi s, String aksi, Map<String, dynamic> isi) async {
    panggilan.add(aksi);
    dikirim.add(isi);
    return {'duplikat': false};
  }

  @override
  Future<List<SelisihStok>> selisih(Sesi s, {String? status}) async => selisihData;

  @override
  Future<Map<String, dynamic>> selisihLengkap(Sesi s, {String? status}) async => {'selisih': <dynamic>[], 'susulan': <dynamic>[], 'dikoreksi': <dynamic>[]};

  @override
  Future<Map<String, dynamic>> selesaikanSelisih(Sesi s, Map<String, dynamic> isi) async {
    panggilan.add('selesaikanSelisih');
    dikirim.add(isi);
    return {'pemeriksaanStatus': 'DISETUJUI'};
  }

  @override
  Future<List<Map<String, dynamic>>> pemakaian(Sesi s, {required String dari, required String sampai}) async => pemakaianData;

  @override
  Future<Map<String, dynamic>> batalkanPemakaian(Sesi s, Map<String, dynamic> isi) async {
    panggilan.add('batalkanPemakaian');
    dikirim.add(isi);
    return {};
  }

  @override
  Future<Map<String, dynamic>> simpanIzin(Sesi s, String materialId, List<String> timIds) async {
    panggilan.add('simpanIzin');
    dikirim.add({'materialId': materialId, 'timIds': timIds});
    return {'stokTertinggal': <dynamic>[]};
  }
}

SelisihStok _selisih(String arah) => SelisihStok(
    selisihId: 's1',
    daya: '2A',
    merk: 'Schneider',
    statusMcb: 'Baru',
    jumlahPerkiraan: arah == 'KURANG' ? 2 : 0,
    jumlahInput: arah == 'KURANG' ? 1 : 1,
    selisih: arah == 'KURANG' ? -1 : 1,
    arah: arah,
    status: 'MENUNGGU',
    caraPenyelesaian: '',
    timId: 't13',
    timNama: 'Yandal 13',
    tanggal: '2026-11-03',
    shift: 1);

void main() {
  Future<_RepoPalsu> pasang(WidgetTester t, {String aksi = 'UBAH', void Function(_RepoPalsu)? atur}) async {
    final repo = _RepoPalsu();
    atur?.call(repo);
    t.view.physicalSize = const Size(800, 2400);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    var n = 0;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: GudangAdminPanel(repo: repo, sesi: _sesi(aksi), idBaru: () => 'op-${n++}'))));
    await t.pumpAndSettle();
    return repo;
  }

  Future<void> bukaTab(WidgetTester t, String nama) async {
    await t.tap(find.text(nama));
    await t.pumpAndSettle();
  }

  testWidgets('tab Stok: saldo gudang dan tim tampil; stok tanpa izin bertanda; akses LIHAT menyembunyikan tombol ubah', (t) async {
    await pasang(t);
    expect(find.text('Gudang'), findsOneWidget);
    expect(find.text('Yandal 13'), findsOneWidget);
    expect(find.textContaining('tanpa izin'), findsWidgets);
    expect(find.byKey(const Key('tambah-stok')), findsOneWidget);
    await pasang(t, aksi: 'LIHAT');
    expect(find.byKey(const Key('tambah-stok')), findsNothing);
    expect(find.textContaining('hanya bisa melihat'), findsOneWidget);
  });

  testWidgets('tambah stok gudang: isian dirapikan lalu dikirim dengan idOperasi; isian kosong ditolak di HP', (t) async {
    final repo = await pasang(t);
    await t.tap(find.byKey(const Key('tambah-stok')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('f-simpan')));
    await t.pumpAndSettle();
    expect(find.text('Isi daya dan merk MCB.'), findsOneWidget);
    expect(repo.panggilan, isEmpty);
    await t.enterText(find.descendant(of: find.byKey(const Key('f-daya')), matching: find.byType(TextField)), '2');
    await t.enterText(find.byKey(const Key('f-merk')), 'Hager');
    await t.enterText(find.byKey(const Key('f-jumlah')), '5');
    await t.tap(find.byKey(const Key('f-simpan')));
    await t.pumpAndSettle(const Duration(seconds: 3));
    expect(repo.panggilan, ['tambahStokGudang']);
    expect(repo.dikirim.single, {'idOperasi': 'op-0', 'materialId': 'm1', 'daya': '2', 'merk': 'Hager', 'statusMcb': 'Baru', 'jumlah': 5});
  });

  testWidgets('tarik dari tim: alasan wajib; stok tanpa izin punya tombol Tarik ke gudang', (t) async {
    final repo = await pasang(t);
    await t.tap(find.byKey(const Key('tarik-t13|6A')));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const Key('f-alasan')), '   ');
    await t.tap(find.byKey(const Key('f-simpan')));
    await t.pumpAndSettle();
    expect(find.text('Isi alasan.'), findsOneWidget);
    expect(repo.panggilan, isEmpty);
    await t.enterText(find.byKey(const Key('f-alasan')), 'Izin dicabut');
    await t.tap(find.byKey(const Key('f-simpan')));
    await t.pumpAndSettle(const Duration(seconds: 3));
    expect(repo.panggilan, ['tarikStokTim']);
    expect(repo.dikirim.single['timId'], 't13');
    expect(repo.dikirim.single['daya'], '6A');
    expect(repo.dikirim.single['jumlah'], 1);
    expect(repo.dikirim.single['alasan'], 'Izin dicabut');
  });

  testWidgets('tab Selisih: cara penyelesaian mengikuti arah, catatan wajib, lalu terkirim', (t) async {
    final repo = await pasang(t, atur: (r) => r.selisihData = [_selisih('KURANG')]);
    await bukaTab(t, 'Selisih');
    expect(find.text('Kurang 1: 2A Schneider Baru (perkiraan 2, dihitung 1)'), findsOneWidget);
    await t.tap(find.byKey(const Key('selesaikan-s1')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('cara')));
    await t.pumpAndSettle();
    expect(find.text('MCB hilang (keluar dari stok)'), findsWidgets);
    expect(find.text('Isi pemakaian susulan'), findsWidgets);
    expect(find.text('Tambahan masuk (tambah ke stok)'), findsNothing, reason: 'cara LEBIH tidak muncul untuk selisih KURANG');
    await t.tap(find.text('MCB hilang (keluar dari stok)').last);
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('simpan-selisih')));
    await t.pumpAndSettle();
    expect(find.text('Isi catatan.'), findsOneWidget);
    await t.enterText(find.byKey(const Key('f-catatan')), 'dicek, memang hilang');
    await t.tap(find.byKey(const Key('simpan-selisih')));
    await t.pumpAndSettle(const Duration(seconds: 3));
    expect(repo.panggilan, ['selesaikanSelisih']);
    expect(repo.dikirim.single, {'selisihId': 's1', 'cara': 'HILANG', 'catatan': 'dicek, memang hilang'});
  });

  testWidgets('tab Pemakaian: batalkan butuh alasan lalu dikirim dengan revision', (t) async {
    final repo = await pasang(t, atur: (r) => r.pemakaianData = [
          {'pemakaianId': 'p1', 'nomorPemakaian': 'Y13-SHF1-MCB.001', 'tanggal': '2026-11-03', 'shift': 1, 'nomorMeter': '145', 'daya': '2A', 'merk': 'Schneider', 'statusMcb': 'Baru', 'keperluan': 'Ganti', 'jenisCatatan': 'NORMAL', 'revision': 3}
        ]);
    await bukaTab(t, 'Pemakaian');
    expect(find.text('Y13-SHF1-MCB.001'), findsOneWidget);
    await t.tap(find.byKey(const Key('batal-p1')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('f-simpan')));
    await t.pumpAndSettle();
    expect(find.text('Isi alasan.'), findsOneWidget);
    await t.enterText(find.byKey(const Key('f-alasan')), 'salah input');
    await t.tap(find.byKey(const Key('f-simpan')));
    await t.pumpAndSettle(const Duration(seconds: 3));
    expect(repo.dikirim.single, {'pemakaianId': 'p1', 'revision': 3, 'alasan': 'salah input'});
  });

  testWidgets('tab Izin: centang tim lalu simpan mengirim daftar tim yang dipilih', (t) async {
    final repo = await pasang(t);
    await bukaTab(t, 'Izin');
    expect(t.widget<CheckboxListTile>(find.byKey(const Key('izin-t13'))).value, true);
    expect(t.widget<CheckboxListTile>(find.byKey(const Key('izin-th'))).value, false);
    await t.tap(find.byKey(const Key('izin-th')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('simpan-izin')));
    await t.pumpAndSettle(const Duration(seconds: 3));
    expect(repo.dikirim.single['materialId'], 'm1');
    expect((repo.dikirim.single['timIds'] as List<String>)..sort(), ['t13', 'th']);
  });
}
