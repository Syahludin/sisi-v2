import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/cek_versi.dart';
import 'core/deps.dart';
import 'core/env.dart';
import 'core/sesi.dart';
import 'core/versi.dart';
import 'features/auth/login_screen.dart';
import 'features/shell/dashboard_shell.dart';
import 'features/yandal/sync_akhir_shift_screen.dart';
import 'theme/app_colors.dart';
import 'theme/app_theme.dart';
import 'widgets/mock_gps_warning_dialog.dart';
import 'widgets/sisi_brand.dart';
import 'widgets/sisi_loader.dart';

/// Gerbang app (PRD 5. Alur Aplikasi): belum ada sesi -> login (Alur B); ada sesi -> dashboard (Alur A).
class SisiApp extends StatefulWidget {
  const SisiApp({super.key, required this.deps});
  final Deps deps;

  @override
  State<SisiApp> createState() => _SisiAppState();
}

class _SisiAppState extends State<SisiApp> with WidgetsBindingObserver {
  final _navigator = GlobalKey<NavigatorState>();
  final _pesan = GlobalKey<ScaffoldMessengerState>(); // v0.83.0: notifikasi saat app terbuka
  Sesi? _sesi;
  bool _siap = false;
  Timer? _timerShift; // v0.63.0: paksa logout akun YANDAL di akhir shift
  bool _syncAkhir = false; // v0.63.4: shift selesai, data tertunda sedang dikirim (dashboard ditutup)
  late final PemeriksaVersi _versi = PemeriksaVersi(widget.deps.api, () => _navigator.currentContext); // v0.81.0

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.deps.syncCtl.onSesiHabis = _sesiBerakhir;
    widget.deps.api.onSesiHabis = (kode, token) => _sesiBerakhir(token: token, kode: kode); // v0.62.4: admin & semua layar
    widget.deps.guardLokasi.onPalsu = _keluarGpsPalsu;
    // v0.81.0: backend baru di-deploy saat app terbuka = langsung cek update
    widget.deps.api.onVersiServer = (v) {
      if (bandingVersi(v, versiApp) != 0) unawaited(_versi.cek(paksa: true));
    };
    PemeriksaVersi.aktif = _versi;
    widget.deps.notif.onPesanDepan = _tampilkanNotif; // v0.83.0
    _muat();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timerShift?.cancel();
    super.dispose();
  }

  /// v0.63.0: timer bisa tertunda saat app di latar belakang, jadi dicek lagi tiap app dibuka.
  /// v0.64.2: jam terpercaya dibaca ulang dulu (jam monoton ikut berjalan saat layar mati).
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_cekShift());
      unawaited(_versi.cek()); // v0.81.0 (jeda 15 menit)
      widget.deps.notif.untukSesi(_sesi); // v0.83.0: token FCM bisa berubah
    }
  }

  DateTime get _jam => widget.deps.jam.sekarang();

  /// v0.83.0: notifikasi push yang masuk saat app sedang dibuka (di latar belakang ditampilkan Android).
  void _tampilkanNotif(String judul, String isi) {
    _pesan.currentState?.showSnackBar(SnackBar(
      behavior: SnackBarBehavior.floating,
      duration: const Duration(seconds: 10),
      content: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Padding(padding: EdgeInsets.only(top: 2, right: 10), child: Icon(Icons.notifications_active_rounded, color: Colors.white)),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text(judul, style: const TextStyle(fontWeight: FontWeight.w700)),
            if (isi.isNotEmpty) Text(isi),
          ]),
        ),
      ]),
      action: SnackBarAction(label: 'Tutup', textColor: Colors.white, onPressed: () {}),
    ));
  }

  Future<void> _cekShift() async {
    final s = _sesi;
    if (s == null || s.sesiSampai == null || _syncAkhir) return;
    await widget.deps.jam.segarkan();
    if (_sesi?.token == s.token && !_syncAkhir && s.habisShift(_jam)) await _keluarShift(s);
  }

  /// v0.64.2: dicek berkala (30 detik) memakai jam terpercaya, bukan satu timer sesuai jam HP:
  /// memundurkan jam HP tidak memperpanjang shift.
  void _jadwalShift(Sesi? s) {
    _timerShift?.cancel();
    _timerShift = null;
    if (s == null || s.sesiSampai == null) return;
    _timerShift = Timer.periodic(const Duration(seconds: 30), (_) => unawaited(_cekShift()));
    if (s.habisShift(_jam)) unawaited(_keluarShift(s));
  }

  /// v0.63.0: akhir shift (07:59 / 15:59 / 23:59 WIB, jam HP, juga offline): tutup semua layar, kartu info.
  /// Form yang belum disimpan ikut tertutup (belum disimpan = belum fix). Outbox TIDAK disentuh (Alur D).
  /// v0.63.4 (keputusan kvlar 8 Okt 2026): masih ada data tertunda = TIDAK langsung keluar. Dashboard diganti
  /// gerbang sync (tidak bisa input / buat P0), semua data dikirim dulu, baru logout otomatis.
  Future<void> _keluarShift(Sesi s) async {
    if (_sesi?.token != s.token || _syncAkhir) return;
    _navigator.currentState?.popUntil((r) => r.isFirst);
    if (s.bolehSyncAkhir(_jam) && await widget.deps.syncCtl.jumlahTertunda(s) > 0) {
      if (_sesi?.token != s.token) return;
      _timerShift?.cancel();
      setState(() => _syncAkhir = true);
      return;
    }
    await _akhiriShift(s, tertinggal: false);
  }

  /// v0.63.4: keluar akhir shift (logout AKHIR_SHIFT ke server kalau ada sinyal, token HP dihapus), lalu kartu info.
  Future<void> _akhiriShift(Sesi s, {required bool tertinggal}) async {
    if (_sesi?.token != s.token) return;
    _mengakhiri = true; // jawaban SHIFT_BERAKHIR dari panggilan logout tidak memicu keluar kedua kali
    try {
      _navigator.currentState?.popUntil((r) => r.isFirst);
      await widget.deps.auth.keluarAkhirShift(s);
      if (_sesi?.token != s.token) return;
      await _gantiSesi(null);
    } finally {
      _mengakhiri = false;
    }
    _kartuShiftBerakhir(tertinggal: tertinggal);
  }

  void _kartuShiftBerakhir({bool tertinggal = true}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final c = _navigator.currentContext;
      if (c == null) return;
      unawaited(showDialog<void>(
        context: c,
        builder: (d) => AlertDialog(
          icon: const Icon(Icons.schedule_rounded, color: AppColors.navy700, size: 36),
          title: const Text('Shift berakhir'),
          content: Text(tertinggal
              ? 'Jam kerja shift ini sudah selesai, akun otomatis keluar. Data yang belum terkirim tetap aman '
                  'di HP dan dikirim setelah login lagi.\n\nLogin lagi mulai jam 08:00, 16:00, atau 00:00.'
              : 'Jam kerja shift ini sudah selesai dan semua data sudah terkirim. Akun otomatis keluar.'
                  '\n\nLogin lagi mulai jam 08:00, 16:00, atau 00:00.'),
          actions: [FilledButton(onPressed: () => Navigator.pop(d), child: const Text('Mengerti'))],
        ),
      ));
    });
  }

  /// Lokasi palsu terdeteksi saat sesi aktif (v0.39): kembali ke login lalu tampilkan kartu notifikasi.
  Future<void> _keluarGpsPalsu() async {
    _navigator.currentState?.popUntil((r) => r.isFirst); // tutup layar detail/form yang sedang terbuka
    await _gantiSesi(null);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final c = _navigator.currentContext;
      if (c != null) tampilkanLogoutGpsPalsu(c);
    });
  }

  /// Sesi habis dari mana pun (v0.62.4): tutup layar yang terbuka lalu ke login. Outbox tidak disentuh (Alur D).
  /// Bisa terpanggil beberapa kali (sync + layar sekaligus): yang kedua diabaikan.
  /// v0.62.5: penanda dipasang langsung (bukan di microtask), jadi sync + layar yang sama-sama dapat sesi habis
  /// hanya mengakhiri sesi sekali, dan sesi baru hasil login tidak ikut terhapus oleh panggilan yang terlambat.
  bool _mengakhiri = false;

  void _sesiBerakhir({String? token, String? kode}) {
    final s = _sesi;
    if (s == null || _mengakhiri) return;
    if (token != null && token != s.token) return; // v0.62.6: jawaban dari sesi lama, dicek SEBELUM penanda dipasang
    _mengakhiri = true;
    Future.microtask(() async {
      try {
        if (!identical(_sesi, s) && _sesi?.token != s.token) return; // sudah diganti sesi lain
        _navigator.currentState?.popUntil((r) => r.isFirst);
        await _gantiSesi(null);
        if (kode == 'SHIFT_BERAKHIR') _kartuShiftBerakhir(); // v0.63.0
      } finally {
        _mengakhiri = false;
      }
    });
  }

  Future<void> _muat() async {
    final s = await widget.deps.sessionStore.baca();
    if (!mounted) return;
    await _gantiSesi(s);
    if (mounted) setState(() => _siap = true);
    // v0.81.0: cek update setiap app dibuka (sesudah frame pertama, butuh navigator)
    WidgetsBinding.instance.addPostFrameCallback((_) => unawaited(_versi.cek(paksa: true)));
  }

  Future<void> _gantiSesi(Sesi? baru) async {
    var s = baru;
    var habisShift = false;
    var syncAkhir = false;
    // v0.63.0: sesi YANDAL tersimpan dari shift yang sudah lewat (app dibuka lagi) = langsung keluar.
    // v0.63.4: kecuali masih ada data tertunda dan masih dalam batas mode sync = gerbang sync dulu.
    var tertinggal = false;
    if (s != null && s.habisShift(_jam)) {
      final tertunda = await widget.deps.syncCtl.jumlahTertunda(s);
      if (s.bolehSyncAkhir(_jam) && tertunda > 0) {
        syncAkhir = true;
      } else {
        await widget.deps.auth.keluarAkhirShift(s);
        s = null;
        habisShift = true;
        tertinggal = tertunda > 0;
      }
    }
    if (s == null) {
      widget.deps.syncCtl.berhenti();
      widget.deps.guardLokasi.berhenti();
      unawaited(widget.deps.latar.berhenti()); // v1.0.12
      await widget.deps.sessionStore.hapus(); // outbox TIDAK disentuh (Alur D)
    } else if (_sesi == null || _sesi!.userId != s.userId) {
      widget.deps.syncCtl.mulai(s);
      widget.deps.guardLokasi.mulai(s);
      widget.deps.latar.mulai(s); // v1.0.12: sinkron tetap jalan saat app di latar
    } else {
      widget.deps.syncCtl.gantiSesi(s);
      widget.deps.guardLokasi.gantiSesi(s);
      widget.deps.latar.gantiSesi(s);
    }
    if (mounted) {
      setState(() {
        _sesi = s;
        _syncAkhir = s != null && syncAkhir;
      });
    }
    if (!_syncAkhir) _jadwalShift(s);
    widget.deps.notif.untukSesi(s); // v0.83.0: daftar token FCM (YANDAL + admin)
    if (habisShift) _kartuShiftBerakhir(tertinggal: tertinggal);
  }

  /// v0.63.4: gerbang sync akhir shift (sesi ditangkap di sini, bukan dibaca ulang saat callback jalan).
  Widget _gerbangSync(Sesi s) => SyncAkhirShiftScreen(
        key: ValueKey('sync-akhir-${s.token}'),
        hitung: () => widget.deps.syncCtl.jumlahTertunda(s),
        kirim: widget.deps.syncCtl.sinkron,
        pesan: () => widget.deps.syncCtl.pesan,
        syncSampai: s.syncSampai,
        sekarang: widget.deps.jam.sekarang,
        onSelesai: (tertinggal) => _akhiriShift(s, tertinggal: tertinggal),
        tim: s.timNama,
        kodeShift: '${s.yandal?['kodeShift'] ?? ''}',
        petugas: s.petugasShift,
      );

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: _navigator,
      scaffoldMessengerKey: _pesan,
      title: Env.isStaging ? 'SiSi ULP Toboali STG' : 'SiSi ULP Toboali',
      debugShowCheckedModeBanner: Env.isStaging,
      theme: AppTheme.light,
      locale: const Locale('id', 'ID'),
      supportedLocales: const [Locale('id', 'ID')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: !_siap
          ? const _Splash()
          : _sesi == null
              ? LoginScreen(deps: widget.deps, onMasuk: _gantiSesi)
              : _syncAkhir
                  ? _gerbangSync(_sesi!)
                  : DashboardShell(deps: widget.deps, sesi: _sesi!, onSesiBerubah: _gantiSesi),
    );
  }
}

/// Splash lama: putih, logo, "Menyiapkan sesi...".
class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            SisiBrand(),
            SizedBox(height: 28),
            SisiLoader(ukuran: 24, warna: AppColors.navy700),
            SizedBox(height: 10),
            Text('Menyiapkan sesi...', style: TextStyle(fontSize: 11, color: AppColors.neutral500)),
          ]),
        ),
      ),
    );
  }
}
