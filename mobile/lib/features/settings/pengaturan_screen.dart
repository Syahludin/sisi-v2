import 'package:flutter/material.dart';
import '../../core/navigasi.dart';

import '../yandal/approval_p0_repository.dart';
import 'aturan_gardu_card.dart';

import '../../core/cek_versi.dart';
import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_motif.dart';
import '../../widgets/sisi_widgets.dart';
import '../row/masalah_sync_screen.dart';
import '../gardu/ba_antrean.dart';
import '../gardu/gardu_repository.dart';
import 'download_master_card.dart';
import 'download_master_gardu_card.dart';
import 'ganti_password_screen.dart';
import '../../widgets/sisi_loader.dart';

/// Pengaturan: kartu akun, Master Data, Keluar dari Akun. Sinkron data hanya di Beranda.
/// v1.0.19 (permintaan kvlar 23 Okt 2026): desain ulang (kartu profil Jaringan SiSi, seksi Data & Master / Keamanan Akun /
/// Aplikasi, tombol keluar jelas). Fitur tidak berubah.
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
    if (ctl.perluTindakan > 0) {
      // v0.62 (M4): data KONFLIK / DITOLAK ikut menahan logout supaya tidak hilang diam-diam.
      final lihat = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Text('Belum bisa keluar', style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy900)),
          content: Text('${ctl.perluTindakan} data perlu tindakan (bentrok / ditolak server). Selesaikan dulu supaya tidak hilang.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Tutup')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Lihat masalah')),
          ],
        ),
      );
      if (lihat == true && mounted) {
        await Navigator.push(context, MaterialPageRoute(builder: (_) => MasalahSyncScreen(deps: widget.deps, sesi: widget.sesi)));
      }
      return;
    }
    if (ctl.belumTerkirim > 0) {
      tampilPesan(
          context,
          widget.sesi.petugasHartek
              ? 'Masih ada ${ctl.belumTerkirim} data Hartek belum terkirim / perlu diperbaiki. Buka tab Hartek dulu.'
              : widget.sesi.petugasInsJar
                  ? 'Masih ada ${ctl.belumTerkirim} data inspeksi belum terkirim / perlu diperbaiki. Buka tab Inspeksi dulu.'
                  : 'Masih ada ${ctl.belumTerkirim} data belum terkirim. Sinkronkan dulu dari Beranda.');
      return;
    }
    final antreBa = await AntreanBa.i.jumlahTertunda(widget.sesi.userId);
    if (!mounted) return;
    if (antreBa > 0) {
      tampilPesan(context, 'Masih ada $antreBa Berita Acara yang sedang diproses / tertunda. Buka Daftar BA dulu.');
      return;
    }
    if (ctl.fotoGagal > 0) {
      // v0.62.5: dulu foto GAGAL tidak dihitung, jadi boleh logout dan fotonya tertinggal di HP.
      tampilPesan(context,
          'Ada ${ctl.fotoGagal} foto gagal terkirim. Buka eksekusinya di Laporan lalu ketuk Kirim ulang (atau ambil ulang fotonya).');
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
        appBar: sisiAppBar('Pengaturan', subjudul: 'Akun, master data & aplikasi', online: ctl.online ?? false),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
          children: [
            _KartuProfil(sesi: s, online: ctl.online ?? false, belumTerkirim: ctl.belumTerkirim),
            const SizedBox(height: 22),
            const JudulSeksiSisi('Data & Master', keterangan: 'disimpan di HP untuk kerja offline'),
            if (ApprovalP0Repository.bolehUbah(s)) KartuAturanGardu(deps: widget.deps, sesi: s),
            DownloadMasterCard(deps: widget.deps, sesi: s),
            // v0.69.0: Master Gardu (akun dengan menu Pengukuran Gardu / Berita Acara)
            if (GarduRepository.bolehUnduh(s)) ...[
              const SizedBox(height: 12),
              DownloadMasterGarduCard(deps: widget.deps, sesi: s),
            ],
            // v0.67.0: Ganti Password (akun tim YANDAL dipakai bergantian per shift: lewat admin)
            if (!s.petugasYandal) ...[
              const SizedBox(height: 22),
              const JudulSeksiSisi('Keamanan Akun'),
              _BarisMenu(
                ikon: Icons.key_rounded,
                judul: 'Ganti Password',
                sub: 'Perlu internet. HP lain dengan akun ini akan dikeluarkan.',
                onTap: () => bukaForm(context, MaterialPageRoute<bool>(builder: (_) => GantiPasswordScreen(deps: widget.deps, sesi: s))),
              ),
            ],
            const SizedBox(height: 22),
            const JudulSeksiSisi('Aplikasi'),
            // v1.0.17: kartu versi tepat sebelum Keluar dari Akun
            const KartuVersiAplikasi(), // v0.81.1: tanda versi aplikasi (ketuk = cek / update)
            const SizedBox(height: 18),
            // v1.0.19: tombol keluar jelas di bawah (garis + teks merah)
            OutlinedButton.icon(
              onPressed: _keluar ? null : _logout,
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(54),
                foregroundColor: AppColors.red700,
                backgroundColor: Colors.white,
                side: const BorderSide(color: AppColors.red600, width: 1.4),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              icon: _keluar ? const SisiLoader(ukuran: 18, warna: AppColors.red700) : const Icon(Icons.logout_rounded),
              label: const Text('Keluar dari Akun', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
            ),
            const Padding(
              padding: EdgeInsets.only(top: 6),
              child: Text('Ditolak bila masih ada data belum terkirim',
                  textAlign: TextAlign.center, style: TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
            ),
          ],
        ),
      ),
    );
  }
}

/// v1.0.19 (permintaan kvlar 23 Okt 2026): kartu profil Pengaturan bergaya Jaringan SiSi: inisial dalam lingkaran
/// bercincin kuning, nama, username, role / tim / ULP, status online + data belum terkirim.
class _KartuProfil extends StatelessWidget {
  const _KartuProfil({required this.sesi, required this.online, required this.belumTerkirim});
  final Sesi sesi;
  final bool online;
  final int belumTerkirim;

  String get _inisial {
    final k = sesi.nama.trim().split(RegExp(r'\s+')).where((x) => x.isNotEmpty).toList();
    if (k.isEmpty) return '?';
    return (k.first[0] + (k.length > 1 ? k[1][0] : '')).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    Widget pil(IconData i, String t) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: .14), borderRadius: BorderRadius.circular(999)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(i, size: 13, color: AppColors.accent400),
            const SizedBox(width: 5),
            Text(t, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: Colors.white)),
          ]),
        );
    return LatarSisi(
      padding: const EdgeInsets.all(18),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 62,
            height: 62,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: .16),
              border: Border.all(color: AppColors.accent400, width: 2.4),
            ),
            child: Text(_inisial, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.white)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(sesi.nama,
                  maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: Colors.white)),
              const SizedBox(height: 2),
              Text(sesi.username, style: const TextStyle(fontSize: 12.5, color: Color(0xD9FFFFFF))),
            ]),
          ),
        ]),
        const SizedBox(height: 14),
        Wrap(spacing: 8, runSpacing: 6, children: [
          pil(Icons.badge_rounded, sesi.role),
          if (sesi.timNama.isNotEmpty) pil(Icons.groups_rounded, sesi.timNama),
          pil(Icons.location_on_rounded, 'ULP ${sesi.ulp}'),
        ]),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          decoration: BoxDecoration(color: Colors.black.withValues(alpha: .14), borderRadius: BorderRadius.circular(14)),
          child: Row(children: [
            Container(width: 9, height: 9, decoration: BoxDecoration(color: online ? const Color(0xFF34D399) : AppColors.red600, shape: BoxShape.circle)),
            const SizedBox(width: 8),
            Text(online ? 'Online' : 'Offline', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: Colors.white)),
            const Spacer(),
            Icon(belumTerkirim == 0 ? Icons.cloud_done_rounded : Icons.cloud_upload_rounded, size: 17, color: AppColors.accent400),
            const SizedBox(width: 6),
            Flexible(
              child: Text(belumTerkirim == 0 ? 'Semua data terkirim' : '$belumTerkirim data belum terkirim',
                  overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: Colors.white)),
            ),
          ]),
        ),
      ]),
    );
  }
}

/// Satu baris menu Pengaturan: ikon bergradien, judul, keterangan, panah.
class _BarisMenu extends StatelessWidget {
  const _BarisMenu({required this.ikon, required this.judul, required this.sub, required this.onTap});
  final IconData ikon;
  final String judul, sub;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: AppColors.neutral200)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(gradient: SisiMotif.gradien, borderRadius: BorderRadius.circular(13)),
                child: Icon(ikon, color: Colors.white, size: 21),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(judul, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.brand950)),
                  const SizedBox(height: 2),
                  Text(sub, style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
                ]),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.neutral400),
            ]),
          ),
        ),
      );
}
