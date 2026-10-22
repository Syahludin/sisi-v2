# sisi-pdf-engine (SiSi v2)

Mesin PDF Berita Acara Gardu di Cloud Run. Stateless: tidak membaca sheet, tidak menyentuh Drive, tanpa service
account key. Apps Script mengirim data + foto bertanda HMAC, engine membalas bytes PDF. Layout = port ba-pdf-engine v1.

## Deploy (Cloud Shell, project db-sisi-toboali)
1. Upload folder `engines/sisi-pdf-engine` ke Cloud Shell, `cd sisi-pdf-engine`.
2. (Opsional) uji: `python3 -m venv /tmp/v && /tmp/v/bin/pip install -q -r requirements.txt && /tmp/v/bin/python -m unittest -v test_engine`
   (contoh PDF: ~/contoh-ba-pengoperasian.pdf, unduh: `cloudshell download ~/contoh-ba-pengoperasian.pdf`).
3. `bash deploy.sh` (staging: service sisi2-pdf-staging). Production: `bash deploy.sh sisi2-pdf-production` (rahasia beda).
4. Salin `PDF_ENGINE_URL` + `PDF_ENGINE_SECRET` yang dicetak ke Script Properties Apps Script.
5. Apps Script: jalankan `ADMIN_cekPdfEngine` (otorisasi izin "connect to external service" sekali).

Setelan: max-instances 1, min-instances 0 (gratis saat tidak dipakai, cold start ~5-10 s), 512 MiB, timeout 120 s,
rem harian ENGINE_DAILY_REQUEST_BUDGET=500. Rotasi rahasia: `ROTASI=1 bash deploy.sh <service>` lalu ganti Script Property.
