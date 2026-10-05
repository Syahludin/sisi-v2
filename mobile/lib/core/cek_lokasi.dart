import 'package:geolocator/geolocator.dart';

import 'gps.dart';

/// Hasil cek lokasi sebelum login (v0.38).
enum StatusLokasi { aman, palsu, gpsMati, izinDitolak, izinDitolakPermanen, tidakDapat }

/// Guard lokasi palsu (fake GPS) saat login. Keputusan 4 Okt 2026: lokasi palsu = login ditolak.
/// Fail closed: GPS mati / izin lokasi ditolak / lokasi tidak didapat = juga tidak bisa login,
/// karena app ROW memang wajib GPS (koordinat pekerjaan + foto).
/// Sampel pertama yang segar dari Gps.aliran (fused, cadangan GPS mentah); tanda mock tetap terbaca.
class CekLokasi {
  CekLokasi._();

  static Future<StatusLokasi> sebelumLogin() async {
    if (!await Geolocator.isLocationServiceEnabled()) return StatusLokasi.gpsMati;
    var izin = await Geolocator.checkPermission();
    if (izin == LocationPermission.denied) izin = await Geolocator.requestPermission();
    if (izin == LocationPermission.deniedForever) return StatusLokasi.izinDitolakPermanen;
    if (izin == LocationPermission.denied) return StatusLokasi.izinDitolak;
    final pos = await Gps.sampelPertama(); // v0.40: aliran + cadangan GPS mentah, maks 25 detik
    if (pos == null) return StatusLokasi.tidakDapat;
    return pos.isMocked ? StatusLokasi.palsu : StatusLokasi.aman;
  }

  static String pesan(StatusLokasi s) => switch (s) {
        StatusLokasi.aman => '',
        StatusLokasi.palsu => 'Login ditolak: lokasi palsu (fake GPS) terdeteksi. Matikan aplikasi GPS palsu lalu coba lagi.',
        StatusLokasi.gpsMati => 'Nyalakan GPS / Lokasi HP dulu untuk login.',
        StatusLokasi.izinDitolak => 'Izin lokasi wajib untuk login. Ketuk Masuk lalu pilih Izinkan.',
        StatusLokasi.izinDitolakPermanen => 'Izin lokasi ditolak permanen. Izinkan Lokasi untuk SiSi di Pengaturan HP.',
        StatusLokasi.tidakDapat => 'Lokasi belum didapat dalam 25 detik. Pindah ke tempat terbuka, nyalakan Wi-Fi, lalu ulangi.',
      };
}
