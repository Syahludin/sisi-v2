import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/hartek/foto_lapangan.dart';
import 'package:sisi_row/features/hartek/hartek_store.dart';
import 'package:sisi_row/features/insjar/temuan_admin_antre.dart';
import 'package:sisi_row/features/insjar/temuan_offline.dart';
import 'package:sisi_row/features/wo/wo_store.dart';

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

void main() {
  group('v1.0.29 AntreanTemuanAdmin (simpan di HP, kirim di latar)', () {
    late _Gudang gudang;
    late List<String> panggil;
    late Map<String, Object> galatAksi; // aksi -> ApiException / Exception yang dilempar
    late Set<String> dihapus;
    late AntreanTemuanAdmin antre;

    setUp(() {
      gudang = _Gudang();
      panggil = [];
      galatAksi = {};
      dihapus = {};
      antre = AntreanTemuanAdmin(gudang, (s, aksi, data) async {
        panggil.add('$aksi ${data['slot'] ?? data['idBaris'] ?? ''}');
        final g = galatAksi[aksi];
        if (g != null) throw g;
        return aksi == 'simpanTemuanInspeksi' ? {'temuanId': data['idBaris'], 'kodeTemuan': 'PEG-1-TJR.001'} : {'status': 'OK'};
      }, bacaFoto: (p) async => p.contains('hilang') ? null : utf8.encode(p), hapusFoto: (p) async => dihapus.add(p ?? ''));
    });

    Future<void> tambah() async {
      await SimpananTemuanOffline(gudang).tulis('u1', {
        'temuan': [
          {'temuanId': 'id-1', 'kodeTemuan': '', 'jenisTemuan': 'FCO rusak'}
        ]
      });
      await antre.tambahTemuan(_sesi,
          idBaris: 'id-1',
          data: {'jenisTemuanId': 'J1', 'penyulang': 'P1'},
          tampil: {'temuanId': 'id-1', 'kodeTemuan': '', 'jenisTemuan': 'FCO rusak'},
          tanggal: '2026-10-24',
          foto: {'TEMUAN': '/f/temuan.jpg', 'TIANG': '/f/tiang.jpg'});
    }

    test('terkirim: simpan temuan dulu lalu foto, antrean kosong, kode masuk daftar HP, foto HP dihapus', () async {
      await tambah();
      expect((await antre.daftar('u1')).length, 1);
      expect(antre.belumDiServer('u1').single['temuanId'], 'id-1');
      expect(await antre.kirim(_sesi), 1);
      expect(panggil, ['simpanTemuanInspeksi id-1', 'uploadFotoTemuanInspeksi TEMUAN', 'uploadFotoTemuanInspeksi TIANG']);
      expect(await antre.daftar('u1'), isEmpty);
      expect(dihapus, {'/f/temuan.jpg', '/f/tiang.jpg'});
      final o = await SimpananTemuanOffline(gudang).baca('u1');
      expect((o!['temuan'] as List).single['kodeTemuan'], 'PEG-1-TJR.001');
    });

    test('sinyal putus: antrean tetap, temuan yang sudah diterima tidak dikirim ulang', () async {
      await tambah();
      galatAksi['uploadFotoTemuanInspeksi'] = ApiException('HTTP_0');
      expect(await antre.kirim(_sesi), 0);
      final x = antre.item('u1', 'id-1')!;
      expect([x['data'], x['kodeTemuan'], x['galat'], (x['foto'] as Map).length], [null, 'PEG-1-TJR.001', '', 2]);
      expect(antre.belumDiServer('u1'), isEmpty, reason: 'sudah di server: tidak dipasang lagi ke daftar sesudah unduh');
      galatAksi.clear();
      panggil.clear();
      expect(await antre.kirim(_sesi), 1);
      expect(panggil, ['uploadFotoTemuanInspeksi TEMUAN', 'uploadFotoTemuanInspeksi TIANG']);
    });

    test('ditolak server: berhenti dengan galat; Kirim ulang mengirim lagi; Buang menghapus dari daftar HP', () async {
      await tambah();
      galatAksi['simpanTemuanInspeksi'] = ApiException('JENIS_TEMUAN_TIDAK_VALID');
      expect(await antre.kirim(_sesi), 0);
      expect(antre.item('u1', 'id-1')!['galat'], isNotEmpty);
      panggil.clear();
      expect(await antre.kirim(_sesi), 0, reason: 'galat = tidak dicoba otomatis');
      expect(panggil, isEmpty);
      galatAksi.clear();
      await antre.kirimUlang(_sesi, 'id-1');
      expect(await antre.kirim(_sesi), 1);

      await tambah();
      await antre.buang(_sesi, 'id-1');
      expect(await antre.daftar('u1'), isEmpty);
      expect((await SimpananTemuanOffline(gudang).baca('u1'))!['temuan'], isEmpty);
    });

    test('foto susulan (temuan sudah di server) ikut antrean; file foto hilang dilewati', () async {
      await antre.tambahFoto(_sesi, 'id-9', 'PEG-9', 'TIANG', '/f/hilang.jpg');
      expect(await antre.kirim(_sesi), 1);
      expect(panggil, isEmpty, reason: 'file tidak ada = tidak dikirim, antrean tidak macet');
      await antre.tambahFoto(_sesi, 'id-9', 'PEG-9', 'TIANG', '/f/ada.jpg');
      expect(await antre.kirim(_sesi), 1);
      expect(panggil, ['uploadFotoTemuanInspeksi TIANG']);
    });

    test('akun tanpa hak ubah Temuan Inspeksi tidak mengirim', () async {
      await tambah();
      final lain = Sesi(token: 't', profil: const {'userId': 'u1', 'username': 'x', 'role': 'ADMIN'}, menu: const [], offlineSampai: DateTime(2030));
      expect(await antre.kirim(lain), 0);
      expect(panggil, isEmpty);
    });
  });

  test('v1.0.29 FotoLapangan.metaKirim: GPS + waktu jepret dari file pendamping, tanpa file = kosong; hapus ikut membuang', () async {
    final dir = await Directory.systemTemp.createTemp('sisi_meta');
    final foto = File('${dir.path}/a.jpg')..writeAsBytesSync([0xFF, 0xD8, 0]);
    expect(await FotoLapangan.metaKirim(foto.path), isEmpty);
    File('${foto.path}.meta.json').writeAsStringSync(jsonEncode({'waktu': '2026-10-24T01:00:00.000Z', 'lat': -3.1, 'lng': 106.4, 'akurasiM': 5.0}));
    expect(await FotoLapangan.metaKirim(foto.path), {'waktu': '2026-10-24T01:00:00.000Z', 'lat': -3.1, 'lng': 106.4, 'akurasiM': 5.0});
    await FotoLapangan.hapus(foto.path);
    expect([foto.existsSync(), File('${foto.path}.meta.json').existsSync()], [false, false]);
    await dir.delete(recursive: true);
  });

  test('v1.0.29 WoLokal.p0Shift: P0 WO shift ini (kode <kodeShift>-P0.) + Selesai menunggu kirim; shift lain tidak', () {
    Map<String, dynamic> wo(String id, List<Map<String, dynamic>> pk) => {
          'temuanId': id,
          'kodeTemuan': 'K-$id',
          'wo': {'status': 'DIKERJAKAN'},
          'pekerjaanWo': pk,
        };
    final d = {
      'server': {
        'wo': [
          wo('a', [
            {'tlId': 't1', 'status': 'TERCATAT', 'kodeRealisasiModul': 'SH-1-P0.001', 'pekerjaan': 'Ganti FCO'},
            {'tlId': 't2', 'status': 'TERCATAT', 'kodeRealisasiModul': 'SH-0-P0.004', 'pekerjaan': 'Ganti FCO'},
          ]),
          wo('b', [
            {'tlId': 't3', 'status': 'DRAFT', 'kodeRealisasiModul': '', 'pekerjaan': 'Pangkas'},
          ]),
          wo('c', [
            {'tlId': 't4', 'status': 'DRAFT', 'kodeRealisasiModul': '', 'pekerjaan': 'Pangkas'},
          ]),
        ]
      },
      'lokal': {
        'b': {
          'selesai': {'status': 'LOKAL'}
        },
      },
    };
    expect([for (final p in WoLokal.p0Shift(d, 'SH-1')) p['tlId']], ['t1', 't3']);
    expect(WoLokal.p0Shift(d, ''), isEmpty);
  });
}
