# Skema Sheet v2

> Skema teknis sheet. Aturan bisnisnya ada di PRD SiSi v2 (lihat `docs/PRD.md`). Kalau berbeda, PRD yang benar.

Aturan umum: baris 1 = header persis seperti di bawah, tidak ada formula, ID = UUID
(isi otomatis lewat `ADMIN_lengkapiMaster`), tidak ada hapus baris (`aktif = FALSE`).
Kolom `kode` di db_Tim berformat **Plain text** (supaya `01` tidak jadi `1`).

## SiSi_Master
| Sheet | Kolom |
|---|---|
| db_Tim | tim_id, jenis, nama, kode, aktif, revision, diubah_pada, diubah_oleh |
| db_Users | user_id, username, nama, email, role, tim_id, aktif, revision, dibuat_pada, diubah_pada, diubah_oleh |
| db_Jaringan | section_id, penyulang, section, parent_section_id, urutan, aktif, revision, diubah_pada, diubah_oleh |
| db_Jenis_Pekerjaan | jenis_id, modul, nama, satuan, diameter_min, diameter_max, urutan, aktif |
| db_Menu | menu_kode, nama, platform, khusus_super, urutan, aktif |
| db_Akses | role, jenis_tim, menu_kode, aksi |
| _ref | daftar pilihan dropdown (role, jenis, aksi, platform) |

- `username`: huruf kecil, tanpa spasi, unik (pola `16130.<akun>`).
- `role`: SUPER, ADMIN, ADMIN_ES, PETUGAS. PETUGAS wajib punya `tim_id`; SUPER/ADMIN/ADMIN_ES dikosongkan.
- `tim_id` di db_Users boleh diketik nama tim (`ROW 01`) atau kode (`01`); `ADMIN_lengkapiMaster` menggantinya jadi UUID. Tidak ketemu atau ganda = peringatan, tidak diubah.
- `db_Jaringan`: `section_id` dikosongkan (diisi otomatis). `parent_section_id` = section induk (lebih dekat ke sumber/GI), OPSIONAL sejak 3 Okt 2026: laporan tidak lagi menggabungkan rentang, Section realisasi = daftar section. Boleh diketik nama section induk di penyulang yang sama, `ADMIN_lengkapiMaster` menggantinya jadi UUID dan memperingatkan nama ganda, induk tidak ketemu, atau topologi melingkar.
- `db_Jenis_Pekerjaan`: diameter dalam cm bilangan bulat; `diameter_min` dan `diameter_max` **inklusif**, kosong = tanpa batas.
  Isi awal: Rabas / Pangkas 0-0, Tebang Sedang 25-50, Tebang Besar 51-(kosong). Diameter 1-24 ditolak.
- `platform` (db_Menu): WEB, MOBILE, KEDUANYA. `aksi`: LIHAT, UBAH. `jenis_tim` / `menu_kode` boleh `*`.

## SiSi_Auth (tidak pernah disinkron ke HP)
| Sheet | Kolom |
|---|---|
| auth_Password | user_id, password_hash, salt, hash_versi, password_diubah_pada, gagal_login, terkunci_sampai |
| auth_Perangkat | device_id, user_id, install_id, token_hash, platform, dibuat_pada, terakhir_dipakai, kedaluwarsa_pada, dicabut_pada |
| log_Audit | waktu, user_id, username, role, aksi, target, detail, platform, device_id |

## SiSi_ROW (FINAL 2 Okt 2026)

> Sheet ROW hanya di-append server: **jangan di-sort, jangan hapus/sisip baris**. syncRow membaca jendela 7 hari dari penunjuk `ROW_JENDELA_<sheet>` (Script Property). Kalau sheet terlanjur diubah manual, jalankan `ADMIN_resetJendelaRow`. row_Realisasi punya penunjuk kedua `ROW_JENDELA_BULAN_row_Realisasi` (sejak awal bulan, untuk total bulanan WA). Fase 1 tidak ada sheet row_Laporan_Harian: WA ada di row_Header kolom WA Text.

Struktur dan nama kolom lama dipertahankan. Warna header: putih = input HP, abu = turunan (ditulis server),
biru = teknis. Kolom turunan **bukan formula** dan **tidak pernah dipakai untuk relasi**; relasi hanya lewat `*_id`.
Sheet diproteksi, hanya server yang menulis. Penjelasan per kolom ada di sheet `_keterangan` template dan di PRD.

| Sheet | Kolom |
|---|---|
| row_Header (23) | No, Kode Header, ULP, Hari, Tanggal, Tim, Sub-Tim, Koordinat Awal, Koordinat Akhir, KM Awal, KM Akhir, Kendala, WA Text, TimeStamp, Input By, TimeStamp Update, header_id, tim_id, status, revision, dibuat_oleh, waktu_perangkat, diubah_oleh |
| row_Realisasi (21) | No, Kode Header, Kode Pekerjaan, Hari, Tanggal, Tim, Penyulang, Section, Rabas, Sedang, Besar, Input Oleh, Timestamp, Timestamp Update, realisasi_id, header_id, status, revision, dibuat_oleh, waktu_perangkat, diubah_oleh |
| row_Eksekusi (40) | No, Kode Header, Kode Pekerjaan, Kode Eksekusi, ULP, Hari, Tanggal, Tim, Penyulang, Section, Nomor Tiang, Koordinat Tiang, Lat Tiang, Long Tiang, Koordinat Pekerjaan, Lat Pekerjaan, Long Pekerjaan, Foto Sebelum, Foto Sebelum URL, Foto Pekerjaan, Foto Pekerjaan URL, Foto Sesudah, Foto Sesudah URL, Diameter, Jenis Pekerjaan, Input Oleh, Timestamp, Timestamp Update, eksekusi_id, realisasi_id, section_id, jenis_id, foto_lengkap, sumber, temuan_id, status, revision, dibuat_oleh, waktu_perangkat, diubah_oleh |
| row_Foto (19) | foto_id, eksekusi_id, slot, drive_file_id, sha256, ukuran_byte, mime, sumber_foto, diambil_pada, lat, lng, akurasi_m, Timestamp, Timestamp Update, status, revision, dibuat_oleh, waktu_perangkat, diubah_oleh |

- `status`: AKTIF, BATAL. `slot`: SEBELUM, PEKERJAAN, SESUDAH. `sumber`: LANGSUNG, TEMUAN. `sumber_foto`: KAMERA, GALERI.
- Tanpa kolom `urut`: nomor urut dibaca dari 3 digit terakhir kode.
- Realisasi unik per (header_id, Penyulang). Section dicatat per eksekusi.
- Rabas/Sedang/Besar hanya menghitung eksekusi AKTIF dengan `foto_lengkap = TRUE`.
- Daftar header resmi ada di `skemaHeader_()` (90_AdminTools.js); `ADMIN_cekKonfigurasi` mengecek sheet ROW kalau `ROW_SHEET_ID` diisi.

## Keamanan sesi & login (audit 4 Okt 2026, v0.36)

- Cache sesi 5 menit bertanda `SESI_EPOCH` (Script Property). Setelah edit manual db_Users (nonaktif, ganti role/tim), auth_Perangkat (isi `dicabut_pada`), db_Menu/db_Akses: jalankan `ADMIN_bersihkanCache` supaya berlaku seketika.
- Cabut semua sesi satu akun: Script Property `CABUT_USERNAME` lalu `ADMIN_cabutSesi` (property dihapus otomatis). `ADMIN_setPassword` juga mencabut sesi + cache.
- Rem login di cache sebelum lock: 10 gagal per username / 15 menit, 30 gagal semua username / menit = `LOGIN_DIBATASI` (tanpa baca sheet). log_Audit maks 10 LOGIN_GAGAL per menit.
- `PBKDF2_ITERASI` production wajib >= 5000 (cfg_ menolak). Staging boleh lebih rendah; hash naik otomatis saat login.
- getMaster modul pengguna: username + role hanya untuk ADMIN/SUPER; ADMIN_ES semua tim tanpa username/role; PETUGAS hanya anggota tim sendiri.
- v0.42: rem per sesi 90 panggilan / menit; batasMenit getArsipRow 20, getArsipHariRow 10, getFotoArsipRow 40 (v0.47: + syncRow 20, uploadFotoRow 30, getFotoRow 40). Lewat = `TERLALU_SERING`.
- v0.47: token yang ditolak (tidak ada / dicabut / kedaluwarsa) diingat 5 menit tanpa baca sheet; lebih dari 60 token ditolak per menit (semua penelepon) = pencarian token baru ditahan `TERLALU_SERING`.
- v0.47: kiriman doPost maks 4 MB. Teks dari HP dibersihkan dari karakter kontrol dan jadi satu baris, kecuali Kendala (maks 5 baris, di WA digabung "; " jadi satu baris).
- v0.47: getFotoRow / getFotoArsipRow hanya mengirim file Drive bertipe gambar dengan SHA-256 sama dengan kolom sha256 row_Foto (`FOTO_TIDAK_VALID`). Jangan ubah drive_file_id / sha256 row_Foto manual.
- v0.48: rem login global (30 gagal / menit) hanya untuk username yang tidak terdaftar; username terdaftar cukup rem per username (10 / 15 menit) + kunci 5x gagal. Akun terkunci dijawab `LOGIN_GAGAL` (tidak membocorkan username ada). Buka kunci: Script Property `BUKA_USERNAME` lalu `ADMIN_bukaKunciLogin`.
- v0.48: token punya umur mutlak 90 hari sejak login (`TOKEN_MAKS_HARI`); cekSesi tetap memperpanjang 30 hari tapi tidak melewati batas itu, lewat = `SESI_KEDALUWARSA` (login ulang).
- v0.48 (manual di folder android): `<application android:allowBackup="false" android:fullBackupContent="false" android:dataExtractionRules="@xml/data_extraction_rules">` + salin `docs/android/data_extraction_rules.xml` ke `android/app/src/main/res/xml/`. Cek: `adb shell dumpsys package id.co.pln.toboali.sisi_new.staging` (production: `id.co.pln.toboali.sisi_new`) tidak memuat `ALLOW_BACKUP`.

## Urutan section (v0.46)

- Urutan section di laporan WA, kolom Section realisasi, dan pilihan section di HP = **kolom `urutan` db_Jaringan per penyulang** (v0.46): angka kecil = dekat PMT / sumber. Isi kelipatan 20 (20, 40, 60); section baru tinggal diberi angka di antaranya (mis. 30, lalu 25 / 35, boleh desimal), baris tidak perlu disisip. `urutan` kosong / 0 = di belakang, urut baris; seri dipecah urutan baris.
- `ADMIN_lengkapiMaster` mengisi `urutan` yang kosong / 0 dengan kelipatan 20 setelah nomor terbesar penyulang itu (urutan laporan tidak berubah), memperingatkan nomor ganda dan isi bukan angka. `ADMIN_cekUrutanSection` menampilkan urutan efektif per penyulang (hanya baca).
- Baris db_Jaringan boleh dipindah / disisip / di-sort (relasi lewat `section_id`, urutan lewat kolom `urutan`). Setelah mengubah `urutan`: `ADMIN_lengkapiMaster` (sudah membersihkan cache master). WA lama ikut urutan baru saat header itu tersentuh sync berikutnya; data migrasi: hapus Script Property `MIG_HITUNG_SELESAI` lalu `ADMIN_migrasiHitung`.

## Menu Operasi admin (v0.50)

- ADMIN / SUPER / ADMIN_ES: bottom bar Operasi · Beranda · Pengaturan. PETUGAS tetap Laporan · Beranda · Pengaturan.
- Tile Operasi tampil hanya kalau `menu_kode`-nya ada di menu sesi (db_Menu aktif, platform MOBILE/KEDUANYA, + db_Akses). Baris OPS_* ada di template SiSi_Master (db_Menu); laporan v0.57 juga di `docs/db_Menu_laporan_v0.57.tsv` (urutan kolom sama dengan sheet asli: menu_kode, nama, platform, urutan, aktif, khusus_super). Setelah ubah db_Menu jalankan `ADMIN_bersihkanCache`. ADMIN/SUPER (`*`) otomatis dapat semua; ADMIN_ES hanya Laporan per Tim (ROW_LAPORAN).
- Laporan per Tim = ROW_LAPORAN: grid sub-tim ROW dari db_Tim + status hari ini (getLaporanRow semua tim), halaman tim tab Hari ini (getLaporanRow timId, detail lewat getArsipHariRow; admin boleh tanggal hari ini, PETUGAS tidak) dan Arsip (getArsipRow / getArsipHariRow dengan timId). Hanya lihat.
- Modul OPS_* belum dibangun: badge Segera, diketuk = keterangan "Fitur ini segera dirilis".
- HP: arsip admin disimpan per tim (SQLite v7 kolom `arsip_row.tim_id`, folder `arsip_hari/<user>/tim/<tim_id>`).


## SiSi_Laporan (v0.51, struktur v0.55, keputusan kvlar 5 Okt 2026)

File spreadsheet **terpisah** dari SiSi_ROW (folder Drive `SiSi_Laporan`), ID di Script Property `LAPORAN_SHEET_ID` (staging & production masing-masing). Template: `templates/SiSi_Laporan_template.xlsx`. Header persis, tanpa formula, tanpa hapus baris, hanya ditulis server, jangan di-share. Laporan UP3 dan UIW dikerjakan 2 orang, jadi tiap laporan punya sheet harian sendiri yang jadi induk C4A-nya.

| Sheet | Kolom |
|---|---|
| lap_Harian_UP3 (1 baris AKTIF per tanggal) | No, Tanggal, Hari, ULP, Laporan UP3, Input Oleh, Timestamp, Timestamp Update, lap_id, status, revision, dibuat_oleh, diubah_oleh |
| lap_C4A_UP3 (1 baris per penyulang, lap_id = lap_Harian_UP3) | No, Tanggal, Penyulang, Realisasi kmS, Temuan, Tindak Lanjut, Eksekusi, Keterangan, Input Oleh, Timestamp, Timestamp Update, c4a_id, lap_id, status, revision, dibuat_oleh, diubah_oleh |
| lap_Harian_UIW (1 baris AKTIF per tanggal) | No, Tanggal, Hari, ULP, Cuaca, Tim ROW, Laporan UIW, Input Oleh, Timestamp, Timestamp Update, lap_id, status, revision, dibuat_oleh, diubah_oleh |
| lap_C4A_UIW (1 baris per section, lap_id = lap_Harian_UIW) | No, Tanggal, Penyulang, Section, Jumlah Tiang, Panjang kmS, Temuan Peralatan, Temuan ROW, Eksekusi, Keterangan, Input Oleh, Timestamp, Timestamp Update, c4a_id, lap_id, section_id, status, revision, dibuat_oleh, diubah_oleh |

- Laporan dibangun dari modul ROW (`laporanUp3_`, `laporanUiw_`, data `dataRowHari_`: realisasi AKTIF foto lengkap, Tebang = Sedang + Besar, target `TARGET_RABAS_HARIAN` 20 / `TARGET_TEBANG_HARIAN` 6 dibagi per penyulang). Gangguan, Hartek, Inspeksi, P0, Tindak Lanjut gangguan, Tim Hartek tampil "-".
- C4A UP3 = bagian E Laporan UP3: per penyulang (nama resmi master, dikunci), Realisasi kmS diisi langsung (maks 2 desimal); Temuan, Tindak Lanjut, Eksekusi (tim yang melakukan tindak lanjut) teks satu baris, kosong = "-"; Keterangan tidak masuk WA. C4A UIW = CARE FOR ASSET: per section (Jumlah Tiang, Panjang kmS = tiang x 0,05 server, Temuan Peralatan, Temuan ROW, Eksekusi). Format UIW dibahas menyusul.
- v0.57: menu dipecah. `simpanLaporanUp3` `{tanggal, revision, c4a}` hanya menulis lap_Harian_UP3 + lap_C4A_UP3 (menu OPS_LAP_UP3); `simpanLaporanUiw` `{tanggal, revision, cuaca, c4a}` hanya lap_Harian_UIW + lap_C4A_UIW (menu OPS_LAP_UIW). Field lain = FIELD_TIDAK_DIKENAL. revision = revision baris harian laporan itu (0 = belum ada); beda = KONFLIK_REVISION. Daftar C4A = daftar lengkap, yang hilang = BATAL. Hanya hari ini (HANYA_HARI_INI).
- Guard: menu OPS_LAP_UP3 / OPS_LAP_UIW (akses diatur per laporan di db_Akses) lewat guard_ (sesi, menu aktif, platform MOBILE, UBAH untuk simpan) + `peranLaporanUp3_` (PETUGAS selalu ditolak walau db_Akses salah isi, simpan hanya ADMIN/SUPER). ADMIN_ES LIHAT (baris `docs/db_Akses_laporan_v0.57.tsv`). Tanggal > 7 hari = salinan tersimpan, hanya lihat. Dua baris AKTIF satu tanggal = DATA_GANDA (fail closed).
- Pemicu harian: `ADMIN_pasangPemicuLaporan` (sekali dari editor) memasang `ADMIN_buatBarisHarian` tiap hari 00.05 WIB: membuat baris lap_Harian_UP3 + lap_Harian_UIW hari itu kalau belum ada (Input Oleh / dibuat_oleh SISTEM, Cuaca kosong, salinan teks awal), idempoten. Berhenti: `ADMIN_berhentiPemicuLaporan`. Pemicu gagal = simpan pertama tetap membuat baris.
- Section di REALISASI ROW Laporan UIW (v0.56, kvlar): satu section = nama lengkap; lebih dari satu = bagian awal nama section dengan `urutan` terendah + " - " + bagian akhir nama section dengan `urutan` tertinggi (nama dipecah di " - " berspasi), mis. "GH Toboali - LBS Kampung Baru" + "Rec Rias - Ujung Serdang" = "GH Toboali - Ujung Serdang". Hanya section eksekusi AKTIF foto lengkap. WA tim ROW dan kolom Section realisasi tetap daftar dipisah koma.
