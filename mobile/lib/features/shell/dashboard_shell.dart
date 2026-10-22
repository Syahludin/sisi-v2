import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../arsip/arsip_tim.dart';
import '../arsip/arsip_tim_view.dart';
import '../hartek/hartek_screen.dart';
import '../kalender/kalender_tim_screen.dart';
import '../home/beranda_screen.dart';
import '../insdu/insdu_screen.dart';
import '../insjar/insjar_screen.dart';
import '../operasi/operasi_screen.dart';
import '../row/laporan_row_screen.dart';
import '../settings/pengaturan_screen.dart';
import '../wo/wo_tim_screen.dart';
import '../yandal/shift_yandal_screen.dart';

/// Kerangka dashboard (desain lama): latar bg-sisi.png 50%, bottom bar putih dengan gelembung navy.
/// PETUGAS: Laporan · Beranda · Pengaturan. ADMIN / SUPER / ADMIN_ES (v0.50): Operasi · Beranda · Pengaturan.
/// v1.0.11: tim ROW / HARTEK / YANDAL ber-menu OPS_WO_TIM: Laporan · Beranda · WO · Pengaturan; tim Inspeksi Gardu = tab Inspeksi Gardu.
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
      if (!mounted) return; // v0.62.5: sudah logout / ganti akun selama cekSesi berjalan
      widget.onSesiBerubah(baru);
      await widget.deps.master.segarkan(baru);
    } on ApiException catch (e) {
      if (e.kode == KodeError.sesiBerganti) return; // v0.62.5: sesi ini sudah bukan sesi aktif, jangan sync
      // offline atau sesi habis: SyncController / ApiClient yang menangani sesi habis
    } catch (_) {
      // offline (timeout / soket)
    }
    if (!mounted) return;
    await widget.deps.syncCtl.sinkron();
  }

  void _keTab(int i) => setState(() => _tab = i);

  @override
  Widget build(BuildContext context) {
    final halaman = [
      if (widget.sesi.modeAdmin)
        OperasiScreen(deps: widget.deps, sesi: widget.sesi)
      else if (widget.sesi.petugasYandal)
        ShiftYandalScreen(deps: widget.deps, sesi: widget.sesi) // v0.63.0; v1.0.16: TO P0 = tab WO di bottom bar
      // v1.0.17: Hartek / Inspeksi Jaringan / Inspeksi Gardu = pil "Hari ini | Arsip" (pola Laporan Harian ROW)
      else if (widget.sesi.petugasHartek) // v0.88.0: menu OPS_HARTEK_INPUT
        LaporanTimDenganArsip(
            hariIni: HartekScreen(deps: widget.deps, sesi: widget.sesi),
            arsip: ArsipTimView(deps: widget.deps, sesi: widget.sesi, modul: ModulArsipTim.hartek),
            kalender: KalenderTimView(deps: widget.deps, sesi: widget.sesi))
      else if (widget.sesi.petugasInsJar) // v1.0.0: menu OPS_INSJAR_INPUT
        LaporanTimDenganArsip(
            hariIni: InsJarScreen(deps: widget.deps, sesi: widget.sesi),
            arsip: ArsipTimView(deps: widget.deps, sesi: widget.sesi, modul: ModulArsipTim.insjar),
            kalender: KalenderTimView(deps: widget.deps, sesi: widget.sesi))
      else if (widget.sesi.petugasInsDu) // v1.0.11: menu OPS_INSDU_INPUT
        LaporanTimDenganArsip(
            hariIni: InsDuScreen(deps: widget.deps, sesi: widget.sesi),
            arsip: ArsipTimView(deps: widget.deps, sesi: widget.sesi, modul: ModulArsipTim.insdu),
            kalender: KalenderTimView(deps: widget.deps, sesi: widget.sesi))
      else
        LaporanRowScreen(deps: widget.deps, sesi: widget.sesi),
      BerandaScreen(deps: widget.deps, sesi: widget.sesi, keLaporan: () => _keTab(0)),
      if (widget.sesi.petugasWo) WoTimScreen(deps: widget.deps, sesi: widget.sesi), // v1.0.11: tab WO
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
          child: IndexedStack(index: _tab.clamp(0, halaman.length - 1), children: halaman), // v1.0.11: tab WO bisa hilang saat menu berubah
        ),
        bottomNavigationBar: _SisiBottomBar(
          indeks: _tab.clamp(0, halaman.length - 1),
          onPilih: _keTab,
          pertama: widget.sesi.modeAdmin
              ? const _ItemNav('Operasi', Icons.dashboard_customize_outlined)
              : widget.sesi.petugasYandal
                  ? const _ItemNav('Shift', Icons.badge_outlined)
                  : widget.sesi.petugasHartek
                      ? const _ItemNav('Hartek', Icons.edit_note_rounded)
                      : widget.sesi.petugasInsJar
                          ? const _ItemNav('Inspeksi', Icons.travel_explore_rounded)
                          : widget.sesi.petugasInsDu
                              ? const _ItemNav('Gardu', Icons.electrical_services_rounded)
                              : const _ItemNav('Laporan', Icons.assignment_outlined),
          wo: widget.sesi.petugasWo,
          labelWo: widget.sesi.petugasYandal ? 'TO P0' : 'WO', // v1.0.16: WO Yandal = TO P0
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
  const _SisiBottomBar({required this.indeks, required this.onPilih, required this.pertama, this.wo = false, this.labelWo = 'WO'});
  final int indeks;
  final ValueChanged<int> onPilih;
  final _ItemNav pertama; // Laporan (PETUGAS) atau Operasi (admin, v0.50)
  final bool wo; // v1.0.11: tab WO tindak lanjut (tim ROW / HARTEK / YANDAL)
  final String labelWo;

  List<_ItemNav> get _item => [
        pertama,
        const _ItemNav('Beranda', Icons.home_rounded),
        if (wo) _ItemNav(labelWo, Icons.assignment_turned_in_outlined),
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
