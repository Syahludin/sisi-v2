import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/foto_slot.dart';
import '../../widgets/sisi_widgets.dart';
import 'arsip_ba.dart';
import 'daftar_ba_screen.dart';
import 'gardu_model.dart';
import 'gardu_widgets.dart';
import '../../widgets/sisi_loader.dart';

/// v0.86.0: boleh membuka Daftar BA (+ arsip v1) = menu Berita Acara + admin BA (sama dengan server).
bool bolehLihatBa(Sesi s) => s.aksiMenu('OPS_BA_GARDU') != null && (s.role == 'ADMIN' || s.role == 'SUPER');

/// v0.86.0 (keputusan kvlar 13 Okt 2026): lembar BA lama dari arsip v1, BACA SAJA (satu halaman dengan BA v2 di Daftar BA).
/// Lihat PDF / BA TTD lama lewat server, salin link Drive, [onCari] = tampilkan semua BA peralatan ini (tracking).
Future<void> tampilArsipBa(BuildContext context, {required Deps deps, required Sesi sesi, required ItemArsipBa b, ValueChanged<String>? onCari}) {
  final repo = ArsipBaRepository(deps.api);

  Future<void> buka({required bool ttd}) async {
    unawaited(showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const PopScope(
        canPop: false,
        child: AlertDialog(content: Row(children: [SisiLoader(), SizedBox(width: 16), Expanded(child: Text('Mengunduh dari arsip...'))])),
      ),
    ));
    String? path, galat;
    try {
      final f = await repo.file(sesi, b.arsipId, ttd: ttd);
      final dir = Directory(p.join((await getTemporaryDirectory()).path, 'ba_arsip'));
      await dir.create(recursive: true);
      final ext = f.mime == 'application/pdf' ? '.pdf' : (f.mime == 'image/png' ? '.png' : '.jpg');
      final dasar = (f.namaFile.isEmpty ? '${ttd ? 'BA-TTD' : 'BA'}-${b.idBa.isEmpty ? b.nama : b.idBa}' : p.basenameWithoutExtension(f.namaFile))
          .replaceAll(RegExp(r'[^A-Za-z0-9_.-]'), '_');
      final file = File(p.join(dir.path, '$dasar$ext'));
      await file.writeAsBytes(f.bytes, flush: true);
      path = file.path;
    } on ApiException catch (e) {
      galat = KodeError.pesan(e.kode);
    } catch (_) {
      galat = 'Gagal terhubung. Coba lagi.';
    }
    if (!context.mounted) return;
    Navigator.of(context, rootNavigator: true).pop();
    if (path == null) {
      tampilPesan(context, galat ?? 'File tidak bisa dibuka.');
      return;
    }
    final lokal = path;
    final judul = '${b.nama.isEmpty ? 'BA' : b.nama} · ${ttd ? 'BA TTD' : 'PDF'} (arsip v1)';
    if (lokal.endsWith('.pdf')) {
      await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => PdfBaScreen(path: lokal, judul: judul, namaFile: p.basename(lokal))));
    } else {
      await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => LihatFotoScreen(path: lokal, judul: judul, keterangan: b.nomor)));
    }
  }

  Future<void> salin(String link, String apa) async {
    await Clipboard.setData(ClipboardData(text: link));
    if (context.mounted) tampilPesan(context, 'Link $apa disalin. Hanya bisa dibuka akun yang punya akses Drive.');
  }

  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    backgroundColor: const Color(0xFFF6F8FC),
    builder: (c) => ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.of(c).size.height * .88),
      child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 28), children: [
        Row(children: [
          Expanded(child: Text(b.nomor, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w900, color: AppColors.navy900))),
          badgeTahapBa(b.tahap),
        ]),
        const SizedBox(height: 6),
        Row(children: [
          const BadgeArsipBa(),
          const SizedBox(width: 8),
          Expanded(
            child: Text(b.jenis.isEmpty ? 'Jenis tidak tercatat' : b.jenis,
                style: const TextStyle(fontSize: 12, color: AppColors.neutral700, fontWeight: FontWeight.w700)),
          ),
        ]),
        const SizedBox(height: 12),
        _KotakData([
          (b.switching ? 'Switching' : 'No Gardu', b.nama),
          if (b.switching) ('Jenis Switching', b.jenisSwitching),
          ('Tanggal BA', b.tanggalBa.isEmpty ? '' : tanggalPendek(b.tanggalBa)),
          ('ID BA', b.idBa),
          ('No BA', b.noBaFull),
          ('Penyulang', b.penyulang),
          ('Section', b.section),
          if (!b.switching) ('Alamat', b.alamat),
          if (!b.switching) ('Kapasitas', b.kva == null ? '' : '${angkaId(b.kva!.toDouble())} kVA'),
          ('Status PDF v1', b.statusPdf),
          ('Waktu PDF', b.waktuPdf),
          ('Sumber', b.sumber),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(
            child: FilledButton.icon(
              onPressed: b.adaPdf
                  ? () {
                      Navigator.pop(c);
                      unawaited(buka(ttd: false));
                    }
                  : null,
              icon: const Icon(Icons.picture_as_pdf_rounded),
              label: const Text('Lihat PDF'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: AppColors.success700),
              onPressed: b.adaTtd
                  ? () {
                      Navigator.pop(c);
                      unawaited(buka(ttd: true));
                    }
                  : null,
              icon: const Icon(Icons.verified_rounded),
              label: const Text('BA TTD'),
            ),
          ),
        ]),
        if (!b.adaPdf || !b.adaTtd)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text([if (!b.adaPdf) 'PDF tidak tercatat di v1', if (!b.adaTtd) 'BA TTD belum diupload di v1'].join(' · '),
                style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
          ),
        const SizedBox(height: 6),
        Wrap(spacing: 8, children: [
          if (b.linkPdf.isNotEmpty)
            TextButton.icon(onPressed: () => unawaited(salin(b.linkPdf, 'PDF')), icon: const Icon(Icons.link_rounded, size: 18), label: const Text('Salin link PDF')),
          if (b.linkTtd.isNotEmpty)
            TextButton.icon(onPressed: () => unawaited(salin(b.linkTtd, 'BA TTD')), icon: const Icon(Icons.link_rounded, size: 18), label: const Text('Salin link TTD')),
          if (onCari != null && b.nama.isNotEmpty)
            TextButton.icon(
              onPressed: () {
                Navigator.pop(c);
                onCari(b.nama);
              },
              icon: const Icon(Icons.timeline_rounded, size: 18),
              label: Text('Semua BA ${b.nama}'),
            ),
        ]),
        const SizedBox(height: 4),
        const Text('BA lama hanya untuk dilihat: tidak bisa diedit, dibuat ulang PDF-nya, atau dikirim EAM.',
            style: TextStyle(fontSize: 11, color: AppColors.neutral500)),
      ]),
    ),
  );
}

/// Label kecil "ARSIP V1" (kartu + lembar).
class BadgeArsipBa extends StatelessWidget {
  const BadgeArsipBa({super.key});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        decoration: BoxDecoration(color: AppColors.neutral150, borderRadius: BorderRadius.circular(99)),
        child: const Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.inventory_2_outlined, size: 12, color: AppColors.neutral700),
          SizedBox(width: 3),
          Text('ARSIP V1', style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w900, letterSpacing: .4, color: AppColors.neutral700)),
        ]),
      );
}

class _KotakData extends StatelessWidget {
  const _KotakData(this.baris);
  final List<(String, String)> baris;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral200)),
        child: Column(children: [
          for (final b in baris)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(width: 110, child: Text(b.$1, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500))),
                Expanded(
                  child: Text(b.$2.isEmpty ? '-' : b.$2, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.navy900)),
                ),
              ]),
            ),
        ]),
      );
}
