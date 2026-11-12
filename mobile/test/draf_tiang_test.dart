import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/core/env.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/hartek/hartek_store.dart' show GudangHartek;
import 'package:sisi_row/features/tiang/draf_tiang.dart';
import 'package:sisi_row/features/tiang/tiang_api.dart';
import 'package:sisi_row/features/tiang/tiket_tiang.dart';

class _Gudang implements GudangHartek {
  final Map<String, String> isi = {};
  @override
  Future<({String json, DateTime diambil})?> bacaMaster(String kunci) async => isi[kunci] == null ? null : (json: isi[kunci]!, diambil: DateTime.now());
  @override
  Future<void> tulisMaster(String kunci, String json) async => isi[kunci] = json;
  @override
  dynamic noSuchMethod(Invocation i) => throw UnimplementedError('${i.memberName}');
}

class _Lokal implements TiangLokal {
  final peristiwa = <String>[];
  final tampil = <String, Map<String, dynamic>>{};
  @override
  Future<void> terima(Sesi s, String refLama, Map<String, dynamic> tiang) async {
    peristiwa.add('terima $refLama -> ${tiang['tiangId']}${tiang['draf'] != null ? ' (draf ${tiang['draf']})' : ''}');
    tampil[refLama] = tiang;
  }

  @override
  Future<void> pulihkan(Sesi s, String ref, Map<String, dynamic>? asal, String kode) async => peristiwa.add('pulihkan $ref ${asal == null ? 'hapus' : 'asal'}');
  @override
  Future<void> terimaSegmen(Sesi s, String refLama, Map<String, dynamic> segmen) async => peristiwa.add('terimaSegmen $refLama -> ${segmen['segmenId']}');
  @override
  Future<void> pulihkanSegmen(Sesi s, String ref, Map<String, dynamic>? asal) async => peristiwa.add('pulihkanSegmen $ref');
}

Sesi _sesi() => Sesi(
      token: 'a' * 64,
      profil: {'userId': 'u-1', 'role': 'ADMIN', 'jenisTim': ''},
      menu: const [{'kode': 'OPS_VERIFIKASI_TIANG', 'aksi': 'UBAH'}],
      offlineSampai: DateTime.utc(2030),
    );

class _Dunia {
  _Dunia({String alamat = 'https://contoh.id/sisi-api'}) {
    final tiket = TiketTiang((s) async => (tiket: 'tiket', sampai: DateTime.now().toUtc().add(const Duration(hours: 8))));
    final lamaKlien = MockClient((req) async {
      final b = jsonDecode(req.body) as Map<String, dynamic>;
      lama.add(b);
      final r = lamaBalasan(b);
      return http.Response(jsonEncode({'ok': true, 'env': Env.name, 'data': r}), 200);
    });
    api = TiangApi(
      alamat: () => alamat,
      tiket: tiket,
      lama: ApiClient(client: lamaKlien),
      client: MockClient((req) async {
        final b = jsonDecode(req.body) as Map<String, dynamic>;
        kirim.add(b);
        if (putus) throw const SocketException('tanpa sinyal');
        return balas(b);
      }),
    );
    draf = DrafTiang(gudang, api, lokal: lokal, bacaFoto: (path) async => berkas[path], hapusFoto: (path) async {
      if (path != null) dihapus.add(path);
    });
  }

  final gudang = _Gudang();
  final lokal = _Lokal();
  late final TiangApi api;
  late final DrafTiang draf;
  final kirim = <Map<String, dynamic>>[];
  final lama = <Map<String, dynamic>>[];
  final berkas = <String, List<int>>{'/foto/a.jpg': [0xff, 0xd8, 1, 2, 3], '/foto/b.jpg': [0xff, 0xd8, 9, 9]};
  final dihapus = <String>[];
  bool putus = false;

  /// Jawaban server tiang; tes menimpa.
  http.Response Function(Map<String, dynamic> permintaan) balas = (b) => http.Response('{}', 500);
  Map<String, dynamic> Function(Map<String, dynamic> permintaan) lamaBalasan = (b) => {};

  static http.Response ok(Map<String, dynamic> data) => http.Response(jsonEncode({'ok': true, 'data': data}), 200);
}

Map<String, dynamic> _tiang(String id, {String nama = 'PLS0001', String kode = 'PLS'}) => {'tiangId': id, 'nama': nama, 'kode': kode, 'statusVerifikasi': 'TERVERIFIKASI', 'revision': 2, 'kurang': <String>[]};

Map<String, dynamic> _data({String? induk, int revision = 3}) => {
      'tiangId': 'T1',
      'revision': revision,
      'statusVerifikasi': 'TERVERIFIKASI',
      'koordinat': '-3, 106.5',
      'sirkuit': [
        {'penyulang': 'TOBOALI 1', if (induk != null) 'indukTiangId': induk}
      ],
    };

Future<void> _simpan(_Dunia d, {String ref = 'T1', Map<String, dynamic>? data, Map<String, String> foto = const {}, Map<String, dynamic>? asal, String kode = 'PLS'}) =>
    d.draf.simpan(_sesi(), jenis: 'TIANG', ref: ref, kode: kode, data: data ?? _data(), tampil: _tiang(ref, kode: kode), asal: asal, foto: foto);

void main() {
  test('simpan: draf lengkap tertulis dan tampil di daftar bertanda draf; opId sama bila identik, baru bila isi berubah; foto yang diganti dihapus', () async {
    final d = _Dunia();
    await _simpan(d, foto: {'TIANG': '/foto/a.jpg'});
    expect(d.lokal.peristiwa, ['terima T1 -> T1 (draf belumTerkirim)']);
    final op1 = d.draf.item('u-1', 'T1')!['opId'];
    await _simpan(d, foto: {'TIANG': '/foto/a.jpg'});
    expect(d.draf.item('u-1', 'T1')!['opId'], op1, reason: 'identik = kirim ulang yang sama');
    await _simpan(d, data: _data(revision: 4), foto: {'TIANG': '/foto/a.jpg'});
    expect(d.draf.item('u-1', 'T1')!['opId'], isNot(op1), reason: 'isi berubah = opId baru (server tidak menjawab dengan hasil lama)');
    await _simpan(d, data: _data(revision: 4), foto: {'TIANG': '/foto/b.jpg'});
    expect(d.dihapus, ['/foto/a.jpg'], reason: 'foto yang digantikan dibuang dari HP');
    expect(d.draf.foto('u-1', 'T1'), {'TIANG': '/foto/b.jpg'});
    expect(await d.draf.jumlahTertunda('u-1'), 1);
  });

  test('draf bertahan: instance baru membaca dari penyimpanan HP yang sama', () async {
    final d = _Dunia();
    await _simpan(d, foto: {'TIANG': '/foto/a.jpg'});
    final baru = DrafTiang(d.gudang, d.api, lokal: d.lokal);
    final l = await baru.daftar('u-1');
    expect(l.single['ref'], 'T1');
    expect(baru.foto('u-1', 'T1'), {'TIANG': '/foto/a.jpg'});
    expect(baru.status('u-1', 'T1'), StatusDraf.belumTerkirim);
  });

  test('kirim sukses: satu paket (opId, TANPA revision, foto + sidik) lalu draf dihapus; foto lokal dibuang HANYA bila sidik cocok', () async {
    final d = _Dunia();
    await _simpan(d, foto: {'TIANG': '/foto/a.jpg', 'KEPALA': '/foto/b.jpg'});
    d.balas = (b) {
      final foto = b['data']['foto'] as Map<String, dynamic>;
      return _Dunia.ok({
        'tiang': _tiang('T1'),
        'selisihM': 3,
        'foto': {
          'TIANG': {'sha256': foto['TIANG']['sha256'], 'bytes': 5},
          'KEPALA': {'sha256': foto['KEPALA']['sha256'], 'bytes': 4},
        },
      });
    };
    final h = await d.draf.kirim(_sesi(), 'T1');
    expect(h, isA<Terkirim>());
    expect((h as Terkirim).selisihM, 3);
    final paket = d.kirim.single;
    expect(paket['action'], 'simpanVerifikasiTiang');
    final data = paket['data'] as Map<String, dynamic>;
    expect(data.containsKey('revision'), isFalse, reason: 'HP tidak mengirim revision (satu tiang satu petugas)');
    expect(data['opId'], isNotEmpty);
    expect((data['foto'] as Map).keys.toSet(), {'TIANG', 'KEPALA'});
    expect(base64Decode('${data['foto']['TIANG']['data']}'), [0xff, 0xd8, 1, 2, 3]);
    expect(data['foto']['TIANG']['ukuranByte'], 5);
    expect((await d.draf.daftar('u-1')), isEmpty);
    expect(d.dihapus.toSet(), {'/foto/a.jpg', '/foto/b.jpg'});
    expect(d.lokal.peristiwa.last, 'terima T1 -> T1');
  });

  test('sidik foto tidak dikonfirmasi server: draf TETAP (perlu diperbaiki), foto itu tidak dihapus dari HP', () async {
    final d = _Dunia();
    await _simpan(d, foto: {'TIANG': '/foto/a.jpg', 'KEPALA': '/foto/b.jpg'});
    d.balas = (b) => _Dunia.ok({
          'tiang': _tiang('T1'),
          'foto': {'TIANG': {'sha256': b['data']['foto']['TIANG']['sha256'], 'bytes': 5}, 'KEPALA': {'sha256': 'beda', 'bytes': 4}},
        });
    expect(await d.draf.kirim(_sesi(), 'T1'), isA<Terkirim>());
    expect(d.dihapus, ['/foto/a.jpg'], reason: 'hanya yang sidiknya cocok');
    final sisa = (await d.draf.daftar('u-1')).single;
    expect([sisa['status'], sisa['foto']], ['perluDiperbaiki', {'KEPALA': '/foto/b.jpg'}]);
  });

  test('422: Ditolak membawa SEMUA masalah isian; draf tetap, bertanda perlu diperbaiki, alasan tersimpan; tidak ikut kirim otomatis', () async {
    final d = _Dunia();
    await _simpan(d);
    d.balas = (b) => http.Response(
        jsonEncode({
          'ok': false,
          'kode': 'DATA_TIDAK_VALID',
          'galat': [
            {'field': 'jenis', 'pesan': 'Fisik Tiang wajib diisi.'},
            {'field': 'foto', 'pesan': 'Foto Full Tiang wajib diisi.'}
          ]
        }),
        422);
    final h = await d.draf.kirim(_sesi(), 'T1');
    expect(h, isA<Ditolak>());
    expect((h as Ditolak).galat.map((g) => g.field), ['jenis', 'foto']);
    expect(d.draf.status('u-1', 'T1'), StatusDraf.perluDiperbaiki);
    expect(d.draf.galat('u-1', 'T1').map((g) => g.pesan), ['Fisik Tiang wajib diisi.', 'Foto Full Tiang wajib diisi.']);
    expect(d.draf.pesan('u-1', 'T1'), 'Fisik Tiang wajib diisi.');
    expect(d.lokal.peristiwa.last, 'terima T1 -> T1 (draf perluDiperbaiki)');
    expect(await d.draf.jumlahTertunda('u-1'), 0, reason: 'menunggu petugas, tidak menahan logout');
    d.kirim.clear();
    expect(await d.draf.kirimSemua(_sesi()), 0);
    expect(d.kirim, isEmpty, reason: 'draf perlu diperbaiki tidak dikirim otomatis');
  });

  test('tanpa sinyal / waktu habis / 5xx: BelumTerkirim, draf lengkap tetap (belum terkirim), foto utuh di HP', () async {
    final d = _Dunia();
    await _simpan(d, foto: {'TIANG': '/foto/a.jpg'});
    d.putus = true;
    expect(await d.draf.kirim(_sesi(), 'T1'), isA<BelumTerkirim>());
    d.putus = false;
    d.balas = (b) => http.Response('<html>', 502);
    expect(await d.draf.kirim(_sesi(), 'T1'), isA<BelumTerkirim>());
    d.balas = (b) => http.Response(jsonEncode({'ok': false, 'kode': 'TERLALU_SERING'}), 429);
    expect(await d.draf.kirim(_sesi(), 'T1'), isA<BelumTerkirim>());
    expect(d.draf.status('u-1', 'T1'), StatusDraf.belumTerkirim);
    expect(d.dihapus, isEmpty);
    expect(d.draf.foto('u-1', 'T1'), {'TIANG': '/foto/a.jpg'});
  });

  test('berkas foto hilang / tidak terbaca: galat terlihat (bukan dianggap terkirim), tidak ada permintaan ke server', () async {
    final d = _Dunia();
    await _simpan(d, foto: {'TIANG': '/foto/hilang.jpg'});
    final h = await d.draf.kirim(_sesi(), 'T1');
    expect(h, isA<Ditolak>());
    expect((h as Ditolak).galat.single.field, 'foto');
    expect(h.pesan, contains('Foto Full Tiang tidak terbaca'));
    expect(d.kirim, isEmpty);
    expect(d.draf.status('u-1', 'T1'), StatusDraf.perluDiperbaiki);
    expect(d.draf.item('u-1', 'T1'), isNotNull);
  });

  test('kirimSemua: FIFO menurut waktu simpan; induk id sementara (LOKAL-...) dikirim lebih dulu dan id anak diganti id server', () async {
    final d = _Dunia();
    final induk = DrafTiang.idSementara();
    // anak disimpan LEBIH DULU daripada induknya
    await _simpan(d, ref: 'T2', data: {..._data(induk: induk), 'tiangId': 'T2'});
    await Future<void>.delayed(const Duration(milliseconds: 5));
    await _simpan(d, ref: induk, data: {'nama': 'Tiang Baru', 'statusVerifikasi': 'PERLU_PERBAIKAN', 'koordinat': '-3, 106.5', 'sirkuit': [{'penyulang': 'TOBOALI 1'}]});
    d.balas = (b) {
      final data = b['data'] as Map<String, dynamic>;
      return _Dunia.ok({'tiang': _tiang(data.containsKey('nama') ? 'ID-SERVER-1' : 'T2', nama: data.containsKey('nama') ? 'Tiang Baru' : 'PLS0002')});
    };
    final n = await d.draf.kirimSemua(_sesi());
    expect(n, 2);
    expect(d.kirim.map((k) => (k['data'] as Map).containsKey('nama')), [true, false], reason: 'induk lebih dulu');
    final anak = d.kirim[1]['data'] as Map<String, dynamic>;
    expect(anak['sirkuit'][0]['indukTiangId'], 'ID-SERVER-1', reason: 'id sementara induk diganti id dari server');
    expect(await d.draf.daftar('u-1'), isEmpty);
  });

  test('kirimSemua berhenti saat tidak ada sinyal (tidak menghajar server) dan melanjutkan di putaran berikutnya', () async {
    final d = _Dunia();
    await _simpan(d, ref: 'T1');
    await Future<void>.delayed(const Duration(milliseconds: 5));
    await _simpan(d, ref: 'T2', data: {..._data(), 'tiangId': 'T2'});
    d.putus = true;
    expect(await d.draf.kirimSemua(_sesi()), 0);
    expect(d.kirim.length, 1, reason: 'berhenti di yang pertama gagal');
    d.putus = false;
    d.balas = (b) => _Dunia.ok({'tiang': _tiang('${(b['data'] as Map)['tiangId']}')});
    expect(await d.draf.kirimSemua(_sesi()), 2);
  });

  test('hapus: draf dibuang, foto di HP dihapus, tampilan dipulihkan ke asal; draf yang bergantung ditandai perlu diperbaiki', () async {
    final d = _Dunia();
    final induk = DrafTiang.idSementara();
    await _simpan(d, ref: induk, data: {'nama': 'Baru', 'statusVerifikasi': 'PERLU_PERBAIKAN'}, foto: {'TIANG': '/foto/a.jpg'});
    await _simpan(d, ref: 'T2', data: {..._data(induk: induk), 'tiangId': 'T2'}, asal: {'tiangId': 'T2', 'nama': 'asli'});
    await d.draf.hapus(_sesi(), induk);
    expect(d.dihapus, ['/foto/a.jpg']);
    expect(d.lokal.peristiwa.last, 'pulihkan $induk hapus');
    expect(d.draf.item('u-1', induk), isNull);
    expect(d.draf.status('u-1', 'T2'), StatusDraf.perluDiperbaiki);
    expect(d.draf.pesan('u-1', 'T2'), contains('Induknya'));
    await d.draf.hapus(_sesi(), 'T2');
    expect(d.lokal.peristiwa.last, 'pulihkan T2 asal');
    expect(await d.draf.daftar('u-1'), isEmpty);
  });

  test('segmen: dikirim sebagai satu paket tanpa revision; jawaban server menggantikan draf', () async {
    final d = _Dunia();
    await d.draf.simpan(_sesi(), jenis: 'SEGMEN', ref: 'LOKAL-sgm', kode: '', data: {'nama': 'Segmen A', 'revision': 2, 'penyulang': 'TOBOALI 1'}, tampil: {'segmenId': 'LOKAL-sgm', 'nama': 'Segmen A'}, asal: null);
    d.balas = (b) => _Dunia.ok({'segmen': {'segmenId': 'SGM-0007', 'nama': 'Segmen A', 'revision': 1}});
    final h = await d.draf.kirim(_sesi(), 'LOKAL-sgm');
    expect(h, isA<Terkirim>());
    expect(d.kirim.single['action'], 'simpanSegmen');
    expect((d.kirim.single['data'] as Map).containsKey('revision'), isFalse);
    expect(d.lokal.peristiwa.last, 'terimaSegmen LOKAL-sgm -> SGM-0007');
    expect(await d.draf.daftar('u-1'), isEmpty);
  });

  test('galat domain dari server (bukan sinyal) = perlu diperbaiki dengan pesan; PINDAH_HOSTINGER / tiket dicabut = tetap draf (data aman)', () async {
    final d = _Dunia();
    await _simpan(d);
    d.balas = (b) => http.Response(jsonEncode({'ok': false, 'kode': 'KONFLIK_REVISION'}), 409);
    final h = await d.draf.kirim(_sesi(), 'T1');
    expect(h, isA<Ditolak>());
    expect(d.draf.status('u-1', 'T1'), StatusDraf.perluDiperbaiki);
    await _simpan(d, data: _data(revision: 9));
    d.balas = (b) => http.Response(jsonEncode({'ok': false, 'kode': 'TIKET_DICABUT'}), 401);
    final c = await d.draf.kirim(_sesi(), 'T1');
    expect(c, isA<BelumTerkirim>());
    expect((c as BelumTerkirim).pesan, contains('tidak lagi diizinkan'));
    expect(d.draf.status('u-1', 'T1'), StatusDraf.belumTerkirim);
  });

  test('jalur mundur (alamat API kosong): data ke Apps Script TANPA opId, foto satu per satu; foto gagal = data tidak dikirim dua kali', () async {
    final d = _Dunia(alamat: '');
    await _simpan(d, foto: {'TIANG': '/foto/a.jpg', 'KEPALA': '/foto/b.jpg'});
    var uploadGagal = true;
    d.lamaBalasan = (b) {
      if (b['action'] == 'uploadFotoTiang' && b['data']['slot'] == 'KEPALA' && uploadGagal) throw const SocketException('putus');
      return b['action'] == 'simpanVerifikasiTiang' ? {'tiang': _tiang('T1')} : {};
    };
    final h1 = await d.draf.kirim(_sesi(), 'T1');
    expect(h1, isA<BelumTerkirim>());
    expect(d.lama.map((x) => x['action']), ['simpanVerifikasiTiang', 'uploadFotoTiang', 'uploadFotoTiang']);
    expect((d.lama.first['data'] as Map).containsKey('opId'), isFalse);
    expect(d.lama.first['data']['revision'], 3, reason: 'jalur lama memeriksa revision');
    final sisa = (await d.draf.daftar('u-1')).single;
    expect([sisa['dataTerkirim'], sisa['foto']], [true, {'KEPALA': '/foto/b.jpg'}], reason: 'foto TIANG sudah naik dan dibuang; KEPALA tertinggal');
    d.lama.clear();
    uploadGagal = false;
    final h2 = await d.draf.kirim(_sesi(), 'T1');
    expect(h2, isA<Terkirim>());
    expect(d.lama.map((x) => x['action']), ['uploadFotoTiang'], reason: 'data tidak dikirim ulang');
    expect(await d.draf.daftar('u-1'), isEmpty);
    expect(d.dihapus.toSet(), {'/foto/a.jpg', '/foto/b.jpg'});
  });

  test('migrasi antrean lama (v1.0.71–75): entri bermuatan jadi draf; entri "hanya foto tersisa" jadi perlu diperbaiki (data tidak hilang)', () async {
    final g = _Gudang();
    g.isi['antre_tiang_u-1'] = jsonEncode([
      {'opId': 'x', 'jenis': 'TIANG', 'ref': 'T1', 'kode': 'PLS', 'data': _data(), 'asal': null, 'tampil': _tiang('T1'), 'foto': {'TIANG': '/foto/a.jpg'}, 'galat': ''},
      {'opId': 'y', 'jenis': 'TIANG', 'ref': 'T2', 'kode': 'PLS', 'data': null, 'asal': null, 'tampil': null, 'foto': {'KEPALA': '/foto/b.jpg'}, 'galat': ''},
      {'opId': 'z', 'jenis': 'SEGMEN', 'ref': 'SGM-0001', 'kode': '', 'data': {'nama': 'S'}, 'asal': null, 'tampil': {'segmenId': 'SGM-0001'}, 'foto': {}, 'galat': 'Ditolak'},
    ]);
    final d = _Dunia();
    final baru = DrafTiang(g, d.api, lokal: d.lokal);
    final l = await baru.daftar('u-1');
    expect(l.map((x) => x['ref']), ['T1', 'T2', 'SGM-0001']);
    expect(baru.status('u-1', 'T1'), StatusDraf.belumTerkirim);
    expect(baru.status('u-1', 'T2'), StatusDraf.perluDiperbaiki);
    expect(baru.pesan('u-1', 'T2'), contains('foto belum terkirim'));
    expect(baru.foto('u-1', 'T2'), {'KEPALA': '/foto/b.jpg'}, reason: 'foto tetap di HP untuk Simpan ulang');
    expect(baru.status('u-1', 'SGM-0001'), StatusDraf.perluDiperbaiki, reason: 'yang dulu bergalat tetap menunggu petugas');
    expect(g.isi.containsKey('draf_tiang_u-1'), isFalse, reason: 'baru ditulis saat ada perubahan berikutnya; data lama tetap ada sebagai cadangan');
  });
}
