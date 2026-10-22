import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/foto_slot.dart';
import '../../widgets/sisi_widgets.dart';
import '../row/kamera_screen.dart';
import '../row/row_repository.dart' show RowError;
import 'lokasi_p0.dart';
import 'p0_model.dart';
import 'p0_repository.dart';
import '../../widgets/sisi_loader.dart';

/// v0.66.3 (keputusan kvlar 9 Okt 2026): Pengecekan Switching langsung di card Foto detail P0, SATU switching per P0.
/// Nama Switching dari section P0 (LBS / ACR), indikator Remote / Local / Protection / Reclose (Nyala / Padam),
/// Arus R / S / T, catatan. Sesudah disimpan nama / indikator / catatan terkunci, Arus R/S/T bisa diubah sampai P0 selesai.
/// v0.75.0 (permintaan kvlar 10 Okt 2026): foto langsung bisa diambil tanpa menunggu Simpan (draf di HP), lalu
/// Simpan Switching menyimpan isian + foto bersamaan (Foto Arus wajib). Indikator tersimpan tetap disorot warnanya.
class SwitchingPanel extends StatefulWidget {
  const SwitchingPanel({super.key, required this.deps, required this.sesi, required this.p0, required this.onBerubah, this.onUbahLokasi});
  final Deps deps;
  final Sesi sesi;
  final P0Lokal p0;
  final ValueChanged<P0Lokal> onBerubah;
  final VoidCallback? onUbahLokasi;

  @override
  State<SwitchingPanel> createState() => _SwitchingPanelState();
}

class _SwitchingPanelState extends State<SwitchingPanel> {
  bool _proses = false;
  final Map<String, String> _indikator = {};
  final _r = TextEditingController(), _s = TextEditingController(), _t = TextEditingController(), _catatan = TextEditingController();
  String? _diisiDari; // id switching (+ status simpan) yang isiannya sudah dimuat ke kolom

  P0Lokal get _x => widget.p0;
  SwitchingLokal? get _w => _x.switching.isEmpty ? null : _x.switching.first;
  bool get _habis => widget.sesi.habisShift(widget.deps.jam.sekarang());

  @override
  void initState() {
    super.initState();
    _isiDariData();
  }

  @override
  void didUpdateWidget(SwitchingPanel lama) {
    super.didUpdateWidget(lama);
    _isiDariData();
  }

  @override
  void dispose() {
    for (final c in [_r, _s, _t, _catatan]) {
      c.dispose();
    }
    super.dispose();
  }

  void _isiDariData() {
    final w = _w;
    if (w == null) return;
    final kunci = '${w.id}-${w.disimpan}';
    if (_diisiDari == kunci) return;
    final pertama = _diisiDari == null || !_diisiDari!.startsWith(w.id);
    _diisiDari = kunci;
    if (w.disimpan) {
      _indikator
        ..clear()
        ..addAll(w.indikator);
      _r.text = teksArus(w.arusR);
      _s.text = teksArus(w.arusS);
      _t.text = teksArus(w.arusT);
      _catatan.text = w.catatan;
    } else if (pertama) {
      // draf dibuka lagi: isian sementara dikembalikan (kolom yang sedang diketik tidak ditimpa)
      _indikator.addAll(w.indikator);
      _r.text = w.isianDraf['R'] ?? _r.text;
      _s.text = w.isianDraf['S'] ?? _s.text;
      _t.text = w.isianDraf['T'] ?? _t.text;
      _catatan.text = w.isianDraf['catatan'] ?? _catatan.text;
    }
  }

  double? _angka(TextEditingController c) {
    final v = c.text.trim().replaceAll(',', '.');
    if (v.isEmpty) return null;
    final n = double.tryParse(v);
    return n == null || !n.isFinite || n < 0 || n > 5000 ? null : n;
  }

  ({double r, double s, double t})? _arus() {
    final r = _angka(_r), s = _angka(_s), t = _angka(_t);
    if (r == null || s == null || t == null) {
      tampilPesan(context, 'Isi Arus R, S, T (angka 0 - 5000 A).');
      return null;
    }
    return (r: r, s: s, t: t);
  }

  Map<String, String> get _isianDraf => {'R': _r.text.trim(), 'S': _s.text.trim(), 'T': _t.text.trim(), 'catatan': _catatan.text.trim()};

  Future<void> _simpanBaru() async {
    if (_proses) return;
    final nama = _x.namaSwitchingP0;
    if (nama.isEmpty) {
      tampilPesan(context, 'Section P0 bukan LBS / ACR. Ubah lewat tombol Edit di card Data P0.');
      return;
    }
    for (final n in namaIndikator) {
      if (_indikator[n] == null) {
        tampilPesan(context, 'Pilih indikator $n (Nyala / Padam).');
        return;
      }
    }
    final a = _arus();
    if (a == null) return;
    if (!(_w?.adaFotoArus ?? false)) {
      tampilPesan(context, 'Ambil Foto Arus dulu (wajib), lalu Simpan.');
      return;
    }
    final jumlahFoto = _w?.foto.length ?? 0;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Simpan $nama?'),
        content: Text('Isian dan $jumlahFoto foto disimpan bersamaan. Indikator dan catatan tidak bisa diubah setelah disimpan; '
            'Arus R/S/T masih bisa diubah sampai P0 selesai.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cek lagi')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Simpan')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _proses = true);
    try {
      final baru = await widget.deps.p0.tambahSwitching(widget.sesi, _x,
          indikator: Map.of(_indikator), arusR: a.r, arusS: a.s, arusT: a.t, catatan: _catatan.text);
      if (!mounted) return;
      widget.onBerubah(baru);
      tampilPesan(context, 'Switching + foto disimpan.');
      unawaited(widget.deps.syncCtl.sinkron());
    } on RowError catch (e) {
      if (mounted) tampilPesan(context, e.pesan);
    } catch (_) {
      if (mounted) tampilPesan(context, 'Switching gagal disimpan. Coba lagi.');
    } finally {
      if (mounted) setState(() => _proses = false);
    }
  }

  Future<void> _simpanArus() async {
    final w = _w;
    if (w == null || _proses) return;
    final a = _arus();
    if (a == null) return;
    setState(() => _proses = true);
    try {
      final baru = await widget.deps.p0.ubahArusSwitching(widget.sesi, _x, w.id, a.r, a.s, a.t);
      if (!mounted) return;
      widget.onBerubah(baru);
      tampilPesan(context, 'Arus diperbarui.');
      unawaited(widget.deps.syncCtl.sinkron());
    } on RowError catch (e) {
      if (mounted) tampilPesan(context, e.pesan);
    } finally {
      if (mounted) setState(() => _proses = false);
    }
  }

  Future<void> _buangDraf() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Hapus foto draf?'),
        content: const Text('Foto switching yang belum disimpan dihapus dari HP. Pakai ini kalau section P0 salah.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.red600),
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final baru = await widget.deps.p0.buangDrafSwitching(widget.sesi, _x);
      _diisiDari = null;
      if (mounted) widget.onBerubah(baru);
    } on RowError catch (e) {
      if (mounted) tampilPesan(context, e.pesan);
    }
  }

  bool _arusBerubah(SwitchingLokal w) {
    final r = _angka(_r), s = _angka(_s), t = _angka(_t);
    return r != w.arusR || s != w.arusS || t != w.arusT;
  }

  bool get _bolehAmbilFoto =>
      !_x.selesai && !_habis && (_x.foto['SEBELUM']?.terkunci ?? false) && _x.namaSwitchingP0.isNotEmpty;

  Future<void> _foto(String slot) async {
    final x = _x, w = _w;
    if (_proses) return;
    final ada = w?.foto[slot];
    if (ada != null) {
      await lihatFoto(context, path: ada.path, slot: labelSlotSwitching[slot] ?? slot, keterangan: '${w!.nama} · ${w.kodeTampil(x)}');
      return;
    }
    if (_habis || x.selesai) {
      tampilPesan(context, x.selesai ? 'P0 sudah selesai.' : 'Jam shift sudah habis.');
      return;
    }
    if (!(x.foto['SEBELUM']?.terkunci ?? false)) {
      tampilPesan(context, 'Simpan foto Sebelum dulu.');
      return;
    }
    if (x.namaSwitchingP0.isEmpty) {
      tampilPesan(context, 'Section P0 bukan LBS / ACR. Ubah lewat tombol Edit di card Data P0.');
      return;
    }
    P0Lokal? baru;
    final contoh = w ?? P0Repository.switchingPratinjau(x, widget.deps.jam.sekarang());
    final f = await ambilFotoRow(context,
        slot: labelSlotSwitching[slot] ?? slot,
        pratinjau: P0Repository.watermarkSwitching(widget.sesi, x, contoh, slot, widget.deps.jam.sekarang()),
        bolehGaleri: false,
        p0: true,
        simpan: (foto) async {
          baru = await widget.deps.p0.simpanFotoSwitching(widget.sesi, x, slot, foto,
              indikatorDraf: Map.of(_indikator), isianDraf: _isianDraf);
        });
    final b = baru;
    if (f == null || b == null || !mounted) {
      if (mounted) {
        final kini = await widget.deps.p0.satu(x.userId, x.id);
        if (kini != null && mounted) widget.onBerubah(kini);
      }
      return;
    }
    widget.onBerubah(b);
    final simpan = b.switching.first.disimpan;
    tampilPesan(context,
        'Foto ${labelSlotSwitching[slot]} diambil${f.lat == null ? ' TANPA koordinat' : ''}.${simpan ? '' : ' Tekan Simpan Switching kalau sudah lengkap.'}');
    if (simpan) unawaited(widget.deps.syncCtl.sinkron());
  }

  Widget _kolomArus({required bool bisaUbah}) {
    Widget kolom(String label, TextEditingController c) => Expanded(
          child: TextField(
            controller: c,
            enabled: bisaUbah,
            onChanged: (_) => setState(() {}),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
            decoration: sisiInput('Arus $label (A)'),
          ),
        );
    return Row(children: [kolom('R', _r), const SizedBox(width: 8), kolom('S', _s), const SizedBox(width: 8), kolom('T', _t)]);
  }

  Widget _kotakFoto(SwitchingLokal? w, String slot) {
    final f = w?.foto[slot];
    final boleh = f == null && _bolehAmbilFoto;
    final arusKosong = slot == 'ARUS' && f == null;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: _proses || (f == null && !boleh) ? null : () => unawaited(_foto(slot)),
      child: Column(children: [
        AspectRatio(
          aspectRatio: 1,
          child: Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: boleh ? AppColors.brand50 : const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: arusKosong && boleh ? AppColors.accent600 : AppColors.neutral200, width: arusKosong && boleh ? 1.6 : 1),
            ),
            child: f == null
                ? Icon(Icons.add_a_photo_outlined, color: boleh ? AppColors.brand700 : AppColors.neutral300, size: 24)
                : Stack(fit: StackFit.expand, children: [
                    Image.file(File(f.path), fit: BoxFit.cover,
                        errorBuilder: (context, error, stack) => const Icon(Icons.broken_image_outlined, color: AppColors.neutral400)),
                    Positioned(
                      top: 5,
                      right: 5,
                      child: Container(
                        padding: const EdgeInsets.all(3),
                        decoration: BoxDecoration(color: w!.disimpan ? AppColors.success700 : AppColors.accent600, shape: BoxShape.circle),
                        child: Icon(f.terkirim ? Icons.cloud_done_rounded : (w.disimpan ? Icons.lock_rounded : Icons.check_rounded),
                            size: 12, color: Colors.white),
                      ),
                    ),
                  ]),
          ),
        ),
        const SizedBox(height: 4),
        Text(labelSlotSwitching[slot]!,
            textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.navy900)),
        Text(f != null ? (w!.disimpan ? 'Disimpan' : 'Belum disimpan') : (slot == 'ARUS' ? 'Wajib' : 'Opsional'),
            style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: f != null ? (w!.disimpan ? AppColors.success700 : AppColors.accent700) : (slot == 'ARUS' ? AppColors.accent700 : AppColors.neutral400))),
      ]),
    );
  }

  Widget _gridFoto(SwitchingLokal? w) => GridView.count(
        crossAxisCount: 3,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 0.72,
        children: [for (final sl in slotSwitching) _kotakFoto(w, sl)],
      );

  @override
  Widget build(BuildContext context) {
    final x = _x, w = _w;
    final kunciSemua = x.selesai || _habis;
    final sebelumDisimpan = x.foto['SEBELUM']?.terkunci ?? false;
    final judul = Row(children: [
      const Icon(Icons.toggle_on_outlined, size: 20, color: AppColors.navy700),
      const SizedBox(width: 6),
      const Expanded(child: Text('Pengecekan Switching', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy900))),
      if (_proses) const SisiLoader(ukuran: 16),
    ]);

    // ---------- belum disimpan (kosong / draf foto) ----------
    if (w == null || !w.disimpan) {
      if (x.selesai) {
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          judul,
          const SizedBox(height: 6),
          const Text('Tidak ada data switching.', style: TextStyle(fontSize: 12, color: AppColors.neutral500)),
        ]);
      }
      final nama = x.namaSwitchingP0;
      final adaArus = w?.adaFotoArus ?? false;
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        judul,
        const SizedBox(height: 10),
        if (nama.isNotEmpty)
          SorotSwitching(nama: nama, section: x.section, penyulang: x.penyulang)
        else
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              const Expanded(
                child: Text('Section P0 belum LBS / ACR. Pilih section switching lewat Edit.',
                    style: TextStyle(fontSize: 12, color: AppColors.neutral900)),
              ),
              if (widget.onUbahLokasi != null && !kunciSemua && w == null)
                TextButton(onPressed: widget.onUbahLokasi, child: const Text('Edit')),
            ]),
          ),
        const SizedBox(height: 12),
        for (final n in namaIndikator)
          PilihIndikator(
            nama: n,
            nilai: _indikator[n],
            onPilih: kunciSemua ? null : (v) => setState(() => _indikator[n] = v),
          ),
        const SizedBox(height: 4),
        _kolomArus(bisaUbah: !kunciSemua),
        const SizedBox(height: 12),
        _gridFoto(w),
        if (w != null && w.foto.isNotEmpty && !kunciSemua)
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: _proses ? null : () => unawaited(_buangDraf()),
              icon: const Icon(Icons.delete_outline_rounded, size: 18, color: AppColors.red600),
              label: const Text('Hapus foto draf', style: TextStyle(color: AppColors.red600)),
            ),
          ),
        const SizedBox(height: 6),
        TextField(controller: _catatan, maxLines: 2, maxLength: 300, decoration: sisiInput('Catatan')),
        if (!sebelumDisimpan)
          const Padding(
            padding: EdgeInsets.only(bottom: 6),
            child: Text('Simpan foto Sebelum dulu, baru foto switching bisa diambil.', style: TextStyle(fontSize: 11.5, color: AppColors.accent700)),
          )
        else if (!adaArus)
          const Padding(
            padding: EdgeInsets.only(bottom: 6),
            child: Text('Foto Arus wajib. Isian + foto disimpan bersamaan.', style: TextStyle(fontSize: 11.5, color: AppColors.accent700)),
          ),
        SizedBox(
          height: 46,
          child: FilledButton.icon(
            onPressed: _proses || nama.isEmpty || kunciSemua || !sebelumDisimpan || !adaArus ? null : () => unawaited(_simpanBaru()),
            icon: const Icon(Icons.save_rounded),
            label: Text(w == null || w.foto.isEmpty ? 'Simpan Switching' : 'Simpan Switching + ${w.foto.length} foto'),
          ),
        ),
      ]);
    }

    // ---------- sudah disimpan ----------
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      judul,
      const SizedBox(height: 10),
      SorotSwitching(
        nama: w.nama,
        section: w.section,
        penyulang: x.penyulang,
        kode: w.kodeTampil(x),
        trailing: const Icon(Icons.lock_rounded, size: 18, color: Color(0xCCFFFFFF)),
      ),
      const SizedBox(height: 12),
      // v0.75.0: indikator tersimpan tetap disorot warnanya (terkunci)
      for (final n in namaIndikator) PilihIndikator(nama: n, nilai: w.indikator[n]),
      const SizedBox(height: 4),
      _kolomArus(bisaUbah: !kunciSemua),
      if (!kunciSemua && _arusBerubah(w))
        Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            onPressed: _proses ? null : () => unawaited(_simpanArus()),
            icon: const Icon(Icons.save_outlined, size: 18),
            label: const Text('Simpan perubahan arus'),
          ),
        ),
      if (w.catatan.isNotEmpty) ...[
        const SizedBox(height: 6),
        Text('Catatan: ${w.catatan}', style: const TextStyle(fontSize: 12.5, color: AppColors.neutral700)),
      ],
      const SizedBox(height: 12),
      _gridFoto(w),
    ]);
  }
}

/// v0.75.0: pilihan Nyala / Padam satu indikator. onPilih null = terkunci, pilihan tetap disorot (isian terakhir terlihat).
class PilihIndikator extends StatelessWidget {
  const PilihIndikator({super.key, required this.nama, required this.nilai, this.onPilih});
  final String nama;
  final String? nilai;
  final ValueChanged<String>? onPilih;

  @override
  Widget build(BuildContext context) {
    final kunci = onPilih == null;
    Widget segmen(String v) {
      final dipilih = nilai == v;
      final nyala = v == 'Nyala';
      final warna = nyala ? AppColors.success700 : AppColors.navy700;
      final latar = dipilih ? (nyala ? AppColors.success100 : AppColors.navy100) : Colors.white;
      return Expanded(
        child: Material(
          color: latar,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: kunci ? null : () => onPilih!(v),
            child: Container(
              height: 42,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: dipilih ? warna : AppColors.neutral200, width: dipilih ? 1.6 : 1),
              ),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(nyala ? (dipilih ? Icons.lightbulb_rounded : Icons.lightbulb_outline_rounded) : Icons.power_settings_new_rounded,
                    size: 16, color: dipilih ? warna : (kunci ? AppColors.neutral300 : AppColors.neutral400)),
                const SizedBox(width: 6),
                Text(v,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: dipilih ? FontWeight.w800 : FontWeight.w600,
                        color: dipilih ? warna : (kunci ? AppColors.neutral300 : AppColors.neutral500))),
                if (dipilih && kunci) ...[
                  const SizedBox(width: 4),
                  Icon(Icons.check_circle_rounded, size: 14, color: warna),
                ],
              ]),
            ),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(children: [
        SizedBox(width: 86, child: Text(nama, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.navy900))),
        segmen('Nyala'),
        const SizedBox(width: 8),
        segmen('Padam'),
      ]),
    );
  }
}
