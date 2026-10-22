import 'package:flutter/material.dart';

import '../core/gps.dart';
import '../features/row/row_model.dart';
import '../theme/app_colors.dart';
import 'mock_gps_warning_dialog.dart';
import 'sisi_widgets.dart';
import 'sisi_loader.dart';

class HasilGps {
  HasilGps(this.koordinat, this.akurasiM);
  final String koordinat; // "lat, lng" 6 desimal
  final double akurasiM;
}

/// Kolom koordinat + tombol GPS + chip akurasi (v0.43, desain kvlar 4 Okt 2026).
/// Saat mengambil titik: ikon tombol jadi spinner, kolom tidak bisa diedit dan berisi "Mengambil Koordinat",
/// chip di bawah kolom menampilkan akurasi yang terus berubah. Tanpa kartu / panel.
/// Ketuk spinner = selesai sekarang memakai titik terbaik yang sudah ada.
/// Aturan pengambilan di [PengambilanGps] (target ±5 m, 30 detik pakai terbaik, lokasi palsu ditolak).
class KolomKoordinat extends StatefulWidget {
  const KolomKoordinat({
    super.key,
    required this.controller,
    required this.label,
    required this.akurasiM,
    required this.onHasil,
    this.hint = '-3.012345, 106.512345',
    this.validator,
    this.onChanged,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final double? akurasiM; // akurasi tersimpan di form (null = diketik manual / belum ada)
  final void Function(HasilGps) onHasil;
  final String? Function(String?)? validator;
  final void Function(String)? onChanged;

  @override
  State<KolomKoordinat> createState() => _KolomKoordinatState();
}

class _KolomKoordinatState extends State<KolomKoordinat> {
  static const _teksAmbil = 'Mengambil Koordinat';
  PengambilanGps? _jalan;
  String _sebelum = '';
  double? _akurasiLive;
  int _detik = 0;

  @override
  void dispose() {
    _jalan?.hentikan();
    super.dispose();
  }

  Future<void> _ambil() async {
    final berjalan = _jalan;
    if (berjalan != null) {
      berjalan.hentikan(); // ketuk spinner = pakai titik terbaik sekarang
      return;
    }
    final galat = await Gps.siapkan();
    if (!mounted) return;
    if (galat != null) {
      tampilPesan(context, galat);
      return;
    }
    final p = PengambilanGps(onProgres: (t, d) {
      if (mounted) {
        setState(() {
          _akurasiLive = t?.akurasi;
          _detik = d;
        });
      }
    });
    setState(() {
      _jalan = p;
      _sebelum = widget.controller.text;
      _akurasiLive = null;
      _detik = 0;
      widget.controller.text = _teksAmbil;
    });
    final h = await p.jalankan();
    if (!mounted) return;
    final t = h.titik;
    setState(() {
      _jalan = null;
      widget.controller.text = t == null ? _sebelum : Koordinat.format(t.lat, t.lng);
    });
    if (h.palsu) {
      await tampilkanMockGpsWarning(context);
      return;
    }
    if (t == null) {
      if (h.galat != null && mounted) tampilPesan(context, h.galat!);
      return;
    }
    widget.onHasil(HasilGps(Koordinat.format(t.lat, t.lng), t.akurasi));
  }

  @override
  Widget build(BuildContext context) {
    final jalan = _jalan != null;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      TextFormField(
        controller: widget.controller,
        readOnly: jalan,
        validator: (v) => jalan ? 'Tunggu, koordinat sedang diambil' : widget.validator?.call(v),
        onChanged: widget.onChanged,
        style: jalan ? const TextStyle(fontStyle: FontStyle.italic, color: AppColors.neutral500) : null,
        decoration: sisiInput(widget.label, hint: widget.hint, suffix: _TombolGps(berjalan: jalan, onTap: _ambil)),
      ),
      ChipAkurasi(
        akurasiM: jalan ? _akurasiLive : widget.akurasiM,
        terisi: !jalan && widget.controller.text.trim().isNotEmpty,
        berjalan: jalan,
        detik: _detik,
      ),
    ]);
  }
}

/// Tombol GPS 40px navy (desain lama): ikon lokasi, atau spinner saat mengambil titik.
class _TombolGps extends StatelessWidget {
  const _TombolGps({required this.berjalan, required this.onTap});
  final bool berjalan;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(5),
      child: SizedBox(
        width: 40,
        height: 40,
        child: Material(
          color: AppColors.navy700,
          borderRadius: BorderRadius.circular(9),
          child: InkWell(
            borderRadius: BorderRadius.circular(9),
            onTap: onTap,
            child: Center(
              child: berjalan
                  ? const SisiLoader(ukuran: 18, warna: Colors.white)
                  : const Icon(Icons.my_location_rounded, size: 19, color: Colors.white),
            ),
          ),
        ),
      ),
    );
  }
}

/// Chip akurasi di bawah kolom. Warna: <= 5 m hijau, 5-15 m kuning, > 15 m merah (v0.41).
/// [berjalan] = nilai berubah terus selama pengambilan titik.
class ChipAkurasi extends StatelessWidget {
  const ChipAkurasi({super.key, this.akurasiM, required this.terisi, this.berjalan = false, this.detik = 0});
  final double? akurasiM;
  final bool terisi;
  final bool berjalan;
  final int detik;

  @override
  Widget build(BuildContext context) {
    final a = akurasiM;
    final String label = a == null
        ? ''
        : a <= Gps.target
            ? 'Akurasi Tinggi'
            : (a <= Gps.sedang ? 'Akurasi Sedang' : 'Akurasi Lemah');
    final (Color warna, Color latar) = a == null
        ? (AppColors.neutral500, AppColors.neutral100)
        : a <= Gps.target
            ? (AppColors.success700, AppColors.success100)
            : (a <= Gps.sedang ? (AppColors.accent700, AppColors.accent100) : (AppColors.red700, AppColors.red100));
    final String teks = berjalan
        ? (a == null ? 'Mencari sinyal GPS... ${detik}s' : '$label ±${a.toStringAsFixed(1)} m · ${detik}s')
        : (a == null
            ? (terisi ? 'Koordinat Terisi' : 'GPS belum direkam')
            : '$label (±${a.toStringAsFixed(a <= Gps.target ? 1 : 0)} m)');
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(top: 6),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(999)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (berjalan) ...[
            SisiLoader(ukuran: 10, warna: warna),
            const SizedBox(width: 6),
          ],
          Text(teks, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: warna)),
        ]),
      ),
    );
  }
}
