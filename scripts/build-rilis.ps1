# Build APK RILIS bertanda tangan keystore SiSi, lalu cek tanda tangannya (fail closed).
# Pakai (dari root repo):
#   powershell -ExecutionPolicy Bypass -File scripts\build-rilis.ps1                    # staging
#   powershell -ExecutionPolicy Bypass -File scripts\build-rilis.ps1 -Target production
#   powershell -ExecutionPolicy Bypass -File scripts\build-rilis.ps1 -Pasang            # + adb install -r ke semua HP
# Production WAJIB pakai flavor (paket beda dengan staging); staging boleh tanpa flavor.
param(
  [ValidateSet("staging", "production")][string]$Target = "staging",
  [switch]$Pasang
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $root "mobile"
$keyProps = Join-Path $mobile "android\key.properties"
$gradle = Join-Path $mobile "android\app\build.gradle.kts"
$envFile = "env/$Target.json"
if (-not (Test-Path $keyProps)) { throw "mobile\android\key.properties belum ada. Jalankan scripts\buat-keystore.ps1 dulu." }
if (-not (Test-Path (Join-Path $mobile $envFile))) { throw "mobile/$envFile belum ada (salin dari $Target.example.json)." }
$g = Get-Content $gradle -Raw
if ($g -notmatch 'signingConfigs\.getByName\("release"\)') { throw "build.gradle.kts belum memakai signingConfig release (mobile\README.md bagian Keystore rilis)." }
$adaFlavor = $g -match 'create\("production"\)'
if ($Target -eq "production" -and -not $adaFlavor) { throw "Flavor belum dipasang: APK production akan sepaket dengan staging. Pasang flavor dulu (mobile\README.md bagian Flavor Android)." }

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
