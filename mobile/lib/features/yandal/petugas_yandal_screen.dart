import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import 'petugas_yandal_repository.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/refresh_sisi.dart';

/// v0.63.0 Operasi > Pindah Tim Petugas Yandal (ADMIN / SUPER; keputusan kvlar 7 Okt 2026).
/// v0.63.2 (keputusan kvlar 8 Okt 2026): layar 1 = kartu per tim Yandal, ketuk kartu = daftar petugas tim itu,
/// ketuk petugas = pindah / nonaktifkan. Perubahan dari semua tim dikumpulkan lalu disimpan sekaligus (format tetap).
/// Berlaku untuk login berikutnya; shift yang sedang berjalan tidak berubah.
class PetugasYandalScreen extends StatefulWidget {
  const PetugasYandalScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  @override
  State<PetugasYandalScreen> createState() => _PetugasYandalScreenState();
}

class _PetugasYandalScreenState extends State<PetugasYandalScreen> {
  late final PetugasYandalRepository _repo = PetugasYandalRepository(widget.deps.api);
  final _versi = ValueNotifier<int>(0); // layar tim ikut digambar ulang saat draft berubah
  DraftPetugasYandal? _draft;
  bool _memuat = true;
  bool _menyimpan = false;
  String? _pesan;

  bool get _bisaUbah =>
      widget.sesi.bisaUbah(PetugasYandalRepository.menu) && (widget.sesi.role == 'ADMIN' || widget.sesi.role == 'SUPER');

  @override
  void initState() {
    super.initState();
    unawaited(_muat());
  }

  @override
  void dispose() {
    _versi.dispose();
    super.dispose();
  }

  void _ubah(VoidCallback fn) {
    if (!mounted) return;
    setState(fn);
    _versi.value++;
  }

  String _gagal(Object e) => e is ApiException && !e.kode.startsWith('HTTP_') ? KodeError.pesan(e.kode) : 'Tidak ada sinyal. Coba lagi.';

  Future<void> _muat() async {
    _ubah(() => _memuat = true);
    String? pesan;
    DataPetugasYandal? data;
    try {
      data = await _repo.muat(widget.sesi);
    } catch (e) {
      pesan = _gagal(e);
    }
    _ubah(() {
      if (data != null) _draft = DraftPetugasYandal(data);
      _pesan = pesan;
      _memuat = false;
    });
  }

  Future<bool> _bolehBuang(BuildContext ctx) async {
    final d = _draft;
    if (d == null || d.jumlah == 0) return true;
    final ok = await showDialog<bool>(
      context: ctx,
      builder: (c) => AlertDialog(
        title: const Text('Buang perubahan?'),
        content: Text('${d.jumlah} perubahan belum disimpan akan hilang.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Buang')),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _simpan(BuildContext ctx) async {
    final d = _draft;
    if (d == null || d.jumlah == 0 || _menyimpan) return;
    _ubah(() => _menyimpan = true);
    try {
      final hasil = await _repo.simpan(widget.sesi, d);
      _ubah(() => _draft = DraftPetugasYandal(hasil));
      if (ctx.mounted) tampilPesan(ctx, 'Susunan petugas tersimpan. Berlaku untuk login berikutnya.');
    } catch (e) {
      final konflik = e is ApiException && e.kode == 'KONFLIK_REVISION';
      if (ctx.mounted) tampilPesan(ctx, konflik ? 'Data petugas sudah diubah admin lain. Muat ulang dulu.' : _gagal(e));
    } finally {
      _ubah(() => _menyimpan = false);
    }
  }

  Future<void> _aksi(BuildContext ctx, PetugasYandal p) async {
    final d = _draft;
    if (d == null || !_bisaUbah || _menyimpan) return;
    final k = d.kini(p);
    final pilihan = await showModalBottomSheet<String>(
      context: ctx,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text(p.nama, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          ),
          for (final t in d.data.tim)
            if (!(k.aktif && k.timId == t.timId))
              ListTile(
                leading: const Icon(Icons.swap_horiz_rounded),
                title: Text(k.aktif ? 'Pindah ke ${t.nama}' : 'Aktifkan di ${t.nama}'),
                onTap: () => Navigator.pop(c, 'tim:${t.timId}'),
              ),
          if (k.aktif)
            ListTile(
              leading: const Icon(Icons.person_off_outlined, color: AppColors.red600),
              title: const Text('Nonaktifkan'),
              onTap: () => Navigator.pop(c, 'nonaktif'),
            ),
          if (d.berubah(p.petugasId))
            ListTile(leading: const Icon(Icons.undo_rounded), title: const Text('Batalkan perubahan'), onTap: () => Navigator.pop(c, 'batal')),
        ]),
      ),
    );
    if (pilihan == null) return;
    _ubah(() {
      if (pilihan == 'nonaktif') {
        d.nonaktifkan(p.petugasId);
      } else if (pilihan == 'batal') {
        d.batal(p.petugasId);
      } else if (pilihan.startsWith('tim:')) {
        d.pindah(p.petugasId, pilihan.substring(4));
      }
    });
  }

  Future<void> _tambah(BuildContext ctx, String timAwal) async {
    final d = _draft;
    if (d == null || d.data.tim.isEmpty) return;
    final hasil = await showDialog<({String nama, String timId})>(
      context: ctx,
      builder: (_) => _DialogTambah(tim: d.data.tim, timAwal: timAwal),
    );
    if (hasil == null || !ctx.mounted) return;
    final n = hasil.nama.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (n.length < 3) {
      tampilPesan(ctx, 'Nama minimal 3 huruf.');
      return;
    }
    if (d.namaDipakai(n)) {
      tampilPesan(ctx, KodeError.pesan('PETUGAS_GANDA'));
      return;
    }
    _ubah(() => d.tambah(n, hasil.timId));
  }

  /// Tombol simpan (format sama dengan v0.63.0), dipakai di layar daftar tim dan layar petugas.
  Widget? _barSimpan(BuildContext ctx) {
    final d = _draft;
    if (!_bisaUbah || d == null || d.jumlah == 0) return null;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: FilledButton.icon(
          onPressed: _menyimpan ? null : () => unawaited(_simpan(ctx)),
          icon: _menyimpan
              ? const SisiLoader(ukuran: 18, warna: Colors.white)
              : const Icon(Icons.save_rounded),
          label: Text(_menyimpan ? 'Menyimpan...' : 'Simpan ${d.jumlah} perubahan'),
        ),
      ),
    );
  }

  Future<void> _bukaTim(BuildContext ctx, String? timId) =>
      Navigator.push(ctx, MaterialPageRoute<void>(builder: (_) => _TimYandalScreen(induk: this, timId: timId)));

  @override
  Widget build(BuildContext context) {
    final d = _draft;
    return PopScope(
      canPop: d == null || d.jumlah == 0,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _bolehBuang(context) && context.mounted) Navigator.pop(context);
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFF6F8FC),
        appBar: sisiAppBar('Pindah Tim Petugas Yandal', actions: [
          TombolSegarkan(
            sibuk: _memuat,
            onPressed: () async {
              if (_memuat || !await _bolehBuang(context)) return;
              await _muat();
            },
          ),
        ]),
        bottomNavigationBar: _barSimpan(context),
        body: _memuat && d == null
            ? const Center(child: SisiLoader())
            : d == null
                ? Center(child: Text(_pesan ?? 'Gagal memuat.'))
                : RefreshSisi(onRefresh: _muat, child: _daftarTim(context, d)),
      ),
    );
  }

  Widget _daftarTim(BuildContext ctx, DraftPetugasYandal d) {
    final jumlah = d.jumlahPerTim();
    final nonaktif = _anggota(d, null);
    return ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 40), children: [
      if (!_bisaUbah)
        const Padding(
          padding: EdgeInsets.only(bottom: 12),
          child: Text('Akun ini hanya bisa melihat.', style: TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
        ),
      for (final t in d.data.tim)
        _KartuTim(
          nama: t.nama,
          jumlah: jumlah[t.timId] ?? 0,
          min: d.data.min,
          maks: d.data.maks,
          perubahan: _perubahanTim(d, t.timId),
          bertugas: _anggota(d, t.timId).where((p) => p.bertugas).length,
          onTap: () => unawaited(_bukaTim(ctx, t.timId)),
        ),
      if (nonaktif.isNotEmpty)
        _KartuTim(
          nama: 'Nonaktif',
          jumlah: nonaktif.length,
          perubahan: _perubahanTim(d, null),
          ikon: Icons.person_off_outlined,
          onTap: () => unawaited(_bukaTim(ctx, null)),
        ),
    ]);
  }

  /// Anggota tim setelah draft (timId null = petugas nonaktif / di luar tim YANDAL).
  List<PetugasYandal> _anggota(DraftPetugasYandal d, String? timId) {
    final tim = {for (final t in d.data.tim) t.timId};
    return [
      for (final p in d.data.petugas)
        if (timId == null ? (!d.kini(p).aktif || !tim.contains(d.kini(p).timId)) : (d.kini(p).aktif && d.kini(p).timId == timId)) p,
    ];
  }

  /// Jumlah perubahan belum disimpan yang menyentuh tim ini (keluar, masuk, nonaktif, baru).
  int _perubahanTim(DraftPetugasYandal d, String? timId) {
    var n = 0;
    for (final p in d.data.petugas) {
      if (!d.berubah(p.petugasId)) continue;
      final k = d.kini(p);
      if (timId == null ? (!k.aktif || !p.aktif) : (p.timId == timId || k.timId == timId)) n++;
    }
    if (timId != null) n += d.baru.where((b) => b.timId == timId).length;
    return n;
  }
}

/// Kartu satu tim di layar pertama.
class _KartuTim extends StatelessWidget {
  const _KartuTim({
    required this.nama,
    required this.jumlah,
    required this.onTap,
    this.min,
    this.maks,
    this.perubahan = 0,
    this.bertugas = 0,
    this.ikon = Icons.groups_2_outlined,
  });
  final String nama;
  final int jumlah;
  final int? min;
  final int? maks;
  final int perubahan;
  final int bertugas;
  final IconData ikon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final diLuar = min != null && maks != null && (jumlah < min! || jumlah > maks!);
    final ket = <String>[
      if (bertugas > 0) '$bertugas sedang bertugas',
      if (perubahan > 0) '$perubahan perubahan belum disimpan',
      if (diLuar) 'di luar $min-$maks petugas',
    ];
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      color: perubahan > 0 ? AppColors.accent100 : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: diLuar ? AppColors.amber600 : AppColors.neutral200),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        leading: CircleAvatar(backgroundColor: AppColors.navy100, child: Icon(ikon, color: AppColors.navy700)),
        title: Text(nama, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy900)),
        subtitle: Text(
          ['$jumlah petugas', ...ket].join(' · '),
          style: TextStyle(fontSize: 12.5, color: diLuar ? AppColors.amber700 : AppColors.neutral500),
        ),
        trailing: const Icon(Icons.chevron_right_rounded),
        onTap: onTap,
      ),
    );
  }
}

/// Layar petugas satu tim (timId null = nonaktif). Membaca draft milik layar induk.
class _TimYandalScreen extends StatelessWidget {
  const _TimYandalScreen({required this.induk, required this.timId});
  final _PetugasYandalScreenState induk;
  final String? timId;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: induk._versi,
      builder: (ctx, _) {
        final d = induk._draft;
        if (d == null) return const Scaffold(body: Center(child: SisiLoader()));
        final namaTim = {for (final t in d.data.tim) t.timId: t.nama};
        final judul = timId == null ? 'Petugas Nonaktif' : (namaTim[timId] ?? '-');
        final anggota = induk._anggota(d, timId);
        final baru = [for (final b in d.baru) if (b.timId == timId) b];
        final jumlah = timId == null ? anggota.length : (d.jumlahPerTim()[timId] ?? 0);
        final diLuar = timId != null && (jumlah < d.data.min || jumlah > d.data.maks);
        return Scaffold(
          backgroundColor: const Color(0xFFF6F8FC),
          appBar: sisiAppBar(judul, subjudul: '$jumlah petugas'),
          floatingActionButton: induk._bisaUbah && timId != null
              ? FloatingActionButton.extended(
                  onPressed: () => unawaited(induk._tambah(ctx, timId!)),
                  icon: const Icon(Icons.person_add_alt_1),
                  label: const Text('Petugas'),
                )
              : null,
          bottomNavigationBar: induk._barSimpan(ctx),
          body: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 120), children: [
            if (diLuar)
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(12)),
                child: Text('Perhatian: $judul berisi $jumlah petugas (di luar ${d.data.min}-${d.data.maks}).',
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.accent700)),
              ),
            if (induk._bisaUbah)
              const Padding(
                padding: EdgeInsets.only(bottom: 10),
                child: Text('Ketuk petugas untuk memindah atau menonaktifkan.',
                    style: TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
              ),
            if (anggota.isEmpty && baru.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 24),
                child: Center(child: Text('Belum ada petugas.', style: TextStyle(color: AppColors.neutral500))),
              ),
            for (final p in anggota) _baris(ctx, d, p, namaTim),
            for (final b in baru)
              Card(
                elevation: 0,
                color: AppColors.success100,
                child: ListTile(
                  leading: const Icon(Icons.fiber_new_rounded, color: AppColors.success700),
                  title: Text(b.nama, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: const Text('Petugas baru (belum disimpan)'),
                  trailing: induk._bisaUbah
                      ? IconButton(icon: const Icon(Icons.close), onPressed: () => induk._ubah(() => d.baru.remove(b)))
                      : null,
                ),
              ),
          ]),
        );
      },
    );
  }

  Widget _baris(BuildContext ctx, DraftPetugasYandal d, PetugasYandal p, Map<String, String> namaTim) {
    final berubah = d.berubah(p.petugasId);
    final k = d.kini(p);
    final ket = <String>[
      if (berubah && p.aktif && k.aktif && p.timId != k.timId) 'dari ${namaTim[p.timId] ?? '-'}',
      if (berubah && !k.aktif) 'akan dinonaktifkan',
      if (berubah && !p.aktif && k.aktif) 'akan diaktifkan',
      if (timId == null && !berubah && p.aktif && !namaTim.containsKey(p.timId)) 'tim bukan Yandal',
      if (p.bertugas) 'sedang bertugas',
    ];
    return Card(
      elevation: 0,
      color: berubah ? AppColors.accent100 : Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: AppColors.neutral200)),
      child: ListTile(
        title: Text(p.nama, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: ket.isEmpty ? null : Text(ket.join(' · ')),
        trailing: induk._bisaUbah ? const Icon(Icons.chevron_right_rounded) : null,
        onTap: induk._bisaUbah && !induk._menyimpan ? () => unawaited(induk._aksi(ctx, p)) : null,
      ),
    );
  }
}

/// Dialog tambah petugas (controller milik dialog, dibuang saat dialog benar-benar selesai).
class _DialogTambah extends StatefulWidget {
  const _DialogTambah({required this.tim, required this.timAwal});
  final List<TimYandal> tim;
  final String timAwal;

  @override
  State<_DialogTambah> createState() => _DialogTambahState();
}

class _DialogTambahState extends State<_DialogTambah> {
  final _nama = TextEditingController();
  late String _timId = widget.tim.any((t) => t.timId == widget.timAwal) ? widget.timAwal : widget.tim.first.timId;

  @override
  void dispose() {
    _nama.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Tambah petugas'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: _nama, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Nama petugas')),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _timId,
            decoration: const InputDecoration(labelText: 'Tim'),
            items: [for (final t in widget.tim) DropdownMenuItem(value: t.timId, child: Text(t.nama))],
            onChanged: (v) => setState(() => _timId = v ?? _timId),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(context, (nama: _nama.text, timId: _timId)), child: const Text('Tambah')),
        ],
      );
}
