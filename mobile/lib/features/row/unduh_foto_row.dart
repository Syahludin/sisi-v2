import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/sisi_widgets.dart';
import 'foto_repository.dart';

/// v1.0.33 (permintaan kvlar 24 Okt 2026): tombol download foto ROW ke galeri, sekali ketuk untuk satu penyulang penuh
/// (kartu penyulang di Detail Laporan) atau satu eksekusi (kartu di rincian penyulang). [eksekusi] dibaca saat ditekan.
class TombolUnduhFotoRow extends StatefulWidget {
  const TombolUnduhFotoRow({super.key, required this.deps, required this.sesi, required this.label, required this.eksekusi, this.padat = false});
  final Deps deps;
  final Sesi sesi;
  final String label;
  final Future<List<({String id, String kode})>> Function() eksekusi;

  /// Tombol kecil (kartu eksekusi).
  final bool padat;

  @override
  State<TombolUnduhFotoRow> createState() => _TombolUnduhFotoRowState();
}

class _TombolUnduhFotoRowState extends State<TombolUnduhFotoRow> {
  ({int selesai, int total})? _jalan;

  Future<void> _unduh() async {
    if (_jalan != null) return;
    if (!await FotoRepository.izinGaleri()) {
      if (mounted) tampilPesan(context, 'Izin galeri ditolak. Izinkan di Pengaturan HP.');
      return;
    }
    setState(() => _jalan = (selesai: 0, total: 0));
    try {
      final daftar = await widget.eksekusi();
      final h = await widget.deps.foto.keGaleriEksekusi(widget.sesi, daftar, progres: (s, t) {
        if (mounted) setState(() => _jalan = (selesai: s, total: t));
      });
      if (!mounted) return;
      if (h.galeri == 0) {
        tampilPesan(context, h.gagal > 0 ? 'Foto gagal disimpan ke galeri.' : 'Belum ada foto.');
      } else {
        unawaited(tampilPopupBerhasil(context,
            judul: 'Foto berhasil didownload',
            keterangan: '${h.galeri} foto tersimpan di galeri\nalbum ${FotoRepository.albumGaleri}${h.gagal > 0 ? '\n${h.gagal} foto gagal' : ''}'));
      }
    } catch (_) {
      if (mounted) tampilPesan(context, 'Foto gagal didownload. Coba lagi.');
    } finally {
      if (mounted) setState(() => _jalan = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final j = _jalan;
    final label = j == null ? widget.label : (j.total == 0 ? 'Menyiapkan...' : 'Download ${j.selesai}/${j.total}');
    return OutlinedButton.icon(
      onPressed: j == null ? () => unawaited(_unduh()) : null,
      style: widget.padat
          ? OutlinedButton.styleFrom(visualDensity: VisualDensity.compact, padding: const EdgeInsets.symmetric(horizontal: 12))
          : OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(42)),
      icon: j == null ? Icon(Icons.download_rounded, size: widget.padat ? 16 : 18) : SisiLoader(ukuran: widget.padat ? 14 : 16),
      label: Text(label,
          maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: widget.padat ? 12 : 13, fontWeight: FontWeight.w700)),
    );
  }
}
