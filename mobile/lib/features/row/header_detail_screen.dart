import 'dart:async';

import 'package:flutter/material.dart';
import '../../core/navigasi.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import '../../widgets/wa_panel.dart';
import 'batal_row.dart';
import 'form_header_screen.dart';
import 'perbaikan_repository.dart';
import 'realisasi_screen.dart';
import 'row_model.dart';
import 'row_repository.dart';
import '../../widgets/sisi_loader.dart';

/// Detail laporan (desain lama): dua tab pill "Detail Laporan" | "Realisasi (n)", FAB "Tambah Penyulang".
class HeaderDetailScreen extends StatefulWidget {
  const HeaderDetailScreen({super.key, required this.deps, required this.sesi, required this.headerId, this.tambahPenyulang = false});
  final Deps deps;
  final Sesi sesi;
  final String headerId;

  /// v0.90.0: dibuka dari tombol + di kartu laporan = langsung ke tab Realisasi dan lembar Tambah Penyulang.
  final bool tambahPenyulang;

  @override
  State<HeaderDetailScreen> createState() => _HeaderDetailScreenState();
}

class _HeaderDetailScreenState extends State<HeaderDetailScreen> {
  int _tab = 0;
  RowHeader? _h;
  List<RowRealisasi> _real = const [];
  Map<String, int> _jumlah = const {};
  Map<String, int> _belum = const {}; // eksekusi foto belum lengkap per realisasi
  Map<String, dynamic>? _wa; // hasil getLaporanRow untuk header ini
  bool _waMuat = false;
  String? _waPesan;
  bool _menyegarkan = false;
  bool _bisaUrungkan = false;
  int _tertunda = 0; // v1.0.17 (sinkron atomik): data laporan ini yang belum diterima server

  @override
  void initState() {
    super.initState();
    unawaited(_muat().then((_) async {
      if (widget.tambahPenyulang && mounted && _bolehUbah) {
        setState(() => _tab = 1);
        await _tambahPenyulang();
      }
      await _muatWa();
    }));
    widget.deps.syncCtl.addListener(_ulang);
  }

  @override
  void dispose() {
    widget.deps.syncCtl.removeListener(_ulang);
    super.dispose();
  }

  void _ulang() {
    if (!widget.deps.syncCtl.sedangSync) unawaited(_muat().then((_) => _muatWa()));
  }

  Future<void> _muat() async {
    final r = widget.deps.row;
    final h = await r.header(widget.headerId);
    final real = await r.realisasiDari(widget.headerId);
    final j = await r.jumlahEksekusi(widget.headerId);
    final b = await r.belumLengkap(widget.headerId);
    final u = h != null && !h.aktif && await widget.deps.perbaikan.bisaUrungkan(widget.sesi.userId, 'header', h.id);
    final tunda = await r.jumlahTertundaHeader(widget.sesi.userId, widget.headerId);
    if (!mounted) return;
    setState(() {
      _bisaUrungkan = u;
      _tertunda = tunda;
      _h = h;
      _real = real;
      _jumlah = j;
      _belum = b;
    });
  }

  Future<void> _muatWa() async {
    final h = _h;
    if (!mounted || h == null || !h.aktif || _waMuat) return;
    if (h.sinkron == 'LOKAL') {
      setState(() => _waPesan = 'Header belum terkirim. Sinkronkan dulu, teks WA dibuat server.');
      return;
    }
    setState(() {
      _waMuat = true;
      _waPesan = null;
    });
    try {
      final l = await widget.deps.laporan.untukHeader(widget.sesi, headerId: h.id, tanggal: h.tanggal);
      if (!mounted) return;
      setState(() {
        _wa = l;
        if (l == null) _waPesan = 'Laporan tidak ditemukan di server.';
      });
      await _muat();
    } on ApiException catch (e) {
      if (mounted) setState(() => _waPesan = e.kode == 'TANGGAL_DI_LUAR_BATAS' ? null : KodeError.pesan(e.kode));
    } catch (_) {
      if (mounted) setState(() => _waPesan = 'Offline. Menampilkan teks WA terakhir yang tersimpan.');
    } finally {
      if (mounted) setState(() => _waMuat = false);
    }
  }

  /// Refresh (v0.49): tarik layar atau tombol kanan atas, di tab Detail dan Realisasi.
  /// Kirim data tertunda + tarik kode dari server (sinkron), lalu muat ulang data HP dan teks WA.
  Future<void> _segarkan() async {
    if (_menyegarkan) return;
    setState(() => _menyegarkan = true);
    final ctl = widget.deps.syncCtl;
    try {
      await ctl.sinkron();
      await _muat();
      await _muatWa();
      if (mounted) {
        tampilPesan(context, ctl.online == false ? 'Tidak ada sinyal. Menampilkan data di HP.' : 'Laporan diperbarui.');
      }
    } finally {
      if (mounted) setState(() => _menyegarkan = false);
    }
  }

  bool get _bolehUbah => widget.sesi.bisaUbah('ROW_EKSEKUSI') && (_h?.aktif ?? false);

  /// M4: batal hanya untuk data AKTIF dalam 7 hari (lebih tua = DATA_TERKUNCI di server).
  bool get _bolehBatal => _bolehUbah && PerbaikanRepository.dalamBatas(_h!.kode);

  Future<void> _batal() async {
    final hapus = await batalkanRow(context, widget.deps, widget.sesi, jenis: 'header', id: widget.headerId, label: 'laporan ini');
    if (!mounted || hapus == null) return;
    if (hapus) {
      Navigator.pop(context);
      return;
    }
    await _muat();
  }

  Future<void> _urungkan() async {
    await urungkanBatalRow(context, widget.deps, widget.sesi, jenis: 'header', id: widget.headerId);
    await _muat();
  }

  Future<void> _ubahHeader() async {
    await bukaForm(context, MaterialPageRoute(builder: (_) => FormHeaderScreen(deps: widget.deps, sesi: widget.sesi, header: _h)));
    await _muat();
  }

  Future<void> _tambahPenyulang() async {
    final semua = await widget.deps.master.penyulang();
    final terpakai = _real.where((r) => r.aktif).map((r) => r.penyulang.toLowerCase()).toSet();
    final pilihan = semua.where((p) => !terpakai.contains(p.toLowerCase())).toList();
    if (!mounted) return;
    if (pilihan.isEmpty) {
      tampilPesan(context, semua.isEmpty ? 'Master penyulang kosong. Download master di Pengaturan.' : 'Semua penyulang sudah ada.');
      return;
    }
    String? dipilih;
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (c) => Padding(
        padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + MediaQuery.of(c).viewInsets.bottom),
        child: StatefulBuilder(
          builder: (c, setSheet) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Center(
              child: Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.neutral300, borderRadius: BorderRadius.circular(4))),
            ),
            const SizedBox(height: 14),
            const Text('Tambah Penyulang', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              initialValue: dipilih,
              isExpanded: true,
              decoration: sisiInput('Penyulang'),
              items: [for (final p in pilihan) DropdownMenuItem(value: p, child: Text(p))],
              onChanged: (v) => setSheet(() => dipilih = v),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 48,
              child: FilledButton(
                onPressed: dipilih == null ? null : () => Navigator.pop(c, true),
                child: const Text('Simpan Penyulang'),
              ),
            ),
          ]),
        ),
      ),
    );
    if (ok != true || dipilih == null || _h == null) return;
    try {
      final r = await widget.deps.row.buatRealisasi(widget.sesi, _h!, dipilih!);
      unawaited(widget.deps.syncCtl.sinkron());
      await _muat();
      if (mounted) setState(() => _tab = 1);
      if (mounted) await _bukaRealisasi(r);
    } on RowError catch (e) {
      if (mounted) tampilPesan(context, e.pesan);
    }
  }

  Future<void> _bukaRealisasi(RowRealisasi r) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => RealisasiScreen(deps: widget.deps, sesi: widget.sesi, realisasiId: r.id)));
    await _muat();
  }

  @override
  Widget build(BuildContext context) {
    final h = _h;
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar('Detail Laporan', subjudul: h?.kode, actions: [
        TombolSegarkan(sibuk: _menyegarkan || widget.deps.syncCtl.sedangSync, onPressed: _segarkan),
        MenuDataRow(
            labelBatal: 'Batalkan laporan',
            bisaBatal: _bolehBatal,
            bisaUrungkan: _bisaUrungkan,
            onBatal: _batal,
            onUrungkan: _urungkan),
      ]),
      body: h == null
          ? const SisiLoading(ukuran: 60)
          : Column(children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(color: AppColors.neutral150, borderRadius: BorderRadius.circular(999)),
                  child: Row(children: [
                    _pill('Detail Laporan', 0),
                    _pill('Realisasi (${_real.where((r) => r.aktif).length})', 1),
                  ]),
                ),
              ),
              Expanded(child: RefreshIndicator(onRefresh: _segarkan, child: _tab == 0 ? _detail(h) : _daftarRealisasi())),
            ]),
      floatingActionButton: _tab == 1 && _bolehUbah
          ? FloatingActionButton.extended(
              onPressed: _tambahPenyulang, icon: const Icon(Icons.add_rounded), label: const Text('Tambah Penyulang'))
          : null,
    );
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

  Widget _baris(String label, String? nilai) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 120, child: Text(label, style: const TextStyle(fontSize: 12.5, color: AppColors.neutral500))),
          Expanded(child: Text(nilai ?? '-', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.neutral900))),
        ]),
      );

  Widget _kartuWa(RowHeader h) {
    final wa = _wa;
    final teks = (wa?['waText'] as String?) ?? h.waText ?? '';
    // v1.0.17 (sinkron atomik): SIAP WA hanya kalau semua data laporan ini sudah diterima server
    final siap = (wa == null ? h.waSiap : wa['siapKirim'] == true) && _tertunda == 0;
    final alasan = <String>[
      if (_tertunda > 0) 'SiSi Sedang Proses Sinkron Data: $_tertunda Data Sedang Proses Sinkron.',
    ];
    if (wa != null && !siap) {
      final kurang = (wa['headerKurang'] as List<dynamic>? ?? const <dynamic>[]).cast<String>();
      const label = {'koordinatAwal': 'Koordinat awal', 'koordinatAkhir': 'Koordinat akhir', 'kmAwal': 'KM awal', 'kmAkhir': 'KM akhir'};
      if (kurang.isNotEmpty) alasan.add('Lengkapi header: ${kurang.map((k) => label[k] ?? k).join(', ')}.');
      final p = (wa['peringatan'] as List<dynamic>? ?? const <dynamic>[]).cast<String>();
      if (p.contains('BELUM_ADA_FOTO_LENGKAP')) alasan.add('Belum ada eksekusi dengan 3 foto lengkap.');
    }
    final menunggu = (wa?['menungguFoto'] as num?)?.toInt() ?? 0;
    return SectionCard(judul: 'Laporan WA', ikon: Icons.chat_outlined, children: [
      Row(children: [
        siap
            ? const StatusBadge('SIAP WA', warna: AppColors.success700, latar: AppColors.success100, ikon: Icons.check_circle_outline)
            : _tertunda > 0
                ? const StatusBadge('PROSES SINKRON', warna: AppColors.accent700, latar: AppColors.accent100, ikon: Icons.sync_rounded)
                : const StatusBadge('PROSES', warna: AppColors.accent700, latar: AppColors.accent100, ikon: Icons.hourglass_bottom_rounded),
        const Spacer(),
        if (h.aktif)
          TextButton.icon(
            onPressed: _waMuat ? null : _muatWa,
            icon: _waMuat
                ? const SisiLoader(ukuran: 14)
                : const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Muat ulang'),
          ),
      ]),
      const SizedBox(height: 8),
      if (_waPesan != null) Text(_waPesan!, style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
      for (final a in alasan) Text('• $a', style: const TextStyle(fontSize: 12.5, color: AppColors.neutral900)),
      if (menunggu > 0) Text('• $menunggu eksekusi menunggu foto (belum dihitung).', style: const TextStyle(fontSize: 12.5)),
      if (siap && teks.isNotEmpty) ...[const SizedBox(height: 8), WaPanel(teks: teks)],
    ]);
  }

  Widget _detail(RowHeader h) {
    String km(num? n) => n == null ? '-' : n.toString();
    final kurang = h.kurangUntukWa;
    return ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
      if (h.aktif) ...[_kartuWa(h), const SizedBox(height: 14)],
      SectionCard(judul: 'Informasi laporan', ikon: Icons.info_outline, children: [
        _baris('Kode Header', h.kode),
        _baris('Tanggal', DateFormat('EEEE, d MMMM y', 'id_ID').format(DateTime.parse(h.tanggal))),
        _baris('ULP / Tim', '${widget.sesi.ulp} / ${widget.sesi.timNama}'),
        _baris('Petugas', widget.sesi.username),
        Row(children: [
          const SizedBox(width: 120, child: Text('Status', style: TextStyle(fontSize: 12.5, color: AppColors.neutral500))),
          if (!h.aktif) const StatusBadge('BATAL', warna: AppColors.red700, latar: AppColors.red100) else StatusBadge.sinkron(h.sinkron),
        ]),
        if (h.alasan != null) _baris('Keterangan', KodeError.alasanSinkron(h.alasan)),
      ]),
      const SizedBox(height: 14),
      SectionCard(judul: 'Perjalanan lapangan', ikon: Icons.route_outlined, children: [
        _baris('Koordinat Awal', h.koordinatAwal),
        _baris('Koordinat Akhir', h.koordinatAkhir),
        _baris('KM Awal / Akhir', '${km(h.kmAwal)} / ${km(h.kmAkhir)}'),
        _baris('Kendala', h.kendala),
        if (_bolehUbah) ...[
          const SizedBox(height: 10),
          OutlinedButton.icon(onPressed: _ubahHeader, icon: const Icon(Icons.edit_outlined), label: const Text('Ubah Header')),
        ],
      ]),
      if (kurang.isNotEmpty) ...[
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(14)),
          child: Text('Laporan WA belum bisa dikirim. Lengkapi: ${kurang.join(', ')}.',
              style: const TextStyle(fontSize: 12.5, color: AppColors.neutral900)),
        ),
      ],
    ]);
  }

  Widget _daftarRealisasi() {
    if (_real.isEmpty) {
      return bisaDitarik(SisiKosong(
        ikon: Icons.electrical_services_outlined,
        judul: 'Belum ada penyulang',
        pesan: 'Tambahkan penyulang yang dikerjakan hari ini.',
      ));
    }
    return ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 12, 16, 100), children: [
      for (final r in _real) ...[
        _KartuRealisasi(r: r, jumlah: _jumlah[r.id] ?? 0, belum: _belum[r.id] ?? 0, onTap: () => _bukaRealisasi(r)),
        const SizedBox(height: 10),
      ],
    ]);
  }
}

/// Kartu penyulang. Warna status foto sama dengan kartu eksekusi: amber = masih ada eksekusi yang fotonya
/// belum lengkap (atau belum ada eksekusi), hijau = semua eksekusi foto lengkap.
class _KartuRealisasi extends StatelessWidget {
  const _KartuRealisasi({required this.r, required this.jumlah, required this.belum, required this.onTap});
  final RowRealisasi r;
  final int jumlah;
  final int belum;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final lengkap = r.aktif && jumlah > 0 && belum == 0;
    final warna = !r.aktif ? AppColors.neutral500 : (lengkap ? AppColors.success700 : AppColors.accent700);
    final latar = !r.aktif ? AppColors.neutral100 : (lengkap ? AppColors.success100 : AppColors.accent100);
    final teks = !r.aktif
        ? 'Penyulang BATAL'
        : jumlah == 0
            ? 'Belum ada eksekusi'
            : lengkap
                ? 'Foto lengkap $jumlah/$jumlah eksekusi'
                : '$belum dari $jumlah eksekusi belum lengkap fotonya';
    return Opacity(
      opacity: r.aktif ? 1 : .6,
      child: Material(
        color: Colors.white,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: r.aktif && !lengkap ? AppColors.accent700.withValues(alpha: .45) : AppColors.neutral200),
        ),
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(10)),
                child: Icon(Icons.park_rounded, color: warna),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(
                      child: Text('Penyulang ${r.penyulang}',
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.navy900)),
                    ),
                    r.aktif ? StatusBadge.sinkron(r.sinkron) : const StatusBadge('BATAL', warna: AppColors.red700, latar: AppColors.red100),
                  ]),
                  const SizedBox(height: 2),
                  Text(r.kode, style: const TextStyle(fontSize: 12, color: AppColors.neutral700)),
                  const SizedBox(height: 8),
                  Row(children: [
                    Icon(lengkap ? Icons.photo_library_rounded : Icons.add_a_photo_outlined, size: 16, color: warna),
                    const SizedBox(width: 6),
                    Expanded(child: Text(teks, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: warna))),
                    const Icon(Icons.chevron_right_rounded, color: AppColors.neutral400),
                  ]),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
