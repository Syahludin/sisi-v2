# Master Tiang dan Master Switching: struktur kolom

Tanggal: 8 Nov 2026. Status: draf untuk dikoreksi Master Guswan. Belum ada kode. Belum di-commit.

Fokus sekarang: **memverifikasi data aset di lapangan dari awal**, untuk tiang dan switching, lewat empat sheet: `db_Segmen`, `db_Tiang`, `db_Tiang_Sirkuit`, dan `db_Switching`. Sheet lain di bagian "Ditunda" dicatat supaya tidak hilang.

Keputusan Master Guswan (8 Nov 2026):
- Hanya tiang **TM**. Tiang TR tidak diimpor dan tidak diverifikasi.
- Kode di nama tiang (TKL, PLS, BEN, ...) **bukan patokan penyulang**. Penyulang ditentukan dari verifikasi lapangan.
- Titik hubung antar-penyulang dicatat sebagai **switching** (satu baris di `db_Switching`).
- Switching belum punya nomor aset: ID dibuat sistem, daftar switching dibangun **seluruhnya dari lapangan**. Saat ini hanya data sisi kontroler yang bisa dicatat (penggerak/motor di jaringan tidak bisa dicek), jadi kolom data unit bersifat opsional.
- Tiang **double/triple feeder**: tiang fisik dipisah dari sirkuitnya (`db_Tiang` + `db_Tiang_Sirkuit`). Data fisik diisi 1 kali per tiang; hanya isian per sirkuit yang diulang.
- **Master segmen dibuat admin** lebih dulu per penyulang (`db_Segmen`). Admin membuat segmen **satu per satu lewat form**, dari web atau dari HP (tanpa impor massal dari ITB). Saat verifikasi, petugas **memilih** segmen dan section dari daftar yang sudah ada, tidak membuat sendiri. Kalau segmen belum ada, petugas mengirim usulan ke admin tanpa menghentikan pekerjaan.
- Per gawang di tiap sirkuit dicatat jenis kabel dan ukuran kabel.
- Kabel tanah (SKTM) bisa muncul di banyak titik, bukan hanya keluaran GI (keputusan 10 Nov 2026). Batas segmen selalu **switching, gardu, percabangan, atau kubikel GI**. Kabel tanah **dibuat segmen sendiri** (revisi 10 Nov 2026, mengikuti ITB): segmen dibelah di tiap peralihan SUTM dan kabel tanah, jadi tiap segmen seragam, `udara` atau `kabel_tanah`. Contoh keluaran GI: `Kubikel Tungkal - SKTM Tungkal` (kabel, tanpa tiang) dan `SKTM Tungkal - ACR Tungkal` (udara). Peralihan itu titik batas bernama **`ujung_kabel`** (tiang naik/turun atau terminasi kabel). Data ITB (Data_Penyulang, 930 baris) memang memisahkan 44 baris kabel tanah (30 NA2XSEYBY, 14 N2XSEBY; 18 OPERATING sekitar 9,2 km, 26 INVALID sekitar 1,1 km) dari SUTM, sehingga `segmen_itb` bisa dicocokkan 1:1. Tidak ada tabel kabel terpisah: jenis, ukuran, dan panjang kabel ada di `db_Segmen`. Gawang di `db_Tiang_Sirkuit` hanya untuk saluran udara.
- **Segmen buatan Admin adalah dasar utama** (10 Nov 2026). Keanggotaan tiang dalam segmen **dicatat eksplisit** saat verifikasi (`db_Tiang_Sirkuit.segmen_id`, dipilih Admin), bukan diturunkan dari data aset atau dari nama tiang. Tiang yang belum punya `segmen_id` berarti belum diverifikasi. Urutan tiang dalam segmen mengikuti rantai `induk_tiang_id`.
- Panjang segmen kabel tanah **diisi manual** (rute kabel lebih panjang dari jarak koordinat) dan ikut perhitungan impedansi. Segmen kabel tanah tidak punya tiang, jadi tidak masuk persentase verifikasi tiang; statusnya dari kelengkapan datanya (`status_data`).
- **Setiap PMT dimasukkan sebagai switching** (jenis `PMT`, 10 Nov 2026), karena setelan OCR dan GFR di PMT dipakai untuk pencarian gangguan berdasarkan arus. Setelan disimpan di `db_Switching_Setelan` (bagian 4a), naik dari "Ditunda". Section dan segmen pertama penyulang sama-sama dimulai dari PMT: `awal_jenis = switching` dengan `awal_switching_id` PMT itu; jenis `GI` hanya cadangan untuk penyulang yang PMT-nya belum tercatat. Contoh: section `PMT Tungkal - ACR Tungkal` berisi segmen `PMT Tungkal - SKTM Tungkal` (kabel_tanah) lalu `SKTM Tungkal - ACR Tungkal` (udara).
- Sambungan (belit, joint, parallel group) **tidak dicatat di master**: pengaruhnya ke impedansi dan perhitungan jarak gangguan dapat diabaikan. Dipindah ke fitur temuan per tiang (setelah 90 persen tiang terverifikasi).
- Peran: **hanya Admin** yang membuat segmen, memverifikasi tiang dan switching di lapangan, dan mereview hasilnya.
- Verifikasi tiang **berurutan sepanjang jalur** (aplikasi memandu dari tiang ke tiang), bukan bebas per tiang.
- Prinsip memilih kolom: data yang memengaruhi perhitungan jarak gangguan atau diperlukan untuk memverifikasi data aset dimasukkan; selebihnya ditunda.

## Status implementasi (8 Nov 2026)

Tahap pertama selesai di kode, belum di-commit dan belum di-deploy: `backend/src/modules/95_Tiang_Master.js` (`ADMIN_siapkanSheetTiang` membuat tab dan header, `ADMIN_cekSheetTiang` hanya mengecek), Script Property / `CFG_JSON` **`TIANG_SHEET_ID`** (spreadsheet SiSi_Tiang), skema di `skemaHeader_()`, `db_Konstruksi` dan `db_Tiang_Pemetaan` masuk `ADMIN_lengkapiMaster`. Tes: `tests/tiangMaster.test.js`. Isi baris dimasukkan manual; belum ada sinkron tiang atau form tiang. **Semua tab berkolom pertama `No`** (permintaan Master Guswan 8 Nov 2026; nomor urut baris, BUKAN kunci, pola SiSi_Gudang): diisi server untuk baris baru `db_Switching`, dan oleh `ADMIN_lengkapiMaster` untuk baris `db_Konstruksi` / `db_Tiang_Pemetaan` yang diketik manual. Kolom `No` tidak tertulis di tabel kolom di bawah.

Tahap migrasi (8 Nov 2026): `97_Tiang_Itb.js`, `ADMIN_cekMigrasiTiangItb` / `ADMIN_migrasiTiangItb` (sumber `db_TiangMaster` -> `db_Tiang` + sirkuit awal; lihat bagian "Alur data" dan bagian 6). Diuji pada data asli: tanpa induk 73 dari 15.185 tiang TM.

Tahap kedua (8 Nov 2026, versi 1.0.63): **Master Switching** end-to-end. Backend `96_Master_Switching.js` (`getMasterSwitching`, `simpanSwitching`, `uploadFotoSwitching`, `getFotoSwitching`, menu `OPS_MASTER_SWITCHING`, `TIANG_FOTO_FOLDER_ID`), web `pages/MasterSwitching.jsx`, HP `features/switching/` dengan peta `flutter_map` (OpenStreetMap / Esri, gratis). Nilai pilihan disimpan huruf besar (mis. status_verifikasi `BELUM` / `TERVERIFIKASI` / `PERLU_PERBAIKAN`). Catatan kerja: `docs/pratinjau-mingguan/2026-11-15.md`.

## Perlu ditambahkan (revisi 10 Nov 2026, belum ada di kode)

- **SELESAI 10 Nov 2026 (kode + tes, belum di-commit / deploy):** kolom baru `db_Segmen` (enam kolom di belakang header, `UJUNG_KABEL` di form web dan HP, segmen kabel tanah tidak berisi tiang, `status_data` LENGKAP/KURANG). Tab `db_Segmen` yang sudah ada diperpanjang otomatis oleh `ADMIN_siapkanSheetTiang` (enam header ditambahkan di belakang `diubah_oleh`, baris tidak disentuh); `ADMIN_cekSheetTiang` hanya melaporkan kolom yang belum ada. Daftar jenis kabel tanah sementara tetap di kode (`SGM_KABEL_`), belum dibaca dari `db_Aset_ITB`.
- Kolom baru `db_Segmen`: `jenis_segmen`, `jenis_kabel`, `ukuran_mm2`, `panjang_kabel_m`, `penghantar_id`, `status_data`, dan nilai `ujung_kabel` di `awal_jenis` / `akhir_jenis` (bagian 3). Header di `skemaHeader_()`, dibuat oleh `ADMIN_siapkanSheetTiang`, dicek `ADMIN_cekSheetTiang`, tes di `tests/tiangMaster.test.js`.
- Sheet `db_Switching_Setelan` (bagian 4a, **ditunda sampai kolom difinalkan** setelah tipe rele terlihat): header di `skemaHeader_()`, dibuat dan dicek bersama sheet tiang, tes di `tests/tiangMaster.test.js`. Form isian setelan di web dan HP pada layar Master Switching (`96_Master_Switching.js`, `pages/MasterSwitching.jsx`, `features/switching/`). Yang bisa dikerjakan lebih dulu: mengisi data rele di `db_Switching` (merk, tipe, firmware, foto) untuk 19 PMT.
- Pencarian gangguan dari arus butuh `db_Penghantar` dan `db_Sumber_Penyulang` selain setelan; setelan saja tidak cukup.
- Form segmen (web dan HP): pilihan jenis segmen, dan untuk `kabel_tanah` kolom kabel tampil dan wajib.
- Pilihan `jenis_kabel` dan `ukuran_mm2` dibaca dari `db_Aset_ITB`, dipisah menurut kategori SUTM (gawang) dan SKTM (segmen kabel tanah) memakai aturan `kategoriKabelItb_`.
- Persentase verifikasi segmen: segmen `kabel_tanah` dikecualikan dari hitungan tiang dan memakai `status_data`.
- `db_Sumber_Penyulang` (kubikel outgoing, 19 penyulang) naik dari "Ditunda" karena menjadi `awal` segmen kabel keluaran GI.
- Pemeriksaan data: segmen kabel tanpa data kabel, rantai segmen terputus di `ujung_kabel`, segmen udara tanpa tiang.

## Sumber data awal

- `Tiang ULP Toboali.xlsx` (ekspor aset PLN): 22.586 tiang (15.185 TM, 7.401 TR). Yang diimpor hanya TM (`SUBCLASS = Tiang TM`). Kunci `ASSETNUM`.
- Nama tiang TM berhierarki: `PLS0908.C0215.B0071` berarti jalur utama PLS tiang 908, cabang C tiang 215, cabang B tiang 71. Usulan induk tiang bisa disusun dari nama.
- Kolom `PARENT` berisi segmen aset (mis. `SEGMEN LBS AIR BARA - GH PAYUNG`). **Hanya pembanding untuk ITB**, bukan dasar segmen.
- `KODE_HANTARAN` kosong semua, jadi penghantar diisi dari lapangan.
- **Alur data (keputusan Master Guswan 8 Nov 2026), polanya sama dengan Data Aset ITB (`67_AsetItb.js`):**
  1. File ITB yang sudah ada (`MASTER_ITB_SHEET_ID`, HANYA DIBACA) ditambah satu sheet bernama **`db_TiangMaster`** berisi data tiang (dari `Tiang ULP Toboali.xlsx`). Susunan kolom sheet ini boleh berubah-ubah mengikuti data dari pusat (lihat bagian 6).
  2. Satu sheet khusus SiSi, `db_Tiang`, menjadi master tiang SiSi. Datanya **disalin dari sheet tiang di file ITB**, ditambah kolom untuk verifikasi.
  3. Sinkron ulang dari sumber hanya memperbarui **kolom aset** (kunci ASSETNUM): baris yang sudah ada diperbarui, baris baru ditambah, baris yang hilang dari sumber diberi keterangan "Tidak ada di sumber <bulan>" dan tidak dihapus. **Kolom verifikasi tidak pernah ditimpa sinkron.**
  4. Hasil verifikasi lapangan hanya ditulis ke master tiang SiSi, tidak pernah ke file ITB.
- Pemeriksaan awal: gawang median 52 m; sekitar 353 zig-zag, 154 koordinat > 5 km dari tiang sebelumnya, 911 gawang 150 m sampai 5 km; 83 baris koordinat kembar dan 26 pasang berjarak < 10 m (calon tiang double feeder).

## 1. `db_Tiang` (1 baris per tiang fisik)

| Kelompok | Kolom | Isi |
|---|---|---|
| Identitas | tiang_id | ASSETNUM, kunci |
| | assetnum_lain | ASSETNUM lain kalau satu tiang fisik tercatat ganda di aset (untuk ekspor ke sistem aset) |
| | digabung_ke | Diisi `tiang_id` tujuan kalau baris ini digabung ke tiang lain saat verifikasi |
| | ssot_number | SSOTNUMBER dari file aset |
| | nama | DESCRIPTION tanpa "TIANG TM " |
| | kode_nama_aset | TKL, PLS, BEN, ... (3 huruf awal nama aset). **Hanya informasi dari data aset**, bukan patokan penyulang |
| Fisik | jumlah_sirkuit | 1, 2, atau 3 |
| | jenis_tiang | BETON / BESI |
| | ukuran_tiang | Mis. `12 Meter 200 daN` |
| | konstruksi_aset | Gabungan KODE_KONSTRUKSI_1 sampai 6 dari data aset (kolom aset, pembanding) |
| | konstruksi_lapangan | Kode konstruksi hasil verifikasi lapangan, dipilih dari `db_Konstruksi` (menyimpan `konstruksi_id`) |
| | kelas_area | Pedesaan / perkotaan / CBD |
| | status_aset | OPERATING / INVALID |
| Lokasi | lat_aset, lng_aset | Koordinat dari data aset (kolom aset, tidak diubah verifikasi) |
| | lat, lng | Koordinat yang berlaku (awalnya = koordinat aset, diganti GPS lapangan saat verifikasi) |
| | sumber_koordinat | aset / lapangan |
| | akurasi_m | Akurasi GPS saat diverifikasi |
| Gardu | gardu_id | Dari `db_Gardu`, untuk tiang tempat gardu terpasang |
| Pemeriksaan | tanda_cek | koordinat_kosong / dobel / kemungkinan_double_feeder (otomatis, dari koordinat) |
| | status_verifikasi | belum / terverifikasi / perlu_perbaikan |
| | verifikasi_terakhir | Tanggal verifikasi terakhir |
| Audit | aktif, revision, diubah_pada, diubah_oleh | Standar |

Dua kelompok kolom:
- **Kolom aset** (diisi dan diperbarui hanya oleh sinkron dari sumber): tiang_id, ssot_number, nama, kode_nama_aset, segmen_aset (di `db_Tiang_Sirkuit` awalnya), lat_aset, lng_aset, konstruksi_aset, jenis_tiang dan ukuran_tiang awal, kelas_area, status_aset.
- **Kolom verifikasi** (diisi hanya oleh verifikasi lapangan, tidak ditimpa sinkron): lat, lng, sumber_koordinat, akurasi_m, jumlah_sirkuit, konstruksi_lapangan, gardu_id, status_verifikasi, verifikasi_terakhir, digabung_ke, assetnum_lain, dan hasil koreksi jenis_tiang atau ukuran_tiang.
- Perbedaan kedua kelompok menjadi dasar laporan pembanding untuk ITB.

Catatan:
- Foto per tiang (wajib 2): tiang utuh dengan nomor terlihat, dan kepala tiang yang memperlihatkan semua sirkuit.
- Kalau satu tiang fisik tercatat dengan dua ASSETNUM, ASSETNUM yang pertama menjadi kunci, yang lain disimpan di `assetnum_lain`.
- Impor memberi tanda `kemungkinan_double_feeder` pada pasangan baris berkoordinat sama atau sangat dekat. Petugas memilih: digabung jadi satu tiang dua sirkuit, atau memang dua tiang terpisah.
- Temuan per tiang baru dimulai setelah 90 persen tiang terverifikasi (fitur lanjutan).

## 2. `db_Tiang_Sirkuit` (1 baris per sirkuit di sebuah tiang)

Tiang satu sirkuit tetap punya satu baris di sini, jadi aturannya seragam. Data gawang (jarak, kabel, sambungan) adalah **gawang dari tiang induk sirkuit ini ke tiang ini**.

| Kelompok | Kolom | Isi |
|---|---|---|
| Identitas | sirkuit_id | Kunci |
| | tiang_id | Tiang fisik |
| | penyulang | Penyulang sirkuit ini, hasil lapangan |
| | posisi | Posisi di tiang (kiri, kanan, atas, bawah) |
| Topologi | induk_tiang_id | Tiang sebelumnya **untuk sirkuit ini** (usulan otomatis dari nama tiang, bisa dikoreksi). Kosong untuk tiang awal sesudah kabel tanah (**Tiang Awal SKTM**, `TITIK_AWAL`, lihat `2026-11-09-verifikasi-tiang-induk-design.md`); tiang itu tidak ditandai `tanpa_induk` |
| | gawang_m | Jarak ke induk tiang, dihitung otomatis dari koordinat. Kosong untuk tiang awal |
| | peran_titik | biasa / switching / gardu / percabangan / ujung |
| Wilayah | section_id | Dipilih petugas dari `db_Jaringan` (disaring menurut penyulang) |
| | segmen_id | Dipilih petugas dari `db_Segmen` (disaring menurut penyulang dan section) |
| | segmen_aset | Teks PARENT asli (pembanding ITB, tidak diubah) |
| | switching_id | Switching tempat sirkuit ini masuk (switching hulu yang memasok), hasil verifikasi |
| | switching_di_tiang | Diisi `switching_id` kalau di tiang ini, pada sirkuit ini, terpasang switching |
| Penghantar gawang udara | jenis_kabel | Dipilih dari daftar jenis kabel SUTM di data aset ITB (`db_Aset_ITB.jenis_kabel` berkategori SUTM; saat ini AAAC, AAACS), bukan daftar ketik sendiri. Jenis kabel tanah (N2XSEBY, NA2XSEYBY) dicatat di `db_Segmen` pada segmen kabel tanah, bukan di sini |
| | ukuran_mm2 | Penampang, dipilih dari nilai `ukuran_kawat` di data aset ITB untuk jenis tersebut. Segmen dibuat sendiri oleh Admin (bukan turunan ITB), jadi tidak ada pencocokan otomatis ke baris ITB. Usulan awal hanya muncul kalau segmen punya rujukan `segmen_itb`; selain itu petugas memilih dari daftar, dan pilihan terakhir di tiang sebelumnya diusulkan lagi untuk gawang berikutnya |
| | penghantar_id | Acuan ke `db_Penghantar` (opsional, mengisi R1 X1 R0 X0 kalau sudah ada) |
| Pemeriksaan | tanda_cek_gawang | zigzag / jauh / gawang_panjang / tanpa_induk (otomatis) |
| | status_verifikasi | belum / terverifikasi / perlu_perbaikan |
| Audit | aktif, revision, diubah_pada, diubah_oleh | Standar |

Catatan:
- Isian per sirkuit di lapangan: penyulang, posisi, induk, switching hulu, jenis dan ukuran kabel. Sebagian besar dipilih dari daftar atau usulan otomatis.
- Sirkuit kedua bisa menyalin dari sirkuit pertama; tiang berikutnya mengusulkan sirkuit yang sama dengan tiang sebelumnya.

## 3. `db_Segmen` (dibuat admin, 1 baris per segmen)

Hierarki: penyulang, section (`db_Jaringan`, switching ke switching), segmen (antar titik batas: kubikel GI, switching, gardu, percabangan, `ujung_kabel`, ujung), tiang. Gardu **adalah** titik batas segmen (keputusan 10 Nov 2026). Segmen seragam: `udara` (berisi tiang) atau `kabel_tanah` (tanpa tiang), mis. `Kubikel Tungkal - SKTM Tungkal` (kabel) lalu `SKTM Tungkal - ACR Tungkal` (udara). Kabel masuk pelanggan menjadi segmen percabangan berjenis `kabel_tanah` yang berakhir di gardu. Admin membuat segmen per penyulang lewat halaman web. Percabangan menjadi segmen tersendiri dengan `induk_segmen_id`.

| Kelompok | Kolom | Isi |
|---|---|---|
| Identitas | segmen_id | Kunci, dibuat sistem |
| | nama | Mis. `LBS AIR BARA - GH PAYUNG` |
| | penyulang | Dari `db_Jaringan` |
| | section_id | Dari `db_Jaringan` |
| | urutan | Urutan dari GI di penyulang |
| | induk_segmen_id | Segmen di hulunya (untuk percabangan) |
| | jenis_segmen | udara / kabel_tanah |
| Batas awal | awal_jenis | GI / switching / gardu / percabangan / ujung_kabel |
| | awal_nama | Teks nama titik (boleh diisi dulu sebelum master switching lengkap) |
| | awal_switching_id, awal_gardu_id | Diisi kalau titiknya sudah ada di master |
| Batas akhir | akhir_jenis | switching / gardu / percabangan / ujung_kabel / ujung |
| | akhir_nama | Teks nama titik |
| | akhir_switching_id, akhir_gardu_id | Diisi kalau titiknya sudah ada di master |
| Kabel (hanya `kabel_tanah`, wajib) | jenis_kabel | Dipilih dari data aset ITB berkategori SKTM (saat ini N2XSEBY - 1 CORE, NA2XSEYBY - 3 CORE) |
| | ukuran_mm2 | Dipilih dari `ukuran_kawat` data aset ITB untuk jenis itu |
| | panjang_kabel_m | **Diisi manual** (rute kabel, bukan jarak koordinat) |
| | penghantar_id | Acuan ke `db_Penghantar` (R1 X1 R0 X0, kapasitansi) kalau sudah ada |
| | status_data | lengkap / kurang (jenis, ukuran, panjang terisi). `kurang` ditandai di hasil perhitungan arus gangguan |
| Rujukan | segmen_itb | Rujukan ke segmen ITB (`db_Aset_ITB.description`), hanya pembanding. Di form, admin boleh memilih segmen ITB sebagai rujukan (opsional) |
| Hasil verifikasi (dihitung) | tiang_awal_id, tiang_akhir_id | Tiang batas, diisi dari verifikasi lapangan |
| | panjang_m, jumlah_tiang | Dari tiang yang terverifikasi di segmen |
| | jumlah_terverifikasi | Tiang di segmen yang sudah terverifikasi |
| | status_verifikasi | belum / sebagian / selesai (dihitung dari tiang untuk `udara`; dari `status_data` untuk `kabel_tanah`) |
| Lain | catatan | |
| Audit | aktif, revision, diubah_pada, diubah_oleh | Standar |

Catatan:
- Karena switching dibangun dari lapangan, batas segmen boleh berupa teks dulu (`awal_nama`, `akhir_nama`), dan kolom `*_switching_id` diisi setelah switching terverifikasi.
- Segmen tanpa tiang terverifikasi tetap bisa dipilih petugas.
- Segmen pertama penyulang dimulai dari PMT (`awal_jenis = switching`, `awal_switching_id` terisi), sama dengan awal section. `GI` dipakai hanya kalau PMT belum ada di `db_Switching`.
- Form pembuatan segmen ada di web admin dan di HP. Peran yang boleh membuat: Admin (dan Admin ES kalau disetujui). Segmen dibuat satu per satu, tidak ada impor massal.
- Pemeriksaan di form: kombinasi penyulang + section + nama tidak boleh kembar; `urutan` otomatis melanjutkan nomor terakhir di penyulang; segmen yang sudah dipakai tiang tidak dihapus, hanya dinonaktifkan.
- Usulan segmen baru dari lapangan masuk ke daftar admin (nama, penyulang, section, tiang awal), dan admin membuat atau menolaknya.

## 4. `db_Switching` (1 baris per peralatan)

| Kelompok | Kolom | Isi |
|---|---|---|
| Identitas | switching_id | Kunci, dibuat sistem (mis. `SWC-0001`), tidak berubah walau nama diganti |
| | nama | Mis. `LBS AIR BARA` |
| | kode_aset | Nomor aset PLN, kosong sampai ada |
| | jenis | PMT / ACR / SSO / LBS / FCO / DS |
| Kontroler (sisi yang bisa dicatat) | merk_kontroler, tipe_kontroler, versi_firmware | |
| | rasio_ct, rasio_vt | |
| Data unit (opsional, boleh kosong) | merk, tipe, nomor_seri, tahun_pasang | |
| | rating_kv, rating_a, kapasitas_putus_ka | |
| | media | vakum / SF6 |
| | penggerak | manual / motor / tidak diketahui |
| Lokasi | penyulang | |
| | section_id | |
| | tiang_id, sirkuit_id | Tiang dan sirkuit tempat switching terpasang |
| | lat, lng | |
| Topologi | switching_hulu_id | Switching tepat di hulunya |
| | proteksi_hulu_id | PMT/ACR terdekat yang bisa trip (dihitung dari rantai). Untuk FCO dan LBS = ACR/PMT hulu |
| | posisi_normal | NC / NO |
| Titik hubung | titik_hubung | ya / tidak |
| | tiang_sisi_a, tiang_sisi_b | Tiang di dua sisi |
| | penyulang_sisi_b | Penyulang sisi lain |
| Kemampuan | bisa_trip | ya (PMT, ACR, FCO), tidak (LBS) |
| | catat_gangguan | Ada indikator gangguan (FPI/RTU) |
| | baca_arus | |
| | baca_tegangan | Switching bisa membaca tegangan |
| SCADA | terhubung_scada, kode_rtu, media_komunikasi | GSM / radio / FO |
| Khusus FCO | fungsi_fco | cabang / gardu |
| | gardu_id | Kalau fungsinya gardu |
| | fuse_tipe, fuse_rating | Fuselink terpasang saat ini (mengikuti `log_Fuse`) |
| Status | status_operasi | operasi / tidak operasi / dibongkar |
| | status_verifikasi | belum / terverifikasi / perlu_perbaikan |
| | verifikasi_terakhir | Tanggal verifikasi terakhir |
| | kondisi, catatan | |
| Foto | foto_unit, foto_nameplate, foto_kontroler | |
| Audit | aktif, revision, diubah_pada, diubah_oleh | Standar |

Catatan:
- FCO tidak bisa membaca arus; analisis gangguan memakai ACR/PMT hulunya (`proteksi_hulu_id`).
- Nama kolom pengecekan Yandal `yan_Switching.switching_id` sudah dipakai sebagai ID baris pengecekan; kolom penaut ke master ini bernama **`switching_master_id`**.
- Pemilihan switching di Yandal diganti dari master ini (GPS terdekat, cadangan cari nama, usulan baru kalau belum ada), dikerjakan sebagai tahap sendiri.

## 4a. `db_Switching_Setelan` (1 baris per setelan rele per periode) — DRAF kolom inti

**Status draf (10 Nov 2026):** Master Guswan belum tahu isi menu rele di PMT, jadi kolom di bawah hanya **kolom inti yang ada di hampir semua rele proteksi arus** (pickup, kurva, time multiplier, elemen instan). Tahap ketiga (I>>>), arah, harmonik, dan kolom khusus merk **tidak dimasukkan**. Apa pun yang belum punya kolom ditulis di `setelan_lain` dan difoto di `foto_setelan`, supaya data tidak hilang sebelum struktur final.

Urutan kerja:
1. Isi dulu `merk_kontroler`, `tipe_kontroler`, `versi_firmware`, dan `foto_kontroler` di `db_Switching` untuk 19 PMT, dan minta dokumen setelan proteksi dari UP3 (sumber paling cepat; biasanya sudah per PMT).
2. Setelah 3 sampai 5 tipe rele terlihat, kolom 4a ditinjau ulang dan difinalkan (nama menu, satuan primer atau sekunder, jumlah tahap per merk).
3. Kode (sheet, form, perhitungan) dibuat **sesudah** langkah 2. Pekerjaan tiang dan segmen tidak menunggu bagian ini.

Hanya untuk switching yang bisa trip (PMT dan ACR). FCO dan LBS tidak punya setelan rele (fuse mengikuti `log_Fuse`). Setelan dipakai menghitung arus pickup dan waktu trip untuk analisis gangguan, jadi nilai disimpan dalam **primer** (ampere jaringan), dengan nilai sekunder dan rasio CT saat itu dicatat sebagai bukti.

| Kelompok | Kolom | Isi |
|---|---|---|
| Identitas | setelan_id | Kunci, dibuat sistem |
| | switching_id | Dari `db_Switching` |
| | berlaku_mulai, berlaku_sampai | Periode berlaku. Setelan yang masih berlaku punya `berlaku_sampai` kosong; setelan baru menutup yang lama |
| | sumber | dokumen UP3 / baca kontroler / setel lapangan |
| | dokumen_ref | Nomor atau tautan dokumen setelan (opsional) |
| CT | rasio_ct | Rasio CT saat setelan ini (menyalin dari `db_Switching.rasio_ct`, karena CT bisa diganti) |
| OCR (fasa) | ocr_aktif | ya / tidak |
| | ocr_kurva | DT / NI / VI / EI / LTI |
| | ocr_pickup_primer_a, ocr_pickup_sekunder_a | Arus pickup I> |
| | ocr_tms | Time multiplier (atau waktu untuk kurva DT) |
| | ocr_instan_aktif, ocr_instan_primer_a, ocr_instan_detik | Elemen instan I>> |
| GFR (tanah) | gfr_aktif | ya / tidak |
| | gfr_kurva | Sama dengan OCR |
| | gfr_pickup_primer_a, gfr_pickup_sekunder_a | Arus pickup Io> |
| | gfr_tms | Time multiplier |
| | gfr_instan_aktif, gfr_instan_primer_a, gfr_instan_detik | Elemen instan Io>> |
| Reclose (ACR) | reclose_aktif, reclose_jumlah, reclose_jeda_detik | Hanya ACR |
| Lain | setelan_lain | Teks bebas untuk setelan yang belum punya kolom (mis. tahap ketiga, arah, nama menu khusus merk) |
| | foto_setelan | Foto layar atau lembar setelan |
| | catatan | |
| Audit | aktif, revision, diubah_pada, diubah_oleh | Standar |

Catatan:
- Gangguan lama dihitung dengan setelan yang berlaku pada tanggal kejadian (`berlaku_mulai` sampai `berlaku_sampai`), bukan setelan terbaru.
- Pemeriksaan: periode setelan satu switching tidak boleh tumpang tindih; `rasio_ct` wajib terisi kalau pickup diisi dalam sekunder; setelan hanya untuk switching dengan `bisa_trip = ya`.
- Setelan mengatur kapan rele trip, bukan lokasi gangguan. Lokasi dari arus tetap memakai impedansi rantai (`db_Penghantar`) dan kapasitas hubung singkat sumber (`db_Sumber_Penyulang`).

## 5. `db_Konstruksi` (master referensi di `MASTER_SHEET_ID`)

Daftar kode konstruksi tiang (A1, B1, dan seterusnya). Tab dibuat dan didaftarkan lewat **`ADMIN_lengkapiMaster`**, seperti `db_Merk_MCB` dan `db_Jenis_Temuan`: Admin mengisi baris secara manual, lalu `ADMIN_lengkapiMaster` melengkapi `konstruksi_id` (UUID), `revision`, waktu, dan pengubah. Header didaftarkan di `skemaHeader_()`, tab masuk daftar `target` dan `opsional`.

| Kolom | Isi |
|---|---|
| konstruksi_id | UUID, dilengkapi `ADMIN_lengkapiMaster` |
| kode | Kode konstruksi (mis. A1), unik |
| nama | Nama atau uraian konstruksi |
| keterangan | Catatan |
| susunan | Opsional: susunan penghantar (segitiga / horizontal / vertikal) |
| gmd_m | Opsional: jarak rata-rata geometris antar-penghantar (m), dipakai nanti untuk reaktansi; boleh kosong |
| urutan | Urutan di dropdown |
| aktif, revision, diubah_pada, diubah_oleh | Standar |

Isi awal (dari Master Guswan, 8 Nov 2026), 14 kode: TM1, TM1-HGW, TM3, TM3-HGW, TM4, TM4-HGW, TM5, TM5-HGW, TM8, TM8-HGW, TM10, TM10-HGW, TM Kooi, TM Kooi-HGW. Penulisan "TM 10" dari daftar asli dirapikan menjadi `TM10` (menunggu konfirmasi).

Sheet konstruksi belum ada; Master Guswan baru punya isian datanya. Header di atas yang dipakai, dan Admin mengisi barisnya (kode dan nama wajib, kolom lain boleh kosong).

Temuan data: di `db_TiangMaster` sumber, `KODE_KONSTRUKSI_1` sampai `_6` pada semua 15.185 tiang TM berisi satu nilai yang sama, `A1` (kolom 2 sampai 6 hanya terisi di 6.322 baris, juga `A1`). Ini kemungkinan nilai bawaan, bukan data nyata, jadi `konstruksi_aset` tidak berguna sebagai pembanding dan konstruksi harus diisi seluruhnya dari lapangan.

## 6. Pembacaan sumber `db_TiangMaster` tahan perubahan struktur

Susunan kolom dari pusat sering berubah, jadi sinkron **tidak bergantung pada urutan kolom maupun satu nama header yang kaku**. Pola dasarnya sudah dipakai `67_AsetItb.js` (header dicari dengan nama yang dirapikan, bukan nomor kolom); di sini diperluas dengan alias yang bisa diubah tanpa deploy.

1. **Dicari berdasarkan nama, bukan posisi.** Header dirapikan (huruf besar, spasi/garis bawah/simbol disamakan, spasi tepi dibuang). Urutan kolom tidak berpengaruh dan kolom tambahan diabaikan.
2. **Baris header dicari otomatis.** Sinkron memindai beberapa baris pertama dan memakai baris yang paling banyak mengandung nama kolom dikenal, jadi baris judul atau baris kosong di atas header tidak menggagalkan.
3. **Pemetaan lewat sheet `db_Tiang_Pemetaan`** (master di `MASTER_SHEET_ID`, diedit Admin tanpa deploy):

   | Kolom | Isi |
   |---|---|
   | kolom_logis | Nama kolom di SiSi, mis. `tiang_id`, `nama`, `segmen_aset`, `lat_aset`, `lng_aset`, `jenis_tiang`, `ukuran_tiang`, `status_aset`, `kelas_area`, `ssot_number`, `konstruksi_aset` |
   | alias | Daftar nama yang dianggap sama, dipisah `\|`, mis. `LATITUDEY\|LATITUDE\|LAT` |
   | wajib | ya / tidak |
   | aktif | ya / tidak |

   Kalau pusat mengganti nama kolom, Admin cukup menambah alias di sheet ini.
4. **Kolom berpola:** `KODE_KONSTRUKSI_1`, `_2`, dan seterusnya dikumpulkan lewat awalan nama, berapa pun jumlah kolomnya.
5. **Kolom wajib** (kunci `tiang_id`, `nama`, koordinat): kalau salah satu tidak ditemukan, sinkron **berhenti sebelum menulis apa pun** dan melaporkan kolom mana yang hilang. Kolom tidak wajib yang tidak ditemukan dikosongkan dan masuk peringatan.
6. **Nilai dibaca longgar:** koordinat dengan koma desimal diterima, spasi tepi dibuang, tanggal dalam beberapa format.
7. **Laporan sinkron** (disimpan seperti `ASET_ITB_SINKRON`): kolom yang terpetakan, kolom wajib yang hilang, kolom sumber baru yang belum terpetakan, jumlah baris ditambah, diperbarui, dan "tidak ada di sumber".
8. Kolom di `db_Tiang` SiSi bernama tetap, tidak ikut berubah dengan sumber.

## Alur verifikasi tiang berurutan (HP, Admin)

1. Admin memilih penyulang, section, dan segmen, lalu menentukan **tiang awal** (tiang batas segmen, ditandai dari GPS atau dipilih dari daftar).
2. Aplikasi memandu: setelah satu tiang disimpan, tiang berikutnya diusulkan dari data aset (anak dari tiang itu menurut nama tiang). Kalau ada percabangan, Admin memilih cabang yang diikuti; cabang lain masuk daftar "belum dikunjungi".
3. Per tiang: GPS, 2 foto, data fisik, dan blok per sirkuit (induk otomatis = tiang sebelumnya di jalur).
4. Kasus khusus yang harus tersedia:
   - **Tiang ada di lapangan tapi tidak ada di data aset:** tombol "Tambah tiang" (tiang_id sementara, menunggu pencocokan).
   - **Tiang ada di data aset tapi tidak ditemukan di lapangan:** tombol "Tidak ditemukan".
   - **Koordinat aset jauh dari posisi sebenarnya:** posisi GPS lapangan yang dipakai, selisih dicatat.
   - **Segmen berikutnya kabel tanah:** di tiang `ujung_kabel` Admin memilih segmen kabel (dibuat lebih dulu, datanya diisi di form segmen). Verifikasi tiang berlanjut di segmen udara sesudahnya, dimulai dari **Tiang Awal SKTM**.
5. Di tiang batas, Admin menandai akhir segmen; sistem menghitung panjang, jumlah tiang, dan status segmen.
6. Hasil disimpan di HP, lalu disinkronkan. **Verifikasi Admin langsung berlaku** (keputusan Master Guswan 8 Nov 2026): `db_Tiang`, `db_Tiang_Sirkuit`, dan `db_Switching` langsung diperbarui, tanpa antrean persetujuan. Pengamannya: log perubahan (siapa, kapan, nilai lama dan baru) dan foto yang tersimpan. Review hanya untuk koreksi sesudahnya (status `perlu_perbaikan`).
7. Tiga kasus khusus pertama di langkah 4 disetujui. Kasus kabel tanah (revisi 10 Nov 2026) menunggu koreksi Master Guswan.

## Ditunda (struktur sudah dibahas, belum dirinci)

| Sheet | Fungsi |
|---|---|
| db_Switching_Setelan | **Sudah dirinci di bagian 4a** (10 Nov 2026, naik dari Ditunda). Tanpa pelaporan ke UP3 |
| log_Posisi_Switching | Riwayat buka/tutup, hasil manuver, rujukan ke gangguan atau P0 |
| log_Fuse | Riwayat fuselink FCO (pasang, ganti, putus, lepas) |
| db_Tiang_Verifikasi | Riwayat kunjungan lapangan per tiang beserta foto |
| db_Penghantar | Jenis penghantar dan R1, X1, R0, X0. Kuncinya pasangan jenis kabel + ukuran dari data aset ITB (termasuk N2XSEBY - 1 CORE dan NA2XSEYBY - 3 CORE untuk kabel tanah);  impedansi urutan nol dan kapasitansi kabel berbeda dari saluran udara |
| db_Sumber_Penyulang | Data GI, trafo, kapasitas hubung singkat, NGR. **Prioritas naik**: juga menyimpan kubikel outgoing (1 baris per penyulang) yang menjadi `awal` segmen kabel keluaran GI, dan dibutuhkan perhitungan arus gangguan |
| ukur_Tegangan | Satu baris per titik ukur; tegangan GI wajib diisi ulang setiap pengukuran |
| Temuan per tiang (fitur lanjutan, setelah 90 persen tiang terverifikasi) | Termasuk sambungan gawang (belit, joint, parallel group, jumlahnya, foto) sebagai temuan inspeksi |
| ggn_Verifikasi, ggn_Peralatan | Tautan gangguan ke tiang dan sirkuit, status indikasi/terverifikasi, klasifikasi selektif/tembus/dll |

## Pertanyaan terbuka


Terjawab 8 Nov: penyulang yang belum ada di `db_Jaringan` tidak boleh diusulkan dari lapangan; daftar konstruksi = `db_Konstruksi` (lihat bagian 5).

Masih terbuka:
Kolom wajib sumber (disetujui 8 Nov): `tiang_id` (ASSETNUM), `nama` (DESCRIPTION), koordinat (lat, lng); selebihnya tidak wajib.

Masih terbuka:
1. Isi daftar konstruksi (kode dan nama) dari Master Guswan untuk mengisi `db_Konstruksi`.
