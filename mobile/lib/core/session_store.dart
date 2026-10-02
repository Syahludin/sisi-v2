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

  Future<void> simpan(Sesi s) => _s.write(key: _kunci, value: jsonEncode(s.keJson()));

  Future<void> hapus() => _s.delete(key: _kunci);
}
