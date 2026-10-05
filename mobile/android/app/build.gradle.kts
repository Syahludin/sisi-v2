// SiSi v0.58.3: mobile/android/app/build.gradle.kts LENGKAP (keystore rilis + flavor staging / production).
// Ditimpa utuh ke file app. Bagian bawaan flutter create (namespace, sdk, kotlin, flutter) tidak diubah.
import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Keystore rilis (v0.58): android/key.properties dibuat scripts\buat-keystore.ps1, tidak ikut git / zip.
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
val adaKeystore = keystorePropertiesFile.exists()
if (adaKeystore) keystoreProperties.load(FileInputStream(keystorePropertiesFile))

android {
    namespace = "id.co.pln.toboali.sisi_row"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        resValues = true // app_name per flavor (AGP 9 mematikannya secara bawaan)
    }

    defaultConfig {
        // v0.58.3 (kvlar): ID app = id.co.pln.toboali.sisi_new (staging + ".staging"). Jangan diganti lagi setelah production rilis.
        // namespace tetap sisi_row (paket kode Kotlin, tidak terlihat user).
        applicationId = "id.co.pln.toboali.sisi_new"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // Flavor (v0.58.2): staging dan production = 2 app terpisah, bisa terpasang bersamaan.
    // Wajib berpasangan dengan env: --flavor staging + env/staging.json, --flavor production + env/production.json
    // (uji-hp.ps1 dan build-rilis.ps1 memasangkannya otomatis).
    flavorDimensions += "env"
    productFlavors {
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".staging"
            resValue("string", "app_name", "SiSi STG")
        }
        create("production") {
            dimension = "env"
            resValue("string", "app_name", "SiSi ULP Toboali")
        }
    }

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

    buildTypes {
        release {
            signingConfig = if (adaKeystore) signingConfigs.getByName("release") else null
        }
        debug {
            // flutter run (uji-hp.ps1) ikut kunci rilis: tanda tangan sama, tidak perlu copot app tiap ganti build
            if (adaKeystore) signingConfig = signingConfigs.getByName("release")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

// Rilis tanpa keystore = gagal, tidak pernah jatuh ke kunci debug.
gradle.taskGraph.whenReady {
    val rilis = allTasks.any { (it.name.startsWith("assemble") || it.name.startsWith("bundle")) && it.name.endsWith("Release") }
    if (rilis && !adaKeystore) {
        throw GradleException("android/key.properties tidak ada. APK rilis SiSi wajib kunci rilis: jalankan scripts\\buat-keystore.ps1")
    }
}
