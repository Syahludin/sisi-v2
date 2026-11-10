import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/absensi/absensi_model.dart';
import 'package:sisi_row/features/absensi/absensi_teks.dart';

/// v1.0.51: teks WhatsApp dibuat LOKAL di HP (tanpa menunggu server). Harus SAMA PERSIS dengan teksWa_ di
/// backend/src/modules/66_Absensi.js (contoh yang sama dengan tes backend 'teksWa_ mengikuti format WhatsApp').
void main() {
  Map<StatusAbsensi, int> rk({int telat = 0, int tanpaKet = 0, int ket = 0, int tmk = 0, int cuti = 0, int izin = 0}) => {
        StatusAbsensi.telat: telat,
        StatusAbsensi.tanpaKet: tanpaKet,
        StatusAbsensi.ket: ket,
        StatusAbsensi.tmk: tmk,
        StatusAbsensi.cuti: cuti,
        StatusAbsensi.izin: izin,
      };

  const tim = [
    TimAbsensi(timId: 'row', nama: 'Tim Row 1', jenis: 'ROW'),
    TimAbsensi(timId: 'har', nama: 'Hartek', jenis: 'HARTEK'),
    TimAbsensi(timId: 'yan', nama: 'Yandal 13 Toboali', jenis: 'YANDAL'),
    TimAbsensi(timId: 'kos', nama: 'Tim Kosong', jenis: 'ROW'),
  ];

  // status di server hari ini (sudah termasuk dalam rekap server)
  StafAbsensi s(String id, String nama, String timId, [StatusAbsensi? status, String ket = '']) =>
      StafAbsensi(petugasId: id, nama: nama, timId: timId, status: status, keterangan: ket, milikSaya: status != null);

  final staf = [
    s('agus', 'Agus Adi Mulyono', 'row', StatusAbsensi.hadir),
    s('har', 'Haryanto', 'row', StatusAbsensi.hadir),
    s('pal', 'Paltrada', 'row', StatusAbsensi.telat),
    s('rev', 'Revindo', 'row', StatusAbsensi.izin, 'Ada acara keluarga'),
    s('diaz', 'Diaz Azril Akbar', 'har', StatusAbsensi.tanpaKet),
    s('roy', 'Roy Ariski', 'har'),
    s('ipin', 'Ipin Sidik', 'yan', StatusAbsensi.hadir),
    s('yun', 'M.Yunus', 'yan'),
  ];
  final rekapServer = {
    'pal': rk(telat: 1),
    'har': rk(telat: 1, ket: 1),
    'rev': rk(telat: 1, izin: 1),
    'diaz': rk(telat: 1, tanpaKet: 2),
    'roy': rk(tanpaKet: 1),
    'ipin': rk(),
  };

  List<IsianStaf> sesuaiServer() => [for (final x in staf) IsianStaf(x, x.status, x.keterangan)];

  test('format sama dengan backend: angka selalu, urutan simbol tetap, ✅ hanya hari ini, alasan di belakang, Yandal kosong tidak ditulis', () {
    final teks = teksWaAbsensi(tanggal: '2026-10-29', jamSimpan: '07.32', tim: tim, isian: sesuaiServer(), rekapServer: rekapServer);
    expect(teks.split('\n').take(17).toList(), [
      '*Absensi kehadiran safety breafing Oktober 2026*',
      'Kamis, 29 Oktober 2026',
      'Pukul : 07.32 WIB',
      '*Tim Row 1*',
      '* Agus Adi Mulyono ✅',
      '* Haryanto 📌1 *️⃣1 ✅',
      '* Paltrada *️⃣1',
      '* Revindo 🔤1 *️⃣1 Ada acara keluarga',
      '*Hartek*',
      '* Diaz Azril Akbar *️⃣1 ❌2',
      '* Roy Ariski ❌1 ⏳ belum diabsen',
      '*Yandal 13 Toboali*',
      '* Ipin Sidik ✅',
      '*Note/Catatan:*',
      '✅ Hadir Tepat Waktu',
      '❌ Tidak Hadir tanpa Keterangan',
      '*️⃣ Hadir Namun Telat',
    ]);
    expect(teks.contains('M.Yunus'), isFalse, reason: 'staf Yandal yang belum diabsen tidak ditulis');
    expect(teks.contains('Tim Kosong'), isFalse, reason: 'kelompok tanpa baris tidak ditulis');
    expect(teks.contains('⏳ Belum diabsen'), isTrue, reason: 'legenda ⏳ ada');
  });

  test('legenda dan simbol status identik dengan backend (dibaca langsung dari 66_Absensi.js)', () {
    final js = File('../backend/src/modules/66_Absensi.js').readAsStringSync();
    final blok = RegExp(r'var ABS_LEGENDA_ = \[(.*?)\];', dotAll: true).firstMatch(js)!.group(1)!;
    final legendaJs = RegExp(r"'((?:[^'\\]|\\.)*)'").allMatches(blok).map((m) => m.group(1)).toList();
    expect(legendaAbsensi, legendaJs);
    final simbolJs = RegExp(r"(\w+): \{ simbol: '([^']+)'").allMatches(js).map((m) => '${m.group(1)}=${m.group(2)}').toList();
    final simbolDart = [for (final st in StatusAbsensi.values) '${st.kode}=${st.simbol}'];
    expect(simbolDart, simbolJs);
  });

  test('perubahan lokal (pilihan / antrean) menggeser hitungan server: TELAT -> HADIR', () {
    // server: Paltrada telat (rekap TELAT 1 sudah termasuk hari ini). Lokal: diubah jadi Hadir Tepat Waktu.
    final isian = [for (final x in staf) IsianStaf(x, x.petugasId == 'pal' ? StatusAbsensi.hadir : x.status, x.keterangan)];
    final baris = teksWaAbsensi(tanggal: '2026-10-29', jamSimpan: '07.32', tim: tim, isian: isian, rekapServer: rekapServer).split('\n');
    expect(baris, contains('* Paltrada ✅'), reason: 'TELAT hari ini dicabut dari hitungan, ✅ muncul');
  });

  test('perubahan lokal: belum diabsen -> status baru dihitung (hari ini ikut); alasan baru; ganti status tidak menghitung dobel', () {
    final isian = [
      for (final x in staf)
        IsianStaf(
          x,
          switch (x.petugasId) {
            'roy' => StatusAbsensi.izin, // server belum diabsen, rekap server TANPA_KET 1 (hari sebelumnya)
            'diaz' => StatusAbsensi.ket, // server TANPA_KET hari ini (rekap TANPA_KET 2 termasuk hari ini)
            'yun' => StatusAbsensi.telat, // Yandal yang kini diisi: muncul
            _ => x.status,
          },
          switch (x.petugasId) {
            'roy' => 'Sakit tanpa SKS',
            'diaz' => 'Dinas luar',
            _ => x.keterangan,
          },
        ),
    ];
    final baris = teksWaAbsensi(tanggal: '2026-10-29', jamSimpan: '08.10', tim: tim, isian: isian, rekapServer: rekapServer).split('\n');
    expect(baris, contains('* Roy Ariski 🔤1 ❌1 Sakit tanpa SKS'));
    expect(baris, contains('* Diaz Azril Akbar 📌1 *️⃣1 ❌1 Dinas luar'), reason: 'TANPA_KET 2 -> 1 (hari ini diganti), KET +1');
    expect(baris, contains('* M.Yunus *️⃣1'));
    expect(baris, contains('Pukul : 08.10 WIB'));
  });

  test('model: DataAbsensi membaca rekap server per petugas', () {
    final d = DataAbsensi.dariJson({
      'tanggal': '2026-11-02',
      'rekap': {
        'a': {'TELAT': 2, 'TANPA_KET': 0, 'ABSEN': 0, 'KET': 1, 'TMK': 0, 'CUTI': 0, 'IZIN': 0},
      },
    });
    expect(d.rekap['a']![StatusAbsensi.telat], 2);
    expect(d.rekap['a']![StatusAbsensi.ket], 1);
    expect(d.rekap['b'], isNull);
  });
}
