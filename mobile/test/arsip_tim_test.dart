import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/arsip/arsip_tim.dart';

void main() {
  test('v1.0.17 arsip tim: potongan per bulan kalender (<= 31 hari), terbaru dulu', () {
    final p = potonganBulanArsip(DateTime(2026, 8, 20), DateTime(2026, 10, 21));
    expect([for (final x in p) '${isoArsip(x.dari)}..${isoArsip(x.sampai)}'],
        ['2026-10-01..2026-10-21', '2026-09-01..2026-09-30', '2026-08-20..2026-08-31']);
    expect(potonganBulanArsip(DateTime(2026, 10, 5), DateTime(2026, 10, 5)).length, 1);
  });

  test('v1.0.17 arsip tim: unduh ulang rentang mengganti laporan lama rentang itu, urut terbaru', () {
    final lama = [
      {'tanggal': '2026-10-02', 'header': {'headerId': 'a'}},
      {'tanggal': '2026-09-30', 'header': {'headerId': 'b'}},
    ];
    final g = SimpananArsipTim.gabung(lama, [
      {'tanggal': '2026-10-03', 'header': {'headerId': 'c'}},
    ], '2026-10-01', '2026-10-31');
    expect(g.map((x) => x['tanggal']), ['2026-10-03', '2026-09-30']);
  });

  test('v1.0.17 arsip tim: ringkasan + rincian per modul (material tampil di bawah pekerjaannya)', () {
    final hartek = {
      'tanggal': '2026-10-20',
      'header': {'headerId': 'h', 'kodeHeader': 'HAR-1'},
      'objek': [
        {
          'jenisPekerjaan': 'Gardu',
          'noGardu': 'TB0001',
          'pekerjaan': [
            {'pekerjaan': 'Ganti Arrester', 'jumlahPekerjaan': 3, 'satuanPekerjaan': 'buah', 'material': [
              {'material': 'Arrester', 'jumlah': 3, 'satuan': 'bh', 'kepemilikan': 'PLN'},
            ]},
          ],
        },
      ],
    };
    expect(ModulArsipTim.hartek.ringkas(hartek), [('Lokasi', 1), ('Pekerjaan', 1), ('Material', 1)]);
    final r = ModulArsipTim.hartek.rincian(hartek).single;
    expect(r.judul, 'Gardu: Gardu TB0001');
    expect(r.baris, ['Ganti Arrester 3 buah', '   ↳ Arrester 3 bh (PLN)']);
    final insjar = {
      'tanggal': '2026-10-20',
      'header': {'headerId': 'h'},
      'realisasi': [
        {'penyulang': 'TB-01', 'tier': 'Tier 1', 'section': 'A', 'totalTiang': 12, 'temuan': [{'jenisTemuan': 'Pohon', 'nomorTiang': 'T1'}]},
      ],
    };
    expect(ModulArsipTim.insjar.ringkas(insjar), [('Penyulang', 1), ('Temuan', 1), ('Total Tiang', 12)]);
    expect(ModulArsipTim.dariKode('INSDU'), same(ModulArsipTim.insdu));
  });
}
