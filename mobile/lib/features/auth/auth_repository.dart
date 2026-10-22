import 'dart:async';

import '../../core/api_client.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/session_store.dart';
import '../yandal/yandal_login.dart';

/// v0.63.0: hasil login = sesi langsung, atau akun YANDAL perlu memilih petugas dulu (login 2 tahap).
sealed class HasilLogin {
  const HasilLogin();
}

class LoginSelesai extends HasilLogin {
  const LoginSelesai(this.sesi);
  final Sesi sesi;
}

class LoginPilihPetugas extends HasilLogin {
  const LoginPilihPetugas(this.tiket);
  final TiketYandal tiket;
}

/// Endpoint: login, cekSesi, logout (PRD 6. Endpoint).
class AuthRepository {
  AuthRepository(this._api, this._store);

  final ApiClient _api;
  final SessionStore _store;

  Future<HasilLogin> login(String username, String password, {String? perangkat, bool gpsPalsu = false}) async {
    final d = await _api.call('login', data: {
      'username': username.trim().toLowerCase(),
      'password': password, // tidak di-trim
      'installId': await _store.installId(),
      if (perangkat != null && perangkat.isNotEmpty) 'perangkat': perangkat,
      'gpsPalsu': gpsPalsu,
    });
    if (d['tahap'] == 'PILIH_PETUGAS') return LoginPilihPetugas(TiketYandal.dariJson(d)); // v0.63.0: belum ada token
    final s = Sesi.dariLogin(d);
    await _store.simpan(s);
    return LoginSelesai(s);
  }

  /// v0.63.0: login tahap 2 akun YANDAL. 1-2 petugas sudah dikonfirmasi di HP. Token berlaku sampai akhir shift.
  Future<Sesi> mulaiShiftYandal(TiketYandal t, List<String> petugasIds) async {
    final d = await _api.call('mulaiShiftYandal', data: {
      'tiket': t.tiket,
      'petugasIds': petugasIds,
      'installId': await _store.installId(),
    });
    final s = Sesi.dariLogin(d);
    await _store.simpan(s);
    return s;
  }

  /// v0.63.0: akhir shift akun YANDAL. Token di server sudah habis sendiri (SHIFT_BERAKHIR), jadi cukup hapus di HP
  /// (tanpa jaringan, berlaku juga offline). Outbox TIDAK disentuh (Alur D).
  Future<void> keluarShift(Sesi s) => _store.hapusJikaToken(s.token);

  /// v0.63.4: setelah data shift terkirim (atau tidak ada): token di HP dihapus DULU (layar input langsung tertutup,
  /// tidak menunggu jaringan), lalu logout AKHIR_SHIFT dikirim ke server di belakang (yan_Login). Offline / ditolak
  /// diabaikan: token server habis sendiri. Outbox TIDAK disentuh.
  Future<void> keluarAkhirShift(Sesi s) async {
    await _store.hapusJikaToken(s.token);
    unawaited(_lapor('logout', s.token, {'alasan': 'AKHIR_SHIFT'}));
  }

  Future<void> _lapor(String action, String token, Map<String, dynamic> data) async {
    try {
      await _api.call(action, token: token, data: data, timeout: const Duration(seconds: 20));
    } catch (_) {
      // offline / mode sync sudah habis
    }
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
      // v0.62.5: jawaban cekSesi bisa datang SESUDAH logout / ganti akun. Token di HP sudah lain (atau kosong) =
      // jangan tulis ulang token lama ke penyimpanan.
      if (!await _store.simpanJikaToken(s.token, baru)) throw ApiException(KodeError.sesiBerganti);
      return baru;
    } on ApiException catch (e) {
      if (KodeError.sesiHabis.contains(e.kode)) await _store.hapusJikaToken(s.token); // v0.62.5: jangan hapus token akun baru
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
