import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import '../../core/api_client.dart';
import '../../core/sesi.dart';
import '../../data/local_db.dart';

/// Endpoint getMaster (PRD 6. Endpoint > getMaster). Hasil disimpan untuk offline.
class MasterRepository {
  MasterRepository(this._api, this._db);

  final ApiClient _api;
  final LocalDb _db;
  static const _kunci = 'semua';

  Future<Map<String, dynamic>?> lokal() async {
    final r = await _db.db.query('master_cache', where: 'kunci = ?', whereArgs: [_kunci]);
    if (r.isEmpty) return null;
    return jsonDecode(r.first['json'] as String) as Map<String, dynamic>;
  }

  /// true kalau master lokal diperbarui.
  Future<bool> segarkan(Sesi s) async {
    final r = await _db.db.query('master_cache', where: 'kunci = ?', whereArgs: [_kunci]);
    final versiLokal = r.isEmpty ? null : r.first['versi'] as String;
    final d = await _api.call('getMaster', token: s.token, data: {
      if (versiLokal != null) 'versi': versiLokal,
    });
    if (d['berubah'] != true) return false;
    await _db.db.insert(
      'master_cache',
      {
        'kunci': _kunci,
        'versi': d['versi'] as String,
        'json': jsonEncode(d['isi']),
        'diambil_pada': DateTime.now().toUtc().toIso8601String(),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
    return true;
  }
}
