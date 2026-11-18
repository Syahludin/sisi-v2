# C4A: Laporan C4A + sinkron ke file UIW

Tanggal: 14 Nov 2026 · Status: rancangan, menunggu persetujuan Master Guswan

## 1. Maksud dan alasan

Unit Induk Wilayah (UIW) punya database inspeksi sendiri berupa file **`Template_Inspeksi.xlsx`** di Google Drive
(file Excel, bukan Google Sheet; ID `1u9IOS80PHknKXB2nbeKOnI2CIha7A0Ns`). File itu dibaca UIW lewat tiga jalan: dibuka
langsung sebagai Excel, ditarik ke dashboard wilayah, dan lewat aplikasi AppSheet. Unit lain menginput lewat AppSheet
yang disediakan wilayah. AppSheet versi gratis sewaktu-waktu bisa diblokir, dan itu akan menghentikan pekerjaan.

Master Guswan punya database sendiri di SiSi v2 (`db_temuan_inspeksi` di spreadsheet SiSi_Temuan, `TEMUAN_SHEET_ID`).

Tujuannya: **admin menginput satu kali dari HP di SiSi v2**, lalu data otomatis juga masuk ke file UIW, sehingga
pekerjaan tidak bergantung pada AppSheet. Prioritas utama: **input di HP cepat**, admin tidak menunggu pengiriman ke UIW.

## 2. Sasaran, bukan sasaran, anti-sasaran

**Sasaran**
- Menu "Temuan Inspeksi" berganti nama menjadi **C4A** dengan 3 tab: Laporan C4A, Daftar Temuan, Arsip C4A.
- Laporan C4A baru: titik awal, temuan, titik akhir, lalu jarak (kmS) dihitung otomatis menurut **jarak jalan**.
- Setiap Laporan C4A dan temuannya dikirim ke sheet **Inspeksi**, **Temuan**, dan **KMS** di file UIW,
  termasuk pembaruan saat WO tindak lanjut selesai dan penghapusan.
- Pengiriman tahan gagal: tidak ada data yang hilang, tidak ada baris ganda, dan perbaikan berjalan sendiri.

**Bukan sasaran**
- Sheet **Chart_Persentase**, **Filter**, dan **Daftar Kategori** di file UIW. Isinya diolah UIW, jadi SiSi v2 tidak menyentuhnya.
- Laporan tim inspeksi (InsJar, banyak penyulang per header). Fitur ini **hanya untuk user admin** (menu `OPS_INPUT_TEMUAN`).
- Notifikasi kegagalan ke siapa pun (lihat 7.4).
- Website admin. Tidak ada perubahan di sana dalam rancangan ini.

**Anti-sasaran** (gagal walaupun secara teknis berjalan)
- Admin harus menunggu di HP sampai data masuk ke UIW.
- File UIW rusak, berubah format, atau berganti ID file sehingga AppSheet/dashboard UIW tidak bisa membacanya lagi.
- Data UIW diam-diam tertinggal tanpa jejak yang bisa dilihat di SiSi v2.

## 3. Batasan

- File UIW tetap .xlsx. UIW tidak bisa mengubah formatnya. Master Guswan punya akses edit.
- **Hanya SiSi v2 yang menulis** ke file UIW ini. Unit lain memakai AppSheet wilayah dengan file mereka sendiri, bukan file ini,
  jadi mengganti isi file utuh tidak menimpa tulisan pihak lain.
- Batas "hari" (tutup otomatis, Arsip "sebelum hari ini") memakai zona **WIB (Asia/Jakarta)** di server (*panggilan saya*).
- Setiap baris yang ditulis harus berformat sama dengan baris tulisan AppSheet, karena AppSheet UIW tetap membacanya.
- Apps Script dibatasi sekitar 6 menit per eksekusi. Blob di atas sekitar 50 MB tidak bisa diproses.
- Pola SiSi v2 yang sudah ada tetap berlaku: struktur kolom dikunci (`STRUKTUR_BERUBAH`, disiapkan fungsi `ADMIN_siapkan…`),
  kolom audit (dibuat_oleh, diubah_oleh, timestamp, timestamp_update, revision), dan konfigurasi di Script Properties.

## 4. Alur di HP (menu C4A)

Mockup: `.superpowers/brainstorm/1039-1794672623/content/menu-c4a.html` (ringkasan di tab Laporan C4A sudah disetujui).

### 4.1 Tab Laporan C4A (pengganti tab Input Temuan)
1. Di atas: **ringkasan hari ini** dalam 3 kartu, yaitu jumlah temuan **Komponen / Peralatan / Pohon**, mengikuti kategori UIW dari `db_Jenis_Temuan`.
2. Admin membuat **Laporan C4A**: pilih **1 penyulang + 1 section**, lalu ambil **titik awal**, lalu simpan.
   Titik bisa diambil dari GPS atau **dipilih di peta seperti di Verifikasi Tiang** (`mobile/lib/features/tiang/pilih_titik_peta.dart`).
3. Setelah laporan tersimpan, tombol **+ Tambah Temuan** muncul. Tanpa laporan terbuka, temuan tidak bisa diinput.
4. Form temuan sama seperti form Input Temuan sekarang (dropdown jenis dari `db_Jenis_Temuan`, deskripsi, foto, koordinat).
   Penyulang dan section ikut laporan, tidak dipilih ulang.
5. Selesai C4A, admin mengambil **titik akhir** (GPS atau peta). Laporan ditutup, lalu jarak dihitung (bagian 6).

### 4.2 Aturan Laporan C4A
- Setiap akun admin hanya boleh punya **satu laporan terbuka**. Selama ada laporan terbuka, laporan baru tidak bisa dibuat.
- Laporan berlaku **satu hari**. Dalam hari yang sama, setelah titik akhir diambil, admin boleh membuat laporan baru, dan laporan itu menjadi baris baru.
- **Lupa ditutup:** saat hari berganti, laporan yang masih terbuka **ditutup otomatis** memakai **titik temuan terakhir** laporan itu sebagai titik akhir.
  *Panggilan saya:* kalau tidak ada temuan sama sekali, jaraknya 0. Laporan seperti ini diberi tanda `ditutup_otomatis`.
- **Dua perangkat, akun sama:** kalau HP kedua membuat laporan padahal akun itu sudah punya laporan terbuka, server menolak
  laporan HP kedua. HP kedua menghapus laporan lokalnya lalu menampilkan laporan yang sudah ada.
  *Panggilan saya (pencegahan hilang data):* temuan yang sempat diinput di HP kedua **dipindahkan** ke laporan yang ada, dan titik awal HP kedua dibuang.

### 4.3 Tab Daftar Temuan
Tetap seperti sekarang. *Panggilan saya:* label kategori UIW ditampilkan di setiap baris.

### 4.4 Tab Arsip C4A (baru)
- Isinya data C4A **sebelum hari ini**, dengan filter rentang tanggal.
- Satu kartu per hari, berisi jumlah per kategori (Komponen / Peralatan / Pohon). Kartu yang diketuk membuka **rincian temuan** hari itu.

## 5. Data di SiSi v2

### 5.1 `db_Jenis_Temuan` (SiSi_Master): tambah 3 kolom
Kolom baru untuk mencocokkan dengan Daftar Kategori UIW: **kode** (A1…C3), **kategori** (Komponen / Peralatan / Pohon),
dan **temuan** (nama temuan di UIW, misalnya Konduktor). Nama kolom ditentukan builder, dengan awalan `uiw_`. Dropdown di HP tetap menampilkan jenis dari `db_Jenis_Temuan`.

Daftar Kategori UIW saat ini:
A1 Konduktor, A2 Isolator Tarik, A3 Isolator Tumpu, A4 Breket, A5 Tiang, A6 Bending Wire (Komponen) ·
B1 ACR, B2 LBS, B3 FCO, B4 LA, B5 DS, B6 VT/CT (Peralatan) · C1 Rabas, C2 Tebang Sedang, C3 Tebang Besar (Pohon).

### 5.2 Spreadsheet SiSi_Temuan: tambah 2 sheet
1. **Sheet C4A (Laporan C4A / KMS).** Satu baris per Laporan C4A, kolomnya bergaya SiSi v2 (bukan gaya UIW). Pola mengikuti `insjar_header`:

   | Kelompok | Kolom |
   |---|---|
   | Nomor & kode | `nomor`, `kode_c4a` (`C4A-<ULP><YYMMDD><NNN>`) |
   | Waktu | `tanggal`, `hari` |
   | Lokasi kerja | `ulp`, `penyulang`, `section` |
   | Titik awal | `koordinat_awal`, `lat_awal`, `lng_awal`, `waktu_awal` |
   | Titik akhir | `koordinat_akhir`, `lat_akhir`, `lng_akhir`, `waktu_akhir`, `sumber_akhir` (GPS / PETA / TEMUAN_TERAKHIR) |
   | Jarak | `jarak_km`, `metode_jarak` (RUTE_JALAN / NOL), `status_jarak` (MENUNGGU / SELESAI / GAGAL) |
   | Status | `status` (TERBUKA / SELESAI), `ditutup_otomatis`, `jumlah_temuan` |
   | ID relasi | **`c4a_id`**, `section_id`, `user_id` |
   | Audit | `dibuat_oleh`, `waktu_perangkat`, `diubah_oleh`, `timestamp`, `timestamp_update`, `revision` |

   Data ini nanti menjadi data tambahan untuk laporan C4A UP3 dan C4A UIW, tapi itu fitur terpisah.
2. **Sheet Antrean UIW.** Satu baris per entitas yang dikirim ke UIW. Kolomnya: jenis (INSPEKSI / TEMUAN / KMS), kunci
   (`c4a_id` atau `uniqueid` temuan), `c4a_id` induk (untuk temuan), status kirim, **kolom bantu** (tahap yang gagal + alasan),
   jumlah percobaan, waktu percobaan terakhir, waktu terkirim, sidik isi terakhir yang terkirim (untuk mengenali perubahan), dan audit.

### 5.3 Kunci penghubung SiSi v2 dan UIW
`c4a_id` dan `uniqueid` berisi UNIQUEID **8 karakter hex** seperti AppSheet, dan **dibuat di HP** saat laporan atau temuan dibuat,
supaya tetap berfungsi saat offline. Kunci ini sekaligus mencegah baris dobel kalau HP mengirim ulang. Server memeriksa keunikannya:
kalau bentrok, simpan ditolak dan HP membuat kunci baru.

| SiSi v2 | File UIW |
|---|---|
| Sheet C4A `c4a_id` | KMS **id**, Inspeksi **InspeksiID** |
| `db_temuan_inspeksi.c4a_id` (induk) | Temuan **Inspeksi ID** |
| `db_temuan_inspeksi.uniqueid` | Temuan **Temuan ID** |

### 5.4 `db_temuan_inspeksi`
Temuan dari Laporan C4A tetap ditulis ke tabel ini seperti sekarang (`sumber = ADMIN`), dan **pola kode temuan admin
tetap seperti sekarang** (`PEG-<ULP><YYMMDD>001` → `-PNY.NNN` → `-TJR.NNN`). Ada dua kolom baru, `c4a_id` dan `uniqueid` (5.3),
ditambahkan lewat fungsi siapkan struktur yang sudah ada polanya. `temuan_id` yang sudah ada tetap dipertahankan.

## 6. Jarak C4A (jarak jalan)

Dipakai **cara A**: rute jalan dari layanan **Maps bawaan Apps Script** (DirectionFinder), dari titik awal ke titik akhir dengan
**titik temuan sebagai titik singgah** sesuai urutan waktu input. Perhitungan dilakukan **di server** setelah laporan ditutup,
jadi HP boleh offline. Kalau batas titik singgah terlampaui, titik singgah dipilih merata dari daftar temuan (*keputusan builder*).
Kalau rute tidak ditemukan atau kuota habis, jarak dicoba ulang di putaran berikutnya, dengan pola yang sama seperti antrean (bagian 7).
*Panggilan saya:* kolom metode jarak mencatat `RUTE_JALAN`, sedangkan `NOL` untuk laporan tanpa temuan.

## 7. Sinkron ke file UIW

### 7.1 Pengirim dan jadwal
*Panggilan saya:* pengirimnya adalah **Apps Script**, memakai akun Master Guswan yang punya akses edit.
Tidak lewat Hostinger, karena Hostinger memerlukan service account Google yang harus diberi akses oleh UIW.
Pengiriman di HP tetap di latar belakang seperti sekarang, jadi admin tidak ikut menunggu.

**Pemicu sekali jalan saat ada data** (pola `35_Gardu_HI.js` `jadwalkanSheetLamaHi_` / `ADMIN_pemicuSheetLamaHi`):
1. Setiap simpan yang mengubah data UIW (laporan dibuat atau ditutup, temuan disimpan, WO selesai) memanggil `jadwalkanSinkronUiw_()`.
   Fungsi ini keluar langsung kalau tanda `UIW_PEMICU` di Script Properties masih segar (kurang dari 10 menit). Kalau tidak, pemicu lama
   dengan handler yang sama dihapus, lalu dipasang `ScriptApp.newTrigger(...).timeBased().after(2 menit)`, dan tanda disimpan.
   Simpan beruntun hanya menghasilkan satu putaran.
2. Handler dibungkus `jalanPemicu_` (waktu tercatat di `73_Pemakaian`, ikut rem kuota, prioritas rendah). Handler menghapus pemicunya
   sendiri dan tandanya, menjalankan tahap 1–3, lalu memasang pemicu berikutnya kalau masih ada sisa: 2 menit kalau sisa karena batas waktu,
   dan makin panjang (5 / 15 / 60 menit) kalau sisa karena `GAGAL`. Kalau antrean kosong, tidak ada pemicu yang dipasang.
3. **Pemicu harian** sekitar 00.05 WIB: tutup otomatis laporan yang masih terbuka dari hari sebelumnya, lalu `jadwalkanSinkronUiw_()`
   kalau antrean masih berisi (jaring pengaman).

**Perkiraan kuota pemicu** (pemakaian sekarang ±15%/hari; angka diukur ulang di tugas uji pertama). Anggapan per hari: 3 laporan,
20 temuan, 10 pembaruan WO, ±30 foto. Satu putaran tulis file ±40 dtk, salin foto ±1,5 dtk/foto, rute Maps ±2 dtk/laporan,
sehingga totalnya **±7 menit/hari**. Untuk akun Gmail (90 mnt) ini menambah ±8% (total ±23%). Untuk Workspace (360 mnt) menambah ±2%.

### 7.2 Cara menulis ke .xlsx
Isi file .xlsx tidak bisa ditulis per sel, jadi isi file diganti utuh **sekali per putaran** untuk semua baris yang lolos.
**ID file harus tetap sama**: perbarui isi file yang ada, jangan membuat file baru, supaya AppSheet dan dashboard UIW tetap tersambung.
Teknik konversinya *keputusan builder* (misalnya: salin sebagai Google Sheet sementara, tulis, ekspor ke .xlsx, lalu perbarui isi file asli).
Syaratnya, sheet lain (Chart_Persentase, Filter, Daftar Kategori, rumus, format) harus utuh. Ini **wajib diuji dulu pada salinan file**.
*Panggilan saya:* uji ini menjadi **tugas pertama** dalam rencana (spike). Kalau konversi lewat Google Sheet merusak isi file,
pilihan cadangannya adalah pustaka xlsx JavaScript murni di Apps Script, dengan batas waktu di 7.5 tetap berlaku.

### 7.3 Pemetaan kolom
Penulisan berupa upsert berdasarkan kunci 5.3 (`c4a_id` / `uniqueid`): kalau ID sudah ada di file, baris diperbarui; kalau belum, baris ditambahkan.

**Inspeksi** (satu baris per Laporan C4A)
| Kolom UIW | Isi |
|---|---|
| InspeksiID | `c4a_id` |
| Tanggal | tanggal laporan |
| UP3 | Script Property `UIW_UP3` |
| ULP | ulp |
| Penyulang | penyulang |
| Section | **bagian awal section saja**: teks sebelum `" - "` (`ACR Palas - LBS Delas` menjadi `ACR Palas`). Tanpa `" - "`: nama utuh |
| Petugas | `db_Users.nama` milik admin pembuat laporan |

**Temuan** (satu baris per temuan)
| Kolom UIW | Isi |
|---|---|
| Temuan ID | `db_temuan_inspeksi.uniqueid` |
| Inspeksi ID | `db_temuan_inspeksi.c4a_id` |
| Kategori | dari kolom UIW `db_Jenis_Temuan` (lihat 9: kode atau teks) |
| Temuan Awal | nama temuan UIW dari `db_Jenis_Temuan` |
| Foto Awal | `Temuan_Images/<nama>.jpg`: foto temuan disalin ke folder `Temuan_Images` |
| Lokasi Awal | `lat, lng` temuan |
| Keterangan Awal | `deskripsi` |
| Tindak Lanjut | *panggilan saya:* nama pekerjaan dari baris tindak lanjut WO, digabung dengan koma (kosong selama belum selesai) |
| Status | `Open`; menjadi `Close` saat `status_wo = SELESAI` |
| Foto Akhir | `Temuan_Images/<nama>.jpg`: salinan foto sesudah dari tindak lanjut WO |
| Lokasi Akhir | koordinat tindak lanjut |
| Keterangan Akhir | catatan tindak lanjut |
| Tanggal Selesai | `waktu_selesai` |

**KMS** (satu baris per Laporan C4A yang sudah punya jarak)
| Kolom UIW | Isi |
|---|---|
| id | `c4a_id` (sama dengan InspeksiID) |
| UP3 / ULP / Penyulang / Section | sama seperti Inspeksi (section = bagian awal) |
| Panjang | jarak laporan (km) |

*Panggilan saya:* nama foto mengikuti pola AppSheet `<TemuanID>.<Kolom>.<waktu>.jpg`. Dari WO dengan banyak baris tindak lanjut, yang dipakai adalah foto sesudah, koordinat, dan catatan dari baris **terakhir**.
Format tanggal ditulis sebagai sel tanggal, dan lokasi sebagai `lat, lng`. Builder **mencocokkan format ini dengan isi asli AppSheet** kalau contoh berisi data tersedia.

**Penghapusan:** kalau temuan di SiSi v2 hilang (baris `db_temuan_inspeksi` tidak ada lagi tapi baris antreannya masih ada),
baris temuan di file UIW **ikut dihapus**, beserta fotonya di `Temuan_Images` (*panggilan saya*). Kalau sebuah Laporan C4A dihapus,
baris Inspeksi, KMS, dan semua temuannya ikut dihapus. Saat ini belum ada fitur hapus temuan admin di aplikasi, jadi penghapusan hanya terjadi kalau baris dihapus manual di spreadsheet.

### 7.4 Tahan gagal: kriteria pemeriksaan per putaran
Tidak ada notifikasi. Jejaknya hanya kolom status dan kolom bantu di sheet Antrean UIW (status antrean di tingkat file dicatat sekali, bukan per baris).
Status per baris: `ANTRE`, `MENUNGGU`, `GAGAL` (dicoba ulang otomatis, dengan jeda yang makin panjang), `PERLU_DATA` (diperiksa ulang setiap putaran
dan otomatis lolos begitu datanya dibenahi), `TERKIRIM`, `HAPUS`, dan `TERHAPUS`. Baris yang terkirim tetapi datanya berubah lagi
(status WO, tindak lanjut, data temuan) kembali menjadi `ANTRE`.

**Tahap 1: pemeriksaan awal (sekali per putaran; gagal = putaran berhenti, belum ada baris yang disentuh)**
1. Script Properties lengkap: `UIW_FILE_ID`, `UIW_FOTO_FOLDER_ID` (folder `Temuan_Images`), `UIW_UP3`.
2. File UIW bisa dibuka dan ditulis (akses masih ada, file tidak dihapus atau dipindah).
3. Folder `Temuan_Images` bisa ditulis.
4. Nama sheet dan judul kolom Inspeksi / Temuan / KMS sama persis dengan template (pola `STRUKTUR_BERUBAH`).
5. Ukuran file di bawah batas aman (*panggilan saya:* 40 MB).
6. Kunci proses didapat. Kalau ada putaran lain yang sedang berjalan, lewati tanpa dicatat sebagai gagal.

**Tahap 2: per baris (gagal hanya menandai baris itu)**
7. Jenis temuan sudah punya kode kategori UIW. Kalau belum: `PERLU_DATA · jenis "<nama>" belum dipetakan`.
8. Kolom wajib terisi (tanggal, penyulang, section, petugas, koordinat). Kalau belum: `PERLU_DATA · kolom <nama> kosong`.
9. Foto sudah terunggah dari HP. Kalau belum: `MENUNGGU`, bukan gagal.
10. Foto asli masih ada di Drive SiSi v2. Kalau tidak ada: `PERLU_DATA · foto asli hilang`.
11. Salin foto ke `Temuan_Images`. Kalau gagal: `GAGAL · salin foto`, dan kolom bantu mencatat tahap ini supaya putaran berikutnya hanya mengulang tahap yang gagal.
12. Laporan sudah punya jarak (khusus KMS). Kalau belum: `MENUNGGU`.

**Tahap 3: tulis dan unggah (satu kali untuk semua baris yang lolos)**
13. Salinan cadangan file dibuat sebelum isi diganti. Kalau gagal: putaran berhenti dan baris tetap `ANTRE`.
14. Unggah isi baru. Kalau gagal: baris tetap `ANTRE`.
15. Tandai `TERKIRIM`. Kalau penandaan ini gagal, tidak masalah, karena upsert berdasarkan ID membuat putaran berikutnya tidak menghasilkan baris ganda.

### 7.5 Batas waktu
Setiap putaran mencatat waktu mulai dan memakai batas aman di bawah 6 menit (*panggilan saya:* 4,5 menit).
Waktu untuk tahap 3 **dipesan lebih dulu**, diperkirakan dari durasi tahap 3 putaran sebelumnya ditambah cadangan.
Sebelum memproses setiap baris di tahap 2, sisa waktu dicek terhadap perkiraan waktu per baris (rata-rata putaran sebelumnya) ditambah pesanan tahap 3.
Kalau tidak cukup, pengambilan baris berhenti. Baris yang sudah lolos tetap ditulis, sedangkan sisanya tetap `ANTRE` dan diproses lebih dulu di putaran berikutnya.
Perkiraan waktu disimpan di Script Properties.

## 8. Diserahkan ke builder
- Nama kolom baru, kode menu/aksi baru, dan nomor versi.
- Teknik baca-tulis .xlsx (dengan syarat di 7.2 dan uji pada salinan).
- Detail tampilan, mengikuti desain Hijau Rimba yang sedang berjalan.
- Strategi titik singgah saat temuan melebihi batas DirectionFinder.
- Interval pemicu dan jadwal pemicu tutup otomatis.

## 9. Keputusan lanjutan (14 Nov 2026)
- **Tidak ada contoh file berisi data.** *Panggilan saya:* kolom Kategori diisi **teks** (Komponen / Peralatan / Pohon), dan
  Temuan Awal diisi **teks** nama temuan (Konduktor, …). Alasannya, bentuk Daftar Kategori (Kode, Kategori, Temuan) cocok dengan
  pola dropdown berjenjang AppSheet, yaitu Kategori dulu, lalu Temuan yang disaring menurut Kategori. Format lain mengikuti 7.3.
- **Data lama tidak dikirim.** Hanya temuan dari Laporan C4A baru yang masuk antrean UIW. Tidak ada migrasi.
- **KMS ke `lap_C4A_UP3` / `lap_C4A_UIW` dibahas di fitur terpisah.** Di luar rancangan ini; sheet KMS cukup tersedia.
