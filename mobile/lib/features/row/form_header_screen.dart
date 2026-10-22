import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/deps.dart';
import '../../core/gps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/accurate_gps_button.dart';
import '../../widgets/sisi_widgets.dart';
import 'row_model.dart';
import 'row_repository.dart';

/// Form header (desain form_header_laporan_screen lama). `header` null = buat baru, terisi = ubah.
class FormHeaderScreen extends StatefulWidget {
  const FormHeaderScreen({super.key, required this.deps, required this.sesi, this.header});
  final Deps deps;
  final Sesi sesi;
  final RowHeader? header;

  @override
  State<FormHeaderScreen> createState() => _FormHeaderScreenState();
}

class _FormHeaderScreenState extends State<FormHeaderScreen> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _kAwal, _kAkhir, _kmAwal, _kmAkhir, _kendala;
  double? _akurasiAwal, _akurasiAkhir;
  bool _simpan = false;

  bool get _ubah => widget.header != null;

  @override
  void initState() {
    super.initState();
    Gps.mulaiHangat(); // v0.40: GPS sudah terkunci saat tombol lokasi ditekan
    final h = widget.header;
    String angka(num? n) => n == null ? '' : (n == n.roundToDouble() ? n.toInt().toString() : n.toString());
    _kAwal = TextEditingController(text: h?.koordinatAwal ?? '');
    _kAkhir = TextEditingController(text: h?.koordinatAkhir ?? '');
    _kmAwal = TextEditingController(text: angka(h?.kmAwal));
    _kmAkhir = TextEditingController(text: angka(h?.kmAkhir));
    _kendala = TextEditingController(text: h?.kendala ?? '');
  }

  @override
  void dispose() {
    for (final c in [_kAwal, _kAkhir, _kmAwal, _kmAkhir, _kendala]) {
      c.dispose();
    }
    Gps.hentiHangat();
    super.dispose();
  }

  String? _teks(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();
  num? _angka(TextEditingController c) => c.text.trim().isEmpty ? null : num.tryParse(c.text.trim().replaceAll(',', '.'));

  String? _cekKm(String? v) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return null;
    final n = num.tryParse(s.replaceAll(',', '.'));
    if (n == null || n < 0) return 'Angka ≥ 0';
    return null;
  }

  Future<void> _kirim() async {
    if (!_form.currentState!.validate()) return;
    final kmA = _angka(_kmAwal), kmB = _angka(_kmAkhir);
    if (kmA != null && kmB != null && kmB < kmA) {
      tampilPesan(context, 'KM akhir lebih kecil dari KM awal.');
      return;
    }
    setState(() => _simpan = true);
    try {
      final repo = widget.deps.row;
      if (_ubah) {
        final h = widget.header!;
        final baru = <String, Object?>{
          'koordinatAwal': _teks(_kAwal),
          'koordinatAkhir': _teks(_kAkhir),
          'kmAwal': kmA,
          'kmAkhir': kmB,
          'kendala': _teks(_kendala),
        };
        final lama = <String, Object?>{
          'koordinatAwal': h.koordinatAwal,
          'koordinatAkhir': h.koordinatAkhir,
          'kmAwal': h.kmAwal,
          'kmAkhir': h.kmAkhir,
          'kendala': h.kendala,
        };
        baru.removeWhere((k, v) => v == lama[k]);
        await repo.ubahHeader(widget.sesi, h, baru);
        final hasil = await repo.header(h.id);
        if (!mounted) return;
        Navigator.pop(context, hasil);
      } else {
        final h = await repo.buatHeader(widget.sesi,
            koordinatAwal: _teks(_kAwal), koordinatAkhir: _teks(_kAkhir), kmAwal: kmA, kmAkhir: kmB, kendala: _teks(_kendala));
        if (!mounted) return;
        Navigator.pop(context, h);
      }
      unawaited(widget.deps.syncCtl.sinkron()); // sync otomatis setelah simpan, tidak ditunggu
    } on RowError catch (e) {
      if (mounted) tampilPesan(context, e.pesan);
    } finally {
      if (mounted) setState(() => _simpan = false);
    }
  }

  Widget _gps(TextEditingController c, String label, double? akurasi, void Function(double) setAkurasi) {
    return KolomKoordinat(
      controller: c,
      label: label,
      akurasiM: akurasi,
      validator: (v) => Koordinat.cek(v),
      onHasil: (h) => setState(() {
        c.text = h.koordinat;
        setAkurasi(h.akurasiM);
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.sesi;
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      // v1.0.16: judul "Laporan Header ROW" diganti supaya tidak tertukar dengan rincian penyulang / eksekusi di bawahnya
      appBar: sisiAppBar(_ubah ? 'Ubah Data Perjalanan Tim' : 'Data Perjalanan Tim',
          subjudul: _ubah ? widget.header!.kode : 'Titik lapangan & KM kendaraan hari ini'),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          children: [
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.neutral200),
                boxShadow: [BoxShadow(color: AppColors.navy900.withValues(alpha: .04), blurRadius: 10, offset: const Offset(0, 3))],
              ),
              child: Row(children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: AppColors.cyan100, borderRadius: BorderRadius.circular(12)),
                  child: const Icon(Icons.badge_outlined, color: AppColors.navy700),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${s.timNama} • ULP ${s.ulp}', style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy900)),
                    Text('Petugas: ${s.username}', style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
                  ]),
                ),
              ]),
            ),
            const SizedBox(height: 14),
            SectionCard(judul: 'Titik koordinat lapangan', ikon: Icons.location_on_outlined, children: [
              _gps(_kAwal, 'Koordinat Awal Pekerjaan', _akurasiAwal, (a) => _akurasiAwal = a),
              const SizedBox(height: 12),
              _gps(_kAkhir, 'Koordinat Akhir Pekerjaan', _akurasiAkhir, (a) => _akurasiAkhir = a),
            ]),
            const SizedBox(height: 14),
            SectionCard(judul: 'Stand mobil (KM)', ikon: Icons.directions_car_rounded, children: [
              Row(children: [
                Expanded(
                  child: TextFormField(
                    controller: _kmAwal,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    validator: _cekKm,
                    decoration: sisiInput('KM Berangkat (Awal)'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _kmAkhir,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    validator: _cekKm,
                    decoration: sisiInput('KM Pulang (Akhir)'),
                  ),
                ),
              ]),
            ]),
            const SizedBox(height: 14),
            SectionCard(judul: 'Kendala & catatan (opsional)', ikon: Icons.report_problem_outlined, children: [
              TextFormField(
                controller: _kendala,
                maxLines: 3,
                maxLength: 500,
                decoration: sisiInput('Deskripsi Kendala'),
              ),
            ]),
            const SizedBox(height: 10),
            const Text('Koordinat dan KM boleh diisi bertahap. Laporan WA baru bisa dikirim setelah keempatnya terisi.',
                style: TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
          ],
        ),
      ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        decoration: BoxDecoration(
          color: Colors.white,
          border: const Border(top: BorderSide(color: AppColors.neutral200)),
          boxShadow: [BoxShadow(color: AppColors.navy900.withValues(alpha: .06), blurRadius: 12, offset: const Offset(0, -4))],
        ),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 50,
            child: FilledButton(
              onPressed: _simpan ? null : _kirim,
              child: Text(_simpan ? 'Menyimpan...' : (_ubah ? 'Simpan Perubahan' : 'Simpan & Mulai Laporan')),
            ),
          ),
        ),
      ),
    );
  }
}
