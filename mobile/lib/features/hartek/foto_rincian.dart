import 'dart:io';

import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import 'hartek_gaya.dart';
import 'hartek_lokal.dart';

/// v1.0.0: deret kotak foto kecil di kartu rincian (grounding, pemerataan, temuan inspeksi).
/// Keadaan per slot: foto di HP (gambar), sudah di Drive (ikon awan), menunggu kirim (jam), ditolak (merah), kosong.
/// Kunci node sama dengan HartekLokal: fotoLokal / _fotoSinkron / _fotoGalat / foto.
class FotoRincian extends StatelessWidget {
  const FotoRincian(
      {super.key, required this.node, required this.slot, required this.label, this.onTap, this.bolehTambah = false, this.gambarServer});
  final Map<String, dynamic> node;
  final List<String> slot;
  final Map<String, String> label;

  /// Ketuk satu slot (lihat / coba lagi / ambil foto susulan). null = tidak bisa diketuk.
  final void Function(String slot)? onTap;

  /// Slot kosong boleh diisi (foto susulan).
  final bool bolehTambah;

  /// v1.0.15: gambar foto yang sudah di server (mis. thumbnail WO lewat server). null = ikon awan saja.
  final Widget Function(String slot)? gambarServer;

  @override
  Widget build(BuildContext context) {
    final hp = HartekLokal.fotoDiHp(node), srv = HartekLokal.fotoDiServer(node);
    final tampil = [
      for (final s in slot)
        if (hp[s] != null || srv[s] != null || bolehTambah) s,
    ];
    if (tampil.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Wrap(spacing: 8, runSpacing: 8, children: [
        for (final s in tampil)
          _Kotak(
            label: label[s] ?? s,
            path: hp[s],
            diServer: srv[s] != null,
            status: HartekLokal.statusFoto(node, s),
            gambarServer: srv[s] != null ? gambarServer?.call(s) : null,
            onTap: onTap == null ? null : () => onTap!(s),
          ),
      ]),
    );
  }
}

class _Kotak extends StatelessWidget {
  const _Kotak({required this.label, this.path, required this.diServer, this.status, this.gambarServer, this.onTap});
  final String label;
  final String? path;
  final bool diServer;
  final String? status;
  final Widget? gambarServer;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final p = path;
    final adaFile = p != null && p.isNotEmpty && File(p).existsSync();
    final gagal = status == HartekLokal.gagal;
    final Widget isi;
    if (adaFile) {
      isi = Image.file(File(p), fit: BoxFit.cover, cacheWidth: 240, gaplessPlayback: true);
    } else if (diServer) {
      isi = gambarServer ?? const Center(child: Icon(Icons.cloud_done_rounded, color: AppColors.success700, size: 24));
    } else {
      isi = const Center(child: Icon(Icons.add_a_photo_rounded, color: HartekGaya.merek, size: 22));
    }
    final IconData? tanda = gagal
        ? Icons.error_rounded
        : status == HartekLokal.lokal
            ? Icons.schedule_rounded
            : (adaFile || gambarServer != null) && diServer
                ? Icons.cloud_done_rounded
                : null;
    return Semantics(
      button: onTap != null,
      label: '$label${gagal ? ', ditolak server' : status == HartekLokal.lokal ? ', menunggu kirim' : diServer ? ', terkirim' : ''}',
      child: SizedBox(
        width: 84,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Material(
            color: adaFile ? Colors.black : AppColors.neutral50,
            clipBehavior: Clip.antiAlias,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
              side: BorderSide(color: gagal ? AppColors.red600 : HartekGaya.garis, width: gagal ? 1.4 : 1),
            ),
            child: InkWell(
              onTap: onTap,
              child: AspectRatio(
                aspectRatio: 4 / 3,
                child: Stack(fit: StackFit.expand, children: [
                  isi,
                  if (tanda != null)
                    Positioned(
                      right: 4,
                      top: 4,
                      child: Container(
                        padding: const EdgeInsets.all(2),
                        decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                        child: Icon(tanda,
                            size: 14,
                            color: gagal
                                ? AppColors.red600
                                : status == HartekLokal.lokal
                                    ? AppColors.accent700
                                    : AppColors.success700),
                      ),
                    ),
                ]),
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(label,
              maxLines: 2,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11.5, height: 1.25, color: gagal ? AppColors.red700 : HartekGaya.redup)),
        ]),
      ),
    );
  }
}
