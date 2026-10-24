import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/operasi/pemakaian_model.dart';

void main() {
  // v0.84.0: kartu Pemakaian Server
  test('tingkat + angka gaya Indonesia', () {
    expect([tingkatPakai(10), tingkatPakai(80), tingkatPakai(94.9), tingkatPakai(95)],
        [TingkatPakai.aman, TingkatPakai.waspada, TingkatPakai.waspada, TingkatPakai.bahaya]);
    expect([angkaId(20000), angkaId(12.5), angkaId(1234567), angkaId(0)], ['20.000', '12,5', '1.234.567', '0']);
  });

  test('dariJson: tiga batang, rem, fungsi terberat, riwayat', () {
    final r = RingkasPakai.dariJson({
      'tanggal': '2026-10-10',
      'paket': 'GMAIL',
      'status': 'WASPADA',
      'pemicu': {
        'menit': 76.5, 'batasMenit': 90, 'persen': 85, 'jalan': 200,
        'perFungsi': [{'nama': 'ADMIN_pengingatYandal', 'menit': 40}, {'nama': 'ADMIN_rekapShiftYandal', 'menit': 20}],
        'direm': {'ADMIN_migrasiFoto': 2},
      },
      'urlFetch': {'jumlah': 300, 'batas': 20000, 'persen': 1.5, 'pdf': 4, 'fcm': 30},
      'pdfBulan': {'request': 40, 'vcpuDetik': 400, 'batasVcpuDetik': 180000, 'persen': 0.2},
      'riwayat': [{'tanggal': '2026-10-10', 'pemicuPersen': 85}, {'tanggal': '2026-10-09', 'pemicuPersen': 10}],
    });
    expect(r.status, TingkatPakai.waspada);
    expect(r.baris.map((b) => b.tingkat), [TingkatPakai.waspada, TingkatPakai.aman, TingkatPakai.aman]);
    expect(r.baris.first.rasio, closeTo(0.85, 0.001));
    expect(r.direm, ['Salin foto ROW 2x']);
    expect(r.fungsiTerberat, ['Pengingat Yandal 40 mnt', 'Rekap Yandal 20 mnt']);
    expect(r.riwayat.map((x) => x.tanggal), ['2026-10-10', '2026-10-09']);
    expect(RingkasPakai.dariJson(const {}).baris.length, 3);
    expect(r.cloudRun, isNull);
  });

  // v0.85.0: Cloud Run per layanan
  test('cloudRun: total vs gratis, per layanan + label, status gabungan, belum tersambung', () {
    final r = RingkasPakai.dariJson({
      'status': 'AMAN',
      'cloudRun': {
        'aktif': true, 'proyek': 'db-sisi-toboali', 'bulan': '2026-10', 'persenMaks': 82,
        'gratis': {'request': 2000000, 'vcpuDetik': 180000, 'gibDetik': 360000},
        'persen': {'request': 1, 'vcpuDetik': 82, 'gibDetik': 41},
        'total': {'hariIni': {'request': 9}, 'bulan': {'request': 20000, 'vcpuDetik': 147600, 'gibDetik': 147600}},
        'layanan': [
          {'nama': 'sisi2-pdf-production', 'hariIni': {'request': 5}, 'bulan': {'request': 19000, 'vcpuDetik': 147000, 'gibDetik': 73500}, 'persenVcpu': 81.67},
          {'nama': 'sisi2-pdf-staging', 'hariIni': {'request': 4}, 'bulan': {'request': 1000, 'vcpuDetik': 600, 'gibDetik': 300}, 'persenVcpu': 0.33},
          {'nama': 'ba-pdf-engine', 'bulan': {'request': 0}},
        ],
      },
    });
    final c = r.cloudRun!;
    expect(c.aktif, isTrue);
    expect(c.baris.map((b) => b.judul), ['vCPU-detik', 'Memori GiB-detik', 'Request']);
    expect(c.baris.first.tingkat, TingkatPakai.waspada);
    expect(c.layanan.map((l) => l.label), ['PDF BA v2 · production', 'PDF BA v2 · staging', 'PDF BA v1']);
    expect(c.requestHari, 9);
    expect(r.statusGabung, TingkatPakai.waspada);
    final mati = RingkasPakai.dariJson({'cloudRun': {'aktif': false, 'pesan': 'CLOUD_RUN_PROJECT belum diisi'}}).cloudRun!;
    expect([mati.aktif, mati.pesan], [false, 'CLOUD_RUN_PROJECT belum diisi']);
  });

  // v1.0.31: kartu Firebase
  test('fcm: jatah harian, gagal, ditolak = bahaya, backend lama = null', () {
    final f = RingkasPakai.dariJson({
      'fcm': {'kirim': 3300, 'batas': 4000, 'persen': 82.5, 'gagal': 4, 'ditolak': 0, 'bulan': 9000},
    }).fcm!;
    expect([f.baris.dipakai, f.baris.batas, f.baris.catatan, f.bulan, f.tingkat], [3300, 4000, '4 gagal', 9000, TingkatPakai.waspada]);
    expect(f.baris.rasio, closeTo(.825, .001));
    final tolak = RingkasPakai.dariJson({'fcm': {'kirim': 10, 'batas': 4000, 'persen': .3, 'ditolak': 2}}).fcm!;
    expect([tolak.tingkat, tolak.baris.catatan], [TingkatPakai.bahaya, '']);
    expect(RingkasPakai.dariJson({}).fcm, isNull);
  });
}
