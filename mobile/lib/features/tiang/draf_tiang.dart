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
import 'tiang_api.dart';

/// Tempat tiang disimpan di HP (daftar jalur): diperbarui draf saat server menerima / petugas menghapus draf.
abstract interface class TiangLokal {
  /// Tampilan tiang [refLama] (id sementara atau id asli) diganti [tiang] (jawaban server, atau tampilan draf bertanda `draf`).
  Future<void> terima(Sesi s, String refLama, Map<String, dynamic> tiang);

  /// Draf dihapus: kembalikan tiang [ref] ke [asal] (null = tiang baru, hapus dari daftar).
  Future<void> pulihkan(Sesi s, String ref, Map<String, dynamic>? asal, String kode);

  Future<void> terimaSegmen(Sesi s, String refLama, Map<String, dynamic> segmen);
  Future<void> pulihkanSegmen(Sesi s, String ref, Map<String, dynamic>? asal);
}

enum StatusDraf { belumTerkirim, perluDiperbaiki }

/// Hasil mengirim satu draf.
sealed class HasilKirim {
  const HasilKirim();
}

/// Server menerima: [hasil] = tiang / segmen dari server, [selisihM] = selisih meter dari koordinat terdaftar (tiang).
final class Terkirim extends HasilKirim {
  const Terkirim(this.hasil, {this.selisihM});
  final Map<String, dynamic> hasil;
  final num? selisihM;
}

/// Server menolak isian (bukan sinyal): [galat] = semua masalah per isian; draf tetap ada, bertanda perlu diperbaiki.
final class Ditolak extends HasilKirim {
  const Ditolak(this.galat, this.pesan);
  final List<GalatIsian> galat;
  final String pesan;
}

/// Tidak sampai ke server (sinyal, tiket, atau induk belum terkirim): draf lengkap tetap di HP dan dikirim lagi otomatis.
final class BelumTerkirim extends HasilKirim {
  const BelumTerkirim(this.pesan);
  final String pesan;
}

class _FotoHilang implements Exception {
  _FotoHilang(this.slot);
  final String slot;
}

/// Pengganti AntreanTiang (rancangan docs/superpowers/specs/2026-11-11-tiang-hostinger-design.md S9): satu tiang (atau segmen) = satu draf.
/// Simpan = tulis draf lengkap (data + foto) ke HP LEBIH DULU, lalu kirim SATU paket ke server (data + foto sekaligus, atomik). Berhasil =
/// draf dihapus; ditolak validasi = draf tetap, bertanda perlu diperbaiki; tidak sampai = draf tetap, dikirim ulang otomatis berurutan (FIFO).
/// - Tidak ada status di tengah: tidak pernah ada tiang yang datanya diterima tetapi fotonya tertinggal.
/// - Foto lokal dihapus HANYA sesudah server mengembalikan sidik yang cocok; berkas foto hilang = galat terlihat, bukan dianggap terkirim.
/// - Satu-satunya cara membuang adalah [hapus] (UI meminta konfirmasi yang menyebut foto ikut terhapus).
/// - Draf yang induknya (id sementara LOKAL-...) belum terkirim menunggu induknya.
/// - Jalur mundur (alamat API tiang kosong): data dikirim ke Apps Script lama lalu foto satu per satu; `dataTerkirim` mencegah data dikirim dua kali.
/// Entri: {opId, jenis TIANG|SEGMEN, ref, kode, data, asal, tampil, foto {slot: path}, status, galat [{field,pesan}], pesan, dibuat, dataTerkirim}.
class DrafTiang extends ChangeNotifier {
  DrafTiang(this._gudang, this._api, {TiangLokal? lokal, Future<List<int>?> Function(String path)? bacaFoto, Future<void> Function(String? path)? hapusFoto})
      : _bacaFoto = bacaFoto ?? FotoLapangan.baca,
        _hapusFoto = hapusFoto ?? FotoLapangan.hapus {
    if (lokal != null) _lokal = lokal;
  }

  final GudangHartek _gudang;
  final TiangApi _api;
  late TiangLokal _lokal;
  final Future<List<int>?> Function(String path) _bacaFoto;
  final Future<void> Function(String? path) _hapusFoto;

  static const menu = 'OPS_VERIFIKASI_TIANG';

  /// Tempat tampilan tiang / segmen di HP (TiangRepository); dipasang sesudah dibuat karena repository juga memakai draf ini.
  void pasangLokal(TiangLokal lokal) => _lokal = lokal;

  static String kunci(String userId) => 'draf_tiang_$userId';
  static String _kunciLama(String userId) => 'antre_tiang_$userId';
  static String idSementara() => 'LOKAL-${const Uuid().v4()}';
  static bool sementara(String id) => id.startsWith('LOKAL-');

  List<Map<String, dynamic>> _item = const [];
  String? _userItem;
  final Set<String> _dikirim = {};
  bool _semua = false;
  Future<void> _rantai = Future<void>.value();

  static String _t(Object? v) => v?.toString().trim() ?? '';

  Future<T> _kunci2<T>(Future<T> Function() f) {
    final hasil = _rantai.then((_) => f());
    _rantai = hasil.then((_) {}, onError: (Object _) {});
    return hasil;
  }

  // ----- penyimpanan (gudang + cadangan berkas)

  static Future<File?> _berkasCadangan(String userId) async {
    try {
      final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'verifikasi_tiang'));
      if (!dir.existsSync()) await dir.create(recursive: true);
      return File(p.join(dir.path, 'draf_${userId.replaceAll(RegExp(r'[^0-9A-Za-z_-]'), '')}.cadangan.json'));
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
    return await _migrasiAntreanLama(userId);
  }

  /// Antrean v1.0.71–75 (`antre_tiang_<user>`) yang belum terkirim saat app diperbarui: setiap entri jadi draf (data tidak hilang).
  /// Entri yang datanya sudah diterima server tetapi fotonya belum (data == null) jadi draf "perlu diperbaiki": petugas membuka tiangnya
  /// lagi, foto di HP sudah terisi, lalu Simpan mengirim data + foto sekaligus.
  Future<List<Map<String, dynamic>>> _migrasiAntreanLama(String userId) async {
    try {
      final r = await _gudang.bacaMaster(_kunciLama(userId));
      if (r == null) return [];
      final hasil = <Map<String, dynamic>>[];
      for (final x in _urai(r.json)) {
        final lama = _t(x['galat']);
        final adaData = x['data'] is Map;
        hasil.add({
          'opId': const Uuid().v4(),
          'jenis': _t(x['jenis']) == 'SEGMEN' ? 'SEGMEN' : 'TIANG',
          'ref': _t(x['ref']),
          'kode': _t(x['kode']),
          'data': adaData ? x['data'] : null,
          'asal': x['asal'],
          'tampil': x['tampil'] is Map ? x['tampil'] : {'tiangId': _t(x['ref'])},
          'foto': x['foto'] is Map ? Map<String, dynamic>.from(x['foto'] as Map) : <String, dynamic>{},
          'status': !adaData || lama.isNotEmpty ? 'perluDiperbaiki' : 'belumTerkirim',
          'galat': <Map<String, dynamic>>[],
          'pesan': !adaData ? 'Data sudah diterima server, foto belum terkirim. Ketuk, lalu Simpan Verifikasi lagi agar foto terkirim.' : lama,
          'dibuat': DateTime.now().toUtc().toIso8601String(),
          'dataTerkirim': false,
        });
      }
      return hasil;
    } catch (_) {
      return [];
    }
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

  /// Draf akun [userId] (dibaca dari HP sekali, lalu dari salinan).
  Future<List<Map<String, dynamic>>> daftar(String userId) => _kunci2(() async {
        if (_userItem != userId) {
          _item = await _baca(userId);
          _userItem = userId;
        }
        return _item;
      });

  Map<String, dynamic>? item(String userId, String ref) {
    if (_userItem != userId) return null;
    for (final x in _item) {
      if (_t(x['ref']) == ref) return x;
    }
    return null;
  }

  StatusDraf? status(String userId, String ref) {
    final x = item(userId, ref);
    return x == null ? null : _statusDari(x);
  }

  static StatusDraf _statusDari(Map<String, dynamic> x) => _t(x['status']) == 'perluDiperbaiki' ? StatusDraf.perluDiperbaiki : StatusDraf.belumTerkirim;

  /// Foto di HP milik draf [ref] ({slot: path}).
  Map<String, String> foto(String userId, String ref) => {
        for (final e in ((item(userId, ref)?['foto'] as Map?) ?? const {}).entries) '${e.key}': '${e.value}',
      };

  /// Pesan terakhir dari server / sistem untuk draf [ref] (kosong = belum ada).
  String pesan(String userId, String ref) => _t(item(userId, ref)?['pesan']);

  /// Masalah isian terakhir dari server untuk draf [ref].
  List<GalatIsian> galat(String userId, String ref) => [
        for (final g in (item(userId, ref)?['galat'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) (field: _t(g['field']), pesan: _t(g['pesan'])),
      ];

  /// Jumlah draf yang masih akan dikirim otomatis (menahan logout). Yang perlu diperbaiki menunggu petugas, tidak menahan.
  Future<int> jumlahTertunda(String userId) async => (await daftar(userId)).where((x) => _statusDari(x) == StatusDraf.belumTerkirim).length;

  /// Tampilan tiang (bentuk getTiangJalur, bertanda `draf`) yang belum diterima server untuk jalur [kode]: dipasang lagi sesudah daftar diunduh ulang.
  List<Map<String, dynamic>> belumDiServer(String userId, String kode) => [
        if (_userItem == userId)
          for (final x in _item)
            if (!_segmen(x) && x['tampil'] is Map && _t(x['kode']) == kode) _tampilDraf(x),
      ];

  List<Map<String, dynamic>> segmenBelumDiServer(String userId) => [
        if (_userItem == userId)
          for (final x in _item)
            if (_segmen(x) && x['tampil'] is Map) _tampilDraf(x),
      ];

  static Map<String, dynamic> _tampilDraf(Map<String, dynamic> x) => {...Map<String, dynamic>.from(x['tampil'] as Map), 'draf': _statusDari(x).name};

  static bool _segmen(Map<String, dynamic> x) => _t(x['jenis']) == 'SEGMEN';

  // ----- simpan

  /// Tulis draf lengkap ke HP dan tampilkan di daftar. [asal] = tampilan sebelum draf pertama (dipakai saat draf dihapus). Hasil dikirim terpisah ([kirim]).
  /// opId BARU bila isi berubah (agar server tidak menjawab dengan hasil lama); sama bila hanya dikirim ulang.
  Future<void> simpan(Sesi s,
          {required String jenis,
          required String ref,
          required String kode,
          required Map<String, dynamic> data,
          required Map<String, dynamic> tampil,
          required Map<String, dynamic>? asal,
          Map<String, String> foto = const {}}) =>
      _kunci2(() async {
        final l = [...await _baca(s.userId)];
        final ada = l.where((x) => _t(x['ref']) == ref).firstOrNull;
        final hapus = <String>[];
        if (ada == null) {
          l.add({
            'opId': const Uuid().v4(),
            'jenis': jenis,
            'ref': ref,
            'kode': kode,
            'data': data,
            'asal': asal,
            'tampil': tampil,
            'foto': foto,
            'status': 'belumTerkirim',
            'galat': <Map<String, dynamic>>[],
            'pesan': '',
            'dibuat': DateTime.now().toUtc().toIso8601String(),
            'dataTerkirim': false,
          });
        } else {
          final f = Map<String, String>.from((ada['foto'] as Map? ?? const {}).map((k, v) => MapEntry('$k', '$v')));
          foto.forEach((slot, path) {
            if (f[slot] != null && f[slot] != path) hapus.add(f[slot]!);
            f[slot] = path;
          });
          final sama = jsonEncode(ada['data']) == jsonEncode(data) && jsonEncode(ada['foto']) == jsonEncode(f);
          if (!sama) ada['opId'] = const Uuid().v4();
          ada
            ..['data'] = data
            ..['tampil'] = tampil
            ..['foto'] = f
            ..['kode'] = kode
            ..['status'] = 'belumTerkirim'
            ..['galat'] = <Map<String, dynamic>>[]
            ..['pesan'] = ''
            ..['dataTerkirim'] = false;
        }
        await _tulis(s.userId, l);
        for (final path in hapus) {
          await _hapusFoto(path);
        }
        await _tampilkan(s, l.firstWhere((x) => _t(x['ref']) == ref));
      });

  /// Daftar jalur / segmen menampilkan draf (bertanda `draf`).
  Future<void> _tampilkan(Sesi s, Map<String, dynamic> x) async {
    if (x['tampil'] is! Map) return;
    if (_segmen(x)) {
      await _lokal.terimaSegmen(s, _t(x['ref']), _tampilDraf(x));
    } else {
      await _lokal.terima(s, _t(x['ref']), _tampilDraf(x));
    }
  }

  // ----- kirim

  static bool _sinyal(String kode) =>
      kode.startsWith('HTTP_') ||
      const {
        'SERVER_SIBUK', 'TERLALU_SERING', 'RESPON_BUKAN_JSON', 'RESPON_TIDAK_VALID', 'OPERASI_BERJALAN', 'UPDATE_APLIKASI_DULU', 'PINDAH_HOSTINGER',
        'TIKET_KEDALUWARSA', 'TIKET_TIANG_TIDAK_VALID', 'TIKET_DICABUT', 'KESALAHAN_SERVER', 'REDIRECT_TIDAK_DIIZINKAN', 'ENV_TIDAK_COCOK'
      }.contains(kode) ||
      KodeError.sesiHabis.contains(kode);

  /// id yang harus sudah diterima server lebih dulu: induk tiang + segmen di sirkuit (tiang), induk segmen (segmen) yang masih id sementara.
  static Set<String> _induk(Map<String, dynamic> x) {
    final d = x['data'];
    if (d is! Map) return {};
    final hasil = <String>{};
    void tambah(Object? v) {
      final id = _t(v);
      if (sementara(id)) hasil.add(id);
    }

    if (_segmen(x)) {
      tambah(d['indukSegmenId']);
    } else {
      for (final s in (d['sirkuit'] is List ? d['sirkuit'] as List : const []).whereType<Map<dynamic, dynamic>>()) {
        tambah(s['indukTiangId']);
        tambah(s['segmenId']);
      }
    }
    return hasil;
  }

  bool _menungguInduk(Map<String, dynamic> x) {
    final induk = _induk(x);
    return induk.isNotEmpty && _item.any((y) => induk.contains(_t(y['ref'])) && !identical(y, x));
  }

  /// Bungkus foto draf untuk dikirim: {slot: {sha256, ukuranByte, data}} + sidik tiap slot. Berkas hilang / kosong = [_FotoHilang].
  Future<(Map<String, Map<String, dynamic>>, Map<String, String>)> _bungkusFoto(Map<String, String> foto) async {
    final paket = <String, Map<String, dynamic>>{}, sidik = <String, String>{};
    for (final e in foto.entries) {
      final bytes = await _bacaFoto(e.value);
      if (bytes == null || bytes.isEmpty) throw _FotoHilang(e.key);
      final isi = FotoLapangan.isiKirim(bytes);
      paket[e.key] = isi;
      sidik[e.key] = '${isi['sha256']}';
    }
    return (paket, sidik);
  }

  /// Kirim satu draf [ref]. Aman dipanggil dari form dan dari sinkron latar sekaligus (satu pengiriman per draf).
  Future<HasilKirim> kirim(Sesi s, String ref) async {
    await daftar(s.userId);
    if (!_dikirim.add(ref)) return const BelumTerkirim('Sedang dikirim.');
    try {
      final x = item(s.userId, ref);
      if (x == null) return const BelumTerkirim('Draf tidak ditemukan.');
      return await _kirimSatu(s, x);
    } finally {
      _dikirim.remove(ref);
    }
  }

  Future<HasilKirim> _kirimSatu(Sesi s, Map<String, dynamic> x) async {
    final ref = _t(x['ref']);
    if (x['data'] is! Map) return _tolak(s, ref, const [], _t(x['pesan']).isEmpty ? 'Draf tidak berisi data. Ketuk lalu simpan ulang.' : _t(x['pesan']));
    if (_menungguInduk(x)) return const BelumTerkirim('Menunggu tiang / segmen induk terkirim lebih dulu.');
    try {
      return _api.aktif ? await _kirimPaket(s, x) : await _kirimLama(s, x);
    } on _FotoHilang catch (e) {
      final label = e.slot == 'TIANG' ? 'Foto Full Tiang' : e.slot == 'KEPALA' ? 'Foto Konstruksi SUTM' : 'Foto';
      return _tolak(s, ref, [(field: 'foto', pesan: '$label tidak terbaca di HP. Ambil ulang.')], '$label tidak terbaca di HP. Ambil ulang.');
    } on GalatValidasi catch (e) {
      return _tolak(s, ref, e.galat, e.galat.isEmpty ? KodeError.pesan(e.kode) : e.galat.first.pesan);
    } on ApiException catch (e) {
      final pesan = KodeError.pesan(e.kode);
      if (_sinyal(e.kode)) return BelumTerkirim(pesan);
      return _tolak(s, ref, const [], pesan);
    } catch (_) {
      return const BelumTerkirim('Tidak ada sinyal. Draf tersimpan di HP dan dikirim otomatis nanti.');
    }
  }

  /// Satu paket: data + foto (Hostinger). Berhasil = draf dihapus.
  Future<HasilKirim> _kirimPaket(Sesi s, Map<String, dynamic> x) async {
    final seg = _segmen(x);
    final data = Map<String, dynamic>.from(x['data'] as Map)..remove('revision');   // satu tiang satu petugas: server tidak memeriksa revisi dari HP
    data['opId'] = _t(x['opId']);
    final foto = Map<String, String>.from((x['foto'] as Map? ?? const {}).map((k, v) => MapEntry('$k', '$v')));
    var sidik = <String, String>{};
    if (!seg && foto.isNotEmpty) {
      final (paket, h) = await _bungkusFoto(foto);
      data['foto'] = paket;
      sidik = h;
    }
    final r = await _api.panggil(s, seg ? 'simpanSegmen' : 'simpanVerifikasiTiang', data, timeout: const Duration(seconds: 60));
    return _selesaiPaket(s, x, r, sidik);
  }

  Future<HasilKirim> _selesaiPaket(Sesi s, Map<String, dynamic> x, Map<String, dynamic> r, Map<String, String> sidik) async {
    final seg = _segmen(x), ref = _t(x['ref']);
    final hasil = Map<String, dynamic>.from((seg ? r['segmen'] : r['tiang']) as Map);
    final idServer = _t(hasil[seg ? 'segmenId' : 'tiangId']);
    final konfirmasi = r['foto'] is Map ? Map<String, dynamic>.from(r['foto'] as Map) : <String, dynamic>{};
    final cocok = <String>[], belum = <String>[];
    sidik.forEach((slot, sha) => (_t((konfirmasi[slot] as Map?)?['sha256']) == sha ? cocok : belum).add(slot));
    final fotoLokal = Map<String, String>.from((x['foto'] as Map? ?? const {}).map((k, v) => MapEntry('$k', '$v')));
    await _kunci2(() async {
      final l = [...await _baca(s.userId)];
      if (idServer != ref) _ganti(l, ref, idServer);
      final k = l.indexWhere((y) => _t(y['ref']) == idServer || _t(y['ref']) == ref);
      if (k >= 0) {
        if (belum.isEmpty) {
          l.removeAt(k);
        } else {
          // server tidak mengonfirmasi sidik foto itu: draf tetap ada, foto yang belum terkonfirmasi tidak dihapus dari HP
          l[k]
            ..['ref'] = idServer
            ..['foto'] = {for (final slot in belum) slot: fotoLokal[slot]}
            ..['status'] = 'perluDiperbaiki'
            ..['pesan'] = 'Foto belum terkonfirmasi server. Ketuk lalu Simpan Verifikasi lagi.';
        }
      }
      await _tulis(s.userId, l);
    });
    for (final slot in cocok) {
      await _hapusFoto(fotoLokal[slot]);
    }
    if (seg) {
      await _lokal.terimaSegmen(s, ref, hasil);
    } else {
      await _lokal.terima(s, ref, hasil);
    }
    return Terkirim(hasil, selisihM: r['selisihM'] as num?);
  }

  /// Jalur mundur (Apps Script lama): data lebih dulu, lalu foto satu per satu. `dataTerkirim` menjaga data tidak dikirim dua kali bila foto gagal.
  Future<HasilKirim> _kirimLama(Sesi s, Map<String, dynamic> x) async {
    final seg = _segmen(x), ref = _t(x['ref']);
    var hasil = <String, dynamic>{};
    var idServer = ref;
    if (x['dataTerkirim'] != true) {
      final data = Map<String, dynamic>.from(x['data'] as Map)..remove('opId');
      final r = await _api.panggil(s, seg ? 'simpanSegmen' : 'simpanVerifikasiTiang', data, timeout: const Duration(seconds: 90));
      hasil = Map<String, dynamic>.from((seg ? r['segmen'] : r['tiang']) as Map);
      idServer = _t(hasil[seg ? 'segmenId' : 'tiangId']);
      await _kunci2(() async {
        final l = [...await _baca(s.userId)];
        if (idServer != ref) _ganti(l, ref, idServer);
        final k = l.indexWhere((y) => _t(y['ref']) == idServer);
        if (k >= 0) l[k]['dataTerkirim'] = true;
        await _tulis(s.userId, l);
      });
      if (seg) {
        await _lokal.terimaSegmen(s, ref, hasil);
      } else {
        await _lokal.terima(s, ref, hasil);
      }
    } else {
      idServer = ref;
    }
    final foto = Map<String, String>.from((item(s.userId, idServer)?['foto'] as Map? ?? const {}).map((k, v) => MapEntry('$k', '$v')));
    for (final e in foto.entries) {
      final bytes = await _bacaFoto(e.value);
      if (bytes == null || bytes.isEmpty) throw _FotoHilang(e.key);
      await _api.panggil(s, 'uploadFotoTiang', {'tiangId': idServer, 'slot': e.key, ...FotoLapangan.isiKirim(bytes)}, timeout: const Duration(seconds: 90));
      await _kunci2(() async {
        final l = [...await _baca(s.userId)];
        final k = l.indexWhere((y) => _t(y['ref']) == idServer);
        if (k >= 0) l[k]['foto'] = {...(l[k]['foto'] as Map).cast<String, dynamic>()}..remove(e.key);
        await _tulis(s.userId, l);
      });
      await _hapusFoto(e.value);
    }
    await _kunci2(() async {
      final l = [...await _baca(s.userId)]..removeWhere((y) => _t(y['ref']) == idServer);
      await _tulis(s.userId, l);
    });
    return Terkirim(hasil.isEmpty ? Map<String, dynamic>.from(item(s.userId, idServer)?['tampil'] as Map? ?? const {}) : hasil);
  }

  /// Ditolak server / sistem (bukan sinyal): draf tetap, bertanda perlu diperbaiki, alasan disimpan.
  Future<HasilKirim> _tolak(Sesi s, String ref, List<GalatIsian> galat, String pesan) async {
    await _kunci2(() async {
      final l = [...await _baca(s.userId)];
      final x = l.where((y) => _t(y['ref']) == ref).firstOrNull;
      if (x == null) return;
      x
        ..['status'] = 'perluDiperbaiki'
        ..['galat'] = [for (final g in galat) {'field': g.field, 'pesan': g.pesan}]
        ..['pesan'] = pesan;
      await _tulis(s.userId, l);
      await _tampilkan(s, x);
    });
    return Ditolak(galat, pesan);
  }

  /// Ganti id sementara [dari] -> [ke] di semua draf (ref, induk sirkuit, data, tampilan).
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

  /// Kirim semua draf yang masih menunggu (belum terkirim), FIFO menurut waktu simpan; induk lebih dulu. Berhenti bila tidak ada sinyal.
  /// Hasil: jumlah draf yang diterima server. Aman dipanggil berkali-kali (satu putaran sekaligus).
  Future<int> kirimSemua(Sesi s) async {
    if (_semua || !s.bisaUbah(menu)) return 0;
    _semua = true;
    var diterima = 0;
    try {
      var maju = true;
      while (maju) {
        maju = false;
        final urut = [...await daftar(s.userId)]..sort((a, b) => _t(a['dibuat']).compareTo(_t(b['dibuat'])));
        for (final x in urut) {
          if (_statusDari(x) != StatusDraf.belumTerkirim) continue;
          final h = await kirim(s, _t(x['ref']));
          if (h is Terkirim) {
            diterima++;
            maju = true;
          } else if (h is BelumTerkirim && !h.pesan.startsWith('Menunggu') && !h.pesan.startsWith('Sedang')) {
            return diterima;   // tidak ada sinyal / tiket: berhenti, dicoba lagi di sinkron berikutnya
          }
        }
      }
    } finally {
      _semua = false;
    }
    return diterima;
  }

  // ----- hapus

  /// Hapus draf: tampilan kembali seperti sebelum diubah (tiang baru dihapus dari daftar), foto di HP dihapus. Hanya dipanggil dari
  /// konfirmasi petugas. Draf lain yang bergantung pada draf ini (induk) ditandai perlu diperbaiki.
  Future<void> hapus(Sesi s, String ref) => _kunci2(() async {
        final l = [...await _baca(s.userId)];
        final x = l.where((y) => _t(y['ref']) == ref).firstOrNull;
        if (x == null) return;
        l.remove(x);
        for (final y in l) {
          if (_induk(y).contains(ref)) {
            y
              ..['status'] = 'perluDiperbaiki'
              ..['pesan'] = 'Induknya (draf yang dihapus) tidak ada lagi. Perbaiki isian lalu simpan lagi.';
          }
        }
        await _tulis(s.userId, l);
        for (final path in (x['foto'] as Map? ?? const {}).values) {
          await _hapusFoto(path?.toString());
        }
        final asal = x['asal'] is Map ? Map<String, dynamic>.from(x['asal'] as Map) : null;
        if (_segmen(x)) {
          await _lokal.pulihkanSegmen(s, ref, asal);
        } else {
          await _lokal.pulihkan(s, ref, asal, _t(x['kode']));
        }
      });
}
