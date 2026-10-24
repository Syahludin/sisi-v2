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
/// v1.0.34 (permintaan kvlar 24 Okt 2026): desain baru. Kepala bergradasi [warna] (ikon, judul, sub, [catatan] peringatan),
/// angka per jenis berupa pil berwarna (warna sama dengan panel total), rincian per baris dalam kotak lembut, lalu kaki
/// [labelBuka] + [aksi] (mis. tombol download foto penyulang).
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
    this.catatan,
    this.aksi,
    this.labelBuka = 'Lihat rincian',
  });
  final IconData ikon;
  final Color warna, latar;
  final String judul, sub;
  final List<AngkaRingkas> angka;

  /// Rincian: (kiri, kanan), mis. ('LBS Rias', 'R 2 · S 1 · B 0').
  final List<(String, String)> baris;
  final VoidCallback? onTap;

  /// Peringatan kecil di kepala (mis. '2 eksekusi foto belum lengkap'). null = tidak tampil.
  final String? catatan;

  /// Tombol tambahan di kaki kartu (kanan).
  final Widget? aksi;
  final String labelBuka;

  @override
  Widget build(BuildContext context) {
    final gelap = Color.lerp(warna, Colors.black, .25)!;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: AppColors.surface,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: BorderSide(color: warna.withValues(alpha: .22))),
        child: InkWell(
          onTap: onTap,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(
              padding: const EdgeInsets.fromLTRB(14, 13, 10, 13),
              decoration: BoxDecoration(gradient: LinearGradient(colors: [warna, gelap])),
              child: Row(children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: .18), borderRadius: BorderRadius.circular(13)),
                  child: Icon(ikon, color: Colors.white, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(judul,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white)),
                    const SizedBox(height: 2),
                    Text(sub, style: TextStyle(fontSize: 12.5, color: Colors.white.withValues(alpha: .85))),
                    if (catatan != null) ...[
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(99)),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          const Icon(Icons.add_a_photo_outlined, size: 13, color: AppColors.accent700),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(catatan!,
                                style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.accent700)),
                          ),
                        ]),
                      ),
                    ],
                  ]),
                ),
                if (onTap != null) const Icon(Icons.chevron_right_rounded, color: Colors.white),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                if (angka.isNotEmpty)
                  Row(children: [
                    for (var i = 0; i < angka.length; i++) ...[
                      if (i > 0) const SizedBox(width: 8),
                      Expanded(child: _PilAngka(angka[i])),
                    ],
                  ]),
                if (baris.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: latar.withValues(alpha: .45), borderRadius: BorderRadius.circular(14)),
                    child: Column(children: [
                      for (var n = 0; n < baris.length; n++)
                        Container(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          decoration: BoxDecoration(border: n == 0 ? null : Border(top: BorderSide(color: warna.withValues(alpha: .12)))),
                          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Padding(padding: const EdgeInsets.only(top: 1), child: Icon(Icons.place_outlined, size: 16, color: warna)),
                            const SizedBox(width: 6),
                            // nama section dan angkanya berbagi lebar (HP sempit: keduanya membungkus, tidak overflow)
                            Expanded(
                              flex: 5,
                              child: Text(baris[n].$1, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: AppColors.brand950)),
                            ),
                            const SizedBox(width: 10),
                            Flexible(
                              flex: 4,
                              child: Text(baris[n].$2,
                                  textAlign: TextAlign.end,
                                  style: TextStyle(
                                      fontSize: 13, fontWeight: FontWeight.w700, color: gelap, fontFeatures: const [FontFeature.tabularFigures()])),
                            ),
                          ]),
                        ),
                    ]),
                  ),
                ],
                if (onTap != null || aksi != null) ...[
                  const SizedBox(height: 8),
                  Row(children: [
                    if (onTap != null)
                      Expanded(
                        flex: 2,
                        child: Row(children: [
                          Flexible(child: Text(labelBuka, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: warna))),
                          Icon(Icons.chevron_right_rounded, size: 18, color: warna),
                        ]),
                      )
                    else
                      const Spacer(flex: 2),
                    // HP sempit: tombol ikut menyempit (label terpotong), tidak overflow
                    if (aksi != null) ...[const SizedBox(width: 8), Flexible(flex: 3, child: Align(alignment: Alignment.centerRight, child: aksi!))],
                  ]),
                ],
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Satu angka per jenis di [GrupRingkasan]: pil berwarna (warna jenis sama dengan panel total) + label.
class _PilAngka extends StatelessWidget {
  const _PilAngka(this.a);
  final AngkaRingkas a;

  @override
  Widget build(BuildContext context) {
    final (w, bg) = _warnaAngkaRingkas(a, gelap: false);
    final nol = a.nilai == 0;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      decoration: BoxDecoration(color: nol ? AppColors.neutral50 : bg, borderRadius: BorderRadius.circular(14)),
      child: Column(children: [
        Text('${a.nilai}',
            style: TextStyle(
                fontSize: 19, height: 1.1, fontWeight: FontWeight.w900, color: nol ? AppColors.neutral400 : w, fontFeatures: const [FontFeature.tabularFigures()])),
        const SizedBox(height: 2),
        Text(a.label,
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: nol ? AppColors.neutral500 : w)),
      ]),
    );
  }
}

/// v1.0.20 (permintaan kvlar 23 Okt 2026): kartu "belum ada laporan hari ini" seragam untuk ROW, Hartek, Inspeksi
/// Jaringan, Inspeksi Gardu (pola Laporan ROW): latar Jaringan SiSi, ikon modul, langkah singkat, tombol mulai kuning.
/// [onMulai] null = tombol tidak tampil (tanpa hak ubah / sedang sibuk); [labelMulai] bisa diganti (mis. tunggakan).
class KartuMulaiLaporan extends StatelessWidget {
  const KartuMulaiLaporan({
    super.key,
    required this.judul,
    required this.ikon,
    required this.langkah,
    this.onMulai,
    this.labelMulai = 'Mulai pekerjaan hari ini',
    this.catatan,
  });
  final String judul;
  final IconData ikon;
  final List<String> langkah;
  final VoidCallback? onMulai;
  final String labelMulai;
  final String? catatan;

  @override
  Widget build(BuildContext context) => LatarSisi(
        padding: const EdgeInsets.fromLTRB(18, 20, 18, 18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: .14),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.accent400.withValues(alpha: .7), width: 1.4),
            ),
            child: Icon(ikon, color: AppColors.accent400, size: 28),
          ),
          const SizedBox(height: 14),
          Text(judul, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.white)),
          const SizedBox(height: 4),
          for (var n = 0; n < langkah.length; n++)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(
                  width: 22,
                  height: 22,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: AppColors.accent400, borderRadius: BorderRadius.circular(7)),
                  child: Text('${n + 1}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: AppColors.brand950)),
                ),
                const SizedBox(width: 10),
                Expanded(child: Text(langkah[n], style: const TextStyle(fontSize: 13, height: 1.35, color: Color(0xD9FFFFFF)))),
              ]),
            ),
          if (catatan != null) ...[
            const SizedBox(height: 10),
            Text(catatan!, style: const TextStyle(fontSize: 12, color: Color(0xB3FFFFFF))),
          ],
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: onMulai,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.accent400,
              foregroundColor: AppColors.brand950,
              disabledBackgroundColor: Colors.white24,
              disabledForegroundColor: Colors.white70,
              minimumSize: const Size.fromHeight(50),
            ),
            icon: const Icon(Icons.play_arrow_rounded),
            label: Text(labelMulai, style: const TextStyle(fontWeight: FontWeight.w900)),
          ),
        ]),
      );
}
