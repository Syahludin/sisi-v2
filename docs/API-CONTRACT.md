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
