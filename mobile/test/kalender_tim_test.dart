import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/kalender/kalender_tim_screen.dart';
import 'package:sisi_row/widgets/kalender_bulan.dart';

void main() {
  test('v1.0.17 kalender tim: kegiatan per hari jadi tanda berurutan pekerjaan > padam > WO, jenis asing diabaikan', () {
    final t = tandaKalenderTim([
      {'tanggal': '2026-10-21', 'jenis': 'WO'},
      {'tanggal': '2026-10-21', 'jenis': 'PEKERJAAN'},
      {'tanggal': '2026-10-21', 'jenis': 'PADAM'},
      {'tanggal': '2026-10-21', 'jenis': 'PADAM'},
      {'tanggal': '2026-10-22', 'jenis': 'LAIN'},
    ]);
    expect(t.keys, ['2026-10-21']);
    expect([for (final x in t['2026-10-21']!) (x.warna, x.jumlah)],
        [(WarnaKalender.pekerjaan, 1), (WarnaKalender.padam, 2), (WarnaKalender.wo, 1)]);
  });
}
