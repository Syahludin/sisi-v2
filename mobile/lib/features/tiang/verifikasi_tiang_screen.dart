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
  late final TiangRepository _repo = widget.repo ?? TiangRepository(widget.deps!.tiangApi, draf: widget.deps!.drafTiang);
  PilihanTiang? _data;
  bool _muat = true;
  String? _galat;
  String _cari = '';

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
      if (mounted) {
        final pesan = e is ApiException ? KodeError.pesan(e.kode) : 'Tidak bisa terhubung ke server.';
        setState(() => _galat = pesan);
        if (_data != null) tampilPesan(context, pesan);
      }
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
          : _isi(d),
    );
  }

  Widget _isi(PilihanTiang d) {
    final q = _cari.trim().toUpperCase();
    final tampil = q.isEmpty ? d.jalur : [for (final j in d.jalur) if (j.kode.toUpperCase().contains(q)) j];
    return RefreshIndicator(
      onRefresh: _segarkan,
      child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 32), children: [
        if (_muat) const Padding(padding: EdgeInsets.only(bottom: 10), child: Center(child: SisiLoader(ukuran: 30))),
        _KartuTotal(jalur: d.jalur),
        const SizedBox(height: 14),
        TextField(
          onChanged: (v) => setState(() => _cari = v),
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(hintText: 'Cari kode jalur, mis. PLS', prefixIcon: Icon(Icons.search_rounded), isDense: true),
        ),
        const SizedBox(height: 10),
        if (d.jalur.isEmpty)
          const SisiKosong(judul: 'Belum Ada Tiang', pesan: 'Jalankan migrasi tiang dari ITB dulu.', ikon: Icons.cell_tower_outlined)
        else if (tampil.isEmpty)
          Padding(padding: const EdgeInsets.all(20), child: Center(child: Text('Tidak ada jalur "$_cari".', style: const TextStyle(color: AppColors.neutral500))))
        else
          for (final j in tampil) Padding(padding: const EdgeInsets.only(bottom: 8), child: _BarisJalur(j: j, onTap: () => _buka(j))),
      ]),
    );
  }
}

/// Kepala hijau: persen besar + bilah progres, lalu lima angka status (sama dengan ringkasan web).
class _KartuTotal extends StatelessWidget {
  const _KartuTotal({required this.jalur});
  final List<Jalur> jalur;

  int _jum(int Function(Jalur) f) => jalur.fold(0, (a, j) => a + f(j));

  @override
  Widget build(BuildContext context) {
    final total = _jum((j) => j.jumlah), selesai = _jum((j) => j.selesai);
    final persen = total == 0 ? 0 : (selesai * 100 / total).round();
    Widget angka(String label, int n, Color w) => Expanded(
            child: Column(children: [
          Text('$n', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: w, height: 1.1)),
          const SizedBox(height: 2),
          Text(label, textAlign: TextAlign.center, maxLines: 2, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: AppColors.neutral500, height: 1.15)),
        ]));
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral150)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          decoration: const BoxDecoration(color: AppColors.brand900, border: Border(bottom: BorderSide(color: AppColors.accent600, width: 3))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('$persen%', style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w900, color: AppColors.accent600, height: 1)),
              const SizedBox(width: 12),
              Expanded(
                  child: Text('$selesai dari $total tiang selesai · ${jalur.length} jalur',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white))),
            ]),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(value: total == 0 ? 0 : selesai / total, minHeight: 8, backgroundColor: AppColors.brand700, color: AppColors.accent600),
            ),
            const SizedBox(height: 6),
            const Text('Target 90% sebelum temuan per tiang dimulai.', style: TextStyle(fontSize: 11.5, color: AppColors.brand100)),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            angka('Terverifikasi', _jum((j) => j.terverifikasi), AppColors.success700),
            angka('Perlu Dilengkapi', _jum((j) => j.perluDilengkapi), AppColors.accent700),
            angka('Perlu Perbaikan', _jum((j) => j.perluPerbaikan), AppColors.red700),
            angka('Tidak Ditemukan', _jum((j) => j.tidakDitemukan), AppColors.neutral700),
            angka('Bertanda Cek', _jum((j) => j.bertanda), AppColors.accent700),
          ]),
        ),
      ]),
    );
  }
}

/// Satu baris jalur: kode, selesai/total, persen, bilah; chip hanya bila ada tiang perlu perbaikan atau bertanda cek.
class _BarisJalur extends StatelessWidget {
  const _BarisJalur({required this.j, required this.onTap});
  final Jalur j;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    Widget chip(String t, Color fg, Color bg) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
        child: Text(t, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: fg)));
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.neutral150)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Text(j.kode, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.brand950)),
              const SizedBox(width: 10),
              Expanded(child: Text('${j.selesai}/${j.jumlah} tiang', style: const TextStyle(fontSize: 12.5, color: AppColors.neutral500))),
              Text('${j.persen}%', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.success700)),
              const Icon(Icons.chevron_right_rounded, color: AppColors.neutral400),
            ]),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: LinearProgressIndicator(value: j.jumlah == 0 ? 0 : j.selesai / j.jumlah, minHeight: 6, backgroundColor: AppColors.neutral150, color: AppColors.success600),
              ),
            ),
            if (j.perluPerbaikan > 0 || j.bertanda > 0) ...[
              const SizedBox(height: 8),
              Wrap(spacing: 6, children: [
                if (j.perluPerbaikan > 0) chip('${j.perluPerbaikan} perbaikan', AppColors.red700, AppColors.red100),
                if (j.bertanda > 0) chip('${j.bertanda} cek', AppColors.accent700, AppColors.accent100),
              ]),
            ],
          ]),
        ),
      ),
    );
  }
}
