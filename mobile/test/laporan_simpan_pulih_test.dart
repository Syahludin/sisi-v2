import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/operasi/laporan_up3_repository.dart';

/// v0.62.9: simpan Laporan UP3 / UIW aman diulang (server menulis C4A dulu, baris harian + revision terakhir).
class _ApiPalsu extends ApiClient {
  _ApiPalsu(this.jawab);
  final FutureOr<Map<String, dynamic>> Function(String action, Map<String, dynamic> data) jawab;
  final panggil = <String>[];
  final payload = <Map<String, dynamic>>[];

  @override
  Future<Map<String, dynamic>> call(String action, {String? token, Map<String, dynamic> data = const {}, Duration? timeout}) async {
    panggil.add(action);
    payload.add(data);
    return jawab(action, data);
  }
}

final _sesi = Sesi(token: 't', profil: const {'userId': 'u', 'username': 'a', 'role': 'ADMIN'}, menu: const [], offlineSampai: DateTime(2030));
Future<void> _tanpaJeda(Duration _) async {}

void main() {
  const item = C4aUp3Item(id: 'a', penyulang: 'TB-01', realisasiKms: 4.57, temuan: 'Pohon');
  final data = LaporanUp3Repository.dataUp3(tanggal: '2026-10-07', revision: 1, c4a: [item]);
  Map<String, dynamic> server({required int rev, bool tertunda = false, List<Map<String, dynamic>>? c4a}) => {
        'revision': rev,
        'tertunda': tertunda,
        'c4a': c4a ?? [{'id': 'a', 'penyulang': 'TB-01', 'realisasiKms': 4.57, 'temuan': 'Pohon', 'tindakLanjut': '', 'eksekusi': '', 'keterangan': ''}],
      };

  test('timeout lalu berhasil: payload dikirim ulang persis sama (revision sama)', () async {
    var n = 0;
    final api = _ApiPalsu((a, d) {
      if (n++ == 0) throw TimeoutException('uji');
      return server(rev: 2);
    });
    final h = await LaporanUp3Repository(api).simpanPulih(_sesi, 'UP3', data, tunda: _tanpaJeda);
    expect(h['revision'], 2);
    expect(api.panggil, ['simpanLaporanUp3', 'simpanLaporanUp3']);
    expect(api.payload[1], same(api.payload[0]));
  });

  test('respons hilang (simpan sebenarnya masuk): KONFLIK lalu isi server sama = berhasil, tanpa simpan lagi', () async {
    var n = 0;
    final api = _ApiPalsu((a, d) {
      if (a == 'getLaporanUp3') return server(rev: 2);
      if (n++ == 0) throw ApiException('HTTP_502');
      throw ApiException('KONFLIK_REVISION');
    });
    final h = await LaporanUp3Repository(api).simpanPulih(_sesi, 'UP3', data, tunda: _tanpaJeda);
    expect(h['revision'], 2);
    expect(api.panggil, ['simpanLaporanUp3', 'simpanLaporanUp3', 'getLaporanUp3']);
  });

  test('KONFLIK setelah gagal, isi sama tapi masih tertunda = dikunci sekali dengan revision server', () async {
    var n = 0;
    final api = _ApiPalsu((a, d) {
      if (a == 'getLaporanUp3') return server(rev: 3, tertunda: true);
      n++;
      if (n == 1) throw ApiException('KESALAHAN_SERVER');
      if (n == 2) throw ApiException('KONFLIK_REVISION');
      return server(rev: 4);
    });
    final h = await LaporanUp3Repository(api).simpanPulih(_sesi, 'UP3', data, tunda: _tanpaJeda);
    expect(h['revision'], 4);
    expect(api.payload.last['revision'], 3);
  });

  test('KONFLIK setelah gagal tapi isi server beda (admin lain) = KONFLIK diteruskan', () async {
    var n = 0;
    final api = _ApiPalsu((a, d) {
      if (a == 'getLaporanUp3') return server(rev: 2, c4a: const []);
      if (n++ == 0) throw TimeoutException('uji');
      throw ApiException('KONFLIK_REVISION');
    });
    await expectLater(LaporanUp3Repository(api).simpanPulih(_sesi, 'UP3', data, tunda: _tanpaJeda),
        throwsA(isA<ApiException>().having((e) => e.kode, 'kode', 'KONFLIK_REVISION')));
  });

  test('KONFLIK langsung (tanpa gagal sebelumnya) tidak dimuat ulang; galat validasi tidak diulang', () async {
    final api = _ApiPalsu((a, d) => throw ApiException('KONFLIK_REVISION'));
    await expectLater(LaporanUp3Repository(api).simpanPulih(_sesi, 'UP3', data, tunda: _tanpaJeda), throwsA(isA<ApiException>()));
    expect(api.panggil, ['simpanLaporanUp3']);
    final api2 = _ApiPalsu((a, d) => throw ApiException('PENYULANG_TIDAK_ADA'));
    await expectLater(LaporanUp3Repository(api2).simpanPulih(_sesi, 'UP3', data, tunda: _tanpaJeda), throwsA(isA<ApiException>()));
    expect(api2.panggil.length, 1);
  });

  test('gagal jaringan terus = berhenti setelah 2 kali ulang', () async {
    final api = _ApiPalsu((a, d) => throw TimeoutException('uji'));
    await expectLater(LaporanUp3Repository(api).simpanPulih(_sesi, 'UP3', data, tunda: _tanpaJeda), throwsA(isA<TimeoutException>()));
    expect(api.panggil.length, 3);
  });

  test('isiSama UIW: cuaca ikut dibandingkan, urutan C4A tidak berpengaruh', () {
    const a = C4aItem(id: 'a', sectionId: 's1', penyulang: 'TB-01', section: 'X', jumlahTiang: 10);
    const b = C4aItem(id: 'b', sectionId: 's2', penyulang: 'TB-02', section: 'Y', jumlahTiang: 5, temuanRow: 1);
    final kirim = LaporanUp3Repository.dataUiw(tanggal: '2026-10-07', revision: 0, cuaca: 'Cerah', c4a: [a, b]);
    Map<String, dynamic> j(C4aItem c) => {...c.keServer(), 'penyulang': c.penyulang, 'section': c.section};
    expect(LaporanUp3Repository.isiSama('UIW', kirim, {'cuaca': 'Cerah', 'c4a': [j(b), j(a)]}), isTrue);
    expect(LaporanUp3Repository.isiSama('UIW', kirim, {'cuaca': 'Hujan', 'c4a': [j(a), j(b)]}), isFalse);
    expect(LaporanUp3Repository.isiSama('UIW', kirim, {'cuaca': 'Cerah', 'c4a': [j(a)]}), isFalse);
  });
}
