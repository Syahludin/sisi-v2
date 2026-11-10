import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/simpan_latar.dart';
import '../../widgets/sisi_widgets.dart';
import 'switching_repository.dart';

/// Tab Jaringan di Master Jaringan: penyulang + section (db_Jaringan). Tambah penyulang = tambah section pertamanya; aktif /
/// nonaktif penyulang = semua section-nya sekaligus; section bisa diubah dan diaktifkan / dinonaktifkan satu per satu.
/// Semua simpan berjalan di latar belakang (simpanLatar), data tidak pernah dihapus.
class JaringanScreen extends StatefulWidget {
  const JaringanScreen({super.key, required this.sesi, required this.repo});
  final Sesi sesi;
  final SwitchingRepository repo;

  @override
  State<JaringanScreen> createState() => _JaringanScreenState();
}

String _t(Object? v) => v == null ? '' : '$v'.trim();

class _JaringanScreenState extends State<JaringanScreen> {
  List<Map<String, dynamic>> _section = const [];
  bool _muat = true;
  String? _galat;

  bool get _bolehUbah => SwitchingRepository.bolehUbah(widget.sesi);

  @override
  void initState() {
    super.initState();
    unawaited(_segarkan());
  }

  Future<void> _segarkan() async {
    setState(() {
      _muat = true;
      _galat = null;
    });
    try {
      final d = await widget.repo.jaringan(widget.sesi);
      if (mounted) setState(() => _section = d);
    } catch (e) {
      if (mounted) setState(() => _galat = pesanGalat(e));
    }
    if (mounted) setState(() => _muat = false);
  }

  List<String> get _penyulang => ({for (final s in _section) _t(s['penyulang'])}.toList()..sort());

  Future<void> _form([Map<String, dynamic>? s, String penyulang = '']) async {
    final isian = await Navigator.push<Map<String, dynamic>>(
        context, MaterialPageRoute(builder: (_) => _SectionForm(awal: s, penyulangAwal: penyulang, penyulang: _penyulang, section: _section)));
    if (isian == null || !mounted) return;
    simpanLatar(context,
        kerja: () async {
          await widget.repo.simpanSection(widget.sesi, isian);
          return null;
        },
        sesudah: () => unawaited(_segarkan()));
  }

  void _aktifPenyulang(String p, bool aktif) => simpanLatar(context,
      kerja: () async {
        await widget.repo.setAktifPenyulang(widget.sesi, p, aktif);
        return null;
      },
      sesudah: () => unawaited(_segarkan()));

  @override
  Widget build(BuildContext context) {
    final per = <String, List<Map<String, dynamic>>>{};
    for (final s in _section) {
      (per[_t(s['penyulang'])] ??= []).add(s);
    }
    final nama = per.keys.toList()..sort();
    return Scaffold(
      floatingActionButton: _bolehUbah && _section.isNotEmpty
          ? FloatingActionButton.extended(onPressed: () => _form(), icon: const Icon(Icons.add_rounded), label: const Text('Tambah Penyulang / Section'))
          : null,
      body: _muat && _section.isEmpty
          ? const SisiLoading(pesan: 'Memuat jaringan')
          : RefreshIndicator(
              onRefresh: _segarkan,
              child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 96), children: [
                if (_galat != null)
                  Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Text(_galat!, style: const TextStyle(color: AppColors.red700, fontWeight: FontWeight.w700))),
                if (nama.isEmpty)
                  const SisiKosong(judul: 'Belum Ada Jaringan', pesan: 'Isi db_Jaringan atau tambah penyulang baru.', ikon: Icons.account_tree_outlined),
                for (final p in nama)
                  Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _KartuPenyulang(
                          nama: p,
                          section: per[p]!,
                          bolehUbah: _bolehUbah,
                          onAktif: (a) => _aktifPenyulang(p, a),
                          onTambah: () => _form(null, p),
                          onUbah: _form)),
              ]),
            ),
    );
  }
}

class _KartuPenyulang extends StatelessWidget {
  const _KartuPenyulang(
      {required this.nama, required this.section, required this.bolehUbah, required this.onAktif, required this.onTambah, required this.onUbah});
  final String nama;
  final List<Map<String, dynamic>> section;
  final bool bolehUbah;
  final void Function(bool) onAktif;
  final VoidCallback onTambah;
  final void Function(Map<String, dynamic>) onUbah;

  @override
  Widget build(BuildContext context) {
    final aktif = section.any((s) => s['aktif'] == true);
    final urut = [...section]..sort((a, b) => (num.tryParse(_t(a['urutan'])) ?? 0).compareTo(num.tryParse(_t(b['urutan'])) ?? 0));
    return Container(
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.neutral150)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 8, 4),
          child: Row(children: [
            Expanded(child: Text(nama, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: aktif ? AppColors.brand950 : AppColors.neutral400))),
            if (bolehUbah) ...[
              Text(aktif ? 'Aktif' : 'Nonaktif', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.neutral500)),
              Switch(value: aktif, onChanged: onAktif),
            ],
          ]),
        ),
        for (final s in urut)
          ListTile(
            dense: true,
            contentPadding: const EdgeInsets.symmetric(horizontal: 14),
            title: Text(_t(s['section']), style: TextStyle(fontWeight: FontWeight.w700, color: s['aktif'] == true ? AppColors.brand900 : AppColors.neutral400)),
            subtitle: Text(
                'Urutan ${_t(s['urutan'])} · ${s['jumlahSegmen'] ?? 0} Segmen · ${s['jumlahSwitching'] ?? 0} Switching${s['aktif'] == true ? '' : ' · Nonaktif'}'),
            trailing: bolehUbah ? const Icon(Icons.edit_outlined, size: 18, color: AppColors.neutral500) : null,
            onTap: bolehUbah ? () => onUbah(s) : null,
          ),
        if (bolehUbah)
          Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(onPressed: onTambah, icon: const Icon(Icons.add_rounded, size: 18), label: const Text('Tambah Section'))),
      ]),
    );
  }
}

/// Form section (baru / ubah). Penyulang baru: pilih "Penyulang Baru" lalu ketik namanya.
class _SectionForm extends StatefulWidget {
  const _SectionForm({required this.awal, required this.penyulangAwal, required this.penyulang, required this.section});
  final Map<String, dynamic>? awal;
  final String penyulangAwal;
  final List<String> penyulang;
  final List<Map<String, dynamic>> section;

  @override
  State<_SectionForm> createState() => _SectionFormState();
}

const _baru = '__baru__';

class _SectionFormState extends State<_SectionForm> {
  late String _pny =
      widget.awal != null ? _t(widget.awal!['penyulang']) : (widget.penyulangAwal.isNotEmpty ? widget.penyulangAwal : (widget.penyulang.isEmpty ? _baru : ''));
  late String _nama = _t(widget.awal?['section']);
  late String _induk = _t(widget.awal?['parentSectionId']);
  late String _urutan = _t(widget.awal?['urutan']);
  late bool _aktif = widget.awal == null || widget.awal!['aktif'] == true;
  String _penyulangBaru = '';
  String? _galat;

  void _simpan() {
    final pny = _pny == _baru ? _penyulangBaru.trim() : _pny;
    if (pny.isEmpty) return setState(() => _galat = 'Pilih atau isi nama penyulang.');
    if (_nama.trim().isEmpty) return setState(() => _galat = 'Nama section wajib diisi.');
    if (_urutan.trim().isNotEmpty && int.tryParse(_urutan.trim()) == null) return setState(() => _galat = 'Urutan harus angka bulat.');
    Navigator.pop(context, {
      'penyulang': pny,
      'section': _nama.trim(),
      if (_induk.isNotEmpty) 'parentSectionId': _induk,
      if (int.tryParse(_urutan.trim()) != null) 'urutan': int.parse(_urutan.trim()),
      if (widget.awal != null) ...{'sectionId': widget.awal!['sectionId'], 'revision': widget.awal!['revision'], 'aktif': _aktif},
    });
  }

  @override
  Widget build(BuildContext context) {
    final induk = [
      for (final s in widget.section)
        if (_t(s['penyulang']) == _pny && s['sectionId'] != widget.awal?['sectionId']) s
    ];
    Widget jarak(Widget w) => Padding(padding: const EdgeInsets.only(bottom: 14), child: w);
    return Scaffold(
      appBar: AppBar(title: Text(widget.awal == null ? 'Tambah Section' : 'Ubah Section')),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), backgroundColor: AppColors.brand700),
              onPressed: _simpan,
              child: const Text('Simpan')),
        ),
      ),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 14, 16, 24), children: [
        if (_galat != null) jarak(Text(_galat!, style: const TextStyle(color: AppColors.red700, fontWeight: FontWeight.w700))),
        jarak(DropdownButtonFormField<String>(
          initialValue: _pny.isEmpty || _pny == _baru || widget.penyulang.contains(_pny) ? _pny : '',
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Penyulang *', border: OutlineInputBorder()),
          items: [
            const DropdownMenuItem(value: '', child: Text('Pilih penyulang')),
            for (final p in widget.penyulang) DropdownMenuItem(value: p, child: Text(p)),
            if (widget.awal == null) const DropdownMenuItem(value: _baru, child: Text('+ Penyulang Baru')),
          ],
          onChanged: widget.awal != null
              ? null
              : (v) => setState(() {
                    _pny = v ?? '';
                    _induk = '';
                  }),
        )),
        if (_pny == _baru)
          jarak(TextFormField(
              decoration: const InputDecoration(labelText: 'Nama Penyulang Baru *', border: OutlineInputBorder()), onChanged: (v) => _penyulangBaru = v)),
        jarak(TextFormField(
            initialValue: _nama,
            decoration: const InputDecoration(labelText: 'Nama Section *', hintText: 'mis. LBS Air Bara', border: OutlineInputBorder()),
            onChanged: (v) => _nama = v)),
        jarak(DropdownButtonFormField<String>(
          key: ValueKey('induk|$_pny|$_induk'),
          initialValue: induk.any((s) => s['sectionId'] == _induk) ? _induk : '',
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Section Induk', border: OutlineInputBorder()),
          items: [
            const DropdownMenuItem(value: '', child: Text('Tidak ada')),
            for (final s in induk) DropdownMenuItem(value: '${s['sectionId']}', child: Text(_t(s['section']), overflow: TextOverflow.ellipsis))
          ],
          onChanged: (v) => setState(() => _induk = v ?? ''),
        )),
        jarak(TextFormField(
            initialValue: _urutan,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Urutan Dari GI', hintText: 'Kosong = otomatis', border: OutlineInputBorder()),
            onChanged: (v) => _urutan = v)),
        if (widget.awal != null)
          SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _aktif,
              title: const Text('Aktif', style: TextStyle(fontWeight: FontWeight.w700)),
              subtitle: const Text('Matikan untuk menonaktifkan (data tidak dihapus).'),
              onChanged: (v) => setState(() => _aktif = v)),
      ]),
    );
  }
}
