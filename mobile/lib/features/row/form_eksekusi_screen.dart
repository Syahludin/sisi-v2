import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/deps.dart';
import '../../core/gps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/accurate_gps_button.dart';
import '../../widgets/foto_slot.dart';
import '../../widgets/sisi_widgets.dart';
import 'foto_repository.dart';
import 'jenis_pekerjaan.dart';
import 'kamera_screen.dart';
import 'row_model.dart';
import 'row_repository.dart';
import 'watermark.dart';

/// Form eksekusi ROW (field mengikuti eksekusi_row_screen lama, kartu mengikuti form header lama).
/// Foto Sebelum / Pekerjaan / Sesudah boleh diisi sekarang atau menyusul dari detail eksekusi.
/// `edit` terisi = mode Edit (dari detail eksekusi): isian lama terisi, tanpa bagian foto, tombol "Simpan Perubahan".
class FormEksekusiScreen extends StatefulWidget {
  const FormEksekusiScreen({super.key, required this.deps, required this.sesi, required this.realisasi, this.edit});
  final Deps deps;
  final Sesi sesi;
  final RowRealisasi realisasi;
  final RowEksekusi? edit;

  @override
  State<FormEksekusiScreen> createState() => _FormEksekusiScreenState();
}

class _FormEksekusiScreenState extends State<FormEksekusiScreen> {
  final _form = GlobalKey<FormState>();
  final _tiang = TextEditingController();
  final _kTiang = TextEditingController();
  final _kKerja = TextEditingController();
  final _diameter = TextEditingController();
  List<({String id, String nama})> _section = const [];
  List<JenisPekerjaan> _jenis = const [];
  String? _sectionId;
  double? _akTiang, _akKerja;
  bool _simpan = false;
  final Map<String, FotoBaru> _foto = {}; // slot -> foto baru (kamera SiSi / galeri)

  bool get _modeEdit => widget.edit != null;

  @override
  void initState() {
    super.initState();
    Gps.mulaiHangat(); // v0.40: GPS sudah terkunci saat tombol lokasi ditekan
    final e = widget.edit;
    if (e != null) {
      _sectionId = e.sectionId;
      _tiang.text = e.nomorTiang ?? '';
      _kTiang.text = e.koordinatTiang ?? '';
      _kKerja.text = e.koordinatPekerjaan ?? '';
      _diameter.text = e.diameter?.toString() ?? '';
    }
    _muatMaster();
  }

  Future<void> _muatMaster() async {
    final sec = await widget.deps.master.section(widget.realisasi.penyulang);
    final jen = (await widget.deps.master.jenisPekerjaan()).map(JenisPekerjaan.dariMaster).toList();
    if (!mounted) return;
    setState(() {
      _section = sec;
      _jenis = jen;
      if (_sectionId != null && !sec.any((s) => s.id == _sectionId)) _sectionId = null; // section lama sudah tidak ada di master
    });
  }

  @override
  void dispose() {
    for (final c in [_tiang, _kTiang, _kKerja, _diameter]) {
      c.dispose();
    }
    Gps.hentiHangat();
    super.dispose();
  }

  HasilJenis? get _hasilJenis {
    final d = int.tryParse(_diameter.text.trim());
    return d == null ? null : pilihJenis(d, _jenis);
  }

  Future<void> _kirim() async {
    if (!_form.currentState!.validate()) return;
    final hj = _hasilJenis;
    if (hj == null || !hj.ok) return;
    final sec = _section.firstWhere((s) => s.id == _sectionId);
    setState(() => _simpan = true);
    final tiang = _tiang.text.trim().isEmpty ? null : _tiang.text.trim();
    final kTiang = _kTiang.text.trim().isEmpty ? null : _kTiang.text.trim();
    if (_modeEdit) {
      try {
        final berubah = await widget.deps.row.ubahEksekusi(
          widget.sesi,
          widget.edit!,
          sectionId: sec.id,
          sectionNama: sec.nama,
          nomorTiang: tiang,
          koordinatTiang: kTiang,
          koordinatPekerjaan: _kKerja.text.trim(),
          diameter: int.parse(_diameter.text.trim()),
          jenis: hj.jenis!,
        );
        if (berubah) {
          // data watermark (kode, koordinat, diameter, jenis) ikut berubah: foto kamera yang sudah terkirim diganti
          try {
            await widget.deps.foto.segarkanWatermark(widget.sesi, widget.edit!.id);
          } catch (_) {/* foto lama tetap; bisa diambil ulang dari detail */}
          unawaited(widget.deps.syncCtl.sinkron());
        }
        if (mounted) Navigator.pop(context, berubah);
      } on RowError catch (e) {
        if (mounted) tampilPesan(context, e.pesan);
      } finally {
        if (mounted) setState(() => _simpan = false);
      }
      return;
    }
    try {
      final id = await widget.deps.row.buatEksekusi(
        widget.sesi,
        widget.realisasi,
        sectionId: sec.id,
        sectionNama: sec.nama,
        nomorTiang: tiang,
        koordinatTiang: kTiang,
        koordinatPekerjaan: _kKerja.text.trim(),
        diameter: int.parse(_diameter.text.trim()),
        jenis: hj.jenis!,
      );
      // Eksekusi sudah tersimpan: foto yang gagal disimpan tidak membatalkan eksekusi (bisa diulang dari detail).
      final gagal = <String>[];
      for (final e in _foto.entries) {
        try {
          await widget.deps.foto.simpan(widget.sesi, eksekusiId: id, slotFoto: e.key, foto: e.value);
        } catch (_) {
          gagal.add(FotoRepository.label[e.key]!);
        }
      }
      if (gagal.isNotEmpty && mounted) tampilPesan(context, 'Eksekusi tersimpan, foto ${gagal.join(', ')} gagal. Ulangi dari detail eksekusi.');
      unawaited(widget.deps.syncCtl.sinkron());
      if (mounted) Navigator.pop(context, true);
    } on RowError catch (e) {
      if (mounted) tampilPesan(context, e.pesan);
    } finally {
      if (mounted) setState(() => _simpan = false);
    }
  }

  /// Isi watermark yang sudah diketahui form (kode baru dibuat saat Simpan).
  DataWatermark _pratinjau(String slot) {
    final sec = _section.where((x) => x.id == _sectionId).toList();
    final hj = _hasilJenis;
    return DataWatermark(
      kodeEksekusi: widget.edit?.kode ?? '(dibuat saat Simpan)',
      ulp: widget.sesi.ulp,
      tim: FotoRepository.timSesi(widget.sesi),
      subTim: widget.sesi.timNama,
      penyulang: widget.realisasi.penyulang,
      section: sec.isEmpty ? null : sec.first.nama,
      waktu: DateTime.now(),
      koordinat: _kKerja.text.trim(),
      diameter: int.tryParse(_diameter.text.trim()),
      jenis: hj != null && hj.ok ? hj.jenis!.nama : null,
      slot: FotoRepository.label[slot]!,
    );
  }

  Future<void> _ambilFoto(String slot) async {
    final f = await ambilFotoRow(context,
        slot: slot, pratinjau: _pratinjau(slot), pathAda: _foto[slot]?.file.path, keterangan: 'Baru, belum disimpan');
    if (f == null || !mounted) return;
    setState(() => _foto[slot] = f);
  }

  @override
  Widget build(BuildContext context) {
    final hj = _hasilJenis;
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: sisiAppBar(_modeEdit ? 'Edit Eksekusi' : 'Eksekusi ROW',
          subjudul: _modeEdit ? widget.edit!.kode : 'Penyulang ${widget.realisasi.penyulang}'),
      body: Form(
        key: _form,
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 24), children: [
          SectionCard(judul: 'Lokasi pekerjaan', ikon: Icons.electrical_services_outlined, children: [
            DropdownButtonFormField<String>(
              initialValue: _sectionId,
              isExpanded: true,
              decoration: sisiInput('Section'),
              items: [for (final s in _section) DropdownMenuItem(value: s.id, child: Text(s.nama, overflow: TextOverflow.ellipsis))],
              onChanged: (v) => setState(() => _sectionId = v),
              validator: (v) => v == null ? 'Pilih section' : null,
            ),
            if (_section.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 6),
                child: Text('Section penyulang ini belum ada di master.', style: TextStyle(fontSize: 11.5, color: AppColors.red700)),
              ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _tiang,
              maxLength: 40,
              decoration: sisiInput('Nomor Tiang (opsional)'),
            ),
          ]),
          const SizedBox(height: 14),
          SectionCard(judul: 'Titik koordinat', ikon: Icons.location_on_outlined, children: [
            KolomKoordinat(
              controller: _kTiang,
              label: 'Koordinat Tiang (opsional)',
              akurasiM: _akTiang,
              validator: (v) => Koordinat.cek(v),
              onChanged: (_) => setState(() {}),
              onHasil: (h) => setState(() {
                _kTiang.text = h.koordinat;
                _akTiang = h.akurasiM;
                if (_kKerja.text.trim().isEmpty) _kKerja.text = h.koordinat; // default = koordinat tiang
              }),
            ),
            const SizedBox(height: 12),
            KolomKoordinat(
              controller: _kKerja,
              label: 'Koordinat Pekerjaan',
              hint: 'Default dari koordinat tiang, atau GPS',
              akurasiM: _akKerja,
              validator: (v) => Koordinat.cek(v, wajib: true),
              onHasil: (h) => setState(() {
                _kKerja.text = h.koordinat;
                _akKerja = h.akurasiM;
              }),
            ),
            if (_kTiang.text.trim().isNotEmpty)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => setState(() => _kKerja.text = _kTiang.text.trim()),
                  icon: const Icon(Icons.copy_rounded, size: 16),
                  label: const Text('Samakan dengan koordinat tiang'),
                ),
              ),
          ]),
          const SizedBox(height: 14),
          SectionCard(judul: 'Pohon', ikon: Icons.park_outlined, children: [
            TextFormField(
              controller: _diameter,
              keyboardType: TextInputType.number,
              onChanged: (_) => setState(() {}),
              decoration: sisiInput('Diameter (cm)'),
              validator: (v) {
                final d = int.tryParse((v ?? '').trim());
                if (d == null) return 'Isi bilangan bulat cm';
                final h = pilihJenis(d, _jenis);
                return h.ok ? null : KodeError.pesan(h.kode!);
              },
            ),
            const SizedBox(height: 10),
            if (hj != null)
              hj.ok
                  ? StatusBadge(hj.jenis!.nama.toUpperCase(), warna: AppColors.success700, latar: AppColors.success100, ikon: Icons.check_circle_outline)
                  : StatusBadge('DITOLAK', warna: AppColors.red700, latar: AppColors.red100, ikon: Icons.block_outlined),
          ]),
          if (!_modeEdit) ...[
            const SizedBox(height: 14),
            SectionCard(judul: 'Foto pekerjaan', ikon: Icons.photo_camera_outlined, children: [
              FotoSlotRow(
                isi: {for (final e in _foto.entries) e.key: IsiSlot(path: e.value.file.path)},
                onPilih: _ambilFoto,
              ),
              const SizedBox(height: 8),
              const Text('Dapat dikerjakan secara bertahap. Kamera: posisi HP mendatar (landscape).', style: TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
            ]),
          ],
        ]),
      ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: AppColors.neutral200))),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 50,
            child: FilledButton(onPressed: _simpan ? null : _kirim, child: Text(_simpan ? 'Menyimpan...' : (_modeEdit ? 'Simpan Perubahan' : 'Simpan Eksekusi'))),
          ),
        ),
      ),
    );
  }
}
