

## v1.0.19 Lonceng notifikasi, update APK, foto temuan, Pindah/Penugasan menu
Persiapan server: push + deploy backend. Script Property baru `APK_FOLDER_ID` (folder Drive APK; nama file memuat versi, mis. `SiSi-STG-1.0.19+193.apk`; file dibuka "siapa saja yang punya link" oleh server). db_Menu: `OPS_PENUGASAN_TIM` aktif = FALSE, `OPS_PENERUSAN_WO` nama = "Penerusan Tim Temuan Inspeksi" (baris `sejak_versi` 1.0.19 di docs/db_Menu.tsv). `ADMIN_bersihkanCache`.
Baru (tanpa menu, semua akun bersesi; isi dibatasi menu sesi di fungsi):
- `getNotifikasi {}` -> `{belum, item[{kunci, jenis P0|TEMUAN|WO, judul, rincian, waktu, dilihat, tujuan{menu, tanggal?|temuanId?}}]}`. Admin: P0 Menunggu approval (menu OPS_VERIFIKASI_P0) + temuan sumber INSPEKSI (menu OPS_INPUT_TEMUAN / OPS_PENERUSAN_WO). PETUGAS ber-menu OPS_WO_TIM: WO TERKIRIM ke timnya (kunci = temuan + waktu diteruskan, dikirim ulang = item baru). 14 hari terakhir, maks 100.
- `tandaiNotifikasi {kunci: 'k1|k2' | semua: true}` -> `{ditandai, belum}`. Kunci di luar daftar akun diabaikan, idempoten. Disimpan SiSi_Auth `log_Notif_Dilihat` (dibuat otomatis).
- `getUpdateApp {versiApp}` -> `{tersedia: false[, versi]}` | `{tersedia: true, apk{versi, nama, fileId, ukuranByte, sha256, url}}` (APK versi tertinggi di APK_FOLDER_ID yang lebih baru dari versiApp; cache 10 menit). Tidak ditolak WAJIB_VERSI_APP.
Foto temuan (Drive privat lewat server, {temuanId, slot TEMUAN|TIANG, ukuran KECIL|PENUH} -> {temuanId, slot, mime, kecil, ukuranByte, data}):
- `getFotoTemuanInspeksi` (OPS_INPUT_TEMUAN, admin, semua temuan), `getFotoTemuanInsJar` (OPS_INSJAR_INPUT, temuan tim sendiri), `getFotoTemuanInsDu` (OPS_INSDU_INPUT, temuan tim sendiri). Error: FOTO_TIDAK_ADA, BUKAN_MILIK_TIM, DATA_TIDAK_DITEMUKAN.
- `getTemuanInspeksi {dari, sampai}` + `urutanSection[{nama, section[]}]` (urutan section db_Jaringan per penyulang).
