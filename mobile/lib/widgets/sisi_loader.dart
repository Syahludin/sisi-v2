import 'dart:math' as math;
import 'dart:ui' show PathMetric;

import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// v1.0.17 (permintaan kvlar 22 Okt 2026): animasi loading berbentuk logo SiSi, pengganti spinner bawaan
/// (CircularProgressIndicator) di seluruh aplikasi.
///
/// Satu garis membentuk huruf S dengan sudut patah, digambar berurutan seperti logo SiSi:
///   kanan bawah (ekor atas) -> kiri atas -> kiri bawah (tengah) -> kanan bawah -> kembali ke kiri bawah (ekor bawah).
/// Siklus: garis tumbuh dari titik awal sampai ujung (titik sudut muncul saat dilewati kepala garis), menetap sebentar,
/// lalu terhapus dari pangkal ke ujung, berulang. HP dengan "kurangi animasi" = S utuh tanpa gerak.
/// v1.0.22: [diam] = logo S utuh tanpa gerak (ikon tombol refresh saat tidak ada aktivitas).
class SisiLoader extends StatefulWidget {
  const SisiLoader({super.key, this.ukuran = 40, this.warna, this.warnaKepala, this.durasi = const Duration(milliseconds: 1600), this.diam = false});

  /// Sisi kotak (px). Tebal garis mengikuti ukuran.
  final double ukuran;

  /// Warna garis + titik sudut (default biru SiSi). Tombol berlatar gelap: Colors.white.
  final Color? warna;

  /// Warna kepala garis (default kuning petir logo; ikut [warna] kalau [warna] diisi).
  final Color? warnaKepala;
  final Duration durasi;
  final bool diam;

  /// Titik sudut S patah dalam kotak 0..1 (urutan gambar).
  static const List<Offset> titik = [
    Offset(.76, .34), // kanan bawah (ekor atas)
    Offset(.34, .10), // kiri atas
    Offset(.22, .46), // kiri bawah (tengah)
    Offset(.78, .66), // kanan bawah
    Offset(.26, .90), // kembali ke kiri bawah (ekor bawah)
  ];

  /// Bagian garis yang tampil pada fase [t] (0..1 satu siklus): (awal, akhir) dalam pecahan panjang garis.
  static (double, double) potongan(double t) {
    double mulus(double x) => Curves.easeInOutCubic.transform(x.clamp(0.0, 1.0));
    if (t < .55) return (0, mulus(t / .55));
    if (t < .70) return (0, 1);
    return (mulus((t - .70) / .30), 1);
  }

  @override
  State<SisiLoader> createState() => _SisiLoaderState();
}

class _SisiLoaderState extends State<SisiLoader> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: widget.durasi);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _atur();
  }

  @override
  void didUpdateWidget(SisiLoader old) {
    super.didUpdateWidget(old);
    if (old.diam != widget.diam) _atur();
  }

  void _atur() {
    final diam = widget.diam || (MediaQuery.maybeDisableAnimationsOf(context) ?? false);
    if (diam) {
      _c.stop();
      _c.value = .6; // S utuh
    } else if (!_c.isAnimating) {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final warna = widget.warna ?? AppColors.navy900;
    final kepala = widget.warnaKepala ?? (widget.warna == null ? AppColors.accent600 : widget.warna!);
    return Semantics(
      label: 'Memuat',
      child: SizedBox.square(
        dimension: widget.ukuran,
        child: RepaintBoundary(
          child: AnimatedBuilder(
            animation: _c,
            builder: (context, _) => CustomPaint(painter: _LukisS(_c.value, warna, kepala)),
          ),
        ),
      ),
    );
  }
}

class _LukisS extends CustomPainter {
  _LukisS(this.t, this.warna, this.kepala);
  final double t;
  final Color warna, kepala;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.shortestSide;
    if (s <= 0) return;
    final p = [for (final o in SisiLoader.titik) Offset(o.dx * s, o.dy * s)];
    final jalur = Path()..moveTo(p.first.dx, p.first.dy);
    for (final o in p.skip(1)) {
      jalur.lineTo(o.dx, o.dy);
    }
    final PathMetric m = jalur.computeMetrics().first;
    final panjang = m.length;
    final (a, b) = SisiLoader.potongan(t);
    final tebal = math.max(1.4, s * .085);

    // jejak tipis seluruh S (bayangan bentuk) supaya bentuk huruf tetap terbaca di awal siklus
    canvas.drawPath(
      jalur,
      Paint()
        ..color = warna.withValues(alpha: .14)
        ..style = PaintingStyle.stroke
        ..strokeWidth = tebal
        ..strokeJoin = StrokeJoin.miter
        ..strokeCap = StrokeCap.round,
    );
    if (b > a) {
      canvas.drawPath(
        m.extractPath(panjang * a, panjang * b),
        Paint()
          ..color = warna
          ..style = PaintingStyle.stroke
          ..strokeWidth = tebal
          ..strokeJoin = StrokeJoin.miter
          ..strokeCap = StrokeCap.round,
      );
    }
    // titik sudut (simpul logo) muncul saat dilewati garis
    if (s >= 18) {
      var jarak = 0.0;
      for (var i = 0; i < p.length; i++) {
        if (i > 0) jarak += (p[i] - p[i - 1]).distance;
        final f = jarak / panjang;
        if (f >= a - 1e-6 && f <= b + 1e-6) {
          canvas.drawCircle(p[i], tebal * .95, Paint()..color = warna);
        }
      }
    }
    // kepala garis
    if (b > a && b < 1) {
      final tan = m.getTangentForOffset(panjang * b);
      if (tan != null) canvas.drawCircle(tan.position, tebal * (s >= 18 ? 1.05 : .8), Paint()..color = kepala);
    }
  }

  @override
  bool shouldRepaint(_LukisS old) => old.t != t || old.warna != warna || old.kepala != kepala;
}
