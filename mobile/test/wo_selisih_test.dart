import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/wo/wo_selisih.dart';

Map<String, dynamic> t(String id, String tanggal, String status) =>
    {'temuanId': id, 'kodeTemuan': 'K-$id', 'tanggal': tanggal, 'wo': {'status': status}};

Map<String, dynamic> ringkas([int baru = 0, int terkirim = 0]) =>
    {'baru': baru, 'terkirim': terkirim, 'dikerjakan': 0, 'selesai': 0, 'ganda': 0};

void main() {
  test('v1.0.58 gabungSelisihWo: selisih menimpa, menambah, menjaga yang tak berubah; ringkas, tim, kursor dari selisih', () {
    final lokal = <String, dynamic>{
      'status': 'SEMUA', 'kursor': 'k1', 'ringkas': ringkas(2), 'tim': [{'timId': 't1'}],
      'temuan': [t('a', '2026-11-01', ''), t('b', '2026-11-03', '')],
    };
    final selisih = <String, dynamic>{
      'status': 'SEMUA', 'selisih': true, 'kursor': 'k2', 'ringkas': ringkas(2, 1), 'tim': [{'timId': 't1'}, {'timId': 't2'}],
      'temuan': [t('a', '2026-11-01', 'TERKIRIM'), t('c', '2026-11-04', '')],
    };
    final h = gabungSelisihWo(lokal, selisih);
    final temuan = (h['temuan'] as List).cast<Map<String, dynamic>>();
    expect(temuan.map((x) => [x['temuanId'], (x['wo'] as Map)['status']]).toList(),
        [['c', ''], ['b', ''], ['a', 'TERKIRIM']], reason: 'tanggal turun');
    expect(h['kursor'], 'k2');
    expect(h['ringkas'], selisih['ringkas']);
    expect((h['tim'] as List).length, 2);
    expect((lokal['temuan'] as List).length, 2, reason: 'argumen tidak diubah');
  });

  test('v1.0.58 gabungSelisihWo: tanggal sama diurut kodeTemuan turun; tanpa lokal = isi selisih', () {
    final h = gabungSelisihWo(null, {'kursor': 'k', 'ringkas': ringkas(), 'tim': [], 'temuan': [t('a', '2026-11-01', ''), t('b', '2026-11-01', '')]});
    expect((h['temuan'] as List).map((x) => (x as Map)['temuanId']).toList(), ['b', 'a']);
    expect(gabungSelisihWo({'temuan': []}, {'kursor': 'k', 'ringkas': ringkas(), 'tim': [], 'temuan': []})['temuan'], isEmpty);
  });

  test('v1.0.58 saringStatusWo: BARU / TERKIRIM / DIKERJAKAN / SELESAI / AKTIF / SEMUA sama dengan aturan server', () {
    final d = [t('a', 'x', ''), t('b', 'x', 'TERKIRIM'), t('c', 'x', 'DIKERJAKAN'), t('d', 'x', 'SELESAI'), {'temuanId': 'e'}];
    String id(String s) => saringStatusWo(d, s).map((x) => x['temuanId']).join();
    expect(['BARU', 'TERKIRIM', 'DIKERJAKAN', 'SELESAI', 'AKTIF', 'SEMUA', ''].map(id).toList(),
        ['ae', 'b', 'c', 'd', 'abce', 'abcde', 'abcde']);
  });
}
