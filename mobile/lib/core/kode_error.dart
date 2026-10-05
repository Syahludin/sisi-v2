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
        return 'Username atau password salah, atau akun dikunci sementara (15 menit) karena terlalu banyak salah.';
      case 'AKUN_TERKUNCI':
        return 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.';
      case 'TERLALU_SERING':
        return 'Terlalu banyak permintaan dalam 1 menit. Tunggu sebentar lalu coba lagi.';
      case 'GPS_PALSU':
        return 'Login ditolak: lokasi palsu (fake GPS) terdeteksi.';
      case 'LOGIN_DIBATASI':
        return 'Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba lagi.';
      case 'FOTO_TIDAK_VALID':
        return 'Foto di server tidak cocok dengan datanya. Lapor admin.';
      case 'TERLALU_BANYAK_BARIS':
        return 'Kendala maksimal 5 baris.';
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
      case 'HEADER_GANDA':
        return 'Header hari ini sudah ada di server (mungkin dari HP lain). Lapor admin.';
      case 'PENYULANG_GANDA':
        return 'Penyulang ini sudah ada di laporan yang sama.';
      case 'KODE_BENTROK':
      case 'INDUK_BENTROK':
        return 'Nomor kode bentrok dengan data lain. Perlu minta nomor baru.';
      case 'KONFLIK_REVISION':
        return 'Data sudah berubah di server. Tarik ulang dulu.';
      case 'TANGGAL_DI_LUAR_BATAS':
      case 'DATA_TERKUNCI':
        return 'Data lebih dari 7 hari, sudah terkunci.';
      case 'JENIS_TIDAK_COCOK':
        return 'Jenis pekerjaan tidak cocok dengan diameter. Perbarui master lalu isi ulang.';
      case 'SECTION_TIDAK_COCOK':
        return 'Section bukan milik penyulang ini.';
      case 'INDUK_GAGAL':
      case 'INDUK_TIDAK_ADA':
        return 'Data induknya ditolak atau belum terkirim.';
      case 'KOORDINAT_DI_LUAR_AREA':
        return 'Koordinat di luar area Bangka Belitung.';
      case 'KM_AKHIR_KURANG':
        return 'KM akhir lebih kecil dari KM awal.';
      case 'RENTANG_TERLALU_PANJANG':
        return 'Rentang arsip maksimal 31 hari.';
      case 'RENTANG_TIDAK_VALID':
        return 'Tanggal awal harus sebelum tanggal akhir.';
      case 'FOTO_RUSAK':
      case 'FORMAT_FOTO_SALAH':
        return 'File foto rusak / bukan JPEG. Ambil ulang.';
      case 'FOTO_TERLALU_BESAR':
        return 'Foto terlalu besar. Ambil ulang.';
      case 'SUDAH_BATAL':
        return 'Eksekusi sudah BATAL, foto tidak dikirim.';
      case 'BUKAN_MILIK_TIM':
        return 'Data ini bukan milik tim kamu.';
      case 'FOTO_TIDAK_ADA':
        return 'Foto belum ada di server.';
      case 'DATA_TIDAK_DITEMUKAN':
        return 'Data tidak ditemukan di server (mungkin lebih dari 7 hari).';
      case 'HANYA_HARI_INI':
        return 'Laporan UP3/UIW hanya bisa diubah untuk hari ini.';
      case 'PENYULANG_TIDAK_ADA':
        return 'Penyulang tidak ada / nonaktif di master. Download Master Data lalu pilih ulang.';
      case 'SECTION_GANDA':
        return 'Section yang sama sudah ada di daftar C4A.';
      case 'SECTION_TIDAK_ADA':
        return 'Section tidak ada / nonaktif di master. Download Master Data lalu pilih ulang.';
      case 'TERLALU_BANYAK':
        return 'C4A maksimal 20 baris per hari.';
      case 'CONFIG_TIDAK_LENGKAP':
      case 'CONFIG_TIDAK_VALID':
        return 'Konfigurasi server belum lengkap / sheet tidak sesuai. Lapor admin.';
      case 'DATA_GANDA':
        return 'Ada data ganda di sheet laporan. Lapor admin.';
      case 'FOTO_UNDUH_RUSAK':
        return 'Foto rusak saat diunduh. Coba lagi.';
      default:
        if (sesiHabis.contains(kode)) return 'Sesi berakhir. Silakan login lagi.';
        return 'Terjadi kesalahan ($kode).';
    }
  }
}
