import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../switching/switching_model.dart' show jarakMeter;

/// Satu tiang Terverifikasi di peta Master Jaringan (ringkas; detail tiang dibuka lewat Verifikasi Tiang).
class TitikTiang {
  const TitikTiang({required this.id, required this.nama, required this.kode, required this.titik, required this.penyulang});
  final String id, nama, kode;
  final LatLng titik;
  final List<String> penyulang;
}

/// Ruas penyulang: tiang -> induknya (sirkuit tiang itu, tiap penyulang sendiri).
class RuasTiang {
  const RuasTiang(this.dari, this.ke, this.penyulang);
  final LatLng dari, ke;
  final String penyulang;
}

/// getPetaTiang: tiang Terverifikasi ber-koordinat + garis ke induk per penyulang. Penyulang dibandingkan tanpa beda huruf besar.
class PetaTiang {
  const PetaTiang({this.titik = const [], this.ruas = const [], this.tanpaKoordinat = 0});
  final List<TitikTiang> titik;
  final List<RuasTiang> ruas;
  final int tanpaKoordinat;

  static String kunci(String p) => p.trim().toUpperCase();

  static double? _n(Object? v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}');

  factory PetaTiang.dariJson(Map<String, dynamic> j) {
    final titik = <TitikTiang>[];
    final posisi = <String, LatLng>{};
    for (final x in (j['titik'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) {
      final lat = _n(x['lat']), lng = _n(x['lng']), id = '${x['tiangId'] ?? ''}';
      if (lat == null || lng == null || id.isEmpty) continue;
      final p = LatLng(lat, lng);
      posisi[id] = p;
      titik.add(TitikTiang(
          id: id,
          nama: '${x['nama'] ?? ''}',
          kode: '${x['kode'] ?? ''}',
          titik: p,
          penyulang: [for (final s in (x['penyulang'] as List? ?? const [])) '$s']));
    }
    final ruas = <RuasTiang>[];
    for (final x in (j['garis'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) {
      final a = posisi['${x['tiangId']}'], b = posisi['${x['indukTiangId']}'];
      if (a != null && b != null) ruas.add(RuasTiang(b, a, '${x['penyulang'] ?? ''}'));
    }
    return PetaTiang(titik: titik, ruas: ruas, tanpaKoordinat: (j['tanpaKoordinat'] as num?)?.toInt() ?? 0);
  }

  /// Saringan penyulang ('' = semua).
  List<TitikTiang> titikUntuk(String penyulang) =>
      penyulang.isEmpty ? titik : [for (final t in titik) if (t.penyulang.any((p) => kunci(p) == kunci(penyulang))) t];

  List<RuasTiang> ruasUntuk(String penyulang) => penyulang.isEmpty ? ruas : [for (final r in ruas) if (kunci(r.penyulang) == kunci(penyulang)) r];

  /// Tiang terdekat dari [p] dalam [batasM] meter (ketukan di peta), atau null.
  TitikTiang? terdekat(LatLng p, double batasM, {String penyulang = ''}) {
    TitikTiang? t;
    var min = batasM;
    for (final x in titikUntuk(penyulang)) {
      final d = jarakMeter(p.latitude, p.longitude, x.titik.latitude, x.titik.longitude);
      if (d <= min) {
        min = d;
        t = x;
      }
    }
    return t;
  }
}

const _warnaPenyulang = [
  Color(0xFF28804F),
  Color(0xFFC04A4A),
  Color(0xFF2E9E5B),
  Color(0xFFFFD21E),
  Color(0xFF7B4FD1),
  Color(0xFFE2680F),
  Color(0xFF1B7F9E),
  Color(0xFFB4408A),
];

/// Warna garis per penyulang, tetap menurut urutan daftar penyulang Master Jaringan.
Color warnaPenyulang(List<String> daftar, String penyulang) {
  final i = daftar.indexWhere((p) => PetaTiang.kunci(p) == PetaTiang.kunci(penyulang));
  return _warnaPenyulang[(i < 0 ? penyulang.hashCode.abs() : i) % _warnaPenyulang.length];
}
