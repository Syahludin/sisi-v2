# SiSi ROW (Flutter)

Aturan app ada di PRD SiSi v2: **5. Alur Aplikasi** (urutan layar) dan **6. Endpoint** (request/response).

## Struktur

```
lib/
  main.dart                  Env.pastikanValid() -> Deps.siapkan() -> SisiApp
  app.dart                   gerbang: belum ada sesi -> Login, ada sesi -> Beranda
  core/
    env.dart                 SISI_ENV + SISI_API_URL dari env/<env>.json
    api_client.dart          satu-satunya pintu ke backend, tolak env tidak cocok
    kode_error.dart          kode error server + pesan untuk petugas
    sesi.dart                model sesi, batas offline, akses menu (pure Dart)
    session_store.dart       token di secure storage
    wib.dart                 tanggal bisnis WIB
    deps.dart                semua objek dibuat di sini
  data/
    local_db.dart            SQLite: master_cache, outbox, foto_antre, kode_terpakai
  features/
    auth/                    login, cekSesi, logout + layar login
    master/                  getMaster + cache lokal
    home/                    beranda, sync, logout dengan peringatan outbox
    row/
      kode_row.dart          kode berantai Header -> PNY -> EKS (pure Dart, sudah dites)
      jenis_pekerjaan.dart   diameter -> jenis dari master, 1-24 cm ditolak (sudah dites)
      row_outbox.dart        antrean operasi offline
      sync_service.dart      kirim outbox via syncRow, tandai status per operasi
      row_home_page.dart     placeholder form ROW (menunggu PRD bagian 9)
test/
  kode_row_test.dart, sesi_test.dart, jenis_pekerjaan_test.dart
```

## Setup pertama

```bash
cd mobile
flutter create --org id.co.pln.toboali --project-name sisi_row --platforms android,ios .
flutter pub get
cp env/staging.example.json env/staging.json        # isi URL deployment staging
cp env/production.example.json env/production.json  # isi URL deployment production
flutter test
```

`flutter create .` hanya menambah folder `android/` dan `ios/`; file yang sudah ada (pubspec, lib, test) tidak ditimpa.
Kalau `flutter pub get` mengeluh versi paket, jalankan `flutter pub upgrade --major-versions`.

## Flavor Android

`android/app/build.gradle.kts`, di dalam blok `android { ... }`:

```kotlin
flavorDimensions += "env"
productFlavors {
    create("staging") {
        dimension = "env"
        applicationIdSuffix = ".staging"
        resValue("string", "app_name", "SiSi ROW STG")
    }
    create("production") {
        dimension = "env"
        resValue("string", "app_name", "SiSi ROW")
    }
}
```

Di `android/app/src/main/AndroidManifest.xml` ganti `android:label` jadi `@string/app_name`, dan tambahkan di atas `<application>`:

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
```

APK staging dan production bisa terpasang bersamaan (applicationId beda).

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
