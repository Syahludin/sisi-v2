import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';

/// v0.89.0: bahasa desain Hartek, dipakai semua layar dan form Hartek.
/// Satu warna utama (brand SiSi), kartu putih lega, angka tabular, dan ikon untuk membedakan jenis lokasi.
/// Tidak memakai chip: status dan jumlah ditulis sebagai teks atau angka.
class HartekGaya {
  HartekGaya._();

  static const latar = AppColors.neutral50;
  static const tinta = AppColors.brand950;
  static const merek = AppColors.brand700;
  static const redup = Color(0xFF4F656D); // teks sekunder, kontras cukup di latar terang
  static const garis = AppColors.neutral200;
  static const radius = 18.0;

  static const putih60 = Color(0x99FFFFFF);
  static const putih85 = Color(0xD9FFFFFF);
  static const putih12 = Color(0x1FFFFFFF);

  static const gradien = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [AppColors.brand950, AppColors.brand800, AppColors.brand700],
    stops: [0, .62, 1], // v1.0.18: sama dengan SisiMotif.gradien
  );

  static const tabular = [FontFeature.tabularFigures()];

  static const judulBesar = TextStyle(fontSize: 26, height: 1.2, fontWeight: FontWeight.w800, letterSpacing: -.5, color: tinta);
  static const judulSeksi = TextStyle(fontSize: 17, height: 1.3, fontWeight: FontWeight.w700, color: tinta);
  static const sekunder = TextStyle(fontSize: 14, height: 1.45, color: redup);
  static const kode = TextStyle(fontFamily: 'monospace', fontSize: 13, letterSpacing: .2, color: redup);
}

/// Ikon + warna per jenis lokasi PG. Jaringan = biru SiSi, Gardu = amber, Non - Teknik = netral.
class JenisPg {
  const JenisPg(this.ikon, this.warna, this.latar);
  final IconData ikon;
  final Color warna;
  final Color latar;

  static JenisPg dari(String jenis) {
    switch (jenis.trim().toLowerCase()) {
      case 'jaringan':
        return const JenisPg(Icons.cable, AppColors.brand700, AppColors.brand100);
      case 'gardu':
        return const JenisPg(Icons.electrical_services_outlined, Color(0xFF835800), AppColors.accent100); // amber gelap: kontras teks
      default:
        return const JenisPg(Icons.handyman_outlined, AppColors.neutral700, AppColors.neutral150);
    }
  }
}

/// Kartu putih Hartek: radius 18, garis tipis, bayangan sangat halus. [onTap] membuat seluruh kartu bisa diketuk.
class KartuHartek extends StatelessWidget {
  const KartuHartek({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.margin = EdgeInsets.zero,
    this.onTap,
  });
  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry margin;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final bentuk = BorderRadius.circular(HartekGaya.radius);
    return Padding(
      padding: margin,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: bentuk,
          boxShadow: [BoxShadow(color: AppColors.brand950.withValues(alpha: .05), blurRadius: 14, offset: const Offset(0, 4))],
        ),
        child: Material(
          color: AppColors.surface,
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(borderRadius: bentuk, side: const BorderSide(color: HartekGaya.garis)),
          child: InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
        ),
      ),
    );
  }
}

/// Kotak beraksen kiri (bilah warna [aksen]) berlatar [latar] dengan sudut membulat. Dipakai kartu pekerjaan /
/// material di rincian Hartek dan WO Tindak Lanjut (v1.0.26, dibagi v1.0.28).
class KotakAksen extends StatelessWidget {
  const KotakAksen({
    super.key,
    required this.aksen,
    required this.latar,
    required this.child,
    this.radius = 12,
    this.padding = const EdgeInsets.fromLTRB(8, 6, 8, 6),
    this.lebarAksen = 4,
    this.margin = EdgeInsets.zero,
  });
  final Color aksen, latar;
  final double radius, lebarAksen;
  final EdgeInsetsGeometry padding, margin;
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
        margin: margin,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(radius)),
        child: IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(width: lebarAksen, color: aksen),
            Expanded(child: Padding(padding: padding, child: child)),
          ]),
        ),
      );
}

/// Kotak ikon berwarna lembut untuk jenis lokasi.
class KotakIkon extends StatelessWidget {
  const KotakIkon(this.jenis, {super.key, this.ukuran = 46});
  final JenisPg jenis;
  final double ukuran;

  @override
  Widget build(BuildContext context) => Container(
        width: ukuran,
        height: ukuran,
        decoration: BoxDecoration(color: jenis.latar, borderRadius: BorderRadius.circular(ukuran * .3)),
        child: Icon(jenis.ikon, color: jenis.warna, size: ukuran * .5),
      );
}

/// Keadaan kosong: ikon redup, judul, satu kalimat petunjuk.
class KosongHartek extends StatelessWidget {
  const KosongHartek({super.key, required this.ikon, required this.judul, required this.petunjuk});
  final IconData ikon;
  final String judul;
  final String petunjuk;

  @override
  Widget build(BuildContext context) => KartuHartek(
        padding: const EdgeInsets.all(18),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 40,
            height: 40,
            decoration: const BoxDecoration(color: AppColors.neutral100, shape: BoxShape.circle),
            child: Icon(ikon, size: 20, color: HartekGaya.redup),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(judul, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: HartekGaya.tinta)),
              const SizedBox(height: 4),
              Text(petunjuk, style: HartekGaya.sekunder),
            ]),
          ),
        ]),
      );
}

/// '2026-10-14' -> 'Rabu, 14 Oktober 2026' (tanpa bergantung data lokal intl).
String tanggalHartek(String iso) {
  final d = DateTime.tryParse(iso.trim());
  if (d == null) return iso;
  const hari = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  const bulan = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return '${hari[d.weekday - 1]}, ${d.day} ${bulan[d.month - 1]} ${d.year}';
}

/// Angka tampil: bulat tanpa desimal, selain itu 1 desimal.
String angkaHartek(num n) => n == n.roundToDouble() ? n.toInt().toString() : n.toStringAsFixed(1);
