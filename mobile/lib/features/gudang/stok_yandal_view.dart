import 'dart:async';

import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/refresh_sisi.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/sisi_widgets.dart';
import '../hartek/foto_lapangan.dart';
import '../row/watermark.dart';
import '../../widgets/kolom_pilih.dart';
import 'gudang_model.dart';
import 'gudang_widgets.dart';

/// v1.0.57 Stok Material (menu OPS_STOK_MATERIAL, tab "Stok MCB" di Shift Yandal). Awal tiap shift petugas memasukkan MCB yang ada
/// SATU PER SATU + satu foto stok; server membandingkannya dengan stok tim. Cocok = boleh mencatat pemakaian. Beda = menunggu admin
/// (pemakaian susulan untuk MCB yang lupa dicatat shift sebelumnya tidak perlu menunggu). Semua tulis langsung ke server (butuh sinyal).
class StokYandalView extends StatefulWidget {
  const StokYandalView({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  @override
  State<StokYandalView> createState() => StokYandalViewState();
}

class StokYandalViewState extends State<StokYandalView> {
  final _kunci = GlobalKey<_StokYandalPanelState>();
  static const _uuid = Uuid();

  /// Muat ulang dari server (tombol segarkan di Shift Yandal).
  Future<void> muat() async => _kunci.currentState?.muat();

  Future<String?> _foto(String label) async {
    try {
      final s = widget.sesi;
      return await FotoLapangan.ambil(
        context,
        label: label,
        folder: 'gudang',
        pratinjau: DataWatermark(
          kodeEksekusi: 'Stok MCB',
          ulp: s.ulp,
          tim: s.timNama,
          subTim: s.nama,
          penyulang: null,
          section: null,
          waktu: DateTime.now(),
          koordinat: null,
          diameter: null,
          jenis: 'Stok Material MCB',
          slot: label,
        ),
      );
    } catch (e) {
      if (mounted) tampilPesan(context, '$e'.replaceFirst('Exception: ', ''));
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.deps.gudangRepo, s = widget.sesi;
    return StokYandalPanel(
      key: _kunci,
      muat: () => r.stok(s),
      periksa: (entri, path) => r.simpanPemeriksaan(s, entri, path),
      pakai: (p) => r.simpanPemakaian(s, p),
      susulan: (selisihId, pemakaianId, meter, perlu) =>
          r.simpanSusulan(s, pemakaianId: pemakaianId, selisihId: selisihId, nomorMeter: meter, keperluan: perlu),
      ambilFoto: _foto,
      idBaru: _uuid.v4,
    );
  }
}

/// Isi layar Stok Material, tanpa Deps (bisa diuji dengan fungsi palsu).
class StokYandalPanel extends StatefulWidget {
  const StokYandalPanel({
    super.key,
    required this.muat,
    required this.periksa,
    required this.pakai,
    required this.susulan,
    required this.ambilFoto,
    required this.idBaru,
  });
  final Future<StokYandal> Function() muat;
  final Future<HasilPemeriksaan> Function(List<EntriMcb> entri, String fotoPath) periksa;
  final Future<String> Function(PemakaianBaru p) pakai;
  final Future<String> Function(String selisihId, String pemakaianId, String nomorMeter, String keperluan) susulan;
  final Future<String?> Function(String label) ambilFoto;
  final String Function() idBaru;

  @override
  State<StokYandalPanel> createState() => _StokYandalPanelState();
}

class _StokYandalPanelState extends State<StokYandalPanel> {
  StokYandal? _stok;
  bool _memuat = true;
  bool _sibuk = false;
  String _error = '';
  final List<EntriMcb> _entri = [];
  String? _fotoStok;

  @override
  void initState() {
    super.initState();
    unawaited(muat());
  }

  Future<void> muat() async {
    setState(() {
      _memuat = true;
      _error = '';
    });
    try {
      final s = await widget.muat();
      if (mounted) setState(() => _stok = s);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = KodeError.pesan(e.kode));
    } catch (_) {
      if (mounted) setState(() => _error = 'Stok gagal dimuat. Periksa sinyal lalu coba lagi.');
    } finally {
      if (mounted) setState(() => _memuat = false);
    }
  }

  /// Jalankan aksi tulis: galat server/jaringan jadi pesan, sukses = popup berhasil lalu muat ulang.
  Future<bool> _jalankan(Future<String?> Function() aksi) async {
    if (_sibuk) return false;
    setState(() => _sibuk = true);
    try {
      final ket = await aksi();
      if (!mounted) return true;
      unawaited(tampilPopupBerhasil(context, judul: 'Data berhasil disimpan', keterangan: ket));
      await muat();
      return true;
    } on ApiException catch (e) {
      if (mounted) tampilPesan(context, KodeError.pesan(e.kode));
      return false;
    } catch (_) {
      if (mounted) tampilPesan(context, 'Gagal menyimpan. Periksa sinyal lalu coba lagi.');
      return false;
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  Future<void> _tambahEntri(List<String> merk) async {
    final e = await showDialog<EntriMcb>(context: context, builder: (_) => _DialogEntri(merk: merk));
    if (e != null && mounted) setState(() => _entri.add(e));
  }

  void _kurangi(String kunci) {
    final i = _entri.lastIndexWhere((e) => e.kunci == kunci);
    if (i != -1) setState(() => _entri.removeAt(i));
  }

  Future<void> _fotoStokAmbil() async {
    final p = await widget.ambilFoto('Foto stok');
    if (p != null && mounted) setState(() => _fotoStok = p);
  }

  Future<void> _kirimPemeriksaan() async {
    final path = _fotoStok;
    if (path == null) return;
    final ok = await _jalankan(() async {
      final h = await widget.periksa(List.of(_entri), path);
      return h.status == 'COCOK' ? 'Stok cocok' : 'Ada selisih, menunggu admin';
    });
    if (ok && mounted) {
      setState(() {
        _entri.clear();
        _fotoStok = null;
      });
    }
  }

  Future<void> _catatPemakaian() async {
    final stok = _stok;
    if (stok == null) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (_) => _SheetPakai(
        jenis: stok.saldo.where((j) => j.jumlah > 0).toList(),
        keperluan: stok.keperluanMcb,
        pemakaianId: widget.idBaru(),
        ambilFoto: widget.ambilFoto,
        simpan: (p) => _jalankan(() async => await widget.pakai(p)),
      ),
    );
  }

  Future<void> _susulan(SelisihStok s) async {
    final pemakaianId = widget.idBaru();
    await showDialog<void>(
      context: context,
      builder: (_) => _DialogSusulan(selisih: s, keperluan: _stok?.keperluanMcb ?? const [], simpan: (meter, perlu) => _jalankan(() async => await widget.susulan(s.selisihId, pemakaianId, meter, perlu))),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = _stok;
    return RefreshSisi(
      onRefresh: muat,
      child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 8, 16, 120), children: [
        if (_memuat && s == null)
          const Padding(padding: EdgeInsets.all(40), child: Center(child: SisiLoader()))
        else if (s == null)
          SisiKosong(ikon: Icons.cloud_off_rounded, judul: 'Gagal memuat', pesan: _error)
        else ...[
          Text('Shift ${s.noShift} · ${s.tanggal}', style: const TextStyle(fontSize: 12.5, color: AppColors.neutral500, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (s.perluPeriksa) ..._formPemeriksaan(s) else ..._statusPemeriksaan(s),
        ],
      ]),
    );
  }

  Widget _banner(String teks, Color latar, Color warna, IconData ikon) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(14)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(ikon, color: warna, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text(teks, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: warna))),
        ]),
      );

  List<Widget> _formPemeriksaan(StokYandal s) {
    final kelompok = kelompokkanEntri(_entri);
    return [
      const Text('Pemeriksaan awal shift', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.navy900)),
      const SizedBox(height: 4),
      const Text('Masukkan semua MCB yang ada di tangan tim, satu per satu, lalu ambil satu foto stok.', style: TextStyle(fontSize: 12.5, color: AppColors.neutral700)),
      const SizedBox(height: 10),
      if (s.statusPemeriksaan == 'DIKEMBALIKAN')
        _banner('Admin meminta hitung ulang. Anda diminta menghitung ulang MCB lalu kirim lagi.', AppColors.accent100, AppColors.accent700, Icons.replay_rounded),
      for (final e in kelompok.entries)
        Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.neutral200)),
          child: Row(children: [
            Expanded(child: Text(EntriMcb(daya: e.key.split('|')[0], merk: e.key.split('|')[1], statusMcb: e.key.split('|')[2]).label, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy900))),
            IconButton(key: Key('kurang-${e.key}'), onPressed: () => _kurangi(e.key), icon: const Icon(Icons.remove_circle_outline_rounded)),
            Text('${e.value}', key: Key('jumlah-${e.key}'), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
            IconButton(
                key: Key('tambah-${e.key}'),
                onPressed: () {
                  final p = e.key.split('|');
                  setState(() => _entri.add(EntriMcb(daya: p[0], merk: p[1], statusMcb: p[2])));
                },
                icon: const Icon(Icons.add_circle_outline_rounded)),
          ]),
        ),
      SizedBox(
        height: 48,
        child: FilledButton.icon(
          key: const Key('tambah-mcb'),
          style: FilledButton.styleFrom(backgroundColor: AppColors.navy700),
          onPressed: _sibuk ? null : () => _tambahEntri(s.merkMcb),
          icon: const Icon(Icons.add_rounded),
          label: const Text('Tambah MCB'),
        ),
      ),
      const SizedBox(height: 4),
      Text('Total ${_entri.length} MCB', style: const TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
      const SizedBox(height: 10),
      KotakFoto(key: const Key('ambil-foto-stok'), path: _fotoStok, labelKosong: 'Ambil foto stok', aktif: !_sibuk, onTap: _fotoStokAmbil),
      const SizedBox(height: 12),
      SizedBox(
        height: 48,
        child: FilledButton.icon(
          key: const Key('kirim-pemeriksaan'),
          onPressed: _sibuk || _fotoStok == null ? null : _kirimPemeriksaan,
          icon: _sibuk ? const SisiLoader(ukuran: 18, warna: Colors.white) : const Icon(Icons.send_rounded),
          label: const Text('Kirim pemeriksaan'),
        ),
      ),
    ];
  }

  List<Widget> _statusPemeriksaan(StokYandal s) {
    final boleh = s.bolehPakai;
    return [
      if (boleh)
        _banner(s.statusPemeriksaan == 'COCOK' ? 'Stok cocok dengan hitungan sistem. Anda boleh memakai MCB.' : 'Selisih sudah diselesaikan. Anda boleh memakai MCB.',
            AppColors.success100, AppColors.success700, Icons.verified_rounded)
      else
        _banner('Ada selisih stok yang menunggu persetujuan admin. Pemakaian belum bisa dicatat, kecuali pemakaian susulan.', AppColors.accent100, AppColors.accent700, Icons.hourglass_top_rounded),
      if (!boleh)
        for (final x in s.selisih)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.neutral200)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(x.teks, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy900)),
              Text(x.menunggu ? 'Menunggu persetujuan admin' : 'Selesai: ${labelCara(x.caraPenyelesaian)}', style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
              if (x.menunggu && x.kurang)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(key: Key('susulan-${x.selisihId}'), onPressed: _sibuk ? null : () => _susulan(x), icon: const Icon(Icons.edit_note_rounded), label: const Text('Isi pemakaian susulan')),
                ),
            ]),
          ),
      if (boleh) ...[
        const Text('Stok tim', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.navy900)),
        const SizedBox(height: 4),
        Text(s.saldo.isEmpty ? 'Stok MCB habis.' : ringkasJenis(s.saldo), style: const TextStyle(color: AppColors.neutral700)),
        const SizedBox(height: 12),
        SizedBox(
          height: 48,
          child: FilledButton.icon(key: const Key('catat-pemakaian'), onPressed: _sibuk || s.saldo.isEmpty ? null : _catatPemakaian, icon: const Icon(Icons.bolt_rounded), label: const Text('Catat pemakaian MCB')),
        ),
      ],
    ];
  }
}

/// Tambah satu MCB (daya, merk, status) ke daftar pemeriksaan.
class _DialogEntri extends StatefulWidget {
  const _DialogEntri({required this.merk});
  final List<String> merk;
  @override
  State<_DialogEntri> createState() => _DialogEntriState();
}

class _DialogEntriState extends State<_DialogEntri> {
  final _daya = TextEditingController();
  final _merk = TextEditingController();
  String _status = statusMcb.first;
  String _galat = '';

  @override
  void dispose() {
    _daya.dispose();
    _merk.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Tambah MCB'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            KeyedSubtree(key: const Key('in-daya'), child: KolomDaya(controller: _daya)),
            KolomDaftar(key: const Key('in-merk'), controller: _merk, daftar: widget.merk, label: 'Merk'),
            const SizedBox(height: 8),
            PilihStatusMcb(nilai: _status, onChanged: (v) => setState(() => _status = v)),
            if (_galat.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_galat, style: const TextStyle(color: AppColors.red700, fontSize: 12.5))),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
          FilledButton(
            key: const Key('simpan-entri'),
            onPressed: () {
              if (_daya.text.trim().isEmpty || _merk.text.trim().isEmpty) {
                setState(() => _galat = 'Isi daya (angka) dan merk MCB.');
                return;
              }
              Navigator.pop(context, EntriMcb(daya: _daya.text.trim(), merk: _merk.text.trim(), statusMcb: _status));
            },
            child: const Text('Tambah'),
          ),
        ],
      );
}

/// Pemakaian susulan: nomor meter + keperluan, atas nama shift sebelumnya (server menentukan).
class _DialogSusulan extends StatefulWidget {
  const _DialogSusulan({required this.selisih, required this.keperluan, required this.simpan});
  final SelisihStok selisih;
  final List<String> keperluan;
  final Future<bool> Function(String nomorMeter, String keperluan) simpan;
  @override
  State<_DialogSusulan> createState() => _DialogSusulanState();
}

class _DialogSusulanState extends State<_DialogSusulan> {
  final _meter = TextEditingController();
  final _perlu = TextEditingController();
  String _galat = '';
  bool _sibuk = false;

  @override
  void dispose() {
    _meter.dispose();
    _perlu.dispose();
    super.dispose();
  }

  Future<void> _kirim() async {
    if (_meter.text.trim().isEmpty || _perlu.text.trim().isEmpty) {
      setState(() => _galat = 'Isi nomor meter dan keperluan.');
      return;
    }
    setState(() {
      _galat = '';
      _sibuk = true;
    });
    final ok = await widget.simpan(_meter.text.trim(), _perlu.text.trim());
    if (!mounted) return;
    if (ok) {
      Navigator.pop(context);
    } else {
      setState(() => _sibuk = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Pemakaian susulan'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${widget.selisih.daya} ${widget.selisih.merk} ${widget.selisih.statusMcb} (satu MCB)', style: const TextStyle(fontWeight: FontWeight.w800)),
            const Text('Dicatat atas nama shift dan petugas sebelumnya.', style: TextStyle(fontSize: 12, color: AppColors.neutral500)),
            const SizedBox(height: 8),
            TextField(key: const Key('in-meter'), controller: _meter, maxLength: 30, decoration: sisiInput('Nomor meter')),
            KolomDaftar(key: const Key('in-keperluan'), controller: _perlu, daftar: widget.keperluan, label: 'Keperluan', maks: 200),
            if (_galat.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_galat, style: const TextStyle(color: AppColors.red700, fontSize: 12.5))),
          ]),
        ),
        actions: [
          TextButton(onPressed: _sibuk ? null : () => Navigator.pop(context), child: const Text('Batal')),
          FilledButton(key: const Key('simpan-susulan'), onPressed: _sibuk ? null : _kirim, child: const Text('Simpan')),
        ],
      );
}

/// Catat pemakaian MCB: pilih jenis dari stok tim, nomor meter, keperluan, foto penggunaan (wajib).
class _SheetPakai extends StatefulWidget {
  const _SheetPakai({required this.jenis, required this.keperluan, required this.pemakaianId, required this.ambilFoto, required this.simpan});
  final List<JenisMcb> jenis;
  final List<String> keperluan;
  final String pemakaianId;
  final Future<String?> Function(String label) ambilFoto;
  final Future<bool> Function(PemakaianBaru p) simpan;
  @override
  State<_SheetPakai> createState() => _SheetPakaiState();
}

class _SheetPakaiState extends State<_SheetPakai> {
  late JenisMcb _jenis = widget.jenis.first;
  final _meter = TextEditingController();
  final _perlu = TextEditingController();
  String? _foto;
  String _galat = '';
  bool _sibuk = false;

  @override
  void dispose() {
    _meter.dispose();
    _perlu.dispose();
    super.dispose();
  }

  Future<void> _kirim() async {
    if (_meter.text.trim().isEmpty || _perlu.text.trim().isEmpty) {
      setState(() => _galat = 'Isi nomor meter dan keperluan.');
      return;
    }
    final foto = _foto;
    if (foto == null) {
      setState(() => _galat = 'Ambil foto penggunaan dulu.');
      return;
    }
    setState(() {
      _galat = '';
      _sibuk = true;
    });
    final ok = await widget.simpan(PemakaianBaru(
        pemakaianId: widget.pemakaianId, daya: _jenis.daya, merk: _jenis.merk, statusMcb: _jenis.statusMcb, nomorMeter: _meter.text.trim(), keperluan: _perlu.text.trim(), fotoPath: foto));
    if (!mounted) return;
    if (ok) {
      Navigator.pop(context);
    } else {
      setState(() => _sibuk = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Catat pemakaian MCB', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.navy900)),
            const SizedBox(height: 10),
            KolomPilih(
              key: const Key('pilih-jenis'),
              label: 'MCB yang dipakai',
              pilihan: [for (var i = 0; i < widget.jenis.length; i++) PilihanItem('$i', '${widget.jenis[i].label} (${widget.jenis[i].jumlah})')],
              nilaiAwal: '${widget.jenis.indexOf(_jenis)}',
              onChanged: (v) => setState(() => _jenis = widget.jenis[int.parse(v)]),
            ),
            const SizedBox(height: 8),
            TextField(key: const Key('in-meter'), controller: _meter, maxLength: 30, decoration: sisiInput('Nomor meter')),
            KolomDaftar(key: const Key('in-keperluan'), controller: _perlu, daftar: widget.keperluan, label: 'Keperluan penggunaan', maks: 200),
            KotakFoto(
              key: const Key('ambil-foto-pakai'),
              path: _foto,
              labelKosong: 'Ambil foto penggunaan',
              aktif: !_sibuk,
              onTap: () async {
                final p = await widget.ambilFoto('Foto penggunaan');
                if (p != null && mounted) setState(() => _foto = p);
              },
            ),
            if (_galat.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_galat, style: const TextStyle(color: AppColors.red700, fontSize: 12.5))),
            const SizedBox(height: 12),
            SizedBox(height: 48, child: FilledButton(key: const Key('simpan-pemakaian'), onPressed: _sibuk ? null : _kirim, child: _sibuk ? const SisiLoader(ukuran: 18, warna: Colors.white) : const Text('Simpan pemakaian'))),
          ]),
        ),
      );
}
