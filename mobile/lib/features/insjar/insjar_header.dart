import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/lonceng.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/sisi_motif.dart';
import '../../widgets/sisi_widgets.dart';
import '../hartek/hartek_gaya.dart';

/// v1.0.5 (permintaan Master Guswan 20 Okt 2026): header halaman Inspeksi Jaringan dan Input Temuan Inspeksi, satu gaya untuk
/// semua layar. [aksi] = tombol di kanan atas (Segarkan di halaman utama, Kembali di halaman rincian).
/// v1.0.18: gaya "Jaringan SiSi" (gradien teal + motif tiang & kawat, percik kuning di kicker), dipakai semua modul.
class HeaderInsJar extends StatelessWidget {
  const HeaderInsJar({
    super.key,
    required this.kicker,
    required this.judul,
    required this.ikon,
    this.sub = '',
    this.aksi = const <Widget>[],
    this.lonceng = false,
  });

  final String kicker, judul, sub;
  final IconData ikon;
  final List<Widget> aksi;

  /// v1.0.19: lonceng notifikasi di kanan atas (halaman utama modul).
  final bool lonceng;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: LatarSisi(
        padding: const EdgeInsets.fromLTRB(16, 16, 10, 18),
        child: Row(children: [
          Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: .14),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withValues(alpha: .22)),
            ),
            child: Icon(ikon, color: Colors.white, size: 26),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const PercikSisi(tinggi: 11),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(kicker.toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1.2, color: HartekGaya.putih85)),
                ),
              ]),
              const SizedBox(height: 4),
              Text(judul,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800, letterSpacing: -.3, color: Colors.white)),
              if (sub.isNotEmpty)
                Text(sub,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13, color: HartekGaya.putih85)),
            ]),
          ),
          if (lonceng) LoncengNotifikasi(latar: Colors.white.withValues(alpha: .16)),
          if (aksi.isNotEmpty) ...[
            const SizedBox(width: 8),
            ...aksi,
          ],
        ]),
      ),
    );
  }
}

/// v1.0.28 (permintaan Master Guswan 23 Okt 2026): kartu header tetap di atas layar (tidak ikut tergulir); hanya [isi]
/// (biasanya RefreshSisi + ListView) yang bergulir di bawahnya. [lebarMaks] = batas lebar header, samakan dengan isi.
class HalamanHeaderTetap extends StatelessWidget {
  const HalamanHeaderTetap({
    super.key,
    required this.header,
    required this.isi,
    this.padding = const EdgeInsets.fromLTRB(16, 10, 16, 0),
    this.lebarMaks,
  });
  final Widget header, isi;
  final EdgeInsetsGeometry padding;
  final double? lebarMaks;

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: padding,
          child: lebarMaks == null ? header : Center(child: ConstrainedBox(constraints: BoxConstraints(maxWidth: lebarMaks!), child: header)),
        ),
        Expanded(child: isi),
      ]);
}

/// Tombol bulat di header (putih transparan).
/// v1.0.21: [sibuk] = logo SiSi bergerak (refresh SiSi) menggantikan ikon selama proses berjalan.
/// v1.0.22: tombol refresh header (logo SiSi, bergerak hanya saat diketuk; [sibuk] = loading halaman, tombol diam).
Widget tombolSegarkanHeader(FutureOr<void> Function()? aksi, {bool sibuk = false, String tip = 'Segarkan'}) => TombolSegarkan(
      sibuk: sibuk,
      onPressed: aksi,
      tooltip: tip,
      ukuran: 22,
      style: IconButton.styleFrom(
        backgroundColor: Colors.white.withValues(alpha: .16),
        disabledBackgroundColor: Colors.white.withValues(alpha: .10),
        side: BorderSide(color: Colors.white.withValues(alpha: .18)),
      ),
    );

Widget tombolHeaderInsJar(IconData ikon, String tip, VoidCallback? aksi, {bool sibuk = false}) => IconButton(
      tooltip: tip,
      onPressed: sibuk ? null : aksi,
      style: IconButton.styleFrom(
        backgroundColor: Colors.white.withValues(alpha: .16),
        foregroundColor: Colors.white,
        disabledForegroundColor: Colors.white38,
        side: BorderSide(color: Colors.white.withValues(alpha: .18)),
      ),
      icon: sibuk ? const SisiLoader(ukuran: 22, warna: Colors.white) : Icon(ikon),
    );
