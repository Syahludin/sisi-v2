import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';

/// Beranda (desain lama): kartu profil navy, status sync, akses cepat.
class BerandaScreen extends StatelessWidget {
  const BerandaScreen({super.key, required this.deps, required this.sesi, required this.keLaporan});
  final Deps deps;
  final Sesi sesi;
  final VoidCallback keLaporan;

  @override
  Widget build(BuildContext context) {
    final ctl = deps.syncCtl;
    return ListenableBuilder(
      listenable: ctl,
      builder: (context, _) => Scaffold(
        backgroundColor: const Color(0xFFF5F7FB),
        // Satu-satunya tombol sinkron ada di kartu sync (plus tarik ke bawah). Sync juga otomatis tiap 5 menit.
        appBar: sisiAppBar('Beranda', online: ctl.online),
        body: RefreshIndicator(
          onRefresh: ctl.sinkron,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 112),
            children: [
              _Hero(sesi: sesi),
              const SizedBox(height: 16),
              _KartuSync(deps: deps),
              const SizedBox(height: 20),
              const Row(children: [
                Text('Akses cepat', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                SizedBox(width: 8),
                Text('sesuai role', style: TextStyle(fontSize: 12, color: AppColors.neutral500)),
              ]),
              const SizedBox(height: 10),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.25,
                children: [
                  if (sesi.modeAdmin)
                    _AksesCepat(ikon: Icons.dashboard_customize_outlined, judul: 'Operasi', sub: 'Laporan per tim & modul teknik', onTap: keLaporan)
                  else if (sesi.aksiMenu('ROW_EKSEKUSI') != null)
                    _AksesCepat(ikon: Icons.forest_outlined, judul: 'Laporan ROW', sub: 'Header, penyulang, eksekusi', onTap: keLaporan),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.sesi});
  final Sesi sesi;

  @override
  Widget build(BuildContext context) {
    final tgl = DateFormat('EEEE, d MMMM y', 'id_ID').format(DateTime.now()).toUpperCase();
    Widget chip(IconData i, String t) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(color: AppColors.cyan600.withValues(alpha: .22), borderRadius: BorderRadius.circular(999)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(i, size: 9, color: AppColors.accent400),
            const SizedBox(width: 5),
            Text(t, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white)),
          ]),
        );
    Widget yel(String t, Color warna) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: warna.withValues(alpha: .20),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: warna.withValues(alpha: .55)),
          ),
          child: Text(t, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: Colors.white)),
        );
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: AppColors.navy700, borderRadius: BorderRadius.circular(24)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(tgl, style: const TextStyle(fontSize: 10, letterSpacing: 1, fontWeight: FontWeight.w700, color: AppColors.accent400)),
        const SizedBox(height: 8),
        Text('Halo, ${sesi.nama}', style: const TextStyle(fontSize: 25, fontWeight: FontWeight.w900, color: Colors.white)),
        const SizedBox(height: 6),
        // Yel-yel K3 (permintaan 3 Okt 2026), menggantikan teks "Catat pekerjaan ROW hari ini..."
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: .08),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Colors.white.withValues(alpha: .14)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Semangat Pagii!!',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.accent400, letterSpacing: .2)),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 6, children: [
              yel('Safety Yess ✅', const Color(0xFF22C55E)),
              yel('Accident No ❌', const Color(0xFFEF4444)),
            ]),
          ]),
        ),
        const SizedBox(height: 12),
        Wrap(spacing: 8, runSpacing: 6, children: [
          chip(Icons.badge, sesi.role),
          if (sesi.timNama.isNotEmpty) chip(Icons.groups, sesi.timNama),
          chip(Icons.location_on, 'ULP ${sesi.ulp}'),
        ]),
      ]),
    );
  }
}

/// Kotak sync (pola p0_sync_button lama).
class _KartuSync extends StatelessWidget {
  const _KartuSync({required this.deps});
  final Deps deps;

  @override
  Widget build(BuildContext context) {
    final ctl = deps.syncCtl;
    final terakhir = ctl.terakhirBerhasil == null ? 'belum pernah' : DateFormat('HH:mm', 'id_ID').format(ctl.terakhirBerhasil!);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.brand50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.brand100),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Icon(ctl.belumTerkirim == 0 ? Icons.cloud_done_outlined : Icons.cloud_upload_outlined, color: AppColors.navy700),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(ctl.belumTerkirim == 0 ? 'Semua data terkirim' : '${ctl.belumTerkirim} data belum terkirim',
                  style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy900)),
              Text('Sinkron terakhir: $terakhir', style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
              if (ctl.pesan != null) Text(ctl.pesan!, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral700)),
            ]),
          ),
        ]),
        const SizedBox(height: 10),
        FilledButton(
          onPressed: ctl.sedangSync ? null : ctl.sinkron,
          child: Text(ctl.sedangSync ? 'Menyinkronkan...' : 'Sinkron sekarang'),
        ),
      ]),
    );
  }
}

class _AksesCepat extends StatelessWidget {
  const _AksesCepat({required this.ikon, required this.judul, required this.sub, this.onTap});
  final IconData ikon;
  final String judul;
  final String sub;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: Color(0xFFDDE3EC))),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: AppColors.cyan100, borderRadius: BorderRadius.circular(11)),
              child: Icon(ikon, size: 20, color: AppColors.navy700),
            ),
            const Spacer(),
            Text(judul, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy900)),
            Text(sub, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
          ]),
        ),
      ),
    );
  }
}
