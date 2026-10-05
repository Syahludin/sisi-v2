import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/row/watermark.dart';

void main() {
  DataWatermark contoh({String kode = 'R01-16130261003001-PNY.001-EKS.001', int? diameter = 30, double? akurasi = 4.6, String sumber = 'KAMERA'}) =>
      DataWatermark(
        kodeEksekusi: kode,
        ulp: 'Toboali',
        tim: 'ROW',
        subTim: 'ROW 01',
        penyulang: 'Bikang',
        section: 'LBS Pergam - ACR Tepus',
        waktu: DateTime.utc(2026, 10, 3, 2, 5, 9), // 09:05:09 WIB
        koordinat: '-3.012345, 106.512345',
        akurasiM: akurasi,
        diameter: diameter,
        jenis: 'Tebang Sedang',
        slot: 'Sebelum',
        sumber: sumber,
      );

  test('isi watermark urut, waktu WIB, koordinat GPS dengan akurasi', () {
    final b = contoh().baris;
    expect(b.map((x) => x.$1).toList(), [
      'Kode Eksekusi', 'ULP', 'Tim', 'Sub-Tim', 'Penyulang', 'Section', 'Waktu', 'Koordinat', 'Diameter', 'Jenis Pekerjaan',
    ]);
    final m = {for (final x in b) x.$1: x.$2};
    expect(m['Waktu'], '03/10/2026 09:05:09 WIB');
    expect(m['Koordinat'], '-3.012345, 106.512345 (±5 m)');
    expect(m['Diameter'], '30 cm');
    expect(contoh().judul, 'Foto Sebelum');
  });

  test('tanpa GPS = koordinat input, galeri diberi baris Sumber', () {
    final m = {for (final x in contoh(akurasi: null, sumber: 'GALERI').baris) x.$1: x.$2};
    expect(m['Koordinat'], '-3.012345, 106.512345 (input)');
    expect(m['Sumber'], 'Galeri (bukan kamera SiSi)');
    expect(contoh().baris.any((x) => x.$1 == 'Sumber'), isFalse);
  });

  test('nilai kosong tampil "-", rabas diameter 0 tetap "0 cm"', () {
    final d = DataWatermark(
        kodeEksekusi: 'X', ulp: 'Toboali', tim: 'ROW', subTim: '', penyulang: null, section: ' ', waktu: DateTime.utc(2026),
        koordinat: null, diameter: null, jenis: ' ', slot: 'Pekerjaan');
    final m = {for (final x in d.baris) x.$1: x.$2};
    expect([m['Sub-Tim'], m['Penyulang'], m['Section'], m['Koordinat'], m['Diameter'], m['Jenis Pekerjaan']],
        ['-', '-', '-', '-', '-', '-']);
    expect({for (final x in contoh(diameter: 0).baris) x.$1: x.$2}['Diameter'], '0 cm');
  });

  test('tanda berubah kalau kode atau diameter berubah (pemicu render ulang), copyWith menjaga sisanya', () {
    expect(contoh().tanda, contoh().tanda);
    expect(contoh(kode: 'R01-16130261003001-PNY.001-EKS.002').tanda, isNot(contoh().tanda));
    expect(contoh(diameter: 55).tanda, isNot(contoh().tanda));
    final c = contoh().copyWith(koordinat: '-3.1, 106.6', akurasiM: 12);
    expect({for (final x in c.baris) x.$1: x.$2}['Koordinat'], '-3.1, 106.6 (±12 m)');
    expect(c.kodeEksekusi, contoh().kodeEksekusi);
  });
}
