# Penerusan WO dari data lokal + pilih tim dari Temuan Inspeksi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layar Penerusan WO / Pindah Tim TO / peta temuan memakai data lokal lalu hanya menyinkron temuan yang berubah, dan admin ber-akses `OPS_PENERUSAN_WO` bisa meneruskan WO dari daftar Temuan Inspeksi (HP dan web).

**Architecture:** `getWoAdmin` menerima `sejak` dan membalas hanya temuan yang berubah (+ `ringkas`, `tim`, `kursor`). Klien menyimpan seluruh jawaban per akun + rentang tanggal, menggabung selisih per `temuanId`, menyaring status di perangkat, dan melakukan unduhan penuh pada pembukaan pertama tiap peluncuran aplikasi. Pilih tim memakai `teruskanWo` yang sudah ada lewat komponen pemilih tim yang dipakai bersama.

**Tech Stack:** Google Apps Script (backend, tes `node --test`), React + Vite (web, tes `node --test`), Flutter/Dart (HP, tes `flutter test`).

**Spec:** `docs/superpowers/specs/2026-11-04-penerusan-wo-offline-design.md`

## Global Constraints

- Aturan Master Guswan: JANGAN commit sampai diminta. Semua langkah "commit" diganti dengan menjalankan tes.
- Hak akses tidak berubah: `getWoAdmin` = `OPS_PENERUSAN_WO`, `getWoPindah` = `OPS_PINDAH_TIM_TO`, `getPetaTemuan` = `OPS_PETA_TEMUAN`; `teruskanWo` = `OPS_PENERUSAN_WO` + `wajibAdminWo_`. Tombol pilih tim hanya untuk sesi dengan aksi `UBAH` di `OPS_PENERUSAN_WO`.
- Alur WO (teruskan / pindah / tarik / mulai / selesai / WO ganda), notifikasi, `db_wo_riwayat`, dan penguncian tidak boleh berubah.
- HP / web lama tanpa `sejak` harus tetap menerima jawaban penuh seperti sekarang.
- Unduhan penuh pada pembukaan pertama tiap peluncuran aplikasi (web: tiap halaman dimuat). Gagal / tanpa sinyal = langsung data lokal, tanpa galat. Pesan "Butuh sinyal untuk memuat WO" hanya bila belum ada data lokal.
- Unduhan penuh yang gagal tidak menimpa data lokal. Simpanan HP per akun (kunci memuat `userId`); simpanan web dibuang saat keluar / sesi habis.
- Teks UI dan komentar berbahasa Indonesia, komentar mengikuti gaya berkas sekitar (`/** v1.0.xx ... */`).
- Tes backend: `npm test` di akar (`tests/backend.test.js`, pola `konteksWo()` / `x.temuan()` / `x.kt`). Tes web: `cd web && npm test`. Tes HP: `cd mobile && flutter test` + `flutter analyze`.

## Penyesuaian terhadap spec (keputusan saya, hasil membaca kode)

1. `revision` naik di setiap `ubahBaris_` / `tulisBlok_`, tetapi `timestamp_update` hanya terisi bila pemanggil mengisinya. Selisih berbasis waktu butuh cap waktu otomatis di `04_Sheet.js` (Task 1).
2. Simpanan lokal dikunci per akun + endpoint + rentang `dari`/`sampai` (seperti kunci `SimpananWo` sekarang), bukan satu simpanan global. Filter STATUS dilakukan lokal; permintaan sinkron selalu `status: 'SEMUA'`. Ganti rentang tanggal = kunci lain (unduhan penuh untuk kunci itu).
3. "Unduhan penuh setiap aplikasi dibuka" dijalankan malas: pada pembukaan pertama menu itu di tiap peluncuran (tanpa prefetch saat startup). Sesudahnya selisih.
4. Unduhan penuh tetap dibatasi 500 temuan terbaru (perilaku server sekarang); selisih tidak dibatasi.
5. Panggilan selisih web memakai `langsung: true` (lewati API baca MySQL) dan server tidak menyimpannya ke MySQL; unduhan penuh tetap boleh lewat MySQL.
6. Halaman web Pindah Tim TO tidak ada (`getWoPindah` hanya dipakai HP); selisih untuk Pindah Tim TO hanya di HP.

## Review Focus

- Pekerjaan baru tim (`db_temuan_tindak_lanjut`) atau klaim WO ganda (`db_wo_ganda`) berubah tanpa menyentuh baris temuan: temuannya HARUS ikut selisih (Task 1, 2).
- Sheets menyimpan cap waktu ISO sebagai objek `Date` saat dibaca: perbandingan waktu harus tahan `Date` dan teks (Task 2).
- Temuan diteruskan / ditarik admin lain saat data lokal usang: aksi ditolak server (`KONFLIK_REVISION`), layar menyinkron ulang, bukan menampilkan keadaan basi sebagai benar (Task 4, 6, 7).
- Unduhan penuh terputus di tengah: data lokal lama tetap utuh (Task 3, 5).
- Ganti akun di perangkat yang sama: data akun lain tidak tampil (Task 3, 5).

---

### Task 1: Cap waktu otomatis pada penulisan baris

**Files:**
- Modify: `backend/src/04_Sheet.js` (`ubahBaris_`, `tulisBlok_`)
- Test: `tests/backend.test.js`

**Interfaces:**
- Produces: setiap `ubahBaris_` / `tulisBlok_` ke tab berkolom `timestamp_update` mengisi `timestamp_update = sekarangIso_()` bila pemanggil tidak menyebut kolom itu. Pemanggil yang mengisi sendiri tetap menang.

- [ ] **Step 1: Tes gagal** `v1.0.58 sheet: ubahBaris_ dan tulisBlok_ mengisi timestamp_update otomatis`: ubah baris `db_wo_ganda` (status KLAIM -> SIAP) lewat jalur `selesaiWo_`/`putuskanWoGanda_` yang tidak mengisi `timestamp_update`; assert `timestamp_update` baris itu lebih baru dari nilai sebelumnya. Tambah assert tab tanpa kolom itu tidak error.
- [ ] **Step 2:** Jalankan `node --test --test-name-pattern="timestamp_update otomatis" tests/backend.test.js`. Harus GAGAL.
- [ ] **Step 3:** Di `ubahBaris_` dan `tulisBlok_`, bila `header` punya `timestamp_update` dan kunci itu tidak ada di perubahan, tulis `sekarangIso_()` bersama perubahan lain (satu panggilan tulis di `tulisBlok_`).
- [ ] **Step 4:** Jalankan `npm test`. Semua lulus. Bila ada tes lama yang membandingkan isi baris persis dan gagal karena cap baru, perbarui nilai harapannya (bukan mematikan cap).

### Task 2: `getWoAdmin` selisih (`sejak`) + `getWoPindah` + MySQL

**Files:**
- Modify: `backend/src/modules/56_TindakLanjut.js` (`getWoAdmin_`, `getWoPindah_`), `backend/src/modules/94_Mysql_Jawaban.js` (`MYSQL_JAWABAN_.getWoAdmin`, `.getPetaTemuan`), `docs/API-CONTRACT.md`
- Test: `tests/backend.test.js`

**Interfaces:**
- Produces: `waktuMsWo_(v: Date|string) -> number` (0 bila tidak valid); `idBerubahWo_(rowsTemuan, rowsTl, rowsG, batasMs) -> {[temuanId]: true}` (temuan dengan `timestamp_update` sendiri, ATAU salah satu baris tindak lanjut-nya `timestamp_update`, ATAU salah satu baris ganda-nya `timestamp_update`/`waktu_klaim`/`waktu_siap`/`waktu_putusan` > batasMs); konstanta `WO_SELISIH_TUMPANG_MS_ = 180000`.
- Produces: `getWoAdmin_(sesi, {status?, dari?, sampai?, sejak?: string ISO})`. Jawaban SELALU memuat `kursor` (ISO, diambil sebelum sheet dibaca) dan `selisih` (boolean). Dengan `sejak`: `selisih: true`, hanya temuan berubah (batas = `sejak` dikurangi tumpang tindih), filter `dari`/`sampai` berlaku, filter `status` diabaikan, tanpa batas 500, `ringkas` dan `tim` tetap dihitung penuh. Tanpa `sejak`: perilaku lama + `kursor` + `selisih: false`.
- Produces: `getWoPindah_` memaksa `status: 'TERKIRIM'` hanya bila `data.status` tidak diberikan.
- Produces: `MYSQL_JAWABAN_.getWoAdmin` / `.getPetaTemuan` mengembalikan `null` (tidak disimpan) bila `data.sejak` ada, selain itu `'temuan:daftar'`.

- [ ] **Step 1: Tes gagal** `v1.0.58 getWoAdmin selisih: hanya temuan berubah, ringkas penuh, kursor`:
  - dua temuan A, B; panggil penuh, simpan `kursor`; teruskan A; panggil dengan `sejak: kursor` -> `temuan.map(kodeTemuan)` hanya A, `selisih === true`, `ringkas` sama dengan panggilan penuh, `temuan` berisi A dengan `wo.status === 'TERKIRIM'`.
  - `sejak` sangat baru -> `temuan` kosong, `ringkas` tetap terisi.
- [ ] **Step 2: Tes gagal** `v1.0.58 selisih: pekerjaan tim dan WO ganda tanpa menyentuh baris temuan ikut selisih`: simpan pekerjaan WO tim (`simpanPekerjaanWo_`) lalu klaim ganda; baris temuan tidak dihubungi; `sejak` sebelum aksi -> temuan itu muncul dengan `pekerjaanWo.length` baru / `wo.ganda === true`.
- [ ] **Step 3: Tes gagal** `v1.0.58 selisih: cap waktu Date dan teks sama-sama terbaca`: isi `timestamp_update` satu baris dengan objek `Date`, satu dengan teks ISO; keduanya terdeteksi. `sejak` tidak valid -> error kode yang sudah dipakai `validasi_` untuk bidang salah format (lihat `06_Validasi.js`).
- [ ] **Step 4: Tes gagal** `v1.0.58 getWoPindah: status SEMUA dihormati, tanpa status = TERKIRIM`, dan `v1.0.58 MySQL: jawaban dengan sejak tidak disimpan` (pola assert di `tests/backend.test.js` baris ~10156).
- [ ] **Step 5:** Jalankan keempat tes dengan `--test-name-pattern="v1.0.58"`. Harus GAGAL.
- [ ] **Step 6:** Implementasi sesuai blok Interfaces; `getWoAdmin_` menambah `sejak: { tipe: 'teks', maks: 40 }` ke skema `validasi_`; `idBerubahWo_` memakai satu peta per sumber (tanpa saring bersarang per temuan) supaya tetap linear. `getPetaTemuan_` otomatis ikut karena memanggil `getWoAdmin_`.
- [ ] **Step 7:** Perbarui `docs/API-CONTRACT.md` (parameter `sejak`, `kursor`, `selisih`, aturan di atas). Jalankan `npm test`; semua lulus.

### Task 3: Web, logika gabung selisih + simpanan + sinkron

**Files:**
- Create: `web/src/selisihWo.js`, `web/src/simpananWo.js`, `web/src/sinkronWo.js`
- Modify: `web/package.json` (tambah ketiga berkas tes ke skrip `test`), `web/src/tembolok.js` (hapus `getWoAdmin`/`getPetaTemuan` dari `TETAP`; `kosongkanTembolok(true)` juga memanggil `hapusSimpananWo`)
- Test: `web/test/selisihWo.test.js`, `web/test/sinkronWo.test.js`

**Interfaces:**
- Produces (`selisihWo.js`): `gabungSelisihWo(lokal, selisih) -> data` (temuan digabung per `temuanId`, selisih menimpa; `ringkas`, `tim`, `kursor`, `status` diambil dari selisih; urut `tanggal` turun lalu `kodeTemuan` turun); `ubahTemuanWo(lokal, temuanBaru) -> data` (ganti satu temuan dari jawaban aksi); `saringStatusWo(temuan, status) -> temuan[]` (`BARU` = `wo.status` kosong, `TERKIRIM` / `DIKERJAKAN` / `SELESAI` = sama, `AKTIF` = bukan SELESAI, `SEMUA` = semua; sama dengan aturan `getWoAdmin_`).
- Produces (`simpananWo.js`): `bacaSimpananWo(kunci) -> Promise<{data, waktu}|null>`, `tulisSimpananWo(kunci, data) -> Promise<void>`, `hapusSimpananWo() -> Promise<void>`, `sudahPenuhWo(kunci) -> boolean`, `tandaiPenuhWo(kunci) -> void` (set di memori modul, hilang saat halaman dimuat ulang). IndexedDB (pola `fotoLokal.js`); gagal IndexedDB = memori saja.
- Produces (`sinkronWo.js`): `sinkronWo({ action, param, kunci, api, simpanan, onLokal, paksaPenuh = false }) -> Promise<data>`; `param` = `{dari?, sampai?}`; `simpanan` = `{baca, tulis, sudahPenuh, tandaiPenuh}` (default modul `simpananWo.js`, bisa disuntik tes); `onLokal(data, waktu)` dipanggil dulu bila ada data lokal; kembali = data akhir. Alur: baca simpanan -> `onLokal`; bila ada simpanan DAN `sudahPenuh(kunci)` -> panggil `api(action, {...param, status: 'SEMUA', sejak: data.kursor}, {langsung: true})` lalu `gabungSelisihWo`; selain itu -> panggil penuh `api(action, {...param, status: 'SEMUA'})`, `tandaiPenuh` hanya sesudah sukses. Tulis simpanan hanya sesudah panggilan sukses. Galat jaringan dengan data lokal = kembalikan data lokal (tanpa lempar); tanpa data lokal = lempar galat aslinya.

- [ ] **Step 1: Tes gagal** `selisihWo.test.js`: `gabungSelisihWo` (menimpa temuan sama, menambah baru, mempertahankan yang tak berubah, `ringkas`/`kursor` dari selisih, urutan), `ubahTemuanWo`, `saringStatusWo` (kelima status), tahan `lokal` kosong.
- [ ] **Step 2: Tes gagal** `sinkronWo.test.js` dengan `api` palsu dan `simpanan` palsu: (a) tanpa simpanan -> satu panggilan penuh, simpanan ditulis, `tandaiPenuh` dipanggil; (b) simpanan + belum penuh -> panggilan penuh (bukan selisih); (c) simpanan + sudah penuh -> panggilan berparameter `sejak` dan `langsung: true`, hasil digabung; (d) panggilan penuh gagal dengan simpanan ada -> data lokal dikembalikan, simpanan tidak ditimpa, `tandaiPenuh` tidak dipanggil; (e) gagal tanpa simpanan -> galat dilempar; (f) `onLokal` dipanggil sebelum `api`.
- [ ] **Step 3:** `cd web && node --test test/selisihWo.test.js test/sinkronWo.test.js`. Harus GAGAL.
- [ ] **Step 4:** Implementasi sesuai blok Interfaces (tiga berkas, fungsi murni sebisanya); perbarui `tembolok.js` dan `package.json`.
- [ ] **Step 5:** `cd web && npm test`. Semua lulus.

### Task 4: Web, pasang di Penerusan WO dan Peta Temuan

**Files:**
- Modify: `web/src/pages/PenerusanWo.jsx` (`muat`, `sesudahKirim`), `web/src/pages/PetaTemuan.jsx` (`muat`)
- Test: `web/test/penerusanWo.test.js` (hanya bila ada logika murni baru), uji manual (Step 4)

**Interfaces:**
- Consumes: `sinkronWo`, `saringStatusWo`, `ubahTemuanWo` (Task 3).

- [ ] **Step 1:** `PenerusanWo.jsx`: `muat` memanggil `sinkronWo({ action: 'getWoAdmin', param: {dari, sampai}, kunci: 'u:' + userId + '|getWoAdmin|' + dari + '|' + sampai, ... , onLokal: (d, w) => { setData(d); setSimpanan(w); } })`; daftar tampil = `saringStatusWo(semua, status)` lalu `saringWo` yang sudah ada. Pindah tab status tidak lagi memanggil server (hanya tombol Muat ulang). `sesudahKirim`: `ubahTemuanWo` dari jawaban `teruskanWo` + simpan, lalu satu sinkron selisih di belakang.
- [ ] **Step 2:** `PetaTemuan.jsx`: sama untuk `getPetaTemuan` (kunci `getPetaTemuan`, rentang `dari`/`sampai`).
- [ ] **Step 3:** Tombol "Muat ulang" = `sinkronWo({ ..., paksaPenuh: true })` (selalu panggilan penuh). Tes `paksaPenuh` ada di `sinkronWo.test.js` (Task 3 Step 2, tambahkan kasus (g): simpanan + sudah penuh + `paksaPenuh` = panggilan penuh).
- [ ] **Step 4:** Jalankan `cd web && npm test && npm run build`. Manual: buka menu, tutup jaringan, buka ulang menu = data tampil tanpa galat; teruskan satu WO di sesi lain, buka menu ini = baris itu berubah tanpa muat penuh.

### Task 5: HP, logika gabung selisih + sinkron + layar WO admin

**Files:**
- Create: `mobile/lib/features/wo/wo_selisih.dart`, `mobile/lib/features/wo/wo_sinkron.dart`
- Modify: `mobile/lib/features/wo/wo_simpanan.dart` (`sudahPenuh` / `tandaiPenuh`), `mobile/lib/features/wo/wo_admin_screen.dart` (`_kunciSimpan`, `_segarkan`, daftar tampil, pindah / teruskan / tarik sesudah sukses)
- Test: `mobile/test/wo_selisih_test.dart`, `mobile/test/wo_sinkron_test.dart`

**Interfaces:**
- Produces (`wo_selisih.dart`): `Map<String, dynamic> gabungSelisihWo(Map<String, dynamic> lokal, Map<String, dynamic> selisih)`; `Map<String, dynamic> ubahTemuanWo(Map<String, dynamic> lokal, Map<String, dynamic> temuanBaru)`; `List<Map<String, dynamic>> saringStatusWo(List<Map<String, dynamic>> temuan, String status)` (aturan sama dengan Task 3; sumber status = `t['wo']['status']`).
- Produces (`SimpananWo`): `static bool sudahPenuh(String kunci)`, `static void tandaiPenuh(String kunci)` (set statis proses).
- Produces (`wo_sinkron.dart`): `Future<Map<String, dynamic>> sinkronDaftarWo({required String kunci, required String aksi, required Map<String, dynamic> param, required Future<Map<String, dynamic>> Function(String aksi, Map<String, dynamic> data) api, void Function(Map<String, dynamic> data, int waktu)? tampilLokal, bool paksaPenuh = false})`. Semantik sama persis dengan `sinkronWo` web (alur dan galat); `aksi` = `getWoAdmin` atau `getWoPindah` (keduanya dengan `status: 'SEMUA'`); membaca/menulis lewat `SimpananWo`.
- Kunci: `_kunciSimpan` = `userId|aksi|dari|sampai` (tanpa status).

- [ ] **Step 1: Tes gagal** `wo_selisih_test.dart`: padanan tes Task 3 Step 1.
- [ ] **Step 2: Tes gagal** `wo_sinkron_test.dart` (kunci tes memakai folder sementara / `SimpananWo` diarahkan ke direktori tes sesuai pola `wo_penerusan_test.dart` bila ada): padanan kasus (a)-(f) Task 3 Step 2, plus `paksaPenuh`.
- [ ] **Step 3:** `cd mobile && flutter test test/wo_selisih_test.dart test/wo_sinkron_test.dart`. Harus GAGAL.
- [ ] **Step 4:** Implementasi dua berkas + dua metode `SimpananWo`.
- [ ] **Step 5:** `wo_admin_screen.dart`: `_segarkan` memakai `sinkronDaftarWo` (aksi `_pindah ? 'getWoPindah' : 'getWoAdmin'`); `_data` = hasil; tab status dan rentang disaring lokal dengan `saringStatusWo`; `_galat` "Butuh sinyal untuk memuat WO" hanya bila `sinkronDaftarWo` melempar DAN belum ada `_data`. Sesudah `teruskanWo` / `pindahWo` / `tarikWo` sukses (jawaban `temuan`) panggil `ubahTemuanWo`, simpan, lalu satu sinkron selisih di latar. Hentikan penulisan ulang `SimpananWo.tulis` yang ada di `_segarkan` (sekarang dilakukan `sinkronDaftarWo`).
- [ ] **Step 6:** `cd mobile && flutter test && flutter analyze`. Semua lulus. Manual: mode pesawat sesudah satu kali buka = daftar tampil; teruskan satu WO = status berubah tanpa muat penuh.

### Task 6: Pilih tim dari Temuan Inspeksi (web)

**Files:**
- Create: `web/src/components/DialogTeruskanWo.jsx` (dipindah dari `DialogTeruskan` di `PenerusanWo.jsx`)
- Modify: `web/src/pages/PenerusanWo.jsx` (impor komponen), `web/src/pages/PetaTemuan.jsx` (`PanelTemuan`)
- Test: `web/test/penerusanWo.test.js` (aturan tombol), uji manual

**Interfaces:**
- Produces: `DialogTeruskanWo({ t, tim, api, onTutup, onBerhasil, onGalatMuatUlang })`, props sama dengan `DialogTeruskan` sekarang (`PenerusanWo.jsx:387`).
- Produces (`penerusanWo.js`): `bolehTeruskanDariDaftar(sesi, t) -> boolean` = `aksiMenu(sesi, MENU_WO) === 'UBAH' && bolehTeruskan(t)`.

- [ ] **Step 1: Tes gagal** `bolehTeruskanDariDaftar`: sesi tanpa menu `OPS_PENERUSAN_WO` = false; aksi `LIHAT` = false; `UBAH` + WO belum diteruskan = true; `UBAH` + WO TERKIRIM / DIKERJAKAN = false.
- [ ] **Step 2:** `cd web && node --test test/penerusanWo.test.js`. Harus GAGAL.
- [ ] **Step 3:** Pindahkan `DialogTeruskan` ke komponen bersama tanpa mengubah perilaku; `PenerusanWo.jsx` mengimpornya; implementasi `bolehTeruskanDariDaftar`.
- [ ] **Step 4:** `PanelTemuan` di `PetaTemuan.jsx` menampilkan tombol "Teruskan ke tim" bila `bolehTeruskanDariDaftar`; dialog memakai `data.tim` dari simpanan peta (Task 4). `onBerhasil` = `ubahTemuanWo` + simpan + sinkron selisih; `onGalatMuatUlang` = sinkron paksa. (`PetaTemuan` perlu menerima `sesi`; cek prop yang diteruskan dari `Dashboard.jsx`.)
- [ ] **Step 5:** `cd web && npm test && npm run build`. Manual: akun tanpa `OPS_PENERUSAN_WO` tidak melihat tombol; dengan akses = WO jadi TERKIRIM dan terlihat juga di Penerusan WO sesudah sinkron.

### Task 7: Pilih tim dari Temuan Inspeksi (HP)

**Files:**
- Create: `mobile/lib/features/wo/wo_pilih_tim.dart` (pemilih tim + catatan dari `_pilihTim` di `wo_admin_screen.dart`), `mobile/lib/features/wo/wo_teruskan.dart` (badan `_teruskan` dari layar yang sama)
- Modify: `mobile/lib/features/wo/wo_admin_screen.dart` (pakai keduanya), `mobile/lib/features/insjar/input_temuan_inspeksi_screen.dart` (rincian WO)
- Test: `mobile/test/wo_teruskan_test.dart`

**Interfaces:**
- Produces: `Future<(String, String)?> pilihTimWo(BuildContext context, {required Map<String, dynamic> temuan, required List<Map<String, dynamic>> tim})` (hasil `(timId, catatan)` atau null; isi sama dengan `_pilihTim` sekarang).
- Produces: `bool bolehTeruskanDariDaftar(Sesi sesi, Map<String, dynamic> t)` = `sesi.aksiMenu('OPS_PENERUSAN_WO') == 'UBAH'` (nama pembaca aksi menu ada di `sesi.dart:80`) dan `wo.status` kosong.
- Produces: `Future<bool> teruskanWoKeAntre({required Sesi sesi, required Future<void> Function(String aksi, Map<String, dynamic> data) api, required Map<String, dynamic> temuan, required String timId, required String namaTim, required String catatan})` yang membuat `ItemPenerusanWo` ke `PenerusanWo.i` persis seperti `_teruskan` sekarang (aksi `teruskanWo`, `revision` dari `temuan['revision']`).

- [ ] **Step 1: Tes gagal** `wo_teruskan_test.dart`: `bolehTeruskanDariDaftar` (tanpa menu / `LIHAT` = false; `UBAH` + belum diteruskan = true; WO TERKIRIM = false); `teruskanWoKeAntre` menambah satu item `ItemPenerusanWo` ber-aksi `teruskanWo` dengan `temuanId` dan `revision` temuan (antrean `PenerusanWo.i` dengan `berkas` diarahkan ke folder tes).
- [ ] **Step 2:** `cd mobile && flutter test test/wo_teruskan_test.dart`. Harus GAGAL.
- [ ] **Step 3:** Ekstrak tiga bagian tanpa mengubah perilaku `wo_admin_screen.dart`; jalankan `flutter test` untuk memastikan tes layar WO yang ada tetap lulus.
- [ ] **Step 4:** Di `input_temuan_inspeksi_screen.dart`, pada rincian WO temuan (slot `bawah` `KartuDaftarTemuan` / sheet rincian), tampilkan tombol "Teruskan ke tim" bila `bolehTeruskanDariDaftar`. Daftar tim dari `SimpananWo` kunci `userId|getWoAdmin||` (data Task 5); bila kosong jalankan satu `sinkronDaftarWo` dulu. Sesudah antrean sukses, muat ulang daftar temuan (`getTemuanInspeksi`) agar status WO tampil.
- [ ] **Step 5:** `cd mobile && flutter test && flutter analyze`. Manual: akun tanpa `OPS_PENERUSAN_WO` tidak melihat tombol; dengan akses = WO terkirim ke tim, layar Penerusan Tim ikut berubah sesudah sinkron.

### Task 8: Versi dan dokumen

**Files:**
- Modify: `backend/src/09_Versi.js`, `mobile/lib/core/versi.dart`, `docs/API-CONTRACT.md` (bila belum di Task 2), `docs/superpowers/specs/2026-11-04-penerusan-wo-offline-design.md` (samakan butir 5, 6 dengan "Penyesuaian" di atas)

- [ ] **Step 1:** Naikkan versi mengikuti konvensi berkas yang sama (pola catatan `v1.0.xx` di tiap berkas); web mengikuti `web/package.json` / `config.js` bila ada penanda versi.
- [ ] **Step 2:** Jalankan `npm test`, `cd web && npm test && npm run build`, `cd mobile && flutter test && flutter analyze`. Semua lulus.
- [ ] **Step 3:** Jangan commit / push / deploy; laporkan hasil ke Master Guswan.
