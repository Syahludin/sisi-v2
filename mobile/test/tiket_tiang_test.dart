import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/core/env.dart';
import 'package:sisi_row/core/kunci_update.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/hartek/hartek_store.dart' show GudangHartek;
import 'package:sisi_row/features/tiang/tiang_api.dart';
import 'package:sisi_row/features/tiang/tiket_tiang.dart';

Sesi _sesi([String user = 'u-1']) => Sesi(
      token: 'a' * 64,
      profil: {'userId': user, 'role': 'ADMIN', 'jenisTim': ''},
      menu: const [],
      offlineSampai: DateTime.utc(2030),
    );

/// Gudang master palsu (hanya bacaMaster / tulisMaster dipakai AlamatTiang).
class _GudangPalsu implements GudangHartek {
  final Map<String, String> isi = {};
  @override
  Future<({String json, DateTime diambil})?> bacaMaster(String kunci) async => isi[kunci] == null ? null : (json: isi[kunci]!, diambil: DateTime.now());
  @override
  Future<void> tulisMaster(String kunci, String json) async => isi[kunci] = json;
  @override
  dynamic noSuchMethod(Invocation i) => throw UnimplementedError('${i.memberName}');
}

void main() {
  late DateTime kini;
  setUp(() {
    kini = DateTime.utc(2026, 11, 11, 8);
    KunciUpdate.aktif.value = false;
  });

  group('TiketTiang', () {
    test('tiket dipakai ulang sampai 30 menit terakhir, lalu diperbarui', () async {
      var n = 0;
      final t = TiketTiang((s) async => (tiket: 'T${++n}', sampai: kini.add(const Duration(hours: 8))), sekarang: () => kini);
      expect(await t.tiket(_sesi()), 'T1');
      kini = kini.add(const Duration(hours: 7, minutes: 29));
      expect(await t.tiket(_sesi()), 'T1', reason: 'sisa 31 menit masih dipakai');
      kini = kini.add(const Duration(minutes: 2));
      expect(await t.tiket(_sesi()), 'T2', reason: 'sisa 29 menit = diperbarui');
      expect(n, 2);
    });

    test('beberapa pemanggil bersamaan = satu permintaan; akun berbeda punya tiket sendiri', () async {
      var n = 0;
      final t = TiketTiang((s) async {
        await Future<void>.delayed(const Duration(milliseconds: 20));
        return (tiket: '${s.userId}-${++n}', sampai: kini.add(const Duration(hours: 8)));
      }, sekarang: () => kini);
      final hasil = await Future.wait([t.tiket(_sesi()), t.tiket(_sesi()), t.tiket(_sesi())]);
      expect(hasil, ['u-1-1', 'u-1-1', 'u-1-1']);
      expect(n, 1);
      expect(await t.tiket(_sesi('u-2')), 'u-2-2');
    });

    test('gagal memperbarui (tanpa sinyal): tiket lama yang belum kedaluwarsa tetap dipakai; sudah kedaluwarsa = galat', () async {
      var gagal = false;
      final t = TiketTiang((s) async {
        if (gagal) throw ApiException('HTTP_0');
        return (tiket: 'T1', sampai: kini.add(const Duration(hours: 8)));
      }, sekarang: () => kini);
      await t.tiket(_sesi());
      gagal = true;
      kini = kini.add(const Duration(hours: 7, minutes: 45));
      expect(await t.tiket(_sesi()), 'T1', reason: 'sisa 15 menit, masih sah');
      kini = kini.add(const Duration(minutes: 20));
      await expectLater(t.tiket(_sesi()), throwsA(isA<ApiException>()));
    });

    test('paksa (server menolak tiket) tidak memakai tiket lama; lupakan menghapus simpanan', () async {
      var n = 0;
      var gagal = false;
      final t = TiketTiang((s) async {
        if (gagal) throw ApiException('HTTP_0');
        return (tiket: 'T${++n}', sampai: kini.add(const Duration(hours: 8)));
      }, sekarang: () => kini);
      await t.tiket(_sesi());
      expect(await t.tiket(_sesi(), paksa: true), 'T2');
      gagal = true;
      await expectLater(t.tiket(_sesi(), paksa: true), throwsA(isA<ApiException>()), reason: 'tiket lama ditolak server: jangan dipakai lagi');
      gagal = false;
      t.lupakan('u-1');
      expect(await t.tiket(_sesi()), 'T3');
    });

    test('dariApi: membaca tiket + sampai dari getTiketApi; jawaban tanpa tiket = RESPON_TIDAK_VALID', () async {
      var isi = <String, dynamic>{'tiket': 'abc.def', 'sampai': '2026-11-11T16:00:00.000Z'};
      final dipanggil = <Map<String, dynamic>>[];
      final api = ApiClient(client: MockClient((req) async {
        dipanggil.add(jsonDecode(req.body) as Map<String, dynamic>);
        return http.Response(jsonEncode({'ok': true, 'env': Env.name, 'data': isi}), 200);
      }));
      final t = TiketTiang.dariApi(api, sekarang: () => kini);
      expect(await t.tiket(_sesi()), 'abc.def');
      expect(dipanggil.single['action'], 'getTiketApi');
      expect(dipanggil.single['token'], 'a' * 64);
      isi = {'sampai': 'bukan tanggal'};
      t.lupakan('u-1');
      await expectLater(t.tiket(_sesi()), throwsA(isA<ApiException>().having((e) => e.kode, 'kode', 'RESPON_TIDAK_VALID')));
    });
  });

  group('TiangApi', () {
    late List<http.Request> permintaan;
    late List<http.Response Function(http.Request)> balasan;
    late int tiketKe;
    TiangApi buat({String alamat = 'https://contoh.id/sisi-api', ApiClient? lama}) {
      permintaan = [];
      tiketKe = 0;
      final klien = MockClient((req) async {
        permintaan.add(req);
        return balasan.removeAt(0)(req);
      });
      return TiangApi(
        alamat: () => alamat,
        tiket: TiketTiang((s) async => (tiket: 'tiket-${++tiketKe}', sampai: kini.add(const Duration(hours: 8))), sekarang: () => kini),
        lama: lama ?? ApiClient(client: MockClient((_) async => http.Response('{}', 500))),
        client: klien,
      );
    }

    http.Response json(Map<String, dynamic> j, [int status = 200]) => http.Response(jsonEncode(j), status);

    test('mengirim POST {action, data} ke <alamat>/tiang.php dengan header tiket; jawaban data dikembalikan', () async {
      balasan = [(_) => json({'ok': true, 'data': {'x': 1}})];
      final api = buat();
      expect(api.aktif, isTrue);
      final r = await api.panggil(_sesi(), 'getTiangJalur', {'kode': 'PLS'});
      expect(r, {'x': 1});
      final req = permintaan.single;
      expect(req.url.toString(), 'https://contoh.id/sisi-api/tiang.php');
      expect(req.headers['X-SiSi-Tiket'], 'tiket-1');
      expect(jsonDecode(req.body), {'action': 'getTiangJalur', 'data': {'kode': 'PLS'}});
    });

    test('401 TIKET_KEDALUWARSA / TIKET_TIDAK_VALID: tiket baru SEKALI lalu ulang; tetap 401 = galat', () async {
      balasan = [(_) => json({'ok': false, 'kode': 'TIKET_KEDALUWARSA'}, 401), (_) => json({'ok': true, 'data': {'ok': 'ya'}})];
      final api = buat();
      expect(await api.panggil(_sesi(), 'getSegmen', {}), {'ok': 'ya'});
      expect(permintaan.map((r) => r.headers['X-SiSi-Tiket']), ['tiket-1', 'tiket-2']);

      balasan = [(_) => json({'ok': false, 'kode': 'TIKET_TIDAK_VALID'}, 401), (_) => json({'ok': false, 'kode': 'TIKET_TIDAK_VALID'}, 401)];
      final b = buat();
      await expectLater(b.panggil(_sesi(), 'getSegmen', {}), throwsA(isA<ApiException>().having((e) => e.kode, 'kode', 'TIKET_TIANG_TIDAK_VALID')));
      expect(permintaan.length, 2, reason: 'hanya satu pengulangan');
    });

    test('TIKET_DICABUT dan kode lain tidak diulang; kode diteruskan apa adanya', () async {
      balasan = [(_) => json({'ok': false, 'kode': 'TIKET_DICABUT'}, 401)];
      await expectLater(buat().panggil(_sesi(), 'getSegmen', {}), throwsA(isA<ApiException>().having((e) => e.kode, 'kode', 'TIKET_DICABUT')));
      expect(permintaan.length, 1);
      balasan = [(_) => json({'ok': false, 'kode': 'KONFLIK_REVISION'}, 409)];
      await expectLater(buat().panggil(_sesi(), 'simpanSegmen', {}), throwsA(isA<ApiException>().having((e) => e.kode, 'kode', 'KONFLIK_REVISION')));
    });

    test('422 -> GalatValidasi memuat semua masalah, kolom = isian pertama', () async {
      balasan = [
        (_) => json({
              'ok': false,
              'kode': 'DATA_TIDAK_VALID',
              'galat': [
                {'field': 'jenis', 'pesan': 'Fisik Tiang wajib diisi.'},
                {'field': 'foto', 'pesan': 'Foto Full Tiang wajib diisi.'},
                {'field': 'sirkuit0', 'pesan': 'Segmen wajib diisi.'},
              ]
            }, 422)
      ];
      try {
        await buat().panggil(_sesi(), 'simpanVerifikasiTiang', {});
        fail('harus melempar');
      } on GalatValidasi catch (e) {
        expect(e.galat.map((g) => g.field), ['jenis', 'foto', 'sirkuit0']);
        expect(e.galat[1].pesan, 'Foto Full Tiang wajib diisi.');
        expect([e.kode, e.kolom], ['DATA_TIDAK_VALID', 'jenis']);
      }
    });

    test('bukan JSON: HTTP_<status> bila status bukan 200, RESPON_BUKAN_JSON bila 200', () async {
      balasan = [(_) => http.Response('<html>', 502)];
      await expectLater(buat().panggil(_sesi(), 'getSegmen', {}), throwsA(isA<ApiException>().having((e) => e.kode, 'kode', 'HTTP_502')));
      balasan = [(_) => http.Response('<html>', 200)];
      await expectLater(buat().panggil(_sesi(), 'getSegmen', {}), throwsA(isA<ApiException>().having((e) => e.kode, 'kode', 'RESPON_BUKAN_JSON')));
    });

    test('waktu habis dilempar apa adanya (pemanggil menyimpan draf)', () async {
      final api = TiangApi(
        alamat: () => 'https://contoh.id/sisi-api',
        tiket: TiketTiang((s) async => (tiket: 't', sampai: kini.add(const Duration(hours: 8))), sekarang: () => kini),
        lama: ApiClient(),
        client: MockClient((_) async {
          await Future<void>.delayed(const Duration(milliseconds: 200));
          return http.Response('{}', 200);
        }),
      );
      await expectLater(api.panggil(_sesi(), 'getSegmen', {}, timeout: const Duration(milliseconds: 20)), throwsA(isA<Exception>()));
    });

    test('alamat kosong = diteruskan ke ApiClient lama (token sesi, data sama); aktif false', () async {
      Map<String, dynamic>? diterima;
      final lama = ApiClient(client: MockClient((req) async {
        diterima = jsonDecode(req.body) as Map<String, dynamic>;
        return http.Response(jsonEncode({'ok': true, 'env': Env.name, 'data': {'dari': 'appsscript'}}), 200);
      }));
      balasan = [];
      final api = buat(alamat: '', lama: lama);
      expect(api.aktif, isFalse);
      expect(await api.panggil(_sesi(), 'getSegmen', {'a': 1}), {'dari': 'appsscript'});
      expect(diterima!['action'], 'getSegmen');
      expect(diterima!['token'], 'a' * 64);
      expect(diterima!['data'], {'a': 1});
      expect(permintaan, isEmpty, reason: 'tidak menyentuh Hostinger');
    });

    test('aplikasi wajib update: tulis ditolak sebelum dikirim, baca (get*) tetap boleh', () async {
      balasan = [(_) => json({'ok': true, 'data': {}})];
      final api = buat();
      KunciUpdate.aktif.value = true;
      await expectLater(api.panggil(_sesi(), 'simpanVerifikasiTiang', {}), throwsA(isA<ApiException>().having((e) => e.kode, 'kode', 'UPDATE_APLIKASI_DULU')));
      expect(permintaan, isEmpty);
      expect(await api.panggil(_sesi(), 'getSegmen', {}), isEmpty);
    });
  });

  group('AlamatTiang', () {
    test('diingat di HP: start tanpa sinyal memakai alamat terakhir; info server selalu menang; kosong dari server mematikan', () async {
      final g = _GudangPalsu();
      final a = AlamatTiang(g);
      await a.muat();
      expect(a.nilai, '');
      await a.perbarui(null);
      expect(a.nilai, '', reason: 'tanpa info (ping gagal) tidak mengubah apa pun');
      await a.perbarui('https://contoh.id/sisi-api/');
      expect(a.nilai, 'https://contoh.id/sisi-api');
      final b = AlamatTiang(g);
      await b.muat();
      expect(b.nilai, 'https://contoh.id/sisi-api', reason: 'dimuat dari penyimpanan lokal saat app dibuka');
      await b.perbarui('');
      expect(b.nilai, '');
      final c = AlamatTiang(g);
      await c.muat();
      expect(c.nilai, '', reason: 'dimatikan di server = jalur mundur juga tersimpan');
      await c.perbarui('http://tidak-aman.id/api');
      expect(c.nilai, '', reason: 'bukan https ditolak');
    });
  });
}
