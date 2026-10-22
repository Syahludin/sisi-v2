import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/kartu_laporan_tim.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/sisi_motif.dart';
import '../../widgets/sisi_widgets.dart';
import '../../widgets/wa_panel.dart';
import 'arsip_hari_screen.dart';
import 'form_header_screen.dart';
import 'header_detail_screen.dart';
import 'ringkasan_row_screen.dart';
import 'row_model.dart';
import '../../widgets/sisi_loader.dart';

/// Laporan Harian ROW (desain laporan_row_screen lama): tab "Hari ini" (data lokal) | "Arsip" (server, rentang tanggal).
class LaporanRowScreen extends StatefulWidget {
  const LaporanRowScreen({super.key, required this.deps, required this.sesi, this.denganArsip = true});

  /// v1.0.19: false = arsip ada di tab Arsip bottom bar (pil Hari ini | Arsip tidak tampil).
  final bool denganArsip;
  final Deps deps;
  final Sesi sesi;

  @override
  State<LaporanRowScreen> createState() => _LaporanRowScreenState();
}

class _LaporanRowScreenState extends State<LaporanRowScreen> {
  int _tab = 0;
  late Future<_Data> _data;
  final _kunciArsip = GlobalKey<ArsipViewState>();
  bool _menyegarkan = false;

  @override
  void initState() {
    super.initState();
    _data = _muat();
    widget.deps.syncCtl.addListener(_ulang);
  }

  @override
  void dispose() {
    widget.deps.syncCtl.removeListener(_ulang);
    super.dispose();
  }

  void _ulang() {
    if (!mounted || widget.deps.syncCtl.sedangSync) return;
    setState(() {
      _data = _muat(); // blok, bukan arrow: arrow mengembalikan Future ke setState (error)
    });
  }

  Future<_Data> _muat() async {
    final r = widget.deps.row;
    final hariIni = Wib.tanggal(DateTime.now());
    // Hanya laporan AKTIF hari ini (1 sub-tim = 1 header per hari). Header BATAL tidak ditampilkan.
    final daftar = (await r.daftarHeader(widget.sesi.userId)).where((h) => h.tanggal == hariIni && h.aktif).toList();
    final jenis = (await widget.deps.master.jenisPekerjaan()).where((j) => j['modul'] == 'ROW').toList()
      ..sort((a, b) => ((a['urutan'] as num?) ?? 0).compareTo((b['urutan'] as num?) ?? 0));
    final ringkas = <String, _Ringkas>{};
    for (final h in daftar) {
      final real = (await r.realisasiDari(h.id)).where((x) => x.aktif).length;
      final eks = await r.jumlahEksekusi(h.id);
      final perJenis = await r.hitungJenis(h.id);
      ringkas[h.id] = _Ringkas(
        penyulang: real,
        eksekusi: eks.values.fold(0, (a, b) => a + b),
        jenis: [for (final j in jenis) (j['nama'] as String, perJenis[j['id']] ?? 0)],
        tertunda: await r.jumlahTertundaHeader(widget.sesi.userId, h.id),
      );
    }
    final kodeOk = await r.sudahTarikKode(widget.sesi.timKode, hariIni);
    return _Data(daftar, ringkas, kodeOk);
  }

  /// Refresh menu Laporan (v0.45): tarik layar atau tombol kanan atas, sesuai tab yang terbuka.
  ///  - Hari ini: kirim data tertunda + tarik kode + status WA dari server (sinkron), lalu muat ulang kartu.
  ///  - Arsip: download ulang rentang yang sedang dipilih dari server, lalu muat ulang.
  /// v1.0.16: tab WO ROW dihapus (WO tim sudah punya tab WO sendiri di bottom bar).
  Future<void> _segarkan() async {
    if (_menyegarkan) return;
    setState(() => _menyegarkan = true);
    try {
      switch (_tab) {
        case 0:
          await _segarkanHariIni();
        default:
          await _kunciArsip.currentState?.segarkan();
      }
    } finally {
      if (mounted) setState(() => _menyegarkan = false);
    }
  }

  Future<void> _segarkanHariIni() async {
    final ctl = widget.deps.syncCtl;
    await ctl.sinkron();
    if (!mounted) return;
    setState(() {
      _data = _muat();
    });
    await _data;
    if (!mounted) return;
    tampilPesan(context, ctl.online == false ? 'Tidak ada sinyal. Menampilkan data di HP.' : 'Laporan hari ini diperbarui.');
  }

  Future<void> _tambah(_Data d) async {
    if (d.header.isNotEmpty) {
      await _buka(d.header.first);
      return;
    }
    if (!d.kodeOk) {
      tampilPesan(context, 'Kode hari ini belum ditarik. Sambungkan internet lalu tekan Sinkron.');
      return;
    }
    final h = await Navigator.push<RowHeader>(
        context, MaterialPageRoute(builder: (_) => FormHeaderScreen(deps: widget.deps, sesi: widget.sesi)));
    if (h != null && mounted) await _buka(h);
  }

  /// v0.90.0: kartu laporan tim (pola sama dengan Hartek dan kartu shift Yandal). Ketuk = ringkasan detail,
  /// pensil = ubah header, + = tambah penyulang.
  Widget _kartu(RowHeader h, _Ringkas r) {
    final ubah = widget.sesi.bisaUbah('ROW_EKSEKUSI') && h.aktif;
    final catatan = h.alasan != null && h.alasan!.isNotEmpty
        ? KodeError.alasanSinkron(h.alasan)
        : switch (h.sinkron) {
            'LOKAL' => 'Belum terkirim ke server. Dikirim otomatis saat ada sinyal.',
            'KONFLIK' => 'Perlu dicek di Masalah Sinkron.',
            'DITOLAK' => 'Ditolak server. Buka Masalah Sinkron.',
            _ => h.kurangUntukWa.isEmpty ? null : 'Belum diisi: ${h.kurangUntukWa.join(', ').toLowerCase()}.',
          };
    return KartuLaporanTim(
      judul: h.kode,
      sub: DateFormat('EEEE, d MMM y', 'id_ID').format(DateTime.parse(h.tanggal)),
      ikon: Icons.forest_rounded,
      kmAwal: h.kmAwal,
      kmAkhir: h.kmAkhir,
      koordinatAwal: h.koordinatAwal,
      koordinatAkhir: h.koordinatAkhir,
      // v1.0.16: seragam dengan kartu Hartek / Inspeksi: angka per jenis + total bisa diketuk (ringkasan), ketuk KM /
      // koordinat = ubah data perjalanan, ikon status kirim di baris bawah.
      angka: [
        for (final j in r.jenis) AngkaRingkas(labelJenisRow(j.$1), j.$2, onTap: () => _ringkasan(h)),
        AngkaRingkas('Total Eksekusi', r.eksekusi, onTap: () => _ringkasan(h)),
      ],
      onTapNilai: ubah ? (_) => _ubahHeader(h) : null,
      catatan: catatan,
      bawahKiri: Row(children: [
        Icon(
          h.sinkron == 'KONFLIK' || h.sinkron == 'DITOLAK'
              ? Icons.error_outline_rounded
              : h.sinkron == 'LOKAL'
                  ? Icons.cloud_upload_outlined
                  : Icons.cloud_done_rounded,
          size: 16,
          color: h.sinkron == 'KONFLIK' || h.sinkron == 'DITOLAK'
              ? AppColors.red100
              : h.sinkron == 'LOKAL'
                  ? AppColors.accent400
                  : const Color(0xFF4ADE80),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text('${r.penyulang} penyulang · ${r.eksekusi} eksekusi',
              maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: Colors.white70)),
        ),
      ]),
      onTap: () => _ringkasan(h),
      onUbah: ubah ? () => _ubahHeader(h) : null,
      tampilWa: true,
      // v1.0.17 (sinkron atomik): SIAP WA server baru dipakai sesudah semua data laporan ini diterima server
      waSiap: h.waSiap && r.tertunda == 0,
      onKirimWa: () {
        if (h.waSiap && r.tertunda > 0) {
          tampilPesan(context, 'SiSi Sedang Proses Sinkron Data: ${r.tertunda} Data Sedang Proses Sinkron. WA tersedia sesudah semua data diterima server.');
          unawaited(widget.deps.syncCtl.sinkron());
          return;
        }
        if (h.waSiap) {
          tampilkanWa(context, judul: 'WA ${h.kode}', teks: h.waText!);
          return;
        }
        final kurang = <String>[
          ...h.kurangUntukWa,
          if (r.eksekusi == 0) 'Eksekusi pekerjaan ROW (minimal 1 eksekusi dengan foto lengkap)',
          if (h.kurangUntukWa.isEmpty && r.eksekusi > 0) 'Sinkronisasi ke server untuk membentuk teks WA',
        ];
        tampilkanWaBelumSiap(
          context,
          kurang: kurang,
          onLengkapi: ubah && h.kurangUntukWa.isNotEmpty ? () => _ubahHeader(h) : null,
        );
      },
      onTambah: ubah ? () => _buka(h, tambahPenyulang: true) : null,
      labelTambah: 'Tambah penyulang',
    );
  }

  Future<void> _ringkasan(RowHeader h) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => RingkasanRowScreen(deps: widget.deps, sesi: widget.sesi, headerId: h.id)));
    if (!mounted) return;
    setState(() {
      _data = _muat();
    });
  }

  Future<void> _ubahHeader(RowHeader h) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => FormHeaderScreen(deps: widget.deps, sesi: widget.sesi, header: h)));
    if (!mounted) return;
    setState(() {
      _data = _muat();
    });
  }

  Future<void> _buka(RowHeader h, {bool tambahPenyulang = false}) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => HeaderDetailScreen(deps: widget.deps, sesi: widget.sesi, headerId: h.id, tambahPenyulang: tambahPenyulang)));
    if (!mounted) return;
    setState(() {
      _data = _muat();
    });
  }

  Widget _pill(String label, int i) {
    final aktif = _tab == i;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _tab = i),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(color: aktif ? AppColors.navy700 : Colors.transparent, borderRadius: BorderRadius.circular(999)),
          child: Text(label,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: aktif ? Colors.white : AppColors.neutral700)),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ctl = widget.deps.syncCtl;
    return Scaffold(
      backgroundColor: Colors.transparent, // v1.0.19: latar bg-sisi
      appBar: sisiAppBar('Laporan Harian ROW', subjudul: '${widget.sesi.timNama} • ULP ${widget.sesi.ulp}', online: ctl.online, actions: [
        IconButton(
          tooltip: 'Refresh',
          onPressed: _menyegarkan || ctl.sedangSync ? null : _segarkan,
          icon: _menyegarkan || ctl.sedangSync
              ? const SisiLoader(ukuran: 20, warna: Colors.white)
              : const Icon(Icons.refresh_rounded),
        ),
      ]),
      body: Column(children: [
        if (widget.denganArsip)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(color: AppColors.neutral150, borderRadius: BorderRadius.circular(999)),
              child: Row(children: [_pill('Hari ini', 0), _pill('Arsip', 1)]), // v1.0.19: kalender hanya di Beranda
            ),
          ),
        Expanded(
          child: IndexedStack(index: _tab, children: [
            _hariIni(),
            if (widget.denganArsip) ArsipView(key: _kunciArsip, deps: widget.deps, sesi: widget.sesi),
          ]),
        ),
      ]),
      // FAB + hanya muncul kalau belum ada laporan hari ini (1 header per sub-tim per hari).
      floatingActionButton: _tab != 0
          ? null
          : FutureBuilder<_Data>(
              future: _data,
              builder: (context, snap) {
                final d = snap.data;
                if (d == null || d.header.isNotEmpty || !widget.sesi.bisaUbah('ROW_EKSEKUSI')) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(bottom: 80),
                  child: FloatingActionButton(onPressed: () => _tambah(d), child: const Icon(Icons.add_rounded)),
                );
              },
            ),
    );
  }

  Widget _hariIni() {
    return FutureBuilder<_Data>(
      future: _data,
      builder: (context, snap) {
        if (!snap.hasData) return const SisiLoading(pesan: 'Memuat data laporan...', ukuran: 70);
        final d = snap.data!;
        return RefreshIndicator(
          onRefresh: _segarkan,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
            children: [
              if (!d.kodeOk)
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(14)),
                  child: const Row(children: [
                    Icon(Icons.info_outline, color: AppColors.accent700),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text('Kode hari ini belum ditarik dari server. Butuh sinyal sekali sebelum membuat laporan baru.',
                          style: TextStyle(fontSize: 12.5, color: AppColors.neutral900)),
                    ),
                  ]),
                ),
              // v1.0.19: desain Jaringan SiSi: judul seksi bertanggal, kartu kosong dengan tombol mulai langsung
              JudulSeksiSisi('Laporan hari ini', keterangan: DateFormat('EEEE, d MMMM y', 'id_ID').format(DateTime.now())),
              if (d.header.isEmpty)
                _MulaiLaporan(
                  bisa: widget.sesi.bisaUbah('ROW_EKSEKUSI'),
                  onMulai: () => _tambah(d),
                )
              else
                for (final h in d.header) ...[
                  _kartu(h, d.ringkas[h.id]!),
                  const SizedBox(height: 12),
                ],
            ],
          ),
        );
      },
    );
  }
}

/// v1.0.19: belum ada laporan hari ini = kartu ajakan bergaya Jaringan SiSi dengan tombol Mulai laporan (sama dengan +).
class _MulaiLaporan extends StatelessWidget {
  const _MulaiLaporan({required this.bisa, required this.onMulai});
  final bool bisa;
  final VoidCallback onMulai;

  @override
  Widget build(BuildContext context) => LatarSisi(
        padding: const EdgeInsets.fromLTRB(18, 20, 18, 18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: .14),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.accent400.withValues(alpha: .7), width: 1.4),
            ),
            child: const Icon(Icons.forest_rounded, color: AppColors.accent400, size: 28),
          ),
          const SizedBox(height: 14),
          const Text('Belum ada laporan ROW hari ini',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.white)),
          const SizedBox(height: 4),
          const Text('Isi data perjalanan tim (KM + koordinat), lalu catat eksekusi rabas / tebang per penyulang.',
              style: TextStyle(fontSize: 13, height: 1.4, color: Color(0xD9FFFFFF))),
          if (bisa) ...[
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onMulai,
              style: FilledButton.styleFrom(backgroundColor: AppColors.accent400, foregroundColor: AppColors.brand950, minimumSize: const Size.fromHeight(50)),
              icon: const Icon(Icons.play_arrow_rounded),
              label: const Text('Mulai laporan hari ini', style: TextStyle(fontWeight: FontWeight.w900)),
            ),
          ],
        ]),
      );
}

class _Ringkas {
  const _Ringkas({required this.penyulang, required this.eksekusi, required this.jenis, this.tertunda = 0});
  final int penyulang;
  final int eksekusi;
  final List<(String, int)> jenis;

  /// v1.0.17 (sinkron atomik): data laporan ini yang belum diterima server (outbox + foto).
  final int tertunda;
}

class _Data {
  _Data(this.header, this.ringkas, this.kodeOk);
  final List<RowHeader> header;
  final Map<String, _Ringkas> ringkas;
  final bool kodeOk;
}

/// Ringkasan angka (panel neutral100 radius 11), dipakai kartu arsip harian.
Widget _panelRingkas(String atas, List<(String, int)> jenis) {
  return Container(
    width: double.infinity,
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(color: AppColors.neutral100, borderRadius: BorderRadius.circular(11)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(atas, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
      if (jenis.isNotEmpty) ...[
        const SizedBox(height: 6),
        for (final j in jenis)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Row(children: [
              Expanded(child: Text(j.$1, style: const TextStyle(fontSize: 12, color: AppColors.neutral700))),
              Text('${j.$2}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
            ]),
          ),
      ],
    ]),
  );
}

Widget _tombolWa(BuildContext context, {required bool siap, required String? teks, required String judul}) {
  return siap && teks != null && teks.isNotEmpty
      ? FilledButton.icon(
          onPressed: () => tampilkanWa(context, judul: judul, teks: teks),
          style: FilledButton.styleFrom(backgroundColor: AppColors.success600),
          icon: const Icon(Icons.send_rounded, size: 18),
          label: const Text('Kirim WA'),
        )
      : FilledButton.icon(onPressed: null, icon: const Icon(Icons.lock_clock_outlined, size: 18), label: const Text('Belum Siap'));
}

/// Tab Arsip (revisi 3 Okt 2026): download arsip tim sendiri untuk rentang tanggal (sampai kemarin, hari H tidak
/// termasuk), disimpan di HP, lalu ditampilkan berurutan: kartu tahun > kartu bulan > kartu harian.
/// Download per bulan (getArsipRow maks 31 hari) supaya ada progres nyata. Melihat arsip yang sudah diunduh bisa offline.
/// Tab Arsip. Dipakai juga di menu Operasi > Laporan per Tim (v0.50) dengan timId = tim yang dipilih admin.
class ArsipView extends StatefulWidget {
  const ArsipView({super.key, required this.deps, required this.sesi, this.timId});
  final Deps deps;
  final Sesi sesi;
  final String? timId;

  @override
  State<ArsipView> createState() => ArsipViewState();
}

class ArsipViewState extends State<ArsipView> {
  static const _maksHari = 366;
  late DateTimeRange _rentang;
  List<Map<String, dynamic>> _lokal = const [];
  bool _siap = false;
  ({int selesai, int total, DateTime bulan})? _unduh;
  String? _pesan;
  final Set<String> _buka = {}; // kunci tahun "2026" / bulan "2026-09" yang terbuka

  DateTime get _kemarin => DateUtils.dateOnly(DateTime.now()).subtract(const Duration(days: 1));

  @override
  void initState() {
    super.initState();
    final k = _kemarin;
    _rentang = DateTimeRange(start: DateTime(k.year, k.month, 1), end: k); // default: awal bulan s.d. kemarin
    _muatLokal(bukaTerbaru: true);
  }

  Future<void> _muatLokal({bool bukaTerbaru = false}) async {
    final l = await widget.deps.laporan.arsipLokal(widget.sesi.userId, timId: widget.timId);
    if (!mounted) return;
    setState(() {
      _lokal = l;
      _siap = true;
      if (bukaTerbaru && l.isNotEmpty) {
        final t = l.first['tanggal'] as String;
        _buka
          ..add(t.substring(0, 4))
          ..add(t.substring(0, 7));
      }
    });
  }

  /// Refresh tab Arsip (tarik layar / tombol kanan atas): download ulang rentang yang dipilih.
  Future<void> segarkan() => _download();

  Future<void> _download() async {
    if (_unduh != null) return;
    setState(() {
      _pesan = null;
      _unduh = (selesai: 0, total: 0, bulan: _rentang.start);
    });
    try {
      final n = await widget.deps.laporan.unduhArsip(widget.sesi, dari: _rentang.start, sampai: _rentang.end, timId: widget.timId,
          progres: (s, t, b) {
            if (mounted) setState(() => _unduh = (selesai: s, total: t, bulan: b));
          });
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
    final k = _kemarin;
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(k.year - 2, 1, 1),
      lastDate: k, // hari H tidak bisa dipilih
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
    await widget.deps.laporan.hapusArsipLokal(widget.sesi.userId, timId: widget.timId);
    _buka.clear();
    await _muatLokal();
  }

  void _toggle(String k) => setState(() {
        if (!_buka.remove(k)) _buka.add(k);
      });

  void _lihat(String tanggal, {String? headerId}) {
    Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => ArsipHariScreen(deps: widget.deps, sesi: widget.sesi, tanggal: tanggal, headerId: headerId, timId: widget.timId),
    ));
  }

  /// Buka pekerjaan tanggal tertentu langsung (tidak harus sudah di-download di daftar arsip).
  Future<void> _pilihTanggal() async {
    final k = _kemarin;
    final t = await showDatePicker(
      context: context,
      initialDate: k,
      firstDate: DateTime(2026, 1, 1),
      lastDate: k,
      helpText: 'Lihat pekerjaan tanggal (sampai kemarin)',
    );
    if (t == null || !mounted) return;
    _lihat(DateFormat('yyyy-MM-dd').format(t));
  }

  @override
  Widget build(BuildContext context) {
    final f = DateFormat('d MMM y', 'id_ID');
    final u = _unduh;
    // kelompokkan: tahun -> bulan -> laporan (sudah urut terbaru dulu)
    final perTahun = <String, Map<String, List<Map<String, dynamic>>>>{};
    for (final l in _lokal) {
      final t = l['tanggal'] as String;
      perTahun.putIfAbsent(t.substring(0, 4), () => {}).putIfAbsent(t.substring(0, 7), () => []).add(l);
    }
    return RefreshIndicator(
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
            onPressed: u != null ? null : _download,
            icon: const Icon(Icons.download_rounded, size: 18),
            label: const Text('Download'),
          ),
        ]),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: _pilihTanggal,
          icon: const Icon(Icons.manage_search_rounded, size: 18),
          label: const Text('Lihat pekerjaan tanggal tertentu'),
        ),
        if (u != null) ...[
          const SizedBox(height: 12),
          LinearProgressIndicator(value: u.total == 0 ? null : u.selesai / u.total, minHeight: 6, borderRadius: BorderRadius.circular(6)),
          const SizedBox(height: 6),
          Text(
            u.total == 0
                ? 'Menyiapkan download...'
                : 'Mengunduh ${DateFormat('MMMM y', 'id_ID').format(u.bulan)} (${u.selesai}/${u.total} bulan)',
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
            _KartuGrup(
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
                  child: _KartuGrup(
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
                    Padding(padding: const EdgeInsets.only(left: 24), child: _KartuArsip(l: l, onLihat: () => _lihat(l['tanggal'] as String, headerId: l['headerId'] as String?))),
                  ],
              ],
            const SizedBox(height: 12),
          ],
        ],
      ]),
    );
  }

  static (int, int, int) _jumlahkan(List<Map<String, dynamic>> l) {
    var r = 0, s = 0, b = 0;
    for (final x in l) {
      final t = (x['total'] as Map?) ?? const {};
      r += (t['rabas'] as num?)?.toInt() ?? 0;
      s += (t['sedang'] as num?)?.toInt() ?? 0;
      b += (t['besar'] as num?)?.toInt() ?? 0;
    }
    return (r, s, b);
  }
}

/// Kartu tahun / bulan: judul, jumlah laporan, total Rabas / Sedang / Besar, panah buka-tutup.
class _KartuGrup extends StatelessWidget {
  const _KartuGrup({required this.judul, required this.sub, required this.total, required this.besar, required this.terbuka, required this.onTap});
  final String judul;
  final String sub;
  final (int, int, int) total;
  final bool besar;
  final bool terbuka;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    Widget angka(String l, int n) => Expanded(
          child: Column(children: [
            Text('$n', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: besar ? Colors.white : AppColors.navy900)),
            Text(l, style: TextStyle(fontSize: 10, color: besar ? Colors.white70 : AppColors.neutral500)),
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
          decoration: besar
              ? null
              : BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral200)),
          child: Column(children: [
            Row(children: [
              Icon(besar ? Icons.calendar_today_rounded : Icons.calendar_month_outlined,
                  size: 18, color: besar ? AppColors.amber600 : AppColors.cyan600),
              const SizedBox(width: 8),
              Expanded(
                child: Text(judul,
                    style: TextStyle(fontSize: besar ? 18 : 15, fontWeight: FontWeight.w900, color: besar ? Colors.white : AppColors.navy900)),
              ),
              Text(sub, style: TextStyle(fontSize: 11.5, color: besar ? Colors.white70 : AppColors.neutral500)),
              Icon(terbuka ? Icons.expand_less_rounded : Icons.expand_more_rounded, color: besar ? Colors.white : AppColors.neutral500),
            ]),
            const SizedBox(height: 8),
            Row(children: [angka('Rabas', total.$1), angka('Sedang', total.$2), angka('Besar', total.$3)]),
          ]),
        ),
      ),
    );
  }
}

class _KartuArsip extends StatelessWidget {
  const _KartuArsip({required this.l, required this.onLihat});
  final Map<String, dynamic> l;
  final VoidCallback onLihat;

  @override
  Widget build(BuildContext context) {
    final kode = l['kodeHeader'] as String;
    final tgl = DateFormat('EEEE, d MMM y', 'id_ID').format(DateTime.parse(l['tanggal'] as String));
    final t = (l['total'] as Map?) ?? const {};
    final siap = l['siapKirim'] == true;
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFFCFDFF),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.neutral200),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: AppColors.cyan100, borderRadius: BorderRadius.circular(12)),
            child: const Icon(Icons.inventory_2_outlined, color: AppColors.navy700, size: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(tgl, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppColors.navy900)),
              Text(kode, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
            ]),
          ),
          siap
              ? const StatusBadge('SIAP WA', warna: AppColors.success700, latar: AppColors.success100)
              : const StatusBadge('TANPA WA', warna: AppColors.neutral700, latar: AppColors.neutral100),
        ]),
        const SizedBox(height: 10),
        _panelRingkas('${l['penyulang'] ?? 0} penyulang (terhitung foto lengkap)', [
          ('Rabas / Pangkas', (t['rabas'] as num?)?.toInt() ?? 0),
          ('Tebang Sedang', (t['sedang'] as num?)?.toInt() ?? 0),
          ('Tebang Besar', (t['besar'] as num?)?.toInt() ?? 0),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: onLihat,
              icon: const Icon(Icons.photo_library_outlined, size: 18),
              label: const Text('Lihat Pekerjaan'),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(child: _tombolWa(context, siap: siap, teks: l['waText'] as String?, judul: 'WA $kode')),
        ]),
      ]),
    );
  }
}
