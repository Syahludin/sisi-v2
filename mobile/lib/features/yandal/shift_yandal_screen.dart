import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import 'arsip_p0_view.dart';
import 'history_gardu_view.dart';
import 'p0_model.dart' show kemajuanShift, teksDurasi;
import 'pekerjaan_shift_view.dart';
import 'yandal_login.dart';

/// v0.63.0: kartu shift akun YANDAL (tim, shift, petugas yang dipilih saat login, jam sesi berakhir).
/// v0.66.6 (permintaan kvlar 9 Okt 2026): desain ulang selaras kartu Rank Yandal: judul + subjudul + chip jam,
/// baris petugas ber-inisial (gaya BarisRank), bilah kemajuan shift dengan sisa waktu dan jam sesi berakhir.
class KartuShiftYandal extends StatelessWidget {
  const KartuShiftYandal({super.key, required this.sesi, this.sekarang});
  final Sesi sesi;

  /// Untuk test; null = jam HP sekarang.
  final DateTime? sekarang;

  @override
  Widget build(BuildContext context) {
    final y = sesi.yandal ?? const <String, dynamic>{};
    final sh = (y['shift'] as Map<dynamic, dynamic>?) ?? const <dynamic, dynamic>{};
    final petugas = sesi.petugasShift;
    final sampai = sesi.sesiSampai;
    final kode = '${y['kodeShift'] ?? ''}';
    final jam = '${sh['jam'] ?? ''}';
    final tanggal = [sh['hari'], sh['tanggal']].where((v) => v != null && '$v'.isNotEmpty).join(', ');
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: AppColors.neutral200)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Icon(Icons.badge_rounded, color: AppColors.navy700),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Petugas Bertugas', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy900)),
              Text('${sesi.timNama} · Shift ${sh['no'] ?? '-'}', style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
            ]),
          ),
          if (jam.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(color: AppColors.cyan100, borderRadius: BorderRadius.circular(99)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.schedule_rounded, size: 14, color: AppColors.navy700),
                const SizedBox(width: 4),
                Text(jam, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: AppColors.navy700)),
              ]),
            ),
        ]),
        if (tanggal.isNotEmpty || kode.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(left: 32, top: 2),
            child: Text([tanggal, kode].where((v) => v.isNotEmpty).join(' · '),
                style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
          ),
        const SizedBox(height: 10),
        if (petugas.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 6),
            child: Text('Belum ada petugas tercatat.', style: TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
          )
        else
          for (var i = 0; i < petugas.length; i++)
            Container(
              margin: const EdgeInsets.only(bottom: 4),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
              decoration: BoxDecoration(color: AppColors.cyan100, borderRadius: BorderRadius.circular(10)),
              child: Row(children: [
                Container(
                  width: 30,
                  height: 30,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: AppColors.navy700.withValues(alpha: .14), shape: BoxShape.circle),
                  child: Text(inisialPetugas(petugas[i]),
                      style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w900, color: AppColors.navy700)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(petugas[i], style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                    Text('Petugas ${i + 1}', style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
                  ]),
                ),
                const Icon(Icons.verified_user_rounded, size: 18, color: AppColors.success600),
              ]),
            ),
        if (sampai != null) ...[
          const SizedBox(height: 8),
          _KemajuanShift(sampai: sampai, sekarang: sekarang),
        ],
      ]),
    );
  }
}

/// v0.66.6: bilah kemajuan shift + sisa waktu, diperbarui tiap 30 detik.
class _KemajuanShift extends StatefulWidget {
  const _KemajuanShift({required this.sampai, this.sekarang});
  final DateTime sampai;
  final DateTime? sekarang;

  @override
  State<_KemajuanShift> createState() => _KemajuanShiftState();
}

class _KemajuanShiftState extends State<_KemajuanShift> {
  Timer? _t;

  @override
  void initState() {
    super.initState();
    if (widget.sekarang == null) _t = Timer.periodic(const Duration(seconds: 30), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final k = kemajuanShift(widget.sampai, widget.sekarang ?? DateTime.now());
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(99),
        child: LinearProgressIndicator(
          minHeight: 6,
          value: k.lewat,
          backgroundColor: AppColors.neutral100,
          color: k.sisa.inMinutes < 30 ? AppColors.amber600 : AppColors.navy600,
        ),
      ),
      const SizedBox(height: 6),
      Row(children: [
        Expanded(
          child: Text(k.sisa == Duration.zero ? 'Shift selesai' : 'Sisa ${teksDurasi(k.sisa)}',
              style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.navy900)),
        ),
        Text('Sesi berakhir ${jamWib(widget.sampai)} WIB',
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.amber700)),
      ]),
    ]);
  }
}

/// Menu Shift akun YANDAL. v0.63.5 (keputusan kvlar 8 Okt 2026): tab seperti Laporan ROW:
/// "Pekerjaan Shift" (v0.64.0: kartu shift interaktif + P0 shift berjalan, tombol +) | "Arsip P0" | "History Pengukuran Gardu".
/// v1.0.16: tab penanda "TO P0" dihapus; TO P0 = tab WO tindak lanjut di bottom bar (label "TO P0" untuk Yandal).
class ShiftYandalScreen extends StatefulWidget {
  const ShiftYandalScreen({super.key, required this.deps, required this.sesi, this.denganArsip = true});

  /// v1.0.19: false = Arsip P0 ada di tab Arsip bottom bar.
  final bool denganArsip;
  final Deps deps;
  final Sesi sesi;

  @override
  State<ShiftYandalScreen> createState() => _ShiftYandalScreenState();
}

class _ShiftYandalScreenState extends State<ShiftYandalScreen> {
  int _tab = 0;
  bool _menyegarkan = false;
  final _kunciArsip = GlobalKey<ArsipP0ViewState>();
  final _kunciPekerjaan = GlobalKey<PekerjaanShiftViewState>();
  final _kunciHistoryGardu = GlobalKey<HistoryPengukuranGarduViewState>();

  /// Refresh sesuai tab: Pekerjaan Shift = sinkron + muat ulang P0,
  /// Arsip P0 = download ulang rentang terpilih, History Pengukuran Gardu = perbarui daftar gardu & pengukuran 2 hari terakhir.
  Future<void> _segarkan() async {
    if (_menyegarkan) return;
    setState(() => _menyegarkan = true);
    try {
      switch (_tab) {
        case 0:
          await widget.deps.syncCtl.sinkron();
          await _kunciPekerjaan.currentState?.muat();
        case 1:
          await _kunciArsip.currentState?.segarkan();
        default:
          await _kunciHistoryGardu.currentState?.segarkan();
      }
    } finally {
      if (mounted) setState(() => _menyegarkan = false);
    }
  }

  Widget _pill(String label, int i) {
    final aktif = _tab == i;
    return GestureDetector(
      onTap: () {
        setState(() => _tab = i);
        if (i == 2) unawaited(_kunciHistoryGardu.currentState?.muat());
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(color: aktif ? AppColors.navy700 : Colors.transparent, borderRadius: BorderRadius.circular(999)),
        child: Text(label,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: aktif ? Colors.white : AppColors.neutral700)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ctl = widget.deps.syncCtl;
    return ListenableBuilder(listenable: ctl, builder: (context, _) => Scaffold(
      backgroundColor: Colors.transparent, // v1.0.19: latar bg-sisi
      appBar: sisiAppBar('Shift Yandal', subjudul: '${widget.sesi.timNama} • ULP ${widget.sesi.ulp}', online: ctl.online, actions: [
        TombolSegarkan(sibuk: _menyegarkan || ctl.sedangSync, onPressed: () => unawaited(_segarkan())),
      ]),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(color: AppColors.neutral150, borderRadius: BorderRadius.circular(999)),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [
                _pill('Pekerjaan Shift', 0),
                if (widget.denganArsip) _pill('Arsip P0', 1),
                _pill('History Pengukuran Gardu', 2), // v1.0.19: kalender hanya di Beranda
              ]),
            ),
          ),
        ),
        Expanded(
          child: IndexedStack(index: _tab, children: [
            PekerjaanShiftView(key: _kunciPekerjaan, deps: widget.deps, sesi: widget.sesi),
            widget.denganArsip ? ArsipP0View(key: _kunciArsip, deps: widget.deps, sesi: widget.sesi) : const SizedBox.shrink(),
            HistoryPengukuranGarduView(
              key: _kunciHistoryGardu,
              deps: widget.deps,
              sesi: widget.sesi,
              onMulaiUkur: () => unawaited(_kunciPekerjaan.currentState?.muat()),
            ),
          ]),
        ),
      ]),
      // v0.64.3: tombol + pindah ke layar Detail Shift (ketuk kartu shift).
    ));
  }
}
