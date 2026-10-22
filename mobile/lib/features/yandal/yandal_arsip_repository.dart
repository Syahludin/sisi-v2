import 'dart:convert';

import 'package:sqflite/sqflite.dart' show ConflictAlgorithm;

import '../../core/api_client.dart';
import '../../core/sesi.dart';
import '../../data/local_db.dart';
import '../row/laporan_repository.dart';

/// v0.63.5: Arsip P0 (getArsipYandal, maks 31 hari per panggilan, shift yang sudah selesai) dan Rank Yandal
/// (getRankYandal per bulan). Keduanya disimpan di HP supaya bisa dibuka offline.
class YandalArsipRepository {
  YandalArsipRepository(this._api, this._db);

  final ApiClient _api;
  final LocalDb _db;

  static String iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  /// Download arsip tim akun ini per bulan kalender. Data lama di rentang yang sama diganti. Hasil: jumlah shift.
  Future<int> unduhArsip(Sesi s, {required DateTime dari, required DateTime sampai,
      void Function(int selesai, int total, DateTime bulan)? progres}) async {
    final potong = LaporanRepository.potongBulanan(dari, sampai);
    var n = 0;
    for (var i = 0; i < potong.length; i++) {
      final (a, b) = potong[i];
      progres?.call(i, potong.length, a);
      final d = await _api.call('getArsipYandal', token: s.token, data: {'dari': iso(a), 'sampai': iso(b)});
      final shift = (d['shift'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<String, dynamic>>().toList();
      final sekarang = DateTime.now().toUtc().toIso8601String();
      await _db.db.transaction((tx) async {
        await tx.delete('arsip_yandal',
            where: 'user_id = ? AND tanggal >= ? AND tanggal <= ?', whereArgs: [s.userId, iso(a), iso(b)]);
        for (final x in shift) {
          await tx.insert('arsip_yandal', {
            'shift_id': x['shiftId'] as String,
            'user_id': s.userId,
            'tanggal': x['tanggal'] as String,
            'shift': (x['shift'] as num?)?.toInt() ?? 0,
            'json': jsonEncode(x),
            'diunduh_pada': sekarang,
          }, conflictAlgorithm: ConflictAlgorithm.replace);
        }
      });
      n += shift.length;
      progres?.call(i + 1, potong.length, a);
    }
    return n;
  }

  /// Arsip di HP, terbaru dulu (tanggal turun, shift turun).
  Future<List<Map<String, dynamic>>> arsipLokal(String userId) async {
    final r = await _db.db.query('arsip_yandal', where: 'user_id = ?', whereArgs: [userId], orderBy: 'tanggal DESC, shift DESC');
    return [for (final x in r) Map<String, dynamic>.from(jsonDecode(x['json'] as String) as Map)];
  }

  Future<void> hapusArsipLokal(String userId) => _db.db.delete('arsip_yandal', where: 'user_id = ?', whereArgs: [userId]);

  static String _kunciRank(String userId, String periode) => 'rank-yandal:$userId:$periode';

  /// Rank satu bulan dari server, lalu disimpan (offline = pakai [rankLokal]).
  Future<Map<String, dynamic>> rank(Sesi s, String periode) async {
    final d = await _api.call('getRankYandal', token: s.token, data: {'periode': periode});
    await _db.db.insert('master_cache', {
      'kunci': _kunciRank(s.userId, periode),
      'versi': periode,
      'json': jsonEncode(d),
      'diambil_pada': DateTime.now().toUtc().toIso8601String(),
    }, conflictAlgorithm: ConflictAlgorithm.replace);
    return d;
  }

  Future<Map<String, dynamic>?> rankLokal(String userId, String periode) async {
    final r = await _db.db.query('master_cache', where: 'kunci = ?', whereArgs: [_kunciRank(userId, periode)], limit: 1);
    if (r.isEmpty) return null;
    return Map<String, dynamic>.from(jsonDecode(r.first['json'] as String) as Map);
  }
}

/// Kelompok arsip: tahun > bulan > tanggal > shift (urutan masukan dipertahankan, sudah terbaru dulu).
Map<String, Map<String, Map<String, List<Map<String, dynamic>>>>> kelompokArsipYandal(List<Map<String, dynamic>> shift) {
  final hasil = <String, Map<String, Map<String, List<Map<String, dynamic>>>>>{};
  for (final x in shift) {
    final t = '${x['tanggal'] ?? ''}';
    if (t.length < 10) continue;
    hasil.putIfAbsent(t.substring(0, 4), () => {}).putIfAbsent(t.substring(0, 7), () => {}).putIfAbsent(t, () => []).add(x);
  }
  return hasil;
}

/// Jumlah rekap beberapa shift: (P0, approved, point).
(int, int, double) jumlahRekapYandal(Iterable<Map<String, dynamic>> shift) {
  var p0 = 0, ok = 0;
  var point = 0.0;
  for (final x in shift) {
    final r = (x['rekap'] as Map<dynamic, dynamic>?) ?? const <dynamic, dynamic>{};
    p0 += (r['jumlahP0'] as num?)?.toInt() ?? 0;
    ok += (r['approved'] as num?)?.toInt() ?? 0;
    point += (r['totalPoint'] as num?)?.toDouble() ?? 0;
  }
  return (p0, ok, point);
}
