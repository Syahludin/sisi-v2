# SiSi Panel Admin (website)

Website khusus akun **Admin** dan **Admin ES** ULP. Petugas tetap memakai aplikasi SiSi di HP.
Data tetap di Google Sheets lewat backend Apps Script yang sama dengan HP (`doPost`, ditandai `platform: 'WEB'`).
Website hanya berisi file statis (HTML, CSS, JS, gambar), jadi bisa di-hosting di Hostinger tanpa database.

Teknologi: React 19 + Vite 6, JavaScript biasa.

## Menjalankan di komputer

```bash
cd web
npm install
cp public/config.example.js public/config.js   # isi apiUrl (URL /exec staging) dan env
npm run dev       # http://localhost:5173
npm test          # tes modul inti (config, api, pesan, sesi)
npm run build     # hasil di web/dist
```

## Upload ke Hostinger

Asset website memakai alamat ABSOLUT dari folder hosting (`SISI_BASE` saat build, lihat `vite.config.js`). Zip yang dibuat untuk
folder lain membuat halaman awal kosong (file JS / CSS 404). Karena itu zip dibuat lewat skrip yang memasang folder yang benar:

| Lingkungan | Perintah | Folder hosting (base) | Berkas zip | `config.js` di zip |
|---|---|---|---|---|
| Staging | `npm run zip:staging` | `public_html/sisi-web-staging` (`/sisi-web-staging/`) | `web/sisi-web-staging.zip` | ikut (env staging, backend staging) |
| Production | `npm run zip:production` | `public_html/sisi` (`/sisi/`) | `web/sisi-web-production.zip` | TIDAK ikut (pakai `config.js` di server) |

1. Jalankan perintah di atas dari folder `web` (build + cek `index.html` memakai base yang benar + zip termasuk `.htaccess`).
   JANGAN kompres `web/dist` manual dari `npm run build` biasa: base bawaannya `/sisi/` (production).
2. Hostinger hPanel > **File Manager** > buka folder hosting dari tabel > upload zip > **Extract** (timpa).
3. Pastikan `index.html`, `.htaccess`, `config.js` (staging), folder `assets` dan `img` langsung berada di folder itu (bukan di subfolder `dist`).
4. Buka alamatnya, Ctrl+F5. Kaki panel kanan menulis "Koneksi aman · SiSi v…" kalau backend terhubung.
5. Halaman kosong = cek tab Network (F12): kalau `assets/index-….js` diminta dari folder yang salah, zip dibuat dengan base salah.

Folder lain (mis. domain uji): `SISI_BASE=/folder/ npm run build` (PowerShell: `$env:SISI_BASE='/folder/'`), lalu kompres isi `dist` (termasuk `.htaccess`).

## Pindah staging / production

Edit `config.js` langsung di File Manager Hostinger (tanpa build ulang):

```js
window.SISI_CONFIG = {
  env: 'production',                                           // 'staging' = badge STAGING tampil
  apiUrl: 'https://script.google.com/macros/s/<ID_DEPLOYMENT>/exec',
};
```

Hanya alamat `https://script.google.com/macros/s/<ID>/exec` yang diterima. Sesi login staging tidak berlaku di production
(admin login ulang). `config.js` tidak di-commit (berisi URL backend); contoh ada di `public/config.example.js`.

## Menu admin

Menu yang tampil di dashboard berasal dari server (`db_Menu` + `db_Akses`). Menu baru muncul di website setelah kolom
`platform` di `db_Menu` diubah menjadi `KEDUANYA` (HP + web) atau `WEB`, dan halamannya sudah dibuat di website.
