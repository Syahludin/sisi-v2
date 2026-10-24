import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/animasi_masuk.dart';
import '../../widgets/sisi_widgets.dart';
import 'gardu_model.dart';
import 'gardu_widgets.dart';
import 'riwayat_gardu_screen.dart';
import '../../widgets/refresh_sisi.dart';

/// v0.69.0 (permintaan kvlar 9 Okt 2026): menu Pengukuran Gardu (Operasi, ADMIN / SUPER / ADMIN_ES sesuai db_Akses).
/// Berbasis Master Gardu lokal (offline): ringkasan kategori beban yang bisa diketuk sebagai saringan, cari, saring
/// penyulang / kapasitas / range beban, urutkan, dan detail per gardu. Referensi v1: GarduScreen (filter nomor,
/// range, kapasitas, kriteria) + kartu cincin beban, dikembangkan jadi satu layar interaktif.
class PengukuranGarduScreen extends StatefulWidget {
  const PengukuranGarduScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  @override
  State<PengukuranGarduScreen> createState() => _PengukuranGarduScreenState();
}

class _PengukuranGarduScreenState extends State<PengukuranGarduScreen> {
  final _cari = TextEditingController();
  List<Gardu> _semua = const [];
  DateTime? _diambil;
  SaringGardu _saring = const SaringGardu();
  bool _muat = true;
  bool _unduh = false;

  @override
  void initState() {
    super.initState();
    _muatLokal();
  }

  @override
  void dispose() {
    _cari.dispose();
    super.dispose();
  }

  Future<void> _muatLokal() async {
    final semua = await widget.deps.gardu.semua();
    final info = await widget.deps.gardu.info();
    if (!mounted) return;
    setState(() {
      _semua = semua;
      _diambil = info?.diambil;
      _muat = false;
    });
  }

  Future<void> _segarkan() async {
    if (_unduh) return;
    setState(() => _unduh = true);
    try {
      final berubah = await widget.deps.gardu.segarkan(widget.sesi);
      await _muatLokal();
      if (mounted) tampilPesan(context, berubah ? 'Master Gardu diperbarui.' : 'Master Gardu sudah terbaru.');
    } on ApiException catch (e) {
      if (mounted) tampilPesan(context, KodeError.pesan(e.kode));
    } catch (_) {
      if (mounted) tampilPesan(context, 'Gagal mengunduh Master Gardu. Cek sinyal lalu coba lagi.');
    } finally {
      if (mounted) setState(() => _unduh = false);
    }
  }

  void _ubah(SaringGardu s) => setState(() => _saring = s);

  /// v1.0.17: ketuk kartu gardu = pilih History Perbaikan & Manajemen Trafo atau Pengukuran Gardu.
  Future<void> _bukaGardu(Gardu g) async {
    final p = await pilihTampilanGardu(context, g);
    if (p == null || !mounted) return;
    await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => RiwayatGarduScreen(deps: widget.deps, sesi: widget.sesi, gardu: g, awal: p)));
  }

  void _toggleKategori(KategoriBeban k) {
    final pilih = {..._saring.kategori};
    if (!pilih.remove(k)) pilih.add(k);
    _ubah(_saring.salin(kategori: pilih));
  }

  void _reset() {
    _cari.clear();
    _ubah(SaringGardu(urut: _saring.urut, tidakAktif: _saring.tidakAktif));
  }

  Future<void> _pilihPenyulang() async {
    final dasar = _saring.dasar(_semua);
    final hitung = <String, int>{};
    for (final g in dasar) {
      if (g.penyulang.isNotEmpty) hitung[g.penyulang] = (hitung[g.penyulang] ?? 0) + 1;
    }
    final daftar = hitung.keys.toList()..sort();
    final pilih = await _sheetPilih(
      judul: 'Penyulang',
      opsi: [for (final p in daftar) (p, p, '${hitung[p]} gardu')],
      terpilih: _saring.penyulang,
    );
    if (pilih == null) return;
    _ubah(_saring.salin(penyulang: () => pilih.isEmpty ? null : pilih));
  }

  Future<void> _pilihKva() async {
    final dasar = _saring.dasar(_semua);
    final hitung = <double, int>{};
    for (final g in dasar) {
      if (g.kva != null) hitung[g.kva!] = (hitung[g.kva!] ?? 0) + 1;
    }
    final daftar = hitung.keys.toList()..sort();
    final pilih = await _sheetPilih(
      judul: 'Kapasitas Trafo',
      opsi: [for (final k in daftar) ('$k', '${angkaId(k)} kVA', '${hitung[k]} gardu')],
      terpilih: _saring.kva?.toString(),
    );
    if (pilih == null) return;
    _ubah(_saring.salin(kva: () => pilih.isEmpty ? null : double.tryParse(pilih)));
  }

  Future<void> _pilihRange() async {
    var nilai = RangeValues(_saring.minPersen ?? 0.0, (_saring.maxPersen ?? 150.0).clamp(0.0, 150.0).toDouble());
    final hasil = await showModalBottomSheet<RangeValues>(
      context: context,
      showDragHandle: true,
      builder: (c) => StatefulBuilder(
        builder: (c, setSheet) => Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Range Beban (%)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy900)),
            const SizedBox(height: 4),
            Text('${nilai.start.round()}% s.d. ${nilai.end >= 150 ? '150%+' : '${nilai.end.round()}%'}',
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.navy700)),
            RangeSlider(
              values: nilai,
              min: 0,
              max: 150,
              divisions: 30,
              labels: RangeLabels('${nilai.start.round()}%', '${nilai.end.round()}%'),
              onChanged: (v) => setSheet(() => nilai = v),
            ),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final p in const [(0.0, 49.0, '< 50'), (50.0, 79.0, '50-79'), (80.0, 99.0, '80-99'), (100.0, 150.0, '>= 100')])
                ActionChip(label: Text(p.$3), onPressed: () => setSheet(() => nilai = RangeValues(p.$1, p.$2))),
            ]),
            const SizedBox(height: 16),
            Row(children: [
              Expanded(
                child: OutlinedButton(onPressed: () => Navigator.pop(c, const RangeValues(-1.0, -1.0)), child: const Text('Hapus')),
              ),
              const SizedBox(width: 10),
              Expanded(child: FilledButton(onPressed: () => Navigator.pop(c, nilai), child: const Text('Terapkan'))),
            ]),
          ]),
        ),
      ),
    );
    if (hasil == null) return;
    if (hasil.start < 0) {
      _ubah(_saring.salin(minPersen: () => null, maxPersen: () => null));
    } else {
      _ubah(_saring.salin(minPersen: () => hasil.start, maxPersen: () => hasil.end >= 150 ? null : hasil.end));
    }
  }

  Future<void> _pilihUrut() async {
    final pilih = await _sheetPilih(
      judul: 'Urutkan',
      opsi: [for (final u in UrutGardu.values) (u.name, u.label, null)],
      terpilih: _saring.urut.name,
      bolehKosong: false,
    );
    if (pilih == null || pilih.isEmpty) return;
    _ubah(_saring.salin(urut: UrutGardu.values.firstWhere((u) => u.name == pilih)));
  }

  /// Sheet pilih satu. Hasil: kunci terpilih, '' = hapus pilihan, null = batal.
  Future<String?> _sheetPilih({
    required String judul,
    required List<(String, String, String?)> opsi,
    String? terpilih,
    bool bolehKosong = true,
  }) {
    return showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (c) => ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(c).size.height * .7),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 12, 6),
            child: Row(children: [
              Expanded(child: Text(judul, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy900))),
              if (bolehKosong && terpilih != null) TextButton(onPressed: () => Navigator.pop(c, ''), child: const Text('Hapus')),
            ]),
          ),
          Flexible(
            child: ListView(shrinkWrap: true, padding: const EdgeInsets.only(bottom: 16), children: [
              for (final o in opsi)
                ListTile(
                  dense: true,
                  title: Text(o.$2, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: o.$3 == null ? null : Text(o.$3!),
                  trailing: o.$1 == terpilih ? const Icon(Icons.check_circle_rounded, color: AppColors.navy700) : null,
                  onTap: () => Navigator.pop(c, o.$1),
                ),
            ]),
          ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final dasar = _saring.dasar(_semua);
    final hasil = _saring.terapkan(_semua);
    final jumlah = hitungKategori(dasar);
    final tidakAktif = _semua.where((g) => g.status == 'TIDAK AKTIF').length;
    final sub = _diambil == null
        ? 'Master belum diunduh'
        : '${dasar.length} gardu · master ${DateFormat('dd MMM HH:mm', 'id_ID').format(_diambil!.toLocal())}';
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar('Pengukuran Gardu', subjudul: sub, actions: [TombolSegarkan(sibuk: _unduh, onPressed: _segarkan)]),
      body: _muat
          ? const SisiLoading()
          : _semua.isEmpty
              ? SisiKosong(
                  ikon: Icons.electrical_services_rounded,
                  judul: 'Master Gardu belum ada di HP',
                  pesan: 'Unduh sekali (perlu internet), sesudah itu menu ini bisa dibuka offline. '
                      'Bisa juga dari Pengaturan > Master Gardu.',
                  tombol: _unduh ? 'Mengunduh...' : 'Download Master Gardu',
                  onTombol: _unduh ? null : _segarkan,
                )
              : RefreshSisi(
                  onRefresh: _segarkan,
                  child: CustomScrollView(physics: const AlwaysScrollableScrollPhysics(), slivers: [
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      sliver: SliverToBoxAdapter(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                          _Ringkasan(
                            total: dasar.length,
                            jumlah: jumlah,
                            terpilih: _saring.kategori,
                            onKategori: _toggleKategori,
                            tidakAktif: _saring.tidakAktif,
                            jumlahTidakAktif: tidakAktif,
                            onStatus: (v) => _ubah(_saring.salin(tidakAktif: v, kategori: const {})),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _cari,
                            onChanged: (v) => _ubah(_saring.salin(kata: v)),
                            textInputAction: TextInputAction.search,
                            decoration: InputDecoration(
                              hintText: 'Cari No Gardu, alamat, penyulang...',
                              prefixIcon: const Icon(Icons.search_rounded),
                              suffixIcon: _saring.kata.isEmpty
                                  ? null
                                  : IconButton(
                                      icon: const Icon(Icons.close_rounded),
                                      onPressed: () {
                                        _cari.clear();
                                        _ubah(_saring.salin(kata: ''));
                                      },
                                    ),
                              filled: true,
                              fillColor: Colors.white,
                              isDense: true,
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.neutral200)),
                              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.neutral200)),
                            ),
                          ),
                          const SizedBox(height: 10),
                          SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: Row(children: [
                              _ChipSaring(
                                ikon: Icons.account_tree_outlined,
                                label: _saring.penyulang ?? 'Penyulang',
                                aktif: _saring.penyulang != null,
                                onTap: _pilihPenyulang,
                              ),
                              _ChipSaring(
                                ikon: Icons.bolt_rounded,
                                label: _saring.kva == null ? 'Kapasitas' : '${angkaId(_saring.kva)} kVA',
                                aktif: _saring.kva != null,
                                onTap: _pilihKva,
                              ),
                              _ChipSaring(
                                ikon: Icons.tune_rounded,
                                label: _saring.minPersen == null && _saring.maxPersen == null
                                    ? 'Range Beban'
                                    : '${(_saring.minPersen ?? 0).round()}-${_saring.maxPersen == null ? '150+' : _saring.maxPersen!.round()}%',
                                aktif: _saring.minPersen != null || _saring.maxPersen != null,
                                onTap: _pilihRange,
                              ),
                              _ChipSaring(ikon: Icons.sort_rounded, label: _saring.urut.label, aktif: false, onTap: _pilihUrut),
                              if (_saring.adaSaring)
                                Padding(
                                  padding: const EdgeInsets.only(left: 2),
                                  child: TextButton.icon(
                                    onPressed: _reset,
                                    icon: const Icon(Icons.filter_alt_off_rounded, size: 16),
                                    label: const Text('Reset'),
                                  ),
                                ),
                            ]),
                          ),
                          const SizedBox(height: 8),
                          Text('${hasil.length} dari ${dasar.length} gardu',
                              style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.neutral500)),
                          const SizedBox(height: 8),
                        ]),
                      ),
                    ),
                    if (hasil.isEmpty)
                      const SliverToBoxAdapter(
                        child: Padding(
                          padding: EdgeInsets.only(top: 24),
                          child: SisiKosong(ikon: Icons.search_off_rounded, judul: 'Tidak ada gardu yang cocok', pesan: 'Ubah atau reset saringan.'),
                        ),
                      )
                    else
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
                        sliver: SliverList(
                          delegate: SliverChildBuilderDelegate(
                            (c, i) => Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: KartuGardu(gardu: hasil[i], onTap: () => unawaited(_bukaGardu(hasil[i]))),
                            ),
                            childCount: hasil.length,
                          ),
                        ),
                      ),
                  ]),
                ),
    );
  }
}

/// Kartu ringkasan: total, bilah sebaran kategori, kotak kategori (ketuk = saring), pilihan Aktif / Tidak Aktif.
class _Ringkasan extends StatelessWidget {
  const _Ringkasan({
    required this.total,
    required this.jumlah,
    required this.terpilih,
    required this.onKategori,
    required this.tidakAktif,
    required this.jumlahTidakAktif,
    required this.onStatus,
  });
  final int total;
  final Map<KategoriBeban, int> jumlah;
  final Set<KategoriBeban> terpilih;
  final ValueChanged<KategoriBeban> onKategori;
  final bool tidakAktif;
  final int jumlahTidakAktif;
  final ValueChanged<bool> onStatus;

  @override
  Widget build(BuildContext context) {
    final ada = KategoriBeban.values.where((k) => (jumlah[k] ?? 0) > 0).toList();
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.neutral200),
        boxShadow: [BoxShadow(color: AppColors.navy900.withValues(alpha: .04), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            AngkaNaik(total, gaya: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: AppColors.navy900, height: 1)), // v1.0.27
            Text(tidakAktif ? 'gardu tidak aktif' : 'gardu aktif',
                style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: AppColors.neutral500)),
          ]),
          const Spacer(),
          if (jumlahTidakAktif > 0)
            SegmentedButton<bool>(
              showSelectedIcon: false,
              style: const ButtonStyle(visualDensity: VisualDensity.compact),
              segments: [
                const ButtonSegment(value: false, label: Text('Aktif', style: TextStyle(fontSize: 11.5))),
                ButtonSegment(value: true, label: Text('Tidak Aktif ($jumlahTidakAktif)', style: const TextStyle(fontSize: 11.5))),
              ],
              selected: {tidakAktif},
              onSelectionChanged: (v) => onStatus(v.first),
            ),
        ]),
        const SizedBox(height: 12),
        if (total > 0)
          // v1.0.27: bar kategori tumbuh dari kiri bersamaan dengan cincin + angka
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: 1),
            duration: durasiMasukSisi,
            curve: Curves.easeOutCubic,
            builder: (_, v, bar) => Align(alignment: Alignment.centerLeft, widthFactor: 1, child: FractionallySizedBox(widthFactor: v, child: bar)),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: SizedBox(
                height: 10,
                child: Row(children: [
                  for (final k in ada) Expanded(flex: jumlah[k] ?? 0, child: Container(color: k.warna)),
                ]),
              ),
            ),
          ),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (c, k) {
            final lebar = (k.maxWidth - 16) / 3;
            return Wrap(spacing: 8, runSpacing: 8, children: [
              for (final kat in KategoriBeban.values)
                SizedBox(
                  width: lebar,
                  child: _KotakKategori(
                    kategori: kat,
                    jumlah: jumlah[kat] ?? 0,
                    total: total,
                    terpilih: terpilih.contains(kat),
                    redup: terpilih.isNotEmpty && !terpilih.contains(kat),
                    onTap: () => onKategori(kat),
                  ),
                ),
            ]);
          },
        ),
      ]),
    );
  }
}

class _KotakKategori extends StatelessWidget {
  const _KotakKategori({
    required this.kategori,
    required this.jumlah,
    required this.total,
    required this.terpilih,
    required this.redup,
    required this.onTap,
  });
  final KategoriBeban kategori;
  final int jumlah;
  final int total;
  final bool terpilih;
  final bool redup;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final persen = total == 0 ? 0 : (jumlah * 100 / total).round();
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 180),
      opacity: redup ? .45 : 1,
      child: Material(
        color: kategori.latar,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.fromLTRB(10, 9, 10, 9),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: terpilih ? kategori.warna : Colors.transparent, width: 1.6),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(
                  child: AngkaNaik(jumlah, gaya: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: kategori.warna, height: 1.1)),
                ),
                if (terpilih) Icon(Icons.check_circle_rounded, size: 15, color: kategori.warna),
              ]),
              Text(kategori.label,
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: kategori.warna)),
              Text('${kategori.range} · $persen%',
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 9.5, color: AppColors.neutral500)),
            ]),
          ),
        ),
      ),
    );
  }
}

class _ChipSaring extends StatelessWidget {
  const _ChipSaring({required this.ikon, required this.label, required this.aktif, required this.onTap});
  final IconData ikon;
  final String label;
  final bool aktif;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: Material(
          color: aktif ? AppColors.navy700 : Colors.white,
          borderRadius: BorderRadius.circular(999),
          child: InkWell(
            borderRadius: BorderRadius.circular(999),
            onTap: onTap,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: aktif ? AppColors.navy700 : AppColors.neutral200),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(ikon, size: 15, color: aktif ? Colors.white : AppColors.navy700),
                const SizedBox(width: 5),
                Text(label, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: aktif ? Colors.white : AppColors.navy900)),
                const SizedBox(width: 2),
                Icon(Icons.expand_more_rounded, size: 16, color: aktif ? Colors.white : AppColors.neutral500),
              ]),
            ),
          ),
        ),
      );
}
