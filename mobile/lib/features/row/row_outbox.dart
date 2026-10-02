import 'dart:convert';

import 'package:uuid/uuid.dart';

import '../../data/local_db.dart';

/// Antrean operasi ROW di HP (PRD F-ROW-SYNC). Semua input masuk sini dulu, tidak ada tulis langsung ke server.
class RowOutbox {
  RowOutbox(this._db);

  final LocalDb _db;
  static const _uuid = Uuid();

  /// header=1, realisasi=2, eksekusi=3: induk selalu terkirim dulu.
  static const Map<String, int> urutanJenis = {'header': 1, 'realisasi': 2, 'eksekusi': 3};

  static String uuidBaru() => _uuid.v4();

  Future<String> tambah({
    required String userId,
    required String jenis,
    required String aksi,
    required String id,
    String? indukId,
    required String kode,
    int revision = 0,
    required Map<String, dynamic> isi,
  }) async {
    final urutan = urutanJenis[jenis];
    if (urutan == null) throw ArgumentError.value(jenis, 'jenis');
    final opId = uuidBaru();
    await _db.db.insert('outbox', {
      'op_id': opId,
      'user_id': userId,
      'jenis': jenis,
      'aksi': aksi,
      'id': id,
      'induk_id': indukId,
      'kode': kode,
      'revision': revision,
      'isi': jsonEncode(isi),
      'waktu_perangkat': DateTime.now().toUtc().toIso8601String(),
      'urutan': urutan,
    });
    return opId;
  }

  /// Maks 50, induk dulu, lalu urutan dibuat.
  Future<List<Map<String, Object?>>> tertunda(String userId, {int batas = 50}) {
    return _db.db.query(
      'outbox',
      where: 'user_id = ? AND status = ?',
      whereArgs: [userId, 'TERTUNDA'],
      orderBy: 'urutan ASC, waktu_perangkat ASC',
      limit: batas,
    );
  }

  Future<int> jumlahBelumTerkirim(String userId) async {
    final r = await _db.db.rawQuery(
      "SELECT COUNT(*) AS n FROM outbox WHERE user_id = ? AND status IN ('TERTUNDA','KONFLIK')",
      [userId],
    );
    return (r.first['n'] as int?) ?? 0;
  }

  Future<void> tandai(String opId, String status, {String? alasan}) {
    return _db.db.update(
      'outbox',
      {'status': status, 'alasan': alasan, 'dikirim_pada': DateTime.now().toUtc().toIso8601String()},
      where: 'op_id = ?',
      whereArgs: [opId],
    );
  }
}
