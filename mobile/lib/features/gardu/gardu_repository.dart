import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import '../../core/api_client.dart';
import '../../core/sesi.dart';
import '../../data/local_db.dart';
import 'gardu_model.dart';

/// v0.69.0: Master Gardu di HP (Pengaturan > Master Gardu). Disimpan di master_cache (kunci `gardu` / `pejabatBa`),
/// terpisah dari Master Data biasa karena isinya besar dan hanya untuk akun dengan menu Pengukuran Gardu / BA Gardu.
class GarduRepository {
  GarduRepository(this._api, this._db);

  final ApiClient _api;
  final LocalDb _db;

  static const menuUkur = 'OPS_PENGUKURAN_GARDU';
  static const menuBa = 'OPS_BA_GARDU';

  /// Modul yang boleh diunduh akun ini (server memeriksa ulang aksesnya).
  static List<String> modulUntuk(Sesi s) => [
        // v0.74.0: petugas YANDAL membaca Master Gardu untuk P0 Pengecekan Gardu (hanya baca)
        // v0.95.0: petugas HARTEK membaca Master Gardu untuk dropdown nomor gardu + koordinat otomatis (hanya baca)
        if (s.aksiMenu(menuUkur) != null ||
            s.aksiMenu(menuBa) != null ||
            s.petugasYandal ||
            (s.petugasHartek && s.aksiMenu('OPS_HARTEK_INPUT') != null) ||
            s.petugasInsDu) // v1.0.21: petugas Inspeksi Gardu (hanya baca)
          'gardu',
        if (s.aksiMenu(menuBa) != null && (s.role == 'ADMIN' || s.role == 'SUPER')) 'pejabatBa',
        // v0.75.0: aturan "Pengukuran Gardu 2 Hari Sekali" (dibaca petugas YANDAL + admin)
        if (s.petugasYandal || s.role == 'ADMIN' || s.role == 'SUPER') 'aturanYandal',
      ];

  static bool bolehUnduh(Sesi s) => modulUntuk(s).isNotEmpty;

  List<Gardu>? _cache;
  String? _versiCache;

  Future<Map<String, Object?>?> _baris(String kunci) async {
    final r = await _db.db.query('master_cache', where: 'kunci = ?', whereArgs: [kunci], limit: 1);
    return r.isEmpty ? null : r.first;
  }

  /// Info unduhan terakhir: (versi, waktu, jumlah). null = belum pernah.
  Future<({String versi, DateTime diambil, int jumlah})?> info() async {
    final b = await _baris('gardu');
    if (b == null) return null;
    final isi = jsonDecode(b['json'] as String);
    return (
      versi: b['versi'] as String,
      diambil: DateTime.parse(b['diambil_pada'] as String),
      jumlah: isi is List ? isi.length : 0,
    );
  }

  /// Semua gardu lokal (AKTIF + TIDAK AKTIF). Kosong = belum diunduh.
  Future<List<Gardu>> semua() async {
    final b = await _baris('gardu');
    if (b == null) return const [];
    final versi = b['versi'] as String;
    if (_cache != null && _versiCache == versi) return _cache!;
    final isi = jsonDecode(b['json'] as String);
    final daftar = <Gardu>[
      if (isi is List)
        for (final x in isi.whereType<Map<dynamic, dynamic>>()) Gardu.dariJson(Map<String, dynamic>.from(x)),
    ];
    _cache = daftar;
    _versiCache = versi;
    return daftar;
  }

  /// v0.75.0: toggle admin "Pengukuran Gardu 2 Hari Sekali" (terakhir diunduh). null = belum pernah diunduh.
  Future<bool?> aturanGarduDuaHari() async {
    final b = await _baris('aturanYandal');
    if (b == null) return null;
    final isi = jsonDecode(b['json'] as String);
    if (isi is! List) return null;
    for (final x in isi.whereType<Map<dynamic, dynamic>>()) {
      if (x['kunci'] == 'garduDuaHari') return x['aktif'] == true;
    }
    return false;
  }

  /// v0.98.13: daftar ringkas pengukuran gardu 2 hari terakhir dari server (modul `aturanYandal`).
  Future<List<Map<String, dynamic>>> ukurGarduTerbaru() async {
    final b = await _baris('aturanYandal');
    if (b == null) return const [];
    final isi = jsonDecode(b['json'] as String);
    if (isi is! List) return const [];
    for (final x in isi.whereType<Map<dynamic, dynamic>>()) {
      if (x['kunci'] == 'garduDuaHari') {
        final l = x['ukurTerbaru'];
        if (l is List) {
          return [for (final u in l.whereType<Map<dynamic, dynamic>>()) Map<String, dynamic>.from(u)];
        }
      }
    }
    return const [];
  }

  /// v0.98.13: segarkan hanya modul `aturanYandal` (ringan, mengambil aturan + ukurTerbaru 2 hari terakhir).
  Future<bool> segarkanAturanYandal(Sesi s) async {
    const m = 'aturanYandal';
    if (!modulUntuk(s).contains(m)) return false;
    final b = await _baris(m);
    final versi = <String, String>{if (b != null) m: b['versi'] as String};
    final d = await _api.call('getMaster', token: s.token, data: {'modul': [m], 'versiModul': versi});
    final hasil = d['modul'];
    if (hasil is! Map<String, dynamic>) return false;
    final x = hasil[m];
    if (x is! Map<String, dynamic>) return false;
    final sekarang = DateTime.now().toUtc().toIso8601String();
    if (x['berubah'] == true) {
      await _db.db.insert('master_cache', {'kunci': m, 'versi': x['versi'] as String, 'json': jsonEncode(x['isi']), 'diambil_pada': sekarang},
          conflictAlgorithm: ConflictAlgorithm.replace);
      return true;
    }
    await _db.db.update('master_cache', {'diambil_pada': sekarang}, where: 'kunci = ?', whereArgs: [m]);
    return false;
  }

  /// Simpan toggle (admin). Server memeriksa peran; cache lokal diperbarui lewat unduhan berikutnya.
  Future<bool> simpanAturanGarduDuaHari(Sesi s, bool aktif) async {
    final d = await _api.call('simpanAturanYandal', token: s.token, data: {'garduDuaHari': aktif});
    final hasil = d['garduDuaHari'] == true;
    try {
      await segarkan(s);
    } catch (_) {/* cache diperbarui lain kali */}
    return hasil;
  }

  /// Pejabat BA lokal (aktif saja), urut urutan.
  Future<List<Map<String, dynamic>>> pejabatBa() async {
    final b = await _baris('pejabatBa');
    if (b == null) return const [];
    final isi = jsonDecode(b['json'] as String);
    if (isi is! List) return const [];
    return [
      for (final x in isi.whereType<Map<dynamic, dynamic>>())
        if (x['aktif'] == true) Map<String, dynamic>.from(x),
    ];
  }

  /// Unduh Master Gardu (versi sama = tidak dikirim ulang). Hasil: true kalau isinya berubah.
  Future<bool> segarkan(Sesi s) async {
    final modul = modulUntuk(s);
    if (modul.isEmpty) return false;
    final versi = <String, String>{};
    for (final m in modul) {
      final b = await _baris(m);
      if (b != null) versi[m] = b['versi'] as String;
    }
    final d = await _api.call('getMaster', token: s.token, data: {'modul': modul, 'versiModul': versi});
    final hasil = d['modul'];
    if (hasil is! Map<String, dynamic>) throw StateError('Respons getMaster tidak dikenal');
    var berubah = false;
    final sekarang = DateTime.now().toUtc().toIso8601String();
    await _db.db.transaction((tx) async {
      for (final m in modul) {
        final x = hasil[m];
        if (x is! Map<String, dynamic>) continue;
        if (x['berubah'] == true) {
          berubah = true;
          await tx.insert('master_cache', {'kunci': m, 'versi': x['versi'] as String, 'json': jsonEncode(x['isi']), 'diambil_pada': sekarang},
              conflictAlgorithm: ConflictAlgorithm.replace);
        } else {
          await tx.update('master_cache', {'diambil_pada': sekarang}, where: 'kunci = ?', whereArgs: [m]);
        }
      }
    });
    if (berubah) _cache = null;
    return berubah;
  }
}
