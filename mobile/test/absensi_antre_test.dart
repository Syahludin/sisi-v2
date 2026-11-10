import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/api_client.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/absensi/absensi_antre.dart';
import 'package:sisi_row/features/absensi/absensi_model.dart';
import 'package:sisi_row/features/hartek/hartek_store.dart';

/// Gudang di memori: hanya master_cache yang dipakai antrean absensi.
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

Sesi _sesi(String userId, {bool menu = true}) => Sesi(
      token: 't-$userId',
      profil: {'userId': userId, 'username': userId, 'role': 'ADMIN_ES'},
      menu: [
        if (menu) {'kode': 'OPS_ABSENSI', 'aksi': 'UBAH'}
      ],
      offlineSampai: DateTime(2030),
    );

void main() {
  group('v1.0.51 model absensi', () {
    test('7 status: kode server, simbol, wajib keterangan hanya KET dan IZIN', () {
      expect(StatusAbsensi.values.map((s) => s.kode), ['HADIR', 'TELAT', 'TANPA_KET', 'ABSEN', 'KET', 'TMK', 'CUTI', 'IZIN']);
      expect(StatusAbsensi.values.where((s) => s.wajibKeterangan).map((s) => s.kode), ['KET', 'IZIN']);
      expect(StatusAbsensi.dariKode('TELAT'), StatusAbsensi.telat);
      expect(StatusAbsensi.dariKode('LIBUR'), isNull);
      expect(StatusAbsensi.dariKode(null), isNull);
    });

    test('DataAbsensi.dariJson: staf belum diabsen, diisi sendiri, diisi rekan', () {
      final d = DataAbsensi.dariJson({
        'tanggal': '2026-11-02',
        'jamSimpan': '07.32',
        'teksWa': 'teks',
        'tim': [
          {'timId': 't1', 'nama': 'Tim Row 1', 'jenis': 'ROW'}
        ],
        'staf': [
          {'petugasId': 'a', 'nama': 'Agus', 'timId': 't1', 'status': null, 'keterangan': '', 'diabsenOleh': null, 'milikSaya': false},
          {'petugasId': 'b', 'nama': 'Budi', 'timId': 't1', 'status': 'KET', 'keterangan': 'Bengkel', 'diabsenOleh': {'userId': 'u1', 'nama': 'ES'}, 'milikSaya': true},
          {'petugasId': 'c', 'nama': 'Candra', 'timId': 't1', 'status': 'HADIR', 'keterangan': '', 'diabsenOleh': {'userId': 'u2', 'nama': 'Admin'}, 'milikSaya': false},
        ],
      });
      expect(d.tanggal, '2026-11-02');
      expect(d.staf.map((s) => s.status), [null, StatusAbsensi.ket, StatusAbsensi.hadir]);
      expect(d.staf.map((s) => s.terkunci), [false, false, true], reason: 'terkunci = sudah diisi akun lain');
      expect(d.staf[1].keterangan, 'Bengkel');
      expect(d.staf[2].diabsenOlehNama, 'Admin');
      expect(d.stafDi('t1').length, 3);
    });
  });

  group('v1.0.51 AntreanAbsensi (simpan di HP, kirim di latar)', () {
    late _Gudang gudang;
    late List<Map<String, dynamic>> panggil;
    Object? galat; // dilempar sebagai ganti jawaban
    late Map<String, dynamic> Function(Map<String, dynamic> data) jawab;
    late AntreanAbsensi antre;

    setUp(() {
      gudang = _Gudang();
      panggil = [];
      galat = null;
      jawab = (data) => {
            'tanggal': data['tanggal'],
            'diterima': [for (final i in data['isian'] as List) (i as Map)['petugasId']],
            'ditolak': <dynamic>[],
          };
      antre = AntreanAbsensi(gudang, (s, aksi, data) async {
        expect(aksi, 'simpanAbsensi');
        panggil.add({'user': s.userId, ...data});
        if (galat != null) throw galat!;
        return jawab(data);
      });
    });

    const hadir = IsianAbsensi(StatusAbsensi.hadir);

    test('terkirim: satu panggilan per tanggal, antrean kosong, hitungan tertunda 0', () async {
      await antre.simpan(_sesi('u1'), '2026-11-02', {'a': hadir, 'b': const IsianAbsensi(StatusAbsensi.ket, 'Mobil Masuk Bengkel')});
      expect(await antre.jumlahTertunda('u1'), 2);
      expect(await antre.kirim(_sesi('u1')), 2);
      expect(panggil.length, 1);
      expect(panggil.single['tanggal'], '2026-11-02');
      expect(panggil.single['isian'], [
        {'petugasId': 'a', 'status': 'HADIR'},
        {'petugasId': 'b', 'status': 'KET', 'keterangan': 'Mobil Masuk Bengkel'},
      ]);
      expect(await antre.daftar('u1'), isEmpty);
      expect(await antre.jumlahTertunda('u1'), 0);
    });

    test('ditolak server (dikunci pengabsen lain): item bergalat, tidak dihitung tertunda, tidak dikirim ulang otomatis', () async {
      jawab = (data) => {
            'tanggal': data['tanggal'],
            'diterima': ['b'],
            'ditolak': [
              {'petugasId': 'a', 'kode': 'DIKUNCI_PENGABSEN_LAIN'}
            ],
          };
      await antre.simpan(_sesi('u1'), '2026-11-02', {'a': hadir, 'b': hadir});
      expect(await antre.kirim(_sesi('u1')), 1);
      final sisa = await antre.daftar('u1');
      expect(sisa.map((i) => [i.petugasId, i.galat]), [
        ['a', 'DIKUNCI_PENGABSEN_LAIN']
      ]);
      expect(await antre.jumlahTertunda('u1'), 0, reason: 'bergalat tidak menahan layanan latar');
      panggil.clear();
      expect(await antre.kirim(_sesi('u1')), 0);
      expect(panggil, isEmpty);
    });

    test('simpan ulang petugas yang sama menggantikan isian lama dan menghapus galatnya', () async {
      jawab = (data) => {'tanggal': data['tanggal'], 'diterima': <dynamic>[], 'ditolak': [{'petugasId': 'a', 'kode': 'PETUGAS_BUKAN_PESERTA'}]};
      await antre.simpan(_sesi('u1'), '2026-11-02', {'a': hadir});
      await antre.kirim(_sesi('u1'));
      expect((await antre.daftar('u1')).single.galat, 'PETUGAS_BUKAN_PESERTA');
      await antre.simpan(_sesi('u1'), '2026-11-02', {'a': const IsianAbsensi(StatusAbsensi.telat)});
      final d = await antre.daftar('u1');
      expect([d.length, d.single.status, d.single.galat], [1, StatusAbsensi.telat, '']);
    });

    test('sinyal putus / server sibuk / konfigurasi belum siap: antrean utuh, tanpa galat, dicoba lagi nanti', () async {
      await antre.simpan(_sesi('u1'), '2026-11-02', {'a': hadir});
      for (final kode in ['HTTP_0', 'SERVER_SIBUK', 'TERLALU_SERING', 'CONFIG_TIDAK_LENGKAP', 'SHEET_TIDAK_ADA', 'SESI_TIDAK_VALID']) {
        galat = ApiException(kode);
        expect(await antre.kirim(_sesi('u1')), 0, reason: kode);
        expect((await antre.daftar('u1')).single.galat, '', reason: kode);
      }
      galat = const SocketLikeException();
      expect(await antre.kirim(_sesi('u1')), 0);
      expect(await antre.jumlahTertunda('u1'), 1);
      galat = null;
      expect(await antre.kirim(_sesi('u1')), 1);
    });

    test('HARI_LAMPAU / HARI_DEPAN menandai semua isian tanggal itu bergalat; tanggal lain tetap jalan', () async {
      await antre.simpan(_sesi('u1'), '2026-11-01', {'a': hadir, 'b': hadir});
      await antre.simpan(_sesi('u1'), '2026-11-02', {'c': hadir});
      jawab = (data) {
        if (data['tanggal'] == '2026-11-01') throw ApiException('HARI_LAMPAU');
        return {'tanggal': data['tanggal'], 'diterima': ['c'], 'ditolak': <dynamic>[]};
      };
      expect(await antre.kirim(_sesi('u1')), 1);
      expect((await antre.daftar('u1')).map((i) => [i.tanggal, i.petugasId, i.galat]), [
        ['2026-11-01', 'a', 'HARI_LAMPAU'],
        ['2026-11-01', 'b', 'HARI_LAMPAU'],
      ]);
    });

    test('antrean per akun: akun lain di HP yang sama tidak mengirim antrean akun ini', () async {
      await antre.simpan(_sesi('u1'), '2026-11-02', {'a': hadir});
      expect(await antre.kirim(_sesi('u2')), 0);
      expect(panggil, isEmpty);
      expect(await antre.daftar('u2'), isEmpty);
      expect(await antre.daftar('u1'), hasLength(1));
    });

    test('tanpa hak UBAH menu OPS_ABSENSI: tidak mengirim apa pun', () async {
      await antre.simpan(_sesi('u1'), '2026-11-02', {'a': hadir});
      expect(await antre.kirim(_sesi('u1', menu: false)), 0);
      expect(panggil, isEmpty);
    });

    test('dua kirim bersamaan tidak mengirim ganda', () async {
      await antre.simpan(_sesi('u1'), '2026-11-02', {'a': hadir});
      final tahan = Completer<void>();
      antre = AntreanAbsensi(gudang, (s, aksi, data) async {
        panggil.add(data);
        await tahan.future;
        return {'tanggal': data['tanggal'], 'diterima': ['a'], 'ditolak': <dynamic>[]};
      });
      final satu = antre.kirim(_sesi('u1'));
      final dua = antre.kirim(_sesi('u1'));
      tahan.complete();
      expect([await satu, await dua], [1, 0]);
      expect(panggil.length, 1);
    });

    test('isian diubah saat sedang dikirim tidak ikut terhapus', () async {
      await antre.simpan(_sesi('u1'), '2026-11-02', {'a': hadir});
      final tahan = Completer<void>();
      antre = AntreanAbsensi(gudang, (s, aksi, data) async {
        await tahan.future;
        return {'tanggal': data['tanggal'], 'diterima': ['a'], 'ditolak': <dynamic>[]};
      });
      final kirim = antre.kirim(_sesi('u1'));
      await Future<void>.delayed(Duration.zero);
      await antre.simpan(_sesi('u1'), '2026-11-02', {'a': const IsianAbsensi(StatusAbsensi.telat)});
      tahan.complete();
      await kirim;
      final sisa = await antre.daftar('u1');
      expect(sisa.map((i) => i.status), [StatusAbsensi.telat], reason: 'perubahan sesudah kirim tetap antre untuk dikirim berikutnya');
    });

    test('lebih dari 100 isian dipecah per 100 per panggilan', () async {
      await antre.simpan(_sesi('u1'), '2026-11-02', {for (var i = 0; i < 150; i++) 'p$i': hadir});
      expect(await antre.kirim(_sesi('u1')), 150);
      expect(panggil.map((p) => (p['isian'] as List).length), [100, 50]);
    });

    test('buang: isian bergalat dihapus dari antrean', () async {
      jawab = (data) => {'tanggal': data['tanggal'], 'diterima': <dynamic>[], 'ditolak': [{'petugasId': 'a', 'kode': 'DIKUNCI_PENGABSEN_LAIN'}]};
      await antre.simpan(_sesi('u1'), '2026-11-02', {'a': hadir});
      await antre.kirim(_sesi('u1'));
      await antre.buang(_sesi('u1'), '2026-11-02', 'a');
      expect(await antre.daftar('u1'), isEmpty);
    });
  });
}

class SocketLikeException implements Exception {
  const SocketLikeException();
}
