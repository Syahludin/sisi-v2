// SiSi v0.58.1: tanda tangan rilis. JANGAN tempel file ini utuh di satu tempat; tiap bagian punya posisi sendiri.
// Salin ke mobile/android/app/build.gradle.kts (lihat mobile/README.md bagian Keystore rilis).

// (1a) BARIS PALING ATAS file, SEBELUM blok plugins { ... } (Kotlin script: import wajib paling atas):
import java.io.FileInputStream
import java.util.Properties

// (1b) SETELAH blok plugins { ... } selesai, sebelum android { ... }:
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
val adaKeystore = keystorePropertiesFile.exists()
if (adaKeystore) keystoreProperties.load(FileInputStream(keystorePropertiesFile))

// (2) DI DALAM android { ... }, sebelum buildTypes:
    signingConfigs {
        create("release") {
            if (adaKeystore) {
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
            }
        }
    }

// (3) GANTI seluruh blok buildTypes { ... } bawaan flutter create
//     (bawaan: release memakai signingConfigs.getByName("debug"), itu yang harus hilang):
    buildTypes {
        release {
            signingConfig = if (adaKeystore) signingConfigs.getByName("release") else null
        }
        debug {
            // flutter run (uji-hp.ps1) ikut kunci rilis: tanda tangan sama, tidak perlu copot app tiap ganti build
            if (adaKeystore) signingConfig = signingConfigs.getByName("release")
        }
    }

// (4) PALING BAWAH file (di luar android { ... }): rilis tanpa keystore = gagal, tidak pernah jatuh ke kunci debug.
gradle.taskGraph.whenReady {
    val rilis = allTasks.any { (it.name.startsWith("assemble") || it.name.startsWith("bundle")) && it.name.endsWith("Release") }
    if (rilis && !adaKeystore) {
        throw GradleException("android/key.properties tidak ada. APK rilis SiSi wajib kunci rilis: jalankan scripts\\buat-keystore.ps1")
    }
}
