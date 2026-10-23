import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import '../../widgets/sisi_motif.dart';
import '../hartek/hartek_gaya.dart';
import 'insjar_header.dart';
import 'temuan_offline.dart';

/// Ringkasan dikelompokkan per jenis temuan atau per section (penyulang > section > jenis).
enum ModeRingkasTemuan { jenis, section }

/// Kartu satu temuan lengkap (foto, status WO) dari layar induk, dipakai halaman daftar temuan.
typedef PembuatKartuTemuan = Widget Function(BuildContext context, Map<String, dynamic> t);

/// Data ringkasan yang dibawa ke halaman-halaman rincian.
class DataRingkasTemuan {
  const DataRingkasTemuan({required this.temuan, required this.urutan, required this.kartu});
  final List<Map<String, dynamic>> temuan;
  final Map<String, List<String>> urutan;
  final PembuatKartuTemuan kartu;

  int get total => temuan.length;
}

const _segmen = [
  ButtonSegment(value: ModeRingkasTemuan.jenis, icon: Icon(Icons.category_outlined, size: 18), label: Text('Per Jenis Temuan')),
  ButtonSegment(value: ModeRingkasTemuan.section, icon: Icon(Icons.cable_rounded, size: 18), label: Text('Per Section')),
];

Future<void> _buka(BuildContext c, Widget layar) => Navigator.of(c).push<void>(MaterialPageRoute(builder: (_) => layar));

/// Buka daftar temuan (halaman terpisah) untuk satu jenis / section / penyulang.
Future<void> bukaDaftarTemuan(BuildContext c, DataRingkasTemuan d,
        {required String judul, String? sub, String? penyulang, String? section, String? jenis}) =>
    _buka(c, DaftarTemuanScreen(data: d, judul: judul, sub: sub, penyulang: penyulang, section: section, jenis: jenis));

/// v1.0.17: kartu ringkasan temuan di halaman Temuan Inspeksi.
/// v1.0.18: ringkas + rincian di halaman terpisah, pilihan per jenis / per section.
/// v1.0.19 (permintaan kvlar 23 Okt 2026): daftar temuan tidak lagi di halaman utama. Ketuk jenis = halaman daftar temuan
/// jenis itu (semua penyulang, bisa dipilih / dicari per penyulang); ketuk section = rincian section itu saja.
class KartuRingkasTemuan extends StatelessWidget {
  const KartuRingkasTemuan({
    super.key,
    required this.data,
    required this.dariSemua,
    required this.mode,
    required this.onMode,
    this.maksBaris = 3,
  });

  final DataRingkasTemuan data;
  final int dariSemua, maksBaris;
  final ModeRingkasTemuan mode;
  final ValueChanged<ModeRingkasTemuan> onMode;

  @override
  Widget build(BuildContext context) {
    final total = data.total;
    final jenis = ringkasJenisTemuan(data.temuan);
    final peny = ringkasPenyulangTemuan(data.temuan, data.urutan);
    final section = [
      for (final p in peny)
        for (final s in p.section) (penyulang: p.penyulang, s: s),
    ]..sort((a, b) => b.s.jumlah - a.s.jumlah);
    final maks = mode == ModeRingkasTemuan.jenis
        ? (jenis.isEmpty ? 1 : jenis.first.jumlah)
        : (section.isEmpty ? 1 : section.first.s.jumlah);
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
                Text('${jenis.length} jenis · ${peny.length} penyulang · ${section.length} section',
                    style: const TextStyle(fontSize: 13, color: HartekGaya.putih85)),
              ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('$total',
                  style: const TextStyle(fontSize: 30, height: 1, fontWeight: FontWeight.w900, color: Colors.white, fontFeatures: HartekGaya.tabular)),
              if (total != dariSemua) Text('dari $dariSemua', style: const TextStyle(fontSize: 12, color: HartekGaya.putih85)),
            ]),
          ]),
        ),
        if (total > 0)
          Padding(padding: const EdgeInsets.fromLTRB(12, 12, 12, 0), child: RingkasStatusTemuan(status: hitungStatusTemuan(data.temuan))),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          child: SegmentedButton<ModeRingkasTemuan>(showSelectedIcon: false, segments: _segmen, selected: {mode}, onSelectionChanged: (v) => onMode(v.first)),
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
                    status: r.status,
                    onTap: () => bukaDaftarTemuan(context, data, judul: r.jenis, sub: 'Semua penyulang', jenis: r.jenis),
                  )
              else
                for (final r in section.take(maksBaris))
                  BarisRingkasTemuan(
                    label: '${r.penyulang} · ${r.s.section}',
                    jumlah: r.s.jumlah,
                    persen: r.s.jumlah * 100 / total,
                    lebar: r.s.jumlah / maks,
                    keterangan: '${r.s.jenis.length} jenis temuan',
                    status: r.s.status,
                    onTap: () => _buka(context, RingkasanSectionScreen(data: data, penyulang: r.penyulang, section: r.s.section)),
                  ),
            ]),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 0, 8, 6),
          child: Row(children: [
            Expanded(
              child: TextButton.icon(
                onPressed: total == 0 ? null : () => _buka(context, RingkasanTemuanScreen(data: data, modeAwal: mode)),
                icon: const Icon(Icons.insights_rounded, size: 18),
                label: const Text('Rincian ringkasan'),
              ),
            ),
            Expanded(
              child: TextButton.icon(
                onPressed: total == 0 ? null : () => bukaDaftarTemuan(context, data, judul: 'Semua temuan', sub: 'Semua penyulang'),
                icon: const Icon(Icons.list_alt_rounded, size: 18),
                label: Text('Lihat $total temuan'),
              ),
            ),
          ]),
        ),
      ]),
    );
  }
}

/// Satu baris ringkasan: label, jumlah, persen, bar. [keterangan] = rincian kecil.
/// v1.0.21: [status] (hitungStatusTemuan) = bar diwarnai per status + jumlah per status di bawahnya.
class BarisRingkasTemuan extends StatelessWidget {
  const BarisRingkasTemuan({
    super.key,
    required this.label,
    required this.jumlah,
    required this.persen,
    required this.lebar,
    this.keterangan,
    this.status,
    this.onTap,
  });
  final String label;
  final int jumlah;
  final double persen, lebar;
  final String? keterangan;
  final List<int>? status;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: onTap != null,
        label: '$label: $jumlah temuan, ${persen.round()} persen.',
        child: Material(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  Expanded(
                    child: Text(label,
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: HartekGaya.tinta)),
                  ),
                  const SizedBox(width: 8),
                  Text('$jumlah', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: HartekGaya.tinta, fontFeatures: HartekGaya.tabular)),
                  SizedBox(
                    width: 44,
                    child: Text('${persen.round()}%',
                        textAlign: TextAlign.right, style: const TextStyle(fontSize: 12, color: HartekGaya.redup, fontFeatures: HartekGaya.tabular)),
                  ),
                  if (onTap != null) const Icon(Icons.chevron_right_rounded, size: 18, color: AppColors.neutral400),
                ]),
                if (keterangan != null && keterangan!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(keterangan!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: HartekGaya.redup)),
                  ),
                const SizedBox(height: 6),
                _Bar(lebar: lebar, tinggi: 8, status: status),
                if (status != null) Padding(padding: const EdgeInsets.only(top: 5), child: TeksStatusTemuan(status!)),
              ]),
            ),
          ),
        ),
      );
}

class _Bar extends StatelessWidget {
  const _Bar({required this.lebar, this.tinggi = 7, this.status});
  final double lebar, tinggi;
  final List<int>? status;

  @override
  Widget build(BuildContext context) {
    final st = status;
    final ada = st != null && st.any((n) => n > 0);
    return LayoutBuilder(
      builder: (c, k) => Stack(children: [
        Container(height: tinggi, decoration: BoxDecoration(color: AppColors.neutral100, borderRadius: BorderRadius.circular(4))),
        Container(
          height: tinggi,
          width: (k.maxWidth * lebar).clamp(tinggi, k.maxWidth),
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(color: AppColors.brand500, borderRadius: BorderRadius.circular(4)),
          // v1.0.21: isi bar dibagi per status (belum tim / di tim / dikerjakan / selesai)
          child: ada
              ? Row(children: [
                  for (final s in StatusTemuan.values)
                    if (st[s.index] > 0) Expanded(flex: st[s.index], child: ColoredBox(color: warnaStatusTemuan[s]!)),
                ])
              : null,
        ),
      ]),
    );
  }
}

/// v1.0.21: warna status penanganan temuan (sama di bar, angka, dan keterangan).
const Map<StatusTemuan, Color> warnaStatusTemuan = {
  StatusTemuan.belumTim: AppColors.red600,
  StatusTemuan.diTim: AppColors.brand500,
  StatusTemuan.dikerjakan: AppColors.accent600,
  StatusTemuan.selesai: AppColors.success600,
};

/// v1.0.21: jumlah per status dalam satu baris (titik warna + angka + label pendek), status kosong tidak ditulis.
class TeksStatusTemuan extends StatelessWidget {
  const TeksStatusTemuan(this.status, {super.key});
  final List<int> status;

  @override
  Widget build(BuildContext context) => Wrap(spacing: 10, runSpacing: 2, children: [
        for (final s in StatusTemuan.values)
          if (status[s.index] > 0)
            Row(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 7, height: 7, decoration: BoxDecoration(color: warnaStatusTemuan[s], shape: BoxShape.circle)),
              const SizedBox(width: 4),
              Text.rich(
                TextSpan(children: [
                  TextSpan(text: '${status[s.index]} ', style: const TextStyle(fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
                  TextSpan(text: s.pendek),
                ]),
                style: const TextStyle(fontSize: 11.5, color: HartekGaya.redup, fontFeatures: HartekGaya.tabular),
              ),
            ]),
      ]);
}

/// v1.0.21 (permintaan kvlar 23 Okt 2026): ringkasan status penanganan temuan yang sedang tampil (ikut filter):
/// empat kotak sama lebar, angka besar berwarna + label status.
class RingkasStatusTemuan extends StatelessWidget {
  const RingkasStatusTemuan({super.key, required this.status});
  final List<int> status;

  @override
  Widget build(BuildContext context) => Row(children: [
        for (final s in StatusTemuan.values) ...[
          if (s.index > 0) const SizedBox(width: 6),
          Expanded(
            child: Container(
              padding: const EdgeInsets.fromLTRB(8, 8, 6, 8),
              decoration: BoxDecoration(
                color: warnaStatusTemuan[s]!.withValues(alpha: .08),
                borderRadius: BorderRadius.circular(12),
                border: Border(top: BorderSide(color: warnaStatusTemuan[s]!, width: 3)),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${status[s.index]}',
                    style: TextStyle(fontSize: 19, height: 1.1, fontWeight: FontWeight.w900, color: warnaStatusTemuan[s], fontFeatures: HartekGaya.tabular)),
                const SizedBox(height: 2),
                Text(s.label, maxLines: 2, style: const TextStyle(fontSize: 10.5, height: 1.2, fontWeight: FontWeight.w700, color: HartekGaya.redup)),
              ]),
            ),
          ),
        ],
      ]);
}

/// Rincian jenis temuan satu section, satu jenis per baris (label, bar, jumlah). Ketuk = daftar temuan jenis itu.
class _RincianJenisSection extends StatelessWidget {
  const _RincianJenisSection({required this.data, required this.penyulang, required this.s});
  final DataRingkasTemuan data;
  final String penyulang;
  final RingkasSection s;

  @override
  Widget build(BuildContext context) {
    final maks = s.jenis.isEmpty ? 1 : s.jenis.first.jumlah;
    return Column(children: [
      for (final j in s.jenis)
        InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: () => bukaDaftarTemuan(context, data, judul: j.jenis, sub: '$penyulang · ${s.section}', penyulang: penyulang, section: s.section, jenis: j.jenis),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
            child: Row(children: [
              Expanded(
                flex: 5,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(j.jenis, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: HartekGaya.tinta)),
                  const SizedBox(height: 2),
                  TeksStatusTemuan(j.status),
                ]),
              ),
              const SizedBox(width: 8),
              Expanded(flex: 3, child: _Bar(lebar: j.jumlah / maks, status: j.status)),
              SizedBox(
                width: 34,
                child: Text('${j.jumlah}',
                    textAlign: TextAlign.right,
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: HartekGaya.tinta, fontFeatures: HartekGaya.tabular)),
              ),
              const Icon(Icons.chevron_right_rounded, size: 18, color: AppColors.neutral400),
            ]),
          ),
        ),
    ]);
  }
}

/// Kartu satu section: nama + jumlah, lalu rincian per jenis. Ketuk judul = rincian section itu saja.
class _KartuSection extends StatelessWidget {
  const _KartuSection({required this.data, required this.penyulang, required this.s});
  final DataRingkasTemuan data;
  final String penyulang;
  final RingkasSection s;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: 8),
        decoration: BoxDecoration(color: AppColors.neutral50, borderRadius: BorderRadius.circular(14), border: Border.all(color: HartekGaya.garis)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          InkWell(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
            onTap: () => _buka(context, RingkasanSectionScreen(data: data, penyulang: penyulang, section: s.section)),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 8, 4),
              child: Row(children: [
                const Icon(Icons.linear_scale_rounded, size: 18, color: HartekGaya.merek),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(s.section, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
                    TeksStatusTemuan(s.status),
                  ]),
                ),
                Text('${s.jumlah}', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: HartekGaya.tinta, fontFeatures: HartekGaya.tabular)),
                const Icon(Icons.chevron_right_rounded, size: 20, color: AppColors.neutral400),
              ]),
            ),
          ),
          Padding(padding: const EdgeInsets.fromLTRB(8, 0, 8, 8), child: _RincianJenisSection(data: data, penyulang: penyulang, s: s)),
        ]),
      );
}

/// Satu penyulang yang bisa dibuka / ditutup, berisi section-section-nya (urutan db_Jaringan).
class _KartuPenyulang extends StatefulWidget {
  const _KartuPenyulang({required this.data, required this.p, this.terbukaAwal = false});
  final DataRingkasTemuan data;
  final RingkasPenyulang p;
  final bool terbukaAwal;

  @override
  State<_KartuPenyulang> createState() => _KartuPenyulangState();
}

class _KartuPenyulangState extends State<_KartuPenyulang> {
  late bool _buka = widget.terbukaAwal;

  @override
  Widget build(BuildContext context) {
    final p = widget.p;
    return KartuHartek(
      margin: const EdgeInsets.only(bottom: 10),
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        InkWell(
          onTap: () => setState(() => _buka = !_buka),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
            child: Row(children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(gradient: SisiMotif.gradien, borderRadius: BorderRadius.circular(11)),
                child: const Icon(Icons.cable_rounded, size: 19, color: Colors.white),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(p.penyulang, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
                  Text('${p.section.length} section', style: const TextStyle(fontSize: 12, color: HartekGaya.redup)),
                  const SizedBox(height: 2),
                  TeksStatusTemuan(p.status),
                ]),
              ),
              Text('${p.jumlah}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: HartekGaya.tinta, fontFeatures: HartekGaya.tabular)),
              const SizedBox(width: 4),
              AnimatedRotation(
                turns: _buka ? .5 : 0,
                duration: const Duration(milliseconds: 180),
                child: const Icon(Icons.expand_more_rounded, color: HartekGaya.redup),
              ),
            ]),
          ),
        ),
        if (_buka)
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 0, 10, 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (final s in p.section) _KartuSection(data: widget.data, penyulang: p.penyulang, s: s),
              TextButton.icon(
                onPressed: () => bukaDaftarTemuan(context, widget.data, judul: p.penyulang, sub: 'Semua section', penyulang: p.penyulang),
                icon: const Icon(Icons.list_alt_rounded, size: 18),
                label: Text('Lihat ${p.jumlah} temuan ${p.penyulang}'),
              ),
            ]),
          ),
      ]),
    );
  }
}

/// v1.0.18: halaman rincian ringkasan temuan. v1.0.19: per section = penyulang (abjad, buka / tutup) > section (urutan
/// db_Jaringan) > jenis temuan per baris; per jenis temuan = semua jenis, ketuk = daftar temuan jenis itu.
class RingkasanTemuanScreen extends StatefulWidget {
  const RingkasanTemuanScreen({super.key, required this.data, required this.modeAwal});
  final DataRingkasTemuan data;
  final ModeRingkasTemuan modeAwal;

  @override
  State<RingkasanTemuanScreen> createState() => _RingkasanTemuanScreenState();
}

class _RingkasanTemuanScreenState extends State<RingkasanTemuanScreen> {
  late ModeRingkasTemuan _mode = widget.modeAwal;

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final jenis = ringkasJenisTemuan(d.temuan);
    final peny = ringkasPenyulangTemuan(d.temuan, d.urutan);
    final maksJ = jenis.isEmpty ? 1 : jenis.first.jumlah;
    return Scaffold(
      backgroundColor: HartekGaya.latar,
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 10, 16, 32), children: [
          HeaderInsJar(
            kicker: 'Ringkasan Temuan',
            judul: '${d.total} temuan',
            sub: '${jenis.length} jenis · ${peny.length} penyulang',
            ikon: Icons.insights_rounded,
            aksi: [tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => Navigator.maybePop(context))],
          ),
          // v1.0.21: status penanganan semua temuan yang tampil (ikut filter halaman Temuan Inspeksi)
          if (d.total > 0) ...[RingkasStatusTemuan(status: hitungStatusTemuan(d.temuan)), const SizedBox(height: 12)],
          SegmentedButton<ModeRingkasTemuan>(showSelectedIcon: false, segments: _segmen, selected: {_mode}, onSelectionChanged: (v) => setState(() => _mode = v.first)),
          const SizedBox(height: 14),
          if (_mode == ModeRingkasTemuan.jenis) ...[
            const JudulSeksiSisi('Jumlah per jenis temuan', keterangan: 'ketuk = daftar temuan'),
            KartuHartek(
              padding: const EdgeInsets.all(6),
              child: Column(children: [
                for (final r in jenis)
                  BarisRingkasTemuan(
                    label: r.jenis,
                    jumlah: r.jumlah,
                    persen: d.total == 0 ? 0 : r.jumlah * 100 / d.total,
                    lebar: r.jumlah / maksJ,
                    status: r.status,
                    onTap: () => bukaDaftarTemuan(context, d, judul: r.jenis, sub: 'Semua penyulang', jenis: r.jenis),
                  ),
              ]),
            ),
          ] else ...[
            const JudulSeksiSisi('Per penyulang & section'),
            for (final (i, p) in peny.indexed) _KartuPenyulang(data: d, p: p, terbukaAwal: i == 0 && peny.length <= 3),
          ],
        ]),
      ),
    );
  }
}

/// v1.0.19: rincian SATU section (bukan seluruh penyulang): jumlah per jenis temuan, ketuk jenis = daftar temuannya.
class RingkasanSectionScreen extends StatelessWidget {
  const RingkasanSectionScreen({super.key, required this.data, required this.penyulang, required this.section});
  final DataRingkasTemuan data;
  final String penyulang, section;

  @override
  Widget build(BuildContext context) {
    final isi = saringTemuan(data.temuan, penyulang: penyulang, section: section);
    final RingkasSection s = (section: section, jumlah: isi.length, jenis: ringkasJenisTemuan(isi), status: hitungStatusTemuan(isi));
    return Scaffold(
      backgroundColor: HartekGaya.latar,
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 10, 16, 32), children: [
          HeaderInsJar(
            kicker: 'Section · $penyulang',
            judul: section,
            sub: '${isi.length} temuan · ${s.jenis.length} jenis',
            ikon: Icons.linear_scale_rounded,
            aksi: [tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => Navigator.maybePop(context))],
          ),
          if (isi.isNotEmpty) ...[RingkasStatusTemuan(status: s.status), const SizedBox(height: 12)],
          const JudulSeksiSisi('Jenis temuan', keterangan: 'ketuk = daftar temuan'),
          KartuHartek(padding: const EdgeInsets.all(8), child: _RincianJenisSection(data: data, penyulang: penyulang, s: s)),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: isi.isEmpty
                ? null
                : () => bukaDaftarTemuan(context, data, judul: section, sub: penyulang, penyulang: penyulang, section: section),
            icon: const Icon(Icons.list_alt_rounded),
            label: Text('Lihat ${isi.length} temuan section ini'),
          ),
        ]),
      ),
    );
  }
}

/// v1.0.19: daftar temuan di halaman terpisah (bukan di halaman utama Temuan Inspeksi). Penyulang: semua / satu (chip) +
/// pencarian (kode, jenis, section, tiang, gardu, deskripsi). Tiap temuan = kartu lengkap dari layar induk.
class DaftarTemuanScreen extends StatefulWidget {
  const DaftarTemuanScreen({super.key, required this.data, required this.judul, this.sub, this.penyulang, this.section, this.jenis});
  final DataRingkasTemuan data;
  final String judul;
  final String? sub, penyulang, section, jenis;

  @override
  State<DaftarTemuanScreen> createState() => _DaftarTemuanScreenState();
}

class _DaftarTemuanScreenState extends State<DaftarTemuanScreen> {
  late String? _penyulang = widget.penyulang;
  String _kata = '';

  static String _t(Object? v) => v?.toString().trim().toLowerCase() ?? '';

  bool _cocok(Map<String, dynamic> t) {
    final k = _kata.trim().toLowerCase();
    if (k.isEmpty) return true;
    return ['kodeTemuan', 'jenisTemuan', 'penyulang', 'section', 'nomorTiang', 'noGardu', 'deskripsi'].any((f) => _t(t[f]).contains(k));
  }

  @override
  Widget build(BuildContext context) {
    final dasar = saringTemuan(widget.data.temuan, section: widget.section, jenis: widget.jenis);
    final penyulang = ({for (final t in dasar) namaPenyulangTemuan(t)}).toList()..sort();
    final tampil = [for (final t in saringTemuan(dasar, penyulang: _penyulang)) if (_cocok(t)) t];
    return Scaffold(
      backgroundColor: HartekGaya.latar,
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 10, 16, 32), children: [
          HeaderInsJar(
            kicker: 'Daftar Temuan',
            judul: widget.judul,
            sub: '${tampil.length} temuan · ${_penyulang ?? widget.sub ?? 'Semua penyulang'}',
            ikon: Icons.report_gmailerrorred_rounded,
            aksi: [tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => Navigator.maybePop(context))],
          ),
          TextField(
            onChanged: (v) => setState(() => _kata = v),
            decoration: const InputDecoration(hintText: 'Cari penyulang, section, kode, tiang, gardu...', prefixIcon: Icon(Icons.search_rounded), isDense: true),
          ),
          if (widget.penyulang == null && penyulang.length > 1) ...[
            const SizedBox(height: 10),
            SizedBox(
              height: 40,
              child: ListView(scrollDirection: Axis.horizontal, children: [
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                      label: Text('Semua penyulang · ${dasar.length}'),
                      selected: _penyulang == null,
                      showCheckmark: false,
                      onSelected: (_) => setState(() => _penyulang = null)),
                ),
                for (final p in penyulang)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text('$p · ${saringTemuan(dasar, penyulang: p).length}'),
                      selected: _penyulang == p,
                      showCheckmark: false,
                      onSelected: (_) => setState(() => _penyulang = p),
                    ),
                  ),
              ]),
            ),
          ],
          const SizedBox(height: 12),
          if (tampil.isEmpty)
            const KosongHartek(ikon: Icons.search_off_rounded, judul: 'Tidak ada temuan', petunjuk: 'Ubah pencarian atau pilihan penyulang.')
          else
            for (final t in tampil) widget.data.kartu(context, t),
        ]),
      ),
    );
  }
}
