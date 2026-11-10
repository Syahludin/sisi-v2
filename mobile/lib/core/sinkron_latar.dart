import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/widgets.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';

import 'sesi.dart';
import 'sync_controller.dart';

/// v1.0.12 (permintaan Master Guswan 21 Okt 2026): sinkron tetap berjalan saat app TIDAK ditutup tetapi sedang di latar
/// belakang (pindah ke WhatsApp, kamera, dsb).
///
/// Masalahnya: Android 12+ membekukan proses app yang tidak terlihat (cached app freezer, Doze, penghemat baterai
/// pabrikan seperti MIUI / ColorOS / FuntouchOS). Timer Dart 5 menit di SyncController ikut berhenti, jadi data baru
/// terkirim setelah app dibuka lagi. Solusi:
///  1. Selama masih ada data yang belum terkirim, app menyalakan layanan latar (Android foreground service jenis
///     dataSync) dengan notifikasi "SiSi Sedang Proses Sinkron Data" (v1.0.17). Proses app tidak dibekukan selama layanan hidup.
///  2. Layanan mengirim denyut tiap 60 detik ke app; app menjalankan cek online + sinkron (antrean ROW / Hartek /
///     Inspeksi Jaringan / Inspeksi Gardu / P0 Yandal, semuanya lewat SyncController.sinkron).
///  3. Antrean kosong = layanan berhenti sendiri, notifikasi hilang.
///  4. App pindah ke latar = langsung sinkron sekali; kembali ke depan = sinkron lagi.
///  5. Sekali per jalan app, minta izin "abaikan optimasi baterai" (supaya layanan boleh dimulai dari latar dan tidak
///     dimatikan penghemat baterai) dan izin notifikasi (Android 13+).
/// Semua panggilan plugin dibungkus try: gagal (iOS, test, plugin belum terpasang) = kembali ke perilaku lama.
class SinkronLatar with WidgetsBindingObserver {
  SinkronLatar(this._sync);

  final SyncController _sync;
  Sesi? _sesi;
  bool _aktif = false;
  bool _layanan = false;
  bool _sedangAtur = false;
  bool _sudahMintaIzin = false;
  int _terakhir = -1;

  static const _idLayanan = 4117;
  static const jedaDenyut = 60000; // ms

  static bool get _android {
    try {
      return Platform.isAndroid;
    } catch (_) {
      return false;
    }
  }

  /// Dipanggil sekali di main() sebelum runApp.
  static void siapkan() {
    if (!_android) return;
    try {
      FlutterForegroundTask.initCommunicationPort();
      FlutterForegroundTask.init(
        androidNotificationOptions: AndroidNotificationOptions(
          channelId: 'sisi_sinkron',
          channelName: 'Sinkron data SiSi',
          channelDescription: 'Tampil selama ada data yang belum terkirim ke server',
          channelImportance: NotificationChannelImportance.LOW,
          priority: NotificationPriority.LOW,
          onlyAlertOnce: true,
        ),
        iosNotificationOptions: const IOSNotificationOptions(showNotification: false, playSound: false),
        foregroundTaskOptions: ForegroundTaskOptions(
          eventAction: ForegroundTaskEventAction.repeat(jedaDenyut),
          autoRunOnBoot: false,
          autoRunOnMyPackageReplaced: false,
          allowWakeLock: true,
          allowWifiLock: true,
        ),
      );
    } catch (_) {
      // plugin tidak tersedia: sinkron hanya saat app di depan (perilaku lama)
    }
  }

  /// Sesi petugas dimulai (admin tidak punya antrean HP).
  void mulai(Sesi s) {
    _sesi = s;
    if (s.modeAdmin || !_android) return;
    if (!_aktif) {
      _aktif = true;
      WidgetsBinding.instance.addObserver(this);
      _sync.addListener(_berubah);
      try {
        FlutterForegroundTask.addTaskDataCallback(_denyut);
      } catch (_) {}
    }
    _berubah();
  }

  void gantiSesi(Sesi s) => _sesi = s;

  Future<void> berhenti() async {
    _sesi = null;
    if (_aktif) {
      _aktif = false;
      WidgetsBinding.instance.removeObserver(this);
      _sync.removeListener(_berubah);
      try {
        FlutterForegroundTask.removeTaskDataCallback(_denyut);
      } catch (_) {}
    }
    await _matikan();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_sesi == null) return;
    if (state == AppLifecycleState.resumed) {
      unawaited(_sync.cekOnline());
      unawaited(_sync.sinkron());
    } else if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      // kirim sekarang selagi proses masih aktif, lalu pastikan layanan latar hidup kalau masih ada antrean
      unawaited(_sync.sinkron());
      _berubah();
    }
  }

  /// Denyut dari layanan latar (isolate layanan -> app).
  void _denyut(Object data) {
    if (_sesi == null) return;
    unawaited(_sync.cekOnline());
    if (_sync.belumTerkirim > 0) unawaited(_sync.sinkron());
  }

  /// Hitungan antrean berubah: nyalakan / perbarui / matikan layanan.
  void _berubah() {
    if (!_aktif || _sesi == null) return;
    final n = _sync.belumTerkirim;
    if (n > 0) {
      unawaited(_nyalakan(n));
    } else if (!_sync.sedangSync) {
      unawaited(_matikan());
    }
  }

  Future<void> _nyalakan(int n) async {
    if (_sedangAtur) return;
    _sedangAtur = true;
    try {
      // v1.0.17: teks notifikasi baru (permintaan Master Guswan 22 Okt 2026)
      final judul = teksNotifSinkron.judul;
      final teks = teksNotifSinkron.isi(n);
      if (!_sudahMintaIzin) {
        _sudahMintaIzin = true;
        await _mintaIzin();
      }
      if (_layanan && await FlutterForegroundTask.isRunningService) {
        if (n != _terakhir) await FlutterForegroundTask.updateService(notificationTitle: judul, notificationText: teks);
      } else {
        await FlutterForegroundTask.startService(
          serviceId: _idLayanan,
          notificationTitle: judul,
          notificationText: teks,
          callback: mulaiLayananSinkron,
        );
        _layanan = true;
      }
      _terakhir = n;
    } catch (_) {
      // Android menolak (mis. dimulai dari latar tanpa izin baterai): dicoba lagi saat app kembali ke depan
      _layanan = false;
    } finally {
      _sedangAtur = false;
    }
  }

  Future<void> _matikan() async {
    if (!_layanan) return;
    try {
      await FlutterForegroundTask.stopService();
    } catch (_) {}
    _layanan = false;
    _terakhir = -1;
  }

  Future<void> _mintaIzin() async {
    try {
      final izin = await FlutterForegroundTask.checkNotificationPermission();
      if (izin != NotificationPermission.granted) await FlutterForegroundTask.requestNotificationPermission();
    } catch (_) {}
    try {
      if (!await FlutterForegroundTask.isIgnoringBatteryOptimizations) {
        await FlutterForegroundTask.requestIgnoreBatteryOptimization();
      }
    } catch (_) {}
  }
}

/// v1.0.17: teks notifikasi layanan sinkron latar (dipakai juga test).
const teksNotifSinkron = (judul: 'SiSi Sedang Proses Sinkron Data', isi: _isiNotifSinkron);

String _isiNotifSinkron(int n) => '$n Data Sedang Proses Sinkron';

/// Titik masuk layanan latar (isolate terpisah). Hanya mengirim denyut; sinkron dikerjakan app (isolate utama)
/// supaya memakai database, sesi, dan antrean yang sama.
@pragma('vm:entry-point')
void mulaiLayananSinkron() {
  FlutterForegroundTask.setTaskHandler(_DenyutSinkron());
}

class _DenyutSinkron extends TaskHandler {
  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {
    FlutterForegroundTask.sendDataToMain('sinkron');
  }

  @override
  void onRepeatEvent(DateTime timestamp) {
    FlutterForegroundTask.sendDataToMain('sinkron');
  }

  @override
  Future<void> onDestroy(DateTime timestamp) async {}
}
