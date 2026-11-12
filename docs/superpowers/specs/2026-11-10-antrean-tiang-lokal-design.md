# Antrean lokal verifikasi tiang + sinkronTiang (10 Nov 2026)

## Latar belakang
Di lapangan satu simpan tiang bisa menunggu ±5 menit. Penyebab (dari pembacaan kode, belum diukur): `simpanVerifikasiTiang_` membaca
penuh `db_Tiang` (±15.000 baris), `db_Tiang_Sirkuit`, `db_Segmen`, `db_Switching`, konstruksi, jaringan, lalu `tulisBlok_`
membaca lagi blok dari baris yang diubah sampai baris terakhir; foto dikirim lewat panggilan terpisah yang mengulang bacaan
`db_Tiang`; semuanya antre di satu kunci skrip. HP sekarang menyimpan "di latar" (`simpanLatar`) tapi satu tiang sekali jalan,
tampilan menunggu jawaban server, dan layar jalur baru berubah sesudah server menjawab.

## Tujuan
- Simpan = langsung selesai di HP (tampilan dan data lokal berubah seketika); petugas lanjut ke tiang berikutnya tanpa menunggu.
- Perubahan masuk antrean lokal berurutan, dikirim otomatis di latar (app dibuka, tiap 5 menit, sinyal pulih, setelah simpan).
- Server menerima banyak perubahan dalam SATU panggilan dan memprosesnya dengan membaca tabel sekali dan menulis sekali.
- Tetap benar saat sinyal putus: kirim ulang tidak menggandakan tiang.

## Bukan tujuan
- Pindah server (Hostinger): ditunda, diputuskan setelah waktu simpan diukur ulang.
- Mengubah aturan validasi verifikasi. Aturan yang sama dipakai ulang.
- Perbaikan `tulisBlok_` yang membaca sampai akhir sheet: tidak diubah sekarang (batch sudah memangkasnya jadi sekali per tabel).

## Anti-tujuan
Tiang tampak "tersimpan" di HP tetapi hilang diam-diam; tiang ganda karena kirim ulang; foto terkirim sebelum datanya.

## Rancangan HP
- Kelas baru `AntreanTiang` (mengikuti pola `AntreanTemuanAdmin`): antrean per akun disimpan di `master_cache` kunci
  `antre_tiang_<userId>`, dibaca/ditulis lewat rantai berurutan, didaftarkan di `SyncController` seperti antrean lain.
- Entri: `{opId (uuid, dibuat sekali), jenis: SEGMEN | TIANG | FOTO, data, tiangId (asli atau LOKAL-<uuid>), foto:{slot:path}, status: MENUNGGU | GALAT, galat}`.
- Simpan di form: tulis ke antrean, perbarui berkas jalur lokal (tiang diberi tanda `menunggu`), tutup form. Tidak ada snackbar
  "Menyimpan data…" yang menunggu server; ganti dengan penanda kecil "menunggu kirim" di baris tiang dan hitungan di
  `belumTerkirim`.
- Penggabungan: satu entri TIANG per tiang. Ubah ulang tiang yang masih menunggu = ganti isi entri (keadaan terakhir saja).
  `revision` TIDAK disimpan di entri; diisi saat kirim dari salinan lokal terbaru (diperbarui tiap balasan server).
- Tiang baru dari lapangan memakai id sementara `LOKAL-<uuid>`. Balasan server memuat pemetaan id sementara -> `BARU-nnnn`;
  HP menggantinya di antrean (induk tiang anak, foto), di berkas jalur, dan di entri lain.
- Urutan kirim: (1) SEGMEN, (2) TIANG diurut agar induk yang juga ada di antrean mendahului anaknya (urut topologis; induk di
  luar antrean sudah di server), (3) FOTO tiang yang datanya sudah diterima. Foto tetap panggilan terpisah (base64 besar).
- Penanganan tolakan: entri ditandai GALAT dengan alasan (pesan dari `KodeError`), tidak diulang otomatis; entri lain yang
  tidak bergantung tetap jalan; anak dari induk bergalat ikut menunggu. Petugas memilih Kirim ulang / Buang / Ubah di daftar
  jalur (pola sama dengan kartu temuan admin). Gagal jaringan/timeout = tetap MENUNGGU, coba lagi pada siklus berikut.
- Segmen (diputuskan 10 Nov 2026, setelah rancangan awal): layar Segmen juga memakai antrean. HP menyimpan salinan getSegmen dan pilihan segmen form tiang; segmen yang menunggu kirim tampil di keduanya (label "Menunggu kirim", "Ditolak" bila ditolak) dan bisa dipilih di form tiang. Segmen dikirim sebelum tiang yang memakainya; tiang menunggu (bukan bergalat) bila segmennya ditolak.

## Rancangan backend
- Aksi baru `sinkronTiang { ops: [{opId, jenis: SEGMEN|TIANG, data}] }` (maks 25 entri per panggilan dan batas waktu ±4 menit;
  sisa tidak diproses dan dilaporkan `DITUNDA`). Balasan `{hasil: [{opId, ok, tiang|segmen|galat:{kode,info}}], idBaru: {LOKAL-..: BARU-..}}`.
- Satu `denganLock_` untuk seluruh kelompok; `db_Tiang`, `db_Tiang_Sirkuit`, `db_Segmen`, jaringan, switching dibaca SEKALI ke
  struktur memori; entri diproses berurutan terhadap keadaan memori (entri berikutnya melihat hasil entri sebelumnya, mis. induk
  yang baru terverifikasi); entri yang gagal validasi tidak mengubah apa pun; hasil entri yang berhasil ditulis sekali per tabel
  (`tulisBlok_`) dan audit di-batch.
- Logika inti `simpanVerifikasiTiang_` / `simpanSegmen_` diekstrak jadi fungsi murni terhadap konteks (tabel di memori) yang
  dipakai bersama oleh aksi lama dan `sinkronTiang`, jadi aturan validasi hanya satu versi. Aksi lama tetap ada (APK lama).
- Idempotensi: `opId` dicatat (CacheService, 6 jam) dengan hasilnya; kirim ulang `opId` yang sama mengembalikan hasil yang sama
  tanpa menulis lagi. Ini keputusan saya (cukup untuk sinyal putus di lapangan; tidak menambah kolom sheet).
- Versi: backend dan app 1.0.71. Tambahan murni (aksi baru), `VERSI_APP_MINIMUM` tetap 1.0.69; APK lama tetap bekerja lewat aksi lama.

## Asumsi (keputusan saya, belum dikonfirmasi)
- Selama verifikasi, satu tiang diubah dari satu perangkat saja. Bentrok `revision` tetap dideteksi server dan menjadi GALAT
  (tidak menimpa diam-diam), tapi tidak ada UI penggabungan.
- Foto dikirim setelah datanya; foto yang gagal tetap di HP dan dicoba lagi.

## Pengujian
- Backend (`node --test`): batch urut dengan induk di dalam kelompok; entri gagal tidak merusak entri lain; id sementara
  dipetakan; opId diulang tidak menggandakan; satu pembacaan tabel per kelompok; batas 25 dan waktu.
- HP (`flutter test`): penggabungan entri, urutan topologis, penggantian id sementara, status GALAT vs menunggu.
- Uji lapangan oleh Master Guswan: simpan 10 tiang berturut-turut, matikan sinyal di tengah, hidupkan lagi.

## Dibiarkan ke pembangun
Nama berkas/kelas, bentuk penanda UI, batas waktu persis, cara pengurutan topologis.
