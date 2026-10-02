import '../../core/api_client.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/session_store.dart';

/// Endpoint: login, cekSesi, logout (PRD 6. Endpoint).
class AuthRepository {
  AuthRepository(this._api, this._store);

  final ApiClient _api;
  final SessionStore _store;

  Future<Sesi> login(String username, String password, {String? perangkat}) async {
    final d = await _api.call('login', data: {
      'username': username.trim().toLowerCase(),
      'password': password, // tidak di-trim
      'installId': await _store.installId(),
      if (perangkat != null && perangkat.isNotEmpty) 'perangkat': perangkat,
    });
    final s = Sesi.dariLogin(d);
    await _store.simpan(s);
    return s;
  }

  /// Dipanggil tiap app online. Sesi habis -> token dihapus, outbox TIDAK disentuh (Alur D).
  Future<Sesi> cekSesi(Sesi s) async {
    try {
      final d = await _api.call('cekSesi', token: s.token);
      final baru = s.denganData(d);
      await _store.simpan(baru);
      return baru;
    } on ApiException catch (e) {
      if (KodeError.sesiHabis.contains(e.kode)) await _store.hapus();
      rethrow;
    }
  }

  Future<void> logout(Sesi s) async {
    try {
      await _api.call('logout', token: s.token);
    } on ApiException {
      // sesi sudah tidak sah atau offline: token lokal tetap dihapus
    } finally {
      await _store.hapus();
    }
  }
}
