/// Konfigurasi environment dari `--dart-define-from-file=env/<env>.json`.
/// Panggil Env.pastikanValid() paling awal di main().
class Env {
  static const String name = String.fromEnvironment('SISI_ENV');
  static const String apiUrl = String.fromEnvironment('SISI_API_URL');
  /// v1.0.50 multi-unit: nama ULP di judul / login (env/ulpmentok.json: "SISI_ULP": "Mentok"). Kosong = Toboali.
  static const String ulp = String.fromEnvironment('SISI_ULP', defaultValue: 'Toboali');

  static bool get isStaging => name == 'staging';

  static void pastikanValid() {
    if (name != 'staging' && name != 'production') {
      throw StateError('SISI_ENV tidak valid. Jalankan dengan --dart-define-from-file=env/<env>.json');
    }
    final uri = Uri.tryParse(apiUrl);
    if (uri == null || uri.scheme != 'https' || uri.host != 'script.google.com') {
      throw StateError('SISI_API_URL tidak valid');
    }
  }
}
