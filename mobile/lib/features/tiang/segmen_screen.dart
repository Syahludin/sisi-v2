import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/sisi_widgets.dart';
import '../switching/switching_model.dart' show JaringanSwitching, labelSwitching;
import 'tiang_model.dart';
import '../../widgets/simpan_latar.dart';
import '../switching/switching_repository.dart';
import 'tiang_repository.dart';

/// Master Segmen: daftar segmen per penyulang (awal -> akhir, jumlah tiang terverifikasi) + form satu per satu (keputusan Master
/// Guswan: dibuat Admin satu per satu, tanpa impor massal). Butuh sinyal (langsung ke server).
class SegmenScreen extends StatefulWidget {
  const SegmenScreen({super.key, required this.sesi, required this.repo, this.embedded = false});
  final Sesi sesi;
  final TiangRepository repo;
  final bool embedded; // tab di Master Jaringan: tanpa bilah judul sendiri

  @override
  State<SegmenScreen> createState() => _SegmenScreenState();
}

class _SegmenScreenState extends State<SegmenScreen> {
  List<Segmen> _segmen = const [];
  List<JaringanSwitching> _jaringan = const [];
  List<Map<String, dynamic>> _switching = const [];
  bool _muat = true;
  String? _galat;
  String _penyulang = '';

  List<String> get _daftarPenyulang => ({for (final x in _jaringan) x.penyulang}.toList()..sort());

  @override
  void initState() {
    super.initState();
    _segarkan();
  }

  Future<void> _segarkan() async {
    setState(() {
      _muat = true;
      _galat = null;
    });
    try {
      final j = await widget.repo.segmen(widget.sesi);
      if (!mounted) return;
      setState(() {
        _segmen = [for (final x in (j['segmen'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) Segmen(Map<String, dynamic>.from(x))];
        _jaringan = [
          for (final x in (j['jaringan'] as List? ?? const []).whereType<Map<dynamic, dynamic>>())
            JaringanSwitching('${x['sectionId']}', '${x['penyulang']}', '${x['section']}')
        ];
        _switching = [for (final x in (j['switching'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) Map<String, dynamic>.from(x)];
      });
    } catch (e) {
      if (mounted) setState(() => _galat = e is ApiException ? KodeError.pesan(e.kode) : 'Tidak bisa terhubung ke server.');
    }
    if (mounted) setState(() => _muat = false);
  }

  Future<void> _buka([Segmen? s]) async {
    final isian = await Navigator.push<IsianSegmen>(
        context,
        MaterialPageRoute(
            builder: (_) => SegmenFormScreen(
                sesi: widget.sesi,
                repo: widget.repo,
                isian: IsianSegmen(s),
                jaringan: _jaringan,
                switching: _switching,
                segmen: _segmen,
                penyulangAwal: _penyulang)));
    if (isian == null || !mounted) return;
    simpanLatar(context,
        kerja: () async {
          await widget.repo.simpanSegmen(widget.sesi, isian);
          return null;
        },
        sesudah: () => unawaited(_segarkan()));
  }

  String _section(String id) => _jaringan.where((x) => x.sectionId == id).map((x) => x.section).firstOrNull ?? id;

  @override
  Widget build(BuildContext context) {
    final tampil = [
      for (final s in _segmen)
        if (_penyulang.isEmpty || s.teks('penyulang') == _penyulang) s
    ]..sort((a, b) => a.teks('penyulang').compareTo(b.teks('penyulang')) != 0
        ? a.teks('penyulang').compareTo(b.teks('penyulang'))
        : (num.tryParse(a.teks('urutan')) ?? 0).compareTo(num.tryParse(b.teks('urutan')) ?? 0));
    return Scaffold(
      appBar: widget.embedded
          ? null
          : AppBar(title: const Text('Master Segmen'), actions: [
              IconButton(
                  tooltip: 'Muat Ulang',
                  onPressed: _muat ? null : _segarkan,
                  icon: _muat ? const SizedBox(width: 22, height: 22, child: SisiLoader(ukuran: 22)) : const Icon(Icons.refresh_rounded)),
            ]),
      floatingActionButton: SwitchingRepository.bolehUbah(widget.sesi) && _jaringan.isNotEmpty
          ? FloatingActionButton.extended(onPressed: () => _buka(), icon: const Icon(Icons.add_rounded), label: const Text('Tambah Segmen'))
          : null,
      body: _muat && _segmen.isEmpty
          ? const SisiLoading(pesan: 'Memuat segmen')
          : ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 96), children: [
              if (_galat != null) Text(_galat!, style: const TextStyle(color: AppColors.red700, fontWeight: FontWeight.w700)),
              DropdownButtonFormField<String>(
                initialValue: _penyulang,
                decoration: const InputDecoration(labelText: 'Penyulang', border: OutlineInputBorder(), isDense: true),
                items: [
                  const DropdownMenuItem(value: '', child: Text('Semua Penyulang')),
                  for (final p in _daftarPenyulang) DropdownMenuItem(value: p, child: Text(p))
                ],
                onChanged: (v) => setState(() => _penyulang = v ?? ''),
              ),
              const SizedBox(height: 12),
              if (tampil.isEmpty)
                const SisiKosong(judul: 'Belum Ada Segmen', pesan: 'Tambah segmen satu per satu dari tombol di bawah.', ikon: Icons.route_outlined),
              for (final s in tampil)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Material(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    child: ListTile(
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: AppColors.neutral150)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      title: Text(s.teks('nama'), style: TextStyle(fontWeight: FontWeight.w800, color: s.aktif ? AppColors.brand950 : AppColors.neutral400)),
                      subtitle: Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                            '${s.teks('penyulang')} · ${_section(s.teks('sectionId'))}\n${s.teks('awalNama')} → ${s.teks('akhirNama')} · ${s.kabelTanah ? 'Kabel tanah${s.dataKabelKurang ? ' (data kabel belum lengkap)' : ''}' : '${s.teks('jumlahTerverifikasi')}/${s.teks('jumlahTiang')} tiang'}${s.aktif ? '' : ' · NONAKTIF'}',
                            style: const TextStyle(height: 1.4)),
                      ),
                      trailing: Text(s.id, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
                      onTap: SwitchingRepository.bolehUbah(widget.sesi) ? () => _buka(s) : null,
                    ),
                  ),
                ),
            ]),
    );
  }
}

class SegmenFormScreen extends StatefulWidget {
  const SegmenFormScreen({
    super.key,
    required this.sesi,
    required this.repo,
    required this.isian,
    required this.jaringan,
    required this.switching,
    required this.segmen,
    this.penyulangAwal = '',
  });
  final Sesi sesi;
  final TiangRepository repo;
  final IsianSegmen isian;
  final List<JaringanSwitching> jaringan;
  final List<Map<String, dynamic>> switching;
  final List<Segmen> segmen;
  final String penyulangAwal;

  @override
  State<SegmenFormScreen> createState() => _SegmenFormScreenState();
}

class _SegmenFormScreenState extends State<SegmenFormScreen> {
  late final IsianSegmen _i = widget.isian;
  Map<String, String> _galat = {};

  @override
  void initState() {
    super.initState();
    if (_i.baru && _i.t['penyulang']!.isEmpty) _i.t['penyulang'] = widget.penyulangAwal;
  }

  void _simpan() {
    final g = _i.cek({for (final x in widget.jaringan) x.penyulang}.toList());
    setState(() => _galat = g);
    if (g.isNotEmpty) {
      tampilPesan(context, g.values.first);
      return;
    }
    Navigator.pop(context, _i);
  }

  @override
  Widget build(BuildContext context) {
    final pny = _i.t['penyulang']!;
    final daftarPny = {for (final x in widget.jaringan) x.penyulang}.toList()..sort();
    final swc = [
      for (final w in widget.switching)
        if (pny.isEmpty || w['penyulang'] == pny) ('${w['switchingId']}', labelSwitching('${w['jenis']}', '${w['nama']}'))
    ];
    final induk = [
      for (final s in widget.segmen)
        if (s.aktif && s.teks('penyulang') == pny && s.id != widget.isian.asal?.id) (s.id, s.teks('nama'))
    ];
    Widget teks(String k, String label, {String? hint}) => _jarakSegmen(TextFormField(
          initialValue: _i.t[k],
          decoration: InputDecoration(labelText: label, hintText: hint, errorText: _galat[k], border: const OutlineInputBorder()),
          onChanged: (v) => _i.t[k] = v,
        ));
    Widget pilih(String label, String k, List<(String, String)> isi, {String kosong = 'Pilih', void Function(String)? sesudah}) =>
        _jarakSegmen(DropdownButtonFormField<String>(
          key: ValueKey('$k|${isi.length}|${_i.t[k]}'),
          initialValue: isi.any((x) => x.$1 == _i.t[k]) ? _i.t[k] : '',
          isExpanded: true,
          decoration: InputDecoration(labelText: label, errorText: _galat[k], border: const OutlineInputBorder()),
          items: [
            DropdownMenuItem(value: '', child: Text(kosong, style: const TextStyle(color: AppColors.neutral500))),
            for (final (a, b) in isi) DropdownMenuItem(value: a, child: Text(b, overflow: TextOverflow.ellipsis))
          ],
          onChanged: (v) => setState(() {
            _i.t[k] = v ?? '';
            sesudah?.call(v ?? '');
          }),
        ));
    // pilih switching batas = nama titik diisi dari nama switching
    void namaDari(String kNama, String id) {
      final w = widget.switching.where((x) => x['switchingId'] == id).firstOrNull;
      if (w != null) _i.t[kNama] = labelSwitching('${w['jenis']}', '${w['nama']}');
    }

    return PopScope(
      child: Scaffold(
        appBar: AppBar(title: Text(_i.baru ? 'Tambah Segmen' : 'Ubah ${_i.asal!.id}')),
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), backgroundColor: AppColors.brand700),
              onPressed: _simpan,
              child: const Text('Simpan Segmen'),
            ),
          ),
        ),
        body: ColoredBox(
          color: Colors.transparent,
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 14, 16, 24), children: [
            teks('nama', 'Nama Segmen *', hint: 'mis. PMT Tungkal - SKTM Tungkal'),
            pilih('Jenis Segmen *', 'jenisSegmen', jenisSegmen, kosong: 'Udara (bawaan)'),
            pilih('Penyulang *', 'penyulang', [for (final p in daftarPny) (p, p)], sesudah: (_) {
              _i.t['sectionId'] = '';
              _i.t['indukSegmenId'] = '';
            }),
            pilih(
                'Section *',
                'sectionId',
                [
                  for (final x in widget.jaringan)
                    if (x.penyulang == pny) (x.sectionId, x.section)
                ],
                kosong: pny.isEmpty ? 'Pilih penyulang dulu' : 'Pilih section'),
            pilih('Segmen Induk (Percabangan)', 'indukSegmenId', induk, kosong: 'Tidak ada'),
            const _JudulSegmen('Titik Awal'),
            pilih('Jenis Titik Awal *', 'awalJenis', awalSegmen),
            if (_i.t['awalJenis'] == 'SWITCHING')
              pilih('Switching Awal', 'awalSwitchingId', swc, kosong: 'Belum ada di master switching', sesudah: (v) => namaDari('awalNama', v)),
            teks('awalNama', 'Nama Titik Awal *', hint: 'mis. LBS Air Bara / TB0011 / GI Toboali'),
            const _JudulSegmen('Titik Akhir'),
            pilih('Jenis Titik Akhir *', 'akhirJenis', akhirSegmen),
            if (_i.t['akhirJenis'] == 'SWITCHING')
              pilih('Switching Akhir', 'akhirSwitchingId', swc, kosong: 'Belum ada di master switching', sesudah: (v) => namaDari('akhirNama', v)),
            teks('akhirNama', 'Nama Titik Akhir *'),
            if (_i.kabelTanah) ...[
              const _JudulSegmen('Data Kabel Tanah'),
              pilih('Jenis Kabel', 'jenisKabel', jenisKabelTanah, kosong: 'Belum diketahui'),
              teks('ukuranMm2', 'Penampang (mm²)', hint: 'mis. 240'),
              teks('panjangKabelM', 'Panjang Rute Kabel (m)', hint: 'Ukur rute, bukan jarak lurus'),
              teks('penghantarId', 'Acuan Penghantar'),
            ],
            const _JudulSegmen('Lainnya'),
            _jarakSegmen(TextFormField(
              initialValue: _i.urutan,
              keyboardType: TextInputType.number,
              decoration:
                  InputDecoration(labelText: 'Urutan Dari GI', hintText: 'Kosong = otomatis', errorText: _galat['urutan'], border: const OutlineInputBorder()),
              onChanged: (v) => _i.urutan = v,
            )),
            teks('segmenItb', 'Rujukan Segmen ITB'),
            teks('catatan', 'Catatan'),
            if (!_i.baru)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _i.aktif,
                title: const Text('Aktif', style: TextStyle(fontWeight: FontWeight.w700)),
                subtitle: const Text('Matikan untuk menonaktifkan (data tidak dihapus).'),
                onChanged: (v) => setState(() => _i.aktif = v),
              ),
          ]),
        ),
      ),
    );
  }
}

Widget _jarakSegmen(Widget w) => Padding(padding: const EdgeInsets.only(bottom: 14), child: w);

class _JudulSegmen extends StatelessWidget {
  const _JudulSegmen(this.teks);
  final String teks;

  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.fromLTRB(0, 4, 0, 10),
      child: Text(teks, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900, color: AppColors.brand950)));
}
