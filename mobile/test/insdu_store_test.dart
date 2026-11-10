import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/hartek/hartek_lokal.dart';
import 'package:sisi_row/features/hartek/hartek_store.dart';
import 'package:sisi_row/features/insdu/insdu_bantu.dart';
import 'package:sisi_row/features/insdu/insdu_lokal.dart';
import 'package:sisi_row/features/insdu/insdu_store.dart';

/// Gudang di memori (salinan op dikembalikan, seperti sqflite).
class _Gudang implements GudangHartek {
  final docs = <String, String>{};
  final antre = <OpHartek>[];
  var _id = 0;

  OpHartek _salin(OpHartek o) => OpHartek(
      id: o.id, userId: o.userId, tanggal: o.tanggal, aksi: o.aksi, target: o.target, data: {...o.data}, status: o.status, galat: o.galat);

  @override
  Future<String?> bacaDoc(String userId, String tanggal) async => docs['$userId|$tanggal'];
  @override
  Future<void> tulisDoc(String userId, String tanggal, String json) async => docs['$userId|$tanggal'] = json;
  @override
  Future<void> hapusDoc(String userId, String tanggal) async => docs.remove('$userId|$tanggal');
  @override
  Future<List<OpHartek>> ops(String userId) async => [for (final o in antre) if (o.userId == userId) _salin(o)];
  @override
  Future<int> tambahOp(OpHartek op) async {
    op.id = ++_id;
    antre.add(_salin(op));
    return op.id;
  }

  @override
  Future<void> ubahOp(OpHartek op) async {
    final i = antre.indexWhere((o) => o.id == op.id);
    if (i >= 0) antre[i] = _salin(op);
  }

  @override
  Future<void> aturStatusOp(int id, String status, String? galat) async {
    for (final o in antre) {
      if (o.id == id) {
        o.status = status;
        o.galat = galat;
      }
    }
  }

  @override
  Future<void> hapusOp(int id) async => antre.removeWhere((o) => o.id == id);
  @override
  Future<void> bersihkan(String userId, String sebelumTanggal) async {}
  @override
  Future<({String json, DateTime diambil})?> bacaMaster(String kunci) async => null;
  @override
  Future<void> tulisMaster(String kunci, String json) async {}
}

final _sesi = Sesi.dariLogin({
  'token': 'a' * 64,
  'profil': {'userId': 'u-igd', 'username': 'igd', 'role': 'PETUGAS', 'jenisTim': 'INSPEKSI_GARDU', 'timId': 'tim-g1'},
  'menu': [
    {'kode': 'OPS_INSDU_INPUT', 'aksi': 'UBAH'},
  ],
  'offlineSampai': '2026-10-22T23:59:59+07:00',
});

const _nilai = <String, num>{
  'teganganRS': 395, 'teganganRT': 398, 'teganganST': 396, 'teganganRN': 228, 'teganganSN': 230, 'teganganTN': 229,
  'bebanR': 80, 'bebanS': 60, 'bebanT': 70, 'bebanN': 12,
};
const _cover = <String, String>{
  'coverFcoAtas': 'Lengkap', 'coverFcoBawah': 'Lengkap', 'coverBushingTm': 'Lengkap', 'coverBushingTr': 'Lengkap',
  'coverArrester': 'Lengkap', 'jumperanAtas': 'A3C', 'jumperanBawah': 'A3C',
};

({InsDuStore store, _Gudang gudang, List<String> panggil, Map<String, dynamic> srv}) _konteks({bool offline = false, Set<String> tolak = const {}}) {
  final g = _Gudang();
  final panggil = <String>[];
  final srv = <String, dynamic>{'tanggal': '2026-10-21', 'header': null, 'realisasi': <dynamic>[], 'tunggakan': null};
  final store = InsDuStore(g, (s, aksi, data) async {
    if (offline) throw ApiException('HTTP_0');
    panggil.add(aksi);
    if (tolak.contains(aksi)) throw ApiException('PILIHAN_TIDAK_VALID');
    switch (aksi) {
      case 'buatHeaderInsDu':
        return {'headerId': data['headerId'], 'kodeHeader': 'IGD-16130261021001'};
      case 'simpanRealisasiInsDu':
        return {'realisasiId': data['idBaris'], 'kodeRealisasi': 'IGD-16130261021001-GDU.001', 'temuanTertinggal': [{'jenisTemuan': 'Trafo bocor'}]};
      case 'simpanPengukuranInsDu':
        return {
          'statusUkur': 'LWBP',
          'pengukuran': {'lwbp': {'kva': 48.07, 'persen': 48.07, 'kategori': 'Underload'}, 'wbp': null, 'cover': data, 'catatan': ''},
        };
      case 'simpanTemuanInsDu':
        return {'temuanId': data['idBaris'], 'kodeTemuan': 'IGD-16130261021001-GDU.001-TGD.001', 'revision': 1};
      case 'uploadFotoInsDu':
        return {'link': 'https://drive/x', 'revision': 2};
      case 'getInsDuHarian':
        return srv;
    }
    return {};
  }, jam: () => DateTime.utc(2026, 10, 21, 3), bacaFoto: (p) async => [0xFF, 0xD8, 1, 2], hapusFoto: (p) async {})
    ..folderFoto = '';
  return (store: store, gudang: g, panggil: panggil, srv: srv);
}

void main() {
  test('v1.0.12 insdu offline: semua isian antre di HP lalu terkirim berurutan, kode server masuk dokumen', () async {
    final x = _konteks();
    await x.store.buatHeader(_sesi, {'kmAwal': 5});
    final rid = await x.store.tambahGardu(_sesi, 'gd-a', 'Tier 1', {'noGardu': 'TB0101', 'kapasitasKva': 100});
    await expectLater(x.store.tambahGardu(_sesi, 'gd-a', 'Tier 1', const {}), throwsA(isA<ApiException>()));
    await expectLater(x.store.simpanUkur(_sesi, rid, 'WBP', _nilai), throwsA(isA<ApiException>()), reason: 'WBP sebelum LWBP');
    await x.store.simpanUkur(_sesi, rid, 'LWBP', _nilai, cover: _cover);
    await x.store.tambahTemuan(_sesi, rid, {'jenisTemuanId': 'jt-g'}, {'jenisTemuan': 'Trafo bocor'}, foto: {'TEMUAN': '/f/a.jpg'});
    var d = await x.store.doc(_sesi);
    final r = InsDuLokal.realisasi(d, rid)!;
    expect(r['masukLaporan'], isTrue, reason: 'LWBP di HP = masuk laporan');
    expect((r['pengukuran'] as Map)['lwbp']['kva'], 48.07);
    expect(InsDuLokal.hitung(d).menunggu, 5);
    expect(x.gudang.antre.map((o) => o.aksi), ['buatHeader', 'simpanRealisasi', 'simpanUkur', 'simpanTemuan', 'uploadFoto']);

    final k = await x.store.kirim(_sesi);
    expect(k.terkirim, 5);
    expect(x.panggil, ['buatHeaderInsDu', 'simpanRealisasiInsDu', 'simpanPengukuranInsDu', 'simpanTemuanInsDu', 'uploadFotoInsDu']);
    expect(x.gudang.antre, isEmpty);
    d = await x.store.doc(_sesi);
    expect(InsDuLokal.header(d)!['kodeHeader'], 'IGD-16130261021001');
    expect(InsDuLokal.realisasi(d, rid)!['temuanTertinggal'], hasLength(1));
    expect(InsDuLokal.hitung(d), (menunggu: 0, gagal: 0));
  });

  test('v1.0.12 insdu offline: tanpa sinyal antrean tetap di HP (tidak ditandai ditolak)', () async {
    final x = _konteks(offline: true);
    await x.store.buatHeader(_sesi, const {});
    await expectLater(x.store.kirim(_sesi), throwsA(isA<ApiException>()));
    expect(x.gudang.antre.single.status, OpHartek.menunggu);
  });

  test('v1.0.12 insdu: tunggakan WBP memblokir Laporan Utama baru, WBP susulan di HP membuka blokir', () async {
    final x = _konteks();
    x.srv['tunggakan'] = {
      'headerId': 'h-lama',
      'kodeHeader': 'IGD-16130261020001',
      'tanggal': '2026-10-20',
      'realisasi': [
        {'realisasiId': 'r-lama', 'kodeRealisasi': 'IGD-16130261020001-GDU.001', 'noGardu': 'TB0102', 'pengukuran': {'lwbp': {'kva': 1}, 'wbp': null}},
      ],
    };
    await x.store.tarik(_sesi);
    await expectLater(x.store.buatHeader(_sesi, const {}), throwsA(isA<ApiException>()));
    await expectLater(x.store.simpanUkur(_sesi, 'r-lama', 'LWBP', _nilai, cover: _cover), throwsA(isA<ApiException>()),
        reason: 'gardu tunggakan hanya WBP');
    await x.store.simpanUkur(_sesi, 'r-lama', 'WBP', _nilai);
    await x.store.buatHeader(_sesi, const {});
    expect(x.gudang.antre.map((o) => o.aksi), ['simpanUkur', 'buatHeader'], reason: 'WBP susulan terkirim lebih dulu');
    // tarik ulang (server belum menerima WBP): tanda HP tetap
    await x.store.tarik(_sesi);
    final d = await x.store.doc(_sesi);
    expect(InsDuLokal.tunggakanTerbuka(d), isEmpty);
  });

  test('v1.0.16 insdu: gardu tunggakan tanpa LWBP = LWBP + WBP susulan di HP; hapus gardu tunggakan lewat server', () async {
    final x = _konteks();
    x.srv['tunggakan'] = {
      'headerId': 'h-lama',
      'kodeHeader': 'IGD-16130261020001',
      'tanggal': '2026-10-20',
      'realisasi': [
        {'realisasiId': 'r-a', 'noGardu': 'TB0101', 'tier': 'Tier 1', 'kurang': 'LWBP', 'kapasitasKva': 100, 'revision': 1, 'pengukuran': null},
        {'realisasiId': 'r-b', 'noGardu': 'TB0102', 'tier': 'Tier 1', 'kurang': 'LWBP', 'revision': 3, 'pengukuran': null},
      ],
    };
    await x.store.tarik(_sesi);
    var d = await x.store.doc(_sesi);
    expect([for (final r in InsDuLokal.tunggakanTerbuka(d)) periodeSusulanInsDu(r)], ['LWBP', 'LWBP']);
    expect(teksTunggakanInsDu(InsDuLokal.tunggakan(d)!), contains('TB0101, TB0102'));
    await expectLater(x.store.simpanUkur(_sesi, 'r-a', 'WBP', _nilai), throwsA(isA<ApiException>()), reason: 'tetap LWBP dulu');
    await x.store.simpanUkur(_sesi, 'r-a', 'LWBP', _nilai, cover: _cover);
    d = await x.store.doc(_sesi);
    expect(periodeSusulanInsDu(InsDuLokal.garduUkur(d, 'r-a')!), 'WBP');
    await x.store.simpanUkur(_sesi, 'r-a', 'WBP', _nilai);
    // gardu kedua dihapus dari laporan kemarin (langsung ke server)
    x.srv['tunggakan'] = null;
    await x.store.hapusTunggakan(_sesi, 'r-b');
    expect(x.panggil, containsAllInOrder(['hapusRealisasiInsDu', 'getInsDuHarian']));
    d = await x.store.doc(_sesi);
    expect(InsDuLokal.tunggakanTerbuka(d), isEmpty, reason: 'LWBP + WBP r-a menunggu kirim di HP, r-b dihapus');
    expect(x.gudang.antre.map((o) => '${o.aksi}:${o.data['periode']}'), ['simpanUkur:LWBP', 'simpanUkur:WBP']);
    await x.store.buatHeader(_sesi, const {});
  });

  test('v1.0.12 insdu: pengukuran ditolak = tanda merah, buang = nilai server lama dipulihkan', () async {
    final x = _konteks(tolak: {'simpanPengukuranInsDu'});
    await x.store.buatHeader(_sesi, const {});
    final rid = await x.store.tambahGardu(_sesi, 'gd-a', 'Tier 1', const {'noGardu': 'TB0101'});
    await x.store.simpanUkur(_sesi, rid, 'LWBP', _nilai, cover: _cover);
    final k = await x.store.kirim(_sesi);
    expect(k.gagal, 1);
    var d = await x.store.doc(_sesi);
    expect(InsDuLokal.realisasi(d, rid)![InsDuLokal.kunciUkur('LWBP')], HartekLokal.gagal);
    await x.store.buangUkur(_sesi, rid, 'LWBP');
    d = await x.store.doc(_sesi);
    expect(InsDuLokal.realisasi(d, rid)!['masukLaporan'], isFalse);
    expect(x.gudang.antre.where((o) => o.aksi == 'simpanUkur'), isEmpty);
  });

  test('v1.0.14 insdu: Tier 2 saja tanpa pengukuran (langsung masuk laporan), ubah tier / gardu dengan kunci', () async {
    final x = _konteks();
    await x.store.buatHeader(_sesi, const {});
    final r2 = await x.store.tambahGardu(_sesi, 'gd-b', 'Tier 2', const {'noGardu': 'TB0102'});
    final rd = await x.store.tambahGardu(_sesi, 'gd-a', 'Tier 1 & Tier 2', const {'noGardu': 'TB0101'});
    var d = await x.store.doc(_sesi);
    expect([InsDuLokal.realisasi(d, r2)!['statusUkur'], InsDuLokal.realisasi(d, r2)!['masukLaporan']], ['TANPA_UKUR', true]);
    expect([InsDuLokal.realisasi(d, rd)!['statusUkur'], InsDuLokal.realisasi(d, rd)!['masukLaporan']], ['BELUM', false]);
    await expectLater(x.store.simpanUkur(_sesi, r2, 'LWBP', _nilai, cover: _cover), throwsA(isA<ApiException>()));
    await x.store.simpanUkur(_sesi, rd, 'LWBP', _nilai, cover: _cover);
    await expectLater(x.store.ubahGardu(_sesi, rd, 'Tier 2'), throwsA(isA<ApiException>()), reason: 'pengukuran ada, Tier 1 wajib');
    await x.store.ubahGardu(_sesi, r2, 'Tier 1 & Tier 2', g: GarduInsDu(const {'garduId': 'gd-c', 'noGardu': 'TB0103'}));
    d = await x.store.doc(_sesi);
    final r = InsDuLokal.realisasi(d, r2)!;
    expect([r['tier'], r['noGardu'], r['statusUkur'], r['masukLaporan']], ['Tier 1 & Tier 2', 'TB0103', 'BELUM', false]);
    // gardu belum diterima server: perubahan menyatu ke kiriman simpanRealisasi (bukan antrean ubah)
    final op = x.gudang.antre.where((o) => o.target == r2).single;
    expect([op.aksi, op.data['garduId'], op.data['tier']], ['simpanRealisasi', 'gd-c', 'Tier 1 & Tier 2']);
    await x.store.kirim(_sesi);
    // sesudah diterima server: ubah = antrean ubahRealisasi + revision
    await x.store.ubahGardu(_sesi, r2, 'Tier 1');
    expect(x.gudang.antre.single.aksi, 'ubahRealisasi');
    await x.store.kirim(_sesi);
    expect(x.panggil.last, 'ubahRealisasiInsDu');
  });

  test('v1.0.38 insdu: koreksi kapasitas / merk trafo ikut kiriman + tampil di HP; tanpa koreksi = tidak dikirim', () async {
    final x = _konteks();
    await x.store.buatHeader(_sesi, const {});
    final ra = await x.store.tambahGardu(_sesi, 'gd-a', 'Tier 1', const {'noGardu': 'TB0101', 'kapasitasKva': 100, 'merkTrafo': 'Trafindo'},
        kapasitasKva: 200, merkTrafo: 'Sintra');
    final rb = await x.store.tambahGardu(_sesi, 'gd-b', 'Tier 1', const {'noGardu': 'TB0102', 'kapasitasKva': 50});
    var d = await x.store.doc(_sesi);
    expect([InsDuLokal.realisasi(d, ra)!['kapasitasKva'], InsDuLokal.realisasi(d, ra)!['merkTrafo']], [200, 'Sintra']);
    final opA = x.gudang.antre.firstWhere((o) => o.target == ra), opB = x.gudang.antre.firstWhere((o) => o.target == rb);
    expect([opA.data['kapasitasKva'], opA.data['merkTrafo']], [200, 'Sintra']);
    expect([opB.data.containsKey('kapasitasKva'), opB.data.containsKey('merkTrafo')], [false, false], reason: 'nilai master tidak dikirim ulang');
    // pengukuran memakai kapasitas koreksi (kVA sama, persen = kVA / 200)
    await x.store.simpanUkur(_sesi, ra, 'LWBP', _nilai, cover: _cover);
    d = await x.store.doc(_sesi);
    expect((InsDuLokal.realisasi(d, ra)!['pengukuran'] as Map)['lwbp']['persen'], closeTo(24.04, 0.01));
    // sesudah diterima server: koreksi kapasitas = antrean ubahRealisasi berisi kapasitasKva
    await x.store.kirim(_sesi);
    await x.store.ubahGardu(_sesi, ra, 'Tier 1', kapasitasKva: 160);
    final op = x.gudang.antre.single;
    expect([op.aksi, op.data['kapasitasKva'], op.data.containsKey('merkTrafo')], ['ubahRealisasi', 160, false]);
  });

  test('v1.0.14 insdu: teks WA per penyulang, data PHB-TR dari master, Tier 2 tanpa baris beban, Nihil', () {
    final g = GarduInsDu(const {'garduId': 'gd-a', 'noGardu': 'TB0101', 'merkPhb': 'Schneider', 'seriPhb': 'S-1', 'tahunPhb': '2020'});
    final teks = waTeksInsDu(
      tanggalTampil: 'Rabu, 21 Oktober 2026',
      header: const {'koordinatAwal': '-3.1, 106.5', 'kmAwal': 10, 'kmAkhir': 25},
      gardu: {'gd-a': g},
      realisasi: [
        {
          'garduId': 'gd-a', 'noGardu': 'TB0101', 'penyulang': 'PNY-A', 'section': 'SEC-1', 'merkTrafo': 'Trafindo', 'kapasitasKva': 100,
          'tier': 'Tier 1 & Tier 2', 'masukLaporan': true,
          'pengukuran': {'lwbp': {'kva': 48.07, 'persen': 48.07}, 'wbp': null},
          'temuan': [{'jenisTemuan': 'Trafo bocor'}],
        },
        {'garduId': 'gd-b', 'noGardu': 'TB0102', 'penyulang': 'PNY-A', 'section': 'SEC-2', 'tier': 'Tier 2', 'masukLaporan': true, 'temuan': []},
        {'garduId': 'gd-x', 'noGardu': 'TB0109', 'penyulang': 'PNY-B', 'tier': 'Tier 1', 'masukLaporan': false},
      ],
    );
    expect(teks, contains('Penyulang : *PNY-A*\nSection : *SEC-1, SEC-2*'));
    expect(teks, contains('*1. TB0101 Trafindo 100 kVA*\n- Merk Box PHB-TR : Schneider'));
    expect(teks, contains('Beban LWBP : 48.1 kVA (48.1%) · WBP : -'));
    expect(teks, contains('*2. TB0102*'));
    expect(teks, contains('Inspeksi Tier : Tier 2\nTemuan :\n1. Nihil'));
    expect(teks, isNot(contains('TB0109')), reason: 'belum masuk laporan');
    expect(perluUkurInsDu('Tier 2'), isFalse);
    expect(tierDaftarInsDu('Tier 1 & Tier 2'), ['Tier 1', 'Tier 2']);
  });
}
