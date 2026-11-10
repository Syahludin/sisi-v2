import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import '../hartek/hartek_gaya.dart';

/// v1.0.17 (permintaan Master Guswan 22 Okt 2026): tab Aktif / Selesai WO Tim (ROW, Hartek, Yandal) yang tidak polos.
/// Dua kartu pilihan berdampingan: ikon dalam lingkaran, label, jumlah besar, keterangan kecil. Tab terpilih = latar
/// gradasi (Aktif biru SiSi, Selesai hijau) dengan teks putih; tab lain putih berbingkai dengan lencana jumlah berwarna.
/// Perpindahan tab beranimasi singkat (dimatikan kalau HP memakai "kurangi animasi").
class TabStatusWo extends StatelessWidget {
  const TabStatusWo({
    super.key,
    required this.selesai,
    required this.onPilih,
    required this.jumlahAktif,
    required this.jumlahSelesai,
    this.keteranganAktif,
    this.keteranganSelesai = '7 hari terakhir',
  });

  /// true = tab Selesai terpilih.
  final bool selesai;
  final ValueChanged<bool> onPilih;
  final int jumlahAktif, jumlahSelesai;
  final String? keteranganAktif;
  final String keteranganSelesai;

  static const gradasiAktif = [Color(0xFF0788AA), Color(0xFF086D8A)];
  static const gradasiSelesai = [Color(0xFF219064), Color(0xFF167451)];

  @override
  Widget build(BuildContext context) {
    final diam = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    return Row(children: [
      Expanded(
        child: _KartuTab(
          pilih: !selesai,
          diam: diam,
          ikon: Icons.pending_actions_rounded,
          label: 'Aktif',
          jumlah: jumlahAktif,
          keterangan: keteranganAktif ?? 'Baru & dikerjakan',
          gradasi: gradasiAktif,
          warna: AppColors.brand700,
          latar: AppColors.brand100,
          onTap: () => onPilih(false),
        ),
      ),
      const SizedBox(width: 10),
      Expanded(
        child: _KartuTab(
          pilih: selesai,
          diam: diam,
          ikon: Icons.task_alt_rounded,
          label: 'Selesai',
          jumlah: jumlahSelesai,
          keterangan: keteranganSelesai,
          gradasi: gradasiSelesai,
          warna: AppColors.success700,
          latar: AppColors.success100,
          onTap: () => onPilih(true),
        ),
      ),
    ]);
  }
}

class _KartuTab extends StatelessWidget {
  const _KartuTab({
    required this.pilih,
    required this.diam,
    required this.ikon,
    required this.label,
    required this.jumlah,
    required this.keterangan,
    required this.gradasi,
    required this.warna,
    required this.latar,
    required this.onTap,
  });

  final bool pilih, diam;
  final IconData ikon;
  final String label, keterangan;
  final int jumlah;
  final List<Color> gradasi;
  final Color warna, latar;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final teks = pilih ? Colors.white : HartekGaya.tinta;
    final redup = pilih ? Colors.white.withValues(alpha: .82) : HartekGaya.redup;
    return Semantics(
      button: true,
      selected: pilih,
      label: '$label, $jumlah WO',
      child: AnimatedContainer(
        duration: diam ? Duration.zero : const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
        decoration: BoxDecoration(
          gradient: pilih ? LinearGradient(colors: gradasi, begin: Alignment.topLeft, end: Alignment.bottomRight) : null,
          color: pilih ? null : Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: pilih ? Colors.transparent : HartekGaya.garis),
          boxShadow: [
            BoxShadow(
              color: (pilih ? gradasi.last : AppColors.navy900).withValues(alpha: pilih ? .28 : .05),
              blurRadius: pilih ? 14 : 8,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
              child: Row(children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: pilih ? Colors.white.withValues(alpha: .20) : latar,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(ikon, size: 20, color: pilih ? Colors.white : warna),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                    Row(children: [
                      Flexible(
                        child: Text(label,
                            maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: teks)),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                        decoration: BoxDecoration(
                          color: pilih ? Colors.white : latar,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text('$jumlah', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: pilih ? gradasi.last : warna)),
                      ),
                    ]),
                    const SizedBox(height: 2),
                    Text(keterangan, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: redup)),
                  ]),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
