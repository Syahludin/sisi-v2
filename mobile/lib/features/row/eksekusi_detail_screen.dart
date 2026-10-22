import 'dart:async';

import 'package:flutter/material.dart';

import '../../widgets/sisi_loader.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/foto_slot.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/sisi_widgets.dart';
import 'batal_row.dart';
import 'foto_repository.dart';
import 'form_eksekusi_screen.dart';
import 'kamera_screen.dart';
import 'perbaikan_repository.dart';
import 'row_model.dart';
import 'row_repository.dart';
import 'watermark.dart';

/// Detail eksekusi + foto. Foto Pekerjaan / Sesudah biasanya menyusul dari sini.
/// v0.65.6 (keputusan kvlar 8 Okt 2026): foto kamera diverifikasi di review kamera, tombol Simpan Foto di kamera langsung
/// menyimpan ke HP (offline pun bisa); foto galeri langsung disimpan sesudah dipilih. Tidak ada lagi tombol Simpan di
/// halaman ini. Terkirim otomatis saat online. Edit = ubah data pekerjaan. Download ulang = tarik foto dari server.
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
  bool _menyegarkan = false;
  bool _proses = false;
  ({int selesai, int total, String? slot})? _unduh;
  bool _bisaUrungkan = false;

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
    final u = e != null && !e.aktif && await widget.deps.perbaikan.bisaUrungkan(widget.sesi.userId, 'eksekusi', e.id);
    if (!mounted) return;
    setState(() {
      _bisaUrungkan = u;
      _e = e;
      _foto = f;
    });
  }

  /// Refresh (v0.49): sinkron (kirim tertunda + tarik kode/status), lalu muat ulang dari HP.
  Future<void> _segarkan() async {
    if (_menyegarkan) return;
    setState(() => _menyegarkan = true);
    final ctl = widget.deps.syncCtl;
    try {
      await ctl.sinkron();
      await _muat();
      if (mounted) {
        tampilPesan(context, ctl.online == false ? 'Tidak ada sinyal. Menampilkan data di HP.' : 'Detail eksekusi diperbarui.');
      }
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

  Future<void> _batal() async {
    final e = _e;
    if (e == null) return;
    final hapus = await batalkanRow(context, widget.deps, widget.sesi, jenis: 'eksekusi', id: e.id, label: 'eksekusi ini');
    if (!mounted || hapus == null) return;
    if (hapus) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Navigator.pop(context);
      });
      return;
    }
    await _muat();
  }

  Future<void> _urungkan() async {
    await urungkanBatalRow(context, widget.deps, widget.sesi, jenis: 'eksekusi', id: widget.eksekusiId);
    await _muat();
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
    final lokal = _foto[slot];
    final path = lokal?.path;
    final ket = _ketStatus[lokal?.status];
    final namaGaleri = lokal != null ? '${_e?.kode ?? widget.eksekusiId}_$slot' : null;
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
    ), pathAda: pathAda, keterangan: keterangan, namaGaleri: namaGaleri,
        // v0.65.6: kamera = disimpan dari review kamera (gagal = pesan di kamera, tetap di review)
        simpan: (foto) => _simpanKe(slot, foto));
    if (f == null || !mounted) return;
    if (f.sumber != 'KAMERA') {
      // galeri: tanpa review kamera, langsung disimpan sesudah dipilih
      setState(() => _proses = true);
      try {
        await _simpanKe(slot, f);
      } on RowError catch (x) {
        if (mounted) tampilPesan(context, '${FotoRepository.label[slot]}: ${x.pesan}');
        return;
      } catch (_) {
        if (mounted) tampilPesan(context, '${FotoRepository.label[slot]}: gagal disimpan');
        return;
      } finally {
        if (mounted) setState(() => _proses = false);
      }
    }
    await _muat();
    if (!mounted) return;
    tampilPesan(context, widget.deps.syncCtl.online == true
        ? 'Foto ${FotoRepository.label[slot]} tersimpan di HP, sedang dikirim.'
        : 'Foto ${FotoRepository.label[slot]} tersimpan di HP. Terkirim otomatis saat online.');
    unawaited(widget.deps.syncCtl.sinkron());
  }

  /// Simpan satu foto ke HP (watermark + antre kirim). Foto lama di slot itu diganti.
  Future<void> _simpanKe(String slot, FotoBaru foto) =>
      widget.deps.foto.simpan(widget.sesi, eksekusiId: widget.eksekusiId, slotFoto: slot, foto: foto);

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
        if (h.unduh == 0) {
          tampilPesan(context, 'Belum ada foto di server.');
        } else {
          unawaited(tampilPopupBerhasil(context,
              judul: 'Foto berhasil didownload',
              keterangan: !galeri
                  ? '${h.unduh} foto tersimpan di app\nIzin galeri ditolak, foto tidak masuk galeri'
                  : '${h.unduh} foto diunduh, ${h.galeri} masuk galeri\nalbum ${FotoRepository.albumGaleri}'));
        }
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
    };
    return PopScope(
      canPop: !_proses, // v0.65.6: jangan keluar selagi foto galeri disimpan
      child: Scaffold(
        backgroundColor: const Color(0xFFF8FAFC),
        appBar: sisiAppBar('Detail Eksekusi', subjudul: e?.kode, actions: [
          TombolSegarkan(sibuk: _menyegarkan || sibuk || widget.deps.syncCtl.sedangSync, onPressed: _segarkan),
          MenuDataRow(
              labelBatal: 'Batalkan eksekusi',
              bisaBatal: !sibuk && _bolehUbah && e != null && PerbaikanRepository.dalamBatas(e.kode),
              bisaUrungkan: !sibuk && _bisaUrungkan,
              onBatal: _batal,
              onUrungkan: _urungkan),
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
                    if (_proses) const Padding(padding: EdgeInsets.only(top: 10), child: Center(child: SisiLoader(ukuran: 28))),
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
                      e.fotoLengkap
                          ? 'Foto lengkap di server, eksekusi ini masuk laporan WA.'
                          : 'Dapat dikerjakan secara bertahap. Kamera: posisi HP mendatar (landscape), foto dicek & disimpan di layar review kamera.',
                      style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500),
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
                      if (e.alasan != null) _baris('Keterangan', KodeError.alasanSinkron(e.alasan)),
                    ],
                  ),
                ]),
                ),
              ),
      ),
    );
  }
}
