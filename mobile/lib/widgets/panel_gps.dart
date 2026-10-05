import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../core/gps.dart';
import '../theme/app_colors.dart';

/// Hasil panel kunci GPS: titik gabungan, atau palsu = lokasi palsu terdeteksi. titik null + palsu false = Batal.
typedef HasilPanelGps = ({TitikGps? titik, bool palsu});

/// Warna akurasi (keputusan 4 Okt 2026): <= 5 m hijau, 5-15 m kuning, > 15 m merah.
Color warnaAkurasi(double? m) => m == null
    ? AppColors.neutral500
    : m <= Gps.target
        ? AppColors.success600
        : (m <= Gps.sedang ? AppColors.amber600 : AppColors.red600);

/// Panel "Mengunci GPS" (v0.41): target ±5 m. Tercapai = tutup sendiri; 30 detik belum tercapai = titik
/// terbaik langsung dipakai. Petugas boleh "Pakai" lebih cepat. Titik = rata-rata berbobot sampel bagus.
Future<HasilPanelGps?> tampilkanPanelGps(BuildContext context) {
  return showModalBottomSheet<HasilPanelGps>(
    context: context,
    isDismissible: false,
    enableDrag: false,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (_) => const _PanelGps(),
  );
}

class _PanelGps extends StatefulWidget {
  const _PanelGps();

  @override
  State<_PanelGps> createState() => _PanelGpsState();
}

class _PanelGpsState extends State<_PanelGps> {
  StreamSubscription<Position>? _sub;
  Timer? _jam;
  final List<SampelGps> _sampel = [];
  TitikGps? _titik;
  double? _terakhir;
  int _detik = 0;
  bool _selesai = false;
  String? _galat;

  int get _batas => Gps.batasPanel.inSeconds;

  @override
  void initState() {
    super.initState();
    for (final p in Gps.sampelHangatSemua()) {
      _terima(p, hangat: true);
    }
    _sub = Gps.aliran().listen(_terima, onError: (Object _) {
      if (mounted) setState(() => _galat = 'GPS gagal membaca lokasi. Coba ulangi di tempat terbuka.');
    });
    _jam = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _selesai) return;
      setState(() => _detik++);
      if (_detik >= _batas && _titik != null) _tutup((titik: _titik, palsu: false)); // 30 detik: pakai terbaik
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _jam?.cancel();
    super.dispose();
  }

  void _terima(Position p, {bool hangat = false}) {
    if (_selesai) return;
    if (p.isMocked) {
      if (hangat) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _tutup((titik: null, palsu: true)));
      } else {
        _tutup((titik: null, palsu: true));
      }
      return;
    }
    if (!Gps.layak(p)) return; // lokasi lama dari cache HP / akurasi 0 atau tidak valid
    _sampel.add(Gps.sampel(p));
    _sampel.removeRange(0, _sampel.length > 90 ? _sampel.length - 90 : 0);
    final t = Gps.gabung(_sampel);
    void ubah() {
      _titik = t;
      _terakhir = p.accuracy;
      _galat = null;
    }

    if (hangat) {
      ubah();
    } else if (mounted) {
      setState(ubah);
    }
    // sampel pertama kadang terlalu optimis: minimal 3 sampel sebelum tutup otomatis
    if (t != null && t.akurasi <= Gps.target && _sampel.length >= 3) {
      if (hangat) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _tutup((titik: _titik, palsu: false)));
      } else {
        _tutup((titik: t, palsu: false));
      }
    } else if (!hangat && _detik >= _batas && t != null) {
      _tutup((titik: t, palsu: false)); // sampel pertama baru datang setelah 30 detik
    }
  }

  void _tutup(HasilPanelGps h) {
    if (_selesai || !mounted) return;
    _selesai = true;
    Navigator.of(context).pop(h);
  }

  @override
  Widget build(BuildContext context) {
    final t = _titik;
    final a = t?.akurasi;
    final warna = warnaAkurasi(a);
    final sisa = (_batas - _detik).clamp(0, _batas);
    final status = a == null
        ? (_detik < 3 ? 'Mencari satelit...' : 'Belum dapat lokasi')
        : a <= Gps.target
            ? 'Akurasi tinggi'
            : (a <= Gps.sedang ? 'Akurasi sedang, menajamkan ke ±5 m...' : 'Akurasi lemah, menajamkan ke ±5 m...');
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Icon(Icons.satellite_alt_rounded, color: AppColors.navy700),
            const SizedBox(width: 8),
            const Expanded(
              child: Text('Mengunci GPS', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.navy900)),
            ),
            Text(a == null && _detik >= _batas ? 'menunggu sinyal' : 'sisa ${sisa}s',
                style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
          ]),
          const SizedBox(height: 16),
          Center(
            child: Text(a == null ? '- m' : '±${a.toStringAsFixed(1)} m',
                style: TextStyle(fontSize: 40, fontWeight: FontWeight.w900, color: warna)),
          ),
          Center(child: Text(status, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: warna))),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(value: _detik / _batas > 1 ? 1 : _detik / _batas, color: warna, minHeight: 6),
          ),
          const SizedBox(height: 8),
          Text(
            [
              '${t?.sampel ?? 0} dari ${_sampel.length} sampel dirata-rata',
              if (_terakhir != null) 'terakhir ±${_terakhir!.toStringAsFixed(0)} m',
            ].join(' · '),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 11, color: AppColors.neutral500),
          ),
          const SizedBox(height: 4),
          const Text('Hijau ≤ 5 m · Kuning 5-15 m · Merah > 15 m',
              textAlign: TextAlign.center, style: TextStyle(fontSize: 10.5, color: AppColors.neutral400)),
          if (_galat != null) ...[
            const SizedBox(height: 8),
            Text(_galat!, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: AppColors.red700)),
          ],
          if (_detik >= 10 && (a == null || a > Gps.target)) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: AppColors.neutral100, borderRadius: BorderRadius.circular(12)),
              child: const Text(
                'Supaya cepat ±5 m:\n'
                '• Diam di satu titik, pegang HP mendatar, jangan tutupi bagian atas HP.\n'
                '• Pindah dari bawah atap / rimbun pohon kalau bisa.\n'
                '• Nyalakan Wi-Fi (tidak perlu tersambung) dan matikan Hemat Baterai.',
                style: TextStyle(fontSize: 11.5, color: AppColors.neutral700, height: 1.4),
              ),
            ),
          ],
          const SizedBox(height: 16),
          Row(children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => _tutup((titik: null, palsu: false)),
                child: const Text('Batal'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton(
                onPressed: t == null ? null : () => _tutup((titik: t, palsu: false)),
                child: Text(t == null ? 'Pakai' : 'Pakai ±${t.akurasi.toStringAsFixed(0)} m'),
              ),
            ),
          ]),
        ]),
      ),
    );
  }
}
