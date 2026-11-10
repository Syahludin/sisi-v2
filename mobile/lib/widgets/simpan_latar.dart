import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/kode_error.dart';
import 'popup_berhasil.dart';

/// Pesan galat siap tampil dari galat apa pun.
String pesanGalat(Object e) => e is ApiException ? KodeError.pesan(e.kode) : 'Tidak bisa terhubung ke server. Periksa sinyal lalu coba lagi.';

/// Simpan di latar belakang (sama dengan proses lain di SiSi): layar isian sudah tertutup, [kerja] jalan di server, selesai =
/// kartu "Data Berhasil disimpan" lalu [sesudah]. Gagal = pesan + tombol "Coba Lagi" (isian tidak hilang). [kerja] boleh
/// mengembalikan catatan (mis. foto yang belum terkirim) yang ditampilkan sesudah kartu.
void simpanLatar(BuildContext context, {required Future<String?> Function() kerja, VoidCallback? sesudah}) {
  final pesan = ScaffoldMessenger.of(context);
  Future<void> jalan() async {
    pesan.hideCurrentSnackBar();
    pesan.showSnackBar(const SnackBar(content: Text('Menyimpan data…'), duration: Duration(minutes: 2)));
    try {
      final catatan = await kerja();
      pesan.hideCurrentSnackBar();
      sesudah?.call();
      if (context.mounted) await tampilDataTersimpan(context);
      if (catatan != null && catatan.isNotEmpty) pesan.showSnackBar(SnackBar(content: Text(catatan), duration: const Duration(seconds: 6)));
    } catch (e) {
      pesan.hideCurrentSnackBar();
      pesan.showSnackBar(SnackBar(
        content: Text('Belum tersimpan. ${pesanGalat(e)}'),
        duration: const Duration(seconds: 15),
        action: SnackBarAction(label: 'Coba Lagi', onPressed: jalan),
      ));
    }
  }

  jalan();
}
