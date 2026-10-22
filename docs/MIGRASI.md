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
- File **disalin** (makeCopy) ke `Foto/YYYY/MM/DD/<Tim>/<Penyulang>/<Kode Eksekusi v2>/<foto_id>.jpg` (path sama dengan upload HP, `pathFotoEksekusi_`) di folder privat. v0.64.4: sesudah migrasi jalankan **ADMIN_rapikanNamaFotoRow** supaya nama jadi `<Kode Eksekusi>_<SLOT>.jpg`. File lama tidak diubah (ACL publik lama dibereskan terpisah setelah cutover).
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
   v0.59: bisa dilanjutkan (posisi di Script Property `MIG_CEKFOTO_POS`, hasil ditambahkan). Data besar: `ADMIN_migrasiCekFotoOtomatis`
   (tiap 5 menit, berhenti sendiri saat selesai), `ADMIN_migrasiCekFotoBerhenti`, `ADMIN_migrasiCekFotoUlang` (mulai dari awal).
   Tahap A jangan dipotong per periode (MIG_DARI / MIG_SAMPAI): baris bulan sebelumnya tidak ada di rencana bulan berikutnya = MIG_RENCANA_BERUBAH.
   URL lama `appsheet.com/image/getimageurl?...&fileName=<path>` dibaca jadi path relatif, dicari per nama folder.
4. `ADMIN_migrasiJalan` (tahap A): header → realisasi → eksekusi ditulis urut Timestamp naik, hitungan 0, WA kosong,
   foto kosong. Menulis `mig_Peta`, menambah antrean `mig_Foto`, mereset penunjuk jendela. Boleh dijalankan ulang
   (melanjutkan; ID deterministik). Kalau rencana berubah setelah data tertulis: rollback dulu.
   v0.62.3: row_Eksekusi kini benar urut Timestamp lintas sub-tim (sebelumnya urut kode per tim karena `_ms` eksekusi
   tertulis di dalam komentar). Rencana tanpa `_ms` angka ditolak `MIG_URUTAN_TIDAK_VALID`. Tahap A yang sudah ditulis
   sebelum v0.62.3 TIDAK diurut ulang oleh jalan ulang (hanya cek ID): rollback dulu, lalu jalankan lagi.
5. `ADMIN_migrasiFoto` (tahap B) berulang sampai antrean habis, atau `ADMIN_migrasiFotoOtomatis` (tiap 10 menit,
   berhenti sendiri). Per foto: makeCopy → verifikasi sha256 + ukuran → wajib privat → baru row_Foto + kolom foto
   eksekusi ditulis (foto_lengkap TRUE kalau 3 slot). Gagal 3x = GAGAL, lihat kolom pesan.
   v0.60: dengan Advanced Service Drive API v3 (appsscript.json) salin pakai `Drive.Files.copy` dan sha256 + ukuran
   sumber / salinan dibaca dari metadata Drive (`sha256Checksum`, dihitung Google dari isi file), jadi foto tidak
   di-download. Salinan tetap diverifikasi terpisah dari sumbernya; beda = dibuang + ULANG. Tanpa Drive API / checksum
   kosong = cara lama (download + hitung). Isi folder sumber dan tujuan didaftar sekali per jalan, path folder tujuan
   di-memo per jalan. Log: `baca awal`, `checksum Drive API n/selesai`.
   v0.60.2: Script Property `MIG_FOTO_PRIORITAS` = daftar YYMM dipisah koma (mis. `2610`) = foto bulan itu disalin dulu,
   sisanya urutan antrean. Hapus property setelah bulan itu habis (tidak wajib).
6. `ADMIN_migrasiHitung` (tahap C) per bulan: Section + Rabas/Sedang/Besar realisasi dan WA Text header dengan mesin v2.
   Jalankan ulang sampai log "selesai". Memegang lock, jadi jalankan di luar jam kerja.
   v0.60.2: dikunci per blok (sub-tim + bulan, 13 karakter awal kode): blok yang fotonya masih ANTRE / ULANG (percobaan < 3)
   di `mig_Foto` dilewati dan tidak dicatat selesai; GAGAL tidak menahan; antrean tanpa Kode Eksekusi sah = semua ditahan
   (`TAHAP_B_BELUM_SELESAI`). Darurat: `MIG_HITUNG_PAKSA=TRUE` (blok yang dihitung harus diulang setelah tahap B: hapus
   `MIG_HITUNG_SELESAI`). Jalankan lagi setiap ada bulan yang fotonya baru habis.
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


## Gardu: Master_Gardu + Rekap Gardu → db_Gardu (v0.68.0)

- **Kapan**: sekali, sebelum BA Pengoperasian v2 dipakai (nomor gardu baru melanjutkan nomor terakhir per prefix TB / PY / TL / PG).
- **Cara**: `ADMIN_cekMigrasiGardu` (pratinjau di Execution log, tidak menulis) → perbaiki BLOKIR di sheet lama → `ADMIN_migrasiGardu`.
- **Sumber hanya dibaca**: Master_Gardu dan Rekap Gardu di spreadsheet `GARDU_LAMA_SHEET_ID` (v0.68.1, kosong = `GARDU_SHEET_ID`) tidak pernah ditulis. Staging: isi dengan ID file asli, tanpa perlu menyalin tab.
- **Idempoten**: hanya No Gardu yang belum ada di db_Gardu yang ditambah; baris yang ada tidak ditimpa. Gardu baru yang sempat masuk lewat web lama sesudah migrasi cukup diambil dengan menjalankan ulang.
- **Fail closed**: No Gardu ganda / kolom bergeser / judul tidak dikenali = tidak ada yang ditulis.
- Pemetaan kolom & aturan lengkap: SKEMA.md v0.68.0.
- BA lama tidak disalin ke Rekap_BA (cukup nomor BA di db_Gardu); penghitung No BA v2 membaca Rekap Gardu lama juga. Untuk melihat / tracking BA lama: Arsip BA v1 (v0.86.0, di bawah).


## Arsip BA v1 (baca saja, v0.86.0)

- **Tujuan**: tracking riwayat BA lama (trafo + switching) di HP tanpa mengubah Rekap_BA v2. Tidak bisa diedit, dibuat ulang PDF-nya, atau dikirim EAM.
- **Cara**: `ADMIN_cekArsipBa` (pratinjau di Execution log: jumlah per sumber / tahap / tahun, kolom yang dipakai, No Gardu yang tidak ada di db_Gardu, nomor BA ganda) -> `ADMIN_migrasiArsipBa` (tulis sheet `arsip_BA_V1` di GARDU_SHEET_ID).
- **Aman diulang**: sheet arsip ditulis ulang utuh (salinan), arsip_id tetap. Jalankan lagi kalau masih ada BA yang dibuat di v1. Sumber Rekap Gardu / Rekap Switching hanya dibaca.
- **Urutan**: sesudah `ADMIN_migrasiGardu` (supaya gardu_id terisi). Gardu yang tidak dikenal tetap diarsip tanpa gardu_id.
- **File**: PDF dan BA TTD lama dibaca server dari Drive (akun pemilik script harus punya akses ke file v1). HP: Berita Acara > Lihat BA & PDF (satu halaman dengan BA v2, filter Semua / SiSi v2 / Arsip v1), atau detail gardu > Lihat semua BA gardu ini.


## Yandal: P0 v1 -> yan_* (v0.82.0)

**Sumber**: SATU spreadsheet gabungan yang disusun admin (`MIGP0_SUMBER_ID`), isi = file v1 aktif + ARSIP. Hanya dibaca.

| Tab | Isi | Wajib |
| --- | --- | --- |
| `db_Yandal_Shift` | shift v1 (A..L) | ya |
| `db_Yandal_P0` | P0 v1 (A..AX, Alasan Rejected di AQ) | ya |
| `db_Yandal_Pengecekan_Switching` | switching v1 (A..AX) | tidak |
| tab Pengukuran Gardu (nama bebas, judul kolom E = "Kode Pengukuran Gardu", atau `MIGP0_TAB_UKUR`) | dari file Master Gardu v1 | tidak |

Aturan file gabungan: baris 1 = judul, data mulai baris 2, urutan kolom = layout v1 TERBARU (baris ARSIP lama yang belum punya kolom Alasan Rejected / Jarak Antar P0 harus digeser dulu). Judul kolom kunci dicek (MIG_JUDUL_SALAH). Kode ganda (aktif + ARSIP tumpang tindih) boleh: dipakai baris paling lengkap, dicatat KODE_GANDA.

**Urutan**:
1. Isi Script Property `MIGP0_SUMBER_ID` (opsional `MIGP0_DARI` / `MIGP0_SAMPAI`).
2. `ADMIN_migrasiP0Cek` -> baca `migp0_Cek` (KARANTINA wajib dibereskan) + `migp0_Ringkas` (cocokkan dengan rekap v1 per bulan).
3. Bereskan karantina: tambah baris `migp0_Alias` (nama lama -> nama master) atau perbaiki file gabungan / master (petugas / tim). Ulang langkah 2.
4. `ADMIN_migrasiP0Jalan`. Terpotong batas waktu = jalankan lagi (lanjut). ARSIP susulan = tambah baris di file gabungan lalu jalankan lagi (hanya menambah, shift lama direkap ulang).
5. `ADMIN_migrasiP0FotoOtomatis` (tiap 10 menit sampai antrean `migp0_Foto` habis) atau `ADMIN_migrasiP0Foto` manual. Path AppSheet butuh `MIGP0_FOTO_AKAR_ID`.

**Pemetaan**: Tim = db_Tim YANDAL (nama, cadangan kode dari Kode Header Y<kode>-). Petugas = db_Petugas (nama, pisah koma / ; / / / &, maks 2). Nama Pekerjaan = db_Jenis_Pekerjaan YANDAL (Lainnya / Lain-lain = Lain - Lain). Penyulang / Section = db_Jaringan. No Gardu = db_Gardu (kapasitas -> hasil ukur dihitung mesin v2, master TIDAK diubah).

**Status**: Approved / Rejected v1 apa adanya, Point v1 dipakai (beda dengan rumus v2 dicatat INFO POINT_BEDA). Bobot Lain - Lain dihitung balik dari Point v1. Belum diputuskan + foto Sesudah ada = Menunggu (masuk Approval P0 v2). Belum selesai = Rejected SISTEM "P0 Tidak Selesai". Shift yang tidak ada di tab shift dibuat dari P0-nya (INDUK_DIBUAT).

**KARANTINA** (Jalan ditolak kecuali `MIGP0_IZINKAN_KARANTINA=TRUE`): TIM / PETUGAS / PEKERJAAN tidak dikenal, tanggal / shift tidak valid, induk tidak ada / tidak lolos, BENTROK_V2 (kode / tim + tanggal + shift sudah dibuat app v2). PERINGATAN (tetap ditulis): penyulang / section / gardu tidak dikenal, petugas lebih dari 2, foto tidak terbaca.

**Aman**: data app v2 tidak disentuh. Baris MIGRASI yang tidak ada lagi di rencana = MIG_RENCANA_BERUBAH. Rollback: Script Property `MIGP0_IZINKAN_HAPUS=TRUE` lalu `ADMIN_migrasiP0Hapus` (hapus semua baris MIGRASI + antrean, foto salinan di Drive dibiarkan dan dipakai ulang).


## Hartek: v1 -> SiSi_Hartek v2 (v0.98.8)

**Sumber (hanya dibaca)**:
- `MIGHARTEK_SUMBER_ID` (cadangan otomatis: `MIG_SUMBER_ID`): spreadsheet utama / gabungan v1 (`db_Global_Header` dengan `Tim = Hartek`, `db_Hartek_PenyulangGardu`, `db_Hartek_Pekerjaan`, `db_Hartek_Material`).
- `MIGHARTEK_ARSIP_ID` (opsional): spreadsheet arsip v1 bila dipisah dari file aktif (otomatis digabung dan di-dedup berdasarkan kode).
- `MIGHARTEK_GROUNDING_ID` (opsional): spreadsheet terpisah untuk `db_Hartek_HarGrounding` dan `db_Hartek_PemerataanBeban` (bila kosong, dicari di file utama).
- `MIGHARTEK_DARI` / `MIGHARTEK_SAMPAI` (opsional, `yyyy-MM-dd`): batas periode migrasi.

**Urutan jalan di Apps Script**:
1. Pastikan `HARTEK_SHEET_ID` sudah disiapkan (`ADMIN_siapkanSheetHartek`) dan tim `HARTEK` aktif ada di `db_Tim`.
2. Isi Script Property `MIGHARTEK_SUMBER_ID` (serta `MIGHARTEK_ARSIP_ID` / `MIGHARTEK_GROUNDING_ID` bila terpisah).
3. Jalankan `ADMIN_migrasiHartekCek` (dry-run, tidak mengubah `db_Hartek_*`). Periksa sheet `mightk_Cek` dan `mightk_Ringkas` di `SiSi_Hartek`.
4. Bila ada nama tim / penyulang / section / pekerjaan / material lama yang perlu dipetakan, tambahkan di sheet `mightk_Alias` (`jenis`, `penyulang`, `nilai_lama`, `nilai_master`) lalu ulangi `ADMIN_migrasiHartekCek`.
5. Jalankan `ADMIN_migrasiHartekJalan` untuk menulis ke 6 tab `db_Hartek_*` (`db_Hartek_Header`, `db_Hartek_PenyulangGardu`, `db_Hartek_Pekerjaan`, `db_Hartek_Material`, `db_Hartek_Grounding`, `db_Hartek_PemerataanBeban`) + `mightk_Peta`. Idempoten dan aman dijalankan ulang bila terpotong batas waktu.
6. Rollback (bila diperlukan): set Script Property `MIGHARTEK_IZINKAN_HAPUS=TRUE` (sekali pakai) lalu jalankan `ADMIN_migrasiHartekHapus`. Data asli v2 tidak disentuh.

## Temuan Inspeksi, Inspeksi Jaringan, Inspeksi Gardu: v1 -> v2 (v1.0.17)

**Sumber (hanya dibaca)**: `INSPEKSI_LAMA_SHEET_ID` (cadangan `MIG_SUMBER_ID`), posisi kolom v1 (Core/Code.js COL_INS + Tek-InsDu-Code.js COL_INSDU):
`db_Global_Header` (hanya kode IJR- / IGD-) -> `insjar_header` / `db_insdu_header`; `db_InsJar_Realisasi` -> `insjar_realisasi`; `db_InsDu_Realisasi` -> `db_insdu_realisasi`; `db_INS_Temuan` -> `db_temuan_inspeksi`.

**Aturan**: kode v1 dipakai apa adanya (format sama dengan v2), ID = uuidMig_ (idempoten). Tim dari db_Tim INSPEKSI_JARINGAN / INSPEKSI_GARDU (nama Sub-Tim, kode 2 digit, atau satu-satunya tim) - tidak ketemu = KARANTINA. Induk tidak termigrasi = KARANTINA. Temuan PEG = sumber ADMIN tanpa header. Temuan Selesai = status_wo SELESAI + tindak_lanjut (jenis pekerjaan + diameter v1); belum selesai = Penugasan Tim tanpa WO (PERINGATAN: teruskan ulang). Jenis temuan dicocokkan nama ke db_Jenis_Temuan (tidak ketemu = teks disalin, PERINGATAN). Gardu dicocokkan No Gardu ke db_Gardu. Foto temuan / tiang = link Drive v1 (+ file_id dari URL). Pengukuran Inspeksi Gardu v1 (di Master_Gardu) tidak dimigrasi; header InsDu MIGRASI tidak dihitung tunggakan WBP.

**Urutan**: `ADMIN_siapkanSheetInsJar` + `ADMIN_siapkanSheetInsDu` -> `ADMIN_migrasiInspeksiCek` (laporan `migins_Cek`) -> `ADMIN_migrasiInspeksiJalan` (ditolak bila ada KARANTINA kecuali `MIGINS_IZINKAN_KARANTINA=TRUE`; aman dijalankan ulang bila terpotong). Rollback: `MIGINS_IZINKAN_HAPUS=TRUE` lalu `ADMIN_migrasiInspeksiHapus` (hapus baris dibuat_oleh MIGRASI, data app v2 tidak disentuh).

## Jadwal Padam: v1 -> v2 (v1.0.17)

**Sumber (hanya dibaca)**: `JADWAL_PADAM_LAMA_SHEET_ID` (spreadsheet eksternal v1), tab `Rekap_Jadwal_Padam` + `Master Daerah Padam`, dibaca lewat judul kolom (sama dengan _jpGet_ v1, nama tab tanpa beda huruf / spasi).

**Aturan**: kode v1 dipertahankan (kosong = `JP-MIG-<baris>`), jadwal_id / daerah_id deterministik. Tanggal Date / yyyy-MM-dd / dd/MM/yyyy / "25 Oktober 2026"; jam Date / "22.00" / "22:00"; durasi dihitung bila kosong; status "Batal Pekerjaan" v1 = Batal Pemadaman; penyulang + section tidak ada di master = PERINGATAN (kolom dari rekap disalin). Tanggal / penyulang kosong, kode ganda = KARANTINA.

**Urutan**: `ADMIN_siapkanSheetJadwalPadam` -> `ADMIN_migrasiJadwalPadamCek` (`migjp_Cek`) -> `ADMIN_migrasiJadwalPadamJalan` (`MIGJP_IZINKAN_KARANTINA=TRUE` untuk meninggalkan karantina). Rollback: `MIGJP_IZINKAN_HAPUS=TRUE` lalu `ADMIN_migrasiJadwalPadamHapus` (db_jadwal_padam dibuat_oleh MIGRASI + db_Daerah_Padam diubah_oleh MIGRASI).
