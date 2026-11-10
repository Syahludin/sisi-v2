import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// v1.0.47 (permintaan Master Guswan 29 Okt 2026): Penerusan WO / Pindah Tim TO offline. Jawaban getWoAdmin / getWoPindah
/// terakhir disimpan di HP per akun + endpoint + status + rentang tanggal (folder dukungan app `wo_admin`), lalu
/// ditampilkan saat layar dibuka tanpa sinyal. Antrean kirim ([PenerusanWo]) disimpan di file yang sama foldernya.
/// Gagal baca / tulis disk = seperti tanpa simpanan (layar tetap jalan online).
class SimpananWo {
  SimpananWo._();

  static Future<Directory?> _folder() async {
    try {
      final d = Directory(p.join((await getApplicationSupportDirectory()).path, 'wo_admin'));
      await d.create(recursive: true);
      return d;
    } catch (_) {
      return null;
    }
  }

  /// Nama file aman dari kunci bebas (userId|endpoint|status|dari|sampai).
  static String namaFile(String kunci) => '${kunci.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_')}.json';

  /// { data, waktu (ms) } atau null.
  static Future<({Map<String, dynamic> data, int waktu})?> baca(String kunci) async {
    try {
      final d = await _folder();
      if (d == null) return null;
      final f = File(p.join(d.path, namaFile(kunci)));
      if (!await f.exists()) return null;
      final j = jsonDecode(await f.readAsString());
      if (j is! Map || j['data'] is! Map) return null;
      return (data: Map<String, dynamic>.from(j['data'] as Map), waktu: (j['waktu'] as num?)?.toInt() ?? 0);
    } catch (_) {
      return null;
    }
  }

  static Future<void> tulis(String kunci, Map<String, dynamic> data, {DateTime? waktu}) async {
    try {
      final d = await _folder();
      if (d == null) return;
      final f = File(p.join(d.path, namaFile(kunci)));
      final tmp = File('${f.path}.tmp');
      await tmp.writeAsString(jsonEncode({'waktu': (waktu ?? DateTime.now()).millisecondsSinceEpoch, 'data': data}), flush: true);
      await tmp.rename(f.path);
    } catch (_) {/* memori saja */}
  }

  static final Set<String> _penuh = {};

  /// v1.0.58: unduhan penuh kunci ini sudah dilakukan di peluncuran app ini (set di memori proses, hilang saat app ditutup).
  static bool sudahPenuh(String kunci) => _penuh.contains(kunci);
  static void tandaiPenuh(String kunci) => _penuh.add(kunci);

  /// File antrean kirim (satu untuk semua akun; tiap item membawa userId).
  static Future<File?> fileAntrean() async {
    final d = await _folder();
    return d == null ? null : File(p.join(d.path, 'antrean.json'));
  }
}
