import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:pdfx/pdfx.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/sisi_widgets.dart';
import 'arsip_ba_lembar.dart';
import 'ba_antrean.dart';
import 'ba_penggantian_screen.dart';
import 'ba_pengoperasian_screen.dart';
import 'ba_repository.dart';
import 'berita_acara_screen.dart';
import 'detail_ba_screen.dart';
import 'gardu_widgets.dart';
import '../../widgets/sisi_loader.dart';

/// v0.76.0 (permintaan kvlar 10 Okt 2026): PDF BA TIDAK dibuka lewat Drive. Bytes PDF diambil lewat server
/// (getPdfBaGardu), disimpan di HP (per Waktu PDF, jadi buat ulang = unduh baru), ditampilkan di dalam aplikasi.
Future<String> pdfLokalBa(BaRepository repo, Sesi s, ItemBa b) async {
  final dir = Directory(p.join((await getApplicationDocumentsDirectory()).path, 'ba_pdf'));
  await dir.create(recursive: true);
  final versi = b.waktuPdf.replaceAll(RegExp(r'[^0-9]'), '');
  final nama = '${b.idBa.isEmpty ? b.baId : b.idBa}_$versi.pdf'.replaceAll(RegExp(r'[^A-Za-z0-9_.-]'), '_');
  final f = File(p.join(dir.path, nama));
  if (await f.exists() && await f.length() > 0) return f.path;
  // versi lama BA ini dibuang
  final awal = (b.idBa.isEmpty ? b.baId : b.idBa).replaceAll(RegExp(r'[^A-Za-z0-9_.-]'), '_');
  await for (final e in dir.list()) {
    if (e is File && p.basename(e.path).startsWith('${awal}_') && e.path != f.path) {
      try {
        await e.delete();
      } catch (_) {/* dibiarkan */}
    }
  }
  final h = await repo.pdf(s, b.baId);
  await f.writeAsBytes(h.bytes, flush: true);
  return f.path;
}

/// Simpan salinan PDF ke folder Download/SiSi (Android). Gagal (izin / versi Android) = null, pakai Bagikan.
Future<String?> simpanPdfKeDownload(String path, String nama) async {
  if (!Platform.isAndroid) return null;
  try {
    final dir = Directory('/storage/emulated/0/Download/SiSi');
    await dir.create(recursive: true);
    final tujuan = p.join(dir.path, nama);
    await File(path).copy(tujuan);
    return tujuan;
  } catch (_) {
    return null;
  }
}

/// Bagikan / simpan PDF lewat lembar bagikan Android (Simpan ke Files, WhatsApp, dll).
Future<void> bagikanPdf(String path, String judul) async {
  await Share.shareXFiles([XFile(path, mimeType: 'application/pdf')], subject: judul);
}

/// Warna badge Status PDF (BELUM / PROSES / SELESAI / GAGAL).
StatusBadge badgePdfBa(String status) => switch (status) {
      'SELESAI' => const StatusBadge('PDF SIAP', warna: AppColors.success700, latar: AppColors.success100, ikon: Icons.picture_as_pdf_outlined),
      'PROSES' => const StatusBadge('PDF DIBUAT', warna: AppColors.accent700, latar: AppColors.accent100, ikon: Icons.hourglass_top_rounded),
      'GAGAL' => const StatusBadge('PDF GAGAL', warna: AppColors.red700, latar: AppColors.red100, ikon: Icons.error_outline_rounded),
      _ => const StatusBadge('BELUM PDF', warna: AppColors.neutral700, latar: AppColors.neutral100, ikon: Icons.description_outlined),
    };

/// Jalankan buatPdfBaGardu dengan dialog progres. null = gagal (pesan sudah ditampilkan).
Future<HasilPdfBa?> buatPdfDenganDialog(BuildContext context, BaRepository repo, Sesi sesi, String baId) async {
  unawaited(showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (c) => const PopScope(
      canPop: false,
      child: AlertDialog(
        title: Text('Proses Pembuatan BA'),
        content: Row(children: [
          SisiLoader(ukuran: 26),
          SizedBox(width: 16),
          Expanded(child: Text('Membuat PDF BA...')),
        ]),
      ),
    ),
  ));
  HasilPdfBa? hasil;
  String? gagal;
  try {
    hasil = await repo.buatPdf(sesi, baId);
  } on ApiException catch (e) {
    gagal = KodeError.pesan(e.kode);
  } catch (_) {
    gagal = 'Gagal terhubung. Cek sinyal lalu coba lagi.';
  }
  if (!context.mounted) return hasil;
  Navigator.of(context, rootNavigator: true).pop();
  if (hasil == null) tampilPesan(context, gagal ?? 'PDF gagal dibuat.');
  return hasil;
}

/// v0.78.0: simpan salinan file ke Download/SiSi (Android). Gagal (izin / versi Android) = null, pakai Bagikan.
Future<String?> simpanFileKeDownload(String path, String nama) async {
  if (!Platform.isAndroid) return null;
  try {
    final dir = Directory('/storage/emulated/0/Download/SiSi');
    await dir.create(recursive: true);
    final tujuan = p.join(dir.path, nama);
    await File(path).copy(tujuan);
    return tujuan;
  } catch (_) {
    return null;
  }
}

/// Nama file PDF BA di HP (Download / bagikan).
String namaPdfBa(ItemBa b) => 'BA-${b.noGardu.isEmpty ? 'Gardu' : b.noGardu}-${b.idBa.isEmpty ? b.baId.substring(0, 8) : b.idBa}.pdf';

/// v0.78.0: warna + ikon tahap alur BA.
({Color warna, Color latar, IconData ikon}) gayaTahapBa(String tahap) => switch (tahap) {
      TahapAlurBa.selesaiTtd => (warna: AppColors.success700, latar: AppColors.success100, ikon: Icons.verified_rounded),
      TahapAlurBa.prosesTtd => (warna: AppColors.brand700, latar: AppColors.brand50, ikon: Icons.draw_outlined),
      TahapAlurBa.ttdUlang => (warna: AppColors.accent700, latar: AppColors.accent100, ikon: Icons.restart_alt_rounded),
      TahapAlurBa.batal => (warna: AppColors.red700, latar: AppColors.red100, ikon: Icons.block_rounded),
      _ => (warna: AppColors.neutral700, latar: AppColors.neutral100, ikon: Icons.edit_document),
    };

StatusBadge badgeTahapBa(String tahap) {
  final g = gayaTahapBa(tahap);
  return StatusBadge(TahapAlurBa.label(tahap).toUpperCase(), warna: g.warna, latar: g.latar, ikon: g.ikon);
}

String _iso(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// v0.71.0: daftar BA dengan status PDF. v0.76.0: antrean kirim di atas, PDF dilihat / di-download di dalam aplikasi.
/// v0.78.0 (permintaan kvlar 10 Okt 2026): filter urut / rentang tanggal / jenis BA / status, kartu dipilih = Lihat Detail BA
/// atau Download BA; fitur lain (edit, buat ulang, kirim, BA TTD, EAM, Master Gardu) muncul sesudahnya.
/// v0.86.0 (permintaan kvlar 13 Okt 2026): satu halaman dengan Arsip BA v1 (baca saja), urut tanggal, filter sumber,
/// [cariAwal] = langsung cari (mis. No Gardu dari detail gardu) untuk tracking riwayat BA.
class DaftarBaScreen extends StatefulWidget {
  const DaftarBaScreen({super.key, required this.deps, required this.sesi, this.cariAwal = ''});
  final Deps deps;
  final Sesi sesi;
  final String cariAwal;

  @override
  State<DaftarBaScreen> createState() => _DaftarBaScreenState();
}

class _DaftarBaScreenState extends State<DaftarBaScreen> {
  static const _batas = 100;
  late final BaRepository _repo = BaRepository(widget.deps.api);
  late final _cari = TextEditingController(text: widget.cariAwal);
  bool _muatLagi = false;
  FilterBa _filter = const FilterBa();
  List<ItemBa> _isi = const [];
  Map<String, int> _ringkasan = const {};
  int _jumlah = 0;
  bool _muat = true;
  String? _galat;
  String? _unduh; // baId yang PDF-nya sedang diunduh
  StreamSubscription<HasilTugasBa>? _dengar;

  @override
  void initState() {
    super.initState();
    _segarkan();
    AntreanBa.i.addListener(_ulang);
    _dengar = AntreanBa.i.selesai.listen((h) {
      if (!mounted) return;
      if (h.berhasil) {
        unawaited(tampilPopupBerhasil(context, judul: 'BA berhasil dibuat', keterangan: h.judul));
      } else {
        tampilPesan(context, h.pesan);
      }
      unawaited(_segarkan());
    });
    unawaited(AntreanBa.i.jalankan(widget.deps, widget.sesi)); // lanjutkan kiriman yang tertunda
  }

  void _ulang() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    AntreanBa.i.removeListener(_ulang);
    unawaited(_dengar?.cancel());
    _cari.dispose();
    super.dispose();
  }

  Future<void> _segarkan() async {
    setState(() {
      _muat = true;
      _galat = null;
    });
    try {
      final r = await _repo.daftar(widget.sesi, filter: _filter.salin(cari: _cari.text), batas: _batas);
      if (!mounted) return;
      setState(() {
        _isi = r.isi;
        _jumlah = r.jumlah;
        _ringkasan = r.ringkasan;
        _muat = false;
      });
    } on ApiException catch (e) {
      _gagal(KodeError.pesan(e.kode));
    } catch (_) {
      _gagal('Gagal terhubung. Daftar BA butuh internet.');
    }
  }

  /// v0.86.0: halaman berikutnya (BA v2 + arsip v1 bisa ratusan).
  Future<void> _lanjut() async {
    if (_muatLagi) return;
    setState(() => _muatLagi = true);
    try {
      final r = await _repo.daftar(widget.sesi, filter: _filter.salin(cari: _cari.text), mulai: _isi.length, batas: _batas);
      if (mounted) setState(() => _isi = [..._isi, ...r.isi]);
    } on ApiException catch (e) {
      if (mounted) tampilPesan(context, KodeError.pesan(e.kode));
    } catch (_) {
      if (mounted) tampilPesan(context, 'Gagal terhubung. Coba lagi.');
    } finally {
      if (mounted) setState(() => _muatLagi = false);
    }
  }

  /// v0.86.0: tracking = cari semua BA (v2 + arsip v1) satu gardu / switching.
  void _cariPeralatan(String nama) {
    _cari.text = nama;
    unawaited(_segarkan());
  }

  void _gagal(String pesan) {
    if (!mounted) return;
    setState(() {
      _galat = pesan;
      _muat = false;
    });
  }

  void _pakaiFilter(FilterBa f) {
    setState(() => _filter = f);
    unawaited(_segarkan());
  }

  void _gantiItem(ItemBa b) => setState(() => _isi = [for (final x in _isi) x.baId == b.baId ? b : x]);

  Future<ItemBa?> _buatPdf(ItemBa b) async {
    if (b.adaPdf) {
      final ulang = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Buat ulang PDF?'),
          content: Text('PDF ${b.idBa} yang lama diganti dengan PDF baru dari data Rekap_BA sekarang.'
              '${b.adaTtd ? '\n\nBA TTD yang sudah diupload jadi tidak berlaku: upload BA TTD baru sesudahnya.' : ''}'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Buat Ulang')),
          ],
        ),
      );
      if (ulang != true || !mounted) return null;
    }
    final h = await buatPdfDenganDialog(context, _repo, widget.sesi, b.baId);
    if (!mounted) return null;
    if (h == null) {
      await _segarkan(); // status GAGAL dari server
      return null;
    }
    final baru = b.denganPdf(h);
    _gantiItem(baru);
    final ket = h.fotoHilang.isEmpty ? '' : ' Foto kosong: ${h.fotoHilang.join(', ')}.';
    tampilPesan(context, 'PDF ${b.noGardu} siap.$ket');
    return baru;
  }

  bool _bisaEdit(ItemBa b) => !b.batal && (b.jenis == 'Pengoperasian Trafo' || b.jenis == 'Penggantian Trafo');

  Future<String?> _ambilPdf(ItemBa b) async {
    setState(() => _unduh = b.baId);
    try {
      return await pdfLokalBa(_repo, widget.sesi, b);
    } on ApiException catch (e) {
      if (mounted) tampilPesan(context, KodeError.pesan(e.kode));
    } catch (_) {
      if (mounted) tampilPesan(context, 'PDF gagal diunduh. Cek sinyal lalu coba lagi.');
    } finally {
      if (mounted) setState(() => _unduh = null);
    }
    return null;
  }

  /// Download BA: PDF belum ada = tawarkan buat dulu. Sesudah tersimpan = lembar fitur lanjutan.
  Future<void> _downloadBa(ItemBa b) async {
    var x = b;
    if (!x.adaPdf) {
      if (!x.pdfBisa) {
        tampilPesan(context, x.batal ? 'BA ini BATAL, PDF tidak dibuat.' : 'PDF untuk ${x.jenis} belum tersedia.');
        return;
      }
      final buat = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('PDF belum dibuat'),
          content: const Text('Buat PDF BA sekarang lalu langsung di-download?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Buat & Download')),
          ],
        ),
      );
      if (buat != true || !mounted) return;
      final baru = await _buatPdf(x);
      if (baru == null || !mounted) return;
      x = baru;
    }
    final path = await _ambilPdf(x);
    if (path == null || !mounted) return;
    final tujuan = await simpanFileKeDownload(path, namaPdfBa(x));
    if (!mounted) return;
    // v0.92.1: pop up centang dulu (ketuk = lewati), lalu lembar fitur lanjutan
    if (tujuan != null) {
      await tampilPopupBerhasil(context, judul: 'BA berhasil didownload', keterangan: 'Download/SiSi/${namaPdfBa(x)}');
      if (!mounted) return;
    }
    await _sesudahDownload(x, path, tujuan);
  }

  Future<void> _editBa(ItemBa b) async {
    if (AntreanBa.i.adaUntuk(b.baId)) {
      tampilPesan(context, 'BA ini masih diproses di latar belakang. Tunggu selesai dulu.');
      return;
    }
    final layar = b.jenis == 'Penggantian Trafo'
        ? BaPenggantianScreen(deps: widget.deps, sesi: widget.sesi, ubahBaId: b.baId)
        : BaPengoperasianScreen(deps: widget.deps, sesi: widget.sesi, ubahBaId: b.baId);
    final ok = await Navigator.push(context, MaterialPageRoute<bool>(builder: (_) => layar));
    if (ok == true && mounted) await _segarkan();
  }

  Future<void> _bukaDetail(ItemBa b) async {
    if (AntreanBa.i.adaUntuk(b.baId)) {
      tampilPesan(context, 'BA ini masih diproses di latar belakang. Tunggu selesai dulu.');
      return;
    }
    final berubah = await Navigator.push(
        context, MaterialPageRoute<bool>(builder: (_) => DetailBaScreen(deps: widget.deps, sesi: widget.sesi, ba: b)));
    if (berubah == true && mounted) await _segarkan();
  }

  /// Kartu dipilih: dua pilihan utama dulu (Lihat Detail / Download), fitur lain menyusul sesudahnya.
  void _pilihKartu(ItemBa b) {
    final arsip = b.arsip;
    if (arsip != null) {
      unawaited(tampilArsipBa(context, deps: widget.deps, sesi: widget.sesi, b: arsip, onCari: _cariPeralatan));
      return;
    }
    if (AntreanBa.i.adaUntuk(b.baId)) {
      tampilPesan(context, 'BA ini masih diproses di latar belakang. Tunggu selesai dulu.');
      return;
    }
    final g = gayaTahapBa(b.tahap);
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(color: g.latar, borderRadius: BorderRadius.circular(14)),
                child: Icon(g.ikon, color: g.warna),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(b.noGardu.isEmpty ? 'BA' : b.noGardu, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: AppColors.navy900)),
                  Text('${b.jenis} · ${tanggalPendek(b.tanggalBa)}', style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
                ]),
              ),
              badgeTahapBa(b.tahap),
            ]),
            const SizedBox(height: 12),
            AlurMiniBa(ba: b),
            const SizedBox(height: 16),
            _TombolBesar(
              ikon: Icons.visibility_rounded,
              judul: 'Lihat Detail BA',
              ket: 'Data, foto, BA TTD, Kirim EAM, Update Master Gardu',
              utama: true,
              onTap: () {
                Navigator.pop(c);
                unawaited(_bukaDetail(b));
              },
            ),
            const SizedBox(height: 10),
            _TombolBesar(
              ikon: Icons.download_rounded,
              judul: 'Download BA',
              ket: b.adaPdf ? 'Simpan PDF ke Download/SiSi' : (b.pdfBisa ? 'PDF belum ada: dibuat dulu lalu di-download' : 'PDF belum tersedia'),
              onTap: b.adaPdf || b.pdfBisa
                  ? () {
                      Navigator.pop(c);
                      unawaited(_downloadBa(b));
                    }
                  : null,
            ),
          ]),
        ),
      ),
    );
  }

  /// Sesudah Download: fitur lanjutan (buka, kirim, download lagi, edit, buat ulang, detail).
  Future<void> _sesudahDownload(ItemBa b, String path, String? tujuan) {
    final nama = namaPdfBa(b);
    return showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) {
        void tutupLalu(Future<void> Function() f) {
          Navigator.pop(c);
          if (AntreanBa.i.adaUntuk(b.baId)) {
            tampilPesan(context, 'BA ini masih diproses di latar belakang. Tunggu selesai dulu.');
            return;
          }
          unawaited(f());
        }

        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: AppColors.success100, borderRadius: BorderRadius.circular(16)),
                child: Row(children: [
                  const Icon(Icons.check_circle_rounded, color: AppColors.success700, size: 30),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(tujuan != null ? 'BA tersimpan' : 'PDF siap',
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.success700)),
                      Text(tujuan != null ? 'Download/SiSi/$nama' : 'Folder Download tidak bisa dipakai, gunakan Kirim',
                          style: const TextStyle(fontSize: 11.5, color: AppColors.neutral700)),
                    ]),
                  ),
                ]),
              ),
              const SizedBox(height: 14),
              const Text('Mau apa lagi?', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.navy900)),
              const SizedBox(height: 10),
              GridView.count(
                crossAxisCount: 3,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 1.05,
                children: [
                  PetakAksiBa(
                      ikon: Icons.picture_as_pdf_rounded,
                      teks: 'Buka PDF',
                      warna: AppColors.red700,
                      onTap: () => tutupLalu(() async {
                            await Navigator.push(context,
                                MaterialPageRoute<void>(builder: (_) => PdfBaScreen(path: path, judul: '${b.noGardu} · ${b.jenis}', namaFile: nama)));
                          })),
                  PetakAksiBa(ikon: Icons.send_rounded, teks: 'Kirim', warna: AppColors.brand700, onTap: () => tutupLalu(() => bagikanPdf(path, nama))),
                  PetakAksiBa(
                      ikon: Icons.download_for_offline_rounded,
                      teks: 'Download Lagi',
                      warna: AppColors.navy700,
                      onTap: () => tutupLalu(() async {
                            final t = await simpanFileKeDownload(path, nama);
                            if (!mounted) return;
                            if (t != null) {
                              unawaited(tampilPopupBerhasil(context, judul: 'PDF berhasil didownload', keterangan: 'Download/SiSi/$nama'));
                            } else {
                              await bagikanPdf(path, nama);
                            }
                          })),
                  PetakAksiBa(
                      ikon: Icons.edit_note_rounded,
                      teks: 'Edit BA',
                      warna: AppColors.amber700,
                      onTap: _bisaEdit(b) ? () => tutupLalu(() => _editBa(b)) : null),
                  PetakAksiBa(
                      ikon: Icons.refresh_rounded,
                      teks: 'Buat Ulang PDF',
                      warna: AppColors.cyan600,
                      onTap: b.pdfBisa
                          ? () => tutupLalu(() async {
                                await _buatPdf(b);
                              })
                          : null),
                  PetakAksiBa(
                      ikon: Icons.visibility_rounded, teks: 'Lihat Detail', warna: AppColors.success700, onTap: () => tutupLalu(() => _bukaDetail(b))),
                ],
              ),
            ]),
          ),
        );
      },
    );
  }

  Future<void> _bukaFilter() async {
    final f = await showModalBottomSheet<FilterBa>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (c) => _LembarFilter(awal: _filter),
    );
    if (f != null && mounted) _pakaiFilter(f);
  }

  Widget _kartuAntrean(TugasBa t) {
    final gagal = t.tahap == TahapBa.gagal, tunda = t.tahap == TahapBa.tertunda;
    final warna = gagal ? AppColors.red700 : (tunda ? AppColors.accent700 : AppColors.brand700);
    final latar = gagal ? AppColors.red100 : (tunda ? AppColors.accent100 : AppColors.brand50);
    final langkah = switch (t.tahap) { TahapBa.foto => 1, TahapBa.simpan => 2, TahapBa.pdf => 3, _ => 0 };
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(16), border: Border.all(color: warna.withValues(alpha: .35))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Proses Pembuatan BA',
            style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
        Text('${t.judul} · ${t.ubah ? 'edit BA' : 'BA baru'}',
            style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
        const SizedBox(height: 8),
        if (!gagal && !tunda)
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(value: langkah == 0 ? null : langkah / 3, minHeight: 5, backgroundColor: Colors.white),
          ),
        const SizedBox(height: 6),
        Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
          Expanded(
            child: Text(gagal || tunda ? (t.galat ?? t.ket) : t.ket,
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: warna)),
          ),
          const SizedBox(width: 8),
          if (!gagal && !tunda) ...[
            const SisiLoader(ukuran: 15, warna: AppColors.accent700),
            const SizedBox(width: 6),
          ],
          Icon(
            gagal ? Icons.error_outline_rounded : (tunda ? Icons.cloud_off_rounded : Icons.cloud_upload_outlined),
            size: 19,
            color: gagal ? AppColors.red600 : AppColors.accent700,
          ),
        ]),
        if (gagal || tunda)
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
            if (gagal)
              TextButton(
                onPressed: () => unawaited(_buangTugas(t)),
                child: const Text('Buang', style: TextStyle(color: AppColors.red700)),
              ),
            FilledButton.tonal(
              onPressed: AntreanBa.i.berjalan ? null : () => unawaited(AntreanBa.i.coba(widget.deps, widget.sesi, t.baId)),
              child: const Text('Coba lagi'),
            ),
          ]),
      ]),
    );
  }

  Future<void> _buangTugas(TugasBa t) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Buang kiriman ini?'),
        content: Text(t.disimpan
            ? 'BA sudah tersimpan di server; yang dibuang hanya antrean PDF. Buat PDF dari daftar.'
            : (t.ubah ? 'Perubahan BA yang belum terkirim hilang.' : 'BA belum tersimpan di server: isian dan foto hilang, nomor pesanan dilepas.')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: AppColors.red600), onPressed: () => Navigator.pop(c, true), child: const Text('Buang')),
        ],
      ),
    );
    if (ok == true) await AntreanBa.i.buang(widget.deps, widget.sesi, t.baId);
  }

  Widget _barisCari() {
    final aktif = _filter.jumlahAktif;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
      child: Row(children: [
        Expanded(
          child: TextField(
            controller: _cari,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _segarkan(),
            decoration: InputDecoration(
              hintText: 'Cari no gardu / ID BA / penyulang',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: IconButton(
                icon: const Icon(Icons.close_rounded),
                onPressed: () {
                  _cari.clear();
                  _segarkan();
                },
              ),
              filled: true,
              fillColor: Colors.white,
              isDense: true,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.neutral200)),
            ),
          ),
        ),
        const SizedBox(width: 8),
        _TombolKotak(
          ikon: _filter.terlama ? Icons.north_rounded : Icons.south_rounded,
          tooltip: _filter.terlama ? 'Urut: terlama dulu' : 'Urut: terbaru dulu',
          aktif: _filter.terlama,
          onTap: () => _pakaiFilter(_filter.salin(terlama: !_filter.terlama)),
        ),
        const SizedBox(width: 6),
        Badge(
          isLabelVisible: aktif > 0,
          label: Text('$aktif'),
          child: _TombolKotak(ikon: Icons.tune_rounded, tooltip: 'Filter', aktif: aktif > 0, onTap: () => unawaited(_bukaFilter())),
        ),
      ]),
    );
  }

  Widget _chipStatus() {
    final total = _ringkasan.values.fold<int>(0, (a, b) => a + b);
    Widget chip(String? tahap, String label, int n) {
      final pilih = _filter.tahap == tahap;
      final g = tahap == null ? (warna: AppColors.navy700, latar: AppColors.navy100, ikon: Icons.all_inbox_rounded) : gayaTahapBa(tahap);
      return Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(
          selected: pilih,
          showCheckmark: false,
          avatar: Icon(g.ikon, size: 16, color: pilih ? Colors.white : g.warna),
          label: Text('$label  $n'),
          labelStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: pilih ? Colors.white : g.warna),
          selectedColor: g.warna,
          backgroundColor: g.latar,
          side: BorderSide(color: g.warna.withValues(alpha: .25)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)),
          onSelected: (_) => _pakaiFilter(_filter.salin(tahap: () => pilih ? null : tahap)),
        ),
      );
    }

    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          chip(null, 'Semua', total),
          for (final t in TahapAlurBa.semua) chip(t, TahapAlurBa.label(t), _ringkasan[t] ?? 0),
        ],
      ),
    );
  }

  Widget _filterAktif() {
    final f = _filter;
    final chips = <Widget>[
      if (f.terlama) InputChip(label: const Text('Terlama dulu'), onDeleted: () => _pakaiFilter(f.salin(terlama: false))),
      if (f.dari != null || f.sampai != null)
        InputChip(
          avatar: const Icon(Icons.date_range_rounded, size: 16),
          label: Text('${f.dari == null ? '...' : tanggalPendek(f.dari!)} - ${f.sampai == null ? '...' : tanggalPendek(f.sampai!)}'),
          onDeleted: () => _pakaiFilter(f.salin(dari: () => null, sampai: () => null)),
        ),
      if (f.jenis != null) InputChip(label: Text(f.jenis!), onDeleted: () => _pakaiFilter(f.salin(jenis: () => null))),
    ];
    if (chips.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 2, 16, 0),
      child: Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
        ...chips,
        TextButton(onPressed: () => _pakaiFilter(FilterBa(tahap: f.tahap, sumber: f.sumber)), child: const Text('Reset filter')),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final antre = AntreanBa.i.daftar(widget.sesi.userId);
    final adaFilter = _filter.jumlahAktif > 0 || _filter.tahap != null || _filter.sumber != null || _cari.text.trim().isNotEmpty;
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar('Daftar BA', subjudul: _muat ? 'Memuat...' : '$_jumlah BA${adaFilter ? ' sesuai filter' : ''}', actions: [
        TombolSegarkan(sibuk: _muat, onPressed: _segarkan),
      ]),
      body: Column(children: [
        _barisCari(),
        _chipStatus(),
        _filterAktif(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _segarkan,
            child: _muat && _isi.isEmpty
                ? bisaDitarik(const SisiLoading(pesan: 'Memuat daftar BA...'))
                : _galat != null
                    ? bisaDitarik(SisiKosong(ikon: Icons.cloud_off_rounded, judul: 'Daftar BA tidak termuat', pesan: _galat, tombol: 'Coba lagi', onTombol: _segarkan))
                    : _isi.isEmpty && antre.isEmpty
                        ? bisaDitarik(SisiKosong(
                            ikon: Icons.description_outlined,
                            judul: adaFilter ? 'Tidak ada BA sesuai filter' : 'Belum ada BA',
                            pesan: adaFilter ? 'Ubah atau reset filter.' : 'BA yang disimpan dari HP muncul di sini.',
                            tombol: adaFilter ? 'Reset filter' : null,
                            onTombol: adaFilter
                                ? () {
                                    _cari.clear();
                                    _pakaiFilter(const FilterBa());
                                  }
                                : null,
                          ))
                        : ListView(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
                            children: [
                              for (final t in antre) _kartuAntrean(t),
                              for (final b in _isi)
                                _KartuBa(
                                  ba: b,
                                  sibuk: b.arsip == null && (_unduh == b.baId || AntreanBa.i.adaUntuk(b.baId)),
                                  onTap: () => _pilihKartu(b),
                                ),
                              if (_isi.length < _jumlah)
                                Padding(
                                  padding: const EdgeInsets.only(top: 4),
                                  child: OutlinedButton.icon(
                                    onPressed: _muatLagi ? null : () => unawaited(_lanjut()),
                                    icon: _muatLagi
                                        ? const SisiLoader(ukuran: 16)
                                        : const Icon(Icons.expand_more_rounded),
                                    label: Text('Muat lagi (${_isi.length} dari $_jumlah)'),
                                  ),
                                ),
                            ],
                          ),
          ),
        ),
      ]),
    );
  }
}

/// Tombol kotak kecil di samping kolom cari (urut / filter).
class _TombolKotak extends StatelessWidget {
  const _TombolKotak({required this.ikon, required this.tooltip, required this.onTap, this.aktif = false});
  final IconData ikon;
  final String tooltip;
  final VoidCallback onTap;
  final bool aktif;

  @override
  Widget build(BuildContext context) => Tooltip(
        message: tooltip,
        child: Material(
          color: aktif ? AppColors.navy700 : Colors.white,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: onTap,
            child: Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14), border: Border.all(color: aktif ? AppColors.navy700 : AppColors.neutral200)),
              child: Icon(ikon, color: aktif ? Colors.white : AppColors.navy700),
            ),
          ),
        ),
      );
}

/// Tombol besar dengan judul + keterangan (lembar kartu dipilih).
class _TombolBesar extends StatelessWidget {
  const _TombolBesar({required this.ikon, required this.judul, required this.ket, required this.onTap, this.utama = false});
  final IconData ikon;
  final String judul;
  final String ket;
  final VoidCallback? onTap;
  final bool utama;

  @override
  Widget build(BuildContext context) {
    final warna = utama ? Colors.white : AppColors.navy700;
    return Opacity(
      opacity: onTap == null ? .45 : 1,
      child: Material(
        color: utama ? AppColors.navy700 : Colors.white,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16), border: Border.all(color: utama ? AppColors.navy700 : AppColors.neutral200)),
            child: Row(children: [
              Icon(ikon, color: warna, size: 26),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(judul, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: warna)),
                  const SizedBox(height: 2),
                  Text(ket, style: TextStyle(fontSize: 11.5, color: utama ? Colors.white70 : AppColors.neutral500)),
                ]),
              ),
              Icon(Icons.chevron_right_rounded, color: warna),
            ]),
          ),
        ),
      ),
    );
  }
}

/// v0.78.0: petak aksi bergambar (lembar sesudah download + detail BA). onTap null = tidak tersedia (redup).
class PetakAksiBa extends StatelessWidget {
  const PetakAksiBa({super.key, required this.ikon, required this.teks, required this.warna, required this.onTap});
  final IconData ikon;
  final String teks;
  final Color warna;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Opacity(
        opacity: onTap == null ? .4 : 1,
        child: Material(
          color: warna.withValues(alpha: .08),
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: warna, borderRadius: BorderRadius.circular(12)),
                  child: Icon(ikon, color: Colors.white, size: 22),
                ),
                const SizedBox(height: 8),
                Text(teks,
                    textAlign: TextAlign.center, maxLines: 2, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: warna)),
              ]),
            ),
          ),
        ),
      );
}

/// v0.78.0: empat tahap alur BA (PDF, TTD, EAM, Master) sebagai titik kecil di kartu / lembar.
class AlurMiniBa extends StatelessWidget {
  const AlurMiniBa({super.key, required this.ba});
  final ItemBa ba;

  @override
  Widget build(BuildContext context) {
    Widget titik(String teks, bool selesai, {bool peringatan = false}) {
      final warna = peringatan ? AppColors.accent700 : (selesai ? AppColors.success700 : AppColors.neutral400);
      return Expanded(
        child: Row(children: [
          Icon(peringatan ? Icons.error_rounded : (selesai ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded),
              size: 14, color: warna),
          const SizedBox(width: 4),
          Flexible(child: Text(teks, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: warna))),
        ]),
      );
    }

    return Row(children: [
      titik('PDF', ba.adaPdf),
      titik('TTD', ba.ttdBerlaku, peringatan: ba.statusTtd == 'TTD ULANG'),
      titik('EAM', ba.eamKali > 0),
      titik('Master', ba.masterTerakhir.isNotEmpty),
    ]);
  }
}

/// v0.78.0: lembar filter lanjutan (urut, rentang Tanggal BA, jenis BA, status).
class _LembarFilter extends StatefulWidget {
  const _LembarFilter({required this.awal});
  final FilterBa awal;

  @override
  State<_LembarFilter> createState() => _LembarFilterState();
}

class _LembarFilterState extends State<_LembarFilter> {
  late FilterBa _f = widget.awal;
  late String _cepat = _f.dari == null && _f.sampai == null ? 'SEMUA' : 'PILIH';

  void _rentangCepat(String k) {
    final now = DateTime.now();
    final hari = DateTime(now.year, now.month, now.day);
    setState(() {
      _cepat = k;
      switch (k) {
        case 'BULAN':
          _f = _f.salin(dari: () => _iso(DateTime(hari.year, hari.month, 1)), sampai: () => _iso(hari));
        case 'HARI30':
          _f = _f.salin(dari: () => _iso(hari.subtract(const Duration(days: 29))), sampai: () => _iso(hari));
        case 'TAHUN':
          _f = _f.salin(dari: () => _iso(DateTime(hari.year, 1, 1)), sampai: () => _iso(hari));
        default:
          _f = _f.salin(dari: () => null, sampai: () => null);
      }
    });
  }

  Future<void> _pilihRentang() async {
    final now = DateTime.now();
    DateTime? baca(String? s) => s == null ? null : DateTime.tryParse(s);
    final awal = baca(_f.dari), akhir = baca(_f.sampai);
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2015),
      lastDate: DateTime(now.year, now.month, now.day),
      initialDateRange: awal != null && akhir != null ? DateTimeRange(start: awal, end: akhir) : null,
      helpText: 'Rentang Tanggal BA',
      saveText: 'Pilih',
    );
    if (r == null || !mounted) return;
    setState(() {
      _cepat = 'PILIH';
      _f = _f.salin(dari: () => _iso(r.start), sampai: () => _iso(r.end));
    });
  }

  Widget _judul(String t, IconData ikon) => Padding(
        padding: const EdgeInsets.only(top: 16, bottom: 8),
        child: Row(children: [
          Icon(ikon, size: 18, color: AppColors.cyan600),
          const SizedBox(width: 8),
          Text(t.toUpperCase(), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: .6, color: AppColors.navy700)),
        ]),
      );

  Widget _chip(String label, bool pilih, VoidCallback onTap) => ChoiceChip(
        label: Text(label),
        selected: pilih,
        onSelected: (_) => onTap(),
        labelStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: pilih ? Colors.white : AppColors.navy700),
        selectedColor: AppColors.navy700,
        showCheckmark: false,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(99)),
      );

  @override
  Widget build(BuildContext context) {
    final rentang = _f.dari == null && _f.sampai == null
        ? 'Pilih tanggal sendiri'
        : '${_f.dari == null ? '...' : tanggalPendek(_f.dari!)}  sampai  ${_f.sampai == null ? '...' : tanggalPendek(_f.sampai!)}';
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.of(context).viewInsets.bottom),
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Filter Daftar BA', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: AppColors.navy900)),
            _judul('Urutkan Tanggal BA', Icons.swap_vert_rounded),
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, icon: Icon(Icons.south_rounded), label: Text('Terbaru dulu')),
                ButtonSegment(value: true, icon: Icon(Icons.north_rounded), label: Text('Terlama dulu')),
              ],
              selected: {_f.terlama},
              onSelectionChanged: (v) => setState(() => _f = _f.salin(terlama: v.first)),
            ),
            _judul('Rentang Tanggal BA', Icons.date_range_rounded),
            Wrap(spacing: 8, runSpacing: 6, children: [
              _chip('Semua', _cepat == 'SEMUA', () => _rentangCepat('SEMUA')),
              _chip('Bulan ini', _cepat == 'BULAN', () => _rentangCepat('BULAN')),
              _chip('30 hari terakhir', _cepat == 'HARI30', () => _rentangCepat('HARI30')),
              _chip('Tahun ini', _cepat == 'TAHUN', () => _rentangCepat('TAHUN')),
            ]),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46), alignment: Alignment.centerLeft),
              onPressed: () => unawaited(_pilihRentang()),
              icon: const Icon(Icons.calendar_month_rounded),
              label: Text(rentang),
            ),
            _judul('Jenis BA', Icons.category_outlined),
            Wrap(spacing: 8, runSpacing: 6, children: [
              _chip('Semua jenis', _f.jenis == null, () => setState(() => _f = _f.salin(jenis: () => null))),
              for (final j in KatalogBa.trafo) _chip(j.nama, _f.jenis == j.nama, () => setState(() => _f = _f.salin(jenis: () => j.nama))),
            ]),
            _judul('Status BA', Icons.flag_outlined),
            Wrap(spacing: 8, runSpacing: 6, children: [
              _chip('Semua status', _f.tahap == null, () => setState(() => _f = _f.salin(tahap: () => null))),
              for (final t in TahapAlurBa.semua) _chip(TahapAlurBa.label(t), _f.tahap == t, () => setState(() => _f = _f.salin(tahap: () => t))),
            ]),
            const SizedBox(height: 20),
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  onPressed: () => Navigator.pop(context, FilterBa(cari: _f.cari)),
                  child: const Text('Reset'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 2,
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  onPressed: () => Navigator.pop(context, _f),
                  icon: const Icon(Icons.check_rounded),
                  label: const Text('Terapkan'),
                ),
              ),
            ]),
          ]),
        ),
      ),
    );
  }
}

class _KartuBa extends StatelessWidget {
  const _KartuBa({required this.ba, required this.onTap, this.sibuk = false});
  final ItemBa ba;
  final VoidCallback onTap;
  final bool sibuk;

  @override
  Widget build(BuildContext context) {
    final g = gayaTahapBa(ba.tahap);
    final gagal = ba.statusPdf == 'GAGAL';
    final selesai = !sibuk && ba.adaPdf;
    final ikonCloud = gagal
        ? Icons.error_outline_rounded
        : (selesai ? Icons.cloud_done_rounded : Icons.cloud_upload_outlined);
    final warnaCloud = gagal ? AppColors.red600 : (selesai ? AppColors.success700 : AppColors.accent700);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: g.warna.withValues(alpha: .35)),
            ),
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: g.latar, borderRadius: BorderRadius.circular(12)),
                  child: Icon(g.ikon, color: g.warna, size: 22),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(ba.noGardu.isEmpty ? '-' : ba.noGardu, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.navy900)),
                    Text(ba.jenis.isEmpty ? 'BA' : ba.jenis,
                        style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: AppColors.neutral700)),
                    if (ba.arsip != null) const Padding(padding: EdgeInsets.only(top: 3), child: BadgeArsipBa()),
                  ]),
                ),
              ]),
              const SizedBox(height: 8),
              Row(children: [
                const Icon(Icons.event_rounded, size: 13, color: AppColors.neutral500),
                const SizedBox(width: 4),
                Text(ba.tanggalBa.isEmpty ? '-' : tanggalPendek(ba.tanggalBa), style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
                if (ba.penyulang.isNotEmpty) ...[
                  const SizedBox(width: 10),
                  const Icon(Icons.bolt_rounded, size: 13, color: AppColors.neutral500),
                  const SizedBox(width: 2),
                  Flexible(
                      child: Text(ba.penyulang, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500))),
                ],
              ]),
              const SizedBox(height: 2),
              Text(ba.noBaFull.isEmpty ? ba.idBa : ba.noBaFull,
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: AppColors.neutral400)),
              if (ba.arsip != null) ...[
                const Divider(height: 16),
                Row(children: [
                  Icon(Icons.picture_as_pdf_rounded, size: 15, color: ba.arsip!.adaPdf ? AppColors.red600 : AppColors.neutral300),
                  const SizedBox(width: 3),
                  Text(ba.arsip!.adaPdf ? 'PDF' : 'Tanpa PDF', style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
                  const SizedBox(width: 10),
                  Icon(Icons.verified_rounded, size: 15, color: ba.arsip!.adaTtd ? AppColors.success700 : AppColors.neutral300),
                  const SizedBox(width: 3),
                  Text(ba.arsip!.adaTtd ? 'BA TTD' : 'Belum TTD', style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
                  const Spacer(),
                  const Text('Baca saja', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.neutral500)),
                ]),
              ] else if (!ba.batal) ...[
                const Divider(height: 16),
                Row(children: [
                  Expanded(child: AlurMiniBa(ba: ba)),
                  const SizedBox(width: 8),
                  if (sibuk) ...[
                    const SisiLoader(ukuran: 14, warna: AppColors.accent700),
                    const SizedBox(width: 5),
                  ],
                  Icon(ikonCloud, size: 18, color: warnaCloud),
                ]),
              ],
            ]),
          ),
        ),
      ),
    );
  }
}

/// v0.76.0: penampil PDF di dalam aplikasi (file di HP, tanpa Drive). Cubit untuk perbesar, geser untuk pindah halaman.
class PdfBaScreen extends StatefulWidget {
  const PdfBaScreen({super.key, required this.path, required this.judul, required this.namaFile});
  final String path;
  final String judul;
  final String namaFile;

  @override
  State<PdfBaScreen> createState() => _PdfBaScreenState();
}

class _PdfBaScreenState extends State<PdfBaScreen> {
  late final PdfControllerPinch _c = PdfControllerPinch(document: PdfDocument.openFile(widget.path));
  int _ke = 1;
  int _jumlah = 0;
  String? _galat;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Future<void> _download() async {
    final tujuan = await simpanPdfKeDownload(widget.path, widget.namaFile);
    if (!mounted) return;
    if (tujuan != null) {
      unawaited(tampilPopupBerhasil(context, judul: 'PDF berhasil didownload', keterangan: 'Download/SiSi/${widget.namaFile}'));
    } else {
      await bagikanPdf(widget.path, widget.namaFile);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF2B3A42),
      appBar: sisiAppBar(widget.judul, subjudul: _jumlah == 0 ? 'Memuat PDF...' : 'Halaman $_ke dari $_jumlah', actions: [
        IconButton(tooltip: 'Download PDF', onPressed: () => unawaited(_download()), icon: const Icon(Icons.download_rounded)),
        IconButton(tooltip: 'Bagikan', onPressed: () => unawaited(bagikanPdf(widget.path, widget.namaFile)), icon: const Icon(Icons.share_rounded)),
      ]),
      body: _galat != null
          ? SisiKosong(ikon: Icons.picture_as_pdf_outlined, judul: 'PDF tidak bisa dibuka', pesan: _galat)
          : PdfViewPinch(
              controller: _c,
              onDocumentLoaded: (d) => setState(() => _jumlah = d.pagesCount),
              onPageChanged: (hal) => setState(() => _ke = hal),
              onDocumentError: (_) => setState(() => _galat = 'File PDF rusak. Hapus lalu download ulang dari Daftar BA.'),
            ),
    );
  }
}
