import '../../core/wib.dart';

/// Kode berantai ROW, dibuat di HP (PRD F-ROW-INPUT). Pure Dart.
///
/// Header    : `R<kode sub-tim 2>-<KODE_ULP 5><YYMMDD><urut 3>`   contoh `R03-16130261002001`
/// Realisasi : `<header>-PNY.<nnn>`
/// Eksekusi  : `<realisasi>-EKS.<nnn>`
///
/// UUID tetap ID asli. Kode hanya label bisnis, server yang jadi wasit (OK / DUPLIKAT / KODE_BENTROK).
class KodeRow {
  KodeRow._();

  static const String kodeUlp = '16130';
  static const int urutMaks = 999;

  static final RegExp polaHeader = RegExp(r'^R(\d{2})-(\d{5})(\d{6})(\d{3})$');
  static final RegExp polaRealisasi = RegExp(r'^R\d{2}-\d{14}-PNY\.(\d{3})$');
  static final RegExp polaEksekusi =
      RegExp(r'^R\d{2}-\d{14}-PNY\.\d{3}-EKS\.(\d{3})$');

  static String header(
      {required String kodeSubTim,
      required DateTime waktu,
      required int urut}) {
    if (!RegExp(r'^\d{2}$').hasMatch(kodeSubTim)) {
      throw ArgumentError.value(kodeSubTim, 'kodeSubTim', 'harus 2 digit');
    }
    return 'R$kodeSubTim-$kodeUlp${Wib.yymmdd(waktu)}${_tiga(urut)}';
  }

  static String realisasi(String kodeHeader, int urut) {
    if (!polaHeader.hasMatch(kodeHeader)) {
      throw ArgumentError.value(kodeHeader, 'kodeHeader');
    }
    return '$kodeHeader-PNY.${_tiga(urut)}';
  }

  static String eksekusi(String kodeRealisasi, int urut) {
    if (!polaRealisasi.hasMatch(kodeRealisasi)) {
      throw ArgumentError.value(kodeRealisasi, 'kodeRealisasi');
    }
    return '$kodeRealisasi-EKS.${_tiga(urut)}';
  }

  /// Nomor berikutnya = nomor terbesar yang pernah terpakai + 1.
  /// Data yang belum pernah sync boleh dihapus dan nomornya dirapatkan (di luar fungsi ini).
  static int urutBerikutnya(int urutMaksTerpakai) => urutMaksTerpakai + 1;

  /// "Minta nomor baru" saat KODE_BENTROK (PRD Alur C): ganti awalan induk di kode anak.
  static String gantiInduk(String kode, String indukLama, String indukBaru) {
    if (!kode.startsWith(indukLama)) {
      throw ArgumentError.value(kode, 'kode', 'bukan turunan $indukLama');
    }
    return indukBaru + kode.substring(indukLama.length);
  }

  /// Urut Header dari kode (untuk menyimpan urut_maks setelah getKodeRow).
  static int? urutHeader(String kode) {
    final m = polaHeader.firstMatch(kode);
    return m == null ? null : int.parse(m.group(4)!);
  }

  static String _tiga(int n) {
    if (n < 1 || n > urutMaks) throw RangeError.range(n, 1, urutMaks, 'urut');
    return n.toString().padLeft(3, '0');
  }
}
