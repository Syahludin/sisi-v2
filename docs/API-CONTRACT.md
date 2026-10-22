# Kontrak API

Dipindahkan ke PRD SiSi v2, bagian **6. Endpoint** (lihat `docs/PRD.md`).
File ini sengaja kosong supaya tidak ada dua versi aturan.

Ringkasan cepat (detail tetap di PRD):

| Endpoint | Status | Akses |
|---|---|---|
| ping | Ada | publik |
| login | Ada | publik |
| cekSesi | Ada | sesi |
| logout | Ada | sesi |
| getMaster | Ada | sesi |
| syncRow | Ada (v0.12, staging) | ROW_EKSEKUSI, UBAH |
| getKodeRow | Ada (v0.13, staging) | ROW_EKSEKUSI |
| uploadFotoRow | Ada (v0.14, staging) | ROW_EKSEKUSI, UBAH |
| getLaporanRow | Ada (v0.17, staging) | ROW_LAPORAN |
| getLaporanUp3 | Ada (v0.57) | OPS_LAP_UP3 (bukan PETUGAS) |
| simpanLaporanUp3 | Ada (v0.57) | OPS_LAP_UP3, UBAH, ADMIN/SUPER, hari ini |
| getLaporanUiw | Ada (v0.57) | OPS_LAP_UIW (bukan PETUGAS) |
| simpanLaporanUiw | Ada (v0.57) | OPS_LAP_UIW, UBAH, ADMIN/SUPER, hari ini |
| getLaporanUp3Uiw / simpanLaporanUp3Uiw | Dihapus v0.57 (AKSI_TIDAK_DIKENAL) | - |
| mulaiShiftYandal | Ada (v0.63.0) | publik (tiket login tahap 1) |
| getPetugasYandal | Ada (v0.63.0) | OPS_PETUGAS_YANDAL (bukan PETUGAS) |
| simpanPetugasYandal | Ada (v0.63.0) | OPS_PETUGAS_YANDAL, UBAH, ADMIN/SUPER |

## Yandal (v0.63.0)

- `login` akun PETUGAS tim YANDAL -> `{tahap: 'PILIH_PETUGAS', tiket, yandal: {tim, shift: {no, tanggal, hari, jam, kunci, sampai}, petugas: [{petugasId, nama, sibuk}], terpilih: [petugasId], min: 1, maks: 2}}` (tanpa token). Menit peralihan = `SHIFT_PERALIHAN`. Tim tanpa petugas aktif = `PETUGAS_KOSONG`.
- `mulaiShiftYandal` `{tiket, petugasIds: [1-2], installId}` -> respons login biasa + `sesiSampai`, `yandal: {shiftId, kodeShift, shift, petugas: [{petugasId, nama}]}`; `offlineSampai` = `sesiSampai`. Error: TIKET_TIDAK_VALID, SHIFT_BERAKHIR (tiket dari shift lain), JUMLAH_PETUGAS, ID_GANDA, PETUGAS_TIDAK_VALID, PETUGAS_SEDANG_BERTUGAS, SHIFT_SUDAH_DIMULAI, TERLALU_SERING (> 10 percobaan per tiket).
- Semua endpoint bersesi akun YANDAL: token lewat akhir shift = `SHIFT_BERAKHIR` (sesi habis, outbox tetap). `cekSesi` mengembalikan `sesiSampai` dan tidak memperpanjang lewat akhir shift.
- v0.63.5 `getArsipYandal` `{dari, sampai}` (yyyy-MM-dd, maks 31 hari, `sampai` <= hari ini): hanya akun YANDAL, tim sesi sendiri, hanya shift yang sudah selesai -> `{dari, sampai, shift: [{shiftId, kodeShift, tanggal, hari, shift, jamKerja, petugas[], checkIn, terlambat, rekapFinal, rekap{jumlahP0, proses, selesai, menunggu, approved, rejected, totalPoint, totalDurasi, jamEfektif, persenEfektif, totalJarak}, p0[{p0Id, kodeP0, namaPekerjaan, penyulang, section, daerah, statusP0, statusApproval, alasanRejected, point, durasi, jarakM (v0.65.8: meter, dulu jarak km), waktuSebelum, waktuSesudah, catatan}]}]}` (tanggal turun, shift turun). v0.64.1: hanya dari HP (MOBILE). Error: AKSES_DITOLAK, RENTANG_TIDAK_VALID, TANGGAL_DI_LUAR_BATAS, RENTANG_TERLALU_PANJANG.
- v0.63.5 `getRankYandal` `{periode?: 'YYYY-MM'}` (default bulan berjalan WIB): akun YANDAL + ADMIN / SUPER / ADMIN_ES (PETUGAS lain AKSES_DITOLAK) -> `{periode, diperbarui, target{shift, point, efektif}, bobot{jam, shift, p0, vcc}, vccTersedia, petugas: [{petugasId, nama, tim, rank, total, shift, point, menitEfektif, jumlahP0, persen{jam, shift, p0, vcc}}]}`. Cache server 10 menit. v0.64.1: periode lebih dari 24 bulan lalu / masa depan = TANGGAL_DI_LUAR_BATAS.
- v0.65.0 `simpanP0Yandal` (PETUGAS YANDAL, MOBILE, syncShift) `{p0Id, shiftId, namaPekerjaan, pekerjaanLainnya?, penyulang?, sectionId?, daerah?, catatan?, dibuat, dibuatHp?, sumberWaktu?, installId?, slotHp? ('SEBELUM,PEKERJAAN,...' foto yang sudah disimpan), final?}` -> `{p0Id, kodeP0, statusP0, statusApproval, alasanRejected, fotoServer[]}`. Kirim ulang p0Id sama = baris sama. final (hanya berlaku sesudah akhir shift) + slotHp tanpa SESUDAH = Rejected SISTEM "P0 Tidak Selesai", Point 0. Error: BUKAN_SHIFT_INI, WAKTU_DI_LUAR_SHIFT, WAKTU_MELEWATI_SERVER, PEKERJAAN_TIDAK_DIKENAL, SECTION_TIDAK_DIKENAL, SECTION_BUKAN_PENYULANG, PENYULANG_TIDAK_DIKENAL, ID_DIPAKAI.
- v0.65.0 `uploadFotoP0Yandal` (PETUGAS YANDAL, MOBILE, syncShift) `{p0Id, slot, sumber: 'KAMERA', sha256, ukuranByte, data (base64 JPEG <= 2 MB, sisi <= 2048), waktu, waktuHp?, sumberWaktu?, lat?, lng?, akurasiM?}` -> jawaban simpanP0Yandal + `status` OK / DUPLIKAT. Urut SEBELUM > PEKERJAAN > SESUDAH; SESUDAH = SELESAI + Menunggu (membatalkan Rejected SISTEM). Error: URUTAN_FOTO, FOTO_SUDAH_ADA, WAKTU_TIDAK_URUT, WAKTU_DI_LUAR_SHIFT, BUKAN_MILIK_TIM, FOTO_TIDAK_PRIVAT, CONFIG_TIDAK_LENGKAP (YANDAL_FOTO_FOLDER_ID).
  - v0.65.2: + `gpsSusulanDetik?` (0..30, bulat; wajib bersama lat/lng, kalau tidak FIELD_WAJIB; > 30 = DI_LUAR_RENTANG) = titik GPS didapat N detik sesudah jepret, disimpan di foto_meta. PEKERJAAN ber-GPS saat titik pekerjaan masih kosong = jadi Koordinat / Lat / Long (foto_meta.sumberKoordinat = PEKERJAAN).
- v0.66.0 `simpanSwitchingYandal` (PETUGAS YANDAL, MOBILE, syncShift) `{switchingId, p0Id, sectionId, indikatorRemote, indikatorLocal, indikatorProtection, indikatorReclose ('Nyala' | 'Padam'), arusR, arusS, arusT (0..5000), catatan?, dibuat (v0.66.2, wajib: jam terpercaya HP, di jam shift, >= foto Sebelum P0), installId?}` -> `{switchingId, p0Id, kodeSwitching, namaSwitching, fotoServer[]}`. Kirim ulang sama = tidak dobel; sesudah ada hanya arus boleh berubah. Error: BUKAN_PENGECEKAN_SWITCHING, URUTAN_FOTO (Sebelum P0 belum ada), BUKAN_SWITCHING (bukan LBS / ACR), SECTION_BUKAN_PENYULANG, SWITCHING_TERKUNCI, P0_SUDAH_SELESAI, ID_DIPAKAI, BUKAN_MILIK_TIM, SWITCHING_SUDAH_ADA (1 switching per P0, v0.66.3).
- v0.66.0 `uploadFotoSwitchingYandal` `{switchingId, slot: ARUS | GANGGUAN_1..5, sumber: 'KAMERA', sha256, ukuranByte, data, waktu, waktuHp?, sumberWaktu?, lat?, lng?, akurasiM?, gpsSusulanDetik?}` -> jawaban simpanSwitchingYandal + `status` OK / DUPLIKAT. ARUS dulu; foto >= foto Sebelum P0, di jam shift. Error: URUTAN_FOTO, FOTO_SUDAH_ADA, P0_SUDAH_SELESAI, WAKTU_TIDAK_URUT, WAKTU_DI_LUAR_SHIFT.
- v0.66.0 `uploadFotoP0Yandal` slot SESUDAH untuk P0 Pengecekan Switching: SWITCHING_BELUM_ADA kalau belum ada switching ber-foto arus. `simpanP0Yandal` P0 baru Pengecekan Switching tanpa penyulang = FIELD_WAJIB.
- v0.66.4 `simpanP0Yandal` + `ubahLokasi?` (bool): P0 sudah ada = terapkan penyulang / sectionId / daerah baru (tanpa ubahLokasi data lokasi kiriman ulang diabaikan). Ditolak: P0_SUDAH_SELESAI (SELESAI / ada Status Approval), SWITCHING_TERKUNCI (P0 Pengecekan Switching yang switching-nya sudah ada). P0 Pengecekan Switching (baru maupun ubahLokasi) wajib penyulang + section berawalan LBS / ACR: FIELD_WAJIB (penyulang / section), BUKAN_SWITCHING. Audit UBAH_LOKASI_P0.
- v0.66.4 `simpanSwitchingYandal` switching baru: sectionId wajib sama dengan section P0, selain itu SECTION_BEDA_P0.
- v0.66.5 `simpanP0Yandal` + `lokasiDiubah?` (waktu, jam terpercaya HP saat edit): wajib bila ubahLokasi benar-benar mengubah lokasi (FIELD_WAJIB), harus di jam shift (WAKTU_DI_LUAR_SHIFT), tidak lewat jam server (WAKTU_MELEWATI_SERVER), tidak sebelum P0 dibuat (WAKTU_TIDAK_URUT). Edit offline sebelum akhir shift tetap diterima walau terkirim sesudah shift.
- v0.67.0 `gantiPassword` (semua akun bersesi kecuali tim YANDAL, MOBILE / WEB, rem 5 / menit) `{passwordLama, passwordBaru}` -> `{diganti: true, sesiLainDicabut}`. Error: PASSWORD_LAMA_SALAH, PASSWORD_TERLALU_PENDEK (< 10), PASSWORD_SAMA, PASSWORD_LEMAH (= username), TERLALU_SERING (salah 5x / 15 menit), DATA_BERUBAH (password berubah bersamaan), AKSES_DITOLAK (tim YANDAL).
- v0.69.0 `getMaster` modul **opsional** `gardu` dan `pejabatBa` (hanya kalau diminta di `modul`; getMaster tanpa `modul` tetap modul dasar). `gardu` (akses menu OPS_PENGUKURAN_GARDU atau OPS_BA_GARDU, selain itu AKSES_DITOLAK): db_Gardu status AKTIF + TIDAK AKTIF, urut No Gardu -> `[{id, no, prefix, status, asalNomor, alamat, penyulang, section, sectionId, ptsLbs, lat, lng, konstruksi, kva, merk, seri, tahun, jurusan, asalTrafo, merkPhb, seriPhb, tahunPhb, kepemilikan, ownerId, extRef, baOperasi, tglOperasi, baTerakhir, jenisBaTerakhir, tglBaTerakhir, jumlahBa, tglUkur, kodeUkur, arusMaks, bebanKva, persen, waktuBeban, kategori, revision}]` (tanggal yyyy-MM-dd, angka kosong = null, kategori dihitung ulang dari persen). `pejabatBa` (akses OPS_BA_GARDU): `[{id, nama, jabatan, peran, urutan, aktif}]`. db_Gardu STRUKTUR_BERUBAH = ditolak.
- v0.70.0 BA Gardu (menu OPS_BA_GARDU, MOBILE, khusus ADMIN / SUPER selain itu AKSES_DITOLAK): `getNomorGarduBaru {prefix: TB|PY|TL|PG}` -> `{prefix, nomor, terakhir, batal: [{garduId, noGardu, alamat, penyulang}]}`; `getOwnerIdGardu {sectionId}` -> `{ditemukan, ownerId, externalReference, pesan}` (SECTION_TIDAK_VALID); `uploadFotoBaGardu {baId, jenis: 'Pengoperasian Trafo', slot: NAMEPLATE|FULL_GARDU|NAMEPLATE_PHB|BOX_PHB, sumber: KAMERA|GALERI, sha256, ukuranByte, data (JPEG base64 <= 2 MB, sisi <= 2048)}` -> `{fileId, slot, status: OK|DIGANTI}` (BA_SUDAH_DISIMPAN, FOTO_RUSAK, FORMAT_FOTO_SALAH, FOTO_TERLALU_BESAR, CONFIG_TIDAK_LENGKAP GARDU_FOTO_FOLDER_ID); `simpanBaGardu {baId, jenis, prefix, nomorBatalId?, tanggalBa, tanggalPekerjaan, sectionId, alamat, koordinat 'lat, lng', konstruksi Portal|Cantol, kva, merk, seri, tahun, jurusan, merkPhb?, seriPhb?, tahunPhb?, kepemilikan PLN|Non-PLN (Lisdes), perluasanSutm?, vendor?, catatan?, petugas1Id, petugas2Id?, installId?}` -> `{status: OK|DUPLIKAT, baId, idBa, noBaFull, noGardu, garduId, ownerId, externalReference, statusPdf, peringatan?}`. Error: JENIS_BA_BELUM_TERSEDIA (selain Pengoperasian Trafo), FOTO_BELUM_LENGKAP, NOMOR_BATAL_TIDAK_TERSEDIA, PEJABAT_TIDAK_VALID, PEJABAT_MENGETAHUI_TIDAK_VALID, SECTION_TIDAK_VALID, TANGGAL_TIDAK_VALID, STRUKTUR_BERUBAH.
- v0.64.2: setiap jawaban (ok maupun gagal) membawa `waktu` (ISO, jam server dicap setelah proses) untuk patokan jam terpercaya HP.
- v0.63.4 mode sync: sesudah akhir shift sampai `syncSampai` (akhir shift + 24 jam) token YANDAL hanya diterima endpoint `syncShift` (`cekSesi`, `logout`, nanti kirim P0 + foto P0); endpoint lain `SHIFT_BERAKHIR`. Lewat `syncSampai` semua `SHIFT_BERAKHIR`. `mulaiShiftYandal` dan `cekSesi` mengembalikan `syncSampai`; `cekSesi` juga `modeSync` (true = shift sudah selesai). `logout` menerima `alasan: 'AKHIR_SHIFT'` (yan_Login Alasan Logout, log_Audit LOGOUT_AKHIR_SHIFT).
- `getPetugasYandal` `{}` -> `{tim: [{timId, nama, kode, jumlah}], petugas: [{petugasId, nama, timId, aktif, revision, bertugas}], peringatan, batas: {min: 2, maks: 8}}`.
- `simpanPetugasYandal` `{ubah?: [{petugasId, revision, timId?, aktif?, nama?}], baru?: [{nama, timId}]}` (maks 50) -> respons get + `diubah`. Error: KONFLIK_REVISION, TIM_TIDAK_VALID, PETUGAS_GANDA, DATA_TIDAK_DITEMUKAN, ID_GANDA.

## Laporan UP3 / UIW (v0.57)

- `getLaporanUp3` / `getLaporanUiw` `{tanggal}` -> `{bagian, tanggal, sumber: LIVE|ARSIP, hariIni, bisaUbah, laporan, revision, c4a, statusTim, row, waText, cuaca (UIW saja)}`. Tanggal > 7 hari = ARSIP (salinan tersimpan, revision null).
- `simpanLaporanUp3` `{tanggal, revision, c4a: [{id, penyulang, realisasiKms, temuan?, tindakLanjut?, eksekusi?, keterangan?}]}`.
- `simpanLaporanUiw` `{tanggal, revision, cuaca?, c4a: [{id, sectionId, jumlahTiang, temuanPeralatan, temuanRow, eksekusi, keterangan?}]}`.
- Respons simpan = respons get untuk hari itu. Error: HANYA_HARI_INI, KONFLIK_REVISION, ID_GANDA, DATA_GANDA, FIELD_TIDAK_DIKENAL.
- v0.62.9: respons get / simpan punya `tertunda` (bool). true = simpan terakhir terputus setelah C4A tertulis tetapi sebelum baris harian (revision) dikunci; isi C4A lengkap tapi BELUM final. Simpan ulang payload + revision yang sama aman (lap_id baris harian baru = `LAP-<UP3|UIW>-<tanggal>`, tidak acak). HP mengirim ulang otomatis saat gagal jaringan / SERVER_SIBUK / KESALAHAN_SERVER; KONFLIK_REVISION setelah percobaan gagal = muat ulang, isi sama = berhasil.
- v0.71.0 PDF BA (menu OPS_BA_GARDU, khusus ADMIN / SUPER): `buatPdfBaGardu {baId}` (UBAH) -> `{baId, idBa, statusPdf: SELESAI, urlPdf, fileId, waktuPdf, namaFile, fotoHilang: [label]}`; error PDF_ENGINE_BELUM_DISET, PDF_ENGINE_DITOLAK (401 / engine tanpa rahasia), PDF_ENGINE_TIDAK_SIAP (0/429/502/503/504 sesudah 3 percobaan), PDF_GAGAL, PDF_SEDANG_DIBUAT, PDF_JENIS_BELUM_TERSEDIA, PDF_TIDAK_PRIVAT, BA_TIDAK_DITEMUKAN, BA_SUDAH_BATAL, CONFIG_TIDAK_VALID. `getDaftarBaGardu {cari?, batas? 1-200 (50)}` -> `{jumlah, isi: [{baId, idBa, noBaFull, jenis, noGardu, tanggalBa, penyulang, statusBa, statusPdf, urlPdf, fileId, waktuPdf, pdfBisa}]}` No terbesar dulu. Engine: `GET /` health, `POST /v2/cek`, `POST /v2/ba/pengoperasian-trafo {versi: 1, idBa, data, foto: {NAMEPLATE, FULL_GARDU, NAMEPLATE_PHB, BOX_PHB}}` -> application/pdf.
- v0.72.0: jawaban gagal validasi isian membawa `kolom` (nama kunci data, mis. `{ok:false, kode:'DI_LUAR_RENTANG', kolom:'tahunPhb'}`); error lain tanpa `kolom`. simpanBaGardu `kepemilikan: PLN | Non-PLN` (`Non-PLN (Lisdes)` masih diterima, disimpan `Non-PLN`).
- v0.73.0 (OPS_BA_GARDU, ADMIN / SUPER, UBAH): `pesanNomorGardu {baId, prefix, nomorBatalId?}` -> `{baId, prefix, nomor, asal: BARU|ULANG BATAL, garduId, aktifSampai, menitBerlaku, terakhir, batal: [...]}` (BA_SUDAH_DISIMPAN, NOMOR_BATAL_TIDAK_TERSEDIA, SHEET_TIDAK_ADA res_NomorGardu); `lepasNomorGardu {baId}` -> `{dilepas}`. `simpanBaGardu` + `noGarduWatermark?` (error baru NOMOR_GARDU_BERUBAH). getNomorGarduBaru melewati nomor yang dipesan BA lain.


## v0.74.0 Pengecekan Gardu (PETUGAS YANDAL, MOBILE, syncShift)
- simpanGarduYandal: ukurId, p0Id, garduId, bebanR/S/T/N (0-3000 A), teganganRS/RT/ST/RN/SN/TN (0-1000 V), catatan (maks 300), dibuat, installId. Jawab: ukurId, kodeUkur, noGardu, hasil {arusMaks, kva, persen, kategori, tidakSeimbang, waktuBeban, jarakM}, diterapkan, fotoServer.
- uploadFotoGarduYandal: ukurId, slot BEBAN_R (pertama) / BEBAN_S/T/N / TEGANGAN_RS/RT/ST/RN/SN/TN / KONDISI (opsional), sumber KAMERA, sha256, ukuranByte, data, waktu, lat/lng.
- Error baru: BUKAN_PENGECEKAN_GARDU, GARDU_TIDAK_DIKENAL, GARDU_TIDAK_AKTIF, GARDU_BUKAN_PENYULANG, GARDU_TERKUNCI, PENGUKURAN_GARDU_SUDAH_ADA, PENGUKURAN_GARDU_BELUM_LENGKAP.
- getMaster modul gardu: kini juga untuk akun PETUGAS YANDAL.

## v0.75.0 Approval P0 + aturan gardu (menu OPS_VERIFIKASI_P0, ADMIN/SUPER)
- getApprovalP0 {tanggal, status?} -> {tanggal, jumlah, list}
- getFotoApprovalP0 {p0Id, jenis P0|SWITCHING|GARDU, id?, slot, ukuran KECIL|PENUH} -> foto base64
- simpanApprovalP0 {p0Id, keputusan Approved|Rejected, alasan (wajib kalau Rejected), bobot (Lain-Lain), revision?}
- ubahJenisP0 {p0Id, namaPekerjaan, pekerjaanLainnya?, alasan, bobot?, revision?} (riwayat di foto_meta.KOREKSI_JENIS)
- simpanAturanYandal {garduDuaHari: bool} -> Script Property ATURAN_GARDU_UKUR_2_HARI
- getMaster modul aturanYandal -> [{kunci:'garduDuaHari', aktif, jedaHari:2}]
- Error baru: GARDU_BARU_DIUKUR, P0_BELUM_SELESAI, P0_DITOLAK_SISTEM, DATA_BERUBAH

## v0.76.0 BA Gardu (menu OPS_BA_GARDU, ADMIN/SUPER)
- getBaGardu {baId} -> isian lengkap BA (form edit) + foto: [slot]
- getFotoBaGardu {baId, slot, ukuran KECIL|PENUH} -> foto base64 (tanpa link Drive)
- getPdfBaGardu {baId} -> {namaFile, mime, ukuranByte, data base64}; error PDF_BELUM_ADA, PDF_TERLALU_BESAR
- uploadFotoBaGardu + revisi:true -> foto pengganti BA tersimpan (penanda <baId>-<slot>-REVISI)
- ubahBaGardu {baId, revision, tanggalPekerjaan, sectionId, alamat, koordinat, ... petugas1Id, petugas2Id, alasan?} -> {status OK|TIDAK_BERUBAH, diubah, revisiBa}
  Nomor gardu / ID BA / No BA / Tanggal BA / jenis tetap. Revisi BA +1, Status PDF BELUM, db_Gardu ikut kalau BA ini BA terakhir gardu.

## v0.77.0
- simpanBaGardu: jawaban + `folder` (`Gardu/<No Gardu>/<YYYY-MM-DD>_<Jenis BA>`, kosong kalau pindah folder gagal; BA tetap tersimpan). Kontrak lain tidak berubah, HP tidak perlu diubah.
- uploadFotoBaGardu: BA baru -> `Gardu/_Upload Sementara/<baId>`; revisi:true -> langsung folder BA.
- buatPdfBaGardu: PDF di folder BA (BA_PDF_FOLDER_ID diabaikan).

## v0.78.0 (OPS_BA_GARDU, ADMIN / SUPER)
- getDaftarBaGardu + {urut TERBARU|TERLAMA, dari, sampai (Tanggal BA), jenis, tahap DRAFT|PROSES_TTD|TTD_ULANG|SELESAI_TTD|BATAL} -> + ringkasan {tahap: n} (sebelum filter tahap); isi + {tahap, statusTtd, adaTtd, waktuTtd, eamTerakhir, eamKali, masterTerakhir}.
- uploadTtdBaGardu {baId, uploadId, ke, dari (<= 5), mime application/pdf|image/jpeg|image/png, namaFile?, sha256 (file utuh), ukuranByte (<= 10 MB), data (bagian <= 2 MB, selain terakhir tepat 2 MB)} -> BAGIAN | {status OK, namaFile, fileId, ulang, tahap...}. Error PDF_BELUM_ADA, FILE_RUSAK, FORMAT_FILE_SALAH, BAGIAN_HILANG.
- getTtdBaGardu {baId} -> {namaFile, mime, ukuranByte, data base64}. Error TTD_BELUM_ADA.
- kirimEamBaGardu {baId} -> {teks (format WA EAM v1, baris akhir "File BA : terlampir (<nama>)"), namaFile, eamKali}. Error TTD_BELUM_ADA, TTD_PERLU_ULANG.
- updateMasterGarduBa {baId} -> {status OK|TIDAK_BERUBAH, noGarduMaster, diubah: [{kolom, lama, baru}]}. Error TTD_BELUM_ADA, TTD_PERLU_ULANG, MASTER_LEBIH_BARU, GARDU_TIDAK_DITEMUKAN.
- getBaGardu + {tahap, statusTtd, adaTtd, waktuTtd, eamTerakhir, eamKali, masterTerakhir, petugas1, petugas2, ownerId, externalReference, folder}.

## v0.79.0
- Tidak ada endpoint baru. getMaster modul gardu tidak berubah (kolom pengukuran baru hanya di sheet). Sinkron sheet lama = pemicu editor (ADMIN_*), bukan endpoint.

## v0.80.0
- kirimEamBaGardu + {aksesEam: jumlah akun EAM yang bisa membuka file, peringatan}. teks: baris "Link BA : <url>" (kalau aksesEam > 0) lalu "File BA : terlampir (<nama>)".

## v0.81.0
- ping -> data.versi {server, minimum, linkUnduh, catatan}. Semua jawaban sukses membawa `versi` (versi backend). HP: app < minimum = wajib update (dialog tidak bisa ditutup), app < server = update tersedia (Nanti), app > server = info server belum diperbarui.

## v0.81.1
- Amplop request HP: {action, token?, data, versiApp}. Error UPDATE_APLIKASI_DULU (WAJIB_VERSI_APP = YA dan versiApp < minimum / kosong).

## v0.82.0
- Tidak ada endpoint baru. Migrasi P0 = fungsi editor (ADMIN_migrasiP0*). P0 hasil migrasi berstatus Menunggu ikut tampil di getApprovalP0, fotonya dibaca getFotoApprovalP0 (sha256 dari foto_meta).

## v0.82.1
- Tidak ada perubahan endpoint.

## v0.83.0
- `daftarNotif` (bersesi, HP saja, akun YANDAL / ADMIN / SUPER, boleh di mode sync akhir shift, rem 10 / menit): data {fcmToken}. Jawab {terdaftar: true}. Lain = AKSES_DITOLAK. Token sama + baru didaftar (< 24 jam) = tidak menulis.
- Notifikasi FCM: data.jenis = PENGINGAT_LOGIN (HP Yandal) / BELUM_LOGIN_YANDAL (HP admin) / UJI, data.tanggal, data.shift.

## v0.86.0
- `getDaftarBaGardu` + data {sumber? V2 (default, app lama) | V1 (arsip v1 saja) | SEMUA (BA v2 + arsip v1 satu halaman, urut Tanggal BA), mulai? (offset halaman berikutnya)}. Jawab + {arsipAda (sheet arsip_BA_V1 ada), arsipDiperbarui}. ringkasan dihitung dari kedua sumber (sebelum filter tahap). Item arsip: {arsip: true, arsipId, baId '', noGardu = nama, statusBa ARSIP, pdfBisa false, statusPdf SELESAI | BELUM, statusPdfV1, statusTtd SUDAH TTD | BELUM TTD, tahap DRAFT | PROSES_TTD | SELESAI_TTD, sumber, peralatan, idBa, noBaFull, jenis, nama, garduId, tanggalBa, penyulang, section, alamat, kva, jenisSwitching, adaPdf, adaTtd, urlPdf, urlTtd, waktuPdf}. cari No Gardu ditulis bebas (tb414 / TB-0414 = TB0414) berlaku untuk v2 dan arsip. Arsip BA_RUSAK hanya bila sumber V1 / SEMUA.
- `getFileArsipBaGardu` (menu OPS_BA_GARDU, ADMIN / SUPER, rem 20 / menit): data {arsipId, berkas PDF | TTD}. Jawab {arsipId, berkas, namaFile, mime (application/pdf | image/jpeg | image/png), ukuranByte, url, data base64}. Error: ARSIP_BA_TIDAK_ADA, ARSIP_FILE_TIDAK_ADA (tidak tercatat / Drive tidak bisa dibuka), FILE_TERLALU_BESAR (PDF > 20 MB, TTD > 10 MB), FORMAT_FILE_SALAH, ARSIP_BA_RUSAK.

## v0.85.0
- `getPemakaian` sekarang lewat menu OPS_ENGINE (cek db_Akses, tetap rem 10 / menit), data {segarkan?: bool} (true = abaikan cache Cloud Run 10 menit). Jawab = v0.84.0 + cloudRun {aktif, pesan, proyek, bulan, diperbarui, gratis {request, vcpuDetik, gibDetik}, total {hariIni {request, vcpuDetik, gibDetik}, bulan {request, vcpuDetik, gibDetik}}, persen {request, vcpuDetik, gibDetik}, persenMaks, layanan [{nama, hariIni {request, vcpuDetik}, bulan {request, vcpuDetik, gibDetik}, persenVcpu}]}. cloudRun.aktif false + pesan bila CLOUD_RUN_PROJECT kosong / izin kurang (status keseluruhan tidak ikut). Notifikasi PEMAKAIAN juga terkirim bila Cloud Run >= 80% / 95%.

## v0.84.0
- `getPemakaian` (bersesi, ADMIN / SUPER, HP + web, rem 10 / menit, data {}): {tanggal, paket, status AMAN / WASPADA / BAHAYA, pemicu {menit, batasMenit, persen, jalan, perFungsi [{nama, menit}], direm {handler: n}}, manual {menit, jalan}, urlFetch {jumlah, batas, persen, pdf, fcm}, pdfBulan {bulan, request, batasRequest, vcpuDetik, batasVcpuDetik, persen}, riwayat [{tanggal, pemicuMenit, pemicuPersen, urlFetch, urlPersen}] (7 hari)}. Notifikasi FCM data.jenis = PEMAKAIAN.

## v0.99.0 Laporan per Tim: tim YANDAL (menu ROW_LAPORAN, bukan PETUGAS)
- `getLaporanTimYandal` {tanggal? (yyyy-MM-dd, tanggal OPERASIONAL; default = tanggal shift sekarang, maks 31 hari ke belakang), timId? (uuid, satu tim)} -> `{tanggal, hari, sekarang {no, tanggal, jam, waktu}, ringkas {shift, jam, jumlahTim, sudahLogin, belumLogin} | null (hanya tanggal operasional sekarang), tim: [{timId, nama, kode, petugasAktif, shift: [{no, jam, status, mulai, akhir, menitBelumLogin, shiftId, kodeShift, petugas[], checkIn, terlambat, jumlahLogin, hpAktif, login: [{waktuMasuk, perangkat, platform, petugas, waktuLogout, alasanLogout, aktif}], rekapFinal, rekap {jumlahP0, proses, selesai, menunggu, approved, rejected, totalPoint, totalDurasi, jamEfektif, persenEfektif, totalJarak}, p0: [ringkas P0 seperti getArsipYandal]}] x3}]}`.
- status shift: BELUM_MULAI (jadwal belum tiba) | BELUM_LOGIN (berjalan, belum ada yan_Shift) | LOGIN (berjalan, sudah check-in) | SELESAI | TIDAK_LOGIN (lewat tanpa yan_Shift). Shift 3 = 00:00-08:00 hari berikutnya (tanggal operasional kemarin).
- hpAktif = baris yan_Login shift itu tanpa Waktu Logout dan Sesi Sampai belum lewat. Rekap dihitung langsung dari yan_P0 (hitungRekapShift_, P0 BATAL tidak ikut).
- Error: AKSES_DITOLAK (PETUGAS / tanpa menu ROW_LAPORAN), TANGGAL_DI_LUAR_BATAS (masa depan / > 31 hari), CONFIG_TIDAK_LENGKAP (YANDAL_SHEET_ID). Hanya baca, tanpa lock, rem 20 / menit.

## v1.0.5 Inspeksi Jaringan (menu OPS_INSJAR_INPUT, PETUGAS INSPEKSI_JARINGAN)
- `simpanRealisasiInsJar` / `ubahRealisasiInsJar`: `sectionAwal`, `sectionAkhir`, `segmen` DIHAPUS (dikirim = FIELD_TIDAK_DIKENAL). Ganti `section?` (section db_Jaringan penyulang itu, SECTION_TIDAK_VALID). `getInsJarHarian` realisasi = `{realisasiId, kodeRealisasi, penyulang, tier, section, totalTiang, revision, temuan[]}`.
- `simpanTemuanInsJar` / `simpanTemuanInspeksi`: `segmen` hanya disimpan untuk objekInspeksi Jaringan. simpanTemuanInsJar jawab + `revision: 1`.
- Baru `ubahTemuanInsJar` `{temuanId, revision, objekInspeksi?, tierInspeksi?, section, jenisTemuanId, nomorTiang?, segmen?, deskripsi?, koordinat?}` (isian LENGKAP: opsional yang tidak dikirim = dikosongkan) -> `{temuanId, kodeTemuan, revision, temuan}`. Error: KONFLIK_REVISION, BUKAN_MILIK_TIM, TANGGAL_DI_LUAR_BATAS, SECTION_TIDAK_VALID, JENIS_TEMUAN_TIDAK_VALID, FIELD_WAJIB, FIELD_TIDAK_DIKENAL (mis. penyulang). Rem 40 / menit.
- `uploadFotoInsJar` / `uploadFotoTemuanInspeksi`: jawaban + `revision` (revision temuan sesudah foto ditulis).

## v1.0.6 Inspeksi Jaringan (menu OPS_INSJAR_INPUT)
- `simpanRealisasiInsJar`: `section` WAJIB (create). Duplikat = penyulang + tier + section (REALISASI_GANDA). Satu penyulang boleh punya beberapa section.
- `ubahRealisasiInsJar`: ganti `section` ditolak SECTION_TERKUNCI kalau realisasi sudah punya temuan. Duplikat dicek dengan tier + section baru.
- `simpanTemuanInsJar` / `ubahTemuanInsJar`: `section` TIDAK diterima (FIELD_TIDAK_DIKENAL). Section temuan = section penyulang utama (`realisasiId`). Admin (`simpanTemuanInspeksi`) tetap kirim `penyulang` + `section`.


## v1.0.8 Inspeksi Gardu (menu OPS_INSDU_INPUT, PETUGAS INSPEKSI_GARDU)
- `getMasterInsDu {}` -> `{gardu[{garduId, noGardu, penyulang, section, alamat, kapasitasKva, merk}], jenisTemuan[], tier[], cover[{kunci, pilihan[]}]}` (gardu AKTIF db_Gardu, jenis objek Gardu).
- `getInsDuHarian {}` -> `{tanggal, header|null, realisasi[{realisasiId, kodeRealisasi, garduId, noGardu, penyulang, section, alamat, kapasitasKva, merkTrafo, tier, statusUkur, masukLaporan, revision, pengukuran|null {pengukuranId, kodePengukuran, revision, lwbp|null, wbp|null, cover{}, catatan}, temuan[]}], tunggakan|null {headerId, kodeHeader, tanggal, realisasi[{realisasiId, kodeRealisasi, noGardu}]}}`. Periode = `{waktu, teganganRS..TN, bebanR..N, kva, persen, kategori, tidakSeimbang}`.
- `buatHeaderInsDu` / `ubahHeaderInsDu`: isian sama dengan InsJar. Error baru `PENGUKURAN_H1_BELUM_LENGKAP` (detail = kode header + no gardu).
- `simpanRealisasiInsDu {headerId, garduId, tier, idBaris?}` -> `{realisasiId, kodeRealisasi, temuanLanjutan[]}`. Error: GARDU_TIDAK_DIKENAL, GARDU_TIDAK_AKTIF, GARDU_GANDA.
- `simpanPengukuranInsDu {realisasiId, periode: LWBP|WBP, waktu?, teganganRS, teganganRT, teganganST, teganganRN, teganganSN, teganganTN, bebanR, bebanS, bebanT, bebanN, catatan?, coverFcoAtas.. jumperanBawah (LWBP wajib, WBP ditolak)}` -> `{realisasiId, periode, statusUkur, masukLaporan, pengukuran, diterapkan}`. Error: URUTAN_PENGUKURAN, TANGGAL_DI_LUAR_BATAS (selain WBP tunggakan), PILIHAN_TIDAK_VALID.
- `simpanTemuanInsDu {realisasiId, jenisTemuanId, tierInspeksi?, deskripsi?, koordinat?, idBaris?}` -> `{temuanId, kodeTemuan, jumlahTemuan, revision}`; `ubahTemuanInsDu {temuanId, revision, jenisTemuanId, tierInspeksi?, deskripsi?, koordinat?}` (isian lengkap); `uploadFotoInsDu` = skema uploadFotoInsJar (slot TEMUAN / TIANG, folder `Inspeksi Gardu/<tanggal>/<kode header>`).

## v1.0.10 WO tindak lanjut temuan
Admin (menu OPS_PENERUSAN_WO, bukan PETUGAS):
- `getWoAdmin {status?: BARU|TERKIRIM|DIKERJAKAN|SELESAI|AKTIF (default)|SEMUA, dari?, sampai?}` -> `{status, ringkas{baru, terkirim, dikerjakan, selesai}, tim[{timId, nama, kode, jenis}], temuan[ temuan + wo{status, timId, tim, jenisTim, catatanAdmin, diteruskanOleh, waktuDiteruskan, dimulaiOleh, waktuMulai, tindakLanjut, jumlahPekerjaan, diselesaikanOleh, waktuSelesai} + pekerjaanWo[] ]}` (maks 500, terbaru dulu).
- `teruskanWo {temuanId, timId, catatan?, revision}` -> `{temuanId, revision, pindah, temuan}`. Kirim ulang ke tim lain selama TERKIRIM = pindah. Error: TIM_TIDAK_VALID, WO_SUDAH_DIMULAI, WO_SUDAH_SELESAI, KONFLIK_REVISION.
- `tarikWo {temuanId, revision}` -> kembali ke Penugasan Tim. Error: WO_BELUM_DITERUSKAN, WO_SUDAH_DIMULAI.
- v1.0.15 `getFotoWoAdmin {temuanId, slot TEMUAN|TIANG, ukuran?: KECIL (default, thumbnail Drive) | PENUH}` -> `{temuanId, slot, mime, kecil, ukuranByte, data (base64)}`. Error: FOTO_TIDAK_ADA, FOTO_TIDAK_VALID.
Tim (menu OPS_WO_TIM, PETUGAS ROW / HARTEK / YANDAL; YANDAL dari HP saat shift):
- `getWoTim {}` -> `{jenisTim, laporanUtamaAda, slotWajib[], master{jenis[], section[] (ROW)}, wo[]}` (TERKIRIM, DIKERJAKAN, SELESAI 7 hari).
- `mulaiWo {temuanId, revision}` -> `{temuanId, revision, temuan}`; sudah dimulai = duplikat.
- `simpanPekerjaanWo {temuanId, idBaris?, catatan?, koordinat?, ROW: diameter, sectionId?, nomorTiang? | HARTEK: jenisId, jumlah | YANDAL: namaPekerjaan, pekerjaanLainnya?}` -> `{tlId, kodeTl, revision, pekerjaan}`. Error: WO_BELUM_DIMULAI, WO_SUDAH_SELESAI, DIAMETER_DI_LUAR_KATEGORI, SECTION_TIDAK_COCOK, PEKERJAAN_TIDAK_DIKENAL, PEKERJAAN_TIDAK_DIDUKUNG, FIELD_TIDAK_DIKENAL.
- `hapusPekerjaanWo {tlId, revision}` (DRAFT) ; `uploadFotoWo {tlId, slot SEBELUM|PEKERJAAN|SESUDAH, sha256, ukuranByte, data, sumber?, waktu?, lat?, lng?, akurasiM?}` -> `{tlId, slot, link, status OK|DUPLIKAT, revision}`.
- v1.0.15 `getFotoWoTim {temuanId, slot TEMUAN|TIANG|SEBELUM|PEKERJAAN|SESUDAH, tlId? (wajib untuk foto pekerjaan), ukuran?: KECIL|PENUH}` -> `{temuanId, tlId?, slot, mime, kecil, ukuranByte, data (base64)}`. WO tim sendiri. Error: BUKAN_MILIK_TIM, DATA_TIDAK_DITEMUKAN, FIELD_WAJIB, FOTO_TIDAK_ADA.
- `selesaiWo {temuanId, revision, daerah?, jumlahGawang?}` -> `{temuanId, revision, tindakLanjut, realisasi[{tlId, kode}], temuan}`. Error: WO_TANPA_PEKERJAAN, FOTO_BELUM_LENGKAP, WO_BUTUH_LAPORAN_UTAMA, FIELD_WAJIB (daerah / jumlahGawang Hartek Jaringan baru), SECTION_TIDAK_VALID.
- Terkait: ubahTemuanInsJar / ubahTemuanInsDu -> WO_SUDAH_DIMULAI; syncRow eksekusi sumber TEMUAN ubah / batal -> TERKUNCI_WO; ubahPekerjaanHartek pekerjaan dari WO -> TERKUNCI_WO.

## v1.0.11 Mobile Inspeksi Gardu + WO + temuan admin Gardu
- `getMasterTemuanInspeksi` + `gardu[{garduId, noGardu, penyulang, section, alamat, kapasitasKva, merk}]` (kosong kalau GARDU_SHEET_ID belum ada).
- `simpanTemuanInspeksi`: object Gardu WAJIB `garduId` (penyulang + section dari db_Gardu, no_gardu + gardu_id tertulis; GARDU_TIDAK_AKTIF / GARDU_TIDAK_DIKENAL). Object Jaringan: `penyulang` wajib, `garduId` = FIELD_TIDAK_DIKENAL.
- HP: tab Gardu (OPS_INSDU_INPUT), tab WO (OPS_WO_TIM, tim ROW/HARTEK/YANDAL), modul Operasi Penerusan WO Temuan (OPS_PENERUSAN_WO). Tidak ada endpoint baru.

## v1.0.14 Inspeksi Gardu: tier ganda, ubah gardu, koordinat temuan wajib
- `tier` gardu = `Tier 1` | `Tier 2` | `Tier 1 & Tier 2` (simpanRealisasiInsDu / ubahRealisasiInsDu). Tier 1 (atau keduanya) = LWBP / WBP + cover; Tier 2 saja = tanpa pengukuran (`simpanPengukuranInsDu` -> TIER_TANPA_PENGUKURAN) dan langsung masuk laporan (UP3 D. Inspeksi ikut menghitung).
- `getInsDuHarian` realisasi + `perluUkur`; `statusUkur` + `TANPA_UKUR`; `masukLaporan` = Tier 2 saja ATAU LWBP ada. `getMasterInsDu` + `tierGardu[]`, gardu + `koordinat` ('lat, lng' dari Lat / Long db_Gardu), `nomorSeri`, `tahun`, `merkPhb`, `seriPhb`, `tahunPhb`.
- Baru `ubahRealisasiInsDu {realisasiId, revision, tier, garduId?}` -> `{realisasiId, kodeRealisasi, revision, realisasi}`. Error: KONFLIK_REVISION, TIER_TERKUNCI (pengukuran ada tapi tier tanpa Tier 1 / temuan memakai tier yang dihapus), GARDU_TERKUNCI (ganti gardu sesudah ada pengukuran / temuan), GARDU_GANDA, GARDU_TIDAK_AKTIF / GARDU_TIDAK_DIKENAL. Rem 30 / menit.
- `simpanTemuanInsDu` / `ubahTemuanInsDu`: `koordinat` WAJIB. `tierInspeksi` harus salah satu tier gardu (TIER_TIDAK_SESUAI); gardu satu tier = otomatis, dua tier = wajib dikirim (FIELD_WAJIB).

## v1.0.16 WO offline + WO ganda, Hartek multi-pekerjaan, Inspeksi Gardu tunggakan LWBP
Persiapan server: `ADMIN_siapkanSheetInsJar` (kolom `rincian` di db_temuan_tindak_lanjut + tab baru db_wo_riwayat, db_wo_ganda di SiSi_Temuan), impor `docs/db_Menu.tsv` + `docs/db_Akses.tsv` (menu OPS_WO_GANDA). Sebelum siapkan dijalankan endpoint WO menolak STRUKTUR_BERUBAH (kolom rincian).
- `simpanPekerjaanWo`: `koordinat` WAJIB (semua tim). HARTEK: `rincian` (teks JSON, maks 8000) = `{pekerjaan: [{id? (pekerjaan ke-2 dst. wajib uuid), jenisId, jumlah}] (1-15), material: [{id (uuid), materialId, jumlah, kepemilikan}] (0-30)}`; tanpa rincian = `jenisId` + `jumlah` seperti v1.0.10. Pekerjaan `rincian` = `{pekerjaan[{id, jenisId, nama, jumlah, satuan}], material[{id, materialId, nama, jumlah, satuan, kepemilikan}]}` (HARTEK). Error baru: MATERIAL_TIDAK_VALID, KEPEMILIKAN_TIDAK_VALID, TERLALU_BANYAK, FORMAT_SALAH (rincian).
- `selesaiWo` HARTEK: tiap pekerjaan rincian = 1 baris db_Hartek_Pekerjaan (pekerjaan_id = id rincian, pertama = tl_id); material = db_Hartek_Material di pekerjaan pertama isian (`<kode pekerjaan>-MAT.NNN`). `realisasi[].kode` = kode pekerjaan digabung koma. Pekerjaan ke-2 dst. juga TERKUNCI_WO di ubahPekerjaanHartek.
- `uploadFotoWo` YANDAL: `sumber: GALERI` ditolak FOTO_HARUS_KAMERA.
- `getWoTim` master HARTEK + `material[{materialId, nama, satuan}]`, `kepemilikan[{kepemilikanId, nama}]`. `wo[].wo.ganda` = null | `{status KLAIM|SIAP|DIPILIH|DITOLAK|'', pemilik, menunggu, waktuPutusan, catatan}`; daftar juga memuat WO yang diklaim tim ini (aktif / diputuskan 7 hari terakhir). `pekerjaanWo` = pekerjaan tim sesi saja.
- WO dipindah / ditarik admin, tim lama mengirim: `WO_DIPINDAH` (tim pernah ditugaskan, db_wo_riwayat) untuk mulaiWo / simpanPekerjaanWo / uploadFotoWo / hapusPekerjaanWo / selesaiWo / getFotoWoTim; tim yang tidak pernah ditugaskan tetap BUKAN_MILIK_TIM.
- `mulaiWo {temuanId, revision, paksa?: true}`: paksa = tim lama tetap mengunggah -> baris KLAIM db_wo_ganda, `{temuanId, revision, ganda: true, temuan}`; WO tetap milik tim baru. Error: WO_SUDAH_SELESAI (WO selesai tim lain), WO_GANDA_SUDAH_DIPUTUSKAN, CONFIG_TIDAK_LENGKAP (tab db_wo_ganda belum ada).
- `selesaiWo` selama ada klaim aktif (tim mana pun) = ditahan: `{temuanId, revision, menungguVerifikasi: true, temuan}`, baris tim itu SIAP (isian daerah / jumlahGawang disimpan di catatan). Tim klaim sesudah SIAP: simpan / hapus pekerjaan / foto = WO_MENUNGGU_VERIFIKASI.
- `teruskanWo` / `tarikWo` selama klaim aktif = WO_GANDA_MENUNGGU. Teruskan / pindah / tarik dicatat di db_wo_riwayat.
- `getWoAdmin`: `ringkas.ganda` (jumlah WO menunggu verifikasi), `temuan[].wo.ganda` (bool). `getFotoWoAdmin` + slot SEBELUM|PEKERJAAN|SESUDAH dengan `tlId` (FIELD_WAJIB tanpa tlId).
Admin verifikasi WO ganda (menu OPS_WO_GANDA, bukan PETUGAS):
- `getWoGanda {status?: MENUNGGU (default)|SELESAI}` -> `{status, menunggu, ganda[ temuan + tim[{timId, tim, jenisTim, pemilik, status, waktuKlaim, diklaimOleh, waktuSiap, diputuskanOleh, waktuPutusan, pekerjaan[]}] + keduanyaUnggah ]}` (SELESAI = diputuskan 30 hari terakhir).
- `getFotoWoGanda` = isi getFotoWoAdmin.
- `putuskanWoGanda {temuanId, timId, catatan?}` -> `{temuanId, timId, tim, revision, dibatalkan}`. Tim terpilih = pemilik WO, status DIKERJAKAN, klaimnya DIPILIH; tim lain DITOLAK (pemilik lama tanpa baris dibuatkan), pekerjaan DRAFT tim lain BATAL. HP tim terpilih mengirim ulang Selesai sendiri. Error: WO_GANDA_SUDAH_DIPUTUSKAN, TIM_TIDAK_VALID (bukan tim yang mengunggah), WO_SUDAH_SELESAI.
Inspeksi Gardu:
- Tunggakan = gardu laporan terakhir tim yang perlu ukur (Tier 1) dengan LWBP ATAU WBP belum ada. `tunggakan.realisasi[]` + `garduId, penyulang, alamat, kapasitasKva, tier, revision, kurang (LWBP|WBP), pengukuran|null`.
- `simpanPengukuranInsDu` gardu tunggakan: WBP, atau LWBP (+ cover wajib) kalau `kurang` = LWBP. Tetap tercatat di tanggal laporan gardu itu.
- Baru `hapusRealisasiInsDu {realisasiId, revision}` -> `{realisasiId, revision}` (ulang = duplikat). Hanya gardu tunggakan, tanpa temuan (GARDU_PUNYA_TEMUAN). status_ukur = BATAL: tidak masuk laporan / UP3 / tunggakan, pengukuran ditolak SUDAH_BATAL. Rem 30 / menit.

## v1.0.17 Temuan Inspeksi offline, Jadwal Padam, Kalender, Arsip tim, Sinkron atomik, Riwayat gardu
Persiapan server: Script Property `JADWAL_PADAM_SHEET_ID` (SiSi_JadwalPadam), opsional `JADWAL_PADAM_LAMA_SHEET_ID` + `INSPEKSI_LAMA_SHEET_ID` (sumber migrasi v1). Jalankan `ADMIN_siapkanSheetJadwalPadam` (db_jadwal_padam + db_Daerah_Padam di SiSi_Master), `ADMIN_siapkanSheetSinkron` (log_Sinkron di SiSi_Auth), buat `db_Kepemilikan` di SiSi_Master (kolom = db_Kepemilikan_Material). Impor `docs/db_Menu.tsv` (nama menu "Temuan Inspeksi") dan aktifkan OPS_JADWAL_PADAM di db_Menu / db_Akses.
Temuan Inspeksi (OPS_INPUT_TEMUAN, admin):
- `getTemuanInspeksi {dari, sampai, penyulang?}` (maks 92 hari, keduanya wajib bila salah satu diisi) -> `{dari, sampai, diambil, temuan[]}` urut tanggal terbaru. Tanpa dari/sampai = perilaku lama (`tanggal`). Error: RENTANG_TIDAK_VALID, RENTANG_TERLALU_PANJANG.
Jadwal Padam (OPS_JADWAL_PADAM, bukan PETUGAS; tulis butuh UBAH):
- `getMasterJadwalPadam {}` -> `{daerah[{daerahId, ulp, up3, gi, penyulang, section, jumlahGardu, jumlahPelanggan, daerahSection, pelangganVip, bebanMw, arus}], statusPekerjaan, tarifKwh}`.
- `getJadwalPadam {dari, sampai, penyulang?, status?, statusPekerjaan?}` (maks 366 hari) -> `{dari, sampai, ringkas{total, terjadwal, terealisasi, batal, padam, pelanggan, ens}, jadwal[{jadwalId, kode, ulp, penyulang, section, jenis, tanggal, hari, jamPadam, jamNyala, durasi, jumlahGardu, jumlahPelanggan, daerah, bebanA, bebanMw, ensRupiah, vip, lokasi, status, statusPekerjaan, revision}]}`. Jadwal Dihapus tidak tampil.
- `simpanJadwalPadam {idBaris?, penyulang, section, jenis, tanggal, jamPadam HH:mm, jamNyala HH:mm, statusPekerjaan Padam|Tanpa Padam, lokasi?}` -> `{jadwalId, kode (JP-<KODE_ULP><YYMMDD><NNN>), revision, jadwal}`; idBaris sama = duplikat. Kolom gardu / pelanggan / daerah / beban / VIP dari db_Daerah_Padam, durasi lewat tengah malam +24 jam, ENS = beban MW x durasi x 1444,7. Error: SECTION_TIDAK_VALID, FORMAT_SALAH (jam).
- `ubahJadwalPadam {jadwalId, revision, ...isian simpan}`; `ubahStatusJadwalPadam {jadwalId, revision, status Terealisasi|Batal Pemadaman|Batal Pekerjaan (v1)}`; `hapusJadwalPadam {jadwalId, revision}` (ditandai Dihapus). Hanya status Terjadwal: selain itu JADWAL_TERKUNCI.
- `getWaJadwalPadam {dari, sampai, penyulang?, status?}` -> `{dari, sampai, jumlah, teks}` (format WA v1, hanya Padam & tidak batal). Kosong = JADWAL_PADAM_KOSONG.
Kalender tim (tanpa menu, PETUGAS ROW / HARTEK / YANDAL / INSPEKSI_JARINGAN / INSPEKSI_GARDU bertim):
- `getKalenderTim {bulan yyyy-MM}` -> `{bulan, jenisTim, kegiatan[{tanggal, jenis PEKERJAAN|WO|PADAM, judul, rincian, jam?, status?}]}`. Bagian yang sheet-nya belum diatur dilewati.
Arsip laporan tim (menu modul petugas):
- `getArsipHartek` (OPS_HARTEK_INPUT) / `getArsipInsJar` (OPS_INSJAR_INPUT) / `getArsipInsDu` (OPS_INSDU_INPUT) `{dari, sampai}` (maks 31 hari, sampai < hari ini) -> `{dari, sampai, laporan[dokumen bentuk get<Modul>Harian + tanggal]}` urut terbaru. Error: TANGGAL_DI_LUAR_BATAS, RENTANG_TERLALU_PANJANG, RENTANG_TIDAK_VALID.
Sinkron atomik (menu modul petugas, tulis):
- `segelSinkronHartek` / `segelSinkronInsJar` / `segelSinkronInsDu {ringkas: JSON}` -> `{modul, cocok, status LENGKAP|TIDAK_COCOK, ringkasServer, waktu, disimpan}`. ringkas = `{header, lokasi|realisasi, pekerjaan, material, grounding, pemerataan | temuan, foto, sidik}` (sidik = FNV-1a 32 bit hex dari ID urut, rumus = mobile/lib/core/sinkron_atomik.dart). Cocok = baris LENGKAP di log_Sinkron. Error: DATA_TIDAK_DITEMUKAN (Laporan Utama belum ada), FORMAT_SALAH.
- `getLaporanRow` admin, laporan HARTEK: `sinkron` LENGKAP|PROSES|'' ; PROSES = siapKirim false (belum disegel / isi berubah sesudah segel).
Riwayat gardu (OPS_PENGUKURAN_GARDU, bukan PETUGAS):
- `getRiwayatGardu {garduId, noGardu?}` -> `{garduId, noGardu, pengukuran[{sumber, kode, tanggal, periode, jam, petugas, bebanR..N, teganganRS..TN, kva, persen, kategori, tidakSeimbang}] (maks 60), temuan[{... statusWo, timTindakLanjut, tindakLanjut, perbaikan[{kodeTl, tanggal, tim, pekerjaan, jumlah, satuan, status}]}], ba[{baId, noBa, jenisPekerjaan, tanggalBa, statusBa, statusPdf, statusTtd, kesimpulan, trafo{merk, seri, tahun, kva}, trafoSesudah{...}}]}`.
- `getMaster` modul gardu: + `ukur{bebanR, bebanS, bebanT, bebanN, teganganRS, teganganRT, teganganST, teganganRN, teganganSN, teganganTN}` + `sumberUkur`.
WO:
- `simpanPekerjaanWo` HARTEK `rincian` = `{pekerjaan: [{id?, jenisId, jumlah, material: [{id, materialId, jumlah, kepemilikan}]}]}` (material per pekerjaan, total maks 30; bentuk lama `material` di luar pekerjaan tetap diterima = milik pekerjaan pertama). Kepemilikan wajib baris aktif db_Kepemilikan (cadangan db_Kepemilikan_Material bila tab belum ada), master kosong = KEPEMILIKAN_TIDAK_VALID. Pekerjaan `rincian` = pekerjaan[].material + daftar datar material[] (+ pekerjaanId). Selesai: material ditulis di bawah pekerjaannya (`<kode pekerjaan>-MAT.NNN`).
- `simpanPekerjaanWo` ROW: section + nomor tiang temuan (input petugas inspeksi) terkunci: SECTION_TERKUNCI / TIANG_TERKUNCI; nomor tiang kosong = dari temuan.
- `getWoTim` master HARTEK `kepemilikan` dari db_Kepemilikan.
- `teruskanWo` dikirim ulang (WO sudah TERKIRIM ke tim + catatan sama, revisi tertinggal) / `tarikWo` dikirim ulang (WO sudah tidak diteruskan, revisi tertinggal) = berhasil `duplikat: true`.
- `ubahTemuanInsJar` / `ubahTemuanInsDu`: temuan TERKIRIM = WO_SUDAH_DITERUSKAN (sebelumnya hanya DIKERJAKAN / SELESAI terkunci).

## v1.0.18 Kepemilikan WO, ENS rupiah, OwnerId, Pindah Tim TO, Kalender Beranda, foto temuan
Persiapan server: push backend, impor baris baru dari `docs/db_Menu.tsv` / `docs/db_Akses.tsv` (kolom `sejak_versi` = 1.0.18, mis. ADMIN_ES / OPS_PINDAH_TIM_TO / UBAH), jalankan `ADMIN_lengkapiMaster` (membuat + mengisi db_Daerah_Padam), `ADMIN_siapkanSheetJadwalPadam` (merapikan ENS lama), `ADMIN_bersihkanCache`. Opsional: `ADMIN_cekNamaFotoLapangan` / `ADMIN_rapikanNamaFotoLapangan`, `ADMIN_migrasiInspeksiFoto` (sesudah `ADMIN_migrasiInspeksiJalan`).
WO:
- `getWoTim` master HARTEK `kepemilikan` + validasi `simpanPekerjaanWo` material: dari **db_Kepemilikan_Material** (sama dengan form Hartek). db_Kepemilikan tidak dibaca lagi. Kosong = KEPEMILIKAN_TIDAK_VALID.
- `teruskanWo` (OPS_PENERUSAN_WO): WO TERKIRIM ke tim lain = **WO_PINDAH_DI_MENU_PINDAH** (kiriman ulang ke tim yang sama tetap `duplikat: true`).
- Baru (menu **OPS_PINDAH_TIM_TO**, bukan PETUGAS): `getWoPindah {dari?, sampai?}` = getWoAdmin status TERKIRIM; `getFotoWoPindah` = getFotoWoAdmin; `pindahWo {temuanId, timId, catatan?, revision}` -> sama dengan teruskanWo, hanya WO TERKIRIM (selain itu WO_BELUM_DITERUSKAN / WO_SUDAH_DIMULAI / WO_SUDAH_SELESAI).
- `tarikWo` pindah menu ke **OPS_PINDAH_TIM_TO** (dulu OPS_PENERUSAN_WO).
Jadwal Padam:
- `ens_rupiah` / `ensRupiah` / `ringkas.ens` = rupiah bulat, dibulatkan ke atas (`ensRupiahJp_`); teks lama ("Rp 1.234,5") ikut terbaca. WA: `*ENS:* Rp1.156` (tanpa koma).
Kalender:
- `getKalenderTim {bulan}`: semua akun bersesi (Beranda). PETUGAS tim ROW / HARTEK / YANDAL / INSPEKSI_* = pekerjaan + WO + PADAM; akun lain (admin) = PADAM saja. Jawaban + `timSendiri`.
Sheet:
- Semua tulisan sel lewat `amanSheet_`: teks angka berawalan 0 (OwnerId `06135`) ditulis sebagai teks (0 di depan tidak hilang).
- Foto lapangan (temuan InsJar / InsDu / admin, Hartek, WO) bernama pola ROW `<kode>_<SLOT>.jpg` (`namaFotoRow_`); kode temuan kosong = `<kode penyulang utama>-TEMUAN`, bukan UUID.
