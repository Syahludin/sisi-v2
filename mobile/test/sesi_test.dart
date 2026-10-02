import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/sesi.dart';

void main() {
  final s = Sesi.dariLogin({
    'token': 'a' * 64,
    'profil': {'userId': 'u1', 'username': '16130.uji.row01', 'role': 'PETUGAS', 'timKode': '03'},
    'menu': [
      {'kode': 'ROW_EKSEKUSI', 'aksi': 'UBAH'},
      {'kode': 'ROW_LAPORAN', 'aksi': 'LIHAT'},
    ],
    'offlineSampai': '2026-10-03T23:59:59+07:00',
  });

  test('batas offline 23:59:59 WIB hari berikutnya', () {
    expect(s.bolehInput(DateTime.utc(2026, 10, 3, 16, 59, 58)), isTrue);
    expect(s.bolehInput(DateTime.utc(2026, 10, 3, 17, 0, 0)), isFalse);
  });

  test('akses menu dari server', () {
    expect(s.bisaUbah('ROW_EKSEKUSI'), isTrue);
    expect(s.bisaUbah('ROW_LAPORAN'), isFalse);
    expect(s.aksiMenu('USER_KELOLA'), isNull);
  });

  test('simpan dan baca ulang sama', () {
    final ulang = Sesi.dariJson(s.keJson());
    expect(ulang.userId, 'u1');
    expect(ulang.offlineSampai, s.offlineSampai);
    expect(ulang.menu.length, 2);
  });
}
