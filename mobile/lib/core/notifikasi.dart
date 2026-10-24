import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_client.dart';
import 'lonceng.dart';
import 'notifikasi_aturan.dart';
import 'sesi.dart';

/// v0.83.0: notifikasi push FCM (pengingat login Yandal + peringatan admin).
/// Tanpa google-services.json (Firebase belum disiapkan) = mati diam-diam, app tetap jalan normal.
/// Notifikasi saat app tertutup / di latar belakang ditampilkan sistem Android. Saat app terbuka diteruskan ke
/// [onPesanDepan] (banner di dalam app).
/// v1.0.29: notifikasi diketuk (app di latar / tertutup) = layar tujuannya dibuka lewat lonceng (WO, temuan, P0).
/// Kanal Android dibuat MainActivity.kt (sisi_pengingat, sisi_wo, sisi_ringkasan).
class Notifikasi {
  Notifikasi(this._api, {FlutterSecureStorage? storage}) : _storage = storage ?? const FlutterSecureStorage();

  final ApiClient _api;
  final FlutterSecureStorage _storage;
  static const _kunci = 'sisi_notif_terdaftar';

  bool _aktif = false;
  bool get aktif => _aktif;
  Sesi? _sesi;
  Future<void> _antre = Future<void>.value();

  void Function(String judul, String isi)? onPesanDepan;

  Future<void> siapkan() async {
    try {
      await Firebase.initializeApp();
      _aktif = true;
    } catch (_) {
      _aktif = false; // Firebase belum dipasang di build ini
      return;
    }
    FirebaseMessaging.onMessage.listen((m) {
      final n = m.notification;
      if (n != null) onPesanDepan?.call(n.title ?? 'SiSi', n.body ?? '');
    });
    FirebaseMessaging.instance.onTokenRefresh.listen((t) {
      final s = _sesi;
      if (s != null) _jalankan(() => _daftar(s, t));
    });
    FirebaseMessaging.onMessageOpenedApp.listen((m) => _ketuk(m.data));
    unawaited(FirebaseMessaging.instance.getInitialMessage().then((m) {
      if (m != null) _ketuk(m.data); // app dibuka dari notifikasi saat tertutup
    }).catchError((Object _) {}));
  }

  void _ketuk(Map<String, dynamic> data) {
    final x = itemLoncengDariPush(data);
    if (x != null) Lonceng.i.bukaNanti(x);
  }

  /// Dipanggil tiap sesi berganti / app dibuka lagi. Akun yang tidak menerima notifikasi = tidak mendaftar.
  void untukSesi(Sesi? s) {
    final lama = _sesi;
    _sesi = s;
    // v1.0.29: logout akun selain YANDAL = server mematikan token HP ini, jadi login berikutnya wajib daftar ulang
    if (s == null && lama != null && !lama.petugasYandal) _jalankan(() => _storage.delete(key: _kunci));
    if (!_aktif || s == null || !perluNotifikasi(s)) return;
    _jalankan(() async {
      await FirebaseMessaging.instance.requestPermission();
      final t = await FirebaseMessaging.instance.getToken();
      if (t != null && t.isNotEmpty) await _daftar(s, t);
    });
  }

  void _jalankan(Future<void> Function() kerja) {
    _antre = _antre.then((_) async {
      try {
        await kerja();
      } catch (_) {
        // izin ditolak / offline / Google Play Services tidak ada: dicoba lagi saat app dibuka berikutnya
      }
    });
  }

  Future<void> _daftar(Sesi s, String token) async {
    if (_sesi?.token != s.token) return; // sesi sudah berganti
    final catatan = await _storage.read(key: _kunci);
    final sekarang = DateTime.now();
    if (!perluDaftarNotif(catatan, s.userId, token, sekarang)) return;
    try {
      await _api.call('daftarNotif', token: s.token, data: {'fcmToken': token});
      await _storage.write(key: _kunci, value: catatanDaftarNotif(s.userId, token, sekarang));
    } on ApiException {
      // sesi habis / offline: dicoba lagi nanti
    }
  }
}
