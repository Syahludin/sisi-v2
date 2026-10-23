import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// v1.0.22 (permintaan kvlar 23 Okt 2026): aplikasi WAJIB update tetapi petugas menutup kartu update. Halaman tetap
/// bisa dibuka (data di HP + baca dari server), tetapi INPUT (form, lewat [bukaForm]) dan SINKRON (kirim antrean,
/// SyncController) mati sampai aplikasi terupdate. Panggilan tulis ke server ditolak di ApiClient sebelum dikirim.
/// Data yang belum terkirim tetap aman di HP dan dikirim setelah update.
class KunciUpdate {
  KunciUpdate._();

  /// true = server lebih baru dari minimum aplikasi ini (diisi PemeriksaVersi tiap cek versi).
  static final ValueNotifier<bool> aktif = ValueNotifier<bool>(false);

  static const pesan = 'Terdapat Pembaharuan Aplikasi, Silahkan lakukan Update Aplikasi';

  /// Dipasang app: buka kartu update (cek versi + Update Sekarang).
  static VoidCallback? bukaUpdate;

  /// Aksi server yang tetap boleh saat terkunci: baca data, sesi, notifikasi, unduh update.
  static bool bolehAksi(String action) =>
      action.startsWith('get') || const {'ping', 'login', 'logout', 'cekSesi', 'mulaiShiftYandal', 'daftarNotif', 'tandaiNotifikasi'}.contains(action);

  /// Terkunci = kartu pemberitahuan tampil dan hasil true (pemanggil berhenti, tidak membuka input).
  static bool tolak(BuildContext context) {
    if (!aktif.value) return false;
    tampilkan(context);
    return true;
  }

  static void tampilkan(BuildContext context) {
    showDialog<void>(
      context: context,
      useRootNavigator: true,
      builder: (d) => AlertDialog(
        icon: const Icon(Icons.system_update_rounded, size: 40, color: AppColors.red700),
        title: const Text('Update Aplikasi', textAlign: TextAlign.center),
        content: const Text('$pesan.\n\nInput dan sinkron data dimatikan sampai aplikasi terupdate. Data yang belum terkirim tetap aman di HP.',
            textAlign: TextAlign.center, style: TextStyle(fontSize: 13)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d), child: const Text('Tutup')),
          FilledButton.icon(
            onPressed: () {
              Navigator.pop(d);
              bukaUpdate?.call();
            },
            icon: const Icon(Icons.system_update_rounded),
            label: const Text('Update Sekarang'),
          ),
        ],
      ),
    );
  }
}

/// Pita merah di atas semua halaman selama [KunciUpdate.aktif] (dipasang MaterialApp.builder): ketuk = kartu update.
/// Halaman di bawahnya tidak lagi menambah jarak status bar (sudah dipakai pita). Susunan widget tetap sama saat pita
/// muncul / hilang supaya navigator (halaman yang sedang terbuka) tidak dibangun ulang.
class PitaKunciUpdate extends StatelessWidget {
  const PitaKunciUpdate({super.key, required this.tampil, required this.child});
  final bool tampil;
  final Widget child;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<bool>(
        valueListenable: KunciUpdate.aktif,
        builder: (c, aktif, _) {
          final ada = aktif && tampil;
          return Column(children: [
            if (ada) _pita() else const SizedBox.shrink(),
            Expanded(child: MediaQuery.removePadding(context: c, removeTop: ada, child: child)),
          ]);
        },
      );

  Widget _pita() => Material(
        color: AppColors.red700,
        child: InkWell(
          onTap: () => KunciUpdate.bukaUpdate?.call(),
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 8, 10, 8),
              child: Row(children: [
                const Icon(Icons.system_update_rounded, color: Colors.white, size: 20),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text('${KunciUpdate.pesan}. Input & sinkron dimatikan.',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
                  child: const Text('Update', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: AppColors.red700)),
                ),
              ]),
            ),
          ),
        ),
      );
}
