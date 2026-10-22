import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import '../../widgets/sisi_motif.dart';
import '../hartek/hartek_gaya.dart';
import 'insjar_header.dart';
import 'temuan_offline.dart';

/// Ringkasan dikelompokkan per jenis temuan atau per section (section = jenis temuan di dalamnya).
enum ModeRingkasTemuan { jenis, section }

/// v1.0.17: kartu ringkasan jumlah temuan per jenis (di bawah filter). Satu seri besaran = bar horizontal satu warna
/// (warna merek), angka dengan warna teks. Ketuk satu jenis = saring / lepas saring jenis itu.
/// v1.0.18 (permintaan kvlar 22 Okt 2026): di halaman utama hanya ringkas (total + 3 teratas) dengan pilihan
/// Jenis / Section; rincian lengkap dibuka di halaman terpisah ([RingkasanTemuanScreen]) supaya halaman utama lega.
class KartuRingkasTemuan extends StatelessWidget {
  const KartuRingkasTemuan({
    super.key,
    required this.temuan,
    required this.dariSemua,
    required this.mode,
    required this.onMode,
    required this.dipilih,
    required this.onPilih,
    this.maksBaris = 3,
  });

  /// Temuan yang tampil (sudah disaring).
  final List<Map<String, dynamic>> temuan;
  final int dariSemua, maksBaris;
  final ModeRingkasTemuan mode;
  final ValueChanged<ModeRingkasTemuan> onMode;
  final Set<String> dipilih;
  final ValueChanged<String> onPilih;

  Future<void> _rincian(BuildContext context) async {
    final j = await Navigator.of(context).push<String>(MaterialPageRoute(
      builder: (_) => RingkasanTemuanScreen(temuan: temuan, modeAwal: mode, dipilih: dipilih),
    ));
    if (j != null) onPilih(j);
  }

  @override
  Widget build(BuildContext context) {
    final total = temuan.length;
    final jenis = ringkasJenisTemuan(temuan);
    final section = ringkasSectionTemuan(temuan);
    final maks = mode == ModeRingkasTemuan.jenis
        ? (jenis.isEmpty ? 1 : jenis.first.jumlah)
        : (section.isEmpty ? 1 : section.first.jumlah);
    final jumlahGrup = mode == ModeRingkasTemuan.jenis ? jenis.length : section.length;
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: HartekGaya.garis),
        boxShadow: [BoxShadow(color: AppColors.navy900.withValues(alpha: .05), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        LatarSisi(
          radius: 0,
          bayangan: false,
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Row(children: [
                  PercikSisi(tinggi: 11),
                  SizedBox(width: 6),
                  Text('RINGKASAN TEMUAN', style: TextStyle(fontSize: 11, letterSpacing: 1.2, fontWeight: FontWeight.w800, color: Colors.white70)),
                ]),
                const SizedBox(height: 3),
                Text('${jenis.length} jenis · ${section.length} section', style: const TextStyle(fontSize: 13, color: HartekGaya.putih85)),
              ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('$total',
                  style: const TextStyle(fontSize: 30, height: 1, fontWeight: FontWeight.w900, color: Colors.white, fontFeatures: HartekGaya.tabular)),
              if (total != dariSemua) Text('dari $dariSemua', style: const TextStyle(fontSize: 12, color: HartekGaya.putih85)),
            ]),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          child: SegmentedButton<ModeRingkasTemuan>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(value: ModeRingkasTemuan.jenis, icon: Icon(Icons.category_outlined, size: 18), label: Text('Per jenis')),
              ButtonSegment(value: ModeRingkasTemuan.section, icon: Icon(Icons.cable_rounded, size: 18), label: Text('Per section')),
            ],
            selected: {mode},
            onSelectionChanged: (v) => onMode(v.first),
          ),
        ),
        if (total == 0)
          const Padding(padding: EdgeInsets.all(16), child: Text('Tidak ada temuan.', style: HartekGaya.sekunder))
        else
          Padding(
            padding: const EdgeInsets.fromLTRB(6, 4, 6, 0),
            child: Column(children: [
              if (mode == ModeRingkasTemuan.jenis)
                for (final r in jenis.take(maksBaris))
                  BarisRingkasTemuan(
                    label: r.jenis,
                    jumlah: r.jumlah,
                    persen: r.jumlah * 100 / total,
                    lebar: r.jumlah / maks,
                    dipilih: dipilih.contains(r.jenis),
                    onTap: () => onPilih(r.jenis),
                  )
              else
                for (final r in section.take(maksBaris))
                  BarisRingkasTemuan(
                    label: r.section,
                    jumlah: r.jumlah,
                    persen: r.jumlah * 100 / total,
                    lebar: r.jumlah / maks,
                    keterangan: r.jenis.map((j) => '${j.jenis} ${j.jumlah}').join(' · '),
                    onTap: () => _rincian(context),
                  ),
            ]),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 0, 8, 6),
          child: TextButton.icon(
            onPressed: total == 0 ? null : () => _rincian(context),
            icon: const Icon(Icons.insights_rounded, size: 18),
            label: Text(jumlahGrup > maksBaris
                ? 'Lihat rincian ($jumlahGrup ${mode == ModeRingkasTemuan.jenis ? 'jenis' : 'section'})'
                : 'Lihat rincian ringkasan'),
          ),
        ),
      ]),
    );
  }
}

/// Satu baris ringkasan: label, jumlah, persen, bar. [keterangan] = rincian kecil (jenis temuan di section ini).
class BarisRingkasTemuan extends StatelessWidget {
  const BarisRingkasTemuan({
    super.key,
    required this.label,
    required this.jumlah,
    required this.persen,
    required this.lebar,
    this.dipilih = false,
    this.keterangan,
    this.onTap,
  });
  final String label;
  final int jumlah;
  final double persen, lebar;
  final bool dipilih;
  final String? keterangan;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: onTap != null,
        selected: dipilih,
        label: '$label: $jumlah temuan, ${persen.round()} persen.',
        child: Material(
          color: dipilih ? AppColors.brand50 : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  if (dipilih) const Padding(padding: EdgeInsets.only(right: 6), child: Icon(Icons.filter_alt_rounded, size: 16, color: HartekGaya.merek)),
                  Expanded(
                    child: Text(label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 13.5, fontWeight: dipilih ? FontWeight.w800 : FontWeight.w600, color: HartekGaya.tinta)),
                  ),
                  const SizedBox(width: 8),
                  Text('$jumlah', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: HartekGaya.tinta, fontFeatures: HartekGaya.tabular)),
                  SizedBox(
                    width: 44,
                    child: Text('${persen.round()}%',
                        textAlign: TextAlign.right, style: const TextStyle(fontSize: 12, color: HartekGaya.redup, fontFeatures: HartekGaya.tabular)),
                  ),
                ]),
                if (keterangan != null && keterangan!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(keterangan!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: HartekGaya.redup)),
                  ),
                const SizedBox(height: 6),
                LayoutBuilder(
                  builder: (context, c) => Stack(children: [
                    Container(height: 8, decoration: BoxDecoration(color: AppColors.neutral100, borderRadius: BorderRadius.circular(4))),
                    Container(
                      height: 8,
                      width: (c.maxWidth * lebar).clamp(8.0, c.maxWidth),
                      decoration: BoxDecoration(color: dipilih ? AppColors.brand700 : AppColors.brand500, borderRadius: BorderRadius.circular(4)),
                    ),
                  ]),
                ),
              ]),
            ),
          ),
        ),
      );
}

/// v1.0.18: halaman rincian ringkasan temuan. Per jenis = semua jenis (bar); per section = satu kartu per section berisi
/// jumlah tiap jenis temuan di section itu. Ketuk jenis = kembali ke daftar dengan saringan jenis itu.
class RingkasanTemuanScreen extends StatefulWidget {
  const RingkasanTemuanScreen({super.key, required this.temuan, required this.modeAwal, this.dipilih = const {}});
  final List<Map<String, dynamic>> temuan;
  final ModeRingkasTemuan modeAwal;
  final Set<String> dipilih;

  @override
  State<RingkasanTemuanScreen> createState() => _RingkasanTemuanScreenState();
}

class _RingkasanTemuanScreenState extends State<RingkasanTemuanScreen> {
  late ModeRingkasTemuan _mode = widget.modeAwal;

  @override
  Widget build(BuildContext context) {
    final total = widget.temuan.length;
    final jenis = ringkasJenisTemuan(widget.temuan);
    final section = ringkasSectionTemuan(widget.temuan);
    final maksJ = jenis.isEmpty ? 1 : jenis.first.jumlah;
    return Scaffold(
      backgroundColor: HartekGaya.latar,
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 10, 16, 32), children: [
          HeaderInsJar(
            kicker: 'Ringkasan Temuan',
            judul: '$total temuan',
            sub: '${jenis.length} jenis · ${section.length} section',
            ikon: Icons.insights_rounded,
            aksi: [tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => Navigator.maybePop(context))],
          ),
          SegmentedButton<ModeRingkasTemuan>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(value: ModeRingkasTemuan.jenis, icon: Icon(Icons.category_outlined, size: 18), label: Text('Per jenis')),
              ButtonSegment(value: ModeRingkasTemuan.section, icon: Icon(Icons.cable_rounded, size: 18), label: Text('Per section')),
            ],
            selected: {_mode},
            onSelectionChanged: (v) => setState(() => _mode = v.first),
          ),
          const SizedBox(height: 14),
          if (_mode == ModeRingkasTemuan.jenis) ...[
            const JudulSeksiSisi('Jumlah per jenis', keterangan: 'ketuk = saring daftar'),
            KartuHartek(
              padding: const EdgeInsets.all(6),
              child: Column(children: [
                for (final r in jenis)
                  BarisRingkasTemuan(
                    label: r.jenis,
                    jumlah: r.jumlah,
                    persen: total == 0 ? 0 : r.jumlah * 100 / total,
                    lebar: r.jumlah / maksJ,
                    dipilih: widget.dipilih.contains(r.jenis),
                    onTap: () => Navigator.pop(context, r.jenis),
                  ),
              ]),
            ),
          ] else ...[
            const JudulSeksiSisi('Jenis temuan per section', keterangan: 'ketuk jenis = saring daftar'),
            for (final s in section) _kartuSection(s, total),
          ],
        ]),
      ),
    );
  }

  Widget _kartuSection(({String section, int jumlah, List<({String jenis, int jumlah})> jenis}) s, int total) {
    final maks = s.jenis.isEmpty ? 1 : s.jenis.first.jumlah;
    return KartuHartek(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(color: AppColors.brand100, borderRadius: BorderRadius.circular(11)),
            child: const Icon(Icons.cable_rounded, size: 19, color: AppColors.brand700),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.section, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
              Text('${s.jenis.length} jenis temuan · ${(total == 0 ? 0 : s.jumlah * 100 / total).round()}% dari semua',
                  style: const TextStyle(fontSize: 12, color: HartekGaya.redup)),
            ]),
          ),
          Text('${s.jumlah}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: HartekGaya.tinta, fontFeatures: HartekGaya.tabular)),
        ]),
        const SizedBox(height: 8),
        for (final j in s.jenis)
          InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: () => Navigator.pop(context, j.jenis),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 5, horizontal: 2),
              child: Row(children: [
                Expanded(
                  flex: 5,
                  child: Text(j.jenis,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: widget.dipilih.contains(j.jenis) ? FontWeight.w800 : FontWeight.w600,
                          color: HartekGaya.tinta)),
                ),
                Expanded(
                  flex: 4,
                  child: LayoutBuilder(
                    builder: (c, k) => Stack(children: [
                      Container(height: 7, decoration: BoxDecoration(color: AppColors.neutral100, borderRadius: BorderRadius.circular(4))),
                      Container(
                        height: 7,
                        width: (k.maxWidth * j.jumlah / maks).clamp(7.0, k.maxWidth),
                        decoration: BoxDecoration(color: AppColors.brand500, borderRadius: BorderRadius.circular(4)),
                      ),
                    ]),
                  ),
                ),
                SizedBox(
                  width: 32,
                  child: Text('${j.jumlah}',
                      textAlign: TextAlign.right,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: HartekGaya.tinta, fontFeatures: HartekGaya.tabular)),
                ),
              ]),
            ),
          ),
      ]),
    );
  }
}
