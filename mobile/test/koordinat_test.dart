import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/row/kode_row.dart';
import 'package:sisi_row/features/row/row_model.dart';

void main() {
  group('Koordinat.cek', () {
    test('kosong boleh kalau tidak wajib', () {
      expect(Koordinat.cek(''), isNull);
      expect(Koordinat.cek(null), isNull);
    });
    test('kosong ditolak kalau wajib', () {
      expect(Koordinat.cek('  ', wajib: true), 'Wajib diisi');
    });
    test('format lat, lng valid', () {
      expect(Koordinat.cek('-3.012345, 106.512345'), isNull);
      expect(Koordinat.cek('-3.01,106.51'), isNull);
    });
    test('format salah ditolak', () {
      expect(Koordinat.cek('-3.01 106.51'), startsWith('Format'));
      expect(Koordinat.cek('abc'), startsWith('Format'));
    });
    test('di luar Babel ditolak', () {
      expect(Koordinat.cek('-6.2, 106.8'), 'Di luar area Bangka Belitung');
      expect(Koordinat.cek('3.01, 106.51'), 'Di luar area Bangka Belitung');
    });
    test('format 6 desimal', () {
      expect(Koordinat.format(-3.01, 106.5), '-3.010000, 106.500000');
    });
  });

  group('KodeRow.urutAnak', () {
    test('PNY dan EKS', () {
      expect(KodeRow.urutAnak('R03-16130261002001-PNY.002'), 2);
      expect(KodeRow.urutAnak('R03-16130261002001-PNY.002-EKS.015'), 15);
    });
    test('header bukan kode anak', () {
      expect(KodeRow.urutAnak('R03-16130261002001'), isNull);
    });
    test('urutHeader', () {
      expect(KodeRow.urutHeader('R03-16130261002007'), 7);
      expect(KodeRow.urutHeader('R03-16130261002001-PNY.001'), isNull);
    });
  });
}
