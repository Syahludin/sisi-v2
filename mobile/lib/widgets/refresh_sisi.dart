import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import 'sisi_loader.dart';

/// v1.0.21 (permintaan Master Guswan 23 Okt 2026): tarik-untuk-refresh bergaya SiSi, pengganti [RefreshIndicator] (lingkaran
/// bawaan). Tarik daftar ke bawah dari paling atas: bulatan putih berisi logo S ([SisiLoader]) turun mengikuti jari;
/// lepas melewati batas = [onRefresh] berjalan dan logo tetap tampil sampai selesai.
/// Sama dengan RefreshIndicator: anak harus bisa di-scroll (AlwaysScrollableScrollPhysics untuk isi pendek) dan
/// hanya scroll langsung (depth 0) yang dihitung.
/// v1.0.22 (permintaan Master Guswan): logo diperbesar supaya proses refresh terlihat jelas.
class RefreshSisi extends StatefulWidget {
  const RefreshSisi({super.key, required this.onRefresh, required this.child});
  final Future<void> Function() onRefresh;
  final Widget child;

  @override
  State<RefreshSisi> createState() => _RefreshSisiState();
}

class _RefreshSisiState extends State<RefreshSisi> with SingleTickerProviderStateMixin {
  static const _batas = 84.0; // jarak tarik (px, sesudah redaman) untuk memicu refresh
  static const _ukuran = 62.0;

  /// Jarak tarik saat ini (0.._batas * 1.5); dianimasikan kembali ke 0 / ke _batas.
  late final AnimationController _tarik = AnimationController(vsync: this, upperBound: _batas * 1.5, duration: const Duration(milliseconds: 220));
  bool _jalan = false;
  bool _seret = false;

  @override
  void dispose() {
    _tarik.dispose();
    super.dispose();
  }

  void _geser(double d) {
    if (_tarik.isAnimating) _tarik.stop();
    _tarik.value = (_tarik.value + d).clamp(0.0, _batas * 1.5);
  }

  bool _onScroll(ScrollNotification n) {
    if (n.depth != 0 || _jalan) return false;
    if (n is ScrollStartNotification) {
      _seret = n.dragDetails != null && n.metrics.extentBefore == 0;
    } else if (n is OverscrollNotification) {
      // fisika clamping (Android): tarik di puncak = overscroll negatif
      if (_seret && n.dragDetails != null && n.overscroll < 0) _geser(-n.overscroll * .5);
    } else if (n is ScrollUpdateNotification) {
      final m = n.metrics;
      if (_seret && n.dragDetails != null && m.pixels < m.minScrollExtent) {
        if (_tarik.isAnimating) _tarik.stop(); // fisika bouncing (iOS): jarak = posisi di atas puncak
        _tarik.value = ((m.minScrollExtent - m.pixels) * .5).clamp(0.0, _batas * 1.5);
      } else if (_tarik.value > 0 && (n.scrollDelta ?? 0) > 0) {
        _geser(-(n.scrollDelta ?? 0)); // jari naik lagi sebelum dilepas
      }
    } else if (n is ScrollEndNotification) {
      _lepas();
    }
    return false;
  }

  void _lepas() {
    if (!_seret) return;
    _seret = false;
    if (_tarik.value >= _batas) {
      unawaited(_segarkan());
    } else {
      unawaited(_tarik.animateTo(0, curve: Curves.easeOut));
    }
  }

  Future<void> _segarkan() async {
    setState(() => _jalan = true);
    unawaited(_tarik.animateTo(_batas, curve: Curves.easeOut));
    try {
      await widget.onRefresh();
    } finally {
      if (mounted) {
        await _tarik.animateTo(0, curve: Curves.easeIn);
        if (mounted) setState(() => _jalan = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return NotificationListener<OverscrollIndicatorNotification>(
      // efek glow / stretch bawaan disembunyikan selama logo SiSi ditarik
      onNotification: (n) {
        if (_seret || _jalan) n.disallowIndicator();
        return false;
      },
      child: NotificationListener<ScrollNotification>(
        onNotification: _onScroll,
        child: Stack(children: [
          widget.child,
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: IgnorePointer(
              child: AnimatedBuilder(
                animation: _tarik,
                builder: (context, _) {
                  final p = (_tarik.value / _batas).clamp(0.0, 1.0);
                  if (p == 0 && !_jalan) return const SizedBox.shrink();
                  return Transform.translate(
                    offset: Offset(0, -_ukuran + (_tarik.value + 12) * math.min(1, p * 1.2)),
                    child: Center(
                      child: Opacity(
                        opacity: p,
                        child: Transform.rotate(
                          angle: _jalan ? 0 : (1 - p) * -math.pi / 2,
                          child: Container(
                            width: _ukuran,
                            height: _ukuran,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                              border: Border.all(color: p >= 1 ? AppColors.brand500 : AppColors.neutral200, width: 1.8),
                              boxShadow: [BoxShadow(color: AppColors.brand950.withValues(alpha: .18), blurRadius: 12, offset: const Offset(0, 4))],
                            ),
                            child: const SisiLoader(ukuran: 40),
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ]),
      ),
    );
  }
}
