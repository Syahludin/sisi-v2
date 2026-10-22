import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_motif.dart';
import '../../widgets/sisi_widgets.dart';
import '../kalender/kalender_tim_screen.dart';
import '../row/masalah_sync_screen.dart';
import '../yandal/rank_yandal.dart';
import '../yandal/shift_yandal_screen.dart';

/// Beranda: kartu profil, status sync, kalender, akses cepat.
/// v1.0.18 (permintaan kvlar 22 Okt 2026): gaya "Jaringan SiSi" + kalender satu bulan (pekerjaan tim, WO, jadwal padam)
/// supaya setiap petugas melihat rencana pekerjaan dan jadwal padam hari itu langsung dari Beranda.
class BerandaScreen extends StatefulWidget {
  const BerandaScreen({super.key, required this.deps, required this.sesi, required this.keLaporan});
  final Deps deps;
  final Sesi sesi;
  final VoidCallback keLaporan;

  @override
  State<BerandaScreen> createState() => _BerandaScreenState();
}

class _BerandaScreenState extends State<BerandaScreen> {
  final _kalender = GlobalKey<PanelKalenderTimState>();

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
        backgroundColor: AppColors.neutral50,
        // Satu-satunya tombol sinkron ada di kartu sync (plus tarik ke bawah). Sync juga otomatis tiap 5 menit.
        appBar: sisiAppBar('Beranda', online: ctl.online),
        body: RefreshIndicator(
          onRefresh: _segarkan,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 112),
            children: [
              _Hero(sesi: sesi),
              const SizedBox(height: 16),
              if (sesi.petugasYandal) ...[KartuShiftYandal(sesi: sesi), const SizedBox(height: 16)], // v0.63.0
              // v0.63.5: Rank Yandal bulan berjalan (akun YANDAL + admin)
              if (sesi.petugasYandal || sesi.modeAdmin) ...[KartuRankYandal(deps: deps, sesi: sesi), const SizedBox(height: 16)],
              _KartuSync(deps: deps, sesi: sesi),
              const SizedBox(height: 22),
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
              const SizedBox(height: 22),
              const JudulSeksiSisi('Akses cepat', keterangan: 'sesuai role'),
              GridView.count(
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
                    _AksesCepat(ikon: Icons.edit_note_rounded, judul: 'Hartek', sub: 'Laporan Utama, pekerjaan, material, foto', onTap: widget.keLaporan)
                  else if (sesi.petugasInsJar) // v1.0.0
                    _AksesCepat(ikon: Icons.travel_explore_rounded, judul: 'Inspeksi Jaringan', sub: 'Penyulang utama, temuan, foto', onTap: widget.keLaporan)
                  else if (sesi.aksiMenu('ROW_EKSEKUSI') != null)
                    _AksesCepat(ikon: Icons.forest_outlined, judul: 'Laporan ROW', sub: 'Header, penyulang, eksekusi', onTap: widget.keLaporan),
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
  const _KartuSync({required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

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
        if (ctl.perluTindakan > 0) ...[
          const SizedBox(height: 10),
          // v0.62 (M4): data yang KONFLIK / DITOLAK tidak terkirim sendiri, petugas harus memilih tindakan.
          Material(
            color: AppColors.red100,
            borderRadius: BorderRadius.circular(10),
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => MasalahSyncScreen(deps: deps, sesi: sesi))),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: Row(children: [
                  const Icon(Icons.sync_problem_rounded, color: AppColors.red700),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text('${ctl.perluTindakan} data perlu tindakan',
                        style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.red700)),
                  ),
                  const Text('Lihat', style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.red700)),
                  const Icon(Icons.chevron_right_rounded, color: AppColors.red700),
                ]),
              ),
            ),
          ),
        ],
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
