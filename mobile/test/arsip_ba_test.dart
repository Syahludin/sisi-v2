import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/gardu/arsip_ba.dart';
import 'package:sisi_row/features/gardu/ba_repository.dart';

void main() {
  // v0.86.0: arsip BA v1 (baca saja), satu halaman dengan BA v2 di Daftar BA
  test('ItemBa dari daftar: arsip v1 dikenali, data asli v1 dibaca, link hanya https', () {
    final b = ItemBa.dariJson({
      'arsip': true, 'arsipId': 'a1', 'baId': '', 'peralatan': 'TRAFO', 'idBa': 'BA-GRD-TBL-202503-001',
      'noBaFull': 'No. 001 / BA - TRF / ULP - TBL / 3 / 2025', 'jenis': 'Pengoperasian Trafo', 'nama': 'TB0002', 'noGardu': 'TB0002',
      'tanggalBa': '2025-03-05', 'tahap': 'SELESAI_TTD', 'kva': 100, 'adaPdf': true, 'adaTtd': true, 'statusBa': 'ARSIP',
      'statusPdf': 'SELESAI', 'statusPdfV1': 'Selesai', 'urlPdf': 'https://drive.google.com/file/d/x/view', 'urlTtd': 'bukan-link', 'pdfBisa': false,
    });
    final a = b.arsip!;
    expect([b.noGardu, b.tahap, b.pdfBisa, b.statusBa], ['TB0002', 'SELESAI_TTD', false, 'ARSIP']);
    expect([a.arsipId, a.switching, a.nomor, a.kva, a.adaPdf, a.adaTtd, a.statusPdf, a.linkPdf.isNotEmpty, a.linkTtd],
        ['a1', false, 'No. 001 / BA - TRF / ULP - TBL / 3 / 2025', 100, true, true, 'Selesai', true, '']);
    expect(b.denganInfo(const {'tahap': 'DRAFT'}).arsip, isNotNull, reason: 'salinan tetap arsip');
    expect(ItemBa.dariJson(const {'baId': 'x'}).arsip, isNull, reason: 'BA v2');
  });

  test('ItemArsipBa switching + tanpa nomor', () {
    final s = ItemArsipBa.dariJson(const {'arsipId': 'a2', 'peralatan': 'SWITCHING', 'idBa': 'BA-SWT-TBL-202508-001', 'nama': 'LBS Kampung Baru', 'jenisSwitching': 'LBS'});
    expect([s.switching, s.nomor, s.tahap, s.jenisSwitching], [true, 'BA-SWT-TBL-202508-001', 'DRAFT', 'LBS']);
    final k = ItemArsipBa.dariJson(const {'arsipId': 'a3', 'nama': 'TB0421'});
    expect([k.peralatan, k.nomor, k.kva], ['TRAFO', 'Tanpa nomor BA', null]);
  });
}
