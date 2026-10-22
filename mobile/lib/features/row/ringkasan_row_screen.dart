import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/kartu_laporan_tim.dart';
import '../../widgets/sisi_widgets.dart';
import '../hartek/hartek_gaya.dart';
import '../insjar/insjar_header.dart';
import 'header_detail_screen.dart';
import 'realisasi_screen.dart';
import 'row_model.dart';

/// v0.90.0 (permintaan kvlar 14 Okt 2026): ringkasan detail laporan ROW, dibuka dengan mengetuk kartu laporan.
/// Total Rabas / Tebang Sedang / Tebang Besar, lalu per penyulang (angka per jenis + rincian per section).
/// Ketuk penyulang = daftar eksekusi. Kelola laporan (ubah, batal, WA dari server) tetap di Detail Laporan.
class RingkasanRowScreen extends StatefulWidget {
  const RingkasanRowScreen({super.key, required this.deps, required this.sesi, required this.headerId});
  final Deps deps;
  final Sesi sesi;
  final String headerId;

  @override
  State<RingkasanRowScreen> createState() => _RingkasanRowScreenState();
}

/// Jenis ROW dari master (urut kolom urutan): id + label pendek ('Rabas / Pangkas' -> 'Rabas').
typedef JenisRow = ({String id, String label});

String labelJenisRow(String nama) {
  final t = nama.split('/').first.trim();
  return t.isEmpty ? nama.trim() : t;
}

class _RingkasanRowScreenState extends State<RingkasanRowScreen> {
  RowHeader? _h;
  List<RowRealisasi> _real = const [];
  List<JenisRow> _jenis = const [];
  List<({String realisasiId, String section, String jenisId, int n})> _rinci = const [];
  Map<String, int> _belum = const {};
  bool _muat = true;

  @override
  void initState() {
    super.initState();
    _muatData();
  }

  Future<void> _muatData() async {
    final r = widget.deps.row;
    final h = await r.header(widget.headerId);
    final real = (await r.realisasiDari(widget.headerId)).where((x) => x.aktif).toList();
    final rinci = await r.rincianJenis(widget.headerId);
    final belum = await r.belumLengkap(widget.headerId);
    final master = (await widget.deps.master.jenisPekerjaan()).where((j) => j['modul'] == 'ROW').toList()
      ..sort((a, b) => ((a['urutan'] as num?) ?? 0).compareTo((b['urutan'] as num?) ?? 0));
    if (!mounted) return;
    setState(() {
      _h = h;
      _real = real;
      _rinci = rinci;
      _belum = belum;
      _jenis = [for (final j in master) (id: j['id'] as String, label: labelJenisRow(j['nama'] as String))];
      _muat = false;
    });
  }

  int _total(String jenisId, [String? realisasiId]) => _rinci
      .where((x) => x.jenisId == jenisId && (realisasiId == null || x.realisasiId == realisasiId))
      .fold(0, (a, x) => a + x.n);

  List<AngkaRingkas> _angka([String? realisasiId]) =>
      [for (final j in _jenis) AngkaRingkas(j.label, _total(j.id, realisasiId))];

  /// Rincian per section untuk satu penyulang: ('LBS Rias', 'Rabas 2 · Sedang 1').
  List<(String, String)> _perSection(String realisasiId) {
    final sections = <String>[];
    for (final x in _rinci) {
      if (x.realisasiId == realisasiId && !sections.contains(x.section)) sections.add(x.section);
    }
    return [
      for (final s in sections)
        (
          s,
          [
            for (final j in _jenis)
              if (_rinci.where((x) => x.realisasiId == realisasiId && x.section == s && x.jenisId == j.id).isNotEmpty)
                '${j.label} ${_rinci.where((x) => x.realisasiId == realisasiId && x.section == s && x.jenisId == j.id).fold(0, (a, x) => a + x.n)}',
          ].join(' · '),
        ),
    ];
  }

  Future<void> _bukaPenyulang(RowRealisasi r) async {
    await Navigator.push<void>(
        context, MaterialPageRoute(builder: (_) => RealisasiScreen(deps: widget.deps, sesi: widget.sesi, realisasiId: r.id)));
    if (mounted) await _muatData();
  }

  Future<void> _kelola() async {
    await Navigator.push<void>(
        context, MaterialPageRoute(builder: (_) => HeaderDetailScreen(deps: widget.deps, sesi: widget.sesi, headerId: widget.headerId)));
    if (mounted) await _muatData();
  }

  @override
  Widget build(BuildContext context) {
    final h = _h;
    return Scaffold(
      backgroundColor: HartekGaya.latar,
      appBar: sisiAppBar('Ringkasan ROW', subjudul: h?.kode),
      body: _muat || h == null
          ? const SisiLoading(ukuran: 60)
          : RefreshIndicator(
              onRefresh: _muatData,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
                children: [
                  // v1.0.16: header bergaya Hartek / Inspeksi (gradien merek, ikon berlatar)
                  HeaderInsJar(
                    kicker: 'Ringkasan ROW',
                    judul: widget.sesi.timNama.isEmpty ? 'Laporan ROW' : widget.sesi.timNama,
                    sub: DateFormat('EEEE, d MMMM y', 'id_ID').format(DateTime.parse(h.tanggal)),
                    ikon: Icons.forest_rounded,
                  ),
                  PanelAngkaRingkas(
                    angka: [..._angka(), AngkaRingkas('Total Eksekusi', _rinci.fold(0, (a, x) => a + x.n))],
                    keterangan: '${_real.length} penyulang · ${_rinci.fold(0, (a, x) => a + x.n)} eksekusi',
                  ),

                  const Padding(
                    padding: EdgeInsets.only(top: 26, bottom: 12),
                    child: Text('Per penyulang',
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.brand950)),
                  ),
                  if (_real.isEmpty)
                    const SisiKosong(
                        ikon: Icons.forest_outlined, judul: 'Belum ada penyulang', pesan: 'Tekan + di kartu laporan untuk menambah penyulang.'),
                  for (final r in _real)
                    GrupRingkasan(
                      ikon: Icons.forest_rounded,
                      warna: AppColors.success700,
                      latar: AppColors.success100,
                      judul: r.penyulang,
                      sub: [
                        '${_rinci.where((x) => x.realisasiId == r.id).fold(0, (a, x) => a + x.n)} eksekusi',
                        if ((_belum[r.id] ?? 0) > 0) '${_belum[r.id]} foto belum lengkap',
                      ].join(' · '),
                      angka: _angka(r.id),
                      baris: _perSection(r.id),
                      onTap: () => _bukaPenyulang(r),
                    ),
                  const SizedBox(height: 14),
                  OutlinedButton.icon(
                    onPressed: _kelola,
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                    icon: const Icon(Icons.tune_rounded, size: 18),
                    label: const Text('Kelola laporan'),
                  ),
                ],
              ),
            ),
    );
  }
}
