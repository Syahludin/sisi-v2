## v1.0.35 Data Gardu lengkap (HI v1): db_Gardu sumber utama, 3 file sheet lama mengikuti
- **Keputusan kvlar 26 Okt 2026**: website menulis HANYA ke db_Gardu; sesudah itu gardu yang sama langsung ditulis ke 3 file sheet lama (Master HI Toboali = `SHEET_GARDU_ULP` Master_Gardu + Suhu & Fisik Trafo, Master HI HP = `SHEET_GARDU_ES` 1. DATA TRAFO + 2. SUHU & FISIK TRAFO, Master HI UP3 = `SHEET_GARDU_UP3` INPUT TBL). Posisi kolom sama v1 `updateHiUp3`.
- db_Gardu **228 kolom** (WAJIB `ADMIN_rombakDbGardu` sesudah deploy, lalu `ADMIN_cekImporHiGardu` + `ADMIN_imporHiGardu` untuk menyalin data HI lama dari Master_Gardu + Suhu & Fisik ke kolom baru yang kosong): + 137 kolom HI (Lokasi Kelas Gardu ... Sepatu Kabel Jurusan D, urutan form v1) + `Sinkron Sheet Lama` (waktu tulis 3 file terakhir yang berhasil) + `Hasil Sinkron Sheet Lama`, disisip sebelum `Diubah Oleh`. Katalog 182 isian -> kolom db -> kolom sheet lama: `HI_GARDU_KATALOG_TEKS_` (60_Gardu.js).
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
- Endpoint baru `getRingkasanLaporan` (menu OPS_LAP_UP3, baca): `{ versi?: { 'yyyy-MM-dd': string } }` -> `{ hariIni, batasTgl, laporan: [{ tanggal, versi, berubah, up3?, uiw? }] }`, hari ini s.d. 7 hari lalu; `up3` / `uiw` = bentuk sama dengan getLaporanUp3 / Uiw, hanya dikirim bila versi berbeda (HP admin offline).
