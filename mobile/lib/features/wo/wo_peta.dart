import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../theme/app_colors.dart';
import 'wo_bantu.dart';

/// Titik peta dari koordinat WO "lat, lng"; null = kosong / rusak / 0,0.
LatLng? titikWo(Map<String, dynamic> t) {
  final m = RegExp(r'^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$').firstMatch(teksWo(t['koordinat']));
  if (m == null) return null;
  final lat = double.parse(m.group(1)!), lng = double.parse(m.group(2)!);
  return lat.abs() > 90 || lng.abs() > 180 || (lat == 0 && lng == 0) ? null : LatLng(lat, lng);
}

/// WO yang belum selesai dikerjakan tim (baru + sedang dikerjakan) dan punya titik. Urutan asli dipertahankan.
List<Map<String, dynamic>> woBelumSelesaiBerpeta(List<Map<String, dynamic>> semua) => [
      for (final t in semua)
        if (statusWoDari(t) != StatusWo.selesai && titikWo(t) != null) t
    ];

/// Peta WO tim (ROW, Hartek, Yandal): hanya WO tim ini yang belum selesai, titik merah = baru, biru = sedang dikerjakan. Ketuk titik =
/// kartu ringkas (kode, temuan, lokasi) dengan tombol Buka WO dan Navigasi. Ubin OpenStreetMap (gratis, tersimpan di cache HP).
class PetaWoScreen extends StatefulWidget {
  const PetaWoScreen({super.key, required this.wo, required this.onBuka, this.judul = 'Peta WO'});
  final List<Map<String, dynamic>> wo;
  final void Function(Map<String, dynamic>) onBuka;
  final String judul;

  @override
  State<PetaWoScreen> createState() => _PetaWoScreenState();
}

class _PetaWoScreenState extends State<PetaWoScreen> {
  Map<String, dynamic>? _pilih;
  bool _satelit = false;

  static const _warnaBaru = AppColors.red600, _warnaKerja = Color(0xFF2563EB);
  static const _osm = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  static const _esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

  @override
  Widget build(BuildContext context) {
    final daftar = woBelumSelesaiBerpeta(widget.wo);
    final titik = [for (final t in daftar) titikWo(t)!];
    final baru = daftar.where((t) => statusWoDari(t) == StatusWo.terkirim).length;
    return Scaffold(
      appBar: AppBar(title: Text(widget.judul)),
      body: Stack(children: [
        FlutterMap(
          options: MapOptions(
            initialCameraFit: titik.isEmpty ? null : CameraFit.coordinates(coordinates: titik, padding: const EdgeInsets.all(56), maxZoom: 16),
            initialCenter: const LatLng(-3.0, 106.45),
            initialZoom: 11,
            interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
            onTap: (_, __) => setState(() => _pilih = null),
          ),
          children: [
            TileLayer(urlTemplate: _satelit ? _esri : _osm, userAgentPackageName: 'id.co.pln.toboali.sisi_row', maxNativeZoom: 19),
            MarkerLayer(markers: [
              for (final t in daftar)
                Marker(
                  point: titikWo(t)!,
                  width: 34,
                  height: 34,
                  child: GestureDetector(
                    onTap: () => setState(() => _pilih = t),
                    child: Icon(Icons.location_on,
                        size: identical(t, _pilih) ? 38 : 32,
                        color: statusWoDari(t) == StatusWo.dikerjakan ? _warnaKerja : _warnaBaru,
                        shadows: const [Shadow(color: Color(0x66000000), blurRadius: 4)]),
                  ),
                ),
            ]),
            SimpleAttributionWidget(source: Text(_satelit ? 'Esri, Maxar' : 'OpenStreetMap contributors')),
          ],
        ),
        Positioned(
          top: 10,
          left: 10,
          right: 10,
          child: Material(
            elevation: 3,
            borderRadius: BorderRadius.circular(14),
            color: Colors.white,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(children: [
                const Icon(Icons.circle, size: 12, color: _warnaBaru),
                const SizedBox(width: 6),
                Text('Baru $baru', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                const SizedBox(width: 16),
                const Icon(Icons.circle, size: 12, color: _warnaKerja),
                const SizedBox(width: 6),
                Text('Dikerjakan ${daftar.length - baru}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                const Spacer(),
                Text('${daftar.length} WO belum selesai', style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
              ]),
            ),
          ),
        ),
        Positioned(
          right: 10,
          bottom: _pilih == null ? 28 : 170,
          child: Material(
            color: Colors.white,
            elevation: 3,
            shape: const CircleBorder(),
            child: IconButton(
                tooltip: _satelit ? 'Peta' : 'Satelit',
                onPressed: () => setState(() => _satelit = !_satelit),
                icon: Icon(_satelit ? Icons.map_outlined : Icons.satellite_alt_outlined, color: AppColors.brand800)),
          ),
        ),
        if (daftar.isEmpty)
          const Center(
              child: Card(
                  child: Padding(
                      padding: EdgeInsets.all(16),
                      child: Text('Tidak ada WO belum selesai yang punya koordinat.', style: TextStyle(fontWeight: FontWeight.w700))))),
        if (_pilih != null) Positioned(left: 10, right: 10, bottom: 14, child: _Kartu(t: _pilih!, onBuka: () => widget.onBuka(_pilih!))),
      ]),
    );
  }
}

class _Kartu extends StatelessWidget {
  const _Kartu({required this.t, required this.onBuka});
  final Map<String, dynamic> t;
  final VoidCallback onBuka;

  @override
  Widget build(BuildContext context) {
    final kerja = statusWoDari(t) == StatusWo.dikerjakan;
    final lokasi = [teksWo(t['penyulang']), teksWo(t['section'])].where((x) => x.isNotEmpty).join(' · ');
    final tujuan = uriNavigasiWo(teksWo(t['koordinat']));
    return Material(
      elevation: 6,
      borderRadius: BorderRadius.circular(16),
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text(teksWo(t['kodeTemuan']), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.brand950))),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
              decoration:
                  BoxDecoration(color: (kerja ? const Color(0xFF2563EB) : AppColors.red600).withValues(alpha: .12), borderRadius: BorderRadius.circular(99)),
              child: Text(kerja ? 'Dikerjakan' : 'Baru',
                  style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: kerja ? const Color(0xFF2563EB) : AppColors.red600)),
            ),
          ]),
          const SizedBox(height: 4),
          Text(teksWo(t['jenisTemuan']), style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.neutral700)),
          if (lokasi.isNotEmpty) Text(lokasi, style: const TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
          const SizedBox(height: 10),
          Row(children: [
            if (tujuan != null)
              Expanded(
                  child: OutlinedButton.icon(
                      onPressed: () => launchUrl(tujuan, mode: LaunchMode.externalApplication),
                      icon: const Icon(Icons.navigation_outlined),
                      label: const Text('Navigasi'))),
            if (tujuan != null) const SizedBox(width: 10),
            Expanded(child: FilledButton.icon(onPressed: onBuka, icon: const Icon(Icons.open_in_new_rounded), label: const Text('Buka WO'))),
          ]),
        ]),
      ),
    );
  }
}
