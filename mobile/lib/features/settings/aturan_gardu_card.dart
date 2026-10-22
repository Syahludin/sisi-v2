import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import '../../widgets/sisi_loader.dart';

/// v0.75.0: toggle admin "Pengukuran Gardu 2 Hari Sekali" (Script Property ATURAN_GARDU_UKUR_2_HARI).
class KartuAturanGardu extends StatefulWidget {
  const KartuAturanGardu({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  @override
  State<KartuAturanGardu> createState() => _KartuAturanGarduState();
}

class _KartuAturanGarduState extends State<KartuAturanGardu> {
  bool? _aktif;
  bool _sibuk = false;

  @override
  void initState() {
    super.initState();
    unawaited(_muat());
  }

  Future<void> _muat() async {
    var v = await widget.deps.gardu.aturanGarduDuaHari();
    if (v == null) {
      try {
        await widget.deps.gardu.segarkan(widget.sesi);
        v = await widget.deps.gardu.aturanGarduDuaHari();
      } catch (_) {/* tampil tidak diketahui */}
    }
    if (mounted) setState(() => _aktif = v ?? false);
  }

  Future<void> _ubah(bool nilai) async {
    setState(() => _sibuk = true);
    try {
      final hasil = await widget.deps.gardu.simpanAturanGarduDuaHari(widget.sesi, nilai);
      if (!mounted) return;
      setState(() => _aktif = hasil);
      tampilPesan(context, hasil ? 'Aturan aktif: gardu yang sama baru bisa diukur lagi setelah 2 hari.' : 'Aturan nonaktif.');
    } on ApiException catch (e) {
      if (mounted) tampilPesan(context, KodeError.pesan(e.kode));
    } catch (_) {
      if (mounted) tampilPesan(context, 'Gagal menyimpan. Periksa sinyal lalu coba lagi.');
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final aktif = _aktif ?? false;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
      decoration: BoxDecoration(
        color: aktif ? AppColors.brand50 : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: aktif ? AppColors.navy700 : AppColors.neutral200),
      ),
      child: Row(children: [
        Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(color: AppColors.navy700.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
          child: const Icon(Icons.event_repeat_rounded, color: AppColors.navy700),
        ),
        const SizedBox(width: 12),
        const Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Pengukuran Gardu 2 Hari Sekali', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
            SizedBox(height: 2),
            Text('Kalau aktif, petugas Yandal tidak bisa mengukur gardu yang sama sebelum lewat 2 hari. Mencegah pengukuran berulang.',
                style: TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
          ]),
        ),
        if (_aktif == null || _sibuk)
          const Padding(padding: EdgeInsets.all(12), child: SisiLoader(ukuran: 22))
        else
          Switch(value: aktif, onChanged: (v) => unawaited(_ubah(v))),
      ]),
    );
  }
}
