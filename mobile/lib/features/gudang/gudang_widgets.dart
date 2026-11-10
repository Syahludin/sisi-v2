import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../theme/app_colors.dart';
import '../../widgets/kolom_pilih.dart';
import '../../widgets/sisi_widgets.dart';
import 'gudang_model.dart';

/// Pilihan Status MCB (Baru / Ex-Handal) sebagai tombol segmen. Sengaja BUKAN dropdown: menu dropdown bawaan tertinggal di
/// layar ketika keyboard ditutup (kolom di bawahnya bergeser, menu tidak ikut).
class PilihStatusMcb extends StatelessWidget {
  const PilihStatusMcb({super.key, required this.nilai, required this.onChanged});
  final String nilai;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Padding(padding: EdgeInsets.only(bottom: 6), child: Text('Status MCB', style: TextStyle(fontSize: 12, color: AppColors.neutral500, fontWeight: FontWeight.w700))),
        SizedBox(
          width: double.infinity,
          child: SegmentedButton<String>(
            segments: [for (final s in statusMcb) ButtonSegment(value: s, label: Text(s))],
            selected: {nilai},
            showSelectedIcon: false,
            onSelectionChanged: (v) => onChanged(v.first),
          ),
        ),
      ]);
}

/// Kolom Daya: hanya angka (satuan Ampere ada di judul).
class KolomDaya extends StatelessWidget {
  const KolomDaya({super.key, required this.controller});
  final TextEditingController controller;

  @override
  Widget build(BuildContext context) => TextField(
        controller: controller,
        maxLength: 4,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        // petunjuk di DALAM kolom (label selalu di atas supaya petunjuk terlihat sebelum kolom disentuh)
        decoration: sisiInput('Daya (A)', hint: 'Angka saja, mis. 2').copyWith(floatingLabelBehavior: FloatingLabelBehavior.always),
      );
}

/// Kolom isian dengan pilihan dari master (Merk: db_Merk_MCB, Keperluan: db_Keperluan_MCB) lewat bottom sheet, supaya tidak salah
/// ketik. Nilai terpilih ditulis ke [controller]. Master belum diisi ([daftar] kosong) = kolom ketik bebas ([maks] karakter) seperti
/// sebelumnya. Nilai awal di luar master (data lama) tetap tampil sebagai pilihan supaya koreksi data lama tidak memaksa mengganti.
class KolomDaftar extends StatelessWidget {
  const KolomDaftar({super.key, required this.controller, required this.daftar, required this.label, this.maks = 40});
  final TextEditingController controller;
  final List<String> daftar;
  final String label;
  final int maks;

  @override
  Widget build(BuildContext context) {
    if (daftar.isEmpty) return TextField(controller: controller, maxLength: maks, decoration: sisiInput(label));
    final awal = controller.text.trim();
    final pilihan = [...daftar, if (awal.isNotEmpty && !daftar.any((m) => m.toLowerCase() == awal.toLowerCase())) awal];
    final cocok = pilihan.where((m) => m.toLowerCase() == awal.toLowerCase()).toList();
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: KolomPilih(
        label: label,
        pilihan: [for (final m in pilihan) PilihanItem(m, m)],
        nilaiAwal: cocok.isEmpty ? null : cocok.first,
        selaluCari: pilihan.length > 8,
        onChanged: (v) => controller.text = v,
      ),
    );
  }
}

/// Kotak foto: belum ada = tombol ambil foto; sudah ada = gambar foto yang baru diambil (ketuk untuk ambil ulang).
class KotakFoto extends StatelessWidget {
  const KotakFoto({super.key, required this.path, required this.labelKosong, required this.onTap, this.aktif = true});
  final String? path;
  final String labelKosong;
  final VoidCallback onTap;
  final bool aktif;

  @override
  Widget build(BuildContext context) {
    final p = path;
    if (p == null) {
      return FilledButton.tonalIcon(onPressed: aktif ? onTap : null, icon: const Icon(Icons.photo_camera_outlined), label: Text(labelKosong));
    }
    return InkWell(
      onTap: aktif ? onTap : null,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(color: AppColors.success100, borderRadius: BorderRadius.circular(14)),
        child: Row(children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              width: 96,
              height: 72,
              child: Image.file(File(p),
                  fit: BoxFit.cover, cacheWidth: 300, errorBuilder: (_, __, ___) => const ColoredBox(color: Color(0xFFE2E8F0), child: Icon(Icons.image_outlined, color: AppColors.neutral400))),
            ),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [Icon(Icons.check_circle_rounded, size: 18, color: AppColors.success700), SizedBox(width: 6), Text('Foto siap', style: TextStyle(fontWeight: FontWeight.w900, color: AppColors.success700))]),
              Text('Ketuk untuk ambil ulang', style: TextStyle(fontSize: 12, color: AppColors.neutral700)),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Lencana kecil berwarna (status MCB, jenis catatan, arah selisih).
class LencanaStatus extends StatelessWidget {
  const LencanaStatus(this.teks, {super.key, required this.warna, required this.latar});
  final String teks;
  final Color warna, latar;

  /// Baru = hijau, Ex-Handal = kuning tua.
  factory LencanaStatus.mcb(String status) => status == 'Baru'
      ? LencanaStatus(status, warna: AppColors.success700, latar: AppColors.success100)
      : LencanaStatus(status, warna: AppColors.accent700, latar: AppColors.accent100);

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
        decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(99)),
        child: Text(teks, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w900, color: warna)),
      );
}

/// Ringkasan angka besar di puncak layar (Di gudang / Di tim / Tanpa izin).
class KpiGudang extends StatelessWidget {
  const KpiGudang({super.key, required this.label, required this.nilai, required this.ikon, this.warna = AppColors.navy700, this.latar = Colors.white});
  final String label;
  final int nilai;
  final IconData ikon;
  final Color warna, latar;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral200)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(ikon, size: 18, color: warna),
          const SizedBox(height: 6),
          Text('$nilai', style: TextStyle(fontSize: 26, height: 1, fontWeight: FontWeight.w900, color: warna)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.neutral700)),
        ]),
      );
}

/// Judul bagian dengan ikon (mis. Gudang, nama tim).
class JudulBagian extends StatelessWidget {
  const JudulBagian(this.teks, {super.key, required this.ikon, this.kanan, this.warna = AppColors.navy900});
  final String teks;
  final IconData ikon;
  final Widget? kanan;
  final Color warna;

  @override
  Widget build(BuildContext context) => Row(children: [
        Icon(ikon, size: 22, color: warna),
        const SizedBox(width: 8),
        Expanded(child: Text(teks, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: warna))),
        if (kanan != null) kanan!,
      ]);
}

/// Satu jenis MCB: jumlah besar di kiri, daya + merk tebal, status berwarna, aksi di baris bawah.
class BarisJenis extends StatelessWidget {
  const BarisJenis({super.key, required this.j, required this.material, this.aksi = const [], this.peringatan = false});
  final JenisMcb j;
  final String material;
  final List<Widget> aksi;
  final bool peringatan;

  @override
  Widget build(BuildContext context) {
    final warna = peringatan ? AppColors.red700 : AppColors.navy700;
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: peringatan ? const Color(0xFFFFF5F5) : AppColors.brand50, borderRadius: BorderRadius.circular(14)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(
            width: 54,
            height: 54,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: warna, borderRadius: BorderRadius.circular(14)),
            child: Text('${j.jumlah}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.white)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${teksDaya(j.daya)} · ${j.merk}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.navy900)),
              const SizedBox(height: 4),
              Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                LencanaStatus.mcb(j.statusMcb),
                Text(material, style: const TextStyle(fontSize: 12, color: AppColors.neutral500, fontWeight: FontWeight.w700)),
              ]),
            ]),
          ),
        ]),
        if (aksi.isNotEmpty) Align(alignment: Alignment.centerRight, child: Wrap(spacing: 4, children: aksi)),
      ]),
    );
  }
}
