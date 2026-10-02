import 'package:flutter/material.dart';

import 'core/deps.dart';
import 'core/env.dart';
import 'core/sesi.dart';
import 'features/auth/login_page.dart';
import 'features/home/home_page.dart';

/// Gerbang app (PRD 5. Alur Aplikasi):
/// belum ada sesi -> login (Alur B); ada sesi -> beranda, cekSesi dicoba di beranda (Alur A).
class SisiApp extends StatefulWidget {
  const SisiApp({super.key, required this.deps});
  final Deps deps;

  @override
  State<SisiApp> createState() => _SisiAppState();
}

class _SisiAppState extends State<SisiApp> {
  Sesi? _sesi;
  bool _siap = false;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  Future<void> _muat() async {
    final s = await widget.deps.sessionStore.baca();
    if (!mounted) return;
    setState(() {
      _sesi = s;
      _siap = true;
    });
  }

  void _gantiSesi(Sesi? s) => setState(() => _sesi = s);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: Env.isStaging ? 'SiSi ROW STG' : 'SiSi ROW',
      debugShowCheckedModeBanner: Env.isStaging,
      theme: ThemeData(
        colorSchemeSeed: Env.isStaging ? Colors.orange : Colors.blue,
        useMaterial3: true,
      ),
      home: !_siap
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : _sesi == null
              ? LoginPage(deps: widget.deps, onMasuk: _gantiSesi)
              : HomePage(deps: widget.deps, sesi: _sesi!, onSesiBerubah: _gantiSesi),
    );
  }
}
