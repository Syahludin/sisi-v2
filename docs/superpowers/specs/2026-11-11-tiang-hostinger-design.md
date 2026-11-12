# Modul Tiang pindah ke Hostinger (MySQL) + perbaikan lapangan: rancangan

Tanggal: 11 Nov 2026. Pemohon: Master Guswan (admin ULP Toboali). Status: DRAFT menunggu persetujuan. Belum ada kode.

## 1. Maksud dan alasan

Master Guswan sudah mencoba verifikasi tiang langsung di lapangan. Kendala yang ditemukan: (1) data sering tertolak, (2) foto sering hilang, (3) pilihan titik (GPS / titik terdaftar) sering "terseret" sehingga isian tidak lengkap. Kendala terbesar secara umum: **kecepatan input, pembacaan, dan data yang tampil**.

Yang diinginkan (kata Master Guswan): setelah petugas menekan Simpan, data cepat tersimpan di server, petugas tidak menunggu lama, dan data langsung menjadi data terbaru (daftar jalur, peta, web admin).

Penyebab kelambatan sekarang: Apps Script membaca sheet utuh tiap panggilan, menulis ulang blok sheet di bawah kunci global (`denganLock_`), foto berpindah HP → Apps Script → Drive, dan data baru baru terlihat setelah antrean selesai.

## 2. Keputusan Master Guswan (pegangan, bukan usulan)

1. Mulai dari **modul tiang saja**. Modul lain (WO, gudang, absensi, laporan, dll.) tetap di Apps Script.
2. **Seluruh data modul tiang pindah ke Hostinger** (MySQL), termasuk master (konstruksi, ukuran tiang, pemetaan, switching, segmen).
3. Google Sheets (SiSi_Tiang) menjadi **salinan**. Apps Script punya fungsi **menarik** data dari Hostinger ke spreadsheet. Arah satu sisi.
4. **Simpan langsung ke server** bila bisa. Tidak perlu antrean lokal sebagai jalur utama.
5. **Foto disimpan di Hostinger, Drive jadi arsip.** Foto terbesar sekarang sekitar 500 KB.
6. **Login: Apps Script menerbitkan tiket bertanda tangan**, Hostinger memeriksa tanda tangan sendiri (cara 2).
7. Satu tiang hanya dikerjakan satu petugas; tiap tim memegang penyulang berbeda. Sinyal di titik kerja jarang bermasalah.

## 3. Tujuan, bukan-tujuan, anti-tujuan

Tujuan:
- Simpan satu tiang (data + 2 foto) terasa selesai dalam sekitar 1–2 detik pada sinyal normal.
- Daftar jalur, peta Master Jaringan, dan web admin menampilkan data terbaru segera setelah tersimpan.
- Data tertolak turun tajam; yang tertolak punya pesan jelas dan lengkap (semua masalah sekaligus, bukan satu-satu).
- Tidak ada tiang hijau tanpa foto. Foto dan data satu paket.
- Pilihan koordinat tidak terhapus tanpa disengaja.

Bukan-tujuan: memindahkan modul lain; mengganti aplikasi HP; memindahkan arsip foto lama modul lain; layar edit master yang canggih (lihat 11).

Anti-tujuan (dianggap gagal walau tampak jalan): data lapangan hilang karena gagal kirim; dua sumber data saling menimpa; kunci rahasia atau sandi database ikut kode atau chat; data tiang basi karena cache CDN; aturan validasi lebih longgar dari Apps Script tanpa keputusan tertulis.

## 4. Batasan

- Paket Premium Web Hosting: PHP 8.3 (tersedia sampai 8.5), MySQL, 20 GB SSD, 400.000 inode, tanpa Node.js, tanpa SSH yang terkonfirmasi. `exec`, `shell_exec`, `proc_open`, `system`, `popen` dimatikan: cadangan database ditulis dengan PHP biasa (query), bukan `mysqldump`.
- Ekstensi aktif: `pdo_mysql`, `curl`, `openssl`, `gd`, `imagick`, `mbstring`, `zip`, `json`. `sodium` mati.
- Batas PHP: memori 1536M, `max_execution_time` 360 dtk. CDN Hostinger menyala; cache server mati. SSL aktif (berlaku sampai 24 Jan 2027).
- Dua database ada: `u832253372_sisi_staging` (21 MB) dan `u832253372_sisi_deploy` (28 MB). Host dari aplikasi: `127.0.0.1:3306`. Database `ggn_*`, `jawaban`, `sinkron_info` milik API baca yang sudah ada: tabel tiang memakai awalan `tiang_` supaya tidak bertabrakan.
- Sudah ada fondasi di repo yang dipakai ulang: `hosting/sisi-api/` (`_lib.php`: tiket HMAC `X-SiSi-Tiket`, tanda Apps Script `X-SiSi-Tanda`, konfigurasi di luar `public_html`, `db()` PDO, `jalankan()`), dan `backend/src/modules/93_Mysql.js` (`getTiketApi_`, `MYSQL_API_SECRET`).
- Aturan proyek: production tidak dideploy tanpa perintah; `VERSI_APP_MINIMUM=1.0.69`, `WAJIB_VERSI_APP=YA`; `VERSI_BACKEND_` tetap 1.0.69; jangan commit tanpa diminta; sebut "Master Guswan".

## 5. Arsitektur

```
HP (APK) ──login/tiket──▶ Apps Script (hanya login, tiket, ping)
HP (APK) ──data+foto────▶ Hostinger  sisi-api/tiang.php  (PHP + MySQL)   ← jalur utama
Web admin ──baca────────▶ Hostinger  (tiket yang sama)
Apps Script ──tarik─────▶ Hostinger  ekspor.php  (tanda HMAC) → tab Sheet (salinan) + foto → Drive (arsip)
```

Satu pintu `tiang.php` menerima `POST {action, data}` dengan header `X-SiSi-Tiket`. Nama action dan bentuk jawaban **sama dengan kontrak sekarang** (`getVerifikasiTiang`, `getTiangJalur`, `getPetaTiang`, `getSegmen`, `getMasterSwitching`, `simpanVerifikasiTiang`, `simpanSegmen`, `simpanSwitching`, `getFotoTiang`, `getFotoSwitching`), supaya perubahan di HP kecil. Kode galat (`kode`) sama dengan yang dipetakan `KodeError` di HP.

HP mendapat alamat API tiang dari `ping` (`versi.tiangApi`). Kosong = jalur Apps Script lama. Ini juga jalur **mundur** (lihat 10).

## 6. Login: tiket

- `getTiketApi` diperluas untuk MOBILE: `{u: userId, role, m: [menu yang boleh], t: [menu yang boleh ubah], env, exp}`, bertanda HMAC dengan `MYSQL_API_SECRET` (rahasia berbeda staging / production, minimal 32 karakter, sudah dipakai pola ini).
- Masa berlaku tiket MOBILE: **8 jam** (keputusan Master Guswan: cara 2). Tiket web tetap pendek. HP meminta tiket baru ke Apps Script saat tersisa kurang dari 30 menit dan online; kegagalan meminta tiket tidak memutus kerja (tiket lama masih sah sampai `exp`).
- `tiang.php` memeriksa: tanda tangan, `env`, `exp`, menu, dan hak ubah (`t`) untuk action tulis. Role yang boleh: sama dengan `wajibAdminTiang_` sekarang (ADMIN / SUPER).
- Konsekuensi yang diterima: akun yang dinonaktifkan tetap diterima Hostinger sampai tiketnya habis (maks 8 jam). **Pilihan saya:** tabel kecil `tiang_cabut(user_id, sejak)` yang diisi Apps Script saat akun dinonaktifkan; `tiang.php` menolak tiket milik user yang tercabut.

## 7. Model data (MySQL)

Nama tabel dan kolom **sama dengan header sheet** sekarang supaya ekspor ke Sheet 1:1 dan migrasi mekanis:

| Tabel MySQL | Sheet asal | Catatan |
|---|---|---|
| `tiang_tiang` | `db_Tiang` | kunci `tiang_id VARCHAR(40)` (id aset berupa angka panjang: JANGAN INT) |
| `tiang_sirkuit` | `db_Tiang_Sirkuit` | `INDEX (tiang_id)`, `INDEX (penyulang)`, `INDEX (induk_tiang_id)` |
| `tiang_segmen` | `db_Segmen` | |
| `tiang_switching` | `db_Switching` | |
| `tiang_jaringan` | `db_Jaringan` (SiSi_Master) | **ditambah 11 Nov (Task 2):** penyulang + section; dibaca `getSegmen`, `getMasterSwitching`, dan validasi simpan |
| `tiang_konstruksi`, `tiang_ukuran`, `tiang_pemetaan` | `db_Konstruksi`, `db_Ukuran_Tiang`, `db_Tiang_Pemetaan` | master |
| (kolom `urut` di semua tabel di atas) | kolom `No` sheet | **ditambah 11 Nov (Task 2):** urutan baris sheet menentukan urutan tiang dalam jalur; baris baru = urut terbesar + 1 |
| `tiang_foto` | kolom `foto_*_id` | `tiang_id, slot, path, sha256, bytes, drive_file_id, diarsip_pada` |
| `tiang_op` | cache 6 jam `sinkronTiang:` | `op_id` kunci unik, hasil JSON: kirim ulang tidak membuat data ganda (permanen, bukan 6 jam) |
| `tiang_audit` | `log_Audit` (TIANG_*) | siapa, kapan, apa; juga ditulis ke `log_Audit` lewat tarik |
| `tiang_cabut` | – | lihat 6 |

- Waktu disimpan sebagai `DATETIME(3)` UTC; ekspor ke Sheet memakai teks ISO seperti sekarang.
- `revision` tetap ada dan naik tiap tulis (dipakai tarik inkremental dan layar admin). **Foto tidak menaikkan `revision` data**; foto punya `foto_rev` sendiri (memperbaiki penyebab tertolak, bagian 8.1).
- Tulis memakai transaksi InnoDB per tiang (`SELECT … FOR UPDATE` pada baris tiang). **Tidak ada kunci global.**
- Aturan validasi dan bisnis di `99_Verifikasi_Tiang.js`, `98_Segmen.js`, `96_Master_Switching.js`, `95_Tiang_Master.js` **dipindah apa adanya** ke PHP (toleransi 10 m, dasar koordinat, kelengkapan wajib, posisi penyulang tidak kembar, induk dan switching, status). Tidak ada pelonggaran selain yang tertulis di 8.

## 8. Penyebab masalah lapangan (ditemukan di kode) dan perbaikannya

Master Guswan memilih **mengubah alur kerja**, bukan menambal celah satu per satu (11 Nov). Bagian ini mencatat penyebabnya; alur barunya di bagian 9 yang menghilangkan keadaan-keadaan di tengah tempat masalah itu bersembunyi.

### 8.1 Data sering tertolak
- (a) Unggah foto menaikkan `revision` tiang, sehingga simpan berikutnya dengan revisi lama ditolak `KONFLIK_REVISION`; (b) server berhenti di galat pertama dan pesannya berupa kode mentah.
- Laporan 11 Nov: tiang yang baru pertama kali diisi "tertolak"; baris menawarkan Perbaiki Isian / Kirim Ulang / Buang Perubahan. **Dugaan kuat (terbukti di 8.2):** yang gagal bukan data, melainkan unggah foto sesudah data diterima.
- Perbaikan: simpan dari HP **tidak memeriksa `revision`** (satu tiang satu petugas; pemeriksaan revisi dipertahankan untuk layar admin / web). Foto tidak menaikkan `revision` data. Validasi mengumpulkan **semua** masalah sekaligus sebagai daftar `[{field, pesan}]`, dalam bahasa Indonesia yang menyebut isian, bukan kode.

### 8.2 Foto sering hilang (terbukti di kode)
- Urutan sekarang: data tiang diterima server (hijau Terverifikasi) → foto dikirim terpisah → unggah foto gagal → baris ditandai "Ditolak Server" → petugas menekan **Buang Perubahan** → `AntreanTiang.buang` tidak memulihkan tiang (data sudah di server) tetapi **menghapus foto lokal** → tiang tetap Terverifikasi **tanpa foto**, tanpa peringatan.
- Penyebab gagalnya unggah foto belum diketahui (pesan merah di lembar "Ditolak Server" diminta dari Master Guswan). Alur baru tidak bergantung pada jawabannya, karena foto tidak lagi dikirim terpisah.
- Perbaikan: data dan foto satu paket, atomik (bagian 9); server menolak Terverifikasi tanpa dua foto; tidak ada aksi yang menghapus foto tanpa konfirmasi eksplisit.

### 8.3 Titik tereset
- Penyebab (`tiang_form_screen.dart`): setiap koordinat berubah (tekan GPS ulang, GPS memperbarui hasil, ketik, pilih peta) `dasarKoordinat` dikosongkan, sehingga pilihan "Koordinat Terdaftar / Koordinat GPS" kembali kosong dan form dianggap belum lengkap. (Master Guswan: kata "terseret" yang dimaksud adalah "tereset".)
- Perbaikan: `dasarKoordinat` **dipertahankan** selama selisih terhadap koordinat terdaftar tetap di atas toleransi (10 m); dibuang hanya bila selisih turun ke ≤ 10 m, dan diminta lagi bila naik di atas 10 m. Koordinat GPS yang sudah diterima petugas **dikunci**; berubah hanya lewat "Ambil Ulang" atau "Pilih di Peta" yang menanyakan konfirmasi.

## 9. Alur kerja baru: satu tiang = satu paket, semua atau tidak sama sekali

Disetujui Master Guswan 11 Nov. Menggantikan antrean `AntreanTiang` (menunggu kirim, sedang dikirim, ditolak, kelompok 25 entri, DITUNDA, Buang Perubahan, foto terpisah).

1. **Mengisi.** Isian tersimpan otomatis sebagai **draf** di HP selama petugas mengisi (pengaman bila aplikasi tertutup). Draf bukan antrean kirim. Foto yang diambil disimpan sebagai berkas di folder aplikasi dan dicatat di draf.
2. **Simpan = kirim satu paket** ke `tiang.php`: data + foto yang baru/diganti (+ foto lama yang sudah di server tidak dikirim ulang). Layar "Menyimpan…" sekitar 1–2 detik; batas waktu sekitar 30 detik. `opId` tetap sama selama draf yang sama (kirim ulang tidak membuat data ganda; `tiang_op`).
3. **Server atomik.** Satu transaksi: berkas foto ditulis, baris DB di-commit, gagal = berkas dihapus dan tidak ada yang berubah. **Tidak pernah ada tiang Terverifikasi tanpa dua foto**: status Terverifikasi tanpa foto lengkap (foto lama + baru) ditolak server.
4. **Hasil hanya tiga:**
   - **Terkirim.** Server mengembalikan objek tiang terbaru; HP memperbarui salinan lokal dan menampilkan kartu "Data Tersimpan"; draf dihapus; foto lokal dihapus hanya sesudah jawaban memuat `sha256` yang cocok.
   - **Ditolak validasi.** Petugas tetap di form dengan daftar semua isian yang salah (bergulir ke yang pertama). Isian dan foto tidak hilang. Bila penolakan terjadi pada kirim otomatis latar belakang (draf lama), draf tampil **"Draf perlu diperbaiki"** dengan alasannya dan tombol **Perbaiki Isian**.
   - **Belum terkirim** (tidak ada sinyal / waktu habis). Tiang tetap sebagai **draf lengkap (data + foto)** dengan tombol **Kirim Ulang**.
5. **Tidak ada tombol yang menghapus diam-diam.** Satu-satunya jalan membuang adalah **Hapus Draf** dengan konfirmasi yang menyebut bahwa foto ikut terhapus. Draf tidak dihapus oleh sinkron, pembaruan versi, atau logout (logout dengan draf tersisa ditahan seperti sekarang).
6. **Tanpa sinyal.** Petugas boleh lanjut ke tiang berikutnya. Draf dikirim otomatis **berurutan (FIFO)** saat sinyal kembali. Draf yang tiang induknya (id sementara `LOKAL-…`) belum terkirim menunggu induknya.
7. **Tampilan di daftar jalur.** Tiang yang punya draf tampil dengan **ikon awan coret dan teks "Draf, belum terkirim"** (atau "Draf perlu diperbaiki"), **tidak hijau dan tidak dihitung ke progres jalur** sampai terkirim. Tidak ada baris abu-abu yang tidak bisa dibuka; selama kirim berlangsung (1–2 detik) hanya muncul penanda putar kecil.
8. **Segmen** memakai pola yang sama (`simpanSegmen`, draf per segmen). **Switching** tetap simpan langsung (sudah online-only), dengan foto dalam satu paket.
9. **Kode HP:** `AntreanTiang` (424 baris) diganti `DrafTiang` yang jauh lebih kecil (satu berkas draf per tiang + pengirim FIFO). Cadangan berkas yang sudah ada tetap dipakai sebagai tempat draf, ditulis tmp+rename.

## 10. Foto

- Disimpan di Hostinger di luar `public_html` (atau di dalam dengan `.htaccess` `Require all denied`); disajikan hanya lewat `tiang.php?getFotoTiang` dengan tiket. Nama berkas = `<tiang_id>_<slot>_<sha256-8>.jpg`; jalur berfolder per jalur untuk menjaga jumlah berkas per folder.
- Server memeriksa JPEG, ukuran, dan `sha256`; memperkecil bila lebih dari batas sisi panjang (pilihan saya: 1600 px) lalu menyimpan thumbnail 320 px.
- Perkiraan ruang: 1500 tiang × 2 foto × ≤ 500 KB ≈ 1,5 GB (7–8% dari 20 GB). Pemantauan ruang: peringatan ke Master Guswan bila pemakaian foto > 60% kuota. **Pilihan saya: foto TIDAK dihapus dari Hostinger** selama di bawah ambang itu (lebih sederhana; Drive tetap arsip).
- **Arsip ke Drive (tarik, bukan dorong):** Apps Script terjadwal memanggil `ekspor.php?foto_belum_diarsip` (tanda HMAC), mengunduh tiap foto, menyimpannya di `TIANG_FOTO_FOLDER_ID` dengan struktur folder seperti sekarang, lalu memanggil `ekspor.php?tandai_arsip` dengan `drive_file_id`. Semua kredensial Google tetap di Apps Script; Hostinger tidak menyimpan kunci Google.

## 11. Google Sheets sebagai salinan (tarik)

- Fungsi Apps Script `ADMIN_tarikDataTiang` memanggil `ekspor.php?tabel=<nama>&setelah=<revision/waktu>` (tanda HMAC), menulis ke tab yang **sama dengan sekarang** (header tidak berubah), terjadwal malam hari dan bisa dijalankan manual. Inkremental per `revision` / `diubah_pada`; penuh bila diminta.
- Tab bertanda "SALINAN - jangan diedit" (baris catatan di `Properti`/judul tab). Perubahan di Sheet **tidak** masuk ke MySQL.
- Fungsi ini sekaligus menjadi **cadangan kedua** data.

## 12. Migrasi dan peluncuran

Tahap (tiap tahap bisa diuji sebelum lanjut):
1. **Fondasi:** skema MySQL, `tiang.php` kerangka, tiket MOBILE, konfigurasi staging (`sisi-api-staging`, `u832253372_sisi_staging`).
2. **Baca:** semua action baca, uji bentuk jawaban = Apps Script.
3. **Tulis + foto:** `simpanVerifikasiTiang`, `simpanSegmen`, `simpanSwitching`, upload dalam satu paket, idempotensi.
4. **HP:** klien API kedua (alamat dari `ping`), alur satu paket + `DrafTiang` (bagian 9) menggantikan `AntreanTiang`, tiga perbaikan form.
5. **Tarik / arsip / cadangan:** `ADMIN_tarikDataTiang`, arsip foto, cron cadangan harian (skrip PHP menulis dump `.sql.gz` ke luar `public_html`, simpan 14 hari; dibuat lewat cron Hostinger; pembersihan ruang).
6. **Impor data awal:** Apps Script mendorong isi sheet SiSi_Tiang + SiSi_Master (tab tiang) ke `impor.php` (tanda HMAC, upsert idempotent, bisa diulang); foto lama dari Drive ke Hostinger bertahap (tiap proses ada batas waktu, bisa dilanjutkan). Data staging dahulu, dibandingkan jumlah baris dan contoh tiang dengan sheet.
7. **Staging di lapangan:** APK staging memakai Hostinger. Production hanya setelah staging terbukti.
8. **Cutover production:** (a) bekukan tulis di Apps Script (action tulis tiang menjawab `PINDAH_HOSTINGER`), (b) impor penuh terakhir, (c) set `tiangApi` di `ping` production, (d) pantau.

**Jalur mundur:** kosongkan `tiangApi` di `ping` → HP kembali ke Apps Script. Data yang ditulis di MySQL setelah cutover tidak otomatis kembali ke Sheet; karena itu `ADMIN_tarikDataTiang` penuh dijalankan sebelum mundur, dan keputusan mundur diambil Master Guswan.

## 13. Keamanan

- HTTPS saja; semua jawaban `Cache-Control: no-store` (CDN Hostinger menyala: pastikan jalur API tidak di-cache, dibuktikan dengan uji dua pembacaan berurutan sesudah tulis).
- Konfigurasi dan sandi database **di luar `public_html`** (pola `sisi-api-config.php` sekarang). Tidak ada rahasia di kode, repo, atau chat.
- Semua kueri berparameter (PDO prepared). Validasi masukan di server sama ketatnya dengan Apps Script; ukuran badan permintaan dibatasi (sekitar 6 MB (data + 2 foto)).
- Pembatasan laju per `user_id` (tabel kecil, mis. 120 permintaan/menit) dan batas ukuran foto; galat tak terduga = 500 tanpa detail ke klien.
- Endpoint `impor.php` dan `ekspor.php` hanya menerima tanda HMAC Apps Script (selisih waktu ≤ 5 menit), bukan tiket pengguna.

## 14. Pengujian

- Uji PHP dengan SQLite (pola uji lokal API baca yang ada) + uji skema MySQL di staging.
- **Uji kesetaraan:** fixture JSON (masukan → jawaban / galat) dari tes `tests/verifikasiTiang.test.js`, `tests/sinkronTiang.test.js`, dll. dijalankan terhadap implementasi PHP; hasil harus sama, kecuali perbedaan yang tertulis di 8.
- Uji baru: foto tidak menaikkan revisi; semua galat validasi terkumpul; TERVERIFIKASI tanpa foto ditolak; paket gagal di tengah tidak meninggalkan data atau berkas; kirim ulang `opId` sama tidak ganda; berkas foto lokal hilang → galat terlihat, bukan dianggap terkirim; Hapus Draf meminta konfirmasi dan draf tidak hilang oleh sinkron / logout; urutan FIFO dan induk `LOKAL-…` menunggu; `dasarKoordinat` bertahan saat koordinat berubah.
- Uji beban ringan: 25 simpan berurutan + 2 pembaca bersamaan, waktu respons dicatat.
- Uji HP (staging) oleh Master Guswan di lapangan sebelum production.

## 15. Risiko

- Hosting bersama: sumber daya dibagi; beban tiang kecil tetapi perlu dipantau (waktu respons dicatat di `tiang_audit`).
- Hostinger mati = tulis ke server gagal; draf lokal (data + foto) menahan data sampai pulih (anti-tujuan "data hilang" tetap terjaga).
- Tiket 8 jam: akun dinonaktifkan masih diterima sampai habis (dimitigasi `tiang_cabut`).
- Dua sistem selama masa peralihan; risiko salah baca sumber. Mitigasi: tahap 8(a) membekukan tulis lama.
- Aturan bisnis dipindah ke bahasa lain; risiko perbedaan perilaku. Mitigasi: uji kesetaraan (14).
- Foto lama modul tiang harus dipindah dari Drive; bergantung batas waktu Apps Script per proses.

## 16. Keputusan saya (mohon diperiksa Master Guswan)

1. Nama tabel mengikuti nama tab sheet dengan awalan `tiang_` (agar 1:1 dan tidak bertabrakan dengan tabel API baca).
2. Satu pintu `tiang.php` dengan `{action, data}` (bukan banyak berkas), meniru kontrak sekarang.
3. `tiang_cabut` untuk mencabut tiket akun yang dinonaktifkan.
4. Foto tidak dihapus dari Hostinger di bawah ambang 60%; sisi panjang maks 1600 px; thumbnail 320 px.
5. Foto dikirim sebagai base64 dalam satu permintaan bersama data (bukan multipart).
6. Masa tiket MOBILE 8 jam, diperbarui saat tersisa < 30 menit.
7. Simpan dari HP tanpa pemeriksaan `revision`; layar admin tetap memeriksa.
8. Cadangan harian lewat cron PHP (tanpa `mysqldump`), simpan 14 hari.
9. Penolakan validasi pada kirim latar belakang tampil sebagai "Draf perlu diperbaiki" (selain "Draf, belum terkirim" yang disetujui).

## 17. Belum diputuskan / perlu Master Guswan

- **Master (konstruksi, ukuran tiang, pemetaan): DIPUTUSKAN 11 Nov (Master Guswan)** semua data awal, termasuk master, **diimpor dari spreadsheet**: database dibuat dulu, lalu Apps Script mengirim isi sheet ke Hostinger (`impor.php`, tanda HMAC, upsert idempotent, bisa diulang). Layar edit master di web admin menyusul sebagai pekerjaan terpisah; sampai itu ada, tiga tab master boleh diimpor ulang dari Sheet.
- **Database production: terbukti 11 Nov (daftar tabel dari Master Guswan).** `u832253372_sisi_deploy` berisi `ggn_ar`, `ggn_penyulang`, `ggn_pickup`, `jawaban`, `jawaban_hapus`, `sinkron_info` = API baca yang sudah berjalan (production). Tabel tiang dibuat di database yang sama (production = `sisi_deploy`, staging = `sisi_staging`) dengan awalan `tiang_`; tidak ada database baru.
- **CDN:** apakah jalur `sisi-api*` perlu dikecualikan dari CDN di hPanel (diuji, bukan ditebak).
- **Contoh tiang tertolak:** teks merah di baris tiang pada daftar jalur (bagian 8.1) untuk mengonfirmasi penyebab.
- **Cron di hPanel:** tersedia lewat konektor (`hosting_cron-jobs`), saat ini kosong.

## 18. Diserahkan ke pembangun

Struktur berkas PHP di dalam `hosting/sisi-api/`; pustaka kecil bersama untuk validasi dan galat; tipe kolom MySQL yang tepat dan indeks; urutan migrasi per tabel; format respons `ekspor.php`; teks pesan galat; penjadwalan pemicu Apps Script; ukuran lot impor foto.
