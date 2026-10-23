import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../hartek/foto_rincian.dart';
import '../hartek/hartek_gaya.dart';
import '../insjar/insjar_header.dart';
import 'wo_bantu.dart';
import 'wo_foto_server.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/refresh_sisi.dart';

/// v1.0.16 (permintaan kvlar 22 Okt 2026): menu Verifikasi WO Ganda (OPS_WO_GANDA, admin). WO yang diunggah lebih
/// dari satu tim (tim lama tetap mengunggah hasil kerja offline sesudah WO dipindah). Admin membandingkan kiriman tiap
/// tim (pekerjaan + foto) lalu memilih tim yang sah. Tim terpilih = WO miliknya, HP-nya menyelesaikan WO otomatis;
/// kiriman tim lain dibatalkan dan HP-nya membuang WO itu.
class WoGandaScreen extends StatefulWidget {
  const WoGandaScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  static const menu = 'OPS_WO_GANDA';

  @override
  State<WoGandaScreen> createState() => _WoGandaScreenState();
}

class _WoGandaScreenState extends State<WoGandaScreen> {
  String _status = 'MENUNGGU';
  Map<String, dynamic>? _data;
  String? _galat;
  bool _muat = false, _sibuk = false;

  Sesi get _sesi => widget.sesi;
  bool get _boleh => _sesi.bisaUbah(WoGandaScreen.menu);

  @override
  void initState() {
    super.initState();
    unawaited(_segarkan());
  }

  Future<Map<String, dynamic>> _api(String aksi, Map<String, dynamic> data) => widget.deps.api.call(aksi, token: _sesi.token, data: data);

  Future<Map<String, dynamic>> _muatFoto(Map<String, dynamic> data, {Duration? timeout}) =>
      widget.deps.api.call('getFotoWoGanda', token: _sesi.token, data: data, timeout: timeout ?? const Duration(seconds: 60));

  void _pesan(String p) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(p)));

  Future<void> _segarkan() async {
    if (_muat) return;
    setState(() {
      _muat = true;
      _galat = null;
    });
    try {
      final d = await _api('getWoGanda', {'status': _status});
      if (mounted) setState(() => _data = d);
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.kode.startsWith('HTTP_') ? 'Butuh sinyal untuk memuat WO ganda.' : pesanWo(e.kode));
    } catch (_) {
      if (mounted) setState(() => _galat = 'Butuh sinyal untuk memuat WO ganda.');
    } finally {
      if (mounted) setState(() => _muat = false);
    }
  }

  Future<void> _pilih(BuildContext ctx, Map<String, dynamic> g, Map<String, dynamic> tim) async {
    final catatan = TextEditingController();
    final ya = await showDialog<bool>(
      context: ctx,
      builder: (c) => AlertDialog(
        title: Text('Pilih ${teksWo(tim['tim'])}?'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('${teksWo(tim['tim'])} jadi pelaksana sah WO ${teksWo(g['kodeTemuan'])}. Kiriman tim lain dibatalkan dan '
              'HP tim terkait memperbarui laporannya otomatis.'),
          const SizedBox(height: 12),
          TextField(
            controller: catatan,
            maxLength: 300,
            maxLines: 3,
            minLines: 1,
            decoration: const InputDecoration(labelText: 'Catatan untuk tim lain (opsional)', border: OutlineInputBorder()),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Pilih tim ini')),
        ],
      ),
    );
    final isi = catatan.text.trim();
    Future<void>.delayed(const Duration(milliseconds: 500), catatan.dispose);
    if (ya != true || !mounted) return;
    setState(() => _sibuk = true);
    try {
      final r = await _api('putuskanWoGanda', {'temuanId': teksWo(g['temuanId']), 'timId': teksWo(tim['timId']), if (isi.isNotEmpty) 'catatan': isi});
      if (!mounted) return;
      _pesan('WO ${teksWo(g['kodeTemuan'])} diputuskan untuk ${teksWo(r['tim'])}.');
      if (ctx.mounted) await Navigator.maybePop(ctx);
      await _segarkan();
    } on ApiException catch (e) {
      if (mounted) _pesan(e.kode.startsWith('HTTP_') ? 'Belum terkirim (sinyal). Coba lagi.' : pesanWo(e.kode));
    } catch (_) {
      if (mounted) _pesan('Belum terkirim (sinyal). Coba lagi.');
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  // ---------- tampilan ----------

  (String, Color, Color) _statusTim(Map<String, dynamic> x) {
    switch (teksWo(x['status'])) {
      case 'KLAIM':
        return ('Mengunggah', AppColors.accent700, AppColors.accent100);
      case 'SIAP':
        return ('Sudah Selesai', AppColors.success700, AppColors.success100);
      case 'DIPILIH':
        return ('Dipilih', AppColors.success700, AppColors.success100);
      case 'DITOLAK':
        return ('Ditolak', AppColors.red700, AppColors.red100);
      default:
        return (x['pemilik'] == true ? 'Pemilik WO' : 'Belum unggah', HartekGaya.merek, AppColors.brand100);
    }
  }

  Widget _pil(String teks, Color warna, Color latar, {IconData? ikon}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(999)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (ikon != null) ...[Icon(ikon, size: 13, color: warna), const SizedBox(width: 4)],
          Flexible(child: Text(teks, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: warna))),
        ]),
      );

  Widget _kartu(Map<String, dynamic> g) {
    final tim = daftarWo(g['tim']);
    final keduanya = g['keduanyaUnggah'] == true;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: KartuHartek(
        onTap: () => unawaited(_bukaDetail(g)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(color: keduanya ? AppColors.red100 : AppColors.accent100, borderRadius: BorderRadius.circular(13)),
              child: Icon(Icons.how_to_reg_rounded, color: keduanya ? AppColors.red700 : AppColors.accent700),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(teksWo(g['jenisTemuan']).isEmpty ? 'Temuan' : teksWo(g['jenisTemuan']),
                    style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
                if (lokasiTemuanWo(g).isNotEmpty) Text(lokasiTemuanWo(g), maxLines: 1, overflow: TextOverflow.ellipsis, style: HartekGaya.sekunder),
              ]),
            ),
            const Icon(Icons.chevron_right_rounded, color: HartekGaya.redup),
          ]),
          const SizedBox(height: 10),
          for (final x in tim)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(children: [
                Icon(x['pemilik'] == true ? Icons.star_rounded : Icons.groups_rounded, size: 18, color: HartekGaya.redup),
                const SizedBox(width: 6),
                Expanded(
                  child: Text('${teksWo(x['tim'])} · ${daftarWo(x['pekerjaan']).length} pekerjaan',
                      style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: HartekGaya.tinta)),
                ),
                () {
                  final (l, w, b) = _statusTim(x);
                  return _pil(l, w, b);
                }(),
              ]),
            ),
          const SizedBox(height: 8),
          Text(keduanya ? 'Kedua tim sudah mengunggah. Pilih tim yang sah.' : 'Menunggu unggahan tim lain. Admin boleh memutuskan sekarang.',
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: keduanya ? AppColors.red700 : HartekGaya.redup)),
          Text(teksWo(g['kodeTemuan']), style: HartekGaya.kode),
        ]),
      ),
    );
  }

  Future<void> _bukaDetail(Map<String, dynamic> g) => Navigator.of(context).push<void>(MaterialPageRoute(
        builder: (ctx) => Scaffold(
          backgroundColor: HartekGaya.latar,
          body: SafeArea(
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 10, 16, 40), children: [
              HeaderInsJar(
                kicker: 'Verifikasi WO Ganda',
                judul: teksWo(g['jenisTemuan']).isEmpty ? 'Temuan' : teksWo(g['jenisTemuan']),
                sub: teksWo(g['kodeTemuan']),
                ikon: Icons.how_to_reg_rounded,
                aksi: [tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => Navigator.maybePop(ctx))],
              ),
              KartuHartek(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text(lokasiTemuanWo(g).isEmpty ? '-' : lokasiTemuanWo(g), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: HartekGaya.tinta)),
                  if (teksWo(g['deskripsi']).isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(teksWo(g['deskripsi']), style: HartekGaya.sekunder)),
                  FotoTemuanWo(t: g, muat: _muatFoto),
                ]),
              ),
              for (final x in daftarWo(g['tim'])) _kartuTim(ctx, g, x),
            ]),
          ),
        ),
      ));

  Widget _kartuTim(BuildContext ctx, Map<String, dynamic> g, Map<String, dynamic> x) {
    final (l, w, b) = _statusTim(x);
    final pk = daftarWo(x['pekerjaan']);
    final menunggu = _status == 'MENUNGGU';
    final waktu = [
      if (teksWo(x['waktuKlaim']).isNotEmpty) 'Unggah ulang ${waktuWo(teksWo(x['waktuKlaim']))}${teksWo(x['diklaimOleh']).isEmpty ? '' : ' oleh ${teksWo(x['diklaimOleh'])}'}',
      if (teksWo(x['waktuSiap']).isNotEmpty) 'Selesai ${waktuWo(teksWo(x['waktuSiap']))}',
      if (teksWo(x['waktuPutusan']).isNotEmpty) 'Diputuskan ${waktuWo(teksWo(x['waktuPutusan']))} oleh ${teksWo(x['diputuskanOleh'])}',
    ];
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: KartuHartek(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(
              child: Text('${teksWo(x['tim'])}${teksWo(x['jenisTim']).isEmpty ? '' : ' (${teksWo(x['jenisTim'])})'}', style: HartekGaya.judulSeksi),
            ),
            _pil(l, w, b),
          ]),
          if (x['pemilik'] == true) const Text('Tim yang saat ini ditugaskan admin.', style: HartekGaya.sekunder),
          for (final t in waktu) Text(t, style: const TextStyle(fontSize: 12.5, color: HartekGaya.redup)),
          if (pk.isEmpty) const Padding(padding: EdgeInsets.only(top: 8), child: Text('Belum ada pekerjaan yang diunggah.', style: HartekGaya.sekunder)),
          for (final p in pk)
            Container(
              margin: const EdgeInsets.only(top: 10),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: HartekGaya.latar, borderRadius: BorderRadius.circular(12)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text(ringkasPekerjaanWo(p), style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: HartekGaya.tinta)),
                if (teksWo(p['koordinat']).isNotEmpty) Text(teksWo(p['koordinat']), style: HartekGaya.kode),
                FotoRincian(
                  node: p,
                  slot: slotFotoWo,
                  label: labelFotoWo,
                  onTap: (sl) {
                    if (teksWo(petaWo(p['foto'])[sl]).isEmpty) return;
                    unawaited(FotoServerWo.lihat(ctx, _muatFoto, {'temuanId': teksWo(g['temuanId']), 'tlId': teksWo(p['tlId']), 'slot': sl}, labelFotoWo[sl] ?? sl));
                  },
                  gambarServer: (sl) => GambarServerWo(
                      key: ValueKey('ganda-${teksWo(p['tlId'])}-$sl'), muat: _muatFoto, data: {'temuanId': teksWo(g['temuanId']), 'tlId': teksWo(p['tlId']), 'slot': sl}),
                ),
              ]),
            ),
          if (menunggu && _boleh) ...[
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _sibuk ? null : () => unawaited(_pilih(ctx, g, x)),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              icon: const Icon(Icons.verified_rounded),
              label: const Text('Pilih tim ini'),
            ),
          ],
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final daftar = daftarWo(_data?['ganda']);
    return Scaffold(
      backgroundColor: HartekGaya.latar,
      body: SafeArea(
        child: RefreshSisi(
          onRefresh: _segarkan,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 40),
            children: [
              HeaderInsJar(
                kicker: 'Verifikasi WO Ganda',
                judul: '${_data?['menunggu'] ?? 0} menunggu',
                sub: 'WO yang diunggah lebih dari satu tim',
                ikon: Icons.how_to_reg_rounded,
                aksi: [
                  tombolSegarkanHeader(_segarkan, sibuk: _muat),
                  const SizedBox(width: 6),
                  tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => Navigator.maybePop(context)),
                ],
              ),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'MENUNGGU', label: Text('Menunggu'), icon: Icon(Icons.pending_actions_rounded)),
                  ButtonSegment(value: 'SELESAI', label: Text('Sudah diputuskan'), icon: Icon(Icons.task_alt_rounded)),
                ],
                selected: {_status},
                onSelectionChanged: (v) {
                  setState(() {
                    _status = v.first;
                    _data = null;
                  });
                  unawaited(_segarkan());
                },
              ),
              const SizedBox(height: 14),
              if (_galat != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 14),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(14)),
                  child: Row(children: [
                    const Icon(Icons.error_outline_rounded, color: AppColors.red700, size: 20),
                    const SizedBox(width: 10),
                    Expanded(child: Text(_galat!, style: const TextStyle(fontSize: 14, color: AppColors.red700))),
                    TextButton(onPressed: _segarkan, child: const Text('Coba lagi')),
                  ]),
                ),
              if (_data == null && _galat == null)
                const Padding(padding: EdgeInsets.only(top: 40), child: Center(child: SisiLoader()))
              else if (_data != null && daftar.isEmpty)
                KosongHartek(
                  ikon: Icons.verified_outlined,
                  judul: _status == 'MENUNGGU' ? 'Tidak ada WO ganda' : 'Belum ada keputusan',
                  petunjuk: _status == 'MENUNGGU'
                      ? 'WO yang diunggah dua tim (WO dipindah saat tim lama bekerja offline) muncul di sini.'
                      : 'Keputusan WO ganda 30 hari terakhir tampil di sini.',
                )
              else
                for (final g in daftar) _kartu(g),
            ],
          ),
        ),
      ),
    );
  }
}
