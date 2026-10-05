import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/gps.dart';

void main() {
  test('gabung: kosong = null', () {
    expect(Gps.gabung([]), isNull);
  });

  test('gabung: akurasi = sampel terbaik, titik condong ke sampel paling akurat', () {
    final t = Gps.gabung([
      (lat: -3.000000, lng: 106.000000, akurasi: 4),
      (lat: -3.000020, lng: 106.000020, akurasi: 8),
      (lat: -3.010000, lng: 106.010000, akurasi: 40), // jauh di luar kandidat (akurasi > 2x terbaik)
    ])!;
    expect(t.akurasi, 4);
    expect(t.sampel, 2);
    expect(Gps.jarakM(t.lat, t.lng, -3.0, 106.0), lessThan(1.5));
  });

  test('gabung: pencilan dibuang walau akurasinya bagus', () {
    final t = Gps.gabung([
      (lat: -3.000000, lng: 106.000000, akurasi: 4),
      (lat: -3.000005, lng: 106.000005, akurasi: 4),
      (lat: -3.000003, lng: 106.000002, akurasi: 5),
      (lat: -3.000400, lng: 106.000400, akurasi: 5), // ~60 m dari yang lain
    ])!;
    expect(t.sampel, 3);
    expect(Gps.jarakM(t.lat, t.lng, -3.000003, 106.000003), lessThan(2));
  });

  test('jarakM: 0.0001 derajat lintang ~ 11 m', () {
    expect(Gps.jarakM(-3.0, 106.0, -3.0001, 106.0), closeTo(11.1, 0.2));
  });

  test('gabung: akurasi 0 / tidak valid dibuang (v0.41.1)', () {
    final t = Gps.gabung([
      (lat: -3.000000, lng: 106.000000, akurasi: 0),
      (lat: -3.000100, lng: 106.000100, akurasi: 6),
      (lat: 0, lng: 0, akurasi: 3),
      (lat: -3.000100, lng: 106.000100, akurasi: double.infinity),
    ])!;
    expect(t.akurasi, 6);
    expect(t.sampel, 1);
    expect(Gps.gabung([(lat: -3.0, lng: 106.0, akurasi: 0)]), isNull);
  });
}
