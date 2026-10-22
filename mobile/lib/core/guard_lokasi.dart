import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';

import '../features/auth/auth_repository.dart';
import 'gps.dart';
import 'sesi.dart';

/// Guard fake GPS selama sesi aktif (v0.39, keputusan 4 Okt 2026): lokasi palsu terdeteksi = paksa logout
/// + kartu notifikasi. Dicek saat sesi dimulai, saat app kembali dibuka (resume), dan tiap 2 menit selama app
/// terbuka di depan. GPS mati / izin tidak ada = tidak bisa dicek, dilewati (tidak memunculkan popup izin);
/// login berikutnya tetap dijaga CekLokasi (fail closed).
/// Paksa logout = seperti sesi habis (Alur D): token dicabut di server + dihapus di HP, outbox TIDAK disentuh,
/// jadi data yang belum terkirim tetap aman dan terkirim setelah login ulang tanpa GPS palsu.
class GuardLokasi with WidgetsBindingObserver {
  GuardLokasi(this._auth);

  static const Duration jeda = Duration(minutes: 2);

  final AuthRepository _auth;
  Sesi? _sesi;
  Timer? _timer;
  bool _sedangCek = false;
  bool _diDepan = true;
  bool _observer = false;

  /// Dipanggil setelah sesi dipaksa keluar (app pindah ke login + tampilkan kartu).
  Future<void> Function()? onPalsu;

  void mulai(Sesi s) {
    _sesi = s;
    _timer?.cancel();
    _timer = Timer.periodic(jeda, (_) => periksa());
    if (!_observer) {
      WidgetsBinding.instance.addObserver(this);
      _observer = true;
    }
    periksa();
  }

  void gantiSesi(Sesi s) => _sesi = s;

  void berhenti() {
    _timer?.cancel();
    _timer = null;
    _sesi = null;
    if (_observer) {
      WidgetsBinding.instance.removeObserver(this);
      _observer = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _diDepan = state == AppLifecycleState.resumed;
    if (_diDepan) periksa();
  }

  Future<void> periksa() async {
    final awal = _sesi;
    if (awal == null || _sedangCek || !_diDepan) return;
    _sedangCek = true;
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return;
      final izin = await Geolocator.checkPermission();
      if (izin != LocationPermission.always && izin != LocationPermission.whileInUse) return;
      final pos = await Gps.sampelPertama(batas: const Duration(seconds: 20));
      // v0.62.5: cek GPS bisa makan 20 detik. Sesi sudah berganti (logout / akun lain) = hasil ini bukan miliknya.
      if (pos != null && pos.isMocked && _sesi?.token == awal.token) await _paksaKeluar();
    } catch (_) {
      // gagal baca lokasi: coba lagi di putaran berikutnya
    } finally {
      _sedangCek = false;
    }
  }

  Future<void> _paksaKeluar() async {
    final s = _sesi;
    if (s == null) return;
    berhenti();
    await _auth.paksaKeluarGpsPalsu(s);
    await onPalsu?.call();
  }
}
