import 'dart:async';

import 'dart:io';

import 'package:flutter/material.dart';

import '../features/row/foto_repository.dart';
import '../features/row/row_repository.dart';
import '../theme/app_colors.dart';
import 'popup_berhasil.dart';
import 'sisi_widgets.dart';

/// Isi satu kotak foto: file lokal (path) + status upload. path null = kosong.
class IsiSlot {
  const IsiSlot({this.path, this.status, this.label, this.warnaLabel, this.ikon});
  final String? path;
  final String? status; // null (belum disimpan) | TERTUNDA | TERKIRIM | GAGAL
  /// v0.64.7: teks di bawah foto (menggantikan teks status upload), mis. P0 "Disimpan" / "Belum disimpan".
  final String? label;
  final Color? warnaLabel;
  /// Ikon kecil di pojok foto (mis. gembok foto P0 yang sudah disimpan).
  final IconData? ikon;
}

/// Tiga kotak foto Sebelum / Pekerjaan / Sesudah (pola eksekusi_row_screen lama).
class FotoSlotRow extends StatelessWidget {
  const FotoSlotRow({super.key, required this.isi, this.onPilih, this.lengkapDiServer = false});
  final Map<String, IsiSlot> isi;
  final void Function(String slot)? onPilih;
  final bool lengkapDiServer;

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      for (final s in FotoRepository.slot) ...[
        Expanded(child: _Kotak(slot: s, isi: isi[s] ?? const IsiSlot(), onTap: onPilih == null ? null : () => onPilih!(s), server: lengkapDiServer)),
        if (s != FotoRepository.slot.last) const SizedBox(width: 10),
      ],
    ]);
  }
}

class _Kotak extends StatelessWidget {
  const _Kotak({required this.slot, required this.isi, this.onTap, required this.server});
  final String slot;
  final IsiSlot isi;
  final VoidCallback? onTap;
  final bool server;

  @override
  Widget build(BuildContext context) {
    final path = isi.path;
    final (String teks, Color warna) = isi.label != null ? (isi.label!, isi.warnaLabel ?? AppColors.neutral500) : switch (isi.status) {
      'TERKIRIM' => ('Terkirim', AppColors.success700),
      'TERTUNDA' => ('Menunggu', AppColors.accent700),
      'GAGAL' => ('Gagal', AppColors.red700),
      null when path != null => ('Baru', AppColors.navy700),
      _ => (server ? 'Di server' : 'Kosong', server ? AppColors.success700 : AppColors.neutral500),
    };
    return Column(children: [
      AspectRatio(
        aspectRatio: 1,
        child: Material(
          color: const Color(0xFFF8FAFC),
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(color: isi.status == 'GAGAL' ? AppColors.red600 : AppColors.neutral200),
          ),
          child: InkWell(
            onTap: onTap,
            child: path != null
                ? Stack(fit: StackFit.expand, children: [
                    Image.file(File(path), fit: BoxFit.cover,
                        errorBuilder: (context, error, stack) => const Icon(Icons.broken_image_outlined, color: AppColors.neutral400)),
                    if (isi.ikon != null)
                      Positioned(
                        top: 6,
                        right: 6,
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: BoxDecoration(color: isi.warnaLabel ?? AppColors.navy700, shape: BoxShape.circle),
                          child: Icon(isi.ikon, size: 14, color: Colors.white),
                        ),
                      ),
                  ])
                : Icon(server ? Icons.cloud_done_outlined : Icons.add_a_photo_outlined,
                    color: onTap == null ? AppColors.neutral300 : AppColors.navy700, size: 26),
          ),
        ),
      ),
      const SizedBox(height: 6),
      Text(FotoRepository.label[slot]!, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.navy900)),
      Text(teks, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: warna)),
    ]);
  }
}

/// Menu ketuk kotak foto. Sudah ada foto: Lihat Foto / Ambil Ulang dari Kamera / Ambil Ulang dari Galeri.
/// Belum ada: Ambil dari Kamera / Ambil dari Galeri. Hasil: 'LIHAT' | 'KAMERA' | 'GALERI', null = batal.
/// v0.64.5: `alasanTidakUlang` diisi = Ambil Ulang tampil nonaktif dengan alasannya (P0: tahap berikutnya sudah difoto).
Future<String?> pilihSumberFoto(BuildContext context, String slot,
    {bool adaFoto = false, bool bolehGaleri = true, String? alasanTidakUlang}) {
  final ulang = adaFoto ? 'Ambil Ulang' : 'Ambil';
  return showModalBottomSheet<String>(
    context: context,
    builder: (c) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Foto ${FotoRepository.label[slot]}', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          if (adaFoto)
            ListTile(
              leading: const Icon(Icons.visibility_outlined),
              title: const Text('Lihat Foto'),
              onTap: () => Navigator.pop(c, 'LIHAT'),
            ),
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: Text('$ulang dari Kamera'),
            subtitle: alasanTidakUlang == null ? null : Text(alasanTidakUlang),
            enabled: alasanTidakUlang == null,
            onTap: () => Navigator.pop(c, 'KAMERA'),
          ),
          if (bolehGaleri && alasanTidakUlang == null) // v0.64.1: P0 Yandal wajib kamera SiSi (jam + GPS bukti pekerjaan)
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: Text('$ulang dari Galeri'),
              onTap: () => Navigator.pop(c, 'GALERI'),
            ),
        ]),
      ),
    ),
  );
}

/// Buka foto layar penuh (bisa dicubit untuk zoom). Foto disimpan di folder privat app, bukan galeri HP.
/// `namaGaleri` diisi = tombol Simpan ke Galeri tampil (hanya untuk foto yang sudah ber-watermark).
Future<void> lihatFoto(BuildContext context, {required String path, required String slot, String? keterangan, String? namaGaleri}) {
  return Navigator.of(context).push<void>(MaterialPageRoute(
    fullscreenDialog: true,
    builder: (_) => LihatFotoScreen(
        path: path, judul: 'Foto ${FotoRepository.label[slot] ?? slot}', keterangan: keterangan, namaGaleri: namaGaleri),
  ));
}

class LihatFotoScreen extends StatelessWidget {
  const LihatFotoScreen({super.key, required this.path, required this.judul, this.keterangan, this.namaGaleri});
  final String path;
  final String judul;
  final String? keterangan;
  final String? namaGaleri;

  Future<void> _keGaleri(BuildContext context) async {
    if (!await FotoRepository.izinGaleri()) {
      if (context.mounted) tampilPesan(context, 'Izin galeri ditolak. Izinkan di Pengaturan HP.');
      return;
    }
    try {
      await FotoRepository.keGaleri(path, nama: namaGaleri!);
      if (context.mounted) {
        unawaited(tampilPopupBerhasil(context,
            judul: 'Foto berhasil didownload', keterangan: 'Tersimpan di galeri\nalbum ${FotoRepository.albumGaleri}'));
      }
    } on RowError catch (e) {
      if (context.mounted) tampilPesan(context, e.pesan);
    } catch (_) {
      if (context.mounted) tampilPesan(context, 'Gagal simpan ke galeri.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        iconTheme: const IconThemeData(color: Colors.white),
        actionsIconTheme: const IconThemeData(color: Colors.white),
        actions: [
          if (namaGaleri != null)
            IconButton(
              onPressed: () => _keGaleri(context),
              icon: const Icon(Icons.save_alt_rounded),
              tooltip: 'Simpan ke Galeri',
            ),
        ],
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(judul, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          if (keterangan != null) Text(keterangan!, style: const TextStyle(fontSize: 12, color: Colors.white70)),
        ]),
      ),
      body: Center(
        child: InteractiveViewer(
          minScale: 1,
          maxScale: 6,
          child: Image.file(
            File(path),
            fit: BoxFit.contain,
            errorBuilder: (context, error, stack) => const Padding(
              padding: EdgeInsets.all(24),
              child: Text('File foto tidak ditemukan di HP. Gunakan Download ulang foto.',
                  textAlign: TextAlign.center, style: TextStyle(color: Colors.white)),
            ),
          ),
        ),
      ),
    );
  }
}
