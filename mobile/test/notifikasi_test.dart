import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/notifikasi_aturan.dart';
import 'package:sisi_row/core/sesi.dart';

Sesi _sesi(String role, {String jenisTim = '', List<Map<String, dynamic>> menu = const []}) => Sesi(
      token: 't',
      profil: {'userId': 'u1', 'username': 'a', 'role': role, 'jenisTim': jenisTim, 'timId': jenisTim.isEmpty ? '' : 'tim'},
      menu: menu,
      offlineSampai: DateTime(2030),
    );

void main() {
  // v0.83.0: notifikasi pengingat login Yandal
  test('v1.0.45 penerima: ADMIN / SUPER saja, bukan Yandal / ROW / tim WO / ADMIN_ES', () {
    expect(perluNotifikasi(_sesi('PETUGAS', jenisTim: 'YANDAL')), isFalse);
    expect(perluNotifikasi(_sesi('ADMIN')), isTrue);
    expect(perluNotifikasi(_sesi('SUPER')), isTrue);
    expect(perluNotifikasi(_sesi('PETUGAS', jenisTim: 'ROW')), isFalse);
    expect(perluNotifikasi(_sesi('ADMIN_ES')), isFalse);
    expect(perluNotifikasi(_sesi('PETUGAS', jenisTim: 'ROW', menu: const [{'kode': 'OPS_WO_TIM', 'aksi': 'UBAH'}])), isFalse);
  });

  test('v1.0.29 ketuk notifikasi push = item lonceng (WO / temuan / P0), pengingat login tanpa layar tujuan', () {
    expect(itemLoncengDariPush({'jenis': 'WO', 'menu': 'OPS_WO_TIM', 'temuanId': 'tm-1'}),
        {'jenis': 'WO', 'kunci': '', 'tujuan': {'menu': 'OPS_WO_TIM', 'temuanId': 'tm-1'}});
    expect(itemLoncengDariPush({'jenis': 'P0', 'menu': 'OPS_VERIFIKASI_P0', 'tanggal': '2026-10-24', 'temuanId': ''})!['tujuan'],
        {'menu': 'OPS_VERIFIKASI_P0', 'tanggal': '2026-10-24'});
    expect(itemLoncengDariPush({'jenis': 'PENGINGAT_LOGIN', 'shift': '1'}), isNull);
    expect(itemLoncengDariPush(const {}), isNull);
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
