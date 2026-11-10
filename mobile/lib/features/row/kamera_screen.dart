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
import 'row_repository.dart' show RowError;
import 'row_model.dart';
import 'watermark.dart';
import '../../widgets/sisi_loader.dart';

/// Ketuk kotak foto. Sudah ada foto (`pathAda`): Lihat / Ambil Ulang dari Kamera / Galeri; belum ada: Kamera / Galeri.
/// `bolehGaleri: false` (P0 Yandal): sudah ada = Lihat Foto / Ambil Ulang dari Kamera; belum ada = langsung kamera.
/// Kamera = kamera SiSi (landscape, watermark tampil langsung). Hasil: foto baru, null = batal atau hanya melihat.
/// `pratinjau` = isi watermark yang sudah diketahui layar pemanggil (kode, penyulang, section, diameter, ...).
Future<FotoBaru?> ambilFotoRow(BuildContext context,
    {required String slot, required DataWatermark pratinjau, String? pathAda, String? keterangan, String? namaGaleri,
    bool bolehGaleri = true, String? alasanTidakUlang, bool p0 = false, Future<void> Function(FotoBaru foto)? simpan}) async {
  // v0.64.5: kamera saja + slot kosong = satu-satunya pilihan, langsung buka kamera (tanpa menu).
  final pilih = !bolehGaleri && pathAda == null
      ? 'KAMERA'
      : await pilihSumberFoto(context, slot, adaFoto: pathAda != null, bolehGaleri: bolehGaleri, alasanTidakUlang: alasanTidakUlang);
  if (pilih == null || !context.mounted) return null;
  if (pilih == 'LIHAT') {
    await lihatFoto(context, path: pathAda!, slot: slot, keterangan: keterangan, namaGaleri: namaGaleri);
    return null;
  }
  if (pilih == 'KAMERA') {
    return Navigator.of(context, rootNavigator: true).push<FotoBaru>(
      MaterialPageRoute(fullscreenDialog: true, builder: (_) => KameraRowScreen(pratinjau: pratinjau, p0: p0, simpan: simpan)),
    );
  }
  if (!bolehGaleri) return null;
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
///
/// v0.65.3 (P0) / v0.65.4 (ROW juga), keputusan Master Guswan 8 Okt 2026: shutter TIDAK dikunci GPS. Sesudah jepret tampil
/// REVIEW foto + watermark (proporsi sama dengan hasil akhir). Fix segar saat jepret = koordinat langsung terkunci.
/// Belum ada = GPS terus dicari selama review maks [GpsSusulan.jendela] sejak jepret, watermark ikut terisi begitu titik
/// didapat; lewat = tanpa koordinat GPS (bukan titik salah). Gunakan tanpa koordinat = kartu verifikasi dulu
/// ("Koordinat belum didapat"). Ambil Ulang = kembali ke kamera.
/// `p0`: jam watermark = jam terpercaya pemanggil (pratinjau.waktu) dan watermark menandai "susulan N dtk".
/// ROW: jam = jam HP saat jepret (FotoBaru.diambil, sama dengan yang dibakar), tanpa GPS = koordinat input pekerjaan.
///
/// v0.65.5 `simpan` (P0; v0.65.6 juga detail eksekusi ROW, keputusan Master Guswan 8 Okt 2026): verifikasi foto langsung di review kamera. Tombol Simpan Foto
/// memanggil [simpan] (foto disimpan + dikunci); gagal = pesan, tetap di review (bisa Ambil Ulang). Berhasil = kamera ditutup.
class KameraRowScreen extends StatefulWidget {
  const KameraRowScreen({super.key, required this.pratinjau, this.p0 = false, this.simpan});
  final DataWatermark pratinjau;
  final bool p0;
  final Future<void> Function(FotoBaru foto)? simpan;

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

  /// v0.65.3: foto sedang direview. null = layar kamera.
  _Review? _review;
  final List<SampelSusulan> _susulan = [];

  /// v0.65.5: [KameraRowScreen.simpan] sedang berjalan.
  bool _menyimpan = false;

  /// Selisih jam watermark (jam terpercaya dari pemanggil) terhadap jam HP, supaya jam di review = jam yang dibakar.
  Duration _geserJam = Duration.zero;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    SystemChrome.setPreferredOrientations([DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    if (widget.p0) _geserJam = widget.pratinjau.waktu.difference(DateTime.now());
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
      _genKamera++; // v0.62.7: pembukaan kamera yang masih berjalan jadi basi
      _c = null;
      c?.dispose();
      if (mounted) setState(() {});
    } else if (state == AppLifecycleState.resumed && c == null) {
      _bukaKamera();
    }
  }

  /// v0.62.7 (audit 7 Okt 2026): app ke latar saat kamera masih dibuka lalu kembali = dua pembukaan berjalan bersamaan.
  /// Hanya yang terbaru yang dipasang; yang basi langsung ditutup (dulu bisa terpasang controller lama / bocor).
  int _genKamera = 0;

  Future<void> _bukaKamera() async {
    final gen = ++_genKamera;
    try {
      final daftar = await availableCameras();
      if (daftar.isEmpty) throw CameraException('NoCamera', 'tidak ada kamera');
      final belakang = daftar.firstWhere((k) => k.lensDirection == CameraLensDirection.back, orElse: () => daftar.first);
      final c = CameraController(belakang, ResolutionPreset.veryHigh, enableAudio: false, imageFormatGroup: ImageFormatGroup.jpeg);
      try {
        await c.initialize();
        await c.setFlashMode(_flash);
      } catch (_) {
        await c.dispose();
        rethrow;
      }
      if (!mounted || gen != _genKamera) {
        await c.dispose();
        return;
      }
      setState(() {
        _c = c;
        _galat = null;
      });
    } on CameraException catch (e) {
      if (!mounted || gen != _genKamera) return;
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
        final rv = _review;
        if (rv != null) {
          // v0.65.3: review. Lokasi palsu = foto dibuang. Belum ada titik = sampel dikumpulkan selama jendela susulan.
          if (p.isMocked) {
            _ulang();
            unawaited(tampilkanMockGpsWarning(context));
            return;
          }
          if (rv.titik == null && rv.sejak.elapsed <= GpsSusulan.jendela) {
            _susulan.add((s: Gps.sampel(p), t: rv.waktu.add(rv.sejak.elapsed)));
            setState(() {});
          }
          return;
        }
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

  /// v0.65.2: fix segar saat jepret (<= Gps.umurMaks). Mode susulan tidak memakai posisi basi.
  bool _segar(Position? p) => p != null && !p.isMocked && DateTime.now().difference(p.timestamp).abs() <= Gps.umurMaks;

  /// Ambil Ulang dari review: foto dibuang, kembali ke kamera.
  void _ulang() {
    if (!mounted || _menyimpan) return;
    setState(() {
      _review = null;
      _susulan.clear();
    });
  }

  /// Titik review saat ini: terkunci saat jepret, atau susulan terpilih (null = belum / tidak didapat).
  ({double lat, double lng, double akurasi, int? detik})? _titikReview(_Review rv) {
    final t = rv.titik;
    if (t != null) return (lat: t.lat, lng: t.lng, akurasi: t.akurasi, detik: null);
    final h = GpsSusulan.pilih(_susulan, rv.waktu);
    return h == null ? null : (lat: h.lat, lng: h.lng, akurasi: h.akurasi, detik: h.detik);
  }

  bool _masihMencari(_Review rv) => rv.titik == null && _galatGps == null && rv.sejak.elapsed < GpsSusulan.jendela;

  /// Gunakan Foto. Tanpa koordinat = kartu verifikasi dulu.
  Future<void> _gunakan() async {
    final rv = _review;
    if (rv == null || _menyimpan) return;
    var h = _titikReview(rv);
    if (h == null) {
      final pilih = await _kartuTanpaKoordinat(rv);
      if (!mounted || _review != rv) return;
      if (pilih == 'ULANG') {
        _ulang();
        return;
      }
      if (pilih != 'TANPA') return; // tunggu GPS / batal
      h = _titikReview(rv); // GPS bisa datang selagi kartu terbuka
    }
    final foto = FotoBaru(rv.file, 'KAMERA',
        diambil: rv.waktu, lat: h?.lat, lng: h?.lng, akurasiM: h?.akurasi, gpsSusulanDetik: h?.detik, sejakJepret: rv.sejak);
    final simpan = widget.simpan;
    if (simpan != null) {
      // v0.65.5: verifikasi di kamera. Gagal = tetap di review supaya bisa Ambil Ulang.
      setState(() => _menyimpan = true);
      try {
        await simpan(foto);
      } on RowError catch (e) {
        if (mounted) tampilPesan(context, e.pesan);
        return;
      } catch (_) {
        if (mounted) tampilPesan(context, 'Foto gagal disimpan. Coba lagi.');
        return;
      } finally {
        if (mounted) setState(() => _menyimpan = false);
      }
      if (!mounted) return;
    }
    _review = null;
    _susulan.clear();
    Navigator.pop(context, foto);
  }

  /// Kartu verifikasi: koordinat belum didapat. Hasil: TANPA | ULANG | TUNGGU | null.
  Future<String?> _kartuTanpaKoordinat(_Review rv) => showDialog<String>(
        context: context,
        builder: (c) => AlertDialog(
          icon: const Icon(Icons.location_off_rounded, color: Color(0xFFB91C1C), size: 32),
          title: const Text('Koordinat belum didapat'),
          content: Text([
            _galatGps != null
                ? 'GPS tidak bisa dipakai ($_galatGps).'
                : _masihMencari(rv)
                    ? 'GPS masih dicari (sisa ${(GpsSusulan.jendela - rv.sejak.elapsed).inSeconds} detik).'
                    : 'GPS tidak didapat dalam ${GpsSusulan.jendela.inSeconds} detik sesudah foto diambil.',
            widget.p0
                ? 'Kalau tetap dipakai, foto disimpan TANPA koordinat: titik pekerjaan / closing dan jarak bisa kosong, '
                    'dan akan terlihat oleh admin saat verifikasi.'
                : (widget.pratinjau.koordinat ?? '').trim().isEmpty
                    ? 'Kalau tetap dipakai, foto disimpan TANPA koordinat GPS dan koordinat di watermark kosong.'
                    : 'Kalau tetap dipakai, foto disimpan TANPA koordinat GPS. Watermark memakai koordinat pekerjaan (input).',
          ].join('\n\n')),
          actions: [
            if (_masihMencari(rv)) TextButton(onPressed: () => Navigator.pop(c, 'TUNGGU'), child: const Text('Tunggu GPS')),
            TextButton(onPressed: () => Navigator.pop(c, 'ULANG'), child: const Text('Ambil Ulang')),
            FilledButton(onPressed: () => Navigator.pop(c, 'TANPA'), child: Text(widget.simpan != null ? 'Simpan tanpa koordinat' : 'Pakai tanpa koordinat')),
          ],
        ),
      );

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
      if (!mounted) return; // v0.62.5
      setState(() => _flash = baru);
    } on CameraException catch (_) {/* HP tanpa flash */}
  }

  Future<void> _ambil() async {
    final c = _c;
    if (c == null || !c.value.isInitialized || c.value.isTakingPicture || _jepret || _review != null) return;
    final p = _pos;
    if (p != null && p.isMocked) {
      await tampilkanMockGpsWarning(context);
      return;
    }
    setState(() => _jepret = true);
    try {
      final f = await c.takePicture();
      final sejak = Stopwatch()..start(); // v0.65.3: umur foto (monoton) sampai disimpan
      final waktu = DateTime.now();
      final b = await f.readAsBytes();
      if (!await Watermark.landscape(b)) {
        if (mounted) tampilPesan(context, FotoRepository.pesanLandscape);
        return;
      }
      if (!mounted) return;
      // titik = rata-rata berbobot sampel 10 detik terakhir (lebih stabil); tanpa sampel = posisi terakhir.
      // v0.65.3: sampel basi dibuang dulu (selama review aliran tidak mengisi _baru; dulu hanya dibuang saat sampel baru datang).
      _baru.removeWhere((x) => DateTime.now().difference(x.timestamp).abs() > const Duration(seconds: 10));
      final t = Gps.gabung([for (final x in _baru) Gps.sampel(x)]);
      // v0.65.3 / v0.65.4: review dulu (P0 + ROW). Titik terkunci saat jepret = rata-rata 10 detik / fix segar (posisi basi
      // tidak dipakai lagi, petugas bisa sudah pindah); selain itu susulan selama review.
      final ukuran = await decodeImageFromList(b);
      final rasio = ukuran.width / ukuran.height;
      ukuran.dispose();
      if (!mounted) return;
      final titik = t != null
          ? (lat: t.lat, lng: t.lng, akurasi: t.akurasi)
          : (_segar(p) ? (lat: p!.latitude, lng: p.longitude, akurasi: p.accuracy) : null);
      setState(() {
        _susulan.clear();
        _review = _Review(file: f, bytes: b, waktu: waktu, rasio: rasio, sejak: sejak, titik: titik);
      });
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
    return PopScope(
      canPop: !_menyimpan, // v0.65.5: jangan keluar selagi foto disimpan
      child: Scaffold(
        backgroundColor: Colors.black,
        body: _review != null ? _layarReview(_review!) : _layarKamera(c, siap),
      ),
    );
  }

  /// v0.65.3: review foto + watermark (sama proporsi dengan hasil akhir) sebelum dipakai.
  Widget _layarReview(_Review rv) {
    final h = _titikReview(rv);
    final mencari = h == null && _masihMencari(rv);
    final sisa = (GpsSusulan.jendela - rv.sejak.elapsed).inSeconds.clamp(0, GpsSusulan.jendela.inSeconds);
    final data = DataWatermark(
      kodeEksekusi: widget.pratinjau.kodeEksekusi,
      ulp: widget.pratinjau.ulp,
      tim: widget.pratinjau.tim,
      subTim: widget.pratinjau.subTim,
      penyulang: widget.pratinjau.penyulang,
      section: widget.pratinjau.section,
      waktu: rv.waktu.add(_geserJam),
      // tanpa GPS: ROW = koordinat input pekerjaan "(input)" (sama dengan hasil akhir), P0 = kosong
      koordinat: h == null ? widget.pratinjau.koordinat : Koordinat.format(h.lat, h.lng),
      akurasiM: h?.akurasi,
      diameter: widget.pratinjau.diameter,
      jenis: widget.pratinjau.jenis,
      slot: widget.pratinjau.slot,
      sumber: widget.pratinjau.sumber,
      labelKode: widget.pratinjau.labelKode,
      labelSubTim: widget.pratinjau.labelSubTim,
      tampilDiameter: widget.pratinjau.tampilDiameter,
      gpsSusulanDetik: widget.p0 ? h?.detik : null, // ROW: penanda susulan tidak dibakar ke foto
    );
    final (String teks, Color warna, IconData ikon) = h != null
        ? ('Koordinat ±${h.akurasi.toStringAsFixed(0)} m${h.detik == null ? '' : ' (susulan ${h.detik} dtk)'}',
            const Color(0xFF15803D), Icons.my_location_rounded)
        : mencari
            ? ('Mencari GPS... $sisa dtk. Tetap di titik foto.', const Color(0xFFB45309), Icons.gps_not_fixed_rounded)
            : ('Koordinat belum didapat', const Color(0xFFB91C1C), Icons.location_off_rounded);
    return Row(children: [
      Expanded(
        child: Center(
          child: AspectRatio(
            aspectRatio: rv.rasio,
            child: Stack(fit: StackFit.expand, children: [
              Image.memory(rv.bytes, fit: BoxFit.fill, gaplessPlayback: true),
              WatermarkPratinjau(data: data),
            ]),
          ),
        ),
      ),
      SafeArea(
        left: false,
        child: SizedBox(
          width: 150,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
            child: Column(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Text('Review foto', textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w800)),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: warna, borderRadius: BorderRadius.circular(12)),
                child: Column(children: [
                  Icon(ikon, color: Colors.white, size: 20),
                  const SizedBox(height: 4),
                  Text(teks, textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700)),
                ]),
              ),
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                if (widget.simpan != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                        widget.p0
                            ? 'Sudah benar? Foto yang disimpan tidak bisa diambil ulang.'
                            : 'Sudah benar? Foto langsung disimpan ke HP.',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white70, fontSize: 11)),
                  ),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white54)),
                  onPressed: _menyimpan ? null : _ulang,
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  label: const Text('Ambil Ulang'),
                ),
                const SizedBox(height: 8),
                FilledButton.icon(
                  onPressed: _menyimpan ? null : () => unawaited(_gunakan()),
                  icon: _menyimpan
                      ? const SisiLoader(ukuran: 16, warna: Colors.white)
                      : Icon(widget.simpan != null ? Icons.verified_rounded : Icons.check_rounded, size: 18),
                  label: Text(widget.simpan != null ? 'Simpan Foto' : 'Gunakan'),
                ),
              ]),
            ]),
          ),
        ),
      ),
    ]);
  }

  Widget _layarKamera(CameraController? c, bool siap) {
    return Row(children: [
        Expanded(
          child: Center(
            child: _galat != null
                ? Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_galat!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 15)),
                  )
                : !siap || c == null
                    ? const SisiLoader(warna: Colors.white)
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
                      ? const Padding(padding: EdgeInsets.all(22), child: SisiLoader(warna: Colors.white))
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
      ]);
  }
}

/// v0.65.3: foto yang sedang direview (belum keluar dari kamera).
class _Review {
  _Review({required this.file, required this.bytes, required this.waktu, required this.rasio, required this.sejak, this.titik});
  final XFile file;
  final Uint8List bytes;
  final DateTime waktu; // jam HP saat jepret
  final double rasio;
  final Stopwatch sejak; // monoton sejak jepret
  final ({double lat, double lng, double akurasi})? titik; // terkunci saat jepret; null = susulan
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
