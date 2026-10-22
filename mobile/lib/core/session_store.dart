import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

import 'sesi.dart';

/// Token disimpan di secure storage (Keystore/Keychain), bukan di SQLite.
class SessionStore {
  SessionStore({FlutterSecureStorage? storage}) : _s = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _s;
  static const _kunci = 'sisi_sesi';
  static const _kunciInstall = 'sisi_install_id';

  /// ID instalasi app: dibuat sekali, tetap sama walau logout/ganti akun. Hilang kalau app di-uninstall.
  /// Dipakai server untuk mencabut token lama saat login ulang di HP yang sama.
  Future<String> installId() async {
    final ada = await _s.read(key: _kunciInstall);
    if (ada != null && ada.isNotEmpty) return ada;
    final baru = const Uuid().v4();
    await _s.write(key: _kunciInstall, value: baru);
    return baru;
  }

  Future<Sesi?> baca() async {
    final raw = await _s.read(key: _kunci);
    if (raw == null) return null;
    try {
      return Sesi.dariJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      await hapus();
      return null;
    }
  }

  /// v0.62.5: semua tulis / hapus sesi berurutan (satu antrean), supaya "cek token lalu tulis" tidak bisa
  /// diselingi logout / login akun lain.
  Future<void> _antre = Future<void>.value();

  Future<T> _berurutan<T>(Future<T> Function() fn) {
    final c = Completer<T>();
    _antre = _antre.then((_) async {
      try {
        c.complete(await fn());
      } catch (e, st) {
        c.completeError(e, st);
      }
    });
    return c.future;
  }

  Future<String?> _tokenSekarang() async {
    final raw = await _s.read(key: _kunci);
    if (raw == null) return null;
    try {
      return Sesi.dariJson(jsonDecode(raw) as Map<String, dynamic>).token;
    } catch (_) {
      return null;
    }
  }

  Future<void> simpan(Sesi s) => _berurutan(() => _s.write(key: _kunci, value: jsonEncode(s.keJson())));

  Future<void> hapus() => _berurutan(() => _s.delete(key: _kunci));

  /// Tulis [baru] hanya kalau token yang tersimpan masih [token] (jawaban cekSesi yang terlambat). Hasil: ditulis?
  Future<bool> simpanJikaToken(String token, Sesi baru) => _berurutan(() async {
        if (await _tokenSekarang() != token) return false;
        await _s.write(key: _kunci, value: jsonEncode(baru.keJson()));
        return true;
      });

  /// Hapus sesi hanya kalau token yang tersimpan masih [token] (sesi habis yang terlambat tidak menghapus akun baru).
  Future<void> hapusJikaToken(String token) => _berurutan(() async {
        if (await _tokenSekarang() == token) await _s.delete(key: _kunci);
      });
}
