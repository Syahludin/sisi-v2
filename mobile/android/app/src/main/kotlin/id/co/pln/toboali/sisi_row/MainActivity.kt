// v0.64.2 (jam terpercaya Yandal): kanal "sisi/jam" -> jam monoton Android (elapsedRealtime, tidak bisa diubah
// petugas, ikut berjalan saat layar mati), nomor boot (deteksi HP restart), dan setelan "Tanggal & waktu otomatis".
// Disalin otomatis oleh scripts\build-rilis.ps1 dan scripts\uji-hp.ps1 ke
// mobile\android\app\src\main\kotlin\id\co\pln\toboali\sisi_row\MainActivity.kt
package id.co.pln.toboali.sisi_row

import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
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
