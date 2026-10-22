"""Renderer PDF Berita Acara Gardu SiSi v2.

Layout = port langsung dari engine v1 `ba-pdf-engine` (main.py + ba_layout_fix.py) supaya format cetak SAMA:
kop PLN, kalimat pembuka terbilang, blok petugas, DATA TRAFO / DATA PHB-TR tanpa border (nilai tidak pernah
dipotong), tanda tangan Mengetahui / Pemeriksa, halaman 2 lampiran foto 2x2.

Bedanya dengan v1: renderer ini TIDAK membaca spreadsheet dan TIDAK menyentuh Drive. Semua data + foto dikirim
Apps Script di body request, hasilnya bytes PDF.
"""
import datetime
import io
import os
import re

from PIL import Image
from reportlab.lib.colors import HexColor, black
from reportlab.lib.pagesizes import A4, portrait
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOGO_PLN_PATH = os.path.join(BASE_DIR, "assets", "logo_pln.png")

FONT_REG = "Times-Roman"
FONT_BOLD = "Times-Bold"
BLUE = HexColor("#1E3A8A")

PAGE_W, PAGE_H = portrait(A4)
# Margin kiri lebih lebar dari kanan supaya teks tidak kena lubang arsip (sama v1).
MARGIN_LEFT = 25 * mm
MARGIN_RIGHT = 16 * mm
MARGIN_Y = 14 * mm

BULAN_ID = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

# Slot foto Pengoperasian Trafo (nama slot = BA_SLOT_FOTO_ di Apps Script) -> sel lampiran (urutan grid 2x2 v1).
SLOT_PENGOPERASIAN = ["NAMEPLATE", "FULL_GARDU", "NAMEPLATE_PHB", "BOX_PHB"]
SLOT_PENGGANTIAN = ["NAMEPLATE", "NAMEPLATE_SESUDAH", "FULL_GARDU", "FULL_GARDU_SESUDAH", "NAMEPLATE_PHB_SESUDAH", "BOX_PHB_SESUDAH"]
FOTO_MAKS_PX = 1400


# =========================================================
# HELPERS (sama v1)
# =========================================================
def _safe(value):
    return "" if value is None else str(value).strip()


def _kva(value):
    text = _safe(value)
    if not text:
        return ""
    return text if "kva" in text.lower() else text + " kVA"


def _kms(value):
    text = _safe(value)
    if not text:
        return ""
    return text if "kms" in text.lower() else text + " kms"


def _hari_id(date_obj):
    return ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"][date_obj.weekday()]


def _parse_date(value):
    """ISO (2026-07-14), DD/MM/YYYY, DD-MM-YYYY, atau '14 Juli 2026'. None kalau tidak terbaca."""
    text = _safe(value)
    if not text:
        return None
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})", text)
    if m:
        try:
            return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})", text)
    if m:
        try:
            return datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
    m = re.match(r"^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", text)
    if m:
        bulan_lower = [b.lower() for b in BULAN_ID]
        nama = m.group(2).lower()
        if nama in bulan_lower:
            try:
                return datetime.date(int(m.group(3)), bulan_lower.index(nama) + 1, int(m.group(1)))
            except ValueError:
                return None
    return None


def _tanggal_panjang(value):
    obj = _parse_date(value)
    if not obj:
        return _safe(value)
    return "%d %s %d" % (obj.day, BULAN_ID[obj.month - 1], obj.year)


def _terbilang(n):
    try:
        n = int(n)
    except (TypeError, ValueError):
        return ""
    satuan = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam",
              "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"]
    if n < 0:
        return "Minus " + _terbilang(-n)
    if n < 12:
        return satuan[n]
    if n < 20:
        return _terbilang(n - 10) + " Belas"
    if n < 100:
        return _terbilang(n // 10) + " Puluh" + ((" " + _terbilang(n % 10)) if n % 10 else "")
    if n < 200:
        return "Seratus" + ((" " + _terbilang(n - 100)) if n > 100 else "")
    if n < 1000:
        return _terbilang(n // 100) + " Ratus" + ((" " + _terbilang(n % 100)) if n % 100 else "")
    if n < 2000:
        return "Seribu" + ((" " + _terbilang(n - 1000)) if n > 1000 else "")
    if n < 1000000:
        return _terbilang(n // 1000) + " Ribu" + ((" " + _terbilang(n % 1000)) if n % 1000 else "")
    if n < 1000000000:
        return _terbilang(n // 1000000) + " Juta" + ((" " + _terbilang(n % 1000000)) if n % 1000000 else "")
    return str(n)


def _kalimat_pembuka(value):
    obj = _parse_date(value)
    if not obj:
        return "Pada hari ini, " + _safe(value) + ", Kami yang bertugas dibawah ini :"
    return (
        "Pada hari ini, " + _hari_id(obj) + " Tanggal " + _terbilang(obj.day)
        + " Bulan " + BULAN_ID[obj.month - 1] + " Tahun " + _terbilang(obj.year)
        + " (%02d - %02d - %04d)" % (obj.day, obj.month, obj.year)
        + ", Kami yang bertugas dibawah ini :"
    )


def _wrap(text, font, size, width):
    words = _safe(text).split()
    if not words:
        return [""]
    lines, current = [], ""
    for word in words:
        candidate = (current + " " + word).strip()
        if stringWidth(candidate, font, size) <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


# =========================================================
# BLOK DEFINISI (port ba_layout_fix.py v1: tanpa border, nilai tidak dipotong)
# =========================================================
def _metrics(clean_pairs, width, requested_size, line_h, full_width):
    label_size = min(8.5, requested_size)
    max_label = max((stringWidth(label, FONT_BOLD, label_size) for label, _ in clean_pairs), default=0)
    label_w = min(max_label + 4, width * 0.45)
    colon_w = 8
    value_x = label_w + colon_w
    value_w = max(28, full_width - value_x)
    target_h = max(14.0, float(line_h))
    font_sz = min(8.5, requested_size)
    choices = ((font_sz, target_h), (font_sz, target_h - 1.0), (8.0, 13.5), (7.5, 12.5), (7.0, 11.5))
    selected = choices[1]
    for candidate, row_h in choices:
        total_h = 0
        for _label, value in clean_pairs:
            total_h += max(1, len(_wrap(value or "-", FONT_REG, candidate, value_w))) * row_h
        if total_h <= 340:
            selected = (candidate, row_h)
            break
    return label_size, label_w, value_x, value_w, selected[0], selected[1]


def _draw_defs(pdf, x, y, width, pairs, line_h=16, size=8.5, max_x=None, batas_kanan=None):
    """batas_kanan(y_atas) opsional: tepi kanan nilai per baris. Dipakai kolom DATA TRAFO: baris yang sejajar
    DATA PHB-TR berhenti sebelum kolom kanan, baris di bawahnya boleh sampai margin kertas (alamat 1 baris)."""
    clean_pairs = [(_safe(label), _safe(value)) for label, value in pairs]
    paper_right = max_x if max_x is not None else (PAGE_W - MARGIN_RIGHT)
    label_size, label_w, value_x, value_w, value_size, row_h = _metrics(
        clean_pairs, width, size, line_h, paper_right - x)
    pdf.setFillColor(black)
    for label, value in clean_pairs:
        lebar = value_w
        if batas_kanan is not None:
            lebar = max(28, min(value_w, batas_kanan(y) - x - value_x))
        lines = _wrap(value or "-", FONT_REG, value_size, lebar)
        baseline = y - row_h + 3.5
        pdf.setFont(FONT_BOLD, label_size)
        pdf.drawString(x, baseline, label)
        pdf.setFont(FONT_REG, value_size)
        pdf.drawString(x + label_w, baseline, ":")
        for index, line in enumerate(lines):
            pdf.drawString(x + value_x, baseline - index * row_h, line)
        y -= max(1, len(lines)) * row_h
    return y


# =========================================================
# PRIMITIF (sama v1)
# =========================================================
def _draw_logo(pdf, x, y, height):
    if not os.path.exists(LOGO_PLN_PATH):
        return 0
    try:
        with Image.open(LOGO_PLN_PATH) as image:   # ditutup (ResourceWarning di uji Cloud Shell)
            width = height * (image.size[0] / image.size[1])
        pdf.drawImage(LOGO_PLN_PATH, x, y, width=width, height=height, mask="auto")
        return width
    except Exception:
        return 0


def _draw_kop(pdf, top_y, judul, sub):
    left = MARGIN_LEFT
    right = PAGE_W - MARGIN_RIGHT
    logo_w = _draw_logo(pdf, left, top_y - 42, 42)
    pdf.setFont(FONT_BOLD, 12)
    pdf.drawString(left + logo_w + 10, top_y - 14, "PT. PLN (Persero)")
    pdf.setFont(FONT_REG, 9)
    pdf.drawString(left + logo_w + 10, top_y - 27, "UIW Bangka Belitung")
    pdf.drawString(left + logo_w + 10, top_y - 38, "UP3 Bangka ULP Toboali")
    y = top_y - 50
    pdf.setLineWidth(1.4)
    pdf.line(left, y, right, y)
    pdf.setLineWidth(0.5)
    pdf.line(left, y - 2.5, right, y - 2.5)
    y -= 22
    pdf.setFont(FONT_BOLD, 13)
    pdf.drawCentredString(PAGE_W / 2, y, judul)
    jw = stringWidth(judul, FONT_BOLD, 13)
    pdf.setLineWidth(0.8)
    pdf.line(PAGE_W / 2 - jw / 2, y - 2, PAGE_W / 2 + jw / 2, y - 2)
    if sub:
        y -= 14
        pdf.setFont(FONT_REG, 10)
        pdf.drawCentredString(PAGE_W / 2, y, sub)
    return y - 16


def _draw_signatures(pdf, x, y, width, data):
    col = width / 2
    right_x = x + col
    tanggal = _tanggal_panjang(data.get("tanggalBA"))
    num_x = right_x + 32
    name_x = right_x + 48
    right_edge = x + width
    sign_x = name_x + 120
    sign_w = (right_edge - sign_x) if (right_edge - sign_x) > 50 else 50
    garis_titik = "."
    while stringWidth(garis_titik + ".", FONT_REG, 9) < sign_w:
        garis_titik += "."
    head_y = y
    sub_y = y - 14
    row_h = 48
    p1_y = sub_y - 20
    p2_y = p1_y - row_h

    pdf.setFont(FONT_REG, 9)
    pdf.drawString(name_x, head_y, "Toboali, " + (tanggal or ""))
    pdf.drawString(name_x, sub_y, "Pemeriksa,")

    def pemeriksa(base_y, no, nama, jabatan):
        pdf.setFont(FONT_REG, 9)
        pdf.drawString(num_x, base_y, str(no) + ".")
        nama_txt = _safe(nama) or "-"
        pdf.drawString(name_x, base_y, nama_txt)
        nw = stringWidth(nama_txt, FONT_REG, 9)
        pdf.setLineWidth(0.4)
        pdf.line(name_x, base_y - 2, name_x + nw, base_y - 2)
        pdf.setFont(FONT_REG, 8)
        pdf.drawString(name_x, base_y - 11, _safe(jabatan))
        pdf.setFont(FONT_REG, 9)
        pdf.drawString(sign_x, base_y, garis_titik)

    pemeriksa(p1_y, 1, data.get("petugas1"), data.get("jabatan1") or "Petugas 1")
    pemeriksa(p2_y, 2, data.get("petugas2"), data.get("jabatan2") or "Petugas 2")

    mgr_x = x + 20
    jabatan_m = _safe(data.get("jabatanMengetahui")) or "Manager ULP Toboali"
    nama_m = _safe(data.get("mengetahui")) or "(...................)"
    # Mengetahui, jabatan, nama: satu sumbu tengah (tengah teks jabatan), nama + garis bawah center (permintaan kvlar)
    mgr_cx = mgr_x + stringWidth(jabatan_m, FONT_REG, 9) / 2
    pdf.setFont(FONT_REG, 9)
    pdf.drawCentredString(mgr_cx, sub_y, "Mengetahui")
    pdf.drawCentredString(mgr_cx, p1_y, jabatan_m)
    m_y = p2_y - 11
    pdf.setFont(FONT_BOLD, 9)
    pdf.drawCentredString(mgr_cx, m_y, nama_m)
    mw = stringWidth(nama_m, FONT_BOLD, 9)
    pdf.setLineWidth(0.4)
    pdf.line(mgr_cx - mw / 2, m_y - 2, mgr_cx + mw / 2, m_y - 2)


def _gambar(raw, max_px=FOTO_MAKS_PX):
    """bytes foto -> ImageReader JPEG <= max_px (Pillow). None kalau kosong / rusak (sel diberi placeholder)."""
    if not raw:
        return None
    try:
        image = Image.open(io.BytesIO(raw))
        try:
            from PIL import ImageOps
            image = ImageOps.exif_transpose(image)   # foto HP: hormati orientasi EXIF
        except Exception:
            pass
        image = image.convert("RGB")
        image.thumbnail((max_px, max_px), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        image.save(out, format="JPEG", quality=72, optimize=True)
        out.seek(0)
        return ImageReader(out)
    except Exception:
        return None


def _draw_photo_cell(pdf, x, y, width, height, title, subcaption, image_reader):
    pdf.setFillColor(black)
    pdf.setFont(FONT_BOLD, 10)
    pdf.drawCentredString(x + width / 2, y - 12, title)
    box_top = y - 20
    sub_h = 16 if subcaption else 0
    box_h = height - 20 - sub_h
    pdf.setStrokeColor(black)
    pdf.setLineWidth(0.8)
    pdf.rect(x, box_top - box_h, width, box_h, stroke=1, fill=0)
    inner_x, inner_y = x + 4, box_top - box_h + 4
    inner_w, inner_h = width - 8, box_h - 8
    drawn = False
    if image_reader:
        try:
            iw, ih = image_reader.getSize()
            scale = min(inner_w / iw, inner_h / ih)
            dw, dh = iw * scale, ih * scale
            pdf.drawImage(image_reader, inner_x + (inner_w - dw) / 2, inner_y + (inner_h - dh) / 2,
                          width=dw, height=dh, preserveAspectRatio=True, mask="auto")
            drawn = True
        except Exception:
            drawn = False
    if not drawn:
        pdf.setFont(FONT_REG, 9)
        pdf.setFillColor(HexColor("#999999"))
        pdf.drawCentredString(x + width / 2, box_top - box_h / 2, "(Foto tidak tersedia)")
        pdf.setFillColor(black)
    if subcaption:
        pdf.setFont(FONT_BOLD, 9)
        pdf.setFillColor(black)
        pdf.drawCentredString(x + width / 2, box_top - box_h - 12, subcaption)


def _halaman(pdf, ke, total):
    pdf.setFont(FONT_REG, 7)
    pdf.drawRightString(PAGE_W - MARGIN_RIGHT, MARGIN_Y + 4, "Halaman %d dari %d" % (ke, total))


# =========================================================
# PENGOPERASIAN TRAFO
# =========================================================
def _page1_pengoperasian(pdf, data):
    x = MARGIN_LEFT
    width = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT
    nomor = _safe(data.get("nomorBAFull")) or _safe(data.get("nomorBA")) or "-"
    nomor = re.sub(r"^\s*No\.?\s*", "", nomor) or "-"   # hindari "No. No. 001 ..."
    y = _draw_kop(pdf, PAGE_H - MARGIN_Y, "BERITA ACARA PENGOPERASIAN TRAFO", "No. " + nomor)

    y -= 4
    pdf.setFont(FONT_REG, 9)
    for line in _wrap(_kalimat_pembuka(data.get("tanggalBA")), FONT_REG, 9, width):
        y -= 12
        pdf.drawString(x, y, line)
    y -= 32

    col = width / 2

    def petugas_row(nama, jabatan):
        nonlocal y
        pdf.setFont(FONT_REG, 9)
        pdf.drawString(x + 18, y, "Nama :")
        pdf.drawString(x + col, y, "Jabatan :")
        y -= 16
        pdf.drawString(x + 30, y, _safe(nama) or "-")
        pdf.drawString(x + col + 12, y, _safe(jabatan) or "-")
        y -= 18

    petugas_row(data.get("petugas1"), data.get("jabatan1"))
    petugas_row(data.get("petugas2"), data.get("jabatan2"))
    y -= 2

    pengantar = ("Telah melakukan Pengoperasian Trafo " + (_safe(data.get("nomorTrafo")) or "-")
                 + ", Pada tanggal " + (_tanggal_panjang(data.get("tanggalPekerjaan")) or "-")
                 + " dengan kondisi sebagai berikut :")
    for line in _wrap(pengantar, FONT_REG, 9, width):
        y -= 12
        pdf.drawString(x, y, line)
    y -= 26

    gap, tab = 18, 20
    col_w = (width - tab - gap) / 2
    left_x = x + tab
    right_x = left_x + col_w + gap
    head_y = y
    pdf.setFont(FONT_BOLD, 10)
    pdf.drawString(left_x, head_y, "DATA TRAFO")
    pdf.drawString(right_x, head_y, "DATA PHB-TR")
    head_y -= 14

    trafo_pairs = [
        ("Nomor Gardu", data.get("nomorTrafo")),
        ("Kapasitas", _kva(data.get("kapasitas"))),
        ("Merk", data.get("merk")),
        ("Nomor Seri", data.get("nomorSeri")),
        ("Tahun", data.get("tahun")),
        ("Konstruksi", data.get("konstruksi")),
        ("Alamat", data.get("alamat")),
        ("Penyulang", data.get("penyulang")),
        ("Section", data.get("section")),
        ("Koordinat", data.get("koordinat")),
        ("Kepemilikan", data.get("kepemilikan")),
        ("OwnerID", data.get("ownerId")),
        ("External Reference", data.get("externalRef")),
        ("Perluasan SUTM", _kms(data.get("perluasan"))),
        ("Vendor Pelaksana", data.get("vendor")),
    ]
    phb_pairs = [
        ("Merk", data.get("phbMerk")),
        ("Nomor Seri", data.get("phbSeri")),
        ("Tahun", data.get("phbTahun")),
        ("Jurusan", data.get("jurusan")),
    ]
    # DATA PHB-TR digambar dulu: baris kiri yang sejajar PHB-TR berhenti sebelum kolom kanan (tidak menimpa),
    # baris di bawah PHB-TR (Alamat dst.) memakai lebar sampai margin kanan kertas = alamat muat 1 baris.
    y_right = _draw_defs(pdf, right_x, head_y, col_w, phb_pairs, line_h=16)
    tepi_kertas = PAGE_W - MARGIN_RIGHT
    y_left = _draw_defs(pdf, left_x, head_y, col_w, trafo_pairs, line_h=16,
                        batas_kanan=lambda y_atas: tepi_kertas if y_atas <= y_right + 0.5 else right_x - 6)
    y = min(y_left, y_right) - 14

    pdf.setFont(FONT_REG, 9)
    for line in _wrap("Demikian berita acara ini kami buat, untuk dapat dipergunakan sebagaimana mestinya.",
                      FONT_REG, 9, width):
        y -= 12
        pdf.drawString(x, y, line)

    _draw_signatures(pdf, x, y - 26, width, data)
    _halaman(pdf, 1, 2)
    pdf.showPage()


def _page2_pengoperasian(pdf, data, foto):
    x = MARGIN_LEFT
    width = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT
    y = _draw_kop(pdf, PAGE_H - MARGIN_Y, "Lampiran", "")
    gap = 16
    grid_top = y - 6
    grid_bottom = MARGIN_Y + 20
    cell_w = (width - gap) / 2
    cell_h = (grid_top - grid_bottom - gap) / 2
    cells = [
        ("Trafo", _safe(data.get("nomorSeri")), foto.get("NAMEPLATE")),
        ("Konstruksi Trafo", "", foto.get("FULL_GARDU")),
        ("Nameplate PHB-TR", _safe(data.get("phbSeri")), foto.get("NAMEPLATE_PHB")),
        ("PHB-TR", "", foto.get("BOX_PHB")),
    ]
    positions = [
        (x, grid_top),
        (x + cell_w + gap, grid_top),
        (x, grid_top - cell_h - gap),
        (x + cell_w + gap, grid_top - cell_h - gap),
    ]
    for (title, sub, raw), (cx, cy) in zip(cells, positions):
        _draw_photo_cell(pdf, cx, cy, cell_w, cell_h, title, sub, _gambar(raw))
    _halaman(pdf, 2, 2)
    pdf.showPage()


def build_pengoperasian_trafo(data, foto):
    """data = dict kunci v1 (nomorBA, nomorBAFull, nomorTrafo, ...), foto = {slot: bytes}. -> bytes PDF."""
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=(PAGE_W, PAGE_H))
    pdf.setTitle("Berita Acara Pengoperasian Trafo " + (_safe(data.get("nomorTrafo")) or ""))
    pdf.setAuthor("SiSi ULP Toboali")
    pdf.setCreator("sisi-pdf-engine")
    _page1_pengoperasian(pdf, data)
    _page2_pengoperasian(pdf, data, foto)
    pdf.save()
    return buffer.getvalue()



# =========================================================
# PENGGANTIAN TRAFO
# =========================================================
def _page1_penggantian(pdf, data):
    x = MARGIN_LEFT
    width = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT
    nomor = _safe(data.get("nomorBAFull")) or _safe(data.get("nomorBA")) or "-"
    nomor = re.sub(r"^\s*No\.?\s*", "", nomor) or "-"
    y = _draw_kop(pdf, PAGE_H - MARGIN_Y, "BERITA ACARA PENGGANTIAN TRAFO", "No. " + nomor)

    y -= 4
    pdf.setFont(FONT_REG, 9)
    for line in _wrap(_kalimat_pembuka(data.get("tanggalBA")), FONT_REG, 9, width):
        y -= 12
        pdf.drawString(x, y, line)
    y -= 32

    col = width / 2

    def petugas_row(nama, jabatan):
        nonlocal y
        pdf.setFont(FONT_REG, 9)
        pdf.drawString(x + 18, y, "Nama :")
        pdf.drawString(x + col, y, "Jabatan :")
        y -= 16
        pdf.drawString(x + 30, y, _safe(nama) or "-")
        pdf.drawString(x + col + 12, y, _safe(jabatan) or "-")
        y -= 18

    petugas_row(data.get("petugas1"), data.get("jabatan1"))
    petugas_row(data.get("petugas2"), data.get("jabatan2"))
    y -= 2

    no_trafo = _safe(data.get("nomorTrafo")) or "-"
    pengantar = ("Telah melakukan Penggantian Trafo " + no_trafo
                 + ", Pada tanggal " + (_tanggal_panjang(data.get("tanggalPekerjaan")) or "-")
                 + " dengan kondisi sebagai berikut :")
    for line in _wrap(pengantar, FONT_REG, 9, width):
        y -= 12
        pdf.drawString(x, y, line)
    y -= 26

    gap, tab = 18, 20
    col_w = (width - tab - gap) / 2
    left_x = x + tab
    right_x = left_x + col_w + gap
    tepi_kertas = PAGE_W - MARGIN_RIGHT

    # Baris 1: DATA TRAFO SEBELUM (kiri) & DATA TRAFO SESUDAH (kanan)
    head_y = y
    pdf.setFont(FONT_BOLD, 10)
    pdf.drawString(left_x, head_y, "DATA TRAFO SEBELUM")
    pdf.drawString(right_x, head_y, "DATA TRAFO SESUDAH")
    head_y -= 14

    trafo_sebelum = [
        ("Nomor Gardu", data.get("nomorTrafo")),
        ("Kapasitas", _kva(data.get("kapasitas"))),
        ("Merk", data.get("merk")),
        ("Nomor Seri", data.get("nomorSeri")),
        ("Tahun", data.get("tahun")),
        ("Konstruksi", data.get("konstruksi")),
        ("Alamat", data.get("alamat")),
    ]
    trafo_sesudah = [
        ("Nomor Gardu", _safe(data.get("nomorTrafoSesudah")) or data.get("nomorTrafo")),
        ("Kapasitas", _kva(data.get("kapasitasSesudah"))),
        ("Merk", data.get("merkSesudah")),
        ("Nomor Seri", data.get("nomorSeriSesudah")),
        ("Tahun", data.get("tahunSesudah")),
        ("Alamat", _safe(data.get("alamatSesudah")) or data.get("alamat")),
        ("Asal Trafo", data.get("asalTrafo")),
    ]
    y_left1 = _draw_defs(pdf, left_x, head_y, col_w, trafo_sebelum, line_h=16, max_x=right_x - 6)
    y_right1 = _draw_defs(pdf, right_x, head_y, col_w, trafo_sesudah, line_h=16, max_x=tepi_kertas)

    # Baris 2: DATA PHB-TR SEBELUM (kiri) & DATA PHB-TR SESUDAH (kanan)
    head2_y = min(y_left1, y_right1) - 18
    pdf.setFont(FONT_BOLD, 10)
    pdf.drawString(left_x, head2_y, "DATA PHB-TR SEBELUM")
    pdf.drawString(right_x, head2_y, "DATA PHB-TR SESUDAH")
    head2_y -= 14

    phb_sebelum = [
        ("Merk PHB-TR", data.get("phbMerk")),
        ("Nomor Seri PHB-TR", data.get("phbSeri")),
        ("Tahun PHB-TR", data.get("phbTahun")),
        ("Jumlah Jurusan", data.get("jurusan")),
    ]
    phb_sesudah = [
        ("Merk PHB-TR", _safe(data.get("phbMerkSesudah")) or data.get("phbMerk")),
        ("Nomor Seri PHB-TR", _safe(data.get("phbSeriSesudah")) or data.get("phbSeri")),
        ("Tahun PHB-TR", _safe(data.get("phbTahunSesudah")) or data.get("phbTahun")),
        ("Jumlah Jurusan", _safe(data.get("jurusanSesudah")) or data.get("jurusan")),
    ]
    y_left2 = _draw_defs(pdf, left_x, head2_y, col_w, phb_sebelum, line_h=16, max_x=right_x - 6)
    y_right2 = _draw_defs(pdf, right_x, head2_y, col_w, phb_sesudah, line_h=16, max_x=tepi_kertas)
    y = min(y_left2, y_right2) - 14

    pdf.setFont(FONT_REG, 9)
    for line in _wrap("Demikian berita acara ini kami buat, untuk dapat dipergunakan sebagaimana mestinya.",
                      FONT_REG, 9, width):
        y -= 12
        pdf.drawString(x, y, line)

    _draw_signatures(pdf, x, y - 26, width, data)
    _halaman(pdf, 1, 2)
    pdf.showPage()


def _page2_penggantian(pdf, data, foto):
    x = MARGIN_LEFT
    width = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT
    y = _draw_kop(pdf, PAGE_H - MARGIN_Y, "Lampiran", "")
    gap = 16
    grid_top = y - 6
    grid_bottom = MARGIN_Y + 20
    cell_w = (width - gap) / 2
    ada_tambahan = any(foto.get(k) for k in ("FULL_GARDU", "FULL_GARDU_SESUDAH", "NAMEPLATE_PHB_SESUDAH", "BOX_PHB_SESUDAH"))
    if not ada_tambahan:
        cell_h = grid_top - grid_bottom
        _draw_photo_cell(pdf, x, grid_top, cell_w, cell_h,
                         "Nameplate Trafo Sebelum", _safe(data.get("nomorSeri")), _gambar(foto.get("NAMEPLATE")))
        _draw_photo_cell(pdf, x + cell_w + gap, grid_top, cell_w, cell_h,
                         "Nameplate Trafo Sesudah", _safe(data.get("nomorSeriSesudah")), _gambar(foto.get("NAMEPLATE_SESUDAH")))
    else:
        ada_konstruksi = any(foto.get(k) for k in ("FULL_GARDU", "FULL_GARDU_SESUDAH"))
        ada_phb = any(foto.get(k) for k in ("NAMEPLATE_PHB_SESUDAH", "BOX_PHB_SESUDAH"))
        rows = [
            (("Nameplate Trafo Sebelum", _safe(data.get("nomorSeri")), foto.get("NAMEPLATE")),
             ("Nameplate Trafo Sesudah", _safe(data.get("nomorSeriSesudah")), foto.get("NAMEPLATE_SESUDAH"))),
        ]
        if ada_konstruksi:
            rows.append((
                ("Konstruksi Trafo Sebelum", "", foto.get("FULL_GARDU")),
                ("Konstruksi Trafo Sesudah", "", foto.get("FULL_GARDU_SESUDAH")),
            ))
        if ada_phb:
            rows.append((
                ("Nameplate PHB-TR Sesudah", _safe(data.get("phbSeriSesudah")) or _safe(data.get("phbSeri")), foto.get("NAMEPLATE_PHB_SESUDAH")),
                ("PHB-TR Sesudah", "", foto.get("BOX_PHB_SESUDAH")),
            ))
        n_rows = len(rows)
        cell_h = (grid_top - grid_bottom - gap * (n_rows - 1)) / n_rows
        for idx, (kiri, kanan) in enumerate(rows):
            cy = grid_top - idx * (cell_h + gap)
            _draw_photo_cell(pdf, x, cy, cell_w, cell_h, kiri[0], kiri[1], _gambar(kiri[2]))
            _draw_photo_cell(pdf, x + cell_w + gap, cy, cell_w, cell_h, kanan[0], kanan[1], _gambar(kanan[2]))
    _halaman(pdf, 2, 2)
    pdf.showPage()


def build_penggantian_trafo(data, foto):
    """data = dict kunci v1 Penggantian Trafo, foto = {slot: bytes}. -> bytes PDF."""
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=(PAGE_W, PAGE_H))
    pdf.setTitle("Berita Acara Penggantian Trafo " + (_safe(data.get("nomorTrafo")) or ""))
    pdf.setAuthor("SiSi ULP Toboali")
    pdf.setCreator("sisi-pdf-engine")
    _page1_penggantian(pdf, data)
    _page2_penggantian(pdf, data, foto)
    pdf.save()
    return buffer.getvalue()


# jenis (path) -> (builder, slot foto yang diterima)
JENIS = {
    "pengoperasian-trafo": (build_pengoperasian_trafo, SLOT_PENGOPERASIAN),
    "penggantian-trafo": (build_penggantian_trafo, SLOT_PENGGANTIAN),
}
