import 'dart:async';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../theme/app_colors.dart';
import 'api_client.dart';
import 'versi.dart';

/// v1.0.19 (permintaan kvlar 23 Okt 2026): update aplikasi langsung dari app. Server (getUpdateApp) memberi APK versi
/// terbaru di folder Drive (APK_FOLDER_ID): HP mengunduh di latar dengan progres, mencocokkan ukuran + SHA-256, meminta
/// konfirmasi, lalu membuka pemasang Android. Android tetap menolak APK yang tanda tangannya beda dengan app terpasang.
class PembaruApk {
  PembaruApk._();

  /// Hasil: true = pemasang Android dibuka. false = tidak ada update / gagal / dibatalkan (pesan sudah tampil).
  static Future<bool> jalankan(BuildContext context, ApiClient api, String token) async {
    Map<String, dynamic> apk;
    try {
      final r = await api.call('getUpdateApp', token: token, data: {'versiApp': versiApp}, timeout: const Duration(seconds: 40));
      if (r['tersedia'] != true || r['apk'] is! Map) {
        if (context.mounted) _pesan(context, 'File update belum ada di folder update. Hubungi admin.');
        return false;
      }
      apk = Map<String, dynamic>.from(r['apk'] as Map);
    } catch (_) {
      if (context.mounted) _pesan(context, 'Tidak bisa cek file update. Cek sinyal lalu coba lagi.');
      return false;
    }
    if (!context.mounted) return false;
    final batal = _Batal();
    final progres = ValueNotifier<double?>(null);
    final unduh = _unduh(apk, progres, batal);
    unawaited(showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (c) => PopScope(
        canPop: false,
        child: AlertDialog(
          icon: const Icon(Icons.system_update_rounded, size: 36, color: AppColors.brand700),
          title: Text('Mengunduh v${apk['versi']}'),
          content: ValueListenableBuilder<double?>(
            valueListenable: progres,
            builder: (c, v, _) => Column(mainAxisSize: MainAxisSize.min, children: [
              LinearProgressIndicator(value: v, minHeight: 8, borderRadius: BorderRadius.circular(8)),
              const SizedBox(height: 10),
              Text(v == null ? 'Menyiapkan unduhan...' : '${(v * 100).floor()}% dari ${_mb(apk['ukuranByte'])}',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
            ]),
          ),
          actions: [
            TextButton(
                onPressed: () {
                  batal.ya = true;
                  Navigator.pop(c);
                },
                child: const Text('Batalkan')),
          ],
        ),
      ),
    ));
    String path;
    try {
      path = await unduh;
    } on _Dibatalkan {
      return false;
    } catch (e) {
      if (context.mounted) {
        Navigator.of(context, rootNavigator: true).pop();
        _pesan(context, e is _Galat ? e.pesan : 'Unduhan gagal. Cek sinyal lalu coba lagi.');
      }
      return false;
    } finally {
      progres.dispose();
    }
    if (!context.mounted) return false;
    Navigator.of(context, rootNavigator: true).pop();
    final ya = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        icon: const Icon(Icons.verified_rounded, size: 36, color: AppColors.success700),
        title: const Text('Pasang update sekarang?'),
        content: Text('SiSi v${apk['versi']} sudah diunduh dan terverifikasi. Data di HP tetap aman.\n'
            'Kalau diminta, izinkan "Pasang aplikasi tidak dikenal" untuk SiSi.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Nanti')),
          FilledButton.icon(onPressed: () => Navigator.pop(c, true), icon: const Icon(Icons.install_mobile_rounded), label: const Text('Ya, pasang')),
        ],
      ),
    );
    if (ya != true) return false;
    final h = await OpenFilex.open(path, type: 'application/vnd.android.package-archive');
    if (h.type != ResultType.done && context.mounted) _pesan(context, 'Pemasang tidak terbuka: ${h.message}');
    return h.type == ResultType.done;
  }

  static Future<String> _unduh(Map<String, dynamic> apk, ValueNotifier<double?> progres, _Batal batal) async {
    final dir = Directory(p.join((await getTemporaryDirectory()).path, 'update_apk'));
    if (await dir.exists()) await dir.delete(recursive: true);
    await dir.create(recursive: true);
    final file = File(p.join(dir.path, 'SiSi-${apk['versi']}.apk'));
    final klien = http.Client();
    try {
      final resp = await klien.send(http.Request('GET', Uri.parse('${apk['url']}'))).timeout(const Duration(seconds: 60));
      if (resp.statusCode != 200) throw _Galat('Server Drive menolak unduhan (${resp.statusCode}).');
      final total = resp.contentLength ?? (num.tryParse('${apk['ukuranByte']}') ?? 0).toInt();
      final out = file.openWrite();
      var n = 0, awal = true;
      try {
        await for (final b in resp.stream.timeout(const Duration(seconds: 60))) {
          if (batal.ya) throw _Dibatalkan();
          // APK = berkas zip (diawali "PK"); halaman HTML Drive (mis. butuh izin) ditolak
          if (awal && b.length >= 2 && !(b[0] == 0x50 && b[1] == 0x4B)) throw _Galat('File di Drive belum bisa diunduh (bukan APK). Hubungi admin.');
          awal = false;
          out.add(b);
          n += b.length;
          if (total > 0) progres.value = (n / total).clamp(0, 1).toDouble();
        }
      } finally {
        await out.close();
      }
      final ukuran = (num.tryParse('${apk['ukuranByte']}') ?? 0).toInt();
      if (ukuran > 0 && n != ukuran) throw _Galat('Ukuran file tidak cocok. Coba unduh ulang.');
      final sha = '${apk['sha256'] ?? ''}'.toLowerCase();
      if (sha.isNotEmpty && (await sha256.bind(file.openRead()).first).toString() != sha) throw _Galat('File update rusak (SHA-256 beda). Coba unduh ulang.');
      return file.path;
    } catch (e) {
      try {
        if (await file.exists()) await file.delete();
      } catch (_) {}
      rethrow;
    } finally {
      klien.close();
    }
  }

  static String _mb(Object? b) => '${((num.tryParse('$b') ?? 0) / 1048576).toStringAsFixed(1)} MB';

  static void _pesan(BuildContext c, String t) {
    if (!c.mounted) return;
    ScaffoldMessenger.maybeOf(c)
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(t)));
  }
}

class _Batal {
  bool ya = false;
}

class _Dibatalkan implements Exception {}

class _Galat implements Exception {
  _Galat(this.pesan);
  final String pesan;
}
