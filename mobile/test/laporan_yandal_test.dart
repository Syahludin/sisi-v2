import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/operasi/laporan_yandal_repository.dart';

/// v0.99.0: Laporan per Tim Yandal (admin), bentuk jawaban getLaporanTimYandal.
void main() {
  Map<String, Object?> shift(int no, String status, {List<Map<String, Object?>> p0 = const [], Map<String, Object?> rekap = const {}}) => {
        'no': no, 'jam': '08:00 - 16:00', 'status': status, 'menitBelumLogin': status == 'BELUM_LOGIN' ? 95 : 0,
        'petugas': ['Andi', 'Budi'], 'checkIn': '2026-10-18 08:05:00', 'terlambat': 5, 'jumlahLogin': 2, 'hpAktif': 1,
        'login': [
          {'waktuMasuk': '2026-10-18 08:05:00', 'perangkat': 'HP Uji', 'aktif': true},
          {'waktuMasuk': '2026-10-18 08:01:00', 'perangkat': 'HP Lama', 'waktuLogout': '2026-10-18 08:04:00', 'aktif': false},
        ],
        'rekap': rekap, 'p0': p0,
      };

  test('v0.99.0: LaporanYandal.dariJson: ringkas, tim, shift, login, rekap, tahap P0', () {
    final l = LaporanYandal.dariJson({
      'tanggal': '2026-10-18', 'hari': 'Minggu',
      'sekarang': {'no': 1, 'tanggal': '2026-10-18', 'jam': '08:00 - 16:00'},
      'ringkas': {'shift': 1, 'jam': '08:00 - 16:00', 'jumlahTim': 5, 'sudahLogin': 3, 'belumLogin': 2},
      'tim': [
        {
          'timId': 't13', 'nama': 'YANDAL 13', 'kode': '13', 'petugasAktif': 8,
          'shift': [
            shift(1, 'LOGIN', rekap: {'jumlahP0': 3, 'menunggu': 1, 'approved': 1, 'totalPoint': 12.5}, p0: [
              {'kodeP0': 'P0.001', 'namaPekerjaan': 'Pengecekan Gardu', 'statusP0': 'SELESAI', 'statusApproval': 'Menunggu'},
              {'kodeP0': 'P0.002', 'statusP0': 'SELESAI', 'statusApproval': 'Approved', 'point': 12.5},
              {'kodeP0': 'P0.003', 'statusP0': 'PROSES', 'statusApproval': 'Rejected', 'alasanRejected': 'P0 Tidak Selesai'},
              {'kodeP0': 'P0.004', 'statusP0': 'PROSES', 'statusApproval': ''},
            ]),
            shift(2, 'BELUM_MULAI'),
            shift(3, 'BELUM_MULAI'),
          ],
        },
        {'timId': 't14', 'nama': 'YANDAL 14', 'shift': [shift(1, 'BELUM_LOGIN')]},
      ],
    });
    expect([l.tanggal, l.hariIni, l.shiftSekarang, l.ringkas!.sudahLogin, l.ringkas!.belumLogin], ['2026-10-18', true, 1, 3, 2]);
    final t = l.timDengan('t13')!;
    final s = t.shiftKe(1)!;
    expect([t.petugasAktif, t.totalP0, t.totalMenunggu, s.masuk, s.petugas, s.hpAktif, s.login.length, s.login.first.aktif],
        [8, 3, 1, true, ['Andi', 'Budi'], 1, 2, true]);
    expect(s.rekap.totalPoint, 12.5);
    expect(s.p0.map((p) => p.tahap), ['MENUNGGU', 'APPROVED', 'REJECTED', 'PROSES']);
    expect(s.p0[1].point, 12.5);
    final b = l.timDengan('t14')!.shiftKe(1)!;
    expect([b.masuk, b.menitBelumLogin, l.timDengan('t14')!.shiftKe(2)], [false, 95, null]);
    expect(l.timDengan('x'), isNull);
  });

  test('v0.99.0: StatusLoginYandal label + masuk, jawaban kosong aman', () {
    expect(StatusLoginYandal.label('LOGIN'), 'Sudah login');
    expect(StatusLoginYandal.label('TIDAK_LOGIN'), 'Tidak login');
    expect(StatusLoginYandal.label('apa'), 'Belum mulai');
    expect([StatusLoginYandal.masuk('LOGIN'), StatusLoginYandal.masuk('SELESAI'), StatusLoginYandal.masuk('BELUM_LOGIN')], [true, true, false]);
    final k = LaporanYandal.dariJson(const {});
    expect([k.tim, k.ringkas, k.hariIni], [<TimLaporanYandal>[], null, false]);
  });
}
