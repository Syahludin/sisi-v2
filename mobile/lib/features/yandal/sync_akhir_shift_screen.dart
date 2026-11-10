import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_loader.dart';

/// v0.63.4 (keputusan Master Guswan 8 Okt 2026): gerbang akhir shift akun YANDAL.
/// Shift sudah selesai = tidak bisa input / membuat P0 lagi (dashboard ditutup), tapi data yang sudah ada
/// (P0 selesai maupun belum) WAJIB dikirim dulu. Selesai terkirim = keluar otomatis. Offline = menunggu sinyal,
/// dicoba ulang otomatis. Lewat batas mode sync = keluar, data tetap di HP dan dikirim setelah login lagi.
class SyncAkhirShiftScreen extends StatefulWidget {
  const SyncAkhirShiftScreen({
    super.key,
    required this.hitung,
    required this.kirim,
    required this.onSelesai,
    this.syncSampai,
    this.pesan,
    this.ulangTiap = const Duration(seconds: 30),
    this.sekarang = DateTime.now,
    this.tim = '',
    this.kodeShift = '',
    this.petugas = const [],
  });

  /// Jumlah data yang belum sampai server.
  final Future<int> Function() hitung;

  /// Satu putaran kirim (outbox + foto). Error ditelan di sini; hasilnya dibaca lewat [hitung].
  final Future<void> Function() kirim;

  /// Dipanggil sekali: tertinggal = true kalau keluar karena batas mode sync habis (data masih di HP).
  final Future<void> Function(bool tertinggal) onSelesai;

  final DateTime? syncSampai;

  /// Pesan status sync terakhir (mis. "Offline. Data aman di HP...").
  final String? Function()? pesan;
  final Duration ulangTiap;
  final DateTime Function() sekarang;

  /// v0.66.4: identitas shift di header (boleh kosong).
  final String tim;
  final String kodeShift;
  final List<String> petugas;

  @override
  State<SyncAkhirShiftScreen> createState() => _SyncAkhirShiftScreenState();
}

class _SyncAkhirShiftScreenState extends State<SyncAkhirShiftScreen> with SingleTickerProviderStateMixin {
  Timer? _timer;
  late final AnimationController _denyut = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600))..repeat();
  bool _jalan = false;
  bool _selesai = false;
  int? _sisa;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => unawaited(_putaran()));
    _timer = Timer.periodic(widget.ulangTiap, (_) => unawaited(_putaran()));
  }

  @override
  void dispose() {
    _timer?.cancel();
    _denyut.dispose();
    super.dispose();
  }

  bool get _habis {
    final b = widget.syncSampai;
    return b == null || !widget.sekarang().isBefore(b);
  }

  Future<void> _akhiri(bool tertinggal) async {
    if (_selesai) return;
    _selesai = true;
    _timer?.cancel();
    await widget.onSelesai(tertinggal);
  }

  Future<void> _putaran() async {
    if (_jalan || _selesai) return;
    if (_habis) return _akhiri(true);
    setState(() => _jalan = true);
    var n = _sisa ?? 1;
    try {
      await widget.kirim();
    } catch (_) {
      // offline / server sibuk: dicoba lagi di putaran berikutnya
    }
    try {
      n = await widget.hitung();
    } catch (_) {
      // hitungan lokal gagal: anggap masih ada
    }
    if (!mounted) return;
    setState(() {
      _jalan = false;
      _sisa = n;
    });
    if (n <= 0) await _akhiri(false);
  }

  String _jam(DateTime t) {
    final w = Wib.dinding(t);
    String dua(int n) => n.toString().padLeft(2, '0');
    return '${dua(w.day)}/${dua(w.month)} ${dua(w.hour)}:${dua(w.minute)} WIB';
  }

  /// Sisa waktu kirim, mis. "22 jam 51 mnt" / "8 mnt".
  String _sisaWaktu(DateTime batas) {
    final d = batas.difference(widget.sekarang());
    if (d.isNegative) return 'habis';
    final j = d.inHours, m = d.inMinutes % 60;
    return j > 0 ? '$j jam $m mnt' : '${d.inMinutes < 1 ? 1 : d.inMinutes} mnt';
  }

  /// v0.66.4 (permintaan Master Guswan 9 Okt 2026): tampilan gerbang dibuat lebih hidup: header gradasi + ikon berdenyut,
  /// identitas shift, kartu jumlah data, tahapan (shift selesai > kirim data > keluar otomatis), batas kirim + sisa waktu.
  Widget _header() {
    final info = [widget.tim, widget.kodeShift].where((v) => v.trim().isNotEmpty).join(' · ');
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(24, 28, 24, 30),
      decoration: const BoxDecoration(
        gradient: LinearGradient(colors: [AppColors.brand950, AppColors.brand700], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(32)),
      ),
      child: SafeArea(
        bottom: false,
        child: Column(children: [
          SizedBox(
            width: 120,
            height: 120,
            child: AnimatedBuilder(
              animation: _denyut,
              builder: (context, child) {
                final t = _denyut.value;
                return Stack(alignment: Alignment.center, children: [
                  for (final geser in const [0.0, 0.5])
                    Builder(builder: (context) {
                      final v = (t + geser) % 1.0;
                      return Container(
                        width: 76 + 44 * v,
                        height: 76 + 44 * v,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: AppColors.brand500.withValues(alpha: (1 - v) * 0.6), width: 2),
                        ),
                      );
                    }),
                  child!,
                ]);
              },
              child: Container(
                width: 76,
                height: 76,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white,
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 16, offset: const Offset(0, 6))],
                ),
                child: const Icon(Icons.cloud_upload_rounded, size: 40, color: AppColors.brand700),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
            decoration: BoxDecoration(color: AppColors.plnYellow, borderRadius: BorderRadius.circular(99)),
            child: const Text('SHIFT SELESAI',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1, color: AppColors.brand950)),
          ),
          const SizedBox(height: 10),
          const Text('Kirim data shift dulu',
              textAlign: TextAlign.center, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.white)),
          if (info.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(info, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: Color(0xDDFFFFFF))),
          ],
          if (widget.petugas.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(alignment: WrapAlignment.center, spacing: 6, runSpacing: 6, children: [
              for (final p in widget.petugas)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(99)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.person_rounded, size: 14, color: Colors.white),
                    const SizedBox(width: 4),
                    Text(p, style: const TextStyle(fontSize: 11.5, color: Colors.white, fontWeight: FontWeight.w600)),
                  ]),
                ),
            ]),
          ],
        ]),
      ),
    );
  }

  Widget _tahap(int no, String judul, String ket, {required bool selesai, required bool aktif, bool akhir = false}) {
    final warna = selesai ? AppColors.success600 : (aktif ? AppColors.brand600 : AppColors.neutral300);
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Column(children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: selesai || aktif ? warna : Colors.white,
              border: Border.all(color: warna, width: 2),
            ),
            child: selesai
                ? const Icon(Icons.check_rounded, size: 16, color: Colors.white)
                : aktif && _jalan
                    ? const SisiLoader(ukuran: 14, warna: Colors.white)
                    : Text('$no', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: aktif ? Colors.white : AppColors.neutral400)),
          ),
          if (!akhir) Expanded(child: Container(width: 2, margin: const EdgeInsets.symmetric(vertical: 2), color: selesai ? AppColors.success600 : AppColors.neutral200)),
        ]),
        const SizedBox(width: 12),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(top: 3, bottom: akhir ? 0 : 14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(judul,
                  style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: selesai || aktif ? AppColors.navy900 : AppColors.neutral500)),
              const SizedBox(height: 2),
              Text(ket, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500, height: 1.35)),
            ]),
          ),
        ),
      ]),
    );
  }

  BoxDecoration get _kartu => BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.neutral150),
        boxShadow: [BoxShadow(color: AppColors.navy900.withValues(alpha: 0.05), blurRadius: 14, offset: const Offset(0, 5))],
      );

  @override
  Widget build(BuildContext context) {
    final pesan = widget.pesan?.call();
    final sisa = _sisa;
    final beres = sisa != null && sisa <= 0;
    final batas = widget.syncSampai;
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: const Color(0xFFF2F6F9),
        body: SingleChildScrollView(
          child: Column(children: [
            _header(),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 28),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Text(
                  'Jam shift sudah habis, jadi P0 baru tidak bisa dibuat lagi. Data yang sudah ada sedang dikirim ke server. '
                  'Setelah semua terkirim, akun keluar otomatis.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12.5, color: AppColors.neutral700, height: 1.45),
                ),
                const SizedBox(height: 16),
                // kartu jumlah data
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: _kartu,
                  child: Column(children: [
                    Row(children: [
                      Container(
                        width: 54,
                        height: 54,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: beres ? AppColors.success100 : AppColors.accent100,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: sisa == null
                            ? const SisiLoader(ukuran: 22)
                            : Text('$sisa',
                                style: TextStyle(
                                    fontSize: 24, fontWeight: FontWeight.w900, color: beres ? AppColors.success700 : AppColors.accent700)),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(
                            sisa == null ? 'Menghitung data...' : '$sisa data belum terkirim',
                            style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: AppColors.navy900),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            _jalan ? 'Sedang mengirim ke server...' : 'Dicoba lagi otomatis tiap ${widget.ulangTiap.inSeconds} dtk',
                            style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500),
                          ),
                        ]),
                      ),
                    ]),
                    const SizedBox(height: 12),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(99),
                      child: LinearProgressIndicator(
                        minHeight: 6,
                        value: _jalan ? null : (beres ? 1 : 0),
                        backgroundColor: AppColors.neutral100,
                        color: beres ? AppColors.success600 : AppColors.brand600,
                      ),
                    ),
                    if (pesan != null && pesan.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        decoration: BoxDecoration(color: AppColors.neutral50, borderRadius: BorderRadius.circular(10)),
                        child: Row(children: [
                          const Icon(Icons.info_outline_rounded, size: 16, color: AppColors.neutral500),
                          const SizedBox(width: 6),
                          Expanded(child: Text(pesan, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral700))),
                        ]),
                      ),
                    ],
                  ]),
                ),
                const SizedBox(height: 12),
                // tahapan
                Container(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
                  decoration: _kartu,
                  child: Column(children: [
                    _tahap(1, 'Shift selesai', 'Input dan P0 baru ditutup.', selesai: true, aktif: false),
                    _tahap(2, 'Kirim data ke server', 'P0, foto, dan switching yang masih di HP.', selesai: beres, aktif: !beres),
                    _tahap(3, 'Keluar otomatis', 'Akun keluar sendiri setelah semua terkirim.', selesai: false, aktif: beres, akhir: true),
                  ]),
                ),
                if (batas != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: _kartu,
                    child: Row(children: [
                      const Icon(Icons.schedule_rounded, color: AppColors.brand700),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('Batas kirim: ${_jam(batas)}',
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                          const Text('Lewat batas, akun keluar dan data tetap aman di HP.',
                              style: TextStyle(fontSize: 11, color: AppColors.neutral500)),
                        ]),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(color: AppColors.brand50, borderRadius: BorderRadius.circular(99)),
                        child: Text('sisa ${_sisaWaktu(batas)}',
                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.brand700)),
                      ),
                    ]),
                  ),
                ],
                const SizedBox(height: 18),
                SizedBox(
                  height: 52,
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
                    onPressed: _jalan || _selesai ? null : () => unawaited(_putaran()),
                    icon: _jalan
                        ? const SisiLoader(ukuran: 18, warna: Colors.white)
                        : const Icon(Icons.sync_rounded),
                    label: Text(_jalan ? 'Mengirim...' : 'Kirim sekarang'),
                  ),
                ),
                const SizedBox(height: 10),
                const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(Icons.signal_cellular_alt_rounded, size: 14, color: AppColors.neutral400),
                  SizedBox(width: 4),
                  Flexible(
                    child: Text('Tidak ada sinyal? Biarkan app terbuka, pengiriman dicoba lagi otomatis.',
                        textAlign: TextAlign.center, style: TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
                  ),
                ]),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}
