import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import 'katalog_operasi.dart';
import 'laporan_tim_screen.dart';
import 'laporan_up3_screen.dart';

/// Tab Operasi untuk ADMIN / SUPER / ADMIN_ES (v0.50, desain kvlar 4 Okt 2026).
/// Grup tile dari KatalogOperasi; tiap modul hanya tampil kalau menu_kode-nya ada di menu sesi (db_Menu + db_Akses).
/// Modul yang belum dibangun di v2 tetap tampil dengan badge "Segera" dan keterangan saat diketuk.
class OperasiScreen extends StatefulWidget {
  const OperasiScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  @override
  State<OperasiScreen> createState() => _OperasiScreenState();
}

class _OperasiScreenState extends State<OperasiScreen> {
  final _cari = TextEditingController();
  String _kata = '';
  String? _ringkasTim; // "4 tim · 2 SIAP WA · 1 belum lapor" (null = belum dimuat / offline)
  bool _menyegarkan = false;

  @override
  void initState() {
    super.initState();
    unawaited(_muatRingkas());
  }

  @override
  void dispose() {
    _cari.dispose();
    super.dispose();
  }

  bool _punya(ModulOperasi m) => widget.sesi.aksiMenu(m.kode) != null;

  Future<void> _muatRingkas() async {
    if (widget.sesi.aksiMenu('ROW_LAPORAN') == null) return;
    try {
      final tim = await widget.deps.master.timRow();
      final laporan = await widget.deps.laporan.laporanHariIni(widget.sesi);
      final lapor = {for (final l in laporan) l['timId'] as String?};
      final siap = {for (final l in laporan) if (l['siapKirim'] == true) l['timId'] as String?};
      final belum = tim.where((t) => !lapor.contains(t['id'])).length;
      if (mounted) setState(() => _ringkasTim = '${tim.length} tim · ${siap.length} SIAP WA · $belum belum lapor');
    } catch (_) {
      if (mounted) setState(() => _ringkasTim = null);
    }
  }

  Future<void> _segarkan() async {
    if (_menyegarkan) return;
    setState(() => _menyegarkan = true);
    try {
      await _muatRingkas();
    } finally {
      if (mounted) setState(() => _menyegarkan = false);
    }
  }

  Future<void> _buka(ModulOperasi m) async {
    if (!m.siap) {
      await _segera(m);
      return;
    }
    switch (m.kode) {
      case 'ROW_LAPORAN':
        await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => LaporanTimScreen(deps: widget.deps, sesi: widget.sesi)));
        await _muatRingkas();
      case 'OPS_LAP_UP3':
        await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => LaporanUp3Screen(deps: widget.deps, sesi: widget.sesi, bagian: 'UP3')));
      case 'OPS_LAP_UIW':
        await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => LaporanUp3Screen(deps: widget.deps, sesi: widget.sesi, bagian: 'UIW')));
    }
  }

  Future<void> _segera(ModulOperasi m) {
    return showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(color: m.warna.withValues(alpha: .12), shape: BoxShape.circle),
            child: Icon(m.ikon, color: m.warna, size: 32),
          ),
          const SizedBox(height: 12),
          Text(m.nama, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.navy900)),
          const SizedBox(height: 6),
          const Text('Fitur ini segera dirilis.',
              textAlign: TextAlign.center, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: AppColors.accent700)),
          const SizedBox(height: 4),
          Text(m.desc, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
          const SizedBox(height: 18),
          SizedBox(width: double.infinity, child: FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Mengerti'))),
        ]),
      ),
    );
  }

  bool _cocok(ModulOperasi m) {
    final k = _kata.trim().toLowerCase();
    return k.isEmpty || m.nama.toLowerCase().contains(k) || m.desc.toLowerCase().contains(k) || m.grup.toLowerCase().contains(k);
  }

  @override
  Widget build(BuildContext context) {
    final terlihat = KatalogOperasi.semua.where((m) => _punya(m) && _cocok(m)).toList();
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar('Operasi', subjudul: 'ULP ${widget.sesi.ulp} • ${widget.sesi.role}', actions: [
        TombolSegarkan(sibuk: _menyegarkan, onPressed: _segarkan),
      ]),
      body: RefreshIndicator(
        onRefresh: _segarkan,
        child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 12, 16, 120), children: [
          TextField(
            controller: _cari,
            onChanged: (v) => setState(() => _kata = v),
            decoration: InputDecoration(
              hintText: 'Cari menu...',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: _kata.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () => setState(() {
                        _cari.clear();
                        _kata = '';
                      }),
                    ),
              filled: true,
              fillColor: Colors.white,
              isDense: true,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.neutral200)),
              enabledBorder:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.neutral200)),
            ),
          ),
          if (terlihat.isEmpty) ...[
            const SizedBox(height: 40),
            SisiKosong(
              ikon: Icons.search_off_rounded,
              judul: _kata.isEmpty ? 'Belum ada menu' : 'Menu tidak ditemukan',
              pesan: _kata.isEmpty ? 'Akun ini belum punya akses menu Operasi. Hubungi admin.' : 'Coba kata lain.',
            ),
          ],
          for (final g in KatalogOperasi.grup) ..._grup(g, terlihat.where((m) => m.grup == g).toList()),
        ]),
      ),
    );
  }

  List<Widget> _grup(String judul, List<ModulOperasi> isi) {
    if (isi.isEmpty) return const [];
    final lebar = isi.where((m) => m.lebar).toList();
    final kecil = isi.where((m) => !m.lebar).toList();
    return [
      const SizedBox(height: 20),
      Text(judul.toUpperCase(),
          style: const TextStyle(fontSize: 11, letterSpacing: 1.1, fontWeight: FontWeight.w900, color: AppColors.cyan600)),
      const SizedBox(height: 10),
      for (final m in lebar) ...[
        _TileLebar(m: m, sub: m.kode == 'ROW_LAPORAN' ? (_ringkasTim ?? m.desc) : m.desc, onTap: () => _buka(m)),
        const SizedBox(height: 10),
      ],
      if (kecil.isNotEmpty)
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: .86,
          children: [for (final m in kecil) _Tile(m: m, onTap: () => _buka(m))],
        ),
    ];
  }
}

class _TileLebar extends StatelessWidget {
  const _TileLebar({required this.m, required this.sub, required this.onTap});
  final ModulOperasi m;
  final String sub;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.white,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: AppColors.neutral200)),
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(color: m.warna.withValues(alpha: .12), borderRadius: BorderRadius.circular(14)),
                child: Icon(m.ikon, color: m.warna, size: 26),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(m.nama, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                  const SizedBox(height: 3),
                  Text(sub, style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
                ]),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.neutral400),
            ]),
          ),
        ),
      );
}

class _Tile extends StatelessWidget {
  const _Tile({required this.m, required this.onTap});
  final ModulOperasi m;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.white,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: AppColors.neutral200)),
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(8, 12, 8, 10),
            child: Column(children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(color: m.warna.withValues(alpha: .12), shape: BoxShape.circle),
                child: Icon(m.ikon, color: m.warna, size: 23),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: Text(m.nama,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.navy900, height: 1.2)),
              ),
              if (!m.siap)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(999)),
                  child: const Text('Segera', style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: AppColors.accent700)),
                ),
            ]),
          ),
        ),
      );
}
