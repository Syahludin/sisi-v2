"""Uji engine (jalankan di Cloud Shell sebelum deploy):
    python3 -m venv /tmp/v && /tmp/v/bin/pip install -q -r requirements.txt && /tmp/v/bin/python -m unittest -v test_engine
Tidak butuh jaringan / Google. Contoh PDF ditulis ke ~/contoh-ba-pengoperasian.pdf (unduh: cloudshell download ~/contoh-ba-pengoperasian.pdf).
"""
import base64
import io
import json
import os
import time
import unittest

os.environ["PDF_SECRET"] = "r" * 40
os.environ["ENGINE_DAILY_REQUEST_BUDGET"] = "1000"

from PIL import Image  # noqa: E402

import app as engine  # noqa: E402

DATA = {
    "nomorBA": "BA-GRD-TBL-202610-001", "nomorBAFull": "No. 001 / BA - TRF / ULP - TBL / 10 / 2026",
    "nomorTrafo": "TB0422", "tanggalBA": "2026-10-09", "tanggalPekerjaan": "2026-10-08",
    "jenisPekerjaan": "Pengoperasian Trafo", "penyulang": "TB-01", "section": "Kampung Baru - TB0005",
    "koordinat": "-3.012345, 106.456789", "alamat": "Jl. Raya Toboali Desa Kampung Baru Kecamatan Toboali Kabupaten Bangka Selatan",
    "kapasitas": "100", "merk": "Trafindo", "nomorSeri": "SN-123", "tahun": "2025", "konstruksi": "Portal",
    "jurusan": "4", "kepemilikan": "PLN", "ownerId": "07020304", "externalRef": "SECTION - LBS - LBS Kampung Baru",
    "perluasan": "0,5", "vendor": "CV Maju", "phbMerk": "Schneider", "phbSeri": "P-1", "phbTahun": "2025",
    "petugas1": "Andi", "jabatan1": "Supervisor Teknik", "petugas2": "Budi", "jabatan2": "Teknisi",
    "mengetahui": "Citra", "jabatanMengetahui": "Manager ULP Toboali",
}


def jpeg_b64(w=1600, h=1200, warna=(30, 90, 160)):
    out = io.BytesIO()
    Image.new("RGB", (w, h), warna).save(out, format="JPEG", quality=80)
    return base64.b64encode(out.getvalue()).decode()


class EngineTest(unittest.TestCase):
    def setUp(self):
        self.c = engine.flask_app.test_client()

    def kirim(self, path, body, rahasia=None, waktu=None, ubah_tanda=False):
        raw = json.dumps(body).encode("utf-8")
        w = str(int(waktu if waktu is not None else time.time()))
        t = engine.tanda(rahasia or os.environ["PDF_SECRET"], w, raw)
        if ubah_tanda:
            t = ("0" if t[0] != "0" else "1") + t[1:]
        return self.c.post(path, data=raw, content_type="application/json",
                           headers={"X-SiSi-Waktu": w, "X-SiSi-Tanda": t})

    def test_health_tanpa_tanda(self):
        self.assertEqual(self.c.get("/").data, b"ok")

    def test_cek(self):
        r = self.kirim("/v2/cek", {})
        self.assertEqual(r.status_code, 200)
        self.assertIn("pengoperasian-trafo", r.get_json()["jenis"])
        self.assertIn("penggantian-trafo", r.get_json()["jenis"])

    def test_tanda_salah_kedaluwarsa_tanpa_tanda(self):
        self.assertEqual(self.kirim("/v2/cek", {}, ubah_tanda=True).get_json()["kode"], "TANDA_SALAH")
        self.assertEqual(self.kirim("/v2/cek", {}, rahasia="x" * 40).status_code, 401)
        self.assertEqual(self.kirim("/v2/cek", {}, waktu=time.time() - 600).get_json()["kode"], "WAKTU_KEDALUWARSA")
        self.assertEqual(self.c.post("/v2/cek", json={}).status_code, 401)

    def test_render_pengoperasian(self):
        foto = {"NAMEPLATE": jpeg_b64(), "FULL_GARDU": jpeg_b64(900, 1600), "NAMEPLATE_PHB": jpeg_b64(800, 600)}
        r = self.kirim("/v2/ba/pengoperasian-trafo", {"versi": 1, "idBa": DATA["nomorBA"], "data": DATA, "foto": foto})
        self.assertEqual(r.status_code, 200, r.data[:300])
        self.assertEqual(r.mimetype, "application/pdf")
        self.assertTrue(r.data.startswith(b"%PDF"))
        self.assertEqual(r.data.count(b"/Type /Page\n") + r.data.count(b"/Type /Page "), 2)
        with open(os.path.expanduser("~/contoh-ba-pengoperasian.pdf"), "wb") as f:
            f.write(r.data)

    def test_tolak_isi_salah(self):
        p = "/v2/ba/pengoperasian-trafo"
        self.assertEqual(self.kirim(p, {"versi": 2, "data": {}}).get_json()["kode"], "FORMAT_SALAH")
        self.assertEqual(self.kirim(p, {"versi": 1, "data": {}, "foto": {"SLD": jpeg_b64()}}).get_json()["kode"], "FORMAT_SALAH")
        self.assertEqual(self.kirim(p, {"versi": 1, "data": {"a": "x" * 3000}}).get_json()["kode"], "FORMAT_SALAH")
        self.assertEqual(self.kirim(p, {"versi": 1, "data": {"a": {"b": 1}}}).get_json()["kode"], "FORMAT_SALAH")
        self.assertEqual(self.kirim("/v2/ba/pemeriksaan-trafo", {"versi": 1, "data": {}}).get_json()["kode"], "JENIS_TIDAK_ADA")

    def test_render_penggantian(self):
        data = {
            **DATA,
            "jenisPekerjaan": "Penggantian Trafo",
            "kapasitasSesudah": "50",
            "merkSesudah": "SINARINDO",
            "nomorSeriSesudah": "163308344",
            "tahunSesudah": "2016",
            "asalTrafo": "Gudang UP3 (Rekondisi)",
            "phbMerkSesudah": "MZM",
            "phbSeriSesudah": "195",
            "phbTahunSesudah": "2016",
            "jurusanSesudah": "2",
        }
        foto = {"NAMEPLATE": jpeg_b64(), "NAMEPLATE_SESUDAH": jpeg_b64(900, 1600)}
        r = self.kirim("/v2/ba/penggantian-trafo", {"versi": 1, "idBa": data["nomorBA"], "data": data, "foto": foto})
        self.assertEqual(r.status_code, 200, r.data[:300])
        self.assertEqual(r.mimetype, "application/pdf")
        self.assertTrue(r.data.startswith(b"%PDF"))
        self.assertEqual(r.data.count(b"/Type /Page\n") + r.data.count(b"/Type /Page "), 2)

    def test_foto_rusak_jadi_placeholder(self):
        r = self.kirim("/v2/ba/pengoperasian-trafo",
                       {"versi": 1, "data": DATA, "foto": {"NAMEPLATE": base64.b64encode(b"bukan gambar").decode()}})
        self.assertEqual(r.status_code, 200)


if __name__ == "__main__":
    unittest.main()
