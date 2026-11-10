import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import '../row/row_repository.dart' show RowError;
import 'lokasi_p0.dart';
import 'p0_model.dart';
import '../../widgets/sisi_loader.dart';

/// v0.66.4 (keputusan Master Guswan 9 Okt 2026): edit penyulang / section / daerah P0 kalau salah pilih.
/// Boleh selama P0 belum selesai di shift berjalan; Pengecekan Switching hanya sebelum data switching disimpan
/// dan section tetap wajib LBS / ACR. Hasil = P0 baru (pop), dikirim ulang ke server saat sync.
class UbahLokasiP0Screen extends StatefulWidget {
  const UbahLokasiP0Screen({super.key, required this.deps, required this.sesi, required this.p0});
  final Deps deps;
  final Sesi sesi;
  final P0Lokal p0;

  @override
  State<UbahLokasiP0Screen> createState() => _UbahLokasiP0ScreenState();
}

class _UbahLokasiP0ScreenState extends State<UbahLokasiP0Screen> {
  late NilaiLokasiP0 _lokasi = (
    penyulang: widget.p0.penyulang.isEmpty ? null : widget.p0.penyulang,
    sectionId: widget.p0.sectionId.isEmpty ? null : widget.p0.sectionId,
    section: widget.p0.section,
  );
  late final _daerah = TextEditingController(text: widget.p0.daerah);
  final _form = GlobalKey<FormState>(); // v1.0.31
  bool _simpan = false;

  @override
  void dispose() {
    _daerah.dispose();
    super.dispose();
  }

  Future<void> _kirim() async {
    if (!validasiForm(_form)) return;
    final x = widget.p0, l = _lokasi;
    if (x.butuhSwitching && (l.penyulang == null || l.sectionId == null)) {
      tampilPesan(context, l.penyulang == null ? 'Pengecekan Switching wajib pilih penyulang.' : 'Pilih section LBS / ACR.');
      return;
    }
    if (x.butuhGardu && l.penyulang == null) {
      tampilPesan(context, 'Pengecekan Gardu wajib pilih penyulang.'); // v0.74.0
      return;
    }
    setState(() => _simpan = true);
    try {
      final baru = await widget.deps.p0.ubahLokasi(widget.sesi, x,
          penyulang: l.penyulang ?? '', section: l.section, sectionId: l.sectionId ?? '', daerah: _daerah.text);
      if (!mounted) return;
      unawaited(widget.deps.syncCtl.sinkron());
      Navigator.pop(context, baru);
    } on RowError catch (e) {
      if (mounted) tampilPesan(context, e.pesan);
    } catch (_) {
      if (mounted) tampilPesan(context, 'Lokasi gagal disimpan. Coba lagi.');
    } finally {
      if (mounted) setState(() => _simpan = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final x = widget.p0;
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar('Edit lokasi P0', subjudul: x.kodeTampil),
      body: Form(
        key: _form,
        // v1.0.31: tidak lazy (ListView membangun kolom di luar layar belakangan), semua kolom wajib ikut divalidasi
        child: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 40), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral200)),
          child: Row(children: [
            const Icon(Icons.work_outline_rounded, color: AppColors.navy700),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Pekerjaan', style: TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
                Text(x.namaTampil, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy900)),
              ]),
            ),
          ]),
        ),
        const SizedBox(height: 14),
        PilihLokasiP0(
          deps: widget.deps,
          namaPekerjaan: x.namaPekerjaan,
          awalPenyulang: x.penyulang,
          awalSectionId: x.sectionId,
          onChanged: (v) => _lokasi = v,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _daerah,
          textCapitalization: TextCapitalization.words,
          maxLength: 100,
          decoration: const InputDecoration(labelText: 'Daerah / lokasi', prefixIcon: Icon(Icons.place_outlined)),
        ),
        if (x.foto.values.any((f) => f.terkunci))
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(12)),
            child: const Text('Watermark foto yang sudah disimpan tetap memakai lokasi lama. Foto berikutnya memakai lokasi baru.',
                style: TextStyle(fontSize: 11.5, color: AppColors.neutral900)),
          ),
        SizedBox(
          height: 50,
          child: FilledButton.icon(
            onPressed: _simpan ? null : () => unawaited(_kirim()),
            icon: _simpan
                ? const SisiLoader(ukuran: 18, warna: Colors.white)
                : const Icon(Icons.save_rounded),
            label: const Text('Simpan perubahan'),
          ),
        ),
        if (x.butuhGardu)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('Penyulang tidak bisa diubah lagi setelah pengukuran gardu disimpan.',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
          ),
        if (x.butuhSwitching)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('Section tidak bisa diubah lagi setelah data switching disimpan.',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
          ),
      ])),
      ),
    );
  }
}
