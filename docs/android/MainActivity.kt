// v0.64.2 (jam terpercaya Yandal): kanal "sisi/jam" -> jam monoton Android (elapsedRealtime, tidak bisa diubah
// petugas, ikut berjalan saat layar mati), nomor boot (deteksi HP restart), dan setelan "Tanggal & waktu otomatis".
// Disalin otomatis oleh scripts\build-rilis.ps1 dan scripts\uji-hp.ps1 ke
// mobile\android\app\src\main\kotlin\id\co\pln\toboali\sisi_row\MainActivity.kt
package id.co.pln.toboali.sisi_row

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// v1.0.29: kanal notifikasi push (channel_id dari server, 57_Notifikasi.js KANAL_NOTIF_). Bisa dimatikan sendiri-sendiri
// di Pengaturan Android > Aplikasi > SiSi > Notifikasi. Kanal belum ada (app belum pernah dibuka) = kanal bawaan FCM.
class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buatKanalNotifikasi()
    }

    private fun buatKanalNotifikasi() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannels(listOf(
            NotificationChannel("sisi_pengingat", "Pengingat login Yandal", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Shift sudah mulai tetapi tim belum login (HP tim Yandal dan admin)"
            },
            NotificationChannel("sisi_wo", "WO tindak lanjut", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "WO temuan baru yang dikirim admin ke tim"
            },
            NotificationChannel("sisi_ringkasan", "Ringkasan admin", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Ringkasan temuan inspeksi dan P0 masuk, tanpa bunyi"
            },
        ))
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "sisi/jam").setMethodCallHandler { call, result ->
            when (call.method) {
                "monoton" -> {
                    val boot = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        try { Settings.Global.getInt(contentResolver, Settings.Global.BOOT_COUNT) } catch (e: Exception) { -1 }
                    } else -1
                    val otomatis = try { Settings.Global.getInt(contentResolver, Settings.Global.AUTO_TIME) == 1 } catch (e: Exception) { null }
                    result.success(mapOf("elapsedMs" to SystemClock.elapsedRealtime(), "bootCount" to boot, "waktuOtomatis" to otomatis))
                }
                else -> result.notImplemented()
            }
        }
    }
}
