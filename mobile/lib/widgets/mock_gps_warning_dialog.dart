import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Dialog lokasi palsu (desain lama): tidak bisa ditutup dengan ketuk luar.
/// catatan: teks kecil di bawah tombol (login: 'Login ditolak.'; form/kamera: koordinat tidak disimpan).
Future<void> tampilkanMockGpsWarning(BuildContext context, {String catatan = 'Lokasi palsu terdeteksi. Koordinat tidak disimpan.'}) {
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (c) => Dialog(
      backgroundColor: AppColors.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 28, 24, 20),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 80,
            height: 80,
            decoration: const BoxDecoration(color: AppColors.red100, shape: BoxShape.circle),
            child: const Icon(Icons.cancel_rounded, size: 52, color: AppColors.red600),
          ),
          const SizedBox(height: 16),
          const Text('Silahkan Matikan Aplikasi Pihak Ke-3 GPS',
              textAlign: TextAlign.center, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy900)),
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            child: FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Mengerti')),
          ),
          const SizedBox(height: 10),
          Text(catatan, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
        ]),
      ),
    ),
  );
}

/// Kartu notifikasi paksa logout karena lokasi palsu terdeteksi saat sesi aktif (v0.39).
Future<void> tampilkanLogoutGpsPalsu(BuildContext context) {
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (c) => PopScope(
      canPop: false,
      child: Dialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 28, 24, 20),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 80,
              height: 80,
              decoration: const BoxDecoration(color: AppColors.red100, shape: BoxShape.circle),
              child: const Icon(Icons.gpp_bad_rounded, size: 50, color: AppColors.red600),
            ),
            const SizedBox(height: 16),
            const Text('Kamu Dikeluarkan dari SiSi',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.navy900)),
            const SizedBox(height: 8),
            const Text(
              'Lokasi palsu (fake GPS) terdeteksi saat aplikasi dipakai, jadi sesi diakhiri otomatis dan dicatat ke admin.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: AppColors.neutral700),
            ),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: AppColors.neutral100, borderRadius: BorderRadius.circular(12)),
              child: const Text(
                '1. Matikan / hapus aplikasi GPS palsu.\n'
                '2. Opsi pengembang > Pilih aplikasi lokasi palsu > Tidak ada.\n'
                '3. Login ulang. Data yang belum terkirim tetap aman di HP.',
                style: TextStyle(fontSize: 12, color: AppColors.neutral700, height: 1.4),
              ),
            ),
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Mengerti')),
            ),
          ]),
        ),
      ),
    ),
  );
}
