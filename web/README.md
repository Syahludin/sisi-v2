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

1. `npm run build`, lalu kompres **isi** folder `web/dist` (bukan foldernya) menjadi zip.
   Di Windows: `Compress-Archive -Path web\dist\* -DestinationPath web\sisi-web.zip -Force`.
2. Hostinger hPanel > **File Manager** > buka `public_html` (domain utama) atau folder subdomain uji.
3. Upload zip, lalu **Extract** di folder itu. Pastikan `index.html`, `config.js`, `.htaccess`, folder `assets` dan `img`
   langsung berada di `public_html` (bukan di subfolder `dist`).
4. Buka domainnya. Kaki panel kanan menulis "Koneksi aman · SiSi v…" kalau backend terhubung.

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
