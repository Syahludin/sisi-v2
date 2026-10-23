import 'dart:async';

import 'package:flutter/material.dart';

import '../../widgets/sisi_loader.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/popup_berhasil.dart';

/// v0.69.0: kartu "Master Gardu" di Pengaturan (desain sama kartu Master Data). Hanya tampil untuk akun dengan
/// menu Pengukuran Gardu / Berita Acara Gardu (+ petugas Yandal, Hartek, dan v1.0.21 Inspeksi Gardu). Isi: db_Gardu AKTIF + TIDAK AKTIF (+ pejabat BA untuk menu BA).
class DownloadMasterGarduCard extends StatefulWidget {
  const DownloadMasterGarduCard({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  @override
  State<DownloadMasterGarduCard> createState() => _DownloadMasterGarduCardState();
}

class _DownloadMasterGarduCardState extends State<DownloadMasterGarduCard> {
  static const _merah = Color(0xFFDC2626);

  ({String versi, DateTime diambil, int jumlah})? _info;
  bool _jalan = false;
  String? _gagal;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  Future<void> _muat() async {
    final i = await widget.deps.gardu.info();
    if (mounted) setState(() => _info = i);
  }

  Future<void> _download() async {
    if (_jalan) return;
    setState(() {
      _jalan = true;
      _gagal = null;
    });
    try {
      final berubah = await widget.deps.gardu.segarkan(widget.sesi);
      // v1.0.21: tim Inspeksi Gardu = daftar gardu + jenis temuan form Inspeksi Gardu ikut diperbarui (siap offline)
      if (widget.sesi.petugasInsDu) await widget.deps.insdu.segarkanMaster(widget.sesi, paksa: true);
      await _muat();
      if (!mounted) return;
      setState(() => _jalan = false);
      final n = _info?.jumlah ?? 0;
      unawaited(tampilPopupBerhasil(context,
          judul: 'Master Gardu berhasil didownload', keterangan: berubah ? '$n gardu diperbarui di HP' : 'Sudah terbaru, $n gardu di HP'));
    } on ApiException catch (e) {
      _berhenti(KodeError.pesan(e.kode));
    } catch (_) {
      _berhenti('Download gagal. Cek sinyal lalu coba ulang.');
    }
  }

  void _berhenti(String pesan) {
    if (!mounted) return;
    setState(() {
      _jalan = false;
      _gagal = pesan;
    });
  }

  @override
  Widget build(BuildContext context) {
    final gagal = _gagal != null && !_jalan;
    final i = _info;
    final warna = gagal ? _merah : AppColors.navy700;
    final keterangan = gagal
        ? _gagal!
        : _jalan
            ? 'Mengunduh data gardu...'
            : i == null
                ? 'Belum diunduh. Dipakai menu Pengukuran Gardu & Berita Acara.'
                : '${i.jumlah} gardu · ${DateFormat('dd MMM yyyy, HH:mm', 'id_ID').format(i.diambil.toLocal())}';
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: gagal ? const Color(0xFFFEE2E2) : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: gagal ? const Color(0xFFFCA5A5) : AppColors.neutral200),
        boxShadow: [BoxShadow(color: AppColors.navy950.withValues(alpha: .055), blurRadius: 14, offset: const Offset(0, 5))],
      ),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.all(15),
          child: Row(children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: warna.withValues(alpha: .12), borderRadius: BorderRadius.circular(14)),
              child: Icon(gagal ? Icons.error_outline_rounded : Icons.electrical_services_rounded, color: warna, size: 24),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Master Gardu', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text(keterangan,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 10.5,
                        height: 1.2,
                        color: gagal ? _merah : (i == null && !_jalan ? AppColors.neutral500 : AppColors.success700),
                        fontWeight: FontWeight.w600)),
              ]),
            ),
            const SizedBox(width: 8),
            SizedBox(
              height: 38,
              child: FilledButton.icon(
                onPressed: _jalan ? null : _download,
                icon: Icon(gagal ? Icons.refresh_rounded : Icons.download_rounded, size: 18),
                label: Text(gagal ? 'Coba Ulang' : 'Download', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
                style: FilledButton.styleFrom(
                  minimumSize: const Size(0, 38),
                  backgroundColor: gagal ? _merah : AppColors.navy700,
                  padding: const EdgeInsets.symmetric(horizontal: 13),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(11)),
                ),
              ),
            ),
          ]),
        ),
        if (_jalan) const Center(child: SisiLoader(ukuran: 28)),
      ]),
    );
  }
}
