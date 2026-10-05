import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/gps.dart';
import '../../widgets/foto_slot.dart';
import '../../widgets/mock_gps_warning_dialog.dart';
import '../../widgets/sisi_widgets.dart';
import 'foto_repository.dart';
import 'row_model.dart';
import 'watermark.dart';

/// Ketuk kotak foto. Sudah ada foto (`pathAda`): Lihat / Ambil Ulang dari Kamera / Galeri; belum ada: Kamera / Galeri.
/// Kamera = kamera SiSi (landscape, watermark tampil langsung). Hasil: foto baru, null = batal atau hanya melihat.
/// `pratinjau` = isi watermark yang sudah diketahui layar pemanggil (kode, penyulang, section, diameter, ...).
Future<FotoBaru?> ambilFotoRow(BuildContext context,
    {required String slot, required DataWatermark pratinjau, String? pathAda, String? keterangan, String? namaGaleri}) async {
  final pilih = await pilihSumberFoto(context, slot, adaFoto: pathAda != null);
  if (pilih == null || !context.mounted) return null;
  if (pilih == 'LIHAT') {
    await lihatFoto(context, path: pathAda!, slot: slot, keterangan: keterangan, namaGaleri: namaGaleri);
    return null;
  }
  if (pilih == 'KAMERA') {
    return Navigator.of(context).push<FotoBaru>(
      MaterialPageRoute(fullscreenDialog: true, builder: (_) => KameraRowScreen(pratinjau: pratinjau)),
    );
  }
  final f = await FotoRepository.ambil(ImageSource.gallery);
  if (f == null) return null;
  final b = await f.readAsBytes();
  if (b.length < 2 || b[0] != 0xFF || b[1] != 0xD8) {
    if (context.mounted) tampilPesan(context, 'Foto harus JPEG.');
    return null;
  }
  DateTime? waktu;
  try {
    waktu = await f.lastModified();
  } catch (_) {/* waktu simpan */}
  return FotoBaru(f, 'GALERI', diambil: waktu);
}

/// Kamera ROW (paket camera): layar dikunci landscape, GPS hidup terus selama kamera terbuka (diambil ulang
/// otomatis tiap foto), watermark tampil di pratinjau sama persis dengan yang dibakar saat disimpan.
/// Lokasi palsu (mock) ditolak. Hasil: FotoBaru (file + waktu jepret + posisi GPS saat jepret).
class KameraRowScreen extends StatefulWidget {
  const KameraRowScreen({super.key, required this.pratinjau});
  final DataWatermark pratinjau;

  @override
  State<KameraRowScreen> createState() => _KameraRowScreenState();
}

class _KameraRowScreenState extends State<KameraRowScreen> with WidgetsBindingObserver {
  CameraController? _c;
  StreamSubscription<Position>? _gps;
  Position? _pos;
  final List<Position> _baru = []; // sampel segar <= 10 detik untuk rata-rata saat jepret (v0.41)
  String? _galat;
  String? _galatGps;
  bool _jepret = false;
  FlashMode _flash = FlashMode.off;
  Timer? _jam;
  DateTime _sekarang = DateTime.now();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    SystemChrome.setPreferredOrientations([DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    _jam = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _sekarang = DateTime.now());
    });
    _bukaKamera();
    _mulaiGps();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _jam?.cancel();
    _gps?.cancel();
    _c?.dispose();
    SystemChrome.setPreferredOrientations(const []); // kembali ke bawaan app
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final c = _c;
    if (state == AppLifecycleState.inactive) {
      _c = null;
      c?.dispose();
      if (mounted) setState(() {});
    } else if (state == AppLifecycleState.resumed && c == null) {
      _bukaKamera();
    }
  }

  Future<void> _bukaKamera() async {
    try {
      final daftar = await availableCameras();
      if (daftar.isEmpty) throw CameraException('NoCamera', 'tidak ada kamera');
      final belakang = daftar.firstWhere((k) => k.lensDirection == CameraLensDirection.back, orElse: () => daftar.first);
      final c = CameraController(belakang, ResolutionPreset.veryHigh, enableAudio: false, imageFormatGroup: ImageFormatGroup.jpeg);
      await c.initialize();
      await c.setFlashMode(_flash);
      if (!mounted) {
        await c.dispose();
        return;
      }
      setState(() {
        _c = c;
        _galat = null;
      });
    } on CameraException catch (e) {
      if (!mounted) return;
      setState(() => _galat = e.code.startsWith('CameraAccess')
          ? 'Izin kamera ditolak. Izinkan kamera untuk SiSi di Pengaturan HP.'
          : 'Kamera tidak bisa dibuka (${e.code}).');
    }
  }

  Future<void> _mulaiGps() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        if (mounted) setState(() => _galatGps = 'GPS mati');
        return;
      }
      var izin = await Geolocator.checkPermission();
      if (izin == LocationPermission.denied) izin = await Geolocator.requestPermission();
      if (izin == LocationPermission.denied || izin == LocationPermission.deniedForever) {
        if (mounted) setState(() => _galatGps = 'Izin lokasi ditolak');
        return;
      }
      // v0.40: aliran dengan cadangan GPS mentah; yang dipakai = sampel terbaik yang masih segar (<= 10 detik),
      // supaya akurasi tidak melompat-lompat di HP lemah. Sampel palsu (mock) selalu diteruskan supaya ditolak.
      _gps = Gps.aliran().listen((p) {
        if (!mounted) return;
        if (!p.isMocked && !Gps.valid(p)) return; // akurasi 0 / tidak valid dibuang (v0.41.1)
        if (!p.isMocked) {
          _baru.add(p);
          _baru.removeWhere((x) => DateTime.now().difference(x.timestamp).abs() > const Duration(seconds: 10));
        }
        final lama = _pos;
        final segar = lama != null && DateTime.now().difference(lama.timestamp).abs() <= const Duration(seconds: 10);
        if (!p.isMocked && lama != null && segar && p.accuracy > lama.accuracy) return;
        setState(() {
          _pos = p;
          _galatGps = null;
        });
      }, onError: (_) {
        if (mounted) setState(() => _galatGps = 'GPS gagal');
      });
    } catch (_) {
      if (mounted) setState(() => _galatGps = 'GPS gagal');
    }
  }

  DataWatermark get _data {
    final p = _pos;
    return p == null
        ? widget.pratinjau.copyWith(waktu: _sekarang)
        : widget.pratinjau.copyWith(waktu: _sekarang, koordinat: Koordinat.format(p.latitude, p.longitude), akurasiM: p.accuracy);
  }

  Future<void> _gantiFlash() async {
    final c = _c;
    if (c == null) return;
    final baru = _flash == FlashMode.off ? FlashMode.auto : (_flash == FlashMode.auto ? FlashMode.always : FlashMode.off);
    try {
      await c.setFlashMode(baru);
      setState(() => _flash = baru);
    } on CameraException catch (_) {/* HP tanpa flash */}
  }

  Future<void> _ambil() async {
    final c = _c;
    if (c == null || !c.value.isInitialized || c.value.isTakingPicture || _jepret) return;
    final p = _pos;
    if (p != null && p.isMocked) {
      await tampilkanMockGpsWarning(context);
      return;
    }
    setState(() => _jepret = true);
    try {
      final f = await c.takePicture();
      final waktu = DateTime.now();
      final b = await f.readAsBytes();
      if (!await Watermark.landscape(b)) {
        if (mounted) tampilPesan(context, FotoRepository.pesanLandscape);
        return;
      }
      if (!mounted) return;
      // titik = rata-rata berbobot sampel 10 detik terakhir (lebih stabil); tanpa sampel = posisi terakhir
      final t = Gps.gabung([for (final x in _baru) Gps.sampel(x)]);
      Navigator.pop(
        context,
        FotoBaru(f, 'KAMERA',
            diambil: waktu, lat: t?.lat ?? p?.latitude, lng: t?.lng ?? p?.longitude, akurasiM: t?.akurasi ?? p?.accuracy),
      );
    } on CameraException catch (e) {
      if (mounted) tampilPesan(context, 'Gagal mengambil foto (${e.code}).');
    } finally {
      if (mounted) setState(() => _jepret = false);
    }
  }

  Widget _chipGps() {
    final p = _pos;
    final (String teks, Color warna) = p == null
        ? (_galatGps ?? 'Mencari GPS...', const Color(0xFFB91C1C))
        : (p.isMocked
            ? ('Lokasi palsu', const Color(0xFFB91C1C))
            : ('GPS ±${p.accuracy.toStringAsFixed(0)} m',
                p.accuracy <= Gps.target
                    ? const Color(0xFF15803D)
                    : (p.accuracy <= Gps.sedang ? const Color(0xFFB45309) : const Color(0xFFB91C1C))));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: warna, borderRadius: BorderRadius.circular(20)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.my_location_rounded, size: 14, color: Colors.white),
        const SizedBox(width: 6),
        Text(teks, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = _c;
    final siap = c != null && c.value.isInitialized;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Row(children: [
        Expanded(
          child: Center(
            child: _galat != null
                ? Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_galat!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 15)),
                  )
                : !siap
                    ? const CircularProgressIndicator(color: Colors.white)
                    : AspectRatio(
                        aspectRatio: c.value.aspectRatio > 1 ? c.value.aspectRatio : 1 / c.value.aspectRatio,
                        child: Stack(fit: StackFit.expand, children: [
                          CameraPreview(c),
                          WatermarkPratinjau(data: _data),
                        ]),
                      ),
          ),
        ),
        SafeArea(
          left: false,
          child: SizedBox(
            width: 104,
            child: Column(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              IconButton(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close_rounded, color: Colors.white, size: 30),
                tooltip: 'Tutup',
              ),
              GestureDetector(
                onTap: siap && !_jepret ? _ambil : null,
                child: Container(
                  width: 74,
                  height: 74,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 4),
                    color: siap && !_jepret ? Colors.white24 : Colors.white10,
                  ),
                  child: _jepret
                      ? const Padding(padding: EdgeInsets.all(22), child: CircularProgressIndicator(color: Colors.white, strokeWidth: 3))
                      : const Icon(Icons.camera_alt_rounded, color: Colors.white, size: 32),
                ),
              ),
              Column(children: [
                IconButton(
                  onPressed: siap ? _gantiFlash : null,
                  icon: Icon(
                      _flash == FlashMode.off
                          ? Icons.flash_off_rounded
                          : (_flash == FlashMode.auto ? Icons.flash_auto_rounded : Icons.flash_on_rounded),
                      color: Colors.white),
                  tooltip: 'Flash',
                ),
                Padding(padding: const EdgeInsets.only(bottom: 10), child: FittedBox(child: _chipGps())),
              ]),
            ]),
          ),
        ),
      ]),
    );
  }
}

/// Pratinjau watermark di atas kamera, proporsi sama dengan hasil akhir (Watermark._gambarWatermark).
class WatermarkPratinjau extends StatelessWidget {
  const WatermarkPratinjau({super.key, required this.data});
  final DataWatermark data;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, box) {
      final s = box.maxWidth < box.maxHeight ? box.maxWidth : box.maxHeight;
      final huruf = s * Watermark.rasioHuruf, tepi = s * Watermark.rasioTepi, jarak = huruf * 0.55;
      TextStyle gaya(double u, FontWeight b, Color w) => TextStyle(
          color: w, fontSize: u, fontWeight: b, height: 1.18,
          shadows: const [Shadow(color: Color(0x99000000), blurRadius: 3, offset: Offset(1, 1))]);
      return IgnorePointer(
        child: Stack(children: [
          Positioned(
            left: tepi,
            bottom: tepi,
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: box.maxWidth * 0.72),
              child: IntrinsicWidth(
                child: Container(
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(color: Watermark.warnaKotak, borderRadius: BorderRadius.circular(huruf * 0.6)),
                  child: IntrinsicHeight(
                    child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Container(width: huruf * 0.22, color: Watermark.warnaAksen),
                      Expanded(
                        child: Padding(
                          padding: EdgeInsets.all(jarak),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
                            Row(mainAxisSize: MainAxisSize.min, children: [
                              Image.asset(Watermark.logoSisi,
                                  height: huruf * 2.3, errorBuilder: (context, error, stack) => const SizedBox.shrink()),
                              SizedBox(width: jarak),
                              Flexible(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                                  Text('SiSi · ULP ${data.ulp}', style: gaya(huruf * 1.1, FontWeight.w800, Colors.white)),
                                  Text(data.judul, style: gaya(huruf * 0.95, FontWeight.w700, Watermark.warnaSub)),
                                ]),
                              ),
                            ]),
                            Container(height: 1, margin: EdgeInsets.symmetric(vertical: jarak * 0.6), color: const Color(0x66FFFFFF)),
                            Table(
                              defaultColumnWidth: const IntrinsicColumnWidth(),
                              columnWidths: const {2: FlexColumnWidth()},
                              children: [
                                for (final b in data.baris)
                                  TableRow(children: [
                                    Text(b.$1, style: gaya(huruf, FontWeight.w500, Watermark.warnaLabel)),
                                    Padding(
                                        padding: EdgeInsets.symmetric(horizontal: jarak * 0.5),
                                        child: Text(':', style: gaya(huruf, FontWeight.w600, Colors.white))),
                                    Text(b.$2, style: gaya(huruf, FontWeight.w700, Colors.white)),
                                  ]),
                              ],
                            ),
                          ]),
                        ),
                      ),
                    ]),
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            right: tepi,
            top: tepi,
            child: Container(
              padding: EdgeInsets.all(huruf * 0.35),
              decoration: BoxDecoration(color: const Color(0xD9FFFFFF), borderRadius: BorderRadius.circular(huruf * 0.5)),
              child: Image.asset(Watermark.logoPln, height: s * Watermark.rasioLogoPln,
                  errorBuilder: (context, error, stack) => const SizedBox.shrink()),
            ),
          ),
        ]),
      );
    });
  }
}
