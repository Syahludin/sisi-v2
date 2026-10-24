import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/sisi_widgets.dart';
import '../../widgets/wa_panel.dart';
import '../hartek/hartek_gaya.dart';
import '../hartek/hartek_store.dart' show GudangHartekSql;
import '../insjar/insjar_header.dart';
import 'arsip_tim.dart';
import '../../widgets/refresh_sisi.dart';

/// v1.0.17: pembungkus layar laporan tim (Hartek / Inspeksi Jaringan / Inspeksi Gardu) dengan pil "Hari ini | Arsip",
/// pola sama dengan Laporan Harian ROW.
/// v1.0.17: + pil "Kalender" (kalender tim) kalau [kalender] diisi.
class LaporanTimDenganArsip extends StatefulWidget {
  const LaporanTimDenganArsip({super.key, required this.hariIni, required this.arsip});
  final Widget hariIni, arsip;

  @override
  State<LaporanTimDenganArsip> createState() => _LaporanTimDenganArsipState();
}

class _LaporanTimDenganArsipState extends State<LaporanTimDenganArsip> {
  int _tab = 0;

  Widget _pill(String label, IconData ikon, int i) {
    final aktif = _tab == i;
    return Expanded(
      child: Semantics(
        button: true,
        selected: aktif,
        child: GestureDetector(
          onTap: () => setState(() => _tab = i),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(vertical: 9),
            decoration: BoxDecoration(color: aktif ? AppColors.navy700 : Colors.transparent, borderRadius: BorderRadius.circular(999)),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(ikon, size: 16, color: aktif ? Colors.white : AppColors.neutral700),
              const SizedBox(width: 6),
              Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: aktif ? Colors.white : AppColors.neutral700)),
            ]),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Column(children: [
        SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(color: AppColors.neutral150, borderRadius: BorderRadius.circular(999)),
              child: Row(children: [
                _pill('Hari ini', Icons.today_rounded, 0),
                _pill('Arsip', Icons.inventory_2_outlined, 1),
              ]),
            ),
          ),
        ),
        Expanded(
          child: MediaQuery.removePadding(
            context: context,
            removeTop: true,
            child: IndexedStack(index: _tab, children: [widget.hariIni, widget.arsip]),
          ),
        ),
      ]);
}

/// v1.0.17: tab Arsip modul tim (pola ArsipView ROW): pilih rentang (sampai kemarin), Download per bulan dengan progres,
/// simpan di HP, kartu tahun > bulan > hari, tiap hari = Lihat Rincian + Kirim WA. Arsip yang sudah diunduh bisa
/// dibuka tanpa sinyal.
class ArsipTimView extends StatefulWidget {
  const ArsipTimView({super.key, required this.deps, required this.sesi, required this.modul});
  final Deps deps;
  final Sesi sesi;
  final ModulArsipTim modul;

  @override
  State<ArsipTimView> createState() => _ArsipTimViewState();
}

class _ArsipTimViewState extends State<ArsipTimView> {
  static const _maksHari = 366;
  late final SimpananArsipTim _simpanan = SimpananArsipTim(GudangHartekSql(widget.deps.db));
  late DateTimeRange _rentang;
  List<Map<String, dynamic>> _lokal = const [];
  bool _siap = false;
  ({int selesai, int total, DateTime bulan})? _unduh;
  String? _pesan;
  final Set<String> _buka = {};

  DateTime get _kemarin {
    final k = Wib.dinding(DateTime.now());
    return DateTime(k.year, k.month, k.day).subtract(const Duration(days: 1));
  }

  @override
  void initState() {
    super.initState();
    final k = _kemarin;
    _rentang = DateTimeRange(start: DateTime(k.year, k.month, 1), end: k);
    unawaited(_muatLokal(bukaTerbaru: true));
  }

  Future<void> _muatLokal({bool bukaTerbaru = false}) async {
    final l = await _simpanan.baca(widget.modul.kode, widget.sesi.userId);
    if (!mounted) return;
    setState(() {
      _lokal = l;
      _siap = true;
      if (bukaTerbaru && l.isNotEmpty) {
        final t = '${l.first['tanggal']}';
        if (t.length >= 7) {
          _buka
            ..add(t.substring(0, 4))
            ..add(t.substring(0, 7));
        }
      }
    });
  }

  Future<void> _download() async {
    if (_unduh != null) return;
    final potongan = potonganBulanArsip(_rentang.start, _rentang.end);
    setState(() {
      _pesan = null;
      _unduh = (selesai: 0, total: potongan.length, bulan: _rentang.end);
    });
    var lokal = await _simpanan.baca(widget.modul.kode, widget.sesi.userId);
    var n = 0;
    try {
      for (var i = 0; i < potongan.length; i++) {
        final p = potongan[i];
        if (mounted) setState(() => _unduh = (selesai: i, total: potongan.length, bulan: p.dari));
        final r = await widget.deps.api.call(widget.modul.endpoint,
            token: widget.sesi.token, data: {'dari': isoArsip(p.dari), 'sampai': isoArsip(p.sampai)}, timeout: const Duration(seconds: 90));
        final baru = [
          for (final x in (r['laporan'] as List<dynamic>? ?? const <dynamic>[]))
            if (x is Map) Map<String, dynamic>.from(x),
        ];
        n += baru.length;
        lokal = SimpananArsipTim.gabung(lokal, baru, isoArsip(p.dari), isoArsip(p.sampai));
        await _simpanan.tulis(widget.modul.kode, widget.sesi.userId, lokal);
      }
      _buka.clear();
      await _muatLokal(bukaTerbaru: true);
      if (mounted) {
        if (n == 0) {
          tampilPesan(context, 'Tidak ada laporan di rentang ini.');
        } else {
          unawaited(tampilPopupBerhasil(context, judul: 'Arsip berhasil didownload', keterangan: '$n laporan tersimpan di HP'));
        }
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _pesan = e.kode.startsWith('HTTP_') ? 'Download arsip butuh sinyal. Coba lagi saat online.' : KodeError.pesan(e.kode));
      await _muatLokal();
    } catch (_) {
      if (mounted) setState(() => _pesan = 'Download arsip butuh sinyal. Coba lagi saat online.');
      await _muatLokal();
    } finally {
      if (mounted) setState(() => _unduh = null);
    }
  }

  Future<void> _pilihRentang() async {
    final k = _kemarin;
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(k.year - 2, 1, 1),
      lastDate: k,
      initialDateRange: _rentang.end.isAfter(k) ? DateTimeRange(start: k, end: k) : _rentang,
      helpText: 'Pilih rentang arsip (sampai kemarin)',
      saveText: 'Pilih',
    );
    if (r == null || !mounted) return;
    if (r.duration.inDays + 1 > _maksHari) {
      tampilPesan(context, 'Rentang maksimal 1 tahun.');
      return;
    }
    setState(() => _rentang = r);
  }

  Future<void> _hapus() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Hapus arsip di HP?'),
        content: const Text('Hanya salinan di HP yang dihapus. Data di server tetap ada dan bisa di-download lagi.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Hapus')),
        ],
      ),
    );
    if (ok != true) return;
    await _simpanan.hapus(widget.modul.kode, widget.sesi.userId);
    _buka.clear();
    await _muatLokal();
  }

  void _toggle(String k) => setState(() {
        if (!_buka.remove(k)) _buka.add(k);
      });

  List<(String, int)> _jumlahkan(List<Map<String, dynamic>> l) {
    final total = <String, int>{};
    final urut = <String>[];
    for (final x in l) {
      for (final (label, n) in widget.modul.ringkas(x)) {
        if (!total.containsKey(label)) urut.add(label);
        total[label] = (total[label] ?? 0) + n;
      }
    }
    return [for (final k in urut) (k, total[k]!)];
  }

  void _lihat(Map<String, dynamic> l) => Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => _DetailArsipTim(modul: widget.modul, sesi: widget.sesi, laporan: l),
      ));

  @override
  Widget build(BuildContext context) {
    final f = DateFormat('d MMM y', 'id_ID');
    final u = _unduh;
    final perTahun = <String, Map<String, List<Map<String, dynamic>>>>{};
    for (final l in _lokal) {
      final t = '${l['tanggal']}';
      if (t.length < 7) continue;
      perTahun.putIfAbsent(t.substring(0, 4), () => {}).putIfAbsent(t.substring(0, 7), () => []).add(l);
    }
    return Scaffold(
      backgroundColor: Colors.transparent, // v1.0.19: latar bg-sisi
      body: HalamanHeaderTetap(
        // v1.0.28: header tetap, isi bergulir
        header: HeaderInsJar(kicker: 'Arsip Laporan', judul: widget.modul.judul, sub: widget.sesi.timNama, ikon: Icons.inventory_2_outlined),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        isi: RefreshSisi(
        onRefresh: _download,
        child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 0, 16, 120), children: [
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: u != null ? null : _pilihRentang,
                icon: const Icon(Icons.date_range_outlined, size: 18),
                label: Text('${f.format(_rentang.start)} – ${f.format(_rentang.end)}', overflow: TextOverflow.ellipsis),
              ),
            ),
            const SizedBox(width: 10),
            FilledButton.icon(
              onPressed: u != null ? null : _download,
              icon: const Icon(Icons.download_rounded, size: 18),
              label: const Text('Download'),
            ),
          ]),
          if (u != null) ...[
            const SizedBox(height: 12),
            LinearProgressIndicator(value: u.total == 0 ? null : u.selesai / u.total, minHeight: 6, borderRadius: BorderRadius.circular(6)),
            const SizedBox(height: 6),
            Text('Mengunduh ${DateFormat('MMMM y', 'id_ID').format(u.bulan)} (${u.selesai}/${u.total} bulan)',
                style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
          ],
          if (_pesan != null) ...[
            const SizedBox(height: 10),
            Text(_pesan!, style: const TextStyle(fontSize: 12, color: AppColors.red700)),
          ],
          const SizedBox(height: 14),
          if (!_siap)
            const Padding(padding: EdgeInsets.only(top: 40), child: SisiLoading(pesan: 'Memuat arsip...', ukuran: 60))
          else if (_lokal.isEmpty)
            const SisiKosong(
              ikon: Icons.inventory_2_outlined,
              judul: 'Belum ada arsip di HP',
              pesan: 'Pilih rentang tanggal (sampai kemarin) lalu tekan Download.',
            )
          else ...[
            Row(children: [
              Expanded(
                child: Text('${_lokal.length} laporan tersimpan di HP',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.neutral700)),
              ),
              TextButton(onPressed: u != null ? null : _hapus, child: const Text('Hapus dari HP')),
            ]),
            const SizedBox(height: 6),
            for (final th in perTahun.entries) ...[
              _KartuGrupArsip(
                judul: th.key,
                sub: '${th.value.values.fold<int>(0, (a, b) => a + b.length)} laporan',
                total: _jumlahkan([for (final b in th.value.values) ...b]),
                besar: true,
                terbuka: _buka.contains(th.key),
                onTap: () => _toggle(th.key),
              ),
              if (_buka.contains(th.key))
                for (final bl in th.value.entries) ...[
                  const SizedBox(height: 8),
                  Padding(
                    padding: const EdgeInsets.only(left: 12),
                    child: _KartuGrupArsip(
                      judul: DateFormat('MMMM', 'id_ID').format(DateTime.parse('${bl.key}-01')),
                      sub: '${bl.value.length} laporan',
                      total: _jumlahkan(bl.value),
                      besar: false,
                      terbuka: _buka.contains(bl.key),
                      onTap: () => _toggle(bl.key),
                    ),
                  ),
                  if (_buka.contains(bl.key))
                    for (final l in bl.value) ...[
                      const SizedBox(height: 8),
                      Padding(
                        padding: const EdgeInsets.only(left: 24),
                        child: _KartuHariArsip(modul: widget.modul, sesi: widget.sesi, l: l, onLihat: () => _lihat(l)),
                      ),
                    ],
                ],
              const SizedBox(height: 12),
            ],
          ],
        ]),
      ),
      ),
    );
  }
}

class _KartuGrupArsip extends StatelessWidget {
  const _KartuGrupArsip({required this.judul, required this.sub, required this.total, required this.besar, required this.terbuka, required this.onTap});
  final String judul, sub;
  final List<(String, int)> total;
  final bool besar, terbuka;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    Widget angka(String l, int n) => Expanded(
          child: Column(children: [
            Text('$n', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: besar ? Colors.white : AppColors.navy900)),
            Text(l, textAlign: TextAlign.center, style: TextStyle(fontSize: 10, color: besar ? Colors.white70 : AppColors.neutral500)),
          ]),
        );
    return Material(
      color: besar ? AppColors.navy700 : Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
          decoration: besar ? null : BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral200)),
          child: Column(children: [
            Row(children: [
              Icon(besar ? Icons.calendar_today_rounded : Icons.calendar_month_outlined, size: 18, color: besar ? AppColors.amber600 : AppColors.cyan600),
              const SizedBox(width: 8),
              Expanded(
                child: Text(judul,
                    style: TextStyle(fontSize: besar ? 18 : 15, fontWeight: FontWeight.w900, color: besar ? Colors.white : AppColors.navy900)),
              ),
              Text(sub, style: TextStyle(fontSize: 11.5, color: besar ? Colors.white70 : AppColors.neutral500)),
              Icon(terbuka ? Icons.expand_less_rounded : Icons.expand_more_rounded, color: besar ? Colors.white : AppColors.neutral500),
            ]),
            const SizedBox(height: 8),
            Row(children: [for (final (l, n) in total) angka(l, n)]),
          ]),
        ),
      ),
    );
  }
}

class _KartuHariArsip extends StatelessWidget {
  const _KartuHariArsip({required this.modul, required this.sesi, required this.l, required this.onLihat});
  final ModulArsipTim modul;
  final Sesi sesi;
  final Map<String, dynamic> l;
  final VoidCallback onLihat;

  @override
  Widget build(BuildContext context) {
    final h = l['header'] is Map ? l['header'] as Map : const {};
    final tgl = DateTime.tryParse('${l['tanggal']}');
    return Container(
      decoration: BoxDecoration(color: const Color(0xFFFCFDFF), borderRadius: BorderRadius.circular(18), border: Border.all(color: AppColors.neutral200)),
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: AppColors.cyan100, borderRadius: BorderRadius.circular(12)),
            child: Icon(modul.ikon, color: AppColors.navy700, size: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(tgl == null ? '${l['tanggal']}' : DateFormat('EEEE, d MMM y', 'id_ID').format(tgl),
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppColors.navy900)),
              Text('${h['kodeHeader'] ?? ''}', style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
            ]),
          ),
        ]),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: AppColors.neutral100, borderRadius: BorderRadius.circular(11)),
          child: Column(children: [
            for (final (label, n) in modul.ringkas(l))
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Row(children: [
                  Expanded(child: Text(label, style: const TextStyle(fontSize: 12, color: AppColors.neutral700))),
                  Text('$n', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                ]),
              ),
          ]),
        ),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: OutlinedButton.icon(onPressed: onLihat, icon: const Icon(Icons.list_alt_rounded, size: 18), label: const Text('Lihat Rincian')),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: FilledButton.icon(
              onPressed: () => tampilkanWa(context, judul: 'WA ${h['kodeHeader'] ?? ''}', teks: modul.waTeks(l, sesi)),
              style: FilledButton.styleFrom(backgroundColor: AppColors.success600),
              icon: const Icon(Icons.send_rounded, size: 18),
              label: const Text('Kirim WA'),
            ),
          ),
        ]),
      ]),
    );
  }
}

class _DetailArsipTim extends StatelessWidget {
  const _DetailArsipTim({required this.modul, required this.sesi, required this.laporan});
  final ModulArsipTim modul;
  final Sesi sesi;
  final Map<String, dynamic> laporan;

  @override
  Widget build(BuildContext context) {
    final h = laporan['header'] is Map ? laporan['header'] as Map : const {};
    final tgl = DateTime.tryParse('${laporan['tanggal']}');
    String n(Object? v) => '${v ?? ''}'.trim().isEmpty ? '-' : '$v';
    return Scaffold(
      backgroundColor: HartekGaya.latar,
      body: SafeArea(
        child: HalamanHeaderTetap(
          // v1.0.28: header tetap, isi bergulir
          header: HeaderInsJar(
            kicker: 'Arsip ${modul.judul}',
            judul: tgl == null ? '${laporan['tanggal']}' : DateFormat('d MMMM y', 'id_ID').format(tgl),
            sub: '${h['kodeHeader'] ?? ''}',
            ikon: modul.ikon,
            aksi: [tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => Navigator.maybePop(context))],
          ),
          isi: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
          KartuHartek(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Text('Laporan Utama', style: HartekGaya.judulSeksi),
              const SizedBox(height: 6),
              Text('KM ${n(h['kmAwal'])} s.d. ${n(h['kmAkhir'])}', style: HartekGaya.sekunder),
              Text('Koordinat ${n(h['koordinatAwal'])} → ${n(h['koordinatAkhir'])}', style: HartekGaya.sekunder),
              if ('${h['kendala'] ?? ''}'.trim().isNotEmpty) Text('Kendala: ${h['kendala']}', style: HartekGaya.sekunder),
            ]),
          ),
          for (final b in modul.rincian(laporan)) ...[
            const SizedBox(height: 10),
            KartuHartek(
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text(b.judul.isEmpty ? '-' : b.judul, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
                const SizedBox(height: 4),
                for (final x in b.baris) Text(x, style: const TextStyle(fontSize: 13.5, height: 1.45, color: HartekGaya.tinta)),
              ]),
            ),
          ],
          const SizedBox(height: 14),
          WaPanel(teks: modul.waTeks(laporan, sesi)),
        ]),
        ),
      ),
    );
  }
}
