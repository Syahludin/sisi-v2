import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/api_client.dart';
import '../../theme/app_colors.dart';
import '../../widgets/foto_slot.dart' show lihatFoto;
import '../hartek/hartek_gaya.dart';
import 'wo_bantu.dart';
import '../../widgets/sisi_loader.dart';

/// Panggil endpoint foto WO (getFotoWoAdmin / getFotoWoTim) dengan {temuanId, tlId?, slot, ukuran}. Hasil = respons server.
typedef MuatFotoWo = Future<Map<String, dynamic>> Function(Map<String, dynamic> data, {Duration? timeout});

/// v1.0.15: foto WO di Drive privat dibaca lewat server. Thumbnail di memori (per sesi aplikasi), foto penuh di folder
/// sementara. Dipakai Penerusan WO (admin) dan WO Tim; sebelumnya kedua layar hanya menampilkan ikon awan.
class FotoServerWo {
  FotoServerWo._();

  static final Map<String, Uint8List> _kecil = {};

  static String _kunci(Map<String, dynamic> data) => '${data['temuanId']}|${data['tlId'] ?? ''}|${data['slot']}';

  /// v1.0.17: thumbnail juga disimpan di HP (folder dukungan app) supaya foto temuan tetap tampil di kartu WO saat
  /// offline (petugas melihat foto temuan di lapangan sebelum mulai). Gagal tulis / baca disk = memori saja.
  static Future<File?> _fileKecil(String k) async {
    try {
      final dir = Directory(p.join((await getApplicationSupportDirectory()).path, 'wo_thumb'));
      await dir.create(recursive: true);
      return File(p.join(dir.path, '${k.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_')}.jpg'));
    } catch (_) {
      return null;
    }
  }

  static Future<Uint8List> kecil(MuatFotoWo muat, Map<String, dynamic> data) async {
    final k = _kunci(data);
    final ada = _kecil[k];
    if (ada != null) return ada;
    final f = await _fileKecil(k);
    try {
      if (f != null && await f.exists() && await f.length() > 0) return _simpanMemori(k, await f.readAsBytes());
    } catch (_) {/* berkas rusak: unduh ulang */}
    final d = await muat({...data, 'ukuran': 'KECIL'});
    final b = base64Decode('${d['data'] ?? ''}');
    try {
      await f?.writeAsBytes(b, flush: true);
    } catch (_) {}
    return _simpanMemori(k, b);
  }

  static Uint8List _simpanMemori(String k, Uint8List b) {
    if (_kecil.length > 300) _kecil.remove(_kecil.keys.first);
    _kecil[k] = b;
    return b;
  }

  /// v1.0.17: unduh thumbnail foto temuan semua WO di daftar selagi ada sinyal (berurutan, galat diabaikan), supaya
  /// kartu WO tetap menampilkan foto saat offline.
  static Future<void> praMuat(MuatFotoWo muat, Iterable<Map<String, dynamic>> data) async {
    for (final x in data) {
      try {
        await kecil(muat, x);
      } catch (_) {
        return; // sinyal putus: berhenti, dicoba lagi saat segarkan berikutnya
      }
    }
  }

  /// Foto penuh disimpan di folder sementara. Hasil: path file.
  static Future<String> penuh(MuatFotoWo muat, Map<String, dynamic> data) async {
    final dir = Directory(p.join((await getTemporaryDirectory()).path, 'wo_foto'));
    await dir.create(recursive: true);
    final file = File(p.join(dir.path, '${_kunci(data).replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_')}.jpg'));
    if (await file.exists() && await file.length() > 0) return file.path;
    final d = await muat({...data, 'ukuran': 'PENUH'}, timeout: const Duration(seconds: 90));
    await file.writeAsBytes(base64Decode('${d['data'] ?? ''}'), flush: true);
    return file.path;
  }

  /// v1.0.28: penampil foto sedang dibuka / foto penuh sedang diunduh; ketukan berulang diabaikan.
  static bool _membuka = false;

  /// Unduh foto penuh lalu buka penampil foto. Galat = pesan di snackbar.
  /// v1.0.28 (permintaan kvlar 23 Okt 2026): sekali buka; ketukan lain selama unduh / tampil diabaikan.
  static Future<void> lihat(BuildContext context, MuatFotoWo muat, Map<String, dynamic> data, String label) async {
    if (_membuka) return;
    _membuka = true;
    try {
      final path = await penuh(muat, data);
      if (!context.mounted) return;
      await lihatFoto(context, path: path, slot: label);
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(pesanWo(e.kode))));
    } catch (_) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Foto gagal dimuat. Periksa sinyal.')));
    } finally {
      _membuka = false;
    }
  }
}

/// Thumbnail foto server (tanpa ketukan; pembungkus yang menangani ketuk). Gagal = tombol muat ulang.
class GambarServerWo extends StatefulWidget {
  const GambarServerWo({super.key, required this.muat, required this.data});
  final MuatFotoWo muat;

  /// {temuanId, tlId?, slot}
  final Map<String, dynamic> data;

  @override
  State<GambarServerWo> createState() => _GambarServerWoState();
}

class _GambarServerWoState extends State<GambarServerWo> {
  late Future<Uint8List> _thumb = FotoServerWo.kecil(widget.muat, widget.data);

  @override
  Widget build(BuildContext context) => FutureBuilder<Uint8List>(
        future: _thumb,
        builder: (context, s) {
          if (s.hasData) return Image.memory(s.data!, fit: BoxFit.cover, gaplessPlayback: true);
          if (s.hasError) {
            return Center(
              child: IconButton(
                tooltip: 'Muat ulang foto',
                onPressed: () => setState(() => _thumb = FotoServerWo.kecil(widget.muat, widget.data)),
                icon: const Icon(Icons.refresh_rounded, color: AppColors.neutral500),
              ),
            );
          }
          return const Center(child: SisiLoader(ukuran: 18));
        },
      );
}

/// Foto temuan + foto tiang / gardu satu temuan: dua kotak 4:3, ketuk = foto penuh.
class FotoTemuanWo extends StatelessWidget {
  const FotoTemuanWo({super.key, required this.t, required this.muat});
  final Map<String, dynamic> t;
  final MuatFotoWo muat;

  static const slot = ['TEMUAN', 'TIANG'];
  static const label = {'TEMUAN': 'Foto temuan', 'TIANG': 'Foto tiang / gardu'};

  @override
  Widget build(BuildContext context) {
    final foto = petaWo(t['foto']);
    final id = teksWo(t['temuanId']);
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Row(children: [
        for (var i = 0; i < slot.length; i++) ...[
          if (i > 0) const SizedBox(width: 10),
          Expanded(
            child: _KotakFotoWo(
              key: ValueKey('wo-foto-$id-${slot[i]}'),
              data: {'temuanId': id, 'slot': slot[i]},
              label: label[slot[i]]!,
              ada: teksWo(foto[slot[i]]).isNotEmpty,
              muat: muat,
            ),
          ),
        ],
      ]),
    );
  }
}

class _KotakFotoWo extends StatefulWidget {
  const _KotakFotoWo({super.key, required this.data, required this.label, required this.ada, required this.muat});
  final Map<String, dynamic> data;
  final String label;
  final bool ada;
  final MuatFotoWo muat;

  @override
  State<_KotakFotoWo> createState() => _KotakFotoWoState();
}

class _KotakFotoWoState extends State<_KotakFotoWo> {
  bool _buka = false;

  Future<void> _lihat() async {
    if (!widget.ada || _buka) return;
    setState(() => _buka = true);
    await FotoServerWo.lihat(context, widget.muat, widget.data, widget.label);
    if (mounted) setState(() => _buka = false);
  }

  @override
  Widget build(BuildContext context) {
    final Widget isi = widget.ada
        ? GambarServerWo(muat: widget.muat, data: widget.data)
        : const Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.image_not_supported_outlined, color: AppColors.neutral400),
              SizedBox(height: 4),
              Text('Tidak ada foto', style: TextStyle(fontSize: 11, color: HartekGaya.redup)),
            ]),
          );
    return Semantics(
      button: widget.ada,
      label: '${widget.label}${widget.ada ? '' : ', tidak ada'}',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Material(
          color: AppColors.neutral50,
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: HartekGaya.garis)),
          child: InkWell(
            onTap: widget.ada ? () => unawaited(_lihat()) : null,
            child: AspectRatio(
              aspectRatio: 4 / 3,
              child: Stack(fit: StackFit.expand, children: [
                isi,
                if (widget.ada) const Positioned(right: 6, bottom: 6, child: Icon(Icons.zoom_in_rounded, size: 18, color: Colors.white)),
                if (_buka) const ColoredBox(color: Color(0x66000000), child: Center(child: SisiLoader(warna: Colors.white))),
              ]),
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(widget.label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: HartekGaya.tinta)),
      ]),
    );
  }
}
