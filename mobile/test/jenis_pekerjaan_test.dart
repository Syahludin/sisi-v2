import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/row/jenis_pekerjaan.dart';

void main() {
  final daftar = [
    JenisPekerjaan(id: 'r', nama: 'Rabas / Pangkas', satuan: 'Gawang', diameterMin: 0, diameterMax: 0),
    JenisPekerjaan(id: 's', nama: 'Tebang Sedang', satuan: 'Batang', diameterMin: 25, diameterMax: 50),
    JenisPekerjaan(id: 'b', nama: 'Tebang Besar', satuan: 'Batang', diameterMin: 51),
  ];

  test('batas sesuai keputusan 2 Okt 2026', () {
    expect(pilihJenis(0, daftar).jenis?.id, 'r');
    expect(pilihJenis(25, daftar).jenis?.id, 's');
    expect(pilihJenis(50, daftar).jenis?.id, 's');
    expect(pilihJenis(51, daftar).jenis?.id, 'b');
    expect(pilihJenis(1000, daftar).jenis?.id, 'b');
  });

  test('1 sampai 24 ditolak', () {
    for (final d in [1, 10, 24]) {
      expect(pilihJenis(d, daftar).kode, 'DIAMETER_DI_LUAR_KATEGORI');
    }
  });

  test('di luar 0-1000 ditolak', () {
    expect(pilihJenis(-1, daftar).kode, 'DIAMETER_TIDAK_VALID');
    expect(pilihJenis(1001, daftar).kode, 'DIAMETER_TIDAK_VALID');
  });
}
