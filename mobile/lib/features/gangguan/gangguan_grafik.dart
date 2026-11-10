import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import 'gangguan_bantu.dart';

/// v1.0.38 grafik History Gangguan HP, gaya opsi C website (web/src/pages/historiGangguan/Grafik.jsx): sumbu Y berangka +
/// garis bantu, per kolom batang tipis PMT | Section, garis + area tren total, garis putus-putus rata-rata. Ketuk kolom =
/// rincian di atas grafik (atau [onPilih], mis. Top 12 -> rincian penyulang). Kolom banyak = geser mendatar.
class WarnaGgn {
  WarnaGgn._();
  static const pmt = Color(0xFF1769AA);
  static const section = Color(0xFFC95F1A);
  static const tren = AppColors.brand700;
  static const rata = AppColors.accent700;
  static const naik = AppColors.red600;
  static const turun = AppColors.success700;
  static const pie = [
    Color(0xFFD13B46), Color(0xFF0788AA), Color(0xFFE3A600), Color(0xFF219064), Color(0xFF7C4DBD),
    Color(0xFFF07C2B), Color(0xFF135268), Color(0xFFC2185B), Color(0xFF8EA1A7), Color(0xFF5D7A2A),
  ];
}

/// Legenda PMT | Section (dipakai di atas kelompok grafik).
class LegendaAlatGgn extends StatelessWidget {
  const LegendaAlatGgn({super.key});

  @override
  Widget build(BuildContext context) {
    Widget satu(Color c, String t, String k) => Row(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 11, height: 11, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(3))),
          const SizedBox(width: 5),
          Text(t, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.neutral900)),
          const SizedBox(width: 4),
          Flexible(child: Text(k, style: const TextStyle(fontSize: 11, color: AppColors.neutral500), overflow: TextOverflow.ellipsis)),
        ]);
    return Wrap(spacing: 14, runSpacing: 4, children: [
      satu(WarnaGgn.pmt, 'PMT', 'trip dari sumber (GI / PLTD)'),
      satu(WarnaGgn.section, 'Section', 'selain PMT (ACR, OG, LBS)'),
    ]);
  }
}

/// Selisih terhadap kolom sebelumnya: '▲2' / '▼3' / '='.
String teksBedaGgn(int beda) => beda > 0 ? '▲$beda' : beda < 0 ? '▼${-beda}' : '=';

class GrafikTrenGgn extends StatefulWidget {
  const GrafikTrenGgn({
    super.key,
    required this.kolom,
    this.tinggi = 210,
    this.namaPanjang = false,
    this.selisih = false,
    this.lebarMinKolom = 30,
    this.onPilih,
  });

  final List<KolomGgn> kolom;
  final double tinggi, lebarMinKolom;
  final bool namaPanjang, selisih;
  final ValueChanged<String>? onPilih;

  @override
  State<GrafikTrenGgn> createState() => _GrafikTrenGgnState();
}

class _GrafikTrenGgnState extends State<GrafikTrenGgn> {
  int? _pilih;

  @override
  void didUpdateWidget(GrafikTrenGgn old) {
    super.didUpdateWidget(old);
    if (old.kolom.length != widget.kolom.length) _pilih = null;
  }

  @override
  Widget build(BuildContext context) {
    final k = widget.kolom;
    if (k.isEmpty) return const SizedBox.shrink();
    final pilih = _pilih != null && _pilih! < k.length ? k[_pilih!] : null;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SizedBox(
        height: 20,
        child: pilih == null
            ? Text(widget.onPilih != null ? 'Ketuk kolom untuk rincian' : 'Ketuk kolom untuk angka PMT / Section',
                style: const TextStyle(fontSize: 11.5, color: AppColors.neutral400))
            : Text.rich(TextSpan(style: const TextStyle(fontSize: 12, color: AppColors.neutral700), children: [
                TextSpan(text: '${pilih.label}${pilih.sub.isEmpty ? '' : ' ${pilih.sub}'}: ',
                    style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.brand950)),
                TextSpan(text: '${pilih.h.jumlah} kejadian · '),
                TextSpan(text: 'PMT ${pilih.h.pmt}', style: const TextStyle(color: WarnaGgn.pmt, fontWeight: FontWeight.w700)),
                const TextSpan(text: ' · '),
                TextSpan(text: 'Section ${pilih.h.section}', style: const TextStyle(color: WarnaGgn.section, fontWeight: FontWeight.w700)),
              ]), overflow: TextOverflow.ellipsis),
      ),
      LayoutBuilder(builder: (context, c) {
        final lebar = math.max(c.maxWidth, k.length * widget.lebarMinKolom + _PelukisTren.kiri + _PelukisTren.kanan);
        final kanvas = GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapUp: (d) {
            final kol = (lebar - _PelukisTren.kiri - _PelukisTren.kanan) / k.length;
            final i = ((d.localPosition.dx - _PelukisTren.kiri) / kol).floor();
            if (i < 0 || i >= k.length) return;
            setState(() => _pilih = i);
            widget.onPilih?.call(k[i].kunci);
          },
          child: CustomPaint(
            size: Size(lebar, widget.tinggi),
            painter: _PelukisTren(k, pilih: _pilih, namaPanjang: widget.namaPanjang, selisih: widget.selisih),
          ),
        );
        return lebar > c.maxWidth ? SingleChildScrollView(scrollDirection: Axis.horizontal, child: kanvas) : kanvas;
      }),
    ]);
  }
}

class _PelukisTren extends CustomPainter {
  _PelukisTren(this.k, {this.pilih, this.namaPanjang = false, this.selisih = false});
  final List<KolomGgn> k;
  final int? pilih;
  final bool namaPanjang, selisih;

  static const kiri = 30.0, kanan = 34.0, atas = 22.0;

  ({int atas, int langkah}) _skala(int maks) {
    final kasar = math.max(1, maks) / 4;
    final p = math.pow(10, (math.log(kasar) / math.ln10).floor()).toDouble();
    final langkah = [1, 2, 5, 10].map((x) => x * p).firstWhere((x) => x >= kasar).ceil();
    final l = math.max(1, langkah);
    return (atas: math.max(l, (math.max(1, maks) / l).ceil() * l), langkah: l);
  }

  void _teks(Canvas c, String t, Offset o, TextStyle s, {TextAlign rata = TextAlign.center, double lebar = 60}) {
    final tp = TextPainter(text: TextSpan(text: t, style: s), textDirection: TextDirection.ltr, textAlign: rata, maxLines: 1, ellipsis: '…')
      ..layout(maxWidth: lebar);
    final dx = rata == TextAlign.center ? o.dx - tp.width / 2 : rata == TextAlign.right ? o.dx - tp.width : o.dx;
    tp.paint(c, Offset(dx, o.dy));
  }

  @override
  void paint(Canvas canvas, Size size) {
    final bawah = namaPanjang ? 34.0 : 30.0;
    final s = _skala(k.map((x) => x.h.jumlah).fold(0, math.max));
    final w = size.width - kiri - kanan, kol = w / k.length;
    double y(num v) => atas + (size.height - atas - bawah) * (1 - v / s.atas);
    final sumbu = TextStyle(fontSize: 9.5, color: AppColors.neutral500, fontFeatures: const [FontFeature.tabularFigures()]);
    // grid + angka sumbu Y
    for (var v = 0; v <= s.atas; v += s.langkah) {
      canvas.drawLine(Offset(kiri, y(v)), Offset(size.width - kanan, y(v)),
          Paint()..color = v == 0 ? AppColors.neutral400 : AppColors.neutral150..strokeWidth = v == 0 ? 1.4 : 1);
      _teks(canvas, '$v', Offset(kiri - 5, y(v) - 6), sumbu, rata: TextAlign.right, lebar: kiri - 4);
    }
    final titik = [for (var i = 0; i < k.length; i++) Offset(kiri + kol * (i + .5), y(k[i].h.jumlah))];
    // sorot kolom terpilih
    if (pilih != null && pilih! < k.length) {
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(kiri + kol * pilih! + 1, atas - 16, kol - 2, y(0) - atas + 16), const Radius.circular(6)),
          Paint()..color = AppColors.brand50);
    }
    // area tren
    final area = Path()..moveTo(titik.first.dx, y(0));
    for (final p in titik) {
      area.lineTo(p.dx, p.dy);
    }
    area
      ..lineTo(titik.last.dx, y(0))
      ..close();
    canvas.drawPath(area, Paint()..color = WarnaGgn.tren.withValues(alpha: .08));
    // batang PMT | Section
    final bw = math.max(3.0, math.min(14.0, kol * .2));
    final dalam = const TextStyle(fontSize: 8.5, fontWeight: FontWeight.w800, color: Colors.white);
    for (var i = 0; i < k.length; i++) {
      final cx = titik[i].dx;
      for (final (v, warna, x) in [(k[i].h.pmt, WarnaGgn.pmt, cx - bw - 1), (k[i].h.section, WarnaGgn.section, cx + 1)]) {
        if (v <= 0) continue;
        final r = Rect.fromLTRB(x, y(v), x + bw, y(0));
        canvas.drawRRect(RRect.fromRectAndCorners(r, topLeft: const Radius.circular(3), topRight: const Radius.circular(3)), Paint()..color = warna);
        if (r.height >= 14 && bw >= 9) _teks(canvas, '$v', Offset(x + bw / 2, y(v) + 2), dalam, lebar: bw + 6);
      }
      // label X (+ sub tahun / baris kedua nama)
      final label = TextStyle(fontSize: namaPanjang ? 9.5 : 10, fontWeight: FontWeight.w700, color: AppColors.neutral700);
      if (namaPanjang) {
        final kata = k[i].label.split(' ');
        final b1 = kata.length > 1 ? kata.sublist(0, (kata.length / 2).ceil()).join(' ') : k[i].label;
        final b2 = kata.length > 1 ? kata.sublist((kata.length / 2).ceil()).join(' ') : '';
        _teks(canvas, b1, Offset(cx, y(0) + 4), label, lebar: kol - 2);
        if (b2.isNotEmpty) _teks(canvas, b2, Offset(cx, y(0) + 16), label, lebar: kol - 2);
      } else {
        _teks(canvas, k[i].label, Offset(cx, y(0) + 4), label, lebar: kol);
        if (k[i].sub.isNotEmpty) {
          _teks(canvas, k[i].sub, Offset(cx, y(0) + 16), const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: AppColors.neutral400), lebar: kol + 10);
        }
      }
    }
    // rata-rata (putus-putus)
    if (k.length > 1) {
      final rata = k.fold<int>(0, (n, x) => n + x.h.jumlah) / k.length, yr = y(rata);
      final cat = Paint()
        ..color = WarnaGgn.rata
        ..strokeWidth = 1.4;
      for (var x = kiri; x < size.width - kanan; x += 9) {
        canvas.drawLine(Offset(x, yr), Offset(math.min(x + 5, size.width - kanan), yr), cat);
      }
      final g = const TextStyle(fontSize: 8.5, fontWeight: FontWeight.w800, color: WarnaGgn.rata);
      _teks(canvas, 'rata', Offset(size.width - kanan + 3, yr - 11), g, rata: TextAlign.left, lebar: kanan);
      _teks(canvas, rata.toStringAsFixed(1).replaceAll('.', ','), Offset(size.width - kanan + 3, yr + 1), g.copyWith(fontSize: 9.5), rata: TextAlign.left, lebar: kanan);
    }
    // garis tren + titik + total
    if (titik.length > 1) {
      final garis = Path()..moveTo(titik.first.dx, titik.first.dy);
      for (final p in titik.skip(1)) {
        garis.lineTo(p.dx, p.dy);
      }
      canvas.drawPath(garis, Paint()
        ..color = WarnaGgn.tren
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeJoin = StrokeJoin.round);
    }
    final total = const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.brand950);
    for (var i = 0; i < titik.length; i++) {
      canvas.drawCircle(titik[i], 3.4, Paint()..color = Colors.white);
      canvas.drawCircle(titik[i], 3.4, Paint()
        ..color = WarnaGgn.tren
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2);
      final beda = selisih && i > 0 ? k[i].h.jumlah - k[i - 1].h.jumlah : null;
      _teks(canvas, '${k[i].h.jumlah}', Offset(titik[i].dx - (beda != null ? 8 : 0), titik[i].dy - 16), total, lebar: 40);
      if (beda != null) {
        _teks(canvas, teksBedaGgn(beda), Offset(titik[i].dx + 4, titik[i].dy - 15),
            TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: beda > 0 ? WarnaGgn.naik : beda < 0 ? WarnaGgn.turun : AppColors.neutral500),
            rata: TextAlign.left, lebar: 36);
      }
    }
  }

  @override
  bool shouldRepaint(_PelukisTren o) => o.k != k || o.pilih != pilih;
}

/// Donut Kode FGTM + legenda (ketuk potongan / baris = filter kode).
class PieFgtmGgn extends StatelessWidget {
  const PieFgtmGgn({super.key, required this.isi, required this.aktif, required this.onPilih});
  final List<({String kode, String label, int jumlah})> isi;
  final String aktif;
  final ValueChanged<String> onPilih;

  @override
  Widget build(BuildContext context) {
    final total = isi.fold<int>(0, (n, x) => n + x.jumlah);
    if (total == 0) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Text('Belum ada kejadian dengan Kode FGTM untuk pilihan ini.', style: TextStyle(fontSize: 13, color: AppColors.neutral400)),
      );
    }
    return Column(children: [
      SizedBox(
        width: 168,
        height: 168,
        child: CustomPaint(
          painter: _PelukisPie(isi, total, aktif),
          child: Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text('$total', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: AppColors.brand950)),
              const Text('kejadian', style: TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
            ]),
          ),
        ),
      ),
      const SizedBox(height: 10),
      for (var i = 0; i < isi.length; i++)
        InkWell(
          onTap: isi[i].kode.isEmpty ? null : () => onPilih(isi[i].kode),
          borderRadius: BorderRadius.circular(10),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
            decoration: BoxDecoration(
              color: aktif.isNotEmpty && aktif == isi[i].kode ? AppColors.brand50 : null,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(children: [
              Container(width: 11, height: 11, decoration: BoxDecoration(color: WarnaGgn.pie[i % WarnaGgn.pie.length], borderRadius: BorderRadius.circular(3))),
              const SizedBox(width: 8),
              if (isi[i].kode.isNotEmpty) Text('${isi[i].kode}  ', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w900, color: AppColors.brand950)),
              Expanded(child: Text(isi[i].label, style: const TextStyle(fontSize: 12.5, color: AppColors.neutral700), overflow: TextOverflow.ellipsis)),
              Text('${isi[i].jumlah}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.brand950)),
              SizedBox(
                width: 44,
                child: Text('${(isi[i].jumlah / total * 100).round()}%', textAlign: TextAlign.right, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
              ),
            ]),
          ),
        ),
    ]);
  }
}

class _PelukisPie extends CustomPainter {
  _PelukisPie(this.isi, this.total, this.aktif);
  final List<({String kode, String label, int jumlah})> isi;
  final int total;
  final String aktif;

  @override
  void paint(Canvas canvas, Size size) {
    final r = size.width / 2 - 14, pusat = size.center(Offset.zero);
    canvas.drawCircle(pusat, r, Paint()
      ..color = AppColors.neutral100
      ..style = PaintingStyle.stroke
      ..strokeWidth = 26);
    var sudut = -math.pi / 2;
    for (var i = 0; i < isi.length; i++) {
      final sapu = isi[i].jumlah / total * math.pi * 2;
      canvas.drawArc(Rect.fromCircle(center: pusat, radius: r), sudut, sapu, false, Paint()
        ..color = WarnaGgn.pie[i % WarnaGgn.pie.length]
        ..style = PaintingStyle.stroke
        ..strokeWidth = aktif.isNotEmpty && aktif == isi[i].kode ? 32 : 26);
      sudut += sapu;
    }
  }

  @override
  bool shouldRepaint(_PelukisPie o) => o.isi != isi || o.aktif != aktif;
}
