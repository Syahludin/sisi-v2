import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/foto_slot.dart';
import '../../widgets/kolom_pilih.dart';
import '../../widgets/sisi_widgets.dart';
import '../gardu/gardu_model.dart';
import '../gardu/gardu_widgets.dart';
import 'approval_p0_repository.dart';
import 'p0_form_screen.dart' show daftarPekerjaanP0;
import 'p0_model.dart';
import 'switching_panel.dart' show PilihIndikator;
import '../../widgets/sisi_loader.dart';

/// v0.75.0 (permintaan kvlar 10 Okt 2026): menu Approval P0 (ADMIN / SUPER). Alur sama dengan Verifikasi P0 v1:
/// pilih tanggal > tab Menunggu / Disetujui / Ditolak (jumlah) > cari > kartu P0 dengan 3 foto (Sebelum / Pekerjaan /
/// Sesudah) di kartu utama sebagai acuan awal > Setujui / Tolak (alasan) / Edit jenis pekerjaan (petugas salah input).
/// Diperbarui untuk v2: keputusan langsung ke server (point + rekap shift dihitung saat itu), lampiran Pengecekan
/// Switching / Gardu (angka + foto) ikut di detail kartu, foto Drive privat dibaca lewat server.
class ApprovalP0Screen extends StatefulWidget {
  const ApprovalP0Screen({super.key, required this.deps, required this.sesi, this.tanggalAwal, this.p0Id});

  /// v1.0.20: dibuka dari lonceng = langsung ke tanggal + P0 itu (terbuka, paling atas).
  final String? tanggalAwal, p0Id;
  final Deps deps;
  final Sesi sesi;

  @override
  State<ApprovalP0Screen> createState() => _ApprovalP0ScreenState();
}

class _ApprovalP0ScreenState extends State<ApprovalP0Screen> {
  late final ApprovalP0Repository _repo = ApprovalP0Repository(widget.deps.api);
  late DateTime _tgl = () {
    final t = DateTime.tryParse(widget.tanggalAwal ?? '');
    return t == null ? _hariIni() : DateTime.utc(t.year, t.month, t.day);
  }();

  DateTime _hariIni() {
    final w = Wib.dinding(widget.deps.jam.sekarang());
    return DateTime.utc(w.year, w.month, w.day);
  }
  String _status = 'Menunggu';
  String _cari = '';
  bool _muat = false;
  String _error = '';
  Map<String, int> _jumlah = const {};
  List<ItemApprovalP0> _list = const [];
  final Set<String> _buka = {};
  final Set<String> _sibuk = {};
  int _minta = 0;

  String get _tanggal {
    String d(int n) => n.toString().padLeft(2, '0');
    return '${_tgl.year}-${d(_tgl.month)}-${d(_tgl.day)}';
  }

  bool get _bolehUbah => ApprovalP0Repository.bolehUbah(widget.sesi);

  @override
  void initState() {
    super.initState();
    if ((widget.p0Id ?? '').isNotEmpty) _buka.add(widget.p0Id!);
    unawaited(_ambil());
  }

  Future<void> _ambil() async {
    final id = ++_minta;
    setState(() {
      _muat = true;
      _error = '';
    });
    try {
      final r = await _repo.daftar(widget.sesi, _tanggal, status: _status);
      if (!mounted || id != _minta) return;
      setState(() {
        _jumlah = r.jumlah;
        // v1.0.20: P0 dari lonceng di paling atas
        final tuju = widget.p0Id ?? '';
        _list = [...r.list.where((x) => x.p0Id == tuju), ...r.list.where((x) => x.p0Id != tuju)];
      });
    } on ApiException catch (e) {
      if (mounted && id == _minta) setState(() => _error = KodeError.pesan(e.kode));
    } catch (_) {
      if (mounted && id == _minta) setState(() => _error = 'Daftar P0 gagal dimuat. Periksa sinyal lalu coba lagi.');
    } finally {
      if (mounted && id == _minta) setState(() => _muat = false);
    }
  }

  Future<void> _pilihTanggal() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _tgl,
      firstDate: DateTime(2025),
      lastDate: _hariIni(),
    );
    if (d == null || !mounted) return;
    setState(() => _tgl = DateTime.utc(d.year, d.month, d.day));
    await _ambil();
  }

  Future<void> _geserHari(int n) async {
    final baru = _tgl.add(Duration(days: n));
    if (baru.isAfter(_hariIni())) return;
    setState(() => _tgl = baru);
    await _ambil();
  }

  Future<void> _jalankan(ItemApprovalP0 x, Future<ItemApprovalP0> Function() aksi, String pesan) async {
    if (_sibuk.contains(x.p0Id)) return;
    setState(() => _sibuk.add(x.p0Id));
    try {
      await aksi();
      if (!mounted) return;
      tampilPesan(context, pesan);
      await _ambil();
    } on ApiException catch (e) {
      if (mounted) tampilPesan(context, KodeError.pesan(e.kode));
      if (e.kode == 'DATA_BERUBAH') await _ambil();
    } catch (_) {
      if (mounted) tampilPesan(context, 'Gagal menyimpan. Periksa sinyal lalu coba lagi.');
    } finally {
      if (mounted) setState(() => _sibuk.remove(x.p0Id));
    }
  }

  // ---------------- aksi ----------------

  Future<void> _setujui(ItemApprovalP0 x) async {
    final bobotC = TextEditingController(text: x.lainLain && x.bobot != null ? angkaId(x.bobot) : '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 24),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        clipBehavior: Clip.antiAlias,
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(
              padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
              decoration: const BoxDecoration(
                gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [AppColors.success700, AppColors.success600]),
              ),
              child: Column(children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: .18), shape: BoxShape.circle),
                  child: const Icon(Icons.verified_rounded, color: Colors.white, size: 32),
                ),
                const SizedBox(height: 10),
                const Text('Setujui P0 ini?', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: Colors.white)),
                const SizedBox(height: 2),
                Text(x.kodeP0, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, color: Colors.white70)),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 4),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text(x.namaTampil, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.navy900)),
                if (x.lokasi.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(x.lokasi, style: const TextStyle(fontSize: 12, color: AppColors.neutral700)),
                  ),
                const SizedBox(height: 10),
                Wrap(spacing: 6, runSpacing: 6, children: [
                  _Pil(Icons.groups_rounded, '${x.tim} · Shift ${x.shift}'),
                  if (x.durasi != null) _Pil(Icons.timer_outlined, teksMenit(x.durasi)),
                  if (x.waktuSebelum.isNotEmpty) _Pil(Icons.schedule_rounded, '${_jam(x.waktuSebelum)} - ${_jam(x.waktuSesudah)}'),
                ]),
                if (x.lainLain) ...[
                  const SizedBox(height: 14),
                  TextField(
                    controller: bobotC,
                    autofocus: true,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                    decoration: sisiInput('Bobot pekerjaan (0 - 100)', helper: 'Lain - Lain: bobot diisi admin'),
                  ),
                ],
              ]),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 12, 18, 18),
              child: Row(children: [
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
                    onPressed: () => Navigator.pop(c, false),
                    child: const Text('Batal'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: AppColors.success700, minimumSize: const Size.fromHeight(46)),
                    onPressed: () => Navigator.pop(c, true),
                    icon: const Icon(Icons.check_rounded),
                    label: const Text('Setujui'),
                  ),
                ),
              ]),
            ),
          ]),
        ),
      ),
    );
    final teksBobot = bobotC.text.trim().replaceAll(',', '.');
    bobotC.dispose();
    if (ok != true || !mounted) return;
    double? bobot;
    if (x.lainLain) {
      bobot = double.tryParse(teksBobot);
      if (bobot == null || bobot < 0 || bobot > 100) {
        tampilPesan(context, 'Isi bobot 0 - 100 untuk pekerjaan Lain - Lain.');
        return;
      }
    }
    await _jalankan(x, () => _repo.putuskan(widget.sesi, x, 'Approved', bobot: bobot), '${x.kodeP0} disetujui.');
  }

  Future<void> _tolak(ItemApprovalP0 x) async {
    final alasan = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (_) => _SheetAlasan(kode: x.kodeP0),
    );
    if (alasan == null || alasan.trim().isEmpty || !mounted) return;
    await _jalankan(x, () => _repo.putuskan(widget.sesi, x, 'Rejected', alasan: alasan), '${x.kodeP0} ditolak.');
  }

  Future<void> _ubahJenis(ItemApprovalP0 x) async {
    final master = await widget.deps.master.jenisPekerjaan();
    if (!mounted) return;
    final daftar = daftarPekerjaanP0(master);
    final bobotMaster = <String, double?>{
      for (final j in master)
        if ('${j['modul']}'.toUpperCase() == 'YANDAL') '${j['nama']}'.trim(): (j['bobot'] as num?)?.toDouble(),
    };
    final hasil = await showModalBottomSheet<_KoreksiJenis>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (_) => _SheetUbahJenis(item: x, daftar: daftar, bobotMaster: bobotMaster),
    );
    if (hasil == null || !mounted) return;
    await _jalankan(
        x,
        () => _repo.ubahJenis(widget.sesi, x, hasil.nama, lainnya: hasil.lainnya, alasan: hasil.alasan, bobot: hasil.bobot),
        'Jenis pekerjaan ${x.kodeP0} diubah ke ${hasil.nama}.');
  }

  // ---------------- tampilan ----------------

  Widget _tabStatus() {
    Widget tab(String s) {
      final dipilih = s == _status;
      final w = _warnaStatus(s);
      return Expanded(
        child: Material(
          color: dipilih ? w.latar : Colors.white,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: _muat || dipilih
                ? null
                : () {
                    setState(() => _status = s);
                    unawaited(_ambil());
                  },
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: dipilih ? w.warna : AppColors.neutral200, width: dipilih ? 1.6 : 1),
              ),
              child: Column(children: [
                Text('${_jumlah[s] ?? 0}', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: dipilih ? w.warna : AppColors.navy900)),
                Text(labelStatusApproval[s]!,
                    style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: dipilih ? w.warna : AppColors.neutral500)),
              ]),
            ),
          ),
        ),
      );
    }

    return Row(children: [tab('Menunggu'), const SizedBox(width: 8), tab('Approved'), const SizedBox(width: 8), tab('Rejected')]);
  }

  Widget _barTanggal() {
    final terakhir = !_tgl.isBefore(_hariIni());
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.neutral200)),
      child: Row(children: [
        IconButton(onPressed: _muat ? null : () => unawaited(_geserHari(-1)), icon: const Icon(Icons.chevron_left_rounded)),
        Expanded(
          child: InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: _muat ? null : () => unawaited(_pilihTanggal()),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                const Icon(Icons.calendar_today_rounded, size: 16, color: AppColors.brand700),
                const SizedBox(width: 8),
                Text('${hariDariTanggal(_tanggal)}, ${tanggalPendek(_tanggal)}',
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy900)),
              ]),
            ),
          ),
        ),
        IconButton(onPressed: _muat || terakhir ? null : () => unawaited(_geserHari(1)), icon: const Icon(Icons.chevron_right_rounded)),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final tampil = _list.where((x) => x.cocok(_cari)).toList();
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar('Approval P0', subjudul: 'Verifikasi pekerjaan P0 Yandal', actions: [
        IconButton(onPressed: _muat ? null : () => unawaited(_ambil()), icon: const Icon(Icons.refresh_rounded), tooltip: 'Muat ulang'),
      ]),
      body: RefreshIndicator(
        onRefresh: _ambil,
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 14, 16, 32), children: [
          _barTanggal(),
          const SizedBox(height: 10),
          _tabStatus(),
          const SizedBox(height: 10),
          TextField(
            onChanged: (v) => setState(() => _cari = v),
            decoration: sisiInput('Cari kode, pekerjaan, penyulang, tim', suffix: const Icon(Icons.search_rounded)),
          ),
          const SizedBox(height: 12),
          if (_muat && _list.isEmpty)
            const Padding(padding: EdgeInsets.all(40), child: Center(child: SisiLoader()))
          else if (_error.isNotEmpty)
            SisiKosong(ikon: Icons.cloud_off_rounded, judul: 'Gagal memuat', pesan: _error)
          else if (tampil.isEmpty)
            SisiKosong(
              ikon: Icons.fact_check_outlined,
              judul: 'Tidak ada P0',
              pesan: _status == 'Menunggu'
                  ? 'Tidak ada P0 yang menunggu persetujuan di tanggal ini.'
                  : 'Tidak ada P0 ${labelStatusApproval[_status]!.toLowerCase()} di tanggal ini.',
            )
          else ...[
            for (final x in tampil)
              _KartuApproval(
                key: ValueKey('ap-${x.p0Id}-${x.revision}'),
                item: x,
                repo: _repo,
                sesi: widget.sesi,
                terbuka: _buka.contains(x.p0Id),
                sibuk: _sibuk.contains(x.p0Id),
                bolehUbah: _bolehUbah,
                onBuka: () => setState(() => _buka.contains(x.p0Id) ? _buka.remove(x.p0Id) : _buka.add(x.p0Id)),
                onSetujui: () => unawaited(_setujui(x)),
                onTolak: () => unawaited(_tolak(x)),
                onUbahJenis: () => unawaited(_ubahJenis(x)),
              ),
          ],
        ]),
      ),
    );
  }
}

({Color warna, Color latar}) _warnaStatus(String s) => switch (s) {
      'Approved' => (warna: AppColors.success700, latar: AppColors.success100),
      'Rejected' => (warna: AppColors.red700, latar: AppColors.red100),
      _ => (warna: AppColors.accent700, latar: AppColors.accent100),
    };

const _hari = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

/// 'yyyy-MM-dd' -> nama hari.
String hariDariTanggal(String iso) {
  final d = DateTime.tryParse(iso);
  return d == null ? '' : _hari[d.weekday - 1];
}

/// 'yyyy-MM-dd HH:mm:ss' -> 'HH:mm'.
String _jam(String v) => v.length >= 16 ? v.substring(11, 16) : v;

class _KartuApproval extends StatelessWidget {
  const _KartuApproval({
    super.key,
    required this.item,
    required this.repo,
    required this.sesi,
    required this.terbuka,
    required this.sibuk,
    required this.bolehUbah,
    required this.onBuka,
    required this.onSetujui,
    required this.onTolak,
    required this.onUbahJenis,
  });
  final ItemApprovalP0 item;
  final ApprovalP0Repository repo;
  final Sesi sesi;
  final bool terbuka;
  final bool sibuk;
  final bool bolehUbah;
  final VoidCallback onBuka;
  final VoidCallback onSetujui;
  final VoidCallback onTolak;
  final VoidCallback onUbahJenis;

  @override
  Widget build(BuildContext context) {
    final x = item;
    final w = _warnaStatus(x.status);
    final durasi = x.durasi == null ? '-' : teksMenit(x.durasi);
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.neutral200),
        boxShadow: [BoxShadow(color: AppColors.navy900.withValues(alpha: .04), blurRadius: 10, offset: const Offset(0, 3))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        // kepala: kode + status
        Container(
          padding: const EdgeInsets.fromLTRB(14, 10, 12, 10),
          color: w.latar.withValues(alpha: .6),
          child: Row(children: [
            Expanded(
              child: Text(x.kodeP0, maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.brand700)),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(99), border: Border.all(color: w.warna.withValues(alpha: .4))),
              child: Text(x.sistem ? 'Ditolak sistem' : labelStatusApproval[x.status] ?? x.status,
                  style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: w.warna)),
            ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(x.namaTampil, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.navy900)),
            if (x.lokasi.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(x.lokasi, style: const TextStyle(fontSize: 12, color: AppColors.neutral700)),
              ),
            const SizedBox(height: 8),
            Wrap(spacing: 6, runSpacing: 6, children: [
              _Pil(Icons.groups_rounded, '${x.tim} · Shift ${x.shift}'),
              _Pil(Icons.timer_outlined, durasi),
              if (x.waktuSebelum.isNotEmpty) _Pil(Icons.schedule_rounded, '${_jam(x.waktuSebelum)} - ${_jam(x.waktuSesudah)}'),
              if (x.point != null && x.status == 'Approved') _Pil(Icons.stars_rounded, '${angkaId(x.point, desimal: 2)} point', warna: AppColors.success700),
            ]),
            if (x.petugas.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(x.petugas, style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
              ),
            const SizedBox(height: 12),
            // foto utama sebagai acuan awal
            Row(children: [
              for (final s in slotP0) ...[
                Expanded(
                  child: FotoServer(
                    repo: repo,
                    sesi: sesi,
                    foto: x.foto.contains(s) ? FotoApproval(p0Id: x.p0Id, jenis: 'P0', slot: s, label: labelSlotP0[s]!) : null,
                    label: labelSlotP0[s]!,
                    keterangan: '${x.kodeP0} · ${x.namaTampil}',
                  ),
                ),
                if (s != slotP0.last) const SizedBox(width: 8),
              ],
            ]),
            if (x.status == 'Rejected' && x.alasanRejected.isNotEmpty) ...[
              const SizedBox(height: 10),
              _Kotak(ikon: Icons.block_rounded, warna: AppColors.red700, latar: AppColors.red100, teks: 'Alasan: ${x.alasanRejected}'),
            ],
            if (x.koreksiJenis.isNotEmpty) ...[
              const SizedBox(height: 8),
              _Kotak(
                ikon: Icons.edit_note_rounded,
                warna: AppColors.brand700,
                latar: AppColors.brand50,
                teks: 'Jenis dikoreksi: ${x.koreksiJenis.last['dari']} > ${x.koreksiJenis.last['ke']}',
              ),
            ],
            for (final g in x.gardu) ...[const SizedBox(height: 8), _RingkasGardu(g)],
            for (final sw in x.switching) ...[const SizedBox(height: 8), _RingkasSwitching(sw)],
            if (terbuka) _detail(context),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 6, 10, 10),
          child: Row(children: [
            TextButton.icon(
              onPressed: onBuka,
              icon: Icon(terbuka ? Icons.expand_less_rounded : Icons.expand_more_rounded, size: 18),
              label: Text(terbuka ? 'Tutup detail' : 'Detail'),
            ),
            const Spacer(),
            if (sibuk) const Padding(padding: EdgeInsets.all(8), child: SisiLoader(ukuran: 18)),
            if (!sibuk && bolehUbah && x.bisaDiputuskan) ...[
              IconButton(
                tooltip: 'Edit jenis pekerjaan',
                onPressed: onUbahJenis,
                icon: const Icon(Icons.edit_rounded, color: AppColors.brand700),
              ),
              if (x.status != 'Rejected')
                OutlinedButton(
                  onPressed: onTolak,
                  style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.red700, side: const BorderSide(color: AppColors.red600), visualDensity: VisualDensity.compact),
                  child: const Text('Tolak'),
                ),
              if (x.status != 'Approved') ...[
                const SizedBox(width: 6),
                FilledButton(
                  onPressed: onSetujui,
                  style: FilledButton.styleFrom(backgroundColor: AppColors.success700, visualDensity: VisualDensity.compact),
                  child: Text(x.status == 'Rejected' ? 'Setujui ulang' : 'Setujui'),
                ),
              ],
            ],
          ]),
        ),
      ]),
    );
  }

  Widget _detail(BuildContext context) {
    final x = item;
    String m(double? v) => v == null ? '-' : '${v.round()} m';
    final baris = <(String, String)>[
      ('Tanggal', '${hariDariTanggal(x.tanggal)}, ${tanggalPendek(x.tanggal)}'),
      ('Koordinat pekerjaan', x.koordinat),
      ('Koordinat closing', x.koordinatClosing),
      ('Jarak closing', m(x.jarakClosing)),
      ('Jarak antar P0', m(x.jarakAntar)),
      ('Catatan', x.catatan),
      if (x.status == 'Approved') ('Point', x.point == null ? '-' : angkaId(x.point, desimal: 2)),
      if (x.approvedOleh.isNotEmpty) ('Diputuskan oleh', '${x.approvedOleh} · ${x.waktuApprove}'),
    ];
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Divider(height: 24),
      for (final b in baris)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 130, child: Text(b.$1, style: const TextStyle(fontSize: 12, color: AppColors.neutral500))),
            Expanded(
              child: Text(b.$2.isEmpty ? '-' : b.$2,
                  style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.navy900)),
            ),
          ]),
        ),
      for (final k in x.koreksiJenis)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text('Koreksi: ${k['dari']} > ${k['ke']}\n${k['oleh']} · ${k['waktu']} · ${k['alasan']}',
              style: const TextStyle(fontSize: 11.5, color: AppColors.neutral700)),
        ),
      for (final g in x.gardu) _DetailGardu(item: x, g: g, repo: repo, sesi: sesi),
      for (final sw in x.switching) _DetailSwitching(item: x, sw: sw, repo: repo, sesi: sesi),
      const SizedBox(height: 6),
    ]);
  }
}

class _Pil extends StatelessWidget {
  const _Pil(this.ikon, this.teks, {this.warna = AppColors.navy700});
  final IconData ikon;
  final String teks;
  final Color warna;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(99)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(ikon, size: 13, color: warna),
          const SizedBox(width: 4),
          Text(teks, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: warna)),
        ]),
      );
}

class _Kotak extends StatelessWidget {
  const _Kotak({required this.ikon, required this.warna, required this.latar, required this.teks});
  final IconData ikon;
  final Color warna;
  final Color latar;
  final String teks;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(12)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(ikon, size: 16, color: warna),
          const SizedBox(width: 8),
          Expanded(child: Text(teks, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: warna))),
        ]),
      );
}

/// Ringkasan lampiran gardu di kartu utama (No Gardu, kVA, %, kategori).
class _RingkasGardu extends StatelessWidget {
  const _RingkasGardu(this.g);
  final Map<String, dynamic> g;

  @override
  Widget build(BuildContext context) {
    final h = g['hasil'] is Map<dynamic, dynamic> ? g['hasil'] as Map<dynamic, dynamic> : const <dynamic, dynamic>{};
    final persen = (h['persen'] as num?)?.toDouble();
    final k = KategoriBeban.dari(persen);
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: AppColors.brand50, borderRadius: BorderRadius.circular(14)),
      child: Row(children: [
        CincinBeban(persen: persen, ukuran: 44, tebal: 5),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Text('Gardu ${g['noGardu'] ?? ''}', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900, color: AppColors.navy900)),
              const SizedBox(width: 6),
              BadgeKategori(k),
            ]),
            Text('${angkaId((h['kva'] as num?)?.toDouble(), desimal: 2)} kVA dari ${angkaId((g['kapasitas'] as num?)?.toDouble())} kVA · '
                '${(g['foto'] as List? ?? const []).length} foto · ${g['waktuBeban'] ?? ''}',
                style: const TextStyle(fontSize: 11.5, color: AppColors.neutral700)),
          ]),
        ),
      ]),
    );
  }
}

class _RingkasSwitching extends StatelessWidget {
  const _RingkasSwitching(this.sw);
  final Map<String, dynamic> sw;

  @override
  Widget build(BuildContext context) {
    final a = sw['arus'] is Map<dynamic, dynamic> ? sw['arus'] as Map<dynamic, dynamic> : const <dynamic, dynamic>{};
    String n(Object? v) => v is num ? teksArus(v.toDouble()) : '-';
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: AppColors.brand50, borderRadius: BorderRadius.circular(14)),
      child: Row(children: [
        Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: AppColors.brand700, borderRadius: BorderRadius.circular(12)),
          child: Text('${sw['nama'] ?? ''}'.toUpperCase().startsWith('ACR') ? 'ACR' : 'LBS',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: AppColors.plnYellow)),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${sw['nama'] ?? 'Switching'}', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900, color: AppColors.navy900)),
            Text('Arus R ${n(a['R'])} · S ${n(a['S'])} · T ${n(a['T'])} A · ${(sw['foto'] as List? ?? const []).length} foto',
                style: const TextStyle(fontSize: 11.5, color: AppColors.neutral700)),
          ]),
        ),
      ]),
    );
  }
}

class _DetailGardu extends StatelessWidget {
  const _DetailGardu({required this.item, required this.g, required this.repo, required this.sesi});
  final ItemApprovalP0 item;
  final Map<String, dynamic> g;
  final ApprovalP0Repository repo;
  final Sesi sesi;

  @override
  Widget build(BuildContext context) {
    final nilai = g['nilai'] is Map<dynamic, dynamic> ? g['nilai'] as Map<dynamic, dynamic> : const <dynamic, dynamic>{};
    final h = g['hasil'] is Map<dynamic, dynamic> ? g['hasil'] as Map<dynamic, dynamic> : const <dynamic, dynamic>{};
    final foto = [for (final x in (g['foto'] as List? ?? const [])) '$x'];
    String a(Object? v) => v is num ? angkaId(v.toDouble(), desimal: 2) : '-';
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const SizedBox(height: 14),
      Text('Pengecekan Gardu ${g['noGardu'] ?? ''}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppColors.navy900)),
      Text('${g['alamat'] ?? ''} · Jam ukur ${_jam('${g['jam'] ?? ''}')} · jarak ke gardu ${g['jarakM'] ?? '-'} m',
          style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
      const SizedBox(height: 8),
      GridView.count(
        crossAxisCount: 3,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        childAspectRatio: 0.78,
        children: [
          for (final v in nilaiGardu)
            FotoServer(
              repo: repo,
              sesi: sesi,
              foto: foto.contains(v.slot) ? FotoApproval(p0Id: item.p0Id, jenis: 'GARDU', id: '${g['id']}', slot: v.slot, label: v.label) : null,
              label: '${v.label} ${a(nilai[v.kunci])} ${v.satuan}',
              keterangan: 'Gardu ${g['noGardu'] ?? ''} · ${v.label}',
            ),
          FotoServer(
            repo: repo,
            sesi: sesi,
            foto: foto.contains(slotKondisiGardu)
                ? FotoApproval(p0Id: item.p0Id, jenis: 'GARDU', id: '${g['id']}', slot: slotKondisiGardu, label: 'Kondisi / Temuan')
                : null,
            label: 'Kondisi / Temuan',
            keterangan: 'Gardu ${g['noGardu'] ?? ''}',
          ),
        ],
      ),
      const SizedBox(height: 8),
      Text('Arus maks ${a(h['arusMaks'])} A · ${a(h['kva'])} kVA · ${a(h['persen'])}% ${h['kategori'] ?? ''} · '
          'tidak seimbang ${a(h['tidakSeimbang'])}%${'${g['diterapkan']}' == 'YA' ? ' · masuk Master Gardu' : ''}',
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.navy900)),
      if ('${g['catatan'] ?? ''}'.isNotEmpty)
        Text('Catatan: ${g['catatan']}', style: const TextStyle(fontSize: 12, color: AppColors.neutral700)),
    ]);
  }
}

class _DetailSwitching extends StatelessWidget {
  const _DetailSwitching({required this.item, required this.sw, required this.repo, required this.sesi});
  final ItemApprovalP0 item;
  final Map<String, dynamic> sw;
  final ApprovalP0Repository repo;
  final Sesi sesi;

  @override
  Widget build(BuildContext context) {
    final ind = sw['indikator'] is Map<dynamic, dynamic> ? sw['indikator'] as Map<dynamic, dynamic> : const <dynamic, dynamic>{};
    final foto = [for (final x in (sw['foto'] as List? ?? const [])) '$x'];
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const SizedBox(height: 14),
      Text('Pengecekan Switching ${sw['nama'] ?? ''}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppColors.navy900)),
      Text('${sw['section'] ?? ''} · Jam ${_jam('${sw['jam'] ?? ''}')}', style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
      const SizedBox(height: 8),
      for (final n in namaIndikator) PilihIndikator(nama: n, nilai: ind[n] == null || '${ind[n]}'.isEmpty ? null : '${ind[n]}'),
      GridView.count(
        crossAxisCount: 3,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        childAspectRatio: 0.78,
        children: [
          for (final s in slotSwitching)
            FotoServer(
              repo: repo,
              sesi: sesi,
              foto: foto.contains(s) ? FotoApproval(p0Id: item.p0Id, jenis: 'SWITCHING', id: '${sw['id']}', slot: s, label: labelSlotSwitching[s]!) : null,
              label: labelSlotSwitching[s]!,
              keterangan: '${sw['nama'] ?? ''}',
            ),
        ],
      ),
      if ('${sw['catatan'] ?? ''}'.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text('Catatan: ${sw['catatan']}', style: const TextStyle(fontSize: 12, color: AppColors.neutral700)),
        ),
    ]);
  }
}

/// Kotak foto dari server: thumbnail dimuat saat tampil, ketuk = foto penuh (perbesar, watermark terbaca).
class FotoServer extends StatefulWidget {
  const FotoServer({super.key, required this.repo, required this.sesi, required this.foto, required this.label, this.keterangan});
  final ApprovalP0Repository repo;
  final Sesi sesi;
  final FotoApproval? foto;
  final String label;
  final String? keterangan;

  @override
  State<FotoServer> createState() => _FotoServerState();
}

class _FotoServerState extends State<FotoServer> {
  Future<Uint8List>? _kecil;
  bool _buka = false;

  @override
  void initState() {
    super.initState();
    final f = widget.foto;
    if (f != null) _kecil = widget.repo.fotoKecil(widget.sesi, f);
  }

  Future<void> _lihat() async {
    final f = widget.foto;
    if (f == null || _buka) return;
    setState(() => _buka = true);
    try {
      final path = await widget.repo.fotoPenuh(widget.sesi, f);
      if (!mounted) return;
      await lihatFoto(context, path: path, slot: f.label, keterangan: widget.keterangan);
    } on ApiException catch (e) {
      if (mounted) tampilPesan(context, KodeError.pesan(e.kode));
    } catch (_) {
      if (mounted) tampilPesan(context, 'Foto gagal dimuat. Periksa sinyal.');
    } finally {
      if (mounted) setState(() => _buka = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ada = widget.foto != null;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: ada ? () => unawaited(_lihat()) : null,
      child: Column(children: [
        AspectRatio(
          aspectRatio: 1,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Stack(fit: StackFit.expand, children: [
              Container(color: const Color(0xFFE2E8F0)),
              if (!ada)
                const Center(child: Icon(Icons.image_not_supported_outlined, color: AppColors.neutral400))
              else
                FutureBuilder<Uint8List>(
                  future: _kecil,
                  builder: (context, s) {
                    if (s.hasData) return Image.memory(s.data!, fit: BoxFit.cover, gaplessPlayback: true);
                    if (s.hasError) {
                      return Center(
                        child: IconButton(
                          tooltip: 'Muat ulang foto',
                          onPressed: () => setState(() => _kecil = widget.repo.fotoKecil(widget.sesi, widget.foto!)),
                          icon: const Icon(Icons.refresh_rounded, color: AppColors.neutral500),
                        ),
                      );
                    }
                    return const Center(child: SisiLoader(ukuran: 18));
                  },
                ),
              if (ada)
                const Positioned(right: 4, bottom: 4, child: Icon(Icons.zoom_in_rounded, size: 16, color: Colors.white)),
              if (_buka) const ColoredBox(color: Color(0x66000000), child: Center(child: SisiLoader(warna: Colors.white))),
            ]),
          ),
        ),
        const SizedBox(height: 4),
        Text(widget.label,
            maxLines: 2,
            textAlign: TextAlign.center,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.navy900)),
      ]),
    );
  }
}

/// Alasan penolakan (wajib), dengan pilihan cepat.
class _SheetAlasan extends StatefulWidget {
  const _SheetAlasan({required this.kode});
  final String kode;

  @override
  State<_SheetAlasan> createState() => _SheetAlasanState();
}

class _SheetAlasanState extends State<_SheetAlasan> {
  final _c = TextEditingController();
  static const _cepat = ['Foto tidak sesuai pekerjaan', 'Foto buram / tidak jelas', 'Lokasi tidak sesuai', 'Pekerjaan tidak valid', 'Foto duplikat'];

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Alasan penolakan', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.navy900)),
          Text(widget.kode, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
          const SizedBox(height: 12),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final a in _cepat)
              ActionChip(
                label: Text(a, style: const TextStyle(fontSize: 12)),
                onPressed: () => setState(() => _c.text = a),
              ),
          ]),
          const SizedBox(height: 12),
          TextField(
            controller: _c,
            maxLines: 3,
            maxLength: 300,
            onChanged: (_) => setState(() {}),
            decoration: sisiInput('Alasan (wajib)'),
          ),
          SizedBox(
            height: 48,
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.red700),
              onPressed: _c.text.trim().isEmpty ? null : () => Navigator.pop(context, _c.text.trim()),
              child: const Text('Tolak P0'),
            ),
          ),
        ]),
      );
}

class _KoreksiJenis {
  const _KoreksiJenis(this.nama, this.lainnya, this.alasan, this.bobot);
  final String nama;
  final String lainnya;
  final String alasan;
  final double? bobot;
}

/// Edit jenis pekerjaan (petugas salah input): dari master, alasan wajib. Foto, waktu, petugas, kode P0 tetap.
class _SheetUbahJenis extends StatefulWidget {
  const _SheetUbahJenis({required this.item, required this.daftar, required this.bobotMaster});
  final ItemApprovalP0 item;
  final List<String> daftar;
  final Map<String, double?> bobotMaster;

  @override
  State<_SheetUbahJenis> createState() => _SheetUbahJenisState();
}

class _SheetUbahJenisState extends State<_SheetUbahJenis> {
  late String? _nama = widget.daftar.contains(widget.item.namaPekerjaan) ? widget.item.namaPekerjaan : null;
  late final _lainnya = TextEditingController(text: widget.item.pekerjaanLainnya);
  final _alasan = TextEditingController();
  final _bobot = TextEditingController();

  bool get _lain => _nama == pekerjaanLainLain;
  bool get _perluBobot => _lain && widget.item.status == 'Approved';

  @override
  void dispose() {
    _lainnya.dispose();
    _alasan.dispose();
    _bobot.dispose();
    super.dispose();
  }

  Future<void> _pilih() async {
    final v = await bukaPilihan(context,
        judul: 'Jenis pekerjaan',
        pilihan: [for (final n in widget.daftar) PilihanItem(n, n)],
        terpilih: _nama,
        selaluCari: true);
    if (v != null && mounted) setState(() => _nama = v);
  }

  void _simpan() {
    final nama = _nama;
    String? salah;
    double? bobot;
    if (nama == null) {
      salah = 'Pilih jenis pekerjaan.';
    } else if (_lain && _lainnya.text.trim().isEmpty) {
      salah = 'Isi Pekerjaan Lainnya.';
    } else if (_alasan.text.trim().isEmpty) {
      salah = 'Isi alasan koreksi.';
    } else if (_lain && _bobot.text.trim().isNotEmpty) {
      bobot = double.tryParse(_bobot.text.trim().replaceAll(',', '.'));
      if (bobot == null || bobot < 0 || bobot > 100) salah = 'Bobot 0 - 100.';
    }
    if (salah == null && _perluBobot && bobot == null) salah = 'P0 sudah disetujui: isi bobot Lain - Lain.';
    if (salah != null || nama == null) {
      tampilPesan(context, salah ?? 'Pilih jenis pekerjaan.');
      return;
    }
    Navigator.pop(context, _KoreksiJenis(nama, _lain ? _lainnya.text.trim() : '', _alasan.text.trim(), bobot));
  }

  @override
  Widget build(BuildContext context) {
    final x = widget.item;
    final bobot = _nama == null || _lain ? null : widget.bobotMaster[_nama];
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Koreksi jenis pekerjaan', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.navy900)),
          Text('${x.kodeP0} · sekarang: ${x.namaTampil}', style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
          const SizedBox(height: 6),
          const Text('Foto, waktu, petugas, dan kode P0 tidak berubah. Bobot ikut master; point dihitung ulang kalau sudah disetujui.',
              style: TextStyle(fontSize: 12, color: AppColors.neutral700)),
          const SizedBox(height: 12),
          Material(
            color: AppColors.brand50,
            borderRadius: BorderRadius.circular(14),
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => unawaited(_pilih()),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(children: [
                  const Icon(Icons.work_outline_rounded, color: AppColors.brand700),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Jenis pekerjaan baru', style: TextStyle(fontSize: 11, color: AppColors.neutral500)),
                      Text(_nama ?? 'Pilih', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.navy900)),
                      if (bobot != null) Text('Bobot ${angkaId(bobot)}', style: const TextStyle(fontSize: 11.5, color: AppColors.neutral700)),
                    ]),
                  ),
                  const Icon(Icons.expand_more_rounded, color: AppColors.brand700),
                ]),
              ),
            ),
          ),
          if (_lain) ...[
            const SizedBox(height: 10),
            TextField(controller: _lainnya, maxLength: 100, decoration: sisiInput('Pekerjaan Lainnya')),
            TextField(
              controller: _bobot,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
              decoration: sisiInput(_perluBobot ? 'Bobot (wajib, 0 - 100)' : 'Bobot (boleh diisi saat setujui)'),
            ),
          ],
          const SizedBox(height: 10),
          TextField(controller: _alasan, maxLines: 2, maxLength: 300, decoration: sisiInput('Alasan koreksi (wajib)')),
          SizedBox(height: 48, child: FilledButton.icon(onPressed: _simpan, icon: const Icon(Icons.save_rounded), label: const Text('Simpan koreksi'))),
        ]),
      ),
    );
  }
}
