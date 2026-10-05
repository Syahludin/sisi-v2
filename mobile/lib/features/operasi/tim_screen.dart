import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import '../../widgets/wa_panel.dart';
import '../row/arsip_hari_screen.dart';
import '../row/laporan_row_screen.dart';
import 'ringkas_tim.dart';

/// Halaman satu sub-tim (v0.50): hero + tab Hari ini | Arsip. Hanya lihat (admin tidak membuat / mengubah data
/// ROW atas nama sub-tim, Log Keputusan). Detail hari ini lewat getArsipHariRow (admin boleh tanggal hari ini).
class TimScreen extends StatefulWidget {
  const TimScreen({super.key, required this.deps, required this.sesi, required this.tim});
  final Deps deps;
  final Sesi sesi;
  final Map<String, dynamic> tim;

  @override
  State<TimScreen> createState() => _TimScreenState();
}

class _TimScreenState extends State<TimScreen> {
  int _tab = 0;
  List<Map<String, dynamic>>? _laporan; // null = belum dimuat / offline
  bool _memuat = true;
  String? _pesan;
  final _kunciArsip = GlobalKey<ArsipViewState>();

  String get _timId => '${widget.tim['id']}';
  String get _hariIni => DateFormat('yyyy-MM-dd').format(DateTime.now());

  @override
  void initState() {
    super.initState();
    unawaited(_muat());
  }

  Future<void> _muat({bool beriTahu = false}) async {
    setState(() => _memuat = true);
    String? pesan;
    List<Map<String, dynamic>>? laporan;
    try {
      laporan = await widget.deps.laporan.laporanHariIni(widget.sesi, timId: _timId);
    } on ApiException catch (e) {
      pesan = e.kode.startsWith('HTTP_') ? 'Tidak ada sinyal. Laporan hari ini belum bisa dimuat.' : KodeError.pesan(e.kode);
    } catch (_) {
      pesan = 'Tidak ada sinyal. Laporan hari ini belum bisa dimuat.';
    }
    if (!mounted) return;
    setState(() {
      if (laporan != null) _laporan = laporan;
      _pesan = pesan;
      _memuat = false;
    });
    if (beriTahu && mounted) tampilPesan(context, pesan ?? 'Laporan ${widget.tim['nama']} diperbarui.');
  }

  /// Tombol kanan atas sesuai tab: Hari ini = muat ulang dari server, Arsip = download ulang rentang.
  Future<void> _segarkan() async {
    if (_tab == 0) {
      await _muat(beriTahu: true);
    } else {
      await _kunciArsip.currentState?.segarkan();
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = RingkasTim(_laporan);
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar('${widget.tim['nama']}', subjudul: 'Sub-tim ROW • ULP ${widget.sesi.ulp}', actions: [
        TombolSegarkan(sibuk: _tab == 0 && _memuat, onPressed: () => unawaited(_segarkan())),
      ]),
      body: Column(children: [
        Padding(padding: const EdgeInsets.fromLTRB(16, 14, 16, 0), child: _hero(r)),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(color: AppColors.neutral150, borderRadius: BorderRadius.circular(999)),
            child: Row(children: [_pill('Hari ini', 0), _pill('Arsip', 1)]),
          ),
        ),
        Expanded(
          child: IndexedStack(index: _tab, children: [
            _hariIniView(),
            ArsipView(key: _kunciArsip, deps: widget.deps, sesi: widget.sesi, timId: _timId),
          ]),
        ),
      ]),
    );
  }

  Widget _hero(RingkasTim r) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.navy700,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [BoxShadow(color: AppColors.navy700.withValues(alpha: .2), blurRadius: 10, offset: const Offset(0, 4))],
        ),
        child: Row(children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: .15), borderRadius: BorderRadius.circular(12)),
            child: const Icon(Icons.park_rounded, color: AppColors.plnYellow, size: 28),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${widget.tim['nama']}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white)),
              const SizedBox(height: 2),
              Text('Hari ini: ${_laporan == null && _memuat ? '...' : r.label}',
                  style: TextStyle(fontSize: 12, color: Colors.white.withValues(alpha: .85))),
              const SizedBox(height: 6),
              Text(r.adaLaporan ? 'Rabas ${r.rabas}   Sedang ${r.sedang}   Besar ${r.besar}' : 'Belum ada hitungan hari ini',
                  style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: Colors.white)),
            ]),
          ),
        ]),
      );

  Widget _pill(String label, int i) {
    final aktif = _tab == i;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _tab = i),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(color: aktif ? AppColors.navy700 : Colors.transparent, borderRadius: BorderRadius.circular(999)),
          child: Text(label,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: aktif ? Colors.white : AppColors.neutral700)),
        ),
      ),
    );
  }

  Widget _hariIniView() {
    final daftar = _laporan;
    Widget isi;
    if (daftar == null && _memuat) {
      isi = const SisiLoading(pesan: 'Memuat laporan...', ukuran: 60);
    } else if (daftar == null || daftar.isEmpty) {
      isi = bisaDitarik(SisiKosong(
        ikon: daftar == null ? Icons.cloud_off_outlined : Icons.event_busy_outlined,
        judul: daftar == null ? 'Belum bisa dimuat' : 'Belum ada laporan hari ini',
        pesan: _pesan ?? 'Sub-tim ini belum mengirim laporan hari ini.',
      ));
    } else {
      isi = ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 12, 16, 40), children: [
        if (_pesan != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(_pesan!, style: const TextStyle(fontSize: 12, color: AppColors.red700)),
          ),
        for (final l in daftar) ...[
          _KartuLaporan(l: l, onDetail: () => _detail(l)),
          const SizedBox(height: 12),
        ],
        const Text('Mode lihat: data diisi oleh petugas sub-tim.',
            textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: AppColors.neutral500)),
      ]);
    }
    return RefreshIndicator(onRefresh: () => _muat(beriTahu: true), child: isi);
  }

  Future<void> _detail(Map<String, dynamic> l) => Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => ArsipHariScreen(
              deps: widget.deps, sesi: widget.sesi, tanggal: _hariIni, headerId: l['headerId'] as String?, timId: _timId),
        ),
      );
}

class _KartuLaporan extends StatelessWidget {
  const _KartuLaporan({required this.l, required this.onDetail});
  final Map<String, dynamic> l;
  final VoidCallback onDetail;

  @override
  Widget build(BuildContext context) {
    final siap = l['siapKirim'] == true;
    final teks = (l['waText'] as String?) ?? '';
    final penyulang = (l['penyulang'] as List<dynamic>? ?? const <dynamic>[]).length;
    final menunggu = (l['menungguFoto'] as num?)?.toInt() ?? 0;
    final t = (l['total'] as Map<String, dynamic>?) ?? const <String, dynamic>{};
    int n(String k) => (t[k] as num?)?.toInt() ?? 0;
    return Material(
      color: Colors.white,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: AppColors.neutral200)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
              child: Text('${l['kodeHeader']}', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
            ),
            siap
                ? const StatusBadge('SIAP WA', warna: AppColors.success700, latar: AppColors.success100, ikon: Icons.check_circle_outline)
                : const StatusBadge('PROSES', warna: AppColors.accent700, latar: AppColors.accent100, ikon: Icons.hourglass_bottom_rounded),
          ]),
          const SizedBox(height: 6),
          Text('$penyulang penyulang terhitung • Rabas ${n('rabas')} • Sedang ${n('sedang')} • Besar ${n('besar')}',
              style: const TextStyle(fontSize: 12, color: AppColors.neutral700)),
          if (menunggu > 0)
            Text('$menunggu eksekusi menunggu foto', style: const TextStyle(fontSize: 11.5, color: AppColors.accent700)),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: onDetail,
                icon: const Icon(Icons.visibility_outlined, size: 18),
                label: const Text('Lihat detail'),
              ),
            ),
            if (siap && teks.isNotEmpty) ...[
              const SizedBox(width: 8),
              IconButton.outlined(tooltip: 'Salin WA', onPressed: () => unawaited(salinWa(context, teks)), icon: const Icon(Icons.copy_rounded)),
              const SizedBox(width: 4),
              IconButton.filled(
                  tooltip: 'Kirim WA', onPressed: () => unawaited(kirimWa(context, teks)), icon: const Icon(Icons.send_rounded)),
            ],
          ]),
        ]),
      ),
    );
  }
}
