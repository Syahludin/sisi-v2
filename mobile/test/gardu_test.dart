import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:sisi_row/features/gardu/ba_antrean.dart';
import 'package:sisi_row/features/gardu/ba_pengoperasian_screen.dart';
import 'package:sisi_row/features/gardu/ba_repository.dart';
import 'package:sisi_row/features/gardu/gardu_model.dart';
import 'package:sisi_row/features/gardu/gardu_widgets.dart';

Gardu _g(String no, {String status = 'AKTIF', double? persen, double? kva, String penyulang = 'TB-01', String tglUkur = '', String alamat = ''}) =>
    Gardu.dariJson({
      'id': no,
      'no': no,
      'status': status,
      'persen': persen,
      'kva': kva,
      'penyulang': penyulang,
      'tglUkur': tglUkur,
      'alamat': alamat,
    });

/// v0.69.0: saringan & kategori Pengukuran Gardu (range sama v1 / server).
void main() {
  test('kategori beban: < 50 Underload, < 80 Cukup, < 100 Overload, >= 100 Buruk, kosong Belum Diukur', () {
    expect(KategoriBeban.dari(null), KategoriBeban.belum);
    expect(KategoriBeban.dari(49.9), KategoriBeban.underload);
    expect(KategoriBeban.dari(50), KategoriBeban.cukup);
    expect(KategoriBeban.dari(79.99), KategoriBeban.cukup);
    expect(KategoriBeban.dari(80), KategoriBeban.overload);
    expect(KategoriBeban.dari(100), KategoriBeban.buruk);
  });

  test('dariJson: angka dari teks / number, status huruf besar', () {
    final g = Gardu.dariJson({'no': 'tb0001', 'status': 'aktif', 'kva': '100', 'persen': 85.3, 'tahun': 2019.0, 'jumlahBa': 2});
    expect(g.no, 'TB0001');
    expect(g.aktif, isTrue);
    expect(g.kva, 100);
    expect(g.tahun, 2019);
    expect(g.kategori, KategoriBeban.overload);
  });

  test('saringan: status, kategori, penyulang, kapasitas, range, cari, urut', () {
    final semua = [
      _g('TB0003', persen: 120, kva: 100, alamat: 'Jl. Merdeka'),
      _g('TB0001', persen: 30, kva: 50, tglUkur: '2026-01-02'),
      _g('TB0002', persen: 85, kva: 100, penyulang: 'TB-02', tglUkur: '2025-05-01'),
      _g('TB0004', status: 'TIDAK AKTIF', persen: 10),
      _g('TB0005'),
    ];
    const s = SaringGardu();
    expect(s.terapkan(semua).map((g) => g.no), ['TB0001', 'TB0002', 'TB0003', 'TB0005'], reason: 'default: AKTIF, urut nomor');
    expect(s.salin(tidakAktif: true).terapkan(semua).map((g) => g.no), ['TB0004']);
    expect(s.salin(kategori: {KategoriBeban.buruk, KategoriBeban.belum}).terapkan(semua).map((g) => g.no), ['TB0003', 'TB0005']);
    expect(s.salin(penyulang: () => 'tb-02').terapkan(semua).map((g) => g.no), ['TB0002']);
    expect(s.salin(kva: () => 100).terapkan(semua).map((g) => g.no), ['TB0002', 'TB0003']);
    expect(s.salin(minPersen: () => 50, maxPersen: () => 100).terapkan(semua).map((g) => g.no), ['TB0002']);
    expect(s.salin(kata: 'merdeka').terapkan(semua).map((g) => g.no), ['TB0003']);
    expect(s.salin(urut: UrutGardu.bebanTinggi).terapkan(semua).map((g) => g.no), ['TB0003', 'TB0002', 'TB0001', 'TB0005']);
    expect(s.salin(urut: UrutGardu.bebanRendah).terapkan(semua).map((g) => g.no), ['TB0001', 'TB0002', 'TB0003', 'TB0005']);
    expect(s.salin(urut: UrutGardu.ukurLama).terapkan(semua).map((g) => g.no), ['TB0003', 'TB0005', 'TB0002', 'TB0001']);
    expect(s.salin(penyulang: () => 'TB-02').salin(penyulang: () => null).adaSaring, isFalse, reason: 'hapus pilihan');
    final h = hitungKategori(s.dasar(semua));
    expect([h[KategoriBeban.underload], h[KategoriBeban.overload], h[KategoriBeban.buruk], h[KategoriBeban.belum]], [1, 1, 1, 1]);
  });

  test('format angka & tanggal', () {
    expect(angkaId(85.34), '85,3');
    expect(angkaId(100), '100');
    expect(angkaId(null), '-');
    expect(tanggalPendek('2026-09-02'), '2 Sep 2026');
    expect(tanggalPendek('kemarin'), 'kemarin');
  });

  test('v0.70.0: kelengkapan BA Pengoperasian (prefix, section, 4 foto, petugas 1)', () {
    const semua = {'NAMEPLATE', 'FULL_GARDU', 'NAMEPLATE_PHB', 'BOX_PHB'};
    expect(cekKelengkapanBa(prefix: null, sectionId: 's', petugas1Id: 'p', slotTerisi: semua), contains('prefix'));
    expect(cekKelengkapanBa(prefix: 'TB', sectionId: null, petugas1Id: 'p', slotTerisi: semua), contains('section'));
    expect(cekKelengkapanBa(prefix: 'TB', sectionId: 's', petugas1Id: 'p', slotTerisi: {'NAMEPLATE'}),
        'Foto belum lengkap: Foto Full Gardu, Nameplate PHB-TR, Box PHB-TR.');
    expect(cekKelengkapanBa(prefix: 'TB', sectionId: 's', petugas1Id: null, slotTerisi: semua), 'Pilih Petugas 1.');
    expect(cekKelengkapanBa(prefix: 'TB', sectionId: 's', petugas1Id: 'p', slotTerisi: semua), isNull);
  });

  test('v0.70.0: foto galeri PNG / besar jadi JPEG <= 2048 px', () {
    final png = img.encodePng(img.Image(width: 3000, height: 1000));
    final j = siapkanJpegBa(png);
    expect([j[0], j[1]], [0xFF, 0xD8]);
    final d = img.decodeJpg(j)!;
    expect(d.width, 2048);
    expect(d.height, inInclusiveRange(680, 685));
    final kecil = img.encodeJpg(img.Image(width: 640, height: 480));
    expect(identical(siapkanJpegBa(kecil), kecil), isTrue, reason: 'JPEG kecil tidak diubah');
    expect(shaHexBa(kecil).length, 64);
  });

  test('v0.71.0: ItemBa / HasilPdfBa dari jawaban server, PDF siap hanya SELESAI + link https', () {
    final b = ItemBa.dariJson({
      'baId': 'b1', 'idBa': 'BA-GRD-TBL-202610-001', 'noBaFull': 'No. 001 / BA - TRF / ULP - TBL / 10 / 2026', 'jenis': 'Pengoperasian Trafo',
      'noGardu': 'TB0422', 'tanggalBa': '2026-10-09', 'penyulang': 'TB-01', 'statusBa': 'AKTIF', 'statusPdf': 'BELUM', 'urlPdf': '', 'waktuPdf': '',
      'pdfBisa': true,
    });
    expect(b.adaPdf, isFalse);
    expect(b.pdfBisa, isTrue);
    final h = HasilPdfBa.dariJson({'statusPdf': 'SELESAI', 'urlPdf': 'https://drive.google.com/file/d/x/view', 'waktuPdf': '2026-10-09 15:30:00',
      'namaFile': 'BA-Pengoperasian-BA-GRD-TBL-202610-001.pdf', 'fotoHilang': ['Box PHB-TR']});
    final b2 = b.denganPdf(h);
    expect(b2.adaPdf, isTrue);
    expect(b2.noGardu, 'TB0422');
    expect(h.fotoHilang, ['Box PHB-TR']);
    final kosong = ItemBa.dariJson(const {});
    expect([kosong.statusBa, kosong.statusPdf, kosong.pdfBisa], ['AKTIF', 'BELUM', false]);
    expect(ItemBa.dariJson({'statusPdf': 'SELESAI', 'urlPdf': 'http://x'}).adaPdf, isFalse, reason: 'hanya https');
  });

  test('v0.76.0: antrean BA latar belakang: JSON bolak-balik, proses terputus dilanjutkan, gagal tetap gagal', () {
    TugasBa t(TahapBa tahap) => TugasBa(
          baId: 'b1', userId: 'u1', mode: 'BARU', jenis: 'Pengoperasian Trafo', judul: 'PY0242 · Pengoperasian Trafo',
          isi: {'baId': 'b1', 'kva': 100}, prefix: 'PY', tahap: tahap, ket: 'Foto 2/4',
          foto: [
            FotoTugasBa(slot: 'NAMEPLATE', label: 'Nameplate Trafo', path: '/a.jpg', sumber: 'KAMERA', asli: '/a0.jpg',
                wm: {'ulp': 'Toboali', 'bagian': 'Nameplate Trafo', 'waktu': '2026-10-10T01:00:00.000Z', 'noGardu': 'PY0242'}, shaTerkirim: 'ab'),
            FotoTugasBa(slot: 'BOX_PHB', label: 'Box PHB-TR', path: '/b.jpg', sumber: 'GALERI'),
          ],
        );
    final b = TugasBa.dariJson(t(TahapBa.foto).keJson());
    expect([b.baId, b.prefix, b.isi['kva'], b.foto.length, b.foto.first.asli, b.foto.first.wm?['noGardu'], b.foto.first.shaTerkirim, b.foto.last.wm],
        ['b1', 'PY', 100, 2, '/a0.jpg', 'PY0242', 'ab', null]);
    expect(b.tahap, TahapBa.antre, reason: 'app ditutup saat kirim = dilanjutkan');
    expect(TugasBa.dariJson(t(TahapBa.gagal).keJson()).tahap, TahapBa.gagal);
    expect([b.ubah, TugasBa.dariJson({...t(TahapBa.antre).keJson(), 'mode': 'UBAH'}).ubah], [false, true]);
  });

  // v0.78.0: BA TTD dipotong per 2 MB, jenis file dari bytes, filter Daftar BA
  group('v0.78.0 BA TTD + filter', () {
    test('potong 2 MB, bagian terakhir sisa', () {
      final b = Uint8List(ttdBaBagian * 2 + 5);
      final x = potongTtdBa(b);
      expect(x.map((e) => e.length).toList(), [ttdBaBagian, ttdBaBagian, 5]);
      expect(potongTtdBa(Uint8List(10)).length, 1);
    });
    test('mime dari bytes (hanya PDF yang diterima)', () {
      expect(mimeTtdBa(Uint8List.fromList([0x25, 0x50, 0x44, 0x46, 0x2D])), 'application/pdf');
      expect(mimeTtdBa(Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0])), '');
      expect(mimeTtdBa(Uint8List.fromList([1, 2, 3, 4, 5])), '');
    });
    test('filter ke data + salin', () {
      const f = FilterBa();
      expect(f.keData(), {'sumber': 'SEMUA', 'urut': 'TERBARU'});
      final g = f.salin(terlama: true, dari: () => '2026-10-01', jenis: () => 'Pengoperasian Trafo', tahap: () => TahapAlurBa.selesaiTtd);
      expect(g.keData(), {'sumber': 'SEMUA', 'urut': 'TERLAMA', 'dari': '2026-10-01', 'jenis': 'Pengoperasian Trafo', 'tahap': 'SELESAI_TTD'});
      expect(g.salin(sumber: () => 'V1').keData()['sumber'], 'V1');
      expect(g.salin(sumber: () => 'V1').jumlahAktif, 3, reason: 'sumber tampil terpisah, bukan filter lanjutan');
      expect(g.jumlahAktif, 3);
      expect(g.salin(jenis: () => null).jenis, isNull);
    });
    test('ItemBa tahap + PDF baru sesudah TTD = TTD ulang', () {
      final b = ItemBa.dariJson({'baId': 'x', 'statusPdf': 'SELESAI', 'urlPdf': 'https://a', 'tahap': 'SELESAI_TTD', 'statusTtd': 'SUDAH TTD', 'adaTtd': true});
      expect(b.ttdBerlaku, isTrue);
      final c = b.denganPdf(const HasilPdfBa(statusPdf: 'SELESAI', urlPdf: 'https://b', waktuPdf: 'w', namaFile: 'n', fotoHilang: []));
      expect([c.tahap, c.statusTtd, c.ttdBerlaku], ['TTD_ULANG', 'TTD ULANG', false]);
      expect(c.denganInfo({'tahap': 'SELESAI_TTD', 'statusTtd': 'SUDAH TTD'}).ttdBerlaku, isTrue);
    });
  });
}
