import 'package:flutter/material.dart';

import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import 'batal_row.dart';
import 'eksekusi_detail_screen.dart';
import 'form_eksekusi_screen.dart';
import 'perbaikan_repository.dart';
import 'row_model.dart';

/// Daftar eksekusi satu penyulang (desain lama): kartu dengan ikon potong, FAB amber "Input Eksekusi".
class RealisasiScreen extends StatefulWidget {
  const RealisasiScreen({super.key, required this.deps, required this.sesi, required this.realisasiId});
  final Deps deps;
  final Sesi sesi;
  final String realisasiId;

  @override
  State<RealisasiScreen> createState() => _RealisasiScreenState();
}

class _RealisasiScreenState extends State<RealisasiScreen> {
  RowRealisasi? _r;
  List<RowEksekusi> _eks = const [];
  Map<String, int> _slot = const {};
  Map<String, String> _jenis = const {};
  Map<String, String> _sec = const {};
  bool _menyegarkan = false;
  bool _bisaUrungkan = false;

  @override
  void initState() {
    super.initState();
    _muat();
    widget.deps.syncCtl.addListener(_ulang);
  }

  @override
  void dispose() {
    widget.deps.syncCtl.removeListener(_ulang);
    super.dispose();
  }

  void _ulang() {
    if (!widget.deps.syncCtl.sedangSync) _muat();
  }

  Future<void> _muat() async {
    final r = await widget.deps.row.realisasi(widget.realisasiId);
    final e = await widget.deps.row.eksekusiDari(widget.realisasiId);
    final slot = await widget.deps.foto.jumlahSlot([for (final x in e) x.id]);
    final sec = r == null ? const <String, String>{} : {for (final x in await widget.deps.master.section(r.penyulang)) x.id: x.nama};
    final jenis = {for (final j in await widget.deps.master.jenisPekerjaan()) j['id'] as String: j['nama'] as String};
    final u = r != null && !r.aktif && await widget.deps.perbaikan.bisaUrungkan(widget.sesi.userId, 'realisasi', r.id);
    if (!mounted) return;
    setState(() {
      _bisaUrungkan = u;
      _r = r;
      _eks = e;
      _slot = slot;
      _jenis = jenis;
      _sec = sec;
    });
  }

  /// Refresh (v0.49): tarik layar atau tombol kanan atas. Sinkron dulu (kirim tertunda + tarik kode), lalu muat ulang.
  Future<void> _segarkan() async {
    if (_menyegarkan) return;
    setState(() => _menyegarkan = true);
    final ctl = widget.deps.syncCtl;
    try {
      await ctl.sinkron();
      await _muat();
      if (mounted) {
        tampilPesan(context, ctl.online == false ? 'Tidak ada sinyal. Menampilkan data di HP.' : 'Daftar eksekusi diperbarui.');
      }
    } finally {
      if (mounted) setState(() => _menyegarkan = false);
    }
  }

  Future<void> _input() async {
    final r = _r;
    if (r == null) return;
    final ok = await Navigator.push<bool>(
        context, MaterialPageRoute(builder: (_) => FormEksekusiScreen(deps: widget.deps, sesi: widget.sesi, realisasi: r)));
    if (ok == true) await _muat();
  }

  Future<void> _batal() async {
    final r = _r;
    if (r == null) {
      return;
    }
    final hapus = await batalkanRow(context, widget.deps, widget.sesi,
        jenis: 'realisasi', id: r.id, label: 'penyulang ${r.penyulang}');
    if (!mounted || hapus == null) {
      return;
    }
    if (hapus) {
      Navigator.pop(context);
      return;
    }
    await _muat();
  }

  Future<void> _urungkan() async {
    await urungkanBatalRow(context, widget.deps, widget.sesi, jenis: 'realisasi', id: widget.realisasiId);
    await _muat();
  }

  Future<void> _buka(RowEksekusi e) async {
    await Navigator.push(
        context, MaterialPageRoute(builder: (_) => EksekusiDetailScreen(deps: widget.deps, sesi: widget.sesi, eksekusiId: e.id)));
    await _muat();
  }

  @override
  Widget build(BuildContext context) {
    final r = _r;
    final boleh = r != null && r.aktif && widget.sesi.bisaUbah('ROW_EKSEKUSI');
    return Scaffold(
      backgroundColor: AppColors.neutral100,
      appBar: sisiAppBar(r == null ? 'Penyulang' : 'Penyulang ${r.penyulang}', subjudul: r?.kode, actions: [
        TombolSegarkan(sibuk: _menyegarkan || widget.deps.syncCtl.sedangSync, onPressed: _segarkan),
        MenuDataRow(
            labelBatal: 'Batalkan penyulang',
            bisaBatal: boleh && PerbaikanRepository.dalamBatas(r.kode),
            bisaUrungkan: _bisaUrungkan,
            onBatal: _batal,
            onUrungkan: _urungkan),
      ]),
      body: r == null
          ? const SisiLoading(ukuran: 60)
          : RefreshIndicator(
              onRefresh: _segarkan,
              child: _eks.isEmpty
              ? bisaDitarik(SisiKosong(
                  ikon: Icons.content_cut_rounded,
                  judul: 'Belum ada eksekusi',
                  pesan: 'Catat setiap pohon / gawang yang dikerjakan.',
                ))
              : ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 16, 16, 100), children: [
                  for (final e in _eks) ...[
                    _KartuEksekusi(
                      e: e,
                      jenis: e.jenisNama ?? _jenis[e.jenisId],
                      section: e.m['section'] as String? ?? _sec[e.sectionId] ?? '-',
                      slot: e.fotoLengkap ? 3 : (_slot[e.id] ?? 0),
                      onTap: () => _buka(e),
                    ),
                    const SizedBox(height: 10),
                  ],
                ]),
            ),
      floatingActionButton: boleh
          ? FloatingActionButton.extended(
              onPressed: _input,
              backgroundColor: AppColors.amber600,
              foregroundColor: AppColors.navy950,
              icon: const Icon(Icons.add_a_photo_outlined),
              label: const Text('Input Eksekusi', style: TextStyle(fontWeight: FontWeight.w800)),
            )
          : null,
    );
  }
}

class _KartuEksekusi extends StatelessWidget {
  const _KartuEksekusi({required this.e, required this.jenis, required this.section, required this.slot, required this.onTap});
  final RowEksekusi e;
  final String section;
  final String? jenis;
  final int slot;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final lengkap = slot >= 3;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Icon(Icons.content_cut_rounded, size: 18, color: AppColors.navy700),
              const SizedBox(width: 8),
              Expanded(child: Text(e.kode, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5))),
              e.aktif ? StatusBadge.sinkron(e.sinkron) : const StatusBadge('BATAL', warna: AppColors.red700, latar: AppColors.red100),
            ]),
            const SizedBox(height: 6),
            Text('${jenis ?? '-'} · ${e.diameter ?? '-'} cm', style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.neutral900)),
            Text('Tiang ${e.nomorTiang ?? '-'} • Section $section', style: const TextStyle(fontSize: 12.5)),
            const SizedBox(height: 8),
            Row(children: [
              Icon(lengkap ? Icons.photo_library_rounded : Icons.add_a_photo_outlined,
                  size: 16, color: lengkap ? AppColors.success600 : AppColors.accent700),
              const SizedBox(width: 6),
              Expanded(
                child: Text(lengkap ? 'Foto lengkap 3/3' : 'Foto $slot/3 · ketuk untuk melengkapi',
                    style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: lengkap ? AppColors.success700 : AppColors.accent700)),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.neutral400),
            ]),
            if (e.alasan != null) ...[
              const SizedBox(height: 4),
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Icon(Icons.info_outline_rounded, size: 15, color: AppColors.red700),
                const SizedBox(width: 6),
                Expanded(child: Text(KodeError.alasanSinkron(e.alasan), style: const TextStyle(fontSize: 11.5, color: AppColors.red700))),
              ]),
            ],
          ]),
        ),
      ),
    );
  }
}
