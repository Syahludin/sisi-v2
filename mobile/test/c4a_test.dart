import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/operasi/laporan_up3_repository.dart';

void main() {
  test('kmS = tiang x 0,05 gaya Indonesia (sama dengan teks WA server)', () {
    expect(C4aItem.kmsTeks(87), '4,35');
    expect(C4aItem.kmsTeks(40), '2,00');
    expect(C4aItem.kmsTeks(0), '0,00');
  });

  test('dariJson toleran angka double / kosong; keServer tanpa nama penyulang/section', () {
    final c = C4aItem.dariJson({
      'id': 'a',
      'sectionId': 's',
      'penyulang': 'TB-01',
      'section': 'Rias',
      'jumlahTiang': 40.0,
      'temuanPeralatan': 1,
      'eksekusi': null,
    });
    expect(c.jumlahTiang, 40);
    expect(c.temuanRow, 0);
    expect(c.eksekusi, 0);
    expect(c.temuan, 1);
    expect(c.keServer(), {'id': 'a', 'sectionId': 's', 'jumlahTiang': 40, 'temuanPeralatan': 1, 'temuanRow': 0, 'eksekusi': 0});
  });

  test('C4A UP3: kmS koma maks 2 desimal, baca "4,6" / "4.6", teks kosong tidak dikirim', () {
    expect(C4aUp3Item.angkaKoma(4.6), '4,6');
    expect(C4aUp3Item.angkaKoma(4), '4');
    expect(C4aUp3Item.angkaKoma(4.355), '4,36');
    expect(C4aUp3Item.bacaKms('4,6'), 4.6);
    expect(C4aUp3Item.bacaKms(' 12.25 '), 12.25);
    for (final salah in ['', '4,567', 'abc', '1.2.3', '-1', '1000']) {
      expect(C4aUp3Item.bacaKms(salah), isNull, reason: salah);
    }
    final c = C4aUp3Item.dariJson({'id': 'a', 'penyulang': 'TB-01', 'realisasiKms': 4, 'temuan': 'Layangan', 'eksekusi': 'Yantek'});
    expect(c.realisasiKms, 4.0);
    expect(c.tindakLanjut, '');
    expect(c.keServer(), {'id': 'a', 'penyulang': 'TB-01', 'realisasiKms': 4.0, 'temuan': 'Layangan', 'eksekusi': 'Yantek'});
  });
}
