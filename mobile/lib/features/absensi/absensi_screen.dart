import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/refresh_sisi.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/sisi_motif.dart';
import '../../widgets/sisi_widgets.dart';
import '../../widgets/wa_panel.dart';
import 'absensi_antre.dart';
import 'absensi_model.dart';
import 'absensi_teks.dart';

part 'absensi_kartu.dart';

/// v1.0.51 Operasi > Absensi Safety Briefing (ADMIN_ES + ADMIN).
/// Layar 1 = kartu per tim (gaya kartu laporan tim: gradien Jaringan SiSi), ketuk kartu = daftar petugas tim itu.
/// Petugas dipilih satu per satu (tanpa nilai awal), rekan mengisi bagian lain dari HP-nya. Simpan = layar langsung
/// tertutup, isian masuk antrean HP dan dikirim di latar ([AntreanAbsensi]). Petugas yang sudah diisi pengabsen lain
/// terkunci (server juga menolak). Kirim WA memakai teks yang dibuat server. Memuat layar dan Kirim WA butuh sinyal.
class AbsensiScreen extends StatelessWidget {
  const AbsensiScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  @override
  Widget build(BuildContext context) => AbsensiPanel(
        muat: () => deps.absensiRepo.muat(sesi),
        antrean: () => deps.absensi.daftar(sesi.userId),
        simpan: (tanggal, isian) async {
          await deps.absensi.simpan(sesi, tanggal, isian);
          await deps.syncCtl.hitungUlang(); // layanan latar menyala selama ada yang belum terkirim
          unawaited(deps.syncCtl.sinkron());
        },
        buang: (tanggal, petugasId) => deps.absensi.buang(sesi, tanggal, petugasId),
        salin: (teks) => Clipboard.setData(ClipboardData(text: teks)),
        kirimWa: (c, teks) => kirimWaLangsung(c, teks),
        sekarang: deps.jam.sekarang, // jam server (bukan jam HP) supaya HP dengan tanggal salah tidak memblokir simpan
      );
}

/// Warna per status (teks, latar) untuk chip, avatar, dan kartu pilihan.
(Color, Color) _warnaStatus(StatusAbsensi s) => switch (s) {
      StatusAbsensi.hadir => (AppColors.success700, AppColors.success100),
      StatusAbsensi.telat => (AppColors.accent700, AppColors.accent100),
      StatusAbsensi.tanpaKet => (AppColors.red700, AppColors.red100),
      StatusAbsensi.absen => (AppColors.red700, AppColors.red100),
      StatusAbsensi.ket => (AppColors.brand700, AppColors.brand100),
      StatusAbsensi.tmk => (AppColors.neutral700, AppColors.neutral150),
      StatusAbsensi.cuti => (AppColors.brand600, AppColors.brand50),
      StatusAbsensi.izin => (AppColors.accent700, AppColors.neutral100),
    };

/// Isi layar, dipisah dari [Deps] supaya bisa diuji dengan fungsi palsu.
class AbsensiPanel extends StatefulWidget {
  const AbsensiPanel({
    super.key,
    required this.muat,
    required this.antrean,
    required this.simpan,
    required this.buang,
    required this.salin,
    required this.kirimWa,
    required this.sekarang,
  });
  final Future<DataAbsensi> Function() muat;
  final Future<List<ItemAntreAbsensi>> Function() antrean;
  final Future<void> Function(String tanggal, Map<String, IsianAbsensi> isian) simpan;
  final Future<void> Function(String tanggal, String petugasId) buang;
  final Future<void> Function(String teks) salin;
  final Future<void> Function(BuildContext context, String teks) kirimWa;
  final DateTime Function() sekarang;

  @override
  State<AbsensiPanel> createState() => _AbsensiPanelState();
}

class _AbsensiPanelState extends State<AbsensiPanel> {
  DataAbsensi? _data;
  List<ItemAntreAbsensi> _antre = const [];
  final Map<String, IsianAbsensi> _draft = {};
  final _versi = ValueNotifier<int>(0); // layar petugas tim ikut digambar ulang
  bool _memuat = true;
  bool _menyimpan = false;
  String? _pesan;
  Timer? _pantau;
  bool _cekJalan = false;

  static const _jedaPantau = Duration(seconds: 2);

  @override
  void initState() {
    super.initState();
    unawaited(_muat());
  }

  @override
  void dispose() {
    _pantau?.cancel();
    _versi.dispose();
    super.dispose();
  }

  /// Ada isian di antrean HP yang belum diterima server (bergalat = sudah diputuskan server, bukan tertunda).
  bool get _adaTertunda => _antre.any((x) => x.tanggal == _data?.tanggal && x.galat.isEmpty);

  /// WhatsApp (kirim + salin) hanya aktif bila data sudah dimuat, tidak ada pilihan belum disimpan, dan semua isian sudah sinkron.
  bool get _sinkron => _data != null && !_memuat && !_menyimpan && _draft.isEmpty && !_adaTertunda;

  /// Petunjuk di kartu utama saat WhatsApp mati.
  String? get _infoWa {
    if (_data == null) return null;
    if (_menyimpan || _adaTertunda) return 'Menyinkronkan data ke server… WhatsApp aktif setelah selesai.';
    if (_draft.isNotEmpty) return 'Simpan dulu untuk mengaktifkan WhatsApp.';
    return null;
  }

  /// Pantau antrean selama ada yang tertunda; begitu kosong, muat ulang data server (rekap + jam simpan terbaru) lalu WA aktif.
  void _aturPantau() {
    if (!mounted) return;
    if (_adaTertunda) {
      _pantau ??= Timer.periodic(_jedaPantau, (_) => unawaited(_cekSinkron()));
    } else {
      _pantau?.cancel();
      _pantau = null;
    }
  }

  Future<void> _cekSinkron() async {
    if (_cekJalan || !mounted) return;
    _cekJalan = true;
    try {
      final antre = await widget.antrean();
      if (!mounted) return;
      final sama = antre.length == _antre.length &&
          [for (var i = 0; i < antre.length; i++) antre[i].sama(_antre[i]) && antre[i].galat == _antre[i].galat].every((x) => x);
      if (sama) return; // tidak berubah: tidak perlu menggambar ulang
      _ubah(() => _antre = antre);
      if (!_adaTertunda) {
        _aturPantau();
        await _muat(); // server sudah menerima: ambil data + rekap terbaru sebelum WA dibuka
      }
    } catch (_) {
      // sinyal putus: dicoba lagi pada denyut berikutnya
    } finally {
      _cekJalan = false;
    }
  }

  void _ubah(VoidCallback fn) {
    if (!mounted) return;
    setState(fn);
    _versi.value++;
  }

  String _gagal(Object e) => e is ApiException && !e.kode.startsWith('HTTP_') ? KodeError.pesan(e.kode) : 'Tidak ada sinyal. Coba lagi.';

  Future<DataAbsensi?> _muat({bool buangDraft = false}) async {
    _ubah(() => _memuat = true);
    DataAbsensi? data;
    String? pesan;
    var antre = _antre;
    try {
      data = await widget.muat();
      antre = await widget.antrean();
    } catch (e) {
      pesan = _gagal(e);
    }
    if (!mounted) return data;
    _ubah(() {
      if (data != null) {
        _data = data;
        _antre = antre;
        if (buangDraft) _draft.clear();
      }
      _pesan = pesan;
      _memuat = false;
    });
    _aturPantau();
    return data;
  }

  ItemAntreAbsensi? _itemAntre(StafAbsensi s) {
    final t = _data?.tanggal;
    for (final x in _antre) {
      if (x.tanggal == t && x.petugasId == s.petugasId) return x;
    }
    return null;
  }

  /// Status yang berlaku untuk hitungan: pilihan sesi ini > antrean HP (tanpa galat) > isian di server.
  StatusAbsensi? _efektif(StafAbsensi s) {
    final d = _draft[s.petugasId];
    if (d != null) return d.status;
    final a = _itemAntre(s);
    if (a != null && a.galat.isEmpty) return a.status;
    return s.status;
  }

  ({int hadir, int tidak, int belum}) _hitung(List<StafAbsensi> l) {
    var hadir = 0, tidak = 0, belum = 0;
    for (final s in l) {
      final st = _efektif(s);
      if (st == null) {
        belum++;
      } else if (st == StatusAbsensi.hadir || st == StatusAbsensi.telat) {
        hadir++;
      } else {
        tidak++;
      }
    }
    return (hadir: hadir, tidak: tidak, belum: belum);
  }

  int _jumlahBergalat(List<StafAbsensi> l) {
    var n = 0;
    for (final s in l) {
      final a = _itemAntre(s);
      if (a != null && a.galat.isNotEmpty && _draft[s.petugasId] == null) n++;
    }
    return n;
  }

  Future<void> _pilih(StafAbsensi s, {required BuildContext ctx}) async {
    if (_menyimpan) return;
    final a = _itemAntre(s);
    if (s.terkunci && _draft[s.petugasId] == null && (a == null || a.galat.isNotEmpty)) {
      tampilPesan(ctx, '${s.nama} sudah diabsen pengabsen lain, tidak bisa diubah.');
      return;
    }
    final awal = _draft[s.petugasId] ?? (a != null && a.galat.isEmpty ? a.isian : (s.status == null ? null : IsianAbsensi(s.status!, s.keterangan)));
    final hasil = await showModalBottomSheet<_HasilPilih>(
      context: ctx,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (c) => _SheetStatus(nama: s.nama, awal: awal, bisaBatal: _draft.containsKey(s.petugasId)),
    );
    if (hasil == null || !mounted) return;
    _ubah(() {
      if (hasil.batal) {
        _draft.remove(s.petugasId);
      } else if (hasil.isian != null) {
        _draft[s.petugasId] = hasil.isian!;
      }
    });
  }

  /// [tutup] = layar petugas tim yang ikut ditutup sesudah tersimpan.
  Future<void> _simpan({BuildContext? tutup}) async {
    final d = _data;
    if (d == null || _draft.isEmpty || _menyimpan) return;
    // Layar dibuka kemarin dan baru disimpan hari ini: server menolak hari lampau, jadi muat ulang tanpa menyimpan.
    if (d.tanggal != Wib.tanggal(widget.sekarang())) {
      tampilPesan(tutup ?? context, 'Tanggal sudah berganti. Layar dimuat ulang, pilihan sebelumnya tidak disimpan.');
      await _muat(buangDraft: true);
      return;
    }
    _ubah(() => _menyimpan = true);
    var berhasil = false;
    try {
      await widget.simpan(d.tanggal, Map.of(_draft));
      berhasil = true;
      _ubah(_draft.clear);
    } catch (_) {
      if (mounted) tampilPesan(tutup ?? context, 'Gagal menyimpan di HP. Coba lagi.');
    } finally {
      if (mounted) _ubah(() => _menyimpan = false);
    }
    if (!berhasil || !mounted) return;
    // isian sudah masuk antrean HP: segarkan supaya WA mati dan pemantauan sinkron berjalan
    try {
      final antre = await widget.antrean();
      if (mounted) _ubah(() => _antre = antre);
    } catch (_) {
      // antrean tetap tampil dari muat terakhir
    }
    _aturPantau();
    if (!mounted) return;
    // kembali ke halaman absensi (kartu per tim), bukan ke menu utama
    if (tutup != null && tutup.mounted) Navigator.of(tutup).pop();
    if (mounted) unawaited(tampilPopupBerhasil(context, judul: 'Data berhasil disimpan', keterangan: 'Dikirim otomatis ke server'));
  }

  String _jamSekarang() {
    final w = Wib.dinding(widget.sekarang());
    String dua(int n) => n.toString().padLeft(2, '0');
    return '${dua(w.hour)}.${dua(w.minute)}';
  }

  /// Teks WhatsApp dibuat LOKAL dari apa yang tampil di layar: isian server + antrean HP + pilihan sesi ini.
  /// Tanpa panggilan server, jadi WhatsApp langsung terbuka. null = data belum dimuat.
  String? _teksLokal() {
    final d = _data;
    if (d == null) return null;
    final adaLokal = _draft.isNotEmpty || _antre.any((x) => x.tanggal == d.tanggal && x.galat.isEmpty);
    final isian = <IsianStaf>[];
    for (final s in d.staf) {
      final p = _draft[s.petugasId];
      final a = _itemAntre(s);
      if (p != null) {
        isian.add(IsianStaf(s, p.status, p.keterangan));
      } else if (a != null && a.galat.isEmpty) {
        isian.add(IsianStaf(s, a.status, a.keterangan));
      } else {
        isian.add(IsianStaf(s, s.status, s.keterangan));
      }
    }
    return teksWaAbsensi(
      tanggal: d.tanggal,
      // waktu simpan terakhir: ada perubahan lokal = sekarang, selain itu waktu simpan terakhir dari server
      jamSimpan: adaLokal || d.jamSimpan.isEmpty ? _jamSekarang() : d.jamSimpan,
      tim: d.tim,
      isian: isian,
      rekapServer: d.rekap,
    );
  }

  Future<void> _salin() async {
    final teks = _teksLokal();
    if (teks == null) return;
    await widget.salin(teks);
    if (mounted) tampilPesan(context, 'Teks WhatsApp disalin.');
  }

  /// Kirim WA: teks dibuat lokal dan langsung diserahkan ke WhatsApp (tidak menunggu server).
  Future<void> _kirimWa() async {
    final teks = _teksLokal();
    if (teks == null) {
      tampilPesan(context, _pesan ?? 'Data absensi belum dimuat. Tarik layar untuk memuat ulang.');
      return;
    }
    await widget.kirimWa(context, teks);
  }

  Future<bool> _bolehKeluar() async {
    if (_draft.isEmpty) return true;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Buang pilihan?'),
        content: Text('${_draft.length} pilihan belum disimpan akan hilang.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Kembali')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Buang')),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _buang(ItemAntreAbsensi a) async {
    await widget.buang(a.tanggal, a.petugasId);
    final antre = await widget.antrean();
    _ubah(() => _antre = antre);
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    return PopScope(
      canPop: _draft.isEmpty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _bolehKeluar() && context.mounted) Navigator.pop(context);
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFF6F8FC),
        appBar: sisiAppBar('Absensi Safety Briefing', subjudul: d == null ? null : tglIndoAbsensi(d.tanggal), actions: [
          IconButton(tooltip: 'Salin teks WhatsApp', icon: const Icon(Icons.copy_rounded), onPressed: _sinkron ? _salin : null),
          TombolSegarkan(
            sibuk: _memuat,
            onPressed: () async {
              if (_memuat || !await _bolehKeluar()) return;
              await _muat(buangDraft: true);
            },
          ),
        ]),
        bottomNavigationBar: _barSimpan(context),
        body: _memuat && d == null
            ? const Center(child: SisiLoader())
            : d == null
                ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_pesan ?? 'Gagal memuat.', textAlign: TextAlign.center)))
                : RefreshSisi(onRefresh: () async => _muat(), child: _daftarTim(d)),
      ),
    );
  }

  Widget _barSimpan(BuildContext ctx, {BuildContext? tutup}) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
            onPressed: _draft.isEmpty || _menyimpan || _data == null ? null : () => unawaited(_simpan(tutup: tutup)),
            child: Text(_draft.isEmpty ? 'Pilih status petugas dulu' : 'Simpan (${_draft.length})'),
          ),
        ),
      );

  Widget _daftarTim(DataAbsensi d) {
    final h = _hitung(d.staf);
    final total = d.staf.length;
    final sudah = total - h.belum;
    return ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 14, 16, 24), children: [
      _hero(d, sudah: sudah, total: total, h: h),
      const SizedBox(height: 14),
      const Padding(
        padding: EdgeInsets.fromLTRB(4, 0, 4, 10),
        child: Text('Ketuk tim untuk memilih status petugasnya. Petugas yang kosong boleh dilewati.',
            style: TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
      ),
      for (final t in d.tim) ...[
        _KartuTimAbsensi(
          nama: t.nama,
          total: d.stafDi(t.timId).length,
          hitung: _hitung(d.stafDi(t.timId)),
          bergalat: _jumlahBergalat(d.stafDi(t.timId)),
          onTap: () => unawaited(Navigator.push(
              context, MaterialPageRoute<void>(builder: (_) => _TimAbsensiScreen(induk: this, timId: t.timId)))),
        ),
        const SizedBox(height: 12),
      ],
    ]);
  }

  Widget _hero(DataAbsensi d, {required int sudah, required int total, required ({int hadir, int tidak, int belum}) h}) {
    final bentuk = BorderRadius.circular(22);
    return Container(
      decoration: BoxDecoration(
        gradient: SisiMotif.gradien,
        borderRadius: bentuk,
        boxShadow: [BoxShadow(color: AppColors.navy900.withValues(alpha: .28), blurRadius: 18, offset: const Offset(0, 8))],
      ),
      child: Stack(children: [
        Positioned.fill(
          child: IgnorePointer(child: ClipRRect(borderRadius: bentuk, child: const CustomPaint(painter: PolaJaringanPainter(alpha: .08)))),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 12, 14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              const _KotakIkon(Icons.fact_check_outlined),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Safety Briefing', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white)),
                  const SizedBox(height: 2),
                  Text(tglIndoAbsensi(d.tanggal), style: const TextStyle(fontSize: 12, color: Colors.white70)),
                ]),
              ),
              TombolWaBulat(
                onTap: _sinkron ? _kirimWa : null,
                siap: _sinkron,
                tooltipMati: _infoWa ?? 'WhatsApp aktif setelah data sinkron',
              ),
            ]),
            const SizedBox(height: 14),
            Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('$sudah', style: const TextStyle(fontSize: 30, height: 1, fontWeight: FontWeight.w900, color: AppColors.accent400)),
              const SizedBox(width: 6),
              Expanded(child: Text('dari $total petugas sudah diabsen', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: Colors.white70))),
            ]),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.only(right: 4),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: LinearProgressIndicator(
                  value: total == 0 ? 0 : sudah / total,
                  minHeight: 6,
                  backgroundColor: Colors.white24,
                  valueColor: const AlwaysStoppedAnimation(AppColors.accent400),
                ),
              ),
            ),
            const SizedBox(height: 12),
            _PanelAngka(hadir: h.hadir, tidak: h.tidak, belum: h.belum),
            if (_infoWa != null) ...[
              const SizedBox(height: 10),
              Padding(
                padding: const EdgeInsets.only(right: 4),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 1),
                    child: Icon(_menyimpan || _adaTertunda ? Icons.sync_rounded : Icons.info_outline_rounded, size: 15, color: AppColors.accent400),
                  ),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_infoWa!, style: const TextStyle(fontSize: 12.5, height: 1.35, color: Color(0xD9FFFFFF)))),
                ]),
              ),
            ],
          ]),
        ),
      ]),
    );
  }
}
