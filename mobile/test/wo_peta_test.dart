import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/wo/wo_peta.dart';

Map<String, dynamic> _wo(String id, String status, String koordinat) => {'temuanId': id, 'koordinat': koordinat, 'wo': {'status': status}};

void main() {
  test('titik WO: koordinat sah, kosong / rusak / 0,0 / di luar bumi = null', () {
    expect(titikWo(_wo('1', 'TERKIRIM', '-3.012345, 106.5'))?.latitude, -3.012345);
    for (final k in ['', 'abc', '0, 0', '-95, 106', '-3.1;106']) {
      expect(titikWo(_wo('1', 'TERKIRIM', k)), isNull, reason: k);
    }
  });

  test('peta WO: hanya WO belum selesai (baru + dikerjakan) yang punya titik, urutan asli', () {
    final semua = [
      _wo('a', 'TERKIRIM', '-3.0, 106.0'), _wo('b', 'DIKERJAKAN', '-3.1, 106.1'), _wo('c', 'SELESAI', '-3.2, 106.2'),
      _wo('d', 'TERKIRIM', ''), _wo('e', '', '-3.3, 106.3'),
    ];
    expect([for (final t in woBelumSelesaiBerpeta(semua)) t['temuanId']], ['a', 'b', 'e']);
  });
}
