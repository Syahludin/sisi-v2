import 'package:flutter/material.dart';

import '../../core/deps.dart';
import '../../core/env.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import 'download_master_card.dart';

/// Pengaturan (desain lama): kartu akun, Master Data, kartu merah "Keluar dari Akun". Sinkron data hanya di Beranda.
/// Logout ditolak selama outbox masih berisi data (PRD F-AUTH, Alur logout).
class PengaturanScreen extends StatefulWidget {
  const PengaturanScreen({super.key, required this.deps, required this.sesi, required this.onLogout});
  final Deps deps;
  final Sesi sesi;
  final VoidCallback onLogout;

  @override
  State<PengaturanScreen> createState() => _PengaturanScreenState();
}

class _PengaturanScreenState extends State<PengaturanScreen> {
  bool _keluar = false;

  Future<void> _logout() async {
    final ctl = widget.deps.syncCtl;
    await ctl.hitungUlang();
    if (!mounted) return;
    if (ctl.belumTerkirim > 0) {
      tampilPesan(context, 'Masih ada ${ctl.belumTerkirim} data belum terkirim. Sinkronkan dulu dari Beranda.');
      return;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('Keluar dari akun?', style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy900)),
        content: const Text('Anda perlu login lagi untuk memakai aplikasi di HP ini.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.red600, foregroundColor: Colors.white),
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Keluar'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _keluar = true);
    await widget.deps.auth.logout(widget.sesi);
    widget.onLogout();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.sesi;
    final ctl = widget.deps.syncCtl;
    return ListenableBuilder(
      listenable: ctl,
      builder: (context, _) => Scaffold(
        backgroundColor: Colors.transparent,
        appBar: sisiAppBar('Pengaturan', subjudul: 'Akun & master data', online: ctl.online ?? false),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
          children: [
            _Kartu(
              child: Row(children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(color: AppColors.cyan100, borderRadius: BorderRadius.circular(16)),
                  child: const Icon(Icons.account_circle_outlined, size: 30, color: AppColors.navy700),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(s.nama, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                    const SizedBox(height: 2),
                    Text(s.username, style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
                    const SizedBox(height: 8),
                    Wrap(spacing: 6, runSpacing: 6, children: [
                      StatusBadge(s.role, warna: AppColors.navy700, latar: AppColors.navy100),
                      if (s.timNama.isNotEmpty) StatusBadge(s.timNama, warna: AppColors.accent700, latar: AppColors.accent100),
                      StatusBadge('ULP ${s.ulp}', warna: AppColors.neutral700, latar: AppColors.neutral100),
                    ]),
                  ]),
                ),
              ]),
            ),
            const SizedBox(height: 14),
            DownloadMasterCard(deps: widget.deps, sesi: s),
            const SizedBox(height: 14),
            Material(
              color: AppColors.red100,
              borderRadius: BorderRadius.circular(18),
              child: InkWell(
                borderRadius: BorderRadius.circular(18),
                onTap: _keluar ? null : _logout,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(children: [
                    const Icon(Icons.logout, color: AppColors.red700),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('Keluar dari Akun', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.red700)),
                        SizedBox(height: 2),
                        Text('Ditolak bila masih ada data belum terkirim',
                            style: TextStyle(fontSize: 11.5, color: AppColors.red600)),
                      ]),
                    ),
                    if (_keluar)
                      const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.red700))
                    else
                      const Icon(Icons.chevron_right, color: AppColors.red700),
                  ]),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Center(
              child: Text('SiSi ULP Toboali ${Env.isStaging ? 'STAGING' : ''} · v0.50',
                  style: const TextStyle(fontSize: 11, color: AppColors.neutral400)),
            ),
          ],
        ),
      ),
    );
  }
}

class _Kartu extends StatelessWidget {
  const _Kartu({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.neutral200),
          boxShadow: [BoxShadow(color: AppColors.navy900.withValues(alpha: .04), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: child,
      );
}
