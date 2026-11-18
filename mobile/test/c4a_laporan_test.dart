import 'dart:convert';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/c4a/c4a_model.dart';
import 'package:sisi_row/features/hartek/hartek_store.dart';
import 'package:sisi_row/features/insjar/temuan_admin_antre.dart';

/// Gudang di memori: hanya master_cache yang dipakai antrean temuan admin.
class _Gudang implements GudangHartek {
  final master = <String, String>{};

  @override
  Future<({String json, DateTime diambil})?> bacaMaster(String kunci) async =>
      master[kunci] == null ? null : (json: master[kunci]!, diambil: DateTime(2026));
  @override
  Future<void> tulisMaster(String kunci, String json) async => master[kunci] = json;
  @override
  dynamic noSuchMethod(Invocation i) => throw UnimplementedError('${i.memberName}');
}

final _sesi = Sesi(
  token: 't',
  profil: const {'userId': 'u1', 'username': 'admin', 'role': 'ADMIN'},
  menu: const [
    {'kode': 'OPS_INPUT_TEMUAN', 'aksi': 'UBAH'}
  ],
  offlineSampai: DateTime(2030),
);

LaporanC4A _lap(String id, {String tanggal = '2026-11-15'}) => LaporanC4A(
    c4aId: id, tanggal: tanggal, penyulang: 'PNY-A', section: 'ACR Palas - LBS Delas', latAwal: -3.01, lngAwal: 106.5, sumberAwal: 'GPS');

void main() {
  test('C4A: uniqueid 8 hex huruf kecil', () {
    final r = Random(1);
    for (var i = 0; i < 50; i++) {
      expect(buatUniqueIdC4a(r), matches(RegExp(r'^[0-9a-f]{8}$')));
    }
  });

  test('C4A: laporan TERBUKA tanggal kemarin di HP tidak aktif; SELESAI tidak aktif; json bolak-balik', () {
    final l = _lap('aaaa0001');
    expect(l.terbukaHariIni('2026-11-15'), isTrue);
    expect(l.terbukaHariIni('2026-11-16'), isFalse);
    expect(LaporanC4A.fromJson(jsonDecode(jsonEncode(l.toJson())) as Map<String, dynamic>).section, 'ACR Palas - LBS Delas');
    expect(LaporanC4A.fromJson({...l.toJson(), 'status': 'SELESAI'}).terbukaHariIni('2026-11-15'), isFalse);
  });

  group('C4A antrean HP', () {
    late _Gudang gudang;
    late List<String> panggil;
    late Map<String, dynamic> Function(String aksi, Map<String, dynamic> data) jawab;
    late AntreanTemuanAdmin antre;

    setUp(() {
      gudang = _Gudang();
      panggil = [];
      jawab = (aksi, data) => switch (aksi) {
            'simpanTemuanInspeksi' => {'temuanId': data['idBaris'], 'kodeTemuan': 'PEG-1-TJR.001'},
            'buatLaporanC4A' => {'c4aId': data['c4aId'], 'kodeC4a': 'C4A-16130261115001', 'status': 'TERBUKA'},
            _ => {'status': 'SELESAI'},
          };
      antre = AntreanTemuanAdmin(gudang, (s, aksi, data) async {
        panggil.add('$aksi ${data['c4aId'] ?? ''}');
        return jawab(aksi, data);
      }, bacaFoto: (p) async => utf8.encode(p), hapusFoto: (p) async {});
    });

    Future<void> temuan(String id, String c4aId) => antre.tambahTemuan(_sesi,
        idBaris: id,
        data: {'jenisTemuanId': 'J1', 'c4aId': c4aId, 'uniqueid': 'u$id'},
        tampil: {'temuanId': id},
        tanggal: '2026-11-15',
        foto: const {});

    test('jumlahTertunda: laporan + temuan belum terkirim dihitung (layanan latar hidup); yang ditolak server tidak; terkirim = 0', () async {
      expect(await antre.jumlahTertunda('u1'), 0);
      await antre.bukaLaporan(_sesi, _lap('aaaa0001'));
      await temuan('t1', 'aaaa0001');
      expect(await antre.jumlahTertunda('u1'), 2);
      await antre.kirim(_sesi);
      expect(await antre.jumlahTertunda('u1'), 0);
    });

    test('master penyulang + section diunduh di latar ke simpanan HP; ulang < 6 jam tidak mengunduh lagi; gagal = simpanan lama utuh', () async {
      jawab = (aksi, data) => {'penyulang': {'PNY-A': ['SEC-1']}};
      await antre.segarkanMaster(_sesi);
      expect(panggil, ['getMasterTemuanInspeksi ']);
      expect(jsonDecode(gudang.master[AntreanTemuanAdmin.kunciMaster('u1')]!), {'penyulang': {'PNY-A': ['SEC-1']}});
      await antre.segarkanMaster(_sesi);
      expect(panggil.length, 1, reason: 'masih segar');
      final lama = gudang.master[AntreanTemuanAdmin.kunciMaster('u1')];
      final baru = AntreanTemuanAdmin(gudang, (s, aksi, data) async => throw Exception('tanpa sinyal'), bacaFoto: (p) async => [], hapusFoto: (p) async {});
      await baru.segarkanMaster(_sesi);
      expect(gudang.master[AntreanTemuanAdmin.kunciMaster('u1')], lama);
    });

    test('urutan kirim: BUKA, temuan, TUTUP walau ditambah berselang; laporan aktif hilang sesudah ditutup', () async {
      await antre.bukaLaporan(_sesi, _lap('aaaa0001'));
      expect((await antre.laporanAktif('u1', '2026-11-15'))!.c4aId, 'aaaa0001');
      await temuan('t1', 'aaaa0001');
      await antre.tutupLaporan(_sesi, _lap('aaaa0001'), -3.02, 106.51, 'PETA');
      expect(await antre.laporanAktif('u1', '2026-11-15'), isNull);
      expect(antre.belumDiServer('u1').map((t) => t['temuanId']), ['t1'], reason: 'item laporan bukan kartu temuan');
      expect(await antre.kirim(_sesi), 3);
      expect(panggil, ['buatLaporanC4A aaaa0001', 'simpanTemuanInspeksi aaaa0001', 'tutupLaporanC4A aaaa0001']);
      expect(await antre.daftar('u1'), isEmpty);
    });

    test('C4A_SUDAH_ADA: temuan dipindah ke c4aId server, TUTUP lokal dibuang, laporan aktif = laporan server', () async {
      jawab = (aksi, data) => switch (aksi) {
            'buatLaporanC4A' => {
                'ditolak': 'C4A_SUDAH_ADA',
                'laporan': {'c4aId': 'bbbb0001', 'kodeC4a': 'C4A-16130261115001', 'tanggal': '2026-11-15', 'penyulang': 'PNY-B',
                  'section': 'GH Toboali', 'latAwal': -3.1, 'lngAwal': 106.4, 'sumberAwal': 'GPS', 'status': 'TERBUKA'}
              },
            'simpanTemuanInspeksi' => {'temuanId': data['idBaris'], 'kodeTemuan': 'PEG-1-TJR.001'},
            _ => {'status': 'SELESAI'},
          };
      await antre.bukaLaporan(_sesi, _lap('aaaa0001'));
      await temuan('t1', 'aaaa0001');
      await temuan('t2', 'aaaa0001');
      await antre.tutupLaporan(_sesi, _lap('aaaa0001'), -3.02, 106.51, 'GPS');
      expect(await antre.kirim(_sesi), 2);
      expect(panggil, ['buatLaporanC4A aaaa0001', 'simpanTemuanInspeksi bbbb0001', 'simpanTemuanInspeksi bbbb0001']);
      final aktif = await antre.laporanAktif('u1', '2026-11-15');
      expect([aktif!.c4aId, aktif.penyulang], ['bbbb0001', 'PNY-B']);
      expect(await antre.daftar('u1'), isEmpty);
      expect(await antre.riwayat('u1', '2026-11-15'), isEmpty, reason: 'laporan lokal yang dipindah tidak masuk riwayat');
    });

    test('laporan aktif dari kemarin dianggap tidak aktif (boleh buat baru)', () async {
      await antre.bukaLaporan(_sesi, _lap('aaaa0001', tanggal: '2026-11-14'));
      expect(await antre.laporanAktif('u1', '2026-11-15'), isNull);
    });

    test('riwayat: laporan ditutup masuk riwayat hari itu (terbaru dulu), server menimpa salinan HP, hari lain tidak tampil', () async {
      await antre.bukaLaporan(_sesi, _lap('aaaa0001'));
      await antre.tutupLaporan(_sesi, _lap('aaaa0001'), -3.02, 106.51, 'GPS');
      await antre.bukaLaporan(_sesi, _lap('aaaa0002'));
      await antre.tutupLaporan(_sesi, _lap('aaaa0002'), -3.03, 106.52, 'PETA');
      final r = await antre.riwayat('u1', '2026-11-15');
      expect(r.map((l) => [l.c4aId, l.status, l.latAkhir]), [
        ['aaaa0002', 'SELESAI', -3.03],
        ['aaaa0001', 'SELESAI', -3.02]
      ]);
      await antre.gabungRiwayat('u1', '2026-11-15', [
        LaporanC4A.fromJson({..._lap('aaaa0001').toJson(), 'status': 'SELESAI', 'kodeC4a': 'C4A-1', 'jarakKm': 1.5, 'jumlahTemuan': 3}),
        LaporanC4A.fromJson({..._lap('cccc0001').toJson(), 'status': 'SELESAI', 'kodeC4a': 'C4A-0'}),
      ]);
      final g = await antre.riwayat('u1', '2026-11-15');
      expect(g.map((l) => [l.c4aId, l.kodeC4a, l.jarakKm, l.jumlahTemuan]), [
        ['aaaa0002', '', null, 0],
        ['aaaa0001', 'C4A-1', 1.5, 3],
        ['cccc0001', 'C4A-0', null, 0]
      ]);
      expect(await antre.riwayat('u1', '2026-11-16'), isEmpty);
    });

    test('item lama tanpa jenis tetap terkirim sebagai temuan', () async {
      gudang.master[AntreanTemuanAdmin.kunci('u1')] = jsonEncode([
        {'idBaris': 'lama', 'temuanId': 'lama', 'kodeTemuan': '', 'data': {'jenisTemuanId': 'J1'}, 'tanggal': '2026-11-14', 'foto': {}, 'galat': ''}
      ]);
      expect(await antre.kirim(_sesi), 1);
      expect(panggil, ['simpanTemuanInspeksi ']);
    });
  });
}
