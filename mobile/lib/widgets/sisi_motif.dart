import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// v1.0.18 (permintaan Master Guswan 22 Okt 2026): identitas visual "Jaringan SiSi". Latar teal SiSi bergradien dengan motif
/// tiang + kawat jaringan distribusi yang samar (pekerjaan sehari-hari tim lapangan), aksen kuning PLN dipakai hemat
/// untuk penanda judul dan angka penting. Dipakai header semua layar (HeaderInsJar, sisiAppBar), hero Beranda,
/// dan kartu ringkasan angka.
class SisiMotif {
  SisiMotif._();

  /// Gradien latar header: teal tua ke teal SiSi.
  static const gradien = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [AppColors.brand950, AppColors.brand800, AppColors.brand700],
    stops: [0, .62, 1],
  );

  /// Aksen kuning PLN (penanda judul, kilat).
  static const percik = AppColors.accent400;
}

/// Tiang + kawat jaringan (catenary) yang samar di kanan bawah. [kerapatan] = jumlah tiang.
/// v1.0.28: [progres] 0..1 = gambar bertahap (tiang tumbuh satu per satu, lalu kawat terentang); 1 = utuh.
class PolaJaringanPainter extends CustomPainter {
  const PolaJaringanPainter({this.warna = Colors.white, this.alpha = .11, this.kerapatan = 4, this.progres = 1});
  final Color warna;
  final double alpha;
  final int kerapatan;
  final double progres;

  /// Jeda mulai antar tiang, lama tumbuh satu tiang, lama satu bentang kawat (satuan [progres]).
  double get _jeda => .6 / math.max(1, kerapatan);
  static const _tumbuh = .3, _rentang = .25;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.width <= 0 || size.height <= 0 || progres <= 0) return;
    final garis = Paint()
      ..color = warna.withValues(alpha: alpha)
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 1.4;
    final tiang = Paint()
      ..color = warna.withValues(alpha: alpha * 1.25)
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 2.2;
    // tiang berjajar dari tengah ke kanan, makin ke kanan makin tinggi (perspektif)
    final mulaiX = size.width * .42;
    final jarak = (size.width - mulaiX) / math.max(1, kerapatan - 1);
    final dasar = size.height + 2;
    final puncak = <Offset>[];
    for (var i = 0; i < kerapatan; i++) {
      final x = mulaiX + jarak * i;
      final tinggi = size.height * (.42 + .38 * i / math.max(1, kerapatan - 1));
      final atas = Offset(x, dasar - tinggi);
      puncak.add(atas.translate(0, 5));
      final t = progres >= 1 ? 1.0 : ((progres - i * _jeda) / _tumbuh).clamp(0.0, 1.0);
      if (t <= 0) continue;
      final ujung = Offset(x, dasar - tinggi * Curves.easeOutCubic.transform(t));
      canvas.drawLine(Offset(x, dasar), ujung, tiang);
      // palang (cross-arm), melebar sesudah tiang hampir penuh
      final palang = (9.0 + 3 * i) * ((t - .6) / .4).clamp(0.0, 1.0);
      if (palang > 0) canvas.drawLine(atas.translate(-palang, 5), atas.translate(palang, 5), tiang);
    }
    // tiga kawat melendut antar tiang
    for (final dx in [-1.0, 0.0, 1.0]) {
      for (var i = 0; i + 1 < puncak.length; i++) {
        final k = progres >= 1 ? 1.0 : ((progres - (i + 1) * _jeda - _tumbuh * .7) / _rentang).clamp(0.0, 1.0);
        if (k <= 0) continue;
        final a = puncak[i], b = puncak[i + 1];
        final geserA = dx * (9.0 + 3 * i), geserB = dx * (9.0 + 3 * (i + 1));
        final p0 = a.translate(geserA, 0), p1 = b.translate(geserB, 0);
        final lendut = (p1.dx - p0.dx) * .12;
        final tengah = Offset((p0.dx + p1.dx) / 2, math.max(p0.dy, p1.dy) + lendut);
        final kawat = Path()
          ..moveTo(p0.dx, p0.dy)
          ..quadraticBezierTo(tengah.dx, tengah.dy, p1.dx, p1.dy);
        if (k >= 1) {
          canvas.drawPath(kawat, garis);
        } else {
          for (final m in kawat.computeMetrics()) {
            canvas.drawPath(m.extractPath(0, m.length * k), garis);
          }
        }
      }
    }
  }

  @override
  bool shouldRepaint(PolaJaringanPainter old) =>
      old.warna != warna || old.alpha != alpha || old.kerapatan != kerapatan || old.progres != progres;
}

/// Latar header SiSi: gradien + motif jaringan, sudut membulat. Isi [child] di atasnya.
class LatarSisi extends StatelessWidget {
  const LatarSisi({super.key, required this.child, this.radius = 24, this.padding = const EdgeInsets.all(18), this.bayangan = true});
  final Widget child;
  final double radius;
  final EdgeInsetsGeometry padding;
  final bool bayangan;

  @override
  Widget build(BuildContext context) {
    final r = BorderRadius.circular(radius);
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: SisiMotif.gradien,
        borderRadius: r,
        boxShadow: bayangan ? [BoxShadow(color: AppColors.brand900.withValues(alpha: .28), blurRadius: 22, offset: const Offset(0, 10))] : null,
      ),
      child: ClipRRect(
        borderRadius: r,
        child: Stack(children: [
          const Positioned.fill(child: IgnorePointer(child: CustomPaint(painter: PolaJaringanPainter()))),
          Padding(padding: padding, child: child),
        ]),
      ),
    );
  }
}

/// Penanda kecil kuning PLN sebelum label kicker / judul seksi.
class PercikSisi extends StatelessWidget {
  const PercikSisi({super.key, this.tinggi = 12, this.warna = SisiMotif.percik});
  final double tinggi;
  final Color warna;

  @override
  Widget build(BuildContext context) => Container(
        width: 4,
        height: tinggi,
        decoration: BoxDecoration(color: warna, borderRadius: BorderRadius.circular(4)),
      );
}

/// Judul seksi: percik kuning + judul + keterangan kecil opsional + aksi kanan.
class JudulSeksiSisi extends StatelessWidget {
  const JudulSeksiSisi(this.judul, {super.key, this.keterangan, this.aksi});
  final String judul;
  final String? keterangan;
  final Widget? aksi;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
          const PercikSisi(tinggi: 16, warna: AppColors.accent600),
          const SizedBox(width: 8),
          Flexible(
            child: Text(judul,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800, letterSpacing: -.2, color: AppColors.brand950)),
          ),
          if (keterangan != null) ...[
            const SizedBox(width: 8),
            Flexible(
              child: Text(keterangan!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
            ),
          ],
          const Spacer(),
          if (aksi != null) aksi!,
        ]),
      );
}

/// Kartu angka ringkasan: ikon berwarna, angka besar tabular, label. [onTap] = buka rincian.
class AngkaSisi extends StatelessWidget {
  const AngkaSisi({super.key, required this.label, required this.nilai, required this.ikon, this.warna = AppColors.brand700, this.onTap});
  final String label;
  final String nilai;
  final IconData ikon;
  final Color warna;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final r = BorderRadius.circular(16);
    return Material(
      color: AppColors.surface,
      shape: RoundedRectangleBorder(borderRadius: r, side: const BorderSide(color: AppColors.neutral200)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Stack(children: [
          Positioned(left: 0, top: 12, bottom: 12, child: Container(width: 3, decoration: BoxDecoration(color: warna, borderRadius: BorderRadius.circular(3)))),
          Padding(
            padding: const EdgeInsets.fromLTRB(13, 10, 10, 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Icon(ikon, size: 15, color: warna),
                const SizedBox(width: 5),
                Expanded(
                  child: Text(label,
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: AppColors.neutral500)),
                ),
              ]),
              const SizedBox(height: 4),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(nilai,
                    style: const TextStyle(
                        fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: -.4, color: AppColors.brand950, fontFeatures: [FontFeature.tabularFigures()])),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}
