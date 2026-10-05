import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/foto_slot.dart';
import '../../widgets/sisi_widgets.dart';
import 'foto_repository.dart';
import 'form_eksekusi_screen.dart';
import 'kamera_screen.dart';
import 'row_model.dart';
import 'row_repository.dart';
import 'watermark.dart';

/// Detail eksekusi + foto. Foto Pekerjaan / Sesudah biasanya menyusul dari sini.
/// Foto yang baru diambil belum disimpan sampai tombol Simpan ditekan (simpan ke HP, offline pun bisa),
/// lalu terkirim otomatis saat online. Edit = ubah data pekerjaan. Download ulang = tarik foto dari server.
class EksekusiDetailScreen extends StatefulWidget {
  const EksekusiDetailScreen({super.key, required this.deps, required this.sesi, required this.eksekusiId});
  final Deps deps;
  final Sesi sesi;
  final String eksekusiId;

  @override
  State<EksekusiDetailScreen> createState() => _EksekusiDetailScreenState();
}

class _EksekusiDetailScreenState extends State<EksekusiDetailScreen> {
  RowEksekusi? _e;
  Map<String, FotoLokal> _foto = const {};
  final Map<String, FotoBaru> _baru = {}; // slot -> foto baru (kamera SiSi / galeri), belum disimpan
  bool _menyegarkan = false;
  bool _proses = false;
  ({int selesai, int total, String? slot})? _unduh;

  @override
  void initState() {
    super.initState();
    _muat();
    widget.deps.syncCtl.addListener(_ulang);
  }

  @override
  void dispose() {
    widget.deps.syncCtl.removeListener(_ulang);
    super.dispose();
  }

  void _ulang() {
    if (!widget.deps.syncCtl.sedangSync) _muat();
  }

  Future<void> _muat() async {
    final e = await widget.deps.row.eksekusi(widget.eksekusiId);
    final f = await widget.deps.foto.untukEksekusi(widget.eksekusiId);
    if (!mounted) return;
    setState(() {
      _e = e;
      _foto = f;
    });
  }

  /// Refresh (v0.49): sinkron (kirim tertunda + tarik kode/status), lalu muat ulang dari HP.
  /// Foto baru yang belum disimpan (_baru) tidak disentuh.
  Future<void> _segarkan() async {
    if (_menyegarkan) return;
    setState(() => _menyegarkan = true);
    final ctl = widget.deps.syncCtl;
    try {
      await ctl.sinkron();
      await _muat();
      if (mounted) tampilPesan(context, ctl.online == false ? 'Tidak ada sinyal. Menampilkan data di HP.' : 'Detail eksekusi diperbarui.');
    } finally {
      if (mounted) setState(() => _menyegarkan = false);
    }
  }

  /// Masih bisa diubah: AKTIF, punya akses UBAH, dan tanggal dalam 7 hari (kode EKS memuat tanggal header).
  bool get _bolehUbah {
    final e = _e;
    if (e == null || !e.aktif || !widget.sesi.bisaUbah('ROW_EKSEKUSI')) return false;
    final m = RegExp(r'^R\d{2}-\d{5}(\d{2})(\d{2})(\d{2})').firstMatch(e.kode);
    if (m == null) return false;
    final tgl = '20${m.group(1)}-${m.group(2)}-${m.group(3)}';
    return tgl.compareTo(Wib.tanggal(DateTime.now().subtract(const Duration(days: 7)))) >= 0;
  }

  /// Sudah pernah diterima server (revision dari server) = fotonya bisa diunduh ulang.
  bool get _adaDiServer => (_e?.revision ?? 0) > 0;

  static const Map<String, String> _ketStatus = {
    'TERKIRIM': 'Terkirim ke server',
    'TERTUNDA': 'Menunggu dikirim',
    'GAGAL': 'Gagal dikirim',
  };

  /// Ketuk kotak foto. Tanpa akses ubah (atau lewat 7 hari) = hanya bisa melihat.
  Future<void> _ketuk(String slot) async {
    final baru = _baru[slot];
    final lokal = _foto[slot];
    final path = baru?.file.path ?? lokal?.path;
    final ket = baru != null ? 'Baru, belum disimpan' : _ketStatus[lokal?.status];
    // hanya foto yang sudah disimpan (ber-watermark) yang boleh disalin ke galeri
    final namaGaleri = baru == null && lokal != null ? '${_e?.kode ?? widget.eksekusiId}_$slot' : null;
    if (!_bolehUbah) {
      if (path != null) await lihatFoto(context, path: path, slot: slot, keterangan: ket, namaGaleri: namaGaleri);
      return;
    }
    await _ambil(slot, pathAda: path, keterangan: ket, namaGaleri: namaGaleri);
  }

  Future<void> _ambil(String slot, {String? pathAda, String? keterangan, String? namaGaleri}) async {
    final e = _e;
    if (e == null) return;
    final r = await widget.deps.row.realisasi(e.realisasiId);
    if (!mounted) return;
    final f = await ambilFotoRow(context, slot: slot, pratinjau: DataWatermark(
      kodeEksekusi: e.kode,
      ulp: widget.sesi.ulp,
      tim: FotoRepository.timSesi(widget.sesi),
      subTim: widget.sesi.timNama,
      penyulang: r?.penyulang,
      section: e.section,
      waktu: DateTime.now(),
      koordinat: e.koordinatPekerjaan,
      diameter: e.diameter,
      jenis: e.jenisNama,
      slot: FotoRepository.label[slot]!,
    ), pathAda: pathAda, keterangan: keterangan, namaGaleri: namaGaleri);
    if (f == null || !mounted) return;
    setState(() => _baru[slot] = f);
  }

  /// Simpan foto baru ke HP (offline pun bisa), lalu sync jalan di latar.
  Future<void> _simpan() async {
    if (_baru.isEmpty) return;
    setState(() => _proses = true);
    final gagal = <String>[];
    for (final e in Map.of(_baru).entries) {
      try {
        await widget.deps.foto.simpan(widget.sesi, eksekusiId: widget.eksekusiId, slotFoto: e.key, foto: e.value);
        _baru.remove(e.key);
      } on RowError catch (x) {
        gagal.add('${FotoRepository.label[e.key]}: ${x.pesan}');
      } catch (_) {
        gagal.add('${FotoRepository.label[e.key]}: gagal disimpan');
      }
    }
    await _muat();
    if (!mounted) return;
    setState(() => _proses = false);
    if (gagal.isNotEmpty) {
      tampilPesan(context, gagal.join('\n'));
    } else {
      tampilPesan(context, widget.deps.syncCtl.online == true
          ? 'Foto tersimpan di HP, sedang dikirim.'
          : 'Foto tersimpan di HP. Terkirim otomatis saat online.');
    }
    unawaited(widget.deps.syncCtl.sinkron());
  }

  Future<void> _edit() async {
    final e = _e;
    if (e == null) return;
    final r = await widget.deps.row.realisasi(e.realisasiId);
    if (r == null || !mounted) return;
    final berubah = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => FormEksekusiScreen(deps: widget.deps, sesi: widget.sesi, realisasi: r, edit: e)),
    );
    await _muat();
    if (berubah == true && mounted) tampilPesan(context, 'Perubahan tersimpan. Terkirim otomatis saat online.');
  }

  Future<void> _unduhUlang() async {
    setState(() => _unduh = (selesai: 0, total: 0, slot: null));
    try {
      final galeri = await FotoRepository.izinGaleri();
      final h = await widget.deps.foto.unduhUlang(widget.sesi, widget.eksekusiId, simpanGaleri: galeri,
          progres: (s, t, slot) {
            if (mounted) setState(() => _unduh = (selesai: s, total: t, slot: slot));
          });
      // file bisa menimpa path yang sama: buang cache gambar supaya foto baru tampil
      PaintingBinding.instance.imageCache
        ..clear()
        ..clearLiveImages();
      await _muat();
      if (mounted) {
        tampilPesan(
            context,
            h.unduh == 0
                ? 'Belum ada foto di server.'
                : !galeri
                    ? '${h.unduh} foto diunduh. Izin galeri ditolak, foto hanya tersimpan di app.'
                    : '${h.unduh} foto diunduh, ${h.galeri} masuk galeri (album ${FotoRepository.albumGaleri}).');
      }
    } on ApiException catch (x) {
      if (mounted) {
        tampilPesan(context, x.kode.startsWith('HTTP_') ? 'Tidak bisa terhubung. Cek sinyal.' : KodeError.pesan(x.kode));
      }
    } catch (_) {
      if (mounted) tampilPesan(context, 'Tidak bisa terhubung. Cek sinyal.');
    } finally {
      if (mounted) setState(() => _unduh = null);
    }
  }

  Future<bool> _konfirmasiKeluar() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Foto belum disimpan'),
        content: Text('${_baru.length} foto baru belum disimpan. Keluar dan buang foto ini?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Tetap di sini')),
          TextButton(
            onPressed: () => Navigator.pop(c, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.red700),
            child: const Text('Buang & keluar'),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Widget _baris(String label, String? nilai) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 130, child: Text(label, style: const TextStyle(fontSize: 12.5, color: AppColors.neutral500))),
          Expanded(child: Text(nilai ?? '-', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700))),
        ]),
      );

  Widget _panelUnduh() {
    final u = _unduh;
    if (u == null) {
      return Align(
        alignment: Alignment.centerLeft,
        child: OutlinedButton.icon(
          onPressed: _proses ? null : _unduhUlang,
          icon: const Icon(Icons.download_rounded, size: 18),
          label: const Text('Download ulang foto'),
        ),
      );
    }
    final teks = u.total == 0
        ? 'Mengecek foto di server...'
        : 'Mengunduh foto ${u.slot == null ? '' : FotoRepository.label[u.slot]} (${u.selesai}/${u.total})';
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      LinearProgressIndicator(value: u.total == 0 ? null : u.selesai / u.total, minHeight: 6, borderRadius: BorderRadius.circular(6)),
      const SizedBox(height: 6),
      Text(teks, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final e = _e;
    final gagal = _foto.values.where((f) => f.status == 'GAGAL').toList();
    final sibuk = _proses || _unduh != null;
    final isi = <String, IsiSlot>{
      for (final f in _foto.values) f.slot: IsiSlot(path: f.path, status: f.status),
      for (final b in _baru.entries) b.key: IsiSlot(path: b.value.file.path), // "Baru" (belum disimpan)
    };
    return PopScope(
      canPop: _baru.isEmpty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _konfirmasiKeluar() && context.mounted) {
          _baru.clear();
          Navigator.pop(context);
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFF8FAFC),
        appBar: sisiAppBar('Detail Eksekusi', subjudul: e?.kode, actions: [
          TombolSegarkan(sibuk: _menyegarkan || sibuk || widget.deps.syncCtl.sedangSync, onPressed: _segarkan),
        ]),
        body: e == null
            ? const SisiLoading(ukuran: 60)
            : AbsorbPointer(
                absorbing: sibuk,
                child: RefreshIndicator(
                onRefresh: _segarkan,
                child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 16, 16, 24), children: [
                  SectionCard(judul: 'Foto pekerjaan', ikon: Icons.photo_camera_outlined, children: [
                    FotoSlotRow(isi: isi, onPilih: _bolehUbah || _foto.isNotEmpty ? _ketuk : null, lengkapDiServer: e.fotoLengkap),
                    if (_proses) const Padding(padding: EdgeInsets.only(top: 10), child: LinearProgressIndicator()),
                    if (gagal.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Text('Foto gagal: ${gagal.map((f) => '${FotoRepository.label[f.slot]} (${f.alasan})').join(', ')}',
                          style: const TextStyle(fontSize: 12, color: AppColors.red700)),
                      TextButton.icon(
                        onPressed: () async {
                          await widget.deps.foto.ulangiGagal(widget.eksekusiId);
                          await _muat();
                          unawaited(widget.deps.syncCtl.sinkron());
                        },
                        icon: const Icon(Icons.refresh_rounded),
                        label: const Text('Kirim ulang'),
                      ),
                    ],
                    const SizedBox(height: 6),
                    Text(
                      _baru.isNotEmpty
                          ? '${_baru.length} foto baru belum disimpan. Tekan Simpan.'
                          : e.fotoLengkap
                              ? 'Foto lengkap di server, eksekusi ini masuk laporan WA.'
                              : 'Dapat dikerjakan secara bertahap. Kamera: posisi HP mendatar (landscape).',
                      style: TextStyle(fontSize: 11.5, color: _baru.isNotEmpty ? AppColors.accent700 : AppColors.neutral500),
                    ),
                    if (_adaDiServer) ...[
                      const SizedBox(height: 10),
                      _panelUnduh(),
                    ],
                  ]),
                  const SizedBox(height: 14),
                  SectionCard(
                    judul: 'Data eksekusi',
                    ikon: Icons.content_cut_rounded,
                    aksi: _bolehUbah
                        ? TextButton.icon(
                            onPressed: _edit,
                            style: TextButton.styleFrom(
                              visualDensity: VisualDensity.compact,
                              padding: const EdgeInsets.symmetric(horizontal: 10),
                            ),
                            icon: const Icon(Icons.edit_outlined, size: 16),
                            label: const Text('Edit'),
                          )
                        : null,
                    children: [
                      Row(children: [
                        const SizedBox(width: 130, child: Text('Status', style: TextStyle(fontSize: 12.5, color: AppColors.neutral500))),
                        e.aktif ? StatusBadge.sinkron(e.sinkron) : const StatusBadge('BATAL', warna: AppColors.red700, latar: AppColors.red100),
                      ]),
                      _baris('Jenis', e.jenisNama),
                      _baris('Diameter', e.diameter == null ? null : '${e.diameter} cm'),
                      _baris('Section', e.section),
                      _baris('Nomor Tiang', e.nomorTiang),
                      _baris('Koordinat Tiang', e.koordinatTiang),
                      _baris('Koordinat Pekerjaan', e.koordinatPekerjaan),
                      if (e.alasan != null) _baris('Catatan server', e.alasan),
                    ],
                  ),
                ]),
                ),
              ),
        bottomNavigationBar: e == null || !_bolehUbah
            ? null
            : Container(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: AppColors.neutral200))),
                child: SafeArea(
                  top: false,
                  child: SizedBox(
                    height: 50,
                    child: FilledButton.icon(
                      onPressed: _baru.isEmpty || sibuk ? null : _simpan,
                      icon: _proses
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Icon(Icons.save_outlined),
                      label: Text(_proses
                          ? 'Menyimpan...'
                          : _baru.isEmpty
                              ? 'Simpan'
                              : 'Simpan ${_baru.length} foto'),
                    ),
                  ),
                ),
              ),
      ),
    );
  }
}
