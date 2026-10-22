import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/kode_error.dart';
import 'package:sisi_row/features/row/kode_row.dart';
import 'package:sisi_row/features/row/perbaikan_repository.dart';
import 'package:sisi_row/features/row/row_outbox.dart';

MasalahSync _m(String jenis, String aksi, String status, String? alasan) => MasalahSync({
      'op_id': 'o',
      'jenis': jenis,
      'aksi': aksi,
      'id': 'i',
      'status': status,
      'alasan': alasan,
      'kode': 'R01-16130261006001',
    }, 'R01-16130261006001', '2026-10-06');

void main() {
  test('M4: Minta nomor baru mengganti 3 digit terakhir, turunan ikut lewat gantiInduk', () {
    expect(KodeRow.denganUrut('R01-16130261006001', 2), 'R01-16130261006002');
    expect(KodeRow.denganUrut('R01-16130261006001-PNY.001', 3), 'R01-16130261006001-PNY.003');
    expect(KodeRow.denganUrut('R01-16130261006001-PNY.002-EKS.009', 10), 'R01-16130261006001-PNY.002-EKS.010');
    expect(() => KodeRow.denganUrut('salah', 1), throwsArgumentError);
    expect(() => KodeRow.denganUrut('R01-16130261006001', 1000), throwsRangeError);
    expect(KodeRow.gantiInduk('R01-16130261006001-PNY.001-EKS.002', 'R01-16130261006001-PNY.001', 'R01-16130261006001-PNY.003'),
        'R01-16130261006001-PNY.003-EKS.002');
  });

  test('M4: urutan kirim batal = anak dulu dan setelah semua buat / ubah (lintas rombongan)', () {
    expect(RowOutbox.urutanUntuk('header', 'buat'), 1);
    expect(RowOutbox.urutanUntuk('eksekusi', 'ubah'), 3);
    final batal = ['header', 'realisasi', 'eksekusi'].map((j) => RowOutbox.urutanUntuk(j, 'batal')).toList();
    expect(batal, [9, 8, 7]);
    expect(batal.every((u) => u > 3), isTrue);
  });

  test('M4: tindakan Pusat Masalah per alasan server', () {
    expect(_m('eksekusi', 'buat', 'KONFLIK', 'KODE_BENTROK').tipe, 'BENTROK');
    expect(_m('eksekusi', 'buat', 'KONFLIK', 'INDUK_BENTROK').tipe, 'IKUT_INDUK');
    expect(_m('realisasi', 'buat', 'DITOLAK', 'INDUK_GAGAL').tipe, 'IKUT_INDUK');
    expect(_m('eksekusi', 'buat', 'DITOLAK', 'INDUK_TIDAK_ADA').tipe, 'IKUT_INDUK');
    expect(_m('header', 'buat', 'DITOLAK', 'HEADER_GANDA').tipe, 'HEADER_GANDA');
    expect(_m('realisasi', 'buat', 'DITOLAK', 'PENYULANG_GANDA').tipe, 'PENYULANG_GANDA');
    expect(_m('eksekusi', 'ubah', 'KONFLIK', 'KONFLIK_REVISION').tipe, 'REVISI');
    expect(_m('eksekusi', 'batal', 'DITOLAK', 'DATA_TERKUNCI').tipe, 'TERKUNCI');
    expect(_m('eksekusi', 'buat', 'DITOLAK', 'KOORDINAT_DI_LUAR_AREA').tipe, 'PERBAIKI');
    expect(_m('header', 'ubah', 'DITOLAK', 'KM_AKHIR_KURANG').tipe, 'BUANG');
    expect(_m('realisasi', 'buat', 'DITOLAK', 'SESUATU_BARU').tipe, 'HAPUS');
  });

  test('M4: tanggal dari kode + batas 7 hari', () {
    expect(PerbaikanRepository.tanggalDariKode('R03-16130261002001-PNY.001'), '2026-10-02');
    expect(PerbaikanRepository.tanggalDariKode('x'), isNull);
    expect(PerbaikanRepository.dalamBatas('R03-16130200101001'), isFalse);
  });

  test('alasan sinkron tampil tanpa kode server', () {
    for (final k in ['INDUK_TIDAK_ADA', 'HEADER_GANDA', 'KODE_BENTROK', 'KONFLIK_REVISION', 'DITOLAK', 'KODE_ANEH_BARU']) {
      final t = KodeError.alasanSinkron(k);
      expect(t, isNotEmpty);
      expect(t.contains('_'), isFalse, reason: k);
    }
    expect(KodeError.alasanSinkron(null), '');
  });
}
