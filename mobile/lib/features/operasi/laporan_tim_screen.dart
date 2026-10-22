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
import '../hartek/hartek_rincian.dart';
import 'laporan_yandal_repository.dart';
import 'laporan_yandal_screen.dart';
import 'ringkas_tim.dart';
import 'tim_screen.dart';

/// Operasi > Laporan per Tim (v0.50 / v0.98.6): daftar seluruh tim (ROW, HARTEK, Inspeksi Jaringan, Inspeksi Gardu)
/// dengan kartu bergaya tile logo seragam seperti menu Operasi lainnya.
/// v0.99.0: + tim YANDAL (status login shift berjalan + laporan P0 per shift, LaporanYandalTimScreen).
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
  LaporanYandal? _yandal; // v0.99.0: null = belum / gagal dimuat
  String? _pesanYandal;
  late final LaporanYandalRepository _repoYandal = LaporanYandalRepository(widget.deps.api);

  @override
  void initState() {
    super.initState();
    unawaited(_muat());
  }

  List<Map<String, dynamic>> _susunTim(List<Map<String, dynamic>> dariMaster, Map<String, List<Map<String, dynamic>>>? perTim) {
    final hasil = <Map<String, dynamic>>[];
    final adaId = <String>{};
    for (final t in dariMaster) {
      final jenis = '${t['jenis'] ?? ''}'.trim().toUpperCase();
      final id = '${t['id'] ?? ''}';
      if (id.isNotEmpty) adaId.add(id);
      hasil.add({
        ...t,
        'jenis': jenis.isEmpty ? 'ROW' : jenis,
        'siap': jenis == 'ROW' || jenis == 'HARTEK' || jenis == 'YANDAL', // v0.99.0: + YANDAL
      });
    }
    // Pastikan tim HARTEK yang melapor di server atau default HARTEK selalu tampil walau belum diunduh di master lokal
    final adaHartek = hasil.any((t) => '${t['jenis']}' == 'HARTEK');
    if (!adaHartek) {
      Map<String, dynamic>? dariLap;
      if (perTim != null) {
        for (final daftar in perTim.values) {
          for (final l in daftar) {
            if ('${l['jenisTim'] ?? ''}'.toUpperCase() == 'HARTEK') {
              dariLap = l;
              break;
            }
          }
        }
      }
      hasil.add({
        'id': '${dariLap?['timId'] ?? 'tim-hartek'}',
        'jenis': 'HARTEK',
        'nama': '${dariLap?['subTim'] ?? 'HARTEK'}',
        'kode': '01',
        'aktif': true,
        'siap': true,
      });
    }
    if (!hasil.any((t) => '${t['jenis']}' == 'INSPEKSI_JARINGAN')) {
      hasil.add({
        'id': 'segera-inspeksi-jaringan',
        'jenis': 'INSPEKSI_JARINGAN',
        'nama': 'Inspeksi Jaringan',
        'kode': '91',
        'aktif': true,
        'siap': false,
      });
    }
    if (!hasil.any((t) => '${t['jenis']}' == 'INSPEKSI_GARDU')) {
      hasil.add({
        'id': 'segera-inspeksi-gardu',
        'jenis': 'INSPEKSI_GARDU',
        'nama': 'Inspeksi Gardu',
        'kode': '92',
        'aktif': true,
        'siap': false,
      });
    }
    return hasil;
  }

  Future<void> _muat({bool beriTahu = false}) async {
    setState(() => _memuat = true);
    var masterTim = await widget.deps.master.semuaTimAktif();
    if (masterTim.isEmpty) {
      try {
        await widget.deps.master.segarkan(widget.sesi, modul: const ['tim']);
        masterTim = await widget.deps.master.semuaTimAktif();
      } catch (_) {/* tetap pakai fallback */}
    }
    Map<String, List<Map<String, dynamic>>>? perTim;
    String? pesan;
    final yandalF = _muatYandal(); // v0.99.0: paralel dengan laporan ROW / Hartek
    try {
      perTim = RingkasTim.perTim(await widget.deps.laporan.laporanHariIni(widget.sesi));
    } on ApiException catch (e) {
      pesan = e.kode.startsWith('HTTP_') ? 'Tidak ada sinyal. Status hari ini belum bisa dimuat.' : KodeError.pesan(e.kode);
    } catch (_) {
      pesan = 'Tidak ada sinyal. Status hari ini belum bisa dimuat.';
    }
    final y = await yandalF;
    if (!mounted) return;
    setState(() {
      _tim = _susunTim(masterTim, perTim);
      _perTim = perTim;
      _pesan = pesan;
      if (y.lap != null) _yandal = y.lap;
      _pesanYandal = y.pesan;
      _memuat = false;
    });
    if (beriTahu && mounted) tampilPesan(context, pesan ?? 'Status tim diperbarui.');
  }

  /// v0.99.0: laporan semua tim YANDAL hari ini (tanggal operasional sekarang). Gagal = pesan, tidak menahan tim lain.
  Future<({LaporanYandal? lap, String? pesan})> _muatYandal() async {
    try {
      return (lap: await _repoYandal.muat(widget.sesi), pesan: null);
    } on ApiException catch (e) {
      return (lap: null, pesan: e.kode.startsWith('HTTP_') ? 'Tidak ada sinyal. Status login Yandal belum bisa dimuat.' : KodeError.pesan(e.kode));
    } catch (_) {
      return (lap: null, pesan: 'Tidak ada sinyal. Status login Yandal belum bisa dimuat.');
    }
  }

  /// Teks + warna badge tile YANDAL: status login shift yang sedang berjalan.
  ({String teks, Color warna, Color latar}) _infoYandal(Map<String, dynamic> t) {
    final lap = _yandal;
    if (lap == null) return (teks: _pesanYandal == null ? '...' : 'Offline', warna: AppColors.neutral700, latar: AppColors.neutral100);
    final tim = lap.timDengan('${t['id'] ?? ''}');
    final s = tim?.shiftKe(lap.shiftSekarang);
    if (tim == null || s == null) return (teks: '-', warna: AppColors.neutral700, latar: AppColors.neutral100);
    final g = gayaLoginYandal(s.status);
    final teks = s.status == StatusLoginYandal.login
        ? 'S${s.no} · ${s.rekap.jumlahP0} P0'
        : 'S${s.no} · ${StatusLoginYandal.label(s.status)}';
    return (teks: teks, warna: g.warna, latar: g.latar);
  }

  Widget _ringkasYandal() {
    final r = _yandal?.ringkas;
    if (r == null) {
      if (_pesanYandal == null) return const SizedBox.shrink();
      return Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(12)),
        child: Text(_pesanYandal!, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.red700)),
      );
    }
    final semua = r.belumLogin == 0;
    final warna = semua ? AppColors.success700 : AppColors.red700;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: semua ? AppColors.success100 : AppColors.red100, borderRadius: BorderRadius.circular(12)),
      child: Row(children: [
        Icon(semua ? Icons.how_to_reg_rounded : Icons.person_off_outlined, size: 20, color: warna),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            'Shift ${r.shift} (${r.jam}): ${r.sudahLogin} dari ${r.jumlahTim} tim sudah login'
            '${semua ? '' : ' · ${r.belumLogin} belum login'}',
            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: warna),
          ),
        ),
      ]),
    );
  }

  List<Map<String, dynamic>>? _laporanUntuk(Map<String, dynamic> t) {
    final p = _perTim;
    if (p == null) return null;
    final id = '${t['id'] ?? ''}';
    if (p.containsKey(id)) return p[id];
    if ('${t['jenis']}' == 'HARTEK') {
      final semuaH = <Map<String, dynamic>>[
        for (final daftar in p.values)
          for (final l in daftar)
            if ('${l['jenisTim'] ?? ''}'.toUpperCase() == 'HARTEK') l,
      ];
      return semuaH;
    }
    return const [];
  }

  @override
  Widget build(BuildContext context) {
    final tgl = DateFormat('EEEE, d MMMM y', 'id_ID').format(DateTime.now());
    Widget isi;
    if (_memuat && _tim.isEmpty) {
      isi = const SisiLoading(pesan: 'Memuat tim...', ukuran: 60);
    } else {
      final timRow = _tim.where((t) => '${t['jenis']}' == 'ROW').toList();
      final timYandal = _tim.where((t) => '${t['jenis']}' == 'YANDAL').toList();
      final timLain = _tim.where((t) => '${t['jenis']}' != 'ROW' && '${t['jenis']}' != 'YANDAL').toList();
      isi = ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 12, 16, 40), children: [
        if (_pesan != null)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              const Icon(Icons.info_outline_rounded, size: 18, color: AppColors.red700),
              const SizedBox(width: 8),
              Expanded(child: Text(_pesan!, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.red700))),
            ]),
          ),
        if (timRow.isNotEmpty) ...[
          const Text('TIM ROW',
              style: TextStyle(fontSize: 11, letterSpacing: 1.1, fontWeight: FontWeight.w900, color: AppColors.cyan600)),
          const SizedBox(height: 10),
          GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: .82,
            children: [
              for (final t in timRow)
                _TileTimLogo(
                  tim: t,
                  r: RingkasTim(_laporanUntuk(t)),
                  onTap: () => _buka(t),
                ),
            ],
          ),
          const SizedBox(height: 20),
        ],
        // v0.99.0: tim YANDAL (status login shift berjalan, ketuk = laporan P0 per shift)
        if (timYandal.isNotEmpty) ...[
          const Text('TIM YANDAL',
              style: TextStyle(fontSize: 11, letterSpacing: 1.1, fontWeight: FontWeight.w900, color: AppColors.cyan600)),
          const SizedBox(height: 10),
          _ringkasYandal(),
          GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: .82,
            children: [
              for (final t in timYandal)
                _TileTimLogo(
                  tim: t,
                  r: RingkasTim(null),
                  infoKustom: _infoYandal(t),
                  onTap: () => _buka(t),
                ),
            ],
          ),
          const SizedBox(height: 20),
        ],
        const Text('TIM HARTEK & INSPEKSI',
            style: TextStyle(fontSize: 11, letterSpacing: 1.1, fontWeight: FontWeight.w900, color: AppColors.cyan600)),
        const SizedBox(height: 10),
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: .82,
          children: [
            for (final t in timLain)
              _TileTimLogo(
                tim: t,
                r: RingkasTim(_laporanUntuk(t)),
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
    final jenis = '${t['jenis'] ?? 'ROW'}'.toUpperCase();
    final siap = t['siap'] == true;
    if (!siap) {
      await _infoSegera(t);
      return;
    }
    if (jenis == 'YANDAL') {
      await Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => LaporanYandalTimScreen(deps: widget.deps, sesi: widget.sesi, tim: t, awal: _yandal),
        ),
      );
      if (mounted) await _muat();
      return;
    }
    if (jenis == 'HARTEK') {
      await Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => _LayarLaporanHartekAdmin(
            deps: widget.deps,
            sesi: widget.sesi,
            tim: t,
            awal: _laporanUntuk(t),
          ),
        ),
      );
      if (mounted) await _muat();
      return;
    }
    await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => TimScreen(deps: widget.deps, sesi: widget.sesi, tim: t)));
    if (mounted) await _muat();
  }

  Future<void> _infoSegera(Map<String, dynamic> t) {
    final (ikon, warna) = _gayaJenis('${t['jenis']}');
    return showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(color: warna.withValues(alpha: .12), shape: BoxShape.circle),
            child: Icon(ikon, color: warna, size: 32),
          ),
          const SizedBox(height: 12),
          Text('${t['nama']}', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.navy900)),
          const SizedBox(height: 6),
          const Text('Modul tim ini segera menyusul.',
              textAlign: TextAlign.center, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: AppColors.accent700)),
          const SizedBox(height: 4),
          const Text('Laporan harian dan arsip inspeksi sedang disiapkan.',
              textAlign: TextAlign.center, style: TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
          const SizedBox(height: 18),
          SizedBox(width: double.infinity, child: FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Mengerti'))),
        ]),
      ),
    );
  }
}

(IconData, Color) _gayaJenis(String jenis) => switch (jenis.toUpperCase()) {
      'HARTEK' => (Icons.engineering_rounded, AppColors.brand700),
      'YANDAL' => (Icons.support_agent_rounded, AppColors.navy700), // v0.99.0
      'INSPEKSI_JARINGAN' => (Icons.travel_explore_rounded, AppColors.cyan600),
      'INSPEKSI_GARDU' => (Icons.electrical_services_rounded, AppColors.amber700),
      _ => (Icons.park_rounded, AppColors.success700),
    };

class _TileTimLogo extends StatelessWidget {
  const _TileTimLogo({required this.tim, required this.r, required this.onTap, this.infoKustom});
  final Map<String, dynamic> tim;
  final RingkasTim r;
  final VoidCallback onTap;

  /// v0.99.0: badge bawah khusus (tim YANDAL: status login shift berjalan). null = dari [r].
  final ({String teks, Color warna, Color latar})? infoKustom;

  @override
  Widget build(BuildContext context) {
    final jenis = '${tim['jenis'] ?? 'ROW'}'.toUpperCase();
    final siap = tim['siap'] == true;
    final (ikon, warna) = _gayaJenis(jenis);
    String infoBawah() {
      if (!siap) return 'Segera';
      if (infoKustom != null) return infoKustom!.teks;
      if (r.offline) return 'Offline';
      if (jenis == 'HARTEK') {
        final pk = (r.laporan ?? const []).fold<int>(0, (a, l) => a + (((l['total'] as Map?)?['pekerjaan'] as num?)?.toInt() ?? 0));
        return r.adaLaporan ? '$pk pek' : 'Belum lapor';
      }
      return r.adaLaporan ? 'R${r.rabas} S${r.sedang} B${r.besar}' : r.label;
    }

    final (warnaBadge, latarBadge) = !siap
        ? (AppColors.accent700, AppColors.accent100)
        : (infoKustom != null ? (infoKustom!.warna, infoKustom!.latar) : (r.warna, r.latar));

    return Material(
      color: Colors.white,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: AppColors.neutral200)),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 12, 8, 10),
          child: Column(children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: warna.withValues(alpha: .12), shape: BoxShape.circle),
              child: Icon(ikon, color: warna, size: 23),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: Text('${tim['nama']}',
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.navy900, height: 1.2)),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(color: latarBadge, borderRadius: BorderRadius.circular(999)),
              child: Text(
                infoBawah(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: warnaBadge),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Layar pantau laporan harian Hartek untuk Admin dari menu Laporan per Tim.
class _LayarLaporanHartekAdmin extends StatefulWidget {
  const _LayarLaporanHartekAdmin({required this.deps, required this.sesi, required this.tim, this.awal});
  final Deps deps;
  final Sesi sesi;
  final Map<String, dynamic> tim;
  final List<Map<String, dynamic>>? awal;

  @override
  State<_LayarLaporanHartekAdmin> createState() => _LayarLaporanHartekAdminState();
}

class _LayarLaporanHartekAdminState extends State<_LayarLaporanHartekAdmin> {
  late List<Map<String, dynamic>>? _daftar = widget.awal;
  bool _memuat = false;
  String? _pesan;

  Future<void> _muat() async {
    setState(() => _memuat = true);
    try {
      final semua = await widget.deps.laporan.laporanHariIni(widget.sesi);
      if (!mounted) return;
      setState(() {
        _daftar = semua.where((l) => '${l['jenisTim'] ?? ''}'.toUpperCase() == 'HARTEK').toList();
        _pesan = null;
        _memuat = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _pesan = KodeError.pesan(e.kode);
          _memuat = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _pesan = 'Tidak ada sinyal.';
          _memuat = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _daftar ?? const [];
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar('${widget.tim['nama']}', subjudul: 'Tim Hartek • ULP ${widget.sesi.ulp}', actions: [
        TombolSegarkan(sibuk: _memuat, onPressed: () => unawaited(_muat())),
      ]),
      body: RefreshIndicator(
        onRefresh: _muat,
        child: d.isEmpty
            ? bisaDitarik(SisiKosong(
                ikon: Icons.engineering_outlined,
                judul: 'Belum ada laporan Hartek hari ini',
                pesan: _pesan ?? 'Tim Hartek belum membuat Laporan Utama hari ini.',
              ))
            : ListView(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 40),
                children: [
                  for (final l in d) _kartuHartek(l),
                ],
              ),
      ),
    );
  }

  Widget _kartuHartek(Map<String, dynamic> l) {
    final t = (l['total'] as Map?) ?? const {};
    final objek = mapsHartek(l['objek']);
    final siap = l['siapKirim'] == true;
    final teksWa = siap
        ? waTeksHartek(
            kodeHeader: '${l['kodeHeader'] ?? ''}',
            tanggal: '${l['tanggal'] ?? ''}',
            tim: '${l['subTim'] ?? 'HARTEK'}',
            ulp: widget.sesi.ulp,
            header: {
              'koordinatAwal': l['koordinatAwal'] ?? '',
              'koordinatAkhir': l['koordinatAkhir'] ?? '',
              'kmAwal': l['kmAwal'] ?? '',
              'kmAkhir': l['kmAkhir'] ?? '',
              'kendala': l['kendala'] ?? '',
            },
            objek: objek,
          )
        : '';
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral200)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text('${l['kodeHeader'] ?? 'Laporan Hartek'}',
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy900)),
          ),
          siap
              ? const StatusBadge('SIAP WA', warna: AppColors.success700, latar: AppColors.success100, ikon: Icons.check_circle_outline)
              : const StatusBadge('PROSES', warna: AppColors.accent700, latar: AppColors.accent100, ikon: Icons.hourglass_bottom_rounded),
        ]),
        const SizedBox(height: 6),
        Text(
          'Jaringan ${t['jaringan'] ?? 0} • Gardu ${t['gardu'] ?? 0} • Non-Teknik ${t['nonTeknik'] ?? 0} • Total ${t['pekerjaan'] ?? 0} pekerjaan',
          style: const TextStyle(fontSize: 12, color: AppColors.neutral700),
        ),
        const SizedBox(height: 4),
        Text(
            'KM: ${l['kmAwal'] ?? '-'} s.d. ${l['kmAkhir'] ?? '-'} • ${t['lokasi'] ?? 0} lokasi • ${t['material'] ?? 0} material'
            '${(t['grounding'] as int? ?? 0) > 0 ? ' • ${t['grounding']} grounding' : ''}'
            '${(t['pemerataan'] as int? ?? 0) > 0 ? ' • ${t['pemerataan']} pemerataan' : ''}',
            style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
        if (teksWa.isNotEmpty) ...[
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => unawaited(tampilkanWa(context, judul: 'Laporan WA Hartek', teks: teksWa)),
                icon: const Icon(Icons.visibility_outlined, size: 18),
                label: const Text('Lihat / Kirim WA'),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.outlined(tooltip: 'Salin WA', onPressed: () => unawaited(salinWa(context, teksWa)), icon: const Icon(Icons.copy_rounded)),
          ]),
        ],
      ]),
    );
  }
}
