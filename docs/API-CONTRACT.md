

## v1.0.20 Rekam jejak gardu, kalender tanggal padam, navigasi, audit endpoint
- `getRiwayatGardu`: `pengukuran[].periode` selalu `LWBP` / `WBP` (isian Waktu Beban baku dipakai; kosong = dari jam ukur, WBP 17:00-21:59 WIB). `jam` = HH:mm.
- `getNotifikasi`: daftar item di-cache 60 detik (per tim / per hak menu admin), status dilihat per akun di-cache 10 menit dan diperbarui saat `tandaiNotifikasi`. WO dikirim / dipindah / ditarik = cache lonceng tim terkait dihapus (langsung terbaru).
- `getKalenderTim`: isi per tim / umum + bulan di-cache 60 detik.
- DIHAPUS: `ubahPgHartek` (tidak dipakai HP). Lokasi PG Hartek tidak bisa diubah / dihapus lewat endpoint.
- Audit guard: semua endpoint lewat guard_ + rem per menit + cek peran di baris pertama (tes audit). Endpoint tulis tanpa menu hanya milik sesi sendiri (Yandal HP + token shift, gantiPassword, tandaiNotifikasi).
