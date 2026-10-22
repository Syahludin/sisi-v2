# Uji app di SEMUA HP Android yang tersambung, selalu mulai dari data kosong (seperti baru install).
# Langkah: cari HP (adb) -> hapus data app SiSi ROW di tiap HP (pm clear: data, SQLite, sesi, izin) -> flutter run ke semua HP itu.
# Pakai (dari root repo):
#   powershell -ExecutionPolicy Bypass -File scripts\uji-hp.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\uji-hp.ps1 -Uninstall      # copot total (izin + cache ikut hilang)
#   powershell -ExecutionPolicy Bypass -File scripts\uji-hp.ps1 -Uninstall -CopotLama  # SEKALI saat pindah ke flavor + kunci rilis (v0.58.2)
# Flavor dipilih otomatis = Target kalau build.gradle.kts sudah punya productFlavors (v0.58.2).
# Hanya HP Android fisik/emulator dari adb. Windows/Chrome/Edge sengaja tidak ikut (SQLite, kamera, galeri tidak jalan).
param(
  [ValidateSet("staging", "production")][string]$Target = "staging",
  [string]$Flavor = "",
  [string]$Paket = "id.co.pln.toboali.sisi_new",
  [string]$PaketLama = "id.co.pln.toboali.sisi_row",   # app sebelum v0.58.3 (kunci debug), dicopot lewat -CopotLama
  [switch]$Uninstall,
  [switch]$TanpaReset,
  [switch]$CopotLama
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $root "mobile"
$envFile = "env/$Target.json"

# v0.64.2: MainActivity dengan kanal jam monoton (docs\android\MainActivity.kt) disalin ke folder android lokal.
function Pasang-MainActivity([string]$root, [string]$mobile) {
  $sumber = Join-Path $root "docs\android\MainActivity.kt"
  $tujuan = Join-Path $mobile "android\app\src\main\kotlin\id\co\pln\toboali\sisi_row\MainActivity.kt"
  if (-not (Test-Path (Join-Path $mobile "android"))) { Write-Warning "Folder mobile\android belum ada, MainActivity dilewati."; return }
  $lain = Get-ChildItem (Join-Path $mobile "android\app\src\main") -Recurse -Include MainActivity.kt, MainActivity.java -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -ne $tujuan }
  foreach ($f in $lain) { Write-Warning "MainActivity lain ditemukan: $($f.FullName). Hapus manual kalau paketnya sama." }
  $ada = (Test-Path $tujuan) -and ((Get-Content $tujuan -Raw) -eq (Get-Content $sumber -Raw))
  if (-not $ada) {
    New-Item -ItemType Directory -Force -Path (Split-Path $tujuan) | Out-Null
    Copy-Item $sumber $tujuan -Force
    Write-Host "MainActivity.kt (jam monoton) dipasang." -ForegroundColor Cyan
  }
}
# v1.0.12: izin + layanan sinkron latar (flutter_foreground_task) dipasang ke AndroidManifest.xml lokal (idempoten).
function Pasang-ManifestLatar([string]$mobile) {
  $man = Join-Path $mobile "android\app\src\main\AndroidManifest.xml"
  if (-not (Test-Path $man)) { Write-Warning "AndroidManifest.xml belum ada, sinkron latar dilewati."; return }
  $x = Get-Content $man -Raw
  $awal = $x
  $izin = @("FOREGROUND_SERVICE", "FOREGROUND_SERVICE_DATA_SYNC", "POST_NOTIFICATIONS", "WAKE_LOCK", "REQUEST_IGNORE_BATTERY_OPTIMIZATIONS", "REQUEST_INSTALL_PACKAGES")
  foreach ($i in $izin) {
    if ($x -notmatch ('android\.permission\.' + $i + '"')) {
      $x = $x -replace '(\s*)<application', ('$1<uses-permission android:name="android.permission.' + $i + '" />$1<application')
    }
  }
  if ($x -notmatch 'flutter_foreground_task\.service\.ForegroundService') {
    $svc = '        <service android:name="com.pravera.flutter_foreground_task.service.ForegroundService" android:foregroundServiceType="dataSync" android:exported="false" />' + "`r`n    </application>"
    $x = $x -replace '\s*</application>', ("`r`n" + $svc)
  }
  if ($x -ne $awal) {
    Set-Content -Path $man -Value $x -NoNewline -Encoding UTF8
    Write-Host "AndroidManifest.xml: izin + layanan sinkron latar dipasang." -ForegroundColor Cyan
  }
}
Pasang-ManifestLatar $mobile
Pasang-MainActivity $root $mobile
if (-not (Test-Path (Join-Path $mobile $envFile))) { throw "mobile/$envFile belum ada (salin dari $Target.example.json)" }
if ($Target -eq "production" -and -not $TanpaReset) { throw "Reset data di production dilarang. Pakai -TanpaReset kalau memang perlu." }
$gradleApp = Join-Path $mobile "android\app\build.gradle.kts"
$adaFlavor = (Test-Path $gradleApp) -and ((Get-Content $gradleApp -Raw) -match 'create\("production"\)')
if ($adaFlavor -and -not $Flavor) { $Flavor = $Target }
if ($Flavor -and $Flavor -ne $Target) { throw "Flavor $Flavor tidak boleh dipakai dengan env $Target (app staging harus ke server staging)." }
# adb dicari otomatis: PATH -> ANDROID_HOME / ANDROID_SDK_ROOT -> %LOCALAPPDATA%\Android\Sdk -> lokasi SDK dari flutter doctor.
function Cari-Adb {
  $c = Get-Command adb -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $sdk = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA "Android\Sdk")) | Where-Object { $_ }
  foreach ($d in $sdk) { $a = Join-Path $d "platform-tools\adb.exe"; if (Test-Path $a) { return $a } }
  Write-Host "Mencari Android SDK lewat flutter doctor..." -ForegroundColor DarkGray
  $doc = flutter doctor -v 2>$null | Select-String "Android SDK at (.+)$" | Select-Object -First 1
  if ($doc) { $a = Join-Path $doc.Matches[0].Groups[1].Value.Trim() "platform-tools\adb.exe"; if (Test-Path $a) { return $a } }
  return $null
}
$adbExe = Cari-Adb
if (-not $adbExe) { throw "adb tidak ditemukan. Pasang Android SDK Platform-Tools (Android Studio > SDK Manager > SDK Tools) lalu ulangi." }
Write-Host "adb: $adbExe" -ForegroundColor DarkGray
Set-Alias adb $adbExe -Scope Script

adb start-server | Out-Null
$baris = adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "\S" }
$hp = @(); $belum = @()
foreach ($b in $baris) {
  $p = $b -split "\s+"
  if ($p[1] -eq "device") { $hp += $p[0] } else { $belum += "$($p[0]) ($($p[1]))" }
}
if ($belum.Count) { Write-Warning ("HP belum siap: " + ($belum -join ", ") + ". Buka kunci HP lalu izinkan USB debugging (unauthorized = ketuk Izinkan di HP).") }
if (-not $hp.Count) { throw "Tidak ada HP Android tersambung." }

foreach ($id in $hp) {
  $model = (adb -s $id shell getprop ro.product.model).Trim()
  $android = (adb -s $id shell getprop ro.build.version.release).Trim()
  Write-Host "HP $id : $model (Android $android)" -ForegroundColor Cyan
  if ($CopotLama) {
    # App lama (paket sisi_row, kunci debug) dicopot sekali. Data + outbox di HP ikut hilang.
    $lama = adb -s $id shell pm list packages $PaketLama | ForEach-Object { ($_ -replace "^package:", "").Trim() } |
      Where-Object { $_ -eq $PaketLama -or $_ -eq "$PaketLama.staging" }
    foreach ($pk in $lama) { Write-Warning "  Copot app lama $pk (pastikan outbox sudah kosong)"; $h = adb -s $id uninstall $pk; Write-Host "  $pk -> dicopot: $h" }
  }
  if ($TanpaReset) { continue }
  $terpasang = adb -s $id shell pm list packages $Paket | ForEach-Object { ($_ -replace "^package:", "").Trim() } |
    Where-Object { $_ -eq $Paket -or $_ -eq "$Paket.staging" }
  # Production (paket tanpa .staging) hanya disentuh kalau flavor belum dipasang (paket dasar = build staging).
  if ($Flavor) { $terpasang = $terpasang | Where-Object { $_ -eq "$Paket.$Flavor" -or ($Flavor -eq "production" -and $_ -eq $Paket) } }
  if (-not $terpasang) { Write-Host "  app belum terpasang, langsung install bersih" ; continue }
  foreach ($pk in $terpasang) {
    if ($Uninstall) { $h = adb -s $id uninstall $pk } else { $h = adb -s $id shell pm clear $pk }
    Write-Host "  $pk -> $(if ($Uninstall) { 'dicopot' } else { 'data dihapus' }): $h"
  }
}

$args2 = @("run")
foreach ($id in $hp) { $args2 += @("-d", $id) }
if ($Flavor) { $args2 += @("--flavor", $Flavor) }
$args2 += "--dart-define-from-file=$envFile"
Write-Host "`nflutter $($args2 -join ' ')" -ForegroundColor Yellow
Push-Location $mobile
try { & flutter @args2 } finally { Pop-Location }
