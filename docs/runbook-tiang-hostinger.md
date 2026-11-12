# Runbook: modul tiang di Hostinger

Rujukan: `docs/superpowers/specs/2026-11-11-tiang-hostinger-design.md`, `docs/superpowers/plans/2026-11-11-tiang-hostinger.md`.
Berlaku sama untuk staging (`sisi-api-staging`, db `u832253372_sisi_staging`) dan production (`sisi-api`, db `u832253372_sisi_deploy`). Production hanya atas perintah Master Guswan.

## A. Prasyarat (semua wajib sebelum cutover production)
1. Staging terbukti: API terunggah, tabel `tiang_*` terbuat (`status.php`), impor sheet + foto cocok jumlah barisnya, uji CDN lulus (baca sesudah simpan tidak basi), uji lapangan HP lulus (tiang baru, edit, tanpa sinyal lalu kembali, hapus draf, pilihan titik).
2. `config.php` production di luar `public_html`: kredensial db, `foto_dir`, `cadangan_dir`, `MYSQL_API_SECRET` yang sama dengan Script Property Apps Script.
3. Cron cadangan harian terpasang (`php <path>/cadangan.php`, tanpa pipa / redireksi) dan `ADMIN_pasangPemicuTiang` sudah dijalankan.
4. `ADMIN_siapkanSheetTiang` sudah dijalankan; spreadsheet SiSi_Tiang disalin manual sebagai cadangan.
5. Zip API terbaru diunggah ke `sisi-api`, `.htaccess` ikut.

## B. Cutover (urutan tetap)
1. Beku: Script Property `TIANG_BEKU` tepatnya `TIANG_TULIS_BEKU=YA`. Petugas yang menyimpan mendapat `PINDAH_HOSTINGER`.
2. `ADMIN_imporTiangKeHostinger` (penuh, bisa dilanjut lewat `TIANG_IMPOR_KEMAJUAN`), lalu `ADMIN_imporFotoTiang` sampai selesai. Bandingkan jumlah baris tiap tab dengan Sheet dan 5 tiang contoh.
3. Deploy backend production (atas perintah "deploy production"); isi `TIANG_API_URL` (https). `VERSI_BACKEND_` tetap `1.0.69`; notifikasi update mengikuti `NOTIFIKASI_UPDATE_APP`.
4. Bangun dan bagikan APK production 1.0.76+250.

## C. Pantau dua hari
Waktu simpan, galat di `tiang_audit`, ruang foto (`ekspor.php` `ruang`, ambang `TIANG_FOTO_BATAS_MB`), umur cadangan (< 36 jam), draf "Ditolak" di HP petugas.

## D. Jalur mundur
1. `ADMIN_tarikDataTiang({paksa:true})` (Sheet disegarkan dari MySQL).
2. Kosongkan `TIANG_API_URL`.
3. Kosongkan `TIANG_TULIS_BEKU`.
HP tanpa alamat otomatis memakai Apps Script lama; draf yang belum terkirim tetap aman di HP.

## E. Pemulihan cadangan
`php cadangan.php pulihkan=tiang-YYYYMMDD.jsonl.gz --ya` (satu transaksi). Simpan 14 berkas terakhir.

## F. Master (konstruksi, ukuran, pemetaan, section, penyulang)
Tetap diedit di Sheet SiSi_Master; salinan MySQL diperbarui oleh pemicu jam (`imporMasterTiang_`) atau manual `ADMIN_imporTiangKeHostinger({tabel})`.
