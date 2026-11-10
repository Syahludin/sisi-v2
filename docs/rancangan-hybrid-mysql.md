# Rancangan: salinan baca MySQL (Hostinger) untuk website admin

Status: **disetujui 27 Okt 2026, dibangun di staging**. Modul pertama: **History Gangguan**. Kode: `backend/src/modules/93_Mysql.js`,
`hosting/sisi-api/`, `web/src/apiBaca.js`; uji integrasi `tests/php-api.test.js` (butuh `PHP_BIN`).

## 1. Tujuan dan batas

- Website admin membaca data berat dari MySQL Hostinger lewat API PHP: lebih cepat, tidak memakai kuota Apps Script.
- **Google Sheet tetap sumber utama.** Semua tulis tetap lewat Apps Script (validasi, lock, revisi, audit tidak berubah).
- Sinkron **satu arah**: Sheet -> MySQL. Tidak ada tulis dari PHP ke Sheet.
- MySQL mati / tertinggal = website kembali ke Apps Script seperti sekarang. Tidak ada data yang bisa hilang.
- Bukan tujuan (tahap ini): HP, modul tulis, foto (tetap Drive), memindah sumber utama dari Sheet.

## 2. Gambaran alur

```
HP / website ──tulis──> Apps Script ──> Google Sheet (sumber utama)
                            │
                            └─ sesudah sinkron ggn_ berubah: POST bertanda HMAC ──> /sisi-api/sinkron.php ──> MySQL
website admin ──baca──> /sisi-api/gangguan.php  (tiket web bertanda HMAC dari Apps Script)
             └─ gagal / tidak dikonfigurasi ──> getHistoriGangguan (Apps Script, seperti sekarang)
```

## 3. Hostinger

- Paket Premium (PHP 8.3, MySQL). Dua database: `sisi_prod`, `sisi_staging` (user DB terpisah, hak hanya ke DB-nya).
- Folder API sejajar website: `public_html/sisi-api/` (production), `public_html/sisi-api-staging/`.
- Config di luar `public_html`: `<folder domain>/<nama folder API>-config.php` (contoh `hosting/sisi-api/config.example.php`).
  Tabel dibuat otomatis oleh API saat pertama dipakai.
- Remote MySQL **tidak** dibuka. Hanya PHP di server yang sama yang mengakses DB.

## 4. Tabel MySQL (modul History Gangguan)

Kolom = header tab `ggn_*` yang sudah ada (63_Gangguan.js `GGN_TAB_`), jadi tidak ada pemetaan baru.

```sql
CREATE TABLE ggn_penyulang (
  gangguan_id VARCHAR(64) PRIMARY KEY, penyulang VARCHAR(80) NOT NULL, waktu DATETIME NULL,
  tahun SMALLINT GENERATED ALWAYS AS (YEAR(waktu)) STORED,
  isi JSON NOT NULL,                       -- satu baris lengkap (bentuk keluarGgn_), dikirim apa adanya ke website
  INDEX (waktu), INDEX (penyulang, waktu)
);
-- ggn_ar (ar_id), ggn_pickup (pickup_id): bentuk sama
CREATE TABLE sinkron_info (modul VARCHAR(40) PRIMARY KEY, sidik VARCHAR(32), jumlah INT, waktu DATETIME);
```

- `isi` JSON = baris siap kirim. Hanya kolom yang dipakai untuk saring / urut yang jadi kolom sendiri.
- Data pribadi: hanya yang memang tampil di History Gangguan (sama dengan jawaban getHistoriGangguan sekarang).

## 5. Sinkron Sheet -> MySQL

- Di `sinkronGgn_` (pemicu harian 18.00 + tombol "Perbarui dari sumber"), sesudah tab `ggn_X` ditulis karena **sidik berubah**:
  kirim seluruh baris jenis itu ke `sinkron.php` (ganti penuh per jenis dalam satu transaksi: `DELETE` + `INSERT` batch).
  Data ~ ribuan baris per jenis, payload perkiraan 1–3 MB (batas UrlFetch 50 MB).
- Permintaan bertanda seperti mesin PDF (`41_BA_Pdf.js`): header `X-SiSi-Waktu` + `X-SiSi-Tanda` = HMAC-SHA256(rahasia,
  `waktu.sha256(body)`), selisih jam maks 5 menit, body JSON ASCII.
- Idempoten: `sinkron_info.sidik` sama = jawab "sudah", tidak menulis.
- Gagal kirim tidak menggagalkan sinkron Sheet (dicatat di log, info sinkron menandai `mysql: GAGAL`). Sinkron berikutnya
  (atau `ADMIN_sinkronMysql` manual dari editor) mengirim ulang semua jenis yang sidiknya belum sama.
- Kuota: 3 UrlFetch per sinkron harian. Dicatat `ambilUrl_(..., 'mysql')` di Pemakaian Server.

Script Properties baru: `MYSQL_API_URL` (`https://sisi-ulp-toboali.com/sisi-api`), `MYSQL_API_SECRET` (>= 32 karakter, beda
production / staging, sama dengan `config.php`).

## 6. Login website ke API PHP (tiket web)

PHP tidak membaca sesi SiSi. Apps Script menerbitkan **tiket pendek bertanda**:

- `cekSesi` (sudah dipanggil website saat dibuka) dan endpoint baru `getTiketApi` (dipanggil website tiap ~10 menit)
  mengembalikan `tiket = base64url(json).base64url(HMAC)` dengan json `{ u: userId, m: [menu yang boleh], env, exp }`,
  `exp` = sekarang + 15 menit.
- PHP: cek tanda HMAC (rahasia sama dengan butir 5), `exp` belum lewat, `env` cocok, menu `OPS_REKAP_GANGGUAN` ada di `m`.
- Akun dinonaktifkan / sesi dicabut: tiket lama masih berlaku paling lama 15 menit (data hanya baca). Dapat diterima?
- Website mengirim tiket di header `X-SiSi-Tiket` (bukan `Authorization`, yang sering dibuang server shared hosting).
  Website dan API satu domain = tanpa CORS; origin lain (mis. `localhost` saat dev) didaftarkan di config PHP.

## 7. API PHP

| Endpoint | Isi |
|---|---|
| `GET gangguan.php?dari=yyyy-MM-dd&sampai=yyyy-MM-dd` | Bentuk **sama persis** dengan `getHistoriGangguan` (`dari, sampai, tahunTop, sinkron, top, penyulang, ar, pickup`), validasi rentang sama (maks 731 hari). |
| `POST sinkron.php` | Hanya dari Apps Script (HMAC). Ganti isi satu jenis. |
| `GET status.php` | Sehat / versi skema / waktu sinkron terakhir (tanpa data). |

- PDO + prepared statement, `utf8mb4`, jawaban JSON gzip. Galat = `{ ok: false, kode }` dengan kode yang sama dengan Apps Script.
- Batas permintaan per menit belum dipasang (hanya admin bertiket, data baca); tambah bila log Hostinger menunjukkan perlu.

## 8. Website

- `config.js` tambah `apiBacaUrl` (kosong = fitur mati, perilaku sekarang).
- `api.js`: untuk aksi yang terdaftar (`getHistoriGangguan`), coba API PHP dulu; jaringan gagal / 5xx / `TIKET_*` /
  jawaban tidak valid = panggil Apps Script seperti biasa. Halaman HistoriGangguan tidak berubah.
- Tiket disimpan di memori (bukan localStorage), diperbarui otomatis sebelum habis.

## 9. Uji dan peluncuran

1. Unit test: tanda HMAC sama di Apps Script (test harness) dan PHP; bentuk jawaban PHP = getHistoriGangguan (fixture sama).
2. Staging: DB `sisi_staging`, `ADMIN_sinkronMysql`, bandingkan jumlah baris + sidik dengan tab `ggn_`.
3. Website staging memakai `apiBacaUrl`; ukur waktu muat sebelum / sesudah.
4. Production sesudah staging disetujui. Rollback = kosongkan `apiBacaUrl` di `config.js` (tanpa build ulang).

## 10. Keputusan yang perlu dari Anda

1. Tiket web berlaku 15 menit (akun yang dinonaktifkan masih bisa **membaca** History Gangguan sampai 15 menit). Setuju?
2. Alamat API: `https://sisi-ulp-toboali.com/sisi-api` (production) dan `/sisi-api-staging`. Setuju?
3. Modul berikutnya sesudah History Gangguan (usul: Laporan UP3/UIW, lalu Riwayat Gardu).

## 11. Jawaban jadi menu admin lain (6 Nov 2026)

Pola "jawaban jadi" (jawaban.php, bagian Pengukuran Gardu / Temuan Inspeksi) diperluas ke menu admin yang belum memakai MySQL.
Apps Script tetap menyusun jawaban; sesudah dibaca website, jawaban disimpan ke MySQL, dibaca berikutnya langsung dari PHP.
Tidak ada tabel baru (tabel `jawaban` + `jawaban_hapus` yang sama, dibuat otomatis).

| Aksi baca | Menu (tiket) | Grup | Dihapus oleh kiriman | Umur maks |
|---|---|---|---|---|
| getRekapJenisTemuan | OPS_PETA_TEMUAN | temuan:daftar | menu temuan / WO (sudah ada) | 1 jam |
| getCheckpoint | OPS_CHECKPOINT | checkpoint:daftar | menu temuan + gardu | 15 mnt |
| getCoverGardu | OPS_REKAP_GANGGUAN | gardu:daftar | kiriman gardu (sudah ada) | 24 jam |
| getDataAset | OPS_DATA_ASET | aset:daftar | OPS_DATA_ASET | 1 jam |
| getJadwalPadam, getMasterJadwalPadam | OPS_JADWAL_PADAM | jadwal:daftar | OPS_JADWAL_PADAM | 15 mnt |
| getApprovalP0 | OPS_VERIFIKASI_P0 | p0:daftar | OPS_VERIFIKASI_P0, OPS_WO_TIM, kiriman P0 / gardu / switching HP Yandal | 15 mnt |
| getDaftarBaGardu, getBaGardu | OPS_BA_GARDU | ba:daftar | OPS_BA_GARDU | 15 mnt |
| getGudangStok, getSelisihGudang, getPemakaianGudang, getIzinMaterial | OPS_GUDANG_MATERIAL | gudang:daftar | OPS_GUDANG_MATERIAL, OPS_STOK_MATERIAL (HP Yandal) | 15 mnt |
| getWorkplanUp3, getGaspolUp3 | OPS_WORKPLAN_UP3, OPS_GASPOL_UP3 | laporan:daftar | tidak ada (data harian ROW / Hartek) | 5 mnt |

- Sengaja TIDAK: `getLaporanUp3` / `getLaporanUiw` (jawaban memuat `bisaUbah` per peran, sedangkan kunci jawaban tidak memuat pengguna),
  `getLaporanGangguan` (menyinkron sumber saat dibaca), foto / PDF, `getAbsensi` (per pengabsen), semua endpoint tulis.
- Aturan keamanan: menu tiket di `AKSI_JAWABAN` (PHP) SAMA dengan menu router; dijaga tes `review 8 Nov 2026 MySQL`.
- Kode: `backend/src/modules/94_Mysql_Jawaban.js` (`MYSQL_JAWABAN_`, `MYSQL_HAPUS_MENU_`, `grupHapusBaca_`), `hosting/sisi-api/jawaban.php`
  (`AKSI_JAWABAN`, `UMUR_GRUP`), `web/src/apiBaca.js` (`AKSI_BACA`). `ADMIN_bersihkanCache` membuang semua grup.
- Rilis: push backend + unggah `hosting/sisi-api/jawaban.php` (+ zip web) per lingkungan. Rollback = kosongkan `apiBacaUrl`, atau hapus aksi dari `AKSI_JAWABAN`.
- Belum terbukti di Hostinger / Apps Script nyata; tes integrasi PHP (`PHP_BIN`) tidak dijalankan dari sesi ini.
