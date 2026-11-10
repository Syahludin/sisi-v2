import 'dart:async';

import 'package:flutter/material.dart';

import '../core/lonceng.dart';
import '../theme/app_colors.dart';
import 'sisi_loader.dart';
import 'sisi_motif.dart';

/// App bar navy dua baris (pola layar lama): judul + subjudul kecil, opsional pill Online/Offline.
/// v1.0.18: latar gradien teal + motif tiang & kawat "Jaringan SiSi" (sama dengan header modul).
PreferredSizeWidget sisiAppBar(String judul, {String? subjudul, List<Widget>? actions, bool? online}) {
  return AppBar(
    backgroundColor: AppColors.brand900,
    flexibleSpace: const DecoratedBox(
      decoration: BoxDecoration(gradient: SisiMotif.gradien),
      child: CustomPaint(painter: PolaJaringanPainter(alpha: .09, kerapatan: 5), size: Size.infinite),
    ),
    foregroundColor: Colors.white,
    iconTheme: const IconThemeData(color: Colors.white),
    actionsIconTheme: const IconThemeData(color: Colors.white),
    elevation: 0,
    titleSpacing: 16,
    title: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(judul, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white)),
        if (subjudul != null)
          Text(subjudul, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w500, color: Colors.white.withValues(alpha: .78))),
      ],
    ),
    actions: [
      if (online != null) Padding(padding: const EdgeInsets.only(right: 4), child: OnlinePill(online: online)),
      const LoncengNotifikasi(), // v1.0.19
      ...?actions,
      const SizedBox(width: 6),
    ],
  );
}

/// Pill Online/Offline (titik 7px, label 9px tebal).
class OnlinePill extends StatelessWidget {
  const OnlinePill({super.key, required this.online});
  final bool online;

  @override
  Widget build(BuildContext context) {
    final warna = online ? AppColors.success600 : AppColors.red600;
    return Center(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: .12),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white.withValues(alpha: .35)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 7, height: 7, decoration: BoxDecoration(color: warna, shape: BoxShape.circle)),
          const SizedBox(width: 5),
          Text(online ? 'ONLINE' : 'OFFLINE',
              style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: .4)),
        ]),
      ),
    );
  }
}

/// Kartu putih radius 18 dengan judul seksi huruf besar + ikon cyan (form header lama).
class SectionCard extends StatelessWidget {
  const SectionCard({super.key, required this.judul, required this.ikon, required this.children, this.aksi});
  final String judul;
  final IconData ikon;
  final List<Widget> children;

  /// Tombol kecil di kanan judul (mis. Edit). null = tidak ada.
  final Widget? aksi;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.neutral200),
        boxShadow: [BoxShadow(color: AppColors.navy900.withValues(alpha: .04), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          // v1.0.18: ikon dalam kotak teal lembut + percik kuning, sama dengan judul seksi Jaringan SiSi
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(color: AppColors.brand100, borderRadius: BorderRadius.circular(9)),
            child: Icon(ikon, size: 17, color: AppColors.brand700),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(judul.toUpperCase(),
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: .7, color: AppColors.brand900)),
          ),
          if (aksi != null) aksi!,
        ]),
        const SizedBox(height: 14),
        ...children,
      ]),
    );
  }
}

/// Dekorasi input form header lama: label 11.5 tebal, isi #F8FAFC, radius 12, fokus cyan.
InputDecoration sisiInput(String label, {String? hint, Widget? suffix, String? helper}) {
  OutlineInputBorder b(Color c, [double w = 1]) =>
      OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c, width: w));
  return InputDecoration(
    labelText: label,
    hintText: hint,
    helperText: helper,
    suffixIcon: suffix,
    isDense: true,
    filled: true,
    fillColor: AppColors.surface, // v1.0.19: putih di atas kartu, fokus teal SiSi
    labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.neutral500),
    floatingLabelStyle: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.brand700),
    hintStyle: const TextStyle(fontSize: 12, color: AppColors.neutral400),
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    border: b(AppColors.neutral200),
    enabledBorder: b(AppColors.neutral200),
    focusedBorder: b(AppColors.brand600, 1.8),
    errorBorder: b(AppColors.red600),
    focusedErrorBorder: b(AppColors.red600, 1.6),
  );
}

/// Badge status kecil (SIAP WA / PROSES / status sinkron).
class StatusBadge extends StatelessWidget {
  const StatusBadge(this.teks, {super.key, required this.warna, required this.latar, this.ikon});
  final String teks;
  final Color warna;
  final Color latar;
  final IconData? ikon;

  factory StatusBadge.sinkron(String sinkron, {Key? key}) {
    return switch (sinkron) {
      'TERKIRIM' => StatusBadge('TERKIRIM', key: key, warna: AppColors.success700, latar: AppColors.success100, ikon: Icons.cloud_done_outlined),
      'KONFLIK' => StatusBadge('PERLU DICEK', key: key, warna: AppColors.accent700, latar: AppColors.accent100, ikon: Icons.sync_problem_outlined),
      'DITOLAK' => StatusBadge('DITOLAK', key: key, warna: AppColors.red700, latar: AppColors.red100, ikon: Icons.block_outlined),
      _ => StatusBadge('BELUM TERKIRIM', key: key, warna: AppColors.neutral700, latar: AppColors.neutral100, ikon: Icons.cloud_upload_outlined),
    };
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(999)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (ikon != null) ...[Icon(ikon, size: 12, color: warna), const SizedBox(width: 4)],
        Text(teks, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: warna, letterSpacing: .4)),
      ]),
    );
  }
}

/// Loading layar penuh / bagian layar. v1.0.17: animasi logo SiSi ([SisiLoader]) menggantikan loading.gif lama.
class SisiLoading extends StatelessWidget {
  const SisiLoading({super.key, this.pesan, this.ukuran = 80});
  final String? pesan;
  final double ukuran;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        SisiLoader(ukuran: ukuran),
        if (pesan != null) ...[
          const SizedBox(height: 10),
          Text(pesan!, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        ],
      ]),
    );
  }
}

/// Kosong / error dengan ikon, teks, tombol opsional.
class SisiKosong extends StatelessWidget {
  const SisiKosong({super.key, required this.ikon, required this.judul, this.pesan, this.tombol, this.onTombol});
  final IconData ikon;
  final String judul;
  final String? pesan;
  final String? tombol;
  final VoidCallback? onTombol;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [AppColors.brand100, AppColors.brand50], begin: Alignment.topLeft, end: Alignment.bottomRight),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.brand100),
            ),
            child: Icon(ikon, color: AppColors.brand700, size: 30),
          ),
          const SizedBox(height: 14),
          Text(judul, textAlign: TextAlign.center, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy900)),
          if (pesan != null) ...[
            const SizedBox(height: 6),
            Text(pesan!, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
          ],
          if (tombol != null) ...[
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onTombol, child: Text(tombol!)),
          ],
        ]),
      ),
    );
  }
}

/// Tombol refresh kanan atas app bar ROW (v0.49): spinner putih selama berjalan.
/// v1.0.22 (permintaan Master Guswan 23 Okt 2026): tombol refresh berlogo SiSi. Diam = logo S utuh (bukan panah melingkar);
/// diketuk = logo bergerak sampai [onPressed] selesai. Hanya SATU loading yang bergerak: [sibuk] (loading halaman saat
/// masuk / tarik-untuk-refresh / sinkron otomatis) = tombol nonaktif dan logonya diam, loading halaman yang tampil.
/// [onPressed] sebaiknya mengembalikan Future supaya logo bergerak selama refresh berjalan.
class TombolSegarkan extends StatefulWidget {
  const TombolSegarkan(
      {super.key, required this.sibuk, required this.onPressed, this.warna = Colors.white, this.ukuran = 20, this.style, this.tooltip = 'Refresh'});
  final bool sibuk;
  final FutureOr<void> Function()? onPressed;
  final Color warna;
  final double ukuran;
  final ButtonStyle? style;
  final String tooltip;

  @override
  State<TombolSegarkan> createState() => _TombolSegarkanState();
}

class _TombolSegarkanState extends State<TombolSegarkan> {
  bool _jalan = false;

  Future<void> _tekan() async {
    setState(() => _jalan = true);
    try {
      await widget.onPressed?.call();
    } finally {
      if (mounted) setState(() => _jalan = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final nonaktif = _jalan || widget.sibuk || widget.onPressed == null;
    return IconButton(
      tooltip: widget.tooltip,
      style: widget.style,
      onPressed: nonaktif ? null : _tekan,
      icon: SisiLoader(
        ukuran: widget.ukuran,
        warna: !_jalan && nonaktif ? widget.warna.withValues(alpha: .45) : widget.warna,
        diam: !_jalan,
      ),
    );
  }
}

/// Isi yang tidak bisa di-scroll (mis. SisiKosong) dibuat bisa ditarik untuk refresh.
Widget bisaDitarik(Widget child) => LayoutBuilder(
      builder: (c, k) => ListView(physics: const AlwaysScrollableScrollPhysics(), children: [
        SizedBox(height: k.maxHeight, child: child),
      ]),
    );

void tampilPesan(BuildContext context, String pesan) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(pesan)));
}

/// v1.0.31 (permintaan Master Guswan 24 Okt 2026): kolom wajib yang kosong = tidak bisa disimpan. Validasi Form (kolom salah jadi
/// merah), lalu gulir ke kolom pertama yang salah. true = semua benar.
bool validasiForm(GlobalKey<FormState> kunci) {
  final st = kunci.currentState;
  if (st == null) return false;
  final salah = st.validateGranularly();
  if (salah.isEmpty) return true;
  gulirKe(salah.first.context);
  return false;
}

/// Gulir supaya [c] (kolom / kartu) terlihat, sedikit di bawah tepi atas layar.
void gulirKe(BuildContext? c) {
  if (c == null || !c.mounted) return;
  unawaited(Scrollable.ensureVisible(c, duration: const Duration(milliseconds: 300), alignment: .15));
}

/// v1.0.31: bingkai merah + pesan untuk isian wajib yang bukan kolom teks (pilihan kotak, foto). [salah] null = polos.
class BingkaiWajib extends StatelessWidget {
  const BingkaiWajib({super.key, required this.salah, required this.child});
  final String? salah;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final e = salah;
    if (e == null) return child;
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 6),
      decoration: BoxDecoration(
        color: AppColors.red100.withValues(alpha: .55),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.red600, width: 1.4),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
        child,
        Padding(
          padding: const EdgeInsets.only(top: 6, left: 2),
          child: Semantics(
            liveRegion: true,
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.error_outline_rounded, size: 15, color: AppColors.red700),
              const SizedBox(width: 6),
              Expanded(child: Text(e, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.red700))),
            ]),
          ),
        ),
      ]),
    );
  }
}
