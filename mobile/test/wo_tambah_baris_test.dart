import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/hartek/hartek_form.dart';
import 'package:sisi_row/features/hartek/hartek_lokal.dart';
import 'package:sisi_row/features/wo/wo_bantu.dart';

/// v1.0.23: pekerjaan / material WO Hartek berikutnya muncul hanya lewat tombol tambah (bukan otomatis).
void main() {
  test('baris pekerjaan: pertama langsung tampil, berikutnya hanya sesudah Tambah pekerjaan', () {
    const k = '_tambahPekerjaan';
    expect(barisDitambahWo({}, 'pekerjaan', 15, kunciTambah: k, awal: 1), 1);
    expect(barisDitambahWo({'pekerjaan_1': 'j1'}, 'pekerjaan', 15, kunciTambah: k, awal: 1), 1, reason: 'terisi tidak memunculkan baris baru');
    expect(barisDitambahWo({'pekerjaan_1': 'j1', k: '1'}, 'pekerjaan', 15, kunciTambah: k, awal: 1), 2);
    expect(barisDitambahWo({'pekerjaan_1': 'j1', 'pekerjaan_3': 'j3'}, 'pekerjaan', 15, kunciTambah: k, awal: 1), 3, reason: 'isian lama tetap tampil');
    expect(barisDitambahWo({k: '40'}, 'pekerjaan', 15, kunciTambah: k, awal: 1), 15);
  });

  test('baris material: tidak ada sampai Tambah material diketuk', () {
    const k = '_tambahMaterial_1';
    expect(barisDitambahWo({}, 'material_1', 10, kunciTambah: k), 0);
    expect(barisDitambahWo({k: '1'}, 'material_1', 10, kunciTambah: k), 1);
    expect(barisDitambahWo({'material_1_2': 'm'}, 'material_1', 10, kunciTambah: k), 2);
  });

  // v1.0.24: dulu hitungan tombol ikut dibersihkan saat tombolnya tersembunyi, pekerjaan ke-2 langsung hilang lagi
  testWidgets('+ Tambah pekerjaan memunculkan pekerjaan ke-2 dan tetap tampil', (tester) async {
    List<IsianHartek> daftar(Map<String, String> n) {
      final nPk = barisDitambahWo(n, 'pekerjaan', 5, kunciTambah: '_tambahPekerjaan', awal: 1);
      return [
        for (var i = 1; i <= nPk; i++) IsianHartek('pekerjaan_$i', i == 1 ? 'Pekerjaan' : 'Pekerjaan ke-$i', grup: 'Pekerjaan ke-$i', pilihan: const ['A', 'B']),
        if ((n['pekerjaan_$nPk'] ?? '').isNotEmpty) const IsianHartek('_tambahPekerjaan', 'Tambah pekerjaan', tambah: true, grup: ''),
      ];
    }

    await tester.pumpWidget(MaterialApp(
      home: FormHartekPage(judul: 'Uji', keterangan: '', awal: const {'pekerjaan_1': 'A'}, daftar: daftar, simpan: (_) async => const {}),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Pekerjaan ke-2'), findsNothing);
    await tester.tap(find.text('Tambah pekerjaan'));
    await tester.pumpAndSettle();
    expect(find.text('Pekerjaan ke-2'), findsWidgets);
    expect(find.text('Tambah pekerjaan'), findsNothing, reason: 'tombol tersembunyi sampai pekerjaan ke-2 dipilih');
  });

  test('link foto server kosong = slot belum diisi (foto susulan tetap bisa diambil)', () {
    final p = {'foto': {'SEBELUM': 'https://drive/x', 'PEKERJAAN': '', 'SESUDAH': ''}};
    expect(HartekLokal.fotoDiServer(p).keys, ['SEBELUM']);
  });
}
