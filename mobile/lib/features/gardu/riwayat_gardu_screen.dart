import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/sisi_motif.dart';
import 'arsip_ba_lembar.dart' show bolehLihatBa;
import 'daftar_ba_screen.dart';
import 'gardu_model.dart';
import 'gardu_widgets.dart';

/// v1.0.17 (permintaan kvlar 22 Okt 2026): pilihan saat kartu gardu diketuk di menu admin Pengukuran Gardu.
enum PilihanGardu { perbaikan, pengukuran }

Future<PilihanGardu?> pilihTampilanGardu(BuildContext context, Gardu g) => showModalBottomSheet<PilihanGardu>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              const Text('Gardu', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: AppColors.navy900)),
              const SizedBox(width: 8),
              PilNoGardu(g.no),
            ]),
            Text(g.alamat.isEmpty ? g.penyulang : g.alamat, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
            const SizedBox(height: 14),
            _OpsiGardu(
              ikon: Icons.build_circle_outlined,
              warna: AppColors.accent700,
              latar: AppColors.accent100,
              judul: 'Lihat Rekam Jejak Trafo & Gardu',
              sub: 'Riwayat temuan + perbaikan, Berita Acara dan pergantian trafo',
              onTap: () => Navigator.pop(c, PilihanGardu.perbaikan),
            ),
            const SizedBox(height: 10),
            _OpsiGardu(
              ikon: Icons.speed_rounded,
              warna: AppColors.navy700,
              latar: AppColors.brand100,
              judul: 'Lihat Pengukuran Gardu',
              sub: 'Beban, arus, tegangan per periode LWBP / WBP',
              onTap: () => Navigator.pop(c, PilihanGardu.pengukuran),
            ),
          ]),
        ),
      ),
    );

class _OpsiGardu extends StatelessWidget {
  const _OpsiGardu({required this.ikon, required this.warna, required this.latar, required this.judul, required this.sub, required this.onTap});
  final IconData ikon;
  final Color warna, latar;
  final String judul, sub;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral200)),
            child: Row(children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [latar, Colors.white], begin: Alignment.topLeft, end: Alignment.bottomRight),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: warna.withValues(alpha: .25)),
                ),
                child: Icon(ikon, color: warna),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(judul, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                  const SizedBox(height: 2),
                  Text(sub, style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
                ]),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.neutral400),
            ]),
          ),
        ),
      );
}

/// v1.0.17: layar riwayat satu gardu, dua tab: History Perbaikan & Manajemen Trafo / Pengukuran Gardu.
/// v1.0.20: tab Rekam Jejak Trafo & Gardu / Pengukuran (LWBP / WBP dibedakan), nomor gardu disorot di header.
class RiwayatGarduScreen extends StatefulWidget {
  const RiwayatGarduScreen({super.key, required this.deps, required this.sesi, required this.gardu, this.awal = PilihanGardu.perbaikan});
  final Deps deps;
  final Sesi sesi;
  final Gardu gardu;
  final PilihanGardu awal;

  @override
  State<RiwayatGarduScreen> createState() => _RiwayatGarduScreenState();
}

class _RiwayatGarduScreenState extends State<RiwayatGarduScreen> {
  Map<String, dynamic>? _data;
  String _periode = ''; // v1.0.20: '' = semua, LWBP, WBP
  String? _galat;
  bool _muat = false;

  Gardu get _g => widget.gardu;

  static String _t(Object? v) => v?.toString().trim() ?? '';
  static double? _d(Object? v) => v is num ? v.toDouble() : double.tryParse(_t(v));
  static List<Map<String, dynamic>> _daftar(Object? v) =>
      v is List ? [for (final x in v) if (x is Map) Map<String, dynamic>.from(x)] : const <Map<String, dynamic>>[];

  @override
  void initState() {
    super.initState();
    unawaited(_muatData());
  }

  Future<void> _muatData() async {
    if (_muat) return;
    setState(() {
      _muat = true;
      _galat = null;
    });
    try {
      final r = await widget.deps.api.call('getRiwayatGardu', token: widget.sesi.token, data: {'garduId': _g.id, 'noGardu': _g.no});
      if (mounted) setState(() => _data = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.kode.startsWith('HTTP_') ? 'Butuh sinyal untuk memuat riwayat gardu.' : KodeError.pesan(e.kode));
    } catch (_) {
      if (mounted) setState(() => _galat = 'Butuh sinyal untuk memuat riwayat gardu.');
    } finally {
      if (mounted) setState(() => _muat = false);
    }
  }

  @override
  Widget build(BuildContext context) => DefaultTabController(
        length: 2,
        initialIndex: widget.awal == PilihanGardu.perbaikan ? 0 : 1,
        child: Scaffold(
          backgroundColor: AppColors.neutral50,
          // v1.0.20: header Jaringan SiSi dengan nomor gardu disorot, tab Rekam Jejak Trafo & Gardu / Pengukuran
          appBar: AppBar(
            backgroundColor: AppColors.brand900,
            foregroundColor: Colors.white,
            flexibleSpace: const DecoratedBox(
              decoration: BoxDecoration(gradient: SisiMotif.gradien),
              child: CustomPaint(painter: PolaJaringanPainter(alpha: .09, kerapatan: 5), size: Size.infinite),
            ),
            toolbarHeight: 84,
            titleSpacing: 4,
            title: Row(children: [
              PilNoGardu(_g.no, besar: true),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(_g.alamat.isEmpty ? 'Gardu distribusi' : _g.alamat,
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: Colors.white)),
                  Text([_g.penyulang, _g.section].where((x) => x.isNotEmpty).join(' · '),
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Color(0xD9FFFFFF))),
                ]),
              ),
            ]),
            actions: [IconButton(tooltip: 'Muat ulang', onPressed: _muat ? null : _muatData, icon: const Icon(Icons.refresh_rounded))],
            bottom: const TabBar(
              labelColor: Colors.white,
              unselectedLabelColor: Colors.white70,
              indicatorColor: AppColors.accent400,
              indicatorWeight: 3,
              tabs: [Tab(text: 'Rekam Jejak Trafo & Gardu'), Tab(text: 'Pengukuran')],
            ),
          ),
          body: TabBarView(children: [_tabPerbaikan(), _tabPengukuran()]),
        ),
      );

  Widget _status() {
    if (_muat && _data == null) return const Padding(padding: EdgeInsets.all(24), child: Center(child: SisiLoader()));
    if (_galat != null) {
      return Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(14)),
        child: Row(children: [
          const Icon(Icons.error_outline_rounded, color: AppColors.red700),
          const SizedBox(width: 8),
          Expanded(child: Text(_galat!, style: const TextStyle(color: AppColors.red700))),
          TextButton(onPressed: _muatData, child: const Text('Coba lagi')),
        ]),
      );
    }
    return const SizedBox.shrink();
  }

  Widget _kosong(String teks) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Text(teks, style: const TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
      );

  // ---------- tab 1: perbaikan & trafo ----------

  Widget _tabPerbaikan() {
    final ba = _daftar(_data?['ba']);
    final temuan = _daftar(_data?['temuan']);
    return RefreshIndicator(
      onRefresh: _muatData,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
        _status(),
        BagianGardu('Manajemen Trafo', Icons.bolt_rounded, [
          ('Trafo terpasang', [_g.merk, _g.kva == null ? '' : '${angkaId(_g.kva)} kVA', _g.seri].where((x) => x.isNotEmpty).join(' · ')),
          ('Tahun', _g.tahun?.toString() ?? ''),
          ('Asal Trafo', _g.asalTrafo),
          ('BA Pengoperasian', _g.baOperasi),
          ('Tanggal Operasi', _g.tglOperasi.isEmpty ? '' : tanggalPendek(_g.tglOperasi)),
          ('BA Terakhir', [_g.baTerakhir, _g.jenisBaTerakhir].where((x) => x.isNotEmpty).join(' · ')),
          ('Jumlah BA', '${_g.jumlahBa}'),
        ], bawah: bolehLihatBa(widget.sesi)
            ? Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => unawaited(Navigator.push(context,
                      MaterialPageRoute<void>(builder: (_) => DaftarBaScreen(deps: widget.deps, sesi: widget.sesi, cariAwal: _g.no)))),
                  icon: const Icon(Icons.timeline_rounded, size: 18),
                  label: const Text('Buka Daftar BA gardu ini'),
                ),
              )
            : null),
        _judul('Berita Acara (${ba.length})', Icons.description_outlined),
        if (_data != null && ba.isEmpty) _kosong('Belum ada Berita Acara untuk gardu ini.'),
        for (final b in ba) _kartuBa(b),
        const SizedBox(height: 8),
        _judul('Riwayat Temuan & Perbaikan (${temuan.length})', Icons.report_gmailerrorred_rounded),
        if (_data != null && temuan.isEmpty) _kosong('Belum ada temuan inspeksi untuk gardu ini.'),
        for (final t in temuan) _kartuTemuan(t),
      ]),
    );
  }

  Widget _judul(String teks, IconData ikon) => Padding(padding: const EdgeInsets.only(top: 8), child: JudulSeksiSisi(teks));

  /// v1.0.20: kartu putih dengan garis aksen kiri ([aksen]) supaya jenis data terbaca sekilas.
  Widget _kartu({required Widget child, Color? garis, Color aksen = AppColors.brand600}) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: garis ?? AppColors.neutral200),
          boxShadow: [BoxShadow(color: AppColors.brand950.withValues(alpha: .04), blurRadius: 10, offset: const Offset(0, 3))],
        ),
        clipBehavior: Clip.antiAlias,
        child: IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(width: 4, color: aksen),
            Expanded(child: Padding(padding: const EdgeInsets.all(14), child: child)),
          ]),
        ),
      );

  Widget _pil(String teks, Color warna, Color latar) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(999)),
        child: Text(teks, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: warna)),
      );

  Widget _kartuBa(Map<String, dynamic> b) {
    final lama = b['trafo'] is Map ? Map<String, dynamic>.from(b['trafo'] as Map) : const <String, dynamic>{};
    final baru = b['trafoSesudah'] is Map ? Map<String, dynamic>.from(b['trafoSesudah'] as Map) : const <String, dynamic>{};
    String trafo(Map<String, dynamic> m) =>
        [_t(m['merk']), if (_d(m['kva']) != null) '${angkaId(_d(m['kva']))} kVA', _t(m['seri'])].where((x) => x.isNotEmpty).join(' · ');
    final ganti = trafo(baru).isNotEmpty;
    return _kartu(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Text(_t(b['jenisPekerjaan']), style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.navy900))),
          _pil(_t(b['statusBa']).isEmpty ? '-' : _t(b['statusBa']), AppColors.navy700, AppColors.brand100),
        ]),
        Text([_t(b['noBa']), if (_t(b['tanggalBa']).isNotEmpty) tanggalPendek(_t(b['tanggalBa']))].where((x) => x.isNotEmpty).join(' · '),
            style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
        const SizedBox(height: 8),
        if (trafo(lama).isNotEmpty || ganti)
          Row(children: [
            Expanded(child: Text(trafo(lama).isEmpty ? '-' : trafo(lama), style: const TextStyle(fontSize: 12.5, color: AppColors.neutral700))),
            if (ganti) ...[
              const Padding(padding: EdgeInsets.symmetric(horizontal: 6), child: Icon(Icons.arrow_forward_rounded, size: 16, color: AppColors.accent700)),
              Expanded(
                child: Text(trafo(baru), style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
              ),
            ],
          ]),
        if (_t(b['kesimpulan']).isNotEmpty) Text('Kesimpulan: ${_t(b['kesimpulan'])}', style: const TextStyle(fontSize: 12.5, color: AppColors.neutral700)),
        if (_t(b['alasanBongkar']).isNotEmpty) Text('Alasan bongkar: ${_t(b['alasanBongkar'])}', style: const TextStyle(fontSize: 12.5, color: AppColors.neutral700)),
        if (_t(b['statusPdf']).isNotEmpty || _t(b['statusTtd']).isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Wrap(spacing: 6, children: [
              if (_t(b['statusPdf']).isNotEmpty) _pil('PDF ${_t(b['statusPdf'])}', AppColors.neutral700, AppColors.neutral100),
              if (_t(b['statusTtd']).isNotEmpty) _pil('TTD ${_t(b['statusTtd'])}', AppColors.neutral700, AppColors.neutral100),
            ]),
          ),
      ]),
    );
  }

  Widget _kartuTemuan(Map<String, dynamic> t) {
    final selesai = _t(t['statusWo']) == 'SELESAI';
    final perbaikan = _daftar(t['perbaikan']);
    final (Color w, Color l, String label) = selesai
        ? (AppColors.success700, AppColors.success100, 'Sudah diperbaiki')
        : _t(t['statusWo']).isEmpty
            ? (AppColors.red700, AppColors.red100, 'Belum ditindaklanjuti')
            : (AppColors.accent700, AppColors.accent100, _t(t['statusWo']) == 'DIKERJAKAN' ? 'Sedang diperbaiki' : 'WO terkirim ke tim');
    return _kartu(
      garis: selesai ? null : l,
      aksen: w,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_t(t['jenisTemuan']).isEmpty ? 'Temuan' : _t(t['jenisTemuan']),
                  style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
              Text([if (_t(t['tanggal']).isNotEmpty) tanggalPendek(_t(t['tanggal'])), _t(t['kodeTemuan'])].where((x) => x.isNotEmpty).join(' · '),
                  style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
            ]),
          ),
          _pil(label, w, l),
        ]),
        if (_t(t['deskripsi']).isNotEmpty) ...[const SizedBox(height: 4), Text(_t(t['deskripsi']), style: const TextStyle(fontSize: 12.5))],
        if (_t(t['timTindakLanjut']).isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('Tim tindak lanjut: ${_t(t['timTindakLanjut'])}', style: const TextStyle(fontSize: 12.5, color: AppColors.neutral700)),
          ),
        if (perbaikan.isNotEmpty) ...[
          const SizedBox(height: 6),
          const Text('Riwayat perbaikan', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: AppColors.navy700)),
          for (final p in perbaikan)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                '• ${[if (_t(p['tanggal']).isNotEmpty) tanggalPendek(_t(p['tanggal'])), _t(p['pekerjaan']), _t(p['tim'])].where((x) => x.isNotEmpty).join(' · ')}'
                '${_t(p['status']) == 'TERCATAT' ? '' : ' (${_t(p['status']).toLowerCase()})'}',
                style: const TextStyle(fontSize: 12.5, color: AppColors.neutral900),
              ),
            ),
        ],
        if (selesai && _t(t['tindakLanjut']).isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: 8),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: AppColors.success100, borderRadius: BorderRadius.circular(10)),
            child: Text(_t(t['tindakLanjut']), style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.success700)),
          ),
      ]),
    );
  }

  // ---------- tab 2: pengukuran ----------

  Widget _tabPengukuran() {
    final semua = _daftar(_data?['pengukuran']);
    int n(String p) => semua.where((u) => _t(u['periode']).toUpperCase() == p).length;
    final ukur = _periode.isEmpty ? semua : semua.where((u) => _t(u['periode']).toUpperCase() == _periode).toList();
    return RefreshIndicator(
      onRefresh: _muatData,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
        BagianGardu('Pengukuran Terakhir', Icons.speed_rounded, [
          ('Tanggal Ukur', _g.tglUkur.isEmpty ? '' : tanggalPendek(_g.tglUkur)),
          ('Waktu Beban', _g.waktuBeban),
          ('Arus Maks per Fasa', _g.arusMaks == null ? '' : '${angkaId(_g.arusMaks)} A'),
          ('Pembebanan', _g.bebanKva == null ? '' : '${angkaId(_g.bebanKva)} kVA'),
          ('Persentase Beban', _g.persen == null ? '' : '${angkaId(_g.persen)} %'),
          ('Kategori', '${_g.kategori.label} (${_g.kategori.range})'),
        ], bawah: Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => unawaited(tampilDetailGardu(context, _g, denganBa: false)),
            icon: const Icon(Icons.info_outline_rounded, size: 18),
            label: const Text('Data gardu lengkap'),
          ),
        )),
        BagianArusTegangan(_g),
        _status(),
        _judul('Riwayat Pengukuran (${semua.length})', Icons.history_rounded),
        // v1.0.20: bedakan pengukuran LWBP (luar beban puncak) dan WBP (beban puncak)
        SegmentedButton<String>(
          showSelectedIcon: false,
          segments: [
            ButtonSegment(value: '', label: Text('Semua · ${semua.length}')),
            ButtonSegment(value: 'LWBP', icon: const Icon(Icons.wb_sunny_rounded, size: 16), label: Text('LWBP · ${n('LWBP')}')),
            ButtonSegment(value: 'WBP', icon: const Icon(Icons.nights_stay_rounded, size: 16), label: Text('WBP · ${n('WBP')}')),
          ],
          selected: {_periode},
          onSelectionChanged: (v) => setState(() => _periode = v.first),
        ),
        const SizedBox(height: 10),
        if (_data != null && ukur.isEmpty)
          _kosong(semua.isEmpty ? 'Belum ada riwayat pengukuran (Yandal / Inspeksi Gardu).' : 'Tidak ada pengukuran $_periode.'),
        for (final u in ukur) _kartuUkur(u),
      ]),
    );
  }

  Widget _kartuUkur(Map<String, dynamic> u) {
    final kat = KategoriBeban.dari(_d(u['persen']));
    String n(String k, String s) => _d(u[k]) == null ? '-' : '${angkaId(_d(u[k]))} $s';
    Widget sel(String l, String v) => Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(l, style: const TextStyle(fontSize: 10.5, color: AppColors.neutral500)),
            Text(v, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
          ]),
        );
    final periode = _t(u['periode']).toUpperCase();
    return _kartu(
      aksen: periode == 'WBP' || periode == 'LWBP' ? BadgePeriodeBeban.gaya(periode).$2 : AppColors.neutral300,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          BadgePeriodeBeban(periode, lengkap: true),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              [if (_t(u['tanggal']).isNotEmpty) tanggalPendek(_t(u['tanggal'])), _t(u['jam'])].where((x) => x.isNotEmpty).join(' · '),
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy900),
            ),
          ),
          if (_d(u['persen']) != null) _pil('${angkaId(_d(u['persen']))}% ${kat.label}', kat.warna, kat.latar),
        ]),
        Text([_t(u['sumber']), _t(u['kode'])].where((x) => x.isNotEmpty).join(' · '), style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
        const SizedBox(height: 8),
        Row(children: [sel('Arus R', n('bebanR', 'A')), sel('Arus S', n('bebanS', 'A')), sel('Arus T', n('bebanT', 'A')), sel('Arus N', n('bebanN', 'A'))]),
        const SizedBox(height: 6),
        Row(children: [sel('V R-N', n('teganganRN', 'V')), sel('V S-N', n('teganganSN', 'V')), sel('V T-N', n('teganganTN', 'V')), const Spacer()]),
        const SizedBox(height: 6),
        Row(children: [sel('V R-S', n('teganganRS', 'V')), sel('V R-T', n('teganganRT', 'V')), sel('V S-T', n('teganganST', 'V')), const Spacer()]),
        const SizedBox(height: 6),
        Row(children: [
          sel('Beban', n('kva', 'kVA')),
          sel('Tidak seimbang', n('tidakSeimbang', '%')),
          const Spacer(flex: 2),
        ]),
      ]),
    );
  }
}
