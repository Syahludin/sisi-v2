import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/features/gardu/gardu_model.dart';
import 'package:sisi_row/features/yandal/history_gardu_view.dart';
import 'package:sisi_row/features/yandal/p0_model.dart';
import 'package:sisi_row/features/yandal/p0_repository.dart' show P0Repository;

/// v0.74.0: Pengecekan Gardu di HP (logika murni, rumus sama dengan server).
void main() {
  final t0 = DateTime.utc(2026, 10, 8, 2); // 09:00 WIB
  FotoP0 f(int menit, {double? lat = -3.0005, double? lng = 106.5}) =>
      FotoP0(path: '/x/g$menit.jpg', waktu: t0.add(Duration(minutes: menit)), sumber: 'KAMERA', lat: lat, lng: lng, terkunci: true);
  const nilai = <String, double>{
    'bebanR': 80, 'bebanS': 60, 'bebanT': 70, 'bebanN': 12,
    'teganganRS': 395, 'teganganRT': 398, 'teganganST': 396, 'teganganRN': 228, 'teganganSN': 230, 'teganganTN': 229,
  };
  GarduUkurLokal ukur({Map<String, FotoP0> foto = const {}, Map<String, Object>? terkirim, double? kva = 100, bool disimpan = true}) =>
      GarduUkurLokal(
          id: 'g1', garduId: 'gd1', noGardu: 'TB0101', alamat: 'Jl. Sangkar', section: 'FCO Jar', kapasitas: kva,
          garduLat: -3.0, garduLng: 106.5, nilai: nilai, catatan: 'NH kendor', dibuat: t0, foto: foto, terkirim: terkirim,
          disimpan: disimpan);
  P0Lokal p0({Map<String, FotoP0> foto = const {}, GarduUkurLokal? g}) => P0Lokal(
      id: 'p1', userId: 'u', shiftId: 's1', kodeShift: 'Y13-SHF1.001', no: 1, namaPekerjaan: 'Pengecekan Gardu',
      penyulang: 'Tanjung Labu', dibuat: t0, foto: foto, ukurGardu: g);

  test('v0.74.0: 10 nilai + slot foto, hasil ukur sama dengan server, WBP / LWBP', () {
    expect(nilaiGardu.length, 10);
    expect(slotGarduWajib.length, 10);
    expect(slotGardu.last, slotKondisiGardu);
    expect(labelSlotGardu['TEGANGAN_RS'], 'Tegangan R-S');
    expect([p0Gardu('Pengecekan Gardu'), p0Gardu(' pengecekan  GARDU '), p0Gardu('Pengecekan Switching')], [true, true, false]);
    final h = hasilUkurGardu(nilai, 100);
    // v0.75.1: arus maks per fasa = arus nominal 100 kVA / (akar 3 x 400 V); beban tertinggi = max R/S/T
    expect([h.arusMaks, h.bebanMaks, h.kva, h.persen, h.tidakSeimbang], [144.34, 80, 48.07, 48.07, 14.29]);
    expect([hasilUkurGardu(nilai, 50).arusMaks, hasilUkurGardu(nilai, 160).arusMaks], [72.17, 230.94]);
    expect([hasilUkurGardu(nilai, null).persen, hasilUkurGardu(nilai, null).arusMaks], [null, null]);
    expect(hasilUkurGardu(const {}, 100).tidakSeimbang, 0);
    DateTime wib(int jam) => DateTime.utc(2026, 10, 8, jam).subtract(const Duration(hours: 7));
    expect([wib(16), wib(17), wib(21), wib(22), wib(3)].map(waktuBebanGardu).toList(), ['LWBP', 'WBP', 'WBP', 'LWBP', 'LWBP']);
  });

  test('v0.74.0: cek angka: wajib semua, rentang beban 0-3000 A, tegangan 0-1000 V', () {
    expect(P0Repository.cekNilaiGardu(nilai), isNull);
    expect(P0Repository.cekNilaiGardu({...nilai, 'bebanN': null}), 'Isi Beban N (A).');
    expect(P0Repository.cekNilaiGardu({...nilai, 'bebanR': 3001}), startsWith('Beban R harus'));
    expect(P0Repository.cekNilaiGardu({...nilai, 'teganganTN': -1}), startsWith('Tegangan T-N harus'));
  });

  test('v0.75.0: foto urutan bebas, Sesudah P0 terkunci sampai 10 foto lengkap + disimpan, jarak ke gardu', () {
    final sebelum = {'SEBELUM': f(0), 'PEKERJAAN': f(5)};
    final tanpa = p0(foto: sebelum);
    expect([tanpa.butuhGardu, tanpa.bolehTambahGardu, tanpa.bolehFoto('SESUDAH')], [true, true, false]);
    expect(tanpa.alasanBelumBoleh('SESUDAH'), 'Simpan pengukuran gardu dulu.');
    final g = ukur();
    // v0.75.0: semua foto langsung bisa diambil, tanpa menunggu Beban R / Simpan
    expect([g.bolehFoto('BEBAN_R'), g.bolehFoto('BEBAN_S'), g.bolehFoto(slotKondisiGardu)], [true, true, true]);
    expect(g.alasanBelumBoleh('BEBAN_S'), isNull);
    final r = g.denganFoto('BEBAN_R', f(6));
    expect([r.bolehFoto('BEBAN_R'), r.bolehFoto('TEGANGAN_TN'), r.jumlahFotoWajib], [false, true, 1]);
    expect(r.jarakM, 56);
    final sembilan = {for (final s in slotGarduWajib.take(9)) s: f(7)};
    final hampir = p0(foto: sebelum, g: ukur(foto: sembilan));
    expect([hampir.bolehFoto('SESUDAH'), hampir.alasanBelumBoleh('SESUDAH')], [false, 'Lengkapi foto ukur gardu dulu (9 dari 10).']);
    final lengkap = p0(foto: sebelum, g: ukur(foto: {for (final s in slotGarduWajib) s: f(7)}));
    expect([lengkap.ukurGarduLengkap, lengkap.bolehFoto('SESUDAH'), lengkap.bolehTambahGardu], [true, true, false]);
    expect(r.alasanBelumBoleh('BEBAN_R'), startsWith('Foto Beban R sudah disimpan'));
  });

  test('v0.75.0: draf pengukuran: foto lengkap tapi belum Simpan = Sesudah terkunci, tidak dikirim, JSON bolak-balik', () {
    final sebelum = {'SEBELUM': f(0), 'PEKERJAAN': f(5)};
    final semua = {for (final s in slotGarduWajib) s: f(7)};
    final draf = ukur(foto: semua, disimpan: false);
    final x = p0(foto: sebelum, g: draf);
    expect([x.ukurGarduLengkap, x.bolehFoto('SESUDAH'), x.bolehTambahGardu, draf.perluKirim], [false, false, true, false]);
    expect(x.alasanBelumBoleh('SESUDAH'), 'Simpan pengukuran gardu dulu.');
    expect(x.keJson()['ukurGardu'], containsPair('disimpan', false));
    final balik = P0Lokal.dariJson(x.keJson()).ukurGardu!;
    expect([balik.disimpan, balik.jumlahFotoWajib], [false, 10]);
    final simpan = draf.disimpanDari(nilai, 'ok', t0.add(const Duration(minutes: 9)));
    expect([simpan.disimpan, simpan.perluKirim, simpan.catatan, p0(foto: sebelum, g: simpan).bolehFoto('SESUDAH')], [true, true, 'ok', true]);
    expect(ukur().keJson().containsKey('disimpan'), isFalse, reason: 'tersimpan = kunci tidak ditulis (JSON lama tetap sah)');
    final isi = draf.denganDraf({'bebanR': 81}, 'c');
    expect([isi.nilai['bebanR'], isi.nilai.length, isi.catatan, isi.disimpan], [81, 1, 'c', false]);
  });

  test('v0.75.0: aturan Pengukuran Gardu 2 Hari Sekali (petunjuk di HP)', () {
    expect(bisaUkurLagi('2026-10-09', '2026-10-10'), '2026-10-11');
    expect(bisaUkurLagi('2026-10-10', '2026-10-10'), '2026-10-12');
    expect(bisaUkurLagi('2026-10-08', '2026-10-10'), isNull);
    expect(bisaUkurLagi('2026-10-09 14:30:00', '2026-10-10'), '2026-10-11');
    expect(bisaUkurLagi('', '2026-10-10'), isNull);
    expect(bisaUkurLagi('2026-09-30', '2026-10-01'), '2026-10-02', reason: 'lintas bulan');
  });

  test('v0.74.0: perlu kirim data (baru / koreksi) + foto, jawaban server, JSON bolak-balik', () {
    final g = ukur();
    expect([g.perluKirimData, g.perluKirim], [true, true]);
    final dikirim = g.isiKirim;
    final s = g.denganServer({'kodeUkur': 'P0.001-GRD.001', 'fotoServer': <String>[], 'hasil': {'kva': 48.07}, 'diterapkan': ''},
        dikirim: dikirim);
    expect([s.perluKirimData, s.kodeResmi, s.server['kva']], [false, 'P0.001-GRD.001', 48.07]);
    final koreksi = s.denganNilai({...nilai, 'bebanR': 160}, 'NH kendor');
    expect(koreksi.perluKirimData, isTrue);
    expect(s.denganNilai(nilai, 'catatan lain').perluKirimData, isTrue);
    final foto = s.denganFoto('BEBAN_R', f(6));
    expect([foto.perluKirimData, foto.perluKirim], [false, true]);
    final terima = foto.denganServer({'kodeUkur': 'P0.001-GRD.001', 'fotoServer': ['BEBAN_R'], 'diterapkan': ''}, dikirim: foto.terkirim);
    expect([terima.foto['BEBAN_R']!.terkirim, terima.perluKirim], [true, false]);
    final x = p0(foto: {'SEBELUM': f(0)}, g: terima);
    final balik = P0Lokal.dariJson(x.keJson());
    final gb = balik.ukurGardu!;
    expect([gb.noGardu, gb.kapasitas, gb.nilai['teganganSN'], gb.catatan, gb.kodeResmi, gb.perluKirim, gb.foto['BEBAN_R']!.terkirim],
        ['TB0101', 100, 230, 'NH kendor', 'P0.001-GRD.001', false, true]);
    expect(P0Lokal.dariJson(p0().keJson()).ukurGardu, isNull);
  });

  test('v0.98.13: gabungGarduUkurTerbaru & kelompokHistoryGardu (history pengukuran gardu 2 hari terakhir)', () {
    final g1 = Gardu.dariJson({'id': 'gd1', 'no': 'TB0101', 'status': 'AKTIF', 'penyulang': 'Tanjung Labu', 'tglUkur': '2026-10-01', 'kva': 100});
    final g2 = Gardu.dariJson({'id': 'gd2', 'no': 'TB0102', 'status': 'AKTIF', 'penyulang': 'Tanjung Labu', 'tglUkur': '2026-10-15', 'kva': 50});
    final g3 = Gardu.dariJson({'id': 'gd3', 'no': 'TB0103', 'status': 'AKTIF', 'penyulang': 'Kejaksaan', 'tglUkur': '', 'kva': 160});
    final gabungan = gabungGarduUkurTerbaru(
      [g1, g2, g3],
      [
        {'garduId': 'gd1', 'noGardu': 'TB0101', 'tanggal': '2026-10-16', 'bebanKva': 45.0, 'persen': 45.0, 'waktuBeban': 'LWBP'},
      ],
    );
    final k = kelompokHistoryGardu(gabungan, '2026-10-16');
    expect(k.diukur2Hari.map((g) => g.no), ['TB0101', 'TB0102'], reason: 'TB0101 (hari ini) & TB0102 (kemarin) masuk 2 hari terakhir');
    expect(k.siapDiukur.map((g) => g.no), ['TB0103'], reason: 'TB0103 belum diukur 2 hari terakhir -> siap diukur');
    final kPny = kelompokHistoryGardu(gabungan, '2026-10-16', penyulang: 'Kejaksaan');
    expect([kPny.diukur2Hari.length, kPny.siapDiukur.map((g) => g.no)], [0, ['TB0103']]);
  });
}
