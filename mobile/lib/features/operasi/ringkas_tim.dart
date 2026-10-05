import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';

/// Status hari ini satu sub-tim dari daftar laporan getLaporanRow (v0.50).
class RingkasTim {
  RingkasTim(this.laporan);

  /// Laporan hari ini milik tim ini. null = data server tidak didapat (offline).
  final List<Map<String, dynamic>>? laporan;

  bool get offline => laporan == null;
  bool get adaLaporan => (laporan ?? const []).isNotEmpty;
  bool get siapWa => (laporan ?? const []).any((l) => l['siapKirim'] == true);

  int _jumlah(String k) => (laporan ?? const <Map<String, dynamic>>[])
      .fold(0, (a, l) => a + (((l['total'] as Map<String, dynamic>?)?[k] as num?)?.toInt() ?? 0));
  int get rabas => _jumlah('rabas');
  int get sedang => _jumlah('sedang');
  int get besar => _jumlah('besar');

  String get label => offline ? 'OFFLINE' : siapWa ? 'SIAP WA' : adaLaporan ? 'PROSES' : 'BELUM LAPOR';
  Color get warna => offline
      ? AppColors.neutral700
      : siapWa
          ? AppColors.success700
          : adaLaporan
              ? AppColors.accent700
              : AppColors.red700;
  Color get latar => offline
      ? AppColors.neutral100
      : siapWa
          ? AppColors.success100
          : adaLaporan
              ? AppColors.accent100
              : AppColors.red100;

  /// Kelompokkan laporan semua tim per timId.
  static Map<String, List<Map<String, dynamic>>> perTim(List<Map<String, dynamic>> semua) {
    final m = <String, List<Map<String, dynamic>>>{};
    for (final l in semua) {
      m.putIfAbsent('${l['timId']}', () => []).add(l);
    }
    return m;
  }
}
