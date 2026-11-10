import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_colors.dart';

/// v0.92.0: kartu pop up "berhasil" di tengah layar, gaya clink: kartu meletup masuk, tanda centang
/// muncul-hilang-muncul-hilang lalu menetap, kemudian kartu memudar sendiri. Ketuk di mana saja untuk menutup.
/// Pengaturan HP "kurangi animasi" aktif = centang langsung tampil tanpa kedip.
///
/// Dipakai: Download Foto P0 Yandal. Hanya satu pop up tampil pada satu waktu.
Future<void> tampilPopupBerhasil(
  BuildContext context, {
  required String judul,
  String? keterangan,
  Duration lama = const Duration(milliseconds: 2600),
  bool tembus = false,
}) {
  final overlay = Overlay.maybeOf(context, rootOverlay: true);
  if (overlay == null) return Future.value();
  _PopupAktif.tutup();
  final selesai = Completer<void>();
  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => PopupBerhasil(
      judul: judul,
      keterangan: keterangan,
      lama: lama,
      tembus: tembus,
      onSelesai: () {
        if (_PopupAktif.entry == entry) _PopupAktif.entry = null;
        if (entry.mounted) entry.remove();
        if (!selesai.isCompleted) selesai.complete();
      },
    ),
  );
  _PopupAktif.entry = entry;
  _PopupAktif.selesai = selesai;
  overlay.insert(entry);
  unawaited(HapticFeedback.lightImpact());
  return selesai.future;
}

/// v1.0.21 (permintaan Master Guswan 23 Okt 2026): pengganti pesan bawah "Tersimpan di HP. Dikirim otomatis ke server." sesudah
/// form disimpan: pop up centang muncul-hilang "Data Berhasil disimpan". Status kirim tetap terlihat di kartu laporan.
Future<void> tampilDataTersimpan(BuildContext context) => tampilPopupBerhasil(context, judul: 'Data Berhasil disimpan');

class _PopupAktif {
  static OverlayEntry? entry;
  static Completer<void>? selesai;

  static void tutup() {
    final e = entry;
    entry = null;
    if (e != null && e.mounted) e.remove();
    final s = selesai;
    selesai = null;
    if (s != null && !s.isCompleted) s.complete();
  }
}

class PopupBerhasil extends StatefulWidget {
  const PopupBerhasil({
    super.key,
    required this.judul,
    required this.onSelesai,
    this.keterangan,
    this.lama = const Duration(milliseconds: 2600),
    this.tembus = false,
  });

  /// [tembus] = sentuhan lolos ke layar di belakang (kartu hanya penanda, mis. Approval P0 yang lanjut ke P0 berikutnya).
  final bool tembus;
  final String judul;
  final String? keterangan;
  final Duration lama;
  final VoidCallback onSelesai;

  @override
  State<PopupBerhasil> createState() => _PopupBerhasilState();
}

class _PopupBerhasilState extends State<PopupBerhasil> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: widget.lama);
  bool _tutup = false;

  // Pembagian waktu (0..1): kartu masuk 0-0.12, centang kedip 0.10-0.62, tahan, kartu keluar 0.88-1.

  /// Opasitas centang: muncul, hilang, muncul, hilang, muncul (menetap).
  static final TweenSequence<double> _kedip = TweenSequence<double>([
    TweenSequenceItem(tween: ConstantTween(0), weight: 10),
    TweenSequenceItem(tween: Tween(begin: 0.0, end: 1.0).chain(CurveTween(curve: Curves.easeOut)), weight: 7),
    TweenSequenceItem(tween: Tween(begin: 1.0, end: 0.0).chain(CurveTween(curve: Curves.easeIn)), weight: 9),
    TweenSequenceItem(tween: Tween(begin: 0.0, end: 1.0).chain(CurveTween(curve: Curves.easeOut)), weight: 7),
    TweenSequenceItem(tween: Tween(begin: 1.0, end: 0.0).chain(CurveTween(curve: Curves.easeIn)), weight: 9),
    TweenSequenceItem(tween: Tween(begin: 0.0, end: 1.0).chain(CurveTween(curve: Curves.easeOut)), weight: 10),
    TweenSequenceItem(tween: ConstantTween(1), weight: 48),
  ]);

  /// Skala centang: setiap kali muncul sedikit meletup (clink) lalu kembali ke ukuran normal.
  static final TweenSequence<double> _letup = TweenSequence<double>([
    TweenSequenceItem(tween: ConstantTween(0.6), weight: 10),
    TweenSequenceItem(tween: Tween(begin: 0.6, end: 1.15).chain(CurveTween(curve: Curves.easeOutBack)), weight: 7),
    TweenSequenceItem(tween: Tween(begin: 1.15, end: 0.8), weight: 9),
    TweenSequenceItem(tween: Tween(begin: 0.8, end: 1.15).chain(CurveTween(curve: Curves.easeOutBack)), weight: 7),
    TweenSequenceItem(tween: Tween(begin: 1.15, end: 0.8), weight: 9),
    TweenSequenceItem(tween: Tween(begin: 0.8, end: 1.18).chain(CurveTween(curve: Curves.easeOutBack)), weight: 10),
    TweenSequenceItem(tween: Tween(begin: 1.18, end: 1.0).chain(CurveTween(curve: Curves.easeOut)), weight: 8),
    TweenSequenceItem(tween: ConstantTween(1), weight: 40),
  ]);

  /// Cincin cahaya di belakang centang, berdenyut tiap centang muncul.
  static final TweenSequence<double> _cincin = TweenSequence<double>([
    TweenSequenceItem(tween: ConstantTween(0), weight: 10),
    TweenSequenceItem(tween: Tween(begin: 0.0, end: 1.0), weight: 16),
    TweenSequenceItem(tween: Tween(begin: 0.0, end: 1.0), weight: 16),
    TweenSequenceItem(tween: Tween(begin: 0.0, end: 1.0), weight: 18),
    TweenSequenceItem(tween: ConstantTween(1), weight: 40),
  ]);

  @override
  void initState() {
    super.initState();
    _c.addStatusListener((s) {
      if (s == AnimationStatus.completed) _selesai();
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _c.forward();
    });
  }

  void _selesai() {
    if (_tutup) return;
    _tutup = true;
    widget.onSelesai();
  }

  /// Ketuk = percepat ke fase keluar (tidak langsung hilang, supaya tidak terasa patah).
  void _ketuk() {
    if (_tutup) return;
    if (_c.value < 0.88) {
      _c.animateTo(1, duration: const Duration(milliseconds: 220), curve: Curves.easeIn);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  double _antara(double t, double a, double b) => ((t - a) / (b - a)).clamp(0.0, 1.0);

  @override
  Widget build(BuildContext context) {
    final tenang = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    return Positioned.fill(
      child: IgnorePointer(
        ignoring: widget.tembus,
        child: GestureDetector(
          key: const ValueKey('popup-berhasil'),
          behavior: HitTestBehavior.opaque,
          onTap: _ketuk,
          child: AnimatedBuilder(
            animation: _c,
            builder: (context, _) {
              final t = _c.value;
              final masuk = Curves.easeOutBack.transform(_antara(t, 0, 0.12));
              final keluar = Curves.easeIn.transform(_antara(t, 0.88, 1));
              final opasitasKartu = (_antara(t, 0, 0.08) * (1 - keluar)).clamp(0.0, 1.0);
              final skalaKartu = (0.82 + 0.18 * masuk) * (1 - 0.06 * keluar);
              final centang = tenang ? 1.0 : _kedip.transform(t).clamp(0.0, 1.0);
              final letup = tenang ? 1.0 : _letup.transform(t);
              final cincin = tenang ? 1.0 : _cincin.transform(t);
              return ColoredBox(
                color: Colors.black.withAlpha((46 * opasitasKartu).round()),
                child: Center(
                  child: Opacity(
                    opacity: opasitasKartu,
                    child: Transform.scale(
                      scale: skalaKartu,
                      child: _kartu(centang, letup, cincin),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _kartu(double centang, double letup, double cincin) {
    return Semantics(
      liveRegion: true,
      label: [widget.judul, if (widget.keterangan != null) widget.keterangan!].join('. '),
      child: ExcludeSemantics(child: Material(
      type: MaterialType.transparency,
      child: Container(
        width: 272,
        padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(28),
          boxShadow: [
            BoxShadow(color: AppColors.neutral950.withAlpha(46), blurRadius: 32, offset: const Offset(0, 14)),
          ],
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          SizedBox(
            width: 104,
            height: 104,
            child: Stack(alignment: Alignment.center, children: [
              // cincin denyut: membesar dan memudar setiap centang muncul
              Opacity(
                opacity: (1 - cincin) * 0.55,
                child: Container(
                  width: 64 + 40 * cincin,
                  height: 64 + 40 * cincin,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.success600, width: 3),
                  ),
                ),
              ),
              Container(
                width: 80,
                height: 80,
                decoration: const BoxDecoration(color: AppColors.success100, shape: BoxShape.circle),
              ),
              Opacity(
                key: const ValueKey('popup-centang'),
                opacity: centang,
                child: Transform.scale(
                  scale: letup,
                  child: Container(
                    width: 60,
                    height: 60,
                    decoration: BoxDecoration(
                      color: AppColors.success600,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(color: AppColors.success600.withAlpha(89), blurRadius: 14, offset: const Offset(0, 5)),
                      ],
                    ),
                    child: const Icon(Icons.check_rounded, color: Colors.white, size: 38),
                  ),
                ),
              ),
            ]),
          ),
          const SizedBox(height: 16),
          Text(
            widget.judul,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.neutral950, height: 1.25),
          ),
          if (widget.keterangan != null) ...[
            const SizedBox(height: 6),
            Text(
              widget.keterangan!,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 14, color: AppColors.neutral700, height: 1.35),
            ),
          ],
        ]),
      ),
    )));
  }
}
