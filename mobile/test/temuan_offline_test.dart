import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/insjar/temuan_offline.dart';

void main() {
  final semua = <Map<String, dynamic>>[
    {'temuanId': '1', 'jenisTemuan': 'Pohon dekat jaringan', 'tanggal': '2026-10-20', 'penyulang': 'TB-01', 'sumber': 'INSPEKSI', 'tim': 'INSPEKSI 01'},
    {'temuanId': '2', 'jenisTemuan': 'Pohon dekat jaringan', 'tanggal': '2026-10-21', 'penyulang': 'TB-02', 'sumber': 'ADMIN', 'tim': ''},
    {'temuanId': '3', 'jenisTemuan': 'Isolator retak', 'tanggal': '2026-10-21', 'penyulang': 'TB-01', 'sumber': 'INSPEKSI', 'tim': ''},
    {'temuanId': '4', 'jenisTemuan': '', 'tanggal': '2026-10-19', 'penyulang': 'TB-03', 'sumber': 'INSPEKSI', 'tim': 'INSPEKSI 02'},
  ];

  test('v1.0.17 filter multi-pilihan: kategori kosong = semua, nilai dalam kategori = ATAU, antar kategori = DAN', () {
    expect(const FilterTemuan().saring(semua).length, 4);
    var f = const FilterTemuan().atur(KategoriFilterTemuan.penyulang, {'TB-01', 'TB-02'});
    expect(f.saring(semua).map((t) => t['temuanId']), ['1', '2', '3']);
    f = f.atur(KategoriFilterTemuan.tim, {'Admin', 'Petugas'});
    expect(f.saring(semua).map((t) => t['temuanId']), ['2', '3']);
    f = f.alih(KategoriFilterTemuan.jenis, 'Isolator retak');
    expect(f.saring(semua).map((t) => t['temuanId']), ['3']);
    expect(f.jumlah, 5);
    expect(f.alih(KategoriFilterTemuan.jenis, 'Isolator retak').dari(KategoriFilterTemuan.jenis), isEmpty, reason: 'ketuk lagi = lepas');
    expect(const FilterTemuan().atur(KategoriFilterTemuan.tanggal, {'2026-10-21'}).saring(semua).length, 2);
  });

  test('v1.0.17 pilihan filter + ringkasan per jenis (terbanyak dulu, kosong = "-")', () {
    expect(pilihanFilterTemuan(semua, KategoriFilterTemuan.tanggal), ['2026-10-21', '2026-10-20', '2026-10-19']);
    expect(pilihanFilterTemuan(semua, KategoriFilterTemuan.tim), ['Admin', 'INSPEKSI 01', 'INSPEKSI 02', 'Petugas']);
    expect(ringkasJenisTemuan(semua).map((r) => (r.jenis, r.jumlah)).toList(), [('Pohon dekat jaringan', 2), ('-', 1), ('Isolator retak', 1)]);
  });

  test('v1.0.18 ringkasan per section: jenis temuan per section, section terbanyak dulu, gardu tanpa section = nomor gardu', () {
    final l = [
      {'penyulang': 'TB-01', 'section': 'Kampung Baru', 'jenisTemuan': 'Pohon dekat jaringan'},
      {'penyulang': 'TB-01', 'section': 'Kampung Baru', 'jenisTemuan': 'Isolator retak'},
      {'penyulang': 'TB-01', 'section': 'Kampung Baru', 'jenisTemuan': 'Pohon dekat jaringan'},
      {'penyulang': 'TB-02', 'section': '', 'noGardu': 'TB0007', 'jenisTemuan': 'Trafo bocor'},
      {'penyulang': '', 'section': '', 'jenisTemuan': 'Lain'},
    ];
    final r = ringkasSectionTemuan(l);
    expect(r.map((s) => (s.section, s.jumlah)).toList(), [('TB-01 · Kampung Baru', 3), ('-', 1), ('TB-02 · TB0007', 1)]);
    expect(r.first.jenis.map((j) => (j.jenis, j.jumlah)).toList(), [('Pohon dekat jaringan', 2), ('Isolator retak', 1)]);
  });

  test('v1.0.19 ringkasan per penyulang: penyulang abjad, section ikut urutan db_Jaringan (di luar master di belakang), jenis per section', () {
    final l = [
      {'penyulang': 'TB-02', 'section': 'Rias', 'jenisTemuan': 'Pohon'},
      {'penyulang': 'TB-01', 'section': 'Kampung Baru', 'jenisTemuan': 'Pohon'},
      {'penyulang': 'TB-01', 'section': 'Gadung', 'jenisTemuan': 'Isolator'},
      {'penyulang': 'TB-01', 'section': 'Gadung', 'jenisTemuan': 'Pohon'},
      {'penyulang': 'TB-01', 'section': 'Gadung', 'jenisTemuan': 'Pohon'},
      {'penyulang': 'TB-01', 'section': 'Asing', 'jenisTemuan': 'Pohon'},
    ];
    final urutan = urutanSectionTemuan([
      {'nama': 'TB-01', 'section': ['Kampung Baru', 'Gadung']},
    ]);
    final r = ringkasPenyulangTemuan(l, urutan);
    expect(r.map((p) => (p.penyulang, p.jumlah)).toList(), [('TB-01', 5), ('TB-02', 1)]);
    expect(r.first.section.map((s) => s.section).toList(), ['Kampung Baru', 'Gadung', 'Asing'], reason: 'urutan kolom urutan, bukan jumlah');
    expect(r.first.section[1].jenis.map((j) => (j.jenis, j.jumlah)).toList(), [('Pohon', 2), ('Isolator', 1)]);
    expect(saringTemuan(l, penyulang: 'TB-01', section: 'Gadung', jenis: 'Pohon').length, 2);
  });

  test('v1.0.17 simpanan offline: temuan baru disisipkan tanpa ganda, urut tanggal terbaru', () {
    final isi = {'dari': '2026-10-01', 'sampai': '2026-10-21', 'temuan': semua};
    final baru = SimpananTemuanOffline.sisipkan(isi, {'temuanId': '3', 'jenisTemuan': 'Isolator pecah', 'tanggal': '2026-10-22', 'kodeTemuan': 'PEG-1'});
    final l = baru['temuan'] as List;
    expect(l.length, 4);
    expect((l.first as Map)['jenisTemuan'], 'Isolator pecah');
    expect(baru['dari'], '2026-10-01');
  });
}
