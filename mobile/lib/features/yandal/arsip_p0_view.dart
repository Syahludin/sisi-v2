import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/sisi_widgets.dart';
import 'p0_model.dart' show teksMenit;
import 'yandal_arsip_repository.dart';
import '../../widgets/refresh_sisi.dart';

/// v0.63.5 (keputusan Master Guswan 8 Okt 2026): tab Arsip P0, mirip Arsip ROW. Download shift tim sendiri yang sudah
/// selesai untuk rentang tanggal (sampai hari ini), disimpan di HP, lalu ditampilkan:
/// kartu tahun > kartu bulan > kartu tanggal > kartu shift > (ketuk) daftar P0. Melihat arsip bisa offline.
class ArsipP0View extends StatefulWidget {
  const ArsipP0View({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  @override
  State<ArsipP0View> createState() => ArsipP0ViewState();
}

class ArsipP0ViewState extends State<ArsipP0View> {
  static const _maksHari = 366;
  late DateTimeRange _rentang;
  List<Map<String, dynamic>> _lokal = const [];
  bool _siap = false;
  ({int selesai, int total, DateTime bulan})? _unduh;
  String? _pesan;
  final Set<String> _buka = {}; // kunci "2026" / "2026-10" / "2026-10-08" yang terbuka

  DateTime get _hariIni => DateUtils.dateOnly(DateTime.now());

  @override
  void initState() {
    super.initState();
    final h = _hariIni;
    _rentang = DateTimeRange(start: DateTime(h.year, h.month, 1), end: h);
    unawaited(_muatLokal(bukaTerbaru: true));
  }

  Future<void> _muatLokal({bool bukaTerbaru = false}) async {
    final l = await widget.deps.yandalArsip.arsipLokal(widget.sesi.userId);
    if (!mounted) return;
    setState(() {
      _lokal = l;
      _siap = true;
      if (bukaTerbaru && l.isNotEmpty) {
        final t = '${l.first['tanggal']}';
        if (t.length >= 10) {
          _buka
            ..add(t.substring(0, 4))
            ..add(t.substring(0, 7))
            ..add(t);
        }
      }
    });
  }

  /// Refresh tab (tarik layar / tombol kanan atas): download ulang rentang yang dipilih.
  Future<void> segarkan() => _download();

  Future<void> _download() async {
    if (_unduh != null) return;
    setState(() {
      _pesan = null;
      _unduh = (selesai: 0, total: 0, bulan: _rentang.start);
    });
    try {
      final n = await widget.deps.yandalArsip.unduhArsip(widget.sesi, dari: _rentang.start, sampai: _rentang.end,
          progres: (s, t, b) {
            if (mounted) setState(() => _unduh = (selesai: s, total: t, bulan: b));
          });
      _buka.clear();
      await _muatLokal(bukaTerbaru: true);
      if (mounted) {
        if (n == 0) {
          tampilPesan(context, 'Tidak ada shift di rentang ini.');
        } else {
          unawaited(tampilPopupBerhasil(context, judul: 'Arsip P0 berhasil didownload', keterangan: '$n shift tersimpan di HP'));
        }
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _pesan = e.kode.startsWith('HTTP_') ? 'Download arsip butuh sinyal. Coba lagi saat online.' : KodeError.pesan(e.kode));
      }
      await _muatLokal();
    } catch (_) {
      if (mounted) setState(() => _pesan = 'Download arsip butuh sinyal. Coba lagi saat online.');
      await _muatLokal();
    } finally {
      if (mounted) setState(() => _unduh = null);
    }
  }

  Future<void> _pilihRentang() async {
    final h = _hariIni;
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(h.year - 2, 1, 1),
      lastDate: h,
      initialDateRange: _rentang.end.isAfter(h) ? DateTimeRange(start: h, end: h) : _rentang,
      helpText: 'Pilih rentang arsip P0',
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
        title: const Text('Hapus arsip P0 di HP?'),
        content: const Text('Hanya salinan di HP yang dihapus. Data di server tetap ada dan bisa di-download lagi.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Hapus')),
        ],
      ),
    );
    if (ok != true) return;
    await widget.deps.yandalArsip.hapusArsipLokal(widget.sesi.userId);
    _buka.clear();
    await _muatLokal();
  }

  void _toggle(String k) => setState(() {
        if (!_buka.remove(k)) _buka.add(k);
      });

  void _lihatShift(Map<String, dynamic> sh) {
    unawaited(Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ArsipShiftScreen(shift: sh))));
  }

  @override
  Widget build(BuildContext context) {
    final f = DateFormat('d MMM y', 'id_ID');
    final u = _unduh;
    final grup = kelompokArsipYandal(_lokal);
    String ringkas(Iterable<Map<String, dynamic>> l) {
      final (p0, ok, point) = jumlahRekapYandal(l);
      return '$p0 P0 · $ok approved · ${angkaPoint(point)} point';
    }

    return RefreshSisi(
      onRefresh: segarkan,
      child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 12, 16, 120), children: [
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
            onPressed: u != null ? null : () => unawaited(_download()),
            icon: const Icon(Icons.download_rounded, size: 18),
            label: const Text('Download'),
          ),
        ]),
        if (u != null) ...[
          const SizedBox(height: 12),
          LinearProgressIndicator(value: u.total == 0 ? null : u.selesai / u.total, minHeight: 6, borderRadius: BorderRadius.circular(6)),
          const SizedBox(height: 6),
          Text(
            u.total == 0 ? 'Menyiapkan download...' : 'Mengunduh ${DateFormat('MMMM y', 'id_ID').format(u.bulan)} (${u.selesai}/${u.total} bulan)',
            style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500),
          ),
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
            judul: 'Belum ada arsip P0 di HP',
            pesan: 'Pilih rentang tanggal lalu tekan Download. Shift yang masih berjalan ada di tab Shift ini.',
          )
        else ...[
          Row(children: [
            Expanded(
              child: Text('${_lokal.length} shift tersimpan di HP',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.neutral700)),
            ),
            TextButton(onPressed: u != null ? null : () => unawaited(_hapus()), child: const Text('Hapus dari HP')),
          ]),
          const SizedBox(height: 6),
          for (final th in grup.entries) ...[
            _KartuGrupP0(
              judul: th.key,
              sub: ringkas([for (final b in th.value.values) for (final t in b.values) ...t]),
              tingkat: 0,
              terbuka: _buka.contains(th.key),
              onTap: () => _toggle(th.key),
            ),
            if (_buka.contains(th.key))
              for (final bl in th.value.entries) ...[
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.only(left: 12),
                  child: _KartuGrupP0(
                    judul: DateFormat('MMMM', 'id_ID').format(DateTime.parse('${bl.key}-01')),
                    sub: ringkas([for (final t in bl.value.values) ...t]),
                    tingkat: 1,
                    terbuka: _buka.contains(bl.key),
                    onTap: () => _toggle(bl.key),
                  ),
                ),
                if (_buka.contains(bl.key))
                  for (final tg in bl.value.entries) ...[
                    const SizedBox(height: 8),
                    Padding(
                      padding: const EdgeInsets.only(left: 24),
                      child: _KartuGrupP0(
                        judul: DateFormat('EEEE, d MMM', 'id_ID').format(DateTime.parse(tg.key)),
                        sub: '${tg.value.length} shift · ${ringkas(tg.value)}',
                        tingkat: 2,
                        terbuka: _buka.contains(tg.key),
                        onTap: () => _toggle(tg.key),
                      ),
                    ),
                    if (_buka.contains(tg.key))
                      for (final sh in tg.value) ...[
                        const SizedBox(height: 8),
                        Padding(padding: const EdgeInsets.only(left: 36), child: KartuShiftArsip(shift: sh, onTap: () => _lihatShift(sh))),
                      ],
                  ],
              ],
            const SizedBox(height: 12),
          ],
        ],
      ]),
    );
  }
}

String angkaPoint(num n) => n == n.roundToDouble() ? n.toInt().toString() : n.toStringAsFixed(1);

/// Kartu tahun (0, navy) / bulan (1) / tanggal (2): judul, ringkasan, panah buka-tutup.
class _KartuGrupP0 extends StatelessWidget {
  const _KartuGrupP0({required this.judul, required this.sub, required this.tingkat, required this.terbuka, required this.onTap});
  final String judul;
  final String sub;
  final int tingkat;
  final bool terbuka;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final navy = tingkat == 0;
    final ikon = switch (tingkat) { 0 => Icons.calendar_today_rounded, 1 => Icons.calendar_month_outlined, _ => Icons.event_outlined };
    return Material(
      color: navy ? AppColors.navy700 : Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
          decoration: navy ? null : BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral200)),
          child: Row(children: [
            Icon(ikon, size: 18, color: navy ? AppColors.amber600 : AppColors.cyan600),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(judul,
                    style: TextStyle(
                        fontSize: navy ? 18 : (tingkat == 1 ? 15 : 14), fontWeight: FontWeight.w900, color: navy ? Colors.white : AppColors.navy900)),
                Text(sub, style: TextStyle(fontSize: 11.5, color: navy ? Colors.white70 : AppColors.neutral500)),
              ]),
            ),
            Icon(terbuka ? Icons.expand_less_rounded : Icons.expand_more_rounded, color: navy ? Colors.white : AppColors.neutral500),
          ]),
        ),
      ),
    );
  }
}

/// Kartu satu shift di arsip: shift, jam kerja, petugas, rekap singkat. Ketuk = daftar P0.
class KartuShiftArsip extends StatelessWidget {
  const KartuShiftArsip({super.key, required this.shift, required this.onTap});
  final Map<String, dynamic> shift;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final r = (shift['rekap'] as Map<dynamic, dynamic>?) ?? const <dynamic, dynamic>{};
    final petugas = [for (final p in (shift['petugas'] as List<dynamic>?) ?? const <dynamic>[]) '$p'];
    final sudahFinal = '${shift['rekapFinal'] ?? ''}'.isNotEmpty;
    return Material(
      color: const Color(0xFFFCFDFF),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral200)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: AppColors.cyan100, borderRadius: BorderRadius.circular(11)),
                child: Text('${shift['shift'] ?? '-'}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.navy700)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Shift ${shift['shift'] ?? '-'} · ${shift['jamKerja'] ?? ''}',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppColors.navy900)),
                  Text(petugas.isEmpty ? '-' : petugas.join(', '), style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
                ]),
              ),
              sudahFinal
                  ? const StatusBadge('FINAL', warna: AppColors.success700, latar: AppColors.success100)
                  : const StatusBadge('BELUM REKAP', warna: AppColors.neutral700, latar: AppColors.neutral100),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              _Angka('P0', '${r['jumlahP0'] ?? 0}'),
              _Angka('Approved', '${r['approved'] ?? 0}'),
              _Angka('Point', angkaPoint((r['totalPoint'] as num?) ?? 0)),
              _Angka('Efektif', '${angkaPoint((r['persenEfektif'] as num?) ?? 0)}%'),
            ]),
          ]),
        ),
      ),
    );
  }
}

class _Angka extends StatelessWidget {
  const _Angka(this.label, this.nilai);
  final String label;
  final String nilai;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(children: [
          Text(nilai, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.navy900)),
          Text(label, style: const TextStyle(fontSize: 10, color: AppColors.neutral500)),
        ]),
      );
}

/// Detail satu shift arsip: rekap lengkap + daftar P0 (status, approval, point, durasi).
class ArsipShiftScreen extends StatelessWidget {
  const ArsipShiftScreen({super.key, required this.shift});
  final Map<String, dynamic> shift;

  @override
  Widget build(BuildContext context) {
    final r = (shift['rekap'] as Map<dynamic, dynamic>?) ?? const <dynamic, dynamic>{};
    final p0 = [for (final x in (shift['p0'] as List<dynamic>?) ?? const <dynamic>[]) if (x is Map<dynamic, dynamic>) Map<String, dynamic>.from(x)];
    final petugas = [for (final p in (shift['petugas'] as List<dynamic>?) ?? const <dynamic>[]) '$p'];
    final tgl = DateTime.tryParse('${shift['tanggal']}');
    Widget baris(String l, String v) => Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Row(children: [
            SizedBox(width: 130, child: Text(l, style: const TextStyle(fontSize: 12.5, color: AppColors.neutral500))),
            Expanded(child: Text(v, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.navy900))),
          ]),
        );
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar('Shift ${shift['shift'] ?? '-'}',
          subjudul: tgl == null ? '${shift['tanggal']}' : DateFormat('EEEE, d MMMM y', 'id_ID').format(tgl)),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 40), children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral200)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${shift['kodeShift'] ?? ''}', style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
            const SizedBox(height: 8),
            baris('Jam kerja', '${shift['jamKerja'] ?? '-'}'),
            baris('Petugas', petugas.isEmpty ? '-' : petugas.join(', ')),
            baris('Check-in', '${shift['checkIn'] ?? '-'}'),
            baris('Terlambat', '${shift['terlambat'] ?? 0} menit'),
            const Divider(height: 18),
            baris('P0', '${r['jumlahP0'] ?? 0} (proses ${r['proses'] ?? 0}, selesai ${r['selesai'] ?? 0})'),
            baris('Verifikasi', 'menunggu ${r['menunggu'] ?? 0} · approved ${r['approved'] ?? 0} · rejected ${r['rejected'] ?? 0}'),
            baris('Total point', angkaPoint((r['totalPoint'] as num?) ?? 0)),
            baris('Total durasi', teksMenit(r['totalDurasi'] ?? 0)),
            baris('Jam efektif', '${angkaPoint((r['jamEfektif'] as num?) ?? 0)} jam (${angkaPoint((r['persenEfektif'] as num?) ?? 0)}%)'),
            baris('Total jarak', '${angkaPoint((r['totalJarak'] as num?) ?? 0)} km'),
            if ('${shift['rekapFinal'] ?? ''}'.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 4),
                child: Text('Rekap akhir shift belum dihitung server.', style: TextStyle(fontSize: 11.5, color: AppColors.accent700)),
              ),
          ]),
        ),
        const SizedBox(height: 16),
        Text('Penugasan P0 (${p0.length})', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy900)),
        const SizedBox(height: 8),
        if (p0.isEmpty)
          const SisiKosong(ikon: Icons.assignment_outlined, judul: 'Tidak ada P0 di shift ini.')
        else
          for (final x in p0) ...[_KartuP0Arsip(p0: x), const SizedBox(height: 10)],
      ]),
    );
  }
}

class _KartuP0Arsip extends StatelessWidget {
  const _KartuP0Arsip({required this.p0});
  final Map<String, dynamic> p0;

  @override
  Widget build(BuildContext context) {
    final ap = '${p0['statusApproval'] ?? ''}'.toLowerCase();
    final selesai = '${p0['statusP0'] ?? ''}' == 'SELESAI';
    final Widget badge = !selesai
        ? const StatusBadge('PROSES', warna: AppColors.accent700, latar: AppColors.accent100)
        : ap == 'approved'
            ? const StatusBadge('APPROVED', warna: AppColors.success700, latar: AppColors.success100)
            : ap == 'rejected'
                ? const StatusBadge('REJECTED', warna: AppColors.red700, latar: AppColors.red100)
                : const StatusBadge('MENUNGGU', warna: AppColors.navy700, latar: AppColors.navy100);
    final lokasi = [p0['penyulang'], p0['section'], p0['daerah']].map((v) => '${v ?? ''}').where((v) => v.isNotEmpty).join(' · ');
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.neutral200)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Text('${p0['namaPekerjaan'] ?? '-'}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy900)),
          ),
          badge,
        ]),
        Text('${p0['kodeP0'] ?? ''}', style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
        if (lokasi.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(lokasi, style: const TextStyle(fontSize: 12, color: AppColors.neutral700)),
        ],
        const SizedBox(height: 6),
        Text(
          '${p0['waktuSebelum'] ?? '-'}  s.d.  ${'${p0['waktuSesudah'] ?? ''}'.isEmpty ? '-' : p0['waktuSesudah']}',
          style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500),
        ),
        Text('Durasi ${teksMenit(p0['durasi'] ?? 0)} · Point ${angkaPoint((p0['point'] as num?) ?? 0)}',
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.navy900)),
        if (ap == 'rejected' && '${p0['alasanRejected'] ?? ''}'.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text('Alasan: ${p0['alasanRejected']}', style: const TextStyle(fontSize: 12, color: AppColors.red700)),
        ],
      ]),
    );
  }
}
