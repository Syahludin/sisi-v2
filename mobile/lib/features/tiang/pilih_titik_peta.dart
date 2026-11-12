import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import '../../core/gps.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';

const _urlOsm = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const _urlSatelit = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const _paketApp = 'id.co.pln.toboali.sisi_row';
/// Citra Esri di luar kota tidak punya ubin lebih dekat dari zoom 17 (tampil "Map data not yet available"): di atasnya ubin diperbesar.
const _zoomEsriMaks = 17;
const _pusatBawaan = LatLng(-3.0, 106.45);

/// Pilih titik tiang di peta: geser peta sampai tanda + tepat di tiang, lalu "Pakai Titik Ini" (hasil = LatLng lewat Navigator.pop).
/// [awal] = titik yang sudah terisi, [terdaftar] = koordinat aset tiang (ditandai sebagai acuan, bila ada).
class PilihTitikPetaScreen extends StatefulWidget {
  const PilihTitikPetaScreen({super.key, this.awal, this.terdaftar});
  final LatLng? awal, terdaftar;

  @override
  State<PilihTitikPetaScreen> createState() => _PilihTitikPetaScreenState();
}

class _PilihTitikPetaScreenState extends State<PilihTitikPetaScreen> {
  final _peta = MapController();
  bool _satelit = true;
  late LatLng _tengah = widget.awal ?? widget.terdaftar ?? _pusatBawaan;
  LatLng? _saya;

  @override
  void initState() {
    super.initState();
    if (widget.awal == null && widget.terdaftar == null) _lokasiSaya();
  }

  Future<void> _lokasiSaya() async {
    final g = await Gps.siapkan();
    if (g != null) {
      if (mounted) tampilPesan(context, g);
      return;
    }
    final p = await Geolocator.getLastKnownPosition() ?? await Gps.sampelPertama(batas: const Duration(seconds: 12));
    if (!mounted || p == null) return;
    final l = LatLng(p.latitude, p.longitude);
    setState(() => _saya = l);
    _peta.move(l, 18);
  }

  @override
  Widget build(BuildContext context) {
    final mulai = widget.awal ?? widget.terdaftar;
    return Scaffold(
      appBar: AppBar(title: const Text('Pilih Titik Tiang')),
      body: Stack(children: [
        FlutterMap(
          mapController: _peta,
          options: MapOptions(
            initialCenter: _tengah,
            initialZoom: mulai == null ? 11 : 18,
            maxZoom: 21,
            interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
            onPositionChanged: (k, _) => _tengah = k.center,
          ),
          children: [
            TileLayer(urlTemplate: _satelit ? _urlSatelit : _urlOsm, userAgentPackageName: _paketApp, maxNativeZoom: _satelit ? _zoomEsriMaks : 19, maxZoom: 21),
            MarkerLayer(markers: [
              if (widget.terdaftar != null)
                Marker(point: widget.terdaftar!, width: 28, height: 28, child: const Icon(Icons.flag_rounded, color: AppColors.accent600, size: 26)),
              if (_saya != null)
                Marker(
                  point: _saya!,
                  width: 18,
                  height: 18,
                  child: Container(
                      decoration: BoxDecoration(color: const Color(0xFF1A73E8), shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 3))),
                ),
            ]),
            SimpleAttributionWidget(source: Text(_satelit ? 'Esri, Maxar' : 'OpenStreetMap contributors')),
          ],
        ),
        // tanda + tetap di tengah layar: titik yang dipakai = pusat peta
        const IgnorePointer(
            child: Center(child: Icon(Icons.add_rounded, size: 44, color: AppColors.red600, shadows: [Shadow(color: Colors.white, blurRadius: 4)]))),
        Positioned(
          left: 12,
          bottom: 92,
          child: Column(children: [
            FloatingActionButton.small(
                heroTag: 'satelit',
                tooltip: _satelit ? 'Peta' : 'Satelit',
                backgroundColor: Colors.white,
                onPressed: () => setState(() => _satelit = !_satelit),
                child: Icon(_satelit ? Icons.map_outlined : Icons.satellite_alt_outlined, color: AppColors.brand800)),
            const SizedBox(height: 10),
            FloatingActionButton.small(
                heroTag: 'saya',
                tooltip: 'Lokasi Saya',
                backgroundColor: Colors.white,
                onPressed: _lokasiSaya,
                child: const Icon(Icons.my_location_rounded, color: AppColors.brand800)),
          ]),
        ),
        Positioned(
          left: 16,
          right: 16,
          bottom: 20,
          child: FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: AppColors.brand700, minimumSize: const Size.fromHeight(52)),
            onPressed: () => Navigator.pop(context, _tengah),
            icon: const Icon(Icons.check_rounded),
            label: const Text('Pakai Titik Ini', style: TextStyle(fontWeight: FontWeight.w800)),
          ),
        ),
      ]),
    );
  }
}
