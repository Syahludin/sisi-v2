import 'package:flutter/material.dart';

import '../core/sinkron_atomik.dart';
import '../theme/app_colors.dart';

/// v1.0.17 (sinkron atomik): kartu status laporan modul tim. Hijau "Semua data tersinkron" hanya kalau laporan sudah
/// disegel server (ringkasan, rincian, realisasi, format WA cocok); selama antrean berjalan = "SiSi Sedang Proses
/// Sinkron Data"; antrean habis tapi belum disegel = "Memvalidasi".
class KartuStatusSinkron extends StatelessWidget {
  const KartuStatusSinkron({super.key, required this.tahap, this.menunggu = 0, this.gagal = 0, this.keteranganTolak, this.onSinkron});
  final TahapSinkron tahap;
  final int menunggu, gagal;

  /// Isi pengganti saat ditolak (mis. 'Buka rincian untuk alasannya.').
  final String? keteranganTolak;

  /// Tombol "Sinkron sekarang" (memverifikasi / proses). null = tanpa tombol.
  final VoidCallback? onSinkron;

  @override
  Widget build(BuildContext context) {
    if (tahap == TahapSinkron.kosong) return const SizedBox.shrink();
    final teks = teksTahapSinkron(tahap, menunggu: menunggu, gagal: gagal);
    final (IconData ikon, Color warna, Color latar) = switch (tahap) {
      TahapSinkron.ditolak => (Icons.error_outline_rounded, AppColors.red700, AppColors.red100),
      TahapSinkron.proses => (Icons.sync_rounded, AppColors.accent700, AppColors.accent100),
      TahapSinkron.memverifikasi => (Icons.fact_check_outlined, AppColors.brand700, AppColors.brand100),
      _ => (Icons.cloud_done_rounded, AppColors.success700, AppColors.success100),
    };
    final isi = tahap == TahapSinkron.ditolak && keteranganTolak != null ? keteranganTolak! : teks.isi;
    return Semantics(
      liveRegion: true,
      label: '${teks.judul}. $isi',
      child: Container(
        margin: const EdgeInsets.only(top: 14),
        padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
        decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(14)),
        child: Row(children: [
          Icon(ikon, size: 20, color: warna),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(teks.judul, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: warna)),
              if (isi.isNotEmpty) Text(isi, style: TextStyle(fontSize: 12, height: 1.3, color: warna)),
            ]),
          ),
          if (onSinkron != null && (tahap == TahapSinkron.memverifikasi || tahap == TahapSinkron.proses))
            IconButton(tooltip: 'Sinkron sekarang', onPressed: onSinkron, icon: Icon(Icons.refresh_rounded, color: warna)),
        ]),
      ),
    );
  }
}

/// v1.0.17: gerbang WA atomik. Laporan belum tersinkron = kartu penjelasan (WA dikunci); hasil true = boleh lanjut.
Future<bool> pastikanTersinkron(BuildContext context, TahapSinkron tahap, {int menunggu = 0, int gagal = 0, VoidCallback? onSinkron}) async {
  if (tahap == TahapSinkron.tersinkron) return true;
  final teks = teksTahapSinkron(tahap, menunggu: menunggu, gagal: gagal);
  await showDialog<void>(
    context: context,
    builder: (c) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      icon: const Icon(Icons.sync_lock_rounded, color: AppColors.accent700, size: 32),
      title: const Text('Format WA belum bisa dikirim', textAlign: TextAlign.center),
      content: Text(
        '${teks.judul}. ${teks.isi}\n\nWA baru tersedia sesudah ringkasan, rincian, realisasi, dan foto laporan diterima '
        'dan divalidasi server bersamaan, supaya laporan WA sama persis dengan data di server.',
        textAlign: TextAlign.center,
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c), child: const Text('Tutup')),
        if (onSinkron != null && tahap != TahapSinkron.ditolak)
          FilledButton.icon(
            onPressed: () {
              Navigator.pop(c);
              onSinkron();
            },
            icon: const Icon(Icons.sync_rounded, size: 18),
            label: const Text('Sinkron sekarang'),
          ),
      ],
    ),
  );
  return false;
}
