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
- `db_Jaringan`: `section_id` dikosongkan (diisi otomatis). `parent_section_id` = section induk (lebih dekat ke sumber/GI); kosong untuk section pertama. Boleh diketik nama section induk di penyulang yang sama, `ADMIN_lengkapiMaster` menggantinya jadi UUID dan memperingatkan nama ganda, induk tidak ketemu, atau topologi melingkar.
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
