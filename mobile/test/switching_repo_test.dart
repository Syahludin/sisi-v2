import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/core/env.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/switching/switching_model.dart';
import 'package:sisi_row/features/switching/switching_repository.dart';
import 'package:sisi_row/features/tiang/tiang_api.dart';
import 'package:sisi_row/features/tiang/tiket_tiang.dart';

/// Master Switching di HP lewat TiangApi: Hostinger = satu paket data + foto (opId); alamat kosong = Apps Script lama.
Sesi _sesi() => Sesi(
      token: 'a' * 64,
      profil: {'userId': 'u-1', 'role': 'ADMIN', 'jenisTim': ''},
      menu: const [{'kode': 'OPS_MASTER_SWITCHING', 'aksi': 'UBAH'}],
      offlineSampai: DateTime.utc(2030),
    );

IsianSwitching _isian() {
  final i = IsianSwitching(penyulangAwal: 'TOBOALI 1');
  i.t['nama'] = 'PMT Uji';
  i.t['koordinat'] = '-3.0001, 106.5001';
  return i;
}

void main() {
  late Directory dir;
  late String fotoA, fotoB;
  setUp(() {
    dir = Directory.systemTemp.createTempSync('swc_repo');
    fotoA = '${dir.path}/a.jpg';
    fotoB = '${dir.path}/b.jpg';
    File(fotoA).writeAsBytesSync([0xff, 0xd8, 1, 2, 3]);
    File(fotoB).writeAsBytesSync([0xff, 0xd8, 9, 9]);
  });
  tearDown(() => dir.deleteSync(recursive: true));

  ({SwitchingRepository repo, List<Map<String, dynamic>> hostinger, List<Map<String, dynamic>> lama}) buat({
    String alamat = 'https://contoh.id/sisi-api',
    http.Response Function(Map<String, dynamic>)? balas,
    Map<String, dynamic> Function(Map<String, dynamic>)? balasLama,
  }) {
    final hostinger = <Map<String, dynamic>>[], lama = <Map<String, dynamic>>[];
    final api = TiangApi(
      alamat: () => alamat,
      tiket: TiketTiang((s) async => (tiket: 't', sampai: DateTime.now().toUtc().add(const Duration(hours: 8)))),
      lama: ApiClient(client: MockClient((req) async {
        final b = jsonDecode(req.body) as Map<String, dynamic>;
        lama.add(b);
        final r = (balasLama ?? (_) => {'switching': {'switchingId': 'SWC-0001', 'jenis': 'LBS', 'nama': 'PMT Uji'}})(b);
        return http.Response(jsonEncode({'ok': true, 'env': Env.name, 'data': r}), 200);
      })),
      client: MockClient((req) async {
        final b = jsonDecode(req.body) as Map<String, dynamic>;
        hostinger.add(b);
        return (balas ?? (_) => http.Response(jsonEncode({'ok': true, 'data': {'switching': {'switchingId': 'SWC-0001', 'jenis': 'LBS', 'nama': 'PMT Uji', 'foto': {'UNIT': true}}}}), 200))(b);
      }),
    );
    return (repo: SwitchingRepository(ApiClient(), api), hostinger: hostinger, lama: lama);
  }

  test('Hostinger: simpan = SATU panggilan simpanSwitching berisi data + foto (sidik, ukuran, base64) + opId; tidak ada unggah terpisah', () async {
    final k = buat();
    final h = await k.repo.simpan(_sesi(), _isian(), foto: {'UNIT': fotoA, 'NAMEPLATE': fotoB}, opId: 'op-tetap-123');
    expect(h.switching.id, 'SWC-0001');
    expect(h.fotoGagal, isEmpty);
    expect(k.hostinger.length, 1);
    final p = k.hostinger.single;
    expect(p['action'], 'simpanSwitching');
    final data = p['data'] as Map<String, dynamic>;
    expect(data['opId'], 'op-tetap-123');
    expect(data['nama'], 'PMT Uji');
    expect((data['foto'] as Map).keys.toSet(), {'UNIT', 'NAMEPLATE'});
    expect(data['foto']['UNIT']['ukuranByte'], 5);
    expect(base64Decode('${data['foto']['UNIT']['data']}'), [0xff, 0xd8, 1, 2, 3]);
    expect(k.lama, isEmpty);
  });

  test('tanpa foto: tidak ada kunci foto; opId dibuat bila tidak diberikan; opId yang sama dipakai ulang saat "Coba Lagi"', () async {
    final k = buat();
    await k.repo.simpan(_sesi(), _isian());
    await k.repo.simpan(_sesi(), _isian(), opId: 'sama');
    await k.repo.simpan(_sesi(), _isian(), opId: 'sama');
    final d = k.hostinger.map((x) => x['data'] as Map<String, dynamic>).toList();
    expect(d[0].containsKey('foto'), isFalse);
    expect(d[0]['opId'], isNotEmpty);
    expect([d[1]['opId'], d[2]['opId']], ['sama', 'sama']);
  });

  test('berkas foto hilang: seluruh paket digagalkan (FOTO_HILANG) sebelum dikirim, tidak ada data setengah jadi', () async {
    final k = buat();
    await expectLater(k.repo.simpan(_sesi(), _isian(), foto: {'UNIT': '${dir.path}/tidak-ada.jpg'}), throwsA(isA<ApiException>().having((e) => e.kode, 'kode', 'FOTO_HILANG')));
    expect(k.hostinger, isEmpty);
  });

  test('galat validasi server (422) sampai ke pemanggil sebagai GalatValidasi', () async {
    final k = buat(balas: (_) => http.Response(jsonEncode({'ok': false, 'kode': 'DATA_TIDAK_VALID', 'galat': [{'field': 'nama', 'pesan': 'Nama switching sudah dipakai.'}]}), 422));
    await expectLater(k.repo.simpan(_sesi(), _isian()), throwsA(isA<GalatValidasi>().having((e) => e.galat.single.field, 'field', 'nama')));
  });

  test('jalur mundur (alamat kosong): data ke Apps Script TANPA opId / foto, lalu foto satu per satu; foto gagal dicatat tanpa membatalkan data', () async {
    var gagalNameplate = true;
    final k = buat(alamat: '', balasLama: (b) {
      if (b['action'] == 'uploadFotoSwitching' && b['data']['slot'] == 'NAMEPLATE' && gagalNameplate) throw const SocketException('putus');
      return b['action'] == 'simpanSwitching' ? {'switching': {'switchingId': 'SWC-0001', 'jenis': 'LBS', 'nama': 'PMT Uji'}} : {};
    });
    final h = await k.repo.simpan(_sesi(), _isian(), foto: {'UNIT': fotoA, 'NAMEPLATE': fotoB}, opId: 'abaikan');
    expect(k.hostinger, isEmpty);
    expect(k.lama.map((x) => x['action']), ['simpanSwitching', 'uploadFotoSwitching', 'uploadFotoSwitching']);
    expect((k.lama.first['data'] as Map).containsKey('opId'), isFalse);
    expect((k.lama.first['data'] as Map).containsKey('foto'), isFalse);
    expect((k.lama[1]['data'] as Map).containsKey('opId'), isFalse, reason: 'Apps Script lama menolak isian tak dikenal');
    expect(h.fotoGagal, ['NAMEPLATE']);
    expect(h.switching.adaFoto('UNIT'), isTrue);
    expect(h.switching.adaFoto('NAMEPLATE'), isFalse);
    gagalNameplate = false;
  });

  test('foto susulan: Hostinger memakai opId, jalur lama tidak; foto() dan muat() lewat TiangApi', () async {
    final k = buat(balas: (b) => b['action'] == 'getFotoSwitching'
        ? http.Response(jsonEncode({'ok': true, 'data': {'data': base64Encode([1, 2, 3]), 'kecil': true}}), 200)
        : http.Response(jsonEncode({'ok': true, 'data': {'switching': <Map<String, dynamic>>[], 'jaringan': <Map<String, dynamic>>[], 'waktu': 'x'}}), 200));
    await k.repo.unggahFoto(_sesi(), 'SWC-0001', 'UNIT', fotoA);
    final d = k.hostinger.single['data'] as Map<String, dynamic>;
    expect([k.hostinger.single['action'], d['switchingId'], d['slot'], d['opId'] != null, d['sha256'] != null], ['uploadFotoSwitching', 'SWC-0001', 'UNIT', true, true]);
    expect(await k.repo.foto(_sesi(), 'SWC-0001', 'UNIT'), [1, 2, 3]);
    expect(k.hostinger.last['data'], {'switchingId': 'SWC-0001', 'slot': 'UNIT', 'ukuran': 'KECIL'});
    final mati = buat(alamat: '');
    await mati.repo.unggahFoto(_sesi(), 'SWC-0001', 'UNIT', fotoA);
    expect((mati.lama.single['data'] as Map).containsKey('opId'), isFalse);
  });
}
