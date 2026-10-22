import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/sinkron_atomik.dart';

/// v1.0.17: rumus ringkasan sinkron atomik HP HARUS sama persis dengan server (ringkasSegel_, 76_SinkronAtomik.js).
/// Nilai acuan di bawah dihitung dari kode server dan juga dikunci di tests/backend.test.js.
void main() {
  final docHartek = {
    'header': {'headerId': 'h1'},
    'objek': [
      {
        'pgId': 'p1',
        'pekerjaan': [
          {
            'pekerjaanId': 'k1',
            'material': [
              {'idBaris': 'm1'},
            ],
            'grounding': [
              {'idBaris': 'g1', 'foto': {'SEBELUM': 'L1', 'SESUDAH': ''}},
            ],
            'pemerataan': <dynamic>[],
          },
        ],
      },
      {'pgId': 'p2', 'pekerjaan': <dynamic>[]},
    ],
  };
  final docInsJar = {
    'header': {'headerId': 'h2'},
    'realisasi': [
      {
        'realisasiId': 'r1',
        'temuan': [
          {'temuanId': 't1', 'foto': {'TEMUAN': 'a', 'TIANG': 'b'}},
          {'temuanId': 't2', 'foto': <String, dynamic>{}},
        ],
      },
    ],
  };

  test('v1.0.17 ringkasSinkron = ringkasSegel_ server (FNV-1a + jumlah per bagian)', () {
    expect(sidikSinkron(''), '811c9dc5');
    expect(sidikSinkron('SiSi Toboali'), 'a9e44bc3');
    expect(ringkasSinkron('HARTEK', docHartek),
        {'header': 1, 'lokasi': 2, 'pekerjaan': 1, 'material': 1, 'grounding': 1, 'pemerataan': 0, 'foto': 1, 'sidik': '6f9d8a58'});
    expect(ringkasSinkron('INSJAR', docInsJar), {'header': 1, 'realisasi': 1, 'temuan': 2, 'foto': 2, 'sidik': 'eba90ab5'});
    expect(ringkasSinkron('INSDU', docInsJar)['sidik'], 'eba90ab5', reason: 'InsDu memakai susunan realisasi > temuan yang sama');
  });

  test('v1.0.17 tahap sinkron: proses / ditolak / memverifikasi / tersinkron; data baru sesudah segel = proses lagi', () {
    final segel = {'status': 'LENGKAP', 'ringkas': ringkasSinkron('HARTEK', docHartek)};
    expect(tahapSinkron('HARTEK', doc: {'header': null}, menunggu: 0, gagal: 0, segel: null), TahapSinkron.kosong);
    expect(tahapSinkron('HARTEK', doc: docHartek, menunggu: 2, gagal: 0, segel: segel), TahapSinkron.proses);
    expect(tahapSinkron('HARTEK', doc: docHartek, menunggu: 2, gagal: 1, segel: segel), TahapSinkron.ditolak);
    expect(tahapSinkron('HARTEK', doc: docHartek, menunggu: 0, gagal: 0, segel: null), TahapSinkron.memverifikasi);
    expect(tahapSinkron('HARTEK', doc: docHartek, menunggu: 0, gagal: 0, segel: segel), TahapSinkron.tersinkron);
    // pekerjaan baru masuk (rincian berubah) sesudah segel: belum tersinkron sampai disegel ulang
    final baru = {
      ...docHartek,
      'objek': [
        ...(docHartek['objek'] as List),
        {'pgId': 'p3', 'pekerjaan': <dynamic>[]},
      ],
    };
    expect(tahapSinkron('HARTEK', doc: baru, menunggu: 0, gagal: 0, segel: segel), TahapSinkron.memverifikasi);
    expect(tahapSinkron('HARTEK', doc: docHartek, menunggu: 0, gagal: 0, segel: {...segel, 'status': 'TIDAK_COCOK'}), TahapSinkron.memverifikasi);
    expect(teksTahapSinkron(TahapSinkron.proses, menunggu: 3), (judul: 'SiSi Sedang Proses Sinkron Data', isi: '3 Data Sedang Proses Sinkron'));
  });
}
