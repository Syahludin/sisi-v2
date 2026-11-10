import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/gps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/simpan_latar.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/sisi_widgets.dart';
import '../hartek/foto_lapangan.dart';
import '../row/watermark.dart';
import 'switching_form_screen.dart';
import 'switching_model.dart';
import 'switching_repository.dart';

/// 1.0.63 Master Switching (menu OPS_MASTER_SWITCHING, ADMIN / SUPER). Satu layar: ringkasan verifikasi (persen terverifikasi,
/// ketuk angka = saring), jenis berwarna, penyulang, lalu Peta (OpenStreetMap / satelit Esri, gratis tanpa API key) atau Daftar.
/// Ketuk titik / baris = rincian (foto, navigasi, Ubah, ambil foto). Tombol Tambah = form dengan GPS lokasi petugas.
/// Daftar terakhir tersimpan di HP (tetap terbaca tanpa sinyal); simpan + foto butuh sinyal.
class SwitchingScreen extends StatefulWidget {
  const SwitchingScreen({super.key, required this.deps, required this.sesi, this.repo, this.embedded = false});
  final Deps? deps;
  final Sesi sesi;

  /// Untuk uji: repository pengganti (tanpa server). Biasanya null = dari [deps].
  final SwitchingRepository? repo;

  /// true = di dalam Master Jaringan (tab): tanpa bilah judul sendiri.
  final bool embedded;

  @override
  State<SwitchingScreen> createState() => _SwitchingScreenState();
}

const _urlOsm = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const _urlSatelit = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const _paketApp = 'id.co.pln.toboali.sisi_row';
const _pusat = LatLng(-3.0, 106.45);

class _SwitchingScreenState extends State<SwitchingScreen> {
  late final SwitchingRepository _repo = widget.repo ?? SwitchingRepository(widget.deps!.api);
  final _peta = MapController();
  DataSwitching? _data;
  bool _muat = true;
  bool _lokal = false;
  String? _galat;
  String _jenis = '', _penyulang = '', _status = '', _cari = '';
  bool _nonaktif = false, _modePeta = true, _satelit = false, _petaSiap = false, _ringkasBuka = false;
  LatLng? _saya;

  bool get _bolehUbah => SwitchingRepository.bolehUbah(widget.sesi);

  @override
  void initState() {
    super.initState();
    _awal();
  }

  Future<void> _awal() async {
    final l = await _repo.lokal(widget.sesi);
    if (!mounted) return;
    if (l != null) {
      setState(() {
        _data = l;
        _lokal = true;
      });
    }
    await _segarkan();
  }

  Future<void> _segarkan() async {
    setState(() {
      _muat = true;
      _galat = null;
    });
    try {
      final d = await _repo.muat(widget.sesi);
      if (!mounted) return;
      setState(() {
        _data = d;
        _lokal = false;
        _muat = false;
      });
      _pasPeta();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _muat = false;
        _galat = e is ApiException ? KodeError.pesan(e.kode) : 'Tidak bisa terhubung ke server.';
      });
    }
  }

  List<Switching> get _tampil =>
      saringSwitching(_data?.switching ?? const [], jenis: _jenis, penyulang: _penyulang, status: _status, cari: _cari, nonaktif: _nonaktif);

  void _pasPeta() {
    if (!_petaSiap) return;
    final t = [
      for (final s in _tampil)
        if (s.adaTitik) LatLng(s.lat!, s.lng!)
    ];
    if (t.isEmpty) return;
    if (t.length == 1) {
      _peta.move(t.first, 16);
    } else {
      _peta.fitCamera(CameraFit.coordinates(coordinates: t, padding: const EdgeInsets.all(48), maxZoom: 16));
    }
  }

  Future<void> _lokasiSaya() async {
    final g = await Gps.siapkan();
    if (g != null) {
      if (mounted) tampilPesan(context, g);
      return;
    }
    final p = await Geolocator.getLastKnownPosition() ?? await Gps.sampelPertama(batas: const Duration(seconds: 12));
    if (!mounted || p == null) return;
    setState(() => _saya = LatLng(p.latitude, p.longitude));
    if (_petaSiap) _peta.move(_saya!, 17);
  }

  void _ubahSaring(VoidCallback f) {
    setState(f);
    WidgetsBinding.instance.addPostFrameCallback((_) => _pasPeta());
  }

  Future<void> _bukaForm({Switching? s}) async {
    final d = _data;
    if (d == null) return;
    final kiriman = await Navigator.push<(IsianSwitching, Map<String, String>)>(
      context,
      MaterialPageRoute(builder: (_) => SwitchingFormScreen(sesi: widget.sesi, repo: _repo, data: d, awal: s, penyulangAwal: _penyulang)),
    );
    if (kiriman == null || !mounted) return;
    simpanLatar(context, kerja: () => _kirim(kiriman.$1, kiriman.$2), sesudah: () => unawaited(_segarkan()));
  }

  /// Simpan data lalu kirim foto satu per satu (di latar belakang). Foto gagal tidak membatalkan data: dikembalikan sebagai catatan.
  Future<String?> _kirim(IsianSwitching i, Map<String, String> foto) async {
    var hasil = await _repo.simpan(widget.sesi, i, data: _data);
    final gagal = <String>[];
    for (final (slot, label) in slotFotoSwitching) {
      final path = foto[slot];
      if (path == null) continue;
      try {
        await _repo.unggahFoto(widget.sesi, hasil.id, slot, path);
        hasil = hasil.salin({
          'foto': {...?(hasil.d['foto'] as Map?)?.cast<String, dynamic>(), slot: true}
        });
      } catch (_) {
        gagal.add(label);
      }
    }
    if (mounted) setState(() => _data = _data?.ganti(hasil));
    return gagal.isEmpty ? null : 'Data tersimpan, foto ${gagal.join(', ')} belum terkirim. Ambil ulang dari rincian switching.';
  }

  void _rincian(Switching s) {
    if (s.adaTitik && _petaSiap && _modePeta) _peta.move(LatLng(s.lat!, s.lng!), 17);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _RincianSwitching(
        s: s,
        data: _data!,
        repo: _repo,
        sesi: widget.sesi,
        bolehUbah: _bolehUbah,
        onUbah: () {
          Navigator.pop(context);
          _bukaForm(s: s);
        },
        onFotoBaru: (baru) => setState(() => _data = _data?.ganti(baru)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    final r = ringkasSwitching(d?.switching ?? const []);
    final tampil = _tampil;
    return Scaffold(
      appBar: widget.embedded
          ? null
          : AppBar(
              title: const Text('Master Jaringan'),
              actions: [
                IconButton(
                    tooltip: 'Muat ulang',
                    onPressed: _muat ? null : _segarkan,
                    icon: _muat ? const SizedBox(width: 22, height: 22, child: SisiLoader(ukuran: 22)) : const Icon(Icons.refresh_rounded)),
              ],
            ),
      floatingActionButton: _bolehUbah && d != null
          ? FloatingActionButton.extended(
              onPressed: () => _bukaForm(),
              backgroundColor: AppColors.brand700,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add_location_alt_outlined),
              label: const Text('Tambah Switching'),
            )
          : null,
      body: d == null
          ? (_muat
              ? const SisiLoading(pesan: 'Memuat switching')
              : SisiKosong(judul: 'Belum bisa memuat', pesan: _galat ?? 'Coba lagi.', ikon: Icons.cloud_off_outlined))
          : Column(children: [
              if (_galat != null || _lokal)
                Container(
                  width: double.infinity,
                  color: AppColors.accent100,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Text(
                    _galat != null ? 'Data tersimpan di HP. $_galat' : 'Menampilkan data tersimpan di HP, memperbarui…',
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.accent700),
                  ),
                ),
              _BarisSaring(
                penyulang: d.penyulang,
                pilih: _penyulang,
                onPenyulang: (p) => _ubahSaring(() => _penyulang = p),
                modePeta: _modePeta,
                onMode: (m) => setState(() => _modePeta = m),
                cari: _cari,
                onCari: (v) => _ubahSaring(() => _cari = v),
                nonaktif: _nonaktif,
                jumlahNonaktif: r.nonaktif,
                onNonaktif: (v) => _ubahSaring(() => _nonaktif = v),
              ),
              Expanded(child: _modePeta ? _petaWidget(tampil, r) : _daftar(tampil, r)),
            ]),
    );
  }

  Widget _petaWidget(List<Switching> tampil, RingkasSwitching r) {
    return Stack(children: [
      FlutterMap(
        mapController: _peta,
        options: MapOptions(
          initialCenter: _pusat,
          initialZoom: 11,
          interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
          onMapReady: () {
            _petaSiap = true;
            _pasPeta();
          },
        ),
        children: [
          TileLayer(urlTemplate: _satelit ? _urlSatelit : _urlOsm, userAgentPackageName: _paketApp, maxNativeZoom: 19),
          MarkerLayer(markers: [
            for (final s in tampil)
              if (s.adaTitik)
                Marker(
                  point: LatLng(s.lat!, s.lng!),
                  width: 44,
                  height: 26,
                  child: GestureDetector(onTap: () => _rincian(s), child: _Penanda(s: s)),
                ),
            if (_saya != null)
              Marker(
                point: _saya!,
                width: 22,
                height: 22,
                child: Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFF1A73E8),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 3),
                    boxShadow: const [BoxShadow(color: Color(0x551A73E8), blurRadius: 8, spreadRadius: 4)],
                  ),
                ),
              ),
          ]),
          SimpleAttributionWidget(source: Text(_satelit ? 'Esri, Maxar' : 'OpenStreetMap contributors')),
        ],
      ),
      // ringkasan + jenis mengambang di atas peta (terlipat 1 baris), peta tetap memakai seluruh sisa layar
      Positioned(
        top: 8,
        left: 8,
        right: 8,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _Ringkasan(
            r: r,
            status: _status,
            onStatus: (s) => _ubahSaring(() => _status = _status == s ? '' : s),
            ringkas: !_ringkasBuka,
            onLipat: () => setState(() => _ringkasBuka = !_ringkasBuka),
          ),
          const SizedBox(height: 8),
          _BarisJenis(r: r, jenis: _jenis, onJenis: (j) => _ubahSaring(() => _jenis = _jenis == j ? '' : j), mengambang: true),
        ]),
      ),
      // tombol peta di kiri bawah: tidak tertutup panel atas maupun tombol Tambah di kanan bawah
      Positioned(
        left: 10,
        bottom: 28,
        child: Column(children: [
          _TombolPeta(
              ikon: _satelit ? Icons.map_outlined : Icons.satellite_alt_outlined,
              tooltip: _satelit ? 'Peta' : 'Satelit',
              onTap: () => setState(() => _satelit = !_satelit)),
          const SizedBox(height: 10),
          _TombolPeta(ikon: Icons.my_location_rounded, tooltip: 'Lokasi Saya', onTap: _lokasiSaya),
          const SizedBox(height: 10),
          _TombolPeta(ikon: Icons.fit_screen_outlined, tooltip: 'Tampilkan Semua', onTap: _pasPeta),
          const SizedBox(height: 10),
          _TombolPeta(ikon: Icons.refresh_rounded, tooltip: 'Muat Ulang', onTap: _muat ? () {} : _segarkan),
        ]),
      ),
      if (tampil.isEmpty)
        const Center(
          child: Card(
            child: Padding(padding: EdgeInsets.all(14), child: Text('Belum Ada Switching yang Cocok', style: TextStyle(fontWeight: FontWeight.w700))),
          ),
        ),
    ]);
  }

  Widget _daftar(List<Switching> tampil, RingkasSwitching r) {
    // mode Daftar: ringkasan + jenis ikut tergulir bersama daftar (tidak memakan tinggi tetap)
    final kepala = <Widget>[
      _Ringkasan(r: r, status: _status, onStatus: (s) => _ubahSaring(() => _status = _status == s ? '' : s)),
      const SizedBox(height: 10),
      _BarisJenis(r: r, jenis: _jenis, onJenis: (j) => _ubahSaring(() => _jenis = _jenis == j ? '' : j)),
      const SizedBox(height: 12),
    ];
    if (tampil.isEmpty) {
      return RefreshIndicator(
        onRefresh: _segarkan,
        child: ListView(padding: const EdgeInsets.fromLTRB(12, 4, 12, 96), children: [
          ...kepala,
          const SizedBox(height: 40),
          const SisiKosong(
              judul: 'Belum Ada Switching', pesan: 'Tambah switching saat berada di lokasinya, atau ubah saringan.', ikon: Icons.electrical_services_outlined),
        ]),
      );
    }
    final urut = [...tampil];
    if (_saya != null) {
      double j(Switching s) => s.adaTitik ? jarakMeter(_saya!.latitude, _saya!.longitude, s.lat!, s.lng!) : double.infinity;
      urut.sort((a, b) => j(a).compareTo(j(b)));
    }
    return RefreshIndicator(
      onRefresh: _segarkan,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 96),
        itemCount: urut.length + 1,
        separatorBuilder: (_, i) => SizedBox(height: i == 0 ? 0 : 10),
        itemBuilder: (_, i) {
          if (i == 0) return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: kepala);
          final s = urut[i - 1];
          final jarak = _saya != null && s.adaTitik ? jarakMeter(_saya!.latitude, _saya!.longitude, s.lat!, s.lng!) : null;
          return _BarisSwitching(s: s, jarak: jarak, onTap: () => _rincian(s));
        },
      ),
    );
  }
}

class _Ringkasan extends StatelessWidget {
  const _Ringkasan({required this.r, required this.status, required this.onStatus, this.ringkas = false, this.onLipat});
  final RingkasSwitching r;
  final String status;
  final void Function(String) onStatus;

  /// true = satu baris (di atas peta); ketuk panel = buka / lipat ([onLipat]).
  final bool ringkas;
  final VoidCallback? onLipat;

  @override
  Widget build(BuildContext context) {
    Widget angka(String kode, String label, int n, Color w) => Expanded(
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => onStatus(kode),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
              decoration: BoxDecoration(
                color: status == kode ? w.withValues(alpha: .12) : AppColors.neutral50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: status == kode ? w : AppColors.neutral150),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('$n', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: w)),
                const SizedBox(height: 2),
                Text(label,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.neutral500, height: 1.25)),
              ]),
            ),
          ),
        );
    final judul = Row(children: [
      Text('${r.total}', style: TextStyle(fontSize: ringkas ? 20 : 26, fontWeight: FontWeight.w900, color: AppColors.brand950, height: 1)),
      const SizedBox(width: 10),
      const Expanded(
        child: Text('Switching Aktif',
            maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.neutral700)),
      ),
      const SizedBox(width: 12),
      Text('${r.persen}% Terverifikasi', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: AppColors.success700)),
      if (onLipat != null) ...[
        const SizedBox(width: 6),
        Icon(ringkas ? Icons.expand_more_rounded : Icons.expand_less_rounded, color: AppColors.neutral500),
      ],
    ]);
    final isi = Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
      judul,
      const SizedBox(height: 8),
      ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: LinearProgressIndicator(
            value: r.total == 0 ? 0 : r.terverifikasi / r.total, minHeight: 6, backgroundColor: AppColors.neutral150, color: AppColors.success600),
      ),
      if (!ringkas) ...[
        const SizedBox(height: 12),
        Row(children: [
          angka('TERVERIFIKASI', 'Terverifikasi', r.terverifikasi, AppColors.success700),
          const SizedBox(width: 10),
          angka('PERLU_PERBAIKAN', 'Perlu Perbaikan', r.perluPerbaikan, AppColors.accent700),
          const SizedBox(width: 10),
          angka('BELUM', 'Belum Diverifikasi', r.belum, AppColors.red700),
        ]),
        if (r.tanpaTitik > 0) ...[
          const SizedBox(height: 8),
          Text('${r.tanpaTitik} switching belum punya titik koordinat (tidak tampil di peta).',
              style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: AppColors.neutral500)),
        ],
      ],
    ]);
    return Material(
      color: Colors.white,
      elevation: onLipat != null ? 3 : 0,
      shadowColor: const Color(0x33000000),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onLipat,
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral150)),
          child: isi,
        ),
      ),
    );
  }
}

class _BarisJenis extends StatelessWidget {
  const _BarisJenis({required this.r, required this.jenis, required this.onJenis, this.mengambang = false});
  final RingkasSwitching r;
  final String jenis;
  final void Function(String) onJenis;
  final bool mengambang; // di atas peta: chip berbayang

  @override
  Widget build(BuildContext context) {
    Widget chip(String kode, String label, int n, Color? w) {
      final aktif = jenis == kode;
      return Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(
          elevation: mengambang ? 2 : 0,
          shadowColor: const Color(0x33000000),
          selected: aktif,
          onSelected: (_) => onJenis(kode),
          showCheckmark: false,
          avatar: w == null ? null : CircleAvatar(backgroundColor: w, radius: 6),
          label: Text('$label $n'),
          labelStyle: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: aktif ? Colors.white : AppColors.neutral700),
          selectedColor: AppColors.brand950,
          backgroundColor: Colors.white,
          side: BorderSide(color: aktif ? AppColors.brand950 : AppColors.neutral200),
          visualDensity: VisualDensity.compact,
        ),
      );
    }

    return SizedBox(
      height: 42,
      child: ListView(scrollDirection: Axis.horizontal, padding: EdgeInsets.zero, children: [
        chip('', 'Semua', r.total, null),
        for (final j in jenisSwitching) chip(j.kode, j.kode, r.jenis[j.kode] ?? 0, j.warna),
      ]),
    );
  }
}

class _BarisSaring extends StatelessWidget {
  const _BarisSaring({
    required this.penyulang,
    required this.pilih,
    required this.onPenyulang,
    required this.modePeta,
    required this.onMode,
    required this.cari,
    required this.onCari,
    required this.nonaktif,
    required this.jumlahNonaktif,
    required this.onNonaktif,
  });
  final List<String> penyulang;
  final String pilih;
  final void Function(String) onPenyulang;
  final bool modePeta;
  final void Function(bool) onMode;
  final String cari;
  final void Function(String) onCari;
  final bool nonaktif;
  final int jumlahNonaktif;
  final void Function(bool) onNonaktif;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 6, 12, 8),
      child: Column(children: [
        Row(children: [
          Expanded(
            child: DropdownButtonFormField<String>(
              initialValue: penyulang.contains(pilih) ? pilih : '',
              isExpanded: true,
              decoration: const InputDecoration(isDense: true, labelText: 'Penyulang', border: OutlineInputBorder()),
              items: [
                const DropdownMenuItem(value: '', child: Text('Semua Penyulang')),
                for (final p in penyulang) DropdownMenuItem(value: p, child: Text(p, overflow: TextOverflow.ellipsis)),
              ],
              onChanged: (v) => onPenyulang(v ?? ''),
            ),
          ),
          const SizedBox(width: 12),
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: true, icon: Icon(Icons.map_outlined), label: Text('Peta')),
              ButtonSegment(value: false, icon: Icon(Icons.list_alt_rounded), label: Text('Daftar')),
            ],
            selected: {modePeta},
            showSelectedIcon: false,
            style: const ButtonStyle(visualDensity: VisualDensity.compact),
            onSelectionChanged: (v) => onMode(v.first),
          ),
        ]),
        if (!modePeta) ...[
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: TextFormField(
                initialValue: cari,
                decoration: const InputDecoration(
                    isDense: true, prefixIcon: Icon(Icons.search), hintText: 'Cari nama, ID, merk kontroler', border: OutlineInputBorder()),
                onChanged: onCari,
              ),
            ),
            if (jumlahNonaktif > 0) ...[
              const SizedBox(width: 6),
              FilterChip(label: Text('Nonaktif $jumlahNonaktif'), selected: nonaktif, onSelected: onNonaktif, visualDensity: VisualDensity.compact),
            ],
          ]),
        ],
      ]),
    );
  }
}

class _Penanda extends StatelessWidget {
  const _Penanda({required this.s});
  final Switching s;

  @override
  Widget build(BuildContext context) {
    final j = infoJenis(s.jenis);
    final perlu = s.statusVerifikasi == 'PERLU_PERBAIKAN';
    return Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: j.warna,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: perlu ? AppColors.accent400 : Colors.white, width: perlu ? 3 : 2),
        boxShadow: const [BoxShadow(color: Color(0x44000000), blurRadius: 4, offset: Offset(0, 1))],
      ),
      child: Text(j.kode, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900)),
    );
  }
}

class _TombolPeta extends StatelessWidget {
  const _TombolPeta({required this.ikon, required this.tooltip, required this.onTap});
  final IconData ikon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.white,
        elevation: 3,
        shape: const CircleBorder(),
        child: IconButton(tooltip: tooltip, onPressed: onTap, icon: Icon(ikon, color: AppColors.brand800)),
      );
}

Color _warnaStatus(String kelas) => switch (kelas) { 'ok' => AppColors.success700, 'proses' => AppColors.accent700, _ => AppColors.red700 };

class _LencanaStatus extends StatelessWidget {
  const _LencanaStatus(this.status);
  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, kelas) = infoStatus(status);
    final w = _warnaStatus(kelas);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: w.withValues(alpha: .1), borderRadius: BorderRadius.circular(99)),
      child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: w)),
    );
  }
}

class _BarisSwitching extends StatelessWidget {
  const _BarisSwitching({required this.s, required this.onTap, this.jarak});
  final Switching s;
  final VoidCallback onTap;
  final double? jarak;

  @override
  Widget build(BuildContext context) {
    final j = infoJenis(s.jenis);
    final ket =
        [s.penyulang, s.id, if (s.teks('posisiNormal') == 'NO') 'NO', if (!s.adaTitik) 'tanpa titik', if (jarak != null) _teksJarak(jarak!)].join(' · ');
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.neutral150)),
          child: Row(children: [
            Container(
              width: 46,
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(color: j.warna, borderRadius: BorderRadius.circular(10)),
              child: Text(j.kode, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 12)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.nama,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.brand950)),
                const SizedBox(height: 2),
                Text(ket, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
              ]),
            ),
            const SizedBox(width: 8),
            _LencanaStatus(s.statusVerifikasi),
          ]),
        ),
      ),
    );
  }
}

String _teksJarak(double m) => m < 1000 ? '${m.round()} m' : '${(m / 1000).toStringAsFixed(1)} km';

/// Lembar rincian: status, foto 3 slot (ketuk = ambil foto baru, langsung dikirim), data, Navigasi + Ubah.
class _RincianSwitching extends StatefulWidget {
  const _RincianSwitching({
    required this.s,
    required this.data,
    required this.repo,
    required this.sesi,
    required this.bolehUbah,
    required this.onUbah,
    required this.onFotoBaru,
  });
  final Switching s;
  final DataSwitching data;
  final SwitchingRepository repo;
  final Sesi sesi;
  final bool bolehUbah;
  final VoidCallback onUbah;
  final void Function(Switching) onFotoBaru;

  @override
  State<_RincianSwitching> createState() => _RincianSwitchingState();
}

class _RincianSwitchingState extends State<_RincianSwitching> {
  late Switching _s = widget.s;
  final Map<String, Uint8List> _foto = {};
  final Set<String> _sibuk = {};
  final Map<String, String> _galat = {};

  @override
  void initState() {
    super.initState();
    for (final (slot, _) in slotFotoSwitching) {
      if (_s.adaFoto(slot)) _muatFoto(slot);
    }
  }

  Future<void> _muatFoto(String slot) async {
    setState(() => _sibuk.add(slot));
    try {
      final b = await widget.repo.foto(widget.sesi, _s.id, slot);
      if (mounted) setState(() => _foto[slot] = Uint8List.fromList(b));
    } catch (e) {
      if (mounted) setState(() => _galat[slot] = e is ApiException ? KodeError.pesan(e.kode) : 'Foto gagal dimuat.');
    }
    if (mounted) setState(() => _sibuk.remove(slot));
  }

  Future<void> _ambilFoto(String slot, String label) async {
    String? path;
    try {
      path = await FotoLapangan.ambil(context,
          label: label,
          folder: 'switching',
          pratinjau: watermarkSwitching(widget.sesi, _s.nama, _s.penyulang, label, _s.adaTitik ? '${_s.lat}, ${_s.lng}' : null));
    } catch (e) {
      if (mounted) tampilPesan(context, '$e'.replaceFirst('Exception: ', ''));
      return;
    }
    if (path == null || !mounted) return;
    setState(() {
      _sibuk.add(slot);
      _galat.remove(slot);
    });
    try {
      await widget.repo.unggahFoto(widget.sesi, _s.id, slot, path);
      final b = await FotoLapangan.baca(path);
      _s = _s.salin({
        'foto': {...?(_s.d['foto'] as Map?)?.cast<String, dynamic>(), slot: true}
      });
      widget.onFotoBaru(_s);
      if (mounted && b != null) setState(() => _foto[slot] = Uint8List.fromList(b));
    } catch (e) {
      if (mounted) setState(() => _galat[slot] = e is ApiException ? KodeError.pesan(e.kode) : 'Foto gagal dikirim. Periksa sinyal lalu coba lagi.');
    }
    if (mounted) setState(() => _sibuk.remove(slot));
  }

  @override
  Widget build(BuildContext context) {
    final s = _s;
    final j = infoJenis(s.jenis);
    String nama(String id) => id.isEmpty ? '' : '$id ${labelSwitching(widget.data.cari(id)?.jenis ?? '', widget.data.cari(id)?.nama ?? '')}'.trim();
    final baris = <(String, String)>[
      ('Penyulang', s.penyulang),
      ('Posisi normal', labelPilihan('posisiNormal', s.teks('posisiNormal'))),
      ('Status operasi', labelPilihan('statusOperasi', s.teks('statusOperasi'))),
      ('Koordinat', s.adaTitik ? '${s.lat}, ${s.lng}' : 'belum ada'),
      ('Switching hulu', nama(s.teks('switchingHuluId'))),
      ('Proteksi hulu (bisa trip)', nama(s.teks('proteksiHuluId'))),
      ('Kontroler', [s.teks('merkKontroler'), s.teks('tipeKontroler')].where((x) => x.isNotEmpty).join(' / ')),
      ('Firmware', s.teks('versiFirmware')),
      (
        'Rasio CT / VT',
        s.teks('rasioCt').isEmpty && s.teks('rasioVt').isEmpty
            ? ''
            : '${s.teks('rasioCt').isEmpty ? '-' : s.teks('rasioCt')} / ${s.teks('rasioVt').isEmpty ? '-' : s.teks('rasioVt')}'
      ),
      ('Bisa trip', s.ya('bisaTrip') ? 'Ya' : 'Tidak'),
      ('Indikator gangguan (FPI)', s.ya('catatGangguan') ? 'Ya' : 'Tidak'),
      ('Baca arus / tegangan', '${s.ya('bacaArus') ? 'Ya' : 'Tidak'} / ${s.ya('bacaTegangan') ? 'Ya' : 'Tidak'}'),
      ('SCADA', s.ya('terhubungScada') ? 'Ya${s.teks('kodeRtu').isEmpty ? '' : ', RTU ${s.teks('kodeRtu')}'}' : 'Tidak'),
      if (s.jenis == 'FCO')
        ('Fuse', [labelPilihan('fungsiFco', s.teks('fungsiFco')), s.teks('fuseTipe'), s.teks('fuseRating')].where((x) => x.isNotEmpty).join(', ')),
      if (s.ya('titikHubung')) ('Titik hubung ke', s.teks('penyulangSisiB')),
      ('Tiang', s.teks('tiangId')),
      ('Data unit', [s.teks('merk'), s.teks('tipe'), s.teks('nomorSeri')].where((x) => x.isNotEmpty).join(' / ')),
      ('Kondisi', labelPilihan('kondisi', s.teks('kondisi'))),
      ('Catatan', s.teks('catatan')),
    ];
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .72,
      minChildSize: .4,
      maxChildSize: .95,
      builder: (_, gulir) => ListView(controller: gulir, padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.neutral200, borderRadius: BorderRadius.circular(2)))),
        const SizedBox(height: 12),
        Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(color: j.warna, borderRadius: BorderRadius.circular(10)),
            child: Text(j.kode, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.nama, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.brand950)),
              Text('${s.id}${s.aktif ? '' : ' · NONAKTIF'}', style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
            ]),
          ),
          _LencanaStatus(s.statusVerifikasi),
        ]),
        const SizedBox(height: 14),
        const Text('Foto', style: TextStyle(fontWeight: FontWeight.w900, color: AppColors.brand950)),
        const SizedBox(height: 8),
        Row(children: [
          for (final (slot, label) in slotFotoSwitching) ...[
            Expanded(child: _kotakFoto(slot, label)),
            if (slot != slotFotoSwitching.last.$1) const SizedBox(width: 8),
          ],
        ]),
        const SizedBox(height: 14),
        const Text('Data Switching', style: TextStyle(fontWeight: FontWeight.w900, color: AppColors.brand950)),
        const SizedBox(height: 4),
        for (final (k, v) in baris)
          if (v.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 9),
              decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.neutral100))),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(
                    width: 150,
                    child: Text(proper(k), style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.neutral500, height: 1.35))),
                const SizedBox(width: 14),
                Expanded(child: Text(v, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: AppColors.brand950, height: 1.35))),
              ]),
            ),
        const SizedBox(height: 16),
        Row(children: [
          if (s.adaTitik)
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () =>
                    launchUrl(Uri.parse('https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}'), mode: LaunchMode.externalApplication),
                icon: const Icon(Icons.navigation_outlined),
                label: const Text('Navigasi'),
              ),
            ),
          if (s.adaTitik && widget.bolehUbah) const SizedBox(width: 10),
          if (widget.bolehUbah)
            Expanded(
              child: FilledButton.icon(onPressed: widget.onUbah, icon: const Icon(Icons.edit_outlined), label: const Text('Ubah / Verifikasi')),
            ),
        ]),
      ]),
    );
  }

  Widget _kotakFoto(String slot, String label) {
    final b = _foto[slot];
    final sibuk = _sibuk.contains(slot);
    return Column(children: [
      AspectRatio(
        aspectRatio: 4 / 3,
        child: Material(
          color: AppColors.neutral100,
          borderRadius: BorderRadius.circular(10),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: sibuk || !widget.bolehUbah ? null : () => _ambilFoto(slot, label),
            child: sibuk
                ? const Center(child: SisiLoader(ukuran: 24))
                : b != null
                    ? Image.memory(b, fit: BoxFit.cover)
                    : Center(child: Icon(widget.bolehUbah ? Icons.add_a_photo_outlined : Icons.image_not_supported_outlined, color: AppColors.neutral400)),
          ),
        ),
      ),
      const SizedBox(height: 4),
      Text(_galat[slot] ?? label,
          maxLines: 2,
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _galat[slot] != null ? AppColors.red700 : AppColors.neutral700)),
    ]);
  }
}

/// Watermark foto switching (kamera SiSi): kode = nama switching, penyulang, koordinat titik bila ada.
DataWatermark watermarkSwitching(Sesi s, String nama, String penyulang, String slot, String? koordinat) => DataWatermark(
      kodeEksekusi: nama.isEmpty ? 'Switching' : nama,
      ulp: s.ulp,
      tim: s.timNama.isEmpty ? 'Admin' : s.timNama,
      subTim: s.nama,
      penyulang: penyulang.isEmpty ? null : penyulang,
      section: null,
      waktu: DateTime.now(),
      koordinat: koordinat,
      diameter: null,
      jenis: 'Master Switching',
      slot: slot,
      labelKode: 'Switching',
      tampilDiameter: false,
    );
