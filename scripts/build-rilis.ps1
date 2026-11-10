# Build APK RILIS bertanda tangan keystore SiSi, lalu cek tanda tangannya (fail closed).
# Pakai (dari root repo):
#   powershell -ExecutionPolicy Bypass -File scripts\build-rilis.ps1                    # staging
#   powershell -ExecutionPolicy Bypass -File scripts\build-rilis.ps1 -Target production
#   powershell -ExecutionPolicy Bypass -File scripts\build-rilis.ps1 -Target ulpmentok    # v1.0.50 APK ULP Mentok
#   powershell -ExecutionPolicy Bypass -File scripts\build-rilis.ps1 -Pasang            # + adb install -r ke semua HP
# Production WAJIB pakai flavor (paket beda dengan staging); staging boleh tanpa flavor.
param(
  [ValidateSet("staging", "production", "ulpmentok")][string]$Target = "staging",
  [switch]$Pasang
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $root "mobile"
$keyProps = Join-Path $mobile "android\key.properties"
$gradle = Join-Path $mobile "android\app\build.gradle.kts"
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
# v1.0.29: notifikasi push FCM (pengingat login Yandal). Plugin google-services dipasang ke gradle lokal (idempoten) dan
# hanya aktif kalau android\app\google-services.json ada. Tanpa file itu APK tetap jadi, tetapi notifikasi MATI.
function Pasang-Firebase([string]$mobile) {
  $set = Join-Path $mobile "android\settings.gradle.kts"
  $app = Join-Path $mobile "android\app\build.gradle.kts"
  if (-not (Test-Path $set) -or -not (Test-Path $app)) { Write-Warning "Gradle Android belum ada, Firebase dilewati."; return }
  $x = Get-Content $set -Raw
  if ($x -notmatch 'com\.google\.gms\.google-services') {
    $x = $x -replace '(id\("com\.android\.application"\) version "[^"]+" apply false)', ('$1' + "`r`n" + '    id("com.google.gms.google-services") version "4.4.4" apply false')
    Set-Content -Path $set -Value $x -NoNewline -Encoding UTF8
    Write-Host "settings.gradle.kts: plugin google-services didaftarkan." -ForegroundColor Cyan
  }
  $y = Get-Content $app -Raw
  if ($y -notmatch 'apply\(plugin = "com\.google\.gms\.google-services"\)') {
    $baris = "`r`n// v0.83.0 / v1.0.29: notifikasi FCM, aktif hanya kalau android/app/google-services.json ada.`r`n" +
      'if (file("google-services.json").exists()) apply(plugin = "com.google.gms.google-services")' + "`r`n"
    $re = [regex]'(?s)^(.*?\nplugins \{.*?\n\})'
    if (-not $re.IsMatch($y)) { Write-Warning "Blok plugins di build.gradle.kts tidak ditemukan, Firebase dilewati."; return }
    $y = $re.Replace($y, { param($m) $m.Groups[1].Value + $baris }, 1)
    Set-Content -Path $app -Value $y -NoNewline -Encoding UTF8
    Write-Host "build.gradle.kts: plugin google-services (bersyarat) dipasang." -ForegroundColor Cyan
  }
  if (-not (Test-Path (Join-Path $mobile "android\app\google-services.json"))) {
    Write-Warning "android\app\google-services.json TIDAK ADA: notifikasi push (pengingat login Yandal) MATI di APK ini. Lihat mobile\README.md bagian FCM."
  }
}
Pasang-ManifestLatar $mobile
Pasang-MainActivity $root $mobile
Pasang-Firebase $mobile
if (-not (Test-Path $keyProps)) { throw "mobile\android\key.properties belum ada. Jalankan scripts\buat-keystore.ps1 dulu." }
if (-not (Test-Path (Join-Path $mobile $envFile))) { throw "mobile/$envFile belum ada (salin dari $Target.example.json)." }
$g = Get-Content $gradle -Raw
if ($g -notmatch 'signingConfigs\.getByName\("release"\)') { throw "build.gradle.kts belum memakai signingConfig release (mobile\README.md bagian Keystore rilis)." }
$adaFlavor = $g -match 'create\("production"\)'
if ($Target -ne "staging" -and -not ($g -match "create\(`"$Target`"\)")) { throw "Flavor belum dipasang: APK production akan sepaket dengan staging. Pasang flavor dulu (mobile\README.md bagian Flavor Android)." }

$props = @{}
Get-Content $keyProps | Where-Object { $_ -match '^\s*([^#=]+?)\s*=(.*)$' } | ForEach-Object { $props[$Matches[1]] = $Matches[2] }
$shaHarus = ($props["sha256"] -replace '[:\s]', '').ToUpper()
if (-not (Test-Path ($props["storeFile"] -replace '/', '\'))) { throw "File keystore tidak ditemukan: $($props['storeFile']). Pulihkan dari backup." }

$args2 = @("build", "apk", "--release", "--dart-define-from-file=$envFile")
if ($adaFlavor) { $args2 += @("--flavor", $Target) }
Write-Host "flutter $($args2 -join ' ')" -ForegroundColor Yellow
Push-Location $mobile
try { & flutter @args2; if ($LASTEXITCODE -ne 0) { throw "flutter build gagal." } } finally { Pop-Location }
$apk = Join-Path $mobile ("build\app\outputs\flutter-apk\" + $(if ($adaFlavor) { "app-$Target-release.apk" } else { "app-release.apk" }))
if (-not (Test-Path $apk)) { throw "APK tidak ditemukan: $apk" }

# apksigner dari build-tools terbaru
$sdk = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA "Android\Sdk")) | Where-Object { $_ -and (Test-Path (Join-Path $_ "build-tools")) } | Select-Object -First 1
if (-not $sdk) { throw "Android SDK tidak ditemukan (set ANDROID_HOME)." }
$signer = Get-ChildItem (Join-Path $sdk "build-tools") -Directory | Sort-Object { [version]($_.Name -replace '[^0-9.].*$', '') } -Descending |
  ForEach-Object { Join-Path $_.FullName "apksigner.bat" } | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $signer) { throw "apksigner tidak ditemukan di build-tools." }
$cert = & $signer verify --print-certs $apk
if ($LASTEXITCODE -ne 0) { throw "APK tidak lolos verifikasi tanda tangan." }
if ($cert -match "CN=Android Debug") { Remove-Item $apk; throw "APK ditandatangani kunci DEBUG. Dihapus. Cek signingConfigs release di build.gradle.kts." }
$sha = (($cert | Select-String "certificate SHA-256 digest:\s*(\S+)" | Select-Object -First 1).Matches[0].Groups[1].Value).ToUpper()
if ($shaHarus -and $sha -ne $shaHarus) { Remove-Item $apk; throw "SHA-256 APK ($sha) beda dengan keystore SiSi ($shaHarus). APK dihapus." }
Write-Host "`nAPK rilis OK: $apk" -ForegroundColor Green
Write-Host "Tanda tangan SiSi SHA-256: $sha" -ForegroundColor Cyan

if ($Pasang) {
  $adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
  if (-not $adb) { $adb = Join-Path $sdk "platform-tools\adb.exe" }
  $hp = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "\tdevice$" } | ForEach-Object { ($_ -split "\s+")[0] }
  foreach ($id in $hp) {
    Write-Host "Pasang ke $id ..." -ForegroundColor Cyan
    & $adb -s $id install -r $apk
    if ($LASTEXITCODE -ne 0) { Write-Warning "$id gagal. INSTALL_FAILED_UPDATE_INCOMPATIBLE = app lama bertanda tangan debug: kosongkan outbox, copot sekali, lalu pasang lagi." }
  }
}
