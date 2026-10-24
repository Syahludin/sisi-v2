import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/gardu/gardu_model.dart';
import 'package:sisi_row/features/gardu/gardu_widgets.dart';

/// v1.0.23: Master Gardu blok WBP (kolom lama) + LWBP + cover, tanggal ukur DD MMMM YYYY.
void main() {
  test('tanggal pengukuran gardu DD MMMM YYYY', () {
    expect(tanggalPanjang('2026-10-06'), '06 Oktober 2026');
    expect(tanggalPanjang('2026-12-31T10:00'), '31 Desember 2026');
    expect(tanggalPanjang('Fri Oct 16'), 'Fri Oct 16', reason: 'format lain apa adanya');
  });

  test('Gardu: blok LWBP + cover dari server, tanggal ukur terbaru WBP / LWBP', () {
    final g = Gardu.dariJson({
      'id': 'g1',
      'no': 'TB0001',
      'tglUkur': '2026-10-01',
      'waktuBeban': 'WBP',
      'lwbp': {'tglUkur': '2026-10-05', 'kodeUkur': 'IGD-1', 'persen': 40, 'ukur': {'bebanR': 70}},
      'cover': {'tanggal': '2026-10-05', 'coverFcoAtas': 'Lengkap'},
    });
    expect(g.lwbp?['kodeUkur'], 'IGD-1');
    expect(g.cover?['coverFcoAtas'], 'Lengkap');
    expect(g.tglUkurTerbaru, '2026-10-05');
    expect(Gardu.dariJson({'id': 'g2', 'no': 'TB0002', 'tglUkur': '2026-10-01'}).tglUkurTerbaru, '2026-10-01');
    expect(g.denganUkurTerbaru(tglUkur: '2026-10-07').lwbp?['kodeUkur'], 'IGD-1', reason: 'salinan membawa blok LWBP');
  });
}
