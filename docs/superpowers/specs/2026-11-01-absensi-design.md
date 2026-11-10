# Rancangan fitur Absensi Safety Briefing (SiSi v2)

Tanggal: 1 Nov 2026. Status: menunggu persetujuan Master Guswan. Belum ada kode yang ditulis.

## Maksud

Setiap pagi, safety briefing diabsen seluruh staf. Saat ini hasilnya diketik manual di WhatsApp (lihat contoh di bawah)
lengkap dengan rekap bulanan per orang. Fitur ini memindahkan pencatatan itu ke SiSi (HP) supaya datanya tersimpan,
rekap bulanan dihitung otomatis, dan teks WhatsApp dibuat otomatis. Ini fitur tambahan di app Flutter + backend Apps Script
yang sudah ada, bukan sistem terpisah.

## Pengguna

- Pengabsen: koordinator (di sistem berperan `ADMIN_ES`) dan admin. Hanya mereka yang melihat menu dan datanya.
- Setiap pagi ada **dua** pengabsen di tempat berbeda. Mereka mengisi **staf yang berbeda** (tidak ada staf yang diisi dua orang
  secara normal), tapi **kedua HP menampilkan semua staf**.
- Staf yang diabsen tidak punya akses.

## Status (7 pilihan, satu per staf per hari)

| Simbol | Status | Alasan/keterangan |
| --- | --- | --- |
| ✅ | Hadir Tepat Waktu | tidak ada |
| *️⃣ | Hadir Telat | tidak ada |
| ❌ | Tidak Hadir Tanpa Keterangan | tidak ada |
| 📌 | Tidak Hadir dengan Keterangan | **wajib**, teks bebas (mis. "Mobil Masuk Bengkel") |
| 🇨🇭 | TMK, sakit dengan SKS | tidak ada |
| 🆓 | Cuti kerja | tidak ada |
| 🔤 | Izin tidak masuk kerja (sakit tanpa SKS, atau izin di luar izin resmi perusahaan) | **wajib**, teks bebas (mis. "Ada acara keluarga") |

Satu staf hanya boleh punya satu status per tanggal. "Belum diabsen" bukan status: itu keadaan tidak ada baris.

## Daftar staf dan tim

- Staf = baris `db_Petugas` (SiSi_Master). Saat ini hanya dipakai Yandal (kolom `tim_yandal`). Kolom itu **diganti nama menjadi
  `tim`**, berisi `tim_id` dari `db_Tim`, dan sekarang dipakai semua tim: Tim Row 1, Tim Row 3, Hartek, Inspeksi Gardu,
  Inspeksi Jaringan, Yandal 13, 14, 15, 16 (nama sesuai `db_Tim` yang ada).
- Nilai `tim` tiap petugas diisi Master Guswan sendiri. `ADMIN_lengkapiMaster` yang sudah ada memetakan nama tim ke `tim_id`
  (kini untuk semua tim, bukan hanya Yandal).
- Fitur **Pindah Tim Petugas** (`OPS_PETUGAS_YANDAL`, `getPetugasYandal` / `simpanPetugasYandal`) diperluas ke semua tim,
  dengan cara kerja yang sama seperti Yandal sekarang.
- Penggantian nama kolom menyentuh kode Yandal yang sudah berjalan: login, daftar petugas tim, arsip, laporan, migrasi,
  `ADMIN_lengkapiMaster`, header skema, dan tes. Perilaku Yandal tidak boleh berubah. Ini bagian berisiko dan wajib ada tes.
- Petugas nonaktif (`aktif` salah) tidak tampil di absensi hari-hari berikutnya; riwayat absensinya tetap ada.

## Data absensi

- Spreadsheet/tab sendiri, Script Property baru `ABSENSI_SHEET_ID`. Ikuti `CFG_JSON` yang sudah ada (v1.0.37): nama
  `ABSENSI_SHEET_ID` sudah cocok dengan `KONFIG_JSON_POLA_`, jadi cukup ditambahkan ke `cfg_()` dan dimasukkan ke `CFG_JSON`
  supaya Project Settings tidak bertambah penuh.
- Satu baris per staf per tanggal, kunci `tanggal + petugas_id`. Kolom (usulan, builder boleh menyesuaikan nama dengan
  pola tab lain): `tanggal`, `petugas_id`, `tim_id` (tim saat itu, disalin supaya riwayat tidak berubah kalau petugas pindah
  tim), `status`, `keterangan`, `diabsen_oleh`, `diabsen_pada`, `diubah_oleh`, `diubah_pada`, `revision`.
- Rekap bulanan **tidak disimpan**; dihitung dari baris harian.

## Pengisian di HP

- Menu baru di HP (`db_Menu` + `db_Akses`, hanya ADMIN_ES dan admin), mengikuti pola menu Operasi yang ada.
- Satu layar, semua staf dikelompokkan per tim. Tidak ada nilai awal: setiap staf dipilih satu per satu dari 7 status.
  Memilih 📌 atau 🔤 membuka isian alasan yang wajib diisi.
- Tombol Simpan **tetap aktif walau ada staf yang kosong**. Yang kosong dilewati, tidak ditulis, tidak dianggap hadir.
- Simpan hanya mengirim staf yang **dipilih pada sesi itu**. Layar yang sudah lama terbuka tidak boleh menimpa isian rekan.
- Saat layar dibuka atau dimuat ulang, status yang sudah diisi (oleh siapa pun) tampil, dengan nama pengisinya.
- Staf yang sudah diisi **orang lain** tidak bisa diubah: layar menampilkannya terkunci dan server menolak. Isian
  **sendiri** boleh diubah lagi kapan pun pada hari itu. Tidak ada konfirmasi menimpa.
- Penyimpanan di server harus aman terhadap dua penyimpanan bersamaan (pakai kunci/lock yang sudah ada di `05_Lock.js`).
- **Simpan bekerja di latar belakang seperti proses lain** (permintaan Master Guswan 1 Nov 2026): menekan Simpan langsung menutup
  layar, isian masuk antrean di HP (per akun) dan dikirim otomatis oleh SyncController (pola `AntreanTemuanAdmin`:
  app dibuka, tiap 5 menit, layanan latar saat app di belakang). Sinyal putus = antrean tetap, dikirim nanti. Item yang
  **ditolak server** (staf dikunci pengabsen lain, hari sudah lewat) ditandai galat dan terlihat di layar absensi,
  tidak diulang otomatis. Memuat layar (daftar staf + isian rekan) dan Salin teks tetap butuh sinyal.

## Hari lampau

Hanya absensi **hari berjalan** (tanggal WIB) yang bisa diisi dan diubah. Tanggal yang sudah lewat tidak bisa diisi
maupun dikoreksi, oleh siapa pun, lewat jalur apa pun (server menolak, bukan hanya HP menyembunyikan). Staf yang tidak
sempat diabsen hari itu tetap "belum diabsen" selamanya.

## Teks WhatsApp otomatis

Dibuat dari data, tombol "Salin teks" di HP. Format mengikuti contoh:

```
*Absensi kehadiran safety breafing Oktober 2026*
Kamis, 29 Oktober 2026
Pukul : 07.32 WIB
*Tim Row 1*
* Agus Adi Mulyono ✅
* Paltrada *️⃣1
* Haryanto *️⃣1 📌1 ✅
```

- Judul bulan dan tanggal dari tanggal absensi. Jam = waktu saat admin/koordinator menekan **Simpan** (WIB).
- Per staf: untuk tiap status **selain ✅**, tulis simbol + jumlah hari dengan status itu **sepanjang bulan berjalan sampai
  hari ini, termasuk hari ini**. Angka **selalu ditulis**, termasuk 1.
- ✅ ditulis di ujung **hanya jika status hari ini ✅**, tanpa angka. ✅ tidak pernah dihitung sebagai jumlah.
- Contoh baca: `Diaz *️⃣1❌2` = bulan ini 1x telat dan 2x tanpa keterangan, dan hari ini ❌ (sudah termasuk dalam 2).
- Alasan 📌/🔤 hari ini ditulis di belakang baris staf (seperti contoh "Mobil Masuk Bengkel").
- Urutan simbol dan urutan tim ditetapkan builder (tidak boleh mengubah arti). Bentuk tulisan manual lama yang tidak
  konsisten (mis. `*️⃣1📌1❌1📌1*️⃣`) tidak ditiru.
- Staf yang belum diabsen hari itu diberi tanda jelas "belum diabsen" di teks, **kecuali staf Yandal**: petugas tim
  Yandal yang tidak diisi tidak ditulis sama sekali di teks, karena bisa jadi bukan shift pagi. Di layar HP mereka tetap
  tampil supaya bisa diisi. (Tim Yandal = tim bertipe YANDAL di `db_Tim`.)
- Yang dikirim ke grup WhatsApp tetap manual (salin lalu tempel). Tidak ada pengiriman otomatis.

## Tujuan, bukan-tujuan, anti-tujuan

Tujuan: absensi cepat di HP oleh dua orang bersamaan; rekap bulanan otomatis benar; teks WhatsApp cocok dengan format lama.

Bukan tujuan: absensi mandiri oleh staf, GPS/foto/selfie, memuat layar tanpa sinyal, koreksi hari lampau, laporan bulanan terpisah,
integrasi website admin (Hostinger), pengiriman WhatsApp otomatis.

Anti-tujuan (gagal walau "jalan"): satu orang mengubah isian rekannya; Yandal berubah perilakunya setelah kolom
diganti nama; rekap bulanan berbeda dengan hitungan manual.

## Batasan

- Mengikuti arsitektur yang ada: Apps Script + Google Sheets, pola `Router`/`Guard`/`Sheet`/`Lock`/`Audit`, Flutter di
  `mobile/lib/features/`. Versi aplikasi dan backend dinaikkan seperti rilis lain; README dan tes diperbarui.
- Perubahan data produksi (mengganti nama kolom `db_Petugas`) harus punya langkah migrasi yang aman dan bisa diulang.

## Diserahkan ke builder

Nama tab/kolom pasti, kode menu, nama aksi API, tata letak layar, urutan simbol di teks, pemisah alasan, cara migrasi
header `db_Petugas`, dan strategi tes.

## Keputusan yang diambil asisten (bukan dari Master Guswan)

- Tab absensi menyalin `tim_id` saat itu (supaya riwayat tidak berubah ketika petugas pindah tim).
- **Isian orang lain tidak bisa diubah adalah jaminan server** (keputusan Master Guswan). Server menolak penulisan ke baris yang
  `diabsen_oleh`-nya akun lain, termasuk kalau dua orang menyimpan staf yang sama hampir bersamaan (periksa di dalam
  lock). Respons menyebut baris mana yang ditolak; baris lain tetap tersimpan. Tidak ada tanda menimpa.
- Penggantian nama `tim_yandal` -> `tim` dilakukan **di tempat** lewat satu skrip migrasi yang bisa diulang (header diganti,
  isi tetap), tanpa kolom lama dan tanpa alias. HP tidak membaca nama kolom itu (API memakai `timId`), jadi urutan deploy
  backend dan app tidak kritis. Backend + skrip migrasi naik bersamaan.
- Peserta absensi = petugas aktif dengan `tim` terisi. Petugas tanpa tim tidak tampil. Satu petugas satu tim.
- Tanpa impor riwayat Oktober. Rekap bulanan mulai dari data yang tercatat di SiSi; go-live di awal bulan (Nov 2026)
  membuat bulan pertama utuh. Kalau go-live di tengah bulan, rekap bulan itu lebih kecil dari hitungan manual dan itu diterima.
- Tanggal absensi **ditentukan server** (WIB). Kalau tanggal dari HP berbeda (layar terbuka melewati tengah malam), server
  menolak dan HP memuat ulang layar.
- Jam "Pukul" di teks = waktu simpan **terakhir** pada hari itu (dari kedua pengabsen).
- Kelompok tanpa staf yang tampil hari itu tidak ditulis. Staf non-Yandal yang belum diabsen ditulis dengan tanda `⏳ belum diabsen` (usulan).
- Cakupan unit/area untuk ADMIN_ES dan admin: builder memeriksa model `db_Akses` yang ada dan mengikutinya; tidak ada
  pembatasan baru.
