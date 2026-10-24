import 'dart:async';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import '../../core/navigasi.dart';
import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/foto_slot.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/sisi_widgets.dart';
import 'ba_antrean.dart';
import 'ba_penggantian_screen.dart';
import 'ba_pengoperasian_screen.dart';
import 'ba_repository.dart';
import 'daftar_ba_screen.dart';
import 'gardu_widgets.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/refresh_sisi.dart';

/// v0.78.0 (permintaan kvlar 10 Okt 2026): Detail BA. Semua fitur satu BA per langkah alur:
/// 1 Dokumen BA (PDF: lihat, download, kirim, buat ulang, edit) > 2 BA TTD (upload / upload ulang, lihat, download)
/// > 3 Kirim EAM (teks format v1 + file TTD terlampir) > 4 Update Master Gardu. Langkah terkunci sampai syaratnya terpenuhi.
class DetailBaScreen extends StatefulWidget {
  const DetailBaScreen({super.key, required this.deps, required this.sesi, required this.ba});
  final Deps deps;
  final Sesi sesi;
  final ItemBa ba;

  @override
  State<DetailBaScreen> createState() => _DetailBaScreenState();
}

const _slotBa = [('NAMEPLATE', 'Nameplate Trafo'), ('FULL_GARDU', 'Foto Full Gardu'), ('NAMEPLATE_PHB', 'Nameplate PHB-TR'), ('BOX_PHB', 'Box PHB-TR')];
const _slotBaGanti = [
  ('NAMEPLATE', 'Nameplate Trafo Sebelum'),
  ('NAMEPLATE_SESUDAH', 'Nameplate Trafo Sesudah'),
  ('FULL_GARDU', 'Konstruksi Trafo Sebelum'),
  ('FULL_GARDU_SESUDAH', 'Konstruksi Trafo Sesudah'),
  ('NAMEPLATE_PHB_SESUDAH', 'Nameplate PHB-TR Sesudah'),
  ('BOX_PHB_SESUDAH', 'Box PHB-TR Sesudah'),
];

class _DetailBaScreenState extends State<DetailBaScreen> {
  late final BaRepository _repo = BaRepository(widget.deps.api);
  late ItemBa _b = widget.ba;
  Map<String, dynamic>? _d;
  final Map<String, Future<Uint8List>> _fotoKecil = {};
  String? _galat;
  String? _sibuk; // teks proses yang sedang jalan
  bool _berubah = false;
  StreamSubscription<HasilTugasBa>? _dengar;

  @override
  void initState() {
    super.initState();
    AntreanBa.i.addListener(_ulangAntre);
    _dengar = AntreanBa.i.selesai.listen((h) {
      if (!mounted || h.baId != _b.baId) return;
      _berubah = true;
      if (h.berhasil) {
        unawaited(tampilPopupBerhasil(context, judul: 'BA berhasil dibuat', keterangan: h.judul));
      } else {
        tampilPesan(context, h.pesan);
      }
      unawaited(_muat());
    });
    unawaited(_muat());
  }

  void _ulangAntre() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    AntreanBa.i.removeListener(_ulangAntre);
    unawaited(_dengar?.cancel());
    super.dispose();
  }

  List<(String, String)> _daftarSlotFoto(Map<String, dynamic> d) {
    final ada = (d['foto'] as List<dynamic>? ?? const <dynamic>[]).map((e) => '$e').toSet();
    final dasar = _b.jenis == 'Penggantian Trafo' ? _slotBaGanti : _slotBa;
    return [for (final s in dasar) if (ada.isEmpty && _b.jenis != 'Penggantian Trafo' ? true : ada.contains(s.$1)) s];
  }

  Future<Uint8List> _ambilFotoKecil(String slot) =>
      _fotoKecil.putIfAbsent(slot, () => _repo.foto(widget.sesi, _b.baId, slot, penuh: false));

  Future<void> _muat() async {
    if (_b.batal) {
      setState(() => _galat = 'BA ini BATAL. Data tidak bisa diubah.');
      return;
    }
    setState(() => _galat = null);
    try {
      final d = await _repo.detail(widget.sesi, _b.baId);
      if (!mounted) return;
      setState(() {
        _fotoKecil.clear();
        _d = d;
        _b = _b.denganInfo(d);
        for (final s in _daftarSlotFoto(d)) {
          _ambilFotoKecil(s.$1);
        }
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = KodeError.pesan(e.kode));
    } catch (_) {
      if (mounted) setState(() => _galat = 'Gagal terhubung. Detail BA butuh internet.');
    }
  }

  Future<T?> _jalan<T>(String teks, Future<T> Function() f) async {
    setState(() => _sibuk = teks);
    try {
      return await f();
    } on ApiException catch (e) {
      if (mounted) tampilPesan(context, KodeError.pesan(e.kode));
    } on StateError catch (e) {
      if (mounted) tampilPesan(context, e.message);
    } catch (_) {
      if (mounted) tampilPesan(context, 'Gagal terhubung. Cek sinyal lalu coba lagi.');
    } finally {
      if (mounted) setState(() => _sibuk = null);
    }
    return null;
  }

  // ---------- 1. Dokumen BA ----------
  Future<String?> _pdf() => _jalan('Mengunduh PDF...', () => pdfLokalBa(_repo, widget.sesi, _b));

  Future<void> _lihatPdf() async {
    final path = await _pdf();
    if (path == null || !mounted) return;
    await Navigator.of(context, rootNavigator: true).push(MaterialPageRoute<void>(builder: (_) => PdfBaScreen(path: path, judul: '${_b.noGardu} · BA', namaFile: namaPdfBa(_b))));
  }

  Future<void> _downloadPdf() async {
    final path = await _pdf();
    if (path == null || !mounted) return;
    final t = await simpanFileKeDownload(path, namaPdfBa(_b));
    if (!mounted) return;
    if (t != null) {
      unawaited(tampilPopupBerhasil(context, judul: 'PDF berhasil didownload', keterangan: 'Download/SiSi/${namaPdfBa(_b)}'));
    } else {
      await bagikanPdf(path, namaPdfBa(_b));
    }
  }

  Future<void> _kirimPdf() async {
    final path = await _pdf();
    if (path != null) await bagikanPdf(path, namaPdfBa(_b));
  }

  Future<void> _buatUlangPdf() async {
    final ok = await _konfirmasi('Buat ulang PDF?',
        'PDF lama diganti PDF baru dari data sekarang.${_b.adaTtd ? '\n\nBA TTD yang sudah diupload jadi tidak berlaku: upload BA TTD baru sesudahnya.' : ''}');
    if (!ok || !mounted) return;
    final h = await buatPdfDenganDialog(context, _repo, widget.sesi, _b.baId);
    if (h == null || !mounted) return;
    setState(() {
      _b = _b.denganPdf(h);
      _berubah = true;
    });
    tampilPesan(context, 'PDF baru siap.');
  }

  Future<void> _edit() async {
    if (AntreanBa.i.adaUntuk(_b.baId)) {
      tampilPesan(context, 'BA ini masih diproses di latar belakang. Tunggu selesai dulu.');
      return;
    }
    final layar = _b.jenis == 'Penggantian Trafo'
        ? BaPenggantianScreen(deps: widget.deps, sesi: widget.sesi, ubahBaId: _b.baId)
        : BaPengoperasianScreen(deps: widget.deps, sesi: widget.sesi, ubahBaId: _b.baId);
    final ok = await bukaForm(context, MaterialPageRoute<bool>(builder: (_) => layar));
    if (ok == true && mounted) {
      setState(() => _berubah = true);
      if (!AntreanBa.i.adaUntuk(_b.baId)) await _muat();
    }
  }

  // ---------- 2. BA TTD ----------
  Future<void> _uploadTtd() async {
    final r = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: const ['pdf']);
    final path = r?.files.single.path;
    if (path == null || !mounted) return;
    final nama = p.basename(path);
    if (!nama.toLowerCase().endsWith('.pdf')) {
      tampilPesan(context, 'File BA TTD harus berformat PDF.');
      return;
    }
    final bytes = await File(path).readAsBytes();
    if (!mounted) return;
    final mime = mimeTtdBa(bytes);
    if (mime != 'application/pdf') {
      tampilPesan(context, 'File BA TTD harus berformat PDF.');
      return;
    }
    if (bytes.length > ttdBaMaksByte) {
      tampilPesan(context, 'File terlalu besar (maks 10 MB).');
      return;
    }
    final data = bytes;
    final h = await _jalan('Mengupload BA TTD...',
        () => _repo.uploadTtd(widget.sesi, baId: _b.baId, bytes: data, mime: mime, namaFile: nama, onProgres: (ke, dari) {
              if (mounted && dari > 1) setState(() => _sibuk = 'Mengupload BA TTD... ${(ke * 100 / dari).round()}%');
            }));
    if (h == null || !mounted) return;
    setState(() {
      _b = _b.denganInfo(h);
      _berubah = true;
    });
    tampilPesan(context, h['ulang'] == true ? 'BA TTD diganti. Kirim EAM & Update Master siap.' : 'BA TTD terupload. Kirim EAM & Update Master siap.');
  }

  Future<String?> _ttdLokal() => _jalan('Mengunduh BA TTD...', () async {
        final t = await _repo.ttd(widget.sesi, _b.baId);
        final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'ba_ttd'));
        await dir.create(recursive: true);
        final f = File(p.join(dir.path, t.namaFile.isEmpty ? 'BA-TTD.pdf' : t.namaFile));
        await f.writeAsBytes(t.bytes, flush: true);
        return f.path;
      });

  Future<void> _lihatTtd() async {
    final path = await _ttdLokal();
    if (path == null || !mounted) return;
    final nama = p.basename(path);
    if (nama.toLowerCase().endsWith('.pdf')) {
      await Navigator.of(context, rootNavigator: true).push(MaterialPageRoute<void>(builder: (_) => PdfBaScreen(path: path, judul: '${_b.noGardu} · BA TTD', namaFile: nama)));
    } else {
      await Navigator.of(context, rootNavigator: true).push(MaterialPageRoute<void>(builder: (_) => LihatFotoScreen(path: path, judul: 'BA TTD', keterangan: _b.noGardu)));
    }
  }

  Future<void> _downloadTtd() async {
    final path = await _ttdLokal();
    if (path == null || !mounted) return;
    final t = await simpanFileKeDownload(path, p.basename(path));
    if (!mounted) return;
    if (t != null) {
      unawaited(tampilPopupBerhasil(context, judul: 'BA TTD berhasil didownload', keterangan: 'Download/SiSi/${p.basename(path)}'));
    } else {
      await Share.shareXFiles([XFile(path)]);
    }
  }

  // ---------- 3. Kirim EAM ----------
  Future<void> _kirimEam() async {
    final path = await _ttdLokal();
    if (path == null || !mounted) return;
    final h = await _jalan('Menyiapkan pesan EAM...', () => _repo.kirimEam(widget.sesi, _b.baId));
    if (h == null || !mounted) return;
    final teks = '${h['teks'] ?? ''}';
    setState(() {
      _b = _b.denganInfo(h);
      _berubah = true;
    });
    await Clipboard.setData(ClipboardData(text: teks));
    if (!mounted) return;
    // v0.80.0: aksesEam 0 = EAM_EMAIL belum diisi, EAM hanya dapat lampiran (belum bisa buka lagi lewat Link BA)
    tampilPesan(context, (h['aksesEam'] as num? ?? 0) > 0
        ? 'Teks EAM disalin. Link BA bisa dibuka lagi oleh akun EAM kapan saja.'
        : 'Teks EAM disalin. Akun EAM belum diatur admin: EAM hanya menerima lampiran.');
    await Share.shareXFiles([XFile(path)], text: teks, subject: 'BA ${_b.noGardu}');
  }

  // ---------- 4. Update Master Gardu ----------
  Future<void> _updateMaster() async {
    final ok = await _konfirmasi('Update Master Gardu?',
        'Data gardu ${_b.noGardu} di Master Gardu diganti dengan isian BA ini (alamat, koordinat, trafo, PHB-TR, OwnerId). Ditolak kalau gardu sudah punya BA lebih baru.');
    if (!ok || !mounted) return;
    final h = await _jalan('Memperbarui Master Gardu...', () => _repo.updateMaster(widget.sesi, _b.baId));
    if (h == null || !mounted) return;
    setState(() {
      _b = _b.denganInfo(h);
      _berubah = true;
    });
    unawaited(widget.deps.gardu.segarkan(widget.sesi).catchError((Object _) => false));
    final diubah = (h['diubah'] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<String, dynamic>>().toList();
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        icon: const Icon(Icons.verified_rounded, color: AppColors.success700, size: 36),
        title: Text(diubah.isEmpty ? 'Master sudah sesuai' : 'Master Gardu diperbarui'),
        content: SizedBox(
          width: double.maxFinite,
          child: diubah.isEmpty
              ? Text('Data ${h['noGarduMaster'] ?? _b.noGardu} di Master Gardu sudah sama dengan BA ini.')
              : ListView(shrinkWrap: true, children: [
                  for (final x in diubah)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${x['kolom']}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.navy700)),
                        Text('${'${x['lama']}'.isEmpty ? '(kosong)' : x['lama']}  >  ${x['baru']}', style: const TextStyle(fontSize: 12)),
                      ]),
                    ),
                ]),
        ),
        actions: [FilledButton(onPressed: () => Navigator.pop(c), child: const Text('OK'))],
      ),
    );
  }

  Future<void> _lihatFoto(String slot, String label) async {
    final path = await _jalan('Memuat foto...', () async {
      final b = await _repo.foto(widget.sesi, _b.baId, slot);
      final f = File('${(await getTemporaryDirectory()).path}/ba_detail_${_b.baId.substring(0, 8)}_$slot.jpg');
      await f.writeAsBytes(b, flush: true);
      return f.path;
    });
    if (path == null || !mounted) return;
    await Navigator.of(context, rootNavigator: true).push(MaterialPageRoute<void>(builder: (_) => LihatFotoScreen(path: path, judul: label, keterangan: _b.noGardu)));
  }

  Future<bool> _konfirmasi(String judul, String isi) async =>
      await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text(judul),
          content: Text(isi),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Lanjut')),
          ],
        ),
      ) ==
      true;

  // ---------- tampilan ----------
  Widget _langkah({required int no, required String judul, required String ket, required bool selesai, bool kunci = false,
      bool peringatan = false, required List<Widget> isi}) {
    final warna = peringatan ? AppColors.accent700 : (selesai ? AppColors.success700 : (kunci ? AppColors.neutral400 : AppColors.navy700));
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: peringatan ? AppColors.accent400 : AppColors.neutral200),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          CircleAvatar(
            radius: 15,
            backgroundColor: warna,
            child: selesai && !peringatan
                ? const Icon(Icons.check_rounded, size: 18, color: Colors.white)
                : Text('$no', style: const TextStyle(fontWeight: FontWeight.w900, color: Colors.white)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(judul, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900, color: kunci ? AppColors.neutral500 : AppColors.navy900)),
              Text(ket, style: TextStyle(fontSize: 11.5, color: peringatan ? AppColors.accent700 : AppColors.neutral500)),
            ]),
          ),
          if (kunci) const Icon(Icons.lock_outline_rounded, size: 18, color: AppColors.neutral400),
        ]),
        const SizedBox(height: 12),
        ...isi,
      ]),
    );
  }

  Widget _grid(List<Widget> petak) => GridView.count(
        crossAxisCount: 4,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        childAspectRatio: .9,
        children: petak,
      );

  Widget _baris(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 130, child: Text(k, style: const TextStyle(fontSize: 12, color: AppColors.neutral500))),
          Expanded(child: Text(v.isEmpty ? '-' : v, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.navy900))),
        ]),
      );

  Widget _kartuFotoDetail((String, String) slot, {required bool bisa}) {
    final kode = slot.$1, label = slot.$2;
    return Material(
      color: AppColors.neutral100,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: bisa ? () => unawaited(_lihatFoto(kode, label)) : null,
        child: Stack(fit: StackFit.expand, children: [
          FutureBuilder<Uint8List>(
            future: _ambilFotoKecil(kode),
            builder: (context, s) {
              if (s.hasData) {
                return Image.memory(
                  s.data!,
                  fit: BoxFit.cover,
                  gaplessPlayback: true,
                  errorBuilder: (context, error, stack) => const Center(child: Icon(Icons.broken_image_outlined, color: AppColors.neutral400)),
                );
              }
              if (s.hasError) {
                return Center(
                  child: IconButton(
                    tooltip: 'Muat ulang foto',
                    onPressed: () => setState(() {
                      _fotoKecil.remove(kode);
                      _ambilFotoKecil(kode);
                    }),
                    icon: const Icon(Icons.refresh_rounded, color: AppColors.red600),
                  ),
                );
              }
              return const Center(child: SisiLoader(ukuran: 22));
            },
          ),
          Positioned(
            top: 6,
            right: 6,
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
              child: const Icon(Icons.zoom_in_rounded, size: 15, color: Colors.white),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              padding: const EdgeInsets.fromLTRB(8, 16, 8, 6),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Colors.black87],
                ),
              ),
              child: Text(
                label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final b = _b, d = _d;
    String t(String k) => d == null ? '' : '${d[k] ?? ''}';
    final antre = AntreanBa.i.adaUntuk(b.baId);
    final bisa = _sibuk == null && !b.batal && !antre;
    final pesanSibuk = _sibuk ?? (antre ? 'Proses Pembuatan BA sedang berjalan di latar belakang. Fitur lain dikunci sampai selesai...' : null);
    final ttdOk = b.ttdBerlaku;
    final g = gayaTahapBa(b.tahap);
    final warnaCloud = antre
        ? AppColors.accent400
        : (b.statusPdf == 'GAGAL'
            ? AppColors.red100
            : (b.adaPdf ? const Color(0xFF4ADE80) : Colors.white70));
    final ikonCloud = antre
        ? Icons.cloud_upload_outlined
        : (b.statusPdf == 'GAGAL'
            ? Icons.error_outline_rounded
            : (b.adaPdf ? Icons.cloud_done_rounded : Icons.cloud_upload_outlined));
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.pop(context, _berubah);
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFF6F8FC),
        appBar: sisiAppBar('Detail BA', subjudul: b.noGardu, actions: [
          if (!b.batal && (b.jenis == 'Pengoperasian Trafo' || b.jenis == 'Penggantian Trafo'))
            IconButton(tooltip: 'Edit BA', onPressed: bisa ? () => unawaited(_edit()) : null, icon: const Icon(Icons.edit_note_rounded)),
        ]),
        body: Column(children: [
          if (pesanSibuk != null)
            Container(
              width: double.infinity,
              color: AppColors.cyan100,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: Text(pesanSibuk, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.navy700)),
            ),
          Expanded(
            child: RefreshSisi(
              onRefresh: () async {
                if (!antre) await _muat();
              },
              child: ListView(padding: const EdgeInsets.fromLTRB(16, 14, 16, 40), children: [
                // kepala
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [AppColors.navy900, AppColors.navy600]),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(
                          child: Text(b.noGardu.isEmpty ? '-' : b.noGardu,
                              style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: Colors.white))),
                      Icon(g.ikon, size: 22, color: Colors.white70),
                    ]),
                    Text(b.jenis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white70)),
                    const SizedBox(height: 10),
                    Text(b.noBaFull.isEmpty ? b.idBa : b.noBaFull, style: const TextStyle(fontSize: 12, color: Colors.white)),
                    Text('${b.idBa} · ${tanggalPendek(b.tanggalBa)}', style: const TextStyle(fontSize: 11.5, color: Colors.white70)),
                    const SizedBox(height: 6),
                    Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Expanded(
                        child: Text(
                          antre ? 'Proses pembuatan BA sedang berjalan...' : TahapAlurBa.arti(b.tahap),
                          style: const TextStyle(fontSize: 11.5, fontStyle: FontStyle.italic, color: Colors.white70),
                        ),
                      ),
                      const SizedBox(width: 8),
                      if (antre || _sibuk != null) ...[
                        const SizedBox(
                          width: 15,
                          height: 15,
                          child: SisiLoader(warna: AppColors.accent400),
                        ),
                        const SizedBox(width: 6),
                      ],
                      Icon(ikonCloud, size: 20, color: warnaCloud),
                    ]),
                  ]),
                ),
                const SizedBox(height: 14),
                if (_galat != null)
                  Container(
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(14)),
                    child: Text(_galat!, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.red700)),
                  ),
                if (!b.batal) ...[
                  _langkah(
                    no: 1,
                    judul: 'Dokumen BA (PDF)',
                    ket: b.adaPdf ? 'PDF siap · ${b.waktuPdf} WIB' : 'PDF belum dibuat',
                    selesai: b.adaPdf,
                    isi: [
                      _grid([
                        PetakAksiBa(ikon: Icons.picture_as_pdf_rounded, teks: 'Lihat', warna: AppColors.red700, onTap: bisa && b.adaPdf ? () => unawaited(_lihatPdf()) : null),
                        PetakAksiBa(ikon: Icons.download_rounded, teks: 'Download', warna: AppColors.navy700, onTap: bisa && b.adaPdf ? () => unawaited(_downloadPdf()) : null),
                        PetakAksiBa(ikon: Icons.send_rounded, teks: 'Kirim', warna: AppColors.brand700, onTap: bisa && b.adaPdf ? () => unawaited(_kirimPdf()) : null),
                        PetakAksiBa(
                            ikon: b.adaPdf ? Icons.refresh_rounded : Icons.note_add_outlined,
                            teks: b.adaPdf ? 'Buat Ulang' : 'Buat PDF',
                            warna: AppColors.cyan600,
                            onTap: bisa && b.pdfBisa ? () => unawaited(_buatUlangPdf()) : null),
                      ]),
                    ],
                  ),
                  _langkah(
                    no: 2,
                    judul: 'BA Bertanda Tangan (TTD)',
                    ket: b.statusTtd == 'TTD ULANG'
                        ? 'PDF dibuat ulang / BA diedit sesudah TTD. Upload BA TTD yang baru.'
                        : (b.adaTtd ? 'Terupload · ${b.waktuTtd} WIB' : 'Cetak PDF, tandatangani, lalu upload di sini'),
                    selesai: ttdOk,
                    peringatan: b.statusTtd == 'TTD ULANG',
                    kunci: !b.adaPdf,
                    isi: [
                      FilledButton.icon(
                        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46), backgroundColor: AppColors.brand700),
                        onPressed: bisa && b.adaPdf ? () => unawaited(_uploadTtd()) : null,
                        icon: const Icon(Icons.upload_file_rounded),
                        label: Text(b.adaTtd ? 'Upload Ulang BA TTD' : 'Upload BA TTD'),
                      ),
                      if (b.adaTtd) ...[
                        const SizedBox(height: 8),
                        Row(children: [
                          Expanded(
                              child: OutlinedButton.icon(
                                  onPressed: bisa ? () => unawaited(_lihatTtd()) : null,
                                  icon: const Icon(Icons.visibility_outlined),
                                  label: const Text('Lihat'))),
                          const SizedBox(width: 8),
                          Expanded(
                              child: OutlinedButton.icon(
                                  onPressed: bisa ? () => unawaited(_downloadTtd()) : null,
                                  icon: const Icon(Icons.download_rounded),
                                  label: const Text('Download'))),
                        ]),
                      ],
                    ],
                  ),
                  _langkah(
                    no: 3,
                    judul: 'Kirim ke EAM',
                    ket: !ttdOk
                        ? 'Terbuka sesudah BA TTD diupload'
                        : (b.eamKali > 0 ? 'Terakhir dikirim ${b.eamTerakhir} WIB (${b.eamKali}x)' : 'Pesan WhatsApp format v1 + file BA TTD'),
                    selesai: b.eamKali > 0 && ttdOk,
                    kunci: !ttdOk,
                    isi: [
                      FilledButton.icon(
                        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46), backgroundColor: const Color(0xFF1FA855)),
                        onPressed: bisa && ttdOk ? () => unawaited(_kirimEam()) : null,
                        icon: const Icon(Icons.forum_rounded),
                        label: Text(b.eamKali > 0 ? 'Kirim EAM Lagi' : 'Kirim EAM'),
                      ),
                    ],
                  ),
                  _langkah(
                    no: 4,
                    judul: 'Update Master Gardu',
                    ket: !ttdOk
                        ? 'Terbuka sesudah BA TTD diupload'
                        : (b.masterTerakhir.isNotEmpty ? 'Terakhir diperbarui ${b.masterTerakhir} WIB' : 'Terapkan data BA ke Master Gardu'),
                    selesai: b.masterTerakhir.isNotEmpty && ttdOk,
                    kunci: !ttdOk,
                    isi: [
                      FilledButton.icon(
                        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46), backgroundColor: AppColors.success700),
                        onPressed: bisa && ttdOk ? () => unawaited(_updateMaster()) : null,
                        icon: const Icon(Icons.sync_alt_rounded),
                        label: const Text('Update Master Gardu'),
                      ),
                    ],
                  ),
                ],
                if (d != null)
                  SectionCard(judul: 'Data BA', ikon: Icons.article_outlined, children: [
                    _baris('Tanggal BA', tanggalPendek(t('tanggalBa'))),
                    _baris('Tanggal Pekerjaan', tanggalPendek(t('tanggalPekerjaan'))),
                    _baris('Penyulang', t('penyulang')),
                    _baris('Section', t('section')),
                    _baris('Alamat', t('alamat')),
                    _baris('Koordinat', t('koordinat')),
                    const Divider(),
                    if (b.jenis == 'Penggantian Trafo') ...[
                      _baris('Trafo Sebelum', '${t('kva')} kVA · ${t('merk')} · SN ${t('seri')} (${t('tahun')})'),
                      _baris('Konstruksi', t('konstruksi')),
                      _baris('PHB-TR Sebelum', '${t('merkPhb')} / ${t('seriPhb')} / ${t('tahunPhb')} · ${t('jurusan')} jur'),
                      const Divider(),
                      _baris('Trafo Sesudah', '${t('kvaSesudah')} kVA · ${t('merkSesudah')} · SN ${t('seriSesudah')} (${t('tahunSesudah')})'),
                      _baris('Asal Trafo', t('asalTrafo')),
                      _baris('PHB-TR Sesudah',
                          '${t('merkPhbSesudah').isEmpty ? t('merkPhb') : t('merkPhbSesudah')} / ${t('seriPhbSesudah').isEmpty ? t('seriPhb') : t('seriPhbSesudah')} / ${t('tahunPhbSesudah').isEmpty ? t('tahunPhb') : t('tahunPhbSesudah')} · ${t('jurusanSesudah').isEmpty ? t('jurusan') : t('jurusanSesudah')} jur'),
                    ] else ...[
                      _baris('Kapasitas', '${t('kva')} kVA'),
                      _baris('Merk / Seri', '${t('merk')} / ${t('seri')}'),
                      _baris('Tahun', t('tahun')),
                      _baris('Konstruksi', t('konstruksi')),
                      _baris('Jurusan', t('jurusan')),
                      _baris('PHB-TR', '${t('merkPhb')} / ${t('seriPhb')} / ${t('tahunPhb')}'),
                      const Divider(),
                      _baris('Kepemilikan', t('kepemilikan')),
                      _baris('OwnerId', t('ownerId')),
                      _baris('External Ref', t('externalReference')),
                      _baris('Perluasan SUTM', t('perluasanSutm').isEmpty ? '' : '${t('perluasanSutm')} kmS'),
                      _baris('Vendor', t('vendor')),
                    ],
                    const Divider(),
                    _baris('Petugas 1', t('petugas1')),
                    _baris('Petugas 2', t('petugas2')),
                    _baris('Mengetahui', t('mengetahui')),
                    _baris('Folder Drive', t('folder')),
                    if (_daftarSlotFoto(d).isNotEmpty) ...[
                      const Divider(),
                      const Padding(
                        padding: EdgeInsets.only(top: 4, bottom: 8),
                        child: Text('Foto Nameplate & Dokumentasi',
                            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                      ),
                      GridView.count(
                        crossAxisCount: 2,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        mainAxisSpacing: 10,
                        crossAxisSpacing: 10,
                        childAspectRatio: 1.08,
                        children: [
                          for (final s in _daftarSlotFoto(d)) _kartuFotoDetail(s, bisa: bisa),
                        ],
                      ),
                    ],
                  ]),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}
