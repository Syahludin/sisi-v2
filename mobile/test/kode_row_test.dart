import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/row/kode_row.dart';

void main() {
  // 2 Okt 2026 08:00 WIB = 01:00 UTC
  final waktu = DateTime.utc(2026, 10, 2, 1);

  test('format header sesuai PRD', () {
    expect(KodeRow.header(kodeSubTim: '03', waktu: waktu, urut: 1), 'R03-16130261002001');
  });

  test('tanggal pakai WIB, bukan UTC', () {
    // 1 Okt 2026 18:00 UTC = 2 Okt 01:00 WIB
    expect(KodeRow.header(kodeSubTim: '03', waktu: DateTime.utc(2026, 10, 1, 18), urut: 7),
        'R03-16130261002007');
  });

  test('berantai header -> PNY -> EKS', () {
    final h = KodeRow.header(kodeSubTim: '03', waktu: waktu, urut: 1);
    final r = KodeRow.realisasi(h, 2);
    final e = KodeRow.eksekusi(r, 15);
    expect(r, 'R03-16130261002001-PNY.002');
    expect(e, 'R03-16130261002001-PNY.002-EKS.015');
  });

  test('menolak input salah', () {
    expect(() => KodeRow.header(kodeSubTim: '3', waktu: waktu, urut: 1), throwsArgumentError);
    expect(() => KodeRow.header(kodeSubTim: '03', waktu: waktu, urut: 0), throwsRangeError);
    expect(() => KodeRow.header(kodeSubTim: '03', waktu: waktu, urut: 1000), throwsRangeError);
    expect(() => KodeRow.eksekusi('R03-16130261002001', 1), throwsArgumentError);
  });

  test('minta nomor baru: anak ikut induk baru', () {
    const lama = 'R03-16130261002001';
    const baru = 'R03-16130261002004';
    expect(KodeRow.gantiInduk('$lama-PNY.001-EKS.003', lama, baru), '$baru-PNY.001-EKS.003');
    expect(() => KodeRow.gantiInduk('R03-16130261002009-PNY.001', lama, baru), throwsArgumentError);
  });

  test('urut berikutnya dan baca urut header', () {
    expect(KodeRow.urutBerikutnya(4), 5);
    expect(KodeRow.urutHeader('R03-16130261002012'), 12);
    expect(KodeRow.urutHeader('salah'), isNull);
  });
}
