import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// v0.64.2 (keputusan kvlar 8 Okt 2026): jam terpercaya untuk semua waktu pekerjaan Yandal.
///
/// Jam dinding HP bisa diubah petugas. Jam monoton Android (`SystemClock.elapsedRealtime`, ms sejak HP menyala,
/// termasuk saat layar mati) tidak bisa. Setiap jawaban server membawa `waktu`; HP menyimpan patokan
/// (jam server, jam monoton saat itu, nomor boot). Jam terpercaya = jam server patokan + selisih jam monoton.
/// Patokan bertahan walau app ditutup; HP restart (nomor boot berubah / jam monoton mengecil) = patokan dibuang.
/// Tanpa patokan (HP restart lalu offline, atau kode native belum terpasang) = jam HP, ditandai sumber `HP`.

/// Satu bacaan jam monoton dari native. bootCount -1 = tidak tersedia (Android < 7).
class BacaanMonoton {
  const BacaanMonoton({required this.elapsedMs, this.bootCount = -1, this.waktuOtomatis});
  final int elapsedMs;
  final int bootCount;
  final bool? waktuOtomatis; // setelan "Tanggal & waktu otomatis" Android
}

typedef PembacaMonoton = Future<BacaanMonoton?> Function();

/// Native: kanal `sisi/jam` di MainActivity (docs/android/MainActivity.kt). Belum terpasang / bukan Android = null.
Future<BacaanMonoton?> bacaMonotonAndroid() async {
  try {
    final m = await const MethodChannel('sisi/jam').invokeMapMethod<String, dynamic>('monoton');
    final e = (m?['elapsedMs'] as num?)?.toInt();
    if (m == null || e == null || e <= 0) return null;
    return BacaanMonoton(elapsedMs: e, bootCount: (m['bootCount'] as num?)?.toInt() ?? -1, waktuOtomatis: m['waktuOtomatis'] as bool?);
  } catch (_) {
    return null; // MissingPluginException (MainActivity belum diganti) / platform lain
  }
}

/// Penyimpan patokan (secure storage di HP, memori di test).
abstract class PenyimpanPatokan {
  Future<String?> baca();
  Future<void> tulis(String? isi);
}

class PenyimpanPatokanAman implements PenyimpanPatokan {
  PenyimpanPatokanAman({FlutterSecureStorage? storage}) : _s = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _s;
  static const _kunci = 'sisi_jam_patokan';

  @override
  Future<String?> baca() => _s.read(key: _kunci);

  @override
  Future<void> tulis(String? isi) => isi == null ? _s.delete(key: _kunci) : _s.write(key: _kunci, value: isi);
}

class PenyimpanPatokanMemori implements PenyimpanPatokan {
  String? isi;
  @override
  Future<String?> baca() async => isi;
  @override
  Future<void> tulis(String? v) async => isi = v;
}

/// Waktu yang dicatat untuk pekerjaan: waktu dipakai + jam HP saat itu + sumbernya.
class WaktuTercatat {
  const WaktuTercatat({required this.waktu, required this.waktuHp, required this.sumber});
  final DateTime waktu;
  final DateTime waktuHp;
  final String sumber; // SERVER (jam server + monoton) | HP

  bool get tervalidasi => sumber == 'SERVER';
  Duration get selisihHp => waktuHp.difference(waktu);

  /// Jam HP berbeda lebih dari [JamTerpercaya.batasSelisih] dari jam terpercaya (indikasi jam HP diubah / salah).
  bool get jamHpMenyimpang => tervalidasi && selisihHp.abs() > JamTerpercaya.batasSelisih;

  Map<String, dynamic> keJson() => {'waktu': waktu.toUtc().toIso8601String(), 'waktuHp': waktuHp.toUtc().toIso8601String(), 'sumber': sumber};

  static WaktuTercatat dariJson(Map<String, dynamic> j) {
    final w = DateTime.parse(j['waktu'] as String);
    return WaktuTercatat(
      waktu: w,
      waktuHp: DateTime.tryParse('${j['waktuHp'] ?? ''}') ?? w,
      sumber: '${j['sumber'] ?? 'HP'}',
    );
  }
}

class _Patokan {
  const _Patokan(this.serverMs, this.monotonMs, this.bootCount);
  final int serverMs;
  final int monotonMs;
  final int bootCount;

  String keJson() => jsonEncode({'s': serverMs, 'm': monotonMs, 'b': bootCount});

  static _Patokan? dari(String? v) {
    if (v == null || v.isEmpty) return null;
    try {
      final j = jsonDecode(v) as Map<String, dynamic>;
      return _Patokan((j['s'] as num).toInt(), (j['m'] as num).toInt(), (j['b'] as num?)?.toInt() ?? -1);
    } catch (_) {
      return null;
    }
  }
}

class JamTerpercaya {
  JamTerpercaya({PembacaMonoton? monoton, DateTime Function()? jamHp, PenyimpanPatokan? penyimpan})
      : _monoton = monoton ?? bacaMonotonAndroid,
        _jamHp = jamHp ?? DateTime.now,
        _simpan = penyimpan ?? PenyimpanPatokanAman();

  final PembacaMonoton _monoton;
  final DateTime Function() _jamHp;
  final PenyimpanPatokan _simpan;

  /// Selisih jam HP yang dianggap menyimpang.
  static const Duration batasSelisih = Duration(minutes: 3);

  /// Patokan lebih tua dari ini dibuang (drift jam monoton + jaga-jaga).
  static const Duration umurMaksPatokan = Duration(days: 7);

  _Patokan? _patokan;

  /// Jam terpercaya (ms) pada bacaan monoton terakhir + stopwatch sejak itu (untuk [sekarang] yang sinkron).
  int? _basisMs;
  final Stopwatch _sw = Stopwatch();

  /// Setelan "Tanggal & waktu otomatis" Android pada bacaan terakhir (null = tidak diketahui).
  bool? waktuOtomatis;

  Future<void> muat() async {
    try {
      _patokan = _Patokan.dari(await _simpan.baca());
    } catch (_) {
      _patokan = null; // penyimpanan rusak: mulai tanpa patokan (jam HP sampai ada jawaban server)
    }
    await segarkan();
  }

  bool _sah(_Patokan p, BacaanMonoton b) {
    if (b.elapsedMs < p.monotonMs) return false; // HP restart
    if (p.bootCount >= 0 && b.bootCount >= 0 && p.bootCount != b.bootCount) return false; // HP restart
    return b.elapsedMs - p.monotonMs <= umurMaksPatokan.inMilliseconds;
  }

  /// Baca ulang jam monoton (panggil saat app dibuka lagi, berkala, dan sebelum mencatat waktu pekerjaan).
  Future<void> segarkan() async {
    final b = await _monoton();
    final p = _patokan;
    if (b != null) waktuOtomatis = b.waktuOtomatis;
    if (b == null || p == null || !_sah(p, b)) {
      if (p != null && b != null) {
        _patokan = null;
        try {
          await _simpan.tulis(null);
        } catch (_) {/* dibiarkan */}
      }
      _basisMs = null;
      _sw
        ..stop()
        ..reset();
      return;
    }
    _basisMs = p.serverMs + (b.elapsedMs - p.monotonMs);
    _sw
      ..reset()
      ..start();
  }

  /// Jawaban server (semua endpoint membawa `waktu`): patokan baru.
  Future<void> setelServer(DateTime server) async {
    final b = await _monoton();
    if (b == null) return; // tanpa jam monoton native: tidak ada patokan, pakai jam HP
    if (b.waktuOtomatis != null) waktuOtomatis = b.waktuOtomatis;
    final p = _Patokan(server.millisecondsSinceEpoch, b.elapsedMs, b.bootCount);
    _patokan = p;
    _basisMs = p.serverMs;
    _sw
      ..reset()
      ..start();
    try {
      await _simpan.tulis(p.keJson());
    } catch (_) {
      // gagal simpan: patokan tetap berlaku selama app terbuka
    }
  }

  /// Waktu sekarang tanpa menunggu native (untuk tampilan & cek akhir shift). Tanpa patokan = jam HP.
  DateTime sekarang() {
    final b = _basisMs;
    return b == null ? _jamHp() : DateTime.fromMillisecondsSinceEpoch(b + _sw.elapsedMilliseconds, isUtc: true);
  }

  /// Bacaan sinkron lengkap (jam HP ikut, untuk tanda jam menyimpang di layar).
  WaktuTercatat cek() {
    final hp = _jamHp();
    final b = _basisMs;
    return b == null
        ? WaktuTercatat(waktu: hp, waktuHp: hp, sumber: 'HP')
        : WaktuTercatat(waktu: DateTime.fromMillisecondsSinceEpoch(b + _sw.elapsedMilliseconds, isUtc: true), waktuHp: hp, sumber: 'SERVER');
  }

  /// Waktu untuk dicatat ke pekerjaan (P0 dibuat, foto): baca ulang jam monoton dulu.
  Future<WaktuTercatat> catat() async {
    await segarkan();
    return cek();
  }
}
