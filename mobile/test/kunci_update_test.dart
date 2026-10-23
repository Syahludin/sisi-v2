import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/core/env.dart';
import 'package:sisi_row/core/kunci_update.dart';

/// v1.0.22: kartu wajib update ditutup = baca tetap jalan, tulis ditolak sebelum dikirim; revisi master dari server.
void main() {
  tearDown(() => KunciUpdate.aktif.value = false);

  test('kunci update: baca / sesi boleh, tulis ditolak di HP (tidak sampai server)', () async {
    expect(['getMaster', 'getRiwayatGardu', 'ping', 'cekSesi', 'logout', 'getUpdateApp'].every(KunciUpdate.bolehAksi), isTrue);
    expect(['syncRow', 'simpanTemuanInspeksi', 'teruskanWo', 'updateUkurMasterGardu', 'gantiPassword'].any(KunciUpdate.bolehAksi), isFalse);
    var terkirim = 0;
    final api = ApiClient(client: MockClient((_) async {
      terkirim++;
      return http.Response(jsonEncode({'ok': true, 'env': Env.name, 'data': {}}), 200);
    }));
    KunciUpdate.aktif.value = true;
    await expectLater(api.call('simpanTemuanInspeksi', token: 'a' * 64),
        throwsA(isA<ApiException>().having((e) => e.kode, 'kode', 'UPDATE_APLIKASI_DULU')));
    expect(terkirim, 0);
    await api.call('getMaster', token: 'a' * 64);
    expect(terkirim, 1);
    KunciUpdate.aktif.value = false;
    await api.call('simpanTemuanInspeksi', token: 'a' * 64);
    expect(terkirim, 2);
  });

  test('revisi master di jawaban server memicu onMasterServer', () async {
    final revisi = <String>[];
    final api = ApiClient(client: MockClient((_) async =>
        http.Response(jsonEncode({'ok': true, 'env': Env.name, 'data': {}, 'master': '2026-10-23T05:00:00.000Z'}), 200)))
      ..onMasterServer = revisi.add;
    await api.call('ping');
    expect(revisi, ['2026-10-23T05:00:00.000Z']);
  });
}
