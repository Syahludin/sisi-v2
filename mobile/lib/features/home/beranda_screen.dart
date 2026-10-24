import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/animasi_masuk.dart';
import '../../widgets/sisi_motif.dart';
import '../../widgets/sisi_widgets.dart';
import '../kalender/kalender_tim_screen.dart';
import '../row/masalah_sync_screen.dart';
import '../yandal/rank_yandal.dart';
import '../yandal/shift_yandal_screen.dart';
import '../../widgets/refresh_sisi.dart';

/// Beranda: kartu profil, kalender, akses cepat (v1.0.21: kartu status sync dihapus).
/// v1.0.18 (permintaan kvlar 22 Okt 2026): gaya "Jaringan SiSi" + kalender satu bulan (pekerjaan tim, WO, jadwal padam)
/// supaya setiap petugas melihat rencana pekerjaan dan jadwal padam hari itu langsung dari Beranda.
class BerandaScreen extends StatefulWidget {
  const BerandaScreen({super.key, required this.deps, required this.sesi, required this.keLaporan, this.masuk});
  final Deps deps;
  final Sesi sesi;
  final VoidCallback keLaporan;

  /// v1.0.27: naik setiap tab Beranda dibuka lagi (animasi masuk diulang).
  final ValueListenable<int>? masuk;

  @override
  State<BerandaScreen> createState() => _BerandaScreenState();
}

class _BerandaScreenState extends State<BerandaScreen> with SingleTickerProviderStateMixin {
  final _kalender = GlobalKey<PanelKalenderTimState>();

  /// v1.0.27 (permintaan kvlar 23 Okt 2026): kartu utama, shift, Rank Yandal, kalender, akses cepat muncul sebagai pop up
  /// bertingkat setiap Beranda dibuka (sesudah kartu Selamat Datang login, dan setiap kembali ke tab Beranda).
  late final AnimationController _masuk = AnimationController(vsync: this, duration: durasiMasukSisi);

  @override
  void initState() {
    super.initState();
    widget.masuk?.addListener(_ulangMasuk);
    _masuk.forward();
  }

  @override
  void dispose() {
    widget.masuk?.removeListener(_ulangMasuk);
    _masuk.dispose();
    super.dispose();
  }

  void _ulangMasuk() => _masuk.forward(from: 0);

  Deps get deps => widget.deps;
  Sesi get sesi => widget.sesi;

  Future<void> _segarkan() async {
    await Future.wait([deps.syncCtl.sinkron(), _kalender.currentState?.unduh() ?? Future.value()]);
  }

  @override
  Widget build(BuildContext context) {
    final ctl = deps.syncCtl;
    return ListenableBuilder(
      listenable: ctl,
      builder: (context, _) => Scaffold(
        backgroundColor: Colors.transparent, // v1.0.19: latar bg-sisi dari kerangka (seperti Pengaturan)
        // v1.0.21 (permintaan kvlar 23 Okt 2026): kartu sinkron dihapus. Sinkron + muat ulang kalender = tombol refresh SiSi
        // di app bar atau tarik ke bawah. Sync juga otomatis tiap 5 menit.
        appBar: sisiAppBar('Beranda', online: ctl.online, actions: [TombolSegarkan(sibuk: ctl.sedangSync, onPressed: _segarkan)]),
        body: RefreshSisi(
          onRefresh: _segarkan,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 112),
            children: [
              PopMasuk(animasi: _masuk, urut: 0, child: _Hero(sesi: sesi)),
              const SizedBox(height: 16),
              if (sesi.petugasYandal) ...[PopMasuk(animasi: _masuk, urut: 1, child: KartuShiftYandal(sesi: sesi)), const SizedBox(height: 16)], // v0.63.0
              // v0.63.5: Rank Yandal bulan berjalan (akun YANDAL + admin)
              if (sesi.petugasYandal || sesi.modeAdmin) ...[
                PopMasuk(animasi: _masuk, urut: 2, child: KartuRankYandal(deps: deps, sesi: sesi)),
                const SizedBox(height: 16),
              ],
              // data KONFLIK / DITOLAK tidak terkirim sendiri: petugas tetap harus melihat dan memilih tindakan
              if (ctl.perluTindakan > 0) ...[_PerluTindakan(deps: deps, sesi: sesi, jumlah: ctl.perluTindakan), const SizedBox(height: 6)],
              const SizedBox(height: 16),
              PopMasuk(
                animasi: _masuk,
                urut: 3,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  JudulSeksiSisi('Kalender', keterangan: sesi.role == 'PETUGAS' ? 'pekerjaan & jadwal padam' : 'jadwal padam'),
                  Container(
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 14),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppColors.neutral200),
                      boxShadow: [BoxShadow(color: AppColors.brand950.withValues(alpha: .05), blurRadius: 14, offset: const Offset(0, 4))],
                    ),
                    child: PanelKalenderTim(key: _kalender, deps: deps, sesi: sesi, ringkas: true),
                  ),
                ]),
              ),
              const SizedBox(height: 22),
              PopMasuk(animasi: _masuk, urut: 4, child: const JudulSeksiSisi('Akses cepat', keterangan: 'sesuai role')),
              PopMasuk(
                animasi: _masuk,
                urut: 5,
                child: GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: 1.25,
                  children: [
                    if (sesi.modeAdmin)
                      _AksesCepat(ikon: Icons.dashboard_customize_outlined, judul: 'Operasi', sub: 'Laporan per tim & modul teknik', onTap: widget.keLaporan)
                    else if (sesi.petugasYandal)
                      _AksesCepat(ikon: Icons.badge_outlined, judul: 'Shift Yandal', sub: 'Shift ini, Arsip P0, History Gardu', onTap: widget.keLaporan)
                    else if (sesi.petugasHartek)
                      _AksesCepat(
                          ikon: Icons.handyman_rounded, judul: 'Laporan Hartek', sub: 'Laporan Utama, pekerjaan, material, foto', onTap: widget.keLaporan)
                    else if (sesi.petugasInsJar) // v1.0.0
                      _AksesCepat(ikon: Icons.travel_explore_rounded, judul: 'Inspeksi Jaringan', sub: 'Penyulang utama, temuan, foto', onTap: widget.keLaporan)
                    else if (sesi.aksiMenu('ROW_EKSEKUSI') != null)
                      _AksesCepat(ikon: Icons.forest_outlined, judul: 'Laporan ROW', sub: 'Header, penyulang, eksekusi', onTap: widget.keLaporan),
                  ],
                ),
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
    return LatarSisi(
      padding: const EdgeInsets.all(20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const PercikSisi(tinggi: 11),
          const SizedBox(width: 6),
          Text(tgl, style: const TextStyle(fontSize: 10.5, letterSpacing: 1, fontWeight: FontWeight.w800, color: AppColors.accent400)),
        ]),
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
            const Text('Semangat Pagii!!', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.accent400, letterSpacing: .2)),
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

/// v0.62 (M4): data yang KONFLIK / DITOLAK tidak terkirim sendiri, petugas harus memilih tindakan.
/// v1.0.21: sisa kartu sinkron lama, hanya tampil kalau ada data yang perlu tindakan.
class _PerluTindakan extends StatelessWidget {
  const _PerluTindakan({required this.deps, required this.sesi, required this.jumlah});
  final Deps deps;
  final Sesi sesi;
  final int jumlah;

  @override
  Widget build(BuildContext context) => Material(
        color: AppColors.red100,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => MasalahSyncScreen(deps: deps, sesi: sesi))),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(children: [
              const Icon(Icons.sync_problem_rounded, color: AppColors.red700),
              const SizedBox(width: 10),
              Expanded(child: Text('$jumlah data perlu tindakan', style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.red700))),
              const Text('Lihat', style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.red700)),
              const Icon(Icons.chevron_right_rounded, color: AppColors.red700),
            ]),
          ),
        ),
      );
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
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: AppColors.neutral200)),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(gradient: SisiMotif.gradien, borderRadius: BorderRadius.circular(12)),
                child: Icon(ikon, size: 21, color: Colors.white),
              ),
              const Spacer(),
              const Icon(Icons.arrow_outward_rounded, size: 18, color: AppColors.brand600),
            ]),
            const Spacer(),
            Text(judul, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy900)),
            Text(sub, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
          ]),
        ),
      ),
    );
  }
}
