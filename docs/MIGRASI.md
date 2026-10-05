# 11. Migrasi Data Lama ke v2

Status: **Rancangan, keputusan final 3 Okt 2026** (sumber resmi: PRD halaman 11). Tahap cek (dry-run) sudah ada: ADMIN_migrasiCek (v0.24). Tahap tulis belum.

Ringkas: periode seluruh 2026, jenis diklasifikasi ulang dari diameter (aturan v2), WA dibuat ulang mesin v2, foto disalin bertahap dengan verifikasi sha256 (antrean mig_Foto), header ganda digabung jadi satu (yang lain tidak ditulis). Sumber lama hanya dibaca, tidak pernah diubah.

## Prinsip

- **Sekali jalan saat cutover**, dari spreadsheet lama aktif + arsip ke SiSi_ROW v2.
- **Idempoten**: ID v2 dibuat deterministik dari kode lama, jadi dijalankan ulang tidak menggandakan data.
- **Fail closed per baris**: baris yang tidak bisa dipetakan masuk `mig_Karantina`, tidak ditebak.
- **Staging dulu** dengan salinan data production. Production hanya setelah rekonsiliasi cocok.
- **Sebelum data v2 pertama**: sheet row_* masih kosong dan ditulis urut Timestamp naik, karena syncRow membaca jendela dari penunjuk baris. Kalau terpaksa setelah go-live, jalankan `ADMIN_resetJendelaRow` sesudahnya.

## Cakupan

| Ikut | Tidak ikut |
|---|---|
| db_Global_Header (Tim = ROW) → row_Header | db_ROW_Lap_Harian, db_ROW_All_Lap_Harian (turunan) |
| db_ROW_Realisasi → row_Realisasi | db_Recalc_Queue, db_FotoRow_Queue |
| db_ROW_Eksekusi → row_Eksekusi | Password (reset saat cutover, keputusan 2 Okt) |
| URL foto 3 slot → file privat + row_Foto | Temuan/WO (fase berikutnya; eksekusi asal WO tetap ikut, sumber TEMUAN) |

## Prasyarat master

- **db_Tim**: semua sub-tim ROW lama ada. "ROW 01" dipetakan ke tim_id lewat kode 2 digit.
- **db_Jaringan**: semua pasangan penyulang + section yang pernah dipakai. Dry-run mendaftar pasangan yang belum ada; tambahkan lalu `ADMIN_lengkapiMaster`.
- **db_Users**: Input Oleh lama (username) → user_id. Tidak ketemu → dibuat_oleh = `MIGRASI`.
- **db_Jenis_Pekerjaan** sudah final.

## Sheet bantu (di SiSi_ROW)

| Sheet | Dibuat oleh | Isi |
|---|---|---|
| `mig_Cek` | ADMIN_migrasiCek | jenis, kode_lama, kode_baru, status (OK / CATATAN / DIGABUNG / INDUK_DIBUAT / KARANTINA), alasan, bulan |
| `mig_Ringkas` | ADMIN_migrasiCek | per bulan per sub-tim: jumlah v2 + Rabas/Sedang/Besar lama vs baru (rekonsiliasi) |
| `mig_Alias` | admin (opsional) | jenis (PENYULANG/SECTION), penyulang, nilai_lama, nilai_master |
| `mig_Koreksi` | admin (opsional) | jenis (HEADER/REALISASI/EKSEKUSI), kode_lama, kolom (nama kolom sheet lama), nilai_baru |
| `mig_Peta` | ADMIN_migrasiJalan | jenis, kode_lama, kode_baru, id_v2, keterangan (DIGABUNG / INDUK_DIBUAT), wa_lama |
| `mig_Foto` | ADMIN_migrasiJalan | antrean salin foto: foto_id, eksekusi_id, kode_eksekusi, slot, sumber_drive_id, status (ANTRE/ULANG/SELESAI/GAGAL), percobaan, drive_file_id, pesan, diubah_pada |

Script Property: `MIG_SUMBER_ID` (wajib), `MIG_FOTO_AKAR_ID` (wajib kalau foto lama berupa path AppSheet), `MIG_DARI` / `MIG_SAMPAI` (opsional), `MIG_IZINKAN_KARANTINA=TRUE` (opsional, karantina ditinggal permanen), `MIG_HITUNG_SELESAI` (diisi skrip).

`mig_Koreksi` contoh: `EKSEKUSI | R01-16130260915001-PNY.001-EKS.002 | Diameter | 26`. Kolom yang boleh dikoreksi = kolom wajib sheet lama + Kode WO + Input Oleh (mis. Kode Pekerjaan untuk membetulkan induk, Section, Koordinat Pekerjaan, Tanggal). Koreksi diterapkan ke salinan di memori, sumber tidak diubah, tercatat `DIKOREKSI (kolom)` di mig_Cek.

## ID dan kode

- id v2 = UUID dari SHA-256(`sisi-mig|<jenis>|<kode lama>`), deterministik.
- Kode lama yang sudah format v2 (`R<2 digit>-16130YYMMDD<3 digit>`, `-PNY.nnn`, `-EKS.nnn`) dipakai apa adanya.
- Kode lain (8 hex dari mobile lama, `ROW-EKS-...`, kode ULP bukan 16130) **dibuat ulang berantai** urut Timestamp; kode lama dicatat di mig_Peta.
- Wajib, karena server v2 membaca tanggal dari kode (arsip, total bulanan, batas 7 hari).

## Header: db_Global_Header → row_Header

| Lama | v2 | Aturan |
|---|---|---|
| B Kode Header | Kode Header | aturan kode di atas |
| C ULP | ULP | disalin |
| D Hari, E Tanggal | Hari, Tanggal | normalisasi yyyy-MM-dd WIB; beda dengan tanggal di kode = karantina |
| F Tim | Tim | hanya baris Tim = ROW |
| G Sub-Tim | Sub-Tim + tim_id | peta db_Tim; tidak ketemu = karantina |
| H/I Koordinat Awal/Akhir | sama | parser v2 (area Babel); tidak valid = kosong + catatan |
| J/K KM | KM Awal/Akhir | angka; KM akhir < awal tetap disalin + catatan |
| L Kendala | Kendala | disalin |
| M WA Text | WA Text | **teks lama dipertahankan** (yang dulu dikirim), tidak dihitung ulang |
| N TimeStamp, O Input By, P TimeStamp Update | sama + dibuat_oleh | disalin |
| Q Status Text WA | dibuang | |
| | header_id, status, revision | deterministik, AKTIF, 1; diubah_oleh = MIGRASI |

Header ganda (sub-tim + tanggal sama): yang punya realisasi terbanyak (seri: Timestamp paling awal) jadi AKTIF; realisasi header lain **digabung** ke situ (DIGABUNG di mig_Peta). Header ganda tanpa anak = BATAL.

## Realisasi: db_ROW_Realisasi → row_Realisasi

| Lama | v2 | Aturan |
|---|---|---|
| B Kode Header | Kode Header + header_id | lewat kode header, **bukan** Tim + Penyulang + Tanggal |
| C Kode Pekerjaan | Kode Pekerjaan | aturan kode |
| D/E/F Hari, Tanggal, Tim | sama | disalin dari header v2 |
| G Penyulang | Penyulang | harus ada di db_Jaringan (tanpa beda huruf besar/kecil); tidak ada = karantina |
| H Section, I–K Rabas/Sedang/Besar | dihitung ulang | Section = daftar section eksekusi dipisah koma (tanpa rentang); angka dari eksekusi foto lengkap. Angka lama disimpan di mig_Peta untuk rekonsiliasi |
| L Input Oleh, M Timestamp | sama | Timestamp Update = Timestamp |

Penyulang sama 2x dalam satu header = digabung (eksekusinya pindah ke realisasi pertama). Realisasi tanpa header valid = karantina.

## Eksekusi: db_ROW_Eksekusi (30 kolom) → row_Eksekusi (40 kolom)

| Lama | v2 | Aturan |
|---|---|---|
| B/C Kode Header/Pekerjaan | dari induk v2 + realisasi_id | induk kosong (mobile belum diproses): cari realisasi Tim + Penyulang + Tanggal **hanya kalau tepat 1 kandidat**, lebih = karantina |
| D Kode Eksekusi | Kode Eksekusi | 8 hex / ROW-EKS = dibuat ulang berantai |
| J Section | Section + section_id | pasangan (penyulang, section) di db_Jaringan; tidak ketemu = karantina |
| K Nomor Tiang | sama | opsional |
| L–Q Koordinat + Lat/Long | sama | parser v2; Koordinat Pekerjaan kosong = pakai koordinat tiang; dua-duanya kosong = karantina (v2 wajib) |
| R–W Foto + URL | lihat Foto | |
| X Diameter | Diameter | disalin |
| Y Jenis Pekerjaan | Jenis + jenis_id | **pakai jenis lama** (rabas/pangkas, sedang, besar) supaya total historis tidak berubah; diameter yang tidak cocok aturan v2 (mis. 1–24 cm tercatat Sedang) tetap dipindah + catatan DIAMETER_LAMA |
| Z–AB Tampil Foto | dibuang | |
| AC Input Oleh, AD Timestamp | sama | Timestamp Update = Timestamp |
| AE Kode WO (kalau ada) | sumber = TEMUAN | kode WO dicatat di mig_Peta, temuan_id kosong |

Dedup aktif + arsip: Kode Eksekusi sama = ambil Timestamp terbaru, sisanya DIGABUNG.

## Perbaikan induk (eksekusi → realisasi → header), 3 Okt 2026

Banyak eksekusi lama tidak punya induk yang benar (Kode Pekerjaan kosong/salah, realisasinya tidak pernah dibuat, atau headernya hilang). Skrip memperbaikinya **di hasil migrasi, bukan di sumber** (sumber tetap hanya dibaca). Urutannya:

1. **Eksekusi → realisasi.** Pakai Kode Pekerjaan. Kalau tidak ketemu: cari realisasi dengan sub-tim + tanggal + penyulang yang sama. Lebih dari satu = karantina `INDUK_AMBIGU`. Tidak ada = **realisasi dibuat** dari eksekusi itu (penyulang wajib cocok master, kalau tidak karantina + saran). Eksekusi lain di hari/tim/penyulang yang sama ikut realisasi buatan itu.
2. **Realisasi → header.** Pakai Kode Header. Kalau tidak ketemu: cari header sub-tim + tanggal yang sama. Tidak ada = **header dibuat** (`R<tim>-16130YYMMDD001`), koordinat/KM kosong jadi WA kosong sampai dilengkapi.
3. Sub-tim dan tanggal dibaca dari kolom Tim/Tanggal; kalau kosong, dari awalan kode lama (`R01-16130260921001...`).
4. **Induk yang ADA di sumber tapi karantina tidak diganti induk buatan.** Anaknya ikut karantina `INDUK_TIDAK_LOLOS (<kode induk>)`. Bereskan induknya dulu (mig_Alias / mig_Koreksi), anak otomatis ikut.
5. Semua yang dibuat tercatat di mig_Cek dengan status `INDUK_DIBUAT` (kode_baru terisi). Yang induknya ditemukan lewat pencarian: `CATATAN` `INDUK_DARI_TIM_TANGGAL` / `INDUK_DARI_TIM_PENYULANG_TANGGAL`. Hitungan di log: `header.dibuat`, `realisasi.dibuat`, `indukDiperbaiki`.
6. Nomor PNY/EKS diberikan setelah semua induk lengkap: kode lama yang sudah cocok dengan induknya dipertahankan, sisanya dinomori lanjut urut Timestamp. ID deterministik, jadi dijalankan ulang hasilnya sama.

## Foto: URL lama → file privat + row_Foto

- Drive file id diambil dari URL (`/file/d/<id>`, `open?id=`, `uc?id=`, `lh3.googleusercontent.com/d/<id>`). Gagal = slot kosong + catatan.
- File **disalin** (makeCopy) ke `Foto/YYYY/MM/DD/<Tim>/<Penyulang>/<Kode Eksekusi v2>/<foto_id>.jpg` (path sama dengan upload HP, `pathFotoEksekusi_`) di folder privat. File lama tidak diubah (ACL publik lama dibereskan terpisah setelah cutover).
- row_Foto: foto_id deterministik (eksekusi + slot), sha256 dan ukuran dihitung dari file, mime asli, sumber_foto = `MIGRASI`, Timestamp = Timestamp eksekusi.
- File > 2 MB / > 2048 px tetap disalin apa adanya (bukti historis), dicatat.
- foto_lengkap = 3 slot berhasil. Karena v2 hanya menghitung foto lengkap, foto lama yang hilang membuat angka turun; itu muncul di rekonsiliasi.
- Waktu: salin + hash ±1–2 detik per file. Jalan per bulan, maks ±5 menit per eksekusi skrip (batas Apps Script 6 menit), dilanjutkan dari MIG_PENUNJUK.

## Urutan jalan (v0.34)

1. Bekukan input app lama, catat jam cutover. Set `MIG_SAMPAI` = tanggal cutover.
2. **row_* harus kosong** (di staging: hapus data uji). ADMIN_migrasiJalan menolak kalau ada baris yang bukan hasil migrasi.
3. `ADMIN_migrasiCek` (dry-run). Bereskan karantina lewat master, `mig_Alias`, `mig_Koreksi`; ulangi sampai karantina 0
   (atau sisa yang memang diterima + `MIG_IZINKAN_KARANTINA=TRUE`).
3b. Foto lama AppSheet: isi Script Property `MIG_FOTO_AKAR_ID` = ID folder Drive "AppSheet SiSi - ULP Toboali"
   (atau induknya), lalu `ADMIN_migrasiCekFoto` (hanya baca) sampai semua foto `ADA` di `mig_CekFoto`.
   URL lama `appsheet.com/image/getimageurl?...&fileName=<path>` dibaca jadi path relatif, dicari per nama folder.
4. `ADMIN_migrasiJalan` (tahap A): header → realisasi → eksekusi ditulis urut Timestamp naik, hitungan 0, WA kosong,
   foto kosong. Menulis `mig_Peta`, menambah antrean `mig_Foto`, mereset penunjuk jendela. Boleh dijalankan ulang
   (melanjutkan; ID deterministik). Kalau rencana berubah setelah data tertulis: rollback dulu.
5. `ADMIN_migrasiFoto` (tahap B) berulang sampai antrean habis, atau `ADMIN_migrasiFotoOtomatis` (tiap 10 menit,
   berhenti sendiri). Per foto: makeCopy → verifikasi sha256 + ukuran → wajib privat → baru row_Foto + kolom foto
   eksekusi ditulis (foto_lengkap TRUE kalau 3 slot). Gagal 3x = GAGAL, lihat kolom pesan.
6. `ADMIN_migrasiHitung` (tahap C) per bulan: Section + Rabas/Sedang/Besar realisasi dan WA Text header dengan mesin v2.
   Jalankan ulang sampai log "selesai". Memegang lock, jadi jalankan di luar jam kerja.
7. Rekonsiliasi per bulan per sub-tim: `mig_Ringkas` (baru_fotoLengkap) vs total row_Realisasi. Selisih wajib punya
   alasan (foto gagal, karantina, digabung).
8. `ADMIN_cekAclFoto`. Uji di HP: Arsip menampilkan bulan lama, getKodeRow hari ini normal.

## Rollback

Sumber tidak disentuh. Rollback = hapus baris row_* dan row_Foto dengan dibuat_oleh = MIGRASI, kosongkan mig_Foto + folder Foto hasil migrasi (sumber_foto = MIGRASI), hapus Script Property MIG_HITUNG_SELESAI, lalu ulang dari langkah 3. Di production dilakukan sebelum app v2 dipakai, jadi tidak ada data v2 asli yang ikut terhapus.

## Keputusan yang dibutuhkan

| # | Pertanyaan | Saran |
|---|---|---|
| 1 | Periode yang dimigrasi | semua data 2026 |
| 2 | Jenis lama vs klasifikasi diameter v2 | jenis lama (total historis tetap) |
| 3 | WA Text lama | dipertahankan |
| 4 | Foto disalin ke folder privat atau pakai file lama | disalin |
| 5 | Header ganda | digabung ke satu header AKTIF |

## ID uji

- `MIG-01` dry-run tidak menulis apa pun ke row_*.
- `MIG-02` jalan ulang tidak menambah baris (idempoten).
- `MIG-03` rekonsiliasi per bulan cocok atau selisihnya beralasan.
- `MIG-04` semua foto hasil migrasi "Dibatasi" (ADMIN_cekAclFoto).
