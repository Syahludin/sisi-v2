import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import '../yandal/approval_p0_repository.dart';
import '../yandal/approval_p0_screen.dart';
import 'laporan_yandal_repository.dart';
import '../../widgets/refresh_sisi.dart';

/// Warna + ikon status login shift Yandal.
({Color warna, Color latar, IconData ikon}) gayaLoginYandal(String status) => switch (status) {
      StatusLoginYandal.login => (warna: AppColors.success700, latar: AppColors.success100, ikon: Icons.login_rounded),
      StatusLoginYandal.selesai => (warna: AppColors.brand700, latar: AppColors.brand50, ikon: Icons.task_alt_rounded),
      StatusLoginYandal.belumLogin => (warna: AppColors.red700, latar: AppColors.red100, ikon: Icons.person_off_outlined),
      StatusLoginYandal.tidakLogin => (warna: AppColors.red700, latar: AppColors.red100, ikon: Icons.block_rounded),
      _ => (warna: AppColors.neutral500, latar: AppColors.neutral100, ikon: Icons.schedule_rounded),
    };

/// Badge tahap P0 (PROSES / MENUNGGU / APPROVED / REJECTED).
StatusBadge badgeP0Yandal(String tahap) => switch (tahap) {
      'APPROVED' => const StatusBadge('APPROVED', warna: AppColors.success700, latar: AppColors.success100, ikon: Icons.verified_rounded),
      'REJECTED' => const StatusBadge('REJECTED', warna: AppColors.red700, latar: AppColors.red100, ikon: Icons.cancel_outlined),
      'MENUNGGU' => const StatusBadge('MENUNGGU', warna: AppColors.brand700, latar: AppColors.brand50, ikon: Icons.hourglass_top_rounded),
      _ => const StatusBadge('PROSES', warna: AppColors.accent700, latar: AppColors.accent100, ikon: Icons.construction_rounded),
    };

String _jamDari(String waktu) => waktu.length >= 16 ? waktu.substring(11, 16) : (waktu.isEmpty ? '-' : waktu);

String _menit(int m) => m < 60 ? '$m menit' : '${m ~/ 60} jam ${m % 60} menit';

String _angka(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(2).replaceAll('.', ',');

/// v0.99.0: Laporan satu tim YANDAL (admin): pilih tanggal operasional, 3 kartu shift berisi status login,
/// crew, check-in, HP yang masih login, riwayat login, rekap P0, dan daftar P0 (ketuk = rincian).
class LaporanYandalTimScreen extends StatefulWidget {
  const LaporanYandalTimScreen({super.key, required this.deps, required this.sesi, required this.tim, this.awal});
  final Deps deps;
  final Sesi sesi;
  final Map<String, dynamic> tim;
  final LaporanYandal? awal;

  @override
  State<LaporanYandalTimScreen> createState() => _LaporanYandalTimScreenState();
}

class _LaporanYandalTimScreenState extends State<LaporanYandalTimScreen> {
  late final LaporanYandalRepository _repo = LaporanYandalRepository(widget.deps.api);
  late LaporanYandal? _lap = widget.awal;
  String? _tanggal; // null = tanggal operasional sekarang (server)
  bool _memuat = false;
  String? _pesan;

  String get _timId => '${widget.tim['id'] ?? ''}';
  TimLaporanYandal? get _tim => _lap?.timDengan(_timId);

  @override
  void initState() {
    super.initState();
    unawaited(_muat());
  }

  Future<void> _muat({bool beriTahu = false}) async {
    setState(() => _memuat = true);
    String? pesan;
    try {
      final l = await _repo.muat(widget.sesi, tanggal: _tanggal, timId: _timId.isEmpty ? null : _timId);
      if (!mounted) return;
      setState(() => _lap = l);
    } on ApiException catch (e) {
      pesan = e.kode.startsWith('HTTP_') ? 'Tidak ada sinyal. Laporan Yandal belum bisa dimuat.' : KodeError.pesan(e.kode);
    } catch (_) {
      pesan = 'Tidak ada sinyal. Laporan Yandal belum bisa dimuat.';
    }
    if (!mounted) return;
    setState(() {
      _pesan = pesan;
      _memuat = false;
    });
    if (beriTahu) tampilPesan(context, pesan ?? 'Laporan ${widget.tim['nama']} diperbarui.');
  }

  DateTime? get _tglAktif {
    final t = _tanggal ?? _lap?.tanggal;
    return t == null || t.isEmpty ? null : DateTime.tryParse(t);
  }

  DateTime? get _tglMaks {
    final t = _lap?.tanggalSekarang ?? '';
    return t.isEmpty ? null : DateTime.tryParse(t);
  }

  void _geser(int hari) {
    final a = _tglAktif, maks = _tglMaks;
    if (a == null) return;
    final b = a.add(Duration(days: hari));
    if (maks != null && b.isAfter(maks)) return;
    if (maks != null && maks.difference(b).inDays > 31) {
      tampilPesan(context, 'Laporan Yandal maksimal 31 hari ke belakang.');
      return;
    }
    _tanggal = DateFormat('yyyy-MM-dd').format(b);
    unawaited(_muat());
  }

  Future<void> _pilihTanggal() async {
    final maks = _tglMaks ?? DateTime.now();
    final p = await showDatePicker(
      context: context,
      initialDate: _tglAktif ?? maks,
      firstDate: maks.subtract(const Duration(days: 31)),
      lastDate: maks,
      helpText: 'Tanggal operasional shift',
    );
    if (p == null || !mounted) return;
    _tanggal = DateFormat('yyyy-MM-dd').format(p);
    unawaited(_muat());
  }

  @override
  Widget build(BuildContext context) {
    final tim = _tim;
    final tgl = _tglAktif;
    final maks = _tglMaks;
    final bisaMaju = tgl != null && maks != null && tgl.isBefore(maks);
    final judulTgl = tgl == null ? 'Memuat...' : DateFormat('EEEE, d MMMM y', 'id_ID').format(tgl);
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar('${widget.tim['nama']}', subjudul: 'Tim Yandal • ULP ${widget.sesi.ulp}', actions: [
        TombolSegarkan(sibuk: _memuat, onPressed: () => unawaited(_muat(beriTahu: true))),
      ]),
      body: RefreshSisi(
        onRefresh: _muat,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.neutral200)),
              child: Row(children: [
                IconButton(tooltip: 'Hari sebelumnya', onPressed: tgl == null ? null : () => _geser(-1), icon: const Icon(Icons.chevron_left_rounded)),
                Expanded(
                  child: InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: () => unawaited(_pilihTanggal()),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Column(children: [
                        Text(judulTgl, textAlign: TextAlign.center,
                            style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                        Text(_lap?.hariIni == true ? 'Hari ini · shift ${_lap!.shiftSekarang} berjalan' : 'Ketuk untuk pilih tanggal',
                            style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
                      ]),
                    ),
                  ),
                ),
                IconButton(tooltip: 'Hari berikutnya', onPressed: bisaMaju ? () => _geser(1) : null, icon: const Icon(Icons.chevron_right_rounded)),
              ]),
            ),
            const SizedBox(height: 10),
            if (_pesan != null) _info(_pesan!, AppColors.red700, AppColors.red100),
            if (tim == null && !_memuat)
              const SisiKosong(ikon: Icons.groups_outlined, judul: 'Data tim belum tersedia', pesan: 'Tarik ke bawah untuk memuat ulang.')
            else if (tim != null) ...[
              _hero(tim),
              const SizedBox(height: 12),
              for (final s in tim.shift) ...[
                _KartuShiftYandal(shift: s, sekarang: _lap!.hariIni && s.no == _lap!.shiftSekarang, onP0: _detailP0),
                const SizedBox(height: 10),
              ],
              if (ApprovalP0Repository.boleh(widget.sesi) && tim.totalMenunggu > 0)
                FilledButton.icon(
                  onPressed: () => unawaited(Navigator.push(
                      context, MaterialPageRoute<void>(builder: (_) => ApprovalP0Screen(deps: widget.deps, sesi: widget.sesi)))),
                  icon: const Icon(Icons.verified_outlined),
                  label: Text('Buka Approval P0 (${tim.totalMenunggu} menunggu)'),
                ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _info(String teks, Color warna, Color latar) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          Icon(Icons.info_outline_rounded, size: 18, color: warna),
          const SizedBox(width: 8),
          Expanded(child: Text(teks, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: warna))),
        ]),
      );

  Widget _hero(TimLaporanYandal t) {
    final masuk = t.shift.where((s) => s.masuk).length;
    final lewat = t.shift.where((s) => s.status != StatusLoginYandal.belumMulai).length;
    final point = t.shift.fold<double>(0, (a, s) => a + s.rekap.totalPoint);
    Widget mini(String label, String nilai) => Expanded(
          child: Column(children: [
            Text(nilai, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.white)),
            Text(label, style: TextStyle(fontSize: 10.5, color: Colors.white.withValues(alpha: .8))),
          ]),
        );
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppColors.navy700, borderRadius: BorderRadius.circular(18)),
      child: Column(children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: .15), borderRadius: BorderRadius.circular(12)),
            child: const Icon(Icons.support_agent_rounded, color: AppColors.plnYellow, size: 26),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(t.nama, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Colors.white)),
              Text('${t.petugasAktif} petugas aktif · login $masuk dari $lewat shift',
                  style: TextStyle(fontSize: 11.5, color: Colors.white.withValues(alpha: .85))),
            ]),
          ),
        ]),
        const SizedBox(height: 14),
        Row(children: [
          mini('P0', '${t.totalP0}'),
          mini('Menunggu', '${t.totalMenunggu}'),
          mini('Approved', '${t.shift.fold<int>(0, (a, s) => a + s.rekap.approved)}'),
          mini('Point', _angka(point)),
        ]),
      ]),
    );
  }

  Future<void> _detailP0(P0LaporanYandal p) {
    Widget baris(String k, String v) => v.trim().isEmpty
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(width: 110, child: Text(k, style: const TextStyle(fontSize: 12, color: AppColors.neutral500))),
              Expanded(child: Text(v, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.navy900))),
            ]),
          );
    return showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (c) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Expanded(
                child: Text(p.namaPekerjaan.isEmpty ? 'P0' : p.namaPekerjaan,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.navy900)),
              ),
              badgeP0Yandal(p.tahap),
            ]),
            const SizedBox(height: 4),
            Text(p.kodeP0, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
            const SizedBox(height: 14),
            baris('Penyulang', p.penyulang),
            baris('Section', p.section),
            baris('Daerah', p.daerah),
            baris('Mulai', p.waktuSebelum),
            baris('Selesai', p.waktuSesudah),
            baris('Durasi', p.durasi > 0 ? '${_angka(p.durasi)} menit' : ''),
            baris('Jarak closing', p.jarakM > 0 ? '${p.jarakM} m' : ''),
            baris('Point', p.tahap == 'APPROVED' ? _angka(p.point) : ''),
            baris('Alasan ditolak', p.alasanRejected),
            baris('Catatan', p.catatan),
          ]),
        ),
      ),
    );
  }
}

class _KartuShiftYandal extends StatefulWidget {
  const _KartuShiftYandal({required this.shift, required this.sekarang, required this.onP0});
  final ShiftLaporanYandal shift;
  final bool sekarang;
  final Future<void> Function(P0LaporanYandal) onP0;

  @override
  State<_KartuShiftYandal> createState() => _KartuShiftYandalState();
}

class _KartuShiftYandalState extends State<_KartuShiftYandal> {
  late bool _buka = widget.sekarang || widget.shift.p0.isNotEmpty;
  bool _riwayat = false;

  @override
  Widget build(BuildContext context) {
    final s = widget.shift;
    final g = gayaLoginYandal(s.status);
    final ket = switch (s.status) {
      StatusLoginYandal.belumLogin => 'Belum login sejak ${_menit(s.menitBelumLogin)}',
      StatusLoginYandal.tidakLogin => 'Tidak ada petugas yang login di shift ini',
      StatusLoginYandal.belumMulai => 'Shift belum dimulai',
      _ => s.petugas.isEmpty ? '-' : s.petugas.join(' & '),
    };
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: widget.sekarang ? g.warna.withValues(alpha: .6) : AppColors.neutral200, width: widget.sekarang ? 1.5 : 1),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => setState(() => _buka = !_buka),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(color: g.latar, borderRadius: BorderRadius.circular(12)),
                child: Icon(g.ikon, color: g.warna),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Text('Shift ${s.no}', style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900, color: AppColors.navy900)),
                    const SizedBox(width: 6),
                    Text(s.jam, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
                    if (widget.sekarang) ...[
                      const SizedBox(width: 6),
                      const StatusBadge('BERJALAN', warna: AppColors.navy700, latar: AppColors.navy100),
                    ],
                  ]),
                  const SizedBox(height: 2),
                  Text(ket, maxLines: 2, overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: s.masuk ? AppColors.neutral700 : g.warna)),
                ]),
              ),
              StatusBadge(StatusLoginYandal.label(s.status).toUpperCase(), warna: g.warna, latar: g.latar),
              Icon(_buka ? Icons.expand_less_rounded : Icons.expand_more_rounded, color: AppColors.neutral400),
            ]),
          ),
        ),
        if (_buka && s.status != StatusLoginYandal.belumMulai) ...[
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (s.masuk) ...[
                Wrap(spacing: 8, runSpacing: 6, children: [
                  _chip(Icons.login_rounded, 'Check-in ${_jamDari(s.checkIn)}'),
                  _chip(Icons.timer_outlined, s.terlambat > 0 ? 'Terlambat ${_menit(s.terlambat)}' : 'Tepat waktu',
                      warna: s.terlambat > 0 ? AppColors.accent700 : AppColors.success700),
                  _chip(Icons.repeat_rounded, '${s.jumlahLogin}x login'),
                  if (s.status == StatusLoginYandal.login)
                    _chip(Icons.phone_android_rounded, s.hpAktif > 0 ? '${s.hpAktif} HP masih login' : 'Tidak ada HP login',
                        warna: s.hpAktif > 0 ? AppColors.success700 : AppColors.red700),
                ]),
                if (s.login.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () => setState(() => _riwayat = !_riwayat),
                      icon: Icon(_riwayat ? Icons.expand_less_rounded : Icons.history_rounded, size: 18),
                      label: Text(_riwayat ? 'Tutup riwayat login' : 'Riwayat login (${s.login.length})'),
                    ),
                  ),
                  if (_riwayat)
                    for (final l in s.login)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(children: [
                          Icon(l.aktif ? Icons.circle : Icons.circle_outlined, size: 10, color: l.aktif ? AppColors.success600 : AppColors.neutral400),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              '${_jamDari(l.waktuMasuk)} · ${l.perangkat.isEmpty ? 'HP' : l.perangkat}'
                              '${l.waktuLogout.isNotEmpty ? ' · keluar ${_jamDari(l.waktuLogout)}' : (l.aktif ? ' · masih login' : ' · sesi habis')}',
                              style: const TextStyle(fontSize: 11.5, color: AppColors.neutral700),
                            ),
                          ),
                        ]),
                      ),
                ],
                const SizedBox(height: 8),
              ],
              _rekap(s.rekap),
              if (s.p0.isNotEmpty) ...[
                const SizedBox(height: 10),
                for (final p in s.p0) _barisP0(p),
              ] else if (s.masuk)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text('Belum ada P0 di shift ini.', style: TextStyle(fontSize: 12, color: AppColors.neutral500)),
                ),
            ]),
          ),
        ],
      ]),
    );
  }

  Widget _chip(IconData ikon, String teks, {Color warna = AppColors.navy700}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(color: warna.withValues(alpha: .08), borderRadius: BorderRadius.circular(999)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(ikon, size: 13, color: warna),
          const SizedBox(width: 4),
          Text(teks, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: warna)),
        ]),
      );

  Widget _rekap(RekapP0Yandal r) {
    Widget kotak(String label, int n, Color warna) => Expanded(
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(color: warna.withValues(alpha: .08), borderRadius: BorderRadius.circular(10)),
            child: Column(children: [
              Text('$n', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: warna)),
              Text(label, style: const TextStyle(fontSize: 10, color: AppColors.neutral700)),
            ]),
          ),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        kotak('P0', r.jumlahP0, AppColors.navy700),
        const SizedBox(width: 6),
        kotak('Proses', r.proses, AppColors.accent700),
        const SizedBox(width: 6),
        kotak('Menunggu', r.menunggu, AppColors.brand700),
        const SizedBox(width: 6),
        kotak('Approved', r.approved, AppColors.success700),
        const SizedBox(width: 6),
        kotak('Rejected', r.rejected, AppColors.red700),
      ]),
      const SizedBox(height: 6),
      Text(
        'Point ${_angka(r.totalPoint)}'
        '${r.jamEfektif > 0 ? ' · efektif ${_angka(r.jamEfektif)} jam (${_angka(r.persenEfektif)}%)' : ''}'
        '${r.totalJarak > 0 ? ' · jarak ${_angka(r.totalJarak)} km' : ''}',
        style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500),
      ),
    ]);
  }

  Widget _barisP0(P0LaporanYandal p) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Material(
          color: AppColors.neutral50,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => unawaited(widget.onP0(p)),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(p.namaPekerjaan.isEmpty ? '-' : p.namaPekerjaan,
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                    Text(
                      [
                        if (p.waktuSebelum.isNotEmpty) _jamDari(p.waktuSebelum),
                        if (p.penyulang.isNotEmpty) p.penyulang,
                        if (p.section.isNotEmpty) p.section,
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11, color: AppColors.neutral500),
                    ),
                  ]),
                ),
                const SizedBox(width: 6),
                badgeP0Yandal(p.tahap),
              ]),
            ),
          ),
        ),
      );
}
