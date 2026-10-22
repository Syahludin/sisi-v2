import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/kalender_bulan.dart';
import '../hartek/hartek_gaya.dart';
import '../hartek/hartek_store.dart' show GudangHartekSql;
import '../insjar/insjar_header.dart';

/// v1.0.17 (permintaan kvlar 22 Okt 2026): Kalender di semua modul tim (ROW, Hartek, Yandal, Inspeksi Jaringan,
/// Inspeksi Gardu). Satu bulan: titik per hari (pekerjaan tim, WO tindak lanjut, jadwal padam), ketuk hari = rincian
/// jadwal dan pekerjaan hari itu. Data per bulan disimpan di HP (master_cache) sehingga bulan yang pernah dibuka tetap
/// tampil tanpa sinyal.
/// v1.0.18: isi kalender dipisah ke [PanelKalenderTim] supaya juga tampil di Beranda (semua akun).
class KalenderTimView extends StatefulWidget {
  const KalenderTimView({super.key, required this.deps, required this.sesi, this.denganKembali = false});
  final Deps deps;
  final Sesi sesi;

  /// Dibuka sebagai halaman sendiri (tombol Kembali di header).
  final bool denganKembali;

  @override
  State<KalenderTimView> createState() => _KalenderTimViewState();
}

/// Jenis kegiatan kalender -> (warna, label, ikon).
const Map<String, (Color, String, IconData)> jenisKalenderTim = {
  'PEKERJAAN': (WarnaKalender.pekerjaan, 'Pekerjaan tim', Icons.handyman_rounded),
  'PADAM': (WarnaKalender.padam, 'Jadwal padam', Icons.power_off_outlined),
  'WO': (WarnaKalender.wo, 'WO tindak lanjut', Icons.assignment_turned_in_outlined),
};

/// Kegiatan per tanggal -> tanda kalender (urutan jenis tetap).
Map<String, List<TandaHari>> tandaKalenderTim(List<Map<String, dynamic>> kegiatan) {
  final n = <String, Map<String, int>>{};
  for (final k in kegiatan) {
    final t = '${k['tanggal'] ?? ''}';
    final j = '${k['jenis'] ?? ''}';
    if (t.isEmpty || !jenisKalenderTim.containsKey(j)) continue;
    final m = n.putIfAbsent(t, () => {});
    m[j] = (m[j] ?? 0) + 1;
  }
  return {
    for (final e in n.entries)
      e.key: [
        for (final j in jenisKalenderTim.keys)
          if ((e.value[j] ?? 0) > 0) TandaHari(jenisKalenderTim[j]!.$1, e.value[j]!, jenisKalenderTim[j]!.$2.toLowerCase()),
      ],
  };
}

class _KalenderTimViewState extends State<KalenderTimView> {
  final _panel = GlobalKey<PanelKalenderTimState>();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: HartekGaya.latar,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () => _panel.currentState?.unduh() ?? Future.value(),
          child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 10, 16, 120), children: [
            HeaderInsJar(
              kicker: 'Kalender Tim',
              judul: 'Jadwal & pekerjaan',
              sub: widget.sesi.timNama.isEmpty ? 'Satu bulan' : '${widget.sesi.timNama} · satu bulan',
              ikon: Icons.event_note_rounded,
              aksi: [
                if (widget.denganKembali) tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => Navigator.maybePop(context)),
                if (widget.denganKembali) const SizedBox(width: 6),
                tombolHeaderInsJar(Icons.refresh_rounded, 'Segarkan', () => _panel.currentState?.unduh()),
              ],
            ),
            PanelKalenderTim(key: _panel, deps: widget.deps, sesi: widget.sesi),
          ]),
        ),
      ),
    );
  }
}

/// v1.0.18: isi kalender satu bulan (ringkasan jenis, kalender, legenda, kegiatan hari terpilih). Dipakai halaman
/// Kalender Tim dan Beranda. Hari ini terpilih di awal; [ringkas] = tanpa kotak jumlah (Beranda).
class PanelKalenderTim extends StatefulWidget {
  const PanelKalenderTim({super.key, required this.deps, required this.sesi, this.ringkas = false});
  final Deps deps;
  final Sesi sesi;
  final bool ringkas;

  @override
  State<PanelKalenderTim> createState() => PanelKalenderTimState();
}

class PanelKalenderTimState extends State<PanelKalenderTim> {
  late final GudangHartekSql _gudang = GudangHartekSql(widget.deps.db);
  late DateTime _bulan;
  DateTime? _hari;
  List<Map<String, dynamic>> _kegiatan = const [];
  String? _diambil, _galat;
  bool _muat = false;

  DateTime get _hariIni {
    final k = Wib.dinding(DateTime.now());
    return DateTime(k.year, k.month, k.day);
  }

  String get _kunciBulan => '${_bulan.year}-${_bulan.month.toString().padLeft(2, '0')}';
  String _kunciCache(String bulan) => 'kalender_tim_${widget.sesi.userId}_$bulan';

  @override
  void initState() {
    super.initState();
    final k = _hariIni;
    _bulan = DateTime(k.year, k.month, 1);
    _hari = k;
    unawaited(_muatBulan());
  }

  Future<void> _muatBulan() async {
    final bulan = _kunciBulan;
    try {
      final c = await _gudang.bacaMaster(_kunciCache(bulan));
      if (c != null && mounted && bulan == _kunciBulan) {
        final m = jsonDecode(c.json) as Map;
        setState(() {
          _kegiatan = [for (final x in (m['kegiatan'] as List? ?? const [])) if (x is Map) Map<String, dynamic>.from(x)];
          _diambil = '${m['diambil'] ?? ''}';
        });
      }
    } catch (_) {}
    await unduh();
  }

  /// Ambil bulan yang tampil dari server (tanpa sinyal = tetap tampil dari HP).
  Future<void> unduh() async {
    if (_muat) return;
    final bulan = _kunciBulan;
    setState(() {
      _muat = true;
      _galat = null;
    });
    try {
      final r = await widget.deps.api.call('getKalenderTim', token: widget.sesi.token, data: {'bulan': bulan});
      final keg = [for (final x in (r['kegiatan'] as List? ?? const [])) if (x is Map) Map<String, dynamic>.from(x)];
      final diambil = DateTime.now().toIso8601String();
      await _gudang.tulisMaster(_kunciCache(bulan), jsonEncode({'kegiatan': keg, 'diambil': diambil}));
      if (mounted && bulan == _kunciBulan) {
        setState(() {
          _kegiatan = keg;
          _diambil = diambil;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.kode.startsWith('HTTP_') ? null : KodeError.pesan(e.kode));
    } catch (_) {
      // offline: tampil dari HP
    } finally {
      if (mounted) setState(() => _muat = false);
    }
  }

  Future<void> _gantiBulan(DateTime b) async {
    setState(() {
      _bulan = b;
      _hari = null;
      _kegiatan = const [];
      _diambil = null;
    });
    await _muatBulan();
  }

  @override
  Widget build(BuildContext context) {
    final tanda = tandaKalenderTim(_kegiatan);
    final hari = _hari == null ? null : isoHari(_hari!);
    final tampil = hari == null ? _kegiatan : _kegiatan.where((k) => '${k['tanggal']}' == hari).toList();
    final jumlah = {for (final j in jenisKalenderTim.keys) j: _kegiatan.where((k) => k['jenis'] == j).length};
    // akun non-tim (admin) hanya menerima jadwal padam: jenis lain tidak ditampilkan di legenda / kotak jumlah
    final jenis = [for (final j in jenisKalenderTim.keys) if (j == 'PADAM' || widget.sesi.role == 'PETUGAS') j];
    final hariIni = hari != null && hari == isoHari(_hariIni);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (!widget.ringkas) ...[
        Row(children: [
          for (final j in jenis) ...[
            Expanded(child: _kotakJumlah(j, jumlah[j] ?? 0)),
            if (j != jenis.last) const SizedBox(width: 8),
          ],
        ]),
        const SizedBox(height: 12),
      ],
      KalenderBulan(
        bulan: _bulan,
        tanda: tanda,
        dipilih: _hari,
        hariIni: _hariIni,
        sibuk: _muat,
        onPilih: (d) => setState(() => _hari = hari == isoHari(d) ? null : d),
        onGantiBulan: (b) => unawaited(_gantiBulan(b)),
      ),
      const SizedBox(height: 8),
      LegendaKalender(butir: [for (final j in jenis) (jenisKalenderTim[j]!.$1, jenisKalenderTim[j]!.$2)]),
      if (_galat != null) ...[
        const SizedBox(height: 10),
        Text(_galat!, style: const TextStyle(color: AppColors.red700)),
      ],
      if (_diambil != null && _diambil!.isNotEmpty) ...[
        const SizedBox(height: 6),
        Text('Tersimpan di HP · diperbarui ${_diambil!.length >= 16 ? _diambil!.substring(11, 16) : _diambil}',
            style: const TextStyle(fontSize: 11.5, color: HartekGaya.redup)),
      ],
      const SizedBox(height: 14),
      Text(
          hari == null ? 'Semua kegiatan ${labelBulan(_bulan)}' : '${hariIni ? 'Hari ini' : 'Kegiatan'} · ${_hari!.day} ${labelBulan(_bulan)}',
          style: HartekGaya.judulSeksi),
      const SizedBox(height: 8),
      if (tampil.isEmpty)
        KosongHartek(
          ikon: Icons.event_available_outlined,
          judul: hari == null ? 'Belum ada kegiatan bulan ini' : 'Tidak ada pekerjaan / jadwal padam',
          petunjuk: _muat ? 'Memuat...' : 'Ketuk tanggal lain atau ganti bulan.',
        )
      else
        for (final k in tampil) _kartu(k, tampilTanggal: hari == null),
    ]);
  }

  Widget _kotakJumlah(String j, int n) => Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: HartekGaya.garis)),
        child: Row(children: [
          Container(width: 10, height: 10, decoration: BoxDecoration(color: jenisKalenderTim[j]!.$1, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('$n', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: HartekGaya.tinta)),
              Text(jenisKalenderTim[j]!.$2, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: HartekGaya.redup)),
            ]),
          ),
        ]),
      );

  Widget _kartu(Map<String, dynamic> k, {required bool tampilTanggal}) {
    final (warna, label, ikon) = jenisKalenderTim['${k['jenis']}'] ?? (AppColors.neutral500, '${k['jenis']}', Icons.circle_outlined);
    final t = DateTime.tryParse('${k['tanggal']}');
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: KartuHartek(
        padding: EdgeInsets.zero,
        child: IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(width: 5, color: warna),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Icon(ikon, size: 20, color: HartekGaya.redup),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${k['judul'] ?? ''}', style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
                      if ('${k['rincian'] ?? ''}'.isNotEmpty) Text('${k['rincian']}', style: HartekGaya.sekunder),
                      const SizedBox(height: 2),
                      Text([label, if (tampilTanggal && t != null) '${t.day} ${labelBulan(t)}'].join(' · '),
                          style: const TextStyle(fontSize: 12, color: HartekGaya.redup)),
                    ]),
                  ),
                ]),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}
