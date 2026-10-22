import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/core/kode_error.dart';

/// v0.62.4: profil akun berubah = sesi habis; ApiClient memberi tahu app dari layar mana pun (termasuk admin).
void main() {
  ApiClient klien(String kode) =>
      ApiClient(client: MockClient((_) async => http.Response(jsonEncode({'ok': false, 'kode': kode}), 200)));

  test('kode profil berubah termasuk sesi habis', () {
    for (final k in ['TIM_NONAKTIF', 'ROLE_TIDAK_VALID', 'PETUGAS_TANPA_TIM', 'SESI_KEDALUWARSA']) {
      expect(KodeError.sesiHabis.contains(k), isTrue, reason: k);
      expect(KodeError.pesan(k), isNot(contains('($k)')), reason: k);
    }
    expect(KodeError.sesiHabis.contains('LOGIN_GAGAL'), isFalse);
  });

  test('onSesiHabis hanya untuk panggilan bertoken dengan kode sesi habis', () async {
    final dipanggil = <String>[];
    final a = klien('TIM_NONAKTIF')..onSesiHabis = (k, _) => dipanggil.add(k);
    await expectLater(a.call('getLaporanUp3', token: 'a' * 64), throwsA(isA<ApiException>()));
    expect(dipanggil, ['TIM_NONAKTIF']);

    await expectLater(a.call('login'), throwsA(isA<ApiException>()));
    expect(dipanggil.length, 1, reason: 'login (tanpa token) tidak memicu');

    final b = klien('TERLALU_SERING')..onSesiHabis = (k, _) => dipanggil.add(k);
    await expectLater(b.call('syncRow', token: 'a' * 64), throwsA(isA<ApiException>()));
    expect(dipanggil.length, 1, reason: 'bukan kode sesi habis');
  });
}
