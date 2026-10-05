import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// App bar navy dua baris (pola layar lama): judul + subjudul kecil, opsional pill Online/Offline.
PreferredSizeWidget sisiAppBar(String judul, {String? subjudul, List<Widget>? actions, bool? online}) {
  return AppBar(
    backgroundColor: AppColors.navy700,
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
          Icon(ikon, size: 18, color: AppColors.cyan600),
          const SizedBox(width: 8),
          Expanded(
            child: Text(judul.toUpperCase(),
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: .6, color: AppColors.navy700)),
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
    fillColor: const Color(0xFFF8FAFC),
    labelStyle: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.neutral500),
    hintStyle: const TextStyle(fontSize: 12, color: AppColors.neutral400),
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    border: b(AppColors.neutral200),
    enabledBorder: b(AppColors.neutral200),
    focusedBorder: b(AppColors.cyan600, 1.6),
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
      'KONFLIK' => StatusBadge('KONFLIK', key: key, warna: AppColors.accent700, latar: AppColors.accent100, ikon: Icons.sync_problem_outlined),
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

/// Loading lama: loading.gif, cadangan spinner cyan.
class SisiLoading extends StatelessWidget {
  const SisiLoading({super.key, this.pesan, this.ukuran = 80});
  final String? pesan;
  final double ukuran;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Image.asset('assets/images/loading.gif',
            width: ukuran,
            height: ukuran,
            errorBuilder: (context, error, stack) => const CircularProgressIndicator(color: AppColors.cyan600)),
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
            width: 56,
            height: 56,
            decoration: BoxDecoration(color: AppColors.cyan100, borderRadius: BorderRadius.circular(16)),
            child: Icon(ikon, color: AppColors.navy700, size: 28),
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
class TombolSegarkan extends StatelessWidget {
  const TombolSegarkan({super.key, required this.sibuk, required this.onPressed});
  final bool sibuk;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => IconButton(
        tooltip: 'Refresh',
        onPressed: sibuk ? null : onPressed,
        icon: sibuk
            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
            : const Icon(Icons.refresh_rounded),
      );
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
