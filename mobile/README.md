# SiSi ROW (Flutter)

Aturan app ada di PRD SiSi v2: **5. Alur Aplikasi** (urutan layar) dan **6. Endpoint** (request/response).

## Struktur (v0.18, desain mengikuti SiSi_Mobile lama)

```
lib/
  main.dart                  Env.pastikanValid() -> locale id_ID -> Deps.siapkan() -> SisiApp
  app.dart                   splash -> Login (belum ada sesi) / Dashboard (ada sesi)
  theme/                     AppColors + AppTheme, disalin persis dari app lama
  widgets/                   brand, app bar navy + pill Online/Offline, SectionCard, input,
                             StatusBadge, AccurateGpsButton + dialog mock GPS
  core/                      env, api_client, kode_error, sesi, session_store, wib,
                             sync_controller (sync tiap buka app, 5 menit, setelah simpan), deps
  data/local_db.dart         SQLite v2: master_cache, outbox, foto_antre, kode_terpakai,
                             row_header, row_realisasi, row_eksekusi (salinan 7 hari tim sendiri)
  features/
    auth/login_screen.dart   halaman brand -> bottom sheet login -> dialog sukses
    shell/                   dashboard: Laporan · Beranda · Pengaturan, bottom bar gelembung navy
    home/beranda_screen.dart kartu hero navy + Akses cepat
    settings/                akun, sinkronisasi, Download Master Data, Keluar (ditolak bila outbox isi)
    master/                  getMaster + cache lokal (penyulang, section, jenis pekerjaan)
    row/
      laporan_row_screen     daftar header (LaporanHeaderCard) + FAB buat laporan
      form_header_screen     3 SectionCard: koordinat, KM, kendala
      header_detail_screen   tab Detail Laporan | Realisasi (n), FAB Tambah Penyulang
      realisasi_screen       daftar eksekusi, FAB amber Input Eksekusi
      form_eksekusi_screen   section, tiang, koordinat, diameter -> jenis
      row_model / row_repository / row_outbox / sync_service / kode_row / jenis_pekerjaan
test/
  kode_row_test, sesi_test, jenis_pekerjaan_test, koordinat_test
```

M4 (v0.62): Hapus / Batal berantai + Urungkan, Pusat Masalah Sinkron (Minta nomor baru, Gabungkan, konflik revisi, Perbaiki). Spesifikasi: PRD 13.

## Aset gambar

Salin dari repo lama (nama file harus sama):

```powershell
Copy-Item ..\..\SiSi-ULP-Toboali\SiSi_Mobile\assets\images\* assets\images\
```

Yang dipakai: logo-sisi.png, logo-pln.png, bg-sisi.png, loading.gif.

## Izin Android

`android/app/src/main/AndroidManifest.xml`, di atas tag `<application`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<!-- v1.0.12: sinkron latar (flutter_foreground_task) -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
```

v1.0.12: di DALAM tag `<application ...>` (sejajar `<activity>`), daftarkan layanan sinkron latar:

```xml
<service
    android:name="com.pravera.flutter_foreground_task.service.ForegroundService"
    android:foregroundServiceType="dataSync"
    android:exported="false" />
```

`scripts\build-rilis.ps1` dan `scripts\uji-hp.ps1` memasang izin + blok ini otomatis (idempoten). Tanpa blok ini app tetap jalan, tapi sinkron hanya saat app di depan (perilaku lama). Salinan lengkap:
`docs/android/AndroidManifest-sinkron-latar.xml`. HP Xiaomi / Oppo / Vivo / Realme: minta petugas mengizinkan
"Mulai otomatis" / "Tanpa batasan baterai" untuk SiSi di Pengaturan HP (app juga meminta izin optimasi baterai sekali).

## Setup pertama

```bash
cd mobile
flutter create --org id.co.pln.toboali --project-name sisi_row --platforms android,ios .
Remove-Item test\widget_test.dart   # contoh bawaan flutter create, memanggil MyApp yang tidak ada
flutter pub get
cp env/staging.example.json env/staging.json        # isi URL deployment staging
cp env/production.example.json env/production.json  # isi URL deployment production
flutter test
```

`flutter create .` hanya menambah folder `android/` dan `ios/`; file yang sudah ada (pubspec, lib, test) tidak ditimpa.
Kalau `flutter pub get` mengeluh versi paket, jalankan `flutter pub upgrade --major-versions`.

## Flavor Android

`android/app/build.gradle.kts` lengkap (flavor + keystore rilis) ada di `docs/android/build.gradle.kts`, timpa utuh.
Flavor staging = paket `id.co.pln.toboali.sisi_new.staging`, nama "SiSi STG"; production = paket dasar, nama "SiSi ULP Toboali".
Flavor wajib berpasangan dengan env (uji-hp.ps1 dan build-rilis.ps1 memasangkannya otomatis).

Di `android/app/src/main/AndroidManifest.xml` ganti `android:label` jadi `@string/app_name`, dan tambahkan di atas `<application>`:

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
```

APK staging dan production bisa terpasang bersamaan (applicationId beda).

## Keystore rilis (v0.58)

Satu keystore untuk **staging dan production** (keystore = identitas penanda tangan, bukan env; paket tetap beda lewat flavor).
Keystore hilang = app production tidak bisa di-update lagi (petugas harus copot app, outbox hilang).

1. Buat sekali: `powershell -ExecutionPolicy Bypass -File scripts\buat-keystore.ps1`
   (keystore di `%USERPROFILE%\.sisi\sisi-release.jks`, di luar repo; `android/key.properties` berisi path, password, sha256).
2. Backup `.jks` + password ke 2 tempat aman. Jangan ke git, zip, atau Shared Drive tim. `*.jks`, `key.properties` sudah di `.gitignore`.
3. Pasang potongan `docs/android/signing.gradle.kts` di `android/app/build.gradle.kts` per bagian, bukan utuh: import paling atas sebelum `plugins`, baca key.properties setelah `plugins`, `signingConfigs` di dalam `android`, `buildTypes` bawaan (kunci debug) diganti, cek rilis paling bawah.
4. Copot sekali app lama yang bertanda tangan debug (outbox kosong dulu): `scripts\uji-hp.ps1 -Uninstall`. Setelah itu `flutter run` / `uji-hp.ps1` ikut kunci rilis, jadi tidak perlu copot lagi.
5. Build: `scripts\build-rilis.ps1 [-Target production] [-Pasang]`. Script menolak APK berkunci debug atau SHA-256 yang beda dengan keystore.
   Production wajib flavor (bagian Flavor Android).

Kalau nanti ke Play Store: keystore ini jadi upload key (Play App Signing).

## iOS (wajib sebelum ke lapangan)

`ios/Runner/Info.plist`: tambahkan `NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription`,
`NSPhotoLibraryUsageDescription`. Tanpa ini kamera dan GPS gagal di iOS.

## Menjalankan

```bash
flutter run --flavor staging --dart-define-from-file=env/staging.json
flutter build apk --flavor production --dart-define-from-file=env/production.json
```

## Yang belum ada (sengaja)

- Form input ROW, foto, laporan: menunggu keputusan jalur input di PRD **9. Pertanyaan Terbuka**.
- `getKodeRow` (tarik kode hari ini setelah login/reinstall): tanda `TODO(getKodeRow)` di `login_page.dart`.
- Sync ROW: server masih menjawab `BELUM_DIIMPLEMENTASI`, app menampilkan "data aman di HP".

## Android: izin & WhatsApp (v0.21)

Di `AndroidManifest.xml`, tambahkan di dalam tag `<queries>` yang sudah ada (di luar `<application>`), supaya tombol **Kirim WA** bisa membuka WhatsApp:

```xml
<intent>
    <action android:name="android.intent.action.VIEW" />
    <data android:scheme="https" />
</intent>
```

Kamera/galeri memakai `image_picker` (tanpa izin CAMERA tambahan).

## Kamera SiSi + watermark (v0.29)

- Paket `camera` (kamera di dalam app, layar dikunci landscape) dan `image` (encode JPEG watermark).
- Android: pastikan `android/app/src/main/AndroidManifest.xml` punya
  `<uses-permission android:name="android.permission.CAMERA" />` (izin lokasi sudah ada untuk GPS).
  minSdk minimal 21.
- iOS (kalau dibuild): `ios/Runner/Info.plist` tambahkan `NSCameraUsageDescription` dan `NSMicrophoneUsageDescription`.
- Logo watermark: `assets/images/logo-sisi.png` dan `assets/images/logo-pln.png` (sama dengan logo login).
- GPS diambil ulang otomatis tiap jepret (stream selama kamera terbuka). Lokasi palsu ditolak.
- Foto galeri tetap diberi watermark, baris "Sumber : Galeri (bukan kamera SiSi)", koordinat dari input form.

## Simpan foto ke galeri (v0.31)

- Paket `gal`. Foto ber-watermark disalin ke album galeri **SiSi ROW** saat Download ulang foto, atau lewat tombol
  Simpan ke Galeri di layar Lihat Foto. Nama file = `<Kode Eksekusi>_<SLOT>.jpg`. File di folder app tetap.
- Android (HP lama, Android 10 ke bawah) — `android/app/src/main/AndroidManifest.xml`:
  `<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />`
  dan atribut `android:requestLegacyExternalStorage="true"` di tag `<application>`.
- iOS: `NSPhotoLibraryAddUsageDescription` di Info.plist.
- Catatan: kalau Google Photos backup aktif, album ini ikut ter-backup ke akun Google HP.

## Uji di HP (data selalu kosong)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\uji-hp.ps1             # semua HP Android: hapus data app lalu flutter run
powershell -ExecutionPolicy Bypass -File scripts\uji-hp.ps1 -Uninstall  # copot total dulu (izin kamera/lokasi/galeri ditanya ulang)
```

Script hanya menghapus data app di HP (SQLite, sesi, foto lokal). Data server staging tidak disentuh.
Login ulang di HP lain mencabut sesi akun yang sama di HP sebelumnya (satu akun satu HP).

## Nama & ikon app (v0.37)

Nama tampil: **SiSi ULP Toboali** (staging: judul app "SiSi ULP Toboali STG").

- Android: `android/app/src/main/AndroidManifest.xml`, tag `<application>`: `android:label="@string/app_name"` (v0.58.2: nama dari flavor, production "SiSi ULP Toboali", staging "SiSi STG").
  Kalau flavor dipasang (bagian Flavor Android), ganti `resValue("string", "app_name", ...)` jadi
  `"SiSi ULP Toboali STG"` (staging) dan `"SiSi ULP Toboali"` (production).
- iOS: `ios/Runner/Info.plist`, `CFBundleDisplayName` = `SiSi ULP Toboali`.
- Ikon = `assets/images/logo-sisi.png` lewat paket flutter_launcher_icons (konfigurasi di pubspec.yaml):

```powershell
cd mobile
flutter pub get
dart run flutter_launcher_icons
```

Launcher HP menyimpan ikon lama: pasang ulang (`scripts\uji-hp.ps1 -Uninstall`).

## Notifikasi pengingat login Yandal / FCM (v0.83.0)

Sekali saja (satu project Firebase untuk staging + production):

1. https://console.firebase.google.com > Add project (mis. `sisi-toboali`, Analytics boleh dimatikan).
2. Project settings > General > Add app > Android, daftarkan DUA paket: `id.co.pln.toboali.sisi_new` dan `id.co.pln.toboali.sisi_new.staging`.
   Download `google-services.json` SESUDAH keduanya terdaftar (satu file berisi dua app), taruh di `android/app/google-services.json`.
   File ini lokal (jangan ke git / zip).
3. `android/settings.gradle.kts`, di blok `plugins { ... }` tambahkan:
   ```kotlin
   id("com.google.gms.google-services") version "4.4.2" apply false
   ```
4. `android/app/build.gradle.kts`: timpa dari `docs/android/build.gradle.kts` (v0.83.0) atau tambahkan baris
   `if (file("google-services.json").exists()) apply(plugin = "com.google.gms.google-services")` sesudah blok `plugins`.
5. `AndroidManifest.xml` (Android 13+), di atas `<application>`: `<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>`
6. Backend: Project settings > Service accounts > Generate new private key. Isi JSON utuh ke Script Property `FCM_SERVICE_ACCOUNT`
   (staging dan production boleh JSON yang sama).

Tanpa `google-services.json` app tetap jalan, notifikasi saja yang mati. v1.0.29: langkah 3 dan 4 dipasang otomatis oleh
`scripts\build-rilis.ps1` (gradle lokal), dan skrip memberi PERINGATAN kalau `android/app/google-services.json` belum ada.

v1.0.30: penerima = HP tim YANDAL (pengingat login), HP admin (belum login, ringkasan temuan petugas tiap 15 menit, ringkasan
P0 masuk tiap 60 menit, tanpa bunyi), dan semua HP tim tindak lanjut (WO baru, langsung). Kanal Android: Pengingat login
Yandal, WO tindak lanjut, Ringkasan admin (bisa dimatikan sendiri-sendiri di Pengaturan Android). Ketuk notifikasi = layar
tujuannya. Logout akun selain Yandal = HP itu berhenti menerima notifikasi akun tersebut. Pastikan SiSi tidak di-Force stop
dan penghemat baterai / autostart (Xiaomi, Oppo, Vivo) mengizinkan SiSi, supaya notifikasi tetap masuk saat app ditutup. Saat login pertama HP minta izin notifikasi: wajib **Izinkan**
di HP tim Yandal dan HP admin. Notifikasi saat app terbuka tampil sebagai banner di bawah layar.

## Pemakaian Engine / Cloud Run (v0.85.0)

Menu Operasi > Pemakaian Engine (akun ADMIN / SUPER) menampilkan kuota Apps Script dan pemakaian Cloud Run per layanan.

1. Google Cloud Console project `db-sisi-toboali` > APIs & Services > aktifkan **Cloud Monitoring API**.
2. IAM > Grant access: email service account (`client_email` di JSON FCM, atau service account baru) diberi role **Monitoring Viewer**.
3. Script Property: `CLOUD_RUN_PROJECT` = `db-sisi-toboali`. Bila pakai service account lain, isi JSON-nya ke `MONITOR_SERVICE_ACCOUNT`.
4. Opsional `CLOUD_RUN_LAYANAN` = `sisi2-pdf-staging,sisi2-pdf-production` (kosong = semua layanan).
5. db_Akses: pastikan OPS_ENGINE diizinkan untuk ADMIN / SUPER. Cek dari editor: `ADMIN_cekPemakaian`.

## Build Android: compileSdk 36 + peringatan (v0.85.1)

- `docs/android/root.build.gradle.kts` = isi lengkap `mobile/android/build.gradle.kts` (ROOT, bukan `android/app`). Timpa utuh, lalu `flutter clean`.
  Isinya: paksa semua plugin compile ke SDK 36 (file_picker 8.x masih android-34, error `checkReleaseAarMetadata`) dan sembunyikan peringatan javac plugin.
  Kalau muncul "failed to find target android-36": install Android SDK Platform 36 dari SDK Manager.
- Opsional, hanya bila `java -version` >= 24 (peringatan "restricted method java.lang.System"):
  `[Environment]::SetEnvironmentVariable("GRADLE_OPTS","--enable-native-access=ALL-UNNAMED","User")` sekali di PowerShell (lalu buka ulang VS Code),
  dan di `mobile/android/gradle.properties` tambahkan ` --enable-native-access=ALL-UNNAMED` di ujung baris `org.gradle.jvmargs=...`.
- Peringatan "Kotlin Gradle Plugin / Built-in Kotlin" (camerax, package_info_plus, pdfx, share_plus) belum bisa dihilangkan: menunggu rilis plugin. Aman untuk Flutter sekarang.
