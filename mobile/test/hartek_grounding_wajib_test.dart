import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/hartek/hartek_lokal.dart';
import 'package:sisi_row/features/hartek/hartek_repository.dart';

/// v1.0.38: hasil grounding wajib (aturan HP) hanya untuk daftar pekerjaan tertentu.
void main() {
  test('daftar wajib grounding', () {
    expect(HartekRepository.groundingWajib('Perbaikan Grounding Surge Arrester'), isTrue);
    expect(HartekRepository.groundingWajib(' pemasangan  grounding body trafo '), isTrue);
    expect(HartekRepository.groundingWajib('Pemasangan Grounding Arrester Trafo'), isTrue);
    expect(HartekRepository.groundingWajib('Pasang Grounding Rod'), isFalse);
    expect(HartekRepository.groundingWajib('Perbaikan Grounding TR'), isFalse);
  });

  test('kurang = wajib tanpa hasil grounding', () {
    expect(HartekLokal.groundingKurang({'pekerjaan': 'Perbaikan Grounding GSW', 'grounding': <dynamic>[]}), isTrue);
    expect(HartekLokal.groundingKurang({'pekerjaan': 'Perbaikan Grounding GSW', 'grounding': [{'hasilSesudah': 4}]}), isFalse);
    expect(HartekLokal.groundingKurang({'pekerjaan': 'Pasang Grounding TR', 'grounding': <dynamic>[]}), isFalse);
  });

  test('v1.0.40: Pemerataan / Pembagian Beban Gardu wajib punya hasil pemerataan', () {
    expect(HartekLokal.pemerataanKurang({'pekerjaan': 'Pembagian Beban Gardu', 'pemerataan': <dynamic>[]}), isTrue);
    expect(HartekLokal.pemerataanKurang({'pekerjaan': 'Pemerataan Beban Gardu', 'pemerataan': [{'r1': 10}]}), isFalse);
    expect(HartekLokal.pekerjaanHasilKurang({
      'objek': [
        {'pekerjaan': [
          {'pekerjaan': 'Pemerataan Beban Gardu', 'pemerataan': <dynamic>[]},
          {'pekerjaan': 'Perbaikan Grounding GSW', 'grounding': <dynamic>[]},
        ]}
      ]
    }), 2);
  });
}
