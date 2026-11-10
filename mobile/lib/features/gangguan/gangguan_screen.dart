import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/kolom_pilih.dart';
import '../../widgets/refresh_sisi.dart';
import '../../widgets/sisi_loader.dart';
import '../hartek/hartek_gaya.dart';
import '../insjar/insjar_header.dart';
import 'gangguan_bantu.dart';
import 'gangguan_grafik.dart';
import 'gangguan_kartu.dart';

/// v1.0.38 History Gangguan (menu OPS_REKAP_GANGGUAN) di HP, desain sama dengan website (dua tab berkartu) untuk layar kecil:
///  - Top 12 Penyulang: tahun dipilih, kartu per jenis (periode, grafik PMT | Section + tren + rata-rata, perbandingan 3 tahun);
///    ketuk kolom = rincian penyulang.
///  - Data Gangguan: filter penyulang / Kode FGTM / tanggal, grafik per bulan, perbandingan 3 tahun, pie FGTM, daftar kejadian.
/// Data dari getHistoriGangguan (rentang maks 2 tahun; 3 tahun = 2 panggilan). Butuh sinyal (tidak disimpan offline).
class GangguanScreen extends StatefulWidget {
  const GangguanScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  static const menu = 'OPS_REKAP_GANGGUAN';

  @override
  State<GangguanScreen> createState() => _GangguanScreenState();
}

class _GangguanScreenState extends State<GangguanScreen> {
  static const _tahunAwal = 2022;
  static const _tampilAwal = 40;
  int _tab = 0;
  late int _tahunKini, _tahunTop;
  late DateTime _dari, _sampai;
  String _penyulang = '', _fgtm = '', _jenis = 'penyulang', _pie = 'SEMUA', _sumberPie = 'penyulang', _cari = '';
  int _tampil = _tampilAwal;
  Map<String, List<Map<String, dynamic>>>? _data;
  Map<String, dynamic>? _sinkron;
  final Map<int, Map<String, List<Map<String, dynamic>>>> _tiga = {};
  final Set<int> _muatTiga = {};
  bool _muat = false, _sinkronJalan = false;
  String? _galat, _info;

  Sesi get _sesi => widget.sesi;
  bool get _boleh => _sesi.bisaUbah(GangguanScreen.menu);
  String get _hariIni => isoHariGgn(Wib.dinding(DateTime.now()));

  @override
  void initState() {
    super.initState();
    final k = Wib.dinding(DateTime.now());
    _tahunKini = _tahunTop = k.year;
    _dari = DateTime(k.year);
    _sampai = DateTime(k.year, k.month, k.day);
    unawaited(_muatRentang());
    unawaited(_pastikanTiga(_tahunTop));
  }

  Future<Map<String, dynamic>> _api(String aksi, Map<String, dynamic> data, {Duration? timeout}) =>
      widget.deps.api.call(aksi, token: _sesi.token, data: data, timeout: timeout ?? const Duration(seconds: 60));

  String _galatDari(Object e) =>
      e is ApiException && !e.kode.startsWith('HTTP_') ? KodeError.pesan(e.kode) : 'Butuh sinyal untuk History Gangguan.';

  Map<String, List<Map<String, dynamic>>> _perJenis(Map<String, dynamic> r) => {for (final j in jenisGgnSemua) j.kode: daftarGgn(r[j.kode])};

  Future<void> _muatRentang() async {
    setState(() {
      _muat = true;
      _galat = null;
    });
    try {
      final r = await _api('getHistoriGangguan', {'dari': isoHariGgn(_dari), 'sampai': isoHariGgn(_sampai)});
      if (!mounted) return;
      setState(() {
        _data = _perJenis(r);
        _sinkron = r['sinkron'] is Map ? Map<String, dynamic>.from(r['sinkron'] as Map) : null;
      });
    } catch (e) {
      if (mounted) setState(() => _galat = _galatDari(e));
    } finally {
      if (mounted) setState(() => _muat = false);
    }
  }

  /// Data 3 tahun (tahun-2 .. tahun) per jenis: 2 panggilan (server membatasi rentang 2 tahun), disimpan per tahun.
  Future<void> _pastikanTiga(int tahun) async {
    if (_tiga.containsKey(tahun) || _muatTiga.contains(tahun)) return;
    setState(() => _muatTiga.add(tahun));
    try {
      final t = tigaTahunGgn(tahun), p = rentangTahunGgn(tahun, _hariIni);
      final hasil = await Future.wait([
        _api('getHistoriGangguan', {'dari': '${t[0]}-01-01', 'sampai': '${t[1]}-12-31'}),
        _api('getHistoriGangguan', {'dari': p.dari, 'sampai': p.sampai}),
      ]);
      final a = _perJenis(hasil[0]), b = _perJenis(hasil[1]);
      if (mounted) setState(() => _tiga[tahun] = {for (final j in jenisGgnSemua) j.kode: [...b[j.kode]!, ...a[j.kode]!]});
    } catch (e) {
      if (mounted) setState(() => _galat = _galatDari(e));
    } finally {
      if (mounted) setState(() => _muatTiga.remove(tahun));
    }
  }

  Future<void> _segarkan() async {
    _tiga.clear();
    await Future.wait([_muatRentang(), _pastikanTiga(_tahunTop), if (_sampai.year != _tahunTop) _pastikanTiga(_sampai.year)]);
  }

  Future<void> _perbarui() async {
    setState(() {
      _sinkronJalan = true;
      _info = null;
      _galat = null;
    });
    try {
      final r = await _api('sinkronHistoriGangguan', const {}, timeout: const Duration(minutes: 5));
      final n = r['jumlah'] is Map ? r['jumlah'] as Map : const {};
      if (mounted) setState(() => _info = 'Diperbarui dari sumber: ${n['penyulang'] ?? 0} gangguan penyulang, ${n['ar'] ?? 0} AR, ${n['pickup'] ?? 0} pick up.');
      await _segarkan();
    } catch (e) {
      if (mounted) setState(() => _galat = _galatDari(e));
    } finally {
      if (mounted) setState(() => _sinkronJalan = false);
    }
  }

  String _waktuSinkron() {
    final w = DateTime.tryParse(teksGgn(_sinkron?['waktu']));
    if (w == null) return 'belum pernah';
    final d = Wib.dinding(w);
    return '${d.day} ${bulanPendekGgn[d.month - 1]} ${d.hour.toString().padLeft(2, '0')}.${d.minute.toString().padLeft(2, '0')}';
  }

  // ---------- tampilan bersama ----------

  Widget _kartu({required String jenis, required String judul, String? sub, Widget? kanan, required List<Widget> isi}) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border(top: BorderSide(color: warnaJenisGgn(jenis), width: 4)),
          boxShadow: [BoxShadow(color: AppColors.brand950.withValues(alpha: .05), blurRadius: 12, offset: const Offset(0, 3))],
        ),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Container(width: 10, height: 10, decoration: BoxDecoration(color: warnaJenisGgn(jenis), borderRadius: BorderRadius.circular(3))),
            const SizedBox(width: 8),
            Expanded(child: Text(judul, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900, color: AppColors.brand950))),
            if (kanan != null) kanan,
          ]),
          if (sub != null) Padding(padding: const EdgeInsets.only(top: 3), child: Text(sub, style: const TextStyle(fontSize: 12, color: AppColors.neutral500))),
          const SizedBox(height: 8),
          ...isi,
        ]),
      );

  Widget _total(int n, String ket) => Text.rich(TextSpan(children: [
        TextSpan(text: '$n', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: AppColors.brand950)),
        TextSpan(text: ' $ket', style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
      ]));

  Widget _judulBagian(String t, [String? sub]) => Padding(
        padding: const EdgeInsets.fromLTRB(2, 6, 2, 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(t, style: HartekGaya.judulSeksi),
          if (sub != null) Text(sub, style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
          const SizedBox(height: 6),
          const LegendaAlatGgn(),
        ]),
      );

  Widget _memuat() => const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Center(child: SisiLoader(ukuran: 32)));

  // ---------- tab Top 12 ----------

  List<Widget> _tabTop() {
    final t = _tiga[_tahunTop];
    final p = rentangTahunGgn(_tahunTop, _hariIni), tahun3 = tigaTahunGgn(_tahunTop);
    final berjalan = _tahunTop == _tahunKini;
    return [
      Row(children: [
        const Expanded(child: Text('Top 12 penyulang', style: HartekGaya.judulSeksi)),
        DropdownButton<int>(
          value: _tahunTop,
          underline: const SizedBox.shrink(),
          items: [for (var y = _tahunKini; y >= _tahunAwal; y--) DropdownMenuItem(value: y, child: Text('Tahun $y'))],
          onChanged: (y) {
            if (y == null) return;
            setState(() => _tahunTop = y);
            unawaited(_pastikanTiga(y));
          },
        ),
      ]),
      const LegendaAlatGgn(),
      const SizedBox(height: 10),
      if (t == null) _memuat(),
      if (t != null)
        for (final j in jenisGgnSemua)
          Builder(builder: (context) {
            final top = topPenyulangGgn(t[j.kode]!, j.kode, _tahunTop);
            final total = perTahunGgn(t[j.kode]!, j.kode, _tahunTop);
            return _kartu(
              jenis: j.kode,
              judul: j.label,
              sub: 'Periode ${tglIdGgn(p.dari)} – ${tglIdGgn(p.sampai)}${berjalan ? ' (tahun berjalan)' : ''} · PMT ${total[2].h.pmt} · Section ${total[2].h.section}',
              kanan: _total(total[2].h.jumlah, 'kejadian'),
              isi: [
                if (top.isEmpty)
                  const Text('Belum ada kejadian di tahun ini.', style: TextStyle(fontSize: 13, color: AppColors.neutral400))
                else
                  GrafikTrenGgn(
                    tinggi: 230,
                    namaPanjang: true,
                    lebarMinKolom: 58,
                    kolom: [for (final x in top) KolomGgn(x.nama, x.nama, x.h)],
                    onPilih: (n) => unawaited(bukaRincianGgn(context, baris: t[j.kode]!, jenis: j.kode, penyulang: n, tahun: _tahunTop, hariIni: _hariIni)),
                  ),
                if (top.isNotEmpty)
                  Theme(
                    data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                    child: ExpansionTile(
                      tilePadding: EdgeInsets.zero,
                      title: Text('Perbandingan 3 tahun (${tahun3.join(', ')})',
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.brand800)),
                      children: [_tabelTiga(top, total, tahun3, berjalan, j.kode, t[j.kode]!)],
                    ),
                  ),
              ],
            );
          }),
    ];
  }

  Widget _tabelTiga(List<TopGgn> top, List<KolomGgn> total, List<int> tahun3, bool berjalan, String jenis, List<Map<String, dynamic>> baris) {
    const kepala = TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.neutral500);
    Widget beda(int b) => Text(teksBedaGgn(b), textAlign: TextAlign.right,
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: b > 0 ? WarnaGgn.naik : b < 0 ? WarnaGgn.turun : AppColors.neutral500));
    Widget baris1(Widget nama, List<int> n, {bool tebal = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(children: [
            Expanded(flex: 4, child: nama),
            for (final v in n)
              Expanded(flex: 2, child: Text('$v', textAlign: TextAlign.right, style: TextStyle(fontSize: 12.5, fontWeight: tebal ? FontWeight.w900 : FontWeight.w600))),
            Expanded(flex: 2, child: beda(n[2] - n[1])),
          ]),
        );
    return Column(children: [
      Row(children: [
        const Expanded(flex: 4, child: Text('Penyulang', style: kepala)),
        for (final t in tahun3) Expanded(flex: 2, child: Text('$t${berjalan && t == tahun3[2] ? '*' : ''}', textAlign: TextAlign.right, style: kepala)),
        Expanded(flex: 2, child: Text('vs ${tahun3[1]}', textAlign: TextAlign.right, style: kepala)),
      ]),
      const Divider(height: 10),
      for (final x in top)
        InkWell(
          onTap: () => unawaited(bukaRincianGgn(context, baris: baris, jenis: jenis, penyulang: x.nama, tahun: _tahunTop, hariIni: _hariIni)),
          child: baris1(Text(x.nama, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.brand950), overflow: TextOverflow.ellipsis),
              [for (final t in tahun3) x.perTahun[t] ?? 0]),
        ),
      const Divider(height: 10),
      baris1(const Text('Semua penyulang', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w900)), [for (final k in total) k.h.jumlah], tebal: true),
      if (berjalan)
        Align(
          alignment: Alignment.centerLeft,
          child: Text('* ${tahun3[2]} s.d. hari ini, tahun sebelumnya penuh.', style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
        ),
    ]);
  }

  // ---------- tab Data Gangguan ----------

  List<Map<String, dynamic>> _tersaring(String kode) =>
      saringGgn(_data?[kode] ?? const [], kode, penyulang: _penyulang, fgtm: _fgtm, dari: isoHariGgn(_dari), sampai: isoHariGgn(_sampai));

  List<String> get _daftarPenyulang {
    final s = <String>{};
    for (final m in [_data, _tiga[_tahunTop]]) {
      for (final l in (m?.values ?? const <List<Map<String, dynamic>>>[])) {
        for (final o in l) {
          if (teksGgn(o['penyulang']).isNotEmpty) s.add(teksGgn(o['penyulang']));
        }
      }
    }
    return s.toList()..sort();
  }

  Future<void> _pilihPenyulang() async {
    final v = await bukaPilihan(context, judul: 'Penyulang', terpilih: _penyulang, selaluCari: true,
        pilihan: [const PilihanItem('', 'Semua penyulang'), for (final n in _daftarPenyulang) PilihanItem(n, n)]);
    if (v != null && mounted) setState(() => _penyulang = v);
  }

  Future<void> _pilihFgtm() async {
    final v = await bukaPilihan(context, judul: 'Kode gangguan (FGTM)', terpilih: _fgtm, pilihan: [
      const PilihanItem('', 'Semua kode'),
      for (final g in grupFgtm.entries) PilihanItem(g.key, 'Semua ${g.value}'),
      for (final k in kodeFgtmSemua) PilihanItem(k.kode, '${k.kode} · ${k.label}'),
    ]);
    if (v != null && mounted) setState(() => _fgtm = v);
  }

  Future<void> _pilihTanggal() async {
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(_tahunAwal),
      lastDate: DateTime(_tahunKini, 12, 31),
      initialDateRange: DateTimeRange(start: _dari, end: _sampai),
      helpText: 'Rentang tanggal gangguan (maks 2 tahun)',
    );
    if (r == null || !mounted) return;
    if (r.end.difference(r.start).inDays > 731) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Rentang tanggal maksimal 2 tahun.')));
      return;
    }
    setState(() {
      _dari = r.start;
      _sampai = r.end;
    });
    unawaited(_muatRentang());
    unawaited(_pastikanTiga(r.end.year));
  }

  Widget _chipFilter(IconData ikon, String teks, bool aktif, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(right: 8, bottom: 8),
        child: ActionChip(
          avatar: Icon(ikon, size: 17, color: aktif ? AppColors.brand700 : AppColors.neutral500),
          label: Text(teks, overflow: TextOverflow.ellipsis),
          backgroundColor: aktif ? AppColors.brand50 : Colors.white,
          side: BorderSide(color: aktif ? AppColors.brand500 : AppColors.neutral200),
          onPressed: _muat ? null : onTap,
        ),
      );

  List<Widget> _tabData() {
    if (_data == null) return [if (_galat == null) _memuat()];
    final dari = isoHariGgn(_dari), sampai = isoHariGgn(_sampai);
    final tersaring = {for (final j in jenisGgnSemua) j.kode: _tersaring(j.kode)};
    final tahunB = _sampai.year, banding = _tiga[tahunB];
    final adaFilter = _penyulang.isNotEmpty || _fgtm.isNotEmpty || dari != '$_tahunKini-01-01' || sampai != _hariIni;
    final baris = saringGgn(_data![_jenis]!, _jenis, penyulang: _penyulang, fgtm: _fgtm, dari: dari, sampai: sampai, cari: _cari);
    final grup = grupBulanGgn(baris.take(_tampil).toList(), _jenis);
    final pie = pieFgtm(tersaring[_sumberPie]!, _pie);
    final periode = '${tglIdGgn(dari)} – ${tglIdGgn(sampai)}';
    if (banding == null) unawaited(_pastikanTiga(tahunB));
    return [
      Wrap(children: [
        _chipFilter(Icons.cable_rounded, _penyulang.isEmpty ? 'Semua penyulang' : _penyulang, _penyulang.isNotEmpty, () => unawaited(_pilihPenyulang())),
        _chipFilter(Icons.category_outlined, _fgtm.isEmpty ? 'Semua kode FGTM' : (grupFgtm[_fgtm] != null ? 'Semua ${grupFgtm[_fgtm]}' : _fgtm), _fgtm.isNotEmpty,
            () => unawaited(_pilihFgtm())),
        _chipFilter(Icons.event_rounded, periode, dari != '$_tahunKini-01-01' || sampai != _hariIni, () => unawaited(_pilihTanggal())),
        if (adaFilter)
          TextButton.icon(
            onPressed: () {
              final k = Wib.dinding(DateTime.now());
              setState(() {
                _penyulang = '';
                _fgtm = '';
                _dari = DateTime(k.year);
                _sampai = DateTime(k.year, k.month, k.day);
              });
              unawaited(_muatRentang());
            },
            icon: const Icon(Icons.filter_alt_off_rounded, size: 18),
            label: const Text('Reset'),
          ),
      ]),
      if (_fgtm.isNotEmpty) const Text('Pick up tidak memiliki Kode FGTM, jadi tidak ikut tersaring kode.', style: TextStyle(fontSize: 11.5, color: AppColors.accent700)),
      if (_muat) const LinearProgressIndicator(minHeight: 2),
      _judulBagian('Per bulan', '$periode · ikut filter'),
      for (final j in jenisGgnSemua)
        _kartu(jenis: j.kode, judul: j.label, kanan: _total(tersaring[j.kode]!.length, 'kali'), isi: [
          GrafikTrenGgn(kolom: perBulanRentangGgn(tersaring[j.kode]!, j.kode, dari, sampai), lebarMinKolom: 28),
        ]),
      _judulBagian('Perbandingan 3 tahun',
          '${tigaTahunGgn(tahunB).join(' · ')} · ikut filter penyulang & kode, ${tahunB == _tahunKini ? '$tahunB s.d. hari ini' : 'tahun penuh'}'),
      for (final j in jenisGgnSemua)
        Builder(builder: (context) {
          final isi = banding == null ? null : perTahunGgn(saringGgn(banding[j.kode]!, j.kode, penyulang: _penyulang, fgtm: _fgtm), j.kode, tahunB);
          return _kartu(jenis: j.kode, judul: j.label, kanan: isi == null ? null : _total(isi[2].h.jumlah, 'di $tahunB'), isi: [
            if (isi == null) _memuat() else GrafikTrenGgn(kolom: isi, selisih: true, tinggi: 190),
          ]);
        }),
      _kartu(jenis: _sumberPie, judul: 'Kode FGTM', isi: [
        SegmentedButton<String>(
          showSelectedIcon: false,
          style: const ButtonStyle(visualDensity: VisualDensity.compact),
          segments: const [
            ButtonSegment(value: 'SEMUA', label: Text('Semua')),
            ButtonSegment(value: 'INTERNAL', label: Text('Internal')),
            ButtonSegment(value: 'EXTERNAL', label: Text('External')),
          ],
          selected: {_pie},
          onSelectionChanged: (s) => setState(() => _pie = s.first),
        ),
        const SizedBox(height: 8),
        Wrap(spacing: 6, children: [
          for (final j in jenisGgnSemua.where((j) => j.kode != 'pickup'))
            ChoiceChip(label: Text(j.label), selected: _sumberPie == j.kode, onSelected: (_) => setState(() => _sumberPie = j.kode)),
        ]),
        const SizedBox(height: 10),
        PieFgtmGgn(isi: pie, aktif: _fgtm, onPilih: (k) => setState(() => _fgtm = _fgtm == k ? '' : k)),
      ]),
      const SizedBox(height: 4),
      const Text('Daftar kejadian', style: HartekGaya.judulSeksi),
      const SizedBox(height: 8),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          for (final j in jenisGgnSemua)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text('${j.pendek} (${tersaring[j.kode]!.length})'),
                selected: _jenis == j.kode,
                onSelected: (_) => setState(() {
                  _jenis = j.kode;
                  _tampil = _tampilAwal;
                }),
              ),
            ),
        ]),
      ),
      const SizedBox(height: 8),
      TextField(
        onChanged: (v) => setState(() {
          _cari = v;
          _tampil = _tampilAwal;
        }),
        decoration: InputDecoration(
          hintText: 'Cari peralatan, penyebab, lokasi...',
          prefixIcon: const Icon(Icons.search_rounded),
          isDense: true,
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.neutral200)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.neutral200)),
        ),
      ),
      const SizedBox(height: 10),
      if (_jenis == 'penyulang' && baris.isNotEmpty) _ringkasPadam(baris),
      if (baris.isEmpty) const KosongHartek(ikon: Icons.inbox_outlined, judul: 'Tidak ada kejadian', petunjuk: 'Ubah filter atau kata cari.'),
      for (final g in grup) ...[
        Padding(
          padding: const EdgeInsets.fromLTRB(2, 8, 2, 6),
          child: Text('${g.label} · ${g.isi.length}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w900, color: AppColors.neutral500)),
        ),
        for (final o in g.isi) KartuKejadianGgn(o: o, jenis: _jenis, onTap: () => unawaited(bukaDetailGgn(context, o, _jenis))),
      ],
      if (baris.length > _tampil)
        OutlinedButton(
          onPressed: () => setState(() => _tampil += _tampilAwal),
          child: Text('Tampilkan ${(baris.length - _tampil).clamp(0, _tampilAwal)} lagi'),
        ),
    ];
  }

  Widget _ringkasPadam(List<Map<String, dynamic>> baris) {
    final r = ringkasPadamGgn(baris);
    String ribu(num n) => n.round().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.');
    Widget sel(String l, String v) => Expanded(
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(l, style: const TextStyle(fontSize: 10.5, color: AppColors.neutral500)),
              Text(v, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900, color: AppColors.brand950)),
            ]),
          ),
        );
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.neutral150)),
      child: Column(children: [
        Row(children: [sel('Total padam', teksDurasiGgn(r.durasi)), sel('Rata-rata', teksDurasiGgn(r.rata))]),
        Row(children: [sel('ENS', '${ribu(r.ensKwh)} kWh'), sel('Pelanggan padam', ribu(r.pelanggan))]),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: HartekGaya.latar,
      body: SafeArea(
        child: RefreshSisi(
          onRefresh: _segarkan,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 40),
            children: [
              HeaderInsJar(
                kicker: 'Monitoring',
                judul: 'History Gangguan',
                sub: 'Diperbarui ${_waktuSinkron()} · otomatis 18.00 WIB',
                ikon: Icons.electric_bolt_rounded,
                aksi: [
                  tombolSegarkanHeader(_segarkan, sibuk: _muat),
                  const SizedBox(width: 6),
                  tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => Navigator.maybePop(context)),
                ],
              ),
              if (_boleh)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: FilledButton.icon(
                    onPressed: _sinkronJalan || _muat ? null : () => unawaited(_perbarui()),
                    icon: _sinkronJalan ? const SisiLoader(ukuran: 18, warna: Colors.white) : const Icon(Icons.sync_rounded),
                    label: Text(_sinkronJalan ? 'Memperbarui...' : 'Perbarui Data Gangguan Penyulang'),
                  ),
                ),
              if (_galat != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(14)),
                  child: Row(children: [
                    Expanded(child: Text(_galat!, style: const TextStyle(color: AppColors.red700))),
                    TextButton(onPressed: () => unawaited(_segarkan()), child: const Text('Coba lagi')),
                  ]),
                ),
              if (_info != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: AppColors.success100, borderRadius: BorderRadius.circular(14)),
                  child: Text(_info!, style: const TextStyle(color: AppColors.success700, fontWeight: FontWeight.w700)),
                ),
              SegmentedButton<int>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: 0, icon: Icon(Icons.bolt_rounded), label: Text('Top 12 Penyulang')),
                  ButtonSegment(value: 1, icon: Icon(Icons.insights_rounded), label: Text('Data Gangguan')),
                ],
                selected: {_tab},
                onSelectionChanged: (s) => setState(() => _tab = s.first),
              ),
              const SizedBox(height: 14),
              ...(_tab == 0 ? _tabTop() : _tabData()),
            ],
          ),
        ),
      ),
    );
  }
}
