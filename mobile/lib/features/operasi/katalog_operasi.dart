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

/// Daftar modul dari menu Teknik SiSi lama + Pengukuran Gardu (dulu di bottom bar). Keputusan Master Guswan 4 Okt 2026.
class KatalogOperasi {
  KatalogOperasi._();

  static const grup = ['Monitoring', 'Pekerjaan Teknik', 'Jaringan & Gardu'];

  static const semua = <ModulOperasi>[
    ModulOperasi(
        kode: 'ROW_LAPORAN', nama: 'Laporan per Tim', desc: 'Laporan harian dan arsip pekerjaan tiap tim (ROW, Hartek, Inspeksi)',
        ikon: Icons.groups_rounded, warna: AppColors.success700, grup: 'Monitoring', siap: true),
    ModulOperasi(
        kode: 'OPS_PETA_TEMUAN', nama: 'Peta Temuan', desc: 'Peta temuan inspeksi dari data aktif dan arsip',
        ikon: Icons.map_outlined, warna: AppColors.success700, grup: 'Monitoring'),
    ModulOperasi(
        kode: 'OPS_REKAP_GANGGUAN', nama: 'History Gangguan', desc: 'Top 12 penyulang, grafik PMT | Section, kode FGTM, daftar kejadian',
        ikon: Icons.electric_bolt_outlined, warna: AppColors.amber700, grup: 'Monitoring', siap: true),
    ModulOperasi(
        kode: 'OPS_LAP_UP3', nama: 'Laporan UP3', desc: 'Laporan harian keandalan distribusi ke UP3 + C4A per penyulang',
        ikon: Icons.assessment_outlined, warna: AppColors.navy700, grup: 'Monitoring', siap: true),
    ModulOperasi(
        kode: 'OPS_LAP_GANGGUAN', nama: 'Laporan Gangguan Penyulang', desc: 'Teks WhatsApp gangguan H-1 + rekap bulan berjalan',
        ikon: Icons.bolt_rounded, warna: AppColors.amber700, grup: 'Monitoring', siap: true), // v1.0.59
    ModulOperasi(
        kode: 'OPS_LAP_UIW', nama: 'Laporan UIW', desc: 'Laporan harian wilayah: cuaca, Care for Asset, realisasi ROW',
        ikon: Icons.apartment_rounded, warna: AppColors.navy700, grup: 'Monitoring', siap: true),
    ModulOperasi(
        // v0.85.0: kuota harian Apps Script + Cloud Run per layanan (ADMIN / SUPER)
        kode: 'OPS_ENGINE', nama: 'Pemakaian Engine', desc: 'Kuota harian Apps Script dan Cloud Run per layanan (engine PDF)',
        ikon: Icons.speed_rounded, warna: AppColors.success700, grup: 'Monitoring', siap: true),
    ModulOperasi(
        kode: 'OPS_JADWAL_PADAM', nama: 'Jadwal Padam', desc: 'Rencana pemadaman, dampak pelanggan, status, kalender, dan format WA rentang tanggal',
        ikon: Icons.calendar_month_rounded, warna: AppColors.plnRed, grup: 'Pekerjaan Teknik', siap: true), // v1.0.17
    ModulOperasi(
        // v1.0.17: nama "Temuan Inspeksi" + ikon baru (tab Input + Daftar Temuan offline)
        kode: 'OPS_INPUT_TEMUAN', nama: 'Temuan Inspeksi', desc: 'Input temuan inspeksi + daftar temuan offline dengan filter dan ringkasan per jenis',
        ikon: Icons.content_paste_search_rounded, warna: AppColors.cyan600, grup: 'Pekerjaan Teknik', siap: true),
    // v1.0.11: Penerusan WO Temuan (ADMIN / ADMIN_ES): teruskan / pindah / tarik WO temuan ke tim ROW, Hartek, Yandal
    ModulOperasi(
        kode: 'OPS_PENERUSAN_WO', nama: 'Penerusan Tim Temuan Inspeksi', desc: 'Teruskan temuan inspeksi ke tim ROW / Hartek / Yandal, pantau tindak lanjut',
        ikon: Icons.alt_route_rounded, warna: AppColors.success700, grup: 'Pekerjaan Teknik', siap: true), // v1.0.16: ikon rute ke tim
    // v1.0.16: verifikasi WO yang diunggah dua tim (WO dipindah saat tim lama bekerja offline)
    ModulOperasi(
        kode: 'OPS_WO_GANDA', nama: 'Verifikasi WO Ganda', desc: 'Pilih tim yang sah saat satu WO diunggah lebih dari satu tim',
        ikon: Icons.how_to_reg_rounded, warna: AppColors.red600, grup: 'Pekerjaan Teknik', siap: true),
    // v1.0.19: Penugasan Tim dihapus (penugasan temuan ke tim lewat Penerusan Tim Temuan Inspeksi)
    ModulOperasi(
        // v1.0.18: pindah / tarik WO terkirim (belum dimulai tim), dipindah dari Penerusan WO
        kode: 'OPS_PINDAH_TIM_TO', nama: 'Pindah Tim TO', desc: 'Pindahkan / tarik WO terkirim yang belum dimulai tim',
        ikon: Icons.swap_horiz_rounded, warna: AppColors.cyan600, grup: 'Pekerjaan Teknik', siap: true),
    // v0.63.0: susunan petugas tim YANDAL 13-17 (mengikuti SK), ADMIN / SUPER
    ModulOperasi(
        kode: 'OPS_PETUGAS_YANDAL', nama: 'Pindah Tim Petugas', desc: 'Atur petugas di tiap tim (Yandal, ROW, Hartek, Inspeksi) sesuai SK',
        ikon: Icons.manage_accounts_outlined, warna: AppColors.amber700, grup: 'Pekerjaan Teknik', siap: true),
    // v1.0.51: absensi safety briefing harian, dua pengabsen (ADMIN_ES + ADMIN), teks WhatsApp otomatis
    ModulOperasi(
        kode: 'OPS_ABSENSI', nama: 'Absensi Safety Briefing', desc: 'Absen seluruh staf tiap pagi, rekap bulan berjalan, salin teks WhatsApp',
        ikon: Icons.fact_check_outlined, warna: AppColors.success700, grup: 'Pekerjaan Teknik', siap: true),
    ModulOperasi(
        // v0.75.0: Approval P0 (ADMIN / SUPER): setujui, tolak, koreksi jenis pekerjaan
        kode: 'OPS_VERIFIKASI_P0', nama: 'Approval P0', desc: 'Setujui / tolak P0 Yandal per tanggal, cek foto, koreksi jenis pekerjaan',
        ikon: Icons.verified_outlined, warna: AppColors.navy700, grup: 'Pekerjaan Teknik', siap: true),
    ModulOperasi(
        // v1.0.57: Material Gudang (ADMIN / SUPER): stok MCB gudang + tim Yandal, selisih, pemakaian, izin material
        kode: 'OPS_GUDANG_MATERIAL', nama: 'Material Gudang', desc: 'Stok MCB gudang dan tim Yandal, selisih pemeriksaan awal shift, pemakaian, izin material',
        ikon: Icons.inventory_2_outlined, warna: AppColors.navy700, grup: 'Pekerjaan Teknik', siap: true),
    ModulOperasi(
        kode: 'OPS_PENGUKURAN_GARDU', nama: 'Pengukuran Gardu', desc: 'Beban gardu distribusi dari Master Gardu: kategori, saringan, detail',
        ikon: Icons.electrical_services_outlined, warna: AppColors.navy700, grup: 'Jaringan & Gardu', siap: true),
    // v0.69.0: Berita Acara Gardu / Switching (khusus admin, db_Menu OPS_BA_GARDU)
    ModulOperasi(
        kode: 'OPS_BA_GARDU', nama: 'Berita Acara', desc: 'Buat BA gardu (Pengoperasian, Penggantian, Pemeriksaan, Pembongkaran) dan switching',
        ikon: Icons.description_outlined, warna: AppColors.success700, grup: 'Jaringan & Gardu', siap: true),
    ModulOperasi(
        kode: 'OPS_CHECKPOINT', nama: 'Checkpoint Jaringan', desc: 'Monitoring dan data checkpoint jalur penyulang',
        ikon: Icons.location_on_outlined, warna: AppColors.navy700, grup: 'Jaringan & Gardu'),
    // Verifikasi Tiang + Master Segmen (ADMIN / SUPER): verifikasi aset tiang berurutan sepanjang jalur
    ModulOperasi(
        kode: 'OPS_VERIFIKASI_TIANG', nama: 'Verifikasi Tiang', desc: 'Verifikasi tiang TM di lapangan sepanjang jalur',
        ikon: Icons.cell_tower_outlined, warna: AppColors.success700, grup: 'Jaringan & Gardu', siap: true),
    // 1.0.63: Master Switching (ADMIN / SUPER): pendataan + verifikasi switching lapangan di peta OpenStreetMap
    ModulOperasi(
        kode: 'OPS_MASTER_SWITCHING', nama: 'Master Jaringan', desc: 'Switching di peta, penyulang + section, dan segmen: tambah, ubah, aktifkan / nonaktifkan',
        ikon: Icons.electrical_services_rounded, warna: AppColors.brand700, grup: 'Jaringan & Gardu', siap: true),
  ];
}
