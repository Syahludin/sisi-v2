import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/insjar/insjar_form.dart';

void main() {
  final sesi = Sesi.dariLogin({
    'token': 'c' * 64,
    'profil': {'userId': 'u-ij', 'username': 'ij01', 'role': 'PETUGAS', 'jenisTim': 'INSPEKSI_JARINGAN', 'timId': 'tim-ij'},
    'menu': [
      {'kode': 'OPS_INSJAR_INPUT', 'aksi': 'UBAH'},
    ],
    'offlineSampai': '2026-10-22T23:59:59+07:00',
  });
  final m = MasterInsJar({
    'penyulang': [
      {'nama': 'TB-01', 'section': ['S1']},
    ],
    'jenisTemuan': [
      {'nama': 'Pohon', 'jenisTemuanId': 'jt-1', 'objekInspeksi': ['Jaringan'], 'tierInspeksi': ['Tier 1']},
      {'nama': 'Isolator retak', 'jenisTemuanId': 'jt-2', 'objekInspeksi': ['Jaringan'], 'tierInspeksi': ['Tier 2']},
    ],
    'tier': ['Tier 1', 'Tier 2'],
  });

  test('v1.0.16 insjar: petugas tanpa isian tier manual, tier + jenis temuan ikut penyulang utama yang dipilih', () {
    final tierRealisasi = {'r1': 'Tier 1', 'r2': 'Tier 2'};
    final n = {'objekInspeksi': 'Jaringan', 'realisasiId': 'r2'};
    final isian = isianTemuan(sesi, m,
        penyulangTetap: 'TB-01',
        objekTetap: 'Jaringan',
        tierOtomatis: (v) => tierRealisasi[v['realisasiId']] ?? '',
        kode: 'K',
        nilai: n,
        denganFoto: false,
        pilihanRealisasi: const {'r1': 'S1 · Tier 1', 'r2': 'S1 · Tier 2'});
    expect(isian.any((i) => i.kunci == 'tierInspeksi'), isFalse);
    final jenis = isian.firstWhere((i) => i.kunci == 'jenisTemuan');
    expect(jenis.opsi(n), ['Isolator retak'], reason: 'jenis temuan disaring tier penyulang utama');
    expect(jenis.opsi({...n, 'realisasiId': 'r1'}), ['Pohon']);
    // admin tetap memilih tier
    final admin = isianTemuan(sesi, m, kode: 'A', nilai: const {});
    expect(admin.any((i) => i.kunci == 'tierInspeksi'), isTrue);
  });
}
