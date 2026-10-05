# Uji ROW di STAGING: login -> getMaster -> getKodeRow -> kirim header+realisasi+eksekusi -> kirim ulang (harus DUPLIKAT)
# -> upload 3 foto (harus foto lengkap) + kirim ulang 1 foto (DUPLIKAT) -> getLaporanRow (WA) -> batal semua -> getKodeRow lagi (nomor berikutnya harus naik). Boleh dijalankan berulang di hari yang sama.
# Pakai: powershell -ExecutionPolicy Bypass -File scripts\uji-sync.ps1 -Url "<URL /exec staging>"
param(
  [Parameter(Mandatory = $true)][string]$Url,
  [string]$Username = "16130.uji.row01"
)
$ErrorActionPreference = "Stop"
function Panggil($action, $data, $token) {
  $body = @{ action = $action; data = $data }
  if ($token) { $body.token = $token }
  $json = $body | ConvertTo-Json -Depth 10 -Compress
  $t = Measure-Command { $script:r = Invoke-RestMethod -Uri $Url -Method Post -ContentType "application/json" -Body $json }
  if (-not $script:r.ok) { throw "$action gagal: $($script:r.kode)" }
  if ($script:r.env -ne "staging") { throw "Bukan staging! env=$($script:r.env)" }
  Write-Host ("{0}: {1:N0} ms" -f $action, $t.TotalMilliseconds)
  return $script:r.data
}
$pw = Read-Host "Password $Username" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw))
$login = Panggil "login" @{ username = $Username; password = $plain; perangkat = "Uji sync laptop"; installId = [guid]::NewGuid().ToString() } $null
$token = $login.token
$m = (Panggil "getMaster" @{} $token).isi
$sec = $m.jaringan | Where-Object { $_.aktif } | Select-Object -First 1
$sedang = $m.jenisPekerjaan | Where-Object { $_.modul -eq "ROW" -and $_.diameterMin -eq 25 } | Select-Object -First 1
if (-not $sec -or -not $sedang) { throw "Master belum lengkap (db_Jaringan / db_Jenis_Pekerjaan)" }

$k = Panggil "getKodeRow" @{} $token
$Urut = $k.headerBerikutnya
Write-Host "getKodeRow: tanggal $($k.tanggal), header berikutnya $Urut, rincian $($k._waktu | ConvertTo-Json -Compress)"
$tgl = $k.tanggal
$kodeH = "R{0}-16130{1}{2:000}" -f $login.profil.timKode, $tgl.Substring(2).Replace("-", ""), $Urut
$hId = [guid]::NewGuid().ToString(); $rId = [guid]::NewGuid().ToString(); $eId = [guid]::NewGuid().ToString()
$now = (Get-Date).ToUniversalTime().ToString("o")
function Op($jenis, $aksi, $id, $kode, $isi, $rev) {
  $o = @{ opId = [guid]::NewGuid().ToString(); jenis = $jenis; aksi = $aksi; id = $id; waktuPerangkat = $now; isi = $isi }
  if ($kode) { $o.kode = $kode }
  if ($null -ne $rev) { $o.revision = $rev }
  return $o
}
$batch = @(
  (Op "header" "buat" $hId $kodeH @{ tanggal = $tgl; kendala = "uji sync v0.17"; koordinatAwal = "-3.0100, 106.5100"; koordinatAkhir = "-3.0200, 106.5200"; kmAwal = 10; kmAkhir = 12 } $null),
  (Op "realisasi" "buat" $rId "$kodeH-PNY.001" @{ headerId = $hId; penyulang = $sec.penyulang } $null),
  (Op "eksekusi" "buat" $eId "$kodeH-PNY.001-EKS.001" @{ realisasiId = $rId; sectionId = $sec.id; nomorTiang = "UJI-001";
      koordinatPekerjaan = "-3.0, 106.5"; diameter = 30; jenisId = $sedang.id } $null)
)
$a = Panggil "syncRow" @{ operasi = $batch } $token
Write-Host "Kirim 1   :" (($a.hasil | ForEach-Object { $_.status + $(if ($_.alasan) { "(" + $_.alasan + ")" } else { "" }) }) -join ", ")
Write-Host "Rincian   :" ($a._waktu | ConvertTo-Json -Compress)
foreach ($o in $batch) { $o.opId = [guid]::NewGuid().ToString() }
$b = Panggil "syncRow" @{ operasi = $batch } $token
Write-Host "Kirim ulang:" (($b.hasil | ForEach-Object { $_.status }) -join ", ") "(harus DUPLIKAT semua)"
Add-Type -AssemblyName System.Drawing
function FotoUji($teks) {
  $bmp = New-Object System.Drawing.Bitmap 800, 600
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::DarkGreen)
  $font = New-Object System.Drawing.Font "Arial", 32
  $g.DrawString($teks, $font, [System.Drawing.Brushes]::White, 40, 260)
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $g.Dispose(); $bmp.Dispose()
  return , $ms.ToArray()
}
function DataFoto($slot, $fotoId) {
  $bytes = FotoUji "UJI $slot $kodeH"
  $hex = ([System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join ""
  return @{ fotoId = $fotoId; eksekusiId = $eId; slot = $slot; sumberFoto = "GALERI"; mime = "image/jpeg"
            sha256 = $hex; ukuranByte = $bytes.Length; data = [Convert]::ToBase64String($bytes) }
}
$fotoPertama = $null
foreach ($slot in @("SEBELUM", "PEKERJAAN", "SESUDAH")) {
  $df = DataFoto $slot ([guid]::NewGuid().ToString())
  if (-not $fotoPertama) { $fotoPertama = $df }
  $f = Panggil "uploadFotoRow" $df $token
  Write-Host ("Foto {0,-9}: {1}, fotoLengkap={2}, rincian {3}" -f $slot, $f.status, $f.fotoLengkap, ($f._waktu | ConvertTo-Json -Compress))
}
$fu = Panggil "uploadFotoRow" $fotoPertama $token
Write-Host "Foto ulang : $($fu.status) (harus DUPLIKAT, tanpa file kembar di Drive)"
$lap = Panggil "getLaporanRow" @{} $token
$saya = $lap.laporan | Where-Object { $_.kodeHeader -eq $kodeH }
Write-Host "Laporan    : siapKirim=$($saya.siapKirim), total $($saya.total | ConvertTo-Json -Compress), bulanan $($saya.bulanan | ConvertTo-Json -Compress), peringatan [$($saya.peringatan -join ',')]"
Write-Host "----- WA Text -----"
Write-Host $saya.waText
Write-Host "-------------------"
$c = Panggil "syncRow" @{ operasi = @((Op "header" "batal" $hId $null @{} 1), (Op "realisasi" "batal" $rId $null @{} 1), (Op "eksekusi" "batal" $eId $null @{} 1)) } $token
Write-Host "Batal     :" (($c.hasil | ForEach-Object { $_.status }) -join ", ") "(header dikirim duluan tapi diproses terakhir)"
$k2 = Panggil "getKodeRow" @{} $token
Write-Host "getKodeRow lagi: header berikutnya $($k2.headerBerikutnya) (harus $($Urut + 1), nomor BATAL tidak dipakai ulang)"
Panggil "logout" @{} $token | Out-Null
