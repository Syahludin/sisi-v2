import 'dart:async';

import 'package:flutter/material.dart';
import '../../core/navigasi.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import 'p0_detail_screen.dart';
import 'p0_form_screen.dart';
import 'p0_model.dart';
import 'p0_repository.dart';
import 'yandal_login.dart';

/// Warna pembeda P0: sedang dikerjakan (amber) / sudah dikerjakan (hijau).
const Color warnaProses = AppColors.amber700;
const Color latarProses = AppColors.accent100;
const Color warnaSelesai = AppColors.success700;
const Color latarSelesai = AppColors.success100;

/// v0.64.3 (keputusan kvlar 8 Okt 2026): tab "Pekerjaan Shift" hanya berisi KARTU SHIFT. Ketuk kartu = layar
/// Detail Shift (ringkasan sedang / sudah, rincian per jenis pekerjaan, kartu P0, tombol + tambah P0).
class PekerjaanShiftView extends StatefulWidget {
  const PekerjaanShiftView({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  @override
  State<PekerjaanShiftView> createState() => PekerjaanShiftViewState();
}

class PekerjaanShiftViewState extends State<PekerjaanShiftView> {
  List<P0Lokal>? _p0;

  @override
  void initState() {
    super.initState();
    unawaited(muat());
  }

  Future<void> muat() async {
    final id = P0Repository.shiftIdSesi(widget.sesi);
    final l = id == null ? <P0Lokal>[] : await widget.deps.p0.daftarShift(widget.sesi.userId, id);
    if (mounted) setState(() => _p0 = l);
  }

  /// [fokus] = SEMUA | PROSES | SELESAI: langsung ke bagian itu (angka ringkasan di kartu shift).
  Future<void> bukaDetail({String? fokus}) async {
    await Navigator.push<void>(
        context, MaterialPageRoute(builder: (_) => DetailShiftScreen(deps: widget.deps, sesi: widget.sesi, fokus: fokus)));
    await muat();
  }

  @override
  Widget build(BuildContext context) {
    final semua = _p0;
    if (semua == null) return const SisiLoading(pesan: 'Memuat pekerjaan shift...', ukuran: 70);
    final adaShift = P0Repository.shiftIdSesi(widget.sesi) != null;
    final selesai = semua.where((x) => x.selesai).length;
    return RefreshIndicator(
      onRefresh: muat,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
        children: [
          if (!adaShift)
            const SisiKosong(ikon: Icons.event_busy_rounded, judul: 'Shift tidak ditemukan', pesan: 'Keluar lalu login lagi untuk memulai shift.')
          else ...[
            KartuShiftInteraktif(
              sesi: widget.sesi,
              proses: semua.length - selesai,
              selesai: selesai,
              sekarang: widget.deps.jam.sekarang,
              onTap: () => unawaited(bukaDetail()),
              onAngka: (j) => unawaited(bukaDetail(fokus: j)),
            ),
            ...peringatanJam(widget.deps),
            const SizedBox(height: 12),
            const Row(children: [
              Icon(Icons.touch_app_rounded, size: 16, color: AppColors.neutral500),
              SizedBox(width: 6),
              Expanded(
                child: Text('Ketuk kartu shift untuk melihat rincian pekerjaan dan menambah P0.',
                    style: TextStyle(fontSize: 12, color: AppColors.neutral500)),
              ),
            ]),
          ],
        ],
      ),
    );
  }
}

/// v0.64.2: tanda jam. Waktu pekerjaan selalu jam terpercaya; ini hanya memberi tahu petugas.
List<Widget> peringatanJam(Deps deps) {
  final jam = deps.jam;
  final c = jam.cek();
  final String? pesan = !c.tervalidasi
      ? 'Jam belum tervalidasi server (HP baru restart / offline). Sambungkan internet sebentar.'
      : c.jamHpMenyimpang
          ? 'Jam HP selisih ${c.selisihHp.inMinutes.abs()} menit dari jam server. Waktu pekerjaan tetap memakai jam server.'
          : jam.waktuOtomatis == false
              ? 'Nyalakan "Tanggal & waktu otomatis" di pengaturan HP.'
              : null;
  if (pesan == null) return const [];
  return [
    const SizedBox(height: 10),
    Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(12)),
      child: Row(children: [
        const Icon(Icons.schedule_rounded, size: 18, color: AppColors.accent700),
        const SizedBox(width: 8),
        Expanded(child: Text(pesan, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.neutral900))),
      ]),
    ),
  ];
}

/// v0.64.0 -> v0.64.3: layar Detail Shift (dibuka dari kartu shift tab Pekerjaan Shift).
/// Kartu shift interaktif, ringkasan sedang / sudah dikerjakan (ketuk = saring), rincian per jenis pekerjaan
/// (ketuk = kartu P0 pekerjaan itu), daftar kartu P0, dan tombol + (selama jam shift masih berjalan).
class DetailShiftScreen extends StatefulWidget {
  const DetailShiftScreen({super.key, required this.deps, required this.sesi, this.fokus});
  final Deps deps;
  final Sesi sesi;
  final String? fokus; // v0.64.7: SEMUA | PROSES | SELESAI (dibuka dari angka ringkasan)

  @override
  State<DetailShiftScreen> createState() => DetailShiftScreenState();
}

class DetailShiftScreenState extends State<DetailShiftScreen> {
  List<P0Lokal>? _p0;
  String? _saring; // null = semua | PROSES | SELESAI
  bool _fokusAwal = false;
  // v0.64.7: bagian Rincian / Progress / Selesai bisa dilipat; kunci untuk gulir ke bagian yang diketuk di ringkasan
  final Map<String, bool> _buka = {'RINCIAN': true, 'PROSES': true, 'SELESAI': true};
  final Map<String, GlobalKey> _kunciBagian = {'RINCIAN': GlobalKey(), 'PROSES': GlobalKey(), 'SELESAI': GlobalKey()};

  @override
  void initState() {
    super.initState();
    unawaited(muat());
  }

  Future<void> muat() async {
    final id = P0Repository.shiftIdSesi(widget.sesi);
    final l = id == null ? <P0Lokal>[] : await widget.deps.p0.daftarShift(widget.sesi.userId, id);
    if (!mounted) return;
    setState(() => _p0 = l);
    final f = widget.fokus;
    if (f != null && !_fokusAwal) {
      _fokusAwal = true;
      fokus(f);
    }
  }

  /// Gulir ke bagian SEMUA (rincian) / PROSES / SELESAI dan buka lipatannya.
  void fokus(String jenis) {
    final k = jenis == 'SEMUA' ? 'RINCIAN' : jenis;
    if (!_kunciBagian.containsKey(k)) return;
    final l = _p0 ?? const <P0Lokal>[];
    final ada = k == 'RINCIAN' ? l.isNotEmpty : l.any((x) => (k == 'SELESAI') == x.selesai);
    if (!ada) {
      tampilPesan(context, k == 'RINCIAN' ? 'Belum ada P0 di shift ini.' : k == 'PROSES' ? 'Tidak ada P0 progress.' : 'Belum ada P0 selesai.');
      return;
    }
    setState(() {
      _buka[k] = true;
      if (k != 'RINCIAN' && _saring != null && _saring != k) _saring = null;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final c = _kunciBagian[k]?.currentContext;
      if (c != null && c.mounted) unawaited(Scrollable.ensureVisible(c, duration: const Duration(milliseconds: 350), alignment: .02));
    });
  }

  void _lipat(String k) => setState(() => _buka[k] = !(_buka[k] ?? true));

  /// Tombol + : form P0 baru, lalu langsung ke detail (ambil foto Sebelum).
  Future<void> tambah() async {
    final baru = await bukaForm<P0Lokal>(
        context, MaterialPageRoute(builder: (_) => FormP0Screen(deps: widget.deps, sesi: widget.sesi)));
    if (baru != null) unawaited(widget.deps.syncCtl.sinkron().then((_) => muat())); // v0.65.0: P0 baru langsung dikirim
    await muat();
    if (baru != null && mounted) await buka(baru);
  }

  Future<void> buka(P0Lokal x) async {
    await Navigator.push<void>(context, MaterialPageRoute(builder: (_) => P0DetailScreen(deps: widget.deps, sesi: widget.sesi, p0Id: x.id)));
    await muat();
  }

  Future<void> _bukaKelompok(KelompokP0 k) async {
    await Navigator.push<void>(context,
        MaterialPageRoute(builder: (_) => P0KelompokScreen(deps: widget.deps, sesi: widget.sesi, nama: k.nama)));
    await muat();
  }

  void _toggleSaring(String s) => setState(() => _saring = _saring == s ? null : s);

  bool get _bolehTambah => !widget.sesi.habisShift(widget.deps.jam.sekarang()) && P0Repository.shiftIdSesi(widget.sesi) != null;

  @override
  Widget build(BuildContext context) {
    final y = widget.sesi.yandal ?? const <String, dynamic>{};
    final sh = (y['shift'] as Map<dynamic, dynamic>?) ?? const <dynamic, dynamic>{};
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar('Pekerjaan Shift', subjudul: '${widget.sesi.timNama} • Shift ${sh['no'] ?? '-'}'),
      body: _isi(),
      floatingActionButton: !_bolehTambah
          ? null
          : FloatingActionButton(tooltip: 'Tambah P0', onPressed: () => unawaited(tambah()), child: const Icon(Icons.add_rounded)),
    );
  }

  Widget _isi() {
    final semua = _p0;
    if (semua == null) return const SisiLoading(pesan: 'Memuat pekerjaan shift...', ukuran: 70);
    final proses = semua.where((x) => !x.selesai).toList();
    final selesai = semua.where((x) => x.selesai).toList();
    final kelompok = kelompokP0(semua);
    // v0.64.7: SingleChildScrollView (bukan ListView) supaya semua bagian terbangun dan bisa digulir ke tujuan.
    return RefreshIndicator(
      onRefresh: muat,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          KartuShiftInteraktif(
              sesi: widget.sesi, proses: proses.length, selesai: selesai.length, sekarang: widget.deps.jam.sekarang, onAngka: fokus),
          ...peringatanJam(widget.deps),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(
              child: _KotakRingkas(
                judul: 'Progress',
                jumlah: proses.length,
                ikon: Icons.timelapse_rounded,
                warna: warnaProses,
                latar: latarProses,
                aktif: _saring == 'PROSES',
                onTap: () => _toggleSaring('PROSES'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _KotakRingkas(
                judul: 'Sudah dikerjakan',
                jumlah: selesai.length,
                ikon: Icons.task_alt_rounded,
                warna: warnaSelesai,
                latar: latarSelesai,
                aktif: _saring == 'SELESAI',
                onTap: () => _toggleSaring('SELESAI'),
              ),
            ),
          ]),
          const SizedBox(height: 18),
          if (semua.isEmpty)
            SisiKosong(
              ikon: Icons.post_add_rounded,
              judul: 'Belum ada P0 di shift ini',
              pesan: _bolehTambah ? 'Tekan + di kanan bawah untuk menambah Penugasan P0.' : 'Jam shift sudah berakhir.',
            )
          else ...[
            _Judul('Rincian pekerjaan', 'per jenis pekerjaan',
                key: _kunciBagian['RINCIAN'], chip: true, buka: _buka['RINCIAN'], onTap: () => _lipat('RINCIAN')),
            if (_buka['RINCIAN'] ?? true) ...[
              const SizedBox(height: 8),
              for (final k in kelompok) ...[_KartuKelompok(k: k, onTap: () => unawaited(_bukaKelompok(k))), const SizedBox(height: 8)],
            ],
            if (_saring != 'SELESAI' && proses.isNotEmpty) ...[
              const SizedBox(height: 10),
              _Judul('Progress', '${proses.length} P0',
                  key: _kunciBagian['PROSES'], warna: warnaProses, buka: _buka['PROSES'], onTap: () => _lipat('PROSES')),
              if (_buka['PROSES'] ?? true) ...[
                const SizedBox(height: 8),
                for (final x in proses) ...[KartuP0(p0: x, onTap: () => unawaited(buka(x))), const SizedBox(height: 8)],
              ],
            ],
            if (_saring != 'PROSES' && selesai.isNotEmpty) ...[
              const SizedBox(height: 10),
              _Judul('Sudah dikerjakan', '${selesai.length} P0',
                  key: _kunciBagian['SELESAI'], warna: warnaSelesai, buka: _buka['SELESAI'], onTap: () => _lipat('SELESAI')),
              if (_buka['SELESAI'] ?? true) ...[
                const SizedBox(height: 8),
                for (final x in selesai) ...[KartuP0(p0: x, onTap: () => unawaited(buka(x))), const SizedBox(height: 8)],
              ],
            ],
          ],
        ]),
      ),
    );
  }
}

/// Judul bagian. v0.64.7: [chip] = keterangan berupa chip kecil; [buka] diisi = bisa dilipat (ketuk judul).
class _Judul extends StatelessWidget {
  const _Judul(this.judul, this.sub, {super.key, this.warna = AppColors.navy900, this.chip = false, this.buka, this.onTap});
  final String judul;
  final String sub;
  final Color warna;
  final bool chip;
  final bool? buka;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final isi = Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Container(width: 4, height: 18, decoration: BoxDecoration(color: warna, borderRadius: BorderRadius.circular(2))),
        const SizedBox(width: 8),
        Text(judul, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: warna)),
        const SizedBox(width: 8),
        if (chip)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(color: AppColors.neutral150, borderRadius: BorderRadius.circular(999)),
            child: Text(sub, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: AppColors.neutral700)),
          )
        else
          Text(sub, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
        const Spacer(),
        if (buka != null)
          AnimatedRotation(
            turns: buka! ? .5 : 0,
            duration: const Duration(milliseconds: 200),
            child: Icon(Icons.expand_more_rounded, color: warna),
          ),
      ]),
    );
    return onTap == null ? isi : InkWell(borderRadius: BorderRadius.circular(8), onTap: onTap, child: isi);
  }
}

/// Kartu shift: nomor shift, jam kerja, sisa waktu berjalan (diperbarui tiap 30 detik), crew, ringkas P0.
/// Ketuk = buka / tutup rincian (kode shift, jam keluar otomatis, aturan akhir shift).
/// v0.64.3: [onTap] diisi (kartu di tab Pekerjaan Shift) = ketuk membuka Detail Shift, rincian tidak dilipat di kartu.
class KartuShiftInteraktif extends StatefulWidget {
  const KartuShiftInteraktif(
      {super.key, required this.sesi, required this.proses, required this.selesai, this.sekarang = DateTime.now, this.onTap, this.onAngka});
  final Sesi sesi;
  final int proses;
  final int selesai;
  final DateTime Function() sekarang;
  final VoidCallback? onTap;

  /// v0.64.7: ketuk angka ringkasan (SEMUA | PROSES | SELESAI) = ke bagian itu di Detail Shift.
  final void Function(String jenis)? onAngka;

  @override
  State<KartuShiftInteraktif> createState() => _KartuShiftInteraktifState();
}

class _KartuShiftInteraktifState extends State<KartuShiftInteraktif> {
  Timer? _t;
  bool _buka = false;

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  static String _inisial(String n) {
    final b = n.trim().split(RegExp(r'\s+')).where((x) => x.isNotEmpty).toList();
    if (b.isEmpty) return '?';
    return (b.length == 1 ? b.first.substring(0, 1) : '${b.first[0]}${b.last[0]}').toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.sesi;
    final y = s.yandal ?? const <String, dynamic>{};
    final sh = (y['shift'] as Map<dynamic, dynamic>?) ?? const <dynamic, dynamic>{};
    final sampai = s.sesiSampai;
    final k = sampai == null ? null : kemajuanShift(sampai, widget.sekarang());
    final petugas = s.petugasShift;
    Widget angka(String label, int n, Color warna, String jenis) {
      final isi = Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Column(children: [
          Text('$n', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: warna)),
          Row(mainAxisSize: MainAxisSize.min, children: [
            Text(label, style: const TextStyle(fontSize: 10.5, color: Colors.white70)),
            if (widget.onAngka != null) const Icon(Icons.chevron_right_rounded, size: 14, color: Colors.white54),
          ]),
        ]),
      );
      return Expanded(
        child: widget.onAngka == null
            ? isi
            : InkWell(borderRadius: BorderRadius.circular(10), onTap: () => widget.onAngka!(jenis), child: isi),
      );
    }
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: widget.onTap ?? () => setState(() => _buka = !_buka),
        child: Ink(
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [AppColors.navy700, AppColors.navy900], begin: Alignment.topLeft, end: Alignment.bottomRight),
            borderRadius: BorderRadius.circular(22),
            boxShadow: [BoxShadow(color: AppColors.navy900.withValues(alpha: .25), blurRadius: 14, offset: const Offset(0, 6))],
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                  width: 54,
                  height: 54,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: AppColors.amber600, borderRadius: BorderRadius.circular(16)),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Text('SHIFT', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: AppColors.navy900, letterSpacing: .8)),
                    Text('${sh['no'] ?? '-'}', style: const TextStyle(fontSize: 22, height: 1, fontWeight: FontWeight.w900, color: AppColors.navy900)),
                  ]),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(s.timNama, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: Colors.white)),
                    Text('${sh['hari'] ?? ''}, ${sh['tanggal'] ?? ''}', style: const TextStyle(fontSize: 12, color: Colors.white70)),
                    Text('${sh['jam'] ?? ''}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.accent400)),
                  ]),
                ),
                if (widget.onTap != null)
                  const Icon(Icons.chevron_right_rounded, color: Colors.white, size: 28)
                else
                  AnimatedRotation(
                    turns: _buka ? .5 : 0,
                    duration: const Duration(milliseconds: 200),
                    child: const Icon(Icons.expand_more_rounded, color: Colors.white),
                  ),
              ]),
              if (k != null) ...[
                const SizedBox(height: 14),
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: LinearProgressIndicator(
                    value: k.lewat,
                    minHeight: 8,
                    backgroundColor: Colors.white.withValues(alpha: .15),
                    color: k.sisa.inMinutes < 30 ? AppColors.red600 : AppColors.cyan600,
                  ),
                ),
                const SizedBox(height: 6),
                Row(children: [
                  Text('${(k.lewat * 100).round()}% shift berjalan', style: const TextStyle(fontSize: 11.5, color: Colors.white70)),
                  const Spacer(),
                  Text('Sisa ${teksDurasi(k.sisa)}',
                      style: TextStyle(
                          fontSize: 12.5, fontWeight: FontWeight.w800, color: k.sisa.inMinutes < 30 ? const Color(0xFFFCA5A5) : Colors.white)),
                ]),
              ],
              const SizedBox(height: 12),
              Wrap(spacing: 8, runSpacing: 6, children: [
                for (final n in petugas)
                  Container(
                    padding: const EdgeInsets.fromLTRB(4, 4, 10, 4),
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: .12), borderRadius: BorderRadius.circular(999)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      CircleAvatar(
                        radius: 12,
                        backgroundColor: AppColors.cyan600,
                        child: Text(_inisial(n), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white)),
                      ),
                      const SizedBox(width: 6),
                      Text(n, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
                    ]),
                  ),
              ]),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: .08), borderRadius: BorderRadius.circular(14)),
                child: Row(children: [
                  angka('Total P0', widget.proses + widget.selesai, Colors.white, 'SEMUA'),
                  angka('Progress', widget.proses, const Color(0xFFFCD34D), 'PROSES'),
                  angka('Selesai', widget.selesai, const Color(0xFF86EFAC), 'SELESAI'),
                ]),
              ),
              AnimatedSize(
                duration: const Duration(milliseconds: 200),
                child: !_buka || widget.onTap != null
                    ? const SizedBox(width: double.infinity)
                    : Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          if ('${y['kodeShift'] ?? ''}'.isNotEmpty)
                            Text('Kode shift: ${y['kodeShift']}', style: const TextStyle(fontSize: 12, color: Colors.white70)),
                          if (sampai != null)
                            Text('Keluar otomatis pukul ${jamWib(sampai)} WIB',
                                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.accent400)),
                        ]),
                      ),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class _KotakRingkas extends StatelessWidget {
  const _KotakRingkas({
    required this.judul,
    required this.jumlah,
    required this.ikon,
    required this.warna,
    required this.latar,
    required this.aktif,
    required this.onTap,
  });
  final String judul;
  final int jumlah;
  final IconData ikon;
  final Color warna;
  final Color latar;
  final bool aktif;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: aktif ? warna : latar,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Icon(ikon, color: aktif ? Colors.white : warna),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('$jumlah', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: aktif ? Colors.white : warna)),
                Text(judul, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: aktif ? Colors.white : AppColors.neutral700)),
              ]),
            ),
            if (aktif) const Icon(Icons.filter_alt_rounded, size: 18, color: Colors.white),
          ]),
        ),
      ),
    );
  }
}

class _KartuKelompok extends StatelessWidget {
  const _KartuKelompok({required this.k, required this.onTap});
  final KelompokP0 k;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final rasio = k.jumlah == 0 ? 0.0 : k.selesai.length / k.jumlah;
    Widget chip(String t, Color w, Color l) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(color: l, borderRadius: BorderRadius.circular(999)),
          child: Text(t, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: w)),
        );
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral200)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(k.nama, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy900))),
              Text('${k.jumlah} P0', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.neutral500)),
              const Icon(Icons.chevron_right_rounded, color: AppColors.neutral500),
            ]),
            const SizedBox(height: 6),
            Row(children: [
              if (k.proses.isNotEmpty) ...[chip('${k.proses.length} progress', warnaProses, latarProses), const SizedBox(width: 6)],
              if (k.selesai.isNotEmpty) chip('${k.selesai.length} selesai', warnaSelesai, latarSelesai),
            ]),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(value: rasio, minHeight: 5, backgroundColor: latarProses, color: warnaSelesai),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Kartu satu P0: garis warna status, nama pekerjaan, lokasi, tahap foto, durasi.
class KartuP0 extends StatelessWidget {
  const KartuP0({super.key, required this.p0, required this.onTap});
  final P0Lokal p0;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final w = p0.selesai ? warnaSelesai : warnaProses;
    final l = p0.selesai ? latarSelesai : latarProses;
    final d = p0.durasi;
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: l, width: 1.5),
          ),
          child: IntrinsicHeight(
            child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Container(width: 6, color: w),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(
                        child: Text(p0.namaTampil, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                      ),
                      StatusBadge(p0.selesai ? 'SELESAI' : 'PROGRESS', warna: w, latar: l),
                    ]),
                    Row(children: [
                      Text(p0.kodeTampil, style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
                      const SizedBox(width: 6),
                      // v0.65.0: tanda kirim ke server
                      Icon(
                        p0.errorKirim.isNotEmpty
                            ? Icons.error_outline_rounded
                            : p0.perluKirim(akhirShift: false)
                                ? Icons.cloud_upload_outlined
                                : Icons.cloud_done_rounded,
                        size: 14,
                        color: p0.errorKirim.isNotEmpty
                            ? AppColors.red600
                            : p0.perluKirim(akhirShift: false)
                                ? AppColors.neutral400
                                : AppColors.success700,
                      ),
                      if (p0.statusApproval == 'Rejected') ...[
                        const SizedBox(width: 6),
                        Text(p0.alasanRejected.isEmpty ? 'Rejected' : p0.alasanRejected,
                            style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: AppColors.red700)),
                      ],
                    ]),
                    if (p0.lokasi.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(p0.lokasi, style: const TextStyle(fontSize: 12, color: AppColors.neutral700)),
                    ],
                    const SizedBox(height: 8),
                    Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Expanded(
                        child: Wrap(spacing: 10, runSpacing: 4, children: [
                          for (final s in slotP0)
                            Row(mainAxisSize: MainAxisSize.min, children: [
                              Icon(p0.foto.containsKey(s) ? Icons.check_circle_rounded : Icons.radio_button_unchecked,
                                  size: 16, color: p0.foto.containsKey(s) ? w : AppColors.neutral300),
                              const SizedBox(width: 3),
                              Text(labelSlotP0[s]!, style: const TextStyle(fontSize: 11, color: AppColors.neutral700)),
                            ]),
                        ]),
                      ),
                      const SizedBox(width: 8),
                      Text(d == null ? p0.tahap : teksDurasi(d),
                          style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: w)),
                    ]),
                  ]),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
