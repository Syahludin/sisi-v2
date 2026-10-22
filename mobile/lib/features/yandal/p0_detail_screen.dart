import 'dart:async';

import 'package:flutter/material.dart';
import '../../core/navigasi.dart';

import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/foto_slot.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/sisi_widgets.dart';
import '../../widgets/wa_panel.dart';
import '../gardu/gardu_model.dart';
import '../row/foto_repository.dart' show FotoRepository;
import '../row/kamera_screen.dart';
import '../row/row_repository.dart' show RowError;
import 'gardu_ukur_panel.dart';
import 'p0_model.dart';
import 'p0_repository.dart';
import 'pekerjaan_shift_view.dart';
import 'switching_panel.dart';
import 'ubah_lokasi_p0_screen.dart';
import '../../widgets/sisi_loader.dart';

/// v0.64.0: detail satu P0. Foto urut Sebelum (mulai) > Pekerjaan (proses) > Sesudah (selesai), kamera SiSi ber-watermark.
/// v0.64.7 (keputusan kvlar 8 Okt 2026): foto baru = "belum disimpan" (masih boleh diambil ulang); tombol Simpan Foto
/// mengunci foto (verifikasi), baru tahap berikutnya bisa difoto. Info koordinat pekerjaan / closing, jarak, durasi;
/// tombol Download Foto P0 (+ Download Foto Switching / Pengukuran, v1.0.0) dan Kirim WA. P0 tanpa foto boleh dihapus (salah buat).
class P0DetailScreen extends StatefulWidget {
  const P0DetailScreen({super.key, required this.deps, required this.sesi, required this.p0Id, this.awalGardu});
  final Deps deps;
  final Sesi sesi;
  final String p0Id;
  final Gardu? awalGardu;

  @override
  State<P0DetailScreen> createState() => _P0DetailScreenState();
}

class _P0DetailScreenState extends State<P0DetailScreen> {
  P0Lokal? _p0;
  bool _siap = false;
  bool _proses = false;
  bool _unduh = false;
  bool _unduhAnak = false; // v1.0.0: Download Foto Switching / Pengukuran
  bool _menyegarkan = false;

  static const String albumP0 = 'SiSi Yandal';

  @override
  void initState() {
    super.initState();
    unawaited(_muat());
  }

  Future<void> _muat() async {
    final x = await widget.deps.p0.satu(widget.sesi.userId, widget.p0Id);
    if (mounted) {
      setState(() {
        _p0 = x;
        _siap = true;
      });
    }
  }

  String _jam(DateTime t) {
    final w = Wib.dinding(t);
    String d(int n) => n.toString().padLeft(2, '0');
    return '${d(w.hour)}:${d(w.minute)}';
  }

  bool get _habis => widget.sesi.habisShift(widget.deps.jam.sekarang());

  Future<void> _foto(String slot) async {
    final x = _p0;
    if (x == null || _proses) return;
    final ada = x.foto[slot]?.path;
    if (ada == null && !x.bolehFoto(slot)) {
      tampilPesan(context, x.alasanBelumBoleh(slot) ?? 'Foto ini belum bisa diambil.');
      return;
    }
    if (_habis) {
      if (ada != null) await lihatFoto(context, path: ada, slot: slot, keterangan: x.namaTampil);
      return;
    }
    // v0.65.5 (keputusan kvlar 8 Okt 2026): verifikasi foto langsung di review kamera. Simpan Foto di kamera =
    // foto disimpan + dikunci sekaligus (tidak ada lagi tahap "Belum disimpan" di halaman ini).
    P0Lokal? baru;
    final f = await ambilFotoRow(context,
        slot: slot,
        pratinjau: P0Repository.watermark(widget.sesi, x, slot, widget.deps.jam.sekarang()),
        pathAda: ada,
        keterangan: x.namaTampil,
        bolehGaleri: false,
        alasanTidakUlang: x.alasanTidakUlang(slot),
        p0: true, // jam terpercaya + penanda susulan di watermark
        simpan: (foto) async {
          baru = await widget.deps.p0.simpanFoto(widget.sesi, x, slot, foto, kunci: true);
        });
    final b = baru;
    if (f == null || b == null || !mounted) {
      if (mounted) await _muat();
      return;
    }
    setState(() => _p0 = b);
    final label = labelSlotP0[slot];
    tampilPesan(
        context,
        b.selesai
            ? 'P0 selesai. Dikirim ke server saat ada sinyal.'
            : f.lat == null
                ? 'Foto $label disimpan TANPA koordinat.'
                : 'Foto $label disimpan.');
    unawaited(_kirimLalu());
  }

  /// Simpan Foto = verifikasi. Sesudah ini foto tidak bisa diambil ulang. v0.65.5: hanya untuk foto lama yang belum
  /// disimpan (diambil sebelum verifikasi pindah ke review kamera); foto baru sudah terkunci dari kamera.
  Future<void> _kunci() async {
    final x = _p0;
    if (x == null || _proses || x.belumDisimpan.isEmpty) return;
    final daftar = x.belumDisimpan.map((s) => labelSlotP0[s]).join(', ');
    final tanpaGps = x.belumDisimpan.where((s) => x.foto[s]?.koordinat == null).map((s) => labelSlotP0[s]).join(', ');
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Simpan foto?'),
        content: Text('Foto $daftar sudah benar? Setelah disimpan, foto tidak bisa diambil ulang.'
            '${tanpaGps.isEmpty ? '' : '\n\nFoto $tanpaGps TANPA koordinat (GPS belum didapat).'}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cek lagi')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Simpan')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _proses = true);
    try {
      final baru = await widget.deps.p0.kunciFoto(widget.sesi, x);
      if (!mounted) return;
      setState(() => _p0 = baru);
      tampilPesan(context, baru.selesai ? 'P0 selesai. Dikirim ke server saat ada sinyal.' : 'Foto $daftar disimpan.');
      unawaited(_kirimLalu()); // v0.65.0: langsung dicoba kirim
    } on RowError catch (e) {
      if (mounted) tampilPesan(context, e.pesan);
    } catch (_) {
      if (mounted) tampilPesan(context, 'Foto gagal disimpan. Coba lagi.');
    } finally {
      if (mounted) setState(() => _proses = false);
    }
  }

  String _namaFile(P0Lokal x, String slot) => x.kodeResmi.isNotEmpty
      ? '${x.kodeResmi}_$slot'
      : '${x.kodeShift.isEmpty ? 'P0' : x.kodeShift}-P0.${x.no.toString().padLeft(3, '0')}_$slot';

  /// v0.65.0: sync sekarang lalu muat ulang (kode resmi / status server).
  Future<void> _kirimLalu() async {
    await widget.deps.syncCtl.sinkron();
    if (mounted) await _muat();
  }

  /// v0.65.12: pull refresh / tombol refresh: kirim yang tertunda + tarik status server, lalu muat ulang dari HP.
  Future<void> _segarkan() async {
    if (_menyegarkan) return;
    setState(() => _menyegarkan = true);
    final ctl = widget.deps.syncCtl;
    try {
      await ctl.sinkron();
      await _muat();
      if (mounted) {
        tampilPesan(context, ctl.online == false ? 'Tidak ada sinyal. Menampilkan data di HP.' : 'Detail P0 diperbarui.');
      }
    } catch (_) {
      if (mounted) tampilPesan(context, 'Gagal memperbarui. Coba lagi.');
    } finally {
      if (mounted) setState(() => _menyegarkan = false);
    }
  }

  /// v0.66.4: edit penyulang / section / daerah (section salah pilih).
  Future<void> _ubahLokasi() async {
    final x = _p0;
    if (x == null || _proses) return;
    if (_habis) {
      tampilPesan(context, 'Jam shift sudah habis.');
      return;
    }
    final alasan = x.alasanTidakUbahLokasi;
    if (alasan != null) {
      tampilPesan(context, alasan);
      return;
    }
    final baru = await bukaForm<P0Lokal>(
        context, MaterialPageRoute(builder: (_) => UbahLokasiP0Screen(deps: widget.deps, sesi: widget.sesi, p0: x)));
    if (baru == null || !mounted) return;
    setState(() => _p0 = baru);
    tampilPesan(context, 'Lokasi P0 diperbarui.');
  }

  /// Data ditolak server: hapus tanda error lalu kirim lagi.
  Future<void> _kirimUlang() async {
    final x = _p0;
    if (x == null) return;
    await widget.deps.p0.ubahStatusKirim(x.userId, x.id, (k) => k.denganError(''));
    await _kirimLalu();
  }

  /// Download Foto P0: foto Sebelum / Pekerjaan / Sesudah P0 ini ke galeri HP (album SiSi Yandal).
  Future<void> _download() async {
    final x = _p0;
    if (x == null || _unduh || x.foto.isEmpty) return;
    setState(() => _unduh = true);
    try {
      await _keGaleri([
        for (final s in slotP0)
          if (x.foto[s] != null) (path: x.foto[s]!.path, nama: _namaFile(x, s)),
      ]);
    } finally {
      if (mounted) setState(() => _unduh = false);
    }
  }

  /// v1.0.0 (permintaan kvlar 19 Okt 2026): foto hasil pengecekan anak P0 ke galeri. Pengecekan Switching = foto Arus +
  /// Arus Gangguan semua switching; Pengecekan Gardu = 10 foto ukur + Kondisi / Temuan. Nama file = kode switching /
  /// pengukuran + slot (kode resmi server kalau sudah terkirim).
  List<({String path, String nama})> _fotoAnak(P0Lokal x) {
    String aman(String kode) => kode.replaceAll(RegExp(r'[^A-Za-z0-9.]+'), '_');
    if (x.butuhSwitching) {
      return [
        for (final w in x.switching)
          for (final s in slotSwitching)
            if (w.foto[s] != null) (path: w.foto[s]!.path, nama: '${aman(w.kodeTampil(x))}_$s'),
      ];
    }
    final g = x.ukurGardu;
    if (x.butuhGardu && g != null) {
      return [
        for (final s in slotGardu)
          if (g.foto[s] != null) (path: g.foto[s]!.path, nama: '${aman(g.kodeTampil(x))}_$s'),
      ];
    }
    return const [];
  }

  Future<void> _downloadAnak() async {
    final x = _p0;
    if (x == null || _unduhAnak) return;
    final daftar = _fotoAnak(x);
    if (daftar.isEmpty) return;
    setState(() => _unduhAnak = true);
    try {
      await _keGaleri(daftar, judul: x.butuhSwitching ? 'Foto switching berhasil didownload' : 'Foto pengukuran berhasil didownload');
    } finally {
      if (mounted) setState(() => _unduhAnak = false);
    }
  }

  /// Salin file foto lokal ke galeri, lalu pop up berhasil (v0.92.0). Gagal / izin ditolak = snackbar.
  Future<void> _keGaleri(List<({String path, String nama})> daftar, {String judul = 'Foto berhasil didownload'}) async {
    try {
      if (!await FotoRepository.izinGaleri()) {
        if (mounted) tampilPesan(context, 'Izin galeri ditolak. Izinkan di Pengaturan HP.');
        return;
      }
      var n = 0;
      for (final f in daftar) {
        await FotoRepository.keGaleri(f.path, nama: f.nama, album: albumP0);
        n++;
      }
      if (!mounted) return;
      if (n > 0) {
        unawaited(tampilPopupBerhasil(context, judul: judul, keterangan: '$n foto tersimpan di galeri\nalbum $albumP0'));
      } else {
        tampilPesan(context, 'Belum ada foto.');
      }
    } on RowError catch (e) {
      if (mounted) tampilPesan(context, e.pesan);
    } catch (_) {
      if (mounted) tampilPesan(context, 'Foto gagal disimpan ke galeri.');
    }
  }

  Future<void> _wa() async {
    final x = _p0;
    if (x == null) return;
    await kirimWa(context, teksWaP0(x, petugas: widget.sesi.petugasShift));
  }

  Future<void> _hapus() async {
    final x = _p0;
    if (x == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Hapus P0 ini?'),
        content: Text('${x.namaTampil} (${x.kodeTampil}) belum ada fotonya dan akan dihapus dari HP.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Hapus')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await widget.deps.p0.hapus(x);
      if (mounted) Navigator.pop(context);
    } on RowError catch (e) {
      if (mounted) tampilPesan(context, e.pesan);
    }
  }

  IsiSlot _isiSlot(P0Lokal x, String s) {
    final f = x.foto[s];
    if (f == null) {
      final boleh = x.bolehFoto(s);
      return IsiSlot(label: boleh ? 'Ambil foto' : 'Kosong', warnaLabel: boleh ? AppColors.navy700 : AppColors.neutral500);
    }
    return f.terkunci
        ? IsiSlot(path: f.path, label: 'Disimpan', warnaLabel: AppColors.success700, ikon: Icons.lock_rounded)
        : IsiSlot(path: f.path, label: 'Belum disimpan', warnaLabel: AppColors.accent700, ikon: Icons.edit_rounded);
  }

  @override
  Widget build(BuildContext context) {
    final x = _p0;
    if (!_siap) return const Scaffold(body: SisiLoading(pesan: 'Memuat P0...', ukuran: 60));
    if (x == null) {
      return Scaffold(appBar: sisiAppBar('P0'), body: const SisiKosong(ikon: Icons.search_off_rounded, judul: 'P0 tidak ditemukan di HP.'));
    }
    final w = x.selesai ? warnaSelesai : warnaProses;
    final l = x.selesai ? latarSelesai : latarProses;
    final d = x.durasi;
    // v0.65.2: titik pekerjaan = foto Sebelum, cadangan foto Pekerjaan; tanda susulan ikut ditampilkan
    String? teksTitik(FotoP0? f, {String? dari}) {
      final k = f?.koordinat;
      if (k == null) return null;
      final tanda = [if (dari != null) 'dari foto $dari', if (f!.gpsSusulanDetik != null) 'susulan ${f.gpsSusulanDetik} dtk'];
      return tanda.isEmpty ? k : '$k (${tanda.join(', ')})';
    }
    final kp = teksTitik(x.fotoTitikPekerjaan, dari: x.slotTitikPekerjaan == 'PEKERJAAN' ? 'Pekerjaan' : null);
    final kc = teksTitik(x.foto['SESUDAH']);
    final jarak = x.jarakKm;
    final belum = x.belumDisimpan;
    Widget baris(String k, String v) => Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 120, child: Text(k, style: const TextStyle(fontSize: 12.5, color: AppColors.neutral500))),
            Expanded(child: Text(v.isEmpty ? '-' : v, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.navy900))),
          ]),
        );
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar(x.kodeTampil, subjudul: x.namaTampil, actions: [
        TombolSegarkan(sibuk: _menyegarkan || _proses, onPressed: () => unawaited(_segarkan())),
        if (x.foto.isEmpty && !x.terkirim)
          IconButton(tooltip: 'Hapus P0', onPressed: () => unawaited(_hapus()), icon: const Icon(Icons.delete_outline_rounded)),
      ]),
      body: RefreshIndicator(
        onRefresh: _segarkan,
        child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 16, 16, 40), children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: l, borderRadius: BorderRadius.circular(16)),
          child: Row(children: [
            Icon(x.selesai ? Icons.task_alt_rounded : Icons.timelapse_rounded, color: w, size: 30),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(x.selesai ? 'Sudah dikerjakan' : 'Progress', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: w)),
                Text(x.tahap, style: const TextStyle(fontSize: 12, color: AppColors.neutral700)),
              ]),
            ),
            if (d != null) Text(teksDurasi(d), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: w)),
          ]),
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral200)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // v0.66.4: judul card + tombol Edit (penyulang / section / daerah)
            Row(children: [
              const Expanded(child: Text('Data P0', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy900))),
              if (x.bolehUbahLokasi && !_habis)
                OutlinedButton.icon(
                  onPressed: _proses ? null : () => unawaited(_ubahLokasi()),
                  style: OutlinedButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  icon: const Icon(Icons.edit_location_alt_outlined, size: 18),
                  label: const Text('Edit'),
                )
              else if (x.butuhSwitching && x.switching.isNotEmpty && !x.selesai)
                const Tooltip(
                  message: 'Section terkunci setelah data switching disimpan',
                  child: Icon(Icons.lock_outline_rounded, size: 18, color: AppColors.neutral400),
                ),
            ]),
            const SizedBox(height: 8),
            baris('Kode P0', x.kodeResmi.isEmpty ? 'Belum terkirim (P0 #${x.no.toString().padLeft(3, '0')})' : x.kodeResmi),
            if (x.statusApproval.isNotEmpty)
              baris('Status server', x.alasanRejected.isEmpty ? x.statusApproval : '${x.statusApproval} (${x.alasanRejected})'),
            baris('Pekerjaan', x.namaTampil),
            baris('Penyulang', x.penyulang),
            baris('Section', x.section),
            baris('Daerah', x.daerah),
            if (x.lokasiBelumTerkirim)
              const Padding(
                padding: EdgeInsets.only(bottom: 4),
                child: Text('Perubahan lokasi belum terkirim ke server.', style: TextStyle(fontSize: 11.5, color: AppColors.accent700)),
              ),
            baris('Dibuat', _jam(x.dibuat)),
            for (final s in slotP0)
              if (x.foto[s] != null) baris('Foto ${labelSlotP0[s]}', _jam(x.foto[s]!.waktu)),
            baris('Koordinat pekerjaan', kp ?? ''),
            baris('Koordinat closing', kc ?? ''),
            baris('Jarak pekerjaan - closing', jarak == null ? '' : teksJarak(jarak)),
            baris('Durasi', d == null ? '' : teksDurasi(d)),
            if (x.adaWaktuHp)
              const Padding(
                padding: EdgeInsets.only(top: 4),
                child: Text('Sebagian waktu memakai jam HP (belum tervalidasi jam server). Diperiksa server saat dikirim.',
                    style: TextStyle(fontSize: 11.5, color: AppColors.accent700)),
              ),
            if (x.catatan.isNotEmpty) baris('Catatan', x.catatan),
          ]),
        ),
        const SizedBox(height: 16),
        const Text('Foto pekerjaan', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy900)),
        const SizedBox(height: 10), // v0.66.3: keterangan di atas foto dihapus (permintaan kvlar)
        // v0.66.0: card foto; Pengecekan Switching ikut di card yang sama (hanya pekerjaan Pengecekan Switching)
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral200)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Stack(children: [
              FotoSlotRow(
                isi: {for (final s in slotP0) s: _isiSlot(x, s)},
                onPilih: _proses ? null : (s) => unawaited(_foto(s)),
              ),
              if (_proses) const Positioned.fill(child: Center(child: SisiLoader())),
            ]),
            if (x.butuhSwitching) ...[
              const Divider(height: 26),
              SwitchingPanel(
                key: ValueKey('sw-${x.id}'),
                deps: widget.deps,
                sesi: widget.sesi,
                p0: x,
                onBerubah: (b) => setState(() => _p0 = b),
                onUbahLokasi: () => unawaited(_ubahLokasi()),
              ),
            ],
            // v0.74.0: Pengecekan Gardu (pilih gardu, 10 angka + foto per angka, hasil beban)
            if (x.butuhGardu) ...[
              const Divider(height: 26),
              GarduUkurPanel(
                key: ValueKey('grd-${x.id}'),
                deps: widget.deps,
                sesi: widget.sesi,
                p0: x,
                awalGardu: widget.awalGardu,
                onBerubah: (b) => setState(() => _p0 = b),
              ),
            ],
          ]),
        ),
        if (x.errorKirim.isNotEmpty) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              const Icon(Icons.error_outline_rounded, color: AppColors.red700, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text('Ditolak server: ${KodeError.pesan(x.errorKirim)}',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.red700)),
              ),
              TextButton(onPressed: () => unawaited(_kirimUlang()), child: const Text('Kirim lagi')),
            ]),
          ),
        ],
        if (belum.isNotEmpty && !_habis) ...[
          const SizedBox(height: 12),
          SizedBox(
            height: 48,
            child: FilledButton.icon(
              onPressed: _proses ? null : () => unawaited(_kunci()),
              icon: const Icon(Icons.verified_rounded),
              label: Text('Simpan Foto ${belum.map((s) => labelSlotP0[s]).join(', ')}'),
            ),
          ),
        ],
        const SizedBox(height: 12),
        // v1.0.0: 2 tombol download untuk Pengecekan Switching / Gardu (foto P0 + foto hasil pengecekan), Kirim WA di bawah
        Row(children: [
          Expanded(child: _tombolUnduh('Download Foto P0', _unduh, x.foto.isEmpty ? null : () => unawaited(_download()))),
          if (x.butuhSwitching || x.butuhGardu) ...[
            const SizedBox(width: 10),
            Expanded(
              child: _tombolUnduh(x.butuhSwitching ? 'Download Foto Switching' : 'Download Foto Pengukuran', _unduhAnak,
                  _fotoAnak(x).isEmpty ? null : () => unawaited(_downloadAnak())),
            ),
          ] else ...[
            const SizedBox(width: 10),
            Expanded(child: _tombolWa()),
          ],
        ]),
        if (x.butuhSwitching || x.butuhGardu) ...[
          const SizedBox(height: 10),
          SizedBox(width: double.infinity, child: _tombolWa()),
        ],
      ]),
      ),
    );
  }

  Widget _tombolUnduh(String label, bool sibuk, VoidCallback? aksi) => OutlinedButton.icon(
        onPressed: sibuk ? null : aksi,
        style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12)),
        icon: sibuk
            ? const SisiLoader(ukuran: 16)
            : const Icon(Icons.download_rounded, size: 18),
        label: Text(label, maxLines: 2, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13)),
      );

  Widget _tombolWa() => FilledButton.tonalIcon(
        onPressed: () => unawaited(_wa()),
        icon: const Icon(Icons.send_rounded, size: 18),
        label: const Text('Kirim WA'),
      );
}

/// v0.64.0: kartu P0 satu jenis pekerjaan (dari Rincian pekerjaan), sedang dikerjakan dulu lalu yang sudah.
class P0KelompokScreen extends StatefulWidget {
  const P0KelompokScreen({super.key, required this.deps, required this.sesi, required this.nama});
  final Deps deps;
  final Sesi sesi;
  final String nama;

  @override
  State<P0KelompokScreen> createState() => _P0KelompokScreenState();
}

class _P0KelompokScreenState extends State<P0KelompokScreen> {
  List<P0Lokal>? _p0;

  @override
  void initState() {
    super.initState();
    unawaited(_muat());
  }

  Future<void> _muat() async {
    final id = P0Repository.shiftIdSesi(widget.sesi);
    final l = id == null ? <P0Lokal>[] : await widget.deps.p0.daftarShift(widget.sesi.userId, id);
    if (mounted) setState(() => _p0 = l.where((x) => x.namaTampil == widget.nama).toList());
  }

  Future<void> _buka(P0Lokal x) async {
    await Navigator.push<void>(context, MaterialPageRoute(builder: (_) => P0DetailScreen(deps: widget.deps, sesi: widget.sesi, p0Id: x.id)));
    await _muat();
  }

  @override
  Widget build(BuildContext context) {
    final l = _p0;
    final proses = l?.where((x) => !x.selesai).toList() ?? const <P0Lokal>[];
    final selesai = l?.where((x) => x.selesai).toList() ?? const <P0Lokal>[];
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar(widget.nama, subjudul: '${proses.length} sedang · ${selesai.length} selesai'),
      body: l == null
          ? const SisiLoading(pesan: 'Memuat...', ukuran: 60)
          : l.isEmpty
              ? const SisiKosong(ikon: Icons.assignment_outlined, judul: 'Tidak ada P0 untuk pekerjaan ini.')
              : ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 40), children: [
                  for (final x in [...proses, ...selesai]) ...[KartuP0(p0: x, onTap: () => unawaited(_buka(x))), const SizedBox(height: 8)],
                ]),
    );
  }
}
