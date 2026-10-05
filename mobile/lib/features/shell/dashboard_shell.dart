import 'package:flutter/material.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../home/beranda_screen.dart';
import '../operasi/operasi_screen.dart';
import '../row/laporan_row_screen.dart';
import '../settings/pengaturan_screen.dart';

/// Kerangka dashboard (desain lama): latar bg-sisi.png 50%, bottom bar putih dengan gelembung navy.
/// PETUGAS: Laporan · Beranda · Pengaturan. ADMIN / SUPER / ADMIN_ES (v0.50): Operasi · Beranda · Pengaturan.
class DashboardShell extends StatefulWidget {
  const DashboardShell({super.key, required this.deps, required this.sesi, required this.onSesiBerubah});
  final Deps deps;
  final Sesi sesi;
  final void Function(Sesi?) onSesiBerubah;

  @override
  State<DashboardShell> createState() => _DashboardShellState();
}

class _DashboardShellState extends State<DashboardShell> {
  int _tab = 1; // Beranda

  @override
  void initState() {
    super.initState();
    _segarkanSesi();
  }

  /// Alur A: saat app dibuka & online -> cekSesi + getMaster + sync (tanpa menahan layar).
  Future<void> _segarkanSesi() async {
    try {
      final baru = await widget.deps.auth.cekSesi(widget.sesi);
      widget.onSesiBerubah(baru);
      await widget.deps.master.segarkan(baru);
    } catch (_) {
      // offline atau sesi habis: SyncController yang menangani sesi habis
    }
    await widget.deps.syncCtl.sinkron();
  }

  void _keTab(int i) => setState(() => _tab = i);

  @override
  Widget build(BuildContext context) {
    final halaman = [
      if (widget.sesi.modeAdmin) OperasiScreen(deps: widget.deps, sesi: widget.sesi) else LaporanRowScreen(deps: widget.deps, sesi: widget.sesi),
      BerandaScreen(deps: widget.deps, sesi: widget.sesi, keLaporan: () => _keTab(0)),
      PengaturanScreen(deps: widget.deps, sesi: widget.sesi, onLogout: () => widget.onSesiBerubah(null)),
    ];
    return PopScope(
      canPop: _tab == 1,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _keTab(1);
      },
      child: Scaffold(
        backgroundColor: Colors.transparent,
        extendBody: true,
        body: Container(
          decoration: const BoxDecoration(
            color: AppColors.neutral100,
            image: DecorationImage(image: AssetImage('assets/images/bg-sisi.png'), fit: BoxFit.cover, opacity: .5),
          ),
          child: IndexedStack(index: _tab, children: halaman),
        ),
        bottomNavigationBar: _SisiBottomBar(
          indeks: _tab,
          onPilih: _keTab,
          pertama: widget.sesi.modeAdmin ? const _ItemNav('Operasi', Icons.dashboard_customize_outlined) : const _ItemNav('Laporan', Icons.assignment_outlined),
        ),
      ),
    );
  }
}

class _ItemNav {
  const _ItemNav(this.label, this.ikon);
  final String label;
  final IconData ikon;
}

/// Bottom bar lama: tinggi 80, putih, garis navy 3px dengan lekukan, gelembung navy berbingkai cyan.
class _SisiBottomBar extends StatelessWidget {
  const _SisiBottomBar({required this.indeks, required this.onPilih, required this.pertama});
  final int indeks;
  final ValueChanged<int> onPilih;
  final _ItemNav pertama; // Laporan (PETUGAS) atau Operasi (admin, v0.50)

  List<_ItemNav> get _item => [
        pertama,
        const _ItemNav('Beranda', Icons.home_rounded),
        const _ItemNav('Pengaturan', Icons.settings_outlined),
      ];

  @override
  Widget build(BuildContext context) {
    // Area gesture/tombol sistem di bawah bar ikut putih, supaya isi layar tidak terlihat di bawahnya.
    final bawah = MediaQuery.paddingOf(context).bottom;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      SizedBox(
        height: 80,
        child: LayoutBuilder(builder: (context, c) {
          final lebarItem = c.maxWidth / _item.length;
          final besar = indeks == 1;
          final ukuranBubble = besar ? 64.0 : 52.0;
          // Gelembung & lekukan sepusat (pusat y = _LatarBar.pusatY), dengan celah supaya
          // bingkai cyan + bayangan tidak menempel ke garis navy.
          final rLekuk = ukuranBubble / 2 + _LatarBar.celah;
          return TweenAnimationBuilder<double>(
            tween: Tween(end: lebarItem * indeks + lebarItem / 2),
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOutCubic,
            builder: (context, cx, _) => Stack(clipBehavior: Clip.none, children: [
              Positioned.fill(child: CustomPaint(painter: _LatarBar(cx: cx, r: rLekuk))),
              for (var i = 0; i < _item.length; i++)
                Positioned(
                  left: lebarItem * i,
                  width: lebarItem,
                  top: 0,
                  bottom: 0,
                  child: InkWell(
                    onTap: () => onPilih(i),
                    child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                      if (i != indeks) Icon(_item[i].ikon, size: 22, color: AppColors.navy700.withValues(alpha: .6)),
                      const SizedBox(height: 4),
                      Text(
                        _item[i].label,
                        style: i == indeks
                            ? const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.cyan600)
                            : const TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: AppColors.neutral500),
                      ),
                      const SizedBox(height: 10),
                    ]),
                  ),
                ),
              Positioned(
                left: cx - ukuranBubble / 2,
                top: _LatarBar.pusatY - ukuranBubble / 2,
                child: IgnorePointer(
                  child: Container(
                    width: ukuranBubble,
                    height: ukuranBubble,
                    decoration: BoxDecoration(
                      color: AppColors.navy700,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.cyan600, width: 2),
                      boxShadow: [BoxShadow(color: AppColors.navy700.withValues(alpha: .30), blurRadius: 8, offset: const Offset(0, 2))],
                    ),
                    child: Icon(_item[indeks].ikon, color: Colors.white, size: besar ? 39 : 30),
                  ),
                ),
              ),
            ]),
          );
        }),
      ),
      Container(height: bawah, color: Colors.white),
    ]);
  }
}

class _LatarBar extends CustomPainter {
  _LatarBar({required this.cx, required this.r});
  final double cx;
  final double r;

  /// Pusat lekukan (dan gelembung) dari tepi atas bar.
  static const double pusatY = 4;

  /// Jarak bingkai gelembung ke garis lekukan (px). Garis 3 px, jadi celah bersih ~6.5 px.
  static const double celah = 8;

  Path _atas(Size s) => Path()
    ..moveTo(0, 0)
    ..lineTo(cx - r - 10, 0)
    ..quadraticBezierTo(cx - r, 0, cx - r, pusatY)
    ..arcToPoint(Offset(cx + r, pusatY), radius: Radius.circular(r), clockwise: false)
    ..quadraticBezierTo(cx + r, 0, cx + r + 10, 0)
    ..lineTo(s.width, 0);

  @override
  void paint(Canvas canvas, Size size) {
    final isi = _atas(size)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawShadow(isi, AppColors.navy900, 6, false);
    canvas.drawPath(isi, Paint()..color = Colors.white);
    canvas.drawPath(
      _atas(size),
      Paint()
        ..color = AppColors.navy700
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );
  }

  @override
  bool shouldRepaint(_LatarBar old) => old.cx != cx || old.r != r;
}
