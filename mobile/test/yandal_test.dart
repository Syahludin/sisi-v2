import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/yandal/petugas_yandal_repository.dart';
import 'package:sisi_row/features/yandal/yandal_login.dart';

/// v0.63.0: login 2 tahap akun YANDAL + Pindah Tim Petugas Yandal (logika murni).
void main() {
  final loginTahap1 = <String, dynamic>{
    'tahap': 'PILIH_PETUGAS',
    'tiket': 'a' * 64,
    'yandal': {
      'tim': {'timId': 't13', 'nama': 'YANDAL 13', 'kode': '13'},
      'shift': {'no': 1, 'tanggal': '2026-10-08', 'hari': 'Kamis', 'jam': '08:00 - 16:00', 'sampai': '2026-10-08T08:59:00.000Z'},
      'petugas': [
        {'petugasId': 'p1', 'nama': 'Andi', 'sibuk': false},
        {'petugasId': 'p2', 'nama': 'Budi', 'sibuk': true},
        {'petugasId': 'p3', 'nama': 'Candra'},
      ],
      'terpilih': <String>[],
      'maks': 2,
    },
  };

  test('tiket tahap 1 dibaca lengkap; jam berakhir dalam WIB', () {
    final t = TiketYandal.dariJson(loginTahap1);
    expect(t.timNama, 'YANDAL 13');
    expect(t.shiftNo, 1);
    expect(t.petugas.map((p) => p.nama), ['Andi', 'Budi', 'Candra']);
    expect(t.petugas[1].sibuk, isTrue);
    expect(t.crewTerkunci, isFalse);
    expect(jamWib(t.sampai!), '15:59');
    expect(t.namaDari(['p3', 'p1']), ['Candra', 'Andi']);
  });

  test('pilih petugas: maksimal 2, ketuk lagi = lepas', () {
    var d = togglePetugas(const [], 'p1', 2)!;
    d = togglePetugas(d, 'p3', 2)!;
    expect(d, ['p1', 'p3']);
    expect(togglePetugas(d, 'p2', 2), isNull, reason: 'penuh');
    expect(togglePetugas(d, 'p1', 2), ['p3']);
  });

  test('teks verifikasi sesuai keputusan kvlar', () {
    expect(teksKonfirmasiPetugas(['Andi', 'Candra']),
        'Apakah user yang masuk saat ini adalah\n1. Andi\n2. Candra\nJika sudah betul silahkan lanjut login');
    expect(teksKonfirmasiPetugas(['Andi']), 'Apakah user yang masuk saat ini adalah\n1. Andi\nJika sudah betul silahkan lanjut login');
  });

  test('v0.65.11: inisial avatar verifikasi petugas', () {
    expect([inisialPetugas('Anwar'), inisialPetugas('Haryanto'), inisialPetugas('Wintoh Febby H. S'), inisialPetugas('robby sandika')],
        ['AN', 'HA', 'WF', 'RS']);
    expect([inisialPetugas(''), inisialPetugas('  '), inisialPetugas('A'), inisialPetugas('. Budi')], ['?', '?', 'A', 'BU']);
  });

  Sesi sesiYandal() => Sesi.dariLogin({
        'token': 'b' * 64,
        'profil': {'userId': 'u', 'username': '16130.yandal13', 'role': 'PETUGAS', 'jenisTim': 'YANDAL', 'timNama': 'YANDAL 13'},
        'menu': <dynamic>[],
        'offlineSampai': '2026-10-08T08:59:00.000Z',
        'sesiSampai': '2026-10-08T08:59:00.000Z',
        'yandal': {
          'kodeShift': 'Y13-16130261008001-SHF1.001',
          'shift': {'no': 1},
          'petugas': [
            {'petugasId': 'p3', 'nama': 'Candra'},
            {'petugasId': 'p1', 'nama': 'Andi'},
          ],
        },
      });

  test('sesi YANDAL: habis tepat di akhir shift (jam HP), tersimpan utuh, cekSesi tidak memperpanjang', () {
    final s = sesiYandal();
    expect(s.petugasYandal, isTrue);
    expect(s.petugasShift, ['Candra', 'Andi']);
    expect(s.habisShift(DateTime.utc(2026, 10, 8, 8, 58, 59)), isFalse);
    expect(s.habisShift(DateTime.utc(2026, 10, 8, 8, 59)), isTrue);
    final j = Sesi.dariJson(s.keJson());
    expect(j.sesiSampai, s.sesiSampai);
    expect(j.petugasShift, ['Candra', 'Andi']);
    final c = s.denganData({
      'profil': s.profil,
      'menu': <dynamic>[],
      'offlineSampai': '2026-10-08T08:59:00.000Z',
      'sesiSampai': '2026-10-09T08:59:00.000Z',
    });
    expect(c.sesiSampai, s.sesiSampai, reason: 'tidak pernah diperpanjang');
    expect(c.petugasShift, ['Candra', 'Andi'], reason: 'petugas tetap');
  });

  test('akun non-YANDAL tidak punya batas shift', () {
    final s = Sesi.dariLogin({
      'token': 'c' * 64,
      'profil': {'userId': 'u', 'username': '16130.row01', 'role': 'PETUGAS', 'jenisTim': 'ROW'},
      'menu': <dynamic>[],
      'offlineSampai': '2026-10-09T16:59:59.000Z',
    });
    expect(s.sesiSampai, isNull);
    expect(s.habisShift(DateTime.utc(2030)), isFalse);
    expect(Sesi.dariJson(s.keJson()).keJson().containsKey('sesiSampai'), isFalse);
  });

  DataPetugasYandal data() => DataPetugasYandal.dariJson({
        'tim': [
          {'timId': 't13', 'nama': 'YANDAL 13', 'kode': '13'},
          {'timId': 't14', 'nama': 'YANDAL 14', 'kode': '14'},
        ],
        'petugas': [
          {'petugasId': 'p1', 'nama': 'Andi', 'timId': 't13', 'aktif': true, 'revision': 3},
          {'petugasId': 'p2', 'nama': 'Budi', 'timId': 't13', 'aktif': true, 'revision': 1},
          {'petugasId': 'p9', 'nama': 'Lama', 'timId': 't13', 'aktif': false, 'revision': 2},
        ],
        'batas': {'min': 2, 'maks': 8},
      });

  test('draft pindah tim: dikirim sekaligus dengan revision, pindah balik = tidak ada perubahan', () {
    final d = DraftPetugasYandal(data());
    d.pindah('p1', 't14');
    d.nonaktifkan('p2');
    d.pindah('p9', 't14'); // aktifkan lagi di tim lain
    d.tambah('  Eko  ', 't14');
    expect(d.jumlah, 4);
    expect(d.jumlahPerTim(), {'t13': 0, 't14': 3});
    expect(d.payload(), {
      'ubah': [
        {'petugasId': 'p1', 'revision': 3, 'timId': 't14'},
        {'petugasId': 'p2', 'revision': 1, 'aktif': false},
        {'petugasId': 'p9', 'revision': 2, 'timId': 't14', 'aktif': true},
      ],
      'baru': [
        {'nama': 'Eko', 'timId': 't14'},
      ],
    });
    expect(d.namaDipakai('andi'), isTrue);
    expect(d.namaDipakai('Budi'), isFalse, reason: 'Budi dinonaktifkan di draft');
    expect(d.namaDipakai('eko'), isTrue);
    d.pindah('p1', 't13');
    expect(d.berubah('p1'), isFalse, reason: 'kembali ke asal');
  });
}
