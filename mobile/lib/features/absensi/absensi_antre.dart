import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../../core/api_client.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../hartek/hartek_store.dart' show GudangHartek;
import 'absensi_model.dart';

/// Satu isian absensi di antrean HP. [galat] terisi = ditolak server (bukan sinyal): berhenti sampai pengabsen
/// mengisi ulang staf itu atau membuangnya.
class ItemAntreAbsensi {
  const ItemAntreAbsensi({required this.tanggal, required this.petugasId, required this.status, this.keterangan = '', this.galat = ''});
  final String tanggal;
  final String petugasId;
  final StatusAbsensi status;
  final String keterangan;
  final String galat;

  IsianAbsensi get isian => IsianAbsensi(status, keterangan);

  Map<String, dynamic> toJson() => {'tanggal': tanggal, 'petugasId': petugasId, 'status': status.kode, 'keterangan': keterangan, 'galat': galat};

  static ItemAntreAbsensi? dariJson(Object? j) {
    if (j is! Map) return null;
    final s = StatusAbsensi.dariKode(j['status']);
    if (s == null) return null;
    return ItemAntreAbsensi(
        tanggal: '${j['tanggal']}', petugasId: '${j['petugasId']}', status: s, keterangan: '${j['keterangan'] ?? ''}', galat: '${j['galat'] ?? ''}');
  }

  ItemAntreAbsensi denganGalat(String kode) =>
      ItemAntreAbsensi(tanggal: tanggal, petugasId: petugasId, status: status, keterangan: keterangan, galat: kode);

  bool sama(ItemAntreAbsensi o) => tanggal == o.tanggal && petugasId == o.petugasId && status == o.status && keterangan == o.keterangan;
}

/// v1.0.51 (permintaan Master Guswan 1 Nov 2026): Simpan absensi = layar langsung tertutup, isian masuk antrean HP (per akun) lalu
/// dikirim di latar oleh SyncController (app dibuka, tiap 5 menit, layanan latar). Pola sama dengan AntreanTemuanAdmin.
///
/// Sinyal / server sibuk / konfigurasi server belum siap = antrean utuh, dicoba lagi. Ditolak server (dikunci pengabsen
/// lain, hari sudah lewat, bukan peserta) = item bergalat dan TIDAK dihitung tertunda (tidak menahan layanan latar),
/// tidak dikirim ulang sampai diisi ulang / dibuang. Server memutuskan; HP tidak menebak.
class AntreanAbsensi extends ChangeNotifier {
  AntreanAbsensi(this._gudang, this._api);

  final GudangHartek _gudang;
  final Future<Map<String, dynamic>> Function(Sesi s, String aksi, Map<String, dynamic> data) _api;

  static const menu = 'OPS_ABSENSI';
  static const isianPerPanggilan = 100; // sama dengan ABS_ISIAN_MAKS_ di server

  static String kunci(String userId) => 'antre_absensi_$userId';

  bool _jalan = false;
  Future<void> _rantai = Future<void>.value();

  /// Baca-ubah-tulis berurutan (simpan dari layar dan kirim di latar tidak saling menimpa).
  Future<T> _kunci<T>(Future<T> Function() f) {
    final hasil = _rantai.then((_) => f());
    _rantai = hasil.then((_) {}, onError: (Object _) {});
    return hasil;
  }

  Future<List<ItemAntreAbsensi>> _baca(String userId) async {
    try {
      final r = await _gudang.bacaMaster(kunci(userId));
      final l = r == null ? const <dynamic>[] : (jsonDecode(r.json) as List<dynamic>);
      return [for (final x in l) ItemAntreAbsensi.dariJson(x)].whereType<ItemAntreAbsensi>().toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _tulis(String userId, List<ItemAntreAbsensi> l) async {
    await _gudang.tulisMaster(kunci(userId), jsonEncode([for (final x in l) x.toJson()]));
    notifyListeners();
  }

  Future<List<ItemAntreAbsensi>> daftar(String userId) => _kunci(() => _baca(userId));

  /// Isian yang masih akan dikirim (tanpa galat). Dipakai SyncController untuk menjaga layanan latar tetap hidup.
  Future<int> jumlahTertunda(String userId) async => (await daftar(userId)).where((x) => x.galat.isEmpty).length;

  /// Isian baru dari layar. [isian] = petugasId -> pilihan. Isian lama petugas+tanggal yang sama diganti (galat dihapus).
  Future<void> simpan(Sesi s, String tanggal, Map<String, IsianAbsensi> isian) => _kunci(() async {
        final l = [...await _baca(s.userId)]..removeWhere((x) => x.tanggal == tanggal && isian.containsKey(x.petugasId));
        for (final e in isian.entries) {
          l.add(ItemAntreAbsensi(tanggal: tanggal, petugasId: e.key, status: e.value.status, keterangan: e.value.status.wajibKeterangan ? e.value.keterangan.trim() : ''));
        }
        await _tulis(s.userId, l);
      });

  Future<void> buang(Sesi s, String tanggal, String petugasId) => _kunci(() async {
        final l = [...await _baca(s.userId)]..removeWhere((x) => x.tanggal == tanggal && x.petugasId == petugasId);
        await _tulis(s.userId, l);
      });

  /// Gangguan sementara: berhenti, antrean utuh, dicoba lagi sinkron berikutnya.
  static bool _sementara(String kode) =>
      kode.startsWith('HTTP_') ||
      KodeError.sesiHabis.contains(kode) ||
      kode == KodeError.serverSibuk ||
      kode == KodeError.terlaluSering ||
      kode == 'CONFIG_TIDAK_LENGKAP' ||
      kode == 'CONFIG_TIDAK_VALID' ||
      kode == 'SHEET_TIDAK_ADA' ||
      kode == 'HEADER_KOSONG';

  Future<void> _tandai(String userId, Iterable<ItemAntreAbsensi> dikirim, String Function(ItemAntreAbsensi) galat) => _kunci(() async {
        final l = [...await _baca(userId)];
        for (var i = 0; i < l.length; i++) {
          final d = dikirim.where((x) => x.sama(l[i])).firstOrNull;
          if (d != null) l[i] = l[i].denganGalat(galat(d));
        }
        await _tulis(userId, l);
      });

  /// Kirim semua isian tanpa galat, per tanggal, maksimal [isianPerPanggilan] per panggilan. Hasil: jumlah isian yang
  /// diterima server. Aman dipanggil berkali-kali (tidak dobel jalan). Tidak pernah melempar: gagal = antrean tetap.
  Future<int> kirim(Sesi s) async {
    if (_jalan || !s.bisaUbah(menu)) return 0;
    _jalan = true;
    var selesai = 0;
    try {
      final tertunda = (await daftar(s.userId)).where((x) => x.galat.isEmpty).toList();
      final tanggal = {for (final x in tertunda) x.tanggal}.toList()..sort();
      for (final t in tanggal) {
        final milikTanggal = tertunda.where((x) => x.tanggal == t).toList();
        for (var a = 0; a < milikTanggal.length; a += isianPerPanggilan) {
          final potong = milikTanggal.skip(a).take(isianPerPanggilan).toList();
          final Map<String, dynamic> r;
          try {
            r = await _api(s, 'simpanAbsensi', {'tanggal': t, 'isian': [for (final x in potong) x.isian.keJson(x.petugasId)]});
          } on ApiException catch (e) {
            if (_sementara(e.kode)) return selesai;
            await _tandai(s.userId, potong, (_) => e.kode);
            if (e.kode == 'HARI_LAMPAU' || e.kode == 'HARI_DEPAN') {
              await _tandai(s.userId, milikTanggal, (_) => e.kode); // seluruh tanggal itu ditolak server
              break;
            }
            continue;
          }
          final diterima = {for (final id in (r['diterima'] as List<dynamic>? ?? const <dynamic>[])) '$id'};
          final ditolak = {
            for (final d in (r['ditolak'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<dynamic, dynamic>>()) '${d['petugasId']}': '${d['kode']}'
          };
          await _kunci(() async {
            // hanya isian yang MASIH SAMA dengan yang dikirim: perubahan pengabsen selama menunggu jawaban tetap antre
            final l = [...await _baca(s.userId)];
            l.removeWhere((x) => diterima.contains(x.petugasId) && potong.any((p) => p.sama(x)));
            for (var i = 0; i < l.length; i++) {
              final kode = ditolak[l[i].petugasId];
              if (kode != null && potong.any((p) => p.sama(l[i]))) l[i] = l[i].denganGalat(kode);
            }
            await _tulis(s.userId, l);
          });
          selesai += potong.where((p) => diterima.contains(p.petugasId)).length;
        }
      }
    } catch (_) {
      // sinyal putus / galat tak terduga: antrean tetap di HP
    } finally {
      _jalan = false;
    }
    return selesai;
  }
}
