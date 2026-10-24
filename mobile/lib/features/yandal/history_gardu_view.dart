import 'dart:async';

import 'package:flutter/material.dart';
import '../../core/navigasi.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/sisi_widgets.dart';
import '../gardu/gardu_model.dart';
import '../gardu/gardu_widgets.dart';
import 'p0_detail_screen.dart';
import 'p0_form_screen.dart';
import 'p0_model.dart';
import 'p0_repository.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/refresh_sisi.dart';

/// Filter status pengukuran gardu 2 hari terakhir di tab History Pengukuran Gardu.
enum FilterHistoryGardu {
  diukur2Hari('Diukur 2 Hari'),
  siapDiukur('Siap Diukur'),
  semua('Semua');

  const FilterHistoryGardu(this.label);
  final String label;
}

/// Fungsi murni: pisahkan gardu aktif menjadi yang sudah diukur 2 hari terakhir vs yang siap diukur.
({List<Gardu> diukur2Hari, List<Gardu> siapDiukur}) kelompokHistoryGardu(
  List<Gardu> semua,
  String tglAcuan, {
  String kata = '',
  String? penyulang,
}) {
  final k = kata.trim().toLowerCase();
  final pny = penyulang?.trim().toLowerCase();
  final aktif = semua.where((g) {
    if (!g.aktif) return false;
    if (k.isNotEmpty && !g.kunciCari.contains(k)) return false;
    if (pny != null && pny.isNotEmpty && g.penyulang.trim().toLowerCase() != pny) return false;
    return true;
  }).toList();

  final diukur = <Gardu>[];
  final siap = <Gardu>[];
  for (final g in aktif) {
    final lagi = g.tglUkurTerbaru.isEmpty ? null : bisaUkurLagi(g.tglUkurTerbaru, tglAcuan);
    if (lagi != null) {
      diukur.add(g);
    } else {
      siap.add(g);
    }
  }
  diukur.sort((a, b) {
    final c = b.tglUkurTerbaru.compareTo(a.tglUkurTerbaru);
    return c != 0 ? c : a.no.compareTo(b.no);
  });
  siap.sort((a, b) {
    final ta = a.tglUkurTerbaru.isEmpty ? '0000' : a.tglUkurTerbaru;
    final tb = b.tglUkurTerbaru.isEmpty ? '0000' : b.tglUkurTerbaru;
    final c = ta.compareTo(tb);
    return c != 0 ? c : a.no.compareTo(b.no);
  });
  return (diukur2Hari: diukur, siapDiukur: siap);
}

/// v0.98.13: Tab "History Pengukuran Gardu" di Shift Yandal.
/// Menampilkan daftar gardu yang diukur 2 hari terakhir (hari ini & kemarin) beserta daftar gardu yang siap/belum diukur
/// agar petugas dapat mengetahui gardu yang belum diukur dan langsung memulai pengukuran tanpa khawatir gardu tersebut
/// sudah diukur dalam 2 hari terakhir.
class HistoryPengukuranGarduView extends StatefulWidget {
  const HistoryPengukuranGarduView({
    super.key,
    required this.deps,
    required this.sesi,
    this.onMulaiUkur,
  });

  final Deps deps;
  final Sesi sesi;
  final VoidCallback? onMulaiUkur;

  @override
  State<HistoryPengukuranGarduView> createState() => HistoryPengukuranGarduViewState();
}

class HistoryPengukuranGarduViewState extends State<HistoryPengukuranGarduView> {
  final _cari = TextEditingController();
  List<Gardu> _gardu = const [];
  Map<String, Map<String, dynamic>> _infoTerbaru = const {};
  bool _siap = false;
  bool _unduh = false;
  FilterHistoryGardu _filter = FilterHistoryGardu.diukur2Hari;
  String? _penyulang;

  String get _tglShift {
    final sh = widget.sesi.yandal?['shift'];
    final t = sh is Map<dynamic, dynamic> ? '${sh['tanggal'] ?? ''}' : '';
    return t.length == 10 ? t : Wib.tanggal(widget.deps.jam.sekarang());
  }

  bool get _bolehTambahP0 =>
      !widget.sesi.habisShift(widget.deps.jam.sekarang()) && P0Repository.shiftIdSesi(widget.sesi) != null;

  @override
  void initState() {
    super.initState();
    unawaited(muat());
  }

  @override
  void dispose() {
    _cari.dispose();
    super.dispose();
  }

  Future<void> muat({bool segarkanServer = true}) async {
    if (segarkanServer) {
      try {
        await widget.deps.gardu.segarkanAturanYandal(widget.sesi);
      } catch (_) {/* pakai cache offline */}
    }
    final master = await widget.deps.gardu.semua();
    final terbaru = await widget.deps.gardu.ukurGarduTerbaru();
    final idShift = P0Repository.shiftIdSesi(widget.sesi);
    final p0Shift = idShift == null ? const <P0Lokal>[] : await widget.deps.p0.daftarShift(widget.sesi.userId, idShift);
    final lokal = [
      for (final p in p0Shift)
        if (p.ukurGardu != null && p.ukurGardu!.disimpan)
          (
            garduId: p.ukurGardu!.garduId,
            noGardu: p.ukurGardu!.noGardu,
            tanggal: _tglShift,
            kva: p.ukurGardu!.kapasitas,
            bebanKva: p.ukurGardu!.hasil.kva,
            persen: p.ukurGardu!.hasil.persen,
            waktuBeban: waktuBebanGardu(p.ukurGardu!.foto['BEBAN_R']?.waktu ?? p.ukurGardu!.dibuat),
            penyulang: p.penyulang,
            section: p.ukurGardu!.section,
            alamat: p.ukurGardu!.alamat,
          ),
    ];
    final gabungan = gabungGarduUkurTerbaru(master, terbaru, lokal: lokal);
    final petaInfo = <String, Map<String, dynamic>>{};
    for (final u in terbaru) {
      final no = '${u['noGardu'] ?? ''}'.trim().toUpperCase();
      if (no.isNotEmpty) petaInfo[no] = u;
    }
    for (final p in p0Shift) {
      final ug = p.ukurGardu;
      if (ug != null && ug.disimpan) {
        petaInfo[ug.noGardu.toUpperCase()] = {
          'noGardu': ug.noGardu.toUpperCase(),
          'tanggal': _tglShift,
          'tim': widget.sesi.timNama,
          'petugas': widget.sesi.petugasShift.join(', '),
        };
      }
    }
    if (!mounted) return;
    setState(() {
      _gardu = gabungan;
      _infoTerbaru = petaInfo;
      _siap = true;
    });
  }

  Future<void> segarkan() async {
    if (_unduh) return;
    setState(() => _unduh = true);
    try {
      await widget.deps.gardu.segarkan(widget.sesi);
      await muat(segarkanServer: false);
      if (mounted) {
        unawaited(tampilPopupBerhasil(
          context,
          judul: 'Data gardu diperbarui',
          keterangan: '${_gardu.where((g) => g.aktif).length} gardu aktif siap dicek',
        ));
      }
    } catch (_) {
      await muat(segarkanServer: true);
      if (mounted) tampilPesan(context, 'Menampilkan data pengukuran terakhir yang tersimpan di HP.');
    } finally {
      if (mounted) setState(() => _unduh = false);
    }
  }

  Future<void> _ukurGarduIni(Gardu g) async {
    final lagi = g.tglUkurTerbaru.isEmpty ? null : bisaUkurLagi(g.tglUkurTerbaru, _tglShift);
    if (lagi != null) {
      tampilPesan(context, 'Gardu ${g.no} sudah diukur ${tanggalPanjang(g.tglUkurTerbaru)}. Bisa diukur lagi ${tanggalPanjang(lagi)}.');
      return;
    }
    if (!_bolehTambahP0) {
      tampilPesan(context, 'Jam shift sudah berakhir atau shift belum aktif.');
      return;
    }
    final baru = await bukaForm<P0Lokal>(
      context,
      MaterialPageRoute(
        builder: (_) => FormP0Screen(
          deps: widget.deps,
          sesi: widget.sesi,
          awalPekerjaan: pekerjaanGardu,
          awalPenyulang: g.penyulang.isNotEmpty ? g.penyulang : null,
          awalSectionId: g.sectionId.isNotEmpty ? g.sectionId : null,
          awalSection: g.section.isNotEmpty ? g.section : g.ptsLbs,
          awalDaerah: g.alamat,
        ),
      ),
    );
    if (baru != null) {
      unawaited(widget.deps.syncCtl.sinkron().then((_) => muat(segarkanServer: false)));
      widget.onMulaiUkur?.call();
      if (mounted) {
        await Navigator.push<void>(
          context,
          MaterialPageRoute(
            builder: (_) => P0DetailScreen(
              deps: widget.deps,
              sesi: widget.sesi,
              p0Id: baru.id,
              awalGardu: g,
            ),
          ),
        );
      }
      await muat(segarkanServer: false);
      widget.onMulaiUkur?.call();
    }
  }

  Future<void> _pilihPenyulang() async {
    final hitung = <String, int>{};
    for (final g in _gardu) {
      if (g.aktif && g.penyulang.trim().isNotEmpty) {
        final p = g.penyulang.trim();
        hitung[p] = (hitung[p] ?? 0) + 1;
      }
    }
    final daftar = hitung.keys.toList()..sort();
    final pilih = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      backgroundColor: Colors.white,
      builder: (c) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
          children: [
            const Padding(
              padding: EdgeInsets.only(bottom: 8),
              child: Text('Filter Penyulang', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.navy900)),
            ),
            ListTile(
              title: const Text('Semua Penyulang', style: TextStyle(fontWeight: FontWeight.w700)),
              trailing: _penyulang == null ? const Icon(Icons.check_rounded, color: AppColors.navy700) : null,
              onTap: () => Navigator.pop(c, ''),
            ),
            for (final p in daftar)
              ListTile(
                title: Text(p, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text('${hitung[p]} gardu'),
                trailing: _penyulang == p ? const Icon(Icons.check_rounded, color: AppColors.navy700) : null,
                onTap: () => Navigator.pop(c, p),
              ),
          ],
        ),
      ),
    );
    if (pilih == null || !mounted) return;
    setState(() => _penyulang = pilih.isEmpty ? null : pilih);
  }

  @override
  Widget build(BuildContext context) {
    if (!_siap) return const SisiLoading(pesan: 'Memuat history pengukuran gardu...', ukuran: 65);
    final tgl = _tglShift;
    final totalKelompok = kelompokHistoryGardu(_gardu, tgl, penyulang: _penyulang);
    final saringKelompok = kelompokHistoryGardu(_gardu, tgl, kata: _cari.text, penyulang: _penyulang);
    final tampil = switch (_filter) {
      FilterHistoryGardu.diukur2Hari => saringKelompok.diukur2Hari,
      FilterHistoryGardu.siapDiukur => saringKelompok.siapDiukur,
      FilterHistoryGardu.semua => [...saringKelompok.diukur2Hari, ...saringKelompok.siapDiukur],
    };

    return RefreshSisi(
      onRefresh: segarkan,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [AppColors.navy700, AppColors.navy900], begin: Alignment.topLeft, end: Alignment.bottomRight),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                const Icon(Icons.history_rounded, color: AppColors.accent400, size: 20),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text('History Pengukuran Gardu (2 Hari Terakhir)',
                      style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: Colors.white)),
                ),
                if (_unduh)
                  const SisiLoader(ukuran: 16, warna: Colors.white)
                else
                  InkWell(
                    borderRadius: BorderRadius.circular(8),
                    onTap: () => unawaited(segarkan()),
                    child: const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.sync_rounded, size: 15, color: AppColors.accent400),
                        SizedBox(width: 4),
                        Text('Perbarui', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.accent400)),
                      ]),
                    ),
                  ),
              ]),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                  child: _KartuRingkasHistory(
                    label: 'Diukur 2 Hari Terakhir',
                    sub: 'Jangan diukur ulang',
                    angka: totalKelompok.diukur2Hari.length,
                    warna: AppColors.amber500,
                    aktif: _filter == FilterHistoryGardu.diukur2Hari,
                    onTap: () => setState(() => _filter = FilterHistoryGardu.diukur2Hari),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _KartuRingkasHistory(
                    label: 'Belum / Siap Diukur',
                    sub: 'Aman untuk diukur',
                    angka: totalKelompok.siapDiukur.length,
                    warna: const Color(0xFF22C55E),
                    aktif: _filter == FilterHistoryGardu.siapDiukur,
                    onTap: () => setState(() => _filter = FilterHistoryGardu.siapDiukur),
                  ),
                ),
              ]),
            ]),
          ),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: TextField(
                controller: _cari,
                onChanged: (_) => setState(() {}),
                decoration: sisiInput(
                  'Cari No Gardu, alamat, penyulang...',
                  suffix: _cari.text.isEmpty
                      ? const Icon(Icons.search_rounded)
                      : IconButton(
                          icon: const Icon(Icons.clear_rounded, size: 18),
                          onPressed: () {
                            _cari.clear();
                            setState(() {});
                          },
                        ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            OutlinedButton.icon(
              onPressed: _gardu.isEmpty ? null : _pilihPenyulang,
              icon: const Icon(Icons.filter_list_rounded, size: 18),
              label: Text(_penyulang ?? 'Penyulang', overflow: TextOverflow.ellipsis),
            ),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            for (final f in FilterHistoryGardu.values) ...[
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(right: f == FilterHistoryGardu.values.last ? 0 : 6),
                  child: ChoiceChip(
                    label: SizedBox(
                      width: double.infinity,
                      child: Text(f.label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800)),
                    ),
                    selected: _filter == f,
                    onSelected: (_) => setState(() => _filter = f),
                  ),
                ),
              ),
            ],
          ]),
          const SizedBox(height: 10),
          if (_gardu.isEmpty)
            SisiKosong(
              ikon: Icons.electrical_services_rounded,
              judul: 'Master Gardu belum diunduh',
              pesan: 'Tekan tombol di bawah untuk mengunduh daftar gardu & riwayat pengukuran 2 hari terakhir.',
              tombol: 'Download Master Gardu',
              onTombol: _unduh ? null : () => unawaited(segarkan()),
            )
          else if (tampil.isEmpty)
            SisiKosong(
              ikon: _filter == FilterHistoryGardu.diukur2Hari ? Icons.history_toggle_off_rounded : Icons.search_off_rounded,
              judul: _filter == FilterHistoryGardu.diukur2Hari
                  ? 'Belum ada gardu yang diukur 2 hari terakhir'
                  : 'Tidak ada gardu yang cocok',
              pesan: _filter == FilterHistoryGardu.diukur2Hari
                  ? 'Semua gardu aktif saat ini aman untuk diukur. Pilih tab "Siap Diukur" untuk melihat daftar gardu.'
                  : 'Ubah kata kunci pencarian atau filter penyulang.',
            )
          else
            for (final g in tampil) ...[
              _KartuHistoryGardu(
                gardu: g,
                tglShift: tgl,
                infoUkur: _infoTerbaru[g.no.toUpperCase()],
                bolehUkur: _bolehTambahP0,
                onTapDetail: () => unawaited(tampilDetailGardu(context, g)),
                onUkur: () => unawaited(_ukurGarduIni(g)),
              ),
              const SizedBox(height: 8),
            ],
        ],
      ),
    );
  }
}

class _KartuRingkasHistory extends StatelessWidget {
  const _KartuRingkasHistory({
    required this.label,
    required this.sub,
    required this.angka,
    required this.warna,
    required this.aktif,
    required this.onTap,
  });

  final String label;
  final String sub;
  final int angka;
  final Color warna;
  final bool aktif;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: aktif ? Colors.white.withValues(alpha: .18) : Colors.white.withValues(alpha: .08),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: aktif ? warna : Colors.white24, width: aktif ? 1.5 : 1),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('$angka', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: warna, height: 1.1)),
            const SizedBox(height: 2),
            Text(label, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: Colors.white)),
            Text(sub, style: const TextStyle(fontSize: 10, color: Colors.white70)),
          ]),
        ),
      ),
    );
  }
}

class _KartuHistoryGardu extends StatelessWidget {
  const _KartuHistoryGardu({
    required this.gardu,
    required this.tglShift,
    this.infoUkur,
    required this.bolehUkur,
    required this.onTapDetail,
    required this.onUkur,
  });

  final Gardu gardu;
  final String tglShift;
  final Map<String, dynamic>? infoUkur;
  final bool bolehUkur;
  final VoidCallback onTapDetail;
  final VoidCallback onUkur;

  @override
  Widget build(BuildContext context) {
    final g = gardu;
    final lagi = g.tglUkurTerbaru.isEmpty ? null : bisaUkurLagi(g.tglUkurTerbaru, tglShift);
    final sudahDiukur2Hari = lagi != null;
    final tim = '${infoUkur?['tim'] ?? ''}'.trim();
    final petugas = '${infoUkur?['petugas'] ?? ''}'.trim();
    final infoPetugas = [if (tim.isNotEmpty) tim, if (petugas.isNotEmpty) petugas].join(' • ');

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: sudahDiukur2Hari ? AppColors.amber500.withValues(alpha: .6) : AppColors.neutral200),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        KartuGardu(gardu: g, onTap: onTapDetail),
        Container(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
          decoration: BoxDecoration(
            color: sudahDiukur2Hari ? AppColors.accent100 : AppColors.success100.withValues(alpha: .6),
            borderRadius: const BorderRadius.vertical(bottom: Radius.circular(15)),
          ),
          child: Row(children: [
            Icon(
              sudahDiukur2Hari ? Icons.lock_clock_rounded : Icons.check_circle_outline_rounded,
              size: 16,
              color: sudahDiukur2Hari ? AppColors.accent700 : AppColors.success700,
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(
                  sudahDiukur2Hari
                      ? 'Diukur ${tanggalPanjang(g.tglUkurTerbaru)} · Bisa diukur lagi ${tanggalPanjang(lagi)}'
                      : (g.tglUkurTerbaru.isEmpty ? 'Belum pernah diukur · Aman diukur' : 'Terakhir diukur ${tanggalPanjang(g.tglUkurTerbaru)} · Aman diukur'),
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                    color: sudahDiukur2Hari ? AppColors.accent700 : AppColors.success700,
                  ),
                ),
                if (infoPetugas.isNotEmpty)
                  Text('Oleh: $infoPetugas', style: const TextStyle(fontSize: 10.5, color: AppColors.neutral700)),
              ]),
            ),
            if (!sudahDiukur2Hari && bolehUkur) ...[
              const SizedBox(width: 8),
              SizedBox(
                height: 32,
                child: FilledButton.icon(
                  onPressed: onUkur,
                  icon: const Icon(Icons.speed_rounded, size: 15),
                  label: const Text('Ukur Gardu', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800)),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.navy700,
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
                  ),
                ),
              ),
            ],
          ]),
        ),
      ]),
    );
  }
}
