import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/deps.dart';
import 'core/env.dart';
import 'core/sesi.dart';
import 'features/auth/login_screen.dart';
import 'features/shell/dashboard_shell.dart';
import 'theme/app_colors.dart';
import 'theme/app_theme.dart';
import 'widgets/mock_gps_warning_dialog.dart';
import 'widgets/sisi_brand.dart';

/// Gerbang app (PRD 5. Alur Aplikasi): belum ada sesi -> login (Alur B); ada sesi -> dashboard (Alur A).
class SisiApp extends StatefulWidget {
  const SisiApp({super.key, required this.deps});
  final Deps deps;

  @override
  State<SisiApp> createState() => _SisiAppState();
}

class _SisiAppState extends State<SisiApp> {
  final _navigator = GlobalKey<NavigatorState>();
  Sesi? _sesi;
  bool _siap = false;

  @override
  void initState() {
    super.initState();
    widget.deps.syncCtl.onSesiHabis = () => _gantiSesi(null);
    widget.deps.guardLokasi.onPalsu = _keluarGpsPalsu;
    _muat();
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

  Future<void> _muat() async {
    final s = await widget.deps.sessionStore.baca();
    if (!mounted) return;
    await _gantiSesi(s);
    if (mounted) setState(() => _siap = true);
  }

  Future<void> _gantiSesi(Sesi? s) async {
    if (s == null) {
      widget.deps.syncCtl.berhenti();
      widget.deps.guardLokasi.berhenti();
      await widget.deps.sessionStore.hapus(); // outbox TIDAK disentuh (Alur D)
    } else if (_sesi == null || _sesi!.userId != s.userId) {
      widget.deps.syncCtl.mulai(s);
      widget.deps.guardLokasi.mulai(s);
    } else {
      widget.deps.syncCtl.gantiSesi(s);
      widget.deps.guardLokasi.gantiSesi(s);
    }
    if (mounted) setState(() => _sesi = s);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: _navigator,
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
            SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.4, color: AppColors.navy700)),
            SizedBox(height: 10),
            Text('Menyiapkan sesi...', style: TextStyle(fontSize: 11, color: AppColors.neutral500)),
          ]),
        ),
      ),
    );
  }
}
