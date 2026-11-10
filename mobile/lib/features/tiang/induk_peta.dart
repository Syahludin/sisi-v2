import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../theme/app_colors.dart';

/// Peta kecil di form verifikasi: titik tiang yang sedang diverifikasi (merah) dan titik induknya (biru) dengan garis di antaranya,
/// supaya admin bisa menilai induk benar atau salah. Peta ikut berpindah saat induk diganti. Ubin OpenStreetMap.
class IndukPeta extends StatelessWidget {
  const IndukPeta({super.key, required this.ini, required this.induk});
  final LatLng? ini, induk;

  static const _osm = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  @override
  Widget build(BuildContext context) {
    final titik = [if (ini != null) ini!, if (induk != null) induk!];
    if (titik.isEmpty) return const SizedBox.shrink();
    return Container(
      height: 190,
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.neutral150)),
      clipBehavior: Clip.antiAlias,
      child: FlutterMap(
        key: ValueKey('${induk?.latitude}|${induk?.longitude}|${ini?.latitude}|${ini?.longitude}'),
        options: MapOptions(
          initialCameraFit: titik.length == 1
              ? null
              : CameraFit.coordinates(coordinates: titik, padding: const EdgeInsets.all(40), maxZoom: 19),
          initialCenter: titik.first,
          initialZoom: 18,
          interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
        ),
        children: [
          TileLayer(urlTemplate: _osm, userAgentPackageName: 'id.co.pln.toboali.sisi_row', maxNativeZoom: 19),
          if (titik.length == 2) PolylineLayer(polylines: [Polyline(points: titik, strokeWidth: 3, color: AppColors.brand700)]),
          MarkerLayer(markers: [
            if (induk != null) _penanda(induk!, const Color(0xFF2563EB)),
            if (ini != null) _penanda(ini!, AppColors.red600),
          ]),
          const SimpleAttributionWidget(source: Text('OpenStreetMap contributors')),
        ],
      ),
    );
  }

  Marker _penanda(LatLng p, Color warna) => Marker(
      point: p,
      width: 34,
      height: 34,
      child: Icon(Icons.location_on, size: 32, color: warna, shadows: const [Shadow(color: Color(0x66000000), blurRadius: 4)]));
}
