import 'dart:async';

import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import 'api_client.dart';
import 'sesi.dart';

/// v1.0.19 (permintaan kvlar 23 Okt 2026): lonceng notifikasi di header (bukan notifikasi latar belakang).
/// Admin: P0 masuk (Menunggu approval) + temuan inspeksi baru. Tim: WO yang dikirim admin. Angka = item yang belum
/// dibuka akun ini (status dilihat disimpan server per akun, sama di semua HP). Dimuat saat app dibuka, kembali dari
/// latar, dan tiap 3 menit selama app terbuka.
class Lonceng extends ChangeNotifier with WidgetsBindingObserver {
  Lonceng._();
  static final Lonceng i = Lonceng._();

  ApiClient? _api;
  Sesi? _sesi;
  Timer? _jam;
  bool _muat = false;
  List<Map<String, dynamic>> item = const [];
  int belum = 0;

  /// Dipasang kerangka dashboard: buka layar tujuan item (P0 / temuan / WO).
  void Function(Map<String, dynamic> item)? buka;

  bool get aktif => _sesi != null;

  void mulai(ApiClient api, Sesi sesi) {
    final ganti = _sesi?.userId != sesi.userId;
    _api = api;
    _sesi = sesi;
    if (ganti) {
      item = const [];
      belum = 0;
      WidgetsBinding.instance.removeObserver(this);
      WidgetsBinding.instance.addObserver(this);
      _jam?.cancel();
      _jam = Timer.periodic(const Duration(minutes: 3), (_) => unawaited(segarkan()));
    }
    notifyListeners();
    unawaited(segarkan());
  }

  void berhenti() {
    _jam?.cancel();
    _jam = null;
    WidgetsBinding.instance.removeObserver(this);
    _sesi = null;
    item = const [];
    belum = 0;
    buka = null;
    notifyListeners();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(segarkan());
  }

  /// Ambil daftar dari server. Tanpa sinyal = angka terakhir tetap tampil.
  Future<void> segarkan() async {
    final api = _api, s = _sesi;
    if (api == null || s == null || _muat) return;
    _muat = true;
    try {
      final r = await api.call('getNotifikasi', token: s.token, data: const {}, timeout: const Duration(seconds: 30));
      if (_sesi?.userId != s.userId) return;
      item = [for (final x in (r['item'] as List? ?? const [])) if (x is Map) Map<String, dynamic>.from(x)];
      belum = (r['belum'] as num?)?.toInt() ?? item.where((x) => x['dilihat'] != true).length;
      notifyListeners();
    } catch (_) {
      // offline / sesi habis: biarkan
    } finally {
      _muat = false;
    }
  }

  /// Tandai item dilihat (langsung di HP, lalu dikirim ke server). [semua] = semua item.
  Future<void> tandai({Iterable<String> kunci = const [], bool semua = false}) async {
    final api = _api, s = _sesi;
    if (api == null || s == null) return;
    final set = semua ? {for (final x in item) '${x['kunci']}'} : kunci.toSet();
    var ubah = false;
    item = [
      for (final x in item)
        if (x['dilihat'] != true && set.contains('${x['kunci']}')) {...x, 'dilihat': true} else x,
    ];
    for (final x in item) {
      if (set.contains('${x['kunci']}')) ubah = true;
    }
    belum = item.where((x) => x['dilihat'] != true).length;
    if (ubah) notifyListeners();
    try {
      await api.call('tandaiNotifikasi', token: s.token, data: semua ? {'semua': true} : {'kunci': set.join('|')});
    } catch (_) {
      // gagal kirim: dicoba lagi saat item dibuka berikutnya (server tetap menghitung belum dilihat)
    }
  }
}

/// Tombol lonceng + angka belum dilihat. Tidak tampil kalau belum login. [warna] = warna ikon, [latar] = latar tombol.
class LoncengNotifikasi extends StatelessWidget {
  const LoncengNotifikasi({super.key, this.warna = Colors.white, this.latar});
  final Color warna;
  final Color? latar;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Lonceng.i,
        builder: (context, _) {
          final l = Lonceng.i;
          if (!l.aktif) return const SizedBox.shrink();
          return IconButton(
            tooltip: l.belum > 0 ? '${l.belum} notifikasi belum dilihat' : 'Notifikasi',
            onPressed: () => unawaited(bukaDaftarLonceng(context)),
            style: IconButton.styleFrom(foregroundColor: warna, backgroundColor: latar),
            icon: Badge(
              isLabelVisible: l.belum > 0,
              backgroundColor: AppColors.accent400,
              textColor: AppColors.brand950,
              label: Text(l.belum > 99 ? '99+' : '${l.belum}', style: const TextStyle(fontWeight: FontWeight.w900)),
              child: Icon(l.belum > 0 ? Icons.notifications_active_rounded : Icons.notifications_none_rounded),
            ),
          );
        },
      );
}

const _gayaJenis = {
  'P0': (Icons.bolt_rounded, AppColors.brand700, AppColors.brand100, 'P0 masuk'),
  'TEMUAN': (Icons.report_gmailerrorred_rounded, AppColors.accent700, AppColors.accent100, 'Temuan inspeksi'),
  'WO': (Icons.assignment_turned_in_outlined, AppColors.success700, AppColors.success100, 'WO dari admin'),
};

/// Daftar notifikasi (lembar bawah). Ketuk item = tandai dilihat + buka layar tujuannya.
Future<void> bukaDaftarLonceng(BuildContext context) async {
  unawaited(Lonceng.i.segarkan());
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (c) => ListenableBuilder(
      listenable: Lonceng.i,
      builder: (c, _) {
        final l = Lonceng.i;
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(c).height * .8),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 12, 8),
                child: Row(children: [
                  const Icon(Icons.notifications_rounded, color: AppColors.brand700),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(l.belum > 0 ? 'Notifikasi · ${l.belum} baru' : 'Notifikasi',
                        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.brand950)),
                  ),
                  if (l.belum > 0) TextButton(onPressed: () => unawaited(l.tandai(semua: true)), child: const Text('Tandai semua dilihat')),
                ]),
              ),
              if (l.item.isEmpty)
                const Padding(
                  padding: EdgeInsets.fromLTRB(20, 20, 20, 32),
                  child: Text('Belum ada notifikasi 14 hari terakhir.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.neutral500)),
                )
              else
                Flexible(
                  child: ListView.separated(
                    shrinkWrap: true,
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                    itemCount: l.item.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 6),
                    itemBuilder: (c, i) {
                      final x = l.item[i];
                      final baru = x['dilihat'] != true;
                      final (ikon, warna, latar, label) = _gayaJenis['${x['jenis']}'] ?? (Icons.notifications_none_rounded, AppColors.neutral700, AppColors.neutral100, '');
                      return Material(
                        color: baru ? AppColors.brand50 : AppColors.surface,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14), side: BorderSide(color: baru ? AppColors.brand100 : AppColors.neutral200)),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(14),
                          onTap: () {
                            unawaited(l.tandai(kunci: ['${x['kunci']}']));
                            Navigator.pop(c);
                            l.buka?.call(x);
                          },
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Container(
                                width: 38,
                                height: 38,
                                decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(11)),
                                child: Icon(ikon, size: 20, color: warna),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text('${x['judul'] ?? ''}',
                                      style: TextStyle(fontSize: 14, fontWeight: baru ? FontWeight.w800 : FontWeight.w600, color: AppColors.brand950)),
                                  if ('${x['rincian'] ?? ''}'.isNotEmpty)
                                    Text('${x['rincian']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
                                  Text('$label · ${_waktu('${x['waktu'] ?? ''}')}', style: const TextStyle(fontSize: 11.5, color: AppColors.neutral400)),
                                ]),
                              ),
                              if (baru) Container(width: 9, height: 9, margin: const EdgeInsets.only(top: 4), decoration: const BoxDecoration(color: AppColors.accent600, shape: BoxShape.circle)),
                            ]),
                          ),
                        ),
                      );
                    },
                  ),
                ),
            ]),
          ),
        );
      },
    ),
  );
}

String _waktu(String iso) {
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  final w = d.isUtc ? d.add(const Duration(hours: 7)) : d;
  String dua(int n) => n.toString().padLeft(2, '0');
  return iso.length <= 10 ? '${dua(w.day)}/${dua(w.month)}' : '${dua(w.day)}/${dua(w.month)} ${dua(w.hour)}:${dua(w.minute)}';
}
