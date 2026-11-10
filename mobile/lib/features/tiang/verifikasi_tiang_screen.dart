import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/sisi_widgets.dart';
import 'jalur_tiang_screen.dart';
import 'tiang_model.dart';
import 'tiang_repository.dart';

/// Verifikasi Tiang (menu OPS_VERIFIKASI_TIANG, ADMIN / SUPER): progres keseluruhan + daftar jalur (kode nama aset). Ketuk jalur =
/// verifikasi berurutan sepanjang jalur. Tombol Segmen = kelola master segmen. Data terakhir tersimpan di HP.
class VerifikasiTiangScreen extends StatefulWidget {
  const VerifikasiTiangScreen({super.key, required this.deps, required this.sesi, this.repo});
  final Deps? deps;
  final Sesi sesi;
  final TiangRepository? repo; // uji tanpa server

  @override
  State<VerifikasiTiangScreen> createState() => _VerifikasiTiangScreenState();
}

class _VerifikasiTiangScreenState extends State<VerifikasiTiangScreen> {
  late final TiangRepository _repo = widget.repo ?? TiangRepository(widget.deps!.api);
  PilihanTiang? _data;
  bool _muat = true;
  String? _galat;

  @override
  void initState() {
    super.initState();
    _awal();
  }

  Future<void> _awal() async {
    final l = await _repo.pilihanLokal(widget.sesi);
    if (mounted && l != null) setState(() => _data = l);
    await _segarkan();
  }

  Future<void> _segarkan() async {
    setState(() {
      _muat = true;
      _galat = null;
    });
    try {
      final d = await _repo.pilihan(widget.sesi);
      if (mounted) setState(() => _data = d);
    } catch (e) {
      if (mounted) setState(() => _galat = e is ApiException ? KodeError.pesan(e.kode) : 'Tidak bisa terhubung ke server.');
    }
    if (mounted) setState(() => _muat = false);
  }

  Future<void> _buka(Jalur j) async {
    await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => JalurTiangScreen(sesi: widget.sesi, repo: _repo, pilihan: _data!, kode: j.kode)));
    if (mounted) unawaited(_segarkan());
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    return Scaffold(
      appBar: AppBar(title: const Text('Verifikasi Tiang'), actions: [
        IconButton(
            tooltip: 'Muat Ulang',
            onPressed: _muat ? null : _segarkan,
            icon: _muat ? const SizedBox(width: 22, height: 22, child: SisiLoader(ukuran: 22)) : const Icon(Icons.refresh_rounded)),
      ]),
      body: d == null
          ? (_muat
              ? const SisiLoading(pesan: 'Memuat data tiang')
              : SisiKosong(judul: 'Belum Bisa Memuat', pesan: _galat ?? 'Coba lagi.', ikon: Icons.cloud_off_outlined))
          : RefreshIndicator(
              onRefresh: _segarkan,
              child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 32), children: [
                if (_galat != null)
                  Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Text('Data tersimpan di HP. $_galat', style: const TextStyle(color: AppColors.accent700, fontWeight: FontWeight.w700))),
                _KartuTotal(selesai: d.totalSelesai, total: d.totalTiang, jalur: d.jalur.length),
                const SizedBox(height: 14),
                const Text('Pilih Jalur', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppColors.brand950)),
                const SizedBox(height: 8),
                if (d.jalur.isEmpty)
                  const SisiKosong(judul: 'Belum Ada Tiang', pesan: 'Jalankan migrasi tiang dari ITB dulu.', ikon: Icons.cell_tower_outlined),
                for (final j in d.jalur) Padding(padding: const EdgeInsets.only(bottom: 10), child: _KartuJalur(j: j, onTap: () => _buka(j))),
              ]),
            ),
    );
  }
}

class _KartuTotal extends StatelessWidget {
  const _KartuTotal({required this.selesai, required this.total, required this.jalur});
  final int selesai, total, jalur;

  @override
  Widget build(BuildContext context) {
    final persen = total == 0 ? 0 : (selesai * 100 / total).round();
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral150)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Text('$persen%', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: AppColors.success700, height: 1)),
          const SizedBox(width: 12),
          Expanded(
              child: Text('$selesai dari $total tiang selesai · $jalur jalur',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.neutral700))),
        ]),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
              value: total == 0 ? 0 : selesai / total, minHeight: 8, backgroundColor: AppColors.neutral150, color: AppColors.success600),
        ),
        const SizedBox(height: 6),
        const Text('Target 90% sebelum temuan per tiang dimulai.', style: TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
      ]),
    );
  }
}

class _KartuJalur extends StatelessWidget {
  const _KartuJalur({required this.j, required this.onTap});
  final Jalur j;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    Widget angka(String label, int n, Color w) => Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('$n', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: w)),
          Text(label, maxLines: 2, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.neutral500, height: 1.2)),
        ]));
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.neutral150)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Text(j.kode, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.brand950)),
              const SizedBox(width: 10),
              Expanded(child: Text('${j.jumlah} tiang', style: const TextStyle(fontSize: 12.5, color: AppColors.neutral500))),
              Text('${j.persen}%', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.success700)),
              const Icon(Icons.chevron_right_rounded, color: AppColors.neutral400),
            ]),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(
                  value: j.jumlah == 0 ? 0 : j.selesai / j.jumlah, minHeight: 6, backgroundColor: AppColors.neutral150, color: AppColors.success600),
            ),
            const SizedBox(height: 10),
            Row(children: [
              angka('Terverifikasi', j.terverifikasi, AppColors.success700),
              const SizedBox(width: 12),
              angka('Perlu Dilengkapi', j.perluDilengkapi, AppColors.accent700),
              const SizedBox(width: 12),
              angka('Perlu Perbaikan', j.perluPerbaikan, AppColors.accent700),
              const SizedBox(width: 12),
              angka('Tidak Ditemukan', j.tidakDitemukan, AppColors.neutral700),
              const SizedBox(width: 12),
              angka('Bertanda Cek', j.bertanda, AppColors.red700),
            ]),
          ]),
        ),
      ),
    );
  }
}
