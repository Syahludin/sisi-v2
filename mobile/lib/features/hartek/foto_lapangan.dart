import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../row/foto_repository.dart';
import '../row/kamera_screen.dart' show ambilFotoRow;
import '../row/row_model.dart' show Koordinat;
import '../row/row_repository.dart' show RowError;
import '../row/watermark.dart';

/// v1.0.0 (permintaan kvlar 19 Okt 2026): foto lapangan Hartek (grounding, pemerataan beban) dan Inspeksi Jaringan
/// (foto temuan, foto tiang). Sama dengan P0: kamera SiSi saja (landscape + watermark), tanpa galeri. Foto ditulis ke
/// folder app lalu dikirim lewat antrean (uploadFotoHartek / uploadFotoInsJar), jadi tetap jalan tanpa sinyal.
class FotoLapangan {
  FotoLapangan._();

  static const _uuid = Uuid();

  /// Ketuk kotak foto. Hasil = path JPEG ber-watermark di HP; null = batal / hanya melihat foto.
  /// Galat = [RowError] (pesan siap tampil).
  /// v1.0.5: [bolehGaleri] (Inspeksi Jaringan) = pilih kamera atau galeri. Kamera = ber-watermark; galeri = tanpa watermark.
  static Future<String?> ambil(BuildContext context,
      {required String label, required DataWatermark pratinjau, required String folder, String? pathAda, bool bolehGaleri = false}) async {
    final ada = pathAda != null && pathAda.isNotEmpty && File(pathAda).existsSync() ? pathAda : null;
    final f = await ambilFotoRow(context, slot: label, pratinjau: pratinjau, pathAda: ada, bolehGaleri: bolehGaleri);
    if (f == null) return null;
    if (f.sumber == 'GALERI') return simpanGaleri(f, folder);
    return simpan(f, pratinjau, folder);
  }

  /// v1.0.5: foto galeri disimpan apa adanya (tanpa watermark), hanya diperkecil dan dicek JPEG + ukuran.
  static Future<String> simpanGaleri(FotoBaru f, String folder) async {
    final bytes = await f.file.readAsBytes();
    if (!jpeg(bytes)) throw RowError('Foto harus JPEG. Pilih foto lain.');
    final Uint8List kecil;
    try {
      kecil = await Watermark.perkecil(bytes);
    } catch (_) {
      throw RowError('Foto dari galeri gagal diproses. Pilih foto lain.');
    }
    if (kecil.length > FotoRepository.maksByte) throw RowError('Foto lebih dari 2 MB. Pilih foto lain.');
    return _tulis(kecil, folder, awalan: _awalanGaleri);
  }

  // v1.0.15: nama file foto galeri berawalan ini, supaya pengirim tahu sumbernya tanpa catatan tambahan.
  static const _awalanGaleri = 'galeri_';

  /// v1.0.15: path hasil [simpanGaleri] (foto galeri, tanpa watermark).
  static bool dariGaleri(String path) => p.basename(path).startsWith(_awalanGaleri);

  /// Render watermark + tulis file. Koordinat watermark = GPS saat jepret; tanpa GPS = koordinat input (kalau ada).
  static Future<String> simpan(FotoBaru f, DataWatermark pratinjau, String folder) async {
    if (f.sumber != 'KAMERA') throw RowError('Foto wajib dari kamera SiSi.');
    final bytes = await f.file.readAsBytes();
    if (!jpeg(bytes)) throw RowError('Foto harus JPEG. Ambil ulang pakai kamera.');
    if (!await Watermark.landscape(bytes)) throw RowError(FotoRepository.pesanLandscape);
    final waktu = f.diambil ?? DateTime.now();
    final lat = f.lat, lng = f.lng;
    final d = lat != null && lng != null
        ? pratinjau.copyWith(waktu: waktu, koordinat: Koordinat.format(lat, lng), akurasiM: f.akurasiM)
        : pratinjau.copyWith(waktu: waktu, hapusAkurasi: true);
    final Uint8List akhir;
    try {
      akhir = await Watermark.pasang(await Watermark.perkecil(bytes), d);
    } catch (_) {
      throw RowError('Watermark gagal dibuat. Ambil ulang foto.');
    }
    if (akhir.length > FotoRepository.maksByte) throw RowError('Foto + watermark lebih dari 2 MB. Ambil ulang.');
    return _tulis(akhir, folder);
  }

  static Future<String> _tulis(Uint8List isi, String folder, {String awalan = ''}) async {
    final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'foto_lapangan', folder));
    await dir.create(recursive: true);
    final path = p.join(dir.path, '$awalan${_uuid.v4()}.jpg');
    try {
      await File(path).writeAsBytes(isi, flush: true);
    } catch (_) {
      await hapus(path);
      throw RowError('Foto gagal disimpan di HP. Coba lagi.');
    }
    return path;
  }

  static bool jpeg(List<int> b) => b.length > 3 && b[0] == 0xFF && b[1] == 0xD8;

  /// Isi kiriman foto ke server: sha256 + ukuran + base64 (dicek ulang server).
  static Map<String, dynamic> isiKirim(List<int> bytes) =>
      {'sha256': sha256.convert(bytes).toString(), 'ukuranByte': bytes.length, 'data': base64Encode(bytes)};

  /// Baca file foto antrean. null = file sudah tidak ada di HP (mis. data app dibersihkan).
  static Future<List<int>?> baca(String path) async {
    try {
      final f = File(path);
      if (!await f.exists()) return null;
      return await f.readAsBytes();
    } catch (_) {
      return null;
    }
  }

  /// Hapus file foto di folder foto_lapangan yang lebih tua dari [umur]. Galat diabaikan.
  static Future<void> bersihkanLama(String folder, Duration umur) async {
    try {
      final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'foto_lapangan', folder));
      if (!await dir.exists()) return;
      final batas = DateTime.now().subtract(umur);
      await for (final f in dir.list()) {
        if (f is File && (await f.lastModified()).isBefore(batas)) await f.delete();
      }
    } catch (_) {/* biarkan */}
  }

  static Future<void> hapus(String? path) async {
    if (path == null || path.isEmpty) return;
    try {
      final f = File(path);
      if (await f.exists()) await f.delete();
    } catch (_) {/* biarkan */}
  }
}
