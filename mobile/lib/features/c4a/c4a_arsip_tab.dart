import 'dart:async';

import 'package:flutter/material.dart';

import '../hartek/hartek_gaya.dart';
import 'c4a_laporan_tab.dart' show kategoriC4A;

/// C4A (permintaan Master Guswan 15 Nov 2026): tab Arsip C4A. Hari-hari SEBELUM hari ini (filter rentang tanggal,
/// bawaan 7 hari terakhir), satu kartu per hari berisi jumlah per kategori UIW. Ketuk kartu = rincian temuan C4A hari itu.
class ArsipC4ATab extends StatefulWidget {
  const ArsipC4ATab({super.key, required this.hariIni, required this.muatArsip, required this.muatRincian, required this.kartuTemuan});

  /// Tanggal WIB hari ini (yyyy-MM-dd).
  final String hariIni;

  /// getArsipC4A {dari, sampai} -> {hari: [...]}.
  final Future<Map<String, dynamic>> Function(String dari, String sampai) muatArsip;

  /// getTemuanInspeksi {tanggal} -> daftar temuan (disaring c4aId terisi di sini).
  final Future<List<Map<String, dynamic>>> Function(String tanggal) muatRincian;
  final Widget Function(Map<String, dynamic> temuan) kartuTemuan;

  @override
  State<ArsipC4ATab> createState() => _ArsipC4ATabState();
}

class _ArsipC4ATabState extends State<ArsipC4ATab> {
  static String _iso(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  late DateTime _sampai = DateTime.parse(widget.hariIni).subtract(const Duration(days: 1));
  late DateTime _dari = _sampai.subtract(const Duration(days: 6));
  List<Map<String, dynamic>> _hari = const [];
  String? _galat, _buka;
  bool _muat = true;
  final Map<String, List<Map<String, dynamic>>> _rincian = {};

  @override
  void initState() {
    super.initState();
    unawaited(_unduh());
  }

  Future<void> _unduh() async {
    setState(() {
      _muat = true;
      _galat = null;
    });
    try {
      final r = await widget.muatArsip(_iso(_dari), _iso(_sampai));
      if (!mounted) return;
      setState(() => _hari = [for (final h in (r['hari'] as List<dynamic>? ?? const [])) if (h is Map) Map<String, dynamic>.from(h)]);
    } catch (_) {
      if (mounted) setState(() => _galat = 'Arsip butuh sinyal. Coba lagi.');
    } finally {
      if (mounted) setState(() => _muat = false);
    }
  }

  Future<void> _ketuk(String tanggal) async {
    if (_buka == tanggal) {
      setState(() => _buka = null);
      return;
    }
    setState(() => _buka = tanggal);
    if (_rincian.containsKey(tanggal)) return;
    try {
      final l = await widget.muatRincian(tanggal);
      if (mounted) setState(() => _rincian[tanggal] = [for (final t in l) if ('${t['c4aId'] ?? ''}'.trim().isNotEmpty) t]);
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Rincian butuh sinyal.')));
    }
  }

  Future<void> _pilihRentang() async {
    final batas = DateTime.parse(widget.hariIni).subtract(const Duration(days: 1));
    final r = await showDateRangePicker(
        context: context, firstDate: batas.subtract(const Duration(days: 365)), lastDate: batas, initialDateRange: DateTimeRange(start: _dari, end: _sampai));
    if (r == null || !mounted) return;
    _dari = r.start;
    _sampai = r.end;
    _rincian.clear();
    _buka = null;
    await _unduh();
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
        onRefresh: _unduh,
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 40), children: [
          OutlinedButton.icon(
            onPressed: _muat ? null : () => unawaited(_pilihRentang()),
            icon: const Icon(Icons.date_range_rounded),
            label: Text('${tanggalHartek(_iso(_dari))} – ${tanggalHartek(_iso(_sampai))}'),
          ),
          const SizedBox(height: 12),
          if (_muat)
            const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
          else if (_galat != null)
            Text(_galat!, style: HartekGaya.sekunder)
          else if (_hari.isEmpty)
            const Text('Belum ada laporan C4A di rentang ini.', style: HartekGaya.sekunder)
          else
            for (final h in _hari) ..._kartuHari(h),
        ]),
      );

  List<Widget> _kartuHari(Map<String, dynamic> h) {
    final tg = '${h['tanggal'] ?? ''}';
    final buka = _buka == tg;
    return [
      KartuHartek(
        margin: const EdgeInsets.only(bottom: 10),
        onTap: () => unawaited(_ketuk(tg)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(tanggalHartek(tg), style: HartekGaya.judulSeksi)),
            Icon(buka ? Icons.expand_less_rounded : Icons.expand_more_rounded, color: HartekGaya.redup),
          ]),
          Text('${h['jumlahLaporan'] ?? 0} laporan · ${h['penyulang'] ?? 0} penyulang · ${h['section'] ?? 0} section', style: HartekGaya.sekunder),
          const SizedBox(height: 6),
          Wrap(spacing: 6, runSpacing: 4, children: [
            for (final k in [...kategoriC4A, 'Lainnya'])
              if (k != 'Lainnya' || (h[k] ?? 0) != 0) Chip(visualDensity: VisualDensity.compact, label: Text('$k ${h[k] ?? 0}')),
          ]),
        ]),
      ),
      if (buka)
        if (_rincian[tg] == null)
          const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator()))
        else
          for (final t in _rincian[tg]!) widget.kartuTemuan(t),
    ];
  }
}
