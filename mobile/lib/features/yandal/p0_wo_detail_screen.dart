import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/foto_slot.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/refresh_sisi.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/sisi_widgets.dart';
import '../../widgets/wa_panel.dart';
import '../hartek/hartek_lokal.dart';
import '../row/foto_repository.dart' show FotoRepository;
import '../row/row_repository.dart' show RowError;
import '../wo/wo_bantu.dart';
import 'approval_p0_repository.dart' show ItemApprovalP0, labelStatusApproval;
import 'p0_model.dart';
import 'pekerjaan_shift_view.dart' show warnaSelesai, latarSelesai;

/// v1.0.31 (permintaan Master Guswan 24 Okt 2026): detail P0 dari WO Tindak Lanjut, tampilan sama dengan P0 lokal (status +
/// durasi, Data P0, foto Sebelum / Pekerjaan / Sesudah, Download Foto P0, Kirim WA). Data dan foto dari yan_P0
/// (getP0WoYandal / getFotoP0WoYandal); foto yang masih ada di HP dipakai langsung. Belum tercatat server / tanpa
/// sinyal = data WO di HP. Hanya baca: P0 ini dibuat server saat WO Selesai.
class P0WoDetailScreen extends StatefulWidget {
  const P0WoDetailScreen({super.key, required this.deps, required this.sesi, required this.p});
  final Deps deps;
  final Sesi sesi;

  /// Pekerjaan WO + 'temuan' (WoLokal.p0Shift).
  final Map<String, dynamic> p;

  @override
  State<P0WoDetailScreen> createState() => _P0WoDetailScreenState();
}

class _P0WoDetailScreenState extends State<P0WoDetailScreen> {
  static const String albumP0 = 'SiSi Yandal';

  ItemApprovalP0? _srv;
  bool _memuat = true;
  String? _info;
  bool _unduh = false;
  String? _membuka; // slot yang sedang diunduh untuk dilihat

  /// Foto WO yang masih ada di HP (slot -> path).
  late final Map<String, String> _hp = {
    for (final e in HartekLokal.fotoDiHp(widget.p).entries)
      if (File(e.value).existsSync()) e.key: e.value,
  };

  /// Thumbnail foto server (slot -> file sementara).
  final Map<String, String> _kecil = {};

  Map<String, dynamic> get _t => petaWo(widget.p['temuan']);
  String get _tlId => teksWo(widget.p['tlId']);

  @override
  void initState() {
    super.initState();
    unawaited(_muat());
  }

  Future<void> _muat() async {
    try {
      final d = await widget.deps.api.call('getP0WoYandal', token: widget.sesi.token, data: const {});
      final l = [
        for (final x in (d['list'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) ItemApprovalP0(Map<String, dynamic>.from(x)),
      ];
      final s = l.where((x) => x.tlId == _tlId).firstOrNull;
      if (!mounted) return;
      setState(() {
        _srv = s;
        _info = s == null ? 'Belum tercatat di server. Data di bawah dari HP.' : null;
      });
      if (s != null) unawaited(_muatKecil(s));
    } on ApiException catch (e) {
      if (mounted) setState(() => _info = KodeError.pesan(e.kode));
    } catch (_) {
      if (mounted) setState(() => _info = 'Tidak ada sinyal. Menampilkan data di HP.');
    } finally {
      if (mounted) setState(() => _memuat = false);
    }
  }

  /// Refresh: kirim yang tertunda, lalu baca ulang dari server.
  Future<void> _segarkan() async {
    await widget.deps.syncCtl.sinkron();
    await _muat();
  }

  Future<String> _fileServer(String p0Id, String slot, String ukuran) async {
    final dir = Directory(p.join((await getTemporaryDirectory()).path, 'p0_wo'));
    await dir.create(recursive: true);
    final f = File(p.join(dir.path, '${p0Id}_${slot}_$ukuran.jpg'));
    if (await f.exists() && await f.length() > 0) return f.path;
    final d = await widget.deps.api.call('getFotoP0WoYandal',
        token: widget.sesi.token,
        data: {'p0Id': p0Id, 'slot': slot, 'ukuran': ukuran},
        timeout: Duration(seconds: ukuran == 'PENUH' ? 90 : 60));
    await f.writeAsBytes(base64Decode('${d['data'] ?? ''}'), flush: true);
    return f.path;
  }

  Future<void> _muatKecil(ItemApprovalP0 s) async {
    for (final slot in s.foto) {
      if (_hp.containsKey(slot) || _kecil.containsKey(slot)) continue;
      try {
        final path = await _fileServer(s.p0Id, slot, 'KECIL');
        if (mounted) setState(() => _kecil[slot] = path);
      } catch (_) {
        return; // sinyal putus: dicoba lagi saat refresh
      }
    }
  }

  bool _adaFoto(String slot) => _hp.containsKey(slot) || (_srv?.foto.contains(slot) ?? false);

  Future<void> _lihat(String slot) async {
    if (_membuka != null) return;
    final hp = _hp[slot];
    if (hp != null) return lihatFoto(context, path: hp, slot: slot, keterangan: _nama);
    final s = _srv;
    if (s == null || !s.foto.contains(slot)) {
      tampilPesan(context, _srv == null && _info != null ? _info! : 'Foto ${labelSlotP0[slot]} tidak ada.');
      return;
    }
    setState(() => _membuka = slot);
    try {
      final path = await _fileServer(s.p0Id, slot, 'PENUH');
      if (mounted) await lihatFoto(context, path: path, slot: slot, keterangan: _nama);
    } on ApiException catch (e) {
      if (mounted) tampilPesan(context, KodeError.pesan(e.kode));
    } catch (_) {
      if (mounted) tampilPesan(context, 'Foto gagal dimuat. Periksa sinyal.');
    } finally {
      if (mounted) setState(() => _membuka = null);
    }
  }

  /// Download Foto P0: Sebelum / Pekerjaan / Sesudah ke galeri (album SiSi Yandal), nama file = kode P0 + slot.
  Future<void> _download() async {
    if (_unduh) return;
    setState(() => _unduh = true);
    try {
      if (!await FotoRepository.izinGaleri()) {
        if (mounted) tampilPesan(context, 'Izin galeri ditolak. Izinkan di Pengaturan HP.');
        return;
      }
      final s = _srv;
      var n = 0;
      for (final slot in slotP0) {
        var path = _hp[slot];
        if (path == null && s != null && s.foto.contains(slot)) path = await _fileServer(s.p0Id, slot, 'PENUH');
        if (path == null) continue;
        await FotoRepository.keGaleri(path, nama: '${_kode.isEmpty ? 'P0-WO' : _kode}_$slot', album: albumP0);
        n++;
      }
      if (!mounted) return;
      if (n > 0) {
        unawaited(tampilPopupBerhasil(context, judul: 'Foto berhasil didownload', keterangan: '$n foto tersimpan di galeri\nalbum $albumP0'));
      } else {
        tampilPesan(context, 'Belum ada foto.');
      }
    } on RowError catch (e) {
      if (mounted) tampilPesan(context, e.pesan);
    } on ApiException catch (e) {
      if (mounted) tampilPesan(context, KodeError.pesan(e.kode));
    } catch (_) {
      if (mounted) tampilPesan(context, 'Foto gagal disimpan ke galeri.');
    } finally {
      if (mounted) setState(() => _unduh = false);
    }
  }

  Future<void> _wa() => kirimWa(
      context,
      teksWaPenugasanP0(
          pekerjaan: _nama, penyulang: _penyulang, section: _section, daerah: _srv?.daerah ?? '', petugas: widget.sesi.petugasShift));

  // ---------- nilai tampil (server, cadangan data WO di HP) ----------

  String _isi(String? server, Object? hp) => (server ?? '').trim().isNotEmpty ? server!.trim() : teksWo(hp);

  String get _nama {
    final s = _srv;
    if (s != null) return s.lainLain && s.pekerjaanLainnya.isNotEmpty ? s.pekerjaanLainnya : s.namaPekerjaan;
    final lain = teksWo(widget.p['pekerjaanLainnya']);
    return lain.isNotEmpty ? lain : teksWo(widget.p['pekerjaan']);
  }

  String get _kode => _isi(_srv?.kodeP0, widget.p['kodeRealisasiModul']);
  String get _penyulang => _isi(_srv?.penyulang, _t['penyulang']);
  String get _section => _isi(_srv?.section, _t['section']);

  static String _jam(String w) => w.length >= 16 ? w.substring(11, 16) : w;

  IsiSlot _isiSlot(String s) {
    final path = _hp[s] ?? _kecil[s];
    if (!_adaFoto(s)) return const IsiSlot(label: 'Kosong', warnaLabel: AppColors.neutral500);
    return IsiSlot(path: path, label: path == null ? 'Di server' : 'Disimpan', warnaLabel: AppColors.success700, ikon: Icons.lock_rounded);
  }

  @override
  Widget build(BuildContext context) {
    final s = _srv;
    final durasi = s?.durasi;
    final jarak = s?.jarakClosing;
    final status = s == null
        ? 'Menunggu tercatat di server'
        : 'Verifikasi: ${labelStatusApproval[s.status] ?? s.status}${s.alasanRejected.isEmpty ? '' : ' (${s.alasanRejected})'}';
    Widget baris(String k, String v) => Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 120, child: Text(k, style: const TextStyle(fontSize: 12.5, color: AppColors.neutral500))),
            Expanded(child: Text(v.isEmpty ? '-' : v, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.navy900))),
          ]),
        );
    final waktuFoto = {'SEBELUM': s?.waktuSebelum ?? '', 'PEKERJAAN': s?.waktuPekerjaan ?? '', 'SESUDAH': s?.waktuSesudah ?? ''};
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar(_kode.isEmpty ? 'P0 dari WO' : _kode, subjudul: _nama, actions: [
        TombolSegarkan(sibuk: _memuat, onPressed: _segarkan),
      ]),
      body: RefreshSisi(
        onRefresh: _segarkan,
        child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 16, 16, 40), children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: latarSelesai, borderRadius: BorderRadius.circular(16)),
            child: Row(children: [
              const Icon(Icons.task_alt_rounded, color: warnaSelesai, size: 30),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Sudah dikerjakan', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: warnaSelesai)),
                  Text(status, style: const TextStyle(fontSize: 12, color: AppColors.neutral700)),
                ]),
              ),
              if (durasi != null) Text(teksMenit(durasi), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: warnaSelesai)),
            ]),
          ),
          if (_info != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(12)),
              child: Row(children: [
                const Icon(Icons.info_outline_rounded, size: 18, color: AppColors.accent700),
                const SizedBox(width: 8),
                Expanded(child: Text(_info!, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.neutral900))),
              ]),
            ),
          ],
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral200)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Data P0', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy900)),
              const SizedBox(height: 8),
              baris('Kode P0', _kode.isEmpty ? 'Menunggu kode dari server' : _kode),
              if (s != null) baris('Status server', status.replaceFirst('Verifikasi: ', '')),
              baris('Pekerjaan', _nama),
              baris('Penyulang', _penyulang),
              baris('Section', _section),
              baris('Daerah', s?.daerah ?? ''),
              baris('Temuan WO', [teksWo(_t['kodeTemuan']), teksWo(_t['jenisTemuan'])].where((v) => v.isNotEmpty).join(' · ')),
              baris('Dibuat', _jam(s?.waktuDibuat ?? '')),
              for (final sl in slotP0)
                if ((waktuFoto[sl] ?? '').isNotEmpty) baris('Foto ${labelSlotP0[sl]}', _jam(waktuFoto[sl]!)),
              baris('Koordinat pekerjaan', _isi(s?.koordinat, widget.p['koordinat'])),
              baris('Koordinat closing', s?.koordinatClosing ?? ''),
              baris('Jarak pekerjaan - closing', jarak == null ? '' : teksJarak(jarak / 1000)),
              baris('Durasi', durasi == null ? '' : teksMenit(durasi)),
              if (_isi(s?.catatan, widget.p['catatan']).isNotEmpty) baris('Catatan', _isi(s?.catatan, widget.p['catatan'])),
            ]),
          ),
          const SizedBox(height: 16),
          const Text('Foto pekerjaan', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy900)),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral200)),
            child: Stack(children: [
              FotoSlotRow(
                isi: {for (final sl in slotP0) sl: _isiSlot(sl)},
                onPilih: (sl) => unawaited(_lihat(sl)),
                lengkapDiServer: true,
              ),
              if (_membuka != null) const Positioned.fill(child: Center(child: SisiLoader())),
            ]),
          ),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _unduh || !slotP0.any(_adaFoto) ? null : () => unawaited(_download()),
                style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12)),
                icon: _unduh ? const SisiLoader(ukuran: 16) : const Icon(Icons.download_rounded, size: 18),
                label: const Text('Download Foto P0', maxLines: 2, textAlign: TextAlign.center, style: TextStyle(fontSize: 13)),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.tonalIcon(
                onPressed: () => unawaited(_wa()),
                icon: const Icon(Icons.send_rounded, size: 18),
                label: const Text('Kirim WA'),
              ),
            ),
          ]),
        ]),
      ),
    );
  }
}
