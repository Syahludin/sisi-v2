import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/deps.dart';
import '../../theme/app_colors.dart';
import '../../widgets/kolom_pilih.dart';
import 'p0_model.dart';

/// Pilihan lokasi P0 (penyulang + section) yang sedang dipilih. sectionId null = tanpa section.
typedef NilaiLokasiP0 = ({String? penyulang, String? sectionId, String section});

/// v0.66.4: penyulang + section P0, dipakai form Tambah P0 dan Edit lokasi P0.
/// Pengecekan Switching: section hanya yang berawalan LBS / ACR, wajib, dan Nama Switching langsung tampil
/// (disorot) dari section yang dipilih. Ganti pekerjaan = section yang tidak cocok lagi dikosongkan.
class PilihLokasiP0 extends StatefulWidget {
  const PilihLokasiP0({
    super.key,
    required this.deps,
    required this.namaPekerjaan,
    required this.onChanged,
    this.awalPenyulang,
    this.awalSectionId,
  });

  final Deps deps;
  final String namaPekerjaan;
  final ValueChanged<NilaiLokasiP0> onChanged;
  final String? awalPenyulang;
  final String? awalSectionId;

  @override
  State<PilihLokasiP0> createState() => _PilihLokasiP0State();
}

class _PilihLokasiP0State extends State<PilihLokasiP0> {
  static const String _tanpa = '__TANPA__';
  List<String> _penyulang = const [];
  List<({String id, String nama})> _semua = const [];
  bool _penyulangDipilih = false;
  String? _pny;
  String? _sectionId;

  bool get _switching => p0Switching(widget.namaPekerjaan);
  bool get _gardu => p0Gardu(widget.namaPekerjaan); // v0.74.0: penyulang wajib
  List<({String id, String nama})> get _section => sectionUntukPekerjaan(_semua, widget.namaPekerjaan);

  @override
  void initState() {
    super.initState();
    _pny = widget.awalPenyulang == null || widget.awalPenyulang!.isEmpty ? null : widget.awalPenyulang;
    _sectionId = widget.awalSectionId == null || widget.awalSectionId!.isEmpty ? null : widget.awalSectionId;
    _penyulangDipilih = widget.awalPenyulang != null;
    unawaited(_muat());
  }

  @override
  void didUpdateWidget(PilihLokasiP0 lama) {
    super.didUpdateWidget(lama);
    if (lama.namaPekerjaan != widget.namaPekerjaan && _sectionId != null && !_section.any((e) => e.id == _sectionId)) {
      _sectionId = null;
      WidgetsBinding.instance.addPostFrameCallback((_) => _kabari());
    }
  }

  Future<void> _muat() async {
    final pny = await widget.deps.master.penyulang();
    final sec = _pny == null ? const <({String id, String nama})>[] : await widget.deps.master.section(_pny!);
    if (!mounted) return;
    setState(() {
      _penyulang = pny;
      _semua = sec;
      if (_sectionId != null && !_section.any((e) => e.id == _sectionId)) _sectionId = null;
    });
    _kabari();
  }

  void _kabari() {
    if (!mounted) return;
    final sec = _section.where((e) => e.id == _sectionId).toList();
    widget.onChanged((penyulang: _pny, sectionId: sec.isEmpty ? null : sec.first.id, section: sec.isEmpty ? '' : sec.first.nama));
  }

  Future<void> _pilihPenyulang(String? v) async {
    setState(() {
      _pny = v;
      _sectionId = null;
      _semua = const [];
    });
    _kabari();
    if (v == null) return;
    final s = await widget.deps.master.section(v);
    if (mounted && _pny == v) setState(() => _semua = s);
  }

  @override
  Widget build(BuildContext context) {
    final sw = _switching;
    final wajibPny = sw || _gardu;
    final pilihan = _section;
    final terpilih = pilihan.where((e) => e.id == _sectionId).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      KolomPilih(
        key: ValueKey('penyulang-${_penyulang.length}-$_pny'),
        label: wajibPny ? 'Penyulang *' : 'Penyulang',
        judulSheet: 'Pilih penyulang',
        keteranganSheet: 'Ketik untuk mencari.',
        pilihan: [
          if (!wajibPny) const PilihanItem(_tanpa, 'Tidak ada / bukan penyulang'),
          for (final n in _penyulang) PilihanItem(n, n),
        ],
        nilaiAwal: _pny ?? (_penyulangDipilih && !wajibPny ? _tanpa : null),
        selaluCari: true,
        // v1.0.31: wajib (Pengecekan Switching / Gardu) belum dipilih = kolom merah saat Simpan
        validator: wajibPny ? (v) => (v ?? '').isEmpty || v == _tanpa ? 'Penyulang wajib dipilih' : null : null,
        onChanged: (v) {
          _penyulangDipilih = true;
          unawaited(_pilihPenyulang(v == _tanpa ? null : v));
        },
      ),
      if (_pny != null) ...[
        const SizedBox(height: 12),
        if (sw && _semua.isNotEmpty && pilihan.isEmpty)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(12)),
            child: Text('Penyulang $_pny tidak punya section LBS / ACR di master.',
                style: const TextStyle(fontSize: 12, color: AppColors.neutral900)),
          )
        else
          KolomPilih(
            key: ValueKey('section-$_pny-${pilihan.length}-$_sectionId-$sw'),
            label: sw ? 'Section (LBS / ACR) *' : 'Section',
            judulSheet: 'Pilih section ($_pny)',
            keteranganSheet: sw ? 'Hanya section berawalan LBS / ACR.' : null,
            pilihan: [
              if (!sw) const PilihanItem(_tanpa, 'Tidak dipilih'),
              for (final s in pilihan) PilihanItem(s.id, s.nama),
            ],
            nilaiAwal: _sectionId,
            selaluCari: true,
            validator: sw ? (v) => (v ?? '').isEmpty || v == _tanpa ? 'Section LBS / ACR wajib dipilih' : null : null,
            onChanged: (v) {
              setState(() => _sectionId = v == _tanpa ? null : v);
              _kabari();
            },
          ),
        if (sw && terpilih.isNotEmpty) ...[
          const SizedBox(height: 10),
          SorotSwitching(nama: namaSwitching(terpilih.first.nama), section: terpilih.first.nama, penyulang: _pny),
        ],
      ],
    ]);
  }
}

/// v0.66.4: sorotan Nama Switching (form P0, edit lokasi, dan card Pengecekan Switching di detail P0).
class SorotSwitching extends StatelessWidget {
  const SorotSwitching({super.key, required this.nama, required this.section, this.penyulang, this.kode, this.trailing});
  final String nama;
  final String section;
  final String? penyulang;
  final String? kode;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final jenis = nama.toUpperCase().startsWith('ACR') ? 'ACR' : 'LBS';
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [AppColors.brand800, AppColors.brand600], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: AppColors.brand700.withValues(alpha: 0.25), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Row(children: [
        Container(
          width: 46,
          height: 46,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(12)),
          child: Text(jenis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: AppColors.plnYellow, letterSpacing: 0.5)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('NAMA SWITCHING',
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1, color: Color(0xCCFFFFFF))),
            const SizedBox(height: 2),
            Text(nama, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.white)),
            const SizedBox(height: 2),
            Text([if (penyulang != null && penyulang!.isNotEmpty) 'Penyulang $penyulang', section].join(' · '),
                style: const TextStyle(fontSize: 11.5, color: Color(0xDDFFFFFF))),
            if (kode != null && kode!.isNotEmpty)
              Text(kode!, style: const TextStyle(fontSize: 10.5, color: Color(0xB3FFFFFF))),
          ]),
        ),
        if (trailing != null) trailing!,
      ]),
    );
  }
}
