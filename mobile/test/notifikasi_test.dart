import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/notifikasi_aturan.dart';
import 'package:sisi_row/core/sesi.dart';

Sesi _sesi(String role, {String jenisTim = ''}) => Sesi(
      token: 't',
      profil: {'userId': 'u1', 'username': 'a', 'role': role, 'jenisTim': jenisTim, 'timId': jenisTim.isEmpty ? '' : 'tim'},
      menu: const [],
      offlineSampai: DateTime(2030),
    );

void main() {
  // v0.83.0: notifikasi pengingat login Yandal
  test('penerima: akun YANDAL + ADMIN / SUPER, bukan ROW / ADMIN_ES', () {
    expect(perluNotifikasi(_sesi('PETUGAS', jenisTim: 'YANDAL')), isTrue);
    expect(perluNotifikasi(_sesi('ADMIN')), isTrue);
    expect(perluNotifikasi(_sesi('SUPER')), isTrue);
    expect(perluNotifikasi(_sesi('PETUGAS', jenisTim: 'ROW')), isFalse);
    expect(perluNotifikasi(_sesi('ADMIN_ES')), isFalse);
  });

  test('daftar ulang: belum pernah / akun / token beda / lewat 3 hari', () {
    final t0 = DateTime(2026, 10, 10, 8);
    final c = catatanDaftarNotif('u1', 'tok:abc', t0);
    expect(perluDaftarNotif(null, 'u1', 'tok:abc', t0), isTrue);
    expect(perluDaftarNotif(c, 'u1', 'tok:abc', t0.add(const Duration(days: 2))), isFalse);
    expect(perluDaftarNotif(c, 'u2', 'tok:abc', t0), isTrue);
    expect(perluDaftarNotif(c, 'u1', 'tok:lain', t0), isTrue);
    expect(perluDaftarNotif(c, 'u1', 'tok:abc', t0.add(const Duration(days: 3))), isTrue);
    expect(perluDaftarNotif('rusak', 'u1', 'tok:abc', t0), isTrue);
  });
}
