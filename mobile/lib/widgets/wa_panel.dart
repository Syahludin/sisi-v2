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
