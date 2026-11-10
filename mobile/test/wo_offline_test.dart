import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/features/wo/wo_bantu.dart';
import 'package:sisi_row/features/wo/wo_penerusan.dart';
import 'package:sisi_row/features/wo/wo_simpanan.dart';

void main() {
  test('v1.0.48: teks WA temuan = format v1, foto terlampir / link', () {
    final t = <String, dynamic>{'kodeTemuan': 'IJR-TBL-001', 'penyulang': 'Bikang', 'section': 'LBS A', 'segmen': '', 'jenisTemuan': 'FCO rusak',
      'koordinat': '-3.01, 106.5', 'foto': {'TEMUAN': 'https://drive.google.com/file/d/abc/view'}};
    expect(teksWaTemuanWo(t),
        '*Temuan Inspeksi*\n\nKode Temuan : *IJR-TBL-001*\nPenyulang : Bikang\nSection : LBS A\nSegmen : -\nTemuan : FCO rusak\n\n'
        'Lokasi : https://www.google.com/maps?q=-3.01,106.5\n\nFoto Temuan : https://drive.google.com/file/d/abc/view\n\n*Segera Tindak Lanjut🔥🔥🔥*');
    expect(teksWaTemuanWo(t, fotoTerlampir: true), contains('Foto Temuan : terlampir\n'));
  });

  test('v1.0.47: waktu simpanan offline', () {
    final kini = DateTime(2026, 10, 29, 10);
    expect(waktuSimpanWo(DateTime(2026, 10, 29, 8, 5), kini), 'pukul 08.05');
    expect(waktuSimpanWo(DateTime(2026, 10, 28, 21, 30), kini), 'kemarin pukul 21.30');
    expect(waktuSimpanWo(DateTime(2026, 10, 3, 7, 0), kini), '03/10 pukul 07.00');
    expect(SimpananWo.namaFile('u-1|admin|BARU|2026-10-01'), 'u-1_admin_BARU_2026-10-01.json');
  });

  test('v1.0.47: antrean penerusan tersimpan sampai berhasil, dipulihkan per akun, akun lain tidak tersentuh', () async {
    final dir = await Directory.systemTemp.createTemp('wo_antre');
    final f = File('${dir.path}/antrean.json');
    final q = PenerusanWo.i;
    q.berkas = () async => f;
    q.jedaUlang = (_) => const Duration(hours: 1);
    // akun lain punya item tersimpan
    await f.writeAsString(jsonEncode([
      {'temuanId': 'x-9', 'kode': 'K9', 'judul': 'Diteruskan ke ROW 02', 'aksi': 'teruskanWo', 'data': {'temuanId': 'x-9'}, 'userId': 'u-2'},
    ]));
    // offline: kiriman gagal sinyal = tetap di antrean dan tersimpan
    q.tambah(ItemPenerusanWo(
      temuanId: 't-1', kode: 'K1', judul: 'Diteruskan ke ROW 01', aksi: 'teruskanWo', data: {'temuanId': 't-1', 'timId': 'tim-1', 'revision': 2},
      userId: 'u-1', kirim: () async => throw ApiException('HTTP_0'),
    ));
    await Future<void>.delayed(const Duration(milliseconds: 50));
    await q.tulisSelesai;
    var isi = jsonDecode(await f.readAsString()) as List<dynamic>;
    expect(isi.map((e) => (e as Map)['temuanId']), containsAll(['t-1']));

    // dibatalkan sebelum akun dipulihkan = tidak muncul lagi dari file
    q.batalkan(q.antre.firstWhere((x) => x.temuanId == 't-1'));
    await q.tulisSelesai;
    isi = jsonDecode(await f.readAsString()) as List<dynamic>;
    expect(isi.map((e) => (e as Map)['temuanId']), ['x-9']);
    // app dibuka ulang dengan item tersimpan u-1: pulihkan, kirim berhasil = dihapus dari file
    await f.writeAsString(jsonEncode([
      ...jsonDecode(await f.readAsString()) as List<dynamic>,
      {'temuanId': 't-1', 'kode': 'K1', 'judul': 'Diteruskan ke ROW 01', 'aksi': 'teruskanWo', 'data': {'temuanId': 't-1', 'revision': 2}, 'userId': 'u-1'},
    ]));
    final terkirim = <String>[];
    await q.pulihkan('u-1', (aksi, data) async => terkirim.add('$aksi ${data['temuanId']}'));
    await Future<void>.delayed(const Duration(milliseconds: 50));
    await q.tulisSelesai;
    expect(terkirim, ['teruskanWo t-1']);
    isi = jsonDecode(await f.readAsString()) as List<dynamic>;
    expect(isi.map((e) => (e as Map)['temuanId']), ['x-9'], reason: 'item akun lain tetap, item berhasil dihapus');
    await q.pulihkan('u-1', (a, d) async => terkirim.add('dobel'));
    expect(terkirim, ['teruskanWo t-1'], reason: 'pulihkan sekali per akun');
    q.bersihkanSelesai();
    await dir.delete(recursive: true);
  });
}
