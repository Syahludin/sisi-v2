import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import 'arsip_p0_view.dart' show angkaPoint;
import 'yandal_login.dart' show inisialPetugas;
import '../../widgets/sisi_loader.dart';

/// v0.63.5 (keputusan kvlar 8 Okt 2026): Rank Yandal bulan berjalan di Beranda (akun YANDAL + admin).
/// v0.75.1 (permintaan kvlar 10 Okt 2026): tampilan baru: podium 3 besar, bilah nilai, komponen Jam / Shift / P0.
/// Rumus server (v1): Jam 55% + Shift 15% + P0 18% + VCC 12%. Point & jam hanya P0 Approved; shift = semua shift (v0.63.6). Data terakhir disimpan di HP.

/// Periode 'yyyy-MM' bulan berjalan (WIB).
String periodeYandal(DateTime t) => Wib.tanggal(t).substring(0, 7);

/// petugas_id crew shift ini (akun YANDAL).
Set<String> crewSesi(Sesi s) => {
      for (final p in (s.yandal?['petugas'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<dynamic, dynamic>>())
        '${p['petugasId'] ?? ''}',
    }..remove('');

/// Baris yang tampil di kartu: [atas] teratas, lalu crew shift ini yang tidak masuk [atas] (urutan rank).
({List<Map<String, dynamic>> atas, List<Map<String, dynamic>> crew}) barisRankTampil(List<Map<String, dynamic>> petugas, Set<String> crew,
    {int jumlah = 5}) {
  final atas = petugas.take(jumlah).toList();
  final sudah = {for (final p in atas) '${p['petugasId']}'};
  return (atas: atas, crew: [for (final p in petugas) if (crew.contains('${p['petugasId']}') && !sudah.contains('${p['petugasId']}')) p]);
}

List<Map<String, dynamic>> _daftar(Map<String, dynamic>? d) =>
    [for (final x in (d?['petugas'] as List<dynamic>?) ?? const <dynamic>[]) if (x is Map<dynamic, dynamic>) Map<String, dynamic>.from(x)];

class KartuRankYandal extends StatefulWidget {
  const KartuRankYandal({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  @override
  State<KartuRankYandal> createState() => _KartuRankYandalState();
}

class _KartuRankYandalState extends State<KartuRankYandal> {
  late final String _periode = periodeYandal(DateTime.now());
  Map<String, dynamic>? _data;
  bool _muat = false;
  String? _pesan;

  @override
  void initState() {
    super.initState();
    unawaited(_mulai());
  }

  Future<void> _mulai() async {
    final lokal = await widget.deps.yandalArsip.rankLokal(widget.sesi.userId, _periode);
    if (!mounted) return;
    setState(() => _data = lokal);
    await _segarkan();
  }

  Future<void> _segarkan() async {
    if (_muat) return;
    setState(() {
      _muat = true;
      _pesan = null;
    });
    try {
      final d = await widget.deps.yandalArsip.rank(widget.sesi, _periode);
      if (mounted) setState(() => _data = d);
    } on ApiException catch (e) {
      if (!mounted) return;
      final offline = e.kode.startsWith('HTTP_');
      setState(() => _pesan = !offline
          ? KodeError.pesan(e.kode)
          : (_data == null ? 'Rank butuh sinyal untuk dimuat.' : 'Offline: menampilkan rank terakhir di HP.'));
    } catch (_) {
      if (mounted) setState(() => _pesan = _data == null ? 'Rank butuh sinyal untuk dimuat.' : 'Offline: menampilkan rank terakhir di HP.');
    } finally {
      if (mounted) setState(() => _muat = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final semua = _daftar(_data);
    final crew = crewSesi(widget.sesi);
    final tampil = barisRankTampil(semua, crew);
    final bulan = DateFormat('MMMM y', 'id_ID').format(DateTime.parse('$_periode-01'));
    final diperbarui = DateTime.tryParse('${_data?['diperbarui'] ?? ''}');
    final sisa = tampil.atas.skip(3).toList();
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [AppColors.brand950, AppColors.brand700]),
        boxShadow: [BoxShadow(color: AppColors.brand900.withValues(alpha: .25), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 6, 4),
          child: _KepalaRank(
            bulan: bulan,
            aksi: IconButton(
              tooltip: 'Muat ulang rank',
              onPressed: _muat ? null : () => unawaited(_segarkan()),
              icon: _muat
                  ? const SisiLoader(ukuran: 18, warna: Colors.white)
                  : const Icon(Icons.refresh_rounded, color: Colors.white),
            ),
          ),
        ),
        if (_pesan != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
            child: Text(_pesan!, style: const TextStyle(fontSize: 11.5, color: AppColors.accent400)),
          ),
        if (semua.isEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 20),
            child: Text(_data == null ? (_muat ? 'Memuat rank...' : '-') : 'Belum ada petugas di rank bulan ini.',
                style: const TextStyle(fontSize: 12.5, color: Colors.white70)),
          )
        else ...[
          PodiumRank(petugas: semua.take(3).toList(), crew: crew),
          Container(
            margin: const EdgeInsets.fromLTRB(8, 0, 8, 8),
            padding: const EdgeInsets.fromLTRB(8, 8, 4, 4),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (final p in sisa) BarisRank(p: p, sorot: crew.contains('${p['petugasId']}')),
              if (tampil.crew.isNotEmpty) ...[
                const Padding(
                  padding: EdgeInsets.fromLTRB(6, 6, 0, 4),
                  child: Text('PETUGAS SHIFT INI',
                      style: TextStyle(fontSize: 10.5, letterSpacing: .8, fontWeight: FontWeight.w800, color: AppColors.neutral500)),
                ),
                for (final p in tampil.crew) BarisRank(p: p, sorot: true),
              ],
              Row(children: [
                const SizedBox(width: 6),
                Expanded(
                  child: Text(diperbarui == null ? '' : 'Diperbarui ${DateFormat('d MMM HH:mm', 'id_ID').format(diperbarui.toLocal())}',
                      style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
                ),
                TextButton.icon(
                  onPressed: () => unawaited(Navigator.push(
                      context, MaterialPageRoute<void>(builder: (_) => RankYandalScreen(data: _data!, crew: crew)))),
                  icon: const Icon(Icons.leaderboard_rounded, size: 18),
                  label: Text('Lihat semua (${semua.length})'),
                ),
              ]),
            ]),
          ),
        ],
      ]),
    );
  }
}

class _KepalaRank extends StatelessWidget {
  const _KepalaRank({required this.bulan, this.aksi});
  final String bulan;
  final Widget? aksi;

  @override
  Widget build(BuildContext context) => Row(children: [
        Container(
          width: 38,
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: AppColors.plnYellow.withValues(alpha: .18), borderRadius: BorderRadius.circular(12)),
          child: const Icon(Icons.emoji_events_rounded, color: AppColors.plnYellow),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Rank Yandal', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Colors.white)),
            Text(bulan, style: const TextStyle(fontSize: 11.5, color: Colors.white70)),
          ]),
        ),
        if (aksi != null) aksi!,
      ]);
}

const _emas = Color(0xFFFFC83D), _perak = Color(0xFFCBD5DC), _perunggu = Color(0xFFD99A5B);

Color warnaMedali(int rank) => switch (rank) { 1 => _emas, 2 => _perak, 3 => _perunggu, _ => AppColors.brand100 };

/// Podium 3 besar (urutan tampil 2 - 1 - 3), avatar inisial bercincin medali, nilai total.
class PodiumRank extends StatelessWidget {
  const PodiumRank({super.key, required this.petugas, this.crew = const <String>{}});
  final List<Map<String, dynamic>> petugas;
  final Set<String> crew;

  @override
  Widget build(BuildContext context) {
    Widget kolom(int i, double tinggi) {
      if (i >= petugas.length) return const Expanded(child: SizedBox());
      final p = petugas[i];
      final rank = (p['rank'] as num?)?.toInt() ?? i + 1;
      final warna = warnaMedali(rank);
      final besar = i == 0;
      final saya = crew.contains('${p['petugasId']}');
      return Expanded(
        child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
          if (besar) const Icon(Icons.workspace_premium_rounded, color: _emas, size: 26),
          Container(
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(shape: BoxShape.circle, color: warna),
            child: CircleAvatar(
              radius: besar ? 30 : 24,
              backgroundColor: AppColors.brand900,
              child: Text(inisialPetugas('${p['nama'] ?? ''}'),
                  style: TextStyle(fontSize: besar ? 18 : 15, fontWeight: FontWeight.w900, color: Colors.white)),
            ),
          ),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text('${p['nama'] ?? '-'}',
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Colors.white, height: 1.15)),
          ),
          Text('${p['tim'] ?? ''}', style: const TextStyle(fontSize: 10, color: Colors.white60)),
          const SizedBox(height: 6),
          Container(
            height: tinggi,
            width: double.infinity,
            margin: const EdgeInsets.symmetric(horizontal: 5),
            decoration: BoxDecoration(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
              gradient: LinearGradient(
                  begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [warna, warna.withValues(alpha: .45)]),
              border: saya ? Border.all(color: Colors.white, width: 2) : null,
            ),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Text('$rank', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: AppColors.brand950)),
              Text(angkaPoint((p['total'] as num?) ?? 0),
                  style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.brand900)),
            ]),
          ),
        ]),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [kolom(1, 70), kolom(0, 92), kolom(2, 56)]),
    );
  }
}

/// Satu baris rank: nomor, avatar, nama + tim, bilah nilai total (maks 100). [rinci] = komponen Jam / Shift / P0.
class BarisRank extends StatelessWidget {
  const BarisRank({super.key, required this.p, this.sorot = false, this.rinci = false});
  final Map<String, dynamic> p;
  final bool sorot;
  final bool rinci;

  @override
  Widget build(BuildContext context) {
    final rank = (p['rank'] as num?)?.toInt() ?? 0;
    final total = ((p['total'] as num?) ?? 0).toDouble();
    final persen = (p['persen'] as Map<dynamic, dynamic>?) ?? const <dynamic, dynamic>{};
    final medali = rank >= 1 && rank <= 3;
    double v(String k) => ((persen[k] as num?) ?? 0).toDouble();
    return Container(
      margin: const EdgeInsets.only(bottom: 6, right: 4),
      padding: const EdgeInsets.fromLTRB(8, 8, 10, 8),
      decoration: BoxDecoration(
        color: sorot ? AppColors.brand50 : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: sorot ? AppColors.brand500 : AppColors.neutral150, width: sorot ? 1.4 : 1),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          SizedBox(
            width: 26,
            child: Text('$rank',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: medali ? AppColors.accent700 : AppColors.neutral500)),
          ),
          const SizedBox(width: 4),
          Container(
            padding: const EdgeInsets.all(2),
            decoration: BoxDecoration(shape: BoxShape.circle, color: warnaMedali(rank)),
            child: CircleAvatar(
              radius: 16,
              backgroundColor: AppColors.brand800,
              child: Text(inisialPetugas('${p['nama'] ?? ''}'),
                  style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w900, color: Colors.white)),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(
                  child: Text('${p['nama'] ?? '-'}',
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                ),
                if (sorot) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(color: AppColors.brand600, borderRadius: BorderRadius.circular(99)),
                    child: const Text('Shift ini', style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: Colors.white)),
                  ),
                ],
              ]),
              const SizedBox(height: 4),
              ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: LinearProgressIndicator(
                  value: (total / 100).clamp(0, 1).toDouble(),
                  minHeight: 5,
                  backgroundColor: AppColors.neutral100,
                  color: medali ? AppColors.accent600 : AppColors.brand600,
                ),
              ),
              const SizedBox(height: 3),
              Text('${p['tim'] ?? ''}', style: const TextStyle(fontSize: 10.5, color: AppColors.neutral500)),
            ]),
          ),
          const SizedBox(width: 10),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(angkaPoint(total), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.navy900)),
            const Text('nilai', style: TextStyle(fontSize: 9.5, color: AppColors.neutral500)),
          ]),
        ]),
        if (rinci) ...[
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: _Komponen(label: 'Jam', persen: v('jam'), bawah: '${((p['menitEfektif'] as num?) ?? 0) ~/ 60} jam efektif')),
            const SizedBox(width: 6),
            Expanded(child: _Komponen(label: 'Shift', persen: v('shift'), bawah: '${p['shift'] ?? 0} shift')),
            const SizedBox(width: 6),
            Expanded(
              child: _Komponen(
                  label: 'P0', persen: v('p0'), bawah: '${angkaPoint((p['point'] as num?) ?? 0)} pt · ${p['jumlahP0'] ?? 0} P0'),
            ),
          ]),
        ],
      ]),
    );
  }
}

class _Komponen extends StatelessWidget {
  const _Komponen({required this.label, required this.persen, required this.bawah});
  final String label;
  final double persen;
  final String bawah;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
        decoration: BoxDecoration(color: AppColors.neutral50, borderRadius: BorderRadius.circular(10)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(label, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: AppColors.neutral700)),
            const Spacer(),
            Text('${angkaPoint(persen)}%', style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w900, color: AppColors.brand700)),
          ]),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: (persen / 100).clamp(0, 1).toDouble(),
              minHeight: 4,
              backgroundColor: AppColors.neutral150,
              color: AppColors.brand500,
            ),
          ),
          const SizedBox(height: 3),
          Text(bawah, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 9.5, color: AppColors.neutral500)),
        ]),
      );
}

/// Semua petugas di rank bulan ini: podium + daftar dengan komponen.
class RankYandalScreen extends StatelessWidget {
  const RankYandalScreen({super.key, required this.data, this.crew = const <String>{}});
  final Map<String, dynamic> data;
  final Set<String> crew;

  @override
  Widget build(BuildContext context) {
    final semua = _daftar(data);
    final periode = '${data['periode'] ?? ''}';
    final bulan = periode.length == 7 ? DateFormat('MMMM y', 'id_ID').format(DateTime.parse('$periode-01')) : periode;
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar('Rank Yandal', subjudul: bulan),
      body: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 40), children: [
        // v0.65.13 (permintaan kvlar 9 Okt 2026): kotak keterangan cara penilaian dihapus
        if (semua.isEmpty)
          const SisiKosong(ikon: Icons.emoji_events_outlined, judul: 'Belum ada data rank bulan ini.')
        else ...[
          Container(
            padding: const EdgeInsets.fromLTRB(0, 14, 0, 0),
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(22),
              gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [AppColors.brand950, AppColors.brand700]),
            ),
            child: Column(children: [
              Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: _KepalaRank(bulan: '${semua.length} petugas · $bulan')),
              const SizedBox(height: 8),
              PodiumRank(petugas: semua.take(3).toList(), crew: crew),
            ]),
          ),
          const SizedBox(height: 12),
          for (final p in semua) BarisRank(p: p, sorot: crew.contains('${p['petugasId']}'), rinci: true),
        ],
      ]),
    );
  }
}
