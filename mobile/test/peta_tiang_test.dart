import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:sisi_row/features/tiang/peta_tiang.dart';

void main() {
  final json = <String, dynamic>{
    'titik': [
      {'tiangId': 'a', 'nama': 'PLS0001', 'kode': 'PLS', 'lat': -3.0, 'lng': 106.5, 'penyulang': ['TOBOALI 1']},
      {'tiangId': 'b', 'nama': 'PLS0002', 'kode': 'PLS', 'lat': -3.0, 'lng': 106.501, 'penyulang': ['TOBOALI 1', 'PAYUNG']},
      {'tiangId': 'c', 'nama': 'PLS0003', 'kode': 'PLS', 'lat': null, 'lng': null, 'penyulang': []},
    ],
    'garis': [
      {'tiangId': 'b', 'indukTiangId': 'a', 'penyulang': 'TOBOALI 1'},
      {'tiangId': 'b', 'indukTiangId': 'a', 'penyulang': 'PAYUNG'},
      {'tiangId': 'b', 'indukTiangId': 'x', 'penyulang': 'TOBOALI 1'},
    ],
    'tanpaKoordinat': 2,
  };

  test('PetaTiang: titik tanpa koordinat dan garis ke induk yang tidak ada dilewati', () {
    final p = PetaTiang.dariJson(json);
    expect(p.titik.map((t) => t.id), ['a', 'b']);
    expect(p.ruas.length, 2);
    expect(p.ruas.first.dari, const LatLng(-3.0, 106.5));
    expect(p.tanpaKoordinat, 2);
  });

  test('PetaTiang: saringan penyulang tidak peduli huruf besar; tiang ganda ikut dua penyulang', () {
    final p = PetaTiang.dariJson(json);
    expect(p.titikUntuk('').length, 2);
    expect(p.titikUntuk('payung').map((t) => t.id), ['b']);
    expect(p.ruasUntuk('toboali 1').length, 1);
    expect(p.ruasUntuk('PAYUNG').single.penyulang, 'PAYUNG');
  });

  test('PetaTiang: terdekat dalam batas meter', () {
    final p = PetaTiang.dariJson(json);
    expect(p.terdekat(const LatLng(-3.0, 106.50005), 10)?.id, 'a');
    expect(p.terdekat(const LatLng(-3.01, 106.5), 10), isNull);
  });

  test('warnaPenyulang: tetap menurut urutan daftar, tanpa beda huruf', () {
    expect(warnaPenyulang(['A', 'B'], 'b'), warnaPenyulang(['A', 'B'], 'B'));
    expect(warnaPenyulang(['A', 'B'], 'A'), isNot(warnaPenyulang(['A', 'B'], 'B')));
  });
}
