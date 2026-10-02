/// Waktu WIB (UTC+7, tanpa DST). Semua tanggal bisnis memakai WIB.
class Wib {
  Wib._();

  static const Duration selisih = Duration(hours: 7);

  /// DateTime UTC yang field-nya (year/month/day/hour) = jam dinding WIB.
  static DateTime dinding(DateTime t) => t.toUtc().add(selisih);

  /// YYMMDD untuk kode berantai.
  static String yymmdd(DateTime t) {
    final w = dinding(t);
    String dua(int n) => n.toString().padLeft(2, '0');
    return '${dua(w.year % 100)}${dua(w.month)}${dua(w.day)}';
  }

  /// yyyy-MM-dd (sama dengan tglJakarta_ di backend).
  static String tanggal(DateTime t) {
    final w = dinding(t);
    String dua(int n) => n.toString().padLeft(2, '0');
    return '${w.year}-${dua(w.month)}-${dua(w.day)}';
  }
}
