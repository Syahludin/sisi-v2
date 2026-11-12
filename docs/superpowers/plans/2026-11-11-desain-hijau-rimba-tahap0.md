# Desain Hijau Rimba, Tahap 0 (token + warna web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Semua 21 halaman web berganti ke palet Hijau Rimba (terang + gelap) tanpa satu pun warna teal/biru tersisa, tata letak belum berubah.

**Architecture:** Nilai token di `web/src/styles/tokens.css` diganti (nama tetap); warna heksa yang ditulis langsung di CSS halaman/komponen diganti `var(--…)`; skrip kontras memeriksa pasangan teks-latar dari token.

**Tech Stack:** Vite + React, CSS custom properties, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-11-desain-hijau-rimba-design.md` (§4 palet, §9 tahap 0, §11 bukti).

## Global Constraints
- Nama token tidak berubah; hanya nilai.
- Kuning petir `#ffd21e` hanya untuk aktif / bertegangan / perhatian.
- Kontras teks ≥ 4,5:1 (terang dan gelap).
- Tidak ada perubahan JSX / logika di tahap ini (kecuali warna `theme-color` di `tema.js` dan `index.html`).

## Review Focus
- Teks putih di atas tombol `brand-700` / `red-700` / `success-700` (terang & gelap) harus ≥ 4,5:1.
- Teks `accent-700` di atas `accent-100` (chip draf) harus ≥ 4,5:1.
- Teks gelap di atas `accent-600` (menu aktif kuning) harus ≥ 4,5:1 — teks putih di atas kuning DILARANG.
- Warna heksa yang tersisa di CSS halaman setelah penggantian hanya yang disengaja (putih / hitam bayangan, warna resmi peta), dicatat di komentar.
- Mode gelap: `--putih` dan `--latar-dasar` ikut hijau, bukan teal.

---

### Task 0.1: Skrip kontras

**Files:** Create `web/scripts/kontras.cjs`, `web/test/kontras.test.js`; Modify `web/package.json` (daftar tes + skrip `kontras`).

**Interfaces:** Produces `bacaToken(css: string, tema: 'terang'|'gelap'): Record<string,string>`, `rasio(hexA, hexB): number`, `PASANGAN: [teks, latar, minimum][]`, `periksa(css): {tema, teks, latar, rasio, minimum, lulus}[]`.

- [x] Tes: `rasio('#ffffff', '#000000')` ≈ 21; `rasio('#777777','#ffffff')` ≈ 4,48; `bacaToken` membaca `:root` dan menimpa dengan `:root[data-tema="gelap"]`; `periksa(tokens.css)` semua `lulus`.
- [x] Pasangan minimum (keduanya tema): `neutral-900/putih`, `neutral-700/putih`, `neutral-500/putih` (3:1, teks bantu), `brand-950/brand-50`, `#fff/brand-700`, `#fff/brand-900`, `#fff/red-700`, `#fff/success-700`, `accent-700/accent-100`, `brand-950/accent-600`, `red-700/red-100`, `success-700/success-100`, `brand-700/brand-100`.

### Task 0.2: Palet baru di tokens.css

**Files:** Modify `web/src/styles/tokens.css`, `web/src/tema.js` (theme-color), `web/index.html` (theme-color awal).

- [x] Nilai terang dan gelap persis spec §4; `--gradien-sisi: linear-gradient(135deg, #0b2418 0%, #153f2c 55%, #1f6b45 100%)`; theme-color terang `#153f2c`, gelap `#0f1a14`.
- [x] `node scripts/kontras.cjs` lulus; geser ± 1 langkah bila ada yang gagal, catat di spec.

### Task 0.3: Ganti heksa langsung di CSS halaman/komponen

**Files:** Modify `web/src/pages/*.css`, `web/src/components/*.css`, `web/src/styles/komponen.css`, `web/src/styles/umum.css`.

- [x] Setiap heksa dipetakan ke token terdekat berdasarkan perannya (teks, garis, latar, status); warna yang memang harus tetap (putih murni pada foto, warna peta pihak ketiga) diberi komentar `/* tetap: … */`.
- [x] `grep` heksa tersisa: hanya yang berkomentar tetap.

### Task 0.4: Verifikasi

- [x] `npm test` di `web/` lulus; `npm run build` lulus.
- [ ] (sebagian: baru Login) Tangkapan layar Login, Beranda, VerifikasiTiang, Dashboard (terang + gelap) lewat `playwright-cli` di dev server; periksa tidak ada sisa teal.

**Selesai 11 Nov 2026.** Token baru: `--isi-utama/--isi-setuju/--isi-bahaya(+hover)`, `--di-isi`, `--di-aksen`, `--navy-logo` (di tema gelap brand-700 = hijau terang untuk TEKS, jadi latar terisi memakai token isi). 116 warna langsung diganti; yang tetap diberi komentar (kategori Gaspol, fasa R/S/T/N, air peta, hijau WhatsApp). Warna status peta / jenis switching / grafik pie diselaraskan. `npm run kontras` lulus semua pasangan; web `npm test` 156/156, build lulus; tangkapan layar Login terang + gelap diperiksa. Halaman yang butuh login belum ditangkap (perlu akun staging).

## Tahap 1 (selesai 11 Nov 2026)

- Bilah atas hijau tua (`--bar-latar/--bar-garis/--bar-teks/--bar-redup/--bar-kaca`, `dashboard.css` + `menuAtas.css`): bus & bingkai pemutus hijau muda, pemutus terisi = sudah dibuka, kuning petir bercahaya = aktif, garis bawah kuning; panel Semua Menu & daftar "lagi" tetap permukaan terang.
- `MotifJaringan.jsx` + `components/motifJaringan.css` (gaya motif dipindah dari `login.css`): tiang, kawat, trafo tiang kuning berpetir, pohon; prop `trafo`, `pohon`; warna lewat `--motif-rgb` / `--motif-pohon`. Beranda memakai motif beranimasi.
- Login: panggung kiri selalu hijau tua (tema terang juga), panel masuk tetap terang. Keputusan pembangun: tata letak dua panel dipertahankan (sudah satu fokus tombol Login), bukan diganti satu kartu.
- Komponen baru untuk tahap 2-3: `KepalaHalaman.jsx` (`.k-kepala`: bilah hijau bermotif, judul, kalimat tujuan, aksi utama kuning), `.k-status--ok/draf/tolak/aktif/belum` (chip berikon), `.k-stat` (baris angka).
- Beranda "pekerjaan hari ini" TIDAK dibuat: Dashboard tidak memuat data WO/tiang/BA, dan spec melarang endpoint baru.
- Bukti: `npm run kontras` lulus (termasuk pasangan bilah), web `npm test` 156/156, build lulus, tangkapan layar Beranda terang+gelap, rel aktif, panel Semua Menu, Login terang (sesi & cekSesi ditiru di browser, server tidak dihubungi).

## Tahap 2 (sebagian, 11 Nov 2026)

- Kepala halaman bersama `.hlm-header` (dipakai 25 halaman, tanpa ubah JSX) jadi bilah hijau tua bermotif SUTM (SVG latar: tiang, kawat, trafo kuning, pohon), judul putih + kalimat tujuan, garis bawah kuning, tombol utama kuning, tombol garis putih. Layar HP (≤640 px): motif disembunyikan supaya tombol tidak bertumpuk gambar.
- `.k-badge` berikon (✓ ok, ● proses, ! belum, ○ lainnya) untuk semua lencana status yang ada.
- Diperiksa (tangkapan layar, data ditiru kosong): Verifikasi Tiang, Penerusan WO, Master Jaringan (gelap), History Gangguan, Jadwal Padam (laptop + lebar HP 390 px), dan 7 halaman lain tanpa galat; Material Gudang galat `reduce` hanya karena data tiruan kosong.
- BELUM: penataan ulang "daftar kiri + rincian kanan" per halaman (pola A). Halaman masih memakai susunan isinya yang lama di bawah kepala baru.

### Tahap 2: tiga halaman prioritas (11 Nov 2026)

- **Verifikasi Tiang**: ringkasan (persen total + 5 angka status), kiri daftar jalur (cari, bar progres, lencana perbaikan / cek), kanan tiang jalur terpilih dari `getTiangJalur` yang sudah ada (dimuat saat jalur dibuka, disimpan per jalur sampai Muat Ulang): saringan status berangka, cari nama, tabel status berikon / foto x/2 / sumber koordinat / waktu verifikasi / kekurangan & tanda cek. Logika `statusTiang`, `saringTiang`, `hitungStatusTiang`, `SARING_TIANG` di `tiang.js` + tes.
- **Penerusan WO**: sudah daftar + rincian; ditambah dua langkah di layar ≤1000 px (daftar disembunyikan saat temuan dipilih, tombol "Semua temuan", rincian digulir ke atas), pil status berikon, item terpilih bergaris kuning.
- **Master Jaringan (Switching)**: rincian pindah dari dialog ke kolom kanan di samping peta (menggantikan daftar, tombol "Daftar switching", tombol Ubah tetap di bawah), baris terpilih bergaris kuning. Form tambah / ubah tetap dialog.
- Bukti: web `npm test` 157/157, build lulus, kontras lulus; tangkapan layar dengan data tiruan: Verifikasi Tiang (laptop terang, gelap + saringan, HP dua langkah), Penerusan WO (laptop, HP dua langkah), Master Jaringan (daftar, rincian). Tujuh halaman pola A lain belum.

## Tahap 4 HP (12 Nov 2026)

- `AppColors` diganti ke palet Hijau Rimba (nilai sama dengan web; alias navy* / cyan* tetap, kini hijau; `navyLogo` baru). Literal heksa biru-abu di 46 berkas dipetakan ke palet (F6F8FC dst). Warna semantik (merah, hijau status, biru info peta) sengaja tidak diubah.
- `AppTheme`: AppBar hijau tua + garis kuning petir 3 px + ikon / judul putih (`SystemUiOverlayStyle.light`) untuk SEMUA layar; sisanya mengikuti token.
- Kerangka: bilah bawah, pemutus aktif = gelembung kuning petir berbingkai hijau tua + cahaya; label aktif hijau tua.
- `PolaJaringanPainter`: ditambah trafo tiang kuning berpetir + tiga pohon (muncul di ujung gambar bertahap), sama dengan web; tes `sisi_motif_test.dart` (semua tahap progres + gambar opsional).
- Dibiarkan: latar `bg-sisi.png` (watermark logo SiSi navy di atas putih kebiruan, 50 %) karena itu logo merek.
- BELUM: penataan ulang susunan layar HP (Beranda, Verifikasi Tiang, Master Switching, WO, Gangguan, Login) selain warna / tema; mode gelap HP (tahap 5). Belum dilihat di perangkat (tidak ada emulator di sesi ini): hanya analyze + 423 tes + gambar motif.
- Versi mobile 1.0.78+252; APK staging dibangun. Production 1.0.77+251 (warna lama) belum diganti.
