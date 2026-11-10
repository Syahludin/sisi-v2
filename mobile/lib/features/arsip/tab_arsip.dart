import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../widgets/sisi_widgets.dart';
import '../row/laporan_row_screen.dart';
import '../yandal/arsip_p0_view.dart';
import 'arsip_tim.dart';
import 'arsip_tim_view.dart';

/// v1.0.19 (permintaan Master Guswan 23 Okt 2026): tab Arsip di bottom bar tim tindak lanjut (ROW / HARTEK / YANDAL), supaya
/// bottom bar berisi 5 menu dan Beranda tepat di tengah: Laporan · WO · Beranda · Arsip · Pengaturan.
/// Isi = arsip yang dulu ada di dalam menu Laporan / Shift (ROW = arsip laporan, Hartek = arsip Hartek, Yandal = Arsip P0).
class TabArsipTim extends StatefulWidget {
  const TabArsipTim({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  /// Tim yang memakai tab Arsip sendiri (selain itu arsip tetap di dalam menu Laporan).
  static bool untuk(Sesi s) => s.petugasWo && (s.petugasYandal || s.petugasHartek || s.aksiMenu('ROW_EKSEKUSI') != null);

  @override
  State<TabArsipTim> createState() => _TabArsipTimState();
}

class _TabArsipTimState extends State<TabArsipTim> {
  final _row = GlobalKey<ArsipViewState>();
  final _p0 = GlobalKey<ArsipP0ViewState>();
  bool _sibuk = false;

  Future<void> _segarkan() async {
    if (_sibuk) return;
    setState(() => _sibuk = true);
    try {
      await (_row.currentState?.segarkan() ?? _p0.currentState?.segarkan() ?? Future.value());
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.sesi;
    // Hartek: ArsipTimView punya header + tarik-untuk-segarkan sendiri
    if (s.petugasHartek) return SafeArea(bottom: false, child: ArsipTimView(deps: widget.deps, sesi: s, modul: ModulArsipTim.hartek));
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: sisiAppBar(s.petugasYandal ? 'Arsip P0' : 'Arsip Laporan', subjudul: '${s.timNama} • ULP ${s.ulp}', actions: [
        TombolSegarkan(sibuk: _sibuk, onPressed: _segarkan),
      ]),
      body: s.petugasYandal ? ArsipP0View(key: _p0, deps: widget.deps, sesi: s) : ArsipView(key: _row, deps: widget.deps, sesi: s),
    );
  }
}
