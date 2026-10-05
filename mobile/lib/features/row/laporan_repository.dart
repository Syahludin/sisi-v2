import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/api_client.dart';
import '../../core/sesi.dart';
import '../../data/local_db.dart';

/// Laporan WA dari server (getLaporanRow, 7 hari) dan arsip (getArsipRow, maks 31 hari per panggilan, sampai kemarin).
/// Arsip yang diunduh disimpan di tabel arsip_row supaya bisa dibuka offline (kartu tahun > bulan > hari).
/// Teks WA SELALU dibuat server; HP hanya menyimpan salinan terakhir untuk dilihat offline.
class LaporanRepository {
  LaporanRepository(this._api, this._db);

  final ApiClient _api;
  final LocalDb _db;

  /// Laporan satu header (null = server belum punya header itu / BATAL). Hasil disimpan ke row_header.
  Future<Map<String, dynamic>?> untukHeader(Sesi s, {required String headerId, required String tanggal}) async {
    final d = await _api.call('getLaporanRow', token: s.token, data: {'tanggal': tanggal});
    for (final l in (d['laporan'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<String, dynamic>>()) {
      if (l['headerId'] == headerId) {
        await _db.db.update(
          'row_header',
          {'wa_text': (l['waText'] as String?) ?? '', 'wa_siap': l['siapKirim'] == true ? 1 : 0},
          where: 'id = ?',
          whereArgs: [headerId],
        );
        return l;
      }
    }
    return null;
  }

  /// Salin status WA semua header hari ini (dipanggil SyncController setelah ada data/foto terkirim).
  Future<void> segarkanHariIni(Sesi s) async {
    final d = await _api.call('getLaporanRow', token: s.token);
    for (final l in (d['laporan'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<String, dynamic>>()) {
      await _db.db.update(
        'row_header',
        {'wa_text': (l['waText'] as String?) ?? '', 'wa_siap': l['siapKirim'] == true ? 1 : 0},
        where: 'id = ?',
        whereArgs: [l['headerId']],
      );
    }
  }

  /// timId (v0.50): admin memilih satu tim (menu Operasi). PETUGAS tidak mengirim (server memakai tim sesi).
  /// Laporan hari ini dari server tanpa menyentuh data HP (v0.50, menu Operasi): semua tim (admin) atau satu tim.
  Future<List<Map<String, dynamic>>> laporanHariIni(Sesi s, {String? timId}) async {
    final d = await _api.call('getLaporanRow', token: s.token, data: {if (timId != null) 'timId': timId});
    return (d['laporan'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<String, dynamic>>().toList();
  }

  Future<List<Map<String, dynamic>>> arsip(Sesi s, {required String dari, required String sampai, String? timId}) async {
    final d = await _api.call('getArsipRow', token: s.token,
        data: {'dari': dari, 'sampai': sampai, if (timId != null) 'timId': timId});
    return (d['laporan'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<String, dynamic>>().toList();
  }

  /// Rentang dipecah per bulan kalender (tiap potong <= 31 hari = batas server). Satu panggilan per bulan.
  static List<(DateTime, DateTime)> potongBulanan(DateTime dari, DateTime sampai) {
    final hasil = <(DateTime, DateTime)>[];
    var awal = DateTime(dari.year, dari.month, dari.day);
    final akhir = DateTime(sampai.year, sampai.month, sampai.day);
    while (!awal.isAfter(akhir)) {
      final ujungBulan = DateTime(awal.year, awal.month + 1, 0);
      final ujung = ujungBulan.isAfter(akhir) ? akhir : ujungBulan;
      hasil.add((awal, ujung));
      awal = ujung.add(const Duration(days: 1));
    }
    return hasil;
  }

  static String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  /// Download arsip tim sesi untuk rentang (hari H tidak termasuk; server menolak). Data lama di rentang yang sama
  /// diganti (laporan yang sudah BATAL ikut hilang). `progres(selesai, total, awalBulan)`. Hasil: jumlah laporan.
  Future<int> unduhArsip(Sesi s, {required DateTime dari, required DateTime sampai, String? timId,
      void Function(int selesai, int total, DateTime bulan)? progres}) async {
    final potong = potongBulanan(dari, sampai);
    var n = 0;
    for (var i = 0; i < potong.length; i++) {
      final (a, b) = potong[i];
      progres?.call(i, potong.length, a);
      final laporan = await arsip(s, dari: _iso(a), sampai: _iso(b), timId: timId);
      final sekarang = DateTime.now().toUtc().toIso8601String();
      await _db.db.transaction((tx) async {
        await tx.delete('arsip_row',
            where: 'user_id = ? AND tanggal >= ? AND tanggal <= ?${timId == null ? '' : ' AND tim_id = ?'}',
            whereArgs: [s.userId, _iso(a), _iso(b), if (timId != null) timId]);
        for (final l in laporan) {
          await tx.insert('arsip_row', {
            'header_id': l['headerId'] as String,
            'user_id': s.userId,
            'tanggal': l['tanggal'] as String,
            'kode': l['kodeHeader'] as String,
            'json': jsonEncode(l),
            'diunduh_pada': sekarang,
            'tim_id': l['timId'] as String?,
          });
        }
      });
      n += laporan.length;
      progres?.call(i + 1, potong.length, a);
    }
    return n;
  }

  /// Arsip yang sudah ada di HP, terbaru dulu.
  Future<List<Map<String, dynamic>>> arsipLokal(String userId, {String? timId}) async {
    final r = await _db.db.query('arsip_row',
        where: timId == null ? 'user_id = ?' : 'user_id = ? AND tim_id = ?',
        whereArgs: [userId, if (timId != null) timId],
        orderBy: 'tanggal DESC, kode DESC');
    return [for (final x in r) Map<String, dynamic>.from(jsonDecode(x['json'] as String) as Map)];
  }

  /// timId (v0.50): hapus arsip satu tim saja (menu Operasi). Foto arsip dipakai bersama, jadi tidak ikut dihapus.
  Future<void> hapusArsipLokal(String userId, {String? timId}) async {
    if (timId != null) {
      await _db.db.delete('arsip_row', where: 'user_id = ? AND tim_id = ?', whereArgs: [userId, timId]);
      final d = await _dirArsipHari(userId, timId);
      if (await d.exists()) await d.delete(recursive: true);
      return;
    }
    await _db.db.delete('arsip_row', where: 'user_id = ?', whereArgs: [userId]);
    for (final d in [await _dirArsipHari(userId), await _dirArsipFoto(userId)]) {
      if (await d.exists()) await d.delete(recursive: true);
    }
  }

  // ---------- Detail arsip per tanggal (v0.37): header + realisasi + eksekusi + foto ----------
  // Disimpan sebagai file JSON per tanggal + file foto per foto_id di folder privat app, supaya bisa dibuka offline.

  /// timId = folder per tim (menu Operasi), supaya tanggal yang sama dari tim berbeda tidak saling menimpa.
  Future<Directory> _dirArsipHari(String userId, [String? timId]) async => Directory(timId == null
      ? p.join((await getApplicationDocumentsDirectory()).path, 'arsip_hari', userId)
      : p.join((await getApplicationDocumentsDirectory()).path, 'arsip_hari', userId, 'tim', timId));
  Future<Directory> _dirArsipFoto(String userId) async =>
      Directory(p.join((await getApplicationDocumentsDirectory()).path, 'arsip_foto', userId));

  /// Detail tanggal yang sudah tersimpan di HP (null = belum pernah dibuka).
  Future<({Map<String, dynamic> data, DateTime diunduh})?> arsipHariLokal(String userId, String tanggal, {String? timId}) async {
    final f = File(p.join((await _dirArsipHari(userId, timId)).path, '$tanggal.json'));
    if (!await f.exists()) return null;
    try {
      final isi = Map<String, dynamic>.from(jsonDecode(await f.readAsString()) as Map);
      return (data: isi, diunduh: await f.lastModified());
    } catch (_) {
      return null; // file rusak: anggap belum ada
    }
  }

  /// Ambil detail tanggal dari server (getArsipHariRow) lalu simpan di HP.
  Future<Map<String, dynamic>> unduhArsipHari(Sesi s, String tanggal, {String? timId}) async {
    final d = await _api.call('getArsipHariRow', token: s.token,
        data: {'tanggal': tanggal, if (timId != null) 'timId': timId});
    final dir = await _dirArsipHari(s.userId, timId);
    await dir.create(recursive: true);
    await File(p.join(dir.path, '$tanggal.json')).writeAsString(jsonEncode(d));
    return d;
  }

  /// Path foto arsip lokal kalau sudah ada dan cocok sha256-nya.
  Future<String?> fotoArsipLokal(String userId, Map<String, dynamic> foto) async {
    final f = File(p.join((await _dirArsipFoto(userId)).path, '${foto['fotoId']}.jpg'));
    if (!await f.exists()) return null;
    final sha = (foto['sha256'] as String?) ?? '';
    if (sha.isNotEmpty && sha256.convert(await f.readAsBytes()).toString() != sha) return null;
    return f.path;
  }

  /// Unduh 1 foto arsip (getFotoArsipRow). Izin foto di server berumur 6 jam: kalau habis, detail tanggal
  /// diambil ulang sekali lalu dicoba lagi. Hasil: path file lokal (sudah diverifikasi sha256).
  Future<String> fotoArsip(Sesi s, Map<String, dynamic> foto, {required String tanggal, String? timId}) async {
    final ada = await fotoArsipLokal(s.userId, foto);
    if (ada != null) return ada;
    final fotoId = foto['fotoId'] as String;
    Map<String, dynamic> d;
    try {
      d = await _api.call('getFotoArsipRow', token: s.token, data: {'fotoId': fotoId});
    } on ApiException catch (e) {
      if (e.kode != 'ARSIP_FOTO_KEDALUWARSA') rethrow;
      await unduhArsipHari(s, tanggal, timId: timId);
      d = await _api.call('getFotoArsipRow', token: s.token, data: {'fotoId': fotoId});
    }
    final bytes = base64Decode((d['data'] as String?) ?? '');
    final hash = sha256.convert(bytes).toString();
    final harapan = (foto['sha256'] as String?) ?? '';
    if (bytes.isEmpty || (harapan.isNotEmpty && hash != harapan)) throw ApiException('FOTO_RUSAK');
    final dir = await _dirArsipFoto(s.userId);
    await dir.create(recursive: true);
    final f = File(p.join(dir.path, '$fotoId.jpg'));
    await f.writeAsBytes(bytes, flush: true);
    return f.path;
  }
}
