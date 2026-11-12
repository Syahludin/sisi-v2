import 'dart:async';

import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import '../../widgets/sisi_loader.dart';
import 'tiang_api.dart';

/// Pilihan petugas atas sebuah draf (tiang / segmen) yang belum diterima server.
enum TindakDraf { perbaiki, kirimUlang, hapus }

/// Lembar pilihan draf: alasan (bila ada) + Perbaiki Isian / Kirim Ulang / Hapus Draf. [perluDiperbaiki] = server menolak isiannya.
Future<TindakDraf?> tampilTindakDraf(BuildContext context,
    {required String nama, required bool perluDiperbaiki, required String pesan, required List<GalatIsian> galat}) {
  return showModalBottomSheet<TindakDraf>(
    context: context,
    isScrollControlled: true,
    builder: (c) => SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Icon(perluDiperbaiki ? Icons.edit_note_rounded : Icons.cloud_off_outlined, color: perluDiperbaiki ? AppColors.red700 : AppColors.accent700),
            const SizedBox(width: 10),
            Expanded(
              child: Text(perluDiperbaiki ? '$nama: Draf Perlu Diperbaiki' : '$nama: Draf, Belum Terkirim',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.brand950)),
            ),
          ]),
          const SizedBox(height: 8),
          Text(
              perluDiperbaiki
                  ? 'Server menolak isian ini. Data dan foto aman di HP.'
                  : 'Tersimpan di HP (data dan foto). Dikirim otomatis saat ada sinyal, atau kirim sekarang.',
              style: const TextStyle(fontSize: 13, color: AppColors.neutral700)),
          if (pesan.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(pesan, style: const TextStyle(fontSize: 13, color: AppColors.red700, fontWeight: FontWeight.w700)),
          ],
          for (final g in galat.take(6))
            Padding(padding: const EdgeInsets.only(top: 4), child: Text('•  ${g.pesan}', style: const TextStyle(fontSize: 12.5, color: AppColors.red700))),
          const SizedBox(height: 14),
          FilledButton(onPressed: () => Navigator.pop(c, TindakDraf.perbaiki), child: const Text('Perbaiki Isian')),
          const SizedBox(height: 8),
          OutlinedButton(onPressed: () => Navigator.pop(c, TindakDraf.kirimUlang), child: const Text('Kirim Ulang')),
          const SizedBox(height: 8),
          TextButton(
              onPressed: () => Navigator.pop(c, TindakDraf.hapus),
              style: TextButton.styleFrom(foregroundColor: AppColors.red700),
              child: const Text('Hapus Draf')),
        ]),
      ),
    ),
  );
}

/// Konfirmasi membuang draf: foto di HP ikut terhapus dan tidak bisa dikembalikan (satu-satunya jalan membuang data yang belum terkirim).
Future<bool> konfirmasiHapusDraf(BuildContext context, String nama) async =>
    await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Hapus Draf?'),
        content: Text('Draf $nama akan dihapus dari HP. Isian dan FOTO yang belum terkirim ikut terhapus dan tidak bisa dikembalikan.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(
              onPressed: () => Navigator.pop(c, true),
              style: FilledButton.styleFrom(backgroundColor: AppColors.red700),
              child: const Text('Hapus Draf')),
        ],
      ),
    ) ==
    true;

/// Jalankan [kerja] sambil menahan layar dengan pemuat (kirim ulang draf).
Future<T> denganPemuat<T>(BuildContext context, Future<T> Function() kerja) async {
  unawaited(showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => const PopScope(canPop: false, child: Center(child: SisiLoader(ukuran: 56))),
  ));
  try {
    return await kerja();
  } finally {
    if (context.mounted) Navigator.of(context, rootNavigator: true).pop();
  }
}
