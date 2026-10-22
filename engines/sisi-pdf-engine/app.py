"""sisi-pdf-engine: mesin PDF Berita Acara SiSi v2 (Cloud Run, stateless).

Apps Script mengirim data BA + foto (base64) yang sudah divalidasi, engine membalas bytes PDF. Engine TIDAK punya
akses spreadsheet maupun Drive (tanpa service account key). Hasil disimpan Apps Script ke Drive + Rekap_BA.

Autentikasi: header
  X-SiSi-Waktu : detik unix saat request dibuat (selisih maks 300 detik dengan jam engine)
  X-SiSi-Tanda : hex HMAC-SHA256(PDF_SECRET, "<waktu>.<sha256 hex body>")
Rahasia hanya di env PDF_SECRET (>= 32 karakter) dan Script Property PDF_ENGINE_SECRET; tidak pernah ada di body / URL.

Endpoint:
  GET  /                           health "ok" (tanpa tanda, untuk bangunkan instance)
  GET  /guard/status               hitungan rem harian instance
  POST /v2/cek                     {"ok":true, "engine", "versi", "jenis":[...]}   (bertanda, uji rahasia sama)
  POST /v2/ba/<jenis>              body {"versi":1, "idBa", "data":{...}, "foto":{SLOT: base64 JPEG}} -> application/pdf
Error = JSON {"ok": false, "kode", "pesan"}.
"""
import base64
import binascii
import hashlib
import hmac
import logging
import os
import time

from flask import Flask, Response, jsonify, request

import render_ba
from guard import CostGuard

VERSI = "1.0.1"
SELISIH_WAKTU_MAKS = 300
FOTO_MAKS_BYTE = 3 * 1024 * 1024
NILAI_MAKS = 2000
KUNCI_MAKS = 80

logging.basicConfig(level=logging.INFO)
flask_app = Flask(__name__)


def _rahasia():
    return os.environ.get("PDF_SECRET", "")


def _salah(status, kode, pesan):
    return jsonify({"ok": False, "kode": kode, "pesan": pesan}), status


def tanda(rahasia, waktu, raw):
    """Tanda yang diharapkan untuk body raw (bytes). Sama persis dengan tandaPdf_ di Apps Script."""
    pesan = ("%s.%s" % (waktu, hashlib.sha256(raw).hexdigest())).encode("utf-8")
    return hmac.new(rahasia.encode("utf-8"), pesan, hashlib.sha256).hexdigest()


def _cek_tanda():
    """None kalau sah, selain itu tuple respons error."""
    rahasia = _rahasia()
    if len(rahasia) < 32:
        return _salah(503, "KONFIGURASI", "PDF_SECRET engine belum diset (minimal 32 karakter).")
    waktu = (request.headers.get("X-SiSi-Waktu") or "").strip()
    diberi = (request.headers.get("X-SiSi-Tanda") or "").strip().lower()
    if not waktu.isdigit() or not diberi:
        return _salah(401, "TANDA_SALAH", "Tanda tangan request tidak ada.")
    if abs(time.time() - int(waktu)) > SELISIH_WAKTU_MAKS:
        return _salah(401, "WAKTU_KEDALUWARSA", "Waktu request terlalu jauh dari jam engine.")
    if not hmac.compare_digest(tanda(rahasia, waktu, request.get_data(cache=True)), diberi):
        return _salah(401, "TANDA_SALAH", "Tanda tangan request salah.")
    return None


def _baca_isi(slot_boleh):
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or body.get("versi") != 1:
        raise ValueError("Body harus JSON {versi: 1, ...}.")
    data = body.get("data")
    if not isinstance(data, dict):
        raise ValueError("data wajib objek.")
    bersih = {}
    for k, v in data.items():
        if not isinstance(k, str) or len(k) > KUNCI_MAKS:
            raise ValueError("Kunci data tidak valid.")
        if v is None:
            v = ""
        if not isinstance(v, (str, int, float)) or isinstance(v, bool):
            raise ValueError("Nilai data '%s' harus teks / angka." % k)
        v = str(v)
        if len(v) > NILAI_MAKS:
            raise ValueError("Nilai data '%s' terlalu panjang." % k)
        bersih[k] = v
    foto_in = body.get("foto") or {}
    if not isinstance(foto_in, dict):
        raise ValueError("foto wajib objek.")
    foto = {}
    for slot, b64 in foto_in.items():
        if slot not in slot_boleh:
            raise ValueError("Slot foto tidak dikenal: %s" % slot)
        if not b64:
            continue
        try:
            raw = base64.b64decode(str(b64), validate=True)
        except (binascii.Error, ValueError):
            raise ValueError("Foto %s bukan base64." % slot)
        if len(raw) > FOTO_MAKS_BYTE:
            raise ValueError("Foto %s terlalu besar." % slot)
        foto[slot] = raw
    return str(body.get("idBa") or "")[:60], bersih, foto


@flask_app.get("/")
def health():
    return "ok"


@flask_app.post("/v2/cek")
def cek():
    gagal = _cek_tanda()
    if gagal:
        return gagal
    return jsonify({"ok": True, "engine": "sisi-pdf-engine", "versi": VERSI, "jenis": sorted(render_ba.JENIS)})


@flask_app.post("/v2/ba/<jenis>")
def ba(jenis):
    gagal = _cek_tanda()
    if gagal:
        return gagal
    if jenis not in render_ba.JENIS:
        return _salah(404, "JENIS_TIDAK_ADA", "Jenis BA belum didukung engine: %s" % jenis)
    builder, slot = render_ba.JENIS[jenis]
    try:
        id_ba, data, foto = _baca_isi(slot)
    except ValueError as e:
        return _salah(400, "FORMAT_SALAH", str(e))
    mulai = time.monotonic()
    try:
        pdf = builder(data, foto)
    except Exception:
        logging.exception("RENDER_GAGAL jenis=%s idBa=%s", jenis, id_ba)
        return _salah(500, "RENDER_GAGAL", "PDF gagal dibuat engine.")
    # log tanpa isi BA (nama, koordinat) maupun foto
    logging.info("PDF_OK jenis=%s idBa=%s foto=%d byte=%d ms=%d", jenis, id_ba, len(foto), len(pdf),
                 (time.monotonic() - mulai) * 1000)
    return Response(pdf, mimetype="application/pdf", headers={
        "Cache-Control": "no-store",
        "X-SiSi-Engine-Versi": VERSI,
        "X-SiSi-Pdf-Sha256": hashlib.sha256(pdf).hexdigest(),
    })


app = CostGuard(flask_app, "sisi-pdf-engine")
