import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../core/api_client.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/simpan_latar.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/sisi_widgets.dart';
import 'tiang_form_screen.dart';
import 'tiang_model.dart';
import 'tiang_repository.dart';

/// Satu jalur (kode nama aset): tiang diurutkan sepanjang jalur (induk -> anak, cabang menjorok), atau di peta dengan garis ke
/// induk. Tombol bawah = lanjut ke tiang berikutnya yang belum selesai. Sesudah simpan, tiang berikutnya ditawarkan.
class JalurTiangScreen extends StatefulWidget {
  const JalurTiangScreen({super.key, required this.sesi, required this.repo, required this.pilihan, required this.kode});
  final Sesi sesi;
  final TiangRepository repo;
  final PilihanTiang pilihan;
  final String kode;

  @override
  State<JalurTiangScreen> createState() => _JalurTiangScreenState();
}

enum _Saring { semua, belum, bertanda, selesai }

Color warnaStatusTiang(String s) => switch (infoStatusTiang(s).$2) {
      'ok' => AppColors.success600,
      'proses' => AppColors.accent600,
      'hilang' => AppColors.neutral500,
      _ => AppColors.red600,
    };

class _JalurTiangScreenState extends State<JalurTiangScreen> {
  List<Tiang>? _tiang;
  bool _muat = true, _peta = false;
  String? _galat;
  _Saring _saring = _Saring.semua;

  bool get _bolehUbah => TiangRepository.bolehUbah(widget.sesi);

  @override
  void initState() {
    super.initState();
    _awal();
  }

  Future<void> _awal() async {
    final l = await widget.repo.jalurLokal(widget.sesi, widget.kode);
    if (mounted && l != null) setState(() => _tiang = l);
    await _segarkan();
  }

  Future<void> _segarkan() async {
    setState(() {
      _muat = true;
      _galat = null;
    });
    try {
      final t = await widget.repo.jalur(widget.sesi, widget.kode);
      if (mounted) setState(() => _tiang = t);
    } catch (e) {
      if (mounted) setState(() => _galat = e is ApiException ? KodeError.pesan(e.kode) : 'Tidak bisa terhubung ke server.');
    }
    if (mounted) setState(() => _muat = false);
  }

  bool _lolos(Tiang t) => switch (_saring) {
        _Saring.semua => true,
        _Saring.belum => !t.selesai,
        _Saring.bertanda => t.bertanda,
        _Saring.selesai => t.selesai,
      };

  /// Usulan sirkuit = sirkuit induk yang sudah diverifikasi (penyulang, segmen, kabel biasanya sama sepanjang jalur).
  List<IsianSirkuit>? _contoh(Tiang? t) {
    final daftar = _tiang ?? const <Tiang>[];
    final induk = t == null ? null : daftar.where((x) => x.id == t.induk).firstOrNull;
    final asal = induk != null && induk.status == 'TERVERIFIKASI' ? induk : daftar.where((x) => x.status == 'TERVERIFIKASI').lastOrNull;
    return asal == null ? null : [for (final s in asal.sirkuit) IsianSirkuit.dari(s)];
  }

  Future<void> _buka(Tiang? t, {String indukBaru = ''}) async {
    final kiriman = await Navigator.push<(IsianTiang, Map<String, String>)>(
      context,
      MaterialPageRoute(
          builder: (_) => TiangFormScreen(
              sesi: widget.sesi,
              repo: widget.repo,
              pilihan: widget.pilihan,
              kode: widget.kode,
              tiang: t,
              contoh: _contoh(t),
              daftar: _tiang ?? const [],
              indukBaru: indukBaru)),
    );
    if (kiriman == null || !mounted) return;
    simpanLatar(context, kerja: () => _kirim(kiriman.$1, kiriman.$2));
    if (t == null) return; // tiang baru: ID belum diketahui, kembali ke daftar
    final lanjut = berikutnya(urutanJalur(_tiang!), t.id);
    if (lanjut == null) return;
    final ya = await showModalBottomSheet<bool>(
      context: context,
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('${t.nama} Sedang Disimpan', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.brand950)),
            const SizedBox(height: 14),
            FilledButton.icon(onPressed: () => Navigator.pop(c, true), icon: const Icon(Icons.arrow_forward_rounded), label: Text('Lanjut ke ${lanjut.nama}')),
            const SizedBox(height: 8),
            OutlinedButton(onPressed: () => Navigator.pop(c, false), child: const Text('Kembali ke Daftar')),
          ]),
        ),
      ),
    );
    if (ya == true && mounted) unawaited(_buka(lanjut));
  }

  /// Simpan verifikasi lalu kirim foto (di latar belakang); daftar jalur diperbarui dari jawaban server.
  Future<String?> _kirim(IsianTiang i, Map<String, String> foto) async {
    final (baru, _) = await widget.repo.simpan(widget.sesi, i, daftar: _tiang);
    final gagal = <String>[], terkirim = <String>{};
    for (final (slot, label) in slotFotoTiang) {
      final path = foto[slot];
      if (path == null) continue;
      try {
        await widget.repo.unggahFoto(widget.sesi, baru.id, slot, path);
        terkirim.add(slot);
      } catch (_) {
        gagal.add(label);
      }
    }
    if (mounted) {
      setState(() {
        final d = [...?_tiang];
        final k = d.indexWhere((x) => x.id == baru.id);
        if (k >= 0) {
          d[k] = baru.denganFoto(terkirim);
        } else {
          d.add(baru.denganFoto(terkirim));
        }
        _tiang = d;
      });
    }
    return gagal.isEmpty ? null : 'Data tersimpan, foto ${gagal.join(', ')} belum terkirim. Buka tiang ini lagi untuk mengambil ulang.';
  }

  @override
  Widget build(BuildContext context) {
    final semua = _tiang;
    final urut = semua == null ? const <BarisJalur>[] : urutanJalur(semua);
    final tampil = [
      for (final b in urut)
        if (_lolos(b.tiang)) b
    ];
    final lanjut = urut.map((b) => b.tiang).where((t) => !t.selesai).firstOrNull;
    return Scaffold(
      appBar: AppBar(title: Text('Jalur ${widget.kode}'), actions: [
        IconButton(
            tooltip: 'Muat Ulang',
            onPressed: _muat ? null : _segarkan,
            icon: _muat ? const SizedBox(width: 22, height: 22, child: SisiLoader(ukuran: 22)) : const Icon(Icons.refresh_rounded)),
      ]),
      floatingActionButton: _bolehUbah && semua != null
          ? FloatingActionButton.small(tooltip: 'Tambah Tiang', onPressed: () => _buka(null), child: const Icon(Icons.add_rounded))
          : null,
      bottomNavigationBar: _bolehUbah && lanjut != null
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50), backgroundColor: AppColors.brand700),
                  onPressed: () => _buka(lanjut),
                  icon: const Icon(Icons.play_arrow_rounded),
                  label: Text('Lanjutkan: ${lanjut.nama}'),
                ),
              ),
            )
          : null,
      body: semua == null
          ? (_muat
              ? const SisiLoading(pesan: 'Memuat tiang')
              : SisiKosong(judul: 'Belum Bisa Memuat', pesan: _galat ?? 'Coba lagi.', ikon: Icons.cloud_off_outlined))
          : Column(children: [
              if (_galat != null)
                Container(
                    width: double.infinity,
                    color: AppColors.accent100,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child:
                        Text('Data tersimpan di HP. $_galat', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.accent700))),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
                child: Row(children: [
                  Expanded(
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(children: [
                        for (final (s, label) in [
                          (_Saring.semua, 'Semua'),
                          (_Saring.belum, 'Belum'),
                          (_Saring.bertanda, 'Bertanda Cek'),
                          (_Saring.selesai, 'Selesai')
                        ])
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: ChoiceChip(
                                label: Text(label),
                                selected: _saring == s,
                                onSelected: (_) => setState(() => _saring = s),
                                visualDensity: VisualDensity.compact),
                          ),
                      ]),
                    ),
                  ),
                  IconButton(
                      tooltip: _peta ? 'Daftar' : 'Peta',
                      onPressed: () => setState(() => _peta = !_peta),
                      icon: Icon(_peta ? Icons.list_alt_rounded : Icons.map_outlined)),
                ]),
              ),
              Expanded(child: _peta ? _PetaJalur(urut: tampil, onTap: _buka) : _daftar(tampil)),
            ]),
    );
  }

  Widget _daftar(List<BarisJalur> tampil) {
    if (tampil.isEmpty) return const SisiKosong(judul: 'Tidak Ada Tiang', pesan: 'Ubah saringan di atas.', ikon: Icons.filter_alt_off_outlined);
    return RefreshIndicator(
      onRefresh: _segarkan,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 90),
        itemCount: tampil.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (_, i) => _BarisTiang(b: tampil[i], onTap: () => _buka(tampil[i].tiang)),
      ),
    );
  }
}

class _BarisTiang extends StatelessWidget {
  const _BarisTiang({required this.b, required this.onTap});
  final BarisJalur b;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = b.tiang, w = warnaStatusTiang(t.statusTampil);
    final ket = [
      if (t.sirkuit.isNotEmpty && t.sirkuit.first.teks('penyulang').isNotEmpty) t.sirkuit.first.teks('penyulang'),
      if (t.sirkuit.length > 1) '${t.sirkuit.length} sirkuit',
      ...t.tanda.map(labelTanda)
    ];
    return Padding(
      padding: EdgeInsets.only(left: (b.dalam.clamp(0, 5)) * 14.0),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.neutral150)),
            child: Row(children: [
              Icon(b.cabang ? Icons.subdirectory_arrow_right_rounded : Icons.circle, size: b.cabang ? 20 : 12, color: w),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(t.nama, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.brand950)),
                  if (ket.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(ket.join(' · '),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, color: t.bertanda ? AppColors.red700 : AppColors.neutral500)),
                  ],
                ]),
              ),
              const SizedBox(width: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: w.withValues(alpha: .12), borderRadius: BorderRadius.circular(99)),
                child: Text(infoStatusTiang(t.statusTampil).$1, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: w)),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Peta jalur: garis tiang -> induk, titik berwarna status. Ubin OpenStreetMap (gratis, tersimpan di cache HP).
class _PetaJalur extends StatelessWidget {
  const _PetaJalur({required this.urut, required this.onTap});
  final List<BarisJalur> urut;
  final void Function(Tiang) onTap;

  @override
  Widget build(BuildContext context) {
    final titik = {
      for (final b in urut)
        if (b.tiang.adaTitik) b.tiang.id: LatLng(b.tiang.lat!, b.tiang.lng!)
    };
    if (titik.isEmpty) {
      return const SisiKosong(judul: 'Tidak Ada Titik', pesan: 'Tiang di saringan ini belum punya koordinat.', ikon: Icons.location_off_outlined);
    }
    final garis = [
      for (final b in urut)
        if (titik.containsKey(b.tiang.id) && titik.containsKey(b.tiang.induk))
          Polyline(points: [titik[b.tiang.induk]!, titik[b.tiang.id]!], color: AppColors.brand600, strokeWidth: 3),
    ];
    return FlutterMap(
      options: MapOptions(
        initialCameraFit: CameraFit.coordinates(coordinates: titik.values.toList(), padding: const EdgeInsets.all(40), maxZoom: 17),
        interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
      ),
      children: [
        TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', userAgentPackageName: 'id.co.pln.toboali.sisi_row', maxNativeZoom: 19),
        PolylineLayer(polylines: garis),
        MarkerLayer(markers: [
          for (final b in urut)
            if (titik.containsKey(b.tiang.id))
              Marker(
                point: titik[b.tiang.id]!,
                width: 22,
                height: 22,
                child: GestureDetector(
                  onTap: () => onTap(b.tiang),
                  child: Container(
                      decoration: BoxDecoration(
                          color: warnaStatusTiang(b.tiang.statusTampil),
                          shape: BoxShape.circle,
                          border: Border.all(color: b.tiang.bertanda ? AppColors.red700 : Colors.white, width: 3))),
                ),
              ),
        ]),
        const SimpleAttributionWidget(source: Text('OpenStreetMap contributors')),
      ],
    );
  }
}
