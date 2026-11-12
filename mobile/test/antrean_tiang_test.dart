import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/hartek/hartek_store.dart';
import 'package:sisi_row/features/tiang/antrean_tiang.dart';

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

class _Lokal implements TiangLokal {
  final diterima = <(String, String, bool)>[];
  final dipulihkan = <String>[];
  final segmenDiterima = <(String, String, bool)>[];
  final segmenDipulihkan = <String>[];
  @override
  Future<void> terima(Sesi s, String refLama, Map<String, dynamic> tiang, {required bool menunggu}) async =>
      diterima.add((refLama, '${tiang['tiangId']}', menunggu));
  @override
  Future<void> pulihkan(Sesi s, String ref, Map<String, dynamic>? asal, String kode) async => dipulihkan.add(ref);
  @override
  Future<void> terimaSegmen(Sesi s, String refLama, Map<String, dynamic> segmen, {required bool menunggu}) async =>
      segmenDiterima.add((refLama, '${segmen['segmenId']}', menunggu));
  @override
  Future<void> pulihkanSegmen(Sesi s, String ref, Map<String, dynamic>? asal) async => segmenDipulihkan.add(ref);
}

Sesi _sesi() => Sesi(
      token: 't',
      profil: {'userId': 'u1', 'username': 'u1', 'role': 'ADMIN'},
      menu: [
        {'kode': 'OPS_VERIFIKASI_TIANG', 'aksi': 'UBAH'}
      ],
      offlineSampai: DateTime(2030),
    );

Map<String, dynamic> _data({String? induk, int revision = 1, String? tiangId}) => {
      if (tiangId != null) 'tiangId': tiangId,
      if (tiangId != null) 'revision': revision,
      if (tiangId == null) 'nama': 'PLS',
      'statusVerifikasi': 'TERVERIFIKASI',
      'sirkuit': [
        {if (induk != null) 'indukTiangId': induk, 'penyulang': 'TOBOALI 1'}
      ],
    };

void main() {
  late _Gudang gudang;
  late _Lokal lokal;
  late List<(String, Map<String, dynamic>)> panggilan;
  late Future<Map<String, dynamic>> Function(String aksi, Map<String, dynamic> data) balas;
  late AntreanTiang a;
  final foto = <String>[];

  setUp(() {
    gudang = _Gudang();
    lokal = _Lokal();
    panggilan = [];
    foto.clear();
    balas = (aksi, data) async => {};
    a = AntreanTiang(gudang, (s, aksi, data) {
      panggilan.add((aksi, data));
      return balas(aksi, data);
    }, lokal, bacaFoto: (p) async => [1, 2, 3], hapusFoto: (p) async => foto.add('$p'));
  });

  Future<void> tambah(String ref, Map<String, dynamic> data, {Map<String, String> foto = const {}}) =>
      a.tambahTiang(_sesi(), ref: ref, kode: 'PLS', data: data, tampil: {'tiangId': ref}, asal: null, foto: foto);

  Map<String, dynamic> hasilOk(String id, {int revision = 1}) => {
        'ok': true,
        'tiang': {'tiangId': id, 'revision': revision, 'kode': 'PLS'}
      };

  test('simpan ulang tiang yang sama = satu entri (keadaan terakhir), foto slot yang sama diganti', () async {
    await tambah('1001', _data(tiangId: '1001'), foto: {'TIANG': '/a.jpg'});
    await tambah('1001', _data(tiangId: '1001', revision: 1), foto: {'TIANG': '/b.jpg', 'KEPALA': '/k.jpg'});
    final l = await a.daftar('u1');
    expect(l, hasLength(1));
    expect(l.first['versi'], 2);
    expect(l.first['foto'], {'TIANG': '/b.jpg', 'KEPALA': '/k.jpg'});
    expect(foto, ['/a.jpg'], reason: 'foto lama yang belum terkirim dihapus dari HP');
  });

  test('urutanKirim: induk lebih dulu; anak dari induk bergalat tidak dikirim', () async {
    await tambah('LOKAL-anak', _data(induk: 'LOKAL-induk'));
    await tambah('LOKAL-induk', _data());
    await tambah('1003', _data(tiangId: '1003', induk: '1002'));
    final urut = AntreanTiang.urutanKirim(await a.daftar('u1')).map((x) => x['ref']).toList();
    expect(urut.indexOf('LOKAL-induk') < urut.indexOf('LOKAL-anak'), isTrue);
    expect(urut, hasLength(3));
    final l = await a.daftar('u1');
    l.firstWhere((x) => x['ref'] == 'LOKAL-induk')['galat'] = 'ditolak';
    expect(AntreanTiang.urutanKirim(l).map((x) => x['ref']), ['1003']);
  });

  test('kirim: satu panggilan, id sementara diganti di anak, lalu foto ke id server; entri selesai dibuang', () async {
    await tambah('LOKAL-induk', _data(), foto: {'TIANG': '/t.jpg'});
    await tambah('LOKAL-anak', _data(induk: 'LOKAL-induk'));
    balas = (aksi, data) async {
      if (aksi != 'sinkronTiang') return {};
      final ops = data['ops'] as List;
      return {
        'hasil': [
          for (final o in ops) hasilOk((o as Map)['refId'] == 'LOKAL-induk' ? 'BARU-0001' : 'BARU-0002')..['opId'] = o['opId']
        ],
        'idBaru': {'LOKAL-induk': 'BARU-0001', 'LOKAL-anak': 'BARU-0002'}
      };
    };
    await a.kirim(_sesi());
    expect(panggilan.where((p) => p.$1 == 'sinkronTiang'), hasLength(1));
    final ops = panggilan.first.$2['ops'] as List;
    expect(ops.map((o) => (o as Map)['refId']), ['LOKAL-induk', 'LOKAL-anak']);
    expect(panggilan.where((p) => p.$1 == 'uploadFotoTiang').map((p) => p.$2['tiangId']), ['BARU-0001']);
    expect(lokal.diterima.map((x) => x.$2), ['BARU-0001', 'BARU-0002']);
    expect(await a.daftar('u1'), isEmpty);
  });

  test('ditolak server = galat (tidak diulang otomatis); anaknya menunggu, bukan galat; kirimUlang membersihkan galat', () async {
    await tambah('1002', _data(tiangId: '1002'));
    await tambah('1003', _data(tiangId: '1003', induk: '1002'));
    balas = (aksi, data) async {
      final ops = data['ops'] as List;
      return {
        'hasil': [
          for (final o in ops)
            (o as Map)['opId'] == (await a.daftar('u1')).firstWhere((x) => x['ref'] == '1002')['opId']
                ? {'opId': o['opId'], 'ok': false, 'galat': {'kode': 'KONFLIK_REVISION', 'info': '1002'}}
                : {'opId': o['opId'], 'ok': false, 'galat': {'kode': 'DATA_TIDAK_VALID', 'info': 'induk tiang belum terverifikasi'}}
        ],
        'idBaru': {}
      };
    };
    await a.kirim(_sesi());
    final l = await a.daftar('u1');
    expect(l.firstWhere((x) => x['ref'] == '1002')['galat'], isNotEmpty);
    expect(l.firstWhere((x) => x['ref'] == '1003')['galat'], '');
    final n = panggilan.length;
    await a.kirim(_sesi());
    expect(panggilan.length, n, reason: 'induk bergalat tidak diulang, anaknya tertahan: tidak ada yang dikirim');
    await a.kirimUlang(_sesi(), '1002');
    expect((await a.daftar('u1')).firstWhere((x) => x['ref'] == '1002')['galat'], '');
  });

  test('gagal sinyal: entri tetap menunggu tanpa galat; DITUNDA tidak membuat berputar', () async {
    await tambah('1002', _data(tiangId: '1002'));
    balas = (aksi, data) async => throw ApiException('HTTP_0');
    await a.kirim(_sesi());
    expect((await a.daftar('u1')).single['galat'], '');
    balas = (aksi, data) async => {
      'hasil': [
        for (final o in data['ops'] as List) {'opId': (o as Map)['opId'], 'ok': false, 'galat': {'kode': 'DITUNDA', 'info': ''}}
      ],
      'idBaru': {}
    };
    await a.kirim(_sesi());
    expect((await a.daftar('u1')).single['galat'], '');
  });

  test('disimpan lagi saat sedang dikirim: perubahan terbaru tidak hilang, jadi ubahan atas revision server', () async {
    await tambah('LOKAL-x', _data());
    balas = (aksi, data) async {
      await tambah('LOKAL-x', {..._data(), 'nama': 'PLS-EDIT'});
      final o = (data['ops'] as List).first as Map;
      return {
        'hasil': [hasilOk('BARU-0007', revision: 1)..['opId'] = o['opId']],
        'idBaru': {'LOKAL-x': 'BARU-0007'}
      };
    };
    await a.kirim(_sesi());
    final x = (await a.daftar('u1')).single;
    expect(x['ref'], 'BARU-0007');
    expect(x['data'], isNotNull);
    expect((x['data'] as Map)['tiangId'], 'BARU-0007');
    expect((x['data'] as Map)['revision'], 1);
    expect(lokal.diterima.single.$3, isTrue, reason: 'masih ada perubahan menunggu');
  });

  test('buang: entri hilang, foto dihapus, tiang dipulihkan', () async {
    await tambah('1002', _data(tiangId: '1002'), foto: {'TIANG': '/t.jpg'});
    await a.buang(_sesi(), '1002');
    expect(await a.daftar('u1'), isEmpty);
    expect(foto, ['/t.jpg']);
    expect(lokal.dipulihkan, ['1002']);
  });

  test('segmen baru dikirim sebelum tiang yang memakainya; id segmen diganti; segmen ditolak = tiangnya menunggu', () async {
    await tambah('1002', {
      ..._data(tiangId: '1002'),
      'sirkuit': [
        {'segmenId': 'LOKAL-seg', 'penyulang': 'TOBOALI 1'}
      ]
    });
    await a.tambahSegmen(_sesi(), ref: 'LOKAL-seg', data: {'nama': 'PMT - SKTM'}, tampil: {'segmenId': 'LOKAL-seg'}, asal: null);
    final urut = AntreanTiang.urutanKirim(await a.daftar('u1')).map((x) => x['ref']).toList();
    expect(urut, ['LOKAL-seg', '1002']);

    balas = (aksi, data) async {
      final ops = data['ops'] as List;
      return {
        'hasil': [
          for (final o in ops)
            (o as Map)['jenis'] == 'SEGMEN'
                ? {'opId': o['opId'], 'ok': false, 'galat': {'kode': 'NAMA_GANDA', 'info': 'PMT - SKTM'}}
                : {'opId': o['opId'], 'ok': false, 'galat': {'kode': 'DATA_TIDAK_DITEMUKAN', 'info': 'segmenId belum diterima server'}}
        ],
        'idBaru': {}
      };
    };
    await a.kirim(_sesi());
    final l = await a.daftar('u1');
    expect(l.firstWhere((x) => x['ref'] == 'LOKAL-seg')['galat'], isNotEmpty);
    expect(l.firstWhere((x) => x['ref'] == '1002')['galat'], '', reason: 'tiang menunggu segmennya, bukan bergalat');

    await a.kirimUlang(_sesi(), 'LOKAL-seg');
    balas = (aksi, data) async {
      final ops = data['ops'] as List;
      return {
        'hasil': [
          for (final o in ops)
            (o as Map)['jenis'] == 'SEGMEN'
                ? {'opId': o['opId'], 'ok': true, 'segmen': {'segmenId': 'SGM-0009', 'revision': 1}}
                : hasilOk('1002', revision: 2)..['opId'] = o['opId']
        ],
        'idBaru': {'LOKAL-seg': 'SGM-0009'}
      };
    };
    await a.kirim(_sesi());
    expect(panggilan.last.$2['ops'].map((o) => (o as Map)['jenis']), ['SEGMEN', 'TIANG']);
    expect(((panggilan.last.$2['ops'] as List).last as Map)['data']['sirkuit'][0]['segmenId'], 'LOKAL-seg', reason: 'server yang mengganti id sementara');
    expect(lokal.segmenDiterima.single.$2, 'SGM-0009');
    expect(await a.daftar('u1'), isEmpty);
  });
}
