# Verifikasi Tiang: Kelengkapan Wajib + Konfirmasi Induk (9 Nov 2026)

Permintaan Master Guswan. Lanjutan `2026-11-08-master-tiang-switching-design.md` (alur verifikasi berurutan di HP).

## Maksud

1. Tiang yang tampil hijau (Terverifikasi) di daftar HP harus berarti datanya sudah benar dan lengkap, bukan sekadar tombol simpan ditekan.
2. Induk tiang selama ini hanya "Induk Usulan" hasil migrasi ITB. Belum ada cara menyatakan induk itu benar, salah, atau menggantinya.

## Tujuan / bukan tujuan

- Tujuan: aturan simpan Terverifikasi di HP **dan** server; penentuan induk dengan peta dua titik; tiang lama yang sudah hijau tetapi kurang data terlihat.
- Bukan tujuan: gardu atau switching sebagai induk tiang. Tiang pertama sesudah gardu tetap memilih nomor tiang sebagai induk, tidak dibedakan (keputusan Master Guswan 9 Nov 2026); satu-satunya pembeda adalah Tiang Awal SKTM. Mengubah tiang lama otomatis.
- Gagal bila: tiang hijau padahal ada kolom wajib kosong, atau induk tersimpan tanpa pernah dikonfirmasi.

## Aturan Terverifikasi

Server menolak `TERVERIFIKASI` (`FIELD_WAJIB`, detail = daftar kekurangan) bila ada yang kosong; HP memeriksa dulu dengan aturan yang sama (`IsianTiang.kurang`, cermin `kurangLengkapTiang_`).

- Tiang: Jenis Tiang, Ukuran Tiang, Konstruksi, koordinat, 2 foto (Tiang Utuh, Kepala Tiang).
- Tiap sirkuit: Penyulang, Section, Segmen, Posisi, Peran Titik, Jenis Kabel, Ukuran mm².
- Induk tiap sirkuit: `induk_status` = `BENAR` atau `DIGANTI` dengan `induk_tiang_id` terisi, **atau** `TITIK_AWAL` tanpa induk dengan `induk_keterangan` terisi (bawaan "Tiang Awal SKTM").
- Switching: Switching Hulu dipilih, **atau** `switching_keterangan` terisi (bawaan "Tidak ada switching").
- `PERLU_PERBAIKAN` dan `TIDAK_DITEMUKAN` tetap boleh disimpan tanpa kelengkapan dan tidak hijau.
- Foto hanya diperiksa HP (foto dikirim sesudah simpan). Server memasukkan foto ke `kurang` pada baca (`getTiangJalur`), sehingga foto yang gagal terkirim tampak sebagai Perlu Dilengkapi.

## Induk

- Pilihan induk hanya tiang berstatus Terverifikasi (koordinatnya sudah pasti), diurut dari yang terdekat dengan jarak. Server ikut menolak induk yang belum terverifikasi saat menyimpan Terverifikasi (`DATA_TIDAK_VALID`).
- Form menampilkan peta kecil: titik tiang ini (merah), titik induk (biru), garis dan jarak; jarak di atas 250 m diberi peringatan (tidak melarang). Mengganti induk memindahkan peta.
- Konfirmasi: tombol **Induk Benar** (`BENAR`, induk usulan tetap) atau memilih induk lain (`DIGANTI` otomatis). Kembali ke induk usulan = belum dikonfirmasi lagi.
- **Tiang Awal SKTM**: pilihan sendiri; menghapus induk tiang; keterangan wajib.

## Daftar tiang di HP

Hijau = `statusVerifikasi` Terverifikasi dan `kurang` kosong. Terverifikasi dengan `kurang` terisi = kuning **Perlu Dilengkapi** (kasus tiang yang dihijaukan sebelum aturan ini; tidak diubah otomatis). Tiang berikutnya yang ditawarkan, filter Belum / Selesai, ikut aturan ini. Setelah foto terkirim, kekurangan fotonya gugur langsung di HP tanpa menunggu muat ulang.

## Sheet

`db_Tiang_Sirkuit` mendapat 3 kolom di belakang `diubah_oleh`: `induk_status`, `induk_keterangan`, `switching_keterangan`. `ADMIN_siapkanSheetTiang` menambahkannya ke tab lama (hanya jika header lama persis awalan skema; baris tidak disentuh), `ADMIN_cekSheetTiang` melaporkannya.

## Progres jalur (web dan HP)

Verifikasi hanya dari HP karena butuh foto lapangan; web hanya menampilkan. `getVerifikasiTiang` menghitung `terverifikasi` hanya untuk tiang Terverifikasi yang lengkap (termasuk 2 foto); yang kurang masuk `perluDilengkapi` dan tidak dihitung sebagai progres (web: kolom "Perlu Dilengkapi"; HP: angka di kartu jalur).

## Koordinat GPS

- Toleransi **10 m** antara koordinat yang diambil dan koordinat terdaftar (aset). Lewat dari itu admin wajib memilih dasar: **Koordinat Terdaftar** (koordinat aset dipakai, `sumber_koordinat` = aset) atau **Koordinat GPS** (`lapangan`). Server menolak (`FIELD_WAJIB` `dasarKoordinat`) bila dasar tidak dipilih; selisih tetap dilaporkan dari koordinat yang diambil. Tiang baru tanpa koordinat terdaftar tidak terkena aturan ini. Mengubah koordinat mengosongkan pilihan dasar.
- Pengambilan: mesin GPS bersama (fused + GPS mentah, aliran 1 detik, rata-rata berbobot, target ±5 m, maksimal 30 detik) sudah ada. Form tiang sekarang memanaskan GPS sejak dibuka (`Gps.mulaiHangat`, seperti form ROW dan Hartek), jadi satelit sudah terkunci saat tombol ditekan. Belum ada perubahan algoritma; hasilnya belum diukur di lapangan.

## Pilihan saya (bukan keputusan Master Guswan)

- Kolom baru di belakang kolom audit (bukan di tengah) agar tab lama cukup diperpanjang; tes konvensi "berakhir dengan kolom audit" dikecualikan untuk tab ini.
- Ambang peringatan jarak 250 m; keterangan bawaan terisi otomatis dan boleh diubah.
