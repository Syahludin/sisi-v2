import 'package:flutter/material.dart';

/// v1.0.27 (permintaan Master Guswan 23 Okt 2026): animasi masuk halaman.

/// Durasi animasi masuk bersama (Beranda pop up, cincin + angka Pengukuran Gardu).
const durasiMasukSisi = Duration(milliseconds: 1100);

/// Pop up bertingkat: kartu ke-[urut] muncul sedikit sesudah kartu sebelumnya (jeda [jeda] dari panjang [animasi]),
/// naik 26 px, membesar 0,9 -> 1 dengan pantulan kecil, dan memudar masuk. "Kurangi animasi" di HP = langsung tampil.
class PopMasuk extends StatelessWidget {
  const PopMasuk({super.key, required this.animasi, required this.urut, required this.child, this.jeda = .09});
  final Animation<double> animasi;
  final int urut;
  final double jeda;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) return child;
    final mulai = (urut * jeda).clamp(0.0, .55);
    final gerak = CurvedAnimation(parent: animasi, curve: Interval(mulai, (mulai + .45).clamp(0.0, 1.0), curve: Curves.easeOutBack));
    final pudar = CurvedAnimation(parent: animasi, curve: Interval(mulai, (mulai + .25).clamp(0.0, 1.0), curve: Curves.easeOut));
    return AnimatedBuilder(
      animation: animasi,
      child: child,
      builder: (context, child) {
        final v = gerak.value;
        return Opacity(
          opacity: pudar.value.clamp(0.0, 1.0),
          child: Transform.translate(
            offset: Offset(0, (1 - v) * 26),
            child: Transform.scale(scale: .9 + .1 * v, child: child),
          ),
        );
      },
    );
  }
}

/// Angka yang naik dari 0 ke [nilai] saat pertama tampil (dan bergerak halus saat nilai berubah).
class AngkaNaik extends StatelessWidget {
  const AngkaNaik(this.nilai, {super.key, required this.gaya, this.format, this.durasi = durasiMasukSisi});
  final num nilai;
  final TextStyle gaya;
  final String Function(double v)? format;
  final Duration durasi;

  @override
  Widget build(BuildContext context) {
    final f = format ?? (double v) => '${v.round()}';
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) return Text(f(nilai.toDouble()), style: gaya);
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: nilai.toDouble()),
      duration: durasi,
      curve: Curves.easeOutCubic,
      builder: (context, v, _) => Text(f(v), style: gaya),
    );
  }
}
