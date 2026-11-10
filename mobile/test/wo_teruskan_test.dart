import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/core/sesi.dart';
import 'package:sisi_row/features/wo/wo_penerusan.dart';
import 'package:sisi_row/features/wo/wo_sinkron.dart';
import 'package:sisi_row/features/wo/wo_teruskan.dart';

Sesi _sesi(String aksi, {String kode = 'OPS_PENERUSAN_WO'}) => Sesi(
      token: 't',
      profil: {'userId': 'u1', 'username': 'admin', 'role': 'ADMIN'},
      menu: aksi.isEmpty
          ? []
          : [
              {'kode': kode, 'aksi': aksi}
            ],
      offlineSampai: DateTime(2030),
    );

Map<String, dynamic> _t(String status, {Object? revision = 3, Object? ganda}) => {
      'temuanId': 'temuan-1',
      'kodeTemuan': 'IJR-001',
      'revision': revision,
      'wo': {'status': status, if (ganda != null) 'ganda': ganda},
    };

void main() {
  test('v1.0.58 bolehTeruskanDariDaftar: hanya admin dengan UBAH di OPS_PENERUSAN_WO dan WO belum diteruskan', () {
    expect(bolehTeruskanDariDaftar(_sesi('UBAH'), _t('')), true);
    expect(bolehTeruskanDariDaftar(_sesi('LIHAT'), _t('')), false, reason: 'hanya lihat');
    expect(bolehTeruskanDariDaftar(_sesi(''), _t('')), false, reason: 'tanpa menu');
    expect(bolehTeruskanDariDaftar(_sesi('UBAH', kode: 'OPS_INPUT_TEMUAN'), _t('')), false, reason: 'menu lain tidak cukup');
    for (final s in ['TERKIRIM', 'DIKERJAKAN', 'SELESAI']) {
      expect(bolehTeruskanDariDaftar(_sesi('UBAH'), _t(s)), false, reason: s);
    }
    expect(bolehTeruskanDariDaftar(_sesi('UBAH'), _t('', ganda: true)), false, reason: 'WO ganda menunggu verifikasi');
  });

  test('v1.0.58 teruskanWoKeAntre: satu item ber-aksi teruskanWo membawa temuanId, timId, catatan, revision temuan', () async {
    final dir = await Directory.systemTemp.createTemp('wo_teruskan');
    final q = PenerusanWo.i;
    q.berkas = () async => File('${dir.path}/antrean.json');
    q.jedaUlang = (_) => const Duration(hours: 1);
    final dikirim = <String>[];
    var selesai = '';
    teruskanWoKeAntre(
      userId: 'u1',
      api: (aksi, data) async {
        dikirim.add('$aksi ${data['temuanId']} ${data['timId']} ${data['revision']} ${data['catatan']}');
        return <String, dynamic>{};
      },
      temuan: _t('', revision: '3'),
      timId: 'tim-9',
      namaTim: 'ROW 09',
      catatan: 'segera',
      selesai: (ok) => selesai = ok ? 'ok' : 'gagal',
    );
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(dikirim, ['teruskanWo temuan-1 tim-9 3 segera']);
    expect(selesai, 'ok');
    // tanpa catatan: kunci catatan tidak ikut dikirim; revision tak terbaca = 1
    dikirim.clear();
    teruskanWoKeAntre(
      userId: 'u1',
      api: (aksi, data) async {
        dikirim.add('${data.containsKey('catatan')} ${data['revision']}');
        return <String, dynamic>{};
      },
      temuan: {'temuanId': 'temuan-2', 'kodeTemuan': 'IJR-002', 'wo': {'status': ''}},
      timId: 'tim-9',
      namaTim: 'ROW 09',
      catatan: '',
    );
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(dikirim, ['false 1']);
  });

  test('v1.0.58 timTujuanWo: memakai daftar tim di simpanan lokal tanpa memanggil server; kosong = satu sinkron penuh', () async {
    final tersimpan = <String, Map<String, dynamic>>{};
    var panggilan = 0;
    StoreWo store(Map<String, dynamic>? lokal) => StoreWo(
          baca: (k) async => lokal == null ? null : (data: lokal, waktu: 5),
          tulis: (k, d) async => tersimpan[k] = d,
          sudahPenuh: (k) => false,
          tandaiPenuh: (k) {},
        );
    Future<Map<String, dynamic>> api(String aksi, Map<String, dynamic> data) async {
      panggilan++;
      return {'kursor': 'k', 'tim': [{'timId': 'tim-1', 'nama': 'ROW 01', 'jenis': 'ROW'}], 'temuan': []};
    }

    final ada = await timTujuanWo(userId: 'u1', api: api, store: store({'tim': [{'timId': 'tim-7', 'nama': 'HARTEK 07', 'jenis': 'HARTEK'}], 'temuan': []}));
    expect(ada.map((x) => x['timId']), ['tim-7']);
    expect(panggilan, 0);
    final kosong = await timTujuanWo(userId: 'u1', api: api, store: store(null));
    expect(kosong.map((x) => x['timId']), ['tim-1']);
    expect(panggilan, 1);
    expect(tersimpan.keys, ['u1|admin'], reason: 'kunci sama dengan layar Penerusan WO tanpa rentang tanggal');
  });

  test('v1.0.58 keteranganKirimWo: teks kartu "Data berhasil disimpan" untuk teruskan, pindah, dan tarik', () {
    expect(keteranganKirimWo('IJR-001', 'ROW 01'), 'IJR-001 diteruskan ke ROW 01.');
    expect(keteranganKirimWo('IJR-001', 'ROW 01', pindah: true), 'IJR-001 dipindah ke ROW 01.');
    expect(keteranganKirimWo('IJR-001', 'HARTEK 02', ditarik: true), 'IJR-001 ditarik dari HARTEK 02.');
    expect(keteranganKirimWo('', 'ROW 01'), 'WO diteruskan ke ROW 01.', reason: 'kode kosong');
  });
}
