import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme/app_colors.dart';
import 'sisi_widgets.dart';

/// Kirim teks ke WhatsApp (app WA di HP; pilih grup/kontak di sana).
Future<void> kirimWa(BuildContext context, String teks) async {
  final uri = Uri.parse('https://api.whatsapp.com/send?text=${Uri.encodeComponent(teks)}');
  final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) tampilPesan(context, 'WhatsApp tidak bisa dibuka. Teks sudah bisa disalin.');
}

/// Buka app WhatsApp langsung lewat skema whatsapp:// (tanpa singgah di browser / api.whatsapp.com yang lambat).
/// Skema tidak ditangani (WA belum terpasang) = jalur biasa [kirimWa].
Future<void> kirimWaLangsung(BuildContext context, String teks) async {
  try {
    if (await launchUrl(Uri.parse('whatsapp://send?text=${Uri.encodeComponent(teks)}'), mode: LaunchMode.externalApplication)) return;
  } catch (_) {
    // lanjut ke jalur biasa
  }
  if (context.mounted) await kirimWa(context, teks);
}

Future<void> salinWa(BuildContext context, String teks) async {
  await Clipboard.setData(ClipboardData(text: teks));
  if (context.mounted) tampilPesan(context, 'Teks WA disalin.');
}

/// Kotak teks WA + tombol Salin / Kirim WA.
class WaPanel extends StatelessWidget {
  const WaPanel({super.key, required this.teks});
  final String teks;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: AppColors.neutral100, borderRadius: BorderRadius.circular(12)),
        child: SelectableText(teks, style: const TextStyle(fontSize: 12.5, height: 1.45, color: AppColors.neutral900)),
      ),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(
          child: OutlinedButton.icon(onPressed: () => salinWa(context, teks), icon: const Icon(Icons.copy_rounded, size: 18), label: const Text('Salin')),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: FilledButton.icon(
            onPressed: () => kirimWa(context, teks),
            style: FilledButton.styleFrom(backgroundColor: AppColors.success600),
            icon: const Icon(Icons.send_rounded, size: 18),
            label: const Text('Kirim WA'),
          ),
        ),
      ]),
    ]);
  }
}

/// Bottom sheet berisi WaPanel (dipakai kartu laporan & arsip).
Future<void> tampilkanWa(BuildContext context, {required String judul, required String teks}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (c) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: .8,
      maxChildSize: .95,
      builder: (c, ctl) => ListView(controller: ctl, padding: const EdgeInsets.fromLTRB(16, 14, 16, 24), children: [
        Center(
          child: Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.neutral300, borderRadius: BorderRadius.circular(4))),
        ),
        const SizedBox(height: 12),
        Text(judul, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.navy900)),
        const SizedBox(height: 12),
        WaPanel(teks: teks),
      ]),
    ),
  );
}

/// v0.97.4: logo WhatsApp (balon chat + gagang telepon) digambar langsung supaya tidak butuh font eksternal.
class LogoWa extends StatelessWidget {
  const LogoWa({super.key, this.ukuran = 22, this.warna = Colors.white});
  final double ukuran;
  final Color warna;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: ukuran,
        height: ukuran,
        child: CustomPaint(painter: _LogoWaPainter(warna)),
      );
}

class _LogoWaPainter extends CustomPainter {
  const _LogoWaPainter(this.warna);
  final Color warna;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width;
    final c = Offset(s * .52, s * .47);
    final r = s * .39;
    final garis = Paint()
      ..color = warna
      ..style = PaintingStyle.stroke
      ..strokeWidth = s * .095
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    // Lingkaran balon chat + ekor di kiri bawah
    final balon = Path()
      ..addArc(Rect.fromCircle(center: c, radius: r), 2.55, 5.45)
      ..lineTo(s * .14, s * .87)
      ..lineTo(s * .23, s * .67);
    canvas.drawPath(balon, garis);
    // Gagang telepon di tengah balon
    final telp = Paint()
      ..color = warna
      ..style = PaintingStyle.stroke
      ..strokeWidth = s * .09
      ..strokeCap = StrokeCap.round;
    final gagang = Path()
      ..moveTo(s * .40, s * .35)
      ..quadraticBezierTo(s * .36, s * .47, s * .47, s * .56)
      ..quadraticBezierTo(s * .56, s * .63, s * .65, s * .57);
    canvas.drawPath(gagang, telp);
  }

  @override
  bool shouldRepaint(covariant _LogoWaPainter oldDelegate) => oldDelegate.warna != warna;
}

/// v0.97.5: kartu pemberitahuan saat tombol WA diketuk tetapi data KM / koordinat / pekerjaan belum lengkap.
Future<void> tampilkanWaBelumSiap(
  BuildContext context, {
  required List<String> kurang,
  VoidCallback? onLengkapi,
}) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
    builder: (c) => SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: AppColors.neutral300, borderRadius: BorderRadius.circular(4)),
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.accent100,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.accent400),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Row(children: [
                Icon(Icons.info_outline_rounded, size: 22, color: AppColors.accent700),
                SizedBox(width: 10),
                Expanded(
                  child: Text('Laporan WA belum siap dikirim',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                ),
              ]),
              const SizedBox(height: 8),
              const Text('Lengkapi data berikut terlebih dahulu sebelum mengirim laporan ke WhatsApp:',
                  style: TextStyle(fontSize: 13.5, height: 1.4, color: AppColors.neutral900)),
              const SizedBox(height: 10),
              for (final item in kurang)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Padding(
                      padding: EdgeInsets.only(top: 5),
                      child: Icon(Icons.circle, size: 6, color: AppColors.accent700),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(item,
                          style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: AppColors.navy900)),
                    ),
                  ]),
                ),
            ]),
          ),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => Navigator.pop(c),
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                child: const Text('Tutup'),
              ),
            ),
            if (onLengkapi != null) ...[
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () {
                    Navigator.pop(c);
                    onLengkapi();
                  },
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: const Text('Lengkapi data'),
                ),
              ),
            ],
          ]),
        ]),
      ),
    ),
  );
}

/// Tombol bundar berlogo WhatsApp di samping tombol + pada KartuLaporanTim.
/// [siap] = hijau penuh (laporan siap kirim); false = redup, tetapi tetap menangkap ketukan ([onTap]) untuk
/// menampilkan kartu pemberitahuan data yang perlu dilengkapi (tidak meneruskan ketukan ke kartu di belakangnya).
class TombolWaBulat extends StatelessWidget {
  const TombolWaBulat({super.key, this.onTap, this.siap = true, this.tooltip = 'Kirim WA', this.tooltipMati = 'Lengkapi koordinat, KM, dan pekerjaan untuk kirim WA'});
  final VoidCallback? onTap;
  final bool siap;
  final String tooltip;

  /// Petunjuk saat tombol redup (mis. absensi: menunggu data tersinkron).
  final String tooltipMati;

  static const _hijauWa = Color(0xFF25D366);

  @override
  Widget build(BuildContext context) {
    final hijau = siap && onTap != null;
    return Tooltip(
      message: hijau ? tooltip : tooltipMati,
      child: SizedBox(
        width: 46,
        height: 46,
        child: Material(
          key: const ValueKey('tombol-wa-kartu'),
          color: hijau ? _hijauWa : const Color(0x26FFFFFF),
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap ?? () {},
            child: Center(
              child: LogoWa(ukuran: 22, warna: hijau ? Colors.white : const Color(0x80FFFFFF)),
            ),
          ),
        ),
      ),
    );
  }
}
