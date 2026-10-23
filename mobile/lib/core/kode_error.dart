/// Kode error dari server (PRD 6. Endpoint > Kode error umum).
class KodeError {
  KodeError._();

  /// Sesi habis -> hapus token, outbox tetap, ke login (PRD Alur D).
  static const Set<String> sesiHabis = {
    'SESI_TIDAK_VALID',
    'SESI_DICABUT',
    'SESI_KEDALUWARSA',
    'AKUN_NONAKTIF',
    // v0.62.4 (audit 6 Okt 2026): profil akun berubah di db_Users / db_Tim. Token tidak bisa dipakai lagi, jadi
    // dulu HP mencoba terus tanpa pernah ke login. Sekarang sama dengan sesi habis (outbox tetap).
    'TIM_NONAKTIF',
    'ROLE_TIDAK_VALID',
    'PETUGAS_TANPA_TIM',
    // v0.63.0: akun YANDAL habis di menit peralihan shift (07:59 / 15:59 / 23:59 WIB)
    'SHIFT_BERAKHIR',
  };

  static const String belumDiimplementasi = 'BELUM_DIIMPLEMENTASI';
  static const String serverSibuk = 'SERVER_SIBUK';
  static const String aksesDitolak = 'AKSES_DITOLAK';
  static const String terlaluSering = 'TERLALU_SERING';

  /// v0.62.5: lokal saja (bukan dari server). Jawaban cekSesi datang setelah logout / ganti akun.
  static const String sesiBerganti = 'SESI_BERGANTI';

  /// Pesan untuk petugas. Login sengaja umum (tidak membocorkan username ada/tidak).
  static String pesan(String kode) {
    switch (kode) {
      case 'SHIFT_BERAKHIR':
        return 'Shift sudah berakhir. Login lagi untuk shift berikutnya.';
      // v0.65.0: kirim P0 Yandal
      case 'WAKTU_DI_LUAR_SHIFT':
        return 'Waktu P0 / foto di luar jam shift. P0 ini tidak bisa dikirim.';
      case 'WAKTU_MELEWATI_SERVER':
        return 'Jam HP lebih maju dari jam server. Nyalakan tanggal & waktu otomatis lalu kirim lagi.';
      case 'WAKTU_TIDAK_URUT':
        return 'Urutan waktu foto tidak benar (Sebelum > Pekerjaan > Sesudah).';
      case 'URUTAN_FOTO':
        return 'Foto tahap sebelumnya belum sampai server. Dicoba lagi otomatis.';
      case 'FOTO_SUDAH_ADA':
        return 'Server sudah punya foto lain untuk tahap ini.';
      case 'FILE_FOTO_HILANG':
        return 'File foto di HP hilang.';
      // v0.66.0: Pengecekan Switching
      case 'BUKAN_PENGECEKAN_GARDU':
        return 'P0 ini bukan Pengecekan Gardu.';
      case 'GARDU_TIDAK_DIKENAL':
        return 'Gardu tidak ada di Master Gardu. Perbarui Master Gardu.';
      case 'GARDU_TIDAK_AKTIF':
        return 'Gardu sudah tidak AKTIF di Master Gardu.';
      case 'GARDU_BUKAN_PENYULANG':
        return 'Gardu bukan di penyulang P0 ini.';
      case 'GARDU_TERKUNCI':
        return 'Gardu / penyulang terkunci setelah pengukuran disimpan.';
      case 'PENGUKURAN_GARDU_SUDAH_ADA':
        return 'P0 ini sudah punya pengukuran gardu (1 gardu per P0).';
      case 'PENGUKURAN_GARDU_BELUM_LENGKAP':
        return 'Lengkapi 10 foto ukur gardu dulu, baru foto Sesudah.';
      case 'SWITCHING_BELUM_ADA':
        return 'Foto Sesudah ditolak: belum ada pengecekan switching dengan foto arus di server.';
      case 'BUKAN_SWITCHING':
        return 'Section switching harus LBS / ACR.';
      case 'BUKAN_PENGECEKAN_SWITCHING':
        return 'P0 ini bukan Pengecekan Switching.';
      case 'SECTION_BEDA_P0':
        return 'Section switching beda dengan section P0. Buka lagi detail P0 lalu simpan ulang switching.';
      case 'SWITCHING_SUDAH_ADA':
        return 'P0 ini sudah punya data switching di server (1 switching per P0).';
      case 'SWITCHING_TERKUNCI':
        return 'Data switching sudah terkunci, hanya Arus R/S/T yang bisa diubah.';
      case 'P0_SUDAH_SELESAI':
        return 'P0 sudah selesai di server. Data switching tidak bisa diubah lagi.';
      case 'PEKERJAAN_TIDAK_DIKENAL':
        return 'Nama pekerjaan tidak ada di master (mungkin dinonaktifkan admin).';
      case 'SECTION_TIDAK_DIKENAL':
      case 'SECTION_BUKAN_PENYULANG':
      case 'PENYULANG_TIDAK_DIKENAL':
        return 'Penyulang / section tidak ada di master. Unduh ulang master lalu lapor admin.';
      case 'BUKAN_SHIFT_INI':
        return 'P0 ini milik shift lain, tidak bisa dikirim dari sesi ini.';
      case 'SHIFT_PERALIHAN':
        return 'Jam peralihan shift. Login lagi mulai jam 08:00, 16:00, atau 00:00.';
      case 'TIKET_TIDAK_VALID':
        return 'Waktu memilih petugas habis. Login ulang.';
      case 'PETUGAS_TIDAK_VALID':
        return 'Petugas tidak terdaftar aktif di tim ini. Login ulang untuk memuat daftar terbaru.';
      case 'PETUGAS_SEDANG_BERTUGAS':
        return 'Petugas ini sedang bertugas di tim lain pada shift yang sama.';
      case 'SHIFT_SUDAH_DIMULAI':
        return 'Shift tim ini sudah dimulai di HP lain dengan petugas berbeda. Ganti petugas hanya lewat admin.';
      case 'PETUGAS_KOSONG':
        return 'Belum ada petugas aktif di tim ini. Hubungi admin.';
      case 'JUMLAH_PETUGAS':
        return 'Pilih 1 atau 2 petugas.';
      case 'PETUGAS_GANDA':
        return 'Nama petugas aktif sudah ada.';
      case 'TIM_TIDAK_VALID':
        return 'Tim tujuan bukan tim YANDAL aktif.';
      case 'LOGIN_GAGAL':
        return 'Username atau password salah, atau akun dikunci sementara (15 menit) karena terlalu banyak salah.';
      case 'AKUN_TERKUNCI':
        return 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.';
      case 'TERLALU_SERING':
        return 'Terlalu banyak permintaan dalam 1 menit. Tunggu sebentar lalu coba lagi.';
      case 'GPS_PALSU':
        return 'Login ditolak: lokasi palsu (fake GPS) terdeteksi.';
      // v0.67.0: Ganti Password
      case 'PASSWORD_LAMA_SALAH':
        return 'Password lama salah. Salah 5 kali = ditunda 15 menit.';
      case 'PASSWORD_TERLALU_PENDEK':
        return 'Password baru minimal 10 karakter.';
      case 'PASSWORD_SAMA':
        return 'Password baru harus beda dari password lama.';
      case 'PASSWORD_LEMAH':
        return 'Password baru tidak boleh sama dengan username.';
      // v0.70.0: Berita Acara Gardu
      case 'FOTO_BELUM_LENGKAP':
        return 'Foto BA belum lengkap di server. Ketuk Simpan lagi supaya foto dikirim ulang.';
      case 'BA_SUDAH_DISIMPAN':
        return 'BA ini sudah tersimpan, foto tidak bisa diganti lagi.';
      case 'UPDATE_APLIKASI_DULU': // v0.81.1
        return 'Terdapat Pembaharuan Aplikasi, Silahkan lakukan Update Aplikasi. Data yang belum terkirim tetap aman di HP.'; // v1.0.22
      case 'AKSI_TIDAK_DIKENAL': // v0.75.0: app lebih baru dari backend
        return 'Server belum diperbarui untuk fitur ini. Minta admin deploy backend versi terbaru.';
      case 'PDF_BELUM_ADA':
        return 'PDF BA belum dibuat. Ketuk Buat PDF dulu.';
      // v0.78.0: BA TTD / Kirim EAM / Update Master Gardu
      case 'TTD_BELUM_ADA':
        return 'BA TTD belum diupload. Upload BA yang sudah ditandatangani dulu.';
      case 'TTD_PERLU_ULANG':
        return 'PDF dibuat ulang / BA diedit sesudah TTD. Upload BA TTD yang baru dulu.';
      case 'FILE_RUSAK':
        return 'File rusak saat dikirim. Coba upload lagi.';
      case 'FORMAT_FILE_SALAH':
        return 'File BA TTD harus berformat PDF.';
      case 'FILE_TERLALU_BESAR':
        return 'File terlalu besar (maks 10 MB).';
      case 'BAGIAN_HILANG':
        return 'Upload terputus di tengah. Upload ulang file BA TTD.';
      case 'MASTER_LEBIH_BARU':
        return 'Master Gardu sudah memakai BA yang lebih baru untuk gardu ini. Master tidak diubah.';
      case 'GARDU_TIDAK_DITEMUKAN':
        return 'Gardu BA ini tidak ada di Master Gardu. Lapor admin.';
      case 'PDF_TERLALU_BESAR':
        return 'PDF terlalu besar untuk diunduh lewat aplikasi.';
      case 'GARDU_BARU_DIUKUR':
        return 'Gardu ini baru diukur kurang dari 2 hari lalu. Pilih gardu lain (aturan Pengukuran Gardu 2 Hari Sekali aktif).';
      case 'P0_BELUM_SELESAI':
        return 'P0 belum selesai (foto Sesudah belum masuk). Belum bisa diputuskan.';
      case 'P0_DITOLAK_SISTEM':
        return 'P0 ini ditolak otomatis oleh sistem dan tidak bisa diubah.';
      case 'DATA_BERUBAH':
        return 'Data sudah diubah admin lain. Muat ulang dulu.';
      case 'NOMOR_GARDU_BERUBAH':
        return 'Nomor gardu pesanan sudah dipakai BA lain. Pilih ulang prefix lalu Simpan lagi (watermark dibuat ulang).';
      case 'NOMOR_BATAL_TIDAK_TERSEDIA':
        return 'Nomor gardu BATAL itu sudah dipakai. Pilih ulang prefix untuk nomor terbaru.';
      case 'PEJABAT_TIDAK_VALID':
        return 'Petugas tidak aktif / bukan Pemeriksa. Download ulang Master Gardu lalu pilih lagi.';
      case 'PEJABAT_MENGETAHUI_TIDAK_VALID':
        return 'Pejabat MENGETAHUI aktif di db_Pejabat_BA harus tepat satu. Lapor pemilik sistem.';
      case 'SECTION_TIDAK_VALID':
        return 'Section tidak aktif di master. Download ulang Master Data lalu pilih lagi.';
      case 'TANGGAL_TIDAK_VALID':
        return 'Tanggal tidak valid: Tanggal Pekerjaan tidak boleh sesudah Tanggal BA, dan Tanggal BA tidak boleh di masa depan.';
      case 'JENIS_BA_BELUM_TERSEDIA':
        return 'Jenis BA ini belum tersedia di server.';
      // v0.71.0: PDF BA (Cloud Run sisi-pdf-engine)
      case 'PDF_ENGINE_BELUM_DISET':
        return 'Mesin PDF belum disambungkan di server. Lapor pemilik sistem (PDF_ENGINE_URL / PDF_ENGINE_SECRET).';
      case 'PDF_ENGINE_DITOLAK':
        return 'Mesin PDF menolak permintaan server (rahasia tidak cocok). Lapor pemilik sistem.';
      case 'PDF_ENGINE_TIDAK_SIAP':
        return 'Mesin PDF sedang tidak siap. Tunggu sebentar lalu buat PDF lagi dari Daftar BA.';
      case 'PDF_GAGAL':
        return 'PDF gagal dibuat. Coba lagi dari Daftar BA; kalau terus gagal, lapor pemilik sistem.';
      case 'PDF_SEDANG_DIBUAT':
        return 'PDF BA ini sedang dibuat. Tunggu sebentar lalu segarkan daftar.';
      case 'PDF_JENIS_BELUM_TERSEDIA':
        return 'Mesin PDF Cloud Run belum diperbarui untuk jenis BA ini (redeploy sisi-pdf-engine).';
      case 'PDF_TIDAK_PRIVAT':
        return 'Folder PDF terbagi lewat link publik, PDF ditolak. Lapor pemilik sistem.';
      // v0.86.0: arsip BA v1 (baca saja)
      case 'ARSIP_BA_TIDAK_ADA':
        return 'BA lama ini tidak ada lagi di arsip. Segarkan daftar.';
      case 'ARSIP_FILE_TIDAK_ADA':
        return 'File BA lama tidak tercatat atau tidak bisa dibuka server (dihapus / tidak dibagikan ke akun SiSi).';
      case 'ARSIP_BA_RUSAK':
        return 'Sheet arsip BA lama berubah. Lapor pemilik sistem (jalankan ulang ADMIN_migrasiArsipBa).';
      case 'BA_TIDAK_DITEMUKAN':
        return 'BA tidak ditemukan di Rekap_BA. Segarkan daftar.';
      case 'BA_SUDAH_BATAL':
        return 'BA ini sudah BATAL.';
      case 'STRUKTUR_BERUBAH':
        return 'Struktur sheet di server berubah. Lapor admin (jalankan ADMIN_cekKonfigurasi).';
      case 'LOGIN_DIBATASI':
        return 'Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba lagi.';
      case 'FOTO_TIDAK_PRIVAT':
        return 'Folder foto di server belum dikunci (bisa dibuka umum). Lapor admin. Foto tetap aman di HP dan dikirim nanti.';
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
        return 'Rentang tanggal terlalu panjang. Persempit rentangnya.';
      // v1.0.17: Jadwal Padam
      case 'JADWAL_TERKUNCI':
        return 'Jadwal sudah terealisasi / dibatalkan, tidak bisa diubah atau dihapus.';
      case 'JADWAL_PADAM_KOSONG':
        return 'Tidak ada jadwal padam (status pekerjaan Padam) pada rentang tanggal tersebut.';
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
      // v1.0.11: Inspeksi Gardu + WO tindak lanjut temuan (TIM_TIDAK_VALID / FOTO_BELUM_LENGKAP versi WO: pesanWo)
      case 'PENGUKURAN_H1_BELUM_LENGKAP':
        return 'Pengukuran gardu laporan sebelumnya belum lengkap. Isi LWBP / WBP susulan atau hapus gardu itu dulu.';
      case 'GARDU_PUNYA_TEMUAN': // v1.0.16
        return 'Gardu ini sudah punya temuan, jadi tidak bisa dihapus. Isi pengukuran susulannya.';
      case 'URUTAN_PENGUKURAN':
        return 'Isi pengukuran LWBP dulu, baru WBP.';
      case 'GARDU_GANDA':
        return 'Gardu ini sudah ada di laporan hari ini.';
      case 'WO_SUDAH_DIMULAI':
        return 'WO sudah mulai dikerjakan tim, tidak bisa dipindah, ditarik, atau diubah.';
      // v1.0.17: penguncian isian petugas inspeksi
      case 'WO_SUDAH_DITERUSKAN':
        return 'Temuan sudah diteruskan ke tim tindak lanjut, jadi terkunci. Minta admin menarik WO dulu bila perlu diperbaiki.';
      case 'TIANG_TERKUNCI':
        return 'Nomor tiang mengikuti input petugas inspeksi dan tidak bisa diubah.';
      case 'WO_SUDAH_SELESAI':
        return 'WO sudah selesai.';
      case 'WO_BELUM_DIMULAI':
        return 'Klik Mulai kerjakan WO dulu.';
      case 'WO_BELUM_DITERUSKAN':
        return 'Temuan ini belum diteruskan ke tim.';
      // v1.0.18: pindah WO terkirim hanya lewat menu Pindah Tim TO
      case 'WO_PINDAH_DI_MENU_PINDAH':
        return 'WO sudah terkirim ke tim lain. Pindahkan lewat menu Pindah Tim TO.';
      case 'WO_TANPA_PEKERJAAN':
        return 'Catat minimal satu pekerjaan sebelum menyelesaikan WO.';
      case 'WO_BUTUH_LAPORAN_UTAMA':
        return 'Buat Laporan Utama hari ini (atau login shift) dulu, baru WO bisa diselesaikan.';
      case 'TERKUNCI_WO':
        return 'Data ini berasal dari WO tindak lanjut dan tidak bisa diubah di sini.';
      case 'PEKERJAAN_TIDAK_DIDUKUNG':
        return 'Pekerjaan ini tidak bisa dicatat lewat WO.';
      case 'CONFIG_TIDAK_LENGKAP':
      case 'CONFIG_TIDAK_VALID':
        return 'Konfigurasi server belum lengkap / sheet tidak sesuai. Lapor admin.';
      case 'DATA_GANDA':
        return 'Ada data ganda di sheet laporan. Lapor admin.';
      case 'FOTO_UNDUH_RUSAK':
        return 'Foto rusak saat diunduh. Coba lagi.';
      case 'TIM_NONAKTIF':
        return 'Tim kamu sudah tidak aktif. Hubungi admin, lalu login lagi. Data yang belum terkirim tetap aman di HP.';
      case 'ROLE_TIDAK_VALID':
      case 'PETUGAS_TANPA_TIM':
        return 'Pengaturan akun kamu berubah. Hubungi admin, lalu login lagi. Data yang belum terkirim tetap aman di HP.';
      default:
        if (sesiHabis.contains(kode)) return 'Sesi berakhir. Silakan login lagi.';
        return 'Terjadi kesalahan ($kode).';
    }
  }

  /// v0.62.2: alasan sinkron ROW dalam bahasa petugas (tanpa kode server).
  /// Dipakai di kartu eksekusi/penyulang/laporan dan Perlu Tindakan.
  static String alasanSinkron(String? kode) {
    switch (kode) {
      case null:
      case '':
        return '';
      case 'INDUK_TIDAK_ADA':
        return 'Menunggu laporan/penyulang di atasnya terkirim. Nanti ikut terkirim otomatis.';
      case 'INDUK_GAGAL':
        return 'Laporan/penyulang di atasnya belum bisa terkirim. Beres sendiri setelah itu diselesaikan.';
      case 'INDUK_BENTROK':
        return 'Nomor laporan/penyulang di atasnya sama dengan HP lain. Selesaikan itu dulu di Perlu Tindakan.';
      case 'INDUK_BATAL':
        return 'Laporan/penyulang di atasnya sudah dibatalkan, jadi data ini tidak bisa dikirim.';
      case 'HEADER_GANDA':
        return 'Laporan hari ini sudah dibuat dari HP lain di sub-tim yang sama. Buka Perlu Tindakan, pilih Gabungkan.';
      case 'PENYULANG_GANDA':
        return 'Penyulang ini sudah ditambahkan dari HP lain. Buka Perlu Tindakan, pilih Gabungkan.';
      case 'KODE_BENTROK':
      case 'ID_DIPAKAI':
        return 'Nomornya sama dengan data dari HP lain. Buka Perlu Tindakan, ketuk Minta nomor baru.';
      case 'KONFLIK_REVISION':
        return 'Data ini sudah diubah dari HP lain atau oleh admin. Buka Perlu Tindakan untuk memilih.';
      case 'DATA_TERKUNCI':
      case 'TANGGAL_DI_LUAR_BATAS':
        return 'Sudah lewat 7 hari, data dikunci dan tidak bisa dikirim lagi.';
      case 'MASIH_ADA_ANAK':
        return 'Masih ada data di bawahnya. Batalkan dulu data di bawahnya.';
      case 'SUDAH_BATAL':
        return 'Data ini sudah dibatalkan di server.';
      case 'KM_AKHIR_KURANG':
        return 'KM akhir lebih kecil dari KM awal. Perbaiki lalu simpan lagi.';
      case 'FIELD_WAJIB':
      case 'HEADER_KOSONG':
        return 'Ada isian wajib yang masih kosong. Lengkapi lalu simpan lagi.';
      case 'FORMAT_SALAH':
      case 'TIPE_SALAH':
      case 'DATA_TIDAK_VALID':
      case 'PILIHAN_TIDAK_VALID':
      case 'HARUS_BULAT':
      case 'TERLALU_PANJANG':
      case 'DI_LUAR_RENTANG':
      case 'KODE_TIDAK_VALID':
      case 'FIELD_TIDAK_DIKENAL':
        return 'Ada isian yang tidak sesuai. Periksa lalu simpan lagi. Kalau masih gagal, lapor admin.';
      case 'KOLOM_TERKUNCI':
        return 'Isian ini tidak boleh diubah setelah terkirim.';
      case 'DATA_TIDAK_DITEMUKAN':
        return 'Data ini tidak ada di server (mungkin sudah dihapus admin).';
      case 'SERVER_SIBUK':
      case 'TERLALU_SERING':
      case 'TERLALU_BANYAK_OPERASI':
      case 'PAYLOAD_TERLALU_BESAR':
        return 'Server sedang sibuk. Akan dicoba kirim lagi otomatis.';
      case 'KONFLIK':
      case 'DITOLAK':
        return 'Belum bisa diterima server. Buka Perlu Tindakan di Beranda.';
    }
    final p = pesan(kode);
    // Jangan tampilkan kode mentah ke petugas.
    return p.startsWith('Terjadi kesalahan (') ? 'Belum bisa diterima server. Buka Perlu Tindakan di Beranda.' : p;
  }
}
