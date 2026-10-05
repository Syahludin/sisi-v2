import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../features/master/master_repository.dart';
import '../../theme/app_colors.dart';

enum _Tahap { menunggu, jalan, selesai, gagal }

/// Kartu "Master Data" (desain sync_section_pengaturan lama, disederhanakan 3 Okt 2026):
/// satu unduhan untuk semua modul master. Saat download tampil progress bar per modul
/// (tanpa jumlah isian data), keadaan gagal merah + Coba Ulang, dialog berhasil.
/// Tiap modul diminta terpisah (getMaster modul: [m]) supaya progresnya nyata, bukan animasi palsu.
class DownloadMasterCard extends StatefulWidget {
  const DownloadMasterCard({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  @override
  State<DownloadMasterCard> createState() => _DownloadMasterCardState();
}

class _DownloadMasterCardState extends State<DownloadMasterCard> {
  static const _merah = Color(0xFFDC2626);
  static const _merahMuda = Color(0xFFFEE2E2);
  static const _merahGaris = Color(0xFFFCA5A5);

  Map<String, InfoModul> _info = const {};
  Map<String, _Tahap> _tahap = const {};
  bool _jalan = false;
  String? _gagal;

  Color get _warna => _gagal != null ? _merah : AppColors.navy700;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  Future<void> _muat() async {
    final i = await widget.deps.master.infoModul();
    if (mounted) setState(() => _info = i);
  }

  /// Waktu sinkron terlama di antara modul (semua modul paling tidak sebaru ini). null = ada yang belum pernah.
  DateTime? get _terakhir {
    if (_info.isEmpty || _info.values.any((i) => !i.ada)) return null;
    return _info.values.map((i) => i.diambil!).reduce((a, b) => a.isBefore(b) ? a : b);
  }

  Future<void> _download() async {
    if (_jalan) return;
    final modul = MasterRepository.semuaModul;
    // Coba ulang: modul yang sudah selesai di percobaan sebelumnya tidak diulang.
    final ulang = _gagal != null;
    setState(() {
      _jalan = true;
      _gagal = null;
      _tahap = {for (final m in modul) m: ulang && _tahap[m] == _Tahap.selesai ? _Tahap.selesai : _Tahap.menunggu};
    });
    for (final m in modul) {
      if (_tahap[m] == _Tahap.selesai) continue;
      setState(() => _tahap = {..._tahap, m: _Tahap.jalan});
      try {
        await widget.deps.master.segarkan(widget.sesi, modul: [m]);
        if (!mounted) return;
        setState(() => _tahap = {..._tahap, m: _Tahap.selesai});
      } on ApiException catch (e) {
        _berhenti(m, KodeError.pesan(e.kode));
        return;
      } catch (_) {
        _berhenti(m, 'Download gagal. Cek sinyal lalu coba ulang.');
        return;
      }
    }
    await _muat();
    if (!mounted) return;
    setState(() => _jalan = false);
    await _dialogBerhasil();
    if (mounted) setState(() => _tahap = const {});
  }

  void _berhenti(String m, String pesan) {
    if (!mounted) return;
    setState(() {
      _tahap = {..._tahap, m: _Tahap.gagal};
      _gagal = pesan;
      _jalan = false;
    });
    _muat();
  }

  Future<void> _dialogBerhasil() {
    return showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        contentPadding: const EdgeInsets.fromLTRB(24, 24, 24, 18),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 54,
            height: 54,
            decoration: const BoxDecoration(color: AppColors.cyan100, shape: BoxShape.circle),
            child: const Icon(Icons.check_rounded, color: AppColors.cyan600, size: 32),
          ),
          const SizedBox(height: 14),
          const Text('Master Data berhasil di-download',
              textAlign: TextAlign.center, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          const Text('Semua data master sudah tersimpan dan siap digunakan offline.',
              textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: AppColors.neutral500)),
          const SizedBox(height: 17),
          SizedBox(width: double.infinity, child: FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Selesai'))),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final gagal = _gagal != null && !_jalan;
    final t = _terakhir;
    final keterangan = gagal
        ? _gagal!
        : _jalan
            ? 'Mengunduh...'
            : t == null
                ? 'Belum tersinkron'
                : 'Tersinkron ${DateFormat('dd MMM yyyy, HH:mm', 'id_ID').format(t.toLocal())}';
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: gagal ? _merahMuda : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: gagal ? _merahGaris : AppColors.neutral200),
        boxShadow: [BoxShadow(color: (gagal ? _merah : AppColors.navy950).withValues(alpha: .055), blurRadius: 14, offset: const Offset(0, 5))],
      ),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.all(15),
          child: Row(children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: _warna.withValues(alpha: .12), borderRadius: BorderRadius.circular(14)),
              child: Icon(gagal ? Icons.error_outline_rounded : Icons.storage_rounded, color: _warna, size: 24),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Master Data', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text(keterangan,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 10.5,
                        height: 1.2,
                        color: gagal ? _merah : (t == null && !_jalan ? AppColors.neutral500 : AppColors.success700),
                        fontWeight: FontWeight.w600)),
              ]),
            ),
            const SizedBox(width: 8),
            SizedBox(
              height: 38,
              child: gagal
                  ? OutlinedButton.icon(
                      onPressed: _download,
                      icon: const Icon(Icons.refresh_rounded, size: 18),
                      label: const Text('Coba Ulang', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: _merah),
                        foregroundColor: _merah,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(11)),
                      ),
                    )
                  : FilledButton.icon(
                      onPressed: _jalan ? null : _download,
                      icon: const Icon(Icons.download_rounded, size: 18),
                      label: const Text('Download', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(0, 38),
                        backgroundColor: AppColors.navy700,
                        padding: const EdgeInsets.symmetric(horizontal: 13),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(11)),
                      ),
                    ),
            ),
          ]),
        ),
        if (_tahap.isNotEmpty) ...[
          const Divider(height: 1),
          Container(
            color: gagal ? Colors.white.withValues(alpha: .5) : AppColors.neutral50,
            padding: const EdgeInsets.fromLTRB(15, 12, 15, 6),
            child: Column(children: [for (final m in MasterRepository.semuaModul) _barisModul(m)]),
          ),
        ],
      ]),
    );
  }

  Widget _barisModul(String m) {
    final tahap = _tahap[m] ?? _Tahap.menunggu;
    final (String teks, Color warna, double? nilai) = switch (tahap) {
      _Tahap.menunggu => ('Menunggu', AppColors.neutral500, 0.0),
      _Tahap.jalan => ('Mengunduh', AppColors.navy700, null),
      _Tahap.selesai => ('Selesai', AppColors.success700, 1.0),
      _Tahap.gagal => ('Gagal', _merah, 1.0),
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Text(MasterRepository.label[m] ?? m, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600))),
          if (tahap == _Tahap.selesai) const Icon(Icons.check_circle_rounded, size: 14, color: AppColors.success700),
          if (tahap == _Tahap.gagal) const Icon(Icons.error_rounded, size: 14, color: _merah),
          const SizedBox(width: 4),
          Text(teks, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: warna)),
        ]),
        const SizedBox(height: 5),
        LinearProgressIndicator(
          value: nilai,
          minHeight: 5,
          borderRadius: BorderRadius.circular(5),
          color: tahap == _Tahap.selesai ? AppColors.success700 : (tahap == _Tahap.gagal ? _merah : AppColors.navy700),
          backgroundColor: AppColors.neutral200,
        ),
      ]),
    );
  }
}
