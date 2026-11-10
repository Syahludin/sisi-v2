import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/refresh_sisi.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/sisi_motif.dart';
import '../../widgets/wa_panel.dart';
import 'gangguan_bantu.dart';
import 'laporan_gangguan_bantu.dart';

/// v1.0.59 Laporan Gangguan Penyulang (menu OPS_LAP_GANGGUAN) di HP, sama dengan website: teks WhatsApp gangguan H-1
/// (00.00 - 23.59 kemarin, tanggal tetap) + rekap bulan berjalan. Teks disusun server (getLaporanGangguan), HP hanya
/// menampilkan, menyalin, dan mengirim ke WhatsApp. Butuh sinyal (tidak disimpan offline).
/// Review 8 Nov 2026 (desain ulang, sama dengan web): hero = tanggal laporan + tiga angka + Salin / Kirim WA; isi dipisah
/// Hari laporan / Rekap bulan / Teks WA (kartu diurai dari teks server, [uraiLaporanGangguan]). Status data hanya tampil bila
/// perlu (sinkron gagal, galat, sedang / sudah diperbarui).
class LaporanGangguanScreen extends StatelessWidget {
  const LaporanGangguanScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  static const menu = 'OPS_LAP_GANGGUAN';

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Laporan Gangguan Penyulang')),
        body: LaporanGangguanPanel(
          // segar = sinkron dari sumber + susun ulang paksa (lebih lama, beri waktu 2 menit)
          muat: (segar) =>
              deps.api.call('getLaporanGangguan', token: sesi.token, data: segar ? const {'segar': true} : const {}, timeout: const Duration(minutes: 2)),
        ),
      );
}

/// Isi layar, dipisah dari Deps supaya bisa diuji dengan [muat] palsu.
class LaporanGangguanPanel extends StatefulWidget {
  const LaporanGangguanPanel({super.key, required this.muat});
  final Future<Map<String, dynamic>> Function(bool segar) muat;

  @override
  State<LaporanGangguanPanel> createState() => _LaporanGangguanPanelState();
}

enum _Bagian { hari, bulan, wa }

/// Warna kategori, sama dengan web (PMT biru, AR Sukses hijau, AR Lockout / section oranye).
const _warna = {'pmt': Color(0xFF1769AA), 'sukses': AppColors.success600, 'lockout': Color(0xFFC95F1A)};
const _warnaTerang = {'pmt': Color(0xFF5FB3F0), 'sukses': Color(0xFF5BD69A), 'lockout': Color(0xFFF39A5B)};

class _LaporanGangguanPanelState extends State<LaporanGangguanPanel> {
  Map<String, dynamic>? _data;
  UraianLgp? _uraian;
  bool _muat = false;
  bool _segar = false;
  bool _diperbarui = false;
  String? _galat;
  _Bagian _bagian = _Bagian.hari;

  @override
  void initState() {
    super.initState();
    unawaited(_ambil(false));
  }

  Future<void> _ambil(bool segar) async {
    if (_muat) return;
    setState(() {
      _muat = true;
      _segar = segar;
      _galat = null;
      if (segar) _diperbarui = false;
    });
    try {
      final r = await widget.muat(segar);
      if (mounted) {
        setState(() {
          _data = r;
          _uraian = uraiLaporanGangguan(teksGgn(r['teks']));
          _diperbarui = segar && r['sinkronGagal'] != true;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _galat = e is ApiException && !e.kode.startsWith('HTTP_') ? KodeError.pesan(e.kode) : 'Butuh sinyal untuk Laporan Gangguan Penyulang.');
      }
    } finally {
      if (mounted) {
        setState(() {
          _muat = false;
          _segar = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    return RefreshSisi(
      onRefresh: () => _ambil(false),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        children: [
          if (d == null && _muat) const Padding(padding: EdgeInsets.symmetric(vertical: 40), child: Center(child: SisiLoader(ukuran: 36))),
          if (d == null && !_muat && _galat != null) _Pesan(teks: _galat!, warna: AppColors.red600, latar: AppColors.red100),
          if (d != null) ...[
            _hero(d),
            if (_galat != null) _Pesan(teks: '${_galat!} Yang tampil laporan dari pemuatan sebelumnya.', warna: AppColors.red700, latar: AppColors.red100),
            if (d['sinkronGagal'] == true)
              _Pesan(
                teks: 'Data gangguan belum terbaru dari sumber, kejadian terakhir mungkin belum masuk. Perbarui dulu sebelum laporan dikirim.',
                warna: AppColors.accent700,
                latar: AppColors.accent100,
                ikon: Icons.warning_amber_rounded,
                aksi: TextButton(onPressed: _muat ? null : () => unawaited(_ambil(true)), child: const Text('Coba lagi')),
              ),
            if (_diperbarui && !_muat)
              _Pesan(teks: 'Diperbarui dari sumber pukul ${_jam(d['disusunPada'])}.', warna: AppColors.success700, latar: AppColors.success100),
            const SizedBox(height: 14),
            if (_uraian != null) ...[
              _pilihBagian(_uraian!),
              const SizedBox(height: 12),
              if (_bagian == _Bagian.hari) _HariLaporan(uraian: _uraian!),
              if (_bagian == _Bagian.bulan) _RekapBulan(uraian: _uraian!),
              if (_bagian == _Bagian.wa) _TeksWa(teks: teksGgn(d['teks'])),
            ] else
              _TeksWa(teks: teksGgn(d['teks'])),
          ],
        ],
      ),
    );
  }

  static String _jam(Object? iso) {
    final t = DateTime.tryParse(teksGgn(iso));
    if (t == null) return '-';
    final w = Wib.dinding(t);
    return '${w.hour.toString().padLeft(2, '0')}.${w.minute.toString().padLeft(2, '0')}';
  }

  Widget _hero(Map<String, dynamic> d) {
    final j = d['jumlah'] is Map ? d['jumlah'] as Map : const {};
    int n(String k) => j[k] is num ? (j[k] as num).toInt() : 0;
    final teks = teksGgn(d['teks']);
    return LatarSisi(
      radius: 20,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: AppColors.accent400, borderRadius: BorderRadius.circular(99)),
            child: const Text('H-1', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w900, color: AppColors.brand950)),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(teksGgn(d['hari']), maxLines: 2, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.white, height: 1.2)),
          ),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          for (final k in KategoriLgp.semua) ...[
            if (k != KategoriLgp.semua.first) const SizedBox(width: 8),
            Expanded(child: _Kpi(nilai: n(k.kode), label: k.label, warna: _warnaTerang[k.kode]!)),
          ],
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(
            child: FilledButton.icon(
              onPressed: () => salinWa(context, teks),
              style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: AppColors.brand900),
              icon: const Icon(Icons.copy_rounded, size: 18),
              label: const Text('Salin'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: FilledButton.icon(
              onPressed: () => kirimWaLangsung(context, teks),
              style: FilledButton.styleFrom(backgroundColor: const Color(0xFF1FA855), foregroundColor: Colors.white),
              icon: const Icon(Icons.send_rounded, size: 18),
              label: const Text('Kirim WA'),
            ),
          ),
        ]),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: _muat ? null : () => unawaited(_ambil(true)),
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.white,
            disabledForegroundColor: Colors.white70,
            side: BorderSide(color: Colors.white.withValues(alpha: .3)),
          ),
          icon: _segar ? const SisiLoader(ukuran: 16) : const Icon(Icons.sync_rounded, size: 18),
          label: Text(_segar ? 'Memperbarui… (maks 2 menit)' : 'Perbarui dari sumber'),
        ),
      ]),
    );
  }

  Widget _pilihBagian(UraianLgp u) {
    Widget pil(_Bagian b, String label) {
      final aktif = _bagian == b;
      return Expanded(
        child: Semantics(
          selected: aktif,
          button: true,
          child: Material(
            color: aktif ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
            elevation: aktif ? 1 : 0,
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: () => setState(() => _bagian = b),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 9),
                child: Text(label,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: aktif ? AppColors.brand950 : AppColors.neutral700)),
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: AppColors.neutral150, borderRadius: BorderRadius.circular(12)),
      child: Row(children: [pil(_Bagian.hari, 'Hari laporan'), pil(_Bagian.bulan, 'Rekap bulan'), pil(_Bagian.wa, 'Teks WA')]),
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi({required this.nilai, required this.label, required this.warna});
  final int nilai;
  final String label;
  final Color warna;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: ColoredBox(
          color: Colors.white.withValues(alpha: .09),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(height: 3, color: warna),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 6, 8, 8),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('$nilai', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: Colors.white, height: 1.1)),
                Text(label,
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: Colors.white70)),
              ]),
            ),
          ]),
        ),
      );
}

class _Pesan extends StatelessWidget {
  const _Pesan({required this.teks, required this.warna, required this.latar, this.ikon, this.aksi});
  final String teks;
  final Color warna;
  final Color latar;
  final IconData? ikon;
  final Widget? aksi;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: 12),
        padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
        decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          if (ikon != null) ...[Icon(ikon, size: 20, color: warna), const SizedBox(width: 8)],
          Expanded(child: Text(teks, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: warna, height: 1.35))),
          if (aksi != null) aksi!,
        ]),
      );
}

/// Kartu satu kategori: garis warna kiri, judul, jumlah / NIHIL, isi.
class _KartuKategori extends StatelessWidget {
  const _KartuKategori({required this.judul, required this.warna, required this.jumlah, this.anak = const [], this.latar = Colors.white});
  final String judul;
  final Color warna;
  final int jumlah;
  final List<Widget> anak;
  final Color latar;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Material(
          color: latar,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: AppColors.neutral150)),
          clipBehavior: Clip.antiAlias,
          child: Stack(children: [
            Positioned(left: 0, top: 0, bottom: 0, child: Container(width: 4, color: warna)),
            Padding(padding: const EdgeInsets.fromLTRB(16, 12, 14, 12), child: _isi()),
          ]),
        ),
      );

  Widget _isi() => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Text(judul, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.brand950))),
          if (jumlah > 0)
            Text('$jumlah kali', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: warna))
          else
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 2),
              decoration: BoxDecoration(color: AppColors.neutral100, borderRadius: BorderRadius.circular(99)),
              child: const Text('NIHIL', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: .6, color: AppColors.neutral500)),
            ),
        ]),
        ...anak,
      ]);
}

class _HariLaporan extends StatelessWidget {
  const _HariLaporan({required this.uraian});
  final UraianLgp uraian;

  @override
  Widget build(BuildContext context) => Column(children: [
        for (final k in uraian.harian)
          _KartuKategori(judul: k.kategori.label, warna: _warna[k.kategori.kode]!, jumlah: k.jumlah, anak: [
            for (var i = 0; i < k.kejadian.length; i++)
              Container(
                margin: const EdgeInsets.only(top: 8),
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                decoration: BoxDecoration(color: AppColors.neutral50, borderRadius: BorderRadius.circular(10)),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  CircleAvatar(
                    radius: 10,
                    backgroundColor: _warna[k.kategori.kode],
                    child: Text('${i + 1}', style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w900, color: Colors.white)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(k.kejadian[i].penyulang, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.neutral900)),
                      Text(k.kejadian[i].penyebab.isEmpty ? 'Penyebab belum diisi' : k.kejadian[i].penyebab,
                          style: const TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
                    ]),
                  ),
                ]),
              ),
          ]),
      ]);
}

class _RekapBulan extends StatelessWidget {
  const _RekapBulan({required this.uraian});
  final UraianLgp uraian;

  @override
  Widget build(BuildContext context) {
    final t = uraian.tertinggi;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Padding(
        padding: const EdgeInsets.only(bottom: 8, left: 2),
        child: Text(uraian.bulanTampil, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.neutral500)),
      ),
      _KartuKategori(
        judul: 'Gangguan tertinggi',
        warna: AppColors.accent600,
        latar: AppColors.accent100,
        jumlah: t.isEmpty ? 0 : t.first.pmt + t.first.section,
        anak: [
          for (final x in t)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(children: [
                Expanded(child: Text(x.nama, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.brand950))),
                Text('PMT ${x.pmt} · Section ${x.section}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.neutral700)),
              ]),
            ),
        ],
      ),
      for (final k in uraian.rekap)
        _KartuKategori(judul: k.kategori.label, warna: _warna[k.kategori.kode]!, jumlah: k.total, anak: [
          for (final x in k.daftar) _BarisBatang(nama: x.nama, jumlah: x.jumlah, maks: k.daftar.first.jumlah, warna: _warna[k.kategori.kode]!),
        ]),
    ]);
  }
}

class _BarisBatang extends StatelessWidget {
  const _BarisBatang({required this.nama, required this.jumlah, required this.maks, required this.warna});
  final String nama;
  final int jumlah;
  final int maks;
  final Color warna;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Row(children: [
          SizedBox(
            width: 110,
            child: Text(nama, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(value: maks > 0 ? jumlah / maks : 0, minHeight: 9, color: warna, backgroundColor: AppColors.neutral100),
            ),
          ),
          SizedBox(width: 30, child: Text('$jumlah', textAlign: TextAlign.right, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800))),
        ]),
      );
}

class _TeksWa extends StatelessWidget {
  const _TeksWa({required this.teks});
  final String teks;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFFE7F7DC),
          borderRadius: const BorderRadius.only(
              topRight: Radius.circular(14), bottomLeft: Radius.circular(14), bottomRight: Radius.circular(14), topLeft: Radius.circular(4)),
          border: Border.all(color: const Color(0xFFD3ECC3)),
        ),
        child: SelectableText(teks, style: const TextStyle(fontSize: 12.5, height: 1.45, color: Color(0xFF1B2A20))),
      );
}
