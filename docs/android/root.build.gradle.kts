// v0.85.1: android/build.gradle.kts (ROOT, bukan android/app). Timpa utuh: mobile/android/build.gradle.kts
allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory = rootProject.layout.buildDirectory.dir("../../build").get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}

subprojects {
    if (name == "camera_android_camerax") {
        plugins.withId("com.android.library") {
            dependencies.add("implementation", "androidx.concurrent:concurrent-futures:1.2.0")
        }
    }
}

// v0.85.1: plugin lama (file_picker 8.x = android-34) dipaksa compile ke SDK 36
// (flutter_plugin_android_lifecycle baru mewajibkan compileSdk >= 36)
subprojects {
    afterEvaluate {
        val android = extensions.findByName("android") ?: return@afterEvaluate
        try {
            android.javaClass.getMethod("compileSdkVersion", Int::class.javaPrimitiveType).invoke(android, 36)
        } catch (_: Exception) { }
    }
}

// v0.85.1: sembunyikan peringatan javac dari plugin pihak ketiga (source/target 8 obsolete, deprecated API)
subprojects {
    tasks.withType<JavaCompile>().configureEach {
        options.compilerArgs.addAll(listOf("-Xlint:-options", "-Xlint:-deprecation", "-XDsuppressNotes"))
    }
}

// harus PALING BAWAH di antara blok subprojects (blok afterEvaluate di atas wajib terdaftar lebih dulu)
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
