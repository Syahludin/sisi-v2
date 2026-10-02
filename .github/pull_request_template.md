## Apa yang berubah

<!-- singkat, 1-3 kalimat -->

## Fitur tersentuh

<!-- contoh: F-AUTH, F-ROW-SYNC. Ambil dari PRD bagian 4 -->

## ID uji yang harus dijalankan ulang

<!-- ID uji fitur di atas + semua Kritikal + AKS-01 (PRD bagian 7) -->

## Cek

- [ ] PRD bagian 4 (Fitur) sudah diperbarui kalau aturan berubah
- [ ] PRD bagian 6 (Endpoint) sudah diperbarui kalau endpoint baru/berubah
- [ ] Endpoint baru terdaftar di `endpoints_()` dengan `menu` dan `tulis` yang benar
- [ ] Identitas (user/ULP/tim) hanya dari sesi, bukan dari `data`
- [ ] `npm test` hijau
- [ ] Tidak ada ID spreadsheet/folder, token, atau password di kode
- [ ] Sudah deploy staging, nomor deployment: `@`
