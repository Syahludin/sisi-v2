import 'dart:io';

import 'package:flutter/material.dart';

import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/accurate_gps_button.dart';
import '../../widgets/sisi_widgets.dart';
import '../hartek/foto_lapangan.dart';
import 'switching_model.dart';
import 'switching_repository.dart';
import 'switching_screen.dart' show watermarkSwitching;

/// 1.0.63 form Tambah / Ubah switching. Urutan = urutan kerja di lokasi: jenis, nama, penyulang, GPS, posisi normal, foto;
/// isian lain dilipat (kontroler dibuka, sisanya tertutup). Simpan oleh Admin = verifikasi langsung berlaku (server), lalu foto
/// dikirim satu per satu. Foto yang gagal bisa diambil ulang dari rincian.
class SwitchingFormScreen extends StatefulWidget {
  const SwitchingFormScreen({
    super.key,
    required this.sesi,
    required this.repo,
    required this.data,
    this.awal,
    this.penyulangAwal = '',
  });
  final Sesi sesi;
  final SwitchingRepository repo;
  final DataSwitching data;
  final Switching? awal;
  final String penyulangAwal;

  @override
  State<SwitchingFormScreen> createState() => _SwitchingFormScreenState();
}

class _SwitchingFormScreenState extends State<SwitchingFormScreen> {
  late final IsianSwitching _i = widget.awal != null ? IsianSwitching.dari(widget.awal!) : IsianSwitching(penyulangAwal: widget.penyulangAwal);
  late final TextEditingController _koord = TextEditingController(text: _i.t['koordinat']);
  double? _akurasi;
  Map<String, String> _galat = {};
  final Map<String, String> _foto = {};

  @override
  void dispose() {
    _koord.dispose();
    super.dispose();
  }

  Future<void> _ambilFoto(String slot, String label) async {
    try {
      final p = await FotoLapangan.ambil(context,
          label: label,
          folder: 'switching',
          pathAda: _foto[slot],
          pratinjau: watermarkSwitching(widget.sesi, _i.t['nama']!, _i.t['penyulang']!, label, _i.t['koordinat']!.isEmpty ? null : _i.t['koordinat']));
      if (p != null && mounted) setState(() => _foto[slot] = p);
    } catch (e) {
      if (mounted) tampilPesan(context, '$e'.replaceFirst('Exception: ', ''));
    }
  }

  /// Validasi lalu tutup: penyimpanan berjalan di latar belakang (layar daftar, simpanLatar).
  void _simpan() {
    _i.t['koordinat'] = _koord.text.trim();
    final g = _i.cek(widget.data.penyulang);
    setState(() => _galat = g);
    if (g.isNotEmpty) {
      tampilPesan(context, 'Periksa isian bertanda merah: ${g.values.first}');
      return;
    }
    Navigator.pop(context, (_i, Map<String, String>.of(_foto)));
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final sections = d.sectionDari(_i.t['penyulang']!);
    final hulu = pilihanHulu(d.switching, _i);
    return PopScope(
      child: Scaffold(
        appBar: AppBar(title: Text(_i.baru ? 'Tambah Switching' : 'Ubah ${_i.id}')),
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), backgroundColor: AppColors.brand700),
              onPressed: _simpan,
              icon: const Icon(Icons.verified_outlined),
              label: const Text('Simpan & Verifikasi'),
            ),
          ),
        ),
        body: ColoredBox(
          color: Colors.transparent,
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
            const _Judul('Jenis switching'),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final j in jenisSwitching)
                ChoiceChip(
                  selected: _i.jenis == j.kode,
                  showCheckmark: false,
                  label: SizedBox(width: 38, child: Text(j.kode, textAlign: TextAlign.center)),
                  labelStyle: TextStyle(fontWeight: FontWeight.w900, color: _i.jenis == j.kode ? Colors.white : AppColors.neutral700),
                  selectedColor: j.warna,
                  backgroundColor: Colors.white,
                  side: BorderSide(color: _i.jenis == j.kode ? j.warna : AppColors.neutral200),
                  tooltip: j.nama,
                  onSelected: (_) => setState(() => _i.gantiJenis(j.kode)),
                ),
            ]),
            const SizedBox(height: 14),
            _teks('nama', 'Nama switching *', hint: 'mis. LBS Air Bara', maks: 80),
            _pilih(
                'Penyulang *',
                _i.t['penyulang']!,
                [for (final p in d.penyulang) (p, p)],
                (v) => setState(() {
                      _i.t['penyulang'] = v;
                      _i.t['sectionId'] = '';
                      _i.t['switchingHuluId'] = '';
                    }),
                galat: _galat['penyulang'],
                kosong: 'Pilih penyulang'),
            _pilih('Section', _i.t['sectionId']!, [for (final s in sections) (s.sectionId, s.section)], (v) => setState(() => _i.t['sectionId'] = v),
                kosong: _i.t['penyulang']!.isEmpty ? 'Pilih penyulang dulu' : 'Pilih section (opsional)'),
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: KolomKoordinat(
                controller: _koord,
                label: 'Koordinat Switching',
                akurasiM: _akurasi,
                wajib: true,
                onHasil: (h) => setState(() {
                  _akurasi = h.akurasiM;
                  _i.t['koordinat'] = h.koordinat;
                }),
                onChanged: (v) {
                  _i.t['koordinat'] = v;
                  _akurasi = null;
                },
              ),
            ),
            if (_galat['koordinat'] != null) _TeksGalat(_galat['koordinat']!),
            const _Judul('Posisi normal *'),
            SegmentedButton<String>(
              segments: [for (final (k, v) in pilihanSwitching['posisiNormal']!) ButtonSegment(value: k, label: Text(v))],
              selected: {_i.t['posisiNormal']!},
              showSelectedIcon: false,
              onSelectionChanged: (v) => setState(() => _i.t['posisiNormal'] = v.first),
            ),
            const SizedBox(height: 16),
            const _Judul('Foto (bisa menyusul dari rincian)'),
            Row(children: [
              for (final (slot, label) in slotFotoSwitching) ...[
                Expanded(child: _kotakFoto(slot, label)),
                if (slot != slotFotoSwitching.last.$1) const SizedBox(width: 12),
              ],
            ]),
            const SizedBox(height: 12),
            _Lipat(judul: 'Kontroler & kemampuan', buka: true, children: [
              _teks('merkKontroler', 'Merk kontroler', maks: 60),
              _teks('tipeKontroler', 'Tipe kontroler', maks: 60),
              _teks('versiFirmware', 'Versi firmware', maks: 40),
              Row(children: [
                Expanded(child: _teks('rasioCt', 'Rasio CT', hint: '400/1', maks: 30)),
                const SizedBox(width: 14),
                Expanded(child: _teks('rasioVt', 'Rasio VT', hint: '20000/110', maks: 30)),
              ]),
              _saklar('bisaTrip', 'Bisa trip (memutus arus gangguan)', diubah: () => _i.bisaTripDiubah = true),
              _saklar('catatGangguan', 'Ada indikator gangguan (FPI)'),
              _saklar('bacaArus', 'Bisa baca arus'),
              _saklar('bacaTegangan', 'Bisa baca tegangan'),
              _saklar('terhubungScada', 'Terhubung SCADA'),
              if (_i.b['terhubungScada']!) ...[
                _teks('kodeRtu', 'Kode RTU', maks: 40),
                _pilihKode('Media komunikasi', 'mediaKomunikasi'),
              ],
            ]),
            if (_i.jenis == 'FCO')
              _Lipat(judul: 'Fuse (FCO)', buka: true, children: [
                _pilihKode('Fungsi FCO', 'fungsiFco'),
                _pilihKode('Tipe fuse', 'fuseTipe'),
                _teks('fuseRating', 'Rating fuse', hint: '10K', maks: 20),
              ]),
            _Lipat(judul: 'Topologi (hulu, tiang, titik hubung)', children: [
              _pilih('Switching hulu', _i.t['switchingHuluId']!, [for (final s in hulu) (s.id, labelSwitching(s.jenis, s.nama))],
                  (v) => setState(() => _i.t['switchingHuluId'] = v),
                  kosong: 'Tidak ada / langsung dari GI'),
              _teks('tiangId', 'Nomor tiang (ASSETNUM)', maks: 40, angka: true),
              _saklar('titikHubung', 'Titik hubung ke penyulang lain'),
              if (_i.b['titikHubung']!) ...[
                _pilih(
                    'Penyulang sisi lain *',
                    _i.t['penyulangSisiB']!,
                    [
                      for (final p in d.penyulang)
                        if (p != _i.t['penyulang']) (p, p)
                    ],
                    (v) => setState(() => _i.t['penyulangSisiB'] = v),
                    galat: _galat['penyulangSisiB'],
                    kosong: 'Pilih penyulang'),
                _teks('tiangSisiA', 'Tiang sisi A', maks: 40),
                _teks('tiangSisiB', 'Tiang sisi B', maks: 40),
              ],
            ]),
            _Lipat(judul: 'Data unit (opsional)', children: [
              _teks('merk', 'Merk unit', maks: 60),
              _teks('tipe', 'Tipe unit', maks: 60),
              _teks('nomorSeri', 'Nomor seri', maks: 60),
              Row(children: [
                Expanded(child: _teks('tahunPasang', 'Tahun pasang', maks: 4, angka: true)),
                const SizedBox(width: 14),
                Expanded(child: _teks('ratingKv', 'Rating kV', angka: true)),
              ]),
              Row(children: [
                Expanded(child: _teks('ratingA', 'Rating A', angka: true)),
                const SizedBox(width: 14),
                Expanded(child: _teks('kapasitasPutusKa', 'Putus kA', angka: true)),
              ]),
              _pilihKode('Media', 'media'),
              _pilihKode('Penggerak', 'penggerak'),
              _teks('kodeAset', 'Kode aset PLN', maks: 40),
            ]),
            const SizedBox(height: 8),
            _pilihKode('Status operasi *', 'statusOperasi', bolehKosong: false),
            _pilihKode('Kondisi', 'kondisi', kosong: 'Belum dinilai'),
            const _Judul('Hasil verifikasi'),
            SegmentedButton<String>(
              segments: [for (final (k, v) in pilihanSwitching['statusVerifikasi']!) ButtonSegment(value: k, label: Text(v))],
              selected: {_i.t['statusVerifikasi']!},
              showSelectedIcon: false,
              onSelectionChanged: (v) => setState(() => _i.t['statusVerifikasi'] = v.first),
            ),
            const SizedBox(height: 12),
            _teks('catatan', 'Catatan', maks: 300, baris: 3),
            if (!_i.baru)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _i.aktif,
                title: const Text('Aktif', style: TextStyle(fontWeight: FontWeight.w700)),
                subtitle: const Text('Matikan untuk menonaktifkan (data tidak dihapus).'),
                onChanged: (v) => setState(() => _i.aktif = v),
              ),
          ]),
        ),
      ),
    );
  }

  Widget _teks(String k, String label, {String? hint, int maks = 60, bool angka = false, int baris = 1}) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: TextFormField(
          initialValue: _i.t[k],
          maxLength: maks,
          maxLines: baris,
          keyboardType: angka ? const TextInputType.numberWithOptions(decimal: true) : TextInputType.text,
          textCapitalization: angka ? TextCapitalization.none : TextCapitalization.sentences,
          decoration: InputDecoration(labelText: proper(label), hintText: hint, counterText: '', errorText: _galat[k], border: const OutlineInputBorder()),
          onChanged: (v) => _i.t[k] = v,
        ),
      );

  Widget _pilih(String label, String nilai, List<(String, String)> isi, void Function(String) ubah, {String? galat, String kosong = 'Pilih'}) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: DropdownButtonFormField<String>(
          key: ValueKey('$label|${isi.length}|$nilai'),
          initialValue: isi.any((x) => x.$1 == nilai) ? nilai : '',
          isExpanded: true,
          decoration: InputDecoration(labelText: proper(label), errorText: galat, border: const OutlineInputBorder()),
          items: [
            DropdownMenuItem(value: '', child: Text(kosong, style: const TextStyle(color: AppColors.neutral500))),
            for (final (k, v) in isi) DropdownMenuItem(value: k, child: Text(v, overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) => ubah(v ?? ''),
        ),
      );

  Widget _pilihKode(String label, String kunci, {String kosong = 'Pilih', bool bolehKosong = true}) {
    final isi = pilihanSwitching[kunci]!;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: DropdownButtonFormField<String>(
        initialValue: isi.any((x) => x.$1 == _i.t[kunci]) ? _i.t[kunci] : (bolehKosong ? '' : isi.first.$1),
        isExpanded: true,
        decoration: InputDecoration(labelText: proper(label), border: const OutlineInputBorder()),
        items: [
          if (bolehKosong) DropdownMenuItem(value: '', child: Text(kosong, style: const TextStyle(color: AppColors.neutral500))),
          for (final (k, v) in isi) DropdownMenuItem(value: k, child: Text(v)),
        ],
        onChanged: (v) => setState(() => _i.t[kunci] = v ?? ''),
      ),
    );
  }

  Widget _saklar(String k, String label, {VoidCallback? diubah}) => SwitchListTile(
        dense: true,
        contentPadding: EdgeInsets.zero,
        value: _i.b[k]!,
        title: Text(proper(label), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
        onChanged: (v) => setState(() {
          _i.b[k] = v;
          diubah?.call();
        }),
      );

  Widget _kotakFoto(String slot, String label) {
    final path = _foto[slot];
    final diServer = widget.awal?.adaFoto(slot) ?? false;
    return Column(children: [
      AspectRatio(
        aspectRatio: 4 / 3,
        child: Material(
          color: AppColors.neutral100,
          borderRadius: BorderRadius.circular(10),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () => _ambilFoto(slot, label),
            child: path != null
                ? Image.file(File(path), fit: BoxFit.cover)
                : Center(
                    child:
                        Icon(diServer ? Icons.cloud_done_outlined : Icons.add_a_photo_outlined, color: diServer ? AppColors.success600 : AppColors.neutral400)),
          ),
        ),
      ),
      const SizedBox(height: 4),
      Text(
          path != null
              ? '$label (baru)'
              : diServer
                  ? '$label ✓'
                  : label,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.neutral700)),
    ]);
  }
}

class _Judul extends StatelessWidget {
  const _Judul(this.teks);
  final String teks;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(proper(teks), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: AppColors.brand950)),
      );
}

class _TeksGalat extends StatelessWidget {
  const _TeksGalat(this.teks);
  final String teks;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Text(teks, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.red700)),
      );
}

class _Lipat extends StatelessWidget {
  const _Lipat({required this.judul, required this.children, this.buka = false});
  final String judul;
  final List<Widget> children;
  final bool buka;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Material(
          color: AppColors.neutral50,
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: AppColors.neutral150)),
          child: Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              initiallyExpanded: buka,
              title: Text(proper(judul), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppColors.brand900)),
              childrenPadding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              children: children,
            ),
          ),
        ),
      );
}
