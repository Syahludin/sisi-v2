# Sumber aturan: PRD SiSi v2 (ClickUp)

Semua aturan SiSi v2 ditulis di **satu tempat**: Doc ClickUp **"PRD SiSi v2"** (Team Space).
Repo ini hanya berisi kode, skema teknis, dan template. Kalau repo dan PRD berbeda, **PRD yang benar**;
perbaiki kodenya atau perbarui PRD lewat PR.

Link PRD: <!-- tempel link Doc "PRD SiSi v2" di sini -->

| Bagian PRD | Isi | Kapan dibuka |
|---|---|---|
| 1. Ringkasan | tujuan, role, cara memakai PRD | pertama kali |
| 2. Lingkup Fase 1 | yang masuk dan tidak masuk fase 1 | sebelum menambah fitur |
| 3. Prinsip | aturan dasar (fail closed, offline first, dll) | selalu |
| 4. Fitur | aturan bisnis + kriteria terima + ID uji per fitur | sebelum menulis kode |
| 5. Alur Aplikasi | urutan layar dan endpoint yang dipanggil | menulis app Flutter |
| 6. Endpoint | amplop, kode error, detail tiap endpoint | menulis backend / ApiClient |
| 7. Staging | env, Script Properties, deploy, akun uji, aturan rilis | sebelum push |
| 8. Log Keputusan | keputusan yang sudah final | ragu "dulu diputuskan apa" |
| 9. Pertanyaan Terbuka | yang belum diputuskan | sebelum mengerjakan bagian yang terhambat |
| 10. Riwayat Perubahan | satu baris per update staging/production | setiap deploy |

## Urutan kerja setiap perubahan

1. Ubah aturan di PRD (4. Fitur dulu, lalu 6. Endpoint kalau ada endpoint baru/berubah).
2. Tulis kode + test di repo.
3. Buka PR, isi template (Fitur tersentuh, ID uji).
4. Deploy staging, jalankan uji sesuai 7. Staging.
5. Catat di 10. Riwayat Perubahan.

## Aturan nomor versi (keputusan kvlar 19 Okt 2026, diperbarui v1.0.1)

- Format `MAJOR.MINOR.PATCH`. Tiap bagian maksimal 99.
- **Setiap perubahan (rilis) = PATCH + 1** (naik 0.0.1). Contoh: 1.0.0 lalu 1.0.1, 1.0.2, dst.
- PATCH sudah 99: MINOR + 1, PATCH = 0 (contoh 1.0.99 lalu 1.1.0).
- MINOR sudah 99 lalu naik lagi: MAJOR + 1, MINOR dan PATCH kembali 0 (contoh 1.99.99 lalu 2.0.0; 0.99.x lalu 1.0.0, bukan 0.100.0).
- Nomor build pubspec (`+N`) selalu naik 1 tiap rilis.
- Versi saat ini: **1.0.34** (`VERSI_BACKEND_` di 09_Versi.js, `versiApp` di versi.dart, `version: 1.0.34+208` di pubspec).
- Salin bagian ini ke PRD SiSi v2 di ClickUp (bagian versi / rilis).
