import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/yandal/petugas_yandal_repository.dart';

void main() {
  DataPetugasYandal data() => DataPetugasYandal.dariJson({
        'tim': [
          {'timId': 't13', 'nama': 'YANDAL 13', 'kode': '13', 'jenis': 'YANDAL'},
          {'timId': 'row', 'nama': 'ROW 01', 'kode': '01', 'jenis': 'ROW'},
        ],
        'petugas': [
          {'petugasId': 'a', 'nama': 'Andi', 'timId': 't13', 'aktif': true, 'revision': 1},
          {'petugasId': 'b', 'nama': 'Budi', 'timId': 'row', 'aktif': true, 'revision': 1},
        ],
        'batas': {'min': 2, 'maks': 8},
      });

  test('v1.0.51: jenis tim dibaca; hanya YANDAL yang punya batas anggota', () {
    final d = data();
    expect(d.tim.map((t) => t.jenis), ['YANDAL', 'ROW']);
    expect(d.tim.map((t) => t.yandal), [true, false]);
  });

  test('v1.0.51: draft memindah petugas ke tim non-Yandal dan menghitung anggotanya', () {
    final d = DraftPetugasYandal(data())..pindah('a', 'row');
    expect(d.jumlahPerTim(), {'t13': 0, 'row': 2});
    expect(d.payload()['ubah'], [
      {'petugasId': 'a', 'revision': 1, 'timId': 'row'}
    ]);
  });
}
