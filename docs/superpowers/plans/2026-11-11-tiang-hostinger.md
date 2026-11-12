# Modul Tiang ke Hostinger (MySQL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memindahkan sumber data modul tiang dari Google Sheets ke MySQL di Hostinger dengan alur simpan satu paket (data + 2 foto) yang cepat, tanpa antrean `AntreanTiang`, dan memperbaiki tiga masalah lapangan (data tertolak, foto hilang, pilihan titik tereset).

**Architecture:** API PHP `hosting/sisi-api/tiang.php` (satu pintu `{action, data}`, tiket HMAC dari Apps Script, tabel `tiang_*` di database yang sama dengan API baca) melayani HP dan web admin. Apps Script tinggal login/tiket, `ping` (membawa `tiangApi`), impor awal (Sheet → MySQL) dan tarik (MySQL → Sheet + arsip foto Drive). HP memakai `DrafTiang` (draf per tiang, kirim satu paket, FIFO) menggantikan `AntreanTiang`.

**Tech Stack:** PHP 8.3 + PDO (MySQL produksi, SQLite untuk uji), Google Apps Script (harness uji `tests/harness.js`), Flutter/Dart, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-11-tiang-hostinger-design.md` (bagian dirujuk sebagai "S§n").

## Global Constraints

- Production TIDAK dideploy tanpa perintah Master Guswan. `VERSI_BACKEND_` tetap `'1.0.69'`; `VERSI_APP_MINIMUM=1.0.69`; `WAJIB_VERSI_APP=YA`. Versi app tahap ini: `1.0.76+250` (staging dulu).
- Jangan commit kecuali diminta; tiap "Commit" di bawah dilewati sampai Master Guswan memerintahkan. Sebut "Master Guswan" di semua teks untuk pengguna; jawaban singkat.
- PHP 8.3, `declare(strict_types=1)`, semua kueri PDO berparameter, jawaban `Cache-Control: no-store`, konfigurasi dan sandi hanya di berkas di luar `public_html` (`sisi-api-config.php`), tidak ada rahasia di kode/repo/chat.
- Database: production `u832253372_sisi_deploy`, staging `u832253372_sisi_staging`; tabel baru berawalan `tiang_`; tabel `ggn_*`, `jawaban*`, `sinkron_info` tidak disentuh.
- Nama tabel/kolom MySQL = nama tab/header sheet SiSi_Tiang (S§7). `tiang_id` `VARCHAR(40)`, bukan INT.
- Aturan bisnis dipindah APA ADANYA dari `99_Verifikasi_Tiang.js`, `98_Segmen.js`, `96_Master_Switching.js`, `95_Tiang_Master.js` (toleransi 10 m, dasar koordinat, kelengkapan wajib). Satu-satunya pelonggaran: simpan dari HP tidak memeriksa `revision`; foto tidak menaikkan `revision` (S§8.1).
- Foto: JPEG, target ≤ 500 KB, batas keras 2 MB, sisi panjang maks 1600 px, thumbnail 320 px; `sha256` diperiksa server.
- Tiket MOBILE berlaku 8 jam; HP meminta baru saat tersisa < 30 menit. Selisih waktu tanda HMAC Apps Script ≤ 300 detik (pola `wajibTandaAppsScript`).
- Teks UI dan pesan galat berbahasa Indonesia.

## Review Focus

Input/kondisi yang spec tidak sebut tegas tetapi paling mungkin merugikan petugas:
1. Paket gagal di tengah (DB commit gagal sesudah berkas foto ditulis; atau berkas ditulis lalu proses mati): tidak boleh ada tiang tanpa foto atau berkas yatim. Diuji di Task 5.
2. Dua kirim bersamaan untuk tiang yang sama (HP kirim ulang saat jawaban pertama masih jalan): hasil sama, tanpa data ganda. Diuji di Task 4.
3. Tiket kedaluwarsa tepat saat Simpan (offline lalu online): HP memperbarui tiket lalu mengirim ulang, draf tidak hilang. Diuji di Task 10.
4. Foto di draf tidak terbaca/dihapus sistem: tampil galat dan ajakan ambil ulang, tidak dianggap terkirim. Diuji di Task 11.
5. Impor sheet berisi `tiang_id` angka panjang/teks yang diubah Sheets jadi notasi ilmiah atau Date: impor menolak baris bukan teks utuh, tidak merusak diam-diam. Diuji di Task 6.

## File Structure

Buat:
- `hosting/sisi-api/tiang_lib.php`: skema `tiang_*`, tiket tiang, pengumpul galat, utilitas foto, rem laju.
- `hosting/sisi-api/tiang.php`: pintu `{action, data}` + registri action.
- `hosting/sisi-api/tiang_aksi_baca.php`, `tiang_aksi_tulis.php`: isi action (dimuat `tiang.php`).
- `hosting/sisi-api/impor.php`, `hosting/sisi-api/ekspor.php`, `hosting/sisi-api/cadangan.php` (CLI cron).
- `backend/src/modules/102_Tiang_Hostinger.js`: impor, tarik, arsip foto, pembekuan tulis, `tiang_cabut`.
- `mobile/lib/features/tiang/tiang_api.dart`, `tiket_tiang.dart`, `draf_tiang.dart`.
- Tes: `tests/tiang-php.test.js`, `tests/tiangHostinger.test.js`, `mobile/test/draf_tiang_test.dart`, `mobile/test/tiket_tiang_test.dart`; fixture `tests/fixtures/tiang/*.json`.

Ubah: `hosting/sisi-api/_lib.php` (`db()` memanggil `skemaTiang`), `backend/src/modules/93_Mysql.js` (tiket MOBILE), `backend/src/02_Router.js`, `backend/src/09_Versi.js` (info `tiangApi`), `mobile/lib/core/versi.dart` (`InfoVersi.tiangApi`), `mobile/lib/features/tiang/*.dart` (repository, form, jalur, segmen), `docs/API-CONTRACT.md`, `docs/PRD.md`, daftar guard di `tests/backend.test.js`.
Dipensiunkan SETELAH production stabil (di luar rencana ini, atas keputusan Master Guswan): `mobile/lib/features/tiang/antrean_tiang.dart`, `backend/src/modules/101_Sinkron_Tiang.js`. Selama masa mundur keduanya tetap ada; HP baru hanya tidak memanggilnya.

---

### Task 0: Prasyarat lingkungan uji

**Files:** tidak ada kode.

- [ ] **Step 1:** Pasang PHP 8.3 dengan `pdo_sqlite`, `gd` di PC; set `PHP_BIN` (contoh `setx PHP_BIN C:\php\php.exe`). Tanpa ini tes PHP dilewati (pola `tests/php-api.test.js`). Minta Master Guswan memasang bila belum ada.
- [ ] **Step 2:** Jalankan `PHP_BIN=<php> node --test tests/php-api.test.js`. Expected: lulus (bukti lingkungan benar).
- [ ] **Step 3:** Pastikan Script Properties staging `MYSQL_API_URL`, `MYSQL_API_SECRET` sudah terisi (dipakai API baca) dan berkas `sisi-api-staging-config.php` ada di server (Master Guswan memastikan; tidak dibaca/ditulis rahasianya oleh agen).

### Task 1: Skema `tiang_*` dan kerangka `tiang.php`

**Files:** Create `hosting/sisi-api/tiang_lib.php`, `hosting/sisi-api/tiang.php`; Modify `hosting/sisi-api/_lib.php`; Test `tests/tiang-php.test.js`.

**Interfaces:** Produces `skemaTiang(PDO $pdo): void` (membuat tabel S§7 bila belum ada: `tiang_tiang, tiang_sirkuit, tiang_segmen, tiang_switching, tiang_konstruksi, tiang_ukuran, tiang_pemetaan, tiang_foto, tiang_op, tiang_audit, tiang_cabut, tiang_laju`, dengan indeks `tiang_sirkuit(tiang_id)`, `(penyulang)`, `(induk_tiang_id)`; kolom waktu `DATETIME(3)` UTC; MySQL `ENGINE=InnoDB utf8mb4`, SQLite untuk uji); `wajibTiketTiang(string $menu, bool $ubah): array` (isi tiket `{u, role, m[], t[], env, exp}`); `final class KumpulGalat { tambah(string $field, string $pesan): void; ada(): bool; keluar(): never }` (jawaban HTTP 422 `{ok:false, kode:'DATA_TIDAK_VALID', galat:[{field,pesan}]}`); `jawabOk(array $data): never` (`{ok:true,data}`).

- [ ] **Step 1:** Tulis tes gagal: `tiang pintu: tanpa tiket 401, tiket env salah 401, menu tak ada 403, action tak dikenal 400 AKSI_TIDAK_DIKENAL, GET 405, jawaban membawa Cache-Control no-store, tabel tiang_* terbuat sekali`.
- [ ] **Step 2:** Jalankan `PHP_BIN=<php> node --test tests/tiang-php.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement `skemaTiang`, `wajibTiketTiang` (memanfaatkan `wajibTiket` yang ada; `ubah` menolak 403 bila `$menu` tidak ada di `t`; tolak user yang ada di `tiang_cabut`), `KumpulGalat`, rem laju per `u` (`tiang_laju`, 120 permintaan/menit → 429 `TERLALU_SERING`), dan `tiang.php` dengan registri `AKSI = ['namaAksi' => ['menu'=>…, 'ubah'=>bool, 'fn'=>callable]]`. `db()` memanggil `skemaTiang($pdo)` setelah `skema($pdo)`. Badan permintaan maks 4 MB (413 `PAYLOAD_TERLALU_BESAR`).
- [ ] **Step 4:** Jalankan tes. Expected: PASS.

### Task 2: Aksi baca dan uji kesetaraan

**Files:** Create `hosting/sisi-api/tiang_aksi_baca.php`, `tests/fixtures/tiang/baca-*.json`; Modify `hosting/sisi-api/tiang.php`; Test `tests/tiang-php.test.js`.

**Interfaces:** Consumes Task 1. Produces action baca dengan bentuk jawaban SAMA dengan Apps Script: `getVerifikasiTiang`, `getTiangJalur`, `getPetaTiang`, `getSegmen`, `getMasterSwitching` (fungsi PHP `aksiGetVerifikasiTiang(array $d, array $tiket): array`, dst.; `getFotoTiang` dan `getFotoSwitching` ikut Task 5 karena butuh berkas foto). Selesai 11 Nov: skema ditambah `tiang_jaringan` dan kolom `urut`; semua aksi PHP hanya untuk peran ADMIN / SUPER (`wajibAdminTiang_`); uji kesetaraan memakai dunia uji `tests/duniaTiang.js` secara langsung (tanpa fixture berkas) dan disemai lewat `isiBarisTiang()`. Menu sesuai `02_Router.js` (`OPS_VERIFIKASI_TIANG` / `OPS_MASTER_SWITCHING`).

- [ ] **Step 1:** Buat skrip `tests/fixtures/buatFixtureTiang.js` yang memakai dunia uji `tests/duniaTiang.js` + fungsi Apps Script asli untuk menulis fixture `{seed, masukan, jawaban}` per action baca ke `tests/fixtures/tiang/`.
- [ ] **Step 2:** Tes gagal: `tiang baca: tiap fixture seed→MySQL(SQLite) lalu jawaban PHP sama persis dengan jawaban Apps Script` (loop semua fixture); `getPetaTiang hanya tiang TERVERIFIKASI ber-koordinat dan garis hanya bila kedua ujung terverifikasi`; `jawaban baca langsung memuat tulis terakhir` (tulis lewat seed, baca dua kali berturut-turut).
- [ ] **Step 3:** Jalankan; Expected: FAIL.
- [ ] **Step 4:** Implement tiap action baca dengan SQL berindeks (satu kueri per tabel, tanpa membaca tabel penuh kecuali master kecil). Kolom/ketentuan turunan (`tanda_cek`, `Perlu Dilengkapi`, progres jalur) dipindah dari `99_Verifikasi_Tiang.js` (`kurangLengkapTiang_`, `tiangKeApi_`).
- [ ] **Step 5:** Jalankan; Expected: PASS.

### Task 3: Tiket MOBILE (Apps Script) dan `tiang_cabut`

**Files:** Modify `backend/src/modules/93_Mysql.js`, `backend/src/02_Router.js`, `backend/src/09_Versi.js`, `hosting/sisi-api/tiang_lib.php`; Test `tests/tiangHostinger.test.js`, `tests/php-api.test.js`.

**Interfaces:** Produces `getTiketApi_` untuk `platform === 'MOBILE'`: `{tiket, sampai}` dengan isi `{u: userId, role, m, t, env, exp: now+8 jam}`; `infoVersi_().tiangApi` (Script Property `TIANG_API_URL`, kosong = ''); `cabutTiketTiang_(userId)` yang mengirim `{aksi:'cabut', userId}` bertanda HMAC ke `tiang.php?cabut` saat akun dinonaktifkan (dipanggil dari fungsi nonaktifkan akun yang sudah ada); `tiang_cabut(user_id, sejak)`.

- [ ] **Step 1:** Tes gagal (harness): `getTiketApi MOBILE: m/t sesuai menu & hak ubah, exp 8 jam, ENV ikut`; `ping.versi.tiangApi kosong bila properti kosong`; `nonaktifkan akun mengirim cabut`; (PHP) `tiket user tercabut → 401 TIKET_DICABUT`.
- [ ] **Step 2:** Jalankan `node --test tests/tiangHostinger.test.js`; Expected: FAIL.
- [ ] **Step 3:** Implement. `getTiketApi` daftar di router mengizinkan MOBILE (batasMenit 20). Tambah `getTiketApi` ke tiga daftar audit guard di `tests/backend.test.js` bila perlu.
- [ ] **Step 4:** Jalankan `npm test` penuh; Expected: semua lulus.

### Task 4: `simpanVerifikasiTiang` (data saja, tanpa foto)

**Files:** Create `hosting/sisi-api/tiang_aksi_tulis.php`; Modify `hosting/sisi-api/tiang.php`; Test `tests/tiang-php.test.js`, fixture `tulis-*.json`.

**Interfaces:** Produces `aksiSimpanVerifikasiTiang(array $d, array $tiket): array` → `{tiang, selisihM}`; payload sama dengan `simpanVerifikasiTiang_` + `opId` (wajib, `^[0-9A-Za-z._:-]{6,64}$`). Idempotensi lewat `tiang_op(op_id PK, hasil JSON)`. Validasi mengumpulkan SEMUA masalah lewat `KumpulGalat`. `revision` hanya diperiksa BILA dikirim (`KONFLIK_REVISION` 409): HP lapangan tidak mengirimnya, layar admin / web mengirimnya. Satu transaksi per tiang; `SELECT … FOR UPDATE` hanya bila driver MySQL. Selesai 11 Nov: `opId` dicatat dengan INSERT `tiang_op` PERTAMA di dalam transaksi (kembaran yang bersamaan menunggu di kunci unik lalu menerima jawaban tersimpan; opId yang ditolak tidak terpakai karena baris dibatalkan); galat dua tahap: bentuk isian salah (422, semua sekaligus) lebih dulu, lalu aturan bisnis (kurang data, penyulang / segmen / induk) semuanya sekaligus; foto belum dicek (Task 5).

- [ ] **Step 1:** Fixture dari kasus `tests/verifikasiTiang.test.js` (status, koordinat, dasar koordinat, kelengkapan wajib, posisi kembar, induk/switching, tiang baru, TIDAK_DITEMUKAN) dan tes gagal: `simpan: jawaban dan baris DB sama dengan Apps Script untuk semua fixture`; `semua masalah validasi dikumpulkan sekaligus (≥3 field salah → 3 galat)`; `tanpa revision dari MOBILE tetap tersimpan, dan simpan kedua dengan data berbeda menimpa`; `opId sama dua kali → satu baris, jawaban sama`; `dua permintaan bersamaan opId sama → satu baris` (Review Focus 2); `tiang_audit mencatat siapa/kapan`.
- [ ] **Step 2:** Jalankan; Expected: FAIL.
- [ ] **Step 3:** Port aturan dari `simpanVerifikasiTiang_` (`TIANG_TOLERANSI_M_=10`, `dasarKoordinat`, `sumberKoordinat` GPS/PETA, `kurangLengkapTiang_`, `isianSirkuit_`). Pesan galat Indonesia per field.
- [ ] **Step 4:** Jalankan; Expected: PASS.

### Task 5: Foto dalam paket, atomik

**Files:** Modify `hosting/sisi-api/tiang_lib.php`, `hosting/sisi-api/tiang_aksi_tulis.php`; Test `tests/tiang-php.test.js`.

**Interfaces:** `simpanVerifikasiTiang` menerima `foto: {TIANG?: {sha256, ukuranByte, data(base64)}, KEPALA?: {…}}`. Fungsi `terimaFotoPaket(string $tiangId, string $slot, array $f): array` → `{path, sha256, bytes}` (cek JPEG magic, ukuran = `ukuranByte` ≤ 2 MB, `sha256` cocok, perkecil ke sisi ≤ 1600 px + thumbnail 320 px dengan GD/Imagick); `tulisBerkasAtomik(string $path, string $isi): void` (tmp + rename). Berkas di `<luar public_html>/sisi-tiang-foto/<kode_jalur>/<tiang_id>_<slot>_<sha8>.jpg`. Jawaban memuat `fotoAda: {TIANG: bool, KEPALA: bool}` dan `sha256` tiap foto baru. Server menolak `TERVERIFIKASI` bila foto lama+baru < 2 (`FOTO_BELUM_LENGKAP` pada field `foto`). `getFotoTiang` menyajikan KECIL/PENUH.

**Selesai 11 Nov:** berkas ditulis tmp + rename SEBELUM commit (nama memuat sidik, jadi berkas yatim tak berbahaya), dibuang bila transaksi gagal; foto lama dibuang setelah commit; batas badan permintaan naik ke 6 MB (data + 2 foto); `foto_dir` di config; `bersihkanYatim()` ada (dipanggil cron Task 8). `getFotoSwitching` dan foto switching ikut Task 6.

- [ ] **Step 1:** Tes gagal: `TERVERIFIKASI tanpa dua foto ditolak dan tidak menulis apa pun`; `foto lama di server dihitung (kirim hanya satu foto baru)`; `sha256 salah → FOTO_RUSAK, tidak ada baris/berkas berubah`; `foto >2 MB ditolak`; `foto besar diperkecil ≤1600 px dan thumbnail 320 px ada`; `DB commit gagal (paksa lewat tiang_op duplikat palsu / trigger uji) → berkas baru dihapus` (Review Focus 1); `proses berhenti setelah berkas ditulis sebelum commit → pemulung membersihkan berkas yatim` (fungsi `bersihkanYatim()` dijalankan di cadangan harian); `foto tidak menaikkan revision tiang`; `getFotoTiang mengembalikan jpeg`.
- [ ] **Step 2:** Jalankan; Expected: FAIL.
- [ ] **Step 3:** Implement: tulis berkas ke nama sementara → transaksi DB (baris `tiang_tiang`, `tiang_foto`) → rename ke nama akhir setelah commit; gagal = hapus sementara. Catat `tiang_foto(tiang_id, slot, path, sha256, bytes, drive_file_id NULL, diarsip_pada NULL)`.
- [ ] **Step 4:** Jalankan; Expected: PASS.

### Task 6: `simpanSegmen`, `simpanSwitching`, impor dari spreadsheet

**Files:** Modify `hosting/sisi-api/tiang_aksi_tulis.php`; Create `hosting/sisi-api/impor.php`, `backend/src/modules/102_Tiang_Hostinger.js` (bagian impor); Test `tests/tiang-php.test.js`, `tests/tiangHostinger.test.js`.

**Interfaces:** `aksiSimpanSegmen`, `aksiSimpanSwitching` (aturan dari `98_Segmen.js`, `96_Master_Switching.js`; foto switching dalam paket seperti Task 5). `impor.php` (`wajibTandaAppsScript`): body `{tabel, baris:[{…kolom sheet…}], mode:'upsert'}` → `{ok, ditulis, ditolak:[{baris, alasan}]}`; upsert per kunci (`tiang_id`, `sirkuit_id`, `segmen_id`, `switching_id`, id master), idempotent; menolak baris yang kolom id-nya bukan teks utuh `^[A-Za-z0-9_-]{1,40}$` (Review Focus 5). Apps Script: `ADMIN_imporTiangKeHostinger(opsi)` membaca SiSi_Tiang + tab master SiSi_Master, mengirim per tabel dalam potongan 300 baris, mencatat kemajuan di Script Property sehingga bisa dilanjutkan; `ADMIN_imporFotoTiang()` memindah foto lama dari Drive ke `tiang_foto` bertahap (batas waktu ±4 menit per proses, bisa diulang).

**Selesai 11 Nov:** `simpanSegmen`, `simpanSwitching` (+ foto satu paket, `getFotoSwitching`), `impor.php` (tabel, `foto_ada`, `foto`), `ADMIN_imporTiangKeHostinger`, `ADMIN_imporFotoTiang`. Uji ujung ke ujung: Apps Script asli mengimpor dunia uji ke PHP lewat `curl`, lalu kelima aksi baca sama dengan Apps Script. Pustaka bersama sekarang memuat `denganOperasi` (opId idempoten), `simpanFotoPaket`, `jawabFotoBerkas`, dan helper tulis.

- [ ] **Step 1:** Tes gagal: `segmen: fixture sama dengan Apps Script`; `switching + foto satu paket`; `impor: dua kali impor data sama → jumlah baris tetap`; `impor menolak tiang_id berbentuk 1.2E+15 atau tanggal`; `impor tanpa tanda HMAC 401`; (harness) `ADMIN_imporTiangKeHostinger mengirim potongan 300 dan melanjutkan dari kemajuan`.
- [ ] **Step 2:** Jalankan; Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Jalankan; Expected: PASS.

### Task 7: `ekspor.php`, tarik ke Sheet, arsip foto ke Drive

**Files:** Create `hosting/sisi-api/ekspor.php`; Modify `backend/src/modules/102_Tiang_Hostinger.js`; Test `tests/tiangHostinger.test.js`, `tests/tiang-php.test.js`.

**Interfaces:** `ekspor.php` (tanda HMAC): `?tabel=<nama>&setelah=<revision|waktu>&batas=500` → `{baris:[…], kursor}`; `?foto_belum_diarsip=1&batas=20` → daftar `{tiang_id, slot, path, sha256, bytes}` + `?unduh=<id>` isi base64; `?tandai_arsip` POST `{tiang_id, slot, drive_file_id}`. Apps Script: `ADMIN_tarikDataTiang(penuh)` menulis ke tab yang sama (header tetap, baris catatan "SALINAN - jangan diedit"), `ADMIN_arsipFotoTiang()` menyimpan ke `TIANG_FOTO_FOLDER_ID` (struktur folder sama dengan `uploadFotoTiang_` lama) lalu menandai; pemicu malam dipasang oleh `ADMIN_pasangPemicuTiang()`.

**Selesai 11 Nov (perubahan dari rencana awal):** penarikan selalu PENUH (halaman keyset `(urut, id)`, 500 baris), bukan inkremental: data hanya ribuan baris dan satu penulisan blok per tab lebih sederhana dan tahan galat; hanya EMPAT tab SiSi_Tiang yang ditarik (tab master SiSi_Master tetap diedit di Sheet dan diimpor, jadi tidak boleh tertimpa); penarikan hanya jalan bila `TIANG_API_URL` terisi atau `paksa`, dan tab server-kosong tidak menghapus Sheet berisi; baris catatan "SALINAN" diganti catatan sel (`setNote`) di A1 supaya header tidak berubah. Pemicu: per jam (cabut tiket, arsip foto, cek ruang) dan 01.30 WIB (tarik).

- [ ] **Step 1:** Tes gagal: `tarik inkremental hanya baris berubah`; `tarik penuh = isi MySQL`; `arsip: foto belum diarsip dipindah ke Drive (Drive tiruan harness) dan ditandai`; `ekspor tanpa HMAC 401`; `tab salinan berisi baris catatan, header tidak berubah`.
- [ ] **Step 2:** Jalankan; Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Jalankan; Expected: PASS.

### Task 8: Cadangan harian, pemantauan ruang, pembersih

**Files:** Create `hosting/sisi-api/cadangan.php`; Test `tests/tiang-php.test.js`.

**Interfaces:** `cadangan.php` hanya jalan dari CLI (`php_sapi_name()==='cli'`, selain itu 404): menulis dump `tiang_*` (query biasa, bukan `mysqldump`) ke `<luar public_html>/sisi-tiang-cadangan/tiang-YYYYMMDD.sql.gz`, menyimpan 14 berkas terakhir, memanggil `bersihkanYatim()`, dan menulis `sinkron_info('tiang_ruang')` berisi pemakaian foto. `ekspor.php?ruang=1` mengembalikan angka itu supaya Apps Script memperingatkan Master Guswan bila > 60% kuota.

**Selesai 11 Nov (perubahan dari rencana awal):** format cadangan JSON Lines digzip (`tiang-YYYYMMDD.jsonl.gz`), bukan `.sql.gz`: `exec` / `proc_open` dimatikan dan baris-baris SQL rapuh terhadap kutip / baris baru; JSONL bisa dipulihkan ke MySQL maupun SQLite lewat `cadangan.php pulihkan=<berkas> --ya`. Pemulihan satu transaksi. Pemantauan: `tiangStatus.cadangan`, `ekspor.php ruang.cadangan`, dan `cekRuangTiang_` (peringatan bila cadangan > 36 jam). Cron di hPanel dipasang di Task 13.

- [ ] **Step 1:** Tes gagal: `cadangan lewat HTTP 404`; `CLI menulis berkas dan memangkas ke 14`; `bersihkanYatim menghapus berkas tanpa baris tiang_foto yang lebih tua dari 1 jam`; `isi dump dapat dimuat ulang ke SQLite kosong dan jumlah baris sama`.
- [ ] **Step 2:** Jalankan; Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Jalankan; Expected: PASS. Pemasangan cron di hPanel dilakukan di Task 13 (lewat konektor, atas persetujuan Master Guswan).

### Task 9: Pembekuan tulis Apps Script dan jalur mundur

**Files:** Modify `backend/src/modules/99_Verifikasi_Tiang.js`, `98_Segmen.js`, `96_Master_Switching.js`, `101_Sinkron_Tiang.js`, `backend/src/modules/102_Tiang_Hostinger.js`; Test `tests/tiangHostinger.test.js`.

**Interfaces:** Script Property `TIANG_TULIS_BEKU` = `YA` membuat action tulis tiang (`simpanVerifikasiTiang`, `sinkronTiang`, `uploadFotoTiang`, `simpanSegmen`, `simpanSwitching`, `uploadFotoSwitching`) menjawab `PINDAH_HOSTINGER`; kode galat baru dipetakan ke pesan di HP ("Data tiang kini disimpan di server baru. Perbarui aplikasi."). `TIANG_API_URL` kosong = jalur lama berjalan. `ADMIN_tarikDataTiang({ paksa: true })` wajib dijalankan sebelum mundur (dicatat di komentar fungsi).

**Selesai 11 Nov:** penanda `bekuTiang: true` pada keenam endpoint tulis di `02_Router.js` + `cekBekuTiang_(ep)` di `proses_` (sesudah guard). Berlaku untuk HP dan website. Perintah mundur memakai `ADMIN_tarikDataTiang({ paksa: true })` (opsi objek, bukan `true`). Dampak yang perlu keputusan Master Guswan: halaman web admin yang menyimpan segmen / switching lewat Apps Script ikut terkunci sesudah pindah (dialihkan ke `tiang.php` = pekerjaan di luar rencana ini).

- [ ] **Step 1:** Tes gagal: `TIANG_TULIS_BEKU=YA → tiap action tulis tiang PINDAH_HOSTINGER, action baca tetap jalan`; `tanpa properti perilaku lama tidak berubah` (seluruh tes lama tetap lulus).
- [ ] **Step 2:** Jalankan; Expected: FAIL. Implement. Jalankan `npm test`; Expected: semua lulus.

### Task 10: HP — klien API tiang dan tiket

**Files:** Create `mobile/lib/features/tiang/tiket_tiang.dart`, `tiang_api.dart`; Modify `mobile/lib/core/versi.dart` (`InfoVersi.tiangApi`), `mobile/lib/core/deps.dart`, `mobile/lib/core/kode_error.dart` (kode baru: `FOTO_BELUM_LENGKAP`, `FOTO_RUSAK`, `PINDAH_HOSTINGER`, `TIKET_DICABUT`, `TIKET_KEDALUWARSA`, `AKSI_TIDAK_DIKENAL`); Test `mobile/test/tiket_tiang_test.dart`, `mobile/test/versi_test.dart`.

**Interfaces:** `TiketTiang(Future<Map<String,dynamic>> Function(Sesi) ambil)` dengan `Future<String> tiket(Sesi s)` (cache per user; minta baru bila sisa < 30 menit; satu permintaan berjalan bersama). `TiangApi(InfoVersi Function() info, TiketTiang tiket, http.Client)` dengan `Future<Map<String,dynamic>> panggil(Sesi s, String aksi, Map<String,dynamic> data, {Duration timeout = const Duration(seconds: 30)})`: pakai `tiangApi` dari `ping`; kosong = `Future` yang memakai `ApiClient` lama (jalur mundur). Galat `TIKET_KEDALUWARSA`/401 → ambil tiket baru SEKALI lalu ulang (Review Focus 3). Galat 422 diubah menjadi `GalatValidasi(List<({String field, String pesan})>)`.

**Selesai 11 Nov:** `TiketTiang`, `TiangApi`, `GalatValidasi`, dan `AlamatTiang` (alamat dari `ping` diingat di HP supaya start tanpa sinyal tidak salah jalur; info server selalu menang). Disambungkan di `Deps.tiangApi`. Kode galat server `TIKET_TIDAK_VALID` diberi nama HP `TIKET_TIANG_TIDAK_VALID` karena kode lama sudah dipakai alur pilih petugas Yandal; `FOTO_BELUM_LENGKAP` dari server tidak dipakai (kekurangan foto datang sebagai galat 422 field `foto`). Kegagalan memperbarui tiket (tanpa sinyal) tidak memutus kerja selama tiket lama belum kedaluwarsa. Alur simpan yang memakai `TiangApi.panggil` = Task 11.

- [ ] **Step 1:** Tes gagal: `tiket dipakai ulang sampai 30 menit terakhir`; `dua pemanggil bersamaan → satu permintaan tiket`; `401 → tiket baru sekali lalu ulang, tetap 401 → galat`; `422 → GalatValidasi dengan field`; `tiangApi kosong → jalur lama`; `InfoVersi.dariJson membaca tiangApi`.
- [ ] **Step 2:** `cd mobile && flutter test test/tiket_tiang_test.dart test/versi_test.dart`; Expected: FAIL. Implement. Expected: PASS. `flutter analyze` bersih.

### Task 11: HP — `DrafTiang` dan alur simpan satu paket

**Files:** Create `mobile/lib/features/tiang/draf_tiang.dart`; Modify `tiang_repository.dart`, `tiang_form_screen.dart`, `jalur_tiang_screen.dart`, `segmen_screen.dart`, `verifikasi_tiang_screen.dart`, `mobile/lib/core/sync_controller.dart`, `deps.dart`; Test `mobile/test/draf_tiang_test.dart`, `mobile/test/tiang_test.dart`.

**Interfaces:** `enum StatusDraf { belumTerkirim, perluDiperbaiki }`. `DrafTiang extends ChangeNotifier` (konstruktor menerima `GudangHartek`, `TiangApi`, `TiangLokal`, `bacaFoto`, `hapusFoto`): `Future<void> simpan(Sesi s, {required String ref, required String kode, required String jenis /*TIANG|SEGMEN*/, required Map<String,dynamic> data, required Map<String,dynamic> tampil, Map<String,String> foto = const {}})` (menulis draf tmp+rename, `opId` tetap per draf); `Future<HasilKirim> kirim(Sesi s, String ref)` (satu paket: data + foto yang ada; sukses → perbarui salinan lokal lewat `TiangLokal.terima`, hapus foto lokal HANYA bila `sha256` jawaban cocok, hapus draf; 422 → `HasilKirim.ditolak(galat)`, draf `perluDiperbaiki` bila dari kirim latar; galat jaringan → `HasilKirim.belumTerkirim`, draf tetap); `Future<int> kirimSemua(Sesi s)` (FIFO per waktu simpan; draf dengan induk `LOKAL-…` belum terkirim ditunda); `Future<void> hapus(Sesi s, String ref)` (hanya dipanggil dari konfirmasi UI); `Draf? ambil(String userId, String ref)`; `List<Draf> semua(String userId)`; `Future<int> jumlah(String userId)` (menahan logout). Tidak ada aksi yang menghapus foto kecuali `hapus` dan sukses terkonfirmasi.

**Selesai 11 Nov (sebagian, lihat "Belum"):** `DrafTiang` (`draf_tiang.dart`) menggantikan `AntreanTiang` untuk tiang dan segmen: draf ditulis ke HP lebih dulu, lalu SATU paket dikirim; `TiangRepository.simpanTiang` / `simpanSegmen`; form tiang dan segmen menyimpan di tempat ("Menyimpan…", galat server per isian, tetap di form bila ditolak); daftar jalur menampilkan "Draf, belum terkirim" / "Draf perlu diperbaiki" (ikon awan coret, tidak hijau, tidak dihitung selesai) dengan Perbaiki Isian / Kirim Ulang / Hapus Draf (konfirmasi menyebut foto ikut terhapus); `SyncController` memanggil `kirimSemua`. Tambahan: jalur mundur di dalam `DrafTiang` (alamat API kosong = data ke Apps Script lama lalu foto satu per satu, `dataTerkirim` mencegah data dobel) dan migrasi antrean lama `antre_tiang_<user>` menjadi draf (entri "hanya foto tersisa" jadi perlu diperbaiki, foto tetap di HP).

**Belum / ditunda:** (1) autosave isian form selama mengisi (S§9.1) — butuh serialisasi `IsianTiang`; yang sudah terjamin: draf ditulis SEBELUM kirim, jadi data tidak hilang saat gagal kirim; (2) Task 11b (Master Switching di HP) SELESAI, lihat bagian sendiri di bawah; (3) `antrean_tiang.dart` + `antrean_tiang_test.dart` sudah tidak dipakai (menunggu izin menghapus); (4) tampilan form / daftar baru belum dicoba di HP.

- [ ] **Step 1:** Tes gagal (`draf_tiang_test.dart`, API tiruan): `simpan menulis draf dan foto dicatat`; `kirim sukses: draf & foto lokal terhapus hanya bila sha256 cocok`; `sha256 beda → foto lokal DIPERTAHANKAN`; `422 → draf tetap, galat disimpan, status perluDiperbaiki bila latar`; `jaringan putus → draf tetap lengkap, status belumTerkirim`; `berkas foto hilang → galat terlihat bukan terkirim` (Review Focus 4); `kirimSemua FIFO dan induk LOKAL menunggu`; `hapus tanpa konfirmasi tidak ada jalannya (API publik hanya hapus)`; `draf bertahan setelah muat ulang (baca dari berkas)`; `logout ditahan bila ada draf`.
- [ ] **Step 2:** `flutter test test/draf_tiang_test.dart`; Expected: FAIL.
- [ ] **Step 3:** Implement `DrafTiang`. Form: Simpan memanggil `simpan` lalu `kirim` dengan layar "Menyimpan…"; hasil terkirim → popup `tampilPopupBerhasil('Data Tersimpan')` dan kembali; ditolak → tetap di form, gulir ke isian pertama (mekanisme `_keGalat` yang ada, kini dari daftar `GalatValidasi`); belum terkirim → pesan jelas + kembali ke daftar dengan draf. Daftar jalur: baris berdraf tampil ikon awan coret + "Draf, belum terkirim" / "Draf perlu diperbaiki", tidak hijau, tidak dihitung ke progres, dapat dibuka (tombol Kirim Ulang, Perbaiki Isian, Hapus Draf dengan dialog "foto ikut terhapus"). `SyncController` memanggil `kirimSemua` saat sinyal kembali. Autosave draf saat mengisi (debounce 2 dtk).
- [ ] **Step 4:** Perbarui `mobile/test/tiang_test.dart` (alur lama dihapus, alur baru); `flutter test`; Expected: lulus. `flutter analyze` bersih.

### Task 12: HP — pilihan titik tidak tereset dan koordinat dikunci

**Files:** Modify `mobile/lib/features/tiang/tiang_form_screen.dart`, `tiang_model.dart`; Test `mobile/test/tiang_test.dart`.

**Interfaces:** `IsianTiang.koordinatDikunci: bool`; `IsianTiang.setKoordinat(String k, {double? akurasiM, String sumber = ''})` yang mempertahankan `dasarKoordinat` bila `selisihM > toleransiKoordinatM` dan mengosongkannya hanya bila selisih ≤ batas; tombol "Ambil Ulang" membuka kunci setelah konfirmasi; "Pilih di Peta" menanyakan konfirmasi bila koordinat sudah dikunci.

- [ ] **Step 1:** Tes gagal: `dasarKoordinat bertahan saat koordinat berubah tetapi selisih tetap >10 m`; `dasar dibuang bila selisih ≤10 m`; `dasar diminta lagi bila selisih naik >10 m`; `GPS kedua tidak menimpa koordinat terkunci`; `Ambil Ulang membuka kunci`.
- [ ] **Step 2:** `flutter test test/tiang_test.dart`; Expected: FAIL. Implement; Expected: PASS.

### Task 13: Staging berdampingan, deploy, uji

**Files:** Modify `mobile/pubspec.yaml`, `mobile/lib/core/versi.dart` (`1.0.76`/`+250`), `docs/API-CONTRACT.md`, `docs/PRD.md`, `docs/pratinjau-mingguan/2026-11-15.md`; Create `docs/runbook-tiang-hostinger.md`.

- [ ] **Step 1:** `npm test` (semua lulus) dan `flutter test` + `flutter analyze` (bersih); `PHP_BIN=<php> node --test tests/tiang-php.test.js tests/php-api.test.js`.
- [ ] **Step 2:** Bangun zip API (`web/scripts/zip.cjs` pola `sisi-api.zip`) dan unggah ke folder `sisi-api-staging` di Hostinger (File Manager atau konektor, atas persetujuan Master Guswan). Pastikan konfigurasi staging ada di luar `public_html`. Jalankan `status.php`; Expected: tabel `tiang_*` terbuat di `u832253372_sisi_staging`.
- [ ] **Step 3:** Deploy backend staging (`npm run deploy:staging -- "1.0.76 tiang hostinger"`), set Script Property `TIANG_API_URL` staging; jalankan `ADMIN_imporTiangKeHostinger`, `ADMIN_imporFotoTiang`; bandingkan jumlah baris tiap tab dengan Sheet dan 5 tiang contoh.
- [ ] **Step 4:** Uji CDN: simpan satu tiang lalu baca dua kali berturut-turut (curl berkala); jika basi, minta Master Guswan mengecualikan jalur API dari CDN di hPanel.
- [ ] **Step 5:** Pasang cron cadangan harian lewat konektor (`agency`/`hosting_cron-jobs` create, perintah `php <path>/cadangan.php` tanpa pipa/redireksi) setelah disetujui; pasang pemicu Apps Script (`ADMIN_pasangPemicuTiang`).
- [ ] **Step 6:** Bangun APK staging (`scripts\build-rilis.ps1 -Target staging`), tanda tangan SiSi cocok. Master Guswan menguji di lapangan: isi tiang baru, edit tiang lama, tanpa sinyal lalu sinyal kembali, hapus draf, pilihan titik. Catat waktu simpan.
- [ ] **Step 7:** Perbarui `docs/pratinjau-mingguan/2026-11-15.md` (bagian baru: hasil, risiko, untuk peninjau).

### Task 14: Cutover production (HANYA atas perintah Master Guswan)

**Files:** tidak ada kode baru; `docs/runbook-tiang-hostinger.md`.

- [ ] **Step 1:** Prasyarat: Task 13 terbukti di lapangan; `ADMIN_siapkanSheetTiang` sudah dijalankan di production; zip API diunggah ke `sisi-api` dan konfigurasi production ada di luar `public_html`; cron + pemicu terpasang; cadangan Sheet SiSi_Tiang disalin manual.
- [ ] **Step 2:** Bekukan tulis lama: set `TIANG_TULIS_BEKU=YA` (production). Jalankan `ADMIN_imporTiangKeHostinger` penuh + `ADMIN_imporFotoTiang` sampai selesai; bandingkan jumlah baris.
- [ ] **Step 3:** Deploy backend production atas perintah ("deploy production"); set `TIANG_API_URL`; bangun APK production `1.0.76`; bagikan. `VERSI_BACKEND_` tetap 1.0.69, jadi notifikasi update mengikuti `NOTIFIKASI_UPDATE_APP`.
- [ ] **Step 4:** Pantau dua hari: waktu simpan, galat `tiang_audit`, ruang foto. Jalur mundur (S§12): jalankan `ADMIN_tarikDataTiang({ paksa: true })`, kosongkan `TIANG_API_URL`, set `TIANG_TULIS_BEKU` kosong.

### Task 11b: Master Switching di HP lewat TiangApi (selesai 11 Nov 2026)

`SwitchingRepository(api, tiangApi)`: `getMasterSwitching`, `simpanSwitching` (satu paket data + foto + `opId`, kirim ulang tombol "Coba Lagi" memakai opId yang sama), `getFotoSwitching`, dan foto susulan (`uploadFotoSwitching`, endpoint PHP baru) lewat `TiangApi`; jalur mundur (alamat kosong) = Apps Script lama (data lalu foto satu per satu). Master Jaringan (`getJaringan`, `simpanSection`, `setAktifPenyulang`) tetap Apps Script; tab master masih diedit di Sheet sehingga salinannya di MySQL diperbarui otomatis (`imporMasterTiang_`: sesudah simpanSection / setAktifPenyulang dan tiap jam). Layar Master Switching tidak lagi terkunci oleh `TIANG_TULIS_BEKU`.

## Di luar rencana ini (perlu keputusan Master Guswan)

- Web admin: apakah halaman web yang menampilkan data tiang/jalur perlu dialihkan membaca `tiang.php` (tiket web yang ada sudah mendukung pola ini). Saat ini tidak ada tugas web di rencana.
- Layar edit master (konstruksi, ukuran tiang, pemetaan) di web admin: sampai ada, tiga tab master diimpor ulang dari Sheet dengan `ADMIN_imporTiangKeHostinger({tabel})` (S§17).
- Pemensiunan kode `AntreanTiang` dan `101_Sinkron_Tiang.js`.
