/// Kode error dari server (PRD 6. Endpoint > Kode error umum).
class KodeError {
  KodeError._();

  /// Sesi habis -> hapus token, outbox tetap, ke login (PRD Alur D).
  static const Set<String> sesiHabis = {
    'SESI_TIDAK_VALID',
    'SESI_DICABUT',
    'SESI_KEDALUWARSA',
    'AKUN_NONAKTIF',
  };

  static const String belumDiimplementasi = 'BELUM_DIIMPLEMENTASI';
  static const String serverSibuk = 'SERVER_SIBUK';
  static const String aksesDitolak = 'AKSES_DITOLAK';

  /// Pesan untuk petugas. Login sengaja umum (tidak membocorkan username ada/tidak).
  static String pesan(String kode) {
    switch (kode) {
      case 'LOGIN_GAGAL':
        return 'Username atau password salah.';
      case 'AKUN_TERKUNCI':
        return 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.';
      case 'SERVER_SIBUK':
        return 'Server sibuk, coba lagi sebentar.';
      case 'AKSES_DITOLAK':
        return 'Akun kamu tidak punya akses ke menu ini.';
      case 'DIAMETER_DI_LUAR_KATEGORI':
        return 'Diameter 1-24 cm tidak diterima. Isi 0 untuk rabas/pangkas, atau minimal 25 cm untuk tebang.';
      case 'DIAMETER_TIDAK_VALID':
        return 'Diameter harus bilangan bulat 0-1000 cm.';
      case 'ENV_TIDAK_COCOK':
        return 'Aplikasi tersambung ke server yang salah. Lapor admin.';
      default:
        if (sesiHabis.contains(kode)) return 'Sesi berakhir. Silakan login lagi.';
        return 'Terjadi kesalahan ($kode).';
    }
  }
}
