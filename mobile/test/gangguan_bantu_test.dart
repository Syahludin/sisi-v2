import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/gangguan/gangguan_bantu.dart';

/// v1.0.38: hitungan History Gangguan HP harus sama dengan website (web/test/gangguan.test.js).
void main() {
  test('kode FGTM: kode di akhir teks, tanpa kode = E, kosong = Belum diisi; filter grup / kode', () {
    expect(kodeFgtm('Pohon - E1').kode, 'E1');
    expect(kodeFgtm('Komponen JTM I1').grup, 'INTERNAL');
    expect(kodeFgtm('Proses Penelusuran').kode, 'E');
    expect(kodeFgtm('').label, 'Belum diisi');
    expect(cocokKodeGgn('Pohon - E1', 'EXTERNAL'), isTrue);
    expect(cocokKodeGgn('Pohon - E1', 'I1'), isFalse);
  });

  test('kategori PMT | Section: jenis peralatan dulu, pick up dari nama recloser', () {
    expect(kategoriAlatGgn({'jenis_peralatan': 'PMT'}, 'penyulang'), 'pmt');
    expect(kategoriAlatGgn({'jenis_peralatan': 'OG', 'peralatan': 'PMT X'}, 'penyulang'), 'section');
    expect(kategoriAlatGgn({'recloser': 'PMT TANGIT'}, 'pickup'), 'pmt');
    expect(kategoriAlatGgn({'recloser': 'LBS JERNANG'}, 'pickup'), 'section');
  });

  test('per bulan rentang + 3 tahun + top penyulang', () {
    final r = [
      {'penyulang': 'PALAS', 'waktu_ar': '2026-02-01', 'jenis_peralatan': 'PMT'},
      {'penyulang': 'PALAS', 'waktu_ar': '2026-03-01', 'jenis_peralatan': 'ACR'},
      {'penyulang': 'KOTA', 'waktu_ar': '2026-03-01', 'jenis_peralatan': 'ACR'},
      {'penyulang': 'KOTA', 'waktu_ar': '2025-03-01', 'jenis_peralatan': 'ACR'},
      {'penyulang': 'BIKANG', 'waktu_ar': '2024-03-01', 'jenis_peralatan': 'ACR'},
    ];
    final b = perBulanRentangGgn(r, 'ar', '2025-12-01', '2026-03-31');
    expect(b.map((x) => '${x.label}${x.sub}:${x.h.jumlah}').toList(), ['Des2025:0', 'Jan2026:0', 'Feb:1', 'Mar:2']);
    final t = topPenyulangGgn(r, 'ar', 2026);
    expect(t.map((x) => '${x.nama}:${x.h.jumlah}:${x.h.pmt}').toList(), ['PALAS:2:1', 'KOTA:1:0']);
    expect(t[1].perTahun, {2024: 0, 2025: 1, 2026: 1});
    expect(perTahunGgn(r, 'ar', 2026).map((x) => x.h.jumlah).toList(), [1, 1, 3]);
    expect(rentangTahunGgn(2026, '2026-10-27'), (dari: '2026-01-01', sampai: '2026-10-27'));
  });

  test('saring + grup bulan + durasi', () {
    final r = [
      {'penyulang': 'PALAS', 'waktu_padam': '2026-03-02 10:00', 'kode_fgtm': 'Pohon - E1', 'penyebab': 'Pohon tumbang'},
      {'penyulang': 'KOTA', 'waktu_padam': '2026-02-01 08:00', 'kode_fgtm': 'Trafo I3', 'penyebab': 'Trafo'},
    ];
    expect(saringGgn(r, 'penyulang', fgtm: 'EXTERNAL').length, 1);
    expect(saringGgn(r, 'penyulang', cari: 'pohon palas').length, 1);
    expect(saringGgn(r, 'penyulang', dari: '2026-03-01').length, 1);
    expect(grupBulanGgn(r, 'penyulang').map((g) => g.label).toList(), ['Maret 2026', 'Februari 2026']);
    expect(teksDurasiGgn(135), '2 j 15 m');
    expect(teksDurasiGgn(45), '45 m');
    expect(tglIdGgn('2026-10-27 08:00'), '27 Okt 2026');
  });
}
