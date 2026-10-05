import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import '../../core/api_client.dart';
import '../../core/sesi.dart';
import '../../data/local_db.dart';

/// Status satu database master di HP (untuk Pengaturan > Download Master Data).
class InfoModul {
  const InfoModul({required this.modul, this.versi, this.diambil, this.jumlah = 0});
  final String modul;
  final String? versi;
  final DateTime? diambil;
  final int jumlah;
  bool get ada => versi != null;
}

/// Endpoint getMaster per modul (PRD 6. Endpoint > getMaster). Tiap modul satu baris di master_cache.
class MasterRepository {
  MasterRepository(this._api, this._db);

  final ApiClient _api;
  final LocalDb _db;

  /// Urutan tampil di Pengaturan.
  static const List<String> semuaModul = ['jaringan', 'jenisPekerjaan', 'tim', 'pengguna'];
  static const Map<String, String> label = {
    'jaringan': 'Penyulang & Section',
    'jenisPekerjaan': 'Jenis Pekerjaan',
    'tim': 'Tim & Sub-tim',
    'pengguna': 'Pengguna',
  };

  Future<List<Map<String, Object?>>> _baris() =>
      _db.db.query('master_cache', where: 'kunci IN (${List.filled(semuaModul.length, '?').join(',')})', whereArgs: semuaModul);

  /// Isi master lokal: { jaringan: [...], jenisPekerjaan: [...], tim: [...], pengguna: [...] }. null = belum pernah download.
  Future<Map<String, dynamic>?> lokal() async {
    final r = await _baris();
    if (r.isEmpty) return null;
    return {for (final b in r) b['kunci'] as String: jsonDecode(b['json'] as String)};
  }

  Future<Map<String, InfoModul>> infoModul() async {
    final r = await _baris();
    final hasil = {for (final m in semuaModul) m: InfoModul(modul: m)};
    for (final b in r) {
      final m = b['kunci'] as String;
      final isi = jsonDecode(b['json'] as String);
      hasil[m] = InfoModul(
        modul: m,
        versi: b['versi'] as String,
        diambil: DateTime.parse(b['diambil_pada'] as String),
        jumlah: isi is List ? isi.length : 0,
      );
    }
    return hasil;
  }

  /// Download modul (default semua). Modul yang versinya sama tidak dikirim ulang server.
  /// Hasil: daftar modul yang isinya berubah.
  Future<List<String>> segarkan(Sesi s, {List<String>? modul}) async {
    final pilih = modul ?? semuaModul;
    final info = await infoModul();
    final d = await _api.call('getMaster', token: s.token, data: {
      'modul': pilih,
      'versiModul': {
        for (final m in pilih)
          if (info[m]?.versi != null) m: info[m]!.versi!,
      },
    });
    final hasil = d['modul'];
    if (hasil is! Map<String, dynamic>) throw StateError('Respons getMaster tidak dikenal');
    final berubah = <String>[];
    final sekarang = DateTime.now().toUtc().toIso8601String();
    await _db.db.transaction((tx) async {
      for (final e in hasil.entries) {
        if (!semuaModul.contains(e.key) || e.value is! Map<String, dynamic>) continue;
        final m = e.value as Map<String, dynamic>;
        if (m['berubah'] == true) {
          berubah.add(e.key);
          await tx.insert(
            'master_cache',
            {'kunci': e.key, 'versi': m['versi'] as String, 'json': jsonEncode(m['isi']), 'diambil_pada': sekarang},
            conflictAlgorithm: ConflictAlgorithm.replace,
          );
        } else {
          // Sama dengan server: catat waktu cek terakhir.
          await tx.update('master_cache', {'diambil_pada': sekarang}, where: 'kunci = ?', whereArgs: [e.key]);
        }
      }
      await tx.delete('master_cache', where: 'kunci = ?', whereArgs: ['semua']); // format v0.17 ke bawah
    });
    return berubah;
  }

  List<Map<String, dynamic>> _daftar(Map<String, dynamic>? m, String modul) =>
      (m?[modul] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<dynamic, dynamic>>()
          .map(Map<String, dynamic>.from)
          .toList();

  /// Penyulang aktif (unik, urut abjad).
  Future<List<String>> penyulang() async {
    final daftar = <String>{};
    for (final j in _daftar(await lokal(), 'jaringan')) {
      if (j['aktif'] == true) daftar.add(j['penyulang'] as String);
    }
    return daftar.toList()..sort();
  }

  /// Urutan section (v0.46) = kolom urutan db_Jaringan per penyulang (kecil = dekat PMT / sumber).
  /// Urutan kosong / 0 di belakang, urut baris sheet; seri dipecah baris lalu nama. Sama dengan urutSection_ server.
  static int bandingSection(Map<String, dynamic> a, Map<String, dynamic> b) {
    num kunci(Map<String, dynamic> j, String k) {
      final v = (j[k] as num?) ?? 0;
      return v > 0 ? v : double.infinity;
    }

    final u = kunci(a, 'urutan').compareTo(kunci(b, 'urutan'));
    if (u != 0) return u;
    final r = kunci(a, 'baris').compareTo(kunci(b, 'baris'));
    if (r != 0) return r;
    return (a['section'] as String? ?? '').compareTo(b['section'] as String? ?? '');
  }

  /// Section aktif milik satu penyulang: (id, nama), urut kolom urutan db_Jaringan.
  Future<List<({String id, String nama})>> section(String penyulang) async {
    final daftar = _daftar(await lokal(), 'jaringan')
        .where((j) => j['aktif'] == true && (j['penyulang'] as String).toLowerCase() == penyulang.toLowerCase())
        .toList()
      ..sort(bandingSection);
    return [for (final j in daftar) (id: j['id'] as String, nama: j['section'] as String)];
  }

  /// Sub-tim ROW aktif (v0.50, menu Operasi > Laporan per Tim), urut kode.
  Future<List<Map<String, dynamic>>> timRow() async {
    final daftar = _daftar(await lokal(), 'tim').where((t) => t['aktif'] == true && t['jenis'] == 'ROW').toList()
      ..sort((a, b) => '${a['kode']}'.compareTo('${b['kode']}'));
    return daftar;
  }

  /// Jenis pekerjaan dari master (mentah, untuk JenisPekerjaan.dariMaster).
  Future<List<Map<String, dynamic>>> jenisPekerjaan() async => _daftar(await lokal(), 'jenisPekerjaan');

  /// Pengguna aktif satu tim (nama untuk tampilan).
  Future<List<Map<String, dynamic>>> penggunaTim(String timId) async =>
      _daftar(await lokal(), 'pengguna').where((u) => u['aktif'] == true && u['timId'] == timId).toList();
}
