import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/sisi_motif.dart';
import '../../widgets/sisi_widgets.dart';
import 'arsip_ba_lembar.dart' show bolehLihatBa;
import 'daftar_ba_screen.dart';
import 'gardu_model.dart';
import 'gardu_widgets.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/refresh_sisi.dart';

/// v1.0.17 (permintaan Master Guswan 22 Okt 2026): pilihan saat kartu gardu diketuk di menu admin Pengukuran Gardu.
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
            Text(g.alamat.isEmpty ? g.penyulang : g.alamat,
                maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
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
  String _periodeTerbaru = ''; // v1.0.22: tab Pengukuran Terbaru
  final Map<String, bool> _bukaUkur = {}; // v1.0.22: kartu ukur dibuka / ditutup (kunci _kunciUkur)
  String? _sibukUpdate; // v1.0.22: kartu riwayat yang sedang Update Pengukuran Gardu
  String? _galat;
  bool _muat = false;

  Gardu get _g => widget.gardu;

  static String _t(Object? v) => v?.toString().trim() ?? '';
  static double? _d(Object? v) => v is num ? v.toDouble() : double.tryParse(_t(v));
  static List<Map<String, dynamic>> _daftar(Object? v) => v is List
      ? [
          for (final x in v)
            if (x is Map) Map<String, dynamic>.from(x)
        ]
      : const <Map<String, dynamic>>[];

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
            // v1.0.21: tombol kembali / refresh putih (tema AppBar memberi ikon biru tua yang tenggelam di latar gradien)
            iconTheme: const IconThemeData(color: Colors.white),
            actionsIconTheme: const IconThemeData(color: Colors.white),
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
            actions: [TombolSegarkan(sibuk: _muat, onPressed: _muatData)],
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
    return RefreshSisi(
      onRefresh: _muatData,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
        _status(),
        BagianGardu(
            'Manajemen Trafo',
            Icons.bolt_rounded,
            [
              ('Trafo terpasang', [_g.merk, _g.kva == null ? '' : '${angkaId(_g.kva)} kVA', _g.seri].where((x) => x.isNotEmpty).join(' · ')),
              ('Tahun', _g.tahun?.toString() ?? ''),
              ('Asal Trafo', _g.asalTrafo),
              ('BA Pengoperasian', _g.baOperasi),
              ('Tanggal Operasi', _g.tglOperasi.isEmpty ? '' : tanggalPendek(_g.tglOperasi)),
              ('BA Terakhir', [_g.baTerakhir, _g.jenisBaTerakhir].where((x) => x.isNotEmpty).join(' · ')),
              ('Jumlah BA', '${_g.jumlahBa}'),
            ],
            bawah: bolehLihatBa(widget.sesi)
                ? Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () => unawaited(Navigator.push(
                          context, MaterialPageRoute<void>(builder: (_) => DaftarBaScreen(deps: widget.deps, sesi: widget.sesi, cariAwal: _g.no)))),
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
        if (_t(b['alasanBongkar']).isNotEmpty)
          Text('Alasan bongkar: ${_t(b['alasanBongkar'])}', style: const TextStyle(fontSize: 12.5, color: AppColors.neutral700)),
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
                '• ${[
                  if (_t(p['tanggal']).isNotEmpty) tanggalPendek(_t(p['tanggal'])),
                  _t(p['pekerjaan']),
                  _t(p['tim'])
                ].where((x) => x.isNotEmpty).join(' · ')}'
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
  // v1.0.21 (permintaan Master Guswan 23 Okt 2026): kartu Data Trafo (nameplate + koordinat ke Google Maps). Isi kartu ukur
  // dikelompokkan: arus, tegangan fasa-netral, fasa-fasa.
  // v1.0.22 (permintaan Master Guswan 23 Okt 2026): Pengukuran Terbaru hanya dari Master Gardu (tanpa membandingkan 3 sumber) dan
  // dibaca dari Master Gardu yang sama dengan Data Trafo, jadi keduanya tampil bersamaan tanpa menunggu server. Pengukuran
  // Terbaru dan Riwayat sama-sama bertab Semua / LWBP / WBP, urut terbaru ke terlama, kartu bisa dibuka / ditutup.
  // Riwayat: Update Pengukuran Gardu = pengukuran itu menjadi pengukuran Master Gardu (Pengukuran Terbaru ikut berubah).
  // v1.0.23 (permintaan Master Guswan 23 Okt 2026): Master Gardu punya blok WBP dan LWBP (Pengukuran Terbaru = 2 kartu). Tiap seksi
  // dibungkus satu kartu besar (judul satu baris, tombol ikon buka / tutup semua di kanan atas). Tanggal DD MMMM YYYY.

  static const _menuUkur = 'OPS_PENGUKURAN_GARDU';

  static String _periodeDari(String v) {
    final p = v.toUpperCase();
    return p.contains('LWBP') ? 'LWBP' : (p.contains('WBP') ? 'WBP' : '');
  }

  /// Pengukuran Master Gardu (blok WBP + LWBP) dalam bentuk kartu ukur riwayat, terbaru dulu. Kosong = belum pernah diukur.
  static List<Map<String, dynamic>> ukurMaster(Gardu g) {
    Map<String, dynamic>? satu(String tgl, String kode, String periode, Map<String, Object?> ukur, Object? kva, Object? persen) => tgl.isEmpty
        ? null
        : {
            'sumber': 'Master Gardu',
            'ukurId': '',
            'kode': kode,
            'tanggal': tgl.length >= 10 ? tgl.substring(0, 10) : tgl,
            'periode': periode,
            'jam': '',
            ...ukur,
            'kva': kva,
            'persen': persen,
          };
    final l = g.lwbp ?? const <String, dynamic>{};
    return [
      if (satu(g.tglUkur, g.kodeUkur, _periodeDari(g.waktuBeban).isEmpty ? 'WBP' : _periodeDari(g.waktuBeban), g.ukur, g.bebanKva, g.persen) case final w?) w,
      if (satu(_t(l['tglUkur']), _t(l['kodeUkur']), 'LWBP', l['ukur'] is Map ? Map<String, Object?>.from(l['ukur'] as Map) : const {}, l['bebanKva'],
              l['persen'])
          case final x?)
        x,
    ]..sort(_urutTerbaru);
  }

  static int _urutTerbaru(Map<String, dynamic> a, Map<String, dynamic> b) =>
      '${_t(b['tanggal'])} ${_t(b['jam'])}'.compareTo('${_t(a['tanggal'])} ${_t(a['jam'])}');

  static String _kunciUkur(String seksi, Map<String, dynamic> u) =>
      '$seksi|${_t(u['sumber'])}|${_t(u['ukurId'])}|${_t(u['kode'])}|${_t(u['periode'])}|${_t(u['tanggal'])}';

  /// Kartu ukur terbuka? Belum pernah diketuk = [awal] (Pengukuran Terbaru terbuka, Riwayat tertutup).
  bool _terbuka(String k, bool awal) => _bukaUkur[k] ?? awal;

  Widget _tabPengukuran() {
    final semua = [..._daftar(_data?['pengukuran'])]..sort(_urutTerbaru);
    final g = _data?['gardu'] is Map ? Gardu.dariJson(Map<String, dynamic>.from(_data!['gardu'] as Map)) : _g;
    final master = ukurMaster(g);
    final ubah = widget.sesi.bisaUbah(_menuUkur);
    return RefreshSisi(
      onRefresh: _muatData,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
        _KartuDataTrafo(g, onLengkap: () => unawaited(tampilDetailGardu(context, g, denganBa: false))),
        const SizedBox(height: 6),
        _seksiUkur(
          seksi: 'terbaru',
          judul: 'Pengukuran Terbaru',
          ikon: Icons.speed_rounded,
          daftar: master,
          periode: _periodeTerbaru,
          gantiPeriode: (p) => setState(() => _periodeTerbaru = p),
          awalTerbuka: true,
          kosong: 'Belum ada pengukuran di Master Gardu.',
          kartu: (u, k) => _kartuUkur(u, k, awalTerbuka: true, keterangan: 'Master Gardu'),
        ),
        _status(),
        if (_data != null || semua.isNotEmpty)
          _seksiUkur(
            seksi: 'riwayat',
            judul: 'Riwayat Pengukuran',
            ikon: Icons.history_rounded,
            daftar: semua,
            periode: _periode,
            gantiPeriode: (p) => setState(() => _periode = p),
            awalTerbuka: false,
            kosong: 'Belum ada riwayat pengukuran (Master Gardu / Yandal / Inspeksi Gardu).',
            kartu: (u, k) {
              final dipakai = _t(u['kode']).isNotEmpty && master.any((m) => _t(m['kode']) == _t(u['kode']) && _t(m['periode']) == _t(u['periode']));
              final bisa = ubah && !dipakai && _t(u['ukurId']).isNotEmpty && _t(u['sumber']) != 'Master Gardu' && _t(u['periode']).isNotEmpty;
              return _kartuUkur(u, k, awalTerbuka: false, dipakaiMaster: dipakai, onUpdate: bisa ? () => unawaited(_updateMaster(u, k)) : null);
            },
          ),
      ]),
    );
  }

  /// Satu kartu besar per seksi: judul (satu baris) + ikon buka / tutup semua di kanan atas, tab Semua / LWBP / WBP,
  /// lalu kartu ukur (sudah urut terbaru).
  Widget _seksiUkur({
    required String seksi,
    required String judul,
    required IconData ikon,
    required List<Map<String, dynamic>> daftar,
    required String periode,
    required ValueChanged<String> gantiPeriode,
    required bool awalTerbuka,
    required String kosong,
    required Widget Function(Map<String, dynamic> u, String kunci) kartu,
  }) {
    int n(String p) => daftar.where((u) => _t(u['periode']).toUpperCase() == p).length;
    final tampil = periode.isEmpty ? daftar : daftar.where((u) => _t(u['periode']).toUpperCase() == periode).toList();
    final kunci = [for (final u in tampil) _kunciUkur(seksi, u)];
    final semuaTerbuka = kunci.isNotEmpty && kunci.every((k) => _terbuka(k, awalTerbuka));
    return Container(
      margin: const EdgeInsets.only(top: 12, bottom: 4),
      padding: const EdgeInsets.fromLTRB(12, 6, 6, 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.neutral200),
        boxShadow: [BoxShadow(color: AppColors.brand950.withValues(alpha: .05), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const PercikSisi(tinggi: 16),
          const SizedBox(width: 8),
          Icon(ikon, size: 18, color: AppColors.brand700),
          const SizedBox(width: 6),
          Expanded(
            child: Text('$judul (${daftar.length})',
                maxLines: 1,
                softWrap: false,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.navy900)),
          ),
          IconButton(
            tooltip: semuaTerbuka ? 'Tutup semua' : 'Buka semua',
            onPressed: kunci.isEmpty
                ? null
                : () => setState(() {
                      for (final k in kunci) {
                        _bukaUkur[k] = !semuaTerbuka;
                      }
                    }),
            icon: Icon(semuaTerbuka ? Icons.unfold_less_rounded : Icons.unfold_more_rounded, color: AppColors.brand700),
          ),
        ]),
        const SizedBox(height: 4),
        // v1.0.20: bedakan pengukuran LWBP (luar beban puncak) dan WBP (beban puncak)
        SegmentedButton<String>(
          showSelectedIcon: false,
          segments: [
            ButtonSegment(value: '', label: Text('Semua · ${daftar.length}')),
            ButtonSegment(value: 'LWBP', icon: const Icon(Icons.wb_sunny_rounded, size: 16), label: Text('LWBP · ${n('LWBP')}')),
            ButtonSegment(value: 'WBP', icon: const Icon(Icons.nights_stay_rounded, size: 16), label: Text('WBP · ${n('WBP')}')),
          ],
          selected: {periode},
          onSelectionChanged: (v) => gantiPeriode(v.first),
        ),
        const SizedBox(height: 10),
        if (tampil.isEmpty) _kosong(daftar.isEmpty ? kosong : 'Tidak ada pengukuran $periode.'),
        for (var i = 0; i < tampil.length; i++) kartu(tampil[i], kunci[i]),
      ]),
    );
  }

  Future<void> _updateMaster(Map<String, dynamic> u, String kunci) async {
    final periode = _t(u['periode']).toUpperCase();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        icon: const Icon(Icons.published_with_changes_rounded, size: 36, color: AppColors.brand700),
        title: const Text('Update Pengukuran Gardu', textAlign: TextAlign.center),
        content: Text(
          'Pengukuran $periode ${tanggalPanjang(_t(u['tanggal']))} dari ${_t(u['sumber'])} menjadi pengukuran terbaru '
          'Master Gardu ${_g.no}. Kartu Pengukuran Terbaru ikut berubah.',
          textAlign: TextAlign.center,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Update')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _sibukUpdate = kunci);
    try {
      final r = await widget.deps.api.call('updateUkurMasterGardu', token: widget.sesi.token, data: {
        'garduId': _g.id,
        'noGardu': _g.no,
        'sumber': _t(u['sumber']),
        'ukurId': _t(u['ukurId']),
        'periode': periode,
      });
      if (!mounted) return;
      setState(() => _data = {...?_data, 'gardu': r['gardu'], 'terbaru': r['terbaru']});
      // Master Gardu di HP ikut diperbarui (daftar Pengukuran Gardu, form lain)
      unawaited(widget.deps.gardu.segarkan(widget.sesi).catchError((_) => false));
      unawaited(tampilPopupBerhasil(context, judul: 'Pengukuran Gardu diperbarui', keterangan: 'Master Gardu ${_g.no} memakai pengukuran ini'));
    } on ApiException catch (e) {
      if (mounted) tampilPesan(context, e.kode.startsWith('HTTP_') ? 'Butuh sinyal untuk update pengukuran gardu.' : KodeError.pesan(e.kode));
    } catch (_) {
      if (mounted) tampilPesan(context, 'Butuh sinyal untuk update pengukuran gardu.');
    } finally {
      if (mounted) setState(() => _sibukUpdate = null);
    }
  }

  /// Kartu satu pengukuran: kepala (periode, tanggal, persen) selalu tampil, ketuk = buka / tutup rincian arus +
  /// tegangan. [onUpdate] = tombol Update Pengukuran Gardu (riwayat, akun UBAH).
  Widget _kartuUkur(Map<String, dynamic> u, String kunci, {required bool awalTerbuka, String? keterangan, bool dipakaiMaster = false, VoidCallback? onUpdate}) {
    final persen = _d(u['persen']);
    final kat = KategoriBeban.dari(persen);
    final periode = _t(u['periode']).toUpperCase();
    final buka = _terbuka(kunci, awalTerbuka);
    final sibuk = _sibukUpdate == kunci;
    final ringkas = [
      if (_d(u['kva']) != null) '${angkaId(_d(u['kva']))} kVA',
      if (_d(u['tidakSeimbang']) != null) 'tidak seimbang ${angkaId(_d(u['tidakSeimbang']))}%',
    ].join(' · ');
    return _kartu(
      aksen: periode == 'WBP' || periode == 'LWBP' ? BadgePeriodeBeban.gaya(periode).$2 : AppColors.neutral300,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => setState(() => _bukaUkur[kunci] = !buka),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              BadgePeriodeBeban(periode, lengkap: true),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  [if (_t(u['tanggal']).isNotEmpty) tanggalPanjang(_t(u['tanggal'])), _t(u['jam'])].where((x) => x.isNotEmpty).join(' · '),
                  textAlign: TextAlign.right,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy900),
                ),
              ),
              const SizedBox(width: 4),
              Icon(buka ? Icons.expand_less_rounded : Icons.expand_more_rounded, color: AppColors.neutral500),
            ]),
            const SizedBox(height: 4),
            Row(children: [
              Expanded(
                child: Text(
                  [keterangan ?? _t(u['sumber']), _t(u['kode'])].where((x) => x.isNotEmpty).join(' · '),
                  style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500),
                ),
              ),
              if (dipakaiMaster) _pil('DIPAKAI MASTER', AppColors.success700, AppColors.success100),
            ]),
            if (persen != null || ringkas.isNotEmpty) ...[
              const SizedBox(height: 8),
              Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                if (persen != null) ...[
                  Text('${angkaId(persen)}%',
                      style: TextStyle(
                          fontSize: 22, height: 1, fontWeight: FontWeight.w900, color: kat.warna, fontFeatures: const [FontFeature.tabularFigures()])),
                  const SizedBox(width: 6),
                  Text('beban ${kat.label.toLowerCase()}', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: kat.warna)),
                ],
                const Spacer(),
                if (ringkas.isNotEmpty) Text(ringkas, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.neutral700)),
              ]),
            ],
          ]),
        ),
        if (buka) ...[
          const SizedBox(height: 10),
          _GrupUkur('Arus', 'A', Icons.bolt_rounded, AppColors.accent700, [
            ('R', _d(u['bebanR'])),
            ('S', _d(u['bebanS'])),
            ('T', _d(u['bebanT'])),
            ('N', _d(u['bebanN'])),
          ]),
          const SizedBox(height: 8),
          _GrupUkur('Tegangan fasa-netral', 'V', Icons.electric_bolt_rounded, AppColors.brand700, [
            ('R-N', _d(u['teganganRN'])),
            ('S-N', _d(u['teganganSN'])),
            ('T-N', _d(u['teganganTN'])),
          ]),
          const SizedBox(height: 8),
          _GrupUkur('Tegangan fasa-fasa', 'V', Icons.swap_horiz_rounded, AppColors.navy900, [
            ('R-S', _d(u['teganganRS'])),
            ('R-T', _d(u['teganganRT'])),
            ('S-T', _d(u['teganganST'])),
          ]),
          if (onUpdate != null || sibuk) ...[
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: sibuk || _sibukUpdate != null ? null : onUpdate,
              icon: sibuk ? const SisiLoader(ukuran: 18, warna: Colors.white) : const Icon(Icons.published_with_changes_rounded, size: 18),
              label: const Text('Update Pengukuran Gardu'),
            ),
          ],
        ],
      ]),
    );
  }
}

/// v1.0.21: satu kelompok nilai ukur (arus / tegangan fasa-netral / fasa-fasa): judul + satuan, lalu sel per fasa
/// (label kecil, angka besar tabular). Kosong = '-'.
class _GrupUkur extends StatelessWidget {
  const _GrupUkur(this.judul, this.satuan, this.ikon, this.warna, this.nilai);
  final String judul, satuan;
  final IconData ikon;
  final Color warna;
  final List<(String, double?)> nilai;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
        decoration: BoxDecoration(
          color: warna.withValues(alpha: .05),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: warna.withValues(alpha: .14)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Icon(ikon, size: 14, color: warna),
            const SizedBox(width: 5),
            Expanded(
              child: Text(judul.toUpperCase(), style: TextStyle(fontSize: 10.5, letterSpacing: .5, fontWeight: FontWeight.w900, color: warna)),
            ),
            Text(satuan, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.neutral500)),
          ]),
          const SizedBox(height: 6),
          Row(children: [
            for (final (l, v) in nilai)
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(l, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.neutral500)),
                  Text(v == null ? '-' : angkaId(v),
                      style:
                          const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.navy900, fontFeatures: [FontFeature.tabularFigures()])),
                ]),
              ),
            for (var i = nilai.length; i < 4; i++) const Spacer(),
          ]),
        ]),
      );
}

/// v1.0.21 (permintaan Master Guswan 23 Okt 2026): data trafo (nameplate) dari Master Gardu terkini + koordinat trafo yang bisa
/// diketuk untuk membuka Google Maps. Pengganti kartu Pengukuran Terakhir + Arus & Tegangan di tab Pengukuran.
class _KartuDataTrafo extends StatelessWidget {
  const _KartuDataTrafo(this.g, {required this.onLengkap});
  final Gardu g;
  final VoidCallback onLengkap;

  Future<void> _maps(BuildContext context) async {
    final ok = await launchUrl(Uri.parse('https://www.google.com/maps/search/?api=1&query=${g.lat},${g.lng}'), mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(const SnackBar(content: Text('Google Maps tidak bisa dibuka.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    String t(String v) => v.trim().isEmpty ? '-' : v.trim();
    final phb = [g.merkPhb, g.seriPhb, if (g.tahunPhb != null) '${g.tahunPhb}'].where((x) => x.trim().isNotEmpty).join(' · ');
    final isi = <(String, String)>[
      ('Merk', t(g.merk)),
      ('No Seri', t(g.seri)),
      ('Tahun', g.tahun?.toString() ?? '-'),
      ('Asal Trafo', t(g.asalTrafo)),
      ('Konstruksi', t(g.konstruksi)),
      ('Jurusan', t(g.jurusan)),
      ('Arus nominal', g.arusMaks == null ? '-' : '${angkaId(g.arusMaks)} A'),
      ('Kepemilikan', t(g.kepemilikan)),
      ('PHB-TR', t(phb)),
    ];
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.neutral200),
        boxShadow: [BoxShadow(color: AppColors.brand950.withValues(alpha: .05), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
          child: Row(children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(gradient: SisiMotif.gradien, borderRadius: BorderRadius.circular(14)),
              child: const Icon(Icons.electrical_services_rounded, color: Colors.white),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('DATA TRAFO', style: TextStyle(fontSize: 10.5, letterSpacing: .8, fontWeight: FontWeight.w900, color: AppColors.brand700)),
                Text(t(g.merk),
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.navy900)),
              ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(g.kva == null ? '-' : angkaId(g.kva),
                  style: const TextStyle(
                      fontSize: 24, height: 1, fontWeight: FontWeight.w900, color: AppColors.navy900, fontFeatures: [FontFeature.tabularFigures()])),
              const Text('kVA', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.neutral500)),
            ]),
          ]),
        ),
        const Divider(height: 1, color: AppColors.neutral150),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 4),
          child: LayoutBuilder(
            builder: (c, k) => Wrap(runSpacing: 10, children: [
              for (final (l, v) in isi)
                SizedBox(
                  width: k.maxWidth / 2,
                  child: Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(l, style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
                      Text(v, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                    ]),
                  ),
                ),
            ]),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 4),
          child: Material(
            color: g.adaKoordinat ? AppColors.brand50 : AppColors.neutral100,
            borderRadius: BorderRadius.circular(14),
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: g.adaKoordinat ? () => unawaited(_maps(context)) : null,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                child: Row(children: [
                  Icon(Icons.location_on_rounded, color: g.adaKoordinat ? AppColors.red600 : AppColors.neutral400),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Koordinat trafo', style: TextStyle(fontSize: 11, color: AppColors.neutral500)),
                      Text(g.adaKoordinat ? '${g.lat}, ${g.lng}' : 'Belum ada di Master Gardu',
                          style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                    ]),
                  ),
                  if (g.adaKoordinat) ...[
                    const Text('Google Maps', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.brand700)),
                    const SizedBox(width: 4),
                    const Icon(Icons.open_in_new_rounded, size: 16, color: AppColors.brand700),
                  ],
                ]),
              ),
            ),
          ),
        ),
        Align(
          alignment: Alignment.centerLeft,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 4),
            child: TextButton.icon(onPressed: onLengkap, icon: const Icon(Icons.info_outline_rounded, size: 18), label: const Text('Data gardu lengkap')),
          ),
        ),
      ]),
    );
  }
}
