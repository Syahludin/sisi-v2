import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// v1.0.22 (permintaan Master Guswan 23 Okt 2026): aplikasi WAJIB update tetapi petugas menutup kartu update. Halaman tetap
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

  /// Terkunci = kartu update tampil (v1.0.26: kartu yang sama dengan cek versi) dan hasil true (pemanggil berhenti,
  /// tidak membuka input).
  static bool tolak(BuildContext context) {
    if (!aktif.value) return false;
    bukaUpdate?.call();
    return true;
  }
}

/// Pita merah di atas semua halaman selama [KunciUpdate.aktif] (dipasang MaterialApp.builder): ketuk = kartu update.
/// Halaman di bawahnya tidak lagi menambah jarak status bar (sudah dipakai pita). Susunan widget tetap sama saat pita
/// muncul / hilang supaya navigator (halaman yang sedang terbuka) tidak dibangun ulang.
class PitaKunciUpdate extends StatelessWidget {
  const PitaKunciUpdate({super.key, required this.tampil, required this.child, this.sudahMasuk = true});
  final bool tampil;

  /// false = halaman login: pita mengajak update sebelum masuk (input / sinkron belum ada yang dimatikan).
  final bool sudahMasuk;
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
                Expanded(
                  child: Text(sudahMasuk ? '${KunciUpdate.pesan}. Input & sinkron dimatikan.' : '${KunciUpdate.pesan}. Update sebelum masuk.',
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
