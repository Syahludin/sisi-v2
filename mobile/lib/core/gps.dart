import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

/// Satu sampel koordinat (bentuk sederhana supaya perhitungan bisa dites tanpa plugin).
typedef SampelGps = ({double lat, double lng, double akurasi});

/// Hasil penggabungan sampel: titik rata-rata berbobot + akurasi terbaik + jumlah sampel yang dipakai.
typedef TitikGps = ({double lat, double lng, double akurasi, int sampel});

/// Pengambilan GPS yang diperkuat (v0.40, v0.41 keputusan 4 Okt 2026). Target ±5 m; kalau 30 detik belum
/// tercapai, data terbaik yang dipakai. Metode yang dipakai bersamaan:
///  1. Dua sumber sekaligus di Android: fused provider (GPS + Wi-Fi + seluler, Google Play Services) DAN
///     GPS mentah (LocationManager). Sampel dari mana pun yang paling akurat menang.
///  2. Aliran 1 detik (bukan sekali ambil); sampel basi (> [umurMaks]) dan sampel palsu tidak dipakai.
///  3. Pemanasan sejak form dibuka, jadi satelit sudah terkunci saat tombol GPS ditekan.
///  4. Rata-rata berbobot (1/akurasi²) dari sampel bagus di sekitar sampel terbaik, dengan buang pencilan,
///     supaya titik lebih stabil. Akurasi yang dilaporkan = sampel terbaik (tidak dibuat-buat lebih kecil).
class Gps {
  Gps._();

  /// Target akurasi (meter): panel menutup sendiri begitu tercapai. Hijau.
  static const double target = 5;

  /// Batas kuning (meter): 5-15 m sedang, di atas ini lemah (merah).
  static const double sedang = 15;

  /// Batas waktu panel: lewat ini sampel terbaik langsung dipakai.
  static const Duration batasPanel = Duration(seconds: 30);

  static const Duration umurMaks = Duration(seconds: 30);

  static bool get _android => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
  static bool get _ios => !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  static LocationSettings pengaturan({bool gpsMentah = false}) {
    if (_android) {
      return AndroidSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: 0,
        intervalDuration: const Duration(seconds: 1),
        forceLocationManager: gpsMentah,
      );
    }
    if (_ios) {
      return AppleSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: 0,
        pauseLocationUpdatesAutomatically: false,
        activityType: ActivityType.other,
      );
    }
    return const LocationSettings(accuracy: LocationAccuracy.bestForNavigation, distanceFilter: 0);
  }

  static bool segar(Position p) => DateTime.now().difference(p.timestamp).abs() <= umurMaks;

  /// v0.41.1 (dari SiSi lama): sampel dengan akurasi 0 / negatif / tak hingga, atau koordinat tidak masuk akal,
  /// dibuang. Beberapa HP murah mengirim akurasi 0 yang akan terbaca "±0 m". Cek palsu (isMocked) dilakukan
  /// SEBELUM cek ini supaya lokasi palsu tetap ketahuan.
  static bool valid(Position p) => validSampel(sampel(p));

  static bool validSampel(SampelGps s) =>
      s.akurasi.isFinite &&
      s.akurasi > 0 &&
      s.lat.isFinite &&
      s.lng.isFinite &&
      s.lat.abs() <= 90 &&
      s.lng.abs() <= 180 &&
      !(s.lat == 0 && s.lng == 0);

  /// Sampel yang boleh dipakai untuk titik: segar + valid (palsu dicek terpisah).
  static bool layak(Position p) => segar(p) && valid(p);

  static SampelGps sampel(Position p) => (lat: p.latitude, lng: p.longitude, akurasi: p.accuracy);

  /// Cek GPS hidup + izin (+ minta izin) + lokasi akurat. null = siap; selain itu pesan untuk petugas.
  static Future<String?> siapkan({bool mintaIzin = true}) async {
    if (!await Geolocator.isLocationServiceEnabled()) return 'GPS mati. Nyalakan Lokasi HP dulu.';
    var izin = await Geolocator.checkPermission();
    if (izin == LocationPermission.denied && mintaIzin) izin = await Geolocator.requestPermission();
    if (izin == LocationPermission.deniedForever) return 'Izin lokasi ditolak permanen. Izinkan Lokasi untuk SiSi di Pengaturan HP.';
    if (izin == LocationPermission.denied) return 'Izin lokasi ditolak.';
    try {
      if (await Geolocator.getLocationAccuracy() == LocationAccuracyStatus.reduced) {
        return 'Lokasi akurat untuk SiSi mati. Buka Pengaturan HP > Aplikasi > SiSi > Lokasi, nyalakan "Gunakan lokasi akurat".';
      }
    } catch (_) {
      // platform tanpa status akurasi: lanjut
    }
    return null;
  }

  /// Aliran posisi dari semua sumber (Android: fused + GPS mentah bersamaan).
  static Stream<Position> aliran() => _Aliran().stream;

  /// Satu sampel segar pertama (cek lokasi palsu login / guard). Waktu habis = lokasi terakhir HP (bisa null).
  static Future<Position?> sampelPertama({Duration batas = const Duration(seconds: 25)}) async {
    final h = sampelHangat();
    if (h != null) return h;
    // Manual (bukan firstWhere().timeout()) supaya aliran GPS benar-benar dimatikan saat waktu habis.
    final c = Completer<Position?>();
    final t = Timer(batas, () {
      if (!c.isCompleted) c.complete(null);
    });
    final sub = aliran().listen((p) {
      if ((p.isMocked || layak(p)) && !c.isCompleted) c.complete(p);
    }, onError: (Object _) {});
    final hasil = await c.future;
    t.cancel();
    await sub.cancel();
    if (hasil != null) return hasil;
    try {
      return await Geolocator.getLastKnownPosition();
    } catch (_) {
      return null;
    }
  }

  /// Jarak dua titik (meter), cukup akurat untuk jarak pendek.
  static double jarakM(double lat1, double lng1, double lat2, double lng2) {
    const r = 6371000.0;
    final rad = math.pi / 180;
    final x = (lng2 - lng1) * rad * math.cos((lat1 + lat2) / 2 * rad);
    final y = (lat2 - lat1) * rad;
    return math.sqrt(x * x + y * y) * r;
  }

  /// Gabungkan sampel jadi satu titik (metode 4). null kalau kosong.
  ///  - kandidat = sampel dengan akurasi <= max(2 x terbaik, terbaik + 3 m)
  ///  - titik acuan = medoid kandidat (sampel dengan total jarak terkecil ke yang lain), tahan pencilan
  ///  - buang sampel yang jaraknya ke acuan > max(2 x akurasinya, 3 m)
  ///  - titik = rata-rata berbobot 1/akurasi² sisa sampel
  ///  - akurasi = sampel terbaik (jujur, tidak dikecilkan oleh rata-rata)
  static TitikGps? gabung(List<SampelGps> masuk) {
    final semua = masuk.where(validSampel).toList();
    if (semua.isEmpty) return null;
    final terbaik = semua.reduce((a, b) => b.akurasi < a.akurasi ? b : a);
    final batas = math.max(terbaik.akurasi * 2, terbaik.akurasi + 3);
    final kandidat = semua.where((s) => s.akurasi <= batas).toList();
    var acuan = kandidat.first;
    var totalMin = double.infinity;
    for (final a in kandidat) {
      var tot = 0.0;
      for (final b in kandidat) {
        tot += jarakM(a.lat, a.lng, b.lat, b.lng);
      }
      if (tot < totalMin) {
        totalMin = tot;
        acuan = a;
      }
    }
    var pakai = kandidat.where((s) => jarakM(s.lat, s.lng, acuan.lat, acuan.lng) <= math.max(s.akurasi * 2, 3)).toList();
    if (pakai.isEmpty) pakai = [acuan];
    var w = 0.0, la = 0.0, ln = 0.0;
    for (final s in pakai) {
      final b = 1 / math.pow(math.max(s.akurasi, 0.5), 2);
      w += b;
      la += s.lat * b;
      ln += s.lng * b;
    }
    return (lat: la / w, lng: ln / w, akurasi: terbaik.akurasi, sampel: pakai.length);
  }

  // ---------- pemanasan (dipakai form header & eksekusi) ----------
  static int _hangat = 0;
  static StreamSubscription<Position>? _subHangat;
  static final List<Position> _bufHangat = [];

  /// Nyalakan aliran latar selama form terbuka. Wajib dipasangkan dengan [hentiHangat] di dispose.
  static Future<void> mulaiHangat() async {
    _hangat++;
    if (_hangat > 1 || _subHangat != null) return;
    if (await siapkan(mintaIzin: false) != null) return;
    if (_hangat == 0) return; // form sudah ditutup selagi menunggu
    _subHangat = aliran().listen((p) {
      if (!p.isMocked && !valid(p)) return;
      _bufHangat.add(p);
      _bufHangat.removeWhere((x) => !segar(x));
      if (_bufHangat.length > 60) _bufHangat.removeAt(0);
    }, onError: (Object _) {});
  }

  static void hentiHangat() {
    if (_hangat > 0) _hangat--;
    if (_hangat == 0) {
      _subHangat?.cancel();
      _subHangat = null;
      _bufHangat.clear();
    }
  }

  /// Sampel segar dari pemanasan (untuk panel GPS: langsung ikut dihitung).
  static List<Position> sampelHangatSemua() => _bufHangat.where(segar).toList();

  /// Sampel hangat terbaik; sampel palsu didahulukan supaya tetap ketahuan.
  static Position? sampelHangat() {
    final l = sampelHangatSemua();
    if (l.isEmpty) return null;
    for (final p in l) {
      if (p.isMocked) return p;
    }
    return l.reduce((a, b) => b.accuracy < a.accuracy ? b : a);
  }
}

/// Gabungan aliran fused + GPS mentah (Android) atau satu aliran (iOS). Error satu sumber tidak menghentikan
/// yang lain; error diteruskan hanya kalau semua sumber error.
class _Aliran {
  _Aliran() {
    _c = StreamController<Position>(onListen: _mulai, onCancel: _batal);
  }

  late final StreamController<Position> _c;
  final List<StreamSubscription<Position>> _sub = [];
  int _error = 0;

  Stream<Position> get stream => _c.stream;

  void _mulai() {
    final sumber = Gps._android ? [false, true] : [false];
    for (final mentah in sumber) {
      _sub.add(Geolocator.getPositionStream(locationSettings: Gps.pengaturan(gpsMentah: mentah)).listen(
        (p) {
          if (!_c.isClosed) _c.add(p);
        },
        onError: (Object e) {
          _error++;
          if (_error >= sumber.length && !_c.isClosed) _c.addError(e);
        },
      ));
    }
  }

  Future<void> _batal() async {
    for (final s in _sub) {
      await s.cancel();
    }
    _sub.clear();
  }
}

/// Hasil satu pengambilan titik. titik null + palsu false = dibatalkan / tidak dapat (lihat galat).
typedef HasilAmbilGps = ({TitikGps? titik, bool palsu, String? galat});

/// Satu pengambilan titik koordinat tanpa UI (v0.43, menggantikan panel "Mengunci GPS").
/// Aturan sama dengan v0.41: target ±5 m (min 3 sampel) = selesai; 30 detik = pakai titik terbaik; titik =
/// gabungan berbobot. Tanpa sampel sama sekali sampai 60 detik = galat. [hentikan] = selesai sekarang
/// memakai titik terbaik yang ada. [onProgres] dipanggil tiap sampel dan tiap detik (untuk chip akurasi).
class PengambilanGps {
  PengambilanGps({this.onProgres});

  static const Duration batasTanpaSampel = Duration(seconds: 60);

  final void Function(TitikGps? titik, int detik)? onProgres;
  final List<SampelGps> _sampel = [];
  final Completer<HasilAmbilGps> _c = Completer<HasilAmbilGps>();
  StreamSubscription<Position>? _sub;
  Timer? _jam;
  TitikGps? _titik;
  int _detik = 0;

  TitikGps? get titik => _titik;
  bool get selesai => _c.isCompleted;

  Future<HasilAmbilGps> jalankan() {
    for (final p in Gps.sampelHangatSemua()) {
      _terima(p);
      if (selesai) return _c.future;
    }
    _sub = Gps.aliran().listen(_terima, onError: (Object _) {});
    _jam = Timer.periodic(const Duration(seconds: 1), (_) {
      if (selesai) return;
      _detik++;
      onProgres?.call(_titik, _detik);
      if (_detik >= Gps.batasPanel.inSeconds && _titik != null) {
        _akhiri((titik: _titik, palsu: false, galat: null));
      } else if (_detik >= batasTanpaSampel.inSeconds && _titik == null) {
        _akhiri((titik: null, palsu: false, galat: 'GPS belum memperoleh posisi. Coba di area lebih terbuka.'));
      }
    });
    return _c.future;
  }

  /// Selesai sekarang dengan titik terbaik (kalau belum ada sampel = batal).
  void hentikan() => _akhiri((titik: _titik, palsu: false, galat: _titik == null ? 'Pengambilan koordinat dibatalkan.' : null));

  void _terima(Position p) {
    if (selesai) return;
    if (p.isMocked) {
      _akhiri((titik: null, palsu: true, galat: null));
      return;
    }
    if (!Gps.layak(p)) return;
    _sampel.add(Gps.sampel(p));
    if (_sampel.length > 90) _sampel.removeAt(0);
    _titik = Gps.gabung(_sampel);
    onProgres?.call(_titik, _detik);
    final t = _titik;
    if (t != null && t.akurasi <= Gps.target && _sampel.length >= 3) {
      _akhiri((titik: t, palsu: false, galat: null));
    } else if (t != null && _detik >= Gps.batasPanel.inSeconds) {
      _akhiri((titik: t, palsu: false, galat: null)); // sampel pertama baru datang setelah 30 detik
    }
  }

  void _akhiri(HasilAmbilGps h) {
    if (selesai) return;
    _jam?.cancel();
    _sub?.cancel();
    _c.complete(h);
  }
}

/// Sampel GPS + jam HP saat sampel DITERIMA (bukan timestamp satelit, supaya jendela tidak tertipu jam GPS).
typedef SampelSusulan = ({SampelGps s, DateTime t});

/// Hasil titik susulan: detik = jarak waktu sampel terpilih sesudah jepret.
typedef TitikSusulan = ({double lat, double lng, double akurasi, int detik});

/// v0.65.2 (keputusan kvlar 8 Okt 2026): koordinat foto P0 boleh MENYUSUL bila saat jepret belum ada fix segar,
/// tapi hanya [jendela] sesudah jepret (petugas bisa sudah bergerak; lewat dari itu dibiarkan kosong, bukan titik salah).
/// Dipilih sampel PERTAMA yang cukup akurat (<= [Gps.sedang]) supaya sedekat mungkin dengan saat jepret;
/// tidak ada yang cukup akurat = sampel terbaik di jendela. Server menolak susulan > 30 detik (YAN_P0_SUSULAN_MAKS_DETIK_).
class GpsSusulan {
  GpsSusulan._();

  static const Duration jendela = Duration(seconds: 30);

  static TitikSusulan? pilih(List<SampelSusulan> sampel, DateTime jepret) {
    final sah = sampel
        .where((x) => Gps.validSampel(x.s) && !x.t.isBefore(jepret) && x.t.difference(jepret) <= jendela)
        .toList()
      ..sort((a, b) => a.t.compareTo(b.t));
    if (sah.isEmpty) return null;
    final cukup = sah.where((x) => x.s.akurasi <= Gps.sedang);
    final p = cukup.isNotEmpty ? cukup.first : sah.reduce((a, b) => b.s.akurasi < a.s.akurasi ? b : a);
    final detik = p.t.difference(jepret).inSeconds.clamp(0, jendela.inSeconds);
    return (lat: p.s.lat, lng: p.s.lng, akurasi: p.s.akurasi, detik: detik);
  }

  /// Cukup akurat untuk langsung selesai menunggu.
  static bool cukup(SampelGps s) => Gps.validSampel(s) && s.akurasi <= Gps.sedang;
}
