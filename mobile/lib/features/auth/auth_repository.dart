import '../../core/api_client.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/session_store.dart';

/// Endpoint: login, cekSesi, logout (PRD 6. Endpoint).
class AuthRepository {
  AuthRepository(this._api, this._store);

  final ApiClient _api;
  final SessionStore _store;

  Future<Sesi> login(String username, String password, {String? perangkat, bool gpsPalsu = false}) async {
    final d = await _api.call('login', data: {
      'username': username.trim().toLowerCase(),
      'password': password, // tidak di-trim
      'installId': await _store.installId(),
      if (perangkat != null && perangkat.isNotEmpty) 'perangkat': perangkat,
      'gpsPalsu': gpsPalsu,
    });
    final s = Sesi.dariLogin(d);
    await _store.simpan(s);
    return s;
  }

  /// Lapor percobaan login dengan lokasi palsu ke server (dicatat LOGIN_GPS_PALSU, server menjawab GPS_PALSU).
  /// Gagal kirim (offline) diabaikan: login tetap ditolak di HP.
  Future<void> laporGpsPalsu(String username) async {
    try {
      await _api.call('login', data: {
        'username': username.trim().toLowerCase(),
        'password': '-',
        'installId': await _store.installId(),
        'gpsPalsu': true,
      });
    } catch (_) {
      // diharapkan ApiException(GPS_PALSU) / offline
    }
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

  /// Paksa keluar karena lokasi palsu terdeteksi saat sesi aktif (v0.39). Tidak ditahan outbox (beda dengan
  /// logout biasa): token dicabut di server (dicatat LOGOUT_GPS_PALSU) dan dihapus di HP; outbox tetap.
  Future<void> paksaKeluarGpsPalsu(Sesi s) async {
    try {
      await _api.call('logout', token: s.token, data: {'alasan': 'GPS_PALSU'});
    } catch (_) {
      // offline: token lokal tetap dihapus; token server habis sendiri / dicabut saat login ulang di HP ini
    } finally {
      await _store.hapus();
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
