import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/sinkron_atomik.dart';
import '../../core/wib.dart';
import '../hartek/foto_lapangan.dart';
import '../hartek/hartek_store.dart' show GudangHartek, OpHartek, PanggilHartek, HasilKirimHartek, HartekStore;
import 'insdu_bantu.dart';
import 'insdu_lokal.dart';

/// v1.0.12 (permintaan Master Guswan 21 Okt 2026): Inspeksi Gardu lokal dulu, kirim ke server otomatis di latar (pola InsJarStore).
///
/// Tabel lokal sama dengan Hartek / InsJar (hartek_lokal / hartek_antre, kunci user_id): akun tim INSPEKSI_GARDU tidak
/// memakai modul lain, jadi data tidak tercampur. Master dropdown: master_cache 'insdu_master'.
/// Antrean FIFO: buatHeader > simpanRealisasi > simpanUkur (LWBP / WBP) > simpanTemuan > uploadFoto. Pengukuran WBP
/// tunggakan (laporan sebelumnya) juga lewat antrean ini dan terkirim sebelum Laporan Utama baru.
class InsDuStore extends ChangeNotifier {
  InsDuStore(this._gudang, this._panggil,
      {DateTime Function()? jam, Future<List<int>?> Function(String path)? bacaFoto, Future<void> Function(String? path)? hapusFoto})
      : _jam = jam ?? DateTime.now,
        _bacaFoto = bacaFoto ?? FotoLapangan.baca,
        _hapusFoto = hapusFoto ?? FotoLapangan.hapus;

  final GudangHartek _gudang;
  final PanggilHartek _panggil;
  final DateTime Function() _jam;
  final Future<List<int>?> Function(String path) _bacaFoto;
  final Future<void> Function(String? path) _hapusFoto;

  static const _uuid = Uuid();
  static const kunciMaster = 'insdu_master';
  static const umurMaster = Duration(minutes: 30);
  static const menu = 'OPS_INSDU_INPUT';

  String folderFoto = 'insdu';

  String tanggalIni() => Wib.tanggal(_jam());

  Map<String, dynamic>? _doc;
  String? _kunciDoc;
  Future<void> _rantai = Future<void>.value();

  Future<T> _kunci<T>(Future<T> Function() f) {
    final hasil = _rantai.then((_) => f());
    _rantai = hasil.then<void>((_) {}, onError: (Object _) {});
    return hasil;
  }

  /// v1.0.17 (sinkron atomik): segel laporan hari ini sesudah SEMUA antrean diterima server. Status tersinkron /
  /// tombol WA hanya diberikan kalau segel cocok dengan isi laporan (lihat core/sinkron_atomik.dart).
  late final PenyegelSinkron penyegel = PenyegelSinkron(
      modul: 'INSDU', endpoint: 'segelSinkronInsDu', baca: _gudang.bacaMaster, tulis: _gudang.tulisMaster, panggil: _panggil)
    ..addListener(notifyListeners);

  /// Segel dipanggil SyncController sesudah kirim + tarik. Antrean hari ini belum kosong = tidak disegel.
  Future<void> segelLaporan(Sesi s) async {
    final tgl = tanggalIni();
    if ((await _gudang.ops(s.userId)).any((o) => o.tanggal == tgl)) return;
    await penyegel.segel(s, tgl, await doc(s));
  }

  /// Tahap sinkron atomik laporan [d] (dokumen hari ini). Segel dimuat dari HP sekali (lalu dari memori).
  TahapSinkron tahapSinkronLaporan(Sesi s, Map<String, dynamic>? d) {
    final tgl = tanggalIni();
    if (penyegel.instan(s.userId, tgl) == null) unawaited(penyegel.muat(s.userId, tgl));
    final n = InsDuLokal.hitung(d);
    return tahapSinkron('INSDU', doc: d, menunggu: n.menunggu, gagal: n.gagal, segel: penyegel.instan(s.userId, tgl));
  }

  Map<String, dynamic>? docInstan(Sesi s) => _kunciDoc == '${s.userId}|${tanggalIni()}' ? _doc : null;

  Future<Map<String, dynamic>> doc(Sesi s) => _kunci(() => _baca(s.userId, tanggalIni()));

  Future<Map<String, dynamic>> _baca(String userId, String tanggal) async {
    final k = '$userId|$tanggal';
    if (_kunciDoc == k && _doc != null) return _doc!;
    final j = await _gudang.bacaDoc(userId, tanggal);
    Map<String, dynamic> d;
    try {
      d = j == null ? InsDuLokal.kosong(tanggal) : Map<String, dynamic>.from(jsonDecode(j) as Map);
      if (d['jenis'] != InsDuLokal.jenisDoc) d = InsDuLokal.kosong(tanggal); // bukan dokumen InsDu
    } catch (_) {
      d = InsDuLokal.kosong(tanggal);
    }
    if (tanggal == tanggalIni()) {
      _doc = d;
      _kunciDoc = k;
    }
    return d;
  }

  Future<void> _tulis(String userId, String tanggal, Map<String, dynamic> d) async {
    await _gudang.tulisDoc(userId, tanggal, jsonEncode(d));
    if (tanggal == tanggalIni()) {
      _doc = d;
      _kunciDoc = '$userId|$tanggal';
    }
    notifyListeners();
  }

  Future<Map<String, dynamic>> _ubahDoc(String userId, String tanggal, void Function(Map<String, dynamic> d) f) async {
    final d = InsDuLokal.salin(await _baca(userId, tanggal));
    f(d);
    await _tulis(userId, tanggal, d);
    return d;
  }

  OpHartek _op(String userId, String tgl, String aksi, String target, Map<String, dynamic> data) =>
      OpHartek(userId: userId, tanggal: tgl, aksi: aksi, target: target, data: data);

  OpHartek? _opTarget(List<OpHartek> ops, String aksi, String target) {
    for (final o in ops) {
      if (o.aksi == aksi && o.target == target) return o;
    }
    return null;
  }

  // ---------- tulis lokal ----------

  /// Laporan Utama baru. Ditolak di HP selama WBP tunggakan laporan sebelumnya belum diisi (di server atau di HP).
  Future<String> buatHeader(Sesi s, Map<String, dynamic> isian) => _kunci(() async {
        final tgl = tanggalIni();
        final d0 = await _baca(s.userId, tgl);
        if (d0['header'] != null) throw ApiException('LAPORAN_UTAMA_SUDAH_DIBUAT');
        if (InsDuLokal.tunggakanTerbuka(d0).isNotEmpty) throw ApiException('PENGUKURAN_H1_BELUM_LENGKAP');
        final id = _uuid.v4();
        await _gudang.tambahOp(_op(s.userId, tgl, 'buatHeader', id, {'headerId': id, ...isian}));
        await _ubahDoc(s.userId, tgl, (d) => InsDuLokal.buatHeader(d, {'headerId': id, 'kodeHeader': '', 'revision': 1, ...isian}));
        return id;
      });

  Future<void> ubahHeader(Sesi s, Map<String, dynamic> isian) => _kunci(() async {
        final tgl = tanggalIni();
        final h = InsDuLokal.header(await _baca(s.userId, tgl));
        if (h == null) throw ApiException('DATA_TIDAK_DITEMUKAN');
        await _ubahNode(s, tgl, 'buatHeader', 'ubahHeader', '${h['headerId']}', {'headerId': '${h['headerId']}'}, isian,
            (d, tandai) => InsDuLokal.ubahIsianHeader(d, isian, tandaiUbah: tandai));
      });

  /// Gardu yang diinspeksi. [tampil] = data gardu dari master (noGardu, penyulang, section, alamat, kapasitasKva, merkTrafo).
  /// v1.0.38: [kapasitasKva] / [merkTrafo] = koreksi petugas (null = tidak diubah, server memakai Master Gardu).
  Future<String> tambahGardu(Sesi s, String garduId, String tier, Map<String, dynamic> tampil, {num? kapasitasKva, String? merkTrafo}) =>
      _kunci(() async {
        final tgl = tanggalIni();
        final d0 = await _baca(s.userId, tgl);
        final h = InsDuLokal.header(d0);
        if (h == null) throw ApiException('DATA_TIDAK_DITEMUKAN');
        if (InsDuLokal.garduGanda(d0, garduId)) throw ApiException('GARDU_GANDA');
        final id = _uuid.v4();
        await _gudang.tambahOp(_op(s.userId, tgl, 'simpanRealisasi', id, {
          'headerId': '${h['headerId']}',
          'garduId': garduId,
          'tier': tier,
          'idBaris': id,
          if (kapasitasKva != null) 'kapasitasKva': kapasitasKva,
          if (merkTrafo != null) 'merkTrafo': merkTrafo,
        }));
        await _ubahDoc(s.userId, tgl, (d) => InsDuLokal.tambahRealisasi(d, {
              ...tampil,
              if (kapasitasKva != null) 'kapasitasKva': kapasitasKva,
              if (merkTrafo != null) 'merkTrafo': merkTrafo,
              'realisasiId': id,
              'kodeRealisasi': '',
              'garduId': garduId,
              'tier': tier,
              'revision': 1,
            }));
        return id;
      });

  /// v1.0.14: ubah gardu / tier gardu yang sudah diinput. [g] = gardu baru (null = gardu tetap).
  Future<void> ubahGardu(Sesi s, String realisasiId, String tier, {GarduInsDu? g, num? kapasitasKva, String? merkTrafo}) =>
      _kunci(() async {
        final tgl = tanggalIni();
        final d0 = await _baca(s.userId, tgl);
        final r = InsDuLokal.realisasi(d0, realisasiId);
        if (r == null) throw ApiException('DATA_TIDAK_DITEMUKAN');
        final baru = g != null && g.garduId != '${r['garduId'] ?? ''}' ? g : null;
        final kunci = InsDuLokal.kunciUbahGardu(r, tierBaru: tier, gantiGardu: baru != null);
        if (kunci != null) throw ApiException(kunci);
        if (baru != null && InsDuLokal.garduGanda(d0, baru.garduId)) throw ApiException('GARDU_GANDA');
        final tampil = <String, dynamic>{
          'tier': tier,
          if (baru != null) 'garduId': baru.garduId,
          if (baru != null) ...tampilGarduInsDu(baru),
          if (kapasitasKva != null) 'kapasitasKva': kapasitasKva, // v1.0.38
          if (merkTrafo != null) 'merkTrafo': merkTrafo,
        };
        await _ubahNode(s, tgl, 'simpanRealisasi', 'ubahRealisasi', realisasiId, {'realisasiId': realisasiId},
            {
              'tier': tier,
              if (baru != null) 'garduId': baru.garduId,
              if (kapasitasKva != null) 'kapasitasKva': kapasitasKva,
              if (merkTrafo != null) 'merkTrafo': merkTrafo,
            },
            (d, tandai) => InsDuLokal.ubahIsianRealisasi(d, realisasiId, tampil, tandaiUbah: tandai));
      });

  /// Pengukuran LWBP (wajib + cover) / WBP. Isi ulang sebelum terkirim = kiriman yang sama diperbaiki.
  Future<void> simpanUkur(Sesi s, String realisasiId, String periode, Map<String, num> nilai,
          {Map<String, String> cover = const {}, String? catatan}) =>
      _kunci(() async {
        final tgl = tanggalIni();
        final d0 = await _baca(s.userId, tgl);
        final r = InsDuLokal.garduUkur(d0, realisasiId);
        if (r == null) throw ApiException('DATA_TIDAK_DITEMUKAN');
        // v1.0.16: gardu tunggakan boleh LWBP susulan kalau LWBP-nya belum ada (server: tunggakan kurang = LWBP)
        if (InsDuLokal.garduTunggakan(d0, realisasiId) && periode != 'WBP' && r[InsDuLokal.kunciUkur('LWBP')] == null &&
            petaInsDu(r['pengukuran'])?['lwbp'] != null) {
          throw ApiException('TANGGAL_DI_LUAR_BATAS');
        }
        if (!InsDuLokal.garduTunggakan(d0, realisasiId) && !perluUkurInsDu(r['tier'])) throw ApiException('TIER_TANPA_PENGUKURAN');
        final pk = r['pengukuran'];
        if (periode == 'WBP' && (pk is! Map || pk['lwbp'] == null)) throw ApiException('URUTAN_PENGUKURAN');
        final data = <String, dynamic>{
          'realisasiId': realisasiId,
          'periode': periode,
          'waktu': _jam().toUtc().toIso8601String(),
          ...nilai,
          if (periode == 'LWBP') ...cover,
          if (catatan != null && catatan.isNotEmpty) 'catatan': catatan,
        };
        final target = InsDuLokal.targetUkur(realisasiId, periode);
        final ada = _opTarget(await _gudang.ops(s.userId), 'simpanUkur', target);
        if (ada != null) {
          ada
            ..data = data
            ..status = OpHartek.menunggu
            ..galat = null;
          await _gudang.ubahOp(ada);
        } else {
          await _gudang.tambahOp(_op(s.userId, tgl, 'simpanUkur', target, data));
        }
        await _ubahDoc(s.userId, tgl,
            (d) => InsDuLokal.simpanUkur(d, realisasiId, periode, nilai, cover: cover, catatan: catatan, waktu: '${data['waktu']}'));
      });

  Future<void> cobaUlangUkur(Sesi s, String realisasiId, String periode) => _kunci(() async {
        final t = InsDuLokal.targetUkur(realisasiId, periode);
        for (final o in await _gudang.ops(s.userId)) {
          if (o.aksi == 'simpanUkur' && o.target == t) await _gudang.aturStatusOp(o.id, OpHartek.menunggu, null);
        }
        await _ubahDoc(s.userId, tanggalIni(), (d) => InsDuLokal.tandaiUkur(d, realisasiId, periode, InsDuLokal.lokal));
      });

  Future<void> buangUkur(Sesi s, String realisasiId, String periode) => _kunci(() async {
        final t = InsDuLokal.targetUkur(realisasiId, periode);
        for (final o in await _gudang.ops(s.userId)) {
          if (o.aksi == 'simpanUkur' && o.target == t) await _gudang.hapusOp(o.id);
        }
        await _ubahDoc(s.userId, tanggalIni(), (d) => InsDuLokal.buangUkur(d, realisasiId, periode));
      });

  Future<void> _ubahNode(Sesi s, String tgl, String aksiBuat, String aksiUbah, String id, Map<String, dynamic> kunciData,
      Map<String, dynamic> kirim, void Function(Map<String, dynamic> d, bool tandaiUbah) terapkan, {List<String>? tetap}) async {
    final ops = await _gudang.ops(s.userId);
    final buat = _opTarget(ops, aksiBuat, id);
    if (buat != null) {
      final lama = buat.data;
      buat
        ..data = tetap == null
            ? {...lama, ...kirim}
            : {
                for (final k in tetap)
                  if (lama.containsKey(k)) k: lama[k],
                ...kirim,
              }
        ..status = OpHartek.menunggu
        ..galat = null;
      await _gudang.ubahOp(buat);
      await _ubahDoc(s.userId, tgl, (d) {
        terapkan(d, false);
        InsDuLokal.tandai(d, id, InsDuLokal.lokal);
      });
      return;
    }
    final ubah = _opTarget(ops, aksiUbah, id);
    if (ubah != null) {
      ubah
        ..data = tetap == null ? {...ubah.data, ...kirim} : {...kunciData, ...kirim}
        ..status = OpHartek.menunggu
        ..galat = null;
      await _gudang.ubahOp(ubah);
    } else {
      await _gudang.tambahOp(_op(s.userId, tgl, aksiUbah, id, {...kunciData, ...kirim}));
    }
    await _ubahDoc(s.userId, tgl, (d) => terapkan(d, true));
  }

  Future<void> ubahTemuan(Sesi s, String temuanId, Map<String, dynamic> data, Map<String, dynamic> tampil) => _kunci(() async {
        final tgl = tanggalIni();
        final t = InsDuLokal.temuan(await _baca(s.userId, tgl), temuanId);
        if (t == null) throw ApiException('DATA_TIDAK_DITEMUKAN');
        final wo = t['wo'] is Map ? '${(t['wo'] as Map)['status'] ?? ''}' : '';
        if (wo == 'DIKERJAKAN' || wo == 'SELESAI') throw ApiException('WO_SUDAH_DIMULAI');
        await _ubahNode(s, tgl, 'simpanTemuan', 'ubahTemuan', temuanId, {'temuanId': temuanId}, data,
            (d, tandai) => InsDuLokal.ubahIsianTemuan(d, temuanId, tampil, tandaiUbah: tandai),
            tetap: const ['realisasiId', 'idBaris']);
      });

  Future<String> tambahTemuan(Sesi s, String realisasiId, Map<String, dynamic> data, Map<String, dynamic> tampil,
          {Map<String, String> foto = const {}}) =>
      _kunci(() async {
        final tgl = tanggalIni();
        if (InsDuLokal.realisasi(await _baca(s.userId, tgl), realisasiId) == null) throw ApiException('DATA_TIDAK_DITEMUKAN');
        final id = _uuid.v4();
        await _gudang.tambahOp(_op(s.userId, tgl, 'simpanTemuan', id, {...data, 'realisasiId': realisasiId, 'idBaris': id}));
        final fotoSah = {
          for (final e in foto.entries)
            if (InsDuLokal.slotFoto.contains(e.key) && e.value.isNotEmpty) e.key: e.value,
        };
        for (final e in fotoSah.entries) {
          await _gudang.tambahOp(_opFoto(s.userId, tgl, id, e.key, e.value));
        }
        await _ubahDoc(s.userId, tgl, (d) {
          InsDuLokal.tambahTemuan(d, realisasiId, {...tampil, 'temuanId': id, 'kodeTemuan': '', 'revision': 1});
          for (final e in fotoSah.entries) {
            InsDuLokal.tambahFoto(d, id, e.key, e.value);
          }
        });
        return id;
      });

  OpHartek _opFoto(String userId, String tgl, String temuanId, String slot, String path) => _op(
      userId, tgl, 'uploadFoto', InsDuLokal.targetFoto(temuanId, slot), {'temuanId': temuanId, 'slot': slot, 'path': path});

  Future<void> tambahFoto(Sesi s, String temuanId, String slot, String path) => _kunci(() async {
        final tgl = tanggalIni();
        final t = InsDuLokal.temuan(await _baca(s.userId, tgl), temuanId);
        if (t == null || !InsDuLokal.slotFoto.contains(slot)) throw ApiException('DATA_TIDAK_DITEMUKAN');
        final hp = t['fotoLokal'], srv = t['foto'];
        if ((hp is Map && hp[slot] != null) || (srv is Map && '${srv[slot] ?? ''}'.isNotEmpty)) throw ApiException('FOTO_SUDAH_ADA');
        await _gudang.tambahOp(_opFoto(s.userId, tgl, temuanId, slot, path));
        await _ubahDoc(s.userId, tgl, (d) => InsDuLokal.tambahFoto(d, temuanId, slot, path));
      });

  Future<void> cobaUlangFoto(Sesi s, String temuanId, String slot) => _kunci(() async {
        final t = InsDuLokal.targetFoto(temuanId, slot);
        for (final o in await _gudang.ops(s.userId)) {
          if (o.aksi == 'uploadFoto' && o.target == t && o.status == OpHartek.gagal) {
            await _gudang.aturStatusOp(o.id, OpHartek.menunggu, null);
          }
        }
        await _ubahDoc(s.userId, tanggalIni(), (d) => InsDuLokal.tandaiFoto(d, temuanId, slot, InsDuLokal.lokal));
      });

  Future<void> buangFoto(Sesi s, String temuanId, String slot) => _kunci(() async {
        final t = InsDuLokal.targetFoto(temuanId, slot);
        for (final o in await _gudang.ops(s.userId)) {
          if (o.aksi == 'uploadFoto' && o.target == t) await _gudang.hapusOp(o.id);
        }
        String? path;
        await _ubahDoc(s.userId, tanggalIni(), (d) => path = InsDuLokal.buangFoto(d, temuanId, slot));
        await _hapusFoto(path);
      });

  // ---------- ditolak: coba lagi / buang ----------

  Future<void> cobaUlang(Sesi s, String id, {bool ubah = false}) => _kunci(() async {
        for (final o in await _gudang.ops(s.userId)) {
          if (o.target != id || o.status != OpHartek.gagal || InsDuLokal.aksiBuat(o.aksi) == ubah) continue;
          await _gudang.aturStatusOp(o.id, OpHartek.menunggu, null);
        }
        await _ubahDoc(s.userId, tanggalIni(), (d) {
          if (ubah) {
            InsDuLokal.tandaiUbah(d, id, InsDuLokal.lokal);
          } else {
            InsDuLokal.tandai(d, id, InsDuLokal.lokal);
          }
        });
      });

  Future<void> buang(Sesi s, String id, {bool ubah = false}) => _kunci(() async {
        final tgl = tanggalIni();
        if (ubah) {
          for (final o in await _gudang.ops(s.userId)) {
            if (o.target == id && InsDuLokal.aksiUbah(o.aksi)) await _gudang.hapusOp(o.id);
          }
          await _ubahDoc(s.userId, tgl, (d) => InsDuLokal.tandaiUbah(d, id, null));
          return;
        }
        final d0 = await _baca(s.userId, tgl);
        final n = InsDuLokal.cari(d0, id);
        if (n != null && !InsDuLokal.tertunda(n)) return; // sudah di server
        final ids = InsDuLokal.idTurunan(d0, id).toSet();
        final file = <String>[];
        for (final o in await _gudang.ops(s.userId)) {
          if (o.tanggal != tgl) continue;
          final foto = o.aksi == 'uploadFoto' && ids.contains('${o.data['temuanId'] ?? ''}');
          if (foto) file.add('${o.data['path'] ?? ''}');
          final anak = o.aksi == 'simpanUkur' && ids.contains('${o.data['realisasiId'] ?? ''}');
          if (ids.contains(o.target) || foto || anak) await _gudang.hapusOp(o.id);
        }
        await _ubahDoc(s.userId, tgl, (d) => InsDuLokal.buang(d, id));
        for (final f in file) {
          await _hapusFoto(f);
        }
      });

  Future<int> jumlahTanggalLain(String userId) async {
    final tgl = tanggalIni();
    return (await _gudang.ops(userId)).where((o) => o.tanggal != tgl && !_wbp(o)).length;
  }

  /// Pengukuran susulan yang masih diterima server sesudah hari berganti (gardu tunggakan). v1.0.16: LWBP juga.
  static bool _wbp(OpHartek o) => o.aksi == 'simpanUkur' && o.status == OpHartek.menunggu;

  Future<void> buangTanggalLain(Sesi s) => _kunci(() async {
        final tgl = tanggalIni();
        final lama = <String>{};
        for (final o in await _gudang.ops(s.userId)) {
          if (o.tanggal == tgl || _wbp(o)) continue; // pengukuran susulan masih diterima server
          lama.add(o.tanggal);
          await _gudang.hapusOp(o.id);
          if (o.aksi == 'uploadFoto') await _hapusFoto('${o.data['path'] ?? ''}');
        }
        final masihWbp = {for (final o in await _gudang.ops(s.userId)) if (_wbp(o)) o.tanggal};
        for (final t in lama.difference(masihWbp)) {
          await _gudang.hapusDoc(s.userId, t);
        }
        notifyListeners();
      });

  Future<int> jumlahTertunda(String userId) async => (await _gudang.ops(userId)).length;

  // ---------- kirim ----------

  Future<HasilKirimHartek> kirim(Sesi s) async {
    var terkirim = 0, gagal = 0;
    final percobaan = <int, int>{};
    while (true) {
      final semua = await _kunci(() => _gudang.ops(s.userId));
      final blok = <String>{
        for (final o in semua)
          if (o.status == OpHartek.gagal && InsDuLokal.aksiBuat(o.aksi)) o.target,
      };
      OpHartek? op;
      for (final o in semua) {
        if (o.status != OpHartek.menunggu) continue;
        final induk = InsDuLokal.induk(o.aksi, o.data);
        if ((induk != null && blok.contains(induk)) || (percobaan[o.id] ?? 0) >= 3) {
          if (InsDuLokal.aksiBuat(o.aksi)) blok.add(o.target);
          continue;
        }
        op = o;
        break;
      }
      if (op == null) break;
      percobaan[op.id] = (percobaan[op.id] ?? 0) + 1;
      switch (await _kirimSatu(s, op, percobaan[op.id]!)) {
        case _Hasil.terkirim:
          terkirim++;
        case _Hasil.gagal:
          gagal++;
        case _Hasil.ulang:
          break;
      }
    }
    await _gudang.bersihkan(s.userId, Wib.tanggal(_jam().subtract(const Duration(days: 7))));
    if (folderFoto.isNotEmpty) unawaited(FotoLapangan.bersihkanLama(folderFoto, const Duration(days: 8)));
    return HasilKirimHartek(terkirim, gagal);
  }

  Future<_Hasil> _kirimSatu(Sesi s, OpHartek op, int ke) async {
    // WBP malam yang baru terkirim besok pagi tetap dikirim: server menerimanya sebagai tunggakan (susulan).
    // v1.0.16: LWBP juga (gardu yang LWBP-nya belum sampai server = tunggakan kurang LWBP).
    final wbpSusulan = op.aksi == 'simpanUkur';
    if (op.tanggal != tanggalIni() && !wbpSusulan) {
      await _kunci(() => _gagalkan(s, op,
          'Belum terkirim sampai hari berganti. Server hanya menerima laporan hari ini, buang data ini lalu catat ulang bila perlu.'));
      return _Hasil.gagal;
    }
    final snapshot = jsonEncode(op.data);
    final data = Map<String, dynamic>.from(op.data);
    if (InsDuLokal.aksiUbah(op.aksi)) {
      final n = InsDuLokal.cari(await _kunci(() => _baca(s.userId, op.tanggal)), op.target);
      data['revision'] = n != null && n['revision'] is num ? n['revision'] : 1;
    }
    if (op.aksi == 'uploadFoto') {
      final bytes = await _bacaFoto('${op.data['path'] ?? ''}');
      if (bytes == null) {
        await _kunci(() => _gagalkan(s, op, 'File foto tidak ada lagi di HP. Buang foto ini lalu ambil ulang.'));
        return _Hasil.gagal;
      }
      data
        ..remove('path')
        ..addAll(FotoLapangan.isiKirim(bytes));
    }
    try {
      final r = await _panggil(s, InsDuLokal.endpoint[op.aksi]!, data);
      await _kunci(() => _diterima(s, op, r, snapshot));
      return _Hasil.terkirim;
    } on ApiException catch (e) {
      if (KodeError.sesiHabis.contains(e.kode) || HartekStore.putus(e.kode)) rethrow;
      if (op.aksi == 'buatHeader' && e.kode == 'LAPORAN_UTAMA_SUDAH_DIBUAT') {
        final h = (await _panggil(s, 'getInsDuHarian', const {}))['header'];
        if (h is Map && '${h['headerId'] ?? ''}'.isNotEmpty) {
          await _kunci(() => _diterima(s, op, {'headerId': '${h['headerId']}', 'kodeHeader': '${h['kodeHeader'] ?? ''}'}, snapshot));
          return _Hasil.terkirim;
        }
      }
      if (InsDuLokal.aksiUbah(op.aksi) && e.kode == 'KONFLIK_REVISION' && ke < 3) {
        final srv = await _panggil(s, 'getInsDuHarian', const {});
        final nSrv = InsDuLokal.cari(srv, op.target);
        if (nSrv != null && nSrv['revision'] is num) {
          await _kunci(() async {
            final d = InsDuLokal.salin(await _baca(s.userId, op.tanggal));
            final n = InsDuLokal.cari(d, op.target);
            if (n != null) n['revision'] = nSrv['revision'];
            await _tulis(s.userId, op.tanggal, d);
          });
          return _Hasil.ulang;
        }
      }
      await _kunci(() => _gagalkan(s, op, pesanInsDu(e.kode)));
      return _Hasil.gagal;
    }
  }

  Future<void> _diterima(Sesi s, OpHartek op, Map<String, dynamic> r, String snapshot) async {
    final d = InsDuLokal.salin(await _baca(s.userId, op.tanggal));
    switch (op.aksi) {
      case 'buatHeader':
        final baru = '${r['headerId'] ?? ''}'.isEmpty ? op.target : '${r['headerId']}';
        if (baru != op.target) {
          InsDuLokal.gantiHeaderId(d, op.target, baru, '${r['kodeHeader'] ?? ''}');
          for (final o in await _gudang.ops(s.userId)) {
            var ubah = false;
            if (o.target == op.target) {
              o.target = baru;
              ubah = true;
            }
            if ('${o.data['headerId'] ?? ''}' == op.target) {
              o.data = {...o.data, 'headerId': baru};
              ubah = true;
            }
            if (ubah) await _gudang.ubahOp(o);
          }
        } else {
          InsDuLokal.diterima(d, op.aksi, op.target, r);
        }
      case 'ubahHeader':
      case 'ubahRealisasi':
      case 'ubahTemuan':
        final n = InsDuLokal.cari(d, op.target);
        if (n != null && r['revision'] != null) n['revision'] = r['revision'];
      case 'simpanUkur':
        InsDuLokal.ukurDiterima(d, '${op.data['realisasiId']}', '${op.data['periode']}', r);
      case 'uploadFoto':
        InsDuLokal.tandaiFoto(d, '${op.data['temuanId']}', '${op.data['slot']}', null, link: '${r['link'] ?? ''}');
        final tf = InsDuLokal.temuan(d, '${op.data['temuanId']}');
        if (tf != null && r['revision'] is num) tf['revision'] = r['revision'];
      default:
        InsDuLokal.diterima(d, op.aksi, op.target, r);
    }
    OpHartek? kini;
    for (final o in await _gudang.ops(s.userId)) {
      if (o.id == op.id) kini = o;
    }
    // pengukuran / perubahan yang diisi ulang selama terkirim = kirim lagi isian terbaru
    final bisaBerubah = InsDuLokal.aksiUbah(op.aksi) || op.aksi == 'simpanUkur';
    final berubah = kini != null && bisaBerubah && jsonEncode(kini.data) != snapshot;
    if (kini != null && !berubah) await _gudang.hapusOp(op.id);
    if (InsDuLokal.aksiUbah(op.aksi) && !berubah) InsDuLokal.tandaiUbah(d, op.target, null);
    if (op.aksi == 'simpanUkur' && berubah) InsDuLokal.tandaiUkur(d, '${op.data['realisasiId']}', '${op.data['periode']}', InsDuLokal.lokal);
    await _tulis(s.userId, op.tanggal, d);
  }

  Future<void> _gagalkan(Sesi s, OpHartek op, String pesan) async {
    await _gudang.aturStatusOp(op.id, OpHartek.gagal, pesan);
    await _ubahDoc(s.userId, op.tanggal, (d) {
      if (op.aksi == 'uploadFoto') {
        InsDuLokal.tandaiFoto(d, '${op.data['temuanId']}', '${op.data['slot']}', InsDuLokal.gagal, pesan: pesan);
      } else if (op.aksi == 'simpanUkur') {
        InsDuLokal.tandaiUkur(d, '${op.data['realisasiId']}', '${op.data['periode']}', InsDuLokal.gagal, pesan: pesan);
      } else if (InsDuLokal.aksiUbah(op.aksi)) {
        InsDuLokal.tandaiUbah(d, op.target, InsDuLokal.gagal, pesan: pesan);
      } else {
        InsDuLokal.tandai(d, op.target, InsDuLokal.gagal, pesan: pesan);
      }
    });
  }

  /// v1.0.16: hapus gardu tunggakan laporan sebelumnya dari laporan (langsung ke server, butuh sinyal). Pengukuran HP
  /// gardu itu yang belum terkirim ikut dibuang. Sesudahnya tunggakan ditarik ulang dari server.
  Future<void> hapusTunggakan(Sesi s, String realisasiId) async {
    final d0 = await _kunci(() => _baca(s.userId, tanggalIni()));
    final r = InsDuLokal.garduUkur(d0, realisasiId);
    if (r == null || !InsDuLokal.garduTunggakan(d0, realisasiId)) throw ApiException('DATA_TIDAK_DITEMUKAN');
    await _panggil(s, 'hapusRealisasiInsDu', {'realisasiId': realisasiId, 'revision': r['revision'] is num ? r['revision'] : 1});
    await _kunci(() async {
      for (final o in await _gudang.ops(s.userId)) {
        if (o.aksi == 'simpanUkur' && '${o.data['realisasiId'] ?? ''}' == realisasiId) await _gudang.hapusOp(o.id);
      }
      await _ubahDoc(s.userId, tanggalIni(), (d) {
        final t = InsDuLokal.tunggakan(d);
        if (t != null && t['realisasi'] is List) (t['realisasi'] as List).removeWhere((x) => x is Map && '${x['realisasiId']}' == realisasiId);
      });
    });
    try {
      await tarik(s);
    } catch (_) {/* daftar lokal sudah diperbarui */}
  }

  /// Tarik laporan hari ini + tunggakan dari server, digabung dengan data HP yang belum terkirim.
  Future<void> tarik(Sesi s) async {
    final srv = await _panggil(s, 'getInsDuHarian', const {});
    final tgl = '${srv['tanggal'] ?? ''}';
    if (tgl != tanggalIni()) return;
    await _kunci(() async {
      final d = await _baca(s.userId, tgl);
      await _tulis(s.userId, tgl, InsDuLokal.gabung(d, srv));
    });
  }

  // ---------- master ----------

  Future<Map<String, dynamic>> master(Sesi s) async {
    final ada = await _gudang.bacaMaster(kunciMaster);
    if (ada != null) {
      if (_jam().difference(ada.diambil) > umurMaster) unawaited(_unduhMaster(s).then<void>((_) {}, onError: (Object _) {}));
      return Map<String, dynamic>.from(jsonDecode(ada.json) as Map);
    }
    return _unduhMaster(s);
  }

  Future<Map<String, dynamic>> _unduhMaster(Sesi s) async {
    final r = await _panggil(s, 'getMasterInsDu', const {});
    await _gudang.tulisMaster(kunciMaster, jsonEncode(r));
    return r;
  }

  Future<void> segarkanMaster(Sesi s, {bool paksa = false}) async {
    final ada = await _gudang.bacaMaster(kunciMaster);
    if (paksa || ada == null || _jam().difference(ada.diambil) > umurMaster) await _unduhMaster(s);
  }
}

enum _Hasil { terkirim, gagal, ulang }

String pesanInsDu(String kode) {
  switch (kode) {
    case 'LAPORAN_UTAMA_SUDAH_DIBUAT':
      return 'Laporan Utama telah dibuat. Buka laporan yang sudah ada.';
    case 'KONFLIK_REVISION':
      return 'Data telah diubah perangkat lain. Segarkan laporan sebelum mengubahnya.';
    case 'KM_AKHIR_KURANG':
      return 'KM akhir tidak boleh lebih kecil dari KM awal.';
    case 'GARDU_GANDA':
      return 'Gardu ini sudah ada di laporan hari ini.';
    case 'GARDU_TERKUNCI':
      return 'Gardu tidak bisa diganti karena sudah ada pengukuran atau temuan. Tier masih bisa diubah.';
    case 'TIER_TERKUNCI':
      return 'Tier tidak bisa diubah: pengukuran sudah diisi (perlu Tier 1) atau ada temuan dengan tier yang dihapus.';
    case 'TIER_TANPA_PENGUKURAN':
      return 'Gardu Tier 2 saja tidak memakai pengukuran LWBP / WBP.';
    case 'TIER_TIDAK_SESUAI':
      return 'Tier temuan harus salah satu tier gardu ini.';
    case 'JENIS_TEMUAN_TIDAK_VALID':
      return 'Jenis temuan tidak aktif atau tidak ada di db_Jenis_Temuan. Pilih dari daftar.';
    case 'TANGGAL_DI_LUAR_BATAS':
      return 'Data ini bukan laporan hari ini. Hanya pengukuran gardu tunggakan yang boleh diisi susulan.';
    case 'FOTO_SUDAH_ADA':
      return 'Foto ini sudah ada.';
    case 'FOTO_RUSAK':
      return 'Foto rusak saat dikirim. Coba lagi.';
    case 'FOTO_TERLALU_BESAR':
      return 'Foto lebih dari 2 MB. Ambil ulang.';
    default:
      return KodeError.pesan(kode);
  }
}

/// Isian gardu yang ditampilkan dari master (sebelum server menjawab).
Map<String, dynamic> tampilGarduInsDu(GarduInsDu g) => {
      'noGardu': g.noGardu,
      'penyulang': g.penyulang,
      'section': g.section,
      'alamat': g.alamat,
      'kapasitasKva': g.kapasitasKva,
      'merkTrafo': g.merk,
    };
