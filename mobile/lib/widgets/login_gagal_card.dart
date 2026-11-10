import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Jenis kartu login gagal (v0.62.3). null = bukan kartu (pesan biasa di form).
enum JenisLoginGagal { salah, dibatasi, sibuk }

/// Kode server -> jenis kartu. Server sengaja menjawab LOGIN_GAGAL untuk username tidak ada, password salah,
/// DAN akun terkunci (v0.48, tidak membocorkan username ada), jadi kartu "salah" selalu menyebut kemungkinan dikunci.
JenisLoginGagal? jenisLoginGagal(String kode) => switch (kode) {
      'LOGIN_GAGAL' || 'AKUN_TERKUNCI' => JenisLoginGagal.salah,
      'LOGIN_DIBATASI' => JenisLoginGagal.dibatasi,
      'TERLALU_SERING' || 'SERVER_SIBUK' => JenisLoginGagal.sibuk,
      _ => null,
    };

/// Percobaan ke berapa kartu menampilkan peringatan 15 menit (server membatasi login setelah 5x salah).
/// v0.63.2 (keputusan Master Guswan 8 Okt 2026): baru diberitahu saat sudah 5x, bukan mulai ke-3.
const int batasPeringatanLogin = 5;

/// Kartu login gagal. [percobaan] = jumlah salah berturut-turut di HP ini (hitungan lokal, bukan dari server).
Future<void> tampilkanLoginGagal(BuildContext context, {required String kode, required String username, int percobaan = 1}) {
  final jenis = jenisLoginGagal(kode) ?? JenisLoginGagal.salah;
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    barrierColor: AppColors.navy950.withValues(alpha: .72),
    builder: (c) => KartuLoginGagal(jenis: jenis, username: username, percobaan: percobaan, onTutup: () => Navigator.pop(c)),
  );
}

class KartuLoginGagal extends StatelessWidget {
  const KartuLoginGagal({super.key, required this.jenis, required this.username, required this.percobaan, required this.onTutup});

  final JenisLoginGagal jenis;
  final String username;
  final int percobaan;
  final VoidCallback onTutup;

  ({Color warna, Color latar, IconData ikon, String label, String judul, String isi}) get _gaya => switch (jenis) {
        JenisLoginGagal.salah => (
            warna: AppColors.red600,
            latar: AppColors.red100,
            ikon: Icons.lock_person_rounded,
            label: 'LOGIN GAGAL',
            judul: 'Username atau kata sandi salah',
            isi: 'Periksa lagi username dan kata sandi, lalu coba masuk.',
          ),
        JenisLoginGagal.dibatasi => (
            warna: AppColors.amber700,
            latar: AppColors.accent100,
            ikon: Icons.hourglass_top_rounded,
            label: 'LOGIN DITAHAN',
            judul: 'Terlalu banyak percobaan',
            isi: 'Tunggu 15 menit lalu coba lagi. Kalau kamu tidak mencoba berkali-kali, lapor admin: '
                'akun ini mungkin sedang dicoba orang lain.',
          ),
        JenisLoginGagal.sibuk => (
            warna: AppColors.navy700,
            latar: AppColors.navy100,
            ikon: Icons.cloud_sync_rounded,
            label: 'SERVER SIBUK',
            judul: 'Coba lagi sebentar',
            isi: 'Banyak permintaan masuk bersamaan. Tunggu sekitar 1 menit lalu ketuk Masuk lagi.',
          ),
      };

  @override
  Widget build(BuildContext context) {
    final g = _gaya;
    final peringatan = jenis == JenisLoginGagal.salah && percobaan >= batasPeringatanLogin;
    return PopScope(
      canPop: false,
      child: Dialog(
        backgroundColor: Colors.transparent,
        child: SingleChildScrollView(
          child: Container(
          padding: const EdgeInsets.fromLTRB(22, 24, 22, 18),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24)),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 76,
              height: 76,
              decoration: BoxDecoration(color: g.latar, shape: BoxShape.circle),
              child: Icon(g.ikon, color: g.warna, size: 42),
            ),
            const SizedBox(height: 14),
            Text(g.label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1, color: g.warna)),
            const SizedBox(height: 4),
            Text(g.judul,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.navy900)),
            const SizedBox(height: 8),
            Text(g.isi, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12.5, color: AppColors.neutral700, height: 1.35)),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: AppColors.neutral100, borderRadius: BorderRadius.circular(14)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                _Baris(label: 'Username', nilai: username.trim().isEmpty ? '-' : username.trim().toLowerCase()),
                // v0.63.2 (keputusan Master Guswan 8 Okt 2026): tanpa hitungan salah, cukup 2 poin pengecekan
                if (jenis == JenisLoginGagal.salah) ...[
                  const SizedBox(height: 6),
                  const Text(
                    '• Kata sandi membedakan huruf besar / kecil.\n'
                    '• Username berformat 16130.nama (huruf kecil, tanpa spasi).',
                    style: TextStyle(fontSize: 11.5, color: AppColors.neutral700, height: 1.4),
                  ),
                ],
              ]),
            ),
            if (peringatan) ...[
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(12)),
                child: const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Icon(Icons.warning_amber_rounded, size: 18, color: AppColors.accent700),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Sudah 5 kali salah. Coba login lagi dalam 15 menit atau hubungi Admin.',
                      style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: AppColors.neutral900),
                    ),
                  ),
                ]),
              ),
            ],
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 46,
              child: FilledButton(
                onPressed: onTutup,
                style: FilledButton.styleFrom(
                  backgroundColor: jenis == JenisLoginGagal.salah ? AppColors.navy700 : g.warna,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
                ),
                child: Text(jenis == JenisLoginGagal.salah ? 'Coba Lagi' : 'Mengerti'),
              ),
            ),
          ]),
          ),
        ),
      ),
    );
  }
}

class _Baris extends StatelessWidget {
  const _Baris({required this.label, required this.nilai});
  final String label;
  final String nilai;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 2),
        child: Row(children: [
          SizedBox(width: 108, child: Text(label, style: const TextStyle(fontSize: 12, color: AppColors.neutral500))),
          Expanded(
            child: Text(nilai,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
          ),
        ]),
      );
}
