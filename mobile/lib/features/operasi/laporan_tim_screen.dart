import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import 'ringkas_tim.dart';
import 'tim_screen.dart';

/// Operasi > Laporan per Tim (v0.50): grid sub-tim ROW dari db_Tim dengan status hari ini (getLaporanRow semua tim).
/// Hanya lihat. Akses dijaga server (menu ROW_LAPORAN; PETUGAS tidak pernah sampai sini).
class LaporanTimScreen extends StatefulWidget {
  const LaporanTimScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  @override
  State<LaporanTimScreen> createState() => _LaporanTimScreenState();
}

class _LaporanTimScreenState extends State<LaporanTimScreen> {
  List<Map<String, dynamic>> _tim = const [];
  Map<String, List<Map<String, dynamic>>>? _perTim; // null = server tidak didapat
  bool _memuat = true;
  String? _pesan;

  @override
  void initState() {
    super.initState();
    unawaited(_muat());
  }

  Future<void> _muat({bool beriTahu = false}) async {
    setState(() => _memuat = true);
    final tim = await widget.deps.master.timRow();
    Map<String, List<Map<String, dynamic>>>? perTim;
    String? pesan;
    try {
      perTim = RingkasTim.perTim(await widget.deps.laporan.laporanHariIni(widget.sesi));
    } on ApiException catch (e) {
      pesan = e.kode.startsWith('HTTP_') ? 'Tidak ada sinyal. Status hari ini belum bisa dimuat.' : KodeError.pesan(e.kode);
    } catch (_) {
      pesan = 'Tidak ada sinyal. Status hari ini belum bisa dimuat.';
    }
    if (!mounted) return;
    setState(() {
      _tim = tim;
      _perTim = perTim;
      _pesan = pesan;
      _memuat = false;
    });
    if (beriTahu && mounted) tampilPesan(context, pesan ?? 'Status tim diperbarui.');
  }

  @override
  Widget build(BuildContext context) {
    final tgl = DateFormat('EEEE, d MMMM y', 'id_ID').format(DateTime.now());
    Widget isi;
    if (_memuat && _tim.isEmpty) {
      isi = const SisiLoading(pesan: 'Memuat tim...', ukuran: 60);
    } else if (_tim.isEmpty) {
      isi = bisaDitarik(const SisiKosong(
        ikon: Icons.groups_outlined,
        judul: 'Belum ada sub-tim ROW',
        pesan: 'Download Master Data di Pengaturan, atau tambahkan sub-tim di db_Tim.',
      ));
    } else {
      isi = ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 12, 16, 40), children: [
        if (_memuat) const Padding(padding: EdgeInsets.only(bottom: 8), child: LinearProgressIndicator(minHeight: 3)),
        if (_pesan != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(_pesan!, style: const TextStyle(fontSize: 12, color: AppColors.red700)),
          ),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.15,
          children: [
            for (final t in _tim)
              _KartuTim(
                tim: t,
                r: RingkasTim(_perTim == null ? null : (_perTim!['${t['id']}'] ?? const [])),
                onTap: () => _buka(t),
              ),
          ],
        ),
      ]);
    }
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar('Laporan per Tim', subjudul: tgl, actions: [
        TombolSegarkan(sibuk: _memuat, onPressed: () => unawaited(_muat(beriTahu: true))),
      ]),
      body: RefreshIndicator(onRefresh: () => _muat(beriTahu: true), child: isi),
    );
  }

  Future<void> _buka(Map<String, dynamic> t) async {
    await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => TimScreen(deps: widget.deps, sesi: widget.sesi, tim: t)));
    if (mounted) await _muat();
  }
}

class _KartuTim extends StatelessWidget {
  const _KartuTim({required this.tim, required this.r, required this.onTap});
  final Map<String, dynamic> tim;
  final RingkasTim r;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    String angka(int n) => r.adaLaporan ? '$n' : '-';
    return Material(
      color: Colors.white,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: AppColors.neutral200)),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(color: AppColors.success100, borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.park_rounded, color: AppColors.success700, size: 20),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text('${tim['nama']}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
              ),
            ]),
            const Spacer(),
            StatusBadge(r.label, warna: r.warna, latar: r.latar),
            const SizedBox(height: 8),
            Text('R ${angka(r.rabas)}   S ${angka(r.sedang)}   B ${angka(r.besar)}',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.neutral700)),
          ]),
        ),
      ),
    );
  }
}
