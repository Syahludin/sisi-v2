import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/yandal/arsip_p0_view.dart' show angkaPoint;
import 'package:sisi_row/features/yandal/rank_yandal.dart';
import 'package:sisi_row/features/yandal/yandal_arsip_repository.dart';

/// v0.63.5: Arsip P0 (tahun > bulan > tanggal > shift) dan Rank Yandal di Beranda (logika murni).
void main() {
  Map<String, dynamic> sh(String tgl, int no, {int p0 = 0, int ok = 0, num point = 0}) => {
        'shiftId': '$tgl-$no',
        'tanggal': tgl,
        'shift': no,
        'rekap': {'jumlahP0': p0, 'approved': ok, 'totalPoint': point},
      };

  test('arsip dikelompokkan tahun > bulan > tanggal > shift, urutan terbaru tetap', () {
    final g = kelompokArsipYandal([sh('2026-10-08', 2), sh('2026-10-08', 1), sh('2026-10-01', 3), sh('2026-09-30', 1), sh('2025-12-31', 2)]);
    expect(g.keys, ['2026', '2025']);
    expect(g['2026']!.keys, ['2026-10', '2026-09']);
    expect(g['2026']!['2026-10']!.keys, ['2026-10-08', '2026-10-01']);
    expect(g['2026']!['2026-10']!['2026-10-08']!.map((x) => x['shift']), [2, 1]);
  });

  test('ringkasan rekap beberapa shift: jumlah P0, approved, point', () {
    final (p0, ok, point) = jumlahRekapYandal([sh('2026-10-08', 1, p0: 3, ok: 2, point: 7.5), sh('2026-10-08', 2, p0: 1, ok: 1, point: 4)]);
    expect([p0, ok, point], [4, 3, 11.5]);
    expect(angkaPoint(11.5), '11.5');
    expect(angkaPoint(12.0), '12');
  });

  test('rank di beranda: 5 teratas + crew shift ini yang di luar 5 besar', () {
    final semua = [for (var i = 1; i <= 8; i++) <String, dynamic>{'petugasId': 'p$i', 'nama': 'P$i', 'rank': i}];
    final t = barisRankTampil(semua, {'p2', 'p7'});
    expect(t.atas.map((p) => p['petugasId']), ['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(t.crew.map((p) => p['petugasId']), ['p7'], reason: 'p2 sudah di 5 besar');
    expect(barisRankTampil(const [], {'p1'}).atas, isEmpty);
  });

  test('crew sesi dari petugas yang dipilih saat login; periode = bulan WIB', () {
    final s = Sesi.dariLogin({
      'token': 'e' * 64,
      'profil': {'userId': 'u', 'username': '16130.yandal13', 'role': 'PETUGAS', 'jenisTim': 'YANDAL'},
      'menu': <dynamic>[],
      'offlineSampai': '2026-10-08T08:59:00.000Z',
      'yandal': {
        'petugas': [
          {'petugasId': 'p3', 'nama': 'Candra'},
          {'petugasId': 'p1', 'nama': 'Andi'},
        ],
      },
    });
    expect(crewSesi(s), {'p3', 'p1'});
    expect(periodeYandal(DateTime.utc(2026, 10, 31, 17, 30)), '2026-11', reason: '00:30 WIB 1 Nov');
    expect(periodeYandal(DateTime.utc(2026, 10, 31, 16, 59)), '2026-10');
  });
}
