import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../theme/app_colors.dart';
import '../../widgets/animasi_masuk.dart';
import 'gardu_model.dart';

/// Cincin persentase beban (warna kategori). Lebih dari 100% = cincin penuh.
/// v1.0.27 (permintaan kvlar 23 Okt 2026): saat tampil busur bergerak melingkar dari 0 ke persentase, angka ikut naik.
class CincinBeban extends StatelessWidget {
  const CincinBeban({super.key, required this.persen, this.ukuran = 52, this.tebal = 6});
  final double? persen;
  final double ukuran;
  final double tebal;

  @override
  Widget build(BuildContext context) {
    final k = KategoriBeban.dari(persen);
    final diam = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    Widget lukis(double p) => CustomPaint(
          painter: _CincinPainter(nilai: (p / 100).clamp(0, 1).toDouble(), warna: k.warna, tebal: tebal),
          child: Center(
            child: Text(
              persen == null ? '-' : '${angkaId(p, desimal: 0)}%',
              style: TextStyle(fontSize: ukuran * .24, fontWeight: FontWeight.w900, color: k.warna),
            ),
          ),
        );
    return SizedBox(
      width: ukuran,
      height: ukuran,
      child: diam || persen == null
          ? lukis(persen ?? 0)
          : TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: persen),
              duration: durasiMasukSisi,
              curve: Curves.easeOutCubic,
              builder: (_, p, __) => lukis(p),
            ),
    );
  }
}

class _CincinPainter extends CustomPainter {
  _CincinPainter({required this.nilai, required this.warna, required this.tebal});
  final double nilai;
  final Color warna;
  final double tebal;

  @override
  void paint(Canvas canvas, Size size) {
    final pusat = size.center(Offset.zero);
    final r = (size.shortestSide - tebal) / 2;
    final dasar = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = tebal
      ..color = warna.withValues(alpha: .14);
    canvas.drawCircle(pusat, r, dasar);
    if (nilai <= 0) return;
    final busur = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = tebal
      ..strokeCap = StrokeCap.round
      ..color = warna;
    canvas.drawArc(Rect.fromCircle(center: pusat, radius: r), -math.pi / 2, 2 * math.pi * nilai, false, busur);
  }

  @override
  bool shouldRepaint(_CincinPainter old) => old.nilai != nilai || old.warna != warna || old.tebal != tebal;
}

/// Badge kategori beban.
class BadgeKategori extends StatelessWidget {
  const BadgeKategori(this.kategori, {super.key});
  final KategoriBeban kategori;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: kategori.latar, borderRadius: BorderRadius.circular(999)),
        child: Text(kategori.label.toUpperCase(),
            style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, letterSpacing: .4, color: kategori.warna)),
      );
}

/// Satu baris daftar gardu.
class KartuGardu extends StatelessWidget {
  const KartuGardu({super.key, required this.gardu, required this.onTap});
  final Gardu gardu;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final g = gardu;
    final lokasi = [g.penyulang, g.section.isNotEmpty ? g.section : g.ptsLbs].where((x) => x.isNotEmpty).join(' · ');
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.neutral200),
          ),
          child: Row(children: [
            CincinBeban(persen: g.persen),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  PilNoGardu(g.no), // v1.0.20: nomor gardu disorot
                  const SizedBox(width: 8),
                  BadgeKategori(g.kategori),
                  if (!g.aktif) ...[
                    const SizedBox(width: 6),
                    const _Pil('TIDAK AKTIF', AppColors.red700, AppColors.red100),
                  ],
                ]),
                const SizedBox(height: 3),
                Text(g.alamat.isEmpty ? '-' : g.alamat,
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: AppColors.neutral700)),
                if (lokasi.isNotEmpty)
                  Text(lokasi, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
                const SizedBox(height: 6),
                Wrap(spacing: 10, runSpacing: 4, children: [
                  _Metrik(Icons.bolt_rounded, '${angkaId(g.kva)} kVA'),
                  _Metrik(Icons.speed_rounded, g.arusMaks == null ? '- A' : '${angkaId(g.arusMaks)} A'),
                  _Metrik(Icons.event_rounded, g.tglUkur.isEmpty ? 'belum ukur' : tanggalPanjang(g.tglUkur)),
                  if (g.tglUkur.isNotEmpty) BadgePeriodeBeban(g.waktuBeban), // v1.0.20: LWBP / WBP ukur terakhir
                ]),
              ]),
            ),
            const Icon(Icons.chevron_right_rounded, color: AppColors.neutral400),
          ]),
        ),
      ),
    );
  }
}

class _Metrik extends StatelessWidget {
  const _Metrik(this.ikon, this.teks);
  final IconData ikon;
  final String teks;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(ikon, size: 13, color: AppColors.neutral400),
        const SizedBox(width: 3),
        Text(teks, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.neutral700)),
      ]);
}

class _Pil extends StatelessWidget {
  const _Pil(this.teks, this.warna, this.latar);
  final String teks;
  final Color warna;
  final Color latar;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(999)),
        child: Text(teks, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: warna)),
      );
}

const _bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/// '2026-09-02' -> '2 Sep 2026'. Format lain = apa adanya.
String tanggalPendek(String iso) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(iso);
  if (m == null) return iso;
  final b = int.parse(m.group(2)!);
  if (b < 1 || b > 12) return iso;
  return '${int.parse(m.group(3)!)} ${_bulan[b - 1]} ${m.group(1)}';
}

const _bulanPanjang = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/// v1.0.23 (permintaan kvlar 23 Okt 2026): tanggal pengukuran gardu DD MMMM YYYY, '2026-10-06' -> '06 Oktober 2026'.
/// Format lain = apa adanya.
String tanggalPanjang(String iso) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(iso);
  if (m == null) return iso;
  final b = int.parse(m.group(2)!);
  if (b < 1 || b > 12) return iso;
  return '${m.group(3)} ${_bulanPanjang[b - 1]} ${m.group(1)}';
}

/// Bottom sheet detail gardu. [onRiwayatBa] (v0.86.0) = tombol semua BA gardu ini, v2 + arsip v1 (admin BA saja).
/// v1.0.17: [denganBa] false = bagian Riwayat Berita Acara tidak ditampilkan (menu admin Pengukuran Gardu memindahkannya
/// ke History Perbaikan & Manajemen Trafo). Bagian Arus & Tegangan selalu tampil.
Future<void> tampilDetailGardu(BuildContext context, Gardu g, {VoidCallback? onRiwayatBa, bool denganBa = true}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: const Color(0xFFF6F8FC),
    builder: (c) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: .82,
      minChildSize: .5,
      maxChildSize: .95,
      builder: (c, scroll) => ListView(controller: scroll, padding: const EdgeInsets.fromLTRB(16, 0, 16, 28), children: [
        _KepalaDetail(g),
        const SizedBox(height: 12),
        _Bagian('Pengukuran Terakhir', Icons.speed_rounded, [
          ('Tanggal Ukur', g.tglUkur.isEmpty ? '' : tanggalPanjang(g.tglUkur)),
          ('Waktu Beban', g.waktuBeban),
          ('Arus Maks per Fasa', g.arusMaks == null ? '' : '${angkaId(g.arusMaks)} A'),
          ('Pembebanan', g.bebanKva == null ? '' : '${angkaId(g.bebanKva)} kVA'),
          ('Persentase Beban', g.persen == null ? '' : '${angkaId(g.persen)} %'),
          ('Kategori', '${g.kategori.label} (${g.kategori.range})'),
        ]),
        BagianArusTegangan(g), // v1.0.17
        _Bagian(
            'Lokasi',
            Icons.place_outlined,
            [
              ('Alamat', g.alamat),
              ('Penyulang', g.penyulang),
              ('Section', g.section),
              ('PTS / LBS', g.ptsLbs),
              ('Koordinat', g.adaKoordinat ? '${g.lat}, ${g.lng}' : ''),
            ],
            bawah: g.adaKoordinat ? _AksiKoordinat(g) : null),
        _Bagian('Data Trafo', Icons.bolt_rounded, [
          ('Kapasitas', g.kva == null ? '' : '${angkaId(g.kva)} kVA'),
          ('Merk', g.merk),
          ('Nomor Seri', g.seri),
          ('Tahun', g.tahun?.toString() ?? ''),
          ('Konstruksi', g.konstruksi),
          ('Jurusan Terpasang', g.jurusan),
          ('Asal Trafo', g.asalTrafo),
        ]),
        _Bagian('PHB-TR', Icons.inventory_2_outlined, [
          ('Merk', g.merkPhb),
          ('Nomor Seri', g.seriPhb),
          ('Tahun', g.tahunPhb?.toString() ?? ''),
        ]),
        _Bagian('Kepemilikan', Icons.badge_outlined, [
          ('Kepemilikan', g.kepemilikan),
          ('OwnerId', g.ownerId),
          ('External Reference', g.extRef),
        ]),
        if (denganBa)
          _Bagian(
              'Riwayat Berita Acara',
              Icons.description_outlined,
              [
                ('BA Pengoperasian', g.baOperasi),
                ('Tanggal Operasi', g.tglOperasi.isEmpty ? '' : tanggalPendek(g.tglOperasi)),
                ('BA Terakhir', g.baTerakhir),
                ('Jenis BA Terakhir', g.jenisBaTerakhir),
                ('Tanggal BA Terakhir', g.tglBaTerakhir.isEmpty ? '' : tanggalPendek(g.tglBaTerakhir)),
                ('Jumlah BA', '${g.jumlahBa}'),
              ],
              bawah: onRiwayatBa == null
                  ? null
                  : Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: () {
                          Navigator.pop(c);
                          onRiwayatBa();
                        },
                        icon: const Icon(Icons.timeline_rounded, size: 18),
                        label: const Text('Lihat semua BA gardu ini'),
                      ),
                    )),
      ]),
    ),
  );
}

class _KepalaDetail extends StatelessWidget {
  const _KepalaDetail(this.g);
  final Gardu g;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [AppColors.brand800, AppColors.brand600]),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(children: [
          Container(
            padding: const EdgeInsets.all(6),
            decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
            child: CincinBeban(persen: g.persen, ukuran: 74, tebal: 8),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(g.no, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Colors.white)),
              const SizedBox(height: 2),
              Text(g.alamat.isEmpty ? '-' : g.alamat,
                  maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: .85))),
              const SizedBox(height: 8),
              Wrap(spacing: 6, runSpacing: 6, children: [
                _Pil(g.status, g.aktif ? AppColors.success700 : AppColors.red700, Colors.white),
                _Pil(g.kategori.label.toUpperCase(), g.kategori.warna, Colors.white),
                if (g.kva != null) _Pil('${angkaId(g.kva)} kVA', AppColors.navy700, Colors.white),
              ]),
            ]),
          ),
        ]),
      );
}

/// v1.0.17 (permintaan kvlar 22 Okt 2026): kolom Arus (R / S / T / N) dan Tegangan pengukuran terakhir, dulu tidak
/// tampil di rincian Pengukuran Gardu.
class BagianArusTegangan extends StatelessWidget {
  const BagianArusTegangan(this.g, {super.key});
  final Gardu g;

  @override
  Widget build(BuildContext context) => _Bagian('Arus & Tegangan', Icons.electric_meter_outlined, [
        for (final (k, label, satuan) in Gardu.kolomUkurGardu) (label, g.ukur[k] == null ? '' : '${angkaId(g.ukur[k])} $satuan'),
        if (g.sumberUkur.isNotEmpty) ('Sumber', g.sumberUkur),
      ]);
}

/// v1.0.17: kartu bagian rincian (judul huruf besar + baris label / nilai), dipakai juga layar Riwayat Gardu.
class BagianGardu extends StatelessWidget {
  const BagianGardu(this.judul, this.ikon, this.baris, {super.key, this.bawah});
  final String judul;
  final IconData ikon;
  final List<(String, String)> baris;
  final Widget? bawah;

  @override
  Widget build(BuildContext context) => _Bagian(judul, ikon, baris, bawah: bawah);
}

class _Bagian extends StatelessWidget {
  const _Bagian(this.judul, this.ikon, this.baris, {this.bawah});
  final String judul;
  final IconData ikon;
  final List<(String, String)> baris;
  final Widget? bawah;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.neutral200),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Icon(ikon, size: 16, color: AppColors.cyan600),
            const SizedBox(width: 7),
            Text(judul.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: .6, color: AppColors.navy700)),
          ]),
          const SizedBox(height: 8),
          for (final b in baris)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(width: 130, child: Text(b.$1, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500))),
                Expanded(
                  child: Text(b.$2.isEmpty ? '-' : b.$2, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.navy900)),
                ),
              ]),
            ),
          if (bawah != null) ...[const SizedBox(height: 4), bawah!],
        ]),
      );
}

class _AksiKoordinat extends StatelessWidget {
  const _AksiKoordinat(this.g);
  final Gardu g;

  @override
  Widget build(BuildContext context) => Row(children: [
        Expanded(
          child: OutlinedButton.icon(
            onPressed: () async {
              final uri = Uri.parse('https://www.google.com/maps/search/?api=1&query=${g.lat},${g.lng}');
              await launchUrl(uri, mode: LaunchMode.externalApplication);
            },
            icon: const Icon(Icons.map_outlined, size: 16),
            label: const Text('Buka Maps'),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: OutlinedButton.icon(
            onPressed: () async {
              final messenger = ScaffoldMessenger.of(context);
              await Clipboard.setData(ClipboardData(text: '${g.lat}, ${g.lng}'));
              messenger.showSnackBar(const SnackBar(content: Text('Koordinat disalin')));
            },
            icon: const Icon(Icons.copy_rounded, size: 16),
            label: const Text('Salin'),
          ),
        ),
      ]);
}

/// v1.0.20 (permintaan kvlar 23 Okt 2026): penanda periode pengukuran. WBP = Waktu Beban Puncak (17:00-21:59, ikon
/// malam, oranye), LWBP = Luar Waktu Beban Puncak (ikon matahari, teal). Kosong = tidak tampil.
class BadgePeriodeBeban extends StatelessWidget {
  const BadgePeriodeBeban(this.periode, {super.key, this.lengkap = false});
  final String periode;

  /// true = label panjang (Beban Puncak / Luar Beban Puncak).
  final bool lengkap;

  static (IconData, Color, Color, String) gaya(String p) => p.trim().toUpperCase() == 'WBP'
      ? (Icons.nights_stay_rounded, const Color(0xFFB4451B), const Color(0xFFFDEBE3), 'Beban Puncak')
      : (Icons.wb_sunny_rounded, AppColors.brand700, AppColors.brand100, 'Luar Beban Puncak');

  @override
  Widget build(BuildContext context) {
    final p = periode.trim().toUpperCase();
    if (p != 'WBP' && p != 'LWBP') return const SizedBox.shrink();
    final (ikon, warna, latar, panjang) = gaya(p);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(999), border: Border.all(color: warna.withValues(alpha: .25))),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(ikon, size: 13, color: warna),
        const SizedBox(width: 4),
        Text(lengkap ? '$p · $panjang' : p, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: warna, letterSpacing: .3)),
      ]),
    );
  }
}

/// v1.0.20: nomor gardu disorot (pil teal bergradien, teks putih tebal).
class PilNoGardu extends StatelessWidget {
  const PilNoGardu(this.no, {super.key, this.besar = false});
  final String no;
  final bool besar;

  @override
  Widget build(BuildContext context) => Container(
        padding: EdgeInsets.symmetric(horizontal: besar ? 14 : 9, vertical: besar ? 6 : 3),
        decoration: BoxDecoration(
          gradient: besar ? null : const LinearGradient(colors: [AppColors.brand800, AppColors.brand600]),
          color: besar ? AppColors.accent400 : null,
          borderRadius: BorderRadius.circular(besar ? 12 : 8),
        ),
        child: Text(no,
            style: TextStyle(
                fontSize: besar ? 24 : 14,
                fontWeight: FontWeight.w900,
                letterSpacing: .6,
                color: besar ? AppColors.brand950 : Colors.white,
                fontFeatures: const [FontFeature.tabularFigures()])),
      );
}
