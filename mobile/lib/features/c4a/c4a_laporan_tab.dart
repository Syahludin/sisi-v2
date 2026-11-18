import 'dart:async';

import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../../core/gps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../hartek/hartek_gaya.dart';
import '../insjar/insjar_form.dart';
import '../insjar/temuan_admin_antre.dart';
import '../tiang/pilih_titik_peta.dart';
import '../../widgets/refresh_sisi.dart';
import 'c4a_model.dart';

/// Titik dari GPS / peta.
typedef TitikC4A = ({double lat, double lng});

/// Kategori UIW di ringkasan (urutan tampil).
const kategoriC4A = ['Komponen', 'Peralatan', 'Pohon'];

/// C4A (permintaan Master Guswan 15 Nov 2026): tab Laporan C4A (pengganti tab Input Temuan).
/// Atas: ringkasan hari ini per kategori UIW. Tanpa laporan aktif: Buat Laporan C4A (penyulang, section, titik awal).
/// Dengan laporan aktif: + Tambah Temuan (form temuan memakai penyulang + section laporan) dan Ambil Titik Akhir.
/// Semua tersimpan di HP dulu lalu dikirim di latar (AntreanTemuanAdmin), jadi tetap jalan saat offline.
/// Bawah: riwayat laporan yang sudah ditutup hari ini (ketuk = temuan laporan itu). Tarik layar = perbarui dari server.
class LaporanC4ATab extends StatefulWidget {
  const LaporanC4ATab({
    super.key,
    required this.sesi,
    required this.antre,
    required this.master,
    required this.hariIni,
    required this.temuanHariIni,
    required this.onTambahTemuan,
    this.onLihatLaporan,
    this.onLihatKategori,
    this.onRefresh,
    this.ambilGps,
    this.pilihPeta,
  });

  final Sesi sesi;
  final AntreanTemuanAdmin antre;
  final MasterInsJar? master;

  /// Tanggal WIB hari ini (yyyy-MM-dd).
  final String hariIni;

  /// Temuan C4A hari ini (daftar HP), untuk ringkasan.
  final List<Map<String, dynamic>> temuanHariIni;
  final Future<void> Function(LaporanC4A laporan) onTambahTemuan;

  /// Ketuk kartu riwayat = daftar temuan laporan itu.
  final void Function(LaporanC4A laporan)? onLihatLaporan;

  /// Ketuk angka ringkasan = daftar temuan C4A hari ini pada kategori itu (Komponen / Peralatan / Pohon).
  final void Function(String kategori)? onLihatKategori;

  /// Tarik layar: unduh ulang temuan + riwayat dari server.
  final Future<void> Function()? onRefresh;

  /// Diganti di tes; bawaan = GPS HP / layar pilih titik di peta.
  final Future<TitikC4A?> Function()? ambilGps;
  final Future<TitikC4A?> Function(BuildContext context, TitikC4A? awal)? pilihPeta;

  @override
  State<LaporanC4ATab> createState() => _LaporanC4ATabState();
}

class _LaporanC4ATabState extends State<LaporanC4ATab> {
  LaporanC4A? _aktif;
  List<LaporanC4A> _riwayat = const [];
  bool _dibaca = false;

  @override
  void initState() {
    super.initState();
    widget.antre.addListener(_baca);
    _baca();
  }

  @override
  void dispose() {
    widget.antre.removeListener(_baca);
    super.dispose();
  }

  void _baca() {
    final u = widget.sesi.userId;
    unawaited(Future.wait([widget.antre.laporanAktif(u, widget.hariIni), widget.antre.riwayat(u, widget.hariIni)]).then((r) {
      if (mounted) {
        setState(() {
          _aktif = r[0] as LaporanC4A?;
          _riwayat = r[1] as List<LaporanC4A>;
          _dibaca = true;
        });
      }
    }));
  }

  int _jumlahTemuan(LaporanC4A l) {
    final n = widget.temuanHariIni.where((t) => '${t['c4aId'] ?? ''}' == l.c4aId).length;
    return n > l.jumlahTemuan ? n : l.jumlahTemuan;
  }

  Widget _kartuRiwayat(LaporanC4A l) {
    final jarak = l.jarakKm == null ? 'jarak sedang dihitung' : '${l.jarakKm!.toStringAsFixed(2)} km';
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Material(
        color: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: HartekGaya.garis)),
        child: InkWell(
          key: ValueKey('c4a-riwayat-${l.c4aId}'),
          borderRadius: BorderRadius.circular(16),
          onTap: widget.onLihatLaporan == null ? null : () => widget.onLihatLaporan!(l),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(l.kodeC4a.isEmpty ? 'Laporan C4A Harian' : l.kodeC4a, style: HartekGaya.kode),
                  Text(l.penyulang, style: HartekGaya.judulSeksi),
                  Text(l.section, style: HartekGaya.sekunder),
                  Text('${_jumlahTemuan(l)} temuan · $jarak', style: HartekGaya.sekunder),
                ]),
              ),
              const Icon(Icons.chevron_right_rounded, color: HartekGaya.redup),
            ]),
          ),
        ),
      ),
    );
  }

  Map<String, int> get _ringkas {
    final n = {for (final k in kategoriC4A) k: 0};
    final peta = widget.master?.kategoriUiw ?? const <String, String>{};
    for (final t in widget.temuanHariIni) {
      final k = peta['${t['jenisTemuanId'] ?? ''}'.trim()] ?? '';
      if (n.containsKey(k)) n[k] = n[k]! + 1;
    }
    return n;
  }

  Future<TitikC4A?> _gps() async {
    if (widget.ambilGps != null) return widget.ambilGps!();
    final galat = await Gps.siapkan();
    if (galat != null) {
      _pesan(galat);
      return null;
    }
    final p = await Gps.sampelPertama();
    if (p == null) _pesan('GPS belum mendapat titik. Coba lagi atau pilih di peta.');
    return p == null ? null : (lat: p.latitude, lng: p.longitude);
  }

  Future<TitikC4A?> _peta(TitikC4A? awal) async {
    if (widget.pilihPeta != null) return widget.pilihPeta!(context, awal);
    final p = await Navigator.push<LatLng>(
        context, MaterialPageRoute(builder: (_) => PilihTitikPetaScreen(awal: awal == null ? null : LatLng(awal.lat, awal.lng))));
    return p == null ? null : (lat: p.latitude, lng: p.longitude);
  }

  void _pesan(String p) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(p)));
  }

  Future<void> _buat() async {
    final m = widget.master;
    if (m == null) {
      _pesan('Butuh sinyal sekali untuk memuat daftar penyulang.');
      return;
    }
    final hasil = await showModalBottomSheet<({String penyulang, String section, TitikC4A titik, String sumber})>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _FormTitik(judul: 'Laporan C4A baru', tombol: 'Simpan Laporan', master: m, gps: _gps, peta: _peta),
    );
    if (hasil == null || !mounted) return;
    final l = LaporanC4A(
        c4aId: buatUniqueIdC4a(),
        tanggal: widget.hariIni,
        penyulang: hasil.penyulang,
        section: hasil.section,
        latAwal: hasil.titik.lat,
        lngAwal: hasil.titik.lng,
        sumberAwal: hasil.sumber);
    await widget.antre.bukaLaporan(widget.sesi, l);
    if (mounted) setState(() => _aktif = l);
    unawaited(widget.antre.kirim(widget.sesi));
  }

  Future<void> _tutup(LaporanC4A l) async {
    final hasil = await showModalBottomSheet<({String penyulang, String section, TitikC4A titik, String sumber})>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _FormTitik(
          judul: 'Titik akhir C4A', tombol: 'Tutup Laporan', master: null, gps: _gps, peta: _peta, keterangan: 'Jarak C4A dihitung otomatis menurut jarak jalan.'),
    );
    if (hasil == null || !mounted) return;
    await widget.antre.tutupLaporan(widget.sesi, l, hasil.titik.lat, hasil.titik.lng, hasil.sumber);
    if (mounted) setState(() => _aktif = null);
    _baca();
    unawaited(widget.antre.kirim(widget.sesi));
  }

  @override
  Widget build(BuildContext context) {
    final r = _ringkas;
    final boleh = widget.sesi.bisaUbah(AntreanTemuanAdmin.menu);
    final l = _aktif;
    final isi = ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 16, 16, 120), children: [
      Text('Ringkasan hari ini · ${tanggalHartek(widget.hariIni)}', style: HartekGaya.sekunder),
      const SizedBox(height: 8),
      Row(children: [
        for (final k in kategoriC4A) ...[
          if (k != kategoriC4A.first) const SizedBox(width: 8),
          Expanded(
            child: Material(
              color: AppColors.brand100,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: HartekGaya.garis)),
              child: InkWell(
                key: ValueKey('ringkas-$k-${r[k]}'),
                borderRadius: BorderRadius.circular(14),
                onTap: widget.onLihatKategori == null ? null : () => widget.onLihatKategori!(k),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
                  child: Column(children: [
                    Text('${r[k]}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
                    Text(k, style: HartekGaya.sekunder),
                  ]),
                ),
              ),
            ),
          ),
        ],
      ]),
      const SizedBox(height: 18),
      if (!_dibaca)
        const SizedBox.shrink()
      else if (l == null)
        KartuHartek(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Belum ada laporan C4A terbuka', style: HartekGaya.judulSeksi),
            const SizedBox(height: 6),
            const Text('Buat laporan dan ambil titik awal sebelum mencatat temuan.', style: HartekGaya.sekunder),
            const SizedBox(height: 14),
            FilledButton.icon(onPressed: boleh ? () => unawaited(_buat()) : null, icon: const Icon(Icons.flag_rounded), label: const Text('Buat Laporan C4A')),
          ]),
        )
      else
        KartuHartek(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            // ketuk judul laporan = semua temuan C4A penyulang + tanggal ini
            InkWell(
              key: const ValueKey('c4a-aktif-detail'),
              borderRadius: BorderRadius.circular(10),
              onTap: widget.onLihatLaporan == null ? null : () => widget.onLihatLaporan!(l),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(l.kodeC4a.isEmpty ? 'Laporan C4A Harian' : l.kodeC4a, style: HartekGaya.kode),
                    const SizedBox(height: 4),
                    Text(l.penyulang, style: HartekGaya.judulSeksi),
                    Text(l.section, style: HartekGaya.sekunder),
                    Text('${_jumlahTemuan(l)} temuan · ketuk untuk melihat detail', style: HartekGaya.sekunder),
                  ]),
                ),
                const Icon(Icons.chevron_right_rounded, color: HartekGaya.redup),
              ]),
            ),
            const SizedBox(height: 14),
            FilledButton.icon(
                onPressed: boleh ? () => unawaited(widget.onTambahTemuan(l)) : null, icon: const Icon(Icons.add_rounded), label: const Text('Tambah Temuan')),
            const SizedBox(height: 8),
            OutlinedButton.icon(
                onPressed: boleh ? () => unawaited(_tutup(l)) : null, icon: const Icon(Icons.outlined_flag_rounded), label: const Text('Ambil Titik Akhir')),
          ]),
        ),
      if (_riwayat.isNotEmpty) ...[
        const SizedBox(height: 18),
        const Text('Laporan selesai hari ini', style: HartekGaya.judulSeksi),
        for (final x in _riwayat) _kartuRiwayat(x),
      ],
    ]);
    final tarik = widget.onRefresh;
    return tarik == null ? isi : RefreshSisi(onRefresh: tarik, child: isi);
  }
}

/// Lembar isian titik (GPS / peta). [master] terisi = laporan baru (pilih penyulang + section).
class _FormTitik extends StatefulWidget {
  const _FormTitik({required this.judul, required this.tombol, required this.master, required this.gps, required this.peta, this.keterangan});
  final String judul, tombol;
  final String? keterangan;
  final MasterInsJar? master;
  final Future<TitikC4A?> Function() gps;
  final Future<TitikC4A?> Function(TitikC4A? awal) peta;

  @override
  State<_FormTitik> createState() => _FormTitikState();
}

class _FormTitikState extends State<_FormTitik> {
  String? _penyulang, _section;
  TitikC4A? _titik;
  String _sumber = '';

  bool get _lengkap => _titik != null && (widget.master == null || (_penyulang != null && _section != null));

  Future<void> _ambil(bool peta) async {
    final t = peta ? await widget.peta(_titik) : await widget.gps();
    if (t != null && mounted) {
      setState(() {
        _titik = t;
        _sumber = peta ? 'PETA' : 'GPS';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.master;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(widget.judul, style: HartekGaya.judulSeksi),
        if (widget.keterangan != null) ...[const SizedBox(height: 4), Text(widget.keterangan!, style: HartekGaya.sekunder)],
        if (m != null) ...[
          const SizedBox(height: 14),
          DropdownButtonFormField<String>(
            key: const ValueKey('c4a-penyulang'),
            initialValue: _penyulang,
            decoration: const InputDecoration(labelText: 'Penyulang'),
            items: [for (final p in m.penyulang.keys) DropdownMenuItem(value: p, child: Text(p))],
            onChanged: (v) => setState(() {
              _penyulang = v;
              _section = null;
            }),
          ),
          const SizedBox(height: 10),
          KeyedSubtree(
            key: const ValueKey('c4a-section'),
            // kunci dalam ikut penyulang: ganti penyulang = pilihan section dikosongkan
            child: DropdownButtonFormField<String>(
              key: ValueKey('c4a-section-${_penyulang ?? ''}'),
              initialValue: _section,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Section'),
              items: [for (final s in m.section(_penyulang)) DropdownMenuItem(value: s, child: Text(s, overflow: TextOverflow.ellipsis))],
              onChanged: (v) => setState(() => _section = v),
            ),
          ),
        ],
        const SizedBox(height: 14),
        Text(_titik == null ? 'Titik belum diambil' : '${_titik!.lat}, ${_titik!.lng}',
            style: _titik == null ? HartekGaya.sekunder : const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: HartekGaya.tinta)),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: OutlinedButton.icon(onPressed: () => unawaited(_ambil(false)), icon: const Icon(Icons.my_location_rounded), label: const Text('Ambil GPS'))),
          const SizedBox(width: 8),
          Expanded(child: OutlinedButton.icon(onPressed: () => unawaited(_ambil(true)), icon: const Icon(Icons.map_rounded), label: const Text('Pilih di Peta'))),
        ]),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _lengkap ? () => Navigator.pop(context, (penyulang: _penyulang ?? '', section: _section ?? '', titik: _titik!, sumber: _sumber)) : null,
          child: Text(widget.tombol),
        ),
      ]),
    );
  }
}
