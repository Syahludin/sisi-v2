import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/features/gardu/ba_bantu.dart';
import 'package:sisi_row/features/gardu/ba_penggantian_screen.dart';
import 'package:sisi_row/features/gardu/berita_acara_screen.dart';

void main() {
  test('v0.72.0: kVA dropdown = standar + kVA bulat Master Gardu, urut, tanpa ganda', () {
    final p = pilihanKvaBa([100, 33, 33, 12.5, null, 0, 9000, 1250]);
    expect(p.first, 25);
    expect(p.contains(33), isTrue);
    expect(p.contains(1250), isTrue);
    expect(p.where((k) => k == 100).length, 1);
    expect(p.contains(12), isFalse, reason: 'desimal tidak masuk');
    expect(p.contains(9000), isFalse, reason: 'di luar 1-5000');
    expect(p, [...p]..sort());
  });

  test('v0.72.0: angka isian: koma = titik, kosong / "-" = tidak diisi, batas sama server', () {
    expect(angkaIsianBa('2,7'), 2.7);
    expect(angkaIsianBa('2.7'), 2.7);
    expect(angkaIsianBa(' - '), isNull);
    expect(angkaIsianBa(''), isNull);
    expect(cekAngkaBa('0', min: 0, max: 100, wajib: false), isNull);
    expect(cekAngkaBa('-', min: 0, max: 100, wajib: false), isNull);
    expect(cekAngkaBa('2,7', min: 0, max: 100, wajib: false), isNull);
    expect(cekAngkaBa('123', min: 1950, max: 2027, wajib: false, bulat: true), 'Harus 1950 sampai 2027', reason: 'kasus Tahun PHB-TR 123');
    expect(cekAngkaBa('4,5', min: 1, max: 12, bulat: true), 'Harus angka bulat');
    expect(cekAngkaBa('abc', min: 1, max: 12), 'Harus angka');
    expect(cekAngkaBa('', min: 1, max: 12), 'Wajib diisi');
  });

  test('v0.72.0: pesan gagal menyebut isian dari kolom server', () {
    expect(pesanApiBa(ApiException('DI_LUAR_RENTANG', kolom: 'tahunPhb')), contains('Tahun PHB-TR'));
    expect(pesanApiBa(ApiException('HARUS_BULAT', kolom: 'jurusan')), contains('Jurusan Terpasang'));
    expect(pesanApiBa(ApiException('DI_LUAR_RENTANG')), isNot(contains('"')));
  });

  test('v0.72.0: chip akurasi GPS bagus / sedang / lemah', () {
    expect(akurasiBa(3.2).teks, 'GPS ±3.2 m · bagus');
    expect(akurasiBa(12).teks, contains('sedang'));
    expect(akurasiBa(40).teks, 'GPS ±40 m · lemah');
  });

  test('v0.72.0: watermark kamera BA: No Gardu, bagian foto, tanggal, koordinat (GPS ±m / input)', () {
    final t = DateTime.utc(2026, 10, 9, 11, 30, 5); // 18:30:05 WIB
    final w = watermarkBa(ulp: 'Toboali', jenisBa: 'Pengoperasian Trafo', noGardu: 'PY0242', bagian: 'Nameplate Trafo', waktu: t,
        koordinat: '-2.102760, 106.116017', akurasiM: 4.4);
    expect(w.judul, 'BA Pengoperasian Trafo');
    expect(w.baris.map((b) => b.$1).toList(), ['No Gardu', 'Foto', 'Tanggal', 'Koordinat']);
    expect(w.baris[0].$2, 'PY0242');
    expect(w.baris[1].$2, 'Nameplate Trafo');
    expect(w.baris[2].$2, '09/10/2026 18:30:05 WIB');
    expect(w.baris[3].$2, '-2.102760, 106.116017 (±4 m)');
    final m = watermarkBa(ulp: 'Toboali', jenisBa: 'Pengoperasian Trafo', noGardu: '', bagian: 'Box PHB-TR', waktu: t, koordinat: '-3.0, 106.5');
    expect(m.baris[0].$2, '-');
    expect(m.baris[3].$2, '-3.0, 106.5 (input)');
    expect(watermarkBa(ulp: 'T', jenisBa: 'X', noGardu: 'A', bagian: 'B', waktu: t).baris[3].$2, '-');
  });

  test('v0.72.0 / v0.98.0: hub BA: tiap jenis punya kalimat "kapan" + alur status, Pengoperasian & Penggantian siap', () {
    for (final j in KatalogBa.trafo) {
      expect(j.kapan.isNotEmpty, isTrue, reason: j.nama);
    }
    expect(KatalogBa.trafo.where((j) => j.siap).map((j) => j.nama), ['Pengoperasian Trafo', 'Penggantian Trafo']);
    expect(KatalogBa.trafo.first.alur, [('', 'AKTIF')]);
    expect(KatalogBa.trafo.firstWhere((j) => j.nama == 'Penggantian Trafo').alur, [('AKTIF', 'AKTIF'), ('TIDAK AKTIF', 'AKTIF')]);
    expect(KatalogBa.trafo.firstWhere((j) => j.nama == 'Pemeriksaan Trafo').alur, isEmpty);
  });

  test('v0.98.0: cekKelengkapanPenggantianBa mewajibkan gardu, 2 foto nameplate, dan Petugas 1', () {
    expect(
      cekKelengkapanPenggantianBa(garduId: null, petugas1Id: 'p1', slotTerisi: {'NAMEPLATE', 'NAMEPLATE_SESUDAH'}),
      'Pilih gardu dari Master Gardu dulu.',
    );
    expect(
      cekKelengkapanPenggantianBa(garduId: 'g1', petugas1Id: 'p1', slotTerisi: {'NAMEPLATE'}),
      'Foto belum lengkap: Nameplate Trafo Sesudah.',
    );
    expect(
      cekKelengkapanPenggantianBa(garduId: 'g1', petugas1Id: null, slotTerisi: {'NAMEPLATE', 'NAMEPLATE_SESUDAH'}),
      'Pilih Petugas 1.',
    );
    expect(
      cekKelengkapanPenggantianBa(garduId: 'g1', petugas1Id: 'p1', slotTerisi: {'NAMEPLATE', 'NAMEPLATE_SESUDAH'}),
      isNull,
    );
  });

  test('v0.72.0: progres simpan: rasio + gagal menyimpan pesan', () {
    final p = ProgresSimpanBa([LangkahSimpan('a'), LangkahSimpan('b')]);
    expect(p.rasio, 0);
    p.atur(0, StatusLangkah.selesai);
    expect(p.rasio, .5);
    p.gagal(1, 'Isian salah');
    expect(p.galat, 'Isian salah');
    expect(p.langkah[1].status, StatusLangkah.gagal);
  });
}
