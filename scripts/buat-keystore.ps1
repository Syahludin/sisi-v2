# Buat keystore RILIS Android SiSi (sekali seumur app). Dipakai staging DAN production.
# Hasil:
#   - file keystore (default %USERPROFILE%\.sisi\sisi-release.jks, DI LUAR repo)
#   - mobile/android/key.properties (path + password + sha256; diabaikan git, tidak ikut zip)
# Pakai (dari root repo):
#   powershell -ExecutionPolicy Bypass -File scripts\buat-keystore.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\buat-keystore.ps1 -Lokasi "D:\aman\sisi-release.jks"
# Keystore HILANG = app production tidak bisa di-update lagi. Backup .jks + password di 2 tempat aman.
param(
  [string]$Lokasi = (Join-Path $env:USERPROFILE ".sisi\sisi-release.jks"),
  [string]$Alias = "sisi"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$android = Join-Path $root "mobile\android"
$keyProps = Join-Path $android "key.properties"
if (-not (Test-Path $android)) { throw "Folder mobile\android belum ada (jalankan flutter create dulu, lihat mobile\README.md)." }
if (Test-Path $Lokasi) { throw "Keystore sudah ada di $Lokasi. TIDAK dibuat ulang (kunci lama = kunci app). Hapus manual hanya kalau yakin belum pernah dipakai rilis." }
if (Test-Path $keyProps) { throw "mobile\android\key.properties sudah ada. Keystore sudah pernah dipasang; tidak ditimpa." }
if ((Resolve-Path $root).Path -and ([IO.Path]::GetFullPath($Lokasi)).StartsWith((Resolve-Path $root).Path, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Keystore jangan di dalam folder repo ($root). Pilih lokasi lain dengan -Lokasi."
}

# keytool: PATH -> JAVA_HOME -> JBR Android Studio -> Java dari flutter doctor
function Cari-Keytool {
  $c = Get-Command keytool -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $calon = @()
  if ($env:JAVA_HOME) { $calon += (Join-Path $env:JAVA_HOME "bin\keytool.exe") }
  $calon += "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe", "C:\Program Files\Android\Android Studio\jre\bin\keytool.exe"
  foreach ($k in $calon) { if (Test-Path $k) { return $k } }
  $doc = flutter doctor -v 2>$null | Select-String "Java binary at: (.+)$" | Select-Object -First 1
  if ($doc) { $k = Join-Path (Split-Path -Parent $doc.Matches[0].Groups[1].Value.Trim()) "keytool.exe"; if (Test-Path $k) { return $k } }
  return $null
}
$keytool = Cari-Keytool
if (-not $keytool) { throw "keytool tidak ditemukan. Pasang Android Studio (JBR) atau set JAVA_HOME." }
Write-Host "keytool: $keytool" -ForegroundColor DarkGray

function Baca-Rahasia([string]$label) {
  $s = Read-Host $label -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
$pw = Baca-Rahasia "Password keystore (min 12 karakter, simpan di pengelola password)"
if ($pw.Length -lt 12) { throw "Password minimal 12 karakter." }
if ($pw -match '[\\\r\n]' -or $pw -cmatch '[^\x20-\x7E]') { throw "Password hanya huruf/angka/simbol ASCII, tanpa backslash (aturan key.properties)." }
$pw2 = Baca-Rahasia "Ulangi password"
if ($pw -ne $pw2) { throw "Password tidak sama." }

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Lokasi) | Out-Null
$env:SISI_KS_PW = $pw   # dikirim lewat env, bukan argumen (tidak tampil di daftar proses)
try {
  # PKCS12: password kunci = password keystore. RSA 4096, berlaku 10000 hari (~27 tahun).
  & $keytool -genkeypair -noprompt -keystore $Lokasi -storetype PKCS12 -alias $Alias -keyalg RSA -keysize 4096 -validity 10000 `
    -dname "CN=SiSi ULP Toboali, OU=ULP Toboali, O=PT PLN (Persero), L=Toboali, ST=Bangka Belitung, C=ID" `
    -storepass:env SISI_KS_PW -keypass:env SISI_KS_PW
  if ($LASTEXITCODE -ne 0) { throw "keytool gagal (kode $LASTEXITCODE)." }
  $daftar = & $keytool -list -v -keystore $Lokasi -alias $Alias -storepass:env SISI_KS_PW
  $sha = ($daftar | Select-String "SHA256:\s*(.+)$" | Select-Object -First 1).Matches[0].Groups[1].Value.Trim()
} finally { Remove-Item Env:SISI_KS_PW -ErrorAction SilentlyContinue }

# key.properties: path pakai / (backslash = escape di format properties)
$isi = @(
  "storeFile=$($Lokasi -replace '\\','/')",
  "storePassword=$pw",
  "keyAlias=$Alias",
  "keyPassword=$pw",
  "sha256=$sha"
)
Set-Content -Path $keyProps -Value $isi -Encoding ASCII
$pw = $null; $pw2 = $null

Write-Host "`nKeystore dibuat: $Lokasi" -ForegroundColor Green
Write-Host "key.properties : $keyProps" -ForegroundColor Green
Write-Host "SHA-256 sertifikat: $sha" -ForegroundColor Cyan
Write-Host "`nWAJIB SEKARANG:" -ForegroundColor Yellow
Write-Host " 1. Backup $Lokasi + password ke 2 tempat aman (mis. flashdisk + folder Drive pribadi). JANGAN ke git / zip / Shared Drive tim."
Write-Host " 2. Catat SHA-256 di atas (tidak rahasia) di PRD 10. Riwayat Perubahan, untuk cek APK asli."
Write-Host " 3. Pasang blok signingConfigs di mobile\android\app\build.gradle.kts (mobile\README.md bagian Keystore rilis)."
Write-Host " 4. Copot sekali app lama yang bertanda tangan debug (outbox harus kosong dulu): scripts\uji-hp.ps1 -Uninstall"
