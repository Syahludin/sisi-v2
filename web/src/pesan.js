/** Pesan kode error untuk admin (teks sama dengan aplikasi HP, mobile/lib/core/kode_error.dart, bila ada). */

/** Sesi tidak bisa dipakai lagi: token dihapus, kembali ke halaman login. */
export const SESI_HABIS = new Set([
  'SESI_TIDAK_VALID', 'SESI_DICABUT', 'SESI_KEDALUWARSA', 'AKUN_NONAKTIF', 'TIM_NONAKTIF',
  'ROLE_TIDAK_VALID', 'PETUGAS_TANPA_TIM', 'SHIFT_BERAKHIR',
]);

const PESAN = {
  LOGIN_KOSONG: 'Username dan kata sandi wajib diisi.',
  FIELD_WAJIB: 'Ada isian wajib yang masih kosong. Lengkapi lalu simpan lagi.',
  LOGIN_GAGAL: 'Username atau password salah, atau akun dikunci sementara (15 menit) karena terlalu banyak salah.',
  LOGIN_DIBATASI: 'Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba lagi.',
  AKUN_TERKUNCI: 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.',
  WEB_KHUSUS_ADMIN: 'Website SiSi khusus akun Admin dan Admin ES. Petugas tetap memakai aplikasi SiSi di HP.',
  USERNAME_GANDA: 'Username ini terdaftar ganda di master. Hubungi admin ULP.',
  TERLALU_SERING: 'Terlalu banyak permintaan dalam 1 menit. Tunggu sebentar lalu coba lagi.',
  SERVER_SIBUK: 'Server sibuk, coba lagi sebentar.',
  JARINGAN: 'Tidak bisa terhubung ke server. Periksa internet lalu coba lagi.',
  WAKTU_HABIS: 'Server terlalu lama menjawab. Coba lagi.',
  JAWABAN_TIDAK_VALID: 'Jawaban server tidak terbaca. Coba lagi.',
  CONFIG_KOSONG: 'Alamat server belum diatur (config.js). Hubungi pengelola website.',
  AKSES_DITOLAK: 'Akun ini tidak punya akses ke website admin.',
  KESALAHAN_SERVER: 'Server mengalami kesalahan. Coba lagi sebentar.',
  // Laporan UP3 / UIW
  KONFLIK_REVISION: 'Data sudah berubah di server (diubah admin lain). Muat ulang dulu.',
  HANYA_HARI_INI: 'Laporan UP3/UIW hanya bisa diubah untuk hari ini.',
  TANGGAL_DI_LUAR_BATAS: 'Tanggal di luar batas (tidak boleh setelah hari ini).',
  PENYULANG_TIDAK_ADA: 'Penyulang tidak ada / nonaktif di master. Muat ulang master lalu pilih ulang.',
  PENYULANG_GANDA: 'Penyulang yang sama sudah ada di daftar C4A.',
  SECTION_TIDAK_ADA: 'Section tidak ada / nonaktif di master. Muat ulang master lalu pilih ulang.',
  SECTION_GANDA: 'Section yang sama sudah ada di daftar C4A.',
  TERLALU_BANYAK: 'C4A maksimal 20 baris per hari.',
  KOLOM_TERKUNCI: 'Penyulang / section baris yang sudah tersimpan tidak bisa diganti. Hapus lalu tambah baris baru.',
  ID_GANDA: 'Nomor baris bentrok dengan data lain. Hapus baris itu lalu tambah baru.',
  CONFIG_TIDAK_LENGKAP: 'Konfigurasi server belum lengkap. Hubungi pengelola SiSi.',
  // Master Switching (sama dengan HP)
  PENYULANG_TIDAK_DIKENAL: 'Penyulang tidak ada / nonaktif di master jaringan. Muat ulang lalu pilih dari daftar.',
  SECTION_BEDA_PENYULANG: 'Section yang dipilih bukan milik penyulang ini. Pilih ulang section.',
  NAMA_GANDA: 'Nama switching ini sudah dipakai di penyulang yang sama. Pakai nama lain atau ubah data yang lama.',
  HULU_TIDAK_VALID: 'Switching hulu tidak valid (diri sendiri atau rantai hulu berputar).',
  KOORDINAT_DI_LUAR_AREA: 'Koordinat di luar wilayah Bangka Belitung. Periksa lagi titiknya.',
  FOTO_TERLALU_BESAR: 'Foto terlalu besar (maks 2 MB, sisi 2048 px).',
  FOTO_RUSAK: 'Foto rusak saat dikirim. Coba unggah lagi.',
  FORMAT_FOTO_SALAH: 'File bukan foto JPEG.',
  // Approval P0
  DATA_BERUBAH: 'P0 ini sudah diubah admin lain. Daftar dimuat ulang, periksa lalu putuskan lagi.',
  P0_BELUM_SELESAI: 'P0 belum selesai (foto Sesudah belum masuk). Belum bisa diputuskan.',
  P0_DITOLAK_SISTEM: 'P0 ini ditolak otomatis oleh sistem dan tidak bisa diubah.',
  SUDAH_BATAL: 'P0 ini sudah dibatalkan.',
  DATA_TIDAK_DITEMUKAN: 'Data tidak ditemukan di server (mungkin sudah dihapus).',
  DATA_GANDA: 'Ada data ganda di sheet. Lapor pengelola SiSi.',
  FOTO_TIDAK_ADA: 'Foto belum ada di server.',
  // Material Gudang (teks sama HP: mobile/lib/core/kode_error.dart)
  STOK_TIDAK_CUKUP: 'Stok tidak cukup untuk jenis MCB ini.',
  MATERIAL_TIDAK_DIIZINKAN: 'Material ini tidak diizinkan untuk tim itu. Atur di tab Izin Material.',
  MATERIAL_TIDAK_VALID: 'Material tidak ada atau nonaktif di master.',
  PEMERIKSAAN_BELUM_ADA: 'Pemeriksaan stok awal shift belum dilakukan.',
  SELISIH_MENUNGGU: 'Ada selisih stok yang menunggu persetujuan admin.',
  FOTO_WAJIB: 'Foto wajib diambil.',
  SHIFT_BELUM_DIMULAI: 'Shift tim ini belum dimulai.',
  SHIFT_SEBELUMNYA_TIDAK_ADA: 'Shift sebelumnya tidak tercatat, pemakaian susulan tidak bisa dibuat.',
  SELISIH_TIDAK_DITEMUKAN: 'Selisih tidak ditemukan.',
  SELISIH_TIDAK_VALID: 'Selisih ini tidak bisa diproses dengan cara itu (sudah selesai atau arahnya tidak cocok).',
  ALASAN_WAJIB: 'Alasan atau catatan wajib diisi.',
  PEMAKAIAN_BATAL: 'Pemakaian ini sudah dibatalkan.',
  PILIHAN_TIDAK_VALID: 'Pilihan tidak valid.',
  // Penerusan Tim Temuan Inspeksi (teks sama HP: kode_error.dart + wo_bantu.dart pesanWo)
  TIM_TIDAK_VALID: 'Tim tujuan tidak aktif atau bukan tim ROW / Hartek / Yandal.',
  WO_SUDAH_DIMULAI: 'WO sudah mulai dikerjakan tim, tidak bisa dipindah, ditarik, atau diubah.',
  WO_SUDAH_SELESAI: 'WO sudah selesai.',
  WO_BELUM_DITERUSKAN: 'Temuan ini belum diteruskan ke tim.',
  WO_PINDAH_DI_MENU_PINDAH: 'WO sudah terkirim ke tim lain. Pindahkan lewat menu Pindah Tim TO.',
  WO_GANDA_MENUNGGU: 'WO ini diunggah dua tim dan menunggu verifikasi di menu Verifikasi WO Ganda.',
  FOTO_TIDAK_VALID: 'Foto di server tidak cocok dengan datanya. Lapor pengelola SiSi.',
  // Jadwal Padam
  JADWAL_TERKUNCI: 'Jadwal sudah terealisasi / dibatalkan, tidak bisa diubah atau dihapus.',
  JADWAL_PADAM_KOSONG: 'Tidak ada jadwal padam (status pekerjaan Padam) pada rentang tanggal tersebut.',
  RENTANG_TIDAK_VALID: 'Tanggal awal harus sebelum tanggal akhir.',
  RENTANG_TERLALU_PANJANG: 'Rentang tanggal terlalu panjang (maks 1 tahun). Persempit rentangnya.',
  SECTION_TIDAK_VALID: 'Penyulang / section tidak ada di Master Daerah Padam. Muat ulang lalu pilih lagi.',
  STRUKTUR_BERUBAH: 'Struktur sheet di server berubah. Lapor pengelola SiSi (jalankan ADMIN_cekKonfigurasi).',
  // Berita Acara
  BA_TIDAK_DITEMUKAN: 'BA tidak ditemukan di Rekap_BA. Muat ulang daftar.',
  BA_SUDAH_BATAL: 'BA ini sudah BATAL.',
  PDF_JENIS_BELUM_TERSEDIA: 'Mesin PDF belum mendukung jenis BA ini (perlu redeploy sisi-pdf-engine).',
  PDF_SEDANG_DIBUAT: 'PDF BA ini sedang dibuat. Tunggu sebentar lalu muat ulang.',
  PDF_ENGINE_BELUM_DISET: 'Mesin PDF belum disambungkan di server. Lapor pemilik sistem (PDF_ENGINE_URL / PDF_ENGINE_SECRET).',
  PDF_ENGINE_DITOLAK: 'Mesin PDF menolak permintaan server (kunci tidak cocok). Lapor pemilik sistem.',
  PDF_ENGINE_TIDAK_SIAP: 'Mesin PDF sedang tidak bisa dihubungi. Coba lagi beberapa menit lagi.',
  PDF_TIDAK_PRIVAT: 'File PDF di Drive tidak privat. Lapor pemilik sistem.',
  PDF_BELUM_ADA: 'PDF BA belum dibuat. Buat PDF dulu.',
  PDF_GAGAL: 'PDF gagal dibuat. Coba lagi; kalau terus gagal, lapor pemilik sistem.',
  PDF_TERLALU_BESAR: 'PDF terlalu besar untuk diunduh lewat website.',
  TTD_BELUM_ADA: 'BA TTD belum diupload. Upload BA yang sudah ditandatangani dulu.',
  TTD_PERLU_ULANG: 'PDF dibuat ulang / BA diedit sesudah TTD. Upload BA TTD yang baru dulu.',
  FORMAT_FILE_SALAH: 'File BA TTD harus berformat PDF.',
  FILE_TERLALU_BESAR: 'File terlalu besar (maks 10 MB).',
  FILE_RUSAK: 'File yang terkirim rusak (tidak sama dengan aslinya). Upload ulang.',
  BAGIAN_HILANG: 'Sebagian file tidak sampai di server. Upload ulang.',
  MASTER_LEBIH_BARU: 'Master Gardu sudah memakai BA yang lebih baru untuk gardu ini. Master tidak diubah.',
  GARDU_TIDAK_DITEMUKAN: 'Gardu tidak ada di Master Gardu (db_Gardu).',
  JENIS_BA_BELUM_TERSEDIA: 'Jenis BA ini belum tersedia di server.',
  ARSIP_BA_TIDAK_ADA: 'BA lama ini tidak ada lagi di arsip. Muat ulang daftar.',
  ARSIP_FILE_TIDAK_ADA: 'File BA lama tidak tercatat atau tidak bisa dibuka server (dihapus / tidak dibagikan ke akun SiSi).',
  TANGGAL_TIDAK_VALID: 'Tanggal tidak valid (tanggal awal sesudah tanggal akhir).',
  PEKERJAAN_TIDAK_DIKENAL: 'Jenis pekerjaan tidak ada / nonaktif di master. Muat ulang lalu pilih ulang.',
};

/** Kode isian tidak sesuai skema server: satu pesan umum. */
for (const k of ['FORMAT_SALAH', 'TIPE_SALAH', 'DATA_TIDAK_VALID', 'HARUS_BULAT', 'TERLALU_PANJANG', 'DI_LUAR_RENTANG', 'FIELD_TIDAK_DIKENAL']) {
  PESAN[k] = 'Ada isian yang tidak sesuai. Periksa lalu simpan lagi. Kalau masih gagal, lapor admin.';
}

/** Kode galat dari Error server (e.kode); tanpa kode (fetch gagal, timeout) = JARINGAN. Review 8 Nov 2026: satu definisi untuk semua halaman. */
export const kodeGalat = (e) => (e && e.kode) || 'JARINGAN';

export function pesan(kode) {
  if (PESAN[kode]) return PESAN[kode];
  if (SESI_HABIS.has(kode)) return 'Sesi berakhir. Silakan login lagi.';
  return 'Terjadi kesalahan (' + (kode || 'TIDAK_DIKENAL') + '). Coba lagi.';
}
