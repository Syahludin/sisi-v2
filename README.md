# SiSi v2

Backend Google Apps Script + app Flutter. Fase 1: modul ROW, offline first.

**Semua aturan ada di PRD SiSi v2 (ClickUp).** Repo ini hanya kode. Lihat `docs/PRD.md`.

```
sisi-v2/
  .github/            template PR + CI (test backend, analyze & test Flutter)
  backend/            Apps Script (clasp), kode di backend/src
    src/              00_Config .. 11_Master, modules/20_ROW, 90_AdminTools
    scripts/push.js   push per env (production wajib --yakin)
  mobile/             Flutter (lihat mobile/README.md)
  docs/               PRD.md (penunjuk ke PRD), SKEMA.md, API-CONTRACT.md (penunjuk)
  templates/          xlsx untuk import ke SiSi_Master, SiSi_Auth, SiSi_ROW
  tests/              test backend (Node, tanpa koneksi Google)
```

## Status uji (diisi kvlar sesudah dicoba di staging)

| Versi | Isi | Status |
| --- | --- | --- |
| v0.71.0 | PDF BA Cloud Run (sisi-pdf-engine) | Engine: 6 tes Cloud Shell lulus, format PDF disetujui. Deploy engine + PDF dari HP: belum dilaporkan |
| v0.72.0 | Perbaikan form BA (kVA dropdown, watermark kamera, dialog simpan, hub BA, kolom error) | BELUM DIUJI |
| v0.94.1 | BELUM DIUJI: versi = 0.94.1 (+147). Kriteria GASPOL: + harkomSutm (HARKOM · SUTM, mis. Penggantian Bending Wire TM; belum ada di COL_GASPOL v1); kolom_gaspol dibaca tanpa beda huruf besar/kecil dan disimpan baku (harKeypoint = harkeypoint, mis. Penggantian Recloser). Pemerataan: nama pekerjaan diganti Pemerataan Beban Gardu / Pembagian Beban Gardu (server, HP, cekKonfig, template) | BELUM DIUJI. Backend 241 tes lulus |
| v1.0.0 | BELUM DIUJI: versi 1.0.0 (+174), aturan versi x.99 lalu (x+1).0.0 (docs/PRD.md). Backend: foto grounding (sebelum/sesudah), pemerataan (arus + tegangan sebelum/sesudah), temuan + tiang ke Drive; db_temuan_inspeksi pindah ke SiSi_Temuan (TEMUAN_SHEET_ID). HP: 2 tombol download di detail P0, kotak foto di form grounding / pemerataan (antrean offline), modul Inspeksi Jaringan petugas (Laporan Utama > penyulang utama > temuan + foto, kirim WA), Input Temuan Inspeksi admin. | Backend 261 tes lulus. Flutter belum dijalankan |
| v1.0.1 | BELUM DIUJI: versi 1.0.1 (+175). Foto grounding (sebelum / sesudah, pasang grounding = sesudah saja) dan pemerataan (arus + tegangan sebelum / sesudah) wajib di form HP. Aturan versi: tiap perubahan naik 0.0.1 (docs/PRD.md). | Backend tes lulus. Flutter belum dijalankan |
| v1.0.2 | BELUM DIUJI: versi 1.0.2 (+176). Foto temuan + foto tiang Inspeksi Jaringan wajib (petugas + admin). Guard: Laporan Utama non-AKTIF terkunci (SUDAH_BATAL), slot foto Hartek dicek kunci sendiri (tolak constructor / __proto__), tes guard tim lain / hari lain / endpoint admin. HP: WA belum siap kalau foto wajib belum lengkap, kartu temuan pakai gaya kartu Hartek, warna angka kartu laporan InsJar, judul form "Input Inspeksi Jaringan", catatan form admin online. | Backend 262 tes lulus. Flutter belum dijalankan |
| v1.0.3 | Status online/offline diperbaiki: probe ping backend tiap 15 detik, langsung cek saat login/sesi mulai, dan antrean langsung disinkronkan saat koneksi pulih. | Backend 262 tes lulus. Flutter belum dijalankan |
| v1.0.4 | Tier inspeksi ditambahkan ke db_Jenis_Temuan dan db_temuan_inspeksi. Form memilih object > tier > jenis temuan; petugas Jaringan/Gardu dikunci object-nya, admin memilih Jaringan atau Gardu. | Backend 263 tes lulus. Flutter belum dijalankan |
| v1.0.5 | BELUM DIUJI: versi 1.0.5 (+179). Inspeksi Jaringan: penyulang utama hanya 1 kolom `section` (section_awal, section_akhir, segmen dihapus dari insjar_realisasi; ADMIN_siapkanSheetInsJar menghapus kolom lama sesudah cadangan). Segmen temuan (db_temuan_inspeksi) opsional, hanya tampil / tersimpan untuk object Jaringan. Halaman utama: daftar penyulang utama dihapus; ketuk angka Penyulang = rincian semua penyulang + temuan (Tambah penyulang, Tambah temuan per penyulang); ketuk angka Temuan = temuan dikelompokkan per jenis (lihat / ubah saja). Endpoint baru ubahTemuanInsJar (petugas, hari ini, revision); uploadFotoInsJar + simpanTemuanInsJar mengirim revision. WA tanpa baris Segmen. | Backend 265 tes lulus. Flutter belum dijalankan. Deploy: push backend, ADMIN_siapkanSheetInsJar, ADMIN_bersihkanCache |
| v1.0.6 | BELUM DIUJI: versi 1.0.6 (+180). Inspeksi Jaringan: (1) temuan petugas tidak memilih section, section = section penyulang utama tempat temuan dicatat (server: section dari realisasi, klien tidak mengirim section). Admin tetap pilih penyulang + section. (2) Chip / bantuan 'Urut sesuai db_Jaringan' dihapus. (3) Foto temuan + tiang: kamera (watermark) atau galeri (tanpa watermark). (4) Rincian penyulang jadi 1 kartu per penyulang: expand / minimize, tombol + di kanan bawah untuk tambah temuan, footer tetap tampil (halaman rincian dibuka di dalam tab, bukan route baru). (5) Header seragam di semua halaman Inspeksi Jaringan dan Input Temuan Inspeksi, tombol kembali kanan atas. (6) Tambah section: satu penyulang utama = penyulang + tier + section; section berbeda di penyulang + tier yang sama jadi baris sendiri (REALISASI_GANDA bila penyulang + tier + section sama). Section terkunci setelah ada temuan (SECTION_TERKUNCI). | Backend 266 tes lulus. Flutter belum dijalankan. Deploy: push backend, ADMIN_bersihkanCache |
| v1.0.7 | BELUM DIUJI: versi 1.0.7 (+181). WA Inspeksi Jaringan: penyulang yang sama digabung jadi satu blok per tier, tiap section punya Section, Temuan, dan Jumlah Tiang, lalu Total Tiang per penyulang. Laporan UP3 bagian D. Inspeksi terisi (Jaringan = total tiang per penyulang, Gawang, komulatif bulan). Laporan UIW CARE FOR ASSET terisi dari Inspeksi Jaringan (per penyulang, rentang section, Panjang kmS, temuan Peralatan / ROW); tanpa data inspeksi tetap pakai C4A manual. | Backend 267 tes lulus. Flutter belum dijalankan |
| v1.0.8 | BELUM DIUJI: versi 1.0.8 (+182). Spreadsheet + backend Inspeksi Gardu (SiSi_InsDu: db_insdu_header, db_insdu_realisasi, db_insdu_pengukuran; db_temuan_inspeksi + no_gardu, gardu_id, temuan_asal_id). Realisasi = gardu sudah LWBP, WBP H-1 wajib lengkap sebelum Laporan Utama baru, cover gardu di LWBP, temuan belum Selesai otomatis jadi temuan LANJUTAN, pengukuran ke db_Gardu, UP3 D. Inspeksi Gardu (target 5 Unit). UI HP belum dibuat | Backend 272 tes lulus. Flutter belum dijalankan |
| v1.0.9 | BELUM DIUJI: versi 1.0.9 (+183). Inspeksi Gardu: temuan lama yang belum diperbaiki tidak disalin ulang, baris terakhir diberi penanda belum_diperbaiki, tetap tampil sebagai riwayat tertinggal di kartu gardu. Kolom no_gardu tetap tersedia di db_temuan_inspeksi. Jurusan A-D dan cos phi hanya arsip laporan. | Backend 272 tes lulus. Flutter belum dijalankan |
| v1.0.10 | BELUM DIUJI: versi 1.0.10 (+184). Backend WO tindak lanjut temuan: admin meneruskan / memindah / menarik WO ke tim aktif ROW / HARTEK / YANDAL (selama belum dimulai), tim klik Mulai = WO terkunci, catat pekerjaan (ROW diameter, Hartek banyak pekerjaan + jumlah, Yandal pekerjaan master) + foto, Selesai = masuk realisasi tim (row_Eksekusi / db_Hartek_Pekerjaan / yan_P0). Sheet db_temuan_tindak_lanjut + 13 kolom WO di db_temuan_inspeksi. Guard semua endpoint WO + kunci temuan / baris modul dari WO. UI HP belum dibuat | Backend 277 tes lulus. Flutter belum dijalankan |
| 1.0.11 | Mobile: Inspeksi Gardu (header, gardu + LWBP/cover/WBP, tunggakan H-1, temuan + temuan tertinggal), tab WO tim ROW/Hartek/Yandal, Penerusan WO admin, temuan admin object Gardu pilih gardu | 278 tes backend lulus |
| 1.0.12 | Inspeksi Gardu offline (antrean HP + kirim latar, WBP susulan lintas hari), sinkron latar Android (foreground service dataSync saat ada antrean, denyut 60 detik, sinkron saat app ke latar / kembali), izin baterai + notifikasi | 278 tes backend lulus (backend tidak berubah) |
| 1.0.13 | Perbaikan analyze: 4 case ganda di KodeError.pesan (TIM_TIDAK_VALID, FOTO_BELUM_LENGKAP, DIAMETER_DI_LUAR_KATEGORI, SECTION_TIDAK_COCOK) dihapus, pesan versi WO pindah ke pesanWo | 278 tes backend lulus (backend tidak berubah) |
| 1.0.14 | Inspeksi Gardu: tampilan sama InsJar/Hartek (kartu Laporan Utama + WA + tombol +, rincian gardu & temuan per jenis), ubah gardu / tier (ubahRealisasiInsDu), tier ganda Tier 1 & Tier 2 (Tier 2 saja tanpa LWBP/WBP), tier temuan dari tier gardu, koordinat temuan wajib (awal dari Lat/Long db_Gardu), WA format v1 | 279 tes backend lulus |
| 1.0.21 | BELUM DIUJI: versi 1.0.21 (+195). (1) Update APK: dialog langsung tampil saat Update Sekarang diketuk (cek server, unduh, periksa, buka pemasang); APK terverifikasi disimpan sehingga pemasang yang tertutup / gagal bisa dibuka lagi tanpa unduh ulang. (2-3) Halaman utama Inspeksi Jaringan / Gardu tanpa daftar penyulang / gardu (rincian lewat kartu laporan). (4) Kolom koordinat ROW + BA Pengoperasian bergaya kolom koordinat Input Temuan Inspeksi. (5) Strip login warna aplikasi. (6) Pesan Tersimpan di HP diganti pop up centang Data Berhasil disimpan. (7) Kartu pemadaman Beranda baru (blok jam, penyulang, section, daerah, dampak). (8) Master Gardu untuk tim Inspeksi Gardu (Pengaturan). (9) Kartu sinkron Beranda dihapus, tarik-untuk-refresh + tombol refresh berlogo SiSi. (10) Penerusan WO: Proses Kirim WO. (11) Temuan Inspeksi: kolom rentang tanggal selebar layar. (12) Judul Per penyulang & section tanpa keterangan. (13) Ringkasan temuan per status (belum tim / di tim / dikerjakan / selesai) di semua kondisi filter. (14) Tab Pengukuran: kartu Data Trafo + koordinat ke Google Maps, pengukuran terbaru LWBP / WBP dari 3 sumber, isi dikelompokkan arus / tegangan fasa-netral / fasa-fasa. (15) Tombol kembali rincian gardu putih. | Backend 306 tes lulus |
| 1.0.20 | BELUM DIUJI: versi 1.0.20 (+194). (1) Tab Shift Yandal rata (pil sama lebar). (2) Chip tim di login dihapus. (3) Kartu kredensial username + kata sandi baru. (4) Pengukuran Gardu admin: LWBP / WBP dibedakan (badge + saring Semua / LWBP / WBP), nomor gardu disorot, tab Rekam Jejak Trafo & Gardu. (5) Form Jadwal Padam: penyulang / section dari db_Daerah_Padam (dimuat ulang saat form dibuka). (6) Tanggal jadwal padam: kalender bertitik merah + rincian jadwal tanggal itu. (7) Notifikasi diketuk = langsung ke datanya (P0 terbuka di tanggalnya, temuan terbuka, WO terbuka). (8) Bottom bar tetap tampil di halaman rincian (navigator per tab), disembunyikan di form / keyboard / lembar bawah. (9) Laporan Hartek pola ROW: Mulai pekerjaan, kartu lokasi berisi pekerjaan + material. (10) Inspeksi Jaringan / Gardu: Mulai inspeksi, kartu penyulang / gardu langsung di laporan. (11) Cache 60 detik getNotifikasi / getKalenderTim. (12) Audit endpoint: ubahPgHartek dihapus (tidak dipakai). (13) Kartu Beranda / temuan / gardu dipoles. | Backend 305 tes lulus, flutter analyze bersih, flutter test 219 lulus |
| 1.0.19 | BELUM DIUJI: versi 1.0.19 (+193). (1) Menu Penugasan Tim dihapus. (2) Penerusan WO Temuan = Penerusan Tim Temuan Inspeksi. (3) Foto temuan tampil (bukan ikon awan) di Temuan Inspeksi admin, Inspeksi Jaringan, Inspeksi Gardu: endpoint getFotoTemuanInspeksi / getFotoTemuanInsJar / getFotoTemuanInsDu, ketuk = foto penuh. (4) Rincian per section: penyulang abjad buka / tutup > section urutan db_Jaringan > jenis temuan per baris; tab Per Jenis Temuan. (5) Ketuk section = rincian section itu saja. (6) Daftar temuan pindah ke halaman terpisah (per jenis / section / penyulang, pilih semua atau satu penyulang + cari). (7) Latar bg-sisi di Beranda, Operasi, Shift, Laporan, WO, modul tim; Pengaturan didesain ulang. (8) Login didesain ulang (alur sama). (9) Bottom bar tim ber-WO: Laporan · WO · Beranda · Arsip · Pengaturan (Beranda di tengah, arsip jadi tab sendiri). (10) Kartu laporan + Hari ini + form ROW bergaya Jaringan SiSi. (11) Endpoint dipecah per menu (foto temuan, lonceng, update) dengan helper bersama. (12) Lonceng notifikasi header: admin = P0 menunggu + temuan inspeksi baru, tim = WO dari admin, dilihat per item per akun (getNotifikasi / tandaiNotifikasi). (13) Update APK dari folder Drive (APK_FOLDER_ID, getUpdateApp): unduh dengan progres, cek ukuran + SHA-256, konfirmasi, pasang. (14) Kalender hanya di Beranda. Deploy: push + deploy backend, isi APK_FOLDER_ID, perbarui db_Menu (sejak_versi 1.0.19), ADMIN_bersihkanCache | Backend 304 tes lulus, flutter analyze bersih, flutter test 219 lulus |
| 1.0.18 | BELUM DIUJI: versi 1.0.18 (+192). (1) Desain "Jaringan SiSi" untuk semua layar kecuali login: header + app bar bergradien teal dengan motif tiang & kawat, percik kuning PLN, kartu angka, judul seksi, tema tombol pilihan / tab / menu; Beranda, Operasi, Jadwal Padam, Ringkasan Temuan dipoles khusus (fitur tidak berubah). (2) Kepemilikan WO Hartek dari db_Kepemilikan_Material. (3)+(10) db_Daerah_Padam = sumber gardu / pelanggan / daerah / VIP per section, dibuat + diisi penyulang/section db_Jaringan oleh ADMIN_lengkapiMaster. (4) ENS rupiah bulat dibulatkan ke atas (server, WA, HP, migrasi, nilai lama dirapikan). (5) OwnerId berawalan 0 tidak hilang (amanSheet_ menulis teks angka berawalan 0 sebagai teks). (6) docs/db_Menu.tsv + docs/db_Akses.tsv (satu file, kolom sejak_versi). (7) Endpoint yang disentuh dirapikan: kepemilikan satu sumber, kirimWoKeTim_, ensRupiahJp_, kodeFotoTemuan_. (8) ADMIN_migrasiInspeksiFoto: foto temuan v1 (link AppSheet / Drive) dipindah ke folder db_Temuan_Inspeksi + link Drive. (9) Nama foto lapangan pola ROW <kode>_<SLOT>.jpg, ADMIN_rapikanNamaFotoLapangan untuk file lama. (11) Kalender satu bulan di Beranda (semua akun; admin = jadwal padam). (12) Jadwal Padam: daftar ringkas per tanggal, rincian + aksi di lembar bawah. (13) Kartu Kirim WA rentang tanggal (admin). (14) Chip penyulang selalu terlihat (master + jadwal). (15) Tombol + Temuan Inspeksi: tidak membuka form ganda, master form disimpan di HP. (16) Ringkasan temuan ringkas + halaman rincian, per jenis / per section. (17) Pindah / tarik WO terkirim pindah ke menu Pindah Tim TO (getWoPindah, pindahWo), tab Terkirim Penerusan WO lihat saja. (18) Bar loading bergerak di header dihapus (loading SiSi). Deploy: push backend, impor baris sejak_versi 1.0.18 dari docs/db_Menu.tsv + db_Akses.tsv, ADMIN_lengkapiMaster, ADMIN_siapkanSheetJadwalPadam, ADMIN_bersihkanCache | Backend 301 tes lulus, flutter analyze bersih, flutter test 218 lulus |
| 1.0.17 | BELUM DIUJI: versi 1.0.17 (+191). (1) Menu admin "Temuan Inspeksi" (ikon baru): tab Input (hanya teks + tombol +) dan tab Daftar Temuan offline (getTemuanInspeksi dari/sampai maks 92 hari, disimpan di HP) dengan filter multi-pilihan jenis / tanggal / penyulang / tim + kartu ringkasan per jenis. (2) Jadwal Padam port v1 (78_JadwalPadam.js, SiSi_JadwalPadam + db_Daerah_Padam): daftar, kalender, ubah / status / hapus, format WA rentang tanggal khusus admin. (3) Kalender Tim di ROW / Hartek / Yandal / InsJar / InsDu (getKalenderTim: pekerjaan tim + WO + jadwal padam). (4) Kartu versi Pengaturan di atas Keluar, teks versi ganda dihapus. (5) Arsip Laporan Hartek / InsJar / InsDu (getArsip*, pola arsip ROW). (6) Migrasi v1: ADMIN_migrasiInspeksi* + ADMIN_migrasiJadwalPadam* (81_Migrasi_Inspeksi.js). (7) Chip "x WO Sedang Proses Kirim ke Tim" + antrean penerusan WO coba ulang otomatis saat sinyal pulih (teruskan / tarik idempoten). (8) Loading animasi logo SiSi (SisiLoader) menggantikan semua spinner. (9) Pengukuran Gardu admin: arus R/S/T/N + tegangan, ketuk gardu = pilihan History Perbaikan & Manajemen Trafo (BA, temuan + perbaikan) / Pengukuran (riwayat ukur, getRiwayatGardu). (10) WO Hartek: material menempel per pekerjaan. (11) Teks "Cukup foto Sebelum dulu" dihapus. (12) Kepemilikan WO Hartek dari db_Kepemilikan. (13) Foto temuan di kartu WO (tersimpan di HP). (14) Tab Aktif / Selesai WO Tim baru (TabStatusWo). (15) Diameter ROW: placeholder, chip muncul sesudah diisi. (16) Penguncian: temuan diteruskan tidak bisa diubah petugas inspeksi (WO_SUDAH_DITERUSKAN), section + nomor tiang temuan terkunci di WO ROW (SECTION_TERKUNCI / TIANG_TERKUNCI). (17) Notifikasi latar "SiSi Sedang Proses Sinkron Data" / "x Data Sedang Proses Sinkron". (18) Bug WO ROW: foto di HP tidak dihitung lengkap sebelum diterima server, Selesai bukan notifikasi sukses. (19) Sinkron atomik: segel laporan (segelSinkron*, log_Sinkron), WA / SIAP WA admin baru tersedia sesudah semua data diterima server; ROW: WA terkunci selama antrean header ada. (20) ADMIN_cekKonfigurasi + bagian v1.0.17. | Backend 295 tes lulus, flutter analyze bersih, flutter test 217 lulus |
| v0.99.0 | BELUM DIUJI: versi = 0.99.0 (+173). Operasi > Laporan per Tim + tim YANDAL (admin): ringkasan shift berjalan (x dari n tim sudah login), tile per tim dengan status login shift berjalan, layar per tim (pilih tanggal operasional s.d. 31 hari ke belakang): 3 kartu shift (Sudah login / Belum login + lama terlambat / Selesai / Tidak login / Belum mulai), crew, check-in, terlambat, jumlah login, HP masih login, riwayat login, rekap P0 (proses / menunggu / approved / rejected / point / jam efektif / jarak), daftar P0 + rincian, tombol ke Approval P0. Endpoint baru getLaporanTimYandal (menu ROW_LAPORAN, bukan PETUGAS, hanya baca). Tidak ada sheet / menu baru | BELUM DIUJI. Backend 255 tes lulus. Perlu flutter analyze + test + build APK, deploy backend |
| v0.98.14 | Perbaikan flutter analyze (AppColors.amber500, SisiKosong tombol, _chipSumber dihapus) | Backend 254 tes lulus; analyze dijalankan kvlar |
| v0.96.1 | BELUM DIUJI: versi = 0.96.1 (+150). Perbaikan mock test backend insertSheet untuk db_Kepemilikan_Material pada ADMIN_siapkanSheetHartek | BELUM DIUJI |
| v0.96.0 | BELUM DIUJI: versi = 0.96.0 (+149). Satuan pekerjaan & material Hartek default dari sistem (bacaSaja, tidak dapat diedit, tanpa chip), kepemilikan material dari sheet db_Kepemilikan_Material di SiSi_Master, indikator cloud hijau data terkirim ke server seperti P0 & ROW, label GASPOL disembunyikan di form/rincian/detail, perbaikan _langkah & overflow 320px | BELUM DIUJI |
| 0.95.0 | Hartek lokal + kirim otomatis (SQLite v10 hartek_lokal/hartek_antre, idBaris, coba lagi/buang), section urut kolom urutan, nomor gardu dropdown Master Gardu + koordinat otomatis, rincian lebih mudah dibaca, label Tambah Pekerjaan / Tambah Rincian Pekerjaan, ADMIN_lengkapiMaster isi ID db_Material | backend 245 lulus; flutter analyze/test dijalankan kvlar |
| v0.94.0-fix1 | Test saja (versi app / backend tetap 0.94.0, tidak perlu redeploy / build ulang): test rincian 320 px menggulir ke kartu Gardu sebelum mengetuk (dulu ketukan meleset, hanya warning) + ketukan meleset di test rincian sekarang membuat test gagal | flutter analyze bersih, flutter test lulus 154 (laporan kvlar) |
| v0.94.0 | BELUM DIUJI: versi = 0.94.0 (+146). (1) flutter analyze bersih dari temuan foto: reason: di expect test rincian, unawaited di test pop up, import dart:ui dihapus, doc comment <no>. (2) Master pekerjaan Hartek seperti v1 (db_Hartek_List_Pekerjaan: Pekerjaan, Jenis, Satuan, Kolom GASPOL): db_Jenis_Pekerjaan + jenis_pekerjaan + kolom_gaspol (ditambah ADMIN_siapkanSheetHartek di kanan). HP: pilihan pekerjaan disaring jenis lokasi, satuan dari master (tidak diketik), klasifikasi GASPOL tampil sebelum simpan, di kartu rincian, dan di detail. Server: PEKERJAAN_BEDA_JENIS, satuan master menang, db_Hartek_Pekerjaan.kolom_gaspol (baru, setelah satuan_pekerjaan), jumlah wajib kalau masuk GASPOL. ADMIN_isiGaspolHartek = isi awal kolom_gaspol kosong pakai aturan v1. cekKonfig: jenis / kolom GASPOL / satuan master salah. (3) Hartek kerja per tim (seperti ROW): dicek, sudah satu akun per tim tanpa pilih petugas; tes login + pesan cekKonfig 'akun login tim' | BELUM DIUJI. Backend 240 tes lulus. Perlu flutter analyze + test + build APK |
| v0.93.1 | BELUM DIUJI: versi app / backend / pubspec = 0.93.1 (+145). Perbaikan temuan review 14 Okt 2026. (1) Tanggal Hartek: dibaca dari kode_header (cadangan sel tanggal lewat tglSel_, aman kalau Sheets mengubahnya jadi Date), anak ditulis teks yyyy-MM-dd; ADMIN_siapkanSheetHartek memformat kolom tanggal baris kosong jadi teks (@); template xlsx kolom tanggal @. Dulu: header hilang, header dobel, PG ditolak TANGGAL_DI_LUAR_BATAS. (2) Rincian Hartek dipisah ke hartek_rincian.dart + test/hartek_rincian_test.dart (buka-tutup, material di kartu pekerjaannya, tombol aksi, tanpa hak ubah, kosong, 320 px). (3) jenisPekerjaan PG hanya Jaringan / Gardu / Non - Teknik (huruf bebas, disimpan baku), lainnya PILIHAN_TIDAK_VALID. (4) Jenis tim dinormalkan (trim + huruf besar) di sesi dan db_Akses untuk SEMUA modul; cekKonfig Hartek memberi PERHATIAN kalau db_Tim.jenis tidak persis HARTEK. Sesi lama di cache ikut nilai baru setelah CACHE_DETIK | BELUM DIUJI. Backend 235 tes lulus (4 tes baru gagal di kode v0.93.0). Perlu flutter test + build APK |
| v0.93.0 | BELUM DIUJI: versi app, versi backend (VERSI_BACKEND_), dan pubspec disamakan 0.93.0 (build +144). Rincian Hartek jadi satu layar. Jaringan / Gardu / Non-Teknik = kartu buka-tutup (jumlah lokasi, pekerjaan, material). Dibuka: lokasi > pekerjaan (nama + hasil, grounding / pemerataan) > material yang dipakai pekerjaan itu (nama, kepemilikan, jumlah satuan). Tombol + Material di tiap pekerjaan dan + Pekerjaan di tiap lokasi, langsung dari rincian. Ketuk pekerjaan = detail (grounding, pemerataan); ketuk lokasi = halaman lokasi. Hanya satu jenis = langsung terbuka. Rekap di bawah diganti nama Total material | BELUM DIUJI. Perlu flutter test + build APK |
| v0.92.1 | BELUM DIUJI: pop up berhasil (centang muncul-hilang gaya clink) diterapkan di SEMUA fitur download: foto P0 Yandal, foto tunggal (layar lihat foto), foto eksekusi ROW (unduh ulang), semua foto arsip hari ROW (hanya kalau tidak ada yang gagal; sebagian gagal tetap ringkasan di bawah tombol), arsip laporan ROW, arsip P0 Yandal, Download BA (pop up dulu lalu lembar fitur lanjutan), Download Lagi PDF BA, Download di layar PDF BA, PDF dan BA TTD di detail BA, Master Data (dialog Selesai diganti pop up), Master Gardu di Pengaturan dan di panel pengukuran gardu Yandal. Pesan gagal / kosong / izin ditolak tetap snackbar | BELUM DIUJI. Perlu flutter test + build APK |
| v0.92.0 | BELUM DIUJI: Download Foto P0 Yandal menampilkan kartu pop up berhasil (widget baru `widgets/popup_berhasil.dart`, `tampilPopupBerhasil`): kartu meletup masuk di tengah layar, centang hijau muncul-hilang-muncul-hilang gaya clink dengan cincin denyut, lalu menetap dan kartu memudar sendiri (2,6 detik, ketuk = tutup cepat, getar ringan). Isi: "Foto berhasil didownload" + jumlah foto dan album galeri. HP dengan "kurangi animasi" = centang langsung tampil tanpa kedip. Gagal / izin ditolak tetap snackbar. Tes: test/popup_berhasil_test.dart | BELUM DIUJI. Perlu flutter test + build APK |
| v0.91.1 | BELUM DIUJI: `ADMIN_siapkanSheetHartek` jadi SATU fungsi buat + sesuaikan sheet (SiSi_Master > db_Material dan 6 tab SiSi_Hartek). Tab belum ada = dibuat. Tab beda = judul lama diganti (nomor_gardu -> no_gardu, huruf besar/kecil, dibuat_pada / diubah_pada), kolom baru disisipkan di posisinya, kolom salah urutan dipindah utuh bersama datanya. Kolom asing tidak dihapus (digeser ke kanan). Cadangan spreadsheet otomatis sebelum kolom digeser (gagal = tidak ada perubahan). Baris lama: jenis_id dan master_material_id kosong diisi dari master lewat nama. Dikunci LockService, aman diulang. Opsional: `ADMIN_cekSheetHartek` = lihat rencana tanpa mengubah | BELUM DIUJI. Backend 231 tes lulus |
| v0.91.0 | BELUM DIUJI: pengembangan kolom Hartek ("Terapkan semua", kvlar 14 Okt 2026). PG + `koordinat` (GPS opsional di form lokasi). Pekerjaan + `jenis_id`: dropdown dari db_Jenis_Pekerjaan modul HARTEK (endpoint baru `getJenisPekerjaanHartek`), nama dan satuan dari master, `PEKERJAAN_TIDAK_DIKENAL` kalau di luar master. Material + `master_material_id` (HP kirim `materialId`). db_Material + `satuan`, satuan terisi otomatis di HP (server pakai satuan master kalau kosong). Pemerataan `nomor_gardu` -> `no_gardu`. Grounding hasil sebelum/sesudah = angka ohm. cekKonfigurasi Hartek cek pekerjaan HARTEK + material tanpa satuan. MIGRASI sheet lama: jalankan ADMIN_siapkanSheetHartek (v0.91.1) | BELUM DIUJI. Backend 229 tes lulus. Perlu flutter test + build APK |
| v0.90.0 | BELUM DIUJI: kartu laporan tim seragam (KartuLaporanTim: KM, koordinat, jarak, pensil kanan atas, + kanan bawah). ROW: ringkasan Rabas / Tebang Sedang / Tebang Besar + layar RingkasanRowScreen per penyulang. Hartek: kartu ringkas, rincian per jenis pekerjaan + rekap material | BELUM DIUJI. Perlu flutter test + build APK |
| v0.89.0 | BELUM DIUJI: desain ulang semua layar Hartek tanpa chip: kartu odometer Laporan Utama (KM awal/akhir, jarak tempuh, jumlah lokasi/pekerjaan/material, isian yang belum lengkap), daftar lokasi berikon per jenis, garis waktu pekerjaan, daftar material, grounding sebelum vs sesudah, batang beban R/S/T + selisih beban, form berkartu dengan ubin jenis pekerjaan, isian berdampingan, tombol GPS di kolom. File baru hartek_gaya.dart. Backend: getHartekHarian kirim jumlahGawang | BELUM DIUJI. Perlu flutter test + build APK |
| v0.88.0 | BELUM DIUJI: layar HP Hartek (tab Hartek untuk petugas HARTEK, menu OPS_HARTEK_INPUT): buat/ubah Laporan Utama, tambah PG, pekerjaan, material, grounding, pemerataan (online). Backend: getHartekHarian kirim revision dan isi header. Belum ada: offline, foto, edit/hapus pekerjaan, WA | BELUM DIUJI. Perlu build APK dan uji di HP petugas HARTEK |
| v0.88.4 | Desain mobile Hartek: Laporan Utama > lokasi PG > pekerjaan > material. Form layar penuh, pencarian pilihan, GPS tanpa chip, satu tombol simpan, error per isian dan detail pengukuran yang bisa dibuka saat diperlukan. Skema sheet dan backend tidak diubah. | 226 tes backend lulus. Flutter SDK tidak tersedia di lingkungan pengerjaan: analyze, widget test, build APK, dan uji perangkat BELUM dijalankan. |
| v0.88.3 | BELUM DIUJI: ADMIN_siapkanSheetHartek ikut membuat db_Material di SiSi_Master (kalau belum ada) dan mengecek strukturnya; 6 tab Hartek tetap di SiSi_Hartek | BELUM DIUJI |
| v0.88.2 | BELUM DIUJI: ADMIN_cekKonfigurasi dirapikan (bagian per sheet, penanda [OK] / [PERHATIAN] / [GAGAL] / [DILEWATI], ringkasan akhir) dan ditambah bagian Hartek (tab, db_Material, db_Jaringan, menu / akses, tim dan akun petugas HARTEK) | BELUM DIUJI. Jalankan ADMIN_cekKonfigurasi setelah deploy |
| v0.88.1 | BELUM DIUJI: db_Material pindah ke SiSi_Master (satu master), tidak lagi di SiSi_Hartek. Tab db_Material di SiSi_Hartek boleh dihapus | BELUM DIUJI |
| v0.87.0 | BELUM DIUJI: modul Hartek inputan petugas (backend). Spreadsheet SiSi_Hartek (HARTEK_SHEET_ID), 7 tab + db_Material, endpoint getMaterialHartek / getHartekHarian / getJaringanHartek (dropdown dari db_Jaringan) / buatHeaderHartek / ubahHeaderHartek / simpanPgHartek / simpanPekerjaanHartek / simpanMaterialHartek / simpanGroundingHartek / simpanPemerataanHartek (menu OPS_HARTEK_INPUT). Belum ada: edit/hapus, foto, teks WA, GASPOL, layar HP. Deploy backend: ADMIN_siapkanSheetHartek, tsv menu + akses, tim HARTEK, akun PETUGAS |
| v0.86.0-fix2 | BELUM DIUJI: perbaikan audit guard 13 Okt 2026 (docs/AUDIT-GUARD.md). Backend saja, versi tetap 0.86.0 (HP tidak perlu update): token akun / tim nonaktif ditolak dan diingat 5 menit (tidak baca sheet lagi, ikut epoch ADMIN_bersihkanCache), cache sesi / aturan akses korup dibaca ulang dari sheet (fail closed), flag tulis dihapus dari login + mulaiShiftYandal, 4 test baru (209). Deploy backend |
| v0.86.0 | BELUM DIUJI: Arsip BA v1 (BACA SAJA) untuk tracking. ADMIN_cekArsipBa (pratinjau) -> ADMIN_migrasiArsipBa: Rekap Gardu + Rekap Switching lama disalin ke sheet arsip_BA_V1 (GARDU_SHEET_ID, ditulis ulang utuh, aman diulang). HP: Berita Acara > Lihat BA & PDF jadi satu halaman BA v2 + arsip v1 (urut tanggal, filter Semua / SiSi v2 / Arsip v1, cari no gardu bebas tb414, Muat lagi, BA lama = lembar baca saja: lihat PDF + BA TTD lewat server, salin link, Semua BA gardu ini) + tombol Lihat semua BA gardu ini di detail gardu. Push backend, deploy, APK |
| v0.85.1 | Perbaikan analyze: 3 warning strict_raw_type di pemakaian_model.dart (whereType<Map<dynamic, dynamic>>). fix1: docs/android/root.build.gradle.kts (compileSdk 36 untuk plugin, error file_picker checkReleaseAarMetadata + peringatan javac disembunyikan). fix2: + -XDsuppressNotes (note deprecated API), GRADLE_OPTS native access di README mobile. Tidak ada perubahan fitur. Push backend + APK |
| v0.85.0 | BELUM DIUJI: menu Operasi > Pemakaian Engine aktif (gabungan pantau pemakaian, kartu di Pengaturan dihapus). Ringkas + Apps Script (pemicu, UrlFetch, riwayat 7 hari) + Cloud Run per layanan (request, vCPU-detik, GiB-detik hari ini + bulan ini, % free tier) dari Cloud Monitoring. CLOUD_RUN_PROJECT, MONITOR_SERVICE_ACCOUNT (opsional, default FCM_SERVICE_ACCOUNT), role Monitoring Viewer. Deploy backend + APK |
| v0.84.0 | BELUM DIUJI: pantau pemakaian kuota. Waktu jalan semua pemicu + UrlFetch + engine PDF dicatat per hari (perkiraan), rem otomatis (salin / cek foto migrasi berhenti di 80%, pengingat + sinkron gardu di 95%, rekap tidak pernah), notifikasi admin 80% / 95%, sheet log_Pemakaian, kartu Pemakaian Server di Pengaturan admin. PAKET_GOOGLE (GMAIL / WORKSPACE), ADMIN_pasangPemicuPantauPemakaian, ADMIN_cekPemakaian. Deploy backend + APK |
| v0.83.0 | BELUM DIUJI: notifikasi push FCM. Pengingat login ke HP terakhir yang login di tiap akun tim YANDAL (menit 0 + 30 sesudah shift mulai kalau tim belum login), peringatan ke HP admin sesudah 60 menit. Setup Firebase (mobile/README.md bagian FCM), Script Property FCM_SERVICE_ACCOUNT, ADMIN_siapkanNotifikasi, ADMIN_ujiNotifikasi, ADMIN_pasangPemicuPengingatYandal. `flutter pub get`, deploy backend |
| v0.82.1 | BELUM DIUJI: ADMIN_cekKonfigurasi + bagian Migrasi P0 (MIGP0_SUMBER_ID bisa dibuka + tab + jumlah baris, periode, folder foto lama, flag TRUE yang aktif). Push backend |
| v0.82.0 | BELUM DIUJI: migrasi Yandal P0 v1 -> v2 dari SATU file gabungan (v1 aktif + ARSIP): ADMIN_migrasiP0Cek (dry-run, migp0_Cek + migp0_Ringkas) -> ADMIN_migrasiP0Jalan (yan_Shift / yan_P0 / yan_Switching / yan_Gardu, rekap langsung) -> ADMIN_migrasiP0Foto (salin + sha256). Rollback ADMIN_migrasiP0Hapus. Lihat docs/MIGRASI.md. Deploy backend |
| v0.81.1 | BELUM DIUJI: kartu Versi Aplikasi di Pengaturan (versi besar, PRODUCTION / STAGING, versi server, status, Cek Pembaruan). HP mengirim versiApp; WAJIB_VERSI_APP = YA menolak app lama (termasuk production v0.50.0) dengan UPDATE_APLIKASI_DULU. Deploy backend |
| v0.81.0 | BELUM DIUJI: notifikasi update versi saat app dibuka / kembali dibuka / backend baru di-deploy. Versi backend (09_Versi.js) = versi app (dicek test). Wajib update kalau app < VERSI_APP_MINIMUM (default = versi server), selain itu boleh Nanti. LINK_UPDATE_APP + CATATAN_UPDATE_APP opsional. Cek Pembaruan di Pengaturan. Deploy backend |
| v0.80.0 | BELUM DIUJI: db_Gardu dirombak (10 kolom pengukuran di tengah, sesudah Waktu Beban) lewat ADMIN_rombakDbGardu, properti sinkron SHEET_GARDU_ULP / SHEET_GARDU_ES / SHEET_GARDU_UP3, BA TTD dibagikan ke akun EAM_EMAIL + Link BA di pesan EAM (ADMIN_bagikanTtdKeEam untuk file lama). Deploy backend |
| v0.79.0 | BELUM DIUJI: db_Gardu + 10 kolom pengukuran (Beban R/S/T/N, Tegangan R-S..T-N), sinkron harian 05:00 db_Gardu <-> Master_Gardu lama (identitas ikut db, pengukuran terbaru menang), 1. DATA TRAFO + INPUT TBL ikut. Deploy backend, ADMIN_siapkanSheetGardu, isi SHEET_GARDU_ULP / _ES / _UP3, ADMIN_cekSinkronGarduLama, ADMIN_pasangPemicuSinkronGardu |
| v0.78.0 | BELUM DIUJI: Daftar BA filter (urut, rentang Tanggal BA, jenis, status + jumlah), kartu = Lihat Detail / Download lalu fitur lanjutan, Detail BA 4 langkah: PDF, Upload BA TTD (ulang kalau PDF dibuat ulang), Kirim EAM format v1 + file TTD, Update Master Gardu. `flutter pub get` (file_picker), deploy backend |
| v0.77.0 | BELUM DIUJI: foto + PDF BA satu folder per gardu `Gardu / <No Gardu> / <YYYY-MM-DD>_<Jenis BA>` (foto `<No Gardu>_<Bagian>.jpg`), upload sebelum simpan lewat `Gardu / _Upload Sementara`, BA lama dipindah lewat ADMIN_rapikanFolderBaGardu. Deploy backend (HP tidak berubah) |
| v0.76.1 | Audit guard semua endpoint: rem per menit untuk cekSesi / logout / getMaster / getKodeRow / getLaporanRow, peran dicek paling awal di 5 endpoint baca ROW, test audit baru. Deploy backend |
| v0.76.0 | BELUM DIUJI: BA: keterangan nomor & teks foto dihapus, Lihat foto, PDF dilihat / download di aplikasi (tanpa Drive), Edit BA, simpan BA di latar belakang. `flutter pub get` (pdfx, share_plus), deploy backend |
| v0.75.1 | BELUM DIUJI: dialog Setujui baru (tanpa rincian rumus), Arus Maks per Fasa = arus nominal kVA x 1000 / (akar 3 x 400 V), pilihan gardu sesuai section P0, tampilan Rank Yandal baru (podium). Deploy backend |
| v0.75.0 | BELUM DIUJI: foto switching/gardu langsung (draf, simpan bersamaan), indikator tetap highlight, chip gardu dihapus, menu Approval P0 (setujui/tolak/koreksi jenis), toggle Pengukuran Gardu 2 Hari Sekali. Tambah baris db_Menu dari docs/db_Menu.tsv lalu deploy |
| v0.74.0 | BELUM DIUJI: Pengecekan Gardu (yan_Gardu). Jalankan ADMIN_perbaruiYanShift (buat tab yan_Gardu), tambah "Pengecekan Gardu" di db_Jenis_Pekerjaan modul YANDAL, uji 1 P0 di HP |
| v0.73.0 | Pesan nomor gardu per BA (res_NomorGardu) | BELUM DIUJI (perlu ADMIN_siapkanSheetGardu + uji 2 akun admin) |

## 0. Alat yang perlu ada di laptop

- Git, Node.js 20+, VS Code
- Flutter stable (`flutter doctor` hijau untuk Android)
- clasp: `npm i -g @google/clasp` lalu `clasp login`
- Aktifkan Apps Script API: https://script.google.com/home/usersettings

## 1. Repo

```bash
# ekstrak zip sejajar dengan repo lama:
#   folder-kerja/SiSi-ULP-Toboali   (lama, cuma dibaca)
#   folder-kerja/sisi-v2            (baru)
cd sisi-v2
git init -b main
npm test                      # semua harus lulus, 0 gagal (paket v0.88.4: 226 test backend)
git add . && git commit -m "kerangka sisi-v2"
# buat repo GitHub PRIVATE bernama sisi-v2, lalu:
git remote add origin <url-repo-private>
git push -u origin main
```

Buka `sisi.code-workspace` di VS Code. Tempel link PRD di `docs/PRD.md`.
Di GitHub: Settings > Branches > lindungi `main` (wajib PR + check `test` hijau).

## 2. Spreadsheet (staging dulu)

1. Buka `SiSi_Master` > File > Import > Upload `templates/SiSi_Master_template.xlsx` > **Replace spreadsheet**.
2. Buat Google Sheet `SiSi_Auth` di folder yang sama, import `templates/SiSi_Auth_template.xlsx` dengan cara sama.
3. Kolom `kode` di `db_Tim`: Format > Number > **Plain text**.
4. Buat Google Sheet `SiSi_ROW` di folder ROW, import `templates/SiSi_ROW_template.xlsx` (Replace spreadsheet).
   Proteksi semua sheet-nya (Data > Protect sheets): hanya pemilik script yang boleh edit. Isi `ROW_SHEET_ID` di Script Properties.
5. **Yandal (v0.63.0)**:
   - `SiSi_Master` > File > Import > `templates/SiSi_Master_tambahan_v0.63.xlsx` > **Insert new sheet(s)** (data lama tidak tersentuh). Isi 40 petugas di `db_Petugas` (kolom `tim_yandal` boleh `YANDAL 13` / `13`).
   - `db_Tim`: tambah 5 baris jenis `YANDAL` (YANDAL 13 s.d. 17, kode 13-17). `db_Users`: tambah 5 akun PETUGAS, `tim_id` = tim YANDAL-nya. `db_Menu`: tambah baris dari `docs/db_Menu.tsv`.
   - Buat Google Sheet `SiSi_Yandal`, import `templates/SiSi_Yandal_template.xlsx` (Replace spreadsheet), proteksi, isi `YANDAL_SHEET_ID` di Script Properties.
   - v0.65.0: buat folder Drive privat untuk foto P0, isi ID-nya di Script Property `YANDAL_FOTO_FOLDER_ID`.
   - P0 ada di file yang sama (sheet yan_P0 66 kolom + _keterangan_yan_P0). Jenis pekerjaan YANDAL (+ bobot) di `SiSi_Master_template.xlsx` sheet db_Jenis_Pekerjaan (lihat _keterangan_jenis). yan_P0 lama 48 kolom cukup `ADMIN_perbaruiYanShift`.
   - Jalankan `ADMIN_lengkapiMaster`, set password 5 akun, lalu `ADMIN_bersihkanCache`.
6. **Gardu + BA (v0.67.0)**:
   - Isi Script Property `GARDU_SHEET_ID` = ID spreadsheet *Pengukuran Gardu Toboali* (bagian di URL antara `/d/` dan `/edit`).
   - Deploy, lalu jalankan `ADMIN_siapkanSheetGardu`: membuat tab `Rekap_BA` + `db_Gardu` (spreadsheet gardu, diproteksi) dan `db_Pejabat_BA` (SiSi_Master). Tab lama tidak disentuh. Aman dijalankan ulang (yang sudah ada hanya dicek).
   - Isi `db_Pejabat_BA` (nama, jabatan, peran PEMERIKSA / MENGETAHUI, aktif), lalu `ADMIN_lengkapiMaster` + `ADMIN_cekKonfigurasi`.
   - Jangan sisipkan / ubah / pindah kolom di `Rekap_BA` dan `db_Gardu` (struktur dikunci, server menolak menulis).
   - **v0.68.0 migrasi gardu lama** (sekali, sebelum BA v2 dipakai): jalankan `ADMIN_cekMigrasiGardu` (pratinjau, tidak menulis) dan baca log-nya: jumlah gardu, status, nomor terakhir per prefix, PERINGATAN (section tidak cocok db_Jaringan, koordinat rusak) dan BLOKIR (No Gardu ganda / kolom bergeser). Perbaiki BLOKIR di Master_Gardu, cek ulang, lalu `ADMIN_migrasiGardu`. Master_Gardu & Rekap Gardu hanya dibaca. Aman diulang: hanya No Gardu yang belum ada di db_Gardu yang ditambah.
   - **v0.69.0 menu Gardu**: `db_Menu` tambah baris dari `docs/db_Menu.tsv` (OPS_PENGUKURAN_GARDU kalau belum ada, OPS_BA_GARDU), `db_Akses` opsional dari `docs/db_Akses.tsv` (ADMIN / SUPER sudah tercakup baris `*`), lalu `ADMIN_bersihkanCache`. HP: Pengaturan > **Master Gardu** > Download, lalu Operasi > Pengukuran Gardu / Berita Acara.
   - **v0.70.0 BA Pengoperasian Trafo**: buat folder Drive privat untuk foto BA, isi ID-nya di Script Property `GARDU_FOTO_FOLDER_ID`. OwnerId otomatis dibaca dari tab `OwnerId` di file gardu lama (`GARDU_LAMA_SHEET_ID`, kosong = `GARDU_SHEET_ID`). `db_Pejabat_BA`: minimal 1 PEMERIKSA aktif + tepat 1 MENGETAHUI aktif. Deploy, `ADMIN_cekKonfigurasi`, lalu di HP: Pengaturan > Master Gardu > Download, Operasi > Berita Acara > Pengoperasian Trafo.
   - v0.68.1 **staging** (file gardu staging beda dengan file asli): isi Script Property `GARDU_LAMA_SHEET_ID` = ID file asli *Pengukuran Gardu Toboali*. Master_Gardu + Rekap Gardu dibaca dari sana (tidak pernah ditulis), db_Gardu tetap ditulis ke `GARDU_SHEET_ID`. Production: kosongkan (otomatis = `GARDU_SHEET_ID`). `ADMIN_cekKonfigurasi` memeriksa kedua tab ada.

## 3. Apps Script (staging)

1. Buat project Apps Script baru (standalone). Salin `backend/.clasp.staging.example.json` jadi `backend/.clasp.staging.json`, isi Script ID. File ini lokal (tidak ikut git/zip).
2. Project Settings > Script Properties, isi sesuai PRD **7. Staging** (ENV, MASTER_SHEET_ID, AUTH_SHEET_ID, KODE_ULP, ADMIN_EMAIL; ROW_* boleh kosong dulu; PBKDF2_ITERASI opsional, default 5000).
3. `npm run push:staging`

### Redeploy (URL /exec tetap)

Sekali saja: salin `backend/.deploy.example.json` jadi `backend/.deploy.json`, isi deployment ID (bagian di antara `/s/` dan `/exec` di URL). Lalu setiap rilis:

```powershell
npm run deploy:staging -- "staging v0.20 · cek platform"
```

Perintah ini push kode lalu `clasp deploy -i <ID>` ke deployment yang sama. Production: `npm run deploy:production -- "deskripsi"` (sudah memakai --yakin).
4. Di editor Apps Script jalankan berurutan:
   - `ADMIN_cekKonfigurasi`
   - isi master di Sheet, lalu `ADMIN_lengkapiMaster` (isi UUID, revision, dll)
   - set password: isi Script Properties `SETPW_USERNAME` + `SETPW_PASSWORD`, jalankan `ADMIN_setPassword`
     (kedua property otomatis terhapus). Atur `PBKDF2_ITERASI` supaya login < 2 detik.
5. Deploy > New deployment > Web app. Execute as: **Me**. Who has access: **Anyone**.
   Salin URL `/exec` ke `mobile/env/staging.json`. Catat nomor `@n` di PRD 10. Riwayat Perubahan.

Production: ulangi dengan project & spreadsheet production, `npm run push:production`.

## 4. Flutter

Lihat `mobile/README.md`.

### Paket desain Hartek v0.88.4

Perubahan ada di `mobile/lib/features/hartek/hartek_screen.dart` dan
`hartek_form.dart`. Backend, endpoint, skema spreadsheet, setup sheet, serta
lokasi `db_Material` di SiSi_Master tetap seperti v0.88.3. Nomor versi runtime
backend dan `pubspec.yaml` tidak dinaikkan oleh paket desain ini.

- Laporan hari ini menampilkan ringkasan perjalanan; koordinat/kendala dibuka
  sesuai kebutuhan. PG dan pekerjaan dibuka sebagai halaman detail, bukan
  kartu bertumpuk. Kode teknis menjadi informasi sekunder.
- Semua form layar penuh; satu tombol simpan di bawah, label yang jelas,
  pilihan penyulang/section/material yang dapat dicari, tanpa chip dekoratif.
  Pengukuran grounding/pemerataan tetap tersedia di detail pekerjaan.
- GPS memakai pengambilan titik yang sudah ada di aplikasi (termasuk penolakan
  lokasi palsu); akurasi berupa teks, bukan chip. Diperlukan izin lokasi perangkat.
- Save menunggu respons server; jika validasi ditolak, isian tetap ada dan
  diarahkan ke field bermasalah. Angka tidak valid tidak diubah menjadi nol.
  Pilihan section lama dikosongkan saat penyulang berubah. Ketukan simpan ganda diblokir.
- Konflik revisi, laporan yang sudah ada, atau respons jaringan yang tidak pasti
  meminta kembali/refresh, tanpa retry otomatis yang bisa menggandakan data.
  Tidak ada antrean offline baru atau penyimpanan draft permanen.
- Koordinat/KM/kendala yang sudah terisi tidak bisa dikosongkan dari form edit,
  karena endpoint lama mengabaikan nilai kosong. Form menjelaskan penolakan ini.
  Tidak menambahkan hapus header/PG, edit pekerjaan/material, foto, maupun WA.

Validasi paket: **226 tes backend lulus**. Pemeriksaan source lokal bukan
pengganti Dart analyzer. Flutter SDK tidak tersedia di lingkungan pengerjaan,
jadi perintah berikut **belum dijalankan**:

```bash
cd mobile
flutter pub get
flutter analyze
flutter test test/hartek_ui_test.dart
flutter test
```

Test baru mencakup validasi angka/koordinat, section bergantung penyulang,
error server yang mempertahankan isian, penolakan simpan ganda, sukses,
timeout, peringatan sebelum keluar, dan ukuran layar sempit.
Lanjutkan build staging sesuai `mobile/README.md`, lalu uji navigasi penuh
header > PG > pekerjaan > material, GPS, keyboard terbuka, teks diperbesar,
master kosong, kehilangan koneksi, pergantian tanggal, dan dua perangkat
sebelum memakai paket ini di production. Pratinjau browser pendamping adalah
simulasi desain dengan data contoh, bukan hasil render Flutter atau APK.

## Aturan kode v2 (ringkas, lengkapnya di PRD 3. Prinsip & 6. Endpoint)

- Hanya `doPost`, `doGet`, `rpc`, dan `ADMIN_*` yang publik. Selain itu wajib berakhiran `_`.
- Endpoint baru: tulis dulu di PRD, lalu satu baris di `endpoints_()` (02_Router.js) dengan `menu` & `tulis`.
- Urutan di setiap endpoint: validasi_ -> cek kepemilikan -> denganLock_ -> tulis -> auditLog_.
- `username`/`ulp`/`tim` selalu dari sesi, tidak pernah dari `data`.
- Tidak ada fungsi ganda, tidak ada overlay, tidak ada kode top-level yang memanggil file lain.
- Tidak ada ID spreadsheet/folder, token, atau password di kode.
