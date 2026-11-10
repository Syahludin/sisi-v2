# Menu Data Aset (ITB): rancangan

Tanggal: 2 Nov 2026. Status: menunggu persetujuan Bapak. Belum ada kode. Tidak di-commit (aturan repo: commit hanya atas permintaan).
Mockup yang disetujui arahnya: `.superpowers/brainstorm/4869-1793591426/content/data-aset-v3.html`.

## Tujuan dan alasan
Admin perlu cepat mengecek data jaringan: kabel jenis X ukuran Y panjangnya berapa kmS, di seluruh ULP maupun per penyulang. Datanya berasal dari ITB (file bulanan "ITB ULP Toboali <Bulan Tahun>", sheet `Data_Penyulang`). Hasil akhir yang selama ini dibuat manual ada di sheet `Rekap_penyulang`; menu ini menggantikannya dengan tampilan di web.

## Cakupan
- Menu baru **Data Aset** (web). Hanya dilihat, tidak ada ubah data dari web. Awalnya hanya ADMIN.
- Dua tab, nama jenis kabel sama (dari ITB), yang beda hanya cara menentukan penyulang:
  1. **Data Aset Berdasarkan EAM**: penyulang = `CXPENYULANG` dari ITB.
  2. **Data Aset Berdasarkan Lapangan**: penyulang ditentukan dari `DESCRIPTION` (lihat "Pemetaan lapangan").
- Isi tiap tab: kartu ringkasan (Total jaringan, SUTM, SKTM, Non-aktif, dalam kmS); filter jenis kabel (Semua / satu jenis); kartu SEMUA penyulang yang ada di data (urut terpanjang, bisa abjad), tiap kartu: total km + batang bertumpuk komposisi jenis kabel (warna per jenis) + angka per jenis. Klik kartu = panel rincian tabel ukuran (35/70/150/240) x jenis kabel dan daftar segmen penyulang itu. Penyulang tanpa baris di data tidak ditampilkan.
- **Card tersendiri "Segmen hilang"** (di kedua tab, di bawah kartu penyulang): segmen (DESCRIPTION) yang ada di master tetapi tidak ada di file ITB bulan terakhir; berisi jumlah, total km, dan daftar (segmen, penyulang, jenis kabel, ukuran, panjang, keterangan). Segmen hilang TIDAK ikut dihitung di kartu penyulang maupun kartu ringkasan.
- Tab Lapangan punya panel tambahan "N segmen belum terpetakan" + daftar, supaya Bapak bisa melengkapi.
- Tombol **Perbarui Data Aset** (hanya yang berhak ubah, seperti History Gangguan) + keterangan kapan terakhir diperbarui dan dari file bulan apa.

## Bukan tujuan / hal yang harus dihindari
- Tidak mengubah file ITB (hanya dibaca). Tidak menghapus baris master secara otomatis.
- Tidak menyalin sheet `Rekap_penyulang`; rekap dihitung sistem dari baris segmen.
- Bagian "By Real Lapangan" versi lama di sheet (nama kabel A3C, A3CS dst.) tidak dipakai.
- Gagal jika hasil angka tidak bisa dipertanggungjawabkan: segmen yang penyulangnya tidak ketemu TIDAK boleh dihitung diam-diam ke penyulang tebakan.
- HP (Flutter): di luar pekerjaan pertama; sheet master yang sama disiapkan agar HP bisa membacanya nanti.

## Keputusan Bapak (sesuai percakapan)
- Istilah: **DESCRIPTION = segmen** (satu baris data = satu segmen).
- Satu sheet master baru ("master ITB SiSi") menjadi database untuk web dan HP; data ITB bulanan disinkronkan ke sana.
- Tiap bulan, file ITB dicek **per baris per DESCRIPTION** terhadap master: sudah ada = diperbarui; belum ada = ditambahkan baris baru; ada di master tetapi tidak ada di file ITB bulan itu = diberi keterangan di sebuah kolom (tidak dihapus).
- Sinkron dengan tombol Perbarui (juga direncanakan bulanan); data utama = ITB.
- Perhitungan 1 memakai `CXPENYULANG`; perhitungan 2 memakai `DESCRIPTION`: cari nomor gardu (contoh `SEGMEN PY0088 - PERC PY0173`: PY0088 ada di `db_Gardu` milik penyulang Palas, maka segmen dimasukkan ke Palas); bila tidak ada nomor gardu, pakai `db_Jaringan` (penyulang + section/switching).
- Hanya segmen berstatus OPERATING masuk perhitungan penyulang (sama dengan sheet Rekap); status lain (INVALID dst.) dihitung sebagai Non-aktif. (Dugaan: angka "Jaringan Non-Aktif 1,141" di Rekap = INVALID; pelaksana memverifikasi saat uji.)

## Keputusan pelaksana (usulan saya, mohon dicek)
1. **Properti & tempat master** (diubah 2 Nov 2026 atas permintaan Bapak): `MASTER_ITB_SHEET_ID` = file ITB sumber (dibaca saat sinkron); `SISI_ITB_SHEET_ID` = file master ITB SiSi tempat tab `db_Aset_ITB` ditulis dan dari mana web membaca (header didaftarkan di `skemaHeader_()` di bawah kunci itu, disiapkan `ADMIN_siapkanSheetAsetItb`). Tanpa kedua properti: galat `CONFIG_TIDAK_LENGKAP`. `GARDU_SHEET_ID` (db_Gardu) dan `MASTER_SHEET_ID` (db_Jaringan) hanya dibaca untuk pemetaan.
2. **Kunci baris** (pengganti "per description saja", karena satu deskripsi bisa punya lebih dari satu baris/kabel): `CXPENYULANG | DESCRIPTION | JENIS_KABEL | UKURAN_KAWAT` dirapikan (huruf besar, spasi tunggal). Jika kunci yang sama muncul dua kali di satu file, baris ke-2 dst. diberi nomor urut agar tetap unik dan jumlah baris sama dengan file. STATUS, panjang, ENDMEASURE tidak masuk kunci (itu yang diperbarui).
3. **Kolom master**: `aset_id`, `kunci`, `cx_unit`, `cx_penyulang`, `penyulang_itb`, `description`, `status`, `endmeasure`, `jenis_kabel`, `panjang_hantaran`, `ukuran_kawat`, `kategori` (SUTM/SKTM), `penyulang_lapangan`, `sumber_pemetaan` (`GARDU` | `SECTION` | `BELUM`), `kode_gardu`, `keterangan`, `bulan_itb` (bulan file terakhir yang memuat baris ini), `diubah_pada`. Kolom `keterangan` dan `penyulang_lapangan` yang diisi Bapak manual TIDAK ditimpa sinkron (koreksi manual menang, dicatat `sumber_pemetaan = MANUAL`).
4. **Segmen hilang** (keputusan Bapak, 2 Nov 2026): kolom `keterangan` diisi "Tidak ada di ITB <bulan file>"; baris tetap ada di master. Tidak dihitung di perhitungan; ditampilkan di card tersendiri "Segmen hilang" (lihat Cakupan). Bila segmen muncul lagi di file bulan berikutnya, keterangan dikosongkan otomatis dan ikut dihitung lagi.
5. **File bulanan** (diubah 2 Nov 2026): sumber sinkron selalu `MASTER_ITB_SHEET_ID`; tombol Perbarui hanya memicu sinkron `MASTER_ITB_SHEET_ID` -> `SISI_ITB_SHEET_ID`, tanpa isian tautan (tidak ada jalur ID dari klien). Bila file ITB berganti tiap bulan, Bapak memperbarui properti itu.
6. **Kategori SUTM / SKTM**: tabel tetap di kode (AAAC, AAACS = SUTM; N2XSEBY - 1 CORE, NA2XSEYBY - 3 CORE = SKTM). Jenis kabel yang tidak dikenal masuk "Lainnya" dan dilaporkan di hasil sinkron, tidak dibuang.
7. **Pemetaan lapangan** (urutan): (a) ambil semua kode gardu di DESCRIPTION dengan pola huruf+angka (PY0088, TB0080, PAK0001) lalu cari di `db_Gardu` (kolom No Gardu → Penyulang); kode pertama yang ketemu dipakai; (b) bila tidak ada, cocokkan teks DESCRIPTION (setelah dirapikan) dengan nama section di `db_Jaringan`, ambil kecocokan terpanjang → penyulangnya; (c) (ditambah 2 Nov 2026 atas permintaan Bapak) bila belum ketemu: nama tempat di kedua ujung DESCRIPTION (tanpa jenis perangkat, mis. `ACR BEDENGUNG` -> `BEDENGUNG`; kode tiang TB0xxx ikut) dicocokkan dengan nama tempat di ujung section `db_Jaringan`; dipakai bila SEMUA kecocokan menunjuk satu penyulang (`sumber_pemetaan = UJUNG`); (d) bila gagal: `BELUM`, diisi manual oleh Bapak (`MANUAL`, tidak ditimpa sinkron). Konflik (dua kode gardu beda penyulang) atau kecocokan yang bertentangan: TIDAK memilih, dikosongkan (`BELUM`, catatan `Konflik gardu: ...` di `keterangan`) supaya Bapak mengisi manual (diubah 2 Nov 2026). Hasil dihitung saat sinkron dan disimpan di master (bukan setiap tampilan).
8. **API & guard** (usulan): `getDataAset {}` (menu `OPS_DATA_ASET`, ADMIN, cache pendek) dan `sinkronDataAset { itbSheetId }` (aksi UBAH, di dalam `denganLock_`, bacaan sumber maks 60 dtk, penulisan sekali per blok). Kode galat dari katalog `pesan` yang ada. Versi backend + web naik, `docs/API-CONTRACT.md` dan `db_Menu.tsv` / `db_Akses.tsv` diperbarui.

## Yang diserahkan ke pelaksana
Tata letak CSS rinci mengikuti History Gangguan (kartu, KPI, tab); nama berkas modul (`backend/src/modules/<nomor>_AsetItb.js`, `web/src/pages/dataAset/*`); warna jenis kabel; pembulatan (kmS 3 desimal di data, tampil 2 desimal di kartu, format Indonesia); pengujian: tes murni (kunci baris, pemetaan, rekap) + tes backend dengan sheet palsu, tes web, tidak menyentuh produksi sebelum Bapak menyetujui.

## Risiko yang diketahui
- Kunci baris dari DESCRIPTION rawan duplikat atau berubah ejaan antarbulan: baris lama bisa ditandai "tidak ada" lalu muncul baris baru; sinkron wajib melaporkan jumlah tambah / ubah / hilang agar terlihat bila terlalu banyak.
- Kode gardu di DESCRIPTION bisa tidak ada di `db_Gardu` (gardu belum terdaftar): masuk `BELUM`, bukan tebakan.
- Pencocokan nama section di `db_Jaringan` bisa salah arah bila nama mirip: kecocokan terpanjang + tanda sumber `SECTION` agar bisa diperiksa.
- Belum diuji dengan file ITB nyata selain contoh September 2026 yang dibaca lewat konektor (angka Rekap dipakai sebagai acuan uji).
