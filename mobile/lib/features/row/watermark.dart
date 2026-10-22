import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:image/image.dart' as img;

import '../../core/wib.dart';

/// Isi watermark foto ROW (keputusan 3 Okt 2026, v0.28-v0.29). Urutan baris = urutan tampil.
class DataWatermark {
  const DataWatermark({
    required this.kodeEksekusi,
    required this.ulp,
    required this.tim,
    required this.subTim,
    required this.penyulang,
    required this.section,
    required this.waktu,
    required this.koordinat,
    this.akurasiM,
    required this.diameter,
    required this.jenis,
    required this.slot,
    this.sumber = 'KAMERA',
    this.labelKode = 'Kode Eksekusi',
    this.labelSubTim = 'Sub-Tim',
    this.tampilDiameter = true,
    this.gpsSusulanDetik,
    this.barisKhusus,
    this.judulKhusus,
  });

  final String kodeEksekusi;
  final String ulp;
  final String tim;
  final String subTim;
  final String? penyulang;
  final String? section;
  final DateTime waktu; // waktu foto diambil
  final String? koordinat; // "lat, lng"
  final double? akurasiM; // ada = koordinat dari GPS saat foto diambil; null = koordinat input form
  final int? diameter;
  final String? jenis;
  final String slot; // label: Sebelum | Pekerjaan | Sesudah
  final String sumber; // KAMERA | GALERI

  /// v0.64.0: watermark P0 Yandal memakai baris yang sama dengan label lain (Kode P0, Petugas, tanpa Diameter).
  /// Default = ROW, isi watermark ROW tidak berubah.
  final String labelKode;
  final String labelSubTim;
  final bool tampilDiameter;

  /// v0.65.2 (P0): titik GPS menyusul N detik sesudah jepret, ditulis di baris Koordinat. null = ROW / fix saat jepret.
  final int? gpsSusulanDetik;

  /// v0.72.0 (BA Gardu): isi baris + judul sendiri (mis. No Gardu, Foto, Waktu, Koordinat). null = baris ROW / P0.
  final List<(String, String)>? barisKhusus;
  final String? judulKhusus;

  static String _isi(String? v) => (v == null || v.trim().isEmpty) ? '-' : v.trim();

  /// dd/MM/yyyy HH:mm:ss WIB
  static String formatWaktu(DateTime t) {
    final w = Wib.dinding(t);
    String d(int n) => n.toString().padLeft(2, '0');
    return '${d(w.day)}/${d(w.month)}/${w.year} ${d(w.hour)}:${d(w.minute)}:${d(w.second)} WIB';
  }

  String get _koordinat {
    final k = _isi(koordinat);
    if (k == '-') return k;
    final a = akurasiM;
    if (a == null) return '$k (input)';
    final n = gpsSusulanDetik;
    return n == null ? '$k (±${a.toStringAsFixed(0)} m)' : '$k (±${a.toStringAsFixed(0)} m, susulan $n dtk)';
  }

  List<(String, String)> get baris => barisKhusus ?? [
        (labelKode, _isi(kodeEksekusi)),
        ('ULP', _isi(ulp)),
        ('Tim', _isi(tim)),
        (labelSubTim, _isi(subTim)),
        ('Penyulang', _isi(penyulang)),
        ('Section', _isi(section)),
        ('Waktu', formatWaktu(waktu)),
        ('Koordinat', _koordinat),
        if (tampilDiameter) ('Diameter', diameter == null ? '-' : '$diameter cm'),
        ('Jenis Pekerjaan', _isi(jenis)),
        if (sumber == 'GALERI') ('Sumber', 'Galeri (bukan kamera SiSi)'),
      ];

  String get judul => judulKhusus ?? 'Foto $slot';

  /// Tanda isi watermark. Beda = foto perlu dirender ulang dari file asli (mis. kode / diameter berubah).
  String get tanda => [judul, ...baris.map((b) => '${b.$1}=${b.$2}')].join('|');

  DataWatermark copyWith({DateTime? waktu, String? koordinat, double? akurasiM, bool hapusAkurasi = false}) => DataWatermark(
        kodeEksekusi: kodeEksekusi,
        ulp: ulp,
        tim: tim,
        subTim: subTim,
        penyulang: penyulang,
        section: section,
        waktu: waktu ?? this.waktu,
        koordinat: koordinat ?? this.koordinat,
        akurasiM: hapusAkurasi ? null : (akurasiM ?? this.akurasiM),
        diameter: diameter,
        jenis: jenis,
        slot: slot,
        sumber: sumber,
        labelKode: labelKode,
        labelSubTim: labelSubTim,
        tampilDiameter: tampilDiameter,
        gpsSusulanDetik: gpsSusulanDetik,
        barisKhusus: barisKhusus,
        judulKhusus: judulKhusus,
      );
}

/// Watermark dibakar ke foto di HP: kotak data di kiri bawah (logo SiSi + detail pekerjaan), logo PLN di kanan atas.
/// Ukuran mengikuti sisi pendek foto supaya tetap terbaca di WA. Foto diperkecil ke sisi terpanjang 1600 px.
class Watermark {
  Watermark._();

  static const String logoSisi = 'assets/images/logo-sisi.png';
  static const String logoPln = 'assets/images/logo-pln.png';
  static const int sisiMaks = 1600;
  static const int kualitas = 85;

  /// Ukuran relatif terhadap sisi pendek foto (dipakai juga pratinjau kamera supaya tampilan sama).
  static const double rasioHuruf = 0.026;
  static const double rasioTepi = 0.025;
  static const double rasioLogoPln = 0.12;
  static const Color warnaKotak = Color(0xB30B1F3A);
  static const Color warnaAksen = Color(0xFFF59E0B);
  static const Color warnaSub = Color(0xFFFCD34D);
  static const Color warnaLabel = Color(0xFFE2E8F0);

  static final Map<String, ui.Image> _logo = {};

  static Future<ui.Image> _decode(Uint8List b) async {
    final codec = await ui.instantiateImageCodec(b);
    final f = await codec.getNextFrame();
    codec.dispose();
    return f.image;
  }

  static Future<ui.Image?> _aset(String path) async {
    final ada = _logo[path];
    if (ada != null) return ada;
    try {
      final d = await rootBundle.load(path);
      final i = await _decode(d.buffer.asUint8List());
      _logo[path] = i;
      return i;
    } catch (_) {
      return null; // aset tidak ada: watermark tetap jalan tanpa logo
    }
  }

  /// Lebar >= tinggi setelah orientasi EXIF diterapkan decoder.
  static Future<bool> landscape(Uint8List jpeg) async {
    final i = await _decode(jpeg);
    final ok = i.width >= i.height;
    i.dispose();
    return ok;
  }

  static TextPainter _teks(String s, double ukuran,
      {FontWeight berat = FontWeight.w600, Color warna = const Color(0xFFFFFFFF), double? maks}) {
    final tp = TextPainter(
      text: TextSpan(
        text: s,
        style: TextStyle(
          color: warna,
          fontSize: ukuran,
          fontWeight: berat,
          height: 1.18,
          shadows: const [Shadow(color: Color(0x99000000), blurRadius: 3, offset: Offset(1, 1))],
        ),
      ),
      textDirection: TextDirection.ltr,
    );
    tp.layout(maxWidth: maks ?? double.infinity);
    return tp;
  }

  static void _gambarLogo(Canvas c, ui.Image logo, Rect tujuan) {
    final src = Rect.fromLTWH(0, 0, logo.width.toDouble(), logo.height.toDouble());
    final skala = (tujuan.height / logo.height).clamp(0, tujuan.width / logo.width).toDouble();
    final w = logo.width * skala, h = logo.height * skala;
    final dst = Rect.fromLTWH(tujuan.left + (tujuan.width - w) / 2, tujuan.top + (tujuan.height - h) / 2, w, h);
    c.drawImageRect(logo, src, dst, Paint()..filterQuality = FilterQuality.high);
  }

  /// Foto diperkecil (sisi terpanjang 1600) tanpa watermark, untuk disimpan sebagai file asli.
  static Future<Uint8List> perkecil(Uint8List jpeg) => _render(jpeg, null, 90);

  /// Foto + watermark -> JPEG baru (kualitas 85). Foto asli tidak diubah.
  static Future<Uint8List> pasang(Uint8List jpeg, DataWatermark d) => _render(jpeg, d, kualitas);

  static Future<Uint8List> _render(Uint8List jpeg, DataWatermark? d, int q) async {
    final foto = await _decode(jpeg);
    final terpanjang = foto.width > foto.height ? foto.width : foto.height;
    final k = terpanjang > sisiMaks ? sisiMaks / terpanjang : 1.0;
    final pw = (foto.width * k).round(), ph = (foto.height * k).round();
    final lebar = pw.toDouble(), tinggi = ph.toDouble();
    final rec = ui.PictureRecorder();
    final c = Canvas(rec);
    c.drawImageRect(foto, Rect.fromLTWH(0, 0, foto.width.toDouble(), foto.height.toDouble()), Rect.fromLTWH(0, 0, lebar, tinggi),
        Paint()..filterQuality = FilterQuality.high);
    if (d != null) await _gambarWatermark(c, lebar, tinggi, d);
    final hasil = await rec.endRecording().toImage(pw, ph);
    final data = await hasil.toByteData(format: ui.ImageByteFormat.rawRgba);
    foto.dispose();
    hasil.dispose();
    if (data == null) throw StateError('watermark: gagal membaca piksel');
    return compute(_keJpeg, (data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes), pw, ph, q));
  }

  static Future<void> _gambarWatermark(Canvas c, double lebar, double tinggi, DataWatermark d) async {
    final s = lebar < tinggi ? lebar : tinggi; // sisi pendek
    final tepi = s * rasioTepi;
    final huruf = s * rasioHuruf; // 900 px -> 23 px, 1200 px -> 31 px
    final jarak = huruf * 0.55;
    final maksKotak = lebar * 0.72;

    final sisi = await _aset(logoSisi);
    final tinggiLogo = huruf * 2.3;
    final judul = _teks('SiSi · ULP ${d.ulp}', huruf * 1.1, berat: FontWeight.w800);
    final sub = _teks(d.judul, huruf * 0.95, warna: warnaSub, berat: FontWeight.w700);
    final label = d.baris.map((b) => _teks(b.$1, huruf, berat: FontWeight.w500, warna: warnaLabel)).toList();
    final kolomLabel = label.map((t) => t.width).reduce((a, b) => a > b ? a : b);
    final titik = _teks(':', huruf);
    final lebarNilai = maksKotak - jarak * 2 - kolomLabel - titik.width - jarak * 1.5;
    final nilai = d.baris.map((b) => _teks(b.$2, huruf, berat: FontWeight.w700, maks: lebarNilai)).toList();

    final lebarLogo = sisi == null ? 0.0 : tinggiLogo * sisi.width / sisi.height;
    final lebarKepala = lebarLogo + (sisi == null ? 0 : jarak) + (judul.width > sub.width ? judul.width : sub.width);
    final lebarBaris = kolomLabel + titik.width + jarak * 1.5 + nilai.map((t) => t.width).reduce((a, b) => a > b ? a : b);
    final isiLebar = lebarKepala > lebarBaris ? lebarKepala : lebarBaris;
    final kotakLebar = (isiLebar + jarak * 2).clamp(0, maksKotak).toDouble();
    final tinggiKepala = tinggiLogo > judul.height + sub.height ? tinggiLogo : judul.height + sub.height;
    var tinggiBaris = 0.0;
    for (var i = 0; i < nilai.length; i++) {
      tinggiBaris += nilai[i].height > label[i].height ? nilai[i].height : label[i].height;
    }
    final kotakTinggi = jarak + tinggiKepala + jarak * 1.2 + tinggiBaris + jarak;
    final kotak = Rect.fromLTWH(tepi, tinggi - tepi - kotakTinggi, kotakLebar, kotakTinggi);
    final r = Radius.circular(huruf * 0.6);
    c.drawRRect(RRect.fromRectAndRadius(kotak, r), Paint()..color = warnaKotak);
    c.drawRRect(RRect.fromRectAndCorners(Rect.fromLTWH(kotak.left, kotak.top, huruf * 0.22, kotak.height), topLeft: r, bottomLeft: r),
        Paint()..color = warnaAksen);

    var x = kotak.left + jarak, y = kotak.top + jarak;
    if (sisi != null) {
      _gambarLogo(c, sisi, Rect.fromLTWH(x, y + (tinggiKepala - tinggiLogo) / 2, lebarLogo, tinggiLogo));
      x += lebarLogo + jarak;
    }
    final yJudul = y + (tinggiKepala - judul.height - sub.height) / 2;
    judul.paint(c, Offset(x, yJudul));
    sub.paint(c, Offset(x, yJudul + judul.height));
    y += tinggiKepala + jarak * 0.6;
    c.drawLine(
        Offset(kotak.left + jarak, y),
        Offset(kotak.right - jarak, y),
        Paint()
          ..color = const Color(0x66FFFFFF)
          ..strokeWidth = (huruf * 0.06).clamp(1, 4).toDouble());
    y += jarak * 0.6;
    for (var i = 0; i < nilai.length; i++) {
      final xl = kotak.left + jarak;
      label[i].paint(c, Offset(xl, y));
      titik.paint(c, Offset(xl + kolomLabel + jarak * 0.5, y));
      nilai[i].paint(c, Offset(xl + kolomLabel + jarak * 0.5 + titik.width + jarak, y));
      y += nilai[i].height > label[i].height ? nilai[i].height : label[i].height;
    }

    final pln = await _aset(logoPln);
    if (pln != null) {
      final h = s * rasioLogoPln, w = h * pln.width / pln.height, pad = huruf * 0.35;
      final latar = Rect.fromLTWH(lebar - tepi - w - pad * 2, tepi, w + pad * 2, h + pad * 2);
      c.drawRRect(RRect.fromRectAndRadius(latar, Radius.circular(huruf * 0.5)), Paint()..color = const Color(0xD9FFFFFF));
      _gambarLogo(c, pln, latar.deflate(pad));
    }
  }
}

Uint8List _keJpeg((Uint8List, int, int, int) a) {
  final px = Uint8List.fromList(a.$1); // salinan rapat (offset 0) supaya aman dibaca sebagai buffer
  final gambar = img.Image.fromBytes(width: a.$2, height: a.$3, bytes: px.buffer, numChannels: 4, order: img.ChannelOrder.rgba);
  return img.encodeJpg(gambar, quality: a.$4);
}
