## v1.0.58 Daftar WO selisih (Penerusan WO / Pindah Tim TO / Peta Temuan)

- `getWoAdmin`, `getWoPindah`, `getPetaTemuan` `{ status?, dari?, sampai?, sejak?: ISO }`. Setiap jawaban memuat `kursor` (ISO, waktu server sebelum sheet dibaca) dan `selisih` (boolean).
- Tanpa `sejak` = jawaban penuh seperti sebelumnya (maks 500 temuan terbaru). Dengan `sejak` = hanya temuan yang berubah sesudah `sejak` dikurangi 3 menit (tumpang tindih): baris temuan, pekerjaan tindak lanjutnya, atau klaim `db_wo_ganda`. `status` diabaikan, `dari` / `sampai` berlaku, tanpa batas 500. `ringkas` dan `tim` selalu penuh.
- Klien menyimpan jawaban penuh per akun + rentang, menggabung selisih per `temuanId`, memakai `kursor` sebagai `sejak` berikutnya.
- `getWoPindah` memaksa status `TERKIRIM`, kecuali `status: 'SEMUA'` (sinkron lokal HP).
- `sejak` salah format = `FORMAT_SALAH`. Jawaban dengan `sejak` tidak disimpan ke MySQL (jawaban jadi hanya untuk panggilan penuh).
- `ubahBaris_` / `tulisBlok_` mengisi `timestamp_update` otomatis pada tab yang punya kolom itu.

## v1.0.56 Data Aset (ITB, website admin; rancangan `docs/superpowers/specs/2026-11-02-data-aset-design.md`)

- `getDataAset {}` (admin, menu `OPS_DATA_ASET`, cache 30 menit): isi master `db_Aset_ITB` di file `SISI_ITB_SHEET_ID` (master ITB SiSi).
  Jawaban `{ sinkron: { waktu, bulan, judul, itbSheetId, ringkas } | null, segmen: [{ id, cx, cxUnit, pny, desc, status, akhir, jenis, kategori,
  panjang, ukuran, pnyLap, sumber, gardu, ket, hilang, bulan }] }`. `pny` = penyulang menurut ITB (CXPENYULANG, tab EAM), `pnyLap` = penyulang
  menurut DESCRIPTION (tab Lapangan; `sumber` GARDU | SECTION | UJUNG | BELUM | MANUAL), `kategori` SUTM | SKTM | LAINNYA, `hilang` = segmen
  tidak ada di file ITB bulan terakhir. Rekap / kartu dihitung di browser (`web/src/asetItb.js`).
- `sinkronDataAset {}` (admin, menu `OPS_DATA_ASET`, akses UBAH): menyinkronkan file ITB di Script Property `MASTER_ITB_SHEET_ID` (sheet `Data_Penyulang`, file ITB tidak diubah)
  ke master di `SISI_ITB_SHEET_ID`. Tidak menerima isian apa pun (ID sumber hanya dari properti). Upsert per `kunci` (`CXPENYULANG|DESCRIPTION|JENIS_KABEL|UKURAN_KAWAT`)
  ke master di dalam lock. Jawaban `sinkron` dengan `ringkas { tambah, ubah, sama, hilang, pulih, belum, lainnya }`. File kosong / tanpa
  `Data_Penyulang` / header salah = galat dan master tidak berubah. Siapkan tab sekali: editor `ADMIN_siapkanSheetAsetItb`.
- Keterangan baris master: `Tidak ada di ITB <bulan>` (segmen hilang) dan `Konflik gardu: ...` ditulis sistem; catatan manual ditaruh sesudah ` | ` dan tidak ditimpa.

## v1.0.51 Cover Gardu + Rincian Jenis Temuan (website admin)

- `getCoverGardu {}` (admin, menu `OPS_REKAP_GANGGUAN`, cache 30 menit): gardu AKTIF `db_Gardu` dengan 7 isian cover.
  Jawaban `{ gardu: [{ no, penyulang, section, alamat, nilai: [7 isian] }] }`, urut `nilai`: Cover FCO Atas, FCO Bawah, Bushing TM,
  Bushing TR, Arrester, Jumperan Atas, Jumperan Bawah. Klasifikasi dihitung di browser (`web/src/coverGardu.js`):
  Full Cover = 7 komponen "Lengkap" (Jumperan Atas / Bawah juga "A3CS" / "Protective Sleeve"); BTS = alamat memuat kata "BTS".
- `getRekapJenisTemuan { dari?, sampai? }` (admin, menu `OPS_PETA_TEMUAN`, cache 30 menit): temuan inspeksi pada rentang tanggal,
  TANPA batas 500 seperti `getPetaTemuan`. Jawaban `{ dari, sampai, baris: [{ penyulang, section, jenisTemuan, tier, jumlah }] }`
  (jumlah = baris temuan per penyulang + section + jenis + tier). Pivot per Section + filter di browser (`rekapJenisTemuan`).
  Satuan volume: tebang = Btg, pohon / rabas / pangkas / vegetasi = Gwg, lainnya = Titik.
- `getCheckpoint { bagian: har|cover|gangguan|temuan, tahun? }` (admin, menu `OPS_CHECKPOINT`, cache 30 menit; port v1 Data Pendukung
  CheckPoint). tahun 2022 .. tahun ini (bawaan tahun ini; tahun berjalan s.d. hari ini).
  - `har` -> `{ tahun, kolom, baris, penyulang }` = rekap GASPOL tahun itu; matriks kriteria x bulan / minggu (minggu = ceil(tanggal / 7)) di browser.
  - `cover` -> isi `getCoverGardu`; `gangguan` -> isi `getHistoriGangguan`; `temuan` -> isi `getRekapJenisTemuan` (rentang = tahun itu).
  - Filter Penyulang + Section (pangkal = ruas sebelum '-', sama v1) + jenis temuan disaring di browser (`web/src/checkpoint.js`).
- Website: menu Checkpoint Jaringan (halaman `checkpoint`, `?tab=&penyulang=&section=&tahun=`): sub-tab Har, Cover Gardu, Gangguan
  Penyulang, Rekap Temuan Inspeksi. db_Menu `OPS_CHECKPOINT` platform harus `KEDUANYA` / `WEB`. Tab Cover Gardu di History Gangguan dihapus
  (pindah ke Checkpoint). Temuan Inspeksi tab "Peta Temuan" dan "Rincian Jenis Temuan" (`?tab=rincian`): penyulang satu pilihan,
  jenis temuan pilihan ganda (kotak centang). Kode versi backend / HP tidak dinaikkan.
- Editor Apps Script: `ADMIN_cekMigrasiCoverGardu` (pratinjau) lalu `ADMIN_migrasiCoverGardu`: 7 isian cover dari Master_Gardu file
  `SHEET_GARDU_ULP` (kolom FP-FV) ke db_Gardu, dicocokkan No Gardu, HANYA sel kosong diisi (sumber hanya dibaca, aman diulang).

## v1.0.50 Request P0 ke Command Center (Yandal, HP)

- `requestP0Cc { p0Id }` (PETUGAS YANDAL, MOBILE, mode sync boleh): P0 yang sudah ada di yan_P0 ditambahkan SEKALI ke tab
  `P0_PENUGASAN` spreadsheet Command Center (Script Property `CC_SHEET_ID`). Sudah pernah = jawaban lama.
  Jawaban `{ p0Id, ccId, noP0, status, approvedBy, waktuMulai, fotoMulai, update, waktuRequest }`.
  - `id` P0-yyyyMMdd-nnnn, `no_p0` `<CC_PREFIX_P0, bawaan TBL>-nnnn`, `sumber` request_yantek, `status` Open.
  - `yantek_id` / `created_by` = kolom `cc_yantek_id` / `cc_user_id` db_Users akun yang login (kosong = CONFIG_TIDAK_LENGKAP).
  - `foto_url` = salinan foto P0 pertama (Sebelum > Pekerjaan > Sesudah) di `CC_FOTO_FOLDER_ID` (kosong = tanpa foto).
  - Belum diisi (dibahas nanti): `ref_titik_id`, `prioritas`, `deadline`; `approved_by`, `foto_mulai`, `waktu_mulai` diisi Command Center.
- `getStatusP0Cc { p0Ids: [maks 50] }`: baca balik baris P0_PENUGASAN; perubahan dicatat ke kolom CC yan_P0. Jawaban `{ p0: [...] }`.
- yan_P0 + 9 kolom di ujung kanan (`CC Id`, `CC No P0`, `CC Status`, `CC Approved Oleh`, `CC Waktu Mulai`, `CC Foto Mulai`,
  `CC Request Oleh`, `CC Waktu Request`, `CC Update`), ditambah otomatis saat sheet pertama kali dibaca.

## v1.0.49 BA Switching (5 jenis, sama v1)

- Jenis: Pengoperasian / Penggantian / Relokasi / Pemeriksaan / Kerusakan Switching. `Rekap_BA` Jenis Peralatan = SWITCHING. Nomor: ID BA `BA-SWC-TBL-YYYYMM-NNN`, No BA Full `No. NNN / BA - SWC / ULP - TBL / M / YYYY` (melanjutkan Rekap Switching v1).
- `simpanBaGardu`: `{ baId, jenis, tanggalBa, tanggalPekerjaan, jenisSwitching (LBS Motorized | Recloser | Fuse Cut Out (FCO) | Disconnecting Switch (DS)), namaSwitching (diketik), sectionId, merk?, tipe?, seri?, koordinat?, catatan?, petugas1Id, petugas2Id?, installId? }`. Penggantian / Relokasi + `jenisSwitchingSesudah, namaSwitchingSesudah, sectionIdSesudah, merkSesudah?, tipeSesudah?, seriSesudah?, koordinatSesudah?, asalSwitching?`. Pemeriksaan / Kerusakan + `kerusakan?` (kolom Kesimpulan). Tanpa OwnerId / External Reference; Master Gardu tidak diubah.
- Foto `uploadFotoBaGardu` slot: NAMEPLATE (opsional), KONSTRUKSI (wajib), SLD_SEBELUM + SLD_SESUDAH (wajib); Penggantian / Relokasi + NAMEPLATE_SESUDAH (opsional), KONSTRUKSI_SESUDAH (wajib).
- `ubahBaGardu`: field sama (tanpa jenis / tanggalBa) + `revision`, `alasan?`. `getBaGardu` + jenisSwitching, namaSwitching, tipe, kerusakan, data sesudah.
- PDF engine `/v2/ba/switching` (semua jenis, `BA-Switching-<ID BA>.pdf`). Folder Drive `Switching/<Nama Switching>/<YYYY-MM-DD>_<Jenis>`.
- `kirimEamBaGardu` / `updateMasterGarduBa` switching = `JENIS_BA_BELUM_TERSEDIA`.

## v1.0.46 BA Pemeriksaan Trafo (sama v1)

- `simpanBaGardu` jenis `Pemeriksaan Trafo`: `{ baId, jenis, garduId, tanggalBa, tanggalPekerjaan, petugas1Id, petugas2Id?, installId?, sectionId?, alamat?, koordinat?, konstruksi?, kva?, merk?, seri?, tahun?, jurusan?, merkPhb?, seriPhb?, tahunPhb?, kesimpulan? (<=1000), catatan? (<=1000) }`. Data trafo kosong = dari db_Gardu. Gardu AKTIF / TIDAK AKTIF. db_Gardu TIDAK diubah (`Diterapkan ke Master` = TIDAK).
- Foto: `uploadFotoBaGardu` slot `LAMPIRAN_1..LAMPIRAN_6` (kolom `Foto Pemeriksaan 1..6`), semua opsional.
- `getBaGardu` + field `kesimpulan`. `ubahBaGardu` Pemeriksaan: field sama (tanpa jenis / garduId / tanggalBa) + `revision`, `alasan?`.
- PDF: engine `/v2/ba/pemeriksaan-trafo` (`BA-Pemeriksaan-<ID BA>.pdf`), layout v1: data trafo + PHB-TR, KESIMPULAN / CATATAN (dicetak bila terisi), halaman 2 lampiran yang terisi saja (tanpa lampiran = 1 halaman).
- `kirimEamBaGardu` / `updateMasterGarduBa` untuk Pemeriksaan = `JENIS_BA_BELUM_TERSEDIA` (v1 tidak punya teks EAM; gardu tidak berubah).

## v1.0.45 Hemat kuota pemicu harian

- `daftarNotif`: hanya akun ADMIN / SUPER (HP). Akun Yandal / tim WO / ROW = `AKSES_DITOLAK`. Push WO baru ke tim dan ringkasan temuan / P0 ke admin dihapus (tetap di lonceng `getNotifikasi`).
- `ADMIN_pengingatYandal`: 3 pemicu harian (satu per shift, menit `PENGINGAT_ADMIN_MENIT` (60) + 15 sesudah shift mulai, WIB 01:15 / 09:15 / 17:15 +/- 15 menit) dipasang `ADMIN_pasangPemicuPengingatYandal`. Satu notifikasi per shift ke HP admin: tim Yandal yang belum login. Pengingat ke HP tim tidak dikirim lagi; `PENGINGAT_YANDAL_MENIT` tidak dipakai.
- Ringkasan Laporan UP3 / UIW: kiriman petugas hanya menandai tanggal kotor (`LAP_KOTOR`), tanpa pemicu sekali jalan. Pemicu harian 18:00 WIB `ADMIN_pemicuRingkasanLaporan` dipasang `ADMIN_pasangPemicuRingkasanLaporan`. Laporan yang dibuka saat tanggalnya kotor tetap disusun saat itu (web / HP).
- Website: jawaban `getLaporanUp3` / `getLaporanUiw` disimpan di browser (localStorage, per akun) dan tampil langsung saat dibuka, lalu diperbarui dari server. Dibuang saat keluar / sesi habis.

## v1.0.35 Data Gardu lengkap (HI v1): db_Gardu sumber utama, 3 file sheet lama mengikuti
- **Keputusan Master Guswan 26 Okt 2026**: website menulis HANYA ke db_Gardu; sesudah itu gardu yang sama langsung ditulis ke 3 file sheet lama (Master HI Toboali = `SHEET_GARDU_ULP` Master_Gardu + Suhu & Fisik Trafo, Master HI HP = `SHEET_GARDU_ES` 1. DATA TRAFO + 2. SUHU & FISIK TRAFO, Master HI UP3 = `SHEET_GARDU_UP3` INPUT TBL). Posisi kolom sama v1 `updateHiUp3`.
- db_Gardu **228 kolom** (WAJIB `ADMIN_rombakDbGardu` sesudah deploy, lalu `ADMIN_cekImporHiGardu` + `ADMIN_imporHiGardu` untuk menyalin data HI lama dari Master_Gardu + Suhu & Fisik ke kolom baru yang kosong): + 137 kolom HI (Lokasi Kelas Gardu ... Sepatu Kabel Jurusan D, urutan form v1) + `Sinkron Sheet Lama` (waktu tulis 3 file terakhir yang berhasil) + `Hasil Sinkron Sheet Lama`, disisip sebelum `Diubah Oleh`. Katalog 182 isian -> kolom db -> kolom sheet lama: `HI_GARDU_KATALOG_TEKS_` (30_Gardu.js).
- `getHiGardu` (BARU, menu OPS_PENGUKURAN_GARDU, admin): `{noGardu}` -> `{noGardu, revision, nilai: {kunci isian v1: nilai}, gardu, sinkron: {waktu, hasil}}` dari db_Gardu (tanggal `R` = tanggal ukur terbaru WBP / LWBP).
- `updateHiGardu` (BARU, UBAH, admin): `{noGardu, revision, nilai}` (hanya isian yang berubah; kunci di luar katalog `FIELD_TIDAK_DIKENAL`, `B` / `C` `KOLOM_TERKUNCI`, revision beda `KONFLIK_REVISION`, Penyulang / Section di luar db_Jaringan `SECTION_TIDAK_VALID`). Angka WBP / LWBP yang berubah = blok periodenya ditulis ulang dengan tanggal `R` + hasil dihitung ulang (Kode Ukur `WEB ADMIN`, Sumber `Website Admin`); cover berubah = Tanggal Cover hari ini. Lalu 3 file ditulis (hanya sel berubah, sel formula dilewati, dropdown disamakan, teks lewat `amanSheet_`, **kosong di db tidak mengosongkan sheet lama**, baris Suhu & Fisik yang belum ada disisip). Jawaban `{noGardu, revision, nilai, gardu, db: {jumlah}, sheet: {ok, hasil: [{file, tab, ok, jumlah, rumus?, disisipkan?, lewat?, pesan?, peringatan?}]}, sinkron}`. Gagal tulis sheet tidak membatalkan db_Gardu: tidak ditandai sinkron, disusul sinkron harian. Audit `UPDATE_HI_GARDU`.
- Sinkron harian 05:00 (`ADMIN_sinkronGarduLama`) **satu arah** db_Gardu -> sheet lama: pengukuran sheet lama yang lebih baru tidak lagi ditarik ke db_Gardu (hanya dihitung `lamaLebihBaru`). Tambahan lintasan `hi`: gardu AKTIF dengan Timestamp Update lebih baru dari Sinkron Sheet Lama (atau belum pernah) ditulis lengkap ke 3 file sampai batas waktu (`{perlu, ditulis, gagal, sisa}`).

## v1.0.34 Website admin (Hostinger, platform WEB)
- Website memanggil `doPost` yang sama dengan HP (POST `Content-Type: text/plain;charset=utf-8`, tanpa preflight CORS; jawaban Apps Script membawa `Access-Control-Allow-Origin: *`) dengan tambahan `platform: 'WEB'` di badan permintaan. Tanpa `platform` / nilai lain = HP (`MOBILE`).
- Platform WEB hanya untuk role `ADMIN` dan `ADMIN_ES` (`ROLE_WEB_`): `login` dengan password benar dari role lain ditolak `WEB_KHUSUS_ADMIN` (tidak menambah hitungan gagal login, audit `LOGIN_WEB_DITOLAK`); token role lain yang dipakai lewat WEB ditolak `AKSES_DITOLAK` di guard.
- Menu jawaban `login` / `cekSesi` disaring kolom `platform` db_Menu (`WEB` / `KEDUANYA`). Kunci versi APK (`WAJIB_VERSI_APP`) tidak berlaku untuk WEB. Token web tercatat `platform = WEB` di auth_Perangkat.

## v1.0.31 P0 dari WO Tindak Lanjut (HP Yandal)
- `getP0WoYandal` (BARU, petugas YANDAL dari HP, syncShift): data `{}`. Jawaban `{shiftId, list}`: baris `yan_P0` shift sesi yang berasal dari WO (`foto_meta.WO`), bentuk item sama dengan `getApprovalP0` + `temuanId`, `tlId`. Item approval juga mendapat `waktuPekerjaan`, `waktuDibuat`.
- `getFotoP0WoYandal` (BARU, petugas YANDAL dari HP, syncShift): `{p0Id, slot SEBELUM|PEKERJAAN|SESUDAH, ukuran KECIL|PENUH}`. Hanya P0 dari WO milik tim sesi (lainnya `DATA_TIDAK_DITEMUKAN`). Jawaban sama dengan `getFotoApprovalP0`.



## v1.0.26 Ubah pekerjaan WO
- `ubahPekerjaanWo` (BARU, menu OPS_WO_TIM, UBAH, petugas WO ROW / Hartek / Yandal): isian sama dengan `simpanPekerjaanWo` (tanpa `idBaris`) + `tlId`, `revision`. Hanya pekerjaan DRAFT milik tim, WO dikerjakan, foto Sebelum sudah ada (`FOTO_SEBELUM_BELUM_ADA`) dan foto Sesudah belum (`FOTO_SESUDAH_SUDAH_ADA`). Foto tidak berubah. Jawaban `{tlId, kodeTl, revision, pekerjaan}`. Audit `WO_PEKERJAAN_UBAH`.

## v1.0.23 db_Gardu blok WBP + LWBP + cover, tanggal ukur
- `db_Gardu` 89 kolom (WAJIB `ADMIN_rombakDbGardu` sesudah deploy, sebelum itu fitur gardu STRUKTUR_BERUBAH): kolom pengukuran lama = WBP; blok baru LWBP (`Tanggal Ukur LWBP`, `Kode Ukur LWBP`, 10 angka `... LWBP (A/V)`, `Pembebanan LWBP (kVA)`, `Persentase Beban LWBP (%)`, `Kategori Beban LWBP`, `Sumber Data LWBP`, `ukur_id_lwbp`) + cover (`Tanggal Cover`, Cover FCO Atas / Bawah, Cover Bushing TM / TR, Cover Arrester, Jumperan Atas / Bawah). Rombak memindahkan pengukuran LWBP yang tersimpan di kolom lama ke blok LWBP dan memformat kolom tanggal `dd mmmm yyyy`.
- Penulis master (Pengecekan Gardu Yandal, Inspeksi Gardu, `updateUkurMasterGardu`, sinkron sheet lama) menulis ke blok periodenya; WBP dan LWBP tidak saling menimpa. Inspeksi Gardu LWBP juga mengisi cover. Tanggal dari sel (Date / ISO) dibaca `tglSel_` (dulu teks dipotong jadi "Fri Oct 16").
- Sinkron harian sheet lama: tanggal db = terbaru dari WBP / LWBP; sheet lama lebih baru = grup WBP DAN LWBP masuk ke bloknya; db lebih baru = blok bertanggal terbaru ke grupnya.
- `getMaster` modul `gardu` / `getRiwayatGardu.gardu`: tambah `lwbp: {tglUkur, kodeUkur, bebanKva, persen, kategori, ukur, sumberUkur} | null` dan `cover: {tanggal, coverFcoAtas, ...} | null`. `terbaru` / pengukuran Master Gardu = 2 blok (WBP, LWBP).
- Aturan 2 hari Yandal: tanggal ukur terbaru WBP / LWBP.
- `ADMIN_perbaikiTanggalGardu` (editor): tanggal db_Gardu berbentuk teks String(Date) ("Fri Oct 16") diperbaiki ke yyyy-MM-dd (tanpa tahun = tahun terdekat yang tidak di masa depan).

## v1.0.22 Kunci update, revisi master, Update Pengukuran Gardu
- Semua jawaban sukses membawa `master` (Script Property `MASTER_REVISI`, diisi `ADMIN_lengkapiMaster` dengan waktu ISO) kalau terisi. Berubah = HP yang login mengunduh ulang Master Data + Master Gardu (+ master Inspeksi Gardu) sekali per revisi.
- `getRiwayatGardu`: `terbaru` hanya dari Master Gardu (tidak lagi membandingkan 3 sumber). `pengukuran[]` tetap semua sumber, tambah `ukurId` (Yandal `ukur_id`, Inspeksi Gardu `pengukuran_id`, Master kosong).
- `updateUkurMasterGardu` (BARU, menu OPS_PENGUKURAN_GARDU, UBAH, admin): `{garduId, noGardu?, sumber: 'Pengecekan Gardu Yandal' | 'Inspeksi Gardu', ukurId, periode: LWBP | WBP}` -> pengukuran itu ditulis ke db_Gardu (Tanggal / Kode Ukur Terakhir, Waktu Beban, 10 angka, kVA, persen, kategori, Sumber Data, ukur_id_terakhir), juga kalau lebih lama dari master (keputusan admin). Gardu harus AKTIF. Jawaban `{gardu, terbaru}`. Audit `UPDATE_UKUR_GARDU`.
- HP (bukan endpoint): app di bawah versi minimum dan kartu update ditutup = panggilan tulis ditolak di HP (`UPDATE_APLIKASI_DULU`) sebelum dikirim; baca (`get*`, ping, sesi, notifikasi) tetap jalan, sinkron antrean berhenti.
- `ADMIN_cekKonfigurasi`: jumlah Script Properties (batas 50) + properti migrasi (MIG_ / MIGP0_ / MIGHARTEK_ / MIGINS_ / MIGJP_) yang boleh dihapus karena datanya (dibuat_oleh MIGRASI) sudah ada di sheet sebelum hari pengecekan.

## v1.0.21 Pengukuran gardu 3 sumber, kartu pemadaman, Master Gardu Inspeksi Gardu
- `getRiwayatGardu`: Master Gardu (db_Gardu, pengukuran terakhir tercatat) jadi sumber ketiga `pengukuran[]` (`sumber: 'Master Gardu'`, `jam` kosong; salinan dengan `kode` sama dengan riwayat lain tidak diulang). Tambahan `terbaru: {LWBP, WBP}` = pengukuran dengan tanggal lalu jam terbaru dari 3 sumber (null kalau tidak ada) dan `gardu` = baris Master Gardu terkini (bentuk getMaster modul gardu) atau null.
- `getKalenderTim`: kegiatan `PADAM` + `padam: {penyulang, section, jamPadam, jamNyala, durasi, pekerjaan, daerah, lokasi, pelanggan, gardu, statusPekerjaan}` untuk kartu pemadaman Beranda. Kunci cache jadi `kalender:v2:`.
- `getMaster` modul `gardu`: petugas INSPEKSI_GARDU dengan menu OPS_INSDU_INPUT boleh membaca (hanya baca).

## v1.0.20 Rekam jejak gardu, kalender tanggal padam, navigasi, audit endpoint
- `getRiwayatGardu`: `pengukuran[].periode` selalu `LWBP` / `WBP` (isian Waktu Beban baku dipakai; kosong = dari jam ukur, WBP 17:00-21:59 WIB). `jam` = HH:mm.
- `getNotifikasi`: daftar item di-cache 60 detik (per tim / per hak menu admin), status dilihat per akun di-cache 10 menit dan diperbarui saat `tandaiNotifikasi`. WO dikirim / dipindah / ditarik = cache lonceng tim terkait dihapus (langsung terbaru).
- `getKalenderTim`: isi per tim / umum + bulan di-cache 60 detik.
- DIHAPUS: `ubahPgHartek` (tidak dipakai HP). Lokasi PG Hartek tidak bisa diubah / dihapus lewat endpoint.
- Audit guard: semua endpoint lewat guard_ + rem per menit + cek peran di baris pertama (tes audit). Endpoint tulis tanpa menu hanya milik sesi sendiri (Yandal HP + token shift, gantiPassword, tandaiNotifikasi).

## v1.0.36 — Ringkasan Laporan UP3 / UIW (backend; versi HP tetap 1.0.34 sampai APK baru)

- Tab baru `lap_Ringkasan` (LAPORAN_SHEET_ID), dibuat `ADMIN_siapkanRingkasanLaporan` (sekaligus menyalakan Script Property `LAP_RINGKAS_AKTIF=YA`; hapus = mati). Satu baris per tanggal: hasil data modul (ROW + Hartek + Inspeksi) dalam `json_1..json_4`.
- Kiriman petugas (menu ROW_EKSEKUSI, OPS_HARTEK_INPUT, OPS_INSJAR_INPUT, OPS_INSDU_INPUT) berhasil = tanggal kirimannya s.d. hari ini ditandai kotor (`LAP_KOTOR`) + satu pemicu sekali jalan `ADMIN_pemicuRingkasanLaporan` ~1 menit (debounce, `LAP_PEMICU`). Tidak ada pemicu berkala.
- `getLaporanUp3` / `getLaporanUiw`: field baru `segar` (bool, susun ulang paksa). Jawaban: `sumber` `RINGKASAN` (dari simpanan) / `LANGSUNG` (disusun saat itu: belum ada, kotor, atau segar), `disusunPada` (ISO).
- `getLaporanUp3` / `getLaporanUiw` / `getRingkasanLaporan` yang menemukan tanggal kotor menyusun saat itu juga (cadangan bila pemicu gagal).
- Endpoint baru `getLaporanGangguan` (menu OPS_LAP_GANGGUAN, WEB + HP, bukan PETUGAS): `{ segar?: bool }` -> `{ tanggal, hari, teks, jumlah: { pmt, sukses, lockout }, disusunPada, dibuatOleh, dariSimpanan, sinkron, sinkronGagal }`. Tanggal selalu H-1 WIB (tidak ada isian tanggal); `teks` = teks WhatsApp (gangguan H-1 + rekap bulan). Tersimpan per tanggal di tab `lap_Gangguan_Penyulang` (LAPORAN_SHEET_ID; kolom No, lap_id, Tanggal, Disusun Pada, Dibuat Oleh, PMT Trip, AR Sukses, AR Lockout, Teks, revision; dibuat / dimigrasi `ADMIN_siapkanSheetLaporanGangguan`). Pemicu harian 06.00 WIB `ADMIN_pemicuLaporanGangguan` (dipasang `ADMIN_pasangPemicuLaporanGangguan`) menyusun laporan H-1 otomatis, Dibuat Oleh = `SISTEM (pemicu 06.00)`. Salinan `ggn_` yang terakhir disinkron sebelum hari laporan berakhir disinkron dulu; `segar` memaksa sinkron + susun ulang.
- Endpoint baru `getRingkasanLaporan` (menu OPS_LAP_UP3, baca): `{ versi?: { 'yyyy-MM-dd': string } }` -> `{ hariIni, batasTgl, laporan: [{ tanggal, versi, berubah, up3?, uiw? }] }`, hari ini s.d. 7 hari lalu; `up3` / `uiw` = bentuk sama dengan getLaporanUp3 / Uiw, hanya dikirim bila versi berbeda (HP admin offline).

## v1.0.60 Workplan UP3 (web admin)
- Menu `OPS_WORKPLAN_UP3` (WEB, bukan PETUGAS). Modul `69_Workplan_Up3.js`. Sheet WORKPLAN PRIORITAS PENYULANG hanya acuan susunan kolom: TIDAK dibaca dan TIDAK ditulis sistem, admin menyalin angka dari website sendiri.
- Endpoint `getWorkplanUp3` (baca): `{ tab: 'ROW' | 'HARKONS', dari, sampai }` (maks 62 hari) -> `{ tab, dari, sampai, tanggal: ['yyyy-MM-dd'], baris: [{ no, penyulang, section, jenis, satuan, realisasi: [per tanggal], total }] }`.
  - ROW (`row_Realisasi` AKTIF): per Penyulang + Section, dua jenis: Pangkas = Rabas, Tebang = Sedang + Besar (satuan titik).
  - HARKONS (`db_Hartek_Pekerjaan`, header AKTIF): per Penyulang + Section + nama pekerjaan, `jumlah_pekerjaan`, satuan dari data.
  - Baris hanya untuk kombinasi yang bernilai di rentang. Penyulang / Section / pekerjaan sama tanpa beda huruf besar/kecil dan spasi. Urut penyulang, section, jenis (Pangkas lebih dulu).

## v1.0.51 Absensi safety briefing (backend + HP)

- Tab baru `abs_Absensi` (spreadsheet `ABSENSI_SHEET_ID`, boleh di dalam `CFG_JSON`), dibuat `ADMIN_siapkanSheetAbsensi` (`ADMIN_cekSheetAbsensi` hanya mengecek). Kolom: `tanggal`, `petugas_id`, `tim_id` (tim saat diabsen), `status`, `keterangan`, `diabsen_oleh`, `diabsen_pada`, `diubah_oleh`, `diubah_pada`, `revision`. Satu baris per `tanggal + petugas_id`; kunci kembar = `DATA_GANDA`.
- `db_Petugas`: kolom `tim_yandal` diganti `tim` (tim_id dari db_Tim, semua jenis tim). Jalankan `ADMIN_gantiHeaderPetugasTim` segera setelah push backend. `ADMIN_lengkapiMaster` memetakan nama tim / kode / UUID tim aktif jenis apa pun. `getPetugasYandal` / `simpanPetugasYandal` (menu `OPS_PETUGAS_YANDAL`, nama tampilan "Pindah Tim Petugas") kini memuat semua tim aktif (`tim[].jenis`); batas anggota 2-8 hanya untuk tim YANDAL.
- `getAbsensi` (menu `OPS_ABSENSI`, baca, ADMIN / ADMIN_ES / SUPER): `{}` -> `{ tanggal (hari ini WIB), tim: [{timId, nama, jenis}], staf: [{petugasId, nama, timId, status|null, keterangan, diabsenOleh: {userId, nama}|null, milikSaya}], rekap: {petugasId: {TELAT, TANPA_KET, KET, TMK, CUTI, IZIN}}, jamSimpan ('HH.mm'), teksWa }`. Peserta = petugas aktif dengan `tim` terisi pada tim aktif.
- `simpanAbsensi` (menu `OPS_ABSENSI`, tulis): `{ tanggal, isian: [{ petugasId, status, keterangan? }] }` (1-100 isian) -> `{ tanggal, diterima: [petugasId], ditolak: [{ petugasId, kode }] }`. `status` salah satu `HADIR`, `TELAT`, `TANPA_KET`, `KET`, `TMK`, `CUTI`, `IZIN`; `keterangan` wajib (maks 200) untuk `KET` dan `IZIN`, dilarang untuk lainnya.
  - `tanggal` harus hari ini WIB: lampau `HARI_LAMPAU`, depan `HARI_DEPAN` (seluruh panggilan ditolak).
  - `ditolak.kode`: `DIKUNCI_PENGABSEN_LAIN` (baris diisi akun lain; milik sendiri boleh diubah sepanjang hari itu), `PETUGAS_BUKAN_PESERTA`. Isian yang sah tetap tersimpan; kirim ulang isian yang sama = `diterima` tanpa perubahan.
  - Galat lain: `AKSES_DITOLAK`, `CONFIG_TIDAK_LENGKAP` (ABSENSI_SHEET_ID), `FIELD_WAJIB`, `FIELD_TIDAK_DIKENAL`, `FORMAT_SALAH`, `ID_GANDA`, `TERLALU_BANYAK`, `TERLALU_PANJANG`, `DATA_GANDA`.

## v1.0.57 Gudang Material (backend, web admin, HP)

Rancangan: `docs/superpowers/specs/2026-11-03-gudang-material-design.md`. Stok MCB per tim Yandal dihitung dari buku mutasi (`db_Material_Mutasi`); tidak ada saldo tersimpan. Tahap pertama hanya material MCB.

- Konfigurasi: `GUDANG_SHEET_ID` (spreadsheet SiSi_Gudang) dan `GUDANG_FOTO_FOLDER_ID` (folder Drive privat), boleh di `CFG_JSON`. Kosong = `CONFIG_TIDAK_LENGKAP`.
- Sheet (semua berkolom pertama `No`): SiSi_Gudang `db_Material_Mutasi`, `db_Stok_Pemeriksaan`, `db_Stok_Pemeriksaan_Item`, `db_Pemakaian_MCB`, `db_Stok_Selisih`, `db_Material_LogKoreksi`; SiSi_Master `db_Material_Tim` (izin material per tim; material tanpa izin aktif = tidak boleh dipakai tim itu; Hartek dan WO Tindak Lanjut ikut disaring). Dibuat `ADMIN_siapkanSheetGudang` (`ADMIN_cekSheetGudang` hanya mengecek).
- Alat pemilik: `ADMIN_siapkanSheetGudang`, `ADMIN_cekSheetGudang`, `ADMIN_isiIzinMaterialAwal` (semua material aktif x tim Hartek aktif; WAJIB sebelum aturan izin aktif), `ADMIN_cekKonsistensiGudang` (hanya melaporkan).
- Jenis MCB = `materialId` + `daya` + `merk` + `statusMcb` (`Baru` | `Ex-Handal`). Jumlah selalu bilangan bulat > 0.
- Master merk: sheet `db_Merk_MCB` (SiSi_Master; kolom `No, merk_id, merk, aktif, revision, diubah_pada, diubah_oleh`; dibuat + diisi dari merk yang sudah dipakai oleh `ADMIN_siapkanSheetGudang`). `getIzinMaterial` dan `getStokYandal` membawa `merkMcb: [merk aktif, urut abjad]` (kosong = master belum diisi). Sesudah master berisi, `tambahStokGudang`, `simpanPemeriksaanStok` (tiap item), dan `koreksiPemakaian` (hanya bila merk berubah) menolak merk di luar master dengan `MERK_TIDAK_VALID` dan menyimpan ejaan master (huruf besar/kecil diluruskan). Kirim / tarik / koreksi stok / pakai tidak divalidasi (bekerja atas stok yang sudah ada). Tambah / nonaktifkan merk langsung di sheet (aktif FALSE); efek maks 5 menit tidak ada cache, langsung.
- Master keperluan: sheet `db_Keperluan_MCB` (SiSi_Master; kolom `No, keperluan_id, keperluan, aktif, revision, diubah_pada, diubah_oleh`). Tab dibuat `ADMIN_siapkanSheetGudang` (hanya header, isi diketik admin); `keperluan_id` / `No` / `aktif` dilengkapi `ADMIN_lengkapiMaster`. `getIzinMaterial` dan `getStokYandal` membawa `keperluanMcb: [keperluan aktif, urut abjad]` (kosong = master belum diisi). Sesudah master berisi, `simpanPemakaianMcb`, `simpanPemakaianSusulan`, `selesaikanSelisih` cara SUSULAN, dan `koreksiPemakaian` (hanya bila keperluan berubah) menolak keperluan di luar master dengan `KEPERLUAN_TIDAK_VALID` dan menyimpan ejaan master.

### Admin (menu `OPS_GUDANG_MATERIAL`, ADMIN / SUPER; tulis butuh UBAH)
- `getIzinMaterial` `{}` -> `{ material: [{materialId, nama, satuan}], tim: [{timId, nama, jenis}], izin: [{materialId, timId, aktif}] }`.
- `simpanIzinMaterial` `{ materialId, timIds: [uuid] }` -> `{ materialId, timIds, stokTertinggal: [{timId, jumlah}] }`. Izin aktif persis `timIds`; baris tidak pernah dihapus; pencabutan boleh walau tim masih punya stok.
- `getGudangStok` `{ timId? }` -> `{ gudang: [Jenis], tim: [{timId, nama, jenisTim, stok: [Jenis], tanpaIzin: [Jenis], punyaIzin}], mutasi: [200 terbaru] }`, `Jenis = {materialId, daya, merk, statusMcb, jumlah}`.
- `tambahStokGudang` `{ idOperasi, materialId, daya, merk, statusMcb, jumlah, catatan?, foto? }`; `kirimStokTim` (+ `timId`; `STOK_TIDAK_CUKUP`, `MATERIAL_TIDAK_DIIZINKAN`); `tarikStokTim` (+ `timId`, `alasan` wajib; boleh untuk stok tanpa izin); `koreksiStok` `{ idOperasi, lokasi: 'GUDANG'|timId, ...jenis, jumlahBaru>=0, alasan }`. `idOperasi` (uuid) sama = `duplikat: true`, tidak menulis ulang. `foto` opsional `{ sha256, ukuranByte, data(base64 JPEG) }`.
- `getSelisihGudang` `{ status?: 'MENUNGGU'|'SELESAI', timId? }` -> `{ selisih, susulan, dikoreksi }`.
- `selesaikanSelisih` `{ selisihId, cara, catatan, nomorMeter?, keperluan?, pemakaianId?, foto? }`; `cara` KURANG: `HILANG` | `SUSULAN` (satu MCB per panggilan; `nomorMeter` + `keperluan` wajib) | `SALAH_HITUNG`; LEBIH: `TAMBAHAN_MASUK` | `SALAH_CATAT` | `SALAH_HITUNG`. Tiap cara menulis sendiri mutasi yang menyamakan saldo (HILANG, TAMBAHAN, PAKAI). `SALAH_HITUNG` mengembalikan pemeriksaan (`DIKEMBALIKAN`) dan menutup semua selisihnya.
- `getPemakaianGudang` `{ dari, sampai, timId?, merk? }` (maks 92 hari); `koreksiPemakaian` `{ pemakaianId, revision, nomorMeter?, keperluan?, daya?, merk?, statusMcb?, alasan }` (ganti jenis memindahkan stok; `DATA_BERUBAH` bila revision lama); `batalkanPemakaian` `{ pemakaianId, revision, alasan }` (MCB kembali ke tim, baris `BATAL`).
- `getFotoGudang` `{ jenis: 'PEMERIKSAAN'|'PEMAKAIAN'|'MUTASI', id, ukuran?: 'KECIL'|'PENUH' }`.

### Yandal (menu `OPS_STOK_MATERIAL`, petugas tim YANDAL; tim selalu dari sesi)
- `getStokYandal` `{}` -> `{ shift: {tanggal, no, kunci}, pemeriksaan: null | {pemeriksaanId, status, selisih: [Selisih]}, saldo: [Jenis], pilihan: {material: [{materialId, nama}]}, bolehPakai, jenisTersedia }`.
- `simpanPemeriksaanStok` `{ item: [{daya, merk, statusMcb}] (satu elemen per MCB, maks 500), foto (wajib) }` -> `{ pemeriksaanId, status: 'COCOK'|'MENUNGGU_ADMIN', selisih }`. Kunci tim + tanggal + shift (jam server); kirim ulang / rekan satu tim = hasil pemeriksaan pertama.
- `simpanPemakaianMcb` `{ pemakaianId (uuid dari HP), daya, merk, statusMcb, nomorMeter, keperluan, foto (wajib) }` -> `{ pemakaianId, nomorPemakaian ('<Kode Shift>-MCB.nnn'), duplikat }`. Ditolak `PEMERIKSAAN_BELUM_ADA`, `SELISIH_MENUNGGU`, `SHIFT_BELUM_DIMULAI`, `STOK_TIDAK_CUKUP`, `MATERIAL_TIDAK_DIIZINKAN`, `FOTO_WAJIB`.
- `simpanPemakaianSusulan` `{ pemakaianId, selisihId, nomorMeter, keperluan, foto? }` -> `{ pemakaianId, nomorPemakaian, duplikat, selisih, pemeriksaanStatus }`. Atas nama shift dan petugas sebelumnya; `SHIFT_SEBELUMNYA_TIDAK_ADA` bila shift itu tidak pernah dimulai; selisih hanya KURANG milik tim sendiri (`SELISIH_TIDAK_VALID`, `BUKAN_MILIK_TIM`).
- `getFotoGudangYandal` (jenis sama; hanya foto tim sendiri, `BUKAN_MILIK_TIM` selain itu).
- Galat baru: `STOK_TIDAK_CUKUP`, `MATERIAL_TIDAK_DIIZINKAN`, `PEMERIKSAAN_BELUM_ADA`, `SELISIH_MENUNGGU`, `FOTO_WAJIB`, `SHIFT_BELUM_DIMULAI`, `SHIFT_SEBELUMNYA_TIDAK_ADA`, `SELISIH_TIDAK_DITEMUKAN`, `SELISIH_TIDAK_VALID`, `ALASAN_WAJIB`, `PEMAKAIAN_BATAL`.

## v1.0.61 Update aplikasi dari halaman login
- `getUpdateAppPublik` (PUBLIK, tanpa token): `{ versiApp }` -> `{ tersedia, apk? }` / `{ tersedia: false, versi }`, jawaban sama persis dengan `getUpdateApp` (bersesi). Hanya membuka info APK di `APK_FOLDER_ID` (versi, ukuran, sha256, link unduh) yang memang sudah "siapa saja yang punya link"; tidak ada data SiSi. Rem global 60 panggilan per menit untuk semua HP (`TERLALU_SERING`); jawaban APK di-cache 10 menit. Tetap boleh walau `WAJIB_VERSI_APP = YA` (`cekVersiHp_`).
- HP: kartu update (Cek Lagi + Update Sekarang) kini memakai unduh langsung dari app juga SEBELUM login (`PembaruApk.jalankan(..., token: null)` memanggil `getUpdateAppPublik`); halaman login menampilkan banner "Update tersedia / Wajib update aplikasi" dan pita merah wajib update ("Update sebelum masuk"). Login tidak diblokir.

## v1.0.63 Master Tiang + Master Switching (backend, web admin, HP)

Rancangan: `docs/superpowers/specs/2026-11-08-master-tiang-switching-design.md`. Verifikasi aset lapangan dari awal; simpan oleh Admin = verifikasi langsung berlaku (tanpa antrean persetujuan), pengamannya `log_Audit` (kolom lama -> baru) + foto.

- Konfigurasi: `TIANG_SHEET_ID` (spreadsheet SiSi_Tiang) dan `TIANG_FOTO_FOLDER_ID` (folder Drive privat foto switching), boleh di `CFG_JSON`. Kosong = `CONFIG_TIDAK_LENGKAP`.
- Sheet (semua berkolom pertama `No`, nomor urut baris, bukan kunci): SiSi_Tiang `db_Tiang`, `db_Tiang_Sirkuit`, `db_Segmen`, `db_Switching`; SiSi_Master `db_Konstruksi`, `db_Tiang_Pemetaan` (id / aktif / revision dilengkapi `ADMIN_lengkapiMaster`). Alat pemilik: `ADMIN_siapkanSheetTiang` (buat tab + header), `ADMIN_cekSheetTiang` (hanya cek). Header beda tidak pernah ditimpa.
- Migrasi tiang dari ITB (alat pemilik, belum ada endpoint / layar; modul `97_Tiang_Itb.js`): `ADMIN_cekMigrasiTiangItb` (hanya melaporkan) dan `ADMIN_migrasiTiangItb` (menulis). Sumber = sheet `db_TiangMaster` di file `MASTER_ITB_SHEET_ID` (hanya dibaca), hanya tiang TM. Header dibaca lewat nama (alias bawaan + `db_Tiang_Pemetaan`, baris header dicari di 10 baris pertama); kolom wajib `ASSETNUM`, `DESCRIPTION`, koordinat hilang = `KOLOM_WAJIB_HILANG` (tidak ada yang ditulis); sumber tanpa tiang TM = `DATA_KOSONG`. Tujuan `db_Tiang` (upsert per `tiang_id`, hanya kolom aset; kolom verifikasi tidak pernah ditimpa; koordinat berlaku mengikuti aset selama `sumber_koordinat` = `aset`; hilang dari sumber = `keterangan_sumber` "Tidak ada di sumber <bulan>", tidak dihapus) dan satu baris awal `db_Tiang_Sirkuit` per tiang (usulan induk / gawang / peran titik dari nama tiang; baris yang sudah terverifikasi hanya `segmen_aset` yang ikut sumber). Ringkasan terakhir di Script Property `TIANG_ITB_SINKRON`.
- Menu `OPS_MASTER_SWITCHING` (KEDUANYA, ADMIN / SUPER; tulis butuh UBAH). Peran dicek di baris pertama tiap fungsi.
- `getMasterSwitching` `{}` -> `{ switching: [Switching], jaringan: [{sectionId, penyulang, section}] (db_Jaringan aktif), waktu }`. Baris nonaktif ikut (bisa diaktifkan ulang). `Switching` = semua isian (camelCase) + `switchingId, lat, lng, koordinat, proteksiHuluId (PMT/ACR/FCO aktif terdekat di hulu yang bisa trip, dihitung), statusVerifikasi (BELUM | TERVERIFIKASI | PERLU_PERBAIKAN), verifikasiTerakhir, foto: {UNIT, NAMEPLATE, KONTROLER: bool}, aktif, revision, diubahPada`.
- `simpanSwitching` `{ switchingId?, revision?, koordinat ("lat, lng", wajib, area Babel), statusVerifikasi?, aktif?, jenis (PMT|ACR|SSO|LBS|FCO|DS), nama, penyulang, posisiNormal (NC|NO), statusOperasi (OPERASI|TIDAK_OPERASI|DIBONGKAR), ...isian opsional }` -> `{ switching }`. Tanpa `switchingId` = baru (ID `SWC-0001` dibuat server, tidak berubah). Ubah = `revision` wajib sama (`KONFLIK_REVISION`); simpan = ganti seluruh isian (kosong = dikosongkan); `aktif` tidak dikirim = status lama tetap. Aturan: penyulang / section dari `db_Jaringan` aktif (`PENYULANG_TIDAK_DIKENAL`, `SECTION_BEDA_PENYULANG`), nama unik per penyulang di antara baris aktif (`NAMA_GANDA`), hulu ada + bukan diri sendiri + tanpa putaran (`HULU_TIDAK_VALID`), titik hubung wajib penyulang sisi lain yang berbeda, kolom FCO hanya untuk FCO, kode RTU / media hanya bila SCADA, `bisaTrip` bawaan per jenis bila tidak dikirim. Log `SWITCHING_BARU` / `SWITCHING_UBAH`.
- `uploadFotoSwitching` `{ switchingId, slot (UNIT|NAMEPLATE|KONTROLER), sha256, ukuranByte, data }` -> `{ switchingId, slot, revision }`. JPEG <= 2 MB, sisi <= 2048 px. Foto baru menggantikan slot (file lama tetap di Drive); kiriman ulang foto yang sama = file yang sama, baris tidak ditulis ulang. Drive: `TIANG_FOTO_FOLDER_ID / Switching / <switching_id> / <switching_id>_<SLOT>.jpg`.
- `getFotoSwitching` `{ switchingId, slot, ukuran? (KECIL|PENUH) }` -> foto base64 (KECIL = thumbnail).

## Segmen + Verifikasi Tiang (backend, web admin, HP; menu `OPS_VERIFIKASI_TIANG`, KEDUANYA, ADMIN / SUPER)

Modul `98_Segmen.js` + `99_Verifikasi_Tiang.js`. Peran dicek di baris pertama tiap fungsi; verifikasi Admin langsung berlaku (tanpa antrean), log `SEGMEN_BARU` / `SEGMEN_UBAH` / `TIANG_VERIFIKASI` / `TIANG_BARU` / `TIANG_FOTO`.

- `getSegmen` `{}` -> `{ segmen: [{segmenId, nama, penyulang, sectionId, urutan, indukSegmenId, awalJenis, awalNama, awalSwitchingId, akhirJenis, akhirNama, akhirSwitchingId, segmenItb, catatan, jenisSegmen (UDARA|KABEL_TANAH), jenisKabel, ukuranMm2, panjangKabelM, penghantarId, statusData (LENGKAP|KURANG|''), jumlahTiang, jumlahTerverifikasi, aktif, revision}], jaringan, switching (aktif) }`.
- `simpanSegmen` `{ segmenId?, revision?, aktif?, nama, penyulang, sectionId, awalJenis (GI|SWITCHING|GARDU|PERCABANGAN|UJUNG_KABEL), awalNama, akhirJenis (SWITCHING|GARDU|PERCABANGAN|UJUNG_KABEL|UJUNG), akhirNama, jenisSegmen? (UDARA bawaan | KABEL_TANAH), jenisKabel? (N2XSEBY - 1 CORE | NA2XSEYBY - 3 CORE), ukuranMm2?, panjangKabelM?, penghantarId?, urutan?, indukSegmenId?, awalSwitchingId?, akhirSwitchingId?, segmenItb?, catatan? }` -> `{ segmen }`. ID `SGM-0001` dari server; urutan kosong = urutan terakhir penyulang + 10; nama unik per section (`NAMA_GANDA`); section milik penyulang (`SECTION_BEDA_PENYULANG`); induk ada + penyulang sama (`HULU_TIDAK_VALID`); switching batas ada. Segmen `KABEL_TANAH` (10 Nov 2026): tanpa tiang (`DATA_TIDAK_VALID` bila sudah berisi tiang, dan `simpanVerifikasiTiang` menolak segmenId kabel tanah); data kabel kurang tetap tersimpan dengan `statusData` KURANG; ubah ke UDARA mengosongkan kolom kabel.
- `getVerifikasiTiang` `{}` -> `{ jalur: [{kode, jumlah, terverifikasi, perluPerbaikan, tidakDitemukan, bertanda}], konstruksi: [{konstruksiId, kode, nama}], ukuran: [nama] (db_Ukuran_Tiang aktif; kosong = HP pakai bawaan), jaringan, segmen (aktif), switching (aktif) }`. Kode jalur = `kode_nama_aset` (kosong = `LAINNYA`).
- `getTiangJalur` `{ kode }` -> `{ kode, tiang: [{tiangId, nama, kode, latAset, lngAset, lat, lng, sumberKoordinat, jenisTiangAset, ukuranTiangAset, jenisTiang, ukuranTiang, konstruksiId, jumlahSirkuit, tandaCek, statusVerifikasi, verifikasiTerakhir, keteranganSumber, foto: {TIANG, KEPALA}, kurang?: [teks] (hanya tiang Terverifikasi; kosong = lengkap, isi = Perlu Dilengkapi), revision, sirkuit: [{sirkuitId, penyulang, posisi, sectionId, segmenId, indukTiangId, peranTitik, switchingId, switchingDiTiang, jenisKabel, ukuranMm2, gawangM, segmenAset, tandaCekGawang, statusVerifikasi}]}] }`.
- `simpanVerifikasiTiang` `{ tiangId?, revision?, statusVerifikasi (TERVERIFIKASI|PERLU_PERBAIKAN|TIDAK_DITEMUKAN), koordinat?, akurasiM?, jenisTiang? (BETON|BESI|KAYU), ukuranTiang?, konstruksiId? (db_Konstruksi), nama?, kode?, sirkuit: [1-3 x {sirkuitId?, penyulang, posisi?, sectionId?, segmenId?, indukTiangId?, peranTitik?, switchingId?, switchingDiTiang?, jenisKabel?, ukuranMm2?, indukStatus? (BENAR|DIGANTI|TITIK_AWAL), indukKeterangan?, switchingKeterangan?}], dasarKoordinat? (TERDAFTAR|LAPANGAN; wajib bila koordinat > 10 m dari koordinat terdaftar tiang, TERDAFTAR = koordinat aset dipakai) }`. TERVERIFIKASI ditolak `FIELD_WAJIB` (detail = daftar kekurangan) bila jenis / ukuran / konstruksi tiang atau penyulang, section, segmen, posisi, peranTitik, jenisKabel, ukuranMm2 sirkuit kosong, induk belum dikonfirmasi (BENAR / DIGANTI + indukTiangId, atau TITIK_AWAL tanpa indukTiangId + indukKeterangan), atau tanpa switchingId dan switchingKeterangan; induk wajib tiang Terverifikasi (`DATA_TIDAK_VALID`) -> `{ tiang, selisihM }`. Tanpa `tiangId` = tiang baru dari lapangan (`BARU-0001`, nama wajib; migrasi ITB tidak menandainya hilang). `TIDAK_DITEMUKAN` = hanya status dicatat (koordinat / sirkuit lama tetap). Koordinat lapangan wajib selain itu (`sumber_koordinat` = lapangan); kolom aset tidak diubah; sirkuit tak dikirim dinonaktifkan; gawang dihitung server dari koordinat induk; section diisi dari segmen bila kosong.
- `uploadFotoTiang` `{ tiangId, slot (TIANG|KEPALA), sha256, ukuranByte, data }` -> `{ tiangId, slot, revision }` (Drive `TIANG_FOTO_FOLDER_ID / Tiang / <kode jalur> / <tiang_id>_<SLOT>.jpg`); `getFotoTiang` `{ tiangId, slot, ukuran? }` -> foto base64.

## Master Jaringan (menu `OPS_MASTER_SWITCHING`, dulu Master Switching; backend, web admin, HP)

Satu menu, tiga bagian: Switching, Jaringan (penyulang + section, `db_Jaringan`), Segmen. `getSegmen` / `simpanSegmen` pindah dari `OPS_VERIFIKASI_TIANG` ke menu ini. Modul `100_Jaringan_Admin.js`. Setiap perubahan `db_Jaringan` menaikkan `MASTER_REVISI` (HP mengunduh ulang master) dan membersihkan cache akses. Data tidak dihapus (aktif FALSE).

- `getJaringan` `{}` -> `{ section: [{sectionId, penyulang, section, parentSectionId, urutan, aktif, revision, jumlahSegmen, jumlahSwitching}] }` (semua, termasuk nonaktif).
- `simpanSection` `{ sectionId?, revision?, penyulang, section, parentSectionId?, urutan?, aktif? }` -> `{ section }`. Penyulang baru = section pertama (ejaan penyulang yang ada diikuti). `NAMA_GANDA` (penyulang + section), `HULU_TIDAK_VALID` (induk tidak ada / berputar), `DATA_TIDAK_VALID` (induk beda penyulang), `KONFLIK_REVISION`. Urutan kosong = kelipatan 20 berikutnya. Log `SECTION_BARU` / `SECTION_UBAH`.
- `setAktifPenyulang` `{ penyulang, aktif }` -> `{ penyulang, aktif, jumlah }`: semua section penyulang itu dalam satu tulis (`PENYULANG_TIDAK_DIKENAL` bila tidak ada). Log `PENYULANG_AKTIF`.
- Catatan: mengganti nama section tidak mengubah teks section yang sudah tersimpan di data lama (ROW, Hartek, dan lain-lain).
