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

Belum di M1: foto (M2), preview + Kirim WA (M3), ubah/batal + Minta nomor baru (M4).

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
```

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
