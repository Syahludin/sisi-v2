# SiSi v2

Backend Google Apps Script + app Flutter. Fase 1: modul ROW, offline first.

**Semua aturan ada di PRD SiSi v2 (ClickUp).** Repo ini hanya kode. Lihat `docs/PRD.md`.

```
sisi-v2/
  .github/            template PR + CI (test backend, analyze & test Flutter)
  backend/            Apps Script (clasp), kode di backend/src
    src/              00_Config .. 11_Master, modules/20_ROW, 90_AdminTools
    scripts/push.js   push per env (production wajib --yakin)
  mobile/             Flutter (lihat mobile/README.md)
  docs/               PRD.md (penunjuk ke PRD), SKEMA.md, API-CONTRACT.md (penunjuk)
  templates/          xlsx untuk import ke SiSi_Master, SiSi_Auth, SiSi_ROW
  tests/              test backend (Node, tanpa koneksi Google)
```

## 0. Alat yang perlu ada di laptop

- Git, Node.js 20+, VS Code
- Flutter stable (`flutter doctor` hijau untuk Android)
- clasp: `npm i -g @google/clasp` lalu `clasp login`
- Aktifkan Apps Script API: https://script.google.com/home/usersettings

## 1. Repo

```bash
# ekstrak zip sejajar dengan repo lama:
#   folder-kerja/SiSi-ULP-Toboali   (lama, cuma dibaca)
#   folder-kerja/sisi-v2            (baru)
cd sisi-v2
git init -b main
npm test                      # harus 12 lulus
git add . && git commit -m "kerangka sisi-v2"
# buat repo GitHub PRIVATE bernama sisi-v2, lalu:
git remote add origin <url-repo-private>
git push -u origin main
```

Buka `sisi.code-workspace` di VS Code. Tempel link PRD di `docs/PRD.md`.
Di GitHub: Settings > Branches > lindungi `main` (wajib PR + check `test` hijau).

## 2. Spreadsheet (staging dulu)

1. Buka `SiSi_Master` > File > Import > Upload `templates/SiSi_Master_template.xlsx` > **Replace spreadsheet**.
2. Buat Google Sheet `SiSi_Auth` di folder yang sama, import `templates/SiSi_Auth_template.xlsx` dengan cara sama.
3. Kolom `kode` di `db_Tim`: Format > Number > **Plain text**.
4. Buat Google Sheet `SiSi_ROW` di folder ROW, import `templates/SiSi_ROW_template.xlsx` (Replace spreadsheet).
   Proteksi semua sheet-nya (Data > Protect sheets): hanya pemilik script yang boleh edit. Isi `ROW_SHEET_ID` di Script Properties.

## 3. Apps Script (staging)

1. Buat project Apps Script baru (standalone). Salin `backend/.clasp.staging.example.json` jadi `backend/.clasp.staging.json`, isi Script ID. File ini lokal (tidak ikut git/zip).
2. Project Settings > Script Properties, isi sesuai PRD **7. Staging** (ENV, MASTER_SHEET_ID, AUTH_SHEET_ID, KODE_ULP, ADMIN_EMAIL; ROW_* boleh kosong dulu; PBKDF2_ITERASI opsional, default 5000).
3. `npm run push:staging`

### Redeploy (URL /exec tetap)

Sekali saja: salin `backend/.deploy.example.json` jadi `backend/.deploy.json`, isi deployment ID (bagian di antara `/s/` dan `/exec` di URL). Lalu setiap rilis:

```powershell
npm run deploy:staging -- "staging v0.20 · cek platform"
```

Perintah ini push kode lalu `clasp deploy -i <ID>` ke deployment yang sama. Production: `npm run deploy:production -- "deskripsi"` (sudah memakai --yakin).
4. Di editor Apps Script jalankan berurutan:
   - `ADMIN_cekKonfigurasi`
   - isi master di Sheet, lalu `ADMIN_lengkapiMaster` (isi UUID, revision, dll)
   - set password: isi Script Properties `SETPW_USERNAME` + `SETPW_PASSWORD`, jalankan `ADMIN_setPassword`
     (kedua property otomatis terhapus). Atur `PBKDF2_ITERASI` supaya login < 2 detik.
5. Deploy > New deployment > Web app. Execute as: **Me**. Who has access: **Anyone**.
   Salin URL `/exec` ke `mobile/env/staging.json`. Catat nomor `@n` di PRD 10. Riwayat Perubahan.

Production: ulangi dengan project & spreadsheet production, `npm run push:production`.

## 4. Flutter

Lihat `mobile/README.md`.

## Aturan kode v2 (ringkas, lengkapnya di PRD 3. Prinsip & 6. Endpoint)

- Hanya `doPost`, `doGet`, `rpc`, dan `ADMIN_*` yang publik. Selain itu wajib berakhiran `_`.
- Endpoint baru: tulis dulu di PRD, lalu satu baris di `endpoints_()` (02_Router.js) dengan `menu` & `tulis`.
- Urutan di setiap endpoint: validasi_ -> cek kepemilikan -> denganLock_ -> tulis -> auditLog_.
- `username`/`ulp`/`tim` selalu dari sesi, tidak pernah dari `data`.
- Tidak ada fungsi ganda, tidak ada overlay, tidak ada kode top-level yang memanggil file lain.
- Tidak ada ID spreadsheet/folder, token, atau password di kode.
