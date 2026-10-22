import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/kolom_pilih.dart';
import '../../widgets/sisi_widgets.dart';
import '../../widgets/wa_panel.dart';
import 'laporan_up3_repository.dart';
import '../../widgets/sisi_loader.dart';

/// Operasi > Laporan UP3 atau Laporan UIW (v0.57: menu dipecah, satu layar per laporan; keputusan kvlar 5 Okt 2026).
/// Status tim + input harian laporan itu saja (UP3: C4A per penyulang; UIW: Cuaca + C4A per section) + teks WA dari server.
/// Input hanya ADMIN / SUPER untuk hari ini (bisaUbah dari server); ADMIN_ES dan tanggal lewat = hanya lihat.
class LaporanUp3Screen extends StatefulWidget {
  const LaporanUp3Screen({super.key, required this.deps, required this.sesi, required this.bagian})
      : assert(bagian == 'UP3' || bagian == 'UIW');
  final Deps deps;
  final Sesi sesi;

  /// 'UP3' | 'UIW'
  final String bagian;

  @override
  State<LaporanUp3Screen> createState() => _LaporanUp3ScreenState();
}

class _LaporanUp3ScreenState extends State<LaporanUp3Screen> {
  late final LaporanUp3Repository _repo = LaporanUp3Repository(widget.deps.api);
  final _cuaca = TextEditingController();
  late String _tanggal = Wib.tanggal(DateTime.now());
  Map<String, dynamic>? _data;
  List<C4aItem> _c4a = const []; // C4A UIW (Care for Asset)
  List<C4aUp3Item> _up3 = const [];
  bool _memuat = true;
  bool _menyimpan = false;
  bool _kotor = false;
  // revision laporan ini (lap_Harian_UP3 / lap_Harian_UIW); 0 = belum ada baris.
  int _rev = 0;
  String? _pesan;

  static const _presetCuaca = ['Cerah', 'Cerah Berawan', 'Berawan', 'Mendung', 'Hujan Ringan', 'Hujan Lebat'];
  static const _maksC4a = 20;

  bool get _isUp3 => widget.bagian == 'UP3';
  bool get _bisaUbah => _data?['bisaUbah'] == true;

  @override
  void initState() {
    super.initState();
    unawaited(_muat());
  }

  @override
  void dispose() {
    _cuaca.dispose();
    super.dispose();
  }

  String _pesanGagal(Object e) {
    if (e is ApiException) return e.kode.startsWith('HTTP_') ? 'Tidak ada sinyal. Coba lagi.' : KodeError.pesan(e.kode);
    return 'Tidak ada sinyal. Coba lagi.';
  }

  void _terapkan(Map<String, dynamic> d) {
    _data = d;
    final daftar = (d['c4a'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<String, dynamic>>();
    if (_isUp3) {
      _up3 = [for (final c in daftar) C4aUp3Item.dariJson(c)];
    } else {
      _c4a = [for (final c in daftar) C4aItem.dariJson(c)];
      _cuaca.text = (d['cuaca'] as String?) ?? '';
    }
    _rev = (d['revision'] as num?)?.toInt() ?? 0;
    _kotor = false;
  }

  Future<void> _muat({bool beriTahu = false}) async {
    setState(() => _memuat = true);
    String? pesan;
    Map<String, dynamic>? data;
    try {
      data = await _repo.muat(widget.sesi, widget.bagian, _tanggal);
    } catch (e) {
      pesan = _pesanGagal(e);
    }
    if (!mounted) return;
    setState(() {
      if (data != null) _terapkan(data);
      _pesan = pesan;
      _memuat = false;
    });
    if (beriTahu && mounted) tampilPesan(context, pesan ?? 'Laporan diperbarui.');
  }

  Future<bool> _bolehBuang() async {
    if (!_kotor) return true;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Buang perubahan?'),
        content: Text(_isUp3 ? 'C4A yang belum disimpan akan hilang.' : 'Cuaca / C4A yang belum disimpan akan hilang.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Buang')),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _segarkan() async {
    if (_memuat || !await _bolehBuang()) return;
    await _muat(beriTahu: true);
  }

  Future<void> _pilihTanggal() async {
    final hariIni = DateTime.parse(Wib.tanggal(DateTime.now()));
    final t = await showDatePicker(
      context: context,
      initialDate: DateTime.parse(_tanggal),
      firstDate: DateTime(2026, 1, 1),
      lastDate: hariIni,
      helpText: 'Laporan tanggal',
    );
    if (t == null || !mounted || !await _bolehBuang()) return;
    setState(() {
      _tanggal = DateFormat('yyyy-MM-dd').format(t);
      _data = null;
      _kotor = false;
    });
    await _muat();
  }

  Future<void> _simpan() async {
    if (_data == null || !_bisaUbah || _menyimpan) return;
    FocusScope.of(context).unfocus();
    setState(() => _menyimpan = true);
    try {
      // v0.62.9: payload dibekukan sekali; gagal jaringan dikirim ulang persis sama (server aman diulang).
      final data = _isUp3
          ? LaporanUp3Repository.dataUp3(tanggal: _tanggal, revision: _rev, c4a: _up3)
          : LaporanUp3Repository.dataUiw(tanggal: _tanggal, revision: _rev, cuaca: _cuaca.text.trim(), c4a: _c4a);
      final hasil = await _repo.simpanPulih(widget.sesi, widget.bagian, data);
      if (!mounted) return;
      setState(() => _terapkan(hasil));
      tampilPesan(context, 'Laporan ${widget.bagian} tersimpan.');
    } catch (e) {
      if (!mounted) return;
      final konflik = e is ApiException && e.kode == 'KONFLIK_REVISION';
      tampilPesan(
          context,
          konflik
              ? 'Laporan ${widget.bagian} sudah diubah admin lain. Refresh dulu, lalu isi lagi.'
              : '${_pesanGagal(e)} Belum tersimpan, isian masih di layar.');
    } finally {
      if (mounted) setState(() => _menyimpan = false);
    }
  }

  Future<void> _editC4a([int? i]) async {
    final awal = i == null ? null : _c4a[i];
    final dipakai = {for (final c in _c4a) if (c.id != awal?.id) c.sectionId};
    final hasil = await showModalBottomSheet<C4aItem>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (c) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(c).viewInsets.bottom),
        child: _FormC4a(deps: widget.deps, awal: awal, dipakai: dipakai),
      ),
    );
    if (hasil == null || !mounted) return;
    setState(() {
      _c4a = i == null ? [..._c4a, hasil] : ([..._c4a]..[i] = hasil);
      _kotor = true;
    });
  }

  Future<void> _editUp3([int? i]) async {
    final awal = i == null ? null : _up3[i];
    final dipakai = {for (final c in _up3) if (c.id != awal?.id) c.penyulang.toLowerCase()};
    final hasil = await showModalBottomSheet<C4aUp3Item>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (c) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(c).viewInsets.bottom),
        child: _FormC4aUp3(deps: widget.deps, awal: awal, dipakai: dipakai),
      ),
    );
    if (hasil == null || !mounted) return;
    setState(() {
      _up3 = i == null ? [..._up3, hasil] : ([..._up3]..[i] = hasil);
      _kotor = true;
    });
  }

  Future<bool> _yakinHapus(String judul) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (x) => AlertDialog(
        title: const Text('Hapus C4A?'),
        content: Text('$judul\nTerhapus dari laporan setelah Simpan.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(x, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(x, true), child: const Text('Hapus')),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _hapusUp3(int i) async {
    if (!await _yakinHapus(_up3[i].penyulang) || !mounted) return;
    setState(() {
      _up3 = [..._up3]..removeAt(i);
      _kotor = true;
    });
  }

  Future<void> _hapusC4a(int i) async {
    final c = _c4a[i];
    if (!await _yakinHapus('${c.penyulang} · ${c.section}') || !mounted) return;
    setState(() {
      _c4a = [..._c4a]..removeAt(i);
      _kotor = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    final tglLabel = DateFormat('EEEE, d MMMM y', 'id_ID').format(DateTime.parse(_tanggal));
    Widget isi;
    if (d == null && _memuat) {
      isi = const SisiLoading(pesan: 'Menyusun laporan...', ukuran: 60);
    } else if (d == null) {
      isi = bisaDitarik(SisiKosong(
        ikon: Icons.cloud_off_rounded,
        judul: 'Laporan belum bisa dimuat',
        pesan: _pesan,
        tombol: 'Coba lagi',
        onTombol: () => unawaited(_muat()),
      ));
    } else {
      isi = ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 12, 16, 40), children: [
        if (_pesan != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(_pesan!, style: const TextStyle(fontSize: 12, color: AppColors.red700)),
          ),
        ..._banner(d),
        if (d['statusTim'] is List) ...[_kartuStatus(d), const SizedBox(height: 14)],
        _kartuInput(),
        const SizedBox(height: 14),
        _kartuWa(d),
      ]);
    }
    return PopScope(
      canPop: !_kotor,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _bolehBuang() && context.mounted) {
          _kotor = false;
          Navigator.pop(context);
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFF6F8FC),
        appBar: sisiAppBar(_isUp3 ? 'Laporan UP3' : 'Laporan UIW', subjudul: tglLabel, actions: [
          IconButton(tooltip: 'Pilih tanggal', onPressed: _memuat ? null : () => unawaited(_pilihTanggal()), icon: const Icon(Icons.calendar_month_rounded)),
          TombolSegarkan(sibuk: _memuat, onPressed: () => unawaited(_segarkan())),
        ]),
        body: RefreshIndicator(onRefresh: _segarkan, child: isi),
      ),
    );
  }

  List<Widget> _banner(Map<String, dynamic> d) {
    String? teks;
    if (d['tertunda'] == true) {
      // v0.62.9: C4A sempat tertulis tapi baris harian belum dikunci (simpan terputus) = belum final.
      teks = _bisaUbah
          ? 'Simpan terakhir belum selesai. Periksa isian lalu tekan Simpan supaya laporan final.'
          : 'Simpan terakhir belum selesai. Laporan ini belum final.';
    } else if (d['sumber'] == 'ARSIP') {
      teks = 'Lebih dari 7 hari: ini salinan terakhir yang disimpan. Hanya lihat.';
    } else if (!_bisaUbah) {
      teks = d['hariIni'] == true ? 'Akun ini hanya bisa melihat laporan.' : 'Tanggal lewat: hanya lihat. Input hanya untuk hari ini.';
    }
    if (teks == null) return const [];
    return [
      Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          const Icon(Icons.visibility_outlined, size: 18, color: AppColors.accent700),
          const SizedBox(width: 8),
          Expanded(child: Text(teks, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.accent700))),
        ]),
      ),
    ];
  }

  Widget _kartuStatus(Map<String, dynamic> d) {
    final status = (d['statusTim'] as List<dynamic>).whereType<Map<String, dynamic>>().toList();
    final row = d['row'] as Map<String, dynamic>?;
    final peny = (row?['penyulang'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<String, dynamic>>().toList();
    final kom = row?['komulatif'] as Map<String, dynamic>?;
    final htk = d['hartek'] as Map<String, dynamic>?;
    final penyH = (htk?['penyulang'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<String, dynamic>>().toList();
    final komH = htk?['komulatif'] as Map<String, dynamic>?;
    final statusHartek = '${htk?['status'] ?? 'V1'}';
    return SectionCard(judul: 'Status tim', ikon: Icons.groups_rounded, children: [
      for (final t in status) _BarisStatus(nama: '${t['nama']}', status: '${t['status']}'),
      _BarisStatus(nama: 'Hartek', status: statusHartek),
      for (final n in const ['Inspeksi Jaringan', 'Inspeksi Gardu']) _BarisStatus(nama: n, status: 'V1'),
      const Divider(height: 22),
      const Text('ROW HARI INI (TARGET / REALISASI)',
          style: TextStyle(fontSize: 10.5, letterSpacing: .6, fontWeight: FontWeight.w800, color: AppColors.neutral500)),
      const SizedBox(height: 6),
      if (peny.isEmpty)
        const Text('Belum ada eksekusi foto lengkap.', style: TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
      for (final p in peny)
        Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Text(
            '${p['penyulang']}   Rabas ${p['rabas']}/${p['targetRabas']}   Tebang ${p['tebang']}/${p['targetTebang']}',
            style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.neutral700),
          ),
        ),
      if (kom != null)
        Text('Komulatif bulan ini: Rabas ${kom['rabas']} Gawang · Tebang ${kom['tebang']} Batang',
            style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
      if (htk != null) ...[
        const Divider(height: 22),
        const Text('HARTEK HARI INI (GARDU / JARINGAN)',
            style: TextStyle(fontSize: 10.5, letterSpacing: .6, fontWeight: FontWeight.w800, color: AppColors.neutral500)),
        const SizedBox(height: 6),
        if (penyH.isEmpty)
          const Text('Belum ada pekerjaan Hartek hari ini.', style: TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
        for (final p in penyH)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(
              '${p['penyulang']}   Gardu ${p['gardu']} Unit   Jaringan ${p['jaringan']} Gawang',
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.neutral700),
            ),
          ),
        if (komH != null)
          Text('Komulatif bulan ini: Gardu ${komH['gardu']} Unit · Jaringan ${komH['jaringan']} Gawang',
              style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
      ],
    ]);
  }

  Widget _judulKecil(String teks, String jumlah) => Row(children: [
        Expanded(
          child: Text(teks, style: const TextStyle(fontSize: 10.5, letterSpacing: .6, fontWeight: FontWeight.w800, color: AppColors.neutral500)),
        ),
        Text(jumlah, style: const TextStyle(fontSize: 11, color: AppColors.neutral400)),
      ]);

  Widget _kartuInput() => SectionCard(
        judul: 'Input harian',
        ikon: Icons.edit_note_rounded,
        children: [
          ...(_isUp3 ? _inputUp3() : _inputUiw()),
          if (_bisaUbah) ...[
            _tombolSimpan(),
            const SizedBox(height: 6),
            const Text('Simpan juga mencatat salinan teks laporan ini di sheet harian.',
                style: TextStyle(fontSize: 11, color: AppColors.neutral400)),
          ],
        ],
      );

  /// C4A UP3: per penyulang, kmS langsung.
  List<Widget> _inputUp3() {
    final ubah = _bisaUbah && !_menyimpan;
    return [
      _judulKecil('C4A LAPORAN UP3', '${_up3.length}/$_maksC4a'),
      const SizedBox(height: 8),
      if (_up3.isEmpty) const Text('Belum ada C4A UP3. Di laporan tampil "- Nihil".', style: TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
      for (var i = 0; i < _up3.length; i++)
        _KartuUp3(
          c: _up3[i],
          onEdit: ubah ? () => unawaited(_editUp3(i)) : null,
          onHapus: ubah ? () => unawaited(_hapusUp3(i)) : null,
        ),
      if (_bisaUbah)
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: ubah && _up3.length < _maksC4a ? () => unawaited(_editUp3()) : null,
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text('Tambah C4A UP3'),
          ),
        ),
    ];
  }

  /// UIW: cuaca + C4A Care for Asset (per section).
  List<Widget> _inputUiw() {
    final ubah = _bisaUbah && !_menyimpan;
    return [
      TextField(
        controller: _cuaca,
        enabled: ubah,
        maxLength: 40,
        decoration: sisiInput('Cuaca', hint: 'mis. Cerah'),
        onChanged: (_) => setState(() => _kotor = true),
      ),
      if (ubah)
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final p in _presetCuaca)
            ChoiceChip(
              label: Text(p, style: const TextStyle(fontSize: 12)),
              selected: _cuaca.text == p,
              onSelected: (_) => setState(() {
                _cuaca.text = p;
                _kotor = true;
              }),
            ),
        ]),
      const SizedBox(height: 14),
      _judulKecil('C4A UIW / CARE FOR ASSET', '${_c4a.length}/$_maksC4a'),
      const SizedBox(height: 8),
      if (_c4a.isEmpty) const Text('Belum ada C4A UIW. Di laporan tampil "-".', style: TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
      for (var i = 0; i < _c4a.length; i++)
        _KartuC4a(
          c: _c4a[i],
          onEdit: ubah ? () => unawaited(_editC4a(i)) : null,
          onHapus: ubah ? () => unawaited(_hapusC4a(i)) : null,
        ),
      if (_bisaUbah)
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: ubah && _c4a.length < _maksC4a ? () => unawaited(_editC4a()) : null,
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text('Tambah C4A UIW'),
          ),
        ),
    ];
  }

  Widget _tombolSimpan() => Padding(
        padding: const EdgeInsets.only(top: 6),
        child: FilledButton.icon(
          onPressed: _menyimpan ? null : () => unawaited(_simpan()),
          icon: _menyimpan
              ? const SisiLoader(ukuran: 18, warna: Colors.white)
              : Icon(_kotor ? Icons.save_rounded : Icons.save_outlined, size: 18),
          label: Text(_menyimpan ? 'Menyimpan...' : (_kotor ? 'Simpan ${widget.bagian} *' : 'Simpan ${widget.bagian}')),
        ),
      );

  Widget _kartuWa(Map<String, dynamic> d) {
    final teks = (d['waText'] as String?) ?? '';
    return SectionCard(judul: 'Teks WA ${widget.bagian}', ikon: Icons.chat_outlined, children: [
      if (d['tertunda'] == true && !_kotor)
        const Padding(
          padding: EdgeInsets.only(bottom: 10),
          child: Text('Belum final: simpan terakhir belum selesai. Jangan kirim teks ini dulu.',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.accent700)),
        ),
      if (_kotor)
        const Padding(
          padding: EdgeInsets.only(bottom: 10),
          child: Text('Ada perubahan belum disimpan. Simpan dulu supaya teks WA ikut berubah.',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.accent700)),
        ),
      if (teks.isEmpty)
        const Text('Belum ada salinan tersimpan untuk tanggal ini.', style: TextStyle(fontSize: 12.5, color: AppColors.neutral500))
      else
        WaPanel(teks: teks),
    ]);
  }
}

class _BarisStatus extends StatelessWidget {
  const _BarisStatus({required this.nama, required this.status});
  final String nama;
  final String status;

  @override
  Widget build(BuildContext context) {
    final badge = switch (status) {
      'SIAP' => const StatusBadge('SIAP WA', warna: AppColors.success700, latar: AppColors.success100),
      'LAPOR' => const StatusBadge('PROSES', warna: AppColors.accent700, latar: AppColors.accent100),
      'BELUM' => const StatusBadge('BELUM LAPOR', warna: AppColors.red700, latar: AppColors.red100),
      _ => const StatusBadge('BELUM DI V2', warna: AppColors.neutral500, latar: AppColors.neutral100),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Expanded(child: Text(nama, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: AppColors.navy900))),
        badge,
      ]),
    );
  }
}

class _KartuC4a extends StatelessWidget {
  const _KartuC4a({required this.c, this.onEdit, this.onHapus});
  final C4aItem c;
  final VoidCallback? onEdit;
  final VoidCallback? onHapus;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
        decoration: BoxDecoration(color: AppColors.neutral50, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.neutral200)),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${c.penyulang} · ${c.section}',
                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
              const SizedBox(height: 3),
              Text(
                '${c.jumlahTiang} tiang · ${C4aItem.kmsTeks(c.jumlahTiang)} kmS · Temuan ${c.temuanPeralatan} alat + ${c.temuanRow} ROW · Eksekusi ${c.eksekusi}',
                style: const TextStyle(fontSize: 12, color: AppColors.neutral700),
              ),
              if (c.keterangan.isNotEmpty)
                Text(c.keterangan, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
            ]),
          ),
          if (onEdit != null) IconButton(tooltip: 'Ubah', onPressed: onEdit, icon: const Icon(Icons.edit_outlined, size: 20)),
          if (onHapus != null)
            IconButton(tooltip: 'Hapus', onPressed: onHapus, icon: const Icon(Icons.delete_outline_rounded, size: 20, color: AppColors.red600)),
        ]),
      );
}

class _KartuUp3 extends StatelessWidget {
  const _KartuUp3({required this.c, this.onEdit, this.onHapus});
  final C4aUp3Item c;
  final VoidCallback? onEdit;
  final VoidCallback? onHapus;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
        decoration: BoxDecoration(color: AppColors.neutral50, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.neutral200)),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Penyulang ${c.penyulang}', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
              const SizedBox(height: 3),
              Text('Realisasi ${C4aUp3Item.angkaKoma(c.realisasiKms)} kmS',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.neutral700)),
              Text('Temuan: ${c.temuan.isEmpty ? '-' : c.temuan}', style: const TextStyle(fontSize: 12, color: AppColors.neutral700)),
              Text('Tindak lanjut: ${c.tindakLanjut.isEmpty ? '-' : c.tindakLanjut}',
                  style: const TextStyle(fontSize: 12, color: AppColors.neutral700)),
              Text('Eksekusi: ${c.eksekusi.isEmpty ? '-' : c.eksekusi}', style: const TextStyle(fontSize: 12, color: AppColors.neutral700)),
              if (c.keterangan.isNotEmpty) Text(c.keterangan, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
            ]),
          ),
          if (onEdit != null) IconButton(tooltip: 'Ubah', onPressed: onEdit, icon: const Icon(Icons.edit_outlined, size: 20)),
          if (onHapus != null)
            IconButton(tooltip: 'Hapus', onPressed: onHapus, icon: const Icon(Icons.delete_outline_rounded, size: 20, color: AppColors.red600)),
        ]),
      );
}

/// Form C4A UP3: penyulang (1 per hari, dikunci setelah dibuat), Realisasi kmS (desimal), lalu teks Temuan,
/// Tindak Lanjut, Eksekusi (tim yang melakukan tindak lanjut), Keterangan (v0.53).
class _FormC4aUp3 extends StatefulWidget {
  const _FormC4aUp3({required this.deps, required this.dipakai, this.awal});
  final Deps deps;
  final Set<String> dipakai; // nama penyulang (huruf kecil) yang sudah ada di daftar
  final C4aUp3Item? awal;

  @override
  State<_FormC4aUp3> createState() => _FormC4aUp3State();
}

class _FormC4aUp3State extends State<_FormC4aUp3> {
  final _form = GlobalKey<FormState>();
  List<String> _penyulang = const [];
  String? _p;
  late final _kms = TextEditingController(text: widget.awal == null ? '' : C4aUp3Item.angkaKoma(widget.awal!.realisasiKms));
  late final _temuan = TextEditingController(text: widget.awal?.temuan ?? '');
  late final _tl = TextEditingController(text: widget.awal?.tindakLanjut ?? '');
  late final _eks = TextEditingController(text: widget.awal?.eksekusi ?? '');
  late final _ket = TextEditingController(text: widget.awal?.keterangan ?? '');

  @override
  void initState() {
    super.initState();
    if (widget.awal == null) unawaited(_muat());
  }

  @override
  void dispose() {
    for (final c in [_kms, _temuan, _tl, _eks, _ket]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _muat() async {
    final p = await widget.deps.master.penyulang();
    if (mounted) setState(() => _penyulang = p.where((x) => !widget.dipakai.contains(x.toLowerCase())).toList());
  }

  void _ok() {
    if (!(_form.currentState?.validate() ?? false)) return;
    final a = widget.awal;
    Navigator.pop(
      context,
      C4aUp3Item(
        id: a?.id ?? const Uuid().v4(),
        penyulang: a?.penyulang ?? _p!,
        realisasiKms: C4aUp3Item.bacaKms(_kms.text)!,
        temuan: _temuan.text.trim(),
        tindakLanjut: _tl.text.trim(),
        eksekusi: _eks.text.trim(),
        keterangan: _ket.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.awal;
    return SafeArea(
      child: Form(
        key: _form,
        child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), children: [
          Text(a == null ? 'Tambah C4A UP3' : 'Ubah C4A UP3',
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.navy900)),
          const SizedBox(height: 14),
          if (a != null) ...[
            Text('Penyulang ${a.penyulang}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
            const Text('Penyulang tidak bisa diganti. Hapus lalu tambah baru.', style: TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
          ] else ...[
            DropdownButtonFormField<String>(
              initialValue: _p,
              isExpanded: true,
              decoration: sisiInput('Penyulang'),
              items: [for (final p in _penyulang) DropdownMenuItem(value: p, child: Text(p))],
              onChanged: (v) => setState(() => _p = v),
              validator: (v) => v == null ? 'Pilih penyulang' : null,
            ),
            if (_penyulang.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 6),
                child: Text('Tidak ada penyulang tersisa. Download Master Data di Pengaturan kalau master kosong.',
                    style: TextStyle(fontSize: 11.5, color: AppColors.red700)),
              ),
          ],
          const SizedBox(height: 12),
          TextFormField(
            controller: _kms,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
            decoration: sisiInput('Realisasi (kmS)', hint: 'mis. 4,6'),
            validator: (v) => C4aUp3Item.bacaKms(v ?? '') == null ? 'Isi angka, maks 2 desimal (mis. 4,6)' : null,
          ),
          const SizedBox(height: 12),
          TextFormField(controller: _temuan, maxLength: 200, decoration: sisiInput('Temuan', hint: 'mis. Pohon menyentuh JTM 3 titik')),
          const SizedBox(height: 4),
          TextFormField(controller: _tl, maxLength: 200, decoration: sisiInput('Tindak lanjut', hint: 'mis. Rabas pohon')),
          const SizedBox(height: 4),
          TextFormField(
            controller: _eks,
            maxLength: 100,
            decoration: sisiInput('Eksekusi', hint: 'Tim yang melakukan tindak lanjut, mis. Tim ROW 01'),
          ),
          const SizedBox(height: 4),
          TextFormField(controller: _ket, maxLength: 200, decoration: sisiInput('Keterangan (opsional, tidak masuk WA)')),
          const SizedBox(height: 6),
          FilledButton(onPressed: _ok, child: Text(a == null ? 'Tambah' : 'Terapkan')),
        ]),
      ),
    );
  }
}

/// Form satu C4A UIW. Baris yang sudah ada tidak bisa ganti section (server KOLOM_TERKUNCI): hapus lalu tambah baru.
class _FormC4a extends StatefulWidget {
  const _FormC4a({required this.deps, required this.dipakai, this.awal});
  final Deps deps;
  final Set<String> dipakai;
  final C4aItem? awal;

  @override
  State<_FormC4a> createState() => _FormC4aState();
}

class _FormC4aState extends State<_FormC4a> {
  final _form = GlobalKey<FormState>();
  List<String> _penyulang = const [];
  List<({String id, String nama})> _section = const [];
  String? _p;
  String? _s;
  late final _tiang = TextEditingController(text: widget.awal == null ? '' : '${widget.awal!.jumlahTiang}');
  late final _alat = TextEditingController(text: '${widget.awal?.temuanPeralatan ?? 0}');
  late final _row = TextEditingController(text: '${widget.awal?.temuanRow ?? 0}');
  late final _eks = TextEditingController(text: '${widget.awal?.eksekusi ?? 0}');
  late final _ket = TextEditingController(text: widget.awal?.keterangan ?? '');

  @override
  void initState() {
    super.initState();
    if (widget.awal == null) unawaited(_muatPenyulang());
    _tiang.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    for (final c in [_tiang, _alat, _row, _eks, _ket]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _muatPenyulang() async {
    final p = await widget.deps.master.penyulang();
    if (mounted) setState(() => _penyulang = p);
  }

  Future<void> _muatSection(String p) async {
    final s = await widget.deps.master.section(p);
    if (!mounted || p != _p) return; // v0.62.7: jawaban untuk penyulang yang sudah diganti = abaikan
    setState(() {
      _section = s.where((x) => !widget.dipakai.contains(x.id)).toList();
      _s = null;
    });
  }

  String? _cekAngka(String? v, {required int min, required int max, bool wajib = false}) {
    final t = (v ?? '').trim();
    if (t.isEmpty) return wajib ? 'Wajib diisi' : null;
    final n = int.tryParse(t);
    if (n == null || n < min || n > max) return 'Isi $min-$max';
    return null;
  }

  int _angka(TextEditingController c) => int.tryParse(c.text.trim()) ?? 0;

  void _ok() {
    if (!(_form.currentState?.validate() ?? false)) return;
    final a = widget.awal;
    final sec = a == null ? _section.firstWhere((x) => x.id == _s) : null;
    Navigator.pop(
      context,
      C4aItem(
        id: a?.id ?? const Uuid().v4(),
        sectionId: a?.sectionId ?? sec!.id,
        penyulang: a?.penyulang ?? _p!,
        section: a?.section ?? sec!.nama,
        jumlahTiang: _angka(_tiang),
        temuanPeralatan: _angka(_alat),
        temuanRow: _angka(_row),
        eksekusi: _angka(_eks),
        keterangan: _ket.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.awal;
    final angka = [FilteringTextInputFormatter.digitsOnly];
    final tiang = int.tryParse(_tiang.text.trim()) ?? 0;
    return SafeArea(
      child: Form(
        key: _form,
        child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), children: [
          Text(a == null ? 'Tambah C4A UIW' : 'Ubah C4A UIW',
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.navy900)),
          const SizedBox(height: 14),
          if (a != null) ...[
            Text('${a.penyulang} · ${a.section}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
            const Text('Section tidak bisa diganti. Hapus lalu tambah baru.', style: TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
          ] else ...[
            DropdownButtonFormField<String>(
              initialValue: _p,
              isExpanded: true,
              decoration: sisiInput('Penyulang'),
              items: [for (final p in _penyulang) DropdownMenuItem(value: p, child: Text(p))],
              onChanged: (v) {
                setState(() => _p = v);
                if (v != null) unawaited(_muatSection(v));
              },
              validator: (v) => v == null ? 'Pilih penyulang' : null,
            ),
            if (_penyulang.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 6),
                child: Text('Master jaringan kosong. Download Master Data di Pengaturan.',
                    style: TextStyle(fontSize: 11.5, color: AppColors.red700)),
              ),
            const SizedBox(height: 12),
            KolomPilih(
              key: ValueKey('section-$_p-${_section.length}-$_s'),
              label: 'Section',
              judulSheet: 'Pilih Section',
              keteranganSheet: _p == null ? null : 'Penyulang $_p · urut dari PMT sampai ujung jaringan (yang sudah ada di C4A tidak tampil)',
              pilihan: [for (final s in _section) PilihanItem(s.id, s.nama)],
              nilaiAwal: _s,
              onChanged: (v) => setState(() => _s = v),
              validator: (v) => v == null ? 'Pilih section' : null,
            ),
          ],
          const SizedBox(height: 12),
          TextFormField(
            controller: _tiang,
            keyboardType: TextInputType.number,
            inputFormatters: angka,
            decoration: sisiInput('Jumlah tiang', helper: 'Panjang = ${C4aItem.kmsTeks(tiang)} kmS (tiang x 0,05)'),
            validator: (v) => _cekAngka(v, min: 1, max: 2000, wajib: true),
          ),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: TextFormField(
                controller: _alat,
                keyboardType: TextInputType.number,
                inputFormatters: angka,
                decoration: sisiInput('Temuan peralatan'),
                validator: (v) => _cekAngka(v, min: 0, max: 999),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: TextFormField(
                controller: _row,
                keyboardType: TextInputType.number,
                inputFormatters: angka,
                decoration: sisiInput('Temuan ROW'),
                validator: (v) => _cekAngka(v, min: 0, max: 999),
              ),
            ),
          ]),
          const SizedBox(height: 12),
          TextFormField(
            controller: _eks,
            keyboardType: TextInputType.number,
            inputFormatters: angka,
            decoration: sisiInput('Eksekusi (titik)'),
            validator: (v) => _cekAngka(v, min: 0, max: 999),
          ),
          const SizedBox(height: 12),
          TextFormField(controller: _ket, maxLength: 200, decoration: sisiInput('Keterangan (opsional)')),
          const SizedBox(height: 6),
          FilledButton(onPressed: _ok, child: Text(a == null ? 'Tambah' : 'Terapkan')),
        ]),
      ),
    );
  }
}
