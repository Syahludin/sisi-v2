# Audit Guard Semua Endpoint: SiSi v2 v0.86.0-fix1

Sumber: `02_Router.js` (endpoints_), `03_Guard.js`, `10_Auth.js`, plus fungsi peran di tiap modul. 53 endpoint: 3 publik (ping, login, mulaiShiftYandal), 50 bersesi.

## Lapisan guard (urutan eksekusi di proses_)
1. Payload maks 4 MB (doPost/rpc), JSON harus object, action harus terdaftar (hasOwnProperty), data harus object.
2. `cekVersiHp_`: hanya MOBILE, hanya bila WAJIB_VERSI_APP=YA. `versiApp` dikirim klien sendiri (bisa dipalsukan), jadi ini gerbang UX, bukan keamanan.
3. `guard_`: token 64 hex -> hash SHA-256 -> cache sesi (5 mnt) / indeks token / auth_Perangkat (dicabut, kedaluwarsa, umur mutlak 90 hari) -> profil dari db_Users+db_Tim (aktif, role valid, PETUGAS wajib tim).
4. Akun YANDAL: lewat akhir shift hanya endpoint `syncShift` (cekSesi, logout, daftarNotif, 6 endpoint P0/switching/gardu) sampai akhir mode sync (+24 jam).
5. `remSesi_`: 90 panggilan/menit/sesi + batas per endpoint.
6. Bila endpoint punya `menu`: platform menu cocok (MOBILE/WEB/KEDUANYA, platform ditentukan fungsi masuk doPost=MOBILE, rpc=WEB, bukan klaim klien), peran punya baris db_Akses, `tulis` butuh UBAH. Menu tidak ada / platform asing = tolak (fail closed).
7. Di dalam fungsi: peran/tim/kepemilikan dicek sebelum isi data dibaca, identitas selalu dari sesi.

## Matriks per endpoint
| endpoint | gerbang router | wajib UBAH | sync akhir shift | rem/menit | cek di dalam fungsi |
|---|---|---|---|---|---|
| ping | publik | - | - | - | - |
| login | publik | Y | - | - | rem login (user/HP/global), PBKDF2, lock akun |
| mulaiShiftYandal | publik | Y | - | - | tiket sekali pakai (cache 10 mnt, 1 install, maks percobaan), akun harus YANDAL, shift cocok |
| cekSesi | sesi saja | - | Y | 30 | profil dibaca ulang dari sheet |
| logout | sesi saja | - | Y | 10 | AKHIR_SHIFT hanya akun YANDAL |
| gantiPassword | sesi saja | - | - | 5 | tolak tim YANDAL, password lama wajib, rem gagal |
| getMaster | sesi saja | - | - | 30 | tanpa cek peran (semua sesi); modul pengguna dibatasi per peran; modul gardu/pejabatBa cek menu |
| daftarNotif | sesi saja | - | Y | 10 | HP saja; YANDAL/ADMIN/SUPER; install_id dari sesi |
| getPemakaian | menu OPS_ENGINE | - | - | 10 | ADMIN/SUPER |
| getKodeRow | menu ROW_EKSEKUSI | - | - | 30 | PETUGAS+ROW+tim |
| syncRow | menu ROW_EKSEKUSI | Y | - | 20 | PETUGAS+ROW+tim |
| uploadFotoRow | menu ROW_EKSEKUSI | Y | - | 30 | PETUGAS+ROW+tim, BUKAN_MILIK_TIM |
| getFotoRow | menu ROW_EKSEKUSI | - | - | 40 | timLaporan_ (PETUGAS ROW tim sendiri, admin semua) |
| getLaporanRow | menu ROW_LAPORAN | - | - | 30 | timLaporan_ |
| getArsipRow | menu ROW_LAPORAN | - | - | 20 | timLaporan_ |
| getArsipHariRow | menu ROW_LAPORAN | - | - | 10 | timLaporan_; hari ini ditolak utk PETUGAS |
| getFotoArsipRow | menu ROW_LAPORAN | - | - | 40 | timLaporan_ + izin cache per token (6 jam) |
| getLaporanUp3 | menu OPS_LAP_UP3 | - | - | 20 | bukan PETUGAS |
| simpanLaporanUp3 | menu OPS_LAP_UP3 | Y | - | 10 | ADMIN/SUPER |
| getLaporanGangguan | menu OPS_LAP_GANGGUAN | - | - | 20 | bukan PETUGAS; WEB + HP (db_Menu KEDUANYA) |
| getLaporanUiw | menu OPS_LAP_UIW | - | - | 20 | bukan PETUGAS |
| simpanLaporanUiw | menu OPS_LAP_UIW | Y | - | 10 | ADMIN/SUPER |
| getPetugasYandal | menu OPS_PETUGAS_YANDAL | - | - | 20 | bukan PETUGAS |
| simpanPetugasYandal | menu OPS_PETUGAS_YANDAL | Y | - | 10 | ADMIN/SUPER |
| getArsipYandal | sesi saja | - | - | 20 | PETUGAS YANDAL, HP, tim sendiri |
| getRankYandal | sesi saja | - | - | 20 | YANDAL atau non-PETUGAS (ADMIN_ES ikut) |
| getLaporanTimYandal (v0.99.0) | menu ROW_LAPORAN | - | - | 20 | bukan PETUGAS (wajibAdminLaporanYandal_, baris pertama), hanya baca |
| simpanP0Yandal | sesi saja | - | Y | 40 | YANDAL+HP+shift token+tim |
| uploadFotoP0Yandal | sesi saja | - | Y | 40 | YANDAL+HP+shift+tim |
| simpanSwitchingYandal | sesi saja | - | Y | 40 | YANDAL+HP+shift+tim (via P0 induk) |
| uploadFotoSwitchingYandal | sesi saja | - | Y | 40 | sama |
| simpanGarduYandal | sesi saja | - | Y | 40 | sama |
| uploadFotoGarduYandal | sesi saja | - | Y | 60 | sama |
| getApprovalP0 | menu OPS_VERIFIKASI_P0 | - | - | 30 | ADMIN/SUPER (wajibAdminP0_, baris pertama) |
| getFotoApprovalP0 | menu OPS_VERIFIKASI_P0 | - | - | 80 | ADMIN/SUPER (wajibAdminP0_, baris pertama) |
| simpanApprovalP0 | menu OPS_VERIFIKASI_P0 | Y | - | 40 | ADMIN/SUPER (wajibAdminP0_, baris pertama) |
| ubahJenisP0 | menu OPS_VERIFIKASI_P0 | Y | - | 20 | ADMIN/SUPER (wajibAdminP0_, baris pertama) |
| simpanAturanYandal | menu OPS_VERIFIKASI_P0 | Y | - | 10 | ADMIN/SUPER (wajibAdminP0_, baris pertama) |
| getNomorGarduBaru | menu OPS_BA_GARDU | - | - | 30 | ADMIN/SUPER (wajibAdminBa_, baris pertama) |
| getOwnerIdGardu | menu OPS_BA_GARDU | - | - | 30 | ADMIN/SUPER (wajibAdminBa_, baris pertama) |
| uploadFotoBaGardu | menu OPS_BA_GARDU | Y | - | 40 | ADMIN/SUPER (wajibAdminBa_, baris pertama) |
| simpanBaGardu | menu OPS_BA_GARDU | Y | - | 10 | ADMIN/SUPER (wajibAdminBa_, baris pertama) |
| getDaftarBaGardu | menu OPS_BA_GARDU | - | - | 30 | ADMIN/SUPER (wajibAdminBa_, baris pertama) |
| buatPdfBaGardu | menu OPS_BA_GARDU | Y | - | 6 | ADMIN/SUPER (wajibAdminBa_, baris pertama) |
| getBaGardu | menu OPS_BA_GARDU | - | - | 30 | ADMIN/SUPER (wajibAdminBa_, baris pertama) |
| getFotoBaGardu | menu OPS_BA_GARDU | - | - | 40 | ADMIN/SUPER (wajibAdminBa_, baris pertama) |
| getPdfBaGardu | menu OPS_BA_GARDU | - | - | 20 | ADMIN/SUPER (wajibAdminBa_, baris pertama) |
| ubahBaGardu | menu OPS_BA_GARDU | Y | - | 10 | ADMIN/SUPER (wajibAdminBa_, baris pertama) |
| uploadTtdBaGardu | menu OPS_BA_GARDU | Y | - | 30 | ADMIN/SUPER (wajibAdminBa_, baris pertama) |
| getTtdBaGardu | menu OPS_BA_GARDU | - | - | 20 | ADMIN/SUPER (wajibAdminBa_, baris pertama) |
| kirimEamBaGardu | menu OPS_BA_GARDU | Y | - | 20 | ADMIN/SUPER (wajibAdminBa_, baris pertama) |
| updateMasterGarduBa | menu OPS_BA_GARDU | Y | - | 10 | ADMIN/SUPER (wajibAdminBa_, baris pertama) |
| pesanNomorGardu | menu OPS_BA_GARDU | Y | - | 30 | ADMIN/SUPER (wajibAdminBa_, baris pertama) |
| lepasNomorGardu | menu OPS_BA_GARDU | Y | - | 30 | ADMIN/SUPER (wajibAdminBa_, baris pertama) |
| getFileArsipBaGardu | menu OPS_BA_GARDU | - | - | 20 | ADMIN/SUPER (wajibAdminBa_, baris pertama) |
| getWoAdmin | menu OPS_PENERUSAN_WO | - | - | 30 | admin, bukan PETUGAS (wajibAdminWo_, baris pertama) |
| teruskanWo | menu OPS_PENERUSAN_WO | Y | - | 40 | wajibAdminWo_; TERKIRIM boleh pindah, DIKERJAKAN / SELESAI ditolak; revision wajib |
| tarikWo | menu OPS_PENERUSAN_WO | Y | - | 20 | wajibAdminWo_; hanya TERKIRIM; revision wajib |
| getFotoWoAdmin | menu OPS_PENERUSAN_WO | - | - | 60 | wajibAdminWo_ (baris pertama); foto temuan / tiang dari Drive privat lewat server, mime image/* |
| getWoTim | menu OPS_WO_TIM | - | - | 30 | PETUGAS ROW / HARTEK / YANDAL + tim (wajibPetugasWo_, baris pertama; YANDAL = HP + token shift); WO tim sendiri |
| mulaiWo | menu OPS_WO_TIM | Y | - | 20 | wajibPetugasWo_; WO tim sendiri TERKIRIM -> DIKERJAKAN (terkunci); v1.0.16 paksa hanya tim yang tercatat di db_wo_riwayat (WO_DIPINDAH), WO selesai / sudah diputuskan ditolak |
| simpanPekerjaanWo | menu OPS_WO_TIM | Y | - | 40 | wajibPetugasWo_; WO tim sendiri DIKERJAKAN; isian per jenis tim (lain = FIELD_TIDAK_DIKENAL); idBaris tim lain = ID_DIPAKAI |
| hapusPekerjaanWo | menu OPS_WO_TIM | Y | - | 20 | wajibPetugasWo_; DRAFT milik tim, WO DIKERJAKAN |
| uploadFotoWo | menu OPS_WO_TIM | Y | - | 60 | wajibPetugasWo_; DRAFT milik tim, JPEG <= 2 MB, sha256, folder privat, ada = DUPLIKAT / FOTO_SUDAH_ADA |
| getFotoWoTim | menu OPS_WO_TIM | - | - | 60 | wajibPetugasWo_ (baris pertama); WO tim sendiri, foto pekerjaan wajib milik temuan + tim itu; Drive privat lewat server |
| selesaiWo | menu OPS_WO_TIM | Y | - | 10 | wajibPetugasWo_; WO tim sendiri DIKERJAKAN, min. 1 pekerjaan, foto wajib lengkap, Laporan Utama / shift tim hari ini; kirim ulang = duplikat |
| getWoGanda | menu OPS_WO_GANDA | - | - | 30 | v1.0.16 wajibAdminWo_ (baris pertama); WO yang diunggah lebih dari satu tim |
| getFotoWoGanda | menu OPS_WO_GANDA | - | - | 60 | v1.0.16 wajibAdminWo_ (baris pertama); foto temuan + pekerjaan (tlId milik temuan itu) lewat server |
| putuskanWoGanda | menu OPS_WO_GANDA | Y | - | 20 | v1.0.16 wajibAdminWo_; hanya tim yang mengunggah / pemilik; klaim aktif wajib ada; satu lock |
| hapusRealisasiInsDu | menu OPS_INSDU_INPUT | Y | - | 30 | v1.0.16 wajibPetugasInsDu_ (baris pertama); gardu tunggakan tim sendiri, tanpa temuan |

## Status temuan (diperbarui di v0.86.0-fix2)
| # | Temuan | Status |
|---|---|---|
| 1 | Token akun / tim nonaktif tanpa rem | DIPERBAIKI: penolakan diingat 5 menit (03_Guard.js), ikut epoch ADMIN_bersihkanCache |
| 2 | Sesi hidup maks 5 menit setelah akun dinonaktifkan | Tetap (cache 5 menit disengaja). Cabut segera: ADMIN_cabutSesi atau ADMIN_bersihkanCache |
| 3 | 13 endpoint di luar db_Menu / db_Akses | Tetap (disengaja, dibatasi di fungsi) |
| 4 | JSON.parse cache sesi tanpa try/catch | DIPERBAIKI (sesi dan aturan akses): cache korup dibuang, baca ulang sheet |
| 5 | Rem CacheService tidak atomik | Tetap (rem, bukan batas pasti) |
| 6 | Flag tulis pada login / mulaiShiftYandal | DIPERBAIKI: dihapus + test |
| 7-10 | Info (admin `*`, tes regex, template db_Menu, jendela sync 24 jam) | Tetap / catatan |

## v1.0.10: WO tindak lanjut temuan
- Admin (OPS_PENERUSAN_WO) dan tim (OPS_WO_TIM) dipisah menu; peran dicek di baris pertama fungsi (test audit peran-paling-awal + matriks fail closed).
- Pindah tim hanya selama `status_wo` TERKIRIM. `mulaiWo` = DIKERJAKAN: teruskanWo / tarikWo ditolak WO_SUDAH_DIMULAI, ubahTemuanInsJar / ubahTemuanInsDu ditolak WO_SUDAH_DIMULAI.
- Realisasi tim hanya ditulis di `selesaiWo`. Baris modul hasil WO dikunci: syncRow ubah / batal eksekusi `sumber = TEMUAN` = TERKUNCI_WO, ubahPekerjaanHartek pekerjaan dari WO = TERKUNCI_WO.
