

## v1.0.22 Kunci update, revisi master, Update Pengukuran Gardu
- Semua jawaban sukses membawa `master` (Script Property `MASTER_REVISI`, diisi `ADMIN_lengkapiMaster` dengan waktu ISO) kalau terisi. Berubah = HP yang login mengunduh ulang Master Data + Master Gardu (+ master Inspeksi Gardu) sekali per revisi.
- `getRiwayatGardu`: `terbaru` hanya dari Master Gardu (tidak lagi membandingkan 3 sumber). `pengukuran[]` tetap semua sumber, tambah `ukurId` (Yandal `ukur_id`, Inspeksi Gardu `pengukuran_id`, Master kosong).
- `updateUkurMasterGardu` (BARU, menu OPS_PENGUKURAN_GARDU, UBAH, admin): `{garduId, noGardu?, sumber: 'Pengecekan Gardu Yandal' | 'Inspeksi Gardu', ukurId, periode: LWBP | WBP}` -> pengukuran itu ditulis ke db_Gardu (Tanggal / Kode Ukur Terakhir, Waktu Beban, 10 angka, kVA, persen, kategori, Sumber Data, ukur_id_terakhir), juga kalau lebih lama dari master (keputusan admin). Gardu harus AKTIF. Jawaban `{gardu, terbaru}`. Audit `UPDATE_UKUR_GARDU`.
- HP (bukan endpoint): app di bawah versi minimum dan kartu update ditutup = panggilan tulis ditolak di HP (`UPDATE_APLIKASI_DULU`) sebelum dikirim; baca (`get*`, ping, sesi, notifikasi) tetap jalan, sinkron antrean berhenti.
- `ADMIN_cekKonfigurasi`: jumlah Script Properties (batas 50) + properti migrasi (MIG_ / MIGP0_ / MIGHARTEK_ / MIGINS_ / MIGJP_) yang boleh dihapus karena datanya (dibuat_oleh MIGRASI) sudah ada di sheet sebelum hari pengecekan.

## v1.0.21 Pengukuran gardu 3 sumber, kartu pemadaman, Master Gardu Inspeksi Gardu
- `getRiwayatGardu`: Master Gardu (db_Gardu, pengukuran terakhir tercatat) jadi sumber ketiga `pengukuran[]` (`sumber: 'Master Gardu'`, `jam` kosong; salinan dengan `kode` sama dengan riwayat lain tidak diulang). Tambahan `terbaru: {LWBP, WBP}` = pengukuran dengan tanggal lalu jam terbaru dari 3 sumber (null kalau tidak ada) dan `gardu` = baris Master Gardu terkini (bentuk getMaster modul gardu) atau null.
- `getKalenderTim`: kegiatan `PADAM` + `padam: {penyulang, section, jamPadam, jamNyala, durasi, pekerjaan, daerah, lokasi, pelanggan, gardu, statusPekerjaan}` untuk kartu pemadaman Beranda. Kunci cache jadi `kalender:v2:`.
- `getMaster` modul `gardu`: petugas INSPEKSI_GARDU dengan menu OPS_INSDU_INPUT boleh membaca (hanya baca).

## v1.0.20 Rekam jejak gardu, kalender tanggal padam, navigasi, audit endpoint
- `getRiwayatGardu`: `pengukuran[].periode` selalu `LWBP` / `WBP` (isian Waktu Beban baku dipakai; kosong = dari jam ukur, WBP 17:00-21:59 WIB). `jam` = HH:mm.
- `getNotifikasi`: daftar item di-cache 60 detik (per tim / per hak menu admin), status dilihat per akun di-cache 10 menit dan diperbarui saat `tandaiNotifikasi`. WO dikirim / dipindah / ditarik = cache lonceng tim terkait dihapus (langsung terbaru).
- `getKalenderTim`: isi per tim / umum + bulan di-cache 60 detik.
- DIHAPUS: `ubahPgHartek` (tidak dipakai HP). Lokasi PG Hartek tidak bisa diubah / dihapus lewat endpoint.
- Audit guard: semua endpoint lewat guard_ + rem per menit + cek peran di baris pertama (tes audit). Endpoint tulis tanpa menu hanya milik sesi sendiri (Yandal HP + token shift, gantiPassword, tandaiNotifikasi).
