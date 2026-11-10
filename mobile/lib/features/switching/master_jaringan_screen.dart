import 'package:flutter/material.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../tiang/segmen_screen.dart';
import '../tiang/tiang_repository.dart';
import 'jaringan_screen.dart';
import 'switching_repository.dart';
import 'switching_screen.dart';

/// Master Jaringan (menu OPS_MASTER_SWITCHING, ADMIN / SUPER): satu menu, tiga tab: Switching (peta + verifikasi), Jaringan
/// (penyulang + section) dan Segmen. Sebelumnya Master Switching; segmen dulu di menu Verifikasi Tiang.
class MasterJaringanScreen extends StatelessWidget {
  const MasterJaringanScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  @override
  Widget build(BuildContext context) {
    final swc = SwitchingRepository(deps.api), tiang = TiangRepository(deps.api);
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(title: const Text('Master Jaringan'), bottom: const TabBar(tabs: [Tab(text: 'Switching'), Tab(text: 'Jaringan'), Tab(text: 'Segmen')])),
        body: TabBarView(
          physics: const NeverScrollableScrollPhysics(), // geser peta tidak boleh pindah tab
          children: [
            SwitchingScreen(deps: deps, sesi: sesi, repo: swc, embedded: true),
            JaringanScreen(sesi: sesi, repo: swc),
            SegmenScreen(sesi: sesi, repo: tiang, embedded: true),
          ],
        ),
      ),
    );
  }
}
