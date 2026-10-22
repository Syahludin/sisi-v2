import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import 'sisi_motif.dart';
import 'wa_panel.dart';

/// v0.90.0 (permintaan kvlar 14 Okt 2026): satu pola kartu laporan untuk semua tim (ROW, Hartek), mengikuti kartu
/// shift Yandal: kartu navy, kode + tanggal, pensil ubah di kanan atas, info singkat KM + koordinat, panel angka
/// ringkasan (ROW: Rabas / Tebang Sedang / Tebang Besar, Hartek: per jenis pekerjaan), tombol + di kanan bawah.
/// Ketuk kartu = halaman ringkasan detail. Tanpa chip: status ditulis sebagai kalimat pendek.
class AngkaRingkas {
  const AngkaRingkas(this.label, this.nilai, {this.warna, this.latar, this.onTap});
  final String label;
  final int nilai;
  final Color? warna;

  /// v0.97.4: warna background melingkar di belakang angka sebagai pembeda tiap jenis pekerjaan.
  final Color? latar;

  /// v0.97.0: angka yang bisa diketuk membuka rincian khusus angka itu (null = hanya tampilan).
  final VoidCallback? onTap;
}

/// Warna teks + background melingkar default berdasarkan label jenis pekerjaan (Hartek & ROW).
(Color, Color) _warnaAngkaRingkas(AngkaRingkas a, {required bool gelap}) {
  final l = a.label.trim().toLowerCase();
  final (Color wGelap, Color bgGelap, Color wTerang, Color bgTerang) = switch (l) {
    // v1.0.2: Inspeksi Jaringan memakai warna yang sama (penyulang = biru, temuan = amber, total tiang = hijau)
    'jaringan' || 'rabas' || 'penyulang' => (const Color(0xFF7DD3FC), const Color(0x330EA5E9), AppColors.brand700, AppColors.brand100),
    'gardu' || 'tebang sedang' || 'temuan' => (
        const Color(0xFFFDE68A),
        const Color(0x33F59E0B),
        const Color(0xFF835800),
        AppColors.accent100
      ),
    'non-teknik' || 'non - teknik' => (const Color(0xFFE2E8F0), const Color(0x2E94A3B8), AppColors.neutral700, AppColors.neutral150),
    'tebang besar' => (const Color(0xFFFECACA), const Color(0x33EF4444), AppColors.red700, AppColors.red100),
    'total pekerjaan' || 'total' || 'total tiang' || 'total eksekusi' => (
        const Color(0xFF86EFAC),
        const Color(0x3322C55E),
        AppColors.success700,
        AppColors.success100
      ),
    _ => (Colors.white, const Color(0x24FFFFFF), AppColors.brand700, AppColors.brand100),
  };
  return (a.warna ?? (gelap ? wGelap : wTerang), a.latar ?? (gelap ? bgGelap : bgTerang));
}

/// '-3.012345, 106.512345' -> '-3.0123, 106.5123'. Kosong / tidak valid = 'Belum diisi' / teks apa adanya.
String koordinatSingkat(String? s) {
  final t = (s ?? '').trim();
  if (t.isEmpty) return 'Belum diisi';
  final p = t.split(',');
  if (p.length != 2) return t;
  final a = double.tryParse(p[0].trim()), b = double.tryParse(p[1].trim());
  if (a == null || b == null) return t;
  return '${a.toStringAsFixed(4)}, ${b.toStringAsFixed(4)}';
}

/// Jarak tempuh dari KM awal / akhir. null kalau belum lengkap atau KM akhir < KM awal.
num? jarakKm(num? awal, num? akhir) => awal == null || akhir == null || akhir < awal ? null : akhir - awal;

String _angka(num n) => n == n.roundToDouble() ? n.toInt().toString() : n.toStringAsFixed(1);

class KartuLaporanTim extends StatelessWidget {
  const KartuLaporanTim({
    super.key,
    required this.judul,
    required this.sub,
    required this.ikon,
    required this.kmAwal,
    required this.kmAkhir,
    required this.koordinatAwal,
    required this.koordinatAkhir,
    required this.angka,
    this.akurasiAwal,
    this.akurasiAkhir,
    this.catatan,
    this.bawahKiri,
    this.onTap,
    this.onUbah,
    this.onTambah,
    this.labelTambah = 'Tambah',
    this.onTapNilai,
    this.onKirimWa,
    this.tampilWa = false,
    this.waSiap = true,
  });

  final String judul;
  final String sub;
  final IconData ikon;
  final num? kmAwal, kmAkhir;
  final String? koordinatAwal, koordinatAkhir;
  final double? akurasiAwal, akurasiAkhir;
  final List<AngkaRingkas> angka;

  /// Kalimat pendek di bawah panel angka (mis. isian yang belum lengkap, status kirim). null = tidak tampil.
  final String? catatan;

  /// Isi kiri baris bawah (mis. tombol Kirim WA, atau jumlah penyulang). null = kosong.
  final Widget? bawahKiri;
  final VoidCallback? onTap, onUbah, onTambah;
  final String labelTambah;

  /// v0.97.0: ketukan pada satu nilai di kartu (kunci: kmAwal / kmAkhir / koordinatAwal / koordinatAkhir) langsung
  /// membuka form ubah pada isian itu. null = nilai hanya tampilan.
  final void Function(String kunci)? onTapNilai;

  /// v0.97.4 / v0.97.5: tombol logo WhatsApp bundar di samping tombol +. [waSiap] mengatur warna hijau/redup;
  /// saat belum siap, [onKirimWa] tetap dipanggil untuk menampilkan kartu pemberitahuan data yang kurang.
  final VoidCallback? onKirimWa;
  final bool tampilWa;
  final bool waSiap;

  static const _p60 = Color(0x99FFFFFF);
  static const _p12 = Color(0x1FFFFFFF);

  static Color _warnaAkurasi(double m) => m <= 5
      ? const Color(0xFF4ADE80)
      : m <= 15
          ? AppColors.accent400
          : const Color(0xFFF87171);

  Widget _mini(String label, String nilai, {Color warna = Colors.white, bool kanan = false, String? kunci, double? akurasi}) {
    final bisaUbah = kunci != null && onTapNilai != null;
    final isi = Column(
      crossAxisAlignment: kanan ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: kanan ? Alignment.centerRight : Alignment.centerLeft,
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(label, maxLines: 1, style: const TextStyle(fontSize: 11.5, color: _p60)),
            if (akurasi != null && akurasi > 0) ...[
              const SizedBox(width: 5),
              Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(color: _warnaAkurasi(akurasi), shape: BoxShape.circle),
              ),
              const SizedBox(width: 3),
              Text('±${akurasi.toStringAsFixed(akurasi <= 5 ? 1 : 0)}m',
                  style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: _warnaAkurasi(akurasi))),
            ],
            if (bisaUbah) ...[
              const SizedBox(width: 4),
              const Icon(Icons.edit_outlined, size: 11, color: _p60),
            ],
          ]),
        ),
        const SizedBox(height: 2),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: kanan ? Alignment.centerRight : Alignment.centerLeft,
          child: Text(nilai,
              maxLines: 1,
              style:
                  TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: warna, fontFeatures: const [FontFeature.tabularFigures()])),
        ),
      ],
    );
    if (!bisaUbah) return isi;
    // v0.97.0: ketuk area KM / koordinat di kartu = langsung ke isian itu di form ubah
    return InkWell(
      key: ValueKey('nilai-$kunci'),
      borderRadius: BorderRadius.circular(10),
      onTap: () => onTapNilai!(kunci),
      child: Padding(padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 3), child: isi),
    );
  }

  @override
  Widget build(BuildContext context) {
    final jarak = jarakKm(kmAwal, kmAkhir);
    final bentuk = BorderRadius.circular(22);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: bentuk,
        onTap: onTap,
        child: Ink(
          // v1.0.19: gradien + motif tiang & kawat Jaringan SiSi (kartu ROW / Hartek / Inspeksi)
          decoration: BoxDecoration(
            gradient: SisiMotif.gradien,
            borderRadius: bentuk,
            boxShadow: [BoxShadow(color: AppColors.navy900.withValues(alpha: .28), blurRadius: 18, offset: const Offset(0, 8))],
          ),
          child: Stack(children: [
            Positioned.fill(
              child:
                  IgnorePointer(child: ClipRRect(borderRadius: bentuk, child: const CustomPaint(painter: PolaJaringanPainter(alpha: .08)))),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 12, 14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  Container(
                    width: 46,
                    height: 46,
                    decoration: BoxDecoration(
                      color: _p12,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.accent400.withValues(alpha: .7), width: 1.4),
                    ),
                    child: Icon(ikon, color: AppColors.accent400, size: 23),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(judul,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white)),
                      const SizedBox(height: 2),
                      Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Colors.white70)),
                    ]),
                  ),
                  if (onUbah != null)
                    IconButton(
                      tooltip: 'Ubah laporan',
                      onPressed: onUbah,
                      style: IconButton.styleFrom(backgroundColor: _p12),
                      icon: const Icon(Icons.edit_outlined, color: Colors.white, size: 19),
                    ),
                ]),
                const SizedBox(height: 14),
                Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: Row(children: [
                    Expanded(child: _mini('KM awal', kmAwal == null ? '–' : _angka(kmAwal!), kunci: 'kmAwal')),
                    Expanded(child: _mini('KM akhir', kmAkhir == null ? '–' : _angka(kmAkhir!), kunci: 'kmAkhir')),
                    _mini('Jarak', jarak == null ? '–' : '${_angka(jarak)} km', warna: AppColors.accent400, kanan: true),
                  ]),
                ),
                const SizedBox(height: 10),
                Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: Row(children: [
                    Expanded(child: _mini('Berangkat', koordinatSingkat(koordinatAwal), kunci: 'koordinatAwal', akurasi: akurasiAwal)),
                    const SizedBox(width: 6),
                    Expanded(child: _mini('Kembali', koordinatSingkat(koordinatAkhir), kunci: 'koordinatAkhir', akurasi: akurasiAkhir)),
                  ]),
                ),
                const SizedBox(height: 14),
                Container(
                  margin: const EdgeInsets.only(right: 4),
                  padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: .08), borderRadius: BorderRadius.circular(14)),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                    for (final a in angka)
                      Expanded(
                        child: InkWell(
                          key: ValueKey('angka-${a.label}'),
                          borderRadius: BorderRadius.circular(12),
                          onTap: a.onTap,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 2, horizontal: 1),
                            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                              Container(
                                constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: _warnaAngkaRingkas(a, gelap: true).$2,
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text('${a.nilai}',
                                    style: TextStyle(
                                        fontSize: 18,
                                        height: 1.1,
                                        fontWeight: FontWeight.w900,
                                        color: _warnaAngkaRingkas(a, gelap: true).$1,
                                        fontFeatures: const [FontFeature.tabularFigures()])),
                              ),
                              const SizedBox(height: 4),
                              Text(a.label,
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 10.5, height: 1.2, color: Colors.white70)),
                            ]),
                          ),
                        ),
                      ),
                  ]),
                ),
                if (catatan != null && catatan!.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Padding(
                    padding: const EdgeInsets.only(right: 4),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Padding(
                        padding: EdgeInsets.only(top: 1),
                        child: Icon(Icons.info_outline_rounded, size: 15, color: AppColors.accent400),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(catatan!, style: const TextStyle(fontSize: 12.5, height: 1.35, color: Color(0xD9FFFFFF))),
                      ),
                    ]),
                  ),
                ],
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(child: bawahKiri ?? const SizedBox.shrink()),
                  if (tampilWa || onKirimWa != null) ...[
                    const SizedBox(width: 8),
                    TombolWaBulat(onTap: onKirimWa, siap: waSiap),
                  ],
                  if (onTambah != null) ...[
                    const SizedBox(width: 8),
                    Tooltip(
                      message: labelTambah,
                      child: SizedBox(
                        width: 46,
                        height: 46,
                        child: Material(
                          color: AppColors.amber600,
                          shape: const CircleBorder(),
                          child: InkWell(
                            customBorder: const CircleBorder(),
                            onTap: onTambah,
                            child: const Icon(Icons.add_rounded, color: AppColors.navy900, size: 26),
                          ),
                        ),
                      ),
                    ),
                  ],
                ]),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Kartu angka terang untuk halaman ringkasan detail (pasangan [KartuLaporanTim]).
class PanelAngkaRingkas extends StatelessWidget {
  const PanelAngkaRingkas({super.key, required this.angka, this.keterangan});
  final List<AngkaRingkas> angka;
  final String? keterangan;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(8, 16, 8, 14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.neutral200),
        ),
        child: Column(children: [
          Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
            for (final a in angka)
              Expanded(
                child: InkWell(
                  key: ValueKey('ringkas-${a.label}'),
                  borderRadius: BorderRadius.circular(12),
                  onTap: a.onTap,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Container(
                        constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: _warnaAngkaRingkas(a, gelap: false).$2,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text('${a.nilai}',
                            style: TextStyle(
                                fontSize: 20,
                                height: 1.1,
                                fontWeight: FontWeight.w900,
                                color: _warnaAngkaRingkas(a, gelap: false).$1,
                                fontFeatures: const [FontFeature.tabularFigures()])),
                      ),
                      const SizedBox(height: 4),
                      Text(a.label,
                          textAlign: TextAlign.center,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12, height: 1.2, color: Color(0xFF4F656D))),
                    ]),
                  ),
                ),
              ),
          ]),
          if (keterangan != null) ...[
            const SizedBox(height: 12),
            const Divider(height: 1, color: AppColors.neutral200),
            const SizedBox(height: 10),
            Text(keterangan!, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13.5, color: Color(0xFF4F656D))),
          ],
        ]),
      );
}

/// Satu kelompok di ringkasan detail: ikon, judul, sub, angka kecil di kanan, lalu baris rincian.
class GrupRingkasan extends StatelessWidget {
  const GrupRingkasan({
    super.key,
    required this.ikon,
    required this.warna,
    required this.latar,
    required this.judul,
    required this.sub,
    this.angka = const [],
    this.baris = const [],
    this.onTap,
  });
  final IconData ikon;
  final Color warna, latar;
  final String judul, sub;
  final List<AngkaRingkas> angka;

  /// Rincian: (kiri, kanan), mis. ('LBS Rias', 'R 2 · S 1 · B 0').
  final List<(String, String)> baris;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final bentuk = BorderRadius.circular(18);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.surface,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(borderRadius: bentuk, side: const BorderSide(color: AppColors.neutral200)),
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 10, 14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(13)),
                  child: Icon(ikon, color: warna, size: 21),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(judul,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: AppColors.brand950)),
                    const SizedBox(height: 2),
                    Text(sub, style: const TextStyle(fontSize: 13, color: Color(0xFF4F656D))),
                  ]),
                ),
                if (onTap != null) const Icon(Icons.chevron_right_rounded, color: AppColors.neutral400),
              ]),
              if (angka.isNotEmpty) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  margin: const EdgeInsets.only(right: 4),
                  decoration: BoxDecoration(color: AppColors.neutral50, borderRadius: BorderRadius.circular(12)),
                  child: Row(children: [
                    for (final a in angka)
                      Expanded(
                        child: Column(children: [
                          Text('${a.nilai}',
                              style: TextStyle(
                                  fontSize: 17,
                                  fontWeight: FontWeight.w800,
                                  color: a.nilai == 0 ? AppColors.neutral400 : (a.warna ?? AppColors.brand700),
                                  fontFeatures: const [FontFeature.tabularFigures()])),
                          Text(a.label,
                              textAlign: TextAlign.center,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 11.5, color: Color(0xFF4F656D))),
                        ]),
                      ),
                  ]),
                ),
              ],
              for (var n = 0; n < baris.length; n++) ...[
                if (n == 0) const SizedBox(height: 6),
                Padding(
                  padding: const EdgeInsets.fromLTRB(2, 8, 4, 0),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Expanded(
                      child: Text(baris[n].$1, style: const TextStyle(fontSize: 14, color: AppColors.brand950)),
                    ),
                    const SizedBox(width: 10),
                    Text(baris[n].$2,
                        style: const TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF4F656D),
                            fontFeatures: [FontFeature.tabularFigures()])),
                  ]),
                ),
              ],
            ]),
          ),
        ),
      ),
    );
  }
}
