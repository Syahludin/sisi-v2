import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';

/// Satu modul di tab Operasi (v0.50). Kode = menu_kode di db_Menu: modul hanya tampil kalau role punya akses
/// (db_Akses lewat sesi.menu). siap = sudah dibangun di v2; belum = badge "Segera" + keterangan saat diketuk.
class ModulOperasi {
  const ModulOperasi({
    required this.kode,
    required this.nama,
    required this.desc,
    required this.ikon,
    required this.warna,
    required this.grup,
    this.siap = false,
    this.lebar = false,
  });
  final String kode;
  final String nama;
  final String desc;
  final IconData ikon;
  final Color warna;
  final String grup;
  final bool siap;
  final bool lebar; // tile lebar di atas grup (Laporan per Tim)
}

/// Daftar modul dari menu Teknik SiSi lama + Pengukuran Gardu (dulu di bottom bar). Keputusan kvlar 4 Okt 2026.
class KatalogOperasi {
  KatalogOperasi._();

  static const grup = ['Monitoring', 'Pekerjaan Teknik', 'Jaringan & Gardu'];

  static const semua = <ModulOperasi>[
    ModulOperasi(
        kode: 'ROW_LAPORAN', nama: 'Laporan per Tim', desc: 'Laporan harian dan arsip pekerjaan tiap sub-tim ROW',
        ikon: Icons.groups_rounded, warna: AppColors.success700, grup: 'Monitoring', siap: true, lebar: true),
    ModulOperasi(
        kode: 'OPS_PETA_TEMUAN', nama: 'Peta Temuan', desc: 'Peta temuan inspeksi dari data aktif dan arsip',
        ikon: Icons.map_outlined, warna: AppColors.success700, grup: 'Monitoring'),
    ModulOperasi(
        kode: 'OPS_REKAP_GANGGUAN', nama: 'Rekap Gangguan', desc: 'Rekapitulasi padam dan gangguan distribusi',
        ikon: Icons.electric_bolt_outlined, warna: AppColors.amber700, grup: 'Monitoring'),
    ModulOperasi(
        kode: 'OPS_LAP_UP3', nama: 'Laporan UP3', desc: 'Laporan harian keandalan distribusi ke UP3 + C4A per penyulang',
        ikon: Icons.assessment_outlined, warna: AppColors.navy700, grup: 'Monitoring', siap: true),
    ModulOperasi(
        kode: 'OPS_LAP_UIW', nama: 'Laporan UIW', desc: 'Laporan harian wilayah: cuaca, Care for Asset, realisasi ROW',
        ikon: Icons.apartment_rounded, warna: AppColors.navy700, grup: 'Monitoring', siap: true),
    ModulOperasi(
        kode: 'OPS_ENGINE', nama: 'Pemakaian Engine', desc: 'Pantau request harian watermark dan PDF',
        ikon: Icons.speed_rounded, warna: AppColors.success700, grup: 'Monitoring'),
    ModulOperasi(
        kode: 'OPS_JADWAL_PADAM', nama: 'Jadwal Padam', desc: 'Rencana pemadaman, dampak pelanggan, status, dan laporan WA',
        ikon: Icons.calendar_month_rounded, warna: AppColors.plnRed, grup: 'Pekerjaan Teknik'),
    ModulOperasi(
        kode: 'OPS_INPUT_TEMUAN', nama: 'Input Temuan', desc: 'Temuan C4A',
        ikon: Icons.add_alert_rounded, warna: AppColors.cyan600, grup: 'Pekerjaan Teknik'),
    ModulOperasi(
        kode: 'OPS_PENUGASAN_TIM', nama: 'Penugasan Tim', desc: 'Pilih tim eksekusi untuk TO yang menunggu penugasan',
        ikon: Icons.group_add_outlined, warna: AppColors.amber700, grup: 'Pekerjaan Teknik'),
    ModulOperasi(
        kode: 'OPS_PINDAH_TIM_TO', nama: 'Pindah Tim TO', desc: 'Pindahkan TO aktif ke tim eksekusi lain',
        ikon: Icons.swap_horiz_rounded, warna: AppColors.cyan600, grup: 'Pekerjaan Teknik'),
    ModulOperasi(
        kode: 'OPS_VERIFIKASI_P0', nama: 'Verifikasi P0', desc: 'Verifikasi dan persetujuan penugasan P0 Yandal',
        ikon: Icons.verified_outlined, warna: AppColors.navy700, grup: 'Pekerjaan Teknik'),
    ModulOperasi(
        kode: 'OPS_PENGUKURAN_GARDU', nama: 'Pengukuran Gardu', desc: 'Pengukuran beban dan tegangan gardu distribusi',
        ikon: Icons.electrical_services_outlined, warna: AppColors.navy700, grup: 'Jaringan & Gardu'),
    ModulOperasi(
        kode: 'OPS_CHECKPOINT', nama: 'Checkpoint Jaringan', desc: 'Monitoring dan data checkpoint jalur penyulang',
        ikon: Icons.location_on_outlined, warna: AppColors.navy700, grup: 'Jaringan & Gardu'),
  ];
}
