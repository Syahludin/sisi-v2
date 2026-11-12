import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sisi_row/theme/app_colors.dart';
import 'package:sisi_row/widgets/sisi_motif.dart';

/// Motif jaringan Hijau Rimba (tiang, kawat, trafo, pohon): tergambar di semua tahap tanpa galat; SISI_MOTIF_PNG = simpan gambar untuk dilihat.
Future<ui.Image> _gambar(PolaJaringanPainter p, Size ukuran) async {
  final rekam = ui.PictureRecorder();
  final canvas = Canvas(rekam);
  canvas.drawRect(Offset.zero & ukuran, Paint()..shader = SisiMotif.gradien.createShader(Offset.zero & ukuran));
  p.paint(canvas, ukuran);
  return rekam.endRecording().toImage(ukuran.width.toInt(), ukuran.height.toInt());
}

void main() {
  test('motif: semua tahap progres tergambar (tiang dulu, trafo + pohon di akhir); tanpa trafo / pohon / ukuran nol tidak galat', () async {
    for (final prog in [0.0, .2, .5, .8, .9, 1.0]) {
      final img = await _gambar(PolaJaringanPainter(alpha: .25, kerapatan: 5, progres: prog), const Size(360, 140));
      expect(img.width, 360);
    }
    await _gambar(const PolaJaringanPainter(trafo: false, pohon: false), const Size(300, 100));
    await _gambar(const PolaJaringanPainter(kerapatan: 2), const Size(300, 100));
    const PolaJaringanPainter().paint(Canvas(ui.PictureRecorder()), Size.zero);
    expect(AppColors.navyLogo, const Color(0xFF0E1F4D));
    final simpan = Platform.environment['SISI_MOTIF_PNG'];
    if (simpan != null && simpan.isNotEmpty) {
      final img = await _gambar(const PolaJaringanPainter(alpha: .25, kerapatan: 5), const Size(720, 280));
      final data = await img.toByteData(format: ui.ImageByteFormat.png);
      File(simpan).writeAsBytesSync(data!.buffer.asUint8List());
    }
  });
}
