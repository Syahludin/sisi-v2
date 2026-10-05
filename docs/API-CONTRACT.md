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

## Laporan UP3 / UIW (v0.57)

- `getLaporanUp3` / `getLaporanUiw` `{tanggal}` -> `{bagian, tanggal, sumber: LIVE|ARSIP, hariIni, bisaUbah, laporan, revision, c4a, statusTim, row, waText, cuaca (UIW saja)}`. Tanggal > 7 hari = ARSIP (salinan tersimpan, revision null).
- `simpanLaporanUp3` `{tanggal, revision, c4a: [{id, penyulang, realisasiKms, temuan?, tindakLanjut?, eksekusi?, keterangan?}]}`.
- `simpanLaporanUiw` `{tanggal, revision, cuaca?, c4a: [{id, sectionId, jumlahTiang, temuanPeralatan, temuanRow, eksekusi, keterangan?}]}`.
- Respons simpan = respons get untuk hari itu. Error: HANYA_HARI_INI, KONFLIK_REVISION, ID_GANDA, DATA_GANDA, FIELD_TIDAK_DIKENAL.
