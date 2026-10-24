import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/kolom_pilih.dart';
import '../../widgets/sisi_widgets.dart';
import '../row/row_repository.dart' show RowError;
import 'lokasi_p0.dart';
import 'p0_model.dart';
import '../../widgets/sisi_loader.dart';

/// v0.64.0: form Penugasan P0 baru (isian v1: nama pekerjaan / pekerjaan lainnya, penyulang, section, daerah, catatan).
/// Daftar pekerjaan = db_Jenis_Pekerjaan modul YANDAL (aktif, urut kolom urutan) + "Lain - Lain".
/// Simpan = P0 tersimpan di HP (status sedang dikerjakan), lalu langsung ke detail untuk foto Sebelum.
class FormP0Screen extends StatefulWidget {
  const FormP0Screen({
    super.key,
    required this.deps,
    required this.sesi,
    this.awalPekerjaan,
    this.awalPenyulang,
    this.awalSectionId,
    this.awalSection,
    this.awalDaerah,
  });
  final Deps deps;
  final Sesi sesi;
  final String? awalPekerjaan;
  final String? awalPenyulang;
  final String? awalSectionId;
  final String? awalSection;
  final String? awalDaerah;

  @override
  State<FormP0Screen> createState() => _FormP0ScreenState();
}

/// Nama pekerjaan P0 dari master: modul YANDAL, aktif, urut kolom urutan, "Lain - Lain" selalu paling bawah.
List<String> daftarPekerjaanP0(List<Map<String, dynamic>> master) {
  final l = master.where((j) => '${j['modul']}'.toUpperCase() == 'YANDAL' && j['aktif'] == true).toList()
    ..sort((a, b) => ((a['urutan'] as num?) ?? 0).compareTo((b['urutan'] as num?) ?? 0));
  final nama = <String>[];
  for (final j in l) {
    final n = '${j['nama'] ?? ''}'.trim();
    // v0.64.6: baris master Lain - Lain (bobot kosong, diisi admin) tidak dobel, tanpa beda huruf besar/kecil
    if (n.isNotEmpty && n.replaceAll(RegExp(r'\s+'), ' ').toLowerCase() != pekerjaanLainLain.toLowerCase() && !nama.contains(n)) nama.add(n);
  }
  return [...nama, pekerjaanLainLain];
}

class _FormP0ScreenState extends State<FormP0Screen> {
  List<String> _pekerjaan = const [];
  bool _siap = false;
  bool _simpan = false;
  String? _nama;
  NilaiLokasiP0 _lokasi = (penyulang: null, sectionId: null, section: ''); // v0.66.4: dari PilihLokasiP0
  final _form = GlobalKey<FormState>(); // v1.0.31: kolom wajib kosong = merah + digulir ke sana
  final _lainnya = TextEditingController();
  final _daerah = TextEditingController();
  final _catatan = TextEditingController();

  @override
  void initState() {
    super.initState();
    _nama = widget.awalPekerjaan;
    if (widget.awalPenyulang != null && widget.awalPenyulang!.isNotEmpty) {
      _lokasi = (
        penyulang: widget.awalPenyulang,
        sectionId: widget.awalSectionId != null && widget.awalSectionId!.isNotEmpty ? widget.awalSectionId : null,
        section: widget.awalSection ?? '',
      );
    }
    if (widget.awalDaerah != null && widget.awalDaerah!.isNotEmpty) {
      _daerah.text = widget.awalDaerah!;
    }
    unawaited(_muat());
  }

  @override
  void dispose() {
    _lainnya.dispose();
    _daerah.dispose();
    _catatan.dispose();
    super.dispose();
  }

  Future<void> _muat() async {
    final m = widget.deps.master;
    final pk = daftarPekerjaanP0(await m.jenisPekerjaan());
    if (!mounted) return;
    setState(() {
      if (_nama != null && _nama!.isNotEmpty && !pk.contains(_nama)) {
        _pekerjaan = [_nama!, ...pk];
      } else {
        _pekerjaan = pk;
      }
      _siap = true;
    });
  }

  Future<void> _kirim() async {
    if (!validasiForm(_form)) return;
    final nama = _nama;
    if (nama == null) {
      tampilPesan(context, 'Pilih nama pekerjaan.');
      return;
    }
    final l = _lokasi;
    if (p0Switching(nama) && (l.penyulang == null || l.sectionId == null)) {
      // v0.66.0 penyulang, v0.66.4 + section LBS / ACR (Nama Switching diambil dari section ini)
      tampilPesan(context, l.penyulang == null ? 'Pengecekan Switching wajib pilih penyulang.' : 'Pilih section LBS / ACR.');
      return;
    }
    if (p0Gardu(nama) && l.penyulang == null) {
      // v0.74.0: gardu dipilih dari Master Gardu penyulang P0
      tampilPesan(context, 'Pengecekan Gardu wajib pilih penyulang.');
      return;
    }
    setState(() => _simpan = true);
    try {
      final x = await widget.deps.p0.tambah(widget.sesi,
          namaPekerjaan: nama,
          pekerjaanLainnya: _lainnya.text,
          penyulang: l.penyulang ?? '',
          section: l.section,
          sectionId: l.sectionId ?? '',
          daerah: _daerah.text,
          catatan: _catatan.text);
      if (mounted) Navigator.pop(context, x);
    } on RowError catch (e) {
      if (mounted) tampilPesan(context, e.pesan);
    } catch (_) {
      if (mounted) tampilPesan(context, 'P0 gagal disimpan di HP. Coba lagi.');
    } finally {
      if (mounted) setState(() => _simpan = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final lain = _nama == pekerjaanLainLain;
    final hanyaLain = _pekerjaan.length <= 1;
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar('Tambah P0', subjudul: widget.sesi.timNama),
      body: !_siap
          ? const SisiLoading(pesan: 'Menyiapkan form...', ukuran: 60)
          : Form(
              key: _form,
              // v1.0.31: tidak lazy (ListView membangun kolom di luar layar belakangan), semua kolom wajib ikut divalidasi
              child: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 40), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (hanyaLain)
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(12)),
                  child: const Text(
                    'Daftar pekerjaan P0 belum ada di master (db_Jenis_Pekerjaan modul YANDAL). Pakai "Lain - Lain" dulu, '
                    'atau minta admin mengisi daftar lalu unduh ulang master di Pengaturan.',
                    style: TextStyle(fontSize: 12, color: AppColors.neutral900),
                  ),
                ),
              // v0.64.7: daftar pekerjaan panjang = bottom sheet dengan kolom cari (KolomPilih)
              KolomPilih(
                key: ValueKey('pekerjaan-${_pekerjaan.length}'),
                label: 'Nama pekerjaan *',
                judulSheet: 'Pilih pekerjaan',
                keteranganSheet: 'Ketik untuk mencari. Tidak ada di daftar = pilih Lain - Lain.',
                pilihan: [for (final n in _pekerjaan) PilihanItem(n, n)],
                nilaiAwal: _nama,
                selaluCari: true,
                validator: (v) => (v ?? '').isEmpty ? 'Nama pekerjaan wajib dipilih' : null,
                onChanged: (v) => setState(() => _nama = v),
              ),
              if (lain) ...[
                const SizedBox(height: 12),
                TextFormField(
                  controller: _lainnya,
                  textCapitalization: TextCapitalization.sentences,
                  maxLength: 100,
                  validator: (v) => (v ?? '').trim().isEmpty ? 'Pekerjaan lainnya wajib diisi' : null,
                  decoration: const InputDecoration(labelText: 'Pekerjaan lainnya *', prefixIcon: Icon(Icons.edit_note_rounded)),
                ),
              ],
              const SizedBox(height: 12),
              // v0.65.12 pencarian; v0.66.4: Pengecekan Switching = section LBS / ACR saja + sorotan Nama Switching
              PilihLokasiP0(
                deps: widget.deps,
                namaPekerjaan: _nama ?? '',
                awalPenyulang: widget.awalPenyulang,
                awalSectionId: widget.awalSectionId,
                onChanged: (v) => _lokasi = v,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _daerah,
                textCapitalization: TextCapitalization.words,
                maxLength: 100,
                decoration: const InputDecoration(labelText: 'Daerah / lokasi', prefixIcon: Icon(Icons.place_outlined)),
              ),
              const SizedBox(height: 4),
              TextField(
                controller: _catatan,
                maxLines: 3,
                maxLength: 300,
                decoration: const InputDecoration(labelText: 'Catatan', prefixIcon: Icon(Icons.notes_rounded)),
              ),
              const SizedBox(height: 16),
              SizedBox(
                height: 50,
                child: FilledButton.icon(
                  onPressed: _simpan ? null : () => unawaited(_kirim()),
                  icon: _simpan
                      ? const SisiLoader(ukuran: 18, warna: Colors.white)
                      : const Icon(Icons.add_a_photo_outlined),
                  label: const Text('Simpan & ambil foto Sebelum'),
                ),
              ),
              const SizedBox(height: 8),
              const Text('P0 tersimpan di HP dan dikirim otomatis ke server saat ada sinyal.',
                  textAlign: TextAlign.center, style: TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
            ])),
            ),
    );
  }
}
