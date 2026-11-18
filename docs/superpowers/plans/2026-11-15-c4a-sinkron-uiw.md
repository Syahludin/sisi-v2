# C4A + Sinkron UIW Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menu Temuan Inspeksi (admin) menjadi menu C4A dengan Laporan C4A (titik awal, temuan, titik akhir, jarak jalan).
Setiap laporan dan temuannya juga dikirim di latar ke file `Template_Inspeksi.xlsx` milik UIW (sheet Inspeksi, Temuan, KMS).

**Architecture:** HP menulis ke antrean lokal seperti sekarang (`AntreanTemuanAdmin`), lalu server Apps Script menyimpan ke
SiSi_Temuan (sheet `c4a_laporan` baru dan `db_temuan_inspeksi`) dan mencatat baris di sheet `uiw_antrean`. Pemicu sekali jalan
(pola `35_Gardu_HI.js`) memproses antrean: pemeriksaan bertahap, salin foto, lalu satu kali ganti isi file .xlsx per putaran
dengan batas waktu. Jarak dihitung di server dengan `Maps.newDirectionFinder()`.

**Tech Stack:** Google Apps Script (V8, Drive v3 advanced service, Maps service), Node `node:test` + `tests/harness.js`, Flutter (flavor staging).

**Spec:** `docs/superpowers/specs/2026-11-14-c4a-sinkron-uiw-design.md` (wajib dibaca bersama rencana ini)

## Global Constraints

- Rilis **staging dulu**: `npm run deploy:staging`, APK `--flavor staging`. Production baru setelah Master Guswan menguji.
- Di staging, `UIW_FILE_ID` menunjuk ke **salinan** `Template_Inspeksi.xlsx`, bukan ke file asli `1u9IOS80PHknKXB2nbeKOnI2CIha7A0Ns`.
- Script Properties baru: `UIW_FILE_ID`, `UIW_FOTO_FOLDER_ID` (folder `Temuan_Images`), `UIW_UP3`. Ketiganya boleh lewat `CFG_JSON` seperti kunci lain di `00_Config.js`.
- `c4a_id` dan `uniqueid` = 8 karakter hex huruf kecil (`/^[0-9a-f]{8}$/`), dibuat di HP.
- Kolom baru ditambahkan **di kanan** tabel yang sudah ada (cek struktur hanya mengunci kolom kiri). `temuan_id` tetap ada.
- Kode temuan admin **tetap pola lama** `PEG-<ULP><YYMMDD>001-PNY.NNN-TJR.NNN`. Kode laporan: `C4A-<ULP><YYMMDD><NNN>`.
- Section di file UIW = teks sebelum `" - "` yang **pertama**, di-trim. Tanpa `" - "` = nama utuh.
- Zona hari: WIB (`Asia/Jakarta`, `tanggalHariIniHartek_()`).
- Yang disentuh sinkron hanya sheet `Inspeksi`, `Temuan`, `KMS` di file UIW. `Chart_Persentase`, `Filter`, `Daftar Kategori` tidak boleh berubah.
- Judul kolom UIW (persis): Inspeksi `InspeksiID, Tanggal, UP3, ULP, Penyulang, Section, Petugas`; Temuan `Temuan ID, Inspeksi ID, Kategori, Temuan Awal, Foto Awal, Lokasi Awal, Keterangan Awal, Tindak Lanjut, Status, Foto Akhir, Lokasi Akhir, Keterangan Akhir, Tanggal Selesai`; KMS `Id, UP3, ULP, Penyulang, Section, Panjang`.
- Batas waktu putaran 4,5 menit (`270000` ms). Ambang ukuran file 40 MB. Jeda pemicu: 2 menit (sisa karena waktu), lalu 5 / 15 / 60 menit (sisa karena GAGAL).
- Tidak ada notifikasi. Hanya kolom status dan kolom bantu di `uiw_antrean`.
- Data lama tidak dikirim. Hanya temuan yang punya `c4a_id` yang masuk antrean.
- Gaya kode mengikuti modul sekitarnya: `var`, fungsi bernama `…_`, komentar Indonesia singkat dengan versi + "permintaan Master Guswan <tanggal>".
- Belum ada commit atau push tanpa izin Master Guswan (lihat memori "pratinjau mingguan"). Langkah "Commit" di bawah = **siapkan** commit lokal hanya kalau Master Guswan sudah mengizinkan. Kalau belum, cukup catat di `docs/pratinjau-mingguan/`.

## Review Focus

1. Temuan offline yang baru terkirim **setelah** laporannya ditutup otomatis (keesokan hari) tetap harus diterima dan menempel ke laporannya. Tes ada di Task 3.
2. Dua HP dengan akun yang sama membuat laporan saat offline: temuan dari HP kedua dipindah ke laporan yang ada, tidak hilang. Tes di Task 2 (server) dan Task 9 (HP).
3. Jenis temuan yang belum dipetakan ke kategori UIW: baris itu `PERLU_DATA`, baris lain tetap terkirim, dan baris itu otomatis lolos begitu peta diisi. Tes di Task 5.
4. Judul kolom di file UIW diubah orang: tidak ada yang ditulis sama sekali, dan file tidak tersentuh. Tes di Task 7.
5. Section dengan beberapa `" - "` (`ACR A - LBS B - Ujung`) atau tanpa `" - "`. Tes di Task 5.

---

### Task 0: Spike konversi .xlsx pada salinan (staging, manual)

Tujuannya membuktikan teknik ganti isi file sebelum kode sinkron ditulis. Hasilnya menentukan isi Task 7.

**Files:**
- Create: `backend/src/modules/107_UIW_File.js` (sementara hanya berisi `ADMIN_ujiSalinanUiw`)

- [ ] **Step 1:** Di Drive staging, buat salinan `Template_Inspeksi.xlsx`. Isi 2 baris uji di sheet Inspeksi dan Temuan lewat Excel, lalu catat ID salinan sebagai `UIW_FILE_ID` di Script Properties staging.
- [ ] **Step 2:** Tulis `ADMIN_ujiSalinanUiw()`. Fungsi ini: (a) `Drive.Files.copy({ name, mimeType: 'application/vnd.google-apps.spreadsheet' }, UIW_FILE_ID)`, (b) menambah satu baris di sheet `Temuan` salinan Google Sheet lewat `SpreadsheetApp`, (c) mengekspor ke xlsx lewat `UrlFetchApp` ke `https://docs.google.com/spreadsheets/d/<id>/export?format=xlsx` dengan `ScriptApp.getOAuthToken()`, (d) `Drive.Files.update({}, UIW_FILE_ID, blob)`, (e) menghapus salinan Google Sheet, (f) mencatat durasi tiap langkah dan ukuran file dengan `console.log`.
- [ ] **Step 3:** `npm run push:staging`, lalu jalankan `ADMIN_ujiSalinanUiw` dari editor.
- [ ] **Step 4:** Periksa hasilnya. Lulus kalau: ID file tetap sama; sheet `Chart_Persentase`, `Filter`, `Daftar Kategori` tidak berubah (rumus, format, validasi); baris lama tetap ada dan baris baru tampil; file masih terbuka normal di Excel. Catat durasi per langkah di `docs/pratinjau-mingguan/2026-11-15.md` dan isi angka nyata di bagian kuota spec 7.1.
- [ ] **Step 5:** Kalau gagal, ganti teknik dengan pustaka xlsx JavaScript murni (SheetJS build mini disalin ke `backend/src/lib/`), ulangi Step 3–4, lalu laporkan ke Master Guswan sebelum lanjut ke Task 7.

### Task 1: Skema, konfigurasi, dan siapkan sheet

**Files:**
- Modify: `backend/src/00_Config.js` (tambah `UIW_FILE_ID`, `UIW_FOTO_FOLDER_ID`, `UIW_UP3`)
- Modify: `backend/src/modules/52_InsJar.js:54-91` (kolom kanan baru)
- Create: `backend/src/modules/104_C4A.js` (skema C4A + `ADMIN_siapkanSheetC4A`)
- Create: `tests/duniaC4A.js`, `tests/c4a.test.js`
- Modify: `package.json` (tambah `tests/c4a.test.js` ke skrip `test`)

**Interfaces:**
- Produces:
  - `TEMUAN_HEADER_.db_temuan_inspeksi` diakhiri `..., 'c4a_id', 'uniqueid'`. Keduanya ditaruh sesudah kolom audit, karena kolom tambahan harus di kanan.
  - `INSJAR_MASTER_HEADER_.db_Jenis_Temuan` diakhiri `..., 'uiw_kode', 'uiw_kategori', 'uiw_temuan'`.
  - `C4A_SHEET_ = { LAPORAN: 'c4a_laporan', ANTREAN: 'uiw_antrean' }` dan `C4A_HEADER_` berisi kolom spec 5.2. `c4a_laporan` urut persis tabel spec 5.2. `uiw_antrean`: `['nomor', 'jenis', 'kunci', 'c4a_id', 'status', 'bantu', 'percobaan', 'coba_lagi_setelah', 'waktu_coba', 'waktu_terkirim', 'sidik', 'foto_awal_uiw', 'foto_akhir_uiw', 'antrean_id'].concat(INSJAR_AUDIT_)`.
  - `tabelC4A_(nama) -> {sheet, header, rows}` (cek struktur seperti `tabelInsJar_`, memakai `TEMUAN_SHEET_ID`).
  - `ADMIN_siapkanSheetC4A()`: membuat dua tab di SiSi_Temuan dan menambah kolom kanan yang belum ada di `db_temuan_inspeksi` dan `db_Jenis_Temuan`. Dengan argumen `uji=true` hanya melapor.
  - `tests/duniaC4A.js` mengekspor `duniaC4A()`. Polanya `konteksInsJar()` (`tests/backend.test.js:7862`) ditambah sheet `c4a_laporan`, `uiw_antrean`, `db_Users` (admin `u-adm` bernama `'Admin Utama'`), dan `db_Jenis_Temuan` dengan `uiw_*` terisi untuk `jt-1` (`A3`, `Komponen`, `Isolator Tumpu`) dan `jt-2` (`C1`, `Pohon`, `Rabas`). `jt-3` dibiarkan tidak terpetakan. Disediakan juga jam tetap `x.jam` dan stub `Maps`, `DriveApp`, `ScriptApp`.

- [ ] **Step 1: Tes gagal** di `tests/c4a.test.js`:
  - `'skema: kolom c4a_id + uniqueid di kanan db_temuan_inspeksi, uiw_* di kanan db_Jenis_Temuan'`. Assert `TEMUAN_HEADER_.db_temuan_inspeksi.slice(-2)` sama dengan `['c4a_id', 'uniqueid']`, dan header lama tidak bergeser (indeks `temuan_id` sama dengan sebelumnya).
  - `'siapkan: membuat c4a_laporan + uiw_antrean dan menambah kolom kanan tanpa mengubah kolom lama; uji=true tidak menulis'`.
- [ ] **Step 2:** `node --test tests/c4a.test.js`. Harapannya FAIL (`C4A_HEADER_ is not defined`).
- [ ] **Step 3:** Implementasikan sesuai Interfaces. `ADMIN_siapkanSheetC4A` memakai pola `jalankanSiapkanInsJar_` (`52_InsJar.js:1086`).
- [ ] **Step 4:** Jalankan `node --test tests/c4a.test.js`, lalu `npm test`. Harapannya semua PASS. Tes InsJar lama juga harus tetap lulus, karena header bertambah di kanan.
- [ ] **Step 5:** Commit (lihat Global Constraints): `feat(c4a): skema c4a_laporan, uiw_antrean, kolom c4a_id/uniqueid/uiw_*`

### Task 2: Laporan C4A di server (buat, tutup, aturan satu laporan terbuka)

**Files:**
- Modify: `backend/src/modules/104_C4A.js`
- Modify: `backend/src/02_Router.js` (dekat baris 168–173, menu `OPS_INPUT_TEMUAN`)
- Test: `tests/c4a.test.js`

**Interfaces:**
- Consumes: `tabelC4A_`, `lokasiJaringanInsJar_(penyulang, section, true)`, `wajibAdminTemuan_`, `denganLock_`, `tambahBaris_`, `ubahBaris_`, `auditLog_`.
- Produces:
  - `buatLaporanC4A_(sesi, {c4aId, penyulang, section, koordinatAwal, sumberAwal: 'GPS'|'PETA', waktuPerangkat})`. Hasilnya `{c4aId, kodeC4a, status: 'TERBUKA', revision}`, atau `{duplikat: true, ...}` kalau `c4aId` sudah ada milik user yang sama, atau `{ditolak: 'C4A_SUDAH_ADA', laporan: <laporan terbuka yang ada, bentuk HP>}`.
  - `tutupLaporanC4A_(sesi, {c4aId, koordinatAkhir, sumberAkhir: 'GPS'|'PETA', waktuPerangkat})`. Hasilnya `{c4aId, status: 'SELESAI', statusJarak: 'MENUNGGU'|'SELESAI', revision}`.
  - `getLaporanC4A_(sesi, {}) -> {terbuka: laporan|null, ringkasan: {Komponen, Peralatan, Pohon, Lainnya}}`: ringkasan dihitung dari temuan **hari ini** yang punya `c4a_id` milik user ini.
  - `laporanC4AKeHp_(r)`: bentuk camelCase dari baris `c4a_laporan`.
  - Kode galat baru: `C4A_ID_TIDAK_VALID`, `C4A_ID_BENTROK` (c4aId sudah dipakai user lain), `C4A_TIDAK_DITEMUKAN`, `BUKAN_MILIK_ANDA`.
  - Router: `buatLaporanC4A`, `tutupLaporanC4A`, `getLaporanC4A`, semuanya `menu: 'OPS_INPUT_TEMUAN'`. Dua yang pertama `tulis: true`.

- [ ] **Step 1: Tes gagal**, dengan nilai-nilai berikut:
  - `'laporan: kode C4A-16130<YYMMDD>001 lalu 002 di hari sama setelah ditutup; satu laporan terbuka per akun'`. Laporan kedua sebelum ditutup menghasilkan `ditolak === 'C4A_SUDAH_ADA'` dan `laporan.c4aId` sama dengan c4aId pertama. Setelah `tutupLaporanC4A_`, laporan baru diterima dengan `kodeC4a` berakhiran `002`.
  - `'laporan: c4aId harus 8 hex, kirim ulang = duplikat, c4aId milik user lain = C4A_ID_BENTROK'`.
  - `'laporan: penyulang + section wajib dari db_Jaringan (SECTION_TIDAK_VALID)'`.
  - `'tutup: titik akhir dicatat, status SELESAI, status_jarak MENUNGGU, jadwalkanSinkronUiw_ dipanggil'`. Stub `x.h.jadwalkanSinkronUiw_` lalu hitung panggilannya.
  - `'tutup setelah ditutup otomatis: titik akhir admin menggantikan TEMUAN_TERAKHIR, ditutup_otomatis jadi false, status_jarak MENUNGGU lagi'`.
  - `'tutup: laporan milik user lain = BUKAN_MILIK_ANDA'`.
- [ ] **Step 2:** `node --test tests/c4a.test.js`. Harapannya FAIL.
- [ ] **Step 3:** Implementasikan. Kode laporan dibuat dengan `urutKodeInsJar_(rows, 'kode_c4a', 'C4A-' + KODE_ULP + yymmdd)` dan `pad3_`. Pemeriksaan "laporan terbuka" berarti `status === 'TERBUKA'` dan `user_id === sesi.userId`. Laporan TERBUKA dari tanggal sebelum hari ini dianggap tertutup: tutup otomatis lewat `tutupOtomatisC4A_` (Task 8) yang dipanggil lebih dulu di dalam lock.
- [ ] **Step 4:** `node --test tests/c4a.test.js`. Harapannya PASS.
- [ ] **Step 5:** Commit: `feat(c4a): buat/tutup/get laporan C4A`

### Task 3: Temuan C4A (simpanTemuanInspeksi_ menerima c4aId + uniqueid)

**Files:**
- Modify: `backend/src/modules/52_InsJar.js:735-774` (`simpanTemuanInspeksi_`), `:560-577` (`barisTemuanInsJar_`)
- Modify: `backend/src/modules/104_C4A.js` (`laporanUntukTemuanC4A_`)
- Test: `tests/c4a.test.js`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `simpanTemuanInspeksi_` menerima isian opsional `c4aId` (8 hex) dan `uniqueid` (8 hex). Keduanya harus dikirim bersamaan.
  - Kalau `c4aId` ada: penyulang dan section **diambil dari laporan** (isian `penyulang` / `section` / `garduId` / `objekInspeksi` Gardu ditolak `FIELD_TIDAK_DIKENAL`), tanggal = tanggal laporan, kolom `c4a_id` dan `uniqueid` terisi, `jumlah_temuan` laporan dihitung ulang tanpa menaikkan revision, lalu `jadwalkanSinkronUiw_()` dipanggil.
  - Laporan cukup **ada** dan milik user yang sama. Statusnya boleh SELESAI: lihat Review Focus 1.
  - `laporanUntukTemuanC4A_(rows, c4aId, userId) -> baris laporan` (galat `C4A_TIDAK_DITEMUKAN` / `BUKAN_MILIK_ANDA`).
  - Kode galat baru: `UNIQUEID_BENTROK`.

- [ ] **Step 1: Tes gagal**:
  - `'temuan C4A: penyulang/section dari laporan, kode tetap pola PEG, c4a_id + uniqueid tertulis, jumlah_temuan laporan naik'`. Assert `kodeTemuan === 'PEG-16130' + ymd + '001-PNY.001-TJR.001'`.
  - `'temuan C4A: diterima walau laporan sudah ditutup otomatis kemarin (tanggal = tanggal laporan)'`.
  - `'temuan C4A: uniqueid ganda = UNIQUEID_BENTROK, kirim ulang idBaris sama = duplikat'`.
  - `'temuan tanpa c4aId: perilaku lama tidak berubah, c4a_id/uniqueid kosong, tidak menjadwalkan sinkron'`.
- [ ] **Step 2:** Jalankan tesnya. Harapannya FAIL.
- [ ] **Step 3:** Implementasikan. `barisTemuanInsJar_` menerima `konteks.c4aId` dan `konteks.uniqueid`.
- [ ] **Step 4:** Jalankan `node --test tests/c4a.test.js`, lalu `npm test`. Harapannya PASS.
- [ ] **Step 5:** Commit: `feat(c4a): temuan menempel ke laporan C4A`

### Task 4: Arsip C4A di server

**Files:**
- Modify: `backend/src/modules/104_C4A.js`, `backend/src/02_Router.js`
- Test: `tests/c4a.test.js`

**Interfaces:**
- Produces:
  - `getArsipC4A_(sesi, {dari, sampai}) -> {dari, sampai, hari: [{tanggal, jumlahLaporan, penyulang: n, section: n, Komponen, Peralatan, Pohon, Lainnya}]}`. Isinya hanya tanggal **sebelum hari ini**, terbaru dulu. Rentang maks `TEMUAN_RENTANG_MAKS_HARI_` (92). Semua laporan dari semua admin ikut. Router `getArsipC4A` (baca).
  - Rincian satu hari memakai `getTemuanInspeksi_(sesi, {tanggal})` yang sudah ada, disaring di HP untuk `c4aId` yang terisi. Tidak ada endpoint baru.
  - `kategoriUiwTemuan_(jenisTemuanId, petaJenis) -> 'Komponen'|'Peralatan'|'Pohon'|'Lainnya'`: dipakai juga oleh ringkasan Task 2. Jenis yang belum dipetakan masuk `Lainnya`.

- [ ] **Step 1: Tes gagal** `'arsip: per hari sebelum hari ini, jumlah per kategori, hari ini tidak ikut, rentang > 92 hari ditolak'`.
- [ ] **Step 2:** Jalankan tesnya. Harapannya FAIL.
- [ ] **Step 3:** Implementasikan.
- [ ] **Step 4:** Jalankan tesnya. Harapannya PASS.
- [ ] **Step 5:** Commit: `feat(c4a): arsip C4A per hari`

### Task 5: Antrean UIW, logika murni (pemetaan baris + pemeriksaan per baris)

**Files:**
- Create: `backend/src/modules/106_UIW_Antrean.js`
- Test: `tests/c4a.test.js`

**Interfaces:**
- Consumes: Task 1–3 (baris `c4a_laporan`, `db_temuan_inspeksi`, `db_Jenis_Temuan`, `db_temuan_tindak_lanjut`, `db_Users`).
- Produces:
  - `UIW_KOLOM_` = judul kolom UIW persis dari Global Constraints: `{Inspeksi: [...], Temuan: [...], 'KMS': [...]}`.
  - `sectionAwalUiw_(section) -> string`.
  - `catatAntreanUiw_(t, jenis: 'INSPEKSI'|'TEMUAN'|'KMS', kunci, c4aId)`: membuat baris `ANTRE` baru, atau mengembalikan baris yang ada ke `ANTRE` kalau sidik isinya berubah.
  - `segarkanAntreanUiw_(ctx) -> {antre: n, hapus: n}`: memindai sumber. Laporan atau temuan C4A yang belum punya baris antrean dibuatkan. Sidik yang berubah (status WO, tindak lanjut, isi temuan, jarak) mengembalikan baris ke `ANTRE`. Baris antrean yang kuncinya sudah tidak ada di sumber (laporan atau temuan dihapus) berubah menjadi `HAPUS`.
  - `barisUiw_(ent, ctx) -> {ok: true, sheet, nilai: Object<judulKolom, nilai>, foto: [{slot: 'AWAL'|'AKHIR', fileId}]} | {ok: false, status: 'PERLU_DATA'|'MENUNGGU', bantu: string}`. Fungsi ini menjalankan pemeriksaan spec 7.4 nomor 7, 8, 9, 10, dan 12. Nilai kolom ikut tabel spec 7.3: Petugas = `db_Users.nama` dari `user_id` laporan; Status `Open`/`Close` (`status_wo === 'SELESAI'`); Tindak Lanjut = `pekerjaan` baris TL digabung `', '`; data akhir dari baris TL **terakhir**; Kategori dan Temuan Awal berisi **teks** `uiw_kategori` / `uiw_temuan`.
  - `sidikUiw_(nilai) -> string` (SHA-256 hex dari JSON nilai, `Utilities.computeDigest`).
  - `namaFotoUiw_(uniqueid, kolom: 'Foto Awal'|'Foto Akhir', waktuMs) -> 'Temuan_Images/<uniqueid>.<Foto Awal|Foto Akhir>.<HHmmss>.jpg'`.
  - `jedaGagalUiw_(percobaan) -> ms`: 5 / 15 / 60 menit (`[300000, 900000, 3600000]`, lalu tetap 3600000).
  - Teks bantu persis: `kategori UIW belum dipetakan untuk "<jenis>"`, `kolom <nama> kosong`, `foto asli hilang`, `foto belum terunggah`, `jarak belum dihitung`.

- [ ] **Step 1: Tes gagal**:
  - `'section awal: "ACR Palas - LBS Delas" -> "ACR Palas"; "ACR A - LBS B - Ujung" -> "ACR A"; "GH Toboali" -> "GH Toboali"; spasi di-trim'`.
  - `'barisUiw Inspeksi: InspeksiID=c4a_id, UP3 dari UIW_UP3, Petugas=nama db_Users'`.
  - `'barisUiw Temuan: Kategori/Temuan Awal teks dari uiw_*, Lokasi "lat, lng", Status Open; setelah WO SELESAI = Close + Tindak Lanjut gabungan pekerjaan + data akhir dari TL terakhir'`.
  - `'barisUiw: jenis jt-3 tanpa peta = PERLU_DATA dengan bantu persis; setelah uiw_* diisi = ok (Review Focus 3)'`.
  - `'barisUiw: foto belum terunggah = MENUNGGU; file foto hilang (stub DriveApp melempar) = PERLU_DATA "foto asli hilang"'`.
  - `'barisUiw KMS: jarak belum dihitung = MENUNGGU; Id=c4a_id, Panjang=jarak_km'`.
  - `'segarkan: temuan C4A baru masuk ANTRE, perubahan status WO mengembalikan TERKIRIM ke ANTRE, temuan yang dihapus dari sumber jadi HAPUS, temuan tanpa c4a_id diabaikan'`.
  - `'jeda gagal: 1->5 mnt, 2->15 mnt, 3+->60 mnt'`.
- [ ] **Step 2:** Jalankan tesnya. Harapannya FAIL.
- [ ] **Step 3:** Implementasikan.
- [ ] **Step 4:** Jalankan tesnya. Harapannya PASS.
- [ ] **Step 5:** Commit: `feat(uiw): pemetaan baris + pemeriksaan antrean`

### Task 6: Jarak jalan

**Files:**
- Create: `backend/src/modules/105_C4A_Jarak.js`
- Test: `tests/c4a.test.js`

**Interfaces:**
- Produces:
  - `UIW_SINGGAH_MAKS_ = 23`.
  - `pilihSinggahC4A_(titik: [{lat, lng}], maks) -> titik[]`: kalau `titik.length <= maks`, kembalikan semua. Kalau lebih, ambil `maks` titik merata menurut indeks (titik pertama dan terakhir ikut).
  - `hitungJarakC4A_(laporan, temuanUrut) -> {jarakKm, metode: 'RUTE_JALAN'|'NOL', status: 'SELESAI'|'GAGAL', bantu}`. Laporan tanpa temuan dan ditutup otomatis menghasilkan `NOL` (0). Kalau tidak: `Maps.newDirectionFinder().setOrigin().setDestination().addWaypoint(...)` dengan `setMode(Maps.DirectionFinder.Mode.DRIVING)`, lalu jarak = jumlah `legs[i].distance.value` / 1000, dibulatkan 3 desimal. Kalau status respons bukan `OK` atau terjadi galat, hasilnya `GAGAL` dengan bantu berisi status atau pesannya.
  - `prosesJarakC4A_(ctx, batas) -> n`: mengisi `jarak_km`, `metode_jarak`, `status_jarak` untuk laporan SELESAI yang `status_jarak` MENUNGGU atau GAGAL (jeda `jedaGagalUiw_`), lalu `catatAntreanUiw_('KMS', ...)`.

- [ ] **Step 1: Tes gagal**:
  - `'jarak: jumlah legs stub Maps (1200 m + 800 m = 2 km), temuan jadi titik singgah urut waktu'`.
  - `'jarak: 30 temuan -> 23 singgah, pertama dan terakhir ikut'`.
  - `'jarak: tutup otomatis tanpa temuan = NOL 0; Maps ZERO_RESULTS = GAGAL, dicoba lagi setelah jeda'`.
- [ ] **Step 2:** Jalankan tesnya. Harapannya FAIL.
- [ ] **Step 3:** Implementasikan.
- [ ] **Step 4:** Jalankan tesnya. Harapannya PASS.
- [ ] **Step 5:** Commit: `feat(c4a): jarak jalan Maps`

### Task 7: Adapter file UIW (pemeriksaan awal + tulis satu kali)

**Files:**
- Modify: `backend/src/modules/107_UIW_File.js` (memakai teknik yang lulus di Task 0)
- Test: `tests/c4a.test.js`

**Interfaces:**
- Produces:
  - `periksaAwalUiw_() -> {ok: true, file, folder} | {ok: false, bantu}`. Ini pemeriksaan spec 7.4 nomor 1–5: properti lengkap, file bisa dibuka dan ditulis, folder bisa ditulis, ukuran < 40 MB. Judul kolom (nomor 4) diperiksa di `tulisFileUiw_` setelah file dibuka sebagai sheet.
  - `salinFotoUiw_(fileIdAsal, namaUiw, folder) -> void`: `DriveApp.getFileById(id).makeCopy(nama tanpa awalan "Temuan_Images/", folder)`. Kalau nama itu sudah ada di folder, langkah ini dilewati (idempoten).
  - `hapusFotoUiw_(namaUiw, folder)`.
  - `tulisFileUiw_(perubahan: {upsert: [{sheet, nilai}], hapus: [{sheet, kolomKunci, kunci}]}) -> {ditulis: n, dihapus: n} | throws SisiError_('STRUKTUR_UIW_BERUBAH', '<sheet>: <kolom>')`. Urutannya: buka sebagai Google Sheet sementara, cocokkan judul kolom dengan `UIW_KOLOM_` (kalau beda, lempar galat **sebelum** apa pun ditulis), buat cadangan file asli (`makeCopy` ke subfolder `Cadangan` di `UIW_FOTO_FOLDER_ID`; simpan 7 cadangan terakhir), upsert berdasarkan kolom kunci (Inspeksi `InspeksiID`, Temuan `Temuan ID`, KMS `Id`), hapus baris, ekspor, lalu perbarui isi file asli dengan ID yang sama, dan terakhir hapus Google Sheet sementara (di `finally`).
  - `UIW_BATAS_BYTE_ = 40 * 1024 * 1024`.

- [ ] **Step 1: Tes gagal** (Drive, UrlFetch, dan Spreadsheet dipalsukan di `duniaC4A`):
  - `'periksa awal: UIW_UP3 kosong / file tidak bisa dibuka / ukuran 41 MB -> ok false dengan bantu'`.
  - `'tulis: judul kolom Temuan diubah -> STRUKTUR_UIW_BERUBAH, Drive.Files.update tidak dipanggil (Review Focus 4)'`.
  - `'tulis: upsert berdasarkan kunci (baris ada = diperbarui, baru = ditambah), hapus baris, sheet lain tidak disentuh, ID file sama, sementara dihapus walau ekspor gagal'`.
  - `'salin foto: nama sudah ada di folder = tidak disalin lagi'`.
- [ ] **Step 2:** Jalankan tesnya. Harapannya FAIL.
- [ ] **Step 3:** Implementasikan, lalu hapus `ADMIN_ujiSalinanUiw` dari Task 0.
- [ ] **Step 4:** Jalankan tesnya. Harapannya PASS.
- [ ] **Step 5:** Commit: `feat(uiw): adapter file xlsx UIW`

### Task 8: Putaran sinkron, pemicu, dan tutup otomatis

**Files:**
- Create: `backend/src/modules/108_UIW_Pemicu.js`
- Modify: `backend/src/modules/73_Pemakaian.js:26-30` (`PAKAI_PRIORITAS_`: `ADMIN_pemicuSinkronUiw: 'RENDAH'`, `ADMIN_pemicuHarianC4A: 'NORMAL'`)
- Test: `tests/c4a.test.js`

**Interfaces:**
- Consumes: Task 2 sampai Task 7.
- Produces:
  - `jadwalkanSinkronUiw_(jedaMs?) -> boolean`: pola `jadwalkanSheetLamaHi_` (`35_Gardu_HI.js:433`). Tanda `UIW_PEMICU`, basi 10 menit, jeda bawaan 120000 ms.
  - `ADMIN_pemicuSinkronUiw(e)`: memanggil `pastikanPemilik_()` lalu `jalanPemicu_('ADMIN_pemicuSinkronUiw', e, putaranSinkronUiw_)`.
  - `putaranSinkronUiw_(mulaiMs?) -> {status, ditulis, dihapus, sisa, alasanSisa: ''|'WAKTU'|'GAGAL', bantuFile}`. Urutannya: hapus pemicu sendiri dan tandanya, ambil kunci (`LockService.getScriptLock().tryLock(1000)`; gagal = keluar tanpa status), `segarkanAntreanUiw_`, `prosesJarakC4A_`, `periksaAwalUiw_` (gagal = simpan bantu ke Script Property `UIW_STATUS_FILE` lalu berhenti), proses baris `ANTRE`/`GAGAL`/`PERLU_DATA`/`MENUNGGU` yang `coba_lagi_setelah` sudah lewat, urut `waktu_coba` terlama dulu, dengan cek waktu, lalu `tulisFileUiw_`, lalu tandai `TERKIRIM` / `TERHAPUS`, lalu jadwalkan pemicu berikutnya kalau ada sisa.
  - Cek waktu: `sisa = 270000 - (now - mulai)`. Pesanan tahap 3 = `UIW_DURASI_TULIS_MS` (Script Property, bawaan 60000) × 1,5. Perkiraan per baris = `UIW_DURASI_BARIS_MS` (bawaan 3000). Baris berikutnya hanya diambil kalau `sisa > pesanan + perkiraanBaris`. Setelah putaran, kedua angka diperbarui dengan rata-rata bergerak (`baru = lama * 0.7 + ukur * 0.3`).
  - Baris `HAPUS`: masuk `perubahan.hapus`. Untuk temuan, setelah tulis berhasil, `hapusFotoUiw_` dijalankan untuk `foto_awal_uiw` / `foto_akhir_uiw`, lalu status menjadi `TERHAPUS`. Penghapusan laporan juga menghapus baris Inspeksi dan KMS-nya.
  - Kalau `tulisFileUiw_` gagal: semua baris putaran itu tetap di status semula (bukan TERKIRIM), `percobaan` +1, `coba_lagi_setelah` = sekarang + `jedaGagalUiw_`, bantu = pesan galat.
  - `tutupOtomatisC4A_(hariIni) -> n`: laporan TERBUKA dengan tanggal < hari ini ditutup. Titik akhir = koordinat temuan terakhir (urut `timestamp`) laporan itu, `sumber_akhir = 'TEMUAN_TERAKHIR'`. Kalau tidak ada temuan, titik akhir = titik awal dan jarak NOL. `ditutup_otomatis = true`.
  - `ADMIN_pemicuHarianC4A(e)`: memanggil `tutupOtomatisC4A_` lalu `jadwalkanSinkronUiw_()` kalau antrean berisi.
  - `ADMIN_pasangPemicuC4A()`: menghapus pemicu harian lama, lalu `everyDays(1).atHour(0).nearMinute(5).inTimezone('Asia/Jakarta')`.

- [ ] **Step 1: Tes gagal**:
  - `'jadwalkan: simpan beruntun = satu pemicu, tanda basi 10 menit = pasang ulang'`.
  - `'putaran: 3 temuan + laporan -> satu kali tulisFileUiw_, semua TERKIRIM, foto disalin, tanpa sisa tidak memasang pemicu'`.
  - `'putaran: waktu habis setelah baris ke-2 (jam palsu) -> 2 ditulis, sisanya ANTRE, pemicu dipasang 2 menit'`.
  - `'putaran: tulisFileUiw_ melempar -> tidak ada TERKIRIM, percobaan 1, coba lagi 5 menit, pemicu dipasang'`.
  - `'putaran: penandaan TERKIRIM gagal lalu putaran ulang -> upsert, tidak ada baris ganda di file palsu'`.
  - `'putaran: periksa awal gagal -> UIW_STATUS_FILE terisi, baris tidak disentuh'`.
  - `'tutup otomatis: laporan kemarin TERBUKA -> SELESAI, titik akhir = temuan terakhir, ditutup_otomatis true; tanpa temuan -> jarak NOL'`.
- [ ] **Step 2:** Jalankan tesnya. Harapannya FAIL.
- [ ] **Step 3:** Implementasikan.
- [ ] **Step 4:** Jalankan `node --test tests/c4a.test.js`, lalu `npm test`. Harapannya PASS.
- [ ] **Step 5:** Commit: `feat(uiw): putaran sinkron + pemicu sekali jalan + tutup otomatis`

### Task 9: HP: data dan antrean Laporan C4A

**Files:**
- Create: `mobile/lib/features/c4a/c4a_model.dart`
- Modify: `mobile/lib/features/insjar/temuan_admin_antre.dart`
- Test: `mobile/test/c4a_laporan_test.dart`, `mobile/test/temuan_admin_antre_test.dart`

**Interfaces:**
- Produces:
  - `String buatUniqueIdC4a([Random? r])`: 8 hex huruf kecil.
  - `class LaporanC4A { c4aId, kodeC4a, tanggal, penyulang, section, latAwal, lngAwal, sumberAwal, latAkhir?, lngAkhir?, status: 'TERBUKA'|'SELESAI', jarakKm?, statusKirim; bool get terbukaHariIni(String hariIni); Map toJson(); factory fromJson; }`
  - `AntreanTemuanAdmin` mendapat jenis item baru: `{jenis: 'C4A_BUKA', c4aId, data}` dan `{jenis: 'C4A_TUTUP', c4aId, data}`. Item lama tanpa `jenis` dianggap `TEMUAN`. `kirim()` memproses item **berurutan**: BUKA, lalu temuan, lalu TUTUP.
  - Kalau `buatLaporanC4A` menjawab `ditolak: 'C4A_SUDAH_ADA'`, item BUKA dibuang, semua item TEMUAN/TUTUP dengan `c4aId` lama diganti ke `laporan.c4aId` dari server, titik akhir HP kedua dibuang (item TUTUP ikut dibuang), lalu `laporanAktif` diganti dengan laporan server. Review Focus 2.
  - `Future<void> bukaLaporan(Sesi, LaporanC4A)`, `Future<void> tutupLaporan(Sesi, c4aId, lat, lng, sumber)`, `LaporanC4A? laporanAktif(userId)` (tersimpan di `master_cache`, kunci `c4a_aktif_<userId>`).
  - `tambahTemuan(...)` menerima `c4aId` dan `uniqueid`. Keduanya masuk ke `data` yang dikirim.

- [ ] **Step 1: Tes gagal** (`flutter test test/c4a_laporan_test.dart`):
  - `'uniqueid 8 hex'`.
  - `'urutan kirim: C4A_BUKA, TEMUAN, C4A_TUTUP walau ditambah berselang'`.
  - `'C4A_SUDAH_ADA: temuan dipindah ke c4aId server, TUTUP lokal dibuang, laporanAktif = laporan server'`.
  - `'laporan TERBUKA tanggal kemarin di HP = tidak aktif (boleh buat baru)'`.
  - `'item lama tanpa jenis tetap terkirim sebagai temuan'` (di `temuan_admin_antre_test.dart`).
- [ ] **Step 2:** Jalankan tesnya. Harapannya FAIL.
- [ ] **Step 3:** Implementasikan.
- [ ] **Step 4:** `cd mobile && flutter test test/c4a_laporan_test.dart test/temuan_admin_antre_test.dart`. Harapannya PASS.
- [ ] **Step 5:** Commit: `feat(c4a): antrean laporan C4A di HP`

### Task 10: HP: menu C4A, tiga tab

**Files:**
- Modify: `mobile/lib/features/insjar/input_temuan_inspeksi_screen.dart` (tab 2 menjadi 3; tab "Input Temuan" diganti `LaporanC4ATab`)
- Create: `mobile/lib/features/c4a/c4a_laporan_tab.dart`, `mobile/lib/features/c4a/c4a_arsip_tab.dart`
- Modify: `mobile/lib/features/operasi/katalog_operasi.dart:61-62` (nama `'C4A'`, desc baru), `docs/db_Menu.tsv:14` (label `C4A`)
- Test: `mobile/test/c4a_ui_test.dart`

**Interfaces:**
- Consumes: Task 9, `PilihTitikPetaScreen` (`mobile/lib/features/tiang/pilih_titik_peta.dart`, hasil `LatLng`), `Gps`, endpoint `getLaporanC4A` dan `getArsipC4A`.
- Produces: tab berurutan `Laporan C4A`, `Daftar Temuan`, `Arsip C4A`.
  - **Laporan C4A:**
    - Di atas: 3 kartu ringkasan hari ini (Komponen / Peralatan / Pohon). Angkanya dihitung dari daftar HP plus antrean, jadi tetap muncul offline.
    - Tanpa laporan aktif: tombol "Buat Laporan C4A" membuka form (penyulang, section dari master; titik awal GPS atau "Pilih di peta").
    - Dengan laporan aktif: kartu laporan dengan tombol **+ Tambah Temuan** dan tombol **Ambil Titik Akhir** (GPS atau peta, dengan konfirmasi).
    - Form temuan tetap `bukaFormHartek`/`isianTemuan`, tetapi tanpa pilihan penyulang, section, dan gardu. Nilainya ikut laporan.
  - **Arsip C4A:** pemilih rentang tanggal (bawaan 7 hari sebelum hari ini) dan kartu per hari (`getArsipC4A`). Kartu yang diketuk memuat `getTemuanInspeksi({tanggal})`, disaring `c4aId` terisi, lalu ditampilkan memakai baris kartu temuan yang sudah ada.
  - **Daftar Temuan:** tetap, ditambah label kategori UIW (dari `master.jenisTemuan[].uiwKategori`). `getMasterTemuanInspeksi_` mengirim `uiwKode`, `uiwKategori`, `uiwTemuan` per jenis. Tambahkan ini di `masterInsJar_` dan perbarui tes di Task 1.

- [ ] **Step 1: Tes widget gagal** (`flutter test test/c4a_ui_test.dart`):
  - `'tanpa laporan aktif: tombol + Tambah Temuan tidak ada, Buat Laporan C4A ada'`.
  - `'setelah laporan dibuat: + Tambah Temuan muncul, form tanpa pilihan penyulang'`.
  - `'ringkasan: 2 Komponen, 1 Pohon dari daftar HP'`.
  - `'arsip: kartu per hari, ketuk = rincian temuan hari itu'`.
- [ ] **Step 2:** Jalankan tesnya. Harapannya FAIL.
- [ ] **Step 3:** Implementasikan. Warna dan gaya memakai `HartekGaya`/`AppColors` yang ada. Palet baru dikerjakan di rencana terpisah.
- [ ] **Step 4:** `cd mobile && flutter test`. Harapannya semua PASS. Lalu `flutter analyze`, harapannya tanpa galat baru.
- [ ] **Step 5:** Commit: `feat(c4a): menu C4A tiga tab`

### Task 11: Rilis staging dan uji bersama

**Files:**
- Modify: `docs/API-CONTRACT.md` (aksi baru), `README.md` (baris status uji versi baru: BELUM DIUJI), `docs/pratinjau-mingguan/2026-11-15.md`

- [ ] **Step 1:** Perbarui `docs/API-CONTRACT.md` dengan `buatLaporanC4A`, `tutupLaporanC4A`, `getLaporanC4A`, `getArsipC4A`, isian baru `simpanTemuanInspeksi` (`c4aId`, `uniqueid`), dan kode galat baru.
- [ ] **Step 2:** `npm test`. Harapannya PASS, kecuali 3 tes audit guard yang sudah gagal sebelumnya (`docs/pratinjau-mingguan/2026-11-08.md`).
- [ ] **Step 3:** `npm run deploy:staging`.
- [ ] **Step 4:** Di editor staging: jalankan `ADMIN_siapkanSheetC4A` dengan uji dulu, lalu sungguhan. Isi `uiw_kode`, `uiw_kategori`, `uiw_temuan` di `db_Jenis_Temuan` staging. Isi `UIW_FILE_ID` (salinan dari Task 0), `UIW_FOTO_FOLDER_ID` (folder `Temuan_Images` uji), dan `UIW_UP3`. Lalu jalankan `ADMIN_pasangPemicuC4A`, `ADMIN_bersihkanCache`, dan `ADMIN_cekKonfigurasi`.
- [ ] **Step 5:** Ganti label menu `OPS_INPUT_TEMUAN` di `db_Menu` staging menjadi `C4A`.
- [ ] **Step 6:** Bangun APK staging (`flutter build apk --flavor staging --dart-define-from-file=env/staging.json`).
- [ ] **Step 7:** Tulis daftar uji untuk Master Guswan di `README.md`: buat laporan, tambah temuan offline, ambil titik akhir, cek salinan xlsx (Inspeksi / Temuan / KMS dan foto di `Temuan_Images`), uji dua HP, uji lupa tutup (tunggu pemicu 00.05), dan ubah judul kolom salinan untuk memastikan tidak ada penulisan.
- [ ] **Step 8:** Hentikan server visual companion (`bash …/brainstorming/scripts/stop-server.sh`) dan tambahkan `.superpowers/` ke `.gitignore`.

---

**Di luar rencana ini (rencana terpisah setelah C4A):** palet desain versi mobile disamakan dengan versi web (Desain Hijau Rimba, tahap 2–5).
