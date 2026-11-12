import 'package:flutter/material.dart';

/// Palet SiSi "Hijau Rimba" (spec desain 11 Nov 2026; nilai sama dengan web/src/styles/tokens.css).
/// Hijau tua = warna utama dan struktur, kuning petir logo = aksen (aktif / bertegangan / perhatian), merah hanya tolak / bahaya.
/// Alias navy* / cyan* dipertahankan (kini hijau) agar ribuan rujukan tidak perlu diubah.
class AppColors {
  AppColors._();

  // Brand SiSi
  static const brand950 = Color(0xFF0D2A1D);
  static const brand900 = Color(0xFF153F2C);
  static const brand800 = Color(0xFF1A5238);
  static const brand700 = Color(0xFF1F6B45);
  static const brand600 = Color(0xFF28804F);
  static const brand500 = Color(0xFF3C9A60);
  static const brand100 = Color(0xFFD6E9DA);
  static const brand50 = Color(0xFFEEF5EF);

  // Aksen logo, dipakai hemat untuk status penting dan fokus.
  static const accent700 = Color(0xFF725A00);
  static const accent600 = Color(0xFFFFD21E);
  static const accent400 = Color(0xFFFFE15E);
  static const accent100 = Color(0xFFFFF6C8);

  // Neutral
  static const neutral950 = Color(0xFF121C17);
  static const neutral900 = Color(0xFF1B2822);
  static const neutral700 = Color(0xFF3D4F46);
  static const neutral500 = Color(0xFF5C6F65);
  static const neutral400 = Color(0xFF8A9A91);
  static const neutral300 = Color(0xFFB3C1B9);
  static const neutral200 = Color(0xFFCCD7D0);
  static const neutral150 = Color(0xFFDBE4DE);
  static const neutral100 = Color(0xFFE7EEE9);
  static const neutral50 = Color(0xFFF1F5F2);
  static const surface = Color(0xFFFFFFFF);

  // Semantic
  static const red700 = Color(0xFFA63A3A);
  static const red600 = Color(0xFFC04A4A);
  static const red100 = Color(0xFFFAE4E4);
  static const success700 = Color(0xFF1F6B45);
  static const success600 = Color(0xFF28804F);
  static const success100 = Color(0xFFDFF0E4);
  static const info100 = brand100;

  // Alias nama lama
  static const navy950 = brand950;
  static const navy900 = brand900;
  static const navy700 = brand700;
  static const navy600 = brand600;
  static const navy500 = brand500;
  static const navy100 = brand100;
  static const cyan600 = brand500;
  static const cyan100 = brand100;
  static const amber700 = accent700;
  static const amber600 = accent600;
  static const amber500 = accent400;

  /// Navy logo SiSi: hanya logo dan garis tiang pada motif jaringan.
  static const navyLogo = Color(0xFF0E1F4D);

  // Warna resmi PLN
  static const plnYellow = Color(0xFFFFDE00);
  static const plnRed = Color(0xFFE30613);
  static const plnBlue = Color(0xFF00A0DC);
}
