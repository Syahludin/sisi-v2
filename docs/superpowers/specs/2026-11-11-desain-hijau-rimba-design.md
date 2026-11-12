# Desain "Hijau Rimba": rombak tampilan web admin dan HP SiSi

Tanggal: 11 Nov 2026. Pemilik: Master Guswan. Status: menunggu persetujuan.

## 1. Maksud

Tampilan SiSi (web admin 21 halaman, HP 71 layar) dirombak supaya: (a) satu wajah di web dan HP, (b) mudah dipahami petugas yang membukanya sebentar di lapangan, (c) terasa PLN: jaringan SUTM, trafo, pohon, dan logo SiSi (navy + petir kuning). Warna utama hijau tua rimba (Opsi B pada mockup 11 Nov, dipilih Master Guswan).

Mengapa sekarang: web memakai hijau-teal redup, HP memakai biru-cyan, keduanya tidak cocok dengan logo; petugas lapangan mengeluh halaman verifikasi tiang membingungkan (data tertolak tanpa tanda, pilihan tereset), dan sebagian itu soal tampilan status yang tidak jelas.

## 2. Tujuan, bukan tujuan, anti-tujuan

Tujuan
- Satu palet, satu motif, satu set komponen untuk web dan HP; nama token lama (`--brand-*`, `AppColors.brand*`) tetap dipakai supaya 21 halaman dan 119 berkas Dart berubah sekaligus tanpa menyentuh logika.
- Setiap halaman web ditata ulang mengikuti satu dari empat pola tata letak (§6), bukan sekadar ganti warna.
- Status pekerjaan (terverifikasi, draf, ditolak, bertegangan, padam) terbaca dari warna + ikon + teks, tidak dari warna saja.
- Mode gelap web tetap ada dan ikut palet baru.

Bukan tujuan
- Mengubah alur kerja, endpoint, atau data. Yang berubah hanya tampilan dan susunan.
- Menambah pustaka UI (web tetap React tanpa router/komponen pihak ketiga; HP tetap Material 3 tanpa paket tema).
- Mode gelap HP pada tahap ini (lihat §8, keputusan saya; bisa dinaikkan Master Guswan).

Anti-tujuan (gagal walau selesai)
- Halaman jadi "cantik" tapi tombol utama lebih sulit ditemukan dari sekarang.
- Kontras teks di bawah WCAG AA (4,5:1) di mode terang atau gelap.
- Ukuran bundle web naik > 10 % atau APK naik > 1 MB karena aset motif.

## 3. Batasan

- Web: Vite + React, rute tanpa pustaka (`rute.js`), tema terang/gelap lewat `<html data-tema>` (`tema.js`), CSS token di `web/src/styles/tokens.css`, komponen bersama `komponen.css` (kelas `k-*`), 14 CSS per halaman (~190 KB total). Dideploy sebagai zip ke Hostinger (`sisi`, `sisi-web-staging`).
- HP: Flutter, `AppColors` konstanta (119 berkas memakainya langsung, ±2.500 rujukan), `AppTheme.light` saja. Harus tetap ringan dan offline.
- Logo: `logo-sisi.png` (navy `#0e1f4d` + petir `#ffd21e`), `logo-pln.png`. Tidak diubah.
- Teks antarmuka bahasa Indonesia, tanpa istilah Inggris di layar.
- Tes yang ada (`vitest` web, `flutter test`) harus tetap lulus; perubahan hanya kosmetik, tes yang memeriksa teks tombol tetap berlaku.

## 4. Palet (keputusan)

Nama token tetap. Nilai baru, dipakai persis sama di web (`tokens.css`) dan HP (`app_colors.dart`).

Terang
| Token | Nilai | Pakai |
|---|---|---|
| brand-950 | `#0d2a1d` | teks judul, bilah paling gelap |
| brand-900 | `#153f2c` | bilah atas, header halaman |
| brand-800 | `#1a5238` | hover bilah, garis diagram |
| brand-700 | `#1f6b45` | tombol utama, tautan, ikon aktif |
| brand-600 | `#28804f` | hover tombol |
| brand-500 | `#3c9a60` | fokus, garis progres |
| brand-100 | `#d6e9da` | latar chip, baris terpilih |
| brand-50 | `#eef5ef` | latar halaman |
| accent-700 | `#8a6d00` | teks di atas accent-100 |
| accent-600 | `#ffd21e` | petir: bertegangan, aktif, perhatian |
| accent-400 | `#ffe15e` | hover accent |
| accent-100 | `#fff6c8` | chip "Draf, belum terkirim", peringatan |
| neutral-950…50 | `#121c17 #1b2822 #3d4f46 #5c6f65 #8a9a91 #b3c1b9 #ccd7d0 #dbe4de #e7eee9 #f1f5f2` | teks & garis, nada kehijauan |
| surface / putih | `#f7faf8` / `#ffffff` | kartu |
| red-700/600/100 | `#a63a3a #c04a4a #fae4e4` | tolak, bahaya, perlu perbaikan |
| success-700/600/100 | `#1f6b45 #28804f #dff0e4` | sama dengan brand: "sehat" = "SiSi"; chip sukses selalu berikon centang |

Gelap (`[data-tema="gelap"]`): latar `#0f1a14`, kartu `#16231c`, bilah `#0d2a1d`, teks `#e6efe9`, brand-700 → `#3c9a60`, brand-100 → `#1e3a2a`, accent tetap `#ffd21e`, red-100 → `#3a1d1d`, accent-100 → `#3a3016`. Skala netral dibalik seperti sekarang.

Aturan pakai
- Kuning petir hanya untuk: menu aktif di diagram, status bertegangan/aktif, tanda perhatian (draf belum terkirim, cadangan tua). Tidak untuk dekorasi.
- Merah hanya untuk tolak/bahaya/hapus.
- Logo selalu di lingkaran putih (`#fff`) 2 px lebih besar dari logo, di atas bilah hijau.
- Semua pasangan teks-latar diuji ≥ 4,5:1 (teks kecil) atau ≥ 3:1 (teks ≥ 18 px tebal) oleh pembangun; nilai di tabel ini sudah saya hitung kasar, pembangun memverifikasi dengan alat kontras dan boleh menggeser ± 1 langkah.

## 5. Motif kelistrikan

- **Bilah atas = diagram satu garis** (sudah ada, `MenuAtas.jsx`): bus horizontal, tiap menu = pemutus (kotak) di cabang; aktif = kotak kuning petir isi penuh, lainnya garis hijau muda. Dipertahankan, diwarnai ulang. Di HP, bilah bawah/atas memakai motif yang sama (kotak pemutus kecil di bawah ikon menu aktif).
- **Header halaman = jalur SUTM** (`MotifJaringan.jsx` diperluas): garis kabel lengkung, 3–5 tiang (garis tegak navy `#0e1f4d`, satu-satunya tempat navy logo dipakai selain logo), kotak trafo berlabel "T", pohon (dua lingkaran hijau + batang). SVG inline ≤ 3 KB, tanpa animasi di HP, animasi "arus" pelan di web hanya di Beranda.
- **Titik status di peta**: hijau terverifikasi, kuning bertegangan/aktif/draf, merah perlu perbaikan, abu belum. Selalu dengan ikon/huruf di tooltip atau legenda.
- **Pemisah bagian** = garis bus tipis dengan "isolator" kecil (sudah ada `.ma-iso`), dipakai di judul bagian kartu.

## 6. Empat pola tata letak web (semua 21 halaman masuk salah satu)

Setiap halaman memakai **kerangka halaman** yang sama: `k-kepala` (judul, subjudul satu kalimat "untuk apa halaman ini", aksi utama di kanan, motif SUTM tipis di latar), lalu konten. Keadaan kosong, memuat, galat memakai komponen bersama (`k-kosong`, `SisiLoader`, `k-galat`) dengan kalimat yang menyebut langkah berikutnya.

A. **Daftar + rincian** (kiri daftar/filter, kanan rincian; di layar sempit jadi dua langkah): VerifikasiTiang, MasterSwitching, PenerusanWo, Checkpoint, ApprovalP0, HistoriGangguan, BeritaAcara, JadwalPadam, DataAset, MaterialGudang.
B. **Formulir bertahap** (langkah bernomor di atas, satu bagian per langkah, tombol simpan tetap di bawah): BaForm, LaporanGangguan, PengukuranGardu.
C. **Dasbor / laporan** (baris angka ringkas `k-stat` di atas, grafik/tabel di bawah, filter tanggal `k-navtgl` menempel kanan): Dashboard, LaporanUp3Uiw, GaspolUp3, WorkplanUp3, TabelRekapTemuan, RincianJenisTemuan.
D. **Peta penuh** (peta memenuhi layar, panel geser di kanan/bawah): PetaTemuan.
Khusus: Beranda (hero hijau + motif SUTM beranimasi, ubin menu per feeder seperti sekarang, ditambah "pekerjaan hari ini": jumlah WO terbuka, tiang draf, BA menunggu, hanya dari data yang sudah dimuat Dashboard/menu; tidak menambah endpoint, angka yang tidak tersedia tidak ditampilkan), Login (satu kartu di atas latar hijau gelap bermotif).

Aturan umum: satu tombol utama per layar (hijau), tombol kedua bergaris; tabel ringkas memakai baris 36 px, kolom status paling kiri; filter yang sedang aktif tampil sebagai chip yang bisa dicopot; angka memakai `font-variant-numeric: tabular-nums`.

## 7. Komponen bersama

Web (`komponen.css`, kelas lama tetap, ditambah): `k-kepala`, `k-stat`, `k-langkah` (indikator langkah), `k-status` (chip berikon: `--ok --draf --tolak --aktif --belum`), `k-panel` (kartu dengan judul bus-isolator). Tipografi: tetap `Segoe UI, Roboto, system-ui`; skala 12 / 13,5 / 15 / 18 / 24 px; judul tebal 800.
HP (`app_theme.dart`): AppBar hijau `brand-900` dengan logo bulat putih, kartu radius 10 px garis `neutral-200`, FilledButton `brand-700`, chip status berikon (widget `ChipStatus` baru di `widgets/`), bilah navigasi dengan motif pemutus. Kelas/wdiget baru dipakai bertahap; layar yang belum dirombak sudah berubah warna lewat token.

## 8. HP: urutan dan keputusan

1. Ganti nilai `AppColors` ke palet §4 (sekali ubah, semua layar ikut) + `app_theme.dart` disamakan dengan komponen web §7.
2. Layar yang dirombak susunannya (prioritas lapangan): kerangka `shell/dashboard_shell.dart` (bilah bawah tetap 3–5 tab dengan Beranda di tengah; "gelembung navy" diganti kotak pemutus hijau dengan isi kuning saat aktif; latar `bg-sisi.png` 50 % diganti motif SUTM §5 yang digambar, tanpa aset gambar baru), `home/beranda_screen.dart`, `tiang/jalur_tiang_screen.dart` + `tiang_form_screen.dart`, `switching/switching_screen.dart`, `wo/wo_tim_screen.dart`, `gangguan/*` layar daftar, `auth/login_screen.dart`. Layar lain mengikuti tema saja pada tahap ini, dirombak di tahap berikutnya per modul.
3. **Mode gelap HP ditunda** (keputusan saya): 119 berkas memakai `AppColors.*` langsung, jadi mode gelap butuh mengganti ±2.500 rujukan menjadi warna dari `Theme`. Dikerjakan sebagai tahap sendiri setelah web dan tema terang HP rampung. Master Guswan boleh menaikkannya.

## 9. Tahapan (satu rencana kerja per tahap, masing-masing bisa dirilis sendiri)

0. Token + komponen bersama web (semua halaman berubah warna; tidak ada tata letak berubah). Termasuk mengganti 129 warna heksa yang ditulis langsung di CSS halaman/komponen (terbanyak `login.css` 29, `historiGangguan.css` 13, `pengukuranGardu.css` 12) menjadi token, supaya tidak ada sisa teal/biru. Uji: tangkapan layar 21 halaman terang/gelap, kontras.
1. Kerangka halaman, MenuAtas, MotifJaringan, Beranda, Login, Dashboard.
2. Pola A (10 halaman) — diurutkan dari yang paling sering dipakai: VerifikasiTiang, PenerusanWo, MasterSwitching, lalu sisanya.
3. Pola B dan C (9 halaman), lalu PetaTemuan.
4. HP: `AppColors` + `app_theme` + enam layar prioritas; APK staging.
5. HP: mode gelap (opsional, setelah 4).

Rilis: tiap tahap ke staging dulu (`sisi-web-staging`, APK staging), production atas perintah.

## 10. Diserahkan ke pembangun

- Nilai pasti token netral/gelap setelah uji kontras; bentuk persis ikon trafo/pohon (SVG tangan, bukan gambar).
- Titik pecah responsif per pola (web dipakai di laptop dan HP).
- Cara memecah CSS per halaman yang besar (`beritaAcara.css`, `masterSwitching.css`) bila perlu.
- Teks subjudul "untuk apa halaman ini" tiap halaman, dari komentar kepala berkas halaman.

## 11. Bukti selesai

- `npm test` (web), `flutter test`, `flutter analyze` lulus.
- Tangkapan layar tiap halaman web (terang + gelap) lewat `playwright-cli`, dan enam layar HP prioritas, dilampirkan ke pratinjau mingguan.
- Pemeriksaan kontras otomatis atas semua pasangan token (skrip kecil di `web/scripts/`).
- Master Guswan membuka tiga halaman tersering di HP dan laptop; tombol utama ditemukan tanpa petunjuk.
