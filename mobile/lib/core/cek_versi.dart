import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme/app_colors.dart';
import 'api_client.dart';
import 'pembaru_apk.dart';
import 'env.dart';
import 'kunci_update.dart';
import 'versi.dart';

/// v0.81.0 (permintaan kvlar 10 Okt 2026): notifikasi update app saat dibuka / kembali dari latar belakang / backend
/// baru di-deploy (jawaban server membawa versi). Versi app dan backend wajib sama:
///  - WAJIB update (app < minimum, default = versi server): dialog tidak bisa ditutup, tombol Download + Cek Lagi.
///  - Update tersedia (minimum <= app < server): dialog, boleh Nanti (muncul lagi saat app dibuka berikutnya).
///  - Server lebih lama dari app: info sekali (fitur baru mungkin belum jalan sampai backend di-deploy).
/// Offline / ping gagal = diam (app offline-first tetap bisa dipakai).
/// v1.0.22 (permintaan kvlar 23 Okt 2026): kartu WAJIB update bisa ditutup (Tutup). Selama wajib update, input + sinkron
/// mati ([KunciUpdate]); halaman tetap bisa dibuka. Pita merah di atas halaman membuka kartu ini lagi.
class PemeriksaVersi {
  PemeriksaVersi(this._api, this._konteks);
  final ApiClient _api;
  final BuildContext? Function() _konteks;

  /// Pemeriksa milik app (dipakai tombol Cek Pembaruan di Pengaturan).
  static PemeriksaVersi? aktif;

  /// v1.0.19: token sesi aktif (dipasang app) untuk mengunduh update langsung (getUpdateApp). null = belum login.
  static String? Function()? tokenSesi;

  ApiClient get api => _api;

  /// v0.81.1: info versi server terakhir (kartu Versi Aplikasi di Pengaturan ikut diperbarui).
  static final ValueNotifier<InfoVersi?> terakhir = ValueNotifier<InfoVersi?>(null);

  DateTime? _terakhir;
  bool _jalan = false;
  bool _dialogTerbuka = false;
  final Set<String> _sudahInfo = {};

  /// [paksa] = abaikan jeda 15 menit (mis. backend baru terdeteksi). [manual] = dari Pengaturan (selalu ada jawaban).
  Future<InfoVersi?> cek({bool paksa = false, bool manual = false}) async {
    if (_jalan || _dialogTerbuka) return null;
    final now = DateTime.now();
    if (!paksa && !manual && _terakhir != null && now.difference(_terakhir!) < const Duration(minutes: 15)) return null;
    _jalan = true;
    InfoVersi? info;
    try {
      final d = await _api.call('ping', timeout: const Duration(seconds: 20));
      info = InfoVersi.dariJson(d['versi']);
      _terakhir = now;
      if (info != null) _catat(info);
    } catch (_) {
      info = null;
    } finally {
      _jalan = false;
    }
    final c = _konteks();
    if (c == null || !c.mounted) return info;
    if (info == null) {
      if (manual) _pesan(c, 'Tidak bisa cek pembaruan. Cek sinyal lalu coba lagi.');
      return null;
    }
    switch (info.statusUntuk(versiApp)) {
      case StatusVersi.wajibUpdate:
        await _dialog(c, info, wajib: true);
      case StatusVersi.updateTersedia:
        await _dialog(c, info, wajib: false);
      case StatusVersi.serverLama:
        if (manual || _sudahInfo.add(info.server)) {
          _pesan(c, 'Server masih v${info.server}, aplikasi v$versiApp. Fitur baru jalan setelah admin deploy backend.');
        }
      case StatusVersi.sama:
        if (manual) _pesan(c, 'Aplikasi sudah versi terbaru (v$versiApp).');
      case StatusVersi.tidakDiketahui:
        if (manual) _pesan(c, 'Versi server tidak terbaca.');
    }
    return info;
  }

  /// Info versi terakhir + kunci input / sinkron (wajib update = terkunci, sudah update / server sama = terbuka).
  void _catat(InfoVersi i) {
    terakhir.value = i;
    KunciUpdate.aktif.value = i.statusUntuk(versiApp) == StatusVersi.wajibUpdate;
  }

  void _pesan(BuildContext c, String t) {
    ScaffoldMessenger.maybeOf(c)
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(t)));
  }

  Future<void> _dialog(BuildContext c, InfoVersi info, {required bool wajib}) async {
    _dialogTerbuka = true;
    try {
      await showDialog<void>(
        context: c,
        barrierDismissible: !wajib,
        builder: (d) => DialogUpdateVersi(
            info: info,
            wajib: wajib,
            onCekLagi: () async {
              final ulang = await _ambil();
              if (ulang != null && ulang.statusUntuk(versiApp) != StatusVersi.wajibUpdate && d.mounted) Navigator.pop(d);
            }),
      );
    } finally {
      _dialogTerbuka = false;
    }
  }

  Future<InfoVersi?> _ambil() async {
    try {
      final i = InfoVersi.dariJson((await _api.call('ping', timeout: const Duration(seconds: 20)))['versi']);
      if (i != null) _catat(i);
      return i;
    } catch (_) {
      return null;
    }
  }
}

class DialogUpdateVersi extends StatelessWidget {
  const DialogUpdateVersi({super.key, required this.info, required this.wajib, required this.onCekLagi});
  final InfoVersi info;
  final bool wajib;
  final Future<void> Function() onCekLagi;

  /// v1.0.19: sudah login = unduh + pasang APK langsung dari app (folder Drive). Belum login = link lama (browser).
  bool get _langsung => PemeriksaVersi.tokenSesi?.call() != null && PemeriksaVersi.aktif != null;

  Future<void> _download(BuildContext context) async {
    final token = PemeriksaVersi.tokenSesi?.call(), api = PemeriksaVersi.aktif?.api;
    if (token != null && api != null) {
      await PembaruApk.jalankan(context, api, token);
      return;
    }
    final uri = Uri.tryParse(info.linkUnduh);
    final ok = uri != null && await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(const SnackBar(content: Text('Link download tidak bisa dibuka. Minta APK terbaru ke admin.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final poin = info.catatan.split('|').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
    return PopScope(
      canPop: !wajib,
      child: AlertDialog(
        actionsOverflowButtonSpacing: 4,
        icon: Icon(wajib ? Icons.system_update_rounded : Icons.new_releases_rounded, size: 40, color: wajib ? AppColors.red700 : AppColors.brand700),
        title: Text(wajib ? 'Wajib Update Aplikasi' : 'Update Tersedia', textAlign: TextAlign.center),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.neutral100, borderRadius: BorderRadius.circular(14)),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
              _Versi(judul: 'Aplikasi ini', versi: versiApp, warna: AppColors.neutral700),
              const Icon(Icons.arrow_forward_rounded, color: AppColors.neutral400),
              _Versi(judul: Env.isStaging ? 'Server STAGING' : 'Server', versi: info.server, warna: AppColors.success700),
            ]),
          ),
          const SizedBox(height: 12),
          Text(
            // v1.0.22: teks baru (permintaan kvlar)
            wajib
                ? '${KunciUpdate.pesan}. Sebelum update, input dan sinkron data dimatikan; halaman tetap bisa dibuka. '
                    'Data yang belum terkirim tetap aman di HP.'
                : '${KunciUpdate.pesan}.',
            style: const TextStyle(fontSize: 13),
          ),
          if (poin.isNotEmpty) ...[
            const SizedBox(height: 10),
            const Text('Yang baru:', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
            for (final x in poin) Text('•  $x', style: const TextStyle(fontSize: 12.5)),
          ],
          if (info.linkUnduh.isEmpty && !_langsung) ...[
            const SizedBox(height: 10),
            const Text('Minta file APK terbaru ke admin.', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.accent700)),
          ],
        ]),
        actions: [
          // v1.0.22: wajib update juga bisa ditutup (input + sinkron tetap mati sampai terupdate)
          TextButton(onPressed: () => Navigator.pop(context), child: Text(wajib ? 'Tutup' : 'Nanti')),
          if (wajib) TextButton(onPressed: () => unawaited(onCekLagi()), child: const Text('Cek Lagi')),
          if (info.linkUnduh.isNotEmpty || _langsung)
            FilledButton.icon(
                onPressed: () => unawaited(_download(context)),
                icon: const Icon(Icons.system_update_rounded),
                label: Text(_langsung ? 'Update Sekarang' : 'Download Update')),
        ],
      ),
    );
  }
}

class _Versi extends StatelessWidget {
  const _Versi({required this.judul, required this.versi, required this.warna});
  final String judul;
  final String versi;
  final Color warna;

  @override
  Widget build(BuildContext context) => Column(children: [
        Text(judul, style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
        Text('v$versi', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: warna)),
      ]);
}

/// v0.81.1 (permintaan kvlar): kartu Versi Aplikasi di Pengaturan.
/// v1.0.16: tampilan ringan (kartu putih seperti baris Pengaturan lain, bukan sorotan): versi app + lingkungan, tanpa
/// chip status server. Keterangan hanya muncul kalau ada update untuk aplikasi; ketuk = cek pembaruan.
class KartuVersiAplikasi extends StatelessWidget {
  const KartuVersiAplikasi({super.key});

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<InfoVersi?>(
        valueListenable: PemeriksaVersi.terakhir,
        builder: (context, info, _) {
          final st = info?.statusUntuk(versiApp);
          final (String? teks, Color warna) = switch (st) {
            StatusVersi.updateTersedia => ('Update tersedia, ketuk untuk memperbarui', AppColors.brand700),
            StatusVersi.wajibUpdate => ('Wajib update, ketuk untuk memperbarui', AppColors.red700),
            _ => (null, AppColors.neutral500),
          };
          return Material(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: () {
                final p = PemeriksaVersi.aktif;
                if (p != null) unawaited(p.cek(manual: true));
              },
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: AppColors.neutral200),
                ),
                child: Row(children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(color: AppColors.neutral100, borderRadius: BorderRadius.circular(12)),
                    child: const Icon(Icons.info_outline_rounded, color: AppColors.neutral700),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Versi aplikasi ${Env.isStaging ? '(Staging)' : ''}'.trim(),
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                      const SizedBox(height: 2),
                      Text(teks ?? 'Ketuk untuk cek pembaruan',
                          style: TextStyle(fontSize: 11.5, color: warna, fontWeight: teks == null ? FontWeight.w400 : FontWeight.w700)),
                    ]),
                  ),
                  const Text('v$versiApp', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.neutral700)),
                ]),
              ),
            ),
          );
        },
      );
}
