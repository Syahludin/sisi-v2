# Gudang Material Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stok MCB per tim Yandal 13-17 (pemeriksaan awal shift, pemakaian, selisih, koreksi, tambah/kirim/tarik stok, izin material per tim) di backend Apps Script, web admin, dan HP.

**Architecture:** Stok = jumlah baris buku mutasi `db_Material_Mutasi` (tidak ada saldo tersimpan). Logika murni (saldo, perbandingan, nomor pemakaian, izin) di `74_Gudang_Stok.js`; akses sheet + guard di `75_Gudang_Data.js`; endpoint admin di `76_Gudang_Admin.js`; endpoint Yandal di `77_Gudang_Yandal.js`. HP dan web memakai endpoint yang sama. Pola mengikuti Absensi v1.0.51 (`66_Absensi.js`, `abs_Absensi`, `ABSENSI_SHEET_ID`).

**Tech Stack:** Apps Script (JS ES5-style, `node:test` + `tests/harness.js`), React/Vite web (`node --test`), Flutter (`flutter test`/`flutter analyze`).

**Spec:** `docs/superpowers/specs/2026-11-03-gudang-material-design.md` (disetujui Master Guswan 3 Nov 2026). Baca spec dulu; plan ini hanya memuat keputusan pelaksanaan.

## Global Constraints

- Tidak ada `git add` / `git commit` / deploy: pohon kerja repo kotor dan Master Guswan melarang commit. Setiap task diakhiri catatan di `docs/pratinjau-mingguan/2026-11-08.md` (berkas disentuh, tes, ruling).
- Semua sheet baru berkolom pertama **`No`** (nomor urut diisi otomatis, bukan kunci). Kunci/rujukan = kolom `*_id`.
- Kolom persis seperti spec (bagian "Model data"). Header dicek persis lewat `cekHeaderSkema_`. Teks ke sheet lewat `tulisBlok_` (sudah `amanSheet_`).
- Script Property baru: `GUDANG_SHEET_ID`, `GUDANG_FOTO_FOLDER_ID` (tambah di `cfg_()` + `CFG_JSON`; kosong = `CONFIG_TIDAK_LENGKAP`).
- Menu: `OPS_GUDANG_MATERIAL` (Material Gudang, admin, `KEDUANYA`), `OPS_STOK_MATERIAL` (Stok Material, Yandal, `MOBILE`).
- Jenis MCB = (`material_id`, `daya`, `merk`, `status_mcb`); `status_mcb` ∈ {`Baru`, `Ex-Handal`}. Satu entri HP = satu MCB.
- Nilai enum persis spec: `jenis_mutasi` {MASUK_GUDANG, KIRIM_TIM, TARIK_TIM, KOREKSI_GUDANG, KOREKSI_TIM, PAKAI, HILANG, TAMBAHAN}; `status` pemeriksaan {COCOK, MENUNGGU_ADMIN, DISETUJUI, **DIKEMBALIKAN**}; `jenis_catatan` {NORMAL, SUSULAN, DIKOREKSI, BATAL}; `arah` {KURANG, LEBIH}; selisih `status` {MENUNGGU, SELESAI}; `cara_penyelesaian` {SUSULAN, HILANG, TAMBAHAN_MASUK, SALAH_CATAT, SALAH_HITUNG}.
- Nomor Pemakaian = `<Kode Shift>-MCB.nnn` (nnn 3 digit, `pad3_`, urut per Kode Shift, tidak dipakai ulang walau baris BATAL).
- Kode galat baru: `STOK_TIDAK_CUKUP`, `MATERIAL_TIDAK_DIIZINKAN`, `PEMERIKSAAN_BELUM_ADA`, `SELISIH_MENUNGGU`, `FOTO_WAJIB`, `SHIFT_SEBELUMNYA_TIDAK_ADA`, `SELISIH_TIDAK_DITEMUKAN`, `ALASAN_WAJIB`; selain itu pakai kode yang ada (`DATA_BERUBAH`, `DATA_GANDA`, `CONFIG_TIDAK_LENGKAP`, `BUKAN_MILIK_TIM`, `FIELD_WAJIB`).
- Penulisan multi-baris di dalam `denganLock_`; semua validasi dilakukan **sebelum** menulis apa pun. Pemakaian/pemeriksaan membawa id buatan HP (`pemakaianId` uuid / kunci tim+tanggal+shift) sehingga kirim ulang tidak menggandakan.
- Shift Yandal: `shiftYandal_(ms)` → `{ no, tanggal, kunci, mulai, sampai }` (3 shift/hari). Shift sebelumnya = `shiftYandal_(mulai - 1)`. Waktu server (`sekarangMsAbs_()` seperti Absensi), bukan jam HP.
- Endpoint baru didaftarkan di tiga daftar audit `tests/backend.test.js` (cekMilik, matriks guard, daftar 'awal') dan bila menulis di daftar endpoint tulis.

## Review Focus

- Dua HP tim yang sama mengirim pemeriksaan awal shift bersamaan: satu baris saja (kunci tim+tanggal+shift), yang kedua menerima hasil yang sama.
- Dua pemakaian bersamaan atas jenis MCB yang saldonya 1: hanya satu lolos, yang lain `STOK_TIDAK_CUKUP`.
- Pemeriksaan pertama tim tanpa mutasi apa pun: semua jenis jadi selisih LEBIH, bukan galat.
- Selisih KURANG pada satu jenis dan LEBIH pada jenis lain dalam pemeriksaan yang sama; jenis yang ada di perkiraan tetapi tidak diinput sama sekali tetap muncul sebagai KURANG.
- Material lama Hartek/WO sebelum `ADMIN_isiIzinMaterialAwal` dijalankan: daftar kosong adalah perilaku yang sah (diuji eksplisit), sesudahnya penuh lagi.

---

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `backend/src/modules/74_Gudang_Stok.js` (baru) | Fungsi **murni**: saldo, perkiraan, banding, nomor pemakaian, izin |
| `backend/src/modules/75_Gudang_Data.js` (baru) | Skema header, `tabelGudang_`, guard peran/tim, penulis mutasi, foto Drive, konsistensi |
| `backend/src/modules/76_Gudang_Admin.js` (baru) | Endpoint admin (stok, tarik/kirim, selisih, pemakaian, izin) + alat `ADMIN_*` |
| `backend/src/modules/77_Gudang_Yandal.js` (baru) | Endpoint Yandal (pemeriksaan, pemakaian, susulan) |
| `backend/src/00_Config.js`, `90_AdminTools.js`, `02_Router.js`, `09_Versi.js` | Konfigurasi, skema, rute, versi |
| `backend/src/modules/50_Hartek.js`, `56_TindakLanjut.js` | Saring pilihan material dengan izin tim |
| `tests/gudang.test.js` (baru) | Semua tes backend gudang (muat harness seperti `tests/asetItb.test.js`); daftarkan di skrip `test` root |
| `web/src/gudang.js` (baru), `web/src/pages/MaterialGudang.jsx` + `web/src/pages/gudang/*.jsx` (baru), `web/src/katalog.js`, `web/test/gudang.test.js` (baru) | Web admin |
| `mobile/lib/features/gudang/*.dart` (baru), `core/deps.dart`, `core/kode_error.dart`, `features/operasi/katalog_operasi.dart`, `operasi_screen.dart`, `mobile/test/gudang_*_test.dart` (baru) | HP Yandal + admin |
| `docs/db_Menu.tsv`, `docs/db_Akses.tsv`, `docs/API-CONTRACT.md`, `README.md` | Menu, akses, kontrak, urutan rilis |

---

### Task 1: Skema, konfigurasi, dan alat penyiapan sheet

**Files:**
- Create: `backend/src/modules/75_Gudang_Data.js` (bagian skema), `tests/gudang.test.js`
- Modify: `backend/src/00_Config.js`, `backend/src/90_AdminTools.js` (skema `GUDANG_SHEET_ID`, `db_Material_Tim` di MASTER, `sumberOpsional`, panggilan cek), `package.json` root skrip `test`

**Interfaces:**
- Produces: konstanta `GUD_HEADER_` = `{ db_Material_Mutasi, db_Stok_Pemeriksaan, db_Stok_Pemeriksaan_Item, db_Pemakaian_MCB, db_Stok_Selisih, db_Material_LogKoreksi }` (array kolom persis spec, `No` pertama); `GUD_IZIN_HEADER_` (db_Material_Tim); `wajibKonfigGudang_(): void`; `tabelGudang_(nama: string): Tabel` (cek header skema); `ADMIN_siapkanSheetGudang(): void`; `ADMIN_cekSheetGudang(): void`.

- [ ] **Step 1: Tes gagal** di `tests/gudang.test.js`: `header skema gudang persis spec` (bandingkan tiap `GUD_HEADER_[x]` dengan daftar kolom spec; `No` indeks 0); `wajibKonfigGudang_ menolak GUDANG_SHEET_ID kosong dengan CONFIG_TIDAK_LENGKAP`; `ADMIN_siapkanSheetGudang idempoten` (dua kali jalan = sheet/header sama, baris `MCB` di db_Material tepat satu, 5 baris izin Yandal tepat lima).
- [ ] **Step 2: Jalankan** `node --test tests/gudang.test.js` → FAIL (konstanta tidak ada).
- [ ] **Step 3: Implementasi** skema + `wajibKonfigGudang_`/`tabelGudang_` (tiru `tabelAbsensi_`); `ADMIN_siapkanSheetGudang` membuat sheet + header, memberi format teks pada kolom tanggal/waktu (Ruling T4-3 absensi), menambah baris `MCB` (satuan `unit`) ke `db_Material` bila belum ada dan baris `db_Material_Tim` untuk MCB × tim aktif berjenis YANDAL bernama "YANDAL 13".."YANDAL 17" (cocokkan lewat `db_Tim`, abaikan yang tidak ada, log yang terlewat). Header `db_Material_Tim` masuk skema MASTER di `90_AdminTools.js` sebagai sheet opsional bernomor.
- [ ] **Step 4: Jalankan** tes → PASS; `node --test tests/gudang.test.js tests/asetItb.test.js`.
- [ ] **Step 5:** Catat di pratinjau mingguan (jangan commit).

### Task 2: Logika murni stok (`74_Gudang_Stok.js`)

**Files:**
- Create: `backend/src/modules/74_Gudang_Stok.js`
- Test: `tests/gudang.test.js`

**Interfaces:**
- Produces:
  - `kunciJenis_(r: {material_id, daya, merk, status_mcb}): string`
  - `saldoLokasi_(mutasi: Row[], lokasi: string, sampaiMs?: number): { [kunciJenis]: number }`
  - `bandingStok_(perkiraan: {[kunci]: number}, hitungan: {[kunci]: number}): Array<{kunci, perkiraan, input, selisih, arah: 'KURANG'|'LEBIH'}>` — hanya jenis yang berbeda; union kunci kedua sisi.
  - `nomorPemakaianBerikut_(kodeShift: string, nomorAda: string[]): string`
  - `materialBolehTim_(materialRows: Row[], izinRows: Row[], timId: string): Row[]` — hanya material aktif yang punya baris izin aktif untuk `timId`.

- [ ] **Step 1: Tes gagal**: `saldoLokasi_ menjumlah per jenis dan per lokasi`; `saldo mengabaikan lokasi lain dan memakai tanda jumlah`; `bandingStok_ menandai KURANG dan LEBIH sekaligus dan jenis yang hanya ada di perkiraan sebagai KURANG` (perkiraan `{A:2,B:0}`, hitungan `{A:1,C:1}` → A KURANG 1, C LEBIH 1); `bandingStok_ tanpa beda = []`; `nomorPemakaianBerikut_ memakai nomor tertinggi + 1 dan tidak mengisi lubang` (ada `…-MCB.001`,`…-MCB.003` → `.004`); `materialBolehTim_ tanpa baris izin = tidak boleh`, `izin nonaktif tidak dihitung`, `izin tim lain tidak dihitung`.
- [ ] **Step 2: Jalankan** → FAIL.
- [ ] **Step 3: Implementasi** fungsi di atas (murni, tanpa akses sheet; angka lewat `Number`, kunci jenis `material_id|daya|merk|status_mcb` dengan `trim`).
- [ ] **Step 4: Jalankan** → PASS.
- [ ] **Step 5:** Catat di pratinjau.

### Task 3: Izin material + penyaringan Hartek/WO + alat awal

**Files:**
- Modify: `backend/src/modules/75_Gudang_Data.js` (`izinMaterialRows_`, `materialUntukTim_`), `backend/src/modules/76_Gudang_Admin.js` (baru: `getIzinMaterial_`, `simpanIzinMaterial_`, `ADMIN_isiIzinMaterialAwal`), `backend/src/modules/50_Hartek.js` (≈293, ≈705, hitung ≈962-964), `backend/src/modules/56_TindakLanjut.js` (≈494, ≈662), `backend/src/02_Router.js`
- Test: `tests/gudang.test.js`

**Interfaces:**
- Consumes: `materialBolehTim_` (Task 2).
- Produces: `materialUntukTim_(timId: string): Row[]` (db_Material aktif yang diizinkan); endpoint `getIzinMaterial` (`{}` → `{ material: [{materialId, nama}], tim: [{timId, nama, jenis}], izin: [{materialId, timId, aktif}] }`) dan `simpanIzinMaterial` (`{ materialId: uuid, timIds: uuid[] }` → set izin aktif persis `timIds`; tim lain yang tadinya aktif dinonaktifkan, `revision` naik) di menu `OPS_GUDANG_MATERIAL`; `ADMIN_isiIzinMaterialAwal(): void` (semua material aktif × semua tim aktif berjenis HARTEK; tidak menggandakan; log ringkasan).

- [ ] **Step 1: Tes gagal**: `simpanIzinMaterial mengaktifkan, menonaktifkan, dan tidak pernah menghapus baris`; `pencabutan izin boleh walau tim masih punya saldo` (keputusan 8; hasil memuat `stokTertinggal: n`); `ADMIN_isiIzinMaterialAwal memberi izin ke tim HARTEK saja dan aman diulang`; `Hartek: sebelum alat dijalankan daftar material kosong, sesudahnya penuh` (kedua titik 50_Hartek); `WO: material tersaring tim yang sama`; `material MCB tidak muncul di Hartek`.
- [ ] **Step 2: Jalankan** → FAIL.
- [ ] **Step 3: Implementasi** endpoint + alat; pada tiap titik Hartek/WO ganti pembacaan langsung `tabelMaterialHartek_()` dengan `materialUntukTim_(timPengguna)` (tim = `sesi.timId` bagi Hartek; bagi WO tim yang mencatat material; baca konteks pemanggil untuk memastikan). Migrasi (`50_Hartek.js` ≈1207) tidak disaring. Hasil `simpanIzinMaterial` menghitung `stokTertinggal` dari `saldoLokasi_`.
- [ ] **Step 4: Jalankan** tes gudang + seluruh suite root (`npm test` di akar) → hijau; tes Hartek/WO lama diperbarui hanya bila perlu izin.
- [ ] **Step 5:** Catat di pratinjau, termasuk peringatan: alat awal wajib dijalankan sebelum rilis.

### Task 4: Admin stok: tambah, kirim, tarik, koreksi, lihat

**Files:**
- Modify: `backend/src/modules/75_Gudang_Data.js` (`tulisMutasi_`, guard `wajibAdminGudang_`), `76_Gudang_Admin.js`, `02_Router.js`
- Test: `tests/gudang.test.js`

**Interfaces:**
- Produces: `wajibAdminGudang_(sesi)` (peran ADMIN/SUPER, baris pertama endpoint); `tulisMutasi_(sesi, baris: MutasiBaru[], platform): string[]` (menulis semua baris sekaligus, mengembalikan `mutasi_id`; dipanggil **di dalam** lock pemanggil); endpoint di menu `OPS_GUDANG_MATERIAL`:
  - `getGudangStok` `{ timId?: uuid }` → `{ gudang: Jenis[], tim: [{timId, nama, jenis: Jenis[], tanpaIzin: Jenis[]}], mutasi: Row[] (200 terbaru) }`, `Jenis = {materialId, daya, merk, statusMcb, jumlah}`
  - `tambahStokGudang` `{ materialId, daya, merk, statusMcb, jumlah:int>0, catatan?, foto? }`
  - `kirimStokTim` `{ timId, materialId, daya, merk, statusMcb, jumlah, catatan?, foto? }` → dua baris mutasi (gudang −, tim +); `STOK_TIDAK_CUKUP` bila saldo gudang kurang; `MATERIAL_TIDAK_DIIZINKAN` bila tim tanpa izin
  - `tarikStokTim` `{ timId, …jenis, jumlah, alasan (wajib), foto? }` → tim −, gudang +; `STOK_TIDAK_CUKUP` bila melebihi saldo tim; boleh untuk stok tanpa izin
  - `koreksiStok` `{ lokasi: 'GUDANG'|timId, …jenis, jumlahBaru:int>=0, alasan (wajib) }` → satu baris `KOREKSI_GUDANG`/`KOREKSI_TIM` bertanda selisih + baris `db_Material_LogKoreksi` (`jenis_objek` STOK)

- [ ] **Step 1: Tes gagal**: `kirimStokTim memindahkan dua baris atomik`; `kirim ditolak bila saldo gudang kurang dan tak menulis apa pun`; `kirim ditolak ke tim tanpa izin`; `tarikStokTim ditolak bila melebihi saldo tim`; `tarik boleh untuk material tanpa izin`; `koreksiStok menulis mutasi selisih + LogKoreksi dan butuh alasan`; `petugas Yandal tidak bisa memanggil endpoint admin` (peran dicek sebelum data dibaca); `jumlah bukan bilangan bulat positif ditolak`; `semua endpoint admin tercantum di tiga daftar audit`.
- [ ] **Step 2: Jalankan** → FAIL.
- [ ] **Step 3: Implementasi** sesuai Interfaces; validasi lewat `validasi_` dengan allowlist field; `status_mcb` pilihan {Baru, Ex-Handal}; seluruh tulis dalam `denganLock_`; audit `auditLog_` tiap aksi (`GUDANG_TAMBAH`, `GUDANG_KIRIM`, `GUDANG_TARIK`, `GUDANG_KOREKSI`). Foto opsional lewat `simpanFotoGudang_` (Task 8; di task ini diterima sebagai `null`).
- [ ] **Step 4: Jalankan** tes gudang + tiga tes audit di `tests/backend.test.js` → PASS.
- [ ] **Step 5:** Catat di pratinjau.

### Task 5: Yandal: status stok dan pemeriksaan awal shift

**Files:**
- Create: `backend/src/modules/77_Gudang_Yandal.js`
- Modify: `75_Gudang_Data.js` (`wajibPetugasGudang_`), `02_Router.js`
- Test: `tests/gudang.test.js`

**Interfaces:**
- Consumes: `bandingStok_`, `saldoLokasi_`, `shiftYandal_`, `tulisMutasi_`.
- Produces: `wajibPetugasGudang_(sesi): { timId }` (peran Yandal dengan `sesi.timId` tim aktif; tim diambil dari sesi, **bukan** dari input); endpoint menu `OPS_STOK_MATERIAL`:
  - `getStokYandal` `{}` → `{ shift: {tanggal, no, kunci}, pemeriksaan: null | {pemeriksaanId, status, selisih: Selisih[]}, saldo: Jenis[], pilihan: {material: [{materialId, nama}]}, bolehPakai: boolean, jenisTersedia: Jenis[] }` (`jenisTersedia` = jenis berjumlah > 0 untuk dipilih saat memakai; `bolehPakai` = pemeriksaan ada dan status COCOK/DISETUJUI)
  - `simpanPemeriksaanStok` `{ item: [{materialId, daya, merk, statusMcb}] (satu elemen per MCB, maks 500), foto: FotoGudang }` → `{ pemeriksaanId, status, selisih }`. Kunci pemeriksaan = tim+tanggal+no shift. Sudah ada & status COCOK/DISETUJUI/MENUNGGU_ADMIN → kembalikan yang ada (idempoten); status DIKEMBALIKAN → boleh menimpa (satu kali per pengembalian, `revision` naik, selisih lama yang MENUNGGU diganti). Foto wajib (`FOTO_WAJIB`).

- [ ] **Step 1: Tes gagal**: `pemeriksaan cocok → COCOK, bolehPakai true`; `pemeriksaan kurang+lebih → MENUNGGU_ADMIN dan satu baris selisih per jenis beda`; `pemeriksaan pertama tim tanpa mutasi → semua jenis LEBIH`; `jenis ada di perkiraan tapi tidak diinput → KURANG`; `kirim ulang pemeriksaan yang sama tidak menggandakan baris`; `dua panggilan bersamaan → satu baris pemeriksaan` (simulasikan dengan dua panggilan berurutan di lock yang sama); `shift peralihan menit 59 memakai shiftYandal_ server`; `tanpa foto → FOTO_WAJIB`; `tim diambil dari sesi, field timId di input ditolak (FIELD_TIDAK_DIKENAL)`; `getStokYandal.bolehPakai false saat MENUNGGU_ADMIN`.
- [ ] **Step 2: Jalankan** → FAIL.
- [ ] **Step 3: Implementasi**: hitung `hitungan` dari `item` dikelompokkan per `kunciJenis_`; `perkiraan = saldoLokasi_(mutasi, timId)`; tulis pemeriksaan + item + selisih dalam satu `denganLock_` (validasi semua dulu). Jenis yang tidak punya izin material diabaikan dari perkiraan tetapi **ditolak** di input (`MATERIAL_TIDAK_DIIZINKAN`).
- [ ] **Step 4: Jalankan** → PASS.
- [ ] **Step 5:** Catat di pratinjau.

### Task 6: Yandal: pemakaian dan pemakaian susulan

**Files:**
- Modify: `77_Gudang_Yandal.js`, `75_Gudang_Data.js` (`kodeShiftTim_`, `tulisPemakaian_`), `02_Router.js`
- Test: `tests/gudang.test.js`

**Interfaces:**
- Consumes: `nomorPemakaianBerikut_`, `tulisMutasi_`, pemeriksaan (Task 5).
- Produces: endpoint `simpanPemakaianMcb` `{ pemakaianId: uuid, materialId, daya, merk, statusMcb, nomorMeter (teks bersih, maks 30), keperluan (maks 200), foto: FotoGudang }` → `{ pemakaianId, nomorPemakaian }`; `simpanPemakaianSusulan` `{ pemakaianId: uuid, selisihId: uuid, nomorMeter, keperluan, foto?: FotoGudang }` → `{ pemakaianId, nomorPemakaian, selisih: Selisih }`; `kodeShiftTim_(timId, tanggal, no): string|null` (`Kode Shift` dari baris `yan_Shift` tim+tanggal+shift; bila tidak ada → `null`).

- [ ] **Step 1: Tes gagal**: `pemakaian menulis baris + mutasi PAKAI −1 dan nomor MCB.001`; `pemakaian kedua → MCB.002`; `kirim ulang pemakaianId sama mengembalikan baris yang ada tanpa mutasi kedua`; `ditolak PEMERIKSAAN_BELUM_ADA / SELISIH_MENUNGGU`; `ditolak STOK_TIDAK_CUKUP saat saldo nol` dan `dua pemakaian atas saldo 1: hanya satu lolos`; `ditolak MATERIAL_TIDAK_DIIZINKAN`; `tanpa foto → FOTO_WAJIB`; `susulan: baris atas nama shift dan petugas lama, jenis_catatan SUSULAN, diisi_oleh petugas sekarang, nomor melanjutkan kode shift lama`; `susulan menurunkan jumlah_perkiraan selisih sebanyak 1, selisih 0 → SELESAI/SUSULAN dan bila semua selisih pemeriksaan SELESAI maka pemeriksaan COCOK→ bolehPakai`; `susulan tanpa baris yan_Shift sebelumnya → SHIFT_SEBELUMNYA_TIDAK_ADA (jalur Tidak diketahui tetap berlaku)`; `susulan hanya untuk selisih KURANG milik timnya`.
- [ ] **Step 2: Jalankan** → FAIL.
- [ ] **Step 3: Implementasi**. Petugas "shift lama" diambil dari `yan_Shift` baris tersebut. Status pemeriksaan setelah semua selisihnya SELESAI lewat susulan = `DISETUJUI` (bukan COCOK, supaya jejak terbaca); `bolehPakai` mengikuti. Keputusan plan: susulan tidak mengubah baris `db_Stok_Pemeriksaan_Item` (jejak asli); hanya `db_Stok_Selisih`.
- [ ] **Step 4: Jalankan** → PASS.
- [ ] **Step 5:** Catat di pratinjau.

### Task 7: Admin: selisih, koreksi pemakaian, pembatalan, daftar pemakaian

**Files:**
- Modify: `76_Gudang_Admin.js`, `75_Gudang_Data.js` (`tulisLogKoreksi_`), `02_Router.js`
- Test: `tests/gudang.test.js`

**Interfaces:**
- Produces (menu `OPS_GUDANG_MATERIAL`): `getSelisihGudang` `{ status?: 'MENUNGGU'|'SELESAI', timId? }` → `{ selisih: Row[], susulan: Pemakaian[], dikoreksi: Pemakaian[] }`; `selesaikanSelisih` `{ selisihId, cara: 'HILANG'|'TAMBAHAN_MASUK'|'SALAH_CATAT'|'SALAH_HITUNG'|'SUSULAN', catatan (wajib), nomorMeter?, keperluan? }`; `getPemakaianGudang` `{ dari, sampai, timId?, merk? }`; `koreksiPemakaian` `{ pemakaianId, revision, nomorMeter?, keperluan?, daya?, merk?, statusMcb?, alasan (wajib) }`; `batalkanPemakaian` `{ pemakaianId, revision, alasan }`.
- Efek `cara` (keputusan plan: tiap cara menulis mutasi yang menyamakan saldo jenis itu sendiri; **tidak ada** `KOREKSI_TIM` penyama di akhir): KURANG+`HILANG` → mutasi `HILANG` tim −selisih; LEBIH+`TAMBAHAN_MASUK` → mutasi `TAMBAHAN` tim +selisih; KURANG+`SUSULAN` → membuat pemakaian + `PAKAI` (seperti Task 6, atas nama admin); `SALAH_CATAT` (hanya LEBIH) tanpa mutasi; `SALAH_HITUNG` tanpa mutasi, pemeriksaan → `DIKEMBALIKAN`. Setelah semua selisih sebuah pemeriksaan SELESAI (dan tak ada SALAH_HITUNG) pemeriksaan → `DISETUJUI`.
- Koreksi pemakaian yang mengubah jenis (daya/merk/status) menulis mutasi pembalik jenis lama (+1) dan `PAKAI` jenis baru (−1); `STOK_TIDAK_CUKUP` bila jenis baru nol; baris `jenis_catatan = DIKOREKSI`; batal → `BATAL` + mutasi pembalik; semuanya menulis `db_Material_LogKoreksi` per kolom berubah.

- [ ] **Step 1: Tes gagal**: tiap `cara` menghasilkan saldo tim = hitungan petugas untuk jenis itu; `SALAH_CATAT pada KURANG ditolak`; `HILANG pada LEBIH ditolak`; `SALAH_HITUNG → pemeriksaan DIKEMBALIKAN lalu petugas dapat kirim ulang (Task 5)`; `semua selisih selesai → DISETUJUI dan bolehPakai true`; `koreksi ubah jenis memindahkan stok dan menulis log`; `koreksi ke jenis saldo nol → STOK_TIDAK_CUKUP tanpa tulis`; `batal mengembalikan 1 MCB`; `alasan kosong → ALASAN_WAJIB`; `revision lama → DATA_BERUBAH`; `selisih sudah SELESAI tak bisa diselesaikan lagi`.
- [ ] **Step 2: Jalankan** → FAIL.
- [ ] **Step 3: Implementasi** sesuai Interfaces, semua di `denganLock_`, validasi lengkap dulu, `revision` naik, audit `auditLog_`.
- [ ] **Step 4: Jalankan** → PASS.
- [ ] **Step 5:** Catat di pratinjau dan perbarui satu baris spec ("disamakan lewat KOREKSI_TIM" → tiap cara menyamakan sendiri; status `DIKEMBALIKAN`).

### Task 8: Foto Drive dan alat konsistensi

**Files:**
- Modify: `75_Gudang_Data.js` (`simpanFotoGudang_`, `ADMIN_cekKonsistensiGudang`), `76_Gudang_Admin.js`/`77_Gudang_Yandal.js` (`getFotoGudang`, `getFotoGudangYandal`), `02_Router.js`
- Test: `tests/gudang.test.js`

**Interfaces:**
- Produces: `FotoGudang` = field foto yang sama dengan `skemaFotoInsJar_` tanpa `temuanId`/`slot` (isi base64 + mime via `bytesFotoLapangan_`); `simpanFotoGudang_(foto: FotoGudang|null, nama: string): { fileId: string, link: string }` (folder `GUDANG_FOTO_FOLDER_ID`, nama `<id>_<JENIS>.jpg`; dipanggil sebelum menulis baris, gagal Drive = tidak ada yang tersimpan); endpoint baca `getFotoGudang` `{ jenis: 'PEMERIKSAAN'|'PEMAKAIAN'|'MUTASI', id: uuid, ukuran?: 'KECIL'|'PENUH' }` (admin) dan `getFotoGudangYandal` (hanya milik timnya) memakai `jawabFotoDriveWo_`; `ADMIN_cekKonsistensiGudang(): void` (log: mutasi `PAKAI` tanpa baris pemakaian dan sebaliknya, pemeriksaan tanpa item, selisih tanpa pemeriksaan).

- [ ] **Step 1: Tes gagal**: `foto tersimpan di folder gudang dan link terisi di baris`; `gagal Drive tidak menulis baris`; `getFotoGudangYandal menolak foto tim lain (BUKAN_MILIK_TIM)`; `ADMIN_cekKonsistensiGudang melaporkan mutasi yatim`.
- [ ] **Step 2: Jalankan** → FAIL.
- [ ] **Step 3: Implementasi**; hubungkan `foto` opsional/wajib di Task 4-6 ke `simpanFotoGudang_`.
- [ ] **Step 4: Jalankan** tes gudang + suite root → PASS.
- [ ] **Step 5:** Catat di pratinjau.

### Task 9: Menu, akses, kontrak, versi

**Files:**
- Modify: `docs/db_Menu.tsv`, `docs/db_Akses.tsv`, `docs/API-CONTRACT.md`, `backend/src/09_Versi.js`, `README.md`, `mobile/pubspec.yaml`, `mobile/lib/core/versi.dart`

- [ ] **Step 1:** Tambah `OPS_GUDANG_MATERIAL` (Material Gudang, KEDUANYA) dan `OPS_STOK_MATERIAL` (Stok Material, MOBILE) ke `db_Menu.tsv` mengikuti baris `OPS_ABSENSI`; baris akses `db_Akses.tsv` untuk role Yandal (`OPS_STOK_MATERIAL`, UBAH) dan catatan bahwa baris ADMIN/SUPER diimpor manual.
- [ ] **Step 2:** Dokumentasikan semua endpoint di `docs/API-CONTRACT.md` (nama, menu, field, kode galat).
- [ ] **Step 3:** Naikkan versi satu langkah di `09_Versi.js`, `pubspec.yaml` (+build), `versi.dart` (tes kesamaan versi harus lulus); tambah baris README "URUTAN RILIS": siapkan `GUDANG_SHEET_ID` + `GUDANG_FOTO_FOLDER_ID`, `ADMIN_siapkanSheetGudang`, **`ADMIN_isiIzinMaterialAwal` sebelum push kode**, impor menu/akses, push staging, uji, production.
- [ ] **Step 4: Jalankan** `npm test` (akar) → hijau termasuk tes versi.
- [ ] **Step 5:** Catat di pratinjau.

### Task 10: HP Yandal: model dan repository

**Files:**
- Create: `mobile/lib/features/gudang/gudang_model.dart`, `gudang_repository.dart`, `mobile/test/gudang_model_test.dart`
- Modify: `mobile/lib/core/deps.dart`, `mobile/lib/core/kode_error.dart` (pesan Indonesia untuk kode galat baru)

**Interfaces:**
- Produces: `JenisMcb {materialId, daya, merk, statusMcb, jumlah}`, `StokYandal.fromJson`, `SelisihStok`, `GudangRepository(ApiClient)` dengan `getStokYandal(Sesi)`, `simpanPemeriksaan(Sesi, List<EntriMcb>, String fotoPath)`, `simpanPemakaian(Sesi, PemakaianBaru)`, `simpanSusulan(Sesi, selisihId, …)`, serta fungsi murni `kelompokkanEntri(List<EntriMcb>) → Map<kunci, int>` untuk ringkasan layar. `pemakaianId` dibuat sekali per form (uuid).

- [ ] **Step 1: Tes gagal** `gudang_model_test.dart`: parsing `StokYandal` (bolehPakai, selisih), `kelompokkanEntri` menjumlah per jenis, kunci jenis sama dengan backend.
- [ ] **Step 2:** `flutter test test/gudang_model_test.dart` → FAIL.
- [ ] **Step 3:** Implementasi model + repository (panggilan foto memakai `FotoLapangan.isiKirim`, timeout 90 dtk seperti `uploadFotoTemuanInspeksi` di `deps.dart:126`).
- [ ] **Step 4:** Tes → PASS; `flutter analyze` bersih.
- [ ] **Step 5:** Catat di pratinjau.

### Task 11: HP Yandal: layar Stok Material

**Files:**
- Create: `mobile/lib/features/gudang/stok_yandal_screen.dart`, `mobile/test/gudang_ui_test.dart`
- Modify: `features/operasi/katalog_operasi.dart` (`OPS_STOK_MATERIAL`), `operasi_screen.dart` (`case`)

**Interfaces:**
- Consumes: `GudangRepository` (Task 10). Produces: `StokYandalScreen({deps, sesi})` + `StokYandalPanel` yang bisa diuji tanpa `Deps` (pola `AbsensiPanel`).

- [ ] **Step 1: Tes gagal**: tombol **Simpan** pemeriksaan mati sampai ada entri dan foto; entri ditambah satu per satu dan ringkasan per jenis tampil; saat `bolehPakai=false` tombol pemakaian mati dengan pesan; daftar selisih KURANG menampilkan aksi **Isi pemakaian susulan** dan **Tidak diketahui**; sukses memakai `tampilPopupBerhasil` (bukan snackbar); galat server tampil lewat `KodeError.pesan`.
- [ ] **Step 2:** `flutter test` → FAIL.
- [ ] **Step 3:** Implementasi layar tiga bagian (pemeriksaan awal, pemakaian, selisih) mengikuti gaya `approval_p0_screen.dart`; sinyal buruk = pesan jelas, tanpa antrean offline (keputusan Master Guswan).
- [ ] **Step 4:** Tes → PASS; `flutter analyze` bersih.
- [ ] **Step 5:** Catat di pratinjau.

### Task 12: Web admin: Material Gudang

**Files:**
- Create: `web/src/gudang.js` (logika murni), `web/src/pages/MaterialGudang.jsx`, `web/src/pages/gudang/{StokMaterial,Selisih,Pemakaian,IzinMaterial,FormStok}.jsx`, `web/test/gudang.test.js`
- Modify: `web/src/katalog.js` (entri `OPS_GUDANG_MATERIAL`, `halaman: 'material-gudang'`, `siap: true`; daftarkan halaman di tempat `approval-p0` didaftarkan), skrip `test` di `web/package.json`

**Interfaces:**
- Produces di `gudang.js`: `MENU_GUDANG`, `bolehUbahGudang(sesi)`, `ringkasJenis(jenis[]) → string`, `dataKirim/Tarik/Koreksi(form) → payload` (field persis endpoint Task 4), `pilihanCara(selisih) → string[]` (KURANG: HILANG/SUSULAN/SALAH_HITUNG; LEBIH: TAMBAHAN_MASUK/SALAH_CATAT), `adaStokTanpaIzin(tim)`.
- Layar: Stok Material (saldo gudang + per tim, tombol Tambah/Kirim/Tarik/Koreksi, tanda "tanpa izin" + **Tarik semua**), Persetujuan Selisih, Pemakaian (filter, koreksi, batalkan, daftar SUSULAN/DIKOREKSI), Izin Material (kotak centang per jenis tim + "pilih semua tim jenis ini", peringatan `stokTertinggal`).

- [ ] **Step 1: Tes gagal** `web/test/gudang.test.js`: `pilihanCara` per arah; `dataTarik` membawa alasan dan menolak jumlah ≤ 0; `adaStokTanpaIzin`; `bolehUbahGudang` hanya ADMIN/SUPER dengan akses UBAH.
- [ ] **Step 2:** `npm test` di `web` → FAIL.
- [ ] **Step 3:** Implementasi logika + layar; aksi tulis admin menunggu server (tanpa optimistic) kecuali nanti diminta.
- [ ] **Step 4:** `npm test` dan `npx vite build` di `web` → hijau/berhasil.
- [ ] **Step 5:** Catat di pratinjau.

### Task 13: HP Admin: Material Gudang

**Files:**
- Create: `mobile/lib/features/gudang/gudang_admin_screen.dart` (+ `gudang_admin_repository.dart`), `mobile/test/gudang_admin_test.dart`
- Modify: `katalog_operasi.dart`, `operasi_screen.dart` (`OPS_GUDANG_MATERIAL`), `deps.dart`

**Interfaces:**
- Consumes: endpoint Task 3, 4, 7. Produces: `GudangAdminScreen({deps, sesi})`; pelaksana memutuskan layar HP mana yang cukup berupa daftar (spec: "Diserahkan ke pelaksana"), tetapi **semua aksi admin** (kirim, tarik, koreksi, selesaikan selisih, koreksi/batal pemakaian, izin) tersedia di HP.

- [ ] **Step 1: Tes gagal**: akses hanya ADMIN/SUPER dengan menu; aksi tulis mati untuk akses LIHAT; alasan wajib mengaktifkan tombol Tarik/Koreksi/Batal; pilihan `cara` mengikuti arah selisih.
- [ ] **Step 2:** `flutter test` → FAIL.
- [ ] **Step 3:** Implementasi.
- [ ] **Step 4:** Tes → PASS; `flutter analyze` bersih.
- [ ] **Step 5:** Catat di pratinjau.

### Task 14: Verifikasi akhir dan serah terima

- [ ] **Step 1:** Jalankan penuh: `npm test` (akar), `npm test` di `web`, `npx vite build`, `flutter analyze`, `flutter test` (berkas gudang + suite). Semua hijau; bila ada yang merah selain baseline, laporkan dengan keluarannya.
- [ ] **Step 2:** Periksa Review Focus: setiap baris punya tes bernama di Task 5/6/7/3; tambahkan yang belum ada.
- [ ] **Step 3:** Perbarui `docs/pratinjau-mingguan/2026-11-08.md`: ringkasan, berkas disentuh, ruling (mutasi penyama tiap cara, `DIKEMBALIKAN`, foto dalam satu panggilan, susulan tidak mengubah item pemeriksaan, tanpa `yan_Shift` lama = `SHIFT_SEBELUMNYA_TIDAK_ADA`), yang belum terbukti (sinkron nyata, Drive, sinyal lapangan), langkah Bapak per lingkungan (urutan rilis dari Task 9), dan daftar untuk peninjau Minggu.
- [ ] **Step 4:** Tidak ada commit/deploy; laporkan berkas dan hasil uji ke Bapak.
