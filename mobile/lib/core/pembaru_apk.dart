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
/// terbaru di folder Drive (APK_FOLDER_ID): HP mengunduh di latar dengan progres, mencocokkan ukuran + SHA-256, lalu
/// membuka pemasang Android. Android tetap menolak APK yang tanda tangannya beda dengan app terpasang.
///
/// v1.0.21: satu dialog langsung tampil saat tombol diketuk (cek server -> unduh -> periksa -> buka pemasang), tanpa
/// jeda kosong. APK yang sudah terunduh + terverifikasi disimpan; kalau pemasang tertutup / salah ketuk, ketuk lagi
/// langsung memasang tanpa unduh ulang. File versi lain dihapus.
///
/// v1.0.22: file update belum ada / belum bisa diunduh dari folder Drive = kartu "Gagal Update, Silahkan Hubungi Admin".
class PembaruApk {
  PembaruApk._();

  /// Hasil: true = pemasang Android dibuka. false = tidak ada update / gagal / dibatalkan (pesan sudah tampil di dialog).
  static Future<bool> jalankan(BuildContext context, ApiClient api, String token) async {
    final st = ValueNotifier<_Status>(const _Status('Memeriksa update...'));
    final batal = _Batal();
    final nav = Navigator.of(context, rootNavigator: true);
    var terbuka = true;
    unawaited(showDialog<void>(
      context: context,
      useRootNavigator: true,
      barrierDismissible: false,
      builder: (c) => PopScope(canPop: false, child: _DialogPembaru(status: st, batal: batal)),
    ).whenComplete(() => terbuka = false));
    void tutup() {
      if (terbuka) nav.pop();
    }

    try {
      final r = await api.call('getUpdateApp', token: token, data: {'versiApp': versiApp}, timeout: const Duration(seconds: 40));
      if (batal.ya) return false;
      if (r['tersedia'] != true || r['apk'] is! Map) throw _Galat.hubungiAdmin();
      final apk = Map<String, dynamic>.from(r['apk'] as Map);
      final judul = 'SiSi v${apk['versi']}';
      final path = await _siapkan(apk, judul, st, batal);
      if (batal.ya) return false;
      // pemasang dibuka lagi tiap tombol Pasang diketuk: file tetap tersimpan sampai versi baru terpasang
      while (true) {
        st.value = _Status('Membuka pemasang $judul...', judul: judul);
        final h = await OpenFilex.open(path, type: 'application/vnd.android.package-archive');
        if (h.type == ResultType.done) {
          tutup();
          return true;
        }
        final lagi = Completer<bool>();
        st.value = _Status('Pemasang tidak terbuka: ${h.message}\nIzinkan "Pasang aplikasi tidak dikenal" untuk SiSi, lalu ketuk Pasang.',
            judul: judul, galat: true, siapPasang: lagi);
        if (!await lagi.future) {
          tutup();
          return false;
        }
      }
    } on _Dibatalkan {
      return false;
    } catch (e) {
      if (batal.ya) return false;
      st.value = _Status(e is _Galat ? e.pesan : 'Tidak bisa mengunduh update. Cek sinyal lalu coba lagi.', judul: e is _Galat ? e.judul : null, galat: true);
      return false;
    }
  }

  /// APK siap pasang: pakai file yang sudah terverifikasi kalau ada, kalau tidak unduh (.part) lalu periksa.
  static Future<String> _siapkan(Map<String, dynamic> apk, String judul, ValueNotifier<_Status> st, _Batal batal) async {
    final dir = Directory(p.join((await getTemporaryDirectory()).path, 'update_apk'));
    await dir.create(recursive: true);
    final nama = 'SiSi-${apk['versi']}.apk';
    final file = File(p.join(dir.path, nama));
    await for (final f in dir.list()) {
      if (p.basename(f.path) != nama) await f.delete(recursive: true).catchError((_) => f);
    }
    final ukuran = (num.tryParse('${apk['ukuranByte']}') ?? 0).toInt();
    final sha = '${apk['sha256'] ?? ''}'.toLowerCase();
    if (await file.exists()) {
      st.value = _Status('Memeriksa file yang sudah diunduh...', judul: judul);
      if (await _cocok(file, ukuran, sha)) return file.path;
      await file.delete();
    }
    final part = File('${file.path}.part');
    await _unduh(apk, part, ukuran, judul, st, batal);
    st.value = _Status('Memeriksa file update...', judul: judul, progres: 1);
    if (ukuran > 0 && await part.length() != ukuran) throw _Galat('Ukuran file tidak cocok. Coba unduh ulang.');
    if (!await _cocok(part, 0, sha)) {
      await part.delete();
      throw _Galat('File update rusak (SHA-256 beda). Coba unduh ulang.');
    }
    await part.rename(file.path);
    return file.path;
  }

  static Future<bool> _cocok(File f, int ukuran, String sha) async {
    if (ukuran > 0 && await f.length() != ukuran) return false;
    return sha.isEmpty || (await sha256.bind(f.openRead()).first).toString() == sha;
  }

  static Future<void> _unduh(Map<String, dynamic> apk, File part, int ukuran, String judul, ValueNotifier<_Status> st, _Batal batal) async {
    st.value = _Status('Menyiapkan unduhan...', judul: judul);
    final klien = http.Client();
    try {
      final resp = await klien.send(http.Request('GET', Uri.parse('${apk['url']}'))).timeout(const Duration(seconds: 60));
      if (resp.statusCode != 200) throw _Galat('Server Drive menolak unduhan (${resp.statusCode}).');
      final total = resp.contentLength ?? ukuran;
      final out = part.openWrite();
      var n = 0, awal = true;
      try {
        await for (final b in resp.stream.timeout(const Duration(seconds: 60))) {
          if (batal.ya) throw _Dibatalkan();
          // APK = berkas zip (diawali "PK"); halaman HTML Drive (mis. butuh izin) ditolak
          if (awal && b.length >= 2 && !(b[0] == 0x50 && b[1] == 0x4B)) throw _Galat.hubungiAdmin();
          awal = false;
          out.add(b);
          n += b.length;
          if (total > 0) {
            st.value = _Status('${_mb(n)} dari ${_mb(total)}', judul: judul, progres: (n / total).clamp(0, 1).toDouble(), unduh: true);
          }
        }
      } finally {
        await out.close();
      }
    } catch (e) {
      try {
        if (await part.exists()) await part.delete();
      } catch (_) {}
      rethrow;
    } finally {
      klien.close();
    }
  }

  static String _mb(Object? b) => '${((num.tryParse('$b') ?? 0) / 1048576).toStringAsFixed(1)} MB';
}

class _Status {
  const _Status(this.pesan, {this.judul, this.progres, this.unduh = false, this.galat = false, this.siapPasang});
  final String pesan;
  final String? judul;
  final double? progres;
  final bool unduh;
  final bool galat;

  /// Pemasang gagal dibuka: tombol Pasang (true) / Tutup (false).
  final Completer<bool>? siapPasang;
}

class _DialogPembaru extends StatelessWidget {
  const _DialogPembaru({required this.status, required this.batal});
  final ValueNotifier<_Status> status;
  final _Batal batal;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<_Status>(
        valueListenable: status,
        builder: (c, s, _) {
          final pasang = s.siapPasang;
          return AlertDialog(
            icon: Icon(s.galat ? Icons.error_outline_rounded : Icons.system_update_rounded, size: 36, color: s.galat ? AppColors.red700 : AppColors.brand700),
            title: Text(s.judul == null ? 'Update Aplikasi' : (s.unduh ? 'Mengunduh ${s.judul}' : s.judul!), textAlign: TextAlign.center),
            content: Column(mainAxisSize: MainAxisSize.min, children: [
              if (!s.galat) ...[
                LinearProgressIndicator(value: s.progres, minHeight: 8, borderRadius: BorderRadius.circular(8)),
                const SizedBox(height: 10),
              ],
              Text(s.unduh ? '${((s.progres ?? 0) * 100).floor()}%  ·  ${s.pesan}' : s.pesan,
                  textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
            ]),
            actions: [
              if (pasang != null) ...[
                TextButton(onPressed: () => pasang.complete(false), child: const Text('Tutup')),
                FilledButton.icon(onPressed: () => pasang.complete(true), icon: const Icon(Icons.install_mobile_rounded), label: const Text('Pasang')),
              ] else if (s.galat)
                FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Tutup'))
              else
                TextButton(
                    onPressed: () {
                      batal.ya = true;
                      Navigator.pop(c);
                    },
                    child: const Text('Batalkan')),
            ],
          );
        },
      );
}

class _Batal {
  bool ya = false;
}

class _Dibatalkan implements Exception {}

class _Galat implements Exception {
  _Galat(this.pesan) : judul = null;
  _Galat.hubungiAdmin()
      : pesan = 'Silahkan Hubungi Admin',
        judul = 'Gagal Update';
  final String pesan;
  final String? judul;
}
