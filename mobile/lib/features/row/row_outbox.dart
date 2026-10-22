import 'dart:convert';

import 'package:sqflite/sqflite.dart';
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

  /// Urutan kirim. M4 (v0.62): batal = 10 - urutan jenis (eksekusi 7, realisasi 8, header 9), jadi batal selalu
  /// terkirim setelah semua buat / ubah dan anak lebih dulu walau terpecah ke beberapa kiriman (tanpa MASIH_ADA_ANAK).
  static int urutanUntuk(String jenis, String aksi) {
    final u = urutanJenis[jenis]!;
    return aksi == 'batal' ? 10 - u : u;
  }

  /// `ex` = transaksi pemanggil (supaya baris lokal + outbox tersimpan bersama atau tidak sama sekali).
  Future<String> tambah({
    DatabaseExecutor? ex,
    required String userId,
    required String jenis,
    required String aksi,
    required String id,
    String? indukId,
    required String kode,
    int revision = 0,
    required Map<String, dynamic> isi,
  }) async {
    final dasar = urutanJenis[jenis];
    if (dasar == null) throw ArgumentError.value(jenis, 'jenis');
    final urutan = urutanUntuk(jenis, aksi);
    final opId = uuidBaru();
    await (ex ?? _db.db).insert('outbox', {
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

  /// Operasi TERTUNDA untuk satu data (buat/ubah yang belum terkirim), untuk digabung.
  /// v0.62: [jugaDitolak] = operasi DITOLAK ikut dicari (Perbaiki data yang ditolak validasi server).
  Future<Map<String, Object?>?> tertundaUntuk(DatabaseExecutor ex, String userId, String id, String aksi,
      {bool jugaDitolak = false}) async {
    final r = await ex.query('outbox',
        where: jugaDitolak ? "user_id = ? AND id = ? AND aksi = ? AND status IN ('TERTUNDA','DITOLAK')" : 'user_id = ? AND id = ? AND aksi = ? AND status = ?',
        whereArgs: jugaDitolak ? [userId, id, aksi] : [userId, id, aksi, 'TERTUNDA'],
        limit: 1);
    return r.isEmpty ? null : r.first;
  }

  /// Semua operasi yang belum TERKIRIM untuk satu data (M4).
  Future<List<Map<String, Object?>>> belumTerkirimUntuk(DatabaseExecutor ex, String userId, String id) =>
      ex.query('outbox', where: "user_id = ? AND id = ? AND status != 'TERKIRIM'", whereArgs: [userId, id]);

  /// Data belum pernah diterima server = operasi buat-nya masih TERTUNDA / KONFLIK (KODE_BENTROK) / DITOLAK (M4).
  Future<bool> belumDiterima(DatabaseExecutor ex, String userId, String id) async {
    final r = await ex.query('outbox',
        columns: ['op_id'], where: "user_id = ? AND id = ? AND aksi = 'buat' AND status != 'TERKIRIM'", whereArgs: [userId, id], limit: 1);
    return r.isNotEmpty;
  }

  /// Hapus semua operasi yang belum TERKIRIM untuk satu data (Hapus data lokal / buang perubahan).
  Future<int> hapusUntuk(DatabaseExecutor ex, String userId, String id, {String? aksi}) => ex.delete('outbox',
      where: "user_id = ? AND id = ? AND status != 'TERKIRIM'${aksi == null ? '' : ' AND aksi = ?'}",
      whereArgs: [userId, id, if (aksi != null) aksi]);

  /// Kembalikan operasi ke antrean (setelah Minta nomor baru / Gabungkan / Perbaiki / Kirim ulang).
  Future<void> kembalikanTertunda(DatabaseExecutor ex, String opId,
      {String? kode, int? revision, String? indukId, Map<String, dynamic>? isi}) {
    return ex.update(
      'outbox',
      {
        'status': 'TERTUNDA',
        'alasan': null,
        'dikirim_pada': null,
        if (kode != null) 'kode': kode,
        if (revision != null) 'revision': revision,
        if (indukId != null) 'induk_id': indukId,
        if (isi != null) 'isi': jsonEncode(isi),
      },
      where: 'op_id = ?',
      whereArgs: [opId],
    );
  }

  /// Operasi yang perlu tindakan petugas (KONFLIK / DITOLAK), induk dulu (M4, Pusat Masalah).
  Future<List<Map<String, Object?>>> perluTindakan(String userId) => _db.db.query('outbox',
      where: "user_id = ? AND status IN ('KONFLIK','DITOLAK')", whereArgs: [userId], orderBy: 'urutan ASC, waktu_perangkat ASC');

  /// v0.62 (M4): anak yang ditolak karena induknya (INDUK_GAGAL / INDUK_BENTROK / INDUK_TIDAK_ADA) kembali ke
  /// antrean begitu operasi buat induknya TERTUNDA lagi (sudah diperbaiki) atau sudah TERKIRIM.
  Future<int> pulihkanIkutInduk(String userId) => _db.db.rawUpdate('''
      UPDATE outbox SET status = 'TERTUNDA', alasan = NULL
      WHERE user_id = ? AND status IN ('DITOLAK','KONFLIK') AND alasan IN ('INDUK_GAGAL','INDUK_BENTROK','INDUK_TIDAK_ADA')
        AND induk_id IN (SELECT id FROM outbox WHERE user_id = ? AND aksi = 'buat' AND status IN ('TERTUNDA','TERKIRIM'))''',
      [userId, userId]);

  Future<int> jumlahPerluTindakan(String userId) async {
    final r = await _db.db.rawQuery("SELECT COUNT(*) AS n FROM outbox WHERE user_id = ? AND status IN ('KONFLIK','DITOLAK')", [userId]);
    return (r.first['n'] as int?) ?? 0;
  }

  Future<void> gantiIsi(DatabaseExecutor ex, String opId, Map<String, dynamic> isi) =>
      ex.update('outbox', {'isi': jsonEncode(isi)}, where: 'op_id = ?', whereArgs: [opId]);

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
      "SELECT COUNT(*) AS n FROM outbox WHERE user_id = ? AND status IN ('TERTUNDA','KONFLIK','DITOLAK')",   // v0.62: DITOLAK ikut menahan logout
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
