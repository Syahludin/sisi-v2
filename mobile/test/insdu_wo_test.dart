import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/insdu/insdu_bantu.dart';
import 'package:sisi_row/features/insjar/insjar_form.dart';
import 'package:sisi_row/features/wo/wo_bantu.dart';

Sesi _sesi(String jenis, List<String> menu) => Sesi.dariLogin({
      'token': 'a' * 64,
      'profil': {'userId': 'u1', 'username': 'x', 'role': 'PETUGAS', 'jenisTim': jenis, 'timId': 't1'},
      'menu': [for (final m in menu) {'kode': m, 'aksi': 'UBAH'}],
      'offlineSampai': '2026-10-21T23:59:59+07:00',
    });

void main() {
  test('v1.0.11: tab Inspeksi Gardu + tab WO dari menu', () {
    expect(_sesi('INSPEKSI_GARDU', ['OPS_INSDU_INPUT']).petugasInsDu, isTrue);
    expect(_sesi('INSPEKSI_GARDU', []).petugasInsDu, isFalse);
    expect(_sesi('ROW', ['OPS_WO_TIM']).petugasWo, isTrue);
    expect(_sesi('INSPEKSI_JARINGAN', ['OPS_WO_TIM']).petugasWo, isFalse);
  });

  test('v1.0.11: hitung beban gardu sama dengan server', () {
    final h = hitungUkurInsDu({'bebanR': 80, 'bebanS': 60, 'bebanT': 70, 'teganganRN': 228, 'teganganSN': 230, 'teganganTN': 229}, 100);
    expect(h.kva, 48.07);
    expect(h.persen, 48.07);
    expect(h.kategori, 'Underload');
    expect(kategoriBebanInsDu(85), 'Overload');
  });

  test('v1.0.11: gardu yang sudah dipakai tidak ditawarkan lagi', () {
    final m = MasterInsDu({
      'gardu': [
        {'garduId': 'a', 'noGardu': 'TB01'},
        {'garduId': 'b', 'noGardu': 'TB02'},
      ],
    });
    expect(garduBelumDipakai(m, [{'garduId': 'a'}]).map((g) => g.noGardu), ['TB02']);
  });

  test('v1.0.11: WO diameter ROW, jenis lokasi Hartek, syarat Selesai', () {
    final j = [
      {'nama': 'Rabas', 'diameterMin': 0, 'diameterMax': 0},
      {'nama': 'Tebang Sedang', 'diameterMin': 25, 'diameterMax': 50},
    ];
    expect(jenisRowDariDiameter(j, 30)?['nama'], 'Tebang Sedang');
    expect(jenisRowDariDiameter(j, 10), isNull);
    expect(jenisPgTemuan({'objekInspeksi': 'Gardu', 'noGardu': 'TB01'}), 'Gardu');
    expect(jenisPgTemuan({'objekInspeksi': 'Gardu'}), 'Jaringan');
    final t = {
      'wo': {'status': 'DIKERJAKAN'},
      'pekerjaanWo': [
        {'status': 'DRAFT', 'foto': {'SEBELUM': 'x'}},
      ],
    };
    expect(alasanBelumSelesai(t, ['SEBELUM', 'SESUDAH']), isNotNull);
    (t['pekerjaanWo'] as List).first['foto'] = {'SEBELUM': 'x', 'SESUDAH': 'y'};
    expect(alasanBelumSelesai(t, ['SEBELUM', 'SESUDAH']), isNull);
    expect(StatusWo.bolehPindah('DIKERJAKAN'), isFalse);
  });

  test('v1.0.15: filter Penerusan WO penyulang + tim inspeksi', () {
    final l = [
      {'penyulang': 'TB-01', 'sumber': 'INSPEKSI', 'tim': 'INSPEKSI 01'},
      {'penyulang': 'TB-02', 'sumber': 'ADMIN', 'tim': ''},
      {'penyulang': 'TB-01', 'sumber': 'INSPEKSI', 'tim': ''},
    ];
    expect(pilihanFilterWo(l, (t) => teksWo(t['penyulang'])), ['TB-01', 'TB-02']);
    expect(pilihanFilterWo(l, timInspeksiWo), ['Admin', 'INSPEKSI 01', 'Petugas']);
    expect(l.where((t) => cocokFilterWo(t, penyulang: 'TB-01', timInspeksi: 'INSPEKSI 01')).length, 1);
    expect(l.where((t) => cocokFilterWo(t)).length, 3);
    expect(tanggalIsoWo(DateTime(2026, 3, 7)), '2026-03-07');
  });

  test('v1.0.11: temuan admin object Gardu kirim garduId, bukan penyulang/section', () {
    final m = MasterInsJar({
      'jenisTemuan': [
        {'nama': 'Trafo bocor', 'jenisTemuanId': 'jt-g'},
      ],
      'gardu': [
        {'garduId': 'gd-a', 'noGardu': 'TB0101', 'penyulang': 'PNY-A', 'section': 'SEC-1'},
      ],
    });
    final p = pisahTemuan({'objekInspeksi': 'Gardu', 'garduId': 'gd-a', 'penyulang': 'PNY-A', 'section': 'SEC-1', 'jenisTemuan': 'Trafo bocor'}, m, admin: true);
    expect(p.data['garduId'], 'gd-a');
    expect(p.data.containsKey('penyulang'), isFalse);
    expect(p.tampil['noGardu'], 'TB0101');
  });
}
