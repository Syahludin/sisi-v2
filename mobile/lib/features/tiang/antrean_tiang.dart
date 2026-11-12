import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../hartek/foto_lapangan.dart';
import '../hartek/hartek_store.dart' show GudangHartek;

/// Tempat tiang disimpan di HP (daftar jalur): diperbarui antrean saat server menerima / petugas membuang entri.
abstract interface class TiangLokal {
  /// Server menerima [refLama] (id sementara atau id asli); [tiang] = jawaban server. [menunggu] = masih ada perubahan lebih baru di antrean.
  Future<void> terima(Sesi s, String refLama, Map<String, dynamic> tiang, {required bool menunggu});

  /// Entri dibuang: kembalikan tiang [ref] ke [asal] (null = tiang baru, hapus dari daftar).
  Future<void> pulihkan(Sesi s, String ref, Map<String, dynamic>? asal, String kode);

  /// Sama untuk segmen: [segmen] = jawaban server (bentuk getSegmen).
  Future<void> terimaSegmen(Sesi s, String refLama, Map<String, dynamic> segmen, {required bool menunggu});
  Future<void> pulihkanSegmen(Sesi s, String ref, Map<String, dynamic>? asal);
}

/// v1.0.71 (permintaan Master Guswan 10 Nov 2026, rancangan docs/superpowers/specs/2026-11-10-antrean-tiang-lokal-design.md):
/// Simpan verifikasi tiang tidak lagi menunggu server. Perubahan masuk antrean ini (per akun, di HP), daftar jalur langsung berubah,
/// lalu SyncController mengirimnya di latar lewat satu panggilan `sinkronTiang` (induk lebih dulu), baru foto.
///
/// Satu entri per tiang: {opId, versi, ref (id tiang atau LOKAL-uuid), kode (jalur), data (payload simpanVerifikasiTiang; null = sudah
/// diterima server, tinggal foto), asal (tiang sebelum diubah; null = tiang baru), tampil (tiang seperti tampil di HP), foto: {slot: path}, galat}.
/// [galat] terisi = ditolak server (bukan sinyal): tidak diulang otomatis sampai Kirim ulang / Buang; tiang anak menunggu.
/// [versi] naik tiap simpan: bila petugas menyimpan lagi saat entri sedang dikirim, perubahan terbaru tidak hilang.
class AntreanTiang extends ChangeNotifier {
  AntreanTiang(this._gudang, this._api, this._lokal, {Future<List<int>?> Function(String path)? bacaFoto, Future<void> Function(String? path)? hapusFoto})
      : _bacaFoto = bacaFoto ?? FotoLapangan.baca,
        _hapusFoto = hapusFoto ?? FotoLapangan.hapus;

  final GudangHartek _gudang;
  final Future<Map<String, dynamic>> Function(Sesi s, String aksi, Map<String, dynamic> data) _api;
  final TiangLokal _lokal;
  final Future<List<int>?> Function(String path) _bacaFoto;
  final Future<void> Function(String? path) _hapusFoto;

  static const menu = 'OPS_VERIFIKASI_TIANG';
  static const maksPerKirim = 25;

  static String kunci(String userId) => 'antre_tiang_$userId';
  static String idSementara() => 'LOKAL-${const Uuid().v4()}';
  static bool sementara(String id) => id.startsWith('LOKAL-');

  List<Map<String, dynamic>> _item = const [];
  String? _userItem;
  bool _jalan = false;
  Future<void> _rantai = Future<void>.value();

  static String _t(Object? v) => v?.toString().trim() ?? '';

  Future<T> _kunci<T>(Future<T> Function() f) {
    final hasil = _rantai.then((_) => f());
    _rantai = hasil.then((_) {}, onError: (Object _) {});
    return hasil;
  }

  /// Salinan cadangan antrean di berkas HP (terpisah dari gudang data), ditulis SEBELUM gudang: isian yang belum terkirim tidak hilang
  /// walau gudang gagal menulis / terbaca kosong. Foto tiang sudah berkas sendiri di folder app.
  static Future<File?> _berkasCadangan(String userId) async {
    try {
      final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'verifikasi_tiang'));
      if (!dir.existsSync()) await dir.create(recursive: true);
      return File(p.join(dir.path, 'antre_${userId.replaceAll(RegExp(r'[^0-9A-Za-z_-]'), '')}.cadangan.json'));
    } catch (_) {
      return null;
    }
  }

  static List<Map<String, dynamic>> _urai(String json) {
    final l = jsonDecode(json) as List<dynamic>;
    return [for (final x in l) if (x is Map) Map<String, dynamic>.from(x)];
  }

  Future<List<Map<String, dynamic>>> _baca(String userId) async {
    try {
      final r = await _gudang.bacaMaster(kunci(userId));
      if (r != null) return _urai(r.json);
    } catch (_) {
      // jatuh ke cadangan
    }
    try {
      final f = await _berkasCadangan(userId);
      if (f != null && f.existsSync()) return _urai(await f.readAsString());
    } catch (_) {}
    return [];
  }

  Future<void> _tulis(String userId, List<Map<String, dynamic>> l) async {
    final json = jsonEncode(l);
    try {
      final f = await _berkasCadangan(userId);
      if (f != null) {
        final tmp = File('${f.path}.tmp');
        await tmp.writeAsString(json, flush: true);
        await tmp.rename(f.path);
      }
    } catch (_) {
      // cadangan hanya pengaman tambahan; gudang tetap sumber utama
    }
    await _gudang.tulisMaster(kunci(userId), json);
    _item = l;
    _userItem = userId;
    notifyListeners();
  }

  /// Antrean akun [userId] (dibaca dari HP sekali, lalu dari salinan).
  Future<List<Map<String, dynamic>>> daftar(String userId) => _kunci(() async {
        if (_userItem != userId) {
          _item = await _baca(userId);
          _userItem = userId;
        }
        return _item;
      });

  /// Entri tiang [ref] dari salinan (null = tidak ada / salinan belum dibaca lewat [daftar]).
  Map<String, dynamic>? item(String userId, String ref) {
    if (_userItem != userId) return null;
    for (final x in _item) {
      if (_t(x['ref']) == ref) return x;
    }
    return null;
  }

  /// Jumlah entri yang belum selesai (menunggu + ditolak): menahan logout.
  Future<int> jumlahTertunda(String userId) async => (await daftar(userId)).length;

  /// Tiang (bentuk tampil) yang belum diterima server untuk jalur [kode], dipasang lagi sesudah daftar jalur diunduh ulang.
  List<Map<String, dynamic>> belumDiServer(String userId, String kode) => [
        if (_userItem == userId)
          for (final x in _item)
            if (!_segmen(x) && x['data'] is Map && x['tampil'] is Map && _t(x['kode']) == kode) Map<String, dynamic>.from(x['tampil'] as Map),
      ];

  /// Segmen (bentuk tampil) yang belum diterima server, dipasang lagi sesudah daftar segmen diunduh ulang.
  List<Map<String, dynamic>> segmenBelumDiServer(String userId) => [
        if (_userItem == userId)
          for (final x in _item)
            if (_segmen(x) && x['data'] is Map && x['tampil'] is Map) Map<String, dynamic>.from(x['tampil'] as Map),
      ];

  static bool _segmen(Map<String, dynamic> x) => _t(x['jenis']) == 'SEGMEN';

  /// Simpan perubahan tiang [ref]. [data] = payload simpanVerifikasiTiang, [tampil] = tiang seperti tampil di HP, [asal] = tiang sebelum
  /// diubah (null = tiang baru), [foto] = {slot: path} yang baru diambil (foto lama slot itu yang belum terkirim diganti).
  Future<void> tambahTiang(Sesi s,
          {required String ref,
          required String kode,
          required Map<String, dynamic> data,
          required Map<String, dynamic> tampil,
          required Map<String, dynamic>? asal,
          required Map<String, String> foto}) =>
      _tambah(s, 'TIANG', ref: ref, kode: kode, data: data, tampil: tampil, asal: asal, foto: foto);

  /// Simpan perubahan segmen [ref] (payload simpanSegmen). Dikirim sebelum tiang yang memakainya.
  Future<void> tambahSegmen(Sesi s, {required String ref, required Map<String, dynamic> data, required Map<String, dynamic> tampil, required Map<String, dynamic>? asal}) =>
      _tambah(s, 'SEGMEN', ref: ref, kode: '', data: data, tampil: tampil, asal: asal, foto: const {});

  Future<void> _tambah(Sesi s, String jenis,
          {required String ref,
          required String kode,
          required Map<String, dynamic> data,
          required Map<String, dynamic> tampil,
          required Map<String, dynamic>? asal,
          required Map<String, String> foto}) =>
      _kunci(() async {
        final l = [...await _baca(s.userId)];
        final ada = l.where((x) => _t(x['ref']) == ref).firstOrNull;
        final hapus = <String>[];
        if (ada == null) {
          l.add({'opId': const Uuid().v4(), 'versi': 1, 'jenis': jenis, 'ref': ref, 'kode': kode, 'data': data, 'asal': asal, 'tampil': tampil, 'foto': foto, 'galat': ''});
        } else {
          final f = Map<String, String>.from(ada['foto'] as Map? ?? const {});
          foto.forEach((slot, path) {
            if (f[slot] != null && f[slot] != path) hapus.add(f[slot]!);
            f[slot] = path;
          });
          // id sementara: opId tetap (kirim ulang karena sinyal putus tidak membuat data ganda); id asli: opId baru tiap simpan
          if (!sementara(ref) || ada['data'] == null) ada['opId'] = const Uuid().v4();
          ada
            ..['versi'] = (ada['versi'] as num? ?? 0).toInt() + 1
            ..['data'] = data
            ..['tampil'] = tampil
            ..['foto'] = f
            ..['galat'] = '';
        }
        await _tulis(s.userId, l);
        for (final p in hapus) {
          await _hapusFoto(p);
        }
      });

  /// Ditolak server: kirim lagi (galat dihapus).
  Future<void> kirimUlang(Sesi s, String ref) => _kunci(() async {
        final l = [...await _baca(s.userId)];
        for (final x in l) {
          if (_t(x['ref']) == ref) x['galat'] = '';
        }
        await _tulis(s.userId, l);
      });

  /// Buang entri: tiang kembali seperti sebelum diubah (tiang baru dihapus dari daftar), foto di HP dihapus.
  Future<void> buang(Sesi s, String ref) => _kunci(() async {
        final l = [...await _baca(s.userId)];
        final x = l.where((y) => _t(y['ref']) == ref).firstOrNull;
        if (x == null) return;
        l.remove(x);
        await _tulis(s.userId, l);
        for (final p in (x['foto'] as Map? ?? const {}).values) {
          await _hapusFoto(p?.toString());
        }
        if (x['data'] != null) {
          final asal = x['asal'] is Map ? Map<String, dynamic>.from(x['asal'] as Map) : null;
          if (_segmen(x)) {
            await _lokal.pulihkanSegmen(s, ref, asal);
          } else {
            await _lokal.pulihkan(s, ref, asal, _t(x['kode']));
          }
        }
      });

  /// id yang harus sudah diterima server lebih dulu: induk tiang + segmen yang dipakai sirkuit (tiang), induk segmen (segmen).
  static Set<String> _induk(Map<String, dynamic> x) {
    final d = x['data'];
    if (d is! Map) return {};
    if (_segmen(x)) return {if (_t(d['indukSegmenId']).isNotEmpty) _t(d['indukSegmenId'])};
    final sirkuit = d['sirkuit'] is List ? d['sirkuit'] as List : const [];
    return {
      for (final s in sirkuit)
        if (s is Map) ...{
          if (_t(s['indukTiangId']).isNotEmpty) _t(s['indukTiangId']),
          if (_t(s['segmenId']).isNotEmpty) _t(s['segmenId']),
        }
    };
  }

  /// Entri yang siap dikirim, berurutan: induk yang juga ada di antrean mendahului anaknya; anak dari induk bergalat ikut menunggu.
  static List<Map<String, dynamic>> urutanKirim(List<Map<String, dynamic>> l) {
    final tunggu = [for (final x in l) if (x['data'] is Map) x];
    final byRef = {for (final x in tunggu) _t(x['ref']): x};
    bool tertahan(Map<String, dynamic> x, [Set<String>? lihat]) {
      final sudah = lihat ?? <String>{};
      if (!sudah.add(_t(x['ref']))) return false;
      return _induk(x).any((i) {
        final p = byRef[i];
        return p != null && (_t(p['galat']).isNotEmpty || tertahan(p, sudah));
      });
    }

    final siap = [for (final x in tunggu) if (_t(x['galat']).isEmpty && !tertahan(x)) x];
    final hasil = <Map<String, dynamic>>[], masuk = <String>{};
    var sisa = siap;
    while (sisa.isNotEmpty) {
      final maju = [for (final x in sisa) if (_induk(x).every((i) => !byRef.containsKey(i) || masuk.contains(i) || !sisa.any((y) => _t(y['ref']) == i))) x];
      final lolos = maju.isEmpty ? sisa : maju; // lingkaran induk: kirim apa adanya, server yang menolak
      for (final x in lolos) {
        hasil.add(x);
        masuk.add(_t(x['ref']));
      }
      sisa = [for (final x in sisa) if (!lolos.contains(x)) x];
    }
    return hasil;
  }

  static bool _sinyal(String kode) => kode.startsWith('HTTP_') || kode == KodeError.serverSibuk || KodeError.sesiHabis.contains(kode);

  static String _pesan(Map<String, dynamic> galat) {
    final kode = _t(galat['kode']), info = _t(galat['info']);
    return KodeError.pesan(kode) + (info.isEmpty ? '' : ' ($info)');
  }

  /// Ganti id sementara [dari] -> [ke] di semua entri (ref, induk sirkuit, data).
  static void _ganti(List<Map<String, dynamic>> l, String dari, String ke) {
    dynamic g(dynamic v) {
      if (v is String) return v == dari ? ke : v;
      if (v is List) return [for (final e in v) g(e)];
      if (v is Map) return {for (final e in v.entries) e.key: g(e.value)};
      return v;
    }

    for (final x in l) {
      if (_t(x['ref']) == dari) x['ref'] = ke;
      for (final k in const ['data', 'tampil']) {
        if (x[k] is Map) x[k] = g(x[k]);
      }
    }
  }

  /// Kirim semua entri yang tidak bergalat: data dulu (kelompok ≤25, berurutan), lalu foto. Galat sinyal / sesi = berhenti (dicoba lagi
  /// di sinkron berikutnya). Hasil: jumlah entri yang selesai. Aman dipanggil berkali-kali (tidak dobel jalan).
  Future<int> kirim(Sesi s) async {
    if (_jalan || !s.bisaUbah(menu)) return 0;
    _jalan = true;
    var selesai = 0;
    try {
      while (true) {
        final siap = urutanKirim(await daftar(s.userId)).take(maksPerKirim).toList();
        if (siap.isEmpty) break;
        final versi = {for (final x in siap) _t(x['opId']): (x['versi'] as num? ?? 0).toInt()};
        final r = await _api(s, 'sinkronTiang', {
          'ops': [
            for (final x in siap) {'opId': _t(x['opId']), 'jenis': _segmen(x) ? 'SEGMEN' : 'TIANG', if (sementara(_t(x['ref']))) 'refId': _t(x['ref']), 'data': x['data']}
          ]
        });
        final kemajuan = await _kunci(() async {
          final l = [...await _baca(s.userId)];
          var maju = 0;
          final idBaru = {for (final e in (r['idBaru'] as Map? ?? const {}).entries) '${e.key}': '${e.value}'};
          idBaru.forEach((dari, ke) => _ganti(l, dari, ke));
          final gagal = <String>{};
          for (final h in (r['hasil'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) {
            final opId = _t(h['opId']);
            final x = l.where((y) => _t(y['opId']) == opId).firstOrNull;
            if (x == null) continue;
            if (h['ok'] == true) {
              final seg = _segmen(x);
              final hasil = Map<String, dynamic>.from((seg ? h['segmen'] : h['tiang']) as Map);
              final idServer = _t(hasil[seg ? 'segmenId' : 'tiangId']);
              final lama = (versi[opId] ?? 0) != (x['versi'] as num? ?? 0).toInt();
              final refLama = idBaru.entries.where((e) => e.value == idServer).map((e) => e.key).firstOrNull ?? _t(x['ref']);
              x['ref'] = idServer;
              if (lama) {
                // ada simpan lebih baru saat dikirim: tetap di antrean, sebagai perubahan atas versi server
                final d = Map<String, dynamic>.from(x['data'] as Map)
                  ..[seg ? 'segmenId' : 'tiangId'] = idServer
                  ..['revision'] = (hasil['revision'] as num?)?.toInt() ?? 0;
                x['data'] = d;
                x['opId'] = const Uuid().v4();
              } else {
                x['data'] = null;
                x['asal'] = null;
                x['tampil'] = null;
                maju++;
              }
              if (seg) {
                await _lokal.terimaSegmen(s, refLama, hasil, menunggu: lama);
              } else {
                await _lokal.terima(s, refLama, hasil, menunggu: lama);
              }
            } else {
              final galat = Map<String, dynamic>.from(h['galat'] as Map? ?? const {});
              if (_t(galat['kode']) == 'DITUNDA') continue;
              gagal.add(_t(x['ref']));
              x['galat'] = _pesan(galat);
              maju++;
            }
          }
          // anak yang ditolak hanya karena induknya gagal di kelompok ini: menunggu induknya, bukan bergalat
          if (gagal.isNotEmpty) {
            for (final x in l) {
              if (gagal.contains(_t(x['ref'])) && _induk(x).any((i) => gagal.contains(i) && i != _t(x['ref']))) x['galat'] = '';
            }
          }
          await _tulis(s.userId, l);
          return maju;
        });
        selesai += kemajuan;
        if (kemajuan == 0) break; // semua DITUNDA / tertahan: jangan berputar
      }
      selesai += await _kirimFoto(s);
    } on ApiException catch (e) {
      if (!_sinyal(e.kode)) debugPrint('sinkronTiang: ${e.kode}');
    } catch (_) {
      // offline: antrean tetap di HP
    } finally {
      _jalan = false;
    }
    return selesai;
  }

  /// Foto entri yang datanya sudah diterima server (id asli).
  Future<int> _kirimFoto(Sesi s) async {
    var selesai = 0;
    for (final x in List<Map<String, dynamic>>.from(await daftar(s.userId))) {
      final ref = _t(x['ref']);
      if (x['data'] != null || sementara(ref) || _t(x['galat']).isNotEmpty) continue;
      final foto = Map<String, String>.from(x['foto'] as Map? ?? const {});
      for (final e in foto.entries) {
        try {
          final bytes = await _bacaFoto(e.value);
          if (bytes != null) await _api(s, 'uploadFotoTiang', {'tiangId': ref, 'slot': e.key, ...FotoLapangan.isiKirim(bytes)});
        } on ApiException catch (g) {
          if (_sinyal(g.kode)) rethrow;
          await _kunci(() async {
            final l = [...await _baca(s.userId)];
            for (final y in l) {
              if (_t(y['ref']) == ref) y['galat'] = 'Foto ${e.key == 'TIANG' ? 'tiang' : 'kepala tiang'}: ${KodeError.pesan(g.kode)}';
            }
            await _tulis(s.userId, l);
          });
          break;
        }
        await _kunci(() async {
          final l = [...await _baca(s.userId)];
          for (final y in l) {
            if (_t(y['ref']) != ref) continue;
            final f = Map<String, String>.from(y['foto'] as Map? ?? const {});
            if (f[e.key] == e.value) f.remove(e.key);
            y['foto'] = f;
          }
          await _tulis(s.userId, l);
        });
        await _hapusFoto(e.value);
      }
      await _kunci(() async {
        final l = [...await _baca(s.userId)]
          ..removeWhere((y) => _t(y['ref']) == ref && y['data'] == null && _t(y['galat']).isEmpty && (y['foto'] as Map? ?? const {}).isEmpty);
        if (l.length != _item.length) selesai++;
        await _tulis(s.userId, l);
      });
    }
    return selesai;
  }
}
